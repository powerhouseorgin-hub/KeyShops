import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { notifyFinish, notifyProgress, notifyStart } from '../utils/downloadNotification';

// In-app downloads that behave like a browser's: a long job (e.g. Sales "Download All": dozens of receipts made and zipped on the device)
// runs in the BACKGROUND, so the screen stays usable and the user can leave it. Progress is shown
//   - in the Downloads panel behind the download icon in the top bar (bar, percentage, Cancel), together with the history of recent
//     downloads (what, when, how big, whether it finished), and
//   - on Android, in a notification with a progress bar and percentage (utils/downloadNotification.js).
// The provider sits above the screens, so a job keeps running when the screen that started it closes. One job runs at a time.
//
// startJob({ title, progressLabel(done, total), doneLabel, failedLabel, cancelledLabel, run }):
//   run({ progress(done, total), addFile({ name, size }), isCancelled() }) does the work and resolves { message } (shown in the history
//   and the final notification). Resolves { started: false, reason: 'BUSY' } when another job is already running.
const STORAGE_KEY = 'kee.downloads.v1';
const MAX_HISTORY = 30;
const MAX_FILES_KEPT = 60;

const readHistory = () => {
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(raw) ? raw.slice(0, MAX_HISTORY) : [];
  } catch (e) {
    return [];
  }
};
const writeHistory = (list) => {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch (e) { /* private mode: history just is not kept */ }
};

const DownloadsContext = createContext(null);
const NOOP = { active: null, history: [], startJob: async () => ({ started: false, reason: 'UNAVAILABLE' }), cancelActive: () => {}, clearHistory: () => {} };
export const useDownloads = () => useContext(DownloadsContext) || NOOP;

export function DownloadsProvider({ children }) {
  const [active, setActive] = useState(null);
  const [history, setHistory] = useState(readHistory);
  const runningRef = useRef(false);
  const cancelRef = useRef(false);

  const startJob = useCallback(async (spec) => {
    if (runningRef.current) return { started: false, reason: 'BUSY' };
    runningRef.current = true;
    cancelRef.current = false;
    const { title, progressLabel, doneLabel, failedLabel, cancelledLabel, run } = spec;
    const job = { id: String(Date.now()), title, state: 'running', done: 0, total: 0, label: progressLabel ? progressLabel(0, 0) : '', files: [], startedAt: Date.now(), cancelling: false };
    setActive({ ...job });
    notifyStart(title, job.label);

    let lastNotified = 0;
    const ctx = {
      progress: (done, total) => {
        job.done = done;
        job.total = total;
        job.label = progressLabel ? progressLabel(done, total) : `${done} / ${total}`;
        setActive({ ...job, files: [...job.files], cancelling: cancelRef.current });
        const now = Date.now();
        if (now - lastNotified > 700 || done >= total) {
          lastNotified = now;
          notifyProgress(title, job.label, total ? Math.round((done / total) * 100) : 0);
        }
      },
      addFile: (file) => { job.files.push({ name: String(file.name), size: Number(file.size) || 0 }); },
      isCancelled: () => cancelRef.current,
    };

    // runs on its own: startJob answers at once so the caller's screen is free straight away
    (async () => {
      let state = 'done';
      let message = '';
      let error = '';
      try {
        const out = await run(ctx);
        message = (out && out.message) || '';
        if (cancelRef.current) { state = 'cancelled'; message = cancelledLabel || ''; } // nothing was saved for a cancelled download
      } catch (e) {
        state = 'failed';
        error = String((e && e.message) || e).slice(0, 160);
        console.error('Download failed:', e);
      }
      const entry = {
        id: job.id, title, state, total: job.total, done: job.done, message, error,
        files: job.files.slice(0, MAX_FILES_KEPT), startedAt: job.startedAt, finishedAt: Date.now(),
      };
      runningRef.current = false;
      setActive(null);
      setHistory((h) => {
        const next = [entry, ...h].slice(0, MAX_HISTORY);
        writeHistory(next);
        return next;
      });
      const text = state === 'done' ? (message || doneLabel || '') : state === 'cancelled' ? (cancelledLabel || message || '') : (failedLabel ? `${failedLabel}${error ? `: ${error}` : ''}` : error);
      notifyFinish(title, text, state === 'done');
    })();

    return { started: true };
  }, []);

  const cancelActive = useCallback(() => {
    cancelRef.current = true;
    setActive((a) => (a ? { ...a, cancelling: true } : a));
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    writeHistory([]);
  }, []);

  const value = useMemo(() => ({ active, history, startJob, cancelActive, clearHistory }), [active, history, startJob, cancelActive, clearHistory]);
  return <DownloadsContext.Provider value={value}>{children}</DownloadsContext.Provider>;
}

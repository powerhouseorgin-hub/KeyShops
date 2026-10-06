import React, { useCallback, useRef, useState } from 'react';
import { CheckSquare, Download, RefreshCw, Square } from 'lucide-react';
import { useDownloads } from '../context/DownloadsContext';
import { downloadBlobFile } from '../utils/pdfDelivery';

// "Download All" for a list of records whose receipt/invoice can be built on the device (used by the customer lists; the vehicle-sales
// list has its own copy of the same flow). Turns the list into a selection list (checkbox per record, Select All / Deselect All, a count
// and Download (n)), then runs the download as a BACKGROUND job (see DownloadsContext): receipts are built three at a time and delivered
// as ZIP files of at most 50, with progress behind the download icon in the top bar and in an Android notification.
//   - Select All first loads every remaining page (so "all" means every record the user may see, capped at 2,000), then ticks them.
//   - Access control comes from the list itself: it only ever holds what the server returned for this user.
const ZIP_CHUNK = 50;
const POOL = 3;
const FETCH_ALL_PAGE = 100;
const FETCH_ALL_MAX = 2000;
const fill = (template, values) => String(template).replace(/\{(\w+)\}/g, (_, k) => (values[k] === undefined ? '' : values[k]));

export default function useBulkInvoiceDownload({ t, items, nextCursor, keyOf, fetchPage, onLoaded, buildFile, zipName }) {
  const { startJob } = useDownloads();
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [loadingAll, setLoadingAll] = useState(false);
  const [message, setMessage] = useState('');
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const begin = () => { setSelectMode(true); setMessage(''); };
  const leave = () => { setSelectMode(false); setSelected(new Set()); };
  const toggle = (item) => setSelected((cur) => {
    const next = new Set(cur);
    const k = keyOf(item);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });
  const isSelected = (item) => selected.has(keyOf(item));
  const allSelected = items.length > 0 && items.every((i) => selected.has(keyOf(i))) && !nextCursor;

  const selectAll = async () => {
    if (allSelected) { setSelected(new Set()); return; }
    let list = items;
    let cursor = nextCursor;
    if (cursor) {
      setLoadingAll(true);
      try {
        while (cursor && list.length < FETCH_ALL_MAX) {
          const res = await fetchPage(cursor, FETCH_ALL_PAGE);
          list = [...list, ...res.items];
          cursor = res.nextCursor || null;
        }
        onLoaded(list, cursor);
      } catch (e) {
        console.error('Select All could not load every page:', e);
      } finally {
        setLoadingAll(false);
      }
    }
    setSelected(new Set(list.map(keyOf)));
  };

  const download = useCallback(async () => {
    const chosen = itemsRef.current.filter((i) => selected.has(keyOf(i)));
    if (!chosen.length) { setMessage(t('cbNone')); return; }
    setMessage('');
    const JSZip = (await import('jszip')).default;
    const parts = Math.ceil(chosen.length / ZIP_CHUNK);
    const stamp = new Date().toISOString().slice(0, 10);
    const started = await startJob({
      title: t('cbTitleInvoices'),
      progressLabel: (done, total) => fill(t('cbPreparing'), { done, total }),
      cancelledLabel: t('cbCancelled'),
      failedLabel: t('cbInvoiceFailed'),
      run: async ({ progress, addFile, isCancelled }) => {
        let done = 0;
        let failed = 0;
        let saved = 0;
        progress(0, chosen.length);
        for (let part = 0; part < parts && !isCancelled(); part += 1) {
          const slice = chosen.slice(part * ZIP_CHUNK, (part + 1) * ZIP_CHUNK);
          const zip = new JSZip();
          const used = new Set();
          let next = 0;
          const worker = async () => {
            while (next < slice.length && !isCancelled()) {
              const item = slice[next]; next += 1;
              try {
                const { pdf, fileName } = await buildFile(item);
                let name = fileName;
                for (let n = 2; used.has(name); n += 1) name = fileName.replace(/\.pdf$/, `_${n}.pdf`);
                used.add(name);
                zip.file(name, pdf.output('arraybuffer'));
                saved += 1;
              } catch (e) {
                failed += 1;
                console.error('Bulk download: could not create an invoice', e);
              }
              done += 1;
              progress(done, chosen.length);
            }
          };
          await Promise.all(Array.from({ length: POOL }, worker));
          if (isCancelled()) break;
          if (Object.keys(zip.files).length) {
            const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' }); // PDFs are already compressed
            const fileName = `${zipName}_${stamp}${parts > 1 ? `_part${part + 1}of${parts}` : ''}.zip`;
            await downloadBlobFile(blob, fileName, 'application/zip');
            addFile({ name: fileName, size: blob.size });
          }
        }
        return { message: [saved ? fill(t('cbDone'), { count: saved }) : '', failed ? fill(t('cbFailedSome'), { failed }) : ''].filter(Boolean).join(' ') };
      },
    });
    if (!started.started) { setMessage(t('cbBusy')); return; }
    setMessage(t('cbStarted'));
    leave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, startJob, t, buildFile, zipName]);

  const Check = ({ on }) => (on ? <CheckSquare size={22} style={{ color: 'var(--maroon)', flexShrink: 0 }} /> : <Square size={22} style={{ color: 'var(--text-3)', flexShrink: 0 }} />);

  const downloadAllButton = !selectMode && items.length > 0 ? (
    <button type="button" className="btn btn-outline btn-sm" onClick={begin} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
      <Download className="h-4 w-4" /> {t('cbDownloadAll')}
    </button>
  ) : null;

  const toolbar = selectMode ? (
    <div className="card" style={{ position: 'sticky', top: 0, zIndex: 5, padding: '10px 12px', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <button type="button" onClick={selectAll} disabled={loadingAll} aria-pressed={allSelected}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'none', border: 0, padding: 0, fontWeight: 800, fontSize: 13.5, cursor: 'pointer', color: 'var(--text-0)' }}>
        <Check on={allSelected} /> {allSelected ? t('cbDeselectAll') : t('cbSelectAll')}
      </button>
      <span className="cell-sub" style={{ marginRight: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {loadingAll ? <><RefreshCw className="animate-spin h-3 w-3" /> {t('cbSelecting')}</> : fill(t('cbSelectedCount'), { count: selected.size })}
      </span>
      <button type="button" className="btn btn-primary btn-sm" onClick={download} disabled={!selected.size || loadingAll} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <Download className="h-4 w-4" /> {fill(t('cbDownloadSelected'), { count: selected.size })}
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={leave} disabled={loadingAll}>{t('cbCancelSelect')}</button>
    </div>
  ) : null;

  const messageBox = message ? (
    <div role="status" style={{ background: 'var(--card-2)', border: '1px solid var(--border-2)', borderRadius: 12, padding: '10px 14px', fontSize: 13, fontWeight: 700, margin: '0 0 12px' }}>{message}</div>
  ) : null;

  return { selectMode, isSelected, toggle, Check, downloadAllButton, toolbar, messageBox, leave };
}

import React, { useState, useEffect, useCallback } from 'react';
import { Mail, RefreshCw, ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react';

const PAGE_SIZE = 25;

// SUPER ADMIN only - the reviewable log of the public marketing site's
// Contact Us submissions (see ContactService.getMessages on the backend).
// Each submission also fires an instant Super Admin notification-bell alert
// at the moment it's sent; this view is where you come back to read the
// full message and mark it handled. Mirrors ActivityLogView's list/
// pagination layout for consistency with the rest of the Super Admin panel.
function ContactMessagesView({ t, api }) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [markingId, setMarkingId] = useState(null);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.getContactMessages({ page, limit: PAGE_SIZE });
      setItems(res.items || []);
      setTotal(res.total || 0);
    } catch (err) {
      setError(err.message || t('failedLoadContactMessagesMsg'));
    } finally {
      setLoading(false);
    }
  }, [page, api, t]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  const handleMarkRead = async (id) => {
    setMarkingId(id);
    try {
      await api.markContactMessageRead(id);
      setItems((prev) => prev.map((m) => (m.id === id ? { ...m, isRead: true } : m)));
    } catch (err) {
      alert(err.message || t('failedLoadContactMessagesMsg'));
    } finally {
      setMarkingId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="animate-fade-in">
      <div className="page-head">
        <div>
          <h1>{t('contactMessagesTitle')}</h1>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600, marginTop: 2 }}>
            {t('contactMessagesSubtitle')}
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14, padding: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
        <button type="button" onClick={fetchMessages} className="icon-btn" title={t('refresh')} style={{ marginLeft: 'auto' }}>
          <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
        </button>
      </div>

      {loading ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 200 }}>
          <RefreshCw className="animate-spin" style={{ width: 24, height: 24, color: 'var(--gold)' }} />
        </div>
      ) : error ? (
        <div className="card" style={{ padding: 20, textAlign: 'center', color: 'var(--red)', fontWeight: 700, fontSize: 13 }}>{error}</div>
      ) : items.length === 0 ? (
        <div className="card" style={{ padding: 30, textAlign: 'center', color: 'var(--text-3)', fontWeight: 600, fontSize: 13 }}>
          {t('contactMessagesEmpty')}
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {items.map((entry, i) => (
            <div
              key={entry.id}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 18px',
                borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                opacity: entry.isRead ? 0.7 : 1,
              }}
            >
              <div className="icon-badge" style={{ background: 'var(--gold-dim)', color: 'var(--gold)', flexShrink: 0, width: 34, height: 34 }}>
                <Mail style={{ width: 16, height: 16 }} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--text-0)' }}>{entry.name}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--text-3)', fontWeight: 600 }}>{entry.email}</span>
                  {!entry.isRead && (
                    <span className="pill-badge" style={{ fontSize: 10, background: 'var(--gold-dim)', color: 'var(--gold)' }}>{t('newBadge')}</span>
                  )}
                </div>
                <p style={{ fontSize: 12.5, color: 'var(--text-2)', fontWeight: 600, marginTop: 3, whiteSpace: 'pre-wrap' }}>
                  {entry.message}
                </p>
                <p style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, marginTop: 4 }}>
                  {new Date(entry.createdAt).toLocaleString()}
                </p>
              </div>
              {!entry.isRead && (
                <button
                  type="button"
                  onClick={() => handleMarkRead(entry.id)}
                  disabled={markingId === entry.id}
                  className="icon-btn"
                  title={t('markAsReadBtn')}
                  style={{ flexShrink: 0 }}
                >
                  {markingId === entry.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!loading && !error && totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 16 }}>
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="icon-btn" style={{ opacity: page <= 1 ? 0.4 : 1 }}>
            <ChevronLeft />
          </button>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>
            {t('pageLabel')} {page} / {totalPages}
          </span>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="icon-btn" style={{ opacity: page >= totalPages ? 0.4 : 1 }}>
            <ChevronRight />
          </button>
        </div>
      )}
    </div>
  );
}

export default ContactMessagesView;

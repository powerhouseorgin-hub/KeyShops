import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  History, RefreshCw, ChevronLeft, ChevronRight, ShieldCheck, Store, Users, FileText,
} from 'lucide-react';

// Maps every `action` value ActivityLog.create() is called with (across
// auth.service.ts, shop.service.ts, customer.service.ts) to a display label,
// icon and accent color grouped by category - security/account, shop/business,
// customer/document - so the raw enum-like string reads as a real event.
const ACTION_META = {
  LOGIN: { icon: ShieldCheck, color: 'var(--blue)' },
  CHANGE_PASSWORD: { icon: ShieldCheck, color: 'var(--blue)' },
  RESET_PASSWORD_PUBLIC: { icon: ShieldCheck, color: 'var(--blue)' },
  UPDATE_LOGIN_CREDENTIALS: { icon: ShieldCheck, color: 'var(--blue)' },
  DELETE_ACCOUNT: { icon: ShieldCheck, color: 'var(--red)' },
  SHOP_REGISTERED: { icon: Store, color: 'var(--jgreen)' },
  SHOP_UPDATED: { icon: Store, color: 'var(--gold)' },
  SHOP_SUSPENDED: { icon: Store, color: 'var(--red)' },
  SHOP_REACTIVATED: { icon: Store, color: 'var(--jgreen)' },
  SUBSCRIPTION_RENEWED: { icon: Store, color: 'var(--jgreen)' },
  CUSTOMER_CREATE: { icon: Users, color: 'var(--purple)' },
  CUSTOMER_UPDATE: { icon: Users, color: 'var(--purple)' },
  DOC_UPLOAD: { icon: FileText, color: 'var(--teal)' },
  DOC_DELETE: { icon: FileText, color: 'var(--red)' },
};

function actionMeta(action) {
  return ACTION_META[action] || { icon: History, color: 'var(--text-3)' };
}

// Best-effort readable summary from the JSON `details` string every
// activityLog.create() call stores - falls back to the raw string if it
// isn't parseable JSON, or to the bare action code if details is empty.
function summarize(entry, t) {
  if (!entry.details) return t(`activityAction_${entry.action}`) || entry.action;
  try {
    const parsed = JSON.parse(entry.details);
    return parsed.message || entry.details;
  } catch {
    return entry.details;
  }
}

const PAGE_SIZE = 25;

function ActivityLogView({ t, api }) {
  const { user } = useAuth();
  const isSuperAdmin = user.role === 'SUPER_ADMIN';

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchLog = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.getActivityLog({ page, limit: PAGE_SIZE, action: actionFilter || undefined });
      setItems(res.items || []);
      setTotal(res.total || 0);
    } catch (err) {
      setError(err.message || t('failedLoadActivityLogMsg'));
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter, api, t]);

  useEffect(() => { fetchLog(); }, [fetchLog]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="animate-fade-in">
      <div className="page-head">
        <div>
          <h1>{t('activityLogTitle')}</h1>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600, marginTop: 2 }}>
            {isSuperAdmin ? t('activityLogSubtitleSuper') : t('activityLogSubtitleShop')}
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14, padding: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <select
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
          style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border-2)', background: 'var(--card-2)', color: 'var(--text-0)', fontSize: 12.5, fontWeight: 700 }}
        >
          <option value="">{t('activityLogAllActions')}</option>
          {Object.keys(ACTION_META).map((a) => (
            <option key={a} value={a}>{t(`activityAction_${a}`) || a}</option>
          ))}
        </select>
        <button type="button" onClick={fetchLog} className="icon-btn" title={t('refresh')} style={{ marginLeft: 'auto' }}>
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
          {t('activityLogEmpty')}
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {items.map((entry, i) => {
            const meta = actionMeta(entry.action);
            const Icon = meta.icon;
            return (
              <div
                key={entry.id}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 18px',
                  borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                }}
              >
                <div className="icon-badge" style={{ background: meta.color + '22', color: meta.color, flexShrink: 0, width: 34, height: 34 }}>
                  <Icon style={{ width: 16, height: 16 }} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--text-0)' }}>
                      {t(`activityAction_${entry.action}`) || entry.action}
                    </span>
                    {isSuperAdmin && entry.shop?.name && (
                      <span className="pill-badge" style={{ fontSize: 10 }}>{entry.shop.name}</span>
                    )}
                  </div>
                  <p style={{ fontSize: 12.5, color: 'var(--text-2)', fontWeight: 600, marginTop: 3 }}>
                    {summarize(entry, t)}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, marginTop: 4 }}>
                    {entry.user?.name || t('unknownUserLabel')} &middot; {new Date(entry.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            );
          })}
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

export default ActivityLogView;

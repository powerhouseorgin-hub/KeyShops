import React, { useState, useEffect } from 'react';
import CustomSelect from '../components/CustomSelect';
import CountUp from '../components/CountUp';
import { useSubmitting } from '../hooks/useSubmitting';
import {
  Banknote, Calendar, CalendarRange, Check, FileText, IndianRupee, Receipt, RefreshCw, TrendingUp,
} from 'lucide-react';

// ============================================================================
// COMPONENT 7: REVENUE MANAGEMENT (SUPER ADMIN ONLY)
// ============================================================================
// In-memory cache (module scope) - same rationale as dashboardCache above.
let revenueRecordsCache = null;

function RevenueManagementView({ t, api }) {
  const [records, setRecords] = useState(revenueRecordsCache || []);
  const [loading, setLoading] = useState(!revenueRecordsCache);
  const { submitting, run } = useSubmitting();

  // Form states
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    fetchRevenue();
  }, []);

  const fetchRevenue = async () => {
    if (records.length === 0) setLoading(true);
    try {
      const res = await api.getRevenue();
      setRecords(res);
      revenueRecordsCache = res;
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // `amount` comes straight off a text input's e.target.value, so it's a
    // string here (e.g. "25000") - Prisma's RevenueRecord.amount column is a
    // Float, so it must be coerced to a real number before it goes over the
    // wire, or the backend rejects the whole request.
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount)) {
      alert(t('enterValidAmountMsg'));
      return;
    }
    run(async () => {
      try {
        await api.logRevenue(Number(month), Number(year), numericAmount, notes);
        setAmount('');
        setNotes('');
        fetchRevenue();
      } catch (e) {
        alert(e.message);
      }
    });
  };

  const totalCollected = records.reduce((acc, r) => acc + Number(r.amount), 0);
  const thisYear = new Date().getFullYear();
  const yearTotal = records.filter(r => r.year === thisYear).reduce((acc, r) => acc + Number(r.amount), 0);
  const avgPerRecord = records.length ? totalCollected / records.length : 0;

  const chartRecords = [...records]
    .sort((a, b) => (a.year - b.year) || (a.month - b.month))
    .slice(-8);
  const chartMax = Math.max(1, ...chartRecords.map(r => Number(r.amount)));

  return (
    <div className="animate-fade-in">
      <div className="page-head">
        <div>
          <div className="eyebrow"><IndianRupee /> {t('platformFinanceLabel')}</div>
          <h1>{t('monthlyRevenueLogsTitle')}</h1>
          <p>{t('recordSubscriptionCollectionsDesc')}</p>
        </div>
      </div>

      {!loading && records.length > 0 && (
        <div className="stat-grid three">
          <div className="stat-card" style={{ animationDelay: '.05s' }}>
            <div className="stat-top">
              <div className="icon-badge jgreen"><Banknote /></div>
              <span className="stat-trend"><TrendingUp />{t('allTimeLower')}</span>
            </div>
            <div className="stat-num"><CountUp value={totalCollected} decimals={2} prefix="₹" /></div>
            <div className="stat-label">{t('totalRevenueCollectedLabel')}</div>
          </div>
          <div className="stat-card" style={{ animationDelay: '.15s' }}>
            <div className="stat-top">
              <div className="icon-badge blue"><Calendar /></div>
              <span className="stat-trend"><TrendingUp />{thisYear}</span>
            </div>
            <div className="stat-num"><CountUp value={yearTotal} decimals={2} prefix="₹" /></div>
            <div className="stat-label">{t('collectedThisYearLabel')}</div>
          </div>
          <div className="stat-card" style={{ animationDelay: '.25s' }}>
            <div className="stat-top">
              <div className="icon-badge orange"><Receipt /></div>
            </div>
            <div className="stat-num"><CountUp value={records.length} /></div>
            <div className="stat-label">{t('revenueRecordsAvgLabel')} &#8377;{avgPerRecord.toFixed(2)}</div>
          </div>
        </div>
      )}

      <div className="grid-2">
        <div className="card chart-card">
          <div className="section-title">
            <h2>{t('collectionsTrendLabel')}</h2>
            <span className="sub">{t('lastLoggedEntriesPrefix')} {chartRecords.length || 0} {t('loggedEntriesSuffix')}</span>
          </div>

          {loading ? (
            <div style={{ display: 'flex', height: 190, alignItems: 'center', justifyContent: 'center' }}>
              <RefreshCw className="animate-spin" style={{ width: 24, height: 24, color: 'var(--gold)' }} />
            </div>
          ) : chartRecords.length === 0 ? (
            <div style={{ display: 'flex', height: 190, alignItems: 'center', justifyContent: 'center', fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600 }}>
              {t('noRevenueLogsYet')}
            </div>
          ) : (
            <div className="bars">
              {chartRecords.map(r => (
                <div className="bar-col" key={r.id}>
                  <div className="bar" style={{ height: `${Math.max(6, (Number(r.amount) / chartMax) * 100)}%` }} title={`₹${Number(r.amount).toFixed(2)}`} />
                  <div className="bar-label">
                    {new Date(2000, r.month - 1).toLocaleString('default', { month: 'short' })} '{String(r.year).slice(-2)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="section-title" style={{ marginBottom: 16 }}>
            <h2>{t('addRevenueRecordLabel')}</h2>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="reg-section">

              <div className="row2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="reg-field" style={{ marginBottom: 0 }}>
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><Calendar /></div><b>{t('monthLabel')}</b></div>
                  <CustomSelect
                    value={month} onChange={(v) => setMonth(Number(v))}
                    options={Array.from({ length: 12 }, (_, i) => ({
                      value: i + 1,
                      label: new Date(2000, i).toLocaleString('default', { month: 'long' }),
                    }))}
                  />
                </div>
                <div className="reg-field" style={{ marginBottom: 0 }}>
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--blue)' }}><CalendarRange /></div><b>{t('yearLabel')}</b></div>
                  <div className="input-wrap">
                    <input
                      type="number" required value={year} onChange={(e) => setYear(Number(e.target.value))}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="reg-section">

              <div className="reg-field">
                <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--jgreen)' }}><IndianRupee /></div><b>{t('amountCollectedRupeeLabel')} <span className="req">*</span></b></div>
                <div className="input-wrap">
                  <input
                    type="number" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)}
                    placeholder="2450.00"
                  />
                </div>
              </div>

              <div className="reg-field">
                <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--orange)' }}><FileText /></div><b>{t('notesRemarksLabel')}</b></div>
                <textarea
                  rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
                  placeholder="..."
                  style={{ width: '100%', background: 'var(--card-2)', border: '1.5px solid var(--border-2)', color: 'var(--text-0)', borderRadius: 13, padding: '13px 15px', fontSize: 13.5, outline: 'none', resize: 'vertical' }}
                />
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={submitting}
            >
              {submitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check />}
              <span>{t('logRevenuePayoutBtn')}</span>
            </button>
          </form>
        </div>
      </div>

      <div className="card table-card" style={{ marginTop: 22 }}>
        <div className="table-head">
          <h2 style={{ fontFamily: 'var(--display)', fontWeight: 800, fontSize: 17 }}>{t('platformRevenueHistoryLabel')}</h2>
        </div>

        {loading ? (
          <div style={{ display: 'flex', height: 140, alignItems: 'center', justifyContent: 'center' }}>
            <RefreshCw className="animate-spin" style={{ width: 24, height: 24, color: 'var(--gold)' }} />
          </div>
        ) : records.length === 0 ? (
          <p style={{ padding: 24, fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600 }}>
            {t('noRevenueLogsYet')}
          </p>
        ) : (
          <table className="kee-table">
            <thead>
              <tr>
                <th>{t('periodCol')}</th>
                <th>{t('notesCol')}</th>
                <th>{t('amountCol')}</th>
              </tr>
            </thead>
            <tbody>
              {[...records].sort((a, b) => (b.year - a.year) || (b.month - a.month)).map((r, idx) => {
                const rowColors = ['purple', 'blue', 'pink', 'orange', 'teal', 'jgreen', 'skyblue', 'rose', 'maroon'];
                const rowColor = rowColors[idx % rowColors.length];
                return (
                  <tr key={r.id}>
                    <td>
                      <div className="cell-primary" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div className={`icon-badge ${rowColor}`} style={{ width: 34, height: 34, borderRadius: 10 }}>
                          <Receipt className="h-4 w-4" />
                        </div>
                        {new Date(2000, r.month - 1).toLocaleString('default', { month: 'long' })} {r.year}
                      </div>
                    </td>
                    <td className="cell-sub" style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
                      {r.notes || '—'}
                    </td>
                    <td className="cell-primary" style={{ color: 'var(--green)' }}>&#8377;{Number(r.amount).toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default RevenueManagementView;

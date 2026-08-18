import React, { useState, useEffect } from 'react';
import CountUp from '../components/CountUp';
import {
  Key, BarChart3, FileText, RefreshCw, Phone, Calendar, TrendingUp, User,
  CalendarRange, Download,
  X,
} from 'lucide-react';

// ============================================================================
// COMPONENT 14: REPORTS PORTAL VIEW
// ============================================================================
export function ReportsPortalView({ t, api }) {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const now = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(now.getDate() - 30);

    setFromDate(thirtyDaysAgo.toISOString().split('T')[0]);
    setToDate(now.toISOString().split('T')[0]);
  }, []);

  const handleGenerate = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const custs = await api.getCustomers();
      const filtered = custs.filter(c => {
        const cDate = new Date(c.createdAt).getTime();
        const start = fromDate ? new Date(fromDate).getTime() : 0;
        const end = toDate ? new Date(toDate + 'T23:59:59').getTime() : Infinity;
        return cDate >= start && cDate <= end;
      });
      setReportData(filtered.map(c => ({
        'Customer Name': c.name,
        'Phone': c.phone,
        'Vehicle Number': c.vehicleNumber || 'N/A',
        'Key Blank Code': c.keyNumber,
        'Location Address': c.capturedAddress || 'N/A',
        'GPS Coordinates': `${c.latitude}, ${c.longitude}`,
        'Date Registered': new Date(c.createdAt).toLocaleString()
      })));
    } catch (err) {
      console.error(err);
      alert(t('failedGenerateReportMsg'));
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadCSV = () => {
    if (reportData.length === 0) {
      alert(t('pleaseGenerateReportFirstMsg'));
      return;
    }
    const headers = Object.keys(reportData[0]);
    const csvRows = [];
    csvRows.push(headers.join(','));

    for (const row of reportData) {
      const values = headers.map(header => {
        const escaped = ('' + row[header]).replace(/"/g, '\\"');
        return `"${escaped}"`;
      });
      csvRows.push(values.join(','));
    }

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kee_report_${new Date().toISOString().split('T')[0]}.csv`;
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadTXT = () => {
    if (reportData.length === 0) {
      alert(t('pleaseGenerateReportFirstMsg'));
      return;
    }
    const headers = Object.keys(reportData[0]);
    let txtContent = `========================================================================\n`;
    txtContent += `KEY SHOP SYSTEM TERMINAL - CUSTOMER REGISTRATION REPORT\n`;
    txtContent += `Generated: ${new Date().toLocaleString()}\n`;
    txtContent += `Range: ${fromDate || 'All Time'} to ${toDate || 'All Time'}\n`;
    txtContent += `========================================================================\n\n`;

    for (const row of reportData) {
      headers.forEach(header => {
        txtContent += `${header.padEnd(25)}: ${row[header]}\n`;
      });
      txtContent += `------------------------------------------------------------------------\n`;
    }

    const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kee_report_${new Date().toISOString().split('T')[0]}.txt`;
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="animate-fade-in">
      <div className="page-head">
        <div>
          <div className="eyebrow"><BarChart3 /> {t('complianceAnalyticsEyebrow')}</div>
          <h1>{t('reports')}</h1>
          <p>{t('reportsPortalDesc')}</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 'clamp(16px, 4vw, 24px)' }}>
        <div className="section-title" style={{ marginBottom: 18 }}>
          <h2>{t('reportBuilderTitle')}</h2>
          <span className="sub">{t('selectDateRangeGenerateDesc')}</span>
        </div>

        <form onSubmit={handleGenerate}>
          <div className="reg-section">
            <div className="row2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="reg-field" style={{ marginBottom: 0 }}>
                <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--blue)' }}><Calendar /></div><b>{t('fromDateLabel')}</b></div>
                <div className="input-wrap">
                  <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                </div>
              </div>
              <div className="reg-field" style={{ marginBottom: 0 }}>
                <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><CalendarRange /></div><b>{t('toDateLabel')}</b></div>
                <div className="input-wrap">
                  <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ marginTop: 6 }}
          >
            <RefreshCw className={loading ? 'animate-spin' : ''} />
            <span>{loading ? t('generatingEllipsisLabel') : t('generateReportBtn')}</span>
          </button>
        </form>
      </div>

      {reportData.length > 0 && (
        <div className="animate-fade-in">
          <div className="stat-grid two">
            <div className="stat-card" style={{ animationDelay: '.05s' }}>
              <div className="stat-top">
                <div className="icon-badge purple"><FileText /></div>
                <span className="stat-trend"><TrendingUp />exported</span>
              </div>
              <div className="stat-num"><CountUp value={reportData.length} /></div>
              <div className="stat-label">{t('recordsInReportLabel')}</div>
            </div>
            <div className="stat-card" style={{ animationDelay: '.15s' }}>
              <div className="stat-top">
                <div className="icon-badge blue"><Calendar /></div>
              </div>
              <div className="stat-num" style={{ fontSize: 18 }}>{fromDate || t('allTimeLabel')} &rarr; {toDate || t('todayLabel')}</div>
              <div className="stat-label">{t('dateRangeCoveredLabel')}</div>
            </div>
          </div>

          {/* Graphical Report Chart Visualization */}
          <div className="card chart-card" style={{ marginBottom: 24 }}>
            <div className="section-title">
              <h2>{t('visualReportSummaryTitle')}</h2>
              <span className="sub">{t('hoverToViewValuesDesc')}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

              {/* Left Column: Bar Chart */}
              <div>
                <h4 className="bar-label" style={{ textAlign: 'center', marginBottom: 10, fontSize: 11 }}>
                  {t('registrationsByKeyBlankRefTitle')}
                </h4>
                <div className="bars">
                  {(() => {
                    const counts = {};
                    reportData.forEach(r => {
                      const key = r['Key Blank Code'] || 'N/A';
                      counts[key] = (counts[key] || 0) + 1;
                    });
                    const dataPoints = Object.keys(counts).map(key => ({ label: key, value: counts[key] })).slice(0, 8);

                    const maxVal = Math.max(...dataPoints.map(d => d.value), 1);

                    return dataPoints.map((d, idx) => {
                      const heightPercent = (d.value / maxVal) * 100;
                      return (
                        <div key={idx} className="bar-col group" style={{ position: 'relative' }}>
                          <div style={{ width: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 4, height: '100%' }}>
                            <div
                              style={{ height: `${heightPercent}%`, maxWidth: 22 }}
                              className="bar relative"
                            >
                              <span
                                className="absolute opacity-0 group-hover:opacity-100 transition-opacity"
                                style={{ top: -20, left: '50%', transform: 'translateX(-50%)', fontSize: 9, fontWeight: 800, color: 'var(--gold-2)', whiteSpace: 'nowrap' }}
                              >
                                {d.value}
                              </span>
                            </div>
                          </div>
                          <div className="bar-label" style={{ marginTop: 8, width: '100%', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.label}</div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>

              {/* Right Column: Line Graph */}
              <div>
                <h4 className="bar-label" style={{ textAlign: 'center', marginBottom: 10, fontSize: 11 }}>
                  {t('registrationTimelineTrendTitle')}
                </h4>
                <div className="h-48 w-full rounded-xl p-4 flex flex-col justify-between" style={{ background: 'var(--card-2)', border: '1px solid var(--border)' }}>
                  {(() => {
                    const dateCounts = {};
                    reportData.forEach(r => {
                      const rawDate = r['Date Registered'] || '';
                      const datePart = rawDate.split(' ')[0] || 'N/A';
                      dateCounts[datePart] = (dateCounts[datePart] || 0) + 1;
                    });
                    const sortedDates = Object.keys(dateCounts).sort((a, b) => new Date(a).getTime() - new Date(b).getTime()).slice(-10);
                    const dataPoints = sortedDates.map(date => ({ label: date, value: dateCounts[date] }));

                    if (dataPoints.length === 0) return <div className="text-center py-12" style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>{t('noTrendDataMsg')}</div>;

                    const maxVal = Math.max(...dataPoints.map(d => d.value), 1);
                    const width = 500;
                    const height = 150;
                    const padding = 20;

                    const coords = dataPoints.map((d, i) => {
                      const x = padding + (i / (dataPoints.length - 1 || 1)) * (width - 2 * padding);
                      const y = height - padding - (d.value / maxVal) * (height - 2 * padding);
                      return { x, y, label: d.label, val: d.value };
                    });

                    const pathD = coords.reduce((acc, c, i) => {
                      return i === 0 ? `M ${c.x} ${c.y}` : `${acc} L ${c.x} ${c.y}`;
                    }, '');

                    const areaD = coords.length > 0
                      ? `${pathD} L ${coords[coords.length - 1].x} ${height - padding} L ${coords[0].x} ${height - padding} Z`
                      : '';

                    return (
                      <div className="w-full h-full flex flex-col justify-between">
                        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-28 overflow-visible">
                          <defs>
                            <linearGradient id="areaGradientReport" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#C89416" stopOpacity="0.4" />
                              <stop offset="100%" stopColor="#C89416" stopOpacity="0.0" />
                            </linearGradient>
                          </defs>

                          {/* Area under the line */}
                          {areaD && <path d={areaD} fill="url(#areaGradientReport)" className="chart-area-fade" />}

                          {/* Grid lines */}
                          <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                          <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="rgba(255,255,255,0.05)" strokeDasharray="3,3" />

                          {/* Trend Line */}
                          {pathD && <path d={pathD} fill="none" stroke="#7A1220" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="chart-line-draw" />}

                          {/* Interactive dots */}
                          {coords.map((c, i) => (
                            <g key={i} className="group cursor-pointer">
                              <circle cx={c.x} cy={c.y} r="4" fill="#7A1220" stroke="#ffffff" strokeWidth="1.5" className="chart-dot-pop" style={{ animationDelay: `${0.6 + i * 0.06}s` }} />
                              <text x={c.x} y={c.y - 8} textAnchor="middle" fontSize="9" fontWeight="bold" fill="#1e1b2e" className="opacity-0 group-hover:opacity-100 transition-opacity">
                                {c.val}
                              </text>
                            </g>
                          ))}
                        </svg>
                        <div className="flex justify-between px-1" style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                          {dataPoints.map((d, i) => (
                            <span key={i}>{d.label}</span>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

            </div>

            <div className="flex justify-between items-center" style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 4 }}>
              <span>{t('hoverToViewValuesDesc')}</span>
            </div>
          </div>

          <div className="card table-card">
            <div className="table-head">
              <h2 style={{ fontFamily: 'var(--display)', fontWeight: 800, fontSize: 17 }}>
                {t('reportPreviewTitle')} <span style={{ color: 'var(--text-3)', fontWeight: 700, fontSize: 13 }}>({reportData.length} {t('recordsLabel')})</span>
              </h2>
              <div className="row-actions" style={{ gap: 10 }}>
                <button onClick={handleDownloadCSV} className="btn btn-outline btn-sm">
                  <Download />
                  <span>{t('exportCsvBtn')}</span>
                </button>
                <button onClick={handleDownloadTXT} className="btn btn-primary btn-sm">
                  <Download />
                  <span>{t('exportTxtBtn')}</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="kee-table">
                <thead>
                  <tr>
                    {Object.keys(reportData[0]).slice(0, 4).map(header => (
                      <th key={header}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reportData.map((row, idx) => {
                    const rowColors = ['purple', 'blue', 'pink', 'orange', 'teal', 'jgreen', 'skyblue', 'rose', 'maroon'];
                    const rowColor = rowColors[idx % rowColors.length];
                    return (
                      <tr key={idx}>
                        {Object.keys(row).slice(0, 4).map((header, hIdx) => (
                          hIdx === 0 ? (
                            <td key={header} className="cell-primary">
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div className={`icon-badge ${rowColor}`} style={{ width: 34, height: 34, borderRadius: 10 }}>
                                  <User className="h-4 w-4" />
                                </div>
                                {row[header]}
                              </div>
                            </td>
                          ) : (
                            <td key={header}>{row[header]}</td>
                          )
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p style={{ padding: '14px 24px', fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic' }}>{t('showingFirstColumnsPreviewDesc')}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default ReportsPortalView;

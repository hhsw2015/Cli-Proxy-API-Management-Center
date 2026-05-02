import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { usageApi, type UsageHistoryResponse } from '@/services/api/usage';
import styles from '@/pages/UsagePage.module.scss';

export function UsageHistoryCard() {
  const { t } = useTranslation();
  const [data, setData] = useState<UsageHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    usageApi.getHistory(days)
      .then((res) => { if (!cancelled) setData(res); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [days]);

  if (loading && !data) return null;
  if (!data || !data.enabled) return null;

  const summary = data.summary;
  const hasData = summary && summary.total_requests > 0;

  const formatTokens = (n: number) => {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return String(n);
  };

  return (
    <div className={styles.statsGrid} style={{ marginBottom: '1.5rem' }}>
      <div className={styles.statCard} style={{ gridColumn: '1 / -1' }}>
        <div className={styles.statCardHeader} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className={styles.statLabel}>
            {t('usage_stats.history_title', 'Persistent History')} ({data.record_count ?? 0} records)
          </span>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            style={{ fontSize: '0.75rem', padding: '2px 6px', borderRadius: '4px', background: 'transparent', border: '1px solid var(--border-color, #444)', color: 'inherit' }}
          >
            <option value={7}>7d</option>
            <option value={30}>30d</option>
            <option value={90}>90d</option>
          </select>
        </div>

        {!hasData ? (
          <div className={styles.statValue} style={{ fontSize: '0.85rem', opacity: 0.5 }}>
            {t('usage_stats.no_history', 'No data for this period yet')}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '0.75rem', marginTop: '0.5rem' }}>
            <div>
              <div className={styles.statValue}>{summary!.total_requests.toLocaleString()}</div>
              <div className={styles.statLabel}>{t('dashboard.total_requests', 'Requests')}</div>
            </div>
            <div>
              <div className={styles.statValue}>{formatTokens(summary!.total_tokens)}</div>
              <div className={styles.statLabel}>{t('dashboard.total_tokens', 'Tokens')}</div>
            </div>
            <div>
              <div className={styles.statValue}>{summary!.avg_latency_ms.toFixed(0)}ms</div>
              <div className={styles.statLabel}>Latency</div>
            </div>
            <div>
              <div className={styles.statValue} style={summary!.failed_requests > 0 ? { color: '#ef4444' } : undefined}>
                {summary!.failed_requests}
              </div>
              <div className={styles.statLabel}>Failed</div>
            </div>
          </div>
        )}

        {hasData && data.by_model && data.by_model.length > 0 && (
          <div style={{ marginTop: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {data.by_model.slice(0, 8).map((m) => (
              <span key={m.model} style={{
                fontSize: '0.65rem', padding: '1px 5px', borderRadius: '3px',
                background: 'rgba(128,128,128,0.15)', color: 'inherit',
              }}>
                {m.model} · {m.requests}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

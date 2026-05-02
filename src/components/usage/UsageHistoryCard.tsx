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
    setLoading(true);
    usageApi.getHistory(days)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [days]);

  if (loading) return null;
  if (!data || !data.enabled) return null;

  const summary = data.summary;

  const formatTokens = (n: number) => {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return String(n);
  };

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle}>
          {t('usage_stats.history_title', 'Persistent Usage History')}
          <span style={{ marginLeft: '0.5rem', fontSize: '0.75em', opacity: 0.6, fontWeight: 400 }}>
            SQLite · {data.record_count ?? 0} records
          </span>
        </h3>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className={styles.selectControl || ''}
          style={{ fontSize: '0.8rem', padding: '4px 8px', borderRadius: '4px' }}
        >
          <option value={7}>7 {t('usage_stats.days', 'days')}</option>
          <option value={30}>30 {t('usage_stats.days', 'days')}</option>
          <option value={90}>90 {t('usage_stats.days', 'days')}</option>
        </select>
      </div>

      {(!summary || summary.total_requests === 0) ? (
        <div style={{ padding: '1rem', textAlign: 'center', opacity: 0.6, fontSize: '0.85rem' }}>
          {t('usage_stats.no_history', 'No persistent data for this period. Usage will be recorded as you make requests.')}
        </div>
      ) : (
        <>
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <div className={styles.statValue}>{summary.total_requests.toLocaleString()}</div>
              <div className={styles.statLabel}>{t('usage_stats.total_requests', 'Requests')}</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statValue}>{formatTokens(summary.total_tokens)}</div>
              <div className={styles.statLabel}>{t('usage_stats.total_tokens', 'Tokens')}</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statValue}>{summary.avg_latency_ms.toFixed(0)}ms</div>
              <div className={styles.statLabel}>{t('usage_stats.avg_latency', 'Avg Latency')}</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statValue} style={summary.failed_requests > 0 ? { color: 'var(--color-error, #ef4444)' } : undefined}>
                {summary.failed_requests}
              </div>
              <div className={styles.statLabel}>{t('usage_stats.failed', 'Failed')}</div>
            </div>
          </div>

          {data.by_model && data.by_model.length > 0 && (
            <div style={{ marginTop: '0.75rem' }}>
              <div className={styles.statLabel} style={{ marginBottom: '0.25rem' }}>
                Top Models
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                {data.by_model.slice(0, 10).map((m) => (
                  <span key={m.model} className={styles.badge || ''} style={{
                    fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px',
                    background: 'var(--badge-bg, rgba(128,128,128,0.15))',
                  }}>
                    {m.model} ({m.requests})
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

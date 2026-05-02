import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { usageApi, type UsageHistoryResponse } from '@/services/api/usage';

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
  if (!summary || summary.total_requests === 0) return null;

  const formatTokens = (n: number) => {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return String(n);
  };

  return (
    <div style={{ marginBottom: '1rem', padding: '1rem', borderRadius: '8px', background: 'var(--card-bg, #f8f9fa)', border: '1px solid var(--border-color, #e2e8f0)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600 }}>
          📊 {t('usage_stats.history_title', 'Persistent Usage History')}
          <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>
            (SQLite · {data.record_count} records)
          </span>
        </h3>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          style={{ fontSize: '0.8rem', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border-color, #ccc)' }}
        >
          <option value={7}>7 {t('usage_stats.days', 'days')}</option>
          <option value={30}>30 {t('usage_stats.days', 'days')}</option>
          <option value={90}>90 {t('usage_stats.days', 'days')}</option>
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{summary.total_requests.toLocaleString()}</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t('usage_stats.total_requests', 'Requests')}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{formatTokens(summary.total_tokens)}</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t('usage_stats.total_tokens', 'Tokens')}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{summary.avg_latency_ms.toFixed(0)}ms</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t('usage_stats.avg_latency', 'Avg Latency')}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: summary.failed_requests > 0 ? '#ef4444' : 'inherit' }}>
            {summary.failed_requests}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t('usage_stats.failed', 'Failed')}</div>
        </div>
      </div>

      {data.by_model && data.by_model.length > 0 && (
        <div style={{ marginTop: '0.5rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--text-muted)' }}>
            Top Models
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
            {data.by_model.slice(0, 8).map((m) => (
              <span
                key={m.model}
                style={{
                  fontSize: '0.7rem',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: 'var(--badge-bg, #e2e8f0)',
                  whiteSpace: 'nowrap',
                }}
              >
                {m.model} ({m.requests})
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useNotificationStore } from '@/stores';
import { integrationsApi } from '@/services/api';
import type { IntegrationItem } from '@/types/integration';
import styles from './IntegrationsPage.module.scss';

function statusBadgeClass(state: IntegrationItem['state']): string {
  switch (state) {
    case 'configured':
      return `${styles.statusBadge} ${styles.configured}`;
    case 'error':
      return `${styles.statusBadge} ${styles.error}`;
    default:
      return `${styles.statusBadge} ${styles.notConfigured}`;
  }
}

function statusLabel(state: IntegrationItem['state'], t: (key: string) => string): string {
  switch (state) {
    case 'configured':
      return t('integrations.stateConfigured');
    case 'error':
      return t('integrations.stateError');
    default:
      return t('integrations.stateNotConfigured');
  }
}

export function IntegrationsPage() {
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();

  const [integrations, setIntegrations] = useState<IntegrationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyProduct, setBusyProduct] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<'apply' | 'rollback' | null>(null);

  const fetchIntegrations = useCallback(async () => {
    setLoading(true);
    try {
      const data = await integrationsApi.getAll();
      setIntegrations(data);
    } catch {
      showNotification(t('integrations.actionFailed', { error: 'fetch failed' }), 'error');
    } finally {
      setLoading(false);
    }
  }, [showNotification, t]);

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  const handleApply = useCallback(
    async (product: string) => {
      setBusyProduct(product);
      setBusyAction('apply');
      try {
        const result = await integrationsApi.apply(product);
        showNotification(t('integrations.applySuccess', { name: result.status.name }), 'success');
        await fetchIntegrations();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        showNotification(t('integrations.actionFailed', { error: message }), 'error');
      } finally {
        setBusyProduct(null);
        setBusyAction(null);
      }
    },
    [fetchIntegrations, showNotification, t]
  );

  const handleRollback = useCallback(
    async (product: string) => {
      setBusyProduct(product);
      setBusyAction('rollback');
      try {
        const result = await integrationsApi.rollback(product);
        showNotification(
          t('integrations.rollbackSuccess', { name: result.status.name }),
          'success'
        );
        await fetchIntegrations();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        showNotification(t('integrations.actionFailed', { error: message }), 'error');
      } finally {
        setBusyProduct(null);
        setBusyAction(null);
      }
    },
    [fetchIntegrations, showNotification, t]
  );

  return (
    <div className="page-container">
      <Card
        title={t('integrations.title')}
        subtitle={t('integrations.subtitle')}
        extra={
          <Button
            variant="secondary"
            size="sm"
            onClick={fetchIntegrations}
            loading={loading}
          >
            {t('integrations.refresh')}
          </Button>
        }
      />

      {loading && integrations.length === 0 ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem 0' }}>
          <LoadingSpinner size={28} />
        </div>
      ) : integrations.length === 0 ? (
        <EmptyState title={t('integrations.empty')} />
      ) : (
        <div className={styles.grid}>
          {integrations.map((item) => {
            const isBusy = busyProduct === item.product;
            const isConfigured = item.state === 'configured';
            const canRollback = item.backup_available && item.state !== 'not_configured';

            return (
              <div className="card" key={item.product}>
                <div className="card-header">
                  <div className="card-title-group">
                    <div className={styles.headerRow}>
                      <div className="title">{item.name}</div>
                      <span className={statusBadgeClass(item.state)}>
                        {statusLabel(item.state, t)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className={styles.cardBody}>
                  <div className={styles.pathLabel}>{t('integrations.targetPath')}</div>
                  <div className={styles.targetPath}>{item.target_path}</div>
                  {item.warning && <div className={styles.warning}>{item.warning}</div>}
                  <div className={styles.actions}>
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={isConfigured || isBusy}
                      loading={isBusy && busyAction === 'apply'}
                      onClick={() => handleApply(item.product)}
                    >
                      {t('integrations.apply')}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!canRollback || isBusy}
                      loading={isBusy && busyAction === 'rollback'}
                      onClick={() => handleRollback(item.product)}
                      title={!item.backup_available ? t('integrations.noBackup') : undefined}
                    >
                      {t('integrations.rollback')}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

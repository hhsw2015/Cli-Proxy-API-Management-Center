import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { commercialApi, CommercialStatus } from '@/services/api/commercial';

export function CommercialPage() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<CommercialStatus | null>(null);

  useEffect(() => {
    commercialApi.getStatus().then(setStatus).catch(() => {});
  }, []);

  if (!status?.enabled) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
        {t('commercial.notEnabled')}
      </div>
    );
  }

  return (
    <iframe
      src={status.admin_url}
      style={{ width: '100%', height: 'calc(100vh - 60px)', border: 'none' }}
      title="Commercial Management"
    />
  );
}

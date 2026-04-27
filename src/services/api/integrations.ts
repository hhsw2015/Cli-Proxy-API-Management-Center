/**
 * CLI integration API
 */

import { apiClient } from './client';
import type { IntegrationItem, IntegrationActionResult } from '@/types/integration';

export const integrationsApi = {
  getAll: () => apiClient.get<IntegrationItem[]>('/integrations'),
  apply: (product: string) =>
    apiClient.post<IntegrationActionResult>(`/integrations/${product}/apply`),
  rollback: (product: string) =>
    apiClient.post<IntegrationActionResult>(`/integrations/${product}/rollback`),
};

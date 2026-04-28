import { apiClient } from './client';

export interface CommercialStatus {
  enabled: boolean;
  admin_url: string;
}

export const commercialApi = {
  getStatus: () => apiClient.get<CommercialStatus>('/commercial-status'),
};

export interface IntegrationItem {
  product: string;
  name: string;
  state: 'configured' | 'not_configured' | 'error';
  target_path: string;
  backup_available: boolean;
  warning?: string;
  current_content?: string;
  planned_content?: string;
}

export interface IntegrationActionResult {
  message: string;
  product: string;
  status: IntegrationItem;
}

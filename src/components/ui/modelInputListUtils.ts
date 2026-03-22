import type { ModelAlias } from '@/types';

export interface ModelEntry {
  name: string;
  alias: string;
  modelId?: string;
}

export const modelsToEntries = (models?: ModelAlias[]): ModelEntry[] => {
  if (!Array.isArray(models) || models.length === 0) {
    return [{ name: '', alias: '', modelId: '' }];
  }
  return models.map((model) => ({
    name: model.name || '',
    alias: model.alias || '',
    modelId: model.modelId || ''
  }));
};

export const entriesToModels = (entries: ModelEntry[]): ModelAlias[] => {
  return entries
    .filter((entry) => entry.name.trim())
    .map((entry) => {
      const model: ModelAlias = { name: entry.name.trim() };
      const alias = entry.alias.trim();
      if (alias && alias !== model.name) {
        model.alias = alias;
      }
      const modelId = (entry.modelId ?? '').trim();
      if (modelId) {
        model.modelId = modelId;
      }
      return model;
    });
};

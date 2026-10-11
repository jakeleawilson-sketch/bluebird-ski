import { iglu } from './iglu';
import type { SourceAdapter } from './types';

export const ADAPTERS: Record<string, SourceAdapter> = {
  [iglu.id]: iglu,
};

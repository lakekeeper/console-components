/**
 * Default queue options available in the system
 */

import { QueueOption } from './interfaces';

export const DEFAULT_QUEUE_OPTIONS: QueueOption[] = [
  {
    title: 'Soft Deletion',
    value: 'soft_deletion',
  },
  {
    title: 'Tabular Purge',
    value: 'tabular_purge',
  },
];

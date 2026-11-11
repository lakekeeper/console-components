import { describe, expect, it } from 'vitest';
import { secretNameFor } from './CatalogManager';

describe('secretNameFor', () => {
  it('keeps plain lowercase names readable', () => {
    expect(secretNameFor('sales')).toBe('loqe_secret_sales');
  });

  it('gives names that differ only in punctuation or case distinct secrets', () => {
    const names = ['sales-eu', 'sales_eu', 'sales.eu', 'Sales_eu', 'sales eu', 'a"b'];
    expect(new Set(names.map(secretNameFor)).size).toBe(names.length);
  });
});

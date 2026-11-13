import { describe, expect, it } from 'vitest';
import {
  contentSelectionFromQuery,
  contentSelectionToQuery,
  normalizeSelection,
} from './namespaceContents';

describe('contentSelectionFromQuery', () => {
  it('maps the old per-type tabs onto Contents', () => {
    expect(contentSelectionFromQuery('tables', undefined)).toEqual(['tables']);
    expect(contentSelectionFromQuery('datasets', 'views')).toEqual(['datasets']);
    expect(contentSelectionFromQuery('deleted', undefined)).toEqual(['deleted']);
  });

  it('reads several types from ?type=, in chip order', () => {
    expect(contentSelectionFromQuery('contents', 'views,tables')).toEqual(['tables', 'views']);
    expect(contentSelectionFromQuery('contents', 'generic')).toEqual(['generic']);
  });

  it('reads all or empty as everything', () => {
    expect(contentSelectionFromQuery(undefined, 'all')).toEqual([]);
    expect(contentSelectionFromQuery(undefined, '')).toEqual([]);
  });

  it('ignores anything else', () => {
    expect(contentSelectionFromQuery('details', undefined)).toBeNull();
    expect(contentSelectionFromQuery('contents', 'bogus')).toBeNull();
    expect(contentSelectionFromQuery(undefined, undefined)).toBeNull();
  });
});

describe('normalizeSelection', () => {
  it('combines deleted with other types, in chip order', () => {
    expect(normalizeSelection(['deleted', 'tables'])).toEqual(['tables', 'deleted']);
  });

  it('drops unknowns and duplicates', () => {
    expect(normalizeSelection(['views', 'x', 'views'])).toEqual(['views']);
  });
});

describe('contentSelectionToQuery', () => {
  it('joins types and leaves All out of the URL', () => {
    expect(contentSelectionToQuery(['tables', 'views'])).toBe('tables,views');
    expect(contentSelectionToQuery([])).toBeUndefined();
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useLoQEStore } from './loqe';
import { useDuckDBSettingsStore } from './duckdbSettings';
import { nextTick } from 'vue';

const entry = (id: string, tabId?: string) => ({
  id,
  sql: `SELECT ${id}`,
  executedAt: 0,
  durationMs: 1,
  rowCount: 1,
  ...(tabId ? { tabId } : {}),
});

describe('LoQE query history per tab', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('lists one tab’s runs, newest first', () => {
    const store = useLoQEStore();
    store.addHistoryEntry(entry('1', 'a'));
    store.addHistoryEntry(entry('2', 'b'));
    store.addHistoryEntry(entry('3', 'a'));
    expect(store.historyForTab('a').map((e) => e.id)).toEqual(['3', '1']);
  });

  it('keeps 50 runs per tab without touching other tabs', () => {
    const store = useLoQEStore();
    store.addHistoryEntry(entry('other', 'b'));
    store.addHistoryEntry(entry('untabbed'));
    for (let i = 0; i < 60; i++) store.addHistoryEntry(entry(`a${i}`, 'a'));
    const a = store.historyForTab('a');
    expect(a).toHaveLength(50);
    expect(a[0].id).toBe('a59');
    expect(a[49].id).toBe('a10');
    expect(store.historyForTab('b')).toHaveLength(1);
    expect(store.queryHistory.some((e) => e.id === 'untabbed')).toBe(true);
  });

  it('follows the runs-per-tab setting and trims when it is lowered', async () => {
    const store = useLoQEStore();
    const settings = useDuckDBSettingsStore();
    settings.historyPerTab = 10;
    for (let i = 0; i < 15; i++) store.addHistoryEntry(entry(`a${i}`, 'a'));
    expect(store.historyForTab('a')).toHaveLength(10);
    settings.historyPerTab = 3;
    await nextTick();
    expect(store.historyForTab('a').map((e) => e.id)).toEqual(['a14', 'a13', 'a12']);
  });

  it('names a run, clears an empty name, and removes one run', () => {
    const store = useLoQEStore();
    store.addHistoryEntry(entry('1', 'a'));
    store.addHistoryEntry(entry('2', 'a'));
    store.renameHistoryEntry('1', '  Daily count ');
    expect(store.historyForTab('a')[1].name).toBe('Daily count');
    store.renameHistoryEntry('1', ' ');
    expect(store.historyForTab('a')[1].name).toBeUndefined();
    store.removeHistoryEntry('2');
    expect(store.historyForTab('a').map((e) => e.id)).toEqual(['1']);
  });
});

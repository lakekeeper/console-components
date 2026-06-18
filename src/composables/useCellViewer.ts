import { ref } from 'vue';

export interface CellDialogState {
  open: boolean;
  title: string;
  raw: string;
  pretty: string;
  isJson: boolean;
}

/**
 * Shared "click a long/JSON cell to view its full value" behaviour for result
 * grids (table preview + LoQE query results). Pairs with <CellValueDialog>.
 */
export function useCellViewer() {
  const cellDialog = ref<CellDialogState>({
    open: false,
    title: '',
    raw: '',
    pretty: '',
    isJson: false,
  });

  /** A cell is worth expanding when it's long or looks like JSON. */
  function isExpandable(value: unknown): boolean {
    if (value == null) return false;
    const s = String(value);
    return s.length > 60 || /^\s*[[{]/.test(s);
  }

  function openCell(title: string, value: unknown): void {
    const raw = value == null ? '' : String(value);
    let pretty = raw;
    let isJson = false;
    try {
      pretty = JSON.stringify(JSON.parse(raw), null, 2);
      isJson = true;
    } catch {
      /* not JSON — show raw text */
    }
    cellDialog.value = { open: true, title, raw, pretty, isJson };
  }

  return { cellDialog, isExpandable, openCell };
}

import { ref } from 'vue';

export interface CellDialogState {
  open: boolean;
  title: string;
  raw: string;
  pretty: string;
  isJson: boolean;
  /** Parsed value when the cell is JSON (for the tree viewer); null otherwise. */
  data: unknown;
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
    data: null,
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
    let data: unknown = null;
    try {
      data = JSON.parse(raw);
      pretty = JSON.stringify(data, null, 2);
      isJson = true;
    } catch {
      /* not JSON — show raw text */
    }
    cellDialog.value = { open: true, title, raw, pretty, isJson, data };
  }

  return { cellDialog, isExpandable, openCell };
}

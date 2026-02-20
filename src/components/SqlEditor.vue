<template>
  <div class="sql-editor-wrapper" :class="{ disabled: disabled }" :style="{ maxHeight: minHeight }">
    <div ref="editorContainer" class="sql-editor" :style="{ maxHeight: minHeight }"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick, computed } from 'vue';
import { EditorView, basicSetup } from 'codemirror';
import { sql, StandardSQL, type SQLNamespace } from '@codemirror/lang-sql';
import { EditorState, Compartment } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { tags } from '@lezer/highlight';
import { HighlightStyle, syntaxHighlighting, bracketMatching } from '@codemirror/language';
import {
  closeBrackets,
  closeBracketsKeymap,
  type CompletionContext,
  type Completion,
} from '@codemirror/autocomplete';
import { useTheme } from 'vuetify';
import { format as formatSQL } from 'sql-formatter';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    placeholder?: string;
    disabled?: boolean;
    minHeight?: string;
    clearable?: boolean;
    /** Nested schema for hierarchical name completions: { catalog: { ns: { table: [] } } } */
    schema?: SQLNamespace;
    /** Async callback to lazily fetch completions for a dot-qualifier (called on any.dot) */
    fetchCompletions?: (qualifier: string) => Promise<string[]>;
  }>(),
  {
    placeholder: '',
    disabled: false,
    minHeight: '30vh',
    clearable: false,
    schema: undefined,
    fetchCompletions: undefined,
  },
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'click'): void;
  (e: 'keyup'): void;
}>();

const editorContainer = ref<HTMLElement>();
let editorView: EditorView | null = null;
const readOnlyCompartment = new Compartment();
const themeCompartment = new Compartment();

const sqlLangCompartment = new Compartment();
const aliasCompartment = new Compartment();

// ── Lazy alias-aware completion ──────────────────────────────────────

/**
 * Parse SQL text for table aliases:
 *   FROM catalog.schema.table AS alias
 *   FROM table alias
 *   JOIN table AS alias
 * Returns a map: alias → fully-qualified table name.
 */
function parseAliases(doc: string): Map<string, string> {
  const aliases = new Map<string, string>();
  const re = /(?:FROM|JOIN)\s+((?:\w+|"[^"]*")(?:\.(?:\w+|"[^"]*"))*)\s+(?:AS\s+)?(\w+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(doc)) !== null) {
    // Strip any SQL double-quotes from the captured table name
    const table = m[1].replace(/"([^"]*)"/g, '$1');
    const alias = m[2].toLowerCase();
    const kw = new Set([
      'where',
      'on',
      'inner',
      'outer',
      'left',
      'right',
      'cross',
      'full',
      'join',
      'natural',
      'group',
      'order',
      'limit',
      'having',
      'union',
      'except',
      'intersect',
      'set',
      'into',
      'values',
    ]);
    if (!kw.has(alias)) {
      aliases.set(alias, table);
    }
  }
  return aliases;
}

/** Local completion cache so we don't re-fetch on every keystroke */
const completionCache = new Map<string, string[]>();

/** Check if a SQL identifier needs quoting (contains non-word chars or starts with digit) */
function needsQuoting(name: string): boolean {
  return /[^a-zA-Z0-9_]/.test(name) || /^\d/.test(name);
}

/**
 * Build an async completion source that resolves dot-completions lazily.
 * Handles aliases (FROM table AS t -> t.col) and any direct dot-qualifier
 * (catalog. -> schemas, catalog.schema. -> tables, etc.).
 * Also offers catalog names after FROM/JOIN keywords.
 */
function buildCompletionSource(fetchFn: ((qualifier: string) => Promise<string[]>) | undefined) {
  if (!fetchFn) return [];

  const fn = fetchFn;

  async function completer(ctx: CompletionContext) {
    // 1. Dot-qualifier completions (catalog.schema.table. etc.)
    // Regex also matches quoted identifiers like demo."f-inance".table.
    const dotMatch = ctx.matchBefore(/((?:\w+|"[^"]*")(?:\.(?:\w+|"[^"]*"))*)\.\w*/);
    if (dotMatch) {
      const lastDotIdx = dotMatch.text.lastIndexOf('.');
      let qualifier = dotMatch.text.slice(0, lastDotIdx);

      // Strip SQL double-quotes from identifier parts so fetchCompletions
      // receives plain names (e.g. demo."f-inance" -> demo.f-inance)
      qualifier = qualifier.replace(/"([^"]*)"/g, '$1');

      // Resolve alias if it's a single-word qualifier
      if (!qualifier.includes('.')) {
        const aliases = parseAliases(ctx.state.doc.toString());
        const resolved = aliases.get(qualifier.toLowerCase());
        if (resolved) qualifier = resolved;
      }

      // Check local cache first
      let items = completionCache.get(qualifier);
      if (!items) {
        try {
          items = await fn(qualifier);
          if (items.length > 0) {
            completionCache.set(qualifier, items);
          } else {
            return null;
          }
        } catch {
          return null;
        }
      }

      if (!items || items.length === 0) return null;

      const options: Completion[] = items.map((name) => ({
        label: name,
        type: 'property',
        boost: 99,
        // Quote identifiers that contain special characters
        ...(needsQuoting(name) ? { apply: `"${name}"` } : {}),
      }));

      return {
        from: dotMatch.from + lastDotIdx + 1,
        options,
      };
    }

    // 2. After FROM/JOIN keyword — offer catalog names
    const fromMatch = ctx.matchBefore(/(?:FROM|JOIN)\s+\w*/i);
    if (fromMatch) {
      // Fetch catalog list (qualifier = empty string means "list catalogs")
      let catalogs = completionCache.get('__catalogs__');
      if (!catalogs) {
        try {
          catalogs = await fn('');
          if (catalogs.length > 0) {
            completionCache.set('__catalogs__', catalogs);
          }
        } catch {
          return null;
        }
      }

      if (!catalogs || catalogs.length === 0) return null;

      // Find where the identifier starts after FROM/JOIN
      const spaceIdx = fromMatch.text.search(/\s\w*$/);
      const identStart = fromMatch.from + spaceIdx + 1;

      const options: Completion[] = catalogs.map((name) => ({
        label: name,
        type: 'keyword',
        boost: 50,
        ...(needsQuoting(name) ? { apply: `"${name}"` } : {}),
      }));

      return { from: identStart, options };
    }

    return null;
  }

  return [EditorState.languageData.of(() => [{ autocomplete: completer }])];
}

// Detect Vuetify theme (dark/light mode)
const theme = useTheme();
const isDark = computed(() => theme.global.current.value.dark);

// ── Syntax Highlighting ──────────────────────────────────────────────

const lightHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: '#0550AE', fontWeight: 'bold' },
  { tag: tags.string, color: '#0A3069' },
  { tag: tags.number, color: '#0550AE' },
  { tag: tags.comment, color: '#6E7781', fontStyle: 'italic' },
  { tag: tags.operator, color: '#CF222E' },
  { tag: tags.variableName, color: '#24292F' },
  { tag: tags.typeName, color: '#0550AE' },
  { tag: tags.function(tags.variableName), color: '#8250DF' },
  { tag: tags.definition(tags.variableName), color: '#953800' },
  { tag: tags.bracket, color: '#6E7781' },
  { tag: tags.punctuation, color: '#24292F' },
]);

const darkHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: '#FF7B72', fontWeight: 'bold' },
  { tag: tags.string, color: '#A5D6FF' },
  { tag: tags.number, color: '#79C0FF' },
  { tag: tags.comment, color: '#8B949E', fontStyle: 'italic' },
  { tag: tags.operator, color: '#FF7B72' },
  { tag: tags.variableName, color: '#C9D1D9' },
  { tag: tags.typeName, color: '#79C0FF' },
  { tag: tags.function(tags.variableName), color: '#D2A8FF' },
  { tag: tags.definition(tags.variableName), color: '#FFA657' },
  { tag: tags.bracket, color: '#8B949E' },
  { tag: tags.punctuation, color: '#C9D1D9' },
]);

// ── Theme extension ──────────────────────────────────────────────────

const createThemeExtension = (dark: boolean) => {
  return EditorView.theme(
    {
      '&': {
        minHeight: props.minHeight,
        height: '100%',
        overflow: 'hidden',
        fontSize: '13px',
        lineHeight: '1.6',
        border: dark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid rgba(0, 0, 0, 0.12)',
        borderRadius: '8px',
        backgroundColor: dark ? '#0D1117' : '#FFFFFF',
        color: dark ? '#C9D1D9' : '#24292F',
        boxShadow: dark ? '0 1px 3px rgba(0, 0, 0, 0.3)' : '0 1px 3px rgba(0, 0, 0, 0.08)',
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
      },
      '&.cm-focused': {
        outline: 'none',
        borderColor: dark ? '#58A6FF' : '#0969DA',
        boxShadow: dark ? '0 0 0 3px rgba(88, 166, 255, 0.2)' : '0 0 0 3px rgba(9, 105, 218, 0.15)',
      },
      '.cm-scroller': {
        overflow: 'auto',
        maxHeight: props.minHeight,
      },
      '.cm-content': {
        padding: '12px 8px',
        caretColor: dark ? '#58A6FF' : '#0969DA',
      },
      '.cm-placeholder': {
        color: dark ? '#484F58' : '#AFB8C1',
        fontStyle: 'italic',
      },
      '.cm-line': {
        padding: '0 4px',
      },
      '.cm-cursor': {
        borderLeftColor: dark ? '#58A6FF' : '#0969DA',
        borderLeftWidth: '2px',
      },
      '.cm-selectionBackground': {
        backgroundColor: dark
          ? 'rgba(88, 166, 255, 0.15) !important'
          : 'rgba(9, 105, 218, 0.12) !important',
      },
      '&.cm-focused .cm-selectionBackground': {
        backgroundColor: dark
          ? 'rgba(88, 166, 255, 0.25) !important'
          : 'rgba(9, 105, 218, 0.2) !important',
      },
      '.cm-activeLine': {
        backgroundColor: dark ? 'rgba(136, 198, 255, 0.04)' : 'rgba(9, 105, 218, 0.04)',
      },
      '.cm-gutters': {
        backgroundColor: dark ? '#0D1117' : '#F6F8FA',
        color: dark ? '#484F58' : '#AFB8C1',
        border: 'none',
        borderRight: dark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(0, 0, 0, 0.06)',
        borderTopLeftRadius: '8px',
        borderBottomLeftRadius: '8px',
      },
      '.cm-activeLineGutter': {
        backgroundColor: dark ? 'rgba(136, 198, 255, 0.04)' : 'rgba(9, 105, 218, 0.04)',
        color: dark ? '#C9D1D9' : '#24292F',
      },
      '.cm-matchingBracket': {
        backgroundColor: dark ? 'rgba(88, 166, 255, 0.25)' : 'rgba(9, 105, 218, 0.15)',
        outline: dark ? '1px solid rgba(88, 166, 255, 0.4)' : '1px solid rgba(9, 105, 218, 0.3)',
        borderRadius: '2px',
      },
      '.cm-tooltip': {
        backgroundColor: dark ? '#161B22' : '#FFFFFF',
        border: dark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid rgba(0, 0, 0, 0.12)',
        borderRadius: '6px',
        boxShadow: dark ? '0 4px 12px rgba(0, 0, 0, 0.4)' : '0 4px 12px rgba(0, 0, 0, 0.1)',
      },
      '.cm-tooltip-autocomplete > ul > li': {
        padding: '4px 8px',
        borderRadius: '4px',
      },
      '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
        backgroundColor: dark ? 'rgba(88, 166, 255, 0.15)' : 'rgba(9, 105, 218, 0.1)',
        color: dark ? '#C9D1D9' : '#24292F',
      },
    },
    { dark },
  );
};

// ── Lifecycle ────────────────────────────────────────────────────────

onMounted(async () => {
  await nextTick();
  if (!editorContainer.value) return;

  const startState = EditorState.create({
    doc: props.modelValue || '',
    extensions: [
      basicSetup,
      sqlLangCompartment.of(
        sql({
          dialect: StandardSQL,
          upperCaseKeywords: true,
          ...(props.schema ? { schema: props.schema } : {}),
        }),
      ),
      bracketMatching(),
      closeBrackets(),
      aliasCompartment.of(buildCompletionSource(props.fetchCompletions)),
      keymap.of([...defaultKeymap, ...closeBracketsKeymap, indentWithTab]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const newValue = update.state.doc.toString();
          emit('update:modelValue', newValue);
        }
        if (update.transactions.some((tr) => tr.selection)) {
          emit('click');
        }
      }),
      EditorView.domEventHandlers({
        keyup: () => {
          emit('keyup');
          return false;
        },
        click: () => {
          emit('click');
          return false;
        },
      }),
      readOnlyCompartment.of(EditorState.readOnly.of(props.disabled)),
      themeCompartment.of([
        createThemeExtension(isDark.value),
        syntaxHighlighting(isDark.value ? darkHighlightStyle : lightHighlightStyle),
      ]),

      EditorView.editorAttributes.of({
        'aria-label': 'SQL Query Editor',
      }),
    ],
  });

  editorView = new EditorView({
    state: startState,
    parent: editorContainer.value,
  });
});

// ── Watchers ─────────────────────────────────────────────────────────

watch(
  () => props.modelValue,
  (newValue) => {
    if (editorView && newValue !== editorView.state.doc.toString()) {
      editorView.dispatch({
        changes: { from: 0, to: editorView.state.doc.length, insert: newValue || '' },
      });
    }
  },
);

watch(
  () => props.disabled,
  (disabled) => {
    if (editorView) {
      editorView.dispatch({
        effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(disabled)),
      });
    }
  },
);

watch(isDark, (dark) => {
  if (editorView) {
    editorView.dispatch({
      effects: themeCompartment.reconfigure([
        createThemeExtension(dark),
        syntaxHighlighting(dark ? darkHighlightStyle : lightHighlightStyle),
      ]),
    });
  }
});

// Watch schema changes for live table-name autocomplete updates
watch(
  () => props.schema,
  (schema) => {
    if (editorView) {
      editorView.dispatch({
        effects: [
          sqlLangCompartment.reconfigure(
            sql({
              dialect: StandardSQL,
              upperCaseKeywords: true,
              ...(schema ? { schema } : {}),
            }),
          ),
        ],
      });
    }
  },
  { deep: true },
);

// Watch fetchCompletions callback changes (e.g. when LoQE re-initialises)
watch(
  () => props.fetchCompletions,
  (fn) => {
    if (editorView) {
      completionCache.clear();
      editorView.dispatch({
        effects: aliasCompartment.reconfigure(buildCompletionSource(fn)),
      });
    }
  },
);

// Watch minHeight changes (e.g. from resize handle) — reconfigure theme
watch(
  () => props.minHeight,
  () => {
    if (editorView) {
      editorView.dispatch({
        effects: themeCompartment.reconfigure([
          createThemeExtension(isDark.value),
          syntaxHighlighting(isDark.value ? darkHighlightStyle : lightHighlightStyle),
        ]),
      });
    }
  },
);

onUnmounted(() => {
  editorView?.destroy();
});

// ── Exposed methods ──────────────────────────────────────────────────

const getCursorPosition = () => {
  return editorView?.state.selection.main.head ?? 0;
};

const getSelectedText = () => {
  if (!editorView) return '';
  const { from, to } = editorView.state.selection.main;
  return from === to ? '' : editorView.state.sliceDoc(from, to);
};

const setSelection = (from: number, to: number) => {
  if (!editorView) return;
  const docLen = editorView.state.doc.length;
  const clampedFrom = Math.max(0, Math.min(from, docLen));
  const clampedTo = Math.max(clampedFrom, Math.min(to, docLen));
  editorView.dispatch({
    selection: { anchor: clampedFrom, head: clampedTo },
    scrollIntoView: true,
  });
};

const insertAtCursor = (text: string) => {
  if (!editorView) return;
  const pos = editorView.state.selection.main.head;
  editorView.dispatch({
    changes: { from: pos, insert: text },
    selection: { anchor: pos + text.length },
  });
  editorView.focus();
};

const clearContent = () => {
  if (!editorView) return;
  editorView.dispatch({
    changes: { from: 0, to: editorView.state.doc.length, insert: '' },
  });
  emit('update:modelValue', '');
  editorView.focus();
};

const formatContent = () => {
  if (!editorView) return;
  const raw = editorView.state.doc.toString();
  if (!raw.trim()) return;
  try {
    const formatted = formatSQL(raw, {
      language: 'sql',
      tabWidth: 2,
      useTabs: false,
      keywordCase: 'upper',
      dataTypeCase: 'upper',
      functionCase: 'lower',
    });
    editorView.dispatch({
      changes: { from: 0, to: editorView.state.doc.length, insert: formatted },
    });
    emit('update:modelValue', formatted);
  } catch {
    // If formatting fails, leave the content unchanged
  }
};

defineExpose({
  getCursorPosition,
  getSelectedText,
  setSelection,
  insertAtCursor,
  clearContent,
  formatContent,
});
</script>

<style scoped>
.sql-editor-wrapper {
  position: relative;
  width: 100%;
  overflow-y: auto;
}

.sql-editor {
  width: 100%;
  overflow-y: auto;
}

.sql-editor-wrapper.disabled {
  opacity: 0.5;
  pointer-events: none;
}
</style>

<template>
  <div
    class="sql-editor-wrapper"
    :class="{ disabled: disabled && !readonly, readonly: readonly }"
    :style="{ maxHeight: minHeight }">
    <div ref="editorContainer" class="sql-editor" :style="{ maxHeight: minHeight }"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick, computed } from 'vue';
import { EditorView, basicSetup } from 'codemirror';
import {
  StandardSQL,
  keywordCompletionSource,
  schemaCompletionSource,
  type SQLNamespace,
} from '@codemirror/lang-sql';
import { EditorState, Compartment, Prec } from '@codemirror/state';
import { keymap, hoverTooltip } from '@codemirror/view';
import { setDiagnostics, type Diagnostic } from '@codemirror/lint';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { tags } from '@lezer/highlight';
import {
  HighlightStyle,
  LanguageSupport,
  syntaxHighlighting,
  bracketMatching,
} from '@codemirror/language';
import {
  acceptCompletion,
  startCompletion,
  closeBrackets,
  closeBracketsKeymap,
  type CompletionContext,
  type Completion,
} from '@codemirror/autocomplete';
import { useTheme } from 'vuetify';
import { format as formatSQL } from 'sql-formatter';
import { ident, statementAt, userSql } from '../composables/loqe/sql';
import type { SqlCompletionItem } from '../composables/loqe/types';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    placeholder?: string;
    disabled?: boolean;
    /**
     * Non-editable but fully interactive: the content still scrolls and can be
     * selected. `disabled` greys the editor out and blocks pointer events, which
     * makes a long document impossible to scroll — use this for read-only views.
     */
    readonly?: boolean;
    minHeight?: string;
    clearable?: boolean;
    /** Nested schema for hierarchical name completions: { catalog: { ns: { table: [] } } } */
    schema?: SQLNamespace;
    /**
     * Async callback to lazily fetch completions for a dot-qualifier (called on any.dot).
     * Items with a `kind` get an icon and a type; plain names are still accepted.
     */
    fetchCompletions?: (qualifier: string) => Promise<Array<string | SqlCompletionItem>>;
    /** A query is running: Esc in the editor emits `cancel`. */
    running?: boolean;
  }>(),
  {
    placeholder: '',
    disabled: false,
    readonly: false,
    minHeight: '30vh',
    clearable: false,
    schema: undefined,
    fetchCompletions: undefined,
    running: false,
  },
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'click'): void;
  (e: 'keyup'): void;
  /** Mod-Enter: run the selection, or the whole script. */
  (e: 'run'): void;
  /** Shift-Mod-Enter: run the statement under the cursor. */
  (e: 'runStatement'): void;
  /** Esc while `running`. */
  (e: 'cancel'): void;
}>();

const editorContainer = ref<HTMLElement>();
let editorView: EditorView | null = null;
const readOnlyCompartment = new Compartment();
const themeCompartment = new Compartment();

const sqlLangCompartment = new Compartment();
const aliasCompartment = new Compartment();

/**
 * SQL language with keyword and schema completion, as `sql()` builds it, except
 * that keywords stay out of a dotted name: after `catalog.` only the names that
 * can follow belong in the list.
 */
function sqlLanguage(schema: SQLNamespace | undefined) {
  const dialect = StandardSQL;
  const keywords = keywordCompletionSource(dialect, true);
  return new LanguageSupport(dialect.language, [
    dialect.language.data.of({
      autocomplete: (ctx: CompletionContext) => {
        const word = ctx.matchBefore(/\w*/);
        const from = word ? word.from : ctx.pos;
        if (ctx.state.sliceDoc(from - 1, from) === '.') return null;
        return keywords(ctx);
      },
    }),
    schema
      ? dialect.language.data.of({
          autocomplete: schemaCompletionSource({ dialect, schema, upperCaseKeywords: true }),
        })
      : [],
  ]);
}

// ── Lazy alias-aware completion ──────────────────────────────────────

/** The name inside a quoted identifier: `""` becomes `"`, and `.` is kept apart from the path's dots. */
function unquote(inner: string, dot: string): string {
  return inner.replaceAll('""', '"').replaceAll('.', dot);
}

/**
 * A dotted name as typed (`demo."f-inance".products`) → its parts joined by
 * \x1F, quotes stripped and dots inside quotes kept: `demo\x1Ff-inance\x1Fproducts`.
 */
function toQualifier(raw: string): string {
  const PLACEHOLDER = '\uFFFF';
  return raw
    .replace(/"((?:[^"]|"")*)"/g, (_, inner: string) => unquote(inner, PLACEHOLDER))
    .split('.')
    .map((p) => p.replaceAll(PLACEHOLDER, '.'))
    .join('\x1F');
}

/** Words that follow a table reference and so can't be its alias. */
const NOT_ALIAS = new Set([
  'where',
  'on',
  'using',
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
  'qualify',
  'window',
]);

interface TableRef {
  /** \x1F-joined parts, as `fetchCompletions` takes them. */
  qualifier: string;
  alias?: string;
  /** Where the reference (name and alias) sits in the text. */
  from: number;
  to: number;
}

/**
 * Table references in SQL text — `FROM catalog.schema.table AS alias`,
 * `FROM table alias`, `JOIN table` — with their alias where one is given.
 */
function parseTableRefs(doc: string): TableRef[] {
  const refs: TableRef[] = [];
  const re =
    /(?:FROM|JOIN)\s+((?:\w+|"(?:[^"]|"")*")(?:\.(?:\w+|"(?:[^"]|"")*"))*)(?:\s+(?:AS\s+)?(\w+))?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(doc)) !== null) {
    const alias = m[2]?.toLowerCase();
    refs.push({
      qualifier: toQualifier(m[1]),
      ...(alias && !NOT_ALIAS.has(alias) ? { alias } : {}),
      from: m.index,
      to: m.index + m[0].length,
    });
  }
  return refs;
}

/** Map: alias → fully-qualified table name. */
function parseAliases(doc: string): Map<string, string> {
  const aliases = new Map<string, string>();
  for (const ref of parseTableRefs(doc)) {
    if (ref.alias) aliases.set(ref.alias, ref.qualifier);
  }
  return aliases;
}

/** The statement around `pos`, so names from other statements stay out. */
function statementTextAt(doc: string, pos: number): string {
  return statementRangeAt(doc, pos).text;
}

/** The statement around `pos` and where it starts in `doc`. */
function statementRangeAt(doc: string, pos: number): { text: string; from: number } {
  const statement = statementAt(userSql(doc), pos);
  return statement
    ? { text: doc.slice(statement.from, statement.to), from: statement.from }
    : { text: doc, from: 0 };
}

/** Local completion cache so we don't re-fetch on every keystroke */
const completionCache = new Map<string, SqlCompletionItem[]>();
/** Qualifiers that just came back empty, until when — a name being typed or a
 *  typo would otherwise be looked up again on every keystroke. */
const emptyUntil = new Map<string, number>();
const EMPTY_TTL_MS = 30_000;
/** Lookups in flight, so the completer and hover share one per qualifier. */
const inFlight = new Map<string, Promise<SqlCompletionItem[]>>();

/** Check if a SQL identifier needs quoting (contains non-word chars or starts with digit) */
function needsQuoting(name: string): boolean {
  return /[^a-zA-Z0-9_]/.test(name) || /^\d/.test(name);
}

type FetchCompletions = (qualifier: string) => Promise<Array<string | SqlCompletionItem>>;

/** Items for a qualifier, from the cache or the callback; plain names have no kind. */
async function loadItems(fn: FetchCompletions, qualifier: string): Promise<SqlCompletionItem[]> {
  const cached = completionCache.get(qualifier);
  if (cached) return cached;
  if ((emptyUntil.get(qualifier) ?? 0) > Date.now()) return [];
  const pending = inFlight.get(qualifier);
  if (pending) return pending;

  const lookup = (async () => {
    try {
      const items = (await fn(qualifier)).map((item) =>
        typeof item === 'string' ? ({ name: item } as SqlCompletionItem) : item,
      );
      if (items.length > 0) completionCache.set(qualifier, items);
      else emptyUntil.set(qualifier, Date.now() + EMPTY_TTL_MS);
      return items;
    } catch {
      emptyUntil.set(qualifier, Date.now() + EMPTY_TTL_MS);
      return [];
    } finally {
      inFlight.delete(qualifier);
    }
  })();
  inFlight.set(qualifier, lookup);
  return lookup;
}

/** A completion for a fetched name: icon by kind, column type as detail. */
function toCompletion(item: SqlCompletionItem, boost: number, detail?: string): Completion {
  return {
    label: item.name,
    type: item.kind ?? 'property',
    boost,
    ...(detail || item.detail ? { detail: detail ?? item.detail } : {}),
    // Quote identifiers that contain special characters
    ...(needsQuoting(item.name) ? { apply: String(ident(item.name)) } : {}),
  };
}

/**
 * Columns of the tables the statement reads, labelled with the table or alias.
 * Only fully qualified names (`catalog.schema.table`) are looked up: a shorter
 * one makes DuckDB scan every attached catalog, which on a REST catalog means
 * listing namespaces and loading tables over the network. The name under the
 * cursor is skipped too — it is still being typed.
 */
async function statementColumns(
  fn: FetchCompletions,
  statement: string,
  cursor = -1,
): Promise<{ item: SqlCompletionItem; source: string }[]> {
  const refs = parseTableRefs(statement).filter(
    (ref) => ref.qualifier.split('\x1F').length === 3 && !(ref.from <= cursor && cursor <= ref.to),
  );
  const lists = await Promise.all(
    refs.map(async (ref) => {
      const items = await loadItems(fn, ref.qualifier);
      const source = ref.alias ?? ref.qualifier.split('\x1F').pop() ?? '';
      return items.filter((i) => i.kind === 'column').map((item) => ({ item, source }));
    }),
  );
  return lists.flat();
}

const IDENT_PATH = /(?:\w+|"(?:[^"]|"")*")(?:\.(?:\w+|"(?:[^"]|"")*"))*/g;

/**
 * Build the async completion source and hover that resolve names lazily.
 * Handles aliases (FROM table AS t -> t.col) and any direct dot-qualifier
 * (catalog. -> schemas, catalog.schema. -> tables, etc.), catalog names after
 * FROM/JOIN, and bare column names of the tables the statement reads.
 */
function buildCompletionSource(fetchFn: FetchCompletions | undefined) {
  if (!fetchFn) return [];

  const fn = fetchFn;

  async function completer(ctx: CompletionContext) {
    // 1. Dot-qualifier completions (catalog.schema.table. etc.)
    // Regex also matches quoted identifiers like demo."f-inance.sss".table.
    const dotMatch = ctx.matchBefore(
      /((\w+|"(?:[^"]|"")*")(\.(\w+|"(?:[^"]|"")*"))*)\.(\w*|"(?:[^"]|"")*")/,
    );
    if (dotMatch) {
      const lastDotIdx = dotMatch.text.lastIndexOf('.');
      let qualifier = toQualifier(dotMatch.text.slice(0, lastDotIdx));

      // Resolve alias if it's a single-part qualifier
      if (!qualifier.includes('\x1F')) {
        const aliases = parseAliases(statementTextAt(ctx.state.doc.toString(), ctx.pos));
        const resolved = aliases.get(qualifier.toLowerCase());
        if (resolved) qualifier = resolved;
      }

      const items = await loadItems(fn, qualifier);
      if (items.length === 0) return null;
      return {
        from: dotMatch.from + lastDotIdx + 1,
        options: items.map((item) => toCompletion(item, 99)),
      };
    }

    // 2. After FROM/JOIN keyword — offer catalog names
    const fromMatch = ctx.matchBefore(/(?:FROM|JOIN)\s+\w*/i);
    if (fromMatch) {
      // Qualifier = empty string means "list catalogs"
      const catalogs = await loadItems(fn, '');
      if (catalogs.length === 0) return null;

      // Find where the identifier starts after FROM/JOIN
      const spaceIdx = fromMatch.text.search(/\s\w*$/);
      const identStart = fromMatch.from + spaceIdx + 1;
      return {
        from: identStart,
        options: catalogs.map((item) =>
          toCompletion({ ...item, kind: item.kind ?? 'catalog' }, 50),
        ),
      };
    }

    // 3. A bare word — columns of the tables this statement reads
    const word = ctx.matchBefore(/\w+/);
    if (!word && !ctx.explicit) return null;
    const statement = statementRangeAt(ctx.state.doc.toString(), ctx.pos);
    const columns = await statementColumns(fn, statement.text, ctx.pos - statement.from);
    if (columns.length === 0) return null;
    return {
      from: word ? word.from : ctx.pos,
      options: columns.map(({ item, source }) =>
        toCompletion(item, 20, [item.detail, source].filter(Boolean).join(' · ')),
      ),
    };
  }

  /** Hovering a catalog, schema, table or column name shows what it is. */
  const hover = hoverTooltip(async (view, pos) => {
    const line = view.state.doc.lineAt(pos);
    const offset = pos - line.from;
    const path = [...line.text.matchAll(IDENT_PATH)].find(
      (m) => m.index <= offset && offset <= m.index + m[0].length,
    );
    if (!path) return null;

    // The part under the pointer, and the parts before it.
    const parts = [...path[0].matchAll(/\w+|"(?:[^"]|"")*"/g)];
    const partIdx = parts.findIndex(
      (p) => path.index + p.index <= offset && offset <= path.index + p.index + p[0].length,
    );
    if (partIdx < 0) return null;
    const part = parts[partIdx];
    const name = toQualifier(part[0]);
    const doc = view.state.doc.toString();
    const statement = statementTextAt(doc, pos);

    let found: SqlCompletionItem | undefined;
    let source = '';
    if (partIdx === 0) {
      const lower = name.toLowerCase();
      found = (await loadItems(fn, '')).find((i) => i.name.toLowerCase() === lower);
      if (found) found = { ...found, kind: found.kind ?? 'catalog' };
      if (!found) {
        const match = (await statementColumns(fn, statement)).find(
          (c) => c.item.name.toLowerCase() === lower,
        );
        found = match?.item;
        source = match?.source ?? '';
      }
    } else {
      let qualifier = toQualifier(
        parts
          .slice(0, partIdx)
          .map((p) => p[0])
          .join('.'),
      );
      if (partIdx === 1) {
        const resolved = parseAliases(statement).get(qualifier.toLowerCase());
        if (resolved) qualifier = resolved;
      }
      found = (await loadItems(fn, qualifier)).find((i) => i.name === name);
    }
    if (!found?.kind) return null;

    const item = found;
    const start = line.from + path.index + part.index;
    return {
      pos: start,
      end: start + part[0].length,
      above: true,
      create: () => {
        const dom = document.createElement('div');
        dom.className = 'cm-sql-hover';
        const kind = document.createElement('span');
        kind.className = 'cm-sql-hover-kind';
        kind.textContent = item.kind;
        const label = document.createElement('strong');
        label.textContent = item.name;
        dom.append(kind, label);
        const detail = [item.detail, source].filter(Boolean).join(' · ');
        if (detail) {
          const extra = document.createElement('code');
          extra.textContent = detail;
          dom.append(extra);
        }
        return { dom };
      },
    };
  });

  return [EditorState.languageData.of(() => [{ autocomplete: completer }]), hover];
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

// Editor chrome (background/border/text/accents) routes through Vuetify theme
// tokens via CSS custom properties so it follows dark mode and console-plus
// white-label branding automatically. Only the syntax-highlighting token
// colors above (lightHighlightStyle / darkHighlightStyle) are a deliberate
// fixed palette, matching the chart-categorical-palette exception.
const createThemeExtension = (dark: boolean) => {
  return EditorView.theme(
    {
      '&': {
        minHeight: props.minHeight,
        height: '100%',
        overflow: 'hidden',
        fontSize: '13px',
        lineHeight: '1.6',
        border: '1px solid rgba(var(--v-theme-on-surface), 0.12)',
        borderRadius: '8px',
        backgroundColor: 'rgb(var(--v-theme-surface))',
        color: 'rgb(var(--v-theme-on-surface))',
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
      },
      '&.cm-focused': {
        outline: 'none',
        borderColor: 'rgba(var(--v-theme-primary), 0.7)',
        boxShadow: '0 0 0 2px rgba(var(--v-theme-primary), 0.12)',
      },
      '.cm-scroller': {
        overflow: 'auto',
        maxHeight: props.minHeight,
        fontFamily:
          '"JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
        fontVariantLigatures: 'none',
      },
      '.cm-content': {
        padding: '12px 8px',
        caretColor: 'rgb(var(--v-theme-primary))',
      },
      '.cm-placeholder': {
        color: 'rgba(var(--v-theme-on-surface), 0.5)',
        fontStyle: 'italic',
      },
      '.cm-line': {
        padding: '0 4px',
      },
      '.cm-cursor': {
        borderLeftColor: 'rgb(var(--v-theme-primary))',
        borderLeftWidth: '2px',
      },
      '.cm-selectionBackground': {
        backgroundColor: 'rgba(var(--v-theme-primary), 0.15) !important',
      },
      '&.cm-focused .cm-selectionBackground': {
        backgroundColor: 'rgba(var(--v-theme-primary), 0.25) !important',
      },
      '.cm-activeLine': {
        backgroundColor: 'rgba(var(--v-theme-primary), 0.04)',
      },
      '.cm-gutters': {
        backgroundColor: 'rgb(var(--v-theme-surface))',
        color: 'rgba(var(--v-theme-on-surface), 0.35)',
        border: 'none',
        paddingLeft: '4px',
        borderTopLeftRadius: '8px',
        borderBottomLeftRadius: '8px',
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'transparent',
        color: 'rgba(var(--v-theme-on-surface), 0.8)',
      },
      '.cm-lintRange-error': {
        backgroundImage: 'none',
        textDecoration: 'underline wavy rgb(var(--v-theme-error))',
        textUnderlineOffset: '3px',
      },
      '.cm-diagnostic-error': { borderLeftColor: 'rgb(var(--v-theme-error))' },
      // Other copies of the selected text: a quiet outline, not the default green.
      '.cm-selectionMatch': {
        backgroundColor: 'rgba(var(--v-theme-primary), 0.08)',
        outline: '1px solid rgba(var(--v-theme-primary), 0.2)',
        borderRadius: '2px',
      },
      '.cm-matchingBracket': {
        backgroundColor: 'rgba(var(--v-theme-primary), 0.2)',
        outline: '1px solid rgba(var(--v-theme-primary), 0.35)',
        borderRadius: '2px',
      },
      '.cm-tooltip': {
        backgroundColor: 'rgb(var(--v-theme-surface-bright))',
        border: '1px solid rgba(var(--v-theme-on-surface), 0.12)',
        borderRadius: '6px',
        boxShadow: dark ? '0 4px 12px rgba(0, 0, 0, 0.4)' : '0 4px 12px rgba(0, 0, 0, 0.1)',
      },
      '.cm-tooltip-autocomplete > ul > li': {
        padding: '4px 8px',
        borderRadius: '4px',
      },
      // Suggestion icons by kind, from the Material Design Icons font the apps load.
      '.cm-completionIcon-catalog, .cm-completionIcon-schema, .cm-completionIcon-table, .cm-completionIcon-view, .cm-completionIcon-column':
        { fontFamily: '"Material Design Icons"', opacity: '0.75', width: '1.2em' },
      '.cm-completionIcon-catalog:after': { content: '"\\F01BC"' },
      '.cm-completionIcon-schema:after': { content: '"\\F0256"' },
      '.cm-completionIcon-table:after': { content: '"\\F04EB"' },
      '.cm-completionIcon-view:after': { content: '"\\F06D0"' },
      '.cm-completionIcon-column:after': { content: '"\\F0835"' },
      '.cm-completionDetail': {
        marginLeft: '1.5em',
        fontStyle: 'normal',
        color: 'rgba(var(--v-theme-on-surface), 0.55)',
      },
      '.cm-sql-hover': {
        display: 'flex',
        alignItems: 'baseline',
        gap: '8px',
        padding: '6px 10px',
        fontSize: '12px',
      },
      '.cm-sql-hover-kind': {
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        fontSize: '10px',
        color: 'rgba(var(--v-theme-on-surface), 0.6)',
      },
      '.cm-sql-hover code': { color: 'rgb(var(--v-theme-primary))' },
      '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
        backgroundColor: 'rgba(var(--v-theme-primary), 0.12)',
        color: 'rgb(var(--v-theme-on-surface))',
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
      sqlLangCompartment.of(sqlLanguage(props.schema)),
      bracketMatching(),
      closeBrackets(),
      aliasCompartment.of(buildCompletionSource(props.fetchCompletions)),
      // Run shortcuts outrank the default Mod-Enter (insert blank line).
      Prec.highest(
        keymap.of([
          {
            key: 'Mod-Enter',
            run: () => {
              emit('run');
              return true;
            },
          },
          {
            key: 'Shift-Mod-Enter',
            run: () => {
              emit('runStatement');
              return true;
            },
          },
          // macOS takes Ctrl-Space to switch input sources, so the Mac gets
          // Cmd-I as well (as in VS Code); Ctrl-Space stays bound everywhere.
          { mac: 'Mod-i', run: startCompletion },
          {
            key: 'Shift-Alt-f',
            run: () => {
              if (props.readonly || props.disabled) return false;
              formatContent();
              return true;
            },
          },
          {
            // Only while a query runs; otherwise Esc keeps its editor meaning
            // (close the completion list, or Esc then Tab to leave the editor).
            key: 'Escape',
            run: () => {
              if (!props.running) return false;
              emit('cancel');
              return true;
            },
          },
        ]),
      ),
      // Tab takes an open completion first, as in most SQL editors; with no
      // completion open `acceptCompletion` declines and Tab indents.
      keymap.of([
        ...defaultKeymap,
        ...closeBracketsKeymap,
        { key: 'Tab', run: acceptCompletion },
        indentWithTab,
      ]),
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
      readOnlyCompartment.of(EditorState.readOnly.of(props.disabled || props.readonly)),
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
  () => props.disabled || props.readonly,
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
        effects: [sqlLangCompartment.reconfigure(sqlLanguage(schema))],
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
      emptyUntil.clear();
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

/** Underline failing spots, e.g. where DuckDB located a parse error. Empty clears. */
const setErrors = (errors: { from: number; to: number; message: string }[]) => {
  if (!editorView) return;
  const len = editorView.state.doc.length;
  const diagnostics: Diagnostic[] = errors.map((e) => {
    const from = Math.max(0, Math.min(e.from, len));
    return { from, to: Math.max(from, Math.min(e.to, len)), severity: 'error', message: e.message };
  });
  editorView.dispatch(setDiagnostics(editorView.state, diagnostics));
};

/** Offsets of the main selection; equal when nothing is selected. */
const getSelectionRange = () => {
  const { from, to } = editorView?.state.selection.main ?? { from: 0, to: 0 };
  return { from, to };
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
  getSelectionRange,
  setSelection,
  setErrors,
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

/* Read-only keeps full opacity and pointer events so long content stays scrollable. */
.sql-editor-wrapper.readonly :deep(.cm-cursor) {
  display: none;
}
</style>

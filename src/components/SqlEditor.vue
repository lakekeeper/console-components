<template>
  <div class="sql-editor-wrapper" :class="{ disabled: disabled }">
    <div ref="editorContainer" class="sql-editor"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick, computed } from 'vue';
import { EditorView, basicSetup } from 'codemirror';
import { sql } from '@codemirror/lang-sql';
import { EditorState, Compartment } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { tags } from '@lezer/highlight';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { useTheme } from 'vuetify';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    placeholder?: string;
    disabled?: boolean;
    minHeight?: string;
    clearable?: boolean;
  }>(),
  {
    placeholder: '',
    disabled: false,
    minHeight: '200px',
    clearable: false,
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

// Detect Vuetify theme (dark/light mode)
const theme = useTheme();
const isDark = computed(() => theme.global.current.value.dark);

// Custom SQL syntax highlighting for light mode
const lightHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: '#0000FF' }, // Blue for SQL keywords
  { tag: tags.string, color: '#067D17' }, // Green for strings
  { tag: tags.number, color: '#098658' }, // Teal for numbers
  { tag: tags.comment, color: '#6A9955', fontStyle: 'italic' }, // Green italic for comments
  { tag: tags.operator, color: '#000000' }, // Black for operators
  { tag: tags.variableName, color: '#001080' }, // Dark blue for identifiers
  { tag: tags.typeName, color: '#267F99' }, // Cyan for types
  { tag: tags.function(tags.variableName), color: '#795E26' }, // Brown for functions
]);

// Custom SQL syntax highlighting for dark mode
const darkHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: '#569CD6' }, // Light blue for SQL keywords
  { tag: tags.string, color: '#CE9178' }, // Orange/tan for strings
  { tag: tags.number, color: '#B5CEA8' }, // Light green for numbers
  { tag: tags.comment, color: '#6A9955', fontStyle: 'italic' }, // Green italic for comments
  { tag: tags.operator, color: '#D4D4D4' }, // Light gray for operators
  { tag: tags.variableName, color: '#9CDCFE' }, // Light cyan for identifiers
  { tag: tags.typeName, color: '#4EC9B0' }, // Turquoise for types
  { tag: tags.function(tags.variableName), color: '#DCDCAA' }, // Yellow for functions
]);

// Create theme extension based on dark/light mode
const createThemeExtension = (dark: boolean) => {
  return EditorView.theme(
    {
      '&': {
        minHeight: props.minHeight,
        maxHeight: '30vh',
        fontSize: '14px',
        border: dark ? '1px solid rgba(255, 255, 255, 0.23)' : '1px solid rgba(0, 0, 0, 0.23)',
        borderRadius: '4px',
        backgroundColor: dark ? '#1E1E1E' : '#FFFFFF',
        color: dark ? '#D4D4D4' : '#000000',
        overflow: 'hidden',
      },
      '&.cm-focused': {
        outline: dark ? '2px solid #90CAF9' : '2px solid #1976d2',
        outlineOffset: '0px',
        borderColor: dark ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)',
      },
      '.cm-scroller': {
        fontFamily: '"Courier New", Courier, monospace',
        overflow: 'auto',
        maxHeight: '30vh',
      },
      '.cm-content': {
        padding: '8px',
        caretColor: dark ? '#FFFFFF' : '#000000',
      },
      '.cm-placeholder': {
        color: dark ? '#858585' : '#999',
        fontStyle: 'italic',
      },
      '.cm-line': {
        color: dark ? '#D4D4D4' : '#000000',
      },
      '.cm-cursor': {
        borderLeftColor: dark ? '#FFFFFF' : '#000000',
      },
      '.cm-selectionBackground, ::selection': {
        backgroundColor: dark ? 'rgba(144, 202, 249, 0.3)' : 'rgba(25, 118, 210, 0.2)',
      },
      '&.cm-focused .cm-selectionBackground, &.cm-focused ::selection': {
        backgroundColor: dark ? 'rgba(144, 202, 249, 0.3)' : 'rgba(25, 118, 210, 0.2)',
      },
      '.cm-activeLine': {
        backgroundColor: dark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
      },
      '.cm-gutters': {
        backgroundColor: dark ? '#1E1E1E' : '#F3F3F3',
        color: dark ? '#858585' : '#999',
        border: 'none',
      },
      '.cm-activeLineGutter': {
        backgroundColor: dark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
      },
    },
    { dark },
  );
};

onMounted(async () => {
  await nextTick();
  if (!editorContainer.value) return;

  const startState = EditorState.create({
    doc: props.modelValue || '',
    extensions: [
      basicSetup,
      sql(),
      keymap.of([...defaultKeymap, indentWithTab]),
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

// Watch for theme changes and reconfigure editor
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

onUnmounted(() => {
  editorView?.destroy();
});

// Expose method to get cursor position
const getCursorPosition = () => {
  return editorView?.state.selection.main.head ?? 0;
};

// Expose method to insert text at cursor
const insertAtCursor = (text: string) => {
  if (!editorView) return;
  const pos = editorView.state.selection.main.head;
  editorView.dispatch({
    changes: { from: pos, insert: text },
    selection: { anchor: pos + text.length },
  });
  editorView.focus();
};

// Clear the editor content
const clearContent = () => {
  if (!editorView) return;
  editorView.dispatch({
    changes: { from: 0, to: editorView.state.doc.length, insert: '' },
  });
  emit('update:modelValue', '');
  editorView.focus();
};

defineExpose({
  getCursorPosition,
  insertAtCursor,
  clearContent,
});
</script>

<style scoped>
.sql-editor-wrapper {
  position: relative;
  width: 100%;
  max-height: 30vh;
  overflow-y: auto;
}

.sql-editor {
  width: 100%;
  max-height: 30vh;
  overflow-y: auto;
}

.clear-button {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 10;
  background-color: rgba(255, 255, 255, 0.8) !important;
}

.clear-button:hover {
  background-color: rgba(255, 255, 255, 1) !important;
}

.sql-editor-wrapper.disabled {
  opacity: 0.6;
  pointer-events: none;
}
</style>

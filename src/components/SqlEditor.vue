<template>
  <div ref="editorContainer" class="sql-editor" :class="{ disabled: disabled }"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { EditorView, basicSetup } from 'codemirror';
import { sql } from '@codemirror/lang-sql';
import { EditorState, Compartment } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';

interface Props {
  modelValue: string;
  placeholder?: string;
  disabled?: boolean;
  minHeight?: string;
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '',
  disabled: false,
  minHeight: '200px',
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'click'): void;
  (e: 'keyup'): void;
}>();

const editorContainer = ref<HTMLElement>();
let editorView: EditorView | null = null;
const readOnlyCompartment = new Compartment();

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
          emit('update:modelValue', update.state.doc.toString());
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
      EditorView.theme({
        '&': {
          minHeight: props.minHeight,
          fontSize: '14px',
          border: '1px solid rgba(0, 0, 0, 0.23)',
          borderRadius: '4px',
        },
        '&.cm-focused': {
          outline: '2px solid #1976d2',
          outlineOffset: '0px',
        },
        '.cm-scroller': {
          fontFamily: '"Courier New", Courier, monospace',
          overflow: 'auto',
        },
        '.cm-content': {
          padding: '8px',
        },
        '.cm-placeholder': {
          color: '#999',
          fontStyle: 'italic',
        },
      }),
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

defineExpose({
  getCursorPosition,
  insertAtCursor,
});
</script>

<style scoped>
.sql-editor {
  width: 100%;
}

.sql-editor.disabled {
  opacity: 0.6;
  pointer-events: none;
}
</style>

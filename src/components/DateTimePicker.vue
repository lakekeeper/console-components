<template>
  <v-menu v-model="menuOpen" :close-on-content-click="false" location="bottom start">
    <template #activator="{ props: menuProps }">
      <v-text-field
        v-bind="menuProps"
        :model-value="displayValue"
        :label="label"
        :density="density"
        :variant="variant"
        :hide-details="hideDetails"
        :hint="hint"
        :persistent-hint="persistentHint"
        :placeholder="placeholder || 'mm/dd/yyyy, --:--'"
        :disabled="disabled"
        :clearable="clearable"
        readonly
        prepend-inner-icon="mdi-calendar-clock"
        @click:clear.stop="clear"></v-text-field>
    </template>

    <v-card width="336">
      <div class="pa-2">
        <v-date-picker
          v-model="draftDate"
          :min="minDate"
          :max="maxDate"
          hide-header
          show-adjacent-months
          width="100%"></v-date-picker>
      </div>
      <v-divider></v-divider>
      <div class="d-flex align-center ga-2 px-4 py-3">
        <v-select
          v-model="draftHour"
          :items="hourItems"
          label="HH"
          density="compact"
          hide-details
          no-data-text="No hours available"
          style="max-width: 90px"></v-select>
        <span class="text-medium-emphasis">:</span>
        <v-select
          v-model="draftMinute"
          :items="minuteItems"
          label="MM"
          density="compact"
          hide-details
          no-data-text="No minutes available"
          style="max-width: 90px"></v-select>
      </div>
      <v-card-actions>
        <v-btn variant="text" size="small" @click="clear">Clear</v-btn>
        <v-spacer></v-spacer>
        <v-btn variant="flat" color="primary" size="small" @click="apply">Apply</v-btn>
      </v-card-actions>
    </v-card>
  </v-menu>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';

// Drop-in, theme-aware replacement for `<v-text-field type="datetime-local">`.
// The native control renders the browser's own (non-brandable, grey-only)
// date/time picker; this composes Vuetify's own VDatePicker + hour/minute
// selects instead, so it fully follows the app's theme and any branding.
const props = withDefaults(
  defineProps<{
    /** "YYYY-MM-DDTHH:mm" (same shape the native datetime-local input used), or '' */
    modelValue: string;
    label?: string;
    density?: 'default' | 'comfortable' | 'compact';
    variant?: 'outlined' | 'underlined' | 'filled' | 'plain' | 'solo' | 'solo-inverted';
    hideDetails?: boolean | 'auto';
    clearable?: boolean;
    hint?: string;
    persistentHint?: boolean;
    placeholder?: string;
    /** "YYYY-MM-DDTHH:mm" — restricts the calendar to that day or later */
    min?: string;
    /** "YYYY-MM-DDTHH:mm" — restricts the calendar to that day or earlier */
    max?: string;
    disabled?: boolean;
  }>(),
  {
    label: undefined,
    density: 'default',
    variant: 'outlined',
    hideDetails: 'auto',
    clearable: false,
    hint: undefined,
    persistentHint: false,
    placeholder: undefined,
    min: undefined,
    max: undefined,
    disabled: false,
  },
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

const menuOpen = ref(false);
const draftDate = ref<Date | null>(null);
const draftHour = ref(0);
const draftMinute = ref(0);

const hourItems = Array.from({ length: 24 }, (_, h) => ({
  title: String(h).padStart(2, '0'),
  value: h,
}));
const minuteItems = Array.from({ length: 60 }, (_, m) => ({
  title: String(m).padStart(2, '0'),
  value: m,
}));

function parseLocal(value: string): Date | null {
  if (!value) return null;
  const [datePart, timePart] = value.split('T');
  const [y, mo, d] = (datePart || '').split('-').map(Number);
  if (!y || !mo || !d) return null;
  const [h, mi] = (timePart || '0:0').split(':').map(Number);
  return new Date(y, mo - 1, d, h || 0, mi || 0);
}

function toLocalValue(date: Date, hour: number, minute: number): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(hour).padStart(2, '0');
  const mi = String(minute).padStart(2, '0');
  return `${y}-${mo}-${d}T${h}:${mi}`;
}

const minDate = computed(() => {
  const parsed = props.min ? parseLocal(props.min) : null;
  return parsed ?? undefined;
});

const maxDate = computed(() => {
  const parsed = props.max ? parseLocal(props.max) : null;
  return parsed ?? undefined;
});

const displayValue = computed(() => {
  const parsed = parseLocal(props.modelValue);
  if (!parsed) return '';
  return parsed.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
});

// Re-seed the draft from the committed value every time the menu opens so an
// abandoned edit doesn't linger (same pattern as MaintenanceRangeMenu).
watch(menuOpen, (isOpen) => {
  if (!isOpen) return;
  const parsed = parseLocal(props.modelValue);
  const base = parsed ?? new Date();
  draftDate.value = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  draftHour.value = parsed ? parsed.getHours() : 0;
  draftMinute.value = parsed ? parsed.getMinutes() : 0;
});

function apply() {
  if (!draftDate.value) return;
  emit('update:modelValue', toLocalValue(draftDate.value, draftHour.value, draftMinute.value));
  menuOpen.value = false;
}

function clear() {
  emit('update:modelValue', '');
  menuOpen.value = false;
}
</script>

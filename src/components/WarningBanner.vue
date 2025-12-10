<template>
  <v-banner :sticky="sticky" color="white" icon="mdi-alert-box" lines="one" bg-color="error">
    <template #text>
      <span class="text-h6">{{ message }}</span>
    </template>
    <template v-if="showActions" #actions>
      <slot name="actions">
        <v-btn color="white" @click="$emit('dismiss')">Dismiss</v-btn>
      </slot>
    </template>
  </v-banner>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    message?: string;
    sticky?: boolean;
    showActions?: boolean;
  }>(),
  {
    message: 'Warning: Authentication is OFF - Not safe for production.',
    sticky: true,
    showActions: false,
  },
);

defineEmits<{
  dismiss: [];
}>();
</script>

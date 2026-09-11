<template>
  <!-- The provider, named as it is stored. Internal vs external is carried by
       the icon and colour here and spelled out in the role's overview: the id
       is what identifies the source, and a chip in a table column is the wrong
       place to also explain what it implies. -->
  <v-chip
    :size="size"
    variant="tonal"
    :color="ownership.kind === 'external' ? 'purple' : undefined"
    :prepend-icon="icon">
    {{ providerId }}
    <v-tooltip activator="parent" location="bottom" max-width="340">
      {{ ownership.label }} — {{ ownership.description }}
    </v-tooltip>
  </v-chip>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoleOwnership } from '../composables/useRoleProviders';

const props = withDefaults(
  defineProps<{
    /** The role's `provider-id`. */
    providerId: string;
    size?: string;
  }>(),
  { size: 'small' },
);

const ownership = useRoleOwnership(() => props.providerId);

const icon = computed(() => {
  if (ownership.value.syncManaged) return 'mdi-sync';
  // An external role nobody syncs any more is worth a second look, so it does
  // not wear the same icon as one that is actively maintained.
  if (ownership.value.kind === 'external') return 'mdi-alert-outline';
  if (ownership.value.kind === 'built-in') return 'mdi-lock-outline';
  return 'mdi-source-branch';
});
</script>

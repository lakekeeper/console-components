<template>
  <v-dialog v-model="isDialogActive" max-width="600">
    <template #activator="{ props: activatorProps }">
      <!-- Filled, and with no trailing margin in edit mode: it sits at the end of
           a section toolbar, where Add member / Add owner are filled primary and
           end flush with the toolbar's own padding — `me-5` pushed this one 20px
           further left than those, and outlined made it read as secondary to
           them. -->
      <v-btn
        :class="actionType == 'add' ? 'me-5' : ''"
        v-bind="activatorProps"
        color="primary"
        size="small"
        :text="actionType == 'add' ? 'Add Role' : 'Edit details'"
        variant="flat"></v-btn>
    </template>

    <v-card :title="$props.actionType == 'add' ? 'New Role' : 'Edit role details'">
      <v-card-text>
        <v-text-field
          v-model="roleData.name"
          label="Role Name"
          placeholder="my-role"
          :rules="[nameRule]"
          hide-details="auto"
          @keyup.enter="createRole"></v-text-field>
        <v-textarea
          v-model="roleData.description"
          label="Role description"
          hide-details="auto"></v-textarea>
        <!-- Who owns this role, for a role that already exists somewhere else.

             Both or neither: the server refuses one without the other, and
             with neither it assigns `lakekeeper` and a fresh UUIDv7 itself,
             which is what an ordinary role wants. They were commented out, so
             a role backed by an OIDC group or an LDAP group could not be named
             here at all — it had to be created through the API. -->
        <v-expansion-panels v-if="actionType === 'add'" flat class="mt-2">
          <v-expansion-panel elevation="0">
            <v-expansion-panel-title class="px-0 text-caption text-medium-emphasis">
              Back this role with an external provider
            </v-expansion-panel-title>
            <v-expansion-panel-text class="px-0">
              <v-text-field
                v-model="roleData.providerId"
                label="Provider ID"
                placeholder="lakekeeper"
                :rules="[providerPairRule]"
                hint="Provider that owns this role — lakekeeper, oidc, ldap. Leave both empty and the server assigns lakekeeper."
                persistent-hint
                clearable></v-text-field>
              <v-text-field
                v-model="roleData.sourceId"
                label="Source ID"
                class="mt-3"
                :rules="[providerPairRule]"
                hint="The role's identifier in that provider, e.g. the group name."
                persistent-hint
                clearable></v-text-field>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>
      </v-card-text>

      <v-card-actions>
        <v-spacer></v-spacer>

        <v-btn variant="text" text="Cancel" @click="cancelRoleInput"></v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :disabled="!isNameValid || !providerPairComplete"
          @click="createRole">
          save role
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import { reactive, onMounted, ref, computed } from 'vue';

const isDialogActive = ref(false);
const emit = defineEmits<{
  (
    e: 'roleInput',
    role: { name: string; description: string; providerId?: string; sourceId?: string },
  ): void;
}>();

const props = defineProps<{
  actionType: 'add' | 'edit';
  role?: {
    name?: string;
    description?: string;
    // providerId?: string;
    // sourceId?: string;
  };
}>();

const roleData = reactive({
  name: '',
  description: '',
  providerId: '',
  sourceId: '',
});

const isNameValid = computed(() => roleData.name.trim() !== '');

/**
 * `provider-id` and `source-id` go together or not at all — the server refuses
 * one without the other. Caught here so the refusal is a hint under the field
 * rather than an error after the save.
 */
const providerPairComplete = computed(() => {
  const p = roleData.providerId?.trim();
  const sid = roleData.sourceId?.trim();
  return (!p && !sid) || (!!p && !!sid);
});

const providerPairRule = () =>
  providerPairComplete.value || 'Provider ID and Source ID must be given together';

const nameRule = (value: string) =>
  (typeof value === 'string' && value.trim() !== '') || 'Role name is required';

function createRole() {
  if (!isNameValid.value || !providerPairComplete.value) return;
  emit('roleInput', {
    name: roleData.name,
    description: roleData.description,
    providerId: roleData.providerId || undefined,
    sourceId: roleData.sourceId || undefined,
  });
  cancelRoleInput();
}

function cancelRoleInput() {
  if (props.actionType === 'add') initRoleInput();
  isDialogActive.value = false;
}

function initRoleInput() {
  roleData.name = '';
  roleData.description = '';
  roleData.providerId = '';
  roleData.sourceId = '';
}

onMounted(() => {
  Object.assign(roleData, props.role);
});
</script>

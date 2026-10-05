<template>
  <v-alert v-if="readError" type="warning" variant="tonal" class="ma-4">
    {{ readError }}
  </v-alert>
  <v-data-table
    v-else
    items-per-page="50"
    height="65vh"
    density="compact"
    :search="searchDeleted"
    fixed-header
    :headers="headers"
    hover
    :items="loadedDeleted"
    :sort-by="[{ key: 'name', order: 'asc' }]"
    :items-per-page-options="[
      { title: '50', value: 50 },
      { title: '100', value: 100 },
    ]">
    <template #top>
      <v-toolbar color="transparent" density="compact" flat>
        <v-spacer></v-spacer>
        <v-text-field
          v-model="searchDeleted"
          label="Filter results"
          prepend-inner-icon="mdi-filter"
          variant="underlined"
          hide-details
          clearable></v-text-field>
      </v-toolbar>
    </template>
    <template #item.name="{ item }">
      <span style="display: flex; align-items: center">
        <v-icon v-if="item.typ === 'table'" class="mr-2">mdi-table</v-icon>
        <v-icon v-else class="mr-2">mdi-view-grid-outline</v-icon>
        {{ item.name }}
      </span>
    </template>
    <template #item.deleted-at="{ item }">
      <v-tooltip location="top">
        <template #activator="{ props }">
          <span v-bind="props">
            {{
              formatDistanceToNow(parseISO(item['deleted-at']), {
                addSuffix: true,
              })
            }}
          </span>
        </template>
        {{ parseISO(item['deleted-at']) }}
      </v-tooltip>
    </template>
    <template #item.expiration-date="{ item }">
      <v-tooltip location="top">
        <template #activator="{ props }">
          <span v-bind="props">
            {{
              formatDistanceToNow(parseISO(item['expiration-date']), {
                addSuffix: true,
              })
            }}
          </span>
        </template>
        {{ parseISO(item['expiration-date']) }}
      </v-tooltip>
    </template>
    <template #item.actions="{ item }">
      <!-- Restore needs `undrop` on the item itself; offered once that is a yes. -->
      <div class="d-flex justify-end align-center">
        <span v-if="rowErrors[item.id]" class="text-caption text-error mr-2">
          {{ rowErrors[item.id] }}
        </span>
        <v-btn
          v-if="canRestore(item)"
          icon="mdi-restore"
          variant="text"
          color="primary"
          size="small"
          title="Restore"
          :loading="restoring === item.id"
          @click="undropTabular(item)"></v-btn>
      </div>
    </template>
    <template #no-data>
      <div>No deleted tabulars in this namespace</div>
    </template>
  </v-data-table>
</template>

<script setup lang="ts">
import { reactive, ref, watch, onMounted } from 'vue';
import { useFunctions } from '../plugins/functions';
import { isForbiddenError, isNotFoundError } from '../common/errorUtils';
import { useItemRights } from '../composables/useItemRights';
import { tagRefusal } from '../composables/useTagRights';
import type { Header } from '../common/interfaces';
import type { DeletedTabularResponse } from '../gen/management/types.gen';
import { formatDistanceToNow, parseISO } from 'date-fns';

type DeletedTabularResponseExtended = DeletedTabularResponse & {
  actions: string[];
  type: string;
};

const props = defineProps<{
  warehouseId: string;
  namespacePath: string;
}>();

const functions = useFunctions();

const searchDeleted = ref('');
const loadedDeleted: DeletedTabularResponseExtended[] = reactive([]);
const loading = ref(false);
const namespaceId = ref('');
// Set when the list could not be read, so a refusal is not "No deleted tabulars".
const readError = ref('');
const rowErrors = ref<Record<string, string>>({});
const restoring = ref('');

// A soft-deleted tabular has no name lookup any more, so its rights are asked by id.
const rights = useItemRights();
function canRestore(item: DeletedTabularResponseExtended): boolean {
  return (
    rights.can(
      { kind: item.typ, warehouseId: props.warehouseId, namespace: [], id: item.id },
      'undrop',
    ) === true
  );
}

const headers: readonly Header[] = Object.freeze([
  { title: 'Name', key: 'name', align: 'start' },
  {
    title: 'Deleted',
    key: 'deleted-at',
    align: 'start',
    value: (item: any) => formatDistanceToNow(parseISO(item['deleted-at']), { addSuffix: true }),
  },
  {
    title: 'Expires',
    key: 'expiration-date',
    align: 'start',
    value: (item: any) =>
      formatDistanceToNow(parseISO(item['expiration-date']), { addSuffix: true }),
  },
  { title: 'Actions', key: 'actions', align: 'end', sortable: false },
]);

onMounted(loadNamespaceAndData);
watch(() => props.namespacePath, loadNamespaceAndData);

async function loadNamespaceAndData() {
  readError.value = '';
  loadedDeleted.splice(0, loadedDeleted.length);
  try {
    // Silent: the refusal is rendered in place of the list.
    const namespace = await functions.loadNamespaceMetadata(
      props.warehouseId,
      props.namespacePath,
      false,
    );
    namespaceId.value = namespace.properties?.namespace_id || '';
  } catch (error) {
    namespaceId.value = '';
    // 404 is the catalog's "not found or access denied" for what may not be seen.
    readError.value = isForbiddenError(error)
      ? "You are not allowed to read this namespace's metadata."
      : isNotFoundError(error)
        ? 'This namespace does not exist or is not visible to you.'
        : tagRefusal(error, "read this namespace's metadata");
    return;
  }
  await loadDeletedTabulars();
}

async function loadDeletedTabulars() {
  try {
    if (!namespaceId.value) return;

    const data = await functions.listDeletedTabulars(
      props.warehouseId,
      namespaceId.value,
      undefined,
      undefined,
      false,
    );
    readError.value = '';
    const loadedDeletedTmp: DeletedTabularResponseExtended[] = [];
    Object.assign(loadedDeletedTmp, data.tabulars);

    loadedDeletedTmp.forEach((item) => {
      item.actions = ['restore'];
      item.type = 'deleted';
    });

    loadedDeleted.splice(0, loadedDeleted.length);
    Object.assign(loadedDeleted, loadedDeletedTmp);
  } catch (error) {
    loadedDeleted.splice(0, loadedDeleted.length);
    readError.value = isForbiddenError(error)
      ? 'You are not allowed to list deleted tables/views here.'
      : tagRefusal(error, 'list deleted tables/views here');
  }
}

async function undropTabular(item: DeletedTabularResponseExtended) {
  const next = { ...rowErrors.value };
  delete next[item.id];
  rowErrors.value = next;
  try {
    loading.value = true;
    restoring.value = item.id;
    await functions.undropTabular(props.warehouseId, item.id, item.typ, true);
    await loadDeletedTabulars();
  } catch (error) {
    // Reported on the row it was tried on.
    rowErrors.value = { ...rowErrors.value, [item.id]: tagRefusal(error, 'restore it') };
  } finally {
    loading.value = false;
    restoring.value = '';
  }
}

defineExpose({
  loadDeletedTabulars,
});
</script>

<template>
  <v-card flat>
    <v-row no-gutters style="height: calc(100vh - 240px); min-height: 360px">
      <!-- LEFT: scope toggle + info/picker. -->
      <v-col
        cols="12"
        md="4"
        class="pa-2"
        style="
          border-right: 1px solid rgba(var(--v-theme-on-surface), 0.12);
          overflow: auto;
          height: 100%;
        ">
        <v-btn-toggle
          v-model="scope"
          mandatory
          density="compact"
          variant="text"
          color="primary"
          class="mb-2">
          <v-btn value="server" size="small">Server</v-btn>
          <v-btn value="project" size="small">Project</v-btn>
          <v-btn value="warehouses" size="small">Warehouses</v-btn>
        </v-btn-toggle>
        <v-divider class="mb-2"></v-divider>

        <!-- Server info -->
        <v-list
          v-if="scope === 'server'"
          density="compact"
          bg-color="transparent"
          class="text-caption">
          <v-list-item title="Server ID" :subtitle="serverInfo['server-id'] || '—'">
            <template v-if="serverInfo['server-id']" #append>
              <v-btn
                icon="mdi-content-copy"
                size="x-small"
                variant="text"
                title="Copy"
                @click="copy(serverInfo['server-id'])"></v-btn>
            </template>
          </v-list-item>
          <v-list-item
            title="Lakekeeper version"
            :subtitle="serverInfo['lakekeeper-version'] || '—'"></v-list-item>
          <v-list-item
            v-if="serverInfo['lakekeeper-enterprise-version']"
            title="Enterprise version"
            :subtitle="serverInfo['lakekeeper-enterprise-version']"></v-list-item>
          <v-list-item
            v-if="serverInfo.console && serverInfo.console.version"
            title="Console version"
            :subtitle="serverInfo.console.version"></v-list-item>
          <v-list-item
            v-if="serverInfo['lakekeeper-commit-sha']"
            title="Commit SHA"
            :subtitle="shortSha(serverInfo['lakekeeper-commit-sha'])"></v-list-item>
          <v-list-item
            v-if="serverInfo['lakekeeper-enterprise-commit-sha']"
            title="Enterprise commit"
            :subtitle="shortSha(serverInfo['lakekeeper-enterprise-commit-sha'])"></v-list-item>
          <v-list-item
            title="Authz backend"
            :subtitle="serverInfo['authz-backend'] || '—'"></v-list-item>
          <v-list-item title="Default project" :subtitle="serverInfo['default-project-id'] || '—'">
            <template v-if="serverInfo['default-project-id']" #append>
              <v-btn
                icon="mdi-content-copy"
                size="x-small"
                variant="text"
                title="Copy"
                @click="copy(serverInfo['default-project-id'])"></v-btn>
            </template>
          </v-list-item>
          <v-list-item
            title="Bootstrapped"
            :subtitle="serverInfo.bootstrapped ? 'yes' : 'no'"></v-list-item>

          <v-divider class="my-1"></v-divider>
          <v-list-subheader class="text-caption">License</v-list-subheader>
          <v-list-item title="Status" :subtitle="licenseSummary"></v-list-item>
          <v-list-item
            v-if="license['customer']"
            title="Customer"
            :subtitle="license['customer']"></v-list-item>
          <v-list-item
            v-if="license['issuer']"
            title="Issuer"
            :subtitle="license['issuer']"></v-list-item>
          <v-list-item
            v-if="license['expiration']"
            title="Expires"
            :subtitle="formatDate(license['expiration'])"></v-list-item>
          <v-list-item
            v-if="license['license-id']"
            title="License ID"
            :subtitle="license['license-id']">
            <template #append>
              <v-btn
                icon="mdi-content-copy"
                size="x-small"
                variant="text"
                title="Copy"
                @click="copy(license['license-id'])"></v-btn>
            </template>
          </v-list-item>

          <v-divider class="my-1"></v-divider>
          <v-list-item title="System identities" :subtitle="systemIdentities"></v-list-item>
          <v-list-item
            title="Queues"
            :subtitle="(serverInfo.queues || []).join(', ') || '—'"></v-list-item>
        </v-list>

        <!-- Project picker + info -->
        <div v-else-if="scope === 'project'">
          <v-autocomplete
            v-model="projectId"
            label="Project"
            :items="projectOptions"
            item-title="title"
            item-value="value"
            :loading="projectOptionsLoading"
            variant="outlined"
            density="compact"
            hide-details></v-autocomplete>
          <v-list
            v-if="projectId"
            density="compact"
            bg-color="transparent"
            class="text-caption mt-2">
            <v-list-item title="Name" :subtitle="selectedProjectName || '—'"></v-list-item>
            <v-list-item title="Project ID" :subtitle="projectId">
              <template #append>
                <v-btn
                  icon="mdi-content-copy"
                  size="x-small"
                  variant="text"
                  title="Copy"
                  @click="copy(projectId)"></v-btn>
              </template>
            </v-list-item>
            <v-list-item
              v-if="projectId === serverInfo['default-project-id']"
              subtitle="Default project">
              <template #prepend>
                <v-icon size="small" color="info">mdi-star</v-icon>
              </template>
            </v-list-item>
          </v-list>
        </div>

        <!-- Warehouse object tree -->
        <WarehousesNavigationTree
          v-else
          pickable
          :pickable-types="['warehouse', 'namespace', 'table', 'view', 'generic-table']"
          @pick="onPick" />
      </v-col>

      <!-- RIGHT: permissions for the current selection. -->
      <v-col cols="12" md="8" style="overflow: auto; height: 100%">
        <div v-if="resolving" class="pa-8 text-center">
          <v-progress-circular color="primary" indeterminate></v-progress-circular>
        </div>
        <PermissionManager
          v-else-if="activeSelection"
          :key="activeSelection.relationType + activeSelection.objectId"
          :object-id="activeSelection.objectId"
          :relation-type="activeSelection.relationType"
          :warehouse-id="activeSelection.warehouseId"
          hide-managed-access />
        <div v-else class="pa-8 text-medium-emphasis d-flex align-center ga-2">
          <v-icon icon="mdi-arrow-left"></v-icon>
          Pick an object to view and manage its permissions.
        </div>
      </v-col>
    </v-row>
  </v-card>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import { useFunctions } from '../plugins/functions';
import { useVisualStore } from '../stores/visual';
import { RelationType } from '../common/interfaces';
import WarehousesNavigationTree from './WarehousesNavigationTree.vue';
import PermissionManager from './PermissionManager.vue';

interface PickItem {
  type: string;
  warehouseId: string;
  namespaceId?: string; // dot-separated namespace path
  name: string;
}

interface Selection {
  objectId: string;
  relationType: RelationType;
  warehouseId?: string;
}

const functions = useFunctions();
const visual = useVisualStore();

const scope = ref<'server' | 'project' | 'warehouses'>('server');
const serverId = ref('');
const serverInfo = computed(() => visual.getServerInfo() as Record<string, any>);
const selectedProjectName = computed(
  () => projectOptions.value.find((o) => o.value === projectId.value)?.title || '',
);
const systemIdentities = computed(() => {
  const info = serverInfo.value;
  const enabled = [
    info['aws-system-identities-enabled'] && 'AWS',
    info['azure-system-identities-enabled'] && 'Azure',
    info['gcp-system-identities-enabled'] && 'GCP',
  ].filter(Boolean);
  return enabled.length ? enabled.join(', ') : 'none';
});
const license = computed(() => serverInfo.value['license-status'] || {});
const licenseSummary = computed(() => {
  const l = license.value;
  if (!l || l['valid'] === undefined) return '—';
  const type = l['license-type'] ? ` (${l['license-type']})` : '';
  return `${l['valid'] ? 'valid' : 'invalid'}${type}`;
});

function shortSha(sha: string): string {
  return typeof sha === 'string' ? sha.slice(0, 10) : sha;
}
function formatDate(d: string): string {
  try {
    return new Date(d).toLocaleDateString();
  } catch {
    return d;
  }
}

// Project picker (lets you choose when there is more than one project).
const projectId = ref('');
const projectOptions = ref<{ title: string; value: string }[]>([]);
const projectOptionsLoading = ref(false);

// Warehouse-tree pick (resolved to a UUID selection).
const resolving = ref(false);
const pickedNode = ref<Selection | null>(null);

// The object the right pane shows, derived from the active scope.
const activeSelection = computed<Selection | null>(() => {
  if (scope.value === 'server') {
    return serverId.value ? { objectId: serverId.value, relationType: RelationType.Server } : null;
  }
  if (scope.value === 'project') {
    return projectId.value
      ? { objectId: projectId.value, relationType: RelationType.Project }
      : null;
  }
  return pickedNode.value;
});

function copy(text: string) {
  functions.copyToClipboard(text);
}

// App routes / ice endpoints address namespaces with the unit separator.
function toApiNs(dotted?: string): string {
  return (dotted ?? '').split('.').join('\x1F');
}

async function loadProjectOptions() {
  projectOptionsLoading.value = true;
  try {
    const data = await functions.loadProjectList();
    projectOptions.value = (Array.isArray(data) ? data : []).map((p: any) => ({
      title: p['project-name'],
      value: p['project-id'],
    }));
  } catch {
    // handled
  } finally {
    projectOptionsLoading.value = false;
  }
}

// A tree node gives us type + names, but PermissionManager needs the entity UUID.
// Resolve it per pick via the existing load/list helpers (no shared-wrapper changes).
async function onPick(item: PickItem) {
  resolving.value = true;
  const wh = item.warehouseId;
  const apiNs = toApiNs(item.namespaceId);
  try {
    let next: Selection | null = null;
    switch (item.type) {
      case 'warehouse':
        next = { objectId: wh, relationType: RelationType.Warehouse, warehouseId: wh };
        break;
      case 'namespace': {
        const meta = await functions.loadNamespaceMetadata(wh, apiNs, false);
        const id = meta?.properties?.namespace_id || (meta as any)?.['namespace-uuid'];
        if (id) next = { objectId: id, relationType: RelationType.Namespace, warehouseId: wh };
        break;
      }
      case 'table': {
        const t = await functions.loadTable(wh, apiNs, item.name, false);
        const id = t?.metadata?.['table-uuid'];
        if (id) next = { objectId: id, relationType: RelationType.Table, warehouseId: wh };
        break;
      }
      case 'view': {
        const v = await functions.loadView(wh, apiNs, item.name, false);
        const id = v?.metadata?.['view-uuid'];
        if (id) next = { objectId: id, relationType: RelationType.View, warehouseId: wh };
        break;
      }
      case 'generic-table': {
        const res = await functions.listGenericTables(wh, apiNs, undefined, false);
        const match = (res.identifiers ?? []).find((g) => g.name === item.name);
        if (match?.id) {
          next = { objectId: match.id, relationType: RelationType.GenericTable, warehouseId: wh };
        }
        break;
      }
    }
    if (next) pickedNode.value = next;
  } catch {
    // handled by functions.handleError
  } finally {
    resolving.value = false;
  }
}

onMounted(async () => {
  serverId.value = visual.getServerInfo()['server-id'] || '';
  projectId.value =
    visual.projectSelected['project-id'] || visual.getServerInfo()['default-project-id'] || '';
  await loadProjectOptions();
});
</script>

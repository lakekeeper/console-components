import { ref, reactive } from 'vue';
// Utilities
import { defineStore } from 'pinia';
import { Project, SnackbarMsg } from '@/common/interfaces';
import { Type } from '@/common/enums';
import { ServerInfo } from '@/gen//management/types.gen';

// SQL Tab interface
export interface SqlTab {
  id: string;
  name: string;
  content: string;
  createdAt: number;
}

export const useVisualStore = defineStore(
  'visual',
  () => {
    const currentUrl = ref('');
    const showAppOrNavBar = ref(true);

    // Initialize theme based on system preferences
    const getSystemTheme = () => {
      if (typeof window !== 'undefined' && window.matchMedia) {
        return window.matchMedia('(prefers-color-scheme: light)').matches;
      }
      return true; // Default to light if unable to detect
    };

    const themeLight = ref(getSystemTheme());
    const navBarShow = ref(true);
    const whId = ref('');
    const wahrehouseName = ref('');
    const namespacePath = ref('');
    const savedSqlQuery = ref(''); // Store last SQL query (deprecated - use sqlTabs)

    // Multi-tab SQL editor state - warehouse-specific
    // Key: warehouseId, Value: array of SqlTab
    const warehouseSqlTabs = ref<Record<string, SqlTab[]>>({});
    // Key: warehouseId, Value: active tab ID for that warehouse
    const warehouseActiveSqlTabId = ref<Record<string, string>>({});

    const serverInfo = reactive<ServerInfo>({
      version: '0.0.0',
      bootstrapped: true,
      'server-id': '00000000-0000-0000-0000-000000000000',
      'default-project-id': '00000000-0000-0000-0000-000000000000',
      'authz-backend': 'allow-all', // Will be updated from server
      'aws-system-identities-enabled': false,
      'azure-system-identities-enabled': false,
      'gcp-system-identities-enabled': false,
      queues: [],
    });

    const projectSelected = reactive<Project>({
      'project-id': '',
      'project-name': 'none',
    });

    const snackbarMsg = reactive<SnackbarMsg>({
      text: '',
      ttl: 0,
      ts: 0,
      type: Type.ERROR,
    });

    const projectList = reactive<Project[]>([]);

    function getTheme(): string {
      return themeLight.value ? 'light' : 'dark';
    }

    function toggleThemeLight() {
      themeLight.value = !themeLight.value;
    }

    function navBarSwitch() {
      navBarShow.value = !navBarShow.value;
    }

    function setServerInfo(serverInfoInput: ServerInfo) {
      // Use the authz-backend from the server directly
      Object.assign(serverInfo, serverInfoInput);
    }

    function getServerInfo() {
      return serverInfo;
    }

    function setProjectSelected(p: Project) {
      Object.assign(projectSelected, p);
    }

    function setProjectList(p: Project[]) {
      Object.assign(projectList, p);
    }

    function setSnackbarMsg(msg: SnackbarMsg) {
      Object.assign(snackbarMsg, msg);
    }

    function getSnackbarMsg() {
      return snackbarMsg;
    }

    function setSavedSqlQuery(query: string) {
      savedSqlQuery.value = query;
    }

    function getSavedSqlQuery() {
      return savedSqlQuery.value;
    }

    // SQL Tabs Management - Warehouse-specific
    function generateTabName(timestamp: number): string {
      const date = new Date(timestamp);
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      const seconds = date.getSeconds().toString().padStart(2, '0');
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

    function createSqlTab(warehouseId: string, content: string = ''): SqlTab {
      const timestamp = Date.now();
      const id = `tab-${timestamp}-${Math.random().toString(36).substr(2, 9)}`;
      const name = generateTabName(timestamp);

      const newTab: SqlTab = {
        id,
        name,
        content,
        createdAt: timestamp,
      };

      // Initialize warehouse tabs array if it doesn't exist
      if (!warehouseSqlTabs.value[warehouseId]) {
        warehouseSqlTabs.value[warehouseId] = [];
      }

      warehouseSqlTabs.value[warehouseId].push(newTab);
      warehouseActiveSqlTabId.value[warehouseId] = id;

      return newTab;
    }

    function addSqlTab(warehouseId: string): SqlTab {
      return createSqlTab(warehouseId, '');
    }

    function removeSqlTab(warehouseId: string, tabId: string) {
      const tabs = warehouseSqlTabs.value[warehouseId];
      if (!tabs) return;

      const index = tabs.findIndex((tab: SqlTab) => tab.id === tabId);
      if (index === -1) return;

      tabs.splice(index, 1);

      // If we removed the active tab, switch to another tab
      if (warehouseActiveSqlTabId.value[warehouseId] === tabId) {
        if (tabs.length > 0) {
          // Switch to the previous tab, or the first one if we removed the first tab
          const newIndex = Math.max(0, index - 1);
          warehouseActiveSqlTabId.value[warehouseId] = tabs[newIndex].id;
        } else {
          // No tabs left, create a new one
          createSqlTab(warehouseId, '');
        }
      }
    }

    function updateSqlTabContent(warehouseId: string, tabId: string, content: string) {
      const tabs = warehouseSqlTabs.value[warehouseId];
      if (!tabs) return;

      const tab = tabs.find((t: SqlTab) => t.id === tabId);
      if (tab) {
        tab.content = content;
      }
    }

    function renameSqlTab(warehouseId: string, tabId: string, newName: string) {
      const tabs = warehouseSqlTabs.value[warehouseId];
      if (!tabs) return;

      const tab = tabs.find((t: SqlTab) => t.id === tabId);
      if (tab && newName.trim()) {
        tab.name = newName.trim();
      }
    }

    function setActiveSqlTab(warehouseId: string, tabId: string) {
      const tabs = warehouseSqlTabs.value[warehouseId];
      if (tabs && tabs.find((t: SqlTab) => t.id === tabId)) {
        warehouseActiveSqlTabId.value[warehouseId] = tabId;
      }
    }

    function getActiveSqlTab(warehouseId: string): SqlTab | undefined {
      const tabs = warehouseSqlTabs.value[warehouseId];
      if (!tabs) return undefined;

      const activeId = warehouseActiveSqlTabId.value[warehouseId];
      return tabs.find((t: SqlTab) => t.id === activeId);
    }

    function getSqlTabs(warehouseId: string): SqlTab[] {
      return warehouseSqlTabs.value[warehouseId] || [];
    }

    function initializeSqlTabs(warehouseId: string) {
      // Initialize warehouse tabs array if it doesn't exist
      if (!warehouseSqlTabs.value[warehouseId]) {
        warehouseSqlTabs.value[warehouseId] = [];
      }

      // Create first tab if none exist for this warehouse
      if (warehouseSqlTabs.value[warehouseId].length === 0) {
        // Migrate old savedSqlQuery if it exists (only for first initialization)
        const initialContent = savedSqlQuery.value || '';
        createSqlTab(warehouseId, initialContent);
      }
    }

    return {
      currentUrl,
      showAppOrNavBar,
      whId,
      wahrehouseName,
      namespacePath,
      themeLight,
      navBarShow,
      savedSqlQuery,
      warehouseSqlTabs,
      warehouseActiveSqlTabId,
      projectList,
      projectSelected,
      snackbarMsg,
      getTheme,
      toggleThemeLight,
      setProjectList,
      navBarSwitch,
      setServerInfo,
      getServerInfo,
      setSnackbarMsg,
      getSnackbarMsg,
      setProjectSelected,
      setSavedSqlQuery,
      getSavedSqlQuery,
      // SQL Tabs
      addSqlTab,
      removeSqlTab,
      updateSqlTabContent,
      renameSqlTab,
      setActiveSqlTab,
      getActiveSqlTab,
      getSqlTabs,
      initializeSqlTabs,
    };
  },
  {
    persistedState: {
      key: 'visual',
      persist: true,
    },
  },
);

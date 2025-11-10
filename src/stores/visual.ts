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

// Warehouse SQL data structure
export interface WarehouseSqlData {
  activeTabId: string;
  tabs: SqlTab[];
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
    const savedSqlQuery = ref(''); // Store last SQL query (deprecated - use warehouseSqlData)

    // Multi-tab SQL editor state - warehouse-specific
    // Key: warehouseId, Value: { activeTabId, tabs[] }
    const warehouseSqlData = ref<Record<string, WarehouseSqlData>>({});

    const serverInfo = reactive<ServerInfo>({
      version: '0.0.0',
      bootstrapped: true,
      'server-id': '00000000-0000-0000-0000-000000000000',
      'default-project-id': '00000000-0000-0000-0000-000000000000',
      'authz-backend': 'allow-all', // Will be updated from server
      'aws-system-identities-enabled': false,
      'azure-system-identities-enabled': false,
      'gcp-system-identities-enabled': false,
      'license-status': {
        valid: false,
        'license-type': '',
        'license-id': null,
        expiration: null,
        error: null,
        audience: null,
        customer: null,
        issuer: null,
      },
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

      // Also add to notifications store if available
      // We use a dynamic import to avoid circular dependencies
      if (typeof window !== 'undefined') {
        // Use setTimeout to avoid potential timing issues during initialization
        setTimeout(async () => {
          try {
            // Try to dynamically import the notification store
            const { useNotificationStore } = await import('./notifications');
            const notificationStore = useNotificationStore();

            notificationStore.addNotification({
              function: msg.function,
              text: msg.text,
              type: msg.type,
            });
          } catch (error) {
            // Silently fail if notification store is not available
            console.debug('Notification store not available:', error);
          }
        }, 0);
      }
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

      // Initialize warehouse data if it doesn't exist
      if (!warehouseSqlData.value[warehouseId]) {
        warehouseSqlData.value[warehouseId] = {
          activeTabId: '',
          tabs: [],
        };
      }

      warehouseSqlData.value[warehouseId].tabs.push(newTab);
      warehouseSqlData.value[warehouseId].activeTabId = id;

      return newTab;
    }

    function addSqlTab(warehouseId: string): SqlTab {
      return createSqlTab(warehouseId, '');
    }

    function removeSqlTab(warehouseId: string, tabId: string) {
      const data = warehouseSqlData.value[warehouseId];
      if (!data) return;

      const index = data.tabs.findIndex((tab: SqlTab) => tab.id === tabId);
      if (index === -1) return;

      data.tabs.splice(index, 1);

      // If we removed the active tab, switch to another tab
      if (data.activeTabId === tabId) {
        if (data.tabs.length > 0) {
          // Switch to the previous tab, or the first one if we removed the first tab
          const newIndex = Math.max(0, index - 1);
          data.activeTabId = data.tabs[newIndex].id;
        } else {
          // No tabs left, create a new one
          createSqlTab(warehouseId, '');
        }
      }
    }

    function updateSqlTabContent(warehouseId: string, tabId: string, content: string) {
      const data = warehouseSqlData.value[warehouseId];
      if (!data) return;

      const tab = data.tabs.find((t: SqlTab) => t.id === tabId);
      if (tab) {
        tab.content = content;
      }
    }

    function renameSqlTab(warehouseId: string, tabId: string, newName: string) {
      const data = warehouseSqlData.value[warehouseId];
      if (!data) return;

      const tab = data.tabs.find((t: SqlTab) => t.id === tabId);
      if (tab && newName.trim()) {
        tab.name = newName.trim();
      }
    }

    function setActiveSqlTab(warehouseId: string, tabId: string) {
      const data = warehouseSqlData.value[warehouseId];
      if (data && data.tabs.find((t: SqlTab) => t.id === tabId)) {
        data.activeTabId = tabId;
      }
    }

    function getActiveSqlTab(warehouseId: string): SqlTab | undefined {
      const data = warehouseSqlData.value[warehouseId];
      if (!data) return undefined;

      return data.tabs.find((t: SqlTab) => t.id === data.activeTabId);
    }

    function getSqlTabs(warehouseId: string): SqlTab[] {
      return warehouseSqlData.value[warehouseId]?.tabs || [];
    }

    function initializeSqlTabs(warehouseId: string) {
      // Initialize warehouse data if it doesn't exist
      if (!warehouseSqlData.value[warehouseId]) {
        warehouseSqlData.value[warehouseId] = {
          activeTabId: '',
          tabs: [],
        };
      }

      // Create first tab if none exist for this warehouse
      if (warehouseSqlData.value[warehouseId].tabs.length === 0) {
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
      warehouseSqlData,
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

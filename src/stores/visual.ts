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

    // Multi-tab SQL editor state
    const sqlTabs = ref<SqlTab[]>([]);
    const activeSqlTabId = ref<string>('');

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

    // SQL Tabs Management
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

    function createSqlTab(content: string = ''): SqlTab {
      const timestamp = Date.now();
      const id = `tab-${timestamp}-${Math.random().toString(36).substr(2, 9)}`;
      const name = generateTabName(timestamp);

      const newTab: SqlTab = {
        id,
        name,
        content,
        createdAt: timestamp,
      };

      sqlTabs.value.push(newTab);
      activeSqlTabId.value = id;

      return newTab;
    }

    function addSqlTab(): SqlTab {
      return createSqlTab('');
    }

    function removeSqlTab(tabId: string) {
      const index = sqlTabs.value.findIndex((tab) => tab.id === tabId);
      if (index === -1) return;

      sqlTabs.value.splice(index, 1);

      // If we removed the active tab, switch to another tab
      if (activeSqlTabId.value === tabId) {
        if (sqlTabs.value.length > 0) {
          // Switch to the previous tab, or the first one if we removed the first tab
          const newIndex = Math.max(0, index - 1);
          activeSqlTabId.value = sqlTabs.value[newIndex].id;
        } else {
          // No tabs left, create a new one
          createSqlTab('');
        }
      }
    }

    function updateSqlTabContent(tabId: string, content: string) {
      const tab = sqlTabs.value.find((t) => t.id === tabId);
      if (tab) {
        tab.content = content;
      }
    }

    function renameSqlTab(tabId: string, newName: string) {
      const tab = sqlTabs.value.find((t) => t.id === tabId);
      if (tab && newName.trim()) {
        tab.name = newName.trim();
      }
    }

    function setActiveSqlTab(tabId: string) {
      if (sqlTabs.value.find((t) => t.id === tabId)) {
        activeSqlTabId.value = tabId;
      }
    }

    function getActiveSqlTab(): SqlTab | undefined {
      return sqlTabs.value.find((t) => t.id === activeSqlTabId.value);
    }

    function getSqlTabs() {
      return sqlTabs.value;
    }

    function initializeSqlTabs() {
      // Create first tab if none exist
      if (sqlTabs.value.length === 0) {
        // Migrate old savedSqlQuery if it exists
        const initialContent = savedSqlQuery.value || '';
        createSqlTab(initialContent);
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
      sqlTabs,
      activeSqlTabId,
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

<template>
  <v-container fluid class="pa-0">
    <!-- ── Top Status Bar ────────────────────────────────────────── -->
    <v-toolbar density="compact" flat color="transparent" class="border-b">
      <v-toolbar-title class="text-subtitle-1 font-weight-bold">
        <v-icon class="mr-1" size="small">mdi-database-cog-outline</v-icon>
        LoQE
        <span class="text-caption text-grey ml-1">Local Query Engine</span>
        <v-chip color="primary" size="x-small" variant="tonal" class="ml-2" label>
          DuckDB WASM
        </v-chip>
      </v-toolbar-title>

      <v-spacer />

      <!-- Status chips -->
      <v-chip v-if="loqe.isInitializing.value" color="info" size="small" class="mr-2">
        <v-icon start size="x-small">mdi-loading mdi-spin</v-icon>
        Initialising…
      </v-chip>

      <v-chip
        v-else-if="loqe.isInitialized.value"
        color="success"
        size="small"
        variant="tonal"
        class="mr-2">
        <v-icon start size="x-small">mdi-check-circle</v-icon>
        Ready
      </v-chip>

      <v-chip v-else color="grey" size="small" variant="tonal" class="mr-2">
        <v-icon start size="x-small">mdi-circle-outline</v-icon>
        Idle
      </v-chip>

      <!-- Live memory usage chip (Chromium only — hidden on Firefox/Safari) -->
      <v-chip
        v-if="currentMemoryMB !== null"
        :color="memoryChipColor"
        size="small"
        variant="tonal"
        class="mr-2">
        <v-icon start size="x-small">mdi-memory</v-icon>
        {{ currentMemoryMB }} MB
        <v-tooltip activator="parent" location="bottom">
          JS heap usage
          <span v-if="heapLimitMB">/ {{ heapLimitMB }} MB limit</span>
          · Storage: In-memory
        </v-tooltip>
      </v-chip>

      <v-chip size="small" variant="tonal" class="mr-2">
        <v-icon start size="x-small">mdi-connection</v-icon>
        Pool {{ poolStats.active }}/{{ poolStats.size }}
        <v-tooltip activator="parent" location="bottom">
          {{ poolStats.active }} active / {{ poolStats.size }} open / {{ poolStats.max }} max
          <span v-if="poolStats.queued">· {{ poolStats.queued }} queued</span>
        </v-tooltip>
      </v-chip>

      <v-btn
        icon
        size="small"
        variant="text"
        :loading="isFreeing"
        @click="handleFreeMemory"
        class="mr-1">
        <v-icon size="small">mdi-broom</v-icon>
        <v-tooltip activator="parent" location="bottom">
          Free RAM — close idle connections, flush caches
        </v-tooltip>
      </v-btn>

      <DuckDBSettingsDialog :on-free-memory="handleFreeMemory" />

      <v-btn icon size="small" variant="text" @click="showResetDialog = true">
        <v-icon size="small">mdi-refresh</v-icon>
        <v-tooltip activator="parent" location="bottom">Reset engine</v-tooltip>
      </v-btn>
    </v-toolbar>

    <!-- ── Main Layout ───────────────────────────────────────────── -->
    <div style="display: flex; height: calc(100vh - 250px)">
      <!-- Left Sidebar -->
      <v-expand-x-transition>
        <div
          v-if="!sidebarCollapsed"
          :style="{ width: sidebarWidth + 'px', minWidth: '200px', maxWidth: '500px' }"
          style="
            height: 100%;
            display: flex;
            flex-direction: column;
            border-right: 1px solid #e0e0e0;
          ">
          <!-- Object Browser Tree (primary content — takes remaining space) -->
          <div style="flex: 1; min-height: 0; overflow: hidden">
            <LoQENavigationTree
              :attached-catalogs="loqe.attachedCatalogs.value"
              @item-selected="handleTreeItemSelected"
              @attach-warehouse="handleAutoAttachWarehouse" />
          </div>

          <v-divider />

          <!-- Collapsible panels below the tree -->
          <div style="max-height: 40%; overflow-y: auto; flex-shrink: 0">
            <v-expansion-panels v-model="openPanels" multiple variant="accordion">
              <!-- ── Extensions Panel ──────────────────────────────── -->
              <v-expansion-panel value="extensions">
                <v-expansion-panel-title class="text-subtitle-2">
                  <v-icon size="small" class="mr-2">mdi-puzzle-outline</v-icon>
                  Extensions
                  <v-spacer />
                  <v-btn
                    icon
                    size="x-small"
                    variant="text"
                    @click.stop="showExtensionDialog = true"
                    class="mr-2">
                    <v-icon size="x-small">mdi-plus</v-icon>
                  </v-btn>
                </v-expansion-panel-title>
                <v-expansion-panel-text>
                  <v-list density="compact" v-if="userExtensions.length">
                    <v-list-item
                      v-for="ext in userExtensions"
                      :key="ext"
                      :title="ext"
                      class="text-caption">
                      <template v-slot:prepend>
                        <v-icon size="x-small" color="success">mdi-check-circle</v-icon>
                      </template>
                      <template v-slot:append>
                        <v-btn
                          icon
                          size="x-small"
                          variant="text"
                          density="compact"
                          @click="handleRemoveExtension(ext)">
                          <v-icon size="x-small">mdi-close</v-icon>
                        </v-btn>
                      </template>
                    </v-list-item>
                  </v-list>
                  <div v-else class="text-caption text-grey pa-2">
                    No custom extensions installed
                  </div>
                </v-expansion-panel-text>
              </v-expansion-panel>

              <!-- ── History Panel ─────────────────────────────────── -->
              <v-expansion-panel value="history">
                <v-expansion-panel-title class="text-subtitle-2">
                  <v-icon size="small" class="mr-2">mdi-history</v-icon>
                  History
                  <v-spacer />
                  <v-btn
                    v-if="loqe.store.queryHistory.length"
                    icon
                    size="x-small"
                    variant="text"
                    @click.stop="loqe.store.clearHistory()"
                    class="mr-2">
                    <v-icon size="x-small">mdi-delete-outline</v-icon>
                  </v-btn>
                </v-expansion-panel-title>
                <v-expansion-panel-text>
                  <v-list density="compact" v-if="loqe.store.queryHistory.length">
                    <v-list-item
                      v-for="entry in loqe.store.queryHistory.slice(0, 50)"
                      :key="entry.id"
                      @click="loadFromHistory(entry.sql)"
                      class="text-caption"
                      style="cursor: pointer">
                      <template v-slot:prepend>
                        <v-icon size="x-small" :color="entry.error ? 'error' : 'success'">
                          {{ entry.error ? 'mdi-close-circle' : 'mdi-check-circle' }}
                        </v-icon>
                      </template>
                      <v-list-item-title class="text-caption font-monospace text-truncate">
                        {{ entry.sql.substring(0, 80) }}{{ entry.sql.length > 80 ? '…' : '' }}
                      </v-list-item-title>
                      <v-list-item-subtitle class="text-caption">
                        {{ entry.rowCount }} rows · {{ entry.durationMs.toFixed(0) }}ms
                      </v-list-item-subtitle>
                    </v-list-item>
                  </v-list>
                  <div v-else class="text-caption text-grey pa-2">No queries yet</div>
                  <div class="text-caption text-grey pa-2 pt-0">
                    History keeps the last 200 queries.
                  </div>
                </v-expansion-panel-text>
              </v-expansion-panel>
            </v-expansion-panels>
          </div>
        </div>
      </v-expand-x-transition>
      <!-- Resize Divider -->
      <div
        v-if="!sidebarCollapsed"
        @mousedown="startSidebarResize"
        style="
          width: 5px;
          cursor: col-resize;
          user-select: none;
          flex-shrink: 0;
          transition: background 0.2s;
        "
        :style="{ background: dividerHover || isResizing ? '#2196F3' : '#e0e0e0' }"
        @mouseenter="dividerHover = true"
        @mouseleave="dividerHover = false" />

      <!-- Right: SQL Editor + Results -->
      <div style="flex: 1; height: 100%; overflow-y: auto; min-width: 0">
        <v-container fluid>
          <v-row>
            <v-col cols="12">
              <v-card flat>
                <v-card-text class="pa-3">
                  <!-- Collapse toggle + info alert -->
                  <div class="d-flex align-center mb-3">
                    <v-btn
                      icon
                      size="default"
                      variant="tonal"
                      color="primary"
                      @click="sidebarCollapsed = !sidebarCollapsed"
                      class="mr-3">
                      <v-icon>
                        {{ sidebarCollapsed ? 'mdi-menu' : 'mdi-menu-open' }}
                      </v-icon>
                    </v-btn>
                    <span class="text-subtitle-2">SQL Query</span>
                  </div>

                  <!-- Not initialised hint -->
                  <v-alert
                    v-if="!loqe.isInitialized.value && !loqe.isInitializing.value"
                    type="info"
                    variant="tonal"
                    class="mb-3">
                    <div class="text-body-2">
                      Press
                      <strong>Execute</strong>
                      or call
                      <code>initialize()</code>
                      to start the LoQE engine.
                    </div>
                  </v-alert>

                  <!-- SQL Tabs -->
                  <v-tabs
                    v-model="activeTabIndex"
                    color="primary"
                    class="mb-2"
                    density="compact"
                    show-arrows>
                    <v-tab
                      v-for="(tab, index) in currentLoqeTabs"
                      :key="tab.id"
                      :value="index"
                      @click="handleTabClick(tab.id)">
                      <span
                        class="text-caption"
                        @dblclick.stop="startRenameTab(tab.id, tab.name)"
                        style="cursor: pointer">
                        {{ tab.name }}
                      </span>
                      <v-icon size="x-small" class="ml-1" @click.stop="handleCloseTab(tab.id)">
                        mdi-close
                      </v-icon>
                    </v-tab>
                    <v-btn icon size="x-small" variant="text" class="ml-2" @click="handleAddTab">
                      <v-icon>mdi-plus</v-icon>
                    </v-btn>
                  </v-tabs>

                  <!-- Tab actions toolbar -->
                  <div
                    class="d-flex align-center ga-1 py-1 px-1"
                    style="border-bottom: 1px solid rgba(128, 128, 128, 0.15)">
                    <v-btn
                      variant="text"
                      size="x-small"
                      @click="formatSQL"
                      :disabled="loqe.isInitializing.value">
                      <v-icon start size="small">mdi-auto-fix</v-icon>
                      Format
                    </v-btn>
                    <v-btn
                      variant="text"
                      size="x-small"
                      @click="copySQL"
                      :disabled="loqe.isInitializing.value">
                      <v-icon start size="small">mdi-content-copy</v-icon>
                      Copy
                    </v-btn>
                    <v-btn
                      variant="text"
                      size="x-small"
                      @click="sqlEditorRef?.clearContent()"
                      :disabled="loqe.isInitializing.value">
                      <v-icon start size="small">mdi-eraser</v-icon>
                      Clear
                    </v-btn>
                    <v-divider vertical class="mx-1" style="height: 20px; align-self: center" />
                    <v-btn
                      variant="text"
                      size="x-small"
                      @click="
                        startRenameTab(
                          currentLoqeTabs[activeTabIndex]?.id,
                          currentLoqeTabs[activeTabIndex]?.name,
                        )
                      ">
                      <v-icon start size="small">mdi-pencil</v-icon>
                      Rename
                    </v-btn>
                    <v-btn
                      variant="text"
                      size="x-small"
                      @click="handleCloseOtherTabs(currentLoqeTabs[activeTabIndex]?.id)"
                      :disabled="currentLoqeTabs.length <= 1">
                      <v-icon start size="small">mdi-close-box-multiple</v-icon>
                      Close Others
                    </v-btn>
                    <v-spacer />
                    <v-btn
                      variant="flat"
                      size="x-small"
                      color="primary"
                      @click="executeQuery"
                      :loading="loqe.isQuerying.value"
                      :disabled="!sqlQuery.trim() || loqe.isInitializing.value">
                      <v-icon start size="small">mdi-play</v-icon>
                      {{ hasSelection ? 'Run Selection' : 'Run' }}
                    </v-btn>
                  </div>

                  <!-- SQL Editor — fun loader while engine initialises -->
                  <div
                    v-if="loqe.isInitializing.value"
                    class="loqe-skeleton-editor d-flex flex-column align-center justify-center"
                    :style="{ minHeight: editorHeight + 'vh', overflow: 'hidden' }">
                    <l-helix size="45" speed="2.5" color="#2196F3"></l-helix>
                    <span class="text-caption text-medium-emphasis mt-4">
                      Initialising DuckDB engine…
                    </span>
                  </div>
                  <SqlEditor
                    v-else
                    ref="sqlEditorRef"
                    v-model="sqlQuery"
                    placeholder="SELECT 42 AS answer;"
                    :disabled="loqe.isQuerying.value"
                    :schema="editorSchema"
                    :fetch-completions="lazyFetchCompletions"
                    :min-height="editorHeight + 'vh'"
                    @click="updateCursorPosition"
                    @keyup="updateCursorPosition" />

                  <!-- Editor resize handle -->
                  <div
                    @mousedown="startEditorResize"
                    style="
                      height: 5px;
                      cursor: row-resize;
                      user-select: none;
                      transition: background 0.2s;
                    "
                    :style="{
                      background: editorResizeHover || isResizingEditor ? '#2196F3' : 'transparent',
                    }"
                    @mouseenter="editorResizeHover = true"
                    @mouseleave="editorResizeHover = false">
                    <div
                      style="
                        text-align: center;
                        font-size: 10px;
                        color: #999;
                        line-height: 5px;
                        user-select: none;
                      ">
                      ⋮
                    </div>
                  </div>

                  <!-- Results bar -->
                  <div v-if="hasAnyResults" class="d-flex align-center ga-2 mt-2 mb-2">
                    <v-chip
                      v-if="activeResult"
                      size="small"
                      variant="tonal"
                      :color="activeResult.truncated ? 'warning' : undefined">
                      <span v-if="activeResult.truncated">
                        {{ activeResult.rowCount.toLocaleString() }} of
                        {{ activeResult.totalRowCount.toLocaleString() }} rows
                      </span>
                      <span v-else>{{ activeResult.rowCount }} rows</span>
                      · {{ activeResult.executionTimeMs.toFixed(0) }}ms
                    </v-chip>
                    <v-chip v-else-if="activeError" size="small" variant="tonal" color="error">
                      Error
                    </v-chip>
                    <v-spacer />
                    <v-btn
                      variant="text"
                      size="x-small"
                      :disabled="!hasAnyResults"
                      @click="dropResults">
                      <v-icon start size="small">mdi-table-remove</v-icon>
                      Drop
                    </v-btn>
                    <v-btn
                      variant="text"
                      size="x-small"
                      :disabled="!activeResult"
                      @click="downloadCSV">
                      <v-icon start size="small">mdi-download</v-icon>
                      CSV
                    </v-btn>
                  </div>

                  <!-- Memory Warning -->
                  <v-alert
                    v-if="memoryWarning"
                    type="warning"
                    icon="mdi-memory"
                    closable
                    @click:close="memoryWarning = null"
                    class="mb-3"
                    density="compact">
                    {{ memoryWarning }}
                  </v-alert>

                  <!-- Error (for active result tab) -->
                  <v-alert
                    v-if="activeError"
                    type="error"
                    icon="mdi-bug"
                    closable
                    @click:close="queryResults[activeResultTab].error = null"
                    class="mb-3">
                    <div class="font-weight-bold">Query Error</div>
                    <pre class="text-caption mt-1" style="white-space: pre-wrap">{{
                      activeError
                    }}</pre>
                  </v-alert>

                  <!-- Result Tabs (only shown when multiple statements) -->
                  <v-tabs
                    v-if="queryResults.length > 1"
                    v-model="activeResultTab"
                    density="compact"
                    class="mb-2"
                    height="32">
                    <v-tab
                      v-for="(entry, idx) in queryResults"
                      :key="idx"
                      :value="idx"
                      size="small"
                      class="text-caption">
                      <v-icon v-if="entry.error" size="x-small" color="error" class="mr-1">
                        mdi-alert-circle
                      </v-icon>
                      {{ entry.label }}
                    </v-tab>
                  </v-tabs>

                  <!-- Results Table -->
                  <v-card v-if="activeResult" variant="outlined">
                    <v-card-text class="pa-0" style="overflow-x: auto">
                      <!-- Truncation warning -->
                      <v-alert
                        v-if="activeResult.truncated"
                        type="warning"
                        variant="tonal"
                        density="compact"
                        class="ma-2">
                        Result truncated to
                        {{ activeResult.rowCount.toLocaleString() }} rows (query produced
                        {{ activeResult.totalRowCount.toLocaleString() }} rows). Add a
                        <code>LIMIT</code>
                        clause to your query to control the result size.
                      </v-alert>
                      <v-data-table-virtual
                        :headers="resultHeaders"
                        :items="resultItems"
                        :height="tableHeight"
                        density="compact"
                        fixed-header
                        class="text-caption loqe-result-table"
                        item-height="28" />
                    </v-card-text>

                    <!-- Resize handle -->
                    <div
                      @mousedown="startTableResize"
                      style="
                        height: 5px;
                        cursor: row-resize;
                        user-select: none;
                        transition: background 0.2s;
                        border-top: 1px solid #e0e0e0;
                      "
                      :style="{
                        background: tableResizeHover || isResizingTable ? '#2196F3' : 'transparent',
                      }"
                      @mouseenter="tableResizeHover = true"
                      @mouseleave="tableResizeHover = false">
                      <div
                        style="
                          text-align: center;
                          font-size: 10px;
                          color: #999;
                          line-height: 5px;
                          user-select: none;
                        ">
                        ⋮
                      </div>
                    </div>
                  </v-card>

                  <!-- Query running state -->
                  <v-card
                    v-if="loqe.isQuerying.value"
                    variant="outlined"
                    class="d-flex flex-column align-center justify-center pa-8">
                    <l-hourglass size="40" speed="1.75" color="#2196F3"></l-hourglass>
                    <span class="text-caption text-medium-emphasis mt-4">Running query…</span>
                  </v-card>

                  <!-- Empty state -->
                  <v-card
                    v-else-if="loqe.isInitialized.value && !loqe.isQuerying.value && !hasAnyResults"
                    variant="outlined"
                    class="text-center pa-8">
                    <v-icon size="64" color="grey-lighten-1">mdi-database-off-outline</v-icon>
                    <div class="text-h6 mt-4 text-grey">No Results</div>
                    <div class="text-body-2 text-grey">Execute a query to see results here</div>
                  </v-card>
                </v-card-text>
              </v-card>
            </v-col>
          </v-row>
        </v-container>
      </div>
    </div>

    <!-- ── Install Extension Dialog ──────────────────────────────── -->
    <v-dialog v-model="showExtensionDialog" max-width="450">
      <v-card>
        <v-card-title class="d-flex align-center">
          <v-icon color="primary" class="mr-2">mdi-puzzle-plus-outline</v-icon>
          Install Extension
        </v-card-title>
        <v-card-text>
          <v-text-field
            v-model="extensionName"
            label="Extension Name"
            variant="outlined"
            density="comfortable"
            placeholder="e.g. spatial, json, parquet"
            hint="Will be fetched from DuckDB's extension repository"
            persistent-hint
            @keyup.enter="handleInstallExtension" />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showExtensionDialog = false">Cancel</v-btn>
          <v-btn
            color="primary"
            variant="elevated"
            :disabled="!extensionName.trim()"
            :loading="isInstallingExt"
            @click="handleInstallExtension">
            Install &amp; Load
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- ── Reset Confirmation Dialog ─────────────────────────────── -->
    <v-dialog v-model="showResetDialog" max-width="450">
      <v-card>
        <v-card-title class="d-flex align-center">
          <v-icon color="warning" class="mr-2">mdi-alert</v-icon>
          Reset LoQE Engine?
        </v-card-title>
        <v-card-text>
          <p>
            This will destroy the current DuckDB instance, detach catalogs, and remove query
            history.
          </p>
          <p class="text-body-2 text-grey mb-0">
            The engine will be re-initialised on the next query.
          </p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showResetDialog = false">Cancel</v-btn>
          <v-btn color="error" variant="elevated" @click="handleReset">Reset</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- ── Close Tab Confirmation Dialog ──────────────────────────── -->
    <v-dialog v-model="showCloseTabDialog" max-width="500">
      <v-card>
        <v-card-title class="d-flex align-center">
          <v-icon color="warning" class="mr-2">mdi-alert</v-icon>
          Close Query Tab?
        </v-card-title>
        <v-card-text>
          <p class="mb-2">Are you sure you want to close "{{ tabToClose?.name }}"?</p>
          <p class="text-body-2 text-grey mb-0">
            The SQL query in this tab will be permanently deleted and cannot be recovered.
          </p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="cancelCloseTab">Cancel</v-btn>
          <v-btn color="error" variant="elevated" @click="confirmCloseTab">Delete Tab</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- ── Rename Tab Dialog ─────────────────────────────────────── -->
    <v-dialog v-model="showRenameDialog" max-width="500">
      <v-card>
        <v-card-title class="d-flex align-center">
          <v-icon color="primary" class="mr-2">mdi-pencil</v-icon>
          Rename Query
        </v-card-title>
        <v-card-text>
          <v-text-field
            v-model="newTabName"
            label="Query Name"
            autofocus
            @keyup.enter="confirmRename"
            @keyup.esc="cancelRename"
            variant="outlined"
            density="comfortable"
            hint="Press Enter to save, Esc to cancel"
            persistent-hint
            :error="!!renameError"
            :error-messages="renameError" />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="cancelRename">Cancel</v-btn>
          <v-btn
            color="primary"
            variant="elevated"
            @click="confirmRename"
            :disabled="!newTabName.trim()">
            Rename
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- ── Close Other Tabs Confirmation Dialog ──────────────────── -->
    <v-dialog v-model="showCloseOtherTabsDialog" max-width="500">
      <v-card>
        <v-card-title class="d-flex align-center">
          <v-icon color="warning" class="mr-2">mdi-alert</v-icon>
          Close Other Tabs?
        </v-card-title>
        <v-card-text>
          <p class="mb-2">
            Are you sure you want to close all tabs except "{{ tabToKeep?.name }}"?
          </p>
          <p class="text-body-2 text-grey mb-0">
            {{ otherTabsCount }} tab{{ otherTabsCount !== 1 ? 's' : '' }} will be permanently
            deleted and cannot be recovered.
          </p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="cancelCloseOtherTabs">Cancel</v-btn>
          <v-btn color="error" variant="elevated" @click="confirmCloseOtherTabs">
            Close Other Tabs
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script lang="ts" setup>
import { ref, onMounted, onBeforeUnmount, inject, computed, watch } from 'vue';
import { useLoQE } from '../composables/useLoQE';
import { useUserStore } from '../stores/user';
import { useVisualStore } from '../stores/visual';
import { useCsvDownload } from '../composables/useCsvDownload';
import { useDuckDBSettingsStore } from '../stores/duckdbSettings';
import { useLoQEStore } from '../stores/loqe';
import { Type } from '../common/enums';
import type { LoQEQueryResult } from '../composables/loqe/types';
import SqlEditor from './SqlEditor.vue';
import LoQENavigationTree from './LoQENavigationTree.vue';
import DuckDBSettingsDialog from './DuckDBSettingsDialog.vue';
import { helix, hourglass } from 'ldrs';

helix.register();
hourglass.register();

// ── Props ─────────────────────────────────────────────────────────────

const props = withDefaults(
  defineProps<{
    /** Base URL prefix for DuckDB WASM assets. */
    baseUrlPrefix?: string;
    /** Max pooled connections. */
    maxConnections?: number;
    /** Auto-initialise the engine on mount. */
    autoInit?: boolean;
  }>(),
  {
    baseUrlPrefix: '',
    maxConnections: 4,
    autoInit: false,
  },
);

// ── Injections ────────────────────────────────────────────────────────

const appConfig = inject<any>('appConfig', { enabledAuthentication: false });
const userStore = useUserStore();
const visualStore = useVisualStore();
const csvDownload = useCsvDownload();

// ── LoQE composable ──────────────────────────────────────────────────

const loqe = useLoQE({
  baseUrlPrefix: props.baseUrlPrefix || appConfig.baseUrlPrefix || '',
  maxConnections: props.maxConnections,
});

// ── Local state ───────────────────────────────────────────────────────

// Use a fixed key for LoQE SQL tabs in the visual store
const LOQE_TAB_KEY = '__loqe__';

const sqlQuery = ref('');
const sqlEditorRef = ref<InstanceType<typeof SqlEditor> | null>(null);
const cursorPosition = ref(0);
const hasSelection = ref(false);
const editorSchema = ref<Record<string, any> | undefined>(undefined);

/** Stable reference for the lazy completions callback */
const lazyFetchCompletions = (qualifier: string) => loqe.fetchCompletions(qualifier);

// SQL Tabs
const activeTabIndex = ref(0);
const showCloseTabDialog = ref(false);
const tabToClose = ref<{ id: string; name: string } | null>(null);
const showRenameDialog = ref(false);
const tabToRename = ref<string | null>(null);
const newTabName = ref('');
const renameError = ref('');
const showCloseOtherTabsDialog = ref(false);
const tabToKeep = ref<{ id: string; name: string } | null>(null);
const lastExecutedTabName = ref('');

// Multi-result state (one entry per statement when running multiple queries)
interface ResultEntry {
  label: string;
  result: LoQEQueryResult | null;
  error: string | null;
  /** Character offset of the statement in the source text (for highlighting). */
  from: number;
  to: number;
}
const queryResults = ref<ResultEntry[]>([]);
const activeResultTab = ref(0);

/** The currently visible result (driven by the active tab). */
const activeResult = computed<LoQEQueryResult | null>(
  () => queryResults.value[activeResultTab.value]?.result ?? null,
);
const activeError = computed<string | null>(
  () => queryResults.value[activeResultTab.value]?.error ?? null,
);
const hasAnyResults = computed(() => queryResults.value.length > 0);

// Highlight the corresponding statement in the editor when the user switches result tabs
watch(activeResultTab, (idx) => {
  const entry = queryResults.value[idx];
  if (entry && queryResults.value.length > 1) {
    sqlEditorRef.value?.setSelection?.(entry.from, entry.to);
  }
});

// Sidebar
const sidebarCollapsed = ref(false);
const sidebarWidth = ref(280);
const dividerHover = ref(false);
const isResizing = ref(false);

// SQL editor resize
const editorHeight = ref(30);
const isResizingEditor = ref(false);
const editorResizeHover = ref(false);

// Result table resize
const tableHeight = ref(400);
const isResizingTable = ref(false);
const tableResizeHover = ref(false);

// Expansion panels
const openPanels = ref<string[]>([]);

// Dialogs
const showExtensionDialog = ref(false);
const showResetDialog = ref(false);

// Extension form
const extensionName = ref('');
const isInstallingExt = ref(false);

// Extensions list — driven by the persisted Pinia store (user-installed only)
const loqeStore = useLoQEStore();
const userExtensions = computed(() => loqeStore.installedExtensions);

// Memory monitoring
const duckdbSettings = useDuckDBSettingsStore();
const memoryWarning = ref<string | null>(null);
const currentMemoryMB = ref<number | null>(duckdbSettings.getMemoryUsageMB());
const heapLimitMB = ref<number | null>(duckdbSettings.getMemoryLimitMB());
const isFreeing = ref(false);
let memoryPollTimer: ReturnType<typeof setInterval> | null = null;

// Pool stats — refreshed on the same interval as memory because
// ConnectionPool is a plain class (not reactive to Vue).
const poolStats = ref({ size: 0, active: 0, available: 0, queued: 0, max: 0 });

const memoryChipColor = computed(() => {
  if (currentMemoryMB.value === null) return undefined;
  if (duckdbSettings.memoryLimitMB > 0 && currentMemoryMB.value >= duckdbSettings.memoryLimitMB)
    return 'error';
  if (
    duckdbSettings.memoryWarningThresholdMB > 0 &&
    currentMemoryMB.value >= duckdbSettings.memoryWarningThresholdMB
  )
    return 'warning';
  return 'success';
});

function refreshMemory() {
  currentMemoryMB.value = duckdbSettings.getMemoryUsageMB();
  heapLimitMB.value = duckdbSettings.getMemoryLimitMB();
  try {
    poolStats.value = {
      size: loqe.engine.pool.size,
      active: loqe.engine.pool.activeCount,
      available: loqe.engine.pool.availableCount,
      queued: loqe.engine.pool.queuedCount,
      max: loqe.engine.pool.maxPoolSize,
    };
  } catch {
    // Engine not initialised yet — keep previous values
  }
}

// ── Tab computed ──────────────────────────────────────────────────────

const currentLoqeTabs = computed(() => visualStore.getSqlTabs(LOQE_TAB_KEY));

const otherTabsCount = computed(() => {
  if (!tabToKeep.value) return 0;
  return currentLoqeTabs.value.length - 1;
});

// ── Tab management ────────────────────────────────────────────────────

function handleAddTab() {
  visualStore.addSqlTab(LOQE_TAB_KEY);
  activeTabIndex.value = currentLoqeTabs.value.length - 1;
  sqlQuery.value = '';
}

function handleCloseTab(tabId: string) {
  const tab = currentLoqeTabs.value.find((t) => t.id === tabId);
  if (!tab) return;
  tabToClose.value = { id: tab.id, name: tab.name };
  showCloseTabDialog.value = true;
}

function cancelCloseTab() {
  showCloseTabDialog.value = false;
  tabToClose.value = null;
}

function confirmCloseTab() {
  if (!tabToClose.value) return;
  visualStore.removeSqlTab(LOQE_TAB_KEY, tabToClose.value.id);
  const activeTab = visualStore.getActiveSqlTab(LOQE_TAB_KEY);
  if (activeTab) {
    activeTabIndex.value = currentLoqeTabs.value.findIndex((t) => t.id === activeTab.id);
    sqlQuery.value = activeTab.content;
  }
  showCloseTabDialog.value = false;
  tabToClose.value = null;
}

function startRenameTab(tabId: string, currentName: string) {
  tabToRename.value = tabId;
  newTabName.value = currentName;
  renameError.value = '';
  showRenameDialog.value = true;
}

function cancelRename() {
  showRenameDialog.value = false;
  tabToRename.value = null;
  newTabName.value = '';
  renameError.value = '';
}

function confirmRename() {
  if (!tabToRename.value || !newTabName.value.trim()) return;
  const isDuplicate = currentLoqeTabs.value.some(
    (tab) => tab.id !== tabToRename.value && tab.name === newTabName.value.trim(),
  );
  if (isDuplicate) {
    renameError.value = `A query with the name "${newTabName.value.trim()}" already exists. Please choose a different name.`;
    return;
  }
  visualStore.renameSqlTab(LOQE_TAB_KEY, tabToRename.value, newTabName.value);
  showRenameDialog.value = false;
  tabToRename.value = null;
  newTabName.value = '';
  renameError.value = '';
}

function handleCloseOtherTabs(tabId: string) {
  const tab = currentLoqeTabs.value.find((t) => t.id === tabId);
  if (!tab) return;
  tabToKeep.value = { id: tab.id, name: tab.name };
  showCloseOtherTabsDialog.value = true;
}

function cancelCloseOtherTabs() {
  showCloseOtherTabsDialog.value = false;
  tabToKeep.value = null;
}

function confirmCloseOtherTabs() {
  if (!tabToKeep.value) return;
  const tabsToClose = currentLoqeTabs.value.filter((t) => t.id !== tabToKeep.value!.id);
  tabsToClose.forEach((tab) => {
    visualStore.removeSqlTab(LOQE_TAB_KEY, tab.id);
  });
  visualStore.setActiveSqlTab(LOQE_TAB_KEY, tabToKeep.value.id);
  const activeTab = visualStore.getActiveSqlTab(LOQE_TAB_KEY);
  if (activeTab) {
    sqlQuery.value = activeTab.content;
    activeTabIndex.value = 0;
  }
  showCloseOtherTabsDialog.value = false;
  tabToKeep.value = null;
}

function handleTabClick(tabId: string) {
  // Save current tab's content before switching
  const currentTab = visualStore.getActiveSqlTab(LOQE_TAB_KEY);
  if (currentTab) {
    visualStore.updateSqlTabContent(LOQE_TAB_KEY, currentTab.id, sqlQuery.value);
  }
  // Switch to new tab
  visualStore.setActiveSqlTab(LOQE_TAB_KEY, tabId);
  const newTab = visualStore.getActiveSqlTab(LOQE_TAB_KEY);
  if (newTab) {
    sqlQuery.value = newTab.content;
    activeTabIndex.value = currentLoqeTabs.value.findIndex((t) => t.id === tabId);
  }
}

// Auto-save sqlQuery changes to active tab
watch(sqlQuery, (newValue) => {
  const activeTab = visualStore.getActiveSqlTab(LOQE_TAB_KEY);
  if (activeTab) {
    visualStore.updateSqlTabContent(LOQE_TAB_KEY, activeTab.id, newValue);
  }
});

// Seed top-level catalog names into the schema whenever catalogs change
// so typing "catalog" shows in name completions. Everything else is lazy.
watch(
  () => loqe.attachedCatalogs.value,
  (catalogs) => {
    if (!catalogs || catalogs.length === 0) return;
    const schema: Record<string, any> = {};
    for (const cat of catalogs) {
      schema[cat.catalogName] = {};
    }
    editorSchema.value = schema;
  },
  { immediate: true },
);

// ── Handlers ──────────────────────────────────────────────────────────

async function executeQuery() {
  // If there is a selection in the editor, run only the selected text
  const selectedText = sqlEditorRef.value?.getSelectedText?.() ?? '';
  const textToRun = selectedText.trim() || sqlQuery.value.trim();
  if (!textToRun) return;

  // Track which tab executed this query
  const activeTab = visualStore.getActiveSqlTab(LOQE_TAB_KEY);
  if (activeTab) {
    lastExecutedTabName.value = activeTab.name;
  }

  // Memory warning check
  memoryWarning.value = null;
  const memCheck = duckdbSettings.checkMemory();
  if (!memCheck.ok && memCheck.reason === 'warning') {
    memoryWarning.value = memCheck.message;
  }

  // Clear previous results immediately
  queryResults.value = [];
  activeResultTab.value = 0;
  loqe.lastResult.value = null;
  loqe.error.value = null;

  // Split input into individual statements, keeping track of positions
  // so we can highlight the relevant statement when the user clicks a tab.
  const sourceText = selectedText || sqlQuery.value;
  // const selectionOffset = selectedText ? sourceText.indexOf(textToRun) : 0;
  const statements: { sql: string; from: number; to: number }[] = [];
  let cursor = 0;
  for (const part of sourceText.split(';')) {
    const trimmed = part.trim();
    if (trimmed.length > 0) {
      const start = sourceText.indexOf(trimmed, cursor);
      statements.push({ sql: trimmed, from: start, to: start + trimmed.length });
    }
    cursor += part.length + 1; // +1 for the semicolon
  }

  for (let i = 0; i < statements.length; i++) {
    const { sql, from, to } = statements[i];
    const label = statements.length === 1 ? 'Result' : `Query ${i + 1}`;
    try {
      const result = await loqe.query(sql);
      queryResults.value.push({ label, result, error: null, from, to });
    } catch {
      queryResults.value.push({
        label,
        result: null,
        error: loqe.error.value,
        from,
        to,
      });
      // Reset loqe.error so it doesn't bleed into next statement
      loqe.error.value = null;
    }
  }

  // Show the last tab with results (or the last error tab)
  const lastSuccessIdx = queryResults.value.findLastIndex((r) => r.result !== null);
  activeResultTab.value = lastSuccessIdx >= 0 ? lastSuccessIdx : queryResults.value.length - 1;

  refreshMemory();
}

// ── Tree integration ──────────────────────────────────────────────────

function handleTreeItemSelected(item: {
  type: string;
  warehouseId: string;
  warehouseName: string;
  namespaceId?: string;
  name: string;
}) {
  let textToInsert = '';

  if (item.type === 'field') {
    textToInsert = item.name;
  } else if (
    (item.type === 'table' || item.type === 'view') &&
    item.warehouseName &&
    item.namespaceId
  ) {
    textToInsert = `"${item.warehouseName}"."${item.namespaceId}"."${item.name}"`;
  }

  if (textToInsert) {
    if (!sqlQuery.value) {
      sqlQuery.value = textToInsert;
    } else {
      const before = sqlQuery.value.substring(0, cursorPosition.value);
      const after = sqlQuery.value.substring(cursorPosition.value);
      sqlQuery.value = before + textToInsert + after;
      cursorPosition.value += textToInsert.length;
    }
  }
}

async function handleFreeMemory() {
  isFreeing.value = true;
  try {
    // loqe.freeMemory() clears lastResult + closes idle connections + CHECKPOINT + shrink_memory
    const result = await loqe.freeMemory();
    refreshMemory();
    return result;
  } finally {
    isFreeing.value = false;
  }
}

async function handleAutoAttachWarehouse(wh: {
  warehouseId: string;
  warehouseName: string;
  catalogUrl: string;
}) {
  // Skip if already attached (live engine) or already persisted (being restored)
  if (loqe.attachedCatalogs.value.some((c) => c.catalogName === wh.warehouseName)) return;
  if (loqe.store.attachedCatalogs[wh.warehouseName]) return;

  try {
    const token = appConfig.enabledAuthentication ? userStore.user?.access_token || '' : '';
    const projectId = visualStore.projectSelected['project-id'] || undefined;
    await loqe.attachCatalog({
      catalogName: wh.warehouseName,
      restUri: wh.catalogUrl,
      accessToken: token,
      projectId,
    });
    // Clear completion caches so autocomplete picks up new catalog
    loqe.clearCompletionCache();
  } catch (e) {
    console.warn('[LoQE] Auto-attach failed for', wh.warehouseName, e);
    // Non-fatal — user can still manually attach via dialog
  }
}

function updateCursorPosition() {
  if (sqlEditorRef.value && typeof sqlEditorRef.value.getCursorPosition === 'function') {
    cursorPosition.value = sqlEditorRef.value.getCursorPosition();
    hasSelection.value = !!(sqlEditorRef.value.getSelectedText?.() ?? '').length;
  }
}

async function handleInstallExtension() {
  if (!extensionName.value.trim()) return;
  isInstallingExt.value = true;
  try {
    await loqe.installExtension(extensionName.value.trim());
    extensionName.value = '';
    showExtensionDialog.value = false;
  } catch (e) {
    loqe.error.value = e instanceof Error ? e.message : String(e);
  } finally {
    isInstallingExt.value = false;
  }
}

function handleRemoveExtension(name: string) {
  loqe.removeExtension(name);
}

async function handleReset() {
  showResetDialog.value = false;
  await loqe.resetDatabase();
  sqlQuery.value = '';
}

function loadFromHistory(sql: string) {
  sqlQuery.value = sql;
}

async function copySQL() {
  if (!sqlQuery.value.trim()) return;
  try {
    await navigator.clipboard.writeText(sqlQuery.value);
  } catch {
    // Fallback for insecure contexts
    const ta = document.createElement('textarea');
    ta.value = sqlQuery.value;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
  visualStore.setSnackbarMsg({
    function: 'copySQL',
    text: 'SQL copied to clipboard',
    ttl: 2000,
    ts: Date.now(),
    type: Type.SUCCESS,
  });
}

function dropResults() {
  queryResults.value = [];
  activeResultTab.value = 0;
  loqe.lastResult.value = null;
  loqe.error.value = null;
}

function formatSQL() {
  sqlEditorRef.value?.formatContent();
}

function downloadCSV() {
  csvDownload.downloadCSV(activeResult.value, { baseFilename: 'loqe_results' });
}

function formatCell(value: any): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// ── Virtual table data ────────────────────────────────────────────────

/** Column headers for v-data-table-virtual */
const resultHeaders = computed(() => {
  const result = activeResult.value;
  if (!result) return [];
  return result.columns.map((col) => ({
    title: col,
    key: col,
    sortable: false,
  }));
});

/** Row items as objects keyed by column name (lazy — only built once per result) */
const resultItems = computed(() => {
  const result = activeResult.value;
  if (!result) return [];
  const cols = result.columns;
  return result.rows.map((row) => {
    const obj: Record<string, string> = {};
    for (let i = 0; i < cols.length; i++) {
      obj[cols[i]] = formatCell(row[i]);
    }
    return obj;
  });
});

// ── Resize handlers ───────────────────────────────────────────────────

function startSidebarResize(e: MouseEvent) {
  isResizing.value = true;
  const startX = e.clientX;
  const startW = sidebarWidth.value;

  const onMove = (ev: MouseEvent) => {
    sidebarWidth.value = Math.max(200, Math.min(500, startW + ev.clientX - startX));
  };
  const onUp = () => {
    isResizing.value = false;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
}

function startEditorResize(e: MouseEvent) {
  isResizingEditor.value = true;
  const startY = e.clientY;
  const startH = editorHeight.value;

  const onMove = (ev: MouseEvent) => {
    const deltaVh = ((ev.clientY - startY) / window.innerHeight) * 100;
    editorHeight.value = Math.max(10, Math.min(60, startH + deltaVh));
  };
  const onUp = () => {
    isResizingEditor.value = false;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  document.body.style.cursor = 'row-resize';
  document.body.style.userSelect = 'none';
}

function startTableResize(e: MouseEvent) {
  isResizingTable.value = true;
  const startY = e.clientY;
  const startH = tableHeight.value;

  const onMove = (ev: MouseEvent) => {
    tableHeight.value = Math.max(150, Math.min(800, startH + ev.clientY - startY));
  };
  const onUp = () => {
    isResizingTable.value = false;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  document.body.style.cursor = 'row-resize';
  document.body.style.userSelect = 'none';
}

// ── Lifecycle ─────────────────────────────────────────────────────────

onMounted(async () => {
  // Initialize SQL tabs for LoQE
  visualStore.initializeSqlTabs(LOQE_TAB_KEY);

  // Load the active tab content
  const activeTab = visualStore.getActiveSqlTab(LOQE_TAB_KEY);
  if (activeTab) {
    sqlQuery.value = activeTab.content;
    activeTabIndex.value = currentLoqeTabs.value.findIndex((t) => t.id === activeTab.id);
  }

  // Poll memory usage every 5 seconds
  refreshMemory();
  memoryPollTimer = setInterval(refreshMemory, 5000);

  // Always initialise the engine on mount — this restores persisted
  // catalogs + extensions so the user doesn't have to re-attach manually.
  try {
    await loqe.initialize();
  } catch {
    // Error captured in loqe.error
  }
});

onBeforeUnmount(() => {
  if (memoryPollTimer) {
    clearInterval(memoryPollTimer);
    memoryPollTimer = null;
  }
});
</script>

<style scoped>
.font-monospace {
  font-family: 'Courier New', Courier, monospace;
}

/* Skeleton editor effect while DuckDB initialises */
.loqe-skeleton-editor {
  background: rgba(128, 128, 128, 0.04);
  border-radius: 4px;
}
</style>

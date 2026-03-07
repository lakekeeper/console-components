<template>
  <v-container fluid class="pa-0">
    <v-row
      v-if="!table.metadata.refs || Object.keys(table.metadata.refs).length === 0"
      justify="center"
      class="pa-8">
      <v-col cols="12" class="text-center">
        <v-icon size="64" color="grey-lighten-1">mdi-source-branch-remove</v-icon>
        <div class="text-h6 mt-2 text-grey-lighten-1">No branches found</div>
        <div class="text-body-1 text-grey-lighten-1">This table has no branch references</div>
      </v-col>
    </v-row>

    <div v-else class="branch-layout">
      <!-- Zoom controls — own row above chart -->
      <v-row no-gutters class="ml-2 pl-2">
        <v-col cols="12">
          <div class="zoom-bar">
            <v-btn-group variant="flat" density="comfortable" class="zoom-group" rounded="lg">
              <v-btn size="small" icon="mdi-plus" @click="zoomIn">
                <v-icon size="18">mdi-plus</v-icon>
                <v-tooltip activator="parent" location="bottom">Zoom in</v-tooltip>
              </v-btn>
              <v-btn size="small" class="zoom-label" @click="resetZoom">
                {{ Math.round(currentZoom * 100) }}%
                <v-tooltip activator="parent" location="bottom">Reset zoom</v-tooltip>
              </v-btn>
              <v-btn size="small" icon="mdi-minus" @click="zoomOut">
                <v-icon size="18">mdi-minus</v-icon>
                <v-tooltip activator="parent" location="bottom">Zoom out</v-tooltip>
              </v-btn>
              <v-btn size="small" icon="mdi-fit-to-screen" @click="fitToView">
                <v-icon size="18">mdi-fit-to-screen</v-icon>
                <v-tooltip activator="parent" location="bottom">Fit to view</v-tooltip>
              </v-btn>
            </v-btn-group>
            <v-divider vertical class="mx-3 my-1"></v-divider>
            <span v-if="!selectedSnapshot" class="text-body-2 text-medium-emphasis">
              <v-icon size="16" class="mr-1">mdi-cursor-default-click</v-icon>
              Click a node for details
            </span>
            <span v-else class="text-body-2 font-weight-medium">
              <v-icon size="16" class="mr-1" color="primary">mdi-camera-outline</v-icon>
              Snapshot #{{ selectedSnapshot['sequence-number'] }} selected
            </span>
          </div>
        </v-col>
      </v-row>

      <!-- D3 chart -->
      <v-row no-gutters class="ml-2 pl-2">
        <v-col cols="12">
          <div class="chart-wrapper" :style="{ height: chartHeight + 'px' }">
            <div ref="chartRef" class="chart-container"></div>
          </div>
        </v-col>
      </v-row>

      <!-- Legend — own row, always visible -->
      <v-row no-gutters class="ml-2 pl-2">
        <v-col cols="12">
          <div class="legend-bar">
            <v-chip
              v-for="entry in legendEntries"
              :key="entry.name"
              size="x-small"
              variant="tonal"
              class="legend-chip"
              :style="{ opacity: entry.opacity }">
              <template #prepend>
                <!-- Tag icon -->
                <svg v-if="entry.type === 'tag'" width="14" height="14" class="mr-1">
                  <path d="M 2 3 L 9 3 L 12 7 L 9 11 L 2 11 Z" :fill="entry.color" opacity="0.8" />
                  <circle cx="4.5" cy="7" r="1.2" fill="white" opacity="0.7" />
                </svg>
                <!-- Branch / dropped icon -->
                <svg v-else width="14" height="14" class="mr-1">
                  <circle
                    cx="7"
                    cy="7"
                    r="6"
                    fill="none"
                    :stroke="entry.color"
                    stroke-width="1"
                    opacity="0.5" />
                  <circle cx="7" cy="7" r="4" :fill="entry.color" />
                  <circle cx="7" cy="7" r="1.5" fill="white" opacity="0.7" />
                </svg>
              </template>
              {{ entry.name }}
              <template #append>
                <v-btn
                  v-if="
                    canRollback &&
                    entry.type === 'branch' &&
                    entry.name !== 'main' &&
                    entry.name !== 'master'
                  "
                  icon="mdi-pencil-outline"
                  size="x-small"
                  variant="text"
                  density="compact"
                  class="ml-1"
                  @click.stop="openRenameBranchDialog(entry.name)"></v-btn>
                <v-btn
                  v-if="
                    canRollback &&
                    entry.type === 'branch' &&
                    entry.name !== 'main' &&
                    entry.name !== 'master'
                  "
                  icon="mdi-close-circle"
                  size="x-small"
                  variant="text"
                  density="compact"
                  style="margin-right: -6px"
                  @click.stop="openDeleteBranchDialog(entry.name)"></v-btn>
                <v-btn
                  v-if="canRollback && entry.type === 'tag'"
                  icon="mdi-pencil-outline"
                  size="x-small"
                  variant="text"
                  density="compact"
                  class="ml-1"
                  @click.stop="openRenameTagDialog(entry.name)"></v-btn>
                <v-btn
                  v-if="canRollback && entry.type === 'tag'"
                  icon="mdi-close-circle"
                  size="x-small"
                  variant="text"
                  density="compact"
                  style="margin-right: -6px"
                  @click.stop="openDeleteTagDialog(entry.name)"></v-btn>
              </template>
            </v-chip>
            <v-chip size="x-small" variant="tonal" class="legend-chip">
              <template #prepend>
                <svg width="14" height="14" class="mr-1">
                  <circle
                    cx="7"
                    cy="7"
                    r="6"
                    fill="none"
                    stroke="#f57c00"
                    stroke-width="1"
                    opacity="0.5" />
                  <circle cx="7" cy="7" r="4" fill="#ff9800" />
                  <circle cx="7" cy="7" r="1.5" fill="white" opacity="0.7" />
                </svg>
              </template>
              schema change
            </v-chip>
          </div>
        </v-col>
      </v-row>

      <!-- Snapshot details (appears on node click) -->
      <v-row no-gutters class="details-row">
        <v-col cols="12" style="min-height: 0; overflow-y: auto">
          <v-slide-y-transition>
            <div v-if="selectedSnapshot" class="details-panel">
              <div class="pa-3">
                <!-- Header with close button -->
                <div class="d-flex align-center justify-space-between mb-3">
                  <span class="text-subtitle-1 font-weight-bold d-flex align-center">
                    <v-icon size="18" class="mr-1">mdi-camera-outline</v-icon>
                    Snapshot #{{ selectedSnapshot['sequence-number'] }}
                  </span>
                  <v-btn
                    icon="mdi-close"
                    size="x-small"
                    variant="text"
                    @click="selectedSnapshot = null"></v-btn>
                </div>

                <!-- Row 1: Snapshot Info + Summary -->
                <v-row>
                  <v-col cols="12" md="6">
                    <v-card variant="outlined" elevation="1" class="mb-3">
                      <v-toolbar color="transparent" density="compact" flat>
                        <v-toolbar-title class="text-subtitle-2">
                          <v-icon class="mr-1" color="primary" size="small">
                            mdi-information-outline
                          </v-icon>
                          Snapshot Information
                        </v-toolbar-title>
                        <v-spacer></v-spacer>
                        <v-chip
                          v-if="selectedSnapshot.summary?.operation"
                          :color="getOperationColor(selectedSnapshot.summary.operation)"
                          size="x-small"
                          variant="flat"
                          class="mr-2">
                          {{ selectedSnapshot.summary.operation }}
                        </v-chip>
                        <!-- Create branch from snapshot -->
                        <v-btn
                          v-if="canRollback && !isSelectedSnapshotDropped"
                          color="primary"
                          size="small"
                          variant="tonal"
                          prepend-icon="mdi-source-branch-plus"
                          class="mr-1"
                          @click="openCreateBranchDialog">
                          Create Branch
                        </v-btn>
                        <v-btn
                          v-if="canRollback && !isSelectedSnapshotDropped"
                          color="teal"
                          size="small"
                          variant="tonal"
                          prepend-icon="mdi-tag-plus-outline"
                          @click="openCreateTagDialog">
                          Create Tag
                        </v-btn>
                      </v-toolbar>
                      <v-divider></v-divider>
                      <v-table density="compact" class="snapshot-table" fixed-header height="250px">
                        <tbody>
                          <tr>
                            <td class="font-weight-medium" style="width: 140px">Snapshot ID</td>
                            <td>
                              <span class="font-mono">{{ selectedSnapshot['snapshot-id'] }}</span>
                              <v-btn
                                icon="mdi-content-copy"
                                size="x-small"
                                variant="text"
                                @click="
                                  copyToClipboard(String(selectedSnapshot['snapshot-id']))
                                "></v-btn>
                            </td>
                          </tr>
                          <tr>
                            <td class="font-weight-medium">Sequence</td>
                            <td>{{ selectedSnapshot['sequence-number'] }}</td>
                          </tr>
                          <tr>
                            <td class="font-weight-medium">Schema ID</td>
                            <td>{{ getEffectiveSchemaId(selectedSnapshot) }}</td>
                          </tr>
                          <tr>
                            <td class="font-weight-medium">Timestamp</td>
                            <td>
                              {{
                                selectedSnapshot['timestamp-ms']
                                  ? new Date(selectedSnapshot['timestamp-ms']).toLocaleString()
                                  : '—'
                              }}
                            </td>
                          </tr>
                          <tr v-if="selectedSnapshot['parent-snapshot-id']">
                            <td class="font-weight-medium">Parent ID</td>
                            <td class="font-mono">{{ selectedSnapshot['parent-snapshot-id'] }}</td>
                          </tr>
                          <tr v-if="selectedSnapshot['manifest-list']">
                            <td class="font-weight-medium">Manifest</td>
                            <td>
                              <v-tooltip
                                location="bottom"
                                :text="selectedSnapshot['manifest-list']">
                                <template #activator="{ props: tipProps }">
                                  <span
                                    v-bind="tipProps"
                                    class="font-mono text-wrap"
                                    style="cursor: help; font-size: 0.8rem">
                                    {{ truncateManifest(selectedSnapshot['manifest-list']) }}
                                  </span>
                                </template>
                              </v-tooltip>
                            </td>
                          </tr>
                        </tbody>
                      </v-table>
                    </v-card>
                  </v-col>

                  <v-col cols="12" md="6">
                    <v-card variant="outlined" elevation="1" class="mb-3">
                      <v-toolbar color="transparent" density="compact" flat>
                        <v-toolbar-title class="text-subtitle-2">
                          <v-icon class="mr-1" size="small">mdi-chart-box-outline</v-icon>
                          Summary
                        </v-toolbar-title>
                        <v-spacer></v-spacer>
                        <v-chip
                          v-if="selectedSnapshot.summary"
                          size="x-small"
                          variant="outlined"
                          class="mr-2">
                          {{ Object.keys(selectedSnapshot.summary).length }}
                        </v-chip>
                        <!-- Branch actions menu -->
                        <v-menu v-if="canRollback && !isSelectedSnapshotDropped">
                          <template #activator="{ props: menuProps }">
                            <v-btn
                              v-bind="menuProps"
                              size="small"
                              variant="tonal"
                              prepend-icon="mdi-source-branch"
                              class="mr-1">
                              Actions
                              <v-icon end>mdi-chevron-down</v-icon>
                            </v-btn>
                          </template>
                          <v-list density="compact">
                            <template v-if="fastForwardableBranches.length > 0">
                              <v-list-subheader>Fast Forward</v-list-subheader>
                              <v-list-item
                                v-for="branch in fastForwardableBranches"
                                :key="'ff-' + branch.name"
                                :title="branch.name"
                                prepend-icon="mdi-fast-forward"
                                @click="openFastForwardDialog(branch)"></v-list-item>
                            </template>
                            <v-list-item
                              v-if="rollbackableBranches.length > 0"
                              :title="'Rollback to ' + selectedSnapshot?.['snapshot-id']"
                              prepend-icon="mdi-undo-variant"
                              @click="openRollbackDialog()"></v-list-item>
                            <template v-if="deletableBranches.length > 0">
                              <v-list-subheader>Delete</v-list-subheader>
                              <v-list-item
                                v-for="branch in deletableBranches"
                                :key="'del-' + branch.name"
                                :title="branch.name"
                                prepend-icon="mdi-source-branch-remove"
                                base-color="error"
                                @click="openDeleteBranchDialog(branch.name)"></v-list-item>
                            </template>
                            <template v-if="deletableTags.length > 0">
                              <v-list-subheader>Delete Tag</v-list-subheader>
                              <v-list-item
                                v-for="tag in deletableTags"
                                :key="'del-tag-' + tag.name"
                                :title="tag.name"
                                prepend-icon="mdi-tag-off-outline"
                                base-color="error"
                                @click="openDeleteTagDialog(tag.name)"></v-list-item>
                            </template>
                          </v-list>
                        </v-menu>
                      </v-toolbar>
                      <v-divider></v-divider>
                      <v-table
                        v-if="selectedSnapshot.summary"
                        density="compact"
                        class="snapshot-table"
                        fixed-header
                        height="250px">
                        <tbody>
                          <tr
                            v-for="[key, value] in Object.entries(selectedSnapshot.summary)"
                            :key="key">
                            <td class="font-weight-medium" style="width: 180px">
                              {{ formatSummaryKey(key) }}
                            </td>
                            <td class="font-mono">{{ formatSummaryValue(value) }}</td>
                          </tr>
                        </tbody>
                      </v-table>
                      <div v-else class="text-center text-medium-emphasis py-4">
                        No summary data available
                      </div>
                    </v-card>
                  </v-col>
                </v-row>

                <!-- Row 2: Schema -->
                <v-row>
                  <v-col cols="12">
                    <v-expansion-panels variant="accordion">
                      <v-expansion-panel>
                        <v-expansion-panel-title>
                          <v-icon class="mr-2" size="small">mdi-file-tree</v-icon>
                          Schema Fields
                          <v-chip size="x-small" variant="outlined" class="ml-2">
                            {{ getEffectiveSchemaInfo(selectedSnapshot)?.fields?.length || 0 }}
                          </v-chip>
                          <v-chip
                            v-if="getSchemaChanges(selectedSnapshot)"
                            size="x-small"
                            color="warning"
                            variant="flat"
                            class="ml-2">
                            Changed
                          </v-chip>
                        </v-expansion-panel-title>
                        <v-expansion-panel-text>
                          <div
                            v-if="!getEffectiveSchemaInfo(selectedSnapshot)"
                            class="text-center pa-2">
                            <div class="text-caption text-medium-emphasis">
                              Schema not available (ID:
                              {{ getEffectiveSchemaId(selectedSnapshot) }})
                            </div>
                          </div>
                          <v-table v-else density="compact">
                            <thead>
                              <tr>
                                <th style="width: 30px"></th>
                                <th>Name</th>
                                <th>Type</th>
                                <th style="width: 60px">Required</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr
                                v-for="field in getEffectiveSchemaInfo(selectedSnapshot)?.fields ||
                                []"
                                :key="field.id"
                                :class="isFieldNew(field, selectedSnapshot) ? 'text-success' : ''">
                                <td>
                                  <v-icon
                                    :color="
                                      isFieldNew(field, selectedSnapshot) ? 'success' : undefined
                                    "
                                    size="x-small">
                                    {{ getFieldIcon(field) }}
                                  </v-icon>
                                </td>
                                <td>
                                  {{ field.name }}
                                  <v-chip
                                    v-if="isFieldNew(field, selectedSnapshot)"
                                    size="x-small"
                                    color="success"
                                    variant="flat"
                                    class="ml-1">
                                    new
                                  </v-chip>
                                </td>
                                <td class="font-mono" style="font-size: 0.8rem">
                                  {{ getFieldTypeString(field.type) }}
                                </td>
                                <td>
                                  <v-icon v-if="field.required" color="error" size="x-small">
                                    mdi-asterisk
                                  </v-icon>
                                </td>
                              </tr>
                            </tbody>
                          </v-table>
                        </v-expansion-panel-text>
                      </v-expansion-panel>
                    </v-expansion-panels>
                  </v-col>
                </v-row>
              </div>
            </div>
          </v-slide-y-transition>
        </v-col>
      </v-row>
    </div>

    <!-- Create branch dialog -->
    <v-dialog v-model="createBranchDialog" max-width="500" persistent>
      <v-card>
        <v-card-title class="d-flex align-center">
          <v-icon color="primary" class="mr-2">mdi-source-branch-plus</v-icon>
          Create Branch
        </v-card-title>
        <v-card-text>
          <v-alert type="info" variant="tonal" density="compact" class="mb-4">
            Create a new branch from snapshot
            <strong>#{{ selectedSnapshot?.['sequence-number'] }}</strong>
            (ID: {{ selectedSnapshot?.['snapshot-id'] }}).
          </v-alert>
          <v-text-field
            v-model="createBranchName"
            label="Branch name"
            density="compact"
            hide-details="auto"
            variant="outlined"
            :rules="[
              (v) => !!v || 'Required',
              (v) => !/\s/.test(v) || 'No spaces allowed',
              (v) => !existingRefNames.includes(v) || 'Name already exists',
            ]"
            placeholder="my-branch"></v-text-field>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn
            color="primary"
            :disabled="
              !createBranchName ||
              /\s/.test(createBranchName) ||
              existingRefNames.includes(createBranchName) ||
              createBranchLoading
            "
            :loading="createBranchLoading"
            @click="executeCreateBranch">
            Create
          </v-btn>
          <v-btn @click="closeCreateBranchDialog">Cancel</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Rename branch dialog -->
    <v-dialog v-model="renameBranchDialog" max-width="500" persistent>
      <v-card>
        <v-card-title class="d-flex align-center">
          <v-icon color="primary" class="mr-2">mdi-pencil-outline</v-icon>
          Rename Branch
        </v-card-title>
        <v-card-text>
          <v-alert type="info" variant="tonal" density="compact" class="mb-4">
            Rename branch
            <strong>"{{ renameBranchOldName }}"</strong>
            . This will atomically create a new reference and remove the old one.
          </v-alert>
          <v-text-field
            v-model="renameBranchNewName"
            label="New branch name"
            density="compact"
            hide-details="auto"
            variant="outlined"
            :rules="[
              (v) => !!v || 'Required',
              (v) => !/\s/.test(v) || 'No spaces allowed',
              (v) => v !== renameBranchOldName || 'Must be different',
              (v) => !existingRefNames.includes(v) || 'Name already exists',
            ]"
            :placeholder="renameBranchOldName"></v-text-field>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn
            color="primary"
            :disabled="
              !renameBranchNewName ||
              /\s/.test(renameBranchNewName) ||
              renameBranchNewName === renameBranchOldName ||
              existingRefNames.includes(renameBranchNewName) ||
              renameBranchLoading
            "
            :loading="renameBranchLoading"
            @click="executeRenameBranch">
            Rename
          </v-btn>
          <v-btn @click="closeRenameBranchDialog">Cancel</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Delete branch confirmation dialog -->
    <v-dialog v-model="deleteBranchDialog" max-width="500" persistent>
      <v-card>
        <v-card-title class="d-flex align-center">
          <v-icon color="error" class="mr-2">mdi-source-branch-remove</v-icon>
          Delete Branch
        </v-card-title>
        <v-card-text>
          <v-alert type="error" variant="tonal" density="compact" class="mb-4">
            This will remove the branch reference
            <strong>"{{ deleteBranchName }}"</strong>
            . Snapshots exclusive to this branch may become unreachable.
          </v-alert>
          <div class="text-body-2 mb-2">
            Type the branch name
            <strong>"{{ deleteBranchName }}"</strong>
            to confirm:
          </div>
          <v-text-field
            v-model="deleteBranchConfirmText"
            density="compact"
            hide-details
            :placeholder="deleteBranchName"
            variant="outlined"
            :color="
              deleteBranchConfirmText === deleteBranchName ? 'success' : undefined
            "></v-text-field>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn
            color="error"
            :disabled="deleteBranchConfirmText !== deleteBranchName || deleteBranchLoading"
            :loading="deleteBranchLoading"
            @click="executeDeleteBranch">
            Delete
          </v-btn>
          <v-btn @click="closeDeleteBranchDialog">Cancel</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Fast forward confirmation dialog -->
    <v-dialog v-model="fastForwardDialog" max-width="500" persistent>
      <v-card>
        <v-card-title class="d-flex align-center">
          <v-icon color="success" class="mr-2">mdi-fast-forward</v-icon>
          Fast Forward Branch
        </v-card-title>
        <v-card-text>
          <v-alert type="success" variant="tonal" density="compact" class="mb-4">
            This will fast-forward branch
            <strong>"{{ fastForwardTargetBranch?.name }}"</strong>
            to snapshot
            <strong>#{{ selectedSnapshot?.['sequence-number'] }}</strong>
            (ID: {{ selectedSnapshot?.['snapshot-id'] }}).
          </v-alert>
          <div class="text-body-2 mb-2">
            Type the branch name
            <strong>"{{ fastForwardTargetBranch?.name }}"</strong>
            to confirm:
          </div>
          <v-text-field
            v-model="fastForwardConfirmText"
            density="compact"
            hide-details
            :placeholder="fastForwardTargetBranch?.name"
            variant="outlined"
            :color="
              fastForwardConfirmText === fastForwardTargetBranch?.name ? 'success' : undefined
            "></v-text-field>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn
            color="success"
            :disabled="
              fastForwardConfirmText !== fastForwardTargetBranch?.name || fastForwardLoading
            "
            :loading="fastForwardLoading"
            @click="executeFastForward">
            Fast Forward
          </v-btn>
          <v-btn @click="closeFastForwardDialog">Cancel</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Rollback confirmation dialog -->
    <v-dialog v-model="rollbackDialog" max-width="500" persistent>
      <v-card>
        <v-card-title class="d-flex align-center">
          <v-icon color="warning" class="mr-2">mdi-undo-variant</v-icon>
          Rollback to Snapshot
        </v-card-title>
        <v-card-text>
          <v-alert type="warning" variant="tonal" density="compact" class="mb-4">
            This will roll back to snapshot
            <strong>#{{ selectedSnapshot?.['sequence-number'] }}</strong>
            (ID: {{ selectedSnapshot?.['snapshot-id'] }}). Any snapshots after this point will
            become unreachable.
          </v-alert>
          <v-select
            v-if="rollbackableBranches.length > 1"
            v-model="rollbackTargetBranch"
            :items="rollbackableBranches"
            item-title="name"
            return-object
            label="Branch to rollback"
            density="compact"
            variant="outlined"
            class="mb-4"
            hide-details></v-select>
          <div class="text-body-2 mb-2">
            Type the snapshot ID
            <strong>"{{ String(selectedSnapshot?.['snapshot-id']) }}"</strong>
            to confirm:
          </div>
          <v-text-field
            v-model="rollbackConfirmText"
            density="compact"
            hide-details
            :placeholder="String(selectedSnapshot?.['snapshot-id'])"
            variant="outlined"
            :color="
              rollbackConfirmText === String(selectedSnapshot?.['snapshot-id'])
                ? 'success'
                : undefined
            "></v-text-field>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn
            color="warning"
            :disabled="
              rollbackConfirmText !== String(selectedSnapshot?.['snapshot-id']) ||
              rollbackLoading ||
              !rollbackTargetBranch
            "
            :loading="rollbackLoading"
            @click="executeRollback">
            Rollback
          </v-btn>
          <v-btn color="error" @click="closeRollbackDialog">Cancel</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Create tag dialog -->
    <v-dialog v-model="createTagDialog" max-width="500" persistent>
      <v-card>
        <v-card-title class="d-flex align-center">
          <v-icon color="teal" class="mr-2">mdi-tag-plus-outline</v-icon>
          Create Tag
        </v-card-title>
        <v-card-text>
          <v-alert type="info" variant="tonal" density="compact" class="mb-4">
            Create a new tag pointing to snapshot
            <strong>#{{ selectedSnapshot?.['sequence-number'] }}</strong>
            (ID: {{ selectedSnapshot?.['snapshot-id'] }}).
          </v-alert>
          <v-text-field
            v-model="createTagName"
            label="Tag name"
            density="compact"
            hide-details="auto"
            variant="outlined"
            :rules="[
              (v) => !!v || 'Required',
              (v) => !/\s/.test(v) || 'No spaces allowed',
              (v) => !existingRefNames.includes(v) || 'Name already exists',
            ]"
            placeholder="my-tag"></v-text-field>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn
            color="teal"
            :disabled="
              !createTagName ||
              /\s/.test(createTagName) ||
              existingRefNames.includes(createTagName) ||
              createTagLoading
            "
            :loading="createTagLoading"
            @click="executeCreateTag">
            Create
          </v-btn>
          <v-btn @click="closeCreateTagDialog">Cancel</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Rename tag dialog -->
    <v-dialog v-model="renameTagDialog" max-width="500" persistent>
      <v-card>
        <v-card-title class="d-flex align-center">
          <v-icon color="teal" class="mr-2">mdi-tag-edit-outline</v-icon>
          Rename Tag
        </v-card-title>
        <v-card-text>
          <v-alert type="info" variant="tonal" density="compact" class="mb-4">
            Rename tag
            <strong>"{{ renameTagOldName }}"</strong>
            . This will atomically create a new reference and remove the old one.
          </v-alert>
          <v-text-field
            v-model="renameTagNewName"
            label="New tag name"
            density="compact"
            hide-details="auto"
            variant="outlined"
            :rules="[
              (v) => !!v || 'Required',
              (v) => !/\s/.test(v) || 'No spaces allowed',
              (v) => v !== renameTagOldName || 'Must be different',
              (v) => !existingRefNames.includes(v) || 'Name already exists',
            ]"
            :placeholder="renameTagOldName"></v-text-field>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn
            color="teal"
            :disabled="
              !renameTagNewName ||
              /\s/.test(renameTagNewName) ||
              renameTagNewName === renameTagOldName ||
              existingRefNames.includes(renameTagNewName) ||
              renameTagLoading
            "
            :loading="renameTagLoading"
            @click="executeRenameTag">
            Rename
          </v-btn>
          <v-btn @click="closeRenameTagDialog">Cancel</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Delete tag confirmation dialog -->
    <v-dialog v-model="deleteTagDialog" max-width="500" persistent>
      <v-card>
        <v-card-title class="d-flex align-center">
          <v-icon color="error" class="mr-2">mdi-tag-off-outline</v-icon>
          Delete Tag
        </v-card-title>
        <v-card-text>
          <v-alert type="error" variant="tonal" density="compact" class="mb-4">
            This will remove the tag reference
            <strong>"{{ deleteTagName }}"</strong>
            .
          </v-alert>
          <div class="text-body-2 mb-2">
            Type the tag name
            <strong>"{{ deleteTagName }}"</strong>
            to confirm:
          </div>
          <v-text-field
            v-model="deleteTagConfirmText"
            density="compact"
            hide-details
            :placeholder="deleteTagName"
            variant="outlined"
            :color="deleteTagConfirmText === deleteTagName ? 'success' : undefined"></v-text-field>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn
            color="error"
            :disabled="deleteTagConfirmText !== deleteTagName || deleteTagLoading"
            :loading="deleteTagLoading"
            @click="executeDeleteTag">
            Delete
          </v-btn>
          <v-btn @click="closeDeleteTagDialog">Cancel</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script lang="ts" setup>
import { computed, ref, watch, onBeforeUnmount, nextTick } from 'vue';
import * as d3 from 'd3';
import { useDisplay } from 'vuetify';
import type { LoadTableResult, Snapshot } from '../gen/iceberg/types.gen';
import { useFunctions } from '../plugins/functions';

// ─── Reactive chart height from viewport ─────────────────────────────────────
const { height: viewportHeight } = useDisplay();
const chartHeight = computed(() => {
  // Max 30vh, minus 5% breathing room
  const maxH = viewportHeight.value * 0.3;
  return Math.max(150, Math.round(maxH * 0.95));
});

// ─── Props ───────────────────────────────────────────────────────────────────
const props = defineProps<{
  table: LoadTableResult;
  snapshotHistory: Snapshot[];
  canRollback?: boolean;
  warehouseId?: string;
  namespacePath?: string;
  tableName?: string;
}>();

const emit = defineEmits<{
  rollback: [];
  fastForward: [];
  createBranch: [];
  renameBranch: [];
  deleteBranch: [];
  createTag: [];
  renameTag: [];
  deleteTag: [];
}>();

const functions = useFunctions();

// ─── State ───────────────────────────────────────────────────────────────────
const chartRef = ref<HTMLDivElement | null>(null);
const selectedSnapshot = ref<Snapshot | null>(null);
const currentZoom = ref(1);

// ─── Create Branch State ─────────────────────────────────────────────────────
const createBranchDialog = ref(false);
const createBranchName = ref('');
const createBranchLoading = ref(false);

// ─── Rename Branch State ─────────────────────────────────────────────────────
const renameBranchDialog = ref(false);
const renameBranchOldName = ref('');
const renameBranchNewName = ref('');
const renameBranchLoading = ref(false);

// ─── Delete Branch State ─────────────────────────────────────────────────────
const deleteBranchDialog = ref(false);
const deleteBranchName = ref('');
const deleteBranchConfirmText = ref('');
const deleteBranchLoading = ref(false);

// ─── Rollback State ──────────────────────────────────────────────────────────
const rollbackDialog = ref(false);
const rollbackTargetBranch = ref<BranchMeta | null>(null);
const rollbackConfirmText = ref('');
const rollbackLoading = ref(false);

// ─── Fast Forward State ──────────────────────────────────────────────────────
const fastForwardDialog = ref(false);
const fastForwardTargetBranch = ref<BranchMeta | null>(null);
const fastForwardConfirmText = ref('');
const fastForwardLoading = ref(false);

// ─── Create Tag State ────────────────────────────────────────────────────────
const createTagDialog = ref(false);
const createTagName = ref('');
const createTagLoading = ref(false);

// ─── Rename Tag State ────────────────────────────────────────────────────────
const renameTagDialog = ref(false);
const renameTagOldName = ref('');
const renameTagNewName = ref('');
const renameTagLoading = ref(false);

// ─── Delete Tag State ────────────────────────────────────────────────────────
const deleteTagDialog = ref(false);
const deleteTagName = ref('');
const deleteTagConfirmText = ref('');
const deleteTagLoading = ref(false);

// D3 selections — kept outside Vue reactivity
let svg: d3.Selection<SVGSVGElement, unknown, null, undefined> | null = null;
let rootG: d3.Selection<SVGGElement, unknown, null, undefined> | null = null;
let zoomBehavior: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null;

// ─── Branch Colors ───────────────────────────────────────────────────────────
const BRANCH_COLORS = ['#1976d2', '#388e3c', '#f57c00', '#d32f2f', '#7b1fa2', '#00796b', '#c2185b'];
const DROPPED_COLOR = '#9e9e9e';
const TAG_COLOR = '#26a69a';

// ─── Data Model ──────────────────────────────────────────────────────────────

interface BranchMeta {
  name: string;
  type: 'branch' | 'tag' | 'dropped';
  color: string;
  tipSnapshotId: number;
  ancestry: number[];
}

interface TagMeta {
  name: string;
  snapshotId: number;
  maxRefAgeMs?: number;
}

interface GraphNode {
  id: string;
  snapshotId: number;
  x: number;
  y: number;
  radius: number;
  color: string;
  strokeColor: string;
  sequenceNumber: number;
  branchLabels: { name: string; color: string }[];
  tagLabels: { name: string; color: string }[];
  schemaChange?: { from: number; to: number };
}

interface GraphLink {
  id: string;
  path: string;
  color: string;
  opacity: number;
}

// ─── Ancestry helper ─────────────────────────────────────────────────────────

function traceAncestry(tipId: number, snapshotMap: Map<number, Snapshot>): number[] {
  const chain: number[] = [];
  let id: number | undefined = tipId;
  const visited = new Set<number>();
  while (id != null && !visited.has(id)) {
    visited.add(id);
    const snap = snapshotMap.get(id);
    if (!snap) break;
    chain.push(id);
    id = snap['parent-snapshot-id'] ?? undefined;
  }
  return chain;
}

// ─── Computed: branches ──────────────────────────────────────────────────────

const branches = computed<BranchMeta[]>(() => {
  const result: BranchMeta[] = [];
  const refs = props.table.metadata.refs;
  if (!refs) return result;

  const sorted = [...props.snapshotHistory].sort(
    (a, b) => (a['sequence-number'] || 0) - (b['sequence-number'] || 0),
  );
  const snapshotMap = new Map<number, Snapshot>();
  sorted.forEach((s) => snapshotMap.set(s['snapshot-id'], s));

  let colorIdx = 0;
  Object.entries(refs).forEach(([name, refData]: [string, any]) => {
    if (refData.type !== 'branch') return;
    result.push({
      name,
      type: 'branch',
      color: BRANCH_COLORS[colorIdx++ % BRANCH_COLORS.length],
      tipSnapshotId: refData['snapshot-id'],
      ancestry: traceAncestry(refData['snapshot-id'], snapshotMap),
    });
  });

  // Dropped branches
  const reachable = new Set<number>();
  result.forEach((b) => b.ancestry.forEach((id) => reachable.add(id)));

  const unreachable = sorted.filter((s) => !reachable.has(s['snapshot-id']));
  if (unreachable.length > 0) {
    const childrenMap = new Map<number, number[]>();
    sorted.forEach((s) => {
      const pid = s['parent-snapshot-id'];
      if (pid != null) {
        if (!childrenMap.has(pid)) childrenMap.set(pid, []);
        childrenMap.get(pid)!.push(s['snapshot-id']);
      }
    });
    const unreachableIds = new Set(unreachable.map((s) => s['snapshot-id']));
    const tips = unreachable.filter((s) => {
      const children = childrenMap.get(s['snapshot-id']) || [];
      return !children.some((c) => unreachableIds.has(c));
    });
    tips.forEach((tip) => {
      const ancestry = traceAncestry(tip['snapshot-id'], snapshotMap);
      const droppedAncestry = ancestry.filter((id) => unreachableIds.has(id));
      if (droppedAncestry.length === 0) return;
      result.push({
        name: `dropped-seq-${tip['sequence-number']}`,
        type: 'dropped',
        color: DROPPED_COLOR,
        tipSnapshotId: tip['snapshot-id'],
        ancestry: droppedAncestry,
      });
    });
  }

  return result;
});

// ─── Computed: tags ──────────────────────────────────────────────────────────

const tags = computed<TagMeta[]>(() => {
  const result: TagMeta[] = [];
  const refs = props.table.metadata.refs;
  if (!refs) return result;

  Object.entries(refs).forEach(([name, refData]: [string, any]) => {
    if (refData.type !== 'tag') return;
    result.push({
      name,
      snapshotId: refData['snapshot-id'],
      maxRefAgeMs: refData['max-ref-age-ms'],
    });
  });
  return result;
});

// ─── Computed: nodes ─────────────────────────────────────────────────────────

const graphNodes = computed<GraphNode[]>(() => {
  if (!props.snapshotHistory.length || branches.value.length === 0) return [];

  const sorted = [...props.snapshotHistory].sort(
    (a, b) => (a['sequence-number'] || 0) - (b['sequence-number'] || 0),
  );

  const mainBranch = branches.value.find((b) => b.name === 'main' || b.name === 'master');
  const namedBranches = branches.value.filter((b) => b.type === 'branch' && b !== mainBranch);
  const droppedBranches = branches.value.filter((b) => b.type === 'dropped');

  const snapshotRow = new Map<number, number>();
  if (mainBranch) mainBranch.ancestry.forEach((id) => snapshotRow.set(id, 0));
  namedBranches.forEach((branch, idx) => {
    branch.ancestry.forEach((id) => {
      if (!snapshotRow.has(id)) snapshotRow.set(id, -(idx + 1));
    });
  });
  droppedBranches.forEach((branch, idx) => {
    branch.ancestry.forEach((id) => {
      if (!snapshotRow.has(id)) snapshotRow.set(id, idx + 1);
    });
  });

  // Detect merged branches (same tip as main) and use snapshot-log to
  // move their exclusive snapshots onto a separate branch row.
  const snapshotLog = (props.table.metadata as any)['snapshot-log'] as
    | { 'snapshot-id': number; 'timestamp-ms': number }[]
    | undefined;
  const mergedBranchExclusiveIds = new Set<string>();
  if (mainBranch && snapshotLog && snapshotLog.length > 0) {
    const logIds = new Set(snapshotLog.map((e) => String(e['snapshot-id'])));
    namedBranches.forEach((branch, idx) => {
      if (String(branch.tipSnapshotId) !== String(mainBranch.tipSnapshotId)) return;
      // Snapshots in shared ancestry that are NOT in the log were committed on this branch
      branch.ancestry.forEach((id) => {
        if (String(id) !== String(branch.tipSnapshotId) && !logIds.has(String(id))) {
          snapshotRow.set(id, -(idx + 1));
          mergedBranchExclusiveIds.add(String(id));
        }
      });
    });
  }

  // Horizontal layout: x = time (left→right), y = branch row
  const spacingX = 90;
  const spacingY = 100;
  const allRows = Array.from(snapshotRow.values());
  const minRow = Math.min(...allRows, 0);
  const originY = Math.abs(minRow) * spacingY + 80;

  const tipMap = new Map<number, BranchMeta[]>();
  branches.value.forEach((b) => {
    if (!tipMap.has(b.tipSnapshotId)) tipMap.set(b.tipSnapshotId, []);
    tipMap.get(b.tipSnapshotId)!.push(b);
  });

  const tagMap = new Map<number, TagMeta[]>();
  tags.value.forEach((t) => {
    if (!tagMap.has(t.snapshotId)) tagMap.set(t.snapshotId, []);
    tagMap.get(t.snapshotId)!.push(t);
  });

  return sorted.map((snapshot, index) => {
    const sid = snapshot['snapshot-id'];
    const row = snapshotRow.get(sid) ?? 0;
    const x = 60 + index * spacingX;
    const y = originY + row * spacingY;
    const sc = getSchemaChangeInfo(snapshot);
    // Prefer main for shared nodes, else use the branch whose row this snapshot is on
    const mainBr = branches.value.find((b) => b.name === 'main' || b.name === 'master');
    const ownerBranch =
      (row === 0 && mainBr?.ancestry.includes(sid) ? mainBr : null) ||
      branches.value.find((b) => b.ancestry.includes(sid) && snapshotRow.get(sid) !== undefined) ||
      branches.value.find((b) => b.ancestry.includes(sid));
    const isDropped = ownerBranch?.type === 'dropped';
    const hasTag = (tagMap.get(sid) || []).length > 0;
    const branchColor = ownerBranch?.color || '#666';
    const tipBranches = tipMap.get(sid) || [];
    // Tagged-but-dropped snapshots get teal color to show they're anchored
    const nodeColor = sc ? '#ff9800' : isDropped && hasTag ? TAG_COLOR : branchColor;
    const nodeStroke = sc
      ? '#f57c00'
      : isDropped && hasTag
        ? '#00796b'
        : isDropped
          ? '#757575'
          : branchColor;

    return {
      id: `node-${sid}`,
      snapshotId: sid,
      x,
      y,
      radius: sc ? 14 : 11,
      color: nodeColor,
      strokeColor: nodeStroke,
      sequenceNumber: snapshot['sequence-number'] || 0,
      branchLabels: tipBranches.map((b) => ({ name: b.name, color: b.color })),
      tagLabels: (tagMap.get(sid) || []).map((t) => ({ name: t.name, color: TAG_COLOR })),
      schemaChange: sc || undefined,
    };
  });
});

// ─── Computed: links ─────────────────────────────────────────────────────────

const graphLinks = computed<GraphLink[]>(() => {
  if (graphNodes.value.length === 0) return [];

  const nodeMap = new Map<number, GraphNode>();
  graphNodes.value.forEach((n) => nodeMap.set(n.snapshotId, n));

  const links: GraphLink[] = [];
  const seen = new Set<string>();

  // Metro-style path: horizontal → rounded corner → vertical → rounded corner → horizontal
  function metroPath(x1: number, y1: number, x2: number, y2: number, r = 14): string {
    const dy = y2 - y1;
    if (Math.abs(dy) < 5) return `M ${x1} ${y1} L ${x2} ${y2}`;
    const midX = (x1 + x2) / 2;
    const signY = dy > 0 ? 1 : -1;
    const clampR = Math.min(r, Math.abs(dy) / 2, Math.abs(midX - x1));
    return [
      `M ${x1} ${y1}`,
      `L ${midX - clampR} ${y1}`,
      `Q ${midX} ${y1} ${midX} ${y1 + signY * clampR}`,
      `L ${midX} ${y2 - signY * clampR}`,
      `Q ${midX} ${y2} ${midX + clampR} ${y2}`,
      `L ${x2} ${y2}`,
    ].join(' ');
  }

  function addLink(
    parentNode: GraphNode,
    childNode: GraphNode,
    color: string,
    opacity: number,
    keyPrefix = '',
  ) {
    const key = `${keyPrefix}${parentNode.snapshotId}-${childNode.snapshotId}`;
    if (seen.has(key)) return;
    seen.add(key);

    const x1 = parentNode.x + parentNode.radius;
    const y1 = parentNode.y;
    const x2 = childNode.x - childNode.radius;
    const y2 = childNode.y;
    const path = metroPath(x1, y1, x2, y2);
    links.push({ id: key, path, color, opacity });
  }

  // Determine which branches are merged into main (same tip)
  const mainBr = branches.value.find((b) => b.name === 'main' || b.name === 'master');
  const snapshotLog2 = (props.table.metadata as any)['snapshot-log'] as
    | { 'snapshot-id': number }[]
    | undefined;
  const mergedExclusiveIds = new Set<string>();
  if (mainBr && snapshotLog2 && snapshotLog2.length > 0) {
    const logIds2 = new Set(snapshotLog2.map((e) => String(e['snapshot-id'])));
    branches.value.forEach((branch) => {
      if (branch === mainBr || branch.type !== 'branch') return;
      if (String(branch.tipSnapshotId) !== String(mainBr.tipSnapshotId)) return;
      branch.ancestry.forEach((id) => {
        if (String(id) !== String(branch.tipSnapshotId) && !logIds2.has(String(id))) {
          mergedExclusiveIds.add(String(id));
        }
      });
    });
  }

  // Process merged branches first so their colored links take priority
  const sortedBranches = [...branches.value].sort((a, b) => {
    const aM =
      mainBr &&
      a !== mainBr &&
      a.type === 'branch' &&
      String(a.tipSnapshotId) === String(mainBr.tipSnapshotId);
    const bM =
      mainBr &&
      b !== mainBr &&
      b.type === 'branch' &&
      String(b.tipSnapshotId) === String(mainBr.tipSnapshotId);
    if (aM && !bM) return -1;
    if (!aM && bM) return 1;
    return 0;
  });

  sortedBranches.forEach((branch) => {
    const isMerged =
      mainBr &&
      branch !== mainBr &&
      branch.type === 'branch' &&
      mergedExclusiveIds.size > 0 &&
      String(branch.tipSnapshotId) === String(mainBr.tipSnapshotId);
    // Tagged-dropped branches get higher opacity (teal links)
    const hasTagOnDropped =
      branch.type === 'dropped' &&
      branch.ancestry.some((id) => tags.value.some((t) => t.snapshotId === id));
    const opacity = branch.type === 'dropped' ? (hasTagOnDropped ? 0.7 : 0.5) : 0.8;

    if (isMerged) {
      // Only create links where at least one endpoint is branch-exclusive
      for (let i = 0; i < branch.ancestry.length - 1; i++) {
        const child = nodeMap.get(branch.ancestry[i]);
        const parent = nodeMap.get(branch.ancestry[i + 1]);
        if (child && parent) {
          const childExcl = mergedExclusiveIds.has(String(branch.ancestry[i]));
          const parentExcl = mergedExclusiveIds.has(String(branch.ancestry[i + 1]));
          if (childExcl || parentExcl) {
            addLink(parent, child, branch.color, 0.8);
          }
        }
      }
      return;
    }

    // Chain edges — only for snapshots exclusive to this branch
    // (stop once we hit a snapshot owned by main, to avoid coloring main's links)
    const mainAncestrySet = mainBr ? new Set(mainBr.ancestry) : new Set<number>();
    for (let i = 0; i < branch.ancestry.length - 1; i++) {
      const childId = branch.ancestry[i];
      const parentId = branch.ancestry[i + 1];
      const child = nodeMap.get(childId);
      const parent = nodeMap.get(parentId);
      if (!child || !parent) continue;
      // If both child and parent are on main, skip — main will draw its own links
      if (
        branch !== mainBr &&
        branch.type === 'branch' &&
        mainAncestrySet.has(childId) &&
        mainAncestrySet.has(parentId)
      ) {
        continue;
      }
      addLink(parent, child, hasTagOnDropped ? TAG_COLOR : branch.color, opacity);
    }

    // Divergence from main
    if (branch.type === 'branch' && branch.name !== 'main' && branch.name !== 'master') {
      if (mainBr) {
        const mainSet = new Set(mainBr.ancestry);
        for (let i = 0; i < branch.ancestry.length; i++) {
          if (mainSet.has(branch.ancestry[i]) && i > 0) {
            const from = nodeMap.get(branch.ancestry[i]);
            const to = nodeMap.get(branch.ancestry[i - 1]);
            if (from && to) addLink(from, to, branch.color, 0.8, 'diverge-');
            break;
          }
        }
      }
    }

    // Dropped branch divergence
    if (branch.type === 'dropped' && branch.ancestry.length > 0) {
      // Check if any snapshot on this dropped branch has a tag
      const hasTaggedSnapshot = branch.ancestry.some((id) =>
        tags.value.some((t) => t.snapshotId === id),
      );
      const dropColor = hasTaggedSnapshot ? TAG_COLOR : DROPPED_COLOR;
      const dropOpacity = hasTaggedSnapshot ? 0.7 : 0.5;
      const lastId = branch.ancestry[branch.ancestry.length - 1];
      const lastSnap = props.snapshotHistory.find((s) => s['snapshot-id'] === lastId);
      if (lastSnap?.['parent-snapshot-id']) {
        const from = nodeMap.get(lastSnap['parent-snapshot-id']);
        const to = nodeMap.get(lastId);
        if (from && to) addLink(from, to, dropColor, dropOpacity, 'drop-');
      }
    }
  });

  return links;
});

// ─── Legend (Vue-rendered) ───────────────────────────────────────────────────

const legendEntries = computed(() => {
  const entries: { name: string; color: string; type: string; opacity: number }[] = [];
  let droppedCount = 0;

  branches.value.forEach((b) => {
    if (b.type === 'dropped') {
      droppedCount++;
    } else {
      entries.push({ name: b.name, color: b.color, type: b.type, opacity: 1 });
    }
  });
  if (droppedCount > 0) {
    entries.push({
      name: `dropped branches (${droppedCount})`,
      color: DROPPED_COLOR,
      type: 'dropped',
      opacity: 0.7,
    });
  }
  tags.value.forEach((t) => {
    entries.push({ name: t.name, color: TAG_COLOR, type: 'tag', opacity: 1 });
  });
  return entries;
});

// ─── D3 Rendering ────────────────────────────────────────────────────────────

function renderChart() {
  if (!chartRef.value) return;

  const container = chartRef.value;
  const width = container.clientWidth || 800;
  const height = chartHeight.value;

  // Tear down previous SVG
  d3.select(container).selectAll('svg').remove();

  // Create fresh SVG
  svg = d3
    .select(container)
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .style('display', 'block');

  const defs = svg.append('defs');

  // ── Dot-grid pattern ──
  defs
    .append('pattern')
    .attr('id', 'dotGrid')
    .attr('width', 20)
    .attr('height', 20)
    .attr('patternUnits', 'userSpaceOnUse')
    .append('circle')
    .attr('cx', 10)
    .attr('cy', 10)
    .attr('r', 0.8)
    .attr('fill', 'rgba(var(--v-theme-on-surface), 0.08)');

  // ── Glow filter for links ──
  const glowFilter = defs
    .append('filter')
    .attr('id', 'lineGlow')
    .attr('x', '-30%')
    .attr('y', '-30%')
    .attr('width', '160%')
    .attr('height', '160%');
  glowFilter.append('feGaussianBlur').attr('stdDeviation', 3).attr('result', 'blur');
  const glowMerge = glowFilter.append('feMerge');
  glowMerge.append('feMergeNode').attr('in', 'blur');
  glowMerge.append('feMergeNode').attr('in', 'SourceGraphic');

  // ── Glow filter for nodes ──
  const nodeGlow = defs
    .append('filter')
    .attr('id', 'nodeGlow')
    .attr('x', '-50%')
    .attr('y', '-50%')
    .attr('width', '200%')
    .attr('height', '200%');
  nodeGlow.append('feGaussianBlur').attr('stdDeviation', 4).attr('result', 'blur');
  const nodeMerge = nodeGlow.append('feMerge');
  nodeMerge.append('feMergeNode').attr('in', 'blur');
  nodeMerge.append('feMergeNode').attr('in', 'SourceGraphic');

  // ── Selected-pulse filter ──
  const pulseFilter = defs
    .append('filter')
    .attr('id', 'selectedPulse')
    .attr('x', '-80%')
    .attr('y', '-80%')
    .attr('width', '260%')
    .attr('height', '260%');
  pulseFilter.append('feGaussianBlur').attr('stdDeviation', 6).attr('result', 'blur');
  const pulseMerge = pulseFilter.append('feMerge');
  pulseMerge.append('feMergeNode').attr('in', 'blur');
  pulseMerge.append('feMergeNode').attr('in', 'SourceGraphic');

  // Background rect with dot grid
  svg
    .append('rect')
    .attr('width', width)
    .attr('height', height)
    .attr('fill', 'url(#dotGrid)')
    .style('pointer-events', 'none');

  // Root group for zoom/pan
  rootG = svg.append('g');

  // ── Zoom behavior ──
  zoomBehavior = d3
    .zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.1, 5])
    .on('zoom', (event) => {
      rootG!.attr('transform', event.transform.toString());
      currentZoom.value = event.transform.k;
    });

  svg.call(zoomBehavior);
  svg.on('dblclick.zoom', null);

  // ── Draw link glow layer (behind) ──
  const glowG = rootG.append('g').attr('class', 'link-glow');
  glowG
    .selectAll('path')
    .data(graphLinks.value)
    .join('path')
    .attr('d', (d) => d.path)
    .attr('stroke', (d) => d.color)
    .attr('stroke-width', 8)
    .attr('fill', 'none')
    .attr('stroke-linecap', 'round')
    .attr('stroke-linejoin', 'round')
    .attr('opacity', (d) => d.opacity * 0.25)
    .attr('filter', 'url(#lineGlow)');

  // ── Draw solid links ──
  const linksG = rootG.append('g').attr('class', 'links');
  linksG
    .selectAll('path')
    .data(graphLinks.value)
    .join('path')
    .attr('d', (d) => d.path)
    .attr('stroke', (d) => d.color)
    .attr('stroke-width', 3)
    .attr('fill', 'none')
    .attr('stroke-linecap', 'round')
    .attr('stroke-linejoin', 'round')
    .attr('opacity', (d) => d.opacity);

  // ── Animated flow dashes (direction indicator) ──
  const flowG = rootG.append('g').attr('class', 'link-flow');
  flowG
    .selectAll('path')
    .data(graphLinks.value)
    .join('path')
    .attr('d', (d) => d.path)
    .attr('stroke', 'white')
    .attr('stroke-width', 1.5)
    .attr('fill', 'none')
    .attr('stroke-linecap', 'round')
    .attr('stroke-linejoin', 'round')
    .attr('stroke-dasharray', '4 12')
    .attr('opacity', (d) => d.opacity * 0.5)
    .attr('class', 'flow-dash');

  // ── Draw nodes ──
  const nodesG = rootG.append('g').attr('class', 'nodes');
  const nodeGroups = nodesG
    .selectAll('g')
    .data(graphNodes.value)
    .join('g')
    .style('cursor', 'pointer')
    .on('click', (_event, d) => {
      const snap = props.snapshotHistory.find((s) => s['snapshot-id'] === d.snapshotId);
      if (snap) selectedSnapshot.value = snap;
    });

  // Outer ring (station ring — always visible)
  nodeGroups
    .append('circle')
    .attr('class', 'node-ring')
    .attr('cx', (d) => d.x)
    .attr('cy', (d) => d.y)
    .attr('r', (d) => d.radius + 4)
    .attr('fill', 'none')
    .attr('stroke', (d) => d.color)
    .attr('stroke-width', 1.5)
    .attr('opacity', 0.4)
    .attr('filter', 'url(#nodeGlow)');

  // Main circle (inner solid)
  nodeGroups
    .append('circle')
    .attr('class', 'node-fill')
    .attr('cx', (d) => d.x)
    .attr('cy', (d) => d.y)
    .attr('r', (d) => d.radius)
    .attr('fill', (d) => d.color)
    .attr('stroke', (d) => d.strokeColor)
    .attr('stroke-width', 2);

  // Inner bright dot
  nodeGroups
    .append('circle')
    .attr('cx', (d) => d.x)
    .attr('cy', (d) => d.y)
    .attr('r', 3)
    .attr('fill', 'white')
    .attr('opacity', 0.7)
    .style('pointer-events', 'none');

  // Sequence number (below node)
  nodeGroups
    .append('text')
    .attr('x', (d) => d.x)
    .attr('y', (d) => d.y + d.radius + 14)
    .attr('font-size', 9)
    .attr('font-weight', '600')
    .attr('fill', 'rgba(var(--v-theme-on-surface), 0.6)')
    .attr('text-anchor', 'middle')
    .style('pointer-events', 'none')
    .text((d) => `#${d.sequenceNumber}`);

  // Schema change badge
  nodeGroups
    .filter((d) => !!d.schemaChange)
    .append('circle')
    .attr('cx', (d) => d.x + d.radius)
    .attr('cy', (d) => d.y - d.radius)
    .attr('r', 6)
    .attr('fill', '#ff5722')
    .attr('stroke', 'rgba(var(--v-theme-surface), 1)')
    .attr('stroke-width', 1.5)
    .style('pointer-events', 'none');

  nodeGroups
    .filter((d) => !!d.schemaChange)
    .append('text')
    .attr('x', (d) => d.x + d.radius)
    .attr('y', (d) => d.y - d.radius + 3.5)
    .attr('font-size', 7)
    .attr('font-weight', 'bold')
    .attr('fill', 'white')
    .attr('text-anchor', 'middle')
    .style('pointer-events', 'none')
    .text('S');

  // ── Ref labels (branches + tags) — draggable, placed to avoid curves ──
  const labelsG = rootG.append('g').attr('class', 'ref-labels');

  // Build a set of directions that are "busy" for each node (links going up/down)
  const nodeBusy = new Map<number, Set<string>>();
  const nodeMap2 = new Map<number, GraphNode>();
  graphNodes.value.forEach((n) => nodeMap2.set(n.snapshotId, n));

  graphLinks.value.forEach((link) => {
    // Parse source/target from link path to detect vertical direction
    const m = link.path.match(/^M\s+([\d.]+)\s+([\d.]+).*?([\d.]+)\s+([\d.]+)$/);
    if (!m) return;
    const y1 = parseFloat(m[2]);
    const y2 = parseFloat(m[4]);
    // Find which nodes are at these positions
    graphNodes.value.forEach((n) => {
      if (!nodeBusy.has(n.snapshotId)) nodeBusy.set(n.snapshotId, new Set());
      const busy = nodeBusy.get(n.snapshotId)!;
      if (Math.abs(n.y - y1) < 5 || Math.abs(n.y - y2) < 5) {
        if (y2 < y1 - 5) busy.add('up');
        if (y2 > y1 + 5) busy.add('down');
      }
    });
  });

  graphNodes.value.forEach((d) => {
    const allLabels: { name: string; color: string; kind: 'branch' | 'tag' }[] = [
      ...d.branchLabels.map((l) => ({ ...l, kind: 'branch' as const })),
      ...d.tagLabels.map((l) => ({ ...l, kind: 'tag' as const })),
    ];
    if (!allLabels.length) return;

    // Tags always above, branches always below
    const tagLabels = allLabels.filter((l) => l.kind === 'tag');
    const branchLabels = allLabels.filter((l) => l.kind === 'branch');

    // Slot templates (dy is signed: negative = above, positive = below)
    const aboveSlots = [
      { dx: 0, dy: -45, anchor: 'middle' },
      { dx: -70, dy: -35, anchor: 'end' },
      { dx: 70, dy: -35, anchor: 'start' },
      { dx: -80, dy: -55, anchor: 'end' },
      { dx: 80, dy: -55, anchor: 'start' },
      { dx: 0, dy: -65, anchor: 'middle' },
    ];
    const belowSlots = [
      { dx: 0, dy: 45, anchor: 'middle' },
      { dx: -70, dy: 35, anchor: 'end' },
      { dx: 70, dy: 35, anchor: 'start' },
      { dx: -80, dy: 55, anchor: 'end' },
      { dx: 80, dy: 55, anchor: 'start' },
      { dx: 0, dy: 65, anchor: 'middle' },
    ];

    // Helper to pick slots based on label count
    function pickSlots(pool: typeof aboveSlots, count: number) {
      if (count === 1) return [pool[0]];
      if (count === 2) return [pool[1], pool[2]];
      if (count === 3) return [pool[1], pool[0], pool[2]];
      return Array.from({ length: count }, (_, i) => pool[i % pool.length]);
    }

    // Build ordered list: tags (above slots) then branches (below slots)
    const orderedLabels: {
      label: (typeof allLabels)[0];
      slot: (typeof aboveSlots)[0];
      above: boolean;
    }[] = [];
    const tagSlots = pickSlots(aboveSlots, tagLabels.length);
    tagLabels.forEach((label, i) => orderedLabels.push({ label, slot: tagSlots[i], above: true }));
    const branchSlotsPicked = pickSlots(belowSlots, branchLabels.length);
    branchLabels.forEach((label, i) =>
      orderedLabels.push({ label, slot: branchSlotsPicked[i], above: false }),
    );

    orderedLabels.forEach(({ label, slot, above }) => {
      const isBranch = label.kind === 'branch';
      const startX = d.x;
      const startY = above ? d.y - d.radius - 4 : d.y + d.radius + 4;
      let labelX = d.x + slot.dx;
      let labelY = d.y + slot.dy;

      // Wrapper group for this single label (draggable)
      const singleLabelG = labelsG.append('g').attr('class', 'draggable-label');

      // Leader line
      const leaderLine = singleLabelG
        .append('line')
        .attr('x1', startX)
        .attr('y1', startY)
        .attr('x2', labelX)
        .attr('y2', labelY - (above ? -8 : 8))
        .attr('stroke', label.color)
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '3,3')
        .attr('opacity', 0.4)
        .style('pointer-events', 'none');

      const textNode = singleLabelG
        .append('text')
        .attr('x', labelX)
        .attr('y', labelY)
        .attr('font-size', isBranch ? 10 : 9)
        .attr('font-weight', isBranch ? '700' : '500')
        .attr('fill', label.color)
        .attr('text-anchor', slot.anchor)
        .style('letter-spacing', isBranch ? '0.05em' : '0.03em')
        .style('cursor', 'pointer');

      if (isBranch) {
        textNode.style('text-transform', 'uppercase').text(label.name);
      } else {
        textNode.style('font-style', 'italic').text(`\u25C6 ${label.name}`);
      }

      const bbox = (textNode.node() as SVGTextElement)?.getBBox();
      let bgRect: d3.Selection<SVGRectElement, unknown, null, undefined> | null = null;
      let underline: d3.Selection<SVGLineElement, unknown, null, undefined> | null = null;

      if (bbox) {
        bgRect = singleLabelG
          .insert('rect', 'text')
          .attr('x', bbox.x - 4)
          .attr('y', bbox.y - 2)
          .attr('width', bbox.width + 8)
          .attr('height', bbox.height + 4)
          .attr('rx', 3)
          .attr('fill', 'rgba(var(--v-theme-surface), 1)')
          .style('cursor', 'pointer');

        underline = singleLabelG
          .append('line')
          .attr('x1', bbox.x)
          .attr('y1', bbox.y + bbox.height + 1)
          .attr('x2', bbox.x + bbox.width)
          .attr('y2', bbox.y + bbox.height + 1)
          .attr('stroke', label.color)
          .attr('stroke-width', isBranch ? 1.5 : 1)
          .attr('stroke-dasharray', isBranch ? 'none' : '3,2')
          .attr('opacity', 0.5)
          .style('pointer-events', 'none');
      }

      // Make the label draggable
      const drag = d3
        .drag<SVGGElement, unknown>()
        .on('start', function () {
          d3.select(this).raise();
          if (bgRect) bgRect.style('cursor', 'grabbing');
          d3.select(this).style('cursor', 'grabbing');
        })
        .on('drag', function (event: d3.D3DragEvent<SVGGElement, unknown, unknown>) {
          labelX += event.dx;
          labelY += event.dy;

          textNode.attr('x', labelX).attr('y', labelY);
          leaderLine.attr('x2', labelX).attr('y2', labelY - (above ? -8 : 8));

          const newBbox = (textNode.node() as SVGTextElement)?.getBBox();
          if (newBbox && bgRect) {
            bgRect
              .attr('x', newBbox.x - 4)
              .attr('y', newBbox.y - 2)
              .attr('width', newBbox.width + 8)
              .attr('height', newBbox.height + 4);
          }
          if (newBbox && underline) {
            underline
              .attr('x1', newBbox.x)
              .attr('y1', newBbox.y + newBbox.height + 1)
              .attr('x2', newBbox.x + newBbox.width)
              .attr('y2', newBbox.y + newBbox.height + 1);
          }
        })
        .on('end', function () {
          if (bgRect) bgRect.style('cursor', 'pointer');
          d3.select(this).style('cursor', 'pointer');
        });

      singleLabelG.call(drag as any);
    });
  });

  // Tooltip
  nodeGroups
    .append('title')
    .text(
      (d) =>
        `Seq ${d.sequenceNumber} | ID ${d.snapshotId}${d.schemaChange ? ` | Schema ${d.schemaChange.from}\u2192${d.schemaChange.to}` : ''}`,
    );

  // Auto fit — delay to ensure labels/text are fully rendered for accurate getBBox
  setTimeout(fitToView, 150);
}

// ─── Zoom controls ───────────────────────────────────────────────────────────

function zoomIn() {
  if (!svg || !zoomBehavior) return;
  svg.transition().duration(300).call(zoomBehavior.scaleBy, 1.3);
}

function zoomOut() {
  if (!svg || !zoomBehavior) return;
  svg.transition().duration(300).call(zoomBehavior.scaleBy, 0.7);
}

function resetZoom() {
  if (!svg || !zoomBehavior) return;
  svg.transition().duration(500).call(zoomBehavior.transform, d3.zoomIdentity);
}

function fitToView() {
  if (!svg || !zoomBehavior || !rootG || !chartRef.value || graphNodes.value.length === 0) return;

  const containerW = chartRef.value.clientWidth || 800;
  const containerH = chartHeight.value;
  const pad = 50;

  // Use actual rendered bounding box for scale (ensures everything fits)
  const bbox = rootG.node()?.getBBox();
  if (!bbox || bbox.width === 0 || bbox.height === 0) return;

  const gW = bbox.width + pad * 2;
  const gH = bbox.height + pad * 2;
  // Bbox center in rootG coordinates
  const cx = bbox.x + bbox.width / 2;
  const cy = bbox.y + bbox.height / 2;

  // Responsive max scale: small screens (≤900px tall) cap at 1x, large screens up to 1.8x
  const vh = viewportHeight.value;
  const maxScale = vh <= 900 ? 1 : Math.min(1 + (vh - 900) / 500, 1.8);
  const scale = Math.min(containerW / gW, containerH / gH, maxScale);
  const tx = containerW / 2 - cx * scale;
  const ty = containerH / 2 - cy * scale;

  svg
    .transition()
    .duration(500)
    .call(zoomBehavior.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
}

// ─── Schema helpers ──────────────────────────────────────────────────────────

function getSchemaChangeInfo(snapshot: Snapshot): { from: number; to: number } | null {
  if (!snapshot['parent-snapshot-id']) return null;
  const parent = props.snapshotHistory.find(
    (s) => s['snapshot-id'] === snapshot['parent-snapshot-id'],
  );
  if (!parent || snapshot['schema-id'] === parent['schema-id']) return null;
  return { from: parent['schema-id'] ?? 0, to: snapshot['schema-id'] ?? 0 };
}

function getSchemaInfo(schemaId: number | undefined) {
  if (schemaId == null || !props.table.metadata.schemas?.length) return null;
  return props.table.metadata.schemas.find((s: any) => s['schema-id'] === schemaId);
}

function getEffectiveSchemaId(snapshot: Snapshot): number | undefined {
  return snapshot['schema-id'] ?? props.table.metadata['current-schema-id'];
}

function getEffectiveSchemaInfo(snapshot: Snapshot) {
  return getSchemaInfo(getEffectiveSchemaId(snapshot));
}

function getSchemaChanges(snapshot: Snapshot): boolean {
  return getSchemaChangeInfo(snapshot) !== null;
}

function isFieldNew(field: any, snapshot: Snapshot): boolean {
  const idx = props.snapshotHistory.findIndex((s) => s['snapshot-id'] === snapshot['snapshot-id']);
  if (idx === props.snapshotHistory.length - 1) return false;
  const nextVersion = props.snapshotHistory[idx + 1];
  const nextSchema = getSchemaInfo(nextVersion['schema-id']);
  if (!nextSchema) return true;
  return !nextSchema.fields.some((f: any) => f.id === field.id);
}

// ─── Formatting helpers ──────────────────────────────────────────────────────

function getFieldIcon(field: any): string {
  const type = field.type;
  if (typeof type === 'string') {
    switch (type.toLowerCase()) {
      case 'string':
        return 'mdi-format-text';
      case 'int':
      case 'integer':
      case 'long':
      case 'double':
      case 'float':
        return 'mdi-numeric';
      case 'boolean':
        return 'mdi-checkbox-outline';
      case 'date':
        return 'mdi-calendar';
      case 'timestamp':
        return 'mdi-clock-outline';
      default:
        return 'mdi-file-outline';
    }
  }
  if (typeof type === 'object') {
    if (type.type === 'list') return 'mdi-format-list-bulleted';
    if (type.type === 'map') return 'mdi-code-braces';
    if (type.type === 'struct') return 'mdi-code-braces-box';
  }
  return 'mdi-file-outline';
}

function getFieldTypeString(type: any): string {
  if (typeof type === 'string') return type;
  if (typeof type === 'object') {
    if (type.type === 'list') return `list<${getFieldTypeString(type.element)}>`;
    if (type.type === 'map')
      return `map<${getFieldTypeString(type.key)}, ${getFieldTypeString(type.value)}>`;
    if (type.type === 'struct') return 'struct';
    return type.type || 'unknown';
  }
  return 'unknown';
}

function formatSummaryKey(key: string): string {
  return key
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function truncateManifest(path: string, maxLen = 60): string {
  if (!path || path.length <= maxLen + 3) return path;
  return path.slice(0, maxLen) + '…';
}

function copyToClipboard(text: string) {
  functions.copyToClipboard(text);
}

function formatSummaryValue(value: any): string {
  if (value == null) return 'N/A';
  if (typeof value === 'number') return value >= 1000 ? value.toLocaleString() : String(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string') {
    if (value.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/))
      return new Date(value).toLocaleString();
    return value;
  }
  if (Array.isArray(value)) return `[${value.length} items]`;
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

function getOperationColor(operation: string): string {
  const map: Record<string, string> = {
    append: 'success',
    overwrite: 'warning',
    delete: 'error',
    replace: 'primary',
    merge: 'info',
    optimize: 'secondary',
    expire: 'orange',
    compact: 'teal',
  };
  return map[operation?.toLowerCase()] || 'default';
}

// ─── Lifecycle: D3 owns the SVG ─────────────────────────────────────────────

// Render when the container div appears and when data changes
watch(
  [chartRef, () => props.snapshotHistory, () => props.table.metadata.refs],
  () => {
    if (chartRef.value && props.snapshotHistory.length > 0) {
      renderChart();
    }
  },
  { immediate: true, deep: true },
);

// Re-render when chart height changes due to viewport resize
watch(chartHeight, () => {
  if (chartRef.value && props.snapshotHistory.length > 0) {
    nextTick(() => {
      renderChart();
      requestAnimationFrame(() => fitToView());
    });
  }
});

// Update selected node highlight when selection changes
watch(selectedSnapshot, (snap) => {
  if (!rootG) return;
  // Solid circle highlight
  rootG
    .selectAll<SVGCircleElement, GraphNode>('.nodes .node-fill')
    .attr('stroke-width', (d) => (snap && snap['snapshot-id'] === d.snapshotId ? 3.5 : 2));
  // Outer ring pulse on selected
  rootG
    .selectAll<SVGCircleElement, GraphNode>('.nodes .node-ring')
    .attr('opacity', (d) => (snap && snap['snapshot-id'] === d.snapshotId ? 0.9 : 0.4))
    .attr('stroke-width', (d) => (snap && snap['snapshot-id'] === d.snapshotId ? 2.5 : 1.5))
    .attr('filter', (d) =>
      snap && snap['snapshot-id'] === d.snapshotId ? 'url(#selectedPulse)' : 'url(#nodeGlow)',
    );
});

// ─── Dropped Snapshot Guard ──────────────────────────────────────────────────
/**
 * True when the selected snapshot belongs exclusively to dropped branches,
 * meaning it is not reachable from any active branch or tag.
 */
const isSelectedSnapshotDropped = computed(() => {
  if (!selectedSnapshot.value) return false;
  const sidStr = String(selectedSnapshot.value['snapshot-id']);
  // Check if any active (non-dropped) branch has this snapshot in its ancestry
  const reachableFromActive = branches.value.some(
    (b) => b.type !== 'dropped' && b.ancestry.some((id) => String(id) === sidStr),
  );
  if (reachableFromActive) return false;
  // Check if any tag points to this snapshot
  const taggedSnapshot = tags.value.some((t) => String(t.snapshotId) === sidStr);
  if (taggedSnapshot) return false;
  return true;
});

// ─── Rollback Logic ──────────────────────────────────────────────────────────

/**
 * Branches that the selected snapshot belongs to, where it is NOT the current tip.
 * Only shows the branch that "owns" this snapshot — i.e., whose exclusive ancestry
 * includes it, avoiding showing rollback for shared ancestor snapshots on other branches.
 */
const rollbackableBranches = computed<BranchMeta[]>(() => {
  if (!selectedSnapshot.value || !props.canRollback) return [];
  const sid = selectedSnapshot.value['snapshot-id'];
  const sidStr = String(sid);

  // Find all non-dropped branches that contain this snapshot in their ancestry
  const candidateBranches = branches.value.filter((b) => {
    if (b.type !== 'branch') return false;
    if (!b.ancestry.some((id) => String(id) === sidStr)) return false;
    if (String(b.tipSnapshotId) === sidStr) return false;
    return true;
  });

  // Special case: if snapshot is tagged but not reachable from any active branch,
  // offer rollback to main (tags anchor snapshots as valid restore points)
  if (candidateBranches.length === 0) {
    const isTagged = tags.value.some((t) => String(t.snapshotId) === sidStr);
    if (isTagged) {
      const mainBranch = branches.value.find(
        (b) => b.type === 'branch' && (b.name === 'main' || b.name === 'master'),
      );
      if (mainBranch && String(mainBranch.tipSnapshotId) !== sidStr) {
        return [mainBranch];
      }
    }
    return [];
  }

  if (candidateBranches.length <= 1) return candidateBranches;

  // If multiple branches share this snapshot, only offer rollback on branches
  // where this snapshot is "exclusive" — not shared with a longer/main branch.
  // A snapshot is exclusive to a branch if no other candidate branch also contains it
  // with a longer ancestry chain (i.e., the snapshot is in the shared trunk).
  const exclusive = candidateBranches.filter((branch) => {
    const otherBranches = candidateBranches.filter((b) => b.name !== branch.name);
    // If every other branch also has this snapshot, it's shared — but keep it
    // for the branch with the shortest ancestry (the one that was forked later,
    // meaning this snapshot is closer to its tip). If this branch has the longest
    // ancestry containing this snapshot, it's the "trunk" owner.
    const branchAncestryIdx = branch.ancestry.findIndex((id) => String(id) === sidStr);
    // Check if any other branch has a shorter path to this snapshot (owns it more)
    const anyOtherOwnsMore = otherBranches.some((other) => {
      const otherIdx = other.ancestry.findIndex((id) => String(id) === sidStr);
      return otherIdx >= 0 && otherIdx < branchAncestryIdx;
    });
    return !anyOtherOwnsMore;
  });

  return exclusive.length > 0 ? exclusive : candidateBranches;
});

// ─── Computed: fast-forwardable branches ─────────────────────────────────────
// A branch can be fast-forwarded to the selected snapshot if:
//   1. It's an active branch (not dropped/tag)
//   2. Its tip is an ANCESTOR of the selected snapshot (the selected snapshot is ahead)
//   3. Its tip is not already the selected snapshot
const fastForwardableBranches = computed<BranchMeta[]>(() => {
  if (!selectedSnapshot.value || !props.canRollback) return [];
  const sid = selectedSnapshot.value['snapshot-id'];
  const sidStr = String(sid);

  // Build ancestor chain from selected snapshot back to root
  const ancestorIds = new Set<string>();
  let current: Snapshot | undefined = selectedSnapshot.value;
  while (current) {
    const parentId: number | undefined = current['parent-snapshot-id'];
    if (parentId == null) break;
    ancestorIds.add(String(parentId));
    current = props.snapshotHistory.find((s) => String(s['snapshot-id']) === String(parentId));
  }

  return branches.value.filter((b) => {
    if (b.type !== 'branch') return false;
    // The branch tip must not already be this snapshot
    if (String(b.tipSnapshotId) === sidStr) return false;
    // The branch tip must be an ancestor of the selected snapshot
    return ancestorIds.has(String(b.tipSnapshotId));
  });
});

// ─── Computed: existing branch names ─────────────────────────────────────────
const existingBranchNames = computed(() =>
  branches.value.filter((b) => b.type === 'branch').map((b) => b.name),
);

const existingTagNames = computed(() => tags.value.map((t) => t.name));

const existingRefNames = computed(() => [...existingBranchNames.value, ...existingTagNames.value]);

// ─── Computed: deletable branches ────────────────────────────────────────────
// Non-main/master branches whose ancestry includes the selected snapshot
const deletableBranches = computed<BranchMeta[]>(() => {
  if (!selectedSnapshot.value || !props.canRollback) return [];
  const sidStr = String(selectedSnapshot.value['snapshot-id']);

  return branches.value.filter((b) => {
    if (b.type !== 'branch') return false;
    if (b.name === 'main' || b.name === 'master') return false;
    // Only offer delete when the selected snapshot is this branch's tip
    return String(b.tipSnapshotId) === sidStr;
  });
});

// ─── Computed: deletable tags ────────────────────────────────────────────────
// Tags pointing to the selected snapshot
const deletableTags = computed<TagMeta[]>(() => {
  if (!selectedSnapshot.value || !props.canRollback) return [];
  const sid = selectedSnapshot.value['snapshot-id'];
  return tags.value.filter((t) => t.snapshotId === sid);
});

// ─── Create Branch ───────────────────────────────────────────────────────────
function openCreateBranchDialog() {
  createBranchName.value = '';
  createBranchDialog.value = true;
}

function closeCreateBranchDialog() {
  createBranchDialog.value = false;
  createBranchName.value = '';
}

async function executeCreateBranch() {
  if (
    !createBranchName.value ||
    !selectedSnapshot.value ||
    !props.warehouseId ||
    !props.namespacePath ||
    !props.tableName
  )
    return;

  createBranchLoading.value = true;
  try {
    await functions.createBranch(
      props.warehouseId,
      props.namespacePath,
      props.tableName,
      createBranchName.value,
      selectedSnapshot.value['snapshot-id'],
      true,
    );
    closeCreateBranchDialog();
    emit('createBranch');
  } catch (error: any) {
    console.error('Failed to create branch:', error);
  } finally {
    createBranchLoading.value = false;
  }
}

// ─── Rename Branch ───────────────────────────────────────────────────────────
function openRenameBranchDialog(branchName: string) {
  renameBranchOldName.value = branchName;
  renameBranchNewName.value = '';
  renameBranchDialog.value = true;
}

function closeRenameBranchDialog() {
  renameBranchDialog.value = false;
  renameBranchOldName.value = '';
  renameBranchNewName.value = '';
}

async function executeRenameBranch() {
  if (
    !renameBranchOldName.value ||
    !renameBranchNewName.value ||
    !props.warehouseId ||
    !props.namespacePath ||
    !props.tableName
  )
    return;

  const branch = branches.value.find((b) => b.name === renameBranchOldName.value);
  if (!branch) return;

  renameBranchLoading.value = true;
  try {
    await functions.renameBranch(
      props.warehouseId,
      props.namespacePath,
      props.tableName,
      renameBranchOldName.value,
      renameBranchNewName.value,
      branch.tipSnapshotId,
      true,
    );
    closeRenameBranchDialog();
    emit('renameBranch');
  } catch (error: any) {
    console.error('Failed to rename branch:', error);
  } finally {
    renameBranchLoading.value = false;
  }
}

// ─── Delete Branch ───────────────────────────────────────────────────────────
function openDeleteBranchDialog(branchName: string) {
  deleteBranchName.value = branchName;
  deleteBranchConfirmText.value = '';
  deleteBranchDialog.value = true;
}

function closeDeleteBranchDialog() {
  deleteBranchDialog.value = false;
  deleteBranchName.value = '';
  deleteBranchConfirmText.value = '';
}

async function executeDeleteBranch() {
  if (!deleteBranchName.value || !props.warehouseId || !props.namespacePath || !props.tableName)
    return;

  deleteBranchLoading.value = true;
  try {
    await functions.deleteBranch(
      props.warehouseId,
      props.namespacePath,
      props.tableName,
      deleteBranchName.value,
      true,
    );
    closeDeleteBranchDialog();
    selectedSnapshot.value = null;
    emit('deleteBranch');
  } catch (error: any) {
    console.error('Failed to delete branch:', error);
  } finally {
    deleteBranchLoading.value = false;
  }
}

// ─── Create Tag ──────────────────────────────────────────────────────────────
function openCreateTagDialog() {
  createTagName.value = '';
  createTagDialog.value = true;
}

function closeCreateTagDialog() {
  createTagDialog.value = false;
  createTagName.value = '';
}

async function executeCreateTag() {
  if (
    !createTagName.value ||
    !selectedSnapshot.value ||
    !props.warehouseId ||
    !props.namespacePath ||
    !props.tableName
  )
    return;

  createTagLoading.value = true;
  try {
    await functions.createTag(
      props.warehouseId,
      props.namespacePath,
      props.tableName,
      createTagName.value,
      selectedSnapshot.value['snapshot-id'],
      true,
    );
    closeCreateTagDialog();
    emit('createTag');
  } catch (error: any) {
    console.error('Failed to create tag:', error);
  } finally {
    createTagLoading.value = false;
  }
}

// ─── Rename Tag ──────────────────────────────────────────────────────────────
function openRenameTagDialog(tagName: string) {
  renameTagOldName.value = tagName;
  renameTagNewName.value = '';
  renameTagDialog.value = true;
}

function closeRenameTagDialog() {
  renameTagDialog.value = false;
  renameTagOldName.value = '';
  renameTagNewName.value = '';
}

async function executeRenameTag() {
  if (
    !renameTagOldName.value ||
    !renameTagNewName.value ||
    !props.warehouseId ||
    !props.namespacePath ||
    !props.tableName
  )
    return;

  const tag = tags.value.find((t) => t.name === renameTagOldName.value);
  if (!tag) return;

  renameTagLoading.value = true;
  try {
    await functions.renameTag(
      props.warehouseId,
      props.namespacePath,
      props.tableName,
      renameTagOldName.value,
      renameTagNewName.value,
      tag.snapshotId,
      true,
    );
    closeRenameTagDialog();
    emit('renameTag');
  } catch (error: any) {
    console.error('Failed to rename tag:', error);
  } finally {
    renameTagLoading.value = false;
  }
}

// ─── Delete Tag ──────────────────────────────────────────────────────────────
function openDeleteTagDialog(tagName: string) {
  deleteTagName.value = tagName;
  deleteTagConfirmText.value = '';
  deleteTagDialog.value = true;
}

function closeDeleteTagDialog() {
  deleteTagDialog.value = false;
  deleteTagName.value = '';
  deleteTagConfirmText.value = '';
}

async function executeDeleteTag() {
  if (!deleteTagName.value || !props.warehouseId || !props.namespacePath || !props.tableName)
    return;

  deleteTagLoading.value = true;
  try {
    await functions.deleteTag(
      props.warehouseId,
      props.namespacePath,
      props.tableName,
      deleteTagName.value,
      true,
    );
    closeDeleteTagDialog();
    emit('deleteTag');
  } catch (error: any) {
    console.error('Failed to delete tag:', error);
  } finally {
    deleteTagLoading.value = false;
  }
}

function openRollbackDialog() {
  rollbackTargetBranch.value =
    rollbackableBranches.value.length === 1 ? rollbackableBranches.value[0] : null;
  rollbackConfirmText.value = '';
  rollbackDialog.value = true;
}

function closeRollbackDialog() {
  rollbackDialog.value = false;
  rollbackTargetBranch.value = null;
  rollbackConfirmText.value = '';
}

async function executeRollback() {
  if (
    !rollbackTargetBranch.value ||
    !selectedSnapshot.value ||
    !props.warehouseId ||
    !props.namespacePath ||
    !props.tableName
  )
    return;

  rollbackLoading.value = true;
  try {
    await functions.rollbackBranch(
      props.warehouseId,
      props.namespacePath,
      props.tableName,
      rollbackTargetBranch.value.name,
      selectedSnapshot.value['snapshot-id'],
      rollbackTargetBranch.value.tipSnapshotId,
      true,
    );
    closeRollbackDialog();
    selectedSnapshot.value = null;
    emit('rollback');
  } catch (error: any) {
    console.error('Failed to rollback branch:', error);
  } finally {
    rollbackLoading.value = false;
  }
}

// ─── Fast Forward ────────────────────────────────────────────────────────────
function openFastForwardDialog(branch: BranchMeta) {
  fastForwardTargetBranch.value = branch;
  fastForwardConfirmText.value = '';
  fastForwardDialog.value = true;
}

function closeFastForwardDialog() {
  fastForwardDialog.value = false;
  fastForwardTargetBranch.value = null;
  fastForwardConfirmText.value = '';
}

async function executeFastForward() {
  if (
    !fastForwardTargetBranch.value ||
    !selectedSnapshot.value ||
    !props.warehouseId ||
    !props.namespacePath ||
    !props.tableName
  )
    return;

  fastForwardLoading.value = true;
  try {
    // Fast forward uses the same API as rollback — set-snapshot-ref
    await functions.rollbackBranch(
      props.warehouseId,
      props.namespacePath,
      props.tableName,
      fastForwardTargetBranch.value.name,
      selectedSnapshot.value['snapshot-id'],
      fastForwardTargetBranch.value.tipSnapshotId,
      true,
    );
    closeFastForwardDialog();
    selectedSnapshot.value = null;
    emit('fastForward');
  } catch (error: any) {
    console.error('Failed to fast-forward branch:', error);
  } finally {
    fastForwardLoading.value = false;
  }
}

onBeforeUnmount(() => {
  if (chartRef.value) {
    d3.select(chartRef.value).selectAll('svg').remove();
  }
});
</script>

<style scoped>
.branch-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* .details-scroll-area {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
} */

/* Animated flow dashes on links */
.chart-container :deep(.flow-dash) {
  animation: dashFlow 1.2s linear infinite;
}

@keyframes dashFlow {
  to {
    stroke-dashoffset: -16;
  }
}

/* Chart wrapper — height set by inline style from chartHeight */
.chart-wrapper {
  overflow: hidden;
}

.chart-container {
  width: 100%;
  height: 100%;
  overflow: hidden;
  touch-action: none;
  user-select: none;
}

/* Zoom bar — sits above chart */
.zoom-bar {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  background: rgba(var(--v-theme-surface), 0.6);
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}

.zoom-group {
  background: rgba(var(--v-theme-surface), 0.95);
  backdrop-filter: blur(4px);
  border-radius: 8px;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.12);
}

.zoom-label {
  min-width: 56px !important;
  font-size: 0.8rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}

/* Legend bar — sits between chart and details, always visible */
.legend-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.06);
}

.legend-chip {
  font-size: 0.7rem !important;
}

/* Details row — takes remaining space, scrolls internally */
.details-row {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

/* Details panel — below chart, scrollable */
.details-panel {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-top: none;
  border-radius: 0 0 8px 8px;
  background: rgba(var(--v-theme-surface), 0.98);
}

.snapshot-table {
  font-size: 0.875rem;
}

.font-mono {
  font-family: 'Roboto Mono', monospace;
  font-size: 0.875rem;
}

.text-wrap {
  word-wrap: break-word;
  word-break: break-all;
  white-space: pre-wrap;
}
</style>

<template>
  <!-- One task's details inside a DetailsSidePanel: what it is, how it went, and
       what can be done to it now. The host owns loading and the actions. -->
  <div class="tdp">
    <div class="tdp-head">
      <v-icon size="small" class="mr-2">mdi-clipboard-text-search-outline</v-icon>
      <div class="tdp-title">
        <div class="text-subtitle-2 text-truncate">
          {{ task ? formatQueueName(task['queue-name']) : 'Task' }}
        </div>
        <code v-if="taskId" class="text-caption text-medium-emphasis" :title="taskId">
          {{ taskId }}
        </code>
      </div>
      <v-chip
        v-if="task"
        :color="getStatusColor(task.status)"
        size="x-small"
        variant="flat"
        class="mx-2">
        {{ task.status }}
      </v-chip>
      <v-btn icon="mdi-close" variant="text" size="small" title="Close" @click="emit('close')" />
    </div>
    <v-divider />

    <div class="tdp-body">
      <v-progress-linear v-if="loading" indeterminate color="primary" />
      <div v-else-if="error" class="pa-4">
        <div class="text-body-2 text-medium-emphasis mb-3">{{ error }}</div>
        <v-btn size="small" variant="outlined" @click="emit('retry')">Try again</v-btn>
      </div>
      <TaskDetails
        v-else
        embedded
        :task="details"
        :format-queue-name="formatQueueName"
        @copy="emit('copy', $event)" />
    </div>

    <!-- What can be done to this task now, where its details are read. -->
    <template v-if="task && canControl && actionable">
      <v-divider />
      <div class="tdp-foot">
        <v-btn
          v-if="task.status === 'SCHEDULED'"
          size="small"
          variant="tonal"
          color="success"
          prepend-icon="mdi-play"
          @click="emit('run-now', task)">
          Run now
        </v-btn>
        <v-btn
          v-if="task.status === 'RUNNING'"
          size="small"
          variant="tonal"
          color="warning"
          prepend-icon="mdi-stop"
          @click="emit('stop', task)">
          Stop
        </v-btn>
        <v-btn
          size="small"
          variant="tonal"
          color="error"
          prepend-icon="mdi-cancel"
          @click="emit('cancel', task)">
          Cancel
        </v-btn>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import TaskDetails from './TaskDetails.vue';
import { getStatusColor } from '../common/taskUtils';
import type { TaskStatus } from '../gen/management/types.gen';

/** The list's row for the task: its status drives the actions. */
type TaskRow = { 'task-id': string; 'queue-name': string; status: TaskStatus };

const props = defineProps<{
  /** The task's row in the list, once it is there. */
  task: TaskRow | null;
  /** The id asked for, shown even when the row or the read is missing. */
  taskId: string;
  details: any;
  loading: boolean;
  error: string;
  canControl: boolean;
  formatQueueName: (queueName: string) => string;
}>();

const emit = defineEmits<{
  close: [];
  retry: [];
  copy: [text: string];
  'run-now': [task: any];
  stop: [task: any];
  cancel: [task: any];
}>();

const actionable = computed(
  () => !!props.task && ['SCHEDULED', 'RUNNING'].includes(props.task.status),
);
</script>

<style scoped>
.tdp {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.tdp-head {
  display: flex;
  align-items: center;
  padding: 8px 8px 8px 16px;
  flex: none;
}

.tdp-title {
  flex: 1 1 auto;
  min-width: 0;
}

.tdp-title code {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tdp-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
}

.tdp-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 8px 12px;
  flex: none;
}
</style>

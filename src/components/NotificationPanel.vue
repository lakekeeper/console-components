<template>
  <v-dialog v-model="notificationStore.isOpen" max-width="500" class="notification-dialog">
    <v-card class="notification-panel">
      <!-- Header -->
      <v-card-title class="d-flex align-center justify-space-between pa-4 bg-surface-variant">
        <div class="d-flex align-center">
          <v-icon class="mr-2">mdi-bell</v-icon>
          <span>Notifications</span>
          <v-chip
            v-if="notificationStore.unreadCount > 0"
            :text="notificationStore.unreadCount.toString()"
            color="primary"
            size="small"
            class="ml-2" />
        </div>

        <div class="d-flex align-center">
          <v-btn
            v-if="notificationStore.notifications.length > 0"
            icon="mdi-check-all"
            size="small"
            variant="text"
            @click="markAllAsRead"
            :title="'Mark all as read'"></v-btn>
          <v-btn
            v-if="notificationStore.notifications.length > 0"
            icon="mdi-delete-sweep"
            size="small"
            variant="text"
            color="error"
            @click="clearAll"
            :title="'Clear all'"></v-btn>
          <v-btn
            icon="mdi-close"
            size="small"
            variant="text"
            @click="notificationStore.closePanel"></v-btn>
        </div>
      </v-card-title>

      <v-divider />

      <!-- Content -->
      <v-card-text class="pa-0" style="max-height: 500px; overflow-y: auto">
        <div v-if="notificationStore.notifications.length === 0" class="pa-4 text-center">
          <v-icon size="64" color="grey-lighten-1" class="mb-4">mdi-bell-off</v-icon>
          <div class="text-body-1 text-grey">No notifications yet</div>
          <div class="text-caption text-grey">Events from snackbar messages will appear here</div>
        </div>

        <div v-else>
          <div
            v-for="(notifications, dateKey) in notificationStore.groupedNotifications"
            :key="dateKey"
            class="notification-group">
            <!-- Date Header -->
            <v-subheader class="text-caption font-weight-bold text-grey px-4 py-2">
              {{ formatDateHeader(dateKey) }}
            </v-subheader>

            <!-- Notifications for this date -->
            <div
              v-for="notification in notifications"
              :key="notification.id"
              class="notification-item"
              :class="{ 'notification-unread': !notification.read }"
              @click="markAsRead(notification.id)">
              <v-card
                flat
                class="ma-2"
                :class="{ 'notification-card-unread': !notification.read }"
                @click="markAsRead(notification.id)">
                <v-card-text class="py-3">
                  <div class="d-flex align-start">
                    <v-icon
                      :color="getNotificationColor(notification.type)"
                      :icon="getNotificationIcon(notification.type)"
                      class="mr-3 mt-1"
                      size="small"></v-icon>

                    <div class="flex-grow-1">
                      <div class="text-body-2 mb-1">{{ notification.text }}</div>

                      <div class="d-flex align-center justify-space-between">
                        <div class="text-caption text-grey">
                          <span v-if="notification.function" class="font-weight-medium">
                            {{ notification.function }}
                          </span>
                          <span v-if="notification.function">•</span>
                          <span>{{ formatTime(notification.timestamp) }}</span>
                        </div>

                        <v-chip
                          :color="getNotificationColor(notification.type)"
                          size="x-small"
                          variant="outlined">
                          {{ getNotificationTypeText(notification.type) }}
                        </v-chip>
                      </div>
                    </div>

                    <div v-if="!notification.read" class="notification-unread-dot ml-2 mt-1"></div>
                  </div>
                </v-card-text>
              </v-card>
            </div>
          </div>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { useNotificationStore } from '@/stores/notifications';
import { Type } from '@/common/enums';

const notificationStore = useNotificationStore();

function markAsRead(id: string) {
  notificationStore.markAsRead(id);
}

function markAllAsRead() {
  notificationStore.markAllAsRead();
}

function clearAll() {
  notificationStore.clearAll();
}

function formatDateHeader(dateString: string): string {
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  } else {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getNotificationColor(type: Type): string {
  switch (type) {
    case Type.SUCCESS:
      return 'success';
    case Type.ERROR:
      return 'error';
    case Type.WARNING:
      return 'warning';
    case Type.INFO:
    default:
      return 'info';
  }
}

function getNotificationIcon(type: Type): string {
  switch (type) {
    case Type.SUCCESS:
      return 'mdi-check-circle';
    case Type.ERROR:
      return 'mdi-alert-circle';
    case Type.WARNING:
      return 'mdi-alert';
    case Type.INFO:
    default:
      return 'mdi-information';
  }
}

function getNotificationTypeText(type: Type): string {
  switch (type) {
    case Type.SUCCESS:
      return 'Success';
    case Type.ERROR:
      return 'Error';
    case Type.WARNING:
      return 'Warning';
    case Type.INFO:
    default:
      return 'Info';
  }
}
</script>

<style scoped>
.notification-panel {
  z-index: 9999;
}

.notification-header {
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.notification-item {
  transition: background-color 0.2s ease;
  cursor: pointer;
}

.notification-item:hover {
  background-color: rgba(var(--v-theme-surface-variant), 0.1);
}

.notification-card-unread {
  border-left: 3px solid rgb(var(--v-theme-primary));
}

.notification-unread-dot {
  width: 8px;
  height: 8px;
  background-color: rgb(var(--v-theme-primary));
  border-radius: 50%;
}

.notification-group:not(:last-child) {
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  padding-bottom: 8px;
  margin-bottom: 8px;
}

/* Dialog and panel styling */
.notification-dialog {
  z-index: 9999 !important;
}

.notification-panel {
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}
</style>

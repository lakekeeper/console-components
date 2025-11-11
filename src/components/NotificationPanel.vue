<template>
  <v-navigation-drawer
    v-model="notificationStore.isOpen"
    temporary
    location="right"
    width="600"
    :style="{
      position: 'fixed',
      top: '0',
      right: '0',
      height: '100vh',
      zIndex: 9999,
      overflow: 'hidden',
    }">
    <!-- Root container with absolute positioning and flex layout -->
    <div
      :style="{
        position: 'absolute',
        top: '0',
        left: '0',
        right: '0',
        bottom: '0',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100%',
        overflow: 'hidden',
        backgroundColor: 'rgb(var(--v-theme-surface))',
      }">
      <!-- Fixed Header Section - Absolutely positioned at top -->
      <div
        :style="{
          position: 'absolute',
          top: '0',
          left: '0',
          right: '0',
          zIndex: '100',
          backgroundColor: 'rgb(var(--v-theme-surface))',
          borderBottom: '1px solid rgba(var(--v-border-color), var(--v-border-opacity))',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        }">
        <!-- Header -->
        <v-card class="notification-header" flat>
          <v-card-title class="d-flex align-center justify-space-between pa-4">
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
        </v-card>

        <v-divider />

        <!-- Filter Section -->
        <v-card
          flat
          :style="{ padding: '8px 16px', backgroundColor: 'rgb(var(--v-theme-surface))' }">
          <div class="text-caption text-grey mb-2">Filter by type:</div>
          <div class="d-flex gap-2 flex-wrap">
            <v-chip
              :color="selectedFilter === 'all' ? 'primary' : 'default'"
              :variant="selectedFilter === 'all' ? 'flat' : 'outlined'"
              size="small"
              @click="setFilter('all')"
              class="filter-chip">
              All ({{ notificationStore.notifications.length }})
            </v-chip>
            <v-chip
              :color="selectedFilter === TypeEnum.SUCCESS ? 'success' : 'default'"
              :variant="selectedFilter === TypeEnum.SUCCESS ? 'flat' : 'outlined'"
              size="small"
              @click="setFilter(TypeEnum.SUCCESS)"
              class="filter-chip">
              <v-icon size="x-small" class="mr-1">
                {{ getNotificationIcon(TypeEnum.SUCCESS) }}
              </v-icon>
              Success ({{ getCountByType(TypeEnum.SUCCESS) }})
            </v-chip>
            <v-chip
              :color="selectedFilter === TypeEnum.ERROR ? 'error' : 'default'"
              :variant="selectedFilter === TypeEnum.ERROR ? 'flat' : 'outlined'"
              size="small"
              @click="setFilter(TypeEnum.ERROR)"
              class="filter-chip">
              <v-icon size="x-small" class="mr-1">{{ getNotificationIcon(TypeEnum.ERROR) }}</v-icon>
              Error ({{ getCountByType(TypeEnum.ERROR) }})
            </v-chip>
            <v-chip
              :color="selectedFilter === TypeEnum.WARNING ? 'warning' : 'default'"
              :variant="selectedFilter === TypeEnum.WARNING ? 'flat' : 'outlined'"
              size="small"
              @click="setFilter(TypeEnum.WARNING)"
              class="filter-chip">
              <v-icon size="x-small" class="mr-1">
                {{ getNotificationIcon(TypeEnum.WARNING) }}
              </v-icon>
              Warning ({{ getCountByType(TypeEnum.WARNING) }})
            </v-chip>
            <v-chip
              :color="selectedFilter === TypeEnum.INFO ? 'info' : 'default'"
              :variant="selectedFilter === TypeEnum.INFO ? 'flat' : 'outlined'"
              size="small"
              @click="setFilter(TypeEnum.INFO)"
              class="filter-chip">
              <v-icon size="x-small" class="mr-1">{{ getNotificationIcon(TypeEnum.INFO) }}</v-icon>
              Info ({{ getCountByType(TypeEnum.INFO) }})
            </v-chip>
          </div>
        </v-card>

        <v-divider />
      </div>

      <!-- Scrollable Content - Positioned below fixed header -->
      <div
        :style="{
          position: 'absolute',
          top: '220px',
          left: '0',
          right: '0',
          bottom: '0',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }">
        <!-- This is the ONLY element that scrolls -->
        <div
          :style="{
            flex: '1',
            overflowY: 'auto',
            overflowX: 'hidden',
            height: '100%',
            padding: '0',
            margin: '0',
            scrollbarWidth: 'thin',
          }">
          <div
            v-if="filteredNotifications.length === 0"
            :style="{ padding: '16px', textAlign: 'center' }">
            <v-icon size="64" color="grey-lighten-1" class="mb-4">
              {{ selectedFilter === 'all' ? 'mdi-bell-off' : 'mdi-filter-off' }}
            </v-icon>
            <div class="text-body-1 text-grey">
              {{
                selectedFilter === 'all'
                  ? 'No notifications yet'
                  : `No ${selectedFilter} notifications`
              }}
            </div>
            <div class="text-caption text-grey">
              {{
                selectedFilter === 'all'
                  ? 'Events from function calls will appear here'
                  : 'Try changing the filter to see other notifications'
              }}
            </div>
          </div>

          <div v-else :style="{ paddingBottom: '16px', width: '100%' }">
            <div
              v-for="(notifications, dateKey) in filteredGroupedNotifications"
              :key="dateKey"
              :style="{
                borderBottom: '1px solid rgba(var(--v-border-color), var(--v-border-opacity))',
                paddingBottom: '8px',
                marginBottom: '8px',
              }">
              <!-- Date Header -->
              <v-list-subheader
                :style="{ padding: '8px 16px' }"
                class="text-caption font-weight-bold text-grey">
                {{ formatDateHeader(dateKey) }}
              </v-list-subheader>

              <!-- Notifications for this date -->
              <div
                v-for="notification in notifications"
                :key="notification.id"
                :style="{
                  transition: 'background-color 0.2s ease',
                  cursor: 'pointer',
                }"
                @mouseover="
                  (e) => {
                    const target = e.target as HTMLElement;
                    const btn = target.querySelector(
                      '.notification-delete-btn-inline',
                    ) as HTMLElement;
                    if (btn) btn.style.opacity = '1';
                  }
                "
                @mouseleave="
                  (e) => {
                    const target = e.target as HTMLElement;
                    const btn = target.querySelector(
                      '.notification-delete-btn-inline',
                    ) as HTMLElement;
                    if (btn) btn.style.opacity = '0';
                  }
                "
                @click="markAsRead(notification.id)">
                <v-card
                  flat
                  :style="{
                    margin: '8px',
                    borderLeft: !notification.read
                      ? '3px solid rgb(var(--v-theme-primary))'
                      : 'none',
                    cursor: 'pointer',
                  }"
                  @click.stop="openNotificationDetails(notification)">
                  <v-card-text class="py-3">
                    <div class="d-flex align-start">
                      <v-icon
                        :color="getNotificationColor(notification.type)"
                        :icon="getNotificationIcon(notification.type)"
                        class="mr-3 mt-1"
                        size="small"></v-icon>

                      <div class="flex-grow-1">
                        <!-- Title (function name or first part of text) -->
                        <div class="text-subtitle-2 mb-1 font-weight-medium">
                          {{ getNotificationTitle(notification) }}
                        </div>

                        <!-- Short description -->
                        <div class="text-body-2 text-grey mb-2">
                          {{ getNotificationDescription(notification) }}
                        </div>

                        <div class="d-flex align-center justify-space-between">
                          <div class="text-caption text-grey">
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

                      <div class="d-flex align-center ml-2">
                        <div
                          v-if="!notification.read"
                          :style="{
                            width: '8px',
                            height: '8px',
                            backgroundColor: 'rgb(var(--v-theme-primary))',
                            borderRadius: '50%',
                            marginRight: '8px',
                          }"></div>
                        <v-btn
                          icon="mdi-close"
                          size="x-small"
                          variant="text"
                          color="grey"
                          :style="{ opacity: '0', transition: 'opacity 0.2s ease' }"
                          @click.stop="deleteNotification(notification.id)"
                          :title="'Delete notification'"
                          class="notification-delete-btn-inline"></v-btn>
                      </div>
                    </div>
                  </v-card-text>
                </v-card>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </v-navigation-drawer>

  <!-- Notification Details Modal -->
  <v-dialog v-model="detailsDialog" max-width="600" persistent>
    <v-card>
      <v-card-title class="d-flex align-center justify-space-between pa-4">
        <div class="d-flex align-center">
          <v-icon
            :color="selectedNotification ? getNotificationColor(selectedNotification.type) : 'grey'"
            :icon="
              selectedNotification ? getNotificationIcon(selectedNotification.type) : 'mdi-bell'
            "
            class="mr-2"
            size="large"></v-icon>
          <span>Notification Details</span>
        </div>
        <v-btn icon="mdi-close" size="small" variant="text" @click="closeDetails"></v-btn>
      </v-card-title>

      <v-divider />

      <v-card-text v-if="selectedNotification" class="pa-4">
        <!-- Function Name -->
        <div v-if="selectedNotification.function" class="mb-3">
          <div class="text-subtitle-2 font-weight-bold text-grey-darken-1 mb-1">Function</div>
          <v-chip :color="getNotificationColor(selectedNotification.type)" variant="outlined">
            {{ selectedNotification.function }}
          </v-chip>
        </div>

        <!-- Message -->
        <div class="mb-3">
          <div class="text-subtitle-2 font-weight-bold text-grey-darken-1 mb-1">Message</div>
          <div class="text-body-1">{{ selectedNotification.text }}</div>
        </div>

        <!-- Stack Trace -->
        <div class="mb-3">
          <div class="text-subtitle-2 font-weight-bold text-grey-darken-1 mb-1">Stack Trace</div>
          <pre class="text-body-1">{{ selectedNotification.stack }}</pre>
        </div>

        <!-- Timestamp -->
        <div class="mb-3">
          <div class="text-subtitle-2 font-weight-bold text-grey-darken-1 mb-1">Time</div>
          <div class="text-body-2">{{ formatFullTimestamp(selectedNotification.timestamp) }}</div>
        </div>

        <!-- Status -->
        <div class="mb-3">
          <div class="text-subtitle-2 font-weight-bold text-grey-darken-1 mb-1">Status</div>
          <v-chip :color="getNotificationColor(selectedNotification.type)" size="small">
            {{ getNotificationTypeText(selectedNotification.type) }}
          </v-chip>
        </div>

        <!-- Read Status -->
        <div class="mb-3">
          <div class="text-subtitle-2 font-weight-bold text-grey-darken-1 mb-1">Read Status</div>
          <v-chip
            :color="selectedNotification.read ? 'success' : 'primary'"
            size="small"
            variant="outlined">
            {{ selectedNotification.read ? 'Read' : 'Unread' }}
          </v-chip>
        </div>
      </v-card-text>

      <v-card-actions class="pa-4">
        <v-spacer></v-spacer>
        <v-btn
          v-if="selectedNotification && !selectedNotification.read"
          color="primary"
          variant="outlined"
          @click="markAsReadAndClose">
          Mark as Read
        </v-btn>
        <v-btn color="error" variant="outlined" @click="deleteAndClose">Delete</v-btn>
        <v-btn color="primary" @click="closeDetails">Close</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useNotificationStore } from '@/stores/notifications';
import { Type } from '@/common/enums';
import type { NotificationEvent } from '@/stores/notifications';

const notificationStore = useNotificationStore();

// Filter state
const selectedFilter = ref<'all' | Type>('all');

// Modal state
const detailsDialog = ref(false);
const selectedNotification = ref<NotificationEvent | null>(null);

// Computed filtered notifications
const filteredNotifications = computed(() => {
  if (selectedFilter.value === 'all') {
    return notificationStore.notifications;
  }
  return notificationStore.notifications.filter((n) => n.type === selectedFilter.value);
});

// Computed grouped filtered notifications
const filteredGroupedNotifications = computed((): Record<string, NotificationEvent[]> => {
  const filtered = filteredNotifications.value;
  const grouped: Record<string, NotificationEvent[]> = {};

  for (const notification of filtered) {
    const dateKey = new Date(notification.timestamp).toDateString();
    if (!grouped[dateKey]) {
      grouped[dateKey] = [];
    }
    grouped[dateKey].push(notification);
  }

  // Sort by date (most recent first)
  const sortedEntries = Object.entries(grouped).sort(([a], [b]) => {
    return new Date(b).getTime() - new Date(a).getTime();
  });

  // Sort notifications within each date group by timestamp (most recent first)
  for (const [, notifications] of sortedEntries) {
    notifications.sort((a, b) => b.timestamp - a.timestamp);
  }

  return Object.fromEntries(sortedEntries);
});

function markAsRead(id: string) {
  notificationStore.markAsRead(id);
}

function deleteNotification(id: string) {
  notificationStore.deleteNotification(id);
}

function markAllAsRead() {
  notificationStore.markAllAsRead();
}

function clearAll() {
  notificationStore.clearAll();
}

// Filter functions
function setFilter(filter: 'all' | Type) {
  selectedFilter.value = filter;
}

function getCountByType(type: Type): number {
  return notificationStore.notifications.filter((n) => n.type === type).length;
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

// Modal functions
function openNotificationDetails(notification: NotificationEvent): void {
  selectedNotification.value = notification;
  detailsDialog.value = true;

  // Mark as read when opened
  if (!notification.read) {
    notificationStore.markAsRead(notification.id);
  }
}

function closeDetails(): void {
  detailsDialog.value = false;
  selectedNotification.value = null;
}

function markAsReadAndClose(): void {
  if (selectedNotification.value) {
    notificationStore.markAsRead(selectedNotification.value.id);
  }
  closeDetails();
}

function deleteAndClose(): void {
  if (selectedNotification.value) {
    notificationStore.deleteNotification(selectedNotification.value.id);
  }
  closeDetails();
}

function formatFullTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// Title and description functions for condensed view
function getNotificationTitle(notification: NotificationEvent): string {
  if (notification.function) {
    return notification.function;
  }

  // Extract first few words as title
  const words = notification.text.split(' ');
  return words.slice(0, 3).join(' ') + (words.length > 3 ? '...' : '');
}

function getNotificationDescription(notification: NotificationEvent): string {
  // Return the full text as description, but limit length for display
  const maxLength = 60;
  return notification.text.length > maxLength
    ? notification.text.substring(0, maxLength) + '...'
    : notification.text;
}

// Make Type enum available in template
const TypeEnum = Type;
</script>
<style scoped>
/* Minimal CSS - everything else is inline styles */
.notification-header {
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.filter-chip {
  cursor: pointer;
  transition: all 0.2s ease;
}

.filter-chip:hover {
  transform: scale(1.05);
}

/* Override any external CSS that might interfere */
:deep(.v-navigation-drawer__content) {
  padding: 0 !important;
  overflow: hidden !important;
}
</style>

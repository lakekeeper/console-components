import { ref, computed } from 'vue';
import { defineStore } from 'pinia';
import { Type } from '@/common/enums';

export interface NotificationEvent {
  id: string;
  function?: string;
  stack: string[];
  text: string;
  type: Type;
  timestamp: number;
  read: boolean;
}

export const useNotificationStore = defineStore(
  'notifications',
  () => {
    const notifications = ref<NotificationEvent[]>([]);
    const isOpen = ref(false);

    // Add a new notification
    function addNotification(notification: Omit<NotificationEvent, 'id' | 'read' | 'timestamp'>) {
      const newNotification: NotificationEvent = {
        ...notification,
        id: `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        read: false,
      };

      notifications.value.unshift(newNotification);

      // Keep only last 100 notifications for performance
      if (notifications.value.length > 100) {
        notifications.value = notifications.value.slice(0, 100);
      }
    }

    // Mark notification as read
    function markAsRead(id: string) {
      const notification = notifications.value.find((n) => n.id === id);
      if (notification) {
        notification.read = true;
      }
    }

    // Mark all notifications as read
    function markAllAsRead() {
      notifications.value.forEach((n) => (n.read = true));
    }

    // Delete a specific notification
    function deleteNotification(id: string) {
      const index = notifications.value.findIndex((n) => n.id === id);
      if (index !== -1) {
        notifications.value.splice(index, 1);
      }
    }

    // Clear all notifications
    function clearAll() {
      notifications.value = [];
    }

    // Clear old notifications (older than 24 hours)
    function pruneOldNotifications() {
      const now = Date.now();
      const initialCount = notifications.value.length;
      notifications.value = notifications.value.filter(
        (notification) => now - notification.timestamp < 24 * 60 * 60 * 1000,
      );
    }

    // Get unread count
    const unreadCount = computed(() => notifications.value.filter((n) => !n.read).length);

    // Get notifications grouped by date
    const groupedNotifications = computed(() => {
      const groups: Record<string, NotificationEvent[]> = {};

      notifications.value.forEach((notification) => {
        const date = new Date(notification.timestamp);
        const dateKey = date.toDateString();

        if (!groups[dateKey]) {
          groups[dateKey] = [];
        }
        groups[dateKey].push(notification);
      });

      return groups;
    });

    // Toggle panel open/close
    function togglePanel() {
      isOpen.value = !isOpen.value;
    }

    function closePanel() {
      isOpen.value = false;
    }

    function openPanel() {
      isOpen.value = true;
    }

    // Set up automatic pruning every hour
    setInterval(pruneOldNotifications, 60 * 60 * 1000);

    return {
      notifications,
      isOpen,
      unreadCount,
      groupedNotifications,
      addNotification,
      markAsRead,
      markAllAsRead,
      deleteNotification,
      clearAll,
      togglePanel,
      closePanel,
      openPanel,
      pruneOldNotifications,
    };
  },
  {
    persistedState: {
      key: 'notifications',
      persist: true,
    },
  },
);

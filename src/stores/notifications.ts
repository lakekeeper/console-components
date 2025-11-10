import { ref, reactive, computed } from 'vue';
import { defineStore } from 'pinia';
import { Type } from '@/common/enums';

export interface NotificationEvent {
  id: string;
  function?: string;
  text: string;
  type: Type;
  timestamp: number;
  read: boolean;
}

export const useNotificationStore = defineStore('notifications', () => {
  const notifications = ref<NotificationEvent[]>([]);
  const isOpen = ref(false);

  // Load notifications from localStorage on initialization
  function loadFromStorage() {
    try {
      const stored = localStorage.getItem('lakekeeper-notifications');
      if (stored) {
        const parsed = JSON.parse(stored);
        // Filter out notifications older than 24 hours
        const now = Date.now();
        const validNotifications = parsed.filter(
          (notification: NotificationEvent) => now - notification.timestamp < 24 * 60 * 60 * 1000, // 24 hours
        );
        notifications.value = validNotifications;
        // Save back filtered notifications
        saveToStorage();
      }
    } catch (error) {
      console.error('Failed to load notifications from storage:', error);
      notifications.value = [];
    }
  }

  // Save notifications to localStorage
  function saveToStorage() {
    try {
      localStorage.setItem('lakekeeper-notifications', JSON.stringify(notifications.value));
    } catch (error) {
      console.error('Failed to save notifications to storage:', error);
    }
  }

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

    saveToStorage();
  }

  // Mark notification as read
  function markAsRead(id: string) {
    const notification = notifications.value.find((n) => n.id === id);
    if (notification) {
      notification.read = true;
      saveToStorage();
    }
  }

  // Mark all notifications as read
  function markAllAsRead() {
    notifications.value.forEach((n) => (n.read = true));
    saveToStorage();
  }

  // Clear all notifications
  function clearAll() {
    notifications.value = [];
    saveToStorage();
  }

  // Clear old notifications (older than 24 hours)
  function pruneOldNotifications() {
    const now = Date.now();
    const initialCount = notifications.value.length;
    notifications.value = notifications.value.filter(
      (notification) => now - notification.timestamp < 24 * 60 * 60 * 1000,
    );

    if (notifications.value.length !== initialCount) {
      saveToStorage();
    }
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

  // Initialize store
  loadFromStorage();

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
    clearAll,
    togglePanel,
    closePanel,
    openPanel,
    pruneOldNotifications,
  };
});

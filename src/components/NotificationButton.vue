<template>
  <v-btn
    icon
    size="small"
    class="ml-2"
    variant="text"
    @click="notificationStore.togglePanel"
    :title="'Notifications'">
    <v-badge
      v-if="notificationStore.unreadCount > 0"
      :content="
        notificationStore.unreadCount > 99 ? '99+' : notificationStore.unreadCount.toString()
      "
      color="error"
      overlap>
      <v-icon>mdi-bell</v-icon>
    </v-badge>
    <v-icon v-else>mdi-bell-outline</v-icon>
  </v-btn>
</template>

<script setup lang="ts">
import { useNotificationStore } from '@/stores/notifications';

const notificationStore = useNotificationStore();
</script>

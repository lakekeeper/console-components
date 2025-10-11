# @lakekeeper/console-components

A shared Vue 3 component library for Lakekeeper console applications. This library provides reusable UI components, composables, stores, and utilities built with Vue 3, Vuetify 3, and TypeScript.

## 📦 What's Included

This library exports:

- **Vue Components**: Pre-built UI components for warehouses, namespaces, tables, views, roles, users, permissions, tasks, and more
- **Composables**: `useAuth`, `usePermissions`, `useConfig` for authentication and authorization
- **Stores**: Pinia stores for user state, visual state, and permissions
- **Plugins**: Auth plugin, functions plugin for dependency injection
- **Theme**: Custom Vuetify light theme
- **Utilities**: Common interfaces, enums, and helper functions
- **OpenAPI Client**: Auto-generated API client for Lakekeeper management and catalog services

## 🚀 Installation

### From GitHub (Recommended for development)

In your consuming application's `package.json`:

```json
{
  "dependencies": {
    "@lakekeeper/console-components": "github:lakekeeper/console-components"
  }
}
```

Then run:

```bash
npm install
```

### From Local Directory (For local development)

```bash
npm install ../path/to/console-components
```

Or use npm link:

```bash
# In console-components directory
npm link

# In your app directory
npm link @lakekeeper/console-components
```

## 📋 Prerequisites

Your application must have these peer dependencies installed:

- `vue`: ^3.5.16
- `vuetify`: ^3.8.7
- `pinia`: ^2.3.0
- `vue-router`: ^4.5.0
- `oidc-client-ts`: ^3.2.1

## 🔧 Usage in Your Application

### 1. Setup App Configuration

Create your app configuration and provide it to the app:

```typescript
// src/app.config.ts
import { TokenType } from '@lakekeeper/console-components';

export const appConfig = {
  backendUrl: import.meta.env.VITE_BACKEND_URL || 'http://localhost:8181',
  idpAuthority: import.meta.env.VITE_IDP_AUTHORITY || 'http://localhost:30080/realms/iceberg',
  idpClientId: import.meta.env.VITE_IDP_CLIENT_ID || 'lakekeeper',
  idpRedirectPath: '/callback',
  idpLogoutRedirectPath: '/logout',
  idpScope: 'openid profile email',
  idpResource: '',
  idpTokenType: TokenType.ACCESS_TOKEN,
  baseUrlPrefix: import.meta.env.VITE_BASE_URL_PREFIX || '',
  enabledAuthentication: import.meta.env.VITE_ENABLED_AUTHENTICATION === 'true',
};
```

### 2. Setup Main App

```typescript
// src/main.ts
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createAuth, functionsPlugin, myCustomLightTheme } from '@lakekeeper/console-components';
import '@lakekeeper/console-components/style.css';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';
import 'vuetify/styles';
import '@mdi/font/css/materialdesignicons.css';

import App from './App.vue';
import router from './router';
import { appConfig } from './app.config';

const app = createApp(App);
const pinia = createPinia();

// Setup Vuetify with custom theme
const vuetify = createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: 'myCustomLightTheme',
    themes: {
      myCustomLightTheme,
    },
  },
});

// Provide app config
app.provide('appConfig', appConfig);

// Setup auth plugin (if authentication is enabled)
if (appConfig.enabledAuthentication) {
  const auth = createAuth(appConfig);
  app.use(auth);
}

// Setup functions plugin with your API implementations
app.use(functionsPlugin, {
  // Your function implementations here
  getServerInfo: async () => {
    /* ... */
  },
  getWarehouse: async (id) => {
    /* ... */
  },
  // ... other functions
});

app.use(pinia);
app.use(router);
app.use(vuetify);

app.mount('#app');
```

### 3. Import and Use Components

```vue
<template>
  <div>
    <WarehouseManager />
    <PermissionManager :object-id="warehouseId" :relation-type="RelationType.Warehouse" />
  </div>
</template>

<script setup lang="ts">
import { WarehouseManager, PermissionManager, RelationType } from '@lakekeeper/console-components';
import { ref } from 'vue';

const warehouseId = ref('my-warehouse');
</script>
```

### 4. Setup Router

Add the required routes for authentication:

```typescript
// src/router/index.ts
import { createRouter, createWebHistory } from 'vue-router';
import { LoginPage, LogoutPage, CallbackPage } from '@lakekeeper/console-components';

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: LoginPage,
  },
  {
    path: '/logout',
    name: 'Logout',
    component: LogoutPage,
  },
  {
    path: '/callback',
    name: 'Callback',
    component: CallbackPage,
  },
  // Your other routes...
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

export default router;
```

### 5. Use Composables

```vue
<script setup lang="ts">
import { useAuth, useConfig, useWarehousePermissions } from '@lakekeeper/console-components';
import { computed } from 'vue';

const auth = useAuth();
const config = useConfig();
const warehouseId = computed(() => 'my-warehouse');
const { canUpdate, canDelete } = useWarehousePermissions(warehouseId);

console.log('Is authenticated:', auth.isAuthenticated.value);
console.log('Can update warehouse:', canUpdate.value);
</script>
```

## 🎨 Styling

The library includes a custom Vuetify theme. Import the CSS:

```typescript
import '@lakekeeper/console-components/style.css';
```

## 🔐 Authentication

The library uses OIDC (OpenID Connect) for authentication via `oidc-client-ts`. Configure your identity provider settings in the app config.

**Key Features:**

- Automatic token refresh
- Silent token renewal
- Login/Logout pages included
- Callback handling
- Token storage in sessionStorage

## 📦 Building the Library

````bash
## 📦 Building the Library

```bash
# Install dependencies
npm install

# Build the library
npm run build

# Build and watch for changes
npm run dev

# Lint code
npm run lint

# Format code
npm run format
````

## 🏗️ Project Structure

```
console-components/
├── src/
│   ├── assets/          # Icons and images
│   ├── common/          # Shared interfaces, enums, utilities
│   ├── components/      # Vue components
│   ├── composables/     # Vue composables (useAuth, usePermissions, etc.)
│   ├── gen/             # Auto-generated OpenAPI client
│   ├── plugins/         # Vue plugins (auth, functions)
│   ├── router/          # Shared routing utilities
│   ├── stores/          # Pinia stores
│   ├── index.ts         # Main export file
│   └── theme.ts         # Vuetify theme
├── openapi/             # OpenAPI specifications
├── dist/                # Built library (generated)
└── package.json
```

## 📝 Environment Variables

Your consuming app should define:

```bash
VITE_BACKEND_URL=http://localhost:8181
VITE_IDP_AUTHORITY=http://localhost:30080/realms/iceberg
VITE_IDP_CLIENT_ID=lakekeeper
VITE_ENABLED_AUTHENTICATION=true
VITE_BASE_URL_PREFIX=
```

## 🤝 Contributing

This library is designed to be shared across multiple Lakekeeper console applications. When making changes:

1. Build the library: `npm run build`
2. Test in your consuming app
3. Commit and push changes
4. The consuming app will pick up changes on next `npm install`

## 📄 License

Apache-2.0

## 🔗 Links

- **Repository**: https://github.com/lakekeeper/console-components
- **Issues**: https://github.com/lakekeeper/console-components/issues

```

## License

Apache-2.0
```

# 🚀 Console Application Migration Guide

## Migrating from Local Components to @lakekeeper/console-components

This guide helps you update your console application to use the new component library instead of local components.

## 📦 Step 1: Install the Component Library

```bash
cd /Users/viktor/Biz/console

# Option A: Install from local path (recommended for development)
npm install file:../console-components

# Option B: If you've published to npm
# npm install @lakekeeper/console-components

# Option C: Using npm link for development
# cd ../console-components && npm link
# cd ../console && npm link @lakekeeper/console-components
```

## 🔄 Step 2: Update Component Imports

### Before (Old local imports):

```typescript
// ❌ OLD - Local component imports
import AppFooter from './components/AppFooter.vue';
import PermissionManager from './components/PermissionManager.vue';
import AppBar from './components/AppBar.vue';
```

### After (New library imports):

```typescript
// ✅ NEW - Library imports
import {
  AppFooter,
  PermissionManager,
  AppBar,
  NavigationBar,
  WarningBanner,
  SnackbarMessage,
  BreadcrumbsFromUrl,
  DialogDelete,
  ServerInformation,
  UserManager,
  UserRenameDialog,
  ProjectDialog,
  AddNamespaceDialog,
  RoleDialog,
  PermissionAssignDialog,
} from '@lakekeeper/console-components';
```

## 🎨 Step 3: Add CSS Import

Add this to your `main.ts` or `main.js`:

```typescript
import '@lakekeeper/console-components/style.css';
```

## 📝 Step 4: Update Dependency Injection (if using PermissionManager)

For components that use dependency injection, make sure you provide the functions:

```vue
<script setup lang="ts">
import { provide } from 'vue';
import {
  PermissionManager,
  AppFunctions,
  FUNCTIONS_INJECTION_KEY,
} from '@lakekeeper/console-components';

// Your existing functions
const functions = useFunctions();

// Create AppFunctions object for injection
const appFunctions: AppFunctions = {
  getUser: functions.getUser,
  getRole: functions.getRole,
  searchUser: functions.searchUser,
  searchRole: functions.searchRole,
  // Optional warehouse/namespace functions
  ...(functions.setWarehouseManagedAccess && {
    setWarehouseManagedAccess: functions.setWarehouseManagedAccess,
  }),
  ...(functions.setNamespaceManagedAccess && {
    setNamespaceManagedAccess: functions.setNamespaceManagedAccess,
  }),
  ...(functions.getWarehouseById && {
    getWarehouseById: functions.getWarehouseById,
  }),
  ...(functions.getNamespaceById && {
    getNamespaceById: functions.getNamespaceById,
  }),
};

// Provide functions to child components
provide(FUNCTIONS_INJECTION_KEY, appFunctions);
</script>
```

## 🗂️ Components Available in Library

### ✅ Core Components:

- `AppFooter` - Footer with branding
- `PermissionManager` - Permission management table _(requires dependency injection)_
- `PermissionAssignDialog` - Permission assignment dialog _(requires dependency injection)_

### ✅ Navigation Components:

- `AppBar` - Top navigation bar with user menu
- `NavigationBar` - Side navigation drawer

### ✅ Dialog Components:

- `UserRenameDialog` - User renaming dialog
- `ProjectDialog` - Project management dialog
- `AddNamespaceDialog` - Namespace creation dialog
- `RoleDialog` - Role management dialog
- `DialogDelete` - Generic deletion confirmation dialog

### ✅ Utility Components:

- `WarningBanner` - Alert banner for warnings
- `SnackbarMessage` - Toast notifications
- `BreadcrumbsFromUrl` - URL-based breadcrumb navigation _(requires dependency injection)_
- `ServerInformation` - Server status display
- `UserManager` - User management interface

## 🛠️ Automated Migration Script

Run the automated script to update all imports:

```bash
# Make sure you're in the console-components directory
cd /Users/viktor/Biz/console-components

# Run the migration script
./update-console-imports.sh
```

## 🔍 Manual Migration Steps

If you prefer to update manually, follow these steps:

### 1. Find files with old imports:

```bash
cd /Users/viktor/Biz/console
grep -r "import.*from.*['\"].*components/" src/
```

### 2. Replace imports in each file:

```bash
# Example for a specific file
sed -i '' 's/import AppFooter from.*components.*AppFooter.vue.*/import { AppFooter } from '\''@lakekeeper\/console-components'\'';/' src/YourFile.vue
```

### 3. Add CSS import to main.ts:

```bash
echo "import '@lakekeeper/console-components/style.css';" >> src/main.ts
```

## ✅ Testing the Migration

After migration:

1. **Build the console app:**

   ```bash
   cd /Users/viktor/Biz/console
   npm run build
   ```

2. **Run in development:**

   ```bash
   npm run dev
   ```

3. **Check for errors:**
   - Component not found → Check import syntax
   - Style issues → Ensure CSS import is added
   - Function errors → Check dependency injection setup

## 🔧 Troubleshooting

### Issue: Component not found

```
Error: Module not found: Can't resolve 'AppFooter'
```

**Solution:** Check that the import uses destructuring:

```typescript
import { AppFooter } from '@lakekeeper/console-components'; // ✅ Correct
import AppFooter from '@lakekeeper/console-components'; // ❌ Wrong
```

### Issue: Permission components not working

```
Error: Cannot inject functions
```

**Solution:** Ensure you provide the functions at the parent level:

```typescript
import { provide } from 'vue';
import { FUNCTIONS_INJECTION_KEY } from '@lakekeeper/console-components';
provide(FUNCTIONS_INJECTION_KEY, appFunctions);
```

### Issue: Styles not applied

**Solution:** Add CSS import to main.ts:

```typescript
import '@lakekeeper/console-components/style.css';
```

## 📦 Package Information

- **Package:** `@lakekeeper/console-components`
- **Version:** `0.0.1`
- **Bundle Size:** 56.53 kB (ES modules)
- **Components:** 15 total components
- **Dependencies:** Vue 3.x, Vuetify 3.x

## 🎉 Benefits After Migration

- ✅ **Consistent Components** - Single source of truth
- ✅ **Version Control** - Proper semantic versioning
- ✅ **Type Safety** - Full TypeScript support
- ✅ **Smaller Bundle** - Only import what you use
- ✅ **Easier Maintenance** - Updates through package manager
- ✅ **Better Testing** - Components tested in isolation

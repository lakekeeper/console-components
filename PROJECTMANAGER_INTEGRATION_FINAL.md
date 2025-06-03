# ProjectManager Component Integration Guide (Final)

## Overview

The ProjectManager component has been refactored from a dependency injection pattern to a **final optimized hybrid props + events approach**. This design provides optimal performance by using props for all static/cached data and events only for essential user-initiated actions.

## Key Changes

### Final Hybrid Approach: Optimized Props + Events

The component now uses:

- **Props** for all immediate data (statistics, project access, project list, assignments, and lookup functions)
- **Events** only for user-initiated actions requiring async business logic

#### All Props:

- `enabledAuthentication: boolean` - Whether authentication is enabled
- `enabledPermissions: boolean` - Whether permission system is enabled
- `access_token: string` - Authentication token
- `isAuthenticated: boolean` - Current authentication state
- `project: GetProjectResponse` - Current project data
- `authMethod: 'allow-all' | 'authz-backend'` - Authorization method
- `endpointStatistics?: GetEndpointStatisticsResponse` - Endpoint statistics data
- `projectAccess?: ProjectAction[]` - User's project permissions
- `projectList?: GetProjectResponse[]` - Available projects list
- `projectAssignments?: ProjectAssignment[]` - Project permission assignments
- `userLookupFunction?: (userId: string) => Promise<any>` - Function to lookup user data
- `roleLookupFunction?: (roleId: string) => Promise<any>` - Function to lookup role data

#### Emitted Events (User Actions Only):

- `renameProject` - Rename a project
- `updateProjectAssignments` - Update project assignments

#### Handler Methods (exposed via defineExpose):

- `handleProjectRenamed()` - Notify that project was renamed successfully
- `handleProjectAssignmentsUpdated()` - Notify that assignments were updated successfully

## Integration Example

```vue
<template>
  <ProjectManager
    ref="projectManagerRef"
    :enabled-authentication="true"
    :enabled-permissions="true"
    :access-token="accessToken"
    :is-authenticated="isAuthenticated"
    :project="selectedProject"
    :auth-method="authMethod"
    :endpoint-statistics="endpointStatistics"
    :project-access="projectAccess"
    :project-list="projectList"
    :project-assignments="projectAssignments"
    :user-lookup-function="getUserById"
    :role-lookup-function="getRoleById"
    @rename-project="handleRenameProject"
    @update-project-assignments="handleUpdateProjectAssignments" />
</template>

<script setup>
import { ref, computed } from 'vue';
import ProjectManager from './components/ProjectManager.vue';
import { yourBusinessLogicFunctions } from './services/api';

const projectManagerRef = ref();

// Computed props for immediate data
const endpointStatistics = computed(() => {
  // Your logic to get endpoint statistics
  return yourBusinessLogicFunctions.getEndpointStatistics();
});

const projectAccess = computed(() => {
  // Your logic to get project access permissions
  return yourBusinessLogicFunctions.getProjectAccess();
});

const projectList = computed(() => {
  // Your logic to get project list
  return yourBusinessLogicFunctions.getProjectList();
});

const projectAssignments = computed(() => {
  // Your logic to get project assignments
  return yourBusinessLogicFunctions.getProjectAssignments();
});

// Lookup functions for user/role data
async function getUserById(userId: string) {
  try {
    return await yourBusinessLogicFunctions.getUser(userId);
  } catch (error) {
    console.error('Error getting user:', error);
    return null;
  }
}

async function getRoleById(roleId: string) {
  try {
    return await yourBusinessLogicFunctions.getRole(roleId);
  } catch (error) {
    console.error('Error getting role:', error);
    return null;
  }
}

// Event handlers for user-initiated actions
async function handleRenameProject(data) {
  try {
    await yourBusinessLogicFunctions.renameProjectById(data.projectId, data.request);
    projectManagerRef.value.handleProjectRenamed();
    // Update your reactive projectList data source
    await refreshProjectData();
  } catch (error) {
    console.error('Error renaming project:', error);
  }
}

async function handleUpdateProjectAssignments(data) {
  try {
    await yourBusinessLogicFunctions.updateProjectAssignments(data.del, data.writes);
    projectManagerRef.value.handleProjectAssignmentsUpdated();
    // Update your reactive projectAssignments data source
    await refreshAssignmentData();
  } catch (error) {
    console.error('Error updating project assignments:', error);
  }
}

async function refreshProjectData() {
  // Refresh your project data sources so computed props update automatically
}

async function refreshAssignmentData() {
  // Refresh your assignment data sources so computed props update automatically
}
</script>
```

## Required Props

The component now requires these props:

```typescript
interface Props {
  enabledAuthentication: boolean;
  enabledPermissions: boolean;
  access_token: string;
  isAuthenticated: boolean;
  project: GetProjectResponse; // Changed from string to GetProjectResponse
  authMethod: 'allow-all' | 'authz-backend';

  // Optional props for data
  endpointStatistics?: GetEndpointStatisticsResponse;
  projectAccess?: ProjectAction[];
  projectList?: GetProjectResponse[];
  projectAssignments?: ProjectAssignment[];

  // Optional functions for lookups
  userLookupFunction?: (userId: string) => Promise<any>;
  roleLookupFunction?: (roleId: string) => Promise<any>;
}
```

## Benefits

1. **Maximum Performance**: All data passed as props with automatic reactivity
2. **Simplified Integration**: No complex event-response patterns for data lookups
3. **Optimal Caching**: User/role lookups cached automatically by the component
4. **Vue Reactivity**: Full use of Vue's reactive system for automatic updates
5. **Separation of Concerns**: UI logic in component, business logic in parent
6. **Type Safety**: Full TypeScript support with proper prop typing

## Migration Notes

- Pass all data as props instead of handling events
- Provide lookup functions as props for user/role data
- Only handle rename and assignment update events
- Update prop types (especially `project` from string to `GetProjectResponse`)
- Remove event handlers for data fetching operations

## Reactive Data Flow

The component now uses Vue's reactivity system optimally:

1. **All Data** (via props):

   - `endpointStatistics` - Automatically updates statistics display
   - `projectAccess` - Automatically updates permission states
   - `projectList` - Automatically updates project dropdown
   - `projectAssignments` - Automatically updates assignment table
   - `userLookupFunction` - Cached user lookup for assignments
   - `roleLookupFunction` - Cached role lookup for assignments

2. **User Actions** (via events):
   - User renames project → Component emits event → Parent handles business logic → Parent updates data sources → Props automatically update component

This approach maximizes performance while maintaining clean separation of concerns.

## Performance Optimizations

- **No Event Roundtrips**: All display data provided immediately via props
- **Automatic Caching**: User/role lookups cached by component with prop functions
- **Vue Reactivity**: Automatic updates when parent data changes
- **Minimal Events**: Only essential user actions trigger events
- **Single Source of Truth**: Parent manages all data, component focuses on UI

This is the optimal architecture for Vue.js components that need to display complex data while maintaining good performance and clean separation of concerns.

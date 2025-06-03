# ProjectManager Component Integration Guide

The ProjectManager component has been refactored to use a hybrid approach combining props for immediate data needs and events for user-initiated actions. This provides better performance and simpler integration.

## Key Changes

### Removed Dependencies

- No longer uses `inject()` for function dependency injection
- Removed direct calls to `functions.*` methods
- Component is now decoupled from business logic implementation

### Hybrid Approach: Props + Events

The component now uses:

- **Props** for immediate data (statistics, project access)
- **Events** for user-initiated actions and async operations

#### New Props:

- `endpointStatistics?: GetEndpointStatisticsResponse` - Endpoint statistics data
- `projectAccess?: ProjectAction[]` - User's project permissions

#### Emitted Events:

- `loadProjectList` - Request list of available projects
- `getProjectAssignments` - Request project permission assignments
- `updateProjectAssignments` - Update project assignments
- `renameProject` - Rename a project
- `getUser` - Request user details by ID
- `getRole` - Request role details by ID

#### Handler Methods (exposed via defineExpose):

- `handleProjectListReceived(projects)`
- `handleProjectAssignmentsReceived(assignments)`
- `handleUserReceived({ userId, user })`
- `handleRoleReceived({ roleId, role })`
- `handleProjectRenamed()`
- `handleProjectAssignmentsUpdated()`

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
    @load-project-list="handleLoadProjectList"
    @get-project-assignments="handleGetProjectAssignments"
    @update-project-assignments="handleUpdateProjectAssignments"
    @rename-project="handleRenameProject"
    @get-user="handleGetUser"
    @get-role="handleGetRole" />
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

// Event handlers for user-initiated actions
async function handleLoadProjectList() {
  try {
    const projects = await yourBusinessLogicFunctions.loadProjectList();
    projectManagerRef.value.handleProjectListReceived(projects);
  } catch (error) {
    console.error('Error loading project list:', error);
  }
}

async function handleGetProjectAssignments() {
  try {
    const assignments = await yourBusinessLogicFunctions.getProjectAssignments();
    projectManagerRef.value.handleProjectAssignmentsReceived(assignments);
  } catch (error) {
    console.error('Error getting project assignments:', error);
  }
}

async function handleUpdateProjectAssignments(data) {
  try {
    await yourBusinessLogicFunctions.updateProjectAssignments(data.del, data.writes);
    projectManagerRef.value.handleProjectAssignmentsUpdated();
  } catch (error) {
    console.error('Error updating project assignments:', error);
  }
}

async function handleRenameProject(data) {
  try {
    await yourBusinessLogicFunctions.renameProjectById(data.projectId, data.request);
    projectManagerRef.value.handleProjectRenamed();
  } catch (error) {
    console.error('Error renaming project:', error);
  }
}

async function handleGetUser(userId) {
  try {
    const user = await yourBusinessLogicFunctions.getUser(userId);
    projectManagerRef.value.handleUserReceived({ userId, user });
  } catch (error) {
    console.error('Error getting user:', error);
  }
}

async function handleGetRole(roleId) {
  try {
    const role = await yourBusinessLogicFunctions.getRole(roleId);
    projectManagerRef.value.handleRoleReceived({ roleId, role });
  } catch (error) {
    console.error('Error getting role:', error);
  }
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

  // New optional props
  endpointStatistics?: GetEndpointStatisticsResponse;
  projectAccess?: ProjectAction[];
}
```

## Benefits

1. **Better Performance**: No event roundtrip for immediate data like statistics and permissions
2. **Simpler Integration**: Computed props automatically update when data changes
3. **Separation of Concerns**: UI logic stays in component, business logic in parent
4. **Reusability**: Component can work with any backend implementation
5. **Testability**: Easier to test component and business logic separately
6. **Type Safety**: Full TypeScript support with proper prop and event typing

## Migration Notes

- Pass `endpointStatistics` and `projectAccess` as props instead of handling events
- Remove `getEndpointStatistics` and `getProjectAccess` event handlers
- Update prop types (especially `project` from string to `GetProjectResponse`)
- Implement async request handling with caching for user/role lookups
- Handle loading states appropriately in parent component

## Reactive Data Flow

The component now uses Vue's reactivity system more effectively:

1. **Immediate Data** (via props):

   - `endpointStatistics` - Automatically updates statistics display
   - `projectAccess` - Automatically updates permission states

2. **User Actions** (via events):
   - User clicks → Component emits event → Parent handles business logic → Parent calls handler method

This approach reduces complexity while maintaining the separation of concerns that makes the component reusable and testable.

## Key Changes

### Removed Dependencies

- No longer uses `inject()` for function dependency injection
- Removed direct calls to `functions.getEndpointStatistics()`, `functions.getProjectAccess()`, etc.
- Component is now decoupled from business logic implementation

### Added Event System

The component now emits events for all external operations and provides handlers for responses:

#### Emitted Events:

- `getEndpointStatistics` - Request endpoint statistics
- `getProjectAccess` - Request project access permissions
- `loadProjectList` - Request list of available projects
- `getProjectAssignments` - Request project permission assignments
- `updateProjectAssignments` - Update project assignments
- `renameProject` - Rename a project
- `getUser` - Request user details by ID
- `getRole` - Request role details by ID

#### Handler Methods (exposed via defineExpose):

- `handleEndpointStatisticsReceived(stats)`
- `handleProjectAccessReceived(access)`
- `handleProjectListReceived(projects)`
- `handleProjectAssignmentsReceived(assignments)`
- `handleUserReceived({ userId, user })`
- `handleRoleReceived({ roleId, role })`
- `handleProjectRenamed()`
- `handleProjectAssignmentsUpdated()`

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
    @get-endpoint-statistics="handleGetEndpointStatistics"
    @get-project-access="handleGetProjectAccess"
    @load-project-list="handleLoadProjectList"
    @get-project-assignments="handleGetProjectAssignments"
    @update-project-assignments="handleUpdateProjectAssignments"
    @rename-project="handleRenameProject"
    @get-user="handleGetUser"
    @get-role="handleGetRole" />
</template>

<script setup>
import { ref } from 'vue';
import ProjectManager from './components/ProjectManager.vue';
import { yourBusinessLogicFunctions } from './services/api';

const projectManagerRef = ref();

// Event handlers that call your business logic
async function handleGetEndpointStatistics(params) {
  try {
    const stats = await yourBusinessLogicFunctions.getEndpointStatistics(params.type);
    projectManagerRef.value.handleEndpointStatisticsReceived(stats);
  } catch (error) {
    console.error('Error getting endpoint statistics:', error);
  }
}

async function handleGetProjectAccess() {
  try {
    const access = await yourBusinessLogicFunctions.getProjectAccess();
    projectManagerRef.value.handleProjectAccessReceived(access);
  } catch (error) {
    console.error('Error getting project access:', error);
  }
}

async function handleLoadProjectList() {
  try {
    const projects = await yourBusinessLogicFunctions.loadProjectList();
    projectManagerRef.value.handleProjectListReceived(projects);
  } catch (error) {
    console.error('Error loading project list:', error);
  }
}

async function handleGetProjectAssignments() {
  try {
    const assignments = await yourBusinessLogicFunctions.getProjectAssignments();
    projectManagerRef.value.handleProjectAssignmentsReceived(assignments);
  } catch (error) {
    console.error('Error getting project assignments:', error);
  }
}

async function handleUpdateProjectAssignments(data) {
  try {
    await yourBusinessLogicFunctions.updateProjectAssignments(data.del, data.writes);
    projectManagerRef.value.handleProjectAssignmentsUpdated();
  } catch (error) {
    console.error('Error updating project assignments:', error);
  }
}

async function handleRenameProject(data) {
  try {
    await yourBusinessLogicFunctions.renameProjectById(data.projectId, data.request);
    projectManagerRef.value.handleProjectRenamed();
  } catch (error) {
    console.error('Error renaming project:', error);
  }
}

async function handleGetUser(userId) {
  try {
    const user = await yourBusinessLogicFunctions.getUser(userId);
    projectManagerRef.value.handleUserReceived({ userId, user });
  } catch (error) {
    console.error('Error getting user:', error);
  }
}

async function handleGetRole(roleId) {
  try {
    const role = await yourBusinessLogicFunctions.getRole(roleId);
    projectManagerRef.value.handleRoleReceived({ roleId, role });
  } catch (error) {
    console.error('Error getting role:', error);
  }
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
}
```

## Benefits

1. **Separation of Concerns**: UI logic stays in component, business logic in parent
2. **Reusability**: Component can work with any backend implementation
3. **Testability**: Easier to test component and business logic separately
4. **Maintainability**: Clear contracts between component and parent application
5. **Type Safety**: Full TypeScript support with proper event typing

## Migration Notes

- Replace function injection with event handlers in parent component
- Update prop types (especially `project` from string to `GetProjectResponse`)
- Implement async request handling with caching for user/role lookups
- Handle loading states appropriately in parent component

1. **Removed function injection** - No longer uses `inject()` for functions
2. **Added event emissions** - Component emits events instead of calling functions directly
3. **Parent handles business logic** - All API calls and data management happen in the parent application
4. **Event-driven responses** - Parent calls exposed methods on the component to provide data

## Component Events

### Emitted Events (Component → Parent)

| Event                      | Payload                                                     | Description                                       |
| -------------------------- | ----------------------------------------------------------- | ------------------------------------------------- |
| `getEndpointStatistics`    | `{ type: string }`                                          | Request endpoint statistics                       |
| `getProjectAccess`         | -                                                           | Request current user's project access permissions |
| `loadProjectList`          | -                                                           | Request list of available projects                |
| `getProjectAssignments`    | -                                                           | Request project permission assignments            |
| `updateProjectAssignments` | `{ del: ProjectAssignment[], writes: ProjectAssignment[] }` | Update project assignments                        |
| `renameProject`            | `{ request: RenameProjectRequest, projectId: string }`      | Rename a project                                  |
| `getUser`                  | `userId: string`                                            | Request user information by ID                    |
| `getRole`                  | `roleId: string`                                            | Request role information by ID                    |

### Response Methods (Parent → Component)

The component exposes these methods that the parent can call to provide data:

| Method                             | Parameters                             | Description                                       |
| ---------------------------------- | -------------------------------------- | ------------------------------------------------- |
| `handleEndpointStatisticsReceived` | `stats: GetEndpointStatisticsResponse` | Provide endpoint statistics data                  |
| `handleProjectAccessReceived`      | `access: ProjectAction[]`              | Provide user's project access permissions         |
| `handleProjectListReceived`        | `projects: GetProjectResponse[]`       | Provide list of projects                          |
| `handleProjectAssignmentsReceived` | `assignments: ProjectAssignment[]`     | Provide project assignments                       |
| `handleUserReceived`               | `{ userId: string, user: any }`        | Provide user data                                 |
| `handleRoleReceived`               | `{ roleId: string, role: any }`        | Provide role data                                 |
| `handleProjectRenamed`             | -                                      | Notify that project was renamed successfully      |
| `handleProjectAssignmentsUpdated`  | -                                      | Notify that assignments were updated successfully |

## Parent Integration Example

```vue
<template>
  <ProjectManager
    ref="projectManagerRef"
    :enabled-authentication="true"
    :enabled-permissions="true"
    :access-token="accessToken"
    :is-authenticated="isAuthenticated"
    :project="currentProject"
    :auth-method="authMethod"
    @get-endpoint-statistics="handleGetEndpointStatistics"
    @get-project-access="handleGetProjectAccess"
    @load-project-list="handleLoadProjectList"
    @get-project-assignments="handleGetProjectAssignments"
    @update-project-assignments="handleUpdateProjectAssignments"
    @rename-project="handleRenameProject"
    @get-user="handleGetUser"
    @get-role="handleGetRole" />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import ProjectManager from '@lakekeeper/console-components/ProjectManager.vue';
import { useFunctions } from './composables/useFunctions';

const projectManagerRef = ref<InstanceType<typeof ProjectManager>>();
const functions = useFunctions();

// Event handlers
async function handleGetEndpointStatistics(params: { type: string }) {
  try {
    const stats = await functions.getEndpointStatistics(params);
    projectManagerRef.value?.handleEndpointStatisticsReceived(stats);
  } catch (error) {
    console.error('Failed to get endpoint statistics:', error);
  }
}

async function handleGetProjectAccess() {
  try {
    const access = await functions.getProjectAccess();
    projectManagerRef.value?.handleProjectAccessReceived(access);
  } catch (error) {
    console.error('Failed to get project access:', error);
  }
}

async function handleLoadProjectList() {
  try {
    const projects = await functions.loadProjectList();
    projectManagerRef.value?.handleProjectListReceived(projects);
  } catch (error) {
    console.error('Failed to load project list:', error);
  }
}

async function handleGetProjectAssignments() {
  try {
    const assignments = await functions.getProjectAssignments();
    projectManagerRef.value?.handleProjectAssignmentsReceived(assignments);
  } catch (error) {
    console.error('Failed to get project assignments:', error);
  }
}

async function handleUpdateProjectAssignments(data: {
  del: ProjectAssignment[];
  writes: ProjectAssignment[];
}) {
  try {
    await functions.updateProjectAssignments(data.del, data.writes);
    projectManagerRef.value?.handleProjectAssignmentsUpdated();
  } catch (error) {
    console.error('Failed to update project assignments:', error);
  }
}

async function handleRenameProject(data: { request: RenameProjectRequest; projectId: string }) {
  try {
    await functions.renameProjectById(data.request, data.projectId);
    projectManagerRef.value?.handleProjectRenamed();
  } catch (error) {
    console.error('Failed to rename project:', error);
  }
}

async function handleGetUser(userId: string) {
  try {
    const user = await functions.getUser(userId);
    projectManagerRef.value?.handleUserReceived({ userId, user });
  } catch (error) {
    console.error('Failed to get user:', error);
  }
}

async function handleGetRole(roleId: string) {
  try {
    const role = await functions.getRole(roleId);
    projectManagerRef.value?.handleRoleReceived({ roleId, role });
  } catch (error) {
    console.error('Failed to get role:', error);
  }
}
</script>
```

## Benefits of This Approach

### 1. **Separation of Concerns**

- Component handles UI logic and state management
- Parent handles business logic and API calls
- Clear boundaries between presentation and data layers

### 2. **Testability**

- Component can be easily unit tested by mocking event emissions
- Parent logic can be tested independently
- No need to mock complex injection dependencies

### 3. **Reusability**

- Component can be used with different API implementations
- No tight coupling to specific function signatures
- Easy to adapt to different backend services

### 4. **Type Safety**

- All events are strongly typed
- Clear contracts between component and parent
- Compile-time error checking for event payloads

### 5. **Error Handling**

- Parent can implement custom error handling strategies
- Component doesn't need to know about specific error scenarios
- Better user experience with contextual error messages

## Migration Notes

If you were previously using the component with function injection:

1. **Remove function injection** - No need to provide functions via `inject()`
2. **Add event handlers** - Implement handlers for all emitted events
3. **Use component ref** - Get a reference to call exposed methods
4. **Handle responses** - Call the appropriate handler methods with data

This refactoring makes the component much more flexible and follows Vue.js best practices for component communication.

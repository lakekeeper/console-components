// Utilities
import { createPinia } from 'pinia';
import { createPersistedStatePlugin } from 'pinia-plugin-persistedstate-2';
const pinia = createPinia();
const installPersistedStatePlugin = createPersistedStatePlugin();
pinia.use((context) => installPersistedStatePlugin(context));

export default pinia;

// Export stores
export { useNavigationStore } from './navigation';
export type { NavigationState } from './navigation';
export { useVisualStore } from './visual';
export type { PolicyBuilderState } from './visual';

// Global types for console components library

export interface ComponentProps {
  [key: string]: any;
}

export interface AppFooterProps {
  // Add specific props for AppFooter if needed in the future
}

// Export functions interface for dependency injection
export * from './functions';

// Re-export common Vue types
export type { App, Plugin } from 'vue';

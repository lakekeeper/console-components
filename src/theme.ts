/**
 * theme.ts
 *
 * Shared Vuetify themes for Lakekeeper (light + dark). These are the OSS
 * defaults used by both the console and console-plus apps. console-plus may
 * deep-merge per-deployment branding overrides on top (Plus-only feature),
 * but the base palette lives here so the OSS console gets it too.
 *
 * Register these as `light` / `dark` in the app's Vuetify config — the names
 * the AppBar/App theme toggle (`theme.change('light'|'dark')`) expects.
 */

export const lakekeeperLightTheme = {
  dark: false,
  colors: {
    background: '#FFFFFF',
    surface: '#FFFFFF',
    'surface-bright': '#FFFFFF',
    'surface-light': '#EEF3F8',
    'surface-variant': '#32485C',
    'on-surface-variant': '#EEF3F8',
    primary: '#0097FB',
    'primary-darken-1': '#0079C9',
    'on-primary': '#000000',
    secondary: '#1E857D',
    'secondary-darken-1': '#18655E',
    error: '#DE1F1F',
    info: '#58A6FF',
    success: '#26A269',
    warning: '#DEA01E',
  },
  variables: {
    'border-color': '#000000',
    'border-opacity': 0.12,
    'high-emphasis-opacity': 0.87,
    'medium-emphasis-opacity': 0.6,
    'disabled-opacity': 0.38,
    'idle-opacity': 0.04,
    'hover-opacity': 0.04,
    'focus-opacity': 0.12,
    'selected-opacity': 0.08,
    'activated-opacity': 0.12,
    'pressed-opacity': 0.12,
    'dragged-opacity': 0.08,
    'theme-kbd': '#212529',
    'theme-on-kbd': '#FFFFFF',
    'theme-code': '#F5F5F5',
    'theme-on-code': '#000000',
  },
};

export const lakekeeperDarkTheme = {
  dark: true,
  colors: {
    background: '#1E3448',
    surface: '#1E3448',
    'surface-bright': '#32485C',
    'surface-light': '#28415A',
    'surface-variant': '#8DA5BA',
    'on-surface-variant': '#BCD4EB',
    primary: '#0097FB',
    'primary-darken-1': '#0079C9',
    'on-primary': '#000000',
    secondary: '#1E857D',
    'secondary-darken-1': '#18655E',
    error: '#DE1F1F',
    info: '#58A6FF',
    success: '#26A269',
    warning: '#DEA01E',
  },
  variables: {
    'border-color': '#FFFFFF',
    'border-opacity': 0.12,
    'high-emphasis-opacity': 0.87,
    'medium-emphasis-opacity': 0.6,
    'disabled-opacity': 0.38,
    'idle-opacity': 0.1,
    'hover-opacity': 0.04,
    'focus-opacity': 0.12,
    'selected-opacity': 0.08,
    'activated-opacity': 0.12,
    'pressed-opacity': 0.12,
    'dragged-opacity': 0.08,
    'theme-kbd': '#212529',
    'theme-on-kbd': '#FFFFFF',
    'theme-code': '#343434',
    'theme-on-code': '#CCCCCC',
  },
};

/**
 * @deprecated Use `lakekeeperLightTheme`. Kept as an alias for backward
 * compatibility with consumers that import `myCustomLightTheme`.
 */
export const myCustomLightTheme = lakekeeperLightTheme;

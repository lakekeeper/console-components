# @lakekeeper/console-components

A Vue 3 component library for Lakekeeper console applications, built with Vuetify.

## Installation

```bash
npm install @lakekeeper/console-components
```

## Usage

### As a Plugin (Recommended)

```typescript
import { createApp } from 'vue';
import ConsoleComponentsPlugin from '@lakekeeper/console-components';
import '@lakekeeper/console-components/style.css';

const app = createApp(App);
app.use(ConsoleComponentsPlugin);
```

### Individual Component Import

```typescript
import { AppFooter } from '@lakekeeper/console-components';
import '@lakekeeper/console-components/style.css';
```

## Components

### AppFooter

A footer component with Lakekeeper branding and copyright information.

```vue
<template>
  <AppFooter />
</template>
```

## Requirements

- Vue 3.x
- Vuetify 3.x

## Development

```bash
# Install dependencies
npm install

# Build the library
npm run build

# Run in development mode
npm run dev
```

## License

MIT

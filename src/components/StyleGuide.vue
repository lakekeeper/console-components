<template>
  <div class="styleguide pa-6">
    <h1 class="text-h6 d-flex align-center ga-2 mb-4">
      <v-icon icon="mdi-palette-outline"></v-icon>
      Design system reference
    </h1>
    <p class="text-caption text-medium-emphasis mb-6" style="max-width: 720px">
      Live rendering of every canonical pattern in
      <code>docs/DESIGN_SYSTEM.md</code>
      . This page cannot drift from the rest of the app because it's built from the same components.
      Toggle the app's theme switcher to check both light and dark.
    </p>

    <!-- Colors -->
    <section class="mb-8">
      <h2 class="text-subtitle-2 font-weight-medium mb-3">Color tokens</h2>
      <div class="d-flex flex-wrap ga-3">
        <div v-for="token in colorTokens" :key="token" class="swatch">
          <div class="swatch-box" :class="`bg-${token}`"></div>
          <span class="text-caption">{{ token }}</span>
        </div>
      </div>
    </section>

    <!-- Buttons -->
    <section class="mb-8">
      <h2 class="text-subtitle-2 font-weight-medium mb-3">Buttons</h2>
      <v-table density="compact">
        <thead>
          <tr>
            <th>Role</th>
            <th>Example</th>
            <th>Markup</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Primary action</td>
            <td><v-btn color="primary" variant="flat">Save</v-btn></td>
            <td><code>color="primary" variant="flat"</code></td>
          </tr>
          <tr>
            <td>Neutral action</td>
            <td><v-btn variant="text">Cancel</v-btn></td>
            <td>
              <code>variant="text"</code>
              , no color
            </td>
          </tr>
          <tr>
            <td>Destructive (confirm)</td>
            <td><v-btn color="error" variant="flat">Delete</v-btn></td>
            <td><code>color="error" variant="flat"</code></td>
          </tr>
          <tr>
            <td>Destructive trigger</td>
            <td>
              <v-btn icon="mdi-delete-outline" color="error" variant="text"></v-btn>
            </td>
            <td><code>icon="mdi-delete-outline" color="error" variant="text"</code></td>
          </tr>
          <tr>
            <td>Toggle state</td>
            <td>
              <v-btn
                :color="toggleOn ? 'success' : 'error'"
                variant="flat"
                @click="toggleOn = !toggleOn">
                {{ toggleOn ? 'Enabled' : 'Disabled' }}
              </v-btn>
            </td>
            <td><code>:color="on ? 'success' : 'error'" variant="flat"</code></td>
          </tr>
          <tr>
            <td>Icon-only</td>
            <td><v-btn icon="mdi-refresh" variant="text"></v-btn></td>
            <td>
              <code>icon="mdi-refresh" variant="text"</code>
              (shorthand form)
            </td>
          </tr>
        </tbody>
      </v-table>

      <div class="mt-4">
        <div class="text-caption text-medium-emphasis mb-1">Dialog action order</div>
        <v-card variant="outlined" max-width="440">
          <v-card-title class="text-subtitle-1 py-3">Delete warehouse?</v-card-title>
          <v-card-text class="text-body-2">This action cannot be undone.</v-card-text>
          <v-card-actions>
            <v-spacer></v-spacer>
            <v-btn variant="text">Cancel</v-btn>
            <v-btn color="error" variant="flat">Delete</v-btn>
          </v-card-actions>
        </v-card>
      </div>
    </section>

    <!-- Typography -->
    <section class="mb-8">
      <h2 class="text-subtitle-2 font-weight-medium mb-3">Typography</h2>
      <div class="d-flex flex-column ga-2">
        <div>
          <h3 class="text-h6 d-flex align-center ga-2">
            <v-icon icon="mdi-file-outline" size="small"></v-icon>
            Page title
          </h3>
          <span class="text-caption text-disabled">text-h6, used as the route's &lt;h1&gt;</span>
        </div>
        <div>
          <div class="text-subtitle-1">Dialog title</div>
          <span class="text-caption text-disabled">text-subtitle-1</span>
        </div>
        <div>
          <div class="text-subtitle-2 font-weight-medium">Section header</div>
          <span class="text-caption text-disabled">text-subtitle-2 font-weight-medium</span>
        </div>
        <div>
          <div class="text-caption text-medium-emphasis">Helper / caption text</div>
          <span class="text-caption text-disabled">text-caption text-medium-emphasis</span>
        </div>
      </div>
    </section>

    <!-- Dialog widths -->
    <section class="mb-8">
      <h2 class="text-subtitle-2 font-weight-medium mb-3">Dialog width scale</h2>
      <v-table density="compact">
        <thead>
          <tr>
            <th>Width</th>
            <th>Use for</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>440</td>
            <td>Confirm dialogs, single-field forms</td>
          </tr>
          <tr>
            <td>600</td>
            <td>Standard forms</td>
          </tr>
          <tr>
            <td>800</td>
            <td>Complex forms / small tables</td>
          </tr>
          <tr>
            <td>1000+</td>
            <td>Full editors (SQL, Cedar policy, JSON)</td>
          </tr>
        </tbody>
      </v-table>
    </section>

    <!-- Loading & empty states -->
    <section class="mb-8">
      <h2 class="text-subtitle-2 font-weight-medium mb-3">Loading &amp; empty states</h2>
      <div class="d-flex align-center ga-8 flex-wrap">
        <div class="d-flex flex-column align-center ga-2">
          <v-progress-circular color="primary" indeterminate size="48"></v-progress-circular>
          <span class="text-caption text-disabled">section, size 48</span>
        </div>
        <div class="d-flex flex-column align-center ga-2">
          <v-progress-circular color="primary" indeterminate size="64"></v-progress-circular>
          <span class="text-caption text-disabled">full page, size 64</span>
        </div>
        <div style="min-width: 280px">
          <v-empty-state
            icon="mdi-database-off-outline"
            title="No warehouses"
            text="Create a warehouse to get started."
            size="small"></v-empty-state>
          <span class="text-caption text-disabled">v-empty-state</span>
        </div>
      </div>
    </section>

    <!-- Icons -->
    <section class="mb-8">
      <h2 class="text-subtitle-2 font-weight-medium mb-3">Icons</h2>
      <div class="d-flex ga-6 align-center flex-wrap">
        <div v-for="i in icons" :key="i.name" class="d-flex flex-column align-center ga-1">
          <v-icon :icon="i.icon"></v-icon>
          <span class="text-caption text-disabled">{{ i.name }}</span>
        </div>
      </div>
    </section>

    <!-- Feedback: tooltip + snackbar -->
    <section class="mb-8">
      <h2 class="text-subtitle-2 font-weight-medium mb-3">Feedback</h2>
      <p class="text-caption text-medium-emphasis mb-2" style="max-width: 640px">
        Both use Vuetify's default
        <code>surface-variant</code>
        /
        <code>on-surface-variant</code>
        pairing — check contrast holds in both themes.
      </p>
      <div class="d-flex align-center ga-8 flex-wrap">
        <v-btn variant="outlined">
          Hover for tooltip
          <v-tooltip activator="parent" location="bottom">This is a tooltip</v-tooltip>
        </v-btn>
        <v-btn variant="outlined" @click="demoSnackbar = true">Show snackbar</v-btn>
      </div>
      <v-snackbar v-model="demoSnackbar" location="bottom" timeout="4000">
        Warehouse settings updated successfully
        <template #actions>
          <v-btn color="success" @click="demoSnackbar = false">Close</v-btn>
        </template>
      </v-snackbar>
    </section>
  </div>
</template>

<script lang="ts" setup>
import { ref } from 'vue';

const toggleOn = ref(true);
const demoSnackbar = ref(false);

const colorTokens = [
  'primary',
  'secondary',
  'info',
  'success',
  'warning',
  'error',
  'surface-light',
];

const icons = [
  { name: 'edit', icon: 'mdi-pencil-outline' },
  { name: 'delete', icon: 'mdi-delete-outline' },
  { name: 'close', icon: 'mdi-close' },
  { name: 'refresh', icon: 'mdi-refresh' },
  { name: 'add', icon: 'mdi-plus' },
];
</script>

<style scoped>
.swatch {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.swatch-box {
  width: 64px;
  height: 40px;
  border-radius: 4px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}
</style>

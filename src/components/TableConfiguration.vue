<template>
  <v-card variant="outlined" class="mb-4" elevation="1">
    <v-card-title class="d-flex align-center text-subtitle-1 py-3">
      <v-icon class="mr-2" color="primary">mdi-cog-outline</v-icon>
      Configuration &amp; Statistics
    </v-card-title>
    <v-divider></v-divider>

    <v-expansion-panels multiple variant="accordion">
      <!-- ── Table properties ── -->
      <v-expansion-panel>
        <v-expansion-panel-title>
          <v-icon size="small" class="mr-2">mdi-tune-variant</v-icon>
          Table properties
          <v-chip size="x-small" class="ml-2" variant="tonal">{{ propertyRows.length }}</v-chip>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <v-alert v-if="propertyRows.length === 0" type="info" variant="tonal" density="compact">
            No table properties set.
          </v-alert>
          <v-table v-else density="compact" class="config-table">
            <thead>
              <tr>
                <th>Property</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in propertyRows" :key="row.key">
                <td>
                  <code class="text-caption">{{ row.key }}</code>
                  <v-chip
                    v-if="row.highlight"
                    size="x-small"
                    color="primary"
                    variant="tonal"
                    class="ml-2">
                    write
                  </v-chip>
                </td>
                <td class="text-caption">{{ row.value }}</td>
              </tr>
            </tbody>
          </v-table>
        </v-expansion-panel-text>
      </v-expansion-panel>

      <!-- ── Column statistics (Puffin) ── -->
      <v-expansion-panel>
        <v-expansion-panel-title>
          <v-icon size="small" class="mr-2">mdi-sigma</v-icon>
          Column statistics
          <v-chip
            size="x-small"
            class="ml-2"
            :color="columnStats.length > 0 ? 'success' : 'warning'"
            variant="tonal">
            {{ columnStats.length > 0 ? `${columnStats.length} columns` : 'none' }}
          </v-chip>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <v-alert v-if="columnStats.length === 0" type="info" variant="tonal" density="compact">
            No persisted column statistics (Iceberg Puffin / NDV sketches) are stored for this
            table, so query planners can't read cardinality estimates from metadata. These are
            written by engines like Spark or Trino (
            <code>ANALYZE</code>
            / Iceberg's compute-statistics) — they can't be generated here in DuckDB-WASM. The
            <strong>Schema Profiler</strong>
            (Details tab) computes an on-the-fly cardinality estimate in the meantime.
          </v-alert>
          <template v-else>
            <div class="text-caption text-medium-emphasis mb-2">
              Distinct-value (NDV) sketches from the current snapshot's statistics file.
            </div>
            <v-table density="compact" class="config-table">
              <thead>
                <tr>
                  <th>Column</th>
                  <th>Type of sketch</th>
                  <th class="text-right">Distinct values (NDV)</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="stat in columnStats" :key="stat.field">
                  <td class="text-caption">{{ stat.column }}</td>
                  <td class="text-caption text-medium-emphasis">{{ stat.sketch }}</td>
                  <td class="text-right text-caption">
                    {{ stat.ndv !== null ? stat.ndv.toLocaleString() : '—' }}
                  </td>
                </tr>
              </tbody>
            </v-table>
          </template>
        </v-expansion-panel-text>
      </v-expansion-panel>

      <!-- ── Partition statistics ── -->
      <v-expansion-panel v-if="hasPartitionStats">
        <v-expansion-panel-title>
          <v-icon size="small" class="mr-2">mdi-view-grid-outline</v-icon>
          Partition statistics
          <v-chip size="x-small" class="ml-2" color="success" variant="tonal">
            {{ partitionStatsCount }} file{{ partitionStatsCount !== 1 ? 's' : '' }}
          </v-chip>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <div class="text-caption text-medium-emphasis">
            Partition-level statistics files are present, enabling partition pruning during query
            planning.
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { TableMetadata } from '../gen/iceberg/types.gen';

const props = defineProps<{
  metadata: TableMetadata;
}>();

// Properties worth flagging as write-path tuning knobs.
const WRITE_PREFIXES = ['write.', 'commit.', 'compression'];

const propertyRows = computed(() => {
  const props_ = (props.metadata?.properties ?? {}) as Record<string, string>;
  return Object.entries(props_)
    .map(([key, value]) => ({
      key,
      value: String(value),
      highlight: WRITE_PREFIXES.some((p) => key.startsWith(p) || key.includes(p)),
    }))
    .sort((a, b) => Number(b.highlight) - Number(a.highlight) || a.key.localeCompare(b.key));
});

// field-id → column name, from the current schema.
const fieldNames = computed<Record<number, string>>(() => {
  const map: Record<number, string> = {};
  const schemas = props.metadata?.schemas ?? [];
  const currentId = props.metadata?.['current-schema-id'];
  const schema = schemas.find((s) => s['schema-id'] === currentId) ?? schemas[0];
  for (const f of schema?.fields ?? []) {
    if (typeof f.id === 'number') map[f.id] = f.name;
  }
  return map;
});

// Puffin column statistics for the current snapshot (NDV sketches, etc.).
const columnStats = computed(() => {
  const currentSnapshot = props.metadata?.['current-snapshot-id'];
  const files = props.metadata?.statistics ?? [];
  // Prefer the stats file for the current snapshot; fall back to the latest.
  const file = files.find((f) => f['snapshot-id'] === currentSnapshot) ?? files[files.length - 1];
  if (!file) return [];
  return file['blob-metadata'].map((blob) => {
    const field = blob.fields?.[0];
    const ndvRaw = blob.properties?.ndv;
    return {
      field: blob.fields?.join(',') ?? '',
      column: field !== undefined ? (fieldNames.value[field] ?? `field ${field}`) : '—',
      sketch: shortSketch(blob.type),
      ndv: ndvRaw !== undefined && ndvRaw !== null ? Number(ndvRaw) : null,
    };
  });
});

function shortSketch(type: string): string {
  if (type.includes('theta')) return 'NDV (theta sketch)';
  if (type.includes('datasketches')) return 'datasketches';
  return type;
}

const hasPartitionStats = computed(
  () => (props.metadata?.['partition-statistics']?.length ?? 0) > 0,
);
const partitionStatsCount = computed(() => props.metadata?.['partition-statistics']?.length ?? 0);
</script>

<style scoped>
.config-table code {
  word-break: break-all;
}
</style>

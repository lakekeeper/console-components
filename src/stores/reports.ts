import { ref } from 'vue';
import { defineStore } from 'pinia';

export type ChartType = 'bar' | 'line' | 'pie' | 'scatter';
export type AggregationType = 'none' | 'sum' | 'avg' | 'count' | 'max' | 'min';
export type SortType = 'none' | 'x_asc' | 'x_desc' | 'y_asc' | 'y_desc';

export interface YSeries {
  column: string;
  label?: string;
  colorIndex: number;
}

export interface ChartConfig {
  type: ChartType;
  xColumn: string;
  ySeriesList: YSeries[];
  aggregation: AggregationType;
  stacked: boolean;
  horizontal: boolean;
  smooth: boolean;
  donut: boolean;
  sortBy: SortType;
  topN: number;
}

export interface SavedReport {
  id: string;
  name: string;
  sql: string;
  chartConfig: ChartConfig;
  createdAt: string;
}

export const useReportsStore = defineStore(
  'reports',
  () => {
    const reports = ref<SavedReport[]>([]);

    function saveReport(name: string, sql: string, chartConfig: ChartConfig): SavedReport {
      const report: SavedReport = {
        id: crypto.randomUUID(),
        name: name.trim(),
        sql,
        chartConfig,
        createdAt: new Date().toISOString(),
      };
      reports.value.push(report);
      return report;
    }

    function deleteReport(id: string) {
      const idx = reports.value.findIndex((r) => r.id === id);
      if (idx !== -1) reports.value.splice(idx, 1);
    }

    function updateReport(id: string, updates: Partial<Pick<SavedReport, 'name' | 'chartConfig'>>) {
      const report = reports.value.find((r) => r.id === id);
      if (report) Object.assign(report, updates);
    }

    return { reports, saveReport, deleteReport, updateReport };
  },
  {
    persistedState: { key: 'reports', persist: true },
  },
);

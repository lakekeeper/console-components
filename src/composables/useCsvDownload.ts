import { type Ref } from 'vue';

export interface QueryResult {
  columns: string[];
  rows: any[][];
  rowCount?: number;
}

export interface CsvDownloadOptions {
  /** Base filename without extension (timestamp will be added automatically) */
  baseFilename?: string;
  /** Whether to include timestamp in filename */
  includeTimestamp?: boolean;
  /** Custom timestamp format (defaults to YYYYMMDDTHHMMSS) */
  timestampFormat?: string;
}

/**
 * Composable for CSV download functionality
 * Provides reusable CSV generation and download logic for query results
 */
export function useCsvDownload() {
  /**
   * Escape CSV field value to handle special characters
   * @param field - Field value to escape
   * @returns Escaped string suitable for CSV
   */
  function escapeCSVField(field: any): string {
    if (field === null || field === undefined) {
      return '';
    }
    const str = String(field);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  /**
   * Generate CSV content from query results
   * @param queryResult - Query result with columns and rows
   * @returns CSV content as string
   */
  function generateCSV(queryResult: QueryResult): string {
    const { columns, rows } = queryResult;

    // Build CSV content
    const csvContent = [
      // Headers
      columns.map(escapeCSVField).join(','),
      // Data rows
      ...rows.map((row: any[]) => row.map(escapeCSVField).join(',')),
    ].join('\n');

    return csvContent;
  }

  /**
   * Generate filename with optional timestamp
   * @param options - Download options
   * @returns Generated filename
   */
  function generateFilename(options: CsvDownloadOptions = {}): string {
    const {
      baseFilename = 'data',
      includeTimestamp = true,
      timestampFormat = 'YYYYMMDDTHHMMSS',
    } = options;

    if (!includeTimestamp) {
      return `${baseFilename}.csv`;
    }

    // Generate timestamp
    const now = new Date();
    let timestamp: string;

    if (timestampFormat === 'YYYYMMDDTHHMMSS') {
      timestamp = now.toISOString().slice(0, 19).replace(/[:-]/g, '');
    } else {
      // For custom formats, use the default for now
      timestamp = now.toISOString().slice(0, 19).replace(/[:-]/g, '');
    }

    return `${baseFilename}_${timestamp}.csv`;
  }

  /**
   * Download CSV file to browser
   * @param csvContent - CSV content string
   * @param filename - Filename for download
   */
  function triggerDownload(csvContent: string, filename: string): void {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');

    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', filename);

      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up the URL object
      URL.revokeObjectURL(url);
    }
  }

  /**
   * Download query results as CSV
   * @param queryResult - Query result to download
   * @param options - Download options
   */
  function downloadCSV(
    queryResult: QueryResult | null | undefined,
    options: CsvDownloadOptions = {},
  ): void {
    if (!queryResult || !queryResult.rows || queryResult.rows.length === 0) {
      console.warn('No data available for CSV download');
      return;
    }

    try {
      const csvContent = generateCSV(queryResult);
      const filename = generateFilename(options);
      triggerDownload(csvContent, filename);
    } catch (error) {
      console.error('Failed to download CSV:', error);
    }
  }

  /**
   * Create a reactive download function for a specific query result ref
   * @param queryResultRef - Reactive reference to query result
   * @param options - Default download options
   * @returns Download function
   */
  function createDownloadFunction(
    queryResultRef: Ref<QueryResult | null | undefined>,
    options: CsvDownloadOptions = {},
  ) {
    return () => downloadCSV(queryResultRef.value, options);
  }

  /**
   * Check if CSV download is available for given query result
   * @param queryResult - Query result to check
   * @returns Whether download is available
   */
  function isDownloadAvailable(queryResult: QueryResult | null | undefined): boolean {
    return !!(queryResult && queryResult.rows && queryResult.rows.length > 0);
  }

  return {
    escapeCSVField,
    generateCSV,
    generateFilename,
    triggerDownload,
    downloadCSV,
    createDownloadFunction,
    isDownloadAvailable,
  };
}

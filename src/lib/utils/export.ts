import Papa from 'papaparse';
import type { SetPriceResult } from '@/types';
import { formatSetNumber } from './formatting';

/**
 * Export utilities for CSV/Excel
 */

export interface ExportRow {
  'Set Number': string;
  'Set Name': string;
  'Condition': string;
  'Times Sold': string;
  'Avg Sold Price': string;
  'Items For Sale': string;
  'Avg Asking Price': string;
  'Currency': string;
  'Last Updated': string;
}

/**
 * Convert results to CSV format
 */
export function exportToCSV(results: SetPriceResult[], filename: string = 'bricklink-prices.csv'): void {
  const rows: ExportRow[] = results.map(result => ({
    'Set Number': formatSetNumber(result.setNumber),
    'Set Name': result.setName || '',
    'Condition': result.condition === 'new' ? 'New' : 'Used',
    'Times Sold': result.timesSold !== null && result.timesSold !== undefined ? result.timesSold.toString() : '',
    'Avg Sold Price': result.avgSoldPrice || '',
    'Items For Sale': result.itemsForSale !== null && result.itemsForSale !== undefined ? result.itemsForSale.toString() : '',
    'Avg Asking Price': result.avgSalePrice || '',
    'Currency': result.currency,
    'Last Updated': result.lastUpdated || '',
  }));

  const csv = Papa.unparse(rows);
  downloadFile(csv, filename, 'text/csv');
}

/**
 * Download file to browser
 */
function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}


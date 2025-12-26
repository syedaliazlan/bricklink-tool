'use client';

import { useState, useMemo, useEffect } from 'react';
import { Download, AlertCircle, CheckCircle, ChevronLeft, ChevronRight, ArrowUp, ArrowDown } from 'lucide-react';
import { formatCurrency, formatNumber } from '@/lib/utils/formatting';
import { exportToCSV } from '@/lib/utils/export';
import type { SetPriceResult } from '@/types';

interface ResultsTableProps {
  results: SetPriceResult[];
  currency: string;
}

const ITEMS_PER_PAGE_OPTIONS = [10, 25, 50, 100];

type SortField = 'setNumber' | 'setName' | 'condition' | 'timesSold' | 'avgSoldPrice' | 'itemsForSale' | 'avgSalePrice';
type SortDirection = 'asc' | 'desc' | null;

export function ResultsTable({ results, currency }: ResultsTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  // Update when results change
  useEffect(() => {
    setCurrentPage(1); // Reset to first page when results change
  }, [results]);

  const stats = useMemo(() => {
    const successful = results.filter(r => r.status === 'success').length;
    const failed = results.filter(r => r.status === 'error').length;
    return { successful, failed, total: results.length };
  }, [results]);

  // Pagination calculations (based on unsorted results)
  const totalPages = Math.ceil(results.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  
  // Get current page items first
  const pageResults = results.slice(startIndex, endIndex);

  // Sort only the current page's items
  const currentResults = useMemo(() => {
    if (!sortField || !sortDirection) return pageResults;

    return [...pageResults].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortField) {
        case 'setNumber':
          aValue = a.setNumber;
          bValue = b.setNumber;
          break;
        case 'setName':
          aValue = a.setName || '';
          bValue = b.setName || '';
          break;
        case 'condition':
          aValue = a.condition;
          bValue = b.condition;
          break;
        case 'timesSold':
          aValue = a.timesSold ?? 0;
          bValue = b.timesSold ?? 0;
          break;
        case 'avgSoldPrice':
          aValue = a.avgSoldPrice ? parseFloat(a.avgSoldPrice.toString()) : 0;
          bValue = b.avgSoldPrice ? parseFloat(b.avgSoldPrice.toString()) : 0;
          break;
        case 'itemsForSale':
          aValue = a.itemsForSale ?? 0;
          bValue = b.itemsForSale ?? 0;
          break;
        case 'avgSalePrice':
          aValue = a.avgSalePrice ? parseFloat(a.avgSalePrice.toString()) : 0;
          bValue = b.avgSalePrice ? parseFloat(b.avgSalePrice.toString()) : 0;
          break;
        default:
          return 0;
      }

      // Handle string comparison
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc' 
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }

      // Handle numeric comparison
      if (sortDirection === 'asc') {
        return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
      } else {
        return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
      }
    });
  }, [pageResults, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Cycle through: asc -> desc -> null
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortDirection(null);
        setSortField(null);
      }
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleExport = () => {
    const timestamp = new Date().toISOString().split('T')[0];
    // Export all results, not just current page
    exportToCSV(results, `bricklink-prices-${timestamp}.csv`);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1); // Reset to first page when changing items per page
  };

  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisiblePages = 5;
    
    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 4; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      }
    }
    return pages;
  };

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Results</h2>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center text-green-600">
              <CheckCircle className="w-4 h-4 mr-1" />
              {stats.successful} successful
            </div>
            {stats.failed > 0 && (
              <div className="flex items-center text-red-600">
                <AlertCircle className="w-4 h-4 mr-1" />
                {stats.failed} failed
              </div>
            )}
            <div className="text-gray-500">
              ({stats.total} total)
            </div>
          </div>
        </div>
        <button
          onClick={handleExport}
          className="btn btn-primary flex items-center px-5 py-2.5"
        >
          <Download className="w-5 h-5 mr-2" />
          Export CSV
        </button>
      </div>

      {/* Items per page selector */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span>Show</span>
          <select
            value={itemsPerPage}
            onChange={(e) => handleItemsPerPageChange(Number(e.target.value))}
            className="px-2 py-1 border border-gray-300 rounded bg-white text-gray-900"
          >
            {ITEMS_PER_PAGE_OPTIONS.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          <span>entries</span>
        </div>
        <div className="text-sm text-gray-600">
          Showing {startIndex + 1} to {Math.min(endIndex, results.length)} of {results.length} entries
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gradient-to-r from-gray-50 to-gray-100 border-b-2 border-gray-300">
            <tr>
              <th 
                className="px-4 py-3 text-left font-semibold text-gray-700 cursor-pointer hover:bg-gray-200 transition-colors select-none"
                onClick={() => handleSort('setNumber')}
              >
                <div className="flex items-center gap-2">
                  Set #
                  {sortField === 'setNumber' && (
                    sortDirection === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />
                  )}
                </div>
              </th>
              <th 
                className="px-4 py-3 text-left font-semibold text-gray-700 cursor-pointer hover:bg-gray-200 transition-colors select-none"
                onClick={() => handleSort('setName')}
              >
                <div className="flex items-center gap-2">
                  Name
                  {sortField === 'setName' && (
                    sortDirection === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />
                  )}
                </div>
              </th>
              <th 
                className="px-4 py-3 text-left font-semibold text-gray-700 cursor-pointer hover:bg-gray-200 transition-colors select-none"
                onClick={() => handleSort('condition')}
              >
                <div className="flex items-center gap-2">
                  Condition
                  {sortField === 'condition' && (
                    sortDirection === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />
                  )}
                </div>
              </th>
              <th 
                className="px-4 py-3 text-right font-semibold text-gray-700 cursor-pointer hover:bg-gray-200 transition-colors select-none"
                onClick={() => handleSort('timesSold')}
              >
                <div className="flex items-center justify-end gap-2">
                  Times Sold
                  {sortField === 'timesSold' && (
                    sortDirection === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />
                  )}
                </div>
              </th>
              <th 
                className="px-4 py-3 text-right font-semibold text-gray-700 cursor-pointer hover:bg-gray-200 transition-colors select-none"
                onClick={() => handleSort('avgSoldPrice')}
              >
                <div className="flex items-center justify-end gap-2">
                  Avg Sold Price
                  {sortField === 'avgSoldPrice' && (
                    sortDirection === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />
                  )}
                </div>
              </th>
              <th 
                className="px-4 py-3 text-right font-semibold text-gray-700 cursor-pointer hover:bg-gray-200 transition-colors select-none"
                onClick={() => handleSort('itemsForSale')}
              >
                <div className="flex items-center justify-end gap-2">
                  Items For Sale
                  {sortField === 'itemsForSale' && (
                    sortDirection === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />
                  )}
                </div>
              </th>
              <th 
                className="px-4 py-3 text-right font-semibold text-gray-700 cursor-pointer hover:bg-gray-200 transition-colors select-none"
                onClick={() => handleSort('avgSalePrice')}
              >
                <div className="flex items-center justify-end gap-2">
                  Avg Asking Price
                  {sortField === 'avgSalePrice' && (
                    sortDirection === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />
                  )}
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {currentResults.map((result, localIndex) => {
              const globalIndex = startIndex + localIndex;
              return (
                <tr
                  key={`${result.setNumber}-${result.condition}-${globalIndex}`}
                  className={`transition-colors ${
                    result.status === 'error' 
                      ? 'bg-red-50 hover:bg-red-100' 
                      : 'hover:bg-indigo-50/50'
                  }`}
                >
                  <td className="px-4 py-3.5 font-mono text-xs font-semibold text-gray-900">
                    {result.setNumber}
                  </td>
                  <td className="px-4 py-3.5 max-w-xs truncate text-gray-900 font-medium" title={result.setName}>
                    {result.setName || '-'}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold shadow-sm ${
                      result.condition === 'new' 
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                        : 'bg-amber-100 text-amber-800 border border-amber-200'
                    }`}>
                      {result.condition === 'new' ? 'New' : 'Used'}
                    </span>
                  </td>
                  
                  {result.status === 'error' ? (
                    <td colSpan={4} className="px-4 py-3.5 text-red-600">
                      <div className="flex items-center">
                        <AlertCircle className="w-4 h-4 mr-2" />
                        {result.errorMessage}
                      </div>
                    </td>
                  ) : (
                    <>
                      <td className="px-4 py-3.5 text-right text-gray-900 font-medium">
                        {result.timesSold !== null && result.timesSold !== undefined ? formatNumber(result.timesSold) : '-'}
                      </td>
                      <td className="px-4 py-3.5 text-right font-semibold text-indigo-700">
                        {result.avgSoldPrice ? formatCurrency(result.avgSoldPrice, currency) : '-'}
                      </td>
                      <td className="px-4 py-3.5 text-right text-gray-900 font-medium">
                        {result.itemsForSale !== null && result.itemsForSale !== undefined ? formatNumber(result.itemsForSale) : '-'}
                      </td>
                      <td className="px-4 py-3.5 text-right font-semibold text-indigo-700">
                        {result.avgSalePrice ? formatCurrency(result.avgSalePrice, currency) : '-'}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200">
          <button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Previous
          </button>
          
          <div className="flex items-center gap-1">
            {getPageNumbers().map((page, index) => (
              typeof page === 'number' ? (
                <button
                  key={index}
                  onClick={() => handlePageChange(page)}
                  className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                    currentPage === page
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {page}
                </button>
              ) : (
                <span key={index} className="px-2 py-2 text-gray-500">...</span>
              )
            ))}
          </div>
          
          <button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
            <ChevronRight className="w-4 h-4 ml-1" />
          </button>
        </div>
      )}
    </div>
  );
}

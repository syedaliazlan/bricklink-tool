'use client';

import { useState, useEffect, useRef } from 'react';
import { SetInput } from '@/components/SetInput';
import { ResultsTable } from '@/components/ResultsTable';
import { ProgressIndicator } from '@/components/ProgressIndicator';
import type { SetPriceResult } from '@/types';
import { Package } from 'lucide-react';

export default function Home() {
  const [results, setResults] = useState<SetPriceResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [totalSets, setTotalSets] = useState(0);
  const [processedCount, setProcessedCount] = useState(0);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);

  // Simulate progress based on elapsed time with better estimation
  useEffect(() => {
    if (isLoading && totalSets > 0 && startTimeRef.current) {
      // Estimate: ~2 seconds per set (conservative, accounts for cache hits)
      const estimatedTimePerSet = 2000;
      const estimatedTotalTime = totalSets * estimatedTimePerSet;

      // Update progress every 200ms for smoother updates
      progressIntervalRef.current = setInterval(() => {
        if (startTimeRef.current) {
          const elapsed = Date.now() - startTimeRef.current;
          // Calculate estimated progress (capped at 98% until real results arrive)
          const estimatedProgress = Math.min(
            Math.floor((elapsed / estimatedTotalTime) * totalSets),
            Math.floor(totalSets * 0.98) // Cap at 98% until real results
          );
          
          if (estimatedProgress >= processedCount) {
            setProcessedCount(estimatedProgress);
          }
        }
      }, 200);
    } else {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    }

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [isLoading, totalSets]);

  const handleLookupStart = async (sets: Array<{ setNumber: string; condition: 'new' | 'used' }>, forceRefresh: boolean = false) => {
    setIsLoading(true);
    setTotalSets(sets.length);
    setResults([]);
    setProcessedCount(0);
    startTimeRef.current = Date.now();
    
    try {
      const response = await fetch('/api/lookups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sets,
          forceRefresh,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to process lookup');
      }

      const data = await response.json();
      
      // Update with real results
      setResults(data.results || []);
      setProcessedCount(data.results?.length || 0);
    } catch (error) {
      console.error('[Lookup] Error processing lookup:', error);
      alert(error instanceof Error ? error.message : 'Failed to process lookup');
    } finally {
      setIsLoading(false);
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    }
  };

  const handleReset = () => {
    setResults([]);
    setIsLoading(false);
    setTotalSets(0);
    setProcessedCount(0);
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    startTimeRef.current = null;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 py-12 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="flex items-center justify-center mb-5">
            <div className="p-3 bg-indigo-100 rounded-2xl">
              <Package className="w-10 h-10 text-indigo-600" />
            </div>
          </div>
          <h1 className="text-5xl font-bold text-gray-900 mb-3">
            BrickLink Bulk Pricing Tool
          </h1>
          <p className="text-gray-600 text-lg max-w-2xl mx-auto">
            Upload a CSV or Excel file with set numbers and conditions to retrieve essential pricing metrics from BrickLink
          </p>
        </div>

        {/* Main Content */}
        {results.length === 0 && !isLoading ? (
          <SetInput onLookupStart={handleLookupStart} />
        ) : (
          <div className="space-y-6">
            {/* Progress */}
            {isLoading && (
              <ProgressIndicator
                progress={processedCount}
                total={totalSets}
                status="processing"
              />
            )}

            {/* Results */}
            {results.length > 0 && (
              <>
                <ResultsTable results={results} currency={results[0]?.currency || 'GBP'} />
                
                <div className="flex justify-center">
                  <button
                    onClick={handleReset}
                    className="btn btn-secondary px-6 py-3"
                  >
                    Start New Lookup
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Footer */}
        <footer className="mt-12 text-center text-gray-500 text-sm">
          <p>Internal tool for BrickLink price lookups</p>
          <p className="mt-1">Data cached for 24 hours • Rate limited to protect API access</p>
        </footer>
      </div>
    </div>
  );
}


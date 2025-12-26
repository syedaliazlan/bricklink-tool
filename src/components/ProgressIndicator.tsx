'use client';

import { Loader2 } from 'lucide-react';

interface ProgressIndicatorProps {
  progress: number;
  total: number;
  status: string;
}

export function ProgressIndicator({ progress, total, status }: ProgressIndicatorProps) {
  const percentage = total > 0 ? Math.min(Math.round((progress / total) * 100), 100) : 0;
  const displayProgress = Math.max(progress, 0); // Ensure non-negative

  return (
    <div className="card max-w-2xl mx-auto">
      <div className="text-center">
        <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mx-auto mb-4" />
        
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          {status === 'pending' ? 'Starting...' : 'Fetching Price Data'}
        </h2>

        {/* Progress Bar */}
        <div className="w-full bg-gray-200 rounded-full h-4 mb-3 overflow-hidden shadow-inner">
          <div
            className="bg-gradient-to-r from-indigo-500 to-indigo-600 h-4 rounded-full transition-all duration-500 ease-out shadow-sm"
            style={{ width: `${percentage}%`, minWidth: percentage > 0 ? '2px' : '0' }}
          />
        </div>
        
        <p className="text-lg font-semibold text-gray-700">
          {percentage}% complete
        </p>

        {/* Info */}
        <div className="mt-6 text-sm text-gray-500">
          <p>This may take a few minutes depending on the number of sets.</p>
          <p>Please don't close this window.</p>
        </div>
      </div>
    </div>
  );
}


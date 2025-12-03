'use client';

import { EfficiencyMetrics } from '@/types/chat';
import { Zap, Clock } from 'lucide-react';

interface EfficiencyMetricsDisplayProps {
  metrics: EfficiencyMetrics;
}

export default function EfficiencyMetricsDisplay({ metrics }: EfficiencyMetricsDisplayProps) {
  return (
    <div className="border-t border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-950">
      <div className="mx-auto flex max-w-3xl items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Zap size={16} className="text-blue-600" />
            <span className="text-sm text-gray-600 dark:text-gray-400">Tool Calls:</span>
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {metrics.toolCallCount}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-purple-600" />
            <span className="text-sm text-gray-600 dark:text-gray-400">Execution:</span>
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {metrics.executionTimeMs}ms
            </span>
          </div>
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Total: {metrics.totalTokens} tokens
        </div>
      </div>
    </div>
  );
}


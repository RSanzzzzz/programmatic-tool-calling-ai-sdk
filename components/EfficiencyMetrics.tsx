'use client';

import { EfficiencyMetrics } from '@/types/chat';
import { ZapIcon, ClockIcon, CpuIcon, SparklesIcon, TrendingUpIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface EfficiencyMetricsDisplayProps {
  metrics: EfficiencyMetrics;
}

export default function EfficiencyMetricsDisplay({ metrics }: EfficiencyMetricsDisplayProps) {
  const efficiencyPercent = metrics.tokensSaved > 0 
    ? Math.round((metrics.tokensSaved / (metrics.totalTokens + metrics.tokensSaved)) * 100)
    : 0;

  return (
    <div className="border-t bg-muted/30 px-6 py-2.5">
      <div className="mx-auto flex max-w-4xl items-center justify-between">
        <div className="flex items-center gap-1">
          {/* Tool Calls */}
          <Badge variant="outline" className="gap-1.5 px-2.5 py-1 text-xs font-medium">
            <ZapIcon className="h-3 w-3 text-amber-500" />
            <span className="text-muted-foreground">Tools:</span>
            <span className="text-foreground">{metrics.toolCallCount}</span>
          </Badge>

          {/* Execution Time */}
          <Badge variant="outline" className="gap-1.5 px-2.5 py-1 text-xs font-medium">
            <ClockIcon className="h-3 w-3 text-blue-500" />
            <span className="text-muted-foreground">Time:</span>
            <span className="text-foreground">{metrics.executionTimeMs}ms</span>
          </Badge>

          {/* Total Tokens */}
          <Badge variant="outline" className="gap-1.5 px-2.5 py-1 text-xs font-medium">
            <CpuIcon className="h-3 w-3 text-purple-500" />
            <span className="text-muted-foreground">Tokens:</span>
            <span className="text-foreground">{metrics.totalTokens.toLocaleString()}</span>
          </Badge>

          {/* Tokens Saved */}
          {metrics.tokensSaved > 0 && (
            <Badge 
              variant="secondary" 
              className="gap-1.5 px-2.5 py-1 text-xs font-medium bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20"
            >
              <TrendingUpIcon className="h-3 w-3" />
              <span>Saved:</span>
              <span className="font-semibold">{metrics.tokensSaved.toLocaleString()}</span>
              <span className="text-green-500/70">({efficiencyPercent}%)</span>
            </Badge>
          )}
        </div>

        {/* Efficiency Indicator */}
        {(metrics.totalTokensSaved || metrics.intermediateTokensSaved) && (metrics.totalTokensSaved || metrics.intermediateTokensSaved) > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20">
            <SparklesIcon className="h-3.5 w-3.5 text-amber-500 animate-pulse" />
            <span className="text-xs">
              <span className="text-muted-foreground">Sandbox execution saved </span>
              <span className="font-semibold text-amber-600 dark:text-amber-400">
                {(metrics.totalTokensSaved || metrics.intermediateTokensSaved || 0).toLocaleString()}
              </span>
              <span className="text-muted-foreground"> tokens</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

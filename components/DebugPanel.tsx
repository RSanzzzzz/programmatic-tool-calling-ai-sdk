'use client';

import { ToolCall, CodeExecution, EfficiencyMetrics } from '@/types/chat';
import { Code2, Zap, Clock, Box } from 'lucide-react';

interface DebugPanelProps {
  toolCalls: ToolCall[];
  codeExecutions: CodeExecution[];
  metrics: EfficiencyMetrics | null;
}

export default function DebugPanel({ toolCalls, codeExecutions, metrics }: DebugPanelProps) {
  return (
    <div className="w-96 border-l border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
      <div className="h-full overflow-y-auto p-4">
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
          Debug Panel
        </h2>

        {/* Tool Calls */}
        <div className="mb-6">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            <Zap size={16} />
            Tool Calls ({toolCalls.length})
          </h3>
          <div className="space-y-2">
            {toolCalls.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No tool calls yet</p>
            ) : (
              toolCalls.map((call) => (
                <div
                  key={call.id}
                  className="rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-900"
                >
                  <div className="text-xs font-medium text-gray-900 dark:text-gray-100">
                    {call.toolName}
                  </div>
                  {call.executionTimeMs && (
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {call.executionTimeMs}ms
                    </div>
                  )}
                  {call.error && (
                    <div className="mt-1 text-xs text-red-600 dark:text-red-400">
                      Error: {call.error}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Code Executions */}
        <div className="mb-6">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            <Code2 size={16} />
            Code Executions ({codeExecutions.length})
          </h3>
          <div className="space-y-2">
            {codeExecutions.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No code executions yet</p>
            ) : (
              codeExecutions.map((exec, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900"
                >
                  {/* Sandbox Info */}
                  {exec.metadata && (
                    <div className="mb-3 space-y-2">
                      <div className="flex items-center gap-2 text-xs font-medium text-gray-700 dark:text-gray-300">
                        <Box size={14} />
                        <span>Sandbox Execution</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-400">
                        {exec.metadata.executionTimeMs !== undefined && (
                          <div>
                            <span className="font-medium">Time:</span> {exec.metadata.executionTimeMs}ms
                          </div>
                        )}
                        {exec.metadata.toolCallCount !== undefined && (
                          <div>
                            <span className="font-medium">Tool Calls:</span> {exec.metadata.toolCallCount}
                          </div>
                        )}
                      </div>
                      {exec.metadata.toolsUsed && exec.metadata.toolsUsed.length > 0 && (
                        <div className="text-xs">
                          <span className="font-medium text-gray-700 dark:text-gray-300">Tools Used:</span>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {exec.metadata.toolsUsed.map((tool, i) => (
                              <span
                                key={i}
                                className="rounded bg-blue-100 px-1.5 py-0.5 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                              >
                                {tool}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* Sandbox Tool Calls */}
                      {exec.metadata.sandboxToolCalls && exec.metadata.sandboxToolCalls.length > 0 && (
                        <div className="mt-2 space-y-1">
                          <div className="text-xs font-medium text-gray-700 dark:text-gray-300">
                            Sandbox Tool Calls:
                          </div>
                          <div className="space-y-1">
                            {exec.metadata.sandboxToolCalls.map((call, callIdx) => (
                              <div
                                key={callIdx}
                                className="rounded border border-gray-300 bg-white p-1.5 text-xs dark:border-gray-600 dark:bg-gray-800"
                              >
                                <div className="font-medium text-gray-900 dark:text-gray-100">
                                  {call.toolName}
                                </div>
                                {call.error && (
                                  <div className="mt-0.5 text-red-600 dark:text-red-400">
                                    Error: {call.error}
                                  </div>
                                )}
                                {call.result && (
                                  <div className="mt-0.5 truncate text-gray-600 dark:text-gray-400">
                                    ✓ Success
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {/* Code Input */}
                  {exec.code && (
                    <div className="mt-2">
                      <div className="mb-1 text-xs font-medium text-gray-700 dark:text-gray-300">Code Input:</div>
                      <pre className="max-h-40 overflow-auto rounded bg-gray-900 p-2 text-xs text-gray-100">
                        {exec.code}
                      </pre>
                    </div>
                  )}
                  
                  {/* Code Result */}
                  {exec.result !== undefined && (
                    <div className="mt-2">
                      <div className="mb-1 text-xs font-medium text-gray-700 dark:text-gray-300">Code Result:</div>
                      <pre className="max-h-40 overflow-auto rounded bg-gray-900 p-2 text-xs text-gray-100">
                        {typeof exec.result === 'string' 
                          ? exec.result 
                          : JSON.stringify(exec.result, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Metrics */}
        {metrics && (
          <div>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              <Clock size={16} />
              Performance
            </h3>
            <div className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
              <div>Total Tokens: {metrics.totalTokens}</div>
              <div>Prompt: {metrics.promptTokens}</div>
              <div>Completion: {metrics.completionTokens}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


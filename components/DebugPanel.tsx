'use client';

import { ToolCall, CodeExecution, EfficiencyMetrics } from '@/types/chat';
import { 
  Code2Icon, 
  ZapIcon, 
  ClockIcon, 
  BoxIcon, 
  WrenchIcon,
  CheckCircleIcon,
  XCircleIcon,
  ActivityIcon,
  CpuIcon,
  LayersIcon,
  GlobeIcon,
} from 'lucide-react';

// AI Elements
import { Tool, ToolHeader, ToolContent } from '@/components/ai-elements/tool';
import { CodeBlock, CodeBlockCopyButton } from '@/components/ai-elements/code-block';

// UI Components
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Collapsible, 
  CollapsibleContent, 
  CollapsibleTrigger 
} from '@/components/ui/collapsible';
import { Card } from '@/components/ui/card';

interface DebugPanelProps {
  toolCalls: ToolCall[];
  codeExecutions: CodeExecution[];
  metrics: EfficiencyMetrics | null;
}

export default function DebugPanel({ toolCalls, codeExecutions, metrics }: DebugPanelProps) {
  // Calculate MCP tool calls count
  const mcpToolCalls = toolCalls.filter(tc => tc.toolName.startsWith('mcp_'));

  return (
    <div className="w-4xl min-w-0 max-w-lg border-l bg-muted/30 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-4 py-3 shrink-0">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <ActivityIcon className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Debug Panel</h2>
          <p className="text-xs text-muted-foreground">Execution details & metrics</p>
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 space-y-6 pb-8 overflow-hidden max-w-full">
          {/* Quick Stats */}
          {metrics && (
            <div className="grid grid-cols-2 gap-2">
              <Card className="p-3 bg-background">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
                    <CpuIcon className="h-4 w-4 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Tokens</p>
                    <p className="text-sm font-semibold">{metrics.totalTokens.toLocaleString()}</p>
                  </div>
                </div>
              </Card>
              <Card className="p-3 bg-background">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-500/10">
                    <ZapIcon className="h-4 w-4 text-green-500" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Tool Calls</p>
                    <p className="text-sm font-semibold">{metrics.toolCallCount}</p>
                  </div>
                </div>
              </Card>
              <Card className="p-3 bg-background">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10">
                    <ClockIcon className="h-4 w-4 text-purple-500" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Exec Time</p>
                    <p className="text-sm font-semibold">{metrics.executionTimeMs}ms</p>
                  </div>
                </div>
              </Card>
              <Card className="p-3 bg-background">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10">
                    <LayersIcon className="h-4 w-4 text-orange-500" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Saved</p>
                    <p className="text-sm font-semibold">{metrics.tokensSaved.toLocaleString()}</p>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* Tool Calls Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <WrenchIcon className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-medium">Tool Calls</h3>
              </div>
              <div className="flex items-center gap-1">
                {mcpToolCalls.length > 0 && (
                  <Badge variant="outline" className="text-xs gap-1 border-cyan-500/50 text-cyan-600 dark:text-cyan-400">
                    <GlobeIcon className="h-3 w-3" />
                    {mcpToolCalls.length} MCP
                  </Badge>
                )}
                <Badge variant="secondary" className="text-xs">
                  {toolCalls.length}
                </Badge>
              </div>
            </div>

            {toolCalls.length === 0 ? (
              <Card className="p-4 bg-background">
                <p className="text-sm text-muted-foreground text-center">
                  No tool calls yet
                </p>
              </Card>
            ) : (
              <div className="space-y-2">
                {toolCalls.map((call) => {
                  const isMCP = call.toolName.startsWith('mcp_') || call.isMCP;
                  return (
                    <Tool key={call.id} defaultOpen={false}>
                      <div className="flex items-center">
                        <ToolHeader
                          title={call.toolName}
                          type="tool-invocation"
                          state={call.error ? 'output-error' : call.result ? 'output-available' : 'input-available'}
                        />
                        {isMCP && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 mr-3 border-cyan-500/50 text-cyan-600 dark:text-cyan-400">
                            MCP
                          </Badge>
                        )}
                      </div>
                      <ToolContent>
                        <div className="p-3 space-y-3 border-t overflow-hidden max-w-full">
                          {/* Args */}
                          {call.args && (
                            <div className="space-y-1 overflow-hidden max-w-full">
                              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                Arguments
                              </p>
                              <CodeBlock code={JSON.stringify(call.args, null, 2)} language="json" className="max-w-full overflow-hidden" wrapText>
                                <CodeBlockCopyButton />
                              </CodeBlock>
                            </div>
                          )}

                          {/* Result */}
                          {call.result && (
                            <div className="space-y-1 overflow-hidden max-w-full">
                              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                Result
                              </p>
                              <CodeBlock 
                                code={typeof call.result === 'string' ? call.result : JSON.stringify(call.result, null, 2)} 
                                language="json"
                                wrapText
                              >
                                <CodeBlockCopyButton />
                              </CodeBlock>
                            </div>
                          )}

                          {/* Error */}
                          {call.error && (
                            <div className="space-y-1 overflow-hidden max-w-full">
                              <p className="text-xs font-medium text-destructive uppercase tracking-wide">
                                Error
                              </p>
                              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive break-words whitespace-pre-wrap">
                                {call.error}
                              </div>
                            </div>
                          )}

                          {/* Execution Time */}
                          {call.executionTimeMs && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <ClockIcon className="h-3 w-3" />
                              <span>Executed in {call.executionTimeMs}ms</span>
                            </div>
                          )}
                        </div>
                      </ToolContent>
                    </Tool>
                  );
                })}
              </div>
            )}
          </div>

          <Separator />

          {/* Code Executions Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Code2Icon className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-medium">Code Executions</h3>
              </div>
              <Badge variant="secondary" className="text-xs">
                {codeExecutions.length}
              </Badge>
            </div>

            {codeExecutions.length === 0 ? (
              <Card className="p-4 bg-background">
                <p className="text-sm text-muted-foreground text-center">
                  No code executions yet
                </p>
              </Card>
            ) : (
              <div className="space-y-3">
                {codeExecutions.map((exec, idx) => {
                  // Count MCP vs local tool calls in this execution
                  const mcpCount = exec.metadata?.mcpToolCallCount ?? 
                    exec.metadata?.sandboxToolCalls?.filter(c => c.isMCP || c.toolName.startsWith('mcp_')).length ?? 0;
                  const localCount = exec.metadata?.localToolCallCount ?? 
                    (exec.metadata?.toolCallCount ?? 0) - mcpCount;

                  return (
                    <Card key={idx} className="overflow-hidden bg-background max-w-full">
                      {/* Execution Header */}
                      <div className="flex items-center justify-between p-3 border-b bg-muted/30 flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10">
                            <BoxIcon className="h-3 w-3 text-primary" />
                          </div>
                          <span className="text-sm font-medium">Sandbox Execution #{idx + 1}</span>
                        </div>
                        {exec.metadata && (
                          <div className="flex items-center gap-2">
                            {exec.metadata.executionTimeMs !== undefined && (
                              <Badge variant="outline" className="text-xs gap-1">
                                <ClockIcon className="h-3 w-3" />
                                {exec.metadata.executionTimeMs}ms
                              </Badge>
                            )}
                            {localCount > 0 && (
                              <Badge variant="outline" className="text-xs gap-1">
                                <WrenchIcon className="h-3 w-3" />
                                {localCount}
                              </Badge>
                            )}
                            {mcpCount > 0 && (
                              <Badge variant="outline" className="text-xs gap-1 border-cyan-500/50 text-cyan-600 dark:text-cyan-400">
                                <GlobeIcon className="h-3 w-3" />
                                {mcpCount} MCP
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="p-3 space-y-3 overflow-hidden max-w-full">
                        {/* Tools Used - Split by type */}
                        {exec.metadata?.toolsUsed && exec.metadata.toolsUsed.length > 0 && (
                          <div className="space-y-2 overflow-hidden max-w-full">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              Tools Used
                            </p>
                            <div className="flex flex-wrap gap-1 max-w-full">
                              {exec.metadata.toolsUsed.map((tool, i) => {
                                const isMCP = tool.startsWith('mcp_');
                                return (
                                  <Badge 
                                    key={i} 
                                    variant={isMCP ? "outline" : "secondary"} 
                                    className={`text-xs truncate max-w-full ${isMCP ? 'border-cyan-500/50 text-cyan-600 dark:text-cyan-400' : ''}`}
                                  >
                                    {isMCP && <GlobeIcon className="h-3 w-3 mr-1 shrink-0" />}
                                    <span className="truncate">{tool}</span>
                                  </Badge>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Sandbox Tool Calls */}
                        {exec.metadata?.sandboxToolCalls && exec.metadata.sandboxToolCalls.length > 0 && (
                          <Collapsible>
                            <CollapsibleTrigger className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                              <ZapIcon className="h-3 w-3" />
                              <span>{exec.metadata.sandboxToolCalls.length} Internal Tool Calls</span>
                              {mcpCount > 0 && (
                                <span className="text-cyan-600 dark:text-cyan-400">
                                  ({mcpCount} MCP)
                                </span>
                              )}
                            </CollapsibleTrigger>
                            <CollapsibleContent className="mt-2 space-y-1">
                              {exec.metadata.sandboxToolCalls.map((call, callIdx) => {
                                const isMCP = call.isMCP || call.toolName.startsWith('mcp_');
                                return (
                                  <div
                                    key={callIdx}
                                    className={`flex items-center gap-2 rounded-md border p-2 text-xs overflow-hidden max-w-full ${
                                      isMCP ? 'border-cyan-500/30 bg-cyan-500/5' : ''
                                    }`}
                                  >
                                    {call.error ? (
                                      <XCircleIcon className="h-3 w-3 text-destructive flex-shrink-0" />
                                    ) : call.result ? (
                                      <CheckCircleIcon className="h-3 w-3 text-green-500 flex-shrink-0" />
                                    ) : (
                                      <ClockIcon className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                    )}
                                    {isMCP && (
                                      <GlobeIcon className="h-3 w-3 text-cyan-500 flex-shrink-0" />
                                    )}
                                    <span className="font-medium truncate min-w-0">{call.toolName}</span>
                                    {call.executionTimeMs && (
                                      <span className="text-muted-foreground shrink-0">
                                        {call.executionTimeMs}ms
                                      </span>
                                    )}
                                    {call.error && (
                                      <span className="text-destructive truncate min-w-0">
                                        {call.error}
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </CollapsibleContent>
                          </Collapsible>
                        )}

                        {/* Code Input */}
                        {exec.code && (
                          <div className="space-y-2 overflow-hidden max-w-full">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              Code
                            </p>
                            <CodeBlock code={exec.code} language="javascript" wrapText>
                              <CodeBlockCopyButton />
                            </CodeBlock>
                          </div>
                        )}

                        {/* Result */}
                        {exec.result !== undefined && (
                          <div className="space-y-2 overflow-hidden max-w-full">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              Result
                            </p>
                            <CodeBlock 
                              code={typeof exec.result === 'string' ? exec.result : JSON.stringify(exec.result, null, 2)} 
                              language="json"
                              wrapText
                            >
                              <CodeBlockCopyButton />
                            </CodeBlock>
                          </div>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* Token Breakdown */}
          {metrics && (
            <>
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <CpuIcon className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-medium">Token Usage</h3>
                </div>
                
                <Card className="p-4 bg-background space-y-3">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Prompt Tokens</span>
                      <span className="font-medium">{metrics.promptTokens.toLocaleString()}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div 
                        className="h-full bg-blue-500 rounded-full transition-all"
                        style={{ width: `${(metrics.promptTokens / metrics.totalTokens) * 100}%` }}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Completion Tokens</span>
                      <span className="font-medium">{metrics.completionTokens.toLocaleString()}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div 
                        className="h-full bg-green-500 rounded-full transition-all"
                        style={{ width: `${(metrics.completionTokens / metrics.totalTokens) * 100}%` }}
                      />
                    </div>
                  </div>

                  {metrics.tokensSaved > 0 && (
                    <div className="pt-2 border-t">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                          <CheckCircleIcon className="h-3 w-3" />
                          Tokens Saved
                        </span>
                        <span className="font-medium text-green-600 dark:text-green-400">
                          {metrics.tokensSaved.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  )}
                </Card>
              </div>
            </>
          )}

          {/* Programmatic Execution Savings Breakdown */}
          {metrics && (metrics.totalTokensSaved || metrics.tokenSavingsBreakdown) && (
            <>
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <ZapIcon className="h-4 w-4 text-amber-500" />
                  <h3 className="text-sm font-medium">Programmatic Execution Savings</h3>
                </div>

                <Card className="p-4 bg-gradient-to-br from-amber-500/5 to-orange-500/5 border-amber-500/20 space-y-4">
                  {/* Total Savings Highlight */}
                  {metrics.totalTokensSaved && metrics.totalTokensSaved > 0 && (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-amber-500/10 to-orange-500/10">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/20">
                          <ZapIcon className="h-4 w-4 text-amber-500" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">Total Tokens Saved</p>
                          <p className="text-xs text-muted-foreground">By executing in sandbox</p>
                        </div>
                      </div>
                      <span className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                        {metrics.totalTokensSaved.toLocaleString()}
                      </span>
                    </div>
                  )}

                  {/* Detailed Breakdown */}
                  {metrics.tokenSavingsBreakdown && (
                    <div className="space-y-3">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Breakdown
                      </p>
                      
                      <div className="space-y-2">
                        {/* Intermediate Results */}
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-blue-500" />
                            <span className="text-muted-foreground">Intermediate results not sent</span>
                          </div>
                          <span className="font-medium">{metrics.tokenSavingsBreakdown.intermediateResults.toLocaleString()}</span>
                        </div>

                        {/* Round-trip Context */}
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-purple-500" />
                            <span className="text-muted-foreground">Context re-sends avoided</span>
                          </div>
                          <span className="font-medium">{metrics.tokenSavingsBreakdown.roundTripContext.toLocaleString()}</span>
                        </div>

                        {/* Tool Call Overhead */}
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-green-500" />
                            <span className="text-muted-foreground">Tool call JSON overhead</span>
                          </div>
                          <span className="font-medium">{metrics.tokenSavingsBreakdown.toolCallOverhead.toLocaleString()}</span>
                        </div>

                        {/* LLM Decisions */}
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-orange-500" />
                            <span className="text-muted-foreground">LLM decision outputs</span>
                          </div>
                          <span className="font-medium">{metrics.tokenSavingsBreakdown.llmDecisions.toLocaleString()}</span>
                        </div>
                      </div>

                      {/* Visual Bar */}
                      {metrics.totalTokensSaved && metrics.totalTokensSaved > 0 && (
                        <div className="pt-2">
                          <div className="h-3 rounded-full bg-muted overflow-hidden flex">
                            <div 
                              className="h-full bg-blue-500 transition-all"
                              style={{ width: `${(metrics.tokenSavingsBreakdown.intermediateResults / metrics.totalTokensSaved) * 100}%` }}
                              title="Intermediate results"
                            />
                            <div 
                              className="h-full bg-purple-500 transition-all"
                              style={{ width: `${(metrics.tokenSavingsBreakdown.roundTripContext / metrics.totalTokensSaved) * 100}%` }}
                              title="Context re-sends"
                            />
                            <div 
                              className="h-full bg-green-500 transition-all"
                              style={{ width: `${(metrics.tokenSavingsBreakdown.toolCallOverhead / metrics.totalTokensSaved) * 100}%` }}
                              title="Tool call overhead"
                            />
                            <div 
                              className="h-full bg-orange-500 transition-all"
                              style={{ width: `${(metrics.tokenSavingsBreakdown.llmDecisions / metrics.totalTokensSaved) * 100}%` }}
                              title="LLM decisions"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Explanation */}
                  <div className="pt-2 border-t border-amber-500/20">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      <strong>How it works:</strong> Instead of multiple LLM round-trips where each tool call 
                      sends results back to the model, programmatic execution runs all tools in a sandbox. 
                      The LLM generates code once, the sandbox executes all tools (including MCP tools via bridge), 
                      and only the final result returns. This eliminates repeated context re-sends and intermediate processing.
                    </p>
                  </div>
                </Card>
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

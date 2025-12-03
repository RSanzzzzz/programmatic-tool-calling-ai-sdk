/**
 * Type definitions for programmatic tool execution
 */
export interface ToolCallRecord {
    toolName: string;
    args: Record<string, unknown> | unknown[];
    result?: unknown;
    error?: Error | undefined;
    isMCP?: boolean;
    executionTimeMs?: number;
}
export interface CodeExecutionMetadata {
    toolCallCount: number;
    localToolCallCount?: number;
    mcpToolCallCount?: number;
    intermediateTokensSaved: number;
    totalTokensSaved?: number;
    tokenSavingsBreakdown?: {
        intermediateResults: number;
        roundTripContext: number;
        toolCallOverhead: number;
        llmDecisions: number;
    };
    savingsExplanation?: string;
    toolsUsed: string[];
    mcpToolsUsed?: string[];
    localToolsUsed?: string[];
    executionTimeMs: number;
    sandboxToolCalls?: ToolCallRecord[];
}
export interface ProgrammaticCallingOptions {
    timeout?: number;
    mcpServers?: MCPServerConfig[];
    enableContextFiltering?: boolean;
    sandboxOptions?: {
        memoryLimit?: number;
        timeout?: number;
    };
}
export interface MCPServerConfig {
    name: string;
    type: 'stdio' | 'http' | 'sse';
    command?: string;
    args?: string[];
    url?: string;
    env?: Record<string, string>;
    headers?: Record<string, string>;
}
//# sourceMappingURL=types.d.ts.map
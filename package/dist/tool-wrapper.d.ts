import { MCPToolBridge } from './mcp/bridge.js';
type ToolDefinition = Record<string, any>;
/**
 * Tool wrapper that enables programmatic tool calling using Vercel Sandbox
 * Supports both local tools and MCP tools via the MCP bridge
 */
export declare class ProgrammaticToolCaller {
    private sandbox;
    private tools;
    private toolRegistry;
    private mcpBridge;
    private mcpToolNames;
    private localToolNames;
    constructor(tools: Record<string, ToolDefinition>, timeout?: number);
    getAllToolNames(): string[];
    createCodeExecutionTool(): import("ai").Tool<{
        code: string;
    }, {
        result: any;
        metadata: {
            toolCallCount: number;
            localToolCallCount: number;
            mcpToolCallCount: number;
            intermediateTokensSaved: number;
            totalTokensSaved: number;
            tokenSavingsBreakdown: {
                intermediateResults: number;
                roundTripContext: number;
                toolCallOverhead: number;
                llmDecisions: number;
            };
            savingsExplanation: string;
            toolsUsed: string[];
            mcpToolsUsed: string[];
            localToolsUsed: string[];
            executionTimeMs: number;
            sandboxToolCalls: {
                toolName: string;
                args: unknown[] | Record<string, unknown>;
                result: unknown;
                error: string | undefined;
                isMCP: boolean | undefined;
                executionTimeMs: number | undefined;
            }[];
        };
    }>;
    generateToolDocumentation(): string;
    createEnhancedToolSet(): {
        code_execution: import("ai").Tool<{
            code: string;
        }, {
            result: any;
            metadata: {
                toolCallCount: number;
                localToolCallCount: number;
                mcpToolCallCount: number;
                intermediateTokensSaved: number;
                totalTokensSaved: number;
                tokenSavingsBreakdown: {
                    intermediateResults: number;
                    roundTripContext: number;
                    toolCallOverhead: number;
                    llmDecisions: number;
                };
                savingsExplanation: string;
                toolsUsed: string[];
                mcpToolsUsed: string[];
                localToolsUsed: string[];
                executionTimeMs: number;
                sandboxToolCalls: {
                    toolName: string;
                    args: unknown[] | Record<string, unknown>;
                    result: unknown;
                    error: string | undefined;
                    isMCP: boolean | undefined;
                    executionTimeMs: number | undefined;
                }[];
            };
        }>;
    };
    getEfficiencyMetrics(): {
        intermediateTokensSaved: number;
    };
    hasMCPTools(): boolean;
    getMCPBridge(): MCPToolBridge | null;
}
/**
 * Helper to wrap tools for programmatic calling using Vercel Sandbox
 *
 * @param tools - Tools to wrap (both local and MCP tools supported)
 * @param timeout - Execution timeout in milliseconds (default: 300000)
 */
export declare function withProgrammaticCalling(tools: Record<string, ToolDefinition>, timeout?: number): {
    tools: {
        code_execution: import("ai").Tool<{
            code: string;
        }, {
            result: any;
            metadata: {
                toolCallCount: number;
                localToolCallCount: number;
                mcpToolCallCount: number;
                intermediateTokensSaved: number;
                totalTokensSaved: number;
                tokenSavingsBreakdown: {
                    intermediateResults: number;
                    roundTripContext: number;
                    toolCallOverhead: number;
                    llmDecisions: number;
                };
                savingsExplanation: string;
                toolsUsed: string[];
                mcpToolsUsed: string[];
                localToolsUsed: string[];
                executionTimeMs: number;
                sandboxToolCalls: {
                    toolName: string;
                    args: unknown[] | Record<string, unknown>;
                    result: unknown;
                    error: string | undefined;
                    isMCP: boolean | undefined;
                    executionTimeMs: number | undefined;
                }[];
            };
        }>;
    };
    wrapper: ProgrammaticToolCaller;
};
export {};
//# sourceMappingURL=tool-wrapper.d.ts.map
/**
 * Sandbox environment for executing tool orchestration code using Vercel Sandbox
 * Provides isolated cloud execution for LLM-generated code
 *
 * Supports both local tools (executed directly) and MCP tools (routed via bridge)
 */
import { MCPToolBridge } from './mcp/bridge.js';
import type { ToolCallRecord } from './types.js';
type ToolFunction = (...args: any[]) => Promise<unknown>;
export declare class ToolOrchestrationSandbox {
    private toolCalls;
    private toolRegistry;
    private mcpBridge;
    private mcpToolNames;
    private timeout;
    constructor(toolRegistry: Map<string, ToolFunction>, timeout?: number, mcpBridge?: MCPToolBridge | null);
    private ensureSandbox;
    execute(code: string): Promise<{
        output: unknown;
        toolCalls: ToolCallRecord[];
    }>;
    private monitorToolCalls;
    private processLocalToolCall;
    private processMCPToolCall;
    getIntermedateTokenEstimate(): number;
    getComprehensiveTokenSavings(baseContextTokens?: number): {
        intermediateResultTokens: number;
        roundTripContextTokens: number;
        toolCallOverheadTokens: number;
        llmDecisionTokens: number;
        totalSaved: number;
        breakdown: string;
        mcpToolCalls: number;
        localToolCalls: number;
    };
    reset(): void;
    cleanup(): Promise<void>;
}
export {};
//# sourceMappingURL=sandbox.d.ts.map
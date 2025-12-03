/**
 * MCP Tool Bridge
 *
 * Provides a communication bridge between the Vercel Sandbox and MCP server tools.
 * Since MCP clients require persistent connections in the main Node.js process,
 * this bridge routes MCP tool calls from the sandbox via file-based IPC.
 */
import { Tool } from 'ai';
export interface MCPToolRequest {
    toolName: string;
    args: any;
    callId: string;
}
export interface MCPToolResponse {
    callId: string;
    data?: any;
    error?: string;
}
export interface MCPToolCallRecord {
    toolName: string;
    args: any;
    normalizedArgs?: any;
    result?: any;
    rawResult?: any;
    error?: Error;
    executionTimeMs?: number;
}
/**
 * MCP Tool Bridge for sandbox-to-MCP communication
 */
export declare class MCPToolBridge {
    private mcpTools;
    private toolSchemas;
    private learnedOutputSchemas;
    private toolCallRecords;
    private failedCallSignatures;
    private parameterWarnings;
    private static MAX_RETRIES;
    constructor(mcpTools: Record<string, Tool>);
    private getCallSignature;
    getToolNames(): string[];
    isMCPTool(toolName: string): boolean;
    handleRequest(request: MCPToolRequest): Promise<MCPToolResponse>;
    executeBatch(requests: MCPToolRequest[]): Promise<MCPToolResponse[]>;
    getToolCallRecords(): MCPToolCallRecord[];
    reset(): void;
    getParameterWarnings(): Map<string, string[]>;
    private learnOutputSchema;
    private inferSchema;
    private isMoreDetailed;
    getLearnedOutputSchemas(): Map<string, any>;
    getToolOutputSchema(toolName: string): any | undefined;
    getToolInputSchema(toolName: string): any | undefined;
    getTokenEstimate(): number;
}
/**
 * Create an MCP bridge from a tools object
 */
export declare function createMCPBridge(allTools: Record<string, any>): MCPToolBridge | null;
//# sourceMappingURL=bridge.d.ts.map
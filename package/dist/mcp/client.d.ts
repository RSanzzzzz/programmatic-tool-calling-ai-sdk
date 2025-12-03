/**
 * MCP (Model Context Protocol) Client
 *
 * Wrapper around the official AI SDK MCP client for connecting to MCP servers.
 * Supports HTTP/SSE transports.
 */
import { experimental_createMCPClient as createMCPClient } from '@ai-sdk/mcp';
import { Tool } from 'ai';
import type { MCPServerConfig } from '../types';
export type MCPClientInstance = Awaited<ReturnType<typeof createMCPClient>>;
/**
 * Create an MCP client for a server configuration
 */
export declare function createMCPClientFromConfig(config: MCPServerConfig): Promise<MCPClientInstance>;
/**
 * Get tools from an MCP client
 * Returns tools in AI SDK format, ready to use with streamText/generateText
 */
export declare function getMCPClientTools(client: MCPClientInstance, serverName: string): Promise<Record<string, Tool>>;
//# sourceMappingURL=client.d.ts.map
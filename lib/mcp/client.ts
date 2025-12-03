/**
 * MCP (Model Context Protocol) Client
 * 
 * Wrapper around the official AI SDK MCP client for connecting to MCP servers.
 * Supports HTTP/SSE transports.
 * 
 * Based on @ai-sdk/mcp package
 */

import { experimental_createMCPClient as createMCPClient } from '@ai-sdk/mcp';
import { Tool } from 'ai';

export interface MCPServerConfig {
  name: string;
  type: 'stdio' | 'http' | 'sse';
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
}

export type MCPClientInstance = Awaited<ReturnType<typeof createMCPClient>>;

/**
 * Create an MCP client for a server configuration
 */
export async function createMCPClientFromConfig(config: MCPServerConfig): Promise<MCPClientInstance> {
  if (config.type === 'http' || config.type === 'sse') {
    if (!config.url) {
      throw new Error(`MCP server ${config.name} requires a URL for ${config.type} transport`);
    }

    console.log(`[MCP] Creating ${config.type} client for ${config.name} at ${config.url}`);
    
    const client = await createMCPClient({
      transport: {
        type: config.type,
        url: config.url,
        headers: config.headers,
      },
    });

    return client;
  } else if (config.type === 'stdio') {
    // For stdio, we need to use the Stdio transport from @ai-sdk/mcp/mcp-stdio
    // This requires the server to be a local process
    if (!config.command) {
      throw new Error(`MCP server ${config.name} requires a command for stdio transport`);
    }

    console.log(`[MCP] Creating stdio client for ${config.name} with command: ${config.command}`);
    
    // Dynamic import of stdio transport (only available in Node.js)
    const { Experimental_StdioMCPTransport } = await import('@ai-sdk/mcp/mcp-stdio');
    
    const client = await createMCPClient({
      transport: new Experimental_StdioMCPTransport({
        command: config.command,
        args: config.args || [],
        env: config.env,
      }),
    });

    return client;
  } else {
    throw new Error(`Unsupported transport type: ${config.type}`);
  }
}

/**
 * Get tools from an MCP client
 * Returns tools in AI SDK format, ready to use with streamText/generateText
 */
export async function getMCPClientTools(
  client: MCPClientInstance,
  serverName: string
): Promise<Record<string, Tool>> {
  try {
    // Get tools from the MCP server
    // The AI SDK client handles schema conversion automatically
    const tools = await client.tools();
    
    console.log(`[MCP] Loaded ${Object.keys(tools).length} tools from ${serverName}`);
    
    // Debug: Log structure of first tool to understand MCP tool format
    const toolEntries = Object.entries(tools);
    if (toolEntries.length > 0) {
      const [firstName, firstTool] = toolEntries[0];
      const toolAny = firstTool as any;
      console.log(`[MCP] Tool "${firstName}" keys:`, Object.keys(toolAny));
      if (toolAny.parameters) {
        console.log(`[MCP] Tool "${firstName}" has parameters:`, JSON.stringify(toolAny.parameters, null, 2).slice(0, 1000));
      }
      // Check for firecrawl_search specifically
      const searchTool = tools['firecrawl_search'] as any;
      if (searchTool?.parameters) {
        console.log(`[MCP] firecrawl_search parameters:`, JSON.stringify(searchTool.parameters, null, 2));
      }
    }
    
    // Prefix tool names with mcp_ to avoid conflicts with built-in tools
    const prefixedTools: Record<string, Tool> = {};
    for (const [name, tool] of Object.entries(tools)) {
      const prefixedName = name.startsWith('mcp_') ? name : `mcp_${name}`;
      prefixedTools[prefixedName] = tool as Tool;
    }
    
    return prefixedTools;
  } catch (error) {
    console.error(`[MCP] Failed to get tools from ${serverName}:`, error);
    throw error;
  }
}

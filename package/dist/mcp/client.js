/**
 * MCP (Model Context Protocol) Client
 *
 * Wrapper around the official AI SDK MCP client for connecting to MCP servers.
 * Supports HTTP/SSE transports.
 */
import { experimental_createMCPClient as createMCPClient } from '@ai-sdk/mcp';
/**
 * Create an MCP client for a server configuration
 */
export async function createMCPClientFromConfig(config) {
    if (config.type === 'http' || config.type === 'sse') {
        if (!config.url) {
            throw new Error(`MCP server ${config.name} requires a URL for ${config.type} transport`);
        }
        const client = await createMCPClient({
            transport: {
                type: config.type,
                url: config.url,
                headers: config.headers,
            },
        });
        return client;
    }
    else if (config.type === 'stdio') {
        if (!config.command) {
            throw new Error(`MCP server ${config.name} requires a command for stdio transport`);
        }
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
    }
    else {
        throw new Error(`Unsupported transport type: ${config.type}`);
    }
}
/**
 * Get tools from an MCP client
 * Returns tools in AI SDK format, ready to use with streamText/generateText
 */
export async function getMCPClientTools(client, serverName) {
    try {
        const tools = await client.tools();
        // Prefix tool names with mcp_ to avoid conflicts with built-in tools
        const prefixedTools = {};
        for (const [name, tool] of Object.entries(tools)) {
            const prefixedName = name.startsWith('mcp_') ? name : `mcp_${name}`;
            prefixedTools[prefixedName] = tool;
        }
        return prefixedTools;
    }
    catch (error) {
        throw new Error(`Failed to get tools from ${serverName}: ${error.message}`);
    }
}

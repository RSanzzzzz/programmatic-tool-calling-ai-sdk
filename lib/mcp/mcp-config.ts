/**
 * MCP Server Configuration
 * 
 * Configure your MCP servers here. This file is type-safe and provides
 * better IDE support than environment variables.
 */

import { MCPServerConfig } from './client';

/**
 * MCP Server Configuration
 * 
 * Add your MCP servers here. Each server can use:
 * - HTTP transport: Standard HTTP POST requests
 * - SSE transport: Server-Sent Events for streaming
 * - Stdio transport: Local process with stdin/stdout (requires command)
 * 
 * Example configurations:
 * 
 * HTTP Server:
 * {
 *   name: "My MCP Server",
 *   type: "http",
 *   url: "https://example.com/mcp"
 * }
 * 
 * SSE Server:
 * {
 *   name: "Streaming MCP Server",
 *   type: "sse",
 *   url: "https://example.com/sse"
 * }
 * 
 * Stdio Server:
 * {
 *   name: "Local MCP Server",
 *   type: "stdio",
 *   command: "npx",
 *   args: ["-y", "@modelcontextprotocol/server-github"]
 * }
 */
export const mcpServers: MCPServerConfig[] = [
  // Firecrawl MCP Server - uses SSE transport
  {
    name: "Firecrawl MCP",
    type: "http",
    url: "https://mcp.firecrawl.dev/fc-6018b8c2fce04db6930f1e20fb570945/v2/mcp"
  },
  {
    name: "CLI",
    type: "stdio",
    "command": "npx",
    "args": [
      "mcp-server-commands"
    ]
  }
  // Example: Azure MCP Server (uncomment to enable)
  // {
  //   name: "Azure MCP",
  //   type: "stdio",
  //   command: "npx",
  //   args: ["-y", "@azure/mcp@latest", "server", "start", "--mode", "namespace"]
  // },
  
  // Example: Custom HTTP MCP Server
  // {
  //   name: "Custom MCP Server",
  //   type: "http",
  //   url: "https://your-mcp-server.com/mcp/"
  // },
];

/**
 * Enable MCP integration
 * 
 * Set to false to disable MCP server loading entirely.
 * This is useful for development or when you don't need MCP features.
 */
export const enableMCP: boolean = true;

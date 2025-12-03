/**
 * MCP Tool Adapter
 * 
 * This file is kept for backward compatibility but the main functionality
 * has been moved to use the official @ai-sdk/mcp package.
 * 
 * The AI SDK MCP client handles schema conversion automatically,
 * so this file now just re-exports the client functions.
 */

export { createMCPClientFromConfig, getMCPClientTools } from './client';
export type { MCPClientInstance, MCPServerConfig } from './client';

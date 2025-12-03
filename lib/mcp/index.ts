/**
 * MCP (Model Context Protocol) Integration
 * 
 * Main entry point for MCP server integration using the official AI SDK MCP client.
 */

// Export client functions and types
export { 
  createMCPClientFromConfig, 
  getMCPClientTools,
  type MCPServerConfig,
  type MCPClientInstance,
} from './client';

// Export manager
export { 
  MCPServerManager, 
  createMCPManager,
  type MCPManagerConfig,
} from './manager';

// Re-export from adapter for backward compatibility
export * from './adapter';

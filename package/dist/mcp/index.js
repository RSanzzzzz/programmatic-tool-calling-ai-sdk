/**
 * MCP Integration Module
 *
 * Optional module for Model Context Protocol server integration
 */
export { MCPServerManager, createMCPManager } from './manager.js';
export { MCPToolBridge, createMCPBridge } from './bridge.js';
export { createMCPClientFromConfig, getMCPClientTools } from './client.js';

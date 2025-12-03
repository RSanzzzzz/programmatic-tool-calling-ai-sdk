/**
 * MCP Server Manager
 *
 * Manages multiple MCP server connections and their tools using the official
 * AI SDK MCP client (@ai-sdk/mcp).
 */
import type { Tool } from 'ai';
import { MCPClientInstance } from './client.js';
import type { MCPServerConfig } from '../types.js';
export interface MCPManagerConfig {
    servers: MCPServerConfig[];
}
/**
 * Manages multiple MCP server connections
 */
export declare class MCPServerManager {
    private config;
    private connections;
    private allTools;
    private initialized;
    constructor(config: MCPManagerConfig);
    /**
     * Initialize all MCP servers and load their tools
     */
    initialize(): Promise<void>;
    /**
     * Add a single MCP server and load its tools
     */
    addServer(config: MCPServerConfig): Promise<void>;
    /**
     * Remove an MCP server and its tools
     */
    removeServer(name: string): Promise<void>;
    /**
     * Get all tools from all MCP servers
     */
    getTools(): Record<string, Tool>;
    /**
     * Get tools from a specific server
     */
    getServerTools(serverName: string): Record<string, Tool>;
    /**
     * Get list of connected servers
     */
    getServers(): string[];
    /**
     * Get a specific MCP client
     */
    getClient(serverName: string): MCPClientInstance | undefined;
    /**
     * Check if manager is initialized
     */
    isInitialized(): boolean;
    /**
     * Close all connections
     */
    close(): Promise<void>;
    /**
     * Reload tools from all servers
     */
    reload(): Promise<void>;
}
/**
 * Create MCP manager from configuration
 */
export declare function createMCPManager(config: MCPManagerConfig): MCPServerManager;
//# sourceMappingURL=manager.d.ts.map
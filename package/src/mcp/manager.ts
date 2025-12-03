/**
 * MCP Server Manager
 * 
 * Manages multiple MCP server connections and their tools using the official
 * AI SDK MCP client (@ai-sdk/mcp).
 */

import type { Tool } from 'ai';
import { 
  MCPClientInstance, 
  createMCPClientFromConfig, 
  getMCPClientTools 
} from './client.js';
import type { MCPServerConfig } from '../types.js';

export interface MCPManagerConfig {
  servers: MCPServerConfig[];
}

interface ServerConnection {
  client: MCPClientInstance;
  tools: Record<string, Tool>;
}

/**
 * Manages multiple MCP server connections
 */
export class MCPServerManager {
  private connections: Map<string, ServerConnection> = new Map();
  private allTools: Record<string, Tool> = {};
  private initialized: boolean = false;

  constructor(private config: MCPManagerConfig) {}

  /**
   * Initialize all MCP servers and load their tools
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    for (const serverConfig of this.config.servers) {
      try {
        await this.addServer(serverConfig);
      } catch (error) {
        console.error(`[MCP] Failed to initialize server ${serverConfig.name}:`, error);
      }
    }

    this.initialized = true;
  }

  /**
   * Add a single MCP server and load its tools
   */
  async addServer(config: MCPServerConfig): Promise<void> {
    if (this.connections.has(config.name)) {
      return;
    }

    try {
      const client = await createMCPClientFromConfig(config);
      const tools = await getMCPClientTools(client, config.name);
      
      this.connections.set(config.name, { client, tools });
      Object.assign(this.allTools, tools);
    } catch (error) {
      throw new Error(`Failed to add server ${config.name}: ${(error as Error).message}`);
    }
  }

  /**
   * Remove an MCP server and its tools
   */
  async removeServer(name: string): Promise<void> {
    const connection = this.connections.get(name);
    if (!connection) {
      return;
    }

    try {
      await connection.client.close();
    } catch (error) {
      console.error(`[MCP] Error closing client for ${name}:`, error);
    }

    for (const toolName of Object.keys(connection.tools)) {
      delete this.allTools[toolName];
    }

    this.connections.delete(name);
  }

  /**
   * Get all tools from all MCP servers
   */
  getTools(): Record<string, Tool> {
    return { ...this.allTools };
  }

  /**
   * Get tools from a specific server
   */
  getServerTools(serverName: string): Record<string, Tool> {
    const connection = this.connections.get(serverName);
    if (!connection) {
      return {};
    }
    return { ...connection.tools };
  }

  /**
   * Get list of connected servers
   */
  getServers(): string[] {
    return Array.from(this.connections.keys());
  }

  /**
   * Get a specific MCP client
   */
  getClient(serverName: string): MCPClientInstance | undefined {
    return this.connections.get(serverName)?.client;
  }

  /**
   * Check if manager is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    for (const [name, connection] of this.connections.entries()) {
      try {
        await connection.client.close();
      } catch (error) {
        console.error(`[MCP] Error closing server ${name}:`, error);
      }
    }
    
    this.connections.clear();
    this.allTools = {};
    this.initialized = false;
  }

  /**
   * Reload tools from all servers
   */
  async reload(): Promise<void> {
    await this.close();
    await this.initialize();
  }
}

/**
 * Create MCP manager from configuration
 */
export function createMCPManager(config: MCPManagerConfig): MCPServerManager {
  return new MCPServerManager(config);
}


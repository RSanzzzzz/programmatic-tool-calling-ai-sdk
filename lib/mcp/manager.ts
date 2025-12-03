/**
 * MCP Server Manager
 * 
 * Manages multiple MCP server connections and their tools using the official
 * AI SDK MCP client (@ai-sdk/mcp).
 */

import { Tool } from 'ai';
import { 
  MCPServerConfig, 
  MCPClientInstance, 
  createMCPClientFromConfig, 
  getMCPClientTools 
} from './client';

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

    console.log(`[MCP] Initializing ${this.config.servers.length} MCP server(s)...`);

    for (const serverConfig of this.config.servers) {
      try {
        await this.addServer(serverConfig);
      } catch (error) {
        console.error(`[MCP] Failed to initialize server ${serverConfig.name}:`, error);
        // Continue with other servers even if one fails
      }
    }

    this.initialized = true;
    console.log(`[MCP] Initialized ${this.connections.size} server(s) with ${Object.keys(this.allTools).length} total tools`);
  }

  /**
   * Add a single MCP server and load its tools
   */
  async addServer(config: MCPServerConfig): Promise<void> {
    if (this.connections.has(config.name)) {
      console.warn(`[MCP] Server ${config.name} already exists, skipping`);
      return;
    }

    try {
      // Create MCP client using the official AI SDK package
      const client = await createMCPClientFromConfig(config);
      
      // Get tools from the server (already in AI SDK format)
      const tools = await getMCPClientTools(client, config.name);
      
      // Store connection
      this.connections.set(config.name, { client, tools });
      
      // Merge tools into main tools object
      Object.assign(this.allTools, tools);
      
      console.log(`[MCP] Added server ${config.name} with ${Object.keys(tools).length} tools`);
    } catch (error) {
      console.error(`[MCP] Failed to add server ${config.name}:`, error);
      throw error;
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

    // Close the client connection
    try {
      await connection.client.close();
    } catch (error) {
      console.error(`[MCP] Error closing client for ${name}:`, error);
    }

    // Remove tools from this server
    for (const toolName of Object.keys(connection.tools)) {
      delete this.allTools[toolName];
    }

    this.connections.delete(name);
    console.log(`[MCP] Removed server ${name}`);
  }

  /**
   * Get all tools from all MCP servers
   * Returns tools in AI SDK format, ready to use with streamText/generateText
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
 * Create MCP manager from configuration file
 */
export function createMCPManager(): MCPServerManager | null {
  try {
    // Import configuration file
    const configModule = require('./mcp-config');
    const { mcpServers, enableMCP } = configModule;
    
    if (enableMCP === false) {
      console.log('[MCP] MCP integration is disabled in configuration');
      return null;
    }
    
    if (!mcpServers || !Array.isArray(mcpServers) || mcpServers.length === 0) {
      console.log('[MCP] No MCP servers configured');
      return null;
    }

    // Filter out invalid configurations
    const validServers = mcpServers.filter((server: MCPServerConfig) => {
      if (!server.name || !server.type) {
        console.warn('[MCP] Skipping invalid server configuration:', server);
        return false;
      }
      if ((server.type === 'http' || server.type === 'sse') && !server.url) {
        console.warn(`[MCP] Skipping ${server.type} server without URL:`, server.name);
        return false;
      }
      if (server.type === 'stdio' && !server.command) {
        console.warn('[MCP] Skipping stdio server without command:', server.name);
        return false;
      }
      return true;
    });

    if (validServers.length === 0) {
      console.log('[MCP] No valid MCP servers configured');
      return null;
    }

    console.log(`[MCP] Creating manager with ${validServers.length} server(s)`);
    return new MCPServerManager({ servers: validServers });
  } catch (error: any) {
    // If config file doesn't exist or has errors, that's okay
    if (error.code === 'MODULE_NOT_FOUND' || error.message?.includes('Cannot find module')) {
      console.log('[MCP] No mcp-config.ts found, skipping MCP initialization');
      return null;
    }
    console.error('[MCP] Failed to load MCP configuration:', error.message);
    return null;
  }
}

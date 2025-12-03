/**
 * MCP Server Management API
 * 
 * Endpoints for managing MCP server connections and discovering tools
 */

import { MCPServerManager, MCPServerConfig } from '@/lib/mcp';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

// In-memory store for MCP managers (in production, use a proper cache/store)
const mcpManagers = new Map<string, MCPServerManager>();

/**
 * GET /api/mcp - List available MCP servers and their tools
 */
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const serverName = searchParams.get('server');

    if (serverName) {
      // Get specific server info
      const manager = mcpManagers.get(serverName);
      if (!manager) {
        return NextResponse.json(
          { error: `Server ${serverName} not found` },
          { status: 404 }
        );
      }

      const tools = manager.getServerTools(serverName);
      return NextResponse.json({
        name: serverName,
        tools: Object.keys(tools),
        toolCount: Object.keys(tools).length,
      });
    }

    // List all servers
    const servers = Array.from(mcpManagers.keys()).map((name) => {
      const manager = mcpManagers.get(name);
      return {
        name,
        toolCount: manager ? Object.keys(manager.getServerTools(name)).length : 0,
      };
    });

    return NextResponse.json({ servers });
  } catch (error: any) {
    console.error('[MCP API] GET error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/mcp - Add or initialize MCP servers
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, servers } = body;

    if (action === 'initialize') {
      // Initialize servers from config
      if (!Array.isArray(servers)) {
        return NextResponse.json(
          { error: 'servers must be an array' },
          { status: 400 }
        );
      }

      const results = [];
      for (const serverConfig of servers as MCPServerConfig[]) {
        try {
          const manager = new MCPServerManager({ servers: [serverConfig] });
          await manager.initialize();
          
          const tools = manager.getTools();
          const toolNames = Object.keys(tools);
          
          mcpManagers.set(serverConfig.name, manager);
          
          results.push({
            name: serverConfig.name,
            status: 'success',
            toolCount: toolNames.length,
            tools: toolNames,
          });
        } catch (error: any) {
          results.push({
            name: serverConfig.name,
            status: 'error',
            error: error.message,
          });
        }
      }

      return NextResponse.json({ results });
    }

    if (action === 'list-tools') {
      // List tools from a specific server
      const { serverName } = body;
      if (!serverName) {
        return NextResponse.json(
          { error: 'serverName is required' },
          { status: 400 }
        );
      }

      const manager = mcpManagers.get(serverName);
      if (!manager) {
        return NextResponse.json(
          { error: `Server ${serverName} not found` },
          { status: 404 }
        );
      }

      const tools = manager.getTools();
      return NextResponse.json({
        server: serverName,
        tools: Object.keys(tools),
        toolCount: Object.keys(tools).length,
      });
    }

    return NextResponse.json(
      { error: 'Invalid action. Use "initialize" or "list-tools"' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('[MCP API] POST error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/mcp - Remove an MCP server
 */
export async function DELETE(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const serverName = searchParams.get('server');

    if (!serverName) {
      return NextResponse.json(
        { error: 'server parameter is required' },
        { status: 400 }
      );
    }

    const manager = mcpManagers.get(serverName);
    if (!manager) {
      return NextResponse.json(
        { error: `Server ${serverName} not found` },
        { status: 404 }
      );
    }

    await manager.close();
    mcpManagers.delete(serverName);

    return NextResponse.json({
      success: true,
      message: `Server ${serverName} removed`,
    });
  } catch (error: any) {
    console.error('[MCP API] DELETE error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}


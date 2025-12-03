# MCP Server Integration Guide

This document provides detailed information about the MCP (Model Context Protocol) integration in this application.

## Overview

The MCP integration allows you to connect to external MCP servers and use their tools alongside your existing application tools. MCP tools are automatically discovered, converted to Vercel AI SDK format, and made available to the LLM.

## Architecture

### Components

1. **MCPClient** (`lib/mcp/client.ts`)
   - Implements the MCP client protocol
   - Handles JSON-RPC communication
   - Supports HTTP and stdio transports (HTTP fully implemented)
   - Manages session lifecycle and capability negotiation

2. **MCP Adapter** (`lib/mcp/adapter.ts`)
   - Converts MCP tools to Vercel AI SDK tools
   - Maps JSON Schema to Zod schemas
   - Handles tool execution and result formatting

3. **MCP Server Manager** (`lib/mcp/manager.ts`)
   - Manages multiple MCP server connections
   - Handles initialization and cleanup
   - Provides unified tool access

4. **API Routes** (`app/api/mcp/route.ts`)
   - REST API for managing MCP servers
   - Supports adding, removing, and listing servers
   - Tool discovery endpoint

5. **UI Component** (`components/MCPServerManager.tsx`)
   - React component for managing MCP servers
   - Add/remove servers via UI
   - Display server status and tool counts

## MCP Protocol Implementation

### Initialization

The client follows the MCP initialization flow:

1. Send `initialize` request with client capabilities
2. Receive server capabilities and info
3. Send `notifications/initialized` notification

### Tool Discovery

Tools are discovered via:
- `tools/list` method (supports pagination)
- Returns tool definitions with JSON Schema input/output schemas

### Tool Execution

Tools are called via:
- `tools/call` method with tool name and arguments
- Returns structured content (text, images, etc.)

## JSON Schema to Zod Conversion

The adapter converts JSON Schema properties to Zod types:

- `string` → `z.string()`
- `number` → `z.number()`
- `integer` → `z.number().int()`
- `boolean` → `z.boolean()`
- `array` → `z.array(itemType)`
- `object` → `z.object(shape)`

Required fields are marked with `.optional()` for optional properties.

## Tool Naming Convention

MCP tools are prefixed with `mcp_` to avoid conflicts:
- Original: `get_weather`
- Prefixed: `mcp_get_weather`

## Integration with Programmatic Tool Calling

MCP tools are integrated into the tool system but have special handling:

- **Not available in sandbox**: MCP tools require external connections and cannot be used within `code_execution`
- **Direct calls only**: MCP tools must be called directly by the LLM
- **System prompt**: The LLM is informed about MCP tools and their limitations

## Example: Adding a GitHub MCP Server

### Via Configuration File (Recommended)

Edit `lib/mcp/mcp-config.ts`:

```typescript
export const mcpServers: MCPServerConfig[] = [
  {
    name: "GitHub MCP",
    type: "http",
    url: "https://api.githubcopilot.com/mcp/"
  }
];

export const enableMCP: boolean = true;
```

The server will be automatically loaded when the application starts.

### Via UI

1. Open the application
2. Find the "MCP Servers" panel
3. Click "Add Server"
4. Fill in:
   - Name: "GitHub MCP"
   - Type: HTTP
   - URL: `https://api.githubcopilot.com/mcp/`
5. Click "Add Server"

**Note**: UI-added servers are session-specific and won't persist across restarts.

### Via API

```bash
curl -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "action": "initialize",
    "servers": [{
      "name": "GitHub MCP",
      "type": "http",
      "url": "https://api.githubcopilot.com/mcp/"
    }]
  }'
```

## Example: Using MCP Tools

Once an MCP server is connected, its tools are automatically available. The LLM can call them like any other tool:

```
User: "Search for repositories about TypeScript on GitHub"

Assistant: [Calls mcp_github_search_repositories with query="TypeScript"]
```

## Error Handling

- **Connection failures**: Logged and server marked as error
- **Tool call failures**: Errors are returned to the LLM
- **Schema conversion failures**: Fallback to `z.any()`
- **Timeout handling**: 30-second timeout for API requests

## Security Considerations

1. **Server URLs**: Only connect to trusted MCP servers
2. **Tool execution**: MCP tools execute with the permissions of the server
3. **Session management**: Session IDs are managed securely
4. **Input validation**: All tool inputs are validated against schemas

## Limitations

1. **Stdio transport**: Not yet fully implemented (HTTP recommended)
2. **Sandbox exclusion**: MCP tools cannot be used in code_execution
3. **Schema conversion**: Some advanced JSON Schema features may not convert perfectly
4. **Concurrent requests**: Each server connection is independent

## Future Enhancements

- Full stdio transport implementation
- Tool result caching
- Server health monitoring
- Tool usage analytics
- WebSocket transport support
- Resource and prompt support (beyond tools)

## Debugging

Enable debug logging by checking console output:
- `[MCP]` prefix indicates MCP-related logs
- Tool discovery logs show loaded tools
- Tool execution logs show calls and results
- Error logs show connection and execution failures

## References

- [MCP Specification](https://modelcontextprotocol.io/specification/2025-11-25)
- [MCP Servers Repository](https://github.com/modelcontextprotocol/servers)
- [Vercel AI SDK Tools](https://sdk.vercel.ai/docs/guides/tools)


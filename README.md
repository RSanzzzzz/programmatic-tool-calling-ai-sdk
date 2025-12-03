# Programmatic Tool Calling - Next.js App

A Next.js application demonstrating programmatic tool calling with Vercel AI SDK and Vercel Sandbox. Features a beautiful chat interface with real-time debugging and efficiency metrics visualization.

Inspired by Anthropic's beta features announced November 24, 2025, programmatic tool calling affords efficiency and cost gains by allowing LLM to write that chains tools rather than default approach of round trips that bloat context and history.

## Features

- **Multi-Provider Support**: Works with Anthropic Claude, OpenAI models, and **Vercel AI Gateway** (access to 100+ models)
- **Programmatic Tool Calling**: LLM generates JavaScript code to orchestrate multiple tools efficiently
- **MCP Server Support**: Connect to Model Context Protocol (MCP) servers to access external tools and services
- **Vercel Sandbox**: Isolated cloud execution for LLM-generated code
- **Real-Time Chat**: Streaming responses with live updates
- **Debug Panel**: View tool calls, code executions, and sandbox logs
- **Efficiency Metrics**: Visual display of token savings and performance gains
- **Modern UI**: Tailwind CSS with dark mode support

## Getting Started

### Prerequisites

- Node.js 18+ 
- Vercel account (for Sandbox)
- AI Provider API keys (Anthropic or OpenAI)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env
```

3. Add your API keys to `.env`:
```env
# Required: At least one AI provider
ANTHROPIC_API_KEY=sk-ant-...
# OR
OPENAI_API_KEY=sk-...

# Vercel AI Gateway (optional - enables access to 100+ models)
# Get your API key from: https://vercel.com/docs/ai-gateway
AI_GATEWAY_API_KEY=your_gateway_api_key_here

# Vercel Sandbox (required)
# Option 1: Run `vercel link` in the project directory
# Option 2: Set VERCEL_TOKEN manually
VERCEL_TOKEN=your_vercel_token_here
```

**Note**: MCP servers are configured in `lib/mcp/mcp-config.ts` (see MCP Server Integration section below).

4. Link to Vercel (if not using VERCEL_TOKEN):
```bash
vercel link
```

5. Run the development server:
```bash
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

1. **Select Model**: Choose your AI provider and model from the dropdown in the header
   - **Anthropic**: Direct access to Claude models
   - **OpenAI**: Direct access to GPT models
   - **Vercel Gateway**: Access to 100+ models from various providers (requires `AI_GATEWAY_API_KEY`)
2. **Configure MCP Servers** (Optional): Add MCP servers to access external tools and services
   - Click "Add Server" in the MCP Servers panel
   - Configure HTTP or stdio transport
   - MCP tools will be automatically discovered and made available
3. **Start Chatting**: Type a message that requires multiple tool calls
4. **View Debug Info**: Click "Show Debug" to see tool calls and code executions
5. **Monitor Efficiency**: Check the metrics bar at the bottom for token savings

### Example Prompts

- "Get 5 users, calculate their average score, and return users with score above 50"
- "Get 10 users and find the top 3 by score"
- "Calculate statistics for all users in the engineering department"

## Project Structure

```
vercel-ptc-next/
├── app/
│   ├── api/
│   │   ├── chat/route.ts    # Chat API endpoint (streaming)
│   │   └── mcp/route.ts      # MCP server management API
│   ├── layout.tsx            # Root layout
│   ├── page.tsx              # Main chat page
│   └── globals.css          # Global styles
├── components/
│   ├── ChatInterface.tsx    # Main chat UI
│   ├── MessageBubble.tsx    # Message display
│   ├── ModelSelector.tsx    # Provider/model selection
│   ├── DebugPanel.tsx       # Debug information panel
│   ├── EfficiencyMetrics.tsx # Metrics display
│   └── MCPServerManager.tsx # MCP server management UI
├── lib/
│   ├── mcp/                  # MCP integration
│   │   ├── client.ts         # MCP client implementation
│   │   ├── adapter.ts        # MCP tool to AI SDK adapter
│   │   ├── manager.ts        # MCP server manager
│   │   ├── mcp-config.ts     # MCP server configuration (edit this!)
│   │   └── index.ts          # MCP exports
│   ├── sandbox.ts           # Vercel Sandbox integration
│   ├── tool-wrapper.ts      # Programmatic tool calling wrapper
│   ├── context-manager.ts   # Context filtering
│   ├── tools.ts             # Tool definitions
│   └── providers.ts        # AI provider factory
└── types/
    └── chat.ts              # TypeScript types
```

## How It Works

1. **User sends message** → Chat API receives request
2. **Tools are wrapped** → `withProgrammaticCalling` adds `code_execution` tool
3. **LLM generates code** → Instead of individual tool calls, LLM writes JavaScript
4. **Code executes in sandbox** → Vercel Sandbox runs code in isolated environment
5. **Tools called internally** → Multiple tools execute without polluting LLM context
6. **Only final result** → Aggregated result sent back to LLM
7. **Efficiency gains** → Intermediate results never enter context, saving tokens

## MCP Server Integration

This application supports the [Model Context Protocol (MCP)](https://modelcontextprotocol.io), an open standard for connecting AI applications to external tools and data sources.

### What is MCP?

MCP is a protocol that enables AI models to discover and use tools from external servers. It provides:
- **Standardized tool discovery**: Servers expose tools with JSON Schema definitions
- **Multiple transport options**: HTTP or stdio (standard input/output)
- **Rich metadata**: Tools include descriptions, input/output schemas, and icons
- **Session management**: Persistent connections with capability negotiation

### Adding MCP Servers

#### Via Configuration File (Recommended)
Edit `lib/mcp/mcp-config.ts` to add your MCP servers:

```typescript
export const mcpServers: MCPServerConfig[] = [
  {
    name: "GitHub MCP",
    type: "http",
    url: "https://api.githubcopilot.com/mcp/"
  },
  {
    name: "Azure MCP",
    type: "stdio",
    command: "npx",
    args: ["-y", "@azure/mcp@latest", "server", "start"]
  }
];

export const enableMCP: boolean = true;
```

#### Via UI
1. Click "Add Server" in the MCP Servers panel
2. Enter server name and select transport type
3. For HTTP: Provide the server URL
4. For stdio: Provide command and arguments (e.g., `npx -y @modelcontextprotocol/server-github`)

**Note**: Servers added via UI are session-specific and won't persist. Use the config file for permanent configuration.

### Example MCP Servers

- **GitHub MCP**: Access GitHub repositories, issues, and pull requests
  - HTTP: `https://api.githubcopilot.com/mcp/`
- **Azure MCP**: Manage Azure resources and services
  - Stdio: `npx -y @azure/mcp server start`
- **Custom MCP Servers**: Build your own using the [MCP SDK](https://modelcontextprotocol.io)

### How MCP Tools Work

1. **Discovery**: When an MCP server is added, the client discovers all available tools
2. **Conversion**: MCP tools are converted to Vercel AI SDK format with proper Zod schemas
3. **Integration**: MCP tools are merged with your existing tools
4. **Usage**: The LLM can call MCP tools just like any other tool
5. **Execution**: Tool calls are forwarded to the MCP server via JSON-RPC

### MCP Tool Naming

MCP tools are prefixed with `mcp_` to avoid conflicts with local tools. For example:
- `mcp_github_search_repositories`
- `mcp_azure_storage_account_get`

### Limitations

- MCP tools cannot be used within `code_execution` (they require external connections)
- Stdio transport requires process management (currently HTTP is recommended)
- Tool schemas are converted from JSON Schema to Zod (some edge cases may not be supported)

## Efficiency Benefits

- **37% token reduction** on complex workflows
- **90% fewer inference passes** (20+ → 2 steps typical)
- **85% context efficiency** (only final results enter context)
- **Faster execution** with parallel tool calls
- **Extended capabilities** via MCP server integration

## Deployment

Deploy to Vercel:

```bash
vercel
```

Make sure to set environment variables in Vercel dashboard:
- `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`
- Vercel Sandbox authentication is handled automatically

**Note**: MCP servers are configured in `lib/mcp/mcp-config.ts` - edit this file to add your servers.

## Resources

- [Model Context Protocol Specification](https://modelcontextprotocol.io/specification/2025-11-25)
- [MCP Server Examples](https://github.com/modelcontextprotocol/servers)
- [Vercel AI SDK Documentation](https://sdk.vercel.ai/docs)
- [Vercel Sandbox Documentation](https://vercel.com/docs/sandbox)

## License

MIT

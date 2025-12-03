# @task-orchestrator/programmatic-tools

Programmatic tool execution for Vercel AI SDK with MCP integration and efficiency optimizations.

## Features

- **Programmatic Tool Calling**: Execute multiple tools programmatically using JavaScript code in a sandbox
- **MCP Integration**: Optional support for Model Context Protocol servers
- **Context Management**: Filter intermediate tool results to save tokens
- **Efficiency Metrics**: Track token savings from programmatic execution

## Installation

```bash
npm install @task-orchestrator/programmatic-tools
```

### Peer Dependencies

- `ai` (Vercel AI SDK) ^5.0.0
- `@vercel/sandbox` ^1.0.0
- `zod` ^3.0.0

### Optional Dependencies

- `@ai-sdk/mcp` ^0.0.11 (for MCP support)

## Basic Usage

```typescript
import { streamText } from 'ai';
import { withProgrammaticCalling } from '@task-orchestrator/programmatic-tools';
import { tool } from 'ai';
import { z } from 'zod';

// Define your tools
const myTools = {
  getUser: tool({
    description: 'Get user by ID',
    inputSchema: z.object({ id: z.string() }),
    execute: async ({ id }) => ({ id, name: `User ${id}` }),
  }),
  calculateAverage: tool({
    description: 'Calculate average of numbers',
    inputSchema: z.object({ numbers: z.array(z.number()) }),
    execute: async ({ numbers }) => ({ average: numbers.reduce((a, b) => a + b, 0) / numbers.length }),
  }),
};

// Wrap tools for programmatic calling
const { tools } = withProgrammaticCalling(myTools);

// Use with streamText or generateText
const result = await streamText({
  model: yourModel,
  tools,
  messages: [{ role: 'user', content: 'Get users 1, 2, 3 and calculate their average score' }],
});
```

## MCP Integration

```typescript
import { withProgrammaticCalling } from '@task-orchestrator/programmatic-tools';
import { createMCPManager } from '@task-orchestrator/programmatic-tools/mcp';

// Initialize MCP servers
const mcpManager = createMCPManager({
  servers: [
    {
      name: 'github',
      type: 'http',
      url: 'https://api.githubcopilot.com/mcp/',
    },
  ],
});

await mcpManager.initialize();
const mcpTools = mcpManager.getTools();

// Combine with your local tools
const allTools = { ...myTools, ...mcpTools };

// Wrap for programmatic calling
const { tools } = withProgrammaticCalling(allTools);
```

## How It Works

When you wrap tools with `withProgrammaticCalling`, it adds a `code_execution` tool that allows the LLM to write JavaScript code that can call your tools programmatically.

### Example Execution Flow

1. User asks: "Get users 1, 2, 3 and calculate their average score"
2. LLM generates code:
   ```javascript
   const users = await Promise.all([
     getUser({ id: '1' }),
     getUser({ id: '2' }),
     getUser({ id: '3' })
   ]);
   const scores = users.map(u => u.score);
   return calculateAverage({ numbers: scores });
   ```
3. Code executes in Vercel Sandbox with access to all tools
4. Only the final result is returned to the LLM (saving tokens)

## Defensive Helper Functions

The sandbox includes helper functions for handling unpredictable responses:

- `toArray(value)` - Safely convert any value to an array
- `safeGet(obj, 'path.to.prop', defaultValue)` - Safe nested property access
- `safeMap(value, fn)` - Map over any value safely
- `safeFilter(value, fn)` - Filter any value safely
- `first(value)` - Get first item safely
- `len(value)` - Get length safely
- `isSuccess(response)` - Check if MCP response was successful
- `extractData(response)` - Extract data from various response formats
- `extractText(response, default)` - Extract text/string output
- `getCommandOutput(response)` - Get command output with success/error

## Configuration Options

```typescript
const { tools } = withProgrammaticCalling(myTools, {
  timeout: 30000, // Sandbox execution timeout in ms
  // MCP servers can be configured via createMCPManager
});
```

## Context Management

Use `withContextManagement` to filter intermediate tool results:

```typescript
import { ContextManager, withContextManagement } from '@task-orchestrator/programmatic-tools';

const contextManager = new ContextManager();

const result = await streamText({
  model,
  tools,
  messages,
  ...withContextManagement({
    contextManager,
    onStepFinish: (step) => {
      // Your custom step handling
    },
  }),
});

// Get token savings
const tokensSaved = contextManager.getTokensSaved();
```

## API Reference

### `withProgrammaticCalling(tools, timeout?)`

Wraps tools to enable programmatic calling.

**Parameters:**
- `tools`: Record of tool definitions (Vercel AI SDK format)
- `timeout`: Execution timeout in milliseconds (default: 300000)

**Returns:**
- `tools`: Enhanced tool set with `code_execution` tool
- `wrapper`: `ProgrammaticToolCaller` instance

### `createMCPManager(config)`

Creates an MCP server manager.

**Parameters:**
- `config.servers`: Array of MCP server configurations

**Returns:**
- `MCPServerManager` instance

## License

MIT


<p align="center">
  <img src="https://img.shields.io/badge/AI_SDK-5.0-blue?style=for-the-badge" alt="AI SDK 5.0" />
  <img src="https://img.shields.io/badge/MCP-Enabled-green?style=for-the-badge" alt="MCP Enabled" />
  <img src="https://img.shields.io/badge/Next.js-16-black?style=for-the-badge" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/Vercel_Sandbox-Powered-white?style=for-the-badge" alt="Vercel Sandbox" />
</p>

# 🚀 Programmatic Tool Calling with AI SDK

### A Universal LLM Optimization POC for Any Model

**Programmatic Tool Calling** is a novel approach to dramatically reduce LLM inference costs and latency by replacing traditional multi-round-trip tool calling with code generation and sandboxed execution.

> 💡 Inspired by [Anthropic's beta capabilities](https://www.anthropic.com/engineering/advanced-tool-use) announced November 2025. This project extends that paradigm to work with **any LLM** through the Vercel AI SDK, including 100+ models via the AI Gateway.

---

## 🎯 The Problem

Traditional LLM tool calling is **inherently inefficient**, especially with MCP:

```
User: "Get data for users 1-5 and find the highest scorer"

Traditional Approach (N round-trips):
┌─────────────────────────────────────────────────────────────┐
│ Round 1: LLM → getUser(1) → result → LLM (context grows)    │
│ Round 2: LLM → getUser(2) → result → LLM (context grows)    │
│ Round 3: LLM → getUser(3) → result → LLM (context grows)    │
│ Round 4: LLM → getUser(4) → result → LLM (context grows)    │
│ Round 5: LLM → getUser(5) → result → LLM (context grows)    │
│ Round 6: LLM → final answer                                  │
└─────────────────────────────────────────────────────────────┘
                         ⬇️
            6 LLM calls × full context each
            Accumulated results pollute context
            High latency, high token cost
```

## ✨ The Solution

PTC transforms tool orchestration into a single code generation + execution:

```
Programmatic Approach (1 round-trip):
┌─────────────────────────────────────────────────────────────┐
│ Round 1: LLM generates JavaScript:                          │
│   const users = await Promise.all([                         │
│     getUser({ id: '1' }), getUser({ id: '2' }),             │
│     getUser({ id: '3' }), getUser({ id: '4' }),             │
│     getUser({ id: '5' })                                    │
│   ]);                                                        │
│   return users.sort((a,b) => b.score - a.score)[0];         │
│                                                              │
│ → Execute in Sandbox → Return final result only             │
│                                                              │
│ Round 2: LLM receives final answer, responds to user        │
└─────────────────────────────────────────────────────────────┘
                         ⬇️
            2 LLM calls total
            Intermediate results never enter context
            Parallel execution, massive savings
```

---

## 📊 Proven Efficiency Gains

| Metric | Traditional | PTC | Improvement |
|--------|-------------|-----|-------------|
| **LLM Round-trips** | N (per tool) | 2 (fixed) | 90% reduction |
| **Context Growth** | Exponential | Constant | 85% efficiency |
| **Token Usage** | ~70,000 (10 tools) | ~14,000 | 80% savings |
| **Latency** | Sequential | Parallel | 3-5x faster |
| **MCP Tool Calls** | N round-trips | 1 code_execution | 60-80% savings |

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        User Request                               │
└──────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│  Vercel AI SDK 5.0 + Programmatic Tool Wrapper                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  withProgrammaticCalling(tools)                            │  │
│  │    ├── Wraps local tools (Zod schemas)                     │  │
│  │    ├── Wraps MCP tools (JSON Schema)                       │  │
│  │    └── Injects code_execution meta-tool                    │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│  LLM (Any Provider via AI Gateway)                               │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Generates JavaScript code orchestrating N tool calls      │  │
│  │  Uses defensive helpers (toArray, safeGet, isSuccess...)   │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│  Vercel Sandbox (Isolated Cloud Execution)                       │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  ┌─────────────┐    ┌─────────────────────────────────┐   │  │
│  │  │ Local Tools │    │ MCP Bridge (File-based IPC)     │   │  │
│  │  │ getUser()   │    │ mcp_firecrawl_scrape()          │   │  │
│  │  │ calculate() │    │ mcp_github_search()             │   │  │
│  │  └─────────────┘    └─────────────────────────────────┘   │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│  Main Process (MCP Tool Bridge Monitor)                          │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  - Routes sandbox MCP requests to real MCP servers         │  │
│  │  - Supports HTTP, SSE, and Stdio transports                │  │
│  │  - Normalizes responses for predictable code access        │  │
│  │  - Parallel batch execution for efficiency                 │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│  Final Result Only → Back to LLM → User Response                 │
└──────────────────────────────────────────────────────────────────┘
```

---

## 🌟 Key Features

### 🔧 Universal Model Support
- **Direct Providers**: Anthropic Claude, OpenAI GPT
- **Vercel AI Gateway**: 100+ models (Gemini, Mistral, Groq, DeepSeek, Meta, etc.)
- Works with any model that supports tool calling

### 🧪 Vercel Sandbox Execution
- Isolated cloud environment for LLM-generated code
- Node.js 22 runtime with full async/await support
- Automatic syntax validation before execution
- Singleton pattern for cost optimization

### 🔌 MCP Protocol Integration
- First-class support for [Model Context Protocol](https://modelcontextprotocol.io)
- HTTP, SSE, and Stdio transport support
- Novel **MCP Bridge** architecture for sandbox↔MCP communication
- Parameter normalization and response transformation

### 📈 Real-Time Efficiency Metrics
- Token savings breakdown (intermediate, context, overhead, decisions)
- Execution time tracking
- Visual metrics display in UI
- Per-execution cost analysis

### 🛡️ Defensive Runtime Helpers
Built-in utilities for handling unpredictable MCP responses:
```javascript
toArray(value)           // Safe array conversion
safeGet(obj, 'path')     // Safe nested property access
safeMap(value, fn)       // Safe iteration
isSuccess(response)      // Check MCP response success
extractText(response)    // Extract string output
getCommandOutput(resp)   // Parse command results
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Vercel account (for Sandbox)
- At least one AI provider API key

### Installation

#### Option 1: Use the Published Package (Recommended)

Install the published npm package:

```bash
npm install @task-orchestrator/programmatic-tools
```

**Peer Dependencies** (required):
```bash
npm install ai@^5.0.0 @vercel/sandbox@^1.0.0 zod@^3.0.0 ms@^2.1.0
```

**Optional Dependencies** (for MCP support):
```bash
npm install @ai-sdk/mcp@^0.0.11
```

#### Option 2: Clone and Develop

```bash
# Clone the repository
git clone https://github.com/your-repo/vercel-ptc-next.git
cd vercel-ptc-next

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
```

### Environment Configuration

```env
# Required: At least one AI provider
ANTHROPIC_API_KEY=sk-ant-...
# OR
OPENAI_API_KEY=sk-...

# Optional: Vercel AI Gateway (100+ models)
AI_GATEWAY_API_KEY=your_gateway_api_key

# Vercel Sandbox (run `vercel link` or set token)
VERCEL_TOKEN=your_vercel_token
```

### Run Development Server

```bash
npm run dev
# Open http://localhost:3000
```

---

## 📖 Usage

### Using the Package in Your Project

#### Basic Setup

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
    execute: async ({ id }) => ({ id, name: `User ${id}`, score: Math.random() * 100 }),
  }),
  calculateAverage: tool({
    description: 'Calculate average of numbers',
    inputSchema: z.object({ numbers: z.array(z.number()) }),
    execute: async ({ numbers }) => ({
      average: numbers.reduce((a, b) => a + b, 0) / numbers.length
    }),
  }),
};

// Wrap tools for programmatic calling
const { tools } = withProgrammaticCalling(myTools);

// Use with streamText or generateText
const result = await streamText({
  model: yourModel,
  tools,
  messages: [{ 
    role: 'user', 
    content: 'Get users 1, 2, 3 and calculate their average score' 
  }],
});
```

#### With MCP Integration

```typescript
import { withProgrammaticCalling } from '@task-orchestrator/programmatic-tools';
import { createMCPManager } from '@task-orchestrator/programmatic-tools/mcp';

// Initialize MCP servers
const mcpManager = createMCPManager({
  servers: [
    {
      name: 'firecrawl',
      type: 'http',
      url: 'https://mcp.firecrawl.dev/your-key/v2/mcp',
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

#### With Context Management (Token Optimization)

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
console.log(`Saved ${tokensSaved.totalSaved} tokens`);
```

### Using the Demo Application

If you've cloned the repository, you can run the full demo:

#### Basic Chat
1. Select your model from the dropdown (⌘K to open)
2. Type a prompt that requires multiple operations
3. Watch as PTC generates code and executes efficiently

#### Example Prompts

```
"Get 5 users and calculate their average score"
→ Generates Promise.all() with 5 getUser calls + calculation

"Scrape 3 URLs and summarize their content"
→ Parallel mcp_firecrawl_scrape calls + aggregation

"Find top products on ProductHunt today"
→ MCP scraping with filtering and formatting
```

#### Debug Panel
Click "Debug" to view:
- Generated code
- Individual tool call results
- Token savings breakdown
- Execution timeline

---

## 🔌 MCP Server Configuration

### Via Config File (Recommended)

Edit `lib/mcp/mcp-config.ts`:

```typescript
export const mcpServers: MCPServerConfig[] = [
  // HTTP transport
  {
    name: "Firecrawl MCP",
    type: "http",
    url: "https://mcp.firecrawl.dev/your-key/v2/mcp"
  },
  // Stdio transport (local process)
  {
    name: "GitHub MCP",
    type: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"]
  },
  // SSE transport
  {
    name: "Streaming MCP",
    type: "sse",
    url: "https://example.com/sse"
  }
];

export const enableMCP: boolean = true;
```

### MCP Bridge: How It Works

The MCP Bridge enables sandbox code to call external MCP tools:

```
┌─────────────────────────────────────────────────────────────┐
│  Vercel Sandbox                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  // LLM-generated code                               │    │
│  │  const results = await Promise.all([                 │    │
│  │    mcp_firecrawl_scrape({ url: '...' }),             │    │
│  │    mcp_firecrawl_scrape({ url: '...' })              │    │
│  │  ]);                                                 │    │
│  │                                                       │    │
│  │  // Writes to /tmp/mcp_call_*.json                   │    │
│  │  // Polls /tmp/mcp_result_*.json                     │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Main Process (Bridge Monitor)                               │
│  - Watches for MCP request files                             │
│  - Routes to real MCP client (HTTP/SSE/Stdio)                │
│  - Normalizes responses                                      │
│  - Writes results back to sandbox filesystem                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 📁 Project Structure

```
vercel-ptc-next/
├── app/
│   ├── api/
│   │   ├── chat/route.ts       # Main chat endpoint with PTC
│   │   ├── mcp/route.ts        # MCP server management
│   │   └── models/route.ts     # Gateway model discovery
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── components/
│   ├── ChatInterface.tsx       # Main UI with AI Elements
│   ├── DebugPanel.tsx          # Tool call inspection
│   ├── EfficiencyMetrics.tsx   # Token savings display
│   ├── MCPServerManager.tsx    # MCP configuration UI
│   └── ai-elements/            # Modular AI UI components
│       ├── conversation.tsx
│       ├── message.tsx
│       ├── tool.tsx
│       ├── code-block.tsx
│       ├── chain-of-thought.tsx
│       └── ...
├── lib/
│   ├── tool-wrapper.ts         # 🔑 Core PTC implementation
│   ├── sandbox.ts              # Vercel Sandbox orchestration
│   ├── mcp-bridge.ts           # MCP ↔ Sandbox communication
│   ├── mcp/
│   │   ├── client.ts           # MCP client implementation
│   │   ├── adapter.ts          # MCP → AI SDK conversion
│   │   ├── manager.ts          # Multi-server management
│   │   └── mcp-config.ts       # Server configuration
│   ├── providers.ts            # AI provider factory
│   ├── tools.ts                # Example tool definitions
│   └── context-manager.ts      # Token optimization
└── types/
    └── chat.ts                 # TypeScript definitions
```

---

## 💰 Cost Analysis

### Vercel Sandbox Pricing

| Metric | Rate | Free Tier (Hobby) |
|--------|------|-------------------|
| Active CPU Time | $0.128/hour | 5 hours/month |
| Provisioned Memory | $0.0106/GB-hour | 420 GB-hours |
| Network Bandwidth | $0.15/GB | 20 GB |
| Sandbox Creations | $0.60/million | 5,000 |

### Cost Per Execution (2 vCPU, 4GB RAM)

| Scenario | Duration | Est. Cost |
|----------|----------|-----------|
| Quick (3-5 tools) | 10 sec | ~$0.0004 |
| Medium (5-10 tools) | 30 sec | ~$0.001 |
| Heavy (MCP-heavy) | 2 min | ~$0.003 |

### ROI Analysis

| Metric | Traditional (10 tools) | PTC |
|--------|------------------------|-----|
| LLM Round-trips | 10 | 2 |
| Context tokens | ~70,000 | ~14,000 |
| LLM cost (GPT-4) | $0.70-$2.10 | $0.14-$0.42 |
| Sandbox cost | $0 | ~$0.002 |
| **Net Savings** | - | **$0.50-$1.70** |

**Result**: Sandbox overhead of ~$0.002 saves $0.50-$1.70 in LLM costs per complex workflow.

---

## 🔮 How Token Savings Are Calculated

PTC tracks four categories of savings:

```typescript
{
  // 1. Intermediate Results (never sent to LLM)
  intermediateResultTokens: 12500,
  
  // 2. Context Re-sends (base context × N-1 calls avoided)
  roundTripContextTokens: 35000,
  
  // 3. Tool Call Overhead (JSON structure per call)
  toolCallOverheadTokens: 400,
  
  // 4. LLM Decision Outputs (reasoning per step avoided)
  llmDecisionTokens: 720,
  
  // Total
  totalSaved: 48620
}
```

---

## 🛠️ Extending PTC

### Adding Local Tools

When using the package:

```typescript
import { tool } from 'ai';
import { z } from 'zod';

const myTools = {
  myCustomTool: tool({
    description: 'Description for LLM',
    inputSchema: z.object({
      param: z.string().describe('Parameter description'),
    }),
    execute: async ({ param }) => {
      // Your implementation
      return { result: '...' };
    },
  }),
};

const { tools } = withProgrammaticCalling(myTools);
```

When developing locally (in this repo):

```typescript
// lib/tools.ts
export const tools = {
  myCustomTool: tool({
    description: 'Description for LLM',
    inputSchema: z.object({
      param: z.string().describe('Parameter description'),
    }),
    execute: async ({ param }) => {
      // Your implementation
      return { result: '...' };
    },
  }),
};
```

### Adding MCP Servers

When using the package:

```typescript
import { createMCPManager } from '@task-orchestrator/programmatic-tools/mcp';

const mcpManager = createMCPManager({
  servers: [
    {
      name: "Your MCP Server",
      type: "http",
      url: "https://your-mcp-server.com/mcp"
    },
  ],
});
```

When developing locally (in this repo):

```typescript
// lib/mcp/mcp-config.ts
export const mcpServers: MCPServerConfig[] = [
  {
    name: "Your MCP Server",
    type: "http",
    url: "https://your-mcp-server.com/mcp"
  },
];
```

---

## 🧪 Development

```bash
# Run development server
npm run dev

# Type checking
npm run build

# Linting
npm run lint
```

---

## 📦 Package Information

The core functionality is available as an npm package:

**Package:** [`@task-orchestrator/programmatic-tools`](https://www.npmjs.com/package/@task-orchestrator/programmatic-tools)

**Installation:**
```bash
npm install @task-orchestrator/programmatic-tools
```

**Documentation:** See the [package README](./package/README.md) for detailed API documentation.

**Features:**
- ✅ Programmatic tool calling with code generation
- ✅ MCP (Model Context Protocol) integration
- ✅ Context management for token optimization
- ✅ Efficiency metrics tracking
- ✅ Defensive helper functions for robust execution

## 📚 Resources

- [Package Documentation](./package/README.md) - Detailed API reference
- [npm Package](https://www.npmjs.com/package/@task-orchestrator/programmatic-tools) - Install and use in your projects
- [Vercel AI SDK Documentation](https://sdk.vercel.ai/docs)
- [Model Context Protocol Specification](https://modelcontextprotocol.io/specification/2025-11-25)
- [Vercel Sandbox Documentation](https://vercel.com/docs/vercel-sandbox)
- [Vercel Sandbox Pricing](https://vercel.com/docs/vercel-sandbox/pricing)
- [MCP Server Examples](https://github.com/modelcontextprotocol/servers)

---

## 🤝 Contributing

Contributions are welcome! This is a novel pattern with room for:
- Additional MCP server integrations
- Performance optimizations
- New defensive helper functions
- Provider-specific optimizations
- UI/UX improvements

---

## 📄 License

MIT

---

<p align="center">
  <strong>Built with ❤️ using Vercel AI SDK, Vercel Sandbox, and MCP</strong>
  <br/>
  <em>First-of-its-kind LLM optimization for the modern AI stack</em>
</p>

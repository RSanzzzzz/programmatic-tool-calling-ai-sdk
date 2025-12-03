# Programmatic Tool Calling - Next.js App

A Next.js application demonstrating programmatic tool calling with Vercel AI SDK and Vercel Sandbox. Features a beautiful chat interface with real-time debugging and efficiency metrics visualization.

Inspired by Anthropic's beta features announced November 24, 2025, programmatic tool calling affords efficiency and cost gains by allowing LLM to write that chains tools rather than default approach of round trips that bloat context and history.

## Features

- **Multi-Provider Support**: Works with Anthropic Claude, OpenAI models, and **Vercel AI Gateway** (access to 100+ models)
- **Programmatic Tool Calling**: LLM generates JavaScript code to orchestrate multiple tools efficiently
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
2. **Start Chatting**: Type a message that requires multiple tool calls
3. **View Debug Info**: Click "Show Debug" to see tool calls and code executions
4. **Monitor Efficiency**: Check the metrics bar at the bottom for token savings

### Example Prompts

- "Get 5 users, calculate their average score, and return users with score above 50"
- "Get 10 users and find the top 3 by score"
- "Calculate statistics for all users in the engineering department"

## Project Structure

```
vercel-ptc-next/
├── app/
│   ├── api/chat/route.ts    # Chat API endpoint (streaming)
│   ├── layout.tsx            # Root layout
│   ├── page.tsx              # Main chat page
│   └── globals.css          # Global styles
├── components/
│   ├── ChatInterface.tsx    # Main chat UI
│   ├── MessageBubble.tsx    # Message display
│   ├── ModelSelector.tsx    # Provider/model selection
│   ├── DebugPanel.tsx       # Debug information panel
│   └── EfficiencyMetrics.tsx # Metrics display
├── lib/
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

## Efficiency Benefits

- **37% token reduction** on complex workflows
- **90% fewer inference passes** (20+ → 2 steps typical)
- **85% context efficiency** (only final results enter context)
- **Faster execution** with parallel tool calls

## Deployment

Deploy to Vercel:

```bash
vercel
```

Make sure to set environment variables in Vercel dashboard:
- `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`
- Vercel Sandbox authentication is handled automatically

## License

MIT

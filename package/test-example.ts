/**
 * Example usage of @vercel-ai/programmatic-tools
 * 
 * This file demonstrates how to use the package in a project.
 * Run with: npx tsx test-example.ts (after installing tsx)
 */

import { withProgrammaticCalling } from './src/index';
import { tool } from 'ai';
import { z } from 'zod';

// Example: Basic usage without MCP
async function basicExample() {
  console.log('=== Basic Example ===\n');

  // Define your tools
  const myTools = {
    getUser: tool({
      description: 'Get user by ID',
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => {
        console.log(`[TOOL] Getting user ${id}`);
        return { id, name: `User ${id}`, score: Math.floor(Math.random() * 100) };
      },
    }),
    calculateAverage: tool({
      description: 'Calculate average of numbers',
      inputSchema: z.object({ numbers: z.array(z.number()) }),
      execute: async ({ numbers }) => {
        const avg = numbers.reduce((a, b) => a + b, 0) / numbers.length;
        console.log(`[TOOL] Calculating average of ${numbers.length} numbers`);
        return { average: avg };
      },
    }),
  };

  // Wrap tools for programmatic calling
  const { tools, wrapper } = withProgrammaticCalling(myTools, 30000);

  console.log('Available tools:', wrapper.getAllToolNames());
  console.log('Has MCP tools:', wrapper.hasMCPTools());
  console.log('\nTool documentation:');
  console.log(wrapper.generateToolDocumentation());
  console.log('\n✅ Package is working!');
}

// Example: With MCP integration
async function mcpExample() {
  console.log('\n=== MCP Example ===\n');

  try {
    // Dynamic import since MCP is optional
    const { createMCPManager } = await import('./src/mcp');

    console.log('MCP module loaded successfully');
    console.log('To use MCP, configure servers:');
    console.log(`
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
    `);
  } catch (error) {
    console.log('MCP module not available (optional dependency)');
  }
}

// Run examples
async function main() {
  try {
    await basicExample();
    await mcpExample();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}


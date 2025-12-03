import { tool } from 'ai';
import { z } from 'zod';
import { ToolOrchestrationSandbox } from './sandbox';

/**
 * Tool wrapper that enables programmatic tool calling using Vercel Sandbox
 */
export class ProgrammaticToolCaller {
  private sandbox: ToolOrchestrationSandbox;
  private tools: Record<string, any>;
  private toolRegistry: Map<string, Function>;

  constructor(
    tools: Record<string, any>,
    timeout: number = 30000
  ) {
    this.tools = tools;
    this.toolRegistry = new Map();
    
    // Extract execute functions for sandbox
    // Note: MCP tools are included but may not work in sandbox due to external dependencies
    for (const [name, toolDef] of Object.entries(tools)) {
      if (toolDef.execute) {
        // Only add non-MCP tools to sandbox (MCP tools need external client connections)
        if (!name.startsWith('mcp_')) {
          this.toolRegistry.set(name, toolDef.execute);
        }
      }
    }
    
    this.sandbox = new ToolOrchestrationSandbox(this.toolRegistry, timeout);
  }

  /**
   * Create a code execution tool for programmatic tool calling
   */
  createCodeExecutionTool() {
    return tool({
      description: `Execute JavaScript code to orchestrate multiple tool calls efficiently. USE THIS TOOL when you need to process multiple items or make 3+ tool calls.

REQUIRED for tasks like:
- Getting multiple users (use Promise.all with getUser calls)
- Processing arrays of data
- Making multiple dependent tool calls
- Filtering/aggregating results

Available tools in code: ${Array.from(this.toolRegistry.keys()).join(', ')}

Example for getting multiple users:
const users = await Promise.all([
  getUser({ id: 'user1' }),
  getUser({ id: 'user2' }),
  getUser({ id: 'user3' })
]);
const avg = calculateAverage({ numbers: users.map(u => u.score) });
return filterByScore({ users, minScore: avg.average });

IMPORTANT: Always use this tool when the user asks for multiple items (like "get 10 users") rather than asking for individual IDs.`,
      
      inputSchema: z.object({
        code: z.string().describe('JavaScript code to execute. Can use async/await. Tools are available as functions. Return final result.'),
      }),
      
      execute: async ({ code }) => {
        const startTime = Date.now();
        try {
          console.log('[CODE_EXECUTION] Starting execution...');
          const { output, toolCalls } = await Promise.race([
            this.sandbox.execute(code),
            new Promise<never>((_, reject) => 
              setTimeout(() => reject(new Error('Code execution timeout after 25 seconds')), 25000)
            ),
          ]);
          
          const executionTime = Date.now() - startTime;
          console.log(`[CODE_EXECUTION] Completed in ${executionTime}ms, ${toolCalls.length} tool calls`);
          
          // Calculate efficiency metrics
          const intermediateTokens = this.sandbox.getIntermedateTokenEstimate();
          
          // Ensure output is serializable
          let serializableOutput;
          try {
            serializableOutput = JSON.parse(JSON.stringify(output));
          } catch (serializeError) {
            console.warn('[CODE_EXECUTION] Output serialization failed, using string representation');
            serializableOutput = String(output);
          }
          
          return {
            result: serializableOutput,
            metadata: {
              toolCallCount: toolCalls.length,
              intermediateTokensSaved: intermediateTokens,
              toolsUsed: [...new Set(toolCalls.map(c => c.toolName))],
              executionTimeMs: executionTime,
              sandboxToolCalls: toolCalls.map(c => ({
                toolName: c.toolName,
                args: c.args,
                result: c.result,
                error: c.error?.message,
              })),
            },
          };
        } catch (error) {
          const executionTime = Date.now() - startTime;
          console.error(`[CODE_EXECUTION] Failed after ${executionTime}ms:`, error);
          throw new Error(`Code execution failed: ${(error as Error).message}`);
        } finally {
          this.sandbox.reset();
        }
      },
    });
  }

  /**
   * Generate tool descriptions for LLM to understand available tools
   */
  generateToolDocumentation(): string {
    const docs: string[] = [];
    
    for (const [name, toolDef] of Object.entries(this.tools)) {
      docs.push(`${name}: ${toolDef.description || 'No description'}`);
      
      if (toolDef.inputSchema) {
        try {
          // Safely access _def - it might not exist for all Zod types
          if (toolDef.inputSchema._def && typeof toolDef.inputSchema._def.shape === 'function') {
            const shape = toolDef.inputSchema._def.shape();
            const params = Object.entries(shape).map(([key, val]: [string, any]) => {
              // Safely access description - val might not have _def
              const desc = (val && val._def && val._def.description) || '';
              return `  - ${key}: ${desc}`;
            });
            docs.push(params.join('\n'));
          }
        } catch (error) {
          // If we can't extract schema info, just skip it
          console.warn(`[ToolWrapper] Failed to extract schema for ${name}:`, error);
        }
      }
    }
    
    return docs.join('\n\n');
  }

  /**
   * Create enhanced tool set with code execution
   */
  createEnhancedToolSet() {
    return {
      ...this.tools,
      code_execution: this.createCodeExecutionTool(),
    };
  }

  /**
   * Get efficiency stats from last execution
   */
  getEfficiencyMetrics() {
    return {
      intermediateTokensSaved: this.sandbox.getIntermedateTokenEstimate(),
    };
  }
}

/**
 * Helper to wrap tools for programmatic calling using Vercel Sandbox
 * @param tools - Tools to wrap
 * @param timeout - Execution timeout in milliseconds (default: 30000)
 */
export function withProgrammaticCalling(
  tools: Record<string, any>,
  timeout: number = 30000
) {
  const wrapper = new ProgrammaticToolCaller(tools, timeout);
  return {
    tools: wrapper.createEnhancedToolSet(),
    wrapper,
  };
}


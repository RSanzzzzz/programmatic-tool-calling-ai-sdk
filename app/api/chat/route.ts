import { streamText, stepCountIs } from 'ai';
import { getModel, ModelConfig } from '@/lib/providers';
import { withProgrammaticCalling } from '@/lib/tool-wrapper';
import { ContextManager, withContextManagement } from '@/lib/context-manager';
import { tools } from '@/lib/tools';
import { MCPServerManager, createMCPManager } from '@/lib/mcp';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Global MCP manager instance (initialized once)
let mcpManager: MCPServerManager | null = null;

// Initialize MCP manager on first use
async function getMCPManager(): Promise<MCPServerManager | null> {
  if (!mcpManager) {
    mcpManager = createMCPManager();
    if (mcpManager) {
      try {
        await mcpManager.initialize();
      } catch (error) {
        console.error('[MCP] Failed to initialize MCP manager:', error);
        mcpManager = null;
      }
    }
  }
  return mcpManager;
}

export async function POST(req: Request) {
  try {
    const { messages, modelConfig, maxSteps = 10, mcpServers } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response('Messages array is required', { status: 400 });
    }

    if (!modelConfig || !modelConfig.provider || !modelConfig.model) {
      return new Response('Model configuration is required', { status: 400 });
    }

    // Merge base tools with MCP tools
    let allTools = { ...tools };
    
    // Load MCP tools if servers are provided or configured
    if (mcpServers && Array.isArray(mcpServers) && mcpServers.length > 0) {
      // Create temporary MCP manager for this request
      const tempMCPManager = new MCPServerManager({ servers: mcpServers });
      try {
        await tempMCPManager.initialize();
        const mcpTools = tempMCPManager.getTools();
        allTools = { ...allTools, ...mcpTools };
      } catch (error) {
        console.error('[MCP] Failed to load MCP tools:', error);
      }
    } else {
      // Use global MCP manager if available
      const globalMCPManager = await getMCPManager();
      if (globalMCPManager) {
        const mcpTools = globalMCPManager.getTools();
        allTools = { ...allTools, ...mcpTools };
      }
    }

    // Wrap tools with programmatic calling
    const { tools: enhancedTools, wrapper } = withProgrammaticCalling(allTools);
    const contextManager = new ContextManager();
    const toolCalls: any[] = [];
    const codeExecutions: any[] = [];

    // Get the model instance
    const model = getModel(modelConfig as ModelConfig);
    console.log(`[Chat API] Using model: ${modelConfig.provider}/${modelConfig.model}`);

    // Build tool list for system prompt
    const toolNames = Object.keys(enhancedTools).filter(name => name !== 'code_execution');
    const baseTools = toolNames.filter(name => !name.startsWith('mcp_'));
    const mcpTools = toolNames.filter(name => name.startsWith('mcp_'));
    
    let toolDescription = `You have access to tools including ${baseTools.join(', ')}, and code_execution.`;
    if (mcpTools.length > 0) {
      toolDescription += `\n\nAdditionally, you have access to ${mcpTools.length} MCP (Model Context Protocol) tools: ${mcpTools.slice(0, 5).join(', ')}${mcpTools.length > 5 ? ` and ${mcpTools.length - 5} more` : ''}.`;
      toolDescription += `\nMCP tools are prefixed with 'mcp_' and provide access to external services and data sources.`;
    }
    
    // Generate detailed tool documentation for code_execution
    const toolDocumentation = wrapper.generateToolDocumentation();

    // Prepare messages with system prompt
    const systemMessage = {
      role: 'system' as const,
      content: `${toolDescription}

When you need to process multiple items or make multiple tool calls, ALWAYS use the code_execution tool to write JavaScript code that:
1. Calls tools in parallel using Promise.all() when possible
2. Processes the results efficiently  
3. Returns only the final aggregated result

IMPORTANT: Both local tools AND MCP tools can be used within code_execution!
This enables efficient parallel execution of multiple MCP tool calls.

**TOOL PARAMETER REFERENCE:**
${toolDocumentation}

**DEFENSIVE HELPER FUNCTIONS (always available in code_execution):**
- toArray(value) - Converts any value to array safely
- safeGet(obj, 'path.to.prop', default) - Safe nested property access
- safeMap(value, fn) - Maps over any value safely
- safeFilter(value, fn) - Filters any value safely
- first(value) - Gets first item safely
- len(value) - Gets length safely
- isSuccess(response) - Checks if MCP response succeeded
- extractData(response) - Extracts data from MCP response
- extractText(response, default) - Extracts text/string output
- getCommandOutput(response) - Returns { success, output, error }

Example with local tools:
\`\`\`javascript
const users = await Promise.all([
  getUser({ id: 'user1' }),
  getUser({ id: 'user2' }),
  getUser({ id: 'user3' })
]);
const sorted = users.sort((a, b) => b.score - a.score);
return sorted.slice(0, 3);
\`\`\`

Example with MCP scraping (use defensive patterns):
\`\`\`javascript
const results = await Promise.all([
  mcp_firecrawl_scrape({ url: 'https://example1.com' }),
  mcp_firecrawl_scrape({ url: 'https://example2.com' })
]);
return safeMap(results, r => ({
  success: isSuccess(r),
  title: safeGet(r, 'metadata.title', 'Unknown'),
  preview: safeGet(r, 'markdown', '').substring(0, 200)
}));
\`\`\`

Example with MCP command execution:
\`\`\`javascript
const commands = ['pwd', 'whoami', 'date'];
const results = await Promise.all(
  commands.map(cmd => mcp_run_command({ command: cmd }))
);
// extractText gets the output from any response format:
return results.map((r, i) => ({
  command: commands[i],
  output: extractText(r, 'No output'),
  success: isSuccess(r)
}));
\`\`\`

**CRITICAL RULES FOR MCP TOOLS:**
1. Pass parameters as SINGLE OBJECT: mcp_tool({ param: value })
2. ALWAYS use defensive helpers - MCP responses vary by server
3. Check isSuccess(response) before using data
4. Use safeGet() for ALL nested properties
5. Use toArray() or safeMap() when iterating results
6. NEVER assume response structure - different MCP servers return different formats

Always use code_execution for tasks requiring 3+ tool calls - this saves significant tokens by executing all tools in a single sandbox run rather than multiple LLM round-trips.`,
    };

    // Stream the response
    const result = streamText({
      model,
      messages: [systemMessage, ...messages],
      tools: enhancedTools,
      stopWhen: stepCountIs(maxSteps),
      ...withContextManagement({
        contextManager,
        onStepFinish: (step) => {
          // Track tool calls
          if (step.toolCalls) {
            for (const toolCall of step.toolCalls) {
              // Find corresponding result
              const toolResult = step.toolResults?.find(
                (r: any) => r.toolCallId === toolCall.toolCallId
              );
              const resultOutput = toolResult?.output || toolResult?.result;
              
              toolCalls.push({
                id: toolCall.toolCallId,
                toolName: toolCall.toolName,
                args: toolCall.args || toolCall.input,
                result: resultOutput,
                timestamp: new Date(),
              });

              // Track code executions
              if (toolCall.toolName === 'code_execution') {
                // AI SDK 5.0 uses 'input' instead of 'args'
                const code = toolCall.input?.code || toolCall.args?.code || '';
                const toolResult = step.toolResults?.find(
                  (r: any) => r.toolCallId === toolCall.toolCallId
                );
                
                if (toolResult) {
                  // The AI SDK uses 'output' instead of 'result' for tool results
                  // The tool returns { result: serializableOutput, metadata: {...} }
                  const executionResult = toolResult.output || toolResult.result;
                  
                  // Extract metadata - it should be at executionResult.metadata
                  let metadata = executionResult?.metadata;
                  let resultData = executionResult?.result;
                  
                  // If executionResult itself has the metadata properties, use it directly
                  if (!metadata && executionResult && typeof executionResult === 'object') {
                    if ('toolCallCount' in executionResult || 'executionTimeMs' in executionResult) {
                      metadata = executionResult;
                      resultData = executionResult.result;
                    }
                  }
                  
                  codeExecutions.push({
                    code,
                    result: resultData,
                    metadata: metadata || {
                      toolCallCount: 0,
                      intermediateTokensSaved: 0,
                      toolsUsed: [],
                      executionTimeMs: 0,
                    },
                    timestamp: new Date(),
                  });
                }
              }
            }
          }
        },
      }),
    });

    // Create a readable stream that includes metadata
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of result.textStream) {
            controller.enqueue(encoder.encode(chunk));
          }

          // Wait for final result to get usage stats
          const finalResult = await result;
          const usage = await finalResult.usage;

          // Extract usage stats (AI SDK 5.0 uses inputTokens/outputTokens instead of promptTokens/completionTokens)
          const usageObj = usage as any;
          const totalTokens = usageObj?.totalTokens || 0;
          const inputTokens = usageObj?.inputTokens || 0;
          const outputTokens = usageObj?.outputTokens || 0;

          // Re-extract code execution metadata from final result to ensure we have complete data
          const finalCodeExecutions = [...codeExecutions];
          
          // Try to get steps from finalResult - it might be in different locations
          const steps = (finalResult as any).steps || (finalResult as any).response?.steps || [];
          
          if (Array.isArray(steps) && steps.length > 0) {
            for (const step of steps) {
              if (step.toolCalls) {
                for (const toolCall of step.toolCalls) {
                    if (toolCall.toolName === 'code_execution') {
                      // AI SDK 5.0 uses 'input' instead of 'args'
                      const code = toolCall.input?.code || toolCall.args?.code || '';
                      const toolResult = step.toolResults?.find(
                        (r: any) => r.toolCallId === toolCall.toolCallId
                      );
                      // Use 'output' instead of 'result' for AI SDK tool results
                      const executionResult = toolResult?.output || toolResult?.result;
                      if (executionResult) {
                        const existingExec = finalCodeExecutions.find(
                          (ce) => ce.code === code
                        );
                        if (existingExec) {
                          // Update with complete metadata from final result
                          const metadata = executionResult?.metadata || 
                            (executionResult && typeof executionResult === 'object' && 
                             ('toolCallCount' in executionResult || 'executionTimeMs' in executionResult) 
                             ? executionResult : null);
                          if (metadata) {
                            existingExec.metadata = metadata;
                            existingExec.result = executionResult?.result || executionResult;
                          }
                        }
                      }
                    }
                }
              }
            }
          }

          // Send final metadata
          const finishEvent = {
            type: 'metadata',
            data: {
              tokensSaved: contextManager.getTokensSaved(),
              totalTokens,
              promptTokens: inputTokens, // Map to UI-friendly name
              completionTokens: outputTokens, // Map to UI-friendly name
              toolCallCount: toolCalls.length,
              toolCalls,
              codeExecutions: finalCodeExecutions,
            },
          };
          controller.enqueue(encoder.encode(`\n\n__METADATA__:${JSON.stringify(finishEvent)}\n`));

          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  } catch (error: any) {
    console.error('Chat API error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}


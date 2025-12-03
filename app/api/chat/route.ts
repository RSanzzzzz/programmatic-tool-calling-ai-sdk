import { streamText, stepCountIs } from 'ai';
import { getModel, ModelConfig } from '@/lib/providers';
import { withProgrammaticCalling } from '@/lib/tool-wrapper';
import { ContextManager, withContextManagement } from '@/lib/context-manager';
import { tools } from '@/lib/tools';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { messages, modelConfig, maxSteps = 10 } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response('Messages array is required', { status: 400 });
    }

    if (!modelConfig || !modelConfig.provider || !modelConfig.model) {
      return new Response('Model configuration is required', { status: 400 });
    }

    // Wrap tools with programmatic calling
    const { tools: enhancedTools } = withProgrammaticCalling(tools);
    const contextManager = new ContextManager();
    const toolCalls: any[] = [];
    const codeExecutions: any[] = [];

    // Get the model instance
    const model = getModel(modelConfig as ModelConfig);

    // Prepare messages with system prompt
    const systemMessage = {
      role: 'system' as const,
      content: `You have access to tools including getUser, calculateAverage, filterByScore, and code_execution.

When you need to process multiple items (like getting multiple users), ALWAYS use the code_execution tool to write JavaScript code that:
1. Calls tools in parallel using Promise.all() when possible
2. Processes the results efficiently
3. Returns only the final aggregated result

For example, to get 10 users and find top 3 by score, use code_execution with:
\`\`\`javascript
const users = await Promise.all([
  getUser({ id: 'user1' }),
  getUser({ id: 'user2' }),
  getUser({ id: 'user3' }),
  getUser({ id: 'user4' }),
  getUser({ id: 'user5' }),
  getUser({ id: 'user6' }),
  getUser({ id: 'user7' }),
  getUser({ id: 'user8' }),
  getUser({ id: 'user9' }),
  getUser({ id: 'user10' })
]);
const sorted = users.sort((a, b) => b.score - a.score);
return sorted.slice(0, 3);
\`\`\`

Always use code_execution for tasks requiring 3+ tool calls.`,
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
              toolCalls.push({
                id: toolCall.toolCallId,
                toolName: toolCall.toolName,
                args: toolCall.args,
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


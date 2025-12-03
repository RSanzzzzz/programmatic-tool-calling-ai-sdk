import type { CoreMessage } from 'ai';

/**
 * Context manager that filters intermediate tool results
 * Only allows final code execution results into LLM context
 */
export class ContextManager {
  private messageHistory: CoreMessage[] = [];
  private tokensSaved: number = 0;

  /**
   * Add a message to history, filtering intermediate tool results
   */
  addMessage(message: CoreMessage, options?: { isCodeExecutionResult?: boolean }) {
    if (options?.isCodeExecutionResult) {
      // Allow code execution results (these are final, aggregated results)
      this.messageHistory.push(message);
    } else if (message.role === 'assistant' || message.role === 'user') {
      // Always allow user and assistant messages
      this.messageHistory.push(message);
    } else if (message.role === 'tool') {
      // Filter out intermediate tool results unless they're from code execution
      // This prevents context pollution from individual tool calls
      let isCodeExecution = false;
      if (typeof message.content === 'string') {
        try {
          const parsed = JSON.parse(message.content);
          isCodeExecution = parsed.toolName === 'code_execution';
        } catch {
          // Not JSON, check other formats
        }
      } else if (Array.isArray(message.content)) {
        isCodeExecution = message.content.some((part: any) => 
          part.type === 'tool-result' && part.toolName === 'code_execution'
        );
      }
      
      if (isCodeExecution) {
        this.messageHistory.push(message);
      } else {
        // Estimate tokens saved
        const estimatedTokens = this.estimateTokens(message);
        this.tokensSaved += estimatedTokens;
      }
    }
  }

  /**
   * Get filtered message history for LLM
   */
  getMessages(): CoreMessage[] {
    return [...this.messageHistory];
  }

  /**
   * Get token savings statistics
   */
  getTokensSaved(): number {
    return this.tokensSaved;
  }

  /**
   * Reset message history
   */
  reset() {
    this.messageHistory = [];
    this.tokensSaved = 0;
  }

  /**
   * Estimate tokens in a message (rough approximation)
   */
  private estimateTokens(message: CoreMessage): number {
    const content = JSON.stringify(message.content);
    // Rough estimate: 1 token per 4 characters
    return Math.ceil(content.length / 4);
  }

  /**
   * Create a compact summary of tool execution for context
   */
  createToolExecutionSummary(toolName: string, result: any): string {
    if (typeof result === 'object' && result.metadata) {
      return `Executed ${toolName}: ${result.metadata.toolCallCount || 0} tool calls, saved ${result.metadata.intermediateTokensSaved || 0} tokens`;
    }
    return `Executed ${toolName}`;
  }
}

/**
 * Helper to integrate context manager with generateText/streamText
 */
export function withContextManagement(options: {
  onStepFinish?: (step: any) => void;
  contextManager: ContextManager;
}) {
  return {
    onStepFinish: (step: any) => {
      // Add assistant message to context
      if (step.text) {
        options.contextManager.addMessage({
          role: 'assistant',
          content: step.text,
        });
      }

      // Handle tool results - only allow code execution results
      if (step.toolResults) {
        for (const toolResult of step.toolResults) {
          const isCodeExecution = toolResult.toolName === 'code_execution';
          
          if (isCodeExecution) {
            options.contextManager.addMessage(
              {
                role: 'tool',
                content: [
                  {
                    type: 'tool-result',
                    toolCallId: toolResult.toolCallId,
                    toolName: toolResult.toolName,
                    ...(toolResult.result !== undefined && { result: toolResult.result }),
                  } as any,
                ],
              },
              { isCodeExecutionResult: true }
            );
          }
        }
      }

      // Call user's onStepFinish if provided
      if (options.onStepFinish) {
        options.onStepFinish(step);
      }
    },
  };
}


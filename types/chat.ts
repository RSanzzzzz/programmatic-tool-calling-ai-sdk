export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

export interface ToolCall {
  id: string;
  toolName: string;
  args: any;
  result?: any;
  error?: string;
  timestamp: Date;
  executionTimeMs?: number;
}

export interface CodeExecution {
  code: string;
  toolCalls: ToolCall[];
  result: any;
  metadata?: {
    toolCallCount: number;
    intermediateTokensSaved: number;
    toolsUsed: string[];
    executionTimeMs: number;
    sandboxToolCalls?: Array<{
      toolName: string;
      args: any;
      result?: any;
      error?: string;
    }>;
  };
}

export interface EfficiencyMetrics {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  tokensSaved: number;
  toolCallCount: number;
  executionTimeMs: number;
  intermediateTokensSaved: number;
}

export interface ChatState {
  messages: ChatMessage[];
  toolCalls: ToolCall[];
  codeExecutions: CodeExecution[];
  metrics: EfficiencyMetrics | null;
  isLoading: boolean;
  error: string | null;
}


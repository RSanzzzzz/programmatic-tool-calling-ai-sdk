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
  isMCP?: boolean;
}

export interface TokenSavingsBreakdown {
  intermediateResults: number;
  roundTripContext: number;
  toolCallOverhead: number;
  llmDecisions: number;
}

export interface SandboxToolCall {
  toolName: string;
  args: any;
  result?: any;
  error?: string;
  isMCP?: boolean;
  executionTimeMs?: number;
}

export interface CodeExecutionMetadata {
  toolCallCount: number;
  localToolCallCount?: number;
  mcpToolCallCount?: number;
  intermediateTokensSaved: number;
  totalTokensSaved?: number;
  tokenSavingsBreakdown?: TokenSavingsBreakdown;
  savingsExplanation?: string;
  toolsUsed: string[];
  mcpToolsUsed?: string[];
  localToolsUsed?: string[];
  executionTimeMs: number;
  sandboxToolCalls?: SandboxToolCall[];
}

export interface CodeExecution {
  code: string;
  toolCalls: ToolCall[];
  result: any;
  metadata?: CodeExecutionMetadata;
}

export interface EfficiencyMetrics {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  tokensSaved: number;
  toolCallCount: number;
  executionTimeMs: number;
  intermediateTokensSaved: number;
  totalTokensSaved?: number;
  tokenSavingsBreakdown?: TokenSavingsBreakdown;
  savingsExplanation?: string;
}

export interface ChatState {
  messages: ChatMessage[];
  toolCalls: ToolCall[];
  codeExecutions: CodeExecution[];
  metrics: EfficiencyMetrics | null;
  isLoading: boolean;
  error: string | null;
}

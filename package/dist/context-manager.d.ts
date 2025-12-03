import type { CoreMessage } from 'ai';
/**
 * Context manager that filters intermediate tool results
 * Only allows final code execution results into LLM context
 */
export declare class ContextManager {
    private messageHistory;
    private tokensSaved;
    /**
     * Add a message to history, filtering intermediate tool results
     */
    addMessage(message: CoreMessage, options?: {
        isCodeExecutionResult?: boolean;
    }): void;
    /**
     * Get filtered message history for LLM
     */
    getMessages(): CoreMessage[];
    /**
     * Get token savings statistics
     */
    getTokensSaved(): number;
    /**
     * Reset message history
     */
    reset(): void;
    /**
     * Estimate tokens in a message (rough approximation)
     */
    private estimateTokens;
    /**
     * Create a compact summary of tool execution for context
     */
    createToolExecutionSummary(toolName: string, result: any): string;
}
/**
 * Helper to integrate context manager with generateText/streamText
 */
export declare function withContextManagement(options: {
    onStepFinish?: (step: any) => void;
    contextManager: ContextManager;
}): {
    onStepFinish: (step: any) => void;
};
//# sourceMappingURL=context-manager.d.ts.map
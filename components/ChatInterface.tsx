'use client';

import { useState, useRef, useEffect } from 'react';
import { ChatMessage, ToolCall, CodeExecution, EfficiencyMetrics } from '@/types/chat';
import MessageBubble from './MessageBubble';
import ModelSelector from './ModelSelector';
import DebugPanel from './DebugPanel';
import EfficiencyMetricsDisplay from './EfficiencyMetrics';
import { ModelConfig } from '@/lib/providers';

export default function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [codeExecutions, setCodeExecutions] = useState<CodeExecution[]>([]);
  const [metrics, setMetrics] = useState<EfficiencyMetrics | null>(null);
  const [modelConfig, setModelConfig] = useState<ModelConfig>({
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
  });
  const [showDebug, setShowDebug] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // Create abort controller for this request
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            ...messages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            {
              role: 'user',
              content: input,
            },
          ],
          modelConfig,
          maxSteps: 10,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';
      const assistantMessageId = (Date.now() + 1).toString();

      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          
          // Check for metadata
          if (chunk.includes('__METADATA__:')) {
            const parts = chunk.split('__METADATA__:');
            assistantContent += parts[0];
            
            try {
              const metadata = JSON.parse(parts[1].trim());
              if (metadata.type === 'metadata') {
                const data = metadata.data;
                setMetrics({
                  totalTokens: data.totalTokens || 0,
                  promptTokens: data.promptTokens || 0,
                  completionTokens: data.completionTokens || 0,
                  tokensSaved: data.tokensSaved || 0,
                  toolCallCount: data.toolCallCount || 0,
                  executionTimeMs: data.codeExecutions?.[0]?.metadata?.executionTimeMs || 0,
                  intermediateTokensSaved: data.codeExecutions?.[0]?.metadata?.intermediateTokensSaved || 0,
                });
                
                // Update tool calls and code executions
                if (data.toolCalls) {
                  setToolCalls(data.toolCalls.map((tc: any) => ({
                    ...tc,
                    timestamp: new Date(tc.timestamp),
                  })));
                }
                
                if (data.codeExecutions) {
                  setCodeExecutions(data.codeExecutions.map((ce: any) => ({
                    ...ce,
                    timestamp: new Date(ce.timestamp),
                  })));
                }
              }
            } catch (e) {
              console.error('Failed to parse metadata:', e);
            }
          } else {
            assistantContent += chunk;
          }

          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? { ...m, content: assistantContent }
                : m
            )
          );
        }
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('Request aborted');
      } else {
        console.error('Error:', error);
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            role: 'assistant',
            content: `Error: ${error.message}`,
            timestamp: new Date(),
          },
        ]);
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-950">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Programmatic Tool Calling
          </h1>
          <div className="flex items-center gap-4">
            <ModelSelector
              value={modelConfig}
              onChange={setModelConfig}
            />
            <button
              onClick={() => setShowDebug(!showDebug)}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              {showDebug ? 'Hide' : 'Show'} Debug
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Main Chat Area */}
        <div className="flex flex-1 flex-col">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-6">
            <div className="mx-auto max-w-3xl space-y-4">
              {messages.length === 0 && (
                <div className="text-center text-gray-500 dark:text-gray-400">
                  <p className="text-lg font-medium">Start a conversation</p>
                  <p className="mt-2 text-sm">
                    Try: "Get 5 users, calculate their average score, and return users with score above 50"
                  </p>
                </div>
              )}
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
              {isLoading && (
                <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                  <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.3s]"></div>
                  <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.15s]"></div>
                  <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400"></div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input Area */}
          <div className="border-t border-gray-200 bg-white px-4 py-4 dark:border-gray-800 dark:bg-gray-950">
            <form onSubmit={handleSubmit} className="mx-auto max-w-3xl">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type your message..."
                  className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-400"
                  disabled={isLoading}
                />
                {isLoading ? (
                  <button
                    type="button"
                    onClick={handleStop}
                    className="rounded-lg bg-red-500 px-6 py-2 font-medium text-white hover:bg-red-600"
                  >
                    Stop
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="rounded-lg bg-blue-600 px-6 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    disabled={!input.trim()}
                  >
                    Send
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>

        {/* Debug Panel */}
        {showDebug && (
          <DebugPanel
            toolCalls={toolCalls}
            codeExecutions={codeExecutions}
            metrics={metrics}
          />
        )}
      </div>

      {/* Efficiency Metrics Bar */}
      {metrics && (
        <EfficiencyMetricsDisplay metrics={metrics} />
      )}
    </div>
  );
}


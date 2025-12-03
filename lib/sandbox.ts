/**
 * Sandbox environment for executing tool orchestration code using Vercel Sandbox
 * Provides isolated cloud execution for LLM-generated code
 * 
 * Supports both local tools (executed directly) and MCP tools (routed via bridge)
 * 
 * Includes:
 * - JavaScript syntax validation before execution
 * - Defensive runtime helpers (toArray, safeGet, safeMap, etc.)
 * - Automatic error recovery patterns
 */

import { MCPToolBridge } from './mcp-bridge';

/**
 * Validate JavaScript syntax before execution
 * Returns null if valid, error message if invalid
 */
function validateJavaScriptSyntax(code: string): string | null {
  try {
    // Use Function constructor to check syntax without executing
    // This catches most syntax errors
    new Function(code);
    return null;
  } catch (error) {
    const message = (error as Error).message;
    // Provide helpful error messages for common issues
    if (message.includes('Unexpected token')) {
      return `Syntax error: ${message}. Check for missing brackets, parentheses, or semicolons.`;
    }
    if (message.includes('Unexpected end of input')) {
      return `Syntax error: Code appears incomplete. Check for unclosed brackets, strings, or template literals.`;
    }
    if (message.includes('await is only valid')) {
      // This is actually fine in our async wrapper
      return null;
    }
    return `JavaScript syntax error: ${message}`;
  }
}

/**
 * Runtime helper code injected into sandbox
 * Provides defensive functions for handling unpredictable MCP responses
 */
const SANDBOX_HELPERS = `
// ============= DEFENSIVE HELPER FUNCTIONS =============
// These help handle unpredictable MCP response formats

/**
 * Safely convert any value to an array
 * - Array -> returns as-is
 * - null/undefined -> empty array
 * - Object with items/data/results -> extracts and returns array
 * - Single value -> wraps in array
 */
const toArray = (value) => {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value;
  
  // Handle normalized MCP responses
  if (typeof value === 'object') {
    if (Array.isArray(value.items)) return value.items;
    if (Array.isArray(value.data)) return value.data;
    if (Array.isArray(value.results)) return value.results;
    if (Array.isArray(value.content)) return value.content;
  }
  
  // Wrap single value
  return [value];
};

/**
 * Safely get nested property from object
 * safeGet(obj, 'a.b.c', defaultValue)
 */
const safeGet = (obj, path, defaultValue = undefined) => {
  if (obj === null || obj === undefined) return defaultValue;
  
  const keys = typeof path === 'string' ? path.split('.') : [path];
  let result = obj;
  
  for (const key of keys) {
    if (result === null || result === undefined) return defaultValue;
    result = result[key];
  }
  
  return result === undefined ? defaultValue : result;
};

/**
 * Safely map over any value (handles non-arrays gracefully)
 */
const safeMap = (value, fn) => {
  return toArray(value).map(fn);
};

/**
 * Safely filter any value
 */
const safeFilter = (value, fn) => {
  return toArray(value).filter(fn);
};

/**
 * Safely get first item from any value
 */
const first = (value) => {
  const arr = toArray(value);
  return arr.length > 0 ? arr[0] : null;
};

/**
 * Safely get length of any value
 */
const len = (value) => {
  return toArray(value).length;
};

/**
 * Check if MCP response was successful
 */
const isSuccess = (response) => {
  if (!response) return false;
  if (response.success === false) return false;
  if (response.error) return false;
  if (response.isError) return false;
  return true;
};

/**
 * Extract data from MCP response, handling various formats
 */
const extractData = (response) => {
  if (!response) return null;
  
  // Normalized responses have .data
  if (response.data !== undefined) return response.data;
  
  // Try common patterns
  if (response.result !== undefined) return response.result;
  if (response.results !== undefined) return response.results;
  if (response.items !== undefined) return response.items;
  if (response.content !== undefined && !response.markdown) return response.content;
  
  // Return the response itself if it's the data
  return response;
};

/**
 * Extract text/string output from MCP response
 * Useful for command execution, scraping, etc.
 * Tries multiple common property names
 */
const extractText = (response, defaultValue = '') => {
  if (!response) return defaultValue;
  if (typeof response === 'string') return response;
  
  // Try common text property names in order of preference
  const textProps = ['text', 'output', 'stdout', 'content', 'markdown', 'result', 'data', 'value'];
  for (const prop of textProps) {
    if (typeof response[prop] === 'string' && response[prop]) {
      return response[prop];
    }
  }
  
  // If items array, try to extract text from first item
  if (Array.isArray(response.items) && response.items.length > 0) {
    return extractText(response.items[0], defaultValue);
  }
  
  // Last resort: stringify if it's an object
  if (typeof response === 'object') {
    try {
      return JSON.stringify(response);
    } catch {
      return defaultValue;
    }
  }
  
  return String(response) || defaultValue;
};

/**
 * Get output from command execution response
 * Handles both success and error cases
 */
const getCommandOutput = (response) => {
  if (!response) return { success: false, output: '', error: 'No response' };
  
  const success = isSuccess(response);
  const output = extractText(response, '');
  const error = response.error || response.stderr || '';
  
  return { success, output, error };
};

/**
 * Wrap async operation with timeout
 */
const withTimeout = (promise, ms, errorMessage = 'Operation timed out') => {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error(errorMessage)), ms)
    )
  ]);
};

/**
 * Retry an async operation with exponential backoff
 */
const retry = async (fn, maxAttempts = 3, delayMs = 1000) => {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
      }
    }
  }
  throw lastError;
};

// ============= END HELPER FUNCTIONS =============
`;

// Type for Vercel Sandbox instance
interface SandboxInstance {
  runCommand: (opts: { cmd: string; args: string[] }) => Promise<{
    stdout: () => Promise<string>;
    stderr?: () => Promise<string>;
  }>;
}

// Vercel Sandbox instance (reused across executions)
let vercelSandbox: SandboxInstance | null = null;

export interface ToolCallRecord {
  toolName: string;
  args: Record<string, unknown> | unknown[];
  result?: unknown;
  error?: Error | undefined;
  isMCP?: boolean;
  executionTimeMs?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ToolFunction = (...args: any[]) => Promise<unknown>;

export class ToolOrchestrationSandbox {
  private toolCalls: ToolCallRecord[] = [];
  private toolRegistry: Map<string, ToolFunction>;
  private mcpBridge: MCPToolBridge | null;
  private mcpToolNames: string[];
  private timeout: number;

  constructor(
    toolRegistry: Map<string, ToolFunction>, 
    timeout = 30000,
    mcpBridge: MCPToolBridge | null = null
  ) {
    this.toolRegistry = toolRegistry;
    this.timeout = timeout;
    this.mcpBridge = mcpBridge;
    this.mcpToolNames = mcpBridge ? mcpBridge.getToolNames() : [];
    
    if (this.mcpToolNames.length > 0) {
      console.log(`[SANDBOX] Initialized with ${this.mcpToolNames.length} MCP tools available`);
    }
  }

  /**
   * Initialize Vercel Sandbox instance (reused across executions)
   */
  private async ensureSandbox() {
    if (vercelSandbox) {
      return vercelSandbox;
    }

    try {
      const { Sandbox } = await import('@vercel/sandbox');
      const ms = (await import('ms')).default;
      
      vercelSandbox = await Sandbox.create({
        resources: { vcpus: 2 },
        timeout: ms('5m'), // Vercel Sandbox minimum is 5 minutes
        runtime: 'node22',
      });
      return vercelSandbox;
    } catch (error) {
      const errorMsg = (error as Error).message || String(error);
      if (errorMsg.includes('VERCEL_TOKEN') || errorMsg.includes('401')) {
        throw new Error(
          'Vercel authentication required. Set VERCEL_TOKEN or run "vercel link"'
        );
      }
      throw new Error(`Failed to create Vercel Sandbox: ${errorMsg}`);
    }
  }

  /**
   * Execute orchestration code with access to registered tools (local + MCP)
   */
  async execute(code: string): Promise<{
    output: unknown;
    toolCalls: ToolCallRecord[];
  }> {
    this.toolCalls = [];
    if (this.mcpBridge) {
      this.mcpBridge.reset();
    }
    
    // Validate JavaScript syntax before execution
    const syntaxError = validateJavaScriptSyntax(code);
    if (syntaxError) {
      console.error('[SANDBOX] Syntax validation failed:', syntaxError);
      throw new Error(`Code syntax error: ${syntaxError}`);
    }
    
    // Get sandbox, with retry on stale session
    let sandbox = await this.ensureSandbox();
    let retried = false;

    // Get local tool names (non-MCP)
    const localToolNames = Array.from(this.toolRegistry.keys())
      .filter(name => !name.startsWith('mcp_'));

    // Create execution script with tool call handlers for both local and MCP tools
    const executionScript = `
const fs = require('fs').promises;

${SANDBOX_HELPERS}

// Local tool execution handler (communicates via filesystem)
const __executeLocalTool = async (toolName, args) => {
  const callId = \`\${Date.now()}-\${Math.random().toString(36).slice(2)}\`;
  const callFile = \`/tmp/tool_call_\${callId}.json\`;
  const resultFile = \`/tmp/tool_result_\${callId}.json\`;
  
  // Write tool call request
  await fs.writeFile(callFile, JSON.stringify({ toolName, args, type: 'local' }), 'utf8');
  
  // Poll for result (with timeout)
  const startTime = Date.now();
  const timeout = ${this.timeout};
  
  while (Date.now() - startTime < timeout) {
    try {
      const resultData = await fs.readFile(resultFile, 'utf8');
      await fs.unlink(callFile).catch(() => {});
      await fs.unlink(resultFile).catch(() => {});
      const result = JSON.parse(resultData);
      if (result.error) {
        throw new Error(result.error);
      }
      return result.data;
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  throw new Error(\`Local tool call timeout: \${toolName}\`);
};

// MCP tool execution handler (communicates via separate file pattern)
const __executeMCPTool = async (toolName, args) => {
  const callId = \`mcp_\${Date.now()}_\${Math.random().toString(36).slice(2)}\`;
  const callFile = \`/tmp/mcp_call_\${callId}.json\`;
  const resultFile = \`/tmp/mcp_result_\${callId}.json\`;
  
  // Write MCP tool call request
  await fs.writeFile(callFile, JSON.stringify({ toolName, args, callId, type: 'mcp' }), 'utf8');
  
  // Poll for result (with timeout)
  const startTime = Date.now();
  const timeout = ${this.timeout};
  
  while (Date.now() - startTime < timeout) {
    try {
      const resultData = await fs.readFile(resultFile, 'utf8');
      await fs.unlink(callFile).catch(() => {});
      await fs.unlink(resultFile).catch(() => {});
      const result = JSON.parse(resultData);
      if (result.error) {
        throw new Error(result.error);
      }
      return result.data;
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  throw new Error(\`MCP tool call timeout: \${toolName}\`);
};

// Create local tool functions (with result tracking)
${localToolNames.map(name => 
  `const ${name} = async (...args) => __trackResult('${name}', await __executeLocalTool('${name}', args));`
).join('\n')}

// Create MCP tool functions (with result tracking)
${this.mcpToolNames.map(name => 
  `const ${name} = async (args) => __trackResult('${name}', await __executeMCPTool('${name}', args));`
).join('\n')}

// Track all results for fallback if no explicit return
const __allResults = [];
const __trackResult = (name, result) => {
  __allResults.push({ tool: name, result, timestamp: Date.now() });
  return result;
};

// Execute user code with result tracking
(async () => {
  try {
    let result = await (async () => {
      ${code}
    })();
    
    // If result is undefined and we have tracked results, use them
    if (result === undefined && __allResults.length > 0) {
      // Return the last result or a summary of all results
      if (__allResults.length === 1) {
        result = __allResults[0].result;
      } else {
        result = {
          _autoGenerated: true,
          message: 'No explicit return - showing all tool results',
          count: __allResults.length,
          results: __allResults.map(r => r.result),
          lastResult: __allResults[__allResults.length - 1].result,
        };
      }
    }
    
    await fs.writeFile('/tmp/sandbox_output.json', JSON.stringify({ success: true, result }), 'utf8');
  } catch (error) {
    // On error, still try to return partial results
    const partialResult = __allResults.length > 0 ? {
      _partial: true,
      error: error.message,
      completedResults: __allResults.map(r => r.result),
    } : null;
    
    await fs.writeFile('/tmp/sandbox_output.json', JSON.stringify({ 
      success: false, 
      error: error.message,
      stack: error.stack,
      partialResult,
    }), 'utf8');
  }
})();
`.trim();

    const executeWithSandbox = async (): Promise<{ output: unknown; toolCalls: ToolCallRecord[] }> => {
      // Write and execute script
      const scriptPath = '/tmp/execute.js';
      await sandbox.runCommand({
        cmd: 'bash',
        args: ['-c', `cat > ${scriptPath} << 'SCRIPT_EOF'\n${executionScript}\nSCRIPT_EOF`],
      });

      // Start monitoring for both local and MCP tool calls
      const toolCallMonitor = this.monitorToolCalls(sandbox);
      
      const execResult = await sandbox.runCommand({
        cmd: 'node',
        args: [scriptPath],
      });

      // Capture any stdout/stderr from execution
      const execStdout = await execResult.stdout?.() || '';
      const execStderr = await execResult.stderr?.() || '';
      
      if (execStderr) {
        console.error('[SANDBOX] Execution stderr:', execStderr.slice(0, 500));
      }
      if (execStdout) {
        console.log('[SANDBOX] Execution stdout:', execStdout.slice(0, 200));
      }

      toolCallMonitor.stop();

      // Check if output file exists
      const checkResult = await sandbox.runCommand({
        cmd: 'bash',
        args: ['-c', 'test -f /tmp/sandbox_output.json && echo "exists" || echo "missing"'],
      });
      const fileStatus = (await checkResult.stdout()).trim();
      
      if (fileStatus !== 'exists') {
        throw new Error('Sandbox execution failed - no output produced. The code may have crashed or timed out.');
      }

      const outputResult = await sandbox.runCommand({
        cmd: 'cat',
        args: ['/tmp/sandbox_output.json'],
      });

      const outputText = (await outputResult.stdout()).trim();
      
      if (!outputText) {
        throw new Error('Sandbox execution produced empty output. The code may have failed silently.');
      }

      let outputData;
      try {
        outputData = JSON.parse(outputText);
      } catch {
        console.error('[SANDBOX] Failed to parse output:', outputText.slice(0, 500));
        throw new Error(`Sandbox output is not valid JSON: ${outputText.slice(0, 200)}...`);
      }

      if (!outputData.success) {
        throw new Error(outputData.error || 'Execution failed');
      }

      await sandbox.runCommand({
        cmd: 'rm',
        args: ['-f', scriptPath, '/tmp/sandbox_output.json'],
      }).catch(() => {});

      // Merge MCP bridge records into tool calls
      if (this.mcpBridge) {
        const mcpRecords = this.mcpBridge.getToolCallRecords();
        for (const record of mcpRecords) {
          // Only add if not already tracked
          const existing = this.toolCalls.find(
            tc => tc.toolName === record.toolName && tc.isMCP
          );
          if (!existing) {
            this.toolCalls.push({
              ...record,
              isMCP: true,
            });
          }
        }
      }

      return {
        output: outputData.result,
        toolCalls: this.toolCalls,
      };
    };

    try {
      return await executeWithSandbox();
    } catch (error) {
      const errorMsg = (error as Error).message;
      
      // Handle stale sandbox (410 Gone) - invalidate cache and retry once
      if (!retried && (errorMsg.includes('410') || errorMsg.includes('Gone') || errorMsg.includes('ECONNRESET'))) {
        console.log('[SANDBOX] Sandbox session expired, creating new one...');
        vercelSandbox = null;
        sandbox = await this.ensureSandbox();
        retried = true;
        return await executeWithSandbox();
      }
      
      throw new Error(`Vercel Sandbox execution failed: ${errorMsg}`);
    }
  }

  /**
   * Monitor Vercel sandbox for tool call requests (both local and MCP)
   */
  private monitorToolCalls(sandbox: SandboxInstance): { stop: () => void } {
    let stopped = false;

    const monitor = async () => {
      while (!stopped) {
        try {
          // Monitor for local tool calls
          const localListResult = await sandbox.runCommand({
            cmd: 'bash',
            args: ['-c', 'ls /tmp/tool_call_*.json 2>/dev/null || echo ""'],
          }).catch(() => ({ stdout: async () => '' }));

          const localFiles = (await localListResult.stdout()).trim();
          if (localFiles) {
            const filePaths = localFiles.split('\n').filter((f: string) => f);
            
            for (const filePath of filePaths) {
              await this.processLocalToolCall(sandbox, filePath);
            }
          }

          // Monitor for MCP tool calls (separate file pattern)
          if (this.mcpBridge) {
            const mcpListResult = await sandbox.runCommand({
              cmd: 'bash',
              args: ['-c', 'ls /tmp/mcp_call_*.json 2>/dev/null || echo ""'],
            }).catch(() => ({ stdout: async () => '' }));

            const mcpFiles = (await mcpListResult.stdout()).trim();
            if (mcpFiles) {
              const filePaths = mcpFiles.split('\n').filter((f: string) => f);
              
              for (const filePath of filePaths) {
                await this.processMCPToolCall(sandbox, filePath);
              }
            }
          }
        } catch {
          // Continue monitoring on error
        }
        
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    };

    monitor();

    return { stop: () => { stopped = true; } };
  }

  /**
   * Process a local tool call from the sandbox
   */
  private async processLocalToolCall(sandbox: SandboxInstance, filePath: string): Promise<void> {
    try {
      const readResult = await sandbox.runCommand({
        cmd: 'cat',
        args: [filePath],
      });
      const callData = JSON.parse(await readResult.stdout());
      
      const toolFn = this.toolRegistry.get(callData.toolName);
      if (!toolFn) {
        throw new Error(`Unknown local tool: ${callData.toolName}`);
      }

      const startTime = Date.now();
      const callRecord: ToolCallRecord = {
        toolName: callData.toolName,
        args: callData.args,
        isMCP: false,
      };
      this.toolCalls.push(callRecord);

      try {
        const result = await toolFn(...callData.args);
        callRecord.result = result;
        callRecord.executionTimeMs = Date.now() - startTime;
        
        const resultPath = filePath.replace('tool_call_', 'tool_result_');
        const resultJson = JSON.stringify({ data: result });
        await sandbox.runCommand({
          cmd: 'bash',
          args: ['-c', `cat > ${resultPath} << 'RESULT_EOF'\n${resultJson}\nRESULT_EOF`],
        });
      } catch (error) {
        callRecord.error = error as Error;
        callRecord.executionTimeMs = Date.now() - startTime;
        const resultPath = filePath.replace('tool_call_', 'tool_result_');
        await sandbox.runCommand({
          cmd: 'bash',
          args: ['-c', `echo '${JSON.stringify({ error: (error as Error).message })}' > ${resultPath}`],
        });
      }
    } catch (err) {
      console.error('[SANDBOX] Error processing local tool call:', err);
    }
  }

  /**
   * Process an MCP tool call from the sandbox via the bridge
   */
  private async processMCPToolCall(sandbox: SandboxInstance, filePath: string): Promise<void> {
    if (!this.mcpBridge) {
      console.error('[SANDBOX] MCP bridge not available');
      return;
    }

    try {
      const readResult = await sandbox.runCommand({
        cmd: 'cat',
        args: [filePath],
      });
      const callData = JSON.parse(await readResult.stdout());
      
      const startTime = Date.now();
      const callRecord: ToolCallRecord = {
        toolName: callData.toolName,
        args: callData.args,
        isMCP: true,
      };
      this.toolCalls.push(callRecord);

      console.log(`[SANDBOX] Routing MCP call: ${callData.toolName}`);

      try {
        // Route to MCP bridge
        const response = await this.mcpBridge.handleRequest({
          toolName: callData.toolName,
          args: callData.args,
          callId: callData.callId,
        });

        callRecord.executionTimeMs = Date.now() - startTime;

        if (response.error) {
          callRecord.error = new Error(response.error);
          const resultPath = filePath.replace('mcp_call_', 'mcp_result_');
          await sandbox.runCommand({
            cmd: 'bash',
            args: ['-c', `echo '${JSON.stringify({ error: response.error })}' > ${resultPath}`],
          });
        } else {
          callRecord.result = response.data;
          const resultPath = filePath.replace('mcp_call_', 'mcp_result_');
          const resultJson = JSON.stringify({ data: response.data });
          await sandbox.runCommand({
            cmd: 'bash',
            args: ['-c', `cat > ${resultPath} << 'RESULT_EOF'\n${resultJson}\nRESULT_EOF`],
          });
        }
      } catch (error) {
        callRecord.error = error as Error;
        callRecord.executionTimeMs = Date.now() - startTime;
        const resultPath = filePath.replace('mcp_call_', 'mcp_result_');
        await sandbox.runCommand({
          cmd: 'bash',
          args: ['-c', `echo '${JSON.stringify({ error: (error as Error).message })}' > ${resultPath}`],
        });
      }
    } catch (err) {
      console.error('[SANDBOX] Error processing MCP tool call:', err);
    }
  }

  /**
   * Get token count estimate for intermediate tool results only
   */
  getIntermedateTokenEstimate(): number {
    let estimate = 0;
    for (const call of this.toolCalls) {
      if (call.result) {
        const resultStr = JSON.stringify(call.result);
        estimate += Math.ceil(resultStr.length / 4);
      }
    }
    return estimate;
  }

  /**
   * Calculate comprehensive token savings from programmatic execution
   * 
   * Traditional approach for N tool calls:
   * - Each call requires full context (system + conversation history)
   * - Results accumulate in context for subsequent calls
   * - LLM must decide "what next" after each result
   * 
   * Programmatic approach:
   * - Single LLM call generates code
   * - All tool calls execute in sandbox (zero LLM tokens)
   * - Only final result returns to LLM
   */
  getComprehensiveTokenSavings(baseContextTokens: number = 7000): {
    intermediateResultTokens: number;
    roundTripContextTokens: number;
    toolCallOverheadTokens: number;
    llmDecisionTokens: number;
    totalSaved: number;
    breakdown: string;
    mcpToolCalls: number;
    localToolCalls: number;
  } {
    const numCalls = this.toolCalls.length;
    const mcpCalls = this.toolCalls.filter(tc => tc.isMCP).length;
    const localCalls = numCalls - mcpCalls;
    
    if (numCalls <= 1) {
      return {
        intermediateResultTokens: 0,
        roundTripContextTokens: 0,
        toolCallOverheadTokens: 0,
        llmDecisionTokens: 0,
        totalSaved: 0,
        breakdown: 'No savings (single tool call)',
        mcpToolCalls: mcpCalls,
        localToolCalls: localCalls,
      };
    }

    // 1. Intermediate result tokens (what we were calculating before)
    let intermediateResultTokens = 0;
    const resultSizes: number[] = [];
    for (const call of this.toolCalls) {
      if (call.result) {
        const resultStr = JSON.stringify(call.result);
        const tokens = Math.ceil(resultStr.length / 4);
        intermediateResultTokens += tokens;
        resultSizes.push(tokens);
      }
    }

    // 2. Round-trip context tokens saved
    // In traditional approach, each call after the first re-sends the full context
    // Plus accumulated results from previous calls
    let roundTripContextTokens = 0;
    let accumulatedResults = 0;
    for (let i = 1; i < numCalls; i++) {
      // Each subsequent call would include base context + all previous results
      accumulatedResults += resultSizes[i - 1] || 50; // 50 token estimate if no result
      roundTripContextTokens += baseContextTokens + accumulatedResults;
    }

    // 3. Tool call overhead (JSON structure for each tool invocation)
    // Each tool call in traditional approach: {"name": "...", "arguments": {...}}
    const toolCallOverheadTokens = numCalls * 40; // ~40 tokens per tool call structure

    // 4. LLM decision tokens (output tokens for "I'll call X next")
    // Each intermediate step, LLM outputs reasoning + tool call
    const llmDecisionTokens = (numCalls - 1) * 80; // ~80 output tokens per decision

    const totalSaved = intermediateResultTokens + roundTripContextTokens + toolCallOverheadTokens + llmDecisionTokens;

    const breakdown = [
      `${numCalls} tool calls executed in sandbox (${localCalls} local, ${mcpCalls} MCP)`,
      `├─ Intermediate results not sent to LLM: ${intermediateResultTokens.toLocaleString()} tokens`,
      `├─ Context re-sends avoided: ${roundTripContextTokens.toLocaleString()} tokens`,
      `├─ Tool call JSON overhead avoided: ${toolCallOverheadTokens.toLocaleString()} tokens`,
      `└─ LLM decision outputs avoided: ${llmDecisionTokens.toLocaleString()} tokens`,
    ].join('\n');

    return {
      intermediateResultTokens,
      roundTripContextTokens,
      toolCallOverheadTokens,
      llmDecisionTokens,
      totalSaved,
      breakdown,
      mcpToolCalls: mcpCalls,
      localToolCalls: localCalls,
    };
  }

  /**
   * Clear call history
   */
  reset() {
    this.toolCalls = [];
    if (this.mcpBridge) {
      this.mcpBridge.reset();
    }
  }

  /**
   * Cleanup sandbox resources
   */
  async cleanup() {
    // Vercel Sandbox cleans up automatically after timeout
    // Reset reference to allow new sandbox creation if needed
    vercelSandbox = null;
  }
}

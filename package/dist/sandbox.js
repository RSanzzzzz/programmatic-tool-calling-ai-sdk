/**
 * Sandbox environment for executing tool orchestration code using Vercel Sandbox
 * Provides isolated cloud execution for LLM-generated code
 *
 * Supports both local tools (executed directly) and MCP tools (routed via bridge)
 */
/**
 * Validate JavaScript syntax before execution
 */
function validateJavaScriptSyntax(code) {
    try {
        new Function(code);
        return null;
    }
    catch (error) {
        const message = error.message;
        if (message.includes('Unexpected token')) {
            return `Syntax error: ${message}. Check for missing brackets, parentheses, or semicolons.`;
        }
        if (message.includes('Unexpected end of input')) {
            return `Syntax error: Code appears incomplete. Check for unclosed brackets, strings, or template literals.`;
        }
        if (message.includes('await is only valid')) {
            return null;
        }
        return `JavaScript syntax error: ${message}`;
    }
}
/**
 * Runtime helper code injected into sandbox
 */
const SANDBOX_HELPERS = `
const toArray = (value) => {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') {
    if (Array.isArray(value.items)) return value.items;
    if (Array.isArray(value.data)) return value.data;
    if (Array.isArray(value.results)) return value.results;
    if (Array.isArray(value.content)) return value.content;
  }
  return [value];
};

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

const safeMap = (value, fn) => toArray(value).map(fn);
const safeFilter = (value, fn) => toArray(value).filter(fn);
const first = (value) => {
  const arr = toArray(value);
  return arr.length > 0 ? arr[0] : null;
};
const len = (value) => toArray(value).length;

const isSuccess = (response) => {
  if (!response) return false;
  if (response.success === false) return false;
  if (response.error) return false;
  if (response.isError) return false;
  return true;
};

const extractData = (response) => {
  if (!response) return null;
  if (response.data !== undefined) return response.data;
  if (response.result !== undefined) return response.result;
  if (response.results !== undefined) return response.results;
  if (response.items !== undefined) return response.items;
  if (response.content !== undefined && !response.markdown) return response.content;
  return response;
};

const extractText = (response, defaultValue = '') => {
  if (!response) return defaultValue;
  if (typeof response === 'string') return response;
  const textProps = ['text', 'output', 'stdout', 'content', 'markdown', 'result', 'data', 'value'];
  for (const prop of textProps) {
    if (typeof response[prop] === 'string' && response[prop]) {
      return response[prop];
    }
  }
  if (Array.isArray(response.items) && response.items.length > 0) {
    return extractText(response.items[0], defaultValue);
  }
  if (typeof response === 'object') {
    try {
      return JSON.stringify(response);
    } catch {
      return defaultValue;
    }
  }
  return String(response) || defaultValue;
};

const getCommandOutput = (response) => {
  if (!response) return { success: false, output: '', error: 'No response' };
  const success = isSuccess(response);
  const output = extractText(response, '');
  const error = response.error || response.stderr || '';
  return { success, output, error };
};
`;
let vercelSandbox = null;
export class ToolOrchestrationSandbox {
    constructor(toolRegistry, timeout = 30000, mcpBridge = null) {
        this.toolCalls = [];
        this.toolRegistry = toolRegistry;
        this.timeout = timeout;
        this.mcpBridge = mcpBridge;
        this.mcpToolNames = mcpBridge ? mcpBridge.getToolNames() : [];
    }
    async ensureSandbox() {
        if (vercelSandbox) {
            return vercelSandbox;
        }
        try {
            const { Sandbox } = await import('@vercel/sandbox');
            const ms = (await import('ms')).default;
            vercelSandbox = await Sandbox.create({
                resources: { vcpus: 2 },
                timeout: ms('5m'),
                runtime: 'node22',
            });
            return vercelSandbox;
        }
        catch (error) {
            const errorMsg = error.message || String(error);
            if (errorMsg.includes('VERCEL_TOKEN') || errorMsg.includes('401')) {
                throw new Error('Vercel authentication required. Set VERCEL_TOKEN or run "vercel link"');
            }
            throw new Error(`Failed to create Vercel Sandbox: ${errorMsg}`);
        }
    }
    async execute(code) {
        this.toolCalls = [];
        if (this.mcpBridge) {
            this.mcpBridge.reset();
        }
        const syntaxError = validateJavaScriptSyntax(code);
        if (syntaxError) {
            throw new Error(`Code syntax error: ${syntaxError}`);
        }
        let sandbox = await this.ensureSandbox();
        let retried = false;
        const localToolNames = Array.from(this.toolRegistry.keys())
            .filter(name => !name.startsWith('mcp_'));
        const executionScript = `
const fs = require('fs').promises;

${SANDBOX_HELPERS}

const __executeLocalTool = async (toolName, args) => {
  const callId = \`\${Date.now()}-\${Math.random().toString(36).slice(2)}\`;
  const callFile = \`/tmp/tool_call_\${callId}.json\`;
  const resultFile = \`/tmp/tool_result_\${callId}.json\`;
  await fs.writeFile(callFile, JSON.stringify({ toolName, args, type: 'local' }), 'utf8');
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

const __executeMCPTool = async (toolName, args) => {
  const callId = \`mcp_\${Date.now()}_\${Math.random().toString(36).slice(2)}\`;
  const callFile = \`/tmp/mcp_call_\${callId}.json\`;
  const resultFile = \`/tmp/mcp_result_\${callId}.json\`;
  await fs.writeFile(callFile, JSON.stringify({ toolName, args, callId, type: 'mcp' }), 'utf8');
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

${localToolNames.map(name => `const ${name} = async (...args) => __trackResult('${name}', await __executeLocalTool('${name}', args));`).join('\n')}

${this.mcpToolNames.map(name => `const ${name} = async (args) => __trackResult('${name}', await __executeMCPTool('${name}', args));`).join('\n')}

const __allResults = [];
const __trackResult = (name, result) => {
  __allResults.push({ tool: name, result, timestamp: Date.now() });
  return result;
};

(async () => {
  try {
    let result = await (async () => {
      ${code}
    })();
    
    if (result === undefined && __allResults.length > 0) {
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
        const executeWithSandbox = async () => {
            const scriptPath = '/tmp/execute.js';
            await sandbox.runCommand({
                cmd: 'bash',
                args: ['-c', `cat > ${scriptPath} << 'SCRIPT_EOF'\n${executionScript}\nSCRIPT_EOF`],
            });
            const toolCallMonitor = this.monitorToolCalls(sandbox);
            const execResult = await sandbox.runCommand({
                cmd: 'node',
                args: [scriptPath],
            });
            const execStdout = await execResult.stdout?.() || '';
            const execStderr = await execResult.stderr?.() || '';
            if (execStderr) {
                console.error('[SANDBOX] Execution stderr:', execStderr.slice(0, 500));
            }
            toolCallMonitor.stop();
            const checkResult = await sandbox.runCommand({
                cmd: 'bash',
                args: ['-c', 'test -f /tmp/sandbox_output.json && echo "exists" || echo "missing"'],
            });
            const fileStatus = (await checkResult.stdout()).trim();
            if (fileStatus !== 'exists') {
                throw new Error('Sandbox execution failed - no output produced.');
            }
            const outputResult = await sandbox.runCommand({
                cmd: 'cat',
                args: ['/tmp/sandbox_output.json'],
            });
            const outputText = (await outputResult.stdout()).trim();
            if (!outputText) {
                throw new Error('Sandbox execution produced empty output.');
            }
            let outputData;
            try {
                outputData = JSON.parse(outputText);
            }
            catch {
                throw new Error(`Sandbox output is not valid JSON: ${outputText.slice(0, 200)}...`);
            }
            if (!outputData.success) {
                throw new Error(outputData.error || 'Execution failed');
            }
            await sandbox.runCommand({
                cmd: 'rm',
                args: ['-f', scriptPath, '/tmp/sandbox_output.json'],
            }).catch(() => { });
            if (this.mcpBridge) {
                const mcpRecords = this.mcpBridge.getToolCallRecords();
                for (const record of mcpRecords) {
                    const existing = this.toolCalls.find(tc => tc.toolName === record.toolName && tc.isMCP);
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
        }
        catch (error) {
            const errorMsg = error.message;
            if (!retried && (errorMsg.includes('410') || errorMsg.includes('Gone') || errorMsg.includes('ECONNRESET'))) {
                vercelSandbox = null;
                sandbox = await this.ensureSandbox();
                retried = true;
                return await executeWithSandbox();
            }
            throw new Error(`Vercel Sandbox execution failed: ${errorMsg}`);
        }
    }
    monitorToolCalls(sandbox) {
        let stopped = false;
        const monitor = async () => {
            while (!stopped) {
                try {
                    const localListResult = await sandbox.runCommand({
                        cmd: 'bash',
                        args: ['-c', 'ls /tmp/tool_call_*.json 2>/dev/null || echo ""'],
                    }).catch(() => ({ stdout: async () => '' }));
                    const localFiles = (await localListResult.stdout()).trim();
                    if (localFiles) {
                        const filePaths = localFiles.split('\n').filter((f) => f);
                        for (const filePath of filePaths) {
                            await this.processLocalToolCall(sandbox, filePath);
                        }
                    }
                    if (this.mcpBridge) {
                        const mcpListResult = await sandbox.runCommand({
                            cmd: 'bash',
                            args: ['-c', 'ls /tmp/mcp_call_*.json 2>/dev/null || echo ""'],
                        }).catch(() => ({ stdout: async () => '' }));
                        const mcpFiles = (await mcpListResult.stdout()).trim();
                        if (mcpFiles) {
                            const filePaths = mcpFiles.split('\n').filter((f) => f);
                            for (const filePath of filePaths) {
                                await this.processMCPToolCall(sandbox, filePath);
                            }
                        }
                    }
                }
                catch {
                    // Continue monitoring on error
                }
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        };
        monitor();
        return { stop: () => { stopped = true; } };
    }
    async processLocalToolCall(sandbox, filePath) {
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
            const callRecord = {
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
            }
            catch (error) {
                callRecord.error = error;
                callRecord.executionTimeMs = Date.now() - startTime;
                const resultPath = filePath.replace('tool_call_', 'tool_result_');
                await sandbox.runCommand({
                    cmd: 'bash',
                    args: ['-c', `echo '${JSON.stringify({ error: error.message })}' > ${resultPath}`],
                });
            }
        }
        catch (err) {
            console.error('[SANDBOX] Error processing local tool call:', err);
        }
    }
    async processMCPToolCall(sandbox, filePath) {
        if (!this.mcpBridge) {
            return;
        }
        try {
            const readResult = await sandbox.runCommand({
                cmd: 'cat',
                args: [filePath],
            });
            const callData = JSON.parse(await readResult.stdout());
            const startTime = Date.now();
            const callRecord = {
                toolName: callData.toolName,
                args: callData.args,
                isMCP: true,
            };
            this.toolCalls.push(callRecord);
            try {
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
                }
                else {
                    callRecord.result = response.data;
                    const resultPath = filePath.replace('mcp_call_', 'mcp_result_');
                    const resultJson = JSON.stringify({ data: response.data });
                    await sandbox.runCommand({
                        cmd: 'bash',
                        args: ['-c', `cat > ${resultPath} << 'RESULT_EOF'\n${resultJson}\nRESULT_EOF`],
                    });
                }
            }
            catch (error) {
                callRecord.error = error;
                callRecord.executionTimeMs = Date.now() - startTime;
                const resultPath = filePath.replace('mcp_call_', 'mcp_result_');
                await sandbox.runCommand({
                    cmd: 'bash',
                    args: ['-c', `echo '${JSON.stringify({ error: error.message })}' > ${resultPath}`],
                });
            }
        }
        catch (err) {
            console.error('[SANDBOX] Error processing MCP tool call:', err);
        }
    }
    getIntermedateTokenEstimate() {
        let estimate = 0;
        for (const call of this.toolCalls) {
            if (call.result) {
                const resultStr = JSON.stringify(call.result);
                estimate += Math.ceil(resultStr.length / 4);
            }
        }
        return estimate;
    }
    getComprehensiveTokenSavings(baseContextTokens = 7000) {
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
        let intermediateResultTokens = 0;
        const resultSizes = [];
        for (const call of this.toolCalls) {
            if (call.result) {
                const resultStr = JSON.stringify(call.result);
                const tokens = Math.ceil(resultStr.length / 4);
                intermediateResultTokens += tokens;
                resultSizes.push(tokens);
            }
        }
        let roundTripContextTokens = 0;
        let accumulatedResults = 0;
        for (let i = 1; i < numCalls; i++) {
            accumulatedResults += resultSizes[i - 1] || 50;
            roundTripContextTokens += baseContextTokens + accumulatedResults;
        }
        const toolCallOverheadTokens = numCalls * 40;
        const llmDecisionTokens = (numCalls - 1) * 80;
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
    reset() {
        this.toolCalls = [];
        if (this.mcpBridge) {
            this.mcpBridge.reset();
        }
    }
    async cleanup() {
        vercelSandbox = null;
    }
}

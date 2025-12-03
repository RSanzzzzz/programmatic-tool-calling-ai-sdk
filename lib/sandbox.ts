/**
 * Sandbox environment for executing tool orchestration code using Vercel Sandbox
 * Provides isolated cloud execution for LLM-generated code
 */

// Vercel Sandbox instance (reused across executions)
let vercelSandbox: any = null;

export class ToolOrchestrationSandbox {
  private toolCalls: Array<{
    toolName: string;
    args: any;
    result?: any;
    error?: Error | undefined;
  }> = [];
  private toolRegistry: Map<string, Function>;
  private timeout: number;

  constructor(
    toolRegistry: Map<string, Function>, 
    timeout = 30000
  ) {
    this.toolRegistry = toolRegistry;
    this.timeout = timeout;
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
    } catch (error: any) {
      if (error.message?.includes('VERCEL_TOKEN') || error.message?.includes('401')) {
        throw new Error(
          'Vercel authentication required. Set VERCEL_TOKEN or run "vercel link"'
        );
      }
      throw new Error(`Failed to create Vercel Sandbox: ${error.message}`);
    }
  }

  /**
   * Execute orchestration code with access to registered tools
   */
  async execute(code: string): Promise<{
    output: any;
    toolCalls: Array<{ toolName: string; args: any; result?: any; error?: Error }>;
  }> {
    this.toolCalls = [];
    const sandbox = await this.ensureSandbox();

    // Create execution script with tool call handler
    // Tools communicate via filesystem for isolation
    const executionScript = `
const fs = require('fs').promises;

// Tool execution handler that communicates via filesystem
const __executeTool = async (toolName, args) => {
  const callId = \`\${Date.now()}-\${Math.random()}\`;
  const callFile = \`/tmp/tool_call_\${callId}.json\`;
  const resultFile = \`/tmp/tool_result_\${callId}.json\`;
  
  // Write tool call request
  await fs.writeFile(callFile, JSON.stringify({ toolName, args }), 'utf8');
  
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
  throw new Error('Tool call timeout');
};

// Create tool functions from registry
${Array.from(this.toolRegistry.keys()).map(name => 
  `const ${name} = async (...args) => await __executeTool('${name}', args);`
).join('\n')}

// Execute user code
(async () => {
  try {
    const result = await (async () => {
      ${code}
    })();
    await fs.writeFile('/tmp/sandbox_output.json', JSON.stringify({ success: true, result }), 'utf8');
  } catch (error) {
    await fs.writeFile('/tmp/sandbox_output.json', JSON.stringify({ 
      success: false, 
      error: error.message,
      stack: error.stack 
    }), 'utf8');
  }
})();
`.trim();

    try {
      // Write and execute script
      const scriptPath = '/tmp/execute.js';
      await sandbox.runCommand({
        cmd: 'bash',
        args: ['-c', `cat > ${scriptPath} << 'SCRIPT_EOF'\n${executionScript}\nSCRIPT_EOF`],
      });

      const toolCallMonitor = this.monitorToolCalls(sandbox);
      
      await sandbox.runCommand({
        cmd: 'node',
        args: [scriptPath],
      });

      toolCallMonitor.stop();

      const outputResult = await sandbox.runCommand({
        cmd: 'cat',
        args: ['/tmp/sandbox_output.json'],
      });

      const outputText = await outputResult.stdout();
      const outputData = JSON.parse(outputText);

      if (!outputData.success) {
        throw new Error(outputData.error || 'Execution failed');
      }

      await sandbox.runCommand({
        cmd: 'rm',
        args: ['-f', scriptPath, '/tmp/sandbox_output.json'],
      }).catch(() => {});

      return {
        output: outputData.result,
        toolCalls: this.toolCalls,
      };
    } catch (error) {
      throw new Error(`Vercel Sandbox execution failed: ${(error as Error).message}`);
    }
  }

  /**
   * Monitor Vercel sandbox for tool call requests
   */
  private monitorToolCalls(sandbox: any): { stop: () => void } {
    let stopped = false;

    const monitor = async () => {
      while (!stopped) {
        try {
          const listResult = await sandbox.runCommand({
            cmd: 'bash',
            args: ['-c', 'ls /tmp/tool_call_*.json 2>/dev/null || echo ""'],
          }).catch(() => ({ stdout: async () => '' }));

          const files = (await listResult.stdout()).trim();
          if (files) {
            const filePaths = files.split('\n').filter((f: string) => f);
            
            for (const filePath of filePaths) {
              try {
                const readResult = await sandbox.runCommand({
                  cmd: 'cat',
                  args: [filePath],
                });
                const callData = JSON.parse(await readResult.stdout());
                
                const toolFn = this.toolRegistry.get(callData.toolName);
                if (!toolFn) {
                  throw new Error(`Unknown tool: ${callData.toolName}`);
                }

                const callRecord: {
                  toolName: string;
                  args: any;
                  result?: any;
                  error?: Error;
                } = {
                  toolName: callData.toolName,
                  args: callData.args,
                };
                this.toolCalls.push(callRecord);

                try {
                  const result = await toolFn(...callData.args);
                  callRecord.result = result;
                  
                  const resultPath = filePath.replace('tool_call_', 'tool_result_');
                  await sandbox.runCommand({
                    cmd: 'bash',
                    args: ['-c', `echo '${JSON.stringify({ data: result })}' > ${resultPath}`],
                  });
                } catch (error) {
                  callRecord.error = error as Error;
                  const resultPath = filePath.replace('tool_call_', 'tool_result_');
                  await sandbox.runCommand({
                    cmd: 'bash',
                    args: ['-c', `echo '${JSON.stringify({ error: (error as Error).message })}' > ${resultPath}`],
                  });
                }
              } catch (err) {
                console.error('[SANDBOX] Error processing tool call:', err);
              }
            }
          }
        } catch (err) {
          // Continue monitoring
        }
        
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    };

    monitor();

    return { stop: () => { stopped = true; } };
  }

  /**
   * Get token count estimate for intermediate tool results
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
   * Clear call history
   */
  reset() {
    this.toolCalls = [];
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


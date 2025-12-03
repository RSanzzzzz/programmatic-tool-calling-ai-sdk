import { tool } from 'ai';
import { z } from 'zod';
import { ToolOrchestrationSandbox } from './sandbox.js';
import { createMCPBridge } from './mcp/bridge.js';
/**
 * Tool wrapper that enables programmatic tool calling using Vercel Sandbox
 * Supports both local tools and MCP tools via the MCP bridge
 */
export class ProgrammaticToolCaller {
    constructor(tools, timeout = 30000) {
        this.tools = tools;
        this.toolRegistry = new Map();
        this.mcpToolNames = [];
        this.localToolNames = [];
        this.mcpBridge = createMCPBridge(tools);
        if (this.mcpBridge) {
            this.mcpToolNames = this.mcpBridge.getToolNames();
        }
        for (const [name, toolDef] of Object.entries(tools)) {
            if (toolDef.execute) {
                if (!name.startsWith('mcp_')) {
                    this.toolRegistry.set(name, toolDef.execute);
                    this.localToolNames.push(name);
                }
            }
        }
        this.sandbox = new ToolOrchestrationSandbox(this.toolRegistry, timeout, this.mcpBridge);
    }
    getAllToolNames() {
        return [...this.localToolNames, ...this.mcpToolNames];
    }
    createCodeExecutionTool() {
        return tool({
            description: `Execute JavaScript code to orchestrate multiple tool calls efficiently. USE THIS TOOL when you need to process multiple items or make 3+ tool calls.

REQUIRED for tasks like:
- Getting multiple users (use Promise.all with getUser calls)
- Processing arrays of data
- Making multiple dependent tool calls
- Filtering/aggregating results
- Calling multiple MCP tools in parallel

Available tools in code:
- Local tools: ${this.localToolNames.join(', ') || 'none'}
- MCP tools: ${this.mcpToolNames.join(', ') || 'none'}

**DEFENSIVE HELPER FUNCTIONS (always available):**
- toArray(value) - Converts any value to array safely
- safeGet(obj, 'path.to.prop', defaultValue) - Safe nested property access
- safeMap(value, fn) - Maps over any value (converts to array first)
- safeFilter(value, fn) - Filters any value safely
- first(value) - Gets first item from any value
- len(value) - Gets length of any value safely
- isSuccess(response) - Checks if MCP response was successful
- extractData(response) - Extracts data from various MCP response formats
- extractText(response, default) - Extracts text/string output
- getCommandOutput(response) - Returns { success, output, error } for command responses

Example for getting multiple users:
const users = await Promise.all([
  getUser({ id: 'user1' }),
  getUser({ id: 'user2' }),
  getUser({ id: 'user3' })
]);
const avg = calculateAverage({ numbers: users.map(u => u.score) });
return filterByScore({ users, minScore: avg.average });

Example for MCP scraping with defensive patterns:
const results = await Promise.all([
  mcp_firecrawl_scrape({ url: 'https://example.com' }),
  mcp_firecrawl_scrape({ url: 'https://example.org' })
]);
return safeMap(results, r => ({
  success: isSuccess(r),
  content: safeGet(r, 'markdown', '').substring(0, 200),
  title: safeGet(r, 'metadata.title', 'Unknown')
}));

**CRITICAL RULES FOR MCP TOOLS:**
1. Pass parameters as a SINGLE OBJECT: mcp_tool({ param1: value1, param2: value2 })
2. ALWAYS use defensive helpers - MCP responses vary by server
3. Check isSuccess(response) before using data
4. Use safeGet() for nested properties - they may not exist
5. Use toArray() when iterating - response might not be an array`,
            inputSchema: z.object({
                code: z.string().describe('JavaScript code to execute. Can use async/await. Tools are available as functions. Return final result.'),
            }),
            execute: async ({ code }) => {
                const startTime = Date.now();
                try {
                    const { output, toolCalls } = await Promise.race([
                        this.sandbox.execute(code),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Code execution timeout after 25 seconds')), 25000)),
                    ]);
                    const executionTime = Date.now() - startTime;
                    const mcpCalls = toolCalls.filter(tc => tc.isMCP);
                    const localCalls = toolCalls.filter(tc => !tc.isMCP);
                    const tokenSavings = this.sandbox.getComprehensiveTokenSavings();
                    let serializableOutput;
                    try {
                        if (output === undefined || output === null) {
                            if (toolCalls.length > 0) {
                                const lastCall = toolCalls[toolCalls.length - 1];
                                const allResults = toolCalls.map(tc => ({
                                    tool: tc.toolName,
                                    success: !tc.error,
                                    result: tc.result,
                                }));
                                serializableOutput = toolCalls.length === 1
                                    ? (lastCall.result || { success: !lastCall.error, message: 'Tool executed' })
                                    : {
                                        message: `Executed ${toolCalls.length} tool calls`,
                                        results: allResults,
                                        lastResult: lastCall.result,
                                    };
                            }
                            else {
                                serializableOutput = { message: 'Code executed but returned no result', success: true };
                            }
                        }
                        else {
                            serializableOutput = JSON.parse(JSON.stringify(output));
                        }
                    }
                    catch (serializeError) {
                        if (typeof output === 'object' && output !== null) {
                            try {
                                const safeOutput = {};
                                for (const [key, value] of Object.entries(output)) {
                                    try {
                                        safeOutput[key] = JSON.parse(JSON.stringify(value));
                                    }
                                    catch {
                                        safeOutput[key] = String(value);
                                    }
                                }
                                serializableOutput = safeOutput;
                            }
                            catch {
                                serializableOutput = {
                                    message: 'Output contained non-serializable data',
                                    type: typeof output,
                                    keys: Object.keys(output),
                                };
                            }
                        }
                        else {
                            serializableOutput = { value: String(output), type: typeof output };
                        }
                    }
                    return {
                        result: serializableOutput,
                        metadata: {
                            toolCallCount: toolCalls.length,
                            localToolCallCount: localCalls.length,
                            mcpToolCallCount: mcpCalls.length,
                            intermediateTokensSaved: tokenSavings.intermediateResultTokens,
                            totalTokensSaved: tokenSavings.totalSaved,
                            tokenSavingsBreakdown: {
                                intermediateResults: tokenSavings.intermediateResultTokens,
                                roundTripContext: tokenSavings.roundTripContextTokens,
                                toolCallOverhead: tokenSavings.toolCallOverheadTokens,
                                llmDecisions: tokenSavings.llmDecisionTokens,
                            },
                            savingsExplanation: tokenSavings.breakdown,
                            toolsUsed: [...new Set(toolCalls.map(c => c.toolName))],
                            mcpToolsUsed: [...new Set(mcpCalls.map(c => c.toolName))],
                            localToolsUsed: [...new Set(localCalls.map(c => c.toolName))],
                            executionTimeMs: executionTime,
                            sandboxToolCalls: toolCalls.map(c => ({
                                toolName: c.toolName,
                                args: c.args,
                                result: c.result,
                                error: c.error?.message,
                                isMCP: c.isMCP,
                                executionTimeMs: c.executionTimeMs,
                            })),
                        },
                    };
                }
                catch (error) {
                    const executionTime = Date.now() - startTime;
                    throw new Error(`Code execution failed: ${error.message}`);
                }
                finally {
                    this.sandbox.reset();
                }
            },
        });
    }
    generateToolDocumentation() {
        const docs = [];
        for (const [name, toolDef] of Object.entries(this.tools)) {
            const description = toolDef.description;
            docs.push(`${name}: ${description || 'No description'}`);
            const toolDefAny = toolDef;
            if (toolDefAny.parameters) {
                try {
                    const params = toolDefAny.parameters;
                    if (params.properties) {
                        const paramDocs = Object.entries(params.properties).map(([key, prop]) => {
                            const type = prop.type || 'any';
                            const desc = prop.description || '';
                            const required = params.required?.includes(key) ? ' (required)' : '';
                            if (type === 'array' && prop.items) {
                                if (prop.items.type === 'object' && prop.items.properties) {
                                    const itemProps = Object.entries(prop.items.properties)
                                        .map(([k, v]) => `${k}: ${v.type || 'any'}`)
                                        .join(', ');
                                    return `  - ${key}: array of { ${itemProps} }${required} - ${desc}`;
                                }
                                return `  - ${key}: array of ${prop.items.type || 'any'}${required} - ${desc}`;
                            }
                            if (type === 'object' && prop.properties) {
                                const objProps = Object.entries(prop.properties)
                                    .map(([k, v]) => `${k}: ${v.type || 'any'}`)
                                    .join(', ');
                                return `  - ${key}: { ${objProps} }${required} - ${desc}`;
                            }
                            return `  - ${key}: ${type}${required} - ${desc}`;
                        });
                        docs.push(paramDocs.join('\n'));
                    }
                }
                catch (error) {
                    // Ignore schema extraction errors
                }
            }
            else if (toolDefAny.inputSchema) {
                try {
                    const def = toolDefAny.inputSchema._def;
                    if (def && typeof def.shape === 'function') {
                        const shape = def.shape();
                        const params = Object.entries(shape).map(([key, val]) => {
                            const desc = val?._def?.description || '';
                            return `  - ${key}: ${desc}`;
                        });
                        docs.push(params.join('\n'));
                    }
                }
                catch (error) {
                    // Ignore schema extraction errors
                }
            }
        }
        return docs.join('\n\n');
    }
    createEnhancedToolSet() {
        return {
            ...this.tools,
            code_execution: this.createCodeExecutionTool(),
        };
    }
    getEfficiencyMetrics() {
        return {
            intermediateTokensSaved: this.sandbox.getIntermedateTokenEstimate(),
        };
    }
    hasMCPTools() {
        return this.mcpToolNames.length > 0;
    }
    getMCPBridge() {
        return this.mcpBridge;
    }
}
/**
 * Helper to wrap tools for programmatic calling using Vercel Sandbox
 *
 * @param tools - Tools to wrap (both local and MCP tools supported)
 * @param timeout - Execution timeout in milliseconds (default: 300000)
 */
export function withProgrammaticCalling(tools, timeout = 300000) {
    const wrapper = new ProgrammaticToolCaller(tools, timeout);
    return {
        tools: wrapper.createEnhancedToolSet(),
        wrapper,
    };
}

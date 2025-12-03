/**
 * MCP Tool Bridge
 * 
 * Provides a communication bridge between the Vercel Sandbox and MCP server tools.
 * Since MCP clients require persistent connections in the main Node.js process,
 * this bridge routes MCP tool calls from the sandbox via file-based IPC.
 */

import { Tool } from 'ai';

// Re-export types
export interface MCPToolRequest {
  toolName: string;
  args: any;
  callId: string;
}

export interface MCPToolResponse {
  callId: string;
  data?: any;
  error?: string;
}

export interface MCPToolCallRecord {
  toolName: string;
  args: any;
  normalizedArgs?: any;
  result?: any;
  rawResult?: any;
  error?: Error;
  executionTimeMs?: number;
}

/**
 * Validate and normalize parameters before sending to MCP tool
 */
function normalizeParameters(toolName: string, args: any, schema?: any): { 
  normalized: any; 
  warnings: string[];
  isValid: boolean;
} {
  const warnings: string[] = [];
  let normalized = args;

  if (args === null || args === undefined) {
    normalized = {};
    warnings.push('Args was null/undefined, using empty object');
  }

  if (typeof normalized !== 'object' || Array.isArray(normalized)) {
    if (typeof normalized === 'string') {
      if (toolName.includes('scrape') || toolName.includes('crawl')) {
        normalized = { url: normalized };
        warnings.push(`Wrapped string as { url: "${normalized.url}" }`);
      } else if (toolName.includes('search')) {
        normalized = { query: normalized };
        warnings.push(`Wrapped string as { query: "${normalized.query}" }`);
      } else if (toolName.includes('extract')) {
        normalized = { urls: [normalized] };
        warnings.push(`Wrapped string as { urls: ["${normalized.urls[0]}"] }`);
      } else {
        normalized = { input: args };
        warnings.push(`Wrapped primitive as { input: ... }`);
      }
    } else if (Array.isArray(args)) {
      if (toolName.includes('extract') || toolName.includes('batch')) {
        normalized = { urls: args };
        warnings.push('Wrapped array as { urls: [...] }');
      } else {
        normalized = { items: args };
        warnings.push('Wrapped array as { items: [...] }');
      }
    }
  }

  try {
    normalized = JSON.parse(JSON.stringify(normalized));
  } catch {
    warnings.push('Failed to clone args, using original');
  }

  if (schema?.properties) {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      const prop = propSchema as any;
      const value = normalized[key];

      if (schema.required?.includes(key) && value === undefined) {
        warnings.push(`Missing required field: ${key}`);
      }

      if (value !== undefined && prop.type) {
        if (prop.type === 'array' && !Array.isArray(value)) {
          normalized[key] = [value];
          warnings.push(`Coerced ${key} to array`);
        } else if (prop.type === 'string' && typeof value !== 'string') {
          normalized[key] = String(value);
          warnings.push(`Coerced ${key} to string`);
        } else if (prop.type === 'number' && typeof value !== 'number') {
          const num = Number(value);
          if (!isNaN(num)) {
            normalized[key] = num;
            warnings.push(`Coerced ${key} to number`);
          }
        } else if (prop.type === 'boolean' && typeof value !== 'boolean') {
          normalized[key] = Boolean(value);
          warnings.push(`Coerced ${key} to boolean`);
        } else if (prop.type === 'object' && typeof value !== 'object') {
          warnings.push(`Expected object for ${key}, got ${typeof value}`);
        }

        if (prop.type === 'array' && Array.isArray(normalized[key]) && prop.items) {
          const items = normalized[key] as any[];
          const itemSchema = prop.items;
          
          if (itemSchema.type === 'object' && items.length > 0 && typeof items[0] !== 'object') {
            const wrappedItems = items.map(item => {
              if (typeof item === 'object') return item;
              
              if (itemSchema.properties) {
                const propNames = Object.keys(itemSchema.properties);
                const requiredProps = itemSchema.required || [];
                
                const stringProps = propNames.filter(p => 
                  itemSchema.properties[p].type === 'string'
                );
                
                let targetProp = stringProps.find(p => requiredProps.includes(p))
                  || stringProps.find(p => p === 'type')
                  || stringProps.find(p => p === 'value')
                  || stringProps.find(p => p === 'url')
                  || stringProps.find(p => p === 'name')
                  || stringProps[0]
                  || propNames[0];
                
                if (targetProp) {
                  return { [targetProp]: item };
                }
              }
              
              return { value: item };
            });
            
            normalized[key] = wrappedItems;
            warnings.push(`Wrapped ${key} items as objects using schema`);
          }
        }
      }
    }
  }

  return {
    normalized,
    warnings,
    isValid: warnings.filter(w => w.includes('Missing required')).length === 0,
  };
}

function normalizeResponseStructure(data: any): any {
  if (data === null || data === undefined) {
    return { success: false, data: null, items: [], output: '', text: '', error: 'No data returned' };
  }

  if (data._normalized) {
    return data;
  }

  const result: any = {
    success: data.success !== false && !data.error && !data.isError,
    _normalized: true,
    _raw: data,
  };

  let mainData = data;
  
  if (data.data !== undefined) {
    mainData = data.data;
  } else if (data.result !== undefined) {
    mainData = data.result;
  } else if (data.results !== undefined) {
    mainData = data.results;
  } else if (data.content !== undefined && !data.markdown) {
    mainData = data.content;
  }

  let textContent = '';
  if (typeof data.text === 'string') {
    textContent = data.text;
  } else if (typeof mainData === 'string') {
    textContent = mainData;
  } else if (data.stdout !== undefined) {
    textContent = data.stdout;
  } else if (data.output !== undefined) {
    textContent = String(data.output);
  }

  if (Array.isArray(mainData)) {
    result.items = mainData;
    result.data = mainData;
    result.length = mainData.length;
    result.first = mainData[0] || null;
    result.last = mainData[mainData.length - 1] || null;
  } else if (typeof mainData === 'object' && mainData !== null) {
    result.items = [mainData];
    result.data = mainData;
    result.length = 1;
    result.first = mainData;
    result.last = mainData;
    Object.assign(result, mainData);
  } else {
    result.items = [mainData];
    result.data = mainData;
    result.value = mainData;
    result.length = 1;
    if (typeof mainData === 'string') {
      textContent = mainData;
    }
  }

  result.text = textContent || result.text || '';
  result.output = textContent || result.output || '';
  result.stdout = textContent || result.stdout || '';
  result.content = textContent || result.content || result.data;
  result.value = result.value || textContent || result.data;

  if (data.error) {
    result.error = data.error;
    result.stderr = data.error;
    result.success = false;
  }

  return result;
}

function transformMCPResponse(rawResponse: any): any {
  if (!rawResponse) {
    return rawResponse;
  }

  if (rawResponse.content && Array.isArray(rawResponse.content)) {
    if (rawResponse.isError) {
      const errorText = rawResponse.content
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join('\n');
      return {
        success: false,
        error: errorText || 'MCP tool returned an error',
        _raw: rawResponse,
      };
    }

    const textContents = rawResponse.content.filter((c: any) => c.type === 'text');
    
    if (textContents.length === 0) {
      return {
        success: true,
        content: rawResponse.content,
        _raw: rawResponse,
      };
    }

    if (textContents.length === 1) {
      const textContent = textContents[0].text;
      
      try {
        const parsed = JSON.parse(textContent);
        if (typeof parsed === 'object' && parsed !== null && !('success' in parsed)) {
          parsed.success = true;
        }
        return parsed;
      } catch {
        return {
          success: true,
          text: textContent,
          _raw: rawResponse,
        };
      }
    }

    const combinedText = textContents.map((c: any) => {
      try {
        return JSON.parse(c.text);
      } catch {
        return c.text;
      }
    });

    return {
      success: true,
      results: combinedText,
      _raw: rawResponse,
    };
  }

  if (typeof rawResponse === 'object' && rawResponse !== null && !('success' in rawResponse)) {
    const withSuccess = { ...rawResponse, success: true };
    return normalizeResponseStructure(withSuccess);
  }

  return normalizeResponseStructure(rawResponse);
}

/**
 * MCP Tool Bridge for sandbox-to-MCP communication
 */
export class MCPToolBridge {
  private mcpTools: Record<string, Tool>;
  private toolSchemas: Map<string, any> = new Map();
  private learnedOutputSchemas: Map<string, any> = new Map();
  private toolCallRecords: MCPToolCallRecord[] = [];
  private failedCallSignatures: Map<string, number> = new Map();
  private parameterWarnings: Map<string, string[]> = new Map();
  private static MAX_RETRIES = 3;

  constructor(mcpTools: Record<string, Tool>) {
    this.mcpTools = {};
    for (const [name, tool] of Object.entries(mcpTools)) {
      if (name.startsWith('mcp_')) {
        this.mcpTools[name] = tool;
        const toolAny = tool as any;
        if (toolAny.parameters || toolAny.inputSchema) {
          const schema = toolAny.parameters || toolAny.inputSchema;
          this.toolSchemas.set(name, schema);
        }
      }
    }
  }
  
  private getCallSignature(toolName: string, args: any): string {
    try {
      return `${toolName}:${JSON.stringify(args)}`;
    } catch {
      return `${toolName}:${Date.now()}`;
    }
  }

  getToolNames(): string[] {
    return Object.keys(this.mcpTools);
  }

  isMCPTool(toolName: string): boolean {
    return toolName.startsWith('mcp_') && toolName in this.mcpTools;
  }

  async handleRequest(request: MCPToolRequest): Promise<MCPToolResponse> {
    const startTime = Date.now();
    
    const schema = this.toolSchemas.get(request.toolName);
    const { normalized, warnings } = normalizeParameters(
      request.toolName, 
      request.args, 
      schema
    );
    
    const callSignature = this.getCallSignature(request.toolName, normalized);
    const failCount = this.failedCallSignatures.get(callSignature) || 0;
    if (failCount >= MCPToolBridge.MAX_RETRIES) {
      return {
        callId: request.callId,
        error: `Tool ${request.toolName} failed ${failCount} times with same parameters. Check parameter format.`,
      };
    }
    
    const record: MCPToolCallRecord = {
      toolName: request.toolName,
      args: request.args,
      normalizedArgs: normalized,
    };

    try {
      const tool = this.mcpTools[request.toolName];
      if (!tool) {
        throw new Error(`Unknown MCP tool: ${request.toolName}`);
      }

      if (typeof (tool as any).execute !== 'function') {
        throw new Error(`MCP tool ${request.toolName} has no execute function`);
      }
      
      const rawResult = await (tool as any).execute(normalized);
      const transformedResult = transformMCPResponse(rawResult);
      
      record.rawResult = rawResult;
      record.result = transformedResult;
      record.executionTimeMs = Date.now() - startTime;
      this.toolCallRecords.push(record);

      this.failedCallSignatures.delete(callSignature);
      this.learnOutputSchema(request.toolName, transformedResult);

      return {
        callId: request.callId,
        data: transformedResult,
      };
    } catch (error) {
      record.error = error as Error;
      record.executionTimeMs = Date.now() - startTime;
      this.toolCallRecords.push(record);

      this.failedCallSignatures.set(callSignature, failCount + 1);

      const errorMsg = (error as Error).message;
      let enhancedError = errorMsg;
      if (errorMsg.includes('validation failed') || errorMsg.includes('Invalid input')) {
        enhancedError = `${errorMsg}. Original args: ${JSON.stringify(request.args)}, Normalized: ${JSON.stringify(normalized)}`;
      }

      return {
        callId: request.callId,
        error: enhancedError,
      };
    }
  }

  async executeBatch(requests: MCPToolRequest[]): Promise<MCPToolResponse[]> {
    return Promise.all(requests.map(req => this.handleRequest(req)));
  }

  getToolCallRecords(): MCPToolCallRecord[] {
    return [...this.toolCallRecords];
  }

  reset(): void {
    this.toolCallRecords = [];
    this.failedCallSignatures.clear();
    this.parameterWarnings.clear();
  }

  getParameterWarnings(): Map<string, string[]> {
    return new Map(this.parameterWarnings);
  }

  private learnOutputSchema(toolName: string, response: any): void {
    if (!response || response.success === false || response.error) {
      return;
    }

    const schema = this.inferSchema(response);
    const existing = this.learnedOutputSchemas.get(toolName);
    if (!existing || this.isMoreDetailed(schema, existing)) {
      this.learnedOutputSchemas.set(toolName, schema);
    }
  }

  private inferSchema(value: any, depth = 0): any {
    if (depth > 3) return { type: 'any' };
    
    if (value === null) return { type: 'null' };
    if (value === undefined) return { type: 'undefined' };
    if (Array.isArray(value)) {
      return {
        type: 'array',
        itemType: value.length > 0 ? this.inferSchema(value[0], depth + 1) : { type: 'unknown' },
        length: value.length,
      };
    }
    if (typeof value === 'object') {
      const props: Record<string, any> = {};
      for (const [k, v] of Object.entries(value)) {
        if (k !== '_raw' && k !== '_normalized') {
          props[k] = this.inferSchema(v, depth + 1);
        }
      }
      return { type: 'object', properties: props };
    }
    return { type: typeof value };
  }

  private isMoreDetailed(a: any, b: any): boolean {
    if (!b) return true;
    if (a.type === 'object' && b.type === 'object') {
      const aProps = Object.keys(a.properties || {}).length;
      const bProps = Object.keys(b.properties || {}).length;
      return aProps > bProps;
    }
    if (a.type === 'array' && b.type === 'array') {
      return (a.length || 0) > (b.length || 0);
    }
    return false;
  }

  getLearnedOutputSchemas(): Map<string, any> {
    return new Map(this.learnedOutputSchemas);
  }

  getToolOutputSchema(toolName: string): any | undefined {
    return this.learnedOutputSchemas.get(toolName);
  }

  getToolInputSchema(toolName: string): any | undefined {
    return this.toolSchemas.get(toolName);
  }

  getTokenEstimate(): number {
    let estimate = 0;
    for (const record of this.toolCallRecords) {
      if (record.result) {
        const resultStr = JSON.stringify(record.result);
        estimate += Math.ceil(resultStr.length / 4);
      }
    }
    return estimate;
  }
}

/**
 * Create an MCP bridge from a tools object
 */
export function createMCPBridge(allTools: Record<string, any>): MCPToolBridge | null {
  const mcpTools: Record<string, Tool> = {};
  
  for (const [name, tool] of Object.entries(allTools)) {
    if (name.startsWith('mcp_') && tool) {
      mcpTools[name] = tool;
    }
  }

  if (Object.keys(mcpTools).length === 0) {
    return null;
  }

  return new MCPToolBridge(mcpTools);
}


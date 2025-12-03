/**
 * MCP Tool Bridge
 * 
 * Provides a communication bridge between the Vercel Sandbox and MCP server tools.
 * Since MCP clients require persistent connections in the main Node.js process,
 * this bridge routes MCP tool calls from the sandbox via file-based IPC.
 * 
 * Architecture:
 * - Sandbox writes MCP requests to /tmp/mcp_call_*.json
 * - Bridge monitors for these files and routes to appropriate MCP client
 * - Results written back to /tmp/mcp_result_*.json
 * - Supports parallel batch execution for efficiency
 * 
 * Response Transformation:
 * MCP tools return responses in MCP protocol format:
 *   { content: [{ type: "text", text: "{...json...}" }], isError: false }
 * 
 * This bridge automatically extracts and parses the actual data so sandbox code
 * receives the usable response directly (e.g., { markdown: "...", metadata: {...} })
 * 
 * Parameter Validation:
 * LLM-generated code often passes incorrect parameter types. This bridge includes
 * generic validation and coercion to handle common mistakes gracefully.
 */

import { Tool } from 'ai';

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
  normalizedArgs?: any;  // Args after validation/coercion
  result?: any;
  rawResult?: any;  // Original MCP response before transformation
  error?: Error;
  executionTimeMs?: number;
}

/**
 * Validate and normalize parameters before sending to MCP tool
 * 
 * Common issues with LLM-generated code:
 * 1. Passing primitive when object expected
 * 2. Passing array of strings when array of objects expected
 * 3. Missing required fields
 * 4. Wrong nesting level
 * 
 * This function attempts to fix common mistakes gracefully using schema info.
 */
function normalizeParameters(toolName: string, args: any, schema?: any): { 
  normalized: any; 
  warnings: string[];
  isValid: boolean;
} {
  const warnings: string[] = [];
  let normalized = args;

  // If args is null/undefined, use empty object
  if (args === null || args === undefined) {
    normalized = {};
    warnings.push('Args was null/undefined, using empty object');
  }

  // If args is a primitive (string, number, boolean), try to wrap it
  if (typeof normalized !== 'object' || Array.isArray(normalized)) {
    // Some tools expect a single value - try common wrapping patterns
    if (typeof normalized === 'string') {
      // Common patterns: url, query, id, path
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
        // Generic: wrap as input
        normalized = { input: args };
        warnings.push(`Wrapped primitive as { input: ... }`);
      }
    } else if (Array.isArray(args)) {
      // Array passed directly - try to determine what field it belongs to
      if (toolName.includes('extract') || toolName.includes('batch')) {
        normalized = { urls: args };
        warnings.push('Wrapped array as { urls: [...] }');
      } else {
        normalized = { items: args };
        warnings.push('Wrapped array as { items: [...] }');
      }
    }
  }

  // Deep clone to avoid mutating original
  try {
    normalized = JSON.parse(JSON.stringify(normalized));
  } catch {
    warnings.push('Failed to clone args, using original');
  }

  // Validate against schema if provided
  if (schema?.properties) {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      const prop = propSchema as any;
      const value = normalized[key];

      // Check if required field is missing
      if (schema.required?.includes(key) && value === undefined) {
        warnings.push(`Missing required field: ${key}`);
      }

      // Type coercion
      if (value !== undefined && prop.type) {
        if (prop.type === 'array' && !Array.isArray(value)) {
          // Wrap single value in array
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
          // Can't coerce primitive to object meaningfully
          warnings.push(`Expected object for ${key}, got ${typeof value}`);
        }

        // Handle array item types - use schema to determine object structure
        if (prop.type === 'array' && Array.isArray(normalized[key]) && prop.items) {
          const items = normalized[key] as any[];
          const itemSchema = prop.items;
          
          if (itemSchema.type === 'object' && items.length > 0 && typeof items[0] !== 'object') {
            // Array of primitives where objects expected
            // Use schema properties to determine how to wrap
            const wrappedItems = items.map(item => {
              if (typeof item === 'object') return item;
              
              // Try to determine the right property from schema
              if (itemSchema.properties) {
                const propNames = Object.keys(itemSchema.properties);
                const requiredProps = itemSchema.required || [];
                
                // Find the most likely property for this value
                // Priority: required string props > 'type' > 'value' > 'url' > 'name' > first prop
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
              
              // Fallback: wrap as value
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

/**
 * Normalize MCP response to be more predictable for generated code
 * 
 * Goals:
 * 1. Ensure arrays are always arrays (not single objects)
 * 2. Provide consistent accessor paths with common aliases
 * 3. Handle both success and error cases uniformly
 * 4. Make output accessible via multiple common property names
 */
function normalizeResponseStructure(data: any): any {
  if (data === null || data === undefined) {
    return { success: false, data: null, items: [], output: '', text: '', error: 'No data returned' };
  }

  // If it's already normalized with our structure, return as-is
  if (data._normalized) {
    return data;
  }

  const result: any = {
    success: data.success !== false && !data.error && !data.isError,
    _normalized: true,
    _raw: data,
  };

  // Extract the main data, handling various formats
  let mainData = data;
  
  // Unwrap common wrapper structures
  if (data.data !== undefined) {
    mainData = data.data;
  } else if (data.result !== undefined) {
    mainData = data.result;
  } else if (data.results !== undefined) {
    mainData = data.results;
  } else if (data.content !== undefined && !data.markdown) {
    mainData = data.content;
  }

  // Extract text content for string-based responses (like command output)
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

  // Normalize to have consistent array accessor
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
    
    // Preserve original properties at top level for convenience
    Object.assign(result, mainData);
  } else {
    // Primitive value (string, number, etc.)
    result.items = [mainData];
    result.data = mainData;
    result.value = mainData;
    result.length = 1;
    if (typeof mainData === 'string') {
      textContent = mainData;
    }
  }

  // Add common aliases for text content (LLMs try different property names)
  // This ensures code like `response.stdout` or `response.output` works
  result.text = textContent || result.text || '';
  result.output = textContent || result.output || '';
  result.stdout = textContent || result.stdout || '';
  result.content = textContent || result.content || result.data;
  result.value = result.value || textContent || result.data;

  // Preserve error information with common aliases
  if (data.error) {
    result.error = data.error;
    result.stderr = data.error;
    result.success = false;
  }

  return result;
}

/**
 * Transform MCP protocol response to usable data format
 * 
 * MCP tools return responses like:
 * { content: [{ type: "text", text: "{\"markdown\": \"...\", ...}" }], isError: false }
 * 
 * This extracts and parses the actual data so it's usable in code:
 * { markdown: "...", metadata: {...}, success: true }
 */
function transformMCPResponse(rawResponse: any): any {
  if (!rawResponse) {
    return rawResponse;
  }

  // Check if this is an MCP protocol response format
  if (rawResponse.content && Array.isArray(rawResponse.content)) {
    // Handle isError flag
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

    // Extract text content
    const textContents = rawResponse.content.filter((c: any) => c.type === 'text');
    
    if (textContents.length === 0) {
      // No text content, return as-is but mark success
      return {
        success: true,
        content: rawResponse.content,
        _raw: rawResponse,
      };
    }

    // If there's exactly one text content, try to parse it as JSON
    if (textContents.length === 1) {
      const textContent = textContents[0].text;
      
      // Try to parse as JSON (many MCP tools return JSON stringified data)
      try {
        const parsed = JSON.parse(textContent);
        // Add success flag if not present
        if (typeof parsed === 'object' && parsed !== null && !('success' in parsed)) {
          parsed.success = true;
        }
        return parsed;
      } catch {
        // Not JSON, return as plain text with success flag
        return {
          success: true,
          text: textContent,
          _raw: rawResponse,
        };
      }
    }

    // Multiple text contents - combine them
    const combinedText = textContents.map((c: any) => {
      // Try to parse each as JSON
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

  // Check if it's already a direct response (not MCP format)
  // Add success flag if it's an object without one
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
  private toolSchemas: Map<string, any> = new Map(); // Cached input schemas for validation
  private learnedOutputSchemas: Map<string, any> = new Map(); // Learned output structures from successful calls
  private toolCallRecords: MCPToolCallRecord[] = [];
  private failedCallSignatures: Map<string, number> = new Map(); // Circuit breaker
  private parameterWarnings: Map<string, string[]> = new Map(); // Track normalization warnings
  private static MAX_RETRIES = 3; // Max retries for same tool+args combo

  constructor(mcpTools: Record<string, Tool>) {
    // Filter to only include MCP tools (prefixed with mcp_)
    this.mcpTools = {};
    for (const [name, tool] of Object.entries(mcpTools)) {
      if (name.startsWith('mcp_')) {
        this.mcpTools[name] = tool;
        // Cache the schema if available
        const toolAny = tool as any;
        if (toolAny.parameters || toolAny.inputSchema) {
          const schema = toolAny.parameters || toolAny.inputSchema;
          this.toolSchemas.set(name, schema);
          // Log schema for debugging
          console.log(`[MCP_BRIDGE] Tool ${name} schema:`, JSON.stringify(schema).slice(0, 300));
        }
      }
    }
    console.log(`[MCP_BRIDGE] Initialized with ${Object.keys(this.mcpTools).length} MCP tools`);
  }
  
  /**
   * Generate a signature for a tool call to track retries
   */
  private getCallSignature(toolName: string, args: any): string {
    try {
      return `${toolName}:${JSON.stringify(args)}`;
    } catch {
      return `${toolName}:${Date.now()}`;
    }
  }

  /**
   * Get list of available MCP tool names
   */
  getToolNames(): string[] {
    return Object.keys(this.mcpTools);
  }

  /**
   * Check if a tool is an MCP tool
   */
  isMCPTool(toolName: string): boolean {
    return toolName.startsWith('mcp_') && toolName in this.mcpTools;
  }

  /**
   * Process a single MCP tool request
   * Automatically validates/normalizes parameters and transforms responses
   * Includes circuit breaker to prevent infinite retries
   */
  async handleRequest(request: MCPToolRequest): Promise<MCPToolResponse> {
    const startTime = Date.now();
    
    // Get schema for parameter validation
    const schema = this.toolSchemas.get(request.toolName);
    
    // Normalize parameters before creating call signature (normalized params = same signature)
    const { normalized, warnings, isValid } = normalizeParameters(
      request.toolName, 
      request.args, 
      schema
    );
    
    // Log any normalization warnings
    if (warnings.length > 0) {
      console.log(`[MCP_BRIDGE] Parameter normalization for ${request.toolName}:`, warnings);
      this.parameterWarnings.set(request.toolName, warnings);
    }
    
    // Use normalized args for call signature
    const callSignature = this.getCallSignature(request.toolName, normalized);
    
    // Circuit breaker: Check if this call has failed too many times
    const failCount = this.failedCallSignatures.get(callSignature) || 0;
    if (failCount >= MCPToolBridge.MAX_RETRIES) {
      console.warn(`[MCP_BRIDGE] Circuit breaker: ${request.toolName} blocked after ${failCount} failures`);
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

      // MCP tools from @ai-sdk/mcp have execute function
      if (typeof (tool as any).execute !== 'function') {
        throw new Error(`MCP tool ${request.toolName} has no execute function`);
      }

      console.log(`[MCP_BRIDGE] Executing ${request.toolName}${warnings.length > 0 ? ' (params normalized)' : ''}`);
      
      // Use normalized parameters for execution
      const rawResult = await (tool as any).execute(normalized);
      
      // Transform MCP protocol response to usable format
      const transformedResult = transformMCPResponse(rawResult);
      
      record.rawResult = rawResult;
      record.result = transformedResult;
      record.executionTimeMs = Date.now() - startTime;
      this.toolCallRecords.push(record);

      // Success - reset failure count for this signature
      this.failedCallSignatures.delete(callSignature);

      // Learn output structure from successful calls
      this.learnOutputSchema(request.toolName, transformedResult);
      
      console.log(`[MCP_BRIDGE] ${request.toolName} completed in ${record.executionTimeMs}ms (response normalized)`);

      return {
        callId: request.callId,
        data: transformedResult,
      };
    } catch (error) {
      record.error = error as Error;
      record.executionTimeMs = Date.now() - startTime;
      this.toolCallRecords.push(record);

      // Increment failure count for circuit breaker
      this.failedCallSignatures.set(callSignature, failCount + 1);

      const errorMsg = (error as Error).message;
      console.error(`[MCP_BRIDGE] ${request.toolName} failed (attempt ${failCount + 1}/${MCPToolBridge.MAX_RETRIES}):`, errorMsg);
      
      // Provide helpful error message with parameter hints
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

  /**
   * Batch execute multiple MCP requests in parallel
   * This is the key efficiency gain - multiple MCP calls execute simultaneously
   */
  async executeBatch(requests: MCPToolRequest[]): Promise<MCPToolResponse[]> {
    console.log(`[MCP_BRIDGE] Batch executing ${requests.length} MCP tool calls`);
    const startTime = Date.now();

    const results = await Promise.all(
      requests.map(req => this.handleRequest(req))
    );

    console.log(`[MCP_BRIDGE] Batch completed in ${Date.now() - startTime}ms`);
    return results;
  }

  /**
   * Get all tool call records for metrics
   */
  getToolCallRecords(): MCPToolCallRecord[] {
    return [...this.toolCallRecords];
  }

  /**
   * Reset tool call records and circuit breaker state
   */
  reset(): void {
    this.toolCallRecords = [];
    this.failedCallSignatures.clear();
    this.parameterWarnings.clear();
  }

  /**
   * Get parameter normalization warnings (useful for debugging)
   */
  getParameterWarnings(): Map<string, string[]> {
    return new Map(this.parameterWarnings);
  }

  /**
   * Learn output schema from a successful response
   * This helps us understand what each tool returns for better handling
   */
  private learnOutputSchema(toolName: string, response: any): void {
    // Don't learn from error responses
    if (!response || response.success === false || response.error) {
      return;
    }

    // Generate a schema description from the response
    const schema = this.inferSchema(response);
    
    // Only update if we learned something new or more detailed
    const existing = this.learnedOutputSchemas.get(toolName);
    if (!existing || this.isMoreDetailed(schema, existing)) {
      this.learnedOutputSchemas.set(toolName, schema);
      console.log(`[MCP_BRIDGE] Learned output schema for ${toolName}:`, JSON.stringify(schema).slice(0, 200));
    }
  }

  /**
   * Infer a schema from a value
   */
  private inferSchema(value: any, depth = 0): any {
    if (depth > 3) return { type: 'any' }; // Prevent deep recursion
    
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
        if (k !== '_raw' && k !== '_normalized') { // Skip internal fields
          props[k] = this.inferSchema(v, depth + 1);
        }
      }
      return { type: 'object', properties: props };
    }
    return { type: typeof value };
  }

  /**
   * Check if schema A is more detailed than schema B
   */
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

  /**
   * Get learned output schemas for all tools
   */
  getLearnedOutputSchemas(): Map<string, any> {
    return new Map(this.learnedOutputSchemas);
  }

  /**
   * Get learned output schema for a specific tool
   */
  getToolOutputSchema(toolName: string): any | undefined {
    return this.learnedOutputSchemas.get(toolName);
  }

  /**
   * Get input schema for a tool
   */
  getToolInputSchema(toolName: string): any | undefined {
    return this.toolSchemas.get(toolName);
  }

  /**
   * Get token estimate for MCP tool results
   */
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
 * Automatically filters to only MCP tools
 */
export function createMCPBridge(allTools: Record<string, any>): MCPToolBridge | null {
  const mcpTools: Record<string, Tool> = {};
  
  for (const [name, tool] of Object.entries(allTools)) {
    if (name.startsWith('mcp_') && tool) {
      mcpTools[name] = tool;
    }
  }

  if (Object.keys(mcpTools).length === 0) {
    console.log('[MCP_BRIDGE] No MCP tools found, bridge not created');
    return null;
  }

  return new MCPToolBridge(mcpTools);
}


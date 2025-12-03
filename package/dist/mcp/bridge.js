/**
 * MCP Tool Bridge
 *
 * Provides a communication bridge between the Vercel Sandbox and MCP server tools.
 * Since MCP clients require persistent connections in the main Node.js process,
 * this bridge routes MCP tool calls from the sandbox via file-based IPC.
 */
/**
 * Validate and normalize parameters before sending to MCP tool
 */
function normalizeParameters(toolName, args, schema) {
    const warnings = [];
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
            }
            else if (toolName.includes('search')) {
                normalized = { query: normalized };
                warnings.push(`Wrapped string as { query: "${normalized.query}" }`);
            }
            else if (toolName.includes('extract')) {
                normalized = { urls: [normalized] };
                warnings.push(`Wrapped string as { urls: ["${normalized.urls[0]}"] }`);
            }
            else {
                normalized = { input: args };
                warnings.push(`Wrapped primitive as { input: ... }`);
            }
        }
        else if (Array.isArray(args)) {
            if (toolName.includes('extract') || toolName.includes('batch')) {
                normalized = { urls: args };
                warnings.push('Wrapped array as { urls: [...] }');
            }
            else {
                normalized = { items: args };
                warnings.push('Wrapped array as { items: [...] }');
            }
        }
    }
    try {
        normalized = JSON.parse(JSON.stringify(normalized));
    }
    catch {
        warnings.push('Failed to clone args, using original');
    }
    if (schema?.properties) {
        for (const [key, propSchema] of Object.entries(schema.properties)) {
            const prop = propSchema;
            const value = normalized[key];
            if (schema.required?.includes(key) && value === undefined) {
                warnings.push(`Missing required field: ${key}`);
            }
            if (value !== undefined && prop.type) {
                if (prop.type === 'array' && !Array.isArray(value)) {
                    normalized[key] = [value];
                    warnings.push(`Coerced ${key} to array`);
                }
                else if (prop.type === 'string' && typeof value !== 'string') {
                    normalized[key] = String(value);
                    warnings.push(`Coerced ${key} to string`);
                }
                else if (prop.type === 'number' && typeof value !== 'number') {
                    const num = Number(value);
                    if (!isNaN(num)) {
                        normalized[key] = num;
                        warnings.push(`Coerced ${key} to number`);
                    }
                }
                else if (prop.type === 'boolean' && typeof value !== 'boolean') {
                    normalized[key] = Boolean(value);
                    warnings.push(`Coerced ${key} to boolean`);
                }
                else if (prop.type === 'object' && typeof value !== 'object') {
                    warnings.push(`Expected object for ${key}, got ${typeof value}`);
                }
                if (prop.type === 'array' && Array.isArray(normalized[key]) && prop.items) {
                    const items = normalized[key];
                    const itemSchema = prop.items;
                    if (itemSchema.type === 'object' && items.length > 0 && typeof items[0] !== 'object') {
                        const wrappedItems = items.map(item => {
                            if (typeof item === 'object')
                                return item;
                            if (itemSchema.properties) {
                                const propNames = Object.keys(itemSchema.properties);
                                const requiredProps = itemSchema.required || [];
                                const stringProps = propNames.filter(p => itemSchema.properties[p].type === 'string');
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
function normalizeResponseStructure(data) {
    if (data === null || data === undefined) {
        return { success: false, data: null, items: [], output: '', text: '', error: 'No data returned' };
    }
    if (data._normalized) {
        return data;
    }
    const result = {
        success: data.success !== false && !data.error && !data.isError,
        _normalized: true,
        _raw: data,
    };
    let mainData = data;
    if (data.data !== undefined) {
        mainData = data.data;
    }
    else if (data.result !== undefined) {
        mainData = data.result;
    }
    else if (data.results !== undefined) {
        mainData = data.results;
    }
    else if (data.content !== undefined && !data.markdown) {
        mainData = data.content;
    }
    let textContent = '';
    if (typeof data.text === 'string') {
        textContent = data.text;
    }
    else if (typeof mainData === 'string') {
        textContent = mainData;
    }
    else if (data.stdout !== undefined) {
        textContent = data.stdout;
    }
    else if (data.output !== undefined) {
        textContent = String(data.output);
    }
    if (Array.isArray(mainData)) {
        result.items = mainData;
        result.data = mainData;
        result.length = mainData.length;
        result.first = mainData[0] || null;
        result.last = mainData[mainData.length - 1] || null;
    }
    else if (typeof mainData === 'object' && mainData !== null) {
        result.items = [mainData];
        result.data = mainData;
        result.length = 1;
        result.first = mainData;
        result.last = mainData;
        Object.assign(result, mainData);
    }
    else {
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
function transformMCPResponse(rawResponse) {
    if (!rawResponse) {
        return rawResponse;
    }
    if (rawResponse.content && Array.isArray(rawResponse.content)) {
        if (rawResponse.isError) {
            const errorText = rawResponse.content
                .filter((c) => c.type === 'text')
                .map((c) => c.text)
                .join('\n');
            return {
                success: false,
                error: errorText || 'MCP tool returned an error',
                _raw: rawResponse,
            };
        }
        const textContents = rawResponse.content.filter((c) => c.type === 'text');
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
            }
            catch {
                return {
                    success: true,
                    text: textContent,
                    _raw: rawResponse,
                };
            }
        }
        const combinedText = textContents.map((c) => {
            try {
                return JSON.parse(c.text);
            }
            catch {
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
    constructor(mcpTools) {
        this.toolSchemas = new Map();
        this.learnedOutputSchemas = new Map();
        this.toolCallRecords = [];
        this.failedCallSignatures = new Map();
        this.parameterWarnings = new Map();
        this.mcpTools = {};
        for (const [name, tool] of Object.entries(mcpTools)) {
            if (name.startsWith('mcp_')) {
                this.mcpTools[name] = tool;
                const toolAny = tool;
                if (toolAny.parameters || toolAny.inputSchema) {
                    const schema = toolAny.parameters || toolAny.inputSchema;
                    this.toolSchemas.set(name, schema);
                }
            }
        }
    }
    getCallSignature(toolName, args) {
        try {
            return `${toolName}:${JSON.stringify(args)}`;
        }
        catch {
            return `${toolName}:${Date.now()}`;
        }
    }
    getToolNames() {
        return Object.keys(this.mcpTools);
    }
    isMCPTool(toolName) {
        return toolName.startsWith('mcp_') && toolName in this.mcpTools;
    }
    async handleRequest(request) {
        const startTime = Date.now();
        const schema = this.toolSchemas.get(request.toolName);
        const { normalized, warnings } = normalizeParameters(request.toolName, request.args, schema);
        const callSignature = this.getCallSignature(request.toolName, normalized);
        const failCount = this.failedCallSignatures.get(callSignature) || 0;
        if (failCount >= MCPToolBridge.MAX_RETRIES) {
            return {
                callId: request.callId,
                error: `Tool ${request.toolName} failed ${failCount} times with same parameters. Check parameter format.`,
            };
        }
        const record = {
            toolName: request.toolName,
            args: request.args,
            normalizedArgs: normalized,
        };
        try {
            const tool = this.mcpTools[request.toolName];
            if (!tool) {
                throw new Error(`Unknown MCP tool: ${request.toolName}`);
            }
            if (typeof tool.execute !== 'function') {
                throw new Error(`MCP tool ${request.toolName} has no execute function`);
            }
            const rawResult = await tool.execute(normalized);
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
        }
        catch (error) {
            record.error = error;
            record.executionTimeMs = Date.now() - startTime;
            this.toolCallRecords.push(record);
            this.failedCallSignatures.set(callSignature, failCount + 1);
            const errorMsg = error.message;
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
    async executeBatch(requests) {
        return Promise.all(requests.map(req => this.handleRequest(req)));
    }
    getToolCallRecords() {
        return [...this.toolCallRecords];
    }
    reset() {
        this.toolCallRecords = [];
        this.failedCallSignatures.clear();
        this.parameterWarnings.clear();
    }
    getParameterWarnings() {
        return new Map(this.parameterWarnings);
    }
    learnOutputSchema(toolName, response) {
        if (!response || response.success === false || response.error) {
            return;
        }
        const schema = this.inferSchema(response);
        const existing = this.learnedOutputSchemas.get(toolName);
        if (!existing || this.isMoreDetailed(schema, existing)) {
            this.learnedOutputSchemas.set(toolName, schema);
        }
    }
    inferSchema(value, depth = 0) {
        if (depth > 3)
            return { type: 'any' };
        if (value === null)
            return { type: 'null' };
        if (value === undefined)
            return { type: 'undefined' };
        if (Array.isArray(value)) {
            return {
                type: 'array',
                itemType: value.length > 0 ? this.inferSchema(value[0], depth + 1) : { type: 'unknown' },
                length: value.length,
            };
        }
        if (typeof value === 'object') {
            const props = {};
            for (const [k, v] of Object.entries(value)) {
                if (k !== '_raw' && k !== '_normalized') {
                    props[k] = this.inferSchema(v, depth + 1);
                }
            }
            return { type: 'object', properties: props };
        }
        return { type: typeof value };
    }
    isMoreDetailed(a, b) {
        if (!b)
            return true;
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
    getLearnedOutputSchemas() {
        return new Map(this.learnedOutputSchemas);
    }
    getToolOutputSchema(toolName) {
        return this.learnedOutputSchemas.get(toolName);
    }
    getToolInputSchema(toolName) {
        return this.toolSchemas.get(toolName);
    }
    getTokenEstimate() {
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
MCPToolBridge.MAX_RETRIES = 3;
/**
 * Create an MCP bridge from a tools object
 */
export function createMCPBridge(allTools) {
    const mcpTools = {};
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

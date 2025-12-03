/**
 * @vercel-ai/programmatic-tools
 *
 * Programmatic tool execution for Vercel AI SDK with MCP integration
 * and efficiency optimizations.
 */
export { withProgrammaticCalling, ProgrammaticToolCaller } from './tool-wrapper.js';
export { ContextManager, withContextManagement } from './context-manager.js';
export { ToolOrchestrationSandbox } from './sandbox.js';
// Re-export MCP utilities (optional module)
export * from './mcp/index.js';

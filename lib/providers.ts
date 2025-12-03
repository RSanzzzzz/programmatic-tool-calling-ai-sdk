import { LanguageModel, gateway } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';

export type Provider = 'anthropic' | 'openai' | 'gateway';
export type AnthropicModel = 'claude-sonnet-4-5' | 'claude-opus-4-20250514' | 'claude-3-5-sonnet-20241022';
export type OpenAIModel = 'gpt-4o' | 'gpt-4-turbo' | 'gpt-3.5-turbo';

export interface ModelConfig {
  provider: Provider;
  model: string;
}

export interface GatewayModel {
  id: string;
  name: string;
  description?: string;
  provider: string;
  pricing?: {
    input: number;
    output: number;
  };
}

/**
 * Get AI model instance based on provider and model name
 */
export function getModel(config: ModelConfig): LanguageModel {
  switch (config.provider) {
    case 'anthropic':
      return anthropic(config.model as AnthropicModel);
    case 'openai':
      return openai(config.model as OpenAIModel);
    case 'gateway':
      // Gateway models are in format 'provider/model-name'
      return gateway(config.model);
    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }
}

/**
 * Get available models for a provider
 * For gateway, this returns an empty array - models should be fetched via API
 */
export function getAvailableModels(provider: Provider): string[] {
  switch (provider) {
    case 'anthropic':
      return ['claude-sonnet-4-5', 'claude-opus-4-20250514', 'claude-3-5-sonnet-20241022'];
    case 'openai':
      return ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'];
    case 'gateway':
      // Gateway models are fetched dynamically via API
      return [];
    default:
      return [];
  }
}

/**
 * Get default model for a provider
 */
export function getDefaultModel(provider: Provider): string {
  switch (provider) {
    case 'anthropic':
      return 'claude-sonnet-4-5';
    case 'openai':
      return 'gpt-4o';
    case 'gateway':
      return 'anthropic/claude-sonnet-4';
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}


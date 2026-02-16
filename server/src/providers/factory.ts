import type { ConnectionMode, LLMProvider as LLMProviderType } from '../types/protocol.js';
import type { LLMProvider } from './base.js';
import { DeepSeekProvider } from './deepseek.js';
import { OpenClawAdapter } from '../adapters/openclaw.js';

interface ProviderOptions {
  provider?: LLMProviderType;
  apiKey?: string;
  openclawUrl?: string;
  openclawToken?: string;
}

/**
 * Create an LLM provider based on connection mode.
 */
export function createProvider(mode: ConnectionMode, options: ProviderOptions): LLMProvider | null {
  switch (mode) {
    case 'builtin': {
      const apiKey = process.env.DEEPSEEK_API_KEY;
      if (!apiKey) {
        throw new Error('DEEPSEEK_API_KEY not configured on server');
      }
      return new DeepSeekProvider(apiKey, process.env.DEEPSEEK_BASE_URL);
    }

    case 'byok': {
      if (!options.apiKey) {
        throw new Error('API key required for BYOK mode');
      }
      switch (options.provider) {
        case 'deepseek':
          return new DeepSeekProvider(options.apiKey);
        // Future: case 'openai': return new OpenAIProvider(options.apiKey);
        // Future: case 'anthropic': return new AnthropicProvider(options.apiKey);
        default:
          return new DeepSeekProvider(options.apiKey);
      }
    }

    case 'openclaw': {
      if (!options.openclawUrl) {
        throw new Error('OpenClaw URL required for openclaw mode');
      }
      return new OpenClawAdapter(options.openclawUrl, options.openclawToken);
    }

    default:
      throw new Error(`Unknown connection mode: ${mode}`);
  }
}

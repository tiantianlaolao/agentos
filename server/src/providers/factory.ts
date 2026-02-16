import type { ConnectionMode, LLMProvider as LLMProviderType } from '../types/protocol.js';
import type { LLMProvider } from './base.js';
import { DeepSeekProvider } from './deepseek.js';

interface ProviderOptions {
  provider?: LLMProviderType;
  apiKey?: string;
  openclawUrl?: string;
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
      // TODO: Implement OpenClaw adapter in Step 1
      // For now, return null — OpenClaw mode will proxy directly
      console.log(`[Provider] OpenClaw mode, URL: ${options.openclawUrl}`);
      return null;
    }

    default:
      throw new Error(`Unknown connection mode: ${mode}`);
  }
}

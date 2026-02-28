import type { ConnectionMode, LLMProvider as LLMProviderType } from '../types/protocol.js';
import type { LLMProvider } from './base.js';
import type { AgentAdapter } from '../adapters/base.js';
import { DeepSeekProvider } from './deepseek.js';
import { OpenAIProvider } from './openai.js';
import { AnthropicProvider } from './anthropic.js';
import { MoonshotProvider } from './moonshot.js';
import { OpenClawAdapter } from '../adapters/openclaw.js';
import { AgUiAdapter } from '../adapters/ag-ui.js';
import { DesktopAdapter } from '../adapters/desktop.js';

interface ProviderOptions {
  provider?: LLMProviderType;
  apiKey?: string;
  model?: string;
  openclawUrl?: string;
  openclawToken?: string;
  copawUrl?: string;
  copawToken?: string;
  // Unified agent mode fields
  agentUrl?: string;
  agentToken?: string;
  agentProtocol?: string;
}

/**
 * Create an LLM provider or AgentAdapter based on connection mode.
 */
export function createProvider(mode: ConnectionMode, options: ProviderOptions): LLMProvider | AgentAdapter | null {
  switch (mode) {
    case 'builtin': {
      // Route by model key (short name from mobile) or full model ID prefix
      const model = options.model;

      if (model === 'moonshot' || model?.startsWith('moonshot-')) {
        const apiKey = process.env.MOONSHOT_API_KEY;
        if (!apiKey) throw new Error('MOONSHOT_API_KEY not configured on server');
        return new MoonshotProvider(apiKey);
      }

      if (model === 'anthropic' || model?.startsWith('claude-')) {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured on server');
        return new AnthropicProvider(apiKey);
      }

      if (model === 'openai' || model?.startsWith('gpt-') || model?.startsWith('o1') || model?.startsWith('o3') || model?.startsWith('o4')) {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) throw new Error('OPENAI_API_KEY not configured on server');
        return new OpenAIProvider(apiKey);
      }

      // Default: DeepSeek
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
        case 'openai':
          return new OpenAIProvider(options.apiKey);
        case 'anthropic':
          return new AnthropicProvider(options.apiKey);
        case 'moonshot':
          return new MoonshotProvider(options.apiKey);
        case 'deepseek':
        default:
          return new DeepSeekProvider(options.apiKey);
      }
    }

    // Unified agent mode: use agentProtocol to pick adapter
    case 'agent': {
      const protocol = options.agentProtocol || 'openclaw-ws';
      if (protocol === 'openclaw-ws') {
        const url = options.agentUrl || process.env.OPENCLAW_URL || 'ws://127.0.0.1:18789';
        const token = options.agentToken || process.env.OPENCLAW_TOKEN || '';
        return new OpenClawAdapter(url, token);
      }
      if (protocol === 'ag-ui') {
        const url = options.agentUrl || process.env.COPAW_URL || 'http://127.0.0.1:8088/agent';
        const token = options.agentToken || '';
        return new AgUiAdapter(url, token);
      }
      throw new Error(`Unknown agent protocol: ${protocol}`);
    }

    // Legacy aliases — backward compatible with old clients
    case 'openclaw': {
      const url = options.openclawUrl || process.env.OPENCLAW_URL || 'ws://127.0.0.1:18789';
      const token = options.openclawToken || process.env.OPENCLAW_TOKEN || '';
      return new OpenClawAdapter(url, token);
    }

    case 'copaw': {
      const url = options.copawUrl || process.env.COPAW_URL || 'http://127.0.0.1:8088/agent';
      const token = options.copawToken || process.env.COPAW_TOKEN || '';
      return new AgUiAdapter(url, token);
    }

    case 'desktop': {
      return new DesktopAdapter();
    }

    default:
      throw new Error(`Unknown connection mode: ${mode}`);
  }
}

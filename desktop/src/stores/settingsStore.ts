import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AgentMode } from '../types/index.ts';

export const OPENCLAW_LOCAL_GATEWAY = 'ws://localhost:18789';

export type LLMProvider = 'deepseek' | 'openai' | 'anthropic' | 'gemini' | 'moonshot' | 'qwen' | 'zhipu' | 'openrouter';

type BuiltinSubMode = 'free' | 'byok';

/**
 * Known external agent definitions.
 * Each agent has a fixed protocol and UI configuration.
 */
export interface AgentDefinition {
  id: string;
  name: string;
  icon: string;
  transport: 'ws' | 'http';
  protocol: string;  // 'openclaw-ws' | 'ag-ui' | 'openai-compat'
  urlPlaceholder: string;
  urlHint: string;
  defaultPort?: number;
  tokenRequired?: boolean;
  deploy?: {
    runtime: 'node' | 'python';
  };
}

export const KNOWN_AGENTS: AgentDefinition[] = [
  {
    id: 'openclaw',
    name: 'OpenClaw',
    icon: '🐾',
    transport: 'ws',
    protocol: 'openclaw-ws',
    urlPlaceholder: 'ws://your-server:18789',
    urlHint: 'WebSocket URL',
    defaultPort: 18789,
    tokenRequired: true,
    deploy: { runtime: 'node' },
  },
  {
    id: 'copaw',
    name: 'CoPaw',
    icon: '🤖',
    transport: 'http',
    protocol: 'ag-ui',
    urlPlaceholder: 'http://your-server:8088/agent',
    urlHint: 'HTTP URL',
    defaultPort: 8088,
    tokenRequired: false,
    deploy: { runtime: 'python' },
  },
  {
    id: 'custom',
    name: '其他 Agent',
    icon: '🔌',
    transport: 'http',
    protocol: 'openai-compat',
    urlPlaceholder: 'http://your-server:8080',
    urlHint: 'HTTP URL',
    tokenRequired: false,
  },
];

interface SettingsState {
  // Connection
  mode: AgentMode;
  builtinSubMode: BuiltinSubMode;
  provider: LLMProvider;
  apiKey: string;
  serverUrl: string;
  selectedModel: string;

  // === Unified Agent Mode ===
  agentSubMode: 'direct' | 'deploy';
  agentId: string;          // 'openclaw' | 'copaw' | 'custom'
  agentUrl: string;
  agentToken: string;
  agentBridgeEnabled: boolean;

  // Deploy mode
  deployTemplateId: string;  // 'openclaw' | 'copaw'
  localAgentInstalled: boolean;
  localAgentPort: number;
  localAgentAutoStart: boolean;
  localAgentAutoBridge: boolean;

  // Deploy model mode (cross-template)
  deployModelMode: 'default' | 'custom';
  deployProvider: LLMProvider;
  deployApiKey: string;
  deployModel: string;

  // OpenClaw hosted (legacy, kept for hosted users)
  hostedActivated: boolean;
  hostedQuotaUsed: number;
  hostedQuotaTotal: number;
  hostedInstanceStatus: string;

  // Local OpenClaw deploy-specific (kept for Tauri command compat)
  localOpenclawToken: string;

  // App
  locale: 'zh' | 'en';

  // Lifecycle
  settingsLoaded: boolean;

  // === Legacy fields (kept in state for migration, not persisted in v11) ===
  openclawUrl: string;
  openclawToken: string;
  openclawSubMode: 'hosted' | 'selfhosted' | 'deploy';
  deployType: 'cloud' | 'local';
  selfhostedType: 'remote' | 'local';
  copawUrl: string;
  copawToken: string;
  copawSubMode: 'hosted' | 'selfhosted' | 'deploy';
  copawDeployType: 'cloud' | 'local';
  copawSelfhostedType: 'remote' | 'local';
  localOpenclawInstalled: boolean;
  localOpenclawPort: number;
  localOpenclawAutoStart: boolean;
  localOpenclawAutoBridge: boolean;
  localOpenclawProvider: LLMProvider;
  localOpenclawApiKey: string;
  localOpenclawModel: string;
  bridgeEnabled: boolean;
  localCopawInstalled: boolean;
  localCopawPort: number;
  localCopawAutoStart: boolean;
  localCopawAutoBridge: boolean;
  copawBridgeEnabled: boolean;
  copawDeployModelMode: 'default' | 'custom';
  copawDeployProvider: LLMProvider;
  copawDeployApiKey: string;
  copawDeployModel: string;

  // Actions
  setMode: (mode: AgentMode) => void;
  setBuiltinSubMode: (subMode: BuiltinSubMode) => void;
  setProvider: (provider: LLMProvider) => void;
  setApiKey: (apiKey: string) => void;
  setServerUrl: (url: string) => void;
  setSelectedModel: (model: string) => void;

  // Unified agent actions
  setAgentSubMode: (subMode: 'direct' | 'deploy') => void;
  setAgentId: (id: string) => void;
  setAgentUrl: (url: string) => void;
  setAgentToken: (token: string) => void;
  setAgentBridgeEnabled: (enabled: boolean) => void;
  setDeployTemplateId: (id: string) => void;
  setLocalAgentInstalled: (v: boolean) => void;
  setLocalAgentPort: (port: number) => void;
  setLocalAgentAutoStart: (v: boolean) => void;
  setLocalAgentAutoBridge: (v: boolean) => void;
  setDeployModelMode: (mode: 'default' | 'custom') => void;
  setDeployProvider: (provider: LLMProvider) => void;
  setDeployApiKey: (key: string) => void;
  setDeployModel: (model: string) => void;
  setHostedActivated: (v: boolean) => void;
  setHostedQuota: (used: number, total: number) => void;
  setHostedInstanceStatus: (status: string) => void;
  setLocalOpenclawToken: (token: string) => void;

  // Legacy setters (for compat with existing components)
  setOpenclawUrl: (url: string) => void;
  setOpenclawToken: (token: string) => void;
  setOpenclawSubMode: (mode: 'hosted' | 'selfhosted' | 'deploy') => void;
  setDeployType: (type: 'cloud' | 'local') => void;
  setSelfhostedType: (type: 'remote' | 'local') => void;
  setCopawUrl: (url: string) => void;
  setCopawToken: (token: string) => void;
  setCopawSubMode: (mode: 'hosted' | 'selfhosted' | 'deploy') => void;
  setCopawDeployType: (type: 'cloud' | 'local') => void;
  setCopawSelfhostedType: (type: 'remote' | 'local') => void;
  setCopawDeployModelMode: (mode: 'default' | 'custom') => void;
  setCopawDeployProvider: (provider: LLMProvider) => void;
  setCopawDeployApiKey: (key: string) => void;
  setCopawDeployModel: (model: string) => void;
  setBridgeEnabled: (enabled: boolean) => void;
  setLocalCopawInstalled: (v: boolean) => void;
  setLocalCopawPort: (port: number) => void;
  setLocalCopawAutoStart: (v: boolean) => void;
  setLocalCopawAutoBridge: (v: boolean) => void;
  setCopawBridgeEnabled: (enabled: boolean) => void;
  setLocalOpenclawInstalled: (v: boolean) => void;
  setLocalOpenclawPort: (port: number) => void;
  setLocalOpenclawProvider: (provider: LLMProvider) => void;
  setLocalOpenclawApiKey: (key: string) => void;
  setLocalOpenclawModel: (model: string) => void;
  setLocalOpenclawAutoStart: (v: boolean) => void;
  setLocalOpenclawAutoBridge: (v: boolean) => void;

  switchUser: (userId: string) => void;
  setLocale: (locale: 'zh' | 'en') => void;
  loadSettings: () => void;
  saveSettings: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      mode: 'builtin',
      builtinSubMode: 'free',
      provider: 'deepseek',
      apiKey: '',
      serverUrl: 'ws://43.155.104.45:3100/ws',
      selectedModel: 'deepseek',

      // Unified agent
      agentSubMode: 'direct',
      agentId: 'openclaw',
      agentUrl: '',
      agentToken: '',
      agentBridgeEnabled: false,
      deployTemplateId: 'openclaw',
      localAgentInstalled: false,
      localAgentPort: 18789,
      localAgentAutoStart: true,
      localAgentAutoBridge: true,
      deployModelMode: 'default',
      deployProvider: 'deepseek',
      deployApiKey: '',
      deployModel: '',
      hostedActivated: false,
      hostedQuotaUsed: 0,
      hostedQuotaTotal: 0,
      hostedInstanceStatus: '',
      localOpenclawToken: '',

      // Legacy defaults
      openclawUrl: '',
      openclawToken: '',
      openclawSubMode: 'deploy',
      deployType: 'cloud',
      selfhostedType: 'remote',
      copawUrl: '',
      copawToken: '',
      copawSubMode: 'deploy',
      copawDeployType: 'local',
      copawSelfhostedType: 'remote',
      localOpenclawInstalled: false,
      localOpenclawPort: 18789,
      localOpenclawAutoStart: true,
      localOpenclawAutoBridge: true,
      localOpenclawProvider: 'deepseek',
      localOpenclawApiKey: '',
      localOpenclawModel: '',
      bridgeEnabled: false,
      localCopawInstalled: false,
      localCopawPort: 8088,
      localCopawAutoStart: true,
      localCopawAutoBridge: true,
      copawBridgeEnabled: false,
      copawDeployModelMode: 'default',
      copawDeployProvider: 'deepseek',
      copawDeployApiKey: '',
      copawDeployModel: '',

      locale: 'zh',
      settingsLoaded: false,

      // Unified agent setters
      setMode: (mode) => set({ mode }),
      setBuiltinSubMode: (subMode) => set({ builtinSubMode: subMode }),
      setProvider: (provider) => set({ provider }),
      setApiKey: (apiKey) => set({ apiKey }),
      setServerUrl: (url) => set({ serverUrl: url }),
      setSelectedModel: (model) => set({ selectedModel: model }),
      setAgentSubMode: (subMode) => set({ agentSubMode: subMode }),
      setAgentId: (id) => set({ agentId: id }),
      setAgentUrl: (url) => set({ agentUrl: url }),
      setAgentToken: (token) => set({ agentToken: token }),
      setAgentBridgeEnabled: (enabled) => set({ agentBridgeEnabled: enabled }),
      setDeployTemplateId: (id) => set({ deployTemplateId: id }),
      setLocalAgentInstalled: (v) => set({ localAgentInstalled: v }),
      setLocalAgentPort: (port) => set({ localAgentPort: port }),
      setLocalAgentAutoStart: (v) => set({ localAgentAutoStart: v }),
      setLocalAgentAutoBridge: (v) => set({ localAgentAutoBridge: v }),
      setDeployModelMode: (mode) => set({ deployModelMode: mode }),
      setDeployProvider: (provider) => set({ deployProvider: provider }),
      setDeployApiKey: (key) => set({ deployApiKey: key }),
      setDeployModel: (model) => set({ deployModel: model }),
      setHostedActivated: (v) => set({ hostedActivated: v }),
      setHostedQuota: (used, total) => set({ hostedQuotaUsed: used, hostedQuotaTotal: total }),
      setHostedInstanceStatus: (status) => set({ hostedInstanceStatus: status }),
      setLocalOpenclawToken: (token) => set({ localOpenclawToken: token }),

      // Legacy setters (compat)
      setOpenclawUrl: (url) => set({ openclawUrl: url }),
      setOpenclawToken: (token) => set({ openclawToken: token }),
      setOpenclawSubMode: (mode) => set({ openclawSubMode: mode }),
      setDeployType: (type) => set({ deployType: type }),
      setSelfhostedType: (type) => set({ selfhostedType: type }),
      setCopawUrl: (url) => set({ copawUrl: url }),
      setCopawToken: (token) => set({ copawToken: token }),
      setCopawSubMode: (mode) => set({ copawSubMode: mode }),
      setCopawDeployType: (type) => set({ copawDeployType: type }),
      setCopawSelfhostedType: (type) => set({ copawSelfhostedType: type }),
      setCopawDeployModelMode: (mode) => set({ copawDeployModelMode: mode }),
      setCopawDeployProvider: (provider) => set({ copawDeployProvider: provider }),
      setCopawDeployApiKey: (key) => set({ copawDeployApiKey: key }),
      setCopawDeployModel: (model) => set({ copawDeployModel: model }),
      setBridgeEnabled: (enabled) => set({ bridgeEnabled: enabled }),
      setLocalCopawInstalled: (v) => set({ localCopawInstalled: v }),
      setLocalCopawPort: (port) => set({ localCopawPort: port }),
      setLocalCopawAutoStart: (v) => set({ localCopawAutoStart: v }),
      setLocalCopawAutoBridge: (v) => set({ localCopawAutoBridge: v }),
      setCopawBridgeEnabled: (enabled) => set({ copawBridgeEnabled: enabled }),
      setLocalOpenclawInstalled: (v) => set({ localOpenclawInstalled: v }),
      setLocalOpenclawPort: (port) => set({ localOpenclawPort: port }),
      setLocalOpenclawProvider: (provider) => set({ localOpenclawProvider: provider }),
      setLocalOpenclawApiKey: (key) => set({ localOpenclawApiKey: key }),
      setLocalOpenclawModel: (model) => set({ localOpenclawModel: model }),
      setLocalOpenclawAutoStart: (v) => set({ localOpenclawAutoStart: v }),
      setLocalOpenclawAutoBridge: (v) => set({ localOpenclawAutoBridge: v }),

      switchUser: (userId) => {
        const newKey = userId ? `agentos-settings-${userId}` : 'agentos-settings';
        const oldKey = 'agentos-settings';

        const raw = localStorage.getItem(newKey);
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            const data = parsed.state || parsed;
            set({ ...data, settingsLoaded: true });
          } catch { /* ignore */ }
        } else if (userId) {
          const oldRaw = localStorage.getItem(oldKey);
          if (oldRaw) {
            localStorage.setItem(newKey, oldRaw);
            localStorage.removeItem(oldKey);
          }
        }

        const persistApi = (useSettingsStore as unknown as { persist: { setOptions: (opts: { name: string }) => void; rehydrate: () => Promise<void> } }).persist;
        persistApi.setOptions({ name: newKey });
      },
      setLocale: (locale) => set({ locale }),
      loadSettings: () => {
        set({ settingsLoaded: true });
      },
      saveSettings: () => {
        void get();
      },
    }),
    {
      name: 'agentos-settings',
      partialize: (state) => ({
        mode: state.mode,
        builtinSubMode: state.builtinSubMode,
        provider: state.provider,
        apiKey: state.apiKey,
        serverUrl: state.serverUrl,
        selectedModel: state.selectedModel,
        // Unified agent fields
        agentSubMode: state.agentSubMode,
        agentId: state.agentId,
        agentUrl: state.agentUrl,
        agentToken: state.agentToken,
        agentBridgeEnabled: state.agentBridgeEnabled,
        deployTemplateId: state.deployTemplateId,
        localAgentInstalled: state.localAgentInstalled,
        localAgentPort: state.localAgentPort,
        localAgentAutoStart: state.localAgentAutoStart,
        localAgentAutoBridge: state.localAgentAutoBridge,
        deployModelMode: state.deployModelMode,
        deployProvider: state.deployProvider,
        deployApiKey: state.deployApiKey,
        deployModel: state.deployModel,
        hostedActivated: state.hostedActivated,
        hostedQuotaUsed: state.hostedQuotaUsed,
        hostedQuotaTotal: state.hostedQuotaTotal,
        hostedInstanceStatus: state.hostedInstanceStatus,
        localOpenclawToken: state.localOpenclawToken,
        locale: state.locale,
        // Legacy fields still persisted for rollback safety
        openclawUrl: state.openclawUrl,
        openclawToken: state.openclawToken,
        copawUrl: state.copawUrl,
        copawToken: state.copawToken,
        bridgeEnabled: state.bridgeEnabled,
        copawBridgeEnabled: state.copawBridgeEnabled,
        localOpenclawInstalled: state.localOpenclawInstalled,
        localOpenclawPort: state.localOpenclawPort,
        localOpenclawAutoStart: state.localOpenclawAutoStart,
        localOpenclawAutoBridge: state.localOpenclawAutoBridge,
        localCopawInstalled: state.localCopawInstalled,
        localCopawPort: state.localCopawPort,
        localCopawAutoStart: state.localCopawAutoStart,
        localCopawAutoBridge: state.localCopawAutoBridge,
      }),
      version: 11,
      migrate: (persisted: unknown, version: number) => {
        const state = (persisted || {}) as Record<string, unknown>;

        // ── v0→v10 migrations (keep all existing) ──

        // v1→v3: if selfhosted was set but no URL configured, reset to hosted
        if (!state.openclawUrl && state.openclawSubMode === 'selfhosted') {
          state.openclawSubMode = 'hosted';
        }
        // v3→v4: migrate 'desktop' mode to 'builtin' + builtinSubMode='byok'
        if (state.mode === 'desktop') {
          state.mode = 'builtin';
          state.builtinSubMode = 'byok';
        }
        if (!state.builtinSubMode) {
          state.builtinSubMode = 'free';
        }
        // v4→v5: add selfhostedType, remove bridgeGatewayUrl
        if (!state.selfhostedType) {
          state.selfhostedType = 'remote';
        }
        delete state.bridgeGatewayUrl;
        // v5→v6: restructure OpenClaw sub-modes + add local deploy fields
        if (state.openclawSubMode === 'hosted') {
          state.openclawSubMode = 'deploy';
          state.deployType = 'cloud';
        }
        if (!state.deployType) state.deployType = 'cloud';
        if (state.localOpenclawInstalled === undefined) state.localOpenclawInstalled = false;
        if (!state.localOpenclawToken) state.localOpenclawToken = '';
        if (!state.localOpenclawPort) state.localOpenclawPort = 18789;
        if (!state.localOpenclawProvider) state.localOpenclawProvider = 'deepseek';
        if (!state.localOpenclawApiKey) state.localOpenclawApiKey = '';
        if (!state.localOpenclawModel) state.localOpenclawModel = '';
        if (state.localOpenclawAutoStart === undefined) state.localOpenclawAutoStart = true;
        if (state.localOpenclawAutoBridge === undefined) state.localOpenclawAutoBridge = true;
        // v6→v7: deploy model mode fields
        if (!state.deployModelMode) state.deployModelMode = 'default';
        if (!state.deployProvider) state.deployProvider = 'deepseek';
        if (!state.deployApiKey) state.deployApiKey = '';
        if (!state.deployModel) state.deployModel = '';
        // v8→v9: CoPaw deploy fields
        if (!state.copawDeployType) state.copawDeployType = 'local';
        if (!state.copawSelfhostedType) state.copawSelfhostedType = 'remote';
        if (!state.copawDeployModelMode) state.copawDeployModelMode = 'default';
        if (!state.copawDeployProvider) state.copawDeployProvider = 'deepseek';
        if (!state.copawDeployApiKey) state.copawDeployApiKey = '';
        if (!state.copawDeployModel) state.copawDeployModel = '';
        // v9→v10: Local CoPaw fields
        if (state.localCopawInstalled === undefined) state.localCopawInstalled = false;
        if (!state.localCopawPort) state.localCopawPort = 8088;
        if (state.localCopawAutoStart === undefined) state.localCopawAutoStart = true;
        if (state.localCopawAutoBridge === undefined) state.localCopawAutoBridge = true;
        if (state.copawBridgeEnabled === undefined) state.copawBridgeEnabled = false;
        if (state.copawSubMode === 'hosted') state.copawSubMode = 'deploy';
        // Migrate old server IPs
        if (typeof state.serverUrl === 'string') {
          state.serverUrl = state.serverUrl
            .replace('150.109.157.27', '43.155.104.45')
            .replace('43.154.188.177', '43.155.104.45');
        }

        // ── v10→v11: Unified agent mode migration ──
        if (version < 11) {
          const oldMode = state.mode as string;

          if (oldMode === 'openclaw') {
            const ocSub = state.openclawSubMode as string;
            const shType = state.selfhostedType as string;

            // Keep mode='openclaw' — unified fields are supplementary, not replacing mode
            state.agentId = 'openclaw';
            if (ocSub === 'selfhosted') {
              state.agentSubMode = 'direct';
              if (shType === 'local') {
                const port = state.localOpenclawPort || 18789;
                state.agentUrl = `ws://localhost:${port}`;
                state.agentToken = state.openclawToken || '';
                state.agentBridgeEnabled = state.bridgeEnabled || false;
              } else {
                state.agentUrl = state.openclawUrl || '';
                state.agentToken = state.openclawToken || '';
              }
            } else if (ocSub === 'deploy') {
              const depType = state.deployType as string;
              if (depType === 'local') {
                state.agentSubMode = 'deploy';
                state.deployTemplateId = 'openclaw';
                state.localAgentInstalled = state.localOpenclawInstalled || false;
                state.localAgentPort = state.localOpenclawPort || 18789;
                state.localAgentAutoStart = state.localOpenclawAutoStart !== false;
                state.localAgentAutoBridge = state.localOpenclawAutoBridge !== false;
                state.agentBridgeEnabled = state.bridgeEnabled || false;
              } else {
                // Cloud deploy (hosted)
                state.agentSubMode = 'direct';
                state.agentUrl = state.openclawUrl || '';
                state.agentToken = state.openclawToken || '';
              }
            }
          } else if (oldMode === 'copaw') {
            const cSub = state.copawSubMode as string;

            // Keep mode='copaw' — unified fields are supplementary
            state.agentId = 'copaw';
            if (cSub === 'selfhosted') {
              state.agentSubMode = 'direct';
              state.agentUrl = state.copawUrl || '';
              state.agentToken = state.copawToken || '';
            } else if (cSub === 'deploy') {
              state.agentSubMode = 'deploy';
              state.deployTemplateId = 'copaw';
              state.localAgentInstalled = state.localCopawInstalled || false;
              state.localAgentPort = state.localCopawPort || 8088;
              state.localAgentAutoStart = state.localCopawAutoStart !== false;
              state.localAgentAutoBridge = state.localCopawAutoBridge !== false;
              state.agentBridgeEnabled = state.copawBridgeEnabled || false;
              if (state.copawDeployModelMode && state.copawDeployModelMode !== 'default') {
                state.deployModelMode = state.copawDeployModelMode;
                state.deployProvider = state.copawDeployProvider || 'deepseek';
                state.deployApiKey = state.copawDeployApiKey || '';
                state.deployModel = state.copawDeployModel || '';
              }
            }
          }

          // Set defaults for new fields if not set by migration
          if (!state.agentSubMode) state.agentSubMode = 'direct';
          if (!state.agentId) state.agentId = 'openclaw';
          if (state.agentUrl === undefined) state.agentUrl = '';
          if (state.agentToken === undefined) state.agentToken = '';
          if (state.agentBridgeEnabled === undefined) state.agentBridgeEnabled = false;
          if (!state.deployTemplateId) state.deployTemplateId = 'openclaw';
          if (state.localAgentInstalled === undefined) state.localAgentInstalled = false;
          if (!state.localAgentPort) state.localAgentPort = 18789;
          if (state.localAgentAutoStart === undefined) state.localAgentAutoStart = true;
          if (state.localAgentAutoBridge === undefined) state.localAgentAutoBridge = true;
        }

        return state;
      },
      onRehydrateStorage: () => {
        return (_state, error) => {
          if (!error) {
            useSettingsStore.setState({ settingsLoaded: true });
          }
        };
      },
    }
  )
);

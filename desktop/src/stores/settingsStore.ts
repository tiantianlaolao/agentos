import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AgentMode } from '../types/index.ts';

export const OPENCLAW_LOCAL_GATEWAY = 'ws://localhost:18789';

export type LLMProvider = 'deepseek' | 'openai' | 'anthropic' | 'gemini' | 'moonshot' | 'qwen' | 'zhipu' | 'openrouter';

type BuiltinSubMode = 'free' | 'byok';

type SelfhostedType = 'remote' | 'local';

interface SettingsState {
  // Connection
  mode: AgentMode;
  builtinSubMode: BuiltinSubMode;
  provider: LLMProvider;
  apiKey: string;
  serverUrl: string;
  selectedModel: string;

  // OpenClaw
  openclawUrl: string;
  openclawToken: string;
  openclawSubMode: 'hosted' | 'selfhosted' | 'deploy';
  deployType: 'cloud' | 'local';
  selfhostedType: SelfhostedType;
  hostedActivated: boolean;
  hostedQuotaUsed: number;
  hostedQuotaTotal: number;
  hostedInstanceStatus: string;

  // CoPaw
  copawUrl: string;
  copawToken: string;
  copawSubMode: 'hosted' | 'selfhosted';

  // Deploy model mode
  deployModelMode: 'default' | 'custom';
  deployProvider: LLMProvider;
  deployApiKey: string;
  deployModel: string;

  // OpenClaw Bridge
  bridgeEnabled: boolean;

  // Local OpenClaw
  localOpenclawInstalled: boolean;
  localOpenclawToken: string;
  localOpenclawPort: number;
  localOpenclawProvider: LLMProvider;
  localOpenclawApiKey: string;
  localOpenclawModel: string;
  localOpenclawAutoStart: boolean;
  localOpenclawAutoBridge: boolean;

  // App
  locale: 'zh' | 'en';

  // Lifecycle
  settingsLoaded: boolean;

  // Actions
  setMode: (mode: AgentMode) => void;
  setBuiltinSubMode: (subMode: BuiltinSubMode) => void;
  setProvider: (provider: LLMProvider) => void;
  setApiKey: (apiKey: string) => void;
  setServerUrl: (url: string) => void;
  setSelectedModel: (model: string) => void;
  setOpenclawUrl: (url: string) => void;
  setOpenclawToken: (token: string) => void;
  setOpenclawSubMode: (mode: 'hosted' | 'selfhosted' | 'deploy') => void;
  setDeployType: (type: 'cloud' | 'local') => void;
  setSelfhostedType: (type: SelfhostedType) => void;
  setHostedActivated: (v: boolean) => void;
  setHostedQuota: (used: number, total: number) => void;
  setHostedInstanceStatus: (status: string) => void;
  setCopawUrl: (url: string) => void;
  setCopawToken: (token: string) => void;
  setCopawSubMode: (mode: 'hosted' | 'selfhosted') => void;
  setDeployModelMode: (mode: 'default' | 'custom') => void;
  setDeployProvider: (provider: LLMProvider) => void;
  setDeployApiKey: (key: string) => void;
  setDeployModel: (model: string) => void;
  setBridgeEnabled: (enabled: boolean) => void;
  setLocalOpenclawInstalled: (v: boolean) => void;
  setLocalOpenclawToken: (token: string) => void;
  setLocalOpenclawPort: (port: number) => void;
  setLocalOpenclawProvider: (provider: LLMProvider) => void;
  setLocalOpenclawApiKey: (key: string) => void;
  setLocalOpenclawModel: (model: string) => void;
  setLocalOpenclawAutoStart: (v: boolean) => void;
  setLocalOpenclawAutoBridge: (v: boolean) => void;
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
      openclawUrl: '',
      openclawToken: '',
      openclawSubMode: 'deploy',
      deployType: 'cloud',
      selfhostedType: 'remote',
      hostedActivated: false,
      hostedQuotaUsed: 0,
      hostedQuotaTotal: 0,
      hostedInstanceStatus: '',
      copawUrl: '',
      copawToken: '',
      copawSubMode: 'hosted',
      deployModelMode: 'default',
      deployProvider: 'deepseek',
      deployApiKey: '',
      deployModel: '',
      bridgeEnabled: false,
      localOpenclawInstalled: false,
      localOpenclawToken: '',
      localOpenclawPort: 18789,
      localOpenclawProvider: 'deepseek',
      localOpenclawApiKey: '',
      localOpenclawModel: '',
      localOpenclawAutoStart: true,
      localOpenclawAutoBridge: true,
      locale: 'zh',
      settingsLoaded: false,

      setMode: (mode) => set({ mode }),
      setBuiltinSubMode: (subMode) => set({ builtinSubMode: subMode }),
      setProvider: (provider) => set({ provider }),
      setApiKey: (apiKey) => set({ apiKey }),
      setServerUrl: (url) => set({ serverUrl: url }),
      setSelectedModel: (model) => set({ selectedModel: model }),
      setOpenclawUrl: (url) => set({ openclawUrl: url }),
      setOpenclawToken: (token) => set({ openclawToken: token }),
      setOpenclawSubMode: (mode) => set({ openclawSubMode: mode }),
      setDeployType: (type) => set({ deployType: type }),
      setSelfhostedType: (type) => set({ selfhostedType: type }),
      setHostedActivated: (v) => set({ hostedActivated: v }),
      setHostedQuota: (used, total) => set({ hostedQuotaUsed: used, hostedQuotaTotal: total }),
      setHostedInstanceStatus: (status) => set({ hostedInstanceStatus: status }),
      setCopawUrl: (url) => set({ copawUrl: url }),
      setCopawToken: (token) => set({ copawToken: token }),
      setCopawSubMode: (mode) => set({ copawSubMode: mode }),
      setDeployModelMode: (mode) => set({ deployModelMode: mode }),
      setDeployProvider: (provider) => set({ deployProvider: provider }),
      setDeployApiKey: (key) => set({ deployApiKey: key }),
      setDeployModel: (model) => set({ deployModel: model }),
      setBridgeEnabled: (enabled) => set({ bridgeEnabled: enabled }),
      setLocalOpenclawInstalled: (v) => set({ localOpenclawInstalled: v }),
      setLocalOpenclawToken: (token) => set({ localOpenclawToken: token }),
      setLocalOpenclawPort: (port) => set({ localOpenclawPort: port }),
      setLocalOpenclawProvider: (provider) => set({ localOpenclawProvider: provider }),
      setLocalOpenclawApiKey: (key) => set({ localOpenclawApiKey: key }),
      setLocalOpenclawModel: (model) => set({ localOpenclawModel: model }),
      setLocalOpenclawAutoStart: (v) => set({ localOpenclawAutoStart: v }),
      setLocalOpenclawAutoBridge: (v) => set({ localOpenclawAutoBridge: v }),
      setLocale: (locale) => set({ locale }),
      loadSettings: () => {
        // Persist middleware auto-loads from localStorage on creation.
        // This is a manual trigger to mark settings as ready.
        set({ settingsLoaded: true });
      },
      saveSettings: () => {
        // Persist middleware auto-saves on every set() call.
        // Expose explicit save as a no-op for API parity with mobile.
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
        openclawUrl: state.openclawUrl,
        openclawToken: state.openclawToken,
        openclawSubMode: state.openclawSubMode,
        deployType: state.deployType,
        selfhostedType: state.selfhostedType,
        hostedActivated: state.hostedActivated,
        hostedQuotaUsed: state.hostedQuotaUsed,
        hostedQuotaTotal: state.hostedQuotaTotal,
        hostedInstanceStatus: state.hostedInstanceStatus,
        copawUrl: state.copawUrl,
        copawToken: state.copawToken,
        copawSubMode: state.copawSubMode,
        deployModelMode: state.deployModelMode,
        deployProvider: state.deployProvider,
        deployApiKey: state.deployApiKey,
        deployModel: state.deployModel,
        bridgeEnabled: state.bridgeEnabled,
        localOpenclawInstalled: state.localOpenclawInstalled,
        localOpenclawToken: state.localOpenclawToken,
        localOpenclawPort: state.localOpenclawPort,
        localOpenclawProvider: state.localOpenclawProvider,
        localOpenclawApiKey: state.localOpenclawApiKey,
        localOpenclawModel: state.localOpenclawModel,
        localOpenclawAutoStart: state.localOpenclawAutoStart,
        localOpenclawAutoBridge: state.localOpenclawAutoBridge,
        locale: state.locale,
      }),
      version: 8,
      migrate: (persisted: unknown) => {
        const state = (persisted || {}) as Record<string, unknown>;
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
        // 'hosted' → 'deploy' with deployType='cloud'
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
        // Migrate old server IPs
        if (typeof state.serverUrl === 'string') {
          state.serverUrl = state.serverUrl
            .replace('150.109.157.27', '43.155.104.45')
            .replace('43.154.188.177', '43.155.104.45');
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

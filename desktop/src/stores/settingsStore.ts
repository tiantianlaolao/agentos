import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AgentMode } from '../types/index.ts';

export const OPENCLAW_LOCAL_GATEWAY = 'ws://localhost:18789';

type LLMProvider = 'deepseek' | 'openai' | 'anthropic' | 'moonshot';

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
  openclawSubMode: 'hosted' | 'selfhosted';
  selfhostedType: SelfhostedType;
  hostedActivated: boolean;
  hostedQuotaUsed: number;
  hostedQuotaTotal: number;
  hostedInstanceStatus: string;

  // CoPaw
  copawUrl: string;
  copawToken: string;
  copawSubMode: 'hosted' | 'selfhosted';

  // OpenClaw Bridge
  bridgeEnabled: boolean;

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
  setOpenclawSubMode: (mode: 'hosted' | 'selfhosted') => void;
  setSelfhostedType: (type: SelfhostedType) => void;
  setHostedActivated: (v: boolean) => void;
  setHostedQuota: (used: number, total: number) => void;
  setHostedInstanceStatus: (status: string) => void;
  setCopawUrl: (url: string) => void;
  setCopawToken: (token: string) => void;
  setCopawSubMode: (mode: 'hosted' | 'selfhosted') => void;
  setBridgeEnabled: (enabled: boolean) => void;
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
      serverUrl: 'ws://43.154.188.177:3100/ws',
      selectedModel: 'deepseek',
      openclawUrl: '',
      openclawToken: '',
      openclawSubMode: 'hosted',
      selfhostedType: 'remote',
      hostedActivated: false,
      hostedQuotaUsed: 0,
      hostedQuotaTotal: 0,
      hostedInstanceStatus: '',
      copawUrl: '',
      copawToken: '',
      copawSubMode: 'hosted',
      bridgeEnabled: false,
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
      setSelfhostedType: (type) => set({ selfhostedType: type }),
      setHostedActivated: (v) => set({ hostedActivated: v }),
      setHostedQuota: (used, total) => set({ hostedQuotaUsed: used, hostedQuotaTotal: total }),
      setHostedInstanceStatus: (status) => set({ hostedInstanceStatus: status }),
      setCopawUrl: (url) => set({ copawUrl: url }),
      setCopawToken: (token) => set({ copawToken: token }),
      setCopawSubMode: (mode) => set({ copawSubMode: mode }),
      setBridgeEnabled: (enabled) => set({ bridgeEnabled: enabled }),
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
        selfhostedType: state.selfhostedType,
        hostedActivated: state.hostedActivated,
        hostedQuotaUsed: state.hostedQuotaUsed,
        hostedQuotaTotal: state.hostedQuotaTotal,
        hostedInstanceStatus: state.hostedInstanceStatus,
        copawUrl: state.copawUrl,
        copawToken: state.copawToken,
        copawSubMode: state.copawSubMode,
        bridgeEnabled: state.bridgeEnabled,
        locale: state.locale,
      }),
      version: 5,
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

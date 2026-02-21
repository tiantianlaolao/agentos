import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AgentMode } from '../types/index.ts';

type LLMProvider = 'deepseek' | 'openai' | 'anthropic' | 'moonshot';

interface SettingsState {
  // Connection
  mode: AgentMode;
  provider: LLMProvider;
  apiKey: string;
  serverUrl: string;
  selectedModel: string;

  // OpenClaw
  openclawUrl: string;
  openclawToken: string;
  openclawSubMode: 'hosted' | 'selfhosted';
  hostedActivated: boolean;
  hostedQuotaUsed: number;
  hostedQuotaTotal: number;
  hostedInstanceStatus: string;

  // CoPaw
  copawUrl: string;
  copawToken: string;

  // App
  locale: 'zh' | 'en';

  // Lifecycle
  settingsLoaded: boolean;

  // Actions
  setMode: (mode: AgentMode) => void;
  setProvider: (provider: LLMProvider) => void;
  setApiKey: (apiKey: string) => void;
  setServerUrl: (url: string) => void;
  setSelectedModel: (model: string) => void;
  setOpenclawUrl: (url: string) => void;
  setOpenclawToken: (token: string) => void;
  setOpenclawSubMode: (mode: 'hosted' | 'selfhosted') => void;
  setHostedActivated: (v: boolean) => void;
  setHostedQuota: (used: number, total: number) => void;
  setHostedInstanceStatus: (status: string) => void;
  setCopawUrl: (url: string) => void;
  setCopawToken: (token: string) => void;
  setLocale: (locale: 'zh' | 'en') => void;
  loadSettings: () => void;
  saveSettings: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      mode: 'builtin',
      provider: 'deepseek',
      apiKey: '',
      serverUrl: 'ws://150.109.157.27:3100/ws',
      selectedModel: 'deepseek',
      openclawUrl: '',
      openclawToken: '',
      openclawSubMode: 'hosted',
      hostedActivated: false,
      hostedQuotaUsed: 0,
      hostedQuotaTotal: 0,
      hostedInstanceStatus: '',
      copawUrl: '',
      copawToken: '',
      locale: 'zh',
      settingsLoaded: false,

      setMode: (mode) => set({ mode }),
      setProvider: (provider) => set({ provider }),
      setApiKey: (apiKey) => set({ apiKey }),
      setServerUrl: (url) => set({ serverUrl: url }),
      setSelectedModel: (model) => set({ selectedModel: model }),
      setOpenclawUrl: (url) => set({ openclawUrl: url }),
      setOpenclawToken: (token) => set({ openclawToken: token }),
      setOpenclawSubMode: (mode) => set({ openclawSubMode: mode }),
      setHostedActivated: (v) => set({ hostedActivated: v }),
      setHostedQuota: (used, total) => set({ hostedQuotaUsed: used, hostedQuotaTotal: total }),
      setHostedInstanceStatus: (status) => set({ hostedInstanceStatus: status }),
      setCopawUrl: (url) => set({ copawUrl: url }),
      setCopawToken: (token) => set({ copawToken: token }),
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
        provider: state.provider,
        apiKey: state.apiKey,
        serverUrl: state.serverUrl,
        selectedModel: state.selectedModel,
        openclawUrl: state.openclawUrl,
        openclawToken: state.openclawToken,
        openclawSubMode: state.openclawSubMode,
        hostedActivated: state.hostedActivated,
        hostedQuotaUsed: state.hostedQuotaUsed,
        hostedQuotaTotal: state.hostedQuotaTotal,
        hostedInstanceStatus: state.hostedInstanceStatus,
        copawUrl: state.copawUrl,
        copawToken: state.copawToken,
        locale: state.locale,
      }),
      version: 3,
      migrate: (persisted: unknown) => {
        const state = (persisted || {}) as Record<string, unknown>;
        // v1→v3: if selfhosted was set but no URL configured, reset to hosted
        if (!state.openclawUrl && state.openclawSubMode === 'selfhosted') {
          state.openclawSubMode = 'hosted';
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

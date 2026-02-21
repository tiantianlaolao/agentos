import { create } from 'zustand';
import type { ConnectionMode, LLMProvider } from '../types/protocol';

interface SettingsState {
  // Connection
  mode: ConnectionMode;
  provider: LLMProvider;
  apiKey: string;
  openclawUrl: string;
  openclawToken: string;
  serverUrl: string;
  selectedModel: string;

  // OpenClaw hosted
  openclawSubMode: 'hosted' | 'selfhosted';
  hostedActivated: boolean;
  hostedQuotaUsed: number;
  hostedQuotaTotal: number;
  hostedInstanceStatus: string; // 'pending' | 'provisioning' | 'ready' | 'error'

  // CoPaw
  copawSubMode: 'hosted' | 'selfhosted';
  copawUrl: string;
  copawToken: string;

  // App
  locale: string;

  // Lifecycle
  settingsLoaded: boolean;

  // Actions
  setMode: (mode: ConnectionMode) => void;
  setProvider: (provider: LLMProvider) => void;
  setApiKey: (apiKey: string) => void;
  setOpenclawUrl: (url: string) => void;
  setOpenclawToken: (token: string) => void;
  setServerUrl: (url: string) => void;
  setSelectedModel: (model: string) => void;
  setOpenclawSubMode: (mode: 'hosted' | 'selfhosted') => void;
  setHostedActivated: (v: boolean) => void;
  setHostedQuota: (used: number, total: number) => void;
  setHostedInstanceStatus: (status: string) => void;
  setCopawSubMode: (mode: 'hosted' | 'selfhosted') => void;
  setCopawUrl: (url: string) => void;
  setCopawToken: (token: string) => void;
  setLocale: (locale: string) => void;
  setSettingsLoaded: (loaded: boolean) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  mode: 'builtin',
  provider: 'deepseek',
  apiKey: '',
  openclawUrl: '',
  openclawToken: '',
  serverUrl: 'ws://150.109.157.27:3100/ws',
  selectedModel: 'deepseek',
  openclawSubMode: 'hosted',
  hostedActivated: false,
  hostedQuotaUsed: 0,
  hostedQuotaTotal: 50,
  hostedInstanceStatus: 'pending',
  copawSubMode: 'hosted',
  copawUrl: '',
  copawToken: '',
  locale: 'zh',
  settingsLoaded: false,

  setMode: (mode) => set({ mode }),
  setProvider: (provider) => set({ provider }),
  setApiKey: (apiKey) => set({ apiKey }),
  setOpenclawUrl: (url) => set({ openclawUrl: url }),
  setOpenclawToken: (token) => set({ openclawToken: token }),
  setServerUrl: (url) => set({ serverUrl: url }),
  setSelectedModel: (model) => set({ selectedModel: model }),
  setOpenclawSubMode: (mode) => set({ openclawSubMode: mode }),
  setHostedActivated: (v) => set({ hostedActivated: v }),
  setHostedQuota: (used, total) => set({ hostedQuotaUsed: used, hostedQuotaTotal: total }),
  setHostedInstanceStatus: (status) => set({ hostedInstanceStatus: status }),
  setCopawSubMode: (mode) => set({ copawSubMode: mode }),
  setCopawUrl: (url) => set({ copawUrl: url }),
  setCopawToken: (token) => set({ copawToken: token }),
  setLocale: (locale) => set({ locale }),
  setSettingsLoaded: (loaded) => set({ settingsLoaded: loaded }),
}));

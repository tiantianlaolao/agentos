import { create } from 'zustand';
import type { ConnectionMode, LLMProvider } from '../types/protocol';

type BuiltinSubMode = 'free' | 'byok';

interface SettingsState {
  // Connection
  mode: ConnectionMode;
  builtinSubMode: BuiltinSubMode;
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
  copawSubMode: 'deploy' | 'selfhosted';
  copawUrl: string;
  copawToken: string;
  copawDeployType: 'cloud' | 'local';
  copawSelfhostedType: 'remote' | 'local';
  copawDeployModelMode: 'default' | 'custom';
  copawDeployProvider: string;
  copawDeployApiKey: string;
  copawDeployModel: string;

  // App
  locale: string;

  // Lifecycle
  settingsLoaded: boolean;

  // Actions
  setMode: (mode: ConnectionMode) => void;
  setBuiltinSubMode: (mode: BuiltinSubMode) => void;
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
  setCopawSubMode: (mode: 'deploy' | 'selfhosted') => void;
  setCopawUrl: (url: string) => void;
  setCopawToken: (token: string) => void;
  setCopawDeployType: (type: 'cloud' | 'local') => void;
  setCopawSelfhostedType: (type: 'remote' | 'local') => void;
  setCopawDeployModelMode: (mode: 'default' | 'custom') => void;
  setCopawDeployProvider: (provider: string) => void;
  setCopawDeployApiKey: (key: string) => void;
  setCopawDeployModel: (model: string) => void;
  setLocale: (locale: string) => void;
  setSettingsLoaded: (loaded: boolean) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  mode: 'builtin',
  builtinSubMode: 'free',
  provider: 'deepseek',
  apiKey: '',
  openclawUrl: '',
  openclawToken: '',
  serverUrl: 'ws://43.155.104.45:3100/ws',
  selectedModel: 'deepseek',
  openclawSubMode: 'hosted',
  hostedActivated: false,
  hostedQuotaUsed: 0,
  hostedQuotaTotal: 50,
  hostedInstanceStatus: 'pending',
  copawSubMode: 'deploy',
  copawUrl: '',
  copawToken: '',
  copawDeployType: 'local',
  copawSelfhostedType: 'remote',
  copawDeployModelMode: 'default',
  copawDeployProvider: 'deepseek',
  copawDeployApiKey: '',
  copawDeployModel: '',
  locale: 'zh',
  settingsLoaded: false,

  setMode: (mode) => set({ mode }),
  setBuiltinSubMode: (mode) => set({ builtinSubMode: mode }),
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
  setCopawDeployType: (type) => set({ copawDeployType: type }),
  setCopawSelfhostedType: (type) => set({ copawSelfhostedType: type }),
  setCopawDeployModelMode: (mode) => set({ copawDeployModelMode: mode }),
  setCopawDeployProvider: (provider) => set({ copawDeployProvider: provider }),
  setCopawDeployApiKey: (key) => set({ copawDeployApiKey: key }),
  setCopawDeployModel: (model) => set({ copawDeployModel: model }),
  setLocale: (locale) => set({ locale }),
  setSettingsLoaded: (loaded) => set({ settingsLoaded: loaded }),
}));

import { create } from 'zustand';
import type { ConnectionMode, LLMProvider } from '../types/protocol';

interface SettingsState {
  // Connection
  mode: ConnectionMode;
  provider: LLMProvider;
  apiKey: string;
  openclawUrl: string;
  serverUrl: string;

  // App
  locale: string;

  // Actions
  setMode: (mode: ConnectionMode) => void;
  setProvider: (provider: LLMProvider) => void;
  setApiKey: (apiKey: string) => void;
  setOpenclawUrl: (url: string) => void;
  setServerUrl: (url: string) => void;
  setLocale: (locale: string) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  mode: 'builtin',
  provider: 'deepseek',
  apiKey: '',
  openclawUrl: '',
  serverUrl: 'ws://150.109.157.27:3100/ws',
  locale: 'zh',

  setMode: (mode) => set({ mode }),
  setProvider: (provider) => set({ provider }),
  setApiKey: (apiKey) => set({ apiKey }),
  setOpenclawUrl: (url) => set({ openclawUrl: url }),
  setServerUrl: (url) => set({ serverUrl: url }),
  setLocale: (locale) => set({ locale }),
}));

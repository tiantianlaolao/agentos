import { create } from 'zustand';
import type { ConnectionMode } from '../types/protocol';

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  skillName?: string;
  // Message type for special rendering
  messageType?: 'text' | 'skill_result' | 'error' | 'push';
  skillResult?: {
    skillName: string;
    success: boolean;
    data?: Record<string, unknown>;
    error?: string;
  };
  // Push metadata
  isPush?: boolean;
  source?: string;
  // Error metadata
  isError?: boolean;
  errorCode?: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  mode: ConnectionMode;
  userId: string;
}

interface ChatState {
  // Data
  currentConversationId: string | null;
  messages: ChatMessage[];
  isConnected: boolean;
  isGenerating: boolean;

  // Actions
  setConnected: (connected: boolean) => void;
  setGenerating: (generating: boolean) => void;
  setCurrentConversation: (id: string | null) => void;
  addMessage: (msg: ChatMessage) => void;
  prependMessages: (msgs: ChatMessage[]) => void;
  updateMessage: (id: string, updates: Partial<ChatMessage>) => void;
  appendToMessage: (id: string, delta: string) => void;
  removeMessage: (id: string) => void;
  setMessages: (messages: ChatMessage[]) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  currentConversationId: null,
  messages: [],
  isConnected: false,
  isGenerating: false,

  setConnected: (connected) => set({ isConnected: connected }),
  setGenerating: (generating) => set({ isGenerating: generating }),
  setCurrentConversation: (id) => set({ currentConversationId: id }),

  addMessage: (msg) =>
    set((state) => ({ messages: [...state.messages, msg] })),

  prependMessages: (msgs) =>
    set((state) => ({ messages: [...msgs, ...state.messages] })),

  updateMessage: (id, updates) =>
    set((state) => ({
      messages: state.messages.map((m) => (m.id === id ? { ...m, ...updates } : m)),
    })),

  appendToMessage: (id, delta) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, content: m.content + delta } : m
      ),
    })),

  removeMessage: (id) =>
    set((state) => ({
      messages: state.messages.filter((m) => m.id !== id),
    })),

  setMessages: (messages) => set({ messages }),
}));

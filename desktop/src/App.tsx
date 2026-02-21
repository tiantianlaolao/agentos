import { useState, useCallback, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Sidebar } from './components/Sidebar.tsx';
import { MessageList } from './components/MessageList.tsx';
import { ChatInput } from './components/ChatInput.tsx';
import { StatusBar } from './components/StatusBar.tsx';
import { SettingsPanel } from './components/SettingsPanel.tsx';
import { SkillsPanel } from './components/SkillsPanel.tsx';
import { useWebSocket } from './hooks/useWebSocket.ts';
import { useSettingsStore } from './stores/settingsStore.ts';
import { useAuthStore } from './stores/authStore.ts';
import { sendChat as directSendChat, type Provider } from './services/directLLM.ts';
import { OpenClawDirectClient } from './services/openclawDirect.ts';
import { getHostedStatus } from './services/hostedApi.ts';
import {
  getConversations,
  getConversationById,
  saveConversation,
  getMessages,
  saveMessage,
  deleteConversation as deleteConv,
} from './services/storage.ts';
import type { Conversation } from './services/storage.ts';
import type { AgentMode, ChatMessageItem } from './types/index.ts';
import './App.css';

// Admin phones — mirror server-side ADMIN_PHONES in handler.ts
const ADMIN_PHONES = ['13501161326'];

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function App() {
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showSkills, setShowSkills] = useState(false);
  const [directStreaming, setDirectStreaming] = useState(false);
  const [openclawConnected, setOpenclawConnected] = useState(false);
  const [openclawError, setOpenclawError] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const conversationId = useRef(generateId());
  const abortRef = useRef<AbortController | null>(null);
  const openclawClientRef = useRef<OpenClawDirectClient | null>(null);

  const mode = useSettingsStore((s) => s.mode);
  const setModeStore = useSettingsStore((s) => s.setMode);
  const serverUrl = useSettingsStore((s) => s.serverUrl);
  const setServerUrl = useSettingsStore((s) => s.setServerUrl);
  const copawUrl = useSettingsStore((s) => s.copawUrl);
  const copawToken = useSettingsStore((s) => s.copawToken);
  const openclawSubMode = useSettingsStore((s) => s.openclawSubMode);
  const hostedActivated = useSettingsStore((s) => s.hostedActivated);
  const authToken = useAuthStore((s) => s.authToken);
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);

  const ws = useWebSocket();
  const phone = useAuthStore((s) => s.phone);
  const userId = useAuthStore((s) => s.userId);
  const isAdmin = ADMIN_PHONES.includes(phone);

  // Determine if we're in a direct (non-WS) mode
  // Admin users always go through WS — server routes to built-in OpenClaw
  const isDirectBYOK = mode === 'desktop';
  const isDirectOpenClaw = mode === 'openclaw' && openclawSubMode === 'selfhosted' && !isAdmin;
  const isDirect = isDirectBYOK || isDirectOpenClaw;

  // BYOK is always "connected" (no server needed)
  // OpenClaw selfhosted tracks its own connection state
  const effectiveConnected = isDirect
    ? (isDirectBYOK || openclawConnected)
    : ws.connected;
  const effectiveStreaming = isDirect ? directStreaming : ws.streaming;
  const effectiveConnecting = isDirect ? false : ws.connecting;
  const effectiveError = connectError || (isDirectOpenClaw ? openclawError : (isDirect ? null : ws.error));

  // Handle mode changes: disconnect old connection, clean up state, isolate conversations
  const setMode = useCallback((newMode: AgentMode) => {
    const prevMode = useSettingsStore.getState().mode;
    if (prevMode === newMode) return;

    invoke('frontend_log', { msg: `setMode called: ${prevMode} -> ${newMode}, ws.connected=${ws.connected}` }).catch(() => {});
    setModeStore(newMode);

    // Disconnect WS when switching modes
    if (ws.connected) {
      invoke('frontend_log', { msg: 'setMode: disconnecting WS due to mode change' }).catch(() => {});
      ws.disconnect();
    }

    // Reset current conversation — each mode has its own conversation space
    setMessages([]);
    setStreamingContent(null);
    setDirectStreaming(false);
    conversationId.current = generateId();
    setActiveConversationId(null);
  }, [setModeStore, ws]);

  // Clean up OpenClaw client when mode changes away from selfhosted
  useEffect(() => {
    if (!isDirectOpenClaw && openclawClientRef.current) {
      openclawClientRef.current.disconnect();
      openclawClientRef.current = null;
      setOpenclawConnected(false);
      setOpenclawError(null);
    }
  }, [isDirectOpenClaw]);

  // Auto-disconnect and reset when user switches account (authToken changes)
  useEffect(() => {
    if (ws.connected) {
      ws.disconnect();
    }
    // Also clean up direct OpenClaw client
    if (openclawClientRef.current) {
      openclawClientRef.current.disconnect();
      openclawClientRef.current = null;
      setOpenclawConnected(false);
    }
    // Clear conversation state — isolate per user
    setMessages([]);
    setStreamingContent(null);
    conversationId.current = generateId();
    setActiveConversationId(null);
    setConnectError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken]);

  // Sync hosted status from server when user logs in (or app starts with existing auth)
  useEffect(() => {
    if (!isLoggedIn || !authToken || isAdmin) return;
    const sUrl = useSettingsStore.getState().serverUrl;
    getHostedStatus(authToken, sUrl).then((result) => {
      if (result.activated && result.account) {
        useSettingsStore.getState().setHostedActivated(true);
        useSettingsStore.getState().setHostedQuota(result.account.quotaUsed, result.account.quotaTotal);
        useSettingsStore.getState().setHostedInstanceStatus(result.account.instanceStatus);
      } else {
        useSettingsStore.getState().setHostedActivated(false);
      }
    }).catch(() => { /* ignore network errors */ });
  }, [isLoggedIn, authToken, isAdmin]);

  // Load conversation history on mount and when mode/user changes
  useEffect(() => {
    setConversations(getConversations(mode, userId || undefined));
  }, [mode, userId]);

  const refreshConversations = useCallback(() => {
    const uid = useAuthStore.getState().userId;
    setConversations(getConversations(mode, uid || undefined));
  }, [mode]);

  const getOrCreateOpenClawClient = useCallback(() => {
    const { openclawUrl, openclawToken } = useSettingsStore.getState();
    if (!openclawUrl) {
      setOpenclawError('OpenClaw URL not configured. Set it in Settings.');
      return null;
    }
    if (openclawClientRef.current) return openclawClientRef.current;
    const client = new OpenClawDirectClient(openclawUrl, openclawToken);
    client.onConnectionChange = (connected) => {
      setOpenclawConnected(connected);
      if (!connected) setOpenclawError(null);
    };
    client.onPairingError = (msg) => {
      setOpenclawError(msg);
    };
    openclawClientRef.current = client;
    return client;
  }, []);

  const handleConnect = useCallback(() => {
    if (isDirectOpenClaw) {
      const client = getOrCreateOpenClawClient();
      if (client) {
        setOpenclawError(null);
        client.ensureConnected().catch((err) => {
          setOpenclawError(err instanceof Error ? err.message : String(err));
        });
      }
      return;
    }
    // BYOK doesn't need connect -- it's always ready
    if (isDirectBYOK) return;

    setConnectError(null);

    // OpenClaw mode requires login (align with mobile)
    if (mode === 'openclaw' && !isLoggedIn) {
      setConnectError('请先登录后再使用 OpenClaw');
      return;
    }

    // Admin users: no openclawHosted flag → server ADMIN_PHONES check → built-in OpenClaw
    // Normal users with hosted activated: pass openclawHosted flag
    const useHosted = mode === 'openclaw' && !isAdmin && openclawSubMode === 'hosted' && hostedActivated;

    invoke('frontend_log', {
      msg: `handleConnect: mode=${mode}, subMode=${openclawSubMode}, hostedActivated=${hostedActivated}, useHosted=${useHosted}, hasToken=${!!authToken}`,
    }).catch(() => {});

    ws.connect(
      serverUrl,
      mode,
      authToken || undefined,
      undefined,
      undefined,
      mode === 'copaw' ? copawUrl || undefined : undefined,
      mode === 'copaw' ? copawToken || undefined : undefined,
      useHosted ? true : undefined,
    );
  }, [ws, serverUrl, mode, copawUrl, copawToken, isDirectOpenClaw, isDirectBYOK, getOrCreateOpenClawClient, authToken, isLoggedIn, openclawSubMode, hostedActivated, isAdmin]);

  const handleDisconnect = useCallback(() => {
    if (isDirectOpenClaw && openclawClientRef.current) {
      openclawClientRef.current.disconnect();
      openclawClientRef.current = null;
      setOpenclawConnected(false);
      return;
    }
    if (isDirectBYOK) return;
    ws.disconnect();
  }, [ws, isDirectOpenClaw, isDirectBYOK]);

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setStreamingContent(null);
    conversationId.current = generateId();
    setActiveConversationId(null);
  }, []);

  const handleSelectConversation = useCallback((id: string) => {
    const msgs = getMessages(id);
    const items: ChatMessageItem[] = msgs.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
    }));
    setMessages(items);
    setStreamingContent(null);
    conversationId.current = id;
    setActiveConversationId(id);
  }, []);

  const handleDeleteConversation = useCallback((id: string) => {
    deleteConv(id);
    if (conversationId.current === id) {
      setMessages([]);
      setStreamingContent(null);
      conversationId.current = generateId();
      setActiveConversationId(null);
    }
    const uid = useAuthStore.getState().userId;
    setConversations(getConversations(useSettingsStore.getState().mode, uid || undefined));
  }, []);

  const ensureConversation = useCallback(
    (firstMessageContent: string) => {
      const convId = conversationId.current;
      const existing = conversations.find((c) => c.id === convId);
      if (!existing) {
        const title = firstMessageContent.slice(0, 50) || 'New Chat';
        const now = Date.now();
        const uid = useAuthStore.getState().userId;
        const conv: Conversation = {
          id: convId,
          title,
          mode,
          userId: uid || undefined,
          createdAt: now,
          updatedAt: now,
        };
        saveConversation(conv);
        setActiveConversationId(convId);
        refreshConversations();
      }
    },
    [conversations, mode, refreshConversations]
  );

  // Helper: persist assistant message and update conversation timestamp
  const persistAssistantMessage = useCallback(
    (fullContent: string, skills?: ChatMessageItem['skillsInvoked']) => {
      const assistantMsg: ChatMessageItem = {
        id: generateId(),
        role: 'assistant',
        content: fullContent,
        timestamp: Date.now(),
        skillsInvoked: skills,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setStreamingContent(null);

      saveMessage({
        id: assistantMsg.id,
        conversationId: conversationId.current,
        role: 'assistant',
        content: fullContent,
        timestamp: assistantMsg.timestamp,
      });

      const latestConv = getConversationById(conversationId.current);
      if (latestConv) {
        latestConv.updatedAt = Date.now();
        saveConversation(latestConv);
        refreshConversations();
      }
    },
    [refreshConversations]
  );

  const handleSend = useCallback(
    (content: string) => {
      ensureConversation(content);

      const userMsg: ChatMessageItem = {
        id: generateId(),
        role: 'user',
        content,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setStreamingContent('');

      // Persist user message
      saveMessage({
        id: userMsg.id,
        conversationId: conversationId.current,
        role: 'user',
        content,
        timestamp: userMsg.timestamp,
      });

      // Update conversation timestamp
      const conv = getConversationById(conversationId.current);
      if (conv) {
        conv.updatedAt = Date.now();
        saveConversation(conv);
        refreshConversations();
      }

      const history = messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

      // --- BYOK direct mode ---
      if (isDirectBYOK) {
        const { provider, apiKey, selectedModel } = useSettingsStore.getState();
        if (!apiKey) {
          const errorMsg: ChatMessageItem = {
            id: generateId(),
            role: 'assistant',
            content: 'Error: API key not configured. Please set it in Settings.',
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, errorMsg]);
          setStreamingContent(null);
          return;
        }
        const abort = new AbortController();
        abortRef.current = abort;
        setDirectStreaming(true);
        let accumulated = '';
        directSendChat(
          provider as Provider,
          apiKey,
          selectedModel || undefined,
          content,
          history,
          {
            onChunk: (delta) => {
              accumulated += delta;
              setStreamingContent(accumulated);
            },
            onDone: (fullContent) => {
              setDirectStreaming(false);
              abortRef.current = null;
              persistAssistantMessage(fullContent);
            },
            onError: (error) => {
              setDirectStreaming(false);
              abortRef.current = null;
              const errorMsg: ChatMessageItem = {
                id: generateId(),
                role: 'assistant',
                content: `Error: ${error}`,
                timestamp: Date.now(),
              };
              setMessages((prev) => [...prev, errorMsg]);
              setStreamingContent(null);
            },
          },
          abort.signal,
        );
        return;
      }

      // --- OpenClaw selfhosted direct mode ---
      if (isDirectOpenClaw) {
        const client = getOrCreateOpenClawClient();
        if (!client) {
          const errorMsg: ChatMessageItem = {
            id: generateId(),
            role: 'assistant',
            content: 'Error: OpenClaw not configured.',
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, errorMsg]);
          setStreamingContent(null);
          return;
        }
        const abort = new AbortController();
        abortRef.current = abort;
        setDirectStreaming(true);
        let accumulated = '';
        client.sendChat(content, {
          onChunk: (delta) => {
            accumulated += delta;
            setStreamingContent(accumulated);
          },
          onDone: (fullContent) => {
            setDirectStreaming(false);
            abortRef.current = null;
            persistAssistantMessage(fullContent);
          },
          onError: (error) => {
            setDirectStreaming(false);
            abortRef.current = null;
            const errorMsg: ChatMessageItem = {
              id: generateId(),
              role: 'assistant',
              content: `Error: ${error}`,
              timestamp: Date.now(),
            };
            setMessages((prev) => [...prev, errorMsg]);
            setStreamingContent(null);
          },
        }, { signal: abort.signal }).catch(() => {
          // Error already handled via onError callback
        });
        return;
      }

      // --- WS mode (builtin, openclaw-hosted, copaw) ---
      ws.sendMessage(conversationId.current, content, history, {
        onChunk: (accumulated) => {
          setStreamingContent(accumulated);
        },
        onDone: (fullContent, skills) => {
          persistAssistantMessage(fullContent, skills);
        },
        onError: (error) => {
          const errorMsg: ChatMessageItem = {
            id: generateId(),
            role: 'assistant',
            content: `Error: ${error}`,
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, errorMsg]);
          setStreamingContent(null);
        },
      });
    },
    [ws, messages, ensureConversation, refreshConversations, isDirectBYOK, isDirectOpenClaw, getOrCreateOpenClawClient, persistAssistantMessage]
  );

  const handleStop = useCallback(() => {
    // Abort direct streams
    if (isDirect && abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      setDirectStreaming(false);
    } else {
      ws.stopGeneration();
    }

    if (streamingContent) {
      const assistantMsg: ChatMessageItem = {
        id: generateId(),
        role: 'assistant',
        content: streamingContent + '\n\n*(generation stopped)*',
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setStreamingContent(null);

      // Persist stopped message
      saveMessage({
        id: assistantMsg.id,
        conversationId: conversationId.current,
        role: 'assistant',
        content: assistantMsg.content,
        timestamp: assistantMsg.timestamp,
      });
    }
  }, [ws, streamingContent, isDirect]);

  return (
    <div className="app">
      <Sidebar
        connected={effectiveConnected}
        connecting={effectiveConnecting}
        currentMode={mode}
        onModeChange={setMode}
        onNewChat={handleNewChat}
        serverUrl={serverUrl}
        onServerUrlChange={setServerUrl}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelectConversation={handleSelectConversation}
        onDeleteConversation={handleDeleteConversation}
        onOpenSettings={() => { setShowSettings(true); setShowSkills(false); }}
        onOpenSkills={() => { setShowSkills(true); setShowSettings(false); }}
      />
      <div className="main-panel">
        {showSettings ? (
          <SettingsPanel onClose={() => setShowSettings(false)} />
        ) : showSkills ? (
          <SkillsPanel
            onClose={() => setShowSkills(false)}
            openclawClient={openclawClientRef.current}
            ws={ws}
          />
        ) : (
          <>
            <MessageList
              messages={messages}
              streamingContent={streamingContent}
              activeSkill={ws.activeSkill}
            />
            <ChatInput
              onSend={handleSend}
              onStop={handleStop}
              disabled={!effectiveConnected}
              streaming={effectiveStreaming}
            />
          </>
        )}
        <StatusBar
          connected={effectiveConnected}
          connecting={effectiveConnecting}
          sessionId={isDirect ? null : ws.sessionId}
          mode={mode}
          error={effectiveError}
        />
      </div>
    </div>
  );
}

export default App;

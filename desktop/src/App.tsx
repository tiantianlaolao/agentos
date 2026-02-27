import { useState, useCallback, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Sidebar } from './components/Sidebar.tsx';
import { MessageList } from './components/MessageList.tsx';
import { ChatInput } from './components/ChatInput.tsx';
import { StatusBar } from './components/StatusBar.tsx';
import { SettingsPanel } from './components/SettingsPanel.tsx';
import { SkillsPanel } from './components/SkillsPanel.tsx';
import { MemoryPanel } from './components/MemoryPanel.tsx';
import { ProcessPanel } from './components/ProcessPanel.tsx';
import { useWebSocket } from './hooks/useWebSocket.ts';
import { useSettingsStore, OPENCLAW_LOCAL_GATEWAY } from './stores/settingsStore.ts';
import { useAuthStore } from './stores/authStore.ts';
import { OpenClawDirectClient } from './services/openclawDirect.ts';
import { OpenClawBridge, type BridgeStatus } from './services/openclawBridge.ts';
import { getHostedStatus } from './services/hostedApi.ts';
import {
  getOrCreateSingleConversation,
  migrateToSingleConversation,
  saveConversation,
  getConversationById,
  getMessagesPaginated,
  getMessageCount,
  saveMessage,
  clearConversationMessages,
  deleteOldestMessages,
} from './services/storage.ts';
import type { AgentMode, ChatMessageItem } from './types/index.ts';
import './App.css';

// Admin phones — mirror server-side ADMIN_PHONES in handler.ts
const ADMIN_PHONES = ['13501161326'];

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function App() {
  const PAGE_SIZE = 50;
  const CLEANUP_THRESHOLD = 500;
  const CLEANUP_KEEP = 200;
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showSkills, setShowSkills] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [showProcess, setShowProcess] = useState(false);
  const [directStreaming, setDirectStreaming] = useState(false);
  const [openclawConnected, setOpenclawConnected] = useState(false);
  const [openclawError, setOpenclawError] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [quotedText, setQuotedText] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus | null>(null);
  const conversationId = useRef(generateId());
  const abortRef = useRef<AbortController | null>(null);
  const openclawClientRef = useRef<OpenClawDirectClient | null>(null);
  const bridgeRef = useRef<OpenClawBridge | null>(null);

  const mode = useSettingsStore((s) => s.mode);
  const builtinSubMode = useSettingsStore((s) => s.builtinSubMode);
  const setModeStore = useSettingsStore((s) => s.setMode);
  const serverUrl = useSettingsStore((s) => s.serverUrl);
  const setServerUrl = useSettingsStore((s) => s.setServerUrl);
  const copawUrl = useSettingsStore((s) => s.copawUrl);
  const copawToken = useSettingsStore((s) => s.copawToken);
  const copawSubMode = useSettingsStore((s) => s.copawSubMode);
  const openclawSubMode = useSettingsStore((s) => s.openclawSubMode);
  const hostedActivated = useSettingsStore((s) => s.hostedActivated);
  const authToken = useAuthStore((s) => s.authToken);
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const bridgeEnabled = useSettingsStore((s) => s.bridgeEnabled);
  const openclawToken = useSettingsStore((s) => s.openclawToken);
  const localOpenclawInstalled = useSettingsStore((s) => s.localOpenclawInstalled);
  const localOpenclawAutoStart = useSettingsStore((s) => s.localOpenclawAutoStart);
  const localOpenclawAutoBridge = useSettingsStore((s) => s.localOpenclawAutoBridge);
  const localOpenclawToken = useSettingsStore((s) => s.localOpenclawToken);
  const localOpenclawPort = useSettingsStore((s) => s.localOpenclawPort);
  const selfhostedType = useSettingsStore((s) => s.selfhostedType);

  const ws = useWebSocket();
  const phone = useAuthStore((s) => s.phone);
  const userId = useAuthStore((s) => s.userId);
  const isAdmin = ADMIN_PHONES.includes(phone);

  // Determine if we're in a direct (non-WS) mode
  // Admin users always go through WS — server routes to built-in OpenClaw
  // Note: BYOK now goes through WS (server-side), no more direct mode
  const isDirectOpenClaw = mode === 'openclaw' && openclawSubMode === 'selfhosted' && !isAdmin;
  const isDirect = isDirectOpenClaw;

  // OpenClaw selfhosted tracks its own connection state; all others use WS
  const effectiveConnected = isDirect ? openclawConnected : ws.connected;
  const effectiveStreaming = isDirect ? directStreaming : ws.streaming;
  const effectiveConnecting = isDirect ? false : ws.connecting;
  const effectiveError = connectError || (isDirectOpenClaw ? openclawError : ws.error);

  // Handle mode changes: disconnect old connection, clean up state
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

    // Messages and conversation will be reloaded via the useEffect watching [mode, userId]
    setStreamingContent(null);
    setDirectStreaming(false);
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
    // Conversation will be reloaded via the useEffect watching [mode, userId]
    setStreamingContent(null);
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

  // OpenClaw Bridge lifecycle: start/stop based on settings
  useEffect(() => {
    // Clean up existing bridge
    if (bridgeRef.current) {
      bridgeRef.current.stop();
      bridgeRef.current = null;
      setBridgeStatus(null);
    }

    if (!bridgeEnabled || !isLoggedIn || !authToken) {
      return;
    }

    const { selfhostedType: shType, localOpenclawInstalled: localInstalled, localOpenclawToken: localToken } = useSettingsStore.getState();
    const isLocal = shType === 'local' && localInstalled;
    const gatewayToken = isLocal ? localToken : (openclawToken || '');
    const bridge = new OpenClawBridge(
      serverUrl,
      authToken,
      OPENCLAW_LOCAL_GATEWAY,
      gatewayToken,
    );
    bridge.onStatusChange = (status) => {
      setBridgeStatus({ ...status });
    };
    bridgeRef.current = bridge;

    bridge.start().catch((err) => {
      console.error('[Bridge] Failed to start:', err);
      setBridgeStatus({
        serverConnected: false,
        gatewayConnected: false,
        bridgeId: null,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    return () => {
      bridge.stop();
      bridgeRef.current = null;
      setBridgeStatus(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridgeEnabled, isLoggedIn, authToken, serverUrl, openclawToken]);

  // Auto-connect for WS modes (builtin, openclaw-hosted, copaw)
  // Watches ws.connected so it auto-reconnects when connection drops
  useEffect(() => {
    if (isDirect) return;
    if (ws.connected || ws.connecting) return;
    const timer = setTimeout(() => {
      handleConnect();
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, isDirect, authToken, builtinSubMode, copawSubMode, openclawSubMode, hostedActivated, ws.connected, ws.connecting]);

  // Run migration once on mount
  useEffect(() => {
    migrateToSingleConversation();
  }, []);

  // Auto-start local OpenClaw on mount if configured
  useEffect(() => {
    if (
      localOpenclawInstalled &&
      localOpenclawAutoStart &&
      mode === 'openclaw' &&
      openclawSubMode === 'selfhosted' &&
      selfhostedType === 'local'
    ) {
      invoke('start_local_openclaw', { port: localOpenclawPort || 18789 })
        .then((result) => {
          console.log('[App] Auto-started local OpenClaw:', result);
          // Auto-enable bridge if configured
          if (localOpenclawAutoBridge && isLoggedIn && !bridgeEnabled) {
            useSettingsStore.getState().setBridgeEnabled(true);
          }
        })
        .catch((err) => {
          console.warn('[App] Auto-start local OpenClaw failed:', err);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load single conversation for current mode/user
  useEffect(() => {
    const conv = getOrCreateSingleConversation(mode, userId || undefined);
    conversationId.current = conv.id;
    const msgs = getMessagesPaginated(conv.id, PAGE_SIZE);
    const items: ChatMessageItem[] = msgs.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
    }));
    setMessages(items);
    const total = getMessageCount(conv.id);
    setHasMore(items.length < total);
    setStreamingContent(null);
  }, [mode, userId]);

  const getOrCreateOpenClawClient = useCallback(() => {
    const { openclawUrl, openclawToken, selfhostedType: shType, localOpenclawInstalled: localInstalled, localOpenclawToken: localToken } = useSettingsStore.getState();
    const isLocal = shType === 'local' && localInstalled;
    const url = isLocal ? OPENCLAW_LOCAL_GATEWAY : openclawUrl;
    const token = isLocal ? localToken : openclawToken;
    if (!url) {
      setOpenclawError('OpenClaw URL not configured. Set it in Settings.');
      return null;
    }
    if (openclawClientRef.current) return openclawClientRef.current;
    const client = new OpenClawDirectClient(url, token);
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

    setConnectError(null);

    // OpenClaw mode requires login (align with mobile)
    if (mode === 'openclaw' && !isLoggedIn) {
      setConnectError('请先登录后再使用 OpenClaw');
      return;
    }

    // Admin users: no openclawHosted flag → server ADMIN_PHONES check → built-in OpenClaw
    // Normal users with hosted activated: pass openclawHosted flag
    const useHosted = mode === 'openclaw' && !isAdmin && openclawSubMode === 'hosted' && hostedActivated;
    const useCopawHosted = mode === 'copaw' && copawSubMode === 'hosted';

    // BYOK: pass apiKey and provider/model to server (server already supports this from mobile Sprint 3.5)
    const isByok = mode === 'builtin' && builtinSubMode === 'byok';
    const { provider, apiKey, selectedModel } = useSettingsStore.getState();
    const byokApiKey = isByok ? apiKey || undefined : undefined;
    const byokModel = isByok ? (selectedModel || provider) : undefined;

    invoke('frontend_log', {
      msg: `handleConnect: mode=${mode}, builtinSubMode=${builtinSubMode}, subMode=${openclawSubMode}, copawSubMode=${copawSubMode}, hostedActivated=${hostedActivated}, useHosted=${useHosted}, useCopawHosted=${useCopawHosted}, isByok=${isByok}, hasToken=${!!authToken}`,
    }).catch(() => {});

    ws.connect(
      serverUrl,
      mode,
      authToken || undefined,
      byokApiKey,
      byokModel,
      mode === 'copaw' && copawSubMode === 'selfhosted' ? copawUrl || undefined : undefined,
      mode === 'copaw' && copawSubMode === 'selfhosted' ? copawToken || undefined : undefined,
      useHosted ? true : undefined,
      useCopawHosted ? true : undefined,
    );
  }, [ws, serverUrl, mode, builtinSubMode, copawUrl, copawToken, copawSubMode, isDirectOpenClaw, getOrCreateOpenClawClient, authToken, isLoggedIn, openclawSubMode, hostedActivated, isAdmin]);

  const handleDisconnect = useCallback(() => {
    if (isDirectOpenClaw && openclawClientRef.current) {
      openclawClientRef.current.disconnect();
      openclawClientRef.current = null;
      setOpenclawConnected(false);
      return;
    }
    ws.disconnect();
  }, [ws, isDirectOpenClaw]);

  // Load more (older) messages
  const handleLoadMore = useCallback(() => {
    if (!hasMore || messages.length === 0) return;
    const oldest = messages[0];
    const older = getMessagesPaginated(conversationId.current, PAGE_SIZE, oldest.timestamp);
    if (older.length === 0) {
      setHasMore(false);
      return;
    }
    const olderItems: ChatMessageItem[] = older.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
    }));
    setMessages((prev) => [...olderItems, ...prev]);
    if (older.length < PAGE_SIZE) setHasMore(false);
  }, [hasMore, messages]);

  const handleClearChat = useCallback(() => {
    clearConversationMessages(conversationId.current);
    setMessages([]);
    setStreamingContent(null);
    setHasMore(false);
  }, []);

  // Keyboard shortcuts: Cmd/Ctrl+N (clear chat), Escape (close panels)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === 'n') {
        e.preventDefault();
        handleClearChat();
        setShowSettings(false);
        setShowSkills(false);
        setShowMemory(false);
        setShowProcess(false);
      }
      if (e.key === 'Escape') {
        if (showSettings) setShowSettings(false);
        else if (showSkills) setShowSkills(false);
        else if (showMemory) setShowMemory(false);
        else if (showProcess) setShowProcess(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleClearChat, showSettings, showSkills, showMemory, showProcess]);

  // Request notification permission for desktop push messages
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const ensureConversation = useCallback(
    (firstMessageContent: string) => {
      const conv = getConversationById(conversationId.current);
      if (conv) {
        if (conv.title === 'Chat') {
          conv.title = firstMessageContent.slice(0, 50) || 'New Chat';
        }
        conv.updatedAt = Date.now();
        saveConversation(conv);
      }
    },
    []
  );

  // Auto-cleanup: when messages exceed threshold, extract memory and delete old ones
  const checkAndCleanup = useCallback((convId: string) => {
    const total = getMessageCount(convId);
    if (total <= CLEANUP_THRESHOLD) return;
    const toDelete = total - CLEANUP_KEEP;
    const token = useAuthStore.getState().authToken;
    const sUrl = useSettingsStore.getState().serverUrl;
    const deleted = deleteOldestMessages(convId, toDelete);
    // Send to server for memory extraction (best-effort)
    if (token && deleted.length > 0) {
      const httpUrl = sUrl.replace(/^ws/, 'http').replace(/\/ws$/, '');
      fetch(`${httpUrl}/memory/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages: deleted }),
      }).catch(() => {});
    }
    // Reload paginated messages
    const msgs = getMessagesPaginated(convId, PAGE_SIZE);
    const items: ChatMessageItem[] = msgs.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
    }));
    setMessages(items);
    const newTotal = getMessageCount(convId);
    setHasMore(items.length < newTotal);
  }, []);

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
      }

      checkAndCleanup(conversationId.current);
    },
    [checkAndCleanup]
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
      }

      // Limit history to last 20 messages to avoid LLM context overflow
      const recentMessages = messages.slice(-40);
      const history = recentMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

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
    [ws, messages, ensureConversation, isDirectOpenClaw, getOrCreateOpenClawClient, persistAssistantMessage]
  );

  const handleRetry = useCallback(() => {
    // Find last user message and remove last assistant reply
    const lastAssistantIdx = messages.findLastIndex((m: ChatMessageItem) => m.role === 'assistant');
    if (lastAssistantIdx === -1) return;
    // Find the user message right before (or the last user message)
    let lastUserMsg: ChatMessageItem | null = null;
    for (let i = lastAssistantIdx - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUserMsg = messages[i];
        break;
      }
    }
    if (!lastUserMsg) return;
    // Remove the last assistant message
    const newMessages = messages.filter((_, i) => i !== lastAssistantIdx);
    setMessages(newMessages);
    // Resend the user's message
    handleSend(lastUserMsg.content);
  }, [messages, handleSend]);

  const handleQuoteReply = useCallback((text: string) => {
    setQuotedText(text);
  }, []);

  const handleClearQuote = useCallback(() => {
    setQuotedText(null);
  }, []);

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
        onClearChat={handleClearChat}
        serverUrl={serverUrl}
        onServerUrlChange={setServerUrl}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        onOpenSettings={() => { setShowSettings(true); setShowSkills(false); setShowMemory(false); setShowProcess(false); }}
        onOpenSkills={() => { setShowSkills(true); setShowSettings(false); setShowMemory(false); setShowProcess(false); }}
        onOpenMemory={() => { setShowMemory(true); setShowSettings(false); setShowSkills(false); setShowProcess(false); }}
        onOpenProcess={() => { setShowProcess(true); setShowSettings(false); setShowSkills(false); setShowMemory(false); }}
      />
      <div className="main-panel">
        {showSettings ? (
          <SettingsPanel onClose={() => setShowSettings(false)} />
        ) : showSkills ? (
          <SkillsPanel
            onClose={() => setShowSkills(false)}
            openclawClient={openclawClientRef.current}
            ws={ws}
            serverUrl={serverUrl}
            authToken={authToken}
          />
        ) : showMemory ? (
          <MemoryPanel onClose={() => setShowMemory(false)} />
        ) : showProcess ? (
          <ProcessPanel onClose={() => setShowProcess(false)} />
        ) : (
          <>
            <MessageList
              messages={messages}
              streamingContent={streamingContent}
              activeSkill={ws.activeSkill}
              onRetry={handleRetry}
              onQuoteReply={handleQuoteReply}
              hasMore={hasMore}
              onLoadMore={handleLoadMore}
            />
            <ChatInput
              onSend={handleSend}
              onStop={handleStop}
              disabled={!effectiveConnected}
              streaming={effectiveStreaming}
              quotedText={quotedText || undefined}
              onClearQuote={handleClearQuote}
            />
          </>
        )}
        <StatusBar
          connected={effectiveConnected}
          connecting={effectiveConnecting}
          sessionId={isDirect ? null : ws.sessionId}
          mode={mode}
          error={effectiveError}
          bridgeStatus={bridgeEnabled && bridgeStatus ? bridgeStatus : null}
        />
      </div>
    </div>
  );
}

export default App;

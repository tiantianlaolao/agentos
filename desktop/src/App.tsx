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
import { CoPawDirectClient } from './services/copawDirect.ts';
import { CoPawBridge, type CoPawBridgeStatus } from './services/copawBridge.ts';
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
  const [copawConnected, setCopawConnected] = useState(false);
  const [, setCopawBridgeStatus] = useState<CoPawBridgeStatus | null>(null);
  const conversationId = useRef(generateId());
  const abortRef = useRef<AbortController | null>(null);
  const openclawClientRef = useRef<OpenClawDirectClient | null>(null);
  const bridgeRef = useRef<OpenClawBridge | null>(null);
  const copawClientRef = useRef<CoPawDirectClient | null>(null);
  const copawBridgeRef = useRef<CoPawBridge | null>(null);

  const mode = useSettingsStore((s) => s.mode);
  const builtinSubMode = useSettingsStore((s) => s.builtinSubMode);
  const setModeStore = useSettingsStore((s) => s.setMode);
  const serverUrl = useSettingsStore((s) => s.serverUrl);
  const setServerUrl = useSettingsStore((s) => s.setServerUrl);
  const authToken = useAuthStore((s) => s.authToken);
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const ws = useWebSocket();
  const phone = useAuthStore((s) => s.phone);
  const userId = useAuthStore((s) => s.userId);
  const isAdmin = ADMIN_PHONES.includes(phone);

  // Unified agent mode fields
  const agentSubMode = useSettingsStore((s) => s.agentSubMode);
  const agentId = useSettingsStore((s) => s.agentId);
  const agentUrl = useSettingsStore((s) => s.agentUrl);
  const agentToken = useSettingsStore((s) => s.agentToken);
  const agentBridgeEnabled = useSettingsStore((s) => s.agentBridgeEnabled);
  const deployTemplateId = useSettingsStore((s) => s.deployTemplateId);
  const localAgentInstalled = useSettingsStore((s) => s.localAgentInstalled);
  const localAgentAutoStart = useSettingsStore((s) => s.localAgentAutoStart);
  const localAgentAutoBridge = useSettingsStore((s) => s.localAgentAutoBridge);
  const localAgentPort = useSettingsStore((s) => s.localAgentPort);

  // Legacy fields (still read for backward compat during transition)
  const copawUrl = useSettingsStore((s) => s.copawUrl);
  const copawToken = useSettingsStore((s) => s.copawToken);
  const copawSubMode = useSettingsStore((s) => s.copawSubMode);
  const openclawSubMode = useSettingsStore((s) => s.openclawSubMode);
  const hostedActivated = useSettingsStore((s) => s.hostedActivated);
  const bridgeEnabled = useSettingsStore((s) => s.bridgeEnabled);
  const openclawToken = useSettingsStore((s) => s.openclawToken);
  const localOpenclawInstalled = useSettingsStore((s) => s.localOpenclawInstalled);
  const localOpenclawAutoStart = useSettingsStore((s) => s.localOpenclawAutoStart);
  const localOpenclawAutoBridge = useSettingsStore((s) => s.localOpenclawAutoBridge);
  const localOpenclawPort = useSettingsStore((s) => s.localOpenclawPort);
  const localCopawInstalled = useSettingsStore((s) => s.localCopawInstalled);
  const localCopawAutoStart = useSettingsStore((s) => s.localCopawAutoStart);
  const localCopawAutoBridge = useSettingsStore((s) => s.localCopawAutoBridge);
  const localCopawPort = useSettingsStore((s) => s.localCopawPort);
  const copawBridgeEnabled = useSettingsStore((s) => s.copawBridgeEnabled);
  const deployType = useSettingsStore((s) => s.deployType);

  // ── Determine direct mode ──
  // agentSubMode='direct' uses direct client; agentSubMode='deploy' uses locally installed agent
  const isDeployLocal = mode === 'openclaw' && openclawSubMode === 'deploy' && deployType === 'local' && localOpenclawInstalled;
  const isAgentDeployOpenClaw = mode === 'openclaw' && agentSubMode === 'deploy' && deployTemplateId === 'openclaw' && localAgentInstalled;
  const isAgentDeployCoPaw = mode === 'copaw' && agentSubMode === 'deploy' && deployTemplateId === 'copaw' && localAgentInstalled;
  const isAgentDirectOpenClaw = mode === 'openclaw' && agentSubMode === 'direct' && !!agentUrl;
  const isAgentDirectCoPaw = mode === 'copaw' && agentSubMode === 'direct' && !!agentUrl;

  const isDirectOpenClaw = (mode === 'openclaw' && openclawSubMode === 'selfhosted' && !isAdmin) || isDeployLocal || isAgentDirectOpenClaw || isAgentDeployOpenClaw;
  const isDirectCoPaw = (mode === 'copaw' && copawSubMode === 'deploy' && localCopawInstalled) || isAgentDeployCoPaw;
  const isCopawSelfhosted = (mode === 'copaw' && copawSubMode === 'selfhosted' && !!copawUrl) || isAgentDirectCoPaw;
  const isDirect = isDirectOpenClaw || isDirectCoPaw || isCopawSelfhosted;

  // Connection state
  const effectiveConnected = isDirectOpenClaw ? openclawConnected : (isDirectCoPaw || isCopawSelfhosted) ? copawConnected : ws.connected;
  const effectiveStreaming = isDirect ? directStreaming : ws.streaming;
  const effectiveConnecting = isDirect ? false : ws.connecting;
  const effectiveError = connectError || (isDirectOpenClaw ? openclawError : ws.error);

  // Handle mode changes
  const setMode = useCallback((newMode: AgentMode) => {
    // Map sidebar 'agent' group to actual runtime mode based on agentId
    let actualMode = newMode;
    if (newMode === 'agent') {
      const { agentId: aid } = useSettingsStore.getState();
      if (aid === 'openclaw') actualMode = 'openclaw';
      else if (aid === 'copaw') actualMode = 'copaw';
      // else keep 'agent' for truly custom agents
    }
    const prevMode = useSettingsStore.getState().mode;
    if (prevMode === actualMode) return;

    invoke('frontend_log', { msg: `setMode called: ${prevMode} -> ${actualMode}, ws.connected=${ws.connected}` }).catch(() => {});
    setModeStore(actualMode);

    if (ws.connected) {
      invoke('frontend_log', { msg: 'setMode: disconnecting WS due to mode change' }).catch(() => {});
      ws.disconnect();
    }

    setStreamingContent(null);
    setDirectStreaming(false);
  }, [setModeStore, ws]);

  // Clean up OpenClaw client when mode changes away
  useEffect(() => {
    if (!isDirectOpenClaw && openclawClientRef.current) {
      openclawClientRef.current.disconnect();
      openclawClientRef.current = null;
      setOpenclawConnected(false);
      setOpenclawError(null);
    }
  }, [isDirectOpenClaw]);

  // Clean up CoPaw client when mode changes away
  useEffect(() => {
    if (!isDirectCoPaw && !isCopawSelfhosted) {
      copawClientRef.current = null;
      setCopawConnected(false);
    }
  }, [isDirectCoPaw, isCopawSelfhosted]);

  // Auto-disconnect and reset when user switches account
  useEffect(() => {
    if (ws.connected) {
      ws.disconnect();
    }
    if (openclawClientRef.current) {
      openclawClientRef.current.disconnect();
      openclawClientRef.current = null;
      setOpenclawConnected(false);
    }
    setStreamingContent(null);
    setConnectError(null);

    // In proxy mode, update local OpenClaw config with new JWT token as API key
    if (authToken && useSettingsStore.getState().deployModelMode === 'default' && (useSettingsStore.getState().localOpenclawInstalled || useSettingsStore.getState().localAgentInstalled)) {
      const sUrl = useSettingsStore.getState().serverUrl;
      const proxyBaseUrl = sUrl.replace(/^ws/, 'http').replace(/\/ws$/, '') + '/api/llm-proxy/v1';
      invoke('update_local_openclaw_config', {
        provider: 'deepseek',
        apiKey: authToken,
        model: '',
        baseUrl: proxyBaseUrl,
        userId: useAuthStore.getState().userId || undefined,
      }).catch((err) => {
        console.warn('[App] Failed to update proxy config with new token:', err);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken]);

  // Sync hosted status
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

  // ── Unified Bridge lifecycle ──
  // OpenClaw Bridge
  useEffect(() => {
    if (bridgeRef.current) {
      bridgeRef.current.stop();
      bridgeRef.current = null;
      setBridgeStatus(null);
    }

    // Check both unified and legacy bridge enabled
    const shouldBridge = (agentBridgeEnabled || bridgeEnabled) && isLoggedIn && authToken;
    if (!shouldBridge) return;

    // Determine if we're bridging OpenClaw
    const isOpenClawBridge = mode === 'openclaw';
    if (!isOpenClawBridge) return;

    const { localOpenclawToken: localToken } = useSettingsStore.getState();
    const gatewayToken = localToken || openclawToken || agentToken || '';
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
  }, [agentBridgeEnabled, bridgeEnabled, isLoggedIn, authToken, serverUrl, openclawToken, agentToken, mode, agentId, deployTemplateId]);

  // CoPaw Bridge
  useEffect(() => {
    if (copawBridgeRef.current) {
      copawBridgeRef.current.stop();
      copawBridgeRef.current = null;
      setCopawBridgeStatus(null);
    }

    const shouldBridge = (agentBridgeEnabled || copawBridgeEnabled) && isLoggedIn && authToken;
    if (!shouldBridge) return;

    const isCoPawBridge = mode === 'copaw';
    if (!isCoPawBridge) return;

    const copPort = localAgentPort || localCopawPort || 8088;
    const copawBridge = new CoPawBridge(
      serverUrl,
      authToken,
      `http://127.0.0.1:${copPort}`,
    );
    copawBridge.onStatusChange = (status) => {
      setCopawBridgeStatus({ ...status });
    };
    copawBridgeRef.current = copawBridge;

    copawBridge.start().catch((err) => {
      console.error('[CoPaw Bridge] Failed to start:', err);
      setCopawBridgeStatus({
        serverConnected: false,
        copawReachable: false,
        bridgeId: null,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    return () => {
      copawBridge.stop();
      copawBridgeRef.current = null;
      setCopawBridgeStatus(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentBridgeEnabled, copawBridgeEnabled, isLoggedIn, authToken, serverUrl, localAgentPort, localCopawPort, mode, agentId, deployTemplateId]);

  // Auto-connect for WS modes
  useEffect(() => {
    if (isDirect) return;
    if (ws.connected || ws.connecting) return;
    const timer = setTimeout(() => {
      handleConnect();
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, isDirect, authToken, builtinSubMode, copawSubMode, openclawSubMode, deployType, hostedActivated, agentSubMode, agentId, agentUrl, ws.connected, ws.connecting]);

  // Auto-connect for direct OpenClaw
  useEffect(() => {
    if (!isDirectOpenClaw) return;
    if (openclawConnected) return;
    const timer = setTimeout(() => {
      handleConnect();
    }, 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirectOpenClaw, openclawConnected]);

  // Auto-connect for direct CoPaw
  useEffect(() => {
    if (!isDirectCoPaw && !isCopawSelfhosted) return;
    if (copawConnected) return;
    const timer = setTimeout(() => {
      handleConnect();
    }, 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirectCoPaw, isCopawSelfhosted, copawConnected]);

  // Run migration once on mount
  useEffect(() => {
    migrateToSingleConversation();
  }, []);

  // Verify local OpenClaw installation for current user
  useEffect(() => {
    const uid = useAuthStore.getState().userId;
    if (uid) {
      invoke<boolean>('check_local_openclaw_installed', { userId: uid }).then((installed) => {
        useSettingsStore.getState().setLocalOpenclawInstalled(installed);
        if (useSettingsStore.getState().deployTemplateId === 'openclaw') {
          useSettingsStore.getState().setLocalAgentInstalled(installed);
        }
      }).catch(() => { /* ignore */ });
    }
  }, []);

  // Verify local CoPaw installation
  useEffect(() => {
    invoke<boolean>('check_local_copaw_installed').then((installed) => {
      useSettingsStore.getState().setLocalCopawInstalled(installed);
      if (useSettingsStore.getState().deployTemplateId === 'copaw') {
        useSettingsStore.getState().setLocalAgentInstalled(installed);
      }
    }).catch(() => { /* ignore */ });
  }, []);

  // Auto-start local agent on mount
  useEffect(() => {
    // Unified agent deploy auto-start
    if (agentSubMode === 'deploy' && localAgentInstalled && localAgentAutoStart) {
      if (deployTemplateId === 'openclaw' && mode === 'openclaw') {
        invoke('start_local_openclaw', { port: localAgentPort || 18789, userId: useAuthStore.getState().userId || undefined })
          .then((result) => {
            console.log('[App] Auto-started local OpenClaw:', result);
            if (localAgentAutoBridge && isLoggedIn && !agentBridgeEnabled) {
              useSettingsStore.getState().setAgentBridgeEnabled(true);
            }
          })
          .catch((err) => console.warn('[App] Auto-start local OpenClaw failed:', err));
      } else if (deployTemplateId === 'copaw' && mode === 'copaw') {
        invoke('start_local_copaw', { port: localAgentPort || 8088 })
          .then((result) => {
            console.log('[App] Auto-started local CoPaw:', result);
            setCopawConnected(true);
            if (localAgentAutoBridge && isLoggedIn && !agentBridgeEnabled) {
              useSettingsStore.getState().setAgentBridgeEnabled(true);
            }
          })
          .catch((err) => console.warn('[App] Auto-start local CoPaw failed:', err));
      }
      return;
    }

    // Legacy auto-start for openclaw mode
    if (mode === 'openclaw' && localOpenclawInstalled && localOpenclawAutoStart) {
      const { openclawSubMode: ocSub, deployType: depType, selfhostedType: shType } = useSettingsStore.getState();
      const shouldAutoStart = (ocSub === 'deploy' && depType === 'local') || (ocSub === 'selfhosted' && shType === 'local');
      if (shouldAutoStart) {
        invoke('start_local_openclaw', { port: localOpenclawPort || 18789, userId: useAuthStore.getState().userId || undefined })
          .then((result) => {
            console.log('[App] Auto-started local OpenClaw:', result);
            if (localOpenclawAutoBridge && isLoggedIn && !bridgeEnabled) {
              useSettingsStore.getState().setBridgeEnabled(true);
            }
          })
          .catch((err) => console.warn('[App] Auto-start local OpenClaw failed:', err));
      }
    }

    // Legacy auto-start for copaw mode
    if (mode === 'copaw' && localCopawInstalled && localCopawAutoStart) {
      const { copawSubMode: cSub } = useSettingsStore.getState();
      if (cSub === 'deploy') {
        invoke('start_local_copaw', { port: localCopawPort || 8088 })
          .then((result) => {
            console.log('[App] Auto-started local CoPaw:', result);
            setCopawConnected(true);
            if (localCopawAutoBridge && isLoggedIn && !copawBridgeEnabled) {
              useSettingsStore.getState().setCopawBridgeEnabled(true);
            }
          })
          .catch((err) => console.warn('[App] Auto-start local CoPaw failed:', err));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load conversation for current mode/user
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
    if (openclawClientRef.current) return openclawClientRef.current;

    // Always read fresh state to avoid stale closure issues
    const s = useSettingsStore.getState();
    const isDeploy = s.agentSubMode === 'deploy' && s.deployTemplateId === 'openclaw' && (s.localAgentInstalled || s.localOpenclawInstalled);

    let url = '';
    let token = '';

    if (isDeploy) {
      // Deploy mode: always use local gateway
      url = OPENCLAW_LOCAL_GATEWAY;
      token = s.localOpenclawToken || '';
    } else if (s.agentUrl) {
      // Unified direct mode
      url = s.agentUrl;
      token = s.agentToken || '';
    } else {
      // Legacy fallback
      const isLocal = s.localOpenclawInstalled && (
        (s.openclawSubMode === 'selfhosted' && s.selfhostedType === 'local') ||
        (s.openclawSubMode === 'deploy')
      );
      url = isLocal ? OPENCLAW_LOCAL_GATEWAY : s.openclawUrl;
      token = isLocal ? (s.localOpenclawToken || '') : s.openclawToken;
    }

    if (!url) {
      setOpenclawError('OpenClaw URL not configured. Set it in Settings.');
      return null;
    }
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
  }, [mode, agentSubMode, agentUrl, agentToken]);

  const getOrCreateCoPawClient = useCallback(() => {
    if (copawClientRef.current) return copawClientRef.current;

    // Always read fresh state to avoid stale closure issues
    const s = useSettingsStore.getState();
    const isDeploy = s.agentSubMode === 'deploy' && s.deployTemplateId === 'copaw' && (s.localAgentInstalled || s.localCopawInstalled);

    let baseUrl = '';
    if (isDeploy) {
      baseUrl = `http://127.0.0.1:${s.localAgentPort || s.localCopawPort || 8088}`;
    } else if (s.agentUrl) {
      baseUrl = s.agentUrl;
    } else {
      // Legacy fallback
      const { copawUrl: selfUrl, copawSubMode: cSub, localCopawPort: cPort, localCopawInstalled: cInstalled } = s;
      baseUrl = (cSub === 'deploy' && cInstalled)
        ? `http://127.0.0.1:${cPort || 8088}`
        : selfUrl || '';
    }

    if (!baseUrl) return null;
    const client = new CoPawDirectClient(baseUrl);
    copawClientRef.current = client;
    return client;
  }, [mode, agentSubMode, agentUrl, localAgentPort]);

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

    if (isDirectCoPaw || isCopawSelfhosted) {
      const client = getOrCreateCoPawClient();
      if (client) {
        client.checkHealth().then((ok) => {
          setCopawConnected(ok);
          if (!ok) setConnectError('CoPaw not reachable');
        });
      } else {
        setConnectError('CoPaw URL not configured');
      }
      return;
    }

    setConnectError(null);

    // OpenClaw mode requires login
    if (mode === 'openclaw' && !isLoggedIn) {
      setConnectError('请先登录后再使用 OpenClaw');
      return;
    }

    const useHosted = mode === 'openclaw' && !isAdmin && openclawSubMode === 'deploy' && deployType === 'cloud' && hostedActivated;
    const useCopawHosted = false;

    // BYOK
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
  }, [ws, serverUrl, mode, builtinSubMode, copawUrl, copawToken, copawSubMode, isDirectOpenClaw, isDirectCoPaw, isCopawSelfhosted, getOrCreateOpenClawClient, getOrCreateCoPawClient, authToken, isLoggedIn, openclawSubMode, deployType, hostedActivated, isAdmin, agentId, agentUrl, agentToken, agentSubMode]);

  const handleDisconnect = useCallback(() => {
    if (isDirectOpenClaw && openclawClientRef.current) {
      openclawClientRef.current.disconnect();
      openclawClientRef.current = null;
      setOpenclawConnected(false);
      return;
    }
    if ((isDirectCoPaw || isCopawSelfhosted) && copawClientRef.current) {
      copawClientRef.current = null;
      setCopawConnected(false);
      return;
    }
    ws.disconnect();
  }, [ws, isDirectOpenClaw, isDirectCoPaw, isCopawSelfhosted]);

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

  // Keyboard shortcuts
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

  // Request notification permission
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

  // Auto-cleanup
  const checkAndCleanup = useCallback((convId: string) => {
    const total = getMessageCount(convId);
    if (total <= CLEANUP_THRESHOLD) return;
    const toDelete = total - CLEANUP_KEEP;
    const token = useAuthStore.getState().authToken;
    const sUrl = useSettingsStore.getState().serverUrl;
    const deleted = deleteOldestMessages(convId, toDelete);
    if (token && deleted.length > 0) {
      const httpUrl = sUrl.replace(/^ws/, 'http').replace(/\/ws$/, '');
      fetch(`${httpUrl}/memory/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages: deleted }),
      }).catch(() => {});
    }
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

      saveMessage({
        id: userMsg.id,
        conversationId: conversationId.current,
        role: 'user',
        content,
        timestamp: userMsg.timestamp,
      });

      const conv = getConversationById(conversationId.current);
      if (conv) {
        conv.updatedAt = Date.now();
        saveConversation(conv);
      }

      const recentMessages = messages.slice(-40);
      const history = recentMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

      // --- OpenClaw direct mode ---
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
        }, { signal: abort.signal }).catch(() => {});
        return;
      }

      // --- CoPaw direct mode ---
      if (isDirectCoPaw || isCopawSelfhosted) {
        const client = getOrCreateCoPawClient();
        if (!client) {
          const errorMsg: ChatMessageItem = {
            id: generateId(),
            role: 'assistant',
            content: 'Error: CoPaw not configured.',
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
        const sessionKey = `agentos-copaw-${userId || 'local'}`;
        client.sendChat(content, sessionKey, {
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
        }, { signal: abort.signal }).catch(() => {});
        return;
      }

      // --- WS mode ---
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
    [ws, messages, ensureConversation, isDirectOpenClaw, isDirectCoPaw, isCopawSelfhosted, getOrCreateOpenClawClient, getOrCreateCoPawClient, persistAssistantMessage, userId]
  );

  const handleRetry = useCallback(() => {
    const lastAssistantIdx = messages.findLastIndex((m: ChatMessageItem) => m.role === 'assistant');
    if (lastAssistantIdx === -1) return;
    let lastUserMsg: ChatMessageItem | null = null;
    for (let i = lastAssistantIdx - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUserMsg = messages[i];
        break;
      }
    }
    if (!lastUserMsg) return;
    const newMessages = messages.filter((_, i) => i !== lastAssistantIdx);
    setMessages(newMessages);
    handleSend(lastUserMsg.content);
  }, [messages, handleSend]);

  const handleQuoteReply = useCallback((text: string) => {
    setQuotedText(text);
  }, []);

  const handleClearQuote = useCallback(() => {
    setQuotedText(null);
  }, []);

  const handleStop = useCallback(() => {
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
          bridgeStatus={(agentBridgeEnabled || bridgeEnabled) && bridgeStatus ? bridgeStatus : null}
        />
      </div>
    </div>
  );
}

export default App;

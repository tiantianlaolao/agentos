import React, { useCallback, useEffect, useRef, useState } from 'react';
import { randomUUID } from 'expo-crypto';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  Alert,
  ActivityIndicator,
  AppState,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useChatStore } from '../../src/stores/chatStore';
import { useSettingsStore } from '../../src/stores/settingsStore';
import { useAuthStore } from '../../src/stores/authStore';
import { useTranslation } from '../../src/i18n';
import { WebSocketClient } from '../../src/services/websocket';
import { OpenClawDirectClient } from '../../src/services/openclawDirect';
import {
  getOrCreateSingleConversation,
  getMessagesPaginated,
  getMessageCount,
  saveConversation,
  saveMessage,
  clearConversationMessages,
  deleteOldestMessages,
  getSetting,
  setSetting,
} from '../../src/services/storage';
import { MessageType } from '../../src/types/protocol';
import type { ConnectionMode } from '../../src/types/protocol';
import type {
  ChatChunkMessage,
  ChatDoneMessage,
  ConnectedMessage,
  ErrorMessage,
  SkillStartMessage,
  SkillResultMessage,
  PushMessage,
  ServerMessage,
  SkillListResponseMessage,
} from '../../src/types/protocol';
import MessageBubble from '../../src/components/chat/MessageBubble';
import SkillCard from '../../src/components/chat/SkillCard';
import SkillsPanel from '../../src/components/skills/SkillsPanel';
import type { ChatMessage } from '../../src/stores/chatStore';

// Singleton clients (one per mode type)
let wsClient: WebSocketClient | null = null;
let openclawClient: OpenClawDirectClient | null = null;

function getWsClient(url: string): WebSocketClient {
  if (!wsClient) {
    wsClient = new WebSocketClient(url);
  }
  return wsClient;
}

function getOpenClawClient(url: string, token: string): OpenClawDirectClient {
  if (!openclawClient) {
    openclawClient = new OpenClawDirectClient(url, token);
  }
  return openclawClient;
}

interface SkillInfo {
  name: string;
  description: string;
}

/** builtin & byok share the same agent — openclaw and copaw need isolation */
function conversationMode(m: ConnectionMode): 'builtin' | 'openclaw' | 'copaw' {
  if (m === 'openclaw') return 'openclaw';
  if (m === 'copaw') return 'copaw';
  return 'builtin';
}

interface AgentTab {
  mode: ConnectionMode;
  labelKey: string;
  descKey: string;
  color: string;
}

const AGENT_TABS: AgentTab[] = [
  { mode: 'builtin', labelKey: 'chat.tabBuiltin', descKey: 'chat.tabBuiltinDesc', color: '#2d7d46' },
  { mode: 'openclaw', labelKey: 'chat.tabOpenclaw', descKey: 'chat.tabOpenclawDesc', color: '#c26a1b' },
  { mode: 'copaw', labelKey: 'chat.tabCopaw', descKey: 'chat.tabCopawDesc', color: '#1b6bc2' },
];

export default function ChatScreen() {
  const t = useTranslation();
  const router = useRouter();
  const flatListRef = useRef<FlatList<ChatMessage>>(null);
  const [inputText, setInputText] = useState('');
  const [activeSkill, setActiveSkill] = useState<SkillInfo | null>(null);
  const [showHub, setShowHub] = useState(true);
  const [showSkills, setShowSkills] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const currentAssistantId = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const streamBufferRef = useRef('');
  const lastUserMsgRef = useRef<string>('');
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const [desktopOnline, setDesktopOnline] = useState(false);
  const throttleRef = useRef(0);
  const THROTTLE_MS = 32; // ~30fps

  // Stream timeout: auto-recover if no chunk received for a long time
  const STREAM_TIMEOUT_MS = 120000;
  const streamTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    messages,
    currentConversationId,
    isConnected,
    isGenerating,
    setConnected,
    setGenerating,
    addMessage,
    prependMessages,
    setMessages,
    setCurrentConversation,
  } = useChatStore();

  const PAGE_SIZE = 50;
  const CLEANUP_THRESHOLD = 500;
  const CLEANUP_KEEP = 200;
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const { mode, builtinSubMode, provider, apiKey, openclawUrl, openclawToken, serverUrl, selectedModel, settingsLoaded, openclawSubMode, setHostedQuota, setMode, hostedActivated, copawSubMode, copawUrl, copawToken } = useSettingsStore();
  const { authToken, userId, isLoggedIn } = useAuthStore();
  const currentUserId = isLoggedIn ? userId : 'anonymous';

  // Load the single conversation for current mode + userId
  useEffect(() => {
    if (!settingsLoaded) return;
    (async () => {
      try {
        const conv = await getOrCreateSingleConversation(conversationMode(mode), currentUserId);
        setCurrentConversation(conv.id);
      } catch {
        // DB error
      }
    })();
  }, [settingsLoaded, mode, currentUserId, setCurrentConversation]);

  // Android keyboard height tracking (adjustNothing in manifest, we handle it manually)
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // AppState: reconnect immediately when app returns to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        // App returned to foreground — force immediate reconnect if connection dropped
        if (wsClient && !wsClient.isConnected) {
          wsClient.reconnectNow();
        }
        if (openclawClient) {
          openclawClient.reconnectNow();
        }
      }
    });
    return () => sub.remove();
  }, []);

  // Helper: handle push message (shared by WS and OpenClaw direct)
  const handlePushMessage = useCallback(async (pushContent: string, pushSource?: string) => {
    if (!pushContent) return;
    const convId = useChatStore.getState().currentConversationId;
    if (!convId) return; // No conversation yet, skip
    const pushMsg: ChatMessage = {
      id: randomUUID(), conversationId: convId, role: 'assistant', content: pushContent, timestamp: Date.now(),
      messageType: 'push', isPush: true, source: pushSource,
    };
    addMessage(pushMsg);
    try { await saveMessage(pushMsg); } catch { /* ignore */ }
  }, [addMessage]);

  // Stream timeout helpers
  const clearStreamTimeout = useCallback(() => {
    if (streamTimeoutRef.current) {
      clearTimeout(streamTimeoutRef.current);
      streamTimeoutRef.current = null;
    }
  }, []);

  const resetStreamTimeout = useCallback(() => {
    clearStreamTimeout();
    streamTimeoutRef.current = setTimeout(() => {
      // Timeout fired: save whatever we have and show error
      const convId = useChatStore.getState().currentConversationId || '';
      if (currentAssistantId.current && streamBufferRef.current) {
        addMessage({
          id: currentAssistantId.current,
          conversationId: convId,
          role: 'assistant',
          content: streamBufferRef.current,
          timestamp: Date.now(),
        });
        saveMessage({
          id: currentAssistantId.current,
          conversationId: convId,
          role: 'assistant',
          content: streamBufferRef.current,
          timestamp: Date.now(),
        }).catch(() => {});
      }
      addMessage({
        id: randomUUID(),
        conversationId: convId,
        role: 'system',
        content: t('chat.streamTimeout'),
        timestamp: Date.now(),
        messageType: 'error',
        isError: true,
      });
      setStreamingContent(null);
      streamBufferRef.current = '';
      setGenerating(false);
      setActiveSkill(null);
      currentAssistantId.current = null;
      streamTimeoutRef.current = null;
    }, STREAM_TIMEOUT_MS);
  }, [clearStreamTimeout, addMessage, setGenerating, t]);

  // Auto-cleanup: when messages exceed threshold, extract memory from oldest and delete them
  // Use a ref so the connection effect doesn't re-run when this callback changes
  const checkAndCleanupRef = useRef<(convId: string) => Promise<void>>(null!);
  const checkAndCleanup = useCallback(async (convId: string) => {
    try {
      const total = await getMessageCount(convId);
      if (total <= CLEANUP_THRESHOLD) return;
      const toDelete = total - CLEANUP_KEEP;
      const token = useAuthStore.getState().authToken;
      const sUrl = useSettingsStore.getState().serverUrl;
      const deleted = await deleteOldestMessages(convId, toDelete);
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
      const msgs = await getMessagesPaginated(convId, PAGE_SIZE);
      setMessages(msgs);
      const newTotal = await getMessageCount(convId);
      setHasMore(msgs.length < newTotal);
      Alert.alert(t('chat.cleanupDone', { count: String(toDelete) }));
    } catch { /* ignore */ }
  }, [setMessages, t]);
  checkAndCleanupRef.current = checkAndCleanup;

  // Connect — route by mode
  useEffect(() => {
    if (!settingsLoaded) return;

    // Generate a stable deviceId for server-side identity (rate limiting + memory)
    let cancelled = false;
    const doConnect = async () => {
      let deviceId = await getSetting('deviceId');
      if (!deviceId) {
        deviceId = randomUUID();
        await setSetting('deviceId', deviceId);
      }
      if (cancelled) return;
      connectWithDeviceId(deviceId);
    };

    const connectWithDeviceId = (deviceId: string) => {
      // ── OpenClaw self-hosted mode with user-provided URL: direct connect ──
      if (mode === 'openclaw' && openclawSubMode === 'selfhosted' && openclawUrl) {
        // Clean up old WS client if switching modes
        if (wsClient) { wsClient.disconnect(); wsClient = null; }

        const client = getOpenClawClient(openclawUrl, openclawToken);
        client.sessionKey = `agentos-${randomUUID().slice(0, 8)}`;

        client.onConnectionChange = (c) => setConnected(c);
        client.onPush = (content) => handlePushMessage(content, 'openclaw');
        client.onPairingError = (message) => {
          Alert.alert(
            'Device Pairing Required',
            message,
            [{ text: 'OK' }],
          );
        };

        client.ensureConnected()
          .then(() => setConnected(true))
          .catch(() => setConnected(false));

        cleanupRef.current = () => {
          client.onConnectionChange = null;
          client.onPush = null;
          client.onPairingError = null;
        };
        return;
      }

      // ── Builtin / BYOK / OpenClaw hosted: use WebSocket to AgentOS server ──
      // Clean up OpenClaw direct client if switching modes
      if (openclawClient) { openclawClient.disconnect(); openclawClient = null; }

      const client = getWsClient(serverUrl);

      const unsubConnected = client.on(MessageType.CONNECTED, (msg: ServerMessage) => {
        setConnected(true);
        const connected = msg as ConnectedMessage;
        if (connected.payload.hostedQuota) {
          setHostedQuota(connected.payload.hostedQuota.used, connected.payload.hostedQuota.total);
        }
        // Request skill list to detect desktop online status
        client.send({
          id: randomUUID(),
          type: MessageType.SKILL_LIST_REQUEST,
          timestamp: Date.now(),
        });
      });

      const unsubChunk = client.on(MessageType.CHAT_CHUNK, (msg: ServerMessage) => {
        const chunk = msg as ChatChunkMessage;
        if (currentAssistantId.current) {
          streamBufferRef.current += chunk.payload.delta;
          resetStreamTimeout();
          const now = Date.now();
          if (now - throttleRef.current > THROTTLE_MS) {
            setStreamingContent(streamBufferRef.current);
            throttleRef.current = now;
          }
        }
      });

      const unsubDone = client.on(MessageType.CHAT_DONE, (msg: ServerMessage) => {
        const done = msg as ChatDoneMessage;
        clearStreamTimeout();
        setGenerating(false);
        setActiveSkill(null);
        if (currentAssistantId.current) {
          const fullContent = done.payload.fullContent;
          addMessage({
            id: currentAssistantId.current,
            conversationId: done.payload.conversationId,
            role: 'assistant',
            content: fullContent,
            timestamp: Date.now(),
            isStreaming: false,
          });
          setStreamingContent(null);
          streamBufferRef.current = '';
          saveMessage({
            id: currentAssistantId.current,
            conversationId: done.payload.conversationId,
            role: 'assistant',
            content: fullContent,
            timestamp: Date.now(),
          }).then(() => checkAndCleanupRef.current(done.payload.conversationId)).catch(() => {});
          currentAssistantId.current = null;
        }
      });

      const unsubSkillStart = client.on(MessageType.SKILL_START, (msg: ServerMessage) => {
        const skill = msg as SkillStartMessage;
        setActiveSkill({ name: skill.payload.skillName, description: skill.payload.description });
      });

      const unsubSkillResult = client.on(MessageType.SKILL_RESULT, (msg: ServerMessage) => {
        const result = msg as SkillResultMessage;
        // Show completed skill briefly, then clear — don't add to messages array
        // to avoid flooding the FlatList during multi-round tool calling
        const skillName = result.payload.skillName;
        const success = result.payload.success;
        setActiveSkill({ name: skillName, description: success ? '✓ Done' : '✗ Failed' });
        setTimeout(() => setActiveSkill(null), 1500);
      });

      const unsubPush = client.on(MessageType.PUSH_MESSAGE, (msg: ServerMessage) => {
        const push = msg as PushMessage;
        handlePushMessage(push.payload.content, push.payload.source);
      });

      const unsubError = client.on(MessageType.ERROR, (msg: ServerMessage) => {
        const err = msg as ErrorMessage;
        const isConnectionError = err.payload.code === ('CONNECTION_CLOSED' as never);
        if (isConnectionError) {
          setConnected(false);
          return;
        }
        clearStreamTimeout();
        setGenerating(false);
        setActiveSkill(null);
        if (currentAssistantId.current) {
          setStreamingContent(null);
          streamBufferRef.current = '';
          currentAssistantId.current = null;
        }
        // P3: Inline error message instead of Alert
        addMessage({
          id: randomUUID(),
          conversationId: err.payload.conversationId || useChatStore.getState().currentConversationId || '',
          role: 'system',
          content: err.payload.message,
          timestamp: Date.now(),
          messageType: 'error',
          isError: true,
          errorCode: err.payload.code,
        });
      });

      // Listen for skill list responses to detect desktop online status
      const unsubSkillList = client.on(MessageType.SKILL_LIST_RESPONSE, (msg: ServerMessage) => {
        const response = msg as SkillListResponseMessage;
        const hasDesktop = response.payload.skills.some((s) => s.name.startsWith('desktop-'));
        setDesktopOnline(hasDesktop);
      });

      const isOpenclawHosted = mode === 'openclaw' && openclawSubMode === 'hosted';
      const isCopawHosted = mode === 'copaw' && copawSubMode === 'hosted';
      const isByok = mode === 'builtin' && builtinSubMode === 'byok';
      const byokApiKey = isByok ? apiKey || undefined : undefined;
      const byokModel = isByok ? (selectedModel || provider) : (selectedModel || undefined);
      client.connect(mode, { provider, apiKey: byokApiKey, openclawUrl, openclawToken, authToken: authToken || undefined, model: byokModel, deviceId, openclawHosted: isOpenclawHosted || undefined, copawUrl: isCopawHosted ? undefined : (copawUrl || undefined), copawToken: isCopawHosted ? undefined : (copawToken || undefined), copawHosted: isCopawHosted || undefined });

      cleanupRef.current = () => {
        unsubConnected();
        unsubChunk();
        unsubDone();
        unsubSkillStart();
        unsubSkillResult();
        unsubPush();
        unsubError();
        unsubSkillList();
      };
    };

    doConnect().catch(() => {});

    return () => {
      cancelled = true;
      clearStreamTimeout();
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      // Disconnect WS client to cancel reconnect timers and prevent zombie connections
      if (wsClient) {
        wsClient.disconnect();
        wsClient = null;
      }
      setDesktopOnline(false);
    };
  }, [
    settingsLoaded, serverUrl, mode, builtinSubMode, provider, apiKey, openclawUrl, openclawToken,
    copawUrl, copawToken, copawSubMode, authToken, selectedModel, openclawSubMode, handlePushMessage,
    setConnected, setGenerating, addMessage,
    setCurrentConversation, setHostedQuota, resetStreamTimeout, clearStreamTimeout,
    // checkAndCleanup accessed via ref to avoid re-running connection on every render
  ]);

  // Auto-scroll to bottom when new messages arrive (user send / streaming done)
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  // Auto-scroll during streaming (no animation to avoid jank)
  useEffect(() => {
    if (streamingContent !== null) {
      flatListRef.current?.scrollToEnd({ animated: false });
    }
  }, [streamingContent]);

  // Scroll to bottom whenever this tab gains focus (re-entering chat)
  useFocusEffect(
    useCallback(() => {
      if (messages.length > 0) {
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: false });
        }, 150);
      }
    }, [messages.length])
  );

  // Load messages (paginated) when switching conversations
  useEffect(() => {
    if (!currentConversationId) {
      setMessages([]);
      setHasMore(true);
      return;
    }
    (async () => {
      try {
        const msgs = await getMessagesPaginated(currentConversationId, PAGE_SIZE);
        setMessages(msgs);
        const total = await getMessageCount(currentConversationId);
        setHasMore(msgs.length < total);
        if (msgs.length > 0) {
          setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: false });
          }, 150);
        }
      } catch {
        // ignore
      }
    })();
  }, [currentConversationId, setMessages]);

  const handleClearConversation = useCallback(() => {
    Alert.alert(t('chat.clearConfirm'), '', [
      { text: t('chat.cancel'), style: 'cancel' },
      {
        text: t('chat.clear'),
        style: 'destructive',
        onPress: async () => {
          const convId = currentConversationId;
          if (convId) {
            try { await clearConversationMessages(convId); } catch { /* ignore */ }
          }
          setMessages([]);
          setHasMore(false);
          currentAssistantId.current = null;
          setActiveSkill(null);
          setGenerating(false);
          setStreamingContent(null);
          streamBufferRef.current = '';
        },
      },
    ]);
  }, [currentConversationId, setMessages, setGenerating, t]);

  const handleLoadMore = useCallback(async () => {
    if (!currentConversationId || loadingMore || !hasMore) return;
    const oldest = messages[0];
    if (!oldest) return;
    setLoadingMore(true);
    try {
      const older = await getMessagesPaginated(currentConversationId, PAGE_SIZE, oldest.timestamp);
      if (older.length === 0) {
        setHasMore(false);
      } else {
        prependMessages(older);
        if (older.length < PAGE_SIZE) setHasMore(false);
      }
    } catch { /* ignore */ }
    setLoadingMore(false);
  }, [currentConversationId, loadingMore, hasMore, messages, prependMessages]);

  const handleSelectAgent = useCallback((targetMode: ConnectionMode) => {
    // OpenClaw requires login
    if (targetMode === 'openclaw') {
      const { isLoggedIn } = useAuthStore.getState();
      if (!isLoggedIn) {
        Alert.alert(
          t('chat.openclawNeedLogin'),
          t('chat.openclawNeedLoginDesc'),
          [
            { text: t('chat.cancel'), style: 'cancel' },
            { text: t('settings.loginOrRegister'), onPress: () => router.push('/login') },
          ],
        );
        return;
      }
    }
    // CoPaw: URL is optional — server has default COPAW_URL configured
    if (targetMode !== mode) {
      setMode(targetMode);
      setSetting('mode', targetMode).catch(() => {});
      // Reset generating state so input isn't stuck from previous agent
      setGenerating(false);
      setActiveSkill(null);
      setStreamingContent(null);
      streamBufferRef.current = '';
      currentAssistantId.current = null;
    }
    setShowHub(false);
  }, [mode, setMode, t, router]);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isGenerating) return;

    let convId = currentConversationId;
    if (!convId) {
      // Should not happen — conversation is pre-created, but handle gracefully
      const conv = await getOrCreateSingleConversation(conversationMode(mode), currentUserId);
      convId = conv.id;
      setCurrentConversation(convId);
    }

    // Update conversation title if it's the default
    try {
      const conv = await getOrCreateSingleConversation(conversationMode(mode), currentUserId);
      if (conv.title === 'Chat') {
        conv.title = text.slice(0, 30);
        conv.updatedAt = Date.now();
        await saveConversation(conv);
      } else {
        conv.updatedAt = Date.now();
        await saveConversation(conv);
      }
    } catch { /* ignore */ }

    // Add user message
    const userMsg: ChatMessage = {
      id: randomUUID(),
      conversationId: convId,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    addMessage(userMsg);
    setInputText('');
    lastUserMsgRef.current = text;
    try { await saveMessage(userMsg); } catch { /* ignore */ }

    // Init streaming state (no placeholder in messages array)
    const assistantId = randomUUID();
    currentAssistantId.current = assistantId;
    streamBufferRef.current = '';
    setStreamingContent('');
    setGenerating(true);

    // Build history from recent messages (limit to last 20 to avoid LLM context overflow)
    const recentMessages = messages.slice(-40);
    const history = recentMessages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // ── Route by mode ──

    if (mode === 'openclaw' && openclawSubMode === 'selfhosted' && openclawClient) {
      // OpenClaw direct: send via Gateway WS
      const ac = new AbortController();
      abortControllerRef.current = ac;

      openclawClient.sendChat(text, {
        onChunk: (delta) => {
          if (currentAssistantId.current) {
            streamBufferRef.current += delta;
            const now = Date.now();
            if (now - throttleRef.current > THROTTLE_MS) {
              setStreamingContent(streamBufferRef.current);
              throttleRef.current = now;
            }
          }
        },
        onDone: (fullContent) => {
          setGenerating(false);
          setActiveSkill(null);
          if (currentAssistantId.current) {
            addMessage({
              id: currentAssistantId.current,
              conversationId: convId!,
              role: 'assistant',
              content: fullContent,
              timestamp: Date.now(),
              isStreaming: false,
            });
            setStreamingContent(null);
            streamBufferRef.current = '';
            saveMessage({
              id: currentAssistantId.current, conversationId: convId!, role: 'assistant',
              content: fullContent, timestamp: Date.now(),
            }).then(() => checkAndCleanupRef.current(convId!)).catch(() => {});
            currentAssistantId.current = null;
          }
          abortControllerRef.current = null;
        },
        onError: (error) => {
          setGenerating(false);
          setActiveSkill(null);
          if (currentAssistantId.current) {
            setStreamingContent(null);
            streamBufferRef.current = '';
            currentAssistantId.current = null;
          }
          abortControllerRef.current = null;
          // P3: Inline error message instead of Alert
          addMessage({
            id: randomUUID(),
            conversationId: convId!,
            role: 'system',
            content: error,
            timestamp: Date.now(),
            messageType: 'error',
            isError: true,
          });
        },
      }, {
        onToolEvent: (event) => {
          if (event.phase === 'start') {
            setActiveSkill({ name: event.name, description: `Running ${event.name}...` });
          } else {
            setActiveSkill(null);
            // P0: Insert skill result message
            const resultData = (event as unknown as Record<string, unknown>).result as Record<string, unknown> | undefined;
            addMessage({
              id: randomUUID(),
              conversationId: convId!,
              role: 'assistant',
              content: JSON.stringify(resultData ?? {}).slice(0, 200),
              timestamp: Date.now(),
              messageType: 'skill_result',
              skillResult: {
                skillName: event.name,
                success: true,
                data: resultData,
              },
            });
          }
        },
        signal: ac.signal,
      });
    } else {
      // Builtin / BYOK (and fallback): send via WebSocket to AgentOS server
      resetStreamTimeout();
      const client = getWsClient(serverUrl);
      client.send({
        id: randomUUID(),
        type: MessageType.CHAT_SEND,
        timestamp: Date.now(),
        payload: {
          conversationId: convId,
          content: text,
          history,
        },
      });
    }
  }, [
    inputText, isGenerating, currentConversationId, messages, serverUrl,
    mode, currentUserId, provider, apiKey, selectedModel, openclawUrl, openclawSubMode,
    addMessage, setCurrentConversation, setGenerating, resetStreamTimeout,
  ]);

  // P1: Stop generating
  const handleStop = useCallback(() => {
    clearStreamTimeout();
    // WS mode: send CHAT_STOP
    if (wsClient?.isConnected && currentConversationId) {
      wsClient.send({
        id: randomUUID(),
        type: MessageType.CHAT_STOP,
        timestamp: Date.now(),
        payload: { conversationId: currentConversationId },
      });
    }
    // OpenClaw direct: abort controller
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    // Finalize current streaming content as a message
    if (currentAssistantId.current && streamBufferRef.current) {
      const convId = currentConversationId || '';
      addMessage({
        id: currentAssistantId.current,
        conversationId: convId,
        role: 'assistant',
        content: streamBufferRef.current,
        timestamp: Date.now(),
      });
    }
    setStreamingContent(null);
    streamBufferRef.current = '';
    setGenerating(false);
    setActiveSkill(null);
    currentAssistantId.current = null;
  }, [currentConversationId, addMessage, setGenerating, clearStreamTimeout]);

  // P1: Retry last message
  const pendingRetryRef = useRef(false);

  const handleRetryFinal = useCallback(() => {
    if (!lastUserMsgRef.current || isGenerating) return;
    const msgs = useChatStore.getState().messages;
    const lastMsg = msgs[msgs.length - 1];
    if (lastMsg?.role === 'assistant') {
      setMessages(msgs.slice(0, -1));
    }
    pendingRetryRef.current = true;
    setInputText(lastUserMsgRef.current);
  }, [isGenerating, setMessages]);

  // Watch for pending retry
  useEffect(() => {
    if (pendingRetryRef.current && inputText.trim()) {
      pendingRetryRef.current = false;
      handleSend();
    }
  }, [inputText, handleSend]);

  // Quote reply handler
  const handleQuoteReply = useCallback((content: string) => {
    const quoted = content.length > 100 ? content.slice(0, 100) + '...' : content;
    setInputText(`> ${quoted}\n\n`);
  }, []);

  // Date separator helper — read labels once to keep callback stable (t changes every render)
  const todayLabel = t('chat.today');
  const yesterdayLabel = t('chat.yesterday');
  const getDateLabel = useCallback((timestamp: number): string => {
    const msgDate = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const isSameDay = (a: Date, b: Date) =>
      a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

    if (isSameDay(msgDate, today)) return todayLabel;
    if (isSameDay(msgDate, yesterday)) return yesterdayLabel;
    return msgDate.toLocaleDateString();
  }, [todayLabel, yesterdayLabel]);

  const renderItem = useCallback(({ item, index }: { item: ChatMessage; index: number }) => {
    const isLast = index === messages.length - 1 && item.role === 'assistant';

    // Date separator: show if first message or different day from previous
    let dateSeparator: string | null = null;
    if (index === 0) {
      dateSeparator = getDateLabel(item.timestamp);
    } else {
      const prevDate = new Date(messages[index - 1].timestamp);
      const curDate = new Date(item.timestamp);
      if (prevDate.toDateString() !== curDate.toDateString()) {
        dateSeparator = getDateLabel(item.timestamp);
      }
    }

    return (
      <>
        {dateSeparator && (
          <View style={styles.dateSeparator}>
            <View style={styles.dateLine} />
            <Text style={styles.dateText}>{dateSeparator}</Text>
            <View style={styles.dateLine} />
          </View>
        )}
        <MessageBubble
          message={item}
          isLast={isLast}
          onRetry={isLast ? handleRetryFinal : undefined}
          onQuoteReply={handleQuoteReply}
        />
      </>
    );
  }, [messages, handleRetryFinal, handleQuoteReply, getDateLabel]);

  const keyExtractor = useCallback((item: ChatMessage) => item.id, []);

  const showWelcome = messages.length === 0 && !isGenerating;

  // ── Skills panel view ──
  if (showSkills) {
    return (
      <View style={styles.container}>
        <SkillsPanel
          wsClient={wsClient}
          onClose={() => setShowSkills(false)}
          mode={mode}
          openclawSubMode={openclawSubMode as 'hosted' | 'selfhosted' | undefined}
          openclawClient={openclawClient}
          serverUrl={serverUrl}
          authToken={authToken || undefined}
        />
      </View>
    );
  }

  // ── Hub view: Agent selection ──
  if (showHub) {
    const activeTab = AGENT_TABS.find((t) => conversationMode(t.mode) === conversationMode(mode));
    return (
      <View style={styles.container}>
        <View style={styles.hubContainer}>
          <Ionicons name="apps-outline" size={48} color="#6c63ff" style={{ marginBottom: 12 }} />
          <Text style={styles.hubTitle}>{t('chat.hubTitle')}</Text>
          <Text style={styles.hubSubtitle}>{t('chat.hubSubtitle')}</Text>
          <View style={styles.hubButtons}>
            {AGENT_TABS.map((tab) => {
              const isCurrent = conversationMode(mode) === conversationMode(tab.mode);
              return (
                <TouchableOpacity
                  key={tab.mode}
                  style={[styles.hubCard, { borderColor: tab.color }]}
                  activeOpacity={0.7}
                  onPress={() => handleSelectAgent(tab.mode)}
                >
                  <View style={[styles.hubCardDot, { backgroundColor: tab.color }]} />
                  <Text style={[styles.hubCardLabel, { color: tab.color }]}>
                    {t(tab.labelKey)}
                  </Text>
                  <Text style={styles.hubCardDesc}>{t(tab.descKey)}</Text>
                  {isCurrent && (
                    <View style={[styles.hubCardBadge, { backgroundColor: tab.color + '22' }]}>
                      <Text style={[styles.hubCardBadgeText, { color: tab.color }]}>{t('chat.current')}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Skills management button */}
          <TouchableOpacity
            style={styles.skillsButton}
            onPress={() => setShowSkills(true)}
          >
            <Ionicons name="extension-puzzle-outline" size={18} color="#6c63ff" />
            <Text style={styles.skillsButtonText}>{t('chat.manageSkills')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Chat view ──
  const activeColor = AGENT_TABS.find((t) => conversationMode(t.mode) === conversationMode(mode))?.color || '#6c63ff';

  return (
    <KeyboardAvoidingView
      style={[styles.container, Platform.OS === 'android' && keyboardHeight > 0 && { paddingBottom: keyboardHeight }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Connection lost banner */}
      {!isConnected && (
        <View style={styles.connectionBanner}>
          <Text style={styles.connectionBannerText}>{t('chat.connectionLost')}</Text>
        </View>
      )}

      {/* Desktop online indicator */}
      {desktopOnline && (
        <View style={styles.desktopBanner}>
          <View style={styles.desktopDot} />
          <Text style={styles.desktopBannerText}>🖥️ 桌面已连接</Text>
        </View>
      )}

      {/* Header bar with back button and clear button */}
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => setShowHub(true)} style={styles.menuBtn}>
          <Ionicons name="arrow-back" size={22} color={activeColor} />
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <View style={[styles.headerDot, { backgroundColor: activeColor }]} />
          <Text style={styles.headerTitle} numberOfLines={1}>
            {t('tabs.chat')}
          </Text>
        </View>
        <TouchableOpacity onPress={handleClearConversation} style={styles.newChatBtn}>
          <Ionicons name="trash-outline" size={20} color={activeColor} />
        </TouchableOpacity>
      </View>

      {/* Message list or welcome */}
      {showWelcome ? (
        <View style={styles.welcomeContainer}>
          <Ionicons name="chatbubble-ellipses-outline" size={60} color="#6c63ff" />
          <Text style={styles.welcomeText}>{t('chat.welcome')}</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          style={styles.messageList}
          contentContainerStyle={styles.messageListContent}
          removeClippedSubviews={false}
          maxToRenderPerBatch={12}
          windowSize={15}
          onScroll={(e) => {
            if (e.nativeEvent.contentOffset.y < 50 && hasMore && !loadingMore) {
              handleLoadMore();
            }
          }}
          scrollEventThrottle={200}
          ListHeaderComponent={
            hasMore ? (
              <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                {loadingMore ? (
                  <ActivityIndicator size="small" color="#6c63ff" />
                ) : (
                  <Text style={{ color: '#666', fontSize: 12 }}>{t('chat.loadMore')}</Text>
                )}
              </View>
            ) : null
          }
          ListFooterComponent={
            <>
              {streamingContent !== null && (
                <MessageBubble
                  message={{
                    id: 'streaming',
                    conversationId: '',
                    role: 'assistant',
                    content: streamingContent,
                    timestamp: Date.now(),
                    isStreaming: true,
                  }}
                />
              )}
              {activeSkill && (
                <SkillCard skillName={activeSkill.name} description={activeSkill.description} />
              )}
              {isGenerating && !activeSkill && streamingContent === null && (
                <View style={styles.thinkingContainer}>
                  <ActivityIndicator size="small" color="#6c63ff" />
                  <Text style={styles.thinkingText}>{t('chat.thinking')}</Text>
                </View>
              )}
            </>
          }
        />
      )}

      {/* Input area */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder={t('chat.inputPlaceholder')}
          placeholderTextColor="#888888"
          multiline
          maxLength={2000}
          editable={!isGenerating}
        />
        {isGenerating ? (
          <TouchableOpacity style={styles.stopButton} onPress={handleStop}>
            <Ionicons name="stop-circle" size={28} color="#ff4444" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim()}
          >
            <Ionicons name="send" size={20} color="#ffffff" />
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  connectionBanner: {
    backgroundColor: '#ff4444',
    paddingVertical: 6,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  connectionBannerText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  desktopBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a2e1a',
    paddingVertical: 4,
    paddingHorizontal: 12,
    gap: 6,
  },
  desktopDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4caf50',
  },
  desktopBannerText: {
    color: '#8bc78b',
    fontSize: 12,
    fontWeight: '500',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2d2d44',
  },
  menuBtn: {
    padding: 6,
    marginRight: 8,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  newChatBtn: {
    padding: 6,
  },
  welcomeContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  welcomeText: {
    color: '#888888',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 24,
  },
  messageList: {
    flex: 1,
  },
  messageListContent: {
    paddingVertical: 12,
  },
  thinkingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 12,
    marginVertical: 4,
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
  },
  thinkingText: {
    color: '#aaaaaa',
    fontSize: 14,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2d2d44',
    backgroundColor: '#0f0f23',
  },
  input: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#ffffff',
    fontSize: 15,
    maxHeight: 100,
    marginRight: 8,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#6c63ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  stopButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  hubContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  hubTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 6,
  },
  hubSubtitle: {
    color: '#888',
    fontSize: 14,
    marginBottom: 32,
  },
  hubButtons: {
    width: '100%',
    gap: 16,
  },
  hubCard: {
    borderWidth: 1.5,
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 20,
    backgroundColor: '#1a1a2e',
    position: 'relative',
  },
  hubCardDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginBottom: 10,
  },
  hubCardLabel: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  hubCardDesc: {
    color: '#999',
    fontSize: 13,
    lineHeight: 18,
  },
  hubCardBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  hubCardBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  dateSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
    gap: 12,
  },
  dateLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#2d2d44',
  },
  dateText: {
    color: '#666',
    fontSize: 12,
  },
  skillsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#6c63ff33',
    backgroundColor: '#6c63ff11',
  },
  skillsButtonText: {
    color: '#6c63ff',
    fontSize: 14,
    fontWeight: '600',
  },
});

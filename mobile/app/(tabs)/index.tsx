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
  Modal,
  Pressable,
  ActivityIndicator,
  AppState,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useChatStore } from '../../src/stores/chatStore';
import { useSettingsStore } from '../../src/stores/settingsStore';
import { useAuthStore } from '../../src/stores/authStore';
import { useTranslation } from '../../src/i18n';
import { WebSocketClient } from '../../src/services/websocket';
import { OpenClawDirectClient } from '../../src/services/openclawDirect';
import {
  getConversations,
  getMessages,
  saveConversation,
  saveMessage,
  deleteConversation,
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
  const [showHistory, setShowHistory] = useState(false);
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

  const {
    messages,
    currentConversationId,
    isConnected,
    isGenerating,
    setConnected,
    setGenerating,
    addMessage,
    setMessages,
    setConversations,
    setCurrentConversation,
    addConversation,
    conversations,
  } = useChatStore();

  const { mode, provider, apiKey, openclawUrl, openclawToken, serverUrl, selectedModel, settingsLoaded, openclawSubMode, setHostedQuota, setMode, hostedActivated, copawSubMode, copawUrl, copawToken } = useSettingsStore();
  const { authToken, userId, isLoggedIn } = useAuthStore();
  const currentUserId = isLoggedIn ? userId : 'anonymous';

  // Load conversations filtered by current mode + userId; re-run when mode or user changes
  useEffect(() => {
    if (!settingsLoaded) return;
    (async () => {
      try {
        const convs = await getConversations(conversationMode(mode), currentUserId);
        setConversations(convs);

        const curId = useChatStore.getState().currentConversationId;
        const currentBelongs = convs.some((c) => c.id === curId);
        if (!currentBelongs) {
          // Switch to the most recent conversation in this mode, or start fresh
          if (convs.length > 0) {
            setCurrentConversation(convs[0].id);
          } else {
            setCurrentConversation(null);
            setMessages([]);
          }
        }
      } catch {
        // DB error
      }
    })();
  }, [settingsLoaded, mode, currentUserId, setConversations, setCurrentConversation, setMessages]);

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
    let convId = useChatStore.getState().currentConversationId;
    if (!convId) {
      convId = randomUUID();
      const currentMode = useSettingsStore.getState().mode;
      const { isLoggedIn: loggedIn, userId: uid } = useAuthStore.getState();
      const conv = { id: convId, title: 'Agent Push', createdAt: Date.now(), updatedAt: Date.now(), mode: conversationMode(currentMode), userId: loggedIn ? uid : 'anonymous' };
      addConversation(conv);
      setCurrentConversation(convId);
      try { await saveConversation(conv); } catch { /* ignore */ }
    }
    const pushMsg: ChatMessage = {
      id: randomUUID(), conversationId: convId, role: 'assistant', content: pushContent, timestamp: Date.now(),
      messageType: 'push', isPush: true, source: pushSource,
    };
    addMessage(pushMsg);
    try { await saveMessage(pushMsg); } catch { /* ignore */ }
  }, [addConversation, setCurrentConversation, addMessage]);

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
          const now = Date.now();
          if (now - throttleRef.current > THROTTLE_MS) {
            setStreamingContent(streamBufferRef.current);
            throttleRef.current = now;
          }
        }
      });

      const unsubDone = client.on(MessageType.CHAT_DONE, (msg: ServerMessage) => {
        const done = msg as ChatDoneMessage;
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
          }).catch(() => {});
          currentAssistantId.current = null;
        }
      });

      const unsubSkillStart = client.on(MessageType.SKILL_START, (msg: ServerMessage) => {
        const skill = msg as SkillStartMessage;
        setActiveSkill({ name: skill.payload.skillName, description: skill.payload.description });
      });

      const unsubSkillResult = client.on(MessageType.SKILL_RESULT, (msg: ServerMessage) => {
        const result = msg as SkillResultMessage;
        setActiveSkill(null);
        const convId = result.payload.conversationId || useChatStore.getState().currentConversationId || '';
        const resultSummary = result.payload.success
          ? JSON.stringify(result.payload.data ?? {}).slice(0, 200)
          : result.payload.error || 'Unknown error';
        addMessage({
          id: randomUUID(),
          conversationId: convId,
          role: 'assistant',
          content: resultSummary,
          timestamp: Date.now(),
          messageType: 'skill_result',
          skillResult: {
            skillName: result.payload.skillName,
            success: result.payload.success,
            data: result.payload.data,
            error: result.payload.error,
          },
        });
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
      client.connect(mode, { provider, apiKey, openclawUrl, openclawToken, authToken: authToken || undefined, model: selectedModel || undefined, deviceId, openclawHosted: isOpenclawHosted || undefined, copawUrl: isCopawHosted ? undefined : (copawUrl || undefined), copawToken: isCopawHosted ? undefined : (copawToken || undefined), copawHosted: isCopawHosted || undefined });

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
    settingsLoaded, serverUrl, mode, provider, apiKey, openclawUrl, openclawToken,
    copawUrl, copawToken, copawSubMode, authToken, selectedModel, openclawSubMode, handlePushMessage,
    setConnected, setGenerating, addMessage,
    addConversation, setCurrentConversation, setHostedQuota,
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

  // Load messages when switching conversations
  useEffect(() => {
    if (!currentConversationId) {
      setMessages([]);
      return;
    }
    (async () => {
      try {
        const msgs = await getMessages(currentConversationId);
        setMessages(msgs);
        // Scroll to bottom after loading conversation history
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

  const handleNewConversation = useCallback(() => {
    setCurrentConversation(null);
    setMessages([]);
    currentAssistantId.current = null;
    setActiveSkill(null);
    setGenerating(false);
    setStreamingContent(null);
    streamBufferRef.current = '';
    setShowHistory(false);
  }, [setCurrentConversation, setMessages, setGenerating]);

  const handleSelectConversation = useCallback((convId: string) => {
    setCurrentConversation(convId);
    setShowHistory(false);
    currentAssistantId.current = null;
    setActiveSkill(null);
    setGenerating(false);
    setStreamingContent(null);
    streamBufferRef.current = '';
  }, [setCurrentConversation, setGenerating]);

  const handleDeleteConversation = useCallback((convId: string) => {
    Alert.alert(t('chat.deleteConfirm'), '', [
      { text: t('chat.cancel'), style: 'cancel' },
      {
        text: t('chat.delete'),
        style: 'destructive',
        onPress: async () => {
          try { await deleteConversation(convId); } catch { /* ignore */ }
          const updated = conversations.filter((c) => c.id !== convId);
          setConversations(updated);
          if (currentConversationId === convId) {
            setCurrentConversation(null);
            setMessages([]);
          }
        },
      },
    ]);
  }, [conversations, currentConversationId, setConversations, setCurrentConversation, setMessages, t]);

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

    // Create new conversation if needed
    if (!convId) {
      convId = randomUUID();
      const conv = {
        id: convId,
        title: text.slice(0, 30),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        mode: conversationMode(mode),
        userId: currentUserId,
      };
      addConversation(conv);
      setCurrentConversation(convId);
      try { await saveConversation(conv); } catch { /* ignore */ }
    }

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
            }).catch(() => {});
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
    mode, provider, apiKey, selectedModel, openclawUrl, openclawSubMode,
    addMessage, addConversation, setCurrentConversation, setGenerating,
  ]);

  // P1: Stop generating
  const handleStop = useCallback(() => {
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
  }, [currentConversationId, addMessage, setGenerating]);

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

  const showWelcome = messages.length === 0 && !currentConversationId;

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

      {/* Header bar with back button, history and new conversation buttons */}
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => setShowHub(true)} style={styles.menuBtn}>
          <Ionicons name="arrow-back" size={22} color={activeColor} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowHistory(true)} style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <View style={[styles.headerDot, { backgroundColor: activeColor }]} />
          <Text style={styles.headerTitle} numberOfLines={1}>
            {conversations.find((c) => c.id === currentConversationId)?.title || t('tabs.chat')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleNewConversation} style={styles.newChatBtn}>
          <Ionicons name="create-outline" size={22} color={activeColor} />
        </TouchableOpacity>
      </View>

      {/* Conversation history modal */}
      <Modal visible={showHistory} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('chat.history')}</Text>
              <TouchableOpacity onPress={() => setShowHistory(false)}>
                <Ionicons name="close" size={24} color="#ffffff" />
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.newChatRow} onPress={handleNewConversation}>
              <Ionicons name="add-circle-outline" size={20} color="#6c63ff" />
              <Text style={styles.newChatRowText}>{t('tabs.chat')}</Text>
            </TouchableOpacity>
            {conversations.length === 0 ? (
              <Text style={styles.emptyText}>{t('chat.noConversations')}</Text>
            ) : (
              <FlatList
                data={conversations}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <Pressable
                    style={[
                      styles.convItem,
                      item.id === currentConversationId && styles.convItemActive,
                    ]}
                    onPress={() => handleSelectConversation(item.id)}
                    onLongPress={() => handleDeleteConversation(item.id)}
                  >
                    <Ionicons name="chatbubble-outline" size={16} color="#888" style={{ marginRight: 10 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.convTitle} numberOfLines={1}>{item.title}</Text>
                      <Text style={styles.convDate}>
                        {new Date(item.updatedAt).toLocaleDateString()}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleDeleteConversation(item.id)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons name="trash-outline" size={16} color="#666" />
                    </TouchableOpacity>
                  </Pressable>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    flex: 1,
    width: '80%',
    backgroundColor: '#0f0f23',
    borderRightWidth: 1,
    borderRightColor: '#2d2d44',
    paddingTop: 50,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2d2d44',
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  newChatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2d2d44',
  },
  newChatRowText: {
    color: '#6c63ff',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 10,
  },
  emptyText: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 40,
  },
  convItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1a1a2e',
  },
  convItemActive: {
    backgroundColor: '#1a1a2e',
  },
  convTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  convDate: {
    color: '#666',
    fontSize: 12,
    marginTop: 2,
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

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useChatStore } from '../../src/stores/chatStore';
import { useSettingsStore } from '../../src/stores/settingsStore';
import { useTranslation } from '../../src/i18n';
import { WebSocketClient } from '../../src/services/websocket';
import {
  getConversations,
  getMessages,
  saveConversation,
  saveMessage,
  deleteConversation,
} from '../../src/services/storage';
import { MessageType } from '../../src/types/protocol';
import type {
  ChatChunkMessage,
  ChatDoneMessage,
  ErrorMessage,
  SkillStartMessage,
  ServerMessage,
} from '../../src/types/protocol';
import MessageBubble from '../../src/components/chat/MessageBubble';
import SkillCard from '../../src/components/chat/SkillCard';
import type { ChatMessage } from '../../src/stores/chatStore';

// Singleton WebSocket client
let wsClient: WebSocketClient | null = null;

function getWsClient(url: string): WebSocketClient {
  if (!wsClient || !wsClient.isConnected) {
    wsClient = new WebSocketClient(url);
  }
  return wsClient;
}

interface SkillInfo {
  name: string;
  description: string;
}

export default function ChatScreen() {
  const t = useTranslation();
  const flatListRef = useRef<FlatList<ChatMessage>>(null);
  const [inputText, setInputText] = useState('');
  const [activeSkill, setActiveSkill] = useState<SkillInfo | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const currentAssistantId = useRef<string | null>(null);

  const {
    messages,
    currentConversationId,
    isConnected,
    isGenerating,
    setConnected,
    setGenerating,
    addMessage,
    appendToMessage,
    updateMessage,
    setMessages,
    setConversations,
    setCurrentConversation,
    addConversation,
    conversations,
  } = useChatStore();

  const { mode, provider, apiKey, openclawUrl, serverUrl } = useSettingsStore();

  // Load conversations on mount
  useEffect(() => {
    (async () => {
      try {
        const convs = await getConversations();
        setConversations(convs);
      } catch {
        // DB may not be ready yet
      }
    })();
  }, [setConversations]);

  // Connect WebSocket
  useEffect(() => {
    const client = getWsClient(serverUrl);

    const unsubConnected = client.on(MessageType.CONNECTED, () => {
      setConnected(true);
    });

    const unsubChunk = client.on(MessageType.CHAT_CHUNK, (msg: ServerMessage) => {
      const chunk = msg as ChatChunkMessage;
      if (currentAssistantId.current) {
        appendToMessage(currentAssistantId.current, chunk.payload.delta);
      }
    });

    const unsubDone = client.on(MessageType.CHAT_DONE, (msg: ServerMessage) => {
      const done = msg as ChatDoneMessage;
      setGenerating(false);
      setActiveSkill(null);
      if (currentAssistantId.current) {
        updateMessage(currentAssistantId.current, {
          content: done.payload.fullContent,
          isStreaming: false,
        });
        // Save completed message to SQLite
        const assistantMsg: ChatMessage = {
          id: currentAssistantId.current,
          conversationId: done.payload.conversationId,
          role: 'assistant',
          content: done.payload.fullContent,
          timestamp: Date.now(),
        };
        saveMessage(assistantMsg).catch(() => {});
        currentAssistantId.current = null;
      }
    });

    const unsubSkillStart = client.on(MessageType.SKILL_START, (msg: ServerMessage) => {
      const skill = msg as SkillStartMessage;
      setActiveSkill({ name: skill.payload.skillName, description: skill.payload.description });
    });

    const unsubSkillResult = client.on(MessageType.SKILL_RESULT, () => {
      setActiveSkill(null);
    });

    const unsubError = client.on(MessageType.ERROR, (msg: ServerMessage) => {
      const err = msg as ErrorMessage;
      setGenerating(false);
      setActiveSkill(null);
      if (currentAssistantId.current) {
        updateMessage(currentAssistantId.current, { isStreaming: false });
        currentAssistantId.current = null;
      }
      Alert.alert('Error', err.payload.message);
    });

    client.connect(mode, { provider, apiKey, openclawUrl });

    return () => {
      unsubConnected();
      unsubChunk();
      unsubDone();
      unsubSkillStart();
      unsubSkillResult();
      unsubError();
    };
    // Reconnect when settings change
  }, [
    serverUrl, mode, provider, apiKey, openclawUrl,
    setConnected, setGenerating, appendToMessage, updateMessage, addMessage,
  ]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

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
    setShowHistory(false);
  }, [setCurrentConversation, setMessages, setGenerating]);

  const handleSelectConversation = useCallback((convId: string) => {
    setCurrentConversation(convId);
    setShowHistory(false);
    currentAssistantId.current = null;
    setActiveSkill(null);
    setGenerating(false);
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

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isGenerating) return;

    let convId = currentConversationId;

    // Create new conversation if needed
    if (!convId) {
      convId = crypto.randomUUID();
      const conv = {
        id: convId,
        title: text.slice(0, 30),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      addConversation(conv);
      setCurrentConversation(convId);
      try { await saveConversation(conv); } catch { /* ignore */ }
    }

    // Add user message
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      conversationId: convId,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    addMessage(userMsg);
    setInputText('');
    try { await saveMessage(userMsg); } catch { /* ignore */ }

    // Create placeholder assistant message
    const assistantId = crypto.randomUUID();
    currentAssistantId.current = assistantId;
    addMessage({
      id: assistantId,
      conversationId: convId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    });
    setGenerating(true);

    // Build history from current messages
    const history = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Send via WebSocket
    const client = getWsClient(serverUrl);
    client.send({
      id: crypto.randomUUID(),
      type: MessageType.CHAT_SEND,
      timestamp: Date.now(),
      payload: {
        conversationId: convId,
        content: text,
        history,
      },
    });
  }, [
    inputText, isGenerating, currentConversationId, messages, serverUrl,
    addMessage, addConversation, setCurrentConversation, setGenerating,
  ]);

  const renderItem = useCallback(({ item }: { item: ChatMessage }) => {
    return <MessageBubble message={item} />;
  }, []);

  const keyExtractor = useCallback((item: ChatMessage) => item.id, []);

  const showWelcome = messages.length === 0 && !currentConversationId;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Connection lost banner */}
      {!isConnected && (
        <View style={styles.connectionBanner}>
          <Text style={styles.connectionBannerText}>{t('chat.connectionLost')}</Text>
        </View>
      )}

      {/* Header bar with history and new conversation buttons */}
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => setShowHistory(true)} style={styles.menuBtn}>
          <Ionicons name="menu" size={22} color="#6c63ff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {conversations.find((c) => c.id === currentConversationId)?.title || t('tabs.chat')}
        </Text>
        <TouchableOpacity onPress={handleNewConversation} style={styles.newChatBtn}>
          <Ionicons name="create-outline" size={22} color="#6c63ff" />
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
          ListFooterComponent={
            <>
              {activeSkill && (
                <SkillCard skillName={activeSkill.name} description={activeSkill.description} />
              )}
              {isGenerating && !activeSkill && messages[messages.length - 1]?.content === '' && (
                <View style={styles.thinkingContainer}>
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
        <TouchableOpacity
          style={[styles.sendButton, (!inputText.trim() || isGenerating) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!inputText.trim() || isGenerating}
        >
          <Ionicons name="send" size={20} color="#ffffff" />
        </TouchableOpacity>
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
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  thinkingText: {
    color: '#888888',
    fontSize: 14,
    fontStyle: 'italic',
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
});

import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity, Pressable, ToastAndroid, Platform, Alert, ActionSheetIOS } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import Markdown from 'react-native-markdown-display';
import type { ChatMessage } from '../../stores/chatStore';
import { useTranslation } from '../../i18n';
import SkillCard from './SkillCard';
import CodeBlock from './CodeBlock';

interface MessageBubbleProps {
  message: ChatMessage;
  isLast?: boolean;
  onRetry?: () => void;
  onQuoteReply?: (content: string) => void;
}

function BlinkingCursor() {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <Animated.Text style={[styles.cursor, { opacity }]}>{'\u2588'}</Animated.Text>
  );
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

const markdownStyles = StyleSheet.create({
  body: { color: '#ffffff', fontSize: 15, lineHeight: 22 },
  heading1: { color: '#ffffff', fontSize: 22, fontWeight: 'bold', marginVertical: 6 },
  heading2: { color: '#ffffff', fontSize: 19, fontWeight: 'bold', marginVertical: 5 },
  heading3: { color: '#ffffff', fontSize: 17, fontWeight: 'bold', marginVertical: 4 },
  strong: { color: '#ffffff', fontWeight: 'bold' },
  em: { color: '#dddddd', fontStyle: 'italic' },
  link: { color: '#6c63ff' },
  blockquote: {
    backgroundColor: '#252540',
    borderLeftColor: '#6c63ff',
    borderLeftWidth: 3,
    paddingLeft: 10,
    paddingVertical: 4,
    marginVertical: 6,
  },
  code_inline: {
    backgroundColor: '#252540',
    color: '#e8e8e8',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
    fontFamily: 'monospace',
    fontSize: 13,
  },
  code_block: {
    backgroundColor: '#252540',
    color: '#e8e8e8',
    padding: 12,
    borderRadius: 8,
    fontFamily: 'monospace',
    fontSize: 13,
    marginVertical: 6,
  },
  fence: {
    backgroundColor: '#252540',
    color: '#e8e8e8',
    padding: 12,
    borderRadius: 8,
    fontFamily: 'monospace',
    fontSize: 13,
    marginVertical: 6,
  },
  bullet_list: { marginVertical: 4 },
  ordered_list: { marginVertical: 4 },
  list_item: { color: '#ffffff', fontSize: 15, marginVertical: 2 },
  paragraph: { marginVertical: 4 },
  hr: { backgroundColor: '#2d2d44', height: 1, marginVertical: 8 },
});

function MessageBubbleInner({ message, isLast, onRetry, onQuoteReply }: MessageBubbleProps) {
  const t = useTranslation();
  const isUser = message.role === 'user';
  // Default to plain text for very long messages to prevent JS thread freeze
  const [textMode, setTextMode] = useState(message.content.length > 5000);

  const handleCopy = useCallback(async () => {
    if (!message.content) return;
    await Clipboard.setStringAsync(message.content);
    if (Platform.OS === 'android') {
      ToastAndroid.show(t('chat.copy'), ToastAndroid.SHORT);
    }
  }, [message.content, t]);

  const handleLongPress = useCallback(() => {
    if (!message.content || message.isStreaming) return;
    const copyLabel = t('chat.copy');
    const quoteLabel = t('chat.quoteReply');
    const cancelLabel = t('chat.cancel');

    if (Platform.OS === 'ios') {
      const options = [cancelLabel, copyLabel];
      if (onQuoteReply) options.push(quoteLabel);
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: 0 },
        (idx) => {
          if (idx === 1) handleCopy();
          else if (idx === 2 && onQuoteReply) onQuoteReply(message.content);
        },
      );
    } else {
      const buttons: Array<{ text: string; onPress?: () => void; style?: 'cancel' | 'destructive' | 'default' }> = [
        { text: copyLabel, onPress: handleCopy },
      ];
      if (onQuoteReply) {
        buttons.push({ text: quoteLabel, onPress: () => onQuoteReply(message.content) });
      }
      buttons.push({ text: cancelLabel, style: 'cancel' });
      Alert.alert('', '', buttons);
    }
  }, [message.content, message.isStreaming, handleCopy, onQuoteReply, t]);

  const markdownRules = useMemo(() => ({
    fence: (node: any, _children: any, _parent: any, _styles: any) => (
      <CodeBlock key={node.key} code={node.content} language={node.sourceInfo} />
    ),
    code_block: (node: any) => (
      <CodeBlock key={node.key} code={node.content} />
    ),
  }), []);

  // P3: Error message bubble
  if (message.isError) {
    return (
      <View style={[styles.row, styles.rowAssistant]}>
        <View style={styles.errorBubble}>
          <Ionicons name="warning" size={16} color="#ff6b6b" />
          <Text style={styles.errorText}>{message.content}</Text>
        </View>
      </View>
    );
  }

  // P0: Skill result card
  if (message.messageType === 'skill_result' && message.skillResult) {
    const sr = message.skillResult;
    const summary = sr.success
      ? JSON.stringify(sr.data ?? {}).slice(0, 200)
      : sr.error || 'Unknown error';
    return (
      <View style={[styles.row, styles.rowAssistant]}>
        <SkillCard
          skillName={sr.skillName}
          description=""
          completed
          success={sr.success}
          resultSummary={sr.success ? summary : undefined}
          error={!sr.success ? summary : undefined}
        />
      </View>
    );
  }

  return (
    <View style={[styles.row, isUser ? styles.rowUser : styles.rowAssistant]}>
      <Pressable
        onLongPress={handleLongPress}
        style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}
      >
        {/* P2: Push message badge */}
        {message.isPush && (
          <View style={styles.pushBadge}>
            <Ionicons name="notifications-outline" size={12} color="#f0a030" />
            <Text style={styles.pushBadgeText}>
              {message.source || 'Agent Push'}
            </Text>
          </View>
        )}
        {isUser ? (
          <Text selectable style={styles.userText}>{message.content}</Text>
        ) : message.isStreaming ? (
          <>
            {message.content.length > 0 && (
              <Text selectable style={styles.assistantText}>{message.content}</Text>
            )}
            <BlinkingCursor />
          </>
        ) : (
          <>
            {message.content.length > 0 ? (
              textMode ? (
                <Text selectable style={styles.assistantText}>{message.content}</Text>
              ) : (
                <Markdown style={markdownStyles} rules={markdownRules}>{message.content}</Markdown>
              )
            ) : null}
          </>
        )}
        <View style={styles.bubbleFooter}>
          <Text style={[styles.timestamp, isUser ? styles.timestampUser : styles.timestampAssistant]}>
            {formatTime(message.timestamp)}
          </Text>
          {!message.isStreaming && message.content.length > 0 && (
            <View style={styles.actionRow}>
              {!isUser && (
                <TouchableOpacity
                  onPress={() => setTextMode(!textMode)}
                  style={styles.actionBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name={textMode ? 'document-text-outline' : 'text-outline'}
                    size={14}
                    color={textMode ? '#6c63ff' : '#666'}
                  />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={handleCopy}
                style={styles.actionBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="copy-outline" size={14} color={isUser ? 'rgba(255,255,255,0.5)' : '#666'} />
              </TouchableOpacity>
              {/* P1: Retry button on last assistant message */}
              {isLast && !isUser && onRetry && (
                <TouchableOpacity
                  onPress={onRetry}
                  style={styles.actionBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="refresh-outline" size={14} color="#666" />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </Pressable>
    </View>
  );
}

const MessageBubble = React.memo(MessageBubbleInner, (prev, next) => {
  return (
    prev.message.id === next.message.id &&
    prev.message.content === next.message.content &&
    prev.message.isStreaming === next.message.isStreaming &&
    prev.isLast === next.isLast &&
    prev.onQuoteReply === next.onQuoteReply
  );
});

export default MessageBubble;

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 12,
    marginVertical: 4,
  },
  rowUser: {
    alignItems: 'flex-end',
  },
  rowAssistant: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '85%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleUser: {
    backgroundColor: '#6c63ff',
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    backgroundColor: '#1a1a2e',
    borderBottomLeftRadius: 4,
  },
  userText: {
    color: '#ffffff',
    fontSize: 15,
    lineHeight: 22,
  },
  cursor: {
    color: '#6c63ff',
    fontSize: 15,
  },
  timestamp: {
    fontSize: 11,
    marginTop: 4,
  },
  timestampUser: {
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'right',
  },
  timestampAssistant: {
    color: '#888888',
  },
  assistantText: {
    color: '#ffffff',
    fontSize: 15,
    lineHeight: 22,
  },
  bubbleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBtn: {
    padding: 2,
  },
  // P3: Error bubble
  errorBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#2d1a1a',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '85%',
    borderLeftWidth: 3,
    borderLeftColor: '#ff5252',
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
  // P2: Push badge
  pushBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: 'rgba(240, 160, 48, 0.15)',
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  pushBadgeText: {
    color: '#f0a030',
    fontSize: 11,
    fontWeight: '600',
  },
});

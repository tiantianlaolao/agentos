import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import Markdown from 'react-native-markdown-display';
import type { ChatMessage } from '../../stores/chatStore';

interface MessageBubbleProps {
  message: ChatMessage;
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

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <View style={[styles.row, isUser ? styles.rowUser : styles.rowAssistant]}>
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
        {isUser ? (
          <Text style={styles.userText}>{message.content}</Text>
        ) : (
          <>
            {message.content.length > 0 ? (
              <Markdown style={markdownStyles}>{message.content}</Markdown>
            ) : null}
            {message.isStreaming && <BlinkingCursor />}
          </>
        )}
        <Text style={[styles.timestamp, isUser ? styles.timestampUser : styles.timestampAssistant]}>
          {formatTime(message.timestamp)}
        </Text>
      </View>
    </View>
  );
}

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
});

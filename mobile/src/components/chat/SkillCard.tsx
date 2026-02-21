import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '../../i18n';

interface SkillCardProps {
  skillName: string;
  description: string;
  completed?: boolean;
  success?: boolean;
  resultSummary?: string;
  error?: string;
  collapsed?: boolean;
}

export default function SkillCard({
  skillName,
  description,
  completed = false,
  success = true,
  resultSummary,
  error,
  collapsed: initialCollapsed = true,
}: SkillCardProps) {
  const t = useTranslation();
  const pulse = useRef(new Animated.Value(0.4)).current;
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);

  useEffect(() => {
    if (completed) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [pulse, completed]);

  // Running state
  if (!completed) {
    return (
      <View style={styles.container}>
        <View style={styles.row}>
          <Animated.View style={[styles.dot, { opacity: pulse }]} />
          <Text style={styles.title}>{t('chat.skillRunning', { name: skillName })}</Text>
        </View>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
    );
  }

  // Completed state
  const borderColor = success ? '#4caf50' : '#ff5252';
  const icon = success ? 'checkmark-circle' : 'close-circle';
  const iconColor = success ? '#4caf50' : '#ff5252';
  const statusText = success
    ? t('chat.skillCompleted', { name: skillName })
    : t('chat.skillFailed', { name: skillName });
  const detail = success ? resultSummary : error;

  return (
    <View style={[styles.container, { borderLeftColor: borderColor }]}>
      <TouchableOpacity
        style={styles.row}
        onPress={() => detail && setIsCollapsed(!isCollapsed)}
        activeOpacity={detail ? 0.7 : 1}
      >
        <Ionicons name={icon} size={16} color={iconColor} style={{ marginRight: 8 }} />
        <Text style={[styles.title, { flex: 1 }]}>{statusText}</Text>
        {detail ? (
          <Ionicons
            name={isCollapsed ? 'chevron-down' : 'chevron-up'}
            size={14}
            color="#888"
          />
        ) : null}
      </TouchableOpacity>
      {detail && !isCollapsed && (
        <Text style={styles.detail} selectable>{detail}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a2e',
    borderLeftWidth: 3,
    borderLeftColor: '#6c63ff',
    borderRadius: 10,
    padding: 12,
    marginHorizontal: 12,
    marginVertical: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#6c63ff',
    marginRight: 8,
  },
  title: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  description: {
    color: '#888888',
    fontSize: 13,
    marginTop: 4,
    marginLeft: 16,
  },
  detail: {
    color: '#aaaaaa',
    fontSize: 13,
    marginTop: 8,
    marginLeft: 24,
    lineHeight: 18,
  },
});

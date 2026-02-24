import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import { useTranslation } from '../../i18n';

const DOT_SIZE = 8;
const BOUNCE_HEIGHT = -8;
const DURATION = 400;
const STAGGER = 150;

function BouncingDot({ delay }: { delay: number }) {
  const translateY = useSharedValue(0);

  useEffect(() => {
    translateY.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(BOUNCE_HEIGHT, { duration: DURATION }),
          withTiming(0, { duration: DURATION }),
        ),
        -1, // infinite
      ),
    );
  }, [delay, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View style={[styles.dot, animatedStyle]} />;
}

export default function ThinkingBubble() {
  const t = useTranslation();

  return (
    <View style={styles.row}>
      <View style={styles.bubble}>
        <View style={styles.dotsContainer}>
          <BouncingDot delay={0} />
          <BouncingDot delay={STAGGER} />
          <BouncingDot delay={STAGGER * 2} />
        </View>
        <Text style={styles.thinkingText}>{t('chat.thinking')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 12,
    marginVertical: 4,
    alignItems: 'flex-start',
  },
  bubble: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 12,
    maxWidth: '85%',
    alignItems: 'center',
    gap: 6,
  },
  dotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 20,
    justifyContent: 'center',
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: '#6c63ff',
  },
  thinkingText: {
    color: '#888888',
    fontSize: 12,
  },
});

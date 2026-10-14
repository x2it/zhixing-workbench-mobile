/**
 * 知行工作台 - 优雅加载页
 * 理念：知行合一 — 知是行之始，行是知之成
 * 设计：深空背景 + 微妙光圈 + 极简排版
 */

import React, { useEffect, useMemo } from 'react';
import { View, Text, Animated, StyleSheet, Easing, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DaviTheme } from '@/utils/daviTheme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const RING_SIZE = 64;
const BAR_WIDTH = 120;
const BAR_HEIGHT = 2;

interface LoadingScreenProps {
  visible?: boolean;
}

export default function LoadingScreen({ visible = true }: LoadingScreenProps) {
  const insets = useSafeAreaInsets();
  const fadeAnim = useMemo(() => new Animated.Value(0), []);
  const rotateAnim = useMemo(() => new Animated.Value(0), []);
  const barAnim = useMemo(() => new Animated.Value(0), []);
  const textFade = useMemo(() => new Animated.Value(0), []);

  const rotateInterpolation = useMemo(() => rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  }), [rotateAnim]);

  const barTranslateX = useMemo(() => barAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-BAR_WIDTH, SCREEN_WIDTH],
  }), [barAnim]);

  useEffect(() => {
    // 入场淡入
    Animated.sequence([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      // 文字延迟淡入
      Animated.timing(textFade, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    // 光圈旋转动画
    Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 3000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    // 加载条往复动画
    Animated.loop(
      Animated.sequence([
        Animated.timing(barAnim, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(barAnim, {
          toValue: 0,
          duration: 1500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  if (!visible) return null;

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        {/* 顶部留白区域 */}
        <View style={{ flex: 1 }} />

        {/* 旋转光圈 */}
        <View style={styles.ringContainer}>
          <Animated.View
            style={[
              styles.ring,
              { transform: [{ rotate: rotateInterpolation }] },
            ]}
          >
            <View style={styles.ringHighlight} />
          </Animated.View>
          <View style={styles.ringInner} />
        </View>

        {/* 品牌名 */}
        <Animated.Text style={[styles.title, { opacity: textFade }]}>
          知行工作台
        </Animated.Text>

        {/* 标语 */}
        <Animated.Text style={[styles.tagline, { opacity: textFade }]}>
          知是行之始 · 行是知之成
        </Animated.Text>

        {/* 底部留白 */}
        <View style={{ flex: 1 }} />

        {/* 加载条 */}
        <View style={styles.barTrack}>
          <Animated.View
            style={[
              styles.barFill,
              { transform: [{ translateX: barTranslateX }] },
            ]}
          />
        </View>

        {/* 底部安全间距 */}
        <View style={{ height: 40 }} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
    overflow: 'hidden',
    backgroundColor: DaviTheme.colors.background,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringContainer: {
    width: RING_SIZE,
    height: RING_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 28,
  },
  ring: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 1.5,
    borderColor: 'rgba(59, 130, 246, 0.15)',
  },
  ringHighlight: {
    position: 'absolute',
    top: -1.5,
    left: RING_SIZE / 2 - 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: DaviTheme.colors.primary,
    shadowColor: DaviTheme.colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 6,
  },
  ringInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(59, 130, 246, 0.3)',
  },
  title: {
    fontSize: 22,
    fontWeight: '300',
    color: DaviTheme.colors.textSecondary,
    letterSpacing: 8,
    marginBottom: 10,
  },
  tagline: {
    fontSize: 12,
    fontWeight: '300',
    color: DaviTheme.colors.textMuted,
    letterSpacing: 3,
  },
  barTrack: {
    width: SCREEN_WIDTH,
    height: BAR_HEIGHT,
    backgroundColor: 'rgba(148, 163, 184, 0.05)',
    overflow: 'hidden',
  },
  barFill: {
    width: BAR_WIDTH,
    height: BAR_HEIGHT,
    backgroundColor: 'rgba(59, 130, 246, 0.4)',
  },
});
import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ToastBannerProps {
  message: string | null;
  onHide: () => void;
  durationMs?: number;
}

export const ToastBanner: React.FC<ToastBannerProps> = ({
  message,
  onHide,
  durationMs = 2600,
}) => {
  const [opacity] = useState(() => new Animated.Value(0));
  const [translateY] = useState(() => new Animated.Value(16));
  const onHideRef = useRef(onHide);

  useEffect(() => {
    onHideRef.current = onHide;
  }, [onHide]);

  useEffect(() => {
    if (!message) return;

    opacity.setValue(0);
    translateY.setValue(16);

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 12,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start(() => {
        onHideRef.current();
      });
    }, durationMs);

    return () => clearTimeout(timer);
  }, [message, durationMs, opacity, translateY]);

  if (!message) return null;

  return (
    <View pointerEvents="none" style={styles.wrapper}>
      <Animated.View
        style={[
          styles.toast,
          {
            opacity,
            transform: [{ translateY }],
          },
        ]}>
        <Ionicons name="checkmark-circle" size={18} color="#34d399" />
        <Text style={styles.toastText} numberOfLines={2}>
          {message}
        </Text>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 24,
    alignItems: 'center',
    zIndex: 999,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: 'rgba(6, 78, 59, 0.96)',
    borderColor: 'rgba(52, 211, 153, 0.5)',
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  toastText: {
    flexShrink: 1,
    color: '#ecfdf5',
    fontSize: 13,
    fontWeight: '600',
  },
});

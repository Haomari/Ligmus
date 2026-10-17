import React, { useEffect } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { LibrusProvider } from '@/context/LibrusContext';
import {
  addNotificationResponseListener,
  registerBackgroundSyncAsync,
  setupNotificationChannelAsync,
} from '@/services/backgroundSync';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();

  useEffect(() => {
    setupNotificationChannelAsync();
    registerBackgroundSyncAsync(30);

    const cleanup = addNotificationResponseListener((url) => {
      router.push(url as any);
    });

    return () => {
      cleanup?.();
    };
  }, [router]);

  return (
    <SafeAreaProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <LibrusProvider>
          <AnimatedSplashOverlay />
          <AppTabs />
        </LibrusProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

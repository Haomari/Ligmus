import React, { useEffect, useState } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { LibrusProvider } from '@/context/LibrusContext';
import {
  addNotificationResponseListener,
  getInitialNotificationUrlAsync,
  syncBackgroundRegistrationWithSettings,
} from '@/services/backgroundSync';
import { checkForAppUpdate, UpdateCheckResult } from '@/services/updateService';
import { UpdateModal } from '@/components/update-modal';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const [availableUpdate, setAvailableUpdate] = useState<UpdateCheckResult | null>(null);

  useEffect(() => {
    let mounted = true;
    syncBackgroundRegistrationWithSettings();

    getInitialNotificationUrlAsync().then((initialUrl) => {
      if (mounted && initialUrl) {
        router.push(initialUrl as any);
      }
    });

    const cleanup = addNotificationResponseListener((url) => {
      router.push(url as any);
    });

    return () => {
      mounted = false;
      cleanup?.();
    };
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      checkForAppUpdate()
        .then((res) => {
          if (!cancelled && res.updateAvailable) {
            setAvailableUpdate(res);
          }
        })
        .catch(() => {
          // Silent fail on startup offline/rate-limit
        });
    }, 1500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  return (
    <SafeAreaProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <LibrusProvider>
          <AnimatedSplashOverlay />
          <AppTabs />
          <UpdateModal
            visible={Boolean(availableUpdate)}
            updateInfo={availableUpdate}
            onClose={() => setAvailableUpdate(null)}
          />
        </LibrusProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

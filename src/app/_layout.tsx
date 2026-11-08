import React, { useEffect, useState } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import {
  CredentialsUpdateModal,
  CredentialsWarningBanner,
} from '@/components/credentials-modal';
import { LibrusProvider, useLibrus } from '@/context/LibrusContext';
import {
  addNotificationResponseListener,
  getInitialNotificationUrlAsync,
  syncBackgroundRegistrationWithSettings,
} from '@/services/backgroundSync';
import { checkForAppUpdate, UpdateCheckResult } from '@/services/updateService';
import { getAutoUpdateEnabled, saveAutoUpdateEnabled } from '@/services/fileCache';
import { UpdateModal } from '@/components/update-modal';

SplashScreen.preventAutoHideAsync();

function NotificationNavigationBridge() {
  const router = useRouter();
  const { openCredentialsModal } = useLibrus();

  useEffect(() => {
    let mounted = true;
    syncBackgroundRegistrationWithSettings();

    const navigateOrOpenReauth = (url: string) => {
      if (url.includes('reauth=1')) {
        openCredentialsModal();
      } else {
        router.push(url as any);
      }
    };

    getInitialNotificationUrlAsync().then((initialUrl) => {
      if (mounted && initialUrl) {
        navigateOrOpenReauth(initialUrl);
      }
    });

    const cleanup = addNotificationResponseListener((url) => {
      navigateOrOpenReauth(url);
    });

    return () => {
      mounted = false;
      cleanup?.();
    };
  }, [openCredentialsModal, router]);

  return null;
}

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const [availableUpdate, setAvailableUpdate] = useState<UpdateCheckResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!getAutoUpdateEnabled()) {
        return;
      }
      checkForAppUpdate()
        .then((res) => {
          if (!cancelled && res.updateAvailable && getAutoUpdateEnabled()) {
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
          <NotificationNavigationBridge />
          <AnimatedSplashOverlay />
          <View style={{ flex: 1, backgroundColor: '#0f172a' }}>
            <CredentialsWarningBanner />
            <View style={{ flex: 1 }}>
              <AppTabs />
            </View>
          </View>
          <CredentialsUpdateModal />
          <UpdateModal
            visible={Boolean(availableUpdate)}
            updateInfo={availableUpdate}
            triggerSource="auto"
            onDisableAutoUpdate={() => saveAutoUpdateEnabled(false)}
            onClose={() => setAvailableUpdate(null)}
          />
        </LibrusProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

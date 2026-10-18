import React, { useState } from 'react';
import { Tabs, usePathname } from 'expo-router';
import { StyleSheet, Text, useColorScheme, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import { useLibrus } from '@/context/LibrusContext';
import { BurgerMenuModal } from './burger-menu-modal';

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const { unreadMessagesCount, hasLowSubjectAttendance } = useLibrus();
  const [menuVisible, setMenuVisible] = useState(false);

  const bottomInset = Math.max(insets.bottom, 8);
  const isMenuRouteActive =
    pathname === '/settings' ||
    pathname === '/messages' ||
    pathname === '/attendance' ||
    menuVisible;

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#3b82f6',
          tabBarInactiveTintColor: colors.textSecondary,
          tabBarStyle: {
            backgroundColor: colors.background,
            borderTopColor: colors.backgroundElement,
            elevation: 8,
            height: 54 + bottomInset,
            paddingBottom: bottomInset,
            paddingTop: 6,
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '600',
          },
        }}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'Pulpit',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="grades"
          options={{
            title: 'Oceny',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'ribbon' : 'ribbon-outline'} size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="timetable"
          options={{
            title: 'Plan lekcji',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'calendar' : 'calendar-outline'} size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          listeners={{
            tabPress: (e) => {
              e.preventDefault();
              setMenuVisible((prev) => !prev);
            },
          }}
          options={{
            title: 'Menu',
            tabBarLabel: ({ color }) => (
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '600',
                  color: isMenuRouteActive ? '#3b82f6' : color,
                }}>
                Menu
              </Text>
            ),
            tabBarIcon: ({ color }) => {
              const iconColor = isMenuRouteActive ? '#3b82f6' : color;
              return (
                <View style={styles.menuIconWrap}>
                  <Ionicons
                    name={isMenuRouteActive ? 'menu' : 'menu-outline'}
                    size={24}
                    color={iconColor}
                  />
                  {(unreadMessagesCount > 0 || hasLowSubjectAttendance) && (
                    <View
                      style={[
                        styles.badgeDot,
                        {
                          backgroundColor:
                            unreadMessagesCount > 0 ? '#3b82f6' : '#ef4444',
                        },
                      ]}
                    />
                  )}
                </View>
              );
            },
          }}
        />
        <Tabs.Screen
          name="messages"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="attendance"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="explore"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="login"
          options={{
            href: null,
          }}
        />
      </Tabs>

      <BurgerMenuModal
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  menuIconWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeDot: {
    position: 'absolute',
    top: -1,
    right: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#0f172a',
  },
});

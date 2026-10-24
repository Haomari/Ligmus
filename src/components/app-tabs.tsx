import React, { useState } from 'react';
import { Tabs } from 'expo-router';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { RIGHT_RAIL_WIDTH, WIDE_LAYOUT_BREAKPOINT } from '@/constants/layout';
import { useLibrus } from '@/context/LibrusContext';
import { BurgerMenuModal } from './burger-menu-modal';

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { width: windowWidth } = useWindowDimensions();
  const { unreadMessagesCount, subjectAttendanceAlert } = useLibrus();
  const [menuVisible, setMenuVisible] = useState(false);

  const isWideScreen = windowWidth >= WIDE_LAYOUT_BREAKPOINT;
  const menuDotColor =
    subjectAttendanceAlert === 'danger'
      ? '#ef4444'
      : unreadMessagesCount > 0
        ? '#3b82f6'
        : subjectAttendanceAlert === 'warning'
          ? '#f59e0b'
          : null;

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarPosition: isWideScreen ? 'right' : 'bottom',
        }}
        tabBar={({ state, navigation, insets }) => {
          const activeRouteName = state.routes[state.index]?.name ?? 'index';
          if (activeRouteName === 'login') {
            return null;
          }

          const isMenuRouteActive =
            activeRouteName === 'settings' ||
            activeRouteName === 'messages' ||
            activeRouteName === 'attendance' ||
            menuVisible;

          const navItems = [
            {
              key: 'index',
              railLabel: 'Pulpit',
              bottomLabel: 'Pulpit',
              active: activeRouteName === 'index',
              icon: 'home-outline' as const,
              activeIcon: 'home' as const,
            },
            {
              key: 'grades',
              railLabel: 'Oceny',
              bottomLabel: 'Oceny',
              active: activeRouteName === 'grades',
              icon: 'ribbon-outline' as const,
              activeIcon: 'ribbon' as const,
            },
            {
              key: 'timetable',
              railLabel: 'Plan',
              bottomLabel: 'Plan lekcji',
              active: activeRouteName === 'timetable',
              icon: 'calendar-outline' as const,
              activeIcon: 'calendar' as const,
            },
          ];

          const handleSelectRoute = (routeName: string) => {
            const targetRoute = state.routes.find((r) => r.name === routeName);
            if (!targetRoute) return;

            const event = navigation.emit({
              type: 'tabPress',
              target: targetRoute.key,
              canPreventDefault: true,
            });

            if (!event.defaultPrevented && activeRouteName !== routeName) {
              navigation.navigate(targetRoute.name, targetRoute.params);
            }
          };

          if (isWideScreen) {
            return (
              <View
                style={[
                  styles.rightRail,
                  {
                    paddingTop: Math.max(insets.top, 12),
                    paddingBottom: Math.max(insets.bottom, 12) + 115,
                  },
                ]}>
                <View style={styles.railButtonsCluster}>
                  {navItems.map((item) => {
                    const color = item.active ? '#3b82f6' : '#94a3b8';
                    return (
                      <TouchableOpacity
                        key={item.key}
                        activeOpacity={0.8}
                        onPress={() => handleSelectRoute(item.key)}
                        style={[
                          styles.railBtn,
                          item.active && styles.railBtnActive,
                        ]}>
                        <Ionicons
                          name={item.active ? item.activeIcon : item.icon}
                          size={22}
                          color={color}
                        />
                        <Text
                          style={[
                            styles.railLabel,
                            { color },
                            item.active && styles.railLabelActive,
                          ]}
                          numberOfLines={1}>
                          {item.railLabel}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}

                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setMenuVisible((prev) => !prev)}
                    style={[
                      styles.railBtn,
                      isMenuRouteActive && styles.railBtnActive,
                    ]}>
                    <View style={styles.menuIconWrap}>
                      <Ionicons
                        name={isMenuRouteActive ? 'menu' : 'menu-outline'}
                        size={24}
                        color={isMenuRouteActive ? '#3b82f6' : '#94a3b8'}
                      />
                      {menuDotColor && (
                        <View
                          style={[
                            styles.badgeDot,
                            { backgroundColor: menuDotColor },
                          ]}
                        />
                      )}
                    </View>
                    <Text
                      style={[
                        styles.railLabel,
                        { color: isMenuRouteActive ? '#3b82f6' : '#94a3b8' },
                        isMenuRouteActive && styles.railLabelActive,
                      ]}
                      numberOfLines={1}>
                      Menu
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }

          const bottomInset = Math.max(insets.bottom, 8);
          return (
            <View
              style={[
                styles.bottomBar,
                {
                  backgroundColor: colors.background,
                  borderTopColor: colors.backgroundElement,
                  height: 54 + bottomInset,
                  paddingBottom: bottomInset,
                },
              ]}>
              {navItems.map((item) => {
                const color = item.active ? '#3b82f6' : colors.textSecondary;
                return (
                  <TouchableOpacity
                    key={item.key}
                    activeOpacity={0.8}
                    onPress={() => handleSelectRoute(item.key)}
                    style={styles.bottomTabBtn}>
                    <Ionicons
                      name={item.active ? item.activeIcon : item.icon}
                      size={22}
                      color={color}
                    />
                    <Text style={[styles.bottomTabLabel, { color }]} numberOfLines={1}>
                      {item.bottomLabel}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setMenuVisible((prev) => !prev)}
                style={styles.bottomTabBtn}>
                <View style={styles.menuIconWrap}>
                  <Ionicons
                    name={isMenuRouteActive ? 'menu' : 'menu-outline'}
                    size={24}
                    color={isMenuRouteActive ? '#3b82f6' : colors.textSecondary}
                  />
                  {menuDotColor && (
                    <View
                      style={[
                        styles.badgeDot,
                        { backgroundColor: menuDotColor },
                      ]}
                    />
                  )}
                </View>
                <Text
                  style={[
                    styles.bottomTabLabel,
                    { color: isMenuRouteActive ? '#3b82f6' : colors.textSecondary },
                  ]}
                  numberOfLines={1}>
                  Menu
                </Text>
              </TouchableOpacity>
            </View>
          );
        }}>
        <Tabs.Screen name="index" options={{ title: 'Pulpit' }} />
        <Tabs.Screen name="grades" options={{ title: 'Oceny' }} />
        <Tabs.Screen name="timetable" options={{ title: 'Plan lekcji' }} />
        <Tabs.Screen name="settings" options={{ title: 'Menu' }} />
        <Tabs.Screen name="messages" options={{ href: null }} />
        <Tabs.Screen name="attendance" options={{ href: null }} />
        <Tabs.Screen name="login" options={{ href: null }} />
      </Tabs>

      <BurgerMenuModal
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 6,
    elevation: 8,
  },
  bottomTabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  bottomTabLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  rightRail: {
    width: RIGHT_RAIL_WIDTH,
    backgroundColor: '#090f1d',
    borderLeftWidth: 1,
    borderLeftColor: '#1e293b',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  railButtonsCluster: {
    width: '100%',
    gap: 10,
    alignItems: 'center',
  },
  railBtn: {
    width: 64,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  railBtnActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.14)',
    borderColor: 'rgba(59, 130, 246, 0.4)',
  },
  railLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  railLabelActive: {
    fontWeight: '700',
  },
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

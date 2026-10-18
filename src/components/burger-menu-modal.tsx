import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLibrus } from '@/context/LibrusContext';

interface BurgerMenuModalProps {
  visible: boolean;
  onClose: () => void;
}

export const BurgerMenuModal: React.FC<BurgerMenuModalProps> = ({
  visible,
  onClose,
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { unreadMessagesCount, hasLowSubjectAttendance, student } = useLibrus();

  // Dynamic width bounded by min (324px) and max (460px), adapting to folded & unfolded screens
  const dynamicSheetWidth = Math.min(
    Math.max(Math.round(windowWidth * 0.86), 324),
    Math.min(460, windowWidth - 24)
  );

  const navigateTo = (route: string) => {
    onClose();
    setTimeout(() => {
      router.push(route as any);
    }, 60);
  };

  const menuItems = [
    {
      key: 'messages',
      route: '/messages',
      title: 'Wiadomości',
      subtitle: 'Odebrane, wysłane i usprawiedliwienia',
      icon: 'mail-outline' as const,
      activeIcon: 'mail' as const,
      color: '#38bdf8',
      badge:
        unreadMessagesCount > 0
          ? `${unreadMessagesCount} ${unreadMessagesCount === 1 ? 'nowa' : 'nowe'}`
          : null,
      badgeColor: '#3b82f6',
    },
    {
      key: 'attendance',
      route: '/attendance',
      title: 'Frekwencja',
      subtitle: 'Przedmioty, semestry i próg 50%',
      icon: 'pie-chart-outline' as const,
      activeIcon: 'pie-chart' as const,
      color: '#10b981',
      badge: hasLowSubjectAttendance ? 'Uwaga <60%' : null,
      badgeColor: '#ef4444',
    },
    {
      key: 'settings',
      route: '/settings',
      title: 'Ustawienia',
      subtitle: 'Powiadomienia, szablony i pamięć',
      icon: 'settings-outline' as const,
      activeIcon: 'settings' as const,
      color: '#a855f7',
      badge: null,
      badgeColor: '#64748b',
    },
  ];

  const bottomOffset = Math.max(insets.bottom, 8) + 64;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            {
              bottom: bottomOffset,
              width: dynamicSheetWidth,
            },
          ]}
          onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHeader}>
            <View style={styles.sheetHeaderLeft}>
              <Text style={styles.sheetTitle}>Menu Ligmus</Text>
              {student?.name ? (
                <Text style={styles.sheetSubtitle} numberOfLines={1}>
                  {student.name} {student.classGroup ? `• ${student.classGroup}` : ''}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={10}
              style={styles.closeBtn}>
              <Ionicons name="close" size={19} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          <View style={styles.itemsList}>
            {menuItems.map((item) => {
              const isActive = pathname === item.route;
              return (
                <TouchableOpacity
                  key={item.key}
                  activeOpacity={0.82}
                  onPress={() => navigateTo(item.route)}
                  style={[
                    styles.menuItem,
                    isActive && styles.menuItemActive,
                  ]}>
                  <View
                    style={[
                      styles.iconBox,
                      {
                        backgroundColor: `${item.color}1F`,
                        borderColor: `${item.color}4D`,
                      },
                    ]}>
                    <Ionicons
                      name={isActive ? item.activeIcon : item.icon}
                      size={22}
                      color={item.color}
                    />
                  </View>

                  <View style={styles.itemTextCol}>
                    <View style={styles.itemTitleRow}>
                      <Text
                        style={[
                          styles.itemTitle,
                          isActive && styles.itemTitleActive,
                        ]}
                        numberOfLines={1}>
                        {item.title}
                      </Text>
                      {item.badge ? (
                        <View
                          style={[
                            styles.badgePill,
                            { backgroundColor: item.badgeColor },
                          ]}>
                          <Text style={styles.badgeText}>{item.badge}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.itemSubtitle} numberOfLines={1}>
                      {item.subtitle}
                    </Text>
                  </View>

                  <View style={styles.chevronWrap}>
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={isActive ? '#38bdf8' : '#64748b'}
                    />
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.65)',
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
  },
  sheet: {
    minWidth: 320,
    maxWidth: 460,
    backgroundColor: '#0f172a',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingBottom: 12,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  sheetHeaderLeft: {
    flex: 1,
    paddingRight: 8,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#f8fafc',
    letterSpacing: 0.2,
  },
  sheetSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemsList: {
    gap: 10,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 16,
    paddingVertical: 13,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 12,
  },
  menuItemActive: {
    borderColor: '#38bdf8',
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemTextCol: {
    flex: 1,
    paddingRight: 4,
  },
  itemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f8fafc',
  },
  itemTitleActive: {
    color: '#38bdf8',
  },
  itemSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 3,
  },
  badgePill: {
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 999,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
  },
  chevronWrap: {
    width: 20,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
});

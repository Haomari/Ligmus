import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ActivityFeedItem, ActivityItemKind } from '@/types/librus';

type FilterKey = 'all' | 'grade' | 'message' | 'announcement' | 'attendance' | 'schedule';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Wszystkie' },
  { key: 'grade', label: 'Oceny' },
  { key: 'message', label: 'Wiadomości' },
  { key: 'announcement', label: 'Ogłoszenia' },
  { key: 'attendance', label: 'Frekwencja' },
  { key: 'schedule', label: 'Plan i testy' },
];

export function getActivityKindMeta(kind: ActivityItemKind): {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
} {
  switch (kind) {
    case 'grade':
      return { label: 'Ocena', icon: 'school-outline' };
    case 'message':
      return { label: 'Wiadomość', icon: 'mail-unread-outline' };
    case 'announcement':
      return { label: 'Ogłoszenie', icon: 'megaphone-outline' };
    case 'attendance':
      return { label: 'Frekwencja', icon: 'pie-chart-outline' };
    case 'timetable':
      return { label: 'Plan lekcji', icon: 'swap-horizontal-outline' };
    case 'terminarz':
      return { label: 'Terminarz', icon: 'calendar-outline' };
  }
}

function formatShortDate(dateIso: string): string {
  if (!dateIso) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
    return `${dateIso.slice(8, 10)}.${dateIso.slice(5, 7)}`;
  }
  return dateIso.slice(0, 10);
}

interface ActivityEventCardProps {
  item: ActivityFeedItem;
  onPress: (item: ActivityFeedItem) => void;
  wideHalf?: boolean;
}

export const ActivityEventCard: React.FC<ActivityEventCardProps> = ({
  item,
  onPress,
  wideHalf,
}) => {
  const meta = getActivityKindMeta(item.kind);
  const showTextBadge =
    item.kind === 'grade' || item.kind === 'attendance' || item.kind === 'terminarz';

  return (
    <TouchableOpacity
      activeOpacity={0.82}
      onPress={() => onPress(item)}
      style={[styles.eventCard, wideHalf && styles.eventCardWide]}>
      <View
        style={[
          styles.eventBadge,
          {
            backgroundColor: `${item.accentColor}1F`,
            borderColor: `${item.accentColor}55`,
          },
        ]}>
        {showTextBadge && item.badgeText ? (
          <Text
            style={[
              styles.eventBadgeText,
              item.badgeText.length > 3 && { fontSize: 11 },
              { color: item.accentColor },
            ]}
            numberOfLines={1}>
            {item.badgeText}
          </Text>
        ) : (
          <Ionicons name={meta.icon} size={18} color={item.accentColor} />
        )}
      </View>

      <View style={styles.eventInfo}>
        <View style={styles.eventTopRow}>
          <Text style={styles.eventTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.eventDate}>{formatShortDate(item.date)}</Text>
        </View>
        <View style={styles.eventBottomRow}>
          <Text style={styles.eventSubtitle} numberOfLines={1}>
            {item.subtitle}
          </Text>
          <View
            style={[
              styles.kindPill,
              {
                backgroundColor: `${item.accentColor}17`,
                borderColor: `${item.accentColor}40`,
              },
            ]}>
            <Text style={[styles.kindPillText, { color: item.accentColor }]}>
              {meta.label}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
};

interface ActivityFeedModalProps {
  visible: boolean;
  items: ActivityFeedItem[];
  onClose: () => void;
  onSelectItem: (item: ActivityFeedItem) => void;
}

export const ActivityFeedModal: React.FC<ActivityFeedModalProps> = ({
  visible,
  items,
  onClose,
  onSelectItem,
}) => {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<FilterKey>('all');

  const [sheetTranslateY] = useState(() => new Animated.Value(Dimensions.get('window').height));
  const [backdropOpacity] = useState(() => new Animated.Value(0));
  const isClosingRef = useRef(false);
  const scrollYRef = useRef(0);
  const gestureStartRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (visible) {
      isClosingRef.current = false;
      scrollYRef.current = 0;
      const winH = Dimensions.get('window').height;
      sheetTranslateY.setValue(winH);
      backdropOpacity.setValue(0);

      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 210,
          useNativeDriver: true,
        }),
        Animated.spring(sheetTranslateY, {
          toValue: 0,
          damping: 24,
          stiffness: 240,
          mass: 0.85,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, backdropOpacity, sheetTranslateY]);

  const animateClose = useCallback(
    (afterClose?: () => void) => {
      if (isClosingRef.current) return;
      isClosingRef.current = true;
      const winH = Dimensions.get('window').height;
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(sheetTranslateY, {
          toValue: winH,
          duration: 210,
          useNativeDriver: true,
        }),
      ]).start(() => {
        isClosingRef.current = false;
        onClose();
        if (afterClose) {
          afterClose();
        }
      });
    },
    [backdropOpacity, onClose, sheetTranslateY]
  );

  const filteredItems = useMemo(() => {
    if (filter === 'all') return items;
    if (filter === 'schedule') {
      return items.filter((it) => it.kind === 'timetable' || it.kind === 'terminarz');
    }
    return items.filter((it) => it.kind === filter);
  }, [items, filter]);

  const handleSelectItem = useCallback(
    (item: ActivityFeedItem) => {
      animateClose(() => onSelectItem(item));
    },
    [animateClose, onSelectItem]
  );

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => animateClose()}>
      <View style={styles.overlay}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => animateClose()} />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            {
              marginTop: Math.max(insets.top + 8, 28),
              paddingBottom: Math.max(insets.bottom + 16, 24),
              transform: [{ translateY: sheetTranslateY }],
            },
          ]}
          onStartShouldSetResponderCapture={(e) => {
            gestureStartRef.current = {
              x: e.nativeEvent.pageX,
              y: e.nativeEvent.pageY,
            };
            return false;
          }}
          onMoveShouldSetResponderCapture={(e) => {
            const dx = e.nativeEvent.pageX - gestureStartRef.current.x;
            const dy = e.nativeEvent.pageY - gestureStartRef.current.y;
            return dy > 12 && dy > Math.abs(dx) * 1.35 && scrollYRef.current <= 2;
          }}
          onResponderMove={(e) => {
            const dy = e.nativeEvent.pageY - gestureStartRef.current.y;
            if (dy > 0) {
              sheetTranslateY.setValue(dy);
            }
          }}
          onResponderRelease={(e) => {
            const dy = e.nativeEvent.pageY - gestureStartRef.current.y;
            if (dy > 95) {
              animateClose();
            } else {
              Animated.spring(sheetTranslateY, {
                toValue: 0,
                useNativeDriver: true,
                bounciness: 5,
              }).start();
            }
          }}
          onResponderTerminate={() => {
            Animated.spring(sheetTranslateY, {
              toValue: 0,
              useNativeDriver: true,
            }).start();
          }}>
          <View style={styles.dragHandleArea}>
            <View style={styles.dragPill} />
          </View>

          <View style={styles.headerRow}>
            <View style={styles.headerTitleCol}>
              <Text style={styles.headerTitle}>Ostatnia aktywność</Text>
              <Text style={styles.headerSubtitle}>
                Zapisywana lokalnie historia bieżących zmian ({filteredItems.length})
              </Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => animateClose()}
              style={styles.closeBtn}>
              <Ionicons name="close" size={20} color="#cbd5e1" />
            </TouchableOpacity>
          </View>

          <View style={styles.filterWrap}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterScroll}>
              {FILTERS.map((f) => {
                const active = filter === f.key;
                return (
                  <TouchableOpacity
                    key={f.key}
                    activeOpacity={0.85}
                    onPress={() => setFilter(f.key)}
                    style={[styles.filterChip, active && styles.filterChipActive]}>
                    <Text
                      style={[
                        styles.filterChipText,
                        active && styles.filterChipTextActive,
                      ]}>
                      {f.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          <ScrollView
            style={styles.listScroll}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={(e) => {
              scrollYRef.current = e.nativeEvent.contentOffset.y;
            }}>
            {filteredItems.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="sparkles-outline" size={28} color="#64748b" />
                <Text style={styles.emptyTitle}>Brak zapisanych wydarzeń</Text>
                <Text style={styles.emptyDesc}>
                  Gdy pojawią się nowe oceny, wiadomości, ogłoszenia, wpisy frekwencji lub
                  sprawdziany, zostaną automatycznie zapisane na tej liście.
                </Text>
              </View>
            ) : (
              filteredItems.map((item) => (
                <ActivityEventCard
                  key={item.id}
                  item={item}
                  onPress={handleSelectItem}
                />
              ))
            )}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(2, 6, 23, 0.78)',
  },
  sheet: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderTopWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
  },
  dragHandleArea: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  dragPill: {
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#475569',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 12,
    gap: 12,
  },
  headerTitleCol: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#f8fafc',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterWrap: {
    paddingHorizontal: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  filterScroll: {
    gap: 8,
    paddingRight: 4,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  filterChipActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.22)',
    borderColor: '#3b82f6',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#cbd5e1',
  },
  filterChipTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  listScroll: {
    flex: 1,
  },
  listContent: {
    padding: 18,
    gap: 10,
  },
  emptyBox: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 24,
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f1f5f9',
  },
  emptyDesc: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 19,
  },
  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  eventCardWide: {
    width: '48.8%',
  },
  eventBadge: {
    width: 40,
    height: 40,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    paddingHorizontal: 3,
  },
  eventBadgeText: {
    fontSize: 15,
    fontWeight: '800',
  },
  eventInfo: {
    flex: 1,
    gap: 4,
  },
  eventTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  eventBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  eventTitle: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: '700',
    color: '#f8fafc',
  },
  eventDate: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
  },
  eventSubtitle: {
    flex: 1,
    fontSize: 12,
    color: '#94a3b8',
  },
  kindPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    flexShrink: 0,
  },
  kindPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
});

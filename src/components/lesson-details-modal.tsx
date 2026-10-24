import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  GestureResponderEvent,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  Vibration,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { TimetableLesson } from '@/types/librus';
import { decodeHtmlEntities } from '@/utils/html';
import { getSubjectColor } from '@/utils/subjectColors';
import {
  AttendanceIcon,
  getAttendanceBadgeConfig,
} from './timetable/AttendanceIcon';

interface LessonDetailsModalProps {
  visible: boolean;
  dayLabel: string;
  lessons: TimetableLesson[];
  initialIndex: number;
  onClose: () => void;
}

function getLessonAccentColor(lesson: TimetableLesson): string {
  if (lesson.isCancelled) return '#ef4444';
  return getSubjectColor(lesson.subject);
}

export const LessonDetailsModal: React.FC<LessonDetailsModalProps> = ({
  visible,
  dayLabel,
  lessons,
  initialIndex,
  onClose,
}) => {
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const validatedInitialIndex = Math.min(
    Math.max(initialIndex, 0),
    Math.max(lessons.length - 1, 0)
  );
  const [currentIndex, setCurrentIndex] = useState(validatedInitialIndex);
  const currentIndexRef = useRef(validatedInitialIndex);
  const flatListRef = useRef<FlatList<TimetableLesson>>(null);

  const translateY = useRef(new Animated.Value(0)).current;
  const dragStartYRef = useRef(0);

  const triggerHaptic = () => {
    try {
      Vibration.vibrate(14);
    } catch {
      // Ignore vibration errors
    }
  };

  useEffect(() => {
    if (visible && lessons.length > 0) {
      const idx = Math.min(Math.max(initialIndex, 0), lessons.length - 1);
      setCurrentIndex(idx);
      currentIndexRef.current = idx;
      translateY.setValue(0);
      setTimeout(() => {
        flatListRef.current?.scrollToOffset({
          offset: idx * SCREEN_WIDTH,
          animated: false,
        });
      }, 50);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initialIndex, lessons.length, translateY]);

  useEffect(() => {
    if (visible && lessons.length > 0) {
      const idx = Math.min(Math.max(currentIndexRef.current, 0), lessons.length - 1);
      setTimeout(() => {
        flatListRef.current?.scrollToOffset({
          offset: idx * SCREEN_WIDTH,
          animated: false,
        });
      }, 40);
    }
  }, [SCREEN_WIDTH, visible, lessons.length]);

  const handleDragStart = (e: GestureResponderEvent) => {
    dragStartYRef.current = e.nativeEvent.pageY;
  };

  const handleDragMove = (e: GestureResponderEvent) => {
    const dy = e.nativeEvent.pageY - dragStartYRef.current;
    if (dy > 0) {
      translateY.setValue(dy);
    }
  };

  const handleDragRelease = (e: GestureResponderEvent) => {
    const dy = e.nativeEvent.pageY - dragStartYRef.current;
    if (dy > 90) {
      Animated.timing(translateY, {
        toValue: 600,
        duration: 180,
        useNativeDriver: true,
      }).start(() => {
        onClose();
        translateY.setValue(0);
      });
    } else {
      Animated.spring(translateY, {
        toValue: 0,
        bounciness: 4,
        useNativeDriver: true,
      }).start();
    }
  };

  const handleCardScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (lessons.length === 0) return;
    const offsetX = e.nativeEvent.contentOffset.x;
    const newIndex = Math.round(offsetX / SCREEN_WIDTH);
    const safeNewIndex = Math.min(Math.max(newIndex, 0), lessons.length - 1);
    if (safeNewIndex !== currentIndexRef.current) {
      currentIndexRef.current = safeNewIndex;
      setCurrentIndex(safeNewIndex);
      triggerHaptic();
    }
  };

  const TRACK_MARGIN_HORIZONTAL = 20;
  const EDGE_INSET = 16;
  const trackWidth = Math.max(SCREEN_WIDTH - TRACK_MARGIN_HORIZONTAL * 2, 100);

  const jumpToLessonIndex = (targetIndex: number) => {
    if (lessons.length <= 1) return;
    const clamped = Math.min(Math.max(targetIndex, 0), lessons.length - 1);
    if (clamped !== currentIndexRef.current) {
      currentIndexRef.current = clamped;
      setCurrentIndex(clamped);
      flatListRef.current?.scrollToOffset({
        offset: clamped * SCREEN_WIDTH,
        animated: false,
      });
      triggerHaptic();
    }
  };

  const handleScrubberTouch = (pageX: number) => {
    const count = lessons.length;
    if (count <= 1) return;
    const usableWidth = Math.max(trackWidth - EDGE_INSET * 2, 60);
    const relativeX = pageX - (TRACK_MARGIN_HORIZONTAL + EDGE_INSET);
    const ratio = Math.max(0, Math.min(1, relativeX / usableWidth));
    const targetIndex = Math.round(ratio * (count - 1));
    jumpToLessonIndex(targetIndex);
  };

  if (!visible || lessons.length === 0) return null;

  const safeCurrentIndex = Math.min(Math.max(currentIndex, 0), lessons.length - 1);
  const currentLesson = lessons[safeCurrentIndex] || lessons[0];
  const progressRatio =
    lessons.length > 1 ? safeCurrentIndex / (lessons.length - 1) : 0.5;
  const currentAccent = getLessonAccentColor(currentLesson);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent={true}>
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />

        <Animated.View
          style={[
            styles.sheetContainer,
            {
              transform: [{ translateY }],
              paddingBottom: Math.max(insets.bottom + 20, 32),
            },
          ]}>
          {/* Top Drag Indicator */}
          <View
            style={styles.dragHandleContainer}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderGrant={handleDragStart}
            onResponderMove={handleDragMove}
            onResponderRelease={handleDragRelease}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 30, right: 30 }}>
              <View style={styles.dragHandle} />
            </TouchableOpacity>
          </View>

          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.headerInfo}>
              <Text style={styles.dayTitle} numberOfLines={1}>
                {dayLabel}
              </Text>
              <Text style={styles.counterText}>
                Lekcja {safeCurrentIndex + 1} z {lessons.length} (nr{' '}
                {currentLesson.hourNumber})
              </Text>
            </View>

            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={20} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          {/* Horizontal Paging Carousel */}
          <FlatList
            ref={flatListRef}
            data={lessons}
            keyExtractor={(item, idx) => `${item.id}-${idx}`}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            onScroll={handleCardScroll}
            onMomentumScrollEnd={handleCardScroll}
            scrollEventThrottle={16}
            initialScrollIndex={validatedInitialIndex}
            onScrollToIndexFailed={(info) => {
              setTimeout(() => {
                flatListRef.current?.scrollToOffset({
                  offset: info.index * SCREEN_WIDTH,
                  animated: false,
                });
              }, 60);
            }}
            getItemLayout={(_, index) => ({
              length: SCREEN_WIDTH,
              offset: SCREEN_WIDTH * index,
              index,
            })}
            style={{ width: SCREEN_WIDTH, flexGrow: 0 }}
            renderItem={({ item }) => {
              const accent = getLessonAccentColor(item);
              const isCancelled = Boolean(item.isCancelled);
              const isSubstitution = !isCancelled && Boolean(item.isSubstitution);
              const attConfig = item.attendance
                ? getAttendanceBadgeConfig(item.attendance.kind)
                : null;

              const changeBannerTitle = isCancelled
                ? 'Lekcja odwołana'
                : item.changeType === 'room'
                  ? 'Zmiana sali'
                  : item.changeType === 'moved'
                    ? 'Przesunięcie lekcji'
                    : 'Zastępstwo';

              return (
                <View style={[styles.cardSlide, { width: SCREEN_WIDTH }]}>
                  <View
                    style={[
                      styles.cardInner,
                      { borderColor: `${accent}44` },
                    ]}>
                    {/* Top Hero Banner */}
                    <View
                      style={[
                        styles.heroRow,
                        { borderColor: `${accent}33` },
                      ]}>
                      <View
                        style={[
                          styles.hourBigBadge,
                          {
                            backgroundColor: `${accent}20`,
                            borderColor: `${accent}66`,
                          },
                        ]}>
                        <Text style={[styles.hourBigNumber, { color: accent }]}>
                          {item.hourNumber}
                        </Text>
                        <Text style={styles.hourBigSub}>lekcja</Text>
                      </View>

                      <View style={styles.heroDetails}>
                        <Text
                          style={[
                            styles.heroSubject,
                            isCancelled && styles.heroSubjectCancelled,
                          ]}
                          numberOfLines={2}>
                          {item.subject}
                        </Text>
                        <Text style={styles.heroTime}>
                          {item.startTime} – {item.endTime}
                        </Text>
                      </View>
                    </View>

                    {/* Change / Cancellation Box (was -> now) */}
                    {(isCancelled || isSubstitution || item.original) && (
                      <View
                        style={[
                          styles.changeBox,
                          isCancelled
                            ? styles.changeBoxCancelled
                            : styles.changeBoxSubstitution,
                        ]}>
                        <View style={styles.changeHeaderRow}>
                          <Ionicons
                            name={
                              isCancelled
                                ? 'close-circle-outline'
                                : 'swap-horizontal-outline'
                            }
                            size={16}
                            color={isCancelled ? '#f87171' : '#fbbf24'}
                          />
                          <Text
                            style={[
                              styles.changeTitle,
                              { color: isCancelled ? '#f87171' : '#fbbf24' },
                            ]}>
                            {changeBannerTitle}
                          </Text>
                        </View>

                        {item.original ? (
                          <View style={styles.wasNowContainer}>
                            <Text style={styles.wasText}>
                              Było: {item.original.subject || item.subject}
                              {item.original.teacher
                                ? ` · ${item.original.teacher}`
                                : ''}
                              {item.original.classroom
                                ? ` · s. ${item.original.classroom}`
                                : ''}
                            </Text>
                            {!isCancelled && (
                              <Text style={styles.nowText}>
                                Teraz: {item.subject}
                                {item.teacher ? ` · ${item.teacher}` : ''}
                                {item.classroom ? ` · s. ${item.classroom}` : ''}
                              </Text>
                            )}
                          </View>
                        ) : item.note ? (
                          <Text style={styles.changeNoteText}>{item.note}</Text>
                        ) : null}
                      </View>
                    )}

                    {/* Info Grid */}
                    <View style={styles.infoList}>
                      <View style={styles.infoRow}>
                        <View style={styles.infoLabelRow}>
                          <Ionicons
                            name="location-outline"
                            size={16}
                            color="#94a3b8"
                          />
                          <Text style={styles.infoLabel}>Sala lekcyjna</Text>
                        </View>
                        <Text style={styles.infoValue}>
                          {item.classroom ? `s. ${item.classroom}` : 'Brak danych'}
                        </Text>
                      </View>

                      <View style={styles.infoRow}>
                        <View style={styles.infoLabelRow}>
                          <Ionicons
                            name="person-outline"
                            size={16}
                            color="#94a3b8"
                          />
                          <Text style={styles.infoLabel}>Nauczyciel</Text>
                        </View>
                        <Text
                          style={[
                            styles.infoValue,
                            { flexShrink: 1, textAlign: 'right' },
                          ]}>
                          {item.teacher || 'Brak danych'}
                        </Text>
                      </View>

                      {/* Attendance Block */}
                      <View style={styles.attendanceSection}>
                        <View style={styles.attendanceTopRow}>
                          <View style={styles.infoLabelRow}>
                            <Ionicons
                              name="checkmark-done-circle-outline"
                              size={16}
                              color="#94a3b8"
                            />
                            <Text style={styles.infoLabel}>Frekwencja</Text>
                          </View>

                          {item.attendance && attConfig ? (
                            <View style={styles.attendanceRight}>
                              <AttendanceIcon
                                attendance={item.attendance}
                                size="md"
                              />
                              <Text
                                style={[
                                  styles.attendanceTypeName,
                                  { color: attConfig.color },
                                ]}>
                                {item.attendance.name} (
                                {item.attendance.symbol.toUpperCase()})
                              </Text>
                            </View>
                          ) : (
                            <Text style={styles.attendanceUnmarked}>
                              Brak wpisu
                            </Text>
                          )}
                        </View>

                        {item.attendance &&
                          (item.attendance.addedBy ||
                            item.attendance.addedAt) && (
                            <Text style={styles.attendanceMeta}>
                              {item.attendance.addedBy
                                ? `Wystawił(a): ${item.attendance.addedBy}`
                                : ''}
                              {item.attendance.addedBy &&
                              item.attendance.addedAt
                                ? '  ·  '
                                : ''}
                              {item.attendance.addedAt
                                ? `Dodano: ${item.attendance.addedAt}`
                                : ''}
                            </Text>
                          )}
                      </View>

                      {/* Lesson Topic Block (shown when topic is present) */}
                      {item.topic ? (
                        <View style={styles.topicBox}>
                          <Ionicons
                            name="document-text-outline"
                            size={16}
                            color={accent}
                            style={{ marginTop: 2 }}
                          />
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.topicLabel, { color: accent }]}>
                              Temat lekcji
                            </Text>
                            <Text style={styles.topicText}>{decodeHtmlEntities(item.topic)}</Text>
                          </View>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </View>
              );
            }}
          />

          {/* Bottom Scrubber Slider */}
          {lessons.length > 1 ? (
            <View
              style={styles.scrubberContainer}
              onStartShouldSetResponder={() => true}
              onStartShouldSetResponderCapture={() => true}
              onMoveShouldSetResponder={() => true}
              onMoveShouldSetResponderCapture={() => true}
              onResponderTerminationRequest={() => false}
              onResponderGrant={(evt) =>
                handleScrubberTouch(evt.nativeEvent.pageX)
              }
              onResponderMove={(evt) =>
                handleScrubberTouch(evt.nativeEvent.pageX)
              }>
              <View style={[styles.trackBackground, { width: trackWidth }]}>
                <View
                  style={[
                    styles.trackFill,
                    {
                      width: `${Math.round(progressRatio * 100)}%`,
                      backgroundColor: currentAccent,
                    },
                  ]}
                />

                {lessons.map((lessonItem, i) => {
                  const dotRatio = i / (lessons.length - 1);
                  const isPast = i <= safeCurrentIndex;
                  const isActive = i === safeCurrentIndex;
                  const isCancelledDot = Boolean(lessonItem.isCancelled);
                  const dotColor = getLessonAccentColor(lessonItem);

                  return (
                    <View
                      key={`${lessonItem.id}-${i}`}
                      pointerEvents="none"
                      style={[
                        styles.stepDot,
                        { left: `${Math.round(dotRatio * 100)}%` },
                        isPast && { backgroundColor: dotColor },
                        isCancelledDot && styles.stepDotHollowCancelled,
                        isActive && styles.stepDotActive,
                      ]}
                    />
                  );
                })}

                <View
                  pointerEvents="none"
                  style={[
                    styles.scrubberThumb,
                    {
                      left: `${Math.round(progressRatio * 100)}%`,
                      borderColor: currentAccent,
                    },
                  ]}>
                  <Text style={[styles.thumbText, { color: currentAccent }]}>
                    {currentLesson.hourNumber}
                  </Text>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.singleFooter}>
              <View
                style={[styles.singleDot, { backgroundColor: currentAccent }]}
              />
              <Text style={styles.singleFooterText}>
                Jedyna lekcja w tym dniu
              </Text>
            </View>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
  sheetContainer: {
    backgroundColor: '#0f172a',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: '#1e293b',
    paddingTop: 6,
  },
  dragHandleContainer: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  dragHandle: {
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#334155',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerInfo: {
    flex: 1,
    marginRight: 12,
  },
  dayTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '800',
  },
  counterText: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardSlide: {
    paddingHorizontal: 20,
    paddingVertical: 4,
  },
  cardInner: {
    backgroundColor: '#1e293b',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 16,
    gap: 12,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  hourBigBadge: {
    width: 58,
    height: 58,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hourBigNumber: {
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 24,
  },
  hourBigSub: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  heroDetails: {
    flex: 1,
    gap: 4,
  },
  heroSubject: {
    color: '#f8fafc',
    fontSize: 17,
    fontWeight: '800',
  },
  heroSubjectCancelled: {
    textDecorationLine: 'line-through',
    color: '#94a3b8',
  },
  heroTime: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
  changeBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 11,
    gap: 4,
  },
  changeBoxCancelled: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.35)',
  },
  changeBoxSubstitution: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderColor: 'rgba(245, 158, 11, 0.38)',
  },
  changeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  changeTitle: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  wasNowContainer: {
    gap: 2,
    marginTop: 2,
  },
  wasText: {
    color: '#94a3b8',
    fontSize: 12,
    textDecorationLine: 'line-through',
  },
  nowText: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '700',
  },
  changeNoteText: {
    color: '#cbd5e1',
    fontSize: 12,
  },
  infoList: {
    gap: 10,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  infoLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  infoLabel: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
  infoValue: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
  },
  attendanceSection: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#1e293b',
    gap: 4,
  },
  attendanceTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  attendanceRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flexShrink: 1,
  },
  attendanceTypeName: {
    fontSize: 12,
    fontWeight: '700',
    flexShrink: 1,
  },
  attendanceUnmarked: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600',
  },
  attendanceMeta: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 2,
  },
  topicBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 11,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  topicLabel: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  topicText: {
    color: '#e2e8f0',
    fontSize: 13,
    lineHeight: 18,
  },
  scrubberContainer: {
    marginTop: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackBackground: {
    height: 6,
    backgroundColor: '#1e293b',
    borderRadius: 3,
    position: 'relative',
    justifyContent: 'center',
  },
  trackFill: {
    height: 6,
    backgroundColor: '#3b82f6',
    borderRadius: 3,
  },
  stepDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#334155',
    transform: [{ translateX: -4 }],
  },
  stepDotHollowCancelled: {
    backgroundColor: '#0f172a',
    borderWidth: 1.5,
    borderColor: '#ef4444',
  },
  stepDotActive: {
    width: 12,
    height: 12,
    borderRadius: 6,
    transform: [{ translateX: -6 }],
  },
  scrubberThumb: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#0f172a',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateX: -15 }],
  },
  thumbText: {
    fontSize: 12,
    fontWeight: '800',
  },
  singleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingTop: 14,
  },
  singleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  singleFooterText: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600',
  },
});

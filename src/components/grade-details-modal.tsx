import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  Vibration,
  View,
} from 'react-native';
import { FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Grade } from '@/types/librus';

interface GradeDetailsModalProps {
  visible: boolean;
  subjectName: string;
  grades: Grade[];
  initialIndex: number;
  onClose: () => void;
}

export function getGradeColor(val: string): string {
  const clean = val.trim();
  if (clean === '+' || clean.startsWith('+')) return '#06b6d4'; // Cyan for positive activity
  if (clean === '-' || clean.startsWith('-')) return '#f97316'; // Orange for minus
  if (clean.startsWith('6') || clean.startsWith('5')) return '#10b981'; // Emerald
  if (clean.startsWith('4')) return '#3b82f6'; // Blue
  if (clean.startsWith('3')) return '#f59e0b'; // Amber
  if (clean.startsWith('2')) return '#ea580c'; // Dark orange
  return '#ef4444'; // Red
}

export const GradeDetailsModal: React.FC<GradeDetailsModalProps> = ({
  visible,
  subjectName,
  grades,
  initialIndex,
  onClose,
}) => {
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const validatedInitialIndex = Math.min(Math.max(initialIndex, 0), Math.max(grades.length - 1, 0));
  const [currentIndex, setCurrentIndex] = useState(validatedInitialIndex);
  const currentIndexRef = useRef(validatedInitialIndex);
  const flatListRef = useRef<FlatList<Grade>>(null);

  // Animation for swipe-down to dismiss
  const translateY = useRef(new Animated.Value(0)).current;

  const triggerHaptic = () => {
    try {
      Vibration.vibrate(14);
    } catch {
      // Ignore vibration errors
    }
  };

  useEffect(() => {
    if (visible && grades.length > 0) {
      const idx = Math.min(Math.max(initialIndex, 0), grades.length - 1);
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
  }, [visible, initialIndex, grades.length, SCREEN_WIDTH]);

  // Swipe-down to dismiss pan responder for top drag area
  const dragPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => gestureState.dy > 3,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 90 || gestureState.vy > 0.6) {
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
      },
    })
  ).current;

  const handleCardScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const newIndex = Math.round(offsetX / SCREEN_WIDTH);
    const safeNewIndex = Math.min(Math.max(newIndex, 0), grades.length - 1);
    if (safeNewIndex !== currentIndexRef.current) {
      currentIndexRef.current = safeNewIndex;
      setCurrentIndex(safeNewIndex);
      triggerHaptic();
    }
  };

  // Full-width scrubber dimensions
  const TRACK_MARGIN_HORIZONTAL = 20;
  const trackWidth = Math.max(SCREEN_WIDTH - TRACK_MARGIN_HORIZONTAL * 2, 100);

  const handleScrubberTouch = (pageX: number) => {
    if (grades.length <= 1) return;
    const relativeX = pageX - TRACK_MARGIN_HORIZONTAL;
    const ratio = Math.max(0, Math.min(1, relativeX / trackWidth));
    const targetIndex = Math.round(ratio * (grades.length - 1));

    if (targetIndex >= 0 && targetIndex < grades.length && targetIndex !== currentIndexRef.current) {
      currentIndexRef.current = targetIndex;
      setCurrentIndex(targetIndex);
      flatListRef.current?.scrollToOffset({
        offset: targetIndex * SCREEN_WIDTH,
        animated: false,
      });
      triggerHaptic();
    }
  };

  const scrubberPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt) => {
        handleScrubberTouch(evt.nativeEvent.pageX);
      },
      onPanResponderMove: (evt) => {
        handleScrubberTouch(evt.nativeEvent.pageX);
      },
    })
  ).current;

  if (!visible || grades.length === 0) return null;

  const safeCurrentIndex = Math.min(Math.max(currentIndex, 0), grades.length - 1);
  const currentGrade = grades[safeCurrentIndex] || grades[0];
  const progressRatio = grades.length > 1 ? safeCurrentIndex / (grades.length - 1) : 0.5;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent={true}>
      <View style={styles.overlay}>
        {/* Backdrop touchable */}
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />

        {/* Bottom Sheet Animated Container */}
        <Animated.View
          style={[
            styles.sheetContainer,
            {
              transform: [{ translateY }],
              paddingBottom: Math.max(insets.bottom + 20, 32),
            },
          ]}>
          {/* Top Drag Indicator Area with swipe-down to dismiss */}
          <View style={styles.dragHandleContainer} {...dragPanResponder.panHandlers}>
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
              <Text style={styles.subjectTitle} numberOfLines={1}>
                {subjectName}
              </Text>
              <Text style={styles.counterText}>
                Ocena {safeCurrentIndex + 1} z {grades.length}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={20} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          {/* Swipeable Carousel */}
          <FlatList
            ref={flatListRef}
            data={grades}
            keyExtractor={(item) => item.id}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            snapToInterval={SCREEN_WIDTH}
            snapToAlignment="center"
            disableIntervalMomentum={true}
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
              const gradeColor = getGradeColor(item.value);
              const isImproved = !!item.correction;

              return (
                <View style={{ width: SCREEN_WIDTH, paddingHorizontal: 18 }}>
                  <View style={styles.cardScrollContent}>
                    {/* Grade Header Card */}
                    <View style={styles.gradeHeaderCard}>
                      <View
                        style={[
                          styles.gradeBadge,
                          {
                            backgroundColor: gradeColor + '20',
                            borderColor: gradeColor,
                            borderWidth: isImproved ? 2.5 : 1.5,
                          },
                        ]}>
                        <Text style={[styles.gradeBadgeText, { color: gradeColor }]}>
                          {item.value}
                        </Text>
                      </View>

                      <View style={styles.tagsCol}>
                        <Text style={styles.categoryName} numberOfLines={2}>
                          {item.category || 'Ocena cząstkowa'}
                        </Text>

                        <View style={styles.metaPillsRow}>
                          <View style={styles.weightPill}>
                            <Ionicons name="barbell-outline" size={13} color="#38bdf8" />
                            <Text style={styles.weightText}>Waga: {item.weight}</Text>
                          </View>

                          <View
                            style={[
                              styles.countsPill,
                              item.countsToAverage === false && styles.countsPillNegative,
                            ]}>
                            <Ionicons
                              name={
                                item.countsToAverage === false
                                  ? 'close-circle-outline'
                                  : 'checkmark-circle-outline'
                              }
                              size={13}
                              color={item.countsToAverage === false ? '#f87171' : '#34d399'}
                            />
                            <Text
                              style={[
                                styles.countsText,
                                item.countsToAverage === false && { color: '#f87171' },
                              ]}>
                              {item.countsToAverage === false ? 'Bez średniej' : 'Do średniej'}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </View>

                    {/* History of Correction */}
                    {isImproved && item.correction && (
                      <View style={styles.correctionCard}>
                        <View style={styles.correctionHeader}>
                          <Text style={styles.correctionTitle}>Historia poprawy oceny</Text>
                        </View>

                        <View style={styles.correctionFlow}>
                          {(item.correction.attempts && item.correction.attempts.length > 0
                            ? item.correction.attempts
                            : [
                                {
                                  value: item.correction.originalValue,
                                  date: item.correction.originalDate,
                                  teacher: item.correction.originalTeacher,
                                },
                              ]
                          ).map((att, attIdx) => {
                            const attColor = getGradeColor(att.value);
                            return (
                              <React.Fragment key={attIdx}>
                                <View style={styles.correctionStep}>
                                  <Text style={styles.stepLabel}>Podejście {attIdx + 1}</Text>
                                  <View
                                    style={[
                                      styles.miniBadge,
                                      { backgroundColor: attColor + '20', borderColor: attColor },
                                    ]}>
                                    <Text style={[styles.miniBadgeText, { color: attColor }]}>
                                      {att.value}
                                    </Text>
                                  </View>
                                  {att.date ? (
                                    <Text style={styles.stepDate}>{att.date}</Text>
                                  ) : null}
                                </View>

                                <Ionicons
                                  name="arrow-forward"
                                  size={16}
                                  color="#64748b"
                                  style={{ marginTop: 14 }}
                                />
                              </React.Fragment>
                            );
                          })}

                          <View style={styles.correctionStep}>
                            <Text style={styles.stepLabel}>Poprawka</Text>
                            <View
                              style={[
                                styles.miniBadge,
                                { backgroundColor: gradeColor + '20', borderColor: gradeColor },
                              ]}>
                              <Text style={[styles.miniBadgeText, { color: gradeColor }]}>
                                {item.value}
                              </Text>
                            </View>
                            <Text style={styles.stepDate}>{item.date}</Text>
                          </View>
                        </View>
                      </View>
                    )}

                    {/* Details Info List */}
                    <View style={styles.infoSection}>
                      <View style={styles.infoRow}>
                        <View style={styles.infoLabelRow}>
                          <Ionicons name="calendar-outline" size={16} color="#94a3b8" />
                          <Text style={styles.infoLabel}>Data wystawienia</Text>
                        </View>
                        <Text style={styles.infoValue}>{item.date}</Text>
                      </View>

                      {item.teacher ? (
                        <View style={styles.infoRow}>
                          <View style={styles.infoLabelRow}>
                            <Ionicons name="person-outline" size={16} color="#94a3b8" />
                            <Text style={styles.infoLabel}>Nauczyciel</Text>
                          </View>
                          <Text style={[styles.infoValue, { flexShrink: 1, textAlign: 'right' }]}>
                            {item.teacher}
                          </Text>
                        </View>
                      ) : null}

                      {item.comment ? (
                        <View style={styles.commentBox}>
                          <Ionicons
                            name="chatbubble-ellipses-outline"
                            size={16}
                            color="#38bdf8"
                            style={{ marginTop: 2 }}
                          />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.commentLabel}>Komentarz nauczyciela:</Text>
                            <Text style={styles.commentText}>{item.comment}</Text>
                          </View>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </View>
              );
            }}
          />

          {/* Full-Width Interactive Scrubber Slider Bar (Only when more than 1 grade) */}
          {grades.length > 1 ? (
            <View style={styles.scrubberContainer} {...scrubberPanResponder.panHandlers}>
              <View style={[styles.trackBackground, { width: trackWidth }]}>
                {/* Filled progress track */}
                <View
                  style={[
                    styles.trackFill,
                    {
                      width: `${Math.round(progressRatio * 100)}%`,
                    },
                  ]}
                />

                {/* Step Dots along the track */}
                {grades.map((_, i) => {
                  const dotRatio = i / (grades.length - 1);
                  const isPast = i <= safeCurrentIndex;
                  const isActive = i === safeCurrentIndex;

                  return (
                    <View
                      key={i}
                      pointerEvents="none"
                      style={[
                        styles.stepDot,
                        { left: `${Math.round(dotRatio * 100)}%` },
                        isPast && styles.stepDotPassed,
                        isActive && styles.stepDotActive,
                      ]}
                    />
                  );
                })}

                {/* Floating Thumb */}
                <View
                  pointerEvents="none"
                  style={[
                    styles.scrubberThumb,
                    {
                      left: `${Math.round(progressRatio * 100)}%`,
                      borderColor: getGradeColor(currentGrade.value),
                    },
                  ]}>
                  <Text
                    style={[
                      styles.thumbText,
                      { color: getGradeColor(currentGrade.value) },
                    ]}>
                    {currentGrade.value}
                  </Text>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.singleGradeFooter}>
              <View
                style={[
                  styles.singleGradeDot,
                  { backgroundColor: getGradeColor(currentGrade.value) },
                ]}
              />
              <Text style={styles.singleGradeText}>Jedyna ocena w tym semestrze</Text>
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
    borderColor: '#334155',
    borderBottomWidth: 0,
    paddingTop: 8,
  },
  dragHandleContainer: {
    width: '100%',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dragHandle: {
    width: 48,
    height: 5,
    backgroundColor: '#475569',
    borderRadius: 3,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  headerInfo: {
    flex: 1,
    marginRight: 12,
  },
  subjectTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f8fafc',
  },
  counterText: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
    fontWeight: '500',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardScrollContent: {
    paddingVertical: 12,
    gap: 12,
  },
  gradeHeaderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: '#1e293b',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  gradeBadge: {
    width: 64,
    height: 64,
    borderRadius: 18,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  improvedGradeBadge: {
    borderWidth: 2.5,
    borderColor: '#38bdf8',
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 6,
  },
  gradeBadgeText: {
    fontSize: 26,
    fontWeight: '800',
  },
  tagsCol: {
    flex: 1,
    gap: 6,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f8fafc',
  },
  metaPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  weightPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0f172a',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  weightText: {
    fontSize: 12,
    color: '#cbd5e1',
    fontWeight: '600',
  },
  countsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0f172a',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  countsPillNegative: {
    borderColor: '#ef444450',
    backgroundColor: '#ef444415',
  },
  countsText: {
    fontSize: 12,
    color: '#34d399',
    fontWeight: '600',
  },
  correctionCard: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  correctionHeader: {
    marginBottom: 6,
  },
  correctionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  correctionFlow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: 2,
  },
  correctionStep: {
    alignItems: 'center',
    gap: 3,
  },
  stepLabel: {
    fontSize: 10,
    color: '#94a3b8',
    fontWeight: '500',
  },
  miniBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  miniBadgeText: {
    fontSize: 16,
    fontWeight: '800',
  },
  stepDate: {
    fontSize: 10,
    color: '#64748b',
  },
  infoSection: {
    backgroundColor: '#1e293b',
    borderRadius: 18,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: '#334155',
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
    gap: 8,
  },
  infoLabel: {
    fontSize: 13,
    color: '#94a3b8',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f8fafc',
  },
  commentBox: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#0f172a',
    padding: 12,
    borderRadius: 10,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#334155',
  },
  commentLabel: {
    fontSize: 12,
    color: '#38bdf8',
    fontWeight: '600',
    marginBottom: 2,
  },
  commentText: {
    fontSize: 13,
    color: '#e2e8f0',
    lineHeight: 18,
  },
  scrubberContainer: {
    height: 52,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  trackBackground: {
    height: 8,
    backgroundColor: '#1e293b',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#334155',
    position: 'relative',
    justifyContent: 'center',
  },
  trackFill: {
    height: '100%',
    backgroundColor: '#38bdf8',
    borderRadius: 4,
  },
  stepDot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#475569',
    marginLeft: -3,
    top: 0,
  },
  stepDotPassed: {
    backgroundColor: '#38bdf8',
  },
  stepDotActive: {
    backgroundColor: '#ffffff',
    transform: [{ scale: 1.4 }],
  },
  scrubberThumb: {
    position: 'absolute',
    width: 34,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#0f172a',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -17,
    top: -8,
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 4,
  },
  thumbText: {
    fontSize: 11,
    fontWeight: '800',
  },
  singleGradeFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
  },
  singleGradeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  singleGradeText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
});

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  LayoutChangeEvent,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  Vibration,
  View,
} from 'react-native';
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

function parseHexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 6) {
    const num = parseInt(clean, 16);
    if (!Number.isNaN(num)) {
      return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
    }
  }
  return [59, 130, 246];
}

function mixRgb(
  base: [number, number, number],
  tint: [number, number, number],
  tintWeight: number
): string {
  const w = Math.max(0, Math.min(1, tintWeight));
  const r = Math.round(base[0] * (1 - w) + tint[0] * w);
  const g = Math.round(base[1] * (1 - w) + tint[1] * w);
  const b = Math.round(base[2] * (1 - w) + tint[2] * w);
  return `rgb(${r}, ${g}, ${b})`;
}

function getCardShellPalette(
  accentHex: string,
  index: number
): {
  backgroundColor: string;
  borderColor: string;
} {
  const accentRgb = parseHexToRgb(accentHex);
  const isOdd = index % 2 === 1;
  const baseSurface: [number, number, number] = isOdd
    ? [28, 40, 62]
    : [20, 30, 48];
  const borderBase: [number, number, number] = isOdd
    ? [58, 74, 98]
    : [46, 60, 82];

  return {
    backgroundColor: mixRgb(baseSurface, accentRgb, isOdd ? 0.16 : 0.11),
    borderColor: mixRgb(borderBase, accentRgb, 0.44),
  };
}

const RAIL_VERTICAL_PADDING = 18;
const REEL_PAGE_GAP = 14;

const GradeCardContent: React.FC<{
  grade: Grade;
  compact: boolean;
  onHorizontalStripCapture: () => boolean;
}> = React.memo(({ grade, compact, onHorizontalStripCapture }) => {
  const gradeColor = getGradeColor(grade.value);
  const isImproved = Boolean(grade.correction);
  const cleanTeacher = grade.teacher
    ? grade.teacher.replace(/\s+/g, ' ').trim()
    : '';

  const attemptsList =
    isImproved && grade.correction
      ? grade.correction.attempts && grade.correction.attempts.length > 0
        ? grade.correction.attempts
        : [
            {
              value: grade.correction.originalValue,
              date: grade.correction.originalDate,
              teacher: grade.correction.originalTeacher,
            },
          ]
      : [];

  return (
    <View
      style={[
        styles.cardNaturalStack,
        compact && styles.cardNaturalStackCompact,
      ]}>
      {/* Grade Header Card */}
      <View
        style={[
          styles.gradeHeaderCard,
          compact && styles.gradeHeaderCardCompact,
        ]}>
        <View
          style={[
            styles.gradeBadge,
            compact && styles.gradeBadgeCompact,
            {
              backgroundColor: `${gradeColor}22`,
              borderColor: gradeColor,
              borderWidth: isImproved ? 2.5 : 1.5,
            },
          ]}>
          <Text
            style={[
              styles.gradeBadgeText,
              compact && styles.gradeBadgeTextCompact,
              { color: gradeColor },
            ]}>
            {grade.value}
          </Text>
        </View>

        <View style={styles.tagsCol}>
          <Text
            style={[
              styles.categoryName,
              compact && styles.categoryNameCompact,
            ]}
            numberOfLines={2}>
            {grade.category || 'Ocena cząstkowa'}
          </Text>

          <View
            style={[
              styles.metaPillsRow,
              compact && styles.metaPillsRowCompact,
            ]}>
            <View
              style={[
                styles.weightPill,
                compact && styles.metaPillCompact,
              ]}>
              <Ionicons name="barbell-outline" size={12} color="#38bdf8" />
              <Text
                style={[
                  styles.weightText,
                  compact && styles.metaPillTextCompact,
                ]}
                numberOfLines={1}>
                Waga: {grade.weight}
              </Text>
            </View>

            <View
              style={[
                styles.countsPill,
                compact && styles.metaPillCompact,
                grade.countsToAverage === false && styles.countsPillNegative,
              ]}>
              <Ionicons
                name={
                  grade.countsToAverage === false
                    ? 'close-circle-outline'
                    : 'checkmark-circle-outline'
                }
                size={12}
                color={grade.countsToAverage === false ? '#f87171' : '#34d399'}
              />
              <Text
                style={[
                  styles.countsText,
                  compact && styles.metaPillTextCompact,
                  grade.countsToAverage === false && { color: '#f87171' },
                ]}
                numberOfLines={1}>
                {grade.countsToAverage === false
                  ? 'Bez średniej'
                  : 'Do średniej'}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* History of Correction — Single-Row Horizontal Timeline */}
      {isImproved && grade.correction && (
        <View
          style={[
            styles.correctionCard,
            compact && styles.correctionCardCompact,
          ]}
          onStartShouldSetResponderCapture={onHorizontalStripCapture}>
          <View style={styles.correctionHeader}>
            <Text style={styles.correctionTitle}>Historia poprawy oceny</Text>
          </View>

          <ScrollView
            horizontal
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.correctionScrollRow}>
            {attemptsList.map((att, attIdx) => {
              const attColor = getGradeColor(att.value);
              return (
                <React.Fragment key={attIdx}>
                  <View style={styles.correctionStep}>
                    <Text style={styles.stepLabel} numberOfLines={1}>
                      Podejście {attIdx + 1}
                    </Text>
                    <View
                      style={[
                        styles.miniBadge,
                        compact && styles.miniBadgeCompact,
                        {
                          backgroundColor: `${attColor}20`,
                          borderColor: attColor,
                        },
                      ]}>
                      <Text
                        style={[
                          styles.miniBadgeText,
                          compact && styles.miniBadgeTextCompact,
                          { color: attColor },
                        ]}>
                        {att.value}
                      </Text>
                    </View>
                    {att.date ? (
                      <Text style={styles.stepDate} numberOfLines={1}>
                        {att.date}
                      </Text>
                    ) : null}
                  </View>

                  <Ionicons
                    name="arrow-forward"
                    size={15}
                    color="#64748b"
                    style={styles.correctionArrow}
                  />
                </React.Fragment>
              );
            })}

            <View style={styles.correctionStep}>
              <Text style={styles.stepLabel} numberOfLines={1}>
                Poprawka
              </Text>
              <View
                style={[
                  styles.miniBadge,
                  compact && styles.miniBadgeCompact,
                  {
                    backgroundColor: `${gradeColor}20`,
                    borderColor: gradeColor,
                  },
                ]}>
                <Text
                  style={[
                    styles.miniBadgeText,
                    compact && styles.miniBadgeTextCompact,
                    { color: gradeColor },
                  ]}>
                  {grade.value}
                </Text>
              </View>
              <Text style={styles.stepDate} numberOfLines={1}>
                {grade.date}
              </Text>
            </View>
          </ScrollView>
        </View>
      )}

      {/* Details Info List */}
      <View
        style={[styles.infoSection, compact && styles.infoSectionCompact]}>
        <View style={styles.infoRow}>
          <View style={styles.infoLabelRow}>
            <Ionicons name="calendar-outline" size={15} color="#94a3b8" />
            <Text style={styles.infoLabel}>Data wystawienia</Text>
          </View>
          <Text
            style={[styles.infoValue, compact && styles.infoValueCompact]}
            numberOfLines={1}>
            {grade.date.trim()}
          </Text>
        </View>

        {cleanTeacher ? (
          <View style={styles.infoRow}>
            <View style={styles.infoLabelRow}>
              <Ionicons name="person-outline" size={15} color="#94a3b8" />
              <Text style={styles.infoLabel}>Nauczyciel</Text>
            </View>
            <Text
              style={[styles.infoValue, compact && styles.infoValueCompact]}
              numberOfLines={1}>
              {cleanTeacher}
            </Text>
          </View>
        ) : null}

        {grade.comment ? (
          <View style={styles.commentBox}>
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={16}
              color="#38bdf8"
              style={{ marginTop: 2 }}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.commentLabel}>Komentarz nauczyciela:</Text>
              <Text style={styles.commentText}>{grade.comment}</Text>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
});
GradeCardContent.displayName = 'GradeCardContent';

const GradeDetailsSheetContent: React.FC<{
  subjectName: string;
  grades: Grade[];
  initialIndex: number;
  onClose: () => void;
}> = ({ subjectName, grades, initialIndex, onClose }) => {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isCompactPhone = windowWidth < 480;

  const [overlayHeight, setOverlayHeight] = useState<number>(0);
  const [headerChromeHeight, setHeaderChromeHeight] = useState<number>(84);
  const pageHeight = overlayHeight > 0 ? overlayHeight : windowHeight;

  const validatedInitial = Math.min(
    Math.max(initialIndex, 0),
    Math.max(grades.length - 1, 0)
  );
  const [currentIndex, setCurrentIndex] = useState<number>(validatedInitial);
  const activeIndexRef = useRef<number>(validatedInitial);
  const targetReelIndexRef = useRef<number>(validatedInitial);
  const liveReelIndexRef = useRef<number>(validatedInitial);
  const liveThumbIndexRef = useRef<number>(validatedInitial);
  const gradesCountRef = useRef<number>(grades.length);

  // Sheet dismiss animation (top handle bar ONLY)
  const [sheetTranslateY] = useState(() => new Animated.Value(0));
  const handleStartYRef = useRef<number>(0);
  const isClosingRef = useRef<boolean>(false);

  // Decoupled native-driven animations:
  // - `reelIndexAnim`: snaps card-to-card with magnetic spring + depth scale
  // - `thumbIndexAnim`: glides smoothly with finger on scrubber and snaps on release
  const [reelIndexAnim] = useState(() => new Animated.Value(validatedInitial));
  const [thumbIndexAnim] = useState(() => new Animated.Value(validatedInitial));

  // Locked max height measurement across all grades in this subject
  const stageWidthRef = useRef<number>(0);
  const [measuredHeights, setMeasuredHeights] = useState<Record<number, number>>(
    {}
  );
  const [lockedNaturalMax, setLockedNaturalMax] = useState<number | null>(null);
  const [readyFallback, setReadyFallback] = useState<boolean>(false);
  const scrollOffsetsRef = useRef<Record<number, number>>({});

  // Gesture tracking refs
  const isTouchingHorizontalStripRef = useRef<boolean>(false);
  const cardTouchStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const cardDragRef = useRef<{
    anchorY: number;
    startIndex: number;
    lastY: number;
    lastTime: number;
    velocityY: number;
  }>({
    anchorY: 0,
    startIndex: validatedInitial,
    lastY: 0,
    lastTime: 0,
    velocityY: 0,
  });
  const scrubGestureRef = useRef<{ grantLocY: number; grantPageY: number }>({
    grantLocY: 0,
    grantPageY: 0,
  });
  const lastHapticAtRef = useRef<number>(0);

  const triggerHaptic = useCallback(() => {
    const now = Date.now();
    if (now - lastHapticAtRef.current < 45) return;
    lastHapticAtRef.current = now;
    try {
      Vibration.vibrate(10);
    } catch {
      // Ignore vibration errors
    }
  }, []);

  const markHorizontalStripCapture = useCallback(() => {
    isTouchingHorizontalStripRef.current = true;
    return false;
  }, []);

  useEffect(() => {
    gradesCountRef.current = grades.length;
  }, [grades.length]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setReadyFallback(true);
    }, 55);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    liveReelIndexRef.current = validatedInitial;
    liveThumbIndexRef.current = validatedInitial;

    const reelSub = reelIndexAnim.addListener(({ value }) => {
      liveReelIndexRef.current = value;
      const maxValid = Math.max(gradesCountRef.current - 1, 0);
      const rounded = Math.min(Math.max(Math.round(value), 0), maxValid);
      if (rounded !== activeIndexRef.current) {
        activeIndexRef.current = rounded;
        setCurrentIndex(rounded);
        triggerHaptic();
      }
    });

    const thumbSub = thumbIndexAnim.addListener(({ value }) => {
      liveThumbIndexRef.current = value;
    });

    return () => {
      reelIndexAnim.removeListener(reelSub);
      thumbIndexAnim.removeListener(thumbSub);
    };
  }, [reelIndexAnim, thumbIndexAnim, triggerHaptic, validatedInitial]);

  const handleOverlayLayout = useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0) {
      setOverlayHeight((prev) => (Math.abs(prev - h) > 1 ? h : prev));
    }
  }, []);

  const handleStageWidthLayout = useCallback((e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w <= 0) return;
    if (stageWidthRef.current > 0 && Math.abs(stageWidthRef.current - w) > 2) {
      stageWidthRef.current = w;
      setMeasuredHeights({});
      setLockedNaturalMax(null);
    } else if (stageWidthRef.current === 0) {
      stageWidthRef.current = w;
    }
  }, []);

  const handleItemLayout = useCallback(
    (index: number, height: number) => {
      if (height <= 0) return;
      const roundedH = Math.ceil(height) + 4;
      setMeasuredHeights((prev) => {
        if (prev[index] === roundedH) return prev;
        const next = { ...prev, [index]: roundedH };
        if (Object.keys(next).length >= grades.length) {
          const maxH = Object.values(next).reduce((m, v) => Math.max(m, v), 0);
          setLockedNaturalMax((curr) => (curr === null ? maxH : curr));
        }
        return next;
      });
    },
    [grades.length]
  );

  const dismissSheet = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    Animated.timing(sheetTranslateY, {
      toValue: Math.max(pageHeight, 600),
      duration: 185,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      isClosingRef.current = false;
      onClose();
    });
  }, [onClose, pageHeight, sheetTranslateY]);

  const springReelToCard = useCallback(
    (targetIndex: number, velocityIndexPerSec: number = 0) => {
      if (grades.length <= 1) return;
      const clamped = Math.min(Math.max(targetIndex, 0), grades.length - 1);
      targetReelIndexRef.current = clamped;
      if (clamped !== activeIndexRef.current) {
        activeIndexRef.current = clamped;
        setCurrentIndex(clamped);
        triggerHaptic();
      }
      reelIndexAnim.stopAnimation();
      Animated.spring(reelIndexAnim, {
        toValue: clamped,
        velocity: velocityIndexPerSec,
        damping: 24,
        stiffness: 340,
        mass: 0.68,
        restDisplacementThreshold: 0.002,
        restSpeedThreshold: 0.002,
        useNativeDriver: true,
      }).start();
    },
    [grades.length, reelIndexAnim, triggerHaptic]
  );

  const springBothToCard = useCallback(
    (targetIndex: number, velocityIndexPerSec: number = 0) => {
      if (grades.length <= 1) return;
      const clamped = Math.min(Math.max(targetIndex, 0), grades.length - 1);
      springReelToCard(clamped, velocityIndexPerSec);
      thumbIndexAnim.stopAnimation();
      Animated.spring(thumbIndexAnim, {
        toValue: clamped,
        velocity: velocityIndexPerSec,
        damping: 24,
        stiffness: 340,
        mass: 0.68,
        restDisplacementThreshold: 0.002,
        restSpeedThreshold: 0.002,
        useNativeDriver: true,
      }).start();
    },
    [grades.length, springReelToCard, thumbIndexAnim]
  );

  const safeCurrentIndex = Math.min(Math.max(currentIndex, 0), grades.length - 1);
  const currentGrade = grades[safeCurrentIndex] || grades[0];
  const gradeColor = getGradeColor(currentGrade.value);

  const bodyTopPad = isCompactPhone ? 10 : 14;
  const bottomPad = Math.max(insets.bottom + (isCompactPhone ? 14 : 18), 20);
  const maxSheetHeight = Math.max(
    pageHeight - Math.max(insets.top, 12) - 16,
    280
  );
  const maxAvailableStageHeight = Math.max(
    maxSheetHeight - 6 - headerChromeHeight - bodyTopPad - bottomPad,
    175
  );

  const observedMax = Object.values(measuredHeights).reduce(
    (m, v) => Math.max(m, v),
    0
  );
  const naturalMax = lockedNaturalMax ?? (observedMax > 0 ? observedMax : 270);
  const effectiveStageHeight = Math.min(
    Math.max(naturalMax, 180),
    maxAvailableStageHeight
  );
  const isMeasuredReady =
    lockedNaturalMax !== null ||
    readyFallback ||
    (grades.length <= 1 && observedMax > 0);

  const stride = effectiveStageHeight + REEL_PAGE_GAP;
  const maxIdx = Math.max(grades.length - 1, 1);
  const usableTrackHeight = Math.max(
    effectiveStageHeight - RAIL_VERTICAL_PADDING * 2,
    48
  );

  const reelTranslateY = useMemo(
    () =>
      reelIndexAnim.interpolate({
        inputRange: [0, maxIdx],
        outputRange: [0, -maxIdx * stride],
        extrapolate: 'extend',
      }),
    [maxIdx, reelIndexAnim, stride]
  );

  const thumbTranslateY = useMemo(
    () =>
      thumbIndexAnim.interpolate({
        inputRange: [0, maxIdx],
        outputRange: [0, usableTrackHeight],
        extrapolate: 'clamp',
      }),
    [maxIdx, thumbIndexAnim, usableTrackHeight]
  );

  const fillTranslateY = useMemo(
    () =>
      thumbIndexAnim.interpolate({
        inputRange: [0, maxIdx],
        outputRange: [-usableTrackHeight, 0],
        extrapolate: 'clamp',
      }),
    [maxIdx, thumbIndexAnim, usableTrackHeight]
  );

  const cardDepthTransforms = useMemo(
    () =>
      grades.map((_, idx) => {
        if (grades.length <= 1) {
          return null;
        }
        return {
          scale: reelIndexAnim.interpolate({
            inputRange: [idx - 1, idx, idx + 1],
            outputRange: [0.945, 1, 0.945],
            extrapolate: 'clamp',
          }),
          opacity: reelIndexAnim.interpolate({
            inputRange: [idx - 1, idx, idx + 1],
            outputRange: [0.58, 1, 0.58],
            extrapolate: 'clamp',
          }),
        };
      }),
    [grades, reelIndexAnim]
  );

  const activeCardNaturalH = measuredHeights[safeCurrentIndex] ?? 0;
  const activeCardNeedsScroll = activeCardNaturalH > effectiveStageHeight + 4;

  return (
    <View style={styles.overlay} onLayout={handleOverlayLayout}>
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={dismissSheet}
      />

      <Animated.View
        style={[
          styles.sheetContainer,
          {
            maxHeight: maxSheetHeight,
            opacity: isMeasuredReady ? 1 : 0,
            transform: [{ translateY: sheetTranslateY }],
            paddingBottom: bottomPad,
          },
        ]}>
        <View
          onLayout={(e) => {
            const h = Math.round(e.nativeEvent.layout.height);
            if (h > 0) {
              setHeaderChromeHeight((prev) =>
                Math.abs(prev - h) > 1 ? h : prev
              );
            }
          }}>
          {/* Top Centered Drag Handle Zone — Swipe Down Here to Close */}
          <View
            style={styles.dragHandleContainer}
            onTouchStart={(e) => {
              handleStartYRef.current = e.nativeEvent.pageY;
            }}
            onMoveShouldSetResponderCapture={(e) =>
              e.nativeEvent.pageY - handleStartYRef.current > 5
            }
            onResponderMove={(e) => {
              const dy = e.nativeEvent.pageY - handleStartYRef.current;
              if (dy > 0) {
                sheetTranslateY.setValue(dy);
              }
            }}
            onResponderRelease={(e) => {
              const dy = e.nativeEvent.pageY - handleStartYRef.current;
              if (dy > 70) {
                dismissSheet();
              } else {
                Animated.spring(sheetTranslateY, {
                  toValue: 0,
                  bounciness: 4,
                  useNativeDriver: true,
                }).start();
              }
            }}
            onResponderTerminate={() => {
              Animated.spring(sheetTranslateY, {
                toValue: 0,
                useNativeDriver: true,
              }).start();
            }}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={dismissSheet}
              hitSlop={{ top: 10, bottom: 10, left: 32, right: 32 }}>
              <View style={styles.dragHandle} />
            </TouchableOpacity>
          </View>

          {/* Header */}
          <View
            style={[
              styles.headerRow,
              isCompactPhone && styles.headerRowCompact,
            ]}>
            <View style={styles.headerInfo}>
              <Text style={styles.subjectTitle} numberOfLines={1}>
                {subjectName}
              </Text>
              <Text style={styles.counterText} numberOfLines={1}>
                Ocena {safeCurrentIndex + 1} z {grades.length}
                {currentGrade.semester
                  ? `  ·  Semestr ${currentGrade.semester}`
                  : ''}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.closeButton}
              onPress={dismissSheet}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={20} color="#94a3b8" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Body Row: Magnetic Card-Snapping Vertical Reel + Right Vertical Scrubber */}
        <View
          style={[
            styles.bodyWithRailRow,
            isCompactPhone && styles.bodyWithRailRowCompact,
          ]}>
          <View
            style={[
              styles.cardStage,
              isCompactPhone && styles.cardStageCompact,
              { height: effectiveStageHeight },
            ]}
            onLayout={handleStageWidthLayout}
            onStartShouldSetResponderCapture={(e) => {
              isTouchingHorizontalStripRef.current = false;
              cardTouchStartRef.current = {
                x: e.nativeEvent.pageX,
                y: e.nativeEvent.pageY,
              };
              return false;
            }}
            onStartShouldSetResponder={() =>
              !activeCardNeedsScroll &&
              !isTouchingHorizontalStripRef.current &&
              grades.length > 1
            }
            onMoveShouldSetResponderCapture={(e) => {
              if (grades.length <= 1) return false;
              const dx = e.nativeEvent.pageX - cardTouchStartRef.current.x;
              const dy = e.nativeEvent.pageY - cardTouchStartRef.current.y;
              if (Math.abs(dy) < 8 || Math.abs(dy) < Math.abs(dx) * 1.15) {
                return false;
              }
              if (!activeCardNeedsScroll) return true;
              const curScroll = scrollOffsetsRef.current[safeCurrentIndex] ?? 0;
              const maxScroll = Math.max(
                0,
                activeCardNaturalH - effectiveStageHeight
              );
              if (dy > 0 && curScroll <= 2) return true;
              if (dy < 0 && curScroll >= maxScroll - 4) return true;
              return false;
            }}
            onResponderTerminationRequest={() => false}
            onResponderGrant={(e) => {
              reelIndexAnim.stopAnimation((val) => {
                liveReelIndexRef.current = val;
              });
              thumbIndexAnim.stopAnimation();
              const now = Date.now();
              cardDragRef.current = {
                anchorY: e.nativeEvent.pageY,
                startIndex: liveReelIndexRef.current,
                lastY: e.nativeEvent.pageY,
                lastTime: now,
                velocityY: 0,
              };
            }}
            onResponderMove={(e) => {
              if (grades.length <= 1) return;
              const pageY = e.nativeEvent.pageY;
              const now = Date.now();
              const dt = now - cardDragRef.current.lastTime;
              if (dt > 0) {
                const instantVy = (pageY - cardDragRef.current.lastY) / dt;
                cardDragRef.current.velocityY =
                  cardDragRef.current.velocityY * 0.4 + instantVy * 0.6;
                cardDragRef.current.lastY = pageY;
                cardDragRef.current.lastTime = now;
              }

              const dy = pageY - cardDragRef.current.anchorY;
              const deltaCards = (-dy / Math.max(stride, 1)) * 0.92;
              let rawIdx = cardDragRef.current.startIndex + deltaCards;
              const lastIdx = grades.length - 1;
              if (rawIdx < 0) {
                rawIdx *= 0.2;
              } else if (rawIdx > lastIdx) {
                rawIdx = lastIdx + (rawIdx - lastIdx) * 0.2;
              }
              liveReelIndexRef.current = rawIdx;
              reelIndexAnim.setValue(rawIdx);
              thumbIndexAnim.setValue(
                Math.min(Math.max(rawIdx, 0), lastIdx)
              );
            }}
            onResponderRelease={(e) => {
              if (grades.length <= 1) return;
              const dy = e.nativeEvent.pageY - cardDragRef.current.anchorY;
              const vy = cardDragRef.current.velocityY;
              const startRounded = Math.min(
                Math.max(Math.round(cardDragRef.current.startIndex), 0),
                grades.length - 1
              );
              const swipeThreshold = Math.min(stride * 0.14, 40);
              let targetIdx = Math.round(liveReelIndexRef.current);

              if (dy < -swipeThreshold || vy < -0.28) {
                targetIdx = Math.max(targetIdx, startRounded + 1);
              } else if (dy > swipeThreshold || vy > 0.28) {
                targetIdx = Math.min(targetIdx, startRounded - 1);
              }

              const velIdxPerSec = (-vy * 1000) / Math.max(stride, 1);
              springBothToCard(targetIdx, velIdxPerSec);
            }}
            onResponderTerminate={() => {
              springBothToCard(Math.round(liveReelIndexRef.current), 0);
            }}>
            <Animated.View
              style={{
                transform: [{ translateY: reelTranslateY }],
              }}>
              {grades.map((gradeItem, idx) => {
                const itemNaturalH = measuredHeights[idx] ?? 0;
                const itemNeedsScroll = itemNaturalH > effectiveStageHeight + 4;
                const itemAccent = getGradeColor(gradeItem.value);
                const shellPalette = getCardShellPalette(itemAccent, idx);
                const depthAnim = cardDepthTransforms[idx];

                return (
                  <Animated.View
                    key={`${gradeItem.id}-${idx}`}
                    style={[
                      styles.reelCardShell,
                      {
                        height: effectiveStageHeight,
                        marginBottom:
                          idx < grades.length - 1 ? REEL_PAGE_GAP : 0,
                        backgroundColor: shellPalette.backgroundColor,
                        borderColor: shellPalette.borderColor,
                      },
                      depthAnim
                        ? {
                            opacity: depthAnim.opacity,
                            transform: [{ scale: depthAnim.scale }],
                          }
                        : null,
                    ]}>
                    {itemNeedsScroll ? (
                      <ScrollView
                        style={{ flex: 1 }}
                        nestedScrollEnabled
                        showsVerticalScrollIndicator
                        scrollEventThrottle={16}
                        onScroll={(ev) => {
                          scrollOffsetsRef.current[idx] =
                            ev.nativeEvent.contentOffset.y;
                        }}
                        contentContainerStyle={styles.cardScrollContent}>
                        <View
                          style={styles.reelItemMeasureWrap}
                          onLayout={(ev) =>
                            handleItemLayout(idx, ev.nativeEvent.layout.height)
                          }>
                          <GradeCardContent
                            grade={gradeItem}
                            compact={isCompactPhone}
                            onHorizontalStripCapture={
                              markHorizontalStripCapture
                            }
                          />
                        </View>
                      </ScrollView>
                    ) : (
                      <View
                        style={styles.reelItemMeasureWrap}
                        onLayout={(ev) =>
                          handleItemLayout(idx, ev.nativeEvent.layout.height)
                        }>
                        <GradeCardContent
                          grade={gradeItem}
                          compact={isCompactPhone}
                          onHorizontalStripCapture={markHorizontalStripCapture}
                        />
                      </View>
                    )}
                  </Animated.View>
                );
              })}
            </Animated.View>
          </View>

          {/* Right-Side Vertical Scrubber Bar (Smooth Thumb + Magnetic Card-to-Card Snap) */}
          {grades.length > 1 && (
            <View
              style={[
                styles.verticalScrubberRail,
                isCompactPhone && styles.verticalScrubberRailCompact,
                { height: effectiveStageHeight },
              ]}>
              <View
                pointerEvents="none"
                style={[
                  styles.verticalTrackWrap,
                  { height: usableTrackHeight },
                ]}>
                <View
                  style={[
                    styles.verticalTrackBg,
                    { height: usableTrackHeight },
                  ]}>
                  <Animated.View
                    style={[
                      styles.verticalTrackFill,
                      {
                        height: usableTrackHeight,
                        backgroundColor: gradeColor,
                        transform: [{ translateY: fillTranslateY }],
                      },
                    ]}
                  />
                </View>

                {grades.map((gItem, i) => {
                  const dotTop =
                    (i / Math.max(grades.length - 1, 1)) * usableTrackHeight;
                  const isPast = i <= safeCurrentIndex;
                  const isActive = i === safeCurrentIndex;
                  const dotCol = getGradeColor(gItem.value);

                  return (
                    <View
                      key={`${gItem.id}-${i}`}
                      style={[
                        styles.verticalStepDot,
                        { top: dotTop },
                        isPast && { backgroundColor: dotCol },
                        isActive && styles.verticalStepDotActive,
                      ]}
                    />
                  );
                })}

                <Animated.View
                  style={[
                    styles.verticalThumb,
                    isCompactPhone && styles.verticalThumbCompact,
                    {
                      borderColor: gradeColor,
                      transform: [{ translateY: thumbTranslateY }],
                    },
                  ]}>
                  <Text
                    style={[styles.verticalThumbText, { color: gradeColor }]}
                    numberOfLines={1}>
                    {currentGrade.value}
                  </Text>
                </Animated.View>
              </View>

              {/* Leaf touch overlay guarantees exact locationY & generous touch width */}
              <View
                collapsable={false}
                style={styles.scrubberTouchOverlay}
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => true}
                onResponderTerminationRequest={() => false}
                onResponderGrant={(evt) => {
                  const grantLocY = evt.nativeEvent.locationY;
                  const grantPageY = evt.nativeEvent.pageY;
                  scrubGestureRef.current = { grantLocY, grantPageY };

                  const currentThumbY =
                    RAIL_VERTICAL_PADDING +
                    (Math.min(
                      Math.max(liveThumbIndexRef.current, 0),
                      grades.length - 1
                    ) /
                      Math.max(grades.length - 1, 1)) *
                      usableTrackHeight;

                  if (Math.abs(grantLocY - currentThumbY) > 22) {
                    const ratio = Math.max(
                      0,
                      Math.min(
                        1,
                        (grantLocY - RAIL_VERTICAL_PADDING) / usableTrackHeight
                      )
                    );
                    const tappedIdx = Math.round(ratio * (grades.length - 1));
                    springBothToCard(tappedIdx, 0);
                  } else {
                    thumbIndexAnim.stopAnimation((val) => {
                      liveThumbIndexRef.current = val;
                    });
                  }
                }}
                onResponderMove={(evt) => {
                  const dy =
                    evt.nativeEvent.pageY - scrubGestureRef.current.grantPageY;
                  if (Math.abs(dy) < 2) return;
                  const localY = scrubGestureRef.current.grantLocY + dy;
                  const ratio = Math.max(
                    0,
                    Math.min(
                      1,
                      (localY - RAIL_VERTICAL_PADDING) / usableTrackHeight
                    )
                  );
                  const continuousIdx = ratio * (grades.length - 1);

                  thumbIndexAnim.stopAnimation();
                  liveThumbIndexRef.current = continuousIdx;
                  thumbIndexAnim.setValue(continuousIdx);

                  const prevTarget = targetReelIndexRef.current;
                  let nextTarget = prevTarget;
                  if (continuousIdx > prevTarget + 0.53) {
                    nextTarget = Math.min(
                      grades.length - 1,
                      Math.round(continuousIdx)
                    );
                  } else if (continuousIdx < prevTarget - 0.53) {
                    nextTarget = Math.max(0, Math.round(continuousIdx));
                  }

                  if (nextTarget !== prevTarget) {
                    springReelToCard(nextTarget, 0);
                  }
                }}
                onResponderRelease={(evt) => {
                  const dy =
                    evt.nativeEvent.pageY - scrubGestureRef.current.grantPageY;
                  if (Math.abs(dy) < 4) {
                    const localY = scrubGestureRef.current.grantLocY + dy;
                    const ratio = Math.max(
                      0,
                      Math.min(
                        1,
                        (localY - RAIL_VERTICAL_PADDING) / usableTrackHeight
                      )
                    );
                    springBothToCard(
                      continuousClamp(
                        Math.round(ratio * (grades.length - 1)),
                        grades.length - 1
                      ),
                      0
                    );
                  } else {
                    springBothToCard(targetReelIndexRef.current, 0);
                  }
                }}
                onResponderTerminate={() => {
                  springBothToCard(targetReelIndexRef.current, 0);
                }}
              />
            </View>
          )}
        </View>
      </Animated.View>
    </View>
  );
};

function continuousClamp(val: number, max: number): number {
  return Math.min(Math.max(val, 0), Math.max(max, 0));
}

export const GradeDetailsModal: React.FC<GradeDetailsModalProps> = ({
  visible,
  subjectName,
  grades,
  initialIndex,
  onClose,
}) => {
  if (!visible || grades.length === 0) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      supportedOrientations={[
        'portrait',
        'portrait-upside-down',
        'landscape',
        'landscape-left',
        'landscape-right',
      ]}
      onRequestClose={onClose}
      statusBarTranslucent={true}>
      <GradeDetailsSheetContent
        key={`${subjectName}-${initialIndex}-${grades.length}`}
        subjectName={subjectName}
        grades={grades}
        initialIndex={initialIndex}
        onClose={onClose}
      />
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
    width: '100%',
    backgroundColor: '#0f172a',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: '#1e293b',
    paddingTop: 6,
  },
  dragHandleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  dragHandle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#475569',
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
  headerRowCompact: {
    paddingHorizontal: 15,
    paddingBottom: 10,
  },
  headerInfo: {
    flex: 1,
    paddingRight: 12,
  },
  subjectTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#f8fafc',
  },
  counterText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
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
  bodyWithRailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingLeft: 18,
    paddingRight: 10,
    paddingTop: 14,
  },
  bodyWithRailRowCompact: {
    paddingLeft: 12,
    paddingRight: 6,
    paddingTop: 10,
  },
  cardStage: {
    flex: 1,
    minWidth: 0,
    paddingRight: 6,
    overflow: 'hidden',
  },
  cardStageCompact: {
    paddingRight: 4,
  },
  reelCardShell: {
    width: '100%',
    borderRadius: 22,
    borderWidth: 1.5,
    justifyContent: 'flex-start',
    overflow: 'hidden',
  },
  reelItemMeasureWrap: {
    flexShrink: 0,
  },
  cardScrollContent: {
    paddingBottom: 2,
  },
  cardNaturalStack: {
    padding: 14,
    gap: 11,
  },
  cardNaturalStackCompact: {
    padding: 11,
    gap: 9,
  },
  gradeHeaderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: 'rgba(15, 23, 42, 0.52)',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.16)',
  },
  gradeHeaderCardCompact: {
    gap: 9,
    padding: 10,
  },
  gradeBadge: {
    width: 56,
    height: 56,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradeBadgeCompact: {
    width: 46,
    height: 46,
    borderRadius: 13,
  },
  gradeBadgeText: {
    fontSize: 24,
    fontWeight: '800',
  },
  gradeBadgeTextCompact: {
    fontSize: 20,
  },
  tagsCol: {
    flex: 1,
    minWidth: 0,
    gap: 7,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f8fafc',
  },
  categoryNameCompact: {
    fontSize: 15,
  },
  metaPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  metaPillsRowCompact: {
    flexWrap: 'nowrap',
    gap: 5,
  },
  weightPill: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 5,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
  },
  countsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    gap: 5,
    backgroundColor: 'rgba(16, 185, 129, 0.14)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.32)',
  },
  metaPillCompact: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    gap: 3.5,
  },
  countsPillNegative: {
    backgroundColor: 'rgba(248, 113, 113, 0.14)',
    borderColor: 'rgba(248, 113, 113, 0.32)',
  },
  weightText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#38bdf8',
  },
  countsText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#34d399',
  },
  metaPillTextCompact: {
    fontSize: 11,
  },
  correctionCard: {
    backgroundColor: 'rgba(15, 23, 42, 0.52)',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.16)',
    gap: 10,
  },
  correctionCardCompact: {
    paddingVertical: 10,
    paddingHorizontal: 11,
    gap: 8,
  },
  correctionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  correctionTitle: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#cbd5e1',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  correctionScrollRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 4,
  },
  correctionStep: {
    alignItems: 'center',
    gap: 4,
    minWidth: 68,
  },
  correctionArrow: {
    marginTop: 4,
  },
  stepLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94a3b8',
  },
  miniBadge: {
    minWidth: 38,
    height: 36,
    paddingHorizontal: 9,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniBadgeCompact: {
    minWidth: 34,
    height: 33,
    paddingHorizontal: 8,
  },
  miniBadgeText: {
    fontSize: 15,
    fontWeight: '800',
  },
  miniBadgeTextCompact: {
    fontSize: 14,
  },
  stepDate: {
    fontSize: 10.5,
    color: '#94a3b8',
  },
  infoSection: {
    backgroundColor: 'rgba(15, 23, 42, 0.52)',
    borderRadius: 16,
    padding: 13,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.16)',
    gap: 10,
  },
  infoSectionCompact: {
    padding: 11,
    gap: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  infoLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 7,
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94a3b8',
  },
  infoValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: 14,
    fontWeight: '700',
    color: '#f1f5f9',
  },
  infoValueCompact: {
    fontSize: 13.5,
  },
  commentBox: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.68)',
    padding: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.16)',
    marginTop: 2,
  },
  commentLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#38bdf8',
    marginBottom: 3,
  },
  commentText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#e2e8f0',
  },
  verticalScrubberRail: {
    width: 44,
    position: 'relative',
    paddingVertical: RAIL_VERTICAL_PADDING,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  verticalScrubberRailCompact: {
    width: 36,
  },
  scrubberTouchOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: -6,
    right: -6,
  },
  verticalTrackWrap: {
    width: '100%',
    position: 'relative',
    alignItems: 'center',
  },
  verticalTrackBg: {
    position: 'absolute',
    top: 0,
    width: 4,
    borderRadius: 2,
    backgroundColor: '#1e293b',
    overflow: 'hidden',
  },
  verticalTrackFill: {
    width: '100%',
    borderRadius: 2,
  },
  verticalStepDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#334155',
    marginTop: -4,
  },
  verticalStepDotActive: {
    opacity: 0,
  },
  verticalThumb: {
    position: 'absolute',
    top: 0,
    minWidth: 30,
    height: 30,
    paddingHorizontal: 5,
    borderRadius: 15,
    backgroundColor: '#0f172a',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
  },
  verticalThumbCompact: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    marginTop: -14,
  },
  verticalThumbText: {
    fontSize: 12,
    fontWeight: '800',
  },
});

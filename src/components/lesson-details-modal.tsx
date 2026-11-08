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
import { useLibrus } from '@/context/LibrusContext';
import { TerminarzEvent, TimetableLesson } from '@/types/librus';
import { decodeHtmlEntities } from '@/utils/html';
import { getSubjectColor } from '@/utils/subjectColors';
import {
  getTerminarzColor,
  isGradedAssessmentCategory,
} from '@/utils/terminarzMatcher';
import {
  AttendanceIcon,
  getAttendanceBadgeConfig,
} from './timetable/AttendanceIcon';

interface LessonDetailsModalProps {
  visible: boolean;
  openKey?: string;
  dayLabel: string;
  lessons: TimetableLesson[];
  initialIndex: number;
  initialExpandHideEventId?: string;
  onClose: () => void;
}

const RAIL_VERTICAL_PADDING = 18;
const REEL_PAGE_GAP = 14;

function getLessonAccentColor(lesson: TimetableLesson): string {
  if (lesson.isCancelled) return '#ef4444';
  if (lesson.isStandaloneEvent && lesson.events && lesson.events.length > 0) {
    return getTerminarzColor(lesson.events[0].category);
  }
  return getSubjectColor(lesson.subject);
}

function getLessonShellAccentColor(lesson: TimetableLesson): string {
  const isStandalone = Boolean(lesson.isStandaloneEvent);
  const isCancelled = !isStandalone && Boolean(lesson.isCancelled);
  const isSubstitution =
    !isStandalone && !isCancelled && Boolean(lesson.isSubstitution);
  if (isCancelled) return '#ef4444';
  if (isSubstitution) return '#f59e0b';
  const primaryEv = lesson.events?.[0] ?? null;
  if (
    primaryEv &&
    (isStandalone || isGradedAssessmentCategory(primaryEv.category))
  ) {
    return getTerminarzColor(primaryEv.category);
  }
  return getLessonAccentColor(lesson);
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

interface LessonCardContentProps {
  lesson: TimetableLesson;
  compact: boolean;
  expandedHideEventId: string | null;
  onToggleExpandHide: (eventId: string) => void;
  onHideSingle: (event: TerminarzEvent) => void;
  onHideRule: (event: TerminarzEvent) => void;
}

const LessonCardContent: React.FC<LessonCardContentProps> = React.memo(
  ({
    lesson,
    compact,
    expandedHideEventId,
    onToggleExpandHide,
    onHideSingle,
    onHideRule,
  }) => {
    const isStandalone = Boolean(lesson.isStandaloneEvent);
    const isFreeDay = !isStandalone && Boolean(lesson.isFreeDay);
    const isCancelled = !isStandalone && Boolean(lesson.isCancelled || isFreeDay);
    const isSubstitution =
      !isStandalone && !isCancelled && Boolean(lesson.isSubstitution);
    const attConfig = lesson.attendance
      ? getAttendanceBadgeConfig(lesson.attendance.kind)
      : null;
    const itemEvents = !isCancelled ? lesson.events ?? [] : [];
    const primaryEvent = itemEvents[0] ?? null;

    const baseAccent = getLessonAccentColor(lesson);
    const standaloneNoHourNum =
      isStandalone && primaryEvent && primaryEvent.lessonNumber < 0;

    const cleanClassroom = lesson.classroom
      ? lesson.classroom.replace(/\s+/g, ' ').trim()
      : '';
    const cleanTeacher = lesson.teacher
      ? lesson.teacher.replace(/\s+/g, ' ').trim()
      : '';

    const changeBannerTitle = isFreeDay
      ? 'Dzień wolny szkoły'
      : isCancelled
        ? 'Lekcja odwołana'
        : lesson.changeType === 'room'
          ? 'Zmiana sali'
          : lesson.changeType === 'moved'
            ? 'Przesunięcie lekcji'
            : 'Zastępstwo';

    return (
      <View
        style={[
          styles.cardNaturalStack,
          compact && styles.cardNaturalStackCompact,
        ]}>
        {/* Top Hero Banner */}
        <View
          style={[
            styles.heroRow,
            compact && styles.heroRowCompact,
            { borderColor: `${baseAccent}38` },
          ]}>
          <View
            style={[
              styles.hourBigBadge,
              compact && styles.hourBigBadgeCompact,
              {
                backgroundColor: `${baseAccent}22`,
                borderColor: `${baseAccent}66`,
              },
            ]}>
            <Text
              style={[
                styles.hourBigNumber,
                compact && styles.hourBigNumberCompact,
                { color: baseAccent },
              ]}>
              {standaloneNoHourNum ? '•' : lesson.hourNumber}
            </Text>
          </View>

          <View style={styles.heroDetails}>
            <Text
              style={[
                styles.heroSubject,
                compact && styles.heroSubjectCompact,
                isCancelled && styles.heroSubjectCancelled,
              ]}
              numberOfLines={2}>
              {lesson.subject}
            </Text>
            <Text style={styles.heroTime}>
              {lesson.startTime} – {lesson.endTime}
            </Text>
          </View>
        </View>

        {/* Change / Cancellation Box (was -> now) */}
        {(isCancelled || isSubstitution || lesson.original) && (
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

            {lesson.original ? (
              <View style={styles.wasNowContainer}>
                <Text style={styles.wasText}>
                  Było: {lesson.original.subject || lesson.subject}
                  {lesson.original.teacher ? ` · ${lesson.original.teacher}` : ''}
                  {lesson.original.classroom
                    ? ` · s. ${lesson.original.classroom}`
                    : ''}
                </Text>
                {!isCancelled && (
                  <Text style={styles.nowText}>
                    Teraz: {lesson.subject}
                    {cleanTeacher ? ` · ${cleanTeacher}` : ''}
                    {cleanClassroom ? ` · s. ${cleanClassroom}` : ''}
                  </Text>
                )}
              </View>
            ) : lesson.note ? (
              <Text style={styles.changeNoteText}>{lesson.note}</Text>
            ) : null}
          </View>
        )}

        {/* Terminarz Events Section + "Ukryj" & Compact Auto-Adjust Tag */}
        {itemEvents.length > 0 && (
          <View style={styles.terminarzList}>
            {itemEvents.map((ev) => {
              const evColor = getTerminarzColor(ev.category);
              const isHideExpanded = expandedHideEventId === ev.id;
              const evTeacherClean = ev.teacher
                ? ev.teacher.replace(/\s+/g, ' ').trim()
                : '';
              const teacherShort = evTeacherClean
                ? evTeacherClean.split(' ')[0]
                : ev.subject || ev.displayType;

              return (
                <View
                  key={ev.id}
                  style={[
                    styles.terminarzCard,
                    compact && styles.terminarzCardCompact,
                    {
                      backgroundColor: 'rgba(15, 23, 42, 0.56)',
                      borderColor: `${evColor}66`,
                    },
                  ]}>
                  <View style={styles.terminarzHeaderRow}>
                    <View style={styles.terminarzTitleWrap}>
                      <Ionicons name="calendar" size={14} color={evColor} />
                      <Text
                        style={[styles.terminarzTitle, { color: evColor }]}
                        numberOfLines={1}>
                        {ev.displayType}
                      </Text>
                      {ev.autoAdjustedFromLesson !== undefined && (
                        <View style={styles.autoAdjustPill}>
                          <Text style={styles.autoAdjustPillText}>
                            auto z lek. {ev.autoAdjustedFromLesson}
                          </Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.terminarzRightActions}>
                      <TouchableOpacity
                        activeOpacity={0.75}
                        onPress={() => onToggleExpandHide(ev.id)}
                        style={styles.hideTriggerBtn}>
                        <Ionicons
                          name="eye-off-outline"
                          size={13}
                          color="#94a3b8"
                        />
                        <Text style={styles.hideTriggerText}>Ukryj</Text>
                      </TouchableOpacity>

                      <View
                        style={[
                          styles.terminarzBadge,
                          {
                            backgroundColor: `${evColor}24`,
                            borderColor: `${evColor}77`,
                          },
                        ]}>
                        <Text
                          style={[
                            styles.terminarzBadgeText,
                            { color: evColor },
                          ]}>
                          {ev.shortLabel}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {ev.description ? (
                    <Text style={styles.terminarzDesc}>{ev.description}</Text>
                  ) : null}

                  {(evTeacherClean || ev.addedAt) && (
                    <View style={styles.terminarzMetaBlock}>
                      {evTeacherClean ? (
                        <Text style={styles.terminarzMeta} numberOfLines={1}>
                          Nauczyciel: {evTeacherClean}
                        </Text>
                      ) : null}
                      {ev.addedAt ? (
                        <Text style={styles.terminarzMeta} numberOfLines={1}>
                          Dodano: {ev.addedAt.trim()}
                        </Text>
                      ) : null}
                    </View>
                  )}

                  {/* Inline Clean Hide Prompt: This Date vs Always From Teacher */}
                  {isHideExpanded && (
                    <View style={styles.hideChoiceBox}>
                      <Text style={styles.hideChoiceLabel}>
                        Ukryj w planie lekcji (przywrócisz w Ustawieniach):
                      </Text>
                      <View style={styles.hideChoiceButtonsRow}>
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() => onHideSingle(ev)}
                          style={styles.hideOptionBtn}>
                          <Text style={styles.hideOptionBtnText}>
                            Tylko ten termin
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() => onHideRule(ev)}
                          style={[
                            styles.hideOptionBtn,
                            styles.hideOptionBtnAlways,
                          ]}>
                          <Text
                            style={styles.hideOptionBtnAlwaysText}
                            numberOfLines={1}>
                            Zawsze ({ev.displayType} · {teacherShort})
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Info Grid */}
        <View style={styles.infoList}>
          <View
            style={[
              styles.infoPanelBox,
              compact && styles.infoPanelBoxCompact,
            ]}>
            <View style={styles.infoRow}>
              <View style={styles.infoLabelRow}>
                <Ionicons name="location-outline" size={15} color="#94a3b8" />
                <Text style={styles.infoLabel}>Sala lekcyjna</Text>
              </View>
              <Text
                style={[
                  styles.infoValue,
                  compact && styles.infoValueCompact,
                ]}
                numberOfLines={1}>
                {cleanClassroom ? `s. ${cleanClassroom}` : 'Brak danych'}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <View style={styles.infoLabelRow}>
                <Ionicons name="person-outline" size={15} color="#94a3b8" />
                <Text style={styles.infoLabel}>Nauczyciel</Text>
              </View>
              <Text
                style={[
                  styles.infoValue,
                  compact && styles.infoValueCompact,
                ]}
                numberOfLines={1}>
                {cleanTeacher || 'Brak danych'}
              </Text>
            </View>
          </View>

          {/* Attendance Block (Regular Lessons Only) */}
          {!isStandalone && (
            <View
              style={[
                styles.attendanceSection,
                compact && styles.attendanceSectionCompact,
              ]}>
              <View style={styles.attendanceTopRow}>
                <View style={styles.infoLabelRow}>
                  <Ionicons
                    name="checkmark-done-circle-outline"
                    size={15}
                    color="#94a3b8"
                  />
                  <Text style={styles.infoLabel}>Frekwencja</Text>
                </View>

                {lesson.attendance && attConfig ? (
                  <View style={styles.attendanceRight}>
                    <AttendanceIcon attendance={lesson.attendance} size="md" />
                    <Text
                      style={[
                        styles.attendanceTypeName,
                        compact && styles.attendanceTypeNameCompact,
                        { color: attConfig.color },
                      ]}
                      numberOfLines={1}>
                      {lesson.attendance.name} (
                      {lesson.attendance.symbol.toUpperCase()})
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.attendanceUnmarked}>Brak wpisu</Text>
                )}
              </View>

              {lesson.attendance &&
                (lesson.attendance.addedBy || lesson.attendance.addedAt) && (
                  <View style={styles.attendanceMetaBlock}>
                    {lesson.attendance.addedBy ? (
                      <Text style={styles.attendanceMeta} numberOfLines={1}>
                        Wystawił(a):{' '}
                        {lesson.attendance.addedBy.replace(/\s+/g, ' ').trim()}
                      </Text>
                    ) : null}
                    {lesson.attendance.addedAt ? (
                      <Text style={styles.attendanceMeta} numberOfLines={1}>
                        Dodano: {lesson.attendance.addedAt.trim()}
                      </Text>
                    ) : null}
                  </View>
                )}
            </View>
          )}

          {/* Lesson Topic Block */}
          {lesson.topic ? (
            <View
              style={[styles.topicBox, compact && styles.topicBoxCompact]}>
              <Ionicons
                name="document-text-outline"
                size={16}
                color={baseAccent}
                style={{ marginTop: 2 }}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.topicLabel, { color: baseAccent }]}>
                  Temat lekcji
                </Text>
                <Text style={styles.topicText}>
                  {decodeHtmlEntities(lesson.topic)}
                </Text>
              </View>
            </View>
          ) : null}
        </View>
      </View>
    );
  }
);
LessonCardContent.displayName = 'LessonCardContent';

const LessonDetailsSheetContent: React.FC<{
  dayLabel: string;
  lessons: TimetableLesson[];
  initialIndex: number;
  initialExpandHideEventId?: string;
  onClose: () => void;
}> = ({
  dayLabel,
  lessons,
  initialIndex,
  initialExpandHideEventId,
  onClose,
}) => {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isCompactPhone = windowWidth < 480;
  const { hideTerminarzSingleEvent, hideTerminarzRule } = useLibrus();

  const [overlayHeight, setOverlayHeight] = useState<number>(0);
  const [headerChromeHeight, setHeaderChromeHeight] = useState<number>(84);
  const pageHeight = overlayHeight > 0 ? overlayHeight : windowHeight;

  const validatedInitial = Math.min(
    Math.max(initialIndex, 0),
    Math.max(lessons.length - 1, 0)
  );
  const [currentIndex, setCurrentIndex] = useState<number>(validatedInitial);
  const activeIndexRef = useRef<number>(validatedInitial);
  const targetReelIndexRef = useRef<number>(validatedInitial);
  const liveReelIndexRef = useRef<number>(validatedInitial);
  const liveThumbIndexRef = useRef<number>(validatedInitial);
  const lessonsCountRef = useRef<number>(lessons.length);

  const [expandedHideEventId, setExpandedHideEventId] = useState<string | null>(
    initialExpandHideEventId ?? null
  );

  // Sheet dismiss animation (top handle bar ONLY)
  const [sheetTranslateY] = useState(() => new Animated.Value(0));
  const handleStartYRef = useRef<number>(0);
  const isClosingRef = useRef<boolean>(false);

  // Decoupled native-driven animations:
  // - `reelIndexAnim`: snaps card-to-card with magnetic spring + depth scale
  // - `thumbIndexAnim`: glides smoothly with finger on scrubber and snaps on release
  const [reelIndexAnim] = useState(() => new Animated.Value(validatedInitial));
  const [thumbIndexAnim] = useState(() => new Animated.Value(validatedInitial));

  // Locked max height measurement across all lessons in this day
  const stageWidthRef = useRef<number>(0);
  const [measuredHeights, setMeasuredHeights] = useState<Record<number, number>>(
    {}
  );
  const [lockedNaturalMax, setLockedNaturalMax] = useState<number | null>(null);
  const [readyFallback, setReadyFallback] = useState<boolean>(false);
  const scrollOffsetsRef = useRef<Record<number, number>>({});

  // Gesture tracking refs
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

  // Clamp index cleanly if hiding a standalone event reduces `lessons.length` while open
  useEffect(() => {
    lessonsCountRef.current = lessons.length;
    const maxValid = Math.max(lessons.length - 1, 0);
    if (activeIndexRef.current > maxValid) {
      activeIndexRef.current = maxValid;
      targetReelIndexRef.current = maxValid;
      liveReelIndexRef.current = maxValid;
      liveThumbIndexRef.current = maxValid;
      reelIndexAnim.setValue(maxValid);
      thumbIndexAnim.setValue(maxValid);
      Promise.resolve().then(() => {
        setCurrentIndex(maxValid);
      });
    }
  }, [lessons.length, reelIndexAnim, thumbIndexAnim]);

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
      const maxValid = Math.max(lessonsCountRef.current - 1, 0);
      const rounded = Math.min(Math.max(Math.round(value), 0), maxValid);
      if (rounded !== activeIndexRef.current) {
        activeIndexRef.current = rounded;
        setExpandedHideEventId(null);
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
        if (Object.keys(next).length >= lessons.length) {
          const maxH = Object.values(next).reduce((m, v) => Math.max(m, v), 0);
          setLockedNaturalMax((curr) => (curr === null ? maxH : curr));
        }
        return next;
      });
    },
    [lessons.length]
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
      if (lessons.length <= 1) return;
      const clamped = Math.min(Math.max(targetIndex, 0), lessons.length - 1);
      targetReelIndexRef.current = clamped;
      if (clamped !== activeIndexRef.current) {
        activeIndexRef.current = clamped;
        setExpandedHideEventId(null);
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
    [lessons.length, reelIndexAnim, triggerHaptic]
  );

  const springBothToCard = useCallback(
    (targetIndex: number, velocityIndexPerSec: number = 0) => {
      if (lessons.length <= 1) return;
      const clamped = Math.min(Math.max(targetIndex, 0), lessons.length - 1);
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
    [lessons.length, springReelToCard, thumbIndexAnim]
  );

  const handleToggleExpandHide = useCallback((eventId: string) => {
    setExpandedHideEventId((prev) => (prev === eventId ? null : eventId));
  }, []);

  const handleHideSingle = useCallback(
    (ev: TerminarzEvent) => {
      triggerHaptic();
      setExpandedHideEventId(null);
      hideTerminarzSingleEvent(ev);
    },
    [hideTerminarzSingleEvent, triggerHaptic]
  );

  const handleHideRule = useCallback(
    (ev: TerminarzEvent) => {
      triggerHaptic();
      setExpandedHideEventId(null);
      hideTerminarzRule(ev);
    },
    [hideTerminarzRule, triggerHaptic]
  );

  const safeCurrentIndex = Math.min(
    Math.max(currentIndex, 0),
    lessons.length - 1
  );
  const currentLesson = lessons[safeCurrentIndex] || lessons[0];
  const isStandalone = Boolean(currentLesson.isStandaloneEvent);
  const isCancelled = !isStandalone && Boolean(currentLesson.isCancelled);
  const itemEvents = !isCancelled ? currentLesson.events ?? [] : [];
  const primaryActiveEv = itemEvents[0] ?? null;
  const currentAccent = getLessonShellAccentColor(currentLesson);
  const standaloneNoHourNum =
    isStandalone && primaryActiveEv && primaryActiveEv.lessonNumber < 0;

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
  const naturalMax = lockedNaturalMax ?? (observedMax > 0 ? observedMax : 290);
  const effectiveStageHeight = Math.min(
    Math.max(naturalMax, 190),
    maxAvailableStageHeight
  );
  const isMeasuredReady =
    lockedNaturalMax !== null ||
    readyFallback ||
    (lessons.length <= 1 && observedMax > 0);

  const stride = effectiveStageHeight + REEL_PAGE_GAP;
  const maxIdx = Math.max(lessons.length - 1, 1);
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
      lessons.map((_, idx) => {
        if (lessons.length <= 1) {
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
    [lessons, reelIndexAnim]
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
              <Text style={styles.dayTitle} numberOfLines={1}>
                {dayLabel}
              </Text>
              <Text style={styles.counterText} numberOfLines={1}>
                {isStandalone
                  ? `Wydarzenie · pozycja ${safeCurrentIndex + 1} z ${lessons.length}`
                  : `Lekcja ${safeCurrentIndex + 1} z ${lessons.length} (nr ${currentLesson.hourNumber})`}
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
            onTouchStart={(e) => {
              cardTouchStartRef.current = {
                x: e.nativeEvent.pageX,
                y: e.nativeEvent.pageY,
              };
            }}
            onStartShouldSetResponder={() =>
              !activeCardNeedsScroll && lessons.length > 1
            }
            onMoveShouldSetResponderCapture={(e) => {
              if (lessons.length <= 1) return false;
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
              if (lessons.length <= 1) return;
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
              const lastIdx = lessons.length - 1;
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
              if (lessons.length <= 1) return;
              const dy = e.nativeEvent.pageY - cardDragRef.current.anchorY;
              const vy = cardDragRef.current.velocityY;
              const startRounded = Math.min(
                Math.max(Math.round(cardDragRef.current.startIndex), 0),
                lessons.length - 1
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
              {lessons.map((lessonItem, idx) => {
                const itemNaturalH = measuredHeights[idx] ?? 0;
                const itemNeedsScroll = itemNaturalH > effectiveStageHeight + 4;
                const itemExpandedHide =
                  idx === safeCurrentIndex ? expandedHideEventId : null;
                const itemAccent = getLessonShellAccentColor(lessonItem);
                const shellPalette = getCardShellPalette(itemAccent, idx);
                const depthAnim = cardDepthTransforms[idx];

                return (
                  <Animated.View
                    key={`${lessonItem.id}-${idx}`}
                    style={[
                      styles.reelCardShell,
                      {
                        height: effectiveStageHeight,
                        marginBottom:
                          idx < lessons.length - 1 ? REEL_PAGE_GAP : 0,
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
                          <LessonCardContent
                            lesson={lessonItem}
                            compact={isCompactPhone}
                            expandedHideEventId={itemExpandedHide}
                            onToggleExpandHide={handleToggleExpandHide}
                            onHideSingle={handleHideSingle}
                            onHideRule={handleHideRule}
                          />
                        </View>
                      </ScrollView>
                    ) : (
                      <View
                        style={styles.reelItemMeasureWrap}
                        onLayout={(ev) =>
                          handleItemLayout(idx, ev.nativeEvent.layout.height)
                        }>
                        <LessonCardContent
                          lesson={lessonItem}
                          compact={isCompactPhone}
                          expandedHideEventId={itemExpandedHide}
                          onToggleExpandHide={handleToggleExpandHide}
                          onHideSingle={handleHideSingle}
                          onHideRule={handleHideRule}
                        />
                      </View>
                    )}
                  </Animated.View>
                );
              })}
            </Animated.View>
          </View>

          {/* Right-Side Vertical Scrubber Bar with Terminarz Event Markers */}
          {lessons.length > 1 && (
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
                        backgroundColor: currentAccent,
                        transform: [{ translateY: fillTranslateY }],
                      },
                    ]}
                  />
                </View>

                {lessons.map((lessonItem, i) => {
                  const dotTop =
                    (i / Math.max(lessons.length - 1, 1)) * usableTrackHeight;
                  const isPast = i <= safeCurrentIndex;
                  const isActive = i === safeCurrentIndex;
                  const isCancelledDot =
                    !lessonItem.isStandaloneEvent &&
                    Boolean(lessonItem.isCancelled);
                  const lessonPrimaryEv =
                    !isCancelledDot &&
                    !lessonItem.isSubstitution &&
                    lessonItem.events &&
                    lessonItem.events.length > 0
                      ? lessonItem.events[0]
                      : null;
                  const eventMarkerColor = lessonPrimaryEv
                    ? getTerminarzColor(lessonPrimaryEv.category)
                    : null;
                  const dotColor =
                    eventMarkerColor || getLessonAccentColor(lessonItem);

                  return (
                    <View
                      key={`${lessonItem.id}-${i}`}
                      style={[
                        styles.verticalStepDot,
                        { top: dotTop },
                        isPast && { backgroundColor: dotColor },
                        eventMarkerColor
                          ? {
                              width: 12,
                              height: 12,
                              borderRadius: 6,
                              backgroundColor: eventMarkerColor,
                              borderWidth: 2,
                              borderColor: '#0f172a',
                              marginTop: -6,
                            }
                          : null,
                        isCancelledDot && styles.verticalStepDotCancelled,
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
                      borderColor: currentAccent,
                      transform: [{ translateY: thumbTranslateY }],
                    },
                  ]}>
                  <Text
                    style={[styles.verticalThumbText, { color: currentAccent }]}
                    numberOfLines={1}>
                    {standaloneNoHourNum ? '•' : currentLesson.hourNumber}
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
                      lessons.length - 1
                    ) /
                      Math.max(lessons.length - 1, 1)) *
                      usableTrackHeight;

                  if (Math.abs(grantLocY - currentThumbY) > 22) {
                    const ratio = Math.max(
                      0,
                      Math.min(
                        1,
                        (grantLocY - RAIL_VERTICAL_PADDING) / usableTrackHeight
                      )
                    );
                    const tappedIdx = Math.round(ratio * (lessons.length - 1));
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
                  const continuousIdx = ratio * (lessons.length - 1);

                  thumbIndexAnim.stopAnimation();
                  liveThumbIndexRef.current = continuousIdx;
                  thumbIndexAnim.setValue(continuousIdx);

                  const prevTarget = targetReelIndexRef.current;
                  let nextTarget = prevTarget;
                  if (continuousIdx > prevTarget + 0.53) {
                    nextTarget = Math.min(
                      lessons.length - 1,
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
                    const rawSnap = Math.round(ratio * (lessons.length - 1));
                    const snapIdx = Math.min(
                      Math.max(rawSnap, 0),
                      Math.max(lessons.length - 1, 0)
                    );
                    springBothToCard(snapIdx, 0);
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

export const LessonDetailsModal: React.FC<LessonDetailsModalProps> = ({
  visible,
  openKey,
  dayLabel,
  lessons,
  initialIndex,
  initialExpandHideEventId,
  onClose,
}) => {
  if (!visible || lessons.length === 0) return null;

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
      <LessonDetailsSheetContent
        key={openKey || `${dayLabel}-${initialIndex}`}
        dayLabel={dayLabel}
        lessons={lessons}
        initialIndex={initialIndex}
        initialExpandHideEventId={initialExpandHideEventId}
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
  dayTitle: {
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
    padding: 15,
    gap: 12,
  },
  cardNaturalStackCompact: {
    padding: 12,
    gap: 10,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  heroRowCompact: {
    gap: 11,
    paddingBottom: 10,
  },
  hourBigBadge: {
    width: 54,
    height: 54,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hourBigBadgeCompact: {
    width: 48,
    height: 48,
    borderRadius: 13,
  },
  hourBigNumber: {
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 26,
  },
  hourBigNumberCompact: {
    fontSize: 20,
    lineHeight: 24,
  },
  heroDetails: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  heroSubject: {
    fontSize: 17,
    fontWeight: '800',
    color: '#f8fafc',
  },
  heroSubjectCompact: {
    fontSize: 16,
  },
  heroSubjectCancelled: {
    textDecorationLine: 'line-through',
    color: '#94a3b8',
  },
  heroTime: {
    fontSize: 13,
    fontWeight: '600',
    color: '#cbd5e1',
  },
  changeBox: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 11,
    gap: 5,
  },
  changeBoxCancelled: {
    backgroundColor: 'rgba(239, 68, 68, 0.14)',
    borderColor: 'rgba(239, 68, 68, 0.38)',
  },
  changeBoxSubstitution: {
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
    borderColor: 'rgba(245, 158, 11, 0.4)',
  },
  changeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  changeTitle: {
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  wasNowContainer: {
    gap: 3,
  },
  wasText: {
    fontSize: 12,
    color: '#94a3b8',
    textDecorationLine: 'line-through',
  },
  nowText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#f8fafc',
  },
  changeNoteText: {
    fontSize: 12,
    color: '#cbd5e1',
  },
  terminarzList: {
    gap: 8,
  },
  terminarzCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 6,
  },
  terminarzCardCompact: {
    padding: 10,
    gap: 5,
  },
  terminarzHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  terminarzTitleWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 5,
  },
  terminarzTitle: {
    fontSize: 14,
    fontWeight: '800',
    flexShrink: 1,
  },
  autoAdjustPill: {
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  autoAdjustPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#cbd5e1',
  },
  terminarzRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 5,
  },
  hideTriggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 7,
    paddingVertical: 3.5,
    borderRadius: 8,
  },
  hideTriggerText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94a3b8',
  },
  terminarzBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  terminarzBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  terminarzDesc: {
    fontSize: 13,
    lineHeight: 18,
    color: '#f1f5f9',
  },
  terminarzMetaBlock: {
    gap: 2,
    marginTop: 1,
  },
  terminarzMeta: {
    fontSize: 11,
    color: '#94a3b8',
  },
  hideChoiceBox: {
    marginTop: 4,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 10,
    gap: 8,
  },
  hideChoiceLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94a3b8',
  },
  hideChoiceButtonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  hideOptionBtn: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#475569',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  hideOptionBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#e2e8f0',
  },
  hideOptionBtnAlways: {
    backgroundColor: 'rgba(56, 189, 248, 0.14)',
    borderColor: 'rgba(56, 189, 248, 0.5)',
    flexShrink: 1,
  },
  hideOptionBtnAlwaysText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#38bdf8',
  },
  infoList: {
    gap: 9,
  },
  infoPanelBox: {
    backgroundColor: 'rgba(15, 23, 42, 0.52)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.16)',
    padding: 12,
    gap: 9,
  },
  infoPanelBoxCompact: {
    padding: 10,
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
  attendanceSection: {
    backgroundColor: 'rgba(15, 23, 42, 0.52)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.16)',
    padding: 12,
    gap: 6,
  },
  attendanceSectionCompact: {
    padding: 10,
    gap: 5,
  },
  attendanceTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  attendanceRight: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 7,
    minWidth: 0,
  },
  attendanceTypeName: {
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 1,
    textAlign: 'right',
  },
  attendanceTypeNameCompact: {
    fontSize: 12.5,
  },
  attendanceUnmarked: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
  },
  attendanceMetaBlock: {
    gap: 2,
  },
  attendanceMeta: {
    fontSize: 11,
    color: '#94a3b8',
  },
  topicBox: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.52)',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.16)',
  },
  topicBoxCompact: {
    padding: 10,
    gap: 8,
  },
  topicLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 3,
  },
  topicText: {
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
  verticalStepDotCancelled: {
    backgroundColor: '#0f172a',
    borderWidth: 1.5,
    borderColor: '#ef4444',
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

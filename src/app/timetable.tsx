import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  Vibration,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useLibrus } from '@/context/LibrusContext';
import { DaySchedule, TerminarzEvent, TimetableLesson } from '@/types/librus';
import {
  addDays,
  buildEmptyWeekDays,
  formatPolishDayHeader,
  getInitialSchoolDate,
  getMonday,
  getSchoolDayIndex,
  parseISODate,
  toISODate,
} from '@/utils/dates';
import { TimeGrid } from '@/components/timetable/TimeGrid';
import { DayBar } from '@/components/timetable/DayBar';
import { LessonDetailsModal } from '@/components/lesson-details-modal';
import {
  FreeDayModal,
  FreeDayModalTarget,
} from '@/components/free-day-modal';
import { getAllCachedWeeks, weekHasLessons } from '@/services/fileCache';
import { librusClient } from '@/services/librusClient';
import {
  attachTerminarzToDay,
  attachTerminarzToWeek,
  cleanFreeDayReason,
  getDayActionableEvents,
  getTerminarzColor,
  TERMINARZ_PRIORITY,
} from '@/utils/terminarzMatcher';
import { RIGHT_RAIL_WIDTH, WIDE_LAYOUT_BREAKPOINT } from '@/constants/layout';

interface HeaderEventChip {
  key: string;
  event: TerminarzEvent;
  label: string;
  lessonIndex: number | null;
}

interface ModalTargetState {
  openSeq: number;
  dayDate: string;
  lessonId: string;
  lessonIndex: number;
  wasStandalone: boolean;
  expandHideEventId?: string;
}

export default function TimetableScreen() {
  const params = useLocalSearchParams<{ date?: string; jumpTs?: string }>();
  const { width: windowWidth } = useWindowDimensions();
  const SCREEN_WIDTH =
    windowWidth >= WIDE_LAYOUT_BREAKPOINT
      ? windowWidth - RIGHT_RAIL_WIDTH
      : windowWidth;
  const {
    weeks,
    terminarzEvents,
    loadWeek,
    isLoading,
    isRefreshing,
    refreshData,
  } = useLibrus();

  const todayIso = useMemo(() => toISODate(new Date()), []);
  const initialSchoolDate = useMemo(() => getInitialSchoolDate(new Date()), []);
  const initialWeekStart = useMemo(
    () => toISODate(getMonday(initialSchoolDate)),
    [initialSchoolDate]
  );
  const initialDayIndex = useMemo(
    () => getSchoolDayIndex(initialSchoolDate),
    [initialSchoolDate]
  );

  const [activeWeekStart, setActiveWeekStart] = useState<string>(initialWeekStart);
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(initialDayIndex);
  const [isFetchingWeek, setIsFetchingWeek] = useState<boolean>(false);
  const [modalTarget, setModalTarget] = useState<ModalTargetState | null>(null);
  const [freeDayModalTarget, setFreeDayModalTarget] =
    useState<FreeDayModalTarget | null>(null);

  const pagerRef = useRef<FlatList<DaySchedule>>(null);
  const selectedDayIndexRef = useRef<number>(initialDayIndex);
  const isProgrammaticScrollRef = useRef<boolean>(false);
  const programmaticTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openSeqRef = useRef<number>(0);
  const weeksRef = useRef(weeks);
  const fetchingWeeksRef = useRef<Set<string>>(new Set());
  const handledDateParamRef = useRef<string | null>(null);

  useEffect(() => {
    weeksRef.current = weeks;
  }, [weeks]);

  useEffect(() => {
    return () => {
      if (programmaticTimerRef.current) {
        clearTimeout(programmaticTimerRef.current);
      }
    };
  }, []);

  const selectDay = useCallback(
    (index: number, animated: boolean = true) => {
      const clamped = Math.min(Math.max(index, 0), 4);
      selectedDayIndexRef.current = clamped;
      setSelectedDayIndex(clamped);

      if (programmaticTimerRef.current) {
        clearTimeout(programmaticTimerRef.current);
      }
      isProgrammaticScrollRef.current = true;
      programmaticTimerRef.current = setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, 480);

      pagerRef.current?.scrollToOffset({
        offset: clamped * SCREEN_WIDTH,
        animated,
      });
      setTimeout(() => {
        pagerRef.current?.scrollToOffset({
          offset: clamped * SCREEN_WIDTH,
          animated: false,
        });
      }, 45);
    },
    [SCREEN_WIDTH]
  );

  // Support deep-linking from "Ostatnia aktywność" and "Najbliższa lekcja" via /timetable?date=YYYY-MM-DD&jumpTs=...
  useEffect(() => {
    const rawDate = typeof params.date === 'string' ? params.date : '';
    const jumpTs = typeof params.jumpTs === 'string' ? params.jumpTs : '';
    if (!rawDate || !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) return;
    const jumpKey = `${rawDate}:${jumpTs}`;
    if (handledDateParamRef.current === jumpKey) return;
    handledDateParamRef.current = jumpKey;

    const parsed = parseISODate(rawDate);
    const targetMon = toISODate(getMonday(parsed));
    const targetIdx = getSchoolDayIndex(parsed);

    selectedDayIndexRef.current = targetIdx;
    setSelectedDayIndex(targetIdx);
    setActiveWeekStart(targetMon);
    selectDay(targetIdx, false);
  }, [params.date, params.jumpTs, selectDay]);

  useEffect(() => {
    let cancelled = false;
    const week = activeWeekStart;

    if (fetchingWeeksRef.current.has(week)) {
      return;
    }

    const currentWeekData = weeksRef.current[week];
    const hasExisting = Boolean(currentWeekData && weekHasLessons(currentWeekData));

    fetchingWeeksRef.current.add(week);
    if (!hasExisting) {
      Promise.resolve().then(() => {
        if (!cancelled) setIsFetchingWeek(true);
      });
    }

    loadWeek(week, false)
      .catch((err) => {
        console.error(`[TimetableScreen] loadWeek(${week}) failed:`, err);
      })
      .finally(() => {
        fetchingWeeksRef.current.delete(week);
        if (!cancelled) {
          setIsFetchingWeek(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeWeekStart, loadWeek]);

  const activeWeekDays = useMemo(() => {
    const wk = weeks[activeWeekStart];
    if (wk && wk.days && wk.days.length === 5 && weekHasLessons(wk)) {
      return attachTerminarzToWeek(wk, terminarzEvents).days;
    }
    const cachedWk = librusClient.getCachedWeekSchedule(activeWeekStart);
    if (cachedWk && cachedWk.days && cachedWk.days.length === 5 && weekHasLessons(cachedWk)) {
      return attachTerminarzToWeek(cachedWk, terminarzEvents).days;
    }
    const allC = getAllCachedWeeks();
    const anyWk =
      Object.values(weeks).find((w) => weekHasLessons(w)) ??
      Object.values(allC).find((w) => weekHasLessons(w));
    if (anyWk && anyWk.days && anyWk.days.length === 5) {
      const allRegularLessons = anyWk.days.flatMap((d) =>
        (d.lessons || []).filter((l) => !l.isStandaloneEvent)
      );
      const monDate = parseISODate(activeWeekStart);
      return anyWk.days.map((d, idx) => {
        const dateStr = toISODate(addDays(monDate, idx));
        const baseDay: DaySchedule = {
          ...d,
          date: dateStr,
          isFreeDay: undefined,
          freeDayLabel: undefined,
          lessons: d.lessons
            .filter((l) => !l.isStandaloneEvent)
            .map((l) => ({
              ...l,
              id: `${dateStr}-${l.hourNumber}`,
              attendance: undefined,
              topic: undefined,
              isCancelled: undefined,
              isFreeDay: undefined,
              isSubstitution: undefined,
              changeType: undefined,
              note: undefined,
              original: undefined,
              events: undefined,
            })),
        };
        return attachTerminarzToDay(baseDay, terminarzEvents, allRegularLessons);
      });
    }
    return buildEmptyWeekDays(activeWeekStart).map((d) =>
      attachTerminarzToDay(d, terminarzEvents)
    );
  }, [weeks, activeWeekStart, terminarzEvents]);

  const activeDay = activeWeekDays[selectedDayIndex] ?? activeWeekDays[0];
  const headerDateLabel = activeDay?.date
    ? formatPolishDayHeader(activeDay.date)
    : activeDay?.dayName ?? '';

  const activeRegularLessons = useMemo(
    () => (activeDay?.lessons || []).filter((l) => !l.isStandaloneEvent),
    [activeDay]
  );
  const isActiveDayFree = Boolean(
    activeDay?.isFreeDay || activeRegularLessons.some((l) => l.isFreeDay)
  );
  const isAllRegularCancelled =
    !isActiveDayFree &&
    activeRegularLessons.length > 0 &&
    activeRegularLessons.every((l) => l.isCancelled);
  const showHeaderFreeBadge = isActiveDayFree || isAllRegularCancelled;

  const freeDayReason = useMemo(() => {
    if (!activeDay || !isActiveDayFree) return undefined;
    const directFreeEv = terminarzEvents.find(
      (ev) => ev.date === activeDay.date && ev.category === 'free_day'
    );
    return (
      cleanFreeDayReason(directFreeEv?.displayType) ||
      cleanFreeDayReason(directFreeEv?.rawType) ||
      cleanFreeDayReason(directFreeEv?.description) ||
      cleanFreeDayReason(activeDay.freeDayLabel) ||
      cleanFreeDayReason(
        activeRegularLessons.find((l) => l.isFreeDay && l.note)?.note
      )
    );
  }, [activeDay, isActiveDayFree, terminarzEvents, activeRegularLessons]);

  // Build top-right scrollable Terminarz chips for the selected day
  const activeDayChips = useMemo<HeaderEventChip[]>(() => {
    if (!activeDay) return [];
    const chips: HeaderEventChip[] = [];
    const seenEventIds = new Set<string>();

    activeDay.lessons.forEach((lesson, lessonIdx) => {
      for (const ev of lesson.events ?? []) {
        if (seenEventIds.has(ev.id)) continue;
        seenEventIds.add(ev.id);
        const subj = ev.subject || (!lesson.isStandaloneEvent ? lesson.subject : undefined);
        const label = subj ? `${subj} · ${ev.shortLabel}` : ev.displayType;
        chips.push({
          key: ev.id,
          event: ev,
          label,
          lessonIndex: lessonIdx,
        });
      }
    });

    if (chips.length === 0 && activeDay.date) {
      const unattached = getDayActionableEvents(
        terminarzEvents.filter((ev) => ev.date === activeDay.date)
      );
      for (const ev of unattached) {
        const label = ev.subject ? `${ev.subject} · ${ev.shortLabel}` : ev.displayType;
        chips.push({
          key: ev.id,
          event: ev,
          label,
          lessonIndex: activeDay.lessons.length > 0 ? 0 : null,
        });
      }
    }

    chips.sort(
      (a, b) =>
        (TERMINARZ_PRIORITY[a.event.category] ?? 99) -
        (TERMINARZ_PRIORITY[b.event.category] ?? 99)
    );
    return chips;
  }, [activeDay, terminarzEvents]);

  // Re-align horizontal day pager whenever foldable / window width or active week changes
  useEffect(() => {
    const idx = selectedDayIndexRef.current;
    isProgrammaticScrollRef.current = true;
    const timer = setTimeout(() => {
      pagerRef.current?.scrollToOffset({
        offset: idx * SCREEN_WIDTH,
        animated: false,
      });
      setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, 120);
    }, 40);
    return () => clearTimeout(timer);
  }, [SCREEN_WIDTH, activeWeekStart]);

  const syncDayFromOffset = useCallback(
    (offsetX: number, clearProgrammatic: boolean) => {
      if (SCREEN_WIDTH <= 0) return;
      if (clearProgrammatic) {
        isProgrammaticScrollRef.current = false;
        if (programmaticTimerRef.current) {
          clearTimeout(programmaticTimerRef.current);
          programmaticTimerRef.current = null;
        }
      } else if (isProgrammaticScrollRef.current) {
        return;
      }

      const idx = Math.min(Math.max(Math.round(offsetX / SCREEN_WIDTH), 0), 4);
      if (idx !== selectedDayIndexRef.current) {
        selectedDayIndexRef.current = idx;
        setSelectedDayIndex(idx);
      }
    },
    [SCREEN_WIDTH]
  );

  const handlePagerScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      syncDayFromOffset(e.nativeEvent.contentOffset.x, false);
    },
    [syncDayFromOffset]
  );

  const handlePagerSettled = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      syncDayFromOffset(e.nativeEvent.contentOffset.x, true);
    },
    [syncDayFromOffset]
  );

  const handlePrevWeek = () => {
    setModalTarget(null);
    const prevMon = addDays(parseISODate(activeWeekStart), -7);
    setActiveWeekStart(toISODate(prevMon));
  };

  const handleNextWeek = () => {
    setModalTarget(null);
    const nextMon = addDays(parseISODate(activeWeekStart), 7);
    setActiveWeekStart(toISODate(nextMon));
  };

  const handleJumpToToday = () => {
    setModalTarget(null);
    setActiveWeekStart(initialWeekStart);
    selectDay(initialDayIndex, true);
  };

  const handleRefresh = async () => {
    setIsFetchingWeek(true);
    await Promise.all([refreshData(), loadWeek(activeWeekStart, true)]);
    setIsFetchingWeek(false);
  };

  const openLessonModal = useCallback(
    (
      day: DaySchedule,
      lesson: TimetableLesson,
      index: number,
      expandHideEventId?: string
    ) => {
      const dayIdx = activeWeekDays.findIndex((d) => d.date === day.date);
      if (dayIdx !== -1 && dayIdx !== selectedDayIndexRef.current) {
        selectedDayIndexRef.current = dayIdx;
        setSelectedDayIndex(dayIdx);
      }
      openSeqRef.current += 1;
      setModalTarget({
        openSeq: openSeqRef.current,
        dayDate: day.date,
        lessonId: lesson.id,
        lessonIndex: index,
        wasStandalone: Boolean(lesson.isStandaloneEvent),
        expandHideEventId,
      });
    },
    [activeWeekDays]
  );

  const handlePressLesson = useCallback(
    (day: DaySchedule, lesson: TimetableLesson, index: number) => {
      openLessonModal(day, lesson, index);
    },
    [openLessonModal]
  );

  const handleLongPressLesson = useCallback(
    (day: DaySchedule, lesson: TimetableLesson, index: number) => {
      const evId = lesson.events?.[0]?.id;
      try {
        Vibration.vibrate(18);
      } catch {
        // Ignore vibration failure
      }
      openLessonModal(day, lesson, index, evId);
    },
    [openLessonModal]
  );

  const modalDay = useMemo(() => {
    if (!modalTarget) return null;
    return activeWeekDays.find((d) => d.date === modalTarget.dayDate) ?? activeDay ?? null;
  }, [modalTarget, activeWeekDays, activeDay]);

  const modalLessons = useMemo(() => modalDay?.lessons ?? [], [modalDay]);

  // If the user hid a standalone event tile while viewing it, close the modal cleanly
  const isModalStillValid = useMemo(() => {
    if (!modalTarget || !modalDay || modalLessons.length === 0) return false;
    if (
      modalTarget.wasStandalone &&
      !modalLessons.some((l) => l.id === modalTarget.lessonId)
    ) {
      return false;
    }
    return true;
  }, [modalTarget, modalDay, modalLessons]);

  const modalDayLabel = modalDay?.date
    ? formatPolishDayHeader(modalDay.date)
    : modalDay?.dayName ?? headerDateLabel;

  const resolvedInitialModalIndex = useMemo(() => {
    if (!modalTarget || modalLessons.length === 0) return 0;
    const byId = modalLessons.findIndex((l) => l.id === modalTarget.lessonId);
    if (byId !== -1) return byId;
    return Math.min(Math.max(modalTarget.lessonIndex, 0), modalLessons.length - 1);
  }, [modalTarget, modalLessons]);

  const showInitialSpinner =
    (isLoading || isFetchingWeek) && !weeks[activeWeekStart];

  useEffect(() => {
    if (showInitialSpinner) return;
    const idx = selectedDayIndexRef.current;
    isProgrammaticScrollRef.current = true;
    const timer = setTimeout(() => {
      pagerRef.current?.scrollToOffset({
        offset: idx * SCREEN_WIDTH,
        animated: false,
      });
      setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, 120);
    }, 35);
    return () => clearTimeout(timer);
  }, [showInitialSpinner, SCREEN_WIDTH]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header with Top-Right Scrollable Terminarz Event Chips */}
      <View style={styles.header}>
        <View style={styles.headerLeftCol}>
          <View style={styles.headerTitleRow}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              Plan lekcji
            </Text>
            {(isRefreshing || isFetchingWeek) && (
              <ActivityIndicator size="small" color="#3b82f6" />
            )}
          </View>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {headerDateLabel}
          </Text>
        </View>

        {(showHeaderFreeBadge || activeDayChips.length > 0) && (
          <View style={styles.headerEventsWrap}>
            <ScrollView
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.headerEventsScroll}>
              {showHeaderFreeBadge && (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => {
                    if (activeDay?.date) {
                      setFreeDayModalTarget({
                        date: activeDay.date,
                        reason: freeDayReason,
                        showOpenTimetableButton: false,
                      });
                    }
                  }}
                  style={styles.headerFreeDayPill}>
                  <View style={styles.headerFreeDayTopRow}>
                    <View style={styles.headerFreeDayDot} />
                    <Text style={styles.headerFreeDayTitle} numberOfLines={1}>
                      {isActiveDayFree
                        ? 'Dzień wolny od szkoły'
                        : 'Wszystkie lekcje odwołane'}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}

              {activeDayChips.map((chip) => {
                const color = getTerminarzColor(chip.event.category);
                return (
                  <TouchableOpacity
                    key={chip.key}
                    activeOpacity={0.8}
                    disabled={chip.lessonIndex === null}
                    delayLongPress={320}
                    onPress={() => {
                      if (
                        chip.lessonIndex !== null &&
                        activeDay &&
                        activeDay.lessons[chip.lessonIndex]
                      ) {
                        openLessonModal(
                          activeDay,
                          activeDay.lessons[chip.lessonIndex],
                          chip.lessonIndex
                        );
                      }
                    }}
                    onLongPress={() => {
                      if (
                        chip.lessonIndex !== null &&
                        activeDay &&
                        activeDay.lessons[chip.lessonIndex]
                      ) {
                        try {
                          Vibration.vibrate(18);
                        } catch {
                          // Ignore vibration failure
                        }
                        openLessonModal(
                          activeDay,
                          activeDay.lessons[chip.lessonIndex],
                          chip.lessonIndex,
                          chip.event.id
                        );
                      }
                    }}
                    style={[
                      styles.headerEventChip,
                      {
                        backgroundColor: `${color}1A`,
                        borderColor: `${color}66`,
                      },
                    ]}>
                    <View style={[styles.headerEventDot, { backgroundColor: color }]} />
                    <Text
                      style={[styles.headerEventText, { color }]}
                      numberOfLines={1}>
                      {chip.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}
      </View>

      {/* Main Content / 5-Day Horizontal Pager */}
      {showInitialSpinner ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>Pobieranie planu lekcji...</Text>
        </View>
      ) : (
        <FlatList
          key={`timetable-pager-${Math.round(SCREEN_WIDTH)}`}
          ref={pagerRef}
          data={activeWeekDays}
          keyExtractor={(item) => `${activeWeekStart}-${item.date}`}
          extraData={{ activeWeekDays, SCREEN_WIDTH, terminarzEvents }}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={SCREEN_WIDTH}
          snapToAlignment="center"
          disableIntervalMomentum={true}
          initialScrollIndex={selectedDayIndex}
          getItemLayout={(_, index) => ({
            length: SCREEN_WIDTH,
            offset: SCREEN_WIDTH * index,
            index,
          })}
          onScrollToIndexFailed={(info) => {
            setTimeout(() => {
              pagerRef.current?.scrollToOffset({
                offset: info.index * SCREEN_WIDTH,
                animated: false,
              });
            }, 50);
          }}
          scrollEventThrottle={16}
          onScroll={handlePagerScroll}
          onScrollEndDrag={handlePagerSettled}
          onMomentumScrollEnd={handlePagerSettled}
          renderItem={({ item }) => (
            <View style={{ width: SCREEN_WIDTH, flex: 1 }}>
              <TimeGrid
                day={item}
                isToday={item.date === todayIso}
                isRefreshing={isRefreshing || isFetchingWeek}
                onRefresh={handleRefresh}
                onPressLesson={handlePressLesson}
                onLongPressLesson={handleLongPressLesson}
              />
            </View>
          )}
        />
      )}

      {/* Floating Bottom Day Bar */}
      <DayBar
        weekStart={activeWeekStart}
        days={activeWeekDays}
        terminarzEvents={terminarzEvents}
        selectedDayIndex={selectedDayIndex}
        todayIso={todayIso}
        initialWeekStart={initialWeekStart}
        onSelectDay={(idx) => selectDay(idx, true)}
        onPrevWeek={handlePrevWeek}
        onNextWeek={handleNextWeek}
        onJumpToToday={handleJumpToToday}
      />

      {/* Lesson Details Bottom Sheet Modal */}
      <LessonDetailsModal
        visible={isModalStillValid}
        openKey={modalTarget ? `${modalTarget.openSeq}-${modalTarget.dayDate}` : 'closed'}
        dayLabel={modalDayLabel}
        lessons={modalLessons}
        initialIndex={resolvedInitialModalIndex}
        initialExpandHideEventId={modalTarget?.expandHideEventId}
        onClose={() => setModalTarget(null)}
      />

      {/* Free Day Details Modal */}
      <FreeDayModal
        visible={Boolean(freeDayModalTarget)}
        target={freeDayModalTarget}
        weeks={weeks}
        terminarzEvents={terminarzEvents}
        onClose={() => setFreeDayModalTarget(null)}
        onNavigateToDate={(dateIso) => {
          const parsed = parseISODate(dateIso);
          const targetMon = toISODate(getMonday(parsed));
          const targetIdx = getSchoolDayIndex(parsed);
          setActiveWeekStart(targetMon);
          selectDay(targetIdx, true);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  headerLeftCol: {
    flex: 1,
    minWidth: 135,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    color: '#f8fafc',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  headerEventsWrap: {
    maxWidth: '56%',
    maxHeight: 68,
    flexShrink: 1,
  },
  headerEventsScroll: {
    alignItems: 'flex-end',
    gap: 5,
  },
  headerFreeDayPill: {
    backgroundColor: 'rgba(239, 68, 68, 0.14)',
    borderColor: 'rgba(239, 68, 68, 0.45)',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignItems: 'flex-end',
    gap: 1,
  },
  headerFreeDayTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  headerFreeDayDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ef4444',
  },
  headerFreeDayTitle: {
    color: '#fca5a5',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.15,
  },
  headerFreeDayReason: {
    color: '#fecdd3',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'right',
    lineHeight: 14,
  },
  headerEventChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  headerEventDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  headerEventText: {
    fontSize: 11,
    fontWeight: '700',
    flexShrink: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingBottom: 80,
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600',
  },
});

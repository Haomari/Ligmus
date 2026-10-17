import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLibrus } from '@/context/LibrusContext';
import { DaySchedule, TimetableLesson } from '@/types/librus';
import {
  POLISH_DAY_NAMES,
  POLISH_DAY_SHORT,
  addDays,
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

function buildEmptyWeekDays(weekStartIso: string): DaySchedule[] {
  const mon = parseISODate(weekStartIso);
  return Array.from({ length: 5 }, (_, idx) => {
    const d = addDays(mon, idx);
    return {
      dayId: idx + 1,
      dayName: POLISH_DAY_NAMES[idx],
      shortName: POLISH_DAY_SHORT[idx],
      date: toISODate(d),
      lessons: [],
    };
  });
}

export default function TimetableScreen() {
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const { weeks, loadWeek, isLoading, isRefreshing, refreshData } = useLibrus();

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
  const [modalLessonIndex, setModalLessonIndex] = useState<number | null>(null);

  const pagerRef = useRef<FlatList<DaySchedule>>(null);
  const selectedDayIndexRef = useRef<number>(initialDayIndex);

  useEffect(() => {
    let cancelled = false;
    const ensureWeek = async () => {
      if (!weeks[activeWeekStart]) {
        setIsFetchingWeek(true);
      }
      await loadWeek(activeWeekStart, false);
      if (!cancelled) {
        setIsFetchingWeek(false);
      }
    };
    ensureWeek();
    return () => {
      cancelled = true;
    };
  }, [activeWeekStart, loadWeek]);

  const activeWeekDays = useMemo(() => {
    const wk = weeks[activeWeekStart];
    if (wk && wk.days && wk.days.length === 5) {
      return wk.days;
    }
    return buildEmptyWeekDays(activeWeekStart);
  }, [weeks, activeWeekStart]);

  const activeDay = activeWeekDays[selectedDayIndex] ?? activeWeekDays[0];
  const headerDateLabel = activeDay?.date
    ? formatPolishDayHeader(activeDay.date)
    : activeDay?.dayName ?? '';

  const selectDay = useCallback(
    (index: number, animated: boolean = true) => {
      const clamped = Math.min(Math.max(index, 0), 4);
      selectedDayIndexRef.current = clamped;
      setSelectedDayIndex(clamped);
      pagerRef.current?.scrollToOffset({
        offset: clamped * SCREEN_WIDTH,
        animated,
      });
    },
    [SCREEN_WIDTH]
  );

  const handlePagerMomentumEnd = (
    e: NativeSyntheticEvent<NativeScrollEvent>
  ) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const idx = Math.min(
      Math.max(Math.round(offsetX / SCREEN_WIDTH), 0),
      4
    );
    if (idx !== selectedDayIndexRef.current) {
      selectedDayIndexRef.current = idx;
      setSelectedDayIndex(idx);
    }
  };

  const handlePrevWeek = () => {
    const prevMon = addDays(parseISODate(activeWeekStart), -7);
    setActiveWeekStart(toISODate(prevMon));
  };

  const handleNextWeek = () => {
    const nextMon = addDays(parseISODate(activeWeekStart), 7);
    setActiveWeekStart(toISODate(nextMon));
  };

  const handleJumpToToday = () => {
    setActiveWeekStart(initialWeekStart);
    selectDay(initialDayIndex, true);
  };

  const handleRefresh = async () => {
    setIsFetchingWeek(true);
    await Promise.all([refreshData(), loadWeek(activeWeekStart, true)]);
    setIsFetchingWeek(false);
  };

  const handlePressLesson = (_lesson: TimetableLesson, index: number) => {
    setModalLessonIndex(index);
  };

  const showInitialSpinner =
    (isLoading || isFetchingWeek) && !weeks[activeWeekStart];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Plan lekcji</Text>
          <Text style={styles.headerSubtitle}>{headerDateLabel}</Text>
        </View>
        {(isRefreshing || isFetchingWeek) && (
          <ActivityIndicator size="small" color="#3b82f6" />
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
          ref={pagerRef}
          data={activeWeekDays}
          keyExtractor={(item) => item.date || String(item.dayId)}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={SCREEN_WIDTH}
          snapToAlignment="center"
          disableIntervalMomentum={true}
          initialScrollIndex={initialDayIndex}
          getItemLayout={(_, index) => ({
            length: SCREEN_WIDTH,
            offset: SCREEN_WIDTH * index,
            index,
          })}
          onMomentumScrollEnd={handlePagerMomentumEnd}
          renderItem={({ item }) => (
            <View style={{ width: SCREEN_WIDTH, flex: 1 }}>
              <TimeGrid
                day={item}
                isToday={item.date === todayIso}
                isRefreshing={isRefreshing || isFetchingWeek}
                onRefresh={handleRefresh}
                onPressLesson={handlePressLesson}
              />
            </View>
          )}
        />
      )}

      {/* Floating Bottom Day Bar */}
      <DayBar
        weekStart={activeWeekStart}
        days={activeWeekDays}
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
        visible={modalLessonIndex !== null}
        dayLabel={headerDateLabel}
        lessons={activeDay?.lessons ?? []}
        initialIndex={modalLessonIndex ?? 0}
        onClose={() => setModalLessonIndex(null)}
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
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
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

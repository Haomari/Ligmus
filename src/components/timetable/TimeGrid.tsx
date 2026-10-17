import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DaySchedule, TimetableLesson } from '@/types/librus';
import { formatMinutesToHM, parseHM } from '@/utils/dates';
import { LessonCard } from './LessonCard';

export const PX_PER_MIN = 1.7;
const HOUR_COLUMN_WIDTH = 52;
const DEFAULT_START_MIN = 8 * 60; // 08:00
const DEFAULT_END_MIN = 15 * 60;  // 15:00

interface TimeGridProps {
  day: DaySchedule;
  isToday: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  onPressLesson: (lesson: TimetableLesson, index: number) => void;
}

export const TimeGrid: React.FC<TimeGridProps> = ({
  day,
  isToday,
  isRefreshing,
  onRefresh,
  onPressLesson,
}) => {
  const scrollRef = useRef<ScrollView>(null);
  const didAutoScrollRef = useRef(false);

  const [nowMinutes, setNowMinutes] = useState<number>(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  });

  useEffect(() => {
    if (!isToday) return;
    const updateNow = () => {
      const now = new Date();
      setNowMinutes(now.getHours() * 60 + now.getMinutes());
    };
    updateNow();
    const timer = setInterval(updateNow, 60 * 1000);
    return () => clearInterval(timer);
  }, [isToday]);

  const { gridStartMin, gridEndMin, hours } = useMemo(() => {
    if (!day.lessons || day.lessons.length === 0) {
      const hrs: number[] = [];
      for (let m = DEFAULT_START_MIN; m <= DEFAULT_END_MIN; m += 60) {
        hrs.push(m);
      }
      return {
        gridStartMin: DEFAULT_START_MIN,
        gridEndMin: DEFAULT_END_MIN,
        hours: hrs,
      };
    }

    let minStart = Infinity;
    let maxEnd = -Infinity;

    for (const lesson of day.lessons) {
      const s = parseHM(lesson.startTime || lesson.timeSpan.split('-')[0] || '08:00');
      const e = parseHM(lesson.endTime || lesson.timeSpan.split('-')[1] || '08:45');
      if (s > 0 && s < minStart) minStart = s;
      if (e > maxEnd) maxEnd = e;
    }

    if (!isFinite(minStart)) minStart = DEFAULT_START_MIN;
    if (!isFinite(maxEnd)) maxEnd = DEFAULT_END_MIN;

    const roundedStart = Math.floor(minStart / 60) * 60;
    const roundedEnd = Math.max(
      Math.ceil(maxEnd / 60) * 60,
      roundedStart + 6 * 60
    );

    const hrs: number[] = [];
    for (let m = roundedStart; m <= roundedEnd; m += 60) {
      hrs.push(m);
    }

    return {
      gridStartMin: roundedStart,
      gridEndMin: roundedEnd,
      hours: hrs,
    };
  }, [day.lessons]);

  const totalGridHeight = (gridEndMin - gridStartMin) * PX_PER_MIN;
  const showNowLine =
    isToday && nowMinutes >= gridStartMin - 15 && nowMinutes <= gridEndMin + 15;
  const nowTop = Math.max(0, (nowMinutes - gridStartMin) * PX_PER_MIN);

  useEffect(() => {
    if (isToday && showNowLine && !didAutoScrollRef.current && day.lessons.length > 0) {
      didAutoScrollRef.current = true;
      const targetOffset = Math.max(0, nowTop - 160);
      setTimeout(() => {
        scrollRef.current?.scrollTo({ y: targetOffset, animated: true });
      }, 120);
    }
  }, [isToday, showNowLine, nowTop, day.lessons.length]);

  if (!day.lessons || day.lessons.length === 0) {
    return (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.emptyScrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor="#3b82f6"
            colors={['#3b82f6']}
          />
        }>
        <View style={styles.emptyCard}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="calendar-clear-outline" size={32} color="#64748b" />
          </View>
          <Text style={styles.emptyTitle}>Brak lekcji w tym dniu</Text>
          <Text style={styles.emptySubtitle}>
            W wybranym dniu nie zaplanowano zajęć lekcyjnych.
          </Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          tintColor="#3b82f6"
          colors={['#3b82f6']}
        />
      }>
      <View style={[styles.gridContainer, { height: totalGridHeight + 28 }]}>
        {/* Hour lines & left labels */}
        {hours.map((hourMin) => {
          const top = (hourMin - gridStartMin) * PX_PER_MIN;
          return (
            <View
              key={hourMin}
              pointerEvents="none"
              style={[styles.hourRow, { top }]}>
              <Text style={styles.hourLabel}>{formatMinutesToHM(hourMin)}</Text>
              <View style={styles.hourLine} />
            </View>
          );
        })}

        {/* Lessons track */}
        <View style={styles.cardsTrack}>
          {day.lessons.map((lesson, index) => {
            const startMin = parseHM(
              lesson.startTime || lesson.timeSpan.split('-')[0] || '08:00'
            );
            const endMin = parseHM(
              lesson.endTime || lesson.timeSpan.split('-')[1] || '08:45'
            );
            const duration = Math.max(endMin - startMin, 30);
            const top = Math.max(0, (startMin - gridStartMin) * PX_PER_MIN);
            const height = duration * PX_PER_MIN;

            return (
              <LessonCard
                key={lesson.id}
                lesson={lesson}
                top={top}
                height={height}
                onPress={() => onPressLesson(lesson, index)}
              />
            );
          })}

          {/* Red "now" indicator line */}
          {showNowLine && (
            <View
              pointerEvents="none"
              style={[styles.nowLineContainer, { top: nowTop }]}>
              <View style={styles.nowDot} />
              <View style={styles.nowLine} />
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 14,
    paddingBottom: 112,
    paddingHorizontal: 14,
  },
  emptyScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 112,
  },
  gridContainer: {
    position: 'relative',
    width: '100%',
  },
  hourRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    transform: [{ translateY: -7 }],
  },
  hourLabel: {
    width: HOUR_COLUMN_WIDTH,
    color: '#64748b',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'left',
  },
  hourLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(51, 65, 85, 0.55)',
  },
  cardsTrack: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: HOUR_COLUMN_WIDTH,
    right: 0,
  },
  nowLineContainer: {
    position: 'absolute',
    left: -6,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 20,
    transform: [{ translateY: -4 }],
  },
  nowDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
  },
  nowLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#ef4444',
  },
  emptyCard: {
    backgroundColor: '#1e293b',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 28,
    alignItems: 'center',
  },
  emptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    color: '#f8fafc',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptySubtitle: {
    color: '#94a3b8',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
});

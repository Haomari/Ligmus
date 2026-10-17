import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DaySchedule } from '@/types/librus';
import { formatWeekRangeLabel, parseISODate } from '@/utils/dates';

interface DayBarProps {
  weekStart: string;
  days: DaySchedule[];
  selectedDayIndex: number;
  todayIso: string;
  initialWeekStart: string;
  onSelectDay: (index: number) => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onJumpToToday: () => void;
}

export const DayBar: React.FC<DayBarProps> = ({
  weekStart,
  days,
  selectedDayIndex,
  todayIso,
  initialWeekStart,
  onSelectDay,
  onPrevWeek,
  onNextWeek,
  onJumpToToday,
}) => {
  const isCurrentDefaultWeek = weekStart === initialWeekStart;
  const weekLabel = formatWeekRangeLabel(weekStart);

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <Pressable
        onPress={onJumpToToday}
        style={({ pressed }) => [
          styles.weekChip,
          !isCurrentDefaultWeek && styles.weekChipAway,
          pressed && styles.pressed,
        ]}>
        <Text
          style={[
            styles.weekChipText,
            !isCurrentDefaultWeek && styles.weekChipTextAway,
          ]}>
          {weekLabel}
          {!isCurrentDefaultWeek ? '  ·  Wróć do dziś' : ''}
        </Text>
      </Pressable>

      <View style={styles.pillBar}>
        <Pressable
          onPress={onPrevWeek}
          hitSlop={8}
          style={({ pressed }) => [styles.arrowBtn, pressed && styles.pressed]}>
          <Text style={styles.arrowText}>‹</Text>
        </Pressable>

        <View style={styles.daysRow}>
          {days.map((day, idx) => {
            const isSelected = idx === selectedDayIndex;
            const isToday = day.date === todayIso;
            const dayNum = parseISODate(day.date).getDate();

            return (
              <Pressable
                key={day.date || day.dayId}
                onPress={() => onSelectDay(idx)}
                style={[
                  styles.dayPill,
                  isSelected && styles.dayPillActive,
                ]}>
                <Text
                  style={[
                    styles.dayShort,
                    isSelected && styles.dayTextActive,
                  ]}>
                  {day.shortName}
                </Text>
                <Text
                  style={[
                    styles.dayNumber,
                    isSelected && styles.dayTextActive,
                  ]}>
                  {dayNum}
                </Text>
                {isToday && (
                  <View
                    style={[
                      styles.todayDot,
                      isSelected && styles.todayDotActive,
                    ]}
                  />
                )}
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={onNextWeek}
          hitSlop={8}
          style={({ pressed }) => [styles.arrowBtn, pressed && styles.pressed]}>
          <Text style={styles.arrowText}>›</Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 14,
    alignItems: 'center',
    gap: 6,
  },
  weekChip: {
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#334155',
  },
  weekChipAway: {
    borderColor: 'rgba(59, 130, 246, 0.5)',
    backgroundColor: 'rgba(30, 58, 138, 0.45)',
  },
  weekChipText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  weekChipTextAway: {
    color: '#93c5fd',
  },
  pillBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 6,
    paddingVertical: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  arrowBtn: {
    width: 34,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowText: {
    color: '#cbd5e1',
    fontSize: 22,
    fontWeight: '600',
    lineHeight: 24,
  },
  daysRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  dayPill: {
    flex: 1,
    height: 44,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  dayPillActive: {
    backgroundColor: '#3b82f6',
  },
  dayShort: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  dayNumber: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 1,
  },
  dayTextActive: {
    color: '#ffffff',
  },
  todayDot: {
    position: 'absolute',
    bottom: 3,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3b82f6',
  },
  todayDotActive: {
    backgroundColor: '#ffffff',
  },
  pressed: {
    opacity: 0.7,
  },
});

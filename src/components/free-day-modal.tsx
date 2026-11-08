import React, { useMemo } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TerminarzEvent, WeekSchedule } from '@/types/librus';
import { isLessonFreeDay } from '@/services/timetableMapper';
import { formatFreeDayRangeSubtitle } from '@/services/activityFeed';
import { cleanFreeDayReason, getTerminarzColor } from '@/utils/terminarzMatcher';
import { parseISODate } from '@/utils/dates';

export interface FreeDayModalTarget {
  date: string;
  startDate?: string;
  endDate?: string;
  reason?: string;
  showOpenTimetableButton?: boolean;
}

export interface FreeDayModalProps {
  visible: boolean;
  target: FreeDayModalTarget | null;
  weeks: Record<string, WeekSchedule>;
  terminarzEvents: TerminarzEvent[];
  onClose: () => void;
  onNavigateToDate: (dateIso: string) => void;
}

function daysBetweenIso(startIso: string, endIso: string): number {
  const a = parseISODate(startIso);
  const b = parseISODate(endIso);
  return Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
}

function formatShortDateLabel(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate;
  return `${isoDate.slice(8, 10)}.${isoDate.slice(5, 7)}.${isoDate.slice(0, 4)}`;
}

/**
 * Fallback holiday name for standard Polish statutory/school holidays when
 * Librus only provides a generic "dzień wolny szkoły" label.
 */
export function inferPolishHolidayReason(
  startDate: string,
  endDate: string
): string | undefined {
  const startMD = startDate.slice(5, 10);
  const endMD = endDate.slice(5, 10);

  if (startMD === '11-11' || endMD === '11-11') {
    return 'Narodowe Święto Niepodległości';
  }
  if (startMD === '01-06' || endMD === '01-06') {
    return 'Święto Trzech Króli';
  }
  if (startMD === '01-01' && endMD === '01-01') {
    return 'Nowy Rok';
  }
  if (startMD === '11-01' || endMD === '11-01') {
    return 'Wszystkich Świętych';
  }
  if (startMD === '10-14' && endMD === '10-14') {
    return 'Dzień Edukacji Narodowej';
  }
  if (
    (startMD >= '12-22' && startMD <= '12-31') ||
    (startDate.slice(5, 7) === '12' && endDate.slice(5, 7) === '01')
  ) {
    return 'Zimowa przerwa świąteczna';
  }
  const spanDays = daysBetweenIso(startDate, endDate) + 1;
  const startMonth = startDate.slice(5, 7);
  if ((startMonth === '01' || startMonth === '02') && spanDays >= 5) {
    return 'Ferie zimowe';
  }
  if ((startMonth === '03' || startMonth === '04') && spanDays >= 3) {
    return 'Wiosenna przerwa świąteczna';
  }
  if (startMD >= '05-01' && startMD <= '05-03') {
    return 'Przerwa majowa';
  }
  return undefined;
}

export const FreeDayModal: React.FC<FreeDayModalProps> = ({
  visible,
  target,
  weeks,
  terminarzEvents,
  onClose,
  onNavigateToDate,
}) => {
  const resolved = useMemo(() => {
    if (!target) return null;

    // 1. Collect all known free days and their Terminarz / Timetable reasons
    const freeMap = new Map<string, string | undefined>();

    for (const ev of terminarzEvents) {
      if (!ev.date || ev.category !== 'free_day') continue;
      const reason =
        cleanFreeDayReason(ev.displayType) ||
        cleanFreeDayReason(ev.description) ||
        cleanFreeDayReason(ev.rawType);
      if (reason || !freeMap.has(ev.date)) {
        freeMap.set(ev.date, reason || freeMap.get(ev.date));
      }
    }

    for (const wk of Object.values(weeks)) {
      for (const day of wk.days ?? []) {
        if (!day.date) continue;
        const regularLessons = (day.lessons ?? []).filter((l) => !l.isStandaloneEvent);
        const isFree =
          Boolean(day.isFreeDay) ||
          (regularLessons.length > 0 &&
            regularLessons.every((l) => Boolean(l.isFreeDay || isLessonFreeDay(l))));
        if (!isFree) continue;
        const dayReason = cleanFreeDayReason(day.freeDayLabel);
        if (!freeMap.has(day.date) || (!freeMap.get(day.date) && dayReason)) {
          freeMap.set(day.date, freeMap.get(day.date) || dayReason);
        }
      }
    }

    const baseDate = target.date;
    if (baseDate && !freeMap.has(baseDate)) {
      freeMap.set(baseDate, cleanFreeDayReason(target.reason));
    }

    const sortedDates = Array.from(freeMap.keys()).sort();
    let startDate = target.startDate || baseDate;
    let endDate = target.endDate || baseDate;

    // Expand contiguous free-day range around baseDate if startDate === endDate
    const anchorIdx = sortedDates.indexOf(baseDate);
    if (anchorIdx !== -1 && startDate === endDate) {
      const anchorReason = (freeMap.get(baseDate) || '').trim().toLowerCase();
      let left = anchorIdx;
      while (left > 0) {
        const prevDate = sortedDates[left - 1];
        const currDate = sortedDates[left];
        const prevReason = (freeMap.get(prevDate) || '').trim().toLowerCase();
        if (
          daysBetweenIso(prevDate, currDate) <= 3 &&
          (!anchorReason || !prevReason || anchorReason === prevReason)
        ) {
          left -= 1;
        } else {
          break;
        }
      }
      let right = anchorIdx;
      while (right < sortedDates.length - 1) {
        const currDate = sortedDates[right];
        const nextDate = sortedDates[right + 1];
        const nextReason = (freeMap.get(nextDate) || '').trim().toLowerCase();
        if (
          daysBetweenIso(currDate, nextDate) <= 3 &&
          (!anchorReason || !nextReason || anchorReason === nextReason)
        ) {
          right += 1;
        } else {
          break;
        }
      }
      startDate = sortedDates[left];
      endDate = sortedDates[right];
    }

    // Pick best Terminarz holiday reason in [startDate, endDate]
    let holidayReason = cleanFreeDayReason(target.reason);
    if (!holidayReason) {
      for (const d of sortedDates) {
        if (d >= startDate && d <= endDate) {
          const r = freeMap.get(d);
          if (r) {
            holidayReason = r;
            break;
          }
        }
      }
    }
    if (!holidayReason) {
      holidayReason = inferPolishHolidayReason(startDate, endDate);
    }

    // 2. Find any active Sprawdzian / Poprawa / Konsultacje / etc. in [startDate, endDate]
    const activeEventsMap = new Map<string, TerminarzEvent>();
    for (const ev of terminarzEvents) {
      if (!ev.id || ev.category === 'free_day') continue;
      if (ev.date >= startDate && ev.date <= endDate) {
        activeEventsMap.set(ev.id, ev);
      }
    }
    for (const wk of Object.values(weeks)) {
      for (const day of wk.days ?? []) {
        if (!day.date || day.date < startDate || day.date > endDate) continue;
        for (const lesson of day.lessons ?? []) {
          for (const ev of lesson.events ?? []) {
            if (ev.id && ev.category !== 'free_day') {
              activeEventsMap.set(ev.id, ev);
            }
          }
        }
      }
    }

    const activeEvents = Array.from(activeEventsMap.values()).sort((a, b) => {
      const cmp = a.date.localeCompare(b.date);
      if (cmp !== 0) return cmp;
      return (a.lessonNumber ?? 0) - (b.lessonNumber ?? 0);
    });

    const periodSubtitle = formatFreeDayRangeSubtitle(startDate, endDate);

    return {
      startDate,
      endDate,
      holidayReason: holidayReason || 'Dzień wolny od zajęć dydaktycznych',
      periodSubtitle,
      activeEvents,
    };
  }, [target, weeks, terminarzEvents]);

  if (!visible || !target || !resolved) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.iconCircle}>
              <Ionicons name="sunny-outline" size={22} color="#f87171" />
            </View>
            <Text style={styles.title} numberOfLines={1}>
              Dzień wolny od szkoły
            </Text>
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={onClose}
              style={styles.closeBtn}>
              <Ionicons name="close" size={18} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          {/* Holiday Name & Date Range Box */}
          <View style={styles.infoBox}>
            <Text style={styles.reasonLabel}>POWÓD</Text>
            <Text style={styles.reasonTitle}>{resolved.holidayReason}</Text>

            <View style={styles.periodRow}>
              <Ionicons name="calendar-outline" size={15} color="#f87171" />
              <Text style={styles.periodText}>{resolved.periodSubtitle}</Text>
            </View>
          </View>

          {/* Active Events from Terminarz in that period */}
          <View style={styles.eventsSection}>
            <Text style={styles.sectionHeader}>
              WYDARZENIA Z TERMINARZA ({resolved.activeEvents.length})
            </Text>

            {resolved.activeEvents.length > 0 && (
              <ScrollView
                style={styles.eventsScroll}
                contentContainerStyle={styles.eventsScrollContent}
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}>
                {resolved.activeEvents.map((ev) => {
                  const color = getTerminarzColor(ev.category);
                  const lessonMeta =
                    ev.lessonNumber > 0
                      ? `Lekcja ${ev.lessonNumber}`
                      : ev.hasExplicitLessonZero
                        ? 'Lekcja 0'
                        : ev.startTime && ev.endTime
                          ? `${ev.startTime}–${ev.endTime}`
                          : 'Cały dzień';
                  const subParts = [
                    formatShortDateLabel(ev.date),
                    lessonMeta,
                    ev.classroom ? `s. ${ev.classroom}` : '',
                    ev.teacher || '',
                  ].filter(Boolean);

                  return (
                    <TouchableOpacity
                      key={ev.id}
                      activeOpacity={0.82}
                      onPress={() => {
                        onClose();
                        onNavigateToDate(ev.date);
                      }}
                      style={[
                        styles.eventCard,
                        { borderColor: `${color}55` },
                      ]}>
                      <View style={styles.eventCardMain}>
                        <View style={styles.eventCardTopRow}>
                          <View
                            style={[
                              styles.eventTypePill,
                              {
                                backgroundColor: `${color}22`,
                                borderColor: `${color}66`,
                              },
                            ]}>
                            <Text style={[styles.eventTypePillText, { color }]}>
                              {ev.displayType}
                            </Text>
                          </View>
                          <Text style={styles.eventTitle} numberOfLines={1}>
                            {ev.subject || ev.description || ev.displayType}
                          </Text>
                        </View>
                        {ev.description && ev.subject ? (
                          <Text style={styles.eventDesc} numberOfLines={2}>
                            {ev.description}
                          </Text>
                        ) : null}
                        <Text style={styles.eventMeta} numberOfLines={1}>
                          {subParts.join(' • ')}
                        </Text>
                      </View>
                      <Ionicons
                        name="chevron-forward"
                        size={18}
                        color="#94a3b8"
                      />
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>

          {/* Footer Action when opened from Ostatnia aktywność */}
          {target.showOpenTimetableButton && (
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.openTimetableBtn}
              onPress={() => {
                onClose();
                onNavigateToDate(resolved.startDate);
              }}>
              <Ionicons name="calendar-outline" size={17} color="#ffffff" />
              <Text style={styles.openTimetableBtnText}>
                Pokaż w planie lekcji
              </Text>
            </TouchableOpacity>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 430,
    backgroundColor: '#1e293b',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#f8fafc',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBox: {
    backgroundColor: '#0f172a',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    gap: 6,
  },
  reasonLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#94a3b8',
    letterSpacing: 0.5,
  },
  reasonTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fca5a5',
    lineHeight: 22,
  },
  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  periodText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#e2e8f0',
  },
  eventsSection: {
    gap: 8,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94a3b8',
    letterSpacing: 0.5,
  },
  eventsScroll: {
    maxHeight: 220,
  },
  eventsScrollContent: {
    gap: 8,
  },
  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
  },
  eventCardMain: {
    flex: 1,
    gap: 4,
  },
  eventCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  eventTypePill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  eventTypePillText: {
    fontSize: 10.5,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  eventTitle: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '700',
    color: '#f8fafc',
  },
  eventDesc: {
    fontSize: 12,
    color: '#cbd5e1',
    lineHeight: 16,
  },
  eventMeta: {
    fontSize: 11.5,
    color: '#94a3b8',
  },
  openTimetableBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#3b82f6',
    marginTop: 2,
  },
  openTimetableBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
});

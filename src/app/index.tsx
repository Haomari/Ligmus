import React, { useCallback, useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useLibrus } from '@/context/LibrusContext';
import {
  ActivityEventCard,
  ActivityFeedModal,
} from '@/components/activity-feed-modal';
import {
  FreeDayModal,
  FreeDayModalTarget,
} from '@/components/free-day-modal';
import {
  ActivityFeedItem,
  DaySchedule,
  TimetableLesson,
  WeekSchedule,
} from '@/types/librus';
import {
  getInitialSchoolDate,
  getMonday,
  parseHM,
  toISODate,
} from '@/utils/dates';
import { getAllCachedWeeks } from '@/services/fileCache';
import { isLessonFreeDay } from '@/services/timetableMapper';
import { getTerminarzColor } from '@/utils/terminarzMatcher';
import {
  getEffectiveBottomInset,
  WIDE_LAYOUT_BREAKPOINT,
} from '@/constants/layout';

function isDayFreeOrLessonCancelled(
  day: DaySchedule,
  lesson: TimetableLesson
): boolean {
  if (day.isFreeDay) return true;
  if (lesson.isCancelled || lesson.isFreeDay || isLessonFreeDay(lesson)) {
    return true;
  }
  return false;
}

function findNextLesson(
  weeks: Record<string, WeekSchedule>,
  timetable: DaySchedule[]
): {
  nextLesson: TimetableLesson | null;
  nextLessonDayLabel: string | null;
  nextLessonDate: string | null;
} {
  const now = new Date();
  const todayIso = toISODate(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const targetDate = getInitialSchoolDate(now);
  const targetDateIso = toISODate(targetDate);
  const targetWeekStart = toISODate(getMonday(targetDate));
  const currentWeekStart = toISODate(getMonday(now));

  const hasLessons = (dList?: DaySchedule[]) =>
    Boolean(dList && dList.some((d) => d.lessons && d.lessons.length > 0));

  // Check remaining non-cancelled regular lessons today first
  const todayDays = weeks[currentWeekStart]?.days ?? timetable ?? [];
  const todaySchedule = todayDays.find((d) => d.date === todayIso);
  if (todaySchedule && !todaySchedule.isFreeDay) {
    const upcomingToday = todaySchedule.lessons.find(
      (l) =>
        !isDayFreeOrLessonCancelled(todaySchedule, l) &&
        !l.isStandaloneEvent &&
        parseHM(l.endTime || '23:59') >= nowMin
    );
    if (upcomingToday) {
      return {
        nextLesson: upcomingToday,
        nextLessonDayLabel: 'Dzisiaj',
        nextLessonDate: todaySchedule.date || todayIso,
      };
    }
  }

  // Choose best candidate week for upcoming lessons
  let days: DaySchedule[] = [];
  if (hasLessons(weeks[targetWeekStart]?.days)) {
    days = weeks[targetWeekStart].days;
  } else if (hasLessons(timetable)) {
    days = timetable;
  } else {
    const allC = getAllCachedWeeks();
    const anyCachedWeek =
      Object.values(weeks).find((w) => hasLessons(w?.days)) ??
      Object.values(allC).find((w) => hasLessons(w?.days));
    if (anyCachedWeek) {
      days = anyCachedWeek.days;
    }
  }

  // Find the first non-cancelled regular lesson on a future school day in target week
  for (const d of days) {
    if (d.date > todayIso && !d.isFreeDay) {
      const firstActive = d.lessons.find(
        (l) => !isDayFreeOrLessonCancelled(d, l) && !l.isStandaloneEvent
      );
      if (firstActive) {
        return {
          nextLesson: firstActive,
          nextLessonDayLabel: d.dayName,
          nextLessonDate: d.date || targetDateIso,
        };
      }
    }
  }

  // Fallback to first non-cancelled regular lesson in days (e.g. Monday morning template)
  for (const d of days) {
    if (d.isFreeDay) continue;
    const firstActive = d.lessons.find(
      (l) => !isDayFreeOrLessonCancelled(d, l) && !l.isStandaloneEvent
    );
    if (firstActive) {
      return {
        nextLesson: firstActive,
        nextLessonDayLabel: d.dayName,
        nextLessonDate: d.date || targetDateIso,
      };
    }
  }

  return { nextLesson: null, nextLessonDayLabel: null, nextLessonDate: null };
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const isWideScreen = windowWidth >= WIDE_LAYOUT_BREAKPOINT;
  const isCompactPhone = windowWidth < 480;
  const {
    student,
    timetable,
    weeks,
    terminarzEvents,
    attendanceStats,
    activityFeed,
    isAuthenticated,
    isLoading,
    isRefreshing,
    refreshData,
  } = useLibrus();

  const [activityModalVisible, setActivityModalVisible] = useState(false);
  const [freeDayModalTarget, setFreeDayModalTarget] =
    useState<FreeDayModalTarget | null>(null);

  React.useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login' as any);
    }
  }, [isLoading, isAuthenticated, router]);

  const { nextLesson, nextLessonDate } = useMemo(
    () => findNextLesson(weeks, timetable),
    [weeks, timetable]
  );

  const attendanceColor = useMemo(() => {
    const pct = attendanceStats?.percent;
    if (pct == null) return '#64748b';
    if (pct < 50) return '#ef4444';
    if (pct < 60) return '#f59e0b';
    if (pct >= 85) return '#10b981';
    return '#38bdf8';
  }, [attendanceStats?.percent]);

  const recentActivity = useMemo(() => activityFeed.slice(0, 4), [activityFeed]);

  const handleActivityPress = useCallback(
    (item: ActivityFeedItem) => {
      if (
        item.id.startsWith('free_day:') ||
        item.badgeText === 'Wolne' ||
        item.targetParams?.openFreeDayModal === '1'
      ) {
        setFreeDayModalTarget({
          date: item.date,
          startDate: item.targetParams?.startDate || item.date,
          endDate: item.targetParams?.endDate || item.date,
          reason: item.targetParams?.reason,
          showOpenTimetableButton: true,
        });
        return;
      }

      if (item.targetParams && Object.keys(item.targetParams).length > 0) {
        router.push({
          pathname: item.targetRoute as any,
          params: {
            ...item.targetParams,
            jumpTs: String(Date.now()),
          },
        });
      } else {
        router.push(item.targetRoute as any);
      }
    },
    [router]
  );

  const nextLessonPrimaryEvent = nextLesson?.events?.[0] ?? null;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        contentContainerStyle={[
          styles.container,
          isCompactPhone && styles.containerCompact,
          {
            paddingBottom: Math.max(
              getEffectiveBottomInset(insets.bottom, isWideScreen) + 28,
              40
            ),
          },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isLoading || isRefreshing}
            onRefresh={refreshData}
            tintColor="#3b82f6"
          />
        }>
        {/* Compact Header with Lucky Number Pill */}
        <View style={styles.header}>
          <View style={styles.headerInfoCol}>
            <Text style={styles.greeting} numberOfLines={1}>
              {student?.name || 'Uczeń'}
            </Text>
            <Text style={styles.subGreeting} numberOfLines={1}>
              {student?.classGroup || 'Librus Synergia'}
              {student?.studentNumber ? ` • Nr ${student.studentNumber}` : ''}
            </Text>
          </View>
          <View style={styles.luckyPill}>
            <Text style={styles.luckyPillEmoji}>🍀</Text>
            <Text style={styles.luckyPillValue}>{student?.luckyNumber ?? '--'}</Text>
          </View>
        </View>

        {/* Frekwencja % Tile — 4 Equal Vertical Stat Boxes + Segmented Bar */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => router.push('/attendance' as any)}
          style={[
            styles.card,
            styles.attendanceCard,
            isCompactPhone && styles.attendanceCardCompact,
          ]}>
          <View style={styles.attendanceHeaderRow}>
            <View style={styles.attendanceTitleCol}>
              <View style={styles.attendanceLabelRow}>
                <Ionicons name="pie-chart-outline" size={18} color={attendanceColor} />
                <Text style={styles.attendanceTitle}>Frekwencja</Text>
              </View>
              {attendanceStats && attendanceStats.total > 0 && (
                <Text style={styles.attendanceSubMeta}>
                  Łącznie rozliczono {attendanceStats.total} lekcji
                </Text>
              )}
            </View>
            <View
              style={[
                styles.attendancePercentBadge,
                {
                  backgroundColor: `${attendanceColor}1A`,
                  borderColor: `${attendanceColor}55`,
                },
              ]}>
              <Text style={[styles.attendancePercentText, { color: attendanceColor }]}>
                {attendanceStats?.percent != null
                  ? `${attendanceStats.percent.toFixed(1)}%`
                  : '--%'}
              </Text>
            </View>
          </View>

          {attendanceStats && attendanceStats.total > 0 && (
            <>
              <View style={styles.segmentedBarTrack}>
                {attendanceStats.present > 0 && (
                  <View
                    style={[
                      styles.segmentedBarFill,
                      {
                        flex: attendanceStats.present,
                        backgroundColor: '#10b981',
                      },
                    ]}
                  />
                )}
                {attendanceStats.late > 0 && (
                  <View
                    style={[
                      styles.segmentedBarFill,
                      {
                        flex: attendanceStats.late,
                        backgroundColor: '#f59e0b',
                      },
                    ]}
                  />
                )}
                {attendanceStats.excused > 0 && (
                  <View
                    style={[
                      styles.segmentedBarFill,
                      {
                        flex: attendanceStats.excused,
                        backgroundColor: '#3b82f6',
                      },
                    ]}
                  />
                )}
                {attendanceStats.absent > 0 && (
                  <View
                    style={[
                      styles.segmentedBarFill,
                      {
                        flex: attendanceStats.absent,
                        backgroundColor: '#ef4444',
                      },
                    ]}
                  />
                )}
              </View>

              <View
                style={[
                  styles.attendanceStatsRow,
                  isCompactPhone && styles.attendanceStatsRowCompact,
                ]}>
                <View
                  style={[
                    styles.statBox,
                    isCompactPhone && styles.statBoxCompact,
                  ]}>
                  <Text style={[styles.statBoxValue, { color: '#10b981' }]}>
                    {attendanceStats.present}
                  </Text>
                  <Text
                    style={[
                      styles.statBoxLabel,
                      isCompactPhone && styles.statBoxLabelCompact,
                    ]}
                    numberOfLines={1}>
                    Obecności
                  </Text>
                </View>

                <View
                  style={[
                    styles.statBox,
                    isCompactPhone && styles.statBoxCompact,
                  ]}>
                  <Text style={[styles.statBoxValue, { color: '#ef4444' }]}>
                    {attendanceStats.absent}
                  </Text>
                  <Text
                    style={[
                      styles.statBoxLabel,
                      isCompactPhone && styles.statBoxLabelCompact,
                    ]}
                    numberOfLines={1}>
                    {isCompactPhone ? 'Nieob.' : 'Nieobecności'}
                  </Text>
                </View>

                <View
                  style={[
                    styles.statBox,
                    isCompactPhone && styles.statBoxCompact,
                  ]}>
                  <Text style={[styles.statBoxValue, { color: '#3b82f6' }]}>
                    {attendanceStats.excused}
                  </Text>
                  <Text
                    style={[
                      styles.statBoxLabel,
                      isCompactPhone && styles.statBoxLabelCompact,
                    ]}
                    numberOfLines={1}>
                    Uspr.
                  </Text>
                </View>

                <View
                  style={[
                    styles.statBox,
                    isCompactPhone && styles.statBoxCompact,
                  ]}>
                  <Text style={[styles.statBoxValue, { color: '#f59e0b' }]}>
                    {attendanceStats.late}
                  </Text>
                  <Text
                    style={[
                      styles.statBoxLabel,
                      isCompactPhone && styles.statBoxLabelCompact,
                    ]}
                    numberOfLines={1}>
                    Spóźnienia
                  </Text>
                </View>
              </View>
            </>
          )}
        </TouchableOpacity>

        {/* Next Lesson Card */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Najbliższa lekcja</Text>
            <TouchableOpacity onPress={() => router.push('/timetable' as any)}>
              <Text style={styles.seeAllText}>Cały plan →</Text>
            </TouchableOpacity>
          </View>

          {nextLesson ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() =>
                router.push({
                  pathname: '/timetable' as any,
                  params: {
                    date:
                      nextLessonDate ||
                      toISODate(getInitialSchoolDate(new Date())),
                    jumpTs: String(Date.now()),
                  },
                })
              }
              style={[styles.card, styles.lessonCard]}>
              <View style={styles.lessonTimeCol}>
                <Text style={styles.lessonHour}>Lekcja {nextLesson.hourNumber}</Text>
                <Text style={styles.lessonTime}>
                  {nextLesson.startTime && nextLesson.endTime
                    ? `${nextLesson.startTime}–${nextLesson.endTime}`
                    : nextLesson.timeSpan}
                </Text>
              </View>
              <View style={styles.lessonDivider} />
              <View style={styles.lessonInfoCol}>
                <View style={styles.lessonTitleRow}>
                  <Text style={styles.lessonSubject} numberOfLines={1}>
                    {nextLesson.subject}
                  </Text>
                  {nextLesson.isSubstitution ? (
                    <View style={styles.subBadge}>
                      <Text style={styles.subBadgeText}>Zastępstwo</Text>
                    </View>
                  ) : nextLessonPrimaryEvent ? (
                    <View
                      style={[
                        styles.subBadge,
                        {
                          backgroundColor: `${getTerminarzColor(nextLessonPrimaryEvent.category)}1F`,
                          borderColor: `${getTerminarzColor(nextLessonPrimaryEvent.category)}66`,
                        },
                      ]}>
                      <Text
                        style={[
                          styles.subBadgeText,
                          { color: getTerminarzColor(nextLessonPrimaryEvent.category) },
                        ]}>
                        {nextLessonPrimaryEvent.shortLabel}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.lessonMeta} numberOfLines={1}>
                  {nextLesson.classroom ? `s. ${nextLesson.classroom}` : ''}
                  {nextLesson.classroom && nextLesson.teacher ? ' • ' : ''}
                  {nextLesson.teacher}
                </Text>
              </View>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push('/timetable' as any)}
              style={[styles.card, styles.emptyCard]}>
              <Ionicons
                name="calendar-outline"
                size={22}
                color="#64748b"
                style={{ marginBottom: 4 }}
              />
              <Text style={styles.emptyText}>Brak nadchodzących lekcji</Text>
              <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
                Dotknij, aby otworzyć pełny plan lekcji.
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Ostatnia aktywność Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Ostatnia aktywność</Text>
            <TouchableOpacity onPress={() => setActivityModalVisible(true)}>
              <Text style={styles.seeAllText}>Cała lista →</Text>
            </TouchableOpacity>
          </View>

          {recentActivity.length === 0 ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setActivityModalVisible(true)}
              style={[styles.card, styles.emptyCard]}>
              <Ionicons
                name="sparkles-outline"
                size={22}
                color="#64748b"
                style={{ marginBottom: 4 }}
              />
              <Text style={styles.emptyText}>Brak nowych wydarzeń z dzisiaj</Text>
              <Text style={styles.emptyHintText}>
                Kolejne oceny, wiadomości, ogłoszenia i zmiany planu pojawią się tutaj automatycznie.
              </Text>
            </TouchableOpacity>
          ) : (
            <View
              style={[
                styles.activityList,
                isWideScreen && styles.activityListWide,
              ]}>
              {recentActivity.map((item) => (
                <ActivityEventCard
                  key={item.id}
                  item={item}
                  wideHalf={isWideScreen}
                  onPress={handleActivityPress}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <ActivityFeedModal
        visible={activityModalVisible}
        items={activityFeed}
        onClose={() => setActivityModalVisible(false)}
        onSelectItem={handleActivityPress}
      />
      <FreeDayModal
        visible={Boolean(freeDayModalTarget)}
        target={freeDayModalTarget}
        weeks={weeks}
        terminarzEvents={terminarzEvents}
        onClose={() => setFreeDayModalTarget(null)}
        onNavigateToDate={(dateIso) => {
          router.push({
            pathname: '/timetable' as any,
            params: { date: dateIso, jumpTs: String(Date.now()) },
          });
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  container: {
    padding: 18,
    paddingBottom: 40,
    gap: 18,
  },
  containerCompact: {
    paddingHorizontal: 15,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  headerInfoCol: {
    flex: 1,
  },
  greeting: {
    fontSize: 21,
    fontWeight: '800',
    color: '#f8fafc',
  },
  subGreeting: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 2,
  },
  luckyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#064e3b',
    borderWidth: 1,
    borderColor: '#059669',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    flexShrink: 0,
  },
  luckyPillEmoji: {
    fontSize: 16,
  },
  luckyPillValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ecfdf5',
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  attendanceCard: {
    gap: 12,
  },
  attendanceCardCompact: {
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  attendanceHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  attendanceTitleCol: {
    flex: 1,
  },
  attendanceLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  attendanceTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f8fafc',
  },
  attendanceSubMeta: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
    marginTop: 2,
  },
  attendancePercentBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attendancePercentText: {
    fontSize: 18,
    fontWeight: '800',
  },
  segmentedBarTrack: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 999,
    backgroundColor: '#0f172a',
    overflow: 'hidden',
    gap: 2,
  },
  segmentedBarFill: {
    height: '100%',
    borderRadius: 999,
  },
  attendanceStatsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
  },
  attendanceStatsRowCompact: {
    gap: 6,
  },
  statBox: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#263449',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  statBoxCompact: {
    paddingVertical: 9,
    paddingHorizontal: 6,
  },
  statBoxValue: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  statBoxLabel: {
    color: '#94a3b8',
    fontSize: 11.5,
    fontWeight: '600',
    textAlign: 'center',
  },
  statBoxLabelCompact: {
    fontSize: 10,
    letterSpacing: -0.2,
  },
  section: {
    gap: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#f1f5f9',
  },
  seeAllText: {
    fontSize: 13,
    color: '#60a5fa',
    fontWeight: '600',
  },
  lessonCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lessonTimeCol: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingRight: 12,
  },
  lessonHour: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
  },
  lessonTime: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f8fafc',
    marginTop: 2,
  },
  lessonDivider: {
    width: 1,
    height: 38,
    backgroundColor: '#334155',
    marginRight: 14,
  },
  lessonInfoCol: {
    flex: 1,
  },
  lessonTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  lessonSubject: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#f8fafc',
  },
  subBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.16)',
    borderColor: 'rgba(245, 158, 11, 0.45)',
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  subBadgeText: {
    color: '#fbbf24',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  lessonMeta: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 3,
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  emptyText: {
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyHintText: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
    lineHeight: 17,
  },
  activityList: {
    gap: 8,
  },
  activityListWide: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
  },
});

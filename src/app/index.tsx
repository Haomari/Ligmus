import React, { useMemo } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useLibrus } from '@/context/LibrusContext';
import { getGradeColor } from '@/components/grade-details-modal';
import { DaySchedule, TimetableLesson } from '@/types/librus';
import {
  getInitialSchoolDate,
  getMonday,
  parseHM,
  toISODate,
} from '@/utils/dates';

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    student,
    grades,
    timetable,
    weeks,
    attendanceStats,
    isAuthenticated,
    isLoading,
    refreshData,
  } = useLibrus();

  React.useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login' as any);
    }
  }, [isLoading, isAuthenticated]);

  const { nextLesson, nextLessonDayLabel } = useMemo((): {
    nextLesson: TimetableLesson | null;
    nextLessonDayLabel: string | null;
  } => {
    const now = new Date();
    const todayIso = toISODate(now);
    const nowMin = now.getHours() * 60 + now.getMinutes();

    const targetDate = getInitialSchoolDate(now);
    const targetWeekStart = toISODate(getMonday(targetDate));
    const days: DaySchedule[] = weeks[targetWeekStart]?.days ?? timetable ?? [];

    // 1. Check remaining non-cancelled lessons today
    const todaySchedule = days.find((d) => d.date === todayIso);
    if (todaySchedule) {
      const upcomingToday = todaySchedule.lessons.find(
        (l) => !l.isCancelled && parseHM(l.endTime || '23:59') >= nowMin
      );
      if (upcomingToday) {
        return { nextLesson: upcomingToday, nextLessonDayLabel: 'Dzisiaj' };
      }
    }

    // 2. Otherwise find the first non-cancelled lesson on a future school day in this/next week
    for (const d of days) {
      if (d.date > todayIso) {
        const firstActive = d.lessons.find((l) => !l.isCancelled);
        if (firstActive) {
          return { nextLesson: firstActive, nextLessonDayLabel: d.dayName };
        }
      }
    }

    // 3. Fallback to first non-cancelled lesson in days
    for (const d of days) {
      const firstActive = d.lessons.find((l) => !l.isCancelled);
      if (firstActive) {
        return { nextLesson: firstActive, nextLessonDayLabel: d.dayName };
      }
    }

    return { nextLesson: null, nextLessonDayLabel: null };
  }, [weeks, timetable]);

  const attendanceColor = useMemo(() => {
    const pct = attendanceStats?.percent;
    if (pct == null) return '#3b82f6';
    if (pct >= 85) return '#10b981';
    if (pct >= 70) return '#f59e0b';
    return '#ef4444';
  }, [attendanceStats?.percent]);

  // Flatten and sort all grades by date descending to show recent
  const allGrades = grades
    .flatMap((s) => s.grades.map((g) => ({ ...g, subjectName: s.subjectName })))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 4);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingBottom: Math.max(insets.bottom + 24, 40) },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refreshData} tintColor="#3b82f6" />
        }>
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>Cześć, {student?.name ? student.name.split(' ')[0] : 'Uczniu'}! 👋</Text>
            <Text style={styles.subGreeting}>
              {student?.name ? `${student.name} • ` : ''}{student?.classGroup || 'Librus Synergia'}{student?.studentNumber ? ` • Nr ${student.studentNumber}` : ''}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.settingsIconButton}
            onPress={() => router.push('/settings' as any)}>
            <Ionicons name="settings-outline" size={22} color="#94a3b8" />
          </TouchableOpacity>
        </View>

        {/* Lucky Number Card */}
        <View style={[styles.card, styles.luckyCard]}>
          <View style={styles.luckyRow}>
            <View style={styles.luckyIconContainer}>
              <Text style={styles.luckyEmoji}>🍀</Text>
            </View>
            <View style={styles.luckyTextCol}>
              <Text style={styles.luckyTitle}>Szczęśliwy Numerek</Text>
            </View>
            <View style={styles.luckyNumberBadge}>
              <Text style={styles.luckyNumberValue}>{student?.luckyNumber ?? '--'}</Text>
            </View>
          </View>
        </View>

        {/* Frekwencja % Tile */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => router.push('/timetable' as any)}
          style={[styles.card, styles.attendanceCard]}>
          <View style={styles.attendanceHeaderRow}>
            <View style={styles.attendanceTitleCol}>
              <View style={styles.attendanceLabelRow}>
                <Ionicons name="pie-chart-outline" size={18} color={attendanceColor} />
                <Text style={styles.attendanceTitle}>Frekwencja</Text>
              </View>
              <Text style={styles.attendanceSub}>
                Obecności i spóźnienia w bieżącym roku
              </Text>
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
            <View style={styles.attendancePillsRow}>
              <View style={styles.statPill}>
                <View style={[styles.statDot, { backgroundColor: '#10b981' }]} />
                <Text style={styles.statPillText}>
                  Obecności: {attendanceStats.present}
                </Text>
              </View>
              <View style={styles.statPill}>
                <View style={[styles.statDot, { backgroundColor: '#ef4444' }]} />
                <Text style={styles.statPillText}>
                  Nieobecności: {attendanceStats.absent}
                </Text>
              </View>
              {attendanceStats.excused > 0 && (
                <View style={styles.statPill}>
                  <View style={[styles.statDot, { backgroundColor: '#3b82f6' }]} />
                  <Text style={styles.statPillText}>
                    Uspr.: {attendanceStats.excused}
                  </Text>
                </View>
              )}
              <View style={styles.statPill}>
                <View style={[styles.statDot, { backgroundColor: '#f59e0b' }]} />
                <Text style={styles.statPillText}>
                  Spóźnienia: {attendanceStats.late}
                </Text>
              </View>
            </View>
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
              onPress={() => router.push('/timetable' as any)}
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
                  {nextLesson.isSubstitution && (
                    <View style={styles.subBadge}>
                      <Text style={styles.subBadgeText}>Zastępstwo</Text>
                    </View>
                  )}
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
              <Ionicons name="calendar-outline" size={22} color="#64748b" style={{ marginBottom: 4 }} />
              <Text style={styles.emptyText}>Brak nadchodzących lekcji</Text>
              <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
                Dotknij, aby otworzyć pełny plan lekcji.
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Recent Grades Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Ostatnie oceny</Text>
            <TouchableOpacity onPress={() => router.push('/grades' as any)}>
              <Text style={styles.seeAllText}>Wszystkie oceny →</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.gradesList}>
            {allGrades.map((g) => (
              <View key={g.id} style={[styles.card, styles.gradeCard]}>
                <View
                  style={[
                    styles.gradeBadge,
                    { backgroundColor: getGradeColor(g.value) + '20' },
                  ]}>
                  <Text
                    style={[
                      styles.gradeBadgeValue,
                      { color: getGradeColor(g.value) },
                    ]}>
                    {g.value}
                  </Text>
                </View>
                <View style={styles.gradeInfo}>
                  <Text style={styles.gradeSubject}>{g.subjectName}</Text>
                  <Text style={styles.gradeMeta}>
                    {g.category} (waga {g.weight})
                    {g.correction ? ` • popr. z ${g.correction.originalValue}` : ''}
                    {g.comment ? ` • ${g.comment}` : ''}
                  </Text>
                </View>
                <Text style={styles.gradeDate}>{g.date.slice(5)}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  greeting: {
    fontSize: 24,
    fontWeight: '700',
    color: '#f8fafc',
  },
  subGreeting: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 2,
  },
  settingsIconButton: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  luckyCard: {
    backgroundColor: '#064e3b',
    borderColor: '#059669',
  },
  luckyRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  luckyIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#047857',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  luckyEmoji: {
    fontSize: 24,
  },
  luckyTextCol: {
    flex: 1,
  },
  luckyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ecfdf5',
  },
  luckySubtitle: {
    fontSize: 12,
    color: '#a7f3d0',
    marginTop: 2,
  },
  luckyNumberBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#10b981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  luckyNumberValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#ffffff',
  },
  attendanceCard: {
    gap: 12,
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
  attendanceSub: {
    fontSize: 12,
    color: '#94a3b8',
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
  attendancePillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#0f172a',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statPillText: {
    color: '#cbd5e1',
    fontSize: 11,
    fontWeight: '600',
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
    color: '#94a3b8',
    fontSize: 14,
  },
  gradesList: {
    gap: 8,
  },
  gradeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  gradeBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  gradeBadgeValue: {
    fontSize: 17,
    fontWeight: '800',
  },
  gradeInfo: {
    flex: 1,
  },
  gradeSubject: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f8fafc',
  },
  gradeMeta: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  gradeDate: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b80',
    borderColor: '#3b82f640',
    marginTop: 6,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#e2e8f0',
  },
  infoDesc: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
    lineHeight: 16,
  },

  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  activityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22c55e',
    shadowColor: '#22c55e',
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.8,
    shadowRadius: 5,
    elevation: 4,
  },

  activityIndicator: {
    opacity: 0.6,
  },
});

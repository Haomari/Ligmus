import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useLibrus } from '@/context/LibrusContext';

export default function HomeScreen() {
  const router = useRouter();
  const { student, grades, timetable, isDemo, isLoading, refreshData } = useLibrus();

  // Get current day's first lessons (e.g. Monday/Day 1)
  const todaySchedule = timetable[0];
  const nextLesson = todaySchedule?.lessons?.[0];

  // Flatten and sort all grades by date descending to show recent
  const allGrades = grades
    .flatMap((s) => s.grades.map((g) => ({ ...g, subjectName: s.subjectName })))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 4);

  const isUserLucky = student && student.luckyNumber === student.studentNumber;

  const getGradeColor = (val: string) => {
    if (val.startsWith('6') || val.startsWith('5')) return '#10b981'; // Green
    if (val.startsWith('4')) return '#3b82f6'; // Blue
    if (val.startsWith('3')) return '#f59e0b'; // Amber
    if (val.startsWith('2')) return '#f97316'; // Orange
    return '#ef4444'; // Red
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refreshData} tintColor="#3b82f6" />
        }>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Cześć, {student?.name.split(' ')[0] || 'Uczniu'}! 👋</Text>
            <Text style={styles.subGreeting}>
              {student?.classGroup || 'Librus Synergia'} • Nr {student?.studentNumber}
            </Text>
          </View>
          {isDemo && (
            <TouchableOpacity
              style={styles.demoBadge}
              onPress={() => router.push('/settings' as any)}>
              <Text style={styles.demoBadgeText}>Tryb Demo</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Lucky Number Card */}
        <View style={[styles.card, styles.luckyCard]}>
          <View style={styles.luckyRow}>
            <View style={styles.luckyIconContainer}>
              <Text style={styles.luckyEmoji}>🍀</Text>
            </View>
            <View style={styles.luckyTextCol}>
              <Text style={styles.luckyTitle}>Szczęśliwy Numerek</Text>
              <Text style={styles.luckySubtitle}>
                {isUserLucky
                  ? 'To Twój numerek! Brak pytań z ławki!'
                  : `Dzisiaj nie pytamy numerka: ${student?.luckyNumber}`}
              </Text>
            </View>
            <View style={styles.luckyNumberBadge}>
              <Text style={styles.luckyNumberValue}>{student?.luckyNumber ?? '--'}</Text>
            </View>
          </View>
        </View>

        {/* Next Lesson Card */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Najbliższa lekcja</Text>
            <TouchableOpacity onPress={() => router.push('/timetable' as any)}>
              <Text style={styles.seeAllText}>Cały plan →</Text>
            </TouchableOpacity>
          </View>

          {nextLesson ? (
            <View style={[styles.card, styles.lessonCard]}>
              <View style={styles.lessonTimeCol}>
                <Text style={styles.lessonHour}>Lekcja {nextLesson.hourNumber}</Text>
                <Text style={styles.lessonTime}>{nextLesson.timeSpan}</Text>
              </View>
              <View style={styles.lessonDivider} />
              <View style={styles.lessonInfoCol}>
                <Text style={styles.lessonSubject}>{nextLesson.subject}</Text>
                <Text style={styles.lessonMeta}>
                  {nextLesson.classroom} • {nextLesson.teacher}
                </Text>
              </View>
            </View>
          ) : (
            <View style={[styles.card, styles.emptyCard]}>
              <Text style={styles.emptyText}>Brak kolejnych lekcji na dzisiaj 🎉</Text>
            </View>
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
                    {g.comment ? ` • ${g.comment}` : ''}
                  </Text>
                </View>
                <Text style={styles.gradeDate}>{g.date.slice(5)}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Quick Links / Info */}
        <View style={[styles.card, styles.infoCard]}>
          <Ionicons name="shield-checkmark" size={24} color="#3b82f6" />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.infoTitle}>Ligmus - Twój prywatny Librus</Text>
            <Text style={styles.infoDesc}>
              Aplikacja łączy się bezpośrednio z Synergią. Twoje hasło i dane pozostają wyłącznie w pamięci telefonu.
            </Text>
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
  demoBadge: {
    backgroundColor: '#3b82f620',
    borderColor: '#3b82f6',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  demoBadgeText: {
    color: '#60a5fa',
    fontSize: 12,
    fontWeight: '600',
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
  lessonSubject: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f8fafc',
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
});

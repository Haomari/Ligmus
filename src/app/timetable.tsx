import React, { useState } from 'react';
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
import { useLibrus } from '@/context/LibrusContext';
import { TimetableLesson } from '@/types/librus';

export default function TimetableScreen() {
  const { timetable, isLoading, refreshData } = useLibrus();
  const [selectedDayId, setSelectedDayId] = useState<number>(1); // Default to Monday

  const activeSchedule = timetable.find((t) => t.dayId === selectedDayId) || timetable[0];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Plan lekcji</Text>
        <Text style={styles.headerDate}>{activeSchedule?.date || 'Ten tydzień'}</Text>
      </View>

      {timetable.length === 0 ? (
        <ScrollView
          contentContainerStyle={[styles.listContainer, { flex: 1, justifyContent: 'center', alignItems: 'center' }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isLoading} onRefresh={refreshData} tintColor="#3b82f6" />
          }>
          <View style={[styles.emptyCard, { paddingVertical: 40 }]}>
            <Ionicons name="calendar-outline" size={54} color="#38bdf8" style={{ marginBottom: 12 }} />
            <Text style={styles.emptyTitle}>Plan lekcji w przygotowaniu</Text>
            <Text style={styles.emptySubtitle}>
              Pobieranie planu lekcji z serwera Synergia zostanie zintegrowane w kolejnym kroku.
            </Text>
          </View>
        </ScrollView>
      ) : (
        <>
          {/* Days Selector */}
          <View style={styles.daysRow}>
            {timetable.map((day) => {
              const isActive = day.dayId === selectedDayId;
              return (
                <TouchableOpacity
                  key={day.dayId}
                  style={[styles.dayTab, isActive && styles.dayTabActive]}
                  onPress={() => setSelectedDayId(day.dayId)}>
                  <Text style={[styles.dayShortName, isActive && styles.dayShortNameActive]}>
                    {day.shortName}
                  </Text>
                  <Text style={[styles.dayLessonsCount, isActive && styles.dayLessonsCountActive]}>
                    {day.lessons.length} lek.
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <ScrollView
            contentContainerStyle={styles.listContainer}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={isLoading} onRefresh={refreshData} tintColor="#3b82f6" />
            }>
            <View style={styles.dayBanner}>
              <Ionicons name="calendar-outline" size={18} color="#38bdf8" />
              <Text style={styles.dayBannerText}>
                {activeSchedule?.dayName} • {activeSchedule?.lessons.length || 0} lekcji
              </Text>
            </View>

            {activeSchedule?.lessons && activeSchedule.lessons.length > 0 ? (
              activeSchedule.lessons.map((lesson: TimetableLesson) => (
                <View key={lesson.id} style={styles.lessonCard}>
                  <View style={styles.timeBadgeCol}>
                    <View style={styles.hourNumberCircle}>
                      <Text style={styles.hourNumberText}>{lesson.hourNumber}</Text>
                    </View>
                    <Text style={styles.timeSpanText}>{lesson.timeSpan}</Text>
                  </View>

                  <View style={styles.lessonInfoCol}>
                    <Text style={styles.subjectText}>{lesson.subject}</Text>
                    <View style={styles.metaRow}>
                      <View style={styles.classroomBadge}>
                        <Ionicons name="location-outline" size={13} color="#94a3b8" />
                        <Text style={styles.classroomText}>{lesson.classroom}</Text>
                      </View>
                      <View style={styles.teacherBadge}>
                        <Ionicons name="person-outline" size={13} color="#94a3b8" />
                        <Text style={styles.teacherText}>{lesson.teacher}</Text>
                      </View>
                    </View>
                  </View>
                </View>
              ))
            ) : (
              <View style={styles.emptyCard}>
                <Ionicons name="sunny-outline" size={48} color="#94a3b8" />
                <Text style={styles.emptyTitle}>Brak lekcji</Text>
                <Text style={styles.emptySubtitle}>
                  W tym dniu nie ma zaplanowanych zajęć szkolnych.
                </Text>
              </View>
            )}
          </ScrollView>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#f8fafc',
  },
  headerDate: {
    fontSize: 13,
    color: '#38bdf8',
    fontWeight: '600',
  },
  daysRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    gap: 8,
    marginTop: 8,
  },
  dayTab: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  dayTabActive: {
    backgroundColor: '#2563eb',
    borderColor: '#3b82f6',
  },
  dayShortName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#94a3b8',
  },
  dayShortNameActive: {
    color: '#ffffff',
  },
  dayLessonsCount: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 2,
  },
  dayLessonsCountActive: {
    color: '#bfdbfe',
  },
  listContainer: {
    padding: 18,
    gap: 10,
    paddingBottom: 40,
  },
  dayBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  dayBannerText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94a3b8',
  },
  lessonCard: {
    flexDirection: 'row',
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
  },
  timeBadgeCol: {
    alignItems: 'center',
    width: 80,
    paddingRight: 10,
    borderRightWidth: 1,
    borderRightColor: '#334155',
  },
  hourNumberCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hourNumberText: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
  },
  timeSpanText: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },
  lessonInfoCol: {
    flex: 1,
    paddingLeft: 12,
  },
  subjectText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f8fafc',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 6,
  },
  classroomBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  classroomText: {
    fontSize: 12,
    color: '#94a3b8',
  },
  teacherBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  teacherText: {
    fontSize: 12,
    color: '#94a3b8',
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    backgroundColor: '#1e293b',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
    marginTop: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f8fafc',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 4,
    textAlign: 'center',
  },
});

import React, { useEffect, useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLibrus } from '@/context/LibrusContext';
import { Grade, SubjectGrades } from '@/types/librus';
import { GradeDetailsModal, getGradeColor } from '@/components/grade-details-modal';

export default function GradesScreen() {
  const { grades, isLoading, refreshData } = useLibrus();
  const insets = useSafeAreaInsets();

  const [selectedSemester, setSelectedSemester] = useState<1 | 2>(1);
  const [hasInitializedSemester, setHasInitializedSemester] = useState(false);

  // Modal State
  const [modalState, setModalState] = useState<{
    visible: boolean;
    subjectName: string;
    grades: Grade[];
    initialIndex: number;
  }>({
    visible: false,
    subjectName: '',
    grades: [],
    initialIndex: 0,
  });

  // Automatically detect and set active semester to the one with the newest grade
  useEffect(() => {
    if (!hasInitializedSemester && grades.length > 0) {
      let latestSem1Date = 0;
      let latestSem2Date = 0;

      for (const s of grades) {
        for (const g of s.grades) {
          const time = new Date(g.date).getTime() || 0;
          if (g.semester === 1 && time > latestSem1Date) latestSem1Date = time;
          if (g.semester === 2 && time > latestSem2Date) latestSem2Date = time;
        }
      }

      if (latestSem2Date > latestSem1Date) {
        setSelectedSemester(2);
      } else {
        setSelectedSemester(1);
      }
      setHasInitializedSemester(true);
    }
  }, [grades, hasInitializedSemester]);

  // Compute total GPA for selected semester
  const validAverages = grades
    .map((s) => (selectedSemester === 1 ? s.averageSem1 : s.averageSem2))
    .filter((avg): avg is number => avg !== null && avg > 0);

  const totalGpa =
    validAverages.length > 0
      ? (validAverages.reduce((acc, curr) => acc + curr, 0) / validAverages.length).toFixed(2)
      : '--';

  // Sort subjects: subjects with most recent grades appear at the top
  const sortedSubjects = useMemo(() => {
    return [...grades].sort((a, b) => {
      const aGrades = a.grades.filter((g) => g.semester === selectedSemester);
      const bGrades = b.grades.filter((g) => g.semester === selectedSemester);

      if (aGrades.length > 0 && bGrades.length === 0) return -1;
      if (aGrades.length === 0 && bGrades.length > 0) return 1;
      if (aGrades.length === 0 && bGrades.length === 0) {
        return a.subjectName.localeCompare(b.subjectName);
      }

      const aLatest = Math.max(...aGrades.map((g) => new Date(g.date).getTime() || 0));
      const bLatest = Math.max(...bGrades.map((g) => new Date(g.date).getTime() || 0));

      if (bLatest !== aLatest) {
        return bLatest - aLatest;
      }

      return a.subjectName.localeCompare(b.subjectName);
    });
  }, [grades, selectedSemester]);

  const getAvgColor = (avg: number | null) => {
    if (!avg) return '#94a3b8';
    if (avg >= 4.75) return '#10b981';
    if (avg >= 3.75) return '#3b82f6';
    if (avg >= 2.75) return '#f59e0b';
    return '#ef4444';
  };

  const openGradeModal = (subjectName: string, subjectGrades: Grade[], index: number) => {
    setModalState({
      visible: true,
      subjectName,
      grades: subjectGrades,
      initialIndex: index,
    });
  };

  const closeModal = () => {
    setModalState((prev) => ({ ...prev, visible: false }));
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Oceny</Text>
        <View style={styles.gpaBadge}>
          <Text style={styles.gpaLabel}>Średnia: </Text>
          <Text style={styles.gpaValue}>{totalGpa}</Text>
        </View>
      </View>

      {/* Semester Switcher */}
      <View style={styles.semesterTabs}>
        <TouchableOpacity
          style={[styles.semesterTab, selectedSemester === 1 && styles.semesterTabActive]}
          onPress={() => setSelectedSemester(1)}>
          <Text
            style={[
              styles.semesterTabText,
              selectedSemester === 1 && styles.semesterTabTextActive,
            ]}>
            Semestr 1
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.semesterTab, selectedSemester === 2 && styles.semesterTabActive]}
          onPress={() => setSelectedSemester(2)}>
          <Text
            style={[
              styles.semesterTabText,
              selectedSemester === 2 && styles.semesterTabTextActive,
            ]}>
            Semestr 2
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.listContainer,
          { paddingBottom: Math.max(insets.bottom + 24, 40) },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refreshData} tintColor="#3b82f6" />
        }>
        {sortedSubjects.map((subject: SubjectGrades) => {
          const semGrades = subject.grades
            .filter((g) => g.semester === selectedSemester)
            .sort((a, b) => {
              const timeA = new Date(a.date).getTime() || 0;
              const timeB = new Date(b.date).getTime() || 0;
              return timeB - timeA;
            });
          const currentAvg =
            selectedSemester === 1 ? subject.averageSem1 : subject.averageSem2;

          const hasGrades = semGrades.length > 0;

          return (
            <TouchableOpacity
              key={subject.id}
              style={styles.subjectCard}
              activeOpacity={hasGrades ? 0.75 : 1}
              disabled={!hasGrades}
              onPress={() => {
                if (hasGrades) {
                  openGradeModal(subject.subjectName, semGrades, 0);
                }
              }}>
              {/* Symmetrical Card Header */}
              <View style={styles.subjectHeader}>
                <View style={styles.subjectTitleCol}>
                  <Text style={styles.subjectName}>{subject.subjectName}</Text>
                  <Text style={styles.subjectCount}>
                    {semGrades.length} {semGrades.length === 1 ? 'ocena' : 'ocen'}
                  </Text>
                </View>

                {currentAvg !== null && (
                  <View
                    style={[
                      styles.averageBadge,
                      { backgroundColor: getAvgColor(currentAvg) + '25' },
                    ]}>
                    <Text
                      style={[
                        styles.averageValue,
                        { color: getAvgColor(currentAvg) },
                      ]}>
                      {currentAvg.toFixed(2)}
                    </Text>
                  </View>
                )}
              </View>

              {/* Horizontal Grade Pills (Sorted Newest First) */}
              <View style={styles.pillsRow}>
                {hasGrades ? (
                  semGrades.map((g: Grade, idx: number) => {
                    const gradeColor = getGradeColor(g.value);
                    const isImproved = !!g.correction;

                    return (
                      <TouchableOpacity
                        key={g.id}
                        activeOpacity={0.7}
                        onPress={() => openGradeModal(subject.subjectName, semGrades, idx)}
                        style={[
                          styles.gradePill,
                          {
                            backgroundColor: gradeColor + '20',
                            borderColor: isImproved ? gradeColor : 'transparent',
                            borderWidth: isImproved ? 2 : 1,
                          },
                        ]}>
                        <Text style={[styles.gradePillText, { color: gradeColor }]}>
                          {g.value}
                        </Text>
                      </TouchableOpacity>
                    );
                  })
                ) : (
                  <Text style={styles.noGradesText}>Brak ocen w tym semestrze</Text>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Grade Details Swipeable Carousel Modal */}
      <GradeDetailsModal
        key={`${modalState.subjectName}-${modalState.grades.length}-${modalState.initialIndex}`}
        visible={modalState.visible}
        subjectName={modalState.subjectName}
        grades={modalState.grades}
        initialIndex={modalState.initialIndex}
        onClose={closeModal}
      />
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
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#f8fafc',
  },
  gpaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  gpaLabel: {
    fontSize: 13,
    color: '#94a3b8',
    fontWeight: '500',
  },
  gpaValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#38bdf8',
  },
  semesterTabs: {
    flexDirection: 'row',
    backgroundColor: '#1e293b',
    marginHorizontal: 18,
    marginTop: 8,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: '#334155',
  },
  semesterTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  semesterTabActive: {
    backgroundColor: '#3b82f6',
  },
  semesterTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94a3b8',
  },
  semesterTabTextActive: {
    color: '#ffffff',
  },
  listContainer: {
    padding: 18,
    gap: 12,
  },
  subjectCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  subjectHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  subjectTitleCol: {
    flex: 1,
    marginRight: 12,
  },
  subjectName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f8fafc',
  },
  subjectCount: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
    fontWeight: '500',
  },
  averageBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  averageValue: {
    fontSize: 14,
    fontWeight: '800',
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  gradePill: {
    minWidth: 36,
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradePillText: {
    fontSize: 15,
    fontWeight: '800',
  },
  noGradesText: {
    color: '#64748b',
    fontSize: 12,
    fontStyle: 'italic',
  },
});

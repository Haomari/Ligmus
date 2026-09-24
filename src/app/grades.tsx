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
import { Grade, SubjectGrades } from '@/types/librus';

export default function GradesScreen() {
  const { grades, isLoading, refreshData } = useLibrus();
  const [selectedSemester, setSelectedSemester] = useState<1 | 2>(2);
  const [expandedSubject, setExpandedSubject] = useState<string | null>(null);

  // Compute total GPA
  const validAverages = grades
    .map((s) => (selectedSemester === 1 ? s.averageSem1 : s.averageSem2))
    .filter((avg): avg is number => avg !== null && avg > 0);

  const totalGpa =
    validAverages.length > 0
      ? (validAverages.reduce((acc, curr) => acc + curr, 0) / validAverages.length).toFixed(2)
      : '--';

  const toggleExpand = (id: string) => {
    setExpandedSubject(expandedSubject === id ? null : id);
  };

  const getGradeColor = (val: string) => {
    if (val.startsWith('6') || val.startsWith('5')) return '#10b981';
    if (val.startsWith('4')) return '#3b82f6';
    if (val.startsWith('3')) return '#f59e0b';
    if (val.startsWith('2')) return '#f97316';
    return '#ef4444';
  };

  const getAvgColor = (avg: number | null) => {
    if (!avg) return '#94a3b8';
    if (avg >= 4.75) return '#10b981';
    if (avg >= 3.75) return '#3b82f6';
    if (avg >= 2.75) return '#f59e0b';
    return '#ef4444';
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
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refreshData} tintColor="#3b82f6" />
        }>
        {grades.map((subject: SubjectGrades) => {
          const semGrades = subject.grades.filter((g) => g.semester === selectedSemester);
          const currentAvg =
            selectedSemester === 1 ? subject.averageSem1 : subject.averageSem2;
          const isExpanded = expandedSubject === subject.id;

          return (
            <View key={subject.id} style={styles.subjectCard}>
              <TouchableOpacity
                style={styles.subjectHeader}
                activeOpacity={0.7}
                onPress={() => toggleExpand(subject.id)}>
                <View style={styles.subjectTitleCol}>
                  <Text style={styles.subjectName}>{subject.subjectName}</Text>
                  <Text style={styles.subjectCount}>
                    {semGrades.length} {semGrades.length === 1 ? 'ocena' : 'ocen'}
                  </Text>
                </View>

                <View style={styles.subjectRightCol}>
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
                  <Ionicons
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color="#94a3b8"
                    style={{ marginLeft: 8 }}
                  />
                </View>
              </TouchableOpacity>

              {/* Horizontal Grade Pills */}
              <View style={styles.pillsRow}>
                {semGrades.length > 0 ? (
                  semGrades.map((g: Grade) => (
                    <View
                      key={g.id}
                      style={[
                        styles.gradePill,
                        { backgroundColor: getGradeColor(g.value) + '20' },
                      ]}>
                      <Text
                        style={[
                          styles.gradePillText,
                          { color: getGradeColor(g.value) },
                        ]}>
                        {g.value}
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.noGradesText}>Brak ocen w tym semestrze</Text>
                )}
              </View>

              {/* Expanded details list */}
              {isExpanded && semGrades.length > 0 && (
                <View style={styles.detailsContainer}>
                  <View style={styles.detailsDivider} />
                  {semGrades.map((g: Grade) => (
                    <View key={'detail-' + g.id} style={styles.detailRow}>
                      <View
                        style={[
                          styles.detailGradeBadge,
                          { backgroundColor: getGradeColor(g.value) },
                        ]}>
                        <Text style={styles.detailGradeText}>{g.value}</Text>
                      </View>
                      <View style={styles.detailInfo}>
                        <Text style={styles.detailCategory}>
                          {g.category}{' '}
                          <Text style={styles.detailWeight}>(waga {g.weight})</Text>
                        </Text>
                        {g.comment ? (
                          <Text style={styles.detailComment}>{g.comment}</Text>
                        ) : null}
                      </View>
                      <Text style={styles.detailDate}>{g.date}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
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
    paddingBottom: 40,
  },
  subjectCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 14,
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
  },
  subjectRightCol: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  averageBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  averageValue: {
    fontSize: 14,
    fontWeight: '800',
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 12,
  },
  gradePill: {
    minWidth: 32,
    height: 32,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradePillText: {
    fontSize: 14,
    fontWeight: '700',
  },
  noGradesText: {
    color: '#64748b',
    fontSize: 12,
    fontStyle: 'italic',
  },
  detailsContainer: {
    marginTop: 10,
  },
  detailsDivider: {
    height: 1,
    backgroundColor: '#334155',
    marginBottom: 10,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#243248',
  },
  detailGradeBadge: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  detailGradeText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  detailInfo: {
    flex: 1,
  },
  detailCategory: {
    fontSize: 13,
    fontWeight: '600',
    color: '#f1f5f9',
  },
  detailWeight: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '400',
  },
  detailComment: {
    fontSize: 12,
    color: '#60a5fa',
    marginTop: 2,
  },
  detailDate: {
    fontSize: 11,
    color: '#64748b',
  },
});

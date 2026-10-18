import React, { useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useLibrus } from '@/context/LibrusContext';
import { computeDetailedAttendance } from '@/services/timetableMapper';
import { SemesterFilter, SubjectAttendanceStat } from '@/types/librus';
import { getSubjectColor } from '@/utils/subjectColors';
import { AttendanceIcon } from '@/components/timetable/AttendanceIcon';

const SEMESTER_OPTIONS: { key: SemesterFilter; label: string }[] = [
  { key: 'sem1', label: 'Semestr 1' },
  { key: 'sem2', label: 'Semestr 2' },
  { key: 'year', label: 'Cały rok' },
];

function getStatusColor(percent: number | null): string {
  if (percent == null) return '#64748b';
  if (percent < 50) return '#ef4444';
  if (percent < 60) return '#f59e0b';
  if (percent >= 85) return '#10b981';
  return '#38bdf8';
}

export default function AttendanceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    attendanceMarks,
    realizations,
    weeks,
    isLoading,
    isRefreshing,
    refreshData,
  } = useLibrus();

  const [semester, setSemester] = useState<SemesterFilter>('year');
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);

  const detailed = useMemo(
    () =>
      computeDetailedAttendance(
        attendanceMarks,
        realizations,
        weeks,
        semester,
        selectedSubject
      ),
    [attendanceMarks, realizations, weeks, semester, selectedSubject]
  );

  const { overall, bySubject, lowAttendanceSubjects, filteredMarks } = detailed;

  const selectedSubjectStat: SubjectAttendanceStat | null = useMemo(() => {
    if (!selectedSubject) return null;
    return bySubject.find((s) => s.subject === selectedSubject) ?? null;
  }, [bySubject, selectedSubject]);

  const activeStats = selectedSubjectStat ?? overall;
  const activePercentColor = getStatusColor(activeStats.percent);

  const criticalSubjects = lowAttendanceSubjects.filter((s) => s.status === 'danger');
  const warningSubjects = lowAttendanceSubjects.filter((s) => s.status === 'warning');

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <View>
            <Text style={styles.headerTitle}>Frekwencja</Text>
            <Text style={styles.headerSub}>
              Analiza obecności z podziałem na przedmioty i semestry
            </Text>
          </View>
          {overall.absent > 0 && (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push('/messages?autoExcuse=1' as any)}
              style={styles.excuseShortcutBtn}>
              <Ionicons name="document-text-outline" size={16} color="#38bdf8" />
              <Text style={styles.excuseShortcutText}>Usprawiedliw</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Semester Switcher */}
        <View style={styles.semesterBar}>
          {SEMESTER_OPTIONS.map((opt) => {
            const active = semester === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                activeOpacity={0.85}
                onPress={() => setSemester(opt.key)}
                style={[styles.semesterTab, active && styles.semesterTabActive]}>
                <Text
                  style={[
                    styles.semesterTabText,
                    active && styles.semesterTabTextActive,
                  ]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingBottom: Math.max(insets.bottom + 28, 44) },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isLoading || isRefreshing}
            onRefresh={refreshData}
            tintColor="#3b82f6"
          />
        }>
        {/* Automatic <50% and <60% Warning Banners */}
        {criticalSubjects.length > 0 && (
          <View style={[styles.alertBanner, styles.alertBannerDanger]}>
            <View style={styles.alertHeaderRow}>
              <Ionicons name="warning" size={20} color="#f87171" />
              <Text style={styles.alertTitleDanger}>
                Zagrożenie nieklasyfikowaniem (&lt; 50%)
              </Text>
            </View>
            <Text style={styles.alertDesc}>
              W wybranym okresie następujące przedmioty mają frekwencję poniżej 50%:
            </Text>
            <View style={styles.alertSubjectsList}>
              {criticalSubjects.map((sub) => (
                <TouchableOpacity
                  key={sub.subject}
                  onPress={() =>
                    setSelectedSubject(
                      selectedSubject === sub.subject ? null : sub.subject
                    )
                  }
                  style={styles.alertSubjectRow}>
                  <Text style={styles.alertSubjectName}>{sub.subject}</Text>
                  <Text style={styles.alertSubjectMetaDanger}>
                    {sub.percent.toFixed(1)}% ({sub.present + sub.late}/{sub.total}) • brakuje{' '}
                    {sub.mustAttendFor50} ob. do 50%
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {warningSubjects.length > 0 && (
          <View style={[styles.alertBanner, styles.alertBannerWarning]}>
            <View style={styles.alertHeaderRow}>
              <Ionicons name="alert-circle" size={20} color="#fbbf24" />
              <Text style={styles.alertTitleWarning}>
                Uwaga: frekwencja bliska progu 50% (50–60%)
              </Text>
            </View>
            <View style={styles.alertSubjectsList}>
              {warningSubjects.map((sub) => (
                <TouchableOpacity
                  key={sub.subject}
                  onPress={() =>
                    setSelectedSubject(
                      selectedSubject === sub.subject ? null : sub.subject
                    )
                  }
                  style={styles.alertSubjectRow}>
                  <Text style={styles.alertSubjectName}>{sub.subject}</Text>
                  <Text style={styles.alertSubjectMetaWarning}>
                    {sub.percent.toFixed(1)}% ({sub.present + sub.late}/{sub.total}) • zapas:{' '}
                    {sub.canMissFor50} lekcji
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Subject Filter Chips */}
        {bySubject.length > 0 && (
          <View style={styles.filterSection}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsScroll}>
              <TouchableOpacity
                onPress={() => setSelectedSubject(null)}
                style={[
                  styles.filterChip,
                  selectedSubject === null && styles.filterChipActive,
                ]}>
                <Text
                  style={[
                    styles.filterChipText,
                    selectedSubject === null && styles.filterChipTextActive,
                  ]}>
                  Wszystkie przedmioty ({bySubject.length})
                </Text>
              </TouchableOpacity>

              {bySubject.map((sub) => {
                const isSelected = selectedSubject === sub.subject;
                const color = getSubjectColor(sub.subject);
                const isLow = sub.status === 'danger' || sub.status === 'warning';
                return (
                  <TouchableOpacity
                    key={sub.subject}
                    onPress={() =>
                      setSelectedSubject(isSelected ? null : sub.subject)
                    }
                    style={[
                      styles.filterChip,
                      isSelected && {
                        backgroundColor: `${color}26`,
                        borderColor: color,
                      },
                      !isSelected &&
                        sub.status === 'danger' && {
                          borderColor: 'rgba(239, 68, 68, 0.55)',
                        },
                      !isSelected &&
                        sub.status === 'warning' && {
                          borderColor: 'rgba(245, 158, 11, 0.55)',
                        },
                    ]}>
                    <View
                      style={[styles.chipDot, { backgroundColor: color }]}
                    />
                    <Text
                      style={[
                        styles.filterChipText,
                        isSelected && { color: '#f8fafc', fontWeight: '700' },
                      ]}
                      numberOfLines={1}>
                      {sub.subject}
                    </Text>
                    <Text
                      style={[
                        styles.chipPercent,
                        isLow && {
                          color: sub.status === 'danger' ? '#f87171' : '#fbbf24',
                        },
                      ]}>
                      {sub.percent.toFixed(0)}%
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Main Summary Card (Overall or Selected Subject) */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryTopRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.summaryLabel}>
                {selectedSubject ? selectedSubject : 'Frekwencja ogólna'}
              </Text>
              <Text style={styles.summarySubLabel}>
                {semester === 'sem1'
                  ? 'Semestr 1'
                  : semester === 'sem2'
                    ? 'Semestr 2'
                    : 'Cały rok szkolny'}{' '}
                • Łącznie {activeStats.total} lekcji
              </Text>
            </View>

            <View
              style={[
                styles.bigPercentBadge,
                {
                  backgroundColor: `${activePercentColor}1F`,
                  borderColor: `${activePercentColor}66`,
                },
              ]}>
              <Text
                style={[styles.bigPercentText, { color: activePercentColor }]}>
                {activeStats.percent != null
                  ? `${activeStats.percent.toFixed(1)}%`
                  : '--%'}
              </Text>
            </View>
          </View>

          {/* Progress Bar with 50% threshold line */}
          <View style={styles.progressTrackWrap}>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.min(100, Math.max(0, activeStats.percent ?? 0))}%`,
                    backgroundColor: activePercentColor,
                  },
                ]}
              />
              <View style={styles.thresholdMarker50} />
            </View>
            <View style={styles.progressLabelsRow}>
              <Text style={styles.progressScaleText}>0%</Text>
              <Text style={styles.progressThresholdText}>Próg 50%</Text>
              <Text style={styles.progressScaleText}>100%</Text>
            </View>
          </View>

          {/* Calculator message when a single subject is selected */}
          {selectedSubjectStat && (
            <View
              style={[
                styles.calcBanner,
                selectedSubjectStat.status === 'danger'
                  ? styles.calcBannerDanger
                  : styles.calcBannerSafe,
              ]}>
              <Ionicons
                name={
                  selectedSubjectStat.status === 'danger'
                    ? 'alert-circle-outline'
                    : 'calculator-outline'
                }
                size={16}
                color={
                  selectedSubjectStat.status === 'danger' ? '#f87171' : '#38bdf8'
                }
              />
              <Text style={styles.calcBannerText}>
                {selectedSubjectStat.status === 'danger'
                  ? `Aby osiągnąć 50% klasyfikacji, musisz być obecny(-a) na kolejnych ${selectedSubjectStat.mustAttendFor50} lekcjach z rzędu.`
                  : `Zapas ponad próg 50%: możesz opuścić jeszcze ${selectedSubjectStat.canMissFor50} ${
                      selectedSubjectStat.canMissFor50 === 1 ? 'lekcję' : 'lekcji'
                    } z tego przedmiotu.`}
              </Text>
            </View>
          )}

          {/* Counts Grid */}
          <View style={styles.statsPillsGrid}>
            <View style={styles.statBox}>
              <Text style={[styles.statBoxValue, { color: '#10b981' }]}>
                {activeStats.present}
              </Text>
              <Text style={styles.statBoxLabel}>Obecności</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statBoxValue, { color: '#ef4444' }]}>
                {activeStats.absent}
              </Text>
              <Text style={styles.statBoxLabel}>Nieob. (NB)</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statBoxValue, { color: '#3b82f6' }]}>
                {activeStats.excused}
              </Text>
              <Text style={styles.statBoxLabel}>Uspraw. (U)</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statBoxValue, { color: '#f59e0b' }]}>
                {activeStats.late}
              </Text>
              <Text style={styles.statBoxLabel}>Spóźn. (SP)</Text>
            </View>
          </View>
        </View>

        {/* Per-Subject Cards */}
        {!selectedSubject && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Przedmioty ({bySubject.length})
            </Text>

            {bySubject.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="pie-chart-outline" size={26} color="#64748b" />
                <Text style={styles.emptyTitle}>
                  Brak danych o lekcjach w tym okresie
                </Text>
                <Text style={styles.emptySub}>
                  Wybierz inny semestr lub odśwież dane z Librusa.
                </Text>
              </View>
            ) : (
              <View style={styles.subjectsList}>
                {bySubject.map((sub) => {
                  const subjColor = getSubjectColor(sub.subject);
                  const statusColor = getStatusColor(sub.percent);
                  return (
                    <TouchableOpacity
                      key={sub.subject}
                      activeOpacity={0.85}
                      onPress={() => setSelectedSubject(sub.subject)}
                      style={[
                        styles.subjectCard,
                        sub.status === 'danger' && styles.subjectCardDanger,
                        sub.status === 'warning' && styles.subjectCardWarning,
                      ]}>
                      <View
                        style={[
                          styles.subjectColorBar,
                          { backgroundColor: subjColor },
                        ]}
                      />
                      <View style={styles.subjectCardBody}>
                        <View style={styles.subjectCardTop}>
                          <Text style={styles.subjectName} numberOfLines={1}>
                            {sub.subject}
                          </Text>
                          <View
                            style={[
                              styles.subjectPctBadge,
                              {
                                backgroundColor: `${statusColor}1F`,
                                borderColor: `${statusColor}55`,
                              },
                            ]}>
                            <Text
                              style={[
                                styles.subjectPctText,
                                { color: statusColor },
                              ]}>
                              {sub.percent.toFixed(1)}%
                            </Text>
                          </View>
                        </View>

                        <View style={styles.subjectMiniProgressTrack}>
                          <View
                            style={[
                              styles.subjectMiniProgressFill,
                              {
                                width: `${Math.min(100, Math.max(0, sub.percent))}%`,
                                backgroundColor: statusColor,
                              },
                            ]}
                          />
                        </View>

                        <View style={styles.subjectCountsRow}>
                          <Text style={styles.subjectCountsText}>
                            OB: <Text style={styles.boldWhite}>{sub.present}</Text>
                            {'  •  '}NB:{' '}
                            <Text
                              style={[
                                styles.boldWhite,
                                sub.absent > 0 && { color: '#f87171' },
                              ]}>
                              {sub.absent}
                            </Text>
                            {'  •  '}U:{' '}
                            <Text style={styles.boldWhite}>{sub.excused}</Text>
                            {'  •  '}SP:{' '}
                            <Text style={styles.boldWhite}>{sub.late}</Text>
                          </Text>

                          <Text
                            style={[
                              styles.subjectCalcHint,
                              sub.status === 'danger' && { color: '#f87171' },
                              sub.status === 'warning' && { color: '#fbbf24' },
                            ]}>
                            {sub.status === 'danger'
                              ? `Brakuje ${sub.mustAttendFor50} ob. do 50%`
                              : `Zapas 50%: ${sub.canMissFor50} lek.`}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* Recent Marks List */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>
              Wpisy frekwencji ({filteredMarks.length})
            </Text>
            {selectedSubject && (
              <TouchableOpacity onPress={() => setSelectedSubject(null)}>
                <Text style={styles.clearFilterText}>Pokaż wszystkie →</Text>
              </TouchableOpacity>
            )}
          </View>

          {filteredMarks.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptySub}>
                Brak zarejestrowanych wpisów dla wybranego filtra.
              </Text>
            </View>
          ) : (
            <View style={styles.marksList}>
              {filteredMarks.slice(0, 60).map((mark) => (
                <View key={mark.id} style={styles.markRow}>
                  <AttendanceIcon attendance={mark} size="md" />
                  <View style={styles.markInfoCol}>
                    <Text style={styles.markSubject} numberOfLines={1}>
                      {mark.subject || mark.name}
                    </Text>
                    <Text style={styles.markMeta} numberOfLines={1}>
                      {mark.name}
                      {mark.hourNumber ? ` • ${mark.hourNumber}. lekcja` : ''}
                      {mark.teacher ? ` • ${mark.teacher}` : ''}
                    </Text>
                  </View>
                  <Text style={styles.markDate}>{mark.date || ''}</Text>
                </View>
              ))}
            </View>
          )}
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
  header: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 10,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#f8fafc',
  },
  headerSub: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  excuseShortcutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(56, 189, 248, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.45)',
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 12,
  },
  excuseShortcutText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700',
  },
  semesterBar: {
    flexDirection: 'row',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 3,
    borderWidth: 1,
    borderColor: '#334155',
  },
  semesterTab: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  semesterTabActive: {
    backgroundColor: '#3b82f6',
  },
  semesterTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
  },
  semesterTabTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  container: {
    padding: 18,
    gap: 16,
  },
  alertBanner: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    gap: 8,
  },
  alertBannerDanger: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: 'rgba(239, 68, 68, 0.45)',
  },
  alertBannerWarning: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: 'rgba(245, 158, 11, 0.45)',
  },
  alertHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  alertTitleDanger: {
    color: '#f87171',
    fontSize: 14,
    fontWeight: '800',
    flex: 1,
  },
  alertTitleWarning: {
    color: '#fbbf24',
    fontSize: 14,
    fontWeight: '800',
    flex: 1,
  },
  alertDesc: {
    color: '#cbd5e1',
    fontSize: 12,
  },
  alertSubjectsList: {
    gap: 6,
  },
  alertSubjectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    gap: 8,
  },
  alertSubjectName: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  alertSubjectMetaDanger: {
    color: '#fca5a5',
    fontSize: 11,
    fontWeight: '600',
  },
  alertSubjectMetaWarning: {
    color: '#fde68a',
    fontSize: 11,
    fontWeight: '600',
  },
  filterSection: {
    marginHorizontal: -18,
  },
  chipsScroll: {
    paddingHorizontal: 18,
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  filterChipActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.22)',
    borderColor: '#3b82f6',
  },
  chipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  filterChipText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '600',
    maxWidth: 160,
  },
  filterChipTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  chipPercent: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
  },
  summaryCard: {
    backgroundColor: '#1e293b',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 14,
  },
  summaryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  summaryLabel: {
    fontSize: 17,
    fontWeight: '800',
    color: '#f8fafc',
  },
  summarySubLabel: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  bigPercentBadge: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
  },
  bigPercentText: {
    fontSize: 22,
    fontWeight: '800',
  },
  progressTrackWrap: {
    gap: 4,
  },
  progressTrack: {
    height: 10,
    backgroundColor: '#0f172a',
    borderRadius: 999,
    overflow: 'hidden',
    position: 'relative',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  thresholdMarker50: {
    position: 'absolute',
    left: '50%',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: 'rgba(248, 250, 252, 0.5)',
  },
  progressLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressScaleText: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '600',
  },
  progressThresholdText: {
    fontSize: 10,
    color: '#94a3b8',
    fontWeight: '700',
  },
  calcBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
  },
  calcBannerSafe: {
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderColor: 'rgba(56, 189, 248, 0.35)',
  },
  calcBannerDanger: {
    backgroundColor: 'rgba(239, 68, 68, 0.14)',
    borderColor: 'rgba(239, 68, 68, 0.45)',
  },
  calcBannerText: {
    flex: 1,
    color: '#e2e8f0',
    fontSize: 12,
    lineHeight: 16,
  },
  statsPillsGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  statBoxValue: {
    fontSize: 17,
    fontWeight: '800',
  },
  statBoxLabel: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 2,
    fontWeight: '600',
  },
  section: {
    gap: 10,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f1f5f9',
  },
  clearFilterText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#38bdf8',
  },
  subjectsList: {
    gap: 10,
  },
  subjectCard: {
    flexDirection: 'row',
    backgroundColor: '#1e293b',
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
  },
  subjectCardDanger: {
    borderColor: 'rgba(239, 68, 68, 0.55)',
  },
  subjectCardWarning: {
    borderColor: 'rgba(245, 158, 11, 0.55)',
  },
  subjectColorBar: {
    width: 5,
  },
  subjectCardBody: {
    flex: 1,
    padding: 12,
    gap: 8,
  },
  subjectCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  subjectName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#f8fafc',
  },
  subjectPctBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  subjectPctText: {
    fontSize: 13,
    fontWeight: '800',
  },
  subjectMiniProgressTrack: {
    height: 6,
    backgroundColor: '#0f172a',
    borderRadius: 999,
    overflow: 'hidden',
  },
  subjectMiniProgressFill: {
    height: '100%',
    borderRadius: 999,
  },
  subjectCountsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
  },
  subjectCountsText: {
    fontSize: 11,
    color: '#94a3b8',
  },
  boldWhite: {
    color: '#f8fafc',
    fontWeight: '700',
  },
  subjectCalcHint: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
  },
  marksList: {
    gap: 8,
  },
  markRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 13,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 10,
  },
  markInfoCol: {
    flex: 1,
  },
  markSubject: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f8fafc',
  },
  markMeta: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  markDate: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
  },
  emptyCard: {
    backgroundColor: '#1e293b',
    borderRadius: 15,
    padding: 22,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
    gap: 6,
  },
  emptyTitle: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '700',
  },
  emptySub: {
    color: '#94a3b8',
    fontSize: 12,
    textAlign: 'center',
  },
});

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import {
  AttendanceMark,
  AttendanceStats,
  DaySchedule,
  LessonRealization,
  StudentInfo,
  SubjectGrades,
  WeekSchedule,
} from '@/types/librus';
import { librusClient } from '@/services/librusClient';
import {
  getAllCachedWeeks,
  getCachedAttendanceMarks,
  getCachedRealizations,
  saveCachedAttendanceStats,
  saveCachedWeek,
} from '@/services/fileCache';
import { computeStats, mergeAttendanceAndTopics } from '@/services/timetableMapper';
import { getInitialSchoolDate, getMonday, toISODate } from '@/utils/dates';

interface LibrusContextType {
  student: StudentInfo | null;
  grades: SubjectGrades[];
  timetable: DaySchedule[];
  weeks: Record<string, WeekSchedule>;
  attendanceStats: AttendanceStats | null;
  loadWeek: (weekStartIso: string, forceNetwork?: boolean) => Promise<WeekSchedule | null>;
  isAuthenticated: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
  refreshData: () => Promise<void>;
  login: (login: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const LibrusContext = createContext<LibrusContextType | undefined>(undefined);

export const LibrusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [student, setStudent] = useState<StudentInfo | null>(null);
  const [grades, setGrades] = useState<SubjectGrades[]>([]);
  const [timetable, setTimetable] = useState<DaySchedule[]>([]);
  const [weeks, setWeeks] = useState<Record<string, WeekSchedule>>({});
  const [attendanceStats, setAttendanceStats] = useState<AttendanceStats | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const appState = useRef<AppStateStatus>(AppState.currentState);
  const marksRef = useRef<AttendanceMark[]>([]);
  const realizationsRef = useRef<LessonRealization[]>([]);

  const loadWeek = useCallback(
    async (weekStartIso: string, forceNetwork: boolean = false): Promise<WeekSchedule | null> => {
      const cached = librusClient.getCachedWeekSchedule(weekStartIso);
      if (cached) {
        const mergedCached = mergeAttendanceAndTopics(
          cached,
          marksRef.current,
          realizationsRef.current
        );
        setWeeks((prev) => ({ ...prev, [weekStartIso]: mergedCached }));
        if (!forceNetwork && Date.now() - cached.fetchedAt < 5 * 60 * 1000) {
          return mergedCached;
        }
      }

      const fresh = await librusClient.getWeek(weekStartIso);
      if (fresh) {
        const mergedFresh = mergeAttendanceAndTopics(
          fresh,
          marksRef.current,
          realizationsRef.current
        );
        saveCachedWeek(mergedFresh);
        setWeeks((prev) => {
          const updated = { ...prev, [weekStartIso]: mergedFresh };
          setAttendanceStats((prevStats) => {
            if (prevStats && prevStats.present > 0) return prevStats;
            const recomputed = computeStats(
              marksRef.current,
              realizationsRef.current,
              null,
              prevStats
                ? {
                    present: 0,
                    absent: prevStats.absent,
                    excused: prevStats.excused,
                    late: prevStats.late,
                    exempt: prevStats.exempt,
                  }
                : null,
              updated
            );
            if (recomputed.total > 0) {
              saveCachedAttendanceStats(recomputed);
              return recomputed;
            }
            return prevStats;
          });
          return updated;
        });
        return mergedFresh;
      }

      return cached ?? null;
    },
    []
  );

  const loadAllData = async (forceSpinner: boolean = false) => {
    if (forceSpinner) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    try {
      const hasSession = await librusClient.checkSavedSession();
      setIsAuthenticated(hasSession);

      if (!hasSession) {
        setStudent(null);
        setGrades([]);
        setTimetable([]);
        setWeeks({});
        setAttendanceStats(null);
        marksRef.current = [];
        realizationsRef.current = [];
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      const initialWeekStart = toISODate(getMonday(getInitialSchoolDate()));
      const currentWeekStart = toISODate(getMonday(new Date()));

      // 1. Immediately display cached data if available (zero blank wait time)
      const cachedStu = librusClient.getCachedStudent();
      const cachedGrd = librusClient.getCachedGrades();
      const cachedWeeks = librusClient.getCachedWeeksMap();
      const cachedStats = librusClient.getCachedAttendanceStatsSync();
      const cachedMarks = getCachedAttendanceMarks() ?? [];
      const cachedReal = getCachedRealizations() ?? [];

      marksRef.current = cachedMarks;
      realizationsRef.current = cachedReal;

      if (cachedStu) setStudent(cachedStu);
      if (cachedGrd && cachedGrd.length > 0) setGrades(cachedGrd);
      if (Object.keys(cachedWeeks).length > 0) {
        setWeeks(cachedWeeks);
        const initWeek = cachedWeeks[initialWeekStart] ?? Object.values(cachedWeeks)[0];
        if (initWeek) {
          setTimetable(initWeek.days);
        }
      }
      if (cachedStats) {
        const isLegacyBuggyCache =
          cachedStats.late === 0 &&
          cachedStats.present > 0 &&
          cachedStats.present < cachedStats.excused;
        if (!isLegacyBuggyCache) {
          setAttendanceStats(cachedStats);
        }
      }

      // If we had cache, we can turn off the blocking spinner
      if (
        cachedStu ||
        (cachedGrd && cachedGrd.length > 0) ||
        Object.keys(cachedWeeks).length > 0
      ) {
        setIsLoading(false);
      }

      // 2. Fetch fresh live data from Synergia in parallel
      // On weekends, also fetch the just-finished current week so past lessons & attendance stats are ready immediately
      const [stu, grd, attData, freshWeek, currentCalendarWeek] = await Promise.all([
        librusClient.getStudentInfo(),
        librusClient.getGrades(),
        librusClient.getAttendanceAndRealizations(),
        librusClient.getWeek(initialWeekStart),
        currentWeekStart !== initialWeekStart
          ? librusClient.getWeek(currentWeekStart)
          : Promise.resolve(null),
      ]);

      if (stu) setStudent(stu);
      if (grd) setGrades(grd);

      if (attData) {
        marksRef.current = attData.marks;
        realizationsRef.current = attData.realizations;
      }

      const newWeeksMap: Record<string, WeekSchedule> = { ...getAllCachedWeeks() };

      if (currentCalendarWeek) {
        const mergedCurrentWeek = mergeAttendanceAndTopics(
          currentCalendarWeek,
          marksRef.current,
          realizationsRef.current
        );
        saveCachedWeek(mergedCurrentWeek);
        newWeeksMap[currentWeekStart] = mergedCurrentWeek;
      }

      if (freshWeek) {
        const mergedWeek = mergeAttendanceAndTopics(
          freshWeek,
          marksRef.current,
          realizationsRef.current
        );
        saveCachedWeek(mergedWeek);
        newWeeksMap[initialWeekStart] = mergedWeek;
        setTimetable(mergedWeek.days);
      }

      if (Object.keys(newWeeksMap).length > 0) {
        setWeeks((prev) => ({ ...prev, ...newWeeksMap }));
      }

      if (attData) {
        let finalStats = attData.stats;
        if (Object.keys(newWeeksMap).length > 0) {
          finalStats = computeStats(
            marksRef.current,
            realizationsRef.current,
            null,
            {
              present: 0,
              absent: attData.stats.absent,
              excused: attData.stats.excused,
              late: attData.stats.late,
              exempt: attData.stats.exempt,
            },
            newWeeksMap
          );
          saveCachedAttendanceStats(finalStats);
        }
        setAttendanceStats(finalStats);
      }
    } catch (err) {
      console.error('Failed to load Librus data', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadAllData(true);

    // Auto-resync when returning from background
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        console.log('[LibrusContext] App returned to foreground, auto-resyncing...');
        loadAllData(false);
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const login = async (userLogin: string, pass: string) => {
    setIsLoading(true);
    const res = await librusClient.login(userLogin, pass);
    if (res.success) {
      setIsAuthenticated(true);
      await loadAllData(true);
    }
    setIsLoading(false);
    return res;
  };

  const logout = async () => {
    setIsLoading(true);
    await librusClient.logout();
    setStudent(null);
    setGrades([]);
    setTimetable([]);
    setWeeks({});
    setAttendanceStats(null);
    marksRef.current = [];
    realizationsRef.current = [];
    setIsAuthenticated(false);
    setIsLoading(false);
  };

  return (
    <LibrusContext.Provider
      value={{
        student,
        grades,
        timetable,
        weeks,
        attendanceStats,
        loadWeek,
        isAuthenticated,
        isLoading,
        isRefreshing,
        refreshData: () => loadAllData(false),
        login,
        logout,
      }}>
      {children}
    </LibrusContext.Provider>
  );
};

export const useLibrus = () => {
  const context = useContext(LibrusContext);
  if (!context) {
    throw new Error('useLibrus must be used within a LibrusProvider');
  }
  return context;
};

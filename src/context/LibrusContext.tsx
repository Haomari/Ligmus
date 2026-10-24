import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import {
  AttendanceMark,
  AttendanceStats,
  DaySchedule,
  LessonRealization,
  LibrusMessageSummary,
  MessageFolder,
  StudentInfo,
  SubjectGrades,
  WeekSchedule,
} from '@/types/librus';
import { librusClient } from '@/services/librusClient';
import {
  clearDataCachesOnly,
  ensureSchoolYearCacheValid,
  getAllCachedWeeks,
  getCachedAttendanceMarks,
  getCachedMessages,
  getCachedRealizations,
  isValidAttendanceStats,
  recordSeenInboxMessages,
  saveCachedAttendanceStats,
  saveCachedMessages,
  saveCachedWeek,
  weekHasLessons,
} from '@/services/fileCache';
import {
  computeDetailedAttendance,
  computeStats,
  getFirstSchoolYearLessonDate,
  mergeAttendanceAndTopics,
} from '@/services/timetableMapper';
import { addDays, getInitialSchoolDate, getMonday, toISODate } from '@/utils/dates';

interface LibrusContextType {
  student: StudentInfo | null;
  grades: SubjectGrades[];
  timetable: DaySchedule[];
  weeks: Record<string, WeekSchedule>;
  attendanceStats: AttendanceStats | null;
  attendanceMarks: AttendanceMark[];
  realizations: LessonRealization[];
  inboxMessages: LibrusMessageSummary[];
  sentMessages: LibrusMessageSummary[];
  unreadMessagesCount: number;
  hasLowSubjectAttendance: boolean;
  subjectAttendanceAlert: 'danger' | 'warning' | null;
  loadWeek: (weekStartIso: string, forceNetwork?: boolean) => Promise<WeekSchedule | null>;
  loadMessages: (folder: MessageFolder) => Promise<LibrusMessageSummary[]>;
  markMessageAsReadLocal: (messageId: string) => void;
  clearLocalCacheAndRefresh: () => Promise<void>;
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
  const [attendanceMarks, setAttendanceMarks] = useState<AttendanceMark[]>([]);
  const [realizations, setRealizations] = useState<LessonRealization[]>([]);
  const [inboxMessages, setInboxMessages] = useState<LibrusMessageSummary[]>([]);
  const [sentMessages, setSentMessages] = useState<LibrusMessageSummary[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const appState = useRef<AppStateStatus>(AppState.currentState);
  const marksRef = useRef<AttendanceMark[]>([]);
  const realizationsRef = useRef<LessonRealization[]>([]);
  const isSyncingRef = useRef<boolean>(false);

  const unreadMessagesCount = useMemo(
    () => inboxMessages.filter((m) => m.isUnread).length,
    [inboxMessages]
  );

  const detailedYearAttendance = useMemo(() => {
    if (attendanceMarks.length === 0 && Object.keys(weeks).length === 0) {
      return null;
    }
    return computeDetailedAttendance(
      attendanceMarks,
      realizations,
      weeks,
      'year',
      null,
      attendanceStats
    );
  }, [attendanceMarks, realizations, weeks, attendanceStats]);

  const effectiveAttendanceStats = useMemo<AttendanceStats | null>(() => {
    if (detailedYearAttendance && detailedYearAttendance.overall.total > 0) {
      return detailedYearAttendance.overall;
    }
    return attendanceStats;
  }, [detailedYearAttendance, attendanceStats]);

  useEffect(() => {
    if (effectiveAttendanceStats && isValidAttendanceStats(effectiveAttendanceStats)) {
      saveCachedAttendanceStats(effectiveAttendanceStats);
    }
  }, [effectiveAttendanceStats]);

  const subjectAttendanceAlert = useMemo<'danger' | 'warning' | null>(() => {
    const low = detailedYearAttendance?.lowAttendanceSubjects ?? [];
    if (low.some((s) => s.status === 'danger')) return 'danger';
    if (low.some((s) => s.status === 'warning')) return 'warning';
    return null;
  }, [detailedYearAttendance]);

  const hasLowSubjectAttendance = subjectAttendanceAlert !== null;

  const loadWeek = useCallback(
    async (weekStartIso: string, forceNetwork: boolean = false): Promise<WeekSchedule | null> => {
      const cached = librusClient.getCachedWeekSchedule(weekStartIso);
      if (cached && weekHasLessons(cached)) {
        const mergedCached = mergeAttendanceAndTopics(
          cached,
          marksRef.current,
          realizationsRef.current
        );
        setWeeks((prev) => {
          const current = prev[weekStartIso];
          if (
            current &&
            current.fetchedAt === mergedCached.fetchedAt &&
            current.days.length === mergedCached.days.length
          ) {
            return prev;
          }
          return { ...prev, [weekStartIso]: mergedCached };
        });
        if (!forceNetwork && Date.now() - cached.fetchedAt < 5 * 60 * 1000) {
          return mergedCached;
        }
      }

      const fresh = await librusClient.getWeek(weekStartIso);
      if (fresh && weekHasLessons(fresh)) {
        const mergedFresh = mergeAttendanceAndTopics(
          fresh,
          marksRef.current,
          realizationsRef.current
        );
        saveCachedWeek(mergedFresh);
        setWeeks((prev) => ({ ...prev, [weekStartIso]: mergedFresh }));

        setAttendanceStats((prevStats) => {
          const allWk = { ...getAllCachedWeeks(), [weekStartIso]: mergedFresh };
          const recomputed = computeDetailedAttendance(
            marksRef.current,
            realizationsRef.current,
            allWk,
            'year',
            null,
            prevStats
          ).overall;
          if (isValidAttendanceStats(recomputed)) {
            saveCachedAttendanceStats(recomputed);
            return recomputed;
          }
          return prevStats;
        });

        return mergedFresh;
      }

      return cached && weekHasLessons(cached) ? cached : null;
    },
    []
  );

  const loadMessages = useCallback(async (folder: MessageFolder): Promise<LibrusMessageSummary[]> => {
    const cached = getCachedMessages(folder);
    if (cached && cached.length > 0) {
      if (folder === 'inbox') setInboxMessages(cached);
      else setSentMessages(cached);
    }

    const fresh = await librusClient.getMessages(folder);
    if (fresh) {
      if (folder === 'inbox') {
        setInboxMessages(fresh);
        recordSeenInboxMessages(fresh);
      } else {
        setSentMessages(fresh);
      }
      return fresh;
    }
    return cached ?? [];
  }, []);

  const markMessageAsReadLocal = useCallback((messageId: string) => {
    setInboxMessages((prev) => {
      const updated = prev.map((m) => (m.id === messageId ? { ...m, isUnread: false } : m));
      saveCachedMessages('inbox', updated);
      return updated;
    });
  }, []);

  const loadAllData = async (forceSpinner: boolean = false) => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;

    if (forceSpinner) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    try {
      // Check automatic school-year rollover (wipes prior year's cached data on Sep 1)
      const rolledOver = ensureSchoolYearCacheValid();
      if (rolledOver) {
        await librusClient.clearGradesCache();
      }

      const hasSession = await librusClient.checkSavedSession();
      setIsAuthenticated(hasSession);

      if (!hasSession) {
        setStudent(null);
        setGrades([]);
        setTimetable([]);
        setWeeks({});
        setAttendanceStats(null);
        setAttendanceMarks([]);
        setRealizations([]);
        setInboxMessages([]);
        setSentMessages([]);
        marksRef.current = [];
        realizationsRef.current = [];
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
      const cachedInbox = getCachedMessages('inbox') ?? [];
      const cachedSent = getCachedMessages('sent') ?? [];

      if (cachedMarks.length > 0) {
        marksRef.current = cachedMarks;
        setAttendanceMarks(cachedMarks);
      }
      if (cachedReal.length > 0) {
        realizationsRef.current = cachedReal;
        setRealizations(cachedReal);
      }
      if (cachedInbox.length > 0) setInboxMessages(cachedInbox);
      if (cachedSent.length > 0) setSentMessages(cachedSent);

      if (cachedStu) setStudent(cachedStu);
      if (cachedGrd && cachedGrd.length > 0) setGrades(cachedGrd);
      if (Object.keys(cachedWeeks).length > 0) {
        setWeeks((prev) => ({ ...prev, ...cachedWeeks }));
        const initWeek = cachedWeeks[initialWeekStart] ?? Object.values(cachedWeeks)[0];
        if (initWeek && weekHasLessons(initWeek)) {
          setTimetable(initWeek.days);
        }
      }
      if (cachedStats && isValidAttendanceStats(cachedStats)) {
        setAttendanceStats(cachedStats);
      }

      // If we had cache, we can turn off the blocking spinner immediately
      if (
        cachedStu ||
        (cachedGrd && cachedGrd.length > 0) ||
        Object.keys(cachedWeeks).length > 0
      ) {
        setIsLoading(false);
      }

      // 2. Fetch fresh live data from Synergia in parallel
      const [stu, grd, attData, freshWeek, currentCalendarWeek, freshInbox, freshSent] =
        await Promise.all([
          librusClient.getStudentInfo(),
          librusClient.getGrades(),
          librusClient.getAttendanceAndRealizations(),
          librusClient.getWeek(initialWeekStart),
          currentWeekStart !== initialWeekStart
            ? librusClient.getWeek(currentWeekStart)
            : Promise.resolve(null),
          librusClient.getMessages('inbox'),
          librusClient.getMessages('sent'),
        ]);

      if (stu) setStudent(stu);
      if (grd && grd.length > 0) setGrades(grd);
      if (freshInbox) {
        setInboxMessages(freshInbox);
        recordSeenInboxMessages(freshInbox);
      }
      if (freshSent) setSentMessages(freshSent);

      if (attData) {
        if (attData.marks.length > 0) {
          marksRef.current = attData.marks;
          setAttendanceMarks(attData.marks);
        }
        if (attData.realizations.length > 0) {
          realizationsRef.current = attData.realizations;
          setRealizations(attData.realizations);
        }
      }

      const newWeeksMap: Record<string, WeekSchedule> = { ...getAllCachedWeeks() };

      if (currentCalendarWeek && weekHasLessons(currentCalendarWeek)) {
        const mergedCurrentWeek = mergeAttendanceAndTopics(
          currentCalendarWeek,
          marksRef.current,
          realizationsRef.current
        );
        saveCachedWeek(mergedCurrentWeek);
        newWeeksMap[currentWeekStart] = mergedCurrentWeek;
      }

      if (freshWeek && weekHasLessons(freshWeek)) {
        const mergedWeek = mergeAttendanceAndTopics(
          freshWeek,
          marksRef.current,
          realizationsRef.current
        );
        saveCachedWeek(mergedWeek);
        newWeeksMap[initialWeekStart] = mergedWeek;
        setTimetable(mergedWeek.days);
      } else {
        const fallbackWeek =
          (newWeeksMap[initialWeekStart] && weekHasLessons(newWeeksMap[initialWeekStart]))
            ? newWeeksMap[initialWeekStart]
            : Object.values(newWeeksMap).find((w) => weekHasLessons(w));
        if (fallbackWeek && weekHasLessons(fallbackWeek)) {
          setTimetable(fallbackWeek.days);
        }
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
          if (isValidAttendanceStats(finalStats)) {
            saveCachedAttendanceStats(finalStats);
          }
        }
        if (isValidAttendanceStats(finalStats)) {
          setAttendanceStats(finalStats);
        }
      }

      // 3. Background-synchronize all past school-year timetable weeks from September 1st
      // so per-subject attendance counts have every historical week cached on disk
      const schoolYearMondays: string[] = [];
      let mondayCursor = getMonday(getFirstSchoolYearLessonDate(new Date()));
      while (toISODate(mondayCursor) <= currentWeekStart) {
        schoolYearMondays.push(toISODate(mondayCursor));
        mondayCursor = addDays(mondayCursor, 7);
      }

      void librusClient.syncWeeksBatch(schoolYearMondays, (syncedWeek) => {
        const mergedHistorical = mergeAttendanceAndTopics(
          syncedWeek,
          marksRef.current,
          realizationsRef.current
        );
        saveCachedWeek(mergedHistorical);
        setWeeks((prev) => ({
          ...prev,
          [mergedHistorical.weekStart]: mergedHistorical,
        }));
      });
    } catch (err) {
      console.error('Failed to load Librus data', err);
    } finally {
      isSyncingRef.current = false;
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const clearLocalCacheAndRefresh = async () => {
    clearDataCachesOnly();
    await librusClient.clearGradesCache();
    marksRef.current = [];
    realizationsRef.current = [];
    setGrades([]);
    setTimetable([]);
    setWeeks({});
    setAttendanceStats(null);
    setAttendanceMarks([]);
    setRealizations([]);
    setInboxMessages([]);
    setSentMessages([]);
    isSyncingRef.current = false;
    await loadAllData(true);
  };

  useEffect(() => {
    Promise.resolve().then(() => {
      loadAllData(true);
    });

    // Auto-resync when returning from background
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
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
    setAttendanceMarks([]);
    setRealizations([]);
    setInboxMessages([]);
    setSentMessages([]);
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
        attendanceStats: effectiveAttendanceStats,
        attendanceMarks,
        realizations,
        inboxMessages,
        sentMessages,
        unreadMessagesCount,
        hasLowSubjectAttendance,
        subjectAttendanceAlert,
        loadWeek,
        loadMessages,
        markMessageAsReadLocal,
        clearLocalCacheAndRefresh,
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

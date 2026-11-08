import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import {
  ActivityFeedItem,
  AttendanceMark,
  AttendanceStats,
  DaySchedule,
  HiddenTerminarzRule,
  HiddenTerminarzStore,
  LessonRealization,
  LibrusMessageSummary,
  MessageFolder,
  SchoolAnnouncement,
  StudentInfo,
  SubjectGrades,
  TerminarzEvent,
  WeekSchedule,
} from '@/types/librus';
import { AuthInvalidState, librusClient } from '@/services/librusClient';
import {
  applyAnnouncementReadState,
  applyInboxReadState,
  clearDataCachesOnly,
  ensureSchoolYearCacheValid,
  formatYearMonthKey,
  getActivityFeedStore,
  getAllCachedTerminarzEvents,
  getAllCachedWeeks,
  getCachedAnnouncements,
  getCachedAttendanceMarks,
  getCachedMessages,
  getCachedRealizations,
  getCachedTerminarzMonth,
  getHiddenTerminarzStore,
  isValidAttendanceStats,
  markAnnouncementIdsRead,
  markInboxMessageIdsRead,
  recordSeenInboxMessages,
  saveCachedAttendanceStats,
  saveCachedMessages,
  saveCachedWeek,
  saveHiddenTerminarzStore,
  weekHasLessons,
} from '@/services/fileCache';
import { reconcileActivityFeed } from '@/services/activityFeed';
import {
  computeDetailedAttendance,
  computeStats,
  getFirstSchoolYearLessonDate,
  mergeAttendanceAndTopics,
} from '@/services/timetableMapper';
import {
  attachTerminarzToWeek,
  buildTerminarzRuleId,
  filterVisibleTerminarzEvents,
} from '@/utils/terminarzMatcher';
import { addDays, getInitialSchoolDate, getMonday, parseISODate, toISODate } from '@/utils/dates';

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
  announcements: SchoolAnnouncement[];
  terminarzEvents: TerminarzEvent[];
  hiddenTerminarzStore: HiddenTerminarzStore;
  activityFeed: ActivityFeedItem[];
  unreadMessagesCount: number;
  unreadAnnouncementsCount: number;
  hasLowSubjectAttendance: boolean;
  subjectAttendanceAlert: 'danger' | 'warning' | null;
  loadWeek: (weekStartIso: string, forceNetwork?: boolean) => Promise<WeekSchedule | null>;
  loadMessages: (folder: MessageFolder) => Promise<LibrusMessageSummary[]>;
  loadAnnouncements: () => Promise<SchoolAnnouncement[]>;
  markMessageAsReadLocal: (messageId: string) => void;
  markAllMessagesReadLocal: () => void;
  markAnnouncementAsReadLocal: (announcementId: string) => void;
  markAllAnnouncementsReadLocal: () => void;
  hideTerminarzSingleEvent: (event: TerminarzEvent) => void;
  hideTerminarzRule: (event: TerminarzEvent) => void;
  restoreHiddenTerminarzEvent: (eventId: string) => void;
  restoreHiddenTerminarzRule: (ruleId: string) => void;
  clearAllHiddenTerminarz: () => void;
  clearLocalCacheAndRefresh: () => Promise<void>;
  authInvalidState: AuthInvalidState | null;
  savedLogin: string | null;
  credentialsModalVisible: boolean;
  openCredentialsModal: () => void;
  dismissCredentialsModal: () => void;
  updateCredentials: (
    login: string,
    pass: string
  ) => Promise<{ success: boolean; error?: string }>;
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
  const [announcements, setAnnouncements] = useState<SchoolAnnouncement[]>([]);
  const [terminarzEvents, setTerminarzEvents] = useState<TerminarzEvent[]>([]);
  const [hiddenTerminarzStore, setHiddenTerminarzStore] = useState<HiddenTerminarzStore>(() =>
    getHiddenTerminarzStore()
  );
  const [activityFeed, setActivityFeed] = useState<ActivityFeedItem[]>([]);
  const [authInvalidState, setAuthInvalidState] = useState<AuthInvalidState | null>(() =>
    librusClient.getAuthInvalidState()
  );
  const [savedLogin, setSavedLogin] = useState<string | null>(() =>
    librusClient.getSavedLoginSync()
  );
  const [credentialsModalVisible, setCredentialsModalVisible] = useState<boolean>(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const appState = useRef<AppStateStatus>(AppState.currentState);
  const marksRef = useRef<AttendanceMark[]>([]);
  const realizationsRef = useRef<LessonRealization[]>([]);
  const terminarzRef = useRef<TerminarzEvent[]>([]);
  const hiddenTerminarzRef = useRef<HiddenTerminarzStore>(hiddenTerminarzStore);
  const fetchedTerminarzMonthsRef = useRef<Map<string, number>>(new Map());
  const isSyncingRef = useRef<boolean>(false);
  const lastAutoOpenedDetectedAtRef = useRef<number>(0);

  useEffect(() => {
    const applyInvalidState = (next: AuthInvalidState | null) => {
      setAuthInvalidState(next);
      if (next?.login) {
        setSavedLogin(next.login);
      }
      if (next && next.detectedAt !== lastAutoOpenedDetectedAtRef.current) {
        lastAutoOpenedDetectedAtRef.current = next.detectedAt;
        setCredentialsModalVisible(true);
      } else if (!next) {
        lastAutoOpenedDetectedAtRef.current = 0;
      }
    };

    applyInvalidState(librusClient.getAuthInvalidState());
    return librusClient.onAuthInvalidChange(applyInvalidState);
  }, []);

  const openCredentialsModal = useCallback(() => {
    void librusClient.getSavedLogin().then((foundLogin) => {
      if (foundLogin) {
        setSavedLogin(foundLogin);
      }
    });
    setCredentialsModalVisible(true);
  }, []);

  const dismissCredentialsModal = useCallback(() => {
    setCredentialsModalVisible(false);
  }, []);

  const visibleTerminarzEvents = useMemo(
    () => filterVisibleTerminarzEvents(terminarzEvents, hiddenTerminarzStore),
    [terminarzEvents, hiddenTerminarzStore]
  );

  const unreadMessagesCount = useMemo(
    () => inboxMessages.filter((m) => m.isUnread).length,
    [inboxMessages]
  );

  const unreadAnnouncementsCount = useMemo(
    () => announcements.filter((a) => a.isUnread).length,
    [announcements]
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

  const replaceMonthTerminarzEvents = useCallback(
    (ymKey: string, incoming: TerminarzEvent[]) => {
      const filtered = terminarzRef.current.filter((ev) => ev.date.slice(0, 7) !== ymKey);
      const next = [...filtered, ...incoming];
      terminarzRef.current = next;
      setTerminarzEvents(next);
      return next;
    },
    []
  );

  const getWeekMonthPairs = useCallback((weekStartIso: string): { year: number; month: number; ymKey: string }[] => {
    const mon = parseISODate(weekStartIso);
    const fri = addDays(mon, 4);
    const candidates = [mon, fri];
    const seen = new Set<string>();
    const pairs: { year: number; month: number; ymKey: string }[] = [];
    for (const d of candidates) {
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const ymKey = formatYearMonthKey(year, month);
      if (!seen.has(ymKey)) {
        seen.add(ymKey);
        pairs.push({ year, month, ymKey });
      }
    }
    return pairs;
  }, []);

  const ensureTerminarzForWeek = useCallback(
    async (weekStartIso: string, forceNetwork: boolean = false): Promise<TerminarzEvent[]> => {
      const pairs = getWeekMonthPairs(weekStartIso);

      // Hydrate from disk cache first if not yet in memory
      for (const { ymKey } of pairs) {
        const hasMonthInMem = terminarzRef.current.some((ev) => ev.date.slice(0, 7) === ymKey);
        if (!hasMonthInMem) {
          const cachedMonth = getCachedTerminarzMonth(ymKey);
          if (cachedMonth && cachedMonth.length > 0) {
            replaceMonthTerminarzEvents(ymKey, cachedMonth);
          }
        }
      }

      const toFetch = pairs.filter(({ ymKey }) => {
        if (forceNetwork) return true;
        const lastFetched = fetchedTerminarzMonthsRef.current.get(ymKey) ?? 0;
        return Date.now() - lastFetched > 5 * 60 * 1000;
      });

      if (toFetch.length > 0) {
        const fetchedResults = await Promise.all(
          toFetch.map(async ({ year, month, ymKey }) => {
            const list = await librusClient.getTerminarzMonth(year, month);
            fetchedTerminarzMonthsRef.current.set(ymKey, Date.now());
            return { ymKey, list };
          })
        );
        for (const { ymKey, list } of fetchedResults) {
          replaceMonthTerminarzEvents(ymKey, list);
        }
      }

      return terminarzRef.current;
    },
    [getWeekMonthPairs, replaceMonthTerminarzEvents]
  );

  const loadWeek = useCallback(
    async (weekStartIso: string, forceNetwork: boolean = false): Promise<WeekSchedule | null> => {
      // Pre-hydrate any cached Terminarz months for this week from disk first
      for (const { ymKey } of getWeekMonthPairs(weekStartIso)) {
        const hasMonthInMem = terminarzRef.current.some(
          (ev) => ev.date.slice(0, 7) === ymKey
        );
        if (!hasMonthInMem) {
          const cachedMonth = getCachedTerminarzMonth(ymKey);
          if (cachedMonth && cachedMonth.length > 0) {
            replaceMonthTerminarzEvents(ymKey, cachedMonth);
          }
        }
      }

      const cached = librusClient.getCachedWeekSchedule(weekStartIso);
      if (cached && weekHasLessons(cached)) {
        const mergedCached = attachTerminarzToWeek(
          mergeAttendanceAndTopics(cached, marksRef.current, realizationsRef.current),
          filterVisibleTerminarzEvents(terminarzRef.current, hiddenTerminarzRef.current)
        );
        setWeeks((prev) => ({ ...prev, [weekStartIso]: mergedCached }));

        const hasFreeDayMissingReason = mergedCached.days.some(
          (d) =>
            d.isFreeDay &&
            !terminarzRef.current.some(
              (ev) => ev.date === d.date && ev.category === 'free_day'
            )
        );

        if (!forceNetwork && Date.now() - cached.fetchedAt < 5 * 60 * 1000) {
          const updatedEvents = await ensureTerminarzForWeek(
            weekStartIso,
            hasFreeDayMissingReason
          );
          const withTerminarz = attachTerminarzToWeek(
            mergedCached,
            filterVisibleTerminarzEvents(updatedEvents, hiddenTerminarzRef.current)
          );
          setWeeks((prev) => ({ ...prev, [weekStartIso]: withTerminarz }));
          return withTerminarz;
        }
      }

      const [fresh, updatedEvents] = await Promise.all([
        librusClient.getWeek(weekStartIso),
        ensureTerminarzForWeek(weekStartIso, true),
      ]);
      const visibleUpdated = filterVisibleTerminarzEvents(
        updatedEvents,
        hiddenTerminarzRef.current
      );

      if (fresh && weekHasLessons(fresh)) {
        const mergedBase = mergeAttendanceAndTopics(
          fresh,
          marksRef.current,
          realizationsRef.current
        );
        const mergedFresh = attachTerminarzToWeek(mergedBase, visibleUpdated);
        saveCachedWeek(mergedBase);
        setWeeks((prev) => {
          const nextWeeks = { ...prev, [weekStartIso]: mergedFresh };
          const updatedFeed = reconcileActivityFeed({
            weeks: nextWeeks,
            terminarzEvents: visibleUpdated,
          });
          setActivityFeed(updatedFeed);
          return nextWeeks;
        });

        setAttendanceStats((prevStats) => {
          const allWk = { ...getAllCachedWeeks(), [weekStartIso]: mergedBase };
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

      if (cached && weekHasLessons(cached)) {
        const fallbackMerged = attachTerminarzToWeek(
          mergeAttendanceAndTopics(cached, marksRef.current, realizationsRef.current),
          visibleUpdated
        );
        setWeeks((prev) => ({ ...prev, [weekStartIso]: fallbackMerged }));
        return fallbackMerged;
      }

      return null;
    },
    [ensureTerminarzForWeek, getWeekMonthPairs, replaceMonthTerminarzEvents]
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
        const hydrated = applyInboxReadState(fresh);
        setInboxMessages(hydrated);
        recordSeenInboxMessages(hydrated);
        setActivityFeed(reconcileActivityFeed({ inboxMessages: hydrated }));
        return hydrated;
      } else {
        setSentMessages(fresh);
      }
      return fresh;
    }
    return cached ?? [];
  }, []);

  const loadAnnouncements = useCallback(async (): Promise<SchoolAnnouncement[]> => {
    const todayIso = toISODate(new Date());
    const cached = getCachedAnnouncements();
    if (cached.length > 0) {
      setAnnouncements(applyAnnouncementReadState(cached, todayIso));
    }

    const fresh = await librusClient.getAnnouncements();
    const hydrated = applyAnnouncementReadState(fresh, todayIso);
    setAnnouncements(hydrated);
    setActivityFeed(reconcileActivityFeed({ announcements: hydrated }));
    return hydrated;
  }, []);

  const markMessageAsReadLocal = useCallback((messageId: string) => {
    markInboxMessageIdsRead([messageId]);
    setInboxMessages((prev) => {
      const updated = prev.map((m) => (m.id === messageId ? { ...m, isUnread: false } : m));
      saveCachedMessages('inbox', updated);
      return updated;
    });
  }, []);

  const markAllMessagesReadLocal = useCallback(() => {
    setInboxMessages((prev) => {
      markInboxMessageIdsRead(prev.map((m) => m.id));
      const updated = prev.map((m) => ({ ...m, isUnread: false }));
      saveCachedMessages('inbox', updated);
      return updated;
    });
  }, []);

  const markAnnouncementAsReadLocal = useCallback((announcementId: string) => {
    markAnnouncementIdsRead([announcementId]);
    setAnnouncements((prev) =>
      prev.map((a) => (a.id === announcementId ? { ...a, isUnread: false } : a))
    );
  }, []);

  const markAllAnnouncementsReadLocal = useCallback(() => {
    setAnnouncements((prev) => {
      markAnnouncementIdsRead(prev.map((a) => a.id));
      return prev.map((a) => ({ ...a, isUnread: false }));
    });
  }, []);

  const applyNewHiddenStore = useCallback((nextStore: HiddenTerminarzStore) => {
    saveHiddenTerminarzStore(nextStore);
    hiddenTerminarzRef.current = nextStore;
    setHiddenTerminarzStore(nextStore);

    const visibleNow = filterVisibleTerminarzEvents(terminarzRef.current, nextStore);
    setWeeks((prevWeeks) => {
      const updated: Record<string, WeekSchedule> = {};
      for (const [ws, wk] of Object.entries(prevWeeks)) {
        updated[ws] = attachTerminarzToWeek(wk, visibleNow);
      }
      return updated;
    });
    setTimetable((prevDays) => {
      if (!prevDays || prevDays.length === 0) return prevDays;
      const tempWeek: WeekSchedule = {
        weekStart: prevDays[0]?.date || '',
        days: prevDays,
        fetchedAt: Date.now(),
      };
      return attachTerminarzToWeek(tempWeek, visibleNow).days;
    });
  }, []);

  const hideTerminarzSingleEvent = useCallback(
    (event: TerminarzEvent) => {
      const curr = hiddenTerminarzRef.current;
      if (curr.hiddenEventIds.includes(event.id)) return;
      const nextStore: HiddenTerminarzStore = {
        ...curr,
        hiddenEventIds: [event.id, ...curr.hiddenEventIds],
        hiddenEventsMeta: [
          {
            id: event.id,
            date: event.date,
            displayType: event.displayType,
            teacher: event.teacher,
            subject: event.subject,
          },
          ...curr.hiddenEventsMeta.filter((m) => m.id !== event.id),
        ],
      };
      applyNewHiddenStore(nextStore);
    },
    [applyNewHiddenStore]
  );

  const hideTerminarzRule = useCallback(
    (event: TerminarzEvent) => {
      const curr = hiddenTerminarzRef.current;
      const ruleId = buildTerminarzRuleId(event);
      if (curr.rules.some((r) => r.id === ruleId)) return;
      const newRule: HiddenTerminarzRule = {
        id: ruleId,
        teacher: event.teacher,
        category: event.category,
        displayType: event.displayType,
        subjectLabel: event.subject,
        createdAt: Date.now(),
      };
      const nextStore: HiddenTerminarzStore = {
        ...curr,
        rules: [newRule, ...curr.rules],
      };
      applyNewHiddenStore(nextStore);
    },
    [applyNewHiddenStore]
  );

  const restoreHiddenTerminarzEvent = useCallback(
    (eventId: string) => {
      const curr = hiddenTerminarzRef.current;
      const nextStore: HiddenTerminarzStore = {
        ...curr,
        hiddenEventIds: curr.hiddenEventIds.filter((id) => id !== eventId),
        hiddenEventsMeta: curr.hiddenEventsMeta.filter((m) => m.id !== eventId),
      };
      applyNewHiddenStore(nextStore);
    },
    [applyNewHiddenStore]
  );

  const restoreHiddenTerminarzRule = useCallback(
    (ruleId: string) => {
      const curr = hiddenTerminarzRef.current;
      const nextStore: HiddenTerminarzStore = {
        ...curr,
        rules: curr.rules.filter((r) => r.id !== ruleId),
      };
      applyNewHiddenStore(nextStore);
    },
    [applyNewHiddenStore]
  );

  const clearAllHiddenTerminarz = useCallback(() => {
    applyNewHiddenStore({
      hiddenEventIds: [],
      hiddenEventsMeta: [],
      rules: [],
    });
  }, [applyNewHiddenStore]);

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
      setSavedLogin(librusClient.getSavedLoginSync());

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
        setAnnouncements([]);
        setTerminarzEvents([]);
        setActivityFeed([]);
        marksRef.current = [];
        realizationsRef.current = [];
        terminarzRef.current = [];
        fetchedTerminarzMonthsRef.current.clear();
        return;
      }

      const now = new Date();
      const todayIso = toISODate(now);
      const initialWeekStart = toISODate(getMonday(getInitialSchoolDate()));
      const currentWeekStart = toISODate(getMonday(now));

      // 1. Immediately display cached data if available (zero blank wait time)
      const cachedStu = librusClient.getCachedStudent();
      const cachedGrd = librusClient.getCachedGrades();
      const cachedWeeks = librusClient.getCachedWeeksMap();
      const cachedStats = librusClient.getCachedAttendanceStatsSync();
      const cachedMarks = getCachedAttendanceMarks() ?? [];
      const cachedReal = getCachedRealizations() ?? [];
      const cachedInbox = getCachedMessages('inbox') ?? [];
      const cachedSent = getCachedMessages('sent') ?? [];
      const cachedAnn = getCachedAnnouncements();
      const cachedTerm = getAllCachedTerminarzEvents();
      const cachedFeedStore = getActivityFeedStore();

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
      if (cachedAnn.length > 0) {
        setAnnouncements(applyAnnouncementReadState(cachedAnn, todayIso));
      }
      if (cachedTerm.length > 0) {
        terminarzRef.current = cachedTerm;
        setTerminarzEvents(cachedTerm);
      }
      if (cachedStu) setStudent(cachedStu);
      if (cachedGrd && cachedGrd.length > 0) setGrades(cachedGrd);
      const visibleCachedTerm = filterVisibleTerminarzEvents(
        cachedTerm,
        hiddenTerminarzRef.current
      );
      const hydratedCachedWeeks: Record<string, WeekSchedule> = {};
      if (Object.keys(cachedWeeks).length > 0) {
        for (const [ws, wk] of Object.entries(cachedWeeks)) {
          hydratedCachedWeeks[ws] = attachTerminarzToWeek(wk, visibleCachedTerm);
        }
        setWeeks((prev) => ({ ...prev, ...hydratedCachedWeeks }));
        const initWeek =
          hydratedCachedWeeks[initialWeekStart] ?? Object.values(hydratedCachedWeeks)[0];
        if (initWeek && weekHasLessons(initWeek)) {
          setTimetable(initWeek.days);
        }
      }
      if (cachedFeedStore.items.length > 0) {
        const cleanedInitialFeed = reconcileActivityFeed({
          grades: cachedGrd ?? [],
          inboxMessages: cachedInbox,
          announcements: cachedAnn,
          attendanceMarks: cachedMarks,
          weeks: hydratedCachedWeeks,
          terminarzEvents: visibleCachedTerm,
          now,
        });
        setActivityFeed(cleanedInitialFeed);
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

      // If stored credentials are already flagged as invalid, keep offline cache intact and skip network calls
      if (librusClient.getAuthInvalidState()) {
        setIsLoading(false);
        return;
      }

      // Collect unique calendar months needed for initialWeekStart, currentWeekStart, and any cached upcoming free days missing Terminarz holiday names
      const monthPairsMap = new Map<string, { year: number; month: number; ymKey: string }>();
      for (const p of [
        ...getWeekMonthPairs(initialWeekStart),
        ...getWeekMonthPairs(currentWeekStart),
      ]) {
        monthPairsMap.set(p.ymKey, p);
      }
      for (const wk of Object.values(cachedWeeks)) {
        if (monthPairsMap.size >= 5) break;
        const hasUpcomingMissingFreeDay = (wk.days ?? []).some(
          (d) =>
            d.date >= todayIso &&
            d.isFreeDay &&
            !cachedTerm.some((ev) => ev.date === d.date && ev.category === 'free_day')
        );
        if (hasUpcomingMissingFreeDay && wk.weekStart) {
          for (const p of getWeekMonthPairs(wk.weekStart)) {
            if (monthPairsMap.size < 5) {
              monthPairsMap.set(p.ymKey, p);
            }
          }
        }
      }
      const neededMonths = Array.from(monthPairsMap.values());

      // 2. Fetch fresh live data from Synergia in parallel
      const [
        stu,
        grd,
        attData,
        freshWeek,
        currentCalendarWeek,
        freshInbox,
        freshSent,
        freshAnn,
        fetchedTerminarzGroups,
      ] = await Promise.all([
        librusClient.getStudentInfo(),
        librusClient.getGrades(),
        librusClient.getAttendanceAndRealizations(),
        librusClient.getWeek(initialWeekStart),
        currentWeekStart !== initialWeekStart
          ? librusClient.getWeek(currentWeekStart)
          : Promise.resolve(null),
        librusClient.getMessages('inbox'),
        librusClient.getMessages('sent'),
        librusClient.getAnnouncements(),
        Promise.all(
          neededMonths.map(async ({ year, month, ymKey }) => {
            const list = await librusClient.getTerminarzMonth(year, month);
            fetchedTerminarzMonthsRef.current.set(ymKey, Date.now());
            return { ymKey, list };
          })
        ),
      ]);

      for (const { ymKey, list } of fetchedTerminarzGroups) {
        replaceMonthTerminarzEvents(ymKey, list);
      }

      if (stu) setStudent(stu);
      if (grd && grd.length > 0) setGrades(grd);
      const hydratedInbox = freshInbox ? applyInboxReadState(freshInbox) : cachedInbox;
      if (freshInbox) {
        setInboxMessages(hydratedInbox);
        recordSeenInboxMessages(hydratedInbox);
      }
      if (freshSent) setSentMessages(freshSent);

      const hydratedAnn = applyAnnouncementReadState(freshAnn ?? cachedAnn, todayIso);
      setAnnouncements(hydratedAnn);

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

      const visibleLiveTerm = filterVisibleTerminarzEvents(
        terminarzRef.current,
        hiddenTerminarzRef.current
      );
      const rawCachedWeeks = getAllCachedWeeks();
      const newWeeksMap: Record<string, WeekSchedule> = {};
      for (const [ws, wk] of Object.entries(rawCachedWeeks)) {
        newWeeksMap[ws] = attachTerminarzToWeek(wk, visibleLiveTerm);
      }

      if (currentCalendarWeek && weekHasLessons(currentCalendarWeek)) {
        const baseCurrentWeek = mergeAttendanceAndTopics(
          currentCalendarWeek,
          marksRef.current,
          realizationsRef.current
        );
        saveCachedWeek(baseCurrentWeek);
        newWeeksMap[currentWeekStart] = attachTerminarzToWeek(baseCurrentWeek, visibleLiveTerm);
      }

      if (freshWeek && weekHasLessons(freshWeek)) {
        const baseFreshWeek = mergeAttendanceAndTopics(
          freshWeek,
          marksRef.current,
          realizationsRef.current
        );
        saveCachedWeek(baseFreshWeek);
        const mergedWeek = attachTerminarzToWeek(baseFreshWeek, visibleLiveTerm);
        newWeeksMap[initialWeekStart] = mergedWeek;
        setTimetable(mergedWeek.days);
      } else {
        const fallbackWeek =
          newWeeksMap[initialWeekStart] && weekHasLessons(newWeeksMap[initialWeekStart])
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

      // Reconcile persistent "Ostatnia aktywność" feed
      const reconciledFeed = reconcileActivityFeed({
        grades: grd && grd.length > 0 ? grd : cachedGrd ?? [],
        inboxMessages: hydratedInbox,
        announcements: hydratedAnn,
        attendanceMarks: marksRef.current,
        weeks: newWeeksMap,
        terminarzEvents: visibleLiveTerm,
        now,
      });
      setActivityFeed(reconciledFeed);

      // 3. Background-synchronize all past school-year timetable weeks from September 1st
      // so per-subject attendance counts have every historical week cached on disk
      const schoolYearMondays: string[] = [];
      let mondayCursor = getMonday(getFirstSchoolYearLessonDate(new Date()));
      while (toISODate(mondayCursor) <= currentWeekStart) {
        schoolYearMondays.push(toISODate(mondayCursor));
        mondayCursor = addDays(mondayCursor, 7);
      }

      void librusClient.syncWeeksBatch(schoolYearMondays, (syncedWeek) => {
        const baseHistorical = mergeAttendanceAndTopics(
          syncedWeek,
          marksRef.current,
          realizationsRef.current
        );
        saveCachedWeek(baseHistorical);
        const mergedHistorical = attachTerminarzToWeek(
          baseHistorical,
          filterVisibleTerminarzEvents(terminarzRef.current, hiddenTerminarzRef.current)
        );
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
    if (librusClient.getAuthInvalidState()) {
      setCredentialsModalVisible(true);
      return;
    }
    clearDataCachesOnly();
    await librusClient.clearGradesCache();
    marksRef.current = [];
    realizationsRef.current = [];
    terminarzRef.current = [];
    fetchedTerminarzMonthsRef.current.clear();
    setGrades([]);
    setTimetable([]);
    setWeeks({});
    setAttendanceStats(null);
    setAttendanceMarks([]);
    setRealizations([]);
    setInboxMessages([]);
    setSentMessages([]);
    setAnnouncements([]);
    setTerminarzEvents([]);
    setActivityFeed([]);
    isSyncingRef.current = false;
    await loadAllData(true);
  };

  const handleManualRefresh = async () => {
    if (librusClient.getAuthInvalidState()) {
      setCredentialsModalVisible(true);
      return;
    }
    await loadAllData(false);
  };

  const updateCredentials = async (userLogin: string, pass: string) => {
    const cleanLogin = userLogin.trim();
    const prevLogin = (savedLogin || librusClient.getSavedLoginSync() || '')
      .trim()
      .toLowerCase();

    const res = await librusClient.login(cleanLogin, pass);
    if (res.success) {
      setSavedLogin(cleanLogin);
      setAuthInvalidState(null);
      setCredentialsModalVisible(false);
      setIsAuthenticated(true);

      // Only wipe local data caches if switching to a completely different Librus account
      if (prevLogin && prevLogin !== cleanLogin.toLowerCase()) {
        clearDataCachesOnly();
        await librusClient.clearGradesCache();
        marksRef.current = [];
        realizationsRef.current = [];
        terminarzRef.current = [];
        fetchedTerminarzMonthsRef.current.clear();
        setGrades([]);
        setTimetable([]);
        setWeeks({});
        setAttendanceStats(null);
        setAttendanceMarks([]);
        setRealizations([]);
        setInboxMessages([]);
        setSentMessages([]);
        setAnnouncements([]);
        setTerminarzEvents([]);
        setActivityFeed([]);
      }

      isSyncingRef.current = false;
      void loadAllData(false);
    }
    return res;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (userLogin: string, pass: string) => {
    setIsLoading(true);
    const cleanLogin = userLogin.trim();
    const res = await librusClient.login(cleanLogin, pass);
    if (res.success) {
      setSavedLogin(cleanLogin);
      setAuthInvalidState(null);
      setCredentialsModalVisible(false);
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
    setAnnouncements([]);
    setTerminarzEvents([]);
    setActivityFeed([]);
    marksRef.current = [];
    realizationsRef.current = [];
    terminarzRef.current = [];
    fetchedTerminarzMonthsRef.current.clear();
    setSavedLogin(null);
    setAuthInvalidState(null);
    setCredentialsModalVisible(false);
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
        announcements,
        terminarzEvents: visibleTerminarzEvents,
        hiddenTerminarzStore,
        activityFeed,
        unreadMessagesCount,
        unreadAnnouncementsCount,
        hasLowSubjectAttendance,
        subjectAttendanceAlert,
        loadWeek,
        loadMessages,
        loadAnnouncements,
        markMessageAsReadLocal,
        markAllMessagesReadLocal,
        markAnnouncementAsReadLocal,
        markAllAnnouncementsReadLocal,
        hideTerminarzSingleEvent,
        hideTerminarzRule,
        restoreHiddenTerminarzEvent,
        restoreHiddenTerminarzRule,
        clearAllHiddenTerminarz,
        clearLocalCacheAndRefresh,
        authInvalidState,
        savedLogin,
        credentialsModalVisible,
        openCredentialsModal,
        dismissCredentialsModal,
        updateCredentials,
        isAuthenticated,
        isLoading,
        isRefreshing,
        refreshData: handleManualRefresh,
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

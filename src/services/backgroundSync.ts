import { AppState, Platform } from 'react-native';
import Constants, { AppOwnership, ExecutionEnvironment } from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import type * as NotificationsType from 'expo-notifications';
import type * as BackgroundFetchType from 'expo-background-fetch';
import type * as TaskManagerType from 'expo-task-manager';
import {
  AttendanceMark,
  Grade,
  LibrusMessageSummary,
  SubjectGrades,
  TimetableLesson,
  WeekSchedule,
} from '@/types/librus';
import { addDays, getMonday, toISODate } from '@/utils/dates';
import {
  getCachedAttendanceMarks,
  getCachedMessages,
  getCachedWeek,
  getNotifiedSyncState,
  saveNotifiedSyncState,
} from './fileCache';
import { librusClient } from './librusClient';

export const BACKGROUND_SYNC_TASK = 'LIGMUS_BACKGROUND_SYNC_TASK';
const SETTINGS_KEY = 'ligmus_sync_settings';
const LAST_REGISTERED_INTERVAL_KEY = 'ligmus_sync_registered_interval';
const GRADES_CACHE_KEY = 'ligmus_grades_cache';

/**
 * Flag determining if the runtime is standard Expo Go (which lacks custom native modules like ExpoTopicSubscriptionModule).
 */
export const isExpoGo: boolean =
  Constants.appOwnership === AppOwnership.Expo ||
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
  Boolean(Constants.expoVersion);

export interface SyncSettings {
  enabled: boolean;
  intervalMinutes: number; // 15, 30, 60, 120
  smartHoursEnabled: boolean; // 7:30 - 18:00 Mon-Fri
}

export const DEFAULT_SYNC_SETTINGS: SyncSettings = {
  enabled: true,
  intervalMinutes: 30,
  smartHoursEnabled: true,
};

export enum BackgroundSyncResult {
  NoData = 1,
  NewData = 2,
  Failed = 3,
}

let isSmartSyncRunning = false;
const handledNotificationIds = new Set<string>();

// Lazy native module loaders to prevent crashes in Expo Go
function getNotifications(): typeof NotificationsType | null {
  if (isExpoGo) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-notifications');
  } catch (err) {
    console.warn('[SmartSync] expo-notifications unavailable in current runtime:', err);
    return null;
  }
}

function getTaskManager(): typeof TaskManagerType | null {
  if (isExpoGo) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-task-manager');
  } catch (err) {
    console.warn('[SmartSync] expo-task-manager unavailable in current runtime:', err);
    return null;
  }
}

function getBackgroundFetch(): typeof BackgroundFetchType | null {
  if (isExpoGo) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-background-fetch');
  } catch (err) {
    console.warn('[SmartSync] expo-background-fetch unavailable in current runtime:', err);
    return null;
  }
}

/**
 * Configure Android notification channels with high priority and sound
 */
export async function setupNotificationChannelAsync(): Promise<void> {
  if (isExpoGo || Platform.OS !== 'android') return;
  try {
    const Notifications = getNotifications();
    if (!Notifications) return;
    await Notifications.setNotificationChannelAsync('librus-grades', {
      name: 'Oceny Librus',
      importance: 7, // AndroidImportance.MAX
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#38bdf8',
      sound: 'default',
      showBadge: true,
    });
    await Notifications.setNotificationChannelAsync('librus-timetable', {
      name: 'Plan lekcji i frekwencja',
      importance: 7, // AndroidImportance.MAX
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#f59e0b',
      sound: 'default',
      showBadge: true,
    });
    await Notifications.setNotificationChannelAsync('librus-messages', {
      name: 'Wiadomości Librus',
      importance: 7, // AndroidImportance.MAX
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#60a5fa',
      sound: 'default',
      showBadge: true,
    });
  } catch (e) {
    console.warn('[SmartSync] Failed to setup notification channel:', e);
  }
}

/**
 * Check if the current time is within school hours (Mon-Fri, 07:30 - 18:00)
 */
export function isWithinSchoolHours(): boolean {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday, 6 = Saturday
  if (day === 0 || day === 6) {
    return false; // Weekend
  }
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= 450 && minutes <= 1080; // 07:30 (450) to 18:00 (1080)
}

/**
 * Load user sync settings from SecureStore
 */
export async function getSyncSettings(): Promise<SyncSettings> {
  try {
    const raw = await SecureStore.getItemAsync(SETTINGS_KEY);
    if (!raw) return DEFAULT_SYNC_SETTINGS;
    return { ...DEFAULT_SYNC_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SYNC_SETTINGS;
  }
}

/**
 * Save user sync settings to SecureStore and update BackgroundFetch registration
 */
export async function saveSyncSettings(settings: SyncSettings): Promise<void> {
  try {
    await SecureStore.setItemAsync(SETTINGS_KEY, JSON.stringify(settings));
    if (settings.enabled) {
      await registerBackgroundSyncAsync(settings.intervalMinutes, true);
    } else {
      await unregisterBackgroundSyncAsync();
    }
  } catch (err) {
    console.error('[SmartSync] Failed to save sync settings:', err);
  }
}

/**
 * Register background fetch task with the specified interval.
 * Avoids unregistering an already-registered task at the same interval unless `forceReplace` is true,
 * preventing Android WorkManager from resetting its periodic timer on every app launch.
 */
export async function registerBackgroundSyncAsync(
  intervalMinutes: number = 30,
  forceReplace: boolean = false
): Promise<boolean> {
  if (isExpoGo) {
    return false;
  }
  try {
    const TaskManager = getTaskManager();
    const BackgroundFetch = getBackgroundFetch();
    if (!TaskManager || !BackgroundFetch) return false;

    const clampedMinutes = Math.max(intervalMinutes, 15);
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
    const prevIntervalRaw = await SecureStore.getItemAsync(LAST_REGISTERED_INTERVAL_KEY);
    const prevInterval = prevIntervalRaw ? Number(prevIntervalRaw) : null;

    if (isRegistered && !forceReplace && prevInterval === clampedMinutes) {
      return true;
    }

    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(BACKGROUND_SYNC_TASK);
    }

    await BackgroundFetch.registerTaskAsync(BACKGROUND_SYNC_TASK, {
      minimumInterval: clampedMinutes * 60,
      stopOnTerminate: false,
      startOnBoot: true,
    });
    await SecureStore.setItemAsync(LAST_REGISTERED_INTERVAL_KEY, String(clampedMinutes));
    return true;
  } catch (error) {
    console.warn('[SmartSync] BackgroundFetch registration warning:', error);
    return false;
  }
}

/**
 * Synchronize OS BackgroundFetch registration with the user's saved SyncSettings on app launch.
 */
export async function syncBackgroundRegistrationWithSettings(): Promise<void> {
  if (isExpoGo) return;
  try {
    await setupNotificationChannelAsync();
    const settings = await getSyncSettings();
    if (!settings.enabled) {
      await unregisterBackgroundSyncAsync();
      return;
    }
    await registerBackgroundSyncAsync(settings.intervalMinutes, false);
  } catch (err) {
    console.warn('[SmartSync] syncBackgroundRegistrationWithSettings warning:', err);
  }
}

/**
 * Unregister background fetch task
 */
export async function unregisterBackgroundSyncAsync(): Promise<void> {
  if (isExpoGo) return;
  try {
    const TaskManager = getTaskManager();
    const BackgroundFetch = getBackgroundFetch();
    if (!TaskManager || !BackgroundFetch) return;

    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(BACKGROUND_SYNC_TASK);
    }
    await SecureStore.deleteItemAsync(LAST_REGISTERED_INTERVAL_KEY);
  } catch {}
}

/**
 * Request notification permissions from the user
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  if (isExpoGo) {
    return false;
  }
  try {
    const Notifications = getNotifications();
    if (!Notifications) return false;

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    return finalStatus === 'granted';
  } catch {
    return false;
  }
}

/**
 * Check if the app was launched from a killed state by tapping a notification.
 */
export async function getInitialNotificationUrlAsync(): Promise<string | null> {
  if (isExpoGo) return null;
  try {
    const Notifications = getNotifications();
    if (!Notifications) return null;

    const response = await Notifications.getLastNotificationResponseAsync();
    if (!response) return null;

    const id = response.notification.request.identifier;
    if (id && handledNotificationIds.has(id)) {
      return null;
    }
    if (id) {
      handledNotificationIds.add(id);
    }

    const url = response.notification.request.content.data?.url;
    if (typeof Notifications.clearLastNotificationResponseAsync === 'function') {
      await Notifications.clearLastNotificationResponseAsync().catch(() => {});
    }
    return typeof url === 'string' && url ? url : null;
  } catch {
    return null;
  }
}

/**
 * Add listener for when a user clicks on a notification while app is in memory
 */
export function addNotificationResponseListener(
  callback: (url: string) => void
): (() => void) | null {
  if (isExpoGo) return null;
  try {
    const Notifications = getNotifications();
    if (!Notifications) return null;

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const id = response.notification.request.identifier;
      if (id) {
        handledNotificationIds.add(id);
      }
      const url = response.notification.request.content.data?.url;
      if (url && typeof url === 'string') {
        callback(url);
      }
    });

    return () => {
      try {
        subscription.remove();
      } catch {}
    };
  } catch (e) {
    console.warn('[SmartSync] addNotificationResponseListener warning:', e);
    return null;
  }
}

/**
 * Core background synchronization function (messages + grades + timetable changes + attendance)
 */
export async function executeSmartSync(): Promise<number> {
  if (isExpoGo || isSmartSyncRunning) {
    return BackgroundSyncResult.NoData;
  }

  isSmartSyncRunning = true;
  try {
    const settings = await getSyncSettings();
    if (!settings.enabled) {
      return BackgroundSyncResult.NoData;
    }

    if (settings.smartHoursEnabled && !isWithinSchoolHours()) {
      return BackgroundSyncResult.NoData;
    }

    const hasSession = await librusClient.checkSavedSession();
    if (!hasSession) {
      return BackgroundSyncResult.NoData;
    }

    const Notifications = getNotifications();
    const shouldNotifyUser = Boolean(Notifications) && AppState.currentState !== 'active';
    if (shouldNotifyUser) {
      await setupNotificationChannelAsync();
    }

    // Snapshot existing caches and persistent deduplication state BEFORE scraping live pages
    const syncState = getNotifiedSyncState();
    const notifiedMessageSet = new Set<string>(syncState.notifiedMessageIds);
    const notifiedGradeSet = new Set<string>(syncState.notifiedGradeIds);
    const notifiedAttendanceSet = new Set<string>(syncState.notifiedAttendanceIds);
    const notifiedTimetableSet = new Set<string>(syncState.notifiedTimetableKeys);

    const oldInbox: LibrusMessageSummary[] = getCachedMessages('inbox') ?? [];

    let cachedGrades: SubjectGrades[] = [];
    const cachedRaw = await SecureStore.getItemAsync(GRADES_CACHE_KEY);
    if (cachedRaw) {
      try {
        cachedGrades = JSON.parse(cachedRaw);
      } catch {}
    }
    const existingGradeIds = new Set<string>();
    for (const sub of cachedGrades) {
      for (const g of sub.grades) {
        existingGradeIds.add(g.id);
      }
    }

    const oldMarks: AttendanceMark[] = getCachedAttendanceMarks() ?? [];
    const oldMarkIds = new Set<string>(oldMarks.map((m) => m.id));

    const now = new Date();
    const todayIso = toISODate(now);
    const tomorrowIso = toISODate(addDays(now, 1));
    const todayWeekStart = toISODate(getMonday(now));
    const tomorrowWeekStart = toISODate(getMonday(addDays(now, 1)));

    const oldTodayWeek: WeekSchedule | null = getCachedWeek(todayWeekStart);
    const oldTomorrowWeek: WeekSchedule | null =
      tomorrowWeekStart === todayWeekStart ? oldTodayWeek : getCachedWeek(tomorrowWeekStart);

    const oldLessonsById = new Map<string, TimetableLesson>();
    const collectOldLessons = (wk: WeekSchedule | null, dateIso: string) => {
      const day = wk?.days.find((d) => d.date === dateIso);
      if (!day) return;
      for (const l of day.lessons) {
        oldLessonsById.set(`${dateIso}:${l.id}`, l);
      }
    };
    collectOldLessons(oldTodayWeek, todayIso);
    collectOldLessons(oldTomorrowWeek, tomorrowIso);

    let foundNewData = false;

    // --- 1. MESSAGES DIFF (Top priority + warms/refreshes Librus session once before parallel calls) ---
    try {
      if (!syncState.seededMessages && oldInbox.length > 0) {
        for (const m of oldInbox) {
          notifiedMessageSet.add(m.id);
          const numId = Number(m.id);
          if (Number.isFinite(numId) && numId > syncState.maxSeenMessageId) {
            syncState.maxSeenMessageId = numId;
          }
        }
        syncState.seededMessages = true;
      }

      const freshInbox = await librusClient.getMessages('inbox');
      if (freshInbox && freshInbox.length > 0) {
        if (!syncState.seededMessages) {
          // Very first run with empty cache: seed silently without spamming old unread messages
          for (const m of freshInbox) {
            notifiedMessageSet.add(m.id);
            const numId = Number(m.id);
            if (Number.isFinite(numId) && numId > syncState.maxSeenMessageId) {
              syncState.maxSeenMessageId = numId;
            }
          }
          syncState.seededMessages = true;
        } else {
          const prevMaxId = syncState.maxSeenMessageId;
          const newUnread = freshInbox.filter((m) => {
            if (!m.isUnread || !m.id || notifiedMessageSet.has(m.id)) {
              return false;
            }
            const numId = Number(m.id);
            // Guard against older unread messages shifting onto Page 1 when messages are deleted
            if (Number.isFinite(numId) && prevMaxId > 0 && numId <= prevMaxId) {
              return false;
            }
            return true;
          });

          for (const m of freshInbox) {
            notifiedMessageSet.add(m.id);
            const numId = Number(m.id);
            if (Number.isFinite(numId) && numId > syncState.maxSeenMessageId) {
              syncState.maxSeenMessageId = numId;
            }
          }

          if (newUnread.length > 0) {
            foundNewData = true;
            if (shouldNotifyUser && Notifications) {
              if (newUnread.length <= 2) {
                for (const msg of newUnread) {
                  await Notifications.scheduleNotificationAsync({
                    content: {
                      title: `Nowa wiadomość: ${msg.sender}`,
                      body: msg.subject,
                      data: { url: '/messages' },
                      sound: 'default',
                    },
                    trigger: Platform.OS === 'android' ? { channelId: 'librus-messages' } : null,
                  });
                }
              } else {
                const senders = newUnread
                  .slice(0, 3)
                  .map((m) => m.sender)
                  .join(', ');
                const extra = newUnread.length > 3 ? ` i ${newUnread.length - 3} więcej` : '';
                await Notifications.scheduleNotificationAsync({
                  content: {
                    title: `Nowe wiadomości (${newUnread.length})`,
                    body: `Od: ${senders}${extra}`,
                    data: { url: '/messages' },
                    sound: 'default',
                  },
                  trigger: Platform.OS === 'android' ? { channelId: 'librus-messages' } : null,
                });
              }
            }
          }
        }
      }
    } catch (msgErr) {
      console.warn('[SmartSync] Messages check warning:', msgErr);
    }

    // --- 2. PARALLEL GRADES + LIGHTWEIGHT ATTENDANCE + TIMETABLE DIFF ---
    const [gradesSettled, attSettled, todayWeekSettled, tomorrowWeekSettled] =
      await Promise.allSettled([
        librusClient.getGrades(),
        librusClient.getAttendanceAndRealizations({ includeRealizations: false }),
        librusClient.getWeek(todayWeekStart),
        tomorrowWeekStart === todayWeekStart
          ? Promise.resolve<WeekSchedule | null>(null)
          : librusClient.getWeek(tomorrowWeekStart),
      ]);

    // 2A. Grades diff
    if (gradesSettled.status === 'fulfilled' && gradesSettled.value.length > 0) {
      const freshSubjects = gradesSettled.value;
      if (!syncState.seededGrades && existingGradeIds.size > 0) {
        existingGradeIds.forEach((id) => notifiedGradeSet.add(id));
        syncState.seededGrades = true;
      }

      if (!syncState.seededGrades) {
        for (const sub of freshSubjects) {
          for (const g of sub.grades) {
            notifiedGradeSet.add(g.id);
          }
        }
        syncState.seededGrades = true;
      } else {
        const newGrades: { subjectName: string; grade: Grade }[] = [];
        for (const sub of freshSubjects) {
          for (const g of sub.grades) {
            if (!existingGradeIds.has(g.id) && !notifiedGradeSet.has(g.id)) {
              newGrades.push({ subjectName: sub.subjectName, grade: g });
            }
            notifiedGradeSet.add(g.id);
          }
        }

        if (newGrades.length > 0) {
          foundNewData = true;
          if (shouldNotifyUser && Notifications) {
            if (newGrades.length === 1) {
              const { subjectName, grade } = newGrades[0];
              await Notifications.scheduleNotificationAsync({
                content: {
                  title: `Nowa ocena: ${subjectName} - ${grade.value}`,
                  body: `${grade.category} (waga ${grade.weight})${grade.comment ? ' • ' + grade.comment : ''}`,
                  data: { url: '/grades' },
                  sound: 'default',
                },
                trigger: Platform.OS === 'android' ? { channelId: 'librus-grades' } : null,
              });
            } else {
              const summary = newGrades
                .slice(0, 3)
                .map((n) => `${n.subjectName}: ${n.grade.value}`)
                .join(', ');
              const extra = newGrades.length > 3 ? ` i ${newGrades.length - 3} więcej` : '';

              await Notifications.scheduleNotificationAsync({
                content: {
                  title: `Nowe oceny (${newGrades.length})`,
                  body: `${summary}${extra}`,
                  data: { url: '/grades' },
                  sound: 'default',
                },
                trigger: Platform.OS === 'android' ? { channelId: 'librus-grades' } : null,
              });
            }
          }
        }
      }
    }

    // 2B. Attendance diff
    if (attSettled.status === 'fulfilled' && attSettled.value.marks.length > 0) {
      const freshMarks = attSettled.value.marks;
      if (!syncState.seededAttendance && oldMarkIds.size > 0) {
        oldMarkIds.forEach((id) => notifiedAttendanceSet.add(id));
        syncState.seededAttendance = true;
      }

      if (!syncState.seededAttendance) {
        for (const m of freshMarks) {
          notifiedAttendanceSet.add(m.id);
        }
        syncState.seededAttendance = true;
      } else {
        const newAlertMarks = freshMarks.filter(
          (m) =>
            !oldMarkIds.has(m.id) &&
            !notifiedAttendanceSet.has(m.id) &&
            (m.kind === 'absent' || m.kind === 'late')
        );
        for (const m of freshMarks) {
          notifiedAttendanceSet.add(m.id);
        }

        if (newAlertMarks.length > 0) {
          foundNewData = true;
          if (shouldNotifyUser && Notifications) {
            for (const mark of newAlertMarks.slice(0, 3)) {
              const label = mark.kind === 'late' ? 'Spóźnienie' : 'Nieobecność';
              const subj = mark.subject || 'Zajęcia lekcyjne';
              const lessonLabel = mark.hourNumber ? `${mark.hourNumber}. lekcja` : '';
              await Notifications.scheduleNotificationAsync({
                content: {
                  title: `${label}: ${subj}${lessonLabel ? ` (${lessonLabel})` : ''}`,
                  body: `${mark.name}${mark.date ? ' • ' + mark.date : ''}`,
                  data: { url: '/timetable' },
                  sound: 'default',
                },
                trigger: Platform.OS === 'android' ? { channelId: 'librus-timetable' } : null,
              });
            }
          }
        }
      }
    }

    // 2C. Timetable cancellations & substitutions diff
    const freshTodayWeek = todayWeekSettled.status === 'fulfilled' ? todayWeekSettled.value : null;
    const freshTomorrowWeek =
      tomorrowWeekStart === todayWeekStart
        ? freshTodayWeek
        : tomorrowWeekSettled.status === 'fulfilled'
          ? tomorrowWeekSettled.value
          : null;

    if (oldLessonsById.size > 0) {
      const checkDayDiffs = async (
        wk: WeekSchedule | null,
        dateIso: string,
        dayWord: string
      ) => {
        const day = wk?.days.find((d) => d.date === dateIso);
        if (!day) return;
        for (const lesson of day.lessons) {
          const prev = oldLessonsById.get(`${dateIso}:${lesson.id}`);
          if (!prev) continue;

          if (!prev.isCancelled && lesson.isCancelled) {
            const diffKey = `${dateIso}:${lesson.id}:cancelled`;
            if (notifiedTimetableSet.has(diffKey)) continue;
            notifiedTimetableSet.add(diffKey);
            foundNewData = true;
            if (shouldNotifyUser && Notifications) {
              await Notifications.scheduleNotificationAsync({
                content: {
                  title: `Odwołana lekcja: ${lesson.subject} (${dayWord}, ${lesson.hourNumber}. lekcja)`,
                  body: `${lesson.startTime}–${lesson.endTime}${lesson.teacher ? ' • ' + lesson.teacher : ''}`,
                  data: { url: '/timetable' },
                  sound: 'default',
                },
                trigger: Platform.OS === 'android' ? { channelId: 'librus-timetable' } : null,
              });
            }
          } else if (!prev.isSubstitution && lesson.isSubstitution && !lesson.isCancelled) {
            const diffKey = `${dateIso}:${lesson.id}:sub:${lesson.changeType || 'sub'}`;
            if (notifiedTimetableSet.has(diffKey)) continue;
            notifiedTimetableSet.add(diffKey);
            foundNewData = true;
            if (shouldNotifyUser && Notifications) {
              const kindTitle = lesson.changeType === 'room' ? 'Zmiana sali' : 'Zastępstwo';
              await Notifications.scheduleNotificationAsync({
                content: {
                  title: `${kindTitle}: ${lesson.subject} (${dayWord}, ${lesson.hourNumber}. lekcja)`,
                  body: `${lesson.startTime}–${lesson.endTime}${lesson.classroom ? ' • s. ' + lesson.classroom : ''}${lesson.teacher ? ' • ' + lesson.teacher : ''}`,
                  data: { url: '/timetable' },
                  sound: 'default',
                },
                trigger: Platform.OS === 'android' ? { channelId: 'librus-timetable' } : null,
              });
            }
          }
        }
      };

      await checkDayDiffs(freshTodayWeek, todayIso, 'dziś');
      await checkDayDiffs(freshTomorrowWeek, tomorrowIso, 'jutro');
    }

    saveNotifiedSyncState({
      ...syncState,
      notifiedMessageIds: Array.from(notifiedMessageSet),
      notifiedGradeIds: Array.from(notifiedGradeSet),
      notifiedAttendanceIds: Array.from(notifiedAttendanceSet),
      notifiedTimetableKeys: Array.from(notifiedTimetableSet),
    });

    return foundNewData ? BackgroundSyncResult.NewData : BackgroundSyncResult.NoData;
  } catch (error) {
    console.error('[SmartSync] Error during background smart sync:', error);
    return BackgroundSyncResult.Failed;
  } finally {
    isSmartSyncRunning = false;
  }
}

export const executeGradesSync = executeSmartSync;

/**
 * Initialize foreground notification handler and task definition
 */
export function initBackgroundSync(): void {
  if (isExpoGo) return;
  try {
    const Notifications = getNotifications();
    if (Notifications) {
      Notifications.setNotificationHandler({
        handleNotification: async () => {
          const isForeground = AppState.currentState === 'active';
          return {
            shouldShowAlert: !isForeground,
            shouldPlaySound: !isForeground,
            shouldSetBadge: !isForeground,
            shouldShowBanner: !isForeground,
            shouldShowList: !isForeground,
          };
        },
      });
    }

    const TaskManager = getTaskManager();
    if (TaskManager) {
      TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
        return await executeSmartSync();
      });
    }
  } catch (e) {
    console.warn('[SmartSync] initBackgroundSync warning:', e);
  }
}

// Automatically initialize in custom dev builds / standalone environments
if (!isExpoGo) {
  initBackgroundSync();
}

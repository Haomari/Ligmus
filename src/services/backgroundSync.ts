import { Platform } from 'react-native';
import Constants, { AppOwnership, ExecutionEnvironment } from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import type * as NotificationsType from 'expo-notifications';
import type * as BackgroundFetchType from 'expo-background-fetch';
import type * as TaskManagerType from 'expo-task-manager';
import {
  AttendanceMark,
  Grade,
  SubjectGrades,
  TimetableLesson,
  WeekSchedule,
} from '@/types/librus';
import { addDays, getMonday, toISODate } from '@/utils/dates';
import { getCachedAttendanceMarks, getCachedWeek } from './fileCache';
import { librusClient } from './librusClient';

export const BACKGROUND_SYNC_TASK = 'LIGMUS_BACKGROUND_SYNC_TASK';
const SETTINGS_KEY = 'ligmus_sync_settings';
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

// Lazy native module loaders to prevent crashes in Expo Go
function getNotifications(): typeof NotificationsType | null {
  if (isExpoGo) return null;
  try {
    return require('expo-notifications');
  } catch (err) {
    console.warn('[SmartSync] expo-notifications unavailable in current runtime:', err);
    return null;
  }
}

function getTaskManager(): typeof TaskManagerType | null {
  if (isExpoGo) return null;
  try {
    return require('expo-task-manager');
  } catch (err) {
    console.warn('[SmartSync] expo-task-manager unavailable in current runtime:', err);
    return null;
  }
}

function getBackgroundFetch(): typeof BackgroundFetchType | null {
  if (isExpoGo) return null;
  try {
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
      await registerBackgroundSyncAsync(settings.intervalMinutes);
    } else {
      await unregisterBackgroundSyncAsync();
    }
  } catch (err) {
    console.error('[SmartSync] Failed to save sync settings:', err);
  }
}

/**
 * Register background fetch task with the specified interval
 */
export async function registerBackgroundSyncAsync(intervalMinutes: number = 30): Promise<boolean> {
  if (isExpoGo) {
    return false;
  }
  try {
    const TaskManager = getTaskManager();
    const BackgroundFetch = getBackgroundFetch();
    if (!TaskManager || !BackgroundFetch) return false;

    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(BACKGROUND_SYNC_TASK);
    }

    const intervalSeconds = Math.max(intervalMinutes * 60, 15 * 60); // Android minimum is 15 minutes
    await BackgroundFetch.registerTaskAsync(BACKGROUND_SYNC_TASK, {
      minimumInterval: intervalSeconds,
      stopOnTerminate: false,
      startOnBoot: true,
    });
    return true;
  } catch (error) {
    console.warn('[SmartSync] BackgroundFetch registration warning:', error);
    return false;
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
 * Trigger an instant test notification so the user can verify notifications work
 */
export async function sendTestNotification(): Promise<boolean> {
  if (isExpoGo) {
    return false;
  }
  try {
    const Notifications = getNotifications();
    if (!Notifications) return false;

    await setupNotificationChannelAsync();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Nowa ocena: Matematyka - 5',
        body: 'kartkówka (waga 2) • pochodna i styczna',
        data: { url: '/grades' },
        sound: 'default',
      },
      trigger: Platform.OS === 'android' ? { channelId: 'librus-grades' } : null,
    });
    return true;
  } catch (e) {
    console.warn('[SmartSync] sendTestNotification warning:', e);
    return false;
  }
}

/**
 * Add listener for when a user clicks on a notification
 */
export function addNotificationResponseListener(callback: (url: string) => void): (() => void) | null {
  if (isExpoGo) return null;
  try {
    const Notifications = getNotifications();
    if (!Notifications) return null;

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
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
 * Core background synchronization function (grades + timetable changes + attendance)
 */
export async function executeSmartSync(): Promise<number> {
  if (isExpoGo) {
    return BackgroundSyncResult.NoData;
  }
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
    if (Notifications) {
      await setupNotificationChannelAsync();
    }

    let foundNewData = false;

    // --- 1. GRADES DIFF ---
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

    const freshSubjects = await librusClient.getGrades();
    if (freshSubjects && freshSubjects.length > 0) {
      if (existingGradeIds.size === 0) {
        foundNewData = true;
      } else {
        const newGrades: { subjectName: string; grade: Grade }[] = [];
        for (const sub of freshSubjects) {
          for (const g of sub.grades) {
            if (!existingGradeIds.has(g.id)) {
              newGrades.push({ subjectName: sub.subjectName, grade: g });
            }
          }
        }

        if (newGrades.length > 0) {
          foundNewData = true;
          if (Notifications) {
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

    // --- 2. ATTENDANCE & TIMETABLE DIFF ---
    const oldMarks: AttendanceMark[] = getCachedAttendanceMarks() ?? [];
    const oldMarkIds = new Set<string>(oldMarks.map((m) => m.id));

    const now = new Date();
    const todayIso = toISODate(now);
    const tomorrowIso = toISODate(addDays(now, 1));
    const todayWeekStart = toISODate(getMonday(now));
    const tomorrowWeekStart = toISODate(getMonday(addDays(now, 1)));

    const oldTodayWeek: WeekSchedule | null = getCachedWeek(todayWeekStart);
    const oldTomorrowWeek: WeekSchedule | null =
      tomorrowWeekStart === todayWeekStart
        ? oldTodayWeek
        : getCachedWeek(tomorrowWeekStart);

    const oldLessonsById = new Map<string, TimetableLesson>();
    const collectOldLessons = (wk: WeekSchedule | null, dateIso: string) => {
      const day = wk?.days.find((d) => d.date === dateIso);
      if (!day) return;
      for (const l of day.lessons) {
        oldLessonsById.set(l.id, l);
      }
    };
    collectOldLessons(oldTodayWeek, todayIso);
    collectOldLessons(oldTomorrowWeek, tomorrowIso);

    const freshAtt = await librusClient.getAttendanceAndRealizations();
    if (freshAtt && oldMarkIds.size > 0) {
      const newAlertMarks = freshAtt.marks.filter(
        (m) => !oldMarkIds.has(m.id) && (m.kind === 'absent' || m.kind === 'late')
      );
      if (newAlertMarks.length > 0) {
        foundNewData = true;
        if (Notifications) {
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

    const freshTodayWeek = await librusClient.getWeek(todayWeekStart);
    const freshTomorrowWeek =
      tomorrowWeekStart === todayWeekStart
        ? freshTodayWeek
        : await librusClient.getWeek(tomorrowWeekStart);

    if (oldLessonsById.size > 0) {
      const checkDayDiffs = async (
        wk: WeekSchedule | null,
        dateIso: string,
        dayWord: string
      ) => {
        const day = wk?.days.find((d) => d.date === dateIso);
        if (!day) return;
        for (const lesson of day.lessons) {
          const prev = oldLessonsById.get(lesson.id);
          if (!prev) continue;

          if (!prev.isCancelled && lesson.isCancelled) {
            foundNewData = true;
            if (Notifications) {
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
            foundNewData = true;
            if (Notifications) {
              const kindTitle =
                lesson.changeType === 'room' ? 'Zmiana sali' : 'Zastępstwo';
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

    return foundNewData ? BackgroundSyncResult.NewData : BackgroundSyncResult.NoData;
  } catch (error) {
    console.error('[SmartSync] Error during background smart sync:', error);
    return BackgroundSyncResult.Failed;
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
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
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

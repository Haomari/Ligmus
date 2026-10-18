import { Directory, File, Paths } from 'expo-file-system';
import {
  AttendanceMark,
  AttendanceStats,
  ExcuseTemplateSettings,
  LessonRealization,
  LibrusMessageDetail,
  LibrusMessageSummary,
  MessageFolder,
  WeekSchedule,
} from '../types/librus';

const CACHE_SUBDIR = 'ligmus_cache';
const MAX_CACHED_WEEKS = 16;
const WEEKS_INDEX_FILE = 'timetable_index.json';
const ATTENDANCE_FILE = 'attendance.json';
const REALIZATIONS_FILE = 'realizations.json';
const ATTENDANCE_STATS_FILE = 'attendance_stats.json';
const SCHOOL_YEAR_META_FILE = 'school_year_meta.json';
const EXCUSE_SETTINGS_FILE = 'excuse_settings.json';
const SENT_EXCUSE_DATES_FILE = 'sent_excuse_dates.json';
const MESSAGES_INBOX_FILE = 'messages_inbox.json';
const MESSAGES_SENT_FILE = 'messages_sent.json';

export const DEFAULT_EXCUSE_SETTINGS: ExcuseTemplateSettings = {
  subject: 'Usprawiedliwienie',
  customEducatorName: '',
  introText:
    'Dzień dobry, uprzejmie proszę o usprawiedliwienie mojej nieobecności w następujących dniach:',
  reasonText: 'Nieobecność była spowodowana względami rodzinnymi.',
  customSignature: '',
  signatureOverride: '',
};

function getCacheDirectory(): Directory {
  const dir = new Directory(Paths.document, CACHE_SUBDIR);
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
  return dir;
}

function readJsonSync<T>(fileName: string): T | null {
  try {
    const dir = getCacheDirectory();
    const file = new File(dir, fileName);
    if (!file.exists) return null;
    const raw = file.textSync();
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch (err) {
    console.warn(`[fileCache] Failed to read ${fileName}:`, err);
    return null;
  }
}

function writeJsonSync<T>(fileName: string, data: T): void {
  try {
    const dir = getCacheDirectory();
    const file = new File(dir, fileName);
    file.write(JSON.stringify(data));
  } catch (err) {
    console.warn(`[fileCache] Failed to write ${fileName}:`, err);
  }
}

function deleteFileSync(fileName: string): void {
  try {
    const dir = getCacheDirectory();
    const file = new File(dir, fileName);
    if (file.exists) {
      file.delete();
    }
  } catch (err) {
    console.warn(`[fileCache] Failed to delete ${fileName}:`, err);
  }
}

function weekFileName(weekStart: string): string {
  const safe = weekStart.replace(/[^0-9-]/g, '');
  return `timetable_${safe}.json`;
}

/**
 * Returns the active Polish school year identifier (e.g. "2026/2027").
 * Rollover occurs on September 1st each year.
 */
export function getCurrentSchoolYearId(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = now.getMonth(); // 0 = Jan, 8 = Sep
  const startYear = month >= 8 ? year : year - 1;
  return `${startYear}/${startYear + 1}`;
}

/**
 * Checks whether the cached school year matches the current school year.
 * If a new school year has started (Sept 1), automatically clears old school year data caches.
 */
export function ensureSchoolYearCacheValid(now: Date = new Date()): boolean {
  const currentId = getCurrentSchoolYearId(now);
  const stored = readJsonSync<{ schoolYearId: string }>(SCHOOL_YEAR_META_FILE);
  if (stored?.schoolYearId && stored.schoolYearId !== currentId) {
    console.log(
      `[fileCache] School year rollover detected (${stored.schoolYearId} -> ${currentId}). Resetting data caches...`
    );
    clearDataCachesOnly();
    writeJsonSync(SCHOOL_YEAR_META_FILE, { schoolYearId: currentId });
    return true;
  }
  if (!stored?.schoolYearId) {
    writeJsonSync(SCHOOL_YEAR_META_FILE, { schoolYearId: currentId });
  }
  return false;
}

export function weekHasLessons(week: WeekSchedule | null | undefined): boolean {
  if (!week || !Array.isArray(week.days)) return false;
  return week.days.some((d) => Array.isArray(d.lessons) && d.lessons.length > 0);
}

export function getCachedWeek(weekStart: string): WeekSchedule | null {
  const week = readJsonSync<WeekSchedule>(weekFileName(weekStart));
  if (!weekHasLessons(week)) {
    return null;
  }
  return week;
}

export function getAllCachedWeeks(): Record<string, WeekSchedule> {
  const index = readJsonSync<string[]>(WEEKS_INDEX_FILE) ?? [];
  const result: Record<string, WeekSchedule> = {};
  for (const ws of index) {
    const week = getCachedWeek(ws);
    if (week) {
      result[ws] = week;
    }
  }
  return result;
}

export function saveCachedWeek(week: WeekSchedule): void {
  if (!weekHasLessons(week)) {
    return;
  }
  writeJsonSync(weekFileName(week.weekStart), week);
  const existing = readJsonSync<string[]>(WEEKS_INDEX_FILE) ?? [];
  const updated = [week.weekStart, ...existing.filter((w) => w !== week.weekStart)];
  const kept = updated.slice(0, MAX_CACHED_WEEKS);
  const pruned = updated.slice(MAX_CACHED_WEEKS);
  for (const oldWeek of pruned) {
    deleteFileSync(weekFileName(oldWeek));
  }
  writeJsonSync(WEEKS_INDEX_FILE, kept);
}

export function getCachedAttendanceMarks(): AttendanceMark[] | null {
  const marks = readJsonSync<AttendanceMark[]>(ATTENDANCE_FILE);
  if (!marks || marks.length === 0) return null;
  return marks;
}

export function saveCachedAttendanceMarks(marks: AttendanceMark[]): void {
  if (!marks || marks.length === 0) {
    const existing = readJsonSync<AttendanceMark[]>(ATTENDANCE_FILE);
    if (existing && existing.length > 0) {
      return;
    }
  }
  writeJsonSync(ATTENDANCE_FILE, marks);
}

export function getCachedRealizations(): LessonRealization[] | null {
  const real = readJsonSync<LessonRealization[]>(REALIZATIONS_FILE);
  if (!real || real.length === 0) return null;
  return real;
}

export function saveCachedRealizations(realizations: LessonRealization[]): void {
  if (!realizations || realizations.length === 0) {
    const existing = readJsonSync<LessonRealization[]>(REALIZATIONS_FILE);
    if (existing && existing.length > 0) {
      return;
    }
  }
  writeJsonSync(REALIZATIONS_FILE, realizations);
}

export function isValidAttendanceStats(stats: AttendanceStats | null | undefined): boolean {
  if (!stats || stats.total <= 0) return false;
  if (
    stats.present === 0 &&
    (stats.absent > 0 || stats.excused > 0 || stats.late > 0)
  ) {
    return false;
  }
  if (
    stats.absent === 0 &&
    stats.excused === 0 &&
    stats.late === 0 &&
    stats.present > 0
  ) {
    return false;
  }
  if (stats.late === 0 && stats.present > 0 && stats.present < stats.excused) {
    return false;
  }
  return true;
}

export function getCachedAttendanceStats(): AttendanceStats | null {
  const stats = readJsonSync<AttendanceStats>(ATTENDANCE_STATS_FILE);
  if (!isValidAttendanceStats(stats)) {
    return null;
  }
  return stats;
}

export function saveCachedAttendanceStats(stats: AttendanceStats): void {
  if (!isValidAttendanceStats(stats)) {
    return;
  }
  writeJsonSync(ATTENDANCE_STATS_FILE, stats);
}

// --- Messages Cache ---

export function getCachedMessages(folder: MessageFolder): LibrusMessageSummary[] {
  const file = folder === 'inbox' ? MESSAGES_INBOX_FILE : MESSAGES_SENT_FILE;
  const list = readJsonSync<LibrusMessageSummary[]>(file) ?? [];
  if (list.length > 0 && list.some((m) => !/\d{4}-\d{2}-\d{2}/.test(m.date || ''))) {
    // Discard pre-fix cache where subject and date columns were swapped
    return [];
  }
  return list;
}

export function saveCachedMessages(
  folder: MessageFolder,
  messages: LibrusMessageSummary[]
): void {
  if (!messages || messages.length === 0) return;
  const file = folder === 'inbox' ? MESSAGES_INBOX_FILE : MESSAGES_SENT_FILE;
  writeJsonSync(file, messages);
}

function messageDetailFileName(folderId: 5 | 6, messageId: string): string {
  const safeId = String(messageId).replace(/[^0-9a-zA-Z_-]/g, '');
  return `msg_${folderId}_${safeId}.json`;
}

export function getCachedMessageDetail(
  folderId: 5 | 6,
  messageId: string
): LibrusMessageDetail | null {
  const detail = readJsonSync<LibrusMessageDetail>(messageDetailFileName(folderId, messageId));
  if (!detail) return null;
  if (detail.sender === 'Użytkownik Librus') {
    return null;
  }
  if (
    detail.attachments?.some((a) =>
      /linkButton|function\s*\(|Napisz\s+odebrane/i.test(a.name || '')
    )
  ) {
    return null;
  }
  return detail;
}

export function saveCachedMessageDetail(detail: LibrusMessageDetail): void {
  writeJsonSync(messageDetailFileName(detail.folderId, detail.id), detail);
}

// --- Auto-Excuse Template & Sent Excuse Dates ---

export function getExcuseSettings(): ExcuseTemplateSettings {
  const saved = readJsonSync<Partial<ExcuseTemplateSettings>>(EXCUSE_SETTINGS_FILE);
  if (!saved) return DEFAULT_EXCUSE_SETTINGS;
  return {
    ...DEFAULT_EXCUSE_SETTINGS,
    ...saved,
  };
}

export function saveExcuseSettings(settings: ExcuseTemplateSettings): void {
  writeJsonSync(EXCUSE_SETTINGS_FILE, settings);
}

export function getSentExcuseDates(): string[] {
  return readJsonSync<string[]>(SENT_EXCUSE_DATES_FILE) ?? [];
}

export function markExcuseDatesAsSent(dates: string[]): void {
  const existing = new Set(getSentExcuseDates());
  for (const d of dates) {
    if (d) existing.add(d);
  }
  writeJsonSync(SENT_EXCUSE_DATES_FILE, Array.from(existing).sort());
}

/**
 * Clears cached school-year data (timetables, attendance, realizations, stats, messages, sent excuse dates)
 * while preserving user preferences like ExcuseTemplateSettings.
 */
export function clearDataCachesOnly(): void {
  const savedExcuseSettings = readJsonSync<ExcuseTemplateSettings>(EXCUSE_SETTINGS_FILE);
  clearAllFileCaches();
  if (savedExcuseSettings) {
    writeJsonSync(EXCUSE_SETTINGS_FILE, savedExcuseSettings);
  }
  writeJsonSync(SCHOOL_YEAR_META_FILE, { schoolYearId: getCurrentSchoolYearId() });
}

export function clearAllFileCaches(): void {
  try {
    const dir = new Directory(Paths.document, CACHE_SUBDIR);
    if (dir.exists) {
      dir.delete();
    }
  } catch (err) {
    console.warn('[fileCache] Failed to clear cache directory:', err);
  }
}

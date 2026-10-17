import { Directory, File, Paths } from 'expo-file-system';
import { AttendanceMark, AttendanceStats, LessonRealization, WeekSchedule } from '../types/librus';

const CACHE_SUBDIR = 'ligmus_cache';
const MAX_CACHED_WEEKS = 16;
const WEEKS_INDEX_FILE = 'timetable_index.json';
const ATTENDANCE_FILE = 'attendance.json';
const REALIZATIONS_FILE = 'realizations.json';
const ATTENDANCE_STATS_FILE = 'attendance_stats.json';

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

export function getCachedWeek(weekStart: string): WeekSchedule | null {
  return readJsonSync<WeekSchedule>(weekFileName(weekStart));
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
  return readJsonSync<AttendanceMark[]>(ATTENDANCE_FILE);
}

export function saveCachedAttendanceMarks(marks: AttendanceMark[]): void {
  writeJsonSync(ATTENDANCE_FILE, marks);
}

export function getCachedRealizations(): LessonRealization[] | null {
  return readJsonSync<LessonRealization[]>(REALIZATIONS_FILE);
}

export function saveCachedRealizations(realizations: LessonRealization[]): void {
  writeJsonSync(REALIZATIONS_FILE, realizations);
}

export function getCachedAttendanceStats(): AttendanceStats | null {
  return readJsonSync<AttendanceStats>(ATTENDANCE_STATS_FILE);
}

export function saveCachedAttendanceStats(stats: AttendanceStats): void {
  writeJsonSync(ATTENDANCE_STATS_FILE, stats);
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

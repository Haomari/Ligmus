import { Directory, File, Paths } from 'expo-file-system';
import {
  AttendanceMark,
  AttendanceStats,
  ExcusePreset,
  ExcusePresetsStore,
  ExcuseTemplateSettings,
  LessonRealization,
  LibrusMessageDetail,
  LibrusMessageSummary,
  MessageFolder,
  WeekSchedule,
} from '../types/librus';

const CACHE_SUBDIR = 'ligmus_cache';
const MAX_CACHED_WEEKS = 48;
const WEEKS_INDEX_FILE = 'timetable_index.json';
const ATTENDANCE_FILE = 'attendance.json';
const REALIZATIONS_FILE = 'realizations.json';
const ATTENDANCE_STATS_FILE = 'attendance_stats.json';
const SCHOOL_YEAR_META_FILE = 'school_year_meta.json';
const EXCUSE_SETTINGS_FILE = 'excuse_settings.json';
const EXCUSE_PRESETS_FILE = 'excuse_presets.json';
const DOWNLOAD_SETTINGS_FILE = 'download_settings.json';
const SENT_EXCUSE_DATES_FILE = 'sent_excuse_dates.json';
const MESSAGES_INBOX_FILE = 'messages_inbox.json';
const MESSAGES_SENT_FILE = 'messages_sent.json';
const NOTIFIED_SYNC_STATE_FILE = 'notified_sync_state.json';
const UPDATE_SETTINGS_FILE = 'update_settings.json';

export type UpdateChannel = 'stable' | 'beta';

export const DEFAULT_EXCUSE_SETTINGS: ExcuseTemplateSettings = {
  subject: 'Usprawiedliwienie',
  customEducatorName: '',
  introText:
    'Dzień dobry, uprzejmie proszę o usprawiedliwienie mojej nieobecności w następujących dniach:',
  reasonText: 'Nieobecność była spowodowana względami rodzinnymi.',
  customSignature: '',
  signatureOverride: '',
};

export const DEFAULT_EXCUSE_PRESETS: ExcusePreset[] = [
  {
    id: 'preset-rodzinne',
    name: 'Rodzinne',
    subject: 'Usprawiedliwienie',
    introText:
      'Dzień dobry, uprzejmie proszę o usprawiedliwienie mojej nieobecności w następujących dniach:',
    reasonText: 'Nieobecność była spowodowana ważnymi względami rodzinnymi.',
  },
  {
    id: 'preset-choroba',
    name: 'Choroba',
    subject: 'Usprawiedliwienie',
    introText:
      'Dzień dobry, uprzejmie proszę o usprawiedliwienie mojej nieobecności w następujących dniach:',
    reasonText: 'Nieobecność była spowodowana chorobą oraz wizytą lekarską.',
  },
  {
    id: 'preset-osobiste',
    name: 'Osobiste',
    subject: 'Usprawiedliwienie',
    introText:
      'Dzień dobry, uprzejmie proszę o usprawiedliwienie mojej nieobecności w następujących dniach:',
    reasonText: 'Nieobecność była spowodowana ważnymi sprawami osobistymi.',
  },
];

export interface NotifiedSyncState {
  seededMessages: boolean;
  maxSeenMessageId: number;
  notifiedMessageIds: string[];
  seededGrades: boolean;
  notifiedGradeIds: string[];
  seededAttendance: boolean;
  notifiedAttendanceIds: string[];
  notifiedTimetableKeys: string[];
}

const DEFAULT_NOTIFIED_SYNC_STATE: NotifiedSyncState = {
  seededMessages: false,
  maxSeenMessageId: 0,
  notifiedMessageIds: [],
  seededGrades: false,
  notifiedGradeIds: [],
  seededAttendance: false,
  notifiedAttendanceIds: [],
  notifiedTimetableKeys: [],
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

export function getExcusePresetsStore(): ExcusePresetsStore {
  const saved = readJsonSync<Partial<ExcusePresetsStore>>(EXCUSE_PRESETS_FILE);
  if (saved && Array.isArray(saved.presets) && saved.presets.length > 0) {
    const activeExists = saved.presets.some((p) => p.id === saved.activePresetId);
    return {
      activePresetId: activeExists ? saved.activePresetId! : saved.presets[0].id,
      customEducatorName: saved.customEducatorName ?? '',
      customSignature: saved.customSignature ?? '',
      presets: saved.presets,
    };
  }

  // Migrate any legacy single-template customization into the first preset
  const legacy = readJsonSync<Partial<ExcuseTemplateSettings>>(EXCUSE_SETTINGS_FILE);
  const migratedPresets: ExcusePreset[] = DEFAULT_EXCUSE_PRESETS.map((p, index) => {
    if (index === 0 && legacy) {
      return {
        ...p,
        subject: legacy.subject?.trim() || p.subject,
        introText: legacy.introText?.trim() || p.introText,
        reasonText: legacy.reasonText?.trim() || p.reasonText,
      };
    }
    return { ...p };
  });

  const initialStore: ExcusePresetsStore = {
    activePresetId: migratedPresets[0].id,
    customEducatorName: legacy?.customEducatorName ?? '',
    customSignature: legacy?.customSignature ?? '',
    presets: migratedPresets,
  };
  writeJsonSync(EXCUSE_PRESETS_FILE, initialStore);
  return initialStore;
}

export function saveExcusePresetsStore(store: ExcusePresetsStore): void {
  const sanitizedPresets =
    store.presets.length > 0 ? store.presets : DEFAULT_EXCUSE_PRESETS.map((p) => ({ ...p }));
  const activePreset =
    sanitizedPresets.find((p) => p.id === store.activePresetId) ?? sanitizedPresets[0];
  const normalized: ExcusePresetsStore = {
    activePresetId: activePreset.id,
    customEducatorName: store.customEducatorName ?? '',
    customSignature: store.customSignature ?? '',
    presets: sanitizedPresets,
  };
  writeJsonSync(EXCUSE_PRESETS_FILE, normalized);
  // Keep legacy single-template file in sync
  writeJsonSync(EXCUSE_SETTINGS_FILE, {
    subject: activePreset.subject,
    customEducatorName: normalized.customEducatorName,
    introText: activePreset.introText,
    reasonText: activePreset.reasonText,
    customSignature: normalized.customSignature,
  });
}

// --- Persistent Background Notification Deduplication State ---

function capTail(items: string[], maxLen: number = 400): string[] {
  if (items.length <= maxLen) return items;
  return items.slice(items.length - maxLen);
}

export function getNotifiedSyncState(): NotifiedSyncState {
  const saved = readJsonSync<Partial<NotifiedSyncState>>(NOTIFIED_SYNC_STATE_FILE);
  if (!saved) {
    return {
      ...DEFAULT_NOTIFIED_SYNC_STATE,
      notifiedMessageIds: [],
      notifiedGradeIds: [],
      notifiedAttendanceIds: [],
      notifiedTimetableKeys: [],
    };
  }
  return {
    seededMessages: Boolean(saved.seededMessages),
    maxSeenMessageId: typeof saved.maxSeenMessageId === 'number' ? saved.maxSeenMessageId : 0,
    notifiedMessageIds: Array.isArray(saved.notifiedMessageIds) ? saved.notifiedMessageIds : [],
    seededGrades: Boolean(saved.seededGrades),
    notifiedGradeIds: Array.isArray(saved.notifiedGradeIds) ? saved.notifiedGradeIds : [],
    seededAttendance: Boolean(saved.seededAttendance),
    notifiedAttendanceIds: Array.isArray(saved.notifiedAttendanceIds)
      ? saved.notifiedAttendanceIds
      : [],
    notifiedTimetableKeys: Array.isArray(saved.notifiedTimetableKeys)
      ? saved.notifiedTimetableKeys
      : [],
  };
}

export function saveNotifiedSyncState(state: NotifiedSyncState): void {
  writeJsonSync(NOTIFIED_SYNC_STATE_FILE, {
    ...state,
    notifiedMessageIds: capTail(Array.from(new Set(state.notifiedMessageIds)), 500),
    notifiedGradeIds: capTail(Array.from(new Set(state.notifiedGradeIds)), 600),
    notifiedAttendanceIds: capTail(Array.from(new Set(state.notifiedAttendanceIds)), 600),
    notifiedTimetableKeys: capTail(Array.from(new Set(state.notifiedTimetableKeys)), 300),
  });
}

export function recordSeenInboxMessages(messages: LibrusMessageSummary[]): void {
  if (!messages || messages.length === 0) return;
  const state = getNotifiedSyncState();
  let maxId = state.maxSeenMessageId;
  const seenSet = new Set(state.notifiedMessageIds);
  for (const m of messages) {
    if (!m.id) continue;
    seenSet.add(m.id);
    const numId = Number(m.id);
    if (Number.isFinite(numId) && numId > maxId) {
      maxId = numId;
    }
  }
  saveNotifiedSyncState({
    ...state,
    seededMessages: true,
    maxSeenMessageId: maxId,
    notifiedMessageIds: Array.from(seenSet),
  });
}

export function getDownloadFolderUri(): string | null {
  const saved = readJsonSync<{ folderUri?: string | null }>(DOWNLOAD_SETTINGS_FILE);
  return saved?.folderUri || null;
}

export function saveDownloadFolderUri(folderUri: string | null): void {
  writeJsonSync(DOWNLOAD_SETTINGS_FILE, { folderUri });
}

export function formatDownloadFolderLabel(folderUri: string | null): string {
  if (!folderUri) return 'Pytaj przy pierwszym pobraniu';
  try {
    const decoded = decodeURIComponent(folderUri).replace(/\/+$/, '');
    const treeMatch = decoded.match(/\/tree\/(.+)$/);
    const rawTree = treeMatch ? treeMatch[1] : decoded;
    if (rawTree.startsWith('primary:')) {
      const subPath = rawTree.slice('primary:'.length).replace(/^\/+/, '');
      return subPath ? `Pamięć wewnętrzna / ${subPath}` : 'Pamięć wewnętrzna';
    }
    return rawTree;
  } catch {
    return folderUri;
  }
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

export function getUpdateChannel(currentAppVersion?: string): UpdateChannel {
  const saved = readJsonSync<{ channel?: string }>(UPDATE_SETTINGS_FILE);
  if (saved?.channel === 'beta' || saved?.channel === 'stable') {
    return saved.channel;
  }
  if (currentAppVersion && currentAppVersion.includes('-')) {
    return 'beta';
  }
  return 'stable';
}

export function saveUpdateChannel(channel: UpdateChannel): void {
  writeJsonSync(UPDATE_SETTINGS_FILE, { channel });
}

/**
 * Clears cached school-year data (timetables, attendance, realizations, stats, messages, sent excuse dates)
 * while preserving user preferences like ExcuseTemplateSettings and DownloadFolderUri.
 */
export function clearDataCachesOnly(): void {
  const savedExcuseSettings = readJsonSync<ExcuseTemplateSettings>(EXCUSE_SETTINGS_FILE);
  const savedExcusePresets = readJsonSync<ExcusePresetsStore>(EXCUSE_PRESETS_FILE);
  const savedDownloadSettings = readJsonSync<{ folderUri?: string | null }>(DOWNLOAD_SETTINGS_FILE);
  const savedNotifiedState = readJsonSync<NotifiedSyncState>(NOTIFIED_SYNC_STATE_FILE);
  const savedUpdateSettings = readJsonSync<{ channel?: string }>(UPDATE_SETTINGS_FILE);
  clearAllFileCaches();
  if (savedExcuseSettings) {
    writeJsonSync(EXCUSE_SETTINGS_FILE, savedExcuseSettings);
  }
  if (savedExcusePresets) {
    writeJsonSync(EXCUSE_PRESETS_FILE, savedExcusePresets);
  }
  if (savedDownloadSettings) {
    writeJsonSync(DOWNLOAD_SETTINGS_FILE, savedDownloadSettings);
  }
  if (savedNotifiedState) {
    writeJsonSync(NOTIFIED_SYNC_STATE_FILE, savedNotifiedState);
  }
  if (savedUpdateSettings) {
    writeJsonSync(UPDATE_SETTINGS_FILE, savedUpdateSettings);
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

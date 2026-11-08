export interface GradeAttempt {
  value: string;
  date?: string;
  teacher?: string;
  gradeId?: string;
}

export interface GradeCorrection {
  originalValue: string;
  originalDate?: string;
  originalTeacher?: string;
  originalGradeId?: string;
  attempts?: GradeAttempt[];
}

export interface Grade {
  id: string;
  value: string;
  numericValue: number;
  weight: number;
  category: string;
  date: string;
  teacher?: string;
  comment?: string;
  semester: 1 | 2;
  countsToAverage?: boolean;
  correction?: GradeCorrection;
}

export interface SubjectGrades {
  id: string;
  subjectName: string;
  averageSem1: number | null;
  averageSem2: number | null;
  yearAverage: number | null;
  predictedGrade?: string;
  finalGrade?: string;
  grades: Grade[];
}

export type AttendanceKind = 'present' | 'absent' | 'late' | 'excused' | 'exempt' | 'other';

export interface AttendanceMark {
  id: string;
  date?: string;         // "YYYY-MM-DD"
  hourNumber?: number;
  subject?: string;
  teacher?: string;
  trip?: boolean;
  kind: AttendanceKind;
  symbol: string;        // e.g. "ob", "nb", "sp", "u", "zw"
  name: string;          // e.g. "Nieobecność usprawiedliwiona"
  addedBy?: string;
  addedAt?: string;
  semester?: 1 | 2;
}

export interface LessonRealization {
  id: string;
  date: string;          // "YYYY-MM-DD"
  hourNumber: number;
  subject: string;
  topic: string;
  teacher?: string;
  attendanceSymbol?: string;
  attendanceId?: string;
  semester?: 1 | 2;
}

export interface TimetableLesson {
  id: string;
  hourNumber: number;
  startTime: string;     // "08:00"
  endTime: string;       // "08:45"
  timeSpan: string;      // e.g. "08:00 - 08:45" (kept for compatibility)
  subject: string;
  teacher: string;
  classroom: string;
  isCancelled?: boolean;
  isFreeDay?: boolean;
  isSubstitution?: boolean;
  changeType?: 'substitution' | 'room' | 'moved' | null;
  original?: {
    subject?: string;
    teacher?: string;
    classroom?: string;
  };
  topic?: string;
  note?: string;
  attendance?: AttendanceMark;
  events?: TerminarzEvent[];
  isStandaloneEvent?: boolean;
}

export interface DaySchedule {
  dayId: number; // 1 = Poniedziałek, 5 = Piątek
  dayName: string;
  shortName: string;
  date: string; // "YYYY-MM-DD"
  isFreeDay?: boolean;
  freeDayLabel?: string;
  lessons: TimetableLesson[];
}

export interface WeekSchedule {
  weekStart: string; // Monday "YYYY-MM-DD"
  days: DaySchedule[];
  fetchedAt: number;
}

export interface AttendanceStats {
  percent: number | null;
  present: number;
  absent: number;
  excused: number;
  late: number;
  exempt: number;
  total: number;
}

export type SemesterFilter = 1 | 2 | 'all' | 'sem1' | 'sem2' | 'year';

export interface SubjectAttendanceStat {
  subject: string;
  present: number;
  late: number;
  absent: number;
  excused: number;
  exempt: number;
  total: number;
  percent: number;
  status: 'ok' | 'warning' | 'danger';
  canMissFor50: number;
  mustAttendFor50: number;
}

export type MessageFolder = 'inbox' | 'sent';
export type SkrzynkaTab = 'inbox' | 'sent' | 'announcements';

export type TerminarzCategory =
  | 'exam'
  | 'quiz'
  | 'retake'
  | 'oral'
  | 'consultation'
  | 'other'
  | 'free_day';

export interface TerminarzEvent {
  id: string;
  date: string;            // "YYYY-MM-DD"
  lessonNumber: number;    // >= 0 when "Nr lekcji" present, -1 when only explicit time given
  hasExplicitLessonZero?: boolean;
  startTime?: string;      // e.g. "18:00" when "Czas: 18:00 - 19:30" present
  endTime?: string;        // e.g. "19:30"
  autoAdjustedFromLesson?: number; // original lessonNumber if auto-matched onto another lesson
  rawType: string;         // e.g. "klasówka", "kartkówka", "Inna"
  displayType: string;     // e.g. "Klasówka", "Kartkówka", "Konsultacje", "Poprawa"
  shortLabel: string;      // e.g. "Spr.", "Kartk.", "Popr.", "Odp.", "Kons."
  category: TerminarzCategory;
  subject?: string;        // e.g. "Matematyka"
  teacher?: string;        // e.g. "Znamirowska Ewa"
  classroom?: string;
  description?: string;    // e.g. "Rachunek różniczkowy"
  addedAt?: string;        // e.g. "2026-10-20 09:40:52"
}

export interface HiddenTerminarzRule {
  id: string;
  teacher?: string;
  category: TerminarzCategory;
  displayType: string;
  subjectLabel?: string;
  createdAt: number;
}

export interface HiddenTerminarzItemMeta {
  id: string;
  date: string;
  displayType: string;
  teacher?: string;
  subject?: string;
}

export interface HiddenTerminarzStore {
  hiddenEventIds: string[];
  hiddenEventsMeta: HiddenTerminarzItemMeta[];
  rules: HiddenTerminarzRule[];
}

export interface SchoolAnnouncement {
  id: string;
  title: string;
  author: string;
  date: string;            // "YYYY-MM-DD"
  content: string;
  isUnread?: boolean;
}

export type ActivityItemKind =
  | 'grade'
  | 'message'
  | 'announcement'
  | 'attendance'
  | 'timetable'
  | 'terminarz';

export interface ActivityFeedItem {
  id: string;
  kind: ActivityItemKind;
  title: string;
  subtitle: string;
  badgeText?: string;
  accentColor: string;
  date: string;            // "YYYY-MM-DD"
  timestamp: number;
  targetRoute: '/grades' | '/messages' | '/attendance' | '/timetable';
  targetParams?: Record<string, string>;
}

export interface ActivityFeedStore {
  seeded: boolean;
  seenIds: string[];
  items: ActivityFeedItem[];
}

export interface LibrusAttachment {
  name: string;
  path: string;
}

export interface LibrusMessageSummary {
  id: string;
  folderId: 5 | 6;
  sender: string;
  senderOrRecipient: string;
  subject: string;
  date: string;
  sentAt: string;
  isUnread: boolean;
  readByRecipient?: boolean;
  readAt?: string;
  hasAttachment?: boolean;
}

export interface LibrusMessageDetail extends LibrusMessageSummary {
  body: string;
  bodyText?: string;
  bodyHtml?: string;
  recipient?: string;
  readAt?: string;
  readStatusText?: string;
  attachments?: LibrusAttachment[];
}

export interface MessageRecipient {
  id: string;
  name: string;
  group: 'wychowawca' | 'nauczyciel' | 'sekretariat' | 'bibliotekarz' | 'admin';
}

export interface ExcuseTemplateSettings {
  subject: string;
  customEducatorName: string;
  introText: string;
  reasonText: string;
  customSignature: string;
  signatureOverride?: string;
}

export interface ExcusePreset {
  id: string;
  name: string;
  subject: string;
  introText: string;
  reasonText: string;
}

export interface ExcusePresetsStore {
  activePresetId: string;
  customEducatorName: string;
  customSignature: string;
  presets: ExcusePreset[];
}

export interface StudentInfo {
  name: string;
  classGroup: string;
  indexNumber: string;
  educator: string;
  luckyNumber: number;
  studentNumber: number;
}

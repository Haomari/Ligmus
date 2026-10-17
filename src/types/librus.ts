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
}

export interface DaySchedule {
  dayId: number; // 1 = Poniedziałek, 5 = Piątek
  dayName: string;
  shortName: string;
  date: string; // "YYYY-MM-DD"
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

export interface StudentInfo {
  name: string;
  classGroup: string;
  indexNumber: string;
  educator: string;
  luckyNumber: number;
  studentNumber: number;
}

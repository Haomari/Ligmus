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

export interface TimetableLesson {
  id: string;
  hourNumber: number;
  timeSpan: string; // e.g. "08:00 - 08:45"
  subject: string;
  teacher: string;
  classroom: string;
  isCancelled?: boolean;
  isSubstitution?: boolean;
  note?: string;
}

export interface DaySchedule {
  dayId: number; // 1 = Poniedziałek, 5 = Piątek
  dayName: string;
  shortName: string;
  date: string;
  lessons: TimetableLesson[];
}

export interface StudentInfo {
  name: string;
  classGroup: string;
  indexNumber: string;
  educator: string;
  luckyNumber: number;
  studentNumber: number;
}

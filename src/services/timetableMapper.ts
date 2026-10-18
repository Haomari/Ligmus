import {
  AttendanceKind,
  AttendanceMark,
  AttendanceStats,
  LessonRealization,
  SemesterFilter,
  SubjectAttendanceStat,
  WeekSchedule,
} from '@/types/librus';
import { addDays, parseHM, parseISODate, toISODate } from '@/utils/dates';
import { getAllCachedWeeks } from './fileCache';

export function classifyAttendanceSymbol(
  rawSymbol: string,
  rawName?: string
): { kind: AttendanceKind; defaultName: string } {
  const sym = rawSymbol.trim().toLowerCase();
  if (sym === 'ob' || sym === 'obecność' || sym === 'obecnosc') {
    return { kind: 'present', defaultName: rawName || 'Obecność' };
  }
  if (sym === 'nb') {
    return { kind: 'absent', defaultName: rawName || 'Nieobecność nieusprawiedliwiona' };
  }
  if (sym === 'u' || sym === 'nu') {
    return { kind: 'excused', defaultName: rawName || 'Nieobecność usprawiedliwiona' };
  }
  if (sym === 'sp' || sym === 'spóźnienie' || sym === 'spoznienie') {
    return { kind: 'late', defaultName: rawName || 'Spóźnienie' };
  }
  if (sym === 'zw' || sym === 'wy' || sym === 'w' || sym === 'k') {
    return { kind: 'exempt', defaultName: rawName || 'Zwolnienie / Wycieczka' };
  }
  if (rawName) {
    const lowerName = rawName.toLowerCase();
    if (lowerName.includes('usprawiedliwion') && !lowerName.includes('nieusprawiedliwion')) {
      return { kind: 'excused', defaultName: rawName };
    }
    if (lowerName.includes('nieobecno')) {
      return { kind: 'absent', defaultName: rawName };
    }
    if (lowerName.includes('spóźnien') || lowerName.includes('spoznien')) {
      return { kind: 'late', defaultName: rawName };
    }
    if (lowerName.includes('zwolnien') || lowerName.includes('wycieczk')) {
      return { kind: 'exempt', defaultName: rawName };
    }
    if (lowerName.includes('obecno')) {
      return { kind: 'present', defaultName: rawName };
    }
  }
  return { kind: 'other', defaultName: rawName || rawSymbol };
}

/**
 * Merges attendance marks and lesson realizations into a WeekSchedule.
 * Uses multi-pass matching per day:
 * 1. Exact lesson hourNumber match
 * 2. Subject match for remaining unmatched marks on that day
 * 3. Positional / offset fallback for remaining unmatched marks on that day
 * 4. Synthesizes 'Obecność' (ob ✓) on completed past non-cancelled lessons
 *    only when attendance data has loaded and the lesson has no exception mark.
 */
export function mergeAttendanceAndTopics(
  week: WeekSchedule,
  marks: AttendanceMark[],
  realizations: LessonRealization[]
): WeekSchedule {
  const marksByDate = new Map<string, AttendanceMark[]>();
  for (const m of marks) {
    if (!m.date) continue;
    const list = marksByDate.get(m.date);
    if (list) {
      list.push(m);
    } else {
      marksByDate.set(m.date, [m]);
    }
  }

  const realByDateHour = new Map<string, LessonRealization>();
  const realByDateSubject = new Map<string, LessonRealization>();

  for (const r of realizations) {
    if (!r.date) continue;
    if (r.hourNumber != null) {
      realByDateHour.set(`${r.date}#${r.hourNumber}`, r);
    }
    if (r.subject) {
      realByDateSubject.set(`${r.date}#${r.subject.trim().toLowerCase()}`, r);
    }
  }

  const hasAttendanceLoaded = marks.length > 0 || realizations.length > 0;
  const now = new Date();
  const todayIso = toISODate(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  return {
    ...week,
    days: week.days.map((day) => {
      const isPastDay = Boolean(day.date && day.date < todayIso);
      const isToday = day.date === todayIso;
      const dayMarks = day.date ? marksByDate.get(day.date) ?? [] : [];

      const usedMarkIds = new Set<string>();
      const assignedByLessonIdx = new Map<number, AttendanceMark>();

      // Pass 1: Exact hourNumber match
      day.lessons.forEach((lesson, lessonIdx) => {
        const exact = dayMarks.find(
          (m) => !usedMarkIds.has(m.id) && m.hourNumber != null && m.hourNumber === lesson.hourNumber
        );
        if (exact) {
          assignedByLessonIdx.set(lessonIdx, exact);
          usedMarkIds.add(exact.id);
        }
      });

      // Pass 2: Subject match for any remaining unused marks on this day
      for (const m of dayMarks) {
        if (usedMarkIds.has(m.id) || !m.subject) continue;
        const targetSubj = m.subject.trim().toLowerCase();
        const matchIdx = day.lessons.findIndex((lesson, idx) => {
          if (assignedByLessonIdx.has(idx) || lesson.isCancelled) return false;
          const lSubj = lesson.subject.trim().toLowerCase();
          return lSubj === targetSubj || lSubj.includes(targetSubj) || targetSubj.includes(lSubj);
        });
        if (matchIdx !== -1) {
          assignedByLessonIdx.set(matchIdx, m);
          usedMarkIds.add(m.id);
        }
      }

      // Pass 3: Positional / +1 hour offset fallback for any still-unmatched marks on this day
      for (const m of dayMarks) {
        if (usedMarkIds.has(m.id)) continue;

        // 3a: Check if school's 0-based box index made m.hourNumber = lesson.hourNumber - 1
        if (m.hourNumber != null) {
          const plusOneIdx = day.lessons.findIndex(
            (lesson, idx) =>
              !assignedByLessonIdx.has(idx) &&
              !lesson.isCancelled &&
              lesson.hourNumber === m.hourNumber! + 1
          );
          if (plusOneIdx !== -1) {
            assignedByLessonIdx.set(plusOneIdx, m);
            usedMarkIds.add(m.id);
            continue;
          }
        }

        // 3b: Check if m.hourNumber is 1-based ordinal index into day.lessons
        if (
          m.hourNumber != null &&
          m.hourNumber >= 1 &&
          m.hourNumber <= day.lessons.length &&
          !assignedByLessonIdx.has(m.hourNumber - 1) &&
          !day.lessons[m.hourNumber - 1].isCancelled
        ) {
          assignedByLessonIdx.set(m.hourNumber - 1, m);
          usedMarkIds.add(m.id);
          continue;
        }
      }

      return {
        ...day,
        lessons: day.lessons.map((lesson, lessonIdx) => {
          const keyHour = `${day.date}#${lesson.hourNumber}`;
          const keySubj = `${day.date}#${lesson.subject.trim().toLowerCase()}`;

          const real = realByDateHour.get(keyHour) ?? realByDateSubject.get(keySubj);
          let mark = assignedByLessonIdx.get(lessonIdx);

          if (!mark && real?.attendanceSymbol) {
            const { kind, defaultName } = classifyAttendanceSymbol(real.attendanceSymbol);
            mark = {
              id: real.attendanceId || `real-${day.date}-${lesson.hourNumber}`,
              date: day.date,
              hourNumber: lesson.hourNumber,
              subject: lesson.subject,
              teacher: real.teacher || lesson.teacher,
              kind,
              symbol: real.attendanceSymbol,
              name: defaultName,
            };
          }

          // Synthesize 'Obecność' (ob ✓) for completed non-cancelled lessons with no absence/late mark
          if (!mark && !lesson.isCancelled && hasAttendanceLoaded) {
            const lessonEndMin = parseHM(lesson.endTime || '23:59');
            const hasCompleted =
              isPastDay || (isToday && lessonEndMin > 0 && lessonEndMin <= nowMinutes);
            if (hasCompleted) {
              mark = {
                id: `ob-${day.date}-${lesson.hourNumber}`,
                date: day.date,
                hourNumber: lesson.hourNumber,
                subject: lesson.subject,
                teacher: lesson.teacher,
                kind: 'present',
                symbol: 'ob',
                name: 'Obecność',
              };
            }
          }

          return {
            ...lesson,
            topic: real?.topic || lesson.topic,
            attendance: mark,
          };
        }),
      };
    }),
  };
}

export interface ScrapedAttendanceSummary {
  present: number;
  absent: number;
  excused: number;
  late: number;
  exempt?: number;
}

/**
 * Returns the date of the first regular timetable day of the Polish school year
 * (the day after the September 1st opening ceremony, or first Monday if Sept 1 is Fri–Sun).
 */
function getFirstSchoolYearLessonDate(now: Date): Date {
  const year = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  const sep1 = new Date(year, 8, 1, 12, 0, 0, 0);
  const dow = sep1.getDay(); // 0 = Sun, 1 = Mon, ..., 5 = Fri, 6 = Sat
  if (dow === 5) return addDays(sep1, 3); // Fri -> Mon Sep 4
  if (dow === 6) return addDays(sep1, 3); // Sat -> Mon Sep 3 is opening, Tue Sep 4 is lessons
  if (dow === 0) return addDays(sep1, 2); // Sun -> Mon Sep 2 is opening, Tue Sep 3 is lessons
  return addDays(sep1, 1); // Mon..Thu -> next day
}

/**
 * Computes Librus Synergia attendance statistics:
 * - Late ('sp') counts as present in the numerator.
 * - Absent ('nb') and Excused ('u') count as absent in the denominator.
 * - Exempt ('zw' / 'wy') is excluded from both numerator and denominator.
 * - Since przegladaj_nb/uczen only records exceptions (u, nb, sp, zw),
 *   total held lessons from the start of the school year up to today are calculated
 *   from cachedWeeks + the student's weekday timetable template to infer 'Obecności' (present).
 */
export function computeStats(
  marks: AttendanceMark[],
  realizations: LessonRealization[] = [],
  scrapedPercent?: number | null,
  summaryTotals?: ScrapedAttendanceSummary | null,
  cachedWeeks?: Record<string, WeekSchedule>
): AttendanceStats {
  const combinedBySlot = new Map<string, AttendanceKind>();

  for (const r of realizations) {
    if (!r.attendanceSymbol) continue;
    const { kind } = classifyAttendanceSymbol(r.attendanceSymbol);
    const key = `${r.date}#${r.hourNumber ?? r.id}`;
    combinedBySlot.set(key, kind);
  }

  for (const m of marks) {
    const key = m.date && m.hourNumber != null ? `${m.date}#${m.hourNumber}-${m.id}` : `id#${m.id}`;
    combinedBySlot.set(key, m.kind);
  }

  let present = 0;
  let absent = 0;
  let excused = 0;
  let late = 0;
  let exempt = 0;

  for (const kind of combinedBySlot.values()) {
    switch (kind) {
      case 'present':
        present++;
        break;
      case 'absent':
        absent++;
        break;
      case 'excused':
        excused++;
        break;
      case 'late':
        late++;
        break;
      case 'exempt':
        exempt++;
        break;
      default:
        break;
    }
  }

  // Use official row totals from przegladaj_nb/uczen when higher
  if (summaryTotals) {
    if (summaryTotals.present > present) present = summaryTotals.present;
    if (summaryTotals.absent > absent) absent = summaryTotals.absent;
    if (summaryTotals.excused > excused) excused = summaryTotals.excused;
    if (summaryTotals.late > late) late = summaryTotals.late;
    if (summaryTotals.exempt != null && summaryTotals.exempt > exempt) {
      exempt = summaryTotals.exempt;
    }
  }

  // Infer 'Obecności' (present) from timetable, realizations, or school calendar up to today when present === 0
  if (present === 0) {
    const now = new Date();
    const todayIso = toISODate(now);
    const nowMin = now.getHours() * 60 + now.getMinutes();

    let totalHeldLessons = 0;

    // 1. First preference: exact timetable template from cachedWeeks
    if (cachedWeeks && Object.keys(cachedWeeks).length > 0) {
      const weekdayCounts = [0, 0, 0, 0, 0];
      const exactDateCounts = new Map<string, number>();

      for (const wk of Object.values(cachedWeeks)) {
        wk.days.forEach((d, idx) => {
          if (idx >= 0 && idx < 5) {
            if (d.lessons.length > weekdayCounts[idx]) {
              weekdayCounts[idx] = d.lessons.length;
            }
          }
          if (!d.date) return;
          if (d.date < todayIso) {
            const activeCount = d.lessons.filter((l) => !l.isCancelled).length;
            exactDateCounts.set(d.date, activeCount);
          } else if (d.date === todayIso) {
            const completedToday = d.lessons.filter(
              (l) => !l.isCancelled && parseHM(l.endTime || '23:59') <= nowMin
            ).length;
            exactDateCounts.set(d.date, completedToday);
          }
        });
      }

      if (weekdayCounts.some((c) => c > 0)) {
        let cursor = getFirstSchoolYearLessonDate(now);
        while (toISODate(cursor) <= todayIso) {
          const dow = cursor.getDay(); // 1..5 = Mon..Fri
          const iso = toISODate(cursor);
          if (dow >= 1 && dow <= 5) {
            if (exactDateCounts.has(iso)) {
              totalHeldLessons += exactDateCounts.get(iso)!;
            } else if (iso < todayIso) {
              totalHeldLessons += weekdayCounts[dow - 1];
            }
          }
          cursor = addDays(cursor, 1);
        }
      }
    }

    // 2. Second preference: count completed lessons from realizations
    if (totalHeldLessons === 0 && realizations && realizations.length > 0) {
      const uniqueSlots = new Set<string>();
      for (const r of realizations) {
        if (r.date && r.date <= todayIso) {
          uniqueSlots.add(`${r.date}#${r.hourNumber ?? r.id}`);
        }
      }
      if (uniqueSlots.size > 0) {
        totalHeldLessons = uniqueSlots.size;
      }
    }

    // 3. Third preference: estimate from calendar days since Sept 1 if student has attendance exceptions
    if (totalHeldLessons === 0 && (absent > 0 || excused > 0 || late > 0)) {
      let cursor = getFirstSchoolYearLessonDate(now);
      let schoolDays = 0;
      while (toISODate(cursor) <= todayIso) {
        const dow = cursor.getDay();
        if (dow >= 1 && dow <= 5) {
          schoolDays++;
        }
        cursor = addDays(cursor, 1);
      }
      // Average 6 lessons per school day
      totalHeldLessons = Math.max(absent + excused + late + 10, schoolDays * 6);
    }

    if (totalHeldLessons > 0) {
      const inferredPresent = Math.max(
        0,
        totalHeldLessons - absent - excused - late - exempt
      );
      if (inferredPresent > 0) {
        present = inferredPresent;
      }
    }
  }

  const total = present + late + absent + excused;
  const computedPercent =
    total > 0 ? Math.round(((present + late) / total) * 10000) / 100 : null;

  return {
    percent: scrapedPercent != null && !isNaN(scrapedPercent) ? scrapedPercent : computedPercent,
    present,
    absent,
    excused,
    late,
    exempt,
    total,
  };
}

export interface DetailedAttendanceResult {
  overall: AttendanceStats;
  subjects: SubjectAttendanceStat[];
  bySubject: SubjectAttendanceStat[];
  lowAttendanceSubjects: SubjectAttendanceStat[];
  filteredMarks: AttendanceMark[];
  allSubjects: string[];
}

/**
 * Computes semester-filtered and subject-filtered attendance statistics,
 * per-subject <50% / <60% warning states, and the 50% klasyfikacja calculator.
 */
export function computeDetailedAttendance(
  marks: AttendanceMark[],
  realizations: LessonRealization[] = [],
  cachedWeeks: Record<string, WeekSchedule> = {},
  semesterFilter: SemesterFilter = 'all',
  subjectFilter: string | null = null
): DetailedAttendanceResult {
  const normalizedSem: 1 | 2 | 'all' =
    semesterFilter === 'sem1' || semesterFilter === 1
      ? 1
      : semesterFilter === 'sem2' || semesterFilter === 2
        ? 2
        : 'all';

  const now = new Date();
  const todayIso = toISODate(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const firstDayDate = getFirstSchoolYearLessonDate(now);
  const firstDayIso = toISODate(firstDayDate);
  const startYear = firstDayDate.getFullYear();

  // Determine Semester 2 start date from marks tagged with semester=2 or default to Feb 1
  let sem2StartIso = `${startYear + 1}-02-01`;
  const sem2Dates = marks
    .filter((m) => m.semester === 2 && m.date)
    .map((m) => m.date!)
    .sort();
  const sem1Dates = marks
    .filter((m) => m.semester === 1 && m.date)
    .map((m) => m.date!)
    .sort();

  if (sem2Dates.length > 0) {
    sem2StartIso = sem2Dates[0];
  } else if (sem1Dates.length > 0) {
    const lastSem1 = sem1Dates[sem1Dates.length - 1];
    if (lastSem1 >= sem2StartIso) {
      sem2StartIso = toISODate(addDays(parseISODate(lastSem1), 1));
    }
  }

  const isDateInSemester = (iso: string): boolean => {
    if (normalizedSem === 'all') return true;
    if (normalizedSem === 1) return iso < sem2StartIso;
    return iso >= sem2StartIso;
  };

  const isMarkInSemester = (m: AttendanceMark): boolean => {
    if (normalizedSem === 'all') return true;
    if (m.semester === 1 || m.semester === 2) {
      return m.semester === normalizedSem;
    }
    if (m.date) {
      return isDateInSemester(m.date);
    }
    return normalizedSem === 1;
  };

  // Build canonical subject map and weekday subject templates from cachedWeeks
  const canonicalSubjectByKey = new Map<string, string>();
  const registerSubject = (raw?: string): string | null => {
    if (!raw) return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const key = trimmed.toLowerCase();
    if (!canonicalSubjectByKey.has(key)) {
      canonicalSubjectByKey.set(key, trimmed);
    }
    return canonicalSubjectByKey.get(key)!;
  };

  // Weekday template: for each weekday 0..4, choose the day with the most lessons across cachedWeeks
  const weekdayTemplateSubjects: string[][] = [[], [], [], [], []];
  const exactDateSubjects = new Map<string, string[]>();
  const effectiveWeeks =
    Object.keys(cachedWeeks).length > 0 ? cachedWeeks : getAllCachedWeeks();

  for (const wk of Object.values(effectiveWeeks)) {
    if (!wk?.days) continue;
    wk.days.forEach((d, idx) => {
      const nonCancelledSubjects = d.lessons
        .filter((l) => !l.isCancelled && l.subject)
        .map((l) => registerSubject(l.subject)!)
        .filter(Boolean);

      if (idx >= 0 && idx < 5) {
        if (nonCancelledSubjects.length > weekdayTemplateSubjects[idx].length) {
          weekdayTemplateSubjects[idx] = nonCancelledSubjects;
        }
      }

      if (!d.date) return;
      if (d.date < todayIso) {
        exactDateSubjects.set(d.date, nonCancelledSubjects);
      } else if (d.date === todayIso) {
        const completedToday = d.lessons
          .filter((l) => !l.isCancelled && l.subject && parseHM(l.endTime || '23:59') <= nowMin)
          .map((l) => registerSubject(l.subject)!)
          .filter(Boolean);
        exactDateSubjects.set(d.date, completedToday);
      }
    });
  }

  // Register subjects from marks and realizations as well
  for (const m of marks) {
    registerSubject(m.subject);
  }
  for (const r of realizations) {
    registerSubject(r.subject);
  }

  // Count held lessons per subject across the selected semester range
  const heldBySubject = new Map<string, number>();
  let totalHeldInPeriod = 0;

  if (weekdayTemplateSubjects.some((arr) => arr.length > 0)) {
    let cursor = firstDayDate;
    while (toISODate(cursor) <= todayIso) {
      const iso = toISODate(cursor);
      const dow = cursor.getDay(); // 1..5
      if (dow >= 1 && dow <= 5 && isDateInSemester(iso) && iso >= firstDayIso) {
        let daySubjects: string[] = [];
        if (exactDateSubjects.has(iso)) {
          daySubjects = exactDateSubjects.get(iso)!;
        } else if (iso < todayIso) {
          daySubjects = weekdayTemplateSubjects[dow - 1];
        }
        for (const subj of daySubjects) {
          heldBySubject.set(subj, (heldBySubject.get(subj) ?? 0) + 1);
          totalHeldInPeriod++;
        }
      }
      cursor = addDays(cursor, 1);
    }
  } else if (realizations.length > 0) {
    for (const r of realizations) {
      if (r.subject && isDateInSemester(r.date) && r.date <= todayIso && r.date >= firstDayIso) {
        const canonical = registerSubject(r.subject);
        if (canonical) {
          heldBySubject.set(canonical, (heldBySubject.get(canonical) ?? 0) + 1);
          totalHeldInPeriod++;
        }
      }
    }
  }

  // Tally exception marks per subject in the selected semester
  const semesterMarks = marks.filter((m) => isMarkInSemester(m));

  interface SubjCounters {
    absent: number;
    excused: number;
    late: number;
    exempt: number;
  }

  const countersBySubject = new Map<string, SubjCounters>();
  const ensureCounter = (subj: string): SubjCounters => {
    let c = countersBySubject.get(subj);
    if (!c) {
      c = { absent: 0, excused: 0, late: 0, exempt: 0 };
      countersBySubject.set(subj, c);
    }
    return c;
  };

  for (const subj of canonicalSubjectByKey.values()) {
    ensureCounter(subj);
  }

  // Also infer subject for marks missing `m.subject` by checking cachedWeeks on that date+hour
  const lessonSubjectByDateHour = new Map<string, string>();
  for (const wk of Object.values(cachedWeeks)) {
    for (const d of wk?.days ?? []) {
      for (const l of d.lessons) {
        const canon = registerSubject(l.subject);
        if (canon) {
          lessonSubjectByDateHour.set(`${d.date}#${l.hourNumber}`, canon);
        }
      }
    }
  }

  let totalAbsent = 0;
  let totalExcused = 0;
  let totalLate = 0;
  let totalExempt = 0;

  for (const m of semesterMarks) {
    const rawSubj =
      m.subject ||
      (m.date && m.hourNumber != null
        ? lessonSubjectByDateHour.get(`${m.date}#${m.hourNumber}`)
        : undefined);
    const canon = registerSubject(rawSubj);

    if (m.kind === 'absent') totalAbsent++;
    else if (m.kind === 'excused') totalExcused++;
    else if (m.kind === 'late') totalLate++;
    else if (m.kind === 'exempt') totalExempt++;

    if (canon) {
      const c = ensureCounter(canon);
      if (m.kind === 'absent') c.absent++;
      else if (m.kind === 'excused') c.excused++;
      else if (m.kind === 'late') c.late++;
      else if (m.kind === 'exempt') c.exempt++;
    }
  }

  // If no held lessons were found from timetable or realizations, estimate based on school calendar
  const weeksElapsed = Math.max(
    1,
    Math.round((Math.min(now.getTime(), parseISODate(todayIso).getTime()) - firstDayDate.getTime()) / (7 * 24 * 3600 * 1000))
  );

  let effectiveTotalHeld = totalHeldInPeriod;
  if (effectiveTotalHeld === 0 && (totalAbsent > 0 || totalExcused > 0 || totalLate > 0)) {
    let cursor = firstDayDate;
    let schoolDays = 0;
    while (toISODate(cursor) <= todayIso) {
      const dow = cursor.getDay();
      if (dow >= 1 && dow <= 5 && isDateInSemester(toISODate(cursor))) {
        schoolDays++;
      }
      cursor = addDays(cursor, 1);
    }
    effectiveTotalHeld = Math.max(
      totalAbsent + totalExcused + totalLate + 20,
      schoolDays * 6
    );
  }

  // Build SubjectAttendanceStat list
  const subjects: SubjectAttendanceStat[] = [];
  for (const [subj, c] of countersBySubject.entries()) {
    let held = heldBySubject.get(subj) ?? 0;
    if (held === 0) {
      if (c.absent > 0 || c.excused > 0 || c.late > 0) {
        held = Math.max((c.absent + c.excused + c.late + c.exempt) * 5, weeksElapsed * 2);
      } else if (effectiveTotalHeld > 0 && canonicalSubjectByKey.size > 0) {
        held = Math.max(1, Math.round(effectiveTotalHeld / canonicalSubjectByKey.size));
      }
    } else {
      held = Math.max(held, c.absent + c.excused + c.late + c.exempt);
    }
    const present = Math.max(0, held - c.absent - c.excused - c.late - c.exempt);
    const total = present + c.late + c.absent + c.excused;
    if (total === 0 && c.exempt === 0) continue;

    const attended = present + c.late;
    const missed = c.absent + c.excused;
    const percent = total > 0 ? Math.round((attended / total) * 1000) / 10 : 100;

    const status: 'ok' | 'warning' | 'danger' =
      percent < 50 ? 'danger' : percent < 60 ? 'warning' : 'ok';

    const canMissFor50 = attended >= missed ? attended - missed : 0;
    const mustAttendFor50 = attended < missed ? missed - attended : 0;

    subjects.push({
      subject: subj,
      present,
      late: c.late,
      absent: c.absent,
      excused: c.excused,
      exempt: c.exempt,
      total,
      percent,
      status,
      canMissFor50,
      mustAttendFor50,
    });
  }

  // Sort subjects: danger (<50%) first, then warning (<60%), then alphabetical
  subjects.sort((a, b) => {
    const rank = (s: 'ok' | 'warning' | 'danger') =>
      s === 'danger' ? 0 : s === 'warning' ? 1 : 2;
    const rDiff = rank(a.status) - rank(b.status);
    if (rDiff !== 0) return rDiff;
    return a.subject.localeCompare(b.subject, 'pl');
  });

  const lowAttendanceSubjects = subjects.filter(
    (s) => s.status === 'danger' || s.status === 'warning'
  );

  const allSubjects = Array.from(canonicalSubjectByKey.values()).sort((a, b) =>
    a.localeCompare(b, 'pl')
  );

  // Compute overall stats (either for all subjects or for the selected subjectFilter)
  let overall: AttendanceStats;
  if (subjectFilter) {
    const match = subjects.find(
      (s) => s.subject.toLowerCase() === subjectFilter.toLowerCase()
    );
    if (match) {
      overall = {
        percent: match.percent,
        present: match.present,
        absent: match.absent,
        excused: match.excused,
        late: match.late,
        exempt: match.exempt,
        total: match.total,
      };
    } else {
      overall = {
        percent: null,
        present: 0,
        absent: 0,
        excused: 0,
        late: 0,
        exempt: 0,
        total: 0,
      };
    }
  } else {
    const heldOverall = Math.max(
      effectiveTotalHeld,
      totalAbsent + totalExcused + totalLate + totalExempt
    );
    const presentOverall = Math.max(
      0,
      heldOverall - totalAbsent - totalExcused - totalLate - totalExempt
    );
    const totalOverall = presentOverall + totalLate + totalAbsent + totalExcused;
    const pctOverall =
      totalOverall > 0
        ? Math.round(((presentOverall + totalLate) / totalOverall) * 1000) / 10
        : null;
    overall = {
      percent: pctOverall,
      present: presentOverall,
      absent: totalAbsent,
      excused: totalExcused,
      late: totalLate,
      exempt: totalExempt,
      total: totalOverall,
    };
  }

  // Filter marks list by subjectFilter if set, sorted newest date first
  const filteredMarks = semesterMarks
    .map((m) => {
      const inferredSubj =
        m.subject ||
        (m.date && m.hourNumber != null
          ? lessonSubjectByDateHour.get(`${m.date}#${m.hourNumber}`)
          : undefined);
      return inferredSubj && !m.subject ? { ...m, subject: inferredSubj } : m;
    })
    .filter((m) => {
      if (!subjectFilter) return true;
      return (m.subject || '').trim().toLowerCase() === subjectFilter.trim().toLowerCase();
    })
    .sort((a, b) => {
      const dCmp = (b.date || '').localeCompare(a.date || '');
      if (dCmp !== 0) return dCmp;
      return (b.hourNumber ?? 0) - (a.hourNumber ?? 0);
    });

  return {
    overall,
    subjects,
    bySubject: subjects,
    lowAttendanceSubjects,
    filteredMarks,
    allSubjects,
  };
}


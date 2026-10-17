import {
  AttendanceKind,
  AttendanceMark,
  AttendanceStats,
  LessonRealization,
  WeekSchedule,
} from '@/types/librus';
import { addDays, parseHM, toISODate } from '@/utils/dates';

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

  // Infer 'Obecności' (present) from the school year timetable up to today when present === 0
  if (present === 0 && cachedWeeks && Object.keys(cachedWeeks).length > 0) {
    const now = new Date();
    const todayIso = toISODate(now);
    const nowMin = now.getHours() * 60 + now.getMinutes();

    // 1. Build weekday lesson count template (Mon=0 .. Fri=4) and exact date counts
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
      let totalHeldLessons = 0;

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

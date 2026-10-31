import {
  DaySchedule,
  HiddenTerminarzStore,
  TerminarzCategory,
  TerminarzEvent,
  TimetableLesson,
  WeekSchedule,
} from '@/types/librus';
import { parseHM } from './dates';

export const TERMINARZ_COLORS: Record<TerminarzCategory, string> = {
  exam: '#10b981',         // Emerald Green — Sprawdzian / Klasówka / Praca klasowa
  quiz: '#f97316',         // Orange — Kartkówka
  retake: '#ec4899',       // Rose Pink — Poprawa
  oral: '#a855f7',         // Violet — Odpowiedź / Zadanie / Projekt
  consultation: '#38bdf8', // Sky Cyan — Konsultacje / Zebranie / Spotkanie / Wycieczka
  other: '#94a3b8',        // Subtle Slate — Inne / ogólna informacja nauczyciela
  free_day: '#f43f5e',     // Rose — Dzień wolny / Święto
};

export const TERMINARZ_PRIORITY: Record<TerminarzCategory, number> = {
  exam: 1,
  quiz: 2,
  retake: 3,
  oral: 4,
  consultation: 5,
  other: 6,
  free_day: 7,
};

export function isGradedAssessmentCategory(category: TerminarzCategory): boolean {
  return (
    category === 'exam' ||
    category === 'quiz' ||
    category === 'retake' ||
    category === 'oral'
  );
}

export function isGenericOtherTerminarzEvent(event: TerminarzEvent): boolean {
  if (event.category === 'other') return true;
  if (event.category === 'consultation') {
    const rawLower = (event.rawType || '').trim().toLowerCase();
    if (
      event.shortLabel === 'Inne' ||
      ((rawLower === 'inna' || rawLower === 'inne') &&
        (event.displayType === 'Wydarzenie' || event.displayType === 'Inne'))
    ) {
      return true;
    }
  }
  return false;
}

export function normalizeTerminarzEvent(event: TerminarzEvent): TerminarzEvent {
  if (isGenericOtherTerminarzEvent(event) && event.category !== 'other') {
    return {
      ...event,
      category: 'other',
      displayType:
        event.displayType === 'Wydarzenie' ? 'Inne' : event.displayType,
    };
  }
  return event;
}

/**
 * Standard Librus bell schedule (including Lesson 0 early morning slot 07:10–07:55).
 */
export const DEFAULT_BELL_HOURS: Record<number, { start: string; end: string }> = {
  0: { start: '07:10', end: '07:55' },
  1: { start: '08:00', end: '08:45' },
  2: { start: '08:55', end: '09:40' },
  3: { start: '09:50', end: '10:35' },
  4: { start: '10:45', end: '11:30' },
  5: { start: '11:40', end: '12:25' },
  6: { start: '12:40', end: '13:25' },
  7: { start: '13:35', end: '14:20' },
  8: { start: '14:25', end: '15:10' },
  9: { start: '15:15', end: '16:00' },
  10: { start: '16:05', end: '16:50' },
  11: { start: '16:55', end: '17:40' },
  12: { start: '17:45', end: '18:30' },
  13: { start: '18:35', end: '19:20' },
};

export function getTerminarzColor(category: TerminarzCategory): string {
  return TERMINARZ_COLORS[category] || TERMINARZ_COLORS.consultation;
}

function capitalizeFirst(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function classifyTerminarzType(
  rawType: string,
  description?: string
): {
  category: TerminarzCategory;
  shortLabel: string;
  displayType: string;
} {
  const cleanRaw = (rawType || '').trim();
  const lower = cleanRaw.toLowerCase();
  const descLower = (description || '').trim().toLowerCase();
  const combined = `${lower} ${descLower}`;

  // 1. Retakes ("Poprawa sprawdzianu", "Poprawa kartkówki", "Poprawa")
  if (/\bpopraw(a|ka|y|ę|ie|kowy|kowa|ienie)\b/i.test(combined)) {
    let displayType = 'Poprawa';
    if (combined.includes('sprawdzian') || combined.includes('klasów') || combined.includes('klasow')) {
      displayType = 'Poprawa sprawdzianu';
    } else if (combined.includes('kartków') || combined.includes('kartkow')) {
      displayType = 'Poprawa kartkówki';
    } else if (cleanRaw && lower !== 'inna' && lower !== 'inne') {
      displayType = capitalizeFirst(cleanRaw);
    }
    return {
      category: 'retake',
      shortLabel: 'Popr.',
      displayType,
    };
  }

  // 2. Standalone consultations, meetings, trips, assemblies
  if (lower.includes('konsultacj') || descLower.includes('konsultacj')) {
    return {
      category: 'consultation',
      shortLabel: 'Kons.',
      displayType: 'Konsultacje',
    };
  }

  if (
    lower.includes('zebrani') ||
    lower.includes('spotkani') ||
    descLower.includes('zebranie z rodzicami') ||
    descLower.includes('spotkanie z rodzicami')
  ) {
    return {
      category: 'consultation',
      shortLabel: 'Zebr.',
      displayType:
        cleanRaw && lower !== 'inna' ? capitalizeFirst(cleanRaw) : 'Zebranie',
    };
  }

  if (lower.includes('wycieczk') || descLower.includes('wycieczk')) {
    return {
      category: 'consultation',
      shortLabel: 'Wyc.',
      displayType: 'Wycieczka',
    };
  }

  if (lower.includes('apel') || lower.includes('uroczysto')) {
    return {
      category: 'consultation',
      shortLabel: 'Apel',
      displayType: cleanRaw ? capitalizeFirst(cleanRaw) : 'Apel',
    };
  }

  // 3. Regular subject assessments — inspect `rawType` first so "kartkówka" with "sprawdzian" in description stays quiz
  if (lower.includes('kartków') || lower.includes('kartkow')) {
    return {
      category: 'quiz',
      shortLabel: 'Kartk.',
      displayType: 'Kartkówka',
    };
  }

  if (
    lower.includes('sprawdzian') ||
    lower.includes('klasów') ||
    lower.includes('klasow') ||
    lower.includes('praca klasowa') ||
    lower.includes('egzamin') ||
    lower === 'test' ||
    lower.includes('test ')
  ) {
    return {
      category: 'exam',
      shortLabel: 'Spr.',
      displayType: cleanRaw ? capitalizeFirst(cleanRaw) : 'Sprawdzian',
    };
  }

  if (lower.includes('odpowied')) {
    return {
      category: 'oral',
      shortLabel: 'Odp.',
      displayType: 'Odpowiedź',
    };
  }

  if (
    lower.includes('zadanie') ||
    lower.includes('projekt') ||
    lower.includes('prezentacj') ||
    lower.includes('praca domowa') ||
    ((lower === 'inna' || lower === 'inne') &&
      (descLower.includes('zadanie domowe') ||
        descLower.includes('praca domowa') ||
        descLower.includes('projekt')))
  ) {
    const isProject = combined.includes('projekt');
    return {
      category: 'oral',
      shortLabel: isProject ? 'Proj.' : 'Zad.',
      displayType:
        cleanRaw && lower !== 'inna' && lower !== 'inne'
          ? capitalizeFirst(cleanRaw)
          : isProject
            ? 'Projekt'
            : 'Zadanie domowe',
    };
  }

  // Check description fallback for tests typed under "Inna"
  if (lower === 'inna' || lower === 'inne') {
    if (descLower.includes('kartków') || descLower.includes('kartkow')) {
      return {
        category: 'quiz',
        shortLabel: 'Kartk.',
        displayType: 'Kartkówka',
      };
    }
    if (
      descLower.includes('sprawdzian') ||
      descLower.includes('klasów') ||
      descLower.includes('klasow')
    ) {
      return {
        category: 'exam',
        shortLabel: 'Spr.',
        displayType: 'Sprawdzian',
      };
    }
  }

  return {
    category: 'other',
    shortLabel:
      cleanRaw && lower !== 'inna' && lower !== 'inne'
        ? cleanRaw.slice(0, 6)
        : 'Inne',
    displayType:
      cleanRaw && lower !== 'inna' && lower !== 'inne'
        ? capitalizeFirst(cleanRaw)
        : 'Inne',
  };
}

export function sortTerminarzEvents(events: TerminarzEvent[]): TerminarzEvent[] {
  return events.map(normalizeTerminarzEvent).sort((a, b) => {
    const pDiff =
      (TERMINARZ_PRIORITY[a.category] ?? 99) - (TERMINARZ_PRIORITY[b.category] ?? 99);
    if (pDiff !== 0) return pDiff;
    return (a.lessonNumber || 0) - (b.lessonNumber || 0);
  });
}

export function getDayActionableEvents(events: TerminarzEvent[]): TerminarzEvent[] {
  return sortTerminarzEvents(events.filter((e) => e.category !== 'free_day'));
}

export function getDayPrimaryTerminarzEvent(
  events: TerminarzEvent[] | undefined | null
): TerminarzEvent | null {
  if (!events || events.length === 0) return null;
  const actionable = getDayActionableEvents(events);
  return actionable[0] ?? null;
}

export function normalizeMatchText(raw?: string): string {
  return (raw || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function teachersMatch(lessonTeacher?: string, eventTeacher?: string): boolean {
  const lt = normalizeMatchText(lessonTeacher);
  const et = normalizeMatchText(eventTeacher);
  if (!lt || !et) return false;
  if (lt === et || lt.includes(et) || et.includes(lt)) return true;

  const ltTokens = lt.split(' ').filter((t) => t.length > 1);
  const etTokens = et.split(' ').filter((t) => t.length > 1);
  if (ltTokens.length >= 2 && etTokens.length >= 2) {
    return etTokens.every((tok) => ltTokens.includes(tok));
  }
  return false;
}

export function subjectsMatch(lessonSubject?: string, eventSubject?: string): boolean {
  const ls = normalizeMatchText(lessonSubject);
  const es = normalizeMatchText(eventSubject);
  if (!ls || !es) return false;
  return ls === es || ls.includes(es) || es.includes(ls);
}

/**
 * Checks if a Terminarz event is hidden by single-occurrence ID or by a recurring teacher/type rule.
 */
export function isTerminarzEventHidden(
  rawEvent: TerminarzEvent,
  store?: HiddenTerminarzStore | null
): boolean {
  if (!store) return false;
  const event = normalizeTerminarzEvent(rawEvent);
  if (store.hiddenEventIds.includes(event.id)) return true;

  for (const rule of store.rules) {
    const categoryMatches =
      rule.category === event.category ||
      (event.category === 'other' &&
        rule.category === 'consultation' &&
        (rule.displayType === 'Wydarzenie' || rule.displayType === 'Inne'));
    if (!categoryMatches) continue;
    if (rule.teacher) {
      if (teachersMatch(rule.teacher, event.teacher)) {
        return true;
      }
    } else if (
      normalizeMatchText(rule.displayType) === normalizeMatchText(event.displayType) ||
      (event.category === 'other' &&
        normalizeMatchText(rule.displayType) === 'wydarzenie')
    ) {
      return true;
    }
  }

  return false;
}

export function filterVisibleTerminarzEvents(
  events: TerminarzEvent[],
  store?: HiddenTerminarzStore | null
): TerminarzEvent[] {
  const normalized = events.map(normalizeTerminarzEvent);
  if (!store || (store.hiddenEventIds.length === 0 && store.rules.length === 0)) {
    return normalized;
  }
  return normalized.filter((ev) => !isTerminarzEventHidden(ev, store));
}

export function buildTerminarzRuleId(rawEvent: TerminarzEvent): string {
  const event = normalizeTerminarzEvent(rawEvent);
  const teacherPart = normalizeMatchText(event.teacher) || 'any';
  const typePart = normalizeMatchText(event.displayType) || event.category;
  return `rule-${event.category}-${teacherPart}-${typePart}`;
}

/**
 * For generic "Inna / Inne" notes, connect inside an existing lesson ONLY when the teacher
 * assigned it to a positive lesson number (lessonNumber > 0) that directly matches that
 * timetable lesson's subject (or teacher if subject was omitted). Never auto-adjust from Lesson 0.
 */
function findExactAlignedLessonForOther(
  regularLessons: TimetableLesson[],
  event: TerminarzEvent
): TimetableLesson | null {
  if (event.lessonNumber <= 0) return null;
  const exact = regularLessons.find((l) => l.hourNumber === event.lessonNumber);
  if (!exact) return null;

  if (event.subject) {
    return subjectsMatch(exact.subject, event.subject) ? exact : null;
  }
  if (event.teacher) {
    return teachersMatch(exact.teacher, event.teacher) ? exact : null;
  }
  return null;
}

/**
 * Determines whether an event should render as its own standalone semi-transparent tile
 * (e.g. Konsultacje at Lesson 0 / 07:10, Zebranie at 18:00–19:30, morning/after-hours Poprawa,
 * or an "Inne" note placed at Lesson 0 / unaligned slot) rather than inside a regular class card.
 */
export function shouldRenderAsStandaloneTile(
  rawEvent: TerminarzEvent,
  regularLessons: TimetableLesson[]
): boolean {
  const event = normalizeTerminarzEvent(rawEvent);
  if (event.category === 'free_day') return false;

  // All consultations, parent meetings, trips, assemblies are standalone tiles
  if (event.category === 'consultation') {
    return true;
  }

  // Generic "Inna / Inne" connects inside ONLY when directly aligned with the right lesson (> 0)
  if (event.category === 'other') {
    return findExactAlignedLessonForOther(regularLessons, event) === null;
  }

  // Explicit clock-range events without a regular class match are standalone
  if (event.startTime && event.endTime && event.lessonNumber < 0) {
    return true;
  }

  // Retakes ("Poprawa"): standalone when at Lesson 0 (07:10) or outside existing subject lessons
  if (event.category === 'retake') {
    if (event.lessonNumber <= 0) {
      return true;
    }
    const exactLesson = regularLessons.find((l) => l.hourNumber === event.lessonNumber);
    if (!exactLesson) {
      return true;
    }
    if (event.subject && !subjectsMatch(exactLesson.subject, event.subject)) {
      return true;
    }
  }

  return false;
}

/**
 * Finds the target regular lesson on `day` for an attached assessment/note event,
 * returning both the matched lesson and whether the lesson number had to be auto-adjusted.
 */
export function findTargetLessonForEvent(
  lessons: TimetableLesson[],
  rawEvent: TerminarzEvent
): { lesson: TimetableLesson; autoAdjustedFromLesson?: number } | null {
  if (!lessons || lessons.length === 0) return null;
  const event = normalizeTerminarzEvent(rawEvent);

  if (event.category === 'other') {
    const exactAligned = findExactAlignedLessonForOther(lessons, event);
    return exactAligned ? { lesson: exactAligned } : null;
  }

  if (event.lessonNumber > 0) {
    const exact = lessons.find((l) => l.hourNumber === event.lessonNumber);
    if (exact && (!event.subject || subjectsMatch(exact.subject, event.subject))) {
      return { lesson: exact };
    }
  }

  const orderedLessons = [...lessons].sort((a, b) => a.hourNumber - b.hourNumber);
  const activeLessons = orderedLessons.filter((l) => !l.isCancelled);
  const pool = activeLessons.length > 0 ? activeLessons : orderedLessons;

  let matched: TimetableLesson | undefined;

  if (event.subject) {
    matched =
      pool.find((l) => subjectsMatch(l.subject, event.subject)) ??
      orderedLessons.find((l) => subjectsMatch(l.subject, event.subject));
  }

  if (!matched && event.teacher) {
    matched =
      pool.find((l) => teachersMatch(l.teacher, event.teacher)) ??
      orderedLessons.find((l) => teachersMatch(l.teacher, event.teacher));
  }

  if (!matched) {
    matched = pool[0] ?? orderedLessons[0];
  }

  if (!matched) return null;

  const shouldFlagAutoAdjust =
    (event.category === 'exam' ||
      event.category === 'quiz' ||
      event.category === 'retake') &&
    ((event.lessonNumber > 0 && event.lessonNumber !== matched.hourNumber) ||
      (event.hasExplicitLessonZero && matched.hourNumber !== 0));

  return {
    lesson: matched,
    autoAdjustedFromLesson: shouldFlagAutoAdjust ? event.lessonNumber : undefined,
  };
}

function buildStandaloneLessonTile(
  event: TerminarzEvent,
  bellHours: Record<number, { start: string; end: string }>,
  inferredSubject?: string
): TimetableLesson {
  const hourNum = event.lessonNumber >= 0 ? event.lessonNumber : 0;
  const bell = bellHours[hourNum] ?? DEFAULT_BELL_HOURS[hourNum] ?? DEFAULT_BELL_HOURS[0];
  const startTime = event.startTime || bell.start;
  const endTime = event.endTime || bell.end;
  const subj = event.subject || inferredSubject;
  const enrichedEvent: TerminarzEvent =
    subj && !event.subject ? { ...event, subject: subj } : event;

  const title =
    subj && !normalizeMatchText(event.displayType).includes(normalizeMatchText(subj))
      ? `${event.displayType} · ${subj}`
      : event.displayType;

  return {
    id: `standalone-${event.id}`,
    hourNumber: event.lessonNumber >= 0 ? event.lessonNumber : 0,
    startTime,
    endTime,
    timeSpan: `${startTime} - ${endTime}`,
    subject: title,
    teacher: event.teacher || '',
    classroom: event.classroom || '',
    note: event.description,
    events: [enrichedEvent],
    isStandaloneEvent: true,
  };
}

export function attachTerminarzToDay(
  day: DaySchedule,
  allEvents: TerminarzEvent[],
  knownLessonsForTeacherLookup?: TimetableLesson[]
): DaySchedule {
  const baseLessons = (day.lessons || []).filter((l) => !l.isStandaloneEvent);

  const dayEvents = allEvents
    .filter((e) => e.date === day.date && e.category !== 'free_day')
    .map(normalizeTerminarzEvent);

  if (dayEvents.length === 0) {
    const hadStandalone = (day.lessons || []).length !== baseLessons.length;
    const hadEvents = baseLessons.some((l) => l.events && l.events.length > 0);
    if (!hadStandalone && !hadEvents) return day;
    return {
      ...day,
      lessons: baseLessons.map((l) => {
        if (!l.events) return l;
        const copy = { ...l };
        delete copy.events;
        return copy;
      }),
    };
  }

  // Build bell-hours map enriched by any real lesson times
  const bellHours: Record<number, { start: string; end: string }> = {
    ...DEFAULT_BELL_HOURS,
  };
  const lookupPool = knownLessonsForTeacherLookup ?? baseLessons;
  for (const l of lookupPool) {
    if (!l.isStandaloneEvent && l.hourNumber >= 0 && l.startTime && l.endTime) {
      bellHours[l.hourNumber] = { start: l.startTime, end: l.endTime };
    }
  }

  const inferSubjectForTeacher = (teacherName?: string): string | undefined => {
    if (!teacherName) return undefined;
    const match = lookupPool.find(
      (l) => !l.isStandaloneEvent && l.subject && teachersMatch(l.teacher, teacherName)
    );
    return match?.subject;
  };

  const bucketByLessonId = new Map<string, TerminarzEvent[]>();
  const standaloneTiles: TimetableLesson[] = [];

  for (const ev of dayEvents) {
    if (shouldRenderAsStandaloneTile(ev, baseLessons) || baseLessons.length === 0) {
      const inferredSubj = ev.subject || inferSubjectForTeacher(ev.teacher);
      standaloneTiles.push(buildStandaloneLessonTile(ev, bellHours, inferredSubj));
      continue;
    }

    const matchResult = findTargetLessonForEvent(baseLessons, ev);
    if (!matchResult) continue;

    const { lesson: target, autoAdjustedFromLesson } = matchResult;
    const enrichedEv: TerminarzEvent = {
      ...ev,
      ...(autoAdjustedFromLesson !== undefined ? { autoAdjustedFromLesson } : {}),
      ...(!ev.subject && target.subject && teachersMatch(target.teacher, ev.teacher)
        ? { subject: target.subject }
        : {}),
    };

    const list = bucketByLessonId.get(target.id) ?? [];
    if (!list.some((existing) => existing.id === enrichedEv.id)) {
      list.push(enrichedEv);
    }
    bucketByLessonId.set(target.id, list);
  }

  const updatedRegularLessons = baseLessons.map((lesson) => {
    const assigned = bucketByLessonId.get(lesson.id);
    if (!assigned || assigned.length === 0) {
      if (!lesson.events) return lesson;
      const copy = { ...lesson };
      delete copy.events;
      return copy;
    }
    return {
      ...lesson,
      events: sortTerminarzEvents(assigned),
    };
  });

  if (standaloneTiles.length === 0) {
    return {
      ...day,
      lessons: updatedRegularLessons,
    };
  }

  const combinedLessons = [...standaloneTiles, ...updatedRegularLessons].sort((a, b) => {
    const aStart = parseHM(a.startTime || '08:00');
    const bStart = parseHM(b.startTime || '08:00');
    if (aStart !== bStart) return aStart - bStart;
    return a.hourNumber - b.hourNumber;
  });

  return {
    ...day,
    lessons: combinedLessons,
  };
}

export function attachTerminarzToWeek(
  week: WeekSchedule,
  allEvents: TerminarzEvent[]
): WeekSchedule {
  const allWeekRegularLessons = (week.days || []).flatMap((d) =>
    (d.lessons || []).filter((l) => !l.isStandaloneEvent)
  );
  return {
    ...week,
    days: week.days.map((day) =>
      attachTerminarzToDay(day, allEvents, allWeekRegularLessons)
    ),
  };
}

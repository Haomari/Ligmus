import {
  ActivityFeedItem,
  AttendanceMark,
  LibrusMessageSummary,
  SchoolAnnouncement,
  SubjectGrades,
  TerminarzEvent,
  WeekSchedule,
} from '@/types/librus';
import { getActivityFeedStore, saveActivityFeedStore } from '@/services/fileCache';
import { cleanLibrusPersonName } from '@/services/librusClient';
import { isLessonFreeDay } from '@/services/timetableMapper';
import { cleanFreeDayReason, getTerminarzColor } from '@/utils/terminarzMatcher';
import { parseISODate, toISODate } from '@/utils/dates';

export interface ActivitySyncInput {
  grades?: SubjectGrades[];
  inboxMessages?: LibrusMessageSummary[];
  announcements?: SchoolAnnouncement[];
  attendanceMarks?: AttendanceMark[];
  weeks?: Record<string, WeekSchedule>;
  terminarzEvents?: TerminarzEvent[];
  now?: Date;
}

function gradeAccentColor(val: string): string {
  const clean = (val || '').trim();
  if (clean.startsWith('+')) return '#06b6d4';
  if (clean.startsWith('-')) return '#f97316';
  if (clean.startsWith('6') || clean.startsWith('5')) return '#10b981';
  if (clean.startsWith('4')) return '#3b82f6';
  if (clean.startsWith('3')) return '#f59e0b';
  if (clean.startsWith('2')) return '#ea580c';
  return '#ef4444';
}

function extractDatePart(raw?: string): string {
  if (!raw) return '';
  const match = raw.match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function parseSortableTimestamp(dateOrDateTime: string | undefined, fallbackMs: number): number {
  if (!dateOrDateTime) return fallbackMs;
  const normalized = dateOrDateTime.trim().replace(' ', 'T');
  const parsed = Date.parse(normalized);
  if (!Number.isNaN(parsed)) return parsed;
  const datePart = extractDatePart(dateOrDateTime);
  if (datePart) {
    const dayParsed = Date.parse(`${datePart}T12:00:00`);
    if (!Number.isNaN(dayParsed)) return dayParsed;
  }
  return fallbackMs;
}

const POLISH_WEEKDAY_NAMES = [
  'Niedziela',
  'Poniedziałek',
  'Wtorek',
  'Środa',
  'Czwartek',
  'Piątek',
  'Sobota',
];

function formatDateDMY(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate;
  return `${isoDate.slice(8, 10)}.${isoDate.slice(5, 7)}.${isoDate.slice(0, 4)}`;
}

function formatDateDM(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate;
  return `${isoDate.slice(8, 10)}.${isoDate.slice(5, 7)}`;
}

export function formatFreeDayRangeSubtitle(startDate: string, endDate: string): string {
  if (startDate === endDate) {
    const dt = parseISODate(startDate);
    const weekday = POLISH_WEEKDAY_NAMES[dt.getDay()] || '';
    return weekday
      ? `${formatDateDMY(startDate)} (${weekday})`
      : formatDateDMY(startDate);
  }
  const sameYear = startDate.slice(0, 4) === endDate.slice(0, 4);
  const startLabel = sameYear ? formatDateDM(startDate) : formatDateDMY(startDate);
  return `${startLabel} – ${formatDateDMY(endDate)}`;
}

function daysBetweenIso(startIso: string, endIso: string): number {
  const a = parseISODate(startIso);
  const b = parseISODate(endIso);
  return Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * Reconciles live Librus data with the persistent ActivityFeedStore (`activity_feed.json`).
 *
 * Rules:
 * - If storage has not been seeded yet (first run or cleared cache), all existing IDs are added
 *   to `seenIds` as baseline, and ONLY items occurring/added TODAY (`todayIso`) are added to `items`.
 * - Once seeded, any newly discovered item whose `id` is not in `seenIds` is prepended to `items`
 *   and persisted immediately.
 */
export function reconcileActivityFeed(input: ActivitySyncInput): ActivityFeedItem[] {
  const now = input.now ?? new Date();
  const todayIso = toISODate(now);
  const nowMs = now.getTime();

  const store = getActivityFeedStore();
  const isInitialSeed = !store.seeded;
  const seenSet = new Set(store.seenIds);
  const discovered: ActivityFeedItem[] = [];

  const considerCandidate = (candidate: ActivityFeedItem, candidateCreatedDate: string) => {
    if (seenSet.has(candidate.id)) {
      return;
    }
    seenSet.add(candidate.id);

    if (isInitialSeed) {
      // Fresh install or cleared memory: only populate items that happened TODAY
      if (candidateCreatedDate === todayIso) {
        discovered.push(candidate);
      }
      return;
    }

    discovered.push({
      ...candidate,
      timestamp: nowMs,
    });
  };

  // 1. Grades
  for (const subj of input.grades ?? []) {
    for (const g of subj.grades ?? []) {
      if (!g.id) continue;
      const gDate = extractDatePart(g.date);
      const corrLabel = g.correction ? ` (popr. z ${g.correction.originalValue})` : '';
      const subParts = [
        `${g.category || 'Ocena'}${corrLabel}`,
        g.teacher ? cleanLibrusPersonName(g.teacher) : '',
      ].filter(Boolean);

      considerCandidate(
        {
          id: `grade:${g.id}`,
          kind: 'grade',
          title: subj.subjectName,
          subtitle: subParts.join(' • '),
          badgeText: g.value,
          accentColor: gradeAccentColor(g.value),
          date: gDate || todayIso,
          timestamp: parseSortableTimestamp(g.date, nowMs),
          targetRoute: '/grades',
          targetParams: { subjectId: subj.id, gradeId: g.id },
        },
        gDate
      );
    }
  }

  // 2. Inbox Messages
  for (const msg of input.inboxMessages ?? []) {
    if (!msg.id) continue;
    const mDate = extractDatePart(msg.date || msg.sentAt);
    const sender = cleanLibrusPersonName(msg.sender) || 'Wiadomość';
    considerCandidate(
      {
        id: `msg:${msg.id}`,
        kind: 'message',
        title: msg.subject || 'Nowa wiadomość',
        subtitle: `Od: ${sender}`,
        badgeText: 'Wiad.',
        accentColor: '#38bdf8',
        date: mDate || todayIso,
        timestamp: parseSortableTimestamp(msg.sentAt || msg.date, nowMs),
        targetRoute: '/messages',
        targetParams: { tab: 'inbox', messageId: msg.id },
      },
      mDate
    );
  }

  // 3. School Announcements (Ogłoszenia)
  for (const ann of input.announcements ?? []) {
    if (!ann.id) continue;
    const aDate = extractDatePart(ann.date);
    considerCandidate(
      {
        id: `ann:${ann.id}`,
        kind: 'announcement',
        title: ann.title || 'Ogłoszenie szkolne',
        subtitle: ann.author ? `Ogłoszenie • ${cleanLibrusPersonName(ann.author)}` : 'Ogłoszenie',
        badgeText: 'Ogł.',
        accentColor: '#818cf8',
        date: aDate || todayIso,
        timestamp: parseSortableTimestamp(ann.date, nowMs),
        targetRoute: '/messages',
        targetParams: { tab: 'announcements', announcementId: ann.id },
      },
      aDate
    );
  }

  // 4. Attendance Marks (skip normal "present" so daily lessons don't flood the feed)
  for (const mark of input.attendanceMarks ?? []) {
    if (!mark.id || mark.kind === 'present') continue;
    if (mark.kind !== 'absent' && mark.kind !== 'late' && mark.kind !== 'excused') {
      continue;
    }
    const mkDate = extractDatePart(mark.addedAt) || extractDatePart(mark.date);
    const isAbsent = mark.kind === 'absent';
    const isLate = mark.kind === 'late';
    const kindLabel = isAbsent
      ? 'Nieobecność'
      : isLate
        ? 'Spóźnienie'
        : 'Usprawiedliwiono';
    const color = isAbsent ? '#ef4444' : isLate ? '#f59e0b' : '#3b82f6';
    const lessonPart = mark.hourNumber ? `Lekcja ${mark.hourNumber}` : '';
    const subParts = [kindLabel, lessonPart, mark.date || ''].filter(Boolean);

    considerCandidate(
      {
        id: `att:${mark.id}:${mark.kind}`,
        kind: 'attendance',
        title: mark.subject || kindLabel,
        subtitle: subParts.join(' • '),
        badgeText: (mark.symbol || (isAbsent ? 'NB' : isLate ? 'SP' : 'U')).toUpperCase(),
        accentColor: color,
        date: extractDatePart(mark.date) || mkDate || todayIso,
        timestamp: parseSortableTimestamp(mark.addedAt || mark.date, nowMs),
        targetRoute: '/attendance',
      },
      mkDate
    );
  }

  // Collect all known free school days from Terminarz + Timetable
  const allFreeDayDates = new Set<string>();
  const upcomingFreeDayMap = new Map<
    string,
    { date: string; reason?: string; addedAt?: string; terminarzId?: string }
  >();

  for (const ev of input.terminarzEvents ?? []) {
    if (!ev.date || ev.category !== 'free_day') continue;
    allFreeDayDates.add(ev.date);
    if (ev.date < todayIso) continue;
    const cleanedReason = cleanFreeDayReason(ev.displayType || ev.description);
    const existing = upcomingFreeDayMap.get(ev.date);
    upcomingFreeDayMap.set(ev.date, {
      date: ev.date,
      reason: cleanedReason || existing?.reason,
      addedAt: ev.addedAt || existing?.addedAt,
      terminarzId: ev.id || existing?.terminarzId,
    });
  }

  const weeksList = Object.values(input.weeks ?? {});
  for (const wk of weeksList) {
    for (const day of wk.days ?? []) {
      if (!day.date) continue;
      const regularLessons = (day.lessons ?? []).filter((l) => !l.isStandaloneEvent);
      const dayIsFree =
        Boolean(day.isFreeDay) ||
        (regularLessons.length > 0 &&
          regularLessons.every((l) => Boolean(l.isFreeDay || isLessonFreeDay(l))));
      if (!dayIsFree) continue;

      allFreeDayDates.add(day.date);
      if (day.date < todayIso) continue;

      const existing = upcomingFreeDayMap.get(day.date);
      const dayReason = cleanFreeDayReason(day.freeDayLabel);
      upcomingFreeDayMap.set(day.date, {
        date: day.date,
        reason: existing?.reason || dayReason,
        addedAt: existing?.addedAt,
        terminarzId: existing?.terminarzId,
      });
    }
  }

  // 5. Timetable Changes (Cancelled & Substitutions on today or upcoming NON-free days)
  for (const wk of weeksList) {
    for (const day of wk.days ?? []) {
      if (!day.date || day.date < todayIso) continue;
      // Never emit per-lesson "Odwołane" items on a school free day / holiday
      const isFreeDay = Boolean(day.isFreeDay) || allFreeDayDates.has(day.date);
      for (const lesson of day.lessons ?? []) {
        if (lesson.isStandaloneEvent) continue;
        if (lesson.isCancelled) {
          if (isFreeDay || lesson.isFreeDay || isLessonFreeDay(lesson)) {
            continue;
          }
          considerCandidate(
            {
              id: `plan:${day.date}:${lesson.hourNumber}:${lesson.subject}:cancelled`,
              kind: 'timetable',
              title: `${lesson.subject} — Odwołane`,
              subtitle: `Plan lekcji • ${day.date} (lekcja ${lesson.hourNumber})`,
              badgeText: 'Odwoł.',
              accentColor: '#ef4444',
              date: day.date,
              timestamp: nowMs,
              targetRoute: '/timetable',
              targetParams: { date: day.date },
            },
            day.date === todayIso ? todayIso : ''
          );
        } else if (lesson.isSubstitution && !isFreeDay) {
          const subLabel =
            lesson.changeType === 'room'
              ? 'Zmiana sali'
              : lesson.changeType === 'moved'
                ? 'Przesunięto'
                : 'Zastępstwo';
          considerCandidate(
            {
              id: `plan:${day.date}:${lesson.hourNumber}:${lesson.subject}:sub:${lesson.changeType || 'sub'}`,
              kind: 'timetable',
              title: `${lesson.subject} — ${subLabel}`,
              subtitle: `Plan lekcji • ${day.date} (lekcja ${lesson.hourNumber})`,
              badgeText: 'Zast.',
              accentColor: '#f59e0b',
              date: day.date,
              timestamp: nowMs,
              targetRoute: '/timetable',
              targetParams: { date: day.date },
            },
            day.date === todayIso ? todayIso : ''
          );
        }
      }
    }
  }

  // 5b. Grouped Free School Days (linked to Terminarz dates & holiday reason)
  const sortedFreeDays = Array.from(upcomingFreeDayMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  interface FreeDayRangeGroup {
    startDate: string;
    endDate: string;
    reason?: string;
    addedAt?: string;
    terminarzId?: string;
  }
  const freeDayGroups: FreeDayRangeGroup[] = [];
  for (const entry of sortedFreeDays) {
    const prev = freeDayGroups[freeDayGroups.length - 1];
    const prevNormReason = (prev?.reason || '').trim().toLowerCase();
    const currNormReason = (entry.reason || '').trim().toLowerCase();
    // Merge only consecutive/adjacent school days (<= 3 days apart across weekend) with the same Terminarz reason
    if (
      prev &&
      prevNormReason === currNormReason &&
      daysBetweenIso(prev.endDate, entry.date) <= 3
    ) {
      prev.endDate = entry.date;
      if (!prev.reason && entry.reason) prev.reason = entry.reason;
      if (!prev.addedAt && entry.addedAt) prev.addedAt = entry.addedAt;
      if (!prev.terminarzId && entry.terminarzId) prev.terminarzId = entry.terminarzId;
    } else {
      freeDayGroups.push({
        startDate: entry.date,
        endDate: entry.date,
        reason: entry.reason,
        addedAt: entry.addedAt,
        terminarzId: entry.terminarzId,
      });
    }
  }

  const activeFreeDayRanges: {
    startDate: string;
    endDate: string;
    reason?: string;
    subtitle: string;
    id: string;
  }[] = [];
  for (const group of freeDayGroups) {
    const reasonSlug = (group.reason || 'free')
      .toLowerCase()
      .replace(/\s+/g, '_')
      .slice(0, 40);
    const groupId =
      group.startDate === group.endDate
        ? `free_day:${group.startDate}:${reasonSlug}`
        : `free_day:${group.startDate}:${group.endDate}:${reasonSlug}`;
    const subtitle = formatFreeDayRangeSubtitle(group.startDate, group.endDate);
    activeFreeDayRanges.push({
      startDate: group.startDate,
      endDate: group.endDate,
      reason: group.reason,
      subtitle,
      id: groupId,
    });

    const addedDate = extractDatePart(group.addedAt) || group.startDate;
    const title = 'Dzień wolny od szkoły';

    considerCandidate(
      {
        id: groupId,
        kind: 'terminarz',
        title,
        subtitle,
        badgeText: 'Wolne',
        accentColor: '#ef4444',
        date: group.startDate,
        timestamp: parseSortableTimestamp(group.addedAt || group.startDate, nowMs),
        targetRoute: '/timetable',
        targetParams: {
          date: group.startDate,
          startDate: group.startDate,
          endDate: group.endDate,
          reason: group.reason || '',
          openFreeDayModal: '1',
        },
      },
      addedDate === todayIso || group.startDate === todayIso ? todayIso : addedDate
    );
  }

  // 6. Newly Added Terminarz Tests / Events
  for (const ev of input.terminarzEvents ?? []) {
    if (!ev.id || ev.category === 'free_day') continue;
    const addedDate = extractDatePart(ev.addedAt) || ev.date;
    const titlePrefix = ev.subject ? `${ev.subject} — ${ev.displayType}` : ev.displayType;
    const subParts = [
      `Termin: ${ev.date}`,
      ev.lessonNumber > 0 ? `lekcja ${ev.lessonNumber}` : '',
      ev.description ? ev.description : '',
    ].filter(Boolean);

    considerCandidate(
      {
        id: `term:${ev.id}`,
        kind: 'terminarz',
        title: titlePrefix,
        subtitle: subParts.join(' • '),
        badgeText: ev.shortLabel,
        accentColor: getTerminarzColor(ev.category),
        date: ev.date,
        timestamp: parseSortableTimestamp(ev.addedAt || ev.date, nowMs),
        targetRoute: '/timetable',
        targetParams: { date: ev.date },
      },
      addedDate
    );
  }

  // Sort newly discovered items newest-first
  discovered.sort((a, b) => b.timestamp - a.timestamp);

  // Detect any legacy per-lesson ":cancelled" floods in store.items (e.g. >= 3 cancelled lessons on the same day or on a known free day)
  const storedCancelledCountByDate = new Map<string, number>();
  for (const oldItem of store.items) {
    if (oldItem.id.startsWith('plan:') && oldItem.id.endsWith(':cancelled')) {
      const d = oldItem.date;
      if (d) {
        storedCancelledCountByDate.set(d, (storedCancelledCountByDate.get(d) ?? 0) + 1);
      }
    }
  }

  let purgedOldItems = false;
  const cleanedStoredItems = store.items
    .filter((oldItem) => {
      // Purge legacy per-lesson cancelled cards that belong to a free day or whole-day cancellation
      if (oldItem.id.startsWith('plan:') && oldItem.id.endsWith(':cancelled')) {
        const d = oldItem.date;
        if (allFreeDayDates.has(d) || (storedCancelledCountByDate.get(d) ?? 0) >= 3) {
          purgedOldItems = true;
          return false;
        }
      }
      // Purge older partial free_day cards that are now superseded by a wider/updated FreeDayRangeGroup
      if (oldItem.id.startsWith('free_day:')) {
        const superseded = activeFreeDayRanges.some(
          (r) =>
            r.id !== oldItem.id &&
            oldItem.date >= r.startDate &&
            oldItem.date <= r.endDate
        );
        if (superseded) {
          purgedOldItems = true;
          return false;
        }
      }
      return true;
    })
    .map((oldItem) => {
      if (oldItem.id.startsWith('free_day:')) {
        const matchingRange = activeFreeDayRanges.find(
          (r) =>
            r.id === oldItem.id ||
            (oldItem.date >= r.startDate && oldItem.date <= r.endDate)
        );
        const cleanSub = matchingRange
          ? matchingRange.subtitle
          : oldItem.subtitle.replace(/^Terminarz\s*•\s*/i, '');
        const nextParams: Record<string, string> = {
          ...(oldItem.targetParams ?? {}),
          date: matchingRange?.startDate || oldItem.date,
          startDate: matchingRange?.startDate || oldItem.targetParams?.startDate || oldItem.date,
          endDate: matchingRange?.endDate || oldItem.targetParams?.endDate || oldItem.date,
          reason: matchingRange?.reason || oldItem.targetParams?.reason || '',
          openFreeDayModal: '1',
        };
        if (
          oldItem.title !== 'Dzień wolny od szkoły' ||
          oldItem.subtitle !== cleanSub ||
          oldItem.targetParams?.openFreeDayModal !== '1' ||
          oldItem.targetParams?.reason !== nextParams.reason
        ) {
          purgedOldItems = true;
          return {
            ...oldItem,
            title: 'Dzień wolny od szkoły',
            subtitle: cleanSub,
            targetParams: nextParams,
          };
        }
      }
      return oldItem;
    });

  // Merge with existing stored items (deduplicated by ID), newest-first
  const existingMap = new Map<string, ActivityFeedItem>();
  for (const item of discovered) {
    existingMap.set(item.id, item);
  }
  for (const oldItem of cleanedStoredItems) {
    if (!existingMap.has(oldItem.id)) {
      existingMap.set(oldItem.id, oldItem);
    }
  }

  const mergedItems = Array.from(existingMap.values())
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 150);

  if (
    isInitialSeed ||
    discovered.length > 0 ||
    purgedOldItems ||
    seenSet.size !== store.seenIds.length
  ) {
    saveActivityFeedStore({
      seeded: true,
      seenIds: Array.from(seenSet),
      items: mergedItems,
    });
  }

  return mergedItems;
}

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
import { getTerminarzColor } from '@/utils/terminarzMatcher';
import { toISODate } from '@/utils/dates';

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

  // 5. Timetable Changes (Cancelled & Substitutions on today or upcoming days)
  const weeksList = Object.values(input.weeks ?? {});
  for (const wk of weeksList) {
    for (const day of wk.days ?? []) {
      if (!day.date || day.date < todayIso) continue;
      for (const lesson of day.lessons ?? []) {
        if (lesson.isCancelled) {
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
        } else if (lesson.isSubstitution) {
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

  // Merge with existing stored items (deduplicated by ID), newest-first
  const existingMap = new Map<string, ActivityFeedItem>();
  for (const item of discovered) {
    existingMap.set(item.id, item);
  }
  for (const oldItem of store.items) {
    if (!existingMap.has(oldItem.id)) {
      existingMap.set(oldItem.id, oldItem);
    }
  }

  const mergedItems = Array.from(existingMap.values())
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 150);

  if (isInitialSeed || discovered.length > 0 || seenSet.size !== store.seenIds.length) {
    saveActivityFeedStore({
      seeded: true,
      seenIds: Array.from(seenSet),
      items: mergedItems,
    });
  }

  return mergedItems;
}

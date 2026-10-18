export const POLISH_DAY_NAMES = [
  'Poniedziałek',
  'Wtorek',
  'Środa',
  'Czwartek',
  'Piątek',
  'Sobota',
  'Niedziela',
] as const;

export const POLISH_DAY_SHORT = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb', 'Nd'] as const;

export const POLISH_MONTHS_GENITIVE = [
  'stycznia',
  'lutego',
  'marca',
  'kwietnia',
  'maja',
  'czerwca',
  'lipca',
  'sierpnia',
  'września',
  'października',
  'listopada',
  'grudnia',
] as const;

export const POLISH_MONTHS_SHORT = [
  'sty',
  'lut',
  'mar',
  'kwi',
  'maj',
  'cze',
  'lip',
  'sie',
  'wrz',
  'paź',
  'lis',
  'gru',
] as const;

/**
 * Formats a local Date into "YYYY-MM-DD".
 */
export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Parses a "YYYY-MM-DD" string into a local Date at noon (12:00) to avoid DST boundary shifts.
 */
export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

/**
 * Returns the Monday of the week for a given Date.
 */
export function getMonday(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
  const day = d.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const diffSinceMonday = (day + 6) % 7;
  d.setDate(d.getDate() - diffSinceMonday);
  return d;
}

/**
 * Adds a number of calendar days to a Date.
 */
export function addDays(date: Date, days: number): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Returns the initial school date to open on:
 * - Mon–Fri: returns today
 * - Sat/Sun: returns next Monday
 */
export function getInitialSchoolDate(now: Date = new Date()): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
  const day = d.getDay(); // 0 = Sun, 6 = Sat
  if (day === 6) {
    return addDays(d, 2);
  }
  if (day === 0) {
    return addDays(d, 1);
  }
  return d;
}

/**
 * Returns 0-based school day index (0 = Mon ... 4 = Fri) for a Date. Clamps weekends to 0 (Mon).
 */
export function getSchoolDayIndex(date: Date): number {
  const day = date.getDay(); // 1..5
  if (day >= 1 && day <= 5) return day - 1;
  return 0;
}

/**
 * Parses "HH:MM" (or "H:MM") into minutes from midnight. Returns 0 if invalid.
 */
export function parseHM(hm: string): number {
  if (!hm) return 0;
  const match = hm.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return 0;
  return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
}

/**
 * Formats minutes from midnight into "HH:MM".
 */
export function formatMinutesToHM(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Formats a full Polish header date, e.g. "Poniedziałek, 19 października".
 */
export function formatPolishDayHeader(isoDate: string): string {
  const date = parseISODate(isoDate);
  const dayIndex = (date.getDay() + 6) % 7;
  const dayName = POLISH_DAY_NAMES[dayIndex] ?? '';
  const dayNum = date.getDate();
  const monthName = POLISH_MONTHS_GENITIVE[date.getMonth()] ?? '';
  return `${dayName}, ${dayNum} ${monthName}`;
}

/**
 * Formats a short Polish week range label from Monday ISO date, e.g. "19–23 paź" or "28 wrz – 2 paź".
 */
export function formatWeekRangeLabel(weekStartIso: string): string {
  const mon = parseISODate(weekStartIso);
  const fri = addDays(mon, 4);
  const monDay = mon.getDate();
  const friDay = fri.getDate();
  const monMonth = POLISH_MONTHS_SHORT[mon.getMonth()] ?? '';
  const friMonth = POLISH_MONTHS_SHORT[fri.getMonth()] ?? '';
  if (mon.getMonth() === fri.getMonth()) {
    return `${monDay}–${friDay} ${friMonth}`;
  }
  return `${monDay} ${monMonth} – ${friDay} ${friMonth}`;
}

export const POLISH_DAY_ABBREV_DOT = [
  'pon.',
  'wt.',
  'śr.',
  'czw.',
  'pt.',
  'sob.',
  'niedz.',
] as const;

/**
 * Formats an ISO date into e.g. "2026-09-30 (śr.)" for excuse templates.
 */
export function formatExcuseDayLabel(isoDate: string): string {
  const d = parseISODate(isoDate);
  const dayIndex = (d.getDay() + 6) % 7;
  const abbrev = POLISH_DAY_ABBREV_DOT[dayIndex] ?? '';
  return `${isoDate} (${abbrev})`;
}


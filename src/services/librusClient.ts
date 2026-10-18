import * as SecureStore from 'expo-secure-store';
import {
  AttendanceMark,
  AttendanceStats,
  DaySchedule,
  Grade,
  LessonRealization,
  LibrusAttachment,
  LibrusMessageDetail,
  LibrusMessageSummary,
  MessageFolder,
  MessageRecipient,
  StudentInfo,
  SubjectGrades,
  TimetableLesson,
  WeekSchedule,
} from '@/types/librus';
import {
  POLISH_DAY_NAMES,
  POLISH_DAY_SHORT,
  addDays,
  getInitialSchoolDate,
  getMonday,
  parseISODate,
  toISODate,
} from '@/utils/dates';
import {
  clearAllFileCaches,
  ensureSchoolYearCacheValid,
  getAllCachedWeeks,
  getCachedAttendanceMarks,
  getCachedAttendanceStats,
  getCachedMessageDetail,
  getCachedMessages,
  getCachedRealizations,
  getCachedWeek,
  saveCachedAttendanceMarks,
  saveCachedAttendanceStats,
  saveCachedMessageDetail,
  saveCachedMessages,
  saveCachedRealizations,
  saveCachedWeek,
} from '@/services/fileCache';
import {
  ScrapedAttendanceSummary,
  classifyAttendanceSymbol,
  computeStats,
  mergeAttendanceAndTopics,
} from '@/services/timetableMapper';

const STORAGE_KEYS = {
  CREDENTIALS: 'ligmus_user_credentials',
  COOKIES: 'ligmus_saved_cookies',
  STUDENT_INFO: 'ligmus_student_info',
  GRADES_CACHE: 'ligmus_grades_cache',
};

/**
 * Removes duplicate parenthesized names returned by Librus Synergia, e.g.
 * "Ryczkowska Maria (Ryczkowska Maria) [Nauczyciel]" -> "Ryczkowska Maria [Nauczyciel]"
 */
export function cleanLibrusPersonName(raw?: string): string {
  if (!raw) return '';
  let s = raw.trim().replace(/\s+/g, ' ');
  s = s.replace(/\s*\(([^()]+)\)/g, (match, inner) => {
    const innerClean = inner.trim().toLowerCase();
    const prefixClean = s.split('(')[0].trim().toLowerCase();
    if (
      prefixClean &&
      (prefixClean.includes(innerClean) || innerClean.includes(prefixClean))
    ) {
      return '';
    }
    return match;
  });
  return s.replace(/\s+/g, ' ').trim();
}

function makeBannerHeader() {
  const shiftCharacters = (value: string | number) =>
    String(value)
      .split('')
      .map((character) => String.fromCharCode(character.charCodeAt(0) + 20))
      .join('');
  return `${shiftCharacters(Math.random())}_${shiftCharacters(Date.now())}`;
}

class CookieStore {
  private cookies = new Map<string, string>();

  setFromHeaders(headers: Headers) {
    let rawCookies: string[] = [];
    if (typeof (headers as any).getSetCookie === 'function') {
      rawCookies = (headers as any).getSetCookie();
    } else if (headers.get('set-cookie')) {
      rawCookies = [headers.get('set-cookie')!];
    }

    for (const raw of rawCookies) {
      const parts = raw.split(';')[0].split('=');
      if (parts.length >= 2) {
        const name = parts[0].trim();
        const value = parts.slice(1).join('=').trim();
        if (name) {
          this.cookies.set(name, value);
        }
      }
    }
  }

  getNonDefaultCookiesString(): string {
    const list: string[] = [];
    for (const [name, val] of this.cookies.entries()) {
      list.push(`${name}=${val}`);
    }
    return list.join('; ');
  }

  toJSON(): Record<string, string> {
    const obj: Record<string, string> = {};
    for (const [k, v] of this.cookies.entries()) {
      obj[k] = v;
    }
    return obj;
  }

  fromJSON(obj: Record<string, string>) {
    for (const [k, v] of Object.entries(obj)) {
      this.cookies.set(k, v);
    }
  }

  clear() {
    this.cookies.clear();
  }
}

class LibrusClient {
  private cookieStore = new CookieStore();
  private currentStudent: StudentInfo | null = null;
  private cachedGrades: SubjectGrades[] = [];
  private authenticated: boolean = false;
  private reloginPromise: Promise<boolean> | null = null;

  constructor() {
    this.checkSavedSession();
  }

  private async getStoredData(key: string): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  }

  private async saveStoredData(key: string, val: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(key, val);
    } catch {}
  }

  private async deleteStoredData(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {}
  }

  async checkSavedSession(): Promise<boolean> {
    try {
      const credsRaw = await this.getStoredData(STORAGE_KEYS.CREDENTIALS);
      if (!credsRaw) {
        this.authenticated = false;
        return false;
      }

      this.authenticated = true;

      // Auto-reset school year cache on Sept 1 rollover
      const rolledOver = ensureSchoolYearCacheValid();
      if (rolledOver) {
        this.cachedGrades = [];
        await this.deleteStoredData(STORAGE_KEYS.GRADES_CACHE);
      }

      // Restore cookies if available
      const savedCookies = await this.getStoredData(STORAGE_KEYS.COOKIES);
      if (savedCookies) {
        try {
          this.cookieStore.fromJSON(JSON.parse(savedCookies));
        } catch {}
      }

      // Restore cached student info
      const savedStudent = await this.getStoredData(STORAGE_KEYS.STUDENT_INFO);
      if (savedStudent) {
        try {
          this.currentStudent = JSON.parse(savedStudent);
        } catch {}
      }

      // Restore cached grades
      const savedGrades = await this.getStoredData(STORAGE_KEYS.GRADES_CACHE);
      if (savedGrades) {
        try {
          this.cachedGrades = JSON.parse(savedGrades);
        } catch {}
      }

      return true;
    } catch {
      return false;
    }
  }

  async clearGradesCache(): Promise<void> {
    this.cachedGrades = [];
    await this.deleteStoredData(STORAGE_KEYS.GRADES_CACHE);
  }

  isLoggedIn(): boolean {
    return this.authenticated;
  }

  getCachedStudent(): StudentInfo | null {
    return this.currentStudent;
  }

  getCachedGrades(): SubjectGrades[] {
    return this.cachedGrades;
  }

  private async doFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const headers: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
      ...((options.headers as Record<string, string>) || {}),
    };

    const customCookies = this.cookieStore.getNonDefaultCookiesString();
    if (customCookies) {
      headers['Cookie'] = customCookies;
    }

    const res = await fetch(url, {
      ...options,
      headers,
      credentials: 'include',
    });

    this.cookieStore.setFromHeaders(res.headers);
    return res;
  }

  /**
   * Silently re-authenticate using saved credentials if a session has expired.
   * Uses a single-flight mutex so parallel requests share one OAuth login flow.
   */
  private async reloginWithStoredCredentials(): Promise<boolean> {
    if (this.reloginPromise) {
      return this.reloginPromise;
    }

    this.reloginPromise = (async () => {
      try {
        const credsRaw = await this.getStoredData(STORAGE_KEYS.CREDENTIALS);
        if (!credsRaw) return false;
        const { login, pass } = JSON.parse(credsRaw);
        if (!login || !pass) return false;

        console.log('[LibrusClient] Session expired. Automatically re-logging in...');
        const res = await this.performOAuthLogin(login, pass);
        return res.success;
      } catch (err) {
        console.warn('[LibrusClient] Silent relogin failed:', err);
        return false;
      } finally {
        this.reloginPromise = null;
      }
    })();

    return this.reloginPromise;
  }

  /**
   * Core OAuth login sequence without recursive data fetches
   */
  private async performOAuthLogin(
    login: string,
    pass: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      this.cookieStore.clear();

      // Step 1: Initial redirect request
      const r1 = await this.doFetch('https://synergia.librus.pl/loguj/portalRodzina', {
        headers: { Referer: 'https://portal.librus.pl/' },
      });

      const authUrl =
        r1.url && r1.url.includes('OAuth')
          ? r1.url
          : r1.headers.get('location') || 'https://api.librus.pl/OAuth/Authorization?client_id=46';

      // Step 2: Open login page
      let loginPageUrl = authUrl;
      if (!authUrl.includes('OAuth')) {
        const r2 = await this.doFetch(authUrl, {
          headers: { Referer: 'https://synergia.librus.pl/loguj/portalRodzina' },
        });
        loginPageUrl =
          r2.url ||
          (r2.headers.get('location') ? new URL(r2.headers.get('location')!, authUrl).toString() : authUrl);
      }

      // Step 3: POST credentials
      const formBody = new URLSearchParams({
        action: 'login',
        login: login,
        pass: pass,
      });

      const r3 = await this.doFetch(loginPageUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest',
          Accept: 'application/json, text/javascript, */*; q=0.01',
          'x-baner': makeBannerHeader(),
          Referer: loginPageUrl,
          Origin: 'https://api.librus.pl',
        },
        body: formBody.toString(),
      });

      const loginJson = await r3.json().catch(() => null);

      if (!loginJson || (!loginJson.goTo && !r3.headers.get('location'))) {
        const rawErr = loginJson?.errors?.[0];
        const errorText =
          typeof rawErr === 'string'
            ? rawErr
            : rawErr?.message || rawErr?.code || (rawErr ? JSON.stringify(rawErr) : 'Niepoprawny login lub hasło');
        return {
          success: false,
          error: errorText,
        };
      }

      let nextTarget = r3.headers.get('location') || loginJson.goTo;
      let currentUrl = nextTarget.startsWith('http')
        ? nextTarget
        : `https://api.librus.pl${nextTarget}`;

      // Step 4: Follow continuation chain and handle intermediate requiredActions
      for (let hop = 0; hop < 10; hop++) {
        const hopRes = await this.doFetch(currentUrl, {
          headers: { Referer: loginPageUrl },
        });

        const finalUrl = hopRes.url || currentUrl;
        const bodyText = await hopRes.text().catch(() => '');

        // Handle intermediate requiredActions (such as leakedPasswordChangeAdvised)
        if (bodyText.includes('requiredActions')) {
          const skipRes = await this.doFetch(finalUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'X-Requested-With': 'XMLHttpRequest',
              Referer: finalUrl,
              Origin: 'https://api.librus.pl',
            },
            body: new URLSearchParams({ action: 'requiredActions', skip: 'true' }).toString(),
          });

          const skipJson = await skipRes.json().catch(() => null);
          if (skipJson && skipJson.goTo) {
            currentUrl = skipJson.goTo.startsWith('http')
              ? skipJson.goTo
              : `https://api.librus.pl${skipJson.goTo}`;
            continue;
          }
        }

        if (
          finalUrl.includes('synergia.librus.pl') ||
          (hopRes.headers.get('location') && hopRes.headers.get('location')!.includes('synergia.librus.pl'))
        ) {
          break;
        }

        if (hopRes.headers.get('location')) {
          const loc = hopRes.headers.get('location')!;
          currentUrl = loc.startsWith('http') ? loc : new URL(loc, currentUrl).toString();
        } else {
          break;
        }
      }

      this.authenticated = true;
      await this.saveStoredData(
        STORAGE_KEYS.CREDENTIALS,
        JSON.stringify({ login, pass })
      );
      await this.saveStoredData(
        STORAGE_KEYS.COOKIES,
        JSON.stringify(this.cookieStore.toJSON())
      );

      return { success: true };
    } catch (err: any) {
      const errMsg =
        typeof err === 'string'
          ? err
          : err?.message || err?.code || (err ? JSON.stringify(err) : 'Błąd połączenia z serwerem Synergia');
      return {
        success: false,
        error: errMsg,
      };
    }
  }

  /**
   * Log into Librus directly using verified OAuth flow
   */
  async login(
    login: string,
    pass: string
  ): Promise<{ success: boolean; error?: string }> {
    const res = await this.performOAuthLogin(login, pass);
    if (res.success) {
      await this.getStudentInfo();
    }
    return res;
  }

  async logout(): Promise<void> {
    this.cookieStore.clear();
    this.currentStudent = null;
    this.cachedGrades = [];
    this.authenticated = false;
    clearAllFileCaches();
    await this.deleteStoredData(STORAGE_KEYS.CREDENTIALS);
    await this.deleteStoredData(STORAGE_KEYS.COOKIES);
    await this.deleteStoredData(STORAGE_KEYS.STUDENT_INFO);
    await this.deleteStoredData(STORAGE_KEYS.GRADES_CACHE);
  }

  async getStudentInfo(): Promise<StudentInfo | null> {
    const credsRaw = await this.getStoredData(STORAGE_KEYS.CREDENTIALS);
    if (!credsRaw) {
      return null;
    }

    const fetchInfo = async (): Promise<StudentInfo | null> => {
      const res = await this.doFetch('https://synergia.librus.pl/informacja');
      const html = await res.text();

      if (this.isSessionExpired(res, html)) {
        return null;
      }

      const parseRow = (label: string) => {
        const regex = new RegExp(
          `<tr[^>]*>\\s*<th[^>]*>\\s*${label}\\s*<\\/th>\\s*<td[^>]*>([\\s\\S]*?)<\\/td>`,
          'i'
        );
        const match = html.match(regex);
        if (!match) return null;
        return match[1].replace(/<[^>]+>/g, '').replace(/&nbsp;?/g, ' ').trim();
      };

      const name =
        parseRow('Imię i nazwisko ucznia') ||
        parseRow('Imię i nazwisko użytkownika') ||
        '';
      if (!name) return null;

      const classGroup = parseRow('Klasa') || '';
      const studentNumStr = parseRow('Nr w dzienniku') || '0';
      const educator = parseRow('Wychowawca') || '';

      // Fetch lucky number from uczen_index
      let luckyNumber = 0;
      try {
        const uczenRes = await this.doFetch('https://synergia.librus.pl/uczen_index');
        const uczenHtml = await uczenRes.text();
        const luckyMatch = uczenHtml.match(/class="[^"]*luckyNumber[^"]*"[^>]*>.*?(\d+)/s);
        if (luckyMatch) {
          luckyNumber = parseInt(luckyMatch[1], 10);
        }
      } catch {}

      const studentNumber = parseInt(studentNumStr, 10) || 0;

      const student: StudentInfo = {
        name,
        classGroup,
        indexNumber: studentNumStr,
        educator,
        luckyNumber,
        studentNumber,
      };

      this.currentStudent = student;
      await this.saveStoredData(STORAGE_KEYS.STUDENT_INFO, JSON.stringify(student));
      return student;
    };

    try {
      let student = await fetchInfo();
      // If session expired, auto re-login and retry
      if (!student) {
        const relogged = await this.reloginWithStoredCredentials();
        if (relogged) {
          student = await fetchInfo();
        }
      }
      return student || this.currentStudent;
    } catch {
      return this.currentStudent;
    }
  }

  async getGrades(): Promise<SubjectGrades[]> {
    const credsRaw = await this.getStoredData(STORAGE_KEYS.CREDENTIALS);
    if (!credsRaw) {
      return [];
    }

    const fetchGradesHtml = async (): Promise<SubjectGrades[] | null> => {
      const res = await this.doFetch('https://synergia.librus.pl/przegladaj_oceny/uczen');
      const html = await res.text();

      if (this.isSessionExpired(res, html)) {
        return null;
      }

      const subjects: SubjectGrades[] = [];
      const trMatches =
        html.match(/<tr(?![^>]*\bname="przedmioty_all")[^>]*class="[^"]*line[01][^"]*"[^>]*>[\s\S]*?<\/tr>/gi) || [];

      let idCounter = 1;

      for (const row of trMatches) {
        const tdMatches = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
        if (tdMatches.length < 10) continue;

        const subjectName = tdMatches[1].replace(/<[^>]+>/g, '').trim();
        if (!subjectName || subjectName === 'K' || subjectName.toLowerCase() === 'zachowanie') continue;

        const grades: Grade[] = [];

        const parseGradeBox = (spanHtml: string, semesterNum: 1 | 2): Grade | null => {
          const valMatch = spanHtml.match(/>\s*([^<>]+?)\s*<\/a>/i);
          if (!valMatch) return null;
          const val = valMatch[1].trim().replace(/\*+$/, '');
          if (!val) return null;

          const hrefMatch = spanHtml.match(/href="[^"]*\/(\d+)"/i);
          const gradeId = hrefMatch ? hrefMatch[1] : `gen-${idCounter++}`;

          const titleMatch = spanHtml.match(/title="([^"]*)"/i);
          const title = titleMatch
            ? titleMatch[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
            : '';

          const getField = (field: string) => {
            const m = title.match(new RegExp(`${field}:\\s*([^<]+)`, 'i'));
            return m ? m[1].trim() : '';
          };

          const category = getField('Kategoria') || 'Bieżąca';
          const dateRaw = getField('Data');
          const date = dateRaw ? dateRaw.split(' ')[0] : new Date().toISOString().split('T')[0];
          const teacher = getField('Nauczyciel') || undefined;
          const weightStr = getField('Waga');
          const weight = weightStr ? parseFloat(weightStr) || 1 : 1;
          const comment = getField('Komentarz') || undefined;
          const countsRaw = getField('Licz do średniej');
          const countsToAverage = countsRaw ? countsRaw.toLowerCase().startsWith('tak') : true;

          const correctionMatch = title.match(/Poprawa oceny:\s*([^\s(<]+)/i);
          const correctionOf = correctionMatch ? correctionMatch[1].trim() : undefined;

          return {
            id: gradeId,
            value: val,
            numericValue: parseFloat(val) || 0,
            weight,
            category,
            date,
            teacher,
            comment,
            semester: semesterNum,
            countsToAverage,
            correction: correctionOf ? { originalValue: correctionOf } : undefined,
          };
        };

        const parseSemester = (tdHtml: string, semesterNum: 1 | 2) => {
          // Identify bracketed groups: <span>\s*\[([\s\S]*?)\]\s*<\/span>
          const bracketRegex = /<span>\s*\[([\s\S]*?)\]\s*<\/span>/gi;
          let bracketMatch: RegExpExecArray | null;
          const processedSpans = new Set<string>();

          while ((bracketMatch = bracketRegex.exec(tdHtml)) !== null) {
            const groupContent = bracketMatch[1];
            const boxMatches = [
              ...groupContent.matchAll(/<span\b[^>]*class="[^"]*grade-box[^"]*"[\s\S]*?<\/span>/gi),
            ].map((m) => m[0]);

            if (boxMatches.length >= 2) {
              const parsedBoxes = boxMatches
                .map((b) => parseGradeBox(b, semesterNum))
                .filter((g): g is Grade => g !== null);

              if (parsedBoxes.length >= 2) {
                boxMatches.forEach((b) => processedSpans.add(b));
                const finalGrade = parsedBoxes[parsedBoxes.length - 1];
                const priorAttempts = parsedBoxes.slice(0, parsedBoxes.length - 1);

                finalGrade.correction = {
                  originalValue: priorAttempts[0].value,
                  originalDate: priorAttempts[0].date,
                  originalTeacher: priorAttempts[0].teacher,
                  originalGradeId: priorAttempts[0].id,
                  attempts: priorAttempts.map((p) => ({
                    value: p.value,
                    date: p.date,
                    teacher: p.teacher,
                    gradeId: p.id,
                  })),
                };
                grades.push(finalGrade);
              }
            }
          }

          const allSpans = [
            ...tdHtml.matchAll(/<span\b[^>]*class="[^"]*grade-box[^"]*"[\s\S]*?<\/span>/gi),
          ].map((m) => m[0]);

          for (const span of allSpans) {
            if (processedSpans.has(span)) continue;

            const g = parseGradeBox(span, semesterNum);
            if (!g) continue;
            grades.push(g);
          }
        };

        parseSemester(tdMatches[2], 1);
        parseSemester(tdMatches[5], 2);

        const parseAvg = (td: string | undefined) => {
          const text = (td || '').replace(/<[^>]+>/g, '').trim();
          const num = parseFloat(text);
          return isNaN(num) ? null : num;
        };

        const averageSem1 = parseAvg(tdMatches[3]);
        const averageSem2 = parseAvg(tdMatches[6]);
        const yearAverage = parseAvg(tdMatches[8]);

        subjects.push({
          id: `subj-${idCounter++}`,
          subjectName,
          averageSem1,
          averageSem2,
          yearAverage,
          grades,
        });
      }

      if (subjects.length === 0) {
        return null;
      }

      this.cachedGrades = subjects;
      await this.saveStoredData(STORAGE_KEYS.GRADES_CACHE, JSON.stringify(subjects));
      return subjects;
    };

    try {
      let subjects = await fetchGradesHtml();
      // If session expired, auto re-login and retry
      if (!subjects) {
        const relogged = await this.reloginWithStoredCredentials();
        if (relogged) {
          subjects = await fetchGradesHtml();
        }
      }
      return (subjects && subjects.length > 0) ? subjects : this.cachedGrades;
    } catch {
      return this.cachedGrades;
    }
  }

  private decodeHtml(raw: string): string {
    return raw
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;?/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#0?39;|&apos;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&ndash;/gi, '–')
      .replace(/&mdash;/gi, '—')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private isSessionExpired(res: Response, html: string): boolean {
    const url = (res.url || '').toLowerCase();
    if (
      url.includes('login') ||
      url.includes('loguj') ||
      url.includes('oauth') ||
      url.includes('niezalogowany') ||
      url.includes('/blad')
    ) {
      console.warn('[isSessionExpired] Session expired: redirected to login/error URL:', url);
      return true;
    }
    if (
      html.includes('action="login"') ||
      html.includes('Zaloguj do systemu') ||
      html.includes('Sesja wygasła') ||
      html.includes('Brak dostępu') ||
      html.includes('Nie jesteś zalogowany') ||
      html.includes('loguj/portalRodzina')
    ) {
      console.warn('[isSessionExpired] Session expired: page contains login/expired string');
      return true;
    }
    const hasAuthMarker =
      /wyloguj/i.test(html) ||
      html.includes('uczen_index') ||
      html.includes('plan_lekcji') ||
      html.includes('plan-lekcji') ||
      html.includes('przegladaj_plan_lekcji') ||
      html.includes('przegladaj_oceny') ||
      html.includes('przegladaj_nb') ||
      html.includes('user-section') ||
      html.includes('wiadomosci');
    if (!hasAuthMarker) {
      console.warn('[isSessionExpired] Session expired: missing authenticated markers. html snippet:', html.slice(0, 200));
      return true;
    }
    return false;
  }

  getCachedWeeksMap(): Record<string, WeekSchedule> {
    return getAllCachedWeeks();
  }

  getCachedWeekSchedule(weekStartIso: string): WeekSchedule | null {
    return getCachedWeek(weekStartIso);
  }

  getCachedAttendanceStatsSync(): AttendanceStats | null {
    return getCachedAttendanceStats();
  }

  /**
   * Scrapes a week's timetable from https://synergia.librus.pl/przegladaj_plan_lekcji
   * and merges cached or live attendance + lesson realizations.
   */
  async getWeek(weekStartIso?: string): Promise<WeekSchedule | null> {
    const credsRaw = await this.getStoredData(STORAGE_KEYS.CREDENTIALS);
    if (!credsRaw) {
      return null;
    }

    const now = new Date();
    const requestedMondayDate = getMonday(
      weekStartIso ? parseISODate(weekStartIso) : getInitialSchoolDate(now)
    );
    const requestedMondayIso = toISODate(requestedMondayDate);
    const requestedSundayIso = toISODate(addDays(requestedMondayDate, 6));

    const parseTimetableFromHtml = (
      html: string,
      fallbackMondayDate: Date
    ): WeekSchedule | null => {
      // 1. Detect if HTML specifies the exact week range in <select name="tydzien">
      let effectiveMondayDate = fallbackMondayDate;
      const selectOptMatch =
        html.match(/<option\b[^>]*value=["'](\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})["'][^>]*selected/i) ||
        html.match(/<option\b[^>]*selected[^>]*value=["'](\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})["']/i);
      if (selectOptMatch && selectOptMatch[1]) {
        effectiveMondayDate = getMonday(parseISODate(selectOptMatch[1]));
      }

      const effectiveMondayIso = toISODate(effectiveMondayDate);

      const days: DaySchedule[] = Array.from({ length: 5 }, (_, idx) => {
        const d = addDays(effectiveMondayDate, idx);
        return {
          dayId: idx + 1,
          dayName: POLISH_DAY_NAMES[idx],
          shortName: POLISH_DAY_SHORT[idx],
          date: toISODate(d),
          lessons: [],
        };
      });

      const parseTextBlock = (blockHtml: string) => {
        const subjMatch = blockHtml.match(/<b\b[^>]*>([\s\S]*?)<\/b>/i);
        const subject = subjMatch ? this.decodeHtml(subjMatch[1]) : this.decodeHtml(blockHtml);

        let teacher = '';
        let classroom = '';

        const afterBold = subjMatch
          ? blockHtml.slice((subjMatch.index ?? 0) + subjMatch[0].length)
          : blockHtml;
        const brParts = afterBold.split(/<br\s*\/?>/i);
        const tailRaw = brParts.length > 1 ? brParts.slice(1).join(' ') : afterBold;
        let tail = this.decodeHtml(tailRaw).replace(/^[-–—]\s*/, '').trim();

        const roomMatch = tail.match(/^(.*?)\s+(?:s\.|sala)\s*([^\s,]+.*)$/i);
        if (roomMatch) {
          teacher = roomMatch[1].replace(/^[-–—]\s*/, '').trim();
          classroom = roomMatch[2].trim();
        } else if (/^(?:s\.|sala)\s+/i.test(tail)) {
          classroom = tail.replace(/^(?:s\.|sala)\s+/i, '').trim();
        } else {
          teacher = tail;
        }

        return { subject, teacher, classroom };
      };

      // Extract outer cells from a <tr> row without breaking on nested tables
      const extractOuterCells = (rowHtml: string): string[] => {
        const cells: string[] = [];
        let depth = 0;
        let inCell = false;
        let cellStart = 0;
        const tagRegex = /<\/?(?:table|td|th)\b[^>]*>/gi;
        let match: RegExpExecArray | null;

        while ((match = tagRegex.exec(rowHtml)) !== null) {
          const tag = match[0].toLowerCase();
          if (tag.startsWith('<table')) {
            depth++;
          } else if (tag.startsWith('</table')) {
            if (depth > 0) depth--;
          } else if (tag.startsWith('<td') || tag.startsWith('<th')) {
            if (depth === 0 && !inCell) {
              inCell = true;
              cellStart = match.index;
            }
          } else if (tag.startsWith('</td') || tag.startsWith('</th')) {
            if (depth === 0 && inCell) {
              inCell = false;
              const cellRaw = rowHtml.substring(cellStart, match.index + match[0].length);
              const inner = cellRaw.replace(/^<[a-z0-9]+\b[^>]*>/i, '').replace(/<\/[a-z0-9]+>$/i, '');
              cells.push(inner);
            }
          }
        }
        if (cells.length < 5) {
          return [...rowHtml.matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)].map((m) => m[1]);
        }
        return cells;
      };

      // Extract all timetable lesson rows directly from the HTML
      // A timetable lesson row is any <tr> row containing a lesson time range (e.g. 08:00 - 08:45, 8:00<br>-<br>8:45)
      const extractTimetableRowsFromHtml = (fullHtml: string): string[] => {
        const rows: string[] = [];
        const trStarts: number[] = [];
        const trRegex = /<tr\b[^>]*>/gi;
        let m: RegExpExecArray | null;
        while ((m = trRegex.exec(fullHtml)) !== null) {
          trStarts.push(m.index);
        }

        for (let i = 0; i < trStarts.length; i++) {
          const startIdx = trStarts[i];
          let depth = 0;
          let endIdx = -1;
          const tagRegex = /<\/?tr\b[^>]*>/gi;
          tagRegex.lastIndex = startIdx;
          let tagMatch: RegExpExecArray | null;
          while ((tagMatch = tagRegex.exec(fullHtml)) !== null) {
            if (tagMatch[0].toLowerCase().startsWith('<tr')) {
              depth++;
            } else {
              depth--;
              if (depth === 0) {
                endIdx = tagMatch.index + tagMatch[0].length;
                break;
              }
            }
          }

          if (endIdx !== -1) {
            const rowChunk = fullHtml.substring(startIdx, endIdx);
            const clean = rowChunk.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ');
            if (/(\d{1,2}:\d{2})[^\d]*?(\d{1,2}:\d{2})/.test(clean)) {
              rows.push(rowChunk);
            }
          }
        }

        if (rows.length === 0) {
          console.log('[Timetable Parser] Tag-depth parser found 0 time rows. Trying standard <tr>...</tr> regex...');
          const simpleTrs = [...fullHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
          for (const sm of simpleTrs) {
            const clean = sm[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ');
            if (/(\d{1,2}:\d{2})[^\d]*?(\d{1,2}:\d{2})/.test(clean)) {
              rows.push(sm[0]);
            }
          }
        }

        console.log(`[Timetable Parser] extractTimetableRowsFromHtml found ${rows.length} rows (out of ${trStarts.length} total <tr> tags)`);
        return rows;
      };

      const rowMatches = extractTimetableRowsFromHtml(html);
      if (rowMatches.length === 0) {
        console.warn('[Timetable Parser] No rows matching lesson times found! Page info:', {
          htmlLen: html.length,
          hasPlanLekcjiClass: html.includes('plan-lekcji'),
          hasDecoratedTable: html.includes('decorated'),
          foundTimes: html.match(/\b\d{1,2}:\d{2}\b/g)?.slice(0, 10),
          snippet: html.slice(0, 400),
        });
        return null;
      }

      for (const rowHtml of rowMatches) {
        const cleanRow = this.decodeHtml(rowHtml).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ');
        const timeMatch = cleanRow.match(/(\d{1,2}:\d{2})[^\d]*?(\d{1,2}:\d{2})/);
        if (!timeMatch) continue;

        const padHM = (hm: string) => {
          const [h, m] = hm.split(':');
          return `${h.padStart(2, '0')}:${m}`;
        };
        const startTime = padHM(timeMatch[1]);
        const endTime = padHM(timeMatch[2]);
        const timeSpan = `${startTime} - ${endTime}`;

        const cells = extractOuterCells(rowHtml);
        if (cells.length < 5) continue;

        // Find cell containing the hour number (e.g. 1, 2, 0)
        let hourNumber = NaN;
        let dayCells: string[] = [];

        for (let cIdx = 0; cIdx < Math.min(cells.length, 3); cIdx++) {
          const cleanCell = this.decodeHtml(cells[cIdx]).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').trim();
          const intVal = parseInt(cleanCell, 10);
          if (!isNaN(intVal) && intVal >= 0 && intVal <= 20 && isNaN(hourNumber) && cleanCell === String(intVal)) {
            hourNumber = intVal;
            break;
          }
        }

        if (isNaN(hourNumber)) {
          const intMatch =
            rowHtml.match(/<td\b[^>]*>\s*(\d{1,2})\s*<\/td>/i) ||
            rowHtml.match(/<th\b[^>]*>\s*(\d{1,2})\s*<\/th>/i);
          hourNumber = intMatch ? parseInt(intMatch[1], 10) : 1;
        }

        if (cells.length >= 7) {
          dayCells = cells.slice(2, 7);
        } else {
          dayCells = cells.slice(-5);
        }

        if (dayCells.length < 5) continue;

        for (let dayIdx = 0; dayIdx < 5; dayIdx++) {
          const cellHtml = dayCells[dayIdx];
          if (!cellHtml || !cellHtml.trim()) continue;

          // Extract any .plan-lekcji-info flags (e.g. "odwołane", "zastępstwo", "przesunięcie")
          const flagMatches = [
            ...cellHtml.matchAll(
              /<(?:div|span|a)\b[^>]*class="[^"]*plan-lekcji-info[^"]*"[^>]*>([\s\S]*?)<\/(?:div|span|a)>/gi
            ),
          ]
            .map((m) => this.decodeHtml(m[1]))
            .filter(Boolean);
          const flagText = flagMatches.join(', ');
          const flagLower = flagText.toLowerCase();

          // Find struck ranges
          const struckRanges: Array<[number, number]> = [];
          for (const sMatch of cellHtml.matchAll(/<(?:s|strike)\b[^>]*>[\s\S]*?<\/(?:s|strike)>/gi)) {
            if (sMatch.index != null) {
              struckRanges.push([sMatch.index, sMatch.index + sMatch[0].length]);
            }
          }

          const entries: Array<{
            subject: string;
            teacher: string;
            classroom: string;
            struck: boolean;
          }> = [];

          // 1. Check for <div class="text"> or <span class="text">
          for (const divMatch of cellHtml.matchAll(
            /<(?:div|span)\b[^>]*class="[^"]*\btext\b[^"]*"[^>]*>([\s\S]*?)<\/(?:div|span)>/gi
          )) {
            const inner = divMatch[1];
            const pos = divMatch.index ?? 0;
            const isInsideS =
              struckRanges.some(([sStart, sEnd]) => pos >= sStart && pos < sEnd) ||
              /<(?:s|strike)\b[^>]*>/i.test(inner);
            const parsed = parseTextBlock(inner);
            if (parsed.subject) {
              entries.push({ ...parsed, struck: isInsideS });
            }
          }

          // 2. If no .text found, check for <b>Subject</b> directly
          if (entries.length === 0) {
            for (const bMatch of cellHtml.matchAll(/<b\b[^>]*>([\s\S]*?)<\/b>/gi)) {
              const bSubj = this.decodeHtml(bMatch[1]).trim();
              if (bSubj && !/^(?:s\.|sala|nr)\b/i.test(bSubj)) {
                const bPos = bMatch.index ?? 0;
                const post = cellHtml.slice(bPos + bMatch[0].length).split(/<b\b/i)[0];
                const isInsideS =
                  struckRanges.some(([sStart, sEnd]) => bPos >= sStart && bPos < sEnd) ||
                  /<(?:s|strike)\b[^>]*>/i.test(bMatch[0]);
                const parsed = parseTextBlock(`<b>${bSubj}</b>${post}`);
                if (parsed.subject) {
                  entries.push({ ...parsed, struck: isInsideS });
                }
              }
            }
          }

          if (entries.length === 0) continue;

          const activeEntry = entries.find((e) => !e.struck);
          const struckEntry = entries.find((e) => e.struck);
          const primary = activeEntry || struckEntry!;

          const isCancelled =
            !activeEntry ||
            flagLower.includes('odwołan') ||
            flagLower.includes('odwolan');

          const hasOriginal = Boolean(activeEntry && struckEntry);
          const isSubstitution =
            !isCancelled &&
            (hasOriginal ||
              flagLower.includes('zastępstw') ||
              flagLower.includes('zastepstw') ||
              flagLower.includes('przesuni') ||
              flagLower.includes('zmian'));

          let changeType: 'substitution' | 'room' | 'moved' | null = null;
          if (!isCancelled && isSubstitution) {
            if (flagLower.includes('przesuni')) {
              changeType = 'moved';
            } else if (
              struckEntry &&
              activeEntry &&
              struckEntry.subject === activeEntry.subject &&
              struckEntry.teacher === activeEntry.teacher &&
              struckEntry.classroom !== activeEntry.classroom
            ) {
              changeType = 'room';
            } else {
              changeType = 'substitution';
            }
          }

          const dayIso = days[dayIdx].date;
          const lesson: TimetableLesson = {
            id: `${dayIso}-${hourNumber}`,
            hourNumber,
            startTime,
            endTime,
            timeSpan,
            subject: primary.subject,
            teacher: primary.teacher,
            classroom: primary.classroom,
            isCancelled: isCancelled || undefined,
            isSubstitution: isSubstitution || undefined,
            changeType,
            original:
              hasOriginal && struckEntry
                ? {
                    subject: struckEntry.subject,
                    teacher: struckEntry.teacher,
                    classroom: struckEntry.classroom,
                  }
                : undefined,
            note: flagText || undefined,
          };

          days[dayIdx].lessons.push(lesson);
        }
      }

      const totalLessons = days.reduce((sum, d) => sum + d.lessons.length, 0);
      console.log(`[Timetable Parser] Parsed totalLessons=${totalLessons} across days:`, days.map(d => `${d.shortName}:${d.lessons.length}`).join(', '));
      if (totalLessons === 0) {
        return null;
      }

      for (const day of days) {
        day.lessons.sort((a, b) => a.hourNumber - b.hourNumber);
      }

      const rawWeek: WeekSchedule = {
        weekStart: effectiveMondayIso,
        days,
        fetchedAt: Date.now(),
      };

      const cachedMarks = getCachedAttendanceMarks() ?? [];
      const cachedReal = getCachedRealizations() ?? [];
      const merged = mergeAttendanceAndTopics(rawWeek, cachedMarks, cachedReal);
      saveCachedWeek(merged);
      return merged;
    };

    const fetchWeekFromLibrus = async (): Promise<WeekSchedule | null> => {
      console.log(`[librusClient getWeek] Fetching default week via GET https://synergia.librus.pl/przegladaj_plan_lekcji (requested: ${requestedMondayIso})`);
      const getRes = await this.doFetch('https://synergia.librus.pl/przegladaj_plan_lekcji');
      const getHtml = await getRes.text();
      const isExpired = this.isSessionExpired(getRes, getHtml);
      console.log(`[librusClient getWeek] GET status: ${getRes.status}, length: ${getHtml.length}, isExpired: ${isExpired}`);

      if (isExpired) {
        return null;
      }

      // Parse active week returned by GET
      const activeWeekSchedule = parseTimetableFromHtml(getHtml, requestedMondayDate);
      console.log(`[librusClient getWeek] activeWeekSchedule: ${activeWeekSchedule?.weekStart ?? 'null'}, totalLessons: ${activeWeekSchedule?.days.reduce((s, d) => s + d.lessons.length, 0) ?? 0}`);

      // If requested week matches what GET returned, or if no week was requested, return it directly
      if (activeWeekSchedule && activeWeekSchedule.weekStart === requestedMondayIso) {
        return activeWeekSchedule;
      }

      // Extract CSRF or form key if present in the page
      const rkMatch = getHtml.match(/<input\b[^>]*name=["']requestkey["'][^>]*value=["']([^"']+)["']/i);
      const requestKey = rkMatch ? rkMatch[1] : '';

      // 2. Fetch specific requested week via POST
      try {
        console.log(`[librusClient getWeek] POSTing for week ${requestedMondayIso}_${requestedSundayIso}, requestKey: ${requestKey ? 'present' : 'empty'}`);
        const bodyParts = [`tydzien=${encodeURIComponent(`${requestedMondayIso}_${requestedSundayIso}`)}`];
        if (requestKey) {
          bodyParts.push(`requestkey=${encodeURIComponent(requestKey)}`);
        }
        const postRes = await this.doFetch('https://synergia.librus.pl/przegladaj_plan_lekcji', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Referer: 'https://synergia.librus.pl/przegladaj_plan_lekcji',
          },
          body: bodyParts.join('&'),
        });
        const postHtml = await postRes.text();
        const postExpired = this.isSessionExpired(postRes, postHtml);
        console.log(`[librusClient getWeek] POST status: ${postRes.status}, length: ${postHtml.length}, isExpired: ${postExpired}`);
        if (!postExpired) {
          const postWeek = parseTimetableFromHtml(postHtml, requestedMondayDate);
          console.log(`[librusClient getWeek] postWeek parsed: ${postWeek?.weekStart ?? 'null'}, totalLessons: ${postWeek?.days.reduce((s, d) => s + d.lessons.length, 0) ?? 0}`);
          if (postWeek && postWeek.days.some((d) => d.lessons.length > 0)) {
            return postWeek;
          }
        }
      } catch (postErr) {
        console.warn('[librusClient] POST to przegladaj_plan_lekcji failed, using GET result:', postErr);
      }

      // 3. Fallback: if the requested week (e.g. next week) has no published timetable yet,
      // clone the active week's schedule with next week's dates so the user always sees their timetable
      if (activeWeekSchedule && activeWeekSchedule.days.some((d) => d.lessons.length > 0)) {
        const clonedDays: DaySchedule[] = activeWeekSchedule.days.map((d, idx) => {
          const newDate = toISODate(addDays(requestedMondayDate, idx));
          return {
            ...d,
            date: newDate,
            lessons: d.lessons.map((l) => ({
              ...l,
              id: `${newDate}-${l.hourNumber}`,
              attendance: undefined,
              topic: undefined,
              isCancelled: undefined,
              isSubstitution: undefined,
              changeType: undefined,
              note: undefined,
              original: undefined,
            })),
          };
        });

        const templatedWeek: WeekSchedule = {
          weekStart: requestedMondayIso,
          days: clonedDays,
          fetchedAt: Date.now(),
        };
        saveCachedWeek(templatedWeek);
        return templatedWeek;
      }

      return activeWeekSchedule;
    };

    try {
      let week = await fetchWeekFromLibrus();
      if (!week) {
        const relogged = await this.reloginWithStoredCredentials();
        if (relogged) {
          week = await fetchWeekFromLibrus();
        }
      }
      return week ?? getCachedWeek(requestedMondayIso);
    } catch (err) {
      console.warn('[librusClient] getWeek failed, falling back to cache:', err);
      return getCachedWeek(requestedMondayIso);
    }
  }

  /**
   * Scrapes attendance marks from https://synergia.librus.pl/przegladaj_nb/uczen
   * and completed lesson topics + 'ob' present marks from https://synergia.librus.pl/zrealizowane_lekcje.
   */
  async getAttendanceAndRealizations(): Promise<{
    marks: AttendanceMark[];
    realizations: LessonRealization[];
    stats: AttendanceStats;
  }> {
    const fallbackFromCache = () => {
      const marks = getCachedAttendanceMarks() ?? [];
      const realizations = getCachedRealizations() ?? [];
      const stats =
        getCachedAttendanceStats() ??
        computeStats(marks, realizations, null, null, getAllCachedWeeks());
      return { marks, realizations, stats };
    };

    const credsRaw = await this.getStoredData(STORAGE_KEYS.CREDENTIALS);
    if (!credsRaw) {
      return fallbackFromCache();
    }

    const fetchBothHtml = async (): Promise<{
      marks: AttendanceMark[];
      realizations: LessonRealization[];
      stats: AttendanceStats;
    } | null> => {
      const [nbRes, realRes] = await Promise.all([
        this.doFetch('https://synergia.librus.pl/przegladaj_nb/uczen'),
        this.doFetch('https://synergia.librus.pl/zrealizowane_lekcje'),
      ]);

      const [nbHtml, realHtml] = await Promise.all([nbRes.text(), realRes.text()]);

      if (this.isSessionExpired(nbRes, nbHtml) || this.isSessionExpired(realRes, realHtml)) {
        return null;
      }

      // 1. Parse przegladaj_nb/uczen
      const marks: AttendanceMark[] = [];
      let markSeq = 1;
      const summaryTotals: ScrapedAttendanceSummary = {
        present: 0,
        absent: 0,
        excused: 0,
        late: 0,
        exempt: 0,
      };
      const seenRowDates = new Set<string>();

      // Detect if the table header starts lesson hours at 0 or 1
      let firstSlotHour = 1;
      const headerRowMatch = nbHtml.match(
        /<tr\b[^>]*class="[^"]*\bnaglowek\b[^"]*"[^>]*>([\s\S]*?)<\/tr>/i
      );
      if (headerRowMatch) {
        const headerNums = [...headerRowMatch[1].matchAll(/<(?:td|th)\b[^>]*>\s*(\d{1,2})\s*<\/(?:td|th)>/gi)].map(
          (m) => parseInt(m[1], 10)
        );
        if (headerNums.length > 0 && headerNums[0] === 0) {
          firstSlotHour = 0;
        }
      }

      // Match outer <tr class="line0|1"> chunks up to the next outer row or table end
      // (avoids truncating early on nested <table><tr><td class="box">...</td></tr></table> inside the marks cell)
      const nbRowMatches = [
        ...nbHtml.matchAll(
          /<tr\b[^>]*class="[^"]*\bline[01]\b[^"]*"[^>]*>([\s\S]*?)(?=<tr\b[^>]*class="[^"]*\b(?:line[01]|naglowek)\b|<\/tbody>|<\/table>)/gi
        ),
      ];

      if (nbRowMatches.length === 0) {
        return null;
      }

      // Detect Okres 1 and Okres 2 section divider positions in nbHtml
      const okres1Pos = nbHtml.search(/>\s*Okres\s*1\s*</i);
      const okres2Pos = nbHtml.search(/>\s*Okres\s*2\s*</i);
      let currentRunningSemester: 1 | 2 = okres2Pos !== -1 && (okres1Pos === -1 || okres2Pos < okres1Pos) ? 2 : 1;

      for (const rowMatch of nbRowMatches) {
        const rowChunk = rowMatch[1] || '';
        const rowPos = rowMatch.index ?? 0;

        if (/>\s*Okres\s*1\s*</i.test(rowChunk)) {
          currentRunningSemester = 1;
          continue;
        }
        if (/>\s*Okres\s*2\s*</i.test(rowChunk)) {
          currentRunningSemester = 2;
          continue;
        }

        let rowSemester: 1 | 2 = currentRunningSemester;
        if (okres1Pos !== -1 && okres2Pos !== -1) {
          if (okres2Pos < okres1Pos) {
            rowSemester = rowPos >= okres1Pos ? 1 : 2;
          } else {
            rowSemester = rowPos >= okres2Pos ? 2 : 1;
          }
        }

        const tds = [...rowChunk.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
        if (tds.length < 2) continue;

        const firstCellText = this.decodeHtml(tds[0]);
        const rowDateMatch = firstCellText.match(/(\d{4}-\d{2}-\d{2})/);
        if (!rowDateMatch) continue;
        const rowDate = rowDateMatch[1];

        // Extract the 5 trailing summary columns per day row:
        // [0] Nieobecności uspr. (u), [1] Nieobecności nieuspr. (nb), [2] Nieobecności razem (u+nb), [3] Spóźnienia (sp), [4] Zwolnienia (zw)
        if (tds.length >= 6 && !seenRowDates.has(rowDate)) {
          const last5 = tds.slice(-5).map((c) => {
            const txt = this.decodeHtml(c).trim();
            return /^\d+$/.test(txt) ? parseInt(txt, 10) : NaN;
          });
          if (last5.every((n) => !isNaN(n))) {
            seenRowDates.add(rowDate);
            const [c0, c1, c2, c3, c4] = last5;
            if (c0 + c1 === c2) {
              summaryTotals.excused += c0;
              summaryTotals.absent += c1;
              summaryTotals.late += c3;
              summaryTotals.exempt = (summaryTotals.exempt ?? 0) + c4;
            }
          }
        }

        // Determine lesson hour slots inside the row so we have an accurate slot-based hourNumber fallback
        const middleTds = tds.length >= 6 ? tds.slice(1, -5) : tds.slice(1);
        let slotChunks: string[] = [];
        if (middleTds.length > 1) {
          slotChunks = middleTds;
        } else if (middleTds.length === 1) {
          const boxMatches = [
            ...middleTds[0].matchAll(
              /<(?:p|span|div)\b[^>]*class="[^"]*\bbox\b[^"]*"[^>]*>[\s\S]*?<\/(?:p|span|div)>/gi
            ),
          ].map((m) => m[0]);
          slotChunks = boxMatches.length > 0 ? boxMatches : [middleTds[0]];
        } else {
          slotChunks = [rowChunk];
        }

        for (let slotIdx = 0; slotIdx < slotChunks.length; slotIdx++) {
          const slotHtml = slotChunks[slotIdx];
          // Match each <a>...</a> block without ([^>]*) because Librus puts <b> and <br> tags inside title="..."
          const anchorBlocks = slotHtml.match(/<a\b[\s\S]*?<\/a>/gi) || [];

          for (let aIdx = 0; aIdx < anchorBlocks.length; aIdx++) {
            const aBlock = anchorBlocks[aIdx];
            const valMatch = aBlock.match(/>\s*([^<>]+?)\s*<\/a>/i);
            if (!valMatch) continue;

            const symbol = this.decodeHtml(valMatch[1]).trim().replace(/\*+$/, '');
            if (!symbol || symbol.length > 6) continue;

            const idMatch =
              aBlock.match(/\/szczegoly\/(\d+)/i) || aBlock.match(/href="[^"]*\/(\d+)"/i);
            const id = idMatch ? idMatch[1] : `nb-${rowDate}-${slotIdx + 1}-${markSeq++}`;

            const titleMatch =
              aBlock.match(/title="([^"]*)"/i) || aBlock.match(/title='([^']*)'/i);
            const rawTitle = titleMatch
              ? titleMatch[1]
                  .replace(/&lt;/gi, '<')
                  .replace(/&gt;/gi, '>')
                  .replace(/<br\s*\/?>/gi, '\n')
                  .replace(/<[^>]+>/g, '')
                  .replace(/&amp;/gi, '&')
                  .replace(/&quot;/gi, '"')
                  .replace(/&#039;/gi, "'")
                  .replace(/&nbsp;/gi, ' ')
              : '';

            const getTitleField = (labelPattern: string): string => {
              const m = rawTitle.match(
                new RegExp(`(?:^|\\n)\\s*(?:${labelPattern})\\s*:\\s*([^\\n\\r]+)`, 'i')
              );
              return m ? m[1].trim() : '';
            };

            const typeName = getTitleField('Rodzaj|Typ');
            const dateFromTitleMatch = getTitleField('Data').match(/(\d{4}-\d{2}-\d{2})/);
            const date = dateFromTitleMatch ? dateFromTitleMatch[1] : rowDate;
            const subject = getTitleField('Przedmiot|Lekcja|Zajęcia') || undefined;
            const hourStr = getTitleField('Godzina lekcyjna|Nr lekcji|Numer lekcji|Godzina');
            const hourMatch = hourStr.match(/\d+/);
            const fallbackHour =
              slotChunks.length > 1 ? slotIdx + firstSlotHour : aIdx + firstSlotHour;
            const hourNumber = hourMatch ? parseInt(hourMatch[0], 10) : fallbackHour;
            const teacher = getTitleField('Nauczyciel|Dodał') || undefined;
            const addedAt = getTitleField('Data dodania') || undefined;
            const tripRaw = getTitleField('Czy wycieczka');
            const trip = tripRaw ? tripRaw.toLowerCase().startsWith('tak') : undefined;

            const { kind, defaultName } = classifyAttendanceSymbol(symbol, typeName);

            marks.push({
              id,
              date,
              hourNumber: !isNaN(hourNumber) ? hourNumber : undefined,
              subject,
              teacher,
              addedBy: teacher,
              addedAt,
              trip,
              kind,
              symbol,
              name: typeName || defaultName,
              semester: rowSemester,
            });
          }
        }
      }

      const scrapedPercent: number | null = null;

      // 2. Parse zrealizowane_lekcje
      const realizations: LessonRealization[] = [];
      let realSeq = 1;

      const realRows =
        realHtml.match(/<tr\b[^>]*class="[^"]*\bline[01]\b[^"]*"[^>]*>[\s\S]*?<\/tr>/gi) || [];

      for (const rowHtml of realRows) {
        const tds = [...rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
        if (tds.length < 5) continue;

        const cleanCells = tds.map((c) => this.decodeHtml(c));
        const dateIdx = cleanCells.findIndex((c) => /\d{4}-\d{2}-\d{2}/.test(c));
        if (dateIdx === -1) continue;

        const dateMatch = cleanCells[dateIdx].match(/(\d{4}-\d{2}-\d{2})/);
        if (!dateMatch) continue;
        const date = dateMatch[1];

        // Find lesson hourNumber after dateIdx
        let hourIdx = -1;
        let hourNumber = 0;
        for (let i = dateIdx + 1; i < Math.min(cleanCells.length, dateIdx + 4); i++) {
          if (/^\d{1,2}$/.test(cleanCells[i])) {
            hourIdx = i;
            hourNumber = parseInt(cleanCells[i], 10);
            break;
          }
        }
        if (hourIdx === -1 || hourIdx + 2 >= cleanCells.length) continue;

        const subjectCell = cleanCells[hourIdx + 1] || '';
        const topicCell = cleanCells[hourIdx + 2] || '';

        // Subject cell in zrealizowane_lekcje may look like "Matematyka" or "Matematyka (Jan Kowalski)"
        let subject = subjectCell;
        let teacher: string | undefined;
        const boldSubj = tds[hourIdx + 1]?.match(/<b\b[^>]*>([\s\S]*?)<\/b>/i);
        if (boldSubj) {
          subject = this.decodeHtml(boldSubj[1]);
          const remainder = this.decodeHtml(
            tds[hourIdx + 1].replace(boldSubj[0], '')
          ).replace(/^[(),\s-]+|[(),\s-]+$/g, '');
          if (remainder) teacher = remainder;
        }

        // Check trailing cells for attendance symbol (e.g. "ob", "nb", "sp", "u", "zw")
        let attendanceSymbol: string | undefined;
        let attendanceId: string | undefined;
        for (let i = cleanCells.length - 1; i > hourIdx + 2; i--) {
          const val = cleanCells[i].trim();
          if (/^(ob|nb|u|nu|sp|zw|wy)$/i.test(val)) {
            attendanceSymbol = val.toLowerCase();
            const idMatch = tds[i].match(/\/szczegoly\/(\d+)/i);
            if (idMatch) attendanceId = idMatch[1];
            break;
          }
        }

        if (!subject && !topicCell) continue;

        realizations.push({
          id: `real-${date}-${hourNumber}-${realSeq++}`,
          date,
          hourNumber,
          subject,
          topic: topicCell,
          teacher,
          attendanceSymbol,
          attendanceId,
        });
      }

      const hasAnyAttendance =
        marks.length > 0 ||
        summaryTotals.absent > 0 ||
        summaryTotals.excused > 0 ||
        summaryTotals.late > 0;
      if (!hasAnyAttendance && realizations.length === 0) {
        return null;
      }

      const stats = computeStats(
        marks,
        realizations,
        scrapedPercent,
        summaryTotals,
        getAllCachedWeeks()
      );

      saveCachedAttendanceMarks(marks);
      saveCachedRealizations(realizations);
      saveCachedAttendanceStats(stats);

      return { marks, realizations, stats };
    };

    try {
      let data = await fetchBothHtml();
      if (!data) {
        const relogged = await this.reloginWithStoredCredentials();
        if (relogged) {
          data = await fetchBothHtml();
        }
      }
      return data ?? fallbackFromCache();
    } catch (err) {
      console.warn('[librusClient] getAttendanceAndRealizations failed, using cache:', err);
      return fallbackFromCache();
    }
  }

  /**
   * Scrapes message list from https://synergia.librus.pl/wiadomosci/5 (Odebrane)
   * or https://synergia.librus.pl/wiadomosci/6 (Wysłane).
   */
  async getMessages(folder: MessageFolder = 'inbox'): Promise<LibrusMessageSummary[]> {
    const folderId: 5 | 6 = folder === 'inbox' ? 5 : 6;
    const credsRaw = await this.getStoredData(STORAGE_KEYS.CREDENTIALS);
    if (!credsRaw) {
      return getCachedMessages(folder);
    }

    const fetchFolderHtml = async (): Promise<LibrusMessageSummary[] | null> => {
      const res = await this.doFetch(`https://synergia.librus.pl/wiadomosci/${folderId}`);
      const html = await res.text();

      if (this.isSessionExpired(res, html)) {
        return null;
      }

      const messages: LibrusMessageSummary[] = [];
      const rowMatches =
        html.match(/<tr\b[^>]*class="[^"]*\bline[01]\b[^"]*"[^>]*>[\s\S]*?<\/tr>/gi) || [];

      for (const rowHtml of rowMatches) {
        const tdMatches = [...rowHtml.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)];
        if (tdMatches.length < 4) continue;

        const tdsAttrs = tdMatches.map((m) => m[1] || '');
        const tds = tdMatches.map((m) => m[2] || '');

        // Find all cells that link to /wiadomosci/1/{5|6}/{id}
        // In Librus Synergia:
        // tds[0] = checkbox, tds[1] = attachment icon, tds[2] = Nadawca/Odbiorca (link), tds[3] = Temat (link), tds[4] = Wysłano (date)
        const linkCellIndices: number[] = [];
        let messageId = '';
        for (let i = 0; i < tds.length; i++) {
          const m = tds[i].match(/\/wiadomosci\/1\/(?:5|6)\/(\d+)/i);
          if (m) {
            linkCellIndices.push(i);
            if (!messageId) messageId = m[1];
          }
        }
        if (!messageId) continue;

        let senderIdx = 2;
        let subjIdx = 3;
        if (linkCellIndices.length >= 2) {
          senderIdx = linkCellIndices[0];
          subjIdx = linkCellIndices[1];
        } else if (linkCellIndices.length === 1) {
          if (linkCellIndices[0] >= 3) {
            subjIdx = linkCellIndices[0];
            senderIdx = subjIdx - 1;
          } else {
            senderIdx = linkCellIndices[0];
            subjIdx = Math.min(senderIdx + 1, tds.length - 1);
          }
        }

        const rawSender = this.decodeHtml(tds[senderIdx] || '');
        const senderOrRecipient =
          cleanLibrusPersonName(rawSender) || 'Użytkownik Librus';
        const subject = this.decodeHtml(tds[subjIdx] || '') || '(Brak tematu)';
        const date =
          subjIdx + 1 < tds.length ? this.decodeHtml(tds[subjIdx + 1]).trim() : '';

        const isRowBold =
          /font-weight\s*:\s*bold/i.test(tdsAttrs[senderIdx] || '') ||
          /font-weight\s*:\s*bold/i.test(tdsAttrs[subjIdx] || '') ||
          /font-weight\s*:\s*bold/i.test(rowHtml) ||
          /<b\b/i.test(tds[senderIdx] || '') ||
          /<b\b/i.test(tds[subjIdx] || '');

        const isUnread = folder === 'inbox' && isRowBold;

        // In Sent folder (/wiadomosci/6), check if there is an explicit read column or use !isRowBold
        let readByRecipient: boolean | undefined;
        let readAt: string | undefined;
        if (folder === 'sent') {
          const extraCell =
            subjIdx + 2 < tds.length ? this.decodeHtml(tds[subjIdx + 2]).trim() : '';
          if (extraCell) {
            if (/^nie\b/i.test(extraCell)) {
              readByRecipient = false;
            } else {
              readByRecipient = true;
              if (/\d{4}-\d{2}-\d{2}/.test(extraCell)) {
                readAt = extraCell;
              }
            }
          } else {
            readByRecipient = !isRowBold;
          }
        }

        const hasAttachment = /filetype|attachment|zalacznik|ikona_plik/i.test(
          tds[1] || rowHtml
        );

        messages.push({
          id: messageId,
          folderId,
          sender: senderOrRecipient,
          senderOrRecipient,
          subject,
          date,
          sentAt: date,
          isUnread,
          readByRecipient,
          readAt,
          hasAttachment: hasAttachment || undefined,
        });
      }

      if (messages.length > 0) {
        saveCachedMessages(folder, messages);
      }
      return messages;
    };

    try {
      let list = await fetchFolderHtml();
      if (!list) {
        const relogged = await this.reloginWithStoredCredentials();
        if (relogged) {
          list = await fetchFolderHtml();
        }
      }
      if (list && list.length > 0) {
        return list;
      }
      return getCachedMessages(folder);
    } catch (err) {
      console.warn(`[librusClient] getMessages(${folder}) failed, using cache:`, err);
      return getCachedMessages(folder);
    }
  }

  /**
   * Scrapes full message body, recipient read status, and attachments from
   * https://synergia.librus.pl/wiadomosci/1/{folderId}/{messageId}
   */
  async getMessageDetail(
    folderId: 5 | 6,
    messageId: string,
    fallbackSender?: string
  ): Promise<LibrusMessageDetail | null> {
    const credsRaw = await this.getStoredData(STORAGE_KEYS.CREDENTIALS);
    if (!credsRaw) {
      return getCachedMessageDetail(folderId, messageId);
    }

    const fetchDetailHtml = async (): Promise<LibrusMessageDetail | null> => {
      const res = await this.doFetch(
        `https://synergia.librus.pl/wiadomosci/1/${folderId}/${messageId}`
      );
      const html = await res.text();

      if (this.isSessionExpired(res, html)) {
        return null;
      }

      const extractHeaderRow = (labelPattern: string): string => {
        const m = html.match(
          new RegExp(
            `<(?:th|td)[^>]*>\\s*(?:<b[^>]*>)?\\s*(?:${labelPattern})\\s*(?:<\\/b>)?\\s*<\\/(?:th|td)>\\s*<td[^>]*>([\\s\\S]*?)<\\/td>`,
            'i'
          )
        );
        return m ? this.decodeHtml(m[1]) : '';
      };

      const headerPerson = extractHeaderRow('Nadawca|Odbiorca|Adresat|Do');
      const subject = extractHeaderRow('Temat') || '(Brak tematu)';
      const date = extractHeaderRow('Wysłano|Data') || '';
      let readStatusText = extractHeaderRow('Przeczytano') || undefined;

      // On Sent messages (folderId === 6), Librus puts the Recipient and Read Status in a table
      // of <td class="left"> cells below the message content (e.g. [Recipient Name, "NIE" or "2026-10-18 16:30:00"]).
      let bottomRecipient = '';
      const afterContentIdx = html.search(/container-message-content/i);
      const bottomScope = afterContentIdx !== -1 ? html.slice(afterContentIdx) : html;
      const bottomRows =
        bottomScope.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];

      for (const bRow of bottomRows) {
        const leftTds = [
          ...bRow.matchAll(/<td\b[^>]*class="[^"]*\bleft\b[^"]*"[^>]*>([\s\S]*?)<\/td>/gi),
        ].map((m) => this.decodeHtml(m[1]).trim());

        if (leftTds.length >= 2) {
          const candidateName = leftTds[0];
          const candidateRead = leftTds[leftTds.length - 1];
          if (
            candidateName &&
            !/^(odbiorca|użytkownik|przeczytano|data|plik)/i.test(candidateName) &&
            (/^nie$/i.test(candidateRead) ||
              /^tak/i.test(candidateRead) ||
              /\d{4}-\d{2}-\d{2}/.test(candidateRead))
          ) {
            bottomRecipient = candidateName;
            if (!readStatusText) {
              readStatusText = candidateRead;
            }
            break;
          }
        }
      }

      // Check cached list for this messageId if neither headerPerson nor bottomRecipient matched
      let cachedListSender = '';
      const cachedFolderList = getCachedMessages(folderId === 5 ? 'inbox' : 'sent');
      const cachedItem = cachedFolderList.find((m) => m.id === messageId);
      if (cachedItem && cachedItem.sender && cachedItem.sender !== 'Użytkownik Librus') {
        cachedListSender = cachedItem.sender;
      }

      const resolvedPersonRaw =
        headerPerson ||
        bottomRecipient ||
        (fallbackSender && fallbackSender !== 'Użytkownik Librus' ? fallbackSender : '') ||
        cachedListSender;
      const senderOrRecipient =
        cleanLibrusPersonName(resolvedPersonRaw) || 'Użytkownik Librus';

      let readByRecipient: boolean | undefined;
      if (readStatusText) {
        readByRecipient = !/^nie\b/i.test(readStatusText.trim());
      } else if (cachedItem?.readByRecipient !== undefined) {
        readByRecipient = cachedItem.readByRecipient;
      }

      // Extract message body
      const contentMatch = html.match(
        /<div\b[^>]*class="[^"]*\bcontainer-message-content\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i
      );
      const bodyHtml = contentMatch ? contentMatch[1].trim() : '';

      const bodyText = bodyHtml
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;?/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#0?39;|&apos;/gi, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      // Extract attachments (Pliki / Załączniki) strictly after message content
      const unescapedBottom = bottomScope.replace(/\\\//g, '/');
      const cleanBottomForAtt = unescapedBottom
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ');

      const attachmentPaths = [
        ...unescapedBottom.matchAll(/(wiadomosci\/pobierz_zalacznik\/[^"'\s<>)]+)/gi),
      ].map((m) => m[1].replace(/\\+/g, ''));
      const uniquePaths = Array.from(new Set(attachmentPaths));

      const cleanAttachmentName = (rawName: string): string =>
        this.decodeHtml(rawName)
          .replace(/\bPobierz\b/gi, '')
          .replace(/^Pliki\s*:?\s*/i, '')
          .trim();

      const attachmentNames: string[] = [];

      // Primary: Librus renders each filename immediately after <img src=".../filetype/...">
      const fileImgMatches = [
        ...cleanBottomForAtt.matchAll(
          /<img\b[^>]*src=["'][^"']*filetype[^"']*["'][^>]*>([\s\S]{1,300}?)(?=<\/td>|<\/tr>|<\/a>|<\/span>|<\/div>|<img\b|<input\b|<button\b)/gi
        ),
      ];
      for (const fm of fileImgMatches) {
        const name = cleanAttachmentName(fm[1]);
        if (name && !/linkButton|Napisz\s+odebrane/i.test(name)) {
          attachmentNames.push(name);
        }
      }

      // Fallback: innermost <tr> rows (no nested <tr>) containing pobierz_zalacznik
      if (attachmentNames.length < uniquePaths.length) {
        const innerRows =
          cleanBottomForAtt.match(
            /<tr\b[^>]*>(?:(?!<tr\b)[\s\S])*?pobierz_zalacznik(?:(?!<tr\b)[\s\S])*?<\/tr>/gi
          ) || [];
        for (const iRow of innerRows) {
          const firstTd = iRow.match(/<td\b[^>]*>([\s\S]*?)<\/td>/i);
          const candidate = cleanAttachmentName(firstTd ? firstTd[1] : iRow);
          if (
            candidate &&
            !/linkButton|Napisz\s+odebrane/i.test(candidate) &&
            !attachmentNames.includes(candidate)
          ) {
            attachmentNames.push(candidate);
          }
        }
      }

      const attachments: LibrusAttachment[] = uniquePaths.map((path, idx) => ({
        name: attachmentNames[idx] || `Załącznik ${idx + 1}`,
        path,
      }));

      if (!bodyText && !subject) {
        return null;
      }

      const detail: LibrusMessageDetail = {
        id: messageId,
        folderId,
        sender: senderOrRecipient,
        senderOrRecipient,
        recipient: folderId === 6 ? senderOrRecipient : undefined,
        subject,
        date,
        sentAt: date,
        isUnread: false,
        readByRecipient,
        body: bodyText,
        bodyText,
        bodyHtml,
        readAt: readStatusText,
        readStatusText,
        hasAttachment: attachments.length > 0 ? true : cachedItem?.hasAttachment,
        attachments: attachments.length > 0 ? attachments : undefined,
      };

      saveCachedMessageDetail(detail);
      return detail;
    };

    try {
      let detail = await fetchDetailHtml();
      if (!detail) {
        const relogged = await this.reloginWithStoredCredentials();
        if (relogged) {
          detail = await fetchDetailHtml();
        }
      }
      return detail ?? getCachedMessageDetail(folderId, messageId);
    } catch (err) {
      console.warn('[librusClient] getMessageDetail failed, using cache:', err);
      return getCachedMessageDetail(folderId, messageId);
    }
  }

  private decodeBytesUtf8(bytes: Uint8Array, maxBytes?: number): string {
    const slice = maxBytes ? bytes.subarray(0, maxBytes) : bytes;
    try {
      if (typeof TextDecoder !== 'undefined') {
        return new TextDecoder('utf-8').decode(slice);
      }
    } catch {}
    let out = '';
    for (let i = 0; i < slice.length; i++) {
      out += String.fromCharCode(slice[i]);
    }
    try {
      return decodeURIComponent(escape(out));
    } catch {
      return out;
    }
  }

  private guessMimeType(fileName: string, headerContentType?: string): string {
    const cleanHeader = (headerContentType || '').split(';')[0].trim().toLowerCase();
    if (
      cleanHeader &&
      cleanHeader !== 'text/html' &&
      cleanHeader !== 'text/plain' &&
      cleanHeader !== 'application/octet-stream' &&
      cleanHeader !== 'application/force-download'
    ) {
      return cleanHeader;
    }
    const ext = (fileName.split('.').pop() || '').toLowerCase();
    switch (ext) {
      case 'pdf':
        return 'application/pdf';
      case 'doc':
        return 'application/msword';
      case 'docx':
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      case 'xls':
        return 'application/vnd.ms-excel';
      case 'xlsx':
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      case 'ppt':
        return 'application/vnd.ms-powerpoint';
      case 'pptx':
        return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      case 'odt':
        return 'application/vnd.oasis.opendocument.text';
      case 'ods':
        return 'application/vnd.oasis.opendocument.spreadsheet';
      case 'zip':
        return 'application/zip';
      case 'rar':
        return 'application/vnd.rar';
      case '7z':
        return 'application/x-7z-compressed';
      case 'png':
        return 'image/png';
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'gif':
        return 'image/gif';
      case 'webp':
        return 'image/webp';
      case 'txt':
        return 'text/plain';
      case 'csv':
        return 'text/csv';
      default:
        return 'application/octet-stream';
    }
  }

  private xhrRequestArrayBuffer(
    url: string,
    options: {
      method?: 'GET' | 'POST';
      headers?: Record<string, string>;
      body?: string;
      includeManualSynergiaCookie?: boolean;
    } = {}
  ): Promise<{
    status: number;
    url: string;
    bytes: Uint8Array;
    contentType: string;
    contentDisposition: string;
    text: () => string;
  }> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(options.method || 'GET', url, true);
      xhr.withCredentials = true;
      xhr.responseType = 'arraybuffer';

      const headers: Record<string, string> = {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
        ...(options.headers || {}),
      };

      if (options.includeManualSynergiaCookie) {
        const customCookies = this.cookieStore.getNonDefaultCookiesString();
        if (customCookies) {
          headers['Cookie'] = customCookies;
        }
      }

      for (const [k, v] of Object.entries(headers)) {
        xhr.setRequestHeader(k, v);
      }

      xhr.onload = () => {
        const rawHeaders: Record<string, string> = (xhr as any).responseHeaders || {};
        const getHeader = (name: string): string => {
          const target = name.toLowerCase();
          for (const [hk, hv] of Object.entries(rawHeaders)) {
            if (hk.toLowerCase() === target) return String(hv || '');
          }
          return xhr.getResponseHeader(name) || '';
        };

        const buf = xhr.response as ArrayBuffer | null;
        const bytes = buf ? new Uint8Array(buf) : new Uint8Array(0);
        const finalUrl = xhr.responseURL || url;

        resolve({
          status: xhr.status,
          url: finalUrl,
          bytes,
          contentType: getHeader('content-type').toLowerCase(),
          contentDisposition: getHeader('content-disposition'),
          text: () => this.decodeBytesUtf8(bytes),
        });
      };

      xhr.onerror = () => {
        reject(new Error('Network request failed'));
      };

      xhr.ontimeout = () => {
        reject(new Error('Network request timed out'));
      };

      xhr.send(options.body ?? null);
    });
  }

  /**
   * Downloads a Librus message attachment directly inside the app's authenticated OkHttp session
   * and returns the raw file bytes so the file can be saved straight to the phone without
   * opening an external browser (which would lack session cookies and fail on singleUseKey).
   */
  async downloadAttachmentData(
    attachmentPath: string,
    fallbackName: string
  ): Promise<
    | { ok: true; bytes: Uint8Array; mimeType: string; fileName: string }
    | { ok: false; error: string }
  > {
    const cleanPath = attachmentPath.replace(/^\/+/, '');
    const targetUrl = cleanPath.startsWith('http')
      ? cleanPath
      : `https://synergia.librus.pl/${cleanPath}`;

    const isInvalidOrHtml = (
      bytes: Uint8Array,
      contentType: string,
      contentDisposition: string
    ): boolean => {
      if (bytes.byteLength === 0) return true;
      const head = this.decodeBytesUtf8(bytes, 1200);
      if (
        /Nieprawidłowy token|Nie udało się rozpocząć pobierania|Sesja wygasła|Zaloguj do systemu|Nie jesteś zalogowany|loguj\/portalRodzina/i.test(
          head
        )
      ) {
        return true;
      }
      if (contentDisposition.toLowerCase().includes('attachment')) {
        return false;
      }
      const isHtmlFile = /\.html?$/i.test(fallbackName);
      if (!isHtmlFile && (contentType.includes('text/html') || /^\s*(?:<!doctype\s+html|<html\b)/i.test(head))) {
        return true;
      }
      return false;
    };

    const tryDownloadOnce = async (
      useManualCookieOnInitialHop: boolean
    ): Promise<
      | { status: 'ok'; bytes: Uint8Array; mimeType: string }
      | { status: 'relogin' }
      | { status: 'error'; error: string }
    > => {
      const r1 = await this.xhrRequestArrayBuffer(targetUrl, {
        includeManualSynergiaCookie: useManualCookieOnInitialHop,
        headers: {
          Referer: 'https://synergia.librus.pl/wiadomosci',
        },
      });

      const finalUrl = r1.url || targetUrl;
      const lowerUrl = finalUrl.toLowerCase();
      const headText = this.decodeBytesUtf8(r1.bytes, 2000);

      const isLoginRedirect =
        lowerUrl.includes('login') ||
        lowerUrl.includes('loguj') ||
        lowerUrl.includes('oauth') ||
        lowerUrl.includes('niezalogowany') ||
        headText.includes('action="login"') ||
        headText.includes('Zaloguj do systemu') ||
        headText.includes('Sesja wygasła') ||
        headText.includes('Nie jesteś zalogowany') ||
        headText.includes('loguj/portalRodzina');

      if (isLoginRedirect) {
        return { status: 'relogin' };
      }

      // If r1 already streamed the binary attachment directly
      if (!isInvalidOrHtml(r1.bytes, r1.contentType, r1.contentDisposition)) {
        return {
          status: 'ok',
          bytes: r1.bytes,
          mimeType: this.guessMimeType(fallbackName, r1.contentType),
        };
      }

      const html = r1.text();

      const fetchGetFileUrl = async (rawGetFileUrl: string) => {
        const baseGetFile = rawGetFileUrl.startsWith('http')
          ? rawGetFileUrl
          : `https://sandbox.librus.pl/${rawGetFileUrl.replace(/^\/+/, '')}`;
        const getUrl = baseGetFile.endsWith('/get')
          ? baseGetFile
          : `${baseGetFile.replace(/\/+$/, '')}/get`;

        return this.xhrRequestArrayBuffer(getUrl, {
          includeManualSynergiaCookie: false,
          headers: { Referer: finalUrl },
        });
      };

      // Case 1: GetFile URL on sandbox.librus.pl
      const getFileMatch =
        finalUrl.match(/(https?:\/\/[^"'\s<>]+\/GetFile\/[^"'\s<>?#/]+)/i) ||
        html.match(/(https?:\/\/[^"'\s<>]+\/GetFile\/[^"'\s<>?#/]+)/i) ||
        html.match(/(\/GetFile\/[^"'\s<>?#/]+)/i);

      if (getFileMatch) {
        const fileRes = await fetchGetFileUrl(getFileMatch[1]);
        if (!isInvalidOrHtml(fileRes.bytes, fileRes.contentType, fileRes.contentDisposition)) {
          return {
            status: 'ok',
            bytes: fileRes.bytes,
            mimeType: this.guessMimeType(fallbackName, fileRes.contentType),
          };
        }
      }

      // Case 2: singleUseKey on sandbox.librus.pl (CSTryToDownload -> CSCheckKey -> CSDownload)
      // IMPORTANT: Do NOT use React Native's URLSearchParams (it splits on '=' and turns '+' into space!)
      const keyMatch =
        finalUrl.match(/[?&]singleUseKey=([^&#"'\s<>]+)/i) ||
        html.match(/[?&]singleUseKey=([^&#"'\s<>]+)/i) ||
        html.match(/name=["']singleUseKey["'][^>]*value=["']([^"']+)["']/i) ||
        html.match(/singleUseKey\s*[:=]\s*["']([^"']+)["']/i);

      if (keyMatch && keyMatch[1]) {
        const rawKey = keyMatch[1];
        let decodedKey = rawKey;
        try {
          decodedKey = decodeURIComponent(rawKey);
        } catch {}
        const encodedKey = encodeURIComponent(decodedKey);

        let readyDownloadUrl: string | null = null;
        const checkUrl = 'https://sandbox.librus.pl/index.php?action=CSCheckKey';

        for (let attempt = 0; attempt < 20; attempt++) {
          try {
            const checkRes = await this.xhrRequestArrayBuffer(checkUrl, {
              method: 'POST',
              includeManualSynergiaCookie: false,
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest',
                Referer: finalUrl,
                Origin: 'https://sandbox.librus.pl',
              },
              body: `singleUseKey=${encodedKey}`,
            });
            const checkText = checkRes.text();
            if (checkText.includes('ready')) {
              try {
                const parsed = JSON.parse(checkText);
                if (typeof parsed?.url === 'string' && parsed.url) {
                  readyDownloadUrl = parsed.url.startsWith('http')
                    ? parsed.url
                    : `https://sandbox.librus.pl/${parsed.url.replace(/^\/+/, '')}`;
                }
              } catch {}
              break;
            }
          } catch {}
          await new Promise((r) => setTimeout(r, 400));
        }

        const csDownloadUrl =
          readyDownloadUrl ||
          (finalUrl.includes('CSTryToDownload')
            ? finalUrl.replace('CSTryToDownload', 'CSDownload')
            : `https://sandbox.librus.pl/index.php?action=CSDownload&singleUseKey=${encodedKey}`);

        const fileRes = await this.xhrRequestArrayBuffer(csDownloadUrl, {
          includeManualSynergiaCookie: false,
          headers: { Referer: finalUrl },
        });

        if (!isInvalidOrHtml(fileRes.bytes, fileRes.contentType, fileRes.contentDisposition)) {
          return {
            status: 'ok',
            bytes: fileRes.bytes,
            mimeType: this.guessMimeType(fallbackName, fileRes.contentType),
          };
        }

        // Check if CSDownload returned or redirected to a GetFile link
        const csHtml = fileRes.text();
        const csGetFile =
          fileRes.url.match(/(https?:\/\/[^"'\s<>]+\/GetFile\/[^"'\s<>?#/]+)/i) ||
          csHtml.match(/(https?:\/\/[^"'\s<>]+\/GetFile\/[^"'\s<>?#/]+)/i) ||
          csHtml.match(/(\/GetFile\/[^"'\s<>?#/]+)/i);

        if (csGetFile) {
          const gfRes = await fetchGetFileUrl(csGetFile[1]);
          if (!isInvalidOrHtml(gfRes.bytes, gfRes.contentType, gfRes.contentDisposition)) {
            return {
              status: 'ok',
              bytes: gfRes.bytes,
              mimeType: this.guessMimeType(fallbackName, gfRes.contentType),
            };
          }
        }
      }

      return {
        status: 'error',
        error: 'Serwer Librus odrzucił token pobierania załącznika.',
      };
    };

    try {
      // 1. Try using native OkHttp CookieJar (so cross-domain redirects to sandbox.librus.pl preserve cookies)
      let res = await tryDownloadOnce(false);
      if (res.status === 'ok') {
        return {
          ok: true,
          bytes: res.bytes,
          mimeType: res.mimeType,
          fileName: fallbackName,
        };
      }

      // 2. Re-authenticate to ensure fresh cookies in native OkHttp CookieJar and retry
      const relogged = await this.reloginWithStoredCredentials();
      if (relogged) {
        res = await tryDownloadOnce(false);
        if (res.status === 'ok') {
          return {
            ok: true,
            bytes: res.bytes,
            mimeType: res.mimeType,
            fileName: fallbackName,
          };
        }
      }

      // 3. Fallback with manual Synergia cookie header on initial hop
      res = await tryDownloadOnce(true);
      if (res.status === 'ok') {
        return {
          ok: true,
          bytes: res.bytes,
          mimeType: res.mimeType,
          fileName: fallbackName,
        };
      }

      return {
        ok: false,
        error:
          res.status === 'error'
            ? res.error
            : 'Nie udało się pobrać pliku załącznika z serwerów Librusa.',
      };
    } catch (err: any) {
      console.warn('[librusClient] downloadAttachmentData failed:', err);
      return {
        ok: false,
        error: err?.message || 'Wystąpił błąd sieci podczas pobierania załącznika.',
      };
    }
  }

  /**
   * Fetches available message recipients (wychowawca, nauczyciel, sekretariat, bibliotekarz)
   * from https://synergia.librus.pl/wiadomosci/2/5 and /getRecipients.
   */
  async getMessageRecipients(): Promise<MessageRecipient[]> {
    const credsRaw = await this.getStoredData(STORAGE_KEYS.CREDENTIALS);
    if (!credsRaw) return [];

    const fetchRecipients = async (): Promise<MessageRecipient[] | null> => {
      const composeRes = await this.doFetch('https://synergia.librus.pl/wiadomosci/2/5');
      const composeHtml = await composeRes.text();

      if (this.isSessionExpired(composeRes, composeHtml)) {
        return null;
      }

      const csrfMatch = composeHtml.match(/csrfTokenValue\s*=\s*["']([^"']+)["']/i);
      const csrfToken = csrfMatch ? csrfMatch[1] : '';

      const groups: Array<'wychowawca' | 'nauczyciel' | 'sekretariat' | 'bibliotekarz'> = [
        'wychowawca',
        'nauczyciel',
        'sekretariat',
        'bibliotekarz',
      ];

      const parseRecipientsFromHtml = (
        chunkHtml: string,
        group: 'wychowawca' | 'nauczyciel' | 'sekretariat' | 'bibliotekarz'
      ): MessageRecipient[] => {
        const list: MessageRecipient[] = [];
        const rows =
          chunkHtml.match(/<tr\b[^>]*class="[^"]*\bline[01]\b[^"]*"[^>]*>[\s\S]*?<\/tr>/gi) ||
          [];
        for (const row of rows) {
          const idMatch = row.match(
            /<input\b[^>]*name=["']DoKogo(?:\[\])?["'][^>]*value=["'](\d+)["']/i
          ) || row.match(
            /<input\b[^>]*value=["'](\d+)["'][^>]*name=["']DoKogo(?:\[\])?["']/i
          );
          const labelMatch = row.match(/<label\b[^>]*>([\s\S]*?)<\/label>/i);
          if (idMatch && labelMatch) {
            const id = idMatch[1];
            const name = cleanLibrusPersonName(this.decodeHtml(labelMatch[1]));
            if (id && name) {
              list.push({ id, name, group });
            }
          }
        }
        return list;
      };

      const groupResults = await Promise.all(
        groups.map(async (group) => {
          try {
            const body = new URLSearchParams({
              typAdresata: group,
              poprzednia: '5',
              tabZaznaczonych: '',
              czyWirtualneKlasy: 'false',
              idGrupy: '0',
            }).toString();

            const headers: Record<string, string> = {
              'Content-Type': 'application/x-www-form-urlencoded',
              'X-Requested-With': 'XMLHttpRequest',
              Referer: 'https://synergia.librus.pl/wiadomosci/2/5',
            };
            if (csrfToken) {
              headers['requestkey'] = csrfToken;
            }

            const res = await this.doFetch('https://synergia.librus.pl/getRecipients', {
              method: 'POST',
              headers,
              body,
            });
            const html = await res.text();
            return parseRecipientsFromHtml(html, group);
          } catch {
            return [];
          }
        })
      );

      const deduped = new Map<string, MessageRecipient>();
      for (const arr of groupResults) {
        for (const r of arr) {
          if (!deduped.has(r.id)) {
            deduped.set(r.id, r);
          }
        }
      }

      // Fallback: check if composeHtml itself already lists recipients inline
      if (deduped.size === 0) {
        for (const r of parseRecipientsFromHtml(composeHtml, 'nauczyciel')) {
          deduped.set(r.id, r);
        }
      }

      return Array.from(deduped.values());
    };

    try {
      let recipients = await fetchRecipients();
      if (!recipients) {
        const relogged = await this.reloginWithStoredCredentials();
        if (relogged) {
          recipients = await fetchRecipients();
        }
      }
      return recipients ?? [];
    } catch (err) {
      console.warn('[librusClient] getMessageRecipients failed:', err);
      return [];
    }
  }

  /**
   * Sends a message via https://synergia.librus.pl/wiadomosci/5
   */
  async sendMessage(
    recipientIds: string[],
    subject: string,
    body: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!recipientIds || recipientIds.length === 0) {
      return { success: false, error: 'Wybierz przynajmniej jednego odbiorcę wiadomości.' };
    }
    if (!subject.trim()) {
      return { success: false, error: 'Podaj temat wiadomości.' };
    }
    if (!body.trim()) {
      return { success: false, error: 'Wpisz treść wiadomości.' };
    }

    const attemptSend = async (): Promise<{
      success: boolean;
      expired?: boolean;
      error?: string;
    }> => {
      const composeRes = await this.doFetch('https://synergia.librus.pl/wiadomosci/2/5');
      const composeHtml = await composeRes.text();

      if (this.isSessionExpired(composeRes, composeHtml)) {
        return { success: false, expired: true };
      }

      const rkMatch = composeHtml.match(
        /<input\b[^>]*name=["']requestkey["'][^>]*value=["']([^"']+)["']/i
      );

      const params = new URLSearchParams();
      if (rkMatch && rkMatch[1]) {
        params.append('requestkey', rkMatch[1]);
      }

      if (recipientIds.length === 1) {
        params.append('DoKogo', recipientIds[0]);
        params.append('DoKogo[0]', recipientIds[0]);
      } else {
        recipientIds.forEach((id, idx) => {
          params.append(`DoKogo[${idx}]`, id);
        });
      }

      params.append('temat', subject.trim());
      params.append('tresc', body.trim());
      params.append('poprzednia', '6');
      params.append('wyslij', 'Wyślij');

      const sendRes = await this.doFetch('https://synergia.librus.pl/wiadomosci/5', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Referer: 'https://synergia.librus.pl/wiadomosci/2/5',
        },
        body: params.toString(),
      });

      const sendHtml = await sendRes.text();
      if (this.isSessionExpired(sendRes, sendHtml)) {
        return { success: false, expired: true };
      }

      if (
        sendHtml.includes('została wysłana') ||
        sendHtml.includes('Wiadomość wysłano') ||
        sendRes.url.includes('/wiadomosci/5') ||
        sendRes.url.includes('/wiadomosci/6')
      ) {
        return { success: true };
      }

      return {
        success: false,
        error: 'Serwer Librus nie potwierdził wysłania wiadomości.',
      };
    };

    try {
      let res = await attemptSend();
      if (res.expired) {
        const relogged = await this.reloginWithStoredCredentials();
        if (relogged) {
          res = await attemptSend();
        }
      }
      return { success: res.success, error: res.error };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Błąd połączenia podczas wysyłania wiadomości.',
      };
    }
  }

  async getTimetable(weekStartIso?: string): Promise<DaySchedule[]> {
    const week = await this.getWeek(weekStartIso);
    return week ? week.days : [];
  }
}

export const librusClient = new LibrusClient();

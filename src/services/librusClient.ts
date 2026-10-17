import * as SecureStore from 'expo-secure-store';
import {
  AttendanceMark,
  AttendanceStats,
  DaySchedule,
  Grade,
  LessonRealization,
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
  getAllCachedWeeks,
  getCachedAttendanceMarks,
  getCachedAttendanceStats,
  getCachedRealizations,
  getCachedWeek,
  saveCachedAttendanceMarks,
  saveCachedAttendanceStats,
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
   */
  private async reloginWithStoredCredentials(): Promise<boolean> {
    try {
      const credsRaw = await this.getStoredData(STORAGE_KEYS.CREDENTIALS);
      if (!credsRaw) return false;
      const { login, pass } = JSON.parse(credsRaw);
      if (!login || !pass) return false;

      console.log('[LibrusClient] Session expired. Automatically re-logging in...');
      const res = await this.login(login, pass);
      return res.success;
    } catch (err) {
      console.warn('[LibrusClient] Silent relogin failed:', err);
      return false;
    }
  }

  /**
   * Log into Librus directly using verified OAuth flow
   */
  async login(
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

      // Fetch student data right away
      await this.getStudentInfo();

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

      // Check if session expired
      if (
        res.url.includes('login') ||
        res.url.includes('OAuth') ||
        html.includes('action="login"') ||
        html.includes('Zaloguj do systemu')
      ) {
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

      // Check if session expired
      if (
        res.url.includes('login') ||
        res.url.includes('OAuth') ||
        html.includes('action="login"') ||
        html.includes('Zaloguj do systemu')
      ) {
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

      if (subjects.length > 0) {
        this.cachedGrades = subjects;
        await this.saveStoredData(STORAGE_KEYS.GRADES_CACHE, JSON.stringify(subjects));
      }

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
    return (
      res.url.includes('login') ||
      res.url.includes('OAuth') ||
      html.includes('action="login"') ||
      html.includes('Zaloguj do systemu')
    );
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

    const mondayDate = getMonday(
      weekStartIso ? parseISODate(weekStartIso) : getInitialSchoolDate()
    );
    const mondayIso = toISODate(mondayDate);
    const sundayIso = toISODate(addDays(mondayDate, 6));

    const fetchWeekHtml = async (): Promise<WeekSchedule | null> => {
      const body = `tydzien=${encodeURIComponent(`${mondayIso}_${sundayIso}`)}`;
      const res = await this.doFetch('https://synergia.librus.pl/przegladaj_plan_lekcji', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      });
      const html = await res.text();

      if (this.isSessionExpired(res, html)) {
        return null;
      }

      const days: DaySchedule[] = Array.from({ length: 5 }, (_, idx) => {
        const d = addDays(mondayDate, idx);
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

      const rowMatches =
        html.match(/<tr\b[^>]*class="[^"]*\bline1\b[^"]*"[^>]*>[\s\S]*?<\/tr>/gi) || [];

      for (const rowHtml of rowMatches) {
        const thMatch = rowHtml.match(/<th\b[^>]*>([\s\S]*?)<\/th>/i);
        if (!thMatch) continue;

        const timeRaw = this.decodeHtml(thMatch[1]);
        const timeMatch = timeRaw.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
        if (!timeMatch) continue;

        const padHM = (hm: string) => {
          const [h, m] = hm.split(':');
          return `${h.padStart(2, '0')}:${m}`;
        };
        const startTime = padHM(timeMatch[1]);
        const endTime = padHM(timeMatch[2]);
        const timeSpan = `${startTime} - ${endTime}`;

        const tdMatches = [...rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
        if (tdMatches.length < 6) continue;

        const hourNumRaw = this.decodeHtml(tdMatches[0]);
        const hourNumber = parseInt(hourNumRaw, 10);
        if (isNaN(hourNumber)) continue;

        // tdMatches[1..5] are Monday..Friday
        for (let dayIdx = 0; dayIdx < 5; dayIdx++) {
          const cellHtml = tdMatches[dayIdx + 1];
          if (!cellHtml) continue;

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

          // Find all <div class="text">...</div> blocks and check if they are inside <s>...</s>
          const struckRanges: Array<[number, number]> = [];
          for (const sMatch of cellHtml.matchAll(/<s\b[^>]*>[\s\S]*?<\/s>/gi)) {
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

          for (const divMatch of cellHtml.matchAll(
            /<div\b[^>]*class="[^"]*\btext\b[^"]*"[^>]*>([\s\S]*?)<\/div>/gi
          )) {
            const inner = divMatch[1];
            const pos = divMatch.index ?? 0;
            const isInsideS =
              struckRanges.some(([sStart, sEnd]) => pos >= sStart && pos < sEnd) ||
              /<s\b[^>]*>/i.test(inner);
            const parsed = parseTextBlock(inner);
            if (parsed.subject) {
              entries.push({ ...parsed, struck: isInsideS });
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

      // Sort each day's lessons by hourNumber ascending
      for (const day of days) {
        day.lessons.sort((a, b) => a.hourNumber - b.hourNumber);
      }

      const rawWeek: WeekSchedule = {
        weekStart: mondayIso,
        days,
        fetchedAt: Date.now(),
      };

      const cachedMarks = getCachedAttendanceMarks() ?? [];
      const cachedReal = getCachedRealizations() ?? [];
      const merged = mergeAttendanceAndTopics(rawWeek, cachedMarks, cachedReal);
      saveCachedWeek(merged);
      return merged;
    };

    try {
      let week = await fetchWeekHtml();
      if (!week) {
        const relogged = await this.reloginWithStoredCredentials();
        if (relogged) {
          week = await fetchWeekHtml();
        }
      }
      return week ?? getCachedWeek(mondayIso);
    } catch (err) {
      console.warn('[librusClient] getWeek failed, falling back to cache:', err);
      return getCachedWeek(mondayIso);
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

      for (const rowMatch of nbRowMatches) {
        const rowChunk = rowMatch[1] || '';
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

  async getTimetable(weekStartIso?: string): Promise<DaySchedule[]> {
    const week = await this.getWeek(weekStartIso);
    return week ? week.days : [];
  }
}

export const librusClient = new LibrusClient();

import * as SecureStore from 'expo-secure-store';
import { DaySchedule, Grade, StudentInfo, SubjectGrades } from '@/types/librus';

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

        const parseSemester = (tdHtml: string, semesterNum: 1 | 2) => {
          const spanMatches = [...tdHtml.matchAll(/<span\b[^>]*class="[^"]*grade-box[^"]*"[\s\S]*?<\/span>/gi)].map(
            (m) => m[0]
          );
          for (const span of spanMatches) {
            const valMatch = span.match(/>\s*([^<>]+?)\s*<\/a>/i);
            if (!valMatch) continue;

            const val = valMatch[1].trim().replace(/\*+$/, '');
            if (!val) continue;

            const hrefMatch = span.match(/href="[^"]*\/(\d+)"/i);
            const gradeId = hrefMatch ? hrefMatch[1] : `gen-${idCounter++}`;

            const titleMatch = span.match(/title="([^"]*)"/i);
            const title = titleMatch ? titleMatch[1] : '';

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

            grades.push({
              id: gradeId,
              value: val,
              numericValue: parseFloat(val) || 0,
              weight,
              category,
              date,
              teacher,
              comment,
              semester: semesterNum,
            });
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

  async getTimetable(): Promise<DaySchedule[]> {
    // Real timetable scraper placeholder: returns clean empty array for now
    return [];
  }
}

export const librusClient = new LibrusClient();

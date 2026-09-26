import * as SecureStore from 'expo-secure-store';
import { DaySchedule, StudentInfo, SubjectGrades } from '@/types/librus';
import { mockStudentInfo, mockSubjects, mockTimetable } from './mockData';

const STORAGE_KEYS = {
  CREDENTIALS: 'ligmus_user_credentials',
  IS_DEMO: 'ligmus_is_demo_mode',
  STUDENT_INFO: 'ligmus_student_info',
  COOKIES: 'ligmus_saved_cookies',
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
  private isDemoMode: boolean = true;
  private currentStudent: StudentInfo | null = null;

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
      const isDemo = await this.getStoredData(STORAGE_KEYS.IS_DEMO);
      if (isDemo === 'false') {
        this.isDemoMode = false;

        // Restore cookies if available
        const savedCookies = await this.getStoredData(STORAGE_KEYS.COOKIES);
        if (savedCookies) {
          try {
            this.cookieStore.fromJSON(JSON.parse(savedCookies));
          } catch {}
        }

        // Restore student info
        const savedStudent = await this.getStoredData(STORAGE_KEYS.STUDENT_INFO);
        if (savedStudent) {
          try {
            this.currentStudent = JSON.parse(savedStudent);
          } catch {}
        }

        return true;
      }
      return true;
    } catch {
      return true;
    }
  }

  isDemo(): boolean {
    return this.isDemoMode;
  }

  setDemoMode(demo: boolean) {
    this.isDemoMode = demo;
    this.saveStoredData(STORAGE_KEYS.IS_DEMO, demo ? 'true' : 'false');
  }

  private async doFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const headers: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
      ...((options.headers as Record<string, string>) || {}),
    };

    // If explicit cookies were captured (e.g. in test or Node), attach them.
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
   * Log into Librus directly using verified OAuth flow or switch to Demo mode
   */
  async login(
    login: string,
    pass: string,
    demo: boolean = false
  ): Promise<{ success: boolean; error?: string }> {
    if (demo) {
      this.isDemoMode = true;
      await this.saveStoredData(STORAGE_KEYS.IS_DEMO, 'true');
      return { success: true };
    }

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
        loginPageUrl = r2.url || (r2.headers.get('location') ? new URL(r2.headers.get('location')!, authUrl).toString() : authUrl);
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

      this.isDemoMode = false;
      await this.saveStoredData(STORAGE_KEYS.IS_DEMO, 'false');
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
    await this.deleteStoredData(STORAGE_KEYS.CREDENTIALS);
    await this.deleteStoredData(STORAGE_KEYS.COOKIES);
    await this.deleteStoredData(STORAGE_KEYS.STUDENT_INFO);
    await this.saveStoredData(STORAGE_KEYS.IS_DEMO, 'true');
    this.isDemoMode = true;
  }

  async getStudentInfo(): Promise<StudentInfo> {
    if (this.isDemoMode) {
      return mockStudentInfo;
    }

    try {
      const res = await this.doFetch('https://synergia.librus.pl/informacja');
      const html = await res.text();

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
        'Uczeń';
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
    } catch (err) {
      if (this.currentStudent) {
        return this.currentStudent;
      }
      return mockStudentInfo;
    }
  }

  async getGrades(): Promise<SubjectGrades[]> {
    if (this.isDemoMode) {
      return mockSubjects;
    }

    try {
      const res = await this.doFetch('https://synergia.librus.pl/przegladaj_oceny/uczen');
      const html = await res.text();

      // Lightweight HTML parser for subjects in the grades table
      const subjects: SubjectGrades[] = [];
      const trMatches = html.match(/<tr[^>]*class="line[01]"[^>]*>[\s\S]*?<\/tr>/gi) || [];

      let idCounter = 1;
      for (const row of trMatches) {
        const tdMatches = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
        if (tdMatches.length < 3) continue;

        const subjectRaw = tdMatches[1].replace(/<[^>]+>/g, '').trim();
        if (!subjectRaw) continue;

        // Extract grade values in semester 1 (td[2]) and semester 2 (td[5])
        const grades: any[] = [];
        const extractBoxes = (tdHtml: string, semesterNum: 1 | 2) => {
          const boxMatches = tdHtml.match(/<span class="grade-box"[^>]*>[\s\S]*?<\/span>/gi) || [];
          for (const box of boxMatches) {
            const valMatch = box.match(/<a[^>]*>([^<]+)<\/a>/i);
            const val = valMatch ? valMatch[1].trim().replace(/\*+$/, '') : '';
            if (val) {
              grades.push({
                id: `grade-${idCounter++}`,
                value: val,
                numericValue: parseFloat(val) || 0,
                weight: 1,
                category: 'Bieżąca',
                date: new Date().toISOString().split('T')[0],
                semester: semesterNum,
              });
            }
          }
        };

        if (tdMatches[2]) extractBoxes(tdMatches[2], 1);
        if (tdMatches[5]) extractBoxes(tdMatches[5], 2);

        // Average
        const sem1Avg = parseFloat(tdMatches[4]?.replace(/<[^>]+>/g, '') || '') || null;
        const sem2Avg = parseFloat(tdMatches[7]?.replace(/<[^>]+>/g, '') || '') || null;
        const yearAvg = parseFloat(tdMatches[9]?.replace(/<[^>]+>/g, '') || '') || null;

        subjects.push({
          id: `subj-${idCounter++}`,
          subjectName: subjectRaw,
          averageSem1: sem1Avg,
          averageSem2: sem2Avg,
          yearAverage: yearAvg,
          grades,
        });
      }

      return subjects.length > 0 ? subjects : mockSubjects;
    } catch {
      return mockSubjects;
    }
  }

  async getTimetable(): Promise<DaySchedule[]> {
    if (this.isDemoMode) {
      return mockTimetable;
    }
    return mockTimetable;
  }
}

export const librusClient = new LibrusClient();

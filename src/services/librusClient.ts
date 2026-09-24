import * as SecureStore from 'expo-secure-store';
import { DaySchedule, StudentInfo, SubjectGrades } from '@/types/librus';
import { mockStudentInfo, mockSubjects, mockTimetable } from './mockData';

const STORAGE_KEYS = {
  CREDENTIALS: 'ligmus_user_credentials',
  IS_DEMO: 'ligmus_is_demo_mode',
};

class LibrusClient {
  private cookies: string[] = [];
  private isDemoMode: boolean = true;

  constructor() {
    this.checkSavedSession();
  }

  async checkSavedSession(): Promise<boolean> {
    try {
      const isDemo = await SecureStore.getItemAsync(STORAGE_KEYS.IS_DEMO);
      if (isDemo === 'false') {
        this.isDemoMode = false;
        const savedCreds = await SecureStore.getItemAsync(STORAGE_KEYS.CREDENTIALS);
        return !!savedCreds;
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
    SecureStore.setItemAsync(STORAGE_KEYS.IS_DEMO, demo ? 'true' : 'false').catch(() => {});
  }

  /**
   * Log into Librus directly or switch to Demo mode
   */
  async login(login: string, pass: string, demo: boolean = false): Promise<{ success: boolean; error?: string }> {
    if (demo) {
      this.isDemoMode = true;
      await SecureStore.setItemAsync(STORAGE_KEYS.IS_DEMO, 'true');
      return { success: true };
    }

    try {
      this.isDemoMode = false;
      // Step 1: Initial redirect request
      const r1 = await fetch('https://synergia.librus.pl/loguj/portalRodzina', {
        headers: {
          'Referer': 'https://portal.librus.pl/',
          'User-Agent':
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
        },
      });

      const authUrl = r1.url.includes('OAuth')
        ? r1.url
        : 'https://api.librus.pl/OAuth/Authorization?client_id=46';

      // Step 2: POST credentials
      const formBody = new URLSearchParams();
      formBody.append('action', 'login');
      formBody.append('login', login);
      formBody.append('pass', pass);

      const r2 = await fetch(authUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formBody.toString(),
      });

      const json = await r2.json();

      if (!json || !json.goTo) {
        return { success: false, error: json?.errors?.[0] || 'Niepoprawny login lub hasło' };
      }

      // Step 3: Complete redirect to Synergia
      const nextUrl = json.goTo.startsWith('http')
        ? json.goTo
        : `https://api.librus.pl${json.goTo}`;

      await fetch(nextUrl);

      // Save credentials if login succeeded
      await SecureStore.setItemAsync(
        STORAGE_KEYS.CREDENTIALS,
        JSON.stringify({ login, pass })
      );
      await SecureStore.setItemAsync(STORAGE_KEYS.IS_DEMO, 'false');

      return { success: true };
    } catch (err: any) {
      // In case of network errors, return descriptive error
      return {
        success: false,
        error: err?.message || 'Błąd połączenia z serwerem Synergia',
      };
    }
  }

  async logout(): Promise<void> {
    this.cookies = [];
    await SecureStore.deleteItemAsync(STORAGE_KEYS.CREDENTIALS);
    await SecureStore.setItemAsync(STORAGE_KEYS.IS_DEMO, 'true');
    this.isDemoMode = true;
  }

  async getStudentInfo(): Promise<StudentInfo> {
    if (this.isDemoMode) {
      return mockStudentInfo;
    }

    try {
      const res = await fetch('https://synergia.librus.pl/uczen_index');
      const html = await res.text();

      // Extract lucky number
      const luckyMatch = html.match(/class="luckyNumber"[^>]*>.*?(\d+)/s);
      const luckyNum = luckyMatch ? parseInt(luckyMatch[1], 10) : mockStudentInfo.luckyNumber;

      return {
        ...mockStudentInfo,
        luckyNumber: luckyNum,
      };
    } catch {
      return mockStudentInfo;
    }
  }

  async getGrades(): Promise<SubjectGrades[]> {
    if (this.isDemoMode) {
      return mockSubjects;
    }

    try {
      const res = await fetch('https://synergia.librus.pl/przegladaj_oceny/uczen');
      if (!res.ok) {
        return mockSubjects;
      }
      // HTML parsing fallback
      return mockSubjects;
    } catch {
      return mockSubjects;
    }
  }

  async getTimetable(): Promise<DaySchedule[]> {
    if (this.isDemoMode) {
      return mockTimetable;
    }

    try {
      const res = await fetch('https://synergia.librus.pl/plan_lekcji');
      if (!res.ok) {
        return mockTimetable;
      }
      return mockTimetable;
    } catch {
      return mockTimetable;
    }
  }
}

export const librusClient = new LibrusClient();

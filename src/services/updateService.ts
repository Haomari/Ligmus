import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

export const GITHUB_REPO = 'Haomari/Ligmus';
export const GITHUB_RELEASES_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases`;
export const FALLBACK_APP_VERSION = '1.0.0';

function normalizeRawVersion(raw: string | undefined | null): string {
  const cleaned = (raw ?? '').trim().replace(/^[vV]/, '');
  return cleaned || FALLBACK_APP_VERSION;
}

export const APP_VERSION = normalizeRawVersion(Constants.expoConfig?.version);

export function formatVersionTag(version: string): string {
  const clean = version.trim().replace(/^[vV]/, '');
  return `v${clean || FALLBACK_APP_VERSION}`;
}

export interface DownloadProgressInfo {
  progress: number; // 0..1
  bytesWritten: number;
  totalBytes: number;
}

export interface UpdateCheckResult {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion: string | null;
  releaseTitle: string | null;
  releaseNotes: string | null;
  publishedAt: string | null;
  apkUrl: string | null;
  apkFileName: string | null;
  apkSizeBytes: number | null;
  htmlUrl: string | null;
  isPreview?: boolean;
}

interface ParsedSemver {
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
}

export function parseSemver(versionStr: string): ParsedSemver | null {
  const cleaned = versionStr.trim().replace(/^[vV]/, '');
  const match = cleaned.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?/);
  if (!match) return null;

  return {
    major: Number(match[1] ?? 0),
    minor: Number(match[2] ?? 0),
    patch: Number(match[3] ?? 0),
    prerelease: match[4] ?? null,
  };
}

/**
 * Returns > 0 if `a` is newer than `b`, < 0 if `a` is older than `b`, 0 if equal.
 */
export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return 0;

  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  if (pa.patch !== pb.patch) return pa.patch - pb.patch;

  // Stable release is newer than a pre-release of the same X.Y.Z
  if (!pa.prerelease && pb.prerelease) return 1;
  if (pa.prerelease && !pb.prerelease) return -1;
  if (pa.prerelease && pb.prerelease) {
    return pa.prerelease.localeCompare(pb.prerelease, undefined, { numeric: true });
  }

  return 0;
}

interface GitHubReleaseAsset {
  name?: string;
  size?: number;
  content_type?: string;
  browser_download_url?: string;
}

interface GitHubReleaseItem {
  tag_name?: string;
  name?: string;
  body?: string;
  draft?: boolean;
  prerelease?: boolean;
  published_at?: string;
  html_url?: string;
  assets?: GitHubReleaseAsset[];
}

export function formatBytesToMB(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '';
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function checkForAppUpdate(
  currentVersionOverride?: string
): Promise<UpdateCheckResult> {
  const currentVersion = normalizeRawVersion(currentVersionOverride ?? APP_VERSION);

  const response = await fetch(GITHUB_RELEASES_URL, {
    method: 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Ligmus-Android-Updater',
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API zwróciło błąd (${response.status})`);
  }

  const releases = (await response.json()) as GitHubReleaseItem[];
  if (!Array.isArray(releases) || releases.length === 0) {
    return {
      updateAvailable: false,
      currentVersion,
      latestVersion: null,
      releaseTitle: null,
      releaseNotes: null,
      publishedAt: null,
      apkUrl: null,
      apkFileName: null,
      apkSizeBytes: null,
      htmlUrl: null,
    };
  }

  const publishedReleases = releases.filter(
    (rel) => !rel.draft && Boolean(rel.tag_name || rel.name)
  );

  if (publishedReleases.length === 0) {
    return {
      updateAvailable: false,
      currentVersion,
      latestVersion: null,
      releaseTitle: null,
      releaseNotes: null,
      publishedAt: null,
      apkUrl: null,
      apkFileName: null,
      apkSizeBytes: null,
      htmlUrl: null,
    };
  }

  publishedReleases.sort((r1, r2) => {
    const v1 = r1.tag_name || r1.name || '0.0.0';
    const v2 = r2.tag_name || r2.name || '0.0.0';
    return compareSemver(v2, v1);
  });

  const bestRelease = publishedReleases[0];
  const latestRaw = bestRelease.tag_name || bestRelease.name || currentVersion;
  const latestVersion = normalizeRawVersion(latestRaw);
  const isNewer = compareSemver(latestVersion, currentVersion) > 0;

  const apkAsset = (bestRelease.assets ?? []).find((asset) => {
    const lowerName = (asset.name ?? '').toLowerCase();
    return (
      lowerName.endsWith('.apk') ||
      asset.content_type === 'application/vnd.android.package-archive'
    );
  });

  return {
    updateAvailable: isNewer,
    currentVersion,
    latestVersion,
    releaseTitle: bestRelease.name?.trim() || formatVersionTag(latestVersion),
    releaseNotes: bestRelease.body?.trim() || null,
    publishedAt: bestRelease.published_at ?? null,
    apkUrl: apkAsset?.browser_download_url ?? null,
    apkFileName: apkAsset?.name ?? null,
    apkSizeBytes: apkAsset?.size ?? null,
    htmlUrl: bestRelease.html_url ?? `https://github.com/${GITHUB_REPO}/releases`,
  };
}

export async function openReleaseInBrowser(url: string | null): Promise<void> {
  const target = url || `https://github.com/${GITHUB_REPO}/releases`;
  await WebBrowser.openBrowserAsync(target);
}

export async function downloadAndInstallUpdate(
  apkUrl: string,
  expectedSizeBytes: number | null,
  onProgress?: (info: DownloadProgressInfo) => void
): Promise<void> {
  if (Platform.OS !== 'android') {
    await openReleaseInBrowser(apkUrl);
    return;
  }

  const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!baseDir) {
    throw new Error('Brak dostępu do pamięci podręcznej urządzenia.');
  }

  const targetUri = `${baseDir}ligmus-update.apk`;

  try {
    const existing = await FileSystem.getInfoAsync(targetUri);
    if (existing.exists) {
      await FileSystem.deleteAsync(targetUri, { idempotent: true });
    }
  } catch {
    // Ignore stale file cleanup errors
  }

  const downloadResumable = FileSystem.createDownloadResumable(
    apkUrl,
    targetUri,
    {},
    (downloadProgress) => {
      const written = downloadProgress.totalBytesWritten;
      const expected =
        downloadProgress.totalBytesExpectedToWrite > 0
          ? downloadProgress.totalBytesExpectedToWrite
          : expectedSizeBytes ?? 0;
      const ratio = expected > 0 ? Math.min(1, Math.max(0, written / expected)) : 0;
      onProgress?.({
        progress: ratio,
        bytesWritten: written,
        totalBytes: expected,
      });
    }
  );

  const result = await downloadResumable.downloadAsync();
  if (!result || result.status < 200 || result.status >= 300) {
    throw new Error(`Nie udało się pobrać pliku APK (kod HTTP ${result?.status ?? 'brak'}).`);
  }

  onProgress?.({
    progress: 1,
    bytesWritten: expectedSizeBytes ?? 0,
    totalBytes: expectedSizeBytes ?? 0,
  });

  const contentUri = await FileSystem.getContentUriAsync(result.uri);

  // 1 = FLAG_GRANT_READ_URI_PERMISSION, 268435456 = FLAG_ACTIVITY_NEW_TASK (0x10000000)
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    flags: 1 | 268435456,
    type: 'application/vnd.android.package-archive',
  });
}

export function getMockPreviewUpdate(): UpdateCheckResult {
  return {
    updateAvailable: true,
    currentVersion: APP_VERSION,
    latestVersion: '1.1.0',
    releaseTitle: 'Ligmus v1.1.0 — Podgląd aktualizacji',
    releaseNotes:
      '• Automatyczne pobieranie i instalacja aktualizacji prosto z aplikacji\n' +
      '• Zoptymalizowany układ dla ekranów składanych (Fold) oraz tabletów\n' +
      '• Nowy generator usprawiedliwień i szybki wybór folderu pobierania załączników',
    publishedAt: new Date().toISOString(),
    apkUrl: null,
    apkFileName: 'ligmus-v1.1.0.apk',
    apkSizeBytes: 44 * 1024 * 1024,
    htmlUrl: `https://github.com/${GITHUB_REPO}/releases`,
    isPreview: true,
  };
}

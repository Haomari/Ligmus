import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { getUpdateChannel, UpdateChannel } from './fileCache';

export type { UpdateChannel };

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
  ipaUrl: string | null;
  ipaFileName: string | null;
  ipaSizeBytes: number | null;
  htmlUrl: string | null;
  channel: UpdateChannel;
  isPrerelease: boolean;
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
  target_commitish?: string;
  published_at?: string;
  html_url?: string;
  assets?: GitHubReleaseAsset[];
}

export function formatBytesToMB(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '';
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface CheckForUpdateOptions {
  currentVersionOverride?: string;
  channelOverride?: UpdateChannel;
}

function emptyUpdateResult(currentVersion: string, channel: UpdateChannel): UpdateCheckResult {
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
    ipaUrl: null,
    ipaFileName: null,
    ipaSizeBytes: null,
    htmlUrl: null,
    channel,
    isPrerelease: false,
  };
}

export async function checkForAppUpdate(
  options?: string | CheckForUpdateOptions
): Promise<UpdateCheckResult> {
  const opts: CheckForUpdateOptions =
    typeof options === 'string' ? { currentVersionOverride: options } : options ?? {};

  const currentVersion = normalizeRawVersion(opts.currentVersionOverride ?? APP_VERSION);
  const channel: UpdateChannel = opts.channelOverride ?? getUpdateChannel(currentVersion);

  const response = await fetch(GITHUB_RELEASES_URL, {
    method: 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Ligmus-Updater',
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API zwróciło błąd (${response.status})`);
  }

  const releases = (await response.json()) as GitHubReleaseItem[];
  if (!Array.isArray(releases) || releases.length === 0) {
    return emptyUpdateResult(currentVersion, channel);
  }

  const eligibleReleases = releases.filter((rel) => {
    if (rel.draft) return false;
    const rawVer = rel.tag_name || rel.name;
    if (!rawVer) return false;

    if (channel === 'stable') {
      const parsed = parseSemver(rawVer);
      const isBetaRelease =
        Boolean(rel.prerelease) ||
        rel.target_commitish === 'beta-updates' ||
        Boolean(parsed?.prerelease);
      return !isBetaRelease;
    }

    // Beta channel considers both beta pre-releases and stable releases, picking highest semver
    return true;
  });

  if (eligibleReleases.length === 0) {
    return emptyUpdateResult(currentVersion, channel);
  }

  eligibleReleases.sort((r1, r2) => {
    const v1 = r1.tag_name || r1.name || '0.0.0';
    const v2 = r2.tag_name || r2.name || '0.0.0';
    return compareSemver(v2, v1);
  });

  const bestRelease = eligibleReleases[0];
  const latestRaw = bestRelease.tag_name || bestRelease.name || currentVersion;
  const latestVersion = normalizeRawVersion(latestRaw);
  const isNewer = compareSemver(latestVersion, currentVersion) > 0;

  const assets = bestRelease.assets ?? [];

  const apkAsset = assets.find((asset) => {
    const lowerName = (asset.name ?? '').toLowerCase();
    return (
      lowerName.endsWith('.apk') ||
      asset.content_type === 'application/vnd.android.package-archive'
    );
  });

  const ipaAsset = assets.find((asset) => {
    const lowerName = (asset.name ?? '').toLowerCase();
    return lowerName.endsWith('.ipa');
  });

  const isPrerelease =
    Boolean(bestRelease.prerelease) ||
    bestRelease.target_commitish === 'beta-updates' ||
    Boolean(parseSemver(latestVersion)?.prerelease);

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
    ipaUrl: ipaAsset?.browser_download_url ?? null,
    ipaFileName: ipaAsset?.name ?? null,
    ipaSizeBytes: ipaAsset?.size ?? null,
    htmlUrl: bestRelease.html_url ?? `https://github.com/${GITHUB_REPO}/releases`,
    channel,
    isPrerelease,
  };
}

export async function openReleaseInBrowser(url: string | null): Promise<void> {
  const target = url || `https://github.com/${GITHUB_REPO}/releases`;
  if (Platform.OS === 'ios') {
    try {
      await Linking.openURL(target);
      return;
    } catch {
      // Fall back to embedded browser if system URL opening fails
    }
  }
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
  // Lazy-require Android-only launcher inside Android guard
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const IntentLauncher = require('expo-intent-launcher') as typeof import('expo-intent-launcher');

  // 1 = FLAG_GRANT_READ_URI_PERMISSION, 268435456 = FLAG_ACTIVITY_NEW_TASK (0x10000000)
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    flags: 1 | 268435456,
    type: 'application/vnd.android.package-archive',
  });
}

export function getMockPreviewUpdate(channelOverride?: UpdateChannel): UpdateCheckResult {
  const channel = channelOverride ?? getUpdateChannel(APP_VERSION);
  const isBeta = channel === 'beta';
  const latestVersion = isBeta ? '1.2.0-beta.1' : '1.2.0';
  return {
    updateAvailable: true,
    currentVersion: APP_VERSION,
    latestVersion,
    releaseTitle: isBeta
      ? `Ligmus v${latestVersion} — Podgląd aktualizacji Beta`
      : `Ligmus v${latestVersion} — Podgląd aktualizacji`,
    releaseNotes:
      '• Wsparcie dla iOS (plik IPA dla SideStore / AltStore) oraz Androida (APK)\n' +
      '• Dwa kanały aktualizacji w ustawieniach: Stabilny (master) oraz Beta (beta-updates)\n' +
      '• Udostępnianie i zapisywanie załączników przez systemowy arkusz iOS',
    publishedAt: new Date().toISOString(),
    apkUrl: null,
    apkFileName: 'ligmus.apk',
    apkSizeBytes: 104 * 1024 * 1024,
    ipaUrl: null,
    ipaFileName: 'ligmus.ipa',
    ipaSizeBytes: 38 * 1024 * 1024,
    htmlUrl: `https://github.com/${GITHUB_REPO}/releases`,
    channel,
    isPrerelease: isBeta,
    isPreview: true,
  };
}

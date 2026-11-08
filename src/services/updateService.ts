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
  compareUrl?: string | null;
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
  isDowngrade?: boolean;
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
  allowDowngradeToStable?: boolean;
}

function emptyUpdateResult(currentVersion: string, channel: UpdateChannel): UpdateCheckResult {
  return {
    updateAvailable: false,
    currentVersion,
    latestVersion: null,
    releaseTitle: null,
    releaseNotes: null,
    compareUrl: null,
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
    isDowngrade: false,
  };
}

function stripInlineMarkdown(line: string): string {
  return line
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

export function cleanReleaseMarkdown(rawBody: string | null | undefined): {
  cleanedText: string;
  compareUrl: string | null;
} {
  if (!rawBody) {
    return { cleanedText: '', compareUrl: null };
  }

  const compareMatch = rawBody.match(
    /https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/compare\/([^\s)>]+)/i
  );
  const compareUrl = compareMatch ? compareMatch[0].trim() : null;

  const lines = rawBody.split(/\r?\n/);
  const outputLines: string[] = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    // Skip GitHub's boilerplate "Full Changelog: https://..." or "## What's Changed" headers
    if (/^\*{0,2}Full\s+Changelog\*{0,2}\s*:/i.test(trimmed)) continue;
    if (/^#{1,4}\s*What['’]?s\s+Changed\b/i.test(trimmed)) continue;
    if (/^https?:\/\/github\.com\/[^\s]+\/compare\/[^\s]+$/i.test(trimmed)) continue;

    if (/^#{1,4}\s+/.test(trimmed)) {
      const heading = stripInlineMarkdown(trimmed.replace(/^#{1,4}\s+/, ''));
      if (heading) {
        outputLines.push(heading);
      }
      continue;
    }

    if (/^[-*•]\s+/.test(trimmed)) {
      const item = stripInlineMarkdown(trimmed.replace(/^[-*•]\s+/, ''));
      if (item) {
        outputLines.push(`• ${item}`);
      }
      continue;
    }

    const plain = stripInlineMarkdown(trimmed);
    if (plain) {
      outputLines.push(plain);
    }
  }

  return {
    cleanedText: outputLines.join('\n').trim(),
    compareUrl,
  };
}

function formatCommitMessagesToBullets(commitMessages: string[]): string {
  const bullets: string[] = [];
  const seen = new Set<string>();

  const pushBullet = (raw: string) => {
    const cleaned = stripInlineMarkdown(
      raw
        .replace(/^[-*•]\s+/, '')
        .replace(/^(?:feat|fix|chore|refactor|perf|style|docs|ci|build)(?:\([^)]+\))?:\s*/i, '')
    );
    if (!cleaned) return;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    bullets.push(`• ${cleaned}`);
  };

  for (const msg of commitMessages) {
    if (!msg) continue;
    const lines = msg
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;

    const subject = lines[0];
    const bodyBullets = lines.slice(1).filter((l) => /^[-*•]\s+/.test(l));

    if (bodyBullets.length > 0) {
      for (const b of bodyBullets) {
        pushBullet(b);
      }
    } else if (!/^merge\s+(?:branch|pull\s+request)/i.test(subject)) {
      pushBullet(subject);
    }
  }

  return bullets.join('\n').trim();
}

const KNOWN_RELEASE_NOTES: Record<string, string> = {
  'v1.0.0': [
    '• Stabilne wydanie produkcyjne Ligmus v1.0.0 dla Librusa Synergia.',
    '• Pełna obsługa ocen, planu lekcji, frekwencji z kalkulatorem progu 50% oraz wiadomości.',
    '• Pamięć podręczna offline, powiadomienia w tle oraz generator usprawiedliwień.',
  ].join('\n'),
  'v1.1.0-beta.1': [
    '• System automatycznych aktualizacji OTA dla kanałów Stabilny oraz Beta (beta-updates).',
    '• Obsługa pobierania pakietu instalacyjnego APK z paskiem postępu bezpośrednio w aplikacji.',
    '• Przełącznik kanału aktualizacji w Ustawieniach aplikacji.',
  ].join('\n'),
  'v1.1.0-beta.2': [
    '• Synchronizacja Terminarza Librusa z planem lekcji (sprawdziany, kartkówki, poprawy, konsultacje) oraz ukrywanie wpisów.',
    '• Zakładka Ogłoszenia szkolne w Skrzynce wraz z oznaczaniem nieprzeczytanych komunikatów.',
    '• Nowa sekcja Ostatnia aktywność na Pulpicie z filtrowaną historią ocen, wiadomości i zmian planu.',
    '• Odświeżone karty szczegółów ocen i lekcji z magnetycznym przewijaniem oraz wsparciem dla ekranów składanych (Galaxy Fold).',
    '• Wykrywanie zmiany hasła do Librusa z szybkim oknem aktualizacji poświadczeń bez utraty danych.',
  ].join('\n'),
  'v1.1.0': [
    '• Pełna obsługa dni wolnych od szkoły i świąt (połączenie planu lekcji z Terminarzem, dedykowane okno szczegółów dnia wolnego oraz grupowanie w Ostatniej aktywności).',
    '• Synchronizacja Terminarza Librusa z planem lekcji (sprawdziany, kartkówki, poprawy, konsultacje) oraz ukrywanie wpisów.',
    '• Zakładka Ogłoszenia szkolne w Skrzynce oraz przycisk oznaczania wszystkich wiadomości i ogłoszeń jako przeczytane.',
    '• Sekcja Ostatnia aktywność na Pulpicie z filtrowaną historią ocen, wiadomości, ogłoszeń i zmian planu.',
    '• Ulepszony system aktualizacji z przełącznikiem auto-aktualizacji, możliwością powrotu do wersji stabilnej oraz 74% mniejszym rozmiarem instalatora APK (~28 MB).',
  ].join('\n'),
};

function buildKnownReleaseItem(
  tag: string,
  prerelease: boolean,
  publishedAt: string,
  apkSizeBytes: number = 108947046
): GitHubReleaseItem {
  return {
    tag_name: tag,
    name: `Ligmus ${tag}`,
    body: KNOWN_RELEASE_NOTES[tag] ?? '',
    draft: false,
    prerelease,
    target_commitish: prerelease ? 'beta-updates' : 'master',
    published_at: publishedAt,
    html_url: `https://github.com/${GITHUB_REPO}/releases/tag/${tag}`,
    assets: [
      {
        name: 'ligmus.apk',
        size: apkSizeBytes,
        content_type: 'application/vnd.android.package-archive',
        browser_download_url: `https://github.com/${GITHUB_REPO}/releases/download/${tag}/ligmus.apk`,
      },
      {
        name: 'ligmus.ipa',
        size: 39845888,
        content_type: 'application/octet-stream',
        browser_download_url: `https://github.com/${GITHUB_REPO}/releases/download/${tag}/ligmus.ipa`,
      },
    ],
  };
}

const BUILT_IN_KNOWN_RELEASES: GitHubReleaseItem[] = [
  buildKnownReleaseItem('v1.1.0', false, '2026-11-08T14:45:00Z', 29695475),
  buildKnownReleaseItem('v1.1.0-beta.2', true, '2026-10-31T20:15:00Z'),
  buildKnownReleaseItem('v1.1.0-beta.1', true, '2026-10-28T16:25:00Z'),
  buildKnownReleaseItem('v1.0.0', false, '2026-10-24T12:00:00Z'),
];

let cachedReleasesList: GitHubReleaseItem[] | null = null;
let cachedReleasesFetchedAt = 0;
const RELEASES_CACHE_TTL_MS = 2 * 60 * 1000;

async function fetchReleasesFromAtomFeed(): Promise<GitHubReleaseItem[]> {
  try {
    const atomRes = await fetch(`https://github.com/${GITHUB_REPO}/releases.atom`, {
      method: 'GET',
      headers: {
        Accept: 'application/atom+xml,application/xml,text/xml,*/*',
        'User-Agent': 'Ligmus-Updater',
      },
    });
    if (!atomRes.ok) return [];
    const xml = await atomRes.text();
    const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)];
    const parsed: GitHubReleaseItem[] = [];

    for (const match of entries) {
      const entryXml = match[1] || '';
      const tagMatch =
        entryXml.match(/\/releases\/tag\/([^"<&\s]+)/i) ||
        entryXml.match(/Repository\/\d+\/([^"<&\s]+)<\/id>/i);
      if (!tagMatch?.[1]) continue;

      const tag = decodeURIComponent(tagMatch[1].trim());
      const titleMatch = entryXml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const updatedMatch = entryXml.match(/<updated>([\s\S]*?)<\/updated>/i);
      const contentMatch = entryXml.match(/<content[^>]*>([\s\S]*?)<\/content>/i);

      const rawContent = (contentMatch?.[1] ?? '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/<\/li>/gi, '\n')
        .replace(/<li[^>]*>/gi, '- ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]+>/g, '');

      const isPrerelease = Boolean(parseSemver(tag)?.prerelease);
      parsed.push({
        tag_name: tag,
        name: titleMatch?.[1]?.trim() || `Ligmus ${tag}`,
        body: rawContent.trim() || KNOWN_RELEASE_NOTES[formatVersionTag(tag)] || '',
        draft: false,
        prerelease: isPrerelease,
        target_commitish: isPrerelease ? 'beta-updates' : 'master',
        published_at: updatedMatch?.[1]?.trim(),
        html_url: `https://github.com/${GITHUB_REPO}/releases/tag/${tag}`,
        assets: [
          {
            name: 'ligmus.apk',
            size: 108947046,
            content_type: 'application/vnd.android.package-archive',
            browser_download_url: `https://github.com/${GITHUB_REPO}/releases/download/${tag}/ligmus.apk`,
          },
          {
            name: 'ligmus.ipa',
            size: 39845888,
            content_type: 'application/octet-stream',
            browser_download_url: `https://github.com/${GITHUB_REPO}/releases/download/${tag}/ligmus.ipa`,
          },
        ],
      });
    }

    return parsed;
  } catch {
    return [];
  }
}

function mergeReleasesWithBuiltIn(primary: GitHubReleaseItem[]): GitHubReleaseItem[] {
  const byTag = new Map<string, GitHubReleaseItem>();
  for (const item of primary) {
    const tag = item.tag_name ? formatVersionTag(item.tag_name) : '';
    if (tag) byTag.set(tag, item);
  }
  for (const builtin of BUILT_IN_KNOWN_RELEASES) {
    const tag = builtin.tag_name ? formatVersionTag(builtin.tag_name) : '';
    if (tag && !byTag.has(tag)) {
      byTag.set(tag, builtin);
    }
  }
  return Array.from(byTag.values());
}

async function fetchGitHubReleasesList(): Promise<GitHubReleaseItem[]> {
  if (
    cachedReleasesList &&
    cachedReleasesList.length > 0 &&
    Date.now() - cachedReleasesFetchedAt < RELEASES_CACHE_TTL_MS
  ) {
    return cachedReleasesList;
  }

  try {
    const response = await fetch(GITHUB_RELEASES_URL, {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Ligmus-Updater',
      },
    });

    if (response.ok) {
      const json = (await response.json()) as GitHubReleaseItem[];
      if (Array.isArray(json) && json.length > 0) {
        const merged = mergeReleasesWithBuiltIn(json);
        cachedReleasesList = merged;
        cachedReleasesFetchedAt = Date.now();
        return merged;
      }
    }
  } catch {
    // Fall through to Atom feed / built-in fallback
  }

  // Fallback when api.github.com hits 60 req/hr unauthenticated IP rate limit (HTTP 403)
  const atomReleases = await fetchReleasesFromAtomFeed();
  if (atomReleases.length > 0) {
    const merged = mergeReleasesWithBuiltIn(atomReleases);
    cachedReleasesList = merged;
    cachedReleasesFetchedAt = Date.now();
    return merged;
  }

  if (cachedReleasesList && cachedReleasesList.length > 0) {
    return cachedReleasesList;
  }

  return BUILT_IN_KNOWN_RELEASES;
}

async function resolveReleaseNotes(
  rawBody: string | null | undefined,
  releaseTag: string
): Promise<{ notes: string | null; compareUrl: string | null }> {
  const normalizedTag = formatVersionTag(releaseTag);
  const { cleanedText, compareUrl } = cleanReleaseMarkdown(rawBody);
  if (cleanedText.length >= 12) {
    return { notes: cleanedText, compareUrl };
  }

  // Check built-in release notes first so known tags never consume GitHub API rate limit quota
  if (KNOWN_RELEASE_NOTES[normalizedTag]) {
    return {
      notes: KNOWN_RELEASE_NOTES[normalizedTag],
      compareUrl,
    };
  }

  // If GitHub auto-generated only a "**Full Changelog**: .../compare/BASE...HEAD" line,
  // fetch the commits from the compare range (or the release tag commit) so the user sees the real diff!
  try {
    const compareRangeMatch = compareUrl?.match(/\/compare\/([^?\s#]+)/i);
    if (compareRangeMatch?.[1]) {
      const compareApiUrl = `https://api.github.com/repos/${GITHUB_REPO}/compare/${compareRangeMatch[1]}`;
      const cmpRes = await fetch(compareApiUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'Ligmus-Updater',
        },
      });
      if (cmpRes.ok) {
        const cmpJson = (await cmpRes.json()) as {
          commits?: { commit?: { message?: string } }[];
        };
        const msgs = (cmpJson.commits ?? [])
          .map((c) => c.commit?.message ?? '')
          .filter(Boolean)
          .reverse();
        const formatted = formatCommitMessagesToBullets(msgs);
        if (formatted) {
          return { notes: formatted, compareUrl };
        }
      }
    }

    // Fallback: inspect commits at the release tag itself
    const commitsApiUrl = `https://api.github.com/repos/${GITHUB_REPO}/commits?sha=${encodeURIComponent(
      normalizedTag
    )}&per_page=5`;
    const commitsRes = await fetch(commitsApiUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Ligmus-Updater',
      },
    });
    if (commitsRes.ok) {
      const commitsJson = (await commitsRes.json()) as {
        commit?: { message?: string };
      }[];
      if (Array.isArray(commitsJson) && commitsJson.length > 0) {
        const primaryMsg = commitsJson[0]?.commit?.message ?? '';
        const formatted = formatCommitMessagesToBullets([primaryMsg]);
        if (formatted) {
          return { notes: formatted, compareUrl };
        }
      }
    }
  } catch {
    // Ignore secondary changelog enrichment errors
  }

  return {
    notes: cleanedText || null,
    compareUrl,
  };
}

export async function checkForAppUpdate(
  options?: string | CheckForUpdateOptions
): Promise<UpdateCheckResult> {
  const opts: CheckForUpdateOptions =
    typeof options === 'string' ? { currentVersionOverride: options } : options ?? {};

  const currentVersion = normalizeRawVersion(opts.currentVersionOverride ?? APP_VERSION);
  const channel: UpdateChannel = opts.channelOverride ?? getUpdateChannel(currentVersion);

  const releases = await fetchGitHubReleasesList();
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
  const cmp = compareSemver(latestVersion, currentVersion);
  const isNewer = cmp > 0;
  const isCurrentPrerelease = Boolean(parseSemver(currentVersion)?.prerelease);
  const isDowngrade =
    channel === 'stable' && !isNewer && (cmp < 0 || (isCurrentPrerelease && cmp !== 0));
  const updateAvailable = isNewer || (Boolean(opts.allowDowngradeToStable) && isDowngrade);

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

  const { notes: resolvedNotes, compareUrl } = await resolveReleaseNotes(
    bestRelease.body,
    latestRaw
  );

  return {
    updateAvailable,
    currentVersion,
    latestVersion,
    releaseTitle: bestRelease.name?.trim() || formatVersionTag(latestVersion),
    releaseNotes: resolvedNotes,
    compareUrl,
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
    isDowngrade,
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
  const isCurrentBeta = APP_VERSION.includes('-');
  const isDowngrade = !isBeta && isCurrentBeta;
  const latestVersion = isDowngrade ? '1.0.0' : isBeta ? '1.2.0-beta.1' : '1.2.0';
  return {
    updateAvailable: true,
    currentVersion: APP_VERSION,
    latestVersion,
    releaseTitle: isDowngrade
      ? `Ligmus v${latestVersion} — Wydanie stabilne`
      : isBeta
        ? `Ligmus v${latestVersion} — Podgląd aktualizacji Beta`
        : `Ligmus v${latestVersion} — Podgląd aktualizacji`,
    releaseNotes:
      '• Synchronizacja Terminarza Librus z planem lekcji (sprawdziany, kartkówki, konsultacje, dni wolne)\n' +
      '• Zakładka Ogłoszenia szkolne w skrzynce wiadomości z oznaczaniem nieprzeczytanych\n' +
      '• Sekcja Ostatnia aktywność na pulpicie z filtrowaną historią zmian\n' +
      '• Nowy pionowy podgląd ocen i lekcji z magnetycznym przyciąganiem kart\n' +
      '• Automatyczne wykrywanie zmiany hasła Librus bez utraty danych lokalnych\n' +
      '• Poprawki interfejsu dla tabletów w orientacji poziomej oraz Galaxy Fold',
    compareUrl: `https://github.com/${GITHUB_REPO}/releases`,
    publishedAt: new Date().toISOString(),
    apkUrl: null,
    apkFileName: 'ligmus.apk',
    apkSizeBytes: 103.9 * 1024 * 1024,
    ipaUrl: null,
    ipaFileName: 'ligmus.ipa',
    ipaSizeBytes: 38 * 1024 * 1024,
    htmlUrl: `https://github.com/${GITHUB_REPO}/releases`,
    channel,
    isPrerelease: isBeta,
    isDowngrade,
    isPreview: true,
  };
}

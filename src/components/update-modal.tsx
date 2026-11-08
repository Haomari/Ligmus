import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  downloadAndInstallUpdate,
  DownloadProgressInfo,
  formatBytesToMB,
  formatVersionTag,
  openReleaseInBrowser,
  UpdateCheckResult,
} from '@/services/updateService';

export interface UpdateModalProps {
  visible: boolean;
  updateInfo: UpdateCheckResult | null;
  onClose: () => void;
  triggerSource?: 'auto' | 'manual';
  onDisableAutoUpdate?: () => void;
}

export const UpdateModal: React.FC<UpdateModalProps> = ({
  visible,
  updateInfo,
  onClose,
  triggerSource = 'manual',
  onDisableAutoUpdate,
}) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [progressInfo, setProgressInfo] = useState<DownloadProgressInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewDone, setPreviewDone] = useState(false);
  const previewTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (previewTimerRef.current) {
        clearInterval(previewTimerRef.current);
        previewTimerRef.current = null;
      }
    };
  }, [visible, updateInfo]);

  const handleCloseModal = () => {
    if (isDownloading) return;
    setProgressInfo(null);
    setErrorMessage(null);
    setPreviewDone(false);
    onClose();
  };

  if (!visible || !updateInfo) {
    return null;
  }

  const isIOS = Platform.OS === 'ios';
  const currentTag = formatVersionTag(updateInfo.currentVersion);
  const latestTag = formatVersionTag(updateInfo.latestVersion || updateInfo.currentVersion);
  const packageSizeBytes = isIOS ? updateInfo.ipaSizeBytes : updateInfo.apkSizeBytes;
  const packageSizeLabel = formatBytesToMB(packageSizeBytes);
  const hasApkAsset = Boolean(updateInfo.apkUrl);
  const hasIpaAsset = Boolean(updateInfo.ipaUrl);
  const isPreview = Boolean(updateInfo.isPreview);
  const isBetaRelease = Boolean(updateInfo.isPrerelease);
  const isDowngrade = Boolean(updateInfo.isDowngrade);

  const percent = Math.round((progressInfo?.progress ?? 0) * 100);
  const writtenMB = formatBytesToMB(progressInfo?.bytesWritten);
  const totalMB = formatBytesToMB(progressInfo?.totalBytes || packageSizeBytes);

  const handleOpenReleasePage = async () => {
    await openReleaseInBrowser(updateInfo.htmlUrl || updateInfo.compareUrl || null);
  };

  const handlePrimaryAction = async () => {
    if (isDownloading) return;
    setErrorMessage(null);

    if (isPreview) {
      if (isIOS) {
        setPreviewDone(true);
        return;
      }

      setPreviewDone(false);
      setIsDownloading(true);
      const totalBytes = updateInfo.apkSizeBytes ?? 103.9 * 1024 * 1024;
      let step = 0;
      const totalSteps = 12;
      setProgressInfo({ progress: 0, bytesWritten: 0, totalBytes });

      previewTimerRef.current = setInterval(() => {
        step += 1;
        const ratio = Math.min(1, step / totalSteps);
        setProgressInfo({
          progress: ratio,
          bytesWritten: Math.round(totalBytes * ratio),
          totalBytes,
        });
        if (step >= totalSteps) {
          if (previewTimerRef.current) {
            clearInterval(previewTimerRef.current);
            previewTimerRef.current = null;
          }
          setIsDownloading(false);
          setPreviewDone(true);
        }
      }, 100);
      return;
    }

    if (isIOS) {
      await openReleaseInBrowser(updateInfo.ipaUrl || updateInfo.htmlUrl);
      onClose();
      return;
    }

    if (!updateInfo.apkUrl) {
      await openReleaseInBrowser(updateInfo.htmlUrl);
      return;
    }

    setIsDownloading(true);
    setProgressInfo({
      progress: 0,
      bytesWritten: 0,
      totalBytes: updateInfo.apkSizeBytes ?? 0,
    });

    try {
      await downloadAndInstallUpdate(
        updateInfo.apkUrl,
        updateInfo.apkSizeBytes,
        (info) => setProgressInfo(info)
      );
      setIsDownloading(false);
      onClose();
    } catch (err: any) {
      setIsDownloading(false);
      setErrorMessage(
        isDowngrade
          ? 'Jeśli system Android zablokuje instalację starszej wersji na nowszą Beta, pobierz plik APK w przeglądarce i zainstaluj go po odinstalowaniu wersji Beta.'
          : err?.message ||
              'Nie udało się uruchomić instalatora pakietu APK. Możesz pobrać plik bezpośrednio w przeglądarce.'
      );
    }
  };

  const handleOpenBrowserFallback = async () => {
    const fallbackUrl = isIOS
      ? updateInfo.ipaUrl || updateInfo.htmlUrl
      : updateInfo.apkUrl || updateInfo.htmlUrl;
    await openReleaseInBrowser(fallbackUrl);
  };

  const handleDisableAuto = () => {
    if (isDownloading) return;
    onDisableAutoUpdate?.();
    handleCloseModal();
  };

  const showSubtitle =
    Boolean(updateInfo.releaseTitle) &&
    updateInfo.releaseTitle !== latestTag &&
    updateInfo.releaseTitle !== updateInfo.latestVersion;

  const primaryButtonIcon = isIOS
    ? hasIpaAsset
      ? 'download-outline'
      : 'open-outline'
    : hasApkAsset || isPreview
      ? 'download-outline'
      : 'open-outline';

  const primaryButtonLabel = isIOS
    ? isPreview
      ? previewDone
        ? 'Przetestuj ponownie'
        : 'Pobierz IPA w Safari'
      : hasIpaAsset
        ? 'Pobierz IPA w Safari'
        : 'Otwórz w Safari'
    : isPreview
      ? previewDone
        ? 'Przetestuj ponownie'
        : isDowngrade
          ? `Pobierz ${latestTag}`
          : 'Pobierz i zainstaluj'
      : hasApkAsset
        ? isDowngrade
          ? `Pobierz ${latestTag}`
          : 'Pobierz i zainstaluj'
        : 'Otwórz stronę wydania';

  const modalTitle = isPreview
    ? isDowngrade
      ? 'Podgląd powrotu do Stabilnej'
      : 'Podgląd aktualizacji'
    : isDowngrade
      ? 'Powrót do wersji stabilnej'
      : isBetaRelease
        ? 'Dostępna aktualizacja Beta'
        : 'Dostępna aktualizacja';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleCloseModal}>
      <Pressable style={styles.backdrop} onPress={handleCloseModal}>
        <Pressable style={styles.card} onPress={() => {}}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View
              style={[
                styles.iconCircle,
                isDowngrade && styles.iconCircleStable,
              ]}>
              <Ionicons
                name={isDowngrade ? 'shield-checkmark-outline' : 'rocket-outline'}
                size={24}
                color={isDowngrade ? '#34d399' : '#38bdf8'}
              />
            </View>
            <View style={styles.headerTextCol}>
              <Text style={styles.title} numberOfLines={2}>
                {modalTitle}
              </Text>
              <View style={styles.subtitleRow}>
                {showSubtitle ? (
                  <Text style={styles.subtitle} numberOfLines={1}>
                    {updateInfo.releaseTitle}
                  </Text>
                ) : (
                  <Text style={styles.subtitle} numberOfLines={1}>
                    Ligmus {latestTag}
                  </Text>
                )}
                <View
                  style={[
                    styles.channelBadge,
                    isBetaRelease ? styles.betaBadge : styles.stableBadge,
                  ]}>
                  <Text
                    style={[
                      styles.channelBadgeText,
                      isBetaRelease ? styles.betaBadgeText : styles.stableBadgeText,
                    ]}>
                    {isBetaRelease ? 'BETA' : 'STABILNA'}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Single-Line Version Transition & Package Size Bar */}
          <View style={styles.versionBar}>
            <View style={styles.versionPills}>
              <View style={styles.currentVerBadge}>
                <Text style={styles.currentVerText} numberOfLines={1}>
                  {currentTag}
                </Text>
              </View>
              <Ionicons name="arrow-forward" size={14} color="#64748b" />
              <View style={styles.newVerBadge}>
                <Text style={styles.newVerText} numberOfLines={1}>
                  {latestTag}
                </Text>
              </View>
            </View>
            {packageSizeLabel ? (
              <View style={styles.sizeBadge}>
                <Ionicons name="document-outline" size={13} color="#94a3b8" />
                <Text style={styles.sizeText} numberOfLines={1}>
                  {packageSizeLabel}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Release Notes (Scrollable & Clickable to open GitHub Release) */}
          <View style={styles.notesSection}>
            <View style={styles.notesHeaderRow}>
              <Text style={styles.notesHeader} numberOfLines={1}>
                {isDowngrade ? 'Opis wydania stabilnego:' : 'Co nowego:'}
              </Text>
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={handleOpenReleasePage}
                style={styles.githubLinkChip}>
                <Text style={styles.githubLinkChipText}>GitHub Releases</Text>
                <Ionicons name="open-outline" size={12} color="#38bdf8" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.notesScroll}
              contentContainerStyle={styles.notesScrollContent}
              nestedScrollEnabled
              showsVerticalScrollIndicator>
              <Pressable
                onPress={handleOpenReleasePage}
                style={({ pressed }) => [
                  styles.notesPressable,
                  pressed && { opacity: 0.82 },
                ]}>
                <Text style={styles.notesBody}>
                  {updateInfo.releaseNotes ||
                    '• Poprawki błędów, optymalizacja działania oraz ulepszenia stabilności.'}
                </Text>
              </Pressable>
            </ScrollView>
          </View>

          {/* iOS Sideloading Hint */}
          {isIOS && !previewDone && (
            <View style={styles.iosHintBox}>
              <Ionicons name="information-circle-outline" size={17} color="#38bdf8" />
              <Text style={styles.iosHintText}>
                Pobierz plik IPA w Safari, a następnie zainstaluj pakiet przez SideStore lub AltStore.
              </Text>
            </View>
          )}

          {/* Download Progress (Android) — Non-Overflowing Stacked Layout */}
          {isDownloading && (
            <View style={styles.progressBox}>
              <View style={styles.progressTopRow}>
                <Text style={styles.progressStatusText} numberOfLines={1}>
                  Pobieranie pakietu APK...
                </Text>
                <Text style={styles.progressPercentText}>{percent}%</Text>
              </View>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${Math.min(100, Math.max(2, percent))}%` },
                  ]}
                />
              </View>
              {writtenMB && totalMB ? (
                <Text style={styles.progressBytesText} numberOfLines={1}>
                  Pobrano {writtenMB} z {totalMB}
                </Text>
              ) : null}
            </View>
          )}

          {/* Preview Completion Banner */}
          {previewDone && !isDownloading && (
            <View style={styles.previewSuccessBox}>
              <Ionicons name="checkmark-circle" size={18} color="#10b981" />
              <Text style={styles.previewSuccessText}>
                {isIOS
                  ? 'Tryb podglądu — przycisk otworzy pobieranie pliku IPA bezpośrednio w Safari.'
                  : 'Tryb podglądu — po pobraniu pliku APK z GitHub Releases automatycznie uruchomi się instalator Androida.'}
              </Text>
            </View>
          )}

          {/* Error Banner + Browser Fallback */}
          {errorMessage && !isDownloading && (
            <View style={styles.errorBox}>
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle-outline" size={18} color="#f87171" />
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
              <TouchableOpacity
                style={styles.browserFallbackBtn}
                onPress={handleOpenBrowserFallback}>
                <Ionicons name="download-outline" size={15} color="#38bdf8" />
                <Text style={styles.browserFallbackText}>
                  Pobierz APK w przeglądarce
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Footer Actions */}
          <View style={styles.footerRow}>
            {triggerSource === 'auto' && (
              <TouchableOpacity
                style={[styles.laterBtn, isDownloading && styles.btnDisabled]}
                disabled={isDownloading}
                onPress={handleDisableAuto}>
                <Text
                  style={styles.laterBtnText}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.82}>
                  Wyłącz auto-aktualizacje
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.installBtn, isDownloading && styles.btnDisabled]}
              disabled={isDownloading}
              onPress={handlePrimaryAction}>
              {isDownloading ? (
                <>
                  <ActivityIndicator size="small" color="#ffffff" />
                  <Text style={styles.installBtnText} numberOfLines={1}>
                    Pobieranie...
                  </Text>
                </>
              ) : (
                <>
                  <Ionicons
                    name={primaryButtonIcon}
                    size={18}
                    color="#ffffff"
                  />
                  <Text
                    style={styles.installBtnText}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.85}>
                    {primaryButtonLabel}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#1e293b',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: 'rgba(56, 189, 248, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleStable: {
    backgroundColor: 'rgba(16, 185, 129, 0.14)',
    borderColor: 'rgba(16, 185, 129, 0.35)',
  },
  headerTextCol: {
    flex: 1,
    gap: 3,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#f8fafc',
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  subtitle: {
    fontSize: 13,
    color: '#94a3b8',
    flexShrink: 1,
  },
  channelBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 1,
  },
  betaBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.16)',
    borderColor: 'rgba(245, 158, 11, 0.45)',
  },
  stableBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.16)',
    borderColor: 'rgba(16, 185, 129, 0.45)',
  },
  channelBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  betaBadgeText: {
    color: '#fbbf24',
  },
  stableBadgeText: {
    color: '#34d399',
  },
  versionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0f172a',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: '#1e293b',
    gap: 8,
  },
  versionPills: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  currentVerBadge: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    flexShrink: 1,
  },
  currentVerText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#94a3b8',
  },
  newVerBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.16)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
    flexShrink: 1,
  },
  newVerText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#34d399',
  },
  sizeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  sizeText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#94a3b8',
  },
  notesSection: {
    gap: 8,
  },
  notesHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  notesHeader: {
    flex: 1,
    flexShrink: 1,
    fontSize: 11.5,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  githubLinkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
  },
  githubLinkChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#38bdf8',
  },
  notesScroll: {
    minHeight: 150,
    maxHeight: 270,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#263449',
  },
  notesScrollContent: {
    padding: 13,
  },
  notesPressable: {
    gap: 12,
  },
  notesBody: {
    fontSize: 13.5,
    lineHeight: 21,
    color: '#e2e8f0',
  },
  iosHintBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.28)',
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  iosHintText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: '#cbd5e1',
  },
  progressBox: {
    gap: 7,
    backgroundColor: '#0f172a',
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  progressTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  progressStatusText: {
    flex: 1,
    fontSize: 12,
    color: '#cbd5e1',
    fontWeight: '600',
  },
  progressPercentText: {
    fontSize: 12.5,
    color: '#38bdf8',
    fontWeight: '800',
    flexShrink: 0,
  },
  progressTrack: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    backgroundColor: '#1e293b',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#3b82f6',
  },
  progressBytesText: {
    fontSize: 11.5,
    color: '#94a3b8',
    fontWeight: '500',
  },
  previewSuccessBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
    borderRadius: 12,
    padding: 12,
  },
  previewSuccessText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
    color: '#d1fae5',
  },
  errorBox: {
    gap: 10,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    borderRadius: 12,
    padding: 12,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
    color: '#fecaca',
  },
  browserFallbackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
  },
  browserFallbackText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#38bdf8',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  laterBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  laterBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#cbd5e1',
    textAlign: 'center',
  },
  installBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#3b82f6',
  },
  installBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#ffffff',
    flexShrink: 1,
  },
  btnDisabled: {
    opacity: 0.6,
  },
});

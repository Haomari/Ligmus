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
}

export const UpdateModal: React.FC<UpdateModalProps> = ({
  visible,
  updateInfo,
  onClose,
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

  const percent = Math.round((progressInfo?.progress ?? 0) * 100);
  const writtenMB = formatBytesToMB(progressInfo?.bytesWritten);
  const totalMB = formatBytesToMB(progressInfo?.totalBytes || packageSizeBytes);

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
      const totalBytes = updateInfo.apkSizeBytes ?? 44 * 1024 * 1024;
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
        err?.message ||
          'Nie udało się uruchomić instalatora pakietu APK. Możesz pobrać aktualizację bezpośrednio w przeglądarce.'
      );
    }
  };

  const handleOpenBrowserFallback = async () => {
    const fallbackUrl = isIOS
      ? updateInfo.ipaUrl || updateInfo.htmlUrl
      : updateInfo.apkUrl || updateInfo.htmlUrl;
    await openReleaseInBrowser(fallbackUrl);
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
        : 'Pobierz i zainstaluj'
      : hasApkAsset
        ? 'Pobierz i zainstaluj'
        : 'Otwórz stronę wydania';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleCloseModal}>
      <Pressable
        style={styles.backdrop}
        onPress={handleCloseModal}>
        <Pressable style={styles.card} onPress={() => {}}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.iconCircle}>
              <Ionicons name="rocket-outline" size={24} color="#38bdf8" />
            </View>
            <View style={styles.headerTextCol}>
              <Text style={styles.title}>
                {isPreview
                  ? 'Podgląd aktualizacji'
                  : isBetaRelease
                    ? 'Dostępna aktualizacja Beta'
                    : 'Dostępna aktualizacja'}
              </Text>
              {showSubtitle ? (
                <Text style={styles.subtitle} numberOfLines={2}>
                  {updateInfo.releaseTitle}
                </Text>
              ) : null}
            </View>
          </View>

          {/* Version & Size Pill Row */}
          <View style={styles.versionBar}>
            <View style={styles.versionPills}>
              <View style={styles.currentVerBadge}>
                <Text style={styles.currentVerText}>{currentTag}</Text>
              </View>
              <Ionicons name="arrow-forward" size={15} color="#64748b" />
              <View style={styles.newVerBadge}>
                <Text style={styles.newVerText}>{latestTag}</Text>
              </View>
              {isBetaRelease && (
                <View style={styles.betaBadge}>
                  <Text style={styles.betaBadgeText}>BETA</Text>
                </View>
              )}
            </View>
            {packageSizeLabel ? (
              <View style={styles.sizeBadge}>
                <Ionicons name="document-outline" size={13} color="#94a3b8" />
                <Text style={styles.sizeText}>{packageSizeLabel}</Text>
              </View>
            ) : null}
          </View>

          {/* Release Notes */}
          <View style={styles.notesSection}>
            <Text style={styles.notesHeader}>Co nowego:</Text>
            <ScrollView
              style={styles.notesScroll}
              contentContainerStyle={styles.notesScrollContent}
              showsVerticalScrollIndicator>
              <Text style={styles.notesBody}>
                {updateInfo.releaseNotes ||
                  'Poprawki błędów, optymalizacja działania oraz ulepszenia stabilności.'}
              </Text>
            </ScrollView>
          </View>

          {/* iOS Sideloading Hint */}
          {isIOS && !previewDone && (
            <View style={styles.iosHintBox}>
              <Ionicons name="information-circle-outline" size={17} color="#38bdf8" />
              <Text style={styles.iosHintText}>
                Pobierz plik IPA w Safari, a następnie zainstaluj aktualizację przez SideStore lub AltStore.
              </Text>
            </View>
          )}

          {/* Download Progress (Android) */}
          {isDownloading && (
            <View style={styles.progressBox}>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${Math.min(100, Math.max(2, percent))}%` },
                  ]}
                />
              </View>
              <View style={styles.progressMetaRow}>
                <Text style={styles.progressStatusText}>Pobieranie pakietu APK...</Text>
                <Text style={styles.progressPercentText}>
                  {writtenMB && totalMB ? `${writtenMB} / ${totalMB} • ` : ''}
                  {percent}%
                </Text>
              </View>
            </View>
          )}

          {/* Preview Completion Banner */}
          {previewDone && !isDownloading && (
            <View style={styles.previewSuccessBox}>
              <Ionicons name="checkmark-circle" size={18} color="#10b981" />
              <Text style={styles.previewSuccessText}>
                {isIOS
                  ? 'Tryb podglądu — po wydaniu nowej wersji na GitHub Releases przycisk otworzy pobieranie pliku IPA bezpośrednio w Safari.'
                  : 'Tryb podglądu — po opublikowaniu nowego wydania z plikiem APK na GitHub Releases w tym miejscu automatycznie uruchomi się instalator Androida.'}
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
                <Ionicons name="open-outline" size={15} color="#38bdf8" />
                <Text style={styles.browserFallbackText}>Pobierz w przeglądarce</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Footer Actions */}
          <View style={styles.footerRow}>
            <TouchableOpacity
              style={[styles.laterBtn, isDownloading && styles.btnDisabled]}
              disabled={isDownloading}
              onPress={handleCloseModal}>
              <Text style={styles.laterBtnText}>Później</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.installBtn, isDownloading && styles.btnDisabled]}
              disabled={isDownloading}
              onPress={handlePrimaryAction}>
              {isDownloading ? (
                <>
                  <ActivityIndicator size="small" color="#ffffff" />
                  <Text style={styles.installBtnText}>Pobieranie...</Text>
                </>
              ) : (
                <>
                  <Ionicons
                    name={primaryButtonIcon}
                    size={18}
                    color="#ffffff"
                  />
                  <Text style={styles.installBtnText}>{primaryButtonLabel}</Text>
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
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#1e293b',
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 16,
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
  headerTextCol: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f8fafc',
  },
  subtitle: {
    fontSize: 13,
    color: '#94a3b8',
  },
  versionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0f172a',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#1e293b',
    gap: 8,
  },
  versionPills: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    flex: 1,
    gap: 6,
  },
  currentVerBadge: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  currentVerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
  },
  newVerBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.16)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  newVerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#34d399',
  },
  betaBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.16)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.45)',
  },
  betaBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fbbf24',
    letterSpacing: 0.4,
  },
  sizeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sizeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
  },
  notesSection: {
    gap: 8,
  },
  notesHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  notesScroll: {
    maxHeight: 190,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  notesScrollContent: {
    padding: 12,
  },
  notesBody: {
    fontSize: 13.5,
    lineHeight: 20,
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
    gap: 8,
    backgroundColor: '#0f172a',
    padding: 12,
    borderRadius: 12,
  },
  progressTrack: {
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
  progressMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressStatusText: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '500',
  },
  progressPercentText: {
    fontSize: 12,
    color: '#38bdf8',
    fontWeight: '700',
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
    gap: 10,
    marginTop: 2,
  },
  laterBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  laterBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#cbd5e1',
  },
  installBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#3b82f6',
  },
  installBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  btnDisabled: {
    opacity: 0.6,
  },
});

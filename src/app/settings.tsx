import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Directory } from 'expo-file-system';
import { useFocusEffect, useRouter } from 'expo-router';
import { useLibrus } from '@/context/LibrusContext';
import {
  DEFAULT_SYNC_SETTINGS,
  getSyncSettings,
  isExpoGo,
  requestNotificationPermissions,
  saveSyncSettings,
  SyncSettings,
} from '@/services/backgroundSync';
import {
  DEFAULT_EXCUSE_PRESETS,
  formatDownloadFolderLabel,
  getCurrentSchoolYearId,
  getDownloadFolderUri,
  getExcusePresetsStore,
  getUpdateChannel,
  saveDownloadFolderUri,
  saveExcusePresetsStore,
  saveUpdateChannel,
  UpdateChannel,
} from '@/services/fileCache';
import { ExcusePreset, ExcusePresetsStore } from '@/types/librus';
import { formatShortStudentSignature } from '@/components/message-compose-modal';
import { ToastBanner } from '@/components/toast-banner';
import {
  APP_VERSION,
  checkForAppUpdate,
  formatVersionTag,
  getMockPreviewUpdate,
  UpdateCheckResult,
} from '@/services/updateService';
import { UpdateModal } from '@/components/update-modal';

const MAX_EXCUSE_PRESETS = 8;

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { student, clearLocalCacheAndRefresh, logout } = useLibrus();

  const [syncSettings, setSyncSettings] = useState<SyncSettings>(DEFAULT_SYNC_SETTINGS);
  const [excuseStore, setExcuseStore] = useState<ExcusePresetsStore>(() =>
    getExcusePresetsStore()
  );
  const [showExcuseAdvanced, setShowExcuseAdvanced] = useState<boolean>(() => {
    const initial = getExcusePresetsStore();
    return Boolean(
      initial.customEducatorName.trim() || initial.customSignature.trim()
    );
  });
  const [downloadFolderUri, setDownloadFolderUri] = useState<string | null>(() =>
    getDownloadFolderUri()
  );
  const [updateChannel, setUpdateChannel] = useState<UpdateChannel>(() =>
    getUpdateChannel(APP_VERSION)
  );
  const [clearingCache, setClearingCache] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateModalInfo, setUpdateModalInfo] = useState<UpdateCheckResult | null>(null);

  useEffect(() => {
    getSyncSettings().then(setSyncSettings);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.resolve().then(() => {
        if (!active) return;
        setExcuseStore(getExcusePresetsStore());
        setDownloadFolderUri(getDownloadFolderUri());
        setUpdateChannel(getUpdateChannel(APP_VERSION));
      });
      return () => {
        active = false;
      };
    }, [])
  );

  const activePreset: ExcusePreset = useMemo(() => {
    return (
      excuseStore.presets.find((p) => p.id === excuseStore.activePresetId) ??
      excuseStore.presets[0] ??
      DEFAULT_EXCUSE_PRESETS[0]
    );
  }, [excuseStore.presets, excuseStore.activePresetId]);

  const updateActivePreset = (patch: Partial<ExcusePreset>) => {
    setExcuseStore((prev) => ({
      ...prev,
      presets: prev.presets.map((p) =>
        p.id === activePreset.id ? { ...p, ...patch } : p
      ),
    }));
  };

  const handleSelectPresetTab = (presetId: string) => {
    setExcuseStore((prev) => ({ ...prev, activePresetId: presetId }));
  };

  const handleAddPreset = () => {
    if (excuseStore.presets.length >= MAX_EXCUSE_PRESETS) {
      Alert.alert(
        'Limit szablonów',
        `Możesz utworzyć maksymalnie ${MAX_EXCUSE_PRESETS} szablonów usprawiedliwień.`
      );
      return;
    }
    const nextNumber = excuseStore.presets.length + 1;
    const newPreset: ExcusePreset = {
      id: `preset-${Date.now()}`,
      name: `Szablon ${nextNumber}`,
      subject: activePreset.subject || 'Usprawiedliwienie',
      introText:
        activePreset.introText ||
        DEFAULT_EXCUSE_PRESETS[0].introText,
      reasonText: '',
    };
    const updated: ExcusePresetsStore = {
      ...excuseStore,
      activePresetId: newPreset.id,
      presets: [...excuseStore.presets, newPreset],
    };
    setExcuseStore(updated);
    saveExcusePresetsStore(updated);
    setToastMessage(`Dodano „${newPreset.name}”`);
  };

  const handleDeleteActivePreset = () => {
    if (excuseStore.presets.length <= 1) return;
    Alert.alert(
      'Usuń szablon',
      `Czy chcesz usunąć szablon „${activePreset.name || 'Szablon'}”?`,
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Usuń',
          style: 'destructive',
          onPress: () => {
            const remaining = excuseStore.presets.filter((p) => p.id !== activePreset.id);
            const updated: ExcusePresetsStore = {
              ...excuseStore,
              activePresetId: remaining[0].id,
              presets: remaining,
            };
            setExcuseStore(updated);
            saveExcusePresetsStore(updated);
            setToastMessage('Usunięto szablon');
          },
        },
      ]
    );
  };

  const handleSaveExcusePresets = () => {
    const normalizedPresets = excuseStore.presets.map((p, idx) => ({
      ...p,
      name: p.name.trim() || `Szablon ${idx + 1}`,
      subject: p.subject.trim() || 'Usprawiedliwienie',
    }));
    const updated: ExcusePresetsStore = {
      ...excuseStore,
      presets: normalizedPresets,
    };
    setExcuseStore(updated);
    saveExcusePresetsStore(updated);
    setToastMessage('Zapisano szablony usprawiedliwień');
  };

  const handleResetExcusePresets = () => {
    Alert.alert(
      'Przywróć domyślne szablony',
      'Czy chcesz przywrócić domyślną listę szablonów usprawiedliwień?',
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Przywróć',
          style: 'destructive',
          onPress: () => {
            const resetStore: ExcusePresetsStore = {
              activePresetId: DEFAULT_EXCUSE_PRESETS[0].id,
              customEducatorName: '',
              customSignature: '',
              presets: DEFAULT_EXCUSE_PRESETS.map((p) => ({ ...p })),
            };
            setExcuseStore(resetStore);
            saveExcusePresetsStore(resetStore);
            setToastMessage('Przywrócono domyślne szablony');
          },
        },
      ]
    );
  };

  const handleChangeUpdateChannel = async (channel: UpdateChannel) => {
    if (channel === updateChannel) return;
    setUpdateChannel(channel);
    saveUpdateChannel(channel);
    if (channel === 'beta') {
      setToastMessage('Kanał aktualizacji: Beta (nowe funkcje testowe)');
      try {
        const res = await checkForAppUpdate({ channelOverride: 'beta' });
        if (res.updateAvailable) {
          setUpdateModalInfo(res);
        }
      } catch {
        // Ignore network errors when switching channel
      }
    } else {
      setToastMessage('Kanał aktualizacji: Stabilny');
    }
  };

  const handleCheckForUpdates = async () => {
    setCheckingUpdate(true);
    try {
      const res = await checkForAppUpdate({ channelOverride: updateChannel });
      if (res.updateAvailable) {
        setUpdateModalInfo(res);
      } else {
        setToastMessage(
          `Masz najnowszą wersję aplikacji (${formatVersionTag(res.currentVersion)})`
        );
      }
    } catch {
      Alert.alert(
        'Błąd sprawdzania aktualizacji',
        'Nie udało się połączyć z GitHub Releases. Sprawdź połączenie z internetem.'
      );
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handlePreviewUpdateModal = () => {
    if (__DEV__) {
      setUpdateModalInfo(getMockPreviewUpdate(updateChannel));
    }
  };

  const handleChooseDownloadFolder = async () => {
    try {
      const pickedDir = await Directory.pickDirectoryAsync();
      saveDownloadFolderUri(pickedDir.uri);
      setDownloadFolderUri(pickedDir.uri);
      setToastMessage(`Zmieniono folder: ${formatDownloadFolderLabel(pickedDir.uri)}`);
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (!/cancel/i.test(msg)) {
        Alert.alert('Błąd', 'Nie udało się wybrać folderu pobierania.');
      }
    }
  };

  const handleResetDownloadFolder = () => {
    saveDownloadFolderUri(null);
    setDownloadFolderUri(null);
    setToastMessage('Przywrócono pytanie o folder przy pobraniu');
  };

  const handleToggleSync = async (enabled: boolean) => {
    if (enabled && !isExpoGo) {
      const granted = await requestNotificationPermissions();
      if (!granted) {
        Alert.alert(
          'Brak uprawnień',
          'Aplikacja wymaga uprawnień do powiadomień, aby informować Cię o nowych wiadomościach i ocenach w tle.'
        );
        return;
      }
    }
    const updated = { ...syncSettings, enabled };
    setSyncSettings(updated);
    await saveSyncSettings(updated);
  };

  const handleChangeInterval = async (intervalMinutes: number) => {
    const updated = { ...syncSettings, intervalMinutes };
    setSyncSettings(updated);
    await saveSyncSettings(updated);
  };

  const handleToggleSmartHours = async (smartHoursEnabled: boolean) => {
    const updated = { ...syncSettings, smartHoursEnabled };
    setSyncSettings(updated);
    await saveSyncSettings(updated);
  };

  const handleClearCache = () => {
    Alert.alert(
      'Wyczyść pamięć podręczną',
      'Zapisane oceny, plan lekcji, frekwencja i wiadomości zostaną pobrane na nowo z Librusa. Twoje logowanie oraz szablony pozostaną bez zmian.',
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Wyczyść i synchronizuj',
          style: 'destructive',
          onPress: async () => {
            setClearingCache(true);
            try {
              await clearLocalCacheAndRefresh();
              setToastMessage('Wyczyszczono pamięć podręczną i pobrano świeże dane');
            } finally {
              setClearingCache(false);
            }
          },
        },
      ]
    );
  };

  const handleLogout = () => {
    Alert.alert(
      'Wylogowanie',
      'Czy na pewno chcesz się wylogować ze swojego konta Librus?',
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Wyloguj',
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/login' as any);
          },
        },
      ]
    );
  };

  const autoSignature = formatShortStudentSignature(student?.name);
  const schoolYearId = getCurrentSchoolYearId();

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Ustawienia</Text>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingBottom: Math.max(insets.bottom + 24, 40) },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {/* Profile Card */}
        <View style={styles.card}>
          <View style={styles.avatarRow}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarLetter}>
                {student?.name ? student.name[0] : 'U'}
              </Text>
            </View>
            <View style={styles.profileInfo}>
              <View style={styles.profileTopLine}>
                <Text style={styles.studentName} numberOfLines={1}>
                  {student?.name || 'Uczeń'}
                </Text>
                <View style={styles.schoolYearBadge}>
                  <Text style={styles.schoolYearBadgeText}>{schoolYearId}</Text>
                </View>
              </View>
              <Text style={styles.studentClass}>
                {student?.classGroup || 'Konto Librus'}
                {student?.educator ? ` • Wych. ${student.educator}` : ''}
              </Text>
            </View>
          </View>
        </View>

        {/* Excuse Presets Section */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Szablony usprawiedliwień</Text>

          <View style={[styles.card, { gap: 12 }]}>
            {/* Segmented Preset Bar (Sz1 | Sz2 | Sz3 | +) */}
            <View style={styles.presetBarContainer}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.presetTabsScroll}>
                {excuseStore.presets.map((preset, idx) => {
                  const isSelected = preset.id === activePreset.id;
                  return (
                    <TouchableOpacity
                      key={preset.id}
                      activeOpacity={0.8}
                      onPress={() => handleSelectPresetTab(preset.id)}
                      style={[
                        styles.presetTab,
                        isSelected && styles.presetTabActive,
                      ]}>
                      <Text
                        style={[
                          styles.presetTabText,
                          isSelected && styles.presetTabTextActive,
                        ]}
                        numberOfLines={1}>
                        {preset.name.trim() || `Sz${idx + 1}`}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                {excuseStore.presets.length < MAX_EXCUSE_PRESETS && (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={handleAddPreset}
                    style={styles.presetAddBtn}>
                    <Ionicons name="add" size={16} color="#38bdf8" />
                    <Text style={styles.presetAddBtnText}>Dodaj</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            </View>

            {/* Preset Name & Delete */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.inputLabel}>Nazwa szablonu</Text>
                {excuseStore.presets.length > 1 && (
                  <TouchableOpacity
                    onPress={handleDeleteActivePreset}
                    hitSlop={8}
                    style={styles.deletePresetBtn}>
                    <Ionicons name="trash-outline" size={13} color="#ef4444" />
                    <Text style={styles.deletePresetText}>Usuń szablon</Text>
                  </TouchableOpacity>
                )}
              </View>
              <TextInput
                value={activePreset.name}
                onChangeText={(name) => updateActivePreset({ name })}
                placeholder="Np. Rodzinne, Choroba, Lekarz..."
                placeholderTextColor="#64748b"
                style={styles.textInput}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Temat wiadomości</Text>
              <TextInput
                value={activePreset.subject}
                onChangeText={(subject) => updateActivePreset({ subject })}
                placeholder="Usprawiedliwienie"
                placeholderTextColor="#64748b"
                style={styles.textInput}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Tekst powitania (przed listą dat)</Text>
              <TextInput
                value={activePreset.introText}
                onChangeText={(introText) => updateActivePreset({ introText })}
                multiline
                style={[styles.textInput, styles.textInputMultiline]}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Powód nieobecności (po liście dat)</Text>
              <TextInput
                value={activePreset.reasonText}
                onChangeText={(reasonText) => updateActivePreset({ reasonText })}
                placeholder="Np. Nieobecność była spowodowana ważnymi względami rodzinnymi."
                placeholderTextColor="#64748b"
                multiline
                style={[styles.textInput, styles.textInputMultiline]}
              />
            </View>

            {/* Collapsible Educator & Signature Overrides */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setShowExcuseAdvanced((prev) => !prev)}
              style={styles.advancedToggleRow}>
              <Text style={styles.advancedToggleText}>
                Nadpisz wychowawcę lub podpis (opcjonalnie)
              </Text>
              <Ionicons
                name={showExcuseAdvanced ? 'chevron-up' : 'chevron-down'}
                size={16}
                color="#94a3b8"
              />
            </TouchableOpacity>

            {showExcuseAdvanced && (
              <View style={styles.advancedFieldsWrap}>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Wychowawca klasy</Text>
                  <TextInput
                    value={excuseStore.customEducatorName}
                    onChangeText={(customEducatorName) =>
                      setExcuseStore((prev) => ({ ...prev, customEducatorName }))
                    }
                    placeholder={
                      student?.educator
                        ? `Domyślnie z Librusa: ${student.educator}`
                        : 'Domyślnie wykrywany z Librusa'
                    }
                    placeholderTextColor="#64748b"
                    style={styles.textInput}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Podpis pod wiadomością</Text>
                  <TextInput
                    value={excuseStore.customSignature}
                    onChangeText={(customSignature) =>
                      setExcuseStore((prev) => ({ ...prev, customSignature }))
                    }
                    placeholder={`Domyślnie z Librusa: ${autoSignature}`}
                    placeholderTextColor="#64748b"
                    style={styles.textInput}
                  />
                </View>
              </View>
            )}

            <View style={styles.templateButtonsRow}>
              <TouchableOpacity
                onPress={handleResetExcusePresets}
                style={styles.resetTemplateBtn}>
                <Text style={styles.resetTemplateBtnText}>Domyślne</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveExcusePresets}
                style={styles.saveTemplateBtn}>
                <Ionicons name="checkmark-circle-outline" size={17} color="#ffffff" />
                <Text style={styles.saveTemplateBtnText}>Zapisz szablon</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Notifications */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Powiadomienia</Text>

          {isExpoGo && (
            <View style={styles.expoGoBanner}>
              <Ionicons name="information-circle-outline" size={17} color="#38bdf8" />
              <Text style={styles.expoGoBannerDesc}>
                {Platform.OS === 'ios'
                  ? 'Tryb Expo Go — powiadomienia w tle aktywują się po zainstalowaniu aplikacji IPA.'
                  : 'Tryb Expo Go — powiadomienia w tle aktywują się po zainstalowaniu aplikacji APK.'}
              </Text>
            </View>
          )}

          <View style={styles.card}>
            <View style={styles.switchRow}>
              <View style={styles.switchTextCol}>
                <Text style={styles.switchTitle}>Powiadomienia w tle</Text>
                <Text style={styles.switchDesc}>
                  Automatycznie sprawdza nowe wiadomości, oceny i zmiany w planie
                </Text>
              </View>
              <Switch
                value={syncSettings.enabled}
                onValueChange={handleToggleSync}
                thumbColor={syncSettings.enabled ? '#38bdf8' : '#94a3b8'}
                trackColor={{ false: '#334155', true: '#38bdf840' }}
              />
            </View>

            {syncSettings.enabled && (
              <>
                <View style={styles.divider} />

                <View style={styles.settingBlock}>
                  <Text style={styles.settingLabel}>Częstotliwość sprawdzania</Text>
                  <View style={styles.intervalOptionsRow}>
                    {[
                      { label: '15 min', val: 15 },
                      { label: '30 min', val: 30 },
                      { label: '1 godz.', val: 60 },
                      { label: '2 godz.', val: 120 },
                    ].map((opt) => (
                      <TouchableOpacity
                        key={opt.val}
                        style={[
                          styles.intervalChip,
                          syncSettings.intervalMinutes === opt.val &&
                            styles.intervalChipActive,
                        ]}
                        onPress={() => handleChangeInterval(opt.val)}>
                        <Text
                          style={[
                            styles.intervalChipText,
                            syncSettings.intervalMinutes === opt.val &&
                              styles.intervalChipTextActive,
                          ]}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={styles.divider} />

                <View style={styles.switchRow}>
                  <View style={styles.switchTextCol}>
                    <Text style={styles.switchTitle}>Smart Hours</Text>
                    <Text style={styles.switchDesc}>
                      Sprawdza tylko w dni nauki (Pn–Pt, 07:30–18:00), oszczędzając baterię w nocy i w weekendy
                    </Text>
                  </View>
                  <Switch
                    value={syncSettings.smartHoursEnabled}
                    onValueChange={handleToggleSmartHours}
                    thumbColor={syncSettings.smartHoursEnabled ? '#38bdf8' : '#94a3b8'}
                    trackColor={{ false: '#334155', true: '#38bdf840' }}
                  />
                </View>
              </>
            )}
          </View>
        </View>

        {/* Data & Files (Merged Download Folder + Cache) */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Dane i pliki</Text>

          <View style={styles.card}>
            {Platform.OS === 'android' && (
              <>
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={styles.folderMainTap}
                    activeOpacity={0.8}
                    onPress={handleChooseDownloadFolder}>
                    <Ionicons name="folder-open-outline" size={20} color="#38bdf8" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.actionTitle}>Folder zapisu załączników</Text>
                      <Text style={styles.actionSubText} numberOfLines={1}>
                        {formatDownloadFolderLabel(downloadFolderUri)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  {downloadFolderUri ? (
                    <TouchableOpacity
                      onPress={handleResetDownloadFolder}
                      style={styles.inlineResetPill}>
                      <Text style={styles.inlineResetPillText}>Resetuj</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity onPress={handleChooseDownloadFolder} hitSlop={8}>
                      <Ionicons name="chevron-forward" size={18} color="#64748b" />
                    </TouchableOpacity>
                  )}
                </View>

                <View style={styles.divider} />
              </>
            )}

            <TouchableOpacity
              style={styles.actionRow}
              disabled={clearingCache}
              onPress={handleClearCache}>
              {clearingCache ? (
                <ActivityIndicator size="small" color="#f59e0b" />
              ) : (
                <Ionicons name="trash-outline" size={20} color="#f59e0b" />
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.actionTitle}>
                  {clearingCache
                    ? 'Synchronizowanie danych...'
                    : 'Wyczyść pamięć podręczną'}
                </Text>
                <Text style={styles.actionSubText}>
                  Pobiera od nowa plan, oceny i wiadomości z Librusa
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#64748b" />
            </TouchableOpacity>
          </View>
        </View>

        {/* App Info & Updates */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>O aplikacji Ligmus</Text>

          <View style={styles.card}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Wersja</Text>
              <View style={styles.versionValueRow}>
                <Text style={styles.infoValue}>{formatVersionTag(APP_VERSION)}</Text>
                {APP_VERSION.includes('-') && (
                  <View style={styles.versionBetaBadge}>
                    <Text style={styles.versionBetaBadgeText}>BETA</Text>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.settingBlock}>
              <Text style={styles.settingLabel}>Kanał aktualizacji</Text>
              <View style={styles.intervalOptionsRow}>
                {(
                  [
                    { label: 'Stabilny', val: 'stable' as UpdateChannel },
                    { label: 'Beta', val: 'beta' as UpdateChannel },
                  ]
                ).map((opt) => {
                  const isActive = updateChannel === opt.val;
                  return (
                    <TouchableOpacity
                      key={opt.val}
                      style={[
                        styles.intervalChip,
                        isActive &&
                          (opt.val === 'beta'
                            ? styles.betaChannelChipActive
                            : styles.intervalChipActive),
                      ]}
                      onPress={() => handleChangeUpdateChannel(opt.val)}>
                      <Text
                        style={[
                          styles.intervalChipText,
                          isActive &&
                            (opt.val === 'beta'
                              ? styles.betaChannelChipTextActive
                              : styles.intervalChipTextActive),
                        ]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.channelDescText}>
                {updateChannel === 'beta'
                  ? 'Wcześniejszy dostęp do nowych funkcji testowych (beta-updates) oraz wydań stabilnych.'
                  : 'Tylko sprawdzone wydania główne z gałęzi stabilnej (master).'}
              </Text>
            </View>

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.actionRow}
              disabled={checkingUpdate}
              onPress={handleCheckForUpdates}
              onLongPress={__DEV__ ? handlePreviewUpdateModal : undefined}
              delayLongPress={500}>
              {checkingUpdate ? (
                <ActivityIndicator size="small" color="#38bdf8" />
              ) : (
                <Ionicons name="cloud-download-outline" size={20} color="#38bdf8" />
              )}
              <Text style={styles.actionText}>Sprawdź aktualizacje</Text>
              <Ionicons name="chevron-forward" size={18} color="#64748b" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color="#ef4444" />
          <Text style={styles.logoutButtonText}>Wyloguj się z Librusa</Text>
        </TouchableOpacity>
      </ScrollView>

      <UpdateModal
        visible={Boolean(updateModalInfo)}
        updateInfo={updateModalInfo}
        onClose={() => setUpdateModalInfo(null)}
      />
      <ToastBanner message={toastMessage} onHide={() => setToastMessage(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 6,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#f8fafc',
  },
  container: {
    padding: 18,
    gap: 18,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 15,
    borderWidth: 1,
    borderColor: '#334155',
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13,
  },
  avatarLetter: {
    fontSize: 20,
    fontWeight: '800',
    color: '#ffffff',
  },
  profileInfo: {
    flex: 1,
  },
  profileTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  studentName: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#f8fafc',
  },
  schoolYearBadge: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
  },
  schoolYearBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94a3b8',
  },
  studentClass: {
    fontSize: 12.5,
    color: '#38bdf8',
    marginTop: 3,
    fontWeight: '600',
  },
  section: {
    gap: 8,
  },
  sectionHeader: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginLeft: 4,
  },
  presetBarContainer: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 4,
  },
  presetTabsScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  presetTab: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  presetTabActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.16)',
    borderColor: '#38bdf8',
  },
  presetTabText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#94a3b8',
  },
  presetTabTextActive: {
    color: '#f8fafc',
    fontWeight: '700',
  },
  presetAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 9,
  },
  presetAddBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#38bdf8',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  deletePresetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  deletePresetText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#ef4444',
  },
  inputGroup: {
    gap: 5,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#cbd5e1',
  },
  textInput: {
    backgroundColor: '#0f172a',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: '#f8fafc',
    fontSize: 13,
  },
  textInputMultiline: {
    minHeight: 54,
    textAlignVertical: 'top',
  },
  advancedToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  advancedToggleText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#94a3b8',
  },
  advancedFieldsWrap: {
    gap: 10,
    paddingTop: 2,
  },
  templateButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
  },
  resetTemplateBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 11,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetTemplateBtnText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
  saveTemplateBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#3b82f6',
    paddingVertical: 10,
    borderRadius: 11,
  },
  saveTemplateBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: '#334155',
    marginVertical: 11,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 3,
  },
  folderMainTap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionTitle: {
    fontSize: 14,
    color: '#f8fafc',
    fontWeight: '600',
  },
  actionText: {
    flex: 1,
    fontSize: 14,
    color: '#f8fafc',
    fontWeight: '600',
  },
  actionSubText: {
    fontSize: 11.5,
    color: '#94a3b8',
    marginTop: 2,
  },
  inlineResetPill: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  inlineResetPillText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#cbd5e1',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  versionValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  versionBetaBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.45)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  versionBetaBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fbbf24',
    letterSpacing: 0.4,
  },
  betaChannelChipActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.16)',
    borderColor: '#f59e0b',
  },
  betaChannelChipTextActive: {
    color: '#fbbf24',
    fontWeight: '700',
  },
  channelDescText: {
    fontSize: 11.5,
    color: '#94a3b8',
    lineHeight: 16,
  },
  infoLabel: {
    fontSize: 13.5,
    color: '#94a3b8',
  },
  infoValue: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#f8fafc',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ef444415',
    borderWidth: 1,
    borderColor: '#ef444440',
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 4,
  },
  logoutButtonText: {
    color: '#ef4444',
    fontSize: 15,
    fontWeight: '700',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  switchTextCol: {
    flex: 1,
  },
  switchTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f8fafc',
  },
  switchDesc: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
    lineHeight: 16,
  },
  settingBlock: {
    gap: 8,
  },
  settingLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94a3b8',
  },
  intervalOptionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  intervalChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  intervalChipActive: {
    backgroundColor: '#38bdf820',
    borderColor: '#38bdf8',
  },
  intervalChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
  },
  intervalChipTextActive: {
    color: '#38bdf8',
    fontWeight: '700',
  },
  expoGoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0369a120',
    borderWidth: 1,
    borderColor: '#38bdf840',
    borderRadius: 11,
    paddingHorizontal: 11,
    paddingVertical: 8,
    gap: 8,
  },
  expoGoBannerDesc: {
    flex: 1,
    fontSize: 11.5,
    color: '#cbd5e1',
    lineHeight: 15,
  },
});

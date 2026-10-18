import React, { useEffect, useState } from 'react';
import {
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
import { useRouter } from 'expo-router';
import { useLibrus } from '@/context/LibrusContext';
import {
  DEFAULT_SYNC_SETTINGS,
  getSyncSettings,
  isExpoGo,
  requestNotificationPermissions,
  saveSyncSettings,
  sendTestNotification,
  SyncSettings,
} from '@/services/backgroundSync';
import {
  DEFAULT_EXCUSE_SETTINGS,
  getCurrentSchoolYearId,
  getExcuseSettings,
  saveExcuseSettings,
} from '@/services/fileCache';
import { ExcuseTemplateSettings } from '@/types/librus';
import { formatShortStudentSignature } from '@/components/message-compose-modal';

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    student,
    isLoading,
    refreshData,
    clearLocalCacheAndRefresh,
    logout,
  } = useLibrus();

  const [syncSettings, setSyncSettings] = useState<SyncSettings>(DEFAULT_SYNC_SETTINGS);
  const [excuseTemplate, setExcuseTemplate] = useState<ExcuseTemplateSettings>(
    DEFAULT_EXCUSE_SETTINGS
  );

  useEffect(() => {
    getSyncSettings().then(setSyncSettings);
    setExcuseTemplate(getExcuseSettings());
  }, []);

  const handleToggleSync = async (enabled: boolean) => {
    if (enabled && !isExpoGo) {
      const granted = await requestNotificationPermissions();
      if (!granted) {
        Alert.alert(
          'Brak uprawnień',
          'Aplikacja wymaga uprawnień do powiadomień, aby móc informować Cię o nowych ocenach i wiadomościach w tle.'
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

  const handleSendTestNotification = async () => {
    if (isExpoGo) {
      Alert.alert(
        'Tryb Expo Go',
        'Powiadomienia push oraz w tle wymagają dedykowanej paczki APK (komenda: npx expo run:android), z uwagi na ograniczenia modułów natywnych w Expo Go.'
      );
      return;
    }
    const granted = await requestNotificationPermissions();
    if (!granted) {
      Alert.alert(
        'Brak uprawnień',
        'Zezwól na powiadomienia w ustawieniach systemu, aby odebrać powiadomienie testowe.'
      );
      return;
    }
    const success = await sendTestNotification();
    if (success) {
      Alert.alert('Sukces', 'Wysłano testowe powiadomienie! Sprawdź pasek powiadomień.');
    } else {
      Alert.alert('Błąd', 'Nie udało się wysłać testowego powiadomienia.');
    }
  };

  const handleSaveExcuseTemplate = () => {
    saveExcuseSettings(excuseTemplate);
    Alert.alert('Zapisano', 'Szablon usprawiedliwień został zapisany.');
  };

  const handleResetExcuseTemplate = () => {
    setExcuseTemplate(DEFAULT_EXCUSE_SETTINGS);
    saveExcuseSettings(DEFAULT_EXCUSE_SETTINGS);
    Alert.alert('Przywrócono', 'Przywrócono domyślny szablon usprawiedliwień.');
  };

  const handleClearCache = () => {
    Alert.alert(
      'Wyczyść pamięć podręczną',
      'Czy chcesz wyczyścić zapisane dane ocen, planu lekcji, frekwencji oraz wiadomości i pobrać je na nowo z Librusa? Twoje dane logowania oraz szablony zostaną zachowane.',
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Wyczyść i odśwież',
          style: 'destructive',
          onPress: async () => {
            await clearLocalCacheAndRefresh();
            Alert.alert('Gotowe', 'Pamięć podręczna została wyczyszczona i odświeżona.');
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
              <Text style={styles.studentName}>{student?.name || 'Uczeń'}</Text>
              <Text style={styles.studentClass}>
                {student?.classGroup || 'Konto Librus'}
              </Text>
              {student?.educator ? (
                <Text style={styles.studentMeta}>
                  Wychowawca: {student.educator}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        {/* Excuse Template Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Szablon usprawiedliwień</Text>

          <View style={[styles.card, { gap: 12 }]}>
            <Text style={styles.templateHint}>
              Dostosuj domyślny tekst generowany po kliknięciu przycisku „Usprawiedliwienie” w zakładce Wiadomości.
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Temat wiadomości</Text>
              <TextInput
                value={excuseTemplate.subject}
                onChangeText={(subject) =>
                  setExcuseTemplate((prev) => ({ ...prev, subject }))
                }
                placeholder="Usprawiedliwienie"
                placeholderTextColor="#64748b"
                style={styles.textInput}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>
                Wychowawca klasy (opcjonalnie nadpisz)
              </Text>
              <TextInput
                value={excuseTemplate.customEducatorName}
                onChangeText={(customEducatorName) =>
                  setExcuseTemplate((prev) => ({ ...prev, customEducatorName }))
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
              <Text style={styles.inputLabel}>Tekst powitania (przed listą dat)</Text>
              <TextInput
                value={excuseTemplate.introText}
                onChangeText={(introText) =>
                  setExcuseTemplate((prev) => ({ ...prev, introText }))
                }
                multiline
                style={[styles.textInput, styles.textInputMultiline]}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Powód nieobecności (po liście dat)</Text>
              <TextInput
                value={excuseTemplate.reasonText}
                onChangeText={(reasonText) =>
                  setExcuseTemplate((prev) => ({ ...prev, reasonText }))
                }
                multiline
                style={[styles.textInput, styles.textInputMultiline]}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Podpis pod wiadomością</Text>
              <TextInput
                value={excuseTemplate.customSignature}
                onChangeText={(customSignature) =>
                  setExcuseTemplate((prev) => ({ ...prev, customSignature }))
                }
                placeholder={`Domyślnie z Librusa: ${autoSignature}`}
                placeholderTextColor="#64748b"
                style={styles.textInput}
              />
            </View>

            <View style={styles.templateButtonsRow}>
              <TouchableOpacity
                onPress={handleResetExcuseTemplate}
                style={styles.resetTemplateBtn}>
                <Text style={styles.resetTemplateBtnText}>Domyślne</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveExcuseTemplate}
                style={styles.saveTemplateBtn}>
                <Ionicons name="checkmark-circle-outline" size={17} color="#ffffff" />
                <Text style={styles.saveTemplateBtnText}>Zapisz szablon</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Account / Connection Status & School Year Cache */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>
            Konto i pamięć podręczna ({schoolYearId})
          </Text>

          <View style={styles.card}>
            <TouchableOpacity
              style={styles.actionRow}
              onPress={async () => {
                await refreshData();
                Alert.alert('Sukces', 'Dane zostały pomyślnie odświeżone!');
              }}>
              <Ionicons name="sync-outline" size={20} color="#38bdf8" />
              <Text style={styles.actionText}>
                {isLoading ? 'Odświeżanie...' : 'Wymuś odświeżenie danych'}
              </Text>
              <Ionicons name="chevron-forward" size={18} color="#64748b" />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.actionRow}
              onPress={handleClearCache}>
              <Ionicons name="trash-outline" size={20} color="#f59e0b" />
              <View style={{ flex: 1 }}>
                <Text style={styles.actionText}>Wyczyść pamięć podręczną</Text>
                <Text style={styles.actionSubText}>
                  Automatyczny reset następuje co roku 1 września ({schoolYearId})
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#64748b" />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.actionRow}
              onPress={() => router.push('/login' as any)}>
              <Ionicons name="key-outline" size={20} color="#38bdf8" />
              <Text style={styles.actionText}>Zmień konto / Zaloguj ponownie</Text>
              <Ionicons name="chevron-forward" size={18} color="#64748b" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Smart Sync & Notifications */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Powiadomienia i Smart Sync</Text>

          {isExpoGo && (
            <View style={styles.expoGoBanner}>
              <Ionicons name="information-circle-outline" size={20} color="#38bdf8" />
              <View style={styles.expoGoBannerTextCol}>
                <Text style={styles.expoGoBannerTitle}>Tryb podglądu Expo Go</Text>
                <Text style={styles.expoGoBannerDesc}>
                  Konfiguracja interfejsu i ustawień jest aktywna. Wysyłanie powiadomień w tle wymaga własnej paczki APK (<Text style={styles.expoGoCode}>npx expo run:android</Text>).
                </Text>
              </View>
            </View>
          )}

          <View style={styles.card}>
            {/* Toggle Background Notifications */}
            <View style={styles.switchRow}>
              <View style={styles.switchTextCol}>
                <Text style={styles.switchTitle}>Powiadomienia w tle</Text>
                <Text style={styles.switchDesc}>
                  Automatycznie sprawdza nowe oceny, wiadomości i zmiany w planie
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

                {/* Interval Selector */}
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
                          syncSettings.intervalMinutes === opt.val && styles.intervalChipActive,
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

                {/* Smart Hours Toggle */}
                <View style={styles.switchRow}>
                  <View style={styles.switchTextCol}>
                    <Text style={styles.switchTitle}>Tryb szkolny (Smart Hours)</Text>
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

                <View style={styles.divider} />

                {/* Test Notification Button */}
                <TouchableOpacity
                  style={styles.actionRow}
                  onPress={handleSendTestNotification}>
                  <Ionicons name="notifications-outline" size={20} color="#38bdf8" />
                  <Text style={styles.actionText}>Wyślij testowe powiadomienie</Text>
                  <Ionicons name="chevron-forward" size={18} color="#64748b" />
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* Privacy & App Info */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>O aplikacji Ligmus</Text>

          <View style={styles.card}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Wersja</Text>
              <Text style={styles.infoValue}>v0.5.5-alpha</Text>
            </View>
          </View>
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color="#ef4444" />
          <Text style={styles.logoutButtonText}>Wyloguj się z Librusa</Text>
        </TouchableOpacity>
      </ScrollView>
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
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#f8fafc',
  },
  container: {
    padding: 18,
    gap: 20,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  avatarLetter: {
    fontSize: 22,
    fontWeight: '800',
    color: '#ffffff',
  },
  profileInfo: {
    flex: 1,
  },
  studentName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f8fafc',
  },
  studentClass: {
    fontSize: 13,
    color: '#38bdf8',
    marginTop: 2,
    fontWeight: '600',
  },
  studentMeta: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  section: {
    gap: 8,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginLeft: 4,
  },
  templateHint: {
    fontSize: 12,
    color: '#94a3b8',
    lineHeight: 17,
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
    minHeight: 58,
    textAlignVertical: 'top',
  },
  templateButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
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
    marginVertical: 12,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  actionText: {
    flex: 1,
    fontSize: 14,
    color: '#f8fafc',
    fontWeight: '600',
  },
  actionSubText: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  infoLabel: {
    fontSize: 13,
    color: '#94a3b8',
  },
  infoValue: {
    fontSize: 13,
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
    marginTop: 6,
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
    alignItems: 'flex-start',
    backgroundColor: '#0369a120',
    borderWidth: 1,
    borderColor: '#38bdf840',
    borderRadius: 12,
    padding: 12,
    gap: 10,
    marginBottom: 10,
  },
  expoGoBannerTextCol: {
    flex: 1,
    gap: 2,
  },
  expoGoBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#38bdf8',
  },
  expoGoBannerDesc: {
    fontSize: 12,
    color: '#cbd5e1',
    lineHeight: 16,
  },
  expoGoCode: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#38bdf8',
    fontWeight: '600',
  },
});

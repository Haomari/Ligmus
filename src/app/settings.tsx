import React from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useLibrus } from '@/context/LibrusContext';

export default function SettingsScreen() {
  const router = useRouter();
  const { student, isDemo, isLoading, refreshData, logout } = useLibrus();

  const handleLogout = () => {
    Alert.alert(
      'Wylogowanie',
      'Czy na pewno chcesz się wylogować i zresetować zapisaną sesję?',
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Wyloguj',
          style: 'destructive',
          onPress: async () => {
            await logout();
            Alert.alert('Wylogowano', 'Powrócono do trybu demonstracyjnego.');
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Ustawienia</Text>
      </View>

      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
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
              <Text style={styles.studentClass}>{student?.classGroup}</Text>
              <Text style={styles.studentMeta}>
                Wychowawca: {student?.educator}
              </Text>
            </View>
          </View>
        </View>

        {/* Account / Connection Status */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Konto i połączenie</Text>

          <View style={styles.card}>
            <View style={styles.settingRow}>
              <View style={styles.settingIconContainer}>
                <Ionicons
                  name={isDemo ? 'flask-outline' : 'checkmark-circle-outline'}
                  size={22}
                  color={isDemo ? '#f59e0b' : '#10b981'}
                />
              </View>
              <View style={styles.settingTextCol}>
                <Text style={styles.settingTitle}>
                  {isDemo ? 'Aktywny Tryb Demo' : 'Połączono z Librus Synergia'}
                </Text>
                <Text style={styles.settingDesc}>
                  {isDemo
                    ? 'Wyświetlasz przykładowe dane demonstracyjne.'
                    : 'Aplikacja pobiera Twoje rzeczywiste oceny i plan.'}
                </Text>
              </View>
            </View>

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.actionRow}
              onPress={() => router.push('/login' as any)}>
              <Ionicons name="key-outline" size={20} color="#38bdf8" />
              <Text style={styles.actionText}>
                {isDemo ? 'Zaloguj się swoim kontem Librus' : 'Zmień konto / Zaloguj ponownie'}
              </Text>
              <Ionicons name="chevron-forward" size={18} color="#64748b" />
            </TouchableOpacity>

            <View style={styles.divider} />

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
          </View>
        </View>

        {/* Privacy & App Info */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>O aplikacji Ligmus</Text>

          <View style={styles.card}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Wersja</Text>
              <Text style={styles.infoValue}>1.0.0 (Direct Mobile Edition)</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Prywatność</Text>
              <Text style={styles.infoValue}>100% lokalnie na urządzeniu</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Serwer zewnętrzny</Text>
              <Text style={styles.infoValue}>Brak (Zero-Server Architecture)</Text>
            </View>
          </View>
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color="#ef4444" />
          <Text style={styles.logoutButtonText}>Wyczyść sesję i zresetuj</Text>
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
    fontSize: 14,
    fontWeight: '600',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginLeft: 4,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingIconContainer: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  settingTextCol: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f8fafc',
  },
  settingDesc: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
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
});

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useLibrus } from '@/context/LibrusContext';
import { AuthInvalidState } from '@/services/librusClient';

export const CredentialsWarningBanner: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { isAuthenticated, authInvalidState, openCredentialsModal } = useLibrus();

  if (!isAuthenticated || !authInvalidState) {
    return null;
  }

  return (
    <View
      style={[
        styles.bannerWrapper,
        { paddingTop: Math.max(insets.top + 6, 10) },
      ]}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={openCredentialsModal}
        style={styles.bannerCard}>
        <View style={styles.bannerIconWrap}>
          <Ionicons name="key-outline" size={17} color="#fbbf24" />
        </View>
        <View style={styles.bannerTextCol}>
          <Text style={styles.bannerTitle} numberOfLines={1}>
            Wymagana aktualizacja hasła Librus
          </Text>
          <Text style={styles.bannerSubtitle} numberOfLines={1}>
            Tryb offline · Dotknij, aby wpisać nowe hasło
          </Text>
        </View>
        <View style={styles.bannerActionPill}>
          <Text style={styles.bannerActionText}>Zaktualizuj</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
};

interface CredentialsModalBodyProps {
  initialLogin: string;
  invalidState: AuthInvalidState | null;
  onDismiss: () => void;
  onSubmitCredentials: (
    login: string,
    pass: string
  ) => Promise<{ success: boolean; error?: string }>;
  onFullLogout: () => Promise<void>;
}

const CredentialsModalBody: React.FC<CredentialsModalBodyProps> = ({
  initialLogin,
  invalidState,
  onDismiss,
  onSubmitCredentials,
  onFullLogout,
}) => {
  const [username, setUsername] = useState(initialLogin);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isExpiredAlert = Boolean(invalidState);
  const accentColor = isExpiredAlert ? '#f59e0b' : '#38bdf8';

  const handleSubmit = async () => {
    if (submitting) return;
    const cleanUser = username.trim();
    const cleanPass = password.trim();

    if (!cleanUser || !cleanPass) {
      setErrorMessage('Wprowadź login oraz aktualne hasło do Librusa.');
      return;
    }

    setErrorMessage(null);
    setSubmitting(true);
    try {
      const res = await onSubmitCredentials(cleanUser, cleanPass);
      if (!res.success) {
        setErrorMessage(
          res.error || 'Nie udało się zalogować. Sprawdź poprawność nowego hasła.'
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmLogout = () => {
    if (submitting) return;
    Alert.alert(
      'Wylogować całkowicie?',
      'Spowoduje to usunięcie zapisanych danych offline z tego urządzenia i powrót do ekranu logowania.',
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Wyloguj',
          style: 'destructive',
          onPress: () => {
            void onFullLogout();
          },
        },
      ]
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.keyboardContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Pressable
        style={styles.backdrop}
        onPress={submitting ? undefined : onDismiss}>
        <Pressable style={styles.card} onPress={() => {}}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View
              style={[
                styles.iconCircle,
                {
                  backgroundColor: `${accentColor}1C`,
                  borderColor: `${accentColor}4D`,
                },
              ]}>
              <Ionicons name="key-outline" size={20} color={accentColor} />
            </View>

            <View style={styles.headerTextCol}>
              <Text style={styles.title} numberOfLines={1}>
                {isExpiredAlert
                  ? 'Zaktualizuj hasło Librus'
                  : 'Zmień zapisane hasło'}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.closeBtn}
              disabled={submitting}
              onPress={onDismiss}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={18} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          <Text style={styles.subtitle} numberOfLines={1}>
            {isExpiredAlert
              ? 'Wpisz nowe hasło — dane offline zostaną zachowane.'
              : 'Dane offline zostaną zachowane.'}
          </Text>

          {/* Server rejection reason when triggered automatically */}
          {isExpiredAlert && invalidState?.message && !errorMessage ? (
            <View style={styles.serverReasonBox}>
              <Ionicons
                name="information-circle-outline"
                size={16}
                color="#fbbf24"
              />
              <Text style={styles.serverReasonText} numberOfLines={2}>
                Librus: {invalidState.message}
              </Text>
            </View>
          ) : null}

          {/* Validation / Attempt Error */}
          {errorMessage ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={17} color="#f87171" />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          {/* Inputs */}
          <View style={styles.form}>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Login Librus</Text>
              <View style={styles.inputContainer}>
                <Ionicons
                  name="person-outline"
                  size={18}
                  color="#94a3b8"
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Login (xxxxxxxu)"
                  placeholderTextColor="#64748b"
                  value={username}
                  onChangeText={setUsername}
                  editable={!submitting}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Nowe hasło</Text>
              <View style={styles.inputContainer}>
                <Ionicons
                  name="lock-closed-outline"
                  size={18}
                  color="#94a3b8"
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Wpisz aktualne hasło"
                  placeholderTextColor="#64748b"
                  value={password}
                  onChangeText={setPassword}
                  editable={!submitting}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword((prev) => !prev)}
                  style={styles.eyeButton}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={19}
                    color="#94a3b8"
                  />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Actions */}
          <View style={styles.actionsCol}>
            <TouchableOpacity
              activeOpacity={0.85}
              disabled={submitting}
              onPress={handleSubmit}
              style={[
                styles.primaryButton,
                submitting && styles.primaryButtonDisabled,
              ]}>
              {submitting ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <>
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={18}
                    color="#ffffff"
                  />
                  <Text style={styles.primaryButtonText}>Zapisz i połącz</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              disabled={submitting}
              onPress={onDismiss}
              style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>
                {isExpiredAlert ? 'Później (tryb offline)' : 'Anuluj'}
              </Text>
            </TouchableOpacity>

            {isExpiredAlert && (
              <TouchableOpacity
                activeOpacity={0.75}
                disabled={submitting}
                onPress={handleConfirmLogout}
                style={styles.logoutLinkBtn}>
                <Ionicons name="log-out-outline" size={15} color="#f87171" />
                <Text style={styles.logoutLinkText}>
                  Wyloguj całkowicie z konta
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </Pressable>
      </Pressable>
    </KeyboardAvoidingView>
  );
};

export const CredentialsUpdateModal: React.FC = () => {
  const router = useRouter();
  const {
    isAuthenticated,
    credentialsModalVisible,
    authInvalidState,
    savedLogin,
    dismissCredentialsModal,
    updateCredentials,
    logout,
  } = useLibrus();

  if (!isAuthenticated || !credentialsModalVisible) {
    return null;
  }

  const effectiveInitialLogin = authInvalidState?.login || savedLogin || '';
  const modalKey = `${effectiveInitialLogin}-${authInvalidState?.detectedAt ?? 'manual'}`;

  const handleFullLogout = async () => {
    await logout();
    router.replace('/login' as any);
  };

  return (
    <Modal
      visible={credentialsModalVisible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={dismissCredentialsModal}>
      <CredentialsModalBody
        key={modalKey}
        initialLogin={effectiveInitialLogin}
        invalidState={authInvalidState}
        onDismiss={dismissCredentialsModal}
        onSubmitCredentials={updateCredentials}
        onFullLogout={handleFullLogout}
      />
    </Modal>
  );
};

const styles = StyleSheet.create({
  bannerWrapper: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 12,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(245, 158, 11, 0.28)',
  },
  bannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.45)',
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  bannerIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerTextCol: {
    flex: 1,
    minWidth: 0,
  },
  bannerTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#fef3c7',
  },
  bannerSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fcd34d',
    marginTop: 1,
  },
  bannerActionPill: {
    flexShrink: 0,
    backgroundColor: '#f59e0b',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  bannerActionText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#0f172a',
  },
  keyboardContainer: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#0f172a',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 18,
    gap: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextCol: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#f8fafc',
  },
  subtitle: {
    fontSize: 12.5,
    color: '#94a3b8',
    marginTop: -4,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  serverReasonBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    borderRadius: 11,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  serverReasonText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#fde68a',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.45)',
    borderRadius: 11,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  errorText: {
    flex: 1,
    fontSize: 12.5,
    color: '#fca5a5',
  },
  form: {
    gap: 11,
  },
  fieldGroup: {
    gap: 5,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#cbd5e1',
    marginLeft: 2,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 12,
    height: 48,
  },
  inputIcon: {
    marginRight: 9,
  },
  input: {
    flex: 1,
    color: '#f8fafc',
    fontSize: 14.5,
  },
  eyeButton: {
    padding: 5,
  },
  actionsCol: {
    gap: 8,
    marginTop: 2,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: '#2563eb',
    height: 48,
    borderRadius: 12,
  },
  primaryButtonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
  secondaryButton: {
    height: 42,
    borderRadius: 11,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#cbd5e1',
  },
  logoutLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  logoutLinkText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#f87171',
  },
});

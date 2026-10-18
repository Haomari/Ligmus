import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLibrus } from '@/context/LibrusContext';
import { cleanLibrusPersonName, librusClient } from '@/services/librusClient';
import {
  DEFAULT_EXCUSE_SETTINGS,
  getExcuseSettings,
  getSentExcuseDates,
  markExcuseDatesAsSent,
} from '@/services/fileCache';
import {
  ExcuseTemplateSettings,
  LibrusMessageDetail,
  MessageRecipient,
} from '@/types/librus';
import { formatExcuseDayLabel } from '@/utils/dates';

export type ComposeMode = 'compose' | 'reply' | 'excuse';

interface MessageComposeModalProps {
  visible: boolean;
  mode: ComposeMode;
  replyToMessage?: LibrusMessageDetail | null;
  onClose: () => void;
  onSentSuccess: () => void;
}

export function formatShortStudentSignature(fullName?: string): string {
  if (!fullName) return 'Uczeń';
  const cleaned = fullName.trim().replace(/\s+/g, ' ');
  const parts = cleaned.split(' ');
  if (parts.length >= 2) {
    const first = parts[0];
    const last = parts[parts.length - 1];
    return `${first[0]}. ${last}`;
  }
  return cleaned;
}

export const MessageComposeModal: React.FC<MessageComposeModalProps> = ({
  visible,
  mode,
  replyToMessage,
  onClose,
  onSentSuccess,
}) => {
  const insets = useSafeAreaInsets();
  const { student, attendanceMarks } = useLibrus();
  const scrollViewRef = useRef<ScrollView>(null);

  const [recipients, setRecipients] = useState<MessageRecipient[]>([]);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);
  const [recipientSearch, setRecipientSearch] = useState('');
  const [showRecipientPicker, setShowRecipientPicker] = useState(false);

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // Auto-Excuse state
  const [excuseSettings, setExcuseSettings] = useState<ExcuseTemplateSettings>(
    DEFAULT_EXCUSE_SETTINGS
  );
  const [sentDatesSet, setSentDatesSet] = useState<Set<string>>(new Set());
  const [selectedAbsenceDates, setSelectedAbsenceDates] = useState<string[]>([]);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setKeyboardHeight(e.endCoordinates?.height ?? 280);
      }
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardHeight(0);
      }
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Group unexcused absences (`kind === 'absent'`) by ISO date ascending
  const absenceDaysList = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const m of attendanceMarks) {
      if (m.kind === 'absent' && m.date) {
        byDate.set(m.date, (byDate.get(m.date) ?? 0) + 1);
      }
    }
    return Array.from(byDate.entries())
      .map(([date, count]) => ({
        date,
        count,
        label: formatExcuseDayLabel(date),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [attendanceMarks]);

  const buildExcuseBody = (
    datesToInclude: string[],
    tpl: ExcuseTemplateSettings
  ): string => {
    const sorted = [...datesToInclude].sort((a, b) => a.localeCompare(b));
    const dateLines =
      sorted.length > 0
        ? sorted.map((d) => `- ${formatExcuseDayLabel(d)}`).join('\n')
        : '- (brak zaznaczonych dni)';
    const sig =
      tpl.customSignature.trim() || formatShortStudentSignature(student?.name);
    return `${tpl.introText.trim()}\n${dateLines}\n\n${tpl.reasonText.trim()}\n\nZ poważaniem,\n${sig}`;
  };

  useEffect(() => {
    if (!visible) return;

    const tpl = getExcuseSettings();
    const alreadySent = new Set(getSentExcuseDates());
    setExcuseSettings(tpl);
    setSentDatesSet(alreadySent);

    if (mode === 'excuse') {
      setSubject(tpl.subject || 'Usprawiedliwienie');
      const unsentDates = absenceDaysList
        .map((d) => d.date)
        .filter((d) => !alreadySent.has(d));
      const initialDates =
        unsentDates.length > 0
          ? unsentDates
          : absenceDaysList.map((d) => d.date);
      setSelectedAbsenceDates(initialDates);
      setBody(buildExcuseBody(initialDates, tpl));
      setShowRecipientPicker(false);
    } else if (mode === 'reply' && replyToMessage) {
      const cleanSubj = replyToMessage.subject.replace(/^Re:\s*/i, '');
      setSubject(`Re: ${cleanSubj}`);
      setBody(
        `\n\n--- W odpowiedzi na wiadomość z dnia ${replyToMessage.sentAt} ---\n${replyToMessage.body}`
      );
      setShowRecipientPicker(false);
    } else {
      setSubject('');
      setBody('');
      setSelectedRecipientIds([]);
      setShowRecipientPicker(true);
    }

    // Load recipients from Synergia
    let cancelled = false;
    setLoadingRecipients(true);
    librusClient
      .getMessageRecipients()
      .then((list) => {
        if (cancelled) return;
        setRecipients(list);

        if (mode === 'excuse') {
          const customEdu = tpl.customEducatorName.trim().toLowerCase();
          const studentEdu = (student?.educator || '').trim().toLowerCase();
          const matchedEducator =
            (customEdu &&
              list.find((r) => r.name.toLowerCase().includes(customEdu))) ||
            list.find((r) => r.group === 'wychowawca') ||
            (studentEdu &&
              list.find((r) =>
                r.name
                  .toLowerCase()
                  .includes(studentEdu.split(' ')[0] || studentEdu)
              ));
          if (matchedEducator) {
            setSelectedRecipientIds([matchedEducator.id]);
          }
        } else if (mode === 'reply' && replyToMessage) {
          const senderLower = cleanLibrusPersonName(replyToMessage.sender).toLowerCase();
          const senderLastName = senderLower.split(' ')[0] || senderLower;
          const match =
            list.find((r) => r.name.toLowerCase() === senderLower) ||
            list.find((r) => r.name.toLowerCase().includes(senderLastName));
          if (match) {
            setSelectedRecipientIds([match.id]);
          }
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingRecipients(false);
      });

    return () => {
      cancelled = true;
    };
  }, [visible, mode, replyToMessage?.id]);

  const toggleAbsenceDate = (isoDate: string) => {
    setSelectedAbsenceDates((prev) => {
      const next = prev.includes(isoDate)
        ? prev.filter((d) => d !== isoDate)
        : [...prev, isoDate];
      setBody(buildExcuseBody(next, excuseSettings));
      return next;
    });
  };

  const toggleRecipient = (id: string) => {
    setSelectedRecipientIds((prev) => {
      const next = prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id];
      // Auto-collapse picker after choosing a recipient in standard compose mode
      if (mode === 'compose' && next.length === 1 && prev.length === 0) {
        setShowRecipientPicker(false);
      }
      return next;
    });
  };

  const selectedRecipientLabels = useMemo(() => {
    const map = new Map(recipients.map((r) => [r.id, cleanLibrusPersonName(r.name)]));
    return selectedRecipientIds.map((id) => map.get(id) || id);
  }, [recipients, selectedRecipientIds]);

  const educatorFallbackLabel = useMemo(() => {
    if (selectedRecipientLabels.length > 0) {
      return selectedRecipientLabels.join('; ');
    }
    if (mode === 'excuse') {
      const custom = excuseSettings.customEducatorName.trim();
      if (custom) return `${cleanLibrusPersonName(custom)} (wychowawca klasy)`;
      if (student?.educator)
        return `${cleanLibrusPersonName(student.educator)} (wychowawca klasy)`;
    }
    if (mode === 'reply' && replyToMessage) {
      return cleanLibrusPersonName(replyToMessage.sender);
    }
    return 'Wybierz odbiorcę z listy...';
  }, [
    selectedRecipientLabels,
    mode,
    excuseSettings.customEducatorName,
    student?.educator,
    replyToMessage,
  ]);

  const filteredRecipients = useMemo(() => {
    const q = recipientSearch.trim().toLowerCase();
    if (!q) return recipients;
    return recipients.filter((r) => r.name.toLowerCase().includes(q));
  }, [recipients, recipientSearch]);

  const handleFocusSubject = () => {
    if (showRecipientPicker) {
      setShowRecipientPicker(false);
    }
  };

  const handleFocusBody = () => {
    if (showRecipientPicker) {
      setShowRecipientPicker(false);
    }
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 180);
  };

  const handleSend = async () => {
    if (!subject.trim()) {
      Alert.alert('Brak tematu', 'Wpisz temat wiadomości przed wysłaniem.');
      return;
    }
    if (!body.trim()) {
      Alert.alert('Brak treści', 'Wpisz treść wiadomości przed wysłaniem.');
      return;
    }
    if (selectedRecipientIds.length === 0) {
      Alert.alert(
        'Wybierz odbiorcę',
        'Kliknij pole "Do kogo", aby wybrać odbiorcę (np. wychowawcę klasy) z listy Librusa.'
      );
      setShowRecipientPicker(true);
      return;
    }

    setSending(true);
    try {
      const res = await librusClient.sendMessage(
        selectedRecipientIds,
        subject.trim(),
        body.trim()
      );
      if (res.success) {
        if (mode === 'excuse' && selectedAbsenceDates.length > 0) {
          markExcuseDatesAsSent(selectedAbsenceDates);
        }
        Alert.alert(
          'Wysłano',
          'Wiadomość została pomyślnie wysłana przez Librus Synergia.'
        );
        onSentSuccess();
        onClose();
      } else {
        Alert.alert(
          'Błąd wysyłania',
          res.error || 'Nie udało się wysłać wiadomości.'
        );
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[
          styles.container,
          {
            paddingTop: Math.max(insets.top, 14),
            paddingBottom: Math.max(insets.bottom, 12),
          },
        ]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {/* Header */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color="#e2e8f0" />
          </TouchableOpacity>
          <Text style={styles.topTitle}>
            {mode === 'excuse'
              ? 'Generator usprawiedliwienia'
              : mode === 'reply'
                ? 'Odpowiedz na wiadomość'
                : 'Nowa wiadomość'}
          </Text>
          <TouchableOpacity
            disabled={sending}
            onPress={handleSend}
            style={[styles.sendTopBtn, sending && { opacity: 0.6 }]}>
            {sending ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Ionicons name="send" size={14} color="#ffffff" />
                <Text style={styles.sendTopBtnText}>Wyślij</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(keyboardHeight + 60, 60) },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={true}>
          {/* Recipient Selector Card */}
          <View style={styles.card}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setShowRecipientPicker((prev) => !prev)}
              style={styles.recipientHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Do kogo (Odbiorca):</Text>
                <Text
                  style={[
                    styles.recipientValue,
                    selectedRecipientIds.length === 0 && { color: '#94a3b8' },
                  ]}
                  numberOfLines={2}>
                  {educatorFallbackLabel}
                </Text>
              </View>
              {loadingRecipients ? (
                <ActivityIndicator size="small" color="#38bdf8" />
              ) : (
                <View style={styles.changeRecipientBtn}>
                  <Text style={styles.changeRecipientText}>
                    {showRecipientPicker ? 'Ukryj listę' : 'Zmień'}
                  </Text>
                  <Ionicons
                    name={showRecipientPicker ? 'chevron-up' : 'chevron-down'}
                    size={15}
                    color="#38bdf8"
                  />
                </View>
              )}
            </TouchableOpacity>

            {showRecipientPicker && (
              <View style={styles.recipientPickerBox}>
                <View style={styles.searchBox}>
                  <Ionicons name="search" size={16} color="#64748b" />
                  <TextInput
                    value={recipientSearch}
                    onChangeText={setRecipientSearch}
                    placeholder="Szukaj nauczyciela / wychowawcy..."
                    placeholderTextColor="#64748b"
                    style={styles.searchInput}
                  />
                </View>

                <ScrollView
                  style={styles.recipientsScroll}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled">
                  {filteredRecipients.length === 0 ? (
                    <Text style={styles.emptyRecipientsText}>
                      {loadingRecipients
                        ? 'Pobieranie listy nauczycieli z Librusa...'
                        : 'Nie znaleziono odbiorców na liście.'}
                    </Text>
                  ) : (
                    filteredRecipients.map((r) => {
                      const checked = selectedRecipientIds.includes(r.id);
                      return (
                        <TouchableOpacity
                          key={r.id}
                          onPress={() => toggleRecipient(r.id)}
                          style={[
                            styles.recipientOption,
                            checked && styles.recipientOptionSelected,
                          ]}>
                          <Ionicons
                            name={checked ? 'checkbox' : 'square-outline'}
                            size={19}
                            color={checked ? '#38bdf8' : '#64748b'}
                          />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.recipientOptionName}>
                              {cleanLibrusPersonName(r.name)}
                            </Text>
                            {r.group === 'wychowawca' && (
                              <Text style={styles.educatorTag}>
                                Wychowawca klasy
                              </Text>
                            )}
                          </View>
                        </TouchableOpacity>
                      );
                    })
                  )}
                </ScrollView>
              </View>
            )}
          </View>

          {/* Auto-Excuse Absence Days Checklist */}
          {mode === 'excuse' && (
            <View style={styles.card}>
              <View style={styles.excuseDaysHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>
                    Dni nieobecności nieusprawiedliwionych (NB):
                  </Text>
                  <Text style={styles.excuseSubHint}>
                    Zaznacz dni, które chcesz dołączyć do wiadomości
                  </Text>
                </View>
                {absenceDaysList.length > 0 && (
                  <TouchableOpacity
                    onPress={() => {
                      const allDates = absenceDaysList.map((d) => d.date);
                      const next =
                        selectedAbsenceDates.length === allDates.length
                          ? []
                          : allDates;
                      setSelectedAbsenceDates(next);
                      setBody(buildExcuseBody(next, excuseSettings));
                    }}>
                    <Text style={styles.selectAllText}>
                      {selectedAbsenceDates.length === absenceDaysList.length
                        ? 'Odznacz wszystkie'
                        : 'Zaznacz wszystkie'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {absenceDaysList.length === 0 ? (
                <View style={styles.noAbsencesBox}>
                  <Ionicons name="checkmark-circle" size={20} color="#10b981" />
                  <Text style={styles.noAbsencesText}>
                    Brak nieusprawiedliwionych nieobecności (NB)! Możesz mimo to edytować i wysłać wiadomość poniżej.
                  </Text>
                </View>
              ) : (
                <View style={styles.daysChecklist}>
                  {absenceDaysList.map((item) => {
                    const checked = selectedAbsenceDates.includes(item.date);
                    const wasSent = sentDatesSet.has(item.date);
                    return (
                      <TouchableOpacity
                        key={item.date}
                        activeOpacity={0.8}
                        onPress={() => toggleAbsenceDate(item.date)}
                        style={[
                          styles.dayCheckItem,
                          checked && styles.dayCheckItemActive,
                        ]}>
                        <Ionicons
                          name={checked ? 'checkbox' : 'square-outline'}
                          size={20}
                          color={checked ? '#3b82f6' : '#64748b'}
                        />
                        <Text style={styles.dayCheckLabel}>{item.label}</Text>
                        <Text style={styles.dayCheckCount}>
                          {item.count} {item.count === 1 ? 'lekcja' : 'lekcji'} NB
                        </Text>
                        {wasSent && (
                          <View style={styles.sentBadge}>
                            <Text style={styles.sentBadgeText}>Wysłano</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {/* Subject Input */}
          <View style={styles.card}>
            <Text style={styles.fieldLabel}>Temat:</Text>
            <TextInput
              value={subject}
              onChangeText={setSubject}
              onFocus={handleFocusSubject}
              placeholder="Wpisz temat wiadomości..."
              placeholderTextColor="#64748b"
              style={styles.subjectInput}
            />
          </View>

          {/* Message Body Input */}
          <View style={styles.card}>
            <Text style={styles.fieldLabel}>Treść wiadomości:</Text>
            <TextInput
              value={body}
              onChangeText={setBody}
              onFocus={handleFocusBody}
              placeholder="Wpisz treść wiadomości..."
              placeholderTextColor="#64748b"
              multiline
              scrollEnabled={false}
              textAlignVertical="top"
              style={styles.bodyInput}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#f8fafc',
  },
  sendTopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#3b82f6',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
  },
  sendTopBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  scrollContent: {
    padding: 18,
    gap: 14,
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 8,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  recipientHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  recipientValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#38bdf8',
    marginTop: 4,
  },
  changeRecipientBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(56, 189, 248, 0.14)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  changeRecipientText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700',
  },
  recipientPickerBox: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 10,
    gap: 8,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: '#f8fafc',
    fontSize: 13,
    paddingVertical: 2,
  },
  recipientsScroll: {
    maxHeight: 180,
  },
  emptyRecipientsText: {
    color: '#94a3b8',
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 14,
  },
  recipientOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  recipientOptionSelected: {
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
  },
  recipientOptionName: {
    color: '#f1f5f9',
    fontSize: 13,
    fontWeight: '600',
  },
  educatorTag: {
    color: '#10b981',
    fontSize: 11,
    fontWeight: '700',
  },
  excuseDaysHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  excuseSubHint: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  selectAllText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700',
  },
  noAbsencesBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    padding: 10,
    borderRadius: 10,
  },
  noAbsencesText: {
    flex: 1,
    color: '#cbd5e1',
    fontSize: 12,
  },
  daysChecklist: {
    gap: 6,
    marginTop: 4,
  },
  dayCheckItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0f172a',
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#334155',
  },
  dayCheckItemActive: {
    borderColor: '#3b82f6',
    backgroundColor: 'rgba(59, 130, 246, 0.14)',
  },
  dayCheckLabel: {
    flex: 1,
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
  },
  dayCheckCount: {
    color: '#fca5a5',
    fontSize: 11,
    fontWeight: '600',
  },
  sentBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.5)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  sentBadgeText: {
    color: '#34d399',
    fontSize: 10,
    fontWeight: '800',
  },
  subjectInput: {
    backgroundColor: '#0f172a',
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '600',
    borderWidth: 1,
    borderColor: '#334155',
  },
  bodyInput: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 12,
    color: '#f8fafc',
    fontSize: 14,
    lineHeight: 21,
    minHeight: 200,
    borderWidth: 1,
    borderColor: '#334155',
  },
});

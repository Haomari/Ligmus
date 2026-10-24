import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Directory } from 'expo-file-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  LibrusAttachment,
  LibrusMessageDetail,
  LibrusMessageSummary,
} from '@/types/librus';
import { cleanLibrusPersonName, librusClient } from '@/services/librusClient';
import {
  formatDownloadFolderLabel,
  getDownloadFolderUri,
  saveDownloadFolderUri,
} from '@/services/fileCache';
import { ToastBanner } from '@/components/toast-banner';

interface MessageDetailsModalProps {
  message: LibrusMessageSummary | null;
  hasReply?: boolean;
  visible: boolean;
  onClose: () => void;
  onReply: (detail: LibrusMessageDetail) => void;
  onMarkedRead: (messageId: string) => void;
}

export const MessageDetailsModal: React.FC<MessageDetailsModalProps> = ({
  message,
  hasReply = false,
  visible,
  onClose,
  onReply,
  onMarkedRead,
}) => {
  const insets = useSafeAreaInsets();
  const [detail, setDetail] = useState<LibrusMessageDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloadingPath, setDownloadingPath] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !message) {
      setDetail(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    librusClient
      .getMessageDetail(message.folderId, message.id, message.sender)
      .then((res) => {
        if (cancelled) return;
        if (res) {
          setDetail(res);
          if (message.folderId === 5 && message.isUnread) {
            onMarkedRead(message.id);
          }
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [visible, message?.id, message?.folderId]);

  if (!message) return null;

  const displaySubject = detail?.subject || message.subject;

  // Prefer the real name from summary if detail returned generic fallback
  const rawPerson =
    detail?.sender && detail.sender !== 'Użytkownik Librus'
      ? detail.sender
      : message.sender && message.sender !== 'Użytkownik Librus'
        ? message.sender
        : detail?.recipient || message.senderOrRecipient || 'Użytkownik Librus';
  const displayPerson = cleanLibrusPersonName(rawPerson) || rawPerson;

  const displaySentAt = detail?.sentAt || message.sentAt;
  const readAtText = detail?.readAt || message.readAt;
  const isReadByRecipient =
    message.folderId === 6
      ? detail?.readByRecipient !== undefined
        ? detail.readByRecipient
        : message.readByRecipient !== undefined
          ? message.readByRecipient
          : Boolean(readAtText && !/^nie\b/i.test(readAtText))
      : true;

  const attachments: LibrusAttachment[] = detail?.attachments ?? [];

  const handleDownloadAttachment = async (att: LibrusAttachment) => {
    setDownloadingPath(att.path);
    try {
      const result = await librusClient.downloadAttachmentData(att.path, att.name);
      if (!result.ok) {
        Alert.alert('Błąd pobierania', result.error);
        return;
      }

      const safeFileName =
        (result.fileName || att.name || 'zalacznik')
          .replace(/[\\/:*?"<>|]/g, '_')
          .trim() || 'zalacznik';

      let savedUri = getDownloadFolderUri();
      let wroteSuccessfully = false;

      if (savedUri) {
        try {
          const existingDir = new Directory(savedUri);
          const savedFile = existingDir.createFile(safeFileName, result.mimeType);
          savedFile.write(result.bytes);
          wroteSuccessfully = true;
        } catch {
          // Saved folder permission may have expired; fall back to directory picker
          savedUri = null;
        }
      }

      if (!wroteSuccessfully) {
        const targetDir = await Directory.pickDirectoryAsync();
        savedUri = targetDir.uri;
        saveDownloadFolderUri(savedUri);
        const savedFile = targetDir.createFile(safeFileName, result.mimeType);
        savedFile.write(result.bytes);
      }

      setToastMessage(
        `Zapisano „${safeFileName}” (${formatDownloadFolderLabel(savedUri)})`
      );
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (/cancel/i.test(msg)) {
        return;
      }
      Alert.alert(
        'Błąd zapisu',
        msg || 'Nie udało się zapisać załącznika w wybranym folderze.'
      );
    } finally {
      setDownloadingPath(null);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <View
        style={[
          styles.container,
          {
            paddingTop: Math.max(insets.top, 14),
            paddingBottom: Math.max(insets.bottom, 16),
          },
        ]}>
        {/* Top Bar */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
            <Ionicons name="close" size={22} color="#e2e8f0" />
          </TouchableOpacity>
          <Text style={styles.topBarTitle} numberOfLines={1}>
            {message.folderId === 6 ? 'Wysłana wiadomość' : 'Odebrana wiadomość'}
          </Text>
          <View style={{ width: 38 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          <View style={styles.metaCard}>
            <Text style={styles.subjectText}>{displaySubject}</Text>

            <View style={styles.metaRow}>
              <Ionicons
                name={
                  message.folderId === 6
                    ? 'paper-plane-outline'
                    : 'person-circle-outline'
                }
                size={18}
                color="#38bdf8"
              />
              <Text style={styles.metaLabel}>
                {message.folderId === 6 ? 'Do:' : 'Od:'}
              </Text>
              <Text style={styles.metaValue}>{displayPerson}</Text>
            </View>

            <View style={styles.metaRow}>
              <Ionicons name="time-outline" size={16} color="#94a3b8" />
              <Text style={styles.metaLabel}>Wysłano:</Text>
              <Text style={styles.metaSecondary}>{displaySentAt}</Text>
            </View>

            {/* Read & Reply Status Pills */}
            <View style={styles.statusBadgesRow}>
              {message.folderId === 6 ? (
                <View
                  style={[
                    styles.statusPill,
                    isReadByRecipient
                      ? styles.statusPillRead
                      : styles.statusPillUnread,
                  ]}>
                  <Ionicons
                    name={
                      isReadByRecipient
                        ? 'checkmark-done-outline'
                        : 'time-outline'
                    }
                    size={15}
                    color={isReadByRecipient ? '#34d399' : '#fbbf24'}
                  />
                  <Text
                    style={[
                      styles.statusPillText,
                      { color: isReadByRecipient ? '#34d399' : '#fbbf24' },
                    ]}>
                    {isReadByRecipient
                      ? readAtText && !/^nie\b/i.test(readAtText)
                        ? `Przeczytano (${readAtText})`
                        : 'Przeczytano przez odbiorcę'
                      : 'Nieprzeczytano przez odbiorcę'}
                  </Text>
                </View>
              ) : readAtText ? (
                <View style={[styles.statusPill, styles.statusPillRead]}>
                  <Ionicons
                    name="checkmark-done-outline"
                    size={15}
                    color="#34d399"
                  />
                  <Text style={[styles.statusPillText, { color: '#34d399' }]}>
                    Przeczytano: {readAtText}
                  </Text>
                </View>
              ) : null}

              {hasReply && (
                <View style={[styles.statusPill, styles.statusPillReply]}>
                  <Ionicons
                    name="return-down-forward-outline"
                    size={15}
                    color="#60a5fa"
                  />
                  <Text style={[styles.statusPillText, { color: '#60a5fa' }]}>
                    {message.folderId === 6
                      ? 'Otrzymano odpowiedź'
                      : 'Odpowiedziano'}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Attachments Card */}
          {attachments.length > 0 && (
            <View style={styles.attachmentsCard}>
              <View style={styles.attachmentsHeader}>
                <Ionicons name="attach" size={18} color="#38bdf8" />
                <Text style={styles.attachmentsTitle}>
                  Załączniki ({attachments.length})
                </Text>
              </View>

              <View style={styles.attachmentsList}>
                {attachments.map((att) => {
                  const isDownloading = downloadingPath === att.path;
                  return (
                    <TouchableOpacity
                      key={att.path}
                      activeOpacity={0.82}
                      disabled={isDownloading}
                      onPress={() => handleDownloadAttachment(att)}
                      style={styles.attachmentRow}>
                      <View style={styles.attachmentIconBox}>
                        <Ionicons
                          name="document-attach-outline"
                          size={20}
                          color="#38bdf8"
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.attachmentName} numberOfLines={2}>
                          {att.name}
                        </Text>
                        <Text style={styles.attachmentHint}>
                          Dotknij, aby pobrać plik na telefon
                        </Text>
                      </View>
                      <View style={styles.downloadBadge}>
                        {isDownloading ? (
                          <ActivityIndicator size="small" color="#ffffff" />
                        ) : (
                          <>
                            <Ionicons
                              name="download-outline"
                              size={16}
                              color="#ffffff"
                            />
                            <Text style={styles.downloadBadgeText}>Pobierz</Text>
                          </>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          <View style={styles.bodyCard}>
            {loading && !detail ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="small" color="#38bdf8" />
                <Text style={styles.loadingText}>
                  Pobieranie treści wiadomości...
                </Text>
              </View>
            ) : (
              <Text selectable style={styles.bodyText}>
                {detail?.body || 'Brak treści wiadomości.'}
              </Text>
            )}
          </View>
        </ScrollView>

        {message.folderId === 5 && (
          <View style={styles.footerBar}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => {
                if (detail) {
                  onReply({
                    ...detail,
                    sender: displayPerson,
                  });
                } else {
                  onReply({
                    ...message,
                    sender: displayPerson,
                    body: '',
                  });
                }
              }}
              style={styles.replyButton}>
              <Ionicons name="arrow-undo-outline" size={18} color="#ffffff" />
              <Text style={styles.replyButtonText}>Odpowiedz nadawcy</Text>
            </TouchableOpacity>
          </View>
        )}

        <ToastBanner message={toastMessage} onHide={() => setToastMessage(null)} />
      </View>
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
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f8fafc',
  },
  scrollContent: {
    padding: 18,
    gap: 14,
  },
  metaCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 8,
  },
  subjectText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#f8fafc',
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  metaLabel: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '600',
  },
  metaValue: {
    fontSize: 13,
    color: '#38bdf8',
    fontWeight: '700',
    flexShrink: 1,
  },
  metaSecondary: {
    fontSize: 12,
    color: '#cbd5e1',
  },
  statusBadgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
  },
  statusPillRead: {
    backgroundColor: 'rgba(16, 185, 129, 0.14)',
    borderColor: 'rgba(16, 185, 129, 0.45)',
  },
  statusPillUnread: {
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
    borderColor: 'rgba(245, 158, 11, 0.45)',
  },
  statusPillReply: {
    backgroundColor: 'rgba(59, 130, 246, 0.16)',
    borderColor: 'rgba(59, 130, 246, 0.45)',
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  attachmentsCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 10,
  },
  attachmentsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  attachmentsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f8fafc',
  },
  attachmentsList: {
    gap: 8,
  },
  attachmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 10,
  },
  attachmentIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(56, 189, 248, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentName: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
  },
  attachmentHint: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2,
  },
  downloadBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#3b82f6',
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 10,
  },
  downloadBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  bodyCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
    minHeight: 180,
  },
  loadingWrap: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 13,
  },
  bodyText: {
    color: '#f1f5f9',
    fontSize: 14,
    lineHeight: 22,
  },
  footerBar: {
    paddingHorizontal: 18,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  replyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#3b82f6',
    paddingVertical: 14,
    borderRadius: 14,
  },
  replyButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});

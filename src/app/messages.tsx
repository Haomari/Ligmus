import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useLibrus } from '@/context/LibrusContext';
import {
  LibrusMessageDetail,
  LibrusMessageSummary,
  MessageFolder,
} from '@/types/librus';
import { getSentExcuseDates } from '@/services/fileCache';
import { cleanLibrusPersonName } from '@/services/librusClient';
import { MessageDetailsModal } from '@/components/message-details-modal';
import {
  ComposeMode,
  MessageComposeModal,
} from '@/components/message-compose-modal';

function normalizePersonKey(raw?: string): string {
  return cleanLibrusPersonName(raw)
    .replace(/\[[^\]]*\]/g, '')
    .trim()
    .toLowerCase();
}

function normalizeSubjectKey(raw?: string): string {
  return (raw || '')
    .replace(/^(re|odp|fw|fwd):\s*/gi, '')
    .trim()
    .toLowerCase();
}

export default function MessagesScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ autoExcuse?: string }>();
  const {
    inboxMessages,
    sentMessages,
    unreadMessagesCount,
    attendanceMarks,
    loadMessages,
    markMessageAsReadLocal,
  } = useLibrus();

  const [folder, setFolder] = useState<MessageFolder>('inbox');
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedMessage, setSelectedMessage] =
    useState<LibrusMessageSummary | null>(null);
  const [detailsVisible, setDetailsVisible] = useState(false);

  const [composeVisible, setComposeVisible] = useState(false);
  const [composeMode, setComposeMode] = useState<ComposeMode>('compose');
  const [replyDetail, setReplyDetail] = useState<LibrusMessageDetail | null>(
    null
  );

  useEffect(() => {
    loadMessages('inbox');
    loadMessages('sent');
  }, []);

  useEffect(() => {
    loadMessages(folder);
  }, [folder]);

  useEffect(() => {
    if (params.autoExcuse === '1') {
      setComposeMode('excuse');
      setReplyDetail(null);
      setComposeVisible(true);
    }
  }, [params.autoExcuse]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadMessages('inbox'), loadMessages('sent')]);
    } finally {
      setRefreshing(false);
    }
  };

  // Determine whether a message has a follow-up reply in the opposite folder
  const checkHasReply = useCallback(
    (msg: LibrusMessageSummary): boolean => {
      const personKey = normalizePersonKey(msg.sender);
      const subjKey = normalizeSubjectKey(msg.subject);
      const msgDate = msg.date || msg.sentAt || '';

      if (msg.folderId === 6) {
        // Sent message: check if inbox has a message from the same person with a newer date or Re: subject
        return inboxMessages.some((inb) => {
          const inbPerson = normalizePersonKey(inb.sender);
          const inbSubj = normalizeSubjectKey(inb.subject);
          const inbDate = inb.date || inb.sentAt || '';
          const samePerson =
            personKey &&
            inbPerson &&
            (inbPerson.includes(personKey) || personKey.includes(inbPerson));
          const sameSubj = subjKey.length >= 3 && inbSubj === subjKey;
          if (samePerson && inbDate && msgDate && inbDate >= msgDate) {
            return true;
          }
          if (sameSubj && inbDate && msgDate && inbDate >= msgDate) {
            return true;
          }
          return false;
        });
      } else {
        // Inbox message: check if sentMessages has a message to the same person with a newer date or Re: subject
        return sentMessages.some((snt) => {
          const sntPerson = normalizePersonKey(snt.sender);
          const sntSubj = normalizeSubjectKey(snt.subject);
          const sntDate = snt.date || snt.sentAt || '';
          const samePerson =
            personKey &&
            sntPerson &&
            (sntPerson.includes(personKey) || personKey.includes(sntPerson));
          const sameSubj = subjKey.length >= 3 && sntSubj === subjKey;
          if (samePerson && sntDate && msgDate && sntDate >= msgDate) {
            return true;
          }
          if (sameSubj && sntDate && msgDate && sntDate >= msgDate) {
            return true;
          }
          return false;
        });
      }
    },
    [inboxMessages, sentMessages]
  );

  // Count unexcused absence days not yet sent in an excuse
  const pendingExcuseDaysCount = useMemo(() => {
    const sentSet = new Set(getSentExcuseDates());
    const dates = new Set<string>();
    for (const m of attendanceMarks) {
      if (m.kind === 'absent' && m.date && !sentSet.has(m.date)) {
        dates.add(m.date);
      }
    }
    return dates.size;
  }, [attendanceMarks, composeVisible]);

  const activeList = folder === 'inbox' ? inboxMessages : sentMessages;

  const filteredMessages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return activeList;
    return activeList.filter((m) => {
      const person =
        folder === 'sent' ? m.senderOrRecipient || m.sender : m.sender;
      return (
        m.subject.toLowerCase().includes(q) ||
        cleanLibrusPersonName(person).toLowerCase().includes(q)
      );
    });
  }, [activeList, searchQuery, folder]);

  const openExcuseGenerator = () => {
    setComposeMode('excuse');
    setReplyDetail(null);
    setComposeVisible(true);
  };

  const openStandardCompose = () => {
    setComposeMode('compose');
    setReplyDetail(null);
    setComposeVisible(true);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            Wiadomości
          </Text>

          <View style={styles.headerActions}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={openExcuseGenerator}
              style={styles.excuseBtn}>
              <Ionicons name="sparkles" size={18} color="#34d399" />
              {pendingExcuseDaysCount > 0 && (
                <View style={styles.excuseCountBadge}>
                  <Text style={styles.excuseCountText}>
                    {pendingExcuseDaysCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={openStandardCompose}
              style={styles.newMsgBtn}>
              <Ionicons name="create-outline" size={22} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Folder Switcher (Odebrane / Wysłane) */}
        <View style={styles.folderBar}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setFolder('inbox')}
            style={[
              styles.folderTab,
              folder === 'inbox' && styles.folderTabActive,
            ]}>
            <Text
              style={[
                styles.folderTabText,
                folder === 'inbox' && styles.folderTabTextActive,
              ]}>
              Odebrane ({inboxMessages.length})
            </Text>
            {unreadMessagesCount > 0 && (
              <View style={styles.unreadPill}>
                <Text style={styles.unreadPillText}>{unreadMessagesCount}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setFolder('sent')}
            style={[
              styles.folderTab,
              folder === 'sent' && styles.folderTabActive,
            ]}>
            <Text
              style={[
                styles.folderTabText,
                folder === 'sent' && styles.folderTabTextActive,
              ]}>
              Wysłane ({sentMessages.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Search Input */}
        <View style={styles.searchBar}>
          <Ionicons name="search" size={16} color="#64748b" />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Szukaj po temacie lub osobie..."
            placeholderTextColor="#64748b"
            style={styles.searchInput}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={17} color="#64748b" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <FlatList
        data={filteredMessages}
        keyExtractor={(item) => `${item.folderId}-${item.id}`}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: Math.max(insets.bottom + 24, 40) },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#3b82f6"
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Ionicons name="mail-open-outline" size={34} color="#64748b" />
            <Text style={styles.emptyTitle}>Brak wiadomości</Text>
            <Text style={styles.emptySub}>
              Pociągnij w dół, aby odświeżyć skrzynkę z Librusa Synergia.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const rawPerson =
            folder === 'sent'
              ? item.senderOrRecipient || item.sender
              : item.sender;
          const displayPerson = cleanLibrusPersonName(rawPerson) || rawPerson;
          const hasReply = checkHasReply(item);

          const isUnread = folder === 'inbox' && item.isUnread;
          const isReadSent =
            item.readByRecipient !== undefined
              ? item.readByRecipient
              : Boolean(item.readAt && !/^nie\b/i.test(item.readAt));

          return (
            <TouchableOpacity
              activeOpacity={0.82}
              onPress={() => {
                setSelectedMessage(item);
                setDetailsVisible(true);
              }}
              style={[
                styles.messageCard,
                isUnread && styles.messageCardUnread,
              ]}>
              {/* Top row: Subject (bold large) + Date */}
              <View style={styles.cardTopRow}>
                <Text
                  style={[
                    styles.subjectText,
                    isUnread && styles.subjectTextUnread,
                  ]}
                  numberOfLines={2}>
                  {item.subject || '(Brak tematu)'}
                </Text>
                <Text style={styles.dateText}>{item.sentAt}</Text>
              </View>

              {/* Second row: Sender / Recipient */}
              <View style={styles.personRow}>
                <Ionicons
                  name={
                    item.folderId === 6
                      ? 'paper-plane-outline'
                      : 'person-outline'
                  }
                  size={14}
                  color="#38bdf8"
                />
                <Text style={styles.personLabel}>
                  {item.folderId === 6 ? 'Do:' : 'Od:'}
                </Text>
                <Text style={styles.personValue} numberOfLines={1}>
                  {displayPerson}
                </Text>
              </View>

              {/* Third row: Badges (Załącznik, Read status, Reply status) */}
              <View style={styles.badgeRow}>
                {item.hasAttachment && (
                  <View style={[styles.badge, styles.badgeAttachment]}>
                    <Ionicons name="attach" size={13} color="#38bdf8" />
                    <Text style={styles.badgeAttachmentText}>Załącznik</Text>
                  </View>
                )}

                {folder === 'sent' ? (
                  <View
                    style={[
                      styles.badge,
                      isReadSent ? styles.badgeRead : styles.badgeUnread,
                    ]}>
                    <Ionicons
                      name={
                        isReadSent
                          ? 'checkmark-done-outline'
                          : 'time-outline'
                      }
                      size={13}
                      color={isReadSent ? '#34d399' : '#fbbf24'}
                    />
                    <Text
                      style={
                        isReadSent
                          ? styles.badgeReadText
                          : styles.badgeUnreadText
                      }>
                      {isReadSent ? 'Przeczytano' : 'Nieprzeczytano'}
                    </Text>
                  </View>
                ) : isUnread ? (
                  <View style={[styles.badge, styles.badgeUnread]}>
                    <Ionicons name="mail-unread-outline" size={13} color="#fbbf24" />
                    <Text style={styles.badgeUnreadText}>Nieprzeczytano</Text>
                  </View>
                ) : (
                  <View style={[styles.badge, styles.badgeRead]}>
                    <Ionicons
                      name="checkmark-done-outline"
                      size={13}
                      color="#34d399"
                    />
                    <Text style={styles.badgeReadText}>Przeczytano</Text>
                  </View>
                )}

                {hasReply && (
                  <View style={[styles.badge, styles.badgeReply]}>
                    <Ionicons
                      name="return-down-forward-outline"
                      size={13}
                      color="#60a5fa"
                    />
                    <Text style={styles.badgeReplyText}>
                      {folder === 'sent'
                        ? 'Otrzymano odpowiedź'
                        : 'Odpowiedziano'}
                    </Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        }}
      />

      <MessageDetailsModal
        message={selectedMessage}
        hasReply={selectedMessage ? checkHasReply(selectedMessage) : false}
        visible={detailsVisible}
        onClose={() => setDetailsVisible(false)}
        onMarkedRead={markMessageAsReadLocal}
        onReply={(detail) => {
          setDetailsVisible(false);
          setTimeout(() => {
            setReplyDetail(detail);
            setComposeMode('reply');
            setComposeVisible(true);
          }, 120);
        }}
      />

      <MessageComposeModal
        visible={composeVisible}
        mode={composeMode}
        replyToMessage={replyDetail}
        onClose={() => setComposeVisible(false)}
        onSentSuccess={() => {
          loadMessages('sent');
        }}
      />
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
    paddingTop: 10,
    paddingBottom: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 24,
    fontWeight: '800',
    color: '#f8fafc',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  excuseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 42,
    minWidth: 42,
    paddingHorizontal: 11,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.45)',
    borderRadius: 13,
  },
  excuseCountBadge: {
    backgroundColor: '#10b981',
    borderRadius: 999,
    minWidth: 19,
    height: 19,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  excuseCountText: {
    color: '#064e3b',
    fontSize: 11,
    fontWeight: '800',
  },
  newMsgBtn: {
    width: 44,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderBar: {
    flexDirection: 'row',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 3,
    borderWidth: 1,
    borderColor: '#334155',
  },
  folderTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 7,
    borderRadius: 9,
  },
  folderTabActive: {
    backgroundColor: '#3b82f6',
  },
  folderTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
  },
  folderTabTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  unreadPill: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 999,
  },
  unreadPillText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: '#f8fafc',
    fontSize: 13,
    paddingVertical: 0,
  },
  listContent: {
    padding: 18,
    gap: 12,
  },
  messageCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 8,
  },
  messageCardUnread: {
    backgroundColor: 'rgba(30, 58, 138, 0.35)',
    borderColor: 'rgba(59, 130, 246, 0.6)',
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  subjectText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    color: '#f8fafc',
    lineHeight: 22,
  },
  subjectTextUnread: {
    color: '#ffffff',
  },
  dateText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94a3b8',
    marginTop: 2,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  personLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
  },
  personValue: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#38bdf8',
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  badgeRead: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  badgeReadText: {
    color: '#34d399',
    fontSize: 11,
    fontWeight: '700',
  },
  badgeUnread: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: 'rgba(245, 158, 11, 0.4)',
  },
  badgeUnreadText: {
    color: '#fbbf24',
    fontSize: 11,
    fontWeight: '700',
  },
  badgeReply: {
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    borderColor: 'rgba(59, 130, 246, 0.4)',
  },
  badgeReplyText: {
    color: '#60a5fa',
    fontSize: 11,
    fontWeight: '700',
  },
  badgeAttachment: {
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderColor: 'rgba(56, 189, 248, 0.4)',
  },
  badgeAttachmentText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
  },
  emptyBox: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
    gap: 8,
    marginTop: 12,
  },
  emptyTitle: {
    color: '#f1f5f9',
    fontSize: 15,
    fontWeight: '700',
  },
  emptySub: {
    color: '#94a3b8',
    fontSize: 12,
    textAlign: 'center',
  },
});

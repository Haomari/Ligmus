import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
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
  SchoolAnnouncement,
  SkrzynkaTab,
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
  const params = useLocalSearchParams<{
    autoExcuse?: string;
    tab?: string;
    announcementId?: string;
    messageId?: string;
  }>();
  const {
    inboxMessages,
    sentMessages,
    announcements,
    unreadMessagesCount,
    unreadAnnouncementsCount,
    attendanceMarks,
    loadMessages,
    loadAnnouncements,
    markMessageAsReadLocal,
    markAnnouncementAsReadLocal,
    markAllAnnouncementsReadLocal,
  } = useLibrus();

  const [tab, setTab] = useState<SkrzynkaTab>('inbox');
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedMessage, setSelectedMessage] =
    useState<LibrusMessageSummary | null>(null);
  const [detailsVisible, setDetailsVisible] = useState(false);

  const [selectedAnnouncement, setSelectedAnnouncement] =
    useState<SchoolAnnouncement | null>(null);

  const [composeVisible, setComposeVisible] = useState(false);
  const [composeMode, setComposeMode] = useState<ComposeMode>('compose');
  const [replyDetail, setReplyDetail] = useState<LibrusMessageDetail | null>(
    null
  );

  // Pull-down responder state for Announcement reader modal
  const [annSheetTranslateY] = useState(
    () => new Animated.Value(Dimensions.get('window').height)
  );
  const [annBackdropOpacity] = useState(() => new Animated.Value(0));
  const annScrollYRef = useRef(0);
  const annGestureStartRef = useRef({ x: 0, y: 0 });
  const annClosingRef = useRef(false);

  const handledExcuseRef = useRef<string | null>(null);
  const handledLinkKeyRef = useRef<string | null>(null);

  useEffect(() => {
    void loadMessages('inbox');
    void loadMessages('sent');
    void loadAnnouncements();
  }, [loadMessages, loadAnnouncements]);

  useEffect(() => {
    if (tab === 'announcements') {
      void loadAnnouncements();
    } else {
      void loadMessages(tab);
    }
  }, [tab, loadMessages, loadAnnouncements]);

  useEffect(() => {
    if (params.autoExcuse === '1' && handledExcuseRef.current !== '1') {
      handledExcuseRef.current = '1';
      Promise.resolve().then(() => {
        setComposeMode('excuse');
        setReplyDetail(null);
        setComposeVisible(true);
      });
    } else if (params.autoExcuse !== '1') {
      handledExcuseRef.current = null;
    }
  }, [params.autoExcuse]);

  const openAnnouncementModal = useCallback(
    (ann: SchoolAnnouncement) => {
      markAnnouncementAsReadLocal(ann.id);
      annClosingRef.current = false;
      annScrollYRef.current = 0;
      const winH = Dimensions.get('window').height;
      annSheetTranslateY.setValue(winH);
      annBackdropOpacity.setValue(0);
      setSelectedAnnouncement({ ...ann, isUnread: false });

      Animated.parallel([
        Animated.timing(annBackdropOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(annSheetTranslateY, {
          toValue: 0,
          damping: 24,
          stiffness: 240,
          mass: 0.85,
          useNativeDriver: true,
        }),
      ]).start();
    },
    [annBackdropOpacity, annSheetTranslateY, markAnnouncementAsReadLocal]
  );

  const closeAnnouncementModal = useCallback(() => {
    if (annClosingRef.current) return;
    annClosingRef.current = true;
    const winH = Dimensions.get('window').height;
    Animated.parallel([
      Animated.timing(annBackdropOpacity, {
        toValue: 0,
        duration: 170,
        useNativeDriver: true,
      }),
      Animated.timing(annSheetTranslateY, {
        toValue: winH,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      annClosingRef.current = false;
      setSelectedAnnouncement(null);
    });
  }, [annBackdropOpacity, annSheetTranslateY]);

  // Handle deep-linking from "Ostatnia aktywność" (?tab=announcements&announcementId=... or ?tab=inbox&messageId=...)
  useEffect(() => {
    const requestedTab = typeof params.tab === 'string' ? params.tab : '';
    const annId = typeof params.announcementId === 'string' ? params.announcementId : '';
    const msgId = typeof params.messageId === 'string' ? params.messageId : '';

    if (!requestedTab && !annId && !msgId) return;

    const linkKey = `${requestedTab}|${annId}|${msgId}`;
    if (handledLinkKeyRef.current === linkKey) return;

    if (annId) {
      const targetAnn = announcements.find((a) => a.id === annId);
      if (!targetAnn) {
        Promise.resolve().then(() => setTab('announcements'));
        return;
      }
      handledLinkKeyRef.current = linkKey;
      Promise.resolve().then(() => {
        setTab('announcements');
        openAnnouncementModal(targetAnn);
      });
      return;
    }

    if (msgId) {
      const targetMsg = inboxMessages.find((m) => m.id === msgId);
      if (!targetMsg) {
        Promise.resolve().then(() => setTab('inbox'));
        return;
      }
      handledLinkKeyRef.current = linkKey;
      Promise.resolve().then(() => {
        setTab('inbox');
        setSelectedMessage(targetMsg);
        setDetailsVisible(true);
      });
      return;
    }

    if (
      requestedTab === 'inbox' ||
      requestedTab === 'sent' ||
      requestedTab === 'announcements'
    ) {
      handledLinkKeyRef.current = linkKey;
      Promise.resolve().then(() => setTab(requestedTab));
    }
  }, [
    params.tab,
    params.announcementId,
    params.messageId,
    announcements,
    inboxMessages,
    openAnnouncementModal,
  ]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        loadMessages('inbox'),
        loadMessages('sent'),
        loadAnnouncements(),
      ]);
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
  }, [attendanceMarks]);

  const activeMessageList = tab === 'sent' ? sentMessages : inboxMessages;

  const filteredMessages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return activeMessageList;
    return activeMessageList.filter((m) => {
      const person =
        tab === 'sent' ? m.senderOrRecipient || m.sender : m.sender;
      return (
        m.subject.toLowerCase().includes(q) ||
        cleanLibrusPersonName(person).toLowerCase().includes(q)
      );
    });
  }, [activeMessageList, searchQuery, tab]);

  const filteredAnnouncements = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return announcements;
    return announcements.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.author.toLowerCase().includes(q) ||
        a.content.toLowerCase().includes(q)
    );
  }, [announcements, searchQuery]);

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
            Skrzynka
          </Text>

          <View style={styles.headerActions}>
            {tab === 'announcements' && unreadAnnouncementsCount > 0 && (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={markAllAnnouncementsReadLocal}
                style={styles.markAllReadBtn}>
                <Ionicons name="checkmark-done-outline" size={18} color="#818cf8" />
              </TouchableOpacity>
            )}

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

        {/* 3-Tab Switcher (Odebrane | Wysłane | Ogłoszenia) */}
        <View style={styles.folderBar}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setTab('inbox')}
            style={[
              styles.folderTab,
              tab === 'inbox' && styles.folderTabActive,
            ]}>
            <Text
              numberOfLines={1}
              style={[
                styles.folderTabText,
                tab === 'inbox' && styles.folderTabTextActive,
              ]}>
              Odebrane
            </Text>
            {unreadMessagesCount > 0 && (
              <View style={styles.unreadPill}>
                <Text style={styles.unreadPillText}>{unreadMessagesCount}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setTab('sent')}
            style={[
              styles.folderTab,
              tab === 'sent' && styles.folderTabActive,
            ]}>
            <Text
              numberOfLines={1}
              style={[
                styles.folderTabText,
                tab === 'sent' && styles.folderTabTextActive,
              ]}>
              Wysłane
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setTab('announcements')}
            style={[
              styles.folderTab,
              tab === 'announcements' && styles.folderTabActive,
            ]}>
            <Text
              numberOfLines={1}
              style={[
                styles.folderTabText,
                tab === 'announcements' && styles.folderTabTextActive,
              ]}>
              Ogłoszenia
            </Text>
            {unreadAnnouncementsCount > 0 && (
              <View style={styles.unreadAnnouncementPill}>
                <Text style={styles.unreadPillText}>
                  {unreadAnnouncementsCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Search Input */}
        <View style={styles.searchBar}>
          <Ionicons name="search" size={16} color="#64748b" />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={
              tab === 'announcements'
                ? 'Szukaj w ogłoszeniach...'
                : 'Szukaj po temacie lub osobie...'
            }
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

      {tab === 'announcements' ? (
        <FlatList
          data={filteredAnnouncements}
          keyExtractor={(item) => item.id}
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
              <Ionicons name="megaphone-outline" size={34} color="#64748b" />
              <Text style={styles.emptyTitle}>Brak ogłoszeń szkolnych</Text>
              <Text style={styles.emptySub}>
                Pociągnij w dół, aby odświeżyć tablicę ogłoszeń z Librusa Synergia.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const isUnread = Boolean(item.isUnread);
            const preview = item.content.replace(/\s+/g, ' ').trim();
            return (
              <TouchableOpacity
                activeOpacity={0.82}
                onPress={() => openAnnouncementModal(item)}
                style={[
                  styles.messageCard,
                  isUnread && styles.announcementCardUnread,
                ]}>
                <View style={styles.cardTopRow}>
                  <Text
                    style={[
                      styles.subjectText,
                      isUnread && styles.subjectTextUnread,
                    ]}
                    numberOfLines={2}>
                    {item.title}
                  </Text>
                  <Text style={styles.dateText}>{item.date}</Text>
                </View>

                <View style={styles.personRow}>
                  <Ionicons name="megaphone-outline" size={14} color="#818cf8" />
                  <Text style={styles.personLabel}>Dodał:</Text>
                  <Text style={[styles.personValue, { color: '#a5b4fc' }]} numberOfLines={1}>
                    {item.author}
                  </Text>
                  {isUnread && (
                    <View style={[styles.badge, styles.badgeNewAnn]}>
                      <Text style={styles.badgeNewAnnText}>Nowe</Text>
                    </View>
                  )}
                </View>

                {preview.length > 0 && (
                  <Text style={styles.announcementPreview} numberOfLines={2}>
                    {preview}
                  </Text>
                )}
              </TouchableOpacity>
            );
          }}
        />
      ) : (
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
              tab === 'sent'
                ? item.senderOrRecipient || item.sender
                : item.sender;
            const displayPerson = cleanLibrusPersonName(rawPerson) || rawPerson;
            const hasReply = checkHasReply(item);

            const isUnread = tab === 'inbox' && item.isUnread;
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

                <View style={styles.badgeRow}>
                  {item.hasAttachment && (
                    <View style={[styles.badge, styles.badgeAttachment]}>
                      <Ionicons name="attach" size={13} color="#38bdf8" />
                      <Text style={styles.badgeAttachmentText}>Załącznik</Text>
                    </View>
                  )}

                  {tab === 'sent' ? (
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
                      <Ionicons
                        name="mail-unread-outline"
                        size={13}
                        color="#fbbf24"
                      />
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
                        {tab === 'sent'
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
      )}

      {/* Message Detail Modal */}
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

      {/* Compose / Auto-Excuse Modal */}
      <MessageComposeModal
        visible={composeVisible}
        mode={composeMode}
        replyToMessage={replyDetail}
        onClose={() => setComposeVisible(false)}
        onSentSuccess={() => {
          void loadMessages('sent');
        }}
      />

      {/* School Announcement Detail Modal */}
      <Modal
        visible={Boolean(selectedAnnouncement)}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={closeAnnouncementModal}>
        <View style={styles.annModalOverlay}>
          <Animated.View
            style={[styles.annModalBackdrop, { opacity: annBackdropOpacity }]}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={closeAnnouncementModal}
            />
          </Animated.View>

          {selectedAnnouncement && (
            <Animated.View
              style={[
                styles.annModalSheet,
                {
                  marginTop: Math.max(insets.top + 24, 48),
                  paddingBottom: Math.max(insets.bottom + 18, 26),
                  transform: [{ translateY: annSheetTranslateY }],
                },
              ]}
              onStartShouldSetResponderCapture={(e) => {
                annGestureStartRef.current = {
                  x: e.nativeEvent.pageX,
                  y: e.nativeEvent.pageY,
                };
                return false;
              }}
              onMoveShouldSetResponderCapture={(e) => {
                const dx = e.nativeEvent.pageX - annGestureStartRef.current.x;
                const dy = e.nativeEvent.pageY - annGestureStartRef.current.y;
                return (
                  dy > 12 &&
                  dy > Math.abs(dx) * 1.35 &&
                  annScrollYRef.current <= 2
                );
              }}
              onResponderMove={(e) => {
                const dy = e.nativeEvent.pageY - annGestureStartRef.current.y;
                if (dy > 0) {
                  annSheetTranslateY.setValue(dy);
                }
              }}
              onResponderRelease={(e) => {
                const dy = e.nativeEvent.pageY - annGestureStartRef.current.y;
                if (dy > 95) {
                  closeAnnouncementModal();
                } else {
                  Animated.spring(annSheetTranslateY, {
                    toValue: 0,
                    useNativeDriver: true,
                    bounciness: 5,
                  }).start();
                }
              }}
              onResponderTerminate={() => {
                Animated.spring(annSheetTranslateY, {
                  toValue: 0,
                  useNativeDriver: true,
                }).start();
              }}>
              <View style={styles.annHandleWrap}>
                <View style={styles.annHandlePill} />
              </View>

              <View style={styles.annModalHeader}>
                <View style={styles.annHeaderTextCol}>
                  <View style={styles.annCategoryRow}>
                    <Ionicons name="megaphone" size={14} color="#818cf8" />
                    <Text style={styles.annCategoryText}>Ogłoszenie szkolne</Text>
                  </View>
                  <Text style={styles.annModalTitle}>
                    {selectedAnnouncement.title}
                  </Text>
                </View>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={closeAnnouncementModal}
                  style={styles.annCloseBtn}>
                  <Ionicons name="close" size={20} color="#cbd5e1" />
                </TouchableOpacity>
              </View>

              <View style={styles.annMetaBox}>
                <View style={styles.annMetaItem}>
                  <Ionicons name="person-outline" size={14} color="#94a3b8" />
                  <Text style={styles.annMetaText}>
                    {selectedAnnouncement.author}
                  </Text>
                </View>
                <View style={styles.annMetaItem}>
                  <Ionicons name="calendar-outline" size={14} color="#94a3b8" />
                  <Text style={styles.annMetaText}>
                    {selectedAnnouncement.date}
                  </Text>
                </View>
              </View>

              <ScrollView
                style={styles.annBodyScroll}
                contentContainerStyle={styles.annBodyContent}
                showsVerticalScrollIndicator={false}
                scrollEventThrottle={16}
                onScroll={(e) => {
                  annScrollYRef.current = e.nativeEvent.contentOffset.y;
                }}>
                <Text selectable style={styles.annBodyText}>
                  {selectedAnnouncement.content}
                </Text>
              </ScrollView>
            </Animated.View>
          )}
        </View>
      </Modal>
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
    gap: 8,
  },
  markAllReadBtn: {
    width: 40,
    height: 42,
    borderRadius: 13,
    backgroundColor: 'rgba(129, 140, 248, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
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
    gap: 2,
  },
  folderTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 4,
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
    paddingHorizontal: 5.5,
    paddingVertical: 1,
    borderRadius: 999,
  },
  unreadAnnouncementPill: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 5.5,
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
  announcementCardUnread: {
    backgroundColor: 'rgba(49, 46, 129, 0.32)',
    borderColor: 'rgba(129, 140, 248, 0.6)',
  },
  announcementPreview: {
    color: '#cbd5e1',
    fontSize: 13,
    lineHeight: 19,
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
  badgeNewAnn: {
    backgroundColor: 'rgba(129, 140, 248, 0.18)',
    borderColor: 'rgba(129, 140, 248, 0.5)',
  },
  badgeNewAnnText: {
    color: '#a5b4fc',
    fontSize: 10.5,
    fontWeight: '800',
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
  annModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  annModalBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(2, 6, 23, 0.78)',
  },
  annModalSheet: {
    maxHeight: '88%',
    backgroundColor: '#0f172a',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderTopWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
  },
  annHandleWrap: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  annHandlePill: {
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#475569',
  },
  annModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 12,
    gap: 12,
  },
  annHeaderTextCol: {
    flex: 1,
    gap: 4,
  },
  annCategoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  annCategoryText: {
    color: '#818cf8',
    fontSize: 11.5,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  annModalTitle: {
    color: '#f8fafc',
    fontSize: 19,
    fontWeight: '800',
    lineHeight: 25,
  },
  annCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  annMetaBox: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginHorizontal: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  annMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  annMetaText: {
    color: '#cbd5e1',
    fontSize: 12.5,
    fontWeight: '600',
  },
  annBodyScroll: {
    marginTop: 12,
  },
  annBodyContent: {
    paddingHorizontal: 18,
    paddingBottom: 16,
  },
  annBodyText: {
    color: '#e2e8f0',
    fontSize: 15,
    lineHeight: 23,
  },
});

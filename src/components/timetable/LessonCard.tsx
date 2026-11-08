import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TimetableLesson } from '@/types/librus';
import { getSubjectColor } from '@/utils/subjectColors';
import {
  getTerminarzColor,
  isGradedAssessmentCategory,
} from '@/utils/terminarzMatcher';
import { AttendanceIcon } from './AttendanceIcon';

interface LessonCardProps {
  lesson: TimetableLesson;
  top: number;
  height: number;
  columnIndex?: number;
  columnCount?: number;
  onPress: (lesson: TimetableLesson) => void;
  onLongPress?: (lesson: TimetableLesson) => void;
}

export const LessonCard: React.FC<LessonCardProps> = ({
  lesson,
  top,
  height,
  columnIndex = 0,
  columnCount = 1,
  onPress,
  onLongPress,
}) => {
  const isStandalone = Boolean(lesson.isStandaloneEvent);
  const isFreeDay = !isStandalone && Boolean(lesson.isFreeDay);
  const isCancelled = !isStandalone && Boolean(lesson.isCancelled || isFreeDay);
  const isSubstitution = !isStandalone && !isCancelled && Boolean(lesson.isSubstitution);

  // Odwołane and Zastępstwo take top priority over Terminarz test outlines/badges
  const primaryEvent =
    !isCancelled && !isSubstitution && lesson.events && lesson.events.length > 0
      ? lesson.events[0]
      : null;
  const extraEventsCount =
    primaryEvent && lesson.events && lesson.events.length > 1
      ? lesson.events.length - 1
      : 0;
  const eventColor = primaryEvent ? getTerminarzColor(primaryEvent.category) : null;
  const hasGradedAssessmentOutline = Boolean(
    !isStandalone &&
      primaryEvent &&
      isGradedAssessmentCategory(primaryEvent.category)
  );
  const subjectColor =
    isStandalone && eventColor ? eventColor : getSubjectColor(lesson.subject);

  const changeTagLabel = isFreeDay
    ? 'Dzień wolny'
    : isCancelled
      ? 'Odwołane'
      : isSubstitution
        ? lesson.changeType === 'room'
          ? 'Zmiana sali'
          : lesson.changeType === 'moved'
            ? 'Przesunięto'
            : 'Zastępstwo'
        : null;

  const outlineColor = isCancelled
    ? 'rgba(239, 68, 68, 0.42)'
    : isSubstitution
      ? 'rgba(245, 158, 11, 0.65)'
      : isStandalone && eventColor
        ? `${eventColor}99`
        : hasGradedAssessmentOutline && eventColor
          ? eventColor
          : 'rgba(51, 65, 85, 0.55)';

  const autoFrom = primaryEvent?.autoAdjustedFromLesson;
  const eventBadgeLabel = primaryEvent
    ? `${primaryEvent.shortLabel}${
        autoFrom !== undefined ? ` · z lek. ${autoFrom}` : ''
      }${extraEventsCount > 0 ? ` +${extraEventsCount}` : ''}`
    : '';

  const horizontalPositionStyle =
    columnCount > 1
      ? {
          left: `${(columnIndex * 100) / columnCount + (columnIndex > 0 ? 1 : 0)}%` as const,
          width: `${100 / columnCount - 1}%` as const,
          right: undefined,
        }
      : null;

  const standaloneHasNoLessonNumber =
    isStandalone && primaryEvent && primaryEvent.lessonNumber < 0;
  const cleanClassroom = lesson.classroom
    ? lesson.classroom.replace(/\s+/g, ' ').trim()
    : '';

  return (
    <Pressable
      onPress={() => onPress(lesson)}
      onLongPress={onLongPress ? () => onLongPress(lesson) : undefined}
      delayLongPress={320}
      style={({ pressed }) => [
        styles.card,
        {
          top,
          height: Math.max(height - 2, 54),
          borderColor: outlineColor,
          borderWidth:
            isCancelled || isSubstitution || hasGradedAssessmentOutline
              ? 1.25
              : 1,
        },
        horizontalPositionStyle,
        isStandalone && styles.cardStandalone,
        isCancelled && styles.cardCancelled,
        isSubstitution && styles.cardSubstitution,
        pressed && styles.cardPressed,
      ]}>
      <View
        style={[
          styles.accentBar,
          { backgroundColor: isStandalone ? `${subjectColor}AA` : subjectColor },
          isCancelled && styles.accentCancelled,
          isSubstitution && styles.accentSubstitution,
        ]}
      />

      <View style={styles.content}>
        <View style={styles.topRow}>
          <View style={styles.titleRow}>
            <View
              style={[
                styles.hourBadge,
                !isCancelled && {
                  backgroundColor: `${subjectColor}22`,
                  borderColor: `${subjectColor}55`,
                  borderWidth: 1,
                },
              ]}>
              <Text
                style={[
                  styles.hourBadgeText,
                  !isCancelled && { color: subjectColor },
                ]}>
                {standaloneHasNoLessonNumber ? '•' : lesson.hourNumber}
              </Text>
            </View>
            <Text
              numberOfLines={1}
              style={[
                styles.subject,
                isStandalone && styles.subjectStandalone,
                isCancelled && styles.subjectCancelled,
              ]}>
              {lesson.subject}
            </Text>
          </View>

          <View style={styles.rightBadges}>
            {changeTagLabel ? (
              <View
                style={[
                  styles.changeTag,
                  isCancelled ? styles.changeTagCancelled : styles.changeTagSubstitution,
                ]}>
                <Text
                  style={[
                    styles.changeTagText,
                    isCancelled
                      ? styles.changeTagTextCancelled
                      : styles.changeTagTextSubstitution,
                  ]}>
                  {changeTagLabel}
                </Text>
              </View>
            ) : primaryEvent && eventColor ? (
              <View
                style={[
                  styles.changeTag,
                  hasGradedAssessmentOutline || isStandalone
                    ? {
                        backgroundColor: `${eventColor}1F`,
                        borderColor: `${eventColor}66`,
                      }
                    : styles.subtleOtherTag,
                ]}>
                <Text
                  style={[
                    styles.changeTagText,
                    {
                      color:
                        hasGradedAssessmentOutline || isStandalone
                          ? eventColor
                          : '#cbd5e1',
                    },
                  ]}>
                  {eventBadgeLabel}
                </Text>
              </View>
            ) : null}
            {!isStandalone && (
              <AttendanceIcon attendance={lesson.attendance} size="sm" />
            )}
          </View>
        </View>

        <View style={styles.bottomRow}>
          <Text numberOfLines={1} style={styles.metaText}>
            {lesson.startTime}–{lesson.endTime}
            {!cleanClassroom && isStandalone && lesson.note
              ? `  ·  ${lesson.note}`
              : ''}
          </Text>
          {cleanClassroom ? (
            <View style={styles.roomPill}>
              <Text numberOfLines={1} style={styles.roomPillText}>
                s. {cleanClassroom}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(51, 65, 85, 0.55)',
    flexDirection: 'row',
    overflow: 'hidden',
  },
  cardStandalone: {
    backgroundColor: 'rgba(15, 23, 42, 0.94)',
    opacity: 0.96,
    zIndex: 10,
    elevation: 4,
  },
  cardCancelled: {
    backgroundColor: 'rgba(15, 23, 42, 0.36)',
    opacity: 0.36,
    zIndex: 1,
  },
  cardSubstitution: {
    backgroundColor: 'rgba(30, 41, 59, 0.95)',
  },
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.992 }],
  },
  accentBar: {
    width: 4,
    backgroundColor: '#3b82f6',
  },
  accentCancelled: {
    backgroundColor: '#ef4444',
  },
  accentSubstitution: {
    backgroundColor: '#f59e0b',
  },
  content: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    justifyContent: 'space-between',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  titleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  hourBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 6,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  hourBadgeText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '800',
  },
  subject: {
    flex: 1,
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700',
  },
  subjectStandalone: {
    color: '#cbd5e1',
    fontWeight: '600',
  },
  subjectCancelled: {
    textDecorationLine: 'line-through',
    color: '#94a3b8',
  },
  rightBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  changeTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  changeTagCancelled: {
    backgroundColor: 'rgba(239, 68, 68, 0.16)',
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  changeTagSubstitution: {
    backgroundColor: 'rgba(245, 158, 11, 0.16)',
    borderColor: 'rgba(245, 158, 11, 0.45)',
  },
  subtleOtherTag: {
    backgroundColor: 'rgba(148, 163, 184, 0.14)',
    borderColor: 'rgba(148, 163, 184, 0.35)',
  },
  changeTagText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  changeTagTextCancelled: {
    color: '#f87171',
    textTransform: 'uppercase',
  },
  changeTagTextSubstitution: {
    color: '#fbbf24',
    textTransform: 'uppercase',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 2,
  },
  metaText: {
    flex: 1,
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '500',
  },
  roomPill: {
    flexShrink: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.3)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  roomPillText: {
    color: '#e2e8f0',
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});

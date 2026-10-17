import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TimetableLesson } from '@/types/librus';
import { getSubjectColor } from '@/utils/subjectColors';
import { AttendanceIcon } from './AttendanceIcon';

interface LessonCardProps {
  lesson: TimetableLesson;
  top: number;
  height: number;
  onPress: (lesson: TimetableLesson) => void;
}

export const LessonCard: React.FC<LessonCardProps> = ({
  lesson,
  top,
  height,
  onPress,
}) => {
  const isCancelled = Boolean(lesson.isCancelled);
  const isSubstitution = !isCancelled && Boolean(lesson.isSubstitution);
  const subjectColor = getSubjectColor(lesson.subject);

  const changeTagLabel = isCancelled
    ? 'Odwołane'
    : isSubstitution
      ? lesson.changeType === 'room'
        ? 'Zmiana sali'
        : lesson.changeType === 'moved'
          ? 'Przesunięto'
          : 'Zastępstwo'
      : null;

  return (
    <Pressable
      onPress={() => onPress(lesson)}
      style={({ pressed }) => [
        styles.card,
        {
          top,
          height: Math.max(height - 2, 54),
          borderColor: isCancelled
            ? 'rgba(239, 68, 68, 0.35)'
            : isSubstitution
              ? 'rgba(245, 158, 11, 0.5)'
              : `${subjectColor}44`,
        },
        isCancelled && styles.cardCancelled,
        isSubstitution && styles.cardSubstitution,
        pressed && styles.cardPressed,
      ]}>
      <View
        style={[
          styles.accentBar,
          { backgroundColor: subjectColor },
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
                {lesson.hourNumber}
              </Text>
            </View>
            <Text
              numberOfLines={1}
              style={[
                styles.subject,
                isCancelled && styles.subjectCancelled,
              ]}>
              {lesson.subject}
            </Text>
          </View>

          <View style={styles.rightBadges}>
            {changeTagLabel && (
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
            )}
            <AttendanceIcon attendance={lesson.attendance} size="sm" />
          </View>
        </View>

        <View style={styles.bottomRow}>
          <Text numberOfLines={1} style={styles.metaText}>
            {lesson.startTime}–{lesson.endTime}
            {lesson.classroom ? `  ·  s. ${lesson.classroom}` : ''}
            {lesson.teacher ? `  ·  ${lesson.teacher}` : ''}
          </Text>
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
    borderColor: '#334155',
    flexDirection: 'row',
    overflow: 'hidden',
  },
  cardCancelled: {
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
    opacity: 0.68,
  },
  cardSubstitution: {
    backgroundColor: 'rgba(30, 41, 59, 0.95)',
  },
  cardPressed: {
    opacity: 0.8,
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
    paddingVertical: 7,
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
  changeTagText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  changeTagTextCancelled: {
    color: '#f87171',
  },
  changeTagTextSubstitution: {
    color: '#fbbf24',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  metaText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '500',
  },
});

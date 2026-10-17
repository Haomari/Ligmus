import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AttendanceKind, AttendanceMark } from '@/types/librus';

interface AttendanceIconProps {
  attendance?: AttendanceMark;
  size?: 'sm' | 'md';
}

interface BadgeConfig {
  label: string;
  bg: string;
  border: string;
  color: string;
}

export function getAttendanceBadgeConfig(kind: AttendanceKind): BadgeConfig | null {
  switch (kind) {
    case 'present':
      return {
        label: '✓',
        bg: 'rgba(16, 185, 129, 0.16)',
        border: 'rgba(16, 185, 129, 0.45)',
        color: '#34d399',
      };
    case 'absent':
      return {
        label: 'NB',
        bg: 'rgba(239, 68, 68, 0.18)',
        border: 'rgba(239, 68, 68, 0.5)',
        color: '#f87171',
      };
    case 'late':
      return {
        label: 'SP',
        bg: 'rgba(245, 158, 11, 0.18)',
        border: 'rgba(245, 158, 11, 0.5)',
        color: '#fbbf24',
      };
    case 'excused':
      return {
        label: 'U',
        bg: 'rgba(59, 130, 246, 0.18)',
        border: 'rgba(59, 130, 246, 0.5)',
        color: '#60a5fa',
      };
    case 'exempt':
      return {
        label: 'ZW',
        bg: 'rgba(168, 85, 247, 0.18)',
        border: 'rgba(168, 85, 247, 0.5)',
        color: '#c084fc',
      };
    default:
      return null;
  }
}

export const AttendanceIcon: React.FC<AttendanceIconProps> = ({
  attendance,
  size = 'sm',
}) => {
  if (!attendance) return null;
  const config = getAttendanceBadgeConfig(attendance.kind);
  if (!config) return null;

  const isMd = size === 'md';

  return (
    <View
      style={[
        styles.badge,
        isMd && styles.badgeMd,
        {
          backgroundColor: config.bg,
          borderColor: config.border,
        },
      ]}>
      <Text
        style={[
          styles.iconText,
          isMd && styles.iconTextMd,
          { color: config.color },
        ]}>
        {config.label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 5,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeMd: {
    minWidth: 28,
    height: 28,
    paddingHorizontal: 7,
    borderRadius: 9,
  },
  iconText: {
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 14,
  },
  iconTextMd: {
    fontSize: 13,
    lineHeight: 16,
  },
});

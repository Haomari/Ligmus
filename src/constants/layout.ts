import { Dimensions, Platform } from 'react-native';

export const WIDE_LAYOUT_BREAKPOINT = 600;
export const RIGHT_RAIL_WIDTH = 76;

/**
 * Returns the effective bottom safe inset when the Right Rail is active (`isWideScreen === true`).
 * When `tabBarPosition` is `'right'`, there is no bottom tab bar pushing content above the
 * Android tablet taskbar / navigation bar, and some Android tablet ROMs report `insets.bottom === 0`
 * in edge-to-edge mode even when the ~48–64dp system taskbar overlays the bottom of the screen.
 */
export function getEffectiveBottomInset(
  insetsBottom: number,
  isWideScreen: boolean
): number {
  if (!isWideScreen) {
    return insetsBottom;
  }
  const screenH = Dimensions.get('screen').height;
  const windowH = Dimensions.get('window').height;
  const systemBarDiff = Math.max(0, screenH - windowH);
  const minWideClearance = Platform.OS === 'android' ? 60 : 20;
  return Math.max(insetsBottom, Math.min(systemBarDiff, 96), minWideClearance);
}

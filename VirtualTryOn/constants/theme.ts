/**
 * Design-system constants – colours, typography, spacing.
 */

import { Platform } from 'react-native';

/* ───── colour palette (from design mockup) ───── */
const tintColorLight = '#2D3335';
const tintColorDark = '#F8F9FA';

export const Colors = {
  light: {
    text: '#2D3335',
    textSecondary: '#5A6062',
    background: '#F8F9FA',
    tint: tintColorLight,
    icon: '#2D3335',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorLight,
    primary: '#2D3335',
    primaryLight: 'rgba(45,51,53,0.10)',
    accent: '#575E7C',
    accentLight: '#D5DBFF',
    purple: '#6D567E',
    purpleLight: '#E1C4F4',
    card: '#F1F4F5',
    pill: '#E5E9EB',
    border: '#EEF1F4',
    badgeRed: '#A83836',
  },
  dark: {
    text: '#ECEDEE',
    textSecondary: '#9BA1A6',
    background: '#1a1a2e',
    tint: tintColorDark,
    icon: '#F8F9FA',
    tabIconDefault: '#5A6062',
    tabIconSelected: tintColorDark,
    primary: '#F8F9FA',
    primaryLight: 'rgba(248,249,250,0.12)',
    accent: '#D5DBFF',
    accentLight: '#575E7C',
    purple: '#E1C4F4',
    purpleLight: '#6D567E',
    card: '#2A2A3E',
    pill: '#3A3A50',
    border: '#3A3A50',
    badgeRed: '#EF4444',
  },
};

/* ───── typography ───── */

/** Font-family tokens – mapped after expo-font loads the assets */
export const FontFamily = {
  /** Brand headings (OUI logo, hero titles) */
  brand: 'AbhayaLibre_700Bold',
  /** Section titles, buttons */
  heading: 'Manrope_700Bold',
  headingSemiBold: 'Manrope_600SemiBold',
  headingExtra: 'Manrope_800ExtraBold',
  /** Body, prices, labels */
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemiBold: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
};

export const Fonts = Platform.select({
  ios: {
    sans: undefined,
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: undefined,
    serif: 'serif',
    rounded: undefined,
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
  },
});

// Default font family for the app
export const defaultFontFamily = FontFamily.body;

/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const tintColorLight = '#6B4EAA';
const tintColorDark = '#9D7DD9';

export const Colors = {
  light: {
    text: '#1a1a2e',
    background: '#fff',
    tint: tintColorLight,
    icon: '#6B4EAA',
    tabIconDefault: '#888',
    tabIconSelected: tintColorLight,
    primary: '#6B4EAA',
    primaryLight: 'rgba(107,78,170,0.15)',
  },
  dark: {
    text: '#ECEDEE',
    background: '#1a1a2e',
    tint: tintColorDark,
    icon: '#9D7DD9',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
    primary: '#9D7DD9',
    primaryLight: 'rgba(157,125,217,0.2)',
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: undefined, // System (San Francisco)
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: undefined, // System (Roboto on Android)
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
export const defaultFontFamily = Fonts.sans;

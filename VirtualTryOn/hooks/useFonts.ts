import { useFonts } from 'expo-font';

/** Load custom fonts. Uses system fonts (Roboto on Android, SF on iOS) when no font assets are present. */
export function useRobotoFonts() {
  const [fontsLoaded] = useFonts({
    // No custom font files in assets/fonts; app uses platform defaults to avoid prebuild ENOENT.
  });

  return fontsLoaded;
}

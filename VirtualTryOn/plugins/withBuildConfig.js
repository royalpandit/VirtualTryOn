const { withAppBuildGradle } = require('@expo/config-plugins/build/plugins/android-plugins');

/**
 * Expo config plugin to enable BuildConfig generation in the Android app module.
 * Fixes "Unresolved reference: BuildConfig" in MainActivity.kt and MainApplication.kt
 * when building with newer Android Gradle Plugin (AGP 8+), which disables BuildConfig by default.
 */
function withBuildConfig(config) {
  return withAppBuildGradle(config, (config) => {
    let contents = config.modResults.contents;
    // Only add if not already present
    if (contents.includes('buildConfig = true') || contents.includes('buildConfig=true')) {
      return config;
    }
    // Insert buildFeatures { buildConfig = true } right after "android {"
    const androidBlockStart = contents.indexOf('android {');
    if (androidBlockStart === -1) {
      return config;
    }
    const insertPos = androidBlockStart + 'android {'.length;
    const buildFeaturesBlock = `
    buildFeatures {
        buildConfig = true
    }
`;
    contents =
      contents.slice(0, insertPos) +
      buildFeaturesBlock +
      contents.slice(insertPos);
    config.modResults.contents = contents;
    return config;
  });
}

module.exports = withBuildConfig;

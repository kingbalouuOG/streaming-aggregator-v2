const { withAppBuildGradle } = require('@expo/config-plugins');

// Expo config plugin: inject the Play release signingConfig into the generated
// android/app/build.gradle on every `expo prebuild`.
//
// `android/` is generated + gitignored, so before this plugin the hand-applied
// release signing was wiped by every prebuild and had to be re-added by hand
// (easy to forget → an AAB silently signed with the debug key, which Play
// rejects). This makes it durable + committed.
//
// No secrets live here: the keystore path is resolved from the user's home dir,
// and the passwords come from ~/.gradle/gradle.properties via project.findProperty
// (never committed). The keystore SHA-256 must start 99:CE:FF:7E (Play upload key).

const RELEASE_SIGNING_BLOCK = `
        release {
            storeFile file(System.getProperty("user.home") + "/Documents/Code/videx-release")
            storePassword project.findProperty("VIDEX_UPLOAD_STORE_PASSWORD") ?: ""
            keyAlias "videx-key"
            keyPassword project.findProperty("VIDEX_UPLOAD_KEY_PASSWORD") ?: ""
        }`;

// Exact text emitted by the Expo SDK 56 template — anchors for the two edits.
const DEBUG_SIGNING_BLOCK = `        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }`;

const RELEASE_BUILDTYPE_DEBUG = `        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug`;

const RELEASE_BUILDTYPE_RELEASE = `        release {
            signingConfig signingConfigs.release`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let gradle = cfg.modResults.contents;

    // 1. Add the release signingConfig next to the debug one (idempotent).
    if (!gradle.includes('VIDEX_UPLOAD_STORE_PASSWORD')) {
      if (!gradle.includes(DEBUG_SIGNING_BLOCK)) {
        throw new Error(
          '[withReleaseSigning] debug signingConfig anchor not found — the Expo ' +
            'build.gradle template changed; update plugins/withReleaseSigning.js.',
        );
      }
      gradle = gradle.replace(DEBUG_SIGNING_BLOCK, DEBUG_SIGNING_BLOCK + RELEASE_SIGNING_BLOCK);
    }

    // 2. Point the release buildType at signingConfigs.release.
    if (gradle.includes(RELEASE_BUILDTYPE_DEBUG)) {
      gradle = gradle.replace(RELEASE_BUILDTYPE_DEBUG, RELEASE_BUILDTYPE_RELEASE);
    } else if (!gradle.includes('signingConfig signingConfigs.release')) {
      throw new Error(
        '[withReleaseSigning] release buildType signingConfig anchor not found — ' +
          'the Expo template changed; update plugins/withReleaseSigning.js.',
      );
    }

    cfg.modResults.contents = gradle;
    return cfg;
  });
};

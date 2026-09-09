const { AndroidConfig, withAndroidManifest } = require('@expo/config-plugins');

// Expo config plugin: bake the EAS Update channel into the Android manifest.
//
// WHY THIS HAS TO EXIST.
//
// `eas build` injects the channel from the matching `eas.json` build profile.
// Android does NOT go through EAS Build — android-release.yml runs
// `expo prebuild` + Gradle on a runner (see the notes at the top of that
// workflow for why). A bare prebuild writes the update URL and the runtime
// version into the manifest but NOT the channel, so every AAB shipped to Play
// asked u.expo.dev for an update with no `expo-channel-name` header — and the
// server rejects that outright:
//
//   HTTP/1.1 400 Bad Request
//   "channel-name": Required.
//
// So Android received NO OTA updates at all, silently, from the moment
// expo-updates shipped. Confirmed against the 2.2.0 AAB, whose manifest has
// every other expo.modules.updates key and not this one. See issue #137.
//
// ORDERING. expo-updates' own plugin is auto-applied by @expo/prebuild-config,
// which registers it AFTER the plugins listed in app.json. Mods run
// newest-registered first, so expo-updates runs before this one — including the
// branch that DELETES this key when `updates.requestHeaders` is unset. Writing
// it here therefore wins. (Setting `updates.requestHeaders` in app.json would
// also work, but it is platform-agnostic and would fight the channel EAS Build
// injects into iOS builds from eas.json. This stays Android-only on purpose.)
//
// The channel is hardcoded because the Gradle path builds exactly one thing:
// the Play release. The sideloadable APK from the same workflow follows it,
// which is what you want — a test handset should see what Play users see.
// The channel is NOT part of the fingerprint, so this does not affect which
// runtime version an update has to match.

const CHANNEL = 'production';

// Read by expo-updates as a JSON map of headers sent on every update request.
// Absent means `{}` — i.e. no channel. Key name is Config.UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY
// in @expo/config-plugins' AndroidConfig.Updates.
const REQUEST_HEADERS_KEY = 'expo.modules.updates.UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY';

module.exports = function withUpdatesChannel(config) {
  return withAndroidManifest(config, (cfg) => {
    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);

    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      mainApplication,
      REQUEST_HEADERS_KEY,
      JSON.stringify({ 'expo-channel-name': CHANNEL }),
    );

    return cfg;
  });
};

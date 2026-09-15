// Dynamic Expo config (SDK 56). Layers an APP_VARIANT switch on top of the
// static app.json so a *development* build installs as a SEPARATE Android
// app — "Videx Dev" / com.videx.app.dev — that sits alongside the Play
// release (app.videx.streaming). This lets us build straight to a device
// and test before shipping, without uninstalling or clobbering the
// production app.
//
// Release / EAS builds run with no APP_VARIANT set and fall through to the
// production identifiers already declared in app.json.
//
// Usage (see package.json scripts):
//   npm run android:dev   # APP_VARIANT=development → "Videx Dev"
//   npm run android       # production id from app.json
//
// app.json stays the static source of truth; Expo passes it in as `config`
// and we override only the fields that must differ per variant or come
// from the environment. iOS is left untouched — its bundle id is still the
// dev id (TestFlight prep).
//
// Growth S3: Google Sign-In on iOS needs a URL scheme equal to the REVERSED
// iOS OAuth client id. Client ids are not committed: they come from
// EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID in native/.env (local), the EAS
// "production" environment (iOS builds; plain-text or sensitive visibility
// so eas-cli can read it while resolving this file) and GitHub secrets
// written to native/.env (Android runner). Keep all three identical —
// runtimeVersion is a fingerprint over this config. Without the id the
// plugin is left out rather than failing the build, and the app hides the
// Google button (providers/auth.tsx), since signing in without the scheme
// crashes on iOS.

const IS_DEV = process.env.APP_VARIANT === 'development';

const GOOGLE_CLIENT_SUFFIX = '.apps.googleusercontent.com';

function googleIosUrlScheme(iosClientId) {
  if (!iosClientId || !iosClientId.endsWith(GOOGLE_CLIENT_SUFFIX)) return null;
  return `com.googleusercontent.apps.${iosClientId.slice(0, -GOOGLE_CLIENT_SUFFIX.length)}`;
}

const iosUrlScheme = googleIosUrlScheme(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID);

module.exports = ({ config }) => ({
  ...config,
  name: IS_DEV ? 'Videx Dev' : config.name,
  android: {
    ...config.android,
    package: IS_DEV ? 'com.videx.app.dev' : config.android.package,
  },
  plugins: iosUrlScheme
    ? [...config.plugins, ['@react-native-google-signin/google-signin', { iosUrlScheme }]]
    : config.plugins,
});

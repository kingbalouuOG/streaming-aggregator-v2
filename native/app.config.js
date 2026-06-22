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
// and we override only the two fields that must differ per variant. iOS is
// left untouched — its bundle id is still the dev id (TestFlight prep).

const IS_DEV = process.env.APP_VARIANT === 'development';

module.exports = ({ config }) => ({
  ...config,
  name: IS_DEV ? 'Videx Dev' : config.name,
  android: {
    ...config.android,
    package: IS_DEV ? 'com.videx.app.dev' : config.android.package,
  },
});

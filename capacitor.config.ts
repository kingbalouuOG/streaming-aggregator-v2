import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.videx.streaming',
  appName: 'Videx',
  webDir: 'dist',
  // UX-1 W4: the WebView's NATIVE background. Without it the WebView
  // paints white between splash teardown and first web paint - the
  // launch flash. Matches --surface / theme-color / navigationBarColor.
  backgroundColor: '#0a0a0f',
  plugins: {
    StatusBar: { style: 'Dark', backgroundColor: '#0a0a0a' },
    SplashScreen: {
      // UX-1 (forum-confirmed pattern): hold the splash until React has
      // actually painted - App.tsx hides it after the first frame. Auto
      // -hide dropped the splash on WebView-ready, ~before first paint,
      // leaving a (dark, colour-matched) gap.
      launchAutoHide: false,
      backgroundColor: '#0a0a0a',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
    },
  },
};

if (process.env.LIVE_RELOAD) {
  config.server = {
    url: `http://${process.env.LIVE_RELOAD}:3000`,
    cleartext: true,
  };
}

export default config;

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
      launchAutoHide: true,
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

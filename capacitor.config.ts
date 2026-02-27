import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.videx.streaming',
  appName: 'Videx',
  webDir: 'dist',
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

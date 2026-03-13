import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.akshay.apps',
  appName: 'Akshay Apps',
  webDir: 'dist',
  server: {
    // During development, point to your local Vite dev server
    // Comment this out for production builds
    // url: 'http://192.168.1.X:5173',  // ← replace with your Mac's local IP
    // cleartext: true
  },
  ios: {
    contentInset: 'always',        // respect safe areas (notch, home bar)
    scrollEnabled: true,
    backgroundColor: '#0c0c0f',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: '#0c0c0f',
      showSpinner: false,
    },
    StatusBar: {
      style: 'dark',               // light text on dark background
      backgroundColor: '#0c0c0f',
      overlaysWebView: false,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;

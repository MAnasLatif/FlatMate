import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'FlatMate',
  slug: 'flatmate',
  version: '0.1.0',
  orientation: 'portrait',
  scheme: 'flatmate',
  // Follow the device's light or dark setting (SRS section 7).
  userInterfaceStyle: 'automatic',
  icon: './assets/images/icon.png',
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        image: './assets/images/logo-mark.png',
        imageWidth: 160,
        backgroundColor: '#FFFFFF',
        dark: {
          image: './assets/images/logo-mark-dark.png',
          backgroundColor: '#0A1728',
        },
      },
    ],
    'expo-secure-store',
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default config;

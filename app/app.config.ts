import type { ExpoConfig } from 'expo/config';

// Firebase identifies the Android app for push notifications. EAS cloud builds
// get the file from the GOOGLE_SERVICES_JSON file environment variable, and
// local builds from the same variable in app/.env (supabase/README.md (Push notifications setup)).
// Without it the app builds and runs, and Android push is unavailable.
const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;

const config: ExpoConfig = {
  name: 'FlatMate',
  slug: 'flatmate',
  // The Expo account that owns the EAS project.
  owner: 'm.anaslatif',
  version: '0.1.0',
  // Mobile only. Without this, Expo also targets web because react-dom is
  // installed, and the dev server offers a web build the app does not support.
  platforms: ['ios', 'android'],
  orientation: 'portrait',
  scheme: 'flatmate',
  // Follow the device's light or dark setting (SRS section 7).
  userInterfaceStyle: 'automatic',
  icon: './assets/images/icon.png',
  // Store identifiers. They cannot be changed once the app is published.
  ios: {
    bundleIdentifier: 'dev.manaslatif.flatmate',
  },
  android: {
    package: 'dev.manaslatif.flatmate',
    ...(googleServicesFile ? { googleServicesFile } : {}),
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
    [
      'expo-notifications',
      {
        // Android draws the status-bar icon from the image's alpha, so it must
        // be white on transparent: the adaptive icon's monochrome layer.
        icon: './assets/images/android-icon-monochrome.png',
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    eas: {
      projectId: '1bbde0d8-94b5-4446-8591-a0179d09d30d',
    },
  },
};

export default config;

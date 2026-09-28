import type { ConfigContext, ExpoConfig } from 'expo/config';

import { GOOGLE_OAUTH_REGISTRATIONS, validateGoogleOAuthConfig } from './scripts/google-oauth-config.mjs';

export default ({ config }: ConfigContext): ExpoConfig => {
  const buildProfile =
    process.env.GYM_TRACKER_BUILD_PROFILE ?? 'production';
  const developmentTest = buildProfile === 'development-test';

  if (!developmentTest && buildProfile !== 'production') {
    throw new Error(
      `Unsupported GYM_TRACKER_BUILD_PROFILE "${buildProfile}". Use development-test or production.`,
    );
  }
  const googleOAuth = validateGoogleOAuthConfig({
    buildProfile,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  });

  return {
    ...config,
    name: developmentTest ? 'Gym Tracker Dev Test' : 'Gym Tracker',
    slug: 'gym-tracker',
    version: '0.1.0',
    orientation: 'default',
    icon: './assets/images/icon.png',
    scheme: developmentTest ? 'gymtracker-devtest' : 'gymtracker',
    userInterfaceStyle: 'automatic',
    android: {
      versionCode: 1,
      package: developmentTest
        ? 'com.fchoo.gymtracker.devtest'
        : 'com.fchoo.gymtracker',
      adaptiveIcon: {
        backgroundColor: '#F6F8FB',
        foregroundImage: './assets/images/android-icon-foreground.png',
        backgroundImage: './assets/images/android-icon-background.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
      permissions: [],
      blockedPermissions: [
        'android.permission.SCHEDULE_EXACT_ALARM',
        'android.permission.USE_EXACT_ALARM',
      ],
    },
    plugins: [
      'expo-router',
      [
        'expo-splash-screen',
        {
          backgroundColor: '#F6F8FB',
          image: './assets/images/splash-icon.png',
          imageWidth: 76,
        },
      ],
      [
        'expo-sqlite',
        {
          enableFTS: true,
        },
      ],
      [
        'expo-notifications',
        {
          defaultChannel: 'workout-rest-v2-sound-vibration',
        },
      ],
      './plugins/withAndroidBackupRules.ts',
      './plugins/withAndroidPhysicalTestService.ts',
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      buildProfile,
      nativeContractsEnabled: developmentTest,
      googleOAuth: {
        projectNumber: GOOGLE_OAUTH_REGISTRATIONS.projectNumber,
        webClientId: googleOAuth.webClientId,
        androidClientId: googleOAuth.registration.androidClientId,
        packageName: googleOAuth.registration.packageName,
        signingCertificate: {
          sha1: googleOAuth.registration.sha1,
          sha256: googleOAuth.registration.sha256,
        },
      },
    },
  };
};

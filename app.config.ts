import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const buildProfile =
    process.env.GYM_TRACKER_BUILD_PROFILE ?? 'production';
  const developmentTest = buildProfile === 'development-test';

  if (!developmentTest && buildProfile !== 'production') {
    throw new Error(
      `Unsupported GYM_TRACKER_BUILD_PROFILE "${buildProfile}". Use development-test or production.`,
    );
  }

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
    },
  };
};

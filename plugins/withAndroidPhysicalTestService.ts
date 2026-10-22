import {
  AndroidConfig,
  ConfigPlugin,
  withAndroidManifest,
  withDangerousMod,
} from 'expo/config-plugins';
import {
  mkdir,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

const serviceClass = '.GymTrackerPhysicalTestService';

const serviceSource = `package com.fchoo.gymtracker.devtest

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

class GymTrackerPhysicalTestService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    val extras = intent?.extras ?: return null
    val suite = extras.getString("suite")
    if (suite != "benchmark" && suite != "argon2") {
      return null
    }
    return HeadlessJsTaskConfig(
      "GymTrackerPhysicalTest",
      Arguments.fromBundle(extras),
      900_000,
      false,
    )
  }
}
`;

const withAndroidPhysicalTestService: ConfigPlugin = (config) => {
  const enabled = config.extra?.buildProfile === 'development-test'
    && config.extra?.nativeContractsEnabled === true
    && config.android?.package === 'com.fchoo.gymtracker.devtest';
  if (!enabled) {
    return config;
  }

  config = withAndroidManifest(config, (manifestConfig) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(
      manifestConfig.modResults,
    );
    // run-as needs this manifest capability; keep release BuildConfig.DEBUG false.
    application.$['android:debuggable'] = 'true';
    application.service ??= [];
    application.service = application.service.filter(
      (service) => service.$['android:name'] !== serviceClass,
    );
    type ManifestService = NonNullable<
      typeof application.service
    >[number];
    const physicalTestService: ManifestService & {
      $: ManifestService['$'] & {
        'android:stopWithTask': 'false';
      };
    } = {
      $: {
        'android:name': serviceClass,
        'android:exported': 'true',
        'android:permission': 'android.permission.DUMP',
        'android:stopWithTask': 'false',
      },
    };
    application.service.push(physicalTestService);
    return manifestConfig;
  });

  return withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const javaDirectory = path.join(
        modConfig.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'java',
        'com',
        'fchoo',
        'gymtracker',
        'devtest',
      );
      await mkdir(javaDirectory, { recursive: true });
      await writeFile(
        path.join(javaDirectory, 'GymTrackerPhysicalTestService.kt'),
        serviceSource,
      );
      return modConfig;
    },
  ]);
};

export default withAndroidPhysicalTestService;

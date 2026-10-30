import { describe, expect, it } from '@jest/globals';
import { AndroidConfig, type ExportedConfig } from 'expo/config-plugins';
import type { ExpoConfig } from 'expo/config';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import withAndroidPhysicalTestService from './withAndroidPhysicalTestService';

function devtestConfig(): ExpoConfig {
  return { name: 'test', slug: 'test', android: { package: 'com.fchoo.gymtracker.devtest' },
    extra: { buildProfile: 'development-test', nativeContractsEnabled: true } };
}

function manifest() {
  return { manifest: { $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' },
    queries: [],
    application: [{ $: { 'android:name': '.MainApplication' }, service: [
      { $: { 'android:name': '.OtherService' } },
    ] }] } };
}

describe('devtest physical native access', () => {
  it('sets only the main application manifest flag and reapplies idempotently', async () => {
    const config: ExportedConfig = withAndroidPhysicalTestService(devtestConfig());
    const action = config.mods!.android!.manifest!;
    const input = { ...config, modResults: manifest(), modRequest: { platform: 'android' } };
    const first = await action(input as never);
    const second = await action(first);
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(second.modResults);
    expect(application.$['android:debuggable']).toBe('true');
    expect(second.modResults.manifest.$['xmlns:tools']).toBe('http://schemas.android.com/tools');
    expect(application.$['tools:ignore']).toBe('HardcodedDebugMode');
    expect(application.service).toEqual([
      { $: { 'android:name': '.OtherService' } },
      { $: { 'android:name': '.GymTrackerPhysicalTestService', 'android:exported': 'true',
        'android:permission': 'android.permission.DUMP', 'android:stopWithTask': 'false' } },
    ]);
    expect(config.mods!.android!.appBuildGradle).toBeUndefined();
  });

  it('adds only the intentional test-app lint annotation and preserves existing annotations', async () => {
    const config: ExportedConfig = withAndroidPhysicalTestService(devtestConfig());
    const input = manifest();
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(input);
    application.$['tools:ignore'] = 'UnusedAttribute, HardcodedDebugMode';
    const action = config.mods!.android!.manifest!;
    const first = await action({ ...config, modResults: input, modRequest: { platform: 'android' } } as never);
    const second = await action(first);
    expect(AndroidConfig.Manifest.getMainApplicationOrThrow(second.modResults).$['tools:ignore']).toBe('UnusedAttribute,HardcodedDebugMode');
    expect(config.mods!.android!.appBuildGradle).toBeUndefined();
  });

  it('does not register manifest or source mods for any wrong identity or disabled hooks', () => {
    const missingExtra = devtestConfig();
    delete missingExtra.extra;
    const missingAndroid = devtestConfig();
    delete missingAndroid.android;
    for (const config of [
      missingExtra,
      { ...devtestConfig(), extra: { nativeContractsEnabled: true } },
      { ...devtestConfig(), extra: { buildProfile: 'production', nativeContractsEnabled: true } },
      { ...devtestConfig(), extra: { buildProfile: 'development-test', nativeContractsEnabled: false } },
      { ...devtestConfig(), extra: { buildProfile: 'development-test', nativeContractsEnabled: 'true' } },
      { ...devtestConfig(), android: { package: 'com.fchoo.gymtracker' } },
      missingAndroid,
    ]) {
      expect(withAndroidPhysicalTestService(config)).toBe(config);
      expect(config).not.toHaveProperty('mods');
    }
  });

  it('retains the protected headless service implementation in the devtest package only', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'p20-physical-plugin-'));
    try {
      const config: ExportedConfig = withAndroidPhysicalTestService(devtestConfig());
      await config.mods!.android!.dangerous!({ ...config, modRequest: { platform: 'android',
        platformProjectRoot: root } } as never);
      const source = readFileSync(path.join(root, 'app/src/main/java/com/fchoo/gymtracker/devtest/GymTrackerPhysicalTestService.kt'), 'utf8');
      expect(source).toContain('package com.fchoo.gymtracker.devtest');
      expect(source).toContain('900_000');
      expect(source).toContain('suite != "benchmark" && suite != "argon2"');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

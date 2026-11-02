import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { phase18DeviceIdentitySha256 } from './phase18-device-identity.mjs';
import {
  assertPrivacySafeNativeDeviceManifest,
  resolveEphemeralNativeDevice,
  sanitizeNativeDeviceMessage,
} from './native-device-selection.mjs';

const serial = 'emulator-5554';
const facts = {
  serial,
  abi: 'arm64-v8a',
  apiLevel: '36',
  model: 'sdk_gphone64_arm64',
};
const manifestDevice = {
  role: 'automated-test-device',
  api: 36,
  abi: facts.abi,
  model: facts.model,
  android_release: '16',
  identity_sha256: phase18DeviceIdentitySha256(facts),
};

test('accepts an explicit ephemeral device only when its canonical live identity hash matches', async () => {
  const selected = await resolveEphemeralNativeDevice({
    explicitDevice: serial,
    manifestDevice,
    adb: async (...args) => {
      assert.equal(args[0], '-s');
      if (args.at(-1) === 'get-state') return 'device';
      if (args.at(-1) === 'ro.product.cpu.abi') return facts.abi;
      if (args.at(-1) === 'ro.build.version.sdk') return facts.apiLevel;
      if (args.at(-1) === 'ro.product.model') return facts.model;
      throw new Error('unexpected adb operation');
    },
  });
  assert.equal(selected, serial);
});

test('accepts ANDROID_SERIAL as an equally ephemeral device lease', async () => {
  const selected = await resolveEphemeralNativeDevice({
    androidSerial: serial,
    manifestDevice,
    adb: async (...args) => {
      if (args.at(-1) === 'get-state') return 'device';
      if (args.at(-1) === 'ro.product.cpu.abi') return facts.abi;
      if (args.at(-1) === 'ro.build.version.sdk') return facts.apiLevel;
      if (args.at(-1) === 'ro.product.model') return facts.model;
      throw new Error('unexpected adb operation');
    },
  });
  assert.equal(selected, serial);
});

test('selects exactly one online adb device when no explicit device or ANDROID_SERIAL is supplied', async () => {
  const selected = await resolveEphemeralNativeDevice({
    manifestDevice,
    adb: async (...args) => {
      if (args.join(' ') === 'devices') return `List of devices attached\n${serial}\tdevice\n`;
      if (args.at(-1) === 'get-state') return 'device';
      if (args.at(-1) === 'ro.product.cpu.abi') return facts.abi;
      if (args.at(-1) === 'ro.build.version.sdk') return facts.apiLevel;
      if (args.at(-1) === 'ro.product.model') return facts.model;
      throw new Error('unexpected adb operation');
    },
  });
  assert.equal(selected, serial);
});

test('fails closed for identity drift and absent or ambiguous online device selection without revealing a serial', async () => {
  const deviceAdb = async (...args) => {
    if (args.at(-1) === 'get-state') return 'device';
    if (args.at(-1) === 'ro.product.cpu.abi') return facts.abi;
    if (args.at(-1) === 'ro.build.version.sdk') return facts.apiLevel;
    if (args.at(-1) === 'ro.product.model') return facts.model;
    return '';
  };
  await assert.rejects(
    resolveEphemeralNativeDevice({ explicitDevice: serial, manifestDevice: { ...manifestDevice, identity_sha256: 'a'.repeat(64) }, adb: deviceAdb }),
    (error) => error.message === 'native_device_identity_mismatch' && !error.message.includes(serial),
  );
  for (const devices of [
    'List of devices attached\n',
    `List of devices attached\n${serial}\tdevice\nother-device\tdevice\n`,
  ]) {
    await assert.rejects(
      resolveEphemeralNativeDevice({ manifestDevice, adb: async () => devices }),
      (error) => error.message === 'native_device_selection_invalid' && !error.message.includes(serial),
    );
  }
});

test('rejects raw manifest serial fields and keeps errors and log-safe messages free of the selected serial', () => {
  assert.throws(
    () => assertPrivacySafeNativeDeviceManifest({ ...manifestDevice, serial }),
    /native_device_manifest_serial_forbidden/u,
  );
  const safe = sanitizeNativeDeviceMessage(`adb -s ${serial} exited 1`, serial);
  assert.doesNotMatch(safe, new RegExp(serial, 'u'));
  assert.match(safe, /native_device_command_failed/u);
  const runner = readFileSync('scripts/run-native-sqlite-contracts.mjs', 'utf8');
  assert.match(runner, /resolveEphemeralNativeDevice/u);
  assert.doesNotMatch(runner, /manifest\.device\.serial/u);
  assert.doesNotMatch(runner, /device_path:/u);
});

test('rejects malformed manifests, leases, ADB state, duplicate listings, and malformed live facts', async () => {
  assert.throws(() => assertPrivacySafeNativeDeviceManifest(null), /native_device_manifest_invalid/u);
  assert.throws(() => assertPrivacySafeNativeDeviceManifest({ ...manifestDevice, identity_sha256: 'invalid' }), /native_device_manifest_invalid/u);
  await assert.rejects(resolveEphemeralNativeDevice({ manifestDevice, adb: null }), /native_device_selection_invalid/u);
  await assert.rejects(resolveEphemeralNativeDevice({ manifestDevice, adb: async () => undefined }), /native_device_selection_invalid/u);
  await assert.rejects(resolveEphemeralNativeDevice({ explicitDevice: 'invalid\nserial', manifestDevice, adb: async () => 'device' }), /native_device_selection_invalid/u);
  await assert.rejects(
    resolveEphemeralNativeDevice({
      manifestDevice,
      adb: async () => `List of devices attached\n${serial}\tdevice\n${serial}\tdevice\n`,
    }),
    /native_device_selection_invalid/u,
  );
  await assert.rejects(
    resolveEphemeralNativeDevice({ explicitDevice: serial, manifestDevice, adb: async () => 'offline' }),
    /native_device_selection_invalid/u,
  );
  await assert.rejects(
    resolveEphemeralNativeDevice({
      explicitDevice: serial,
      manifestDevice,
      adb: async (...args) => {
        if (args.at(-1) === 'get-state') return 'device';
        if (args.at(-1) === 'ro.product.cpu.abi') return facts.abi;
        if (args.at(-1) === 'ro.build.version.sdk') return facts.apiLevel;
        return `${facts.model}\n`;
      },
    }),
    /native_device_identity_mismatch/u,
  );
});

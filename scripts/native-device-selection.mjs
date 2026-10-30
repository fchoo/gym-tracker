import { phase18DeviceIdentitySha256 } from './phase18-device-identity.mjs';

const HASH = /^[a-f0-9]{64}$/u;
const SAFE_SERIAL = /^[^\u0000\r\n]{1,512}$/u;

function fail(code) {
  throw new Error(`native_device_${code}`);
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeSerial(value) {
  if (typeof value !== 'string' || !SAFE_SERIAL.test(value)) fail('selection_invalid');
  return value;
}

function onlineDevices(output) {
  if (typeof output !== 'string') fail('selection_invalid');
  const lines = output.split(/\r?\n/u).slice(1);
  const devices = lines.flatMap((line) => {
    const match = /^([^\s]+)\s+device$/u.exec(line.trim());
    return match ? [safeSerial(match[1])] : [];
  });
  if (new Set(devices).size !== devices.length) fail('selection_invalid');
  return devices;
}

export function assertPrivacySafeNativeDeviceManifest(device) {
  if (!object(device)) fail('manifest_invalid');
  if (Object.hasOwn(device, 'serial')) fail('manifest_serial_forbidden');
  if (
    typeof device.identity_sha256 !== 'string'
    || !HASH.test(device.identity_sha256)
    || typeof device.abi !== 'string'
    || !SAFE_SERIAL.test(device.abi)
    || !Number.isSafeInteger(device.api)
    || device.api < 1
    || typeof device.model !== 'string'
    || !SAFE_SERIAL.test(device.model)
  ) fail('manifest_invalid');
  return true;
}

export function sanitizeNativeDeviceMessage(_message, _serial) {
  return 'native_device_command_failed';
}

export async function resolveEphemeralNativeDevice({
  explicitDevice,
  androidSerial,
  manifestDevice,
  adb,
} = {}) {
  if (typeof adb !== 'function') fail('selection_invalid');
  assertPrivacySafeNativeDeviceManifest(manifestDevice);
  const selected = explicitDevice ?? androidSerial;
  let deviceSerial;
  if (selected === undefined) {
    const devices = onlineDevices(await adb('devices'));
    if (devices.length !== 1) fail('selection_invalid');
    [deviceSerial] = devices;
  } else {
    deviceSerial = safeSerial(selected);
  }
  if (await adb('-s', deviceSerial, 'get-state') !== 'device') fail('selection_invalid');
  const [abi, apiLevel, model] = await Promise.all([
    adb('-s', deviceSerial, 'shell', 'getprop', 'ro.product.cpu.abi'),
    adb('-s', deviceSerial, 'shell', 'getprop', 'ro.build.version.sdk'),
    adb('-s', deviceSerial, 'shell', 'getprop', 'ro.product.model'),
  ]);
  let identity;
  try {
    identity = phase18DeviceIdentitySha256({ serial: deviceSerial, abi, apiLevel, model });
  } catch {
    fail('identity_mismatch');
  }
  if (identity !== manifestDevice.identity_sha256) fail('identity_mismatch');
  return deviceSerial;
}

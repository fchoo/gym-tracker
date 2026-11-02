import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectAndroidElf, readArchive, requireCffiBackend, sha256 } from './garmin-android-native.mjs';
import { verifyGarminPythonArtifacts } from './verify-garmin-python-lock.mjs';

const PINNED_BINARIES = new Map([
  ['_cffi_backend.so', '914bbcc8d16ef427ac5675b81d0662028cc8d35141a3f38a5459ee4d85f3e3f1'],
  ['_wrapper.abi3.so', '2327dc2c79b46d04b3457b20535ab5a58fea95179533c2051b3accc705f57166'],
  ['libffi.so', '8829db5d7c7663014a11f61c726aa7e2c22c4eec5d0d19118ba51600079b13f8'],
  ['libc++_shared-d523468d.so', '93f2ccd5df27318cd282ffbf2aad6f02d9787f1015d9a3e3061dee8f9f4440a5'],
]);
const SYSTEM_LIBS = new Set(['libc.so', 'libdl.so', 'libm.so', 'liblog.so', 'libz.so', 'libandroid.so']);

export function verifyNativeEntries(entries, ndk, inspect = inspectAndroidElf) {
  const reports = entries.filter(([name]) => name.endsWith('.so')).map(([name, bytes]) => inspect(bytes, name, ndk));
  const names = reports.map(({ name }) => path.basename(name));
  if (new Set(names).size !== names.length) throw new Error('garmin_android_duplicate_binary');
  for (const [required, hash] of PINNED_BINARIES) {
    if (!names.includes(required)) throw new Error(`garmin_android_required_binary:${required}`);
    if (reports.find(({ name }) => path.basename(name) === required).sha256 !== hash) throw new Error(`garmin_android_binary_hash:${required}`);
  }
  const backend = reports.find(({ name }) => path.basename(name) === '_cffi_backend.so');
  requireCffiBackend(backend);
  for (const report of reports) {
    for (const needed of report.needed) {
      // The embedded Python runtime is provided by Chaquopy, not the requirements wheel set.
      if (!SYSTEM_LIBS.has(needed) && needed !== 'libpython3.13.so' && !names.includes(needed)) {
        throw new Error(`garmin_android_missing_dependency:${report.name}:${needed}`);
      }
    }
  }
  return { valid: true, binaries: reports };
}

export function verifyGarminAndroidWheels(lock, directory, ndk, inspect = inspectAndroidElf, verifyArtifacts = verifyGarminPythonArtifacts) {
  verifyArtifacts(lock, directory);
  const entries = lock.packages.filter(({ name }) => ['cffi', 'curl-cffi', 'chaquopy-libffi'].includes(name))
    .flatMap(({ artifact }) => readArchive(readFileSync(path.join(directory, artifact.filename)))
      .map(([name, bytes]) => [`${artifact.filename}/${name}`, bytes]));
  return verifyNativeEntries(entries, ndk, inspect);
}

export function verifyGarminAndroidApk(apk, ndk, inspect = inspectAndroidElf) {
  const bytes = readFileSync(apk); const outer = readArchive(bytes, 'zip', ['assets/chaquopy/requirements-*.imy', 'lib/arm64-v8a/*.so']);
  const requirements = outer.filter(([name]) => /^assets\/chaquopy\/requirements-(common|arm64-v8a)\.imy$/u.test(name));
  if (requirements.length !== 2) throw new Error('garmin_android_requirements_archives');
  if (outer.some(([name]) => /^assets\/chaquopy\/requirements-(?!common|arm64-v8a).+\.imy$/u.test(name))) throw new Error('garmin_android_wrong_abi');
  const entries = requirements.flatMap(([archive, data]) => readArchive(data).map(([name, binary]) => [`${archive}/${name}`, binary]));
  const result = verifyNativeEntries(entries, ndk, inspect);
  // For an APK, verify the actual runtime, rather than allowing its wheel-time external boundary.
  const libraries = new Map();
  for (const [name, data] of outer.filter(([name]) => name.startsWith('lib/arm64-v8a/'))) {
    const match = /^lib\/arm64-v8a\/(lib[\w.+-]+\.so)$/u.exec(name);
    if (!match) throw new Error(`garmin_android_runtime_path:${name}`);
    if (libraries.has(match[1])) throw new Error('garmin_android_duplicate_binary');
    libraries.set(match[1], [name, data]);
  }
  const runtime = libraries.get('libpython3.13.so');
  if (!runtime) throw new Error('garmin_android_python_runtime');
  const inspected = new Map();
  function inspectRuntime([name, data]) {
    if (inspected.has(name)) return inspected.get(name);
    const report = inspect(data, name, ndk);
    inspected.set(name, report);
    for (const needed of report.needed) {
      const dependency = libraries.get(needed);
      if (dependency) inspectRuntime(dependency);
      else if (!SYSTEM_LIBS.has(needed)) throw new Error(`garmin_android_missing_dependency:${name}:${needed}`);
    }
    return report;
  }
  const python = inspectRuntime(runtime);
  return { ...result, apkSha256: sha256(bytes), python, runtimeBinaries: [...inspected.values()] };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [mode, target, ndk] = process.argv.slice(2);
  if (!target || !ndk || !['--apk', '--artifacts-dir'].includes(mode)) throw new Error('usage: node scripts/verify-garmin-android-binaries.mjs --apk APK NDK | --artifacts-dir DIR NDK');
  const result = mode === '--apk' ? verifyGarminAndroidApk(target, ndk)
    : verifyGarminAndroidWheels(JSON.parse(readFileSync(new URL('../modules/garmin-connect/python/garmin-python-lock.json', import.meta.url))), target, ndk);
  console.log(JSON.stringify(result, null, 2));
}

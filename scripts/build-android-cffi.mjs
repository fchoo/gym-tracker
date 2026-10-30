import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectAndroidElf, ndkBin, readArchive, requireCffiBackend, sha256, writeArchive } from './garmin-android-native.mjs';

export const BUILD_ROOT = fileURLToPath(new URL('../modules/garmin-connect/python/android-cffi/', import.meta.url));
export const BUILD_MANIFEST = path.join(BUILD_ROOT, 'build-inputs.json');

export function treeDigest(root) {
  const entries = [];
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else entries.push(`${path.relative(root, file)}\0${sha256(readFileSync(file))}\n`);
    }
  }
  walk(root); return sha256(Buffer.from(entries.join('')));
}

export function validateToolchain(manifest, ndk) {
  for (const entry of manifest.toolchain.files) {
    if (sha256(readFileSync(path.join(ndk, entry.path))) !== entry.sha256) throw new Error('android_cffi_toolchain_hash');
  }
  for (const entry of manifest.toolchain.trees) {
    if (treeDigest(path.join(ndk, entry.path)) !== entry.sha256) throw new Error('android_cffi_toolchain_tree');
  }
}

export async function fetchBuildInputs(manifest, cache, fetchImpl = fetch) {
  mkdirSync(cache, { recursive: true });
  const inputs = {};
  for (const entry of manifest.inputs) {
    const destination = path.join(cache, entry.filename);
    let bytes;
    try { bytes = readFileSync(destination); } catch { bytes = Buffer.alloc(0); }
    if (sha256(bytes) !== entry.sha256) {
      const response = await fetchImpl(entry.url);
      if (!response.ok) throw new Error('android_cffi_input_download');
      bytes = Buffer.from(await response.arrayBuffer());
      if (sha256(bytes) !== entry.sha256) throw new Error('android_cffi_input_hash');
      writeFileSync(destination, bytes);
    }
    inputs[entry.name] = bytes;
  }
  return inputs;
}

export function extractEntries(entries, root) {
  const names = new Set();
  for (const [name, bytes] of entries) {
    if (!name || name.includes('\\') || name.startsWith('/') || name.split('/').includes('..') || names.has(name)) throw new Error('android_cffi_archive_path');
    names.add(name); const destination = path.join(root, name);
    mkdirSync(path.dirname(destination), { recursive: true }); writeFileSync(destination, bytes);
  }
}

export function buildCffiWheel(inputs, ndk, work, run = execFileSync) {
  mkdirSync(work); // Refuse existing work directories, including symlinked paths.
  const sourceEntries = readArchive(inputs.cffi, 'tar');
  const pythonEntries = readArchive(inputs.python).filter(([name]) => name.startsWith('include/python3.13/') || name === 'jniLibs/arm64-v8a/libpython3.13.so');
  extractEntries(sourceEntries, work); extractEntries(pythonEntries, path.join(work, 'python'));
  extractEntries(readArchive(inputs.libffi), path.join(work, 'ffi'));
  const backend = path.join(work, '_cffi_backend.so');
  const flags = ['--target=aarch64-linux-android24', '-shared', '-fPIC', '-O2', '-DFFI_BUILDING=1', '-DUSE__THREAD', '-DHAVE_SYNC_SYNCHRONIZE', '-D__BIONIC_NO_PAGE_SIZE_MACRO',
    `-ffile-prefix-map=${work}=.`, `-fdebug-prefix-map=${work}=.`,
    `-I${work}/python/include/python3.13`, `-I${work}/ffi/chaquopy/include`,
    '-Wl,--no-undefined', '-Wl,--no-rosegment', '-Wl,-z,max-page-size=16384', '-Wl,--build-id=sha1',
    `-L${work}/python/jniLibs/arm64-v8a`, `-L${work}/ffi/chaquopy/lib`,
    `${work}/cffi-2.1.1/src/c/_cffi_backend.c`, '-lffi', '-lpython3.13', '-ldl', '-lm', '-o', backend];
  run(path.join(ndkBin(ndk), 'clang'), flags, { stdio: 'pipe', env: { PATH: process.env.PATH, LC_ALL: 'C', SOURCE_DATE_EPOCH: '0' } });
  run(path.join(ndkBin(ndk), 'llvm-strip'), ['--strip-unneeded', backend]);
  const binary = readFileSync(backend);
  const report = inspectAndroidElf(binary, '_cffi_backend.so', ndk, run); requireCffiBackend(report);
  const dist = 'cffi-2.1.1.dist-info';
  const entries = sourceEntries.filter(([name]) => /^cffi-2\.1\.1\/src\/cffi\/[^/]+\.(py|h)$/u.test(name))
    .map(([name, bytes]) => [name.replace('cffi-2.1.1/src/', ''), bytes]);
  // As in Chaquopy's build-wheel, declare the shared-library provider. Preserve upstream metadata otherwise.
  const metadata = readFileSync(path.join(work, 'cffi-2.1.1/PKG-INFO'), 'utf8').replace('\n\n', '\nRequires-Dist: chaquopy-libffi==3.3\n\n');
  entries.push(['_cffi_backend.so', binary], [`${dist}/METADATA`, Buffer.from(metadata)],
    [`${dist}/licenses/LICENSE`, readFileSync(path.join(work, 'cffi-2.1.1/LICENSE'))],
    [`${dist}/WHEEL`, Buffer.from('Wheel-Version: 1.0\nGenerator: gym-tracker-android-cffi\nRoot-Is-Purelib: false\nTag: cp313-cp313-android_24_arm64_v8a\n')],
    [`${dist}/top_level.txt`, Buffer.from('_cffi_backend\ncffi\n')]);
  entries.sort(([a], [b]) => a.localeCompare(b, 'en'));
  const record = entries.map(([name, bytes]) => `${name},sha256=${createHash('sha256').update(bytes).digest('base64url')},${bytes.length}\n`).join('');
  entries.push([`${dist}/RECORD`, Buffer.from(`${record}${dist}/RECORD,,\n`)]);
  return { bytes: writeArchive(entries), report, flags };
}

export async function buildAndroidCffi({ ndk, cache, work, output, manifestPath = BUILD_MANIFEST, run = execFileSync, fetchImpl = fetch }) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  validateToolchain(manifest, ndk);
  const inputs = await fetchBuildInputs(manifest, cache, fetchImpl);
  const built = buildCffiWheel(inputs, ndk, work, run);
  if (sha256(built.bytes) !== manifest.output.sha256) throw new Error('android_cffi_output_hash');
  mkdirSync(output); writeFileSync(path.join(output, manifest.output.filename), built.bytes);
  const receipt = { schemaVersion: 1, manifestSha256: sha256(readFileSync(manifestPath)), output: manifest.output, native: built.report, flags: built.flags };
  writeFileSync(path.join(output, 'build-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`); return receipt;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [ndk, cache, work, output] = process.argv.slice(2);
  if (!ndk || !cache || !work || !output) throw new Error('usage: node scripts/build-android-cffi.mjs NDK CACHE NEW_WORK OUTPUT');
  console.log(JSON.stringify(await buildAndroidCffi({ ndk, cache, work, output }), null, 2));
}

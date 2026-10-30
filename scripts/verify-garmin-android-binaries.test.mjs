import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { verifyNativeEntries, verifyGarminAndroidWheels, verifyGarminAndroidApk } from './verify-garmin-android-binaries.mjs';
import { inspectAndroidElf, writeArchive } from './garmin-android-native.mjs';
import { elfFixture, elfReport, nativePins, mockInspect } from './garmin-android-test-fixtures.mjs';
const validEntries=()=>Object.keys(nativePins).map(name=>[name,elfFixture()]);

function runtimeFixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'garmin-runtime-closure-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const apk = path.join(directory, 'fixture.apk');
  return { apk, put(entries) {
    writeFileSync(apk, writeArchive([
      ['assets/chaquopy/requirements-common.imy', writeArchive([])],
      ['assets/chaquopy/requirements-arm64-v8a.imy', writeArchive(validEntries())],
      ...entries,
    ]));
  } };
}

test('rejects the retained APK defect: only a Darwin CFFI backend', () => {
  assert.throws(() => verifyNativeEntries([['_cffi_backend.cpython-313-darwin.so', Buffer.from('Mach-O')]], '/ndk'), /elf_header/);
});
test('requires unique digest-bound CFFI, curl wrapper, libffi and C++ dependency binaries', () => {
  assert.throws(() => verifyNativeEntries([], '/ndk'), /required_binary/);
  const entries=validEntries();assert.equal(verifyNativeEntries([...entries,['ignored.py',Buffer.alloc(0)]],'/ndk',mockInspect).valid,true);
  for(let i=0;i<entries.length;i++)assert.throws(()=>verifyNativeEntries(entries.filter((_,j)=>j!==i),'/ndk',mockInspect),/required_binary/);
  assert.throws(()=>verifyNativeEntries([...entries,entries[0]],'/ndk',mockInspect),/duplicate_binary/);
  assert.throws(()=>verifyNativeEntries(entries,'/ndk',(b,n)=>({...mockInspect(b,n),sha256:'wrong'})),/binary_hash/);
  assert.throws(()=>verifyNativeEntries(entries,'/ndk',(b,n)=>({...mockInspect(b,n),exports:[]})),/cffi_binding/);
  assert.throws(()=>verifyNativeEntries(entries,'/ndk',(b,n)=>({...mockInspect(b,n),needed:[...mockInspect(b,n).needed,'libmissing.so']})),/missing_dependency/);
  assert(verifyNativeEntries([...entries,['extra.so',elfFixture()]],'/ndk',(b,n)=>({...mockInspect(b,n),needed:[...mockInspect(b,n).needed,'libffi.so']})).valid);
});
test('checks the complete local wheelset, not just filenames', () => {
  const d=mkdtempSync(path.join(tmpdir(),'garmin-wheel-test-'));
  try {
    const packages=['cffi','curl-cffi','chaquopy-libffi'].map((name,i)=>({name,artifact:{filename:i+'.whl'}}));
    const groups=[validEntries().slice(0,1),validEntries().slice(1,2).concat(validEntries().slice(3)),validEntries().slice(2,3)];
    for(let i=0;i<3;i++)writeFileSync(path.join(d,i+'.whl'),writeArchive(groups[i]));
    let verified=false;const result=verifyGarminAndroidWheels({packages:[...packages,{name:'ignored'}]},d,'/ndk',mockInspect,()=>{verified=true;});assert(result.valid);assert(verified);
  }finally{rmSync(d,{recursive:true,force:true});}
});
test('checks both APK requirements archives and actual ARM64 embedded Python', () => {
  const d=mkdtempSync(path.join(tmpdir(),'garmin-apk-test-'));
  const common=['assets/chaquopy/requirements-common.imy',writeArchive([['ignored.py',Buffer.from('Python')]])];
  const arm64=['assets/chaquopy/requirements-arm64-v8a.imy',writeArchive(validEntries())];
  const runtime=['lib/arm64-v8a/libpython3.13.so',elfFixture()];const apk=path.join(d,'fixture.apk');
  function put(entries){writeFileSync(apk,writeArchive(entries));}
  try {
    put([common]);assert.throws(()=>verifyGarminAndroidApk(apk,'/ndk',mockInspect),/requirements_archives/);
    put([common,arm64,['assets/chaquopy/requirements-x86_64.imy',writeArchive([])]]);assert.throws(()=>verifyGarminAndroidApk(apk,'/ndk',mockInspect),/wrong_abi/);
    put([common,arm64]);assert.throws(()=>verifyGarminAndroidApk(apk,'/ndk',mockInspect),/python_runtime/);
    put([common,arm64,runtime]);const result=verifyGarminAndroidApk(apk,'/ndk',mockInspect);assert(result.valid);assert.equal(result.python.name,runtime[0]);
    put([common,['assets/chaquopy/requirements-arm64-v8a.imy',writeArchive(validEntries().slice(1))],runtime]);assert.throws(()=>verifyGarminAndroidApk(apk,'/ndk',mockInspect),/required_binary/);
  }finally{rmSync(d,{recursive:true,force:true});}
});
test('checker CLI requires an explicit target and NDK without any device access', () => {
  for(const args of [[],['--apk'],['--apk','file'],['--wrong','file','ndk']])assert.throws(()=>execFileSync(process.execPath,['scripts/verify-garmin-android-binaries.mjs',...args],{stdio:'pipe'}),/usage:/);
  assert.throws(()=>execFileSync(process.execPath,['scripts/verify-garmin-android-binaries.mjs','--apk','missing.apk','ndk'],{stdio:'pipe'}),/ENOENT/);
  assert.throws(()=>execFileSync(process.execPath,['scripts/verify-garmin-android-binaries.mjs','--artifacts-dir','missing','ndk'],{stdio:'pipe'}),/artifacts_missing/);
});

test('rejects a Python runtime dependency absent from the actual APK ARM64 libraries', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'garmin-runtime-closure-'));
  const apk = path.join(directory, 'fixture.apk');
  try {
    writeFileSync(apk, writeArchive([
      ['assets/chaquopy/requirements-common.imy', writeArchive([])],
      ['assets/chaquopy/requirements-arm64-v8a.imy', writeArchive(validEntries())],
      ['lib/arm64-v8a/libpython3.13.so', elfFixture()],
    ]));
    assert.throws(() => verifyGarminAndroidApk(apk, '/ndk', (bytes, name) => ({
      ...mockInspect(bytes, name),
      needed: name === 'lib/arm64-v8a/libpython3.13.so' ? ['libmissing.so'] : mockInspect(bytes, name).needed,
    })), /missing_dependency:lib\/arm64-v8a\/libpython3\.13\.so:libmissing\.so/u);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('recursively inspects actual ARM64 runtime dependencies once, including cycles and system names', t => {
  const { apk, put } = runtimeFixture(t);
  const names = ['libpython3.13.so', 'libcrypto_python.so', 'libssl_python.so', 'libc.so'];
  put([...names.map(name => [`lib/arm64-v8a/${name}`, elfFixture()]), ['lib/arm64-v8a/libunused.so', Buffer.from('Mach-O')]]);
  const dependencies = {
    'libpython3.13.so': ['libssl_python.so', 'libcrypto_python.so', 'libc.so', 'libdl.so', 'libm.so', 'liblog.so', 'libz.so', 'libandroid.so'],
    'libssl_python.so': ['libcrypto_python.so'], 'libcrypto_python.so': ['libpython3.13.so'], 'libc.so': [],
  };
  const inspected = [];
  const result = verifyGarminAndroidApk(apk, '/ndk', (bytes, name) => {
    if (!name.startsWith('lib/')) return mockInspect(bytes, name);
    inspected.push(path.basename(name));
    return { ...mockInspect(bytes, name), needed: dependencies[path.basename(name)] };
  });
  assert(result.valid);
  assert.deepEqual(new Set(inspected), new Set(names));
  assert.equal(inspected.length, names.length);
  assert.equal(result.runtimeBinaries.length, names.length);
});

test('does not resolve Python dependencies from requirements, another ABI, or an unapproved system name', t => {
  const { apk, put } = runtimeFixture(t);
  const runtime = ['lib/arm64-v8a/libpython3.13.so', elfFixture()];
  put([runtime, ['lib/x86_64/libmissing.so', elfFixture()]]);
  for (const needed of ['libmissing.so', 'libffi.so', 'libOpenSLES.so', 'libc.so.6', '../libc.so']) {
    assert.throws(() => verifyGarminAndroidApk(apk, '/ndk', (bytes, name) => ({
      ...mockInspect(bytes, name), needed: name === runtime[0] ? [needed] : mockInspect(bytes, name).needed,
    })), /missing_dependency/u);
  }
  put([runtime, ['lib/arm64-v8a/libssl_python.so', elfFixture()]]);
  assert.throws(() => verifyGarminAndroidApk(apk, '/ndk', (bytes, name) => ({
    ...mockInspect(bytes, name), needed: name === runtime[0] ? ['libssl_python.so']
      : name === 'lib/arm64-v8a/libssl_python.so' ? ['libcrypto_python.so'] : mockInspect(bytes, name).needed,
  })), /missing_dependency:lib\/arm64-v8a\/libssl_python\.so:libcrypto_python\.so/u);
});

test('rejects ambiguous or non-flat runtime archive members before dependency lookup', t => {
  const { apk, put } = runtimeFixture(t);
  const runtime = ['lib/arm64-v8a/libpython3.13.so', elfFixture()];
  put([runtime, runtime]);
  assert.throws(() => verifyGarminAndroidApk(apk, '/ndk', mockInspect), /duplicate_binary/u);
  for (const name of ['lib/arm64-v8a/nested/libmissing.so', 'lib/arm64-v8a/../libmissing.so', 'lib/arm64-v8a/invalid.so']) {
    put([runtime, [name, elfFixture()]]);
    assert.throws(() => verifyGarminAndroidApk(apk, '/ndk', mockInspect), /runtime_path/u);
  }
});

test('retains ELF platform, ABI, API, alignment and dynamic guards for every reachable runtime library', t => {
  const { apk, put } = runtimeFixture(t);
  const runtime = ['lib/arm64-v8a/libpython3.13.so', elfFixture()];
  const name = 'lib/arm64-v8a/libcrypto_python.so';
  const report = elfReport.replace(/.*\(NEEDED\).*\n/gu, '') + ' 0x1 (NEEDED) Shared library: [libc.so]\n';
  const wrongAbi = elfFixture(); wrongAbi.writeUInt16LE(62, 18);
  for (const [bytes, readelf, error] of [
    [Buffer.from('Mach-O'), report, /elf_header/u], [wrongAbi, report, /elf_header/u],
    [elfFixture(), report.replace('18 00 00 00', '19 00 00 00'), /elf_api/u],
    [elfFixture(), report.replace('0x4000', '0x1000'), /elf_alignment/u],
    [elfFixture(), report + '(TEXTREL)\n', /elf_dynamic/u],
    [elfFixture(), report + '(RUNPATH) Library runpath: [/host]\n', /elf_dynamic/u],
    [elfFixture(), report.replace('[libc.so]', '[libc.so.6]'), /elf_dynamic/u],
  ]) {
    put([runtime, [name, bytes]]);
    assert.throws(() => verifyGarminAndroidApk(apk, '/ndk', (data, entry) => entry === name
      ? inspectAndroidElf(data, entry, '/ndk', () => readelf)
      : { ...mockInspect(data, entry), needed: entry === runtime[0] ? ['libcrypto_python.so'] : mockInspect(data, entry).needed }), error);
  }
});

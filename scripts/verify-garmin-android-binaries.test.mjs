import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { verifyNativeEntries, verifyGarminAndroidWheels, verifyGarminAndroidApk } from './verify-garmin-android-binaries.mjs';
import { writeArchive } from './garmin-android-native.mjs';
import { elfFixture, nativePins, mockInspect } from './garmin-android-test-fixtures.mjs';
const validEntries=()=>Object.keys(nativePins).map(name=>[name,elfFixture()]);

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

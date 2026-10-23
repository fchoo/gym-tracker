import assert from 'node:assert/strict';
import test from 'node:test';
import { readArchive, writeArchive, inspectAndroidElf, requireCffiBackend, sha256, ndkBin } from './garmin-android-native.mjs';
import { elfFixture, elfReport, buildInputs } from './garmin-android-test-fixtures.mjs';

test('round-trips deterministic stored ZIPs, filters APK members, and reads locked tar sources', () => {
  const entries = [['hello.txt', Buffer.from('hello')], ['empty', Buffer.alloc(0)]];
  const a = writeArchive(entries), b = writeArchive(entries);
  assert.deepEqual(a, b); assert.deepEqual(readArchive(a), entries);
  assert.deepEqual(readArchive(a, 'zip', ['hello.*']), entries.slice(0,1));
  assert(readArchive(buildInputs().cffi,'tar').some(([name])=>name.endsWith('/LICENSE')));
  assert.equal(sha256(Buffer.from('hello')), '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  assert.throws(() => readArchive(Buffer.from('bad')));
  assert.match(ndkBin('/ndk','linux'),/linux-x86_64/);assert.match(ndkBin('/ndk','darwin'),/darwin-x86_64/);assert(ndkBin('/ndk').endsWith('/bin'));
});
test('rejects every host, wrong-machine, wrong-class and non-shared ELF before tool invocation', () => {
  assert.throws(() => inspectAndroidElf(Buffer.from('Mach-O ARM64'), 'backend.so', '/ndk'), /elf_header/);
  for(const [offset,value] of [[0,0],[4,1],[5,2],[16,2],[18,62]]){const bytes=elfFixture();bytes[offset]=value;assert.throws(()=>inspectAndroidElf(bytes,'backend.so','/ndk'),/elf_header/);}
});
test('accepts AArch64 Android shared objects and reports dependencies and init export', () => {
  const result = inspectAndroidElf(elfFixture(), 'backend.so', '/ndk', () => elfReport);
  assert.deepEqual(result.needed, ['libffi.so', 'libpython3.13.so', 'libc.so']);
  assert.deepEqual(result.exports, ['PyInit__cffi_backend']); assert.equal(result.minLoadAlignment, 16384);
  requireCffiBackend(result);
  for(const changed of [{...result,exports:[]},{...result,needed:['libpython3.13.so']},{...result,needed:['libffi.so']}])assert.throws(()=>requireCffiBackend(changed),/cffi_binding/);
});
test('requires Android API <=24, 16KB ELF alignment, Android SONAMEs and reviewed relative runpaths', () => {
  for(const report of [elfReport.replace('Android','Other'),elfReport.replace('18 00 00 00','19 00 00 00')])assert.throws(()=>inspectAndroidElf(elfFixture(),'binary.so','/ndk',()=>report),/elf_api/);
  for(const report of [elfReport.replace(/.*LOAD.*\n/u,''),elfReport.replace('0x4000','0x1000')])assert.throws(()=>inspectAndroidElf(elfFixture(),'binary.so','/ndk',()=>report),/elf_alignment/);
  for(const report of [elfReport+'(TEXTREL)\n',elfReport.replace('[libc.so]','[libc.so.6]'),elfReport+'(RUNPATH) Library runpath: [/host]\n'])assert.throws(()=>inspectAndroidElf(elfFixture(),'binary.so','/ndk',()=>report),/elf_dynamic/);
  const curl=elfReport+'(RUNPATH) Library runpath: [${ORIGIN}/../curl_cffi.libs]\n';
  inspectAndroidElf(elfFixture(),'curl_cffi/_wrapper.abi3.so','/ndk',()=>curl);
  assert.throws(()=>inspectAndroidElf(elfFixture(),'other.so','/ndk',()=>curl),/elf_dynamic/);
  assert.throws(()=>inspectAndroidElf(elfFixture(),'_wrapper.abi3.so','/ndk',()=>curl+curl),/elf_dynamic/);
  assert.throws(()=>inspectAndroidElf(elfFixture(),'_wrapper.abi3.so','/ndk',()=>elfReport+'(RPATH) Library rpath: [/host]\n'),/elf_dynamic/);
  assert.throws(()=>inspectAndroidElf(elfFixture(),'binary.so','/ndk',()=>{throw new Error('tool failed');}),/tool failed/);
});

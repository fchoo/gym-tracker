import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { writeArchive } from './garmin-android-native.mjs';

export function elfFixture() {
  const bytes = Buffer.alloc(64); bytes.write('\x7fELF', 0, 'binary');
  bytes[4] = 2; bytes[5] = 1; bytes.writeUInt16LE(3, 16); bytes.writeUInt16LE(183, 18);
  return bytes;
}
export const elfReport = `Class: ELF64\nMachine: AArch64\n  LOAD 0x000000 0x0000000000000000 0x0000000000000000 0x100 0x100 R E 0x4000\n 0x1 (NEEDED) Shared library: [libffi.so]\n 0x1 (NEEDED) Shared library: [libpython3.13.so]\n 0x1 (NEEDED) Shared library: [libc.so]\n 1: 0000000000001000 24 FUNC GLOBAL DEFAULT 12 PyInit__cffi_backend\n Android 0x84 NT_ANDROID_TYPE_IDENT\n description data: 18 00 00 00\n`;
export const nativePins = {
  '_cffi_backend.so': '914bbcc8d16ef427ac5675b81d0662028cc8d35141a3f38a5459ee4d85f3e3f1',
  '_wrapper.abi3.so': '2327dc2c79b46d04b3457b20535ab5a58fea95179533c2051b3accc705f57166',
  'libffi.so': '8829db5d7c7663014a11f61c726aa7e2c22c4eec5d0d19118ba51600079b13f8',
  'libc++_shared-d523468d.so': '93f2ccd5df27318cd282ffbf2aad6f02d9787f1015d9a3e3061dee8f9f4440a5',
};
export function mockInspect(bytes, name) {
  const base = path.basename(name);
  return { name, sha256: nativePins[base], needed: base === '_cffi_backend.so' ? ['libffi.so', 'libpython3.13.so', 'libc.so'] : ['libc.so'], exports: base === '_cffi_backend.so' ? ['PyInit__cffi_backend'] : [], minLoadAlignment: 16384 };
}
export function buildInputs() {
  const files = {
    'cffi-2.1.1/PKG-INFO': 'Metadata-Version: 2.4\nName: cffi\nVersion: 2.1.1\nRequires-Dist: pycparser\n\nbody\n',
    'cffi-2.1.1/LICENSE': 'licence', 'cffi-2.1.1/src/cffi/__init__.py': '__version__ = "2.1.1"',
    'cffi-2.1.1/src/cffi/_embedding.h': 'header', 'cffi-2.1.1/src/cffi/ignored.txt': 'excluded',
    'cffi-2.1.1/src/c/_cffi_backend.c': 'locked source',
  };
  const cffi = execFileSync('python3', ['-c', `import io,json,tarfile,sys
out=io.BytesIO()
with tarfile.open(fileobj=out,mode='w:gz') as t:
 for name,data in json.load(sys.stdin).items():
  b=data.encode(); i=tarfile.TarInfo(name); i.size=len(b); i.mtime=0; t.addfile(i,io.BytesIO(b))
sys.stdout.buffer.write(out.getvalue())`], { input: JSON.stringify(files) });
  return { cffi, python: writeArchive([['include/python3.13/Python.h', Buffer.from('python header')], ['jniLibs/arm64-v8a/libpython3.13.so', elfFixture()], ['ignored', Buffer.alloc(0)]]), libffi: writeArchive([['chaquopy/include/ffi.h', Buffer.from('ffi header')]]) };
}
export function mockCompiler(tool, args) {
  if (tool.endsWith('/clang')) writeFileSync(args.at(-1), elfFixture());
  if (tool.endsWith('/llvm-readelf')) return elfReport;
  return '';
}

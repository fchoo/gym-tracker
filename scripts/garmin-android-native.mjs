import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const NDK_VERSION = '27.1.12297006';
export function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

// Archive I/O uses only the Python standard library. No host build backend is run.
export function readArchive(bytes, kind = 'zip', patterns = ['*']) {
  const script = kind === 'zip'
    ? 'import io,zipfile,json,base64,sys,fnmatch; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); print(json.dumps([[i.filename,base64.b64encode(z.read(i)).decode()] for i in z.infolist() if not i.is_dir() and any(fnmatch.fnmatch(i.filename,p) for p in json.loads(sys.argv[1]))]))'
    : 'import io,tarfile,json,base64,sys; z=tarfile.open(fileobj=io.BytesIO(sys.stdin.buffer.read())); print(json.dumps([[i.name,base64.b64encode(z.extractfile(i).read()).decode()] for i in z.getmembers() if i.isfile()]))';
  return JSON.parse(execFileSync('python3', ['-c', script, JSON.stringify(patterns)], { input: bytes, maxBuffer: 128 * 1024 * 1024 }))
    .map(([name, data]) => [name, Buffer.from(data, 'base64')]);
}

export function writeArchive(entries) {
  return execFileSync('python3', ['-c', `import io,zipfile,json,base64,sys
out=io.BytesIO()
with zipfile.ZipFile(out,'w',compression=zipfile.ZIP_STORED) as z:
 for name,data in json.load(sys.stdin):
  info=zipfile.ZipInfo(name,(1980,1,1,0,0,0)); info.create_system=3; info.external_attr=0o100644<<16
  z.writestr(info,base64.b64decode(data))
sys.stdout.buffer.write(out.getvalue())`], {
    input: JSON.stringify(entries.map(([name, bytes]) => [name, bytes.toString('base64')])),
    maxBuffer: 128 * 1024 * 1024,
  });
}

export function ndkBin(ndk, platform = process.platform) {
  return path.join(ndk, `toolchains/llvm/prebuilt/${platform === 'darwin' ? 'darwin' : 'linux'}-x86_64/bin`);
}

export function inspectAndroidElf(bytes, name, ndk, run = execFileSync) {
  if (bytes.length < 64 || bytes.subarray(0, 4).toString('hex') !== '7f454c46'
      || bytes[4] !== 2 || bytes[5] !== 1 || bytes.readUInt16LE(16) !== 3 || bytes.readUInt16LE(18) !== 183) {
    throw new Error(`garmin_android_elf_header:${name}`);
  }
  const directory = mkdtempSync(path.join(tmpdir(), 'garmin-elf-'));
  let report;
  try {
    const file = path.join(directory, 'binary.so'); writeFileSync(file, bytes);
    report = run(path.join(ndkBin(ndk), 'llvm-readelf'), ['-h', '-d', '-l', '--dyn-syms', '--notes', file], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  } finally { rmSync(directory, { recursive: true, force: true }); }
  const androidNote = /Android\s+[^\n]+\n\s+description data: ((?:[a-f0-9]{2} ){3}[a-f0-9]{2})/u.exec(report);
  const api = androidNote === null ? 0 : Buffer.from(androidNote[1].replaceAll(' ', ''), 'hex').readUInt32LE();
  if (api < 1 || api > 24) throw new Error(`garmin_android_elf_api:${name}`);
  const needed = [...report.matchAll(/\(NEEDED\).*?\[([^\]]+)\]/gu)].map((match) => match[1]);
  const exports = [...report.matchAll(/^.*\bGLOBAL\b.*\bDEFAULT\s+(?!UND\b)\S+\s+(PyInit_\w+)$/gmu)].map((match) => match[1]);
  const alignments = [...report.matchAll(/^\s*LOAD\s+.*\s(0x[0-9a-f]+)\s*$/gmu)].map((match) => Number(match[1]));
  if (alignments.length === 0 || alignments.some((alignment) => alignment < 16384)) throw new Error(`garmin_android_elf_alignment:${name}`);
  const paths = [...report.matchAll(/\((?:RPATH|RUNPATH)\).*?\[([^\]]+)\]/gu)].map((match) => match[1]);
  const approvedCurlPath = path.basename(name) === '_wrapper.abi3.so' && paths.length === 1 && paths[0] === '${ORIGIN}/../curl_cffi.libs';
  if (/\(TEXTREL\)/u.test(report) || (paths.length > 0 && !approvedCurlPath) || needed.some((lib) => !/^lib[\w.+-]+\.so$/u.test(lib))) {
    throw new Error(`garmin_android_elf_dynamic:${name}`);
  }
  return { name, sha256: sha256(bytes), elfClass: 'ELF64', machine: 'AArch64', androidApi: api, needed, exports, minLoadAlignment: Math.min(...alignments) };
}

export function requireCffiBackend(report) {
  if (!report.exports.includes('PyInit__cffi_backend') || !report.needed.includes('libffi.so')
      || !report.needed.includes('libpython3.13.so')) throw new Error('garmin_android_cffi_binding');
}

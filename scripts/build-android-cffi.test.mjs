import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { treeDigest, validateToolchain, fetchBuildInputs, extractEntries, buildCffiWheel, buildAndroidCffi } from './build-android-cffi.mjs';
import { readArchive, sha256 } from './garmin-android-native.mjs';
import { buildInputs, mockCompiler } from './garmin-android-test-fixtures.mjs';

function temporary() { return mkdtempSync(path.join(tmpdir(), 'android-cffi-test-')); }

test('hashes toolchain files and recursive trees, including symlink target bytes', () => {
  const d = temporary();
  try {
    mkdirSync(path.join(d,'tree')); mkdirSync(path.join(d,'tree/nested')); writeFileSync(path.join(d,'tree/a'),'a'); writeFileSync(path.join(d,'tree/nested/b'),'b'); symlinkSync('a',path.join(d,'tree/link'));
    writeFileSync(path.join(d,'tool'),'compiler');
    const manifest={toolchain:{files:[{path:'tool',sha256:sha256(Buffer.from('compiler'))}],trees:[{path:'tree',sha256:treeDigest(path.join(d,'tree'))}]}};
    validateToolchain(manifest,d);
    writeFileSync(path.join(d,'tool'),'changed'); assert.throws(()=>validateToolchain(manifest,d),/toolchain_hash/);
    writeFileSync(path.join(d,'tool'),'compiler');writeFileSync(path.join(d,'tree/a'),'changed');assert.throws(()=>validateToolchain(manifest,d),/toolchain_tree/);
  }finally{rmSync(d,{recursive:true,force:true});}
});

test('reuses verified cross-build inputs and repairs bad cache bytes only from matching origins', async () => {
  const d=temporary();const good=Buffer.from('source');const manifest={inputs:[{name:'cffi',filename:'source.tar.gz',sha256:sha256(good),url:'https://official/source'}]};
  try {
    const calls=[];const fetcher=async url=>{calls.push(url);return {ok:true,arrayBuffer:async()=>good};};
    assert.deepEqual(await fetchBuildInputs(manifest,d,fetcher),{cffi:good});
    assert.deepEqual(await fetchBuildInputs(manifest,d,()=>assert.fail('must reuse valid cache')),{cffi:good});
    writeFileSync(path.join(d,'source.tar.gz'),'corrupt');await assert.rejects(fetchBuildInputs(manifest,d,async()=>({ok:false})),/input_download/);
    await assert.rejects(fetchBuildInputs(manifest,d,async()=>({ok:true,arrayBuffer:async()=>Buffer.from('wrong')})),/input_hash/);
    await fetchBuildInputs(manifest,d,fetcher);assert.deepEqual(calls,['https://official/source','https://official/source']);
  }finally{rmSync(d,{recursive:true,force:true});}
});

test('rejects archive traversal and duplicates before extracting input files', () => {
  const d=temporary();try {
    for(const name of ['', '/absolute', '../escape', 'a/../escape', 'a\\b']) assert.throws(()=>extractEntries([[name,Buffer.from('x')]],d),/archive_path/);
    assert.throws(()=>extractEntries([['same',Buffer.from('a')],['same',Buffer.from('b')]],d),/archive_path/);
    extractEntries([['nested/file',Buffer.from('good')]],d);assert.equal(readFileSync(path.join(d,'nested/file'),'utf8'),'good');
  }finally{rmSync(d,{recursive:true,force:true});}
});

test('cross-builds deterministic wheel contents with declared Android libffi, metadata and RECORD', () => {
  const d=temporary();try {
    const inputs=buildInputs();const a=buildCffiWheel(inputs,'/ndk',path.join(d,'a'),mockCompiler),b=buildCffiWheel(inputs,'/ndk',path.join(d,'b'),mockCompiler);
    assert.deepEqual(a.bytes,b.bytes);assert(a.flags.includes('--target=aarch64-linux-android24'));assert(a.flags.includes('-Wl,--no-undefined'));
    const files=new Map(readArchive(a.bytes));assert.match(files.get('cffi-2.1.1.dist-info/METADATA').toString(),/Requires-Dist: chaquopy-libffi==3.3/);assert(files.has('cffi/_embedding.h'));assert(!files.has('cffi/ignored.txt'));assert(files.has('cffi-2.1.1.dist-info/licenses/LICENSE'));
    const record=files.get('cffi-2.1.1.dist-info/RECORD').toString();for(const [name,bytes] of files)if(!name.endsWith('/RECORD'))assert(record.includes(`${name},sha256=${Buffer.from(sha256(bytes),'hex').toString('base64url')},${bytes.length}\n`));
    assert.throws(()=>buildCffiWheel(inputs,'/ndk',path.join(d,'a'),mockCompiler),/EEXIST/);
    assert.throws(()=>buildCffiWheel(inputs,'/ndk',path.join(d,'compiler-fail'),()=>{throw new Error('compiler failure');}),/compiler failure/);
  }finally{rmSync(d,{recursive:true,force:true});}
});

test('seals a digest-matched wheel and preserves failed output hashes without publishing', async () => {
  const d=temporary();try {
    const inputs=buildInputs();const built=buildCffiWheel(inputs,'/ndk',path.join(d,'expected'),mockCompiler);
    const manifest={schemaVersion:1,toolchain:{files:[],trees:[]},inputs:Object.entries(inputs).map(([name,bytes])=>({name,filename:name+'.input',sha256:sha256(bytes),url:'https://official/'+name})),output:{filename:'cffi.whl',sha256:sha256(built.bytes)}};
    const manifestPath=path.join(d,'manifest.json');writeFileSync(manifestPath,JSON.stringify(manifest));
    const args={ndk:'/ndk',cache:path.join(d,'cache'),work:path.join(d,'work'),output:path.join(d,'output'),manifestPath,run:mockCompiler,fetchImpl:async url=>({ok:true,arrayBuffer:async()=>inputs[url.split('/').at(-1)]})};
    const receipt=await buildAndroidCffi(args);assert.equal(receipt.output.sha256,sha256(readFileSync(path.join(args.output,'cffi.whl'))));assert.equal(JSON.parse(readFileSync(path.join(args.output,'build-receipt.json'))).manifestSha256,sha256(readFileSync(manifestPath)));
    manifest.output.sha256='0'.repeat(64);writeFileSync(manifestPath,JSON.stringify(manifest));await assert.rejects(buildAndroidCffi({...args,work:path.join(d,'bad-work'),output:path.join(d,'bad-output')}),/output_hash/);assert.throws(()=>readFileSync(path.join(d,'bad-output/cffi.whl')),/ENOENT/);
  }finally{rmSync(d,{recursive:true,force:true});}
});

test('build CLI requires explicit pinned toolchain, cache, new work and output paths', () => {
  assert.throws(()=>execFileSync(process.execPath,['scripts/build-android-cffi.mjs'],{stdio:'pipe'}),/usage:/);
  assert.throws(()=>execFileSync(process.execPath,['scripts/build-android-cffi.mjs','missing'],{stdio:'pipe'}),/usage:/);
  assert.throws(()=>execFileSync(process.execPath,['scripts/build-android-cffi.mjs','missing','cache','work','output'],{stdio:'pipe'}),/ENOENT/);
});

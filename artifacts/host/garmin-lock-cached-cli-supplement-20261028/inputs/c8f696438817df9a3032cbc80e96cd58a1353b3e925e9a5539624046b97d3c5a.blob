import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {copyFileSync,mkdirSync,mkdtempSync,readFileSync,realpathSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const pinnedInputs=[
  'modules/garmin-connect/python/garmin-python-artifacts/python-garminconnect-218e72ca5459e014435fc2d94fd18bd601fa0c14.tar.gz',
  'modules/garmin-connect/python/garmin-python-artifacts/curl_cffi-0.15.0-cp313-abi3-android_24_arm64_v8a.whl',
  'modules/garmin-connect/python/garmin-python-artifacts/requests-2.34.2-py3-none-any.whl',
  'modules/garmin-connect/python/garmin-python-artifacts/ua_generator-2.1.6-py3-none-any.whl',
  'modules/garmin-connect/python/garmin-python-artifacts/certifi-2026.7.22-py3-none-any.whl',
  'modules/garmin-connect/python/garmin-python-artifacts/cffi-2.1.1-cp313-cp313-android_24_arm64_v8a.whl',
  'modules/garmin-connect/python/garmin-python-artifacts/chaquopy_libffi-3.3-3-py3-none-android_24_arm64_v8a.whl',
  'modules/garmin-connect/python/garmin-python-artifacts/pycparser-3.11-py3-none-any.whl',
  'modules/garmin-connect/python/garmin-python-artifacts/rich-15.0.0-py3-none-any.whl',
  'modules/garmin-connect/python/garmin-python-artifacts/markdown_it_py-4.2.0-py3-none-any.whl',
  'modules/garmin-connect/python/garmin-python-artifacts/mdurl-0.1.2-py3-none-any.whl',
  'modules/garmin-connect/python/garmin-python-artifacts/pygments-2.21.0-py3-none-any.whl',
  'modules/garmin-connect/python/garmin-python-artifacts/charset_normalizer-3.5.2-py3-none-any.whl',
  'modules/garmin-connect/python/garmin-python-artifacts/idna-3.20-py3-none-any.whl',
  'modules/garmin-connect/python/garmin-python-artifacts/urllib3-2.8.0-py3-none-any.whl',
  'modules/garmin-connect/python/android-cffi/build-inputs.json',
  'modules/garmin-connect/python/android-cffi/cffi-2.1.1-cp313-cp313-android_24_arm64_v8a.whl',
];

test('the materialize CLI completes from the full pinned cache with network access disabled',()=>{
  const root=realpathSync(process.cwd());
  const directory=realpathSync(mkdtempSync(path.join(root,'artifacts/native/personal-closeout-20261027/garmin-cached-cli-')));
  const cache=path.join(directory,'cache');mkdirSync(cache);
  const lockPath=path.join(root,'modules/garmin-connect/python/garmin-python-lock.json');
  const lock=JSON.parse(readFileSync(lockPath));
  const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  assert.deepEqual(pinnedInputs.slice(0,15).map(file=>path.basename(file)).sort(),lock.packages.map(entry=>entry.artifact.filename).sort());
  const cffi=lock.packages.find(entry=>entry.name==='cffi');
  assert.equal(hash(readFileSync(path.join(root,pinnedInputs[15]))),cffi.source.manifestSha256);
  assert.equal(hash(readFileSync(path.join(root,pinnedInputs[16]))),cffi.artifact.sha256);
  for(const entry of lock.packages){
    const source=path.join(root,pinnedInputs.slice(0,15).find(file=>path.basename(file)===entry.artifact.filename));
    assert.equal(hash(readFileSync(source)),entry.artifact.sha256);
    copyFileSync(source,path.join(cache,entry.artifact.filename));
  }
  const preload=path.join(directory,'network-disabled.mjs');
  writeFileSync(preload,'globalThis.fetch = async () => { throw new Error("network_access_forbidden_in_cached_cli_check"); };\n');
  const execution=spawnSync(process.execPath,['--import',preload,path.join(root,'scripts/verify-garmin-python-lock.mjs'),'--materialize','--artifacts-dir',cache,lockPath],{cwd:root,encoding:'utf8',timeout:30_000,env:{...process.env}});
  assert.equal(execution.error,undefined);assert.equal(execution.status,0,execution.stderr);
  assert.equal(execution.stdout.trim(),`Garmin Python lock valid (${lock.packages.length} packages).`);
  for(const entry of lock.packages)assert.equal(hash(readFileSync(path.join(cache,entry.artifact.filename))),entry.artifact.sha256,'cached artifact bytes must remain unchanged');
  writeFileSync(path.join(directory,'observed-cli.json'),JSON.stringify({schema_version:1,test_only:true,mode:'cached-materialize-cli',network_disabled:true,package_count:lock.packages.length,source_sha256:hash(readFileSync(path.join(root,'scripts/verify-garmin-python-lock.mjs'))),exit_code:execution.status,cache_unchanged:true},null,2)+'\n');
});

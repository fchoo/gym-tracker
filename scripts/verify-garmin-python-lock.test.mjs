import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  validateGarminPythonLock,
  verifyGarminPythonArtifacts, artifactUrl, materializeGarminPythonArtifacts, verifyGarminCrossBuildProvenance,
} from "./verify-garmin-python-lock.mjs";

const lockPath = path.join(
  process.cwd(),
  "modules/garmin-connect/python/garmin-python-lock.json",
);

function currentLock() {
  return JSON.parse(readFileSync(lockPath, "utf8"));
}

test('rejects every malformed lock and provenance boundary', () => {
  for (const value of [null, [], {}, {schemaVersion: 2}, {schemaVersion: 1, runtime: []}]) assert.throws(() => validateGarminPythonLock(value), /schema/);
  for (const key of ['chaquopyVersion', 'pythonVersion', 'minSdk', 'abi']) { const l = currentLock(); l.runtime[key] = 'wrong'; assert.throws(() => validateGarminPythonLock(l), /runtime/); }
  const invalidPackages = currentLock(); invalidPackages.packages = null; assert.throws(() => validateGarminPythonLock(invalidPackages), /packages/);
  for (const entry of [null, [], {name: 'unknown'}]) { const l = currentLock(); l.packages[2] = entry; assert.throws(() => validateGarminPythonLock(l), /package_set/); }
  const duplicate = currentLock(); duplicate.packages[2] = duplicate.packages[3]; assert.throws(() => validateGarminPythonLock(duplicate), /package_set/);
  for (const [key, value] of [['version', null], ['source', []], ['artifact', []], ['license', 2]]) { const l = currentLock(); l.packages[2][key] = value; assert.throws(() => validateGarminPythonLock(l), /package_metadata/); }
  for (const [section, key, value] of [['source', 'url', null], ['artifact', 'filename', null], ['artifact', 'sha256', 'bad']]) { const l = currentLock(); l.packages[2][section][key] = value; assert.throws(() => validateGarminPythonLock(l), /package_metadata/); }
  for (const key of ['version', 'artifact.filename']) { const l = currentLock(); const c = l.packages.find(e => e.name === 'curl-cffi'); if (key === 'version') c.version = 'wrong'; else c.artifact.filename = 'wrong'; assert.throws(() => validateGarminPythonLock(l), /curl_cffi_artifact/); }
  const client = currentLock(); client.packages[0].version = 'wrong'; assert.throws(() => validateGarminPythonLock(client), /client_commit/);
  for (const [section,key,value] of [['source','kind','pypi'],['source','url','https://wrong'],['artifact','filename','host.whl'],['artifact','sha256','0'.repeat(64)]]) { const l=currentLock();l.packages[0][section][key]=value;assert.throws(()=>validateGarminPythonLock(l),/client_commit/); }
  for (const key of ['version', 'artifact.filename']) { const l = currentLock(); const c = l.packages.find(e => e.name === 'cffi'); if (key === 'version') c.version = '1.17.1'; else c.artifact.filename = 'host.whl'; assert.throws(() => validateGarminPythonLock(l), /cffi_artifact/); }
  for (const [section, key, value] of [['artifact', 'sha256', '0'.repeat(64)], ['source', 'kind', 'pypi'], ['source', 'url', 'https://wrong'], ['source', 'manifest', 'wrong'], ['source', 'manifestSha256', '0'.repeat(64)]]) { const l = currentLock(); l.packages.find(e => e.name === 'cffi')[section][key] = value; assert.throws(() => validateGarminPythonLock(l), /cffi_provenance/); }
  for (const [section, key, value] of [[null,'version','2'], ['artifact','filename','host.whl'], ['artifact','sha256','0'.repeat(64)], ['source','kind','pypi'], ['source','url','wrong']]) { const l = currentLock(); const e = l.packages.find(p => p.name === 'chaquopy-libffi'); if (section) e[section][key] = value; else e[key] = value; assert.throws(() => validateGarminPythonLock(l), /libffi_artifact/); }
  const traversal = currentLock(); traversal.packages[2].artifact.filename = '../escape.whl'; assert.throws(() => validateGarminPythonLock(traversal), /artifact_path/);
  const source = currentLock(); source.packages[2].artifact.filename = 'requests.tar.gz'; assert.throws(() => validateGarminPythonLock(source), /native_source/);
  verifyGarminCrossBuildProvenance(); assert.throws(() => verifyGarminCrossBuildProvenance(() => Buffer.from('changed')), /cffi_provenance/);
});

test("rejects CFFI source installs which can compile a host backend", () => {
  const lock = currentLock();
  const cffi = lock.packages.find((entry) => entry.name === 'cffi');
  cffi.artifact.filename = 'cffi-2.1.1.tar.gz';
  cffi.source.kind = 'pypi';
  assert.throws(() => validateGarminPythonLock(lock), /cffi_artifact/u);
});

test("accepts only the reviewed Python 3.13 ARM64 Garmin dependency graph", () => {
  assert.deepEqual(validateGarminPythonLock(currentLock()), {
    valid: true,
    packageCount: 15,
  });
});

test("rejects a changed client commit, wheel hash, or unreviewed package", () => {
  const lock = currentLock();
  const changedCommit = structuredClone(lock);
  changedCommit.packages[0].source.commit = "0000000000000000000000000000000000000000";
  assert.throws(() => validateGarminPythonLock(changedCommit), /client_commit/u);

  const changedHash = structuredClone(lock);
  changedHash.packages[1].artifact.sha256 = "0".repeat(64);
  assert.throws(() => validateGarminPythonLock(changedHash), /curl_cffi_hash/u);

  const unreviewed = structuredClone(lock);
  unreviewed.packages.push({ name: "unknown", version: "1", source: {}, artifact: {}, license: "MIT" });
  assert.throws(() => validateGarminPythonLock(unreviewed), /package_set/u);
});

test("requires the exact complete local artifact set before packaging", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "garmin-python-lock-"));
  try {
    const lock = currentLock();
    for (const entry of lock.packages) {
      writeFileSync(path.join(directory, entry.artifact.filename), "fixture");
    }
    const expectedDigest = (artifactPath) => lock.packages.find(
      (entry) => entry.artifact.filename === path.basename(artifactPath),
    ).artifact.sha256;
    assert.deepEqual(verifyGarminPythonArtifacts(lock, directory, expectedDigest), {
      valid: true,
      packageCount: 15,
    });

    rmSync(path.join(directory, lock.packages[0].artifact.filename));
    assert.throws(() => verifyGarminPythonArtifacts(lock, directory, expectedDigest), /artifact_set/u);
    writeFileSync(path.join(directory, lock.packages[0].artifact.filename), "wrong");
    assert.throws(() => verifyGarminPythonArtifacts(
      lock,
      directory,
      (artifactPath) => path.basename(artifactPath) === lock.packages[0].artifact.filename
        ? "0".repeat(64)
        : expectedDigest(artifactPath),
    ), /artifact_hash/u);
    writeFileSync(path.join(directory, "unreviewed.whl"), "extra");
    assert.throws(() => verifyGarminPythonArtifacts(lock, directory, expectedDigest), /artifact_set/u);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('resolves only digest-matched official sources', () => {
  const l = currentLock(); const client = l.packages[0];
  assert.match(artifactUrl(client), /archive\/218e72ca.*tar.gz$/);
  assert.equal(artifactUrl({...client, source: {...client.source, url: client.source.url + '/'}}), artifactUrl(client));
  for (const commit of [null, 'bad']) assert.throws(() => artifactUrl({...client, source: {...client.source, commit}}), /client_commit/);
  const e = l.packages[2]; const release = {filename:e.artifact.filename, digests:{sha256:e.artifact.sha256}, url:'https://files.pythonhosted.org/fixture'};
  assert.equal(artifactUrl(e, {urls:[{filename:'other'}, {...release,digests:{}}, release]}), release.url);
  for (const meta of [undefined, {urls:[]}, {urls:[{filename:e.artifact.filename}]}, {urls:[{...release,url:null}]}, {urls:[{...release,url:'https://wrong'}]}]) assert.throws(() => artifactUrl(e,meta), /artifact_resolution/);
  assert.equal(artifactUrl(l.packages.find(p=>p.name==='chaquopy-libffi')), l.packages.find(p=>p.name==='chaquopy-libffi').source.url);
});

test('materializes local cross-build plus fetched official artifacts without host building', async () => {
  const directory=mkdtempSync(path.join(tmpdir(),'garmin-materialize-')); const lock=currentLock();
  const digest = bytes => lock.packages.find(e=>e.name===bytes.toString())?.artifact.sha256 ?? createHash('sha256').update(bytes).digest('hex');
  const fetcher=async url => {
    if(url.startsWith('https://pypi.org/pypi/')) {
      const name=decodeURIComponent(url.split('/')[4]); const e=lock.packages.find(p=>p.name===name);
      return {ok:true,json:async()=>({urls:[{filename:e.artifact.filename,digests:{sha256:e.artifact.sha256},url:'https://files.pythonhosted.org/'+name}]})};
    }
    const name=url.includes('github.com') ? 'python-garminconnect' : url.includes('chaquo.com') ? 'chaquopy-libffi' : url.split('/').at(-1);
    return {ok:true,arrayBuffer:async()=>Buffer.from(name)};
  };
  try {
    const result=await materializeGarminPythonArtifacts(lock,directory,fetcher,digest); assert.equal(result.packageCount,15);
    await materializeGarminPythonArtifacts(lock,directory,()=>assert.fail('cached artifacts must not fetch'),digest);
    const cffi=lock.packages.find(e=>e.name==='cffi'); assert.equal(createHash('sha256').update(readFileSync(path.join(directory,cffi.artifact.filename))).digest('hex'),cffi.artifact.sha256);
  } finally {rmSync(directory,{recursive:true,force:true});}
});

test('fails closed on artifact downloads, metadata, hashes and interrupted publication', async () => {
  const lock=currentLock();
  for(const [fetcher,expected] of [[async()=>({ok:false}),/artifact_download/],[async()=>({ok:true,arrayBuffer:async()=>Buffer.from('wrong')}),/artifact_hash/]]) {
    const d=mkdtempSync(path.join(tmpdir(),'garmin-download-')); try {await assert.rejects(materializeGarminPythonArtifacts(lock,d,fetcher),expected);}finally{rmSync(d,{recursive:true,force:true});}
  }
  const d=mkdtempSync(path.join(tmpdir(),'garmin-metadata-'));
  try {
    writeFileSync(path.join(d,lock.packages[0].artifact.filename),'python-garminconnect');
    const digest=b=>b.toString()==='python-garminconnect'?lock.packages[0].artifact.sha256:createHash('sha256').update(b).digest('hex');
    await assert.rejects(materializeGarminPythonArtifacts(lock,d,async()=>({ok:false}),digest),/artifact_resolution/);
    mkdirSync(path.join(d,lock.packages[1].artifact.filename));
    await assert.rejects(materializeGarminPythonArtifacts(lock,d,async url=>url.startsWith('https://pypi.org')?({ok:true,json:async()=>({urls:[{filename:lock.packages[1].artifact.filename,digests:{sha256:lock.packages[1].artifact.sha256},url:'https://files.pythonhosted.org/curl'}]})}):({ok:true,arrayBuffer:async()=>Buffer.from('curl-cffi')}),b=>b.toString()==='curl-cffi'?lock.packages[1].artifact.sha256:digest(b)),/EISDIR/);
    assert.throws(()=>readFileSync(path.join(d,lock.packages[1].artifact.filename+'.tmp')),/ENOENT/);
  }finally{rmSync(d,{recursive:true,force:true});}
  assert.throws(()=>verifyGarminPythonArtifacts(lock,path.join(tmpdir(),'missing-'+Date.now())),/artifacts_missing/);
  const f=mkdtempSync(path.join(tmpdir(),'garmin-real-hash-'));try{for(const e of lock.packages) writeFileSync(path.join(f,e.artifact.filename),'wrong');assert.throws(()=>verifyGarminPythonArtifacts(lock,f),/artifact_hash/);}finally{rmSync(f,{recursive:true,force:true});}
});

test('lock CLI validates default and explicit paths and rejects missing materialize directories', () => {
  const script=path.resolve('scripts/verify-garmin-python-lock.mjs');
  assert.match(execFileSync(process.execPath,[script],{encoding:'utf8'}),/15 packages/);
  assert.match(execFileSync(process.execPath,[script,lockPath],{encoding:'utf8'}),/15 packages/);
  assert.throws(()=>execFileSync(process.execPath,[script,'--materialize'],{stdio:'pipe'}),/artifacts_missing/);
  assert.throws(()=>execFileSync(process.execPath,[script,'--artifacts-dir',path.join(tmpdir(),'not-existing-lock-artifacts')],{stdio:'pipe'}),/artifacts_missing/);
});

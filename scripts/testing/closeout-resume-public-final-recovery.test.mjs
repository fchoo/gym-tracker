import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {runCapturedHostPhase} from './closeout-resume-phase-proof-fixture.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');

test('current public recovery and existing final independently revalidate the preserved host fixture',()=>{
  const root=fs.realpathSync(process.env.V12_PHASE20_COVERAGE_FIXTURE);
  const runId=fs.readdirSync(path.join(root,'artifacts/native/v1.2')).find(x=>x.startsWith('phase20-'));
  const runRoot=path.join(root,'artifacts/native/v1.2',runId);
  const prefix=`artifacts/native/v1.2/${runId}`;
  const publicationPath=path.join(runRoot,'publication/final.json');
  const publication=JSON.parse(fs.readFileSync(publicationPath,'utf8'));
  const finalEvidence=JSON.parse(fs.readFileSync(path.join(runRoot,'final-evidence.json'),'utf8'));
  assert.equal(finalEvidence.readiness,'NOT_READY');assert.equal(finalEvidence.release_authorized,false);
  // The copied bytes are only a starting input. Verify member bytes before
  // staging; the current public API must then rederive all source authorities.
  for(const member of publication.members){const bytes=fs.readFileSync(path.join(runRoot,member.artifact));assert.equal(sha(bytes),member.sha256);assert.equal(bytes.length,member.size_bytes);}
  const stage=path.join(runRoot,'.staging/final');fs.mkdirSync(stage,{recursive:true});
  for(const member of publication.members){const source=path.join(runRoot,member.artifact),target=path.join(stage,member.artifact);fs.mkdirSync(path.dirname(target),{recursive:true});fs.renameSync(source,target);}
  fs.renameSync(publicationPath,path.join(stage,'manifest.json'));
  const env={...process.env};
  for(const key of ['NODE_ENV','V12_PHASE20_BLACKBOX','V12_NATIVE_ADAPTER_TEST_MODE','V12_NATIVE_ADAPTER_TEST_PROCESS','V12_NATIVE_ADAPTER_COMMAND','NODE_TEST_CONTEXT'])delete env[key];
  const sdk=path.join(root,'artifacts/coverage-live-sdk');
  Object.assign(env,{ANDROID_HOME:sdk,ANDROID_SDK_ROOT:sdk,PATH:`${path.join(sdk,'platform-tools')}:${env.PATH}`,V12_DEVICE_SERIAL:'coverage-device'});
  const tools=[path.join(sdk,'platform-tools/adb'),path.join(sdk,'build-tools/36.0.0/apksigner'),'/usr/bin/git','/usr/bin/unzip'];
  const script=path.join(process.cwd(),'scripts/verify-v12-native-evidence.mjs');
  const recoveryCode=`import assert from 'node:assert/strict';import {recoverV12FinalPublication} from ${JSON.stringify(pathToFileURL(script).href)};assert.equal(recoverV12FinalPublication(process.argv[1],process.argv[2]),true);`;
  const recovery=runCapturedHostPhase('recovery',process.execPath,['--input-type=module','--eval',recoveryCode,root,runId],{cwd:root,env,encoding:'utf8',timeout:600000,maxBuffer:1024*1024*1024},tools);
  assert.equal(recovery.status,0,recovery.stderr);assert.equal(fs.existsSync(stage),false);
  const final=runCapturedHostPhase('existing-final',process.execPath,[script,'--run',runId,'--mode','final'],{cwd:root,env,encoding:'utf8',timeout:600000,maxBuffer:1024*1024*1024},tools);
  assert.equal(final.status,0,final.stderr);
  const actual=JSON.parse(final.stdout);assert.equal(actual.recovered,true);assert.equal(actual.rows,172);assert.equal(actual.readiness,'NOT_READY');assert.equal(actual.release_authorized,false);
  fs.writeFileSync(path.join(process.env.V12_RESUME_CAPTURE_DIR,'retained-fixture.json'),JSON.stringify({schema_version:1,test_only:true,native_acceptance_authority:false,fixture_root:root,run_id:runId,prefix,readiness:actual.readiness,release_authorized:false,restored_from_diagnostic:true,current_public_validation_completed:true},null,2)+'\n');
});

// Staged source-only test prep. Copy into the owned test namespace after GlobalSafeEnd.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {runCapturedHostPhase} from './closeout-resume-phase-proof-fixture.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

test('current verifier derives preseal final recovery and retained final from one actual host fixture', {timeout:25*60_000},()=>{
  const root=fs.realpathSync(process.env.V12_PHASE20_COVERAGE_FIXTURE);
  assert.notEqual(root,fs.realpathSync(process.cwd()));
  const capture=process.env.V12_RESUME_CAPTURE_DIR;
  assert.equal(typeof capture,'string');
  const lease=path.join(root,'artifacts','current-public-verifier-fixture.lease');
  fs.mkdirSync(path.dirname(lease),{recursive:true});fs.writeFileSync(lease,JSON.stringify({pid:process.pid,test_only:true}),{flag:'wx'});
  try {
    const run=fs.readdirSync(path.join(root,'artifacts/native/v1.2')).find(x=>x.startsWith('phase20-'));
    const runRoot=path.join(root,'artifacts/native/v1.2',run);
    const prefix=`artifacts/native/v1.2/${run}`;
    const bytes=relative=>fs.readFileSync(path.join(root,relative));
    const publicationFiles=fs.readdirSync(path.join(runRoot,'publication')).filter(x=>x.endsWith('.json'));
    const verified=[];
    for(const name of publicationFiles){
      const publication=JSON.parse(fs.readFileSync(path.join(runRoot,'publication',name)));
      for(const member of publication.members){
        const file=path.join(runRoot,member.artifact),data=fs.readFileSync(file);
        assert.equal(sha(data),member.sha256,`${name} ${member.artifact}`);assert.equal(data.length,member.size_bytes);
        verified.push({publication:name,artifact:member.artifact,sha256:member.sha256,size_bytes:member.size_bytes});
      }
    }
    const previous=path.join(capture,'previous-publication-inputs');fs.mkdirSync(previous);
    const retain=relative=>{const file=path.join(root,relative);if(!fs.existsSync(file))return;const data=fs.readFileSync(file),saved=path.join(previous,relative);fs.mkdirSync(path.dirname(saved),{recursive:true});fs.writeFileSync(saved,data);fs.unlinkSync(file);};
    const attendedPath=`${prefix}/attended-observations.json`,attended=JSON.parse(bytes(attendedPath));
    const attendedInputs=[attendedPath,...attended.rows.map(row=>row.png.path)];
    const retainedAttended=new Map(attendedInputs.map(relative=>[relative,bytes(relative)]));
    for(const relative of [...attendedInputs,...['ui-state-matrix.json','final-evidence.json','parity-report.md','readiness-handoff.md','publication/final.json','preseal-validation.json','publication/preseal.json'].map(x=>`${prefix}/${x}`)])retain(relative);
    for(const name of ['.claims','.staging','.leases','failures']){const directory=path.join(runRoot,name);if(fs.existsSync(directory)){assert.deepEqual(fs.readdirSync(directory),[],`unresolved ${name} must not be cleared`);fs.rmdirSync(directory);}}
    fs.writeFileSync(path.join(capture,'prepared-fixture-inputs.json'),JSON.stringify({schema_version:1,test_only:true,native_acceptance_authority:false,fixture_root:root,run_id:run,verified_original_members:verified,retained_original_bytes_root:previous,publication_outputs_removed_only:true},null,2)+'\n');
    const env={...process.env};
    for(const key of ['NODE_ENV','V12_PHASE20_BLACKBOX','V12_NATIVE_ADAPTER_TEST_MODE','V12_NATIVE_ADAPTER_TEST_PROCESS','V12_NATIVE_ADAPTER_COMMAND','NODE_TEST_CONTEXT'])delete env[key];
    const sdk=path.join(root,'artifacts/coverage-live-sdk');
    Object.assign(env,{ANDROID_HOME:sdk,ANDROID_SDK_ROOT:sdk,PATH:`${path.join(sdk,'platform-tools')}:${env.PATH}`,V12_DEVICE_SERIAL:'coverage-device'});
    const tools=[path.join(sdk,'platform-tools/adb'),path.join(sdk,'build-tools/36.0.0/apksigner'),'/usr/bin/git','/usr/bin/unzip'];
    const verifier=path.join(process.cwd(),'scripts/verify-v12-native-evidence.mjs');
    const options={cwd:root,env,encoding:'utf8',timeout:600000,maxBuffer:1024*1024*1024};
    const preseal=runCapturedHostPhase('preseal',process.execPath,[verifier,'--run',run,'--mode','preseal','--no-final-write'],options,tools);
    assert.equal(preseal.status,0,preseal.stderr);const prepared=JSON.parse(preseal.stdout);assert.equal(prepared.mode,'preseal');assert.equal(prepared.row_evidence.length,172);assert.equal(prepared.release_authorized,false);
    for(const[relative,data]of retainedAttended){const file=path.join(root,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,data);}
    const final=runCapturedHostPhase('final',process.execPath,[verifier,'--run',run,'--mode','final'],options,tools);
    assert.equal(final.status,0,final.stderr);const sealed=JSON.parse(final.stdout);assert.equal(sealed.rows,172);assert.equal(sealed.readiness,'NOT_READY');assert.equal(sealed.release_authorized,false);
    const publicationPath=path.join(runRoot,'publication/final.json'),publication=JSON.parse(fs.readFileSync(publicationPath)),stage=path.join(runRoot,'.staging/final');fs.mkdirSync(stage,{recursive:true});
    for(const member of publication.members){const file=path.join(runRoot,member.artifact),data=fs.readFileSync(file);assert.equal(sha(data),member.sha256);assert.equal(data.length,member.size_bytes);const target=path.join(stage,member.artifact);fs.mkdirSync(path.dirname(target),{recursive:true});fs.renameSync(file,target);}
    fs.renameSync(publicationPath,path.join(stage,'manifest.json'));
    const code=`import assert from 'node:assert/strict';import {recoverV12FinalPublication} from ${JSON.stringify(pathToFileURL(verifier).href)};assert.equal(recoverV12FinalPublication(process.argv[1],process.argv[2]),true);`;
    const recovery=runCapturedHostPhase('recovery',process.execPath,['--input-type=module','--eval',code,root,run],options,tools);assert.equal(recovery.status,0,recovery.stderr);
    const replay=runCapturedHostPhase('existing-final',process.execPath,[verifier,'--run',run,'--mode','final'],options,tools);
    assert.equal(replay.status,0,replay.stderr);const current=JSON.parse(replay.stdout);assert.equal(current.recovered,true);assert.equal(current.rows,172);assert.equal(current.readiness,'NOT_READY');assert.equal(current.release_authorized,false);
    fs.writeFileSync(path.join(capture,'fixture-result.json'),JSON.stringify({schema_version:1,test_only:true,native_acceptance_authority:false,fixture_root:root,run_id:run,readiness:current.readiness,release_authorized:false,current_public_calls_completed:true},null,2)+'\n');
  } finally {fs.unlinkSync(lease);}
});

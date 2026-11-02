import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fixture,runId,DEVICE_FACTS} from './closeout-maestro-fixture.mjs';
import {withFaultProof} from './closeout-resume-proof-fixture.mjs';
import {executeLiveV12GenericMaestro,readV12DirectSafeSdkIdentity,validateV12LiveSourceLineage,runV12MaestroCli} from '../run-v12-maestro.mjs';
import {safeSdkArguments} from '../v12-maestro-safe-sdk.mjs';
import {sourceTreeSha256} from '../source-tree-digest.mjs';
const subject='scripts/run-v12-maestro.mjs',testFile='scripts/testing/closeout-resume-runner-lifecycle.test.mjs';
const options=v=>({root:v.root,serial:DEVICE_FACTS.serial,currentHead:v.build.source.head,sourceDigest:v.build.source.tree_sha256,isAncestor:()=>true,currentIdentity:v.currentIdentity,executionTools:v.tools,execFileSync:v.execute});
const checked=async(t,name,operation)=>t.test(name,()=>{const value=fixture({after(){}},'multi-plan');return withFaultProof({tree:value.root,subject,testFile,reason:name,overrides:[],publicSubject:true,allowFixtureOutputs:true,operation:()=>operation(value)});});

test('a repeated settings snapshot rejects changed raw facts despite normalized measurement identity',async t=>{
  await checked(t,'changed second snapshot',async v=>{
    let fontReads=0;
    const adb=(...args)=>{const result=v.execute(v.tools.adb,['-s',DEVICE_FACTS.serial,...args],{});if(args.at(-1)==='font_scale'&&++fontReads===3)return `${String(result).trim()}\n`;return String(result).trim();};
    await assert.rejects(executeLiveV12GenericMaestro(['--run',runId,'--shard','multi-plan'],{...options(v),adb}),/v12_maestro_settings_snapshot_changed/u);
    assert.equal(fontReads,3);assert.equal(v.maestroCaseIds.length,1);
    assert.equal(fs.existsSync(path.join(v.root,`artifacts/native/v1.2/${runId}/mapping/multi-plan.json`)),false);
  });
});

test('tampered retained settings prevent CLI publication after the device operation',async t=>{
  await checked(t,'retained snapshot tampering',async v=>{
    let tampered=false;
    const execute=(program,args,opts)=>{
      const result=v.execute(program,args,opts);
      if(!tampered&&program===v.tools.maestro&&args[0]==='sdk-flow'){
        const dir=path.join(v.root,`artifacts/native/v1.2/${runId}/.leases`),snapshot=fs.readdirSync(dir).find(x=>x.endsWith('.snapshot.json'));
        assert.equal(typeof snapshot,'string');const file=path.join(dir,snapshot),data=JSON.parse(fs.readFileSync(file));data.original_settings.font_scale='tampered';fs.writeFileSync(file,JSON.stringify(data));tampered=true;
      }
      return result;
    };
    const output=[],errors=[];
    assert.equal(await runV12MaestroCli(['--run',runId,'--shard','multi-plan'],{stdout:{write:x=>output.push(x)},stderr:{write:x=>errors.push(x)}},{...options(v),execFileSync:execute}),1);
    assert.equal(tampered,true);assert.equal(output.length,0);assert.match(errors.join(''),/v12_maestro_lease_owner_changed/u);
    assert.equal(fs.existsSync(path.join(v.root,`artifacts/native/v1.2/${runId}/publication/multi-plan.json`)),false);
  });
});

test('cancellation before SDK dispatch closes host ownership without inventing a terminal report',async t=>{
  await checked(t,'cancel after measurement',async v=>{
    const controller=new AbortController();let aborted=false;
    const adb=(...args)=>{const result=v.execute(v.tools.adb,['-s',DEVICE_FACTS.serial,...args],{});if(!aborted&&args.at(-1)==='animator_duration_scale'){controller.abort();aborted=true;}return String(result).trim();};
    await assert.rejects(executeLiveV12GenericMaestro(['--run',runId,'--shard','multi-plan'],{...options(v),adb,signal:controller.signal}),/v12_maestro_native_command_cancelled/u);
    assert.equal(aborted,true);assert.equal(v.maestroCaseIds.length,0);
  });
  await checked(t,'cancel after valid SDK argument preparation',async v=>{
    const controller=new AbortController();let prepared=false;
    const tools={...v.tools,execution_origin:'production-attested/v1',test_only:false};
    await assert.rejects(executeLiveV12GenericMaestro(['--run',runId,'--shard','multi-plan'],{...options(v),executionTools:tools,signal:controller.signal,
      readSafeSdkIdentity:args=>readV12DirectSafeSdkIdentity(args),
      safeSdkArguments:(binding,request)=>{const args=safeSdkArguments(binding,request);prepared=true;controller.abort();return args;}}),/v12_maestro_native_command_cancelled/u);
    assert.equal(prepared,true);assert.equal(v.maestroCaseIds.length,0);
  });
});

test('async tool versions and pre-aborted command transports fail before dispatch',async t=>{
  await checked(t,'runProcess cancellation after version',async v=>{
    const controller=new AbortController();let calls=0;
    const runProcess=async(program,args,opts)=>{calls+=1;const result=v.execute(program,args,opts);controller.abort();return result;};
    await assert.rejects(executeLiveV12GenericMaestro(['--run',runId,'--shard','multi-plan'],{...options(v),runProcess,signal:controller.signal}),/v12_maestro_maestro_version_invalid/u);
    assert.equal(calls,1);assert.equal(v.maestroCaseIds.length,0);
  });
  await checked(t,'pre-aborted synchronous transport',async v=>{
    let calls=0;
    await assert.rejects(executeLiveV12GenericMaestro(['--run',runId,'--shard','multi-plan'],{...options(v),signal:AbortSignal.abort(),execFileSync:()=>{calls+=1;throw Error('transport must not run');}}),/v12_maestro_maestro_version_invalid/u);
    assert.equal(calls,0);
  });
  for(const [name,replacement]of [['version transport failure',null],['empty async version',''],['control character async version','bad\u0001version'],['oversize async version','x'.repeat(513)]])await checked(t,name,async v=>{
    const tools={...v.tools,execution_origin:'production-attested/v1',test_only:false};
    const runProcess=async(program,args,opts)=>{if(program===v.tools.adb&&args[0]==='version'){if(replacement===null)throw Error('version unavailable');return replacement;}return v.execute(program,args,opts);};
    await assert.rejects(executeLiveV12GenericMaestro(['--run',runId,'--shard','multi-plan'],{...options(v),executionTools:tools,runProcess}),/v12_maestro_toolchain_invalid/u);
    assert.equal(v.maestroCaseIds.length,0);
  });
});

test('live lineage derives current Git and source bytes when no override is supplied',()=>{
  const root=process.cwd(),head=execFileSync('/usr/bin/git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),tree=sourceTreeSha256(root);
  assert.deepEqual(validateV12LiveSourceLineage({source:{head,tree_sha256:tree}},{root,isAncestor:()=>true}),{head,tree_sha256:tree});
});

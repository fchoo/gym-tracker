import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import fs from 'node:fs';
import path from 'node:path';
import {fixture,runId,DEVICE_FACTS} from './closeout-maestro-fixture.mjs';
import {withFaultProof} from './closeout-resume-proof-fixture.mjs';
import {
  createV12AppFunctionalReadbacks,createV12FunctionalExecutionReceipt,validateV12FunctionalExecutionReceipt,
  validateV12FunctionalCaseReadbacks,createV12ProductCaseEnvironment,validateV12ProductCaseEnvironment,
  validateV12DirectSafeSdkAttestation,prepareV12DirectSafeSdkBinding,readV12DirectLeaseOwner,
  createV12DirectMaestroToolAttestation,createV12DirectMaestroToolAttestationAsync,createV12DirectMaestroExecutionOrigin,V12_MAESTRO_SOURCE_PATHS,
  executeGenericV12Maestro,executeLiveV12GenericMaestro,
  executeLiveV12RecoveryMaestro,validateV12LiveSourceLineage,runV12BoundedProcess,runV12MaestroCli,
  validateV12DirectMaestroMapping,
} from '../run-v12-maestro.mjs';
const subject='scripts/run-v12-maestro.mjs',testFile='scripts/testing/closeout-resume-runner-boundaries.test.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const persistedFixture=()=>fixture({after(){}},'multi-plan');
const proof=async(t,name,operation,value=persistedFixture())=>t.test(name,()=>withFaultProof({tree:value.root,subject,testFile,reason:name,overrides:[],publicSubject:true,allowFixtureOutputs:true,operation:()=>operation(value)}));
const options=value=>({root:value.root,serial:DEVICE_FACTS.serial,currentHead:value.build.source.head,sourceDigest:value.build.source.tree_sha256,isAncestor:()=>true,currentIdentity:value.currentIdentity,executionTools:value.tools,execFileSync:value.execute});

test('every declared process argument guard rejects before spawning a child',async t=>{
  const cases=[['relative program',{program:'relative'}],['non-string program',{program:null}],['non-array arguments',{args:null}],['missing timeout',{timeoutMs:undefined}],['taskkill callback',{taskkillImplementation:null}],['Windows probe',{windowsTreeProbeImplementation:null}],['POSIX probe',{posixProcessProbeImplementation:null}],['PIDFD callback',{posixPidfdSignalImplementation:null}],['PIDFD executable type',{posixPidfdPythonExecutable:null}],['pre-aborted',{signal:AbortSignal.abort()}]];
  for(const [name,changes]of cases)await proof(t,name,async()=>{
    let spawned=false;const {program=process.execPath,args=[],...rest}=changes;
    await assert.rejects(runV12BoundedProcess(program,args,{timeoutMs:1000,spawnImplementation:()=>{spawned=true;throw Error('must not spawn');},...rest}),/v12_maestro_process_(?:arguments_invalid|cancelled)/u);
    assert.equal(spawned,false);
  });
});

test('a missing child PID still reports its failed process outcome',async t=>{
  await proof(t,'child without PID',async()=>{
    const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();
    const pending=runV12BoundedProcess(process.execPath,[],{platform:'win32',timeoutMs:1000,spawnImplementation:()=>child});
    child.emit('error',Error('spawn failed'));await assert.rejects(pending,/v12_maestro_process_spawn_failed/u);
    child.emit('close',1,null);child.emit('error',Error('late error'));
  });
});

test('SDK ownership and digest types reject invalid public descriptors before byte reads',async t=>{
  for(const [name,value,extra]of [['missing run',{},{}],['missing identity digest',{schema_version:1,identity_sha256:undefined,receipt_sha256:'a'.repeat(64),jar_sha256:'b'.repeat(64),receipt_path:`artifacts/native/v1.2/${runId}/tools/direct-multi-plan-receipt.json`,jar_path:`artifacts/native/v1.2/${runId}/tools/direct-multi-plan-runner.jar`},{runId,shard:'multi-plan'}]])await proof(t,name,v=>{
    assert.throws(()=>validateV12DirectSafeSdkAttestation(value,{root:v.root,...extra}),/v12_maestro_safe_sdk_attestation_invalid/u);
  });
  await proof(t,'non-string SDK prepared JAR digest',v=>{
    const jar=path.join(v.root,'bad.jar');fs.writeFileSync(jar,'fixture JAR');
    assert.throws(()=>prepareV12DirectSafeSdkBinding({root:v.root,runId,shard:'multi-plan',tools:{...v.tools,test_only:false},dependencies:{prepareSafeSdk:()=>({jar,receipt:{jar_sha256:['a'.repeat(64)]}}),verifySafeSdk:()=>true}}),/v12_maestro_safe_sdk_attestation_invalid/u);
  });
  await proof(t,'undefined operation proof cannot canonicalize into a source claim',()=>{
    assert.throws(()=>createV12AppFunctionalReadbacks({shard:'workout',caseId:'workout.root-identity',nonce:'a'.repeat(48),pre:{},action:{},post:{},operationResult:{}}),/v12_maestro_source_readback_invalid/u);
  });
});

test('Linux lease ownership requires a numeric process birth field',async t=>{
  await proof(t,'Linux birth field absent',()=>{
    assert.throws(()=>readV12DirectLeaseOwner({platform:'linux',pid:42,nonce:'a'.repeat(64),readText:file=>file.endsWith('boot_id')?'12345678-1234-1234-1234-123456789abc\n':'42 (node) S 1'}),/v12_maestro_lease_owner_invalid/u);
  });
});

test('contract lookup and inconsistent receipt fields reject before creating execution claims',async t=>{
  await proof(t,'unknown source receipt case',()=>{
    assert.throws(()=>createV12FunctionalExecutionReceipt({shard:'workout',caseId:'unknown',nonce:'a'.repeat(48),sourceReceipt:{},uiReadback:{}}),/v12_maestro_case_contract_invalid/u);
  });
  await proof(t,'operation hash differs despite valid source bytes',()=>{
    const state={source_sha256:'b'.repeat(64),row_count:1,schema_version:42},readback=structuredClone(createV12AppFunctionalReadbacks({shard:'workout',caseId:'workout.root-identity',nonce:'a'.repeat(48),pre:state,action:state,post:state}));
    readback.source_receipt.operation_result_sha256='c'.repeat(64);
    assert.throws(()=>createV12FunctionalExecutionReceipt({shard:'workout',caseId:'workout.root-identity',nonce:'a'.repeat(48),sourceReceipt:readback.source_receipt,uiReadback:readback.ui_readback}),/v12_maestro_source_readback_invalid/u);
  });
  await proof(t,'receipt post source differs but outer receipt rehashes',v=>{
    const state={source_sha256:'b'.repeat(64),row_count:1,schema_version:42},p=createV12AppFunctionalReadbacks({shard:'workout',caseId:'workout.root-identity',nonce:'a'.repeat(48),pre:state,action:state,post:state});
    const identity={source_tree_sha256:v.build.source.tree_sha256,apk_sha256:v.build.build.apk.sha256,installed_apk_sha256:v.build.device.installed_apk_sha256,device_identity_sha256:v.build.device.identity_sha256,configuration_id:v.build.configuration.id};
    const receipt=structuredClone(createV12FunctionalExecutionReceipt({shard:'workout',caseId:'workout.root-identity',nonce:'a'.repeat(48),runId,identity,sourceReceipt:p.source_receipt,uiReadback:p.ui_readback,pre:state,action:{report_sha256:'c'.repeat(64)},post:{source_sha256:state.source_sha256,ui_sha256:p.ui_readback.ui_receipt_sha256}}));
    receipt.phases[2].ui_sha256='d'.repeat(64);const {receipt_sha256:unused,...unsigned}=receipt;receipt.receipt_sha256=sha(JSON.stringify(unsigned));
    assert.throws(()=>validateV12FunctionalExecutionReceipt(receipt,{runId,shard:'workout',caseId:'workout.root-identity',manifest:v.build}),/v12_maestro_execution_receipt_invalid/u);
  });
  await proof(t,'product environment missing exact fields',()=>assert.throws(()=>validateV12ProductCaseEnvironment({}, {shard:'workout',caseId:'workout.root-identity',nonce:'a'.repeat(48)}),/v12_maestro_product_environment_invalid/u));
});

test('generic legacy dispatch rejects manifest drift and unsafe adapters',async t=>{
  const cases=[['unsupported run metadata',{readJson:()=>null},/manifest_invalid/u],['valid manifest for wrong run',{readJson:v=>({...v.build,run_id:'phase20-20261017T000000Z-bbbbbbbbbbbb'})},/manifest_invalid/u],['missing snapshot callback',{adapter:{execute:()=>({}),restoreSettings:()=>true}},/adapter_invalid/u],['missing execute callback',{adapter:{snapshotSettings:()=>({}),restoreSettings:()=>true}},/adapter_invalid/u],['missing restore callback',{adapter:{snapshotSettings:()=>({}),execute:()=>({})}},/adapter_invalid/u]];
  for(const [name,changes,error]of cases)await proof(t,name,v=>{
    const change={...changes};if(name==='valid manifest for wrong run')change.readJson=()=>changes.readJson(v);
    assert.throws(()=>executeGenericV12Maestro(['--run',runId,'--shard','multi-plan'],{root:v.root,currentIdentity:v.currentIdentity,...change}),error);
  });
  await proof(t,'generic adapter may not publish verdict authority',v=>{
    assert.throws(()=>executeGenericV12Maestro(['--run',runId,'--shard','multi-plan'],{root:v.root,currentIdentity:v.currentIdentity,adapter:{snapshotSettings:()=>({}),execute:()=>({nested:{verdict:'PASS'}}),restoreSettings:()=>true}}),/producer_verdict_forbidden/u);
  });
  await proof(t,'generic adapter failed restoration',v=>{
    assert.throws(()=>executeGenericV12Maestro(['--run',runId,'--shard','multi-plan'],{root:v.root,currentIdentity:v.currentIdentity,adapter:{snapshotSettings:()=>({}),execute:()=>({}),restoreSettings:()=>false}}),/settings_restore_failed/u);
  });
});

test('live generic and recovery paths reject malformed manifests, missing flows, and unknown shards',async t=>{
  const cases=[['generic wrong shard',executeLiveV12GenericMaestro,'calendar',{},/live_shard_invalid/u],['recovery wrong shard',executeLiveV12RecoveryMaestro,'multi-plan',{},/live_shard_invalid/u],['generic invalid manifest',executeLiveV12GenericMaestro,'multi-plan',{readJson:()=>null},/manifest_invalid/u],['recovery invalid manifest',executeLiveV12RecoveryMaestro,'recovery',{readJson:()=>null},/manifest_invalid/u],['recovery missing flow',executeLiveV12RecoveryMaestro,'recovery',{exists:()=>false},/artifact_missing/u],['generic missing flow',executeLiveV12GenericMaestro,'multi-plan',{},/artifact_missing/u]];
  for(const [name,execute,shard,changes,error]of cases)await proof(t,name,async v=>{
    if(name==='generic missing flow')fs.unlinkSync(path.join(v.root,'maestro/v1.2/multi-plan.yaml'));
    await assert.rejects(execute(['--run',runId,'--shard',shard],{...options(v),...changes}),error);
  });
  await proof(t,'live source manifest absent',()=>assert.throws(()=>validateV12LiveSourceLineage(null,{currentHead:'a'.repeat(40),sourceDigest:'b'.repeat(64),isAncestor:()=>true}),/identity_mismatch/u));
  await proof(t,'live source digest absent',()=>assert.throws(()=>validateV12LiveSourceLineage({source:{head:'a'.repeat(40)}},{currentHead:'a'.repeat(40),sourceDigest:'b'.repeat(64),isAncestor:()=>true}),/identity_mismatch/u));
  await proof(t,'live source digest drift',()=>assert.throws(()=>validateV12LiveSourceLineage({source:{head:'a'.repeat(40),tree_sha256:'b'.repeat(64)}},{currentHead:'a'.repeat(40),sourceDigest:'c'.repeat(64),isAncestor:()=>true}),/source_tree_mismatch/u));
});

test('async device measurement rejects every disconnected or malformed transport observation',async t=>{
  for(const [name,match,replacement]of [['offline','get-state','offline'],['wrong package','shell pm list packages com.fchoo.gymtracker.devtest','package:other'],['missing package','shell pm list packages com.fchoo.gymtracker.devtest',''],['wrong APK path','shell pm path com.fchoo.gymtracker.devtest','package:/other/app.apk'],['split APKs','shell pm path com.fchoo.gymtracker.devtest','package:/data/app/base.apk\npackage:/data/app/split.apk'],['untyped installed digest','shell sha256sum /data/app/com.fchoo.gymtracker.devtest/base.apk','invalid']])await proof(t,name,async v=>{
    const execute=(program,args,opts)=>program===v.tools.adb&&args.slice(2).join(' ')===match?replacement:v.execute(program,args,opts);
    await assert.rejects(executeLiveV12GenericMaestro(['--run',runId,'--shard','multi-plan'],{...options(v),execFileSync:execute}),/v12_maestro_identity_mismatch/u);
    assert.equal(v.maestroCaseIds.length,0);
  });
});

test('source and report failures preserve bounded cleanup and never publish a mapping',async t=>{
  for(const name of ['missing JUnit','invalid hierarchy','ABI drift','installed APK bytes changed'])await proof(t,name,async v=>{
    if(name==='installed APK bytes changed')fs.writeFileSync(path.join(v.root,v.build.build.apk.path),'changed APK fixture');
    const execute=(program,args,opts)=>{
      if(name==='missing JUnit'&&program===v.tools.maestro&&args[0]==='sdk-flow')return '';
      if(name==='invalid hierarchy'&&program===v.tools.adb&&args.includes('exec-out')&&String(args[4]).includes('functional-ui'))return '<hierarchy password="true"/>';
      if(name==='ABI drift'&&program===v.tools.adb&&args.slice(2).join(' ')==='shell getprop ro.product.cpu.abi')return 'x86_64';
      return v.execute(program,args,opts);
    };
    let hierarchyReads=0;
    const changes=name==='invalid hierarchy'?{captureUiReadback:()=>{hierarchyReads+=1;return '<hierarchy password="true"/>';}}:{};
    const expected=name==='missing JUnit'?/v12_maestro_native_command_failed/u:name==='invalid hierarchy'?/v12_maestro_source_readback_invalid/u:/v12_maestro_identity_mismatch/u;
    await assert.rejects(executeLiveV12GenericMaestro(['--run',runId,'--shard','multi-plan'],{...options(v),execFileSync:execute,...changes}),expected);
    if(name==='invalid hierarchy')assert.equal(hierarchyReads,1,'the injected hierarchy must reach the public readback validator');
    assert.equal(fs.existsSync(path.join(v.root,`artifacts/native/v1.2/${runId}/mapping/multi-plan.json`)),false);
  });
});

test('CLI failures with an explicit signal remove no unrelated signal listeners',async t=>{
  await proof(t,'explicit signal',async()=>{
    const errors=[];const before=process.listenerCount('SIGTERM');
    assert.equal(await runV12MaestroCli([], {stdout:{write:()=>assert.fail('no success output')},stderr:{write:x=>errors.push(x)}},{signal:new AbortController().signal}),1);
    assert.equal(process.listenerCount('SIGTERM'),before);assert.match(errors.join(''),/v12_calendar_diagnostic_flag_required/u);
  });
});

test('the public async attestation builder rejects foreign shards before tool dispatch',async t=>{
  await proof(t,'async attestation foreign shard',async v=>{
    let dispatches=0;
    await assert.rejects(createV12DirectMaestroToolAttestationAsync({executionTools:v.tools,shard:'unknown',run:async()=>{dispatches+=1;return 'unexpected';}}),/v12_maestro_tool_attestation_invalid/u);
    assert.equal(dispatches,0);
  });
  await proof(t,'async attestation missing runner',async v=>{
    await assert.rejects(createV12DirectMaestroToolAttestationAsync({executionTools:v.tools,shard:'multi-plan'}),/v12_maestro_toolchain_invalid/u);
  });
  await proof(t,'async attestation retains the prepared controlled SDK',async v=>{
    const sdk=prepareV12DirectSafeSdkBinding({root:v.root,runId,shard:'multi-plan',tools:v.tools});
    const input=structuredClone(sdk.attestation);
    const card=await createV12DirectMaestroToolAttestationAsync({root:v.root,runId,executionTools:v.tools,shard:'multi-plan',safeSdk:input,run:async()=>assert.fail('controlled versions must not dispatch')});
    assert.equal(card.schema_version,2);assert.equal(card.action,'multi-plan');assert.equal(card.test_only,true);
    assert.deepEqual(card.safe_sdk,sdk.attestation);assert.deepEqual(card.tools.map(tool=>tool.version),['test-controlled','test-controlled','test-controlled']);
    input.identity_sha256='f'.repeat(64);assert.deepEqual(card.safe_sdk,sdk.attestation);assert.equal(Object.isFrozen(card.safe_sdk),true);
  });
  await proof(t,'async attestation rejects missing or malformed SDK before version queries',async v=>{
    const sdk=prepareV12DirectSafeSdkBinding({root:v.root,runId,shard:'multi-plan',tools:v.tools});
    for(const safeSdk of [undefined,null,{}, {...sdk.attestation,identity_sha256:[sdk.attestation.identity_sha256]},
      {...sdk.attestation,receipt_path:sdk.attestation.receipt_path.replace('multi-plan','workout')},
      {...sdk.attestation,jar_sha256:'f'.repeat(64)}, {...sdk.attestation,extra:()=>true}]){
      let calls=0;
      await assert.rejects(createV12DirectMaestroToolAttestationAsync({root:v.root,runId,executionTools:v.tools,shard:'multi-plan',safeSdk,run:async()=>{calls+=1;return 'unexpected';}}),/v12_maestro_safe_sdk_attestation_invalid/u);
      assert.equal(calls,0);
    }
  });
});

test('execution-origin construction binds only the canonical source registration',async t=>{
  await proof(t,'origin rejects absent or foreign registration',v=>{
    const canonical=V12_MAESTRO_SOURCE_PATHS['multi-plan'];
    for(const sourceRegistration of [undefined,null,{}, {...canonical,extra:true},{...canonical,domain:'scripts/v12-recovery-shard.mjs'}]){
      assert.throws(()=>createV12DirectMaestroExecutionOrigin({root:v.root,runId,shard:'multi-plan',sourceRegistration,tools:v.tools}),/v12_maestro_toolchain_invalid/u);
    }
    assert.throws(()=>createV12DirectMaestroExecutionOrigin({root:v.root,runId,shard:'unknown',sourceRegistration:canonical,tools:v.tools}),/v12_maestro_toolchain_invalid/u);
  });
  await proof(t,'origin matches the actual host producer record with reordered registration fields',async v=>{
    await executeLiveV12GenericMaestro(['--run',runId,'--shard','multi-plan'],options(v));
    const mapping=JSON.parse(fs.readFileSync(path.join(v.root,`artifacts/native/v1.2/${runId}/mapping/multi-plan.json`)));
    const registration=Object.fromEntries(Object.entries(V12_MAESTRO_SOURCE_PATHS['multi-plan']).reverse());
    const origin=createV12DirectMaestroExecutionOrigin({root:v.root,runId,shard:'multi-plan',sourceRegistration:registration,
      manifest:v.build,snapshot:{flow_sha256:mapping.flow_sha256,source_sha256:mapping.source_sha256},tools:v.tools,
      gitAttestationSha256:mapping.git_attestation_sha256,toolAttestation:mapping.tool_attestation,observations:mapping.observations});
    assert.deepEqual(origin,mapping.execution_origin);assert.equal(origin.test_only,true);assert.equal(origin.default_launcher,false);
    assert.equal(origin.adapter_source_sha256,sha(fs.readFileSync(path.join(v.root,registration.adapter))));
    assert.equal(origin.domain_source_sha256,sha(fs.readFileSync(path.join(v.root,registration.domain))));
    let adapterReads=0;
    const changingRegistration={...registration};
    Object.defineProperty(changingRegistration,'adapter',{enumerable:true,get(){adapterReads+=1;return adapterReads===1?registration.adapter:'scripts/v12-recovery-shard.mjs';}});
    const stableOrigin=createV12DirectMaestroExecutionOrigin({root:v.root,runId,shard:'multi-plan',sourceRegistration:changingRegistration,
      manifest:v.build,snapshot:{flow_sha256:mapping.flow_sha256,source_sha256:mapping.source_sha256},tools:v.tools,
      gitAttestationSha256:mapping.git_attestation_sha256,toolAttestation:mapping.tool_attestation,observations:mapping.observations});
    assert.equal(adapterReads,1);assert.deepEqual(stableOrigin,origin);
  });
});

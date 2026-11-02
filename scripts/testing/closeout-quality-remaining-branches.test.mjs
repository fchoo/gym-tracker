import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { createControlledRunner, spawnSync } from "./closeout-last-two-proof-fixture.mjs";
import { accessibilityEvidence } from "./v12-quality-evidence-fixture.mjs";

// Synthetic host proof only. The real public module and runtime execute in an
// isolated production-mode child; the sole device executable is a local fixture.
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const quote = text => `'${text.replaceAll("'", "'\\''")}'`;
const DEVICE = String.raw`
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import {pathToFileURL} from 'node:url';
const file=path.join(process.env.V12_CONTROLLED_STATE,'state.json'); const state=JSON.parse(fs.readFileSync(file,'utf8'));
const args=process.argv.slice(2); const command=args[2]==='shell'?[...args[3].matchAll(/'([^']*)'/g)].map(m=>m[1]):[];
const save=()=>fs.writeFileSync(file,JSON.stringify(state)); const record=()=>{(state.commands??=[]).push(args);save()};
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const canonical=x=>Array.isArray(x)?'['+x.map(canonical).join(',')+']':x&&typeof x==='object'?'{'+Object.entries(x).sort(([a],[b])=>a.localeCompare(b,'en')).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}':JSON.stringify(x);
const emit=(kind,extra)=>process.stdout.write('GYM_TRACKER_V12_QUALITY:'+JSON.stringify({schema_version:1,nonce:command[command.indexOf('qualityNonce')+1],action:command[command.indexOf('qualityAction')+1],kind,...extra})+'\n');
if(args[2]==='get-state'&&state.manifestFault&&!state.manifestFaultApplied){
 const m=JSON.parse(fs.readFileSync(state.manifestPath,'utf8'));
 if(state.manifestFault==='head-missing')delete m.source.head;
 if(state.manifestFault==='package')m.build.package='wrong.package';
 if(state.manifestFault==='fixture-digest')delete m.fixtures;
 fs.writeFileSync(state.manifestPath,JSON.stringify(m));state.manifestFaultApplied=true;save();
}
if(command[0]==='pidof') {record();if(state.pidStatus===2)process.exit(2);if(state.processId)process.stdout.write(String(state.processId));else process.exitCode=1;
}else if(command[0]==='getconf'){record();process.stdout.write(state.clock??'100');
}else if(command[0]==='cat'&&command[1]?.startsWith('/proc/')){record();process.stdout.write(state.processId+' (gymtracker) S '+Array(18).fill('0').join(' ')+' '+(state.badTicks?'0':state.processStartTicks));
}else if(command[0]==='am'&&command[1]==='start'){
 record();const uri=new URL(command[command.indexOf('-d')+1]);state.coldSequence=(state.coldSequence??0)+1;state.processId=state.neverStart?null:3000+state.coldSequence;state.processStartTicks=100000+state.coldSequence*100;
 const base={schema_version:1,nonce:uri.searchParams.get('nonce'),action:'performance',operation:uri.searchParams.get('operation'),sequence:Number(uri.searchParams.get('sequence')),sqlite_receipt_sha256:hash('sqlite'),database_name:'synthetic.db'};
 const marker=(kind,extra)=>{const unsigned={...base,kind,...extra};if(state.coldFault==='sqlite-missing')delete unsigned.sqlite_receipt_sha256;return {...unsigned,receipt_sha256:hash(canonical(unsigned))}};
 const callback=marker('callback',{payload:{callback_id:'route-ready',rendered_root:'workout',callback_count:1}});
 const ready=marker('ready',state.coldFault==='readiness-missing'?{}:{readiness_sha256:hash('ready')});
 const prefix=state.coldFault==='no-timestamp'?'I/ReactNativeJS: ':state.coldFault==='clock-backwards'?'1000.000 I/ReactNativeJS: ':(state.processStartTicks/100+0.1).toFixed(3)+' I/ReactNativeJS: ';
 state.coldLog=prefix+'GYM_TRACKER_PHASE20_WORKLOAD:'+JSON.stringify(callback)+'\n'+prefix+'GYM_TRACKER_PHASE20_WORKLOAD:'+JSON.stringify(ready)+'\n';
 if(state.coldFault==='stale-and-malformed')state.coldLog='ordinary unrelated log\nGYM_TRACKER_PHASE20_WORKLOAD:{bad\nGYM_TRACKER_PHASE20_WORKLOAD:'+JSON.stringify({...ready,nonce:'stale'})+'\n'+state.coldLog;
 save();process.stdout.write('Status: ok');
}else if(command[0]==='am'&&command[1]==='force-stop'){record();if(!state.refuseStop){state.processId=null;state.processStartTicks=null;save()}
}else if(command[0]==='logcat'){record();process.stdout.write(state.coldLog??'');
}else if(command.slice(0,3).join(' ')==='pm list instrumentation'){record();process.stdout.write('instrumentation:com.fchoo.gymtracker.devtest/com.fchoo.gymtracker.Phase20QualityInstrumentation (target=com.fchoo.gymtracker.devtest)\n');
}else if(command[0]==='am'&&command[1]==='instrument'){
 record();state.instrumentCalls=(state.instrumentCalls??0)+1;state.instrumentFinished=true;save();
 const mode=state.protocolFault;
 if(mode==='failed-line'){process.stdout.write('INSTRUMENTATION_ABORTED: synthetic\n');process.exit(0)}
 if(mode==='unknown-kind'){emit('unknown',{});process.exit(0)}
 if(mode==='empty-result'){emit('result',{sha256:hash('')});process.exit(0)}
 if(mode==='missing-chunks'){emit('chunk',{sequence:1,total:2,payload:'e30='});emit('result',{sha256:hash('{}')});process.exit(0)}
 if(mode==='bad-integer'){emit('progress',{sequence:0});process.exit(0)}
 if(mode==='bad-marker-digest'){emit('result',{sha256:null});process.exit(0)}
 if(mode==='output-limit'){await new Promise(resolve=>process.stdout.write(('x'.repeat(4000)+'\n').repeat(1050),resolve));process.exit(0)}
 if(mode==='line-limit'){process.stdout.write('x'.repeat(8193));await new Promise(resolve=>setTimeout(resolve,500));process.exit(0)}
 if(mode==='exit-failure'){process.exit(9)}
 if(mode==='exit-signal'){process.kill(process.pid,'SIGTERM')}
 if(mode==='unrelated-lines')process.stdout.write('INSTRUMENTATION_STATUS: class=synthetic\n');
 const bytes=mode==='invalid-json'?Buffer.from('{bad'):fs.readFileSync(path.join(process.env.V12_CONTROLLED_STATE,'quality-result.json'));
 const encoded=bytes.toString('base64');const chunks=Array.from({length:Math.ceil(encoded.length/3000)},(_,i)=>encoded.slice(i*3000,(i+1)*3000));
 emit('progress',{sequence:1});chunks.forEach((payload,i)=>emit('chunk',{sequence:i+1,total:chunks.length,payload}));emit('result',{sha256:hash(bytes)});
 process.stdout.write('INSTRUMENTATION_CODE: -1'+(mode==='no-final-newline'?'':'\n'));
}else if(command[0]==='settings'&&command[1]==='get'&&command.at(-1)==='show_ime_with_hard_keyboard'&&(state.badInitialSetting||state.instrumentFinished&&state.restoreReadFails)){
 record();if(state.restoreReadFails)process.exit(2);process.stdout.write('garbage');
}else{await import(pathToFileURL(path.join(process.cwd(),'scripts/testing/v12-production-launcher/controlled-device-tool.mjs')))}
`;

function fixture(t, action = "accessibility") {
  const runner = createControlledRunner(); t.after(runner.cleanup);
  const { build } = runner;
  const identity = { base_head: build.source.head, source_tree_sha256: build.source.tree_sha256, apk_sha256: build.build.apk.sha256,
    installed_apk_sha256: build.device.installed_apk_sha256, package: build.build.package, device_identity_sha256: build.device.identity_sha256,
    fixture_sha256: build.fixtures.registry_sha256 };
  const attestation = { schema_version: 1, action, launcher_source_sha256: hash(readFileSync(path.join(runner.root,"scripts/v12-production-native-adapter-launcher.mjs"))),
    run_id: build.run_id, build_profile: "development-test", suite: "v1.2-acceptance", source_tree_sha256: identity.source_tree_sha256,
    apk_sha256: identity.apk_sha256, installed_apk_sha256: identity.installed_apk_sha256, apk_signature_sha256: build.build.apk.signature_sha256,
    device_identity_sha256: identity.device_identity_sha256, package: identity.package };
  const measured = {schema_version:1, action, identity, build_variant:"release", debugger_attached:false, observations:accessibilityEvidence(identity)};
  const device = path.join(runner.scratch,"quality-remaining-device.mjs");writeFileSync(device,DEVICE);
  writeFileSync(path.join(runner.scratch,"bin/adb"),`#!/bin/sh\nunset NODE_V8_COVERAGE\nexec ${quote(process.execPath)} ${quote(device)} "$@"\n`,{mode:0o755});
  const env={...process.env,...runner.executionEnvironment,NODE_ENV:"production",V12_DEVICE_SERIAL:"controlled-device-20",V12_CONTROLLED_STATE:runner.scratch};
  for(const name of ["NODE_TEST_CONTEXT","V12_NATIVE_ADAPTER_COMMAND","V12_NATIVE_ADAPTER_TEST_MODE","V12_NATIVE_ADAPTER_TEST_PROCESS"])delete env[name];
  const moduleUrl=new URL("../v12-production-native-quality-actions.mjs",import.meta.url).href;
  const run=program=>spawnSync(process.execPath,["--input-type=module","--eval",program],{cwd:runner.root,env,encoding:"utf8",timeout:45_000,maxBuffer:4*1024*1024});
  function invoke(payload={},setup="") {
    writeFileSync(path.join(runner.scratch,"quality-result.json"),JSON.stringify(measured));
    return run(`import fs from 'node:fs';import {executeProductionQualityAction} from ${JSON.stringify(moduleUrl)};${setup}
      try{const result=await executeProductionQualityAction(${JSON.stringify(action)},${JSON.stringify({run_id:build.run_id,...payload})},${JSON.stringify(attestation)});process.stdout.write(JSON.stringify(result))}
      catch(error){process.stderr.write(error.message);process.exitCode=1}`);
  }
  function cold(setup="",count=1){return run(`import {collectV12ColdLaunchEvidence} from ${JSON.stringify(moduleUrl)};${setup}
    try{const result=await collectV12ColdLaunchEvidence('controlled-device-20','a'.repeat(48),${JSON.stringify(identity.source_tree_sha256)},${count},{adb:process.env.V12_ADB_PATH});process.stdout.write(JSON.stringify(result))}
    catch(error){process.stderr.write(error.message);process.exitCode=1}`)}
  return {...runner,measured,attestation,identity,invoke,cold};
}
function rejected(result,code){assert.equal(result.error,undefined);assert.equal(result.signal,null);assert.equal(result.status,1);assert.equal(result.stdout,"");assert.equal(result.stderr,"v12_production_native_launcher_quality_"+code)}
function released(runner){assert.equal(existsSync(path.join(runner.scratch,"lock")),false)}

for(const [name,mode,code] of [
  ["rejects an aborted instrumentation line","failed-line","marker_invalid"],
  ["rejects an unknown marker kind","unknown-kind","marker_invalid"],
  ["rejects a result with no chunks","empty-result","marker_invalid"],
  ["rejects a result before all advertised chunks arrive","missing-chunks","marker_invalid"],
  ["rejects a zero progress sequence","bad-integer","marker_invalid"],
  ["rejects a non-string result digest","bad-marker-digest","marker_invalid"],
  ["bounds stdout bytes before parsing","output-limit","output_limit"],
  ["bounds an unterminated stdout line","line-limit","line_limit"],
  ["rejects a nonzero instrumentation exit","exit-failure","instrumentation_failed"],
  ["rejects a signalled instrumentation process","exit-signal","instrumentation_failed"],
  ["reduces malformed decoded JSON to a bounded error","invalid-json","marker_invalid"],
])test(`quality ${name}`,(t)=>{const runner=fixture(t);runner.updateState({protocolFault:mode});rejected(runner.invoke(),code);released(runner);assert.equal(runner.readState().instrumentCalls,1)});

for(const [name,mode] of [["ignores unrelated status lines","unrelated-lines"],["accepts completion without a final newline","no-final-newline"]])test(`quality ${name}`,(t)=>{
 const runner=fixture(t);runner.updateState({protocolFault:mode});const result=runner.invoke();assert.equal(result.status,0,result.stderr);
 assert.deepEqual(JSON.parse(result.stdout),runner.measured.observations.map(o=>({...o,restored_settings:true})));released(runner);
});
test("quality rejects an envelope with the wrong exact key count",(t)=>{const runner=fixture(t);runner.measured.unexpected=true;rejected(runner.invoke(),"schema_invalid");released(runner)});
test("quality bounds a non-Error thrown by the JSON parser at the public completion boundary",(t)=>{
 const runner=fixture(t);runner.updateState({protocolFault:"invalid-json"});
 const setup="const parse=JSON.parse;JSON.parse=(text,...rest)=>{if(text==='{bad')throw null;return parse(text,...rest)};";
 rejected(runner.invoke({},setup),"marker_invalid");released(runner);
});
for(const [name,mode,code] of [["missing manifest head","head-missing","identity_invalid"],["manifest package changed after runtime validation","package","identity_invalid"],["missing fixture digest","fixture-digest","digest_invalid"]])test(`quality rejects ${name}`,(t)=>{
 const runner=fixture(t,"performance");runner.updateState({manifestFault:mode,manifestPath:runner.manifestPath});rejected(runner.invoke({request:"identity"}),code);released(runner);assert.equal(runner.readState().instrumentCalls,undefined);
});
test("quality rejects an invalid quality-only setting before instrumentation",(t)=>{const runner=fixture(t);runner.updateState({badInitialSetting:true});rejected(runner.invoke(),"settings_invalid");released(runner);assert.equal(runner.readState().instrumentCalls,undefined)});
test("quality retains the lease when restoration cannot read its verification snapshot",(t)=>{const runner=fixture(t);runner.updateState({restoreReadFails:true});rejected(runner.invoke(),"settings_restore_failed");assert.equal(existsSync(path.join(runner.scratch,"lock")),true)});

for(const [name,state,code] of [
 ["rejects pidof status two",{pidStatus:2},"device_command_failed"],
 ["rejects invalid process start ticks",{processId:100,badTicks:true},"cold_process_invalid"],
 ["rejects a zero process clock",{clock:"0"},"cold_clock_invalid"],
 ["rejects a process that never starts",{neverStart:true},"cold_process_invalid"],
 ["rejects a force-stop that leaves the old process running",{processId:100,processStartTicks:1000,refuseStop:true},"cold_force_stop_invalid"],
 ["rejects a marker without a monotonic timestamp",{coldFault:"no-timestamp"},"cold_marker_invalid"],
 ["rejects a marker without the SQLite receipt digest",{coldFault:"sqlite-missing"},"cold_marker_invalid"],
 ["rejects readiness before the new process start",{coldFault:"clock-backwards"},"cold_clock_invalid"],
])test(`cold launch ${name}`,(t)=>{const runner=fixture(t);runner.updateState(state);rejected(runner.cold(),code);released(runner)});
test("cold launch ignores malformed and stale logs while binding the current callback and ready marker",(t)=>{
 const runner=fixture(t);runner.updateState({coldFault:"stale-and-malformed"});const result=runner.cold();assert.equal(result.status,0,result.stderr);
 const value=JSON.parse(result.stdout);assert.equal(value.cycles.length,1);assert.equal(value.cycles[0].previous_process_id,3001);assert.equal(value.cycles[0].process_id,3002);assert.equal(value.cycles[0].ready_ms,1002100);assert.ok(value.durations_ms[0]>0);released(runner);
});
test("cold launch times out when the signed ready marker omits its readiness digest",(t)=>{
 const runner=fixture(t);runner.updateState({coldFault:"readiness-missing"});
 rejected(runner.cold("let reads=0;Date.now=()=>++reads<3?0:60001;"),"cold_marker_timeout");released(runner);
});

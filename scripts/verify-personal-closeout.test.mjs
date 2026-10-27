import { PNG } from "pngjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, realpathSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import childProcess, { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { syncBuiltinESMExports } from "node:module";
import { phase18DeviceIdentitySha256 } from "./phase18-device-identity.mjs";
import { performanceEvidence, accessibilityEvidence, qualityIdentity } from "./testing/v12-quality-evidence-fixture.mjs";
import { executeV12PerformanceShard } from "./v12-performance-shard.mjs";
import { createV12CalendarNativeFixtureResult } from "./testing/v12-calendar-observation-fixture.mjs";
import { createV12AppFunctionalReadbacks, createV12FunctionalExecutionReceipt, validateV12FunctionalExecutionReceipt } from "./run-v12-maestro.mjs";
import { V12_NATIVE_PROVENANCE_REGISTRY } from "./verify-v12-native-evidence.mjs";
import { createHash } from "node:crypto";
import { createV12RunManifest } from "./create-v12-run-manifest.mjs";
import { V12_SQLITE_SHARD_CASE_IDS } from "./v12-sqlite-shard.mjs";
import { personalCloseoutRecoveryFixture } from "./testing/personal-closeout-recovery-fixture.mjs";
import { resolveV12ProductionVisualConfiguration } from "./v12-production-native-visual-actions.mjs";
import { validatePersonalCloseoutProfile, validatePersonalCloseoutEvidence, runPersonalCloseoutCli, APPROVED_PERSONAL_PROFILE_SHA256, collectPersonalCloseoutAuthority, readPersonalSqliteRecipe, resolvePersonalCloseoutFamily, personalCloseoutExitCode, LEGACY_COMPLETE_GATE, readPersonalCoverageRegistry, RETAINED_TOOL_THRESHOLDS, validatePersonalCoverageProof, personalRetainedCoverageInputScope } from "./verify-personal-closeout.mjs";
const hash = x => createHash("sha256").update(x).digest("hex");
const jhash = x => hash(JSON.stringify(x));
const profile = JSON.parse(readFileSync(".planning/verification/personal-closeout-profile-20261027-v2.json"));
const ids = profile.requirement_ids;
const registry = JSON.parse(readFileSync("src/testing/phase20VisualStateRegistry.json"));
const nativeNonce = "c".repeat(32);
function fixture({complete=false}={}) {
 const files=new Map(); const sources=new Map();
 const bind=(name,value)=>{const bytes=Buffer.isBuffer(value)?value:Buffer.from(typeof value==="string"?value:JSON.stringify(value));files.set(name,bytes);return{path:name,sha256:hash(bytes)};};
 const source={head:"a".repeat(40),tree_sha256:"b".repeat(64),dirty:false,package_json_sha256:"b".repeat(64),package_lock_sha256:"b".repeat(64)};
 const h="b".repeat(64);const contract={planning:Object.fromEntries(["matrix_sha256","requirements_sha256","source_manifest_sha256","owner_brief_sha256","ui_spec_sha256","deviations_sha256"].map(k=>[k,h])),prototype:{revision:18,approval_sha256:h,html_sha256:h},fixtures:{registry_sha256:h}};
 const apk=bind("artifacts/native/v1.2-acceptance/test.apk",Buffer.from("504b0304aabb","hex"));
 const manifest=createV12RunManifest({input:{created_at:"2026-10-27T00:00:00Z",evidence_origin:"native",source,...contract,build:{profile:"development-test",package:"com.fchoo.gymtracker.devtest",version_name:"0.1.0",version_code:1,apk:{...apk,size_bytes:6,page_alignment_verified:true,signature_sha256:h,certificate_sha256:h}},device:{identity_sha256:h,abi:"arm64-v8a",installed_apk_sha256:apk.sha256,settings_sha256:h,restoration_sha256:h},configuration:{id:profile.baseline_configuration}}});
 const native_manifest=bind("artifacts/native/test/build.json",manifest);
 const authority={source,contract,now:Date.parse("2026-10-28T00:00:00Z"),requirementIds:ids,registry:structuredClone(registry),selectors:[],hostOnly:[],verifyNative:()=>true,
  readSource:(head,file)=>{if(!sources.has(head+":"+file))throw new Error("source_missing");return sources.get(head+":"+file);},
  sourceClosure:(_head,tests)=>[...new Set(["package.json","package-lock.json",...tests,...[...sources.keys()].filter(k=>k.startsWith(source.head+":module/")).map(k=>k.slice(41))])].sort(),
  hostAssertion:(_id,file,name,head)=>sources.get(head+":"+file)?.toString().includes(name),
  sqliteRecipe:{categories:V12_SQLITE_SHARD_CASE_IDS.map(id=>({id,sources:[{registry:"sqlite-kernel",ids:["connection-configuration"]}]}))},
  legacyRegistry:()=>[],executableClosure:()=>[],validateShell:()=>[],validateOrigin:()=>true,validateAttended:()=>false,validateFunctional:r=>{assert.equal(r.status,"PASS");return true;},verifySqliteBinary:()=>true,sqliteBinaryPaths:()=>["lib/arm64-v8a/libexpo-sqlite.so"],originalRow:()=>({result:"PASS"}),validateMapping:()=>true};
 const evidence={schema_version:2,profile_id:profile.profile_id,profile_sha256:APPROVED_PERSONAL_PROFILE_SHA256,source_head:source.head,apk_sha256:apk.sha256,apk,native_manifest,requirements:[],ui:[],route_probes:[],critical:{sqlite_artifact:null,sqlite_contract:null,sqlite:[],recovery_artifact:null,recovery_junit:null,recovery:[]},integrity:[]};
 const native=()=>({native_execution:"EXECUTED",run_id:manifest.run_id,nonce:nativeNonce,source_tree_sha256:source.tree_sha256,apk_sha256:apk.sha256,device_identity_sha256:h});
 const read=name=>{if(!files.has(name))throw new Error("missing_file");return files.get(name);};
 const f={files,sources,bind,read,manifest,authority,evidence,native,check:()=>validatePersonalCloseoutEvidence(profile,evidence,read,authority)};
 if(complete){evidence.requirements=ids.map(id=>({id,proofs:[{kind:"original-row"}]})); profile.required_ui_observations.forEach((x,i)=>addCapture(f,x,i));addSqlite(f);addRecovery(f);addRoutes(f);addCoverage(f);}
 return f;
}
function addCapture(f,entry,index=0,{plugin=false,timer=null}={}) {
 const state=f.authority.registry.find(x=>x.id===entry.state_id);const config=resolveV12ProductionVisualConfiguration(entry.configuration_id);
 const material={state_id:state.id,fixture_variant:state.fixture_variant,assertions:state.readiness.source_receipt.assertions,production_instance_id:`phase20-production-instance-${index+1}`,mount_id:`phase20-production-mount-${index+1}`,scroll_offsets:[{native_id:"scroll",x:0,y:0}],timer};
 const source_receipt={schema_version:2,nonce:nativeNonce,...material,digest:jhash(material)};
 const r=state.readiness;
 const observation={native_execution:"EXECUTED",state_id:state.id,configuration_id:config.id,viewport:{width_dp:config.width,height_dp:config.height,density:1},readiness:{status:r.status,source_receipt,semantics:r.semantics.map(value=>({value,matched:true})),test_ids:r.test_ids.map(value=>({value,matched:true})),non_color:r.non_color.map(value=>({value,matched:true})),actions:r.actions.map(x=>({...x,matched:true,enabled:!x.disabled,observed_order:x.order})),order:r.order.map((value,i)=>({value,observed_order:i})),focus:{target:r.focus.target,matched:true}},targets:[{width_dp:48,height_dp:48,overlap:false}]};
 const pngBytes=PNG.sync.write(new PNG({width:config.width,height:config.height}));const png=f.bind(`artifacts/native/test/${index}.png`,pngBytes);
 const state_receipt={schema_version:3,...f.native(),state_id:state.id,configuration_id:config.id,fixture_id:"v12-synthetic-fixtures-r18",readiness_status:r.status,png_sha256:png.sha256,observation_sha256:jhash(observation),source_receipt};delete state_receipt.native_execution;
 const settings={restored:true,privacy:"synthetic-only",state_receipt,observation};
 const raw=plugin?{native_execution:"EXECUTED",fixture_id:"v12-synthetic-fixtures-r18",png_base64:pngBytes.toString("base64"),settings}:{schema_version:3,producer:"v12-visual-capture/v3",run_id:f.manifest.run_id,state_id:state.id,configuration_id:config.id,fixture_id:"v12-synthetic-fixtures-r18",native_execution:"EXECUTED",native_png:{...png,width:config.width,height:config.height,size_bytes:pngBytes.length},settings};
 const capture=f.bind(`artifacts/native/test/${index}.capture.json`,raw);const item={...entry,capture,png};f.evidence.ui.push(item);return{item,raw};
}
function addSqlite(f) {
 const identity={source_digest:f.manifest.source.tree_sha256,fixture_digest:f.manifest.fixtures.registry_sha256,apk_digest:f.evidence.apk_sha256,installed_apk_digest:f.evidence.apk_sha256,device_digest:f.manifest.device.identity_sha256};
 const entries=V12_SQLITE_SHARD_CASE_IDS.map(id=>({id,status:"passed",code:"v12_acceptance_case_passed",counts:{sourceCases:1},sourceFacts:[{registry:"sqlite-kernel",cases:[{id:"connection-configuration",status:"passed"}]}]}));
 const contract={schemaVersion:1,contractVersion:1,status:"passed",total:10,passed:10,failed:0,skipped:0,cases:entries};
 const cases=entries.map((entry,order)=>{const base={identity,id:entry.id,order,code:entry.code,counts:entry.counts,sourceFacts:entry.sourceFacts};return{id:entry.id,status:"passed",order,source_facts:entry.sourceFacts,digests:Object.fromEntries(["pre","post","reopen","rebuild"].map(cut=>[cut,jhash({...base,cut})]))};});
 f.evidence.critical.sqlite_artifact=f.bind("artifacts/native/test/sqlite.json",{schema_version:1,producer:"v12-sqlite-shard",identity,cases});
 f.evidence.critical.sqlite_contract=f.bind("artifacts/native/test/sqlite-contract.json",{producer:"personal-closeout-native-sqlite-contract/v1",...f.native(),contract});
 f.evidence.critical.sqlite=cases.map(x=>({id:x.id,case_sha256:jhash(x)}));return cases;
}
function addRecovery(f) {
 const raw=personalCloseoutRecoveryFixture();const cuts=raw.cases.flatMap(row=>row.cuts.map(cut=>({row,cut,id:`${row.id}:${cut.step_id}:${cut.cut_id}`})));
 const xml='<testsuite>'+cuts.map(({row,cut,id})=>{const properties={case_id:row.id,step_id:cut.step_id,cut_id:cut.cut_id,boundary_id:cut.boundary_id,receipt_kind:cut.receipt_kind,operation_id:cut.operation_id,receipt_sha256:cut.receipt_sha256,barrier_provenance:cut.barrier.provenance,...Object.fromEntries(["barrier_id","process_state","acknowledgement","connectivity","first_attempt"].map(k=>[k,cut.barrier[k]])),...Object.fromEntries(["first_attempt_code","recovery_code","retry_code"].map(k=>[k,cut[k]])),...Object.entries(cut.snapshots).map(([k,v])=>[k+"_sha256",jhash(v)]).reduce((a,[k,v])=>({...a,[k]:v}),{})};return `<testcase name="${id}"><properties>`+Object.entries(properties).map(([k,v])=>`<property name="${k}" value="${v}"/>`).join("")+"</properties></testcase>";}).join("")+"</testsuite>";
 raw.identity={source_digest:f.manifest.source.tree_sha256,receipt_digest:hash(xml),scenario_digest:jhash(raw.cases.map(({id,order,steps})=>({id,order,steps}))),cut_digest:jhash(cuts.map(({cut})=>cut.receipt_sha256)),...Object.fromEntries(["pointer","effect","rest","history","timing","restore","merge_receipt"].map(key=>[key+"_digest",jhash(cuts.map(({cut})=>cut.snapshots.after_retry[key+"_facts"]))])),cue_digest:jhash(cuts.map(({cut})=>cut.snapshots.after_retry.cue_count))};
 const lifecycle={...raw,run_id:f.manifest.run_id};f.evidence.critical.recovery_artifact=f.bind("artifacts/native/test/recovery.json",lifecycle);f.evidence.critical.recovery_junit=f.bind("artifacts/native/test/recovery.xml",xml);f.evidence.critical.recovery=cuts.map(x=>({id:x.id,receipt_sha256:x.cut.receipt_sha256}));return lifecycle;
}
const routes={"settings-production-provider":["/","settings-appearance-group","app/(tabs)/_layout.tsx"],"removed-sessions-production-provider":["/more/removed-sessions","Removed sessions","app/more/removed-sessions.tsx"],"backup-options":["/more/manual-encrypted-backup","Manual encrypted backup","app/more/manual-encrypted-backup.tsx"],"restore-review":["/more/data-and-recovery","restore-clean-action","app/more/data-and-recovery.tsx"],"completed-session-detail":["/session/test","Workout details","app/session/[sessionId].tsx"],"history-correction":["/session/test/correct","session-correction-screen","app/session/[sessionId]/correct.tsx"],"completion-readback":["/completion/test","workout-completion-context-card","app/completion/[sessionId].tsx"],"toast-after-confirmed-action":["/workout/test","semantic-toast","app/workout/[sessionId].tsx"]};
function addRoutes(f){for(const id of profile.required_route_probes){const [route,screen,source]=routes[id];for(const file of [source,'app/_layout.tsx'])f.sources.set(f.authority.source.head+':'+file,Buffer.from('normal source'));const semantic=f.bind(`artifacts/native/test/${id}.xml`,`<hierarchy><node package="${f.manifest.build.package}" resource-id="${screen}"/></hierarchy>`);const nonce=id==="toast-after-confirmed-action"?"f".repeat(48):nativeNonce;const command=f.bind(`artifacts/native/test/${id}.command.json`,{schema_version:1,producer:"v12-maestro-functional-command/v1",shard:"workout",case_id:"workout.test",execution_receipt:{nonce,status:"PASS"}});f.evidence.route_probes.push({id,artifact:f.bind(`artifacts/native/test/${id}.route.json`,{schema_version:1,producer:"personal-closeout-normal-route-trace/v1",...f.native(),nonce,probe_id:id,route,package:f.manifest.build.package,foreground_package:f.manifest.build.package,root_layout_sha256:hash(Buffer.from('normal source')),route_source_sha256:hash(Buffer.from('normal source')),semantic,semantic_sha256:semantic.sha256,command,status:"PASS"})});}}
function addHost(f,{id="WRK-01",runner="jest",module="module/source.ts",old=false}={}) {
 const test_file="tests/test.test.mjs";const full_name=id+" source result commits";
 const testFiles=[test_file];const inputs=["package.json","package-lock.json",test_file,module].sort().map(name=>{const bytes=Buffer.from(name===test_file?`test('${full_name}',()=>{});`:'source');f.sources.set(f.authority.source.head+":"+name,bytes);if(old)f.sources.set("e".repeat(40)+":"+name,bytes);return{path:name,sha256:hash(bytes)};});
 const requiredInputs=inputs.map(x=>x.path);f.authority.sourceClosure=()=>requiredInputs;
 const report=runner==="jest"?{success:true,numTotalTests:1,numPassedTests:1,numFailedTests:0,numPendingTests:0,numTodoTests:0,testResults:[{name:test_file,status:"passed",assertionResults:[{status:"passed",fullName:full_name}]}]}:`TAP version 13\nok 1 - ${full_name}\n1..1\n# tests 1\n# pass 1\n# fail 0\n# skipped 0\n# todo 0\n`;
 const receipt={schema_version:1,producer:"personal-closeout-host-execution/v1",source_head:old?"e".repeat(40):f.authority.source.head,started_at:"2026-10-27T01:00:00Z",finished_at:"2026-10-27T01:00:01Z",runner,test_files:testFiles,source_inputs:inputs,report:f.bind(`artifacts/native/test/${id}.host.json`,report),coverage_artifacts:[]};
 if(old){const ledger=f.bind('artifacts/native/test/ledger.json',{producer:"personal-closeout-retained-host-ledger/v1",source_head:receipt.source_head,execution_sha256:jhash({...receipt,inheritance:null}),report_sha256:receipt.report.sha256,inputs_sha256:jhash(inputs)});receipt.inheritance={source_head:receipt.source_head,current_head:f.authority.source.head,ledger,inputs};}
 const execution=f.bind(`artifacts/native/test/${id}.execution.json`,receipt);return{receipt,execution,proof:{kind:"host-assertion",execution,test_file,full_name}};
}
function addCoverage(f,{all=true,runner="jest",old=false}={}) {
 const id=profile.critical_integrity_files[0];const host=addHost(f,{id:"COVERAGE",runner,module:id,old});
 const modules=all?profile.critical_integrity_files:[id];
 for(const module of modules){if(!host.receipt.source_inputs.some(x=>x.path===module)){const bytes=Buffer.from('source');f.sources.set(f.authority.source.head+":"+module,bytes);host.receipt.source_inputs.push({path:module,sha256:hash(bytes)});if(old)f.sources.set("e".repeat(40)+":"+module,bytes);}}
 const requiredCoverageInputs=host.receipt.source_inputs.map(x=>x.path);f.authority.sourceClosure=()=>requiredCoverageInputs;
 const location={start:{line:1,column:0},end:{line:1,column:6}};
 const raw=Object.fromEntries(modules.map(module=>[module,{path:module,statementMap:{"0":location},fnMap:{"0":{name:"f",decl:location,loc:location,line:1}},branchMap:{"0":{loc:location,type:"if",locations:[location,location],line:1}},s:{"0":1},f:{"0":1},b:{"0":[1,1]}}]));
 const coverage_artifact=f.bind('artifacts/native/test/coverage-final.json',raw);host.receipt.coverage_artifacts=[coverage_artifact];
 if(old){const ledger=parse(f.read(host.receipt.inheritance.ledger.path));ledger.execution_sha256=jhash({...host.receipt,inheritance:null});ledger.inputs_sha256=jhash(host.receipt.source_inputs);host.receipt.inheritance.inputs=host.receipt.source_inputs;host.receipt.inheritance.ledger=f.bind(host.receipt.inheritance.ledger.path,ledger);}
 host.execution=f.bind(host.execution.path,host.receipt);
 f.evidence.integrity=modules.map(module=>({id:module,execution:host.execution,source_inputs:host.receipt.source_inputs,coverage_artifact}));return{raw,host,coverage_artifact};
}
const parse=bytes=>JSON.parse(bytes.toString('utf8'));
function mutateArtifact(f,binding,change){const raw=parse(f.read(binding.path));change(raw);return f.bind(binding.path,raw);}
test('approved profile exact hash and complete partition remain intact',()=>{assert.equal(validatePersonalCloseoutProfile(profile,ids),profile);assert.equal(jhash(profile),APPROVED_PERSONAL_PROFILE_SHA256);});
test('pure validation requires independent trusted authority; v1 synthetic acceptance is rejected',()=>{const f=fixture();assert.throws(()=>validatePersonalCloseoutEvidence(profile,f.evidence,f.read),/personal_closeout_/);f.evidence.schema_version=1;assert.throws(f.check,/evidence_invalid/);});
test('missing required evidence remains incomplete',()=>{const f=fixture();const result=f.check();assert.equal(result.status,'NOT_READY');assert.equal(result.completed_ui,0);assert.equal(result.completed_recovery,0);assert.equal(result.missing_ui.length,153);assert.equal(result.missing_sqlite.length,10);assert.equal(result.exhaustive_matrix_passed,false);assert.equal(result.release_authorized,false);});
test('complete typed fixture validates only within explicit trusted test authority, never native release',()=>{const f=fixture({complete:true});const result=f.check();assert.equal(result.status,'PERSONAL_USE_VERIFIED');assert.equal(result.completed_ui,153);assert.equal(result.completed_recovery,112);assert.equal(result.exhaustive_matrix_passed,false);assert.equal(result.release_authorized,false);});
for(const [label,change] of [
 ['generic row PASS',f=>f.evidence.requirements.push({id:'WRK-01',status:'PASS',artifacts:[]})],
 ['generic coverage100',f=>{const c=addCoverage(f,{all:false});f.evidence.integrity[0].coverage_artifact=f.bind(c.coverage_artifact.path,{metrics:{lines:100,statements:100,branches:100,functions:100}});c.host.receipt.coverage_artifacts=[f.evidence.integrity[0].coverage_artifact];f.evidence.integrity[0].execution=f.bind(c.host.execution.path,c.host.receipt);} ],
 ['synthetic recovery',f=>{f.evidence.critical.recovery_artifact=f.bind('artifacts/native/test/fixture.json',personalCloseoutRecoveryFixture());f.evidence.critical.recovery_junit=f.bind('artifacts/native/test/empty.xml','<testsuite/>');}],
 ['naked sqlite labels',f=>f.evidence.critical.sqlite.push({id:'fresh-migration',status:'PASS',artifacts:[]})],
 ['untrusted source',f=>{f.evidence.source_head='e'.repeat(40);}],
 ['wrong APK',f=>{f.evidence.apk_sha256='e'.repeat(64);}],
 ['future manifest',f=>{f.evidence.native_manifest=mutateArtifact(f,f.evidence.native_manifest,m=>{m.created_at='2026-10-29T00:00:00Z';m.run_id='phase20-20261029T000000Z-'+m.source.head.slice(0,12);});}],
 ['stale tree',f=>{f.authority.source={...f.authority.source,tree_sha256:'e'.repeat(64)};}],
 ['failed native authority',f=>{f.authority.verifyNative=()=>false;}],
 ['missing authority callback',f=>{delete f.authority.verifyNative;}],
 ['contract identity',f=>{f.authority.contract={...f.authority.contract,fixtures:{registry_sha256:'e'.repeat(64)}};}],
])test('rejects '+label,()=>{const f=fixture();change(f);assert.throws(f.check);});
for(const [label,change] of [
 ['tiny image',x=>{x.bytes=PNG.sync.write(new PNG({width:2,height:2}));}],
 ['wrong source',x=>{x.raw.settings.state_receipt.source_tree_sha256='e'.repeat(64);}],
 ['unexecuted',x=>{x.raw.native_execution='NOT_RUN';}],
 ['wrong dimensions',x=>{x.raw.settings.observation.viewport.width_dp=999;}],
 ['not restored',x=>{x.raw.settings.restored=false;}],
 ['proof mounted',x=>{x.raw.settings.state_receipt.source_receipt.production_instance_id='phase14-toast-proof';}],
 ['wrong semantics',x=>{x.raw.settings.observation.readiness.semantics[0].matched=false;}],
 ['wrong image hash',x=>{x.raw.settings.state_receipt.png_sha256='e'.repeat(64);}],
 ['wrong state',x=>{x.raw.settings.state_receipt.state_id='BW-002';}],
 ['wrong observation hash',x=>{x.raw.settings.state_receipt.observation_sha256='e'.repeat(64);}],
 ['wrong fixture',x=>{x.raw.fixture_id='fixture-only';}],
 ['wrong nonce',x=>{x.raw.settings.state_receipt.nonce='bad';}],
 ['wrong PNG binding',x=>{x.raw.native_png.width=2;}],
])test('UI rejects '+label,()=>{const f=fixture();const x=addCapture(f,profile.required_ui_observations[0]);change(x);if(x.bytes){x.item.png=f.bind(x.item.png.path,x.bytes);x.raw.settings.state_receipt.png_sha256=x.item.png.sha256;}x.item.capture=f.bind(x.item.capture.path,x.raw);assert.throws(f.check);});
test('actual plugin shape and running/paused/idle/expired timer source receipts validate',()=>{for(const timer of [null,{state:'running',revision:1,remaining_ms:null,ends_at_ms:10},{state:'paused',revision:1,remaining_ms:10,ends_at_ms:null},{state:'idle',revision:0,remaining_ms:null,ends_at_ms:null},{state:'expired',revision:2,remaining_ms:null,ends_at_ms:null}]){const f=fixture();addCapture(f,profile.required_ui_observations[0],0,{plugin:true,timer});assert.equal(f.check().completed_ui,1);}});
test('tampered plugin base64 and malformed timer are rejected',()=>{for(const change of [x=>{x.raw.png_base64='AA==';},x=>{x.raw.settings.state_receipt.source_receipt.timer={state:'running',revision:1,remaining_ms:1,ends_at_ms:null};}]){const f=fixture();const x=addCapture(f,profile.required_ui_observations[0],0,{plugin:true});change(x);x.item.capture=f.bind(x.item.capture.path,x.raw);assert.throws(f.check);}});
test('typed host assertion validates consumer-owned mapping and actual source/input/rawJest/TAP',()=>{for(const runner of ['jest','node-tap']){const f=fixture();const h=addHost(f,{runner});f.evidence.requirements=[{id:'WRK-01',proofs:[h.proof]}];assert.ok(!f.check().missing_requirements.includes('WRK-01'));f.authority.hostAssertion=()=>false;assert.throws(f.check,/assertion_mapping_invalid/);}});
test('host inherited old source keeps identity and proves complete input/ledger/raw report chain',()=>{const f=fixture();const h=addHost(f,{old:true});f.authority.hostOnly=['WRK-01'];f.evidence.requirements=[{id:'WRK-01',proofs:[h.proof]}];assert.ok(!f.check().missing_requirements.includes('WRK-01'));f.sources.set(f.authority.source.head+':module/source.ts',Buffer.from('changed'));assert.throws(f.check,/source_inputs_changed/);});
for(const [label,change] of [
 ['failed tests',h=>{h.raw.success=false;}],['skipped tests',h=>{h.raw.numPendingTests=1;}],['unrelated assertion',h=>{h.raw.testResults[0].assertionResults[0].fullName='other';}],
 ['source missing',h=>{h.receipt.source_inputs.pop();}],['future test receipt',h=>{h.receipt.finished_at='2027-10-27T00:00:01Z';}],['missing file',h=>{h.receipt.test_files=[];}],['unlinked title',h=>{h.proof.full_name='wrong';}],
])test('host rejects '+label,()=>{const f=fixture();const h=addHost(f);h.raw=parse(f.read(h.receipt.report.path));change(h);h.receipt.report=f.bind(h.receipt.report.path,h.raw);h.proof.execution=f.bind(h.execution.path,h.receipt);f.evidence.requirements=[{id:'WRK-01',proofs:[h.proof]}];assert.throws(f.check);});
for(const [label,change] of [
 ['wrong sqlite index',f=>{addSqlite(f);f.evidence.critical.sqlite[0].case_sha256='e'.repeat(64);}],
 ['wrong SQLite source',f=>{addSqlite(f);f.evidence.critical.sqlite_artifact=mutateArtifact(f,f.evidence.critical.sqlite_artifact,x=>{x.identity.source_digest='e'.repeat(64);});}],
 ['failed raw SQLite',f=>{addSqlite(f);f.evidence.critical.sqlite_contract=mutateArtifact(f,f.evidence.critical.sqlite_contract,x=>{x.contract.cases[0].status='failed';});}],
 ['wrong recovery index',f=>{addRecovery(f);f.evidence.critical.recovery[0].receipt_sha256='e'.repeat(64);}],
 ['wrong recovery run',f=>{addRecovery(f);f.evidence.critical.recovery_artifact=mutateArtifact(f,f.evidence.critical.recovery_artifact,x=>{x.run_id='wrong';});}],
 ['wrong recovery JUnit',f=>{addRecovery(f);const b=f.evidence.critical.recovery_junit;f.evidence.critical.recovery_junit=f.bind(b.path,f.read(b.path).toString().replace('receipt_sha256','wrong_sha256'));}],
])test('critical proof rejects '+label,()=>{const f=fixture();change(f);assert.throws(f.check);});
test('missing recovery indices stay incomplete despite whole successful lifecycle',()=>{const f=fixture();addRecovery(f);f.evidence.critical.recovery.pop();assert.equal(f.check().completed_recovery,111);assert.equal(f.check().status,'NOT_READY');});
test('coverage derives exact four metrics from module scoped raw counters, not summary labels',()=>{const f=fixture();const x=addCoverage(f,{all:false});assert.ok(!f.check().missing_requirements.includes('coverage:'+profile.critical_integrity_files[0]));x.raw[profile.critical_integrity_files[0]].b[0][1]=0;const item=f.evidence.integrity[0];item.coverage_artifact=f.bind(item.coverage_artifact.path,x.raw);x.host.receipt.coverage_artifacts=[item.coverage_artifact];item.execution=f.bind(item.execution.path,x.host.receipt);assert.ok(f.check().missing_requirements.includes('coverage:'+item.id));});
test('coverage cannot be reused for another source module or unlink execution',()=>{for(const change of [f=>{f.evidence.integrity[0].id=profile.critical_integrity_files[1];},f=>{f.evidence.integrity[0].source_inputs=[];},f=>{const item=f.evidence.integrity[0];item.execution=mutateArtifact(f,item.execution,x=>{x.coverage_artifacts=[];});}]){const f=fixture();addCoverage(f,{all:false});change(f);assert.throws(f.check);}});
test('native route proof rejects proof routes and failed command results remain nonpass',()=>{const f=fixture();addRoutes(f);const item=f.evidence.route_probes[0];item.artifact=mutateArtifact(f,item.artifact,x=>{x.route='/__phase14-toast-proof';});assert.throws(f.check);const g=fixture();addRoutes(g);const r=g.evidence.route_probes[0];r.artifact=mutateArtifact(g,r.artifact,x=>{x.status='FAIL';});assert.ok(g.check().missing_requirements.includes('route:'+r.id));});
test('native functional rows cannot substitute visual only or another case',()=>{const f=fixture();f.authority.selectors=[{row_id:'WRK-01',selector:{type:'functional-case',shard:'workout',id:'workout.test'}}];const mapping={case_ids:['workout.test'],observations:[{report_sha256:hash('<testsuite><testcase name="workout.test"/></testsuite>')}]};const p={kind:'native-functional',shard:'workout',case_id:'workout.test',mapping:f.bind('artifacts/native/test/mapping.json',mapping),junit:f.bind('artifacts/native/test/native.xml','<testsuite><testcase name="workout.test"/></testsuite>')};f.evidence.requirements=[{id:'WRK-01',proofs:[p]}];assert.ok(!f.check().missing_requirements.includes('WRK-01'));p.case_id='garmin-synced';assert.throws(f.check,/requirement_scope_invalid/);});
test('source authority controls original rows and unsupported producers remain explicitly incomplete',()=>{const f=fixture();f.evidence.requirements=[{id:'GAR-01',proofs:[{kind:'original-row'}]}];f.authority.originalRow=()=>null;assert.ok(f.check().missing_requirements.includes('GAR-01'));});
test('profile mutations with unchanged counts, critical substitutions and empty rules cannot pass',()=>{for(const change of [p=>{const a=p.required_ui_observations[0];const b=p.deferred_ui_observations[0];p.required_ui_observations[0]={state_id:b.state_id,configuration_id:b.configuration_id};p.deferred_ui_observations[0]={...a,disposition:'DEFERRED',reason:b.reason};},p=>{p.critical_integrity_files[0]='src/other.ts';},p=>{p.required_route_probes[0]='proof-route';},p=>{p.evidence_rules={};},p=>{p.approval.date='2026-10-26';}]){const p=structuredClone(profile);change(p);assert.throws(()=>validatePersonalCloseoutProfile(p,ids),/profile_invalid/);}assert.throws(()=>validatePersonalCloseoutProfile(profile,[]),/requirements_invalid/);});
test('artifact hashes/paths and schema reject malicious or changed bindings',()=>{for(const change of [f=>{f.evidence.apk.path='../bad';},f=>{f.evidence.apk.path='/bad';},f=>{f.evidence.apk.path='.coverage';},f=>{f.evidence.apk.sha256='bad';},f=>{f.files.set(f.evidence.apk.path,Buffer.from('changed'));},f=>{f.evidence.apk.path='x\\bad';},f=>{f.evidence.requirements=null;}]){const f=fixture();change(f);assert.throws(f.check);}});
test('CLI rejects invalid arguments/unsafe/symlink evidence before source/native collection',()=>{assert.throws(()=>runPersonalCloseoutCli([]),/arguments_invalid/);assert.throws(()=>runPersonalCloseoutCli(['--wrong','x']),/arguments_invalid/);const root=mkdtempSync(path.join(tmpdir(),'personal-profile-cli-'));try{writeFileSync(path.join(root,'evidence.json'),'{}');assert.throws(()=>runPersonalCloseoutCli(['--evidence','../evidence.json'],process,root),/binding_invalid/);symlinkSync(path.join(root,'evidence.json'),path.join(root,'link.json'));assert.throws(()=>runPersonalCloseoutCli(['--evidence','link.json'],process,root),/binding_invalid/);assert.throws(()=>runPersonalCloseoutCli(['--evidence','evidence.json'],process,root));const run=spawnSync(process.execPath,[path.resolve('scripts/verify-personal-closeout.mjs'),'--wrong'],{encoding:'utf8'});assert.equal(run.status,1);assert.match(run.stderr,/arguments_invalid/);}finally{rmSync(root,{recursive:true,force:true});}});

const recipe = readPersonalSqliteRecipe(file => readFileSync(file));
test('static recipe reads the actual ten category declarations and fifty fresh cases without executing TypeScript',()=>{
 assert.equal(recipe.categories.length,10);assert.equal(recipe.registries['portable-merge'].length+recipe.registries['multi-plan-running'].length+recipe.registries['progress-parity'].length,50);
 assert.equal(recipe.registries['garmin-acceptance'].length,9);
 assert.throws(()=>readPersonalSqliteRecipe(()=>Buffer.from('const SOURCE_CASES = bad(')),/recipe_source_invalid/);
 assert.throws(()=>readPersonalSqliteRecipe(file=>Buffer.from(readFileSync(file,'utf8').replace('source("sqlite-kernel", ["connection-configuration", "foreign-key-enforcement"])','new Set()'))),/recipe_source_invalid/);
});
function addComposition(f){
 const run='artifacts/native/v1.2/phase20-20261024T132356Z-136882436441';const old=parse(readFileSync(run+'/build.json'));f.authority.sqliteRecipe=recipe;
 const oldApk=f.bind('artifacts/native/test/retained.apk',readFileSync(old.build.apk.path));const publication=f.bind(run+'/publication/sqlite.json',readFileSync(run+'/publication/sqlite.json'));
 const members=['migration','portability','history'].map(group=>f.bind(run+`/sqlite/${group}.json`,readFileSync(run+`/sqlite/${group}.json`)));
 const source_inputs=['src/testing/contracts/sqliteKernel.contract.ts','src/testing/contracts/migrationsEffects.contract.ts','src/testing/contracts/googleDriveBackup.contract.ts'].map(file=>{
  const bytes=readFileSync(file);f.sources.set(old.source.head+':'+file,bytes);f.sources.set(f.authority.source.head+':'+file,bytes);return{path:file,sha256:hash(bytes)};
 });f.authority.sourceClosure=()=>source_inputs.map(x=>x.path);
 const recipeFile='src/testing/contracts/v12Acceptance.contract.ts';const recipeBytes=readFileSync(recipeFile);f.sources.set(old.source.head+':'+recipeFile,recipeBytes);f.sources.set(f.authority.source.head+':'+recipeFile,recipeBytes);
 const binary=f.bind('artifacts/native/test/sqlite.so','ELF fixture');
 const retained={manifest:f.bind(run+'/build.json',old),publication,members,source_inputs,apk:oldApk,native_sqlite_binaries:[{archive_path:'lib/arm64-v8a/libexpo-sqlite.so',old:binary,current:binary}]};
 const registries=['portable-merge','multi-plan-running','progress-parity'].map(id=>{const expected=recipe.registries[id];const contract={status:'passed',total:expected.length,passed:expected.length,failed:0,skipped:0,cases:expected.map(caseId=>({id:caseId,status:'passed'}))};return{id,artifact:f.bind(`artifacts/native/test/${id}.json`,{producer:'personal-closeout-native-registry/v1',registry:id,...f.native(),contract})};});
 const composition={producer:'personal-closeout-native-sqlite-composition/v1',...f.native(),retained,registries};f.evidence.critical.sqlite_contract=f.bind('artifacts/native/test/sqlite-contract.json',composition);
 const identity={source_digest:f.manifest.source.tree_sha256,fixture_digest:f.manifest.fixtures.registry_sha256,apk_digest:f.evidence.apk_sha256,installed_apk_digest:f.evidence.apk_sha256,device_digest:f.manifest.device.identity_sha256};
 // Preserve actual retained fixture identity, independently trusted in this test context.
 const adjusted={...f.manifest,fixtures:{registry_sha256:old.fixtures.registry_sha256}};f.manifest=adjusted;f.authority.contract.fixtures={registry_sha256:old.fixtures.registry_sha256};f.evidence.native_manifest=f.bind(f.evidence.native_manifest.path,adjusted);identity.fixture_digest=old.fixtures.registry_sha256;
 const entries=recipe.categories.map(definition=>{const sourceFacts=definition.sources.map(source=>({registry:source.registry,cases:source.ids.map(id=>({id,status:'passed'}))}));return{id:definition.id,status:'passed',code:'v12_acceptance_case_passed',counts:{sourceCases:sourceFacts.reduce((n,x)=>n+x.cases.length,0)},sourceFacts};});
 const cases=entries.map((entry,order)=>{const base={identity,id:entry.id,order,code:entry.code,counts:entry.counts,sourceFacts:entry.sourceFacts};return{id:entry.id,status:'passed',order,source_facts:entry.sourceFacts,digests:Object.fromEntries(['pre','post','reopen','rebuild'].map(cut=>[cut,jhash({...base,cut})]))};});
 f.evidence.critical.sqlite_artifact=f.bind('artifacts/native/test/sqlite.json',{schema_version:1,producer:'v12-sqlite-shard',identity,cases});f.evidence.critical.sqlite=cases.map(x=>({id:x.id,case_sha256:jhash(x)}));return composition;
}
test('fifty actual source registries plus retained unchanged native facts recompose all ten categories without rerun',()=>{const f=fixture();addComposition(f);assert.deepEqual(f.check().missing_sqlite,[]);});
for(const [label,change] of [
 ['retained source changed',(f,c)=>{f.sources.set(f.authority.source.head+':src/testing/contracts/googleDriveBackup.contract.ts',Buffer.from('changed'));}],
 ['recipe changed',(f,c)=>{f.sources.set(f.authority.source.head+':src/testing/contracts/v12Acceptance.contract.ts',Buffer.from('changed'));}],
 ['missing binary',(f,c)=>{c.retained.native_sqlite_binaries=[];}],
 ['wrong binary scope',(f,c)=>{c.retained.native_sqlite_binaries[0].archive_path='lib/arm64-v8a/libother.so';}],
 ['failed registry',(f,c)=>{c.registries[0].artifact=mutateArtifact(f,c.registries[0].artifact,x=>{x.contract.cases[0].status='failed';});}],
 ['wrong registry count',(f,c)=>{c.registries[0].artifact=mutateArtifact(f,c.registries[0].artifact,x=>{x.contract.total=1;});}],
 ['different device',(f,c)=>{c.registries[0].artifact=mutateArtifact(f,c.registries[0].artifact,x=>{x.device_identity_sha256='e'.repeat(64);});}],
 ['publication tamper',(f,c)=>{c.retained.publication=mutateArtifact(f,c.retained.publication,x=>{x.completed=false;});}],
 ['member hash changed',(f,c)=>{c.retained.members[0].sha256='e'.repeat(64);}],
 ['missing registry',(f,c)=>{c.registries.pop();}],
])test('composition rejects '+label,()=>{const f=fixture();const c=addComposition(f);change(f,c);f.evidence.critical.sqlite_contract=f.bind(f.evidence.critical.sqlite_contract.path,c);assert.throws(f.check);});
test('host executed working-tree input snapshots bind to completed commit without misreporting checkout HEAD',()=>{const f=fixture();const host=addHost(f);const context='e'.repeat(40);f.sources.set(context+':package.json',Buffer.from('old context'));host.receipt.tested_source_head=host.receipt.source_head;host.receipt.source_head=context;host.receipt.input_snapshot_before=f.bind('artifacts/native/test/before.json',{execution_context_head:context,source_inputs:host.receipt.source_inputs});host.receipt.input_snapshot_after=f.bind('artifacts/native/test/after.json',{execution_context_head:context,source_inputs:host.receipt.source_inputs,report_sha256:host.receipt.report.sha256});host.proof.execution=f.bind(host.execution.path,host.receipt);f.evidence.requirements=[{id:'WRK-01',proofs:[host.proof]}];assert.ok(!f.check().missing_requirements.includes('WRK-01'));host.receipt.input_snapshot_after=mutateArtifact(f,host.receipt.input_snapshot_after,x=>{x.report_sha256='d'.repeat(64);});host.proof.execution=f.bind(host.execution.path,host.receipt);assert.throws(f.check,/tested_snapshot_invalid/);});
test('supplemental manifests retain physical device identity and cannot change frozen source/APK',()=>{const f=fixture();let verified=[];f.authority.verifyNative=m=>{verified.push(m.device.identity_sha256);return true;};const second={...f.manifest,device:{...f.manifest.device,identity_sha256:'e'.repeat(64)}};f.evidence.requirements=[{id:'GAR-01',proofs:[{kind:'original-row',native_manifest:f.bind('artifacts/native/test/phone.json',second)}]}];assert.throws(f.check,/requirement_evidence_invalid/); // unsupported original-row cannot smuggle a native manifest
 const g=fixture();g.authority.selectors=[{row_id:'WRK-01',selector:{type:'functional-case',shard:'workout',id:'workout.test'}}];g.authority.verifyNative=m=>{verified.push(m.device.identity_sha256);return true;};const foreign={...g.manifest,device:{...g.manifest.device,identity_sha256:'e'.repeat(64)}};g.evidence.requirements=[{id:'WRK-01',proofs:[{kind:'native-functional',shard:'workout',case_id:'workout.test',native_manifest:g.bind('artifacts/native/test/phone.json',foreign),mapping:g.bind('artifacts/native/test/m.json',{case_ids:['workout.test'],observations:[{report_sha256:hash('<testsuite><testcase name="workout.test"/></testsuite>')}]}),junit:g.bind('artifacts/native/test/m.xml','<testsuite><testcase name="workout.test"/></testsuite>')}]}];g.check();assert.ok(verified.includes('e'.repeat(64)));g.evidence.requirements[0].proofs[0].native_manifest=mutateArtifact(g,g.evidence.requirements[0].proofs[0].native_manifest,m=>{m.source.tree_sha256='f'.repeat(64);});assert.throws(g.check,/supplemental_identity_invalid/);});
test('profile gates rely on the separately validated complete selected matrix and integrity checks',()=>{const f=fixture();f.authority.selectors=ids.map(id=>({row_id:id,selector:{type:'phase20-gate'}}));f.evidence.requirements=[{id:'VER-03',proofs:[{kind:'profile-gate'}]}];const result=f.check();assert.equal(result.status,'NOT_READY');assert.equal(result.missing_ui.length,153);assert.ok(!result.missing_requirements.includes('VER-03'));f.evidence.requirements[0].id='VER-11';assert.throws(f.check,/requirement_scope_invalid/);});
test('normal-route toast requires a real functional command and read-only routes require exact source hashes',()=>{const f=fixture();addRoutes(f);const toast=f.evidence.route_probes.at(-1);toast.artifact=mutateArtifact(f,toast.artifact,r=>{r.command=null;});assert.ok(f.check().missing_requirements.includes('route:'+toast.id));const g=fixture();addRoutes(g);g.evidence.route_probes[0].artifact=mutateArtifact(g,g.evidence.route_probes[0].artifact,r=>{r.root_layout_sha256='e'.repeat(64);});assert.throws(g.check,/route_evidence_invalid/);});

test('Node spec raw bytes and full integer coverage summaries are accepted without inventing TAP',()=>{const f=fixture();const host=addHost(f);const spec=`✔ ${host.proof.full_name} (1.234ms)\nℹ tests 1\nℹ pass 1\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 1.5\n`;host.receipt.runner='node-spec';host.receipt.report=f.bind(host.receipt.report.path,spec);host.proof.execution=f.bind(host.execution.path,host.receipt);f.evidence.requirements=[{id:'WRK-01',proofs:[host.proof]}];assert.ok(!f.check().missing_requirements.includes('WRK-01'));host.receipt.report=f.bind(host.receipt.report.path,spec.replace('ℹ skipped 0','ℹ skipped 1'));host.proof.execution=f.bind(host.execution.path,host.receipt);assert.throws(f.check,/host_result_invalid/);
 const g=fixture();const c=addCoverage(g,{all:false});const id=g.evidence.integrity[0].id;const metrics=Object.fromEntries(['statements','branches','functions','lines'].map(k=>[k,{total:4,covered:4,skipped:0,pct:100}]));const value={files:{[id]:metrics},failures:[]};const entry=g.evidence.integrity[0];entry.coverage_artifact=g.bind(entry.coverage_artifact.path,value);c.host.receipt.coverage_artifacts=[entry.coverage_artifact];entry.execution=g.bind(entry.execution.path,c.host.receipt);assert.ok(!g.check().missing_requirements.includes('coverage:'+id));value.files[id].branches.covered=3;value.files[id].branches.pct=75;entry.coverage_artifact=g.bind(entry.coverage_artifact.path,value);c.host.receipt.coverage_artifacts=[entry.coverage_artifact];entry.execution=g.bind(entry.execution.path,c.host.receipt);assert.ok(g.check().missing_requirements.includes('coverage:'+id));});

function family(f,id,kind,raw,extra={}){f.authority.selectors=[{row_id:id,selector:{type:id.startsWith('PRO')?'progress-contract':id.startsWith('SHL')?'shell-requirement':id.startsWith('CAL')?'calendar-requirement':id.startsWith('GAR')?'garmin-requirement':'phase20-gate',shard:'sqlite-source',id:'progress-pro01-sport-range',stage_ids:['calendar-month']}}];f.evidence.requirements=[{id,proofs:[{kind,artifact:f.bind('artifacts/native/test/family.json',raw),...extra}]}];return()=>f.check();}
test('progress family derives its actual source-owned eighteen case map and rejects generic/missing hashes',()=>{const f=fixture();f.authority.sqliteRecipe=recipe;const ids=recipe.registries['progress-parity'];const raw={producer:'personal-closeout-native-registry/v1',registry:'progress-parity',...f.native(),contract:{status:'passed',total:18,passed:18,failed:0,skipped:0,cases:ids.map((id,i)=>({id,status:'passed',requirement:`PRO-${String(i+1).padStart(2,'0')}`,counts:{sources:1},hashes:{source:'e'.repeat(64)}}))}};const check=family(f,'PRO-01','native-progress',raw);assert.ok(!check().missing_requirements.includes('PRO-01'));raw.contract.cases[0].status='failed';f.evidence.requirements[0].proofs[0].artifact=f.bind('artifacts/native/test/family.json',raw);assert.ok(check().missing_requirements.includes('PRO-01'));raw.contract.cases[0].hashes.source='bad';f.evidence.requirements[0].proofs[0].artifact=f.bind('artifacts/native/test/family.json',raw);assert.throws(check,/progress_case_invalid/);});
test('shell consumer uses separately trusted strict source validation and does not accept a naked shell result',()=>{const f=fixture();const m=f.bind('artifacts/native/test/phase14.json',{});f.authority.validateShell=()=>[{requirement_id:'SHL-01',result:'PASS'}];const check=family(f,'SHL-01','native-shell',{}, {phase14_manifest:m});assert.ok(!check().missing_requirements.includes('SHL-01'));f.authority.validateShell=()=>[];assert.ok(check().missing_requirements.includes('SHL-01'));});
test('calendar raw native family binds rich stage/probe/image receipts and exact source fixture without global UI matrix',()=>{const f=fixture();for(const file of ['maestro/v1.2/calendar.yaml','maestro/v1.2/calendar-requirements.yaml','src/testing/phase20CalendarFixture.ts'])f.sources.set(f.authority.source.head+':'+file,readFileSync(file));const flowSha256=hash(readFileSync('maestro/v1.2/calendar.yaml'));const requirementsFlowSha256=hash(readFileSync('maestro/v1.2/calendar-requirements.yaml'));const fixtureSourceSha256=hash(readFileSync('src/testing/phase20CalendarFixture.ts'));const raw=createV12CalendarNativeFixtureResult({flowSha256,requirementsFlowSha256,fixtureSourceSha256,attestation:{run_id:f.manifest.run_id,source_tree_sha256:f.manifest.source.tree_sha256,apk_sha256:f.evidence.apk_sha256,installed_apk_sha256:f.evidence.apk_sha256,apk_signature_sha256:f.manifest.build.apk.signature_sha256,device_identity_sha256:f.manifest.device.identity_sha256},launcherSourceSha256:'e'.repeat(64)});raw.execution_origin={schema_version:1,action:'calendar',kind:'production-default-launcher',toolchain_origin:'production-attested/v1',default_launcher:true,test_only:false,adapter_source_sha256:'e'.repeat(64),launcher_source_sha256:'e'.repeat(64),domain_source_sha256:'e'.repeat(64),request_attestation_sha256:'e'.repeat(64)};const check=family(f,'CAL-01','native-calendar',raw);f.authority.selectors[0].selector.stage_ids=['month-year-boundary','leap-february','four-row-month','five-row-month','six-row-month'];assert.ok(!check().missing_requirements.includes('CAL-01'));f.evidence.requirements[0].id='VER-09';f.authority.selectors[0].row_id='VER-09';f.authority.selectors[0].selector.type='phase20-gate';assert.ok(check().missing_requirements.includes('VER-09'));raw.native_receipt.device_identity_sha256='e'.repeat(64);f.evidence.requirements[0].proofs[0].artifact=f.bind('artifacts/native/test/family.json',raw);assert.throws(check,/calendar_identity_invalid/);});
test('Garmin source-owned domain family is independent from visual-only prepared states',()=>{const f=fixture();const names=['packaging','bridge-allowlist','canonical-json','sync-read','account-lifecycle','recovery','dedupe-restart','dedupe-restore','dedupe-merge','match-zero','match-one','match-many','match-stale','match-alternate','match-cancel','match-confirm','match-reassign','privacy'];const raw={producer:'personal-closeout-native-garmin/v1',...f.native(),execution_origin:{},result:{producer:'v12-production-garmin-host/v1',execution_origin:'production-attested/v1',cases:names.map((id,order)=>({id,order,status:'PASS',code:id+'-observed',count:1,receipt_sha256:'e'.repeat(64)}))}};const check=family(f,'GAR-01','native-garmin',raw);assert.ok(!check().missing_requirements.includes('GAR-01'));f.evidence.requirements[0].id='VER-10';f.authority.selectors[0].row_id='VER-10';f.authority.selectors[0].selector.type='phase20-gate';assert.ok(!check().missing_requirements.includes('VER-10'));raw.result.cases[10].count=0;f.evidence.requirements[0].proofs[0].artifact=f.bind('artifacts/native/test/family.json',raw);assert.ok(check().missing_requirements.includes('VER-10'));raw.result.cases[4].status='FAIL';raw.result.cases[4].code='account-lifecycle-evidence-mismatch';f.evidence.requirements[0].id='GAR-01';f.authority.selectors[0].row_id='GAR-01';f.authority.selectors[0].selector.type='garmin-requirement';f.evidence.requirements[0].proofs[0].artifact=f.bind('artifacts/native/test/family.json',raw);assert.ok(check().missing_requirements.includes('GAR-01'));});
test('accessibility and performance families consume mature raw native workload validators',()=>{const f=fixture();const identity=qualityIdentity({base_head:f.manifest.source.head,source_tree_sha256:f.manifest.source.tree_sha256,apk_sha256:f.manifest.build.apk.sha256,installed_apk_sha256:f.manifest.build.apk.sha256,device_identity_sha256:f.manifest.device.identity_sha256,fixture_sha256:f.manifest.fixtures.registry_sha256});const access={schema_version:2,run_id:f.manifest.run_id,producer:'v12-accessibility-native-observation/v2',observations:accessibilityEvidence(identity)};const check=family(f,'VER-04','native-accessibility',access);assert.ok(!check().missing_requirements.includes('VER-04'));const performance=performanceEvidence(identity);const raw={run_id:f.manifest.run_id,producer:'v12-release-performance-writer/v1',observation:executeV12PerformanceShard({identity,performance})};family(f,'VER-11','native-performance',raw);assert.ok(f.check().missing_requirements.includes('VER-11'));raw.observation.raw_samples.warm_launch_to_interactive_ms.pop();f.evidence.requirements[0].proofs[0].artifact=f.bind('artifacts/native/test/family.json',raw);assert.throws(f.check);});
test('attended family rejects missing prepared rows and never treats general owner confirmation as detailed attendance',()=>{const f=fixture();const check=family(f,'VER-12','native-attended',{owner_confirmation:true});assert.ok(check().missing_requirements.includes('VER-12'));f.authority.validateAttended=()=>true;assert.ok(!check().missing_requirements.includes('VER-12'));f.evidence.requirements[0].id='VER-11';f.authority.selectors[0].row_id='VER-11';assert.throws(check,/requirement_scope_invalid/);});

function mockRootAuthority(t){
 const root=realpathSync(mkdtempSync(path.join(tmpdir(),'personal-closeout-authority-')));const data=new Map();const put=(file,bytes)=>{const value=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes);data.set(file,value);const target=path.join(root,file);mkdirSync(path.dirname(target),{recursive:true});writeFileSync(target,value);};
 const fixed=['package.json','package-lock.json','jest.config.js','tsconfig.json','.planning/REQUIREMENTS.md','.planning/design/v1.2-SOURCE-PRECEDENCE.md','.planning/phases/18-garmin-import/18-CONTEXT.md','.planning/design/v1.2-prototype-parity-matrix.json','.planning/design/v1.2-browser-evidence/serial-walk.json','.planning/design/v1.2-browser-evidence/source-manifest.json','.planning/v1.2-OWNER-BRIEF.md','.planning/phases/20-native-acceptance/20-UI-SPEC.md','.planning/design/v1.2-DEVIATIONS.md','.planning/verification/personal-closeout-profile-20261027-v2.json','src/testing/phase20VisualStateRegistry.json',...['v12Acceptance','sqliteKernel','migrationsEffects','portableMerge','multiPlanRunning','googleDriveBackup','garminImport','progressParity','phase15Workout','phase17LibraryRunning'].map(name=>`src/testing/contracts/${name}.contract.ts`)];
 const portable=parse(readFileSync('.planning/design/v1.2-browser-evidence/source-manifest.json')).portable_fallback;
 fixed.push(portable.renderer.path,portable.serial_walk.path,...Object.values(V12_NATIVE_PROVENANCE_REGISTRY).flatMap(x=>[x.adapter,x.launcher,x.domain]));
 for(const file of new Set(fixed))put(file,readFileSync(file));
 put('tests/context.test.mjs',"import './dep'; import './dep';");put('tests/dep.mjs','export const n=1;');
 const planned=parse(data.get('.planning/design/v1.2-prototype-parity-matrix.json')).rows[0].planned_tests[0];put(planned,"test('a supplied rule witness',()=>{}); describe('container',()=>{});");
 const head='a'.repeat(40);const serial='fixture-serial';const sdk=path.join(root,'artifacts/fake-sdk');put('artifacts/fake-sdk/platform-tools/adb','mocked');put('artifacts/fake-sdk/build-tools/36.0.0/apksigner','mocked');
 let apk=Buffer.from('504b0304aabb','hex');let nativeCalls=0;const signature='certificate SHA-256 digest: '+('c'.repeat(64))+'\n';
 const oldEnv=Object.fromEntries(['ANDROID_HOME','ANDROID_SDK_ROOT','V12_DEVICE_SERIAL','PERSONAL_CLOSEOUT_DEVICE_BINDINGS','PERSONAL_CLOSEOUT_OWNER_REVIEW_BINDINGS','V12_APPROVED_SOURCE_ROOT'].map(k=>[k,process.env[k]]));process.env.ANDROID_HOME=sdk;process.env.ANDROID_SDK_ROOT=sdk;process.env.V12_DEVICE_SERIAL=serial;delete process.env.V12_APPROVED_SOURCE_ROOT;delete process.env.PERSONAL_CLOSEOUT_OWNER_REVIEW_BINDINGS;
 const device=phase18DeviceIdentitySha256({serial,abi:'arm64-v8a',apiLevel:'36',model:'sdk_gphone64_arm64'});process.env.PERSONAL_CLOSEOUT_DEVICE_BINDINGS=JSON.stringify({[device]:serial});
 t.mock.method(childProcess,'spawnSync',(program,args)=>{assert.ok(program.endsWith('/git'));return{status:0,signal:null,stdout:Buffer.from('git version 2.39.5\n'),stderr:Buffer.alloc(0)};});
 t.mock.method(childProcess,'execFileSync',(program,args,options={})=>{
  let value;
  if(program.endsWith('/git')){
   if(args[0]==='rev-parse')value=Buffer.from(head+'\n');else if(args[0]==='status')value=Buffer.alloc(0);
   else if(args[0]==='ls-files')value=Buffer.from([...data.keys()].join('\0')+'\0');
   else if(args[0]==='ls-tree')value=Buffer.from([...data.keys()].join('\n')+'\n');
   else if(args[0]==='show'){const file=args[1].slice(41);assert.ok(data.has(file));value=data.get(file);}
   else throw new Error('unexpected git fixture command');
  }else if(program==='/usr/bin/unzip')value=args[0]==='-Z1'?Buffer.from('lib/arm64-v8a/libexpo-sqlite.so\n'):Buffer.from('ELF fixture');
  else if(program===path.join(sdk,'build-tools/36.0.0/apksigner')){nativeCalls++;value=Buffer.from(signature);}
  else if(program===path.join(sdk,'platform-tools/adb')){nativeCalls++;const a=args.slice(2);if(a[0]==='get-state')value=Buffer.from('device\n');else if(a[0]==='exec-out')value=apk;else if(a[1]==='getprop')value=Buffer.from(({'ro.product.cpu.abi':'arm64-v8a','ro.build.version.sdk':'36','ro.product.model':'sdk_gphone64_arm64'})[a[2]]);else if(a[1]==='pm')value=Buffer.from('package:/data/app/a~b/base.apk\n');else if(a[1]==='settings')value=Buffer.from('1');else throw new Error('unexpected mocked native command');}
  else throw new Error('unmocked subprocess forbidden in host authority test');
  return options.encoding?value.toString('utf8'):value;
 });syncBuiltinESMExports();
 const read=file=>readFileSync(path.join(root,file));const authority=collectPersonalCloseoutAuthority(root,read,Date.parse('2026-10-28T00:00:00Z'));const f=fixture();
 const manifest=createV12RunManifest({input:{created_at:'2026-10-27T00:00:00Z',evidence_origin:'native',source:authority.source,...authority.contract,build:{...f.manifest.build,apk:{...f.manifest.build.apk,signature_sha256:hash(signature),certificate_sha256:'c'.repeat(64)}},device:{...f.manifest.device,identity_sha256:device,settings_sha256:hash('1\n1\n1\n'),restoration_sha256:hash('1\n1\n1\n')},configuration:f.manifest.configuration}});
 put(manifest.build.apk.path,apk);const manifestBytes=Buffer.from(JSON.stringify(manifest));put(f.evidence.native_manifest.path,manifestBytes);
 const evidence={...f.evidence,source_head:manifest.source.head,native_manifest:{path:f.evidence.native_manifest.path,sha256:hash(manifestBytes)}};put('artifacts/evidence.json',JSON.stringify(evidence));
 return{root,data,put,read,authority,manifest,planned,device,serial,signature,nativeCalls:()=>nativeCalls,cleanup:()=>{t.mock.restoreAll();syncBuiltinESMExports();for(const[k,v]of Object.entries(oldEnv)){if(v===undefined)delete process.env[k];else process.env[k]=v;}rmSync(root,{recursive:true,force:true});}};
}
test('production authority collects actual source contracts and validates native facts only through trusted subprocess bindings',t=>{const f=mockRootAuthority(t);try{
 assert.equal(f.authority.source.head,'a'.repeat(40));assert.equal(f.authority.requirementIds.length,172);assert.equal(f.authority.sqliteRecipe.categories.length,10);
 assert.ok(f.authority.sourceClosure(f.authority.source.head,['tests/context.test.mjs']).includes('tests/dep.mjs'));assert.ok(f.authority.hostAssertion('DOM-01',f.planned,'a supplied rule witness',f.authority.source.head));assert.ok(f.authority.hostAssertion('DOM-01',f.planned,'container a supplied rule witness',f.authority.source.head));assert.equal(f.authority.hostAssertion('DOM-01','other.test.ts','a supplied rule witness',f.authority.source.head),false);assert.equal(f.authority.hostAssertion('DOM-01',f.planned,'missing witness',f.authority.source.head),false);
 assert.throws(()=>f.authority.readSource('bad','package.json'));assert.throws(()=>f.authority.validateMapping({},f.manifest,'workout'));assert.throws(()=>f.authority.validateFunctional({},f.manifest,'workout','workout.test'));assert.throws(()=>f.authority.validateShell({}, {}, f.manifest));assert.equal(f.authority.originalRow('GAR-01'),null);
 const expected=V12_NATIVE_PROVENANCE_REGISTRY.calendar;const origin={kind:'production-default-launcher',toolchain_origin:'production-attested/v1',default_launcher:true,test_only:false,action:'calendar',...Object.fromEntries(['adapter','launcher','domain'].map(role=>[role+'_source_sha256',hash(f.read(expected[role]))]))};f.authority.validateOrigin(origin,'calendar');assert.throws(()=>f.authority.validateOrigin({...origin,test_only:true},'calendar'));
 assert.deepEqual(f.authority.sqliteBinaryPaths(f.manifest,f.manifest,{path:f.manifest.build.apk.path}),['lib/arm64-v8a/libexpo-sqlite.so']);const binary={archive_path:'lib/arm64-v8a/libexpo-sqlite.so',old:{sha256:hash('ELF fixture')},current:{sha256:hash('ELF fixture')}};assert.equal(f.authority.verifySqliteBinary(f.manifest,f.manifest,binary,{path:f.manifest.build.apk.path}),true);
 assert.equal(f.authority.verifyNative(f.manifest),true);assert.ok(f.nativeCalls()>0);delete process.env.V12_DEVICE_SERIAL;assert.equal(f.authority.verifyNative(f.manifest),true);assert.equal(process.env.V12_DEVICE_SERIAL,undefined);process.env.V12_DEVICE_SERIAL=f.serial;
 let output='';assert.equal(runPersonalCloseoutCli(['--evidence','artifacts/evidence.json'],{stdout:{write:value=>{output+=value;}}},f.root),1);assert.equal(JSON.parse(output).status,'NOT_READY');
 const identity={apk_sha256:f.manifest.build.apk.sha256,apk_signature_sha256:f.manifest.build.apk.signature_sha256,config_sha256:hash(f.manifest.configuration.id),device:{device_sha256:f.manifest.device.identity_sha256,model:'SM-S916B'},installed_apk_sha256:f.manifest.device.installed_apk_sha256,run_id:f.manifest.run_id,source_tree_sha256:f.manifest.source.tree_sha256};
 const rows=Array.from({length:7},(_,i)=>{const id=`S20-0${i+1}`;const image=new PNG({width:2,height:2});image.data[0]=i+1;const bytes=PNG.sync.write(image);const file=`artifacts/native/v1.2/${f.manifest.run_id}/attended/${id}.png`;f.put(file,bytes);const png={path:file,sha256:hash(bytes),width:2,height:2,size_bytes:bytes.length};return{id,status:'passed',png,attestation:{schema_version:1,kind:'trusted-synthetic-state-content-review',fixture_id:'v12-synthetic-fixtures-r18',synthetic_state:true,content_reviewed:true,png_sha256:png.sha256}};});const record={schema_version:2,suite:'v12-samsung-attended',mode:'observation-only',release_authorized:false,recorded_at:'2026-10-27T01:00:00Z',identity,status:'passed',rows};const reader=binding=>{const bytes=f.read(binding.path);assert.equal(hash(bytes),binding.sha256);return bytes;};assert.equal(f.authority.validateAttended(record,f.manifest,reader),true);record.rows[0].status='failed';assert.equal(f.authority.validateAttended(record,f.manifest,reader),false);
 f.put('tests/context.test.mjs',"import './missing';");assert.throws(()=>f.authority.sourceClosure(f.authority.source.head,['tests/context.test.mjs']),/source_dependency_invalid/);
 }finally{f.cleanup();}});

test('CLI exit status is derived from complete typed validation results, not arbitrary approval labels',()=>{assert.equal(personalCloseoutExitCode(fixture().check()),1);assert.equal(personalCloseoutExitCode(fixture({complete:true}).check()),0);assert.throws(()=>personalCloseoutExitCode({status:'PASS'}),/result_invalid/);});
test('DOM mapped native cases require every declared SQLite case and refuse missing core evidence',()=>{const f=fixture();addSqlite(f);f.authority.selectors=[{row_id:'DOM-01',selector:{type:'dom-contract',shard:'multi-plan',id:'phase13-map01-activation',native_case_ids:['fresh-migration','rebuild']}}];const xml='<testsuite><testcase name="phase13-map01-activation"/></testsuite>';const proof={kind:'native-functional',shard:'multi-plan',case_id:'phase13-map01-activation',mapping:f.bind('artifacts/native/test/dom.json',{case_ids:['phase13-map01-activation'],observations:[{report_sha256:hash(xml)}]}),junit:f.bind('artifacts/native/test/dom.xml',xml)};f.evidence.requirements=[{id:'DOM-01',proofs:[proof]}];assert.ok(!f.check().missing_requirements.includes('DOM-01'));f.evidence.critical={sqlite_artifact:null,sqlite_contract:null,sqlite:[],recovery_artifact:null,recovery_junit:null,recovery:[]};assert.ok(f.check().missing_requirements.includes('DOM-01'));});
test('static recipe module import caching supports two aliases from one actual source without evaluating code',()=>{const reader=file=>{let text=readFileSync(file,'utf8');if(file==='src/testing/contracts/v12Acceptance.contract.ts'){text='import { SQLITE_KERNEL_CONTRACT_CASES as DUPLICATE } from "./sqliteKernel.contract";\n'+text;text=text.replace('"sqlite-kernel": SQLITE_KERNEL_CONTRACT_CASES,','"sqlite-kernel": SQLITE_KERNEL_CONTRACT_CASES, duplicate: DUPLICATE,');}return Buffer.from(text);};const result=readPersonalSqliteRecipe(reader);assert.deepEqual(result.registries.duplicate,result.registries['sqlite-kernel']);});
test('missing defaulted identities and absolute Jest test paths are handled by the actual source witness',()=>{for(const change of [f=>{delete f.authority.source.head;},f=>{delete f.evidence.apk_sha256;},f=>{f.evidence.apk_sha256=undefined;},f=>{addSqlite(f);f.evidence.critical.sqlite_contract=mutateArtifact(f,f.evidence.critical.sqlite_contract,x=>{delete x.nonce;});}]){const f=fixture();change(f);assert.throws(f.check);}const f=fixture();const h=addHost(f);h.receipt.report=mutateArtifact(f,h.receipt.report,x=>{x.testResults[0].name='/old/checkout/tests/test.test.mjs';});h.proof.execution=f.bind(h.execution.path,h.receipt);f.evidence.requirements=[{id:'WRK-01',proofs:[h.proof]}];assert.ok(!f.check().missing_requirements.includes('WRK-01'));});
test('failed recovery row stays nonpass even when every cut receipt and index is present',()=>{const f=fixture();addRecovery(f);f.evidence.critical.recovery_artifact=mutateArtifact(f,f.evidence.critical.recovery_artifact,raw=>{raw.cases[0].status='FAIL';});assert.ok(f.check().missing_requirements.some(id=>id.startsWith('recovery:')));});
test('supplemental normal route proof binds its own physical device and source-identical manifest',()=>{const f=fixture();addRoutes(f);const item=f.evidence.route_probes[0];const phone={...f.manifest,device:{...f.manifest.device,identity_sha256:'e'.repeat(64)}};item.native_manifest=f.bind('artifacts/native/test/phone-route.json',phone);item.artifact=mutateArtifact(f,item.artifact,raw=>{raw.device_identity_sha256=phone.device.identity_sha256;});assert.ok(!f.check().missing_requirements.includes('route:'+item.id));});
test('native binding fallback retains operator serial and rejects unavailable trusted devices',t=>{const f=mockRootAuthority(t);try{delete process.env.PERSONAL_CLOSEOUT_DEVICE_BINDINGS;const fallback=collectPersonalCloseoutAuthority(f.root,f.read);assert.equal(fallback.verifyNative(f.manifest),true);delete process.env.V12_DEVICE_SERIAL;assert.throws(()=>fallback.verifyNative(f.manifest),/device_bindings_invalid/);}finally{f.cleanup();}});

function legacyGateFixture(){const f=fixture();const oldRead=file=>childProcess.execFileSync('/usr/bin/git',['show',LEGACY_COMPLETE_GATE.head+':'+file],{cwd:process.cwd()});const id='src/domains/shared/errors.ts';const required=[id,'package.json','package-lock.json'];const source_inputs=required.map(file=>{const bytes=oldRead(file);f.sources.set(LEGACY_COMPLETE_GATE.head+':'+file,bytes);f.sources.set(f.authority.source.head+':'+file,bytes);return{path:file,sha256:hash(bytes),current_sha256:hash(bytes)};});f.sources.set(LEGACY_COMPLETE_GATE.head+':scripts/run-coverage-gate.mjs',oldRead('scripts/run-coverage-gate.mjs'));for(const binding of [LEGACY_COMPLETE_GATE.receipt,LEGACY_COMPLETE_GATE.log,LEGACY_COMPLETE_GATE.jest])f.files.set(binding.path,readFileSync(binding.path));f.authority.legacyRegistry=()=>readPersonalCoverageRegistry(oldRead);f.authority.executableClosure=()=>required;const item={kind:'inherited-complete-gate',id,gate:LEGACY_COMPLETE_GATE.receipt,source_inputs,replacements:[]};f.evidence.integrity=[item];return{f,item,oldRead};}
test('legacy original166-module gate remains a stronger typed source-owned receipt without recreating two absent counter maps',()=>{const {f,item,oldRead}=legacyGateFixture();assert.equal(readPersonalCoverageRegistry(oldRead).length,166);assert.ok(!f.check().missing_requirements.includes('coverage:'+item.id));f.sources.set(f.authority.source.head+':'+item.id,Buffer.concat([f.sources.get(f.authority.source.head+':'+item.id),Buffer.from('\n// erased comment only\n')]));item.source_inputs[0].current_sha256=hash(f.sources.get(f.authority.source.head+':'+item.id));assert.ok(!f.check().missing_requirements.includes('coverage:'+item.id));});
for(const [label,change] of [
 ['gate substituted',(f,item)=>{item.gate={...item.gate,sha256:'e'.repeat(64)};}],
 ['raw Jest changed',(f,item)=>{f.files.set(LEGACY_COMPLETE_GATE.jest.path,Buffer.from('{}'));}],
 ['runner changed',(f,item)=>{f.sources.set(LEGACY_COMPLETE_GATE.head+':scripts/run-coverage-gate.mjs',Buffer.from('fake runner'));}],
 ['wrong module scope',(f,item)=>{item.id='scripts/verify-personal-closeout.mjs';}],
 ['incomplete dependency scope',(f,item)=>{item.source_inputs.pop();}],
 ['wrong source binding',(f,item)=>{item.source_inputs[0].current_sha256='e'.repeat(64);}],
])test('legacy gate rejects '+label,()=>{const {f,item}=legacyGateFixture();change(f,item);assert.throws(f.check);});
test('legacy source-invalidated implementation remains nonpassing and cannot claim old166 as current208',()=>{const {f,item}=legacyGateFixture();const changed=Buffer.from('export const changedExecutable=1;');f.sources.set(f.authority.source.head+':'+item.id,changed);item.source_inputs[0].current_sha256=hash(changed);assert.ok(f.check().missing_requirements.includes('coverage:'+item.id));assert.equal(f.check().exhaustive_matrix_passed,false);});

test('three preserved actual Jest four-metric threshold logs remain bound to their original source/test identities',()=>{for(const[id,descriptor]of Object.entries(RETAINED_TOOL_THRESHOLDS)){const f=fixture();for(const binding of [descriptor.log,descriptor.receipt])f.files.set(binding.path,readFileSync(binding.path));const required=[id,...descriptor.tests].sort();f.authority.executableClosure=()=>required;const source_inputs=required.map(file=>{const bytes=childProcess.execFileSync('/usr/bin/git',['show',descriptor.head+':'+file],{cwd:process.cwd()});f.sources.set(descriptor.head+':'+file,bytes);f.sources.set(f.authority.source.head+':'+file,bytes);return{path:file,sha256:hash(bytes),current_sha256:hash(bytes)};});f.evidence.integrity=[{kind:'inherited-tool-threshold',id,receipt:descriptor.receipt,source_inputs,replacements:[]}];assert.ok(!f.check().missing_requirements.includes('coverage:'+id));f.evidence.integrity[0].receipt={...descriptor.receipt,sha256:'e'.repeat(64)};assert.throws(f.check,/tool_threshold_invalid/);}});
test('legacy dependency replacements require complete actual current raw counter/test/input proof',()=>{const {f,item}=legacyGateFixture();const dependency=profile.critical_integrity_files[0];const host=addCoverage(f,{all:false});const replacement=f.evidence.integrity[0];item.replacements=[replacement];const old=Buffer.from('export const value=1;');f.sources.set(LEGACY_COMPLETE_GATE.head+':'+dependency,old);const current=f.sources.get(f.authority.source.head+':'+dependency);item.source_inputs.push({path:dependency,sha256:hash(old),current_sha256:hash(current)});const required=item.source_inputs.map(x=>x.path);f.authority.executableClosure=()=>required;
 // The real current replacement execution keeps its tested config bytes; bind those same bytes as the preserved configuration for this isolated authority fixture.
 for(const input of item.source_inputs.filter(x=>x.path==='package.json'||x.path==='package-lock.json')){const bytes=f.sources.get(f.authority.source.head+':'+input.path);f.sources.set(LEGACY_COMPLETE_GATE.head+':'+input.path,bytes);input.sha256=hash(bytes);input.current_sha256=hash(bytes);}
 f.evidence.integrity=[item];assert.ok(!f.check().missing_requirements.includes('coverage:'+item.id));replacement.coverage_artifact=mutateArtifact(f,replacement.coverage_artifact,raw=>{raw[replacement.id].s[0]=0;});const execution=parse(f.read(replacement.execution.path));execution.coverage_artifacts=[replacement.coverage_artifact];replacement.execution=f.bind(replacement.execution.path,execution);assert.ok(f.check().missing_requirements.includes('coverage:'+item.id));});

test('effective v2 preserves the historical profile and defers only the two superseded manual-FIT states',()=>{const old=JSON.parse(readFileSync('.planning/verification/personal-closeout-profile-20261027.json'));assert.equal(jhash(old),'d3850330f68afb910284c83beab0c30910192242ecc7783e29fc84d678f14c92');assert.throws(()=>validatePersonalCloseoutProfile(old,ids),/profile_invalid/);assert.equal(profile.profile_id,'personal-use-closeout-20261027-v2');assert.equal(profile.required_ui_observations.length,153);assert.equal(profile.deferred_ui_observations.length,6695);for(const id of ['BW-099','BW-103']){assert.equal(profile.required_ui_observations.some(x=>x.state_id===id),false);assert.ok(profile.deferred_ui_observations.some(x=>x.state_id===id&&x.configuration_id===profile.baseline_configuration));}const f=fixture();addCapture(f,{state_id:'BW-099',configuration_id:profile.baseline_configuration});assert.throws(f.check,/ui_invalid/);});

test('default executable dependency closure and legacy registry callbacks fail closed on unresolved or unsupported sources',t=>{const f=mockRootAuthority(t);try{const closure=f.authority.executableClosure(f.authority.source.head,'tests/context.test.mjs');assert.ok(closure.includes('tests/dep.mjs'));f.put('tests/context.test.mjs',"const v=require('./dep'); export {n} from './dep.mjs'; import('node:path');");assert.ok(f.authority.executableClosure(f.authority.source.head,'tests/context.test.mjs').includes('tests/dep.mjs'));assert.throws(()=>f.authority.legacyRegistry(f.authority.source.head));f.put('tests/context.test.mjs',"import('./absent.mjs');");assert.throws(()=>f.authority.executableClosure(f.authority.source.head,'tests/context.test.mjs'),/source_dependency_invalid/);f.put('.planning/design/v1.2-SOURCE-PRECEDENCE.md','changed precedence');assert.throws(()=>collectPersonalCloseoutAuthority(f.root,f.read),/source_precedence_invalid/);}finally{f.cleanup();}});
test('legacy static registry does not evaluate arbitrary expressions in an untrusted substituted runner',()=>{const reader=file=>{const bytes=childProcess.execFileSync('/usr/bin/git',['show',LEGACY_COMPLETE_GATE.head+':'+file],{cwd:process.cwd()});return file==='scripts/run-coverage-gate.mjs'?Buffer.from(bytes.toString().replace(/const integrityCriticalFiles = \[[\s\S]*?\];/u,'const integrityCriticalFiles = 42;')):bytes;};assert.throws(()=>readPersonalCoverageRegistry(reader),/legacy_registry_invalid/);});

test('host missing source identity and inherited non-code config changes stay nonpassing',()=>{const f=fixture();const h=addHost(f);delete h.receipt.source_head;h.proof.execution=f.bind(h.execution.path,h.receipt);f.evidence.requirements=[{id:'WRK-01',proofs:[h.proof]}];assert.throws(f.check,/host_execution_invalid/);const legacy=legacyGateFixture();const path='package.json';legacy.f.sources.set(legacy.f.authority.source.head+':'+path,Buffer.from('changed config'));legacy.item.source_inputs.find(x=>x.path===path).current_sha256=hash('changed config');assert.ok(legacy.f.check().missing_requirements.includes('coverage:'+legacy.item.id));});
test('coverage registry recognizes only its exact source-owned required-files manifest property',()=>{const old=file=>childProcess.execFileSync('/usr/bin/git',['show',LEGACY_COMPLETE_GATE.head+':'+file],{cwd:process.cwd()});const ids=readPersonalCoverageRegistry(old);const reader=file=>file==='scripts/phase19-integrity-coverage.json'?Buffer.from(JSON.stringify({required_files:ids})):Buffer.from(old(file).toString().replace(/const integrityCriticalFiles = \[[\s\S]*?\];/u,'const integrityCriticalFiles = phase19CoverageManifest.required_files;'));assert.deepEqual(readPersonalCoverageRegistry(reader),ids);});

function addRealFormatToast(f, nonce='f'.repeat(48)) {
 addRoutes(f); const item=f.evidence.route_probes.at(-1);const caseId='workout.complete-commit';
 const unchanged={source_sha256:hash('before-state'),row_count:2,schema_version:42};
 const baseline=createV12AppFunctionalReadbacks({shard:'workout',caseId,nonce,pre:unchanged,action:unchanged,post:unchanged});
 const readbacks=createV12AppFunctionalReadbacks({shard:'workout',caseId,nonce,pre:unchanged,
  action:{...unchanged,source_sha256:hash('after-state')},post:{...unchanged,source_sha256:hash('after-state')},
  operationResult:{result:baseline.source_receipt.operation_result,handler_id:baseline.source_receipt.operation_handler_id,
   postcondition_id:baseline.source_receipt.operation_postcondition_id,receipt_id:'confirmed-set-test-receipt',outcome:'committed',committed_effects:1}});
 const receipt=createV12FunctionalExecutionReceipt({nonce,runId:f.manifest.run_id,shard:'workout',caseId,
  identity:{source_tree_sha256:f.manifest.source.tree_sha256,apk_sha256:f.manifest.build.apk.sha256,
   installed_apk_sha256:f.manifest.device.installed_apk_sha256,device_identity_sha256:f.manifest.device.identity_sha256,configuration_id:f.manifest.configuration.id},
  sourceReceipt:readbacks.source_receipt,uiReadback:readbacks.ui_readback,
  pre:{source_sha256:readbacks.source_receipt.pre.source_sha256},action:{report_sha256:hash('actual-format-maestro-action')},
  post:{source_sha256:readbacks.source_receipt.post.source_sha256,ui_sha256:readbacks.ui_readback.ui_receipt_sha256}});
 const raw=parse(f.read(item.artifact.path));raw.nonce=nonce;raw.command=f.bind('artifacts/native/test/real-format-toast-command.json',
  {schema_version:1,producer:'v12-maestro-functional-command/v1',shard:'workout',case_id:caseId,execution_receipt:receipt});
 item.artifact=f.bind(item.artifact.path,raw);f.authority.validateFunctional=(value,manifest,shard,caseId)=>validateV12FunctionalExecutionReceipt(value,{manifest,runId:manifest.run_id,shard,caseId});
 return{item,raw,receipt};
}
test('required capture alignment gaps block a ready marker even when PNG and native source receipts are valid',()=>{
 const f=fixture();const state=f.authority.registry.find(x=>x.id===profile.required_ui_observations[0].state_id);
 state.readiness.alignment_gaps=['Unresolved production selector'];addCapture(f,profile.required_ui_observations[0]);
 assert.throws(f.check,/alignment_gaps/);
});
test('functional-linked toast accepts actual run-v12 48hex committed receipt format',()=>{
 assert.match(readFileSync('scripts/run-v12-maestro.mjs','utf8'),/randomBytes\(24\)\.toString\("hex"\)/u);
 const f=fixture();const {receipt}=addRealFormatToast(f);
 assert.equal(validateV12FunctionalExecutionReceipt(receipt,{manifest:f.manifest,runId:f.manifest.run_id,shard:'workout',caseId:'workout.complete-commit'}),true);
 assert.ok(!f.check().missing_requirements.includes('route:toast-after-confirmed-action'));
});

for(const [label,mutate]of [
 ['absent',state=>{delete state.readiness.alignment_gaps;}],
 ['malformed',state=>{state.readiness.alignment_gaps='';}],
 ['nonempty',state=>{state.readiness.alignment_gaps=['Documented production alignment still open'];}],
])test('required capture alignment rejects '+label+' gap declaration independently from ready',()=>{
 const f=fixture();const state=f.authority.registry.find(x=>x.id===profile.required_ui_observations[0].state_id);mutate(state);
 addCapture(f,profile.required_ui_observations[0]);assert.throws(f.check,/alignment_gaps/);
});
test('functional toast nonce exception does not widen ordinary capture/core/read-only route identities',()=>{
 const ui=fixture();const captured=addCapture(ui,profile.required_ui_observations[0]);captured.raw.settings.state_receipt.nonce='f'.repeat(48);
 captured.item.capture=ui.bind(captured.item.capture.path,captured.raw);assert.throws(ui.check,/native_identity_invalid/);
 const core=fixture();addSqlite(core);core.evidence.critical.sqlite_contract=mutateArtifact(core,core.evidence.critical.sqlite_contract,raw=>{raw.nonce='f'.repeat(48);});
 assert.throws(core.check,/native_identity_invalid/);
 const route=fixture();addRoutes(route);route.evidence.route_probes[0].artifact=mutateArtifact(route,route.evidence.route_probes[0].artifact,raw=>{raw.nonce='f'.repeat(48);});
 assert.throws(route.check,/native_identity_invalid/);
});
for(const length of [32,47,49])test('functional-linked toast rejects '+length+'hex trace nonce',()=>{
 const f=fixture();const {item,raw}=addRealFormatToast(f);raw.nonce='f'.repeat(length);item.artifact=f.bind(item.artifact.path,raw);
 assert.throws(f.check,/native_identity_invalid/);
});
test('48hex functional toast still binds the exact actual command nonce and mature receipt hashes',()=>{
 const f=fixture();const {item,raw}=addRealFormatToast(f);raw.command=mutateArtifact(f,raw.command,command=>{command.execution_receipt.nonce='e'.repeat(48);});
 item.artifact=f.bind(item.artifact.path,raw);assert.throws(f.check,/route_command_invalid/);
 const g=fixture();const toast=addRealFormatToast(g);toast.raw.command=mutateArtifact(g,toast.raw.command,command=>{command.execution_receipt.phases[2].source_sha256='e'.repeat(64);});
 toast.item.artifact=g.bind(toast.item.artifact.path,toast.raw);assert.throws(g.check,/execution_receipt_invalid/);
});

function addBoundBaselineReview(f) {
 const identity=qualityIdentity({base_head:f.manifest.source.head,source_tree_sha256:f.manifest.source.tree_sha256,
  apk_sha256:f.manifest.build.apk.sha256,installed_apk_sha256:f.manifest.device.installed_apk_sha256,
  device_identity_sha256:f.manifest.device.identity_sha256,fixture_sha256:f.manifest.fixtures.registry_sha256});
 const raw={run_id:f.manifest.run_id,producer:'v12-release-performance-writer/v1',observation:executeV12PerformanceShard({identity,performance:performanceEvidence(identity)})};
 family(f,'VER-11','native-performance',raw);const proof=f.evidence.requirements[0].proofs[0];
 const garmin=raw.observation.raw_samples.garmin_sync_normalization;
 const reply={schema_version:1,producer:'personal-closeout-captured-owner-reply/v1',role:'user',
  text:'The displayed measured normalization baseline is acceptable.',decision:'acceptable',baseline_sha256:garmin.baseline.artifact_sha256,
  recorded_at:'2026-10-27T02:00:00Z'};
 const owner_reply=f.bind('artifacts/native/test/captured-owner-baseline-reply.json',reply);
 const review={schema_version:1,producer:'personal-closeout-owner-baseline-review/v1',requirement_id:'VER-11',metric:'garmin_sync_normalization',
  decision:'acceptable',recorded_at:'2026-10-27T02:00:01Z',run_id:f.manifest.run_id,source_head:f.manifest.source.head,
  source_tree_sha256:f.manifest.source.tree_sha256,apk_sha256:f.manifest.build.apk.sha256,device_identity_sha256:f.manifest.device.identity_sha256,
  performance_sha256:proof.artifact.sha256,baseline_sha256:garmin.baseline.artifact_sha256,baseline_payload_sha256:garmin.payload_sha256,
  normalization_samples_sha256:jhash(garmin.normalization_ms),rss_samples_sha256:jhash(garmin.peak_rss_bytes),owner_reply};
 proof.review=f.bind('artifacts/native/test/owner-baseline-review.json',review);
 f.authority.ownerReviewBindings={[proof.review.sha256]:proof.review.path,[owner_reply.sha256]:owner_reply.path};
 return{proof,review,reply,raw};
}
test('actual-bound acceptable owner baseline review satisfies only the original Garmin normalization review gate',()=>{
 const f=fixture();const {raw}=addBoundBaselineReview(f);assert.equal(raw.observation.summary.gates.garmin_sync_normalization.result,'REVIEW_REQUIRED');
 assert.ok(!f.check().missing_requirements.includes('VER-11'));
 assert.equal(raw.observation.summary.gates.garmin_sync_normalization.result,'REVIEW_REQUIRED');
});

function rebindBaselineReview(f, value) {
 value.proof.review=f.bind(value.proof.review.path,value.review);
 f.authority.ownerReviewBindings={[value.proof.review.sha256]:value.proof.review.path,[value.review.owner_reply.sha256]:value.review.owner_reply.path};
}
test('baseline review absence/untrusted bindings and naked approval flags remain NOT_READY',()=>{
 for(const change of [
  (f,v)=>{delete v.proof.review;v.proof.ownerApproved=true;},
  (f,v)=>{delete f.authority.ownerReviewBindings;},
  (f,v)=>{f.authority.ownerReviewBindings={};},
  (f,v)=>{f.authority.ownerReviewBindings[v.proof.review.sha256]='artifacts/native/test/unrelated.json';},
  (f,v)=>{delete f.authority.ownerReviewBindings[v.review.owner_reply.sha256];},
 ]){const f=fixture();const value=addBoundBaselineReview(f);change(f,value);assert.ok(f.check().missing_requirements.includes('VER-11'));}
});
for(const field of ['source_head','source_tree_sha256','apk_sha256','device_identity_sha256','performance_sha256','baseline_sha256','baseline_payload_sha256','normalization_samples_sha256','rss_samples_sha256'])test('baseline review rejects mismatched '+field,()=>{
 const f=fixture();const value=addBoundBaselineReview(f);value.review[field]='e'.repeat(field==='source_head'?40:64);rebindBaselineReview(f,value);
 assert.throws(f.check,/baseline_review_binding_invalid/);
});
test('baseline review rejects generic metadata and mismatched/unscoped captured owner reply',()=>{
 for(const change of [
  v=>{v.review.metric='all-app-performance';},v=>{v.review.ownerApproved=true;},v=>{v.reply.role='assistant';},
  v=>{v.reply.text='';},v=>{v.reply.baseline_sha256='e'.repeat(64);},v=>{v.reply.decision='rejected';},
 ]){const f=fixture();const value=addBoundBaselineReview(f);change(value);value.review.owner_reply=f.bind(value.review.owner_reply.path,value.reply);rebindBaselineReview(f,value);assert.throws(f.check,/baseline_(review|owner_reply)_invalid/);}
});
test('explicit rejected owner baseline review remains nonpass and original raw state is preserved',()=>{
 const f=fixture();const value=addBoundBaselineReview(f);value.review.decision='rejected';value.reply.decision='rejected';
 value.review.owner_reply=f.bind(value.review.owner_reply.path,value.reply);rebindBaselineReview(f,value);
 assert.ok(f.check().missing_requirements.includes('VER-11'));assert.equal(value.raw.observation.summary.gates.garmin_sync_normalization.result,'REVIEW_REQUIRED');
});
test('baseline review rejects future and out-of-order actual reply times',()=>{
 for(const change of [v=>{v.reply.recorded_at='2099-10-27T02:00:00Z';},v=>{v.reply.recorded_at='2026-10-26T02:00:00Z';},v=>{v.review.recorded_at='2026-10-27T01:59:00Z';}]){
  const f=fixture();const value=addBoundBaselineReview(f);change(value);value.review.owner_reply=f.bind(value.review.owner_reply.path,value.reply);rebindBaselineReview(f,value);
  assert.throws(f.check,/(timestamp_invalid|baseline_review_time_invalid)/);
 }
});
test('acceptable baseline review cannot satisfy any failing ordinary performance budget',()=>{
 const f=fixture();const value=addBoundBaselineReview(f);const identity=value.raw.observation.identity;const performance=performanceEvidence(identity);
 performance.samples.warm_launch_to_interactive_ms[0]=2001;
 const span=performance.samples.native_receipts.timings.warm_launch_to_interactive_ms.spans[0];span.end_ms=span.start_ms+2001;
 value.raw.observation=executeV12PerformanceShard({identity,performance});value.proof.artifact=f.bind(value.proof.artifact.path,value.raw);
 value.review.performance_sha256=value.proof.artifact.sha256;rebindBaselineReview(f,value);
 assert.equal(value.raw.observation.summary.gates.warm_launch_to_interactive.result,'FAIL');assert.ok(f.check().missing_requirements.includes('VER-11'));
});
test('CLI owner review bindings are independent safe path/hash inputs and do not imply an owner response',t=>{
 const f=mockRootAuthority(t);try{const digest='a'.repeat(64);process.env.PERSONAL_CLOSEOUT_OWNER_REVIEW_BINDINGS=JSON.stringify({[digest]:'artifacts/native/test/captured-review.json'});
  const authority=collectPersonalCloseoutAuthority(f.root,f.read);assert.deepEqual(authority.ownerReviewBindings,{[digest]:'artifacts/native/test/captured-review.json'});
  process.env.PERSONAL_CLOSEOUT_OWNER_REVIEW_BINDINGS=JSON.stringify({[digest]:'../private.json'});assert.throws(()=>collectPersonalCloseoutAuthority(f.root,f.read),/owner_review_bindings_invalid/);
 }finally{f.cleanup();}
});

test('preserved actual Calendar TAP binds both executed files without inventing a replacement single-file report',()=>{
 const f=fixture();const host=addHost(f,{id:'CAL-01',runner:'node-tap'});
 const base='artifacts/native/personal-closeout-20261027/calendar-action-coverage/complete';
 const actual=JSON.parse(readFileSync(base+'/execution.json'));const bytes=readFileSync(base+'/tests.tap');
 host.receipt.test_files=actual.test_files;
 const inputs=['package.json','package-lock.json',...actual.test_files].sort().map(path=>{const value=path.startsWith('scripts/')?readFileSync(path):Buffer.from('source');f.sources.set(f.authority.source.head+':'+path,value);return{path,sha256:hash(value)};});
 const required=inputs.map(x=>x.path);f.authority.sourceClosure=()=>required;host.receipt.source_inputs=inputs;host.receipt.report=f.bind('artifacts/native/test/preserved-multi-file.tap',bytes);
 const names=[...bytes.toString().matchAll(/^ok \d+ - (.+)$/gmu)].map(x=>x[1]);
 const matched=actual.test_files.flatMap(file=>names.filter(name=>readFileSync(file,'utf8').includes(name)).map(name=>({file,name})))[0];assert.ok(matched);
 host.proof.test_file=matched.file;host.proof.full_name=matched.name;host.proof.execution=f.bind(host.execution.path,host.receipt);f.evidence.requirements=[{id:'CAL-01',proofs:[host.proof]}];
 assert.ok(!f.check().missing_requirements.includes('CAL-01'));
});

async function actualComposedV8Fixture(flags=[true,false],id="scripts/verify-personal-closeout.mjs") {
 const f=fixture();const root=realpathSync(mkdtempSync(path.join(tmpdir(),'personal-composed-v8-')));
 const source='export function choose(value) { if (value) return 1; return 2; }\n';const moduleFile=path.join(root,'fixture.mjs');writeFileSync(moduleFile,source);
 f.sources.set(f.authority.source.head+':'+id,Buffer.from(source));f.authority.sourceClosure=(_head,files)=>['package.json','package-lock.json',id,...files].sort();
 const require=createRequire(path.join(process.cwd(),'package.json'));const v8=require('v8-to-istanbul');const lib=require('istanbul-lib-coverage');const merged=lib.createCoverageMap({});const runs=[];
 for(const [index,flag]of flags.entries()){
  const file=`tests/composed-${index}.test.mjs`;const testSource=`import test from 'node:test'; import assert from 'node:assert/strict'; import { choose } from './fixture.mjs'; test('actual branch ${index}',()=>assert.equal(choose(${flag}),${flag?1:2}));\n`;
  const testPath=path.join(root,`composed-${index}.test.mjs`);writeFileSync(testPath,testSource);const rawRoot=path.join(root,'raw-'+index);mkdirSync(rawRoot);
  const environment={...process.env,NODE_V8_COVERAGE:rawRoot};delete environment.NODE_TEST_CONTEXT;const started_at=new Date().toISOString();const execution=spawnSync(process.execPath,['--test','--test-reporter=tap',testPath],{env:environment,encoding:'utf8'});const finished_at=new Date().toISOString();assert.equal(execution.status,0,execution.stderr);
  f.sources.set(f.authority.source.head+':'+file,Buffer.from(testSource));for(const p of ['package.json','package-lock.json'])f.sources.set(f.authority.source.head+':'+p,Buffer.from('source'));
  const source_inputs=['package.json','package-lock.json',id,file].sort().map(p=>({path:p,sha256:hash(f.sources.get(f.authority.source.head+':'+p))}));
  const raw_v8=[];for(const rawFile of require('node:fs').readdirSync(rawRoot)){const bytes=readFileSync(path.join(rawRoot,rawFile));const descriptor=f.bind(`artifacts/native/test/composed-${index}-${rawFile}`,bytes);raw_v8.push(descriptor);for(const script of JSON.parse(bytes).result){if(script.url!==pathToFileURL(moduleFile).href)continue;const converter=v8(path.resolve(id),0,{source});await converter.load();converter.applyCoverage(script.functions);merged.merge(converter.toIstanbul());}}
  const source_bindings=[{id,url:pathToFileURL(moduleFile).href,sha256:hash(source)}];
  const report=f.bind(`artifacts/native/test/composed-${index}.tap`,execution.stdout);const actual_execution=f.bind(`artifacts/native/test/composed-${index}.actual.json`,{schema_version:1,execution_context_head:f.authority.source.head,started_at,finished_at,test_files:[file],source_inputs,report_sha256:report.sha256,exit_code:0,changed_inputs:[]});
  const receipt={schema_version:1,producer:'personal-closeout-host-execution/v1',source_head:f.authority.source.head,started_at,finished_at,runner:'node-tap',test_files:[file],source_inputs,report,actual_execution,raw_v8,source_bindings};
  const binding=f.bind(`artifacts/native/test/composed-${index}.execution.json`,receipt);runs.push({execution:binding,raw_v8,source_bindings});
 }
 f.authority.now=Date.now()+1000;const coverage_artifact=f.bind('artifacts/native/test/composed-coverage-final.json',merged.toJSON());
 f.evidence.integrity=[{kind:'composed-coverage',id,coverage_artifact,runs}];return{f,root,id,source,runs,merged,cleanup:()=>rmSync(root,{recursive:true,force:true})};
}
test('composed coverage recomputes two actual executed V8 ranges instead of accepting a merged PASS label',async()=>{
 const v=await actualComposedV8Fixture();try{assert.ok(!v.f.check().missing_requirements.includes('coverage:'+v.id));}finally{v.cleanup();}
});

function rebindComposedExecution(f,run,change){const receipt=parse(f.read(run.execution.path));change(receipt);run.execution=f.bind(run.execution.path,receipt);}
for(const[label,change]of [
 ['one artificial execution',v=>{v.f.evidence.integrity[0].runs=[v.runs[0]];}],
 ['forged merged summary',v=>{const item=v.f.evidence.integrity[0];item.coverage_artifact=v.f.bind(item.coverage_artifact.path,{metrics:{lines:100,branches:100,functions:100,statements:100}});} ],
 ['unbound raw stream',v=>{v.runs[0].raw_v8[0]={...v.runs[0].raw_v8[0],sha256:'e'.repeat(64)};}],
 ['wrong source hash',v=>{v.runs[0].source_bindings[0].sha256='e'.repeat(64);rebindComposedExecution(v.f,v.runs[0],r=>{r.source_bindings=v.runs[0].source_bindings;});}],
 ['stale function offsets',v=>{const run=v.runs[0];const descriptor=run.raw_v8.find(x=>parse(v.f.read(x.path)).result.some(s=>s.url===run.source_bindings[0].url));const raw=parse(v.f.read(descriptor.path));raw.result.find(s=>s.url===run.source_bindings[0].url).functions[0].ranges[0].endOffset-=1;const replacement=v.f.bind(descriptor.path,raw);run.raw_v8[run.raw_v8.indexOf(descriptor)]=replacement;rebindComposedExecution(v.f,run,r=>{r.raw_v8=run.raw_v8;});}],
 ['reused stream',v=>{v.runs[1].raw_v8=v.runs[0].raw_v8;rebindComposedExecution(v.f,v.runs[1],r=>{r.raw_v8=v.runs[1].raw_v8;});}],
 ['changed actual report binding',v=>{rebindComposedExecution(v.f,v.runs[0],r=>{r.actual_execution=mutateArtifact(v.f,r.actual_execution,a=>{a.report_sha256='e'.repeat(64);});});}],
 ['source changed after execution',v=>{v.f.sources.set(v.f.authority.source.head+':'+v.id,Buffer.from('export const changed=1;'));}],
])test('composed coverage rejects '+label,async()=>{const v=await actualComposedV8Fixture();try{change(v);assert.throws(v.f.check);}finally{v.cleanup();}});
test('actual partial composed ranges remain NOT_READY even when their supplied raw artifact is internally consistent',async()=>{const v=await actualComposedV8Fixture([true,true]);try{assert.ok(v.f.check().missing_requirements.includes('coverage:'+v.id));}finally{v.cleanup();}});
test('composed SDK dependency proof uses the same current raw consumers without adding an unapproved critical module',async()=>{const v=await actualComposedV8Fixture([true,false],'scripts/v12-maestro-safe-sdk.mjs');try{assert.equal(profile.critical_integrity_files.includes(v.id),false);assert.equal(validatePersonalCoverageProof(v.f.evidence.integrity[0],v.f.read,v.f.authority),true);assert.throws(()=>validatePersonalCoverageProof(null,v.f.read,v.f.authority),/coverage_authority_invalid/);}finally{v.cleanup();}});

function preservedJestReconciliation() {
 const f=fixture();const base='artifacts/native/personal-closeout-20261027/remaining-ts-coverage';
 const actual=parse(readFileSync(base+'/execution.json'));const id='src/domains/progress/dashboardProjection.ts';
 // Actual log and Jest bytes are preserved; source authority/metadata are explicitly test-only fixtures.
 const source_inputs=['package.json','package-lock.json',id,...actual.test_files].sort().map(file=>{const bytes=readFileSync(file);f.sources.set(f.authority.source.head+':'+file,bytes);return{path:file,sha256:hash(bytes)};});
 f.sources.set(actual.execution_context_head+':package.json',readFileSync('package.json'));f.authority.sourceClosure=()=>source_inputs.map(x=>x.path);
 actual.source_inputs=source_inputs;
 const log=f.bind(base+'/tests.log',readFileSync(base+'/tests.log'));const report=f.bind(base+'/jest-results.json',readFileSync(base+'/jest-results.json'));
 const coverage_artifact=f.bind(base+'/coverage/coverage-final.json',readFileSync(base+'/coverage/coverage-final.json'));
 const receipt={schema_version:1,producer:'personal-closeout-host-execution/v1',source_head:actual.execution_context_head,tested_source_head:f.authority.source.head,started_at:actual.started_at,finished_at:actual.finished_at,runner:'jest',test_files:actual.test_files,source_inputs,report,coverage_artifacts:[coverage_artifact],actual_execution:f.bind('artifacts/native/test/actual-jest.json',actual),input_snapshot_before:f.bind('artifacts/native/test/jest-before.json',{execution_context_head:actual.execution_context_head,source_inputs}),input_snapshot_after:f.bind('artifacts/native/test/jest-after.json',{execution_context_head:actual.execution_context_head,source_inputs,report_sha256:log.sha256}),report_reconciliation:{kind:'jest-log-json',log,json:report}};
 const item={id,source_inputs,coverage_artifact,execution:null};
 const rebind=()=>{receipt.actual_execution=f.bind(receipt.actual_execution.path,actual);item.execution=f.bind('artifacts/native/test/reconciled-jest.json',receipt);};rebind();
 return{f,actual,receipt,item,rebind,check:()=>validatePersonalCoverageProof(item,f.read,f.authority)};
}
test('Jest reconciliation accepts preserved actual 35-test log and separate raw JSON without rewriting either hash',()=>{
 const v=preservedJestReconciliation();assert.notEqual(v.receipt.report.sha256,v.actual.report_sha256);assert.equal(v.check(),true);
 assert.equal(v.receipt.report.sha256,'95f8160e4b33dcc785c983da3a8aa7a518725846fc6119e0b5c240f44a457634');assert.equal(v.actual.report_sha256,'4408f0697a69c20c1f6070a3fb6c74a04a4891725cedead20b5985a80a863c9b');
});
for(const[label,change]of [
 ['missing explicit link',v=>{delete v.receipt.report_reconciliation;}],
 ['wrong raw JSON descriptor',v=>{v.receipt.report_reconciliation.json=v.receipt.report_reconciliation.log;}],
 ['wrong actual log hash',v=>{v.actual.report_sha256='e'.repeat(64);} ],
 ['changed log bytes',v=>{v.f.files.set(v.receipt.report_reconciliation.log.path,Buffer.from('changed'));}],
 ['mismatched test footer',v=>{const r=v.receipt.report_reconciliation;r.log=v.f.bind(r.log.path,v.f.read(r.log.path).toString().replace('35 passed, 35 total','34 passed, 34 total'));v.actual.report_sha256=r.log.sha256;v.receipt.input_snapshot_after=mutateArtifact(v.f,v.receipt.input_snapshot_after,a=>{a.report_sha256=r.log.sha256;});}],
 ['JSON output argv mismatch',v=>{v.actual.argv=v.actual.argv.map(a=>a.startsWith('--outputFile=')?'--outputFile=artifacts/native/test/unrelated.json':a);} ],
 ['actual failed execution',v=>{v.actual.exit_code=1;}],
 ['actual changed input list',v=>{v.actual.changed_inputs=[{path:v.item.id}];}],
 ['actual test-file substitution',v=>{v.actual.test_files=['tests/unrelated.test.mjs'];}],
 ['JSON suite failure',v=>{const r=v.receipt.report_reconciliation;v.receipt.report=mutateArtifact(v.f,v.receipt.report,a=>{a.numFailedTestSuites=1;});r.json=v.receipt.report;}],
 ['missing JSON timing',v=>{const r=v.receipt.report_reconciliation;v.receipt.report=mutateArtifact(v.f,v.receipt.report,a=>{delete a.startTime;});r.json=v.receipt.report;}],
])test('Jest reconciliation rejects '+label,()=>{const v=preservedJestReconciliation();change(v);v.rebind();assert.throws(v.check);});

function observedSupersetFixture() {
 const v=preservedJestReconciliation();const {f,receipt,actual}=v;const required=receipt.source_inputs.map(x=>x.path);const runner='scripts/run-coverage-gate.mjs';
 const runnerInputs=['scripts/garmin-cli-coverage-evidence.mjs','scripts/phase18-language-coverage.mjs','scripts/phase20-subprocess-coverage.mjs','scripts/v12-posix-process-tree.mjs',runner];
 const literals=['scripts/phase19-integrity-coverage.json','assets/content/exercise-library.v1.review.json','tests/fixtures/garmin-json/discovery-running-summary.json'];
 for(const file of [...runnerInputs,...literals]){const bytes=readFileSync(file);f.sources.set(f.authority.source.head+':'+file,bytes);receipt.source_inputs.push({path:file,sha256:hash(bytes)});}
 const test=receipt.test_files[0];f.sources.set(f.authority.source.head+':'+test,Buffer.from(f.sources.get(f.authority.source.head+':'+test).toString()+literals.slice(1).map(p=>`\nreadFileSync('${p}');`).join('')));receipt.source_inputs.find(x=>x.path===test).sha256=hash(f.sources.get(f.authority.source.head+':'+test));
 f.authority.sourceClosure=(_head,files)=>files.includes(runner)?['package.json','package-lock.json',...runnerInputs]:required;
 actual.source_inputs=receipt.source_inputs;
 const snapshots=()=>{receipt.input_snapshot_before=f.bind(receipt.input_snapshot_before.path,{execution_context_head:receipt.source_head,source_inputs:receipt.source_inputs});receipt.input_snapshot_after=f.bind(receipt.input_snapshot_after.path,{execution_context_head:receipt.source_head,source_inputs:receipt.source_inputs,report_sha256:actual.report_sha256});v.rebind();};snapshots();return{...v,required,runnerInputs,literals,snapshots};
}
test('observed source superset retains genuine runner/config/literal fixture inputs and binds the complete actual list',()=>{const v=observedSupersetFixture();assert.equal(v.receipt.source_inputs.length,v.required.length+8);assert.equal(v.check(),true);});
for(const[label,change]of [
 ['unrelated extra',v=>{const file='src/unrelated.ts';const bytes=Buffer.from('unrelated');v.f.sources.set(v.f.authority.source.head+':'+file,bytes);v.receipt.source_inputs.push({path:file,sha256:hash(bytes)});v.snapshots();}],
 ['missing required input',v=>{v.receipt.source_inputs.splice(v.receipt.source_inputs.findIndex(x=>x.path===v.item.id),1);v.snapshots();}],
 ['changed extra bytes',v=>{v.f.sources.set(v.f.authority.source.head+':'+v.literals[0],Buffer.from('changed'));}],
 ['missing actual execution',v=>{delete v.receipt.actual_execution;v.item.execution=v.f.bind(v.item.execution.path,v.receipt);}],
 ['missing full before snapshot',v=>{delete v.receipt.input_snapshot_before;v.rebind();}],
 ['projected actual list',v=>{v.actual.source_inputs=v.receipt.source_inputs.filter(x=>v.required.includes(x.path));v.rebind();}],
 ['projected before list',v=>{v.receipt.input_snapshot_before=mutateArtifact(v.f,v.receipt.input_snapshot_before,b=>{b.source_inputs=b.source_inputs.filter(x=>v.required.includes(x.path));});v.rebind();}],
])test('observed source superset rejects '+label,()=>{const v=observedSupersetFixture();change(v);assert.throws(v.check);});

const configWitness={path:'artifacts/native/personal-closeout-20261027/jest-config-compatibility-witness-v2.json',sha256:'afdc8c62eda8ca75857b065ed84e4ed1e5eb98a46432f4780cdb09a84110be9d'};
function legacyConfigCompatibilityFixture(){
 const v=legacyGateFixture();const {f,item,oldRead}=v;const file='jest.config.js';const old=oldRead(file);const current=readFileSync(file);
 f.sources.set(LEGACY_COMPLETE_GATE.head+':'+file,old);f.sources.set(f.authority.source.head+':'+file,current);item.source_inputs.push({path:file,sha256:hash(old),current_sha256:hash(current)});const required=item.source_inputs.map(x=>x.path).sort();f.authority.executableClosure=()=>required;
 item.runner_compatibility=configWitness;f.files.set(configWitness.path,readFileSync(configWitness.path));const witness=parse(f.read(configWitness.path));f.files.set(witness.source_witness.path,readFileSync(witness.source_witness.path));return v;
}
test('pinned native-router config isolation preserves ordinary legacy module execution projects',()=>{const v=legacyConfigCompatibilityFixture();assert.ok(!v.f.check().missing_requirements.includes('coverage:'+v.item.id));});
for(const[label,change]of [
 ['unlinked witness',v=>{delete v.item.runner_compatibility;}],
 ['unapproved current config',v=>{const file='jest.config.js';const bytes=Buffer.from(v.f.sources.get(v.f.authority.source.head+':'+file).toString().replace('testEnvironment: "node"','testEnvironment: "jsdom"'));v.f.sources.set(v.f.authority.source.head+':'+file,bytes);v.item.source_inputs.find(x=>x.path===file).current_sha256=hash(bytes);} ],
 ['unapproved old config',v=>{const file='jest.config.js';const bytes=Buffer.from(v.f.sources.get(LEGACY_COMPLETE_GATE.head+':'+file).toString().replace('testEnvironment: "node"','testEnvironment: "jsdom"'));v.f.sources.set(LEGACY_COMPLETE_GATE.head+':'+file,bytes);v.item.source_inputs.find(x=>x.path===file).sha256=hash(bytes);} ],
 ['moved router scope',v=>{const file='app/__tests__/recovery-router-transition.test.tsx';const bytes=Buffer.from('test source');v.f.sources.set(LEGACY_COMPLETE_GATE.head+':'+file,bytes);v.f.sources.set(v.f.authority.source.head+':'+file,bytes);v.item.source_inputs.push({path:file,sha256:hash(bytes),current_sha256:hash(bytes)});v.f.authority.executableClosure=()=>v.item.source_inputs.map(x=>x.path).sort();}],
])test('native-router config compatibility remains nonpassing for '+label,()=>{const v=legacyConfigCompatibilityFixture();change(v);assert.ok(v.f.check().missing_requirements.includes('coverage:'+v.item.id));});
test('native-router compatibility rejects altered policy and source witness bindings',()=>{for(const change of [v=>{v.item.runner_compatibility={...configWitness,sha256:'e'.repeat(64)};},v=>{v.f.files.set(configWitness.path,Buffer.from('{}'));},v=>{const witness=parse(v.f.read(configWitness.path));v.f.files.set(witness.source_witness.path,Buffer.from('changed review'));}]){const v=legacyConfigCompatibilityFixture();change(v);assert.throws(v.f.check);}});
test('native-router config compatibility also binds each of the three later tool threshold epochs',()=>{
 for(const[id,descriptor]of Object.entries(RETAINED_TOOL_THRESHOLDS)){
  const v=legacyConfigCompatibilityFixture();const {f}=v;for(const binding of [descriptor.log,descriptor.receipt])f.files.set(binding.path,readFileSync(binding.path));const required=[id,...descriptor.tests,'jest.config.js'].sort();
  const source_inputs=required.map(file=>{const old=childProcess.execFileSync('/usr/bin/git',['show',descriptor.head+':'+file]);const current=file==='jest.config.js'?readFileSync(file):old;f.sources.set(descriptor.head+':'+file,old);f.sources.set(f.authority.source.head+':'+file,current);return{path:file,sha256:hash(old),current_sha256:hash(current)};});
  f.authority.executableClosure=()=>required;f.evidence.integrity=[{kind:'inherited-tool-threshold',id,receipt:descriptor.receipt,source_inputs,replacements:[],runner_compatibility:configWitness}];assert.ok(!f.check().missing_requirements.includes('coverage:'+id));
 }
});
test('source input closure reads actual AST dependencies and ignores quoted fixture import/require text',t=>{
 const f=mockRootAuthority(t);try{
  f.put('tests/context.test.mjs',`const fixtureText = "import './absent.mjs'; require('./ghost.mjs');"; import './dep.mjs'; export { n } from './dep.mjs'; require.resolve('./dep.mjs'); jest.mock('./dep.mjs'); requireActual('./dep.mjs');`);
  assert.ok(f.authority.sourceClosure(f.authority.source.head,['tests/context.test.mjs']).includes('tests/dep.mjs'));
  f.put('tests/context.test.mjs',`const fixtureText = "import './dep.mjs';"; import('./actually-missing.mjs');`);
  assert.throws(()=>f.authority.sourceClosure(f.authority.source.head,['tests/context.test.mjs']),/source_dependency_invalid/);
 }finally{f.cleanup();}
});

const retainedContractBinding={path:'artifacts/native/personal-closeout-20261027/retained-coverage-contracts-v2.json',sha256:'ee5de8e6026727a9656916db37d6d76abdb73fdd39653e9e5c041dd3d7b9807c'};
function retainedCoverageFixture(format,id){
 const f=fixture();const contracts=parse(readFileSync(retainedContractBinding.path));const descriptor=contracts[format];id??=descriptor.modules[0];
 const sourceCache=new Map();const current=new Map();const original=file=>{if(!sourceCache.has(file))sourceCache.set(file,childProcess.execFileSync('/usr/bin/git',['show',descriptor.head+':'+file]));return sourceCache.get(file);};
 // Synthetic authority binds preserved original data; it never claims current/native acceptance.
 f.authority.readSource=(head,file)=>head===f.authority.source.head?(current.get(file)??original(file)):original(file);
 const test=id.replace(/\.mjs$/u,'.test.mjs');f.authority.executableClosure=(_head,file)=>[file,...(file===test?[id]:[])];
 const tests=format==='node17'?descriptor.tests.filter(file=>f.authority.executableClosure(descriptor.head,file).includes(id)):format==='packaging'?parse(readFileSync(descriptor.seal.path)).tests.files:descriptor.tests;
 let required=[id,...tests];
 if(format==='node17'||format==='quality108')required.push('scripts/run-coverage-gate.mjs','scripts/phase20-subprocess-coverage.mjs');
 if(format==='packaging'){const seal=parse(readFileSync(descriptor.seal.path));required.push(...[...seal.source.files,...seal.source.dependencies].map(x=>x.path),path.posix.join(path.posix.dirname(seal.manifest.path),seal.output.filename));}
 required=[...new Set(required)].sort();
 const item={kind:format==='packaging'?'sealed-packaging-coverage':format==='sync101'?'source-owned-jest-threshold':'source-owned-complete-node-gate',id,gate:descriptor.seal??descriptor.log,source_inputs:required.map(file=>({path:file,sha256:hash(original(file)),current_sha256:hash(original(file))})),replacements:[]};
 const read=file=>f.files.has(file)?f.files.get(file):readFileSync(file);const check=()=>validatePersonalCoverageProof(item,read,f.authority);
 return{f,contracts,descriptor,item,current,original,read,check};
}
test('remaining retained source-owned node17 and quality108 gates preserve actual reports and original epochs',()=>{for(const format of ['node17','quality108']){const v=retainedCoverageFixture(format);assert.equal(v.check(),true);assert.equal(v.item.gate.sha256,v.descriptor.log.sha256);}});
test('remaining retained sync101 consumes actual threshold log and independently bound source/test inputs',()=>{const v=retainedCoverageFixture('sync101','src/testing/garminSyncDiagnostic.ts');assert.equal(v.check(),true);});
test('remaining retained packaging recomputes all four module counters from actual sealed18raw/30TAP receipts',()=>{const contracts=parse(readFileSync(retainedContractBinding.path));for(const id of contracts.packaging.modules){const v=retainedCoverageFixture('packaging',id);assert.equal(v.check(),true);}});
for(const[label,change]of [
 ['unapproved gate',v=>{v.item.gate={...v.item.gate,sha256:'e'.repeat(64)};}],
 ['changed original runner',v=>{v.f.authority.readSource=(head,file)=>file==='scripts/run-coverage-gate.mjs'?Buffer.from('changed runner'):v.original(file);}],
 ['changed original environment',v=>{v.f.files.set(v.descriptor.environment.path,Buffer.from('{}'));}],
 ['changed actual project TAP',v=>{v.f.files.set(v.descriptor.projects[0].report.path,Buffer.from('TAP version 13\nnot ok 1 - failed\n1..1\n'));}],
 ['changed actual metrics',v=>{v.f.files.set(v.descriptor.coverage.path,Buffer.from('{}'));}],
 ['missing required input',v=>{v.item.source_inputs.pop();}],
 ['substituted required input',v=>{v.item.source_inputs[0].current_sha256='e'.repeat(64);}],
 ['unapproved contract',v=>{v.f.files.set(retainedContractBinding.path,Buffer.from('{}'));}],
])test('remaining retained node gate rejects '+label,()=>{const v=retainedCoverageFixture('node17');change(v);assert.throws(v.check);});
test('remaining retained missing actual module-test join stays NOT_READY',()=>{const v=retainedCoverageFixture('node17');v.f.authority.executableClosure=(_head,file)=>[file];assert.equal(v.check(),false);});
for(const format of ['node17','quality108','sync101','packaging'])test('remaining retained '+format+' changed module or executable dependency stays NOT_READY without current proof',()=>{
 const v=retainedCoverageFixture(format,format==='sync101'?'src/testing/garminSyncDiagnostic.ts':undefined);const bytes=Buffer.from('export const changed = 42;');v.current.set(v.item.id,bytes);v.item.source_inputs.find(x=>x.path===v.item.id).current_sha256=hash(bytes);assert.equal(v.check(),false);
});
test('remaining retained packaging rejects altered producer/input/output/raw/process streams',()=>{
 for(const key of ['producer','inputs','coverage','stdout']){const v=retainedCoverageFixture('packaging');v.f.files.set(v.descriptor[key].path,Buffer.from('changed'));assert.throws(v.check);}
 for(const get of [s=>s.raw[0],s=>s.invocations[0].processReceipt,s=>s.receipt]){const v=retainedCoverageFixture('packaging');const seal=parse(v.read(v.descriptor.seal.path));const b=get(seal);v.f.files.set(path.posix.join(path.posix.dirname(v.descriptor.seal.path),b.path),Buffer.from('changed'));assert.throws(v.check);}
});
test('remaining retained assembly scope preserves exact required immutable facts without manufacturing observations',()=>{for(const format of ['node17','quality108','sync101','packaging']){const v=retainedCoverageFixture(format);const scope=personalRetainedCoverageInputScope(v.item,v.read,v.f.authority);assert.equal(scope.source_head,v.descriptor.head);assert.equal(scope.module_test_join_ready,true);assert.deepEqual(scope.required_inputs,v.item.source_inputs.map(x=>x.path));}const v=retainedCoverageFixture('node17');assert.throws(()=>personalRetainedCoverageInputScope(null,v.read,v.f.authority),/retained_scope_authority_invalid/);assert.throws(()=>personalRetainedCoverageInputScope({...v.item,kind:'fake'},v.read,v.f.authority),/retained_gate_invalid/);});

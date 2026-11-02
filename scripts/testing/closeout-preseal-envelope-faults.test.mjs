import assert from"node:assert/strict";
import{execFileSync}from"node:child_process";
import{createHash}from"node:crypto";
import{copyFileSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,symlinkSync,writeFileSync,rmSync,existsSync}from"node:fs";
import path from"node:path";
import test from"node:test";
import{pathToFileURL}from"node:url";
import{createV12RunManifest}from"../create-v12-run-manifest.mjs";
import{sourceTreeSha256}from"../source-tree-digest.mjs";
import{resolveV12GitExecution}from"../v12-native-execution-origin.mjs";
import{phase18DeviceIdentitySha256}from"../phase18-device-identity.mjs";
import{digestV12CanonicalRestorationSnapshot}from"../v12-device-settings-contract.mjs";
import{V12_NATIVE_PROVENANCE_REGISTRY}from"../verify-v12-native-evidence.mjs";
import{withFaultProof}from"./closeout-fault-proof.mjs";

const sha=bytes=>createHash("sha256").update(bytes).digest("hex"),project=process.cwd(),target="scripts/verify-v12-native-evidence.mjs";
const url=name=>JSON.stringify(pathToFileURL(path.join(project,"scripts",name)).href);

test("a final consumer rejects missing or malformed preseal authority before any publication",async t=>{
  const base=path.join(project,"artifacts/native/personal-closeout-20261027/verifier-coverage/preseal-envelope-faults");mkdirSync(base,{recursive:true});
  const tree=mkdtempSync(path.join(base,"subject-"));mkdirSync(path.join(tree,"scripts"));copyFileSync(path.join(project,target),path.join(tree,target));
  const overrides=["run-v12-maestro.mjs","v12-native-execution-origin.mjs","v12-rollback-evidence.mjs"];
  for(const file of readdirSync(path.join(project,"scripts"))){if(file===path.basename(target)||overrides.includes(file))continue;symlinkSync(path.join(project,"scripts",file),path.join(tree,"scripts",file));}
  const gitExecution=resolveV12GitExecution(),rollback={fixture_only:true},gitHash="a".repeat(64);
  writeFileSync(path.join(tree,"scripts/run-v12-maestro.mjs"),`export {createV12DirectMaestroToolAttestation,readV12DirectMaestroDeviceMeasurement,V12_MAESTRO_SOURCE_PATHS,validateV12CalendarManifest,validateV12DirectMaestroMapping}from ${url("run-v12-maestro.mjs")};export function validateV12LiveSourceLineage(){return true;}\n`);
  writeFileSync(path.join(tree,"scripts/v12-native-execution-origin.mjs"),`export {resolveV12GitExecution,resolveV12NativeExecutionTools}from ${url("v12-native-execution-origin.mjs")};export function readV12RetainedGitExecution(){return ${JSON.stringify({...gitExecution,retained_sha256:gitHash})};}\n`);
  writeFileSync(path.join(tree,"scripts/v12-rollback-evidence.mjs"),`export {V12_ROLLBACK_PUBLICATION_MEMBERS}from ${url("v12-rollback-evidence.mjs")};export function verifyV12RollbackEvidence(){return ${JSON.stringify(rollback)};}\n`);
  const root=mkdtempSync(path.join(tree,"case-"));
  const git=args=>execFileSync(gitExecution.executable,args,{cwd:root,encoding:"utf8"}).trim();
  git(["init","--quiet"]);git(["config","user.email","fixture@example.invalid"]);git(["config","user.name","Test fixture"]);
  for(const definition of Object.values(V12_NATIVE_PROVENANCE_REGISTRY))for(const role of ["adapter","launcher","domain"]){const file=path.join(root,definition[role]);mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,"synthetic source binding for rejection only\n");}
  git(["add","."]);git(["commit","--quiet","-m","synthetic fixture"]);const head=git(["rev-parse","HEAD"]);
  const run=`phase20-20261017T000000Z-${head.slice(0,12)}`,prefix=`artifacts/native/v1.2/${run}`;
  const apk=Buffer.from("504b0304aabbccdd","hex"),apkPath="artifacts/native/v1.2-acceptance/app.apk",signature=`Verified using v2 scheme (APK Signature Scheme v2): true\nSigner #1 certificate SHA-256 digest: ${"ab".repeat(32)}\n`;
  mkdirSync(path.dirname(path.join(root,apkPath)),{recursive:true});writeFileSync(path.join(root,apkPath),apk);
  const serial="controlled-preseal-device",settings=digestV12CanonicalRestorationSnapshot({font_scale:"1.0",ui_night_mode:"0",animator_duration_scale:"1.0"});
  const build=createV12RunManifest({input:{created_at:"2026-10-17T00:00:00Z",evidence_origin:"native",source:{head,tree_sha256:sourceTreeSha256(root),dirty:false,package_json_sha256:"b".repeat(64),package_lock_sha256:"c".repeat(64)},
    planning:{matrix_sha256:"d".repeat(64),requirements_sha256:"e".repeat(64),source_manifest_sha256:"f".repeat(64),owner_brief_sha256:"1".repeat(64),ui_spec_sha256:"2".repeat(64),deviations_sha256:"3".repeat(64)},prototype:{revision:18,approval_sha256:"4".repeat(64),html_sha256:"5".repeat(64)},fixtures:{registry_sha256:"6".repeat(64)},
    build:{profile:"development-test",package:"com.fchoo.gymtracker.devtest",version_name:"1.2.0",version_code:1,apk:{path:apkPath,sha256:sha(apk),size_bytes:apk.length,page_alignment_verified:true,signature_sha256:sha(signature),certificate_sha256:"ab".repeat(32)}},
    device:{identity_sha256:phase18DeviceIdentitySha256({serial,abi:"arm64-v8a",apiLevel:"36",model:"Controlled Device"}),abi:"arm64-v8a",installed_apk_sha256:sha(apk),settings_sha256:settings,restoration_sha256:settings},configuration:{id:"AP-L-C390-P-F100"}}});
  const write=(relative,value)=>{const file=path.join(root,relative);mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,typeof value==="string"?value:JSON.stringify(value));};
  write(`${prefix}/build.json`,build);
  for(const [shard,definition]of Object.entries(V12_NATIVE_PROVENANCE_REGISTRY))write(`${prefix}/publication/${shard}.json`,{members:[],execution_origin:{schema_version:1,action:definition.actions[0],kind:"production-default-launcher",toolchain_origin:"production-attested/v1",default_launcher:true,test_only:false,
    adapter_source_sha256:sha(readFileSync(path.join(root,definition.adapter))),launcher_source_sha256:sha(readFileSync(path.join(root,definition.launcher))),domain_source_sha256:sha(readFileSync(path.join(root,definition.domain))),request_attestation_sha256:"7".repeat(64)}});
  const sdk=path.join(root,"artifacts/fake-sdk");mkdirSync(path.join(sdk,"build-tools/36.0.0"),{recursive:true});mkdirSync(path.join(sdk,"platform-tools"));
  writeFileSync(path.join(sdk,"build-tools/36.0.0/apksigner"),`#!/bin/sh\nprintf '%s' '${signature}'\n`,{mode:0o755});
  writeFileSync(path.join(sdk,"platform-tools/adb"),["#!/bin/sh","case \"$*\" in","*get-state*) printf 'device\\n';;","*ro.product.cpu.abi*) printf 'arm64-v8a\\n';;","*ro.build.version.sdk*) printf '36\\n';;","*ro.product.model*) printf 'Controlled Device\\n';;","*\"pm path\"*) printf 'package:/data/app/~~fixture==/control/base.apk\\n';;",`*sha256sum*) printf '${sha(apk)} base.apk\\n';;`,"*\"exec-out cat\"*) printf '\\120\\113\\003\\004\\252\\273\\314\\335';;","*font_scale*) printf '1.0\\n';;","*ui_night_mode*) printf '0\\n';;","*animator_duration_scale*) printf '1.0\\n';;","*\"[ ! -e \"*) printf 'clear\\n';;","*) exit 1;;","esac"].join("\n"),{mode:0o755});
  const envKeys=["NODE_ENV","V12_PHASE20_BLACKBOX","V12_NATIVE_ADAPTER_TEST_MODE","V12_NATIVE_ADAPTER_TEST_PROCESS","V12_NATIVE_ADAPTER_COMMAND","ANDROID_HOME","ANDROID_SDK_ROOT","V12_DEVICE_SERIAL","PATH"];
  const prior=Object.fromEntries(envKeys.map(key=>[key,process.env[key]]));for(const key of envKeys.slice(0,5))delete process.env[key];Object.assign(process.env,{ANDROID_HOME:sdk,ANDROID_SDK_ROOT:sdk,V12_DEVICE_SERIAL:serial,PATH:`${path.join(sdk,"platform-tools")}:${prior.PATH}`});
  const original={schema_version:3,producer:"v12-preseal-validation/v3",run_id:run,evidence_origin:"native",mode:"preseal",release_authorized:false,git_attestation_sha256:gitHash,row_evidence:[],contract_identity:{},rollback_evidence:rollback};
  const cases=[["missing",undefined],["malformed","notJSON"],["null",null],...Object.keys(original).map(field=>[field,{...original,[field]:null}])];
  try{for(const [name,value]of cases)await t.test(name,async()=>{
    const file=path.join(root,prefix,"preseal-validation.json");if(existsSync(file))rmSync(file);if(value!==undefined)write(`${prefix}/preseal-validation.json`,value);
    await withFaultProof({tree,subject:target,testFile:"scripts/testing/closeout-preseal-envelope-faults.test.mjs",reason:`Forged native authorities with invalid preseal ${name}`,overrides:overrides.map(file=>"scripts/"+file),operation:async()=>{
      const verifier=await import(pathToFileURL(path.join(tree,target)).href);
      assert.throws(()=>verifier.executeV12EvidenceCli(["--run",run,"--mode","final"],{root}),/v12_preflight_preseal_invalid/u);
      assert.equal(existsSync(path.join(root,prefix,"publication/final.json")),false);
    }});
  });}finally{for(const [key,value]of Object.entries(prior)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});

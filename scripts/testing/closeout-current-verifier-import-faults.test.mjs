import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import{withFaultProof}from"./closeout-fault-proof.mjs";

const project=process.cwd();
const base=path.join(project,"artifacts/native/personal-closeout-20261027/verifier-coverage/verifier-import-faults-current-4a5");
const target="scripts/verify-v12-native-evidence.mjs";
const expected="4a5aeec59bcc579095316cacf282d44bab17749bfd2f1a976afb4ae667292e72";
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");

function isolatedTarget(dependencies){
  mkdirSync(base,{recursive:true});const tree=mkdtempSync(path.join(base,"fault-"));mkdirSync(path.join(tree,"scripts"));
  copyFileSync(path.join(project,target),path.join(tree,target));
  for(const file of readdirSync(path.join(project,"scripts"))){
    if(file===path.basename(target)||Object.hasOwn(dependencies,file))continue;
    symlinkSync(path.join(project,"scripts",file),path.join(tree,"scripts",file));
  }
  for(const [name,source]of Object.entries(dependencies))writeFileSync(path.join(tree,"scripts",name),source);
  assert.equal(hash(readFileSync(path.join(tree,target))),expected);
  writeFileSync(path.join(tree,"fault-binding.json"),JSON.stringify({test_only:true,fault_injection:true,target_source_sha256:expected,
    native_acceptance_proof:false,full_dependency_equality_claimed:false,dependencies:Object.entries(dependencies).map(([name,source])=>({path:"scripts/"+name,
      production_sha256:hash(readFileSync(path.join(project,"scripts",name))),fixture_sha256:hash(source)}))},null,2)+"\n");
  return tree;
}

test("the verifier's parser rejects malformed artifacts even if an imported privacy helper wrongly accepts them",async()=>{
  const original=pathToFileURL(path.join(project,"scripts/v12-artifact-privacy.mjs")).href;
  const tree=isolatedTarget({"v12-artifact-privacy.mjs":`export {assertV12PrivacySafeValue} from ${JSON.stringify(original)}; export function assertV12ArtifactPrivacySafe(){return true;}\n`});
  const verifier=await import(pathToFileURL(path.join(tree,target)).href);
  const root=mkdtempSync(path.join(tree,"case-"));const run="phase20-20261017T000000Z-aaaaaaaaaaaa";const prefix=`artifacts/native/v1.2/${run}`;
  const manifest=JSON.parse(readFileSync(path.join(project,"artifacts/native/personal-closeout-20261027/verifier-coverage/sdk-repaired-fixture/artifacts/native/v1.2",readdirSync("artifacts/native/personal-closeout-20261027/verifier-coverage/sdk-repaired-fixture/artifacts/native/v1.2").find(name=>name.startsWith("phase20-")),"build.json"),"utf8"));
  const retainedRun=manifest.run_id;const retainedPrefix=`artifacts/native/v1.2/${retainedRun}`;
  mkdirSync(path.join(root,retainedPrefix,"sqlite"),{recursive:true});mkdirSync(path.join(root,retainedPrefix,"publication"));
  writeFileSync(path.join(root,retainedPrefix,"build.json"),JSON.stringify(manifest));
  const artifact="sqlite/migration.json";const bytes=Buffer.from("malformed fixture JSON");
  writeFileSync(path.join(root,retainedPrefix,artifact),bytes);
  const publication={schema_version:1,producer:"v12-atomic-shard-publication/v1",run_id:retainedRun,shard:"sqlite",identity:null,members:[{artifact,sha256:hash(bytes),size_bytes:bytes.length}],completed:true};
  const actual=JSON.parse(readFileSync(path.join(project,"artifacts/native/personal-closeout-20261027/verifier-coverage/sdk-repaired-fixture",retainedPrefix,"publication/sqlite.json"),"utf8"));
  const originalAtomic=pathToFileURL(path.join(project,"scripts/v12-atomic-shard-publication.mjs")).href;
  // A second isolated dependency simulates a compromised publication validator.
  // The consumer still must reject malformed retained JSON, with no writes.
  const tree2=isolatedTarget({"v12-artifact-privacy.mjs":`export {assertV12PrivacySafeValue} from ${JSON.stringify(original)}; export function assertV12ArtifactPrivacySafe(){return true;}\n`,
    "v12-atomic-shard-publication.mjs":`export {publishV12AtomicShard,validateV12ExecutionOrigin} from ${JSON.stringify(originalAtomic)}; export function verifyV12AtomicShard(){return true;}\n`});
  for(const member of actual.members){const content=member.artifact===artifact?bytes:Buffer.from('{"producer":"bounded-fixture"}');mkdirSync(path.dirname(path.join(root,retainedPrefix,member.artifact)),{recursive:true});writeFileSync(path.join(root,retainedPrefix,member.artifact),content);member.sha256=hash(content);member.size_bytes=content.length;}
  writeFileSync(path.join(root,retainedPrefix,"publication/sqlite.json"),JSON.stringify(actual));
  await withFaultProof({tree:tree2,subject:target,testFile:"scripts/testing/closeout-current-verifier-import-faults.test.mjs",
    reason:"Imported privacy and publication validators wrongly accept malformed JSON",overrides:["scripts/v12-artifact-privacy.mjs","scripts/v12-atomic-shard-publication.mjs"],operation:async()=>{
      const consumer=await import(pathToFileURL(path.join(tree2,target)).href);
      assert.throws(()=>consumer.executeV12EvidenceCli(["--run",retainedRun,"--mode","shards-only","--ids","sqlite"],{root}),/v12_preflight_json_schema_invalid/u);
    }});
});

test("forged imported native authorities cannot authorize preseal from a test-controlled environment",async()=>{
  const url=name=>JSON.stringify(pathToFileURL(path.join(project,"scripts",name)).href);
  const tree=isolatedTarget({
    "run-v12-maestro.mjs":`export {createV12DirectMaestroToolAttestation,readV12DirectMaestroDeviceMeasurement,V12_MAESTRO_SOURCE_PATHS,validateV12CalendarManifest,validateV12DirectMaestroMapping} from ${url("run-v12-maestro.mjs")};export function validateV12LiveSourceLineage(){return true;}\n`,
    "v12-native-execution-origin.mjs":`export {resolveV12GitExecution,resolveV12NativeExecutionTools} from ${url("v12-native-execution-origin.mjs")};export function readV12RetainedGitExecution(){return {executable:'/usr/bin/false',retained_sha256:'${"a".repeat(64)}'};}\n`,
    "v12-rollback-evidence.mjs":`export {V12_ROLLBACK_PUBLICATION_MEMBERS} from ${url("v12-rollback-evidence.mjs")};export function verifyV12RollbackEvidence(){return {fixture_only:true};}\n`,
  });
  const archive=path.join(project,"artifacts/native/personal-closeout-20261027/verifier-coverage/sdk-repaired-fixture");
  const run=readdirSync(path.join(archive,"artifacts/native/v1.2")).find(name=>name.startsWith("phase20-"));
  const root=mkdtempSync(path.join(tree,"case-")),prefix=`artifacts/native/v1.2/${run}`;
  const manifest=JSON.parse(readFileSync(path.join(archive,prefix,"build.json"),"utf8"));manifest.evidence_origin="native";
  mkdirSync(path.join(root,prefix),{recursive:true});writeFileSync(path.join(root,prefix,"build.json"),JSON.stringify(manifest));
  const fields=["NODE_ENV","V12_PHASE20_BLACKBOX","V12_NATIVE_ADAPTER_TEST_MODE","V12_NATIVE_ADAPTER_TEST_PROCESS","V12_NATIVE_ADAPTER_COMMAND"];
  const prior=Object.fromEntries(fields.map(name=>[name,process.env[name]]));
  await withFaultProof({tree,subject:target,testFile:"scripts/testing/closeout-current-verifier-import-faults.test.mjs",
    reason:"Imported source/Git/rollback authorities falsely assert native readiness inside a test process",
    overrides:["scripts/run-v12-maestro.mjs","scripts/v12-native-execution-origin.mjs","scripts/v12-rollback-evidence.mjs"],operation:async()=>{
      const verifier=await import(pathToFileURL(path.join(tree,target)).href);
      try{
        for(const field of fields){
          for(const name of fields)delete process.env[name];process.env[field]=field==="NODE_ENV"?"test":"controlled-fixture";
          assert.throws(()=>verifier.executeV12EvidenceCli(["--run",run,"--mode","preseal","--no-final-write"],{root}),/v12_preflight_test_provenance_forbidden/u);
          assert.deepEqual(readdirSync(path.join(root,prefix)),["build.json"]);
        }
      }finally{for(const [field,value]of Object.entries(prior)){if(value===undefined)delete process.env[field];else process.env[field]=value;}}
    }});
});

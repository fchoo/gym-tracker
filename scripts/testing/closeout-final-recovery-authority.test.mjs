import assert from"node:assert/strict";
import{mkdirSync,mkdtempSync,readFileSync,readdirSync,realpathSync,rmSync,writeFileSync,existsSync}from"node:fs";
import{tmpdir}from"node:os";
import path from"node:path";
import{createHash}from"node:crypto";
import test from"node:test";
import{buildV12ReadinessHandoff}from"../create-v12-readiness-handoff.mjs";
import{recoverV12FinalPublication}from"../verify-v12-native-evidence.mjs";
import{finalEvidence,rollback,runId}from"./closeout-handoff-schema-fixture.mjs";

test("a full-sized staged schema cannot authorize recovery from a retained test-origin build",t=>{
  const root=realpathSync(mkdtempSync(path.join(tmpdir(),"closeout-full-schema-forgery-")));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const archive=process.env.V12_PHASE20_COVERAGE_FIXTURE;assert.equal(typeof archive,"string");
  const retainedRun=readdirSync(path.join(archive,"artifacts/native/v1.2")).find(name=>name.startsWith("phase20-"));
  const build=JSON.parse(readFileSync(path.join(archive,"artifacts/native/v1.2",retainedRun,"build.json"),"utf8"));
  const prefix=`artifacts/native/v1.2/${build.run_id}`,directory=path.join(root,prefix),stage=path.join(directory,".staging/final");mkdirSync(stage,{recursive:true});
  const evidence=finalEvidence({run_id:build.run_id});evidence.identity={...evidence.identity,run_id:build.run_id};
  const handoff=buildV12ReadinessHandoff({final_evidence:evidence,rollback,reviewed_policy:evidence.policy,generated_at:"2026-10-17T00:00:00.000Z"});
  const matrix={rows:evidence.rows,verdict_counts:evidence.verdict_counts,readiness:evidence.readiness};
  const values={"final-evidence.json":evidence,"ui-state-matrix.json":matrix,"readiness-handoff.md":handoff,"parity-report.md":"Synthetic forgery for rejection only\n"};
  const members=[];for(const [artifact,value]of Object.entries(values)){const bytes=Buffer.from(typeof value==="string"?value:JSON.stringify(value));writeFileSync(path.join(stage,artifact),bytes);members.push({artifact,size_bytes:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex")});}
  writeFileSync(path.join(stage,"manifest.json"),JSON.stringify({schema_version:1,run_id:build.run_id,shard:"final",members,completed:true}));
  writeFileSync(path.join(directory,"build.json"),JSON.stringify(build));
  assert.throws(()=>recoverV12FinalPublication(root,build.run_id),/v12_preflight_test_origin_forbidden/u);
  assert.equal(existsSync(path.join(directory,"publication/final.json")),false);
  assert.equal(existsSync(stage),true);
});

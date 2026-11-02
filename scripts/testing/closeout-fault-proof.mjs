import assert from "node:assert/strict";
import {execFileSync}from"node:child_process";
import{createHash}from"node:crypto";
import{readFileSync,writeFileSync}from"node:fs";
import path from"node:path";

const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const gitSha=relative=>{
  try{return sha(execFileSync("git",["show",`HEAD:${relative}`],{stdio:["ignore","pipe","ignore"]}));}
  catch{return null;}
};

export async function withFaultProof({tree,subject,testFile,reason,overrides,operation}){
  const root=process.cwd();
  const snapshot=()=>({
    subject:{repo_path:subject,current_source_sha256:sha(readFileSync(path.join(root,subject))),fixture_source_sha256:sha(readFileSync(path.join(tree,subject))),git_source_sha256:gitSha(subject)},
    test:{repo_path:testFile,source_sha256:sha(readFileSync(path.join(root,testFile)))},
    overrides:overrides.map(relative=>({repo_path:relative,git_source_sha256:gitSha(relative),current_source_sha256:sha(readFileSync(path.join(root,relative))),
      fixture_artifact_path:path.join(tree,relative),fixture_artifact_sha256:sha(readFileSync(path.join(tree,relative)))})),
    captured_at:new Date().toISOString(),
  });
  const before=snapshot();assert.equal(before.subject.current_source_sha256,before.subject.fixture_source_sha256);
  writeFileSync(path.join(tree,"fault-inputs-before.json"),JSON.stringify(before,null,2)+"\n");
  await operation();
  const after=snapshot();
  assert.deepEqual(after.subject,before.subject);assert.deepEqual(after.test,before.test);assert.deepEqual(after.overrides,before.overrides);
  writeFileSync(path.join(tree,"fault-inputs-after.json"),JSON.stringify(after,null,2)+"\n");
  const proof={schema_version:1,evidence_type:"HOST_COVERAGE_ONLY_FAULT_INJECTION",reason,test_only:true,
    production_acceptance_authority:false,native_acceptance_proof:false,full_dependency_equality_claimed:false,
    actual_outcome:"rejected_as_asserted",subject_override_forbidden:true,subject:before.subject,test:before.test,overrides:before.overrides,
    before:{path:path.join(tree,"fault-inputs-before.json"),sha256:sha(readFileSync(path.join(tree,"fault-inputs-before.json")))},
    after:{path:path.join(tree,"fault-inputs-after.json"),sha256:sha(readFileSync(path.join(tree,"fault-inputs-after.json")))},
  };
  writeFileSync(path.join(tree,"coverage-fixture-override-proof.json"),JSON.stringify(proof,null,2)+"\n");
}

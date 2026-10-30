import assert from "node:assert/strict";
import test from "node:test";
import { createV12AppFunctionalReadbacks, validateV12FunctionalCaseReadbacks, createV12FunctionalExecutionReceipt, validateV12FunctionalExecutionReceipt, createV12ProductCaseEnvironment, validateV12ProductCaseEnvironment } from "../run-v12-maestro.mjs";
import { v12NativeAcceptanceCaseContract } from "../../src/testing/contracts/phase15Workout.contract.ts";

const shard="workout",caseId="workout.root-identity",nonce="a".repeat(48);
const state={source_sha256:"b".repeat(64),row_count:2,schema_version:42};
const base=()=>createV12AppFunctionalReadbacks({shard,caseId,nonce,pre:state,action:state,post:state});
const hierarchy=value=>`<hierarchy><node content-desc="V12_SOURCE_RECEIPT:${encodeURIComponent(JSON.stringify(value.source_receipt))}"/><node content-desc="V12_UI_READBACK:${encodeURIComponent(JSON.stringify(value.ui_readback))}"/></hierarchy>`;
const verify=value=>validateV12FunctionalCaseReadbacks({shard,caseId,nonce,hierarchy:hierarchy(value),report:"<testsuite><testcase name='fixture'/></testsuite>"});

test("functional source and UI receipt validators reject every malformed declared field",async t=>{
  assert.deepEqual(verify(base()),base());
  const sourceFields=["schema_version","producer","authority","shard","case_id","nonce","action_id","operation_id","operation_kind","operation_result","operation_handler_id","operation_postcondition_id","operation_result_sha256","source_probe","authority_tables","command_receipt_id","command_outcome","committed_effects","action_request_sha256","source_receipt_sha256"];
  for(const field of sourceFields)await t.test("source "+field,()=>{
    const value=structuredClone(base());value.source_receipt[field]=value.source_receipt[field]===null?"unexpected":null;
    assert.throws(()=>verify(value),/v12_maestro_source_readback_invalid/u);
  });
  for(const phase of ["pre","action","post"])for(const field of ["probe_id","facts_sha256","source_sha256","row_count","table_count","schema_version"])await t.test(phase+" "+field,()=>{
    const value=structuredClone(base());value.source_receipt[phase][field]=null;
    assert.throws(()=>verify(value),/v12_maestro_source_readback_invalid/u);
  });
  for(const field of ["schema_version","producer","shard","case_id","nonce","declared_action","declared_readback","readback_id","source_receipt_sha256","ui_receipt_sha256"])await t.test("UI "+field,()=>{
    const value=structuredClone(base());value.ui_readback[field]=null;
    assert.throws(()=>verify(value),/v12_maestro_ui_readback_invalid/u);
  });
  assert.throws(()=>createV12AppFunctionalReadbacks({shard:"unknown",caseId,nonce}),/v12_maestro_case_contract_invalid/u);
  for(const field of ["actionId","sourceProbe","declaredReadback","authorityTables"]){
    assert.throws(()=>createV12AppFunctionalReadbacks({shard,caseId,nonce,pre:state,action:state,post:state,[field]:"wrong"}),/v12_maestro_case_contract_invalid/u);
  }
});

test("hierarchy and JUnit readers reject private, absent, duplicate, and undecodable receipts",()=>{
  for(const value of [null,"<node/>","<hierarchy><node password=\"true\"/></hierarchy>","<hierarchy><node text=\"fixture@example.invalid\"/></hierarchy>","<hierarchy><node content-desc=\"V12_SOURCE_RECEIPT:%FF\"/></hierarchy>",hierarchy(base()).replace("</hierarchy>",hierarchy(base())+"</hierarchy>")]){
    assert.throws(()=>validateV12FunctionalCaseReadbacks({shard,caseId,nonce,hierarchy:value,report:"<testsuite/>"}),/v12_maestro_source_readback_invalid/u);
  }
  for(const report of [null,"notxml","<testsuite><error/></testsuite>","<testsuite><skipped/></testsuite>"])assert.throws(()=>validateV12FunctionalCaseReadbacks({shard,caseId,nonce,hierarchy:hierarchy(base()),report}),/v12_maestro_junit_readback_invalid/u);
  const value=hierarchy(base()).replace(/V12_UI_READBACK:[^"]+/u,"V12_UI_READBACK:%FF");
  assert.throws(()=>validateV12FunctionalCaseReadbacks({shard,caseId,nonce,hierarchy:value,report:"<testsuite/>"}),/v12_maestro_ui_readback_invalid/u);
});

test("product environments reject invalid identities and modifications to canonical fields",()=>{
  for(const input of [{shard:"unknown",caseId,nonce},{shard,caseId:"unknown",nonce},{shard,caseId,nonce:"invalid"}])assert.throws(()=>createV12ProductCaseEnvironment(input),/v12_maestro_product_environment_invalid/u);
  const expected={shard,caseId,nonce};const value=createV12ProductCaseEnvironment(expected);
  assert.equal(validateV12ProductCaseEnvironment(value,expected),true);
  for(const field of Object.keys(value)){const copy=structuredClone(value);copy[field]=null;assert.throws(()=>validateV12ProductCaseEnvironment(copy,expected),/v12_maestro_product_environment_invalid/u);}
});

test("a product URL changing after its canonical byte check cannot bypass route validation",async t=>{
  const expected={shard,caseId,nonce},original=createV12ProductCaseEnvironment(expected);
  for(const [name,url]of [["malformed URL","not-a-url"],["foreign protocol","https://example.invalid/"],["foreign host","gymtracker-devtest://foreign/workout"],["wrong route","gymtracker-devtest:///unexpected"],["unexpected query",original.product_url+"&extra=1"]])await t.test(name,()=>{
    const value={...original};let reads=0;
    Object.defineProperty(value,"product_url",{enumerable:true,get:()=>++reads===1?original.product_url:url});
    assert.throws(()=>validateV12ProductCaseEnvironment(value,expected),/v12_maestro_product_environment_invalid/u);
    assert.ok(reads>=2);
  });
});

test("an expected product identity changing between canonicalization and lookup is rejected",()=>{
  const originalExpected={shard,caseId,nonce},environment=createV12ProductCaseEnvironment(originalExpected);
  const expected={...originalExpected};let reads=0;
  Object.defineProperty(expected,"shard",{enumerable:true,get:()=>++reads===1?shard:"unknown"});
  assert.throws(()=>validateV12ProductCaseEnvironment(environment,expected),/v12_maestro_product_environment_invalid/u);
  assert.ok(reads>=2);
});

test("execution receipts reject changed phase authority, nonce, digest, and byte ownership",async t=>{
  const proof=base();const manifest={source:{tree_sha256:"b".repeat(64)},build:{apk:{sha256:"c".repeat(64)}},device:{installed_apk_sha256:"c".repeat(64),identity_sha256:"d".repeat(64)},configuration:{id:"AP-L-C390-P-F100"}};
  const identity={source_tree_sha256:manifest.source.tree_sha256,apk_sha256:manifest.build.apk.sha256,installed_apk_sha256:manifest.device.installed_apk_sha256,device_identity_sha256:manifest.device.identity_sha256,configuration_id:manifest.configuration.id};
  const receipt=createV12FunctionalExecutionReceipt({nonce,runId:"phase20-20261017T000000Z-aaaaaaaaaaaa",shard,caseId,identity,sourceReceipt:proof.source_receipt,uiReadback:proof.ui_readback,pre:state,action:{report_sha256:"e".repeat(64)},post:{source_sha256:state.source_sha256,ui_sha256:proof.ui_readback.ui_receipt_sha256}});
  const expected={runId:receipt.run_id,shard,caseId,manifest};assert.equal(validateV12FunctionalExecutionReceipt(receipt,expected),true);
  for(const field of ["schema_version","producer","nonce","run_id","shard","case_id","identity","phases","receipt_sha256"])await t.test(field,()=>{const value=structuredClone(receipt);value[field]=null;assert.throws(()=>validateV12FunctionalExecutionReceipt(value,expected),/v12_maestro_execution_receipt_invalid/u);});
  for(let index=0;index<3;index++)for(const field of Object.keys(receipt.phases[index]))await t.test(index+" "+field,()=>{const value=structuredClone(receipt);value.phases[index][field]=null;assert.throws(()=>validateV12FunctionalExecutionReceipt(value,expected),/v12_maestro_execution_receipt_invalid/u);});
});

test("direct receipt creation rejects undefined digest fields before constructing an execution claim",async t=>{
  for(const field of ["nonce","operation_result_sha256","action_request_sha256","source_receipt_sha256"])await t.test(field,()=>{
    const proof=structuredClone(base());proof.source_receipt[field]=undefined;
    const expectedNonce=field==="nonce"?undefined:nonce;
    assert.throws(()=>createV12FunctionalExecutionReceipt({nonce:expectedNonce,shard,caseId,sourceReceipt:proof.source_receipt,uiReadback:proof.ui_readback}),/v12_maestro_source_readback_invalid/u);
  });
  for(const field of ["facts_sha256","source_sha256"])await t.test("post "+field,()=>{
    const proof=structuredClone(base());proof.source_receipt.post[field]=undefined;
    assert.throws(()=>createV12FunctionalExecutionReceipt({nonce,shard,caseId,sourceReceipt:proof.source_receipt,uiReadback:proof.ui_readback}),/v12_maestro_source_readback_invalid/u);
  });
  const proof=structuredClone(base());proof.ui_readback.ui_receipt_sha256=undefined;
  assert.throws(()=>createV12FunctionalExecutionReceipt({nonce,shard,caseId,sourceReceipt:proof.source_receipt,uiReadback:proof.ui_readback}),/v12_maestro_ui_readback_invalid/u);
});

test("mutation receipts cannot claim a commit without changed facts or a replay with changed facts",async t=>{
  const mutationCase="workout.complete-commit";
  const proof=createV12AppFunctionalReadbacks({shard,caseId:mutationCase,nonce,pre:state,action:state,post:state});
  const cases=[
    ["commit without effects",value=>{value.command_outcome="committed";value.committed_effects=0;}],
    ["commit without changed facts",value=>{value.command_outcome="committed";value.committed_effects=1;}],
    ["replay with effects",value=>{value.committed_effects=1;}],
    ["replay with changed facts",value=>{value.post.facts_sha256="c".repeat(64);} ],
    ["missing durable receipt",value=>{value.command_receipt_id=null;}],
    ["invalid outcome",value=>{value.command_outcome="unknown";}],
    ["negative effects",value=>{value.committed_effects=-1;}],
  ];
  for(const [name,mutate]of cases)await t.test(name,()=>{
    const value=structuredClone(proof);mutate(value.source_receipt);
    assert.throws(()=>createV12FunctionalExecutionReceipt({nonce,shard,caseId:mutationCase,sourceReceipt:value.source_receipt,uiReadback:value.ui_readback}),/v12_maestro_source_readback_invalid/u);
  });
});

test("a SHA-256 array cannot masquerade as a typed native source digest",()=>{
  const mutationCase="workout.complete-commit",contract=v12NativeAcceptanceCaseContract(shard,mutationCase);
  const pre={source_sha256:["b".repeat(64)],row_count:2,schema_version:42};
  const post={source_sha256:["c".repeat(64)],row_count:2,schema_version:42};
  const proof=createV12AppFunctionalReadbacks({shard,caseId:mutationCase,nonce,pre,action:pre,post,
    operationResult:{result:contract.operation.expectedResult,handler_id:contract.operation.handlerId,
      postcondition_id:contract.operation.postcondition.id,receipt_id:"durable-fixture-receipt",outcome:"committed",committed_effects:1}});
  assert.throws(()=>validateV12FunctionalCaseReadbacks({shard,caseId:mutationCase,nonce,
    hierarchy:hierarchy(proof),report:"<testsuite><testcase name='fixture'/></testsuite>"}),/v12_maestro_source_readback_invalid/u);
});

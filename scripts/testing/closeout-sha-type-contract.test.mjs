import assert from"node:assert/strict";
import{createHash}from"node:crypto";
import test from"node:test";
import{createV12AppFunctionalReadbacks,createV12FunctionalExecutionReceipt,validateV12FunctionalExecutionReceipt,validateV12FunctionalCaseReadbacks}from"../run-v12-maestro.mjs";
import{v12NativeAcceptanceCaseContract}from"../../src/testing/contracts/phase15Workout.contract.ts";
import{stableCanonicalJson}from"../v12-calendar-artifacts.mjs";

const sha=value=>createHash("sha256").update(value).digest("hex");
const shard="workout",caseId="workout.complete-commit",nonce="a".repeat(48),contract=v12NativeAcceptanceCaseContract(shard,caseId);
const make=()=>createV12AppFunctionalReadbacks({shard,caseId,nonce,
  pre:{source_sha256:"b".repeat(64),row_count:2,schema_version:42},action:{source_sha256:"b".repeat(64),row_count:2,schema_version:42},post:{source_sha256:"c".repeat(64),row_count:2,schema_version:42},
  operationResult:{result:contract.operation.expectedResult,handler_id:contract.operation.handlerId,postcondition_id:contract.operation.postcondition.id,receipt_id:"durable-fixture-receipt",outcome:"committed",committed_effects:1}});
function rehash(proof){
  const source=proof.source_receipt;
  const operation={operation_id:source.operation_id,result:source.operation_result,handler_id:source.operation_handler_id,postcondition_id:source.operation_postcondition_id,
    receipt_id:source.command_receipt_id,outcome:source.command_outcome,committed_effects:source.committed_effects,authoritative_facts_sha256:source.post.facts_sha256};
  source.operation_result_sha256=sha(stableCanonicalJson(operation));
  const {source_receipt_sha256:unused,...unsigned}=source;source.source_receipt_sha256=sha(JSON.stringify(unsigned));
  proof.ui_readback.source_receipt_sha256=source.source_receipt_sha256;
  const {ui_receipt_sha256:unusedUi,...uiUnsigned}=proof.ui_readback;proof.ui_readback.ui_receipt_sha256=sha(JSON.stringify(uiUnsigned));
}
const hierarchy=proof=>`<hierarchy><node content-desc="V12_SOURCE_RECEIPT:${encodeURIComponent(JSON.stringify(proof.source_receipt))}"/><node content-desc="V12_UI_READBACK:${encodeURIComponent(JSON.stringify(proof.ui_readback))}"/></hierarchy>`;

test("rehashed native payloads reject array and object source digests in every phase",async t=>{
  const baseline=make();assert.deepEqual(validateV12FunctionalCaseReadbacks({shard,caseId,nonce,hierarchy:hierarchy(baseline),report:"<testsuite/>"}),baseline);
  for(const phase of ["pre","action","post"])for(const field of ["source_sha256","facts_sha256"])for(const kind of ["array","object"])await t.test(`${phase} ${field} ${kind}`,()=>{
    const proof=structuredClone(make()),value=proof.source_receipt[phase][field];proof.source_receipt[phase][field]=kind==="array"?[value]:{digest:value};rehash(proof);
    assert.throws(()=>validateV12FunctionalCaseReadbacks({shard,caseId,nonce,hierarchy:hierarchy(proof),report:"<testsuite/>"}),/v12_maestro_source_readback_invalid/u);
  });
});

test("direct receipt construction rejects boxed or coercible source digest objects",async t=>{
  for(const phase of ["pre","action","post"])for(const field of ["source_sha256","facts_sha256"])await t.test(`${phase} ${field}`,()=>{
    const proof=structuredClone(make()),value=proof.source_receipt[phase][field];proof.source_receipt[phase][field]={toString:()=>value};rehash(proof);
    assert.throws(()=>createV12FunctionalExecutionReceipt({shard,caseId,nonce,sourceReceipt:proof.source_receipt,uiReadback:proof.ui_readback}),/v12_maestro_source_readback_invalid/u);
  });
});

test("self-consistent execution receipts reject non-string phase and receipt hashes",async t=>{
  const proof=make(),runId="phase20-20261017T000000Z-aaaaaaaaaaaa";
  const manifest={source:{tree_sha256:"b".repeat(64)},build:{apk:{sha256:"c".repeat(64)}},device:{installed_apk_sha256:"c".repeat(64),identity_sha256:"d".repeat(64)},configuration:{id:"AP-L-C390-P-F100"}};
  const identity={source_tree_sha256:manifest.source.tree_sha256,apk_sha256:manifest.build.apk.sha256,installed_apk_sha256:manifest.device.installed_apk_sha256,device_identity_sha256:manifest.device.identity_sha256,configuration_id:manifest.configuration.id};
  const receipt=createV12FunctionalExecutionReceipt({shard,caseId,nonce,runId,identity,sourceReceipt:proof.source_receipt,uiReadback:proof.ui_readback,
    pre:{source_sha256:proof.source_receipt.pre.source_sha256},action:{report_sha256:"e".repeat(64)},post:{source_sha256:proof.source_receipt.post.source_sha256,ui_sha256:proof.ui_readback.ui_receipt_sha256}});
  const options={runId,shard,caseId,manifest};assert.equal(validateV12FunctionalExecutionReceipt(receipt,options),true);
  for(let phase=0;phase<3;phase++)for(const field of Object.keys(receipt.phases[phase]).filter(key=>key.endsWith("_sha256")))await t.test(`${phase} ${field}`,()=>{
    const value=structuredClone(receipt);value.phases[phase][field]=[value.phases[phase][field]];
    const {receipt_sha256:unused,...unsigned}=value;value.receipt_sha256=sha(JSON.stringify(unsigned));
    assert.throws(()=>validateV12FunctionalExecutionReceipt(value,options),/v12_maestro_execution_receipt_invalid/u);
  });
  for(const value of [[receipt.receipt_sha256],{digest:receipt.receipt_sha256}])assert.throws(()=>validateV12FunctionalExecutionReceipt({...receipt,receipt_sha256:value},options),/v12_maestro_execution_receipt_invalid/u);
});

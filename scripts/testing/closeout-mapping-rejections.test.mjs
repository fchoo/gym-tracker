import assert from"node:assert/strict";
import{readFileSync}from"node:fs";
import path from"node:path";
import test from"node:test";
import{fixture,runId,DEVICE_FACTS}from"./closeout-maestro-fixture.mjs";
import{executeLiveV12GenericMaestro,validateV12DirectMaestroMapping}from"../run-v12-maestro.mjs";

test("source-owned functional mappings reject changed metadata, observations, tools, and identity",async t=>{
  const value=fixture(t,"multi-plan"),shard="multi-plan";
  await executeLiveV12GenericMaestro(["--run",runId,"--shard",shard],{root:value.root,serial:DEVICE_FACTS.serial,currentHead:value.build.source.head,sourceDigest:value.build.source.tree_sha256,isAncestor:()=>true,executionTools:value.tools,execFileSync:value.execute});
  const mapping=JSON.parse(readFileSync(path.join(value.root,`artifacts/native/v1.2/${runId}/mapping/${shard}.json`),"utf8"));
  const options={root:value.root,manifest:value.build,shard,allowTest:true};
  assert.equal(validateV12DirectMaestroMapping(mapping,options),true);
  const cases=[
    ["schema",m=>{m.schema_version=1;}],
    ["producer",m=>{m.producer="unexpected";}],
    ["run",m=>{m.run_id="unexpected";}],
    ["shard",m=>{m.shard="workout";}],
    ["Git binding",m=>{m.git_attestation_sha256=null;}],
    ["missing case",m=>{m.case_ids.pop();}],
    ["empty observations",m=>{m.observations=[];}],
    ["observation ordinal",m=>{m.observations[0].ordinal=2;}],
    ["duplicate observation",m=>{m.observations[1]=m.observations[0];}],
    ["missing before measurement",m=>{m.observations[0].device_measurement.before=null;}],
    ["measurement schema",m=>{m.observations[0].device_measurement.before.schema_version=2;}],
    ["device drift",m=>{m.observations[0].device_measurement.after.settings_sha256="a".repeat(64);}],
    ["missing receipt",m=>{m.observations[0].execution_receipt=null;}],
    ["invalid origin",m=>{m.execution_origin=null;}],
    ["origin action",m=>{m.execution_origin.action="workout";}],
    ["origin kind",m=>{m.execution_origin.kind="unexpected";}],
    ["origin hash",m=>{m.execution_origin.adapter_source_sha256="a".repeat(64);}],
    ["tool schema",m=>{m.tool_attestation.schema_version=1;}],
    ["tool action",m=>{m.tool_attestation.action="workout";}],
    ["tool hash",m=>{m.tool_attestation.tools[0].executable_sha256="a".repeat(64);}],
    ["tool path",m=>{m.tool_attestation.tools[0].executable_realpath_sha256="a".repeat(64);}],
    ["tool version",m=>{m.tool_attestation.tools[0].version="unexpected";}],
    ["APK identity",m=>{m.identity.apk_sha256="a".repeat(64);}],
    ["source identity",m=>{m.identity.source_tree_sha256="a".repeat(64);}],
    ["source digest",m=>{m.source_sha256= {}; }],
    ["flow digest",m=>{m.flow_sha256="a".repeat(64);}],
    ["request digest",m=>{m.execution_origin.request_attestation_sha256="a".repeat(64);}],
  ];
  for(const [name,mutate]of cases)await t.test(name,()=>{
    const changed=structuredClone(mapping);mutate(changed);
    assert.throws(()=>validateV12DirectMaestroMapping(changed,options),/v12_maestro_(?:mapping|observation|measurement|execution_receipt|tool_attestation|safe_sdk_attestation|request_attestation|product_environment|identity|source_readback|ui_readback|junit_readback|source)_/u);
  });
  assert.throws(()=>validateV12DirectMaestroMapping(mapping,{...options,shard:"unknown"}),/v12_maestro_mapping_invalid/u);
  assert.throws(()=>validateV12DirectMaestroMapping(mapping,{...options,manifest:null}),/v12_maestro_mapping_invalid/u);
});

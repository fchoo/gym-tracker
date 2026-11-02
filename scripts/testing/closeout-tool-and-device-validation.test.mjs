import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fixture, DEVICE_FACTS } from "./closeout-maestro-fixture.mjs";
import { createV12DirectMaestroToolAttestation, readV12DirectMaestroDeviceMeasurement, createV12ProductCaseEnvironment, validateV12FunctionalMaestroFlow } from "../run-v12-maestro.mjs";

test("tool attestation distinguishes controlled tools and rejects bad version reports",t=>{
  const value=fixture(t,"multi-plan");
  const controlled=createV12DirectMaestroToolAttestation({executionTools:value.tools,shard:"multi-plan",execute:()=>assert.fail("controlled version does not invoke tools")});
  assert.equal(controlled.schema_version,1);assert.equal(controlled.test_only,true);
  assert.deepEqual(controlled.tools.map(item=>item.version),Array(3).fill("test-controlled"));
  const production={...value.tools,execution_origin:"production-attested/v1",test_only:false};
  for(const execute of [()=>{throw Error("version unavailable");},()=>"",()=>"x".repeat(513),()=>"bad\u0001version"]){
    assert.throws(()=>createV12DirectMaestroToolAttestation({executionTools:production,shard:"multi-plan",execute}),/v12_maestro_toolchain_invalid/u);
  }
  for(const executionTools of [null,{...value.tools,execution_origin:"unknown"},{...value.tools,test_only:false},{...value.tools,adb:"relative"}])assert.throws(()=>createV12DirectMaestroToolAttestation({executionTools,shard:"multi-plan"}),/v12_maestro_toolchain_invalid/u);
  assert.throws(()=>createV12DirectMaestroToolAttestation({executionTools:value.tools,shard:"unknown"}),/v12_maestro_tool_attestation_invalid/u);
});

test("direct measurement rejects disconnected devices, package ambiguity, and invalid installed hashes",async t=>{
  for(const [name,match,replacement]of [
    ["offline","get-state","offline"],
    ["no package","shell pm list packages com.fchoo.gymtracker.devtest",""],
    ["wrong package","shell pm list packages com.fchoo.gymtracker.devtest","package:other"],
    ["split install","shell pm path com.fchoo.gymtracker.devtest","package:/data/app/base.apk\npackage:/data/app/split.apk"],
    ["invalid path","shell pm path com.fchoo.gymtracker.devtest","package:/other/base.apk"],
    ["invalid digest","shell sha256sum /data/app/com.fchoo.gymtracker.devtest/base.apk","invalid"],
  ])await t.test(name,()=>{
    const value=fixture(t,"multi-plan");
    const execute=(program,args,options)=>args.slice(2).join(" ")===match?replacement:value.execute(program,args,options);
    assert.throws(()=>readV12DirectMaestroDeviceMeasurement(value.build,{serial:DEVICE_FACTS.serial,executionTools:value.tools,execute}),/v12_maestro_identity_mismatch/u);
  });
  const value=fixture(t,"multi-plan");
  for(const serial of [undefined,"",1,"bad serial","emulator-5554"])assert.throws(()=>readV12DirectMaestroDeviceMeasurement(value.build,{serial,executionTools:value.tools,execute:()=>assert.fail("invalid serial must not invoke transport")}),/v12_maestro_ephemeral_device_required/u);
  assert.throws(()=>readV12DirectMaestroDeviceMeasurement(value.build,{serial:DEVICE_FACTS.serial,executionTools:value.tools,execute:()=>{throw Error("transport unavailable");}}),/v12_maestro_native_command_failed/u);
});

test("product environment and functional-flow boundaries reject malformed inputs",()=>{
  for(const input of [undefined,{},{shard:"workout",caseId:1,nonce:"a".repeat(48)},{shard:"workout",caseId:"workout.root-identity"}])assert.throws(()=>createV12ProductCaseEnvironment(input),/v12_maestro_product_environment_invalid/u);
  for(const flow of [null,"","appId: demo","V12_EVIDENCE_NONCE /native-acceptance/multi-plan"])assert.throws(()=>validateV12FunctionalMaestroFlow(flow),/v12_maestro_functional_flow_not_executable/u);
});

import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {fixture,runId,DEVICE_FACTS} from './closeout-maestro-fixture.mjs';
import {executeLiveV12GenericMaestro,validateV12DirectMaestroMapping} from '../run-v12-maestro.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

test('a mapping changing after its first case validation cannot erase executed observations',async t=>{
  const value=fixture(t,'multi-plan'),shard='multi-plan';
  await executeLiveV12GenericMaestro(['--run',runId,'--shard',shard],{root:value.root,serial:DEVICE_FACTS.serial,
    currentHead:value.build.source.head,sourceDigest:value.build.source.tree_sha256,isAncestor:()=>true,
    executionTools:value.tools,execFileSync:value.execute});
  const mapping=JSON.parse(fs.readFileSync(path.join(value.root,`artifacts/native/v1.2/${runId}/mapping/${shard}.json`)));
  const options={root:value.root,manifest:value.build,shard,allowTest:true};
  assert.equal(mapping.execution_origin.test_only,true);
  assert.ok(mapping.observations.length>0);assert.equal(validateV12DirectMaestroMapping(mapping,options),true);
  const changed=structuredClone(mapping),observations=changed.observations;
  let reads=0;
  Object.defineProperty(changed,'observations',{enumerable:true,configurable:true,get(){reads+=1;return reads===1?observations:[];}});
  changed.identity=undefined;
  // Rehash only the attacker-controlled request around its empty later value.
  // Source, flow, SDK ownership and all real producer observations stay bound.
  changed.execution_origin.request_attestation_sha256=sha(JSON.stringify({
    schema_version:2,action:shard,run_id:runId,source_tree_sha256:value.build.source.tree_sha256,
    apk_sha256:value.build.build.apk.sha256,device_identity_sha256:value.build.device.identity_sha256,
    flow_sha256:changed.flow_sha256,source_sha256:changed.source_sha256,git_attestation_sha256:changed.git_attestation_sha256,
    tool_attestation_sha256:sha(JSON.stringify(changed.tool_attestation)),measurement_sha256:sha(JSON.stringify([])),
    execution_receipt_sha256:sha(JSON.stringify([])),
  }));
  assert.throws(()=>validateV12DirectMaestroMapping(changed,options),/v12_maestro_(?:mapping_identity|request_attestation|observation_mapping|measurement)_invalid/u);
  assert.equal(reads,1,'the public validator must consume the adversarial property exactly once');
  const stable=structuredClone(mapping);let stableReads=0;
  Object.defineProperty(stable,'observations',{enumerable:true,configurable:true,get(){stableReads+=1;return stableReads===1?mapping.observations:[];}});
  assert.equal(validateV12DirectMaestroMapping(stable,options),true);
  assert.equal(stableReads,1);assert.deepEqual(mapping.observations.map(row=>row.case_id),value.maestroCaseIds);
  assert.throws(()=>validateV12DirectMaestroMapping({...mapping,observations:()=>mapping.observations},options),/v12_maestro_mapping_invalid/u);
});

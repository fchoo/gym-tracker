import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {deriveV12Ledger,sealV12FinalEvidence} from '../verify-v12-native-evidence.mjs';
import {loadV12ContractInputs} from '../v12-evidence-contract.mjs';

test('only source-derived issued ledgers can seal immutable evidence', {timeout:180000}, async t=>{
  const root=fs.realpathSync(process.env.V12_PHASE20_COVERAGE_FIXTURE);
  const run=fs.readdirSync(path.join(root,'artifacts/native/v1.2')).find(x=>x.startsWith('phase20-'));
  const prefix=path.join(root,'artifacts/native/v1.2',run);
  const manifest=JSON.parse(fs.readFileSync(path.join(prefix,'build.json')));
  const preseal=JSON.parse(fs.readFileSync(path.join(prefix,'preseal-validation.json')));
  const attended=JSON.parse(fs.readFileSync(path.join(prefix,'attended-observations.json')));
  const inputs=loadV12ContractInputs({root});
  // Preserve all actual source hashes while exercising a legitimate undefined
  // metadata key. The ledger still comes only from real artifact derivation.
  inputs.source_hashes={...inputs.source_hashes,optional:undefined};
  const ledger=deriveV12Ledger({inputs,manifest,evidence:preseal.row_evidence,
    attended,root,readArtifact:relative=>fs.readFileSync(path.join(root,relative))});
  const original=structuredClone(ledger);
  assert.equal(ledger.rows.length,172);assert.equal(ledger.source_results.length,172);
  assert.equal(ledger.readiness,'NOT_READY');assert.equal(ledger.evidence_origin,'native');
  const blocker=ledger.source_results.findIndex(row=>['FAIL','NOT_RUN','REVIEW_REQUIRED'].includes(row.result));
  assert.ok(blocker>=0);
  const seal=(candidate,writer)=>sealV12FinalEvidence({mode:'final',run_id:run,ledger:candidate,writeImmutableJson:writer});
  const rejectWithoutWrites=(candidate,error)=>{let writes=0;assert.throws(()=>seal(candidate,()=>{writes+=1;}),error);assert.equal(writes,0);};

  await t.test('the same issued ledger retains its actual blockers and authority fields',()=>{
    assert.equal(Object.isFrozen(ledger),true);assert.equal(Object.isFrozen(ledger.source_results[0].bindings),false);
    assert.equal(Object.hasOwn(ledger.source_hashes,'optional'),true);assert.equal(ledger.source_hashes.optional,undefined);
    const writes=[],sealed=seal(ledger,(file,value)=>writes.push([file,value]));
    assert.equal(writes.length,2);assert.notEqual(sealed.rows,ledger.rows);assert.notEqual(sealed.source_results,ledger.source_results);
    for(const field of ['identity','evidence_hashes','gates','exceptions','rows','source_results'])assert.deepEqual(sealed[field],original[field]);
    assert.equal(sealed.readiness,'NOT_READY');assert.equal(sealed.release_authorized,false);
    assert.equal(writes[0][1].rows[blocker].verdict,original.rows[blocker].verdict);
    assert.equal(Object.isFrozen(sealed.rows[blocker]),true);assert.equal(Object.isFrozen(sealed.source_results[blocker].selector),true);
  });
  await t.test('cloned, restored and manually declared DTOs cannot acquire issuance',()=>{
    for(const candidate of [structuredClone(ledger),JSON.parse(JSON.stringify(ledger)),{...ledger},
      JSON.parse(fs.readFileSync(path.join(prefix,'final-evidence.json')))])rejectWithoutWrites(candidate,/v12_final_seal_ledger_unissued/u);
  });
  await t.test('removing derived authority fields cannot invoke the writer',()=>{
    for(const field of ['identity','evidence_hashes','gates','exceptions']){
      const candidate=structuredClone(ledger);delete candidate[field];rejectWithoutWrites(candidate,/v12_final_seal_ledger_unissued/u);
    }
  });
  const selector=ledger.source_results[0].selector,key='configuration_sha256',descriptor=Object.getOwnPropertyDescriptor(selector,key);
  assert.ok(descriptor?.writable===true&&descriptor.configurable===true);
  await t.test('changed nested evidence invalidates the issued snapshot',()=>{
    try{selector[key]='f'.repeat(64);rejectWithoutWrites(ledger,/v12_final_seal_ledger_changed/u);}
    finally{Object.defineProperty(selector,key,descriptor);}
  });
  await t.test('a nested cycle cannot reuse the issued snapshot',()=>{
    try{selector.self=selector;rejectWithoutWrites(ledger,/v12_final_seal_ledger_changed/u);}
    finally{delete selector.self;}
  });
  await t.test('non-JSON nested additions cannot disappear from the issued snapshot',()=>{
    try{selector.extra=undefined;rejectWithoutWrites(ledger,/v12_final_seal_ledger_changed/u);}
    finally{delete selector.extra;}
    try{selector.extra=()=>descriptor.value;rejectWithoutWrites(ledger,/v12_final_seal_ledger_changed/u);}
    finally{delete selector.extra;}
  });
  await t.test('accessors are evaluated once into the validated output snapshot',()=>{
    let reads=0;
    try{
      Object.defineProperty(selector,key,{enumerable:true,configurable:true,get(){reads+=1;return reads===1?descriptor.value:'f'.repeat(64);}});
      const writes=[],sealed=seal(ledger,(file,value)=>writes.push([file,value]));
      assert.equal(reads,1);assert.equal(sealed.source_results[0].selector[key],descriptor.value);
      assert.deepEqual(sealed.source_results,original.source_results);assert.equal(writes.length,2);
    }finally{Object.defineProperty(selector,key,descriptor);}
  });
  await t.test('writer callbacks cannot mutate either emitted snapshot or race original nested evidence',()=>{
    const writes=[];
    try{
      const sealed=seal(ledger,(file,value)=>{
        writes.push([file,value]);
        assert.equal(Reflect.set(value.rows[blocker],'verdict','PASS'),false);
        assert.throws(()=>value.rows.push({requirement_id:'invented'}),TypeError);
        if(value.source_results)assert.equal(Reflect.set(value.source_results[0].selector,key,'f'.repeat(64)),false);
        if(writes.length===1)assert.equal(Reflect.set(selector,key,'f'.repeat(64)),true);
      });
      assert.equal(writes.length,2);assert.deepEqual(sealed.rows,original.rows);assert.deepEqual(sealed.source_results,original.source_results);
      assert.equal(sealed.readiness,'NOT_READY');assert.equal(sealed.release_authorized,false);
      rejectWithoutWrites(ledger,/v12_final_seal_ledger_changed/u);
    }finally{Object.defineProperty(selector,key,descriptor);}
  });
});

import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import path from 'node:path';
import test from 'node:test';
import {prepareV12DirectSafeSdkBinding,validateV12DirectSafeSdkAttestation,
  createV12DirectMaestroToolAttestation,createV12DirectMaestroToolAttestationAsync} from '../run-v12-maestro.mjs';
const runId='phase20-20261017T000000Z-aaaaaaaaaaaa',shard='multi-plan';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

test('SDK validation and tool cards use one checked immutable ownership snapshot',async t=>{
  const capture=process.env.V12_RESUME_CAPTURE_DIR;assert.equal(typeof capture,'string');
  const root=path.join(capture,'sdk-owned-inputs');fs.mkdirSync(root);
  const tools={test_only:true,execution_origin:'test-controlled/v1'};
  for(const name of ['adb','maestro','unzip']){const file=path.join(root,name);fs.writeFileSync(file,`controlled ${name} tool bytes\n`,{mode:0o755});tools[name]=file;}
  const {attestation}=prepareV12DirectSafeSdkBinding({root,runId,shard,tools});
  const options={root,runId,shard,testOnly:true};
  assert.equal(validateV12DirectSafeSdkAttestation(attestation,options),true);
  const foreign=`artifacts/native/v1.2/${runId}/tools/foreign-identical-receipt.json`;
  const foreignFile=path.join(root,foreign);
  fs.copyFileSync(path.join(root,attestation.receipt_path),foreignFile);
  const fixedFiles=[attestation.receipt_path,attestation.jar_path,foreign,...Object.values(tools).filter(value=>typeof value==='string'&&path.isAbsolute(value))]
    .map(file=>path.isAbsolute(file)?file:path.join(root,file));
  const snapshot=()=>({captured_at:new Date().toISOString(),pid:process.pid,node:process.version,
    files:fixedFiles.map(file=>({path:file,sha256:sha(fs.readFileSync(file))})),test_only:true,native_acceptance_authority:false});
  const inputBefore=snapshot();fs.writeFileSync(path.join(capture,'sdk-inputs-before.json'),JSON.stringify(inputBefore,null,2)+'\n');
  const results=[];
  const observe=async operation=>{
    const original=fs.readFileSync,reads=[];
    // Observe actual I/O and delegate every read without changing its result.
    fs.readFileSync=function(file,...args){reads.push(String(file));return original.call(this,file,...args);};
    syncBuiltinESMExports();
    try{return{value:await operation(),reads};}
    finally{fs.readFileSync=original;syncBuiltinESMExports();}
  };
  await t.test('canonical-first descriptor getters never cause an unaligned later read',async()=>{
    const changed={...attestation};let propertyReads=0;
    Object.defineProperty(changed,'receipt_path',{enumerable:true,get(){propertyReads+=1;return propertyReads===1?attestation.receipt_path:foreign;}});
    const actual=await observe(()=>validateV12DirectSafeSdkAttestation(changed,options));
    assert.equal(actual.value,true);assert.equal(propertyReads,1);assert.equal(actual.reads.includes(foreignFile),false);
    assert.ok(actual.reads.includes(path.join(root,attestation.receipt_path)));
    results.push({case:'canonical-first',descriptor_reads:propertyReads,actual_file_reads:actual.reads});
  });
  await t.test('a foreign first snapshot rejects before reading identical foreign bytes',async()=>{
    const actual=await observe(()=>{
      assert.throws(()=>validateV12DirectSafeSdkAttestation({...attestation,receipt_path:foreign},options),/v12_maestro_safe_sdk_attestation_invalid/u);
    });
    assert.equal(actual.reads.includes(foreignFile),false);
    results.push({case:'foreign-first',actual_file_reads:actual.reads});
  });
  for(const [name,create]of [['sync',createV12DirectMaestroToolAttestation],['async',createV12DirectMaestroToolAttestationAsync]])await t.test(`${name} tool card retains the exact validated SDK snapshot`,async()=>{
    const input=structuredClone(attestation);let propertyReads=0;
    Object.defineProperty(input,'receipt_path',{enumerable:true,get(){propertyReads+=1;return propertyReads===1?attestation.receipt_path:foreign;}});
    const args={root,runId,shard,executionTools:tools,retainedSafeSdk:input,safeSdk:input,
      execute:()=>assert.fail('controlled versions do not execute a native tool'),run:async()=>assert.fail('controlled versions do not execute a native tool')};
    const actual=await observe(()=>create(args));
    assert.equal(propertyReads,1);assert.deepEqual(actual.value.safe_sdk,attestation);
    assert.notEqual(actual.value.safe_sdk,input);assert.equal(Object.isFrozen(actual.value.safe_sdk),true);
    assert.equal(actual.reads.includes(foreignFile),false);
    input.jar_sha256='f'.repeat(64);assert.deepEqual(actual.value.safe_sdk,attestation);
    assert.equal(Reflect.set(actual.value.safe_sdk,'jar_sha256','f'.repeat(64)),false);
    results.push({case:name,descriptor_reads:propertyReads,actual_file_reads:actual.reads,card_sdk:actual.value.safe_sdk});
  });
  await t.test('invalid original shapes and unclonable values remain rejected',()=>{
    const inherited=Object.create({receipt_path:attestation.receipt_path});Object.assign(inherited,attestation);
    for(const value of [null,[],{...attestation,extra:true},inherited,{...attestation,identity_sha256:()=>attestation.identity_sha256}]){
      assert.throws(()=>validateV12DirectSafeSdkAttestation(value,options),/v12_maestro_safe_sdk_attestation_invalid/u);
    }
    assert.equal(validateV12DirectSafeSdkAttestation(Object.assign(Object.create(null),attestation),options),true);
  });
  const inputAfter=snapshot();assert.deepEqual(inputAfter.files,inputBefore.files);
  fs.writeFileSync(path.join(capture,'sdk-inputs-after.json'),JSON.stringify(inputAfter,null,2)+'\n');
  fs.writeFileSync(path.join(capture,'sdk-observed-results.json'),JSON.stringify({schema_version:1,test_only:true,native_acceptance_authority:false,
    observation_kind:'delegating real filesystem read observer',before:'sdk-inputs-before.json',after:'sdk-inputs-after.json',all_file_bytes_unchanged:true,results},null,2)+'\n');
});

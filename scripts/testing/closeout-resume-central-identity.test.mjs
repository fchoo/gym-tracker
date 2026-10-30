import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {verifyV12FinalNativeIdentity,validateV12FinalProductionIdentity,sealV12FinalEvidence,deriveV12Ledger} from '../verify-v12-native-evidence.mjs';
import {withFaultProof} from './closeout-resume-proof-fixture.mjs';
import {loadV12ContractInputs} from '../v12-evidence-contract.mjs';
const subject='scripts/verify-v12-native-evidence.mjs',testFile='scripts/testing/closeout-resume-central-identity.test.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const h=c=>c.repeat(64),run='phase20-20261017T000000Z-aaaaaaaaaaaa';
const manifest=()=>({schema_version:1,run_id:run,mode:'live',evidence_origin:'native',created_at:'2026-10-17T00:00:00Z',source:{head:'a'.repeat(40),tree_sha256:h('b'),dirty:false,package_json_sha256:h('c'),package_lock_sha256:h('d')},planning:{matrix_sha256:h('e'),requirements_sha256:h('f'),source_manifest_sha256:h('1'),owner_brief_sha256:h('2'),ui_spec_sha256:h('3'),deviations_sha256:h('4')},prototype:{revision:18,approval_sha256:h('5'),html_sha256:h('6')},fixtures:{registry_sha256:h('7')},build:{profile:'development-test',package:'com.fchoo.gymtracker.devtest',version_name:'1.2.0',version_code:1,apk:{path:'artifacts/native/v1.2-acceptance/app.apk',sha256:h('8'),size_bytes:8,page_alignment_verified:true,signature_sha256:h('9'),certificate_sha256:h('a')}},device:{identity_sha256:h('b'),abi:'arm64-v8a',installed_apk_sha256:h('8'),settings_sha256:h('c'),restoration_sha256:h('d')},configuration:{id:'AP-L-C390-P-F100'}});
function fresh(){const base=path.join(process.env.V12_RESUME_CAPTURE_DIR,'identity-fixtures');fs.mkdirSync(base,{recursive:true});const root=fs.mkdtempSync(path.join(base,'case-')),m=manifest(),apk=Buffer.from('504b0304aabbccdd','hex');m.build.apk.sha256=sha(apk);m.device.installed_apk_sha256=sha(apk);const file=path.join(root,m.build.apk.path);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,apk);return{root,m};}
const envKeys=['ANDROID_HOME','ANDROID_SDK_ROOT','V12_DEVICE_SERIAL'];

test('native retained identity rejects missing authority and every failed local tool observation',async t=>{
  const cases=['test origin','missing origin','missing SDK','only SDK root missing tool','directory signer','failed signer','missing certificate','invalid serial','disconnected local transport','ambiguous install'];
  for(const name of cases)await t.test(name,async()=>{
    const {root,m}=fresh(),sdk=path.join(root,'sdk'),signer=path.join(sdk,'build-tools/36.0.0/apksigner'),adb=path.join(sdk,'platform-tools/adb');
    const writeTool=(file,bytes)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes,{mode:0o755});};
    writeTool(signer,`#!/bin/sh\nprintf 'Verified using v2 scheme (APK Signature Scheme v2): true\\nSigner #1 certificate SHA-256 digest: ${h('a')}\\n'\n`);
    writeTool(adb,"#!/bin/sh\ncase \"$*\" in *get-state*) printf 'device\\n';; *ro.product.cpu.abi*) printf 'arm64-v8a\\n';; *ro.build.version.sdk*) printf '36\\n';; *ro.product.model*) printf 'Fixture\\n';; *'pm path'*) printf 'package:/other/invalid.apk\\n';; *) exit 1;; esac\n");
    if(name==='test origin')m.evidence_origin='test';
    if(name==='missing origin')delete m.evidence_origin;
    if(name==='directory signer'){fs.unlinkSync(signer);fs.mkdirSync(signer);}
    if(name==='failed signer')fs.writeFileSync(signer,'#!/bin/sh\nexit 1\n');
    if(name==='missing certificate')fs.writeFileSync(signer,"#!/bin/sh\nprintf 'Verified using v2 scheme (APK Signature Scheme v2): true\\n'\n");
    if(name==='disconnected local transport')fs.writeFileSync(adb,"#!/bin/sh\nprintf 'offline\\n'\n");
    const previous=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));
    delete process.env.ANDROID_HOME;delete process.env.ANDROID_SDK_ROOT;process.env.V12_DEVICE_SERIAL='fixture-device';
    if(name!=='missing SDK')process.env[name==='only SDK root missing tool'?'ANDROID_SDK_ROOT':'ANDROID_HOME']=name==='only SDK root missing tool'?path.join(root,'missing-sdk'):sdk;
    if(name==='invalid serial')process.env.V12_DEVICE_SERIAL='invalid serial';
    try{await withFaultProof({tree:root,subject,testFile,reason:name,overrides:[],publicSubject:true,operation:()=>assert.throws(()=>verifyV12FinalNativeIdentity(m,{root,gitExecution:{executable:'/usr/bin/git'}}),/v12_preflight_(?:test_origin_forbidden|native_origin_required|native_identity_invalid)/u)});}finally{for(const[k,v]of Object.entries(previous)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
  });
});

test('default APK signature reader fails closed for absent or malformed local signing tools',async t=>{
  for(const name of ['missing SDK','SDK root missing signer','failed signer','missing certificate','wrong signature scheme'])await t.test(name,async()=>{
    const{root,m}=fresh(),sdk=path.join(root,'sdk'),signer=path.join(sdk,'build-tools/36.0.0/apksigner');fs.mkdirSync(path.dirname(signer),{recursive:true});
    const bytes=name==='failed signer'?'#!/bin/sh\nexit 1\n':name==='wrong signature scheme'?`#!/bin/sh\nprintf 'Signer #1 certificate SHA-256 digest: ${h('a')}\\n'\n`:"#!/bin/sh\nprintf 'Verified using v2 scheme (APK Signature Scheme v2): true\\n'\n";
    if(name!=='SDK root missing signer')fs.writeFileSync(signer,bytes,{mode:0o755});
    const previous=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));delete process.env.ANDROID_HOME;delete process.env.ANDROID_SDK_ROOT;
    if(name!=='missing SDK')process.env[name==='SDK root missing signer'?'ANDROID_SDK_ROOT':'ANDROID_HOME']=sdk;
    try{await withFaultProof({tree:root,subject,testFile,reason:name,overrides:[],publicSubject:true,operation:()=>assert.throws(()=>validateV12FinalProductionIdentity(m,{root,currentHead:()=>m.source.head,currentSourceTreeSha256:()=>m.source.tree_sha256,readDeviceIdentity:()=>({})}),/v12_preflight_final_identity_invalid/u)});}finally{for(const[k,v]of Object.entries(previous)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
  });
});

test('private evidence and exception content rejects before any resolver file access',()=>{
  const m=manifest(),inputs={matrix:{rows:[]}};
  for(const changes of [{evidence:{password:'sensitive fixture'}},{exceptions:[{gps:'sensitive fixture'}]},{evidence:{email:'fixture@example.invalid'}}]){
    assert.throws(()=>deriveV12Ledger({inputs,manifest:m,evidence:[],readArtifact:()=>assert.fail('private content cannot reach source reads'),...changes}),/v12_final_privacy_invalid/u);
  }
});

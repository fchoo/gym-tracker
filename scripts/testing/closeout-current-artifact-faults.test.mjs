import assert from"node:assert/strict";
import{createHash}from"node:crypto";
import{copyFileSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,symlinkSync,writeFileSync}from"node:fs";
import path from"node:path";
import test from"node:test";
import{pathToFileURL}from"node:url";
import{withFaultProof}from"./closeout-resume-proof-fixture.mjs";

const project=process.cwd(),target="scripts/verify-v12-native-evidence.mjs",expected="a077ca739b2346b1f1e9422a2d0138c1a6db7d93d16a21bc41283a3afc7197d5";
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const archive=path.join(project,"artifacts/native/personal-closeout-20261027/verifier-coverage/sdk-repaired-fixture");
const run=readdirSync(path.join(archive,"artifacts/native/v1.2")).find(name=>name.startsWith("phase20-"));
const manifest=JSON.parse(readFileSync(path.join(archive,"artifacts/native/v1.2",run,"build.json"),"utf8"));
const rootBase=path.join(project,"artifacts/native/personal-closeout-20261027/verifier-coverage/resume-20261029/current-artifact-faults");
const url=pathToFileURL(path.join(project,"scripts/v12-atomic-shard-publication.mjs")).href;
const originalRecord=JSON.parse(readFileSync(path.join(archive,"artifacts/native/v1.2",run,"screenshots/index.json"),"utf8")).records[0];

function subjectTree(){
  mkdirSync(rootBase,{recursive:true});const tree=mkdtempSync(path.join(rootBase,"subject-"));mkdirSync(path.join(tree,"scripts"));
  copyFileSync(path.join(project,target),path.join(tree,target));assert.equal(sha(readFileSync(path.join(tree,target))),expected);
  for(const file of readdirSync(path.join(project,"scripts"))){if(["verify-v12-native-evidence.mjs","v12-atomic-shard-publication.mjs"].includes(file))continue;symlinkSync(path.join(project,"scripts",file),path.join(tree,"scripts",file));}
  writeFileSync(path.join(tree,"scripts/v12-atomic-shard-publication.mjs"),`export {publishV12AtomicShard,validateV12ExecutionOrigin} from ${JSON.stringify(url)};export function verifyV12AtomicShard(){return true;}\n`);
  return tree;
}
function write(root,relative,value){const file=path.join(root,relative);mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,Buffer.isBuffer(value)?value:typeof value==="string"?value:JSON.stringify(value));}
function publish(root,shard,members){write(root,`artifacts/native/v1.2/${run}/publication/${shard}.json`,{members:members.map(artifact=>({artifact}))});}

test("visual consumer rechecks record and image bytes even when an imported publication oracle lies",async t=>{
  const cases=[
    ["record schema",value=>{value.schema_version=1;},/v12_preflight_visual_record_invalid/u],
    ["record producer",value=>{value.producer="unexpected";},/v12_preflight_visual_record_invalid/u],
    ["PNG digest",value=>{value.native_png.sha256="invalid";},/v12_preflight_visual_record_invalid/u],
    ["missing state receipt",value=>{value.settings.state_receipt={};},/v12_preflight_visual_record_invalid/u],
    ["nonce absent",value=>{delete value.settings.state_receipt.nonce;},/v12_preflight_visual_record_invalid/u],
    ["source receipt absent",value=>{delete value.settings.state_receipt.source_receipt;},/v12_preflight_visual_record_invalid/u],
    ["source receipt digest absent",value=>{delete value.settings.state_receipt.source_receipt.digest;},/v12_preflight_visual_record_invalid/u],
    ["PNG corrupt bytes",()=>{},/v12_preflight_png_invalid/u,Buffer.from("not-a-PNG")],
    ["PNG zero dimensions",()=>{},/v12_preflight_png_invalid/u,Buffer.from("89504e470d0a1a0a000000000000000000000000000000000000","hex")],
    ["PNG changed hash",()=>{},/v12_preflight_visual_png_hash_invalid/u,Buffer.from("89504e470d0a1a0a00000000000000000000000100000001","hex")],
  ];
  for(const [name,mutate,error,image]of cases)await t.test(name,async()=>{
    const tree=subjectTree(),root=mkdtempSync(path.join(tree,"case-")),prefix=`artifacts/native/v1.2/${run}`;
    write(root,`${prefix}/build.json`,manifest);
    const records=Array.from({length:107*64},(_,index)=>{const record=structuredClone(originalRecord);record.native_png.path=`${prefix}/screenshots/fixture-${index}.png`;return record;});
    mutate(records[0]);
    const index={schema_version:2,producer:"v12-visual-capture-index/v2",run_id:run,capture_count:107*64,windows:[{}],records};
    write(root,`${prefix}/screenshots/index.json`,index);write(root,records[0].native_png.path,image??readFileSync(path.join(archive,originalRecord.native_png.path)));
    publish(root,"visual",["screenshots/index.json",...records.map(record=>record.native_png.path.slice(prefix.length+1))]);
    write(root,`${prefix}/comparison/index.json`,{producer:"v12-visual-comparison-index/v3",schema_version:3,run_id:run,results:[]});publish(root,"comparison",["comparison/index.json"]);
    await withFaultProof({tree,subject:target,testFile:"scripts/testing/closeout-current-artifact-faults.test.mjs",
      reason:`Forged publication oracle cannot bypass visual ${name}`,overrides:["scripts/v12-atomic-shard-publication.mjs"],operation:async()=>{
        const verifier=await import(pathToFileURL(path.join(tree,target)).href);
        assert.throws(()=>verifier.executeV12EvidenceCli(["--run",run,"--mode","shards-only","--ids","visual"],{root}),error);
      }});
  });
});

test("missing and malformed publication descriptors fail at the consumer boundary",async t=>{
  for(const [name,value,error]of [["missing",undefined,/v12_preflight_publication_invalid/u],["malformed JSON","notJSON",/v12_preflight_publication_invalid/u],["missing members",{},/v12_preflight_publication_invalid/u],["null members",{members:null},/v12_preflight_publication_invalid/u]])await t.test(name,async()=>{
    const tree=subjectTree(),root=mkdtempSync(path.join(tree,"case-"));write(root,`artifacts/native/v1.2/${run}/build.json`,manifest);
    if(value!==undefined)write(root,`artifacts/native/v1.2/${run}/publication/sqlite.json`,value);
    await withFaultProof({tree,subject:target,testFile:"scripts/testing/closeout-current-artifact-faults.test.mjs",reason:`Forged publication oracle with ${name} descriptor`,overrides:["scripts/v12-atomic-shard-publication.mjs"],operation:async()=>{
      const verifier=await import(pathToFileURL(path.join(tree,target)).href);
      assert.throws(()=>verifier.executeV12EvidenceCli(["--run",run,"--mode","shards-only","--ids","sqlite"],{root}),error);
    }});
  });
});

test("dynamic member registries cannot hide missing, corrupt, or foreign artifact indexes",async t=>{
  const cases=[
    ["calendar missing registry","calendar",undefined,/v12_preflight_artifact_set_invalid_calendar/u],
    ["calendar malformed registry","calendar","notJSON",/v12_preflight_artifact_set_invalid_calendar/u],
    ["accessibility missing registry","accessibility",undefined,/v12_preflight_artifact_set_invalid$/u],
    ["accessibility malformed registry","accessibility","notJSON",/v12_preflight_artifact_set_invalid$/u],
    ["accessibility invalid registry","accessibility",{},/v12_preflight_artifact_set_invalid$/u],
    ["visual missing index","visual",undefined,/v12_preflight_artifact_set_invalid_visual/u],
    ["visual malformed index","visual","notJSON",/v12_preflight_artifact_set_invalid_visual/u],
  ];
  for(const [name,shard,index,error]of cases)await t.test(name,async()=>{
    const tree=subjectTree(),root=mkdtempSync(path.join(tree,"case-")),prefix=`artifacts/native/v1.2/${run}`;write(root,`${prefix}/build.json`,manifest);
    const artifact=shard==="calendar"?"calendar/artifact-registry.json":shard==="accessibility"?"shell/phase14/artifact-registry.json":"screenshots/index.json";
    if(index!==undefined)write(root,`${prefix}/${artifact}`,index);publish(root,shard,[artifact]);
    if(shard==="visual"){write(root,`${prefix}/comparison/index.json`,{results:[]});publish(root,"comparison",["comparison/index.json"]);}
    await withFaultProof({tree,subject:target,testFile:"scripts/testing/closeout-current-artifact-faults.test.mjs",
      reason:`Dynamic member registry fault: ${name}`,overrides:["scripts/v12-atomic-shard-publication.mjs"],operation:async()=>{
        const verifier=await import(pathToFileURL(path.join(tree,target)).href);
        assert.throws(()=>verifier.executeV12EvidenceCli(["--run",run,"--mode","shards-only","--ids",shard],{root}),error);
      }});
  });
});

test("comparison member indexes reject malformed roots and preserve non-comparison references",async t=>{
  const cases=[
    ["missing index",undefined,/v12_preflight_artifact_set_invalid_comparison/u],
    ["malformed index","notJSON",/v12_preflight_artifact_set_invalid_comparison/u],
    ["missing results",{},/v12_preflight_artifact_set_invalid_comparison/u],
    ["foreign observation",{results:[{observation:{path:"artifacts/native/v1.2/other/comparison/file.json"}}]},/v12_preflight_artifact_set_invalid_comparison/u],
    ["optional references",{results:[{}, {observation:{path:`artifacts/native/v1.2/${run}/screenshots/one.png`}}]},/v12_preflight_visual_index_invalid/u],
  ];
  for(const [name,index,error]of cases)await t.test(name,async()=>{
    const tree=subjectTree(),root=mkdtempSync(path.join(tree,"case-")),prefix=`artifacts/native/v1.2/${run}`;write(root,`${prefix}/build.json`,manifest);
    write(root,`${prefix}/screenshots/index.json`,{producer:"v12-visual-capture-index/v2",schema_version:2,run_id:run,records:[]});publish(root,"visual",["screenshots/index.json"]);
    if(index!==undefined)write(root,`${prefix}/comparison/index.json`,index);publish(root,"comparison",["comparison/index.json"]);
    await withFaultProof({tree,subject:target,testFile:"scripts/testing/closeout-current-artifact-faults.test.mjs",
      reason:`Comparison index fault: ${name}`,overrides:["scripts/v12-atomic-shard-publication.mjs"],operation:async()=>{
        const verifier=await import(pathToFileURL(path.join(tree,target)).href);
        assert.throws(()=>verifier.executeV12EvidenceCli(["--run",run,"--mode","shards-only","--ids","visual"],{root}),error);
      }});
  });
});

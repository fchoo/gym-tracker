import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { executeV12EvidenceCli } from "../verify-v12-native-evidence.mjs";

const sha = bytes => createHash("sha256").update(bytes).digest("hex");

test("each functional shard validates its owned SDK receipt and JAR bytes", t => {
  assert.equal(typeof process.env.V12_PHASE20_COVERAGE_FIXTURE, "string");
  const archive = realpathSync(process.env.V12_PHASE20_COVERAGE_FIXTURE);
  const run = readdirSync(path.join(archive, "artifacts/native/v1.2")).find(name => name.startsWith("phase20-"));
  for (const shard of ["multi-plan", "workout", "library-running"]) {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), "closeout-sdk-binding-")));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const prefix = `artifacts/native/v1.2/${run}`;
    const publicationRelative = `${prefix}/publication/${shard}.json`;
    const publication = JSON.parse(readFileSync(path.join(archive, publicationRelative), "utf8"));
    const files = [`${prefix}/build.json`, publicationRelative, ...publication.members.map(member => `${prefix}/${member.artifact}`)];
    for (const relative of files) {
      mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
      copyFileSync(path.join(archive, relative), path.join(root, relative));
    }
    const result = executeV12EvidenceCli(["--run", run, "--mode", "shards-only", "--ids", shard], { root });
    assert.equal(result.ok, true);
    assert.equal(result.artifacts.length, 4);
    for (const member of publication.members) {
      assert.equal(result.artifacts.find(item => item.path === `${prefix}/${member.artifact}`)?.sha256, member.sha256);
    }
  }
});

test("an owning mapping disappearing after its first validation fails closed at the SDK boundary",t=>{
  const archive=realpathSync(process.env.V12_PHASE20_COVERAGE_FIXTURE);
  const run=readdirSync(path.join(archive,"artifacts/native/v1.2")).find(name=>name.startsWith("phase20-"));
  const root=realpathSync(mkdtempSync(path.join(tmpdir(),"closeout-sdk-read-race-")));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const prefix=`artifacts/native/v1.2/${run}`;
  const publicationRelative=`${prefix}/publication/multi-plan.json`;
  const publication=JSON.parse(readFileSync(path.join(archive,publicationRelative),"utf8"));
  for(const relative of [`${prefix}/build.json`,publicationRelative,...publication.members.map(member=>`${prefix}/${member.artifact}`)]){
    mkdirSync(path.dirname(path.join(root,relative)),{recursive:true});copyFileSync(path.join(archive,relative),path.join(root,relative));
  }
  const mapping=path.join(root,prefix,"mapping/multi-plan.json");
  const original=fs.readFileSync;let removed=false;
  fs.readFileSync=function(file,...args){
    const result=original.call(this,file,...args);
    if(!removed&&String(file)===mapping&&new Error().stack.includes("preflightVerifyArtifact")){
      removed=true;rmSync(mapping);
    }
    return result;
  };
  syncBuiltinESMExports();
  try{
    assert.throws(()=>executeV12EvidenceCli(["--run",run,"--mode","shards-only","--ids","multi-plan"],{root}),/v12_preflight_safe_sdk_attestation_invalid/u);
    assert.equal(removed,true);
  }finally{fs.readFileSync=original;syncBuiltinESMExports();}
});

test("self-consistent publication hashes cannot hide invalid SDK ownership or descriptors", async t => {
  const archive = realpathSync(process.env.V12_PHASE20_COVERAGE_FIXTURE);
  const run = readdirSync(path.join(archive, "artifacts/native/v1.2")).find(name => name.startsWith("phase20-"));
  const shard = "multi-plan";
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "closeout-sdk-boundary-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const prefix = `artifacts/native/v1.2/${run}`;
  const publicationRelative = `${prefix}/publication/${shard}.json`;
  const originalPublication = JSON.parse(readFileSync(path.join(archive, publicationRelative), "utf8"));
  for (const relative of [`${prefix}/build.json`, publicationRelative, ...originalPublication.members.map(member => `${prefix}/${member.artifact}`)]) {
    mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    copyFileSync(path.join(archive, relative), path.join(root, relative));
  }
  const mappingRelative = `${prefix}/mapping/${shard}.json`;
  const originalMapping = JSON.parse(readFileSync(path.join(root, mappingRelative), "utf8"));
  const scenarios = [
    ["mapping missing identity", value => { value.run_id = "phase20-20261014T000000Z-aaaaaaaaaaaa"; }],
    ["mapping null", () => null],
    ["mapping schema", value => { value.schema_version = 1; }],
    ["mapping producer", value => { value.producer = "other-producer"; }],
    ["owning shard", value => { value.shard = "workout"; }],
    ["missing attestation", value => { value.tool_attestation = null; }],
    ["absent attestation", value => { delete value.tool_attestation; }],
    ["missing descriptor", value => { value.tool_attestation.safe_sdk = {}; }],
    ["extra descriptor field", value => { value.tool_attestation.safe_sdk.extra = true; }],
    ["SDK schema", value => { value.tool_attestation.safe_sdk.schema_version = 2; }],
    ["identity digest", value => { value.tool_attestation.safe_sdk.identity_sha256 = "bad"; }],
    ["identity digest type", value => { value.tool_attestation.safe_sdk.identity_sha256 = [value.tool_attestation.safe_sdk.identity_sha256]; }],
    ["receipt digest", value => { value.tool_attestation.safe_sdk.receipt_sha256 = "a".repeat(64); }],
    ["JAR digest", value => { value.tool_attestation.safe_sdk.jar_sha256 = "a".repeat(64); }],
    ["receipt path", value => { value.tool_attestation.safe_sdk.receipt_path = `${prefix}/tools/direct-workout-receipt.json`; }],
    ["JAR path", value => { value.tool_attestation.safe_sdk.jar_path = `${prefix}/tools/direct-workout-runner.jar`; }],
  ];
  for (const [name, mutate] of scenarios) await t.test(name, () => {
    const mapping = structuredClone(originalMapping);
    const publication = structuredClone(originalPublication);
    const replacement = mutate(mapping);
    const bytes = Buffer.from(`${JSON.stringify(replacement === null ? null : mapping)}\n`);
    writeFileSync(path.join(root, mappingRelative), bytes);
    const member = publication.members.find(item => item.artifact === `mapping/${shard}.json`);
    member.sha256 = sha(bytes);
    member.size_bytes = bytes.length;
    writeFileSync(path.join(root, publicationRelative), `${JSON.stringify(publication)}\n`);
    assert.throws(() => executeV12EvidenceCli(["--run", run, "--mode", "shards-only", "--ids", shard], { root }), /v12_preflight_(?:safe_sdk_attestation_invalid|json_schema_invalid)/u);
  });
  await t.test("malformed SDK owning mapping JSON", () => {
    const bytes = Buffer.from("malformed fixture JSON");
    const publication = structuredClone(originalPublication);
    writeFileSync(path.join(root, mappingRelative), bytes);
    const member = publication.members.find(item => item.artifact === `mapping/${shard}.json`);
    member.sha256 = sha(bytes);
    member.size_bytes = bytes.length;
    writeFileSync(path.join(root, publicationRelative), `${JSON.stringify(publication)}\n`);
    assert.throws(() => executeV12EvidenceCli(["--run", run, "--mode", "shards-only", "--ids", shard], { root }), /v12_preflight_publication_invalid/u);
  });
});

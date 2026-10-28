import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {EventEmitter}from"node:events";
import{PassThrough}from"node:stream";
import { GARMIN_CLI_EVIDENCE_DIRECTORY, GARMIN_CLI_EVIDENCE_SHA256 } from "../garmin-cli-coverage-evidence.mjs";
import { collectPhase20SubprocessCoverage,runPhase20SubprocessCoverage } from "../phase20-subprocess-coverage.mjs";

test("the current collector consumes sealed real Garmin CLI ranges without repeating the producer", async () => {
  const projectRoot = realpathSync(process.cwd());
  const directory = path.join(projectRoot, GARMIN_CLI_EVIDENCE_DIRECTORY);
  const bytes = readFileSync(path.join(directory,"evidence.json"));
  const sha = value => createHash("sha256").update(value).digest("hex");
  assert.equal(sha(bytes),GARMIN_CLI_EVIDENCE_SHA256);
  const proof = JSON.parse(bytes);
  const stdout = proof.invocations.find(item=>item.kind==="tests").stdout;
  const testReportPath=path.join(directory,stdout.path);
  assert.equal(sha(readFileSync(testReportPath)),stdout.sha256);
  const artifactRoot=path.join(projectRoot,"artifacts/native/personal-closeout-20261027/verifier-coverage");
  const rawDirectory=mkdtempSync(path.join(artifactRoot,"sealed-proof-input-"));
  const targetFiles=proof.source.files.slice(0,4).map(item=>item.path);
  const report=await collectPhase20SubprocessCoverage({projectRoot,rawDirectory,targetFiles,
    garminProject:{tests:proof.tests.files,testReportPath}});
  writeFileSync(path.join(rawDirectory,"observed-report.json"),JSON.stringify({collector_sha256:sha(readFileSync("scripts/phase20-subprocess-coverage.mjs")),
    reused_producer_seal_sha256:GARMIN_CLI_EVIDENCE_SHA256,real_test_stdout_sha256:stdout.sha256,producer_repeated:false,report},null,2)+"\n");
  assert.deepEqual(Object.keys(report.files).sort(),targetFiles.sort());
  assert.deepEqual(report.failures,["scripts/verify-garmin-python-lock.mjs: branches 99.24%"]);
  for(const [file,value]of Object.entries(report.files))for(const metric of ["statements","branches","functions","lines"]){
    const expected=file==="scripts/verify-garmin-python-lock.mjs"&&metric==="branches"?99.24:100;
    assert.equal(value[metric].pct,expected);
  }
  assert.deepEqual(report.files["scripts/verify-garmin-python-lock.mjs"].uncovered_branches,[{type:"branch",line:164,location_line:164,index:0}]);
});

test("the Garmin project loader preserves a conservative failure from retained raw ranges",async()=>{
  const projectRoot=realpathSync(process.cwd()),directory=path.join(projectRoot,GARMIN_CLI_EVIDENCE_DIRECTORY);
  const proof=JSON.parse(readFileSync(path.join(directory,"evidence.json"),"utf8"));
  const testsReport=readFileSync(path.join(directory,proof.invocations.find(item=>item.kind==="tests").stdout.path));
  const outputDirectory=mkdtempSync(path.join(projectRoot,"artifacts/native/personal-closeout-20261027/verifier-coverage/garmin-project-loader-"));
  const child=new EventEmitter();child.pid=7001;child.stdio=[null,null,null,new PassThrough()];
  await assert.rejects(runPhase20SubprocessCoverage({projectRoot,outputDirectory,
    projects:[{name:"garmin-packaging",modules:proof.source.files.slice(0,4).map(item=>item.path),tests:proof.tests.files}],
    platform:"win32",spawnImplementation:()=>{
      // Mock leader completion is control input only. The report is the actual
      // hash-sealed producer report; this test does not claim a fresh producer run.
      const reportPath=path.join(outputDirectory,"projects/garmin-packaging/test-results.tap");
      mkdirSync(path.dirname(reportPath),{recursive:true});writeFileSync(reportPath,testsReport);
      queueMicrotask(()=>child.emit("close",0,null));return child;
    },windowsTreeProbeImplementation:()=>({status:0,signal:null,stdout:""}),
    taskkillImplementation:()=>assert.fail("empty mock owner tree must not be signalled"),
  }),/phase20_integrity_coverage_failed/u);
  const summary=JSON.parse(readFileSync(path.join(outputDirectory,"coverage-summary.json"),"utf8"));
  assert.equal(summary["scripts/verify-garmin-python-lock.mjs"].branches.pct,99.24);
  writeFileSync(path.join(outputDirectory,"test-provenance.json"),JSON.stringify({test_only:true,mock_leader_completion:true,
    retained_producer_report_sha256:createHash("sha256").update(testsReport).digest("hex"),fresh_producer_execution:false,
    retained_undercoverage_preserved:true},null,2)+"\n");
});

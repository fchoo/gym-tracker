import assert from "node:assert/strict";
import {EventEmitter}from"node:events";
import{copyFileSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,symlinkSync,writeFileSync,existsSync}from"node:fs";
import path from"node:path";
import{PassThrough}from"node:stream";
import test from"node:test";
import{pathToFileURL}from"node:url";
import{createHash}from"node:crypto";
import{withFaultProof}from"./closeout-fault-proof.mjs";

test("a throwing imported tracker stop preserves cleanup failure and ownership",async()=>{
  const project=process.cwd(),subject="scripts/phase20-subprocess-coverage.mjs";
  const base=path.join(project,"artifacts/native/personal-closeout-20261027/verifier-coverage/collector-import-faults");mkdirSync(base,{recursive:true});
  const tree=mkdtempSync(path.join(base,"fault-"));mkdirSync(path.join(tree,"scripts"));
  copyFileSync(path.join(project,subject),path.join(tree,subject));
  const expected="33e4bc6887ed5e7378a6f017b74d9463202073b230bebbdbda1ed8fda43ab00d";
  assert.equal(createHash("sha256").update(readFileSync(path.join(tree,subject))).digest("hex"),expected);
  for(const name of readdirSync(path.join(project,"scripts"))){if(["phase20-subprocess-coverage.mjs","v12-posix-process-tree.mjs"].includes(name))continue;symlinkSync(path.join(project,"scripts",name),path.join(tree,"scripts",name));}
  writeFileSync(path.join(tree,"scripts/v12-posix-process-tree.mjs"),"export const V12_POSIX_OWNERSHIP_ENV='CONTROLLED_COLLECTOR_OWNER';export function createV12PosixProcessTreeTracker(){return{treeState:()=> 'empty',signal:()=>{throw Error('unexpected signal');},stop:()=>{throw Error('controlled stop failure');}};}\n");
  const root=mkdtempSync(path.join(tree,"case-"));writeFileSync(path.join(root,"fixture.test.mjs"),"import test from 'node:test';test('fixture',()=>{});\n");
  await withFaultProof({tree,subject,testFile:"scripts/testing/closeout-collector-import-fault.test.mjs",
    reason:"Imported POSIX tracker stop throws despite an empty owner set",overrides:["scripts/v12-posix-process-tree.mjs"],operation:async()=>{
      const collector=await import(pathToFileURL(path.join(tree,subject)).href);
      const child=new EventEmitter();child.pid=7001;child.stdio=[null,null,null,new PassThrough()];
      await assert.rejects(collector.runPhase20SubprocessCoverage({projectRoot:root,outputDirectory:path.join(root,"coverage"),
        projects:[{name:"fixture",coverage:false,tests:["fixture.test.mjs"]}],platform:"linux",projectTimeoutMs:1000,
        spawnImplementation:()=>{queueMicrotask(()=>child.emit("close",0,null));return child;}}),/phase20_coverage_project_cleanup_failed:fixture/u);
      assert.equal(existsSync(path.join(root,"coverage/.process-ownership")),true);
      assert.equal(existsSync(path.join(root,"coverage/projects/fixture/.process-ownership")),true);
    }});
});

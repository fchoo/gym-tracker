import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import { runPhase20SubprocessCoverage } from "../phase20-subprocess-coverage.mjs";

test("a timed-out project escalates its owned mock Windows tree and reports the timeout", async t => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "collector-timeout-path-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(path.join(root, "held.test.mjs"), "import test from 'node:test';test('held',()=>{});\n");
  const child = new EventEmitter();
  child.pid = 7001;
  child.stdio = [null, null, null, new PassThrough()];
  let alive = true;
  const calls = [];
  const output = path.join(root, "coverage");
  await assert.rejects(runPhase20SubprocessCoverage({ projectRoot: root, outputDirectory: output,
    projects: [{ name: "held", coverage: false, tests: ["held.test.mjs"] }], projectTimeoutMs: 10, terminateGraceMs: 10,
    platform: "win32", spawnImplementation: () => child,
    windowsTreeProbeImplementation: () => ({ status: 0, signal: null, stdout: alive ? "7001\n" : "" }),
    taskkillImplementation: (program, args) => {
      calls.push([program, args]);
      if (args.includes("/F")) alive = false;
      return { status: 0, signal: null, stdout: "", stderr: "" };
    },
  }), /phase20_coverage_project_timeout:held/u);
  assert.deepEqual(calls, [["taskkill", ["/PID", "7001", "/T"]], ["taskkill", ["/PID", "7001", "/T", "/F"]]]);
});

test("a peer failure cancels active projects and never dequeues the remaining project", async t => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "collector-abort-path-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const name of ["active", "failed", "queued"]) writeFileSync(path.join(root, name + ".test.mjs"), "import test from 'node:test';test('fixture',()=>{});\n");
  const children = [];
  const signals = [];
  const alive = new Set();
  const report = name => { const file = path.join(root, `coverage/projects/${name}/test-results.tap`);mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,"# skipped 0\n"); };
  const pending = runPhase20SubprocessCoverage({ projectRoot: root, outputDirectory: path.join(root, "coverage"),
    projects: ["active", "failed", "queued"].map(name => ({name,coverage:false,tests:[name+".test.mjs"]})), maxParallel:2,
    projectTimeoutMs: 1000, terminateGraceMs: 10, platform:"win32",
    spawnImplementation: (program,args) => {
      const child = new EventEmitter();child.pid=7001+children.length;child.stdio=[null,null,null,new PassThrough()];
      alive.add(child.pid);children.push(child);
      if (children.length===2) queueMicrotask(()=>{alive.delete(child.pid);child.emit("close",1,null);});
      return child;
    },
    windowsTreeProbeImplementation: (program,args) => ({status:0,signal:null,stdout:alive.has(Number(args.at(-1)))?String(args.at(-1))+"\n":""}),
    taskkillImplementation: (program,args) => {
      signals.push(args);const pid=Number(args[1]);alive.delete(pid);
      const child=children.find(c=>c.pid===pid);queueMicrotask(()=>child.emit("close",0,null));
      return {status:0,signal:null,stdout:"",stderr:""};
    },
  });
  await assert.rejects(pending,/phase20_coverage_project_failed:failed/u);
  assert.equal(children.length,2);
  assert.deepEqual(signals,[["/PID","7001","/T"]]);
});

test("malformed Windows tree probes and taskkill errors cannot authorize cleanup", async t => {
  const probes = [
    ["throws",()=>{throw Error("controlled probe failure");}],
    ["absent stdout",()=>({status:0,signal:null})],
    ["invalid PID",()=>({status:0,signal:null,stdout:"0\n"})],
    ["oversized tree",()=>({status:0,signal:null,stdout:Array(4097).fill("7001").join("\n")})],
  ];
  for(const [name,probe]of probes)await t.test(name,async()=>{
    const root=realpathSync(mkdtempSync(path.join(tmpdir(),"collector-bad-probe-")));t.after(()=>rmSync(root,{recursive:true,force:true}));
    writeFileSync(path.join(root,"fixture.test.mjs"),"import test from 'node:test';test('fixture',()=>{});\n");
    const child=new EventEmitter();child.pid=7001;child.stdio=[null,null,null,new PassThrough()];
    const calls=[];
    const running=runPhase20SubprocessCoverage({projectRoot:root,outputDirectory:path.join(root,"coverage"),
      projects:[{name:"fixture",coverage:false,tests:["fixture.test.mjs"]}],platform:"win32",projectTimeoutMs:1000,terminateGraceMs:5,
      spawnImplementation:()=>{queueMicrotask(()=>child.emit("close",0,null));return child;},
      windowsTreeProbeImplementation:probe,onProjectSignal:event=>calls.push(event.signal),
      taskkillImplementation:()=>{throw Error("controlled taskkill failure");},
    });
    await assert.rejects(running,/phase20_coverage_project_cleanup_failed:fixture/u);
    assert.deepEqual(calls,["SIGTERM","SIGKILL"]);
  });
});

test("a replacement observed task tree is signalled by its observed PID set",async t=>{
  const root=realpathSync(mkdtempSync(path.join(tmpdir(),"collector-replaced-tree-")));t.after(()=>rmSync(root,{recursive:true,force:true}));
  writeFileSync(path.join(root,"fixture.test.mjs"),"import test from 'node:test';test('fixture',()=>{});\n");
  const child=new EventEmitter();child.pid=7001;child.stdio=[null,null,null,new PassThrough()];
  let alive=true;const calls=[];
  const running=runPhase20SubprocessCoverage({projectRoot:root,outputDirectory:path.join(root,"coverage"),
    projects:[{name:"fixture",coverage:false,tests:["fixture.test.mjs"]}],platform:"win32",projectTimeoutMs:1000,terminateGraceMs:5,
    spawnImplementation:()=>{const file=path.join(root,"coverage/projects/fixture/test-results.tap");mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,"# skipped 0\n");queueMicrotask(()=>child.emit("close",0,null));return child;},
    windowsTreeProbeImplementation:()=>({status:0,signal:null,stdout:alive?"7002\n7003\n":""}),
    taskkillImplementation:(program,args)=>{calls.push(args);if(args[1]==="7003")alive=false;return {status:0,signal:null,stdout:"",stderr:""};},
  });
  await running;
  assert.deepEqual(calls,[["/PID","7002","/T"],["/PID","7003","/T"]]);
});

test("a non-Error startup failure is retained rather than converted into success",async t=>{
  const root=realpathSync(mkdtempSync(path.join(tmpdir(),"collector-startup-value-")));t.after(()=>rmSync(root,{recursive:true,force:true}));
  writeFileSync(path.join(root,"fixture.test.mjs"),"import test from 'node:test';test('fixture',()=>{});\n");
  await assert.rejects(runPhase20SubprocessCoverage({projectRoot:root,outputDirectory:path.join(root,"coverage"),
    projects:[{name:"fixture",coverage:false,tests:["fixture.test.mjs"]}],platform:"win32",spawnImplementation:()=>{throw "controlled-startup-failure";}}),error=>error==="controlled-startup-failure");
});

test("a task disappearing between probe and signal is treated as drained",async t=>{
  const root=realpathSync(mkdtempSync(path.join(tmpdir(),"collector-task-race-")));t.after(()=>rmSync(root,{recursive:true,force:true}));
  writeFileSync(path.join(root,"fixture.test.mjs"),"import test from 'node:test';test('fixture',()=>{});\n");
  const child=new EventEmitter();child.pid=7001;child.stdio=[null,null,null,new PassThrough()];let probes=0;let signals=0;
  await runPhase20SubprocessCoverage({projectRoot:root,outputDirectory:path.join(root,"coverage"),
    projects:[{name:"fixture",coverage:false,tests:["fixture.test.mjs"]}],platform:"win32",projectTimeoutMs:1000,terminateGraceMs:5,
    spawnImplementation:()=>{const file=path.join(root,"coverage/projects/fixture/test-results.tap");mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,"# skipped 0\n");queueMicrotask(()=>child.emit("close",0,null));return child;},
    windowsTreeProbeImplementation:()=>({status:0,signal:null,stdout:++probes<=2?"7001\n":""}),
    taskkillImplementation:()=>{signals+=1;return {status:1,signal:null,stdout:"",stderr:"already exited"};},
  });
  assert.equal(signals,0);
});

test("failed taskkill reports are rechecked against actual empty ownership",async t=>{
  for(const result of [{status:1,signal:null,error:Error("controlled error")},{status:0,signal:"SIGTERM"}])await t.test(String(result.signal),async()=>{
    const root=realpathSync(mkdtempSync(path.join(tmpdir(),"collector-taskkill-result-")));t.after(()=>rmSync(root,{recursive:true,force:true}));
    writeFileSync(path.join(root,"fixture.test.mjs"),"import test from 'node:test';test('fixture',()=>{});\n");
    const child=new EventEmitter();child.pid=7001;child.stdio=[null,null,null,new PassThrough()];let alive=true,calls=0;
    await runPhase20SubprocessCoverage({projectRoot:root,outputDirectory:path.join(root,"coverage"),
      projects:[{name:"fixture",coverage:false,tests:["fixture.test.mjs"]}],platform:"win32",projectTimeoutMs:1000,terminateGraceMs:5,
      spawnImplementation:()=>{const file=path.join(root,"coverage/projects/fixture/test-results.tap");mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,"# skipped 0\n");queueMicrotask(()=>child.emit("close",0,null));return child;},
      windowsTreeProbeImplementation:()=>({status:0,signal:null,stdout:alive?"7001\n":""}),
      taskkillImplementation:()=>{calls+=1;alive=false;return result;},
    });
    assert.equal(calls,1);
  });
});

test("synchronous exit during TERM prevents a late escalation from signalling again",async t=>{
  const root=realpathSync(mkdtempSync(path.join(tmpdir(),"collector-synchronous-exit-")));t.after(()=>rmSync(root,{recursive:true,force:true}));
  writeFileSync(path.join(root,"fixture.test.mjs"),"import test from 'node:test';test('fixture',()=>{});\n");
  const child=new EventEmitter();child.pid=7001;child.stdio=[null,null,null,new PassThrough()];let alive=true;const calls=[];
  await assert.rejects(runPhase20SubprocessCoverage({projectRoot:root,outputDirectory:path.join(root,"coverage"),
    projects:[{name:"fixture",coverage:false,tests:["fixture.test.mjs"]}],platform:"win32",projectTimeoutMs:5,terminateGraceMs:10,
    spawnImplementation:()=>child,
    windowsTreeProbeImplementation:()=>({status:0,signal:null,stdout:alive?"7001\n":""}),
    taskkillImplementation:(program,args)=>{calls.push(args);alive=false;child.emit("close",0,null);return {status:0,signal:null};},
  }),/phase20_coverage_project_timeout:fixture/u);
  await new Promise(resolve=>setTimeout(resolve,25));
  assert.deepEqual(calls,[["/PID","7001","/T"]]);
});

test("a startup error without a PID cannot signal an unrelated process",async t=>{
  const root=realpathSync(mkdtempSync(path.join(tmpdir(),"collector-pidless-error-")));t.after(()=>rmSync(root,{recursive:true,force:true}));
  writeFileSync(path.join(root,"fixture.test.mjs"),"import test from 'node:test';test('fixture',()=>{});\n");
  const child=new EventEmitter();child.stdio=[null,null,null,new PassThrough()];const failure=Error("controlled no-PID startup");let calls=0;
  await assert.rejects(runPhase20SubprocessCoverage({projectRoot:root,outputDirectory:path.join(root,"coverage"),
    projects:[{name:"fixture",coverage:false,tests:["fixture.test.mjs"]}],platform:"win32",terminateGraceMs:5,
    spawnImplementation:()=>{queueMicrotask(()=>child.emit("error",failure));return child;},
    windowsTreeProbeImplementation:()=>({status:1,signal:null,stdout:""}),
    taskkillImplementation:()=>{calls+=1;assert.fail("no PID must never signal");},
  }),/phase20_coverage_project_cleanup_failed:fixture/u);
  assert.equal(calls,0);
});

test("a failed taskkill with a surviving tree remains a cleanup failure",async t=>{
  const root=realpathSync(mkdtempSync(path.join(tmpdir(),"collector-live-tree-error-")));t.after(()=>rmSync(root,{recursive:true,force:true}));
  writeFileSync(path.join(root,"fixture.test.mjs"),"import test from 'node:test';test('fixture',()=>{});\n");
  const child=new EventEmitter();child.pid=7001;child.stdio=[null,null,null,new PassThrough()];const calls=[];
  await assert.rejects(runPhase20SubprocessCoverage({projectRoot:root,outputDirectory:path.join(root,"coverage"),
    projects:[{name:"fixture",coverage:false,tests:["fixture.test.mjs"]}],platform:"win32",terminateGraceMs:5,
    spawnImplementation:()=>{queueMicrotask(()=>child.emit("close",0,null));return child;},
    windowsTreeProbeImplementation:()=>({status:0,signal:null,stdout:"7001\n"}),
    taskkillImplementation:(program,args)=>{calls.push(args);return {status:1,signal:null};},
  }),/phase20_coverage_project_cleanup_failed:fixture/u);
  assert.deepEqual(calls,[["/PID","7001","/T"],["/PID","7001","/T","/F"]]);
});

test("peer abort during an existing timeout cannot dispatch TERM twice",async t=>{
  const root=realpathSync(mkdtempSync(path.join(tmpdir(),"collector-timeout-abort-race-")));t.after(()=>rmSync(root,{recursive:true,force:true}));
  for(const name of ["timed","peer"])writeFileSync(path.join(root,name+".test.mjs"),"import test from 'node:test';test('fixture',()=>{});\n");
  const children=[],alive=new Set(),calls=[];
  await assert.rejects(runPhase20SubprocessCoverage({projectRoot:root,outputDirectory:path.join(root,"coverage"),platform:"win32",maxParallel:2,
    projects:[{name:"timed",coverage:false,tests:["timed.test.mjs"],timeoutMs:5},{name:"peer",coverage:false,tests:["peer.test.mjs"]}],projectTimeoutMs:1000,terminateGraceMs:30,
    spawnImplementation:()=>{const child=new EventEmitter();child.pid=7001+children.length;child.stdio=[null,null,null,new PassThrough()];children.push(child);alive.add(child.pid);if(children.length===2)setTimeout(()=>{alive.delete(child.pid);child.emit("close",1,null);},15);return child;},
    windowsTreeProbeImplementation:(program,args)=>({status:0,signal:null,stdout:alive.has(Number(args.at(-1)))?args.at(-1)+"\n":""}),
    taskkillImplementation:(program,args)=>{calls.push(args);if(args.includes("/F")){const pid=Number(args[1]);alive.delete(pid);children.find(child=>child.pid===pid).emit("close",0,null);}return{status:0,signal:null};},
  }),/phase20_coverage_project_failed:peer/u);
  assert.deepEqual(calls,[["/PID","7001","/T"],["/PID","7001","/T","/F"]]);
});

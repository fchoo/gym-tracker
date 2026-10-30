// Records synthetic public verifier subprocesses without native authority.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const walk=directory=>fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
  const file=path.join(directory,entry.name);
  if(entry.name==='.git'||entry.name==='node_modules')return [];
  if(entry.isDirectory())return walk(file);
  return fs.statSync(file).isFile()?[file]:[];
});
const snapshotFiles=files=>files.map(file=>({path:file,realpath:fs.existsSync(file)?fs.realpathSync(file):null,sha256:fs.existsSync(file)?sha(fs.readFileSync(file)):null}));
const bind=file=>({path:file,sha256:sha(fs.readFileSync(file))});
export function runCapturedHostPhase(label,program,argv,options,toolInputs=[]) {
  const capture=process.env.V12_RESUME_CAPTURE_DIR;assert.equal(typeof capture,'string');
  const directory=path.join(capture,'public-phases',label);assert.equal(fs.existsSync(directory),false);
  fs.mkdirSync(path.join(directory,'raw-v8'),{recursive:true});
  const outer=JSON.parse(fs.readFileSync(path.join(capture,'inputs-before.json'),'utf8'));
  const fixtureRoot=fs.realpathSync(options.cwd);
  assert.notEqual(fixtureRoot,fs.realpathSync(process.cwd()),'public phase requires a separate disposable input root');
  const immutableProjectPaths=outer.source_inputs.map(x=>x.path).filter(file=>!(file===fixtureRoot||file.startsWith(`${fixtureRoot}${path.sep}`)));
  const fixturePaths=walk(options.cwd);
  const env={...options.env,NODE_V8_COVERAGE:path.join(directory,'raw-v8')};
  const runtime={executable:program,argv,cwd:options.cwd,platform:process.platform,arch:process.arch,version:process.version,
    environment_sha256:Object.fromEntries(Object.keys(env).sort().map(key=>[key,sha(env[key]??'')]))};
  const snapshot=()=>({captured_at:new Date().toISOString(),source_inputs:snapshotFiles(outer.source_inputs.map(x=>x.path)),immutable_project_source_inputs:snapshotFiles(immutableProjectPaths),fixture_input_role:{root:fixtureRoot,mutable_publication_outputs:true},installed_dependencies:snapshotFiles(outer.installed_dependencies.map(x=>x.path)),fixture_inputs:snapshotFiles(fixturePaths),tool_inputs:snapshotFiles([...new Set([program,...toolInputs])]),runtime});
  const before=snapshot();fs.writeFileSync(path.join(directory,'inputs-before.json'),JSON.stringify(before,null,2)+'\n');
  const started=new Date().toISOString(),result=spawnSync(program,argv,{...options,env}),finished=new Date().toISOString();
  fs.writeFileSync(path.join(directory,'stdout.log'),result.stdout??'');fs.writeFileSync(path.join(directory,'stderr.log'),result.stderr??'');
  const after=snapshot();fs.writeFileSync(path.join(directory,'inputs-after.json'),JSON.stringify(after,null,2)+'\n');
  const unchanged=JSON.stringify(before.immutable_project_source_inputs)===JSON.stringify(after.immutable_project_source_inputs)&&JSON.stringify(before.installed_dependencies)===JSON.stringify(after.installed_dependencies)&&JSON.stringify(before.tool_inputs)===JSON.stringify(after.tool_inputs);
  const proof={schema_version:2,evidence_type:'SYNTHETIC_HOST_PUBLIC_VERIFIER_TEST',test_only:true,native_acceptance_authority:false,
    full_dependency_equality_claimed:false,actual_execution:{...runtime,started_at:started,finished_at:finished,pid:result.pid,exit_code:result.status,signal:result.signal,error:result.error?.message??null},
    before:bind(path.join(directory,'inputs-before.json')),after:bind(path.join(directory,'inputs-after.json')),test_log:bind(path.join(directory,'stdout.log')),stderr:bind(path.join(directory,'stderr.log')),source_and_runtime_inputs_unchanged:unchanged,conservative_outer_vector_retained:true,fixture_input_role:before.fixture_input_role,immutable_project_source_scope:immutableProjectPaths,
    fixture_outputs:snapshotFiles(walk(options.cwd).filter(file=>!fixturePaths.includes(file))),raw_streams:fs.readdirSync(path.join(directory,'raw-v8')).filter(x=>x.endsWith('.json')).map(file=>bind(path.join(directory,'raw-v8',file))),outer_execution_path:path.join(capture,'execution.json')};
  fs.writeFileSync(path.join(directory,'execution.json'),JSON.stringify(proof,null,2)+'\n');
  assert.equal(unchanged,true,'public phase source or runtime inputs changed');
  return result;
}

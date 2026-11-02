// Complete, case-scoped host fault evidence. No native acceptance authority.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { takeCoverage } from 'node:v8';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function files(directory) {
  return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
    const file=path.join(directory,entry.name);
    if(entry.isDirectory()) return files(file);
    return fs.statSync(file).isFile() ? [file] : [];
  });
}
const bindings = paths => paths.map(file=>({path:file,realpath:fs.existsSync(file)?fs.realpathSync(file):null,sha256:fs.existsSync(file)?sha(fs.readFileSync(file)):null}));
const bind = file => ({path:file,sha256:sha(fs.readFileSync(file))});
export async function withFaultProof({tree,subject,testFile,reason,overrides,operation,publicSubject=false,allowFixtureOutputs=false}) {
  const capture=process.env.V12_RESUME_CAPTURE_DIR;
  assert.equal(typeof capture,'string','case proof requires the complete outer capture');
  const outerBefore=path.join(capture,'inputs-before.json');
  const vector=JSON.parse(fs.readFileSync(outerBefore,'utf8'));
  const snapshot=()=>({captured_at:new Date().toISOString(),
    source_inputs:bindings(vector.source_inputs.map(item=>item.path)),
    installed_dependencies:bindings(vector.installed_dependencies.map(item=>item.path)),
    fixture_inputs:bindings(files(tree).filter(file=>!/(?:fault-inputs-|coverage-fixture-override-proof|fault-execution)/u.test(file))),
    runtime:{executable:process.execPath,version:process.version,versions:process.versions,platform:process.platform,arch:process.arch,
      environment_sha256:Object.fromEntries(Object.keys(process.env).sort().map(k=>[k,sha(process.env[k]??'')]))}});
  const currentSubject=path.join(process.cwd(),subject),subjectFile=publicSubject?currentSubject:path.join(tree,subject);
  assert.equal(sha(fs.readFileSync(subjectFile)),sha(fs.readFileSync(currentSubject)));
  const before=snapshot(),beforeFile=path.join(tree,'fault-inputs-before.json');
  fs.writeFileSync(beforeFile,JSON.stringify(before,null,2)+'\n');
  takeCoverage();
  const rawBefore=new Set(fs.readdirSync(process.env.NODE_V8_COVERAGE));
  const started=new Date().toISOString();let failure=null;
  try { await operation(); } catch(error) {failure=error;}
  const finished=new Date().toISOString();takeCoverage();
  const raw=fs.readdirSync(process.env.NODE_V8_COVERAGE).filter(file=>!rawBefore.has(file)).map(file=>bind(path.join(process.env.NODE_V8_COVERAGE,file)));
  const after=snapshot(),afterFile=path.join(tree,'fault-inputs-after.json');
  fs.writeFileSync(afterFile,JSON.stringify(after,null,2)+'\n');
  const unchanged=JSON.stringify({...before,captured_at:undefined,fixture_inputs:allowFixtureOutputs?undefined:before.fixture_inputs})===JSON.stringify({...after,captured_at:undefined,fixture_inputs:allowFixtureOutputs?undefined:after.fixture_inputs});
  const proof={schema_version:2,evidence_type:'HOST_COVERAGE_ONLY_FAULT_INJECTION',reason,test_only:true,
    native_acceptance_proof:false,production_acceptance_authority:false,full_dependency_equality_claimed:false,
    subject_override_forbidden:true,subject:{repo_path:subject,current_source_sha256:sha(fs.readFileSync(currentSubject)),fixture_source_sha256:sha(fs.readFileSync(subjectFile)),fixture_artifact_path:subjectFile},
    test:{repo_path:testFile,source_sha256:sha(fs.readFileSync(path.join(process.cwd(),testFile)))},
    overrides:overrides.map(relative=>({repo_path:relative,current_source_sha256:sha(fs.readFileSync(path.join(process.cwd(),relative))),fixture_artifact_path:path.join(tree,relative),fixture_artifact_sha256:sha(fs.readFileSync(path.join(tree,relative)))})),
    actual_execution:{kind:'in-process behavioral assertion',pid:process.pid,executable:process.execPath,argv:[...process.execArgv,...process.argv.slice(1)],cwd:process.cwd(),started_at:started,finished_at:finished,assertion_completed:failure===null,error:failure?.message??null},
    before:bind(beforeFile),after:bind(afterFile),all_inputs_unchanged:unchanged,fixture_outputs_allowed:allowFixtureOutputs,fixture_bytes_unchanged:JSON.stringify(before.fixture_inputs)===JSON.stringify(after.fixture_inputs),outer_before:bind(outerBefore),outer_execution_path:path.join(capture,'execution.json'),outer_tap_path:path.join(capture,'tests.tap'),raw_streams:raw};
  fs.writeFileSync(path.join(tree,'coverage-fixture-override-proof.json'),JSON.stringify(proof,null,2)+'\n');
  if(failure!==null) throw failure;
  assert.equal(unchanged,true,'case runtime or fixture inputs changed');
  assert.ok(raw.length>0,'no actual raw coverage witness');
}

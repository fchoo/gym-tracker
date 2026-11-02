// Staged public boundary regression. Install only after GlobalSafeEnd.
import assert from 'node:assert/strict';
import test from 'node:test';
import {validateV12ExpectedPublicationMembers} from '../verify-v12-native-evidence.mjs';

test('expected member policy rejects absent indexed entries and ignores iterator substitutions',()=>{
  const resolve=sqlite=>validateV12ExpectedPublicationMembers({shard:'sqlite',registry:{sqlite}});
  for(const members of [Array(1),[undefined],['sqlite/a.json',undefined],['sqlite/a.json','sqlite/a.json']]){
    assert.throws(()=>resolve(members),/v12_preflight_artifact_set_invalid/u);
  }
  const invalid=['../escape.json'];
  invalid[Symbol.iterator]=function*(){yield 'sqlite/migration.json';};
  assert.throws(()=>resolve(invalid),/v12_preflight_artifact_set_invalid/u);
  const sparse=Array(1);
  sparse[Symbol.iterator]=function*(){yield 'sqlite/migration.json';};
  assert.throws(()=>resolve(sparse),/v12_preflight_artifact_set_invalid/u);
  const dense=['sqlite/migration.json','sqlite/portability.json'];
  assert.deepEqual(resolve(dense),dense);
});

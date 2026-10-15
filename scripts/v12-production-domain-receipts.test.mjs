import assert from 'node:assert/strict';
import test from 'node:test';
import { junitOutcome, worse } from './v12-production-domain-receipts.mjs';

test('JUnit outcome is structural, preserves failure precedence, and requires exactly one case', () => {
  assert.equal(junitOutcome('<testsuite><testcase name="a"/></testsuite>', 0), 'PASS');
  assert.equal(junitOutcome('<testsuites><testsuite><testcase><skipped/></testcase></testsuite></testsuites>', 0), 'NOT_RUN');
  assert.equal(junitOutcome('<testsuite><testcase><skipped/><error/></testcase></testsuite>', 1), 'FAIL');
  assert.equal(worse('FAIL', 'PASS'), 'FAIL');
  assert.equal(worse('PASS', 'NOT_RUN'), 'NOT_RUN');
});
for (const xml of [
  '<testsuite><testcase/></bad>',
  '<testsuite/><testsuite/>',
  '<testsuite><failure/><testcase/></testsuite>',
  '<testsuite><testcase/><testcase/></testsuite>',
  '<testsuite><testcase name="a" name="b"/></testsuite>',
  '<!DOCTYPE testsuite SYSTEM "file:///private"><testsuite><testcase/></testsuite>',
  '<testsuite><!-- <testcase/> --></testsuite>',
  '<testsuite tests="1" failures="1"><testcase/></testsuite>',
]) test('malformed or substituted JUnit cannot pass', () => { assert.throws(() => junitOutcome(xml, 0), /junit_/u); });
test('nonzero exit without a failing case cannot pass', () => { assert.throws(() => junitOutcome('<testsuite><testcase/></testsuite>', 1), /junit_exit_mismatch/u); });

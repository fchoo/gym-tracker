---
phase: 20-native-acceptance
reviewed: 2026-10-15T00:00:00Z
depth: deep
files_reviewed: 38
files_reviewed_list:
  - maestro/v1.2/calendar.yaml
  - maestro/v1.2/garmin-progress.yaml
  - scripts/benchmark-v12-interactions.mjs
  - scripts/benchmark-v12-interactions.test.mjs
  - scripts/capture-v12-visual.mjs
  - scripts/capture-v12-visual.test.mjs
  - scripts/compare-v12-visual.mjs
  - scripts/compare-v12-visual.test.mjs
  - scripts/generate-v12-parity-report.mjs
  - scripts/run-v12-maestro.mjs
  - scripts/v12-accessibility-shard.mjs
  - scripts/v12-accessibility-shard.test.mjs
  - scripts/v12-calendar-shard.mjs
  - scripts/v12-calendar-shard.test.mjs
  - scripts/v12-garmin-shard.mjs
  - scripts/v12-garmin-shard.test.mjs
  - scripts/v12-performance-shard.mjs
  - scripts/v12-preflight-contract.test.mjs
  - scripts/verify-v12-native-evidence.mjs
  - scripts/v12-native-adapter.mjs
  - scripts/v12-atomic-shard-publication.mjs
  - scripts/v12-atomic-shard-publication.test.mjs
  - scripts/v12-atomic-publication.integration.test.mjs
  - scripts/v12-sqlite-shard.mjs
  - scripts/v12-recovery-shard.mjs
  - scripts/v12-recovery-shard.test.mjs
  - scripts/v12-phase20-cli-blackbox.test.mjs
  - scripts/testing/v12-phase20-blackbox/fake-device-adapter.mjs
  - scripts/testing/v12-phase20-blackbox/fake-device-tool.mjs
  - scripts/generate-v12-attended-checklist.mjs
  - scripts/generate-v12-attended-checklist.test.mjs
  - scripts/create-v12-readiness-handoff.mjs
  - scripts/v12-calendar-evidence-coverage.test.mjs
  - scripts/v12-blocker-row-resolver.mjs
  - scripts/v12-blocker-row-resolver.test.mjs
  - scripts/v12-production-native-adapter-launcher.mjs
  - scripts/v12-native-adapter-attestation.test.mjs
  - scripts/v12-evidence-scripts.test.mjs
findings:
  critical: 1
  warning: 0
  info: 0
  total: 1
status: issues_found
---

# Phase 20: Code Review Report

**Reviewed:** 2026-10-15T00:00:00Z
**Depth:** deep
**Files Reviewed:** 38
**Status:** issues_found

## Summary

The prior false-pass paths are substantially closed. The new typed source-owned resolver maps the 172 rows to concrete functional, comparison, Calendar, Garmin, recovery, performance, and attended inputs; blocking states are preserved into `NOT_READY`. Visual comparisons now re-read retained PNG bytes and recompute their derived artifacts and metrics. Attended failures are hard readiness blockers, and recovery/Calendar validation requires the retained JUnit and receipt structures. The atomic producer/publisher boundaries also remain in place.

However, the claimed production adapter path is not executable. Outside the explicit test-only fake seam, the checked-in launcher returns a visual result that its own consumer necessarily rejects, and deliberately fails every other action used by the Phase 20 CLIs. Consequently, the passing end-to-end suite proves only the explicitly enabled fake adapter path, not a real-device production evidence pipeline. This leaves CR-02 open in production.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Default production adapter cannot execute the documented native-evidence pipeline

**Classification:** **BLOCKER**

**File:** `scripts/v12-production-native-adapter-launcher.mjs:49-54`, `scripts/capture-v12-visual.mjs:137-139`, `scripts/v12-phase20-cli-blackbox.test.mjs:64`

**Issue:** The default production launcher reports `visual-capture` and `visual-capture-batch` with only a PNG and `settings: { restored: false }`; it omits the required `fixture_id`. The production capture consumer rejects both omissions before it can write even one capture record. The launcher then deliberately terminates every other required action (`visual-compare`, accessibility, performance, SQLite, recovery, Garmin, and Calendar) with `action_contract_unavailable`. The black-box test does not cover this default path: it always sets `NODE_ENV=test`, both `V12_NATIVE_ADAPTER_TEST_*` markers, and `V12_NATIVE_ADAPTER_COMMAND` to the checked-in fake adapter. This is fail-closed rather than a false READY, but it means no real-device run can generate the evidence that this phase is intended to seal.

**Executable repro:** With a valid Phase 20 `build.json`, a connected non-emulator device, and no `V12_NATIVE_ADAPTER_*` test variables, run:

```sh
env -u V12_NATIVE_ADAPTER_COMMAND \
    -u V12_NATIVE_ADAPTER_TEST_MODE \
    -u V12_NATIVE_ADAPTER_TEST_PROCESS \
    NODE_ENV=production V12_DEVICE_SERIAL=<serial> \
    node scripts/capture-v12-visual.mjs --run <phase20-run-id> --all
```

It exits non-zero with `v12_visual_capture_capture_invalid`: the launcher response at line 49 lacks `fixture_id` and reports `restored: false`, both required at capture lines 137-139. Invoking any non-capture producer through the same environment reaches line 54 and exits non-zero with `v12_native_adapter_command_failed` after `v12_production_native_launcher_action_contract_unavailable`.

**Fix:** Implement each adapter action against the real, identity-validated device/runner (including navigation/configuration, capture fixture identity, setting restoration, and the action-specific Maestro/native receipts), or do not present this launcher as a production implementation. Add a non-test subprocess integration test that uses the default launcher with a controlled real-device runner and proves at least one valid capture plus each action-specific response contract. Keep the fake adapter restricted to the existing explicit test-mode triplet.

## Verification Performed

- `node --test scripts/v12-phase20-cli-blackbox.test.mjs` — passed (zero skipped). The test is useful for rejecting false READY from mutated source artifacts, but it runs under the explicit fake-adapter test seam described above.
- Focused source/result, adapter-attestation, visual, attended, recovery, Calendar, and evidence-script suites passed:

  `node --test scripts/v12-native-adapter-attestation.test.mjs scripts/v12-blocker-row-resolver.test.mjs scripts/capture-v12-visual.test.mjs scripts/compare-v12-visual.test.mjs scripts/generate-v12-attended-checklist.test.mjs scripts/v12-recovery-shard.test.mjs scripts/v12-calendar-shard.test.mjs scripts/v12-calendar-evidence-coverage.test.mjs scripts/v12-evidence-scripts.test.mjs`

No synthetic all-PASS/READY fixture was required or treated as a release criterion. The review assessed the absence of false pass and the configured `NOT_READY`/conditional readiness behavior.

---

_Reviewed: 2026-10-15T00:00:00Z_
_Reviewer: TRAE (gsd-code-reviewer)_
_Depth: deep_

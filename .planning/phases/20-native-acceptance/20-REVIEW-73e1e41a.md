---
phase: 20-native-acceptance
reviewed: 2026-10-15T02:31:36Z
depth: deep
files_reviewed: 32
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
  - scripts/create-v12-readiness-handoff.mjs
  - scripts/v12-calendar-evidence-coverage.test.mjs
findings:
  critical: 5
  warning: 0
  info: 0
  total: 5
status: issues_found
---

# Phase 20: Code Review Report

**Reviewed:** 2026-10-15T02:31:36Z
**Depth:** deep
**Files Reviewed:** 32
**Status:** issues_found

## Summary

This deep re-review confirms that several iteration-2 changes are real: producer CLIs now go through a subprocess protocol, successful shards publish a manifest last, the visual capture writer retains and hash-checks native PNGs, exception precedence rejects blocking source results, and the black-box suite invokes the documented commands.

However, Phase 20 remains unsafe to ship. The unified preseal maps existing aggregate files directly to 172 `PASS` rows without evaluating their actual outcomes. A failed Samsung observation is recorded but then treated as a passing final gate. Visual comparison proof is still hash-shaped metadata rather than retained/recomputed image evidence. The only configured adapter path is an arbitrary environment command, and the checked-in black-box fake is accepted by the same production path. Recovery also converts any sufficiently long report text into eight passed cases. Passing tests therefore demonstrate the supplied synthetic protocol, not a source-bound native acceptance seal.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Preseal manufactures all 172 `PASS` inputs from artifact presence

**Classification:** **BLOCKER**

**File:** `scripts/verify-v12-native-evidence.mjs:808-827`

**Issue:** `preflightRowEvidence` assigns `result: "PASS"` for every matrix row after selecting one coarse artifact per owning phase. It neither parses nor validates the selected producer's outcome, and it does not map a row to concrete case, configuration, visual comparison, or attended evidence. `executeV12EvidenceCli` persists those manufactured results at `:843` and final mode feeds them directly to `deriveV12Ledger` at `:852`. Thus a present Garmin matching file, Calendar transition file, visual index, or performance file turns every associated row into `PASS`, including rows whose actual shard/case status is `FAIL`, `NOT_RUN`, or `REVIEW_REQUIRED`.

**Fix:** Replace `preflightRowEvidence` with a typed per-row resolver. It must re-read the relevant sealed producer records, validate each concrete case/configuration and map its real status to exactly one matrix row. Reject aggregate-only evidence and fail preseal for an unmapped row. Add black-box mutations that set a Calendar stage, Garmin case, comparison result, accessibility trace, and performance gate to each blocking status; final mode must then produce `NOT_READY` rather than a 172-row PASS ledger.

### CR-02: The documented production CLIs have no production adapter and accept the test fake as native evidence

**Classification:** **BLOCKER**

**File:** `scripts/v12-native-adapter.mjs:13-29`, `scripts/v12-phase20-cli-blackbox.test.mjs:57-63`, `scripts/testing/v12-phase20-blackbox/fake-device-adapter.mjs:26-98`

**Issue:** The adapter obtains its executable solely from `V12_NATIVE_ADAPTER_COMMAND` (`:14`) and accepts any successful JSON-speaking command (`:19-29`). There is no checked-in production device-runner command or package-script configuration; the only repository wiring found is the black-box test, which points that environment variable at `scripts/testing/v12-phase20-blackbox/fake-device-adapter.mjs` (`v12-phase20-cli-blackbox.test.mjs:62`). That fake returns synthetic `EXECUTED` capture, accessibility, performance, Garmin, Calendar, SQLite, and recovery data (`fake-device-adapter.mjs:26-98`) and is not rejected by production code. A normal documented CLI therefore fails with `command_missing`, while a mistakenly exported test environment can seal fake evidence as production-native evidence.

**Fix:** Check in and register a production-only adapter launcher, make every Phase 20 CLI use that fixed launcher by default, and reserve an explicit test-only injection mechanism for test processes. The adapter request must carry a production attestation/identity from the real device runner, and production mode must reject executable paths under `scripts/testing/`, fake fixture attestations, and test-only environment markers. Add a subprocess test proving an unset production adapter still reaches the real launcher and that the fake adapter is rejected outside an explicit test mode.

### CR-03: Preseal does not validate retained visual-comparison inputs, allowing fabricated comparison PASS records

**Classification:** **BLOCKER**

**File:** `scripts/compare-v12-visual.mjs:32-39`, `scripts/compare-v12-visual.mjs:120-143`, `scripts/verify-v12-native-evidence.mjs:772-794`

**Issue:** `compareV12Capture` accepts arbitrary hash-shaped `artifacts` values and caller-provided semantic/pixel measurements (`compare-v12-visual.mjs:32-39`), then writes them as comparison results without retaining or reading reference, overlay, difference, or mask bytes (`:120-134`). Its verifier validates only the in-memory index shape (`:137-143`). Unified preseal is weaker still: for `comparison/index.json` it checks only that the array has `107 * 64` elements (`verify-v12-native-evidence.mjs:790`); it neither invokes the comparison verifier nor recomputes any comparison input or output. This leaves the original visual-evidence fabrication path open despite capture PNG hash checks.

**Fix:** Make the comparison producer receive only retained, verified capture/reference paths; write the reference, native, overlay, difference, and mask files into the atomic shard; recompute their digests, dimensions, and pixel delta in the producer; and persist those descriptors per result. In preseal, call the concrete comparison verifier, re-read every descriptor, reject duplicate/placeholder bytes, and verify the native descriptor is the corresponding retained capture record. Add negative black-box cases for a forged metric, a missing overlay/difference/mask, a hash that does not match bytes, and duplicated native PNG content.

### CR-04: Failed Samsung observations neither block readiness nor prove their PNG hashes refer to retained bytes

**Classification:** **BLOCKER**

**File:** `scripts/generate-v12-attended-checklist.mjs:124-138`, `scripts/verify-v12-native-evidence.mjs:550-565`, `scripts/verify-v12-native-evidence.mjs:591-613`

**Issue:** The attended schema stores only a hash string, not a PNG path or retained bytes (`generate-v12-attended-checklist.mjs:128-136`). Final validation only checks that each status is `passed` or `failed` and that hash strings are unique (`verify-v12-native-evidence.mjs:560-565`). It never reads an image, and it unconditionally records the attended gate as `PASS` whenever the record parses (`:595`, `:610-613`). Readiness is calculated solely from automated ledger counts (`:591-594`), so a fresh record with all seven Samsung observations marked `failed` can still produce `READY` when automated rows were manufactured as PASS.

**Fix:** Require each attended row to reference a safe, immutable PNG descriptor (`path`, `sha256`, `size_bytes`), re-read and hash/decode every image, and reject duplicates. Map failed attended rows to the associated VER-12 rows or make them a hard final-readiness block; only all-passed, validated rows may produce an attended PASS gate. Add a final CLI regression test using a valid-identity record with one `failed` status and another with a nonexistent/incorrect PNG: neither may publish `READY` final evidence.

### CR-05: Recovery and Calendar evidence can report PASS without proving the prescribed native gesture/recovery behavior ran

**Classification:** **BLOCKER**

**File:** `scripts/v12-recovery-shard.mjs:33-42`, `scripts/v12-calendar-shard.mjs:32-34`, `maestro/v1.2/calendar.yaml:10-219`

**Issue:** Recovery accepts any non-private report string of at least 32 bytes and deterministically translates it into eight `passed` cases and all 64 cuts (`v12-recovery-shard.mjs:33-42`); it never parses JUnit case outcomes or validates the expected recovery cuts. Calendar only validates adapter-supplied sample fields/statuses (`v12-calendar-shard.mjs:32-34`), with no event receipt, pointer path, source-flow hash, or assertion that the YAML gesture actually executed. Although the YAML now contains swipes (`calendar.yaml:10-112`), most stage outcomes remain only visibility assertions and the shard never binds its returned samples to that flow. Either adapter can therefore emit plausible metadata while no measured threshold/cancel/recovery action occurred.

**Fix:** Parse and validate every retained JUnit/trace result against the exact ordered recovery and Calendar registries, preserving each actual PASS/FAIL/REVIEW_REQUIRED state. Bind the Calendar output to a hashed flow revision and require retained, ordered pointer-event receipts with measured content width, dx/dy, cancellation/settle state, callback count, and screenshots/traces for every prescribed stage. Reject any stage without an executed gesture or the expected stage-specific semantic transition. Add black-box negative fixtures for a failing JUnit case, a missing cut, a visibility-only Calendar response, and fabricated samples with no matching input receipt.

---

_Reviewed: 2026-10-15T02:31:36Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_

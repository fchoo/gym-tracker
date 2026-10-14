---
phase: 20-native-acceptance
reviewed: 2026-10-14T08:25:08Z
depth: deep
files_reviewed: 19
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
findings:
  critical: 7
  warning: 2
  info: 1
  total: 10
status: issues_found
---

# Phase 20: Code Review Report

**Reviewed:** 2026-10-14T08:25:08Z
**Depth:** deep
**Files Reviewed:** 19
**Status:** issues_found

## Summary

The submitted remediation does not implement the executable, source-bound Phase 20 evidence pipeline described by Plans 20-09 through 20-12. The dominant defect is a split between injectable library helpers and the declared CLIs: the commands in the plans either fail deliberately, require unprovided in-process adapters, or validate only file presence/hashes. Consequently, synthetic or arbitrary files can pass portions of preseal, while the required visual, accessibility, performance, Garmin, attended, parity, and final-seal paths cannot run end to end.

The scoped unit tests pass, but they use injected callbacks and in-memory maps. They do not exercise the declared command lines, a real adapter boundary, or final-mode publication.

## Critical Issues

### CR-01: Plan-declared execution CLIs are intentionally non-executable

**File:** `scripts/capture-v12-visual.mjs:160-165`, `scripts/compare-v12-visual.mjs:143-148`, `scripts/v12-performance-shard.mjs:156-163`, `scripts/v12-garmin-shard.mjs:121-124`, `scripts/v12-calendar-shard.mjs:32`

**Issue:** Plans 20-10 and 20-11 declare direct `node`/`npm` commands as the native producers. Those commands do not have a production adapter path. `capture-v12-visual --all` always throws `native_adapter_required`; `compare-v12-visual --all` always throws `native_comparison_input_required`; `v12-performance-shard --execute` always throws `native_collector_required`; and the Garmin/Calendar CLIs default to callbacks that throw `*_executor_required`. The only working paths are exported functions called with test-supplied callbacks. This makes the required artifacts impossible to produce from the documented commands.

**Fix:** Implement one real, dependency-wired device-runner adapter and make each declared CLI invoke it. The adapter must acquire the exclusive device lease, validate the installed APK and source identity, collect the actual data, restore settings in `finally`, persist immutable artifacts, and emit a privacy-safe failure receipt. Keep callback injection only as an explicit test seam; do not make it the sole execution path.

### CR-02: The unified preseal registry does not match the required Phase 20 artifact contract

**File:** `scripts/verify-v12-native-evidence.mjs:620-629`

**Issue:** `V12_PREFLIGHT_SHARDS` names paths that Plans 20-09/10/11 neither declare nor require (`sqlite.json`, `recovery.json`) and omits required evidence such as `sqlite/migration.json`, `sqlite/portability.json`, `sqlite/history.json`, `recovery/lifecycle.json`, `maestro/recovery.xml`, `maestro/garmin-progress.xml`, `maestro/calendar.xml`, the screenshot/comparison corpus, and the required functional mapping files. A run with placeholder files at the two invented SQLite paths can satisfy this registry while missing the actual migration, portability, history, lifecycle, XML, visual, and comparison evidence.

**Fix:** Replace the registry with a single source-of-truth artifact schema that exactly enumerates every Plan 20-09/10/11 output, including directories expanded to their expected individual records. Reuse that schema in every producer, verifier, preseal, and final-seal path; reject unknown substitutes and missing Plan-declared files.

### CR-03: Preseal checks only that arbitrary bytes exist, not that required evidence is valid or bound to the build

**File:** `scripts/verify-v12-native-evidence.mjs:726-745`

**Issue:** `preflightValidateArtifacts` only hashes files. It neither parses producer schemas nor verifies producer/run/identity fields, source/APK/install hashes, expected case ordering, raw samples, image hashes, or XML/JUnit results. `executeV12EvidenceCli` validates `build.json` but never relates its identity to the required artifacts. Any nonempty JSON/XML blob at a registered path is accepted and entered into `preseal-validation.json`, creating a false PASS path before the owner checkpoint.

**Fix:** For each registry entry, safely read the artifact and run its concrete verifier against the manifest-derived identity. Validate the actual image bytes and comparison inputs, XML suite/case order and outcomes, exact 107×64 records, raw performance arrays, recovery/migration/portability/history data, and settings-restoration/failure receipts. Fail preseal unless every artifact independently re-reads and binds to the immutable build manifest.

### CR-04: `--mode final` never derives, seals, or publishes the final evidence contract

**File:** `scripts/verify-v12-native-evidence.mjs:732-754`

**Issue:** The Plan 20-12 command `npm run verify:v12:evidence -- --run "$V12_RUN_ID" --mode final` always terminates in `v12_preflight_final_inputs_required` after merely checking that preseal and attended files exist. It never validates attended evidence, calls `deriveV12Ledger`, calls `sealV12FinalEvidence`, writes the 172-row matrix/final seal, emits the parity report, or creates the readiness handoff. The documented final command is therefore a guaranteed no-op failure rather than the sole final seal.

**Fix:** Make final mode perform a strict ordered transaction: re-read immutable preseal, validate a fresh attended record, validate every shard, construct the 172 source-result inputs, derive the ledger, atomically write `ui-state-matrix.json` and `final-evidence.json`, generate the parity report and readiness handoff from that sealed JSON, then re-read all outputs. It must fail before publication if any predecessor is missing or invalid.

### CR-05: Accepted exceptions can overwrite observed failures and final derivation does not require a fresh Samsung record

**File:** `scripts/verify-v12-native-evidence.mjs:547-559`

**Issue:** The exception branch executes before the evidence result at line 556, so an exception converts the row to `ACCEPTED_EXCEPTION` even when its immutable source result is `FAIL`, `NOT_RUN`, or `REVIEW_REQUIRED`. This directly violates the contract that those states block conditional readiness and that an exception must never mask them. Separately, `deriveV12Ledger` receives an arbitrary `evidence` array and never reads or validates `attended-observations.json`; callers can derive all 172 rows without a fresh Samsung identity/configuration/PNG record.

**Fix:** First reject any exception attached to a row whose source result is not an eligible successful-but-deviating result; explicitly reject `FAIL`, `NOT_RUN`, and `REVIEW_REQUIRED` before exception mapping. Make the final derivation accept the run directory, load and validate `attended-observations.json`, require the exact required attended row/key set, fresh capture hashes, manifest source/APK/signature/installed-byte/device/configuration identity, and restored settings, then bind those hashes into the affected ledger rows.

### CR-06: Calendar's claimed threshold/gesture coverage executes no threshold gesture for most required stages

**File:** `maestro/v1.2/calendar.yaml:10-94`, `scripts/run-v12-maestro.mjs:338-416`

**Issue:** The forward/backward 10%, 24.9%, 25%, 25.1%, release, fast, retreat, and cancel stages only assert that existing elements are visible; they never drive a pointer. The runner codifies this absence: `V12_CALENDAR_STAGE_CONTRACTS` requires only visibility for those stages, and `IN_APP_GESTURE_STAGES` explicitly rejects `swipe` and Back commands. These stages can produce a complete-looking report/trace without exercising the claimed boundaries, cancellation, or intent behavior.

**Fix:** Define deterministic, measured pointer coordinates from the observed content width and execute the prescribed gestures/cancel sequence for every threshold stage. Record pre/during/post semantic and geometry samples from the application instrumentation, and make the runner reject traces unless their input-event receipt and expected stage-specific transition/callback invariants match.

### CR-07: Visual evidence can be fabricated from hashes and metadata without retained, source-bound images

**File:** `scripts/capture-v12-visual.mjs:120-157`, `scripts/compare-v12-visual.mjs:30-84`, `scripts/compare-v12-visual.mjs:135-140`

**Issue:** Capture verification reads only `screenshots/index.json`; it never opens `native_png.path`, verifies the file exists, recomputes its SHA-256, decodes it, or verifies measured configuration/source identity. Comparison accepts caller-provided pixel/semantic measurements plus arbitrary hash-shaped strings; `decodeV12ComparisonPng` is unused, and `verifyV12VisualComparison` likewise validates only the JSON index. Thus the same `Buffer.from("native-png")` or nonexistent artifacts can represent all 6,848 captures and produce PASS classifications without any real reference/native/overlay/difference/mask image relationship.

**Fix:** Persist and re-read each named image atomically. Recompute hashes from the files, decode PNG dimensions/content bounds, confirm each capture's measured configuration and source identity, generate overlay/difference from the retained reference/native bytes inside the producer, and require comparison records to point to those verified paths. The verifier must reject missing, duplicate-content, placeholder, stale, or externally supplied metric-only records.

## Warnings

### WR-01: Artifact publication is not atomic and producer failures leave ambiguous partial runs

**File:** `scripts/capture-v12-visual.mjs:126-140`, `scripts/compare-v12-visual.mjs:124-131`, `scripts/v12-garmin-shard.mjs:127-140`, `scripts/v12-calendar-shard.mjs:32`

**Issue:** Producers write hundreds of files one at a time directly to final paths. A process/device failure can leave a partial capture/comparison set; subsequent reruns are blocked by existence checks, and visual/accessibility producers do not create a durable failure receipt. The Plan requires immutable, atomic writes and retained failure evidence.

**Fix:** Write each shard to a run-scoped staging directory with exclusive creation, fsync/validate all content, write a manifest last, then atomically rename the completed shard directory. On any error, preserve a separately named, privacy-safe immutable failure receipt and make preseal reject incomplete/staging artifacts.

### WR-02: Tests prove injectable object shapes, not the documented end-to-end commands

**File:** `scripts/capture-v12-visual.test.mjs:59-71`, `scripts/v12-calendar-shard.test.mjs:51-78`, `scripts/benchmark-v12-interactions.test.mjs:117-140`, `scripts/v12-preflight-contract.test.mjs:33-37`

**Issue:** The tests pass because they inject `capture`, `executeNative`, `collect`, `write`, and in-memory maps. The preflight test only expects an error. No test invokes the Plan-declared `--all`, `--execute`, `--verify`, `shards-only`, `preseal`, or `final` command sequences with a real adapter fixture and then re-reads every produced path. This is why the missing CLIs and final seal were not detected.

**Fix:** Add black-box integration tests that launch each declared CLI against a disposable fake device/ADB/Maestro adapter process, assert exact immutable files and re-read verification, simulate mid-run failure/settings restoration, test stale identity and symlink/path traversal rejection, and prove final mode writes exactly 172 rows and never promotes `FAIL`/`NOT_RUN`/`REVIEW_REQUIRED` through an exception.

## Info

### IN-01: Garmin shard retains dead code/imports that obscure the security boundary

**File:** `scripts/v12-garmin-shard.mjs:2`, `scripts/v12-garmin-shard.mjs:36`

**Issue:** `rmSync` and `safeRelative` are unused. In a security-sensitive artifact writer, unused path-handling code makes it unclear whether a path validation control is actually enforced.

**Fix:** Remove the unused import/helper, or route all artifact-path construction through a tested safe-path helper.

---

_Reviewed: 2026-10-14T08:25:08Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_

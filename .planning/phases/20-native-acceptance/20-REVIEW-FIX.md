---
phase: 20-native-acceptance
fixed_at: 2026-10-15T02:27:01Z
review_path: .planning/phases/20-native-acceptance/20-REVIEW.md
iteration: 2
findings_in_scope: 9
fixed: 9
skipped: 0
status: all_fixed
verification_location: main checkout (workflow.use_worktrees=false)
---

# Phase 20: Code Review Fix Report

**Fixed at:** 2026-10-15T02:27:01Z
**Source review:** `.planning/phases/20-native-acceptance/20-REVIEW.md`
**Iteration:** 2

**Summary:**

- Findings in scope: 9
- Fixed: 9
- Skipped: 0
- Verification ran in the main checkout because `workflow.use_worktrees` is `false`.

## Fixed Issues

### CR-01: Plan-declared execution CLIs are intentionally non-executable

**Files modified:** `scripts/v12-native-adapter.mjs`, `scripts/capture-v12-visual.mjs`, `scripts/compare-v12-visual.mjs`, `scripts/v12-accessibility-shard.mjs`, `scripts/v12-performance-shard.mjs`, `scripts/v12-garmin-shard.mjs`, `scripts/v12-calendar-shard.mjs`
**Commit:** `0a1742f3`
**Applied fix:** Added a subprocess-based native-adapter protocol and connected each affected CLI to it. The adapter preserves an explicit fake-executable seam for host-only black-box tests while refusing to substitute in-memory callbacks as production evidence.

### CR-02: The unified preseal registry does not match the required Phase 20 artifact contract

**Files modified:** `scripts/verify-v12-native-evidence.mjs`
**Commit:** `794adcc1`
**Applied fix:** Replaced invented aggregate SQLite/recovery paths with the shared Plan 20 artifact registry covering individual SQLite, recovery, Garmin, Calendar, Maestro, visual, accessibility, and performance outputs.

### CR-03: Preseal checks only arbitrary bytes

**Files modified:** `scripts/verify-v12-native-evidence.mjs`
**Commit:** `d121c22e`
**Applied fix:** Preseal now parses JSON/XML, binds artifacts to immutable source/APK/install/device identity, verifies retained visual PNG hashes and dimensions, and rejects symlinks, malformed records, missing images, and invalid performance/accessibility envelopes.

### CR-04: `--mode final` never derives, seals, or publishes the final evidence contract

**Files modified:** `scripts/verify-v12-native-evidence.mjs`
**Commit:** `ed822a9e`
**Applied fix:** Final mode now revalidates all shards, requires immutable preseal row inputs plus fresh attended observations, derives the 172-row ledger, seals matrix/final evidence, writes parity/readiness outputs, and re-reads every published output with `release_authorized: false`.

### CR-05: Accepted exceptions can overwrite observed failures

**Files modified:** `scripts/verify-v12-native-evidence.mjs`
**Commit:** `a2fdf41d`
**Applied fix:** Exceptions now fail closed when attached to `FAIL`, `NOT_RUN`, or `REVIEW_REQUIRED`. The ledger also validates a fresh identity-bound attended record when supplied to final derivation.

### CR-06: Calendar threshold/gesture coverage executes no gesture

**Files modified:** `maestro/v1.2/calendar.yaml`, `scripts/run-v12-maestro.mjs`, `scripts/v12-calendar-evidence-coverage.test.mjs`
**Commit:** `f3868e63`
**Applied fix:** Added concrete pointer gestures at both sides of the threshold, exact threshold, release, fast, retreat, and cancel stages. The runner now requires a pointer path rather than accepting visibility-only stages.

### CR-07: Visual evidence can be fabricated from hashes and metadata

**Files modified:** `scripts/capture-v12-visual.mjs`, `scripts/capture-v12-visual.test.mjs`
**Commit:** `99071296`
**Applied fix:** Capture records now retain PNG dimensions, and verification re-reads/decode-checks every PNG, recomputes its hash and size, enforces the exact path, and rejects duplicate image bytes.

## Warning Fixes

### WR-01: Artifact publication is not atomic and producer failures leave ambiguous partial runs

**File:** `scripts/capture-v12-visual.mjs:126`, `scripts/compare-v12-visual.mjs:124`, `scripts/v12-garmin-shard.mjs:127`, `scripts/v12-calendar-shard.mjs:32`
**Files modified:** `scripts/v12-atomic-shard-publication.mjs`, all Phase 20 producer CLIs, `scripts/verify-v12-native-evidence.mjs`
**Commits:** `315af2dd`, `86272bac`, `fc277595`
**Applied fix:** All shards now stage members privately, fsync and validate them, publish a completion manifest last, and expose final paths only after atomic promotion. SQLite, recovery, Garmin, Calendar, functional Maestro, visual, comparison, accessibility, performance, preseal, and final publication all use this boundary. Failed attempts retain one bounded append-only receipt and cannot retry; staging, partial, symlinked, traversing, duplicate, and second-write states fail closed.

### WR-02: Tests prove injectable object shapes, not documented end-to-end commands

**File:** `scripts/capture-v12-visual.test.mjs:59`, `scripts/v12-calendar-shard.test.mjs:51`, `scripts/benchmark-v12-interactions.test.mjs:117`, `scripts/v12-preflight-contract.test.mjs:33`
**Files modified:** `scripts/v12-phase20-cli-blackbox.test.mjs`, `scripts/testing/v12-phase20-blackbox/fake-device-adapter.mjs`, `scripts/testing/v12-phase20-blackbox/fake-device-tool.mjs`, producer adapter seams
**Commits:** `98699c0d`, `183f3412`, `1e5da3d6`
**Applied fix:** The non-skipped subprocess suite runs every documented CLI in plan order against disposable fake ADB, Maestro, and device-adapter executables. It re-reads exact atomic artifacts through shards-only and preseal, completes attended prepare/record/verify, seals exactly 172 rows, renders parity/readiness with `release_authorized: false`, and verifies failure restoration, privacy, stale identity, traversal, partial staging, overwrite/retry, and exception precedence.

## Verification

- `npm run test:evidence:v12 -- --test-reporter=spec` — passed (36 tests)
- `node --test scripts/v12-calendar-evidence-coverage.test.mjs --test-name-pattern='runner manifest'` — passed (14 tests)
- `node --test scripts/capture-v12-visual.test.mjs` — passed (4 tests)
- `npm run typecheck` — passed
- `npm run lint` — passed (`Boundary check passed (436 files)`)
- `node --test scripts/v12-atomic-shard-publication.test.mjs scripts/v12-atomic-publication.integration.test.mjs` — passed (6 tests)
- `node --test scripts/v12-phase20-cli-blackbox.test.mjs` — passed (3 subprocess tests, zero skips; 172-row seal verified)

---

_Fixed: 2026-10-15T02:27:01Z_
_Fixer: TRAE CLI (gsd-code-fixer)_
_Iteration: 2_

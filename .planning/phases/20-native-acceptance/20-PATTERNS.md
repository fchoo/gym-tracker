# Phase 20: Native Acceptance - Pattern Map

**Mapped:** 2026-10-06  
**Files analyzed:** 16 planned new/modified source files  
**Analogs found:** 16 / 16 at file-role level; four Phase 20 responsibilities have no complete existing analog  
**Primary analog families:** 5 — Phase 11 shard runner, Phase 6 visual runner, Phase 12 aggregate verifier/benchmark, release-candidate manifest, Phase 7 Samsung checklist

## Scope Boundary

Phase 20 is an evidence layer. It may add runners, validators, synthetic fixtures, test-only probes, and developer-facing evidence artifacts. It must not add or change product-visible UI, product copy, domain behavior, migrations, or release authority.

The source list below is derived from `20-CONTEXT.md`, `20-UI-SPEC.md`, `20-RESEARCH.md`, the 172-row parity matrix, and the native verification matrix. Phase 13–19 contract files named by the matrices are prerequisites owned by those phases; Phase 20 consumes their exported case registries and must fail preflight when they are absent rather than recreating their business logic.

## File Classification

| New/Modified File | Action | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|---|
| `package.json` | extend | config | batch | `package.json` scripts at lines 23-28, 73-90 | exact extension |
| `app/__native-contracts.tsx` | extend | route / test harness | request-response, event-driven | same file: `defaultSuite`, `requestedPortableMergeSuite`, `expectedCaseCountFor`, `NativeContractResult`, `NativeSqliteContractsScreen` | exact extension |
| `scripts/run-native-sqlite-contracts.mjs` | extend | test runner | streaming, batch, file-I/O | same file: `manifestSupportsRequestedSuite`, source case registries, `supportedSuiteCases`, `assertPhase2ContractResult` | exact extension |
| `scripts/build-current-native-test-apk.sh` | extend carefully | config / build runner | batch, file-I/O | same file: exact source/APK/install manifest publisher | exact extension |
| `scripts/run-v12-maestro.mjs` | create | service / test runner | event-driven, batch, file-I/O | `scripts/run-phase11-maestro.mjs` plus `scripts/run-phase6-maestro.mjs` | composite role-match |
| `scripts/verify-v12-native-evidence.mjs` | create | utility / validator | transform, batch, file-I/O | `scripts/verify-phase12-evidence.mjs` plus `scripts/create-release-candidate-manifest.mjs` | composite role-match |
| `scripts/v12-evidence-scripts.test.mjs` | create | test | batch, transform | `scripts/verify-phase12-evidence.test.mjs` and `scripts/benchmark-phase12-backup.test.mjs` | exact role-match |
| `scripts/benchmark-v12-interactions.mjs` | create | service / benchmark | streaming, batch, file-I/O | `scripts/benchmark-phase12-backup.mjs` | exact role-match |
| `scripts/generate-v12-attended-checklist.mjs` | create | utility / validator | file-I/O, request-response | `scripts/generate-phase7-attended-checklist.mjs` | exact role-match |
| `maestro/v1.2/multi-plan.yaml` | create | test | request-response, event-driven | `maestro/phase2/schedule-cross-profile.yaml` | role + flow match |
| `maestro/v1.2/workout.yaml` | create | test | request-response, event-driven | `maestro/lifecycle/rest-recovery.yaml`; retired-timing recovery shape from `maestro/phase10/advanced-set-timing.yaml` | composite role-match |
| `maestro/v1.2/calendar.yaml` | create | test | streaming, event-driven | `maestro/phase6/calendar-date-reorder.yaml` | role-match; native trace still new |
| `maestro/v1.2/library-running.yaml` | create | test | CRUD, request-response | `maestro/phase2/owned-plan-editor.yaml` | role-match |
| `maestro/v1.2/garmin-progress.yaml` | create | test | network, bridge, CRUD, request-response | `maestro/phase6/progress-library.yaml` | partial; no bundled Python/native Garmin analog |
| `maestro/v1.2/recovery.yaml` | create | test | file-I/O, event-driven | `maestro/phase11/portable-merge.yaml` plus `maestro/lifecycle/rest-recovery.yaml` | composite role-match |
| `maestro/v1.2/accessibility.yaml` | create | test | request-response, event-driven | `maestro/phase6/navigation-accessibility.yaml` | exact role-match |

## Generated Artifact Map

These are immutable runtime outputs, not source files to hand-author or commit during planning.

| Artifact under `artifacts/native/v1.2/<run-id>/` | Producer / owner | Pattern source |
|---|---|---|
| `build.json` | versioned branch of `build-current-native-test-apk.sh` | build manifest at `scripts/build-current-native-test-apk.sh:235-285`; canonical artifact identity at `scripts/create-release-candidate-manifest.mjs:288-313` |
| `ui-state-matrix.json` | `deriveV12Ledger` in final validator | source-derived IDs at `scripts/verify-phase12-evidence.mjs:24-33`; exact ordered cases at lines 48-53 |
| `sqlite/*.json` | extended native SQLite runner | `scripts/run-native-sqlite-contracts.mjs:459-505` |
| `maestro/*.xml` and shard JSON | `executeV12Maestro` | `scripts/run-phase11-maestro.mjs:705-775` |
| `screenshots/`, `semantics/`, `geometry/` | v1.2 Maestro/configuration shards | `scripts/run-phase6-maestro.mjs:519-531,807-890` |
| `calendar-transitions.json` | Calendar flow plus test-only native trace probe | only partial analog: held-drag probe in `scripts/run-phase6-maestro.mjs:300-409` |
| `comparison/` | visual comparison shard, checked by final validator | exact screenshot set/hash pattern at `scripts/run-phase6-maestro.mjs:519-531,893-983`; pixel comparison logic is new |
| `performance.json` | `executeV12InteractionBenchmark` | `scripts/benchmark-phase12-backup.mjs:21-71,226-252` |
| `attended-observations.json` | v1.2 Samsung prepare/record/verify utility | `scripts/generate-phase7-attended-checklist.mjs:42-59,115-128,197-227` |
| `final-evidence.json` | `sealV12FinalEvidence` only | `scripts/verify-phase12-evidence.mjs:129-189` |

The run ID is fixed by the Phase 20 UI contract: `phase20-<UTC YYYYMMDDTHHMMSSZ>-<source-head-12>`. Once the first artifact is written, the directory is immutable. Retry means a new run ID, never cleanup-and-reuse of the failed run.

## Pattern Assignments

### `package.json` (config, batch) — extend

**Analog:** existing phase-specific aliases in `package.json`.

**Command-registration pattern** (`package.json:83-90`):

```json
"test:maestro:phase10": "node scripts/run-phase10-maestro.mjs",
"test:maestro:phase11": "node scripts/run-phase11-maestro.mjs",
"test:maestro:phase12": "node scripts/run-phase12-maestro.mjs",
"benchmark:phase12:backup": "node scripts/benchmark-phase12-backup.mjs",
"verify:phase12:evidence": "node scripts/verify-phase12-evidence.mjs",
"test:evidence:phase12": "node --test scripts/benchmark-phase12-backup.test.mjs scripts/phase12-evidence-scripts.test.mjs scripts/prepare-phase12-google-acceptance.test.mjs scripts/verify-phase12-evidence.test.mjs"
```

Add the proposed aliases atomically with their implementations: `test:evidence:v12`, `test:maestro:v12`, `benchmark:v12:interactions`, `verify:attended:v12`, and `verify:v12:evidence`. Keep the exhaustive native matrix out of `test:all` and ordinary quick aliases. `ci:pr` currently performs a build/device run (`package.json:73`), so changing it is not a planning-safe validation step.

---

### `app/__native-contracts.tsx` (route/test harness, event-driven) — extend

**Analog:** the same development-only route.

**Suite selection and count pattern** (`app/__native-contracts.tsx:109-149`):

```typescript
const configuredSuite = process.env.EXPO_PUBLIC_NATIVE_CONTRACT_SUITE;
const defaultSuite = configuredSuite === "phase10" || configuredSuite === "phase11" || configuredSuite === "phase12"
  ? "migrations-effects"
  : configuredSuite === "migrations-effects"
  // ...explicit allow-list...
  ? configuredSuite
  : "sqlite-kernel";

function expectedCaseCountFor(suite: typeof defaultSuite): number {
  return {
    "migrations-effects": MIGRATIONS_EFFECTS_CONTRACT_CASES.length,
    "portable-merge": PORTABLE_MERGE_CONTRACT_CASES.length,
    "google-drive-backup": GOOGLE_DRIVE_BACKUP_CONTRACT_CASE_IDS.length,
    "sqlite-kernel": 10,
  }[suite];
}
```

**Execution/error transport pattern** (`app/__native-contracts.tsx:365-520`): retain the `nativeContractsEnabled` guard, bounded `runId`, one-shot `useRef`, exact suite dispatch, machine markers, bounded error codes, and `finished`/`failed` state. Extend `NativeContractResult`; do not add an unguarded product route or expose personal data through log markers.

The Phase 20 aggregate may register completed `multiPlanRunning` and `garminImport` adapters only after those Phase 13–19 exports exist. Absence is a Wave 0 failure, not permission to create substitute Phase 20 business logic.

---

### `scripts/run-native-sqlite-contracts.mjs` (test runner, streaming/batch) — extend

**Analog:** the same source-derived native runner.

**Source registry pattern** (`scripts/run-native-sqlite-contracts.mjs:97-198`):

```javascript
async function deriveCaseIds(fileName, exportName) {
  const source = await readFile(
    path.join(projectRoot, 'src/testing/contracts', fileName),
    'utf8',
  );
  const caseBlock = source.match(
    new RegExp(`export const ${exportName} = \\[([\\s\\S]*?)\\] as const;`, 'u'),
  )?.[1] ?? '';
  const caseIds = [...caseBlock.matchAll(/"([a-z0-9-]+)"/gu)]
    .map((match) => match[1]);
  if (caseIds.length < 1 || new Set(caseIds).size !== caseIds.length) {
    fail(`${exportName} could not be derived from source.`);
  }
  return caseIds;
}
```

**Exact result pattern** (`scripts/run-native-sqlite-contracts.mjs:288-326`):

```javascript
const validCases = cases.length === expectedCaseIds.length
  && cases.every((contractCase, index) => (
    exactKeys(contractCase, ['id', 'status', 'durationMs'])
    && contractCase?.id === expectedCaseIds[index]
    && contractCase?.status === 'passed'
    && typeof contractCase?.durationMs === 'number'
    && contractCase.durationMs >= 0
  ));
```

Extend `manifestSupportsRequestedSuite` and `supportedSuiteCases` with a named v1.2 aggregate. Derive ordered IDs from source exports, assert uniqueness/count/order/zero skips, and preserve per-case duration. For shared v1.2 output, do not copy the current raw `manifest.device` object (`scripts/run-native-sqlite-contracts.mjs:459-490`); emit the run envelope's hashed device identity.

---

### `scripts/build-current-native-test-apk.sh` (build manifest, file-I/O) — extend carefully

**Analog:** the same exact-HEAD development-test builder.

**Source and installed-byte binding** (`scripts/build-current-native-test-apk.sh:128-184`):

```sh
base_head=$(git rev-parse HEAD)
source_tree_sha256=$(node scripts/source-tree-digest.mjs --assert-no-untracked)
# ...build and retain APK...
apk_sha256=$(sh scripts/hash-apk.sh "$apk_path")
# ...install and pull exact installed bytes...
installed_apk_sha256=$(sh scripts/hash-apk.sh "$installed_apk_copy")
[ "$installed_apk_sha256" = "$apk_sha256" ] ||
  fail 'installed APK bytes do not match the retained APK.'
```

The current manifest publisher is at lines 235-285. Add a versioned v1.2 branch that records the immutable run ID, signature/certificate identity, package/profile/version, retained and installed hashes/sizes, and privacy-safe device identity. Preserve historical schema-v1 consumers. The raw serial may remain runner-local but must not enter shared v1.2 evidence.

Reuse `sourceTreeUntrackedPaths`, `sourceTreeSha256`, and `sourceTreeSha256AtHead` from `scripts/source-tree-digest.mjs:61-125`; do not invent a second source hasher. For large installed APK retrieval, use `pullAdbFileWithRetry` from `scripts/adb-pull-retry.mjs:33-63`, then hash the local bytes.

---

### `scripts/run-v12-maestro.mjs` (runner/shard producer, event-driven/file-I-O) — create

**Primary analogs:** `scripts/run-phase11-maestro.mjs` for source-bound flow/shard execution and `scripts/run-phase6-maestro.mjs` for screenshot/settings evidence.

**Imports pattern** (`scripts/run-phase11-maestro.mjs:3-23`):

```javascript
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync,
  renameSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { sourceTreeSha256 } from "./source-tree-digest.mjs";
```

**Registry pattern** (`scripts/run-phase11-maestro.mjs:46-111`): copy the immutable `*_MAESTRO_FLOW_CONTRACTS` plus separate evidence-matrix structure. Recommended exports from research are `V12_MAESTRO_FLOW_CONTRACTS`, `V12_BROWSER_WALK_STATE_IDS`, `V12_NATIVE_STATE_PACKS`, and `executeV12Maestro`.

**Snapshot-before-execution pattern** (`scripts/run-phase6-maestro.mjs:693-779`): copy each YAML into a read-only temporary snapshot, hash it, execute that snapshot, then verify both the snapshot and source still equal the captured hash. This prevents edited flow bytes from being attached to a successful report.

**Exact screenshot-set pattern** (`scripts/run-phase6-maestro.mjs:519-531`):

```javascript
export function exactScreenshotEvidence(reportRoot, expectedFiles, flowId, excludedDirectoryNames = []) {
  const screenshots = screenshotFiles(reportRoot, new Set(excludedDirectoryNames))
    .map((file) => ({
      file: safeRelativeFile(path.basename(file), "screenshot file"),
      sha256: sha256File(file),
    }))
    .sort((left, right) => left.file.localeCompare(right.file));
  const expected = [...expectedFiles].sort((left, right) => left.localeCompare(right));
  if (!exactJson(screenshots.map(({ file }) => file), expected)) {
    fail(`required screenshots are missing or renamed for ${flowId}.`);
  }
  return Object.freeze(screenshots);
}
```

Do not flatten Maestro's timestamped nested screenshot directories; recurse, compare canonical basenames to the source registry, reject extras/duplicates, and retain relative paths plus SHA-256. Apply/read back/restore every device setting in `finally`, following the font-scale pattern at `scripts/run-phase6-maestro.mjs:995-1227`. A cleanup failure must fail the shard even when the primary flow passed.

Each shard writes only its immutable raw results. It must not assign final row verdicts or write `final-evidence.json`.

---

### `scripts/verify-v12-native-evidence.mjs` (validator/final seal, transform/file-I-O) — create

**Primary analogs:** `scripts/verify-phase12-evidence.mjs` for aggregate validation and `scripts/create-release-candidate-manifest.mjs` for canonical files and safe containment.

**Source-derived exact-set pattern** (`scripts/verify-phase12-evidence.mjs:24-53`):

```javascript
function sourceCaseIds(file, exportName) {
  const source = readFileSync(path.join(ROOT, file), "utf8");
  const block = source.match(
    new RegExp(`export const ${exportName} = \\[(.*?)\\] as const;`, "su"),
  )?.[1] ?? "";
  const ids = [...block.matchAll(/"([a-z0-9-]+)"/gu)].map((match) => match[1]);
  if (ids.length === 0 || new Set(ids).size !== ids.length) {
    throw new Error(`case_registry_invalid:${exportName}`);
  }
  return ids;
}
```

Use the same principle, but parse and validate the bound machine matrix as structured JSON rather than hand-writing 172 rows. Recommended exports are `V12_VERDICTS`, `V12_CONFIG_IDS`, `V12_REQUIRED_ARTIFACTS`, `loadV12ContractInputs`, `validateV12RunManifest`, `deriveV12Ledger`, and `sealV12FinalEvidence`.

**Identity and aggregate pattern** (`scripts/verify-phase12-evidence.mjs:40-80`): require exact source/APK/package/install identity, exact ordered cases, zero failed/skipped cases, validated benchmarks, and a privacy scan before deriving the aggregate result.

**Safe path/canonical-byte pattern** (`scripts/create-release-candidate-manifest.mjs:63-121,340-430`):

```javascript
function hasExactKeys(value, expected) {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

const absoluteBundle = path.resolve(bundleDirectory);
const resolved = path.resolve(absoluteBundle, fileName);
if (path.dirname(resolved) !== absoluteBundle) fail("bundle file escapes its candidate directory.");
const details = lstatSync(resolved, { throwIfNoEntry: false });
if (details === undefined || !details.isFile() || details.isSymbolicLink()) {
  fail("candidate bundle file is missing or unsafe.");
}
```

Require canonical JSON bytes, realpath containment, no symlinks, bounded byte/count/depth/sample sizes, exact expected file sets, and re-hashing at seal time. `final-evidence.json` is written only after all referenced bytes are re-read and validated, following `executePhase12EvidenceVerifier` at `scripts/verify-phase12-evidence.mjs:129-189`.

Evidence-state resolution occurs after ordinary evidence validation. Producers never supply final verdicts. See **Settled Baseline and Evidence-State Pattern** below.

---

### `scripts/v12-evidence-scripts.test.mjs` (test, batch/transform) — create

**Analog:** `scripts/verify-phase12-evidence.test.mjs`.

**Adversarial mutation pattern** (`scripts/verify-phase12-evidence.test.mjs:15-65`): start from one valid fixture, then mutate one dimension per assertion: missing case, missing stage, secret field, source HEAD, source digest, report bytes, mode flags, or manifest path. Use `assert.doesNotThrow` once for the valid control and `assert.throws` for each failure.

Add cases for:

- Missing, duplicate, unknown, out-of-order, skipped, false `N_A_REVIEWED`, malformed `ACCEPTED_EXCEPTION`, or accepted-exception-as-PASS rows.
- Wrong run/source/prototype/fixture/APK/signature/device/config identity.
- Absolute paths, `..`, backslashes, symlinks, hard links where uniqueness matters, stale bytes, extras, and oversized JSON/XML/PNG/sample arrays.
- Empty or failing JUnit under success metadata; contact-sheet-only, mock-only, final-screenshot-only Calendar, and one-scheme System evidence.
- Invalid verdict values, producer-authored row verdicts, settled-baseline misclassification, fixture-only Garmin closure, attended substitution, and release-authority fields.
- Raw serial, local path, filename, name/email/credential/token/account subject, provider payload/coordinates/route, bodyweight, notification, or workout-row leakage.
- Budget/sample/fixture-bound drift and non-finite or negative samples.

Copy benchmark contract tests from `scripts/benchmark-phase12-backup.test.mjs:18-54`; every threshold and minimum sample count should be asserted literally.

---

### `scripts/benchmark-v12-interactions.mjs` (benchmark, streaming/batch) — create

**Analog:** `scripts/benchmark-phase12-backup.mjs`.

**Budget and percentile pattern** (`scripts/benchmark-phase12-backup.mjs:21-71`):

```javascript
export const PHASE12_BACKUP_BENCHMARK_THRESHOLDS = Object.freeze({
  dirty_trigger: Object.freeze({ minimum_samples: 100, maximum_p95_ms: 16 }),
  writer_occupancy: Object.freeze({ minimum_samples: 20, maximum_p95_ms: 1000 }),
  // ...
});

function p95(values) {
  return [...values].sort((left, right) => left - right)[Math.ceil(values.length * 0.95) - 1];
}

function samples(values, expected, limit, label) {
  if (!Array.isArray(values) || values.length < expected
    || values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error(`phase12_${label}_samples_invalid`);
  }
  if (p95(values) > limit) throw new Error(`phase12_${label}_budget_exceeded`);
}
```

Export `V12_PERFORMANCE_BUDGETS`, `validateV12PerformanceEvidence`, and `executeV12InteractionBenchmark`. Keep raw samples and exact fixture bounds. Warm/cold launch, root switch, set+dock, input/rest, search-after-debounce, Calendar, useful Progress, and review-open budgets are fixed by D20-06. Retain Phase 12's dirty/writer/merge thresholds. Garmin JSON page/detail sync and normalization time plus peak memory require bounded fixtures and an independently fixed Phase 18 threshold before the final pass; do not silently borrow the merge budget.

Use monotonic, release-build user-perceived markers. Do not report repository/Jest timings as UI performance, average p95s, drop cold samples, or infer frame smoothness from animation duration. Publish with temp-file then rename as at `scripts/benchmark-phase12-backup.mjs:226-252`.

---

### `scripts/generate-v12-attended-checklist.mjs` (Samsung observation utility, file-I/O) — create

**Analog:** `scripts/generate-phase7-attended-checklist.mjs`.

**Authority/privacy boundary** (`scripts/generate-phase7-attended-checklist.mjs:42-59`):

```javascript
const FORBIDDEN_KEYS = new Set([
  "approval", "owner_approval", "promotion", "publication", "public_release",
  "release_authorization", "terminal_seal", "tag", "serial", "raw_path",
  "private_path", "raw_rows", "private_rows",
]);

export const PHASE7_N4_ROWS = Object.freeze([
  // source-owned attended observations
]);
```

Recommended exports are `V12_ATTENDED_ROWS`, `buildV12AttendedChecklist`, `validateV12AttendedObservations`, and `createV12AttendedRecord`.

Copy the exact model/package/installed-byte binding and hashed serial pattern from `readPhase7SamsungDevice` at lines 93-112. Copy canonical exact-key JSON and `mode: "observation-only"` from lines 115-128. Copy safe realpath/no-symlink/exact-PNG-set/unique-hash validation from lines 131-205.

Define fresh Phase 20 rows for legibility, one-handed dock reach, Calendar drag/morph feel, focus/keyboard, 200% reflow, Light/Dark/System, and device-owned sound/haptic presentation. Do not import `PHASE7_N4_ROWS`, old statuses, old images, or old approval semantics. `passed`/`failed` here is an observation status only; automated technical verdicts remain unchanged.

---

### `maestro/v1.2/multi-plan.yaml` (test, event-driven) — create

**Analog:** `maestro/phase2/schedule-cross-profile.yaml`.

Copy the semantic-action style and lifecycle structure: clear-state setup and source-backed activation (`lines 9-48`), restart without clearing state (`lines 49-76`), persisted schedule/edit assertions (`lines 77-175`), and source-visible outcome after relaunch (`lines 209-256`). Replace the single-plan assumptions with Phase 13's completed multi-active fixture registry and assert Strength/Running independence, collision choices, stable occurrence identity, and no implicit activation.

Do not use hard-coded coordinates for ordinary controls; the existing flow uses names/IDs and right-edge scrolling. Coordinates belong only in deliberate geometry traces.

---

### `maestro/v1.2/workout.yaml` (test, event-driven) — create

**Analogs:** `maestro/lifecycle/rest-recovery.yaml` and, only for historical recovery shape, `maestro/phase10/advanced-set-timing.yaml`.

Copy orientation/draft preservation, post-commit rest, stop/relaunch, paused-rest recovery, and retry-safe continuation from `maestro/lifecycle/rest-recovery.yaml:29-142`. The legacy timing flow at `maestro/phase10/advanced-set-timing.yaml:147-171` is useful only as a recovery-shape analog. Its cadence/cluster authoring UI is removed by the approved v1.2 contract and must not be resurrected.

Cover before transaction, during transaction, after commit/before acknowledgement, and after acknowledgement. Assert exact committed-set digest, active exercise/set pointer, rest deadline/paused remainder, and no stale/duplicate cue.

---

### `maestro/v1.2/calendar.yaml` (test, streaming/event-driven) — create

**Analog:** `maestro/phase6/calendar-date-reorder.yaml`.

Copy semantic month navigation, swipe direction, explicit previous/next controls, and screenshot checkpoints from lines 22-47. Extend it with the new native trace probe; Maestro alone cannot prove 1:1 pointer translation, the inclusive 25% boundary, recede/cancel, row morph positions, callback count, or ordered adjacent-week states.

The trace must record timestamp, measured width, dx/dy, intent owner, translation, title, selected civil date, transition generation, focused week, row bounds, callback count, focus identity, motion mode, and source digest. A final screenshot is not sufficient.

---

### `maestro/v1.2/library-running.yaml` (test, CRUD/request-response) — create

**Analog:** `maestro/phase2/owned-plan-editor.yaml`.

Copy label/ID-based form interaction, explicit keyboard hiding, bounded scrolling, explicit Save, and reopen/persistence checks from lines 8-157. Expand through the completed neutral chooser and all seven Running session types. Creation must remain inactive; activation is a separate explicit command. Preserve drafts on failure/stale revision and use non-default values so reset-to-default bugs cannot pass.

---

### `maestro/v1.2/garmin-progress.yaml` (test, file-I/O/CRUD/request-response) — create

**Closest partial analog:** `maestro/phase6/progress-library.yaml`.

Copy persisted source generation, relaunch, route traversal, source-backed Progress assertions, semantic search controls, and named screenshot checkpoints from `maestro/phase6/progress-library.yaml:97-166`. No current flow covers bundled Python/Chaquopy packaging, real Garmin login/MFA/read/restart/logout, JSON dedupe/matching, or 403/429 behavior.

Use deterministic synthetic activity summary/splits/detail JSON with component hashes and expected normalized facts for repeatable parsing, bounds, dedupe, revision and matching checks. Separately drive the owner-attended real-account login/MFA/read/restart/logout path without persisting credentials or raw personal responses in shared evidence. A fixture-only visual state must be tagged `fixture_only` and cannot close real-account behavior.

---

### `maestro/v1.2/recovery.yaml` (test, file-I/O/event-driven) — create

**Analogs:** `maestro/phase11/portable-merge.yaml` and `maestro/lifecycle/rest-recovery.yaml`.

Copy stage-gated execution from `maestro/phase11/portable-merge.yaml:7-55`, exact confirmation and cancel/no-mutation behavior from lines 127-211, and relaunch source-visible checks from lines 213-309. Combine with the rest/process-death sequence from `maestro/lifecycle/rest-recovery.yaml:86-142`.

Use synthetic archives and real SQLite. Distinguish source commit success plus derivative rebuild pending from precommit failure. A migration failure reopens at the actual last committed schema; do not claim whole-batch rollback or old-app/new-schema downgrade compatibility.

---

### `maestro/v1.2/accessibility.yaml` (test, request-response/event-driven) — create

**Analog:** `maestro/phase6/navigation-accessibility.yaml`.

Copy root-by-root semantic navigation and named 200% screenshots from lines 9-40. Expand to software keyboard, hardware keyboard, D-pad, visible focus, Back/Escape, modal isolation, exact trigger focus restoration, adaptive reading order, ≥48dp non-overlapping measured hit bounds, and runtime System/reduced-motion switches.

The flow drives states; separate semantics/geometry reports prove bounds and focus. Do not treat a screenshot or component mock as native accessibility proof.

## Shared Patterns

### 1. Immutable Source, Artifact, and Device Identity

**Sources:** `scripts/source-tree-digest.mjs:61-125`, `scripts/build-current-native-test-apk.sh:128-184,235-285`, `scripts/create-release-candidate-manifest.mjs:216-313,340-430`  
**Apply to:** every producer, every artifact reference, and the final seal.

- Bind full Git HEAD and source-tree digest; also bind the parity matrix, requirements, UI-SPEC, deviation register, prototype approval, prototype HTML, fixture, and producer/schema hashes.
- Bind exact retained and installed APK bytes, package/profile/version, alignment, signature/certificate, and build toolchain.
- Store raw device serial only in runner memory; shared evidence stores a one-way hash plus model/API/ABI/density/content bounds/refresh/locale/timezone.
- Re-read and re-hash every referenced byte at final seal. Equal Git HEAD does not permit evidence transfer between a development-test APK and a later signed personal candidate.

### 2. Source-Derived Ordered Registries

**Sources:** `scripts/run-native-sqlite-contracts.mjs:97-205,278-326`, `scripts/run-phase11-maestro.mjs:46-111,312-345`  
**Apply to:** 172 ledger rows, 107 ordered browser-state occurrences, native-only fixtures, configurations, flow IDs, Calendar checkpoints, SQLite case IDs, and performance series.

Derive expected IDs from bound source, freeze them, reject duplicates, and compare exact order and exact set. Preserve repeated browser state names as distinct occurrence IDs. A hard-coded total detached from source does not prove completeness.

### 3. Shard Producers and One Final Seal

**Source:** `scripts/verify-phase12-evidence.mjs:64-98,129-189`  
**Apply to:** SQLite, Maestro, Calendar, Garmin, performance, visual comparison, semantics, geometry, and Samsung evidence.

Producers report observations, counts, samples, and hashes. Only `sealV12FinalEvidence` derives the row and aggregate verdicts and writes `final-evidence.json`. Use temporary-file + rename or exclusive fresh creation; never partially publish success.

### 4. Settled Baseline and Evidence-State Pattern

Verdict resolution runs only after ordinary evidence for the row is checked. The owner has already selected MAP-01, TIM-01, DEV-01, DEV-02, and the standalone Garmin transport; Phase 20 measures those choices rather than reopening them.

| Baseline | Affected scope | Required derived outcome |
|---|---|---|
| `DEV-01` | affected Calendar geometry/accessibility rows, including VER-04 | PASS after adaptive 6–18dp geometry/hit-target evidence succeeds; otherwise NOT_RUN/REVIEW_REQUIRED/FAIL |
| `DEV-02` | CAL-03/VER-04 and affected Light visual rows | PASS after `#9B470B` native contrast/visual evidence succeeds; otherwise NOT_RUN/REVIEW_REQUIRED/FAIL |
| `TIM-01` | `DOM-03`, `DOM-15`, `DOM-17`, `WRK-05`, `WRK-18`, `WRK-21`–`WRK-23`, `WRK-26`, `VER-07`, `VER-08` | PASS only after every applicable retirement fixture proves zero cadence/cluster playback and preserved history/rest/set/pointer behavior |
| Garmin standalone | `GAR-04`–`GAR-09`, VER-10 | PASS only after packaging plus deterministic JSON cases and required real-account login/MFA/read/restart/logout/403/429 evidence succeed |
| Samsung review | VER-12 observation rows only | observation `passed`/`failed`; never changes automated or release authority |
| Release authorization | future signed build/install/promotion only | readiness may be conditional; Phase 20 stops for owner review |

Allowed row verdicts are exactly `NOT_RUN`, `PASS`, `FAIL`, `REVIEW_REQUIRED`, `ACCEPTED_EXCEPTION`, and `N_A_REVIEWED`. `ACCEPTED_EXCEPTION` is non-PASS, counted separately, and requires deviation ID, owner decision/date, exact scope/configurations, rationale, and evidence hashes. `N_A_REVIEWED` requires a domain reason plus reviewer identity/date; missing evidence is never N/A. `CONDITIONALLY_READY` is possible only under an explicit reviewed policy when every remaining non-PASS row is a valid accepted exception.

### 5. Privacy-Safe Evidence

**Sources:** `scripts/generate-phase7-attended-checklist.mjs:42-76,131-205`, `scripts/verify-phase12-evidence.mjs:55-62`  
**Apply to:** all JSON, logs, screenshots, Garmin fixtures, device records, and error messages.

Use deterministic synthetic names, activities, routes, history, bodyweight, notifications, and Garmin JSON. Evidence may contain stable synthetic IDs, hashes, bounded counts, and diagnostic codes. It must not contain names, emails, account subjects, credentials, tokens, raw activity IDs, serials, local paths, filenames derived from personal input, raw provider payloads, coordinates/routes, bodyweight, notification contents, or workout rows.

Prevent sensitive pixels at fixture/device setup. If private pixels appear, quarantine the raw capture outside the repository, record a privacy failure, and recapture. Blur/crop/redaction cannot convert a private capture into canonical pass evidence.

### 6. Device Settings and Cleanup

**Source:** `scripts/run-phase6-maestro.mjs:995-1227`  
**Apply to:** appearance, OS scheme, font scale, orientation, motion, input mode, IME, density/resolution, locale/timezone, and system overlays.

Record before/change/read-back/after values. Restore in cleanup even after a primary failure. If cleanup or restoration fails, the shard fails. Declared settings without measured read-back are invalid.

### 7. Error Handling

**Sources:** `scripts/run-phase11-maestro.mjs:113-150,678-809`, `scripts/run-phase6-maestro.mjs:426-440`  
**Apply to:** all new command runners.

Use `execFileSync`/`spawn` argument arrays, bounded stable error codes, JSON CLI status, and `process.exitCode = 1`. Preserve a primary error while aggregating cleanup failures. Never interpolate manifest-controlled values into a shell command.

### 8. Visual Evidence

**Source:** `scripts/run-phase6-maestro.mjs:64-102,519-531,807-890,893-983`  
**Apply to:** all static and motion-sensitive states.

Keep individual reference/native/overlay/difference/mask/semantic/geometry artifacts and their SHA-256 values. A contact sheet is an index only. Apply semantic zero-tolerance gates before geometry/color/pixel diagnostics. A missing control, changed copy, wrong focus/order/state, mutation, undersized target, or unaccepted deviation is `FAIL` regardless of pixel percentage.

## Future Release Handoff — Reuse, Do Not Invoke or Broaden

Phase 20 prepares readiness evidence and stops. It does not modify or dispatch the release workflow, create or push a tag, install production bytes, promote an artifact, or run Terminal Seal.

| Existing file | Reusable later-authorized pattern | Boundary |
|---|---|---|
| `.github/workflows/personal-apk.yml:8-13,22-35` | explicit manual/tag trigger and pinned toolchain | not an automatic continuation from Phase 20 |
| `.github/workflows/personal-apk.yml:59-109` | source gates, secret-safe signing input, one build, `apksigner`, retained APK/AAB/config/toolchain | workflow itself does not establish Phase 20 acceptance or authorize install |
| `scripts/build-release-candidate-once.sh:29-50,54-81` | production profile, required secret inputs, clean tracked tree, exact output directory, single APK/AAB build | call only after later owner authorization |
| `scripts/create-release-candidate-manifest.mjs:216-313,340-430` | canonical source/workflow/artifact/inner-byte identity and revalidation | manifest is identity, not approval |
| `scripts/verify-release-candidate-manifest.mjs:33-60` | read-only verification and machine-readable failure | verification is not promotion |
| `.github/workflows/pr.yml:233-300,304-376` | producer order, retain full evidence, redownload/revalidate exact bytes | do not copy its destructive retry (`rm -rf artifacts/native/phase12`) into immutable v1.2 run IDs; retry with a new run |

## Anti-Patterns to Reject

### Gate and Authority

- Converting `ACCEPTED_EXCEPTION`, `NOT_RUN`, or `REVIEW_REQUIRED` to `PASS`, `PASS_WITH_NOTES`, or an unreviewed N/A; counting an accepted exception in PASS totals.
- Reopening MAP-01/TIM-01/DEV-01/DEV-02 or relabelling missing technical evidence as an owner block.
- Using deterministic JSON fixtures or a login mock to close required real-account Garmin rows.
- Letting Samsung observation, prior N4 evidence, reviewer preference, or automated screenshot success authorize build, install, promotion, release, or Terminal Seal.
- Adding approval/promotion/tag/release fields to attended evidence.

### Identity and Immutability

- Relabelling Phase 8–12/v1.1 reports as v1.2 evidence or pointing incompatible old runners at a renamed manifest.
- Trusting a filename, version, Git HEAD, requested configuration, or manifest field without re-reading the underlying bytes/state.
- Moving evidence between development-test and signed production artifacts because their source HEAD matches.
- Overwriting, renaming, or editing a failed run into a pass; retries require new immutable run IDs.
- Letting a shard producer assign a final ledger verdict.

### Privacy and Filesystem Safety

- Emitting raw serials, local/private paths, credentials, tokens, account subjects, raw provider payloads, coordinates/routes, bodyweight, notification text, or workout rows in shared artifacts or logs.
- Using free-form paths, accepting absolute/parent/backslash traversal, following symlinks, or ignoring unexpected files.
- Treating blur, crop, or redaction as proof that a private original is canonical evidence.
- Shell-interpolating IDs or paths from manifests; use argument arrays after validation.

### Coverage and Visual Proof

- Hand-writing 172 pass rows, collapsing repeated browser states, silently sampling native-only packs, or using a contact sheet as the evidence set.
- Accepting empty/failing/skipped JUnit under success metadata.
- Using only a final Calendar screenshot, Jest animation mock, or nominal duration for intermediate motion proof.
- Letting a global pixel percentage override semantic, geometry, accessibility, transaction, read-only, or deviation failures.
- Treating component tests as proof of Android font scaling, hit bounds, keyboard occlusion, D-pad focus, or real SQLite behavior.

### Performance and Recovery

- Reporting host/repository timing as user-perceived release-build latency; averaging p95s; dropping cold samples; omitting outliers/raw values; or changing a budget without review.
- Calling reinstall of an older APK a rollback after a newer schema has committed. Use last-valid-schema reopen and a verified compatible archive/restore path.
- Repairing product behavior inside the evidence run. Fail the row, retain the run, route remediation to its owning phase, rebuild, and start a new run.

## No Analog Found

No planned file lacks a role-level analog. The following responsibilities lack a complete analog and must be implemented from the Phase 20 contracts rather than inferred from older evidence:

| Target responsibility | Closest partial source | Planner instruction |
|---|---|---|
| 172-row contract-derived ledger plus six-verdict evidence-state resolver in `verify-v12-native-evidence.mjs` | Phase 12 exact-case validator | Implement from the bound matrix/UI contract; do not reduce to all-pass counts |
| 64-configuration native visual comparison with semantic/geometry/color triage | Phase 6 exact screenshot set/hash validator | Add new comparison schemas/tool version/masks/dispositions; `pngjs` is diagnostic only |
| Calendar timestamped intermediate geometry/semantic trace | Phase 6 held-drag hierarchy/screenshot probe | Add a test-only native probe; Maestro final-state evidence cannot close VER-09 |
| Standalone Garmin acceptance inside `garmin-progress.yaml` | no bundled Python/native real-account evidence exists | Prove the selected packaging/auth/read/restart path; do not invent credentials or accept a stub/fixture-only pass |

## Planner Handoff

1. Implement, self-test and commit every Phase 20 contract, probe, flow, runner, build-manifest extension, shard validator, final validator, attended utility and readiness generator before native execution. Add negative tests for identity, paths, privacy, gates, accepted exceptions, exact-set coverage, reports, screenshots and thresholds.
2. Gate every terminal upstream output: `13-14-SUMMARY.md`, `14-11-SUMMARY.md`, `15-13-SUMMARY.md`, `16-07-SUMMARY.md`, `17-14-SUMMARY.md`, `18-12-SUMMARY.md`, `18-13-SUMMARY.md`, `19-10-SUMMARY.md`, their validations and named evidence. Missing output blocks before freeze/build.
3. Select/read back exact pinned Node/npm/Java/SDK/Build Tools/NDK/ADB/Maestro/signing tools, register every integrity module, pass type/lint/boundary/test:all/coverage/evidence tests, commit, freeze source, build one exact artifact and create one immutable run/build.json. Any later source change requires a new build/run.
4. Execute independent observation-only shards serially under one device/settings lease. Explicitly create, re-execute and one-to-one bind `multi-plan.yaml` and `library-running.yaml`; no producer writes row or final verdicts.
5. Run a no-write preseal, then the nonautonomous Samsung `checkpoint:human-verify`, then automated attended-record validation. Only afterward may `sealV12FinalEvidence` write the final ledger/seal once.
6. Preserve `NOT_RUN`, `FAIL`, `REVIEW_REQUIRED`, `ACCEPTED_EXCEPTION` and other non-PASS outcomes, produce readiness/rollback facts, and stop for owner review. Do not chain into the future release workflow.

## Metadata

**Analog search scope:** `scripts/`, `maestro/`, `app/__native-contracts.tsx`, `package.json`, `.github/workflows/`, Phase 20 planning contracts, v1.2 parity/native matrices  
**Files opened:** 41 focused project files; broader filename/symbol searches were limited to the scopes above  
**Primary analogs:** `run-phase11-maestro.mjs`, `run-phase6-maestro.mjs`, `verify-phase12-evidence.mjs`, `create-release-candidate-manifest.mjs`, `benchmark-phase12-backup.mjs`, `generate-phase7-attended-checklist.mjs`  
**Extension points inspected:** `run-native-sqlite-contracts.mjs`, `source-tree-digest.mjs`, `adb-pull-retry.mjs`, `build-current-native-test-apk.sh`, `app/__native-contracts.tsx`, `package.json`, `pr.yml`, `personal-apk.yml`  
**Pattern extraction date:** 2026-10-06

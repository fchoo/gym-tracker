---
phase: 18-garmin-import
reviewed: 2026-10-11T17:54:50Z
depth: deep
files_reviewed: 134
files_reviewed_list:
  - .gitignore
  - app.config.ts
  - app/(tabs)/__tests__/index.test.tsx
  - app/(tabs)/index.tsx
  - app/__phase18-garmin-acceptance.tsx
  - app/__phase18-garmin-adversarial.tsx
  - app/__phase18-garmin-proof.tsx
  - app/__tests__/garmin-activity-route.test.tsx
  - app/__tests__/garmin-index-route.test.tsx
  - app/__tests__/garmin-match-route.test.tsx
  - app/__tests__/running-plan-route.test.tsx
  - app/_layout.tsx
  - app/garmin/activity/[activityId].tsx
  - app/garmin/index.tsx
  - app/garmin/match/[activityId].tsx
  - app/library/running/[planId].tsx
  - jest.config.js
  - maestro/phase18/garmin-sync.yaml
  - modules/garmin-connect/android/build.gradle
  - modules/garmin-connect/android/src/main/AndroidManifest.xml
  - modules/garmin-connect/android/src/main/java/expo/modules/garminconnect/GarminClientWorker.kt
  - modules/garmin-connect/android/src/main/java/expo/modules/garminconnect/GarminConnectModule.kt
  - modules/garmin-connect/android/src/main/java/expo/modules/garminconnect/GarminTokenStore.kt
  - modules/garmin-connect/android/src/main/python/garmin_bridge.py
  - modules/garmin-connect/android/src/test/java/expo/modules/garminconnect/GarminTokenStoreTest.kt
  - modules/garmin-connect/android/src/test/python/test_garmin_bridge.py
  - modules/garmin-connect/expo-module.config.json
  - modules/garmin-connect/package.json
  - modules/garmin-connect/python/THIRD_PARTY_NOTICES.md
  - modules/garmin-connect/python/garmin-python-lock.json
  - modules/garmin-connect/src/index.ts
  - package.json
  - plugins/withAndroidBackupRules.test.ts
  - plugins/withAndroidBackupRules.ts
  - plugins/withGarminConnectModule.test.ts
  - plugins/withGarminConnectModule.ts
  - scripts/benchmark-phase18-garmin.mjs
  - scripts/benchmark-phase18-garmin.test.mjs
  - scripts/build-current-native-test-apk.sh
  - scripts/phase18-build-manifest.mjs
  - scripts/phase18-build-manifest.test.mjs
  - scripts/phase18-garmin-acceptance.test.mjs
  - scripts/phase18-garmin-adversarial.test.mjs
  - scripts/phase18-garmin-proof.test.mjs
  - scripts/phase18-language-coverage.mjs
  - scripts/phase18-language-coverage.test.mjs
  - scripts/run-coverage-gate.mjs
  - scripts/run-phase18-garmin-acceptance.mjs
  - scripts/run-phase18-garmin-adversarial.mjs
  - scripts/run-phase18-garmin-proof.mjs
  - scripts/run-phase18-kotlin-coverage.mjs
  - scripts/run-phase18-kotlin-coverage.test.mjs
  - scripts/run-phase18-python-coverage.py
  - scripts/verify-garmin-module-schema.test.mjs
  - scripts/verify-garmin-python-lock.mjs
  - scripts/verify-garmin-python-lock.test.mjs
  - scripts/verify-phase18-garmin-acceptance.mjs
  - scripts/verify-phase18-garmin-adversarial.mjs
  - scripts/verify-phase18-garmin-proof.mjs
  - scripts/verify-phase18-plan-coverage.mjs
  - scripts/verify-phase18-plan-coverage.test.mjs
  - src/bootstrap/garminImportRuntime.test.tsx
  - src/bootstrap/garminImportRuntime.tsx
  - src/bootstrap/phase18GarminProof.ts
  - src/bootstrap/workoutAppRuntime.tsx
  - src/domains/activities/activityDetails.test.ts
  - src/domains/activities/activityDetails.ts
  - src/domains/activities/garminActivitySourcePort.ts
  - src/domains/activities/importCommands.test.ts
  - src/domains/activities/importCommands.ts
  - src/domains/activities/importContracts.ts
  - src/domains/portability/backupContracts.test.ts
  - src/domains/portability/backupContracts.ts
  - src/domains/portability/mergePlan.test.ts
  - src/domains/portability/mergePlan.ts
  - src/domains/portability/restoreCommands.ts
  - src/domains/running/activityMatchCommands.test.ts
  - src/domains/running/activityMatchCommands.ts
  - src/platform/garmin/canonicalGarminPayload.test.ts
  - src/platform/garmin/canonicalGarminPayload.ts
  - src/platform/garmin/garminActivityAdapter.test.ts
  - src/platform/garmin/garminActivityAdapter.ts
  - src/platform/garmin/garminFixtureManifest.test.ts
  - src/platform/garmin/garminSyncContracts.ts
  - src/platform/garmin/garminSyncCoordinator.test.ts
  - src/platform/garmin/garminSyncCoordinator.ts
  - src/platform/garmin/normalizeGarminActivity.test.ts
  - src/platform/garmin/normalizeGarminActivity.ts
  - src/platform/sqlite/migrations/0043_imported_activity_revision_reviews.ts
  - src/platform/sqlite/migrations/0044_garmin_sync_summary.ts
  - src/platform/sqlite/migrations/index.ts
  - src/platform/sqlite/repositories/garminSyncSummaryRepository.ts
  - src/platform/sqlite/repositories/importedActivityRepository.test.ts
  - src/platform/sqlite/repositories/importedActivityRepository.ts
  - src/platform/sqlite/repositories/logicalBackupRepository.ts
  - src/platform/sqlite/repositories/logicalMergeRepository.ts
  - src/platform/sqlite/repositories/runningActivityMatchRepository.test.ts
  - src/platform/sqlite/repositories/runningActivityMatchRepository.ts
  - src/testing/contracts/garminImport.contract.test.ts
  - src/testing/contracts/garminImport.contract.ts
  - src/testing/contracts/multiPlanRunning.contract.ts
  - src/testing/contracts/portableMerge.contract.test.ts
  - src/testing/contracts/portableMerge.contract.ts
  - src/testing/phase18GarminAcceptance.test.ts
  - src/testing/phase18GarminAcceptance.ts
  - src/testing/phase18GarminAdversarial.test.ts
  - src/testing/phase18GarminAdversarial.ts
  - src/testing/phase18GarminProof.test.ts
  - src/testing/phase18GarminProof.ts
  - src/ui/__tests__/ActivityMatchScreen.test.tsx
  - src/ui/__tests__/GarminSyncScreen.test.tsx
  - src/ui/__tests__/ImportedActivityDetailScreen.test.tsx
  - src/ui/__tests__/RunningPlanDetailScreen.test.tsx
  - src/ui/__tests__/TodayScreen.test.tsx
  - src/ui/garmin/useGarminConnectionController.test.tsx
  - src/ui/garmin/useGarminConnectionController.ts
  - src/ui/screens/ActivityMatchScreen.tsx
  - src/ui/screens/GarminSyncScreen.tsx
  - src/ui/screens/ImportedActivityDetailScreen.tsx
  - tests/fixtures/garmin-json/fixture-manifest.ts
  - tests/fixtures/garmin-json/phase18-performance-baseline.json
  - tests/integration/automatic-drive-backup.test.ts
  - tests/integration/garmin-envelope-import.test.ts
  - tests/integration/garmin-import-portability.test.ts
  - tests/integration/garmin-sync.test.ts
  - tests/integration/imported-activity-facts.test.ts
  - tests/integration/multi-plan-portability.test.ts
  - tests/integration/running-activity-match.test.ts
  - tests/sqlite-host/garminSyncSummaryRepository.test.ts
  - tests/sqlite-host/logicalMergeRepository.test.ts
  - tests/sqlite-host/logicalRestoreRepository.test.ts
  - tests/sqlite-host/phase12BackupBenchmark.host.test.ts
  - tests/sqlite-host/restoreReconciliationRepository.test.ts
  - tsconfig.json
findings:
  critical: 2
  warning: 1
  info: 0
  total: 3
status: issues_found
---

# Phase 18: Garmin Account Sync Code Review

**Reviewed:** 2026-10-11T17:54:50Z  
**Depth:** deep  
**Files Reviewed:** 134  
**Diff Base:** `44aeaad1e1e36610b3cc5d3554ccc5219c1b5382`  
**Status:** issues_found

## Narrative Findings (AI reviewer)

### Summary

This fresh deep re-review on integrated `HEAD 1fc767fc` materially changes the Phase 18 verdict. Most of the prior Phase 18 blockers are now fixed in the integrated code, including durable Garmin account identity, ambiguous-date recovery UI, revision-review product flow, logout tombstone failure handling, split residual merge handling, four-root shell integration, evidence current-identity validation, privacy scanning, and benchmark nonce/PID fencing.

The review still found **2 BLOCKER findings** and **1 WARNING finding**. Phase 20 native execution remains explicitly pending and is **not** treated as a finding by itself. The only remaining actionable issues are one import-boundary integrity hole, one still-incomplete match lifecycle, and the still-incomplete Python/evidence coverage gate.

### Re-review disposition

Resolved on integrated `HEAD`:

- `CR-01` durable Garmin account identity now derives from provider-stable `di_client_id` and survives logout/re-auth.
- `CR-02` ambiguous source dates now surface a bounded review sheet and route back through `confirmPendingDateReview`.
- `CR-03` revision reviews are now visible and actionable in the product through detail-route accept/keep flows.
- `CR-05` revision-review replay now reads the authoritative accepted revision from `imported_activity_identities`.
- `CR-06` logout now fails closed when tombstone deletion fails and preserves the connected worker state on that error path.
- `CR-07` bodyweight and schedule-collision residual facts are now split into independent aggregates before merge classification.
- `CR-08` Garmin routes now render inside the persistent four-root shell via `GarminRouteShell`.
- `CR-10` adversarial verification now recomputes and enforces current source/APK/device/report identity before pass/seal.
- `CR-11` aggregate acceptance now executes the owner proof/adversarial verifiers and checks current identities for those artifacts.
- `CR-12` privacy scanning now rejects account namespace, email, DI token, serial, and related forbidden forms.
- `CR-13` benchmark collection now requires a guarded benchmark route, per-run nonce, and `logcat --pid` filtering.
- `WR-01`, `WR-02`, `WR-04`, `WR-05`, and `WR-06` are closed in the integrated UI/scripts.

Still actionable:

- `CR-04` remains open.
- `CR-09` remains open.
- `WR-03` remains open.

No additional integration-only regressions were found beyond the still-open lifecycle gap below.

## Critical Issues

### CR-01: Prepared-import integrity still does not bind mutable identity fields

**File:** `src/domains/activities/importCommands.ts:61-65`, `src/platform/sqlite/repositories/importedActivityRepository.ts:198-217`, `src/platform/sqlite/repositories/importedActivityRepository.ts:251-259`
**Issue:** `prepareGarminImport()` returns `Object.freeze({ envelope: parsed, canonical_payload_json })`, but `parsed` itself is not deeply frozen, and the commit path reparses `input.staged.envelope` at write time. The repository only rebinds the normalized payload and digest:

```ts
const parsed = parseGarminSourceEnvelope(envelope) as GarminSourceEnvelope;
return Object.freeze({ envelope: parsed, canonical_payload_json });
```

```ts
const reparsedEnvelope = parseGarminSourceEnvelope(input.staged.envelope);
const canonicalPayloadJson = canonicalJson({
  normalization_version: reparsedEnvelope.normalization_version,
  normalized: reparsedEnvelope.normalized,
});
if (canonicalPayloadJson !== input.staged.canonical_payload_json) { ... }
if (canonicalDigest !== reparsedEnvelope.normalized_json_sha256) { ... }
```

```ts
WHERE identity.source_kind = ? AND identity.account_namespace = ? AND identity.external_activity_id = ?
```

Because `source_kind`, `account_namespace`, and `external_activity_id` are consumed from the reparsed mutable envelope, a caller can mutate those fields after prepare while keeping the same normalized payload and digest. The accepted digest no longer proves the identity tuple being inserted or deduplicated.
**Fix:**
```ts
type PreparedGarminImport = Readonly<{
  canonicalEnvelopeJson: string;
  canonicalPayloadJson: string;
  envelopeSha256: string;
}>;

const canonicalEnvelopeJson = canonicalJson(parsed);
return Object.freeze({
  canonicalEnvelopeJson,
  canonicalPayloadJson,
  envelopeSha256: await sha256(canonicalEnvelopeJson),
});
```

Then, inside `confirmGarminImport()`, reparse from `canonicalEnvelopeJson` and verify the stored envelope hash before using any identity fields. A regression test should mutate `account_namespace` or `external_activity_id` after prepare and prove the write is rejected.

### CR-02: Product code still cannot unmatch or reassign an already matched activity

**File:** `app/garmin/match/[activityId].tsx:64-67`, `src/bootstrap/workoutAppRuntime.tsx:2943-2948`, `src/ui/screens/ActivityMatchScreen.tsx:171-194`
**Issue:** The repository and domain command layer support `match | unmatch | reassign`, but the route/runtime/UI still expose only the initial match path:

```tsx
onConfirm={(candidate: RunningActivityMatchCandidate) => runtime.confirmActivityMatch(candidate)}
onLeaveUnmatched={() => router.back()}
```

```ts
input: await prepareRunningActivityMatchInput({
  action: "match",
  candidate,
  requestId: `running-match-${randomUUID()}`,
  occurredAtMs: dependencies.nowMs(),
}, ...)
```

```tsx
{props.state.kind === "already_matched"
  ? <InlineNotice body="This activity already has one committed scheduled workout relation." ... />
  : null}
...
<SecondaryAction disabled={busy} label="Leave unmatched" onPress={props.onLeaveUnmatched} />
```

When an activity is already matched, the user gets a notice plus a Back action, but no way to clear the existing relation or move it to another opportunity. That leaves the implemented repository lifecycle unreachable in production and keeps the recovery contract incomplete after parallel-lane integration.
**Fix:**
```ts
type RunningActivityMatchScreenState =
  | { kind: "ready"; candidates: RunningActivityMatchCandidate[]; current?: CurrentMatch }
  | { kind: "already_matched"; current: CurrentMatch; reassignmentCandidates: RunningActivityMatchCandidate[] };
```

Expose runtime methods that prepare `action: "unmatch"` and `action: "reassign"` inputs with the current relation fence, then render explicit `Keep unmatched` and `Move to selected workout` actions in the route. Add route/component tests that prove both flows are reachable and that stale fences stay zero-write.

## Warnings

### WR-01: The focused Phase 18 coverage gate still does not satisfy complete branch coverage for Python and evidence scripts

**File:** `scripts/phase18-language-coverage.mjs:17-21`, `scripts/run-phase18-python-coverage.py:131-142`, `scripts/run-coverage-gate.mjs:56-74`
**Issue:** The current gate still explicitly declines a Python branch oracle and only records `lines` plus named `cases`:

```js
// The stdlib `trace` collector measures line execution only.
// We deliberately do NOT emit a fabricated `branches` counter.
metrics: Object.freeze(["lines", "cases"]),
```

```py
# The stdlib `trace` module has no branch oracle, so we do not
# fabricate a `branches` counter.
"cases": { ... }
```

At the same time, the evidence coverage set is still limited to a subset of the Phase 18 scripts:

```js
const phase18EvidenceFiles = [
  "scripts/benchmark-phase18-garmin.mjs",
  "scripts/phase18-build-manifest.mjs",
  "scripts/phase18-language-coverage.mjs",
  "scripts/phase18-privacy-scan.mjs",
  "scripts/run-phase18-kotlin-coverage.mjs",
  "scripts/verify-phase18-garmin-acceptance.mjs",
  "scripts/verify-phase18-garmin-adversarial.mjs",
  "scripts/verify-phase18-garmin-proof.mjs",
];
```

This is much better than the prior state, but it still does not meet the repo rule that integrity-critical modules carry complete branch coverage, and it still leaves the Python bridge covered by a weaker surrogate metric.
**Fix:** Replace the Python `trace` collector with a real branch-aware runner, or explicitly narrow the repo rule if true branch coverage is impossible in this lane. Keep the focused gate failing when a required language report is missing or stale, and extend the evidence branch gate only if the missing scripts are still intended to be integrity-critical.

---

_Reviewed: 2026-10-11T17:54:50Z_  
_Reviewer: TRAE (gsd-code-reviewer + gstack review)_  
_Depth: deep_

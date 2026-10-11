---
phase: 18-garmin-import
reviewed: 2026-10-11T16:39:20Z
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
  critical: 13
  warning: 6
  info: 0
  total: 19
status: issues_found
---

# Phase 18: Garmin Account Sync Code Review

**Reviewed:** 2026-10-11T16:39:20Z  
**Depth:** deep  
**Files Reviewed:** 134  
**Diff Base:** `b02daee954872ae5b71b4b2980fb2cbbdd734604`  
**Status:** issues_found

## Narrative Findings (AI reviewer)

### Summary

Phase 18 remains blocked after remediation. The targeted re-review found **13 BLOCKER findings** and **6 WARNING findings**. The prior implementation corrected several substantial defects, but recovery workflows, durable identity, transaction revalidation, partial-overlap merge semantics, local logout deletion, four-root navigation, match lifecycle composition, and native-evidence authority remain incomplete.

Missing APK, device, live-account, and owner-attended Phase 20 results are explicitly deferred and are **not** findings. Evidence findings below are limited to false-pass paths that can accept caller-authored or stale metadata when Phase 20 eventually runs.

Focused verification stayed inside Phase 18 and performed no source edits, global suite, Android build, APK/device action, live-account action, commit, push, or PR:

- 302 focused unit tests passed across adapter, normalization, sync, import, merge, controller, and fixture contracts.
- 61 focused component/route tests passed.
- 30 focused Garmin integration tests passed.
- 141 focused SQLite-host tests passed.
- 58 focused evidence/lock/manifest/benchmark/coverage script tests passed.
- 12 Python bridge tests passed.
- Existing source-bound reports match the current Python/Kotlin source hashes and claim 100% Python lines/cases plus 100% Kotlin lines/branches.

The green tests do not mitigate the findings. Several tests assert the incomplete behavior itself, including self-authored native evidence, repository-only revision decisions, and whole-residual source merging.

### Original remediation audit

| Original finding | Result | Current disposition |
|---|---|---|
| CR-01 | Resolved | Production startup calls `restoreSession()` and retains history on failure. |
| CR-02 | Resolved with test weakness | Discovery and detail DTOs are separated; see WR-01 for the still-duplicated provider fixture seam. |
| CR-03 | Partial | PII/grammar drift is fixed, but reconnecting after logout creates a new durable namespace; see CR-01. |
| CR-04 | Resolved | Retryable MFA errors reconcile against the native pending challenge. |
| CR-05 | Partial | Phone-zone auto-confirmation is removed, but ambiguous dates have no product recovery; see CR-02. |
| CR-06 | Partial | Proposals persist, but product decisions and replay correctness remain incomplete; see CR-03 and CR-05. |
| CR-07 | Resolved | Display fidelity now uses the least-exact rendered channel and exact-effort basis stays separate. |
| CR-08 | Resolved | Gradle installs only the verified local, hash-locked artifact set with dependency resolution disabled. |
| CR-09 | Partial | UI/native reconciliation and directory fsync were added, but failed tombstone deletion is accepted; see CR-06. |
| CR-10 | Partial | Activities are split per identity, but all non-activity source facts remain one insert-only residual graph; see CR-07. |
| CR-11 | Partial | The route now invokes the native producer and rejects host provenance, but the executable verifier is not current-bound; see CR-10. |
| CR-12 | Partial | Current top-level files are hashed, but nested owner/Maestro/privacy claims remain self-authored; see CR-11. |
| CR-13 | Resolved with regression | Shared manifest sanitization is compatible across all three suites; see WR-02 for device-serial logging. |
| CR-14 | Partial | Refresh rotation is measured and pre-scan failures say `not_run`, but the privacy matcher remains incomplete; see CR-12. |
| CR-15 | Partial | Budgets and sample counts are source-owned, but no app producer exists and the collector trusts global logcat; see CR-13. |
| CR-16 | Resolved | The last successful sync summary is durable across controller/runtime recreation. |
| CR-17 | Resolved | Component hashes cover complete bounded provider components before projection. |
| WR-01 | Resolved | Fixtures now run through production normalization and production fidelity values. |
| WR-02 | Resolved | Stale confirmation disables Confirm and exposes candidate reload. |
| WR-03 | Open | The focused gate still lacks Python branch coverage and most evidence-validator coverage; see WR-03. |

## Critical Issues

### CR-01: Re-authenticating the same Garmin account creates a new durable identity

**Classification:** BLOCKER  
**Confidence:** 10/10  
**Files:** `modules/garmin-connect/android/src/main/python/garmin_bridge.py:127-142`, `modules/garmin-connect/android/src/main/python/garmin_bridge.py:229-277`, `modules/garmin-connect/android/src/main/python/garmin_bridge.py:333-336`, `src/platform/sqlite/repositories/importedActivityRepository.ts:218-228`

**Issue:** Every successful login/MFA calls a random `namespace_factory`; logout clears the only persisted copy. Logging out and later reconnecting the same account therefore changes `(source_kind, account_namespace, external_activity_id)`, so previously imported activities are not deduplicated and are imported again as a different account. This violates GAR-07's later-reconnection path and the durable identity contract.

**Fix:** Persist a non-secret opaque account mapping independently of the deletable DI session. Derive it from a provider-stable account identifier through an app-local HMAC, or store a local UUID keyed by that stable identifier. Delete credentials/tokens on logout without deleting the durable account identity; add logout-login-same-account and account-switch tests.

### CR-02: Ambiguous activity dates still have no product recovery path

**Classification:** BLOCKER  
**Confidence:** 10/10  
**Files:** `src/bootstrap/garminImportRuntime.tsx:219-248`, `src/ui/screens/GarminSyncScreen.tsx:251-285`, `src/ui/screens/GarminSyncScreen.tsx:354-362`

**Issue:** Missing source-local time/offset correctly returns `date_confirmation_required`, but the screen only renders “Choose the historical local date.” The failure is non-retryable and receives no action, while the production route exposes no proposal/confirmation UI. The affected activity can never be imported, contrary to GAR-09 and plan 18-07's complete ambiguous-timezone recovery.

**Fix:** Retain the prepared proposal, open a bounded date/time/timezone review surface, and call `confirmPreparedDate` with the owner's decision. Cancel, stale, invalid, and DST-gap decisions must remain zero-write; successful confirmation must resume the interrupted sync without refetching a different revision.

### CR-03: Durable source-revision proposals cannot be reviewed or resolved in the product

**Classification:** BLOCKER  
**Confidence:** 10/10  
**Files:** `src/platform/sqlite/repositories/importedActivityRepository.ts:44-159`, `src/bootstrap/garminImportRuntime.tsx:188-275`, `src/bootstrap/workoutAppRuntime.tsx:2691-2764`, `src/ui/screens/GarminSyncScreen.tsx:220-245`

**Issue:** SQLite now persists proposals and implements `listGarminRevisionReviews`/`resolveGarminRevision`, but `GarminImportApplicationPort` and the app runtime expose only confirm-import, history, and sync-summary methods. The UI can show `Needs review` but cannot display accepted/proposed differences or issue `accept`/`keep`. Retrying detail cannot resolve the proposal, so review state is permanent.

**Fix:** Add typed list/resolve operations to the application/runtime boundary, render the factual changed fields, and provide explicit “Use updated facts” and “Keep current facts” actions with revision/hash fences, receipt replay, conflict recovery, and post-decision history reload.

### CR-04: The authoritative write transaction trusts a mutable prevalidated envelope

**Classification:** BLOCKER  
**Confidence:** 9/10  
**Files:** `src/domains/activities/importCommands.ts:57-65`, `src/domains/activities/importCommands.ts:73-93`, `src/platform/sqlite/repositories/importedActivityRepository.ts:186-245`, `src/platform/sqlite/repositories/importedActivityRepository.ts:280-293`

**Issue:** `prepareGarminImport` validates and hashes before the write, then shallow-freezes only the wrapper. The nested parsed envelope remains mutable. `confirmGarminImportDate` passes it to the repository, and the transaction consumes `input.staged.envelope` without reparsing, matching it to `canonical_payload_json`, rehashing, or rechecking capacity. Mutation between prepare and commit can therefore insert facts that were never covered by the accepted digest or capacity checks.

**Fix:** Make the transaction consume an immutable canonical byte/string snapshot. Inside `kernel.write`, parse the canonical payload and envelope identity again, verify canonical equality and digest through an injected hasher or precomputed independently bound digest, and apply capacity checks to the exact rows being inserted. Add a test that mutates nested staged data after prepare and proves zero writes.

### CR-05: Revision-proposal receipt replay fabricates the accepted revision number

**Classification:** BLOCKER  
**Confidence:** 10/10  
**File:** `src/platform/sqlite/repositories/importedActivityRepository.ts:187-215`

**Issue:** When a proposal receipt is replayed, the repository returns `proposal.proposed_revision - 1` instead of reading `imported_activity_identities.aggregate_revision`. After proposal 2 is kept, proposal 3 is created while accepted revision remains 1; replaying proposal 3 reports accepted revision 2. Callers receive a revision fence that never existed.

**Fix:** Join/read the identity row in the receipt branch and return its authoritative `aggregate_revision`. Add a regression sequence: accept v1, keep proposal v2, create proposal v3, replay v3 before decision, and assert the result remains accepted revision 1.

### CR-06: Logout can report success while the encrypted session tombstone remains on disk

**Classification:** BLOCKER  
**Confidence:** 10/10  
**Files:** `modules/garmin-connect/android/src/main/java/expo/modules/garminconnect/GarminTokenStore.kt:87-103`, `modules/garmin-connect/android/src/main/java/expo/modules/garminconnect/GarminClientWorker.kt:155-171`

**Issue:** `remove()` renames the live record to a tombstone and fsyncs the directory, but it throws only before the rename. If `tombstone.delete()` returns `false`, the method returns successfully and logout reports disconnected even though recoverable encrypted session bytes remain in app-private storage. GAR-07 promises local session clearing.

**Fix:** Treat a still-existing tombstone or failed delete as `garmin_token_clear_failed`; fsync only after confirmed removal. Keep the worker connected on that failure, and add an injectable Android-writer test for rename success plus tombstone-delete failure.

### CR-07: Partial-overlap merge still duplicates non-activity source facts

**Classification:** BLOCKER  
**Confidence:** 9/10  
**Files:** `src/domains/portability/mergePlan.ts:1643-1673`, `src/domains/portability/mergePlan.ts:1723-1743`, `src/domains/portability/mergePlan.ts:1833-1852`

**Issue:** Imported activities are now classified independently, but bodyweight and schedule-collision facts are still grouped into one residual graph. Any residual difference makes the whole archive residual an `insert`; `mappedGraphRows` remaps occupied IDs instead of recognizing exact overlaps. Local `{weight A}` plus archive `{weight A, weight B}` therefore inserts a remapped duplicate of A together with B.

**Fix:** Split every authoritative source family by its stable aggregate identity and dependency closure: bodyweight entry/revision, collision outcome, and remaining receipts/events. Classify each as duplicate/insert/conflict independently. Add exact-overlap-plus-new tests for each residual family and assert no remapped duplicate rows.

### CR-08: Garmin root is outside the persistent four-root shell and has no visible exit

**Classification:** BLOCKER  
**Confidence:** 10/10  
**Files:** `app/_layout.tsx:130-145`, `app/(tabs)/_layout.tsx:167-188`, `src/ui/screens/GarminSyncScreen.tsx:139-175`, `app/garmin/index.tsx:54-64`

**Issue:** Garmin is registered as a top-level stack sibling of `(tabs)`, so the Workout/Calendar/Library/Progress shell disappears. The root intentionally renders an inert back placeholder, leaving no touch-visible route back to the four roots. This violates GAR-01, the Phase 18 four-root-shell decision, and the approved contextual-root contract.

**Fix:** Host Garmin within the existing root shell while keeping it out of the tab list, or render the shared `AppTabs` shell around the contextual route with the validated origin selected. Preserve the inert root placeholder only when the four-root navigation remains visible.

### CR-09: Unmatch and reassignment are implemented in the repository but unreachable in product code

**Classification:** BLOCKER  
**Confidence:** 10/10  
**Files:** `src/domains/running/activityMatchCommands.ts:1-40`, `src/bootstrap/workoutAppRuntime.tsx:2813-2855`, `app/garmin/match/[activityId].tsx:58-67`

**Issue:** The domain supports `match | unmatch | reassign`, but the app runtime hardcodes `action: "match"`; an already matched activity has no unmatch/reassign command. `Leave unmatched` only navigates back and can never change an existing relation. The UI contract explicitly requires recovery for already-matched, unmatch, and reassignment states.

**Fix:** Expose explicit unmatch/reassign runtime methods that prepare the complete revision-fenced command, render reviewed current/new relation states, and preserve the current relation on conflict/failure. Keep initial Back/Leave-unmatched zero-write.

### CR-10: The adversarial evidence verifier never checks current source/APK/device identity

**Classification:** BLOCKER  
**Confidence:** 10/10  
**File:** `scripts/verify-phase18-garmin-adversarial.mjs:246-305`

**Issue:** `validatePhase18GarminAdversarialCurrentIdentity` exists but the executable verifier never calls it. The CLI compares evidence to the retained manifest and hashes native/privacy reports, then can seal them without recomputing current Git tree, Python lock, retained/installed APK, signature, or device identity. Stale evidence can close as PASS after source or installation changes.

**Fix:** Resolve current identity in the executable path and call the existing validator before returning or sealing, using actual retained/installed APK bytes and current report bytes. Add negative tests for every stale identity field through the real CLI path.

### CR-11: Aggregate acceptance still treats nested evidence assertions as authority

**Classification:** BLOCKER  
**Confidence:** 10/10  
**File:** `scripts/verify-phase18-garmin-acceptance.mjs:332-361`

**Issue:** The acceptance verifier hashes the two final-evidence files, but validates their internal report identities with values copied from those same files. It does not run each owner's full file-resolving verifier or read/hash the proof raw report and adversarial native/privacy reports. Maestro and privacy files need only `{status: "passed"}` plus caller-supplied observations/count. A self-authored artifact set can therefore satisfy both native prerequisites.

**Fix:** Invoke/refactor the full proof and adversarial executable verifiers against their exact retained files and current installed identities. Independently parse the Maestro report schema/result counts/configurations and the privacy report's scanned artifact ledger; derive acceptance observations rather than comparing to a caller-authored constant.

### CR-12: Real-account privacy PASS misses account identity, email, DI tokens, filenames, and serials

**Classification:** BLOCKER  
**Confidence:** 10/10  
**File:** `scripts/run-phase18-garmin-proof.mjs:30-55`, `scripts/run-phase18-garmin-proof.mjs:303-307`, `scripts/run-phase18-garmin-proof.mjs:525-553`

**Issue:** The runner now scans all app-process log tags, but `PRIVATE_LOG_PATTERN` omits account namespace, email-address values, generic/DI token names, ciphertext, raw JSON, private filenames, and device serials. Logs containing `account_namespace=garmin:...`, `di_token=...`, or an email can still produce `PH18-PRIVACY` PASS.

**Fix:** Reuse one recursive privacy scanner across proof/adversarial/acceptance with forbidden key and value grammars for every Phase 18 prohibited field, including email values, account namespaces, generic token/ciphertext forms, private filenames, JSON/provider payloads, routes/health/location, and serials. Add one negative test per class.

### CR-13: Benchmark PASS can be injected through global logcat and has no installed producer

**Classification:** BLOCKER  
**Confidence:** 10/10  
**Files:** `scripts/benchmark-phase18-garmin.mjs:198-243`, `app/__phase18-garmin-acceptance.tsx:13-36`

**Issue:** The collector launches `?mode=benchmark` without the route's required confirmation, while the route has no benchmark mode and emits no benchmark marker. The collector then searches unfiltered global logcat for the first marker and trusts its identity/measurements. Another process or an `adb shell log` injection can supply a passing report; the collector never independently recomputes current source/APK/device identity.

**Fix:** Implement a guarded in-app benchmark producer with a per-run nonce, filter logcat to the launched app PID, bind the nonce to every marker, and independently resolve source tree, lock, retained/installed APK, signature, and device identity before writing evidence. Reject markers from any other process/run.

## Warnings

### WR-01: Discovery-contract tests still duplicate a handcrafted provider row and overvalidate irrelevant fields

**Classification:** WARNING  
**Confidence:** 9/10  
**Files:** `src/platform/garmin/garminActivityAdapter.ts:194-214`, `src/platform/garmin/garminActivityAdapter.test.ts:80-86`, `modules/garmin-connect/android/src/test/python/test_garmin_bridge.py:47-49`, `src/bootstrap/garminImportRuntime.test.tsx:734-780`

**Issue:** Python and TypeScript separately handcraft `{activityId, activityType.typeKey}` instead of consuming one captured, pinned-client discovery fixture. `parseDiscovery` also runs the generic forbidden-key/URL scan over the entire provider summary even though only two fields are needed, so an unrelated provider-added URL-like field can break discovery again.

**Fix:** Store one redacted captured 0.3.17 `get_activities` row fixture, consume it in both language tests, and parse/validate only the required discovery fields while discarding unrelated bounded fields.

### WR-02: Acceptance and adversarial builds still print the raw device serial

**Classification:** WARNING  
**Confidence:** 10/10  
**File:** `scripts/build-current-native-test-apk.sh:246-247`, `scripts/build-current-native-test-apk.sh:305-313`

**Issue:** The manifest privacy guard covers all three Phase 18 suites, but the final logging `case` privacy-bounds only proof. Acceptance/adversarial builds print `device=$device_serial`, leaking a field their evidence contracts explicitly prohibit.

**Fix:** Apply the same suite predicate to console output and print only `device_identity_sha256`, API, and ABI for every Phase 18 suite.

### WR-03: The advertised focused coverage gate is not complete branch/evidence coverage

**Classification:** WARNING  
**Confidence:** 10/10  
**Files:** `scripts/run-coverage-gate.mjs:18-68`, `scripts/phase18-language-coverage.mjs:8-48`, `scripts/run-phase18-python-coverage.py:43-53`, `scripts/run-phase18-python-coverage.py:124-142`

**Issue:** Python reports lines plus named cases, not branches, despite the project rule requiring complete branch coverage for integrity-critical modules. Node evidence coverage includes only `phase18-build-manifest.mjs` and `phase18-language-coverage.mjs`; the proof, acceptance, adversarial, benchmark, and lock verifiers where false-pass defects live are merely executed, not coverage-gated.

**Fix:** Use a real Python branch collector and require 100% branches. Add every integrity/evidence verifier and runner to the focused coverage set with branch thresholds; fail when any language/report is absent or source-stale.

### WR-04: Persisted activity and candidate states are computed but not rendered

**Classification:** WARNING  
**Confidence:** 10/10  
**Files:** `src/bootstrap/workoutAppRuntime.tsx:2737-2746`, `src/ui/screens/GarminSyncScreen.tsx:220-245`, `src/domains/running/activityMatchCommands.ts:26-40`, `src/ui/screens/ActivityMatchScreen.tsx:45-85`

**Issue:** History rows receive `matchState`, and candidates receive current `state`, but the screens omit both from visible and accessible copy. Users cannot distinguish matched/unmatched history or confirm that a candidate is still planned, contrary to the source-backed row contract.

**Fix:** Render concise semantic status text/badges and include each state in the row's accessibility label. Add component assertions for matched, unmatched, planned, and future state variants.

### WR-05: Back remains active while a match commit is in flight

**Classification:** WARNING  
**Confidence:** 9/10  
**Files:** `src/ui/screens/ActivityMatchScreen.tsx:118-149`, `app/garmin/match/[activityId].tsx:58-67`

**Issue:** Confirm sets a busy latch, but `requestBack()` ignores it. Header/hardware Back can unmount the route while `runtime.confirmActivityMatch` continues and commits off-screen, producing a hidden write and no result/recovery presentation.

**Fix:** Block Back/Leave while the authoritative commit is pending, or move operation ownership to the route/runtime so navigation returns to an explicit committed/recoverable state. Add a delayed-confirm plus Back test.

### WR-06: Durable sync-summary read failures are silently presented as “never synced”

**Classification:** WARNING  
**Confidence:** 9/10  
**File:** `src/ui/garmin/useGarminConnectionController.ts:253-275`

**Issue:** `loadLastSuccessfulSync()` rejection is swallowed with `.catch(() => undefined)`. Corrupt/unavailable durable state therefore renders no last-success record and no error, making a prior successful sync indistinguishable from never synced.

**Fix:** Track a bounded summary-load failure state, retain any already loaded summary, and show an honest retryable status without blocking retained activity history. Add repository-failure and retry tests.

---

_Reviewed: 2026-10-11T16:39:20Z_  
_Reviewer: TRAE (gsd-code-reviewer + gstack review)_  
_Depth: deep_

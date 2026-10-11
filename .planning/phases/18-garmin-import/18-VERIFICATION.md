---
phase: 18-garmin-import
verified: 2026-10-11T17:57:22Z
status: gaps_found
score: 7/8 host must-haves verified
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "Phase 18's evidence validation must reject self-authored or mocked native proof and must not allow host artifacts to close the required native checkpoint."
    status: failed
    reason: "The host acceptance verifier still derives current-identity fields from owner-supplied evidence when no external owner verifier is injected, and the adversarial verifier test still proves a synthetic `native-exact-artifact` report can pass verification without a real installed-device run. That leaves the Phase 18 proof pipeline fail-open for the exact native evidence it is supposed to gate."
    artifacts:
      - path: "scripts/verify-phase18-garmin-acceptance.mjs"
        issue: "Fallback identity validation trusts `ownerEvidence.manifest` and owner report hashes at lines 354-362 instead of recomputing installed/current identity itself."
      - path: "scripts/phase18-garmin-adversarial.test.mjs"
        issue: "The verifier test at lines 409-435 demonstrates a fully synthetic adversarial evidence object can return `status: passed`."
      - path: "scripts/verify-phase18-garmin-adversarial.mjs"
        issue: "Current-identity validation exists at lines 236-249, but the passing test above shows the executable path can still be satisfied by injected synthetic evidence."
    missing:
      - "Make every Garmin evidence verifier recompute current source/build/device/report identity from live artifacts before accepting or sealing evidence."
      - "Reject any synthetic or caller-authored `native-exact-artifact` report that is not bound to current installed-device provenance."
      - "Re-run the verifier tests with negative cases that prove mocked/host-only artifacts cannot satisfy the native checkpoint."
deferred:
  - truth: "Fresh real-account Garmin proof artifact exists and is validated."
    addressed_in: "Phase 20"
    evidence: "ROADMAP Phase 20 SC3 and REQUIREMENTS VER-10 require installed-APK packaging, real login/MFA/read/restart/logout, JSON fidelity, idempotent sync, and explicit matching proof. `artifacts/native/phase18-garmin-proof/final-evidence.json` is absent."
  - truth: "Fresh adversarial native Garmin lifecycle/failure artifact exists and is validated."
    addressed_in: "Phase 20"
    evidence: "ROADMAP Phase 20 SC3 and REQUIREMENTS VER-10 own the installed-device adversarial Garmin checkpoint. `artifacts/native/phase18-garmin-adversarial/final-evidence.json` is absent."
  - truth: "Fresh final Garmin acceptance artifact exists and is validated."
    addressed_in: "Phase 20"
    evidence: "ROADMAP Phase 20 SC1 and SC3 require source-bound native evidence coverage; `artifacts/native/phase18-garmin-acceptance/final-evidence.json` is absent."
---

# Phase 18: Garmin Account Sync Verification Report

**Phase Goal:** The owner can sign in to Garmin from a standalone ARM64 Android app, sync validated activity summary/splits/detail JSON, inspect truthful outdoor or treadmill details, and explicitly match one activity to one scheduled Running occurrence.
**Verified:** 2026-10-11T17:57:22Z
**Status:** gaps_found
**Integrated HEAD:** `1fc767fc`
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Garmin opens contextually from Workout, Running plan, and a typed Calendar-origin activity-detail contract while the app keeps exactly four roots. | ✓ VERIFIED | Workout pushes `/garmin` with `origin: "workout"` in `app/(tabs)/index.tsx:108-113`; Running plan pushes `/garmin` with `origin: "library"` in `app/library/running/[planId].tsx:25-26`; Garmin routes are registered beside, not inside, the four tabs in `app/_layout.tsx:130-159`; tab shell remains exactly Workout/Calendar/Library/Progress in `app/(tabs)/_layout.tsx:104-117`; Calendar-origin local-ID contract is validated in `app/garmin/activity/[activityId].tsx:32-79` and `app/__tests__/garmin-activity-route.test.tsx:206-220`. |
| 2 | The bundled native/Python bridge is pinned to the selected ARM64 transport, exposes only the allowlisted Garmin operations, and runs work off the UI thread. | ✓ VERIFIED | Gradle pins Python 3.13 and the exact `python-garminconnect` git commit in `android/app/build.gradle:198-200`; lock metadata repeats the exact package/version/commit in `modules/garmin-connect/python/garmin-python-lock.json:5-10`; Kotlin rejects schema drift and runs every exported function on `backgroundCoroutineScope` in `GarminConnectModule.kt:72-159`; Python bridge allowlists only connection/login/MFA/logout and summary/activity/splits/detail operations in `garmin_bridge.py:13-35`. |
| 3 | Credentials/MFA remain foreground interactions, session restore is truthful on host, disconnect invalidates in-flight work, and imported history is preserved. | ✓ VERIFIED | Session restore and disconnect semantics are implemented in `GarminClientWorker.kt:123-171` and exercised by targeted unit tests: `npm run test:unit -- --runInBand src/ui/garmin/useGarminConnectionController.test.tsx -t "restores the native session on a fresh mount before treating the account as disconnected|invalidates in-flight sync, latches duplicate disconnect, and retains imported history"` passed with 2 tests; durable namespace derivation/persistence is in `garmin_bridge.py:223-268`; Garmin root UI exposes truthful sign-in, retry, date-review, and disconnect states in `GarminSyncScreen.tsx:406-587`. |
| 4 | Outdoor/treadmill details and lap semantics are truthful, and the formerly-stale date-review and revision-review flows now exist in source. | ✓ VERIFIED | Detail screen shows outdoor facts, treadmill `No route`, Lap/Time/Pace headers, and honest missing values in `ImportedActivityDetailScreen.tsx:400-456`; route contract and retry states are validated in `app/garmin/activity/[activityId].tsx:102-181`; targeted components passed in `src/ui/__tests__/ImportedActivityDetailScreen.test.tsx` and `src/ui/__tests__/GarminSyncScreen.test.tsx`; date-review action/submission exists in `GarminSyncScreen.tsx:410-415` and `533-587`. |
| 5 | Matching shows stable candidates, selection is write-free until Confirm, Confirm sends exactly one selected candidate, and Back/Leave unmatched write nothing. | ✓ VERIFIED | UI keeps selection local and only confirms through `props.onConfirm(selected)` in `ActivityMatchScreen.tsx:130-194`; route wires Confirm to `runtime.confirmActivityMatch(candidate)` and Leave unmatched to `router.back()` in `app/garmin/match/[activityId].tsx:62-74`; route and screen tests prove alternate-candidate confirm and zero-write Back/Leave behavior in `app/__tests__/garmin-match-route.test.tsx:106-145` and `src/ui/__tests__/ActivityMatchScreen.test.tsx:54-120`. |
| 6 | Garmin JSON import is validated, normalized, and transaction-fenced before commit. | ✓ VERIFIED | Import write path reparses the staged envelope, recomputes canonical payload JSON and SHA-256 inside the SQLite transaction, and returns conflict instead of committing mismatched staged data in `src/platform/sqlite/repositories/importedActivityRepository.ts:196-217`; normalization and bounded bridge handling live in `src/platform/garmin/garminActivityAdapter.ts` and `src/platform/garmin/garminSyncCoordinator.ts`. |
| 7 | The phase still has a source-level acceptance and coverage gate on host. | ✓ VERIFIED | `node scripts/verify-phase18-plan-coverage.mjs` passed: `Phase 18 source audit passed: 14 plans, 16 requirements, 12 decisions, 40 executable tasks, 31 selected transport facts.` Focused component suites also passed: `npm run test:components -- --runInBand app/__tests__/garmin-index-route.test.tsx src/ui/__tests__/GarminSyncScreen.test.tsx src/ui/__tests__/ImportedActivityDetailScreen.test.tsx src/ui/__tests__/ActivityMatchScreen.test.tsx` => 4 suites, 63 tests passed. |
| 8 | Phase 18's evidence validation rejects stale/wrong/skipped/duplicate/private results and cannot relabel mocked provider behavior as real proof. | ✗ FAILED | `scripts/verify-phase18-garmin-acceptance.mjs:345-362` falls back to owner-supplied manifest/report hashes when no owner verifier is injected; `scripts/phase18-garmin-adversarial.test.mjs:409-435` still proves a synthetic evidence object can yield `status: "passed"`; `scripts/verify-phase18-garmin-adversarial.mjs:236-249` contains current-identity validation, but the tested path above shows the overall proof boundary is not yet fail-closed. |

**Score:** 7/8 host truths verified (0 present, behavior-unverified)

### Deferred Items

Items not yet met but explicitly addressed in later milestone phases.

| # | Item | Addressed In | Evidence |
| --- | --- | --- | --- |
| 1 | Installed-APK real-account Garmin proof artifact | Phase 20 | `REQUIREMENTS.md:213` defines `VER-10`; `18-SECURITY.md:114-123` records the missing native artifacts; `artifacts/native/phase18-garmin-proof/final-evidence.json` is absent. |
| 2 | Installed-device adversarial Garmin artifact | Phase 20 | `REQUIREMENTS.md:213` plus Phase 20 SC3 own lifecycle/failure proof; `artifacts/native/phase18-garmin-adversarial/final-evidence.json` is absent. |
| 3 | Final Garmin acceptance artifact | Phase 20 | Phase 20 SC1/SC3 require source-bound native evidence closure; `artifacts/native/phase18-garmin-acceptance/final-evidence.json` is absent. |

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `app/_layout.tsx` | Garmin stack registration without adding a fifth root | ✓ VERIFIED | Registers `garmin/index`, `garmin/activity/[activityId]`, and `garmin/match/[activityId]` beside `(tabs)` in lines 130-159. |
| `app/garmin/index.tsx` | Garmin root route with contextual origin and retained return focus | ✓ VERIFIED | Uses `GarminRouteShell`, typed origin parsing, and retained scroll/focus in lines 32-68. |
| `app/garmin/activity/[activityId].tsx` | Local-ID detail route and Calendar contract | ✓ VERIFIED | Validates local IDs and bounded Calendar return token in lines 32-79. |
| `app/garmin/match/[activityId].tsx` | Match route with confirm-only mutation | ✓ VERIFIED | Loads one local activity and wires only Confirm to runtime mutation in lines 30-74. |
| `src/ui/screens/GarminSyncScreen.tsx` | Truthful Garmin root UI with date-review flow | ✓ VERIFIED | Review action and date-confirmation sheet logic exist in lines 410-587. |
| `src/ui/screens/ImportedActivityDetailScreen.tsx` | Truthful activity detail and revision-review UI | ✓ VERIFIED | Revision-review actions exist in lines 400-456. |
| `src/platform/sqlite/repositories/importedActivityRepository.ts` | Transaction-fenced Garmin import writes | ✓ VERIFIED | Reparse/rehash fence exists in lines 196-217. |
| `scripts/verify-phase18-garmin-acceptance.mjs` | Fail-closed evidence verifier | ✗ STUB / TRUST GAP | File exists and is substantial, but the owner-artifact fallback in lines 345-362 still trusts owner-supplied identity fields. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `app/(tabs)/index.tsx` | `app/garmin/index.tsx` | Workout `Sync Garmin` push with `origin: "workout"` | ✓ WIRED | `app/(tabs)/index.tsx:108-113` |
| `app/library/running/[planId].tsx` | `app/garmin/index.tsx` | Running plan Garmin entry with `origin: "library"` | ✓ WIRED | Route test expects `{ pathname: "/garmin", params: { origin: "library" } }` in `app/__tests__/running-plan-route.test.tsx:97-103` |
| `app/garmin/index.tsx` | `app/garmin/activity/[activityId].tsx` | Open retained imported activity | ✓ WIRED | Push in `app/garmin/index.tsx:43-49`; route test in `app/__tests__/garmin-index-route.test.tsx:150-169` |
| `app/garmin/activity/[activityId].tsx` | `app/garmin/match/[activityId].tsx` | Match from detail route | ✓ WIRED | Push in `app/garmin/activity/[activityId].tsx:127-133`; test in `app/__tests__/garmin-activity-route.test.tsx:192-202` |
| `app/garmin/match/[activityId].tsx` | `src/bootstrap/workoutAppRuntime.tsx` | Confirm candidate only | ✓ WIRED | Route confirm in `app/garmin/match/[activityId].tsx:65-67`; runtime exposes `confirmActivityMatch` and revision review APIs in `src/bootstrap/workoutAppRuntime.tsx` |
| `scripts/verify-phase18-garmin-acceptance.mjs` | Native proof artifacts | Owner artifact verification | ✗ NOT_WIRED SAFELY | Owner verification falls back to owner-supplied identity in `scripts/verify-phase18-garmin-acceptance.mjs:345-362` instead of independently recomputing installed/current identity. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| `app/garmin/index.tsx` | imported activity list + durable sync summary | `useGarminImportRuntime` -> runtime Garmin ports -> SQLite imported-activity history | Yes | ✓ FLOWING |
| `app/garmin/activity/[activityId].tsx` | accepted activity detail + revision review | `runtime.loadImportedActivityDetail` / `runtime.loadGarminRevisionReview` -> imported activity tables | Yes | ✓ FLOWING |
| `app/garmin/match/[activityId].tsx` | stable candidates + confirm result | `runtime.loadRunningActivityMatch` / `runtime.confirmActivityMatch` -> running opportunity + match ledger tables | Yes | ✓ FLOWING |
| `scripts/verify-phase18-garmin-acceptance.mjs` | owner artifact identity | owner evidence JSON fallback | No independent source recomputation in fallback path | ⚠️ STATIC / FAIL-OPEN |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Garmin route/root/detail/match host contract | `npm run test:components -- --runInBand app/__tests__/garmin-index-route.test.tsx src/ui/__tests__/GarminSyncScreen.test.tsx src/ui/__tests__/ImportedActivityDetailScreen.test.tsx src/ui/__tests__/ActivityMatchScreen.test.tsx` | 4 suites passed, 63 tests passed | ✓ PASS |
| Restore-session and disconnect fencing | `npm run test:unit -- --runInBand src/ui/garmin/useGarminConnectionController.test.tsx -t "restores the native session on a fresh mount before treating the account as disconnected|invalidates in-flight sync, latches duplicate disconnect, and retains imported history"` | 1 suite passed, 2 named tests passed | ✓ PASS |
| Final source audit | `node scripts/verify-phase18-plan-coverage.mjs` | `Phase 18 source audit passed: 14 plans, 16 requirements, 12 decisions, 40 executable tasks, 31 selected transport facts.` | ✓ PASS |

### Probe Execution

| Probe | Command | Result | Status |
| --- | --- | --- | --- |
| Phase 18 source audit | `node scripts/verify-phase18-plan-coverage.mjs` | Passed | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `GAR-01` | 18-10, 18-14 | Contextual Garmin entry and four-root preservation | ✓ SATISFIED (host) | Workout/Library/contextual routes and exact four-tab shell are wired in `app/(tabs)/index.tsx`, `app/library/running/[planId].tsx`, `app/_layout.tsx`, and route tests. |
| `GAR-02` | 18-10, 18-14 | Stable Garmin header and inert root back placeholder | ✓ SATISFIED (host) | Root header behavior is covered in `GarminSyncScreen.tsx` and host tests; placeholder marker remains in `GarminSyncScreen.tsx:157`. |
| `GAR-03` | 18-06, 18-10 | Truthful disconnected/offline/sign-in-needed states | ✓ SATISFIED (host) | Root screen and controller tests exercise disconnected, invalid credentials, offline, and sign-in-needed states. |
| `GAR-04` | 18-01, 18-02, 18-03 | Bundled native/Python login/MFA/token persistence | ✓ SATISFIED (host), native proof pending | Pinned module and session storage exist in `GarminConnectModule.kt`, `GarminClientWorker.kt`, `GarminTokenStore.kt`, and `garmin_bridge.py`; real-account proof remains deferred to Phase 20/`VER-10`. |
| `GAR-05` | 18-01, 18-03, 18-05 | Connected state, last sync, history, standalone packaging | ✓ SATISFIED (host), native proof pending | Durable sync summary and imported rows are wired on host; installed-APK packaging proof is deferred to Phase 20. |
| `GAR-06` | 18-02, 18-03, 18-05 | Bounded foreground sync and honest partial/failure states | ✓ SATISFIED (host), native proof pending | `GarminSyncScreen.tsx` and controller/coordinator tests cover sync, partial, retryable, and review-required states. |
| `GAR-07` | 18-02, 18-06, 18-11 | Disconnect invalidates in-flight work and preserves history | ✓ SATISFIED (host), native proof pending | Targeted controller test passed; installed-device logout proof remains Phase 20 work. |
| `GAR-08` | 18-04, 18-05, 18-11 | Allowlisted paged summary/activity/splits/detail JSON and atomic import | ✓ SATISFIED (host), native proof pending | Allowlist and bounded JSON are in `garmin_bridge.py`/`GarminClientWorker.kt`; transaction fence is in `importedActivityRepository.ts`. |
| `GAR-09` | 18-04, 18-05, 18-07, 18-11 | Recovery from malformed/oversized/truncated/ambiguous/cancelled flows | ✓ SATISFIED (host), native proof pending | Host adapters/coordinator/controller tests cover the recovery matrix; live provider/device proof is Phase 20 work. |
| `GAR-10` | 18-04, 18-08 | Truthful outdoor detail | ✓ SATISFIED (host) | Detail screen and tests cover outdoor route, pace, heart rate, and route availability. |
| `GAR-11` | 18-04, 18-08 | Truthful treadmill detail with `No route` | ✓ SATISFIED (host) | `src/ui/__tests__/ImportedActivityDetailScreen.test.tsx:95-116` |
| `GAR-12` | 18-04, 18-08 | Accessible Lap/Time/Pace semantics | ✓ SATISFIED (host) | Same detail tests cover column headers and unavailable cells. |
| `GAR-13` | 18-09, 18-12 | Match candidates and selection without premature write | ✓ SATISFIED (host) | Match route/screen tests prove selection stays local until Confirm. |
| `GAR-14` | 18-09, 18-11, 18-12 | Only Confirm commits selected candidate; Back/Leave unmatched stay zero-write | ✓ SATISFIED (host) | `app/__tests__/garmin-match-route.test.tsx:136-145` and `src/ui/__tests__/ActivityMatchScreen.test.tsx:88-120` |
| `GAR-15` | 18-07, 18-08, 18-10, 18-12, 18-13 | Loading/missing/error/retry states with honest Back behavior | ✓ SATISFIED (host) | Root/detail/match screens expose the required non-happy-path states and retry logic. |
| `GAR-16` | 18-06, 18-08, 18-10, 18-12 | Shared appearance controls across Garmin surfaces | ✓ SATISFIED (host) | Garmin screens use shared appearance controls; route/screen tests cover shared appearance interactions. |

**Requirement score:** 16/16 Garmin requirements satisfied on host evidence.  
**Native closure still pending:** GAR-04 through GAR-09 remain incomplete for installed-device/realtime proof until Phase 20 `VER-10`.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `scripts/verify-phase18-garmin-acceptance.mjs` | 354-362 | Trusts owner-provided identity fields in fallback path | 🛑 Blocker | Allows evidence authors to satisfy the proof boundary without independent current-identity recomputation. |
| `scripts/phase18-garmin-adversarial.test.mjs` | 409-435 | Synthetic adversarial evidence is accepted as passing | 🛑 Blocker | Demonstrates the native-evidence verifier is not fail-closed yet. |

### Human Verification Required

None for this host-only verification run. Native/device proof was intentionally not executed and remains deferred to Phase 20 rather than queued as an ad hoc human check here.

### Gaps Summary

The Garmin product surface is substantially present and host-verified on integrated HEAD `1fc767fc`: contextual entry exists, the selected Python/Chaquopy bridge is pinned and allowlisted, detail/revision/date-review flows are wired, matching is confirm-only, and the import path now reparses and rehashes staged Garmin envelopes inside the write transaction.

The phase still does **not** close cleanly on host because its own Garmin evidence pipeline is not fail-closed. The live verifier/test code shows that owner-supplied artifacts can still satisfy native-proof validation without an independently recomputed installed/current identity, which is exactly the trust boundary this phase was supposed to enforce before Phase 20 uses those artifacts. That is a blocker even though the actual native artifacts are intentionally still absent.

Explicit native status: **do not mark full native PASS.** The following Phase 20 evidence remains missing and was not executed in this verification:

- `artifacts/native/phase18-garmin-proof/final-evidence.json`
- `artifacts/native/phase18-garmin-adversarial/final-evidence.json`
- `artifacts/native/phase18-garmin-acceptance/final-evidence.json`

---

_Verified: 2026-10-11T17:57:22Z_  
_Verifier: TRAE (host goal-backward verification)_

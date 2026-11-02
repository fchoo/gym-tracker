# Personal release test necessity reassessment — 2026-10-30

Status: complete. Personal delivery is accepted; there are no remaining required checks for the installed APK.

## Current authority

The owner instructed: "instead of updating to show what's defer, reevaluate the necessity of the tests." This supersedes the 2026-10-27 closeout proposal and both personal-closeout profiles for personal-release execution. Their exhaustive obligations are removed from the active acceptance criteria, not postponed. Historical plans, sealed profiles, receipts and incomplete verdicts remain evidence of what was previously specified or run; they are not a work queue.

The release outcome is a usable personal Android app with trustworthy saved data. Product requirements for offline workouts, commit-gated saves, history, recovery and Garmin provenance remain. A test is required only when it addresses a concrete failure risk in a delivered change and existing applicable evidence does not already address it. File counts, coverage percentages, missing formal receipts and the age of a passing run do not independently justify work.

## Necessity decisions

| Previous obligation | Decision and reason | What would justify a focused check later |
| --- | --- | --- |
| Complete four-metric coverage across all 208 modules | Removed as a personal-release gate. Much of the remaining work exercises verification CLI/process/report branches, with no effect on the installed app. | An actual change to a product transaction, save, restore or import path; test its meaningful success/failure behavior. |
| Synthetic receipt, identifier, parser, PID, immutable-publication and inheritance matrices | Removed. These verify the acceptance framework rather than normal app use or stored facts. | Use or modification of that framework for a separately requested purpose. |
| All 112 recovery transitions and the full migration/restore/merge aggregate | Removed as a universal release prerequisite. Saved-data risks matter, but unchanged storage does not require every historical fault combination to run again. | A changed schema, transaction writer, replay, backup, restore, merge or import operation; check the affected data-loss/duplication/rollback boundary. |
| 153 mandatory visual pairs and the larger configuration matrix | Removed. The personal phone's affected interactions and final owner acceptance already have evidence; exhaustive prototype/configuration coverage adds no justified current gate. | A changed layout or reported clipping/navigation bug; inspect that screen and the specific affected configuration. |
| Repeated Garmin login/MFA/logout/provider-failure walkthroughs | Removed. Login/import is already established; current work changes no production Garmin transport or credentials. | A changed authentication/transport/normalization path or a new failure; prefer isolated, credential-free checks where sufficient. |
| Repeated Calendar/workout/reorder/collapse suites | Removed when their behavior and relevant dependencies are unchanged. Passing focused delivery results and owner acceptance are reusable within their scope. | A change or reported regression in the specific interaction. |
| Full benchmark, accessibility and motion ceremony | Removed as a blanket gate. Focused interaction tests and native observations cover the delivered fixes; universal latency/configuration claims were never made. | A changed scheduler, gesture, layout or input behavior; measure or inspect that exact path. |
| New instrumented APK, immutable native run, attended matrix, preseal and final seal | Removed for this personal release. Verification tooling and documentation changes do not warrant reinstalling an already accepted app. | Delivery of a changed app artifact: build it once and verify the changed behavior using its actual bytes. |
| Nyquist, additional audits and exhaustive 172-row completion as personal-use prerequisites | Removed. These formal framework outputs do not determine whether the accepted personal APK can be used. | A separately requested formal milestone or distribution review with newly justified scope. |

These decisions remove acceptance obligations, not legitimate source fixes or integrity guards. Existing validator semantics and coverage thresholds are preserved; no full validator is bypassed or made to report PASS.

## Minimum acceptance retained

For a future changed app release, use one combined launch → planned-workout start → save/complete → cold-reopen check where the delivered change affects that loop. Verify that success follows the database commit and the committed value/order is retained. Add only the changed feature's critical check. Reuse applicable passing evidence; do not repeat the combined check for documentation or host verification-tool changes.

| Risk | Minimum useful evidence | Current disposition |
| --- | --- | --- |
| App cannot launch or reach normal pages | Actual artifact launch/navigation observation | Closed for the installed release: matching bytes, main-screen launch and owner acceptance recorded. |
| Planned workout or saves are unusable | Start/use observation plus relevant committed-save regressions | Closed for personal delivery through existing focused results and final owner acceptance. The last installation receipt itself did not complete a set. |
| Saved data is lost or duplicated | Relevant commit/retry/reopen evidence; focused rollback/replay check if the writer changes | Existing evidence remains source-scoped. Earlier cold-restart observations are not relabelled as a fresh test of the final APK. No new storage/schema/writer change is being delivered in this reassessment. |
| Changed timer fails in background or overlaps audio | Repeated adjustment plus expiry/background observation of the changed scheduler/audio path | Not a current trigger; scheduler/audio implementation has not changed since the accepted release. |
| Changed date policy misgroups activities | One relevant source-timezone/display-timezone boundary | Not a current trigger. Registered fallback remains Asia/Singapore; display follows the phone's current timezone. |

The owner's final functional acceptance is sufficient for this personal delivery. It does not manufacture automated native evidence for cases that were not run.

## Installed release and unpublished source

Installed release source: `908098f388b14823ab262fbdfd77e0c13468d688`.

APK SHA-256: `259a607db376b3bf9eff28b92694e60ea0c28eac8c02285b618e6444cf945669`.

[Phone receipt](../../artifacts/native/interaction-responsiveness/phone-install-verification.json) records installed-byte equality, preserved app-data identity, launch success and the owner's 2026-10-26 confirmation: "manually verified ok; close phone checks." [Delivery report](../../artifacts/native/interaction-responsiveness/REPORT.md) records the focused save/retry, drag/workout, rest, Calendar and runtime checks, source review and final emulator observations. Those results retain their original scope.

The read-only comparison against local source `912383c18bcde5cdd6ed167925b12d242425ac16` found:

- Native contract execution/logging and route observation are acceptance-build instrumentation. The observer requires the devtest package, development-test profile, enabled contracts and acceptance suite, and renders no controls.
- The additional Progress loading fixture requires a visual-test request; it does not describe normal user navigation.
- `workoutAppRuntime.tsx` removes unused configuration branches. All four previous selection-refresh callers already passed `true`; all eight previous reconciliation callers already passed `false`. Their active refresh behavior is retained. The imported-history timestamp is already required by the ready normalized projection; its query/writer and date policy do not change.
- `mergePlan.ts` removes an unused preference-key helper. It does not alter merge decisions or writes.
- `progressRepository.ts` removes a temporary global `toSorted` shim around pure projections that already use copied-array `.sort()`. Repository queries and writes do not change.
- Other changes in the app/source diff are tests and acceptance fixtures/registries. Current uncommitted work is verification tooling and planning; no app/runtime/database/module/package change is being installed.

No concrete app-use or saved-data failure was identified from this comparison. This is source reasoning, not a new native PASS for local HEAD. Local changes remain preserved and unpublished. If they are later selected for delivery, review the actual changed artifact and relevant paths; the old formal receipt backlog does not automatically return.

## Execution closed

All five testing workers are completed and have no active execution. The noncritical renewals were cancelled with their partial logs preserved. The central runner had already finished before the stop signal arrived and is recorded as completed, not cancelled. No new test, build, installation, reset or credential operation was performed for this reassessment.

Plans 20-08–20-12 are historical full-acceptance plans and are removed from the personal work queue. The old reopen/defer lists do not authorize their execution. Current required work: **none**. Historical full Phase 20/native-seal/Nyquist/v1.2 verdicts remain incomplete or unclaimed; reducing scope does not convert them into PASS.

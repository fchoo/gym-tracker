# Domain Pitfalls: Gym Tracker v1.2

**Domain:** Offline Android strength planning/logging, concurrent running plans, Garmin activity import, and prototype-faithful native UI.
**Researched:** 2026-10-06
**Status:** Planning only. No implementation, build, device operation, release, or verification pass is authorized by this document.
**Confidence:** MEDIUM overall. The research seam returned MEDIUM for `websearch --verified`; local contracts below were read directly and cross-checked against shipped verification reports. Recommendations describe future work, not tested v1.2 behavior.
**Authority:** `.planning/v1.2-OWNER-BRIEF.md` overrides the old draft and presentation decisions in earlier milestones. Shipped storage/history integrity remains binding.

## Critical Pitfalls

### P-01: Adding a second active plan only in the UI

**What goes wrong:** Strength and Running both appear active, while Today, activation, schedule consumption, backup, or restore still select one global plan.

**Why it happens:** Schema 8 creates global `one_active_owned_schedule` and `one_active_owned_plan` partial unique indexes. `starterPlanRepository.ts` deactivates the existing plan/schedule; `plansWorkoutRepository.ts` reads active plans with `LIMIT 1`. Removing one index alone does not change those aggregate contracts.

**Consequences:** Activating Running silently disables Strength, one schedule disappears from Calendar, completing or matching one activity consumes another opportunity, or restored data violates the old uniqueness assumptions.

**Prevention:** Put the multi-active domain migration before presentation. Make active-plan selection, independent schedules, same-date collisions, Today ordering, schedule revisions, opportunity identity, and explicit activation domain concepts. Concurrent plans do not implicitly authorize concurrent active strength sessions. Retain legacy plan/session lineage and do not retroactively reassign history. The ADR must decide same-discipline multiplicity and matching cardinality explicitly; tests must exercise the chosen policy.

**Detection:** Run the future `NV-DOM-*` matrix against real SQLite: activate A then B; edit/deactivate B; restart; export/restore/merge; verify A's activation, schedule versions, opportunities and history remain exact. Search for every singleton `LIMIT 1` and global deactivation in plan/schedule consumers, not just the two named repositories.

**Evidence / confidence:** MEDIUM, direct source: `src/platform/sqlite/migrations/0008_schedule_activation.ts:472`, `src/platform/sqlite/repositories/starterPlanRepository.ts:512`, `src/platform/sqlite/repositories/plansWorkoutRepository.ts:1378`. Requires deeper phase research and ADR.

### P-02: Migrating from an obsolete baseline or promising whole-batch rollback

**What goes wrong:** A new migration starts after v26 because a phase report mentions v26, misses timing ownership triggers added in v27, or claims that a late migration failure rolls back every earlier committed migration.

**Why it happens:** Current `migrations/index.ts` registers `0027_advanced_timing_target_ownership.ts`; historical phase descriptions are not a schema manifest. `migrationRunner.ts` commits each migration separately after its own verification, integrity check and `user_version` update.

**Consequences:** Ownership protection regresses, backup imports bind timers to another session, or recovery assumes an unsupported schema downgrade.

**Prevention:** Use current schema **27** as the retained-upgrade fixture; also exercise empty and older supported baselines. Add a successor migration; never edit shipped migration bytes. Classify the new migration honestly: rebuilding activation constraints or transforming facts needs the runner's validated recovery-backup path for non-additive migrations. Preserve the last committed valid schema on failure. Do not promise an old APK can open a newer database; recovery/downgrade must use a verified compatible archive and an explicit recovery flow.

**Detection:** Inject failures in statement, verify, integrity, commit and recovery-backup stages; reopen with a new runtime and check actual `user_version`, foreign keys, indexes, trigger behavior and fact digests. Verify v27 rejects a timing target from a different session before and after migration. Retrying the same runner instance must remain rejected.

**Evidence / confidence:** MEDIUM: `src/platform/sqlite/migrations/index.ts`, `0027_advanced_timing_target_ownership.ts`, `src/platform/sqlite/migrationRunner.ts:205`, `src/platform/sqlite/recoveryBackup.ts`. Existing native ledger has 13 named migrations/effects cases; that historical count is not coverage of the new migration.

### P-03: New Running/import facts disappear from backup or never mark Drive dirty

**What goes wrong:** New tables work locally but vanish on replacement-phone restore, dedupe receipts disappear, or Drive never publishes changes to them.

**Why it happens:** Logical portability is an explicit source-table/column/graph allowlist, not a database dump. Migration 23 generated mutation-generation triggers for the then-known logical tables. New tables need explicit trigger registration and complete backup, parser, identity, remap, merge and rebuild support.

**Consequences:** Lost running plans, lost imported activities, duplicate imports after recovery, broken matching edges, or stale snapshots presented as current.

**Prevention:** Treat portability as part of domain completion. Extend the canonical logical graph with bounded running sessions, Garmin account JSON provenance/dedup identities, confirmed matching edges and any owner goals/bodyweight that are retained source facts. Retain canonical supported source facts and hashes without copying encrypted Garmin session tokens, temporary previews, Drive writer metadata or rebuildable projections into portable facts. Include new identities and foreign-key edges in merge remapping. Add dirty-generation triggers for new source tables; retain strict old-format handling and safe future-version quarantine.

**Detection:** Mixed Strength/Running/Garmin-JSON/confirmed-match fixtures round-trip through encrypted GTBK and automatic Drive logical snapshots; compare canonical identities, relationships and rebuilt projections. Mutate only a new Running/import table and verify durable generation advances in the same transaction. Repeat sync after restore/merge and assert no new activity or match.

**Evidence / confidence:** MEDIUM: `src/domains/portability/backupContracts.ts:7`, `src/platform/sqlite/migrations/0023_automatic_drive_backup.ts:35`, `logicalBackupRepository.ts`, `logicalRestoreRepository.ts`, `logicalMergeRepository.ts`, `restoreReconciliationRepository.ts`. Existing caps: 32 MiB GTBK archive, 24 MiB plaintext, 100,000 total rows, 25,000/table, 64 KiB/string, nesting depth 16. New facts must fit reviewed limits or trigger an explicit contract revision.

### P-04: Faster-looking completion bypasses the commit boundary

**What goes wrong:** A tap fills a completed row, collapses the last exercise, starts rest, shows a toast or plays completion feedback before SQLite commits; repeated row/dock taps execute different write paths.

**Why it happens:** Prototype state is synchronous and presentation work can tempt optimistic acknowledgement. The native app has commit failure, stale revisions, delayed I/O and process death.

**Consequences:** The owner sees success for an unsaved set; retry duplicates a set; lost draft values or a collapsed failed exercise make recovery difficult.

**Prevention:** Both touch paths invoke the existing command with the same revision/idempotency discipline. Only apply the authoritative returned view after the private writer commits. Keep pending values and error recovery visible. Final-set collapse is post-commit. Top toasts clear the primary dock and never replace source facts. Preserve warm-up versus working ordinal identity, all nine metric profiles, undo and history protection.

**Detection:** Deferred-promise component tests assert no success/collapse/rest before resolution; real SQLite faults assert unchanged facts and retries complete once. Native kill after commit but before render must recover exactly one completion. Delete/replace/reorder tests compare complete protected source snapshots, not only visible counts.

**Evidence / confidence:** MEDIUM: `src/platform/sqlite/serializedWriter.ts`, `src/domains/workout/setCommands.ts`, `src/ui/__tests__/ActiveWorkoutScreen.test.tsx`, `tests/integration/complete-set.test.ts`, `tests/integration/session-exercise-editing.test.ts`, shipped Phase 08/09 verification.

### P-05: Removing timing UI destroys historical timing facts

**What goes wrong:** Removing per-rep/nested Advanced Timing controls also strips existing v21/v27 snapshot fields or backup support, or copies sound/haptic preferences into new plans.

**Why it happens:** The new owner brief intentionally changes authoring presentation while earlier shipped plans preserve per-set resolved timing and advisory-cue state.

**Consequences:** Existing sessions become unreadable, restore changes historical meaning, or an old cadence runs unexpectedly through an invisible control.

**Prevention:** Apply the settled TIM-01 retirement. New UI uses explicit `sec` and no per-rep cadence, rest-between-reps, nested Advanced Timing screen, or plan-owned sound/haptics. Deterministic recovery preserves ordinary set/pointer/rest facts and dormant historical bytes without interpreting or replaying cadence/cluster state. Preserve v27 ownership and independent between-set rest. A failed zero-cue proof blocks implementation for a defect fix; it never authorizes a compatibility mode or reopens the product choice.

**Detection:** Upgrade/restore fixtures containing warm-up and working overrides, running/paused/expired legacy timing, and cross-session invalid targets. Reopen without new plan authoring controls; rest/complete/undo remain usable, no missed cue is replayed, and protected snapshots remain equal.

**Evidence / confidence:** MEDIUM: owner brief; approved TIM-01 record; Phase 10 verification; `tests/integration/advanced-timing.test.ts`; migration 27. Requires implementation proof, not another decision.

### P-06: Treating Calendar as several independent animations

**What goes wrong:** The month title, pointer-following panels, selected date, focused week and agenda disagree during reversal, interrupted animations, adjacent-week taps or resize.

**Why it happens:** CSS-like effects are ported separately without one transition authority. A final screenshot can look correct while the visible path violates the approved interaction.

**Consequences:** Wrong dates open; selected rows teleport; vertical scrolling becomes a month swipe; reduced motion skips state changes; a stale completion callback restores the prior week.

**Prevention:** Specify a finite presentation state machine with stable local-date/event IDs and one transition generation. Preserve 1:1 horizontal drag, title preview at 25%, snap-back below threshold, selected-row-to-top and following-row-to-bottom morph, inverse collapse, and adjacent selection's collapse → month selection → expansion sequence. Separate gesture progress from committed date/month facts. Vertical intent must relinquish horizontal handling. Reduced motion preserves the same ordered state transitions without translation.

**Detection:** `NV-CAL-01..09` in the native matrix assert intermediate geometry and semantic state, not just final month text. Cover negative/positive threshold boundaries, crossing and receding, pointer cancel, interrupted settle, rapid retarget, RTL policy if introduced, year/leap boundaries, rotation and native reduced motion. Test at 0, 1 and many events per day; date inset remains unchanged.

**Evidence / confidence:** MEDIUM: owner brief; prototype `approved-hybrid.html` around `enterCalendarFocus`, `switchExpandedCalendarWeek` and 25% drag checks (lines 3098–3101, 3261–3279 at research time). This is the highest UI-specific research flag.

### P-07: Treating the embedded Garmin account client as proven before native evidence

**What goes wrong:** The roadmap treats the pinned Python/Chaquopy stack as production-ready before proving packaged importability, authenticated reads, MFA, refresh/cold restart, rate limits and account-specific failures on the signed ARM64 app.

**Why it happens:** Source and wheel compatibility establish feasibility, but cannot prove Garmin endpoint behavior, account challenges, Android native packaging or long-lived session recovery.

**Consequences:** A completed UI cannot sync real data, credentials or tokens leak into logs/backups, or failures are mistaken for a product decision and trigger an unreviewed fallback.

**Prevention:** Use only the selected narrow embedded adapter: Python 3.13, Chaquopy 17.0 and pinned python-garminconnect 0.3.17. Keep login/MFA foreground-only, restore encrypted injected session tokens outside logical backups, allowlist summary/activity/splits/detail calls, bound payloads/retries, and keep secrets plus private activity fields out of diagnostics. No partner API/broker, desktop bridge or FIT fallback is a milestone branch.

**Detection:** Phase 18 must prove an installed ARM64 package, real account login/MFA/read, encrypted refresh after cold restart, logout, 403 and 429 handling. Synthetic fixtures close deterministic parsing only; missing live proof is NOT_RUN or REVIEW_REQUIRED and observed failure is FAIL.

**Evidence / confidence:** MEDIUM: pinned python-garminconnect source, Chaquopy compatibility, Android curl_cffi wheel, open issue #444 and the focused mobile feasibility record. Real account/native behavior remains implementation evidence.

### P-08: Deduplication and schedule matching are conflated

**What goes wrong:** A repeated or reordered JSON page creates another activity; a changed response silently overwrites a prior source revision; or a sync auto-completes a suggested running session.

**Why it happens:** Name/date matching is used as identity, bytes are trusted without a receipt, or the suggestion UI writes its radio selection without explicit confirmation.

**Consequences:** Duplicate distance/history, incorrect progression and consumed planned opportunities. A crash between activity insert and receipt insert creates a repeat-import hole.

**Prevention:** Make account namespace, external activity ID, normalization version, normalized JSON SHA-256 and raw component hashes first-class dedup/revision signals. Commit activity/provenance/receipt atomically. Keep matching a separate revision-checked, idempotent owner command; syncing never creates or activates a plan. Repeated identical sync is a no-op; the same external ID with changed canonical content stages an explicit source revision rather than silently overwriting. Treadmill activities deliberately have no route; absent HR/laps/GPS stays absent.

**Detection:** `NV-IMP-*` tests cover repeats, reordered pages, concurrent sync, restart around every commit cut, same ID/different digest, component-hash drift, timezone ambiguity and multiple same-day candidates. Matching cancel/retry/repeat/stale cases verify opportunity consumption occurs only after one explicit successful command.

**Evidence / confidence:** MEDIUM: owner brief; existing revision/receipt and portable identity patterns. New Garmin identity/conflict rules require ADR and future tests; no implementation exists yet.

### P-09: Read-only history reuses writable Active Workout wiring

**What goes wrong:** Historical Strength details look correct but expose live completion, drag mutation, edits or rest side effects through shared callbacks.

**Why it happens:** Sharing the Active-shaped renderer accidentally shares its command ports and lifecycle effects.

**Consequences:** Opening Calendar history changes source facts, starts timers, or creates an active workout.

**Prevention:** Share presentation with an explicit read-only capability boundary; do not supply mutation ports to historical rows. Route planned Running to its plan, imported activity to Garmin detail, Strength history to read-only details. Keep existing explicit correction/removal workflows separate.

**Detection:** Compare relevant SQLite source digests before/after every historical navigation, disclosure and chart action. Component spies must reject unexpected mutation calls; native test leaves no active session or rest notification after read-only visits.

**Evidence / confidence:** MEDIUM: owner brief; `src/ui/__tests__/SessionCorrectionScreen.test.tsx`, history repository tests, shipped Phase 03 history-integrity contracts.

## Moderate Pitfalls

| ID | What goes wrong | Prevention and detection | Confidence |
|---|---|---|---|
| P-10 | True-empty Plans bypasses the neutral Strength/Running chooser; create silently activates | All Create entries invoke the same chooser. Empty/existing/inactive states share it. Assert create is persisted inactive and activation is a separate command. | MEDIUM |
| P-11 | Structured Running editor collapses seven session types into an unvalidated description | Persist typed Recovery, Long run, Progression, Tempo, Intervals, Hills and Fartlek with common and contextual fields. Round-trip each; block invalid units, ordering and incomplete repetitions before commit. | MEDIUM |
| P-12 | Progress mixes incomparable units or invents goals | Compare discipline/profile-compatible evidence. Warm-ups and imported lap metrics never become strength volume. Keep 2.4 km target 11:00 / 4:35 per km / 1:50 per 400 m / 0:55 per 200 m; 10 km and Half Marathon stay unset. Sparse evidence has no fabricated trend. | MEDIUM |
| P-13 | Component mocks are called native accessibility proof | RNTL verifies role/name/state/activation; native renders prove 200% nonlinear scaling, focus, keyboard occlusion, target bounds and rotation. Add screenshot/interaction coverage at every required theme/size/state. | MEDIUM |
| P-14 | Small visual rows create undersized or overlapping touch targets | Actual native hit regions remain at least 48×48dp. Use semantic labels and non-color status. Calendar seven-column compact layout at 200% needs measured design work; any unavoidable fidelity change belongs in the deviation register. | MEDIUM |
| P-15 | Old benchmark scripts are treated as complete product performance proof | Retain stricter original interaction budgets; measure new root/calendar/editor/embedded-Garmin paths. Phase 5's 3 s launch script does not establish 1 s warm / 2 s cold interactive targets. Measure native release builds, frame times and actual feedback. | MEDIUM |
| P-16 | Old phase runners silently provide incomplete coverage | Phase 8 expects a Phase 2 manifest; Phase 9 embeds historical planning paths; release-matrix checks presence of old script names. Adapt explicit v1.2 ledgers/fixtures and validators instead of relabelling old reports. Derive required IDs from reviewed source contracts and reject missing/duplicate/skipped cases. | MEDIUM |
| P-17 | Passing v1.1 or Samsung observations are relabelled v1.2 proof | Record source/APK/manifest/device/fixture identity for new evidence. Samsung review is attended acceptance observation, separate from automated proof and release authorization. Historical reports remain historical. | MEDIUM |

## Minor Pitfalls

| ID | What goes wrong | Prevention | Confidence |
|---|---|---|---|
| P-18 | Screenshots differ because fonts, density, date or fixtures differ | Pin prototype revision, data/date/locale, viewport and native density; compare equivalent content areas; keep raw captures and image hashes. | MEDIUM |
| P-19 | New toast sits above a keyboard but covers Add/Complete or rest | Assert toast geometry, safe areas and dock intersection in every input/landscape/200% state; theme-aware copy stays readable. | MEDIUM |
| P-20 | Tests interact by screen coordinates that move at large text | Use stable semantic IDs and bounded visibility traversal; reserve coordinate traces for deliberate gesture geometry, then assert semantic outcome. | MEDIUM |
| P-21 | Empty/error/loading states reset filters, selected date or editor drafts | Keep source state and transient selection separate; error preserves entered values and context, Retry does not duplicate mutation. | MEDIUM |

## Phase-Specific Warnings

| Phase topic | Main risks | Required exit evidence / deeper research |
|---|---|---|
| Multi-active/Running domain | P-01, P-02, P-03, P-08 | ADR; schema-27 upgrade/rollback; independent schedules and collisions; all new facts/receipts round-trip and mark Drive dirty. High research need. |
| Shared visual/root shell | P-13, P-14, P-18 | Four exact roots; native target/focus/reflow matrix; shared tokens and overlays; no unsupported fifth tab. Native constraints need inspection. |
| Workout/Active | P-04, P-05, P-19 | Commit-bound row/dock parity, independent W/working ordinals, final collapse, protected history, legacy timing recovery, process death. |
| Calendar/animation | P-06, P-09, P-14 | Intermediate drag/morph evidence, transition cancellation, reduced-motion state sequence, exact route and read-only capabilities. High research need. |
| Library/creation/Running | P-10, P-11, P-21 | Every chooser entry, create/activate split, seven typed editors and restart persistence, all retained deep routes. |
| Progress/Garmin | P-07, P-08, P-12 | Embedded-client packaging/auth/read/restart, bounded JSON, idempotency/matching receipts, provenance and truthful goals. High implementation-proof need. |
| Native verification and future release | P-13, P-15, P-16, P-17 | New source-bound evidence ledger, all prototype states/configurations, numeric budgets, attended observations separated, unchanged signed bytes when later authorized. |

## Research Gaps and Evidence Limits

- MAP-01 and TIM-01 are settled. Remaining same-date collision, merge and matching behavior follows the executable ADR/plans; evidence gaps do not reopen those decisions.
- Real-account Garmin login/MFA/read/refresh behavior and the packaged ARM64 dependency chain remain unverified implementation evidence. A failure is a technical blocker, not permission to activate a different transport.
- Direct Expo SQLite documentation fetch returned HTTP 403; no external API assertion relies on that failed lookup. The application's private `BEGIN IMMEDIATE` writer is directly inspectable and is the relevant authority to preserve.
- Current Phase 12 source has bounded thresholds; historical verification and an earlier summary report different materialization timings. Use the executable thresholds and later raw identity-bound samples, not selected historical headline values.
- `DESIGN.md` and original design source establish interaction budgets, but several need new user-perceived measurement instrumentation. Proposed Calendar frame gates are identified as new in the native matrix.

## Sources

All local paths are relative to the designated planning worktree unless absolute. All source findings above are MEDIUM under the research confidence seam; direct code evidence is distinguished from future recommendations.

- `.planning/v1.2-OWNER-BRIEF.md`; `.planning/PROJECT.md`; `.planning/milestones/v1.1-phases/{08-session-overview-navigation,09-in-workout-exercise-editing,10-advanced-set-timing,11-portable-history-merge-restore,12-automatic-google-drive-sync}/*-VERIFICATION.md`.
- `src/platform/sqlite/{serializedWriter.ts,sqliteKernel.ts,migrationRunner.ts,recoveryBackup.ts,connection.ts}`; migrations 8, 19–27; repositories named above; `src/domains/portability/backupContracts.ts`.
- `jest.config.js`, `scripts/run-coverage-gate.mjs`, `scripts/benchmark-phase{1,2,3,4,5}.mjs`, `scripts/benchmark-phase12-backup.mjs`, `scripts/run-phase{8,9,12}-maestro.mjs`, `scripts/generate-phase7-attended-checklist.mjs`, `scripts/release-matrix-contract.mjs`.
- `/Users/bytedance/.gstack/projects/gym_tracker/bytedance-pre-git-design-20260815-132500.md:2342`; `/Users/bytedance/.gstack/projects/gym_tracker/bytedance-pre-git-eng-review-test-plan-20260815-224500.md`; `DESIGN.md`.
- `/Users/bytedance/.gstack/projects/fchoo-gym-tracker/designs/push-inspired-workout-20261001/approved-hybrid.html`; `design-audit-revision18/design-audit-revision18.md` in that directory. Interactive prototype review is supplied by the parallel UI research stream; this report read source/audit evidence only.
- [React Native performance](https://reactnative.dev/docs/performance), updated 2026-08-12; retrieved 2026-10-06: release-build measurement and 16.67 ms frame interval at 60 Hz. MEDIUM, cross-checked against native benchmark/source constraints.
- [Android accessibility](https://developer.android.com/guide/topics/ui/accessibility/apps), retrieved 2026-10-06: 48dp target guidance; [Android 14 font scaling](https://developer.android.com/about/versions/14/features), updated 2026-10-01: native nonlinear scaling and 200% testing. MEDIUM, cross-checked with owner/design requirements.
- `.planning/research/v1.2/GARMIN-MOBILE-FEASIBILITY.md` and its pinned python-garminconnect, Chaquopy and curl_cffi sources; real account/native behavior remains pending implementation evidence.

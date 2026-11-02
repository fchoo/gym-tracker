---
phase: 19-progress-parity
verified: 2026-10-14T00:00:00Z
status: passed
score: "5/5 roadmap success criteria verified; 32/33 plan truths verified"
requirements_score: "18/18 PRO requirements verified"
plan_truths_score: "32/33 verified; 0 failed; 1 Phase 20 deferred"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: "5/5 roadmap success criteria; 30/33 plan truths; 17/18 PRO requirements"
  gaps_closed:
    - "365ba691/0932f7c8 deduplicate non-load ExerciseHistory actions by unique (sessionId, sourceRevision), preserve deterministic first-seen order and every factual visit row, route exact positive revisions including repeated activation, guard invalid/missing identities, and retain the 3dp focus contract."
    - "The clean exact-HEAD host collector produced a PASS manifest with all seven commands passing and a requirement-specific 18/18 contract result."
    - "The retained verifier independently accepted the fresh source/tree identity, manifest artifacts, ordered PRO records, privacy/schema, and native NOT_RUN Phase 20 deferral."
  gaps_remaining: []
  regressions: []
gaps: []
deferred:
  - truth: "Native/device/attended Phase 20 acceptance evidence remains unexecuted."
    addressed_in: "Phase 20"
    evidence: "Fresh Phase 19 automated-only report has native_status=NOT_RUN, native_owner=phase20, and prohibited release/attended/Phase 20 acceptance claims."
---

# Phase 19: Progress Parity Verification Report

**Phase Goal:** The owner can understand factual Strength and imported Running progress, goals, gaps, and recommendations without invented evidence or silent target changes.

**Verified:** 2026-10-14

**Status:** passed

**Re-verification:** Yes — final source HEAD `0932f7c87a189e72db3f3a39e691644efddd9821` on `fchoo/UX-revamp`.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---:|---|---|---|
| 1 | All, Strength, and Running retain All/4 weeks/12 weeks selections and show comparable durable facts. | ✓ VERIFIED | Selected-period SQLite predicates, bounded All-time reads, and coherent snapshot loading remain present; collector coverage and prior focused SQLite regressions pass. |
| 2 | Strength and Running expose factual latest/best/target/gap/evidence/planned-next semantics; fixed/unset Running goals remain exact. | ✓ VERIFIED | Projection/root/pacing/default implementation remains intact; collector contract, typecheck, coverage, and prior focused projection/pacing/runtime/component checks pass. |
| 3 | Loading, empty, sparse/one-effort, missing-import, stale/rebuild, error, and retry states remain honest without missing-as-zero. | ✓ VERIFIED | Typed projection states, root/sheet state branches, factual-series zero suppression, and collector evidence tests pass. |
| 4 | Target and recommendation failures preserve drafts and explicit decisions persist once with revision checks and authoritative read-back. | ✓ VERIFIED | Target receipt/revision/read-back remains verified; PRO-15 now additionally runs the production recommendation repository on real SQLite and proves one receipt, replay, persisted decision state, and read-back. |
| 5 | Optional dated bodyweight is private, relative-only, explicitly editable/deletable, and cannot alter targets. | ✓ VERIFIED | Existing bounds/date/receipt/read-back/relative-only/target-isolation behavior remains covered by the collector coverage gate and prior tests. |

**Roadmap score:** 5/5 success criteria verified.

### PLAN Truths

| Plan | Verified | Failed | Deferred | Result |
|---|---:|---:|---:|---|
| 19-01 | 4 | 0 | 0 | ✓ |
| 19-02 | 3 | 0 | 0 | ✓ |
| 19-03 | 3 | 0 | 0 | ✓ |
| 19-04 | 3 | 0 | 0 | ✓ |
| 19-05 | 3 | 0 | 0 | ✓ |
| 19-06 | 3 | 0 | 0 | ✓ |
| 19-07 | 3 | 0 | 0 | ✓ |
| 19-08 | 3 | 0 | 0 | ✓ |
| 19-09 | 4 | 0 | 0 | ✓ |
| 19-10 | 3 | 0 | 1 | ✓ host evidence; native deferred |
| **Total** | **32** | **0** | **1** | **32/33 verified** |

## Blocker Re-verification

### ExerciseHistory source actions

Commit `365ba691`, merged at `0932f7c8`, closes the prior duplicate-action gap. `sourceIdentityKey()` accepts only a positive safe-integer `sourceRevision` and keys it with `sessionId`. A `Set` preserves deterministic first-seen order across comparable non-load sets, while every comparable set still renders its own factual visit text. Duplicate `(sessionId, sourceRevision)` pairs receive one action; unique identities receive one each.

The 14-test component suite independently proves:

- exactly one action for each unique valid identity;
- deterministic first-seen order;
- factual text for all repeated visits, including visits whose source action is deduplicated;
- exact callback arguments `(sessionId, sourceRevision)`;
- repeated activation invokes the same exact callback again;
- invalid/missing revisions render `Source unavailable` and do not route;
- corrected-effective rows route the positive revision without fabricating an invalid source;
- the existing load chart/source path remains one factual series with no duplicate source action added by the non-load renderer;
- the required 3dp focus ring remains present.

Command: `npm run test:components -- --runInBand src/ui/__tests__/ExerciseHistoryScreen.test.tsx` — **1 suite, 14 tests passed**.

### Requirement-specific parity and collector evidence

The former single-executor gap is closed. `runRequirementCase()` dispatches all 18 source-owned IDs independently. PRO-09 migrates/seeds a real SQLite history projection and reads it through `createProgressRepository`; PRO-10 reads corrected effective history through `loadEffectiveHistoryProjectionSessions`; PRO-15 seeds a recommendation graph and uses production `createWorkoutOutcomeRepository()` for receipt/replay/read-back. The injected Strength failure is isolated from the independently passing Running case.

The canonical collector was executed in a disposable clean worktree checked out at exact HEAD `0932f7c8`, with pinned Node `v24.19.0`, npm `11.17.0`, and lock-matched `npm ci --ignore-scripts`. It ran:

```text
node scripts/run-phase19-host-evidence.mjs --automated-only
```

The collector manifest reports `status=PASS` and all seven ordered commands pass:

| # | Command ID | Status | Exit |
|---:|---|---|---:|
| 1 | evidence-tests | PASS | 0 |
| 2 | progress-contract | PASS | 0 |
| 3 | benchmark | PASS | 0 |
| 4 | coverage | PASS | 0 |
| 5 | typecheck | PASS | 0 |
| 6 | boundaries | PASS | 0 |
| 7 | diff-check | PASS | 0 |

The emitted contract result reports `status=passed`, `total=18`, `passed=18`, `failed=0`, and `skipped=0`, in PRO-01 through PRO-18 order. The retained verifier was then executed with:

```text
node scripts/verify-phase19-evidence.mjs --automated-only --host-manifest artifacts/native/phase19/host/manifest.json
```

It returned `source_status=PASS`, `native_status=NOT_RUN`, `phase20_owned=true`, 18 host PASS requirement records, and no privacy/schema/identity error. No native PASS or release claim was produced.

### Fresh collector identity and hashes

| Evidence | Value |
|---|---|
| Source HEAD | `0932f7c87a189e72db3f3a39e691644efddd9821` |
| Source tree SHA-256 | `f5ce741410f171f79c55196246d65c9ae40722068d922225f7d19e16a850ffef` |
| Collector run ID | `37f31f6d9c49d994d6e26b9bcbd1c4cc7a6644b24c6b4c2098ebedfa0247d392` |
| `manifest.json` SHA-256 | `ac42b944a0cbefaff072d72ef66663f727eb487426dc4dd2028f818ca12213d2` |
| `contract-result.json` SHA-256 | `920fe00049c95b097c4c24c4f029713d0a59350b9c8b0469da62322d19bc570d` |
| `coverage-result.json` SHA-256 | `961a8241b8b5261ba314d0e69cc1651f749a5979ae9a9513c492e22175c8378d` |
| `benchmark-result.json` SHA-256 | `7d8abaf6d6659c38fcd8f47c8ae861b75b47c035311a8e3385791eca16f69f6d` |
| Retained verifier `host_manifest_sha256` | `578e918a421569fe3d80e55614d2c1737ecb961059b2e2e52a77a6d3d239bf96` |

## Required Artifacts and Wiring

| Artifact/link | Status | Evidence |
|---|---|---|
| `src/ui/screens/ExerciseHistoryScreen.tsx` → unique non-load source actions | ✓ VERIFIED | Immutable identity key, deterministic first-seen dedupe, exact routing, unavailable guards, and focus behavior pass. |
| `src/ui/__tests__/ExerciseHistoryScreen.test.tsx` → source behavior | ✓ VERIFIED | 14/14 tests cover unique/repeated identities, factual rows, callback replay, guards, corrected-effective routing, load path, and focus. |
| `src/testing/contracts/progressParity.contract.ts` → requirement executors | ✓ VERIFIED | Explicit PRO-01 through PRO-18 dispatch; PRO-09/10/15 use production real-SQLite paths. |
| `src/testing/contracts/progressParity.contract.test.ts` → host parity | ✓ VERIFIED | Collector command passes; contract result is ordered 18/18 PASS with failure isolation and privacy assertions. |
| `scripts/run-phase19-host-evidence.mjs` → retained host evidence | ✓ VERIFIED | Fresh clean-worktree collector manifest has seven PASS commands and exact source/tree identity. |
| `scripts/verify-phase19-evidence.mjs` → retained verifier | ✓ VERIFIED | Fresh manifest accepted; all 18 host records PASS, native records remain NOT_RUN/Phase20-owned, and schema/privacy checks pass. |

## Data-Flow Trace

| Surface | Data-flow result | Status |
|---|---|---|
| Non-load ExerciseHistory | Effective metric sets → unique source identity actions plus all factual visit rows | ✓ FLOWING |
| Load ExerciseHistory | SQLite metric facts → one immutable factual series/chart/data/source path | ✓ FLOWING |
| PRO-09 | Real SQLite projection tables → production progress repository → factual history summary | ✓ FLOWING |
| PRO-10 | Real SQLite effective history tables → production history loader → corrected source revision | ✓ FLOWING |
| PRO-15 | Real SQLite recommendation graph → production outcome repository → receipt transaction → replay/read-back | ✓ FLOWING |
| Other Progress surfaces | Durable SQLite → typed projections/runtime → UI | ✓ REGRESSION-PASSED |

No fixture-only product state was found. Parity fixtures are synthetic rows inserted into real SQLite and exercised through production repositories/commands; the emitted result contains hashes, counts, codes, timings, and IDs only, without raw personal/activity payloads.

## Behavioral and Regression Checks

| Check | Result | Status |
|---|---|---|
| ExerciseHistory focused suite | 1 suite, 14 tests passed | ✓ PASS |
| Canonical host collector | 7/7 commands PASS, exit 0 | ✓ PASS |
| Requirement parity result | 18/18 ordered PRO cases PASS | ✓ PASS |
| Retained verifier | Source PASS; native NOT_RUN; Phase 20 owned | ✓ PASS |
| Collector evidence tests | Included in command 01 and passed | ✓ PASS |
| Typecheck, boundary scan, diff check | Collector commands 05-07 passed | ✓ PASS |
| Prior selected-range/snapshot/target/root/recommendation/bodyweight checks | Quick-regressed by collector coverage, parity, typecheck, and prior focused tests | ✓ PASS |

## Decision, Test Quality, Requirements, and Prohibitions

Owner decisions remain settled: SQLite/source authority, one active plan per sport, approved 2.4 km target/pacing, and selected Garmin transport. No override or PLAN prohibition exists. The final parity test quality is independently evidenced by requirement-specific executors, real SQLite, production PRO-09/10/15 paths, receipt/replay/read-back assertions, failure isolation, 18 ordered records, privacy/schema validation, and fresh collector/verifier output.

All PRO-01 through PRO-18 requirements are verified: **18/18**. No unreferenced `TBD`, `FIXME`, or `XXX` marker was found in the changed Phase 19 implementation/evidence files. No raw personal/activity/bodyweight payload appears in the emitted evidence result.

## Deferred to Phase 20

The following remain explicitly deferred and do not prevent this Phase 19 pass:

| Deferred item | Phase 20 ownership |
|---|---|
| Android build/install, device identity, and real Expo SQLite device execution | Phase 20 SC1/SC3; VER-01/VER-07/VER-08 |
| Native Light/Dark/System, required viewport/orientation, 200% text, 48dp, D-pad/keyboard/Back/Escape, focus, and reduced motion | Phase 20 SC2; VER-02 through VER-06 |
| Device SQLite upgrade/restore/merge/process-death/offline/Garmin restart and matching | Phase 20 SC3; VER-07/VER-08/VER-10 |
| Native Calendar/representative workload performance and release performance | Phase 20 SC4; VER-11 |
| Attended Samsung and personal release-readiness review | Phase 20 SC5; VER-12/VER-13 |

The automated-only report intentionally states `native_status=NOT_RUN` and prohibits release, attended, aggregate-score, and Phase 20 acceptance claims.

## Gaps Summary

Both prior evidence gaps are closed at final HEAD. ExerciseHistory source actions are uniquely deduplicated and fully regression-tested. The clean exact-HEAD collector and retained verifier independently establish seven PASS host commands, ordered 18/18 PRO PASS records, exact source/tree identity, privacy/schema validity, and honest Phase 20 native deferral. Phase 19 is verified as passed.

---

_Verified: 2026-10-14_
_Verifier: Claude (gsd-verifier)_

# Phase 4 Context: Overall Progress and Complete Progression

## Phase goal

The owner can understand period-based training evidence and decide every approved progression recommendation without opaque scores, inaccessible charts, or silent plan changes.

## Locked decisions

- Treat SQLite session facts plus the Phase 3 effective-history overlay as the only authority. Period summaries, record lists, exercise statuses, recommendation views, caches, and diagnostics are rebuildable projections.
- Build the Progress landing page as a read tracer over existing revision-fenced history projections. It must never create an independent analytics source of truth.
- Offer only `4 weeks`, `12 weeks`, and `All time`. The first two ranges are civil-local-date windows ending on the supplied current local date; `All time` begins at the first included source row.
- Show facts, not a global score: scheduled opportunities completed, completed working sets, improving/holding/attention counts, recent metric-aware records, and one consistency trend. Never show aggregate kilogram volume, fitness/readiness, injury, or medical language.
- A summary, status row, record, and chart/table cell carries its source session/exercise IDs. Drill-downs use those IDs and the existing Session Detail / Exercise History routes.
- Projection freshness is explicit. If required history subjects are unavailable or behind their revision, Progress shows `Updating progress`; sparse inputs show `Baseline` or `Hold`, never a synthetic zero.
- Preserve the Phase 3 subject model: daily period rows plus the `period/all` subject are sufficient to compose bounded period windows. Do not create a second time-series write model unless the read-performance proof requires it.
- Weighted double progression is deterministic. It excludes warm-ups and noncomparable sets, requires every planned working set at the upper rep bound and `easy` / `on_target` effort before increasing, and makes incomplete/missing/hard/failed/regression/equipment-increment outcomes explicit.
- Non-load behavior remains policy-owned. Current starter content explicitly holds bodyweight, assistance, duration, variations, and unscored work until the owner changes them. The only automatic non-load analysis allowed in this phase is a named, versioned plan-authored comparator whose rule exists in a copied plan. Unscored work remains manual.
- Every actionable recommendation stores exact source evidence, named rule/version, current/proposed target, confidence/reason, target revision, and lifecycle. It can affect a future target only after a committed acceptance whose compare-and-swap target revision still matches. A manual edit wins and causes supersession.
- UI and route modules call only typed `WorkoutAppRuntime` capabilities. They may not import SQLite repositories.
- Retain the Gmail-like surfaces already accepted for the app: neutral grey canvas with white cards in light appearance, graphite grey canvas with near-black cards in dark appearance. Do not add dashboard-card grids merely to display individual values.
- Keep Android builds, native generation, emulator/device, Maestro, benchmarks, attended approval, and Terminal Seal deferred to the one final shared Phase 5 gate. No approval record may be created before literal lowercase `approved` from the owner.

## Source audit

| Concern | Existing source of truth / reusable foundation | Phase 4 implication |
|---|---|---|
| Effective history | `src/platform/sqlite/repositories/historyRepository.ts` | Read corrected active facts; voided sessions stay excluded. |
| Revision/freshness | `src/domains/history/historySubjects.ts`, `historyProjectionRepository.ts` | Compose 4/12/all windows only when required source subjects are current; otherwise show Updating. |
| Comparable metrics | `src/domains/history/projectionReducer.ts`, `src/domains/metrics/*` | Use existing profile comparators and exposure boundaries. Never create a universal load-times-reps metric. |
| Scheduled opportunities | persisted schedule opportunities already queried by history reads | Count only persisted opportunities in the selected civil range; do not infer a missed plan day. |
| Double progression | `src/domains/progression/loadRepsV1.ts` | Extend versioned branches rather than replace accepted baseline behavior. |
| Recommendation lifecycle | `workoutOutcomeRepository.ts`, migrations 0006/0010 | Generalize evidence/presentation safely; retain stored source and target revision fences. |
| Runtime boundary | `src/bootstrap/workoutAppRuntime.tsx` | Add typed progress reads and decisions there, never repository imports from screens/routes. |
| Existing UI | `RecommendationSurface.tsx`, Exercise History, Session Detail, theme primitives | Reuse actions/semantic components; build a factual progress screen, not a separate visual system. |

## Product and architecture review outcome

The inline scope/architecture/design review selected the existing-projection approach rather than a fresh analytics database. The alternative of computing every dashboard value directly from source facts would duplicate correction/lifecycle filtering and make stale work invisible. The alternative of adding a broad generic coaching engine would exceed the verified plan policy contract and would invent advice.

The chosen path is a right-sized reusable progress read model: one domain reducer over Phase 3’s comparable exposures and period inputs, one SQLite read repository that reports freshness and source drill-down IDs, typed runtime capabilities, and a Progress presentation that has text and table representations before any decorative chart.

### Data flow and failure posture

```text
effective session facts + schedule opportunities
                  |
                  v
Phase 3 subjects/revisions --> history rebuild effect --> current projection rows
                  |                                |
                  |                                +--> stale/unavailable -> Updating progress
                  v
Progress query reducer --> source IDs + factual rows --> runtime capability --> Progress UI
                  |
                  +--> empty/sparse -> Baseline or Hold (never zero-valued claim)

completed session + explicit effort
                  |
                  v
versioned policy evaluation --> stored recommendation evidence --> pending review
                  |                                             |
                  +--> non-actionable/manual -> explicit manual state
                                                                |
                              accept with matching target revision <--- owner
                                                                |
manual edit/correction/lifecycle change --> invalidate or supersede --------+
```

## Explicit non-goals

- No global fitness, readiness, strength, volume, injury, or medical score.
- No generic cardio, assistance, duration, or variation auto-progression.
- No silent update to a target, including from a pending, stale, rejected, invalidated, or superseded suggestion.
- No source-fact write from the Progress UI.
- No new physical/native evidence in this phase.

## Phase evidence strategy

- Domain reducers and policies receive 100% statement/branch/function/line coverage through the integrity gate.
- SQLite host tests prove exact migration behavior, targeted/full rebuild equivalence, freshness states, source drill-down identities, lifecycle invalidation, and target compare-and-swap.
- Component/route tests prove period controls, search, text/table/chart parity, non-color state language, loading/error/empty states, and 200%/keyboard semantics through current test utilities.
- The final physical/native evidence remains a shared Phase 5 gate and must bind the final unchanged candidate, not an intermediate Phase 4 build.

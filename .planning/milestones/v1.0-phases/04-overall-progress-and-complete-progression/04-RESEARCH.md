# Phase 4 Source-Grounded Research

## Existing implementation facts

1. `reduceHistoryProjection` already emits active effective period inputs and comparable metric exposures. Its reducer is invoked identically by targeted and full rebuilds.
2. `collectHistorySubjects` advances daily and all-time period subjects for every effective-history mutation. This is sufficient for 4-week and 12-week composition from a current all-time projection; no rolling-window source table is needed.
3. `HistoryProjectionRepository.loadFreshness` reports `current`, `updating`, and `unavailable` by matching applied and source revisions. Progress must surface those states rather than hide them.
4. Metric contracts already define profile-specific comparators, aggregation, and comparator boundaries. `assisted_reps`, fixed distance, fixed time, intervals, and timed holds are intentionally incomparable across their target-significant dimensions.
5. `loadRepsV1` presently covers baseline, hold, increase, retry, and manual branches, but needs complete regression/equipment fixtures and stronger result evidence semantics.
6. Current recommendations are stored with evidence/current/proposed JSON, source and target revisions, and lifecycle values. Acceptance already has a target revision guard but is currently load/reps shaped in repository presentation and mutation code.
7. Starter plans are explicit: assistance/bodyweight/timed holds generally use `manual_hold`; fixed distance, fixed time, and intervals use versioned `plan_authored` rules that preserve their named comparator dimensions. Unscored work is explicitly manual.

## Rule boundary

The research rejects a generic non-load progression engine. The safe Phase 4 implementation is a registry that accepts only reviewed policy IDs/version pairs and returns deterministic evidence. Unknown policy IDs or versions fail closed to a manual presentation with no generated actionable recommendation.

## Reusable UI constraints

- The approved Progress hierarchy is plain-language period summary, one full-width consistency trend, then ranked textual rows.
- Every visual trend requires equivalent text and accessible table output from the exact same view-model query.
- `Needs attention` means a decision is available, not an urgency or health judgment.
- Light content cards remain white on a grey canvas; dark cards remain near black on graphite.

## Risk controls

| Risk | Control |
|---|---|
| Stale projection presented as fact | Include freshness in every progress query and render `Updating progress` before totals/status claims. |
| Incompatible profile comparison | Use existing metric identity + comparator boundary and preserve source IDs. |
| Correction/void leaves old recommendation actionable | Reuse atomic invalidation and expand lifecycle tests across both recommendation graphs. |
| Manual plan edit overwritten by acceptance | Require source/target revision compare-and-swap and mark stale suggestion superseded. |
| Fake zero analytics for sparse history | Return explicit Baseline/Hold states with no chart point/aggregate substitute. |
| Unreviewed training advice | Registry rejects unknown policies; manual and unscored work never becomes automatic coaching. |

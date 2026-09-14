# Phase 4: Overall Progress and Complete Progression — Discussion Log

> **Audit trail only.** Planning and implementation use `04-CONTEXT.md`; this log records autonomous alternatives and selections authorized by the owner.

**Date:** 2026-08-25

**Phase:** 04-overall-progress-and-complete-progression
**Mode:** Owner authorized auto-advance and main-agent-only execution

## Progress source and period model

| Decision | Alternatives considered | Selected |
|---|---|---|
| Analytics authority | New analytics database; direct duplicate source queries; compose existing projections | Compose current Phase 3 effective-history projections with persisted schedule opportunities |
| Periods | Rolling timestamps; arbitrary filters; fixed civil windows | `4 weeks`, `12 weeks`, and `All time` by civil local date |
| Stale handling | Show stale numbers; clear to zero; explicit freshness | `Updating progress`, with no stale factual total presented as final |
| Sparse handling | Zero graph/score; hide all feedback; explicit factual state | Baseline or Hold, with no fabricated values |
| Drill-down identity | Aggregate-only rows; route reconstruction; source IDs in the view model | Retain source session/exercise IDs for existing detail routes |

**Auto-selected rationale:** Phase 3 already has one canonical reducer and revision-fenced effective facts. Reusing them prevents correction/void semantics from drifting into a second calculation path.

## Overall Progress presentation

| Decision | Alternatives considered | Selected |
|---|---|---|
| Information hierarchy | Statistic-card dashboard; long raw table; editorial summary + trend + factual rows | One plain-language Overall Progress summary, full-width consistency trend, then ranked textual lists |
| Trend accessibility | Visual chart only; separate manually-maintained table; shared view model | Visual/text/table variants from the same ordered source rows |
| Attention wording | Alert/safety language; hidden recommendation; calm review cue | `Needs attention` means a review is available, not a medical or urgent judgement |
| Search | New search index; client-side factual filter; no search | Client-side search over the loaded exercise-progress view model |
| Theme | New dashboard palette; existing Gmail-like surfaces | Neutral grey canvas + white cards in light, graphite + near-black cards in dark |

**Auto-selected rationale:** The surface should help the owner trace a claim back to a session or exercise, not reward scanning opaque numbers.

## Progression rules and non-load boundaries

| Decision | Alternatives considered | Selected |
|---|---|---|
| Weighted progression | Average-set threshold; any good set; all planned comparable working sets | Increase only when every planned comparable working set reaches upper bound with Easy/On target effort and an available increment |
| Missing/regression evidence | Guess a change; hide result; versioned explicit outcome | Baseline/hold/retry/manual outcome with named reason/evidence |
| Warm-up treatment | Include in analysis; silently downweight; exclude | Exclude warm-ups from comparable evidence/records/progression |
| Non-load behavior | Generic cardio/assistance engine; all manual; plan-authored registry | Only named copied-plan policy ID/version/rule is evaluated; otherwise manual |
| Unknown/mismatch policy | Best-effort inference; generic hold/increase; fail closed | Manual non-actionable outcome with no automatic target mutation |

**Auto-selected rationale:** The owner-approved content distinguishes target-significant profiles. A generic engine would erase that distinction and produce advice with no reviewed basis.

## Stored recommendation lifecycle

| Decision | Alternatives considered | Selected |
|---|---|---|
| Evidence shape | Load/reps-only JSON; implicit calculations; versioned generic envelope | Versioned evidence with rule, metric identity, source IDs, revisions, targets, decision/reason/confidence, and lifecycle |
| Pending display | Substitute recommendation into Today; hide until accepted; quiet review surface | Quiet pending review in Today and Progress; current target remains accepted target |
| Acceptance | Write target first; UI optimistic write; transaction compare-and-swap | One committed transaction validates pending/actionable/source/target revision before target and lifecycle change |
| Manual edit race | Last writer wins; retry blindly; manual wins | Supersede stale recommendation and preserve manual target |
| History lifecycle impact | Wait for next launch; leave pending; atomic invalidation | Correct/void/restore/policy/identity changes invalidate or supersede before acknowledgement |

**Auto-selected rationale:** A recommendation is a derivative and audit record, never authority to overwrite the owner’s plan.

## Deferred

- Android build/APK/native generation, Maestro/device/emulator runs, device benchmarks, physical accessibility/visual review, attended approval, and Terminal Seal: one final shared Phase 5 gate.
- Backup, restore, CSV export, distribution, signed-artifact promotion: Phase 5.
- Any global score, medical language, generic coaching, automatic unreviewed non-load progression, permanent history delete, or source-fact write from Progress: out of scope.

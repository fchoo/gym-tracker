---
phase: 03-calendar-and-history-integrity
status: validated
validated: 2026-08-24
plans: [03-01, 03-02, 03-03, 03-04, 03-05]
requirements: [HIST-01, HIST-02, HIST-03, HIST-04, HIST-05, HIST-06, HIST-07, HIST-08, HIST-09]
---

# Phase 3 Plan Validation

## Verdict

PASS — five executable plans cover all nine Phase 3 requirements exactly once as primary owners. The graph is deliberately serialized because every mutable command depends on the same effective-history and revision-fenced rebuild contract.

## Requirement Ownership

| Owner plan | Requirements | Proof focus |
|---|---|---|
| 03-01 | HIST-01, HIST-02, HIST-03 | Civil-date effective reads, Calendar states/counts, timezone-stable original metadata |
| 03-02 | HIST-04 | Comparable metric history, profile/comparator boundaries, separate warm-ups |
| 03-03 | HIST-08, HIST-09 | Atomic revision/effect fan-out and targeted/full canonical reducer equivalence |
| 03-04 | HIST-05, HIST-06 | Complete correction matrix, immutable originals, append-only audit ledger |
| 03-05 | HIST-07 | Reversible completed-session void/restore and Removed sessions surface |

## Dependency and Execution Order

03-01 effective facts and Calendar
  → 03-02 metric-aware history
  → 03-03 subjects, rebuild reducer, and effects
  → 03-04 correction and audit
  → 03-05 void/restore and exact-HEAD automated evidence

The apparent roadmap grouping is decomposed into execution waves 1 through 5. This prevents a UI or mutation path from reading an unproven overlay, bypassing subject invalidation, or creating native evidence before all Phase 3 source changes settle.

## Architecture Review Findings Folded In

- Effective snapshots are complete, canonical overlays over immutable original session facts; finalized source rows are never rewritten.
- Old and new snapshot subjects are both revised, so date moves, exercise replacement, void, and restore cannot miss affected records, metrics, period inputs, or recommendations.
- Migration 0013 owns schema permission for the new durable rebuild effect; the handler remains stale-fenced both before claim completion and immediately before derived writes.
- Targeted and full rebuild both call one reducer and compare canonical rows rather than comparing selected dashboard values.
- Projection consumers expose Current, Updating, or Unavailable. They never render stale derived values as final or invent zero data.
- The UI uses existing civil date, numeric input, confirmation, theme, adaptive, focus, and non-color primitives. Removed sessions receives a reachable minimal More route rather than an orphan deep link.

## Validation Checks

- [x] Every HIST requirement has exactly one primary plan owner.
- [x] Every plan has a bounded objective, dependencies, task-level acceptance criteria, and automated verification commands.
- [x] Every source mutation has transaction, rollback, stale-revision, and post-commit-derived-work coverage.
- [x] Calendar, correction, removal, restoration, history, and metric presentation include loading/error/empty/conflict/adaptive/accessibility states.
- [x] No plan introduces permanent history deletion, timezone reinterpretation, automatic metric conversion, dashboard scope, raw UI SQLite imports, or attended approval.
- [x] Phase 3 native evidence is delayed until source stabilization and cannot record the Phase 2 terminal seal or a human/device approval.

## Deferred Verification

Physical/device review remains a single final attended gate after Phase 5. Phase 2's existing deferred terminal-seal workflow remains untouched; this planning checkpoint creates no attended evidence and does not change any implementation identity.

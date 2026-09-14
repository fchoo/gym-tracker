# Phase 3: Calendar and History Integrity - Discussion Log

> **Audit trail only.** Planning and implementation use 03-CONTEXT.md; this log records the autonomous alternatives and selections authorized by the owner.

**Date:** 2026-08-24  
**Phase:** 03-calendar-and-history-integrity  
**Mode:** Owner authorized auto-advance and main-agent-only execution

## Historical source model

| Decision | Alternatives considered | Selected |
|---|---|---|
| Corrected history storage | Rewrite session rows; immutable original plus overlay/audit; copy whole sessions | Immutable originals plus revisioned effective overlay and append-only audit |
| Date behavior | Recompute old dates from device zone; preserve old dates; preserve only instants | Preserve original civil dates, timezone, timestamp, and creation offset; corrections are explicit overlays |
| Corrected-set identity | Replace row IDs; omit identity; retain stable/set-owned IDs | Retain original IDs and assign correction-owned IDs only for additions |
| Future interpretation | One-off mutation code paths; source-backed effective adapter | One effective-history adapter for Calendar, detail, metrics, and future period inputs |

**Auto-selected rationale:** This preserves forensic truth and permits deterministic replay without moving visits when device timezone changes.

## Correction scope and audit

| Decision | Alternatives considered | Selected |
|---|---|---|
| Editable sessions | All statuses; final completed/partial only; active only | Completed and partial only; active-session edits remain Phase 2 |
| Correction scope | Values only; values + timing; full approved matrix | Values, set kind/add/remove, replacement, date/time, effort, notes, and valid plan association |
| Metric conversion | Convert automatically; block all replacements; explicit contract entry | No inference; replacement requires valid explicit identity and values |
| Audit display | Always-expanded log; hidden audit; discreet disclosure | Corrected label plus Correction history disclosure |

**Auto-selected rationale:** The complete matrix meets the requirement without compromising metric identity or overwriting the original snapshot.

## Removal and recovery

| Decision | Alternatives considered | Selected |
|---|---|---|
| Removal | Permanent delete; hide only; reversible void | Confirmation-gated reversible void with retained facts |
| Default Calendar | Include removed work dimmed; exclude it; delete it | Exclude voided work; show only in Removed sessions |
| Restore | Recreate new session; restore retained snapshot; irreversible | Restore the exact retained effective snapshot with a lifecycle audit event |

**Auto-selected rationale:** A void/restore lifecycle avoids accidental history loss and makes removal reversible.

## Derived state and recommendation safety

| Decision | Alternatives considered | Selected |
|---|---|---|
| Rebuild scope | Always full rebuild; targeted only; targeted plus equivalence proof | Targeted durable effects backed by full-rebuild equivalence fixtures |
| Stale worker output | Last writer wins; retry blindly; expected revision gate | Reject/supersede stale output by expected subject revision |
| Recommendation invalidation | On next launch; after UI refresh; before acknowledgement | Atomically invalidate affected pending recommendations before acknowledgement |
| Projection presentation | Show stale values as current; clear to zero; explicit freshness | Use factual data or Updating history; never imply stale values are final |

**Auto-selected rationale:** The owner’s source-of-truth rule requires every correction path to commit facts and invalidation before UI acknowledgement.

## Calendar and accessibility presentation

| Decision | Alternatives considered | Selected |
|---|---|---|
| Month treatment | Instant-based date grid; native dependency; civil in-app grid | Civil LocalDate grid using current in-app calendar primitives |
| State encoding | Color only; glyph only; text/glyph/border | Text/accessibility label plus non-color glyph/border treatment |
| Selected-day content | Aggregate dashboard; factual session rows; no detail | Factual sessions/visits with actual exercise and working-set completion counts |
| Theme | New dashboard palette; existing grey/white-black cards | Existing grey canvas with white Light cards and near-black Dark cards |

**Auto-selected rationale:** This keeps Calendar chronological and accessible rather than turning it into Phase 4 analytics.

## Deferred

- Overall period dashboards, charts, recommendation breadth, and presentation of period summaries: Phase 4.
- Backup/restore/export/release approval: Phase 5.
- Permanent deletion and automatic metric conversion: out of scope.

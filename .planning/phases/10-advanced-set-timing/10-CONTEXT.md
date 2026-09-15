# Phase 10: Advanced Set Timing - Context

**Gathered:** 2026-09-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Let the owner configure **per-repetition cadence** and **cluster-set intra-rest**
timing on an exercise or set through a separately reviewed, versioned timer state
machine that is **distinct from between-set rest** (WORK-26). Both modes ship in
v1.1 (owner Q10). Cues are **advisory only** — they never become authoritative
for recorded set/rest facts; SQLite stays the source of truth and
denied/failed audio never corrupts the session.

**Out of scope:** the between-set rest timer (v1.0, unchanged), the overview
layout (Phase 8), exercise editing (Phase 9), sync/backup (Phases 11–12).
</domain>

<decisions>
## Implementation Decisions

### Cue channel
- **D-01:** Per-rep cadence cue is **owner-configurable: haptic, audio, or
  both**. Haptic works phone-down/in-pocket; audio for quiet rooms; both for
  noisy gyms. Reuse the existing haptics port and the rest-cue audio port. —
  **Reversibility:** reversible.

### Timer semantics (owner decisions carried from REQUIREMENTS.md)
- **D-02:** **Per-rep mode** emits one cadence cue per repetition at a
  configurable tempo. **Cluster mode** inserts short fixed intra-set rests
  (e.g. 3+3+3) and is recorded as **one set, not multiple** (Q11). Modes are
  configurable per exercise AND per set, persist with the plan/session, and
  survive backgrounding and process death.
- **D-03:** Advanced timing is a **separate versioned state machine** from the
  v1.0 between-set rest machine — it must not regress or entangle rest. —
  **Reversibility:** costly — a shared/entangled implementation would be hard to
  disentangle later and risks the v1.0 rest guarantees.

### Advisory-only invariant
- **D-04:** Cues are advisory: recorded set/rest facts are unaffected by
  timing cues; denied or failed audio/haptics never roll back or corrupt the
  session or the rest state machine. Mirrors the v1.0 "effects never redefine
  committed state" rule. — **Reversibility:** one-way — this is a
  data-integrity contract.

### Claude's Discretion
- The tempo/interval configuration UI (where it lives on the exercise/set), the
  cluster grouping notation, and the persistence table shape — planner decides,
  provided per-exercise + per-set config, lifecycle survival, versioning, and
  the advisory-only invariant all hold.
- Default tempo / default cluster pattern values.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — WORK-26 text; owner Q10 (both modes) and Q11
  (cluster = one recorded set); the "effects never redefine committed state"
  cross-cutting constraint.
- `.planning/ROADMAP.md` §"Phase 10: Advanced Set Timing" — goal + 4 success
  criteria (verification anchor).
- `.planning/design/v1.1-UX-FLOW.md` §8 — advanced timing summary (advisory
  cues, small timer indicator, own-phase UX).

### v1.0 timing / effect contracts to mirror (NOT modify)
- `src/domains/rest/restState.ts` + `restState.test.ts` — the versioned rest
  state machine to model the new timer machine on (and stay distinct from).
- `src/domains/rest/restCountdownCuePort.ts` — `RestCountdownCuePort`: the
  advisory audio-cue port pattern to reuse for cadence/cluster cues.
- `src/domains/rest/restCommands.ts` — command shape for lifecycle-safe timer
  transitions.
- `src/domains/workout/hapticsPort.ts` — haptics port for the haptic cue channel.
- `src/ui/components/RestDock.tsx` — how a running timer is surfaced/docked;
  the small timer indicator can follow this precedent.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `restState.ts` is already a versioned, lifecycle-surviving state machine with
  full-coverage tests — the direct template for the advanced-timing machine
  (D-03 keeps them separate but structurally parallel).
- `RestCountdownCuePort` + `hapticsPort` give both cue channels (D-01) without
  new native dependencies.
- `RestDock` shows how a live timer survives rotation/background and reconciles
  after commit — reuse the lifecycle discipline.

### Established Patterns
- Rest timing already persists `session_rest_states` with a `version` and
  `revision` and reconciles after process death — advanced-timing persistence
  follows the same append/reconcile pattern.
- Effects (audio/haptics/notifications) are already treated as non-authoritative
  — D-04 extends the same rule.

### Integration Points
- Per-exercise/per-set config attaches to the Phase 9 exercise/set model and the
  plan authoring path (so it "persists with the plan/session").
- The overview (Phase 8) shows only a small timer indicator; no layout change.
</code_context>

<specifics>
## Specific Ideas

- Cluster example the owner cited: **3+3+3** with fixed intra-set gaps, recorded
  as a single set.
- Keep it advisory — a metronome-like helper, never a gate on completing a set.
</specifics>

<deferred>
## Deferred Ideas

- Tempo-based eccentric/concentric split cues (e.g. 3-1-1-0 tempo notation) —
  beyond per-rep cadence; backlog.
- Auto-detecting reps to drive cadence — backlog.

</deferred>

---

*Phase: 10-Advanced Set Timing*
*Context gathered: 2026-09-15*

# Phase 15: Workout Parity - Context

**Gathered:** 2026-10-06
**Status:** Ready for UI specification and planning

<domain>
## Phase Boundary

Reproduce the approved Workout root, Active Workout, completion, recovery, and
their preserved deep actions on Phase 13 facts and Phase 14 presentation. No
Calendar month work, Running authoring, FIT parsing, or Progress analytics.

</domain>

<decisions>
## Implementation Decisions

### Workout root and active list
- **D15-01:** Warm editorial Workout shows real current identity/action immediately, then the full scrollable exercise preview. Running plan and Garmin are contextual entries.
- **D15-02:** Active Workout is one vertically scrollable session. Full long names wrap to two lines; headers own grip/name/metadata/trend/menu.
- **D15-03:** One continuous 4dp yellow active-exercise edge is the only structural marker. Current set uses amber fill, highlighted number, clock, and accessible Current state—never a second stripe.
- **D15-04:** Warm-ups precede working sets, number W1/W2 independently, and insert after warm-ups. Working sets remain 01/02 and alone drive working progress/rest.

### Commands and recovery
- **D15-05:** Tap any set row to edit; no Edit button. Explicit Save applies the correct shipped metric profile. Complete acknowledges only the committed result and preserves values on failure.
- **D15-06:** Add Exercise and Complete Set share the compact bottom row. Rest replaces it with a full-width dock containing countdown, −15, +15, Pause/Resume, Skip.
- **D15-07:** Final committed set collapses the exercise. Toasts never cover the dock. Drag reorder retains Move up/down alternatives and cancelled gestures do not commit.
- **D15-08:** Exercise menu contains only flat between-set rest (`sec`), replace, delete. Trend stays separate. No cadence, rest-between-reps, nested Advanced Timing, or plan cue settings.
- **D15-09:** Preserve add/replace/delete, corrections, Undo recovery, finish complete/partial/later, discard, completion evidence, and explicit default-No plan write-back.

### Owner-review checkpoint
- **TIM-01:** Retain legacy cadence/cluster facts and resume set/pointer/rest state. Disabling hidden authoring/reconciliation/playback is proposed and must be checkpointed with tests before removal.

### Claude's Discretion
- Internal component boundaries when existing primitives own the same behavior.

</decisions>

<canonical_refs>
## Canonical References

- `.planning/v1.2-OWNER-BRIEF.md` — exact Workout contracts.
- `.planning/REQUIREMENTS.md` — WRK-01 through WRK-36.
- `.planning/design/v1.2-prototype-parity-matrix.md` — every route/state mapping.
- `.planning/design/v1.2-SOURCE-PRECEDENCE.md` — Revision 18 indicator/timing decisions.
- `.planning/architecture/v1.2-multi-active-plans.md` § Legacy cadence/cluster compatibility.
- Prototype selectors/screens in `.planning/design/v1.2-prototype-inventory.json`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ActiveWorkoutScreen`, `SetRow`, `RestDock`, workout route/runtime command ports.
- Session exercise editing, correction, reorder, completion, and recovery repositories from Phases 8-10.
- Metric editors and exact commit/revision/idempotency contracts.

### Integration Points
- Phase 13 selected occurrence/session provenance; Phase 14 shell/tokens; Phase 16 read-only detail reuse.

</code_context>

<specifics>
## Specific Ideas

The normal gym-floor path should be understandable in three seconds and complete
a set through one dominant action, with recovery states visible in place.

</specifics>

<deferred>
## Deferred Ideas

No in-app run recorder, per-rep cadence, nested timing screen, or new progression logic.

</deferred>

---
*Phase: 15-workout-parity*
*Context gathered: 2026-10-06*

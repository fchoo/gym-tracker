# Phase 17: Library & Running Plans - Context

**Gathered:** 2026-10-06
**Status:** Ready for UI specification and planning

<domain>
## Phase Boundary

Deliver Plans/Exercises Library parity, preserve all shipped deep routes, and add
inactive Strength/Running creation plus persistent structured Running plan/session
authoring, schedules, activation, and collision choices. No FIT transport/detail.

</domain>

<decisions>
## Implementation Decisions

### Library and creation
- **D17-01:** Preserve remembered Plans/Exercises, search/filter/favorite/scroll state, grouped active/inactive/starter/custom identities, and all existing editor/impact/migration routes.
- **D17-02:** Every Create plan entry—including true empty Plans—opens the same neutral chooser: Strength or Running.
- **D17-03:** Creation/save/duplicate/import is inactive. Activation is a separate explicit confirmation with current revisions and schedule impact.

### Structured Running
- **D17-04:** Running creation captures goal distance/time, benchmark provenance, optional target date, frequency/available days, long-run day, and optional weekly distance. No gender/height.
- **D17-05:** Sessions are typed Recovery, Long run, Progression, Tempo, Intervals, Hills, Fartlek with common Day/Warm-up/Cool-down/intensity and only their contextual fields.
- **D17-06:** Sessions have stable identities; add/edit/delete/reorder persist locally. Deleting the final session produces a true empty plan and never restores defaults.
- **D17-07:** Multiple ordered sessions on one weekday are valid and survive reopen/backup. Future edits create prospective revisions without changing past occurrences.
- **D17-08:** Move run, Move strength, Keep both are explicit schedule decisions; no coaching/medical judgment is inferred.

### Claude's Discretion
- Exact form decomposition and validation helpers, provided the prototype copy and state coverage remain traceable.

</decisions>

<canonical_refs>
## Canonical References

- `.planning/v1.2-OWNER-BRIEF.md` — Library/Running contracts.
- `.planning/REQUIREMENTS.md` — LIB-01 through LIB-36.
- `.planning/design/v1.2-prototype-inventory.json` — deep routes and session selectors.
- `.planning/design/v1.2-prototype-parity-matrix.md` — state/test mapping.
- `.planning/architecture/v1.2-multi-active-plans.md` — session revisions/activation/collision identities.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/(tabs)/library.tsx`; owned/starter/exercise detail/create/edit/schedule/impact routes.
- Existing aggregate-save draft editors, revision guards, drag reorder, search/filter chips and lifecycle commands.
- Phase 13 typed Running plan/session/schedule ports; Phase 14 shared form/sheet tokens.

### Integration Points
- Phase 18 match candidates reference exact persisted Running session opportunities.

</code_context>

<specifics>
## Specific Ideas

Running forms show only fields the selected session type needs; one generic text
blob is not an acceptable substitute for structured sessions.

</specifics>

<deferred>
## Deferred Ideas

Running rotation, plan recommendations, Garmin workout push, and automatic activation.

</deferred>

---
*Phase: 17-library-running-plans*
*Context gathered: 2026-10-06*

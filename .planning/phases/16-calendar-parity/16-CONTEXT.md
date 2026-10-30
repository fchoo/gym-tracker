# Phase 16: Calendar Parity - Context

**Gathered:** 2026-10-06
**Status:** Ready for UI specification and planning

<domain>
## Phase Boundary

Build the full-height month/focused Calendar, gesture/motion state machine,
compact agendas, and read-only detail routing from Phase 13 events and Phase 15
presentation. Calendar never gains correction or workout mutation authority.

</domain>

<decisions>
## Implementation Decisions

### Month and event encoding
- **D16-01:** Monday-first month fills all space above bottom navigation. Info is immediately before Settings and opens a Calendar key dialog; no inline legend.
- **D16-02:** Strength is orange and Running blue. Complete is solid/tinted, Partial dotted half-filled, Planned transparent dashed; text/accessibility labels carry status without color.
- **D16-03:** Month/focused rows share fixed date and event tracks, top inset, titles, selected/today semantics, and measured row height. Up to two titled events remain visible in selected and adjacent weeks.

### Gesture and spatial state machine
- **D16-04:** Previous/current/next panels follow horizontal pointer displacement 1:1. Title switches at exactly 25%; moving below or cancelling reverses it immediately. Short fast drags snap back; vertical intent scrolls.
- **D16-05:** Month settle is 240ms with the prototype easing. Date expansion moves selected row to top and following row to bottom; collapse reverses both to measured positions.
- **D16-06:** Adjacent-week selection is collapse → select/focus in month → expand new week. Reduced motion performs identical state changes without row movement.

### Routing and authority
- **D16-07:** Agenda rows are one compact full-width target with no nested actions. Planned Strength opens an occurrence preview; Strength history opens read-only Active-shaped detail; planned Running opens plan detail; imported Running opens Garmin detail.
- **D16-08:** Correction, resume, revision history, and removal remain separate management contexts. Back restores the expanded Calendar state and trigger focus.

### Final owner decisions
- **DEV-01:** Approved `adaptive-6-to-18dp`: Calendar horizontal padding is `min(18, max(0, (safeWidth - 348) / 2))` dp, producing 6dp at 360 and 18dp at 390, with 2dp cell gaps. Native geometry/accessibility proof remains an implementation gate.
- **DEV-02:** Approved `accessible-9b470b`: Light Strength event-title text is `#9B470B`; border/rail/swatch stays `#D97820`, and Dark remains unchanged. Native blended-fill/contrast proof remains an implementation gate.

</decisions>

<canonical_refs>
## Canonical References

- `.planning/v1.2-OWNER-BRIEF.md` — exact Calendar sequence and states.
- `.planning/design/v1.2-SOURCE-PRECEDENCE.md` — threshold/legend/transition precedence.
- `.planning/design/v1.2-DEVIATIONS.md` — approved DEV-01/02 values and technical verification status.
- `.planning/design/v1.2-browser-evidence/calendar-pointer-evidence.json` — observed 1:1 and 25% title behavior.
- `.planning/verification/v1.2-native-verification-matrix.md` — NV-CAL evidence.
- `.planning/design/v1.2-prototype-parity-matrix.md` — route/state mappings.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Existing civil-date Calendar route/query and explicit LocalDate utilities.
- Gesture Handler/Reanimated/Worklets for native pointer tracking and measured row transitions.
- Phase 15 read-only exercise/set presentation with a capability that exposes no mutation ports.

### Integration Points
- Phase 13 aggregated typed events and schedule identities; root focus/appearance from Phase 14.

</code_context>

<specifics>
## Specific Ideas

Calendar motion is spatial continuity, not decoration: intermediate geometry and
threshold/title state need native evidence, not only final screenshots.

</specifics>

<deferred>
## Deferred Ideas

Calendar correction controls, generic timeline redesign, and automatic activity matching are out of scope.

</deferred>

---
*Phase: 16-calendar-parity*
*Context gathered: 2026-10-06*

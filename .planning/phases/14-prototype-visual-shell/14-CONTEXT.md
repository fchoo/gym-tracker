# Phase 14: Prototype Visual Shell - Context

**Gathered:** 2026-10-06
**Status:** Ready for UI specification and planning

<domain>
## Phase Boundary

Create the shared Revision 18 visual/navigation foundation: exactly four roots,
appearance, typography, tokens, sheets/dialogs/toasts, startup states, and access
to shipped settings/recovery routes. Feature-specific Workout, Calendar, Library,
Garmin, and Progress content belongs to later phases.

</domain>

<decisions>
## Implementation Decisions

### Shell and appearance
- **D14-01:** Root destinations are exactly Workout, Calendar, Library, Progress. Keep the approved bottom-navigation composition at every target width; no Profile, Running, Garmin tab, or automatic rail substitution.
- **D14-02:** Use bundled Archivo variable typography and IBM Plex Mono numerals with the prototype's exact Light/Dark semantic tokens. System remains supported and reacts to OS changes.
- **D14-03:** Root switches happen in place and retain destination-specific query/filter/scroll state; deep routes restore the owning destination and trigger focus.
- **D14-04:** Shared sheets/dialogs trap focus, support Back/Escape, avoid the keyboard, and restore focus. Theme-aware top toasts sit below the top bar and never cover the workout dock.

### Preserved capabilities
- **D14-05:** App Settings visibly starts with Appearance while retaining routes for rest alerts, removed sessions, data/recovery, Drive backup, CSV, privacy, and their existing recovery states.
- **D14-06:** SQLite trust/loading/failure and notification-permission/continue-without-alerts startup behavior remains factual; visual caches are rebuildable.

### Owner-review checkpoint
- **DEV-02:** The measured Light Calendar Strength-title color adjustment is proposed, not accepted. Shared token work may expose a specific accessible text token but must not treat the color change as approved.

### Claude's Discretion
- Internal token/component naming and the smallest refactor that avoids parallel visual systems.

</decisions>

<canonical_refs>
## Canonical References

- `.planning/v1.2-OWNER-BRIEF.md` — root/appearance/accessibility contracts.
- `.planning/design/v1.2-SOURCE-PRECEDENCE.md` — resolved visual conflicts.
- `.planning/design/v1.2-DEVIATIONS.md` — pending deviations.
- `.planning/design/v1.2-prototype-inventory.json` — controls/tokens/routes.
- `.planning/design/v1.2-browser-evidence/serial-walk.json` — Light/Dark route observations.
- External `approved-hybrid.html` CSS and Revision 18 `approved.json` — presentation oracle.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/(tabs)/_layout.tsx`, `AppTabs`, `AdaptiveScreen`, `ScreenHeader`, `NavigationRow`.
- Existing appearance preference/runtime and Lucide icon conventions.
- Existing settings/data-and-recovery routes listed in the parity matrix.

### Integration Points
- Every Phase 15-19 screen consumes these tokens, shell, overlay and focus contracts.

</code_context>

<specifics>
## Specific Ideas

The app should feel like the prototype's warm editorial paper/dark instrument,
with restrained surfaces and one hierarchy rather than generic Material cards.

</specifics>

<deferred>
## Deferred Ideas

Feature content and Calendar-specific DEV-01 geometry remain in their owning phases.

</deferred>

---
*Phase: 14-prototype-visual-shell*
*Context gathered: 2026-10-06*

# Phase 6: Material 3 UX Remediation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-31
**Phase:** 06-material-3-ux-remediation
**Areas discussed:** Library discovery, Search, Calendar and date picking, reorder interaction, large text, runtime recovery, release boundary

---

## Library discovery

| Option | Description | Selected |
|---|---|---|
| M3 chip-first | Visible filter chips, standalone Favorite, overflow taxonomy, pull-to-refresh | ✓ |
| Repair current sheet | Retain current action row and only add selection colors | |

**User's choice:** Explicitly requested Material 3 chips, standalone Favorite, pull-to-refresh, filled green selected star, and no browse-row source/version metadata.

## Search

| Option | Description | Selected |
|---|---|---|
| Shared M3 Search | One reusable component across every search surface | ✓ |
| Screen-local restyling | Independently restyle existing fields | |

**User's choice:** Explicitly requested all search inputs use Material 3 Search.

## Calendar and date picking

| Option | Description | Selected |
|---|---|---|
| Complete swipeable grid | Adjacent-month dates, swipe, button fallback, M3-inspired dialog | ✓ |
| Button-only current-month grid | Preserve current interaction | |

**User's choice:** Explicitly requested adjacent days, horizontal month swipe, and a Google Calendar-style date picker dialog.

## Reorder interaction

| Option | Description | Selected |
|---|---|---|
| Continuous drag plus fallback | Touch-and-hold drag, visible displacement, up/down accessibility actions | ✓ |
| Threshold step gesture | Keep the current one-position-on-release gesture | |

**User's choice:** Explicitly requested touch-and-hold reorder and a compact single-line icon/label layout.

## Audit-discovered blockers

| Option | Description | Selected |
|---|---|---|
| Include in Phase 6 | Fix 200% root-nav clipping, Progress failure, and ambiguous duplicate More entry | ✓ |
| Defer | Implement only the original eight findings | |

**User's choice:** Approved proceeding with the complete design/implementation after reviewing the whole-app audit.

## Release boundary

| Option | Description | Selected |
|---|---|---|
| Rebuild and verify, then stop | Produce replacement APK and evidence; keep approval/promotion explicit | ✓ |
| Auto-promote | Publish immediately after automated tests | |

**User's choice:** The end goal remains an installable APK; prior release promotion is paused during remediation.

## Claude's Discretion

- Internal component boundaries, exact animation implementation, and Progress root-cause repair after diagnosis.
- Responsive reflow details when 200% text cannot preserve a literal one-line row.

## Deferred Ideas

- No new product capabilities were added beyond the audit findings.

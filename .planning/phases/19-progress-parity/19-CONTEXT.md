# Phase 19: Progress Parity - Context

**Gathered:** 2026-10-06
**Status:** Ready for UI specification and planning

<domain>
## Phase Boundary

Render factual All/Strength/Running progress, ranges, goals, evidence, explicit
recommendations, and optional bodyweight from Phase 13/18 facts. Do not create a
second analytics authority or readiness/composite scores.

</domain>

<decisions>
## Implementation Decisions

### Evidence and goals
- **D19-01:** Tabs are All, Strength, Running; ranges are 4 weeks, 12 weeks, All time. Preserve selection/focus and source-error recovery.
- **D19-02:** Show Latest, Best, Target, Gap, goal-line history, Evidence and Next target only when comparable durable facts exist.
- **D19-03:** Honest states include loading, empty, sparse, More data needed, rebuild pending, and error/retry. Missing values never plot as zero.
- **D19-04:** The 2.4 km goal stays 11:00 (4:35/km, 1:50/400m, 0:55/200m). 10 km and Half Marathon targets remain unset until owner entry.
- **D19-05:** Running best efforts come from accepted imported activities. No fixture, schedule intent, or unmatched estimate becomes performance evidence.
- **D19-06:** Recommendations retain evidence/revision fencing and explicit Keep current/Use target. No silent target mutation.
- **D19-07:** Optional dated bodyweight enables relative-strength views only, discloses its measurement basis, and never changes targets.

### Claude's Discretion
- Chart sampling/layout using existing SVG, provided accessible text/data equivalents and source evidence remain available.

</decisions>

<canonical_refs>
## Canonical References

- `.planning/v1.2-OWNER-BRIEF.md` — goals/prohibitions.
- `.planning/REQUIREMENTS.md` — PRO-01 through PRO-18.
- `.planning/design/v1.2-prototype-parity-matrix.md` — screens/states/evidence.
- `.planning/architecture/v1.2-garmin-import.md` — accepted imported facts.
- `.planning/milestones/v1.1-phases/04-overall-progress-and-complete-progression/04-VERIFICATION.md` if present — shipped factual Progress boundary.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Existing Progress period view models, effective-history projections, evidence envelopes and RecommendationSurface.
- Exercise history route and accessible SVG/data-table patterns.
- Phase 13 bodyweight/goal facts and Phase 18 imported best-effort read models.

### Integration Points
- Phase 14 shell/tokens; Phase 17 target editor routes; Phase 18 source revisions.

</code_context>

<specifics>
## Specific Ideas

Personal history is the benchmark. Charts support the evidence statement; they
never manufacture a smooth story from sparse data.

</specifics>

<deferred>
## Deferred Ideas

Readiness, composite fitness, muscle heat maps, invented 10 km/Half targets, automatic bodyweight-driven progression.

</deferred>

---
*Phase: 19-progress-parity*
*Context gathered: 2026-10-06*

# Phase 16: Calendar Parity - Research

**Researched:** 2026-10-06
**Domain:** Expo/React Native spatial Calendar, typed event projection, UI-thread gestures, measured week morphs, read-only historical routing, and native evidence
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

<!-- DATA_8Q4M2L7R_START -->

### Phase Boundary

Build the full-height month/focused Calendar, gesture/motion state machine,
compact agendas, and read-only detail routing from Phase 13 events and Phase 15
presentation. Calendar never gains correction or workout mutation authority.

### Locked Decisions

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

### Owner-review checkpoints
- **DEV-01:** 360dp side-padding adaptation for non-overlapping 48dp date targets remains proposed.
- **DEV-02:** Light Strength-title contrast adjustment remains proposed. Plans must include comparison/checkpoint rather than assume approval.

### Claude's Discretion

No `Claude's Discretion` section is present in Phase 16 CONTEXT.md.

### Deferred Ideas (OUT OF SCOPE)

Calendar correction controls, generic timeline redesign, and automatic activity matching are out of scope.

<!-- DATA_8Q4M2L7R_END -->
</user_constraints>

<phase_requirements>
## Phase Requirements

<!-- DATA_N6C3V9P2_START -->

| ID | Description | Research Support |
|---|---|---|
| CAL-01 | Fill the area above bottom navigation with a Monday-first month grid and persistent Previous, month title, Today and Next controls. | Civil-month helpers, full-height layout ownership, variable four/five/six-week geometry, and target file map. |
| CAL-02 | Place the info action immediately left of App Settings and show Activity and Status groups in a Calendar key sheet, with no inline legend. | Reuse of the Phase 14 header/modal/focus contract and explicit dialog verification. |
| CAL-03 | Use orange Strength and blue Running, solid/tinted Complete, dotted half-filled Partial and transparent dashed Planned, with neutral status samples. | Shared event renderer, non-color semantic labels, Light/Dark comparison, and DEV-02 gate. |
| CAL-04 | Use shared month/focused date/event cells with 28px date and 36px event tracks, stable effective 4px top inset and measured row-height continuity. | One `CalendarDayCell`/`CalendarWeekRow` presentation and native measured-geometry evidence. |
| CAL-05 | Show up to two compact titled events per date in selected and adjacent weeks, preserving full names/statuses in day accessibility labels. | Typed event arrays, two-chip visual capacity, overflow semantics, and accessibility tests. |
| CAL-06 | Distinguish selected date, today, outside-month dates, rest day and empty dates without changing event status semantics. | Civil-date state composition and event/status semantic separation. |
| CAL-07 | Keep clipped previous/current/next month panels following horizontal pointer movement one-to-one, clamped to one panel, while vertical intent scrolls normally. | UI-thread shared value, manual intent arbitration, clamping, and native 1:1 traces. |
| CAL-08 | Change the visible title at 25% width, revert immediately below the threshold or on cancel, and settle only at or beyond 25%; shorter drags snap back even when fast. | Inclusive distance predicate, no velocity branch, retreat/cancel controller tests, and 24.9/25/25.1 native samples. |
| CAL-09 | Preserve the 240ms month-settle motion and cubic-bezier(.22,.8,.3,1), with completion handling that avoids stale selection or duplicate navigation. | Reanimated timing, transition epoch, idempotent completion/fallback, and stale-callback tests. |
| CAL-10 | Keep previous/next/Today controls usable in both month and focused views, preserving/clamping selected day and returning to today's actual local date. | Shared transition intents and new LocalDate month-clamp helpers. |
| CAL-11 | Provide visible-focus arrow navigation and activation for date cells plus non-gesture month controls. | Existing `FocusablePressable`, civil ±1/±7 movement, explicit focus refs, and D-pad evidence. |
| CAL-12 | Animate the selected month row to the top and its following row to the bottom, retain a single Monday-first weekday header, and reveal compact agenda rows. | Measured overlay geometry, shared row renderer, and ordered semantic controller. |
| CAL-13 | Reverse both focused rows to their measured month positions before showing month mode and restoring selected-day focus. | Collapse state, animation cancellation/epoch guard, and focus restoration. |
| CAL-14 | On adjacent-week date selection, collapse to month, select/focus the new date, then expand its week with events preserved. | Explicit collapse → selection/focus → expand sequence, including adjacent-month dates. |
| CAL-15 | Keep identical selected dates, navigation sequence and agenda content when reduced motion removes row movement and month transitions. | Existing runtime reduced-motion provider plus controller equivalence tests and runtime-toggle evidence. |
| CAL-16 | Use one full-width tap target per event with title, one-line result/target, sport/status, source and chevron; remove nested Resume/View/Match actions. | One agenda-row component and one navigation callback per durable event. |
| CAL-17 | Route Strength to read-only workout detail, planned Running to Running plan, and imported Running to Garmin activity detail using real entity identities. | Discriminated destination adapter, real-ID routing table, missing-identity state, and downstream route dependency audit. |
| CAL-18 | Render Active-shaped full-height completed/partial workout detail with exercise disclosure, all set rows and result/state semantics, but no edit/complete/reorder/settings mutation. | Phase 15 presenter reuse through a compile-time read-only capability and zero-command regression tests. |
| CAL-19 | Render planned Strength as a read-only plan-occurrence preview without inventing a session ID, completed set or result. | Dedicated occurrence route/read model and stale occurrence recovery. |
| CAL-20 | Preserve agenda date, expanded week and triggering-row focus on detail Back, and expose expand/collapse controls for each historical exercise. | Calendar return-state ownership, `useFocusEffect`, event-keyed refs, scroll anchor, and disclosure tests. |
| CAL-21 | Add source-backed loading, empty, stale-projection/error and retry states that retain the selected date and never display invented sessions. | Last-good projection model, monotonic request identity, retry, and no-fixture fallbacks. |
| CAL-22 | Keep deliberate Correct workout, revision history, draft validation, stale-revision conflict and save/retry in the existing correction route, outside Calendar's read-only detail context. | Separate management route regression and absence assertions in Calendar origin. |
| CAL-23 | Keep intentional Resume workout and Remove from history/confirmation reachable from a separate management context while Calendar history stays read-only. | Capability-separated route branches plus existing management behavior regressions. |

<!-- DATA_N6C3V9P2_END -->

[VERIFIED: .planning/REQUIREMENTS.md:90-114]
</phase_requirements>

## Summary

Phase 16 is a coordinated data-contract, interaction-controller, native-motion, routing-authority, and evidence phase—not a reskin of the shipped Calendar. The live `CalendarScreen` is Sunday-first, always renders 42 cells, settles at a fixed 72dp only on gesture end, runs its pan callback on the JS thread, and represents a date as status flags plus selected-day Strength sessions. The locked v1.2 contract instead requires Monday-first four/five/six-row months, distinct same-day typed events, continuous three-panel motion, inclusive 25% preview/settle behavior, measured row morphs, retained last-good query state, and durable destination identities. [VERIFIED: src/ui/screens/CalendarScreen.tsx:49-65,122-145,189-220,365-495] [VERIFIED: src/domains/history/contracts.ts:69-86] [VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:175-245]

The planner should structure the phase as seven vertical plans: (1) dependency/controller and owner gates; (2) civil-date/event month surface; (3) capability-separated Strength detail/occurrence preview; (4) UI-thread month drag and measured focus/collapse geometry; (5) compact agenda and destination intents; (6) diagnostic native/reference capture; and (7) final integration/verifier work after the real downstream routes exist. Phase 13's range-query event port plus exact planned-Strength loader, Phase 15's Active-shaped presentation, Phase 17 Plan 17-08 Running detail, and Phase 18 Plans 18-08/18-14 imported-activity detail/Calendar registration are hard dependencies. The current `CalendarMonth`/`SessionDetailRoute` seams, mocked href assertions, and fixture destinations must not be treated as those completed dependencies. [VERIFIED: .planning/ROADMAP.md:138-156] [PLANNED: .planning/phases/13-multi-plan-running-foundation/13-02-PLAN.md] [PLANNED: .planning/phases/17-library-running-plans/17-08-PLAN.md] [PLANNED: .planning/phases/18-garmin-import/18-08-PLAN.md] [PLANNED: .planning/phases/18-garmin-import/18-14-PLAN.md]

Two explicit owner gates remain. DEV-01 must precede the final 360dp date-column geometry branch, and DEV-02 must precede the Light Strength-title color branch; the oracle values stay the baseline until the owner records a dated selection. The phase may build controller/data/read-only work around those gates, but cannot silently choose either adaptation. [VERIFIED: .planning/design/v1.2-DEVIATIONS.md:3-16] [VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:68-77]

**Primary recommendation:** Consume Phase 13's stable per-event range query and exact `loadPlannedStrengthOccurrence`, drive one semantic controller from pointer/buttons/keyboard/reduced motion, keep per-frame motion and measurement on the UI thread, and expose Calendar details through query-only capabilities. Capture development-test geometry/performance as diagnostic evidence, bind native/reference overlays and differences fail-closed, and close CAL-17/CAL-20 only after executing against the real Phase 17/18 destinations. Phase 20 alone owns release/profile performance acceptance. [VERIFIED: .planning/architecture/v1.2-multi-active-plans.md:143-147] [VERIFIED: .planning/verification/v1.2-native-verification-matrix.md:73-89,140-154]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|---|---|---|---|
| Civil-month/week arithmetic | Client domain | — | Pure LocalDate logic owns Monday-first ranges, month clamping, leap/year boundaries, and never converts date-only facts through `Date`. [VERIFIED: src/domains/scheduling/localDate.ts:1-17,35-47,129-163] |
| Aggregated Calendar facts | Database / Storage | API / Backend (local runtime port) | SQLite-backed Phase 13 query owns stable typed events and identities; the screen consumes a range query and never executes SQL. [VERIFIED: .planning/phases/13-multi-plan-running-foundation/13-CONTEXT.md:19-25,58-70] [VERIFIED: .planning/architecture/v1.2-multi-active-plans.md:143-147] |
| Semantic Calendar transition state | Browser / Client | — | A pure controller decides preview, settle, cancel, focus, expand/collapse, adjacent selection, epochs, and reduced-motion destinations. [VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:217-245] |
| Per-frame drag and row morph | Browser / Client (native UI thread) | — | Gesture Handler/Reanimated shared values own pointer displacement, timing, cancellation, and measured transforms without per-frame React state. [CITED: https://docs.swmansion.com/react-native-gesture-handler/docs/2.x/gestures/pan-gesture/] [CITED: https://docs.swmansion.com/react-native-reanimated/docs/advanced/measure/] |
| Agenda presentation and route dispatch | Browser / Client | Local runtime query port | UI presents one target and selects a destination from the typed event; runtime reads exact durable identity. [VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:247-263,279-292] |
| Read-only historical/occurrence detail | Browser / Client | Database / Storage | Client receives query-only capability; repositories load committed session/occurrence facts. No mutation command is injected in Calendar origin. [VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:279-292] |
| Focus/Back/modal restoration | Browser / Client | Frontend navigation | Calendar owns refs, scroll anchor, invoking event identity, and `useFocusEffect`; route stack only reports focus/Back. [CITED: https://docs.expo.dev/versions/latest/sdk/router/] [VERIFIED: src/ui/components/index.ts:215-264] |
| Visual/native diagnostic evidence | Client verification harness | Android tooling | Jest proves decisions and roles; development-test Android traces/screenshots prove hit testing, real geometry and motion continuity, while mapped reference/native overlays/differences expose unexplained drift. Release/profile performance verdicts remain Phase 20-owned. [VERIFIED: .planning/verification/v1.2-native-verification-matrix.md:73-89,138-154] |

## Project Constraints (from .trae/rules/rules.md)

- Read and follow root `AGENTS.md`; its applicable routing instruction has already been supplied by the orchestrator. [VERIFIED: .trae/rules/rules.md:1-3]
- Treat `~/.gstack/projects/gym_tracker/pre-git-design-20260815-132500.md`, `pre-git-eng-review-test-plan-20260815-224500.md`, the approved core-workout image, and the approved app-system image as the product/design/testing source set, subordinate to the v1.2 source-precedence contract where conflicts are explicitly resolved. [VERIFIED: .trae/rules/rules.md:4-14] [VERIFIED: .planning/design/v1.2-SOURCE-PRECEDENCE.md:1-22]
- Keep SQLite source facts authoritative; notifications, projections, and recommendations must remain replayable or rebuildable. [VERIFIED: .trae/rules/rules.md:16-19]
- Never acknowledge a set before its exclusive transaction commits; preserve bundled versus user-owned data boundaries; keep the workout critical path offline. Phase 16 issues no source mutation and must prove navigation leaves source digests unchanged. [VERIFIED: .trae/rules/rules.md:19-22] [VERIFIED: .planning/verification/v1.2-native-verification-matrix.md:64-64,87-89]
- Write tests with every behavior. Integrity-critical modules require complete branch coverage. If the pure Calendar transition controller is registered as integrity-critical, its statements/branches/functions/lines must all be 100%. [VERIFIED: .trae/rules/rules.md:22-23] [VERIFIED: scripts/run-coverage-gate.mjs:16-123,171-203]
- Atomic commits and the exact `Co-authored-by: TRAE CLI <noreply@users.noreply.github.com>` trailer are project requirements, but this research task is explicitly no-commit. [VERIFIED: .trae/rules/rules.md:23-26]

## Current Code Reality and Required Seams

### Current contracts that must be replaced or extended

<!-- DATA_R5H8W1K4_START -->

The current discrete history values are exactly:

```typescript
export type CalendarDayState =
  | "completed"
  | "partial"
  | "manual"
  | "planned_not_completed"
  | "today";

export type CalendarMonth = Readonly<{
  days: readonly CalendarDay[];
  month: LocalDate;
  selectedDate: LocalDate;
  sessions: readonly HistorySessionSummary[];
}>;
```

<!-- DATA_R5H8W1K4_END -->

[VERIFIED: src/domains/history/contracts.ts:69-86]

That contract cannot carry multiple independent same-date event identities, sport, full title, source identity, occurrence/import identity, or destination. Phase 16 must consume the Phase 13 typed-event range query described by the architecture contract; it must not add those facts by inferring from status glyphs in `CalendarScreen`. [VERIFIED: .planning/architecture/v1.2-multi-active-plans.md:143-147] [VERIFIED: src/ui/screens/CalendarScreen.tsx:147-175,203-241]

The current repository scans all history rows, then issues a per-session count query before reducing dates to status arrays; this is both the wrong shape and an N+1 performance risk surfaced by Phase 16 diagnostics and ultimately judged by Phase 20's combined-event performance gate. Bind Phase 16 to the Phase 13 range-indexed, batched repository rather than expanding `createHistoryRepository.loadCalendarMonth` in the screen layer. [VERIFIED: src/platform/sqlite/repositories/historyRepository.ts:760-863] [VERIFIED: .planning/research/v1.2/ARCHITECTURE.md:69-70,133-142]

### Live implementation gaps

| Live seam | What exists now | Required planning consequence |
|---|---|---|
| `src/ui/screens/CalendarScreen.tsx` | Private Sunday-first short labels, 42 fixed cells, fixed `72` swipe completion, `.runOnJS(true)`, only `onEnd` navigation, and snapshot replacement during every request. [VERIFIED: src/ui/screens/CalendarScreen.tsx:49-65,122-145,189-220,382-396] | Replace the grid/pager interaction, retain only useful screen/query/error composition patterns, and split pure decisions from UI-thread visuals. |
| `src/domains/scheduling/localDate.ts` | Branded `LocalDate`, validation, ±day arithmetic, comparison, difference, and weekday resolution already cover leap/year boundaries. [VERIFIED: src/domains/scheduling/localDate.ts:1-17,35-47,129-163] | Extend this module with month-start/month-add-clamp/Monday-grid helpers and exhaustive tests; do not duplicate `daysInMonth` in the screen. |
| `src/platform/sqlite/repositories/historyRepository.ts` | Effective overlay semantics, void exclusion, planned opportunity status, and selected-day summaries are real, but the result is date-state aggregation. [VERIFIED: src/platform/sqlite/repositories/historyRepository.ts:620-680,760-863] | Preserve overlay/void behavior through Phase 13's typed event query and verify one event per source identity. |
| `app/(tabs)/calendar.tsx` | Builds a device-local civil date string and routes every selected item directly to `/session/{id}`. [VERIFIED: app/(tabs)/calendar.tsx:13-34] | Accept one discriminated event destination callback and pass origin/return identity; do not route planned occurrences/imports through fake session IDs. |
| `app/session/[sessionId].tsx` | Loads facts but injects correction, removal, exercise-history, and resume handlers into `SessionDetailScreen`. [VERIFIED: app/session/[sessionId].tsx:30-125] | Add a compile-time Calendar-origin branch/query-only capability; management origin retains existing handlers. |
| `src/ui/screens/SessionDetailScreen.tsx` | Optional mutation callbacks hide actions when omitted, but presentation is not the contracted Active-shaped disclosure view and still exposes exercise-history buttons. [VERIFIED: src/ui/screens/SessionDetailScreen.tsx:109-125,214-277,376-396] | Consume/extract Phase 15's shared read-only presenter; Calendar mode exposes disclosure only and no deep mutation/management affordance. |
| `src/ui/theme/index.ts` | `AppearanceProvider` already subscribes to `"reduceMotionChanged"`, queries initial state, and supplies `reduceMotion` plus reduced/standard motion tokens. [VERIFIED: src/ui/theme/index.ts:226-264,283-306] | Reuse `useAppTheme().reduceMotion`; do not create a competing motion preference. Resolve an in-flight transition deterministically when it changes. |
| `app/_layout.tsx` | The app root is already wrapped in `GestureHandlerRootView`. [VERIFIED: app/_layout.tsx:126-221] | Do not add a second root wrapper around the Calendar route; only portaled modal trees require their own root. |
| `src/ui/components/index.ts` | `FocusablePressable` forwards a `View` ref, supports keyboard activation, and renders shared visible focus. [VERIFIED: src/ui/components/index.ts:215-264] | Reuse keyed refs for dates/agenda triggers and use the same activation handler for touch/Enter/Space/D-pad. |
| Existing tests | Calendar component tests cover civil month navigation, fixed six-week grid, adjacent dates, fixed-distance swipe direction, LocalDate boundaries, retry, and themes. [VERIFIED: src/ui/__tests__/CalendarScreen.test.tsx:88-332] | Replace superseded assertions and retain civil-boundary/theme regressions; add pure controller, route capability, geometry trace, and native evidence layers. |

## Standard Stack

### Core

<!-- DATA_T2J7F4B9_START -->

| Library | Locked version / publication | Purpose | Why standard here |
|---|---|---|---|
| Expo / React Native | `57.0.25` / `0.86.3`; published 2026-09-24 / 2026-08-24 | Native application, layout, accessibility, route host | Existing repository baseline; no SDK upgrade belongs in Phase 16. |
| `react-native-gesture-handler` | `2.32.0`; published 2026-06-11 | Native pan recognition, cancellation, and manual intent arbitration | Pinned and already hosted at the app root. |
| `react-native-reanimated` | `4.5.1`; published 2026-07-02 | UI-thread shared values, 1:1 transforms, exact timing, cancellation, and measurement | Pinned peer-compatible with RN 0.86 and Worklets 0.10.x. |
| `react-native-worklets` | `0.10.1`; published 2026-07-01 | `scheduleOnRN` boundary from worklet completion/threshold changes to semantic React state | Existing code already uses this bridge for gesture-driven UI. |
| Expo Router | `57.0.23`; published 2026-09-24 | Calendar root, occurrence/session/deep routes, Back and focus lifecycle | Pinned app navigation; `useFocusEffect` is the route-return seam. |
| `expo-sqlite` | `57.0.3`; published 2026-09-11 | Authoritative typed Calendar read models through repository/runtime ports | SQLite remains source truth; no SQL enters screens. |

<!-- DATA_T2J7F4B9_END -->

[VERIFIED: package.json:92-123] [VERIFIED: package-lock.json:5446-5449,9874-9888,9934-9947,9988-9992] [CITED: https://registry.npmjs.org/]

### Supporting

| Library / local primitive | Version | Purpose | When to use |
|---|---|---|---|
| React Native `AccessibilityInfo` + focusable `View` | RN `0.86.3` | Runtime reduced-motion changes and semantic focus events | Consume the existing theme provider; use focus events on Back/modal return. `setAccessibilityFocus` is deprecated in current docs; prefer `sendAccessibilityEvent(host, "focus")`. [CITED: https://reactnative.dev/docs/accessibilityinfo] |
| Jest + React Native Testing Library | `29.7.0` / `14.0.1`; published 2023-09-12 / 2026-06-23 | Pure transition branches, roles/copy/routes/focus, and capability absence | Run unit/controller and component/route suites; never claim native geometry from mocks. [VERIFIED: package-lock.json:3188-3205,6596-6612] |
| Existing `FocusablePressable` | local | 48dp/focus/keyboard activation behavior | Date cells, month controls, collapse, agenda rows, disclosure headers. [VERIFIED: src/ui/components/index.ts:215-264] |
| Existing `AppearanceProvider` / `useAppTheme` | local | Light/Dark/System and runtime reduced motion | All Calendar visuals and transition timing decisions. [VERIFIED: src/ui/theme/index.ts:226-306] |

### Alternatives Considered

| Instead of | Could use | Tradeoff / disposition |
|---|---|---|
| Pinned Gesture Handler + Reanimated | React Native JS responder / `Animated` | Rejected: the contract requires continuous native pointer tracking, UI-thread frame work, measured morphs, and cancellation evidence. [VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:217-245,367-377] |
| Pure controller + UI-thread shared values | React state on every pointer update | Rejected: per-frame React updates distort Phase 16 diagnostics, jeopardize Phase 20's 16.67ms release/profile gate, and complicate stale callback suppression. [VERIFIED: .planning/verification/v1.2-native-verification-matrix.md:79-89,154-154] |
| Phase 13 typed event range query | Extend current status-set `CalendarMonth` | Rejected: status sets flatten independent events and cannot route by occurrence/import identity. [VERIFIED: src/domains/history/contracts.ts:69-86] [VERIFIED: .planning/architecture/v1.2-multi-active-plans.md:143-147] |
| Capability-separated read-only route | Hide mutation buttons with CSS/conditions while keeping handlers | Rejected: Calendar-origin detail must expose no actions, handlers, keyboard commands, accessibility actions, or mutation ports. [VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:279-292] |

**Installation:** Do not add or upgrade packages. The phase uses the checked-in lockfile. This worktree currently lacks `node_modules`; executor Wave 0 must run `npm ci` before automated checks, without changing `package.json` or `package-lock.json`. [VERIFIED: package.json:92-133] [VERIFIED: environment probe on 2026-10-06]

## Package Legitimacy Audit

Not triggered for dependency selection: Phase 16 adds **no external package** and must not run `npm install <package>`. Existing versions are already repository-pinned and official documentation was checked for the APIs used. `npm ci` is worktree hydration from the existing lock, not a new library decision. [VERIFIED: package.json:92-133] [VERIFIED: package-lock.json:5446-5449,9874-9888,9934-9947,9988-9992]

## Architecture Patterns

### System Architecture Diagram

```text
SQLite source facts (Phase 13)
  ├─ effective Strength sessions/corrections/voids
  ├─ planned Strength occurrences
  ├─ planned Running occurrences
  └─ immutable imported Running activities/matches
              │ one coherent, range-indexed typed query
              ▼
Phase 13 Calendar read port
  └─ stable event ID + LocalDate/timezone + sport/status/title/source
     + exact destination identity (session | occurrence | plan | activity)
              │
              ▼
Calendar query adapter (last-good snapshot + request generation)
              │
              ├──────────── query failure ──► retained grid + notice/retry
              │
              ▼
Pure Calendar transition controller
  pointer/buttons/keyboard/Back/reduced-motion/layout/app-state events
              │
              ├─ semantic state ────────────► title, selected date, mode,
              │                              agenda, focus/return identity
              │
              └─ motion commands ───────────► UI-thread shared values
                                               │
                                               ├─ 3-panel 1:1 drag/settle
                                               └─ measured week overlays
              │
              ▼
Shared Calendar presentation
  header/key + month/focused rows + compact agenda
              │ single durable destination
              ▼
Read-only route adapter
  ├─ completed/partial Strength ─► query-only Active-shaped detail
  ├─ planned Strength ───────────► occurrence preview (no session)
  ├─ planned Running ────────────► Running plan detail
  ├─ imported Running ───────────► Garmin activity detail
  └─ missing/stale identity ─────► source-backed unavailable state
              │ Back
              ▼
Calendar retained month/date/week/scroll + triggering-row focus
```

The diagram reflects the locked rule that rendering/navigation is a projection and issues no source mutation. [VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:279-292,331-352]

### Recommended Project Structure

```text
app/
├── (tabs)/calendar.tsx                     # root adapter and destination dispatch
├── calendar/plan/[occurrenceId].tsx        # planned Strength read-only preview
└── session/[sessionId].tsx                 # explicit Calendar vs management capability branch
src/
├── domains/scheduling/localDate.ts          # canonical month/week civil arithmetic
├── domains/history/calendar.ts              # event presentation ordering + pure semantic decisions
├── platform/sqlite/repositories/
│   └── trainingCalendarRepository.ts        # Phase 13 typed range-query dependency
├── ui/calendar/
│   ├── calendarPorts.ts                     # narrow Phase 13/15 read-only aliases
│   ├── calendarTransitionController.ts      # pure state machine and transition epochs
│   ├── CalendarMonthViewport.tsx            # UI-thread pager and measured week overlays
│   ├── CalendarWeekRow.tsx                  # shared month/focused/adjacent row renderer
│   ├── CalendarAgenda.tsx                   # one action per typed event
│   └── CalendarReadOnlyWorkout.tsx           # Active-shaped query-only presenter
├── ui/screens/CalendarScreen.tsx             # state/query composition and source states
└── ui/screens/PlannedWorkoutDetailScreen.tsx # planned occurrence facts/missing state
tests + evidence/
├── src/domains/history/calendar.test.ts
├── src/domains/scheduling/localDate.test.ts
├── src/ui/__tests__/CalendarScreen.test.tsx
├── src/ui/__tests__/CalendarTransitions.test.tsx
├── src/ui/__tests__/PlannedWorkoutDetailScreen.test.tsx
├── app/__tests__/calendar-cross-destination-route.test.tsx
├── src/bootstrap/phase16CalendarTestControls.ts
├── maestro/v1.2/calendar.yaml
├── .planning/phases/16-calendar-parity/16-REFERENCE-MAP.json
├── scripts/compare-v12-calendar.mjs
├── scripts/v12-calendar-comparison.test.mjs
├── scripts/benchmark-v12-interactions.mjs
├── scripts/verify-v12-native-evidence.mjs
└── scripts/v12-evidence-scripts.test.mjs
```

`app/calendar/plan/[occurrenceId].tsx`, `src/ui/screens/PlannedWorkoutDetailScreen.tsx`, the transition test, and the v1.2 native/evidence paths are already named as planned targets in the canonical parity/evidence matrices. The `src/ui/calendar/*` split above is the prescriptive internal component boundary for keeping per-frame work out of the screen and pure decisions testable. [VERIFIED: .planning/design/v1.2-prototype-parity-matrix.md:118-140] [VERIFIED: .planning/verification/v1.2-native-verification-matrix.md:34-34]

### Component Responsibilities

| File / symbol | Responsibility | Must not own |
|---|---|---|
| `src/domains/scheduling/localDate.ts` | Export civil month start, add-month-with-clamp, Monday-first week start, variable month-grid range, and four/five/six-row helpers; reuse `parseLocalDate`, `addLocalDays`, `weekdayForLocalDate`. | Locale display, gestures, route state, or `Date`-based date-only arithmetic. |
| Phase 13 `trainingCalendarRepository.ts` / runtime read port | Return bounded typed events with stable source/destination identity and effective history semantics. | UI status glyphs, transition state, or navigation. |
| `calendarTransitionController.ts` | Pure state/event reducer for pointer intent, preview boundary, settle/cancel, expand/collapse/adjacent order, epoch checks, Back order, runtime reduced-motion changes. | Reanimated shared values, SQLite, refs, or route calls. |
| `CalendarMonthViewport.tsx` | Three clipped panels; UI-thread pointer/settle; animated overlay rows; measurement refresh; gesture cancellation. | Query authority, durable destination choice, or mutation callbacks. |
| `CalendarWeekRow.tsx` | One exact day/event renderer reused in month, selected, and following rows; keyed date refs and semantics. | Independent status inference or different focused-mode spacing. |
| `CalendarScreen.tsx` | Compose Phase 14 shell, key dialog, query state, controller, agenda, refs, and route callback. | SQL, fake fixture fallback, full-runtime mutation authority, or frame-by-frame React state. |
| `app/(tabs)/calendar.tsx` | Adapt the query-only runtime port, build exact deep-route href from the event destination, and preserve return identity. | Inspect event titles/dates to guess destination. |
| `SessionDetailScreen` / shared read-only presenter | Render committed facts and disclosures under an explicit Calendar capability. | Correct, Resume, Remove, edit, complete, reorder, settings, or exercise-history handlers in Calendar mode. |
| `PlannedWorkoutDetailScreen` | Call exact `TrainingFoundationRuntimePort.loadPlannedStrengthOccurrence(occurrenceId)`; render the deeply immutable target-bearing `PlannedStrengthOccurrenceDetail`; show `0 of N sets`; map `null` to missing/stale. | Create a workout session, completed set, result, rest effect, Start action, or current-activation fallback. |

### Pattern 1: One Semantic Controller, Two Execution Planes

**What:** All entry methods—pan release, Previous, Next, Today, arrow navigation, date activation, collapse, adjacent selection, Back, reduced-motion toggle—dispatch into one pure controller. The controller returns semantic state plus a motion command. Reanimated executes the motion command; only threshold crossings and guarded completions cross to React state. [VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:217-245,247-263]

**Why:** Pointer progress needs UI-thread continuity, while selected month/date, route destination, focus, and query identity must remain deterministic and testable. Gesture callbacks are automatically workletized on the UI thread when Reanimated is installed unless `.runOnJS(true)` is used. [CITED: https://docs.swmansion.com/react-native-gesture-handler/docs/2.x/gestures/pan-gesture/]

**Controller invariants:**

- A drag can settle at most one month and velocity is never an input. [VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:223-231]
- Preview title is derived from the inclusive distance boundary and can revert repeatedly while the pointer remains down. [VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:223-230]
- One monotonic transition epoch guards completion, fallback, delayed adjacent expansion, and query response. A callback whose epoch is not current is a no-op. [VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:230-245,349-350]
- Reduced motion changes duration/translation only; it never skips semantic states or focus. Runtime toggle cancels obsolete animation/timers, applies the same destination, and advances the epoch. [VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:237-245,367-377]

### Pattern 2: Manual Horizontal Intent Arbitration

The locked intent rule is more precise than the current `.activeOffsetX([-12,12]).failOffsetY([-24,24])`: the oracle requires a `7dp` slop and horizontal claim only when `abs(dx) >= abs(dy) × 1.15`. Fixed offset ranges alone cannot express that ratio. Use `Gesture.Pan().manualActivation(true)` and the gesture state manager from an `onTouchesMove` worklet to call `activate()` only after the horizontal condition or `fail()` once vertical intent dominates; compose it with the native vertical scroll owner and close the choice with NV-CAL-03 on Android. [VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:221-231] [CITED: https://docs.swmansion.com/react-native-gesture-handler/docs/2.x/gestures/state-manager/] [CITED: https://docs.swmansion.com/react-native-gesture-handler/docs/2.x/gestures/pan-gesture/]

Once active, assign the clamped pointer displacement directly to the shared translation value—no easing/resistance/spring. `onFinalize` handles both recognized and failed/cancelled gestures and must route to one stable-state resolver. [CITED: https://docs.swmansion.com/react-native-gesture-handler/docs/2.x/gestures/pan-gesture/] [VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:223-231]

<!-- DATA_V4R8C2N6_START -->

The captured oracle evidence is internally consistent with 1:1 tracking: baseline transform `-354`; `dx: -60` → transform `-414`; `dx: -84` → `-438`; `dx: -92` → `-446` and title `November 2026`; retreat to `dx: -40` → `-394` and title `October 2026`; snap-back returns to `-354`. A later `dx: -100` records transform `-454` before settling to the new month at baseline `-354`.

<!-- DATA_V4R8C2N6_END -->

[VERIFIED: .planning/design/v1.2-browser-evidence/calendar-pointer-evidence.json:2-64]

### Pattern 3: Measured Overlay Rows, Not Crossfade Substitution

Use one `CalendarWeekRow` renderer for month, selected, and following rows. In month mode, record row `y` and `height` keyed by civil week start. On expansion, create accessibility-inert visual overlays at the exact measured month coordinates, hide/inert the duplicate month rows, animate the selected overlay to top and following overlay to the measured bottom target, then expose the focused semantics/agenda. On collapse, reverse both overlays to their stored month coordinates; only after geometry is stable restore the month nodes and selected-date focus. [VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:175-203,235-245] [VERIFIED: .planning/verification/v1.2-native-verification-matrix.md:82-86]

Use `onLayout` for the stable layout cache and Reanimated `useAnimatedRef` + `measure` at transition start when the UI-thread value must be refreshed. `measure` returns UI-thread dimensions/position or `null`; a null measurement must cancel/remeasure rather than animate from fabricated coordinates. Rotation, viewport change, background return, and font-scale change invalidate the cache and cancel in-flight motion. [CITED: https://docs.swmansion.com/react-native-reanimated/docs/advanced/measure/] [VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:196-203,349-350]

The following row is the next civil week even when the selected row is the last row in the current month. Its events must come from the bounded range query, not from the current-month status map. [VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:188-195] [VERIFIED: .planning/architecture/v1.2-multi-active-plans.md:143-147]

### Pattern 4: Last-Good Query State With Exact Request Identity

Represent initial loading separately from refresh/navigation loading. Initial loading may show stable non-interactive skeletons. Once a source-backed snapshot exists, retain it during month/date refresh, show `Updating Calendar`, and accept a response only when its request generation and requested range still match the newest intent. A failure retains the snapshot, selection, focused mode, and retry identity. [VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:331-350]

The live effect already suppresses some stale responses with an `active` cleanup flag, but it clears `snapshot` before every request and replaces the whole Calendar with an error route. Preserve the cancellation guard while replacing the destructive clearing behavior. [VERIFIED: src/ui/screens/CalendarScreen.tsx:382-447]

### Pattern 5: Discriminated Durable-Identity Routing

The Calendar adapter must switch on the typed destination supplied by Phase 13, never on label, color, status glyph, title, source text, or whether an ID happens to resemble a session. [VERIFIED: .planning/architecture/v1.2-multi-active-plans.md:143-147]

| Event | Required identity | Phase 16 destination | Capability |
|---|---|---|---|
| Completed/partial Strength | durable session identity | Calendar-origin session detail | query facts + Back/disclosures only |
| Planned Strength | durable occurrence identity | `app/calendar/plan/[occurrenceId].tsx` | occurrence read only; no session |
| Planned Running | durable plan/session/occurrence context | planned `app/library/running/[planId].tsx` | query plan detail; Calendar return token |
| Imported Running | durable imported activity identity | planned `app/garmin/activity/[activityId].tsx` | query imported facts; Calendar return token |
| Missing/stale identity | original requested identity | dedicated unavailable state | Back + Calendar refresh only |

The destination table is locked by the UI contract. Phase 17 Plan 17-08 owns the real Running detail route, Phase 18 Plan 18-08 owns the real imported-activity detail route, and Phase 18 Plan 18-14 registers Calendar-origin return behavior. Phase 16 can establish the event union and internal Strength destinations earlier, but CAL-17/CAL-20 integration closure must run later against those real implementations. Mocked router calls, href-only assertions, fixture screens, and placeholders are not completion. [PLANNED: .planning/phases/17-library-running-plans/17-08-PLAN.md] [PLANNED: .planning/phases/18-garmin-import/18-08-PLAN.md] [PLANNED: .planning/phases/18-garmin-import/18-14-PLAN.md]

### Pattern 6: Compile-Time Read-Only Capability

Make Calendar and management origins distinct prop/capability branches. The Calendar branch receives only detail loading, Back, disclosure state, and focus restoration. The management branch retains correction/removal/resume/history actions. Do not pass full `WorkoutAppRuntime` into a reusable detail presenter and rely on hidden buttons. [VERIFIED: app/session/[sessionId].tsx:30-125] [VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:279-292]

The existing optional callbacks are useful evidence that no button renders when a callback is absent, but Phase 16 needs stronger route tests: no mutation callback is injected, no mutation symbol is called through keyboard/accessibility actions, and the before/after source digest is identical after Calendar navigation/disclosure. [VERIFIED: src/ui/screens/SessionDetailScreen.tsx:109-125,376-396] [VERIFIED: src/ui/__tests__/WorkoutCompletionScreen.test.tsx:433-465,613-661,723-770]

### Pattern 7: Return-State and Focus Ownership Remain in Calendar

Store visible month, selected date, focused/month mode, agenda scroll offset, and invoking event ID in the Calendar route—not in destination screens or fixture globals. Store date and agenda refs keyed by durable identity. Before push, record the event ID and current scroll offset; on route focus after Back, restore scroll, call the invoking ref's `.focus()`, and send a semantic focus event. Expo Router's `useFocusEffect` runs whenever the route is focused and should use a `useCallback` callback. [CITED: https://docs.expo.dev/versions/latest/sdk/router/] [VERIFIED: src/ui/components/index.ts:215-264]

Calendar Back priority is exact: dismiss key, close read-only detail, collapse focused week, then root navigation. Modal dismiss returns Info focus; direct expansion focuses Collapse; adjacent re-expansion focuses the new date; collapse returns selected month-cell focus. [VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:290-292,354-365]

## DEV-01 / DEV-02 Checkpoint Architecture

| Gate | Baseline before decision | Comparison task | Implementation stop |
|---|---|---|---|
| DEV-01 | `18dp` horizontal inset and `2dp` gaps; known `44.5625dp` day width at 360dp | Identical source-backed month fixture at 360×800, both themes if relevant: baseline versus `min(18, max(0, (safeWidth - 348) / 2))`; overlay and native non-overlap bounds | Stop before the final branch. Adaptation requires passing evidence; retaining `18dp` requires a dated scoped accepted exception, otherwise `BLOCKED_OWNER`. |
| DEV-02 | Light Strength title `#D97820` | Identical Light complete/partial/planned chips on paper and selected fill: oracle versus title-only `#9B470B`; contrast plus overlay | Stop before the final branch. Adaptation requires passing evidence; retaining `#D97820` with the measured failure requires a dated scoped accepted exception, otherwise `BLOCKED_OWNER`. |

These quoted baseline/adaptation values are verbatim from the deviation register and remain proposals, not defaults. [VERIFIED: .planning/design/v1.2-DEVIATIONS.md:3-16]

An open decision or incomplete chosen-branch evidence keeps every affected row `BLOCKED_OWNER`; an aggregate containing such a row cannot be all-pass. An accepted adaptation must pass its complete native/reference comparison and accessibility measurements. If the owner retains the oracle and its known accessibility failure remains, the deviation register must contain a separately dated/scoped accepted exception; absent that exception, closure blocks. `ACCEPTED_EXCEPTION` remains distinct from PASS.

## Diagnostic Performance Architecture

- Query diagnostics: collect at least `100` representative source-backed Calendar month plus selected-date samples with real multi-plan/import counts and every raw duration. Compute p95 and retain the 250ms target as metadata, but Phase 16 development-test evidence does not assign the NV-PERF-07 release/profile verdict. [VERIFIED: .planning/verification/v1.2-native-verification-matrix.md:152-152]
- Frame diagnostics: collect at least `100` complete drag/expand/collapse sequences with raw frame work, missed frames, refresh rate and profiler overhead. Compute p95 and retain the 60Hz 16.67ms target as metadata, but Phase 20 Plan 20-08 alone assigns NV-PERF-09 acceptance on release/profile evidence. Jest timing and nominal animation duration prove neither gate. [PLANNED: .planning/phases/20-native-acceptance/20-08-PLAN.md]
- Keep pointer updates, clamping, transform, and measurement on the UI thread. Cross to React/JS only on preview-boundary change, semantic settle/cancel completion, focus, and route/query intent. [CITED: https://docs.swmansion.com/react-native-gesture-handler/docs/2.x/gestures/pan-gesture/] [CITED: https://docs.swmansion.com/react-native-reanimated/docs/advanced/measure/]
- Query previous/current/next panels as one bounded coherent range or cache adjacent range results; do not re-scan all history or issue one count query per session. [VERIFIED: src/platform/sqlite/repositories/historyRepository.ts:760-863] [VERIFIED: .planning/research/v1.2/ARCHITECTURE.md:69-70,137-142]
- Use development-test native diagnostics tied to exact build/source identity. The existing Phase 3 benchmark has a `100` sample, `250ms` p95, `50ms` JS-task checker but explicitly defers generation; reuse its raw-sample envelope, not its absent evidence or acceptance authority. Phase 20 reruns release/profile measurements. [VERIFIED: scripts/benchmark-phase3.mjs:25-39,64-95,144-159]

## Native / Reference Comparison Architecture

- `.planning/phases/16-calendar-parity/16-REFERENCE-MAP.json` maps every required Calendar capture to exactly one Revision 18 reference using requirement, state, fixture, theme, measured viewport/orientation/font, motion/input, prototype revision, and source-manifest hash.
- `scripts/compare-v12-calendar.mjs` generates and hashes individual reference, native, overlay, absolute-difference, mask, and canonical comparison JSON artifacts. It must not rescale/stretch mismatched bounds or use a contact sheet as source evidence.
- `scripts/v12-calendar-comparison.test.mjs` rejects missing/duplicate/extra mappings, stale hashes, path escapes/symlinks, requested-versus-measured configuration mismatch, missing constituent images, unknown classifications, and semantic/authority/focus/target differences regardless of pixel percentage.
- Clean comparisons may pass. An accepted adaptation is `accepted_deviation`; a retained oracle with an unresolved accessibility failure is `BLOCKED_OWNER` unless a dated/scoped accepted exception exists, in which case it is `ACCEPTED_EXCEPTION`, never PASS. Every other unexplained product difference fails closed.
- Phase 20 may ingest these Phase 16 diagnostic artifacts, but it revalidates their bytes and independently owns release/profile visual and performance acceptance.

## Anti-Patterns to Avoid

- **Fixed-distance or velocity settling:** `72dp`, `velocityX`, or a flick fallback contradicts inclusive `25% × measured width`. [VERIFIED: src/ui/screens/CalendarScreen.tsx:55-56,122-134] [VERIFIED: .planning/design/v1.2-SOURCE-PRECEDENCE.md:21-21]
- **React state on every pan update:** it abandons native 1:1 tracking and makes frame-work evidence fragile. [CITED: https://docs.swmansion.com/react-native-gesture-handler/docs/2.x/gestures/pan-gesture/]
- **Crossfade-only focused week:** selected/following rows must travel from/to measured month positions. [VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:188-195,235-245]
- **Cloned presentation drift:** month, selected, and following weeks must share the same cell/event renderer and tracks. [VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:175-195]
- **Date-only status flattening:** two independent events on one date remain independently addressable and ordered; never reduce them to one status/color. [VERIFIED: .planning/architecture/v1.2-multi-active-plans.md:135-147]
- **Mutable session route from Calendar:** direct `/session/{id}` with management callbacks violates CAL-18/22/23 even if the first screen visually hides a button. [VERIFIED: app/(tabs)/calendar.tsx:23-33] [VERIFIED: app/session/[sessionId].tsx:92-125]
- **Invented planned session:** an occurrence preview cannot receive a fake session ID, completed set, result, rest effect, or Start action. [VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:259-262,283-288]
- **Clearing last-good data on refresh:** keep grid/selection/focused state and show updating/error status. [VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:331-350]
- **Timer as truth:** completion callbacks plus epoch/idempotent fallback decide stable state; timers cannot authorize navigation or data. [VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:235-245]
- **`useReducedMotion` alone:** official Reanimated docs say it reflects startup state and system changes do not rerender; the repo's `AppearanceProvider` already supplies the required runtime update. [CITED: https://docs.swmansion.com/react-native-reanimated/docs/device/useReducedMotion/] [VERIFIED: src/ui/theme/index.ts:243-295]
- **Deprecated accessibility focus API:** current RN docs deprecate `setAccessibilityFocus`; use focusable refs plus `sendAccessibilityEvent(host, "focus")` and verify on Android. [CITED: https://reactnative.dev/docs/accessibilityinfo]

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---|---|---|---|
| Native pan recognition/cancellation | JS responder with ad hoc velocity math | Pinned Gesture Handler `Pan`, manual activation/state manager, `onFinalize` | Native recognizer exposes cancellation/failure and worklet execution needed by the contract. [CITED: https://docs.swmansion.com/react-native-gesture-handler/docs/2.x/gestures/pan-gesture/] |
| Frame-by-frame animation engine | `setInterval`, `requestAnimationFrame` state loop, custom spring | Reanimated shared values, `withTiming`, exact `Easing.bezier`, `cancelAnimation` | The locked motion is timed/eased, cancellation-safe, and must remain on the UI thread. [CITED: https://docs.swmansion.com/react-native-reanimated/docs/animations/withTiming/] [CITED: https://docs.swmansion.com/react-native-reanimated/docs/core/cancelAnimation/] |
| Native geometry | Hard-coded row Ys/heights or screenshot-coordinate constants | `onLayout` cache plus `useAnimatedRef`/`measure` and null handling | Row height varies by viewport/font scale and must be recomputed after rotation/background. [CITED: https://docs.swmansion.com/react-native-reanimated/docs/advanced/measure/] |
| Civil-date arithmetic | UTC `Date` parsing, milliseconds-per-day, duplicated leap logic | Existing branded `LocalDate`, `addLocalDays`, `weekdayForLocalDate`, extended with civil month helpers | Existing utilities already handle leap/year boundaries without timezone drift. [VERIFIED: src/domains/scheduling/localDate.ts:1-17,35-47,71-163] |
| Calendar data aggregation in UI | Join/filter/dedupe inferred events in React | Phase 13 typed, range-indexed repository/runtime read port | Source identity, effective corrections, matching, and past/future visibility belong to authoritative data logic. [VERIFIED: .planning/architecture/v1.2-multi-active-plans.md:143-147] |
| Calendar-specific header/modal/focus system | Private sheet, scrim, focus ring, settings header | Phase 14 `ScreenHeader`, `IconAction`, focusable pressable, modal sheet, notice, skeleton | Shared primitives own safe areas, 48dp targets, Back/Escape and trigger return. [VERIFIED: .planning/phases/14-prototype-visual-shell/14-UI-SPEC.md:210-216,244-275] |
| Read-only enforcement by visual hiding | Mutable runtime plus hidden buttons | Query-only/discriminated capability branch | Requirement excludes handlers, keyboard commands and accessibility actions, not just pixels. [VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:279-292] |
| Gesture smoothness proxy | Jest durations or final screenshots | Android timestamped geometry/semantic trace plus Perfetto-compatible frame trace | Mocks cannot prove hit testing, 1:1 displacement, real layout, or frame work. [VERIFIED: .planning/verification/v1.2-native-verification-matrix.md:73-89,154-154] |

**Key insight:** the hard part is preserving one authoritative semantic sequence across input modes while native visuals move independently. Custom shortcuts tend to split those truths, which is exactly how stale callbacks, false titles, focus loss, and accidental mutation enter this phase.

## Common Pitfalls

### Pitfall 1: Styling the current `CalendarMonth` contract

**What goes wrong:** The UI looks closer to Revision 18 but still cannot show or route two independent same-date Strength/Running events, a planned occurrence, or an imported activity.  
**Why it happens:** The current DTO contains per-date states and selected-date Strength sessions only.  
**How to avoid:** Make Phase 13 typed-event range-port readiness the first plan precondition; prove stable identity/order before motion work.  
**Warning signs:** UI conditionals inspect titles/source strings; planned previews reuse session routes; agenda identity equals date.  
[VERIFIED: src/domains/history/contracts.ts:69-86] [VERIFIED: .planning/architecture/v1.2-multi-active-plans.md:143-147]

### Pitfall 2: Using end-of-gesture logic for a continuous contract

**What goes wrong:** The panel does not follow 1:1, the title changes only after release, or a fast short drag settles.  
**Why it happens:** The shipped pan handler runs on JS and only examines `translationX` in `onEnd`.  
**How to avoid:** Track clamped translation and preview boundary in a worklet during movement; semantic settle remains distance-only.  
**Warning signs:** `.runOnJS(true)` on the month pan, `velocityX`, a fixed pixel threshold, or no intermediate trace.  
[VERIFIED: src/ui/screens/CalendarScreen.tsx:208-220] [VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:221-231]

### Pitfall 3: Treating 25% as `>` instead of inclusive `>=`

**What goes wrong:** Exact-boundary native tests disagree with the oracle and title/grid state can split.  
**Why it happens:** Floating boundary behavior is implemented informally.  
**How to avoid:** Centralize one inclusive predicate used for preview and release; test 24.9%, 25%, and 25.1% in both directions.  
**Warning signs:** Separate title and settle predicates or exact-25 test absent.  
[VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:223-231] [VERIFIED: .planning/verification/v1.2-native-verification-matrix.md:79-80]

### Pitfall 4: Crossfading a newly rendered focused week

**What goes wrong:** Final screenshots pass while the approved spatial continuity is absent.  
**Why it happens:** Cloned rows are easier than measuring origin/destination.  
**How to avoid:** Start overlays at measured row coordinates, animate both selected/following rows, and retain intermediate timestamped geometry evidence.  
**Warning signs:** opacity-only transition, constant Y offsets, no first/middle/last-row cases.  
[VERIFIED: .planning/verification/v1.2-native-verification-matrix.md:82-89]

### Pitfall 5: Letting animation callbacks mutate stale semantic state

**What goes wrong:** A rapid reverse, second drag, rotation, runtime motion toggle, or adjacent selection restores an old month/week.  
**Why it happens:** Completion/fallback timers have no transition identity.  
**How to avoid:** Increment an epoch for every accepted/cancelled/reconfigured transition; ignore mismatched callback epochs; cancel shared-value animations before resolving.  
**Warning signs:** multiple independent `setTimeout`s, callback closes over month/date, or second drag allowed during settle.  
[VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:230-245,349-350]

### Pitfall 6: Using `useReducedMotion` as a complete runtime solution

**What goes wrong:** Motion disabled after mount leaves a timer-dependent intermediate state or does not rerender.  
**Why it happens:** Reanimated's hook is a startup snapshot.  
**How to avoid:** Consume the repo's `AppearanceProvider` runtime subscription and dispatch a controller event when `reduceMotion` changes.  
**Warning signs:** `useReducedMotion()` is the only source or reduced mode has a separate destination branch.  
[CITED: https://docs.swmansion.com/react-native-reanimated/docs/device/useReducedMotion/] [VERIFIED: src/ui/theme/index.ts:243-295]

### Pitfall 7: Preserving pixels but losing Calendar return context

**What goes wrong:** Back returns to the month root, wrong date, top of agenda, or heading rather than the invoking row.  
**Why it happens:** Return state is encoded only in transient destination props or assumed from stack retention.  
**How to avoid:** Calendar owns state/scroll/ref map; push durable identity; restore through `useFocusEffect` after layout.  
**Warning signs:** destination calls a global reset, no event-keyed ref, no Back/focus test.  
[VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:290-292,354-365] [CITED: https://docs.expo.dev/versions/latest/sdk/router/]

### Pitfall 8: Read-only by omission while retaining mutation capability

**What goes wrong:** An accessibility action, keyboard shortcut, future refactor, or hidden menu can still invoke correction/resume/remove.  
**Why it happens:** The full runtime reaches Calendar detail and only rendering conditions differ.  
**How to avoid:** Use a discriminated/query-only capability that makes mutation props unrepresentable in Calendar origin; assert zero commands and unchanged source digest.  
**Warning signs:** Calendar passes `onResume`, `onRemoveFromHistory`, or `onCorrectWorkout`; route imports command ports.  
[VERIFIED: app/session/[sessionId].tsx:92-125] [VERIFIED: .planning/verification/v1.2-native-verification-matrix.md:87-89]

### Pitfall 9: Clearing real data during refresh/error

**What goes wrong:** A month navigation flash shows fake empty content or loses focus/selection; a stale failure replaces a newer success.  
**Why it happens:** Current code calls `setSnapshot(null)` on every request and renders a separate error screen.  
**How to avoid:** Separate initial loading from retained refresh, bind retries to exact request identity, and compare response generation before publish.  
**Warning signs:** grid unmounts for selection changes; generic global error route; retry changes selection.  
[VERIFIED: src/ui/screens/CalendarScreen.tsx:382-447] [VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:331-350]

### Pitfall 10: Treating downstream destination contracts as integrated routes

**What goes wrong:** CAL-17 tests pass against mocked `router.push`, but planned Running/Garmin taps lead to missing screens in the phase artifact.  
**Why it happens:** Phase 17/18 route targets are named in the parity matrix but come later in the roadmap.  
**How to avoid:** Make Phase 16 execution depend on Phase 17/18, then reserve CAL-17/CAL-20 closure for a final plan that opens the real `app/library/running/[planId].tsx` and `app/garmin/activity/[activityId].tsx` routes and proves Back/focus with their actual loaders. Never add fake detail screens.
**Warning signs:** a mocked `router.push`, href assertion, fixture/stub route, or pre-17/18 summary is counted as CAL-17 complete.
[VERIFIED: .planning/ROADMAP.md:158-196] [VERIFIED: .planning/design/v1.2-prototype-parity-matrix.md:134-140,169-169,196-197]

## Code Examples

### Inclusive threshold shared by preview and settle

<!-- DATA_K9D2S6M4_START -->

Locked values quoted verbatim: `abs(dx) >= viewportWidth × 0.25` with an inclusive `>=` comparison; track translation is clamped to `[-viewportWidth, +viewportWidth]`; month settle is `240ms, cubic-bezier(.22,.8,.3,1)`.

<!-- DATA_K9D2S6M4_END -->

[VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:223-240]

```typescript
export function crossesMonthBoundary(dx: number, viewportWidth: number): boolean {
  return Math.abs(dx) >= viewportWidth * 0.25;
}

export function clampMonthDrag(dx: number, viewportWidth: number): number {
  return Math.max(-viewportWidth, Math.min(viewportWidth, dx));
}
```

Both functions belong in the pure controller test surface; velocity must not appear in either signature. [VERIFIED: .planning/design/v1.2-SOURCE-PRECEDENCE.md:21-21]

### UI-thread manual intent arbitration

<!-- DATA_B1F7X3Q8_START -->

Locked values quoted verbatim: `7dp slop`; horizontal only when `abs(dx) >= abs(dy) × 1.15`; vertical displacement becoming dominant permanently yields to vertical scrolling.

<!-- DATA_B1F7X3Q8_END -->

[VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:223-225]

```typescript
const monthPan = Gesture.Pan()
  .manualActivation(true)
  .onTouchesMove((event, manager) => {
    const dx = /* displacement from captured first touch */;
    const dy = /* displacement from captured first touch */;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 7) return;
    if (Math.abs(dx) >= Math.abs(dy) * 1.15) manager.activate();
    else manager.fail();
  })
  .onUpdate((event) => {
    translationX.value = clampMonthDrag(event.translationX, viewportWidth.value);
  })
  .onFinalize(() => {
    // Dispatch exactly one guarded settle/snap/cancel resolution.
  });
```

The state-manager methods synchronously control gesture state in worklets; exact scroll composition must be closed with NV-CAL-03 rather than assumed from Jest. [CITED: https://docs.swmansion.com/react-native-gesture-handler/docs/2.x/gestures/state-manager/]

### Exact timed settle with cancellable shared value

```typescript
cancelAnimation(translationX);
translationX.value = withTiming(destinationX, {
  duration: reduceMotion ? REDUCED_MOTION_DURATION_MS : 240,
  easing: Easing.bezier(.22, .8, .3, 1),
}, (finished) => {
  if (finished) scheduleOnRN(completeIfCurrent, transitionEpoch);
});
```

`withTiming` accepts duration/easing/reduced-motion configuration and `cancelAnimation` safely cancels the animation paired to a shared value. The semantic controller still owns whether the completion epoch is current. [CITED: https://docs.swmansion.com/react-native-reanimated/docs/animations/withTiming/] [CITED: https://docs.swmansion.com/react-native-reanimated/docs/core/cancelAnimation/]

### Route-return focus without deprecated focus API

```typescript
useFocusEffect(useCallback(() => {
  const target = agendaRowRefs.current.get(triggerEventId);
  target?.focus();
  if (target) AccessibilityInfo.sendAccessibilityEvent(target, "focus");
}, [triggerEventId]));
```

Expo Router documents `useFocusEffect` for work whenever a route becomes focused. React Native documents `sendAccessibilityEvent(host, "focus")` as the replacement for deprecated `setAccessibilityFocus`; the target must remain a focusable host ref. [CITED: https://docs.expo.dev/versions/latest/sdk/router/] [CITED: https://reactnative.dev/docs/accessibilityinfo]

## State of the Art

| Old/live approach | Current Phase 16 approach | Source / impact |
|---|---|---|
| Sunday-first fixed 42-cell grid | Monday-first exact four/five/six complete weeks | Removes blank-row distortion and matches approved geometry. [VERIFIED: src/ui/screens/CalendarScreen.tsx:54-65,136-145] [VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:175-186] |
| Fixed 72dp end-only swipe | 1:1 three-panel drag with inclusive 25% width preview/settle | Correct at every viewport; title reverses immediately. [VERIFIED: src/ui/screens/CalendarScreen.tsx:55-56,208-220] [VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:217-240] |
| Date status glyph set | Stable typed per-event DTO with sport/source/destination identity | Supports same-day independent events and exact routing. [VERIFIED: src/domains/history/contracts.ts:69-86] [VERIFIED: .planning/architecture/v1.2-multi-active-plans.md:143-147] |
| Selected-date cards below static month | Measured selected/following week spatial morph with anchored agenda | Matches Revision 18 continuity and adjacent sequence. [VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:188-195,235-245] |
| Direct mutable session route | Query-only Calendar capability plus separate management origin | Prevents Calendar from acquiring correction/resume/remove authority. [VERIFIED: app/(tabs)/calendar.tsx:23-33] [VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:279-292] |
| Reanimated startup reduced-motion hook as common advice | Existing RN `AccessibilityInfo` runtime subscription feeds controller and animation policy | Satisfies runtime toggle and deterministic cancellation. [CITED: https://docs.swmansion.com/react-native-reanimated/docs/device/useReducedMotion/] [VERIFIED: src/ui/theme/index.ts:243-295] |
| Final screenshot/mocked duration proof | Timestamped intermediate geometry/semantics plus frame diagnostics and exact build identity | Closes Phase 16 gesture/hit/continuity claims; Phase 20 independently closes release/profile performance. [VERIFIED: .planning/verification/v1.2-native-verification-matrix.md:73-89,142-158] |

**Deprecated/outdated:**

- `AccessibilityInfo.setAccessibilityFocus`: deprecated by current React Native docs; use `sendAccessibilityEvent` with event type `focus`. [CITED: https://reactnative.dev/docs/accessibilityinfo]
- Calendar `.runOnJS(true)` pan for every native gesture decision: keep semantic bridge calls bounded; pointer updates stay workletized. [VERIFIED: src/ui/screens/CalendarScreen.tsx:208-220] [CITED: https://docs.swmansion.com/react-native-gesture-handler/docs/2.x/gestures/pan-gesture/]
- Prototype velocity fallback `0.45 px/ms`: resolved conflict C-04; forbidden by source precedence. [VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:223-231] [VERIFIED: .planning/design/v1.2-SOURCE-PRECEDENCE.md:21-21]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| — | None. Recommendations are grounded in locked Phase 16 artifacts, opened live sources, or cited official documentation. Proposed new internal file boundaries are explicitly recommendations, not claims that files already exist. | — | — |

## Resolved Questions and Execution Gates

1. **Phase 13 event and planned-Strength contracts — RESOLVED.**
   - Phase 13 Plan 13-05 owns `TrainingFoundationRuntimePort` and the bounded typed Calendar event range over `trainingCalendarRepository.ts`.
   - Phase 13 Plan 13-02 owns `PlannedStrengthOccurrenceDetail` in `src/domains/workout/index.ts`, `TrainingFoundationRuntimePort.loadPlannedStrengthOccurrence(occurrenceId: string): Promise<PlannedStrengthOccurrenceDetail | null>` in `src/bootstrap/trainingFoundationRuntime.ts`, and the exact-provenance repository loader in `src/platform/sqlite/repositories/plansWorkoutRepository.ts`.
   - Phase 16 preflights both exact contracts and stops if the DTO is not deeply immutable/target-bearing or stale provenance does not return `null`; it never invents a competing model or current-activation fallback.

2. **CAL-17 downstream destination closure — RESOLVED.**
   - Phase 17 Plan 17-08 owns `app/library/running/[planId].tsx` and `RunningPlanDetailScreen`.
   - Phase 18 Plan 18-08 owns `app/garmin/activity/[activityId].tsx` and `ImportedActivityDetailScreen`; Plan 18-14 owns Calendar-origin registration/return integration on the Garmin side.
   - Phase 16 full integration depends on those real outputs and closes in its final plan. Earlier union/component tests are not CAL-17 completion; mocked hrefs, fixture destinations, and placeholder screens are forbidden.

3. **Phase 15 presenter — RESOLVED.**
   - Phase 15 Plan 15-01 owns `src/domains/workout/workoutPresentation.ts` (`WorkoutPresentationModel`) and `src/ui/components/WorkoutSessionPresentation.tsx` (command-free presentation/disclosure).
   - Phase 16 preflights those exact exports and stops rather than duplicating the presenter or passing mutation capabilities.

4. **DEV-01 and DEV-02 outcome semantics — RESOLVED; owner choices remain pending.**
   - Open decisions or incomplete chosen-branch evidence yield `BLOCKED_OWNER` and prevent an all-pass result.
   - An accepted adaptation must pass its full native/reference and accessibility evidence.
   - A retained oracle with a continuing known failure needs a separately dated/scoped accepted exception; without it closure blocks, and with it the row is `ACCEPTED_EXCEPTION`, not PASS.

## Environment Availability

| Dependency | Required by | Available | Version / state | Fallback / action |
|---|---|---:|---|---|
| Node | all JS checks | ✓ | `v24.19.0` | Matches repository engine. [VERIFIED: package.json:6-10] |
| npm | dependency hydration/scripts | ✓ | `11.17.0` | Matches repository engine. [VERIFIED: package.json:6-10] |
| Locked node dependencies | typecheck/Jest/Expo | ✗ | `node_modules` absent; `npm ls` reports pins missing | Wave 0 `npm ci`; do not alter manifests. [VERIFIED: environment probe 2026-10-06] |
| Java default | Android tooling | △ | default `/usr/bin/java` is OpenJDK `27` | Export an approved Java 17 home before native work. [VERIFIED: environment probe 2026-10-06] |
| Java 17 installation | Android tooling | △ | Zulu `17.0.20.1` exists; repo doctor expects exact `17.0.20` Temurin | Run `npm run doctor:android`; install/select exact Temurin if strict check fails. [VERIFIED: scripts/doctor-android.sh:5-9,55-60] |
| Android SDK / adb | native gestures/evidence | △ | SDK exists at `/opt/homebrew/share/android-commandlinetools`; adb `1.0.41` / `37.0.1`, but env/PATH unset | Export both Android variables to that root or use existing resolver. [VERIFIED: scripts/doctor-android.sh:27-36,61-79] |
| Maestro | Android flow | ✓ | `2.8.0` | Matches repo doctor. [VERIFIED: scripts/doctor-android.sh:8-9,89-90] |
| Host `perfetto` CLI | frame trace processing | ✗ | not on PATH | Use Android `adb shell perfetto`/System Trace and add an explicit parser/export step; verify before evidence work. [VERIFIED: environment probe 2026-10-06] |
| Context7 CLI/MCP | documentation lookup | ✗ | unavailable in this researcher runtime | Official docs were fetched directly after the research seam selected Context7; claims remain `[CITED]`/MEDIUM, not promoted to Context7 HIGH. [VERIFIED: research protocol execution 2026-10-06] |

**Missing dependencies with no fallback for immediate automated checks:** locked `node_modules` until `npm ci` runs.

**Missing dependencies with fallback:** Android environment variables/adb PATH and host Perfetto; the installed SDK plus device-side trace path can satisfy later evidence after doctor/preflight.

No test, build, emulator, device mutation, or native evidence command was run during research. [VERIFIED: .planning/verification/v1.2-native-verification-matrix.md:30-32]

## Validation Architecture

### Test Framework

| Property | Value |
|---|---|
| Framework | Jest `29.7.0`, React Native Testing Library `14.0.1`, `node:sqlite` host tests, existing integration harness, planned Maestro v1.2 native flow [VERIFIED: package-lock.json:3188-3205,6596-6612] |
| Config file | `jest.config.js` with `unit`, `components`, `sqlite-host`, and `integration` projects [VERIFIED: jest.config.js:1-91] |
| Quick pure run | `npm run test:unit -- --runInBand src/domains/history/calendar.test.ts src/domains/scheduling/localDate.test.ts` [VERIFIED: package.json:23-28] |
| Quick component run | `npm run test:components -- --runInBand src/ui/__tests__/CalendarScreen.test.tsx src/ui/__tests__/CalendarTransitions.test.tsx src/ui/__tests__/PlannedWorkoutDetailScreen.test.tsx` [VERIFIED: package.json:23-28] [VERIFIED: .planning/verification/v1.2-native-verification-matrix.md:19-19,34-34] |
| Quick repository run | `npm run test:sqlite:host -- --runInBand tests/sqlite-host/trainingCalendarRepository.test.ts` after Phase 13 names are resolved [VERIFIED: package.json:25-27] |
| Full suite | `npm run test:all` [VERIFIED: package.json:72-73] |
| Coverage gate | `npm run test:coverage -- --runInBand`; global 85% branches / 90% functions/lines/statements plus 100% on registered integrity files [VERIFIED: jest.config.js:10-25] [VERIFIED: scripts/run-coverage-gate.mjs:16-123,171-203] |
| Native/evidence | Planned `maestro/v1.2/calendar.yaml`, `scripts/run-v12-maestro.mjs`, `scripts/verify-v12-native-evidence.mjs`, `scripts/v12-evidence-scripts.test.mjs`, `scripts/benchmark-v12-interactions.mjs` [VERIFIED: .planning/verification/v1.2-native-verification-matrix.md:34-34] |

### Phase Requirements → Test Map

| Req IDs | Behavior | Test type | Automated command / evidence | File exists? |
|---|---|---|---|---|
| CAL-01–06 | Monday grid; variable rows; key; shared tracks; two events; selected/today/outside/rest/empty; semantic labels | unit + component + native visual/bounds | quick pure + component runs; Light/Dark identical-fixture overlays at all required viewports | Current files exist; Phase 16 cases/Wave 0 fixtures missing |
| CAL-07–09 | 1:1 drag; 7dp/1.15 intent; inclusive 25%; no velocity; 240ms exact easing; cancellation/epoch | pure controller + component + native gesture/frame | `CalendarTransitions.test.tsx`; NV-CAL-01–03; 10/24.9/25/25.1 traces both directions | ❌ Wave 0 transition/evidence files |
| CAL-10–11 | Previous/Next/Today clamp; actual local today; arrows ±1/±7; activation/focus | unit + component + D-pad native | pure/localDate tests + `CalendarScreen.test.tsx` + keyboard/D-pad trace | Current partial; new Today/focus cases missing |
| CAL-12–15 | expand/collapse/adjacent sequence; measured first/middle/last rows; reduced-motion equivalence/runtime toggle | pure controller + component + native geometry | NV-CAL-04–08; timestamped coordinates/captures; normal/reduced paired ledger | ❌ Wave 0 transition/native flow |
| CAL-16–17 | one agenda action; exact identity dispatch for every event kind; real Running/Garmin destination load and Back | component + real cross-route + native | `CalendarScreen.test.tsx` source-order/union cases plus final route tests against Phase 17 Plan 17-08 and Phase 18 Plans 18-08/18-14 outputs | Current test exists; real downstream routes are explicit prerequisites |
| CAL-18–20 | read-only committed/partial detail; occurrence preview; disclosures; Back restores state/focus/scroll | component + route + native Back | `CalendarTransitions.test.tsx`, `PlannedWorkoutDetailScreen.test.tsx`, shared session detail regressions, Android Back/focus trace | Planned preview files missing; current management test exists |
| CAL-21 | initial/loading/refresh/zero/rest/stale/error/retry/missing; last-good state; stale response suppression | unit + component + repository | controller/query tests + `CalendarScreen.test.tsx` deferred-promise race cases | Current basic retry exists; retained/race cases missing |
| CAL-22–23 | correction/resume/remove preserved only in management; Calendar issues zero mutation | component + route + integration + source digest | targeted `WorkoutCompletionScreen.test.tsx`, `SessionCorrectionScreen.test.tsx`, `RemovedSessionsScreen.test.tsx`; native pre/post digest | Existing regressions present; Calendar-origin zero-command tests missing |
| CAL-01–23 | query latency and UI frame work diagnostics | native diagnostic producer | ≥100 query samples; ≥100 complete gesture/morph sequences; raw values/missed frames/refresh rate/overhead; no Phase 16 acceptance verdict | ❌ planned diagnostic/evidence scripts; Phase 20 Plan 20-08 owns acceptance |

### Exact Transition and Geometry Matrix

- Drag samples: `10%`, `24.9%`, `25%`, `25.1%`, both directions; release below/exact/above; high-velocity sub-threshold; threshold cross then retreat; pointer cancel; vertical/diagonal; row-origin scroll. [VERIFIED: .planning/verification/v1.2-native-verification-matrix.md:73-81]
- Month/date samples: December↔January; leap February; four/five/six rows; selected row first/middle/last; following week across month boundary; shorter-month clamp; today from distant month. [VERIFIED: .planning/verification/v1.2-native-verification-matrix.md:73-75] [VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:367-377]
- Concurrency samples: rapid repeated taps, reverse during settle, second drag, rotation, background/cancel, width/font change, stale query response, completion callback versus fallback. [VERIFIED: .planning/verification/v1.2-native-verification-matrix.md:84-86]
- Motion samples: normal; reduced before mount; runtime toggle during drag/settle/expand/collapse; destinations/date/agenda/focus identical. [VERIFIED: .planning/verification/v1.2-native-verification-matrix.md:86-86]
- Routing samples: complete/partial/planned Strength; planned Running; imported outdoor/treadmill; stale/missing identity; each Back return; no source mutation. [VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:279-292,367-377]

### Sampling Rate

- **Per task commit:** relevant quick pure/component/repository command; all must run after `npm ci`.
- **Per wave merge:** `npm run typecheck && npm run lint && npm run check:boundaries && npm run test:unit -- --runInBand && npm run test:components -- --runInBand && npm run test:sqlite:host -- --runInBand && npm run test:integration -- --runInBand`.
- **Before native evidence:** `npm run test:coverage -- --runInBand` plus evidence-validator tests; exact reviewed source/build manifest.
- **Phase gate:** full automated suite green; real Phase 17/18 destination journeys pass; NV-CAL-01–09 functional assertions have intermediate evidence; every mapped native/reference/overlay/difference artifact is present and explained; zero mutation digest holds; DEV-01/02 outcome rules are enforced; query/frame diagnostic samples are complete and handed to Phase 20 without a Phase 16 release/profile verdict.

### Wave 0 Gaps

- [ ] `npm ci` — materialize the checked-in lock before any JS checks; manifests remain unchanged.
- [ ] Resolve and verify Phase 13's typed Calendar range read plus exact `TrainingFoundationRuntimePort.loadPlannedStrengthOccurrence(occurrenceId)` / `PlannedStrengthOccurrenceDetail`; stop if the planned contract or real SQLite tests are absent.
- [ ] Resolve Phase 15's exact `WorkoutPresentationModel` and `WorkoutSessionPresentation` exports; stop if the presenter accepts mutation capabilities.
- [ ] Before the final integration plan, require Phase 17 `17-08-SUMMARY.md` and real Running route tests plus Phase 18 `18-08-SUMMARY.md`/`18-14-SUMMARY.md` and real imported-activity/Calendar-origin route tests.
- [ ] `src/ui/__tests__/CalendarTransitions.test.tsx` — pure/controlled interaction matrix for CAL-07–15 and CAL-20/21; this is a planned path. [VERIFIED: .planning/verification/v1.2-native-verification-matrix.md:34-34]
- [ ] `src/ui/__tests__/PlannedWorkoutDetailScreen.test.tsx` — occurrence preview/missing identity for CAL-19; this is a planned path. [VERIFIED: .planning/design/v1.2-prototype-parity-matrix.md:136-136]
- [ ] `maestro/v1.2/calendar.yaml` — native gestures, Back, focus, viewports, reduced motion; this is a planned path. [VERIFIED: .planning/verification/v1.2-native-verification-matrix.md:34-34]
- [ ] `.planning/phases/16-calendar-parity/16-REFERENCE-MAP.json`, `scripts/compare-v12-calendar.mjs`, and `scripts/v12-calendar-comparison.test.mjs` — exact Revision 18 mapping plus fail-closed individual overlay/difference generation and classification.
- [ ] `scripts/run-v12-maestro.mjs`, `scripts/verify-v12-native-evidence.mjs`, `scripts/v12-evidence-scripts.test.mjs` — identity-bound evidence envelope and adversarial checker tests; these are planned paths. [VERIFIED: .planning/verification/v1.2-native-verification-matrix.md:34-34]
- [ ] `scripts/benchmark-v12-interactions.mjs` — raw query/frame samples, refresh rate, missed frames, profiler overhead; this is a planned path. [VERIFIED: .planning/verification/v1.2-native-verification-matrix.md:34-34,152-154]
- [ ] Add the pure transition controller to `scripts/run-coverage-gate.mjs` if classified integrity-critical; cover every cancellation/epoch/reduced-motion branch at 100%. [VERIFIED: .trae/rules/rules.md:22-23]
- [ ] Add two owner-checkpoint comparison fixtures/evidence rows for DEV-01 and DEV-02 before affected styles.

## Security Domain

Security enforcement is enabled at ASVS Level 1 and blocks on high severity. [VERIFIED: .planning/config.json:47-49]

### Applicable ASVS Categories

| ASVS category | Applies | Standard control |
|---|---|---|
| V2 Authentication | No | Phase is a local single-owner read surface and adds no authentication mechanism. Do not widen scope. [VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:37-53] |
| V3 Session Management | No | Workout session IDs are domain entity identities, not authentication sessions; no auth cookie/token lifecycle enters this phase. [VERIFIED: src/domains/history/contracts.ts:44-55] |
| V4 Access Control | Yes (capability integrity) | Calendar origin receives query-only capabilities; management origin alone receives correction/resume/remove commands. Test absence of handlers, accessibility actions and source writes. [VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:279-292] |
| V5 Input Validation | Yes | Parse/validate LocalDate and route identities; bound viewport/gesture numbers; exact typed destination switch; missing/stale identity state; repository parameterization. [VERIFIED: src/domains/scheduling/localDate.ts:35-68,129-163] [VERIFIED: src/platform/sqlite/repositories/historyRepository.ts:647-658,760-795] |
| V6 Cryptography | No | Phase adds no secrets, credentials, hashing or encryption. Existing backup cryptography is outside scope. [VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:37-53] |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard mitigation |
|---|---|---|
| Tampered/deep-linked session, occurrence, plan or activity ID | Spoofing / Tampering | Validate exact typed identity and ownership in read port; render unavailable state; never fall through to another record or fixture. [VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:279-288,347-348] |
| Calendar route obtains mutation callbacks | Tampering / Elevation of privilege | Compile-time query-only capability; route/component negative tests; source digest unchanged after navigation/disclosure. [VERIFIED: .planning/verification/v1.2-native-verification-matrix.md:87-89] |
| Stale query/animation callback overwrites current intent | Tampering | Request/transition epochs, cancellation, exact-range check, latest-valid completion only. [VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:230-245,336-350] |
| Planned/imported event fabricated as Strength session | Tampering | Discriminated destination; occurrence/import IDs remain separate; no fake session/result/completion. [VERIFIED: .planning/architecture/v1.2-multi-active-plans.md:143-147] |
| Sensitive workout facts leak through evidence/logs | Information disclosure | Use deterministic synthetic fixtures, aggregate performance values, hashed artifact/source identity, and screenshots scoped to fixture data; never record personal source rows/files. [VERIFIED: .planning/verification/v1.2-native-verification-matrix.md:67-68,181-186] |
| Gesture flood or repeated taps trigger duplicate navigation/query | Denial of service / Tampering | Reject second drag while settling; busy/request identity; one route activation per event; bounded range query. [VERIFIED: .planning/phases/16-calendar-parity/16-UI-SPEC.md:230-233,336-350] |

## Sources

### Primary (HIGH confidence)

- `.planning/phases/16-calendar-parity/16-CONTEXT.md` — locked decisions, scope and checkpoints.
- `.planning/phases/16-calendar-parity/16-UI-SPEC.md` — approved geometry, state, copy, motion, focus, performance and evidence contract.
- `.planning/REQUIREMENTS.md:90-114` and `.planning/ROADMAP.md:138-156` — CAL-01..23, goal, dependencies and success criteria.
- `.planning/v1.2-OWNER-BRIEF.md:88-104` — owner Calendar oracle.
- `.planning/design/v1.2-SOURCE-PRECEDENCE.md` and `v1.2-DEVIATIONS.md` — resolved conflicts and open DEV-01/02.
- `.planning/design/v1.2-browser-evidence/calendar-pointer-evidence.json` — observed pointer/title sequence.
- `.planning/design/v1.2-prototype-parity-matrix.md:114-140` — exact production targets/tests/evidence.
- `.planning/verification/v1.2-native-verification-matrix.md:11-34,64-89,142-158` — test architecture, NV-CAL and performance gates.
- `.planning/phases/13-multi-plan-running-foundation/13-02-PLAN.md` — exact planned-Strength occurrence loader/type contract.
- `.planning/phases/17-library-running-plans/17-08-PLAN.md` and `.planning/phases/18-garmin-import/18-08-PLAN.md` / `18-14-PLAN.md` — real downstream route ownership and Calendar-origin integration prerequisites.
- `.planning/phases/20-native-acceptance/20-06-PLAN.md` / `20-08-PLAN.md` — shared visual-comparison contract and release/profile performance acceptance ownership.
- Opened live sources: `CalendarScreen.tsx`, history contracts/repository, LocalDate, routes/runtime, SessionDetailScreen, theme/focus primitives, current tests and coverage checker.

### Secondary (MEDIUM confidence)

- [Gesture Handler 2.x Pan gesture](https://docs.swmansion.com/react-native-gesture-handler/docs/2.x/gestures/pan-gesture/) — worklet callbacks, offsets, manual activation, finalize.
- [Gesture state manager](https://docs.swmansion.com/react-native-gesture-handler/docs/2.x/gestures/state-manager/) — synchronous `activate()`/`fail()` in worklets.
- [Reanimated `withTiming`](https://docs.swmansion.com/react-native-reanimated/docs/animations/withTiming/) — duration/easing/reduced-motion configuration.
- [Reanimated `cancelAnimation`](https://docs.swmansion.com/react-native-reanimated/docs/core/cancelAnimation/) — shared-value cancellation.
- [Reanimated `measure`](https://docs.swmansion.com/react-native-reanimated/docs/advanced/measure/) — UI-thread dimensions/position and null handling.
- [Reanimated `useReducedMotion`](https://docs.swmansion.com/react-native-reanimated/docs/device/useReducedMotion/) — startup snapshot/runtime rerender limitation.
- [React Native AccessibilityInfo](https://reactnative.dev/docs/accessibilityinfo) and [View](https://reactnative.dev/docs/view) — runtime motion event, focus event, focusable/directional focus.
- [Expo Router reference](https://docs.expo.dev/versions/latest/sdk/router/) — `useFocusEffect`, local params and imperative routing.
- npm registry metadata retrieved 2026-10-06 — pinned version existence/publication dates only; package identity remains grounded in repo lock and official docs.

### Tertiary (LOW confidence)

- None. No training-only implementation claim is used.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — exact pins opened in `package.json`/`package-lock.json`; APIs cross-checked against official docs.
- Architecture: HIGH for locked responsibilities and current-code gaps; MEDIUM for proposed internal component split pending Phase 13/15 final exported symbols.
- Pitfalls: HIGH — directly derived from current implementation versus locked UI/evidence contracts.
- Validation: HIGH for commands/framework/current gaps; native evidence remains future/not run.

**Research date:** 2026-10-06  
**Valid until:** 2026-11-05 for stable project contracts; re-check official library docs if pins change.

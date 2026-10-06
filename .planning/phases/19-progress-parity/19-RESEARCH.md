# Phase 19: Progress Parity - Research

**Researched:** 2026-10-06 [VERIFIED: system date and `.planning/phases/19-progress-parity/19-CONTEXT.md:3-4`]
**Domain:** React Native factual progress projections, effective Strength history, accepted imported Running evidence, revision-fenced goals/recommendations, and optional dated bodyweight [VERIFIED: `.planning/phases/19-progress-parity/19-CONTEXT.md:7-11`]
**Confidence:** MEDIUM — locked behavior and the shipped Strength seams are directly verified, while Phase 13/17/18 Running, target, import, and bodyweight ports are planned upstream artifacts rather than current source files. [VERIFIED: `.planning/design/v1.2-prototype-parity-matrix.md:43-50`, `.planning/design/v1.2-prototype-parity-matrix.md:208-225`]

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

DATA_4C91A7E2_START
### Evidence and goals
- **D19-01:** Tabs are All, Strength, Running; ranges are 4 weeks, 12 weeks, All time. Preserve selection/focus and source-error recovery.
- **D19-02:** Show Latest, Best, Target, Gap, goal-line history, Evidence and Next target only when comparable durable facts exist.
- **D19-03:** Honest states include loading, empty, sparse, More data needed, rebuild pending, and error/retry. Missing values never plot as zero.
- **D19-04:** The 2.4 km goal stays 11:00 (4:35/km, 1:50/400m, 0:55/200m). 10 km and Half Marathon targets remain unset until owner entry.
- **D19-05:** Running best efforts come from accepted imported activities. No fixture, schedule intent, or unmatched estimate becomes performance evidence.
- **D19-06:** Recommendations retain evidence/revision fencing and explicit Keep current/Use target. No silent target mutation.
- **D19-07:** Optional dated bodyweight enables relative-strength views only, discloses its measurement basis, and never changes targets.
DATA_4C91A7E2_END

[VERIFIED: `.planning/phases/19-progress-parity/19-CONTEXT.md:18-25`]

### Claude's Discretion

DATA_8B2F0D6C_START
- Chart sampling/layout using existing SVG, provided accessible text/data equivalents and source evidence remain available.
DATA_8B2F0D6C_END

[VERIFIED: `.planning/phases/19-progress-parity/19-CONTEXT.md:27-29`]

### Deferred Ideas (OUT OF SCOPE)

DATA_A63E19B4_START
Readiness, composite fitness, muscle heat maps, invented 10 km/Half targets, automatic bodyweight-driven progression.
DATA_A63E19B4_END

[VERIFIED: `.planning/phases/19-progress-parity/19-CONTEXT.md:64-68`]
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|---|---|---|
| PRO-01 | Provide All, Strength and Running tabs plus 4 weeks, 12 weeks and All time ranges with selected/accessibility state and keyboard alternatives. | Add a sport discriminator beside the existing `ProgressPeriod`; retain both selections through reads, details, retries, and rebuilds. [VERIFIED: `.planning/REQUIREMENTS.md:176`, `src/domains/progress/contracts.ts:10-15`, `.planning/phases/19-progress-parity/19-UI-SPEC.md:238-244`] |
| PRO-02 | Show nearest active goal with Latest, Best, Target and personal-history goal line, active goals and planned-next context from real comparable facts. | Compute the All view in a pure domain projection over persisted targets and factual series; never select in the component or normalize Strength and Running into a score. [VERIFIED: `.planning/REQUIREMENTS.md:177`, `.planning/phases/19-progress-parity/19-UI-SPEC.md:246-268`] |
| PRO-03 | Show primary strength goal, gap/status, Needs review and exercise-progress rows using comparable completed history. | Reuse `isMetricExposureEligible`, `areMetricExposuresComparable`, `compareMetricObservations`, effective overlays, and source references. [VERIFIED: `.planning/REQUIREMENTS.md:178`, `src/domains/metrics/exposure.ts:40-50`, `src/domains/metrics/exposure.ts:131-145`, `src/domains/progress/periodProjection.ts:304-369`] |
| PRO-04 | Show latest/best/target/gap, goal-line trend, running goals, best efforts and derived pacing from imported activities. | Consume the Phase 13/18 accepted imported-activity read boundary; group only exact distance plus documented time basis, and keep target history separate. [VERIFIED: `.planning/REQUIREMENTS.md:179`, `.planning/architecture/v1.2-garmin-import.md:130-145`, `.planning/architecture/v1.2-garmin-import.md:147-157`] |
| PRO-05 | Keep the default 2.4 km goal at 11:00 with 4:35/km, 1:50/400 m and 0:55/200 m; derive changes only from explicit owner-selected targets. | Model 11:00 as the default source target when no later explicit revision exists; derive pacing only from the committed target. [VERIFIED: `.planning/REQUIREMENTS.md:180`, `.planning/phases/19-progress-parity/19-UI-SPEC.md:278-284`] |
| PRO-06 | Keep 10 km and Half Marathon target times unset until chosen; show Set target/Target unset and No effort recorded without plotting zero. | Preserve nullable target and effort facts through the projection; `null` never crosses the presentation boundary as `0`. [VERIFIED: `.planning/REQUIREMENTS.md:181`, `.planning/phases/19-progress-parity/19-UI-SPEC.md:283-286`, `.planning/phases/19-progress-parity/19-UI-SPEC.md:424-429`] |
| PRO-07 | Provide ready, sparse, empty and loading presentations: one effort says More data needed, missing imports show no zero chart, loading communicates busy. | Use an explicit read-state union and a one-point chart state; do not infer a line/direction. [VERIFIED: `.planning/REQUIREMENTS.md:182`, `.planning/phases/19-progress-parity/19-UI-SPEC.md:294-303`, `.planning/phases/19-progress-parity/19-UI-SPEC.md:418-430`] |
| PRO-08 | Provide source-loading failure/retry and stale/rebuilding projection states without losing current sport/range or reporting unreliable results. | Extend the existing freshness gate; suppress projection values when any required Strength or Running subject is behind and preserve selection outside the loaded snapshot. [VERIFIED: `.planning/REQUIREMENTS.md:183`, `src/platform/sqlite/repositories/progressRepository.ts:320-397`, `src/ui/screens/ProgressScreen.tsx:637-680`] |
| PRO-09 | Open primary chart/exercise/best-effort details with an accessible history chart, separate goal line and clear empty state. | Create the planned `RunningHistorySheet`; both chart and `Show history data` consume one typed factual series. [VERIFIED: `.planning/REQUIREMENTS.md:184`, `.planning/design/v1.2-prototype-parity-matrix.md:216`, `.planning/phases/19-progress-parity/19-UI-SPEC.md:290-322`] |
| PRO-10 | Preserve the existing exercise-history route, comparable metric facts, source sessions, empty/error/loading states and return navigation. | Extend, do not replace, `app/exercise-history/[exerciseId].tsx`, `ExerciseHistoryScreen`, `buildExerciseMetricHistory`, and `loadExerciseMetricHistory`. [VERIFIED: `.planning/REQUIREMENTS.md:185`, `app/exercise-history/[exerciseId].tsx:13-33`, `src/ui/screens/ExerciseHistoryScreen.tsx:140-321`, `src/domains/history/metricHistory.ts:181-210`] |
| PRO-11 | Offer Load/Relative only when a valid optional bodyweight exists for a load metric; disclose its measurement basis and never change targets. | Require Phase 13's dated measurement fact and return the chosen basis with every relative point; the UI only formats the supplied view transform. [VERIFIED: `.planning/REQUIREMENTS.md:186`, `.planning/phases/19-progress-parity/19-UI-SPEC.md:338-346`, `.planning/design/v1.2-prototype-parity-matrix.md:50`] |
| PRO-12 | Edit Distance, Target time, Optional target date and Available training days while showing a read-only Current benchmark and explicit Save target/Cancel. | Reuse the Phase 13/17 Running goal source and command; the Phase 19 sheet owns only draft/presentation. [VERIFIED: `.planning/REQUIREMENTS.md:187`, `.planning/phases/17-library-running-plans/17-UI-SPEC.md:337-366`, `.planning/phases/19-progress-parity/19-UI-SPEC.md:348-369`] |
| PRO-13 | Persist validated target edits to source facts; reject invalid time/date without losing draft and keep plan/detail/Progress goal displays consistent. | One revision-checked, request-receipted target command must serve Library detail and Progress, followed by authoritative read-back. [VERIFIED: `.planning/REQUIREMENTS.md:188`, `.planning/phases/19-progress-parity/19-UI-SPEC.md:361-369`, `src/domains/plans/ownedPlanCommands.ts:95-100`, `src/domains/plans/ownedPlanCommands.ts:459-494`] |
| PRO-14 | Show Review target with Current/Proposed values, personal-history evidence and Keep current/Use target choices. | Reuse the review branch of `RecommendationSurface` and the validated evidence envelope, but restyle it into the approved sheet and exact actions. [VERIFIED: `.planning/REQUIREMENTS.md:189`, `src/ui/components/RecommendationSurface.tsx:116-203`, `.planning/phases/19-progress-parity/19-UI-SPEC.md:371-382`] |
| PRO-15 | Persist acceptance/keep decisions once with revision checks; keep failure/retry visible and prevent a dismissed recommendation reappearing from a fixture rerender. | Preserve existing source/target revision fencing, add request-replay receipts, and change the current repeated-decision conflict into same-request replay. [VERIFIED: `.planning/REQUIREMENTS.md:190`, `src/platform/sqlite/repositories/workoutOutcomeRepository.ts:2383-2588`, `tests/integration/load-reps.test.ts:1566-1589`] |
| PRO-16 | Keep Body metrics/Settings and Bodyweight history reachable; explain personal history and optional measurements without collecting gender/height or creating a score. | Use Phase 14 header/sheet primitives and Phase 13 bodyweight port; no demographic fields enter the contract. [VERIFIED: `.planning/REQUIREMENTS.md:191`, `.planning/phases/19-progress-parity/19-UI-SPEC.md:384-390`] |
| PRO-17 | Show optional empty/bodyweight history with Add first entry/Add entry, dated values, Edit and two-step Delete/Confirm. | Build the two planned sheets over Phase 13 bodyweight CRUD; confirmation remains row-specific until commit/read-back. [VERIFIED: `.planning/REQUIREMENTS.md:192`, `.planning/phases/19-progress-parity/19-UI-SPEC.md:392-410`, `.planning/design/v1.2-prototype-parity-matrix.md:224-225`] |
| PRO-18 | Provide dated kg input with Add/Edit, Save entry/Cancel, error feedback and persistence; enforce reviewed valid measurement/date bounds. | Validate the exact UI bounds in a pure command before SQLite and keep draft/focus through invalid, stale, or failed saves. [VERIFIED: `.planning/REQUIREMENTS.md:193`, `.planning/phases/19-progress-parity/19-UI-SPEC.md:402-410`] |
</phase_requirements>

## Summary

Phase 19 should extend the shipped factual Strength pipeline instead of replacing it: `progressRepository.load` freshness-gates disposable history projections, `projectProgressPeriod` groups comparable effective working sets, `ProgressScreen` exposes source drill-downs, `ExerciseHistoryScreen` reads comparable metric history, and recommendation acceptance is already source/target-revision fenced. [VERIFIED: `src/platform/sqlite/repositories/progressRepository.ts:320-505`, `src/domains/progress/periodProjection.ts:455-556`, `src/ui/screens/ProgressScreen.tsx:637-830`, `src/platform/sqlite/repositories/workoutOutcomeRepository.ts:2383-2588`]

The main planning boundary is that current Progress is Strength/session-set shaped, while Running goals/imports and dated bodyweight are Phase 13/17/18 upstream authorities. The parity matrix marks `src/domains/running/`, `src/domains/activities/`, `runningPlanRepository.ts`, `importedActivityRepository.ts`, and `bodyweightRepository.ts` as proposed upstream targets; Phase 19 must consume those typed ports after they land and must not introduce substitute tables, fixture facts, or screen-owned derivations. [VERIFIED: `.planning/design/v1.2-prototype-parity-matrix.md:43-50`, `.planning/phases/13-multi-plan-running-foundation/13-CONTEXT.md:9-12`, `.planning/phases/18-garmin-import/18-CONTEXT.md:49-57`]

The highest-risk seams are consistency and replay: the current Progress repository performs freshness and data queries outside `SqliteKernel.readSnapshot`, the current UI polls rebuilding projections every quoted `250` milliseconds, and the current recommendation integration test explicitly rejects repeated decisions. Phase 19 requires one read snapshot, generation/event-driven refresh with a bounded fallback, and request-receipted replay semantics before its UI can truthfully claim one revision set and exactly-once decisions. [VERIFIED: `src/platform/sqlite/repositories/progressRepository.ts:330-505`, `src/platform/sqlite/sqliteKernel.ts:179-205`, `src/ui/screens/ProgressScreen.tsx:672-680`, `tests/integration/load-reps.test.ts:1566-1589`]

**Primary recommendation:** Freeze one typed `Progress` read/command boundary after Phases 13, 14, 17, and 18: SQLite/read-model code returns sport-specific factual projections and command outcomes; Phase 19 components only retain navigation state, render exact states, submit explicit commands, and reload authoritative facts. [VERIFIED: `.planning/ROADMAP.md:198-216`, `.planning/v1.2-OWNER-BRIEF.md:54-65`]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|---|---|---|---|
| Accepted Running effort, target revision, recommendation decision, and bodyweight fact authority | Database / Storage | Application domain | SQLite remains authoritative; imported payloads and match events are source aggregates while projections are rebuildable. [VERIFIED: `.trae/rules/rules.md:18-23`, `.planning/architecture/v1.2-garmin-import.md:77-93`] |
| Strength and Running comparability, Best/Latest/Gap, target-at-date, nearest goal, and relative-strength basis | Application domain | Database / Storage | Comparator and eligibility decisions already live in pure metric/history code; screens must not create another analytics authority. [VERIFIED: `src/domains/metrics/exposure.ts:40-50`, `src/domains/metrics/exposure.ts:131-145`, `.planning/phases/19-progress-parity/19-CONTEXT.md:7-11`] |
| Progress root, charts, data equivalents, sheets, state retention, focus, and copy | Browser / Client (React Native) | Application domain | The client renders a typed projection and submits commands; it does not query SQL or infer missing facts. [VERIFIED: `.planning/v1.2-OWNER-BRIEF.md:54-65`, `.planning/phases/19-progress-parity/19-UI-SPEC.md:91-117`] |
| Target, recommendation, and bodyweight mutations | Application domain | Database / Storage | Validation, request identity, expected revision, exclusive commit, receipt replay, and authoritative read-back belong below UI. [VERIFIED: `src/domains/plans/ownedPlanCommands.ts:95-100`, `src/domains/plans/ownedPlanCommands.ts:459-494`, `.planning/phases/19-progress-parity/19-UI-SPEC.md:361-410`] |
| Imported activity detail/source navigation | Browser / Client (React Native) | Application domain | Phase 19 navigates by opaque accepted source identity; parsing, correction, removal, and payload acceptance remain Phase 18/activities responsibilities. [VERIFIED: `.planning/architecture/v1.2-garmin-import.md:61-73`, `.planning/phases/19-progress-parity/19-UI-SPEC.md:328-336`] |

## Project Constraints (from .trae/rules/rules.md)

- Read and honor repository `AGENTS.md`; architecture work is routed through the engineering-review criteria. [VERIFIED: `.trae/rules/rules.md:1-3`, `AGENTS.md:1-18`]
- Keep SQLite source facts authoritative. [VERIFIED: `.trae/rules/rules.md:16-19`]
- Keep notifications, projections, and recommendations replayable or rebuildable. [VERIFIED: `.trae/rules/rules.md:19-19`]
- Do not acknowledge a set before its exclusive transaction commits; Phase 19 applies the same commit-before-success rule to target, recommendation, and bodyweight commands. [VERIFIED: `.trae/rules/rules.md:20-20`, `.planning/phases/19-progress-parity/19-UI-SPEC.md:102-103`]
- Preserve bundled versus user-owned data boundaries. [VERIFIED: `.trae/rules/rules.md:21-21`]
- Keep the workout critical path offline; Progress reads and manual decisions must not depend on Garmin networking. [VERIFIED: `.trae/rules/rules.md:22-22`, `.planning/architecture/v1.2-garmin-import.md:117-128`]
- Write tests with every behavior; integrity-critical modules require complete branch coverage. [VERIFIED: `.trae/rules/rules.md:23-23`]
- Use atomic commits and the exact co-author trailer when a later executor commits; this research agent was explicitly instructed not to commit. [VERIFIED: `.trae/rules/rules.md:24-26`]
- The two legacy text source documents declared at `.trae/rules/rules.md:7-10` are absent at their configured paths in this worktree environment; the approved v1.2 owner brief, Phase 19 context/UI spec, parity matrix, and ADRs are available and higher-priority for this phase. [VERIFIED: `.trae/rules/rules.md:5-14`; filesystem audit on 2026-10-06; `.planning/phases/19-progress-parity/19-UI-SPEC.md:20-36`]

## Standard Stack

The phase adds no package. The locked existing versions relevant to Phase 19 are quoted verbatim below so the planner does not silently upgrade an Expo-compatible set. [VERIFIED: `package.json:92-132`]

DATA_D12F87A0_START
```json
"expo": "~57.0.25",
"expo-router": "~57.0.23",
"expo-sqlite": "~57.0.3",
"react": "19.2.3",
"react-native": "0.86.3",
"react-native-svg": "15.15.4",
"zod": "4.4.3",
"@testing-library/react-native": "14.0.1",
"jest": "29.7.0",
"jest-expo": "~57.0.5",
"typescript": "~6.0.3"
```
DATA_D12F87A0_END

[VERIFIED: `package.json:92-132`]

### Core

| Library | Locked version | Purpose | Why standard here |
|---|---:|---|---|
| Expo / React Native | `~57.0.25` / `0.86.3` | Native application and accessibility primitives | Existing app stack and Phase 14 shell authority; do not upgrade inside Phase 19. [VERIFIED: `package.json:96-114`, `.planning/phases/19-progress-parity/19-UI-SPEC.md:76-89`] |
| `expo-sqlite` | `~57.0.3` | Durable facts, commands, receipts, and read snapshots | Existing `SqliteKernel` supplies exclusive writes and `readSnapshot`; screens never execute SQL. [VERIFIED: `package.json:109-109`, `src/platform/sqlite/sqliteKernel.ts:38-60`, `src/platform/sqlite/sqliteKernel.ts:156-205`] |
| `react-native-svg` | `15.15.4` | Straight factual polylines, point marks, and separate goal line | Already installed and explicitly required by the UI contract; no chart package is authorized. [VERIFIED: `package.json:121-121`, `.planning/phases/19-progress-parity/19-UI-SPEC.md:76-89`, `.planning/phases/19-progress-parity/19-UI-SPEC.md:597-604`] |
| Zod | `4.4.3` | Pure input/schema validation at domain boundaries | Existing metric contracts use strict schemas; target/bodyweight validation should follow that boundary. [VERIFIED: `package.json:123-123`, `src/domains/metrics/comparators.ts:26-29`, `src/domains/metrics/comparators.ts:217-230`] |

### Supporting

| Library | Locked version | Purpose | When to use |
|---|---:|---|---|
| Expo Router | `~57.0.23` | Progress root and existing exercise/import detail routes | Preserve `app/(tabs)/progress.tsx` and `app/exercise-history/[exerciseId].tsx`; add no fifth root. [VERIFIED: `package.json:106-106`, `app/(tabs)/progress.tsx:13-42`, `app/exercise-history/[exerciseId].tsx:13-33`] |
| Jest / jest-expo | `29.7.0` / `~57.0.5` | Unit, component, SQLite-host, and integration contracts | Existing four-project configuration is the phase validation foundation. [VERIFIED: `package.json:125-132`, `jest.config.js:26-90`] |
| Testing Library React Native | `14.0.1` | Semantic component behavior and focus/state assertions | Use for tabs/ranges, sheets, error recovery, busy/disabled states, and exact copy. [VERIFIED: `package.json:126-126`, `src/ui/__tests__/ProgressScreen.test.tsx:164-375`] |

### Alternatives Considered

| Instead of | Could use | Decision / tradeoff |
|---|---|---|
| Existing SVG primitives | New chart dependency | Rejected: the approved UI contract explicitly authorizes the existing SVG stack and no new chart/UI package. [VERIFIED: `.planning/phases/19-progress-parity/19-UI-SPEC.md:76-89`, `.planning/phases/19-progress-parity/19-UI-SPEC.md:597-604`] |
| Existing SQLite facts and projections | Local component cache/localStorage analytics | Rejected: fixtures/localStorage are presentation evidence only and SQLite is behavioral authority. [VERIFIED: `.planning/phases/19-progress-parity/19-UI-SPEC.md:20-36`] |
| Existing effective metric comparator registry | Progress-specific Strength comparison rules | Rejected: it would fork metric eligibility/comparator semantics and make corrections disagree. [VERIFIED: `src/domains/metrics/exposure.ts:40-50`, `src/domains/metrics/exposure.ts:86-145`, `src/domains/metrics/comparators.ts:122-215`] |

**Installation:** No phase-specific package installation is authorized. If the executor must restore the existing locked environment, use `npm ci` against the present `package-lock.json` only after the package-audit checkpoint below; do not upgrade dependencies in Phase 19. [VERIFIED: `package.json:6-10`; filesystem audit confirmed `package-lock.json` exists and `node_modules/.bin/jest` is absent]

### Registry version check

Registry reads on 2026-10-06 reported latest versions `expo@57.0.26` (modified 2026-10-05), `react-native@0.87.1` (modified 2026-10-06), `expo-sqlite@57.0.3` (modified 2026-10-05), and `react-native-svg@15.15.5` (modified 2026-05-20); these are currency checks, not upgrade recommendations. [CITED: npm registry via `npm view` on 2026-10-06]

## Package Legitimacy Audit

This phase adds no package, but the local environment is missing Jest and may require a lockfile restore, so the existing core packages were passed through the required npm legitimacy and postinstall checks. [VERIFIED: package-legitimacy seam and `npm view` on 2026-10-06]

| Package | Registry | Latest publish signal | Downloads | Source Repo | Verdict | Disposition |
|---|---|---|---:|---|---|---|
| `expo` [WARNING: flagged as suspicious — verify before using.] | npm | 2026-09-29 | 11,980,296/wk | `github.com/expo/expo` | SUS (`too-new`) | Existing locked dependency only; planner adds `checkpoint:human-verify` before `npm ci` or any install. [VERIFIED: package-legitimacy seam on 2026-10-06] |
| `react-native` | npm | 2026-08-26 | 16,885,150/wk | `github.com/react/react-native` | OK | Approved existing dependency; no upgrade. [VERIFIED: package-legitimacy seam on 2026-10-06] |
| `expo-sqlite` [WARNING: flagged as suspicious — verify before using.] | npm | 2026-09-11 | 1,914,215/wk | `github.com/expo/expo` | SUS (`too-new`) | Existing locked dependency only; planner adds `checkpoint:human-verify` before `npm ci` or any install. [VERIFIED: package-legitimacy seam on 2026-10-06] |
| `react-native-svg` | npm | 2026-05-11 | 10,117,131/wk | `github.com/software-mansion/react-native-svg` | OK | Approved existing dependency; no upgrade. [VERIFIED: package-legitimacy seam on 2026-10-06] |

All four checks returned no postinstall script. [VERIFIED: package-legitimacy seam and `npm view <pkg> scripts.postinstall` on 2026-10-06]

**Packages removed due to SLOP verdict:** none. [VERIFIED: package-legitimacy seam on 2026-10-06]
**Packages flagged as suspicious [SUS]:** `expo`, `expo-sqlite`; both are official, already locked dependencies, but the seam's `too-new` rule still requires a human checkpoint before restoring/installing packages. [VERIFIED: package-legitimacy seam on 2026-10-06; `package.json:96-109`]

## Architecture Patterns

### System Architecture Diagram

```text
Progress route entry
  └─ retained sport + range + invoking-control state
       └─ ProgressRepository.load({ sport, period, nowLocalDate })
            └─ ONE SqliteKernel.readSnapshot
                 ├─ freshness revisions / rebuild effects
                 ├─ effective Strength completed-history facts
                 ├─ persisted Strength target/recommendation facts
                 ├─ Phase 13/18 accepted Running effort + source revision facts
                 ├─ Phase 13/17 distance-keyed target + target-history facts
                 ├─ future planned opportunity facts
                 └─ optional dated bodyweight facts
                      └─ pure domain projection
                           ├─ All factual-goal view
                           ├─ Strength comparable view
                           └─ Running same-distance/time-basis view
                                └─ ProgressScreen / details / sheets
                                     ├─ SVG visual marks (decorative)
                                     ├─ visible factual summary
                                     └─ ordered Show history data equivalent

Explicit mutation
  └─ target | recommendation | bodyweight command
       └─ validate requestId + expected revision + payload
            └─ exclusive SQLite write + receipt + projection invalidation
                 └─ COMMIT
                      └─ authoritative read-back
                           └─ update UI / success announcement
```

The diagram preserves the owner rule that durable facts and committed commands are authority, while charts and cached projections are disposable presentation. [VERIFIED: `.planning/phases/19-progress-parity/19-UI-SPEC.md:20-36`, `.trae/rules/rules.md:18-23`]

### Exact file and symbol responsibility map

| File / symbol | Status entering Phase 19 | Planner action |
|---|---|---|
| `src/domains/progress/contracts.ts` — `ProgressPeriod`, `ProgressProjectionFreshness`, `ProgressPeriodProjection`, `ProgressRecommendationReview` | Existing | Extend with the sport-specific factual view contract; keep the exact existing range values quoted as `"4_weeks" | "12_weeks" | "all_time"`. [VERIFIED: `src/domains/progress/contracts.ts:10-15`, `src/domains/progress/contracts.ts:87-111`, `src/domains/progress/contracts.ts:163-173`] |
| `src/domains/progress/periodProjection.ts` — `projectProgressPeriod` | Existing Strength/overall reducer | Preserve metric-aware Strength grouping and source references; do not force imported Running facts through session-set shapes. [VERIFIED: `src/domains/progress/periodProjection.ts:304-369`, `src/domains/progress/periodProjection.ts:455-556`] |
| `src/domains/progress/dashboardProjection.ts` — recommended `projectProgressDashboard` | New recommendation | Compose All/Strength/Running typed subviews, target-at-date series, deterministic nearest-goal selection, and sparse/error metadata without SQL or UI state. [ASSUMED] |
| `src/platform/sqlite/repositories/progressRepository.ts` — `ProgressRepository.load` | Existing | Change the port to accept sport plus range and perform all required reads within `SqliteKernel.readSnapshot`; consume upstream repositories/read facts rather than screen SQL. [VERIFIED: `src/platform/sqlite/repositories/progressRepository.ts:92-106`, `src/platform/sqlite/repositories/progressRepository.ts:320-505`, `src/platform/sqlite/sqliteKernel.ts:179-205`] |
| `app/(tabs)/progress.tsx` — `ProgressRoute` | Existing | Wire Phase 14 retained route state, Phase 13/17/18 ports, source routes, and explicit commands; keep it as the only Progress root. [VERIFIED: `app/(tabs)/progress.tsx:13-42`, `.planning/phases/19-progress-parity/19-UI-SPEC.md:91-117`] |
| `src/ui/screens/ProgressScreen.tsx` — `ProgressScreen` | Existing | Replace the current range-only Overall/Consistency composition with approved sport/range controls and factual view components; keep async generation guards and error recovery. [VERIFIED: `src/ui/screens/ProgressScreen.tsx:248-415`, `src/ui/screens/ProgressScreen.tsx:637-830`, `.planning/phases/19-progress-parity/19-UI-SPEC.md:219-287`] |
| `src/ui/components/ProgressTrend.tsx` — `ProgressTrend` | Existing count/completion visual | Do not stretch this count bar into a goal chart; replace its Phase 19 use with the planned `FactualHistoryChart`, retaining the same-query text/data-equivalent principle. [VERIFIED: `src/ui/components/ProgressTrend.tsx:117-168`, `.planning/phases/19-progress-parity/19-UI-SPEC.md:290-322`] |
| `src/ui/components/FactualHistoryChart.tsx` — recommended `FactualHistoryChart` | New recommendation | Render straight factual segments, points, target-at-date line, programmatic label, visible summary, and disclosure over one typed series. [ASSUMED] |
| `app/exercise-history/[exerciseId].tsx`, `ExerciseHistoryScreen`, `buildExerciseMetricHistory`, `loadExerciseMetricHistory` | Existing | Extend with source actions, target/gap/goal history, data equivalent, and eligible relative transform; preserve route and existing metric segmentation. [VERIFIED: `app/exercise-history/[exerciseId].tsx:13-33`, `src/ui/screens/ExerciseHistoryScreen.tsx:140-321`, `src/domains/history/metricHistory.ts:181-210`, `src/platform/sqlite/repositories/historyRepository.ts:865-949`] |
| `src/ui/components/RecommendationSurface.tsx` — `RecommendationSurface` | Existing shared component | Keep legacy compatibility, but Phase 19 uses the `ProgressRecommendationReview` branch inside the approved Review target sheet and exact actions. [VERIFIED: `src/ui/components/RecommendationSurface.tsx:33-41`, `src/ui/components/RecommendationSurface.tsx:116-203`, `.planning/phases/19-progress-parity/19-UI-SPEC.md:371-382`] |
| `src/domains/progression/recommendationCommands.ts` — `acceptRecommendation`, `keepCurrentTarget` | Existing | Add request identity/replay outcome while retaining revision evidence; update completion and Progress callers together. [VERIFIED: `src/domains/progression/recommendationCommands.ts:5-18`, `src/domains/progression/recommendationCommands.ts:28-46`, `src/domains/progression/recommendationCommands.ts:73-90`] |
| `src/domains/running/`, `runningPlanRepository.ts`, `src/domains/activities/`, `importedActivityRepository.ts`, `bodyweightRepository.ts` | Planned upstream, not current baseline | Treat as Phase 13/17/18 prerequisites and consume their final typed contracts; do not create Phase 19 shadow storage. The parity matrix quotes them as `P` planned targets. [VERIFIED: `.planning/design/v1.2-prototype-parity-matrix.md:43-50`] |
| `RunningHistorySheet.tsx`, `RunningTargetSheet.tsx`, `BodyweightHistorySheet.tsx`, `BodyweightEditorSheet.tsx` | Planned Phase 19 components | Implement after upstream ports are frozen; use Phase 14 shared sheet/focus primitives. [VERIFIED: `.planning/design/v1.2-prototype-parity-matrix.md:216-225`, `.planning/phases/19-progress-parity/19-UI-SPEC.md:91-117`] |

### Pattern 1: One discriminated read model, not one generic bag of optional fields

Use one `ProgressRepository.load` entry point whose returned view is discriminated by selected sport; each branch carries only meaningful All, Strength, or Running facts and shared read-state metadata. This keeps absent values explicit and prevents the component from deciding whether a field is comparable. [VERIFIED: `.planning/phases/19-progress-parity/19-UI-SPEC.md:246-287`]

Recommended new symbols `ProgressSport`, `ProgressDashboardProjection`, and `projectProgressDashboard` are planning names, not current source values. [ASSUMED]

The allowed sport labels are quoted verbatim as `All`, `Strength`, `Running`, and the allowed range labels are `4 weeks`, `12 weeks`, `All time`. [VERIFIED: `.planning/phases/19-progress-parity/19-UI-SPEC.md:238-244`]

### Pattern 2: One SQLite read snapshot across freshness and facts

Require `SqliteSnapshotKernel` at the Progress repository boundary and execute freshness checks plus every selected-view query through the transaction executor. The current kernel already quotes the exact method name `readSnapshot` and implements `BEGIN` → callback → `COMMIT` with rollback on failure. [VERIFIED: `src/platform/sqlite/sqliteKernel.ts:46-60`, `src/platform/sqlite/sqliteKernel.ts:179-205`]

This also applies to `loadExerciseMetricHistory`, whose current overlay-session query and raw-set query are separate top-level reads. [VERIFIED: `src/platform/sqlite/repositories/historyRepository.ts:865-949`]

### Pattern 3: Comparable facts stay domain-specific

**Strength:** keep the existing eligibility rule: completed/partial session, working set, completed set, positive planned working-set count, and every planned working set completed; comparability then requires same exercise/metric identity plus the metric contract's significant target boundary. [VERIFIED: `src/domains/metrics/exposure.ts:17-50`, `src/domains/metrics/exposure.ts:53-145`]

**Running:** consume only the accepted payload revision of an imported running activity, preserve source revision and removal/correction status, require positive exact distance plus one documented time basis, and group Best/Latest only within that exact distance+basis. Unmatched accepted activity may be performance evidence but may not imply plan adherence; a match does not duplicate the activity. [VERIFIED: `.planning/architecture/v1.2-garmin-import.md:81-93`, `.planning/architecture/v1.2-garmin-import.md:130-156`]

The proposed upstream table names are quoted verbatim as `imported_activities`, `imported_activity_payloads`, `imported_activity_laps`, and `running_opportunity_completions`; Phase 19 reads them only through Phase 13/18 typed ports. [VERIFIED: `.planning/architecture/v1.2-garmin-import.md:81-91`]

### Pattern 4: Target-at-date is its own effective series

Do not redraw all past facts against today's target. Every chart point/data row must carry the effective target revision at that date or explicit Target unset; the visual goal line is built from that target-history series, separate from actual evidence. [VERIFIED: `.planning/phases/19-progress-parity/19-UI-SPEC.md:246-259`, `.planning/phases/19-progress-parity/19-UI-SPEC.md:304-322`]

The 2.4 km contract is a default, not permission for automatic optimization: quoted values are `11:00`, `Pace 4:35/km`, `400 m 1:50`, and `200 m 0:55`; later changes come only from explicit committed owner target revisions. [VERIFIED: `.planning/phases/19-progress-parity/19-UI-SPEC.md:278-284`, `.planning/phases/19-progress-parity/19-UI-SPEC.md:451-466`]

The 10 km and Half Marathon target-time values remain null/unset until a committed owner edit; effort absence is separately `No effort recorded`. [VERIFIED: `.planning/phases/19-progress-parity/19-UI-SPEC.md:283-285`, `.planning/phases/19-progress-parity/19-UI-SPEC.md:424-429`]

### Pattern 5: One typed series feeds chart, summary, and history data

Build the series in the domain/query layer and pass the identical object to the visible summary, decorative SVG marks, programmatic chart label, and `Show history data`. SVG coordinates must never become the data source. [VERIFIED: `.planning/phases/19-progress-parity/19-UI-SPEC.md:290-322`]

For sparse data, zero facts render no marks and one fact renders one labelled point plus `More data needed`; invalid/removed/incompatible facts create segment breaks rather than interpolated points. [VERIFIED: `.planning/phases/19-progress-parity/19-UI-SPEC.md:294-303`]

If visual sampling becomes necessary, retain first, last, Best, Latest, local extrema, target crossings, and source IDs while leaving the full ordered data equivalent intact; do not pick an unmeasured hard cap during planning. [VERIFIED: `.planning/phases/19-progress-parity/19-UI-SPEC.md:302-303`, `.planning/phases/19-progress-parity/19-UI-SPEC.md:441-441`]

### Pattern 6: Commands own replay, revision, commit, and read-back

Running target and bodyweight commands should follow the existing plan-command envelope: `requestId`, expected revision, validated canonical payload, request hash/receipt, exclusive SQLite transaction, and post-commit invalidation/read-back. [VERIFIED: `src/domains/plans/ownedPlanCommands.ts:86-116`, `src/domains/plans/ownedPlanCommands.ts:430-494`]

Recommendation acceptance already validates its evidence version, rule, metric identity, complete target scope, target revisions, source session revision/status, and compare-and-swap updates before commit. Preserve that logic; add replay identity rather than duplicating acceptance in Progress. [VERIFIED: `src/platform/sqlite/repositories/workoutOutcomeRepository.ts:2383-2556`]

The current repeated-decision behavior is quoted by the test title `rejects repeated decisions after the pending lifecycle has closed`; PRO-15 instead needs same-request replay to settle to the committed result while a different decision/request conflicts. [VERIFIED: `tests/integration/load-reps.test.ts:1566-1589`, `.planning/REQUIREMENTS.md:190`]

Recommended command names `saveRunningTarget`, `addBodyweightEntry`, `editBodyweightEntry`, and `deleteBodyweightEntry` are planning names; use the final Phase 13/17 names if those ports land differently. [ASSUMED]

#### Target, recommendation, and bodyweight command matrix

| Command family | Authoritative input and validation | Commit/replay result | Exact integration boundary |
|---|---|---|---|
| Running target save | Distance identity, target time, optional target date, available days, request ID, and expected source revision. Target time must parse to at least quoted `1:00`; invalid time/date preserves the draft. [VERIFIED: `.planning/phases/19-progress-parity/19-UI-SPEC.md:348-369`] | Same request/payload replays the committed revision; stale expected revision returns reload/review without overwrite; root/detail/Library reload the same source target. [VERIFIED: `.planning/phases/19-progress-parity/19-UI-SPEC.md:361-369`, `.planning/REQUIREMENTS.md:188`; ASSUMED for receipt implementation] | Extend the final Phase 13/17 Running command/repository; `RunningTargetSheet` never writes its own store. [VERIFIED: `.planning/design/v1.2-prototype-parity-matrix.md:44`, `.planning/design/v1.2-prototype-parity-matrix.md:219-220`] |
| Recommendation Keep/Use | Recommendation ID, request ID, intended decision, and immutable evidence/target/source revisions. Preserve the existing accepted statuses quoted as `"accepted" | "rejected" | "superseded"`. [VERIFIED: `src/domains/progression/recommendationCommands.ts:5-18`, `src/platform/sqlite/repositories/workoutOutcomeRepository.ts:2383-2588`; ASSUMED for request ID/decision field] | Same request settles once; stale evidence becomes superseded with no target write; generic failure keeps evidence and retry visible. [VERIFIED: `.planning/phases/19-progress-parity/19-UI-SPEC.md:371-382`, `.planning/phases/19-progress-parity/19-UI-SPEC.md:436-438`] | Update shared progression commands/repository and both current callers, not just Progress. [VERIFIED: `src/bootstrap/workoutAppRuntime.tsx:4118-4142`, `app/(tabs)/progress.tsx:27-39`] |
| Bodyweight add/edit | Stable fact identity for edit, owner-local Date, Bodyweight, request ID, and expected revision. The approved input is quoted as `20.0 through 400.0 kg in 0.1 kg increments`; Date must be valid and not later than today. [VERIFIED: `.planning/phases/19-progress-parity/19-UI-SPEC.md:402-410`] | Commit fact/receipt, invalidate only bodyweight/relative read projections, reload history, then announce success; target facts remain byte-for-byte unchanged. [VERIFIED: `.planning/REQUIREMENTS.md:186`, `.planning/REQUIREMENTS.md:192-193`; ASSUMED for exact invalidation/receipt schema] | Consume Phase 13 `bodyweightRepository.ts`; store an exact integer unit rather than UI floating-point kilograms. [VERIFIED: planned repository in `.planning/design/v1.2-prototype-parity-matrix.md:50`; ASSUMED for integer storage field/unit] |
| Bodyweight delete | Fact ID, request ID, expected revision, and explicit row-specific confirmation performed in UI before dispatch. Dismiss/Back/Keep dispatches nothing. [VERIFIED: `.planning/phases/19-progress-parity/19-UI-SPEC.md:392-401`] | Same request replays deletion; stale/failed delete keeps the row/confirmation until authoritative reload. No target or recommendation mutation. [VERIFIED: `.planning/phases/19-progress-parity/19-UI-SPEC.md:398-410`, `.planning/phases/19-progress-parity/19-UI-SPEC.md:439-440`] | UI confirmation belongs to `BodyweightHistorySheet`; durable deletion belongs to the Phase 13 command/repository. [VERIFIED: `.planning/design/v1.2-prototype-parity-matrix.md:224-225`] |

### Pattern 7: Relative strength is a read-only dated transform

The relative view belongs in the effective exercise-history read model, not target storage. Each eligible point must return the exact dated bodyweight basis used and the UI must show `Using <kg> kg from <date>`; no transform may write a recommendation or target. [VERIFIED: `.planning/phases/19-progress-parity/19-UI-SPEC.md:338-346`, `.planning/phases/19-progress-parity/19-UI-SPEC.md:478-478`]

Phase 13 owns optional dated bodyweight CRUD and portability; Phase 19 owns its history/editor surfaces. [VERIFIED: `.planning/REQUIREMENTS.md:29-33`, `.planning/design/v1.2-prototype-parity-matrix.md:49-51`, `.planning/design/v1.2-prototype-parity-matrix.md:223-225`]

### Anti-Patterns to Avoid

- **Screen-derived Best/Gap/nearest goal:** it forks comparator and target-history authority. Compute it in pure domain projection code. [VERIFIED: `src/domains/metrics/comparators.ts:122-215`, `.planning/phases/19-progress-parity/19-CONTEXT.md:9-11`]
- **Reusing `ProgressComparableExposure` for imported Running facts:** the existing type is a session-set `HistoryProjectionComparableExposure` with exercise/set identities; imported activities are independent aggregates. [VERIFIED: `src/domains/progress/contracts.ts:71-80`, `.planning/architecture/v1.2-garmin-import.md:10-16`]
- **Plotting target/effort/bodyweight absence as zero:** explicitly prohibited. [VERIFIED: `.planning/phases/19-progress-parity/19-UI-SPEC.md:61-72`]
- **Using current target as every historical goal line:** violates effective target revision semantics. [VERIFIED: `.planning/phases/19-progress-parity/19-UI-SPEC.md:246-259`]
- **Treating schedule intent or match as performance:** only accepted activity facts establish Running effort; match contributes adherence context. [VERIFIED: `.planning/phases/19-progress-parity/19-CONTEXT.md:22-24`, `.planning/architecture/v1.2-garmin-import.md:151-157`]
- **Fixed 250 ms rebuild loop:** the existing quoted `250` timer is an implementation baseline, not a Phase 19 performance contract; replace it with invalidation/generation events and a bounded fallback. [VERIFIED: `src/ui/screens/ProgressScreen.tsx:672-680`]
- **Toast-only mutation failure:** every failed/stale command retains its sheet/draft/evidence and a persistent recovery action. [VERIFIED: `.planning/phases/19-progress-parity/19-UI-SPEC.md:418-443`]
- **SVG-only accessibility:** decorative marks are hidden; summary and ordered data remain visible and programmatic. [VERIFIED: `.planning/phases/19-progress-parity/19-UI-SPEC.md:304-322`; CITED: `https://reactnative.dev/docs/accessibility`]

## Performance and Query Budget

- Apply selected-range predicates in SQLite for 4-week and 12-week reads instead of loading every exposure/recommendation and filtering only in JavaScript; keep All-time complete but page/virtualize its data equivalent. The current Progress repository loads all comparable exposures and all recommendation rows before `projectProgressPeriod` filters the window. [VERIFIED: `src/platform/sqlite/repositories/progressRepository.ts:399-505`, `src/domains/progress/periodProjection.ts:252-280`]
- Keep one `readSnapshot` short: query indexed summaries/IDs first, batch source evidence, and avoid FIT parsing, route samples, or network access in Progress. Manual import parsing is outside the workout command critical path, and Progress consumes normalized facts only. [VERIFIED: `.planning/architecture/v1.2-garmin-import.md:117-128`, `.planning/architecture/v1.2-multi-active-plans.md:227-227`]
- Replace the quoted fixed `250` ms update timer with invalidation/generation refresh and a bounded fallback; permanent rebuild failure already maps to `unavailable` and must stop automatic polling. [VERIFIED: `src/ui/screens/ProgressScreen.tsx:672-680`, `tests/sqlite-host/progressRepository.test.ts:646-681`]
- Render visual marks from a deterministic sampled projection only after representative long-history measurement; never sample/delete the accessible factual list or source IDs. [VERIFIED: `.planning/phases/19-progress-parity/19-UI-SPEC.md:302-322`, `.planning/phases/19-progress-parity/19-UI-SPEC.md:441-441`]
- Preserve the existing quoted `150 ms set-commit budget`; target/bodyweight/progress reads and rebuild work must not run inside set completion or delay its acknowledgment. [VERIFIED: `.planning/architecture/v1.2-multi-active-plans.md:227-227`, `.trae/rules/rules.md:20-22`]
- Add query-plan/row-count fixtures for zero, one, many, and long histories, then carry device frame/JS-task measurements into Phase 20 rather than inventing a new Progress threshold here. [VERIFIED: `.planning/phases/19-progress-parity/19-UI-SPEC.md:536-566`, `.planning/ROADMAP.md:218-236`]

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---|---|---|---|
| Strength comparability and Best | Progress-specific comparator | Existing metric registry, `isMetricExposureEligible`, `areMetricExposuresComparable`, `compareMetricObservations` | Existing logic handles profile-specific lower/higher/completion semantics and significant target boundaries. [VERIFIED: `src/domains/metrics/exposure.ts:40-145`, `src/domains/metrics/comparators.ts:122-215`] |
| Effective corrected history | Separate Progress correction overlay | Existing `loadEffectiveHistoryProjectionSessions` and `buildExerciseMetricHistory` | Current adapter gives overlays full precedence and suppresses voided ordinary evidence. [VERIFIED: `src/platform/sqlite/repositories/historyRepository.ts:412-420`, `src/domains/history/metricHistory.ts:181-210`] |
| Running import acceptance/dedupe | Direct FIT/local fixture reads in Progress | Phase 13/18 activities port and accepted payload revisions | Import identity, correction, removal, and provenance are already separate source concerns. [VERIFIED: `.planning/architecture/v1.2-garmin-import.md:95-128`] |
| Chart library/scaling authority | New chart dependency or coordinate-backed data | Existing `react-native-svg` plus pure typed scale/series helper and visible data equivalent | UI contract prohibits a new chart package and requires the table to use the same facts, not SVG coordinates. [VERIFIED: `.planning/phases/19-progress-parity/19-UI-SPEC.md:290-322`, `.planning/phases/19-progress-parity/19-UI-SPEC.md:597-604`] |
| Read consistency | Ad hoc revision rechecks in components | `SqliteKernel.readSnapshot` | The kernel already provides a transaction-scoped reader and rollback behavior. [VERIFIED: `src/platform/sqlite/sqliteKernel.ts:46-60`, `src/platform/sqlite/sqliteKernel.ts:179-205`; CITED: `https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/`] |
| Target/bodyweight replay | Boolean busy flag as integrity control | Request receipt + expected revision + exclusive command | UI busy state prevents duplicate taps only while mounted; receipts settle process/retry replay. [VERIFIED: `src/domains/plans/ownedPlanCommands.ts:86-116`, `.planning/phases/19-progress-parity/19-UI-SPEC.md:361-410`] |
| Focus/modal behavior | Progress-private modal implementation | Phase 14 `BottomSheet`, `FocusablePressable`, `InlineNotice`, `SemanticToast` | The UI spec assigns focus trap/restoration, IME, Back/Escape, scrim, and read-back success to shared primitives. [VERIFIED: `.planning/phases/19-progress-parity/19-UI-SPEC.md:91-103`] |

**Key insight:** Phase 19 is a composition and integrity phase, not a new analytics subsystem: use upstream facts, shipped comparator/history logic, one read snapshot, and explicit commands. [VERIFIED: `.planning/phases/19-progress-parity/19-CONTEXT.md:7-11`]

## Common Pitfalls

### Pitfall 1: A “unified” optional-field model silently compares incompatible facts
**What goes wrong:** All/Strength/Running rows accidentally compute Gap or Best across different units, metric generations, distances, or elapsed/moving bases. [VERIFIED: `.planning/phases/19-progress-parity/19-UI-SPEC.md:246-259`, `.planning/phases/19-progress-parity/19-UI-SPEC.md:278-286`]
**How to avoid:** Use a discriminated view and domain-specific comparable keys; omit Gap with a written reason when any boundary differs. [VERIFIED: `src/domains/metrics/exposure.ts:86-145`, `.planning/phases/19-progress-parity/19-UI-SPEC.md:259-259`]
**Warning sign:** A component parses JSON or divides/normalizes values to decide status. [VERIFIED: current parsing occurs in `src/ui/screens/ProgressScreen.tsx:103-115`; Phase 19 should move new comparisons below UI]

### Pitfall 2: Freshness is checked before, not during, the factual read
**What goes wrong:** A write/rebuild can commit between freshness and data queries, yielding one screen assembled from different revisions. [VERIFIED: `src/platform/sqlite/repositories/progressRepository.ts:330-505`, `src/platform/sqlite/sqliteKernel.ts:179-205`]
**How to avoid:** Run freshness plus fact queries in one `readSnapshot`, and return no final projection when any required subject is behind. [VERIFIED: `src/platform/sqlite/sqliteKernel.ts:179-205`, `src/platform/sqlite/repositories/progressRepository.ts:352-397`]
**Warning sign:** `kernel.queryAll` appears before and after projection queries in the same load method instead of a transaction executor. [VERIFIED: `src/platform/sqlite/repositories/progressRepository.ts:330-505`]

### Pitfall 3: Rebuild polling becomes a permanent 4 Hz loop
**What goes wrong:** The current quoted `250` ms timer repeats as long as freshness is updating, causing avoidable reads and battery work. [VERIFIED: `src/ui/screens/ProgressScreen.tsx:672-680`]
**How to avoid:** Refresh on projection generation/effect completion and root focus; if a timer remains, bound attempts and back off while retaining manual Refresh progress. [ASSUMED]
**Warning sign:** fake-timer tests assert unlimited repeated calls instead of eventual current/unavailable termination. [VERIFIED: `src/ui/__tests__/ProgressScreen.test.tsx:286-308`]

### Pitfall 4: Recommendation replay is mistaken for duplicate-tap protection
**What goes wrong:** Two taps in one mount are blocked, but a lost acknowledgment/relaunch resubmits and the repository returns a conflict after the first commit. [VERIFIED: `src/ui/screens/ProgressScreen.tsx:446-471`, `tests/integration/load-reps.test.ts:1566-1589`]
**How to avoid:** Persist a decision request receipt/hash; same request+payload returns the committed result, changed payload/decision conflicts. [VERIFIED: analogous receipt pattern in `src/domains/plans/ownedPlanCommands.ts:430-494`; ASSUMED for recommendation receipt schema]
**Warning sign:** `RecommendationDecisionInput` still contains only `recommendationId` and `decidedAtMs`. [VERIFIED: `src/domains/progression/recommendationCommands.ts:28-31`]

### Pitfall 5: Relative strength uses the latest bodyweight for all history
**What goes wrong:** Historical ratios change retroactively when a new measurement is added. [VERIFIED: `.planning/phases/19-progress-parity/19-UI-SPEC.md:338-346`]
**How to avoid:** Return a dated basis per point and keep Relative as a view transform; if the upstream Phase 13 basis rule is not explicit, freeze it before implementation. [VERIFIED: `.planning/phases/19-progress-parity/19-UI-SPEC.md:344-346`; ASSUMED for basis-selection rule]
**Warning sign:** the screen loads one latest bodyweight value and applies it to every row. [VERIFIED: prohibited behavior in `.planning/phases/19-progress-parity/19-UI-SPEC.md:344-346`]

### Pitfall 6: Running target UI creates a second goal store
**What goes wrong:** Library detail and Progress show different targets or effective histories. [VERIFIED: `.planning/REQUIREMENTS.md:188`, `.planning/phases/19-progress-parity/19-UI-SPEC.md:361-369`]
**How to avoid:** Both call the same Phase 13/17 target command and reload the same distance-keyed source facts. [VERIFIED: `.planning/design/v1.2-prototype-parity-matrix.md:44`, `.planning/phases/17-library-running-plans/17-UI-SPEC.md:337-366`]
**Warning sign:** a `progress_targets` table, AsyncStorage key, or component-only target revision appears. [VERIFIED: forbidden second authority in `.planning/phases/19-progress-parity/19-CONTEXT.md:7-11`]

### Pitfall 7: The goal line retroactively adopts the newest target
**What goes wrong:** History visually claims an older workout was measured against a target that did not yet exist. [VERIFIED: `.planning/phases/19-progress-parity/19-UI-SPEC.md:246-255`]
**How to avoid:** Project target-effective intervals and display `Target at date`; current target is not sufficient. [VERIFIED: `.planning/phases/19-progress-parity/19-UI-SPEC.md:312-320`]
**Warning sign:** every history row receives `projection.currentTarget`. [VERIFIED: prohibited behavior in `.planning/phases/19-progress-parity/19-UI-SPEC.md:254-255`]

### Pitfall 8: Long history optimization deletes accessible evidence
**What goes wrong:** Visual sampling also truncates the data equivalent or source IDs. [VERIFIED: `.planning/phases/19-progress-parity/19-UI-SPEC.md:302-322`, `.planning/phases/19-progress-parity/19-UI-SPEC.md:441-441`]
**How to avoid:** Sample visual marks only; paginate/virtualize the complete ordered data equivalent without changing factual order. [VERIFIED: `.planning/phases/19-progress-parity/19-UI-SPEC.md:302-322`]
**Warning sign:** the history sheet builds its table from rendered SVG points. [VERIFIED: explicitly prohibited by `.planning/phases/19-progress-parity/19-UI-SPEC.md:322-322`]

### Pitfall 9: Bodyweight mutation success changes targets indirectly
**What goes wrong:** a save/delete invalidates or recomputes recommendations as though relative view were a progression input. [VERIFIED: `.planning/phases/19-progress-parity/19-CONTEXT.md:25-25`, `.planning/REQUIREMENTS.md:30-30`]
**How to avoid:** bodyweight commands invalidate only bodyweight/relative read projections; assert all target tables and pending recommendation payloads are unchanged. [VERIFIED: `.planning/design/v1.2-prototype-parity-matrix.md:50`; ASSUMED for exact invalidation subject names]
**Warning sign:** a bodyweight repository imports progression command modules. [VERIFIED: prohibited automatic behavior in `.planning/phases/19-progress-parity/19-UI-SPEC.md:61-72`]

## Code Examples

### Read all Progress facts from one existing snapshot seam

```typescript
// Source: src/platform/sqlite/sqliteKernel.ts:56-60,179-205
export function createProgressRepository(kernel: SqliteSnapshotKernel) {
  return Object.freeze({
    load: (input: ProgressLoadInput) =>
      kernel.readSnapshot((snapshot) => loadProgressSnapshot(snapshot, input)),
  });
}
```

`SqliteSnapshotKernel` and `readSnapshot` are existing symbols; `ProgressLoadInput` and `loadProgressSnapshot` are recommended Phase 19 symbols. [VERIFIED: `src/platform/sqlite/sqliteKernel.ts:56-60`, `src/platform/sqlite/sqliteKernel.ts:179-205`; ASSUMED for the two new symbol names]

### Render visual marks from, never into, the factual series

```tsx
// Source: https://github.com/software-mansion/react-native-svg/blob/main/USAGE.md
<Svg accessible={false} importantForAccessibility="no-hide-descendants">
  <Polyline points={segment.points} fill="none" stroke={actualColor} />
  <Line x1={goal.x1} x2={goal.x2} y1={goal.y} y2={goal.y} strokeDasharray="7 5" />
  {segment.points.map((point) => <Circle key={point.id} cx={point.x} cy={point.y} r={3} />)}
</Svg>
```

The quoted dash geometry `7 5` and separate goal line come from the approved Phase 19 contract; the visible summary and history list must consume the pre-coordinate series, not `segment.points`. [VERIFIED: `.planning/phases/19-progress-parity/19-UI-SPEC.md:143-157`, `.planning/phases/19-progress-parity/19-UI-SPEC.md:304-322`; CITED: `https://github.com/software-mansion/react-native-svg/blob/main/USAGE.md`]

### Use an explicit replay/revision command envelope

```typescript
// Recommended Phase 19 shape; exact final names depend on Phase 13/17 ports.
type RevisionCheckedCommand<Payload> = Readonly<{
  requestId: string;
  expectedRevision: number;
  payload: Payload;
  occurredAtMs: number;
}>;
```

The field pattern is copied from the existing plan command boundary; applying it to target/recommendation/bodyweight is a recommendation. [VERIFIED: `src/domains/plans/ownedPlanCommands.ts:86-116`; ASSUMED]

## State of the Art

| Current/shipped approach | Phase 19 approach | Impact |
|---|---|---|
| Range-only `ProgressPeriod` with Overall/Consistency/Exercise content | Retained All/Strength/Running plus range, one focal factual goal, source evidence, and sport details | Reuses factual Strength internals while replacing the presentation contract. [VERIFIED: `src/ui/screens/ProgressScreen.tsx:248-415`, `src/ui/screens/ProgressScreen.tsx:784-830`, `.planning/phases/19-progress-parity/19-UI-SPEC.md:219-287`] |
| Count-based `ProgressTrend` completion bars and table | Straight factual observation series, separate effective goal line, same-query summary/data equivalent | Chart supports evidence instead of acting as authority. [VERIFIED: `src/ui/components/ProgressTrend.tsx:47-60`, `src/ui/components/ProgressTrend.tsx:117-168`, `.planning/phases/19-progress-parity/19-UI-SPEC.md:290-322`] |
| Top-level sequential reader queries around a freshness check | One `readSnapshot` containing freshness and all selected-view facts | Prevents cross-revision composition. [VERIFIED: `src/platform/sqlite/repositories/progressRepository.ts:330-505`, `src/platform/sqlite/sqliteKernel.ts:179-205`] |
| Repeated recommendation decisions conflict after lifecycle closure | Same request replays committed decision; changed decision/request conflicts | Meets PRO-15 across retry/relaunch without weakening revision fencing. [VERIFIED: `tests/integration/load-reps.test.ts:1566-1589`, `.planning/REQUIREMENTS.md:190`] |
| No current Running/activity/bodyweight source modules in baseline | Consume Phase 13/17/18 typed ports and implement only Phase 19 presentation/composition | Prevents parallel storage and fixture authority. [VERIFIED: `.planning/design/v1.2-prototype-parity-matrix.md:43-50`, `.planning/design/v1.2-prototype-parity-matrix.md:208-225`] |

**Deprecated/outdated for Phase 19:** `Overall Progress`, `Consistency`, `Baseline`, and `Hold` are current UI copy/structure, not the approved Revision 18 Phase 19 hierarchy; preserve their underlying facts/tests where useful but do not treat the screen as the oracle. [VERIFIED: `src/ui/screens/ProgressScreen.tsx:290-415`, `src/ui/components/ProgressTrend.tsx:117-168`, `.planning/phases/19-progress-parity/19-UI-SPEC.md:20-36`]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | When more than one active goal is eligible and no contract-provided priority exists, choose earliest explicit target date, then stable sport/source identity; do not rank cross-sport normalized gaps. [ASSUMED] | Architecture Pattern 1 | Wrong tie-break changes the All hero and focus/source route while all facts remain valid. |
| A2 | Alternate target pacing rounds each displayed split to the nearest whole second after deriving from the exact committed target seconds and distance. [ASSUMED] | Fixed/target contract | Wrong rounding causes copy/test mismatch even though the 11:00 default remains exact. |
| A3 | If Phase 13 does not supply a bodyweight basis, use the latest valid dated entry on or before the observation's owner-local date; never use a future measurement. [ASSUMED] | Relative strength | Wrong temporal rule changes historical ratios and evidence copy. |
| A4 | Recommended new symbols/files (`dashboardProjection.ts`, `projectProgressDashboard`, `FactualHistoryChart`, command names) may be renamed to match the final Phase 13/14/17/18 ports without changing boundaries. [ASSUMED] | File/symbol map | Planner could create needless adapters if upstream final names already differ. |

## Open Questions

1. **Nearest active goal tie-break**
   - What we know: selection must be deterministic, source-backed, and not a composite score. [VERIFIED: `.planning/phases/19-progress-parity/19-UI-SPEC.md:261-268`]
   - What is unclear: no locked tie-break is stated for multiple goals with equal/no target dates. [VERIFIED: source audit of `19-CONTEXT.md` and `19-UI-SPEC.md`]
   - Recommendation: use A1 unless the Phase 13 target port supplies an explicit owner order; freeze the rule in a pure projection test before UI work. [ASSUMED]

2. **Relative-strength bodyweight basis**
   - What we know: every point must disclose its dated basis and the latest bodyweight must not be retroactively applied unless the domain contract says so. [VERIFIED: `.planning/phases/19-progress-parity/19-UI-SPEC.md:338-346`]
   - What is unclear: Phase 13's final temporal join rule is not implemented in this baseline. [VERIFIED: `.planning/design/v1.2-prototype-parity-matrix.md:50`]
   - Recommendation: make Phase 13 return the basis per point; use A3 only if that upstream contract remains unspecified. [ASSUMED]

3. **Alternate pacing rounding**
   - What we know: the default exact display is locked, and alternate guides derive only from explicit owner targets. [VERIFIED: `.planning/phases/19-progress-parity/19-UI-SPEC.md:278-284`]
   - What is unclear: the rounding rule for non-default seconds is not locked. [VERIFIED: source audit of `19-CONTEXT.md` and `19-UI-SPEC.md`]
   - Recommendation: use A2 and cover boundary values in pure tests; never infer a new target from pacing. [ASSUMED]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---:|---:|---|
| Node.js | Typecheck/tests | ✓ | `v24.19.0` | Matches quoted engine `"node": "24.19.0"`. [VERIFIED: environment probe; `package.json:7-10`] |
| npm | Dependency restore/scripts | ✓ | `11.17.0` | Matches quoted package manager/engine `"npm@11.17.0"` and `"npm": "11.17.0"`. [VERIFIED: environment probe; `package.json:6-10`] |
| Jest executable / installed dependencies | Validation | ✗ | — | Existing `package-lock.json` permits `npm ci`, but package audit requires human verification first. [VERIFIED: failed test probe `sh: jest: command not found`; filesystem audit]
| Context7 MCP/CLI | Documentation lookup | ✗ | — | Research seam fell back to official web documentation and current repo/package source. [VERIFIED: tool/CLI availability probe on 2026-10-06]
| Knowledge graph | Semantic discovery | ✗ | — | `.planning/graphs/graph.json` is absent; direct source/ADR/parity trace was used. [VERIFIED: filesystem audit on 2026-10-06]

**Missing dependencies with no fallback:** none for planning/research. [VERIFIED: environment audit]

**Missing dependencies with fallback:** Jest/project dependencies are restorable from the lockfile after the required human package checkpoint; tests were not run in this research session because `jest` is not installed. [VERIFIED: failed test probe and `package-lock.json` presence]

## Validation Architecture

Nyquist validation is enabled and integrity-critical modules require complete branch coverage. [VERIFIED: `.planning/config.json:20-49`, `.trae/rules/rules.md:23-23`]

### Test Framework

| Property | Value |
|---|---|
| Framework | Jest `29.7.0` with `jest-expo ~57.0.5` and four projects: unit, components, sqlite-host, integration. [VERIFIED: `package.json:125-132`, `jest.config.js:26-90`] |
| Config file | `jest.config.js`. [VERIFIED: `jest.config.js:1-90`] |
| Quick run command | `npm run test:unit -- --runInBand src/domains/progress/periodProjection.test.ts` plus the requirement-specific component/SQLite command below. [VERIFIED: `package.json:23-28`, `jest.config.js:26-90`] |
| Full suite command | `npm run test:all`. [VERIFIED: `package.json:72-73`] |
| Coverage gate | Global branches `85`, functions `90`, lines `90`, statements `90`; project rule raises integrity-critical changed modules to complete branch coverage. [VERIFIED: `jest.config.js:18-25`, `.trae/rules/rules.md:23-23`] |

### Test flow

```text
Pure domain tests
  ├─ Strength comparability / target-at-date / nearest goal
  ├─ Running exact distance + time basis / sparse / fixed-unset targets
  ├─ pacing / relative bodyweight basis / chart segments
  └─ command validation and replay payloads
           ↓
Real SQLite host/integration
  ├─ one read snapshot + freshness/rebuild fail-closed
  ├─ accepted/corrected/removed import projection
  ├─ target/recommendation/bodyweight receipt + stale revision
  └─ authoritative read-back; no target side effects from bodyweight
           ↓
React Native components
  ├─ sport/range retention, loading/empty/sparse/error/rebuild
  ├─ chart summary + data equivalent + source navigation
  ├─ target/recommendation/bodyweight sheets and draft recovery
  └─ focus, keyboard semantics, busy/disabled and exact copy
           ↓
Phase 20 native evidence
  └─ device dimensions, 200% text, TalkBack, D-pad, landscape, reduced motion, performance
```

The phase owns unit/component/SQLite/integration proof now; Phase 20 owns attended/native acceptance and must not substitute for Phase 19's automated integrity tests. [VERIFIED: `.planning/ROADMAP.md:64-65`, `.planning/phases/19-progress-parity/19-UI-SPEC.md:570-593`]

### Phase Requirements → Test Map

Proposed Wave 0 test paths below follow the repository's current `src/**/*.test.*`, `src/ui/**/*.test.*`, `tests/sqlite-host/**/*.test.ts`, and `tests/integration/**/*.test.ts` conventions; any path not already present or quoted verbatim by the parity matrix remains a recommended name. [VERIFIED: `jest.config.js:40-88`; ASSUMED for new filenames]

| Req ID | Behavior | Test type | Automated command | File exists? |
|---|---|---|---|---|
| PRO-01 | sport/range semantics, focus, retained selection, obsolete read guard | component + route | `npm run test:components -- --runInBand src/ui/__tests__/ProgressScreen.test.tsx app/\(tabs\)/__tests__/progress-route.test.tsx` | Progress screen ✅; route ❌ Wave 0. [VERIFIED: `.planning/design/v1.2-prototype-parity-matrix.md:208`] |
| PRO-02 | factual nearest goal, active goals, planned-next, no composite | unit + SQLite + component | `npm run test:unit -- --runInBand src/domains/progress/dashboardProjection.test.ts && npm run test:sqlite:host -- --runInBand tests/sqlite-host/progressRepository.test.ts` | dashboard projection ❌ Wave 0; repository ✅. [VERIFIED: `.planning/design/v1.2-prototype-parity-matrix.md:209`] |
| PRO-03 | Strength comparable history, gap/status, needs review | unit + component | `npm run test:unit -- --runInBand src/domains/progress/periodProjection.test.ts && npm run test:components -- --runInBand src/ui/__tests__/ProgressScreen.test.tsx` | ✅ extend. [VERIFIED: existing cases in `src/domains/progress/periodProjection.test.ts:129-243`, `src/ui/__tests__/ProgressScreen.test.tsx:164-232`] |
| PRO-04 | Running same-distance/time-basis latest/best/gap/pacing | unit + SQLite contract + component | `npm run test:unit -- --runInBand src/domains/progress/dashboardProjection.test.ts && npm run test:integration -- --runInBand src/testing/contracts/importedActivities.contract.test.ts` | ❌ upstream/Wave 0. [VERIFIED: `.planning/design/v1.2-prototype-parity-matrix.md:211`, `.planning/design/v1.2-prototype-parity-matrix.md:49`] |
| PRO-05 | exact 660-second 2.4 km target and derived display | unit + component | `npm run test:unit -- --runInBand src/domains/progress/runningPacing.test.ts && npm run test:components -- --runInBand src/ui/__tests__/ProgressScreen.test.tsx` | ❌ Wave 0 / ✅ extend. [VERIFIED: `.planning/design/v1.2-prototype-parity-matrix.md:212`] |
| PRO-06 | null 10 km/Half targets and no zero effort | unit + component | same Progress unit/component commands | ❌/✅ extend. [VERIFIED: `.planning/design/v1.2-prototype-parity-matrix.md:213`] |
| PRO-07 | ready/sparse/empty/loading and one-point chart | unit + component | same Progress unit/component commands | ✅ existing baseline states; extend Running. [VERIFIED: `src/domains/progress/periodProjection.test.ts:222-243`, `src/ui/__tests__/ProgressScreen.test.tsx:286-375`, `src/ui/__tests__/ProgressScreen.test.tsx:499-547`] |
| PRO-08 | read failure, stale/rebuild suppression, retry/state retention | SQLite + component | `npm run test:sqlite:host -- --runInBand tests/sqlite-host/progressRepository.test.ts && npm run test:components -- --runInBand src/ui/__tests__/ProgressScreen.test.tsx` | ✅ extend to Running subjects and bounded refresh. [VERIFIED: `tests/sqlite-host/progressRepository.test.ts:526-705`, `src/ui/__tests__/ProgressScreen.test.tsx:286-375`] |
| PRO-09 | history sheet, goal line, data equivalent, empty/focus return | component | `npm run test:components -- --runInBand src/ui/__tests__/RunningHistorySheet.test.tsx` | ❌ Wave 0. [VERIFIED: `.planning/design/v1.2-prototype-parity-matrix.md:216`] |
| PRO-10 | exercise-history route/read states/source links/return | component + SQLite | `npm run test:components -- --runInBand src/ui/__tests__/ExerciseHistoryScreen.test.tsx app/exercise-history/__tests__/exercise-history-route.test.tsx` | screen ✅; route ❌ Wave 0. [VERIFIED: `src/ui/__tests__/ExerciseHistoryScreen.test.tsx:131-206`, `.planning/design/v1.2-prototype-parity-matrix.md:217`] |
| PRO-11 | eligible relative transform, dated basis, no target write | unit + SQLite + component | `npm run test:unit -- --runInBand src/domains/progress/relativeStrength.test.ts && npm run test:components -- --runInBand src/ui/__tests__/ExerciseHistoryScreen.test.tsx` | relative unit ❌; screen ✅ extend. [VERIFIED: `.planning/design/v1.2-prototype-parity-matrix.md:218`] |
| PRO-12 | target sheet drafts/distance/day/benchmark/cancel | component | `npm run test:components -- --runInBand src/ui/__tests__/RunningTargetSheet.test.tsx` | ❌ Wave 0. [VERIFIED: `.planning/design/v1.2-prototype-parity-matrix.md:219`] |
| PRO-13 | validation, stale/failure draft retention, committed consistency | unit + SQLite + component | `npm run test:unit -- --runInBand src/domains/running/runningPlanCommands.test.ts && npm run test:integration -- --runInBand src/testing/contracts/v1_2MultiPlanMigration.contract.test.ts` | ❌ upstream/Wave 0. [VERIFIED: `.planning/design/v1.2-prototype-parity-matrix.md:44`, `.planning/design/v1.2-prototype-parity-matrix.md:220`] |
| PRO-14 | exact recommendation evidence/actions/dismissal | component | `npm run test:components -- --runInBand src/ui/__tests__/RecommendationSurface.test.tsx src/ui/__tests__/ProgressScreen.test.tsx` | ✅ extend exact Phase 19 copy/sheet. [VERIFIED: `src/ui/__tests__/RecommendationSurface.test.tsx:103-219`, `src/ui/__tests__/ProgressScreen.test.tsx:574-749`] |
| PRO-15 | revision fencing, same-request replay, stale/failure recovery | integration + component | `npm run test:integration -- --runInBand tests/integration/load-reps.test.ts && npm run test:components -- --runInBand src/ui/__tests__/ProgressScreen.test.tsx` | ✅ change repeated-decision expectation/add receipts. [VERIFIED: `tests/integration/load-reps.test.ts:1171-1189`, `tests/integration/load-reps.test.ts:1335-1589`] |
| PRO-16 | settings/body metrics reachability; no score/demographics | component | `npm run test:components -- --runInBand src/ui/__tests__/ProgressScreen.test.tsx` | ✅ extend. [VERIFIED: `.planning/design/v1.2-prototype-parity-matrix.md:223`] |
| PRO-17 | bodyweight empty/history/edit/two-step delete | component + SQLite | `npm run test:components -- --runInBand src/ui/__tests__/BodyweightHistorySheet.test.tsx && npm run test:integration -- --runInBand src/testing/contracts/v1_2MultiPlanMigration.contract.test.ts` | ❌ upstream/Wave 0. [VERIFIED: `.planning/design/v1.2-prototype-parity-matrix.md:224`, `.planning/design/v1.2-prototype-parity-matrix.md:50`] |
| PRO-18 | dated kg bounds, add/edit, failure/replay persistence | unit + component + SQLite | `npm run test:components -- --runInBand src/ui/__tests__/BodyweightEditorSheet.test.tsx && npm run test:integration -- --runInBand src/testing/contracts/v1_2MultiPlanMigration.contract.test.ts` | ❌ upstream/Wave 0. [VERIFIED: `.planning/design/v1.2-prototype-parity-matrix.md:225`, `.planning/design/v1.2-prototype-parity-matrix.md:50`] |

### Sampling Rate

- **Per task commit:** run the single targeted unit/component/SQLite file for the behavior plus `npm run typecheck`. [VERIFIED: `package.json:19-28`]
- **Per wave merge:** run `npm run test:unit -- --runInBand`, `npm run test:components -- --runInBand`, `npm run test:sqlite:host -- --runInBand`, and `npm run test:integration -- --runInBand`. [VERIFIED: `package.json:23-28`]
- **Phase gate:** `npm run test:all`, boundary/lint/typecheck, complete branch coverage for changed integrity modules, and Phase 19 evidence files before `/gsd-verify-work`. [VERIFIED: `package.json:19-28`, `package.json:72-73`, `.trae/rules/rules.md:23-23`, `.planning/phases/19-progress-parity/19-UI-SPEC.md:570-593`]

### Wave 0 Gaps

- [ ] Freeze final Phase 13/17/18 typed Running target, accepted-effort, source-revision, and bodyweight ports before Phase 19 implementation. [VERIFIED: `.planning/ROADMAP.md:200-205`, `.planning/design/v1.2-prototype-parity-matrix.md:43-50`]
- [ ] Add `src/domains/progress/dashboardProjection.test.ts`, `runningPacing.test.ts`, and `relativeStrength.test.ts` alongside their pure implementations; recommended filenames are [ASSUMED].
- [ ] Add `src/ui/__tests__/RunningHistorySheet.test.tsx`, `RunningTargetSheet.test.tsx`, `BodyweightHistorySheet.test.tsx`, and `BodyweightEditorSheet.test.tsx`. [VERIFIED: planned surfaces in `.planning/design/v1.2-prototype-parity-matrix.md:216-225`]
- [ ] Add route tests for retained sport/range/focus across Progress → exercise/import detail → Back. [VERIFIED: `.planning/phases/19-progress-parity/19-UI-SPEC.md:238-244`, `.planning/phases/19-progress-parity/19-UI-SPEC.md:338-346`]
- [ ] Add SQLite snapshot-race tests: writer commits between freshness/data phases, accepted import revision changes, bodyweight save/delete replay, and recommendation acknowledgment loss. [VERIFIED: snapshot and command risks in `src/platform/sqlite/sqliteKernel.ts:179-205`, `tests/integration/load-reps.test.ts:1566-1589`; ASSUMED for exact fixture mechanics]
- [ ] Restore locked dependencies only after the package checkpoint; current baseline validation cannot execute because Jest is absent. [VERIFIED: environment probe on 2026-10-06]

## Security Domain

Security enforcement is enabled at ASVS level 1 and blocks on high findings. [VERIFIED: `.planning/config.json:47-49`]

### Applicable ASVS Categories

| ASVS Category | Applies | Standard control |
|---|---|---|
| V2 Authentication | No new Phase 19 boundary | Local Progress does not add accounts/authentication; Garmin credential handling remains Phase 18's gated adapter/broker scope. [VERIFIED: `.planning/phases/18-garmin-import/18-CONTEXT.md:26-33`, `.planning/phases/19-progress-parity/19-CONTEXT.md:7-11`] |
| V3 Session Management | No new Phase 19 boundary | No web/user session is introduced; app route/focus state is presentation state, not authentication state. [VERIFIED: `.planning/phases/19-progress-parity/19-UI-SPEC.md:238-244`] |
| V4 Access Control | Limited | Screens receive typed local-owner facts through runtime ports; no screen SQL, raw file access, or provider credential access. [VERIFIED: `.planning/phases/13-multi-plan-running-foundation/13-CONTEXT.md:19-25`, `.planning/architecture/v1.2-garmin-import.md:61-73`] |
| V5 Input Validation | Yes | Validate target duration/date/day selections, bodyweight/date bounds, persisted JSON envelopes, source revisions, and identifiers in domain commands before SQL. [VERIFIED: `.planning/phases/19-progress-parity/19-UI-SPEC.md:361-410`, `src/platform/sqlite/repositories/progressRepository.ts:240-318`] |
| V6 Cryptography | No new primitive | Phase 19 neither stores Garmin secrets nor changes backup encryption; never hand-roll crypto. [VERIFIED: `.planning/architecture/v1.2-garmin-import.md:183-192`] |

The current mobile stack should also be checked against OWASP MASVS storage/privacy controls for bodyweight and imported fitness facts during Phase 20 native acceptance. [CITED: `https://mas.owasp.org/MASVS/`]

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard mitigation |
|---|---|---|
| Stale/replayed target, recommendation, or bodyweight mutation | Tampering | Request receipt/hash, expected source/target revision, compare-and-swap, exclusive transaction, committed read-back. [VERIFIED: `src/platform/sqlite/repositories/workoutOutcomeRepository.ts:2383-2588`, `src/domains/plans/ownedPlanCommands.ts:430-494`] |
| Malformed persisted recommendation/import JSON | Tampering / DoS | Strict bounded parsers, fail closed, no raw error or source details; current recommendation parser returns `null` on invalid evidence. [VERIFIED: `src/platform/sqlite/repositories/progressRepository.ts:215-318`, `.planning/architecture/v1.2-garmin-import.md:117-128`] |
| Sensitive activity/bodyweight facts in logs or screenshots | Information disclosure | Log counts/classified codes/opaque receipts only; exclude route, HR, raw file/account, and bodyweight values from diagnostics unless synthetic. [VERIFIED: `.planning/architecture/v1.2-garmin-import.md:183-192`; ASSUMED for extending the same rule to bodyweight diagnostics]
| Oversized All-time/history rendering | Denial of service | Bounded indexed reads, page/virtualize full data equivalent, sample visual marks only after measurement, no raw FIT parsing in Phase 19. [VERIFIED: `.planning/phases/19-progress-parity/19-UI-SPEC.md:302-322`, `.planning/architecture/v1.2-garmin-import.md:117-128`]
| UI bypass of SQLite authority | Tampering | Runtime typed ports only; no screen SQL/localStorage/fixture mutations. [VERIFIED: `.planning/phases/13-multi-plan-running-foundation/13-CONTEXT.md:19-25`, `.planning/phases/19-progress-parity/19-UI-SPEC.md:20-36`]

## Sources

### Primary (HIGH confidence)

- `.planning/phases/19-progress-parity/19-CONTEXT.md` — locked Phase 19 scope and decisions. [VERIFIED: `.planning/phases/19-progress-parity/19-CONTEXT.md:7-29`]
- `.planning/phases/19-progress-parity/19-UI-SPEC.md` — approved presentation, states, copy, accessibility, and command behavior. [VERIFIED: `.planning/phases/19-progress-parity/19-UI-SPEC.md:1-16`, `.planning/phases/19-progress-parity/19-UI-SPEC.md:219-443`]
- `.planning/REQUIREMENTS.md` and `.planning/ROADMAP.md` — PRO-01–PRO-18 and phase dependency/success criteria. [VERIFIED: `.planning/REQUIREMENTS.md:174-193`, `.planning/ROADMAP.md:198-216`]
- `.planning/design/v1.2-prototype-parity-matrix.md` — exact existing/planned files, tests, evidence IDs, and upstream domain ownership. [VERIFIED: `.planning/design/v1.2-prototype-parity-matrix.md:204-225`]
- `.planning/architecture/v1.2-garmin-import.md` and `.planning/architecture/v1.2-multi-active-plans.md` — accepted import facts, source revision/match semantics, planned ports, and rebuild boundaries. [VERIFIED: `.planning/architecture/v1.2-garmin-import.md:10-16`, `.planning/architecture/v1.2-garmin-import.md:77-157`, `.planning/architecture/v1.2-multi-active-plans.md:43-61`, `.planning/architecture/v1.2-multi-active-plans.md:168-205`]
- Current source and tests under `src/domains/progress`, `src/domains/history`, `src/domains/metrics`, `src/domains/progression`, `src/platform/sqlite`, and `src/ui`. [VERIFIED: exact line citations throughout this document]

### Secondary (MEDIUM confidence)

- React Native accessibility docs — roles, state (`selected`, `busy`, `expanded`), and Android live-region semantics; fetched 2026-10-06. [CITED: `https://reactnative.dev/docs/accessibility`]
- Expo SQLite v57 docs — async transaction scope and exclusive transaction handle; fetched 2026-10-06. [CITED: `https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/`]
- Official react-native-svg repository usage docs — `Svg`, `Polyline`, `Line`, and `Circle`; fetched 2026-10-06. [CITED: `https://github.com/software-mansion/react-native-svg/blob/main/USAGE.md`]
- OWASP MASVS — complementary mobile storage/privacy verification baseline. [CITED: `https://mas.owasp.org/MASVS/`]

### Tertiary (LOW confidence)

- A1–A4 in the Assumptions Log are planner-visible decisions that require upstream contract confirmation before they become locked implementation facts. [ASSUMED]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH for locked in-repo versions and no-new-package rule; MEDIUM for live registry currency; LOW for SUS-package confidence because the legitimacy seam flags recent official Expo publications. [VERIFIED: `package.json:92-132`; CITED: npm registry/package-legitimacy seam on 2026-10-06]
- Architecture: HIGH for current Strength/history/recommendation seams and locked ownership; MEDIUM for recommended new symbols because upstream phases are not implemented in this baseline. [VERIFIED: current code citations; ASSUMED for new symbols]
- Pitfalls: HIGH for snapshot, polling, repeated-decision, comparability, and UI-contract risks; MEDIUM for exact remediation names. [VERIFIED: cited source/test evidence; ASSUMED for names]

**Research date:** 2026-10-06 [VERIFIED: system date]
**Valid until:** 2026-11-05 for the stable locked UI/domain contract, but re-run codebase research immediately after Phase 13/17/18 implementation because planned ports and names will have become concrete. [ASSUMED]

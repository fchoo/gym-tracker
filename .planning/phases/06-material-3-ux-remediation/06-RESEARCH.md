# Phase 6: Material 3 UX Remediation - Research

**Researched:** 2026-08-31  
**Domain:** Expo / React Native Android UX remediation, accessibility, local SQLite-backed Progress recovery  
**Confidence:** MEDIUM

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

## Implementation Decisions

### Library discovery
- **D-68:** Replace the Library filter action/summary pattern with Material 3 filter chips. Selected state must be visible without relying on color, and `Favorite` must be a standalone one-tap chip. The full taxonomy may remain in an overflow filter sheet.
- **D-69:** Remove the unthemed `No filters selected` label; when no filter is active, do not spend permanent horizontal space on status copy. Active filters are represented by selected chips and accessible state.
- **D-70:** Replace the permanent `Refresh Library` action with pull-to-refresh on the owning Library scroll surface. Preserve current results and filters during refresh; expose a labelled Retry only when refresh fails.
- **D-71:** A selected Favorite uses a filled approved-green star and accessible selected state; inactive remains outlined. Browse rows omit source namespace, revision, license, and attribution, while Exercise Detail retains full provenance.

### Search
- **D-72:** Create one repository-owned Material 3 Search primitive and use it for Plans, Exercises, Progress, and the owned-plan exercise picker. It includes a leading search icon, integrated clear action, labelled input, keyboard/IME behavior, and explicit busy/empty/error/result semantics.

### Calendar and dates
- **D-73:** Root Calendar always renders a stable six-row grid containing subdued adjacent-month dates. Adjacent dates are selectable and move the visible month consistently with the selected civil date.
- **D-74:** Horizontal swipe changes month in both directions; labelled previous/next buttons remain as accessible, keyboard, and D-pad alternatives.
- **D-75:** All CalendarField consumers use one Material 3/Google Calendar-inspired dialog: clear date/month hierarchy, complete bounded grid, swipe/button parity, and explicit Cancel/Confirm. Draft selection remains private until confirmation, and all LocalDate/min/max/timezone guarantees remain unchanged.

### Reordering and adaptive behavior
- **D-76:** Plan-day and exercise order use touch-and-hold continuous drag with visible displacement and a 48dp handle. Explicit Move up/Move down buttons remain available. At normal text scale, handle, primary label, supporting label, and fallback actions occupy one horizontal row; at large text they may reflow without clipping or losing controls.
- **D-77:** Root navigation must remain readable and operable at Android 200% font scale. Label clipping or truncated fragments are release-blocking.

### Runtime and shell cleanup
- **D-78:** Diagnose the Progress load failure before changing its presentation. The fix must preserve SQLite source authority, projection rebuildability, period semantics, and bounded safe errors; Retry must actually recover when the underlying condition is recoverable.
- **D-79:** Today exposes one unambiguous secondary-tools entry. Keep the header overflow for appearance/rest-alert settings and replace the full-width generic `More` button with a clearly labelled, compact route to History and data/recovery, or integrate those destinations into one coherent secondary-tools surface.

### Verification and release boundary
- **D-80:** Every behavior change is test-first or receives a regression test in the same task. Integrity-critical code retains complete branch coverage; UI behavior receives component tests plus native interaction evidence where gestures are involved.
- **D-81:** Verify compact, medium, expanded, System/Light/Dark, 200% text, keyboard/D-pad, focus restoration, non-color cues, and minimum 48dp targets. Emulator covers deterministic layout/large-text/gesture evidence; Samsung covers touch ergonomics and OLED appearance.
- **D-82:** Phase 6 produces replacement Android candidate bytes. It does not grant owner approval, promote a release, publish a tag, or run Terminal Seal; those remain explicit final-release actions after attended verification.

### Claude's Discretion
- Exact React Native composition and internal component names, provided the shared primitives and observable contracts above are met.
- Whether the full taxonomy opens as a bottom sheet or dialog at compact width, provided selection remains visible, accessible, and reversible.
- The precise animation curve and drag implementation using installed React Native Gesture Handler/Reanimated versions, provided reduced-motion behavior and button fallbacks work.
- The internal root-cause repair for Progress after evidence identifies it.

### Deferred Ideas (OUT OF SCOPE)

## Deferred Ideas

- Accounts, cloud sync, social features, Health Connect, Wear OS, and new training domains remain out of scope.
- Release promotion, public tags, and Terminal Seal remain paused until the replacement candidate passes the final attended gate.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UX-01 | Library exercise filters use compact Material 3 filter-chip behavior with an immediately visible selected state in System, Light, and Dark modes; Favorite is a standalone one-tap chip and the full taxonomy remains available without obscuring the result list. | Extend the shared component surface and refactor `LibraryScreen`; retain filter semantics and test appearance, state, removal, and focus. |
| UX-02 | Library plan search, Library exercise search, Progress exercise search, and owned-plan exercise picking use one shared Material 3 Search component with a leading search icon, integrated clear action, keyboard/IME behavior, and accessible busy, empty, and result states. | Introduce one repository-owned primitive, then replace the four screen-local inputs with typed adapters and component contracts. |
| UX-03 | The root Calendar always renders a complete six-row month grid with subdued adjacent-month dates, preserves civil-date and timezone semantics, and supports horizontal previous/next month swipes with labelled button alternatives. | Refactor `CalendarScreen` presentation/state only; retain typed `LocalDate` flow to `loadCalendarMonth`, and prove buttons/swipes give the same month-selection result. |
| UX-04 | Plan days and exercises support touch-and-hold continuous drag reordering with a 48dp handle, visible movement feedback, and accessible up/down fallback actions; primary row content stays on one horizontal line at normal text scale and remains legible at 200% text. | Replace threshold `PanResponder` behavior in the shared reorder row with the already installed gesture/animation stack; retain identical draft-only move operations for buttons and accessibility actions. |
| UX-05 | Every in-app date field uses a consistent Material 3/Google Calendar-inspired dialog with clear selected-date hierarchy, a complete bounded calendar grid, month swipe plus labelled buttons, explicit Cancel/Confirm behavior, and unchanged LocalDate correctness. | Evolve the single existing `CalendarField` rather than adding pickers; retain private draft and `LocalDate` helpers with component/native tests. |
| UX-06 | Library refresh is performed through pull-to-refresh on the owning list; the permanent Refresh Library button is removed, failed refresh preserves current results and filters, and a labelled retry remains available only in the failure state. | Add an optional controlled refresh hook to `AdaptiveScreen`, connect existing `requestLibraryRefresh`, and test preservation/failure state. |
| UX-07 | Favorite controls use a filled approved-green star plus accessible selected state when active and an outlined star when inactive, without relying on color alone. | Update shared/icon treatment in the Library browse/favorite control, keeping source-commit acknowledgement and exact-item busy behavior. |
| UX-08 | Exercise browse and Favorite/Recent rows omit source namespace, revision, license, and attribution while Exercise Detail retains complete provenance. | Refine only browse-row view composition; do not change repository fields or detail provenance. |
| UX-09 | Root navigation and shared dialogs remain readable and operable at Android 200% font scale without clipped labels; Today exposes one unambiguous route to secondary tools/settings instead of duplicate More affordances. | Make `AppTabs` respond to usable width/font scale, preserve route order, and rename/reposition the Today secondary route without changing destinations. |
| UX-10 | Progress loads its normal empty or populated view on the production runtime, Retry recovers from a transient failure, and any fix preserves SQLite source authority and rebuildable projections. | Start with the bounded diagnostic protocol below; encode the observed failing branch as a host-SQLite fixture before applying the minimal repair. |
</phase_requirements>

## Summary

Phase 6 should be implemented as a shared-primitives and screen-composition remediation, not as a new design system or data-layer rewrite. The repository already centralizes theme, actions, focus behavior, `AdaptiveScreen`, civil-date helpers, typed runtime capabilities, and the installed gesture stack. Reuse those seams: screens remain typed clients and do not execute SQL. [VERIFIED: src/ui/layout/AdaptiveScreen.tsx:43-71] [VERIFIED: src/ui/components/index.ts:198-245]

The most consequential constraint is UX-10. The exact candidate proves that the generic Progress failure view occurs repeatedly after Retry, but does not record the thrown exception. The evidence is therefore sufficient to require a reproducible diagnosis, but insufficient to claim a migration, projection-queue, or malformed-data cause. The first plan task must capture a redacted failure signature and map it to the exact repository branch; only then should it change production behavior. [VERIFIED: .planning/phases/05-recovery-distribution-and-release/05-UI-REVIEW.md:137-143] [VERIFIED: .planning/ui-reviews/material3-runtime-20260831/EVIDENCE.md:18-40]

The phase installs no package. Its current project manifest already declares the runtime stack needed for this work: "`expo`: `~57.0.18`; `react-native`: `0.86.3`; `react-native-gesture-handler`: `~2.32.0`; `react-native-reanimated`: `4.5.1`; `react-native-worklets`: `0.10.1`". [VERIFIED: package.json:76-98]

**Primary recommendation:** Build four shared presentation primitives (Search, filter chip, calendar/date grid behavior, and refresh support), use the installed gesture stack only after native configuration verification, and make Progress diagnostic-first with a regression fixture sourced from the exact observed failure.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Filter/search/favorite/list hierarchy | Browser / Client | API / Backend | The client owns interaction, state presentation, focus, and source-commit feedback; typed runtime methods remain the data boundary. [VERIFIED: src/ui/screens/LibraryScreen.tsx:1229-1281] |
| Library pull-to-refresh | Browser / Client | API / Backend | `AdaptiveScreen` owns the scrolling surface; `refreshLibrary` remains the typed runtime operation. [VERIFIED: src/ui/layout/AdaptiveScreen.tsx:163-193] [VERIFIED: src/ui/screens/LibraryScreen.tsx:1492-1522] |
| Calendar grid and date dialog | Browser / Client | API / Backend | Calendar/date components render and retain private drafts; typed `LocalDate` input continues to own civil-date correctness. [VERIFIED: src/ui/screens/CalendarScreen.tsx:276-387] [VERIFIED: src/ui/components/CalendarField.tsx:199-293] |
| Month swipe and reorder drag | Browser / Client | — | Native touch recognition and visual displacement belong to client presentation; buttons/actions remain equal non-gesture controls. [CITED: https://docs.expo.dev/versions/v57.0.0/sdk/gesture-handler/] [CITED: https://reactnative.dev/docs/0.86/accessibility] |
| Root navigation and Today secondary tools | Browser / Client | — | Root destinations and their tab rendering are client routing/shell concerns. [VERIFIED: src/ui/components/index.ts:1027-1144] [VERIFIED: app/(tabs)/_layout.tsx:14-45] |
| Progress normal/error/retry state | Browser / Client | API / Backend; Database / Storage | The screen renders typed outcome, runtime delegates to repository, and repository owns local SQLite reads/projection freshness. [VERIFIED: src/ui/screens/ProgressScreen.tsx:594-682] [VERIFIED: src/bootstrap/workoutAppRuntime.tsx:2564-2567] [VERIFIED: src/platform/sqlite/repositories/progressRepository.ts:283-435] |
| Progress diagnosis and repair | Database / Storage | API / Backend; Browser / Client | Root cause, schema/projection state, and read recovery belong at repository/storage boundary; UI only receives bounded safe outcome. [VERIFIED: src/platform/sqlite/repositories/progressRepository.ts:287-435] |

## Project Constraints (from .trae/rules/rules.md)

- Read and follow the repository `AGENTS.md`; its routing requires the `gstack-investigate` workflow for bugs/errors. [VERIFIED: .trae/rules/rules.md:1-4] [VERIFIED: AGENTS.md:1-20]
- Keep SQLite source facts authoritative. [VERIFIED: .trae/rules/rules.md:12-12]
- Keep notifications, projections, and recommendations replayable or rebuildable. [VERIFIED: .trae/rules/rules.md:13-13]
- Do not acknowledge a set before its exclusive transaction commits. [VERIFIED: .trae/rules/rules.md:14-14]
- Preserve bundled versus user-owned data boundaries and keep the workout critical path offline. [VERIFIED: .trae/rules/rules.md:15-16]
- Write tests with each behavior; integrity-critical modules require complete branch coverage. [VERIFIED: .trae/rules/rules.md:17-17]
- Future implementation commits must be atomic and include the required TRAE co-author trailer. This research task creates no commit. [VERIFIED: .trae/rules/rules.md:18-20]

## Standard Stack

### Core

| Library / Asset | Version | Purpose | Why Standard for this Phase |
|-----------------|---------|---------|-----------------------------|
| Repository-owned theme, action, and focus primitives | Existing source | Material 3-aligned visual states, accessible actions, root navigation | Centralized components already implement labels, disabled/busy state, keyboard activation, and focus ring; extend them rather than create screen-local lookalikes. [VERIFIED: src/ui/components/index.ts:62-101] [VERIFIED: src/ui/components/index.ts:198-245] |
| `AdaptiveScreen` | Existing source | Responsive scroll/pane shell and optional Library refresh host | It already owns the `ScrollView`, scroll restore, safe areas, and dock behavior; add a narrow refresh prop rather than a nested per-screen scroll container. [VERIFIED: src/ui/layout/AdaptiveScreen.tsx:43-215] |
| React Native `RefreshControl` | React Native 0.86 surface | Controlled pull-to-refresh | It is designed for a `ScrollView`/`ListView`; `refreshing` is controlled and must become true in `onRefresh` or the indicator stops. [CITED: https://reactnative.dev/docs/0.86/refreshcontrol] |
| `react-native-gesture-handler` | `~2.32.0` | Native-backed long-press drag and horizontal month recognition | Expo SDK 57 documents this compatible version as the gesture solution; use only the already installed dependency. [VERIFIED: package.json:93-94] [CITED: https://docs.expo.dev/versions/v57.0.0/sdk/gesture-handler/] |
| `react-native-reanimated` and `react-native-worklets` | `4.5.1` / `0.10.1` | Drag displacement and directional calendar motion | Expo documents Reanimated as the animation library and says `babel-preset-expo` configures its plugin when installed. Native candidate verification remains required because no project Babel config was found during this pass. [VERIFIED: package.json:94-98] [CITED: https://docs.expo.dev/versions/unversioned/sdk/reanimated/] |

### Supporting

| Library / Asset | Version | Purpose | When to Use |
|-----------------|---------|---------|-------------|
| `lucide-react-native` | `1.31.0` | Search, check, star, calendar/navigation, and move icons | Use the existing icons inside labelled shared controls; do not add an icon package. [VERIFIED: package.json:90-90] [VERIFIED: src/ui/components/index.ts:1-20] |
| React Native accessibility props/actions | Built in | Selected/busy/disabled semantics and reorder fallbacks | Preserve `adjustable` plus `increment`/`decrement` actions for the reorder handle and retain explicit buttons. [CITED: https://reactnative.dev/docs/0.86/accessibility] |
| Jest + React Native Testing Library | `29.7.0` / `14.0.1` | Component and route contracts | Use existing component project for all state, focus, semantics, and source-preservation tests. [VERIFIED: package.json:101-107] [VERIFIED: jest.config.js:40-50] |
| Node host SQLite tests | Node test runtime | Production-state Progress fixtures | Use current migration runner plus `createProgressRepository` to reproduce the observed branch without putting data or SQL diagnostics in UI tests. [VERIFIED: tests/sqlite-host/progressRepository.test.ts:107-132] |
| Maestro 2.8.0 | Installed | Candidate gesture, 200% text, and exact Progress reproduction evidence | Use only after Android Platform Tools/`adb` are available; native gestures and clipping cannot be established by component tests alone. [VERIFIED: environment probe, 2026-08-31] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Repository-owned Search/filter/date/reorder primitives | A third-party Material or draggable-list component library | Do not use. It would duplicate existing theme/focus/source-commit contracts and add dependency/configuration risk without addressing the exact candidate failure. [VERIFIED: .planning/phases/06-material-3-ux-remediation/06-UI-SPEC.md:1-29] |
| Native gesture stack already present | Continue using release-threshold `PanResponder` | Do not use for UX-04/UX-03. The existing handler invokes a one-step move only on release, which cannot meet continuous displacement. [VERIFIED: src/ui/components/PlanEditorFields.tsx:141-153] |
| Bounded Progress diagnostics + storage fixture | UI-only retry/presentation change | Do not use. The current UI catches all rejections with no cause, so presentation cannot prove or repair data-layer behavior. [VERIFIED: src/ui/screens/ProgressScreen.tsx:612-626] |

**Installation:**

```bash
# No package installation for Phase 6.
```

**Package Legitimacy Audit:** Not applicable. Phase 6 must install no external package. Existing-package registry checks were not used to approve a new installation; if a later plan proposes a package, it must rerun the legitimacy gate and correct-ecosystem registry check before adding it.

## Architecture Patterns

### System Architecture Diagram

```text
Android input / keyboard / TalkBack
             |
             v
Repository-owned UI primitives
  Search | filter chips | date grid | drag handle | AppTabs | RefreshControl
             |
             +------------------------------+
             |                              |
             v                              v
Screen-local display state              Typed runtime capability
Library / Calendar / Plan editor /      (no SQL in screen)
Today / Progress                         |
             |                            v
             |                     SQLite repositories
             |                     source facts + projections
             |                            |
             +-- normal / empty /          +--> migration & rebuild effects
                 updating / safe error            (replayable)

Exact-candidate Progress failure
             |
             v
Redacted exception + load-branch correlation
             |
             v
Host-SQLite production-state regression fixture
             |
             v
Minimal repository/lifecycle repair --> normal typed result --> Progress render
```

### Recommended Project Structure

```text
src/
├── ui/
│   ├── components/          # Add shared Search/filter/date/reorder primitives here
│   ├── layout/              # Extend AdaptiveScreen refresh ownership narrowly
│   ├── screens/             # Compose primitives; retain typed runtime inputs
│   └── __tests__/           # Component/route accessibility and state contracts
├── bootstrap/               # Runtime/lifecycle wiring only if diagnosis proves necessary
└── platform/sqlite/
    ├── repositories/        # Progress diagnosis/minimal read repair
    └── effects/             # Preserve rebuild/replay behavior
tests/sqlite-host/           # Exact Progress regression fixture and repository behavior
maestro/phase6/              # New native interaction flows (Wave 0)
scripts/                     # Candidate/evidence runner derived from Phase 5 (Wave 0)
```

### Pattern 1: One shared primitive, thin typed adapters

**What:** Add Search, filter-chip, calendar-grid/date-dialog, and reorder presentation at repository-owned UI seams. Each consumer passes typed values/callbacks and owns its domain-specific empty/error/result data.

**When to use:** Every UX-01 through UX-09 component repeated across screens.

**Implementation direction:** `LibraryScreen` has a local `SearchField`, while Progress and the owned-plan picker each carry separate input composition. Replace those with a common primitive, but retain the labels and data contracts supplied by each screen. [VERIFIED: src/ui/screens/LibraryScreen.tsx:382-435] [VERIFIED: src/ui/screens/ProgressScreen.tsx:64-75] [VERIFIED: src/ui/screens/OwnedPlanEditorScreen.tsx:1231-1231]

```tsx
// Source: repository pattern plus React Native controlled input/refresh docs.
// The primitive renders icon, input, clear, and busy state; the screen owns query.
<M3SearchField
  busy={isSearching}
  label={searchLabel}
  onChangeText={setQuery}
  value={query}
/>
```

### Pattern 2: Own pull-to-refresh on the existing scroll host

**What:** Add optional `refreshControl`/`onRefresh` support to `AdaptiveScreen` and hand it to its existing `ScrollView`; `LibraryScreen` keeps its existing in-flight guard, snapshot merge, and failure-only retry.

**When to use:** UX-06 only. Do not place a second scroll surface around Library content.

**Why:** Current Library refresh already preserves the current snapshot and section preference, but it is exposed as a permanent action. [VERIFIED: src/ui/screens/LibraryScreen.tsx:1492-1522] React Native requires the controlled refresh state to be asserted while the request is active. [CITED: https://reactnative.dev/docs/0.86/refreshcontrol]

```tsx
// Source: https://reactnative.dev/docs/0.86/refreshcontrol
<ScrollView
  refreshControl={
    <RefreshControl
      onRefresh={requestLibraryRefresh}
      refreshing={refreshing}
    />
  }
>
  {content}
</ScrollView>
```

### Pattern 3: Civil-date presentation does not change civil-date ownership

**What:** Refactor the existing `CalendarField` month/grid rendering to use 42 cells including adjacent days; bounds decide disabled state; selected draft commits only through `Apply Date`. Keep date strings within `LocalDate` helpers and do not use JavaScript instant parsing for field values.

**When to use:** Every `CalendarField` consumer and root Calendar adjacent-date selection.

**Why:** `CalendarField` already declares a civil-date selector and its current `confirm` only sends the draft to `onChange`; retain those safety properties while replacing blank cells/horizontal scroll and adding swipe parity. [VERIFIED: src/ui/components/CalendarField.tsx:199-203] [VERIFIED: src/ui/components/CalendarField.tsx:276-293] [VERIFIED: src/ui/components/CalendarField.tsx:474-567]

### Pattern 4: Gesture enhancement with equal non-gesture operations

**What:** The reorder handle starts a long-press continuous drag and animates temporary visual displacement. On valid drop, invoke exactly the existing draft move/reorder operation. Buttons, keyboard activation, and `increment`/`decrement` actions invoke that same operation.

**When to use:** Plan-day and exercise ordering, and root/date month swipe only.

**Why:** Existing `PanResponder` maps release distance to a single move; the available `adjustable` actions already prove the shared-operation direction. [VERIFIED: src/ui/components/PlanEditorFields.tsx:116-223] React Native documents `increment` and `decrement` actions for adjustable controls. [CITED: https://reactnative.dev/docs/0.86/accessibility]

### Pattern 5: Progress diagnosis before repair

**What:** Reproduce the exact candidate, collect a privacy-safe exception/branch identifier, create a host SQLite fixture for the actual failing state, and only then implement the smallest repair.

**When to use:** UX-10 before any visual polish task on Progress.

**Current evidence and hypothesis:**

- The audited bytes were: "Package: `com.fchoo.gymtracker`", "Installed candidate APK SHA-256: `3383558069db759a0fe781c0a68f349423576a3953507dbae787df6aba99febd`", and "Device: `emulator-5554`, `sdk_gphone64_arm64`, Android 16 / API 36". [VERIFIED: .planning/ui-reviews/material3-runtime-20260831/EVIDENCE.md:3-12]
- The audit observed that Progress remained in failure after Retry and after starter-plan activation; it explicitly does **not** claim a root cause. [VERIFIED: .planning/phases/05-recovery-distribution-and-release/05-UI-REVIEW.md:137-143]
- The UI does exactly `void loadProgress({ period, nowLocalDate })` and turns any rejection into `setFailed(true)`. [VERIFIED: src/ui/screens/ProgressScreen.tsx:612-626] Quote: `void loadProgress({ period, nowLocalDate }).then((next) => {` and `.catch(() => { ... setFailed(true); })`.
- Runtime delegates that operation directly: `}) => requireServices().progressRepository.load(input)`. [VERIFIED: src/bootstrap/workoutAppRuntime.tsx:2564-2567]
- The repository returns safe `"unavailable"`/`"updating"` results for missing/out-of-date projection subjects before its parallel data reads, so the observed rejection is more likely in a query or parser reached after that branch. This is a hypothesis, not a cause. [VERIFIED: src/platform/sqlite/repositories/progressRepository.ts:309-336] [ASSUMED]

**Diagnostic protocol (first planned task, bounded to the exact failure):**

1. Install/pull the exact candidate identified above or recreate it from its candidate manifest; confirm package, version code, and SHA-256 before recording observations.
2. Clear/preserve only the test-device state needed to reproduce both clean-install and activated-starter paths. Capture redacted `adb logcat` around opening Progress and pressing Retry. Do not log raw rows, recommendation JSON, session IDs, exercise IDs, paths, or backup contents.
3. Add a temporary test-only probe or a production-safe error classification at the six repository load branches: period inputs, exposures, schedule opportunities, legacy recommendations, owned recommendations, and effective history sessions. Emit only branch name plus SQLite error class/code. [VERIFIED: src/platform/sqlite/repositories/progressRepository.ts:338-400]
4. Inspect migration/version/schema state only after the error identifies a schema branch. A globally missing projection table is less likely because migration failure would normally block trusted launch, but it must still be checked against the exact database rather than assumed. [ASSUMED]
5. Encode the observed branch/state in `tests/sqlite-host/progressRepository.test.ts`, including recovery from any recoverable condition; extend lifecycle/effect tests only if the captured cause crosses the rebuild queue.
6. Apply the minimal fix. The fix must preserve the repository's safe `updating`/`unavailable` result states, source authority, and rebuildability; UI Retry must reissue the same typed read and reach a factual normal/empty state when the condition is recoverable. [VERIFIED: src/ui/screens/ProgressScreen.tsx:650-700] [VERIFIED: src/platform/sqlite/repositories/progressRepository.ts:309-435]

### Anti-Patterns to Avoid

- **A screen-local Material lookalike:** Do not reproduce Search, chip, or date styles separately per screen; this would reintroduce drift in focus and state behavior. [VERIFIED: .planning/phases/06-material-3-ux-remediation/06-UI-SPEC.md:1-29]
- **Nested Library scroll container:** Do not add a separate `ScrollView` to implement refresh; `AdaptiveScreen` owns scrolling and scroll restoration. [VERIFIED: src/ui/layout/AdaptiveScreen.tsx:72-107] [VERIFIED: src/ui/layout/AdaptiveScreen.tsx:163-193]
- **Release-threshold drag:** Do not keep `PanResponder` and call it continuous drag; it moves only after release. [VERIFIED: src/ui/components/PlanEditorFields.tsx:141-153]
- **Gesture-only essential behavior:** Do not remove labelled month buttons, Move controls, keyboard behavior, or accessibility actions. [CITED: https://reactnative.dev/docs/0.86/accessibility]
- **UTC/instant conversion for a form date:** Do not parse `LocalDate` through JavaScript `Date`; retain current dedicated helper path. [VERIFIED: src/ui/components/CalendarField.tsx:19-25] [VERIFIED: src/ui/components/CalendarField.tsx:88-94]
- **UI-only Progress fix:** Do not alter copy, swallow errors, or fabricate a successful Progress view before the rejecting branch is proven. [VERIFIED: src/ui/screens/ProgressScreen.tsx:612-626] [ASSUMED]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Pull-to-refresh mechanics | Custom touch-offset/refresher state machine | React Native `RefreshControl` on `AdaptiveScreen`'s owning `ScrollView` | Controlled platform behavior already covers the pull/indicator lifecycle. [CITED: https://reactnative.dev/docs/0.86/refreshcontrol] |
| Native gesture recognition/drag tracking | New JS responder implementation | Installed `react-native-gesture-handler` plus `react-native-reanimated` | The project already includes Expo-compatible native gesture/animation libraries; new dependency is unnecessary. [VERIFIED: package.json:93-98] [CITED: https://docs.expo.dev/versions/v57.0.0/sdk/gesture-handler/] [CITED: https://docs.expo.dev/versions/unversioned/sdk/reanimated/] |
| Civil-date arithmetic and validation | Date-only JavaScript `Date` parsing | Existing `LocalDate` domain helpers | Existing field code is intentionally civil-date safe and bounded. [VERIFIED: src/ui/components/CalendarField.tsx:19-25] [VERIFIED: src/ui/components/CalendarField.tsx:156-181] |
| Projection rebuild/retry behavior | A new Progress cache or forced stale totals | Existing history projection repository/effect runner | The existing queue has retries, expired-claim recovery, and permanent failure handling; repair its proven failure rather than bypassing source facts. [VERIFIED: src/platform/sqlite/effects/historyProjectionEffects.ts:12-22] [VERIFIED: src/platform/sqlite/effects/historyProjectionEffects.ts:119-145] |
| Root navigation | A second navigation system | Existing `AppTabs` + Expo Router tab layout | Existing shell owns route order and selected semantics; it needs adaptive layout, not a router replacement. [VERIFIED: src/ui/components/index.ts:1027-1144] [VERIFIED: app/(tabs)/_layout.tsx:21-45] |

**Key insight:** The successful remediation is a composition change over trustworthy state boundaries. Replacing those boundaries would be a larger risk than the UI defects the phase is meant to repair. [VERIFIED: .trae/rules/rules.md:12-17]

## Common Pitfalls

### Pitfall 1: Treating the Progress error screen as a root cause

**What goes wrong:** A developer changes error copy or retries a known failing read but leaves the production repository rejection intact.

**Why it happens:** The screen intentionally catches every rejected `loadProgress` promise without retaining a cause. [VERIFIED: src/ui/screens/ProgressScreen.tsx:612-626]

**How to avoid:** Run the bounded diagnostic protocol first, convert the actual branch/state to a host SQLite fixture, then repair the narrowest layer.

**Warning signs:** A test only mocks a generic rejection; the existing component test does exactly that and cannot establish production schema/effect recovery. [VERIFIED: src/ui/__tests__/ProgressScreen.test.tsx:275-285]

### Pitfall 2: Conflating safe projection freshness with failure

**What goes wrong:** A projection rebuild shows stale totals, a generic load error, or an invented empty state.

**Why it happens:** The repository has explicit freshness outcomes and the UI has separate updating presentation. [VERIFIED: src/platform/sqlite/repositories/progressRepository.ts:309-336] [VERIFIED: src/ui/screens/ProgressScreen.tsx:685-700]

**How to avoid:** Preserve `updating`/`unavailable` as source-safe non-final states; only the observed throw gets the error path.

**Warning signs:** A repair bypasses projection freshness or returns stale projection values as current. [ASSUMED]

### Pitfall 3: Refresh clears the user’s discovery context

**What goes wrong:** Pull-to-refresh resets results, query, filters, or selected section.

**Why it happens:** Refresh state is implemented as an initial-load reset rather than a snapshot update.

**How to avoid:** Reuse the current `requestLibraryRefresh` merge behavior; attach it to the scroll host and remove only the permanent action. [VERIFIED: src/ui/screens/LibraryScreen.tsx:1492-1522] [CITED: https://reactnative.dev/docs/0.86/refreshcontrol]

**Warning signs:** Filter chips disappear, query clears, or a Refresh action remains visible outside failure retry.

### Pitfall 4: Gesture arbitration breaks scroll, keyboard, or TalkBack

**What goes wrong:** Horizontal swipes trigger vertical scrolling, drag starts on tap, or drag eliminates accessible movement.

**Why it happens:** Native interaction behavior cannot be inferred from React Native component tests alone.

**How to avoid:** Keep gestures narrowly scoped, preserve buttons/actions, verify exact candidate on emulator and Samsung, and check actual root/animation configuration before implementation. [CITED: https://docs.expo.dev/versions/v57.0.0/sdk/gesture-handler/] [CITED: https://reactnative.dev/docs/0.86/accessibility]

**Warning signs:** A test asserts callbacks but no native evidence shows held-item displacement or month navigation.

### Pitfall 5: Date dialog improves appearance but changes a civil date

**What goes wrong:** An adjacent-day tap, date bound, cancel, or time-zone boundary changes persisted date semantics.

**Why it happens:** Date grid rewrites often use instant-based dates or commit draft selection immediately.

**How to avoid:** Keep `LocalDate` helpers, private draft, explicit Apply, disabled bounds, and cancellation focus restoration; test leap month/boundary/adjacent-cell behavior. [VERIFIED: src/ui/components/CalendarField.tsx:125-181] [VERIFIED: src/ui/components/CalendarField.tsx:260-293]

**Warning signs:** `Date` appears in a date-only field path, cancel calls `onChange`, or the grid adds blank leading/trailing placeholders. [ASSUMED]

### Pitfall 6: Large-text verification only checks rendering width

**What goes wrong:** Tabs or modal controls technically render but clip, overlap, or lose focus order at 200%.

**Why it happens:** The existing tab surface uses a fixed bottom arrangement; audit evidence captured clipped root labels at Android scale 2.0. [VERIFIED: .planning/phases/05-recovery-distribution-and-release/05-UI-REVIEW.md:133-139]

**How to avoid:** Feed font scale into compact navigation layout, permit two rows, and include deterministic native 200% capture plus keyboard/D-pad checks.

**Warning signs:** One-word destination labels wrap into fragments or required controls are hidden behind a horizontal grid scroll. [VERIFIED: .planning/ui-reviews/material3-runtime-20260831/EVIDENCE.md:32-33]

## Code Examples

Verified patterns from the inspected repository and official sources:

### Controlled pull-to-refresh

```tsx
// Source: https://reactnative.dev/docs/0.86/refreshcontrol
// `refreshing` stays true during the typed refresh operation.
<RefreshControl
  onRefresh={requestLibraryRefresh}
  refreshing={refreshing}
/>
```

React Native documents `refreshing` as a controlled property: set it true when `onRefresh` begins and false when the work completes. [CITED: https://reactnative.dev/docs/0.86/refreshcontrol]

### One operation for accessible reorder fallback

```tsx
// Source: https://reactnative.dev/docs/0.86/accessibility
<FocusablePressable
  accessibilityActions={[
    { name: "increment", label: "Move up" },
    { name: "decrement", label: "Move down" },
  ]}
  accessibilityRole="adjustable"
  onAccessibilityAction={onMoveAccessibilityAction}
/>
```

The current reorder handle already follows this pattern and its actions call the same upward/downward callbacks as buttons. [VERIFIED: src/ui/components/PlanEditorFields.tsx:162-220]

### Safe Progress branch order

```text
read freshness
  -> unavailable/updating: return typed safe state
  -> current: execute data reads
  -> observed rejection: capture redacted branch/error, reproduce in host fixture
  -> minimal repair: preserve source facts and rebuild/replay behavior
```

The actual repository returns early on freshness mismatch before `Promise.all` parallel reads. [VERIFIED: src/platform/sqlite/repositories/progressRepository.ts:309-345]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Permanent Library refresh action | Controlled pull-to-refresh on owning scroll surface with failure-only retry | Phase 6 locked decision | Results/query/filters remain while refresh works; no permanent action competes with discovery. [VERIFIED: .planning/phases/06-material-3-ux-remediation/06-CONTEXT.md:14-17] [CITED: https://reactnative.dev/docs/0.86/refreshcontrol] |
| Release-threshold `PanResponder` reorder | Long-press continuous native drag with explicit non-gesture fallback | Phase 6 locked decision | Meets direct manipulation while retaining keyboard/TalkBack/D-pad operation. [VERIFIED: src/ui/components/PlanEditorFields.tsx:141-153] [VERIFIED: .planning/phases/06-material-3-ux-remediation/06-CONTEXT.md:28-31] |
| Current-month-only/blank calendar cells | Six-row adjacent-month civil-date grid with swipe/button parity | Phase 6 locked decision | Required dates remain visible/selectable and stable at large text. [VERIFIED: .planning/phases/06-material-3-ux-remediation/06-CONTEXT.md:21-24] |
| Generic Progress catch as sole failure evidence | Exact candidate capture + redacted branch signature + host regression fixture | Phase 6 research recommendation | Moves from untestable UI symptom to evidence-led minimal repair. [VERIFIED: src/ui/screens/ProgressScreen.tsx:612-626] [ASSUMED] |

**Deprecated/outdated for this phase:**

- `Refresh Library` as a permanent secondary action: replace with owning pull-to-refresh; retain only `Retry Library refresh` after a failure. [VERIFIED: src/ui/screens/LibraryScreen.tsx:1696-1715] [VERIFIED: .planning/phases/06-material-3-ux-remediation/06-CONTEXT.md:14-17]
- `No filters selected` as permanent status copy: remove it; active selection must be visible via chips and accessible state. [VERIFIED: src/ui/screens/LibraryScreen.tsx:1672-1695] [VERIFIED: .planning/phases/06-material-3-ux-remediation/06-CONTEXT.md:12-15]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The exact Progress rejection is likely after the freshness early-return branch, in a downstream query/parser path. | Pattern 5 | A premature storage repair could mask a different runtime cause; diagnostic-first task prevents this. |
| A2 | A globally missing projection schema is less likely because it would normally block trusted launch, but must be inspected against exact candidate state. | Pattern 5 | Failing to inspect schema/version could miss a migration-state defect. |
| A3 | Native gesture implementation needs actual configuration verification because this pass did not locate a project Babel config and `app/_layout.tsx` has no observed `GestureHandlerRootView` wrapper. | Standard Stack / Pitfall 4 | Gesture behavior could fail or conflict on device even when component tests pass. |
| A4 | Two-row compact navigation is the appropriate large-text layout strategy. | Pitfall 6 | If host tab layout restricts it, another adaptive arrangement with the same full-label/target guarantees is required. |

## Open Questions

1. **Which exact `progressRepository.load` branch rejects on the audited candidate?**
   - What we know: exact candidate evidence proves repeated generic failure; screen/runtime/repository seams are traced. [VERIFIED: .planning/ui-reviews/material3-runtime-20260831/EVIDENCE.md:20-33] [VERIFIED: src/ui/screens/ProgressScreen.tsx:612-626]
   - What's unclear: the exception message/code and whether it is schema, query, parse, effect, or runtime initialization state.
   - Recommendation: make the controlled logcat/branch-correlation task the first implementation task and gate repair on its result.

2. **What native root/configuration is required by the installed gesture implementation in this application build?**
   - What we know: installed package versions match Expo SDK 57 guidance; Expo documents Reanimated auto-configuration by `babel-preset-expo` when installed. [VERIFIED: package.json:93-98] [CITED: https://docs.expo.dev/versions/v57.0.0/sdk/gesture-handler/] [CITED: https://docs.expo.dev/versions/unversioned/sdk/reanimated/]
   - What's unclear: the actual generated/native configuration for the current replacement candidate.
   - Recommendation: add a Wave 0 native smoke check before building calendar/reorder gesture tasks; do not introduce a dependency.

3. **How should Android Platform Tools be invoked for replacement-candidate evidence?**
   - What we know: `maestro --version` returns `2.8.0`; `adb` is not on the default shell PATH, but Android Platform Tools 37.0.1 is available at `/opt/homebrew/share/android-commandlinetools/platform-tools/adb` and already produced the exact-candidate audit. [VERIFIED: environment probe, 2026-08-31]
   - What's unclear: whether execution scripts should accept an explicit ADB path or extend PATH locally.
   - Recommendation: resolve the pinned executable explicitly or prepend its directory inside the Phase 6 runner; do not add a package installation step.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | Typecheck, Jest, build/evidence scripts | ✓, version differs from manifest engine | `v26.8.1`; manifest quotes `node: "24.19.0"` | Use the project-pinned Node 24.19.0 before final verification. [VERIFIED: package.json:7-10] [VERIFIED: environment probe, 2026-08-31] |
| npm | Project scripts | ✓, version differs from manifest engine | `11.19.0`; manifest quotes `npm: "11.17.0"` | Use project-pinned npm 11.17.0 if lock/install behavior differs. [VERIFIED: package.json:7-10] [VERIFIED: environment probe, 2026-08-31] |
| Maestro | Native gesture/accessibility candidate flows | ✓ | `2.8.0` | — [VERIFIED: environment probe, 2026-08-31] |
| Android Platform Tools (`adb`) | Install/pull exact candidate, logcat, font scale, evidence collection | ✓ at pinned absolute path; not on default PATH | `37.0.1-15733141` | Use `/opt/homebrew/share/android-commandlinetools/platform-tools/adb` or prepend that directory inside the Phase 6 runner. [VERIFIED: environment probe, 2026-08-31] |
| Android emulator / Samsung device | Required D-81 native evidence | Emulator ✓; Samsung not connected during research | Android 16/API 36 emulator; Samsung model known as SM-S916B | Emulator is available for deterministic evidence; reconnect Samsung for attended ergonomics/OLED review. [VERIFIED: exact-candidate audit, 2026-08-31] |

**Missing dependencies with no fallback:**

- Samsung device connection for the final attended ergonomics/OLED review. It does not block source implementation, tests, or emulator evidence.

**Missing dependencies with fallback:**

- None.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 29.7.0 with Jest Expo and React Native Testing Library 14.0.1. [VERIFIED: package.json:101-107] |
| Config file | `jest.config.js`; projects are `unit`, `components`, `sqlite-host`, and `integration`. Quote: `displayName: "unit"`, `displayName: "components"`, `displayName: "sqlite-host"`, `displayName: "integration"`. [VERIFIED: jest.config.js:25-79] |
| Quick run command | `npm run test:components -- --runInBand` for presentation work; `npm run test:sqlite:host -- --runInBand` for Progress storage work. [VERIFIED: package.json:22-25] |
| Full suite command | `npm run test:all -- --runInBand`. [VERIFIED: package.json:60-60] |
| Native candidate command pattern | Derive a Phase 6 runner from `scripts/run-phase5-maestro.mjs`; its current runner validates candidate/device identity, runs contract flows, and resets Android font scale after the adaptive flow. [VERIFIED: scripts/run-phase5-maestro.mjs:172-225] |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UX-01 | Selected/unselected chips, standalone Favorite, taxonomy draft/apply/remove, Light/Dark/System non-color state | Component + native evidence | `npm run test:components -- --runInBand` | Extend `src/ui/__tests__/LibraryScreen.test.tsx` ✅ |
| UX-02 | One Search primitive in four consumers; icon/clear/IME/busy/empty/error/focus | Component + route + native keyboard/TalkBack | `npm run test:components -- --runInBand` | New primitive test ❌ Wave 0; extend consumer tests ✅ |
| UX-03 | 42 cells, adjacent selection, `LocalDate`, button/swipe equivalence, state labels | Component + native gesture | `npm run test:components -- --runInBand` | Extend `src/ui/__tests__/CalendarScreen.test.tsx` ✅; Phase 6 Maestro flow ❌ Wave 0 |
| UX-04 | Held row/live displacement, drop draft only, buttons/actions equivalent, 200% reflow | Component/unit model + native gesture | `npm run test:components -- --runInBand` | Extend `src/ui/__tests__/OwnedPlanEditor.test.tsx` ✅; native flow ❌ Wave 0 |
| UX-05 | Private draft, bounds, adjacent dates, cancel/back unchanged, Apply commits exact `LocalDate`, swipe/button parity/focus | Component + native gesture/accessibility | `npm run test:components -- --runInBand` | Extend `src/ui/components/CalendarField.test.tsx` ✅; native flow ❌ Wave 0 |
| UX-06 | Pull preserves Library snapshot/query/filter/section; permanent action absent; failure-only retry | Component + native pull | `npm run test:components -- --runInBand` | Extend `src/ui/__tests__/LibraryScreen.test.tsx` and foundation tests ✅; native flow ❌ Wave 0 |
| UX-07 | Filled/outlined star, selected semantics, exact-item busy state, no color-only meaning | Component + native Light/Dark | `npm run test:components -- --runInBand` | Extend `src/ui/__tests__/LibraryScreen.test.tsx` ✅ |
| UX-08 | Browse rows omit provenance; detail retains full provenance | Component/route | `npm run test:components -- --runInBand` | Extend `src/ui/__tests__/LibraryScreen.test.tsx` and detail test ✅ |
| UX-09 | Full root labels/targets/focus at 200%; distinct Today settings/history-data routes; dialog no clipping | Component + native 200% | `npm run test:components -- --runInBand` | Extend `src/ui/__tests__/foundation.test.tsx`, Today/route tests ✅; native flow ❌ Wave 0 |
| UX-10 | Exact-candidate reproduction, branch fixture, safe freshness states, recoverable Retry reaches factual result | SQLite host + component/route + native exact candidate | `npm run test:sqlite:host -- --runInBand && npm run test:components -- --runInBand` | Extend `tests/sqlite-host/progressRepository.test.ts` and `src/ui/__tests__/ProgressScreen.test.tsx` ✅; Phase 6 candidate flow ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** run the relevant focused Jest project(s), then `npm run typecheck` for changed TypeScript.
- **Per wave merge:** `npm run test:all -- --runInBand`, `npm run lint`, and `npm run check:boundaries`. [VERIFIED: package.json:19-27] [VERIFIED: package.json:60-61]
- **Phase gate:** Full suite green plus Phase 6 exact-candidate native evidence in compact/medium/expanded, System/Light/Dark, 200% text, keyboard/D-pad, emulator gestures, and Samsung attended touch/OLED evidence. D-82 explicitly excludes owner approval, promotion, tags, and Terminal Seal. [VERIFIED: .planning/phases/06-material-3-ux-remediation/06-CONTEXT.md:46-51]

### Wave 0 Gaps

- [ ] `src/ui/components/M3SearchField.test.tsx` (or colocated test matching the selected shared primitive path) — establishes shared anatomy/clear/busy/focus semantics for UX-02.
- [ ] Shared filter-chip component test — establishes selected icon/shape/accessibility state and standalone Favorite UX-01/UX-07.
- [ ] Extend `AdaptiveScreen` contract tests — proves a single optional controlled `RefreshControl` is passed to the owning scroll surface for UX-06.
- [ ] `maestro/phase6/` and `scripts/run-phase6-maestro.mjs` — candidate identity, Progress reproduction/recovery, month/date/reorder gestures, 200% navigation, and font-scale reset. Derive its validation model from the existing Phase 5 runner. [VERIFIED: scripts/run-phase5-maestro.mjs:20-48] [VERIFIED: scripts/run-phase5-maestro.mjs:189-225]
- [ ] Exact-candidate Progress diagnostic fixture in `tests/sqlite-host/progressRepository.test.ts` — cannot be authored until the captured branch/error is known.
- [ ] Phase 6 runner resolves `/opt/homebrew/share/android-commandlinetools/platform-tools/adb` when `adb` is absent from PATH, and fails closed if neither is executable.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | No | This offline local UX remediation introduces no account/authentication surface. [VERIFIED: .planning/phases/06-material-3-ux-remediation/06-CONTEXT.md:67-69] |
| V3 Session Management | No | Workout sessions are local domain records, not authenticated web sessions; do not broaden scope into account/session management. [ASSUMED] |
| V4 Access Control | No | No new multi-user or privileged resource boundary is in scope. [VERIFIED: .planning/phases/06-material-3-ux-remediation/06-CONTEXT.md:67-69] |
| V5 Input Validation | Yes | Retain `LocalDate` bounds/parsing, typed screen props, and repository parameterized query boundary. Do not send raw diagnostic data to UI/logs. [VERIFIED: src/ui/components/CalendarField.tsx:125-181] [VERIFIED: src/platform/sqlite/repositories/progressRepository.ts:287-400] |
| V6 Cryptography | No new control | Preserve existing backup/recovery and release integrity behavior; Phase 6 does not introduce cryptography. [VERIFIED: .planning/phases/06-material-3-ux-remediation/06-UI-SPEC.md:1-29] |

### Known Threat Patterns for this Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Raw local health/Progress data in diagnostic logs | Information disclosure | Diagnostic seam may emit only branch identifier and SQLite error class/code; redact IDs, rows, JSON, database paths, backup content, and device serial. [ASSUMED] |
| UI bypasses source authority to appear healthy | Tampering | Keep screens on typed runtime operations; no SQL, fabricated metrics, or stale-projection-as-current shortcut. [VERIFIED: .trae/rules/rules.md:12-17] |
| Gesture reordering silently persists source changes | Tampering | Keep reorder in the same in-memory draft; `Save Plan Changes` remains the sole persistence command. [VERIFIED: .planning/phases/06-material-3-ux-remediation/06-UI-SPEC.md:1-29] |
| Unbounded search/date input reaches a storage query | Tampering / denial of service | Preserve existing typed query contracts, input handling, LocalDate parser/bounds, and focused test cases; do not concatenate user text into SQL. [VERIFIED: src/ui/components/CalendarField.tsx:125-181] [ASSUMED] |

## Sources

### Primary (HIGH confidence)

- Repository source: `src/ui/layout/AdaptiveScreen.tsx`, `src/ui/components/index.ts`, `src/ui/components/CalendarField.tsx`, `src/ui/components/PlanEditorFields.tsx`, `src/ui/screens/LibraryScreen.tsx`, `src/ui/screens/CalendarScreen.tsx`, `src/ui/screens/ProgressScreen.tsx` — current presentation/runtime seams.
- Repository source: `src/bootstrap/workoutAppRuntime.tsx`, `src/bootstrap/workoutLifecycle.ts`, `src/platform/sqlite/repositories/progressRepository.ts`, `src/platform/sqlite/effects/historyProjectionEffects.ts`, and migrations `0010`, `0014`, `0015` — Progress/source/projection/rebuild boundaries.
- Exact candidate evidence: `.planning/phases/05-recovery-distribution-and-release/05-UI-REVIEW.md` and `.planning/ui-reviews/material3-runtime-20260831/EVIDENCE.md` — reproducible symptom and audit limits.

### Secondary (MEDIUM confidence)

- [React Native RefreshControl 0.86](https://reactnative.dev/docs/0.86/refreshcontrol) — ScrollView-owned controlled refresh semantics.
- [React Native Accessibility 0.86](https://reactnative.dev/docs/0.86/accessibility) — adjustable role plus increment/decrement actions.
- [Expo SDK 57 Gesture Handler](https://docs.expo.dev/versions/v57.0.0/sdk/gesture-handler/) — Expo-compatible installed gesture library.
- [Expo Reanimated](https://docs.expo.dev/versions/unversioned/sdk/reanimated/) — Reanimated scope and Babel preset configuration statement.
- `gsd-tools query research-plan` cache entries `f0731c9…`, `708ce5e…`, `cd4a15b…`, `6222ba…`, `81d5f0…` — documentation digests stored with seam-provided `MEDIUM` confidence.

### Tertiary (LOW confidence)

- None used as authority. The four explicit assumptions above are deliberately gated behind runtime/schema evidence or native configuration validation.

## Metadata

**Confidence breakdown:**

- Standard stack: MEDIUM — package versions and current source seams are inspected; official documentation was available but classified MEDIUM by the research confidence seam, and native configuration still needs verification.
- Architecture: HIGH — constrained by inspected repository code, locked context, approved UI contract, and project rules.
- Pitfalls: HIGH for current code/audit facts; MEDIUM for native behavior; LOW only where the exact Progress root cause is intentionally not claimed.

**Research date:** 2026-08-31  
**Valid until:** 2026-09-07 for Expo/React Native documentation and candidate/runtime evidence; re-run exact-candidate diagnosis if bytes or native stack change.

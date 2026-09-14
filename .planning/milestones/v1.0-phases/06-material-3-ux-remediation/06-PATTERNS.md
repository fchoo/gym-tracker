# Phase 6: Material 3 UX Remediation - Pattern Map

**Mapped:** 2026-08-31  
**Files analyzed:** 29 planned or conditionally affected files  
**Analogs found:** 25 / 29 (the four new shared/native artifacts have no direct analog)

This map uses 06-CONTEXT.md, 06-RESEARCH.md, and the approved 06-UI-SPEC.md. Files marked inferred are names suggested by the upstream artifacts; a colocated equivalent is acceptable if it preserves the same seam and tests.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| src/ui/components/M3SearchField.tsx (inferred) | component | request-response/presentation | src/ui/screens/LibraryScreen.tsx:382-435; ProgressScreen.tsx:528-557 | role-match; no shared analog |
| src/ui/components/M3SearchField.test.tsx (inferred) | test | request-response/presentation | src/ui/__tests__/LibraryScreen.test.tsx:818-861 | role-match; new primitive contract |
| src/ui/components/M3FilterChip.tsx (inferred) | component | request-response/presentation | src/ui/components/index.ts:333-376, 393-460 | role-match; no chip analog |
| src/ui/components/M3FilterChip.test.tsx (inferred) | test | request-response/presentation | src/ui/__tests__/foundation.test.tsx:214-261 | role-match; new primitive contract |
| src/ui/components/index.ts | shared component barrel | request-response/presentation | index.ts:198-247, 393-460, 1027-1144 | exact shared seam |
| src/ui/screens/LibraryScreen.tsx | screen/controller | request-response + CRUD preference writes | LibraryScreen.tsx:1446-1522 | exact state flow |
| src/ui/__tests__/LibraryScreen.test.tsx | test | request-response | same file:490-574, 781-861, 983-1049 | exact |
| src/ui/layout/AdaptiveScreen.tsx | layout/container | request-response + scroll I/O | AdaptiveScreen.tsx:43-215 | exact |
| src/ui/screens/CalendarScreen.tsx | screen/controller | request-response + civil-date transform | CalendarScreen.tsx:276-386 | exact state flow |
| src/ui/__tests__/CalendarScreen.test.tsx | test | request-response | CalendarScreen.test.tsx:87-158 | exact |
| src/ui/components/CalendarField.tsx | component/form field | request-response + civil-date transform | CalendarField.tsx:199-594 | exact |
| src/ui/components/CalendarField.test.tsx | test | request-response | CalendarField.test.tsx:58-140, 347-380 | exact |
| src/ui/components/PlanEditorFields.tsx | component/controller | draft transform + gesture input | PlanEditorFields.tsx:116-224 | exact; replace release-threshold gesture |
| src/ui/screens/OwnedPlanEditorScreen.tsx | screen/controller | draft transform + explicit CRUD commit | OwnedPlanEditorScreen.tsx:850-880, 1124-1202 | exact |
| src/ui/__tests__/OwnedPlanEditor.test.tsx | test | draft transform + CRUD commit | OwnedPlanEditor.test.tsx:551-602, 744-779 | exact |
| src/ui/screens/ProgressScreen.tsx | screen/controller | source-backed request-response | ProgressScreen.tsx:594-735 | exact |
| src/ui/__tests__/ProgressScreen.test.tsx | test | request-response | ProgressScreen.test.tsx:226-316 | exact |
| src/platform/sqlite/repositories/progressRepository.ts (conditional) | repository/service | SQLite CRUD/read + transform | progressRepository.ts:283-438 | exact; only after diagnosis |
| tests/sqlite-host/progressRepository.test.ts | host integration test | SQLite I/O + projection transform | same file:107-132, 170-307 | exact |
| src/bootstrap/workoutAppRuntime.tsx (conditional) | runtime adapter | request-response delegation | workoutAppRuntime.tsx:2545-2575 | role-match; only if diagnosis crosses adapter |
| src/bootstrap/workoutLifecycle.ts (conditional) | lifecycle/service | event-driven + batch effect drain | workoutLifecycle.ts:131-160 | role-match; only if failure crosses queue |
| src/platform/sqlite/effects/historyProjectionEffects.ts (conditional) | effect service | event-driven/batch/retry | historyProjectionEffects.ts:71-176, 220-321 | exact effect/retry seam |
| src/ui/screens/TodayScreen.tsx | screen/controller | request-response + navigation | TodayScreen.tsx:430-705 | exact |
| app/(tabs)/index.tsx | route/controller | request-response + navigation | index.tsx:129-155 | exact route adapter |
| app/(tabs)/_layout.tsx | route/layout config | navigation + adaptive presentation | _layout.tsx:14-45 | exact |
| src/ui/__tests__/TodayScreen.test.tsx | test | request-response/navigation | TodayScreen.test.tsx:140-225, 542-590 | exact |
| src/ui/__tests__/foundation.test.tsx | shared-shell test | request-response/presentation | foundation.test.tsx:572-609, 691-740, 1076-1110 | exact |
| app/(tabs)/__tests__/_layout.test.tsx | route/layout test | navigation + adaptive presentation | _layout.test.tsx:97-228 | exact |
| maestro/phase6/*.yaml (inferred) | native test/evidence flow | gesture + navigation + device I/O | maestro/phase5/adaptive-accessibility.yaml:1-21 | role-match; no Phase 6 analog |
| scripts/run-phase6-maestro.mjs (inferred) | test runner/evidence utility | device I/O + batch evidence | run-phase5-maestro.mjs:20-48, 172-225 | exact runner structure |

## Pattern Assignments

### Shared Search and filter primitives

#### M3SearchField

**Analogs:** LibraryScreen.tsx:382-435 and ProgressScreen.tsx:528-557.

Move the existing controlled input composition into the repository-owned components seam. Keep the screen-owned query and busy value, but centralize the leading Search icon, editable text, integrated clear action, IME behavior, and state slots.

Current search pattern to copy:

~~~tsx
<TextInput
  accessibilityLabel={label}
  accessibilityState={{ busy }}
  autoCapitalize="none"
  onChangeText={onChange}
  placeholder={label}
  placeholderTextColor={colors.textSecondary}
  returnKeyType="search"
  value={value}
/>
<IconAction
  accessibilityLabel={clearLabel}
  disabled={value.length === 0}
  icon="clear"
  onPress={() => onChange("")}
/>
~~~

Use imports from the shared barrel/theme conventions: Lucide Search and X, FocusablePressable or IconAction, sizes, space, typeScale, and useAppTheme. The primitive owns no query filtering or runtime call. It must preserve input focus and keyboard after clear, expose busy only while the owner searches/loads, and accept exact labels Search plans, Search exercises, and Search plan exercises. Do not add suggestions, remote search, or debounce copy.

**Test analog:** LibraryScreen.test.tsx:818-845 changes text, presses clear, and asserts the exact labelled input is empty. Add primitive tests for leading icon, integrated clear only when query exists, busy state, IME/search activation, empty/error/result slots, and focus retention. Consumer tests should verify typed adapters in all four consumers.

#### M3FilterChip

**Closest analog:** shared action and selected icon-button states in components/index.ts:333-376 and 393-460.

Copy the shared state/accessibility approach rather than screen-local button styling:

~~~tsx
<FocusablePressable
  accessibilityLabel={accessibilityLabel}
  accessibilityRole="button"
  accessibilityState={{ busy, disabled: isDisabled, selected }}
  disabled={isDisabled}
  focusable={!isDisabled}
  onPress={onPress}
  style={...}
>
  {icon}
  {label}
</FocusablePressable>
~~~

Add visible selected shape/outline/check companion, 48dp target, focus ring, and Enter/Space activation. Favorite selected uses a filled approved-green Star; inactive uses outlined Star and Not favorite semantics. Selection must remain understandable in System, Light, and Dark without color alone. The primitive must not write filters or query storage.

There is no direct chip analog. Export both primitives through components/index.ts, reusing its existing Lucide import block and theme tokens. Avoid introducing a second icon-button or TextInput styling path.

### LibraryScreen and LibraryScreen.test.tsx

**Analog:** LibraryScreen.tsx:1446-1522 for source-preserving mutations.

Favorite commit pattern:

~~~tsx
if (favoriteBusyIds.has(item.exerciseId)) return;
setFavoriteBusyIds(current => new Set([...current, item.exerciseId]));
void setExerciseFavorite(item.exerciseId, !item.favorite).then(result => {
  if (!mountedRef.current) return;
  // Apply only the returned committed exerciseId/favorite result.
  setExerciseBrowse(current => ({ ...current, items: current.items.map(apply) }));
}).finally(() => {
  if (mountedRef.current) setFavoriteBusyIds(current => removeExactId(current, item.exerciseId));
});
~~~

Preserve exact-item busy state and source-commit acknowledgment while changing the trailing star. Browse rows retain primary name, alias, taxonomy, and availability context, but remove source namespace, revision, license, and attribution from both visible and spoken browse-row composition. Exercise Detail remains the provenance surface; use CustomExerciseScreens.test.tsx:546-558 as the retained-detail analog.

Refresh pattern at LibraryScreen.tsx:1492-1522 is the source of truth. It guards snapshot/in-flight state, sets controlled refreshing, merges only the newer section preference, leaves query/filter/selection/results intact, marks refreshFailed on rejection, and clears busy in finally. Attach it to the one AdaptiveScreen scroll host using RefreshControl. Remove permanent Refresh Library; show Retry Library refresh only when refreshFailed.

The current replacement boundary is LibraryScreen.tsx:1672-1725: Filter action, No filters selected copy, permanent refresh, and selected-filter SecondaryActions. Preserve filterChips/removeFilterChip semantics at lines 219-305 and existing OR-within-category/AND-across-category taxonomy sheet behavior. Render selected values as M3 chips and make Favorite a standalone one-tap chip.

Test patterns:

- Browse/state/provenance: LibraryScreen.test.tsx:490-574; invert the browse attribution assertion while retaining detail attribution coverage.
- Favorite deferred commit: LibraryScreen.test.tsx:781-816.
- Keyboard, clear, filter-sheet focus restore: LibraryScreen.test.tsx:818-861.
- Refresh pending/failure/retry preservation: LibraryScreen.test.tsx:983-1049; adapt the old button trigger to the RefreshControl owner contract but retain query, selected plan, failure copy, and retry assertions.

### AdaptiveScreen

**Analog:** AdaptiveScreen.tsx:43-215. It owns safe area, width classes, the only ScrollView, scroll restoration, two-pane layout, and dock clearance.

Add one narrow controlled refresh prop and pass it to the ScrollView at lines 163-177. Preserve keyboardShouldPersistTaps, scrollEventThrottle, scroll restoration, dock padding, and no nested Library scroll surface. React Native RefreshControl is controlled: refreshing must be true from request start through completion.

**Test analog:** foundation.test.tsx:347-430 covers width/insets/scroll/dock. Extend it to assert the single testID scroll host receives RefreshControl with correct refreshing state and no nested scroll host.

### Root Calendar and CalendarScreen.test.tsx

**Analog:** CalendarScreen.tsx:276-386.

Keep the LocalDate state flow in CalendarScreen.tsx:309-322: selectDate updates selected date and visible month; changeMonth clamps the selected day to the target month and calls loadCalendarMonth with string values. Keep existing loading/error copy and retry behavior at lines 324-355.

Replace CalendarGrid lines 148-217, where blank leading cells are currently generated at 167-169 and current-month dates at 170-205. Generate exactly 42 civil-date cells with adjacent dates, using parseLocalDate/addLocalDays and not JavaScript Date. Adjacent dates remain selectable and use subdued secondary styling; state glyphs/text and spoken labels remain non-color cues. Keep labelled previous/next IconAction alternatives and add a narrowly scoped horizontal gesture with left=next month and right=previous month; reduced motion uses theme motion settings.

**Test analog:** CalendarScreen.test.tsx:87-158 asserts exact labels, typed load inputs, month navigation, and retry. Extend with 42 cells, adjacent selection moving month, button/swipe equivalence, and state semantics. Retain Light/Dark surface assertions at lines 160-183.

### CalendarField and CalendarField.test.tsx

**Analog:** CalendarField.tsx:199-594 is the authoritative civil-date selector. Its comment at lines 199-202 is a hard constraint: never parse date-only values through JavaScript Date.

Preserve private draft and focus behavior at lines 240-293: draft starts from selectedValue; opening focuses dialog; cancel only closes; confirm calls onChange only when draft is withinBounds. Rename actions to Keep Original Date and Apply Date and add the required heading/date hierarchy.

Preserve date safety helpers at lines 76-181 and grid/bounds patterns at 295-306 and 518-565: compareLocalDates, withinBounds, toLocalDate, addLocalDays, disabled out-of-bounds cells, and exact LocalDate strings. Replace blank/variable current-month grid with complete six-row adjacent-month grid. Valid adjacent selection changes draft/display month; invalid cells stay visible and disabled.

Preserve Modal focus restoration at 246-258 and 394-430, vertical scroll for short height/200% text, keyboardShouldPersistTaps, reduced-motion animation, and 48dp targets. Do not retain horizontal grid scrolling as a required path.

Test analogs:

- Private draft and explicit commit/cancel: CalendarField.test.tsx:63-92.
- Empty/default and min/max disabled semantics: lines 94-140.
- Short landscape/200% scroll and 48dp controls: lines 347-380.

Add exact copy, Back/dismiss no-write, adjacent cells, button/swipe parity, arrow-key movement, focus restore, and bounded leap-day/LocalDate commit tests.

### Reorder component, editor screen, and tests

**Analogs:** PlanEditorFields.tsx:116-224 and OwnedPlanEditorScreen.tsx:850-880, 1124-1202.

Preserve canMoveUp/canMoveDown and the adjustable handle accessibility actions at PlanEditorFields.tsx:139-220. Both buttons and accessibility increment/decrement must continue invoking onMoveUp/onMoveDown. Replace only PanResponder release-threshold handling at 141-153 with installed Gesture Handler/Reanimated long-press continuous displacement. Keep the handle minHeight/minWidth 48 at 237-250, visible movement feedback, reduced-motion behavior, and normal-scale single-row layout.

The draft operation at OwnedPlanEditorScreen.tsx:850-880 bounds-checks, moves and renumbers items, updates draft, clears impact state, and emits factual moved feedback. Gesture drop must use that same operation and never call savePlan. Both day and exercise compositions use the same shared row at 1124-1202. Save Plan Changes remains the sole persistence action.

**Tests:** OwnedPlanEditor.test.tsx:551-602 proves move is draft-only and save persists ordinals; 744-779 proves adaptive widths, long labels, and 48dp handle. Extend component/unit tests for held-item displacement before release, drop-only draft mutation, accessibility/button equivalence, keyboard/D-pad, and reduced motion. Native evidence is required for actual continuous movement.

### Progress UI and conditional storage lane

**ProgressScreen analog:** ProgressScreen.tsx:594-735. Keep loadProgress({ period, nowLocalDate }), bounded failure copy, retry request-generation behavior, and safe updating/unavailable states at 650-700. Replace only the screen-local Search input at 528-557 with M3SearchField and preserve local query filtering and source-backed empty/result states.

**Tests:** ProgressScreen.test.tsx:226-285 covers updating/unavailable and generic retry; 287-316 covers factual no-history. Add first-rejection/second-current retry recovery and shared search state tests.

**Diagnostic gate:** Do not change storage/runtime files based only on generic Progress error. First reproduce exact candidate, capture redacted branch plus SQLite error class/code, then encode the observed state in the host fixture.

**Repository:** progressRepository.ts:283-345 reads subject revisions, returns typed unavailable/updating before data reads, then runs six reads at 338-400. Preserve parameterized SQL, source authority, projectProgressPeriod inputs, and safe freshness outcomes. Runtime delegation is the research-verified loadProgress path at workoutAppRuntime.tsx:2564-2567; touch it only if diagnosis proves adapter/init cause.

**Projection effect:** historyProjectionEffects.ts:119-176 handles expired-claim recovery/retry/permanent failure and 220-321 drains with bounded retry. If diagnosis crosses this queue, preserve replay/rebuild semantics and extend lifecycle/effect tests; do not bypass projections.

**Host test:** progressRepository.test.ts:107-132 creates isolated temp reader/writer DBs, configures SQLite, runs migrations, tracks kernels/directories, and cleans up in afterEach. Seed source/projection facts with parameterized transaction.execute calls as in 170-307. Add the exact redacted failing branch fixture and recovery assertion; do not log raw rows, IDs, JSON, paths, or backup content.

### Today, root navigation, and route tests

TodayScreen.tsx:557-585 and app/(tabs)/index.tsx:129-155 are the direct analogs. Keep the header IconAction labelled Appearance and rest-alert settings, trusted gating, and focus restoration. Replace only the full-width generic More with compact History and data route semantics while preserving existing /more destinations.

Today tests at TodayScreen.test.tsx:140-225 cover settings modal/read/write; 542-590 cover safe retry and width contracts. Add distinct control names/purposes and route assertions. app/(tabs)/__tests__/index.test.tsx is the route adapter analog for trusted/loading/read-failure behavior.

AppTabs at components/index.ts:1027-1144 is the shell analog: fixed destination order, tabPress emission, disabled/missing/prevented guards, visible labels, roles, selected state, keyboard activation, and rail. app/(tabs)/_layout.tsx:14-45 selects bottom versus rail from classifyWidth. Preserve Today, Calendar, Library, Progress order and add a two-row compact layout when usable width/font scale cannot fit full labels; never use icon-only or clipped labels.

Shell tests: foundation.test.tsx:572-609, 691-740, 1076-1110 and app/(tabs)/__tests__/_layout.test.tsx:97-228. Extend with 200% font scale/two-row full-label and 48dp target assertions, plus resize/focus/D-pad behavior.

### Native runner and flows

Derive scripts/run-phase6-maestro.mjs from scripts/run-phase5-maestro.mjs:20-48 (flow contracts) and 172-225 (candidate identity, install, JUnit reports, hashes, font-scale finally reset, evidence ledger). Derive YAML style from maestro/phase5/adaptive-accessibility.yaml:1-21 and data-recovery.yaml. The Phase 6 runner must resolve the pinned adb fallback when PATH lacks adb, fail closed if unavailable, and remain automated evidence only. It must cover Progress recovery, Library Search/filter/favorite/refresh, Calendar/date, reorder, 200% navigation, keyboard/D-pad, and font-scale reset.

## Shared Patterns

### Accessibility and focus

Sources: components/index.ts:83-101, 198-247, 288-376, 393-460; CalendarField.tsx:246-258; index.ts:828-839. Use FocusablePressable, explicit label/role/state, Enter/Space handling, 48dp targets, 2dp focus ring, and trigger focus restoration. Every gesture has a labelled button/action alternative. No required state is color-only.

### Theme, motion, and adaptation

Source: src/ui/theme/index.ts:33-59, 114-182, 243-307. Reuse space, sizes.minimumTarget, sizes.focusRing, typeScale, light/dark tokens, and useAppTheme().motion. Reduced motion disables positional animation while retaining direct acknowledgment. Preserve compact below 600dp, medium 600-839dp, expanded 840dp or above.

### Draft versus committed state

Sources: LibraryScreen.tsx:1446-1489; OwnedPlanEditorScreen.tsx:850-880; CalendarField.tsx:272-281. Favorite updates after returned commit, reorder stays in-memory until Save, and date onChange occurs only on Apply. Refresh replaces snapshot without clearing query/filter/section/selection.

### Safe errors and retry

Sources: CalendarScreen.tsx:324-355; ProgressScreen.tsx:650-700; LibraryScreen.tsx:1704-1715; components/index.ts:762-793. Use factual copy, preserve source facts, show Retry only in recoverable error state, and retry through the same typed operation.

### LocalDate safety

Sources: CalendarField.tsx:76-163, 199-203; CalendarScreen.tsx:73-104, 309-322; src/domains/scheduling/localDate.test.ts:21-44. Use LocalDate strings and domain arithmetic; never JavaScript Date for date-only values. Preserve bounds, leap days, selected-day clamping, and timezone ownership.

### Test/evidence conventions

Use React Native Testing Library role/label/state assertions, fireEvent press/changeText/keyDown, deferred promises and waitFor for pending/retry, theme-provider wrappers, isolated host SQLite cleanup, and focused Jest projects. Native gesture/200% claims require Maestro evidence; component tests alone cannot prove ergonomics or continuous displacement.

## Shared-File Conflicts and Wave Ownership

| Shared file/surface | Conflicting concerns | Recommended ownership |
|---|---|---|
| src/ui/components/index.ts | Search/chip exports, favorite/icon styling, AppTabs | One shared-primitives/shell owner; serialize Library and navigation |
| src/ui/layout/AdaptiveScreen.tsx | RefreshControl and adaptive/dock behavior | Wave 0 foundation owner; Library consumes after contract |
| CalendarField.tsx | Date dialog, focus, bounds, 42 cells, swipe | One date-dialog owner; coordinate helper extraction with CalendarScreen |
| PlanEditorFields.tsx | Gesture implementation and accessibility fallback | One reorder-primitive owner; editor only wires callbacks |
| LibraryScreen.tsx + test | Chips, Search, favorite, provenance, refresh | Single Library owner |
| CalendarScreen.tsx + test | Grid, adjacent selection, month swipe/buttons | Single Calendar owner |
| ProgressScreen.tsx + test | Search adapter and error/retry | Progress UI owner after storage fixture |
| progressRepository.ts + runtime/lifecycle/effects + host test | Root-cause diagnosis and source/projection safety | Serialized storage lane; no UI-only fix first |
| foundation.test.tsx + tabs layout test | Existing shell and 200% navigation | One shell-test owner |
| TodayScreen.tsx + tabs/index.tsx + Today/route tests | Duplicate More and route wording | One Today navigation owner |
| maestro/phase6 + runner | Candidate identity, device state, font scale | Isolated evidence lane after integration |

Suggested waves: Wave 0 shared Search/chip/AdaptiveScreen contracts and gesture configuration smoke check; Library; Calendar/CalendarField; reorder/editor; Progress diagnostic/storage then UI; shell/Today; native Phase 6 evidence. Compatible work may be combined, but each shared file should have one owner per wave.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| src/ui/components/M3SearchField.tsx | component | request-response/presentation | No repository-owned shared Search primitive; current inputs are duplicated. |
| src/ui/components/M3FilterChip.tsx | component | request-response/presentation | No chip implementation; selected actions are only partial analogs. |
| src/ui/components/M3SearchField.test.tsx | test | request-response/presentation | Explicit Wave 0 gap in research. |
| src/ui/components/M3FilterChip.test.tsx | test | request-response/presentation | New shared-chip contract. |
| maestro/phase6/*.yaml | native test | gesture/device I/O | No Phase 6 Calendar/reorder/refresh/Search flow exists. |
| scripts/run-phase6-maestro.mjs | test runner | device I/O/evidence batch | Phase 5 runner is structural analog, but Phase 6 ledger/ADB fallback are new. |

## Metadata

**Analog search scope:** src/ui/components, src/ui/layout, src/ui/screens, src/ui/__tests__, src/bootstrap, src/platform/sqlite, tests/sqlite-host, app/(tabs), app/more, scripts, and maestro/phase5.  
**Files scanned:** 29 planned/conditional files plus direct analogs and tests.  
**Primary analogs:** components/index.ts, AdaptiveScreen.tsx, CalendarField.tsx, PlanEditorFields.tsx, LibraryScreen.tsx, CalendarScreen.tsx, ProgressScreen.tsx, TodayScreen.tsx, progressRepository.ts, progressRepository.test.ts, and run-phase5-maestro.mjs.  
**Pattern extraction date:** 2026-08-31

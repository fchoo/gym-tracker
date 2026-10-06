# Phase 14: Prototype Visual Shell - Research

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

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

### Deferred Ideas (OUT OF SCOPE)
- Feature content and Calendar-specific DEV-01 geometry remain in their owning phases.
</user_constraints>

Verbatim constraint source: [VERIFIED: .planning/phases/14-prototype-visual-shell/14-CONTEXT.md:16-35,70-74].

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|---|---|---|
| SHL-01 | Expose exactly Workout, Calendar, Library and Progress in a shared root shell, preserving bottom navigation composition at all target widths. | Refactor the existing Expo Router tab layout and AppTabs; remove both rail and two-row branches while retaining the route keys. |
| SHL-02 | Switch destinations in place with correct selected state, heading focus, deep-route exit and retained destination-specific state. | Keep the mounted tab navigator and existing screen-local state; add a root-heading focus registry and route-origin restoration tests. |
| SHL-03 | Open App Settings from the root header and synchronize Light, Dark and System appearance across roots, active workout and Garmin; persist the choice and react to system changes. | Reuse AppearanceProvider and the SQLite key, extract one settings-content owner, and surface it as a root sheet plus the existing direct route. |
| SHL-04 | Reproduce approved semantic colors, Archivo variable typography, IBM Plex Mono numerical text, spacing, borders and density using bundled native assets and shared tokens. | Replace the current Source Sans/material-neutral token set; vendor Archivo and its OFL notice; run an SDK-57 Android font-axis proof before claiming condensed-display fidelity. |
| SHL-05 | Use contextual bottom sheets with scrim, close/back dismissal, focus entry/trap/restoration and keyboard-safe content, preserving each surface's individual actions. | Add one shared bottom-sheet frame and migrate existing modal shells without moving their business state machines. |
| SHL-06 | Place theme-aware semantic toasts below top bars, clear of the command/rest dock; preserve accessible status announcements. | Add one shell-level toast host with measured safe-area/header/dock avoidance; keep actionable failures inline. |
| SHL-07 | Preserve loading, trusted, failure/retry and notification-permission/continue-without-alerts startup states in the new visual shell. | Extend the current font gate and runtime launch coordinator so font/preference failures fail visibly and SQLite trust remains the enablement boundary. |
| SHL-08 | Keep Rest sound, Rest vibration and notification settings reachable under device settings, outside plan timing. | Reuse the current runtime/store and settings controls; change only their shared presentation. |
| SHL-09 | Keep Removed sessions and Data and recovery reachable from Settings even though the prototype's App Settings only demonstrates appearance. | Extract and reuse the current Settings content rather than replacing it with an appearance-only prototype sheet. |
| SHL-10 | Preserve loading, empty, error/retry, restore confirmation, busy/failure and successful restoration of removed history. | Keep RemovedSessionsScreen and its repository callback; correct the shell copy/focus/toast details around the committed reload. |
| SHL-11 | Preserve automatic-backup status/recovery and CSV export, preparing/sharing/cancel/error/retry states with accessible navigation into backup settings. | Treat the current Data and recovery route/controller tests as regression contracts. |
| SHL-12 | Preserve Google connection/disconnection confirmation, network preference, stale-writer takeover, partial deletion recovery, new-backup confirmation and privacy route. | Keep the existing automatic-backup facade and privacy route; migrate confirmation presentation without changing commands. |
| SHL-13 | Preserve encrypted export plus restore/merge preflight, exact confirmation, cancel, progress, failure/retry and rebuild-pending recovery flows. | Reuse the existing controller state machines and exact "REPLACE"/"MERGE" domain gates; do not reimplement portability. |
</phase_requirements>

Requirement text source: [VERIFIED: .planning/REQUIREMENTS.md:35-49]. Phase ownership and the five phase success criteria are fixed in the roadmap. [VERIFIED: .planning/ROADMAP.md:98-116]

**Researched:** 2026-10-06  
**Domain:** Expo/React Native visual-system migration, file-based navigation shell, accessible overlays, trusted startup, and preservation of local recovery routes  
**Confidence:** HIGH overall; MEDIUM for exact Archivo variable-width rendering on the pinned native stack

## Summary

Phase 14 should be planned as a controlled replacement of the shared v1.1 presentation layer, not as new feature-screen work. The live app already has the correct four route keys, a custom Expo Router tab bar, a single appearance provider, adaptive safe-area/scroll layout, typed launch states, shared action/empty/notice primitives, and the complete shipped Settings/recovery routes. It also has the behavior-heavy tests that must survive the visual change. [VERIFIED: app/(tabs)/_layout.tsx:17-50] [VERIFIED: src/ui/theme/index.ts:184-307] [VERIFIED: src/ui/layout/AdaptiveScreen.tsx:20-257] [VERIFIED: .planning/design/v1.2-prototype-parity-matrix.md:55-71]

The current shell is nevertheless materially different from the approved target: the visible root label is "Today"; expanded width selects "left"/rail; large text can select "two-row"; the type system uses "SourceSans3_400Regular", "SourceSans3_600SemiBold", "IBMPlexMono_400Regular", and "IBMPlexMono_600SemiBold"; the focus ring is "2"; modal frames use a "90%" cap and 48% scrim; and there is no shared semantic toast component. [VERIFIED: app/(tabs)/_layout.tsx:17-49] [VERIFIED: src/ui/components/index.ts:1046-1187,1418-1480] [VERIFIED: src/ui/theme/index.ts:15-31,49-59] [VERIFIED: repository search for SemanticToast/Toast on 2026-10-06]

The safest plan is four implementation waves: (1) prove/package typography and replace the shared tokens, (2) refactor the root shell/navigation/header/state-focus contract, (3) introduce one overlay/toast vocabulary and migrate existing shells without changing business controllers, and (4) reskin and regression-test Settings/startup/recovery with native evidence. The phase must not edit domain migrations, repository semantics, backup formats, or transaction ordering. [VERIFIED: .planning/phases/14-prototype-visual-shell/14-UI-SPEC.md:20-52,71-77,206-240]

The only newly discovered blocker is typography fidelity: official SDK 57 guidance says variable fonts are not supported across all platforms and recommends static instances for full support, while current Expo guidance dates Android/iOS variable-font support to SDK 58 and says useFonts reads only the weight axis. The pinned React Native 0.86 style type exposes fontWeight but not fontStretch. Therefore, a committed Android font-rendering proof must precede broad token migration; failure requires an owner-reviewed deviation or a separately approved stack change, never horizontal text transforms. [CITED: https://github.com/expo/expo/blob/sdk-57/docs/pages/develop/user-interface/fonts.mdx#variable-fonts] [CITED: https://docs.expo.dev/develop/user-interface/fonts/#variable-fonts] [VERIFIED: React Native 0.86 StyleSheetTypes.js inspection] [VERIFIED: .planning/phases/14-prototype-visual-shell/14-UI-SPEC.md:129-147]

**Primary recommendation:** Extend the existing Router/theme/runtime architecture in place, but make the font-axis proof the first executable gate and make shared shell primitives—not individual screens—the only owners of root navigation, App Settings presentation, modal geometry/focus, and transient toasts.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|---|---|---|---|
| Four-root navigation and retained root state | Browser / Client (native client) | — | Expo Router and the custom tab bar already own the root route state. [VERIFIED: app/(tabs)/_layout.tsx:17-50] |
| Semantic tokens, fonts, System/Light/Dark resolution | Browser / Client (native client) | Native build assets | The theme context resolves appearance at runtime; font bytes must be packaged into the app artifact. [VERIFIED: src/ui/theme/index.ts:15-31,211-297] [CITED: https://docs.expo.dev/develop/user-interface/fonts/#use-a-local-font-file] |
| Shared headers, sheets, dialogs, focus and toasts | Browser / Client (native client) | OS accessibility/IME | React Native views own layout; Android Back, focus, accessibility announcements and the keyboard are platform-mediated. [CITED: https://reactnative.dev/docs/0.86/modal] [CITED: https://reactnative.dev/docs/0.86/accessibilityinfo] [CITED: https://reactnative.dev/docs/0.86/keyboardavoidingview] |
| Startup readiness | API / Backend (local runtime coordinator) | Browser / Client | SQLite migration/read gates establish trust; the shell only renders truthful booting/failed/trusted states. [VERIFIED: src/bootstrap/workoutAppRuntime.tsx:2137-2397] |
| Appearance/rest preference persistence | Database / Storage | Browser / Client | The persisted keys are "gym_tracker.appearance_preference.v1" and "gym_tracker.rest_alert_preferences.v1"; the UI reflects rather than invents their saved state. [VERIFIED: src/platform/preferences/appearancePreferenceStore.ts:5-6,58-60] [VERIFIED: src/platform/preferences/restAlertPreferenceStore.ts:1-7,108-140] |
| Removed-history restore | API / Backend (local domain/runtime) | Browser / Client | The UI supplies revision and confirmation, but the domain command/repository owns restoration. The domain confirmation value is verbatim "restore_history". [VERIFIED: src/domains/history/historyLifecycleCommands.ts:1-18,50-60] |
| Backup, restore, merge, CSV and Drive recovery | API / Backend (local runtime/platform adapters) | Browser / Client | Existing controllers and facades own preflight tokens, cancellation, durable completion, sharing and rebuild-pending states; Phase 14 owns only common presentation and reachability. [VERIFIED: src/ui/portability/useManualBackupController.ts:10-42,60-114] [VERIFIED: app/more/data-and-recovery.tsx:286-355,420-680,775-812] |
| CNG/build reproducibility and native evidence | Native build/tooling | Browser / Client | Generated Android/iOS trees remain ignored; the script performs two clean Android generations and byte-tree comparison. [VERIFIED: scripts/check-cng-reproducible.sh:1-19,60-92] |

## Project Constraints (from .trae/rules/rules.md)

- Read and follow repository-root AGENTS.md; its applicable routing directs architecture work to gstack-plan-eng-review, design plan review to gstack-plan-design-review, and testing-site behavior to the QA skills. [VERIFIED: .trae/rules/rules.md:1-3] [VERIFIED: AGENTS.md:1-18]
- Use the four named project source documents for product/design/engineering reference; the approved core-workout and app-system images remain references rather than executable source. [VERIFIED: .trae/rules/rules.md:5-10]
- Keep SQLite source facts authoritative. [VERIFIED: .trae/rules/rules.md:12]
- Keep notifications, projections, and recommendations replayable or rebuildable. [VERIFIED: .trae/rules/rules.md:13]
- Do not acknowledge a set before its exclusive transaction commits. [VERIFIED: .trae/rules/rules.md:14]
- Preserve bundled versus user-owned data boundaries. [VERIFIED: .trae/rules/rules.md:15]
- Keep the workout critical path offline. [VERIFIED: .trae/rules/rules.md:16]
- Write tests with each behavior; integrity-critical modules require complete branch coverage. [VERIFIED: .trae/rules/rules.md:17]
- Future implementation commits must be atomic and end with the exact trailer "Co-authored-by: TRAE CLI <noreply@users.noreply.github.com>". This research task itself must not commit. [VERIFIED: .trae/rules/rules.md:18-21] [VERIFIED: task assignment]
- The approved planning worktree is "/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp" on "fchoo/UX-revamp"; the owner forbids app edits/builds/releases during the current planning session. [VERIFIED: .planning/v1.2-OWNER-BRIEF.md:8-24]

## Standard Stack

Use the pinned stack. Do not combine this phase with an Expo/React Native upgrade. Exact manifest values are "expo": "~57.0.25", "react-native": "0.86.3", "expo-router": "~57.0.23", "expo-font": "~57.0.4", "lucide-react-native": "1.31.0", and "@expo-google-fonts/ibm-plex-mono": "0.4.1". [VERIFIED: package.json:92-123]

### Core

| Library / asset | Version / source | Published / observed | Purpose | Direction |
|---|---|---:|---|---|
| Expo | ~57.0.25 | 2026-09-24 | Existing app/runtime baseline | Keep pinned; no SDK upgrade in Phase 14. [VERIFIED: npm registry lookup, 2026-10-06] |
| React Native | 0.86.3 | 2026-08-24 | Native rendering, AccessibilityInfo, Modal, KeyboardAvoidingView | Keep pinned and use built-in platform semantics. [VERIFIED: npm registry lookup, 2026-10-06] |
| Expo Router | ~57.0.23 | 2026-09-24 | Four tab routes plus stack-owned deep routes | Keep the JavaScript Tabs navigator and custom tabBar; do not replace it with a second router. [VERIFIED: npm registry lookup, 2026-10-06] [CITED: https://docs.expo.dev/router/advanced/tabs/] |
| expo-font | ~57.0.4 | 2026-09-11 | Current top-level local font gate | Reuse useFonts; add explicit font-error handling. [VERIFIED: npm registry lookup, 2026-10-06] [CITED: https://docs.expo.dev/develop/user-interface/fonts/#with-usefonts-hook] |
| Archivo | Official Google Fonts Archivo[wdth,wght].ttf source; local filename is contractually Archivo-VariableFont_wdth,wght.ttf | inspected 2026-10-06 | Interface and editorial display typography | Vendor bytes and OFL notice; never load from the network. The official metadata quotes axes "wdth" 62.0..125.0 and "wght" 100.0..900.0. [VERIFIED: https://github.com/google/fonts/tree/main/ofl/archivo] [VERIFIED: .planning/phases/14-prototype-visual-shell/14-UI-SPEC.md:65-66,73-74] |
| IBM Plex Mono | @expo-google-fonts/ibm-plex-mono 0.4.1 | 2025-09-17 | Numeric facts | Keep only the existing regular numerical face; do not add a new font dependency. [VERIFIED: npm registry lookup, 2026-10-06] [VERIFIED: src/ui/theme/index.ts:15-30] |
| Lucide React Native | 1.31.0 | 2026-08-09 | Existing icon vocabulary | Keep; use 24dp standard/20dp inline and hide decorative duplicates. [VERIFIED: npm registry lookup, 2026-10-06] [VERIFIED: .planning/phases/14-prototype-visual-shell/14-UI-SPEC.md:58-69] |

### Supporting

| Library / facility | Version | Purpose | When to use |
|---|---|---|---|
| react-native-safe-area-context | ~5.7.0 | Insets for root bar, headers, sheets and toast positioning | Use existing provider and hooks; bottom-nav height is baseline plus actual inset. [VERIFIED: package.json:118-120] |
| expo-status-bar / expo-system-ui | ~57.0.1 / ~57.0.4 | Theme-coherent system chrome | Reuse the existing StatusBar binding; cover root background/system chrome in native theme tests. [VERIFIED: package.json:108-111] [VERIFIED: app/_layout.tsx:32-71] |
| Jest / jest-expo | 29.7.0 / ~57.0.5 | Unit, component, route and state-transition checks | Keep existing multi-project config. [VERIFIED: package.json:125-132] [VERIFIED: jest.config.js:1-90] |
| React Native Testing Library | 14.0.1 | Role/name/state/focus/component behavior | Extend current component tests; do not treat layout mocks as native geometry evidence. [VERIFIED: package.json:125-132] |
| Maestro | 2.8.0 available locally | Android route, focus, theme, font-scale and viewport evidence | Use only after a current dev-test APK exists and ADB/device prerequisites pass. [VERIFIED: environment probe, 2026-10-06] |

### Alternatives Considered

| Instead of | Could Use | Disposition |
|---|---|---|
| Existing Expo Router JavaScript tabs | expo-router/ui headless custom tabs | Do not migrate. The existing custom tabBar already owns the approved custom look and route state; a router migration adds risk without a Phase 14 requirement. [CITED: https://docs.expo.dev/router/advanced/custom-tabs/] [VERIFIED: app/(tabs)/_layout.tsx:27-50] |
| Local Archivo bytes | @expo-google-fonts/archivo | Do not add the package. The approved contract names a bundled local asset and the phase needs a source hash/license record. [VERIFIED: .planning/phases/14-prototype-visual-shell/14-UI-SPEC.md:71-77] |
| Shared native primitives | A third-party UI/overlay/toast system | Prohibited for this phase; registry safety says no external UI registry blocks and existing primitives must be extended. [VERIFIED: .planning/phases/14-prototype-visual-shell/14-UI-SPEC.md:56-77,458-465] |
| Real variable-axis support proof | Horizontal scale/transform emulation | Prohibited because glyph metrics and wrapping would be false. [VERIFIED: .planning/phases/14-prototype-visual-shell/14-UI-SPEC.md:140-147] |

**Installation:** no new npm package should be installed. After selecting Node "24.19.0", restore the existing dependency tree with npm ci; the current checkout has no node_modules. [VERIFIED: package.json:6-10] [VERIFIED: .nvmrc:1] [VERIFIED: environment probe, 2026-10-06]

## Package Legitimacy Audit

No new external package is recommended, so the package-legitimacy install gate is not triggered. The phase adds a font asset from the official Google Fonts repository and its OFL notice, removes the Source Sans 3 dependency after all references disappear, and keeps existing pinned runtime/test packages. [VERIFIED: package.json:92-132] [VERIFIED: https://github.com/google/fonts/tree/main/ofl/archivo]

**Packages removed due to [SLOP] verdict:** none.  
**Packages flagged as suspicious [SUS]:** none proposed for installation.

## Architecture Patterns

### System Architecture Diagram

    App launch / deep link / root tap
                  |
                  v
    RootLayout: font + appearance readiness
                  |
          +-------+--------+
          |                |
       failure          fonts ready
          |                |
          v                v
    truthful shell    WorkoutAppRuntime
    + retry/code      SQLite open -> migrations -> recovery -> first trusted read
                           |
                    +------+------+
                    |             |
                 failed        trusted
                    |             |
                    v             v
              shell failure   AppRootShell
                                  |
              +-------------------+--------------------+
              |                   |                    |
         four bottom tabs    shared overlays      root/deep routes
              |              + App Settings       + existing screens
              |              + dialogs/sheets     + preserved recovery
              |              + semantic toasts    + route-origin focus
              v
    Workout | Calendar | Library | Progress

The ordering is intentional: no enabled feature navigation and no source-backed values appear until font/appearance readiness and the SQLite trust gate are satisfied. [VERIFIED: .planning/phases/14-prototype-visual-shell/14-UI-SPEC.md:294-305] [VERIFIED: src/bootstrap/workoutAppRuntime.tsx:2137-2397]

### Recommended Project Structure

The following names are a prescriptive proposal under Claude's discretion; they do not exist yet. [ASSUMED]

    assets/fonts/
    ├── Archivo-VariableFont_wdth,wght.ttf   # approved source font bytes
    └── OFL-Archivo.txt                      # upstream license/copyright
    src/ui/
    ├── theme/index.ts                       # one semantic token/type/motion provider
    ├── components/
    │   ├── index.ts                         # exports and existing primitives
    │   ├── BottomSheet.tsx                  # one modal frame/focus/IME owner
    │   ├── SemanticToast.tsx                # toast view + live announcement
    │   └── NavigationRow.tsx                 # forward-ref route trigger
    ├── shell/
    │   └── AppRootShell.tsx                 # settings/toast/focus coordinator
    └── screens/
        ├── AppSettingsContent.tsx            # one content tree for sheet and route
        ├── SettingsScreen.tsx                # direct-route wrapper
        └── RootScreens.tsx                   # startup shell only

### Existing Reuse vs Refactor Map

| Existing file / symbol | Action | Planning detail |
|---|---|---|
| app/_layout.tsx — RootLayout, RootNavigator | Refactor | Keep SafeAreaProvider, GestureHandlerRootView, Stack and StatusBar. Convert font errors and appearance-store read failures into the same truthful startup failure hierarchy; do not mount trusted runtime/content after font failure. Current font code only waits while "fontsLoaded" is false and "fontError" is null, so a non-null font error falls through. [VERIFIED: app/_layout.tsx:126-160,210-227] |
| app/(tabs)/_layout.tsx — RootTabsLayout | Refactor | Keep Tabs, backBehavior "history", initial route "index", custom tabBar, and disabled-until-trusted behavior. Delete tabBarPosition "left", "rail", and "two-row" decisions. [VERIFIED: app/(tabs)/_layout.tsx:17-50] |
| src/ui/components/index.ts — rootDestinations, AppTabs | Refactor | Keep route keys verbatim "index", "calendar", "library", "progress"; change visible first label from "Today" to "Workout"; use one equal-width bottom row at every width, 74dp baseline plus safe inset, and add the 3dp orange selected underline. [VERIFIED: src/ui/components/index.ts:1046-1187] [VERIFIED: .planning/phases/14-prototype-visual-shell/14-UI-SPEC.md:244-253] |
| src/ui/screens/RootScreens.tsx — AppLoadingShell | Refactor | Keep the stable disabled shell and no-fabricated-facts skeleton; remove its expanded rail branch and use the same fixed bottom composition as trusted mode. Current exact loading routes are "index", "calendar", "library", "progress". [VERIFIED: src/ui/screens/RootScreens.tsx:160-193] |
| src/ui/theme/index.ts — AppearanceProvider, resolveColorScheme, appFonts, themes, typeScale, motion | Refactor in place | Preserve one provider and live Appearance/reduce-motion subscriptions. Replace Source Sans and old color/type/radius/focus values with the exact Phase 14 tokens; retain the preference values verbatim: "System", "Light", "Dark". [VERIFIED: src/ui/theme/index.ts:15-31,33-182,184-297] |
| src/platform/preferences/appearancePreferenceStore.ts — productionAppearanceStore | Refactor contract, preserve key | Keep the exact key "gym_tracker.appearance_preference.v1" and SQLiteStorage database "gym-tracker-preferences.db". Stop swallowing read/write failures when startup or persistence truth depends on them; expose a bounded result so UI can fail or revert honestly. [VERIFIED: src/platform/preferences/appearancePreferenceStore.ts:5-36,39-60] |
| src/ui/layout/AdaptiveScreen.tsx — AdaptiveScreen, classifyWidth, horizontalInsetFor | Reuse with small extension | Preserve exact width classes "compact" below 600, "medium" from 600 through 839, and "expanded" at 840+, plus insets 16/24/32 and one scroll owner. Width may change content columns, never root-nav placement. Add an explicit top-toast anchor/dock clearance seam only if AppRootShell cannot measure it externally. [VERIFIED: src/ui/layout/AdaptiveScreen.tsx:20-48,50-257] |
| src/ui/components/index.ts — FocusablePressable | Refactor token only | Keep one touch/Enter/Space handler and disabled/busy semantics. Raise the visible outline from 2dp to the locked 3dp token and retain four dp visual clearance at the caller/container boundary. [VERIFIED: src/ui/components/index.ts:100-124,215-264] [VERIFIED: .planning/phases/14-prototype-visual-shell/14-UI-SPEC.md:118-125] |
| src/ui/components/index.ts — ScreenHeader | Refactor | Preserve one semantic heading and optional Back/action areas. Forward/register the heading ref, support ordered contextual actions before Settings, expose "Open App Settings", and give every root/deep transition an explicit focus target. Current ScreenHeader is not focusable and accepts one undifferentiated action node. [VERIFIED: src/ui/components/index.ts:481-536] |
| src/ui/components/index.ts — EmptyState, InlineNotice, SkeletonBlock | Reuse/restyle | Their specific heading/body/action, semantic icon/text, live-region and hidden-skeleton semantics match the new contract; recolor and retype through shared tokens. [VERIFIED: src/ui/components/index.ts:589-708,759-779] |
| src/ui/components/index.ts — ConfirmationSheet, AppearanceSheet | Refactor into shared frame | Retain safe-action-first focus and trigger restoration, but use one BottomSheet/ConfirmationDialog frame with 68% scrim, 82% keyboard-safe cap, 24dp top corners, 1dp top border, Escape/Back/scrim cancellation, and actual focus containment. Current values are 48% scrim, 90% cap and 12dp corners. [VERIFIED: src/ui/components/index.ts:815-1044,1418-1444] [VERIFIED: .planning/phases/14-prototype-visual-shell/14-UI-SPEC.md:114-125,268-290] |
| Modal owners in AdvancedTimingConfigSheet, CalendarField, RestAlertSettingsSheet, TimeDurationField, WorkoutStartSheet, ActiveWorkoutScreen, LibraryScreen, WorkoutCompletionScreen | Behavior-preserving frame migration | Replace duplicated backdrop/sheet/focus plumbing with the shared frame while leaving feature-specific state/actions in the current owner. Nine source files currently import Modal. [VERIFIED: repository Modal inventory, 2026-10-06] |
| src/ui/screens/SettingsScreen.tsx — SettingsScreen | Extract and reuse | Extract one App Settings content tree with Appearance first, then Rest alerts, History and data, Data and recovery. Render it inside the root sheet and inside the direct /more route; change the heading from "Settings" to "App Settings". [VERIFIED: src/ui/screens/SettingsScreen.tsx:65-89,163-349] [VERIFIED: .planning/phases/14-prototype-visual-shell/14-UI-SPEC.md:257-264,309-327] |
| app/more/index.tsx — MoreRoute | Reuse/refactor wrapper | Keep runtime-backed preference reads/writes and pushes to removed sessions/data recovery; use the extracted shared content and preserve direct-route Back behavior. [VERIFIED: app/more/index.tsx:21-81] |
| src/ui/screens/RemovedSessionsScreen.tsx — RemovedSessionsScreen | Reuse behavior, correct shell contract | Keep load/error/list/revision-confirmation/reload logic. Change empty action "Go back" to "Return to App Settings", safe confirmation "Cancel" to "Keep session removed", keep the selected identity visible while busy/failure, and announce "Workout restored" only after authoritative reload. [VERIFIED: src/ui/screens/RemovedSessionsScreen.tsx:40-60,75-131,133-228] [VERIFIED: .planning/phases/14-prototype-visual-shell/14-UI-SPEC.md:329-334] |
| app/more/data-and-recovery.tsx and src/ui/portability controllers | Preserve behavior; restyle only | Do not merge the automatic hub, secure-backup, restore, merge and CSV state machines into the shell. Retain token invalidation, cancellation, duplicate-submit latches, durable completion and rebuild-pending states. [VERIFIED: src/ui/portability/useManualBackupController.ts:10-42,60-114] [VERIFIED: app/more/data-and-recovery.tsx:286-355,420-680,775-812] |
| app/more/automatic-backup-settings.tsx and drive-backup-privacy.tsx | Preserve facade calls; refactor confirmations | Keep the exact connection policy, stale-writer, deletion-partial, deleted and privacy paths. Present disconnect/delete/start-new review through shared confirmation visuals; exact delete phrase remains "DELETE". [VERIFIED: app/more/automatic-backup-settings.tsx:10-63] [VERIFIED: app/more/drive-backup-privacy.tsx:8-16] |
| app/(tabs) root routes and screen-local view state | Reuse | Calendar selected date/month, Library section/query/filter/selection/scroll refs, and Progress query/range state remain screen-owned. Do not reset them from theme or shell context changes. [VERIFIED: src/ui/screens/CalendarScreen.tsx:376-416] [VERIFIED: src/ui/screens/LibraryScreen.tsx:1228-1314,1852-1861] [VERIFIED: src/ui/screens/ProgressScreen.tsx:567-590] |

### Pattern 1: One shell, existing navigator

Keep Expo Router's existing JavaScript Tabs and custom tabBar. Official Expo documentation states that the tabs layout is implemented with React Navigation bottom tabs, that the tabs directory layout owns the tab bar, and that tab appearance/behavior is configured there. [CITED: https://docs.expo.dev/router/advanced/tabs/]

The route-key and required-label values to use are quoted verbatim: current keys "index", "calendar", "library", "progress"; required labels "Workout", "Calendar", "Library", "Progress". [VERIFIED: src/ui/components/index.ts:1046-1055] [VERIFIED: .planning/phases/14-prototype-visual-shell/14-UI-SPEC.md:244-253]

    const rootDestinations = [
      { name: "index", label: "Workout", icon: Dumbbell },
      { name: "calendar", label: "Calendar", icon: CalendarDays },
      { name: "library", label: "Library", icon: LibraryBig },
      { name: "progress", label: "Progress", icon: ChartNoAxesColumnIncreasing },
    ] as const;

Do not rename the index route when changing the label. A route rename would enlarge the deep-link/back-state surface for no product benefit. [VERIFIED: app/(tabs)/_layout.tsx:27-50] [VERIFIED: .planning/phases/14-prototype-visual-shell/14-UI-SPEC.md:244-253]

### Pattern 2: One App Settings content owner, two presentations

Extract the content from SettingsScreen, then render it in (a) a root-triggered BottomSheet and (b) the existing /more/index route. The source order is quoted verbatim: "Appearance"; "Rest alerts"; "History and data"; "Data and recovery". [VERIFIED: src/ui/screens/SettingsScreen.tsx:163-345] [VERIFIED: .planning/phases/14-prototype-visual-shell/14-UI-SPEC.md:311-320]

The shell coordinator should retain the root trigger and last settings-row trigger. Closing the sheet restores the root Settings button; pushing a deeper settings route closes the sheet without writing; Back returns to the owning settings context and row. This proposed coordination belongs in AppRootShell rather than in each feature screen. [ASSUMED]

### Pattern 3: One modal frame with content-owned behavior

Create a single BottomSheet frame that owns Modal, accessibility isolation, scrim press, Android Back, Escape, KeyboardAvoidingView, height cap, safe-area padding, heading focus and trigger restoration. Content components continue to own draft, validation, mutation and cancel semantics. React Native 0.86 documents onRequestClose as the Android hardware-Back callback and KeyboardAvoidingView as the primitive that adjusts height, position or padding for the keyboard. [CITED: https://reactnative.dev/docs/0.86/modal] [CITED: https://reactnative.dev/docs/0.86/keyboardavoidingview]

Do not claim a focus trap from accessibilityViewIsModal alone. Existing components set modal accessibility and sometimes focus/restore a ref, but they do not implement an explicit traversal boundary or Escape handling. [VERIFIED: src/ui/components/index.ts:815-1044] [VERIFIED: src/ui/components/RestAlertSettingsSheet.tsx:51-121,171-270]

### Pattern 4: Transient feedback follows authority

SemanticToast is a presentation-only host. Commands and controllers continue to return authoritative results; only then may callers enqueue a success toast. Blocking failures remain inline with a specific retry; the toast may announce but may not be the only recovery surface. [VERIFIED: .planning/phases/14-prototype-visual-shell/14-UI-SPEC.md:284-290,336-355]

The shared host should calculate its top from safe-area/header layout and accept a bottom avoidance region for the active-workout command/rest dock and IME. The exact visual values are quoted verbatim: minimum height "50dp", horizontal inset "16dp", radius "12dp", border "1dp", leading bar "4dp", enter/exit "150ms", and noncritical dwell "2400ms". [VERIFIED: .planning/phases/14-prototype-visual-shell/14-UI-SPEC.md:114-125,284-290]

### Pattern 5: Theme preference and resolved scheme stay separate

Retain the existing semantic model: the preference is exactly "System" | "Light" | "Dark"; the resolved scheme is exactly "light" | "dark"; Appearance.addChangeListener updates only the resolved scheme while System is selected. [VERIFIED: src/ui/theme/index.ts:184-185,207-224,243-294] [VERIFIED: React Native 0.86 Appearance.js inspection]

Change the storage adapter from silent fallback to a bounded read/write result. Cold-start read failure must route to startup failure category "Fonts" only for a font error and a distinct bounded preference/storage diagnostic for preference read failure; do not show raw storage errors. The exact category design is an implementation decision the planner should lock before coding. [ASSUMED]

### Pattern 6: Bundled font artifact with an explicit SDK-57 proof

The contract requires the local Archivo asset and the existing useFonts boundary. The official Archivo source publishes Archivo[wdth,wght].ttf under SIL OFL 1.1; commit the font bytes, license text, upstream URL and SHA-256. [VERIFIED: https://github.com/google/fonts/tree/main/ofl/archivo] [VERIFIED: .planning/phases/14-prototype-visual-shell/14-UI-SPEC.md:71-74]

The proposed mapping below is not yet present and must not be treated as proof of width-axis rendering. [ASSUMED]

    export const appFonts = {
      ArchivoVariable:
        require("../../../assets/fonts/Archivo-VariableFont_wdth,wght.ttf"),
      IBMPlexMono_400Regular:
        require("@expo-google-fonts/ibm-plex-mono/400Regular/IBMPlexMono_400Regular.ttf"),
    } as const;

Wave 0 must render representative 400/800 body/header text plus the 57sp condensed display in a development-test APK, record Font.isLoaded or equivalent loading evidence, and compare actual Android glyph width/wrapping against Revision 18. If the width axis cannot be selected on Expo 57/React Native 0.86, stop the typography task and obtain owner disposition for a static extracted face or a stack upgrade. [CITED: https://github.com/expo/expo/blob/sdk-57/docs/pages/develop/user-interface/fonts.mdx#variable-fonts] [CITED: https://docs.expo.dev/develop/user-interface/fonts/#variable-fonts] [VERIFIED: .planning/phases/14-prototype-visual-shell/14-UI-SPEC.md:129-147]

### Anti-Patterns to Avoid

- **Global Today replacement:** Rename only root-destination uses to Workout. Calendar's temporal "Today", phrases such as "today's plan", and domain method names remain meaningful; repository search shows both navigation and date/domain uses. [VERIFIED: repository Today inventory, 2026-10-06]
- **Parallel theme namespace:** Do not add prototype colors inside screens. Replace/extend src/ui/theme once so downstream phases inherit one semantic meaning. [VERIFIED: .planning/phases/14-prototype-visual-shell/14-UI-SPEC.md:71-77,164-202]
- **Parallel modal frames:** Do not leave 48%-scrim/90%-height variants beside the new 68%/82% contract. Migrate frame ownership while preserving content behavior. [VERIFIED: src/ui/components/index.ts:1418-1444] [VERIFIED: src/ui/components/RestAlertSettingsSheet.tsx:340-378]
- **Toast as state:** Never make a timeout, animation completion or toast visibility authoritative for navigation, persistence, restore, backup, import or workout completion. [VERIFIED: .planning/phases/14-prototype-visual-shell/14-UI-SPEC.md:284-305,355]
- **Appearance-only Settings clone:** The prototype omits shipped recovery content; omission is not permission to remove it. [VERIFIED: .planning/design/v1.2-prototype-inventory.json source conflict C-12] [VERIFIED: .planning/phases/14-prototype-visual-shell/14-UI-SPEC.md:309-355]
- **Treating component snapshots as native proof:** Jest can prove props/roles/actions but not Android glyph metrics, hit rectangles, IME overlap, D-pad containment or system-theme repaint. [VERIFIED: .planning/verification/v1.2-native-verification-matrix.md:15-30,123-138]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Root navigation | A second route store or hand-built navigator | Existing Expo Router Tabs plus AppTabs | Route keys, selected state, tabPress prevention and stack ownership already exist. [VERIFIED: app/(tabs)/_layout.tsx:27-50] [VERIFIED: src/ui/components/index.ts:1089-1187] |
| Safe-area geometry | Device/status-bar constants | react-native-safe-area-context and measured header/dock layout | The contract explicitly rejects fake-status-bar offsets. [VERIFIED: app/_layout.tsx:5-7,210-221] [VERIFIED: .planning/phases/14-prototype-visual-shell/14-UI-SPEC.md:284-287] |
| System appearance subscription | Polling or cached OS theme | Existing AppearanceProvider using Appearance.addChangeListener | React Native says the color scheme may change and supplies the listener. [VERIFIED: src/ui/theme/index.ts:251-270] [VERIFIED: React Native 0.86 Appearance.js inspection] |
| Reduced-motion detection | App-only toggle | Existing AccessibilityInfo isReduceMotionEnabled/reduceMotionChanged integration | The OS setting is already observed and must remain live. [VERIFIED: src/ui/theme/index.ts:254-290] [CITED: https://reactnative.dev/docs/0.86/accessibilityinfo] |
| Keyboard avoidance | Fixed keyboard offsets per screen | Shared KeyboardAvoidingView plus scroll-to-focused-field behavior | Native keyboard frames and orientation vary. [CITED: https://reactnative.dev/docs/0.86/keyboardavoidingview] |
| Settings and recovery workflows | New simplified Settings state machines | Existing SettingsScreen, RemovedSessionsScreen, Data/Recovery routes and portability controllers | Existing tests cover durable state, cancellation, retry, stale tokens and rebuild-pending behavior. [VERIFIED: app/more/__tests__/data-and-recovery.test.tsx:40-135] [VERIFIED: app/more/__tests__/manual-encrypted-backup.test.tsx:335-811] |
| Backup cryptography | UI encryption/password logic | Existing backup/restore/merge commands and platform crypto | Phase 14 is presentation-only and must preserve the authenticated archive boundary. [VERIFIED: src/domains/portability/restoreCommands.ts:412-438] [VERIFIED: src/domains/portability/mergeCommands.ts:518-530] |
| Font condensation | scale transforms or remote Google Fonts | Bundled Archivo source plus native proof; owner checkpoint on failure | Transforms falsify metrics and the workout display must wrap correctly at 200%. [VERIFIED: .planning/phases/14-prototype-visual-shell/14-UI-SPEC.md:129-147] |

**Key insight:** Nearly every required behavior already has an owner. Phase 14 succeeds by consolidating presentation and adding missing focus/toast/startup truth, not by duplicating navigation, settings, persistence or recovery logic.

## Runtime State Inventory

This phase includes a visual refactor and the visible root rename Today → Workout, so runtime state was audited beyond source text. [VERIFIED: .planning/phases/14-prototype-visual-shell/14-UI-SPEC.md:71-77]

| Category | Items Found | Action Required |
|---|---|---|
| Stored data | Appearance uses key "gym_tracker.appearance_preference.v1" in "gym-tracker-preferences.db"; rest alerts use "gym_tracker.rest_alert_preferences.v1" in the same preference database. No stored route name or root label was found. [VERIFIED: src/platform/preferences/appearancePreferenceStore.ts:5-6,58-60] [VERIFIED: src/platform/preferences/restAlertPreferenceStore.ts:1-7,108-140] [VERIFIED: repository Today inventory, 2026-10-06] | No data migration. Preserve both keys and read existing Light/Dark/null values. Refactor error reporting only. |
| Live service config | Google Drive connection/account state and notification permission are live external/OS state surfaced through the runtime; the shell must not reset, fake or overwrite either. [VERIFIED: src/bootstrap/workoutAppRuntime.tsx:2090-2134,3396-3442] [VERIFIED: app/more/automatic-backup-settings.tsx:10-55] | Presentation code edit only. Keep facade commands and state-specific recovery actions. |
| OS-registered state | Android package identities are "com.fchoo.gymtracker.devtest" and "com.fchoo.gymtracker"; notification channel is "workout-rest-v2-sound-vibration". [VERIFIED: app.config.ts:20-45,63-70] | No rename/re-registration. Run clean CNG and a fresh dev-test build after asset changes. |
| Secrets/env vars | Build profile reads "GYM_TRACKER_BUILD_PROFILE"; Google auth reads "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID"; native fixtures read "EXPO_PUBLIC_NATIVE_CONTRACT_SUITE". [VERIFIED: app.config.ts:5-18] [VERIFIED: src/bootstrap/workoutAppRuntime.tsx:1280-1290] | No secret or variable rename. Do not log values or embed test flags in production evidence. |
| Build artifacts / installed packages | android/ and ios/ are ignored/generated and absent; node_modules is absent; the exact Node/npm toolchain exists under the local NVM path even though the default shell is Node 26.10.0/npm 11.19.1. [VERIFIED: scripts/check-cng-reproducible.sh:69-92] [VERIFIED: environment probe, 2026-10-06] | Select Node 24.19.0/npm 11.17.0, run npm ci, then generate/build from committed source. A fresh APK is required to prove packaged font bytes; stale v1.1 artifacts cannot. |

No data migration is required for the label change because the route key remains "index" and no persisted "Today" key was found. Do not use a repository-wide text replacement: date-relative copy such as Calendar "Today" remains valid. [VERIFIED: app/(tabs)/_layout.tsx:27-50] [VERIFIED: repository Today inventory, 2026-10-06]

## Prototype and Parity Contract

The canonical prototype inputs are Revision "18", approved.json SHA-256 "b8e91e3098ec443c9dc283ae8383d1af552d7dc2b83648695a01dcb8a89ff0bf", and approved-hybrid.html SHA-256 "b5ddbad88fd465af2fa79475dc0c05efec49e551652f13c5220627730e1d9c96". The hashes were recomputed and match the checked-in source manifest. [VERIFIED: .planning/design/v1.2-browser-evidence/source-manifest.json:1-18] [VERIFIED: shasum on 2026-10-06]

The matrix contains 172 requirement-bearing rows: 17 Phase 13, 13 Phase 14, and 142 later consumer/verification rows. The Phase 14 IDs are exactly "shell.four-roots", "shell.root-state", "shell.appearance", "shell.tokens", "shell.sheets", "shell.toasts", "shell.launch", "shell.rest-alerts", "shell.settings-deep-links", "shell.removed-sessions", "shell.data-recovery", "shell.automatic-backup", and "shell.manual-backup". [VERIFIED: .planning/design/v1.2-prototype-parity-matrix.md:20-31,55-71]

Every Phase 14 plan must preserve those inventory IDs into its task verification and final evidence path. The exact planned paths are ".planning/phases/14-prototype-visual-shell/evidence/shell.<capability>.json"; these are future evidence artifacts and are not present yet. [VERIFIED: .planning/design/v1.2-prototype-parity-matrix.md:59-71]

The source-order rule is:

1. Owner brief and locked Phase 14 decisions.
2. Source precedence and deviation register.
3. Revision 18 approved.json, then rendered approved-hybrid.html.
4. SHL requirements and roadmap success criteria.
5. Existing native behavior for prototype-absent startup/history/backup/recovery/focus/keyboard behavior.

[VERIFIED: .planning/phases/14-prototype-visual-shell/14-UI-SPEC.md:20-30]

### Exact Shared Token Target

The following values are copied from the approved Phase 14 token map; implementation should preserve semantic names or provide one explicit mapping from current names. [VERIFIED: .planning/phases/14-prototype-visual-shell/14-UI-SPEC.md:164-193]

| Token | Light | Dark |
|---|---|---|
| paper | #FFFAF0 | #080808 |
| bone | #F4F0E6 | #151515 |
| ink / text | #0D0C0A | #F7F7F2 |
| quiet / muted | #655F56 | #AAA9A2 |
| clay | #D8C3AB | #6D665C |
| surface | #F0EADF | #151515 |
| raised | #FFFAF0 | #202020 |
| line / lightLine | #CEC6B8 | #333330 |
| orange | #D97820 | #D97820 |
| green / greenBg | #166B4C / #DCECDF | #72DF92 / #14271A |
| yellow / yellowBg | #8D5D00 / #FFF0C2 | #F0C84B / #2A2410 |
| blue / blueBg | #195FAE / #DCE9F9 | #71AAFF / #14243B |
| toastBg / toastBorder / toastText | #FFFAF0 / #CEC6B8 / #0D0C0A | #202020 / #3D423E / #F7F7F2 |
| destructive | #B42318 | #FF8279 |

Keep the current light destructive extension "#B42318"; the prototype's "#FF8279" is dark-surface-only. Keep production Light Strength text at "#D97820". The candidate "#9B470B" may exist only as "calendarStrengthTextLightCandidate" marked "PROPOSED — OWNER DECISION REQUIRED" and unused until DEV-02 is accepted. [VERIFIED: .planning/phases/14-prototype-visual-shell/14-UI-SPEC.md:189-202]

Typography values are exactly four sizes—"14sp", "16sp", "20sp", "57sp"—and two weights—"400", "800". Line heights are "20sp", "22sp", "24sp", and "49sp" respectively. [VERIFIED: .planning/phases/14-prototype-visual-shell/14-UI-SPEC.md:129-147]

Spacing values are exactly "4", "8", "16", "24", "32", "48", and "64" dp. Component-specific geometry is not part of that spacing scale. [VERIFIED: .planning/phases/14-prototype-visual-shell/14-UI-SPEC.md:98-125]

### Root Width Contract

| Viewport / condition | Content layout | Navigation requirement |
|---|---|---|
| 360×800 compact | 16dp content inset | One bottom row, four equal cells, full visible labels; bar grows vertically at 200% text. |
| 390×844 compact | 16dp content inset | Same bottom composition. |
| 600×960 medium | 24dp content inset; optional readable columns | Same bottom composition. |
| 840×1080 expanded | 32dp content inset; optional readable columns | Same bottom composition; no rail. |
| Corresponding landscape sizes | One vertical content scroll owner | Header and bottom navigation remain safe-area anchored. |

All dimensions and behavior are locked. [VERIFIED: .planning/phases/14-prototype-visual-shell/14-UI-SPEC.md:114-125,244-253,386-394]

## Suggested Plan Boundaries

These boundaries are recommendations, not additional product scope.

1. **Wave 0 — dependency restore and font feasibility:** select the pinned Node/npm binaries, run npm ci, add the official Archivo bytes/license in an isolated commit, prove weight/condensed rendering in a development-test APK, and stop for owner disposition if the width axis fails. Do not begin broad visual replacement on an unproven font.
2. **Wave 1 — theme and startup:** replace appFonts/fontFamilies/typeScale/themes/sizes/motion; make font/preference read failures explicit; keep the runtime SQLite gate and test-production fixture isolation.
3. **Wave 2 — root shell:** update RootTabsLayout/AppTabs/AppLoadingShell; add common root header/settings entry and route focus coordination; retain each screen's existing query/filter/date/range/scroll state.
4. **Wave 3 — overlays and toasts:** create the shared modal frame and toast host, then migrate existing wrappers without moving content state machines.
5. **Wave 4 — settings/recovery preservation:** extract one App Settings content owner, align exact copy/actions, and run the complete SHL-08–13 regression matrix.
6. **Wave 5 — evidence closure:** run type/boundary/component/full suites, clean CNG twice, build one exact-source dev-test APK, collect native width/theme/font/focus/keyboard/reduced-motion evidence, and validate every shell.* evidence row.

## Common Pitfalls

### Pitfall 1: Treating the root rename as a global text replacement

**What goes wrong:** Calendar's date-relative "Today", "today's plan", runtime method names and historical test semantics are unintentionally renamed.  
**Why it happens:** The repository contains both root-label and temporal/domain uses of Today. [VERIFIED: repository Today inventory, 2026-10-06]  
**How to avoid:** Change the root destination label/header and navigation-facing return copy deliberately; review every remaining Today occurrence by semantic role.  
**Warning signs:** Calendar buttons or scheduling tests change even though only the root identity was intended.

### Pitfall 2: Keeping hidden rail/two-row branches

**What goes wrong:** Tests pass at ordinary phone width but 840dp becomes a left rail or 360dp/200% becomes two rows.  
**Why it happens:** Both branches are encoded in RootTabsLayout, AppTabs and AppLoadingShell, with tests that currently require them. [VERIFIED: app/(tabs)/_layout.tsx:17-49] [VERIFIED: src/ui/screens/RootScreens.tsx:160-193] [VERIFIED: app/(tabs)/__tests__/_layout.test.tsx:99-268]  
**How to avoid:** Delete the variants and invert the existing tests at 360, 600, 839, 840, 1024 and 1280 widths.  
**Warning signs:** "root-navigation-rail", "Root navigation bottom two rows", tabBarPosition "left", or width "50%" survives.

### Pitfall 3: Assuming a variable TTF proves condensed native output

**What goes wrong:** Archivo loads but uses its default width; the 57sp display wraps and differs from the prototype.  
**Why it happens:** Expo SDK 57 does not guarantee cross-platform variable fonts, useFonts does not provide a width-axis control, and React Native 0.86 does not expose fontStretch in its TextStyle type. [CITED: https://github.com/expo/expo/blob/sdk-57/docs/pages/develop/user-interface/fonts.mdx#variable-fonts] [VERIFIED: React Native 0.86 StyleSheetTypes.js inspection]  
**How to avoid:** Gate on a native screenshot/metric proof; if it fails, open a documented owner deviation for a static extracted face or stack upgrade.  
**Warning signs:** useFonts reports loaded but the rendered title width matches uncondensed body text.

### Pitfall 4: Letting font or appearance failures fall through

**What goes wrong:** Trusted data renders in fallback typography or an unintended System theme, contradicting startup truth.  
**Why it happens:** RootLayout currently continues when fontError is non-null, and the appearance store catches reads/writes and returns null/no-op. [VERIFIED: app/_layout.tsx:126-160] [VERIFIED: src/platform/preferences/appearancePreferenceStore.ts:14-36]  
**How to avoid:** Model font/preference readiness explicitly and route failure to bounded diagnostic UI before trusted content.  
**Warning signs:** a font-load-error test still mounts WorkoutAppRuntimeProvider, or storage failure selects System without notice.

### Pitfall 5: Claiming modal compliance from a Modal prop

**What goes wrong:** TalkBack/keyboard focus escapes, Escape does nothing, the IME covers the action, or scrim taps leak to background content.  
**Why it happens:** accessibilityViewIsModal and onRequestClose cover only parts of the contract; current variants have no common focus containment or KeyboardAvoidingView. [VERIFIED: src/ui/components/index.ts:815-1044] [VERIFIED: repository focus/keyboard inventory, 2026-10-06]  
**How to avoid:** One shared frame owns accessibility isolation, entry/trap/return, Back/Escape/scrim, IME avoidance and nested-sheet prohibition.  
**Warning signs:** any new screen imports Modal directly, or tests only call the visible Cancel button.

### Pitfall 6: Replacing rather than reusing Settings

**What goes wrong:** Appearance looks correct but Rest alerts, Removed sessions, Drive, CSV, privacy or recovery becomes unreachable.  
**Why it happens:** The prototype demonstrates appearance but intentionally does not implement native-only recovery depth. Source conflict C-12 resolves this in favor of shipped routes. [VERIFIED: .planning/design/v1.2-prototype-inventory.json source conflict C-12]  
**How to avoid:** Extract one settings content owner and verify all existing route buttons from both sheet and direct-route presentations.  
**Warning signs:** app/more route tests are deleted or App Settings has only appearance radios.

### Pitfall 7: Moving recovery state into visual primitives

**What goes wrong:** Closing/reopening a sheet loses a preflight token, repeats a source write, leaks a stale file handle, or reports ready while rebuild is pending.  
**Why it happens:** Generic overlay/toast state is confused with controller/domain state.  
**How to avoid:** Keep current manual-backup/CSV/automatic-backup controllers and exact confirmation gates. Verbatim confirmation strings are "REPLACE", "MERGE", and "DELETE"; removed-history uses "restore_history". [VERIFIED: src/ui/portability/useManualBackupController.ts:19-42,99-114] [VERIFIED: src/domains/portability/restoreCommands.ts:426-438] [VERIFIED: src/domains/portability/mergeCommands.ts:518-530] [VERIFIED: app/more/automatic-backup-settings.tsx:14-20,52-61] [VERIFIED: src/domains/history/historyLifecycleCommands.ts:1-4]  
**Warning signs:** the parity matrix's loose "RESTORE/MERGE" shorthand is copied into executable code; the authoritative clean-restore string is REPLACE.

### Pitfall 8: Emitting a toast before durable completion

**What goes wrong:** The UI announces a restored workout, export or backup that was not committed or could not be reloaded.  
**Why it happens:** A toast is wired to press/promise start rather than authoritative result/reload.  
**How to avoid:** Enqueue success only after the existing command and required authoritative refresh/rebuild result. Keep failure recovery inline. [VERIFIED: .planning/phases/14-prototype-visual-shell/14-UI-SPEC.md:284-290,329-355]  
**Warning signs:** a timer or animation callback is the only path that changes success state.

### Pitfall 9: Losing route state or focus on shell/theme rerender

**What goes wrong:** Library search/filter/scroll, Calendar date, Progress range, sheet draft or trigger focus resets.  
**Why it happens:** Moving state into a remounted shell, keying screens by theme, or replacing the navigator destroys current owners.  
**How to avoid:** Keep root view state in mounted screens, make theme a context-only update, and add navigation/deep-route round-trip tests. [VERIFIED: src/ui/screens/LibraryScreen.tsx:1228-1314,1852-1861] [VERIFIED: src/ui/theme/index.ts:283-297]  
**Warning signs:** theme selection reruns initializers or a returning route shows default query/date/scroll.

### Pitfall 10: Treating browser evidence as native acceptance

**What goes wrong:** CSS screenshots hide Android font-axis, safe-area, touch-bound, IME, D-pad or nonlinear text failures.  
**Why it happens:** Revision 18 is the presentation oracle but not native evidence. [VERIFIED: .planning/design/v1.2-SOURCE-PRECEDENCE.md:24-30]  
**How to avoid:** Compare a fresh exact-source APK against the pinned prototype and retain native geometry/focus traces, image hashes and device/build identity.  
**Warning signs:** Phase 14 closes with Jest/browser captures only.

### Pitfall 11: Running CNG or native evidence from a dirty/unpinned environment

**What goes wrong:** source hashes mismatch, generated folders linger, or evidence cannot be tied to the app bytes.  
**Why it happens:** the build helper requires a clean tracked tree, exact source digest and ready ADB device. [VERIFIED: scripts/build-current-native-test-apk.sh:62-105,128-184]  
**How to avoid:** use Node 24.19.0/npm 11.17.0, install dependencies, commit the implementation atomically, then run CNG/build/evidence.  
**Warning signs:** default Node 26 is used, node_modules is absent, or adb has no ready device.

### Pitfall 12: Accidentally approving DEV-02

**What goes wrong:** Light Strength title changes to #9B470B and CAL-03/VER-04 are reported complete without owner approval.  
**Why it happens:** the candidate is in the shared-token design and can be mistaken for an accepted replacement.  
**How to avoid:** keep production at #D97820; if the candidate is declared, assert it is unused and label the evidence/checkpoint pending. [VERIFIED: .planning/phases/14-prototype-visual-shell/14-UI-SPEC.md:50-52,189-202]  
**Warning signs:** calendarStrengthTextLightCandidate is referenced by a production style.

## Code Examples

These are narrow pattern references for the planner; feature business logic remains in existing owners.

### Live System appearance listener

The current provider already follows the correct listener shape. [VERIFIED: src/ui/theme/index.ts:251-270]

    const [systemScheme, setSystemScheme] = useState(
      () => Appearance.getColorScheme(),
    );

    useEffect(() => {
      const appearanceSubscription = Appearance.addChangeListener(
        ({ colorScheme }) => setSystemScheme(colorScheme),
      );
      return () => appearanceSubscription.remove();
    }, []);

React Native's official source says the color scheme may change and must not be cached without listening or using useColorScheme. [VERIFIED: React Native 0.86 Appearance.js inspection]

### Authoritative confirmation boundary

The visual review must pass the existing exact phrase to the controller; it must not weaken the domain check. The verbatim values are "REPLACE" and "MERGE". [VERIFIED: src/ui/portability/useManualBackupController.ts:99-114]

    if (restoreState.kind !== "review" || confirmation !== "REPLACE") return;
    await commitSecureRestore({ token, confirmation: "REPLACE" });

    if (mergeState.kind !== "review" || confirmation !== "MERGE") return;
    await commitSecureMerge({ token, confirmation: "MERGE" });

### Post-commit restore feedback

Reuse the existing order—commit, refresh, then publish success—rather than moving authority into the toast. [VERIFIED: src/ui/screens/RemovedSessionsScreen.tsx:111-130]

    await restoreSession({
      sessionId: selected.id,
      expectedEffectiveRevision: selected.effectiveRevision,
      confirmation: RESTORE_HISTORY_CONFIRMATION,
    });
    onRestored(selected.id);
    await load();
    // Only now enqueue "Workout restored".

The literal success copy "Workout restored" is defined in the approved UI contract. [VERIFIED: .planning/phases/14-prototype-visual-shell/14-UI-SPEC.md:329-334]

## State of the Art

| Old/current approach | Phase 14 approach | Impact |
|---|---|---|
| Source Sans 3 regular/semibold plus IBM Plex Mono regular/semibold | Bundled Archivo 400/800 plus IBM Plex Mono 400 | One approved editorial hierarchy; no network dependency. [VERIFIED: src/ui/theme/index.ts:15-31] [VERIFIED: .planning/phases/14-prototype-visual-shell/14-UI-SPEC.md:129-147] |
| Today root, expanded rail, 200%-text two-row bar | Workout root; one four-cell bottom bar at all widths | Stable mental model and parity with Revision 18. [VERIFIED: app/(tabs)/_layout.tsx:17-49] [VERIFIED: .planning/phases/14-prototype-visual-shell/14-UI-SPEC.md:244-253] |
| Material-neutral canvas/card palette | Warm paper/dark instrument semantic palette | Shared semantic roles flow to all later feature phases. [VERIFIED: src/ui/theme/index.ts:114-163] [VERIFIED: .planning/phases/14-prototype-visual-shell/14-UI-SPEC.md:151-202] |
| Multiple screen-local Modal frames | One shared BottomSheet/ConfirmationDialog frame | Consistent Back/Escape/focus/IME/scrim behavior without rewriting content state machines. [VERIFIED: repository Modal inventory, 2026-10-06] |
| Inline live-region notices only | Inline persistent errors plus shared transient SemanticToast | Success feedback gains consistent placement while recovery remains actionable. [VERIFIED: repository toast inventory, 2026-10-06] [VERIFIED: .planning/phases/14-prototype-visual-shell/14-UI-SPEC.md:284-290] |
| Appearance storage errors silently fall back | Explicit readiness/persistence failure with bounded diagnostic | No opposite-theme flash or false saved preference. [VERIFIED: src/platform/preferences/appearancePreferenceStore.ts:14-36] [VERIFIED: .planning/phases/14-prototype-visual-shell/14-UI-SPEC.md:257-264] |

**Deprecated/outdated in this phase:**

- root label "Today", root rail, and bottom two-row navigation. [VERIFIED: .planning/design/v1.2-SOURCE-PRECEDENCE.md:8-23]
- Source Sans 3 references and IBM Plex Mono semibold as a separate semantic weight. [VERIFIED: .planning/phases/14-prototype-visual-shell/14-UI-SPEC.md:71-77,129-147]
- 48% scrim, 90% sheet cap, 12dp sheet corners and 2dp focus ring. [VERIFIED: src/ui/components/index.ts:1418-1444] [VERIFIED: .planning/phases/14-prototype-visual-shell/14-UI-SPEC.md:114-125]
- generic "Settings" root heading; the approved heading is "App Settings". [VERIFIED: src/ui/screens/SettingsScreen.tsx:163-169] [VERIFIED: .planning/phases/14-prototype-visual-shell/14-UI-SPEC.md:359-380]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | Proposed new file boundaries AppRootShell.tsx, BottomSheet.tsx, SemanticToast.tsx and AppSettingsContent.tsx are the smallest maintainable split. [ASSUMED] | Recommended Project Structure | Planner may keep symbols in existing files if it still produces one owner and no parallel system. |
| A2 | The exact SDK-57 fallback, if Archivo width-axis rendering fails, will be an owner-approved static condensed face rather than an SDK upgrade. [ASSUMED] | Pattern 6 | Either choice changes asset/build scope; execution must stop at the checkpoint instead of choosing silently. |
| A3 | A shell-context coordinator is the best mechanism for settings-sheet origin, toast queue and root-heading focus. [ASSUMED] | Pattern 2 | A navigator listener/ref registry may fit better, but must satisfy the same state/focus tests without duplicating state. |
| A4 | Appearance preference failures should use a new bounded diagnostic category distinct from the existing migration/storage launch categories. [ASSUMED] | Pattern 5 | The planner must choose the exact typed failure shape without exposing raw errors. |
| A5 | appFonts should map ArchivoVariable through the shown relative asset require path. [ASSUMED] | Pattern 6 | The final relative import and native family name must be verified after the asset exists. |
| A6 | The named Wave 0 shell/font/evidence test files are suitable additions. [ASSUMED] | Validation Architecture | The planner may consolidate names, but cannot omit the behaviors or one-to-one evidence mapping. |

No product behavior, security requirement, retention rule, or performance target in this document depends on an unconfirmed assumption.

## Open Questions

1. **Can the pinned Expo 57 / React Native 0.86 Android build render the approved Archivo condensed width axis from the variable TTF?**
   - What we know: SDK 57 guidance says variable fonts are not supported across all platforms; current Expo guidance says full Android/iOS support begins in SDK 58 and useFonts controls only weight. [CITED: https://github.com/expo/expo/blob/sdk-57/docs/pages/develop/user-interface/fonts.mdx#variable-fonts] [CITED: https://docs.expo.dev/develop/user-interface/fonts/#variable-fonts]
   - What's unclear: actual Android rendering for this specific Archivo file/device and whether the default embedded face satisfies the approved 57sp display.
   - Recommendation: make this the first implementation checkpoint. If the exact variable source cannot reproduce the condensed title, pause only typography-dependent work and request owner approval for a static extracted face or stack upgrade.

2. **DEV-02 remains unresolved by design.**
   - What we know: production Light Strength title remains "#D97820"; "#9B470B" is only a proposed candidate. [VERIFIED: .planning/phases/14-prototype-visual-shell/14-UI-SPEC.md:50-52,189-202]
   - What's unclear: owner acceptance of the accessible candidate.
   - Recommendation: add a checkpoint:human-verify after presenting the measured comparison. Continue unaffected Phase 14 work, but do not use the candidate or close CAL-03/VER-04.

3. **Native Phase 14 evidence cannot run in the current shell yet.**
   - What we know: the exact Node 24.19.0/npm 11.17.0 binaries, Java 17, Android SDK adb/zipalign and Maestro 2.8.0 exist; node_modules is absent and adb reports no connected device. [VERIFIED: environment probe, 2026-10-06]
   - What's unclear: which emulator/physical device will be allocated during authorized execution.
   - Recommendation: planner includes dependency restore and device availability preflight before native evidence, with no claim of pass until the exact-source APK is installed.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| Node at pinned path | All JS tooling | ✓ | 24.19.0 | Select /Users/bytedance/.nvm/versions/node/v24.19.0/bin; default Node 26.10.0 is out of contract. [VERIFIED: .nvmrc:1] [VERIFIED: environment probe, 2026-10-06] |
| npm at pinned path | Dependency restore/tests/build | ✓ | 11.17.0 | Select the npm beside pinned Node; default npm 11.19.1 is out of contract. [VERIFIED: package.json:6-10] [VERIFIED: environment probe, 2026-10-06] |
| node_modules | Host tests/typecheck/build | ✗ | — | npm ci with the pinned toolchain. No lockfile change expected. [VERIFIED: environment probe, 2026-10-06] |
| Java | Android build | ✓ | Java 17 available; default shell reports 27 | Existing build script resolves Java 17 with /usr/libexec/java_home. [VERIFIED: scripts/build-current-native-test-apk.sh:79-88] [VERIFIED: environment probe, 2026-10-06] |
| Android SDK adb | Native build/install/evidence | ✓ binary; ✗ device | adb 1.0.41 / 37.0.1; no attached device | Start an approved emulator or attach a device before native steps. [VERIFIED: environment probe, 2026-10-06] |
| Android build-tools zipalign | APK identity check | ✓ | 36.0.0 path | — [VERIFIED: scripts/build-current-native-test-apk.sh:159-169] [VERIFIED: environment probe, 2026-10-06] |
| Maestro | Native navigation/accessibility flow | ✓ | 2.8.0 | No native fallback; component tests are only preflight. [VERIFIED: environment probe, 2026-10-06] |
| Revision 18 source files | Visual oracle | ✓ local bytes | hashes match source manifest | Local files remain usable even though localhost:8765 is not currently serving. [VERIFIED: .planning/design/v1.2-browser-evidence/source-manifest.json:1-18] [VERIFIED: environment probe, 2026-10-06] |

**Missing dependencies with no fallback:**

- A ready ADB device/emulator is required for font-axis proof, actual hit bounds, IME/D-pad/focus behavior, screenshots and CNG-backed APK evidence. [VERIFIED: scripts/build-current-native-test-apk.sh:95-105]

**Missing dependencies with fallback:**

- node_modules is absent; restore it with npm ci under Node 24.19.0/npm 11.17.0 before host checks. [VERIFIED: package.json:6-10] [VERIFIED: environment probe, 2026-10-06]
- The local prototype HTTP server is absent; source and pinned browser evidence are available, and an authorized native comparison run can start a local read-only server later. [VERIFIED: environment probe, 2026-10-06] [VERIFIED: .planning/design/v1.2-browser-evidence/source-manifest.json:1-18]

## Validation Architecture

Nyquist validation is enabled, so every implementation task needs an automated command and the phase needs native backstop evidence. [VERIFIED: .planning/config.json:20-49]

### Test Framework

| Property | Value |
|---|---|
| Framework | Jest 29.7.0 + jest-expo ~57.0.5 + React Native Testing Library 14.0.1 [VERIFIED: package.json:125-132] |
| Config file | jest.config.js; projects are "unit", "components", "sqlite-host", "integration". [VERIFIED: jest.config.js:1-90] |
| Component runner | scripts/run-component-tests.mjs forwards paths and escapes "(tabs)" paths for Jest. [VERIFIED: scripts/run-component-tests.mjs:1-26] |
| Quick shell command | npm run test:components -- --runInBand src/ui/__tests__/foundation.test.tsx "app/(tabs)/__tests__/_layout.test.tsx" app/__tests__/root-layout.test.tsx |
| Quick settings/recovery command | npm run test:components -- --runInBand src/ui/__tests__/SettingsScreen.test.tsx src/ui/__tests__/RemovedSessionsScreen.test.tsx app/more/__tests__/index.test.tsx app/more/__tests__/data-and-recovery.test.tsx app/more/__tests__/automatic-backup-settings.test.tsx app/more/__tests__/drive-backup-privacy.test.tsx app/more/__tests__/manual-encrypted-backup.test.tsx |
| Full host suite | npm run typecheck && npm run lint && npm run test:all [VERIFIED: package.json:19-28,72-74] |
| CNG | npm run verify:cng; it performs two clean Android generations and rejects drift. Run only from a clean tracked tree. [VERIFIED: package.json:75-80] [VERIFIED: scripts/check-cng-reproducible.sh:60-92] |
| Native build | npm run android:devtest:fresh -- --suite phase14 after adding the proposed suite contract. The existing builder accepts a validated suite string, requires a clean tree/device, records source/APK identity and installs the retained bytes. [VERIFIED: scripts/build-current-native-test-apk.sh:30-68,76-105,128-184] |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command / evidence | File Exists? |
|---|---|---|---|---|
| SHL-01 | Four ordered labels; one bottom composition at all widths/text scales | component + native geometry | Quick shell command; native captures at 360/390/600/840 plus landscape and 200% | ✅ extend foundation.test.tsx and _layout.test.tsx |
| SHL-02 | Retained root state; heading focus; deep-route and settings-trigger return | component integration + native keyboard/D-pad | Proposed AppRootShell.test.tsx plus root route tests; native focus trace | ❌ Wave 0 |
| SHL-03 | App Settings sheet/direct route; persisted System/Light/Dark; live OS change | component + store + native | foundation.test.tsx, SettingsScreen.test.tsx, appearancePreferenceStore.test.ts, root-layout.test.tsx | ✅ extend |
| SHL-04 | Exact tokens, bundled fonts, type roles, density | unit/source contract + native screenshot | foundation.test.tsx plus proposed font-asset hash/license test; native font metric comparison | ⚠️ asset/test gap |
| SHL-05 | Shared sheet/dialog, Back/Escape/scrim, trap/return, IME safety | component + native | Proposed BottomSheet.test.tsx; migrate/retain existing modal tests; native keyboard/focus flow | ❌ Wave 0 shared-frame test |
| SHL-06 | Theme-aware top toast, announcements, no dock/IME overlap | component + native geometry | Proposed SemanticToast.test.tsx; native set/restore/error screenshots | ❌ Wave 0 |
| SHL-07 | Font/SQLite loading, trusted, failure/retry, permission/continue | component + runtime unit + native launch | root-layout.test.tsx, RootFailureState.test.tsx, workoutAppRuntime.test.tsx | ✅ extend |
| SHL-08 | Rest sound/vibration/notification settings remain reachable | component + route | SettingsScreen.test.tsx, RestAlertSettingsSheet.test.tsx, app/more/index test | ✅ existing/extend |
| SHL-09 | Removed sessions and Data/recovery reachable from sheet and direct route | route component | app/more/index.test.tsx plus proposed App Settings sheet route test | ⚠️ direct route exists; sheet gap |
| SHL-10 | Removed list states and post-commit restore | component + integration | RemovedSessionsScreen.test.tsx plus history lifecycle/runtime tests | ✅ extend success announcement/focus |
| SHL-11 | Backup status/recovery and CSV state machine | route component + controller | data-and-recovery.test.tsx, useCsvExportController.test.tsx | ✅ existing regression |
| SHL-12 | Google policy/disconnect/delete/takeover/recovery/privacy | route component + runtime/domain | automatic-backup-settings.test.tsx, drive-backup-privacy.test.tsx, Phase 12 domain/contract suites | ✅ existing regression |
| SHL-13 | Encrypted backup, clean restore, merge, exact phrase, retry/rebuild | route component + controller + SQLite integration | manual-encrypted-backup.test.tsx, useManualBackupController.test.tsx, portability tests | ✅ existing regression |

The current runtime tests already prove trusted state follows migration/first read, explicit notification permission refresh, bounded launch failures, fresh-kernel retry, and stale-generation suppression. Preserve and extend these rather than creating a second startup coordinator. [VERIFIED: src/bootstrap/workoutAppRuntime.test.tsx:3634-3711,3798-4028]

The current recovery tests already cover source-backed removed-session confirmation/failure, cloud merge review, automatic-backup states, exact REPLACE/MERGE, preflight invalidation, duplicate-submit latches, rebuild-pending retry, CSV cancellation/failure and secret/path suppression. [VERIFIED: src/ui/__tests__/RemovedSessionsScreen.test.tsx:63-125] [VERIFIED: app/more/__tests__/data-and-recovery.test.tsx:40-135] [VERIFIED: app/more/__tests__/manual-encrypted-backup.test.tsx:335-811]

### Sampling Rate

- **Per task commit:** run the narrow component/store/runtime test files changed plus npm run typecheck and npm run check:boundaries.
- **Per wave merge:** run npm run test:all.
- **Font/CNG gate:** after the font asset and theme mapping are committed, run npm run verify:cng and one fresh phase14 dev-test APK; record exact asset/source/APK hashes.
- **Phase gate:** full host suite green, CNG green, every shell.* evidence path present and current, and the native shell matrix complete before /gsd-verify-work.

### Wave 0 Gaps

- [ ] Restore node_modules with the pinned Node/npm toolchain; no tests can run in the current checkout until then. [VERIFIED: environment probe, 2026-10-06]
- [ ] Add the official Archivo bytes and OFL notice, plus a source/hash contract test. [ASSUMED]
- [ ] Add the native SDK-57 Archivo weight/width-axis feasibility case before broad typography work. [ASSUMED]
- [ ] Add AppRootShell/state/focus integration coverage. [ASSUMED]
- [ ] Add BottomSheet and SemanticToast component coverage. [ASSUMED]
- [ ] Add a Phase 14 Maestro/evidence runner or the equivalent v1.2 shared runner, with stale/mismatched/skipped evidence rejection and source/APK identity. [ASSUMED]
- [ ] Ensure the phase evidence maps one-to-one to all 13 exact shell.* inventory IDs. [VERIFIED: .planning/design/v1.2-prototype-parity-matrix.md:55-71]

### Required Native Evidence

- Light, Dark, System-on-Light and System-on-Dark, including a live OS switch while a root, sheet and deep route stay mounted. [VERIFIED: .planning/verification/v1.2-native-verification-matrix.md:123-134]
- 360×800, 390×844, 600×960, 840×1080-equivalent portrait plus corresponding landscape, at font scale 1.0 and 2.0. Root nav stays one bottom row. [VERIFIED: .planning/verification/v1.2-native-verification-matrix.md:123-136]
- Actual >=48×48dp non-overlapping targets, 3dp visible focus per the Phase 14 UI-SPEC, heading entry, exact trigger restoration, Escape/Back/scrim safety and IME clearance. The older verification matrix mentions 2dp from the shipped design; Phase 14's approved UI-SPEC is the higher-precedence target. [VERIFIED: .planning/phases/14-prototype-visual-shell/14-UI-SPEC.md:118-125,396-402] [VERIFIED: .planning/verification/v1.2-native-verification-matrix.md:136-138]
- Screenshot/difference evidence against the exact Revision 18 hashes, with platform chrome classified separately and no global percentage masking missing controls. [VERIFIED: .planning/verification/v1.2-native-verification-matrix.md:136-138]
- Settings/recovery route journey and source-state assertions showing no operation, preference, preflight token or committed fact changed merely because the shell/theme changed. [VERIFIED: .planning/phases/14-prototype-visual-shell/14-UI-SPEC.md:309-355]
- DEV-02 evidence remains marked pending; do not use a screenshot with the candidate color as production acceptance. [VERIFIED: .planning/design/v1.2-DEVIATIONS.md:1-22]

## Security Domain

Security enforcement is enabled at ASVS Level 1. The current OWASP ASVS 5.0 category names differ from the older template numbering, so this mapping uses the current official chapter names. [VERIFIED: .planning/config.json:47-49] [VERIFIED: https://github.com/OWASP/ASVS/tree/master/5.0/en]

### Applicable ASVS Categories

| ASVS 5.0 category | Applies | Standard control for Phase 14 |
|---|---|---|
| V2 Validation and Business Logic | Yes | Preserve exact DELETE/REPLACE/MERGE and revision/preflight sequencing; prevent duplicate submit and never skip authoritative refresh/rebuild. [CITED: https://github.com/OWASP/ASVS/blob/master/5.0/en/0x11-V2-Validation-and-Business-Logic.md] |
| V5 File Handling | Regression only | UI must not weaken the existing bounded encrypted-backup/CSV file lifecycle, cancelled-handle disposal or safe errors. [CITED: https://github.com/OWASP/ASVS/blob/master/5.0/en/0x14-V5-File-Handling.md] [VERIFIED: src/ui/portability/useManualBackupController.ts:60-114] |
| V6 Authentication | No new authentication | Google connection remains in the existing automatic-backup facade; Phase 14 changes presentation only. [VERIFIED: app/more/automatic-backup-settings.tsx:10-63] |
| V7 Session Management | No | Workout sessions are local domain records, not authentication sessions. [VERIFIED: src/domains/history/historyLifecycleCommands.ts:6-23] |
| V8 Authorization | Limited/internal | Preserve development-test route/build-profile gates and ensure shell refactors do not expose harness behavior as product state. [VERIFIED: app.config.ts:5-18,75-88] [VERIFIED: src/domains/shared/tooling.test.ts:267-309] |
| V10 OAuth and OIDC | Regression only | Do not alter OAuth credentials/scopes or treat visual connection state as provider success. [VERIFIED: app.config.ts:15-18,75-87] |
| V11 Cryptography | Regression only | Keep manual GTBK cryptography and authenticated preflight in existing domain/platform code; no cryptographic implementation belongs in a UI primitive. [VERIFIED: src/domains/portability/restoreCommands.ts:412-438] |
| V13 Configuration | Yes | Keep development-test versus production identity exact, nativeContractsEnabled false in production, generated native directories ignored, and CNG reproducible. [CITED: https://github.com/OWASP/ASVS/blob/master/5.0/en/0x22-V13-Configuration.md] [VERIFIED: app.config.ts:5-18,20-45,75-88] [VERIFIED: scripts/check-cng-reproducible.sh:69-92] |
| V14 Data Protection | Yes | Display only bounded diagnostic category/correlation code; never raw SQL, file paths, tokens, account identifiers or archive errors in toast/evidence. [CITED: https://github.com/OWASP/ASVS/blob/master/5.0/en/0x23-V14-Data-Protection.md] [VERIFIED: src/ui/__tests__/RootFailureState.test.tsx:17-68] |

### Known Threat Patterns for the Stack

| Pattern | STRIDE | Standard Mitigation |
|---|---|---|
| Premature success toast before commit/reload | Spoofing / Repudiation | Enqueue only from authoritative result; retain command receipt/revision and persistent failure state. [VERIFIED: .trae/rules/rules.md:12-17] |
| Background activation through visible modal scrim | Tampering | Shared modal isolation, no background pointer/keyboard activation, safe Back/Escape/scrim path, competing actions disabled while busy. [VERIFIED: .planning/phases/14-prototype-visual-shell/14-UI-SPEC.md:268-290] |
| Duplicate destructive submit | Tampering / Denial of service | Existing latches and busy state; exact phrase; single-use preflight token; no write on dismiss. [VERIFIED: src/ui/portability/useManualBackupController.ts:60-114] |
| Raw storage/archive/provider errors in diagnostics, toast or evidence | Information disclosure | Map to bounded heading/body/correlation code; retain privacy-safe evidence validators. [VERIFIED: src/ui/__tests__/RootFailureState.test.tsx:17-68] [VERIFIED: scripts/verify-phase12-evidence.mjs:55-80] |
| Development-test harness reachable/active in production | Elevation of privilege / Information disclosure | Keep exact build-profile flag and production-manifest assertions; add shell-route regression around any RootLayout edits. [VERIFIED: app.config.ts:5-18,75-88] [VERIFIED: scripts/create-release-candidate-manifest.mjs:249-285] |
| Theme/shell rerender clears reviewed destructive state | Tampering / Repudiation | Theme updates are presentation-only; controller token/draft state stays mounted and remains the authority. [VERIFIED: .planning/phases/14-prototype-visual-shell/14-UI-SPEC.md:257-264,278-282] |
| Remote font or untracked font provenance | Supply chain / Information disclosure | Vendor from official Google Fonts, retain OFL and hash, load locally, and include in exact source/APK evidence. [VERIFIED: https://github.com/google/fonts/tree/main/ofl/archivo] |

## Sources

### Primary (HIGH confidence)

- .planning/phases/14-prototype-visual-shell/14-CONTEXT.md — locked decisions, discretion and deferred scope.
- .planning/phases/14-prototype-visual-shell/14-UI-SPEC.md — approved tokens, geometry, typography, navigation, overlay, startup, settings, copy and acceptance contract.
- .planning/v1.2-OWNER-BRIEF.md — owner authority, worktree and delivery boundaries.
- .planning/design/v1.2-SOURCE-PRECEDENCE.md and v1.2-DEVIATIONS.md — conflict resolution and DEV-02 status.
- .planning/design/v1.2-prototype-parity-matrix.md and machine JSON inventory — all 13 Phase 14 ownership/evidence rows.
- Live sources opened in this session: app/_layout.tsx; app/(tabs)/_layout.tsx; app/(tabs) root routes; app/more routes; src/ui/theme/index.ts; src/ui/layout/AdaptiveScreen.tsx; src/ui/components/index.ts; NavigationRow.tsx; RootScreens.tsx; SettingsScreen.tsx; RemovedSessionsScreen.tsx; workoutAppRuntime.tsx; launchCoordinator.ts; preference stores; portability controllers and confirmation-domain sources.
- Live tests opened in this session: foundation.test.tsx; root-layout.test.tsx; _layout.test.tsx; SettingsScreen.test.tsx; RestAlertSettingsSheet.test.tsx; RemovedSessionsScreen.test.tsx; app/more route tests; useCsvExportController.test.tsx; useManualBackupController.test.tsx; workoutAppRuntime.test.tsx.
- scripts/check-cng-reproducible.sh, scripts/build-current-native-test-apk.sh, scripts/run-component-tests.mjs and .planning/verification/v1.2-native-verification-matrix.md — build/test/evidence contracts.
- Revision 18 approved.json and approved-hybrid.html — recomputed hashes match .planning/design/v1.2-browser-evidence/source-manifest.json.

### Official documentation (MEDIUM confidence from research seam)

- https://docs.expo.dev/develop/user-interface/fonts/ — local fonts, useFonts, config-plugin and variable-axis constraints.
- https://github.com/expo/expo/blob/sdk-57/docs/pages/develop/user-interface/fonts.mdx — SDK-57 variable-font warning.
- https://docs.expo.dev/router/advanced/tabs/ — JavaScript tabs and custom tabBar ownership.
- https://docs.expo.dev/router/advanced/custom-tabs/ — headless custom tabs; reviewed and rejected as unnecessary migration.
- https://reactnative.dev/docs/0.86/appearance — live system appearance.
- https://reactnative.dev/docs/0.86/accessibilityinfo — reduced motion and announcements.
- https://reactnative.dev/docs/0.86/modal — Back/onRequestClose behavior.
- https://reactnative.dev/docs/0.86/keyboardavoidingview — IME avoidance.
- https://github.com/google/fonts/tree/main/ofl/archivo — Archivo variable bytes, axes metadata and OFL 1.1.
- https://github.com/OWASP/ASVS/tree/master/5.0/en — current ASVS categories and controls.

### Registry checks

- npm registry lookups on 2026-10-06 confirmed every pinned core package/version listed in Standard Stack and returned no postinstall script for those queried packages. These checks establish registry/version metadata only; the project manifest and official documentation establish intended use. [VERIFIED: npm registry lookup, 2026-10-06]

### Tertiary (LOW confidence)

- None used as implementation authority.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — versions are pinned in package.json and independently found on the npm registry; no new package is proposed.
- Architecture: HIGH — based on opened live route/theme/runtime/component/recovery sources plus locked owner/UI contracts.
- Pitfalls: HIGH — each major gap is observable in current code/tests or explicitly called out by the approved source-precedence/deviation artifacts.
- Font-axis fidelity: MEDIUM — official SDK guidance identifies a compatibility risk, but the decisive Android render has not been run.
- Native evidence availability: HIGH — required matrix/tooling is documented and local tools were probed; no ADB device is currently attached.

**Research date:** 2026-10-06  
**Valid until:** 2026-11-05 for the pinned stack and locked Phase 14 contract; re-check immediately if Expo/React Native versions or DEV-02 status changes.

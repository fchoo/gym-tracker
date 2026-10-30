# Phase 14: Prototype Visual Shell - Pattern Map

**Mapped:** 2026-10-06
**Targets mapped:** 44 file rows/groups
**Existing files analyzed:** 46 source, test, asset, and evidence files
**Analogs found:** 44 / 44; no exact analog exists for a shell-level toast host or a proven Archivo width-axis path on Expo 57

## Scope Boundary

Phase 14 is a shared-presentation refactor. Keep the existing Expo Router navigator,
screen-local root state, SQLite launch authority, preference keys, recovery
controllers, file-handle lifecycles, preflight tokens, and exact confirmation
phrases. Replace the current Material-neutral visual vocabulary, `Today` root
label, expanded rail, 200%-text two-row navigation, duplicated modal frames,
silent appearance-storage failure, and lack of a shared toast host.

Do not edit domain migrations, repository semantics, backup formats,
transaction ordering, or feature-owned Phase 15-19 content. DEV-02 is approved:
Light Strength title uses `#9B470B`; `#D97820` remains the required
border/rail/swatch color.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality | Action |
|---|---|---|---|---|---|
| `assets/fonts/Archivo-VariableFont_wdth,wght.ttf` | config/asset | file-I/O | current local `appFonts` entries in `src/ui/theme/index.ts:22-31` | partial | add official bytes; prove native rendering before broad migration |
| `assets/fonts/OFL-Archivo.txt` | config/legal asset | file-I/O | `assets/content/third-party/kinetic-place-exercises-db.MIT.txt:1-21` | role-match | add upstream license verbatim |
| `src/testing/phase14FontProof.ts` | test contract | transform | source-owned native contract ledgers | role-match | encode the 57px/condensed/wght-890/-0.07em oracle, exact strings/wraps, <=1 normalized physical-pixel tolerance and zero crop/overflow |
| `app/__phase2-attended-preview.tsx` Phase 14 scenario | dev-test route | event-driven | existing native-contract-gated attended preview | exact host | render the proof oracle only under `nativeContractsEnabled`; production remains unreachable |
| `package.json` | config | batch | current pinned font/runtime dependencies | exact file | remove Source Sans only after all references disappear; add no UI package |
| `app/_layout.tsx` | provider/route | event-driven | same file, especially `RootLayout` | exact | retain provider/Stack isolation; fix font and preference readiness failure |
| `app/(tabs)/_layout.tsx` | route | event-driven | same file, `RootTabsLayout` | exact | retain Tabs/history/route keys; replace rail and two-row choices |
| `src/ui/theme/index.ts` | provider/config | event-driven + transform | same file | exact | refactor in place to Revision 18 tokens and Archivo |
| `src/platform/preferences/appearancePreferenceStore.ts` | store | CRUD | same file; compare rest-alert readback in runtime | exact | preserve key/database/lazy open; replace swallowed failures with bounded results |
| `src/ui/layout/AdaptiveScreen.tsx` | component | event-driven | same file | exact | retain width classes/insets/one scroll owner/dock; add only shell measurement seams needed |
| `src/ui/components/index.ts` | component/barrel | event-driven | same file | exact | retain primitives and exports; move shared overlay frames out; replace tab/header/focus tokens |
| `src/ui/components/NavigationRow.tsx` | component | event-driven | `FocusablePressable` in `src/ui/components/index.ts:215-264` | role-match | forward a stable focus ref while keeping workflow state outside the row |
| `src/ui/components/BottomSheet.tsx` (new) | component | event-driven | `ConfirmationSheet`, `WorkoutStartSheet`, and Active Workout picker | composite | create one focus/IME/scrim frame and migrate callers |
| `src/ui/components/ConfirmationDialog.tsx` (new or colocated with BottomSheet) | component | event-driven | `ConfirmationSheet` in `src/ui/components/index.ts:815-929` | role-match | preserve caller-owned confirmation state behind shared safe frame |
| `src/ui/components/SemanticToast.tsx` (new) | component | event-driven | `InlineNotice` in `src/ui/components/index.ts:631-708` | partial; no host analog | create view plus queue/host without source authority |
| `src/ui/shell/AppRootShell.tsx` (new) | provider/component | event-driven | `app/(tabs)/_layout.tsx` + `app/_layout.tsx` + Today header trigger | composite | coordinate root focus, Settings sheet, and toast host without remounting Tabs |
| `src/ui/screens/AppSettingsContent.tsx` (new) | component | request-response | `SettingsScreen` body in `src/ui/screens/SettingsScreen.tsx:90-345` | exact extraction | extract one content tree for sheet and direct route |
| `src/ui/screens/SettingsScreen.tsx` | component | request-response | same file | exact | retain direct-route wrapper; render shared content under `App Settings` |
| `src/ui/screens/RootScreens.tsx` | component | event-driven | same file | exact | retain startup states; replace loading rail and Today-facing copy |
| `app/more/index.tsx` | route | request-response | same file | exact | retain runtime wiring and pushes; render shared settings content |
| `src/ui/screens/RemovedSessionsScreen.tsx` | component | CRUD | same file | exact | preserve command/reload order; correct copy, focus, busy identity, committed toast |
| `app/more/removed-sessions.tsx` | route | request-response | same file | exact | retain thin runtime adapter |
| `app/more/data-and-recovery.tsx` | route/component | file-I/O + event-driven | same file | exact | preserve automatic/manual/CSV state machines; restyle and move shared frames only |
| `app/more/automatic-backup-settings.tsx` | route/component | request-response | same file | exact | preserve facade calls and typed DELETE; move confirmations to shared dialog |
| `app/more/drive-backup-privacy.tsx` | route/component | request-response | same file | exact | retain exact privacy facts and back route |
| `app/more/manual-encrypted-backup.tsx` | route | request-response | same file | exact | retain thin wrapper around `ManualEncryptedBackupContent` |
| `src/ui/components/{AdvancedTimingConfigSheet,CalendarField,RestAlertSettingsSheet,TimeDurationField,WorkoutStartSheet}.tsx` | component | event-driven | shared frame assembled from current sheet implementations | role-match | replace duplicated Modal chrome; retain content state/actions |
| `src/ui/screens/{ActiveWorkoutScreen,LibraryScreen,WorkoutCompletionScreen}.tsx` | component | event-driven | their current Modal bodies | role-match | replace only frame plumbing; retain feature state machines |
| `src/ui/portability/{useManualBackupController,useCsvExportController}.ts` | hook | file-I/O + event-driven | same files | exact | retain unchanged unless an adapter-only type seam is required |
| `app/(tabs)/{index,calendar,library,progress}.tsx` | route | request-response | same thin adapters | exact | retain route keys and runtime delegation; do not move root state here |
| `src/ui/screens/{TodayScreen,CalendarScreen,LibraryScreen,ProgressScreen}.tsx` | component | request-response + event-driven | same files | exact | keep destination-specific state mounted; consume shared header/shell/tokens |
| `app/__tests__/root-layout.test.tsx` | test | event-driven | same file | exact | extend font/preference failure and provider-isolation assertions |
| `app/(tabs)/__tests__/_layout.test.tsx` | test | event-driven | same file | exact | invert rail/two-row expectations; assert four bottom tabs at every width |
| `src/ui/__tests__/foundation.test.tsx` | test | transform + event-driven | same file | exact | update token/font/adaptive/root and shared primitive contracts |
| `src/ui/shell/AppRootShell.test.tsx` (new) | test | event-driven | tab-layout + Foundation root-shell tests | composite | prove retained state, heading focus, settings origin, and toast host |
| `src/ui/components/BottomSheet.test.tsx` (new) | test | event-driven | Foundation confirmation focus test + RestAlert sheet tests | composite | prove entry/trap/return and every safe dismissal path |
| `src/ui/components/SemanticToast.test.tsx` (new) | test | event-driven | InlineNotice accessibility tests | partial; no placement/queue analog | prove queue, announcement, timing, reduced motion, and avoidance inputs |
| `src/platform/preferences/appearancePreferenceStore.test.ts` | test | CRUD | same file | exact | replace silent-fallback assertion with bounded read/write failure assertions |
| `src/ui/__tests__/{SettingsScreen,RestAlertSettingsSheet}.test.tsx` | test | event-driven + CRUD | same files | exact | retain persistence/readback tests; add shared-content/sheet/focus coverage |
| `src/ui/__tests__/RemovedSessionsScreen.test.tsx` | test | CRUD | same file | exact | assert selection identity, safe cancel, reload-before-toast, and focus fallback |
| `app/more/__tests__/index.test.tsx` | test | request-response | same file | exact | assert `App Settings` order and all preserved destinations |
| `app/more/__tests__/{data-and-recovery,automatic-backup-settings,drive-backup-privacy,manual-encrypted-backup}.test.tsx` | test | file-I/O + event-driven | same files | exact | preserve as regression suite; change only shared-presentation assertions |
| `src/bootstrap/workoutAppRuntime.test.tsx` | test | event-driven | same file | exact | preserve trusted-after-read, bounded failure, fresh retry, stale-generation coverage |
| `scripts/run-phase14-maestro.mjs` (proposed) | test/tooling | batch | `scripts/run-phase12-maestro.mjs` | role-match | bind every run to exact source, APK, package, device, and report hash |
| `scripts/verify-phase14-evidence.mjs` and `scripts/phase14-evidence-scripts.test.mjs` (proposed) | test/tooling | batch | Phase 12 verifier and evidence-script test | role-match | reject stale, missing, failed, skipped, duplicate, or unmapped evidence |
| `maestro/phase14/*.yaml` (proposed) | test | event-driven | `maestro/phase12/automatic-drive-backup.yaml` | role-match | use real native routes/states and one-to-one `shell.*` evidence IDs |

## Pattern Assignments

### Root shell: `src/ui/shell/AppRootShell.tsx`, `app/(tabs)/_layout.tsx`, `src/ui/components/index.ts`, `src/ui/screens/RootScreens.tsx`

**Primary analogs:** `app/(tabs)/_layout.tsx`, `app/_layout.tsx`, and the
existing `AppTabs` implementation.

**Imports/composition pattern** (`app/(tabs)/_layout.tsx:27-50`):

~~~tsx
<Tabs
  backBehavior={rootBackBehavior}
  initialRouteName="index"
  screenOptions={{
    headerShown: false,
    sceneStyle: { backgroundColor: colors.canvas },
    tabBarPosition,
  }}
  tabBar={(props) => (
    <AppTabs
      compactLayout={compactLayout}
      disabled={launchState !== "trusted"}
      navigation={props.navigation}
      position={expanded ? "rail" : "bottom"}
      state={props.state}
    />
  )}
>
  <Tabs.Screen name="index" options={{ title: "Today" }} />
  <Tabs.Screen name="calendar" options={{ title: "Calendar" }} />
  <Tabs.Screen name="library" options={{ title: "Library" }} />
  <Tabs.Screen name="progress" options={{ title: "Progress" }} />
</Tabs>
~~~

Retain `Tabs`, `backBehavior="history"`, `initialRouteName="index"`, the four
route keys, custom `tabBar`, scene background, and
`disabled={launchState !== "trusted"}`. Replace `tabBarPosition`,
`compactLayout`, rail/two-row props, and only the visible root label `Today`
with `Workout`.

**Navigation event pattern** (`src/ui/components/index.ts:1099-1132`):

~~~tsx
const selected = routeIndex === state.index;

function navigate() {
  if (disabled || route === undefined) {
    return;
  }
  const event = navigation.emit({
    type: "tabPress",
    target: route.key,
    canPreventDefault: true,
  });
  if (!selected && !event.defaultPrevented) {
    navigation.navigate(route.name);
  }
}

<FocusablePressable
  accessibilityLabel={destination.label}
  accessibilityRole="tab"
  accessibilityState={{ disabled, selected }}
  disabled={disabled}
  focusable={!disabled}
  onPress={navigate}
/>
~~~

Retain the navigator event and prevention contract. Replace the current
position/layout branching (`src/ui/components/index.ts:1057-1069,1097-1098,
1133-1141,1164-1187,1445-1479`) with one four-cell bottom composition and the
3dp selected underline.

**Shell/provider pattern** (`app/_layout.tsx:36-72`):

~~~tsx
<StartupReadinessGate
  launchState={runtime.launchState}
  notificationPermission={runtime.notificationPermission}
  onOpenSettings={() => {
    void runtime.openRestNotificationSettings();
  }}
  onRequestPermission={runtime.requestRestNotificationPermission}
>
  <>
    <Stack initialRouteName="(tabs)" screenOptions={{ animation: "fade", headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="more/index" />
      <Stack.Screen name="more/data-and-recovery" />
      <Stack.Screen name="more/automatic-backup-settings" />
      <Stack.Screen name="more/manual-encrypted-backup" />
      <Stack.Screen name="more/drive-backup-privacy" />
      <Stack.Screen name="more/removed-sessions" />
    </Stack>
    <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
  </>
</StartupReadinessGate>
~~~

`AppRootShell` should coordinate root-heading refs, the single App Settings
sheet, toast queue/host, and deep-route origin. It must wrap—not replace or
re-key—the existing mounted Tabs navigator. Preserve the development-test
navigator isolation in `app/_layout.tsx:76-124,162-208`.

**Existing state owners to retain:**

- Calendar owns `month` and `selectedDate` locally and fences async reads
  (`src/ui/screens/CalendarScreen.tsx:365-413`).
- Library owns per-section query/filter/selection plus a per-section
  `scrollOffsetsRef` (`src/ui/screens/LibraryScreen.tsx:1228-1283`), then feeds
  `scrollOffset` and `scrollRestoreKey` into AdaptiveScreen
  (`src/ui/screens/LibraryScreen.tsx:1852-1861`).
- Progress owns its selected period and reload generation
  (`src/ui/screens/ProgressScreen.tsx:640-670`).
- Route adapters stay thin and delegate to runtime
  (`app/(tabs)/calendar.tsx:13-34`,
  `app/(tabs)/library.tsx:22-63`,
  `app/(tabs)/progress.tsx:13-41`).

Do not lift these states into `AppRootShell` or key roots by appearance. The new
shell owns focus/origin coordination, not feature state.

### Root header and focus targets: `ScreenHeader` and `NavigationRow`

**Analog:** `FocusablePressable` in `src/ui/components/index.ts:215-264`.

~~~tsx
export const FocusablePressable = forwardRef<View, FocusablePressableProps>(
  function FocusablePressableElement(
    {
      disabled = false,
      onBlur,
      onFocus,
      onKeyDown,
      onPress,
      style,
      ...props
    },
    ref,
  ) {
    const { colors } = useAppTheme();
    const [focused, setFocused] = useState(false);
    const isDisabled = disabled === true;
    const keyboardProps = onKeyDown === undefined
      ? onPress === null || onPress === undefined
        ? {}
        : keyboardActivationProps(
            isDisabled,
            () => (onPress as unknown as () => void)(),
          )
      : { onKeyDown };

    return h(Pressable, {
      ...props,
      disabled: isDisabled,
      ...keyboardProps,
      onBlur: (event) => {
        setFocused(false);
        onBlur?.(event);
      },
      onFocus: (event) => {
        setFocused(true);
        onFocus?.(event);
      },
      onPress,
      ref,
      style: (state) => [
        typeof style === "function" ? style(state) : style,
        {
          outlineColor: colors.focusRing,
          outlineStyle: "solid",
          outlineWidth: focused ? sizes.focusRing : 0,
        },
      ],
    });
  },
);
~~~

Apply the same `forwardRef<View, ...>` convention to:

- the semantic heading focus target exposed by `ScreenHeader`;
- `NavigationRow` so a deep route can restore the exact initiating row;
- root Settings actions and sheet/dialog triggers.

Retain `ScreenHeader`'s one semantic heading and optional Back/action regions
(`src/ui/components/index.ts:481-536`), but replace its single
undifferentiated action limitation with ordered contextual actions and Settings
last. Use accessible name `Open App Settings`, not the current `Settings`
(`src/ui/screens/TodayScreen.tsx:466-478`).

`NavigationRow` remains render-only and keeps workflow state in its owner
(`src/ui/components/NavigationRow.tsx:9-20`). Retain full-row button semantics,
busy/disabled state, 48dp minimum, wrapping copy, and decorative chevron
(`src/ui/components/NavigationRow.tsx:29-63`).

### Appearance, tokens, fonts: `src/ui/theme/index.ts`, `assets/fonts/*`, `package.json`

**Analog:** the current single theme module and provider. Refactor it in place;
do not introduce a second token namespace.

**Bundled font map pattern** (`src/ui/theme/index.ts:15-31`):

~~~typescript
export const fontFamilies = {
  interfaceRegular: "SourceSans3_400Regular",
  interfaceSemiBold: "SourceSans3_600SemiBold",
  numericRegular: "IBMPlexMono_400Regular",
  numericSemiBold: "IBMPlexMono_600SemiBold",
} as const;

export const appFonts = {
  SourceSans3_400Regular:
    require("@expo-google-fonts/source-sans-3/400Regular/SourceSans3_400Regular.ttf"),
  IBMPlexMono_400Regular:
    require("@expo-google-fonts/ibm-plex-mono/400Regular/IBMPlexMono_400Regular.ttf"),
} as const;
~~~

Keep the synchronous local `require` map consumed by `useFonts`. Replace both
Source Sans mappings with local `ArchivoVariable` and remove IBM Plex Mono
semibold; keep `IBMPlexMono_400Regular`. Do not install a new font package.

**Token-shape pattern** (`src/ui/theme/index.ts:33-59,114-165`):

~~~typescript
export const space = {
  1: 4,
  2: 8,
  4: 16,
  6: 24,
  8: 32,
  12: 48,
  16: 64,
} as const;

export const sizes = {
  minimumTarget: 48,
  icon: 24,
  inlineIcon: 20,
  focusRing: 2,
} as const;

export const themes = {
  light: { /* semantic role values */ },
  dark: { /* same semantic role keys */ },
} as const;
~~~

Retain the exact 4dp spacing keys and same-key Light/Dark object structure.
Replace palette/type/radius values with the UI-SPEC values, raise
`sizes.focusRing` from 2 to 3, and expose aliases only through one explicit
mapping. Do not use `calendarStrengthTextLightCandidate` in a production style.

**Preference/resolved-scheme separation** (`src/ui/theme/index.ts:184-224`):

~~~typescript
export type AppearancePreference = "System" | "Light" | "Dark";
export type ResolvedColorScheme = "light" | "dark";

export function resolveColorScheme(
  preference: unknown,
  systemScheme: ColorSchemeName | null | undefined,
): ResolvedColorScheme {
  const parsedPreference = parseAppearancePreference(preference);
  if (parsedPreference === "Light") return "light";
  if (parsedPreference === "Dark") return "dark";
  return systemScheme === "dark" ? "dark" : "light";
}
~~~

**Live OS/reduced-motion subscription** (`src/ui/theme/index.ts:251-295`):

~~~typescript
useEffect(() => {
  const appearanceSubscription = Appearance.addChangeListener(({ colorScheme }) => {
    setSystemScheme(colorScheme);
  });
  const motionSubscription = AccessibilityInfo.addEventListener(
    "reduceMotionChanged",
    setSystemReduceMotion,
  );
  void AccessibilityInfo.isReduceMotionEnabled().then(setSystemReduceMotion);

  return () => {
    appearanceSubscription.remove();
    motionSubscription.remove();
  };
}, []);
~~~

Retain this provider/listener ownership so all mounted surfaces update
atomically. Do not remount a navigator, screen, sheet, or controller on theme
change.

**Storage identity to retain** (`src/platform/preferences/appearancePreferenceStore.ts:5-6,39-60`):

~~~typescript
export const APPEARANCE_PREFERENCE_KEY =
  "gym_tracker.appearance_preference.v1" as const;

export const productionAppearanceStore = createLazyAppearanceStore(
  () => new SQLiteStorage("gym-tracker-preferences.db"),
);
~~~

Replace the catch-and-return-null/no-op behavior at lines 18-35 with a bounded
read/write result that lets startup fail honestly or a failed selection revert
to the last authoritative value. Preserve the key, database name, lazy
construction, and persisted representation: `null` means System; `Light` and
`Dark` are explicit overrides.

**Asset provenance:** there is no current font-license/hash test. The directory
convention for vendored legal text is
`assets/content/third-party/kinetic-place-exercises-db.MIT.txt:1-21`. Add the
Archivo OFL beside the font and add a source/hash contract test; do not copy the
MIT license text.

### Adaptive screens: `src/ui/layout/AdaptiveScreen.tsx`

**Analog:** the current component is the exact owner.

**Width/inset pattern** (`src/ui/layout/AdaptiveScreen.tsx:20-48`):

~~~typescript
export type WidthClass = "compact" | "medium" | "expanded";

export function classifyWidth(width: number): WidthClass {
  if (width < 600) return "compact";
  if (width < 840) return "medium";
  return "expanded";
}

export function horizontalInsetFor(widthClass: WidthClass): number {
  switch (widthClass) {
    case "compact": return space[4];
    case "medium": return space[6];
    case "expanded": return space[8];
  }
}
~~~

Retain the 600/840 boundaries and 16/24/32 content insets. Width class may
change content columns only; it must no longer drive navigation placement.

**Single scroll owner and dock clearance** (`src/ui/layout/AdaptiveScreen.tsx:177-255`):

~~~tsx
<SafeAreaView
  edges={["top", "right", "bottom", "left"]}
  style={[styles.safeArea, { backgroundColor: colors.canvas }]}
>
  {scrollable ? (
    <>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          dock !== undefined && styles.scrollContentWithDock,
        ]}
        keyboardShouldPersistTaps="handled"
        ref={scrollViewRef}
      >
        {content}
      </ScrollView>
      {dock === undefined ? null : <View style={styles.stickyDock}>{dock}</View>}
    </>
  ) : content}
</SafeAreaView>
~~~

Retain safe-area ownership, one vertical ScrollView, `scrollRestoreKey` /
`scrollOffset` restoration (`src/ui/layout/AdaptiveScreen.tsx:85-140`), and
separate sticky dock. Add a measured header/toast anchor or explicit avoidance
inset only if the shell cannot measure those externally. Do not add nested
screen ScrollViews or fixed fake-status-bar offsets.

### Shared sheet: `src/ui/components/BottomSheet.tsx`

**Composite analogs:**

1. Heading focus and trigger restoration from
   `src/ui/components/WorkoutStartSheet.tsx:43-55,57-79`.
2. Safe-action-first confirmation focus from
   `src/ui/components/index.ts:815-856`.
3. Keyboard avoidance from
   `src/ui/screens/ActiveWorkoutScreen.tsx:2884-2967`.

~~~tsx
const headingRef = useRef<View>(null);

useEffect(() => {
  if (visible) {
    headingRef.current?.focus();
  }
}, [visible]);

function close() {
  onClose();
  restoreFocusRef?.current?.focus();
}

<Modal
  animationType={reduceMotion ? "none" : "fade"}
  onRequestClose={close}
  transparent
  visible={visible}
>
  <KeyboardAvoidingView behavior="padding" style={styles.modalBackdrop}>
    <ScrollView
      accessibilityViewIsModal
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  </KeyboardAvoidingView>
</Modal>
~~~

Copy the lifecycle shape, not the old geometry. Replace 48% scrim, 90% cap,
12dp corners, and missing top border at
`src/ui/components/index.ts:1418-1431` and
`src/ui/components/RestAlertSettingsSheet.tsx:340-354` with 68% scrim,
keyboard-safe maximum 82%, 24dp top corners, and 1dp top border.

The shared frame must newly implement what no existing file fully provides:
Escape handling, actual focus containment, scrim press through the same
no-write close path, background inertness, nested-sheet prevention, and
focus-visible heading/close behavior at 200% text. Do not claim a trap from
`accessibilityViewIsModal` alone.

### Confirmation dialog: `src/ui/components/ConfirmationDialog.tsx` or a BottomSheet specialization

**Analog:** `ConfirmationSheet`
(`src/ui/components/index.ts:815-929`).

Retain:

- safe action receives initial focus (`cancelRef` at lines 845-851);
- dismiss calls the supplied cancel callback, then restores trigger focus
  (lines 853-856);
- `onRequestClose` uses the same cancel path (lines 858-865);
- busy confirmation disables duplicate submission through action semantics
  (lines 919-925);
- caller owns domain state and exact action-specific labels.

Do not retain:

- generic `Cancel` where the approved contract supplies a specific safe label;
- a modal frame that lacks Escape/scrim handling or focus containment;
- a confirmation component that owns preflight tokens or mutation results.

For destructive/recovery state, copy the caller boundary, not the visuals:

~~~typescript
// src/ui/portability/useManualBackupController.ts:98-118
if (
  restoreState.kind !== "review"
  || confirmation !== "REPLACE"
  || restoreLatch.current
) return;

await inputRef.current.commitSecureRestore({
  token,
  confirmation: "REPLACE",
});

if (
  mergeState.kind !== "review"
  || confirmation !== "MERGE"
  || mergeLatch.current
) return;
~~~

Cloud deletion retains exact `DELETE` in
`app/more/automatic-backup-settings.tsx:14-20,52-56`. Removed history retains
the domain constant `RESTORE_HISTORY_CONFIRMATION` in
`src/ui/screens/RemovedSessionsScreen.tsx:111-125`.

### Semantic toast: `src/ui/components/SemanticToast.tsx`

**Closest partial analog:** `InlineNotice`
(`src/ui/components/index.ts:631-708`).

~~~tsx
const semanticColor =
  tone === "completed"
    ? colors.completed
    : tone === "attention"
      ? colors.timerAttention
      : tone === "error"
        ? colors.destructive
        : colors.textSecondary;

<View
  accessibilityLiveRegion={tone === "neutral" ? "none" : "polite"}
  style={styles.notice}
>
  {iconElement(noticeIcons[tone], semanticColor, iconLabel)}
  {/* heading, body, optional persistent action */}
</View>
~~~

Reuse the semantic tone mapping, written label/icon cue, theme tokens, and
live-region principle. Do not reuse `InlineNotice` placement or make it
transient.

There is no existing toast queue/host, top-bar measurement, 2400ms dwell,
150ms enter/exit, severity-specific polite/assertive announcement, or
workout-dock/IME avoidance. Implement those in the root-shell layer and keep
actionable failures inline. A toast can report only an authoritative result;
it cannot own navigation, mutation, persistence, or recovery state.

### Settings content: `src/ui/screens/AppSettingsContent.tsx`, `SettingsScreen.tsx`, `app/more/index.tsx`

**Analog:** extract the existing `SettingsScreen` content rather than rebuild
it.

The current content already has the required order:

- `Appearance` at `src/ui/screens/SettingsScreen.tsx:169-223`;
- `Rest alerts` at lines 225-308;
- `History and data` / Removed sessions at lines 310-326;
- `Data and recovery` at lines 328-345.

Retain the optimistic write queue and authoritative rollback behavior at
`src/ui/screens/SettingsScreen.tsx:90-160`. The runtime reinforces it by
write/readback comparison and post-commit lifecycle triggering at
`src/bootstrap/workoutAppRuntime.tsx:3403-3431`.

The direct route remains a thin adapter
(`app/more/index.tsx:26-80`):

~~~tsx
<SettingsScreen
  notificationPermission={runtime.notificationPermission}
  onBack={() => router.back()}
  onChangeRestAlertPreferences={async (nextPreferences) => {
    const result = await runtime.setRestAlertPreferences(nextPreferences);
    setPreferences(result.preferences);
    return result;
  }}
  onOpenDataAndRecovery={() => router.push("/more/data-and-recovery" as Href)}
  onOpenNotificationSettings={runtime.openRestNotificationSettings}
  onOpenRemovedSessions={() => router.push("/more/removed-sessions" as Href)}
  preferences={preferences}
  restAlertPreferencesLoading={loading}
/>
~~~

The root-triggered sheet and direct `/more/index` route must render the same
`AppSettingsContent` tree. The wrapper decides sheet versus route Back/close;
the content owns no router. Rename the heading to `App Settings` and use the
approved intro copy while preserving all routes.

### Startup: `app/_layout.tsx`, `src/ui/screens/RootScreens.tsx`, `src/ui/screens/RootFailureState.tsx`, runtime

**Font gate analog** (`app/_layout.tsx:126-160`):

~~~tsx
const [fontsLoaded, fontError] = useFonts(appFonts);

if (!fontsLoaded && fontError === null) {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <AppearanceProvider store={productionAppearanceStore}>
          <AppLoadingShell width={width} />
        </AppearanceProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
~~~

Retain the top-level font boundary and stable shell geometry. Replace the
current fall-through when `fontError !== null` with a bounded `Fonts` startup
failure; do not mount trusted runtime/content in fallback typography.

**SQLite trust and retry pattern**
(`src/bootstrap/workoutAppRuntime.tsx:2137-2159,2287-2397`):

~~~typescript
const initialize = useCallback(async () => {
  const generation = generationRef.current + 1;
  generationRef.current = generation;
  setState(initialState);
  await closeServices();

  let kernel: SqliteKernel;
  try {
    kernel = await dependencies.openKernel();
  } catch {
    if (generation === generationRef.current) {
      setState(failedState(
        "storage",
        "launch_openWriter_failed",
        "GT-WRITER01",
      ));
    }
    return;
  }
  // migrate, reconcile, lifecycle, first trusted read
}, [closeServices, dependencies, trustedRead]);
~~~

Retain generation fencing, closing stale services/kernels, migrations,
recovery reconciliation, lifecycle start, and the first trusted read before
`launchState: "trusted"` (`src/bootstrap/workoutAppRuntime.tsx:2090-2134`).
Retry remains a fresh `initialize()` call
(`src/bootstrap/workoutAppRuntime.tsx:4316-4318`).

**Bounded failure UI** (`src/ui/screens/RootFailureState.tsx:23-58`):

~~~tsx
<EmptyState
  body="Your saved data was not changed. Try again."
  heading="Workout data could not be opened"
  primaryAction={
    <PrimaryAction
      disabled={!failure.retryable}
      label="Retry opening workout data"
      onPress={onRetry}
    />
  }
  secondaryAction={
    <SecondaryAction
      label="View diagnostic code"
      onPress={() => setShowDiagnostic((visible) => !visible)}
    />
  }
/>
~~~

Retain bounded category/correlation output; never expose raw font, SQLite,
archive, provider, path, token, or account errors.

**Permission gate:** retain the dedicated notification setup and
continue-without-alerts flow in
`src/ui/screens/RootScreens.tsx:80-157` and the runtime's explicit request/update
path in `src/bootstrap/workoutAppRuntime.tsx:3433-3442`. Rest alerts remain
device settings; they do not become plan timing.

### Removed sessions: `src/ui/screens/RemovedSessionsScreen.tsx` and route

**Closest analog:** same screen and thin route.

**Load/error/empty pattern** (`src/ui/screens/RemovedSessionsScreen.tsx:91-100,133-157`):

~~~tsx
try {
  setSessions(await loadRemovedSessions());
  setState("ready");
} catch {
  setState("error");
}

<EmptyState
  body="Your saved workouts were not changed. Retry loading removed sessions."
  heading="Removed sessions could not be loaded"
  primaryAction={
    <PrimaryAction
      label="Retry loading removed sessions"
      onPress={() => void load()}
    />
  }
/>
~~~

Retain the source-backed list, effective revision, and
`RESTORE_HISTORY_CONFIRMATION`. Change empty action `Go back` to
`Return to App Settings` and confirmation safe action `Cancel` to
`Keep session removed`.

The existing command order at
`src/ui/screens/RemovedSessionsScreen.tsx:111-130` is:

~~~typescript
await restoreSession({
  sessionId: selected.id,
  expectedEffectiveRevision: selected.effectiveRevision,
  confirmation: RESTORE_HISTORY_CONFIRMATION,
});
onRestored(selected.id);
await load();
~~~

Keep the selected identity visible and the dialog busy on failure. Publish
`Workout restored` only after the authoritative reload succeeds. The route
must remain a thin runtime adapter
(`app/more/removed-sessions.tsx:13-24`).

### Data/recovery routes and controllers

**Analogs:** the existing routes and portability hooks are the behavior
contracts. Shared shell work should restyle them, not absorb their state.

**Controller-owned state and cleanup**
(`src/ui/portability/useManualBackupController.ts:60-122`):

- latch each create/restore/merge operation;
- fence late work with generation refs;
- discard stale/unshared archive handles;
- invalidate preflight tokens on cancel/unmount;
- distinguish committed `restored`/`merged` from `rebuild_pending`;
- require exact `REPLACE` and `MERGE` before commit.

`useCsvExportController` keeps the same handle/latch/generation pattern and
discards unconsumed handles on failure or unmount
(`src/ui/portability/useCsvExportController.ts:11-79`).

**Route rendering pattern:**

- `app/more/data-and-recovery.tsx:704-815` renders automatic backup state and
  links to automatic/manual recovery while CSV retains its own controller.
- `app/more/data-and-recovery.tsx:481-537` preserves restore review,
  `REPLACE`, busy, committed-ready, and rebuild-pending states.
- `app/more/data-and-recovery.tsx:595-649` preserves merge review,
  `MERGE`, committed-ready, and rebuild-pending states.
- `app/more/data-and-recovery.tsx:652-692` preserves CSV
  preparing/share/failure/retry states and readable-file warning.
- `app/more/automatic-backup-settings.tsx:24-63` preserves connection policy,
  stale-writer takeover, partial deletion recovery, disconnect, exact
  `DELETE`, and start-new-backup paths.
- `app/more/drive-backup-privacy.tsx:8-16` preserves readable JSON,
  Google-account protection, `drive.file`, and encrypted-GTBK distinction.
- `app/more/manual-encrypted-backup.tsx:1-7` remains a thin wrapper around the
  proven controller-backed content.

Move only sheet/dialog chrome to shared primitives. Keep the controller/hooks,
facade calls, exact phrases, reviewed counts, and durable completion semantics
in their current owners.

### Existing Modal owners: frame migration rule

Apply the shared `BottomSheet`/`ConfirmationDialog` frame to:

- `src/ui/components/index.ts` (`ConfirmationSheet`, `AppearanceSheet`);
- `src/ui/components/AdvancedTimingConfigSheet.tsx`;
- `src/ui/components/CalendarField.tsx`;
- `src/ui/components/RestAlertSettingsSheet.tsx`;
- `src/ui/components/TimeDurationField.tsx`;
- `src/ui/components/WorkoutStartSheet.tsx`;
- `src/ui/screens/ActiveWorkoutScreen.tsx`;
- `src/ui/screens/LibraryScreen.tsx`;
- `src/ui/screens/WorkoutCompletionScreen.tsx`.

Use `RestAlertSettingsSheet` as the content-ownership example: its optimistic
serialized write queue and authoritative rollback live at
`src/ui/components/RestAlertSettingsSheet.tsx:74-169`, while Modal/layout
chrome is isolated at lines 171-269. Migrate the latter only.

Use Active Workout's keyboard-aware picker as the IME example
(`src/ui/screens/ActiveWorkoutScreen.tsx:2884-2967`):

~~~tsx
<Modal onRequestClose={close} transparent visible={visible}>
  <KeyboardAvoidingView behavior="padding" style={styles.modalBackdrop}>
    <ScrollView
      accessibilityViewIsModal
      keyboardShouldPersistTaps="handled"
    >
      {/* content-owned controls */}
    </ScrollView>
  </KeyboardAvoidingView>
</Modal>
~~~

Do not copy its screen-local modal ownership into new files. Copy the
KeyboardAvoidingView/scroll semantics into the shared frame, then leave the
picker's query/selection/mutation state in ActiveWorkoutScreen.

## Test Pattern Assignments

| Target Test | Copy Structure From | Preserve | Replace / Add |
|---|---|---|---|
| `app/(tabs)/__tests__/_layout.test.tsx` | same file `:99-168,209-268` | mocked Tabs, Dimensions changes, selected state, D-pad Enter | expect bottom at 360/600/839/840/1024/1280 and 200%; label Workout; no rail/two-row |
| `src/ui/shell/AppRootShell.test.tsx` | tab-layout test + `foundation.test.tsx:703-1067` | RNTL role/state assertions | root heading focus, current-root reselect no reset, deep-route origin, Settings trigger return, toast host avoidance inputs |
| `src/ui/__tests__/foundation.test.tsx` | same file `:123-190,265-380` | exact object assertions, System resolution, boundary table | exact Revision 18 tokens, four type sizes, reusable 400/800 interface weights plus exact 890 condensed editorial oracle, 3dp focus, one bottom bar |
| `src/ui/components/BottomSheet.test.tsx` | `foundation.test.tsx:1299-1346` + `RestAlertSettingsSheet.test.tsx:23-106` | trigger-ref focus restoration, busy/inert content | heading/safe-action entry, tab containment, Escape/Back/scrim same cancel, no write, IME/scroll semantics |
| `src/ui/components/SemanticToast.test.tsx` | `foundation.test.tsx:1070-1139` | semantic tone/icon/live-region assertions | polite vs assertive, 150ms/reduced motion, 2400ms noncritical dwell, measured top/dock/IME avoidance, queue order |
| `app/__tests__/root-layout.test.tsx` | same file `:257-352` | font-gate provider isolation and width plumbing | font error must not mount runtime; preference read failure is bounded; loading nav always bottom |
| `src/platform/preferences/appearancePreferenceStore.test.ts` | same file `:14-54` | lazy SQLite construction, key, explicit Light/Dark, System removal | replace lines 56-72 silent-fallback expectation with typed failure/readback behavior |
| `src/ui/__tests__/SettingsScreen.test.tsx` | same file `:67-130,132-225` | section order, radios, 48dp controls, loading geometry, readback rollback | heading App Settings, shared content usable in route and sheet, intro copy, 3dp focus |
| `src/ui/__tests__/RestAlertSettingsSheet.test.tsx` | same file `:23-257` | serialized writes, rollback, clean reopen, denied notification path | render through shared frame and add focus/Back/Escape/scrim assertions |
| `src/ui/__tests__/RemovedSessionsScreen.test.tsx` | same file `:63-126` | load/empty/source context/exact revision/confirmation/failure | safe label, retained selected identity, post-reload toast, stable focus fallback |
| `app/more/__tests__/index.test.tsx` | same file `:45-98` | runtime read/write and exact nested routes | App Settings heading/order and same content from root sheet |
| `app/more/__tests__/data-and-recovery.test.tsx` | same file `:40-136` | exact facade state projection, reviewed merge, cellular prompt, separate recovery tools | shared visual primitives only |
| `app/more/__tests__/automatic-backup-settings.test.tsx` | same file `:21-54` | policy, disconnect, typed DELETE, stale/deletion/new-backup paths | shared confirmation frame and safe-action focus |
| `app/more/__tests__/drive-backup-privacy.test.tsx` | same file `:7-14` | privacy facts and no acknowledgement gate | shared typography/layout assertions only |
| `app/more/__tests__/manual-encrypted-backup.test.tsx` | same file `:373-450,556-696,699-817` | exact REPLACE/MERGE, latches, invalidation, rebuild pending, CSV handle cleanup, safe errors | shared frame/focus assertions only |
| `src/bootstrap/workoutAppRuntime.test.tsx` | same file `:3634-3711,3798-4028` | trusted after migration/read, explicit permission refresh, bounded codes, fresh retry, stale generation fencing | add appearance-readiness integration only if runtime owns the new bounded result |

**Representative test style** (`src/ui/__tests__/foundation.test.tsx:265-295`):

~~~typescript
expect(resolveColorScheme("System", "dark")).toBe("dark");
expect(resolveColorScheme("Light", "dark")).toBe("light");

await fireEvent.press(screen.getByRole("radio", { name: "Light" }));
expect(screen.getByTestId("appearance-mode")).toHaveTextContent("Light");
expect(screen.getByTestId("resolved-scheme")).toHaveTextContent("light");
expect(store.read()).toBe("Light");
~~~

**Root-width regression to invert**
(`app/(tabs)/__tests__/_layout.test.tsx:126-168`):

~~~typescript
it.each([
  ["bottom", 360, 720, "compact"],
  ["bottom", 600, 900, "medium"],
  ["bottom", 839, 900, "medium boundary"],
  ["left", 840, 900, "expanded boundary"],
  ["left", 1024, 900, "expanded portrait"],
  ["left", 1280, 720, "expanded landscape"],
])(/* ... */);
~~~

Keep the dimension-driven table, but every expected position becomes
`bottom`. Replace the separate 200%-text two-row assertion at lines 170-207
with one bottom bar whose height may grow while every tab remains full-width
within its equal quarter cell.

**Startup authority regression**
(`src/bootstrap/workoutAppRuntime.test.tsx:3634-3650,3798-3865`):

~~~typescript
expect(screen.getByTestId("runtime-state")).toHaveTextContent("trusted");
expect(runtimeDependencies.openKernel).toHaveBeenCalledTimes(1);
expect(runtimeDependencies.migrate).toHaveBeenCalledTimes(1);

expect(screen.getByTestId("runtime-state")).toHaveTextContent("failed");
await fireEvent.press(screen.getByRole("button", { name: "Retry runtime" }));
expect(screen.getByTestId("runtime-state")).toHaveTextContent("trusted");
expect(runtimeDependencies.openKernel).toHaveBeenCalledTimes(2);
~~~

Keep the current stale-generation tests at
`src/bootstrap/workoutAppRuntime.test.tsx:3867-4028`. Shell tests must not
replace them.

**Recovery confirmation regression**
(`app/more/__tests__/manual-encrypted-backup.test.tsx:373-418`):

~~~typescript
expect(screen.getByRole("button", { name: "Restore backup" })).toBeDisabled();
await fireEvent.changeText(
  screen.getByLabelText("Type REPLACE to continue"),
  "REPLACE",
);
const button = screen.getByRole("button", { name: "Restore backup" });
await fireEvent.press(button);
await fireEvent.press(button);
expect(mockCommitSecureRestore).toHaveBeenCalledTimes(1);
expect(mockCommitSecureRestore).toHaveBeenCalledWith({
  token: "opaque-token",
  confirmation: "REPLACE",
});
~~~

This is a retain-as-is behavior contract. Presentation migration must not
weaken the exact phrase or duplicate-submit latch.

### Native evidence tooling

If Phase 14 creates dedicated native runner/verifier files, copy the Phase 12
identity/staleness pattern:

~~~javascript
// scripts/run-phase12-maestro.mjs:25-42
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const head = command("git", ["rev-parse", "HEAD"]);
const source = command("node", [
  "scripts/source-tree-digest.mjs",
  "--assert-no-untracked",
]);
validatePhase12Manifest(manifest, head, source);
if (!existsSync(apk) || sha256(readFileSync(apk)) !== manifest.apk.sha256) {
  throw new Error("APK bytes are stale");
}
~~~

Retain exact source-tree/APK/package/build-profile binding, report hashes, and
rejection of failures/skips
(`scripts/run-phase12-maestro.mjs:12-55`;
`scripts/verify-phase12-evidence.mjs:40-98`). Phase 14 must map exactly the
13 `shell.*` IDs and add native cases for Light/Dark/System live change,
360/390/600/840 plus landscape, 200% text, 48dp targets, 3dp focus,
Back/Escape/scrim/IME safety, root-state retention, and DEV-02 native evidence against its accepted values.

## Shared Patterns

### Imports and ownership

- Use relative imports grouped as external React Native/Expo, domain/runtime
  types, shared UI, layout, then theme. Prefer `import type` for type-only
  dependencies, as in `SettingsScreen.tsx:18-42`.
- Route files obtain runtime and translate UI callbacks into `router.push` or
  `router.back`. Screens/components receive callbacks and do not import router.
- Shared primitives render state. Controllers/runtime own durable operations,
  preflight tokens, cancellation, latches, retries, and rebuild state.

### Accessibility and focus

- Reuse `FocusablePressable` for touch, Enter, and Space through one action
  (`src/ui/components/index.ts:100-117,215-264`).
- Preserve semantic roles/states: `tab` + selected, `radio` + checked/selected,
  `switch` + checked, `progressbar` + busy/disabled, and specific accessible
  names.
- Initial focus is heading-first except consequence dialogs, whose safe action
  is first. Every close path restores the exact trigger or a documented stable
  fallback.
- Existing screen/sheet code proves entry and return focus but not a complete
  trap. The new shared frame must own the missing traversal boundary.

### Error handling and source truth

- Catch raw platform/storage/domain errors at the owner boundary and project
  bounded copy/correlation codes; never render the caught message.
- Loading/failed UI preserves geometry and unaffected facts. It never invents
  zero values or success.
- Success toast timing follows command completion plus required authoritative
  refresh/rebuild. For removed history, the current order is command →
  `onRestored` → reload (`RemovedSessionsScreen.tsx:111-130`); enqueue only
  after reload.
- Theme, sheet, and toast state are presentation-only and must never become
  authority for backup, restore, merge, CSV, or workout completion.

### Testing conventions

- Component tests use React Native Testing Library queries by role, accessible
  name, accessibility state, and direct focus/key events.
- Route tests mock only Expo Router/runtime seams and assert exact pushes and
  facade calls.
- Runtime tests retain real async sequencing and fresh-generation fencing.
- Native evidence is required for glyph metrics, actual hit bounds, IME,
  D-pad/focus containment, safe areas, system appearance, and screenshot
  parity; Jest is preflight, not native acceptance.

## Replace vs Retain Checklist

| Replace | Retain |
|---|---|
| Visible root `Today` → `Workout` only | Route key `index` and semantic/date uses of Today |
| Expanded rail and 200%-text two-row nav | Expo Router Tabs, history Back behavior, selected route state |
| Source Sans 3 and IBM Plex Mono semibold | Local `useFonts` boundary and IBM Plex Mono regular numerals |
| Material-neutral theme values, 2dp focus | One theme provider, System preference/live OS listener, reduced-motion listener |
| 48% scrim, 90% cap, 12dp sheet corners | Content-owned validation, draft, mutation, and cancel behavior |
| Duplicated Modal frame code | Existing controller state machines and trigger refs |
| Generic Settings heading and root-only Today trigger | One settings content tree and every shipped recovery route |
| Silent appearance-store read/write fallback | Existing key, SQLite database, and explicit Light/Dark/null encoding |
| Toast absence / ad hoc transient status | Inline persistent actionable failures and authoritative completion order |
| Old tests that require rail/two-row/2dp/Today | Existing RNTL, runtime, recovery, and evidence identity patterns |

## No Exact Analog Found

| File / Capability | Role | Data Flow | Closest Partial Pattern | Planner Direction |
|---|---|---|---|---|
| `src/ui/components/SemanticToast.tsx` + shell host | component | event-driven | `InlineNotice` semantic tone/live-region behavior | build new queue, measurement, dwell, motion, and avoidance behavior; keep failures inline |
| Archivo variable-width native proof / font asset contract test | test/config | file-I/O + batch | local `appFonts` loading and content/evidence hash utilities | author and commit the deterministic 57px/condensed/wght-890/-0.07em harness first; run a separate clean-tree exact-HEAD proof with <=1 normalized physical-pixel metric tolerance and exact wrapping, then stop at a proposed-deviation owner checkpoint if it cannot match |

## Metadata

**Analog search scope:** `app/`, `src/ui/`, `src/bootstrap/`,
`src/platform/preferences/`, `assets/`, `scripts/`, `maestro/`, and Jest
configuration.
**Primary analog set:** `app/_layout.tsx`, `app/(tabs)/_layout.tsx`,
`src/ui/theme/index.ts`, `src/ui/layout/AdaptiveScreen.tsx`,
`src/ui/components/index.ts`, `src/ui/components/WorkoutStartSheet.tsx`,
`src/ui/components/RestAlertSettingsSheet.tsx`,
`src/ui/screens/RootScreens.tsx`, `src/ui/screens/SettingsScreen.tsx`,
`src/ui/screens/RemovedSessionsScreen.tsx`,
`app/more/data-and-recovery.tsx`, and their current tests.
**Pattern extraction date:** 2026-10-06
**Unavailable referenced inputs:** the two `~/.gstack/projects/gym_tracker/`
Markdown source documents named by `.trae/rules/rules.md` were not present in
this workspace environment; the checked-in owner brief, Phase 14 contracts,
live source, and tests provide the authoritative mapping used here.

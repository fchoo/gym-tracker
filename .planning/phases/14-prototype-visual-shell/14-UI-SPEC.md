---
phase: 14
slug: prototype-visual-shell
status: approved
reviewed_at: 2026-10-06T16:29:26+08:00
shadcn_initialized: false
preset: none
created: 2026-10-06
source_revision: 18
source_html_sha256: b5ddbad88fd465af2fa79475dc0c05efec49e551652f13c5220627730e1d9c96
source_approval_sha256: b8e91e3098ec443c9dc283ae8383d1af552d7dc2b83648695a01dcb8a89ff0bf
---

# Phase 14 — Prototype Visual Shell: UI Design Contract

> Canonical visual and interaction contract for the shared Revision 18 shell. This phase establishes the four roots, appearance, typography, semantic tokens, overlays, startup states, and preserved settings/recovery access that Phases 15–19 consume. It does not implement feature-specific Workout, Calendar, Library, Garmin, or Progress content.

---

## Contract Authority and Scope

Apply sources in this order:

1. `.planning/v1.2-OWNER-BRIEF.md` and the locked decisions in `14-CONTEXT.md`.
2. `.planning/design/v1.2-SOURCE-PRECEDENCE.md` and `.planning/design/v1.2-DEVIATIONS.md`.
3. External Revision 18 `approved.json`, latest revision first, then rendered `approved-hybrid.html` at the hashes in frontmatter.
4. `REQUIREMENTS.md` (`SHL-01`–`SHL-13`) and the Phase 14 success criteria in `ROADMAP.md`.
5. Existing native implementation patterns for behavior that the prototype does not demonstrate, especially startup, history, backup, recovery, focus, and keyboard handling.

The owner brief overrides the external JSON's stale `revision_status: awaiting_owner_review` only for use of Revision 18 as the planning target. It does not authorize implementation. SQLite source facts, exclusive-transaction acknowledgement, immutable history, offline workout behavior, and rebuildable caches remain authoritative over prototype simulations.

### Included

- Exactly four root destinations: `Workout`, `Calendar`, `Library`, and `Progress`.
- One bottom-navigation composition at every supported width; no automatic rail and no fifth root.
- Bundled Archivo variable typography, IBM Plex Mono numerals, exact Light/Dark semantic color source values, and System resolution.
- Shared headers, bottom sheets, confirmation dialogs, semantic notices, top toasts, focus behavior, and reduced-motion rules.
- Truthful font/database/bootstrap loading, trusted, failure/retry, notification-permission, and continue-without-alerts states.
- `App Settings` with Appearance first, plus retained Rest alerts, Removed sessions, Data and recovery, automatic Google Drive backup, manual encrypted backup/restore/merge, CSV export, and privacy routes.
- Common state and responsive contracts required by all 172 rows in the v1.2 parity matrix.

### Excluded

- Feature-owned layouts and business interactions for Workout/Active Workout (Phase 15), Calendar geometry/gestures (Phase 16), Library/Running authoring (Phase 17), Garmin import/detail (Phase 18), and Progress evidence (Phase 19).
- Domain migrations, concurrent-plan policy, FIT parsing, and source-fact writes (Phase 13 and later owners).
- Profile, Running, or Garmin as a root; in-app run recording; cadence/rest-between-reps; plan-owned sound/haptics; generic Material substitutions.
- Prototype review chrome, fake status bar, fixture dates/data, `Reset demo`, preview-error controls, `localStorage`, and simulated delays.
- DEV-01 Calendar geometry, which belongs to Phase 16. DEV-02 is surfaced below only as an unaccepted shared-token checkpoint.

### Owner checkpoint: DEV-02 remains proposed

`DEV-02` is not accepted. The approved Light Strength event-title source value remains `#D97820`. A candidate token named `calendarStrengthTextLightCandidate` may be declared as `#9B470B` for comparison and contrast tests, but it must be unused and clearly marked `PROPOSED — OWNER DECISION REQUIRED`. No plan or executor may alias the production Strength-title token to that candidate, claim the color change is approved, or close CAL-03/VER-04 until the owner records a decision in `v1.2-DEVIATIONS.md`.

---

## Design System

| Property | Contract |
|---|---|
| Tool | Repository-owned Expo 57 / React Native 0.86 native theme and primitives |
| Preset | Not applicable — this is not a React web/shadcn surface |
| Component library | Existing native primitives in `src/ui/components`, `src/ui/layout/AdaptiveScreen.tsx`, and `src/ui/theme`; extend them rather than create a parallel system |
| Navigation | Expo Router with one four-item bottom tab shell plus stack-owned deep routes |
| Icon library | Existing `lucide-react-native` 1.31.0; 24dp standard and 20dp inline, 2dp stroke, decorative duplicates hidden from accessibility |
| Interface font | Bundled `Archivo` variable font; no network font request and no silent system-font substitution after trusted startup |
| Numeric font | Bundled `IBM Plex Mono`; tabular numerals for dates, times, weights, reps, distance, pace, counts, and confirmation facts |
| Appearance | Persisted `System`, `Light`, and `Dark`; System follows live OS changes and resolves every root, deep route, sheet, dialog, toast, status bar, and dock together |
| Visual direction | Warm editorial paper in Light; dark precision instrument in Dark; restrained flat surfaces, strong typographic hierarchy, fine rules, no gradients, glass, nested cards, or decorative dashboards |
| shadcn gate | Not applicable: `components.json` is absent and the target is Expo/React Native rather than React/Next.js/Vite web |

### Reuse and replacement boundary

- Reuse `AppearanceProvider`, `FocusablePressable`, action primitives, `ScreenHeader`, `SectionHeader`, `EmptyState`, `InlineNotice`, `SkeletonBlock`, `ConfirmationSheet`, `AppTabs`, and `AdaptiveScreen` behavior where it already satisfies this contract.
- Replace Source Sans 3 references with `assets/fonts/Archivo-VariableFont_wdth,wght.ttf`, loaded as `ArchivoVariable` from `appFonts`. Keep the existing locally packaged `IBMPlexMono_400Regular` numerical face. Both are packaged into the native artifact and gated by the existing `useFonts` startup boundary; neither may load over the network.
- Replace `Today` with `Workout` in the root destination contract.
- Remove the `>=840dp` rail branch and the two-row bottom-nav branch. Width classes may change content inset or content-column arrangement, but never navigation position, root count, or root order.
- A screen may not declare private colors, font families, focus rings, sheet frames, toast frames, or root-navigation styling. Feature phases consume shared semantic tokens and primitives from this phase.

---

## Visual Hierarchy

| Surface | Primary visual anchor | Supporting hierarchy |
|---|---|---|
| Root shell | Current root title and that root's primary source-backed content/action | Settings stays a 48dp supplementary header action; bottom navigation is persistent but visually subordinate until selected |
| Workout root | Editorial workout identity and primary Start/Resume action | Day/context controls, exercise preview, and Running/Garmin entries follow; no card mosaic |
| Active Workout consumer | Current exercise/set and command/rest dock | Session identity remains visible; toasts never compete with or cover the dock |
| Calendar consumer | Month/focused-week spatial surface | Info immediately precedes Settings; bottom navigation remains anchored below the full-height Calendar |
| Library consumer | Current Plans/Exercises view, Search, and results | Creation/filter sheets are contextual overlays, not new roots |
| Progress consumer | Current sport/range and factual primary metric | Details/recommendations open contextually and retain the originating selection |
| Settings/recovery | Current route heading and one current decision or recovery state | Other settings remain sequential navigation rows; dangerous choices are visually isolated and require exact confirmation |
| Startup | One truthful readiness state | Disabled shell chrome may preserve geometry, but it cannot imply source data is ready |

Every icon-only action has an accessible name and a visible text fallback in the containing heading or row. Color never carries destination, status, error, selected, completed, or destructive meaning alone.

---

## Spacing Scale

The shared layout scale contains only the standard 4dp-grid values.

| Token | Value | Usage |
|---|---:|---|
| `space.1` | 4dp | Icon/label and inline semantic gaps |
| `space.2` | 8dp | Compact row gaps and internal action spacing |
| `space.4` | 16dp | Default compact content inset and component padding |
| `space.6` | 24dp | Section separation and medium-width inset |
| `space.8` | 32dp | Expanded-width content inset and major layout gap |
| `space.12` | 48dp | Minimum interactive dimension and major empty-state separation |
| `space.16` | 64dp | Maximum section separation and dock scroll clearance |

Exceptions: none in the spacing token scale. Prototype CSS measurements such as the 57px top bar, 74px bottom navigation, 82% sheet cap, and 50px toast are component geometry, not reusable spacing tokens. Native visual comparison must preserve their perceived geometry while safe-area insets and 48dp targets remain authoritative.

### Component geometry

| Element | Contract |
|---|---|
| Required interactive target | At least 48 × 48dp, non-overlapping, in every theme, width, orientation, and 200% text mode |
| Root bottom navigation | Four equal-width cells in one bottom composition; 74dp baseline plus safe-area inset; expand vertically for wrapped labels rather than clip or become a rail |
| Root header | Safe-area-aware, 56dp content height; title left, contextual actions right; Settings last, Calendar Info immediately before it |
| Root content | 16dp compact inset, 24dp medium inset, 32dp expanded inset; readable content may be centered but the bottom nav spans the safe width |
| Sheet | Bottom anchored, maximum 82% of keyboard-safe height, vertically scrollable, 24dp top corners, 1dp top border, 68% black scrim |
| Toast | At least 50dp high; 16dp internal horizontal padding; 12dp radius; 1dp border; 4dp semantic leading bar; horizontal inset 16dp |
| Focus ring | 3dp semantic blue outline with 4dp visual clearance; never clipped by parent overflow |
| Borders | 1dp standard rules; 2dp emphasized section/status rule; 3dp selected-navigation underline; 4dp structural active-exercise/toast accent only |

---

## Typography

Declare exactly four semantic sizes and two weights. Sizes below are the default-scale native values; Android font scaling remains enabled.

| Role | Family | Size | Weight | Line Height | Usage |
|---|---|---:|---:|---:|---|
| Supporting / mono | Archivo or IBM Plex Mono | 14sp | 400 | 20sp | Secondary facts, compact metadata, timestamps, codes |
| Body / control | Archivo or IBM Plex Mono | 16sp | 400 | 22sp | Body copy, root-nav labels, inputs, status copy, ordinary numerical facts |
| Heading / action | Archivo | 20sp | 800 | 24sp | Screen/header identity, section emphasis, primary action labels |
| Editorial display | Archivo variable, condensed width axis | 57sp | 800 | 49sp | Workout root identity only; wrap within the vertical scroll region when width or 200% text cannot hold one line |

Rules:

- The only font weights are 400 and 800. IBM Plex Mono uses 400 for facts; emphasis remains Archivo 800 rather than adding a third numerical weight.
- Bundle both families in the application package and load them before the trusted shell. Never depend on Google Fonts network loading.
- Use IBM Plex Mono only for data-like text: dates, times, counts, weights, reps, distances, paces, percentages, ordinals, and diagnostic/correlation codes. Prose and buttons use Archivo.
- Body line height is 1.375 (`22/16`). Heading line height is 1.2 (`24/20`). Editorial display line height is 0.86.
- Required names and actions wrap. Two-line truncation is allowed only for repeated collection-row titles when the full value remains in the accessible name and opening the row reveals it. Never truncate an error, destructive consequence, primary action, confirmation phrase, or recovery instruction.
- Archivo width/weight-axis behavior and Android glyph metrics require native screenshot comparison; do not emulate condensed display type with horizontal transforms.

---

## Color

### 60 / 30 / 10 allocation

| Allocation | Light | Dark | Usage |
|---|---|---|---|
| Dominant 60% | `paper #FFFAF0` | `paper #080808` | Root canvas, continuous reading space, navigation ground |
| Secondary 30% | `bone #F4F0E6`, `surface #F0EADF`, `raised #FFFAF0` | `surface #151515`, `raised #202020` | Sheets, grouped rows, restrained cards, neutral state layers |
| Accent 10% | `orange #D97820`; action/focus blue `#195FAE` | `orange #D97820`; action/focus blue `#71AAFF` | Orange only for Workout primary emphasis, selected-root underline, and Strength identity; blue only for focus, selected choices, navigable emphasis, Running identity, and progress lines |
| Destructive | native-only recovery text/border `#B42318` | `#FF8279` | Destructive/error text, icon, border, and confirmation only; always paired with words/icon |

Orange and blue are separate semantic channels, not two decorative accents: orange identifies Strength and the Workout action hierarchy; blue identifies Running plus navigation/focus/selection. Green and yellow are state colors, never general accents.

### Exact source token map

| Token | Light | Dark | Contract |
|---|---|---|---|
| `paper` | `#FFFAF0` | `#080808` | Main canvas and bottom navigation |
| `bone` | `#F4F0E6` | `#151515` | Surrounding/secondary surface |
| `ink` | `#0D0C0A` | `#F7F7F2` | Primary text and inverse controls |
| `quiet` | `#655F56` | `#AAA9A2` | Secondary copy only |
| `clay` | `#D8C3AB` | `#6D665C` | Warm neutral detail |
| `surface` | `#F0EADF` | `#151515` | Cards, rows, controls, sheets |
| `raised` | `#FFFAF0` | `#202020` | Raised sheet/dialog surface |
| `line` | `#CEC6B8` | `#333330` | Borders and dividers |
| `lightLine` | `#CEC6B8` | `#333330` | Hairline alias used where the source distinguishes light-shell rules |
| `dark` / inverse surface | `#FFFAF0` | `#080808` | Inverse control text/surface pairing |
| `text` | `#0D0C0A` | `#F7F7F2` | Content text on shared surfaces |
| `muted` | `#655F56` | `#AAA9A2` | Supporting content |
| `orange` | `#D97820` | `#D97820` | Strength and Workout emphasis |
| `orangeDark` | `#281306` | `#281306` | Text on orange primary fill |
| `green` / `greenBg` | `#166B4C` / `#DCECDF` | `#72DF92` / `#14271A` | Completed/success only |
| `yellow` / `yellowBg` | `#8D5D00` / `#FFF0C2` | `#F0C84B` / `#2A2410` | Current/attention only |
| `blue` / `blueBg` | `#195FAE` / `#DCE9F9` | `#71AAFF` / `#14243B` | Running, focus, selected choices, links |
| `toastBg` | `#FFFAF0` | `#202020` | Toast surface |
| `toastBorder` | `#CEC6B8` | `#3D423E` | Toast border |
| `toastText` | `#0D0C0A` | `#F7F7F2` | Toast copy |
| `toastAccent` | `#166B4C` | `#72DF92` | Success toast leading bar; substitute the matching semantic state token for warning/error |
| `dangerSource` | `#FF8279` | `#FF8279` | Exact prototype source value; usable on dark surfaces only |
| `shadow` | `0 28 76 rgba(30,24,16,0.20)` | `0 28 76 rgba(0,0,0,0.45)` | Prototype review depth; native elevation/shadow must match perceived result without creating nested elevation |
| `calendarStrengthTextLightCandidate` | `#9B470B` | not applicable | `PROPOSED — OWNER DECISION REQUIRED`; unused until DEV-02 is accepted |

The Light destructive value extends the prototype language for native-only recovery states; the prototype does not provide a Light `danger` override. It reuses the shipped accessible native value rather than the prototype's dark-oriented `#FF8279` as Light text.

### Accent reservation and state encoding

- Orange is reserved for the Workout primary action, selected-root underline, Strength identity/border, and explicit Strength event treatment.
- Blue is reserved for visible focus, selected radio/segmented choices, actionable inline links, Running identity, and source-backed chart lines.
- Green is reserved for committed completion/success. Yellow is reserved for current/rest/attention. Red is reserved for destructive/error.
- Selected, complete, partial, planned, warning, error, and destructive states always add text, an icon, a border/pattern, or programmatic state. No state is color-only.
- Disabled controls retain readable copy and a disabled state; do not use opacity alone.
- Normal text must meet 4.5:1 and large text/non-text UI 3:1. DEV-02 remains the sole recorded pending color deviation and may not be silently resolved in tokens.

---

## Shared Component Inventory

| Primitive / surface | Required contract | Consumers |
|---|---|---|
| `AppRootShell` / `AppTabs` | Exactly four ordered destinations; persistent bottom placement; selected icon, label, `tab` state, and orange underline; disabled only while startup authority is unavailable | All roots and contextual Garmin composition |
| `ScreenHeader` | One semantic heading; optional 48dp Back; contextual actions ordered before Settings; heading receives focus after root/deep-route transitions | Roots, settings, recovery, downstream details |
| `AdaptiveScreen` | One vertical scroll owner, safe-area-aware insets, dock clearance, retained/restored scroll key; may center/widen content without moving root navigation | Every screen and deep route |
| `FocusablePressable` | Touch, Enter, Space, D-pad, TalkBack activation through the same command; 48dp target; visible 3dp focus; disabled/busy prevents duplicate activation | All actions and navigation |
| `BottomSheet` | Bottom anchored, scrim, heading-first focus, modal accessibility isolation/trap, keyboard avoidance, scrollable body, Back/Escape/close/scrim cancel, trigger-focus restoration | Appearance, filters, pickers, history, target/recommendation, conflict, Active/Garmin actions |
| `ConfirmationDialog` | Consequence-first copy, safe action initially focused, explicit action-specific cancel and confirm labels, no background activation, no write on dismiss | Cloud deletion/disconnect, restore/merge, removed-history restore, later feature confirmations |
| `SemanticToast` | Theme-aware top placement, 4dp semantic leading bar, 150ms enter/exit, polite/assertive announcement by severity, no source-authority role, no dock overlap | Roots, Active Workout, Garmin, settings/recovery |
| `EmptyState` | Specific heading, explanation, and next action; preserve surrounding navigation and selected filters/date/context | Removed sessions and all downstream list/media surfaces |
| `SkeletonBlock` / busy state | Stable geometry, one concise `progressbar`/live announcement for the region, hidden decorative blocks, no fake zero values | Font/database startup, settings, lists, detail/read models |
| `InlineNotice` | Written heading/body, semantic icon, optional specific recovery action; preserve unaffected content | Error, attention, stale/rebuilding, permission, offline/recovery |
| `SemanticNumber` | IBM Plex Mono with tabular numerals and unit included in visual/accessibility label | Timers, dates, weights, reps, distance, pace, counts |

No feature phase may introduce a screen-local clone of these primitives or a second token namespace.

### SHL requirement traceability

| Requirement | Contract location | Completion evidence expected by the planner |
|---|---|---|
| SHL-01 | Root Shell and Navigation | Four labels/order, bottom composition at every width, no fifth root/rail |
| SHL-02 | Root Shell and Navigation; Responsive/focus | Retained destination state, heading focus, deep-route exit and trigger restoration |
| SHL-03 | Appearance | Persisted Light/Dark/System and live System changes across all surfaces |
| SHL-04 | Design System; Spacing; Typography; Color | Bundled font load plus exact token/component screenshots |
| SHL-05 | Sheets and Dialogs | Modal isolation, scrim, keyboard avoidance, Back/Escape, focus entry/return |
| SHL-06 | Toasts | Theme/status announcement and no header/dock/IME overlap |
| SHL-07 | Startup | Loading, trusted, failure/retry, permission, denied and continue states |
| SHL-08 | Appearance and Rest Alerts | Rest sound/vibration/notification settings remain device-owned and reachable |
| SHL-09 | Settings Route Contract | Removed sessions and Data and recovery remain reachable from App Settings |
| SHL-10 | Removed Sessions | Loading, empty, error/retry, review, busy/failure and committed success |
| SHL-11 | Data and Recovery | Automatic status/recovery plus CSV prepare/share/cancel/error/retry |
| SHL-12 | Automatic Backup | Connect/disconnect, policy, takeover, partial deletion, new backup and privacy |
| SHL-13 | Manual Backup | Encrypted export and restore/merge preflight, exact confirmation, progress and rebuild recovery |

---

## Root Shell and Navigation Contract

1. The root order and labels are exactly `Workout`, `Calendar`, `Library`, `Progress`. `Today` is not a root label. Profile, Running, Garmin, Settings, and recovery routes are never root tabs.
2. The bottom navigation remains at the bottom for compact `<600dp`, medium `600–839dp`, expanded `>=840dp`, portrait, landscape, and 200% text. A side rail is prohibited without an owner-reviewed deviation.
3. Each item is an equal-width 48dp-minimum target with Lucide icon above a visible label. At 200% text, the bar grows vertically and labels may wrap to two lines; icons, full names, selection, and all four destinations remain visible.
4. The selected root exposes `accessibilityRole="tab"`, `selected: true`, primary ink/icon treatment, and a 3dp orange underline. Unselected roots use quiet/muted text and remain fully readable.
5. Switching roots changes in place and preserves each destination's query, filter, selected date/range, expanded/collapsed state, and scroll position for the current process lifetime. Re-selecting the current root does not reset it.
6. Selecting a different root while a deep route or sheet is open first dismisses/exits that context without mutation, then restores the destination's retained state and moves accessibility/keyboard focus to its heading.
7. Back from a deep route returns to its owning root with the originating selection/scroll and trigger focus. Android Back follows stack history; it never cycles root tabs or discards a draft without its existing confirmation.
8. Startup may render the shell geometry with all four tabs disabled. It must not expose enabled navigation until SQLite is trusted.

---

## Appearance Contract

- `App Settings` opens as the approved contextual bottom sheet from the Settings icon in every root header. Appearance is the first section and contains exactly `System`, `Light`, and `Dark` as one radio group. Preserved settings rows may push their existing stack routes; direct navigation to `/more/index` renders the same ordered content as a full route rather than a second settings design.
- Persist the preference, not merely the resolved color. `System` remains selected while the resolved theme changes live with the OS.
- One provider owns theme state. Roots, Active Workout, contextual Garmin, all deep routes, sheets/dialogs, toasts, status/navigation bars, loading shells, and recovery states change atomically.
- On cold start, resolve the persisted preference before revealing trusted content. Do not flash the opposite theme. A font/theme read failure enters the truthful startup failure treatment rather than silently substituting a different design system.
- Theme changes do not close a sheet, reset a draft, clear root state, restart a query, change a timer deadline, or navigate.
- The same semantic role has the same meaning in Light and Dark; status is never inverted merely because the palette changes.

---

## Sheets, Dialogs, Toasts, and Motion

### Bottom sheets

- Open from the initiating control and save a stable focus-return reference. Focus moves to the semantic sheet heading; if a destructive dialog has a safe action, focus that safe action instead.
- Present a 68% black scrim and one bottom sheet. Background content is inaccessible and cannot receive touch/keyboard activation while the sheet is open.
- Close icon has an action-specific accessible label such as `Close App Settings`, `Close Calendar key`, or `Close exercise picker`. Android Back, Escape, close, and scrim all take the same no-write dismissal path unless the flow already requires an unsaved-change decision.
- Sheet body scrolls vertically within the keyboard-safe height. Focused inputs/actions are scrolled above the IME; the header and close action remain reachable at 200% text and landscape.
- Nested sheets are prohibited. Replace the current sheet or navigate to a stack route while preserving the original trigger context.

### Confirmation dialogs

- Confirmation heading names the action; body states source-fact consequences; safe and destructive/affirmative actions use specific labels.
- Dismissal never performs a write. Busy confirmation disables every competing submission until the authoritative result returns.
- Restore/merge preflight tokens, reviewed counts, and entered confirmation phrase remain visible on recoverable failure; stale preflight returns to a new review rather than applying old facts.

### Toasts and announcements

- Place root toasts below the root header and Active/Garmin toasts below their top bars. Compute from safe-area plus header geometry; never hard-code under a fake status bar.
- Toasts never cover the bottom navigation, Add/Complete command row, rest dock, sheet actions, focused input, or software keyboard.
- Use 150ms opacity/8dp vertical transition. Under reduced motion, show/hide without translation and without delaying state changes.
- Success/neutral notices may auto-dismiss after 2400ms. Errors that require action are inline and persistent; a toast may announce them but may not be the only retry route.
- Use `polite` for success/progress and `assertive` for a blocking failure. Do not announce the same text twice through overlapping live regions.

---

## Startup Contract

| State | Visual and interaction contract | Exact copy/actions |
|---|---|---|
| Fonts/database loading | Stable warm/dark shell skeleton; four root items visible but disabled; one busy/progress announcement; no fabricated workout values | `Opening workout data` |
| Trusted | Remove skeleton only after bundled fonts are ready and SQLite trust/rebuild gates pass; enable roots; restore the last valid root and appearance | No transient success toast required |
| Source open failure | Full-height error within shell geometry; source facts unchanged; diagnostic code secondary and copyable/readable; no enabled feature actions | `Workout data could not be opened` / `Your saved data was not changed. Try again.` / `Retry opening workout data` / `View diagnostic code` |
| Notification permission undecided | Dedicated setup surface after trust; the workout system remains explicitly usable without permission | `Get rest alerts when the app is in the background` / `Enable notifications` / `Continue without alerts` |
| Notification denied | Explain that in-app timer remains accurate and background alerts are off | `Notifications are off` / `Open notification settings` / `Continue without alerts` |
| Retry in flight | Preserve error context, disable repeated retry, expose busy state, and announce progress | `Opening workout data` |

Font load failure follows the source-open failure hierarchy with diagnostic classification `Fonts`; it must not reveal trusted content in a fallback font.

---

## Settings and Recovery Route Contract

### Route hierarchy

| Route | Heading and entry | Required content/order | Back/focus result |
|---|---|---|---|
| `/more/index` | `App Settings`; root launch uses the shared bottom-sheet presentation and direct/deep-link launch uses this route shell | `Appearance` first; then `Rest alerts`; then `History and data`; then `Data and recovery` | Sheet close returns to the exact Settings trigger; deep-route Back returns to the owning root with retained state |
| `/more/removed-sessions` | `Removed sessions` from History and data | Loading, true empty, removed-session list, restore review, busy/failure/success | Return to `Removed sessions` row; restored item disappears only after committed result/reload |
| `/more/data-and-recovery` | `Data and recovery` | Automatic backup status/recovery, automatic settings entry, manual encrypted backup entry, CSV export state | Return to `Data and recovery` row; preserve active operation/status |
| `/more/automatic-backup-settings` | `Automatic backup settings` | Google account, connection policy, privacy, takeover/deletion recovery, disconnect/new-backup/cloud-delete confirmations | Return to Automatic backup row/status |
| `/more/drive-backup-privacy` | `Drive backup privacy` | Exact readable-JSON/account-protection/`drive.file`/manual-GTBK distinction | Return to privacy row |
| `/more/manual-encrypted-backup` | `Manual encrypted backup` | Create/share encrypted backup; Restore clean; Import / merge backup; preflight/review/progress/rebuild/error states | Return to manual backup row; preserve only durable results, never stale file handles |

### Appearance and rest alerts

- `Appearance` is the first visible settings section. The selected choice has checked/selected programmatic state, blue selected border/background, and a visible check—not color alone.
- `Rest sound` and `Rest vibration` remain device-level switches. While loading, use two stable skeleton rows and one `Loading rest alert settings` busy announcement.
- Save failure says `Rest alert setting was not saved` and `Your saved rest alert setting was not changed. Try the switch again.` The switch reverts to the authoritative value.
- When permission is denied, show `Background rest alerts are off`, explain that the in-app timer remains accurate, and provide `Open notification settings`.

### Removed sessions

- Empty: `No removed sessions` / `Workouts removed from history stay here until you restore them.` / `Return to App Settings`.
- Load failure: `Removed sessions could not be loaded` / `Your saved workouts were not changed. Retry loading removed sessions.` / `Retry loading removed sessions`.
- Restore review: `Restore this workout?`; body states that Calendar, history, records, and recommendations return only after the saved restore commits; safe action `Keep session removed`; confirm `Restore workout`.
- During restore, keep the dialog and selected session identity visible with `Restore workout` busy. Failure says `Restore failed. The workout remains removed. Try restore again when ready.` and preserves a retry. Success removes the row after authoritative reload and announces `Workout restored`.

### Data, backup, restore, merge, CSV, and privacy

| Flow/state | Contract and exact actions |
|---|---|
| Automatic backup status | Show one of `Not connected`, `Ready to start cloud backup`, `Backup pending`, `Backing up`, `Backed up`, `Restore required`, `Backup moved to another phone`, `Changes not backed up for 24h`, `Update required`, `Review merge`, `Backup needs attention`, `Sign in again`, `Cloud backup deleted`, or `Deleting cloud backup`; retain last verified backup time when available; recovery CTA is `Retry automatic backup` |
| Automatic recovery | Use `Use latest backup` / `Use previous backup`, then `Review cloud merge`; no durable write before `Merge workouts`; safe action `Cancel cloud recovery`; rebuild/status remains visible |
| Connectivity policy | `Any connection` row states either `Use Wi-Fi only` or `Wi-Fi and cellular data`; cellular exception asks `Use cellular data for this backup?` with `Use cellular this time` and `Keep Wi-Fi only` |
| Disconnect | First action `Disconnect Google Drive…`; confirmation explains local workouts and cloud backups remain; actions `Keep Google Drive connected` and `Disconnect Google Drive` |
| Cloud deletion | `Delete cloud backup…`; explain permanent cloud-snapshot removal and local retention; require exact `DELETE`; actions `Keep cloud backup` and `Delete cloud backup` |
| New cloud backup | `Start a new cloud backup…`; explain fresh authentication/identity; actions `Start a new cloud backup` and `Keep cloud backup deleted` |
| Partial/stale recovery | `Use this phone for backup…`, `Finish deleting cloud backup`, `Check again`, `Cancel checking`, and `Finish backup setup` appear only for their factual state |
| Privacy | State that automatic Drive backups are readable JSON, protected by the Google account, request `drive.file`, and differ from password-encrypted manual GTBK exports |
| Create encrypted backup | `Create secure backup`; password and `Confirm password`; preparing exposes `Cancel backup`; ready exposes `Share backup`; failures use `Try creating backup again` or `Create another backup` and state saved facts were unchanged |
| Restore clean | `Restore clean`; file selection and password precede `Review restore clean`; show source version/date and replacement counts; require exact `REPLACE`; actions `Restore backup` and `Cancel restore clean` |
| Restore result | `Restoring backup`; success `Backup restored. Search and progress are ready.`; rebuild-pending `Backup restored. Recalculating search and progress.` with `Retry rebuild`; failure retains review/password and supplies `Try restore clean again` |
| Import / merge | `Import / merge backup`; review inserted/duplicate/winner/remap/conflict counts; state `No changes have been made yet.`; require exact `MERGE`; actions `Merge backup` and `Cancel merge` |
| Merge result | `Merging backup`; success `Merge complete. Search and progress are ready.`; rebuild-pending `Merge saved. Recalculating search and progress.` with `Retry rebuild`; failure preserves review and supplies `Try merge again` |
| CSV | `Export CSV`; explain readable/not password-protected; preparing/sharing are busy; success `CSV export ready` with `Share CSV`; failures say whether creation or sharing failed and provide `Try CSV export again` |

No toast, loading skeleton, or visual cache may claim a backup, restore, merge, export, connection, deletion, or source mutation succeeded before its authoritative completion result.

---

## Copywriting Contract

| Element | Exact copy |
|---|---|
| Phase primary recovery CTA | `Retry opening workout data` |
| Root destinations | `Workout`; `Calendar`; `Library`; `Progress` |
| Root settings action | Accessible name `Open App Settings`; sheet/route heading `App Settings` |
| Appearance intro | `Appearance applies to all four destinations, Active Workout, Garmin, sheets, dialogs, and recovery routes.` |
| Appearance choices | `System`; `Light`; `Dark` |
| Startup empty/loading | `Opening workout data` |
| Startup error | `Workout data could not be opened` — `Your saved data was not changed. Try again.` — `Retry opening workout data` |
| Notification setup | `Get rest alerts when the app is in the background` — `Enable notifications` — `Continue without alerts` |
| Removed-session empty | `No removed sessions` — `Workouts removed from history stay here until you restore them.` — `Return to App Settings` |
| Removed-session error | `Removed sessions could not be loaded` — `Your saved workouts were not changed. Retry loading removed sessions.` — `Retry loading removed sessions` |
| Automatic-backup error | `Automatic backup could not be checked` — `Your local workouts were not changed.` — `Retry automatic backup` |
| Encrypted-backup creation error | `Backup could not be created` — `Your saved workouts and plans were not changed. Check available storage and try again.` — `Try creating backup again` |
| CSV creation/share error | `CSV export could not be created` or `CSV could not be shared` — `Your saved data was not changed.` — `Try CSV export again` |
| Toast success pattern | Completed verb plus durable object, for example `Workout restored` or `CSV export ready`; never `Done`, `Success`, or fixture counts |
| Restore clean confirmation | `Review restore clean`; `Type REPLACE to continue`; `Restore backup`; `Cancel restore clean` |
| Merge confirmation | `Review merge`; `No changes have been made yet.`; `Type MERGE to continue`; `Merge backup`; `Cancel merge` |
| Cloud delete confirmation | `Delete cloud backup`; `Type DELETE to continue`; `Keep cloud backup`; `Delete cloud backup` |
| Disconnect confirmation | `Keep Google Drive connected`; `Disconnect Google Drive` |

Destructive actions in this phase are cloud-backup deletion and any existing source-removal path reached from preserved settings. Cloud deletion requires a separate review state plus exact `DELETE`. Restore clean and merge are consequential data operations and retain their existing preflight-token plus exact `REPLACE`/`MERGE` gates. Dismissal and Back never confirm.

---

## Responsive, Accessibility, and State Contract

### Width, orientation, and 200% text

- Verify `360×800`, `390×844`, `600×960`, and `840×1080`-equivalent layouts plus landscape. Root navigation remains bottom at every size.
- Compact uses 16dp content inset, medium 24dp, expanded 32dp. Medium/expanded may add readable columns only when reading order stays linear and all content/actions remain present.
- At 200% text, root labels, headings, settings rows, notices, confirmation consequences, and action labels wrap and grow vertically. No required copy is clipped, scaled down, hidden behind the nav/dock/IME, or replaced with an icon.
- Landscape keeps header and bottom navigation fixed to safe areas and gives the content or sheet body the single vertical scroll owner. Required actions remain reachable without horizontal scrolling.
- Long rows wrap supporting text below the title. Trailing icons occupy their own 48dp column; they never overlap copy.

### Keyboard, D-pad, TalkBack, and focus

- Every action supports touch, Enter, Space, accessibility `activate`, D-pad focus, and TalkBack through the same handler. Arrow keys move within radio/tab groups; Enter/Space selects.
- Focus is visibly outlined in both themes. Programmatic focus order follows visual/reading order and never enters hidden, inert, disabled, or background content.
- Root switch focuses the new heading. Deep-route Back restores the exact initiating row/action. Sheet/dialog close restores its trigger. A removed item that no longer exists restores to the nearest stable heading or next row.
- Sheets/dialogs are modal to accessibility; Back/Escape maps to the same safe dismissal; keyboard appearance does not resize a focused field/action below the visible viewport.
- Status changes expose `busy`, `disabled`, `selected`, `checked`, `expanded`, and live-region semantics as applicable. Decorative icons are hidden; non-color text/state remains.

### Reduced motion

- Observe the OS reduced-motion setting from the shared theme provider.
- Standard shell transitions use restrained 150–240ms opacity/position motion and no scale/bounce. Reduced motion removes translation and animated scroll but preserves the same ordered destination/state changes, focus movement, and completion callbacks.
- Root switching, theme changes, sheet open/close, toast appearance, and recovery progress must remain understandable without motion. No timeout is the authority for navigation, persistence, or source state.

---

## UI Considerations

The complete `v1.2-prototype-parity-matrix.json` was reviewed: **172/172 rows** = 17 Phase 13 domain inputs, 13 Phase 14 shell-owned rows, and 142 Phase 15–20 consumers/verification rows. Coverage classes are 104 `prototype_source`, 2 `prototype_present_unwired`, 49 `required_native`, and 17 `required_domain`. Phase 14 resolves the common visual/state container for every row; feature-owned copy and source semantics remain with their owning phase.

Applicable state considerations resolved: **14 covered, 7 backstop, 1 unresolved checkpoint**. The unresolved row is deliberately DEV-02; it is not an implementation assumption.

| Category | Element(s) / matrix scope | Status | Resolution / Reason |
|---|---|---|---|
| empty | Collections/media/forms across SHL, WRK, CAL, LIB, GAR, PRO | ✅ covered | Use the specific source-backed empty heading/body/next action; preserve root/date/filter/range context; never render a fixture, blank card, or zero chart as data. Removed sessions uses the exact copy above. |
| loading | Startup and font/SQLite trust (`SHL-07`) | ✅ covered | Stable shell skeleton, disabled four-root nav, one busy announcement, and no source values until fonts and SQLite trust are ready. |
| loading | Lists, forms, import/export, restore/merge, sync, projections | ✅ covered | Preserve existing content or stable geometry; expose busy/disabled; block duplicate submit; never imply commit/sync success. Skeleton blocks are decorative and hidden from accessibility. |
| error | Startup/source read (`SHL-07`, `SHL-10`–`13`, downstream required-native rows) | ✅ covered | Written problem + unchanged-facts assurance + action-specific Retry; preserve selection/draft and show correlation code only as secondary diagnostic text. |
| error | Mutations and consequential recovery | ✅ covered | Distinguish failed-before-commit from committed-but-refresh/rebuild-pending; retain reviewed facts and exact confirmation when safe; retry is idempotent and never a toast-only path. |
| populated | Four roots and deep routes | ✅ covered | Render the owning phase's normal source-backed content under one header/scroll/nav hierarchy; root/deep-route identity and selection remain stable. |
| partial | Partial/missing facts and mixed recovery state | ✅ covered | Use literal `Partial`, `Unavailable`, `Not connected`, `Recalculating`, em dash, or equivalent source-specific text plus icon/pattern; absence is never coerced to zero. |
| overflow | Root/detail collections and long histories | ✅ covered | One vertical scroll owner; bottom nav/dock stays outside content; content gets safe bottom clearance; required actions never depend on horizontal scrolling. |
| overflow | Sheets/dialogs | ✅ covered | Cap at keyboard-safe 82% height, scroll body, keep heading/close/recovery actions reachable, and prevent background gesture/action leakage. |
| zero-one-many | Every list collection | ✅ covered | Zero uses a true empty state; one uses singular copy; many use stable ordering and virtualized/scrollable presentation without changing row anatomy or hiding counts. |
| long-text | User-owned plan/exercise/session names and source labels | 🧪 backstop | Native 200%/long-string evidence must show wrap or two-line title treatment, full accessible name, stable trailing 48dp controls, and no overlap. |
| long-text | Error, privacy, confirmation, and recovery copy | 🧪 backstop | Native screenshots and focus traversal must show full reflow; consequential text and exact confirmation phrase are never ellipsized. |
| 200%-text | All 155 UI/verification-owned rows | 🧪 backstop | Android font-scale 2.0 captures at required widths prove all actions, labels, state text, nav, sheets, and dialogs remain reachable with >=48dp targets. |
| landscape | Roots, active dock consumers, Calendar, sheets, recovery routes | 🧪 backstop | Native landscape captures prove bottom navigation remains bottom, one vertical scroll owner remains, and keyboard/dock/required actions do not overlap. |
| keyboard/D-pad | Root nav, tab/radio groups, lists, forms, sheets, deep routes | 🧪 backstop | Hardware-keyboard/D-pad run proves logical order, arrow group movement, Enter/Space parity, visible focus, Back/Escape, no background activation, and trigger restoration. |
| focus | Root/deep/sheet transition graph | 🧪 backstop | Automated component focus assertions plus native evidence prove heading entry and exact trigger return, including deleted/restored rows and root switching from a deep route. |
| reduced-motion | Root, sheet, toast, Calendar/downstream transitions | 🧪 backstop | Motion-off evidence proves identical destinations, dates, selections, results, callbacks, and focus without translation, animated scroll, or timing-dependent truth. |
| theme/System | `SHL-03` plus every downstream surface | ✅ covered | Persist preference separately; live OS changes recolor all mounted surfaces atomically without closing, resetting, or navigating. |
| retained state | `SHL-02` and downstream root query/filter/date/range/scroll states | ✅ covered | Each root owns its view state; switching and deep-route return restore it. Startup failure/retry and theme changes do not clear it unless source identity invalidates it explicitly. |
| toast | `SHL-06` plus mutation/import consumers | ✅ covered | Top placement, semantic border/bar, live announcement, 2400ms noncritical dwell, inline persistent recovery for failures, and dock/IME non-overlap are fixed. |
| destructive | Cloud delete, restore clean, merge, preserved source-removal entries | ✅ covered | Separate review, source consequences, specific safe/confirm labels, exact phrase where defined, no write on dismiss, and authoritative busy/result states. |
| color/contrast checkpoint | `CAL-03`, `VER-04`; shared candidate token | ⚠ unresolved | DEV-02 is proposed and owner-unaccepted. Keep `#9B470B` candidate unused; do not claim Light Strength-title contrast closure until the deviation register records owner disposition. |

### Phase-by-phase matrix consumption

| Phase rows | Shared-shell obligation established here |
|---|---|
| 13 · 17 domain rows | Render only typed authoritative states; source absence/failure is not a fixture or zero value |
| 14 · 13 shell rows | Implement every contract in this document, including preserved startup/settings/recovery paths |
| 15 · 36 Workout rows | Consume tokens, fixed bottom nav, top-toast clearance, sheet/focus, long-list/200%-text, and reduced-motion behavior |
| 16 · 23 Calendar rows | Consume bottom composition, common header/actions/sheets/focus; DEV-01/02 remain owner gates in the deviation register |
| 17 · 36 Library rows | Consume shared search/form/sheet/error/overflow/focus shell without adding a root |
| 18 · 16 Garmin rows | Stay contextual; synchronize appearance and bottom composition; reuse truthful loading/error/sheet/toast contracts |
| 19 · 18 Progress rows | Preserve sport/range state, factual empty/sparse/loading/error presentation, shared overlays, and no zero fabrication |
| 20 · 13 verification rows | Capture Light/Dark/System, all required sizes/orientations, 200% text, target bounds, keyboard/focus, reduced motion, and complete parity/deviation evidence |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|---|---|---|
| shadcn official | none | not applicable — Expo/React Native project, no `components.json` |
| third-party UI registries | none | not applicable — no external registry block may enter this phase |

Package dependencies and bundled fonts remain subject to the repository's normal dependency/license review; they are not shadcn registry blocks.

---

## Researcher Six-Dimension Self-Check

| Dimension | Verdict | Evidence |
|---|---|---|
| 1 Copywriting | PASS | Primary, empty, error, retry, safe, confirmation, and destructive labels are action-specific; no generic Submit/OK/Done contract exists |
| 2 Visuals | PASS | Focal points, shell hierarchy, four-root composition, component geometry, overlays, startup, settings, and cross-state behavior are explicit |
| 3 Color | PASS | Exact source tokens, 60/30/10 roles, semantic accent reservations, non-color cues, and destructive colors are defined; DEV-02 remains visibly unaccepted rather than silently adopted |
| 4 Typography | PASS | Exactly four sizes and two weights, with bundled Archivo/IBM Plex Mono roles and line heights, are declared |
| 5 Spacing | PASS | The only reusable spacing values are 4, 8, 16, 24, 32, 48, and 64dp; component geometry is separately constrained |
| 6 Registry Safety | PASS | Native manual system declared; shadcn and third-party registries are unused |

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved by gsd-ui-checker; explicit owner and external gates remain open where documented.

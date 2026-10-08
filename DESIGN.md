# Gym Tracker Design System

This file is the repository-wide implementation source for the design system established by the approved Phase 1 UI contract in `.planning/phases/01-trustworthy-workout-loop/01-UI-SPEC.md` and evolved by later reviewed phases.

## Direction

- Build a quiet, high-contrast precision instrument.
- Lead with the next action, then evidence, then explanation.
- Use a warm editorial paper canvas in Light and a dark precision-instrument canvas in Dark. Prefer headings, spacing, and fine rules to containers outside bounded decision/recovery surfaces.
- Use bounded surfaces only for decisions, recoverable failures, destructive confirmation, and independently scannable content items. Content cards are flat, semantic surfaces and never nest.
- Do not use gradients, decorative pills, nested cards, fake metrics, decorative blobs, emoji decoration, ornamental icon circles, generic wellness language, or global fitness/readiness scores.
- Keep one dominant action per section.

## Typography

Bundle and render only these approved weights:

| Role | Family | Weight |
|---|---|---:|
| Interface regular | Archivo variable | 400 |
| Interface emphasis | Archivo variable | 800 |
| Numeric regular | IBM Plex Mono | 400 |
| Numeric emphasis | IBM Plex Mono | 400 tabular |

| Token | Family | Size / Line Height | Weight | Usage |
|---|---|---:|---:|---|
| `displayTimer` | IBM Plex Mono | `52 / 56sp` | 800 | Active rest countdown |
| `targetValue` | IBM Plex Mono | `28 / 34sp` | 800 | Current target and prominent numeric result |
| `screenTitle` | Archivo variable | `28 / 34sp` | 800 | Route title |
| `sectionTitle` | Archivo variable | `16 / 22sp` | 800 | Editorial section heading |
| `body` | Archivo variable | `16 / 22sp` | 400 | Primary content and instructions |
| `bodyStrong` | Archivo variable | `16 / 22sp` | 800 | Exercise names, actions, and key values |
| `secondary` | Archivo variable | `14 / 20sp` | 400 | Supporting evidence only |
| `label` | Archivo variable | `14 / 20sp` | 800 | Short uppercase or compact labels |
| `editorialWorkoutTitle` | Archivo variable | `57px / 49px` | 890 condensed | Workout identity only; `-0.07em` tracking and the exact `Today’s` / `workout` proof wrap |

Numeric values use tabular numerals. Body copy is never smaller than `16sp`. Required instructions and the only expression of status never use `secondary`. Exercise names wrap to two lines before truncation.

## Spacing and Sizing

The only layout-spacing tokens are:

| Token | Value | Usage |
|---|---:|---|
| `space.1` | `4dp` | Tight icon/text gap |
| `space.2` | `8dp` | Related controls and compact rows |
| `space.4` | `16dp` | Compact screen inset and block padding |
| `space.6` | `24dp` | Section separation and medium inset |
| `space.8` | `32dp` | Major separation and expanded inset |
| `space.12` | `48dp` | Large empty-state separation |
| `space.16` | `64dp` | Maximum expanded breathing room |

Control dimensions are not spacing exceptions:

| Element | Contract |
|---|---|
| Interactive target | Minimum `48 × 48dp` |
| Primary action | Full available width; minimum `56dp` high |
| Numeric set control | `56–64dp`; grows with text |
| Standard radius | `8dp` |
| Emphasized surface | `12dp` |
| Full round | Circular icon actions and compact controls only |
| Divider | Platform hairline |
| Active workout width | Maximum `720dp` |
| Completion/detail width | Maximum `960dp` |

## Color

Accent is reserved for actions, selected navigation, selected segmented state, and focus. It is not decoration.

| Token | Light | Dark | Usage |
|---|---|---|---|
| `paper` / `canvas` | `#FFFAF0` | `#080808` | Continuous root and bottom-navigation ground |
| `bone` | `#F4F0E6` | `#151515` | Secondary surface and pressed/disabled layer |
| `surface` | `#F0EADF` | `#151515` | Cards, rows, controls, and sheets |
| `raised` | `#FFFAF0` | `#202020` | Raised dialog or sheet surface |
| `ink` / `textPrimary` | `#0D0C0A` | `#F7F7F2` | Primary copy |
| `quiet` / `textSecondary` | `#655F56` | `#AAA9A2` | Supporting copy |
| `line` / `divider` | `#CEC6B8` | `#333330` | Hairlines and borders |
| `orange` | `#D97820` | `#D97820` | Workout emphasis and Strength border, rail, and swatch |
| `blue` / `action` / `focusRing` | `#195FAE` | `#71AAFF` | Focus, selection, links, and Running identity |
| `green` / `completed` | `#166B4C` | `#72DF92` | Committed completion only |
| `yellow` / `timerAttention` | `#8D5D00` | `#F0C84B` | Attention only |
| `destructive` | `#B42318` | `#FF8279` | Error or destructive action |
| `calendarStrengthTextLight` | `#9B470B` | n/a | Approved Light Strength title; the `orange` sport treatment stays `#D97820` |

Pair semantic color with text plus an icon, shape, or state label. Normal text meets WCAG AA `4.5:1`; large text and controls meet at least `3:1`. Disabled controls retain readable labels and expose disabled semantics.

### Semantic Surface Adoption Inventory

Paper is the Light root ground and near-black is the Dark root ground. Forms,
sheets, navigation chrome, dialogs, and transient notices use their shared
semantic surfaces; they are not screen-local card systems.

| Surface | Card status | Plan owner |
|---|---|---|
| Library plans, starter plans, and exercises | Adopt in Plan 02-25 | 02-25 |
| Root navigation and route shell | Keep navigation chrome, not a content card | 02-26 review |
| Today | Convert independently scannable operational content without nesting | 02-26 |
| Active Workout | Convert set and plan content with explicit status semantics and no nesting | 02-26 |
| Detail and editor screens | Convert eligible selectable content while retaining form surfaces | 02-26 |
| Completion surfaces | Convert eligible summaries while retaining confirmation and notice surfaces | 02-26 |

## Appearance

- The selector order and labels are exactly `System`, `Light`, `Dark`.
- `System` is the default and follows Android appearance.
- `Light` and `Dark` are validated explicit overrides; invalid or stale values fall back to `System`.
- Selecting `System` clears the explicit override.
- Appearance changes do not own navigation or workout state, so route, focus, values, scroll anchor, and rest state remain outside the theme provider.

### Appearance Persistence Seam

`AppearanceProvider` accepts an injected `AppearanceStore`. Production storage is the bounded SQLite preference seam keyed by `gym_tracker.appearance_preference.v1`; it preserves `System` as null, reports typed read/write failures, and retains the last authoritative preference when a write fails. `System` remains selected while live OS changes update the resolved scheme without remounting children.

## Iconography

- Use Lucide React Native only.
- Use outlined icons with `2dp` stroke.
- Default size is `24dp`; compact inline status may use `20dp`.
- Icon-only controls remain at least `48 × 48dp` and have programmatic labels.
- Decorative icons and dividers are hidden from accessibility APIs.
- Required mappings: `ArrowLeft`, `ChevronRight`, `Download`, `Share2`, `Ellipsis`, `Check`, `Timer`, `Pause`, `Play`, `SkipForward`, `TriangleAlert`, `Trash2`, and `RotateCcw`.

## Motion

| Transition | Standard | Reduced Motion |
|---|---|---|
| Set commit | `140ms` opacity/state acknowledgement | Immediate state change |
| Dock replacement | `200ms` opacity plus short position transition | Immediate replacement with opacity only |
| Sheet | Platform translation and fade | Fade only |
| Root switch | No decorative page travel | Same |
| Numeric/timer update | Direct value update | Same |

Never use spring bounce or scale. Reduced motion removes position, spring, bounce, and scale movement. Skeletons are static under reduced motion. State acknowledgement never waits for decoration.

## Width Classes

| Class | Width | Shell | Content |
|---|---:|---|---|
| Compact | `< 600dp` | Bottom navigation | Single column; `16dp` inset |
| Medium | `600–839dp` | Bottom navigation | Main plus optional context; `24dp` inset/gap |
| Expanded | `≥ 840dp` | Bottom navigation at every width | Two-pane content only; `32dp` inset/gap |

Active work and its adjacent set-row actions remain in one primary region. Medium and expanded Active Workout centers that region within `720dp`; RestDock and final Finish never move to a distant side pane. At large text, optional secondary context moves below primary content when two panes cannot preserve reading order and target size.

## Safe Areas and Large Text

- Headers clear status bars and display cutouts.
- RestDock and final Finish clear gesture and software navigation bars when sticky.
- Sheets and numeric inputs remain visible above the software keyboard.
- Portrait, landscape, and rotation preserve focused field, active set, entered values, scroll anchor, and rest state.
- Support Android text scaling through 200%.
- Actions grow vertically and labels wrap.
- Bottom navigation always keeps icon plus visible one-word label.
- Numeric and metric groups stack instead of clipping.
- Exercise names wrap before truncation.
- Required actions never move behind horizontal scrolling or disclosure.

## Accessibility and Focus

- Every route exposes one heading; section headings use heading semantics.
- Focus order follows visual top-to-bottom, left-to-right order.
- Every control is reachable by touch, keyboard, and D-pad.
- Enter and Space invoke the same action path as touch.
- No required action is swipe-only, long-press-only, drag-only, or dependent on color.
- Visible focus uses a minimum `3dp` `focusRing`.
- Sheets move focus to their heading, trap modal accessibility, and restore focus to the invoking control when dismissed.
- Skeletons and decorative content are hidden.
- State changes use polite announcements; timer ticks do not.
- Android Back dismisses the topmost sheet, then a focused route, then follows root history; a second Back from a root exits.

## Shared Component Vocabulary

Screens reuse these treatments instead of creating local variants:

- `AppTabs`
- `ScreenHeader`
- `SectionHeader`
- `PrimaryAction`
- `SecondaryAction`
- `IconAction`
- `NavigationRow`
- `ExerciseRow`
- `PlanActivationRow`
- `TargetValue`
- `SetRow`
- `RestDock`
- `InlineNotice`
- `RecommendationSurface`
- `MetricSummary`
- `EmptyState`
- `ConfirmationSheet`
- `AppearanceSheet`
- `StartupReadinessGate`
- `RootFailureState`
- `SkeletonBlock`

Later phases may add behavior to these components, but they must not create parallel styling or expose controls outside their approved phase scope.

`NavigationRow` is the shared full-row navigation or bounded-action affordance for
task-focused settings and detail surfaces. It carries a title, optional supporting text,
and a semantic trailing affordance; the entire row activates. Navigation mode uses an
outlined `ChevronRight`; direct CSV export uses `Download`, share-ready uses `Share2`,
and retry uses `RotateCcw`. Action mode may expose bounded busy, success, or retry state. It
grows vertically at large text, keeps a minimum 48dp target, exposes one exact accessible
label/hint, hides decorative trailing icons from accessibility, and uses the shared
pressed, disabled, and 3dp focus treatments. It is not a content card and must not be
recreated as route-local pressable styling.

## Voice

- Calm, factual, local-first, and evidence-led.
- Use literal action labels and say what changed.
- Preferred progression language: `Repeat`, `Hold`, `Ready to increase`, `Try again when ready`, `Consider a lighter target`.
- Avoid judgmental language such as `Behind`, `Weak`, or `Streak lost`.
- Do not infer fatigue, injury, overtraining, or readiness.

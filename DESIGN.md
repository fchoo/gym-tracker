# Gym Tracker Design System

This file is the repository-owned implementation source for the approved Phase 1 UI contract in `.planning/phases/01-trustworthy-workout-loop/01-UI-SPEC.md`.

## Direction

- Build a quiet, high-contrast precision instrument.
- Lead with the next action, then evidence, then explanation.
- Use a neutral grey continuous canvas and editorial sections. Prefer headings, spacing, and hairline dividers to containers outside content cards.
- Use bounded surfaces only for decisions, recoverable failures, destructive confirmation, and independently scannable content items. Content cards are flat, high-contrast surfaces and never nest: white over the neutral-grey light canvas, near-black over the graphite dark canvas.
- Do not use gradients, decorative pills, nested cards, fake metrics, decorative blobs, emoji decoration, ornamental icon circles, generic wellness language, or global fitness/readiness scores.
- Keep one dominant action per section.

## Typography

Bundle and render only these approved weights:

| Role | Family | Weight |
|---|---|---:|
| Interface regular | Source Sans 3 | 400 |
| Interface emphasis | Source Sans 3 | 600 |
| Numeric regular | IBM Plex Mono | 400 |
| Numeric emphasis | IBM Plex Mono | 600 |

| Token | Family | Size / Line Height | Weight | Usage |
|---|---|---:|---:|---|
| `displayTimer` | IBM Plex Mono | `52 / 56sp` | 600 | Active rest countdown |
| `targetValue` | IBM Plex Mono | `28 / 34sp` | 600 | Current target and prominent numeric result |
| `screenTitle` | Source Sans 3 | `28 / 34sp` | 600 | Route title |
| `sectionTitle` | Source Sans 3 | `16 / 22sp` | 600 | Editorial section heading |
| `body` | Source Sans 3 | `16 / 22sp` | 400 | Primary content and instructions |
| `bodyStrong` | Source Sans 3 | `16 / 22sp` | 600 | Exercise names, actions, and key values |
| `secondary` | Source Sans 3 | `14 / 20sp` | 400 | Supporting evidence only |
| `label` | Source Sans 3 | `14 / 20sp` | 600 | Short uppercase or compact labels |

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
| `canvas` | `#F1F3F4` | `#202124` | Continuous neutral-grey root background, inspired by Gmail's restrained canvas hierarchy |
| `contentCard` | `#FFFFFF` | `#121212` | Flat independently scannable content item; white in light appearance and near-black in dark appearance; never nest cards |
| `contentCardText` | `#202124` | `#E8EAED` | High-contrast primary copy on content cards |
| `contentCardTextSecondary` | `#5F6368` | `#BDC1C6` | High-contrast supporting copy on content cards |
| `surface` | `#F8F9FA` | `#171B1E` | Dock, sheet, input, or bounded control surface; kept distinct from white light-mode content cards |
| `surfaceSubtle` | `#E8EAED` | `#20262A` | Pressed inputs, skeletons, and segmented controls |
| `textPrimary` | `#171A1C` | `#F4F6F7` | Primary text |
| `textSecondary` | `#5D656B` | `#AEB7BD` | Supporting text |
| `divider` | `#C9CED2` | `#394146` | Hairlines and borders |
| `action` | `#155EEF` | `#70A0FF` | Primary action and selected navigation |
| `actionPressed` | `#004EEB` | `#8DB3FF` | Pressed primary action |
| `onAction` | `#FFFFFF` | `#071225` | Content on the action color |
| `completed` | `#1F7A4D` | `#56C88A` | Committed completion only |
| `timerAttention` | `#B54708` | `#FFB45C` | Timer attention and caution |
| `destructive` | `#B42318` | `#FF746A` | Error or destructive action |
| `errorSurface` | `#FEE4E2` | `#3A1C1B` | Save/database failure |
| `focusRing` | `#155EEF` | `#9CBFFF` | External-input focus |

Pair semantic color with text plus an icon, shape, or state label. Normal text meets WCAG AA `4.5:1`; large text and controls meet at least `3:1`. Disabled controls retain readable labels and expose disabled semantics.

### Content Card Adoption Inventory

The neutral grey canvas is the default for independently scannable content.
Content cards invert with appearance: white cards lift from the light canvas,
while near-black cards lift from the graphite dark canvas. Form fields, sheets,
navigation chrome, dialogs, and transient notices remain on their existing
semantic surfaces; they are not content cards.

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

### Phase 1 Persistence Seam

`AppearanceProvider` accepts an injected `AppearanceStore`. Plan 01-02 provides a narrow process-memory implementation that persists an explicit override across provider remounts without introducing `AsyncStorage`. It is intentionally not durable across process death. The authoritative SQLite settings repository replaces this adapter in the later persistence plan without changing the provider or selector contract.

## Iconography

- Use Lucide React Native only.
- Use outlined icons with `2dp` stroke.
- Default size is `24dp`; compact inline status may use `20dp`.
- Icon-only controls remain at least `48 × 48dp` and have programmatic labels.
- Decorative icons and dividers are hidden from accessibility APIs.
- Required mappings: `ArrowLeft`, `Ellipsis`, `Check`, `Timer`, `Pause`, `Play`, `SkipForward`, `TriangleAlert`, `Trash2`, and `RotateCcw`.

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
| Expanded | `≥ 840dp` | Rail permitted | Two-pane roots; `32dp` inset/gap |

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
- Visible focus uses a minimum `2dp` `focusRing`.
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

Phase 1 may add behavior to these components, but it must not create parallel styling or expose later-phase Calendar, Library, or Progress controls.

## Voice

- Calm, factual, local-first, and evidence-led.
- Use literal action labels and say what changed.
- Preferred progression language: `Repeat`, `Hold`, `Ready to increase`, `Try again when ready`, `Consider a lighter target`.
- Avoid judgmental language such as `Behind`, `Weak`, or `Streak lost`.
- Do not infer fatigue, injury, overtraining, or readiness.

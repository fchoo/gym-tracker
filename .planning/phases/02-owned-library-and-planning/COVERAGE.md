# Phase 2 Source-Derived Evidence Coverage

This file is the canonical coverage source for the physical-review amendment.
It is intentionally declarative: Plan 02-33 must parse stable IDs and derive
counts from rows rather than duplicate totals in scripts or result artifacts.
`auto` means the remediation-case foreign key resolves to focused host proof;
`emulator-supplementary` and `samsung-physical` name future attended roles, not
evidence already collected by this plan.

## UI Truth Vocabulary

Truth IDs are fixed and ordered as follows: `empty`, `loading`, `error`,
`populated`, `partial`, `overflow`, `zero-one-many`, `long-text`. A matrix
cell is either `required` or `not_applicable`. Every `not_applicable` cell
states a concrete product reason; it is never an omitted review obligation.

<!-- phase2-ledger:v1 name=ui-truth-coverage -->

Columns are fixed in this order: `surface_id`, `truth_id`, `applicability`,
`reason_or_expectation`, `remediation_cases`, `evidence`. Rows are ordered by
the lexicographic `surface_id` and then the truth vocabulary order above.
The exact delimiter for multi-ID `remediation_cases` is `, ` (U+002C COMMA
followed by U+0020 SPACE). The exact delimiter for ordered `evidence` route
segments is `+` (U+002B PLUS SIGN) with no surrounding whitespace. A
`not_applicable` row uses the literal em dash `—` in both columns; a `required`
row may not use that sentinel. `evidence` is a required future route, not a
present pass claim.

| surface_id | truth_id | applicability | reason_or_expectation | remediation_cases | evidence |
|---|---|---|---|---|---|
| UI-02-ALERT-SETTINGS | empty | required | Missing stored preferences render safe default-on values and guidance without inventing delivery success. | RC-02-ALERT-PREFERENCES-CHANNEL-NONAUTH | auto+emulator-supplementary+samsung-physical |
| UI-02-ALERT-SETTINGS | loading | required | Preference read keeps controls stable while loading and does not change rest authority. | RC-02-ALERT-PREFERENCES-CHANNEL-NONAUTH | auto+emulator-supplementary |
| UI-02-ALERT-SETTINGS | error | required | Rejected or unavailable preference writes restore persisted values and announce bounded recovery. | RC-02-ALERT-PREFERENCES-CHANNEL-NONAUTH | auto+emulator-supplementary+samsung-physical |
| UI-02-ALERT-SETTINGS | populated | required | Independent Rest sound and Rest vibration controls show persisted channel-compatible state. | RC-02-ALERT-PREFERENCES-CHANNEL-NONAUTH | auto+emulator-supplementary+samsung-physical |
| UI-02-ALERT-SETTINGS | partial | required | One enabled modality is represented accurately without implying the other or platform delivery. | RC-02-ALERT-PREFERENCES-CHANNEL-NONAUTH | auto+emulator-supplementary+samsung-physical |
| UI-02-ALERT-SETTINGS | overflow | not_applicable | The sheet contains a bounded pair of preference controls and bounded guidance, not a scrollable unbounded result set. | — | — |
| UI-02-ALERT-SETTINGS | zero-one-many | not_applicable | The two fixed preferences are independently boolean and are not a variable-cardinality collection. | — | — |
| UI-02-ALERT-SETTINGS | long-text | required | Notification-settings guidance and bounded error text reflow without hiding either control. | RC-02-ALERT-PREFERENCES-CHANNEL-NONAUTH | auto+emulator-supplementary+samsung-physical |
| UI-02-CALENDAR | empty | not_applicable | A civil-month grid is always rendered; no remote collection can become empty. | — | — |
| UI-02-CALENDAR | loading | not_applicable | LocalDate computation and bounded month navigation are synchronous local presentation work. | — | — |
| UI-02-CALENDAR | error | required | Invalid or out-of-bound civil dates remain disabled and preserve the caller draft. | RC-02-DATE-CALENDAR | auto+emulator-supplementary |
| UI-02-CALENDAR | populated | required | Enabled civil days, selected draft, explicit confirmation, and bounds render accurately. | RC-02-DATE-CALENDAR | auto+emulator-supplementary |
| UI-02-CALENDAR | partial | required | Partial month bounds expose disabled days without making valid days unavailable. | RC-02-DATE-CALENDAR | auto+emulator-supplementary |
| UI-02-CALENDAR | overflow | not_applicable | The visible month grid is bounded; month changes are explicit controls rather than an unbounded list. | — | — |
| UI-02-CALENDAR | zero-one-many | required | Zero selected draft, one confirmed date, and many enabled days retain clear selected/disabled semantics. | RC-02-DATE-CALENDAR | auto+emulator-supplementary |
| UI-02-CALENDAR | long-text | required | Month/year labels and field labels remain visible at large text without displacing confirmation controls. | RC-02-DATE-CALENDAR | auto+emulator-supplementary |
| UI-02-DURATION | empty | required | An unset duration remains an explicit editable draft rather than silently becoming zero. | RC-02-DURATION-NUMERIC | auto+emulator-supplementary |
| UI-02-DURATION | loading | not_applicable | The local time-style picker has no asynchronous content source. | — | — |
| UI-02-DURATION | error | required | Invalid segment combinations surface bounded validation without overwriting the existing draft. | RC-02-DURATION-NUMERIC | auto+emulator-supplementary |
| UI-02-DURATION | populated | required | Confirmed hour/minute/second selection emits canonical seconds through the existing domain contract. | RC-02-DURATION-NUMERIC | auto+emulator-supplementary |
| UI-02-DURATION | partial | required | Edited segments remain draft-local until explicit confirmation or cancellation. | RC-02-DURATION-NUMERIC | auto+emulator-supplementary |
| UI-02-DURATION | overflow | not_applicable | The picker owns a bounded set of time segments and no arbitrary result list. | — | — |
| UI-02-DURATION | zero-one-many | not_applicable | A duration field represents one scalar duration, not a variable collection. | — | — |
| UI-02-DURATION | long-text | not_applicable | Labels and bounded numeric segments do not accept unbounded owner prose; surrounding field labels are covered by their parent surfaces. | — | — |
| UI-02-GLOBAL-CARD | empty | required | Summary/card containers distinguish intentional absence from missing facts using their owner-specific empty copy. | RC-02-CARDS | auto+emulator-supplementary+samsung-physical |
| UI-02-GLOBAL-CARD | loading | required | Shared cards preserve their final geometry through owner-specific skeletons or loading states. | RC-02-CARDS | auto+emulator-supplementary |
| UI-02-GLOBAL-CARD | error | required | Card-contained recovery remains bounded and never changes underlying source facts. | RC-02-CARDS | auto+emulator-supplementary+samsung-physical |
| UI-02-GLOBAL-CARD | populated | required | Independently scannable global content uses the grey canvas, near-black card token, and no nesting. | RC-02-CARDS | auto+emulator-supplementary+samsung-physical |
| UI-02-GLOBAL-CARD | partial | required | Mixed known/unknown content remains visibly qualified without replacing valid card facts. | RC-02-CARDS | auto+emulator-supplementary |
| UI-02-GLOBAL-CARD | overflow | required | Bounded card content reflows or scrolls vertically without clipping actions or creating nested cards. | RC-02-CARDS | auto+emulator-supplementary+samsung-physical |
| UI-02-GLOBAL-CARD | zero-one-many | required | Owner screens preserve correct singular/plural content-card grouping without fabricating absent cards. | RC-02-CARDS | auto+emulator-supplementary |
| UI-02-GLOBAL-CARD | long-text | required | Long summary, attribution, and status text wraps while the card action cluster remains reachable. | RC-02-CARDS | auto+emulator-supplementary+samsung-physical |
| UI-02-LIBRARY-EXERCISE-CARD | empty | required | Favorites, Recent, and filtered exercise states use explicit scoped empty copy. | RC-02-CARDS | auto+emulator-supplementary+samsung-physical |
| UI-02-LIBRARY-EXERCISE-CARD | loading | required | Exercise-card skeletons preserve filters and search controls while the page loads. | RC-02-CARDS | auto+emulator-supplementary |
| UI-02-LIBRARY-EXERCISE-CARD | error | required | Failed page loads preserve query, filters, and already committed exercise cards with Retry. | RC-02-CARDS | auto+emulator-supplementary+samsung-physical |
| UI-02-LIBRARY-EXERCISE-CARD | populated | required | Every exercise-result family renders the shared flat card with ownership, attribution, and visible status facts. | RC-02-CARDS | auto+emulator-supplementary+samsung-physical |
| UI-02-LIBRARY-EXERCISE-CARD | partial | required | Unavailable, hidden, archived, alias-match, and page-retry facts remain explicit on valid cards. | RC-02-CARDS | auto+emulator-supplementary+samsung-physical |
| UI-02-LIBRARY-EXERCISE-CARD | overflow | required | Long lists paginate or vertically scroll; cards never require horizontal scrolling for required actions. | RC-02-CARDS | auto+emulator-supplementary+samsung-physical |
| UI-02-LIBRARY-EXERCISE-CARD | zero-one-many | required | Zero filter results, one exercise, and ranked/paginated many-result states remain distinguishable. | RC-02-CARDS | auto+emulator-supplementary+samsung-physical |
| UI-02-LIBRARY-EXERCISE-CARD | long-text | required | Exercise names, aliases, attribution, and source notes wrap without clipping status or action controls. | RC-02-CARDS | auto+emulator-supplementary+samsung-physical |
| UI-02-LIBRARY-PLAN-CARD | empty | required | No active plan and empty owned-plan states retain `Choose a starter plan` without fabricating a card. | RC-02-CARDS | auto+emulator-supplementary+samsung-physical |
| UI-02-LIBRARY-PLAN-CARD | loading | required | Plan-card skeletons preserve selected Library section and stable controls. | RC-02-CARDS | auto+emulator-supplementary |
| UI-02-LIBRARY-PLAN-CARD | error | required | Plan loading failures retain selection/search state and offer bounded retry. | RC-02-CARDS | auto+emulator-supplementary+samsung-physical |
| UI-02-LIBRARY-PLAN-CARD | populated | required | Active, owned, and all six starter plans use shared flat near-black cards. | RC-02-CARDS | auto+emulator-supplementary+samsung-physical |
| UI-02-LIBRARY-PLAN-CARD | partial | required | Draft, archived, active, template-update, and missing-requirement facts remain visible on their cards. | RC-02-CARDS | auto+emulator-supplementary+samsung-physical |
| UI-02-LIBRARY-PLAN-CARD | overflow | required | Plan cards support vertical scroll and long lists without nested-card or clipped-action regressions. | RC-02-CARDS | auto+emulator-supplementary+samsung-physical |
| UI-02-LIBRARY-PLAN-CARD | zero-one-many | required | Active-plan zero/one and owned/starter many states use correct grouping and count semantics. | RC-02-CARDS | auto+emulator-supplementary+samsung-physical |
| UI-02-LIBRARY-PLAN-CARD | long-text | required | Plan names, schedules, source notes, and fit explanations reflow while actions remain aligned. | RC-02-CARDS | auto+emulator-supplementary+samsung-physical |
| UI-02-NUMERIC | empty | required | Blank numeric drafts preserve caller-owned blank-versus-zero semantics. | RC-02-DURATION-NUMERIC | auto+emulator-supplementary |
| UI-02-NUMERIC | loading | not_applicable | Integer and decimal input primitives have no asynchronous content source. | — | — |
| UI-02-NUMERIC | error | required | Precision and validation errors are announced without replacing the entered draft. | RC-02-DURATION-NUMERIC | auto+emulator-supplementary |
| UI-02-NUMERIC | populated | required | Integer and decimal values request the correct keypad and retain domain-unit conversion. | RC-02-DURATION-NUMERIC | auto+emulator-supplementary |
| UI-02-NUMERIC | partial | required | Intermediate numeric edits preserve focus and avoid stale autosave. | RC-02-DURATION-NUMERIC | auto+emulator-supplementary |
| UI-02-NUMERIC | overflow | not_applicable | A numeric field is a bounded scalar editor, not an unbounded scrollable collection. | — | — |
| UI-02-NUMERIC | zero-one-many | not_applicable | Each numeric field accepts one scalar value; collection cardinality belongs to its owning list surface. | — | — |
| UI-02-NUMERIC | long-text | not_applicable | Numeric controls do not accept unbounded prose; labels and help copy are owned by parent screens. | — | — |
| UI-02-REST-DOCK | empty | not_applicable | Absence of a rest state removes the singleton dock; it is not an empty collection state. | — | — |
| UI-02-REST-DOCK | loading | not_applicable | Persisted timer display is restored by the active-workout view rather than a dock-local asynchronous list. | — | — |
| UI-02-REST-DOCK | error | required | Command/notification failure preserves SQLite timer truth and provides bounded recovery without claiming delivery. | RC-02-REST-DOCK, RC-02-ALERT-BG-DELIVERY-NONAUTH | auto+samsung-physical |
| UI-02-REST-DOCK | populated | required | Running and paused rest show remaining time in both collapsed and expanded states. | RC-02-REST-DOCK | auto+samsung-physical |
| UI-02-REST-DOCK | partial | required | Collapsed and paused states retain explicit timer semantics and the required action order on expansion. | RC-02-REST-DOCK | auto+samsung-physical |
| UI-02-REST-DOCK | overflow | not_applicable | The dock owns four bounded controls and a timer, not an unbounded list. | — | — |
| UI-02-REST-DOCK | zero-one-many | not_applicable | Active workout has at most one authoritative rest state at a time. | — | — |
| UI-02-REST-DOCK | long-text | not_applicable | The dock uses bounded timer/status labels; long explanatory copy belongs to alert settings or error surfaces. | — | — |
| UI-02-ROOT-NAV | empty | not_applicable | The root shell has four fixed destinations and no data-driven empty state. | — | — |
| UI-02-ROOT-NAV | loading | required | The immediate loading shell preserves disabled root navigation and uses the expanded rail at expanded width before trusted destination content is available. | RC-02-NAV-LEFT-RAIL | auto+emulator-supplementary+samsung-physical |
| UI-02-ROOT-NAV | error | not_applicable | Destination content errors are owned by their screens; the root rail/tab shell preserves navigation access. | — | — |
| UI-02-ROOT-NAV | populated | required | Compact/medium bottom tabs and expanded navigator-level rail fill the scene with one selected route state. | RC-02-NAV-LEFT-RAIL | auto+emulator-supplementary+samsung-physical |
| UI-02-ROOT-NAV | partial | required | Width transitions preserve route selection, focus, safe-area placement, and non-color selected state. | RC-02-NAV-LEFT-RAIL | auto+emulator-supplementary+samsung-physical |
| UI-02-ROOT-NAV | overflow | required | 200% text and landscape preserve destination labels and targets without clipping or blank lower-right geometry. | RC-02-NAV-LEFT-RAIL | auto+emulator-supplementary+samsung-physical |
| UI-02-ROOT-NAV | zero-one-many | not_applicable | Destination cardinality is fixed at four and is not a user-variable result set. | — | — |
| UI-02-ROOT-NAV | long-text | required | Destination labels wrap/reflow at large text while retaining keyboard/D-pad reachable 48dp targets. | RC-02-NAV-LEFT-RAIL | auto+emulator-supplementary+samsung-physical |
| UI-02-SET-CARD | empty | not_applicable | A set card represents an existing set row; no row is rendered for an absent set. | — | — |
| UI-02-SET-CARD | loading | not_applicable | Set-card values come from the already loaded active-workout view rather than a card-local fetch. | — | — |
| UI-02-SET-CARD | error | required | Failed inline value persistence retains values and exposes retry without falsely changing completion state. | RC-02-RETRY-FOCUS | auto+emulator-supplementary+samsung-physical |
| UI-02-SET-CARD | populated | required | Active, completed, skipped, and warm-up rows render card-safe fields, glyphs, and status semantics. | RC-02-GLYPH-ACTION-GEOMETRY, RC-02-SET-STATUS, RC-02-WARMUP-EXCLUSION-COPY | auto+emulator-supplementary+samsung-physical |
| UI-02-SET-CARD | partial | required | Mixed completed/current/planned/skipped rows retain explicit non-color state. | RC-02-SET-STATUS | auto+emulator-supplementary+samsung-physical |
| UI-02-SET-CARD | overflow | required | 200% text and compact widths preserve fields, top-right status, and right-edge action geometry. | RC-02-GLYPH-ACTION-GEOMETRY, RC-02-SET-STATUS | auto+emulator-supplementary+samsung-physical |
| UI-02-SET-CARD | zero-one-many | required | One exercise may render zero, one, or many set cards without hiding mutation actions. | RC-02-LATEST-SCHEMA-ADD-COPY | auto+samsung-physical |
| UI-02-SET-CARD | long-text | not_applicable | Set-card values and fixed labels are bounded; longer retry prose is owned by the mutation surface. | — | — |
| UI-02-SET-MUTATIONS | empty | required | Before the first insertion, add-set affordances remain explicit rather than showing an inert empty area. | RC-02-LATEST-SCHEMA-ADD-COPY | auto+samsung-physical |
| UI-02-SET-MUTATIONS | loading | required | In-flight add/copy/correction disables duplicate submission while preserving visible owner context. | RC-02-RETRY-FOCUS, RC-02-ACTIVE-CORRECTION | auto+samsung-physical |
| UI-02-SET-MUTATIONS | error | required | Rejected latest-schema mutations preserve entered values and offer exact inline Retry. | RC-02-RETRY-FOCUS, RC-02-LATEST-SCHEMA-ADD-COPY | auto+samsung-physical |
| UI-02-SET-MUTATIONS | populated | required | Add warm-up, Copy warm-up, Add working set, and active correction return committed identity and usable row focus. | RC-02-LATEST-SCHEMA-ADD-COPY, RC-02-RETRY-FOCUS, RC-02-ACTIVE-CORRECTION | auto+samsung-physical |
| UI-02-SET-MUTATIONS | partial | required | A locally failed mutation never rolls back unrelated completed/current rows or rest state. | RC-02-RETRY-FOCUS, RC-02-ACTIVE-CORRECTION | auto+samsung-physical |
| UI-02-SET-MUTATIONS | overflow | required | Many inserted rows remain scrollable and the committed target row is revealed/focused without hiding controls. | RC-02-RETRY-FOCUS | auto+emulator-supplementary+samsung-physical |
| UI-02-SET-MUTATIONS | zero-one-many | required | First, one, and repeated add/copy operations retain distinct committed identities and duplicate guards. | RC-02-LATEST-SCHEMA-ADD-COPY, RC-02-RETRY-FOCUS | auto+samsung-physical |
| UI-02-SET-MUTATIONS | long-text | required | Retry/error detail reflows without replacing entered values, row identity, or primary action. | RC-02-RETRY-FOCUS | auto+emulator-supplementary+samsung-physical |
| UI-02-STICKY-HEADER | empty | not_applicable | Sticky identity exists only for an active workout with known workout/exercise context. | — | — |
| UI-02-STICKY-HEADER | loading | not_applicable | Header identity is a projection of the loaded active-workout view, not an independent fetch. | — | — |
| UI-02-STICKY-HEADER | error | not_applicable | Active-workout load failures are owned by the screen-level error state, not a separately failing sticky header. | — | — |
| UI-02-STICKY-HEADER | populated | required | Workout/exercise identity remains visible above scrolling set content and coexists with RestDock. | RC-02-STICKY-IDENTITY | emulator-supplementary+samsung-physical |
| UI-02-STICKY-HEADER | partial | required | Review versus current identity remains explicit without mutating the authoritative active pointer. | RC-02-STICKY-IDENTITY | emulator-supplementary+samsung-physical |
| UI-02-STICKY-HEADER | overflow | required | Keyboard, safe areas, landscape, and 200% text retain visible identity without covering working controls. | RC-02-STICKY-IDENTITY | emulator-supplementary+samsung-physical |
| UI-02-STICKY-HEADER | zero-one-many | not_applicable | There is exactly one sticky identity for the active-workout scene; list cardinality belongs to Today’s plan. | — | — |
| UI-02-STICKY-HEADER | long-text | required | Long workout or exercise names wrap/reflow while sticky identity remains discernible. | RC-02-STICKY-IDENTITY | emulator-supplementary+samsung-physical |
| UI-02-TODAYS-PLAN | empty | required | A no-exercise or unavailable-plan state is explicit and never fabricates planned exercises. | RC-02-TODAYS-PLAN | auto+emulator-supplementary+samsung-physical |
| UI-02-TODAYS-PLAN | loading | required | The overview keeps a bounded loading presentation without fabricating exercise identity or mutating the active workout. | RC-02-TODAYS-PLAN | auto+emulator-supplementary |
| UI-02-TODAYS-PLAN | error | required | Failed overview loading preserves active-workout truth and offers bounded recovery. | RC-02-TODAYS-PLAN | auto+emulator-supplementary+samsung-physical |
| UI-02-TODAYS-PLAN | populated | required | Every exercise appears in workout order with completed, current, planned, or skipped state. | RC-02-TODAYS-PLAN | auto+emulator-supplementary+samsung-physical |
| UI-02-TODAYS-PLAN | partial | required | Reviewing another exercise never changes the authoritative active pointer or hides current state. | RC-02-TODAYS-PLAN | auto+emulator-supplementary+samsung-physical |
| UI-02-TODAYS-PLAN | overflow | required | Long workout plans scroll vertically and retain review access across compact/expanded layouts. | RC-02-TODAYS-PLAN | auto+emulator-supplementary+samsung-physical |
| UI-02-TODAYS-PLAN | zero-one-many | required | Zero, one, and many exercise plans retain ordered state labels and correct review behavior. | RC-02-TODAYS-PLAN | auto+emulator-supplementary+samsung-physical |
| UI-02-TODAYS-PLAN | long-text | required | Long exercise names and status labels reflow without obscuring review affordances. | RC-02-TODAYS-PLAN | auto+emulator-supplementary+samsung-physical |

## Attended Evidence Roles

<!-- phase2-ledger:v1 name=attended-rows -->

Columns are fixed in this order: `role`, `status`, `scope`, `identity_rule`,
`record_owner`. Role rows are sorted by role and are the only accepted attended
roles. Both stay pending until Phase 5 Plan 05-07 records explicit observation
against the one exact final signed candidate.

| role | status | scope | identity_rule | record_owner |
|---|---|---|---|---|
| emulator-supplementary | planned | Adaptive rail, calendar/time/numeric controls, cards, 200% text, landscape, keyboard/D-pad, focus, error/partial/overflow, and long-text review. | Own model/API/ABI, hashed serial, and installed-APK hash; build/source/APK/package identities equal the final candidate manifest. | Phase 5 Plan 05-07 consolidated attended record |
| samsung-physical | planned | Touch targets, OLED/System/Light/Dark, scrolling, set mutation/correction, sticky/Today’s plan, RestDock, default sound/haptic, independent toggles, foreground/background behavior, and reduced motion. | Own model/API/ABI, hashed serial, and installed-APK hash; build/source/APK/package identities equal the final candidate manifest. | Phase 5 Plan 05-07 consolidated attended record |

## Product Prohibitions

<!-- phase2-ledger:v1 name=prohibitions -->

Columns are fixed in this order: `id`, `constraint`, `enforcement`,
`attended_review`, `remediation_cases`, `attended_roles`. The exact delimiter
for every multi-ID column is `, ` (U+002C COMMA followed by U+0020 SPACE). IDs
are sorted and are the complete amendment prohibition set. `remediation_cases`
is an exact-ID foreign-key list into `02-VALIDATION.md`'s remediation-cases
`id` column; `attended_roles` is an exact-ID foreign-key list into this file's
attended-rows `role` column. Values are unique and use the source-ledger order.

| id | constraint | enforcement | attended_review | remediation_cases | attended_roles |
|---|---|---|---|---|---|
| no-diagnosis-or-shame | UI language does not diagnose fitness, prescribe medical action, or shame outcomes. | Copy and state rows remain factual, bounded, and evidence-first; no remediation result infers health or owner character. | Both roles check error, partial, skipped, and completion-adjacent wording. | RC-02-SET-STATUS, RC-02-TODAYS-PLAN, RC-02-WARMUP-EXCLUSION-COPY | emulator-supplementary, samsung-physical |
| no-false-authority | Derived platform effects, host summaries, and stale artifacts never claim authoritative workout truth or physical approval. | SQLite remains authoritative; every status is evidence-pending until exact-HEAD and attended identities match; foreground feedback is at most one best-effort attempt. | Samsung verifies installed bytes and observed physical effects; exact-HEAD automation separately validates stale/host authority. | RC-02-ALERT-BG-DELIVERY-NONAUTH, RC-02-ALERT-FG-ATTEMPT-ONCE, RC-02-EXACT-HEAD-EVIDENCE, RC-02-ROLE-SPLIT | samsung-physical |
| no-rest-or-schedule-pressure | Rest, skip, repeat, schedule, and alert states never guilt, punish, or pressure the owner. | RestDock and schedule wording preserve explicit owner control; notification preference or delivery failure does not change workout facts. | Samsung checks rest, skipped/restored, alert, and schedule-adjacent copy. | RC-02-ALERT-PREFERENCES-CHANNEL-NONAUTH, RC-02-REST-DOCK, RC-02-SET-STATUS | samsung-physical |

## Derived Count Contract

Do not retain an independently hardcoded count in scripts, result JSON, or
approval prose. A consumer must derive all totals from these rows and reject
duplicates, missing foreign keys, or a matrix that is not the complete cross
product of unique surface IDs and the fixed truth vocabulary. In particular:

- remediation-case total = count of unique `id` rows in
  `02-VALIDATION.md` remediation-cases ledger;
- UI surface total = count of unique `surface_id` rows in `02-UI-SPEC.md`
  ui-surfaces ledger;
- UI truth total = count of the fixed truth vocabulary declared above;
- UI coverage total = count of ui-truth-coverage rows, and it must equal the
  product of those source-derived surface and truth totals;
- attended total = count of attended-rows entries, with each role exactly once;
- prohibition total = count of prohibition entries, with each exact ID once;
- requirement total = count of unique `requirement_id` rows in
  `02-VALIDATION.md`'s requirement-traceability ledger, and that set must equal
  the canonical Phase 2 `LIB-*` IDs parsed from `.planning/REQUIREMENTS.md`;
- decision/gap totals = parse the canonical D-01 through D-67 and G-02-01
  through G-02-09 source identifiers, then validate their remediation foreign
  keys rather than retaining a stale subset;
- every `remediation_cases` and `attended_roles` foreign-key list is split only
  on the declared comma-space delimiter, resolves to a unique source row, and
  contains no duplicate ID;
- `auto` is valid only when every linked remediation case names substantive
  automated evidence; each attended role in a coverage route must appear in
  every linked remediation case, so consumers reject union-only, dangling, or
  contradictory role routes.

# Project Research Summary

**Project:** Gym Tracker v1.2 — PUSH-inspired UI/UX overhaul with multi-plan Running and imported activity foundations  
**Domain:** Personal Android Strength planning/logging, independently scheduled Running plans, and imported Garmin activity history  
**Researched:** 2026-10-06  
**Confidence:** MEDIUM overall; strong source-contract evidence, unresolved owner policies and unverified native/provider behavior  
**Status:** Planning only. Recommendations and proposed deviations below are not implementation or release approval.

## Executive Summary

Gym Tracker v1.2 is a substantial extension of an existing offline application, with approved revision 18 governing presentation and shipped SQLite, recovery, history and portability contracts governing factual behavior. The product should expose exactly Workout, Calendar, Library and Progress, bringing independent Strength and Running plans into one coherent experience. The four research streams agree that concurrent plans require a real domain migration: global activation indexes, singleton readers, schedule consumption, restore validation and merge normalization currently enforce one active plan. Preserve one recoverable in-progress Strength workout while changing plan activation and selection. The recommended limit is zero or one active plan per sport, but the owner has not yet accepted that policy. Within one Running plan, the approved builder permits multiple stable, ordered session slots on the same weekday; the domain model must not collapse them to one daily binding.

Keep the installed Expo 57 / React Native 0.86 stack and its native gesture, animation and SVG libraries. Deliver the migration and complete portable source graph first, followed by shared presentation, Workout, Calendar and Library. Implement actual FIT import, durable duplicate handling and explicit activity-to-occurrence matching before Progress consumes imported facts. Manual FIT import must be a usable local journey. Garmin Connect Activity API with OAuth2 PKCE remains the intended network integration, conditional on program approval, current partner documentation and a reviewed confidential-broker design; public evidence does not establish personal-project access or a safe secretless native flow. The eight-phase recommendation below preserves the current 172-requirement ownership model.

The largest risks are plausible-looking screens backed by the old single-plan domain, new facts omitted from backups, premature workout success feedback, fabricated import/progress evidence, and Calendar motion or accessibility that fails on Android. Prevent them with explicit occurrence identities, short exclusive transactions, immutable source revisions, versioned portability, provider-independent import contracts and native evidence tied to the tested source/artifact. Preserve legacy timing configuration and snapshots while proposing retirement of cadence/cluster authoring and playback; do not silently delete old facts or replay hidden cues. Two measured Calendar accessibility changes, DEV-01 and DEV-02, remain proposed with zero accepted deviations. Planning can proceed with these gates visible; implementation remains subject to owner review.

## Key Findings

### Recommended Stack

[STACK.md](STACK.md) supports extending the installed stack rather than combining a native-platform upgrade with this milestone. Screens should use typed runtime ports; SQLite repositories own facts, and query caches, SVG rendering, notifications and recommendations remain rebuildable. The static route outline in the prototype can be implemented from actual imported coordinates with existing SVG; it does not require street-map tiles or an interactive map SDK.

| Core technology | Baseline / candidate | Purpose and rationale |
|---|---|---|
| Expo / React Native / React | `57.0.25` / `0.86.3` / `19.2.3` | Retain the installed Android platform and compatibility baseline. |
| Expo Router | Declared `~57.0.23` | Four root destinations plus preserved and new contextual deep routes. |
| Gesture Handler / Reanimated / Worklets | `2.32.0` / `4.5.1` / `0.10.1` | Native Calendar tracking, measured row transitions and exercise reorder; worklets own visual motion. |
| `expo-sqlite` | Declared `~57.0.3` | Existing serialized writer, migrations and authoritative source graph. |
| `react-native-svg` | `15.15.4` | Factual route outlines, goal lines and sparse trends with accessible text equivalents. |
| `expo-file-system` / `expo-crypto` | Declared `~57.0.7` / `~57.0.3` | Reuse bounded read-only file selection and byte-based hashing behind platform ports. |
| Zod / TanStack Query | `4.4.3` / `5.101.4` | Validate normalized imports and cache read models without making either authoritative. |
| `@garmin/fitsdk` | Candidate `21.217.0`, not installed | Preferred official FIT decoder behind `FitDecoderPort`; adoption requires license review and Hermes/Metro validation. |
| Jest / React Native Testing Library | `29.7.0` / `14.0.1` | Existing domain and component contracts, supplemented by real SQLite and Android evidence. |

Conditional additions are `expo-auth-session`, `expo-web-browser` and possibly `expo-secure-store`, resolved against SDK 57 only after the official integration design is accepted. No provider client secret belongs in an APK or SecureStore. Existing Google Sign-In remains Google-specific. The official FIT SDK has a Garmin license, not an assumed MIT license; `fit-file-parser` `6.1.2` is a fallback candidate requiring separate semantic and compatibility evaluation. Avoid a second file picker, a new chart framework, account scraping and arbitrary ZIP import support.

Imported sample volume also affects the stack decision. Existing archives allow 32 MiB encrypted, 24 MiB plaintext, 100,000 total rows, 25,000 rows per table and 64 KiB per string. Lossless bounded source chunks and an explicit capacity preflight are preferable to unbounded rows per sample or silent source downsampling. Presentation downsampling may remain rebuildable. New temporary files and credentials need deliberate Android backup/device-transfer exclusions.

### Expected Features

[FEATURES.md](FEATURES.md) inventories 172 requirement-bearing entries, 8 excluded/superseded branches, 170 static control records and 48 dynamic action occurrences. [REQUIREMENTS.md](../../REQUIREMENTS.md) assigns every requirement to exactly one phase. These are coverage and source-inspection results, not evidence that v1.2 has been implemented.

**Must have (table stakes):**

- Real independent Strength/Running activation and schedules, explicit inactive creation, selected-occurrence identity, collision decisions, migration and complete backup/restore/merge support.
- Exactly four roots with synchronized Light/Dark/System appearance, approved typography and hierarchy, accessible sheets/toasts, and preserved history/data/recovery settings.
- Fast Workout orientation and the full Active exercise list: row editing, all nine metric profiles, independent warm-up ordinals, post-commit completion/collapse, rest recovery, reorder, undo and deliberate finish outcomes.
- Calendar month/focused views with truthful multi-event facts, one-to-one horizontal tracking, a 25% distance threshold, reversible week transitions, reduced-motion equivalence and read-only history.
- Complete Library routes, a neutral Strength/Running chooser at every creation entry, explicit activation, and persistent seven-type Running sessions with validated fields and real empty states.
- Usable local FIT import, atomic receipts, duplicate/revision outcomes, outdoor/treadmill detail and separate owner-confirmed matching.
- Comparable Progress with latest/best/target/gap, evidence and sparse/error states; explicit target/recommendation decisions; optional dated bodyweight for relative Strength views only.
- Native visual, accessibility, recovery, integrity and performance acceptance across the required configurations.

**Should have (differentiating, already included in v1.2 requirements):**

- Warm editorial Workout presentation and a compact action/rest dock that stays clear of feedback overlays.
- Calendar row movement that preserves spatial context while revealing agenda items, including adjacent-week collapse/select/expand behavior.
- Specific editable Recovery, Long run, Progression, Tempo, Intervals, Hills and Fartlek sessions without adding an in-app run recorder.
- Unified personal evidence across local Strength and imported Running, with source provenance and owner-controlled goals.

These differentiators are part of the approved scope; their category is not permission to remove them. The 2.4 km target remains 11:00, 4:35/km, 1:50/400 m and 0:55/200 m. The 10 km and Half Marathon targets remain unset until the owner chooses them.

**Defer or keep outside this milestone:**

- Functional plan-file import behind the prototype's Later entry; no executable import-plan contract exists.
- Interactive street maps, arbitrary archive extraction and broader FIT/multisport support without concrete fixtures and a reviewed need.
- Official Garmin network activation while approval/security prerequisites are absent. This is a conditional delivery proposal, not permission to mark the API requirements complete or silently remove them.

In-app run recording, extra root tabs, demographic collection, invented fitness/readiness scores, automatic matching/activation/target changes and removed cadence controls are explicitly excluded; they are not implied future roadmap commitments. Prototype timeout commits, fixture imports and demonstration buttons are not production features.

### Architecture Approach

[ARCHITECTURE.md](ARCHITECTURE.md) recommends reusing the existing plan-scoped scheduler while replacing global activation/selection assumptions. Keep planned intent, performed Strength facts, imported Running facts and confirmed matching relationships distinct. Presentation consumes typed read models and commands; an exclusive writer validates identity/revision and returns committed results. Calendar and Progress aggregate these sources without rewriting history. The baseline is code `703b9d21a900dcadbcd4138c3691256174667bf1`, schema **27**, as recorded by the architecture researcher.

**Major components:**

1. **Plan and schedule domain:** immutable plan kind, type-specific readiness, inactive creation, independent prospective schedule versions and explicit conflict commands. Existing `starterPlanRepository.ts` and `scheduleRepository.ts` require coordinated activation changes.
2. **Selection and workout runtime:** select plan/day/schedule/version/opportunity explicitly, prioritize recovered Strength sessions, and snapshot schedule provenance at start. Replace singleton readers in `plansWorkoutRepository.ts`, `scheduleRuntime.tsx` and `workoutAppRuntime.tsx`; completion uses original provenance rather than today's active plan.
3. **Running authoring:** persistent structured day revisions, goals and benchmark provenance. Schedule bindings preserve earlier intent when future sessions change.
4. **Import and matching:** a common decoder/normalization boundary, immutable import receipts/revisions, account-scoped external identity and content hash, and a separate revision-checked match ledger. Imported Running must not become fake Strength sessions to satisfy existing foreign keys.
5. **Calendar and Progress read models:** stable typed events, date-range queries, correction/removal overlays, comparable metrics and honest missing evidence. Calendar history receives presentation capabilities without mutation ports.
6. **Portability and recovery:** explicit table/column allowlists, old-format defaults, ownership filters, FK remapping, merge rules, mutation-generation triggers and deterministic rebuilds for every new source fact. Manual encrypted archives and automatic Drive backups share the canonical graph.
7. **Native presentation:** shared tokens and overlays, route return/focus context, native gesture state and a single Calendar transition authority. The source model never depends on animation completion.

Three patterns determine readiness: paired plan/schedule activation under the chosen policy; explicit identity and expected revisions on commands; and migration plus backup/restore/merge as one domain boundary. Existing per-migration commits do not provide whole-batch rollback. Historical migration effects must remain stable when source registries expand, including migration 23's use of the backup table registry; test fresh installation as well as retained upgrades without altering shipped migration bytes.

### Critical Pitfalls

1. **Partial domain migration or incomplete portability — P-01, P-02, P-03.** Removing two unique indexes is insufficient while singleton readers, restore rejection and merge demotion remain. Migrate from schema 27, retain session lineage and timing ownership, extend the entire portable graph and dirty-generation triggers, and prove independent schedules through restart and restore/merge.
2. **Visual success before durable facts, or destructive timing retirement — P-04, P-05.** Completion, rest, final exercise collapse and success feedback follow the real commit result. Preserve pending values on failure. Retain legacy configuration/snapshots; the proposed compatibility path disables advisory authoring/playback while preserving set pointers and between-set rest. Test queued callbacks and running/paused/expired legacy sessions.
3. **Calendar transitions and historical routes disagree with their facts — P-06, P-09.** Use one transition generation, measured positions, stable identities and read-only capability boundaries. A short fast drag still snaps back below 25%; crossing/receding/cancel must update the title correctly. Verify intermediate geometry, source immutability and reduced-motion state order.
4. **Garmin availability, duplicate handling or progress is invented — P-07, P-08, P-12.** Separate the usable local importer from conditional connectivity. Commit activity plus receipt atomically; distinguish same-ID/different-content revisions from duplicate imports. Matching requires the selected candidate and explicit confirmation. Preserve missing route/HR/moving-time facts as missing and compare compatible evidence only.
5. **Browser or historical evidence is mistaken for native acceptance — P-13 through P-18.** Test actual native touch regions, nonlinear 200% text, focus, themes, motion and numeric performance budgets. Use a new source/artifact-bound evidence ledger; neither v1.1 passes nor attended Samsung observations replace v1.2 automated proof. DEV-01/02 require owner disposition before their proposed presentation changes become accepted.

## Implications for Roadmap

Use the following **eight phases, 13–20**, retaining the current atomic ownership in REQUIREMENTS.md. Domain prerequisites are consumed by later UI phases without assigning the same requirement twice.

| Phase | Requirement family | Count |
|---|---|---:|
| 13 | DOM-01–17 | 17 |
| 14 | SHL-01–13 | 13 |
| 15 | WRK-01–36 | 36 |
| 16 | CAL-01–23 | 23 |
| 17 | LIB-01–36 | 36 |
| 18 | GAR-01–16 | 16 |
| 19 | PRO-01–18 | 18 |
| 20 | VER-01–13 | 13 |
| **Total** | **One owning phase per requirement** | **172** |

### Phase 13: Multi-active, Running and import domain foundation

**Rationale:** Every proposed screen depends on selection/cardinality, source identities and recoverable storage that the current single-plan model cannot supply.  
**Delivers:** Reviewed activation/cardinality policy; schema-27 successor migration; typed readiness and independent schedules; session provenance; structured Running, goals/bodyweight and imported-source/match contracts; complete portability/rebuild support and domain verification.  
**Addresses:** DOM-01–17; concurrent plans, explicit inactive creation, collision handling, source facts and history/recovery continuity.  
**Avoids:** P-01/02/03/08; hidden global deactivation, wrong opportunity consumption, orphaned import facts and backup loss.  
**Exit evidence:** Real SQLite fresh/retained migration fixtures, failure boundaries, independent activation/rotation, old/new restore/merge and new-source dirty-generation checks. Freeze the import graph now; Phase 18 owns transport and product import flows.

### Phase 14: Shared visual system, root shell and settings

**Rationale:** Subsequent surfaces need one theme, type scale, root composition, overlay behavior and navigation/focus contract.  
**Delivers:** Four roots, bundled Archivo/IBM Plex Mono, semantic tokens, Light/Dark/System, contextual sheets/top toasts, startup states and preserved settings/history/data/recovery routes.  
**Addresses:** SHL-01–13; whole-app visual continuity and reachable shipped capabilities.  
**Avoids:** P-13/14/18/19/21; inaccessible density, generic substitutions, hidden recovery tools and reset navigation state.  
**Uses:** Existing Router and native UI primitives; verify fonts, actual hit bounds, modal focus and large-text reflow. DEV-02 affects shared semantic color treatment but remains pending.

### Phase 15: Workout, Active Workout and completion

**Rationale:** Deliver the critical offline workout loop on stable domain and shared presentation before extending secondary surfaces.  
**Delivers:** Selected-occurrence Start/Resume, full preview/exercise list, row editors for all metric profiles, W/working order, compact completion/rest dock, post-commit collapse, reorder, trend, flat timing and explicit finish/write-back flows.  
**Addresses:** WRK-01–36; fast scanning and editing without losing shipped recovery and revision guarantees.  
**Avoids:** P-04/05/19; early acknowledgement, invisible legacy cue playback, stale current identity and feedback obstructing controls.  
**Exit evidence:** Deferred/failing commit behavior, duplicate taps, process death around commit/rest/finish, protected source snapshots and legacy timing compatibility. The proposed playback retirement requires owner review before adoption.

### Phase 16: Calendar and read-only detail

**Rationale:** The new Calendar requires real event aggregation and can share the Active-shaped presentation while enforcing a separate read-only capability boundary.  
**Delivers:** Month/focused agenda, sport/status encoding, 1:1 native drag, 25% title/settle behavior, measured reversible row transitions, adjacent-date sequencing, keyboard/reduced-motion equivalence and context-preserving detail routes.  
**Addresses:** CAL-01–23; correct schedules/history, compact agenda routing, planned Strength previews and preserved separate correction/management access.  
**Avoids:** P-06/09/14; stale transitions, calendar visits that mutate workouts, invented planned-session IDs and overlapping touch regions.  
**Exit evidence:** Boundary/cancel/reversal/resize geometry and semantics, zero/one/multiple-event fixtures, source-digest checks for history visits and DEV-01/02 disposition. Bind later Running/Garmin destinations through explicit route contracts and close their integration checks when Phases 17/18 land.

### Phase 17: Library, plan creation and structured Running

**Rationale:** Authoring should use the migrated domain and shared components; activation and edits must be real before imported activities are matched to scheduled runs.  
**Delivers:** Plans/Exercises views, all preserved deep routes, neutral creation chooser, owned/starter/custom lifecycles, inactive Strength/Running creation, structured seven-type editors, future schedule edits and collision choices.  
**Addresses:** LIB-01–36; actual editable plans rather than toast-only prototype state.  
**Avoids:** P-10/11/21; empty-state chooser bypass, implicit activation, unvalidated text replacing structured sessions, lost drafts and deleted sessions returning as defaults.  
**Exit evidence:** Every creation entry, restart persistence, all seven session types, last-session deletion, revision conflicts and explicit activation/impact confirmations.

### Phase 18: Garmin sync, FIT and activity detail

**Rationale:** A complete local importer provides the source evidence Progress needs and can work independently of external API approval.  
**Delivers:** Contextual Garmin route, bounded FIT pick/decode/validate/preview/commit journey, duplicate/revision handling, outdoor/treadmill detail, factual Lap/Time/Pace and explicit candidate confirmation. Official consent/sync/revoke are a conditional adapter with truthful unavailable/error states.  
**Addresses:** GAR-01–16; real personal-use import and approved integration behavior when prerequisites are met.  
**Avoids:** P-07/08; embedded secrets, fixture success, partial imports, ambiguous identity, automatic completion and invented route/moving-time values.  
**Exit evidence:** Decoder license/runtime acceptance, corruption/bounds/cancel/process-death cases, both import orders, conflict cases, exact selected-candidate matching and portability round-trips. GAR-04–07 cannot be marked complete from mocks or local FIT success; owner-approved disposition and actual provider evidence govern their availability.

### Phase 19: Progress and personal goals

**Rationale:** Imported activities and persisted Running goals must exist before the product presents Running evidence, best efforts or progress gaps.  
**Delivers:** All/Strength/Running and range filters, factual latest/best/target/gap and goal lines, sparse/empty/loading/rebuild/error states, retained exercise history, explicit target/recommendation review and optional bodyweight history.  
**Addresses:** PRO-01–18; meaningful personal evidence with accepted rather than invented targets.  
**Avoids:** P-12/21; incomparable metrics, fabricated curves, zero-valued unset goals, bodyweight changing targets and failed edits losing drafts.  
**Exit evidence:** Comparable-source fixtures, one-effort/no-effort states, exact default pacing, unset longer-distance targets, revision-checked decisions and persistence across plan/detail/Progress views.

### Phase 20: Native acceptance, accessibility and performance

**Rationale:** Cross-surface behavior and migration/recovery acceptance must be demonstrated on the completed native system. Component/domain tests remain obligations of every earlier phase.  
**Delivers:** A complete parity/evidence ledger, theme and viewport comparison, accessibility/focus/motion checks, real SQLite and Android recovery/import/gesture evidence, numeric performance results and attended Samsung review.  
**Addresses:** VER-01–13; system acceptance and reviewable future release readiness.  
**Avoids:** P-13/15/16/17/18; reusing old evidence, incomplete historical runners, unsupported launch claims and confusing device observation with authorization.  
**Exit evidence:** Light/Dark/System; 360×800, 390×844, 600×960 and 840×1080-equivalent plus landscape; 200% text, >=48dp targets, keyboard/D-pad/focus and reduced motion. Preserve the 150 ms p95 workout commit/dock budget and existing stricter interaction/launch contracts; a historical 3 s launch script does not prove 1 s warm / 2 s cold targets. Builds, device operations and release occur only in a later authorized execution session.

### Phase Ordering Rationale

- The integration sequence is **13 → 14 → 15 → 16 → 17 → 18 → 19 → 20**. The critical data dependency is **13 → 17 → 18 → 19**: independent planned intent, concrete authoring, imported facts, then progress evidence.
- Phase 13 owns source/domain invariants; Phase 18 owns provider/file adapters and import screens. No phase may expose new durable data without its backup, merge and rebuild support.
- Shared presentation can be planned against frozen contracts after Phase 13's design stabilizes. This does not authorize shipping screens over legacy singleton behavior.
- Calendar and Workout can define contextual route contracts before Running/Garmin screens exist. Later phases must close those links; a route stub is not completed end-to-end evidence.
- Splitting the earlier combined Progress/Garmin topic is justified by evidence flow and the independent provider-approval risk. FIT makes real Running facts available before Progress without pretending the official adapter is approved.
- Phase 20 integrates existing per-phase proof; it is not the first point at which migration, transaction, accessibility or process-death behavior is tested.

### Research Flags

**Use deeper phase research during planning:**

- **Phase 13:** Cardinality-dependent constraints, singleton replacement inventory, schedule provenance, migration-23 registry compatibility, strict legacy formats, imported sample capacity and the full restore/merge graph.
- **Phase 15, focused compatibility work:** Legacy advisory timing cutover, foreground/recovery/queued-callback isolation and post-commit dock behavior. Other set-command patterns are established.
- **Phase 16:** Native gesture arbitration, 25% threshold/reversal, measured two-row morph, transition interruption and Calendar accessibility proposals. This is the largest presentation-specific research need.
- **Phase 18:** FIT license/Hermes behavior, representative file semantics, external identity reconciliation, missing moving-time provenance, official API approval/PKCE/broker contract and revocation. Public marketing pages do not resolve these boundaries.
- **Phase 19, focused metrics work:** Comparable Running best-effort extraction, elapsed/timer/moving semantics and goal/bodyweight measurement basis using actual supported imported facts.
- **Phase 20, focused verification work:** Source-bound v1.2 evidence ledger, native frame/interaction instrumentation and coverage gaps in inherited runners. Design the measurement approach early.

**Established patterns can skip broad research-phase discovery:**

- **Phase 14:** Existing native routing/theme/settings and shared overlays; perform focused font, focus, touch and reflow validation under the UI specification.
- **Phase 17:** Existing plan/exercise editor, validation, revision and explicit-save patterns once Phase 13's Running contracts are fixed; research only an uncovered type-specific validation issue.
- **Established parts of Phases 15 and 19:** Existing exclusive commands, revision/history queries and explicit recommendation acceptance. Reuse their contracts while testing the new presentation and sources.

Skipping broad research does not waive phase discussion, UI specifications, executable plans, plan checks or review convergence required by the owner.

## Confidence Assessment

| Area | Confidence | Notes |
|---|---|---|
| Stack | MEDIUM | Installed versions and reuse seams were read locally. Public Garmin/Expo/FIT evidence is qualified in STACK.md; decoder adoption, native compatibility and partner access are not verified. |
| Features | HIGH for owner requirements and source traceability; MEDIUM for implementation feasibility | Owner brief, revision history, prototype source and 172 mapped requirements establish scope. Source inventory and browser evidence do not establish native runtime correctness. |
| Architecture | MEDIUM | Concrete schema-27 indexes/readers, scheduler and portability paths support the migration need. Cardinality and several policy defaults remain proposed; no new migration has run. |
| Pitfalls | MEDIUM | Risks are grounded in shipped contracts, code and official guidance. Detection plans identify future evidence rather than claimed v1.2 passes. |

**Overall confidence:** MEDIUM. There is enough evidence to create a concrete roadmap and executable plans. Owner policy, native behavior and provider access remain separate unresolved gates. The research tooling's LOW classification for an unregistered local provider is a provenance limitation; it neither invalidates the inspected owner requirements nor proves runtime behavior. Public-source findings retain the researchers' qualified confidence rather than being promoted merely because a URL is official.

### Gaps to Address

| Gap / decision | Recommended planning position | Status and affected boundary |
|---|---|---|
| Active-plan cardinality | Zero or one active plan per sport; independent Strength and Running together; preserve one recovered in-progress Strength workout. | **Pending owner decision.** Same-sport multiplicity changes indexes, selection, conflict and merge policy. Phase 13 must not call the recommendation approved. |
| Other multi-plan policy defaults | Review recovery/Strength priority, weekday-only Running/single daily slot, per-sport local-wins merge activation, one-to-one fulfillment and activation-during-workout restriction as explicit ADR proposals. | Pending review where unresolved; do not infer them from the two-sport prototype. |
| Garmin approval and broker choice | Complete FIT locally; gate official connectivity on access, current documentation and confidential credential custody. | **Pending owner disposition and external approval.** Resolve hosting/authentication/operations, scopes/delivery/backfill, token lifecycle and revoke/deletion semantics before enabling the network adapter. Preserve GAR requirements until explicitly dispositioned. |
| Legacy timing | Preserve old facts/configuration; retire cadence/cluster authoring and every advisory playback/callback path; keep between-set rest and session recovery. | **Proposal pending owner review.** Phase 15 must prove safe legacy-session recovery; unresolved cue isolation blocks cutover, not permission to delete snapshots. |
| DEV-01: Calendar target width | Proposed Calendar-only horizontal padding `min(18, max(0, (safeWidth - 348) / 2))` dp, retaining 2dp gaps and row geometry. | **Pending; not accepted.** Measured prototype day width is 44.5625px at 360px. Proposed 6dp padding at 360 and 18dp at 390 must still pass native >=48dp non-overlapping targets. |
| DEV-02: Light Strength event text | Proposed dark-orange title text `#9b470b` while retaining orange `#d97820` sport/border treatment and status patterns. | **Pending; not accepted.** Measured current contrast 3.03:1 on paper / 2.56:1 on selected fill; proposed 6.12:1 / 5.17:1. Verify blended complete/partial fills and native rendering. |
| FIT decoder and supported semantics | Review Garmin SDK license; validate Hermes/Metro, CRC, invalid sentinels, timestamps, units, sessions/laps/records and missing channels against representative files. | Phase 18 acceptance work. Manual files may have no trusted cloud activity ID; never infer one from filename/device identity. Reject unsupported multisport clearly. |
| Import retention and archive capacity | Keep raw FIT temporary by default, retain hashes and supported normalized source facts in bounded lossless chunks, and expose cumulative capacity preflight. | Proposed policy requiring review. Original-file retention or changed archive limits need explicit privacy/capacity/native-memory evidence. |
| Identity convergence and truthful metrics | Specify same ID/different bytes, same bytes/different delivery, cross-account provenance and revision conflicts; keep elapsed/timer/moving time distinct. | Phases 13/18/19. Timer-running time does not automatically prove moving time; absence is not zero. |
| Native fidelity and performance | Use parity IDs, reviewed fixture identities and actual native measurements; compare equivalent content areas with pinned dates/fonts/density. | Phase 20 closure with earlier checks. Owner's browser review is separate from this synthesis and does not establish Android acceptance. |

The authoritative deviation state is [v1.2-DEVIATIONS.md](../../design/v1.2-DEVIATIONS.md): **2 proposed, 0 accepted** at synthesis. The orchestrator manages owner clarification and records subsequent decisions; this summary introduces no duplicate questions. Approval of the prototype as a planning target does not approve these deviations, unresolved policy defaults or implementation.

## Sources

### Primary project evidence

- [Owner planning contract](../../v1.2-OWNER-BRIEF.md), [requirements](../../REQUIREMENTS.md), [source precedence](../../design/v1.2-SOURCE-PRECEDENCE.md), [prototype inventory](../../design/v1.2-prototype-inventory.json) and [deviation register](../../design/v1.2-DEVIATIONS.md) — scope, 172-entry ownership and pending owner decisions.
- [STACK.md](STACK.md), [FEATURES.md](FEATURES.md), [ARCHITECTURE.md](ARCHITECTURE.md), [PITFALLS.md](PITFALLS.md) — four synthesis inputs; retain their detailed paths, source qualifications and evidence limits.
- [Multi-active plan ADR](../../architecture/v1.2-multi-active-plans.md), [Garmin import ADR](../../architecture/v1.2-garmin-import.md), [migration risks](../../architecture/v1.2-migration-risks.md) — linked detailed proposals supporting the research; their proposed defaults are not approvals.
- Revision 18 `approved.json` and `approved-hybrid.html` under `/Users/bytedance/.gstack/projects/fchoo-gym-tracker/designs/push-inspired-workout-20261001/`; prototype SHA-256 `b5ddbad88fd465af2fa79475dc0c05efec49e551652f13c5220627730e1d9c96`. The focused `design-audit-revision18/design-audit-revision18.md` covers the active-edge review, not every native screen.
- `package.json`, `package-lock.json`, installed package metadata; schema registry/migrations 8 and 19–27; activation/schedule/workout/history and logical portability repositories; shipped verification and benchmark contracts — inspected by the four researchers, with exact references in their documents.
- [Accessibility measurements](../../design/v1.2-browser-evidence/accessibility-measurements.json) — source of the measured DEV-01/02 proposals as recorded by the deviation register; browser measurements require native verification.

### Official external sources (MEDIUM for claims established by the research)

- [Garmin program FAQ](https://developer.garmin.com/gc-developer-program/program-faq/), [Activity API](https://developer.garmin.com/gc-developer-program/activity-api/), [OAuth2 PKCE document](https://developerportal.garmin.com/sites/default/files/OAuth2PKCE_1.pdf) and [original activity export support](https://support.garmin.com/en-US/?faq=W1TvTPW8JZ6LfJSfK512Q8) — program restrictions, intended consent path, files and fallback. PKCE PDF findings used indexed excerpts; confirm the full current approved contract.
- [Garmin FIT SDK](https://developer.garmin.com/fit/get-the-sdk/), [JavaScript SDK repository](https://github.com/garmin/fit-javascript-sdk), [license](https://github.com/garmin/fit-javascript-sdk/blob/main/LICENSE.txt), [activity files](https://developer.garmin.com/fit/file-types/activity/) and [decoding cookbook](https://developer.garmin.com/fit/cookbook/decoding-activity-files/) — preferred decoder and semantic validation needs.
- [SQLite partial indexes](https://www.sqlite.org/partialindex.html), [ALTER TABLE](https://sqlite.org/lang_altertable.html) and [Expo SQLite SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/) — constraint design and transaction context, cross-checked against the existing private writer. Failed direct fetches were disclosed by the researchers.
- [Expo authentication](https://docs.expo.dev/guides/authentication/), [AuthSession](https://docs.expo.dev/versions/latest/sdk/auth-session/), [SecureStore](https://docs.expo.dev/versions/unversioned/sdk/securestore/) and [RFC 8252](https://datatracker.ietf.org/doc/html/rfc8252) — native browser consent and client-secret custody limits; conditional packages are not installed.
- [React Native performance](https://reactnative.dev/docs/performance), [Android accessibility](https://developer.android.com/guide/topics/ui/accessibility/apps) and [Android 14 font scaling](https://developer.android.com/about/versions/14/features) — release-build measurement, touch targets and nonlinear 200% text behavior.

### Secondary evidence and unresolved claims

- [Official FIT package registry](https://registry.npmjs.org/@garmin%2Ffitsdk) and [fallback parser registry](https://registry.npmjs.org/fit-file-parser) — candidate version/publication metadata. Version availability is not native compatibility or license acceptance.
- Partner scopes/endpoints, approval for this project, quotas/backfill, production token lifecycle and secretless native registration remain unestablished. Prototype simulated success and source-only inspection provide no evidence for those claims.

External sources above were accessed or searched by the researchers on 2026-10-06; undated pages must not be assigned an invented publication date. This synthesis did not independently repeat the network research or run native tests.

---
*Research completed: 2026-10-06*  
*Ready for roadmap: yes, with the named owner and external gates retained*  
*Output scope: this SUMMARY.md only; no application edits, builds, deployment or commits by the synthesizer*

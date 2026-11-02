# Project Research Summary

**Project:** Gym Tracker v1.2 — PUSH-inspired UI/UX overhaul with multi-plan Running and imported activity foundations  
**Domain:** Personal Android Strength planning/logging, independently scheduled Running plans, and imported Garmin activity history  
**Researched:** 2026-10-06; reconciled to final owner decisions 2026-10-07
**Confidence:** MEDIUM overall; strong source-contract evidence and no unresolved product decisions, with native transport/runtime behavior still unverified
**Status:** Planning only. The selected transport and accepted deviations are binding; native proof remains implementation evidence, not implementation or release approval.

## Executive Summary

Gym Tracker v1.2 is a substantial extension of an existing offline application, with approved revision 18 governing presentation and shipped SQLite, recovery, history and portability contracts governing factual behavior. The product should expose exactly Workout, Calendar, Library and Progress, bringing independent Strength and Running plans into one coherent experience. The four research streams agree that concurrent plans require a real domain migration: global activation indexes, singleton readers, schedule consumption, restore validation and merge normalization currently enforce one active plan. Preserve one recoverable in-progress Strength workout while changing plan activation and selection. MAP-01 locks zero or one active plan per sport. Within one Running plan, the approved builder permits multiple stable, ordered session slots on the same weekday; the domain model must not collapse them to one daily binding.

Keep the installed Expo 57 / React Native 0.86 stack and its native gesture, animation and SVG libraries. Deliver the migration and complete portable source graph first, followed by shared presentation, Workout, Calendar and Library. The owner selected a standalone ARM64 transport: embed Python 3.13 through Chaquopy 17.0, pin python-garminconnect 0.3.17 commit `218e72ca5459e014435fc2d94fd18bd601fa0c14`, and validate activity summary/splits/detail JSON through a narrow native/TypeScript boundary before atomic import. No Garmin program access, partner API/broker, desktop/Drive bridge, manual FIT/FIT decoder, runtime AI agent or Hermes change is in this milestone. Durable duplicate handling and explicit activity-to-occurrence matching precede Progress. The eight-phase recommendation below preserves the current 172-requirement ownership model.

The largest risks are plausible-looking screens backed by the old single-plan domain, new facts omitted from backups, premature workout success feedback, fabricated import/progress evidence, and Calendar motion or accessibility that fails on Android. Prevent them with explicit occurrence identities, short exclusive transactions, immutable source revisions, versioned portability, a typed allowlisted embedded-client boundary and native evidence tied to the tested source/artifact. TIM-01 retires cadence/cluster authoring, callbacks, reconciliation and playback without a compatibility mode while preserving ordinary history and between-set rest. DEV-01 and DEV-02 are accepted; their native geometry and contrast still require implementation evidence. Planning can proceed with zero pending product decisions; implementation remains subject to owner review.

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
| Python / Chaquopy / `python-garminconnect` | `3.13` / `17.0` / `0.3.17` at `218e72ca5459e014435fc2d94fd18bd601fa0c14` | Owner-selected ARM64 embedded client for summary/splits/detail JSON; package and native interoperability require bounded implementation proof. |
| Jest / React Native Testing Library | `29.7.0` / `14.0.1` | Existing domain and component contracts, supplemented by real SQLite and Android evidence. |

Implement the selected transport in `modules/garmin-connect/` with the TypeScript adapter under `src/platform/garmin/`. Use foreground credential/MFA input and Keystore-backed app-private encryption for DI session tokens; exclude passwords, tokens and raw responses from logs and logical backups. No provider client secret, OAuth broker, second file picker, FIT package, desktop service, new chart framework, arbitrary eval/method forwarding or arbitrary ZIP import belongs to this milestone.

Imported sample volume also affects the stack decision. Existing archives allow 32 MiB encrypted, 24 MiB plaintext, 100,000 total rows, 25,000 rows per table and 64 KiB per string. Lossless bounded source chunks and an explicit capacity preflight are preferable to unbounded rows per sample or silent source downsampling. Presentation downsampling may remain rebuildable. New temporary files and credentials need deliberate Android backup/device-transfer exclusions.

### Expected Features

[FEATURES.md](FEATURES.md) inventories 172 requirement-bearing entries, 9 excluded/superseded branches (including the prototype FIT controls superseded by the final transport), 170 static control records and 48 dynamic action occurrences. [REQUIREMENTS.md](../../REQUIREMENTS.md) assigns every requirement to exactly one phase. These are coverage and source-inspection results, not evidence that v1.2 has been implemented.

**Must have (table stakes):**

- Real independent Strength/Running activation and schedules, explicit inactive creation, selected-occurrence identity, collision decisions, migration and complete backup/restore/merge support.
- Exactly four roots with synchronized Light/Dark/System appearance, approved typography and hierarchy, accessible sheets/toasts, and preserved history/data/recovery settings.
- Fast Workout orientation and the full Active exercise list: row editing, all nine metric profiles, independent warm-up ordinals, post-commit completion/collapse, rest recovery, reorder, undo and deliberate finish outcomes.
- Calendar month/focused views with truthful multi-event facts, one-to-one horizontal tracking, a 25% distance threshold, reversible week transitions, reduced-motion equivalence and read-only history.
- Complete Library routes, a neutral Strength/Running chooser at every creation entry, explicit activation, and persistent seven-type Running sessions with validated fields and real empty states.
- Standalone embedded-client login/MFA/session recovery, bounded JSON sync, atomic receipts, duplicate/revision outcomes, outdoor/treadmill detail and separate owner-confirmed matching.
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
- Interactive street maps and arbitrary archive extraction.
- Garmin program/partner APIs, a broker, desktop/Drive transport, manual FIT/FIT decoding, runtime AI agents and a Hermes change. They are not fallback branches when native proof fails.

In-app run recording, extra root tabs, demographic collection, invented fitness/readiness scores, automatic matching/activation/target changes and removed cadence controls are explicitly excluded; they are not implied future roadmap commitments. Prototype timeout commits, fixture imports and demonstration buttons are not production features.

### Architecture Approach

[ARCHITECTURE.md](ARCHITECTURE.md) recommends reusing the existing plan-scoped scheduler while replacing global activation/selection assumptions. Keep planned intent, performed Strength facts, imported Running facts and confirmed matching relationships distinct. Presentation consumes typed read models and commands; an exclusive writer validates identity/revision and returns committed results. Calendar and Progress aggregate these sources without rewriting history. The baseline is code `703b9d21a900dcadbcd4138c3691256174667bf1`, schema **27**, as recorded by the architecture researcher.

**Major components:**

1. **Plan and schedule domain:** immutable plan kind, type-specific readiness, inactive creation, independent prospective schedule versions and explicit conflict commands. Existing `starterPlanRepository.ts` and `scheduleRepository.ts` require coordinated activation changes.
2. **Selection and workout runtime:** select plan/day/schedule/version/opportunity explicitly, prioritize recovered Strength sessions, and snapshot schedule provenance at start. Replace singleton readers in `plansWorkoutRepository.ts`, `scheduleRuntime.tsx` and `workoutAppRuntime.tsx`; completion uses original provenance rather than today's active plan.
3. **Running authoring:** persistent structured day revisions, goals and benchmark provenance. Schedule bindings preserve earlier intent when future sessions change.
4. **Import and matching:** a narrow embedded-client/normalization boundary, immutable import receipts/revisions, owner/account-scoped external identity, canonical normalized-JSON digest and raw response provenance, plus a separate revision-checked match ledger. Imported Running must not become fake Strength sessions to satisfy existing foreign keys.
5. **Calendar and Progress read models:** stable typed events, date-range queries, correction/removal overlays, comparable metrics and honest missing evidence. Calendar history receives presentation capabilities without mutation ports.
6. **Portability and recovery:** explicit table/column allowlists, old-format defaults, ownership filters, FK remapping, merge rules, mutation-generation triggers and deterministic rebuilds for every new source fact. Manual encrypted archives and automatic Drive backups share the canonical graph.
7. **Native presentation:** shared tokens and overlays, route return/focus context, native gesture state and a single Calendar transition authority. The source model never depends on animation completion.

Three patterns determine readiness: paired plan/schedule activation under the chosen policy; explicit identity and expected revisions on commands; and migration plus backup/restore/merge as one domain boundary. Existing per-migration commits do not provide whole-batch rollback. Historical migration effects must remain stable when source registries expand, including migration 23's use of the backup table registry; test fresh installation as well as retained upgrades without altering shipped migration bytes.

### Critical Pitfalls

1. **Partial domain migration or incomplete portability — P-01, P-02, P-03.** Removing two unique indexes is insufficient while singleton readers, restore rejection and merge demotion remain. Migrate from schema 27, retain session lineage and timing ownership, extend the entire portable graph and dirty-generation triggers, and prove independent schedules through restart and restore/merge.
2. **Visual success before durable facts, or incomplete timing retirement — P-04, P-05.** Completion, rest, final exercise collapse and success feedback follow the real commit result. Preserve pending values on failure. Remove cadence/cluster authoring, callbacks, reconciliation and playback with no compatibility mode, while retaining ordinary history, set pointers and between-set rest. Prove no queued callback or recovered legacy state can restart playback.
3. **Calendar transitions and historical routes disagree with their facts — P-06, P-09.** Use one transition generation, measured positions, stable identities and read-only capability boundaries. A short fast drag still snaps back below 25%; crossing/receding/cancel must update the title correctly. Verify intermediate geometry, source immutability and reduced-motion state order.
4. **Garmin availability, duplicate handling or progress is invented — P-07, P-08, P-12.** Prove the selected ARM64 embedded client can package, authenticate, read and refresh after cold restart; preserve visible 403/429/offline/sign-in-needed states. Commit activity plus receipt atomically, stage same-ID/different-content revisions, and never coalesce sources by date/title/distance alone. Matching requires the selected candidate and explicit confirmation. Preserve missing route/HR/moving-time facts as missing and compare only eligible source summary/lap evidence.
5. **Browser or historical evidence is mistaken for native acceptance — P-13 through P-18.** Test actual native touch regions, nonlinear 200% text, focus, themes, motion and numeric performance budgets. Use a new source/artifact-bound evidence ledger; neither v1.1 passes nor attended Samsung observations replace v1.2 automated proof. DEV-01/02 are accepted product choices whose implementation still needs native evidence.

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

### Phase 13: One-per-sport, Running and import domain foundation

**Rationale:** Every proposed screen depends on selection/cardinality, source identities and recoverable storage that the current single-plan model cannot supply.  
**Delivers:** Locked zero-or-one-per-sport activation; schema-27 successor migration; typed readiness and independent schedules; session provenance; structured Running, goals/bodyweight and imported-source/match contracts; complete portability/rebuild support and domain verification.
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
**Exit evidence:** Deferred/failing commit behavior, duplicate taps, process death around commit/rest/finish, protected ordinary history/between-set rest and proof that retired cadence/cluster authoring, callbacks, reconciliation and playback cannot run. TIM-01 is not reopened.

### Phase 16: Calendar and read-only detail

**Rationale:** The new Calendar requires real event aggregation and can share the Active-shaped presentation while enforcing a separate read-only capability boundary.  
**Delivers:** Month/focused agenda, sport/status encoding, 1:1 native drag, 25% title/settle behavior, measured reversible row transitions, adjacent-date sequencing, keyboard/reduced-motion equivalence and context-preserving detail routes.  
**Addresses:** CAL-01–23; correct schedules/history, compact agenda routing, planned Strength previews and preserved separate correction/management access.  
**Avoids:** P-06/09/14; stale transitions, calendar visits that mutate workouts, invented planned-session IDs and overlapping touch regions.  
**Exit evidence:** Boundary/cancel/reversal/resize geometry and semantics, zero/one/multiple-event fixtures, source-digest checks for history visits and native evidence for accepted DEV-01/02. Bind later Running/Garmin destinations through explicit route contracts and close their integration checks when Phases 17/18 land.

### Phase 17: Library, plan creation and structured Running

**Rationale:** Authoring should use the migrated domain and shared components; activation and edits must be real before imported activities are matched to scheduled runs.  
**Delivers:** Plans/Exercises views, all preserved deep routes, neutral creation chooser, owned/starter/custom lifecycles, inactive Strength/Running creation, structured seven-type editors, future schedule edits and collision choices.  
**Addresses:** LIB-01–36; actual editable plans rather than toast-only prototype state.  
**Avoids:** P-10/11/21; empty-state chooser bypass, implicit activation, unvalidated text replacing structured sessions, lost drafts and deleted sessions returning as defaults.  
**Exit evidence:** Every creation entry, restart persistence, all seven session types, last-session deletion, revision conflicts and explicit activation/impact confirmations.

### Phase 18: Standalone Garmin account sync and activity detail

**Rationale:** The owner-selected embedded client provides source evidence Progress needs without Garmin program access or a separate machine.
**Delivers:** Contextual Garmin route; pinned Python 3.13/Chaquopy 17.0/python-garminconnect client; foreground login/MFA/logout; encrypted token recovery; bounded summary/splits/detail JSON; duplicate/revision handling; outdoor/treadmill detail; factual Lap/Time/Pace; and explicit candidate confirmation.
**Addresses:** GAR-01–16; real personal-use account sync and standalone recovery.
**Avoids:** P-07/08; embedded secrets, fixture success, partial imports, ambiguous identity, automatic completion and invented route/moving-time values.  
**Exit evidence:** ARM64 package identity, native/Python interoperability, real account login/MFA/read, fresh and expired session cold restart, 403/429/offline handling, bounded malformed/oversized/truncated JSON, source-envelope fidelity, idempotent revisions, exact selected-candidate matching, portability round-trips and standalone APK operation. Synthetic evidence cannot close the live account/network proof.

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
- Splitting the earlier combined Progress/Garmin topic is justified by evidence flow: the selected embedded sync must produce real accepted Running facts before Progress consumes them.
- Phase 20 integrates existing per-phase proof; it is not the first point at which migration, transaction, accessibility or process-death behavior is tested.

### Research Flags

**Use deeper phase research during planning:**

- **Phase 13:** Cardinality-dependent constraints, singleton replacement inventory, schedule provenance, migration-23 registry compatibility, strict legacy formats, imported sample capacity and the full restore/merge graph.
- **Phase 15, focused retirement work:** Remove cadence/cluster authoring, foreground/recovery callbacks, reconciliation and playback while preserving ordinary history, between-set rest and post-commit dock behavior. Other set-command patterns are established.
- **Phase 16:** Native gesture arbitration, 25% threshold/reversal, measured two-row morph, transition interruption and Calendar accessibility proposals. This is the largest presentation-specific research need.
- **Phase 18:** Pinned Python/Chaquopy/native packaging, account login/MFA/session lifecycle, encrypted token rotation, allowlisted JSON bridge, sampling/timezone provenance, external identity reconciliation, missing moving-time honesty, bounded errors and standalone ARM64 APK behavior.
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
| Stack | MEDIUM | Installed versions and reuse seams were read locally. The selected Python/Chaquopy/client versions are source-verified; native/transitive compatibility and real account reads remain unverified implementation evidence. |
| Features | HIGH for owner requirements and source traceability; MEDIUM for implementation feasibility | Owner brief, revision history, prototype source and 172 mapped requirements establish scope. Source inventory and browser evidence do not establish native runtime correctness. |
| Architecture | MEDIUM | Concrete schema-27 indexes/readers, scheduler and portability paths support the migration need. Cardinality is owner-locked; implementation details still require tests because no new migration has run. |
| Pitfalls | MEDIUM | Risks are grounded in shipped contracts, code and official guidance. Detection plans identify future evidence rather than claimed v1.2 passes. |

**Overall confidence:** MEDIUM. There is enough evidence to create a concrete roadmap and executable plans, and there are 0 pending product decisions. Native packaging, account/network behavior and data fidelity remain implementation evidence. The research tooling's LOW classification for an unregistered local provider is a provenance limitation; it neither invalidates the inspected owner requirements nor proves runtime behavior. Public-source findings retain the researchers' qualified confidence rather than being promoted merely because a URL is official.

### Gaps to Address

| Gap / decision | Recommended planning position | Status and affected boundary |
|---|---|---|
| Active-plan cardinality | Zero or one active plan per sport; independent Strength and Running together; preserve one recovered in-progress Strength workout. | **Approved MAP-01.** Enforce per-sport uniqueness in schema/repositories and do not reopen same-sport multiplicity. |
| Other plan-policy implementation details | Preserve recovered Strength authority, multiple ordered same-weekday Running slots, one-to-one fulfillment and explicit activation/matching. Resolve merge/activation mechanics inside the locked phase contract. | Implementation design and evidence work, not an owner product question; do not introduce a one-session-per-day restriction. |
| Garmin transport | Embedded Python 3.13 + Chaquopy 17.0 + pinned python-garminconnect 0.3.17 commit `218e72ca5459e014435fc2d94fd18bd601fa0c14`, ARM64 summary/splits/detail JSON. | **Selected.** No program/partner API, broker, desktop/Drive, FIT decoder/manual FIT, runtime agent or Hermes change is a milestone branch. Native proof remains implementation evidence. |
| Legacy timing | Retire cadence/cluster authoring, callbacks, reconciliation and playback without compatibility mode; keep ordinary history and between-set rest. | **Approved TIM-01.** Prove complete cutover and no resurrected callback/playback behavior. |
| DEV-01: Calendar target width | Calendar-only padding `min(18, max(0, (safeWidth - 348) / 2))` dp, retaining 2dp gaps and row geometry. | **Accepted.** Native >=48dp non-overlapping target evidence remains pending implementation. |
| DEV-02: Light Strength event text | Dark-orange title text `#9b470b` while retaining orange `#d97820` sport/border treatment and status patterns. | **Accepted.** Verify blended complete/partial fills and native rendering. |
| Embedded-client source envelope and capacity | Persist account-scoped source identity, canonical normalized-JSON digest, raw component provenance, time bases and sampling metadata; bound payloads before one exclusive transaction. | Phase 13/18 implementation evidence; `fit_sha256` is absent without an original FIT and sampled charts cannot prove exact arbitrary-distance efforts. |
| Identity convergence and truthful metrics | Specify same ID/different bytes, same bytes/different delivery, cross-account provenance and revision conflicts; keep elapsed/timer/moving time distinct. | Phases 13/18/19. Timer-running time does not automatically prove moving time; absence is not zero. |
| Native fidelity and performance | Use parity IDs, reviewed fixture identities and actual native measurements; compare equivalent content areas with pinned dates/fonts/density. | Phase 20 closure with earlier checks. Owner's browser review is separate from this synthesis and does not establish Android acceptance. |

The authoritative deviation state is [v1.2-DEVIATIONS.md](../../design/v1.2-DEVIATIONS.md): **2 accepted, 0 pending owner decisions** after the 2026-10-07 amendment. Their native verification remains pending implementation. This summary introduces no duplicate questions and does not authorize implementation.

## Sources

### Primary project evidence

- [Owner planning contract](../../v1.2-OWNER-BRIEF.md), [final owner decisions](../../v1.2-OWNER-DECISIONS.md), [Garmin mobile feasibility](GARMIN-MOBILE-FEASIBILITY.md), [requirements](../../REQUIREMENTS.md), [source precedence](../../design/v1.2-SOURCE-PRECEDENCE.md), [prototype inventory](../../design/v1.2-prototype-inventory.json) and [deviation register](../../design/v1.2-DEVIATIONS.md) — scope, 172-entry ownership, selected transport and 0 pending product decisions.
- [STACK.md](STACK.md), [FEATURES.md](FEATURES.md), [ARCHITECTURE.md](ARCHITECTURE.md), [PITFALLS.md](PITFALLS.md) — four synthesis inputs; retain their detailed paths, source qualifications and evidence limits.
- [Plan-cardinality ADR](../../architecture/v1.2-multi-active-plans.md), [Garmin import ADR](../../architecture/v1.2-garmin-import.md), [migration risks](../../architecture/v1.2-migration-risks.md) — linked implementation detail; the final owner decisions and requirements take precedence over earlier proposals.
- Revision 18 `approved.json` and `approved-hybrid.html` under `/Users/bytedance/.gstack/projects/fchoo-gym-tracker/designs/push-inspired-workout-20261001/`; prototype SHA-256 `b5ddbad88fd465af2fa79475dc0c05efec49e551652f13c5220627730e1d9c96`. The focused `design-audit-revision18/design-audit-revision18.md` covers the active-edge review, not every native screen.
- `package.json`, `package-lock.json`, installed package metadata; schema registry/migrations 8 and 19–27; activation/schedule/workout/history and logical portability repositories; shipped verification and benchmark contracts — inspected by the four researchers, with exact references in their documents.
- [Accessibility measurements](../../design/v1.2-browser-evidence/accessibility-measurements.json) — source of the accepted DEV-01/02 values recorded by the deviation register; browser measurements still require native verification.

### Superseded transport research sources (historical, not executable scope)

- [Garmin program FAQ](https://developer.garmin.com/gc-developer-program/program-faq/), [Activity API](https://developer.garmin.com/gc-developer-program/activity-api/), [OAuth2 PKCE document](https://developerportal.garmin.com/sites/default/files/OAuth2PKCE_1.pdf) and [original activity export support](https://support.garmin.com/en-US/?faq=W1TvTPW8JZ6LfJSfK512Q8) — program restrictions, intended consent path, files and fallback. PKCE PDF findings used indexed excerpts; confirm the full current approved contract.
- [Garmin FIT SDK](https://developer.garmin.com/fit/get-the-sdk/), [JavaScript SDK repository](https://github.com/garmin/fit-javascript-sdk), [license](https://github.com/garmin/fit-javascript-sdk/blob/main/LICENSE.txt), [activity files](https://developer.garmin.com/fit/file-types/activity/) and [decoding cookbook](https://developer.garmin.com/fit/cookbook/decoding-activity-files/) — preferred decoder and semantic validation needs.
- [SQLite partial indexes](https://www.sqlite.org/partialindex.html), [ALTER TABLE](https://sqlite.org/lang_altertable.html) and [Expo SQLite SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/) — constraint design and transaction context, cross-checked against the existing private writer. Failed direct fetches were disclosed by the researchers.
- [Expo authentication](https://docs.expo.dev/guides/authentication/), [AuthSession](https://docs.expo.dev/versions/latest/sdk/auth-session/), [SecureStore](https://docs.expo.dev/versions/unversioned/sdk/securestore/) and [RFC 8252](https://datatracker.ietf.org/doc/html/rfc8252) — native browser consent and client-secret custody limits; conditional packages are not installed.
- [React Native performance](https://reactnative.dev/docs/performance), [Android accessibility](https://developer.android.com/guide/topics/ui/accessibility/apps) and [Android 14 font scaling](https://developer.android.com/about/versions/14/features) — release-build measurement, touch targets and nonlinear 200% text behavior.

### Secondary superseded evidence

- [Official FIT package registry](https://registry.npmjs.org/@garmin%2Ffitsdk) and [fallback parser registry](https://registry.npmjs.org/fit-file-parser) — candidate version/publication metadata. Version availability is not native compatibility or license acceptance.
- Partner scopes/endpoints and FIT candidates remain unestablished because they are outside the selected milestone transport. Prototype simulated success and source-only inspection provide no evidence for the embedded client's native behavior.

External sources above were accessed or searched by the researchers on 2026-10-06; undated pages must not be assigned an invented publication date. This synthesis did not independently repeat the network research or run native tests.

---
*Research completed: 2026-10-06*  
*Ready for roadmap: yes, with the named owner and external gates retained*  
*Output scope: this SUMMARY.md only; no application edits, builds, deployment or commits by the synthesizer*

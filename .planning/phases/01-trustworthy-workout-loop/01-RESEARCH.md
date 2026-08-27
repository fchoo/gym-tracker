# Phase 1: Trustworthy Workout Loop - Research

**Researched:** 2026-08-16
**Domain:** Offline-first Expo Android workout loop, SQLite integrity kernel, lifecycle recovery, and native feasibility
**Confidence:** HIGH for architecture and build order; MEDIUM until pinned native contracts pass on Android

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Delivery and Native Foundation
- **D-01:** Use the pinned Expo SDK 57 compatibility family, strict TypeScript, Expo Router, CNG, and an uncommitted generated `android/` directory.
- **D-02:** Configure the Android SDK, adb, pinned supported Java/Node/npm toolchain, clean prebuild, development-test APK, and artifact hashing before feature implementation proceeds.
- **D-03:** Encode Android Auto Backup and device-to-device exclusions from Phase 1 so clean-install and manual-backup semantics are trustworthy.
- **D-04:** Build a private development-test artifact path now; signed candidate promotion remains Phase 5.

### Persistence Integrity
- **D-05:** SQLite source facts are authoritative; notifications, projections, recommendations, FTS, and UI query caches are disposable, replayable, or rebuildable derivatives.
- **D-06:** Do not use `withExclusiveTransactionAsync()` as the integrity kernel. Prove and implement one private preconfigured writer connection, FIFO write queue, separate WAL reader, connection-local foreign keys, bounded busy timeout, and explicit `BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK`. — **Reversibility:** costly — all source mutations and migration guarantees depend on this write contract.
- **D-07:** Screens and hooks never execute SQL. Domain commands own narrow repository ports and return authoritative committed state.
- **D-08:** Source writes and typed pending-effect rows commit atomically; notifications, haptics, query invalidation, file IO, and UI updates run only after commit.
- **D-09:** Durable pending effects use stable IDs, unique idempotency keys, leases, stale-claim recovery, bounded retry, and source-revision checks.
- **D-10:** Migrations are numbered, forward-only, exclusive, fixture-tested, and launch-blocking on failure; destructive/long migrations require validated logical recovery before mutation.

### Workout and Rest Behavior
- **D-11:** Activating Full Body Foundation clones it into user-owned copied rows; schedule, target revisions, sessions, and recommendations bind to the copy.
- **D-12:** Today keeps the Start action primary and shows next target plus comparable history; pending suggestions are visible but never replace an unaccepted target.
- **D-13:** Warm-ups use full-size W rows, can be added/copied/skipped, collapse when complete, remain visible in history, and never affect working-set completion, records, or progression.
- **D-14:** Set completion is the active row's one primary Complete action plus equivalent touch/keyboard/D-pad activation. Complete and Skip share one compact row; the command validates, commits exactly once, advances, creates Undo/rest state, then triggers post-commit effects.
- **D-15:** A failed set save preserves values, does not advance or start rest, and transforms the dock to `Set not saved · Retry`.
- **D-16:** Undo is available for eight seconds and restores the serialized prior active-set and rest state transactionally.
- **D-17:** Automatic rest starts only when another working set or explicit between-exercise rest exists. Manual rest is available from Active Workout using the exercise's configured duration even without a just-completed set.
- **D-18:** Rest state is `idle`, `running`, `paused`, or `expired`, derived from timestamps. Controls are pause/resume, minus 15 seconds, plus 15 seconds, and skip.
- **D-19:** SQLite rest state is authoritative. One reconciler repairs Android notifications after relevant commits, launch, foreground, permission changes, Undo, finish, and supported boot handling; late or denied notifications never alter workout truth.
- **D-20:** The app guarantees launch recovery after reboot. Stronger exact delivery or boot rescheduling ships only if the focused Android spike proves and justifies the native permission/configuration.
- **D-21:** Explicit session outcomes distinguish in-progress, completed, partial, discarded, skipped exercise, zero-set outcome, and manual visit; completing as partial requires user intent rather than an inferred threshold.

### Design and Accessibility
- **D-22:** Use the approved precision-instrument system: Source Sans 3, IBM Plex Mono numerals, card-light sections, semantic cobalt/green/amber/red, and System/Light/Dark.
- **D-23:** Root navigation is Today, Calendar, Library, Progress; Active Workout hides root navigation. Phase 1 may show intentional empty states for destinations not implemented yet.
- **D-24:** Build compact, medium, and expanded layout primitives, safe areas, 200% text, meaningful labels, focus restoration, keyboard/D-pad access, reduced motion, and non-color cues from the first screen.
- **D-25:** Set completion and rest controls remain at least 48dp and adjacent to the active work at every width class.

### Contracts, Testing, and Diagnostics
- **D-26:** Use schema-first Zod contracts at persistence/platform boundaries and pure validated values inside domain rules.
- **D-27:** Use vertical domain modules, explicit application ports, adapter-only platform code, route-only `app/`, and import-boundary enforcement.
- **D-28:** Use TanStack Query only for disposable reads. Do not optimistically commit workout source facts.
- **D-29:** Use typed application errors and redacted bounded diagnostics; never log passwords, keys, backup plaintext, notes, set payloads, or SQL parameters.
- **D-30:** Establish Jest/jest-expo, React Native Testing Library, host SQLite semantics, actual Expo SQLite device contracts, and Maestro Android smoke in the reviewed CI order.
- **D-31:** Integrity-critical domain/application code requires complete branch coverage; remaining testable TypeScript uses the reviewed high global thresholds.
- **D-32:** PR smoke includes fresh launch, copied starter activation, workout start, one set commit, rest transition, `killApp`, and recovery.
- **D-33:** Spike the app-owned Argon2id native path in Phase 1 for known-answer support, off-interaction execution, CNG registration, ABI/page-size compatibility, and minimum-device timing; user-facing backup remains Phase 5.

### Claude's Discretion
- Exact internal naming within the locked module boundaries.
- Exact choice of icon family matching the approved outlined 2dp style.
- Exact implementation of test-only seed installation, provided it uses supported public test seams rather than arbitrary Maestro SQL.
- Exact dev diagnostic presentation behind the approved redaction boundary.

### Deferred Ideas (OUT OF SCOPE)
- Full reviewed 300+ catalog, custom exercises, full plan editor, and complete schedules belong to Phase 2.
- Calendar corrections and reversible session removal belong to Phase 3.
- Overall Progress and complete progression breadth belong to Phase 4.
- User-facing encrypted backup/restore, CSV, signed promotion, and final release matrix belong to Phase 5.
- Wear OS, Health Connect, cluster-set timers, cloud sync, social features, AI coaching, nutrition, measurements, and unverified exercise media remain outside v1.

### Reviewed Todos (not folded)
- `TODOS.md` post-implementation visual QA remains a Phase 5 release gate because no implemented UI exists yet.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|---|---|---|
| FOUND-01 | Owner can use the workout critical path without an account or network connection. | Local SQLite-only command/query flow; airplane-mode smoke. |
| FOUND-02 | App provides Today, Calendar, Library, and Progress root destinations, with active workouts hiding root navigation. | Route-only shell structure and focused workout route. |
| FOUND-03 | App uses SQLite source facts as authority and does not acknowledge source writes before their exclusive transaction commits. | Private writer, FIFO, `BEGIN IMMEDIATE`, commit latch contracts. |
| FOUND-04 | App replays durable pending effects after process death without duplicating notifications, projections, or recommendations. | Leased outbox, idempotency keys, stale-claim recovery. |
| FOUND-05 | App can migrate every retained schema fixture transactionally and recover from a failed destructive migration without losing existing user data. | Forward migrations, per-version fixtures, pre-migration backup seam. |
| FOUND-06 | App provides typed runtime contracts, errors, and privacy-safe diagnostics at persistence and platform boundaries. | Zod boundary schemas, error translation, redaction tests. |
| FOUND-07 | App follows the approved precision-instrument design tokens and component vocabulary in System, Light, and Dark appearance modes. | `01-UI-SPEC.md` is the implementation contract. |
| FOUND-08 | App supports compact, medium, and expanded Android window classes without moving the active workout action away from the current work. | Shared adaptive primitives and device matrix. |
| FOUND-09 | App supports 200% text, keyboard/D-pad access, logical focus, reduced motion, non-color cues, meaningful labels, and minimum 48dp targets from the first shipped screen. | Component semantics plus physical/manual Phase 1 gate. |
| WORK-01 | Owner can activate the bundled Full Body Foundation template as a user-owned copied plan without mutating bundled content. | Immutable seed plus one-transaction clone activation. |
| WORK-02 | Today shows the scheduled plan day, estimated duration, consistent Next target values, latest comparable history, and pending recommendation status. | Trusted Today query from copied plan and source facts. |
| WORK-03 | Owner can start a scheduled plan day, choose another plan day, train on a rest day without silently advancing the schedule, or start an empty workout. | Explicit start commands and schedule non-mutation fixtures. |
| WORK-04 | Starting a planned workout stores immutable snapshots of exercise names, order, metric profiles, units, targets, and rule versions. | Session-start snapshot transaction. |
| WORK-05 | Owner can select recommended, last comparable, plan default, or manual values for each working set. | Versioned `load_reps` value-source contract. |
| WORK-06 | Owner can add, copy, complete, skip, and review optional warm-up sets that never affect working-set completion, records, or progression. | Separate set kind and exclusion matrix. |
| WORK-07 | Owner can complete the active working set through the active row's primary action or equivalent touch/keyboard/D-pad input exactly once, even under rapid repeated input. | One command path, conditional update, FIFO and duplicate tests. |
| WORK-08 | A completed set advances, haptics, Undo, rest state, and notification work only after its source facts and durable effects commit successfully. | Atomic source/outbox write and post-commit dispatcher. |
| WORK-09 | A failed set save preserves entered values, does not advance or start rest, and shows inline `Set not saved · Retry`. | Failure injection at every statement and persisted draft state. |
| WORK-10 | Owner can undo a completed set for eight seconds and restore its prior active-set and rest state. | Transactional undo snapshot with clock-controlled expiry. |
| WORK-11 | Automatic between-set rest derives from persisted timestamps and supports pause, resume, subtract 15 seconds, add 15 seconds, and skip. | Pure rest state machine and persisted commands. |
| WORK-12 | Owner can manually start rest from Active Workout using the exercise's configured rest duration, even when no preceding set has just completed. | Separate `startManualRest` command. |
| WORK-13 | App reconciles Android rest notifications from persisted SQLite state after relevant commits, launch, foreground, permission change, Undo, finish, and supported boot handling. | Stable-ID notification reconciler and trigger matrix. |
| WORK-14 | Denied, late, missing, or stale notifications never change workout truth or prevent the in-app timer from remaining correct. | No exact-alarm dependency; timestamp truth; stale revision rejection. |
| WORK-15 | After backgrounding, rotation, or Android process death, app restores the active exercise, active set, entered values, and running/paused/expired rest state. | Persisted drafts, launch coordinator, Maestro `killApp`. |
| WORK-16 | Owner can finish a workout as completed or partial, resume it later when valid, or discard it only after destructive confirmation. | Explicit outcome commands and confirmation states. |
| WORK-17 | Session statuses distinguish in-progress, completed, partial, discarded, voided, manual visit, skipped exercise, and zero-set outcomes using explicit rules. | Status enum and table-driven transition tests. |
| WORK-18 | Completion shows duration, exercises completed, working sets completed, metric-appropriate exercise results, optional effort, and the next useful action. | Source-backed completion query and `load_reps` result. |
| REL-01 | Project uses Expo CNG from committed config/plugins and can reproducibly generate a clean Android development-test build without committed `android/`. | Clean prebuild, generated assertions, APK hash. |
| REL-02 | Every pull request runs typecheck, lint, unit, component, host SQLite, coverage, native Expo SQLite, and Android smoke gates in the reviewed order. | Layered command and CI architecture below. |
</phase_requirements>

## Summary

Phase 1 should be planned as a tracer-first integrity proof: configure the Android/CNG toolchain, prove the production SQLite writer on actual Expo SQLite, then carry one copied Full Body Foundation `load_reps` workout through set commit, rest, process death, completion, and explicit recommendation acceptance. Infrastructure that is not exercised by this tracer should not be generalized yet. [VERIFIED: `.planning/ROADMAP.md`, `01-CONTEXT.md`, `01-UI-SPEC.md`]

The most important correction to generic Expo guidance is to avoid `withExclusiveTransactionAsync()` as the app's integrity kernel. Expo SDK 57 creates a new connection for that helper, while `foreign_keys` and `busy_timeout` are connection-local; the helper also starts its transaction before application code can configure that connection. The implementation must therefore own one private, preconfigured writer opened with a distinct connection, serialize every mutation through a FIFO, and issue explicit `BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK`. [CITED: https://github.com/expo/expo/blob/sdk-57/packages/expo-sqlite/src/SQLiteDatabase.ts] [CITED: https://www.sqlite.org/lang_transaction.html] [CITED: https://www.sqlite.org/pragma.html]

The machine already contains Android API 36, Build Tools 36.0.0, NDK 27.1.12297006, CMake 3.22.1, and platform-tools under `/opt/homebrew/share/android-commandlinetools`, but the shell does not expose that SDK or `adb`; emulator/system image, Java 17, Node 24.19.0, npm 11.17.0, and Maestro 2.8.0 still need installation or activation. [VERIFIED: local tool audit 2026-08-16]

**Primary recommendation:** Make native toolchain/CNG and private-writer contracts hard prerequisites; only then implement the Full Body Foundation `load_reps` vertical slice.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|---|---|---|---|
| Workout interaction and accessible shell | Browser / Client | — | React Native renders controls but owns no source truth. |
| Workout commands and progression rule | API / Backend (in-process application tier) | Database / Storage | Application commands validate and orchestrate repository ports. |
| Source facts, migrations, drafts, rest, outbox | Database / Storage | API / Backend | SQLite is authoritative and transactions define acknowledgement. |
| Android notification and haptic projection | Browser / Client platform adapter | Database / Storage | Adapter reconciles from SQLite; platform state is disposable. |
| CNG, native module, APK production | Frontend Server / Build tier | Android platform | Committed config/plugins generate the native project and artifact. |

The tier mapping follows the project's local modular-monolith contract rather than introducing a network backend. [VERIFIED: `.planning/research/ARCHITECTURE.md`]

## Project Constraints (from `.trae/rules/`)

- Read and honor `AGENTS.md` and the approved design/engineering source documents. [VERIFIED: `.trae/rules/rules.md`]
- SQLite source facts remain authoritative; notifications, projections, and recommendations must be replayable or rebuildable. [VERIFIED: `.trae/rules/rules.md`]
- Never acknowledge a set before its exclusive source/effect transaction commits. [VERIFIED: `.trae/rules/rules.md`]
- Preserve bundled versus user-owned data boundaries and keep the workout critical path offline. [VERIFIED: `.trae/rules/rules.md`]
- Write tests with each behavior; integrity-critical modules require complete branch coverage. [VERIFIED: `.trae/rules/rules.md`]
- Use atomic commits; commit messages require the TRAE co-author trailer. [VERIFIED: `.trae/rules/rules.md`]

## Standard Stack

### Core

| Library / Tool | Version | Purpose | Provenance |
|---|---:|---|---|
| Node.js | `24.19.0` exact | Local/CI runtime | [VERIFIED: Node release index + RN 0.86 engine range] |
| npm | `11.17.0` exact | Locked package manager | [VERIFIED: npm registry] |
| Expo | `~57.0.13` | SDK/CNG compatibility owner | [VERIFIED: Expo SDK 57 template] `[WARNING: flagged as suspicious — verify before using.]` |
| Expo Router | `~57.0.13` | Root shell and focused workout routes | [VERIFIED: Expo SDK 57 template] `[WARNING: flagged as suspicious — verify before using.]` |
| React / React Native | `19.2.3` / `0.86.2` exact | SDK runtime pair | [VERIFIED: Expo SDK 57 template] |
| TypeScript | `~6.0.3` | Strict application code | [VERIFIED: Expo SDK 57 template] |
| `expo-sqlite` | `~57.0.1` | Source facts, migrations, outbox, native contracts | [VERIFIED: Expo bundled module map; npm legitimacy OK] |
| `expo-notifications` | `~57.0.11` | Best-effort rest notification projection | [VERIFIED: Expo bundled/current module map] `[WARNING: flagged as suspicious — verify before using.]` |
| `expo-haptics` | `~57.0.1` | Post-commit feedback | [VERIFIED: Expo bundled module map; npm legitimacy OK] |
| `@tanstack/react-query` | `5.101.4` exact | Disposable read cache only | [VERIFIED: official TanStack docs + registry] `[WARNING: flagged as suspicious — verify before using.]` |
| `zod` | `4.4.3` exact | Boundary schemas | [VERIFIED: official Zod docs + npm legitimacy OK] |

### Supporting

| Library / Tool | Version | Purpose | Provenance |
|---|---:|---|---|
| `expo-crypto` | `~57.0.1` | Random bytes and later AES-GCM seam | [VERIFIED: Expo module map; npm legitimacy OK] |
| `expo-file-system` | `~57.0.4` | Internal migration recovery/artifact seams | [VERIFIED: Expo current module map] `[WARNING: flagged as suspicious — verify before using.]` |
| `expo-sharing` | `~57.0.12` | Later explicit export sharing seam | [VERIFIED: Expo current module map] `[WARNING: flagged as suspicious — verify before using.]` |
| `expo-document-picker` | `~57.0.1` | Later restore input seam; no Phase 1 UI | [VERIFIED: Expo module map; npm legitimacy OK] |
| Jest / `jest-expo` | `29.7.0` / `~57.0.4` | Unit/component tests | [CITED: https://docs.expo.dev/develop/unit-testing/] `[WARNING: jest-expo flagged as suspicious — verify before using.]` |
| RNTL | `14.0.1` exact | Component, semantics, interaction states | [VERIFIED: npm legitimacy OK] |
| Node `node:sqlite` | Node 24 built-in, Stability 1.2 | Host SQL/migration semantics without another package | [CITED: https://nodejs.org/docs/latest-v24.x/api/sqlite.html] |
| Maestro | `2.8.0` exact | Android lifecycle/smoke | [VERIFIED: official GitHub release, published 2026-07-31] |
| Bouncy Castle `bcprov-jdk18on` | `1.85.2` exact Maven artifact | Argon2id primitive in app-owned local Expo module | [VERIFIED: Maven Central + Bouncy Castle Javadoc, published 2026-08-07] |

`node:sqlite` is only the host semantics adapter; it is not proof of Expo connection behavior. [CITED: https://nodejs.org/docs/latest-v24.x/api/sqlite.html] [VERIFIED: project testing contract]

### Alternatives Considered

| Instead of | Could Use | Decision |
|---|---|---|
| Private writer + explicit SQL transaction | Expo `withExclusiveTransactionAsync()` | Reject as integrity kernel because its fresh connection is not application-preconfigured. |
| Built-in `node:sqlite` host adapter | Additional native Node SQLite package | Do not add a package before a demonstrated host gap. |
| App-owned Argon2 module + Bouncy Castle | Community React Native Argon2 wrapper | Reject until independently proven against SDK 57/CNG; keep the native surface narrow. |
| Timestamp-derived rest | In-memory decrementing timer | Reject because process death/background time would drift. |
| SQLite truth | Persisted TanStack cache or optimistic source updates | Reject; cache remains disposable. |

### Installation and Toolchain Commands

```bash
# JavaScript toolchain
source /opt/homebrew/opt/nvm/libexec/nvm.sh
nvm install 24.19.0
nvm use 24.19.0
npm install --global npm@11.17.0
node --version
npm --version

# Java 17
brew install --cask temurin@17
export JAVA_HOME="$("/usr/libexec/java_home" -v 17)"

# Existing Homebrew Android SDK root
export ANDROID_HOME="/opt/homebrew/share/android-commandlinetools"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"

# Retain installed required packages and add emulator/image.
yes | sdkmanager --sdk_root="$ANDROID_HOME" --licenses
sdkmanager --sdk_root="$ANDROID_HOME" \
  "platform-tools" \
  "platforms;android-36" \
  "build-tools;36.0.0" \
  "ndk;27.1.12297006" \
  "cmake;3.22.1" \
  "emulator" \
  "system-images;android-36;google_apis;arm64-v8a"

echo no | avdmanager create avd \
  --name gym-tracker-api36 \
  --package "system-images;android-36;google_apis;arm64-v8a" \
  --device "pixel_7"

emulator -avd gym-tracker-api36 -no-snapshot-save
adb wait-for-device
```

The SDK path and already-installed package versions above were read from this machine; the emulator and system image were absent. [VERIFIED: local tool audit 2026-08-16]

```bash
# Scaffold into a temporary directory because this repository already contains planning files.
tmp="$(mktemp -d)"
npx create-expo-app@4.0.0 "$tmp/app" --template default@sdk-57
# Copy only application scaffold files into the repository; do not overwrite .planning or project rules.

npm pkg set packageManager="npm@11.17.0"
printf '24.19.0\n' > .nvmrc

npx expo install expo-router expo-sqlite expo-notifications expo-haptics \
  expo-crypto expo-file-system expo-sharing expo-document-picker
npm install --save-exact @tanstack/react-query@5.101.4 zod@4.4.3
npx expo install --dev jest@29.7.0 jest-expo@57.0.4 \
  @types/jest@29.5.14 @testing-library/react-native@14.0.1

npx expo install --check
npx expo-doctor
npx expo prebuild --clean --platform android
./android/gradlew --no-daemon :app:assembleDebug
shasum -a 256 android/app/build/outputs/apk/debug/app-debug.apk \
  > android/app/build/outputs/apk/debug/app-debug.apk.sha256
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
"$ANDROID_HOME/build-tools/36.0.0/zipalign" -c -P 16 -v 4 \
  android/app/build/outputs/apk/debug/app-debug.apk
```

Expo documents CNG native directories as disposable output and directs native customization into config plugins/local modules. [CITED: https://docs.expo.dev/workflow/continuous-native-generation/] Android documents `zipalign -P 16` for APK page-size verification. [CITED: https://developer.android.com/guide/practices/page-sizes]

## Package Legitimacy Audit

The seam flags very recent releases as `SUS` even when they come from the official Expo/TanStack repositories. Per policy, every `SUS` package still requires a `checkpoint:human-verify` immediately before installation. [VERIFIED: `gsd-tools query package-legitimacy check`, 2026-08-16]

| Package | Registry | Latest-Publish Signal | Downloads / Week | Source Repo | Verdict | Disposition |
|---|---|---:|---:|---|---|---|
| `expo` | npm | 2 days | 7.7M | `github.com/expo/expo` | SUS | Flagged — checkpoint |
| `expo-router` | npm | 2 days | 5.1M | `github.com/expo/expo` | SUS | Flagged — checkpoint |
| `expo-sqlite` | npm | 1 month | 907K | `github.com/expo/expo` | OK | Approved |
| `expo-notifications` | npm | 2 days | 3.7M | `github.com/expo/expo` | SUS | Flagged — checkpoint |
| `expo-haptics` | npm | 1 month | 3.7M | `github.com/expo/expo` | OK | Approved |
| `expo-crypto` | npm | 1 month | 3.2M | `github.com/expo/expo` | OK | Approved |
| `expo-file-system` | npm | 2 days | 7.8M | `github.com/expo/expo` | SUS | Flagged — checkpoint |
| `expo-sharing` | npm | 2 days | 1.8M | `github.com/expo/expo` | SUS | Flagged — checkpoint |
| `expo-document-picker` | npm | 1 month | 2.0M | `github.com/expo/expo` | OK | Approved |
| `@tanstack/react-query` | npm | 26 days | 63.7M | `github.com/TanStack/query` | SUS | Flagged — checkpoint |
| `zod` | npm | 3 months | 254M | `github.com/colinhacks/zod` | OK | Approved |
| `jest` | npm | established | 46M | `github.com/jestjs/jest` | OK | Approved |
| `jest-expo` | npm | 6 days | 2.6M | `github.com/expo/expo` | SUS | Flagged — checkpoint |
| `@types/jest` | npm | established | 42M | `github.com/DefinitelyTyped/DefinitelyTyped` | OK | Approved |
| `@testing-library/react-native` | npm | 2 months | 3.4M | `github.com/callstack/react-native-testing-library` | OK | Approved |

**Packages removed due to `[SLOP]` verdict:** none. The seam does not accept `name@version` inputs reliably; version-qualified `SLOP` outputs were discarded as tool-input artifacts after the unqualified package checks and registry lookups proved the package names. [VERIFIED: seam output + registry lookup]

**Packages flagged as suspicious `[SUS]`:** `expo`, `expo-router`, `expo-notifications`, `expo-file-system`, `expo-sharing`, `@tanstack/react-query`, `jest-expo`.

**Audit gap:** React, React Native, TypeScript, Create Expo App, Lucide React Native, and the exact font-delivery packages come from locked official project/template contracts but were not passed through the legitimacy seam in this run. The planner must add one full package-gate checkpoint before the first install and pin any icon/font package only after it passes. [ASSUMED]

## Architecture Patterns

### System Architecture Diagram

```text
Touch / keyboard / D-pad / Maestro
                 |
                 v
Route-only screen -> application command -> FIFO writer
                                             |
                                             v
                                  BEGIN IMMEDIATE
                                  validate expected revision
                                  write source facts
                                  write pending_effects
                                  COMMIT / ROLLBACK
                                             |
                         commit succeeds -----+----- fails
                               |                        |
                               v                        v
                     committed state            preserve values
                     exact invalidation         Set not saved · Retry
                     effect runner
                       |       |
                       v       v
                 notification haptic/query cache
                    adapter       (derivatives only)

Separate WAL reader -> trusted read models -> Today / workout / completion
```

This flow ensures that all user-visible success and external work occurs after the authoritative transaction. [VERIFIED: `01-CONTEXT.md`; CITED: https://www.sqlite.org/lang_transaction.html]

### Recommended Project Structure

```text
app/
├── _layout.tsx
├── (tabs)/
│   ├── _layout.tsx
│   ├── index.tsx                 # Today
│   ├── calendar.tsx
│   ├── library.tsx
│   └── progress.tsx
├── workout/[sessionId].tsx       # focused route; root navigation hidden
├── session/[sessionId].tsx
└── __native-contracts.tsx        # development-test build only

src/
├── bootstrap/
│   ├── launchCoordinator.ts
│   └── appContainer.ts
├── domains/
│   ├── shared/{ids,metrics,time,errors,diagnostics}/
│   ├── content/{contracts,application,ports}/
│   ├── plans/{contracts,application,ports}/
│   ├── workout/{contracts,domain,application,ports}/
│   └── progression/{contracts,domain,application,ports}/
├── platform/
│   ├── sqlite/{connection,writer,migrations,repositories,effects}/
│   ├── notifications/
│   ├── haptics/
│   └── clock/
├── ui/{theme,primitives,components,hooks,accessibility}/
└── testing/{contracts,fixtures,fakes,builders,native}/

modules/
└── argon2-kdf/                    # app-owned Expo module
plugins/
└── withAndroidBackupRules.ts
assets/
├── content/full-body-foundation.v1.json
└── fonts/
tests/
├── sqlite-host/
├── migrations/fixtures/
└── contracts/
maestro/
├── smoke/
└── lifecycle/
scripts/
├── doctor-android.sh
├── assert-generated-android.mjs
├── check-cng-reproducible.sh
├── run-native-sqlite-contracts.mjs
└── hash-apk.sh
```

Routes stay thin; domain internals are exposed only through each domain's `index.ts`; `src/ui` cannot import `src/platform`; repository adapters implement domain ports. [VERIFIED: `.planning/research/ARCHITECTURE.md`]

### Pattern 1: Private Preconfigured Writer

Open the writer with `useNewConnection: true`, apply `journal_mode=WAL` outside transactions, then apply `foreign_keys=ON` and a bounded `busy_timeout` on every owned connection. Open the reader only after migrations complete and configure its own connection-local PRAGMAs. [CITED: https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/] [CITED: https://www.sqlite.org/pragma.html]

```typescript
// Research pattern, not implementation.
writer open -> WAL -> foreign_keys=ON -> busy_timeout
enqueue FIFO -> BEGIN IMMEDIATE -> repository statements
             -> COMMIT -> return committed state
             -> on error ROLLBACK -> typed storage error
```

Use an initial `busy_timeout` of `1000 ms`, make it one tested constant, and revise only from contention/device evidence. [ASSUMED]

### Private Writer Proof Plan

Feature mutation work must remain blocked until the same production wrapper passes these cases in the installed development-test APK:

1. Writer and reader report `journal_mode=wal`, `foreign_keys=1`, and the configured bounded timeout. [CITED: https://www.sqlite.org/pragma.html]
2. An invalid foreign key written through the production transaction executor fails and leaves no row. [CITED: https://www.sqlite.org/foreignkeys.html]
3. Concurrent enqueues start and commit in FIFO order; the second command cannot enter the transaction before the first settles. [VERIFIED: project D-06]
4. `BEGIN IMMEDIATE` acquires write intent up front; a deliberately competing connection returns bounded `SQLITE_BUSY` rather than hanging. [CITED: https://www.sqlite.org/lang_transaction.html]
5. A separate WAL reader sees only committed state and remains usable while a short writer transaction is open. [CITED: https://www.sqlite.org/wal.html]
6. Failure injected before and after every statement rolls back source rows, `pending_effects`, revisions, active pointer, rest state, and `user_version`. [VERIFIED: project failure matrix]
7. A commit latch proves the command promise, haptic, notification, invalidation, Undo, and success UI remain pending until `COMMIT` resolves. [VERIFIED: project D-08]
8. Rapid duplicate completion produces one completed set and one idempotency key; the second command returns current committed state without a second effect. [VERIFIED: WORK-07]
9. Prepared statements finalize in `finally`, including rollback/error paths; repeated suites leave no active transaction or lock growth. [CITED: https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/#prepared-statements]
10. A static boundary test rejects direct `withExclusiveTransactionAsync`, direct screen SQL, and imports of the raw writer outside `src/platform/sqlite`. [VERIFIED: project D-06/D-07]

### Pattern 2: Migrations and Launch Order

Migration interface: `{ version, name, kind: "additive" | "destructive" | "long", up(tx), verify(tx) }`. Apply each pending version through the private FIFO writer, update `PRAGMA user_version` in the same successful transaction, and retain a fixture for every released version. [CITED: https://www.sqlite.org/pragma.html#pragma_user_version] [VERIFIED: project D-10]

```text
1. Show shell skeleton with root destinations disabled.
2. Open/configure private writer.
3. Read user_version and migration manifest.
4. For destructive/long migration: create and validate internal recovery backup.
5. Run ordered migration(s), each with BEGIN IMMEDIATE and same-tx user_version.
6. Run foreign_key_check and integrity_check; block launch on any row/error.
7. Open/configure WAL reader.
8. Reset expired pending-effect leases through the writer.
9. Reconcile timestamp-expired rest through a domain command.
10. Drain time-sensitive rest-notification effects.
11. Run first trusted Today/active-session query.
12. Enable root navigation; drain non-time-sensitive effects in background.
13. After one healthy upgraded launch, prune the prior recovery backup.
```

Expo exposes a database backup API suitable for internal pre-migration recovery; this is not the future portable user backup. [CITED: https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/#sqlitebackupdatabaseasyncoptions]

### Pattern 3: Durable Effects Outbox

Use one narrow `pending_effects` table:

```text
id UUID PK
effect_type
payload_version
idempotency_key UNIQUE
subject_id
source_revision
payload_json
status pending|processing
attempt_count
next_attempt_at
lease_owner
lease_expires_at
last_error_code
created_at
updated_at
```

Claim one eligible row in a writer transaction; perform the platform/derived effect outside the transaction; acknowledge/delete it in a second writer transaction after verifying current source revision. A stale lease becomes pending on launch. Handlers are at-least-once and idempotent, not "exactly once." [VERIFIED: project D-09; `.planning/research/ARCHITECTURE.md`]

Phase 1 effect types should be only `reconcile_rest_notification`, `recompute_load_reps_history`, and `regenerate_load_reps_recommendation`. Query invalidation and haptics do not require durable rows; they are immediate post-commit work. [VERIFIED: phase boundary] Use a bounded five-attempt schedule as the initial policy and cover permanent/transient classification with fixtures. [ASSUMED]

### Pattern 4: Full Body Foundation and `load_reps` Tracer

Freeze `assets/content/full-body-foundation.v1.json` before writing schema or UI. It must contain a stable namespace/version, only the reviewed exercises needed for Full Body A/B, attribution/license/source notes, explicit integer-base-unit targets, rest seconds, warm-up templates, equipment increments, and rule IDs. The supplied planning sources define the plan shape but not the exact Day A/Day B exercise IDs and targets; inventing them during implementation would violate the review boundary. [VERIFIED: codebase grep of approved sources]

Activation is one transaction:

```text
validate bundled template revision
insert copied plan with new user-owned IDs + source attribution
clone days, exercise ordering, warm-ups, working targets, policy IDs
create schedule defaults bound to copied plan
set plan-target revision = 1
return copied plan and Today read model after COMMIT
```

Contract tests must prove content import can mutate only `bundled` rows, activation can create only `copied` rows, subsequent workout/recommendation writes bind to copied IDs, and bundled rows remain byte-for-logical-state unchanged. [VERIFIED: D-11 and content ownership contract]

`load_reps` V1 is the only Phase 1 metric:

```typescript
type LoadRepsV1 = {
  version: 1;
  profile: "load_reps";
  loadGrams: number; // finite, integer, >= 0
  reps: number;      // integer; completed working set >= 1
};
```

Store observations and targets in integer base units; convert only in presentation. The progression tracer must cover baseline, incomplete upper bound (`8/8/7` holds load and targets `8/8/8`), complete upper bound with missing/easy/on-target/hard/failed effort, warm-up exclusion, incomplete exposure, stale target revision, and explicit accept/reject. [VERIFIED: approved design contract]

### Pattern 5: Workout, Rest, and Exactly-Once Completion

- Persist one active session, immutable exercise/target snapshots, one active pointer, set drafts, and a monotonically increasing session revision. [VERIFIED: WORK-04/15]
- Value-source and numeric-input commits call `updateActiveSetDraft`; process-death recovery must not depend on unsaved React state. [VERIFIED: WORK-15]
- `completeSet` carries expected session/set revision. Inside the writer transaction, update only an incomplete matching set, require one changed row, advance the pointer, store the prior active/rest snapshot for Undo, write new rest state, increment revision, and insert unique effects. [VERIFIED: WORK-07/08/10]
- The FIFO plus conditional update is the source-level duplicate defense; disabling the button is only UX. [VERIFIED: WORK-07]
- Undo checks the injected clock against `undoUntil`, restores prior source state in one transaction, increments rest revision, and enqueues notification reconciliation. [VERIFIED: D-16/D-19]

Persist this rest union:

```typescript
type RestStateV1 =
  | { version: 1; state: "idle"; revision: number }
  | { version: 1; state: "running"; revision: number; startedAt: number; endsAt: number }
  | { version: 1; state: "paused"; revision: number; remainingMs: number }
  | { version: 1; state: "expired"; revision: number; expiredAt: number };
```

Automatic rest starts only when another working set exists or explicit between-exercise rest is configured. `startManualRest` is a separate command using the current exercise's configured rest duration. Pause derives `remainingMs` from timestamps; resume creates new timestamps; ±15 seconds, skip, expiry, finish, discard, and Undo all persist before reconciliation. [VERIFIED: D-17/D-18]

### Notification Policy

Use one stable channel ID such as `workout-rest-v1`, create/read it before requesting Android 13+ notification permission, and treat its sound/importance as user-controlled after creation. [CITED: https://developer.android.com/develop/ui/views/notifications/channels] Use stable request ID `rest:<sessionId>` and payload `{ version, sessionId, restRevision }`; list/cancel/schedule idempotently. [CITED: https://docs.expo.dev/versions/v57.0.0/sdk/notifications/]

Do **not** declare `SCHEDULE_EXACT_ALARM` or `USE_EXACT_ALARM` in Phase 1. Android reserves exact-alarm special access for genuinely precise user-facing alarm/calendar use cases, while this app remains correct under late delivery. [CITED: https://developer.android.com/develop/background-work/services/alarms] Expo adds `RECEIVE_BOOT_COMPLETED`, but Phase 1 promises only state recovery when the app launches after reboot; no custom boot receiver or exact rescheduling should be added without a later passing spike. [CITED: https://docs.expo.dev/versions/v57.0.0/sdk/notifications/] [VERIFIED: D-20]

Reconcile after set/rest commits, Undo, finish/discard, app launch, foreground, and permission changes. If persisted `endsAt <= now`, a domain command first transitions source state to `expired`; notification code never writes workout truth. [VERIFIED: D-19]

### Android Backup/CNG Contract

The committed config plugin must generate both:

- Android 11-and-lower `android:fullBackupContent` rules.
- Android 12+ `android:dataExtractionRules` with separate `<cloud-backup>` and `<device-transfer>` exclusions.

Exclude the entire authoritative database domain and any plaintext/staging file paths; use the no-backup directory for temporary sensitive files. Android includes databases in Auto Backup by default and requires both rule formats for cross-version coverage. [CITED: https://developer.android.com/identity/data/autobackup] [CITED: https://developer.android.com/privacy-and-security/risks/backup-best-practices]

`scripts/assert-generated-android.mjs` must fail if generated output lacks either rules file/manifest attribute, unexpectedly contains exact-alarm permission, changes the generated Gradle/AGP/Kotlin/API/NDK contract, or includes an unreviewed native permission. Run two clean prebuilds and compare normalized generated output; no manual `android/` edit is allowed. [VERIFIED: REL-01]

### Argon2 Feasibility Spike

Create a local Expo module under `modules/argon2-kdf`, autolink it through CNG, and expose only a narrow asynchronous derivation API. Expo recommends a local module for app-specific native code and supports Android coroutine-backed `AsyncFunction`; run derivation on a non-main dispatcher. [CITED: https://docs.expo.dev/modules/get-started/] [CITED: https://docs.expo.dev/modules/module-api/#asyncfunction]

Use Maven `org.bouncycastle:bcprov-jdk18on:1.85.2` and `Argon2BytesGenerator` with `Argon2Parameters.ARGON2_id`, version 19, caller-supplied salt/parameters, and a 32-byte result. Bouncy Castle exposes these APIs and its upstream tests include the RFC Argon2id vector. [CITED: https://downloads.bouncycastle.org/java/docs/bcprov-jdk18on-javadoc/org/bouncycastle/crypto/generators/Argon2BytesGenerator.html] [CITED: https://www.rfc-editor.org/rfc/rfc9106.html#section-5.3]

Spike gates:

1. RFC 9106 Argon2id known-answer vector passes in Kotlin and through the JS bridge.
2. Initial OWASP floor `m=19456 KiB, t=2, p=1`, 16-byte random salt, 32-byte output passes; benchmark additional parameters to the approved 250–750 ms minimum-device window. [CITED: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html]
3. Derivation does not block JS interaction; cancellation/app backgrounding returns a typed result without leaking key bytes to logs. [VERIFIED: D-29/D-33]
4. Password/input/output arrays are cleared in Kotlin `finally` where possible; diagnostics contain only algorithm parameters, duration, and error code. JavaScript cannot guarantee erasure of all bridge/string copies, so the Phase 5 security review must revisit the final password boundary. [ASSUMED]
5. Two clean prebuilds autolink the module; debug APK installs and runs on API 36 plus the owner's minimum physical device.
6. APK passes `zipalign -P 16`; inspect packaged native libraries. Bouncy Castle itself is JVM bytecode, but the full Expo APK still contains native libraries that require page-size validation. [CITED: https://developer.android.com/guide/practices/page-sizes]
7. Write a versioned `CandidateKdfDescriptor` artifact containing algorithm ID, parameter bounds, salt/tag lengths, provider version, KAT ID, timing samples, device metadata, and status. Do not freeze the Phase 5 backup envelope yet. [VERIFIED: D-33]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Password KDF primitive | Custom/JS/WASM Argon2 | Bouncy Castle in app-owned Expo bridge | Cryptographic primitive and vectors already exist. |
| Transaction capture | UI mutex or ordinary async transaction | Private writer + SQLite `BEGIN IMMEDIATE` | Source acknowledgement must match actual commit. |
| Timer truth | `setInterval` decrement counter | Persisted timestamps + injected clock | Background/process death makes counters stale. |
| Notification truth | Notification callbacks as state changes | Reconciler from SQLite rest revision | Delivery can be denied, late, or missing. |
| Schema decoding | Ad hoc casts | Zod at row/effect/platform boundaries | Unknown versions and malformed payloads must fail safely. |
| Generic event bus | Cross-domain publish/subscribe framework | Direct commands + narrow durable outbox | Keeps immediate and durable work explicit. |
| ORM/DI framework | Broad abstraction layer | Narrow typed repositories and explicit container | Phase 1 needs auditable SQL and transaction ownership. |
| Test database package | New native dependency by default | Node 24 `node:sqlite` for host semantics | Avoid package/native-build risk until a gap is proven. |

**Key insight:** Hand-written orchestration is appropriate only where the project owns policy—FIFO ownership, launch order, idempotency, and domain commands. Cryptography, SQLite semantics, validation, and Android scheduling must use established primitives.

## Common Pitfalls

### Pitfall 1: False Exclusive-Transaction Proof
**What goes wrong:** Tests pass on a host adapter or root connection while the production transaction connection lacks foreign keys.
**Avoid:** Query and violate constraints through the production transaction executor on Expo SQLite; prohibit the Expo exclusive helper. [CITED: Expo SDK 57 source]

### Pitfall 2: Acknowledgement Before Commit
**What goes wrong:** React state, haptic, Undo, or rest changes before `COMMIT` resolves.
**Avoid:** Return only `CommittedWorkoutState`; dispatch all effects after the command promise resolves; use a commit latch test. [VERIFIED: D-08]

### Pitfall 3: Greenfield-Only Migrations
**What goes wrong:** Fresh install works but retained user databases cannot upgrade or recover.
**Avoid:** Keep a fixture for every schema version, inject every statement failure, verify unchanged `user_version`, and block root navigation on failure. [VERIFIED: FOUND-05]

### Pitfall 4: Outbox Without Lease Recovery
**What goes wrong:** Process death leaves `processing` rows permanently stuck or duplicated.
**Avoid:** Stable IDs, unique keys, lease expiry, source revisions, launch reset, idempotent handlers, bounded retry. [VERIFIED: D-09]

### Pitfall 5: Calling Restart “Process Death”
**What goes wrong:** `launchApp` or rotation passes while system-initiated death loses drafts/rest.
**Avoid:** Home → `killApp` → `launchApp` with no clear state; separately test real reboot wording. [CITED: https://docs.maestro.dev/reference/commands-available/killapp]

### Pitfall 6: Exact-Alarm Scope Creep
**What goes wrong:** Special access and stronger delivery promises arrive without justification.
**Avoid:** No exact-alarm permission in Phase 1; accept late delivery and derive truth from timestamps. [CITED: Android alarm guidance]

### Pitfall 7: Android Backup Contaminates “Clean Install”
**What goes wrong:** SQLite silently returns after reinstall or leaks around later encrypted backup.
**Avoid:** Generate both backup-rule families, exclude database/staging, and prove uninstall/reinstall does not restore source facts. [CITED: Android Auto Backup]

### Pitfall 8: Seed Content Mutates Bundled Rows
**What goes wrong:** Progression changes the template itself or future content imports overwrite the user's plan.
**Avoid:** Clone activation with new IDs and source attribution; bind all mutable state to copied rows. [VERIFIED: D-11]

### Pitfall 9: Rapid Tap Defense Exists Only in UI
**What goes wrong:** Two queued commands create duplicate effects.
**Avoid:** Conditional incomplete-set update, expected revision, unique effect key, and idempotent already-committed response. [VERIFIED: WORK-07]

### Pitfall 10: Argon2 Works but Freezes or Leaks
**What goes wrong:** KDF runs on the interaction thread, logs sensitive material, or is calibrated only on the Mac.
**Avoid:** Coroutine/background dispatcher, KAT, redaction tests, physical-device timing, bounded descriptor. [VERIFIED: D-33]

## Code Examples

### Writer Contract Pseudocode

```typescript
// Source: SQLite transaction docs + project D-06
return fifo.enqueue(async () => {
  await writer.execAsync("BEGIN IMMEDIATE");
  try {
    const committedState = await command(transactionExecutor);
    await writer.execAsync("COMMIT");
    return committedState;
  } catch (error) {
    await writer.execAsync("ROLLBACK");
    throw translateStorageError(error);
  }
});
```

The production implementation must also handle begin/commit/rollback failures and never expose the raw writer to command callbacks. [CITED: https://www.sqlite.org/lang_transaction.html]

### Notification Desired-State Function

```typescript
// Source: project D-19; Expo Notifications API
idle | paused | expired -> cancel stable request if present
running with endsAt > now -> exactly one request rest:<sessionId>
running with endsAt <= now -> domain expire command, then cancel
payload revision !== current rest revision -> ignore as stale
```

### `load_reps` Hold Example

```text
Plan: 3 × 6–8
Actual working sets: 60 kg × 8 / 8 / 7
Effort: On target
Result: Hold 60 kg; target 8 / 8 / 8
Mutation: none until explicit acceptance commits against current target revision
```

This is the canonical first recommendation fixture. [VERIFIED: `01-CONTEXT.md` and approved design contract]

## State of the Art

| Old / Generic Approach | Required Phase 1 Approach | Impact |
|---|---|---|
| Persisted UI store as mobile truth | SQLite source facts plus disposable query cache | One recoverable authority. |
| Expo exclusive helper | App-owned configured writer with explicit `BEGIN IMMEDIATE` | Connection PRAGMAs are provable. |
| In-memory timer | Timestamp-derived persisted union | Correct after background/death. |
| Fire-and-forget side effects | Atomic outbox plus idempotent reconciliation | Survives process death. |
| Hand-maintained `android/` | CNG config/plugins/local modules | Native output is reproducible. |
| Generic recommendation engine | One versioned `load_reps` policy | Evidence and tests remain bounded. |

## Plan Decomposition

| Plan | Scope | Depends On | Exit Evidence |
|---|---|---|---|
| 01-01 Native prerequisite | Toolchain doctor, temp scaffold merge, pins, CNG, backup rules, generated assertions, APK/hash/install | — | Clean prebuild/build/install; generated contract and hash retained |
| 01-02 UI foundation | Apply `01-UI-SPEC.md`, shell, theme, adaptive/accessibility primitives | 01-01 | RNTL plus compact/medium/expanded and 200% checks |
| 01-03 Contracts/test harness | Module boundaries, Zod, errors, clock, diagnostics, Jest/RNTL, `node:sqlite`, CI skeleton | 01-01 | Commands exist; redaction and boundary tests pass |
| 01-04 Blocking writer spike | Production writer/reader/FIFO and native contract runner | 01-01, 01-03 | All ten private-writer device contracts pass |
| 01-05 Argon2 spike | Local Expo module, BC 1.85.2, KAT, timing, CNG/page-size, descriptor | 01-01, 01-03 | Passing candidate descriptor or explicit Phase 5 block |
| 01-06 Migrations/effects/launch | Schema v1, fixtures, recovery seam, outbox, launch coordinator | 01-04 | Host + device migration/outbox/process-kill contracts |
| 01-07 Seed/copy/Today tracer | Freeze exact seed, clone activation, schedule, snapshots, Today query, starts | 01-06 | Bundled immutability and all start-mode fixtures |
| 01-08 Working-set tracer | Drafts, warm-ups, value sources, complete/retry/Undo/haptic | 01-07 | Rapid tap/failure/commit-before-ack; 100% critical coverage |
| 01-09 Rest/lifecycle tracer | Rest commands, notification reconciler, denied/late, kill/relaunch | 01-08 | Maestro and actual-device recovery matrix |
| 01-10 Outcome/progression closure | Outcomes, completion/detail, `load_reps` recommendation/acceptance, performance, airplane mode | 01-09 | Phase gate, p95 ≤150 ms, repeated full workout |

The tracer should be production-quality at each wave; do not defer writer, lifecycle, or accessibility correctness to a later horizontal cleanup. [VERIFIED: roadmap ordering]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | Initial SQLite `busy_timeout` should be `1000 ms`. | Private writer | Too short causes avoidable busy errors; too long violates responsive failure. |
| A2 | Initial durable-effect retry limit should be five attempts. | Effects outbox | Permanent/transient behavior may require a different policy. |
| A3 | JavaScript-side password copies cannot be reliably zeroized across the bridge. | Argon2 spike | Final backup password boundary may need a different native-owned input design. |
| A4 | Full package gate can approve the official template/icon/font dependency set. | Package audit | A SUS/SLOP result could block scaffold or UI package installation. |

## Open Questions

1. **RESOLVED — Full Body Foundation A/B fixture.**
   - Phase 1 acceptance is frozen in `01-07-PLAN.md`: original `gym-tracker.original/full-body-foundation` revision 1, alternating A/B three days weekly, exact stable exercise IDs, ordered Day A/Day B rows, integer targets, set/rep ranges, rest seconds, increments, warm-up templates, estimate, attribution, and rule IDs.
   - Day A is Back Squat, Bench Press, Lat Pulldown, Romanian Deadlift, and Plank. Day B is Deadlift, Overhead Press, Seated Cable Row, Reverse Lunge, and Side Plank. The exact values are executable plan inputs, not an executor proposal or human checkpoint.
   - Only load/reps rows use `load_reps.double_progression.v1`; timed holds remain manual/hold so Phase 1 does not absorb Phase 4 progression breadth.

2. **RESOLVED — minimum Android profile and evidence identity.**
   - API 24 remains the minimum supported Android profile and API 36 remains the PR emulator target per REQUIREMENTS/ROADMAP/STACK.
   - Automated native, lifecycle, and performance evidence records current Git commit, exact installed APK SHA-256, package, device serial/API/ABI, and result timestamps. The consolidated 01-10 physical checkpoint records the owner's available API-24-or-newer minimum device model and memory; if no physical device is available, Phase 1 remains blocked rather than weakening or fabricating acceptance.
   - Working-set transaction+dock p95 is <=150 ms over at least 100 samples; Argon2 uses ten samples and an allowed OWASP-floor-or-higher set in the 250-750 ms window or records a Phase 5 block.

3. **RESOLVED — icon and font packages.**
   - Use exact `lucide-react-native@1.31.0`, `@expo-google-fonts/source-sans-3@0.4.1`, and `@expo-google-fonts/ibm-plex-mono@0.4.1`, with only weights 400/600 loaded.
   - Registry/source metadata resolves to `github.com/lucide-icons/lucide` and `github.com/expo/google-fonts`; integrity strings are locked by `package-lock.json`.
   - These packages remain covered by the mandatory 01-01 package-legitimacy checkpoint before installation; no additional mid-phase decision is needed.

## Environment Availability

| Dependency | Required By | Available | Version / State | Action |
|---|---|---:|---|---|
| Node | all JS work | ✓ wrong pin | `24.18.1` | Install/use `24.19.0` |
| npm | installs/CI | ✓ wrong pin | `12.0.2` | Install/use `11.17.0` |
| Java | Gradle/Maestro | ✓ wrong major | OpenJDK `26.0.2` | Install Temurin `17.0.20+8` |
| Android SDK root | native build | ✓ not exported | `/opt/homebrew/share/android-commandlinetools` | Export env/PATH |
| API 36 platform | compile | ✓ | revision 2 | Keep |
| Build Tools | build/hash checks | ✓ | `36.0.0` | Keep |
| NDK | generated RN build | ✓ | `27.1.12297006` | Keep |
| CMake | native build | ✓ | `3.22.1` | Keep |
| `adb` | install/contracts | ✓ not on PATH | `37.0.0` | Export platform-tools |
| Android emulator | PR native tests | ✗ | — | Install emulator package |
| API 36 ARM64 image | local emulator | ✗ | — | Install Google APIs image |
| Maestro | lifecycle E2E | ✗ | — | Install pinned `2.8.0`, verify release checksum |
| Physical Android device | Argon2/performance/manual gates | unknown | — | Record and connect before native phase gate |
| Disk | emulator/build | constrained | ~33 GiB free | Avoid duplicate SDKs/caches; monitor during builds |

**Missing dependencies with no fallback:** physical Android device metadata for final Phase 1 performance/Argon2 evidence.

**Missing dependencies with fallback:** local emulator and Maestro can be installed with the prescribed commands; `adb` already exists under the SDK root.

## Validation Architecture

### Test Framework

| Property | Value |
|---|---|
| Framework | Jest 29.7 + `jest-expo` 57.0.4 + RNTL 14.0.1; Node 24 `node:sqlite`; Expo SQLite device runner; Maestro 2.8.0 |
| Config file | None yet — Wave 0 creates `jest.config.*`, coverage config, native test route, and Maestro flows |
| Quick run | `npm run typecheck && npm run test:unit -- --runInBand` |
| Full suite | `npm run test:all` |

### Phase Requirements → Test Map

| Requirement Group | Behavior | Primary Proof | Automated Command | Exists? |
|---|---|---|---|---|
| FOUND-03/04/05 | writer, migrations, effects | Host + native SQLite contracts | `npm run test:sqlite:host && npm run test:sqlite:device` | ❌ Wave 0 |
| FOUND-06 | schemas/errors/redaction | Jest tables | `npm run test:unit -- contracts errors diagnostics` | ❌ Wave 0 |
| FOUND-07/08/09 | UI/adaptive/accessibility | RNTL + Android/manual | `npm run test:components` | ❌ Wave 0 |
| WORK-01..05 | activation/start/snapshot/values | Application + SQLite integration | `npm run test:integration -- plan-workout-tracer` | ❌ Wave 0 |
| WORK-06..10 | warm-up/commit/retry/Undo | Pure/application/native contract | `npm run test:integration -- complete-set` | ❌ Wave 0 |
| WORK-11..15 | rest/notification/recovery | Fake clock + Maestro | `maestro test maestro/lifecycle` | ❌ Wave 0 |
| WORK-16..18 | outcomes/completion/recommendation | Jest/integration/E2E | `npm run test:integration -- workout-outcomes load-reps` | ❌ Wave 0 |
| REL-01 | CNG build/hash/backup rules | Generated assertions | `npm run verify:cng && npm run android:devtest` | ❌ Wave 0 |
| REL-02 | ordered PR gates | CI workflow | `npm run ci:pr` | ❌ Wave 0 |

### Native Contract Runner

Build a development-test-only route that executes shared adapter contract cases against the production `SqliteKernel`, renders a bounded pass/fail summary, and emits machine-readable JSON for `scripts/run-native-sqlite-contracts.mjs`. The test seed enters through public test application commands; Maestro must never execute arbitrary SQL. [VERIFIED: D-30 and Claude's Discretion]

### Process-Death and Notification Matrix

```yaml
# Core Maestro pattern
- launchApp:
    clearState: false
- runFlow: seed-and-start-workout.yaml
- pressKey: Home
- killApp
- launchApp:
    clearState: false
- assertVisible: "Rest resumed"
```

Run separate flows for active entered values with no completed set, running rest, paused rest, expired while dead, save-failed draft, notifications denied, permission later granted, stale notification payload, Undo, and finish/discard cancellation. Maestro documents Android `killApp` as `adb shell am kill`, distinct from a restart. [CITED: https://docs.maestro.dev/reference/commands-available/killapp]

### Coverage and Sampling

- **Per task commit:** targeted Jest/RNTL or host SQLite command under 30 seconds.
- **Per wave merge:** typecheck → lint → unit → component → host SQLite → coverage.
- **After writer exists:** add native Expo SQLite contracts before Android smoke.
- **Phase gate:** full ordered suite, physical-device smoke, repeated airplane-mode workout, and p95 measurement.
- **Coverage:** 100% statements/branches/functions/lines for domain rules, schemas, application commands, migration helpers, writer/outbox logic; remaining testable TS ≥90% statements/lines/functions and ≥85% branches. [VERIFIED: approved engineering contract]

### Wave 0 Gaps

- [ ] `jest.config.*` and coverage thresholds.
- [ ] `tests/sqlite-host/` adapter using `node:sqlite`.
- [ ] `src/testing/contracts/sqliteKernel.contract.ts` shared host/device cases.
- [ ] Development-test native contract route and result exporter.
- [ ] Maestro smoke/lifecycle flows and supported test seed command.
- [ ] `scripts/doctor-android.sh`, generated-native assertions, CNG reproducibility, APK hash.
- [ ] CI workflow with the locked ordering and full-SHA actions.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---|---|---|
| V2 Authentication | no | Single-owner offline Phase 1 has no account boundary. |
| V3 Session Management | no | Workout session is domain state, not an authenticated web session. |
| V4 Access Control | limited | Debug/test routes excluded from non-development-test artifacts. |
| V5 Input Validation | yes | Zod boundaries, bound SQL parameters, integer base units, revision checks. |
| V6 Cryptography | yes | Bouncy Castle Argon2id spike; never hand-roll primitives. |
| V8 Data Protection | yes | Backup exclusions, no plaintext diagnostics, source data stays local. |
| V14 Configuration | yes | CNG assertions, pinned toolchain, reviewed permissions and package gate. |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---|---|---|
| SQL injection or malformed row | Tampering | Bound parameters and Zod materialization; no SQL in UI. |
| Duplicate set/effect | Tampering | Expected revision, conditional update, unique idempotency key. |
| Stale notification mutates state | Spoofing/Tampering | Payload revision check; notification never writes workout truth. |
| Sensitive diagnostics | Information Disclosure | Redacted codes; never log SQL parameters, set payloads, notes, passwords, keys. |
| OS backup copies SQLite | Information Disclosure | Both Android rule families exclude database/staging. |
| Argon2 resource abuse | Denial of Service | Bounded parameter schema and calibrated allowed set. |
| Dev-test route reaches release | Elevation of Privilege | Build-profile exclusion plus generated/artifact assertion. |
| Dependency slopsquat/recent compromise | Supply Chain | Legitimacy checkpoint, official source verification, lockfile, no postinstall scripts observed. |

## Sources

### Primary (HIGH confidence project authority)

- `.planning/phases/01-trustworthy-workout-loop/01-CONTEXT.md` — locked Phase 1 behavior and architecture.
- `.planning/phases/01-trustworthy-workout-loop/01-UI-SPEC.md` — committed UI/accessibility contract.
- `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md` — scope, gates, blockers.
- `.planning/research/SUMMARY.md`, `STACK.md`, `ARCHITECTURE.md`, `PITFALLS.md` — reconciled project research.
- Approved design and engineering contracts under `~/.gstack/projects/gym_tracker/`.

### Official Technical Sources (MEDIUM confidence per seam)

- https://docs.expo.dev/workflow/continuous-native-generation/ — CNG ownership.
- https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/ — Expo SQLite APIs and prepared-statement cleanup.
- https://github.com/expo/expo/blob/sdk-57/packages/expo-sqlite/src/SQLiteDatabase.ts — exclusive helper opens a new connection.
- https://www.sqlite.org/lang_transaction.html — `BEGIN IMMEDIATE`, writer/busy semantics.
- https://www.sqlite.org/pragma.html — foreign keys, timeout, version, integrity checks.
- https://docs.expo.dev/versions/v57.0.0/sdk/notifications/ — channels, permission, stable IDs, boot permission.
- https://developer.android.com/develop/background-work/services/alarms — exact-alarm policy.
- https://developer.android.com/identity/data/autobackup — backup rules and default database inclusion.
- https://developer.android.com/guide/practices/page-sizes — 16 KB APK validation.
- https://docs.maestro.dev/reference/commands-available/killapp — Android system-initiated death.
- https://docs.expo.dev/modules/get-started/ and `/modules/module-api/` — local module and coroutine API.
- https://downloads.bouncycastle.org/java/docs/bcprov-jdk18on-javadoc/ — Argon2 Java API.
- https://www.rfc-editor.org/rfc/rfc9106.html — Argon2id vectors and parameter guidance.
- https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html — minimum Argon2id floor.
- https://nodejs.org/docs/latest-v24.x/api/sqlite.html — built-in host SQLite.

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — SDK template, official module map, registries, and local tool audit; SUS packages remain checkpointed.
- Architecture: **HIGH** — locked project contract plus Expo/SQLite source confirmation.
- Native behavior: **MEDIUM** — intentionally blocked on actual Expo SQLite, notifications, CNG, and physical-device contracts.
- Argon2: **MEDIUM** — provider/API/vectors verified; app bridge and device timing remain a spike.
- Seed content: **LOW** — exact Full Body A/B fixture is not present and must be frozen before implementation.

**Research date:** 2026-08-16
**Valid until:** 2026-08-23 for fast-moving Expo/package/tool versions; architecture remains valid unless locked decisions change.

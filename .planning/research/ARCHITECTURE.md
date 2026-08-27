# Architecture Patterns

**Domain:** Local-first Expo/SQLite personal gym tracker  
**Researched:** 2026-08-16  
**Confidence:** HIGH for boundaries and data flow; MEDIUM for the final Argon2id native dependency

## Recommended Architecture

Use a **modular monolith with vertical domain modules**, one SQLite database, a serialized writer, disposable read projections, and thin Expo platform adapters.

Do not add a sync engine, event-sourcing framework, ORM, dependency-injection framework, background-job framework, or generic event bus. The app has one owner, one process when running, one durable database, and no server.

```text
Expo Router routes and screens
             │
             ▼
Application commands and queries
  workout · plans · content · history · progression · backup
             │
       ┌─────┴──────────────┐
       ▼                    ▼
Pure domain rules       Platform ports
metrics · timer         clock · notifications
progression · schemas   haptics · files · crypto
       │                    │
       └────────┬───────────┘
                ▼
        SQLite infrastructure
  source facts · pending effects · projections
```

### Dependency Rule

Dependencies point inward:

```text
app/ → src/ui + domain public APIs
domain application → domain rules + ports
platform adapters → domain ports
pure domain → TypeScript values only
```

- Routes never import SQLite, notifications, crypto, or file APIs.
- Screens never execute SQL.
- Domain modules expose one public `index.ts`; cross-domain imports may use only public APIs.
- Platform code contains integration mechanics, not workout or progression decisions.
- Pure rules accept validated values and an explicit clock; they do not import React Native or Zod.

## Component Boundaries

| Component | Responsibility | Owns Data | Communicates With |
|---|---|---|---|
| `shared` | Stable IDs, metric contracts, time values, typed errors | No feature rows | All domains |
| `content` | Bundled exercise/catalog import, taxonomy, attribution, FTS repair | Bundled exercises and content-pack identity | Plans, search queries |
| `plans` | User-owned/copied plans, targets, schedules, target revisions | Plans, days, targets, schedules | Workout snapshots, progression acceptance |
| `workout` | Active session, immutable snapshots, sets, rest state, completion | Session source facts | Notifications, history |
| `history` | Session queries, corrections, void/restore commands | Correction and void facts | Projection effects |
| `progression` | Comparable exposures and deterministic recommendations | Recommendations and decisions | Plans through revision-checked commands |
| `backup` | Logical export/import orchestration and restore preview | Backup envelopes, not domain tables | Domain export/import ports, files, crypto |
| SQLite kernel | Connections, migrations, serialized writes, outbox, projection stores | Physical database | All repository adapters |
| Effect runner | At-least-once post-commit work | `pending_effects` lifecycle | Notification and projection handlers |
| UI/query layer | Disposable read cache and local form state | No authoritative facts | Domain commands and queries |

### Suggested Layout

```text
app/                         # routes/layouts only
src/
  domains/
    shared/
    workout/
      contracts/
      domain/
      application/
      ports/
    plans/
    content/
    history/
    progression/
    backup/
  platform/
    sqlite/
      connection/
      migrations/
      repositories/
      effects/
      projections/
    notifications/
    crypto/
    files/
    clock/
  ui/
  testing/
```

Keep this layout incremental. Create a domain folder when its vertical slice begins; do not scaffold every future repository and service in Milestone 1.

## Data Ownership

### Authoritative Source Facts

- Bundled content-pack identities and rows.
- Custom exercises and copied plans.
- Plan targets, schedules, and monotonically increasing target revisions.
- Session snapshots, completed set observations, active pointer, and rest state.
- Corrections and void/restore facts.
- Recommendation evidence, status, and user decisions.

### Disposable Derivatives

- Scheduled Android notifications.
- FTS rows.
- Exercise metrics, records, comparable exposures, and period summaries.
- Generated pending recommendations.
- TanStack Query cache and all screen view models.

```text
Source facts in SQLite
        │
        ├── direct trusted reads → Today / active workout / session detail
        │
        └── pending_effects
              ├── notification reconciliation → Android scheduler
              └── projection rebuilds → fast read tables → Progress/History
```

Historical session display must use its immutable snapshot, not mutable plan or bundled exercise names. Bundled import may write only bundled rows in its namespace. User commands may write only custom/copied rows. Restore replaces user-owned facts and reconciles bundled references separately.

## Transaction Model

### Important Expo Footgun

Do **not** make `withExclusiveTransactionAsync()` the integrity kernel.

Current Expo SQLite implements it by opening a new connection and issuing `BEGIN` before invoking the callback. Connection-local settings such as `PRAGMA foreign_keys=ON` are therefore not inherited, and SQLite cannot enable foreign keys after a transaction has begun. This can silently bypass constraints.

Use:

1. One private writer connection opened at startup.
2. `PRAGMA foreign_keys=ON` and a bounded `busy_timeout` applied before any transaction on that connection.
3. WAL configured once outside transactions.
4. A repository-owned FIFO mutex/queue that is the only write entry point.
5. Explicit `BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK` on that writer.
6. A separate normal read connection after migration completes.

```text
Application command
      │
      ▼
SerializedWriteExecutor (FIFO)
      │
      ▼
private writer connection
  BEGIN IMMEDIATE
  ├── validate revision/idempotency
  ├── write source facts
  ├── write pending effects
  └── COMMIT
      │
      ▼
committed state + invalidation scopes
```

WAL allows readers alongside one writer; SQLite still permits only one writer. Keep transactions short and forbid notifications, haptics, file I/O, crypto, React updates, timers, and arbitrary callbacks inside them.

### Set Completion

```text
Complete Set tap
      │
      ▼
completeSet(validated input)
      │
      ▼
BEGIN IMMEDIATE
  ├── assert active session/set revision
  ├── persist actual value
  ├── mark set complete
  ├── advance active pointer
  ├── persist prior state for Undo
  ├── persist new rest state
  └── enqueue reconcile_rest_notification
COMMIT
      │
      ├── return committed workout state
      ├── invalidate exact query keys
      ├── emit haptic
      └── drain time-sensitive effect
```

On failure, rollback everything, preserve form input, and show `Set not saved · Retry`. No rest state, notification, haptic, or visual success occurs before commit.

## Durable Effects

Use one narrow SQLite outbox table, `pending_effects`, for work that must survive process death:

- `reconcile_rest_notification`
- `rebuild_exercise_projection`
- `rebuild_period_projection`
- `regenerate_recommendation`

Each row needs a stable ID, versioned type/payload, unique idempotency key, subject ID, expected source revision, status, attempt count, next-attempt time, claim timestamp, and safe last-error code.

```text
source transaction + effect row
             │
             ▼
          COMMIT
             │
             ▼
runner claims eligible row
  ├── reload current source facts
  ├── reject/supersede stale revision
  ├── perform idempotent handler
  └── delete/complete effect

crash after claim
  └── stale lease expires → pending → replay
```

This is **at-least-once**, not exactly-once. Every handler must be idempotent. Coalesce rebuild effects by `(effect_type, subject_id, target_revision)` so a burst of set edits does not create unbounded redundant work.

The JS runner works only while the app process is alive. Drain on startup, after committed commands, and on foreground. This is sufficient because SQLite facts remain correct while derived work waits.

## Projection Model

Use subject-scoped revisions, not a single global timestamp watermark. Corrections and voids mutate the effective history of old rows, so append-only high-watermarks are insufficient.

```text
correction / void / completed session
              │
              ├── increment affected subject revision
              └── enqueue rebuild(subject, revision)
                             │
                             ▼
handler reads facts at revision R
  ├── computes complete replacement off-transaction
  └── short write transaction:
        verify current revision == R
        replace subject projection rows
        mark projection_version/source_revision
```

- If the revision changed during computation, discard the result and enqueue the newest revision.
- Targeted and full rebuilds must produce identical rows for the same fixture.
- Screens may show `Updating progress` when projection revision trails source revision.
- Recommendation generation may consume only current comparable-exposure projections; otherwise read source facts directly or wait for rebuild.
- Do not maintain projections inline with the workout transaction unless the derived value is tiny and required for the immediate committed response.

## Notification Reconciliation

SQLite rest state is authoritative. Expo Notifications supports explicit schedule identifiers, listing, and cancellation, so use `rest:<sessionId>` as the stable platform identifier and include `sessionId` plus `restRevision` in the payload.

```text
RestState + current time
          │
          ▼
desired notification
  idle/paused/expired → none
  running/future      → one at restEndsAt
          │
          ▼
list scheduled rest notification
  ├── matching → no-op
  ├── stale    → cancel + replace
  └── unwanted → cancel
```

Reconcile after relevant commits, on launch, on transition to `AppState=active`, and after permission changes. Android boot rescheduling exists in Expo Notifications, but exact alarms require Android permission/configuration and device verification. Notifications remain best effort; timestamps always drive the in-app timer.

## Migration and Startup

```text
App launch
  ├── open/configure writer
  ├── inspect user_version
  ├── create internal hot backup if migration policy requires it
  ├── run ordered migration transactions
  ├── foreign_key_check + integrity preflight
  ├── open/configure reader
  ├── reset stale effect claims
  ├── reconcile urgent notification state
  └── enable root navigation
```

Use Expo SQLite's `backupDatabaseAsync` for **internal pre-migration recovery**, not hand-copying the `.db` file and not the portable user backup. Keep one validated backup plus a small manifest until one healthy upgraded startup.

Migrations are numbered and forward-only. Set `user_version` inside the same successful transaction. Test every released schema fixture. Never automatically loop a failing migration repeatedly during one launch.

## Backup and Crypto Boundary

Keep portable backups logical:

```text
domain export ports
      │
      ▼
versioned logical rows + installed content references
      │
      ▼
canonical payload + internal manifest
      │
      ├── random salt → Argon2id → 32-byte key
      └── plaintext canonical header as AES-GCM AAD
      │
      ▼
expo-crypto AES-256-GCM
      │
      ▼
temporary File → system share sheet
```

Simplifications:

- Use built-in `expo-crypto` AES-256-GCM; do not add another AES library.
- Use modern `expo-file-system` `File`, `Directory`, and `Paths`; avoid legacy functions.
- Use `expo-document-picker` with `copyToCacheDirectory: true` for immediate validation.
- Keep manifest and workout metadata inside ciphertext. The plaintext header should contain only format/KDF/cipher parameters needed before decryption and must be authenticated as AAD.

Current Expo Crypto does not provide Argon2id, scrypt, or PBKDF2. Candidate Argon2id native modules are young; treat selection as a Milestone 5 security spike. Pin and review source, use binary key output, run known-answer tests, calibrate on the minimum device, and verify Android ABI/16 KB page compatibility.

Current AES-GCM APIs operate on complete byte buffers. Do not claim streaming encryption. Enforce conservative compressed/decompressed byte, row-count, nesting, and string-length limits before allocation. Decrypt and validate completely before opening the replacement transaction.

Restore flow:

```text
pick file → size/version preflight → KDF → authenticate/decrypt
→ parse bounded payload → validate rows/references → preview
→ one serialized replacement transaction
→ reconcile bundled references → rebuild all projections/FTS
```

Any preflight or insert failure leaves the current database unchanged.

## Build Order

The approved five-milestone order is correct, with infrastructure treated as **cross-cutting**, not postponed to Milestone 5.

```text
M1 Trustworthy Workout Loop
  storage kernel · migrations · outbox · rest notification
  one copied starter plan · load_reps · one progression rule
                 │
                 ▼
M2 Owned Library and Planning
  content ownership · FTS · custom exercises · plan/schedule editors
                 │
                 ▼
M3 Calendar and History Integrity
  corrections · void/restore · subject revisions · rebuildable projections
                 │
                 ▼
M4 Overall Progress and Complete Progression
  period projections · all comparators · recommendation lifecycle
                 │
                 ▼
M5 Recovery and Release
  encrypted logical backup/restore · CSV · release promotion
  final device/accessibility/adaptive verification
```

### Dependency Rationale

1. **M1 first:** proves the write transaction, active-session recovery, outbox, timer, and copied-plan ownership before other modules depend on them.
2. **M2 before history breadth:** establishes stable user-owned plans, catalog identity, snapshots, and metric profiles.
3. **M3 before overall progress:** establishes correction/void semantics and deterministic projection rebuilds; otherwise M4 analytics will be rewritten.
4. **M4 after comparable history:** progression and period summaries depend on current subject revisions and metric comparators.
5. **M5 last for user backup format:** logical archive schema should follow stable source facts, but crypto and release-risk spikes must start earlier.

Start in M1 and continue every milestone:

- CI, test harness, migration fixtures, typed errors, redacted diagnostics.
- Accessibility and responsive component constraints.
- Clean CNG prebuild and development-build verification.
- Backup export-port design and schema manifest versioning.

M5 is the release closure, not the first time these concerns are tested.

## Patterns to Follow

### Serialized Writer, Concurrent Readers

**What:** One preconfigured writer connection guarded by a FIFO queue; separate reads under WAL.  
**When:** Every source-fact mutation and projection replacement.  
**Why:** Prevents Expo transaction capture, preserves per-connection foreign keys, and matches SQLite's one-writer model.

### Command-Owned Invalidation

**What:** Commands return committed state plus exact query invalidation scopes.  
**When:** After every command and effect completion.  
**Why:** Simpler and more deterministic than global SQLite change listeners. TanStack Query remains a disposable UI cache.

### Snapshot at Session Start

**What:** Copy names, order, metric profile, target, units, and rule version into session rows.  
**When:** Starting any planned workout.  
**Why:** Historical display and comparisons survive plan and content changes.

### Explicit Revisions

**What:** Revisions on active sessions, plan targets, rest state, and projection subjects.  
**When:** Idempotency, optimistic concurrency, stale effect rejection, and projection freshness.  
**Why:** Stable IDs alone do not prove that a derived result is current.

## Anti-Patterns to Avoid

### Using `withExclusiveTransactionAsync` Directly

**Why bad:** Its fresh connection can silently omit foreign-key enforcement.  
**Instead:** Private configured writer plus serialized explicit transactions.

### Generic Event Bus Between Domains

**Why bad:** Hides control flow and produces in-memory events that disappear on process death.  
**Instead:** Direct application calls for immediate work; typed `pending_effects` for durable derivatives.

### Event Sourcing the Whole App

**Why bad:** Corrections, snapshots, and audit records do not require reconstructing all source state from an event log.  
**Instead:** Normal relational source tables plus explicit correction/void facts and rebuildable projections.

### Projection per Screen

**Why bad:** Duplicates rules and creates incompatible derived truth.  
**Instead:** Projections by domain question: comparable exposure, exercise metrics/records, and period progress.

### Raw SQLite User Backup

**Why bad:** Couples restore to file format, schema, WAL state, and bundled content versions.  
**Instead:** Logical versioned archive; reserve SQLite hot backup for internal migration recovery.

### Global Database Change Listener

**Why bad:** Row-level notifications do not express domain intent, revisions, or affected query keys.  
**Instead:** Commands and handlers emit exact invalidation scopes.

## Failure Recovery

| Failure | Recovery |
|---|---|
| Process dies after source commit | Pending effect remains and replays on launch |
| Process dies while effect is claimed | Lease expires; row returns to pending |
| Notification permission denied | Rest facts and in-app timer continue; effect records typed denial |
| Notification is stale or late | Revision check ignores tap; foreground reconciliation repairs schedule |
| Projection rebuild races a correction | Revision mismatch discards output and schedules newest rebuild |
| Double set-completion tap | Session/set revision or idempotency key permits one commit |
| Migration fails | Transaction rollback; old `user_version` and internal backup retained |
| Wrong backup password/tamper | AES-GCM authentication fails before parse or SQLite mutation |
| Restore insert fails | One replacement transaction rolls back completely |
| Bundled item disappears | Preserve source identity and snapshots; mark unavailable |

## Scalability Considerations

| Concern | Expected v1 | Larger personal history | Beyond intended scope |
|---|---|---|---|
| Writes | One serialized writer | Still appropriate | Reassess only with multi-process sync |
| Exercise search | FTS5 + relational filters, page 30 | Same | External search unnecessary |
| History | Subject-targeted projections | Batch/yield rebuilds | Server analytics only with sync product |
| Effects | Small coalesced outbox | Bounded batches and backoff | Native background worker only if new guarantees require it |
| Backup | Bounded whole-buffer AES-GCM | Enforce archive cap | Native streaming envelope if archives materially outgrow cap |

## Confidence Assessment

| Area | Confidence | Notes |
|---|---|---|
| Module boundaries | HIGH | Fits the single-user modular-monolith scope and approved vertical slices |
| Source-of-truth flow | HIGH | SQLite facts with disposable derivatives directly addresses correction and lifecycle failures |
| Transaction kernel | HIGH | Verified against Expo SDK 57 source and SQLite connection/transaction semantics |
| Outbox and projections | HIGH | Standard at-least-once/idempotent model, simplified for one local process |
| Notifications | HIGH | Stable identifiers, list/cancel APIs, Android boot receiver, and permission constraints verified |
| Migration recovery | HIGH | Expo SQLite hot backup is suitable for internal checkpoints |
| Backup envelope | HIGH | Logical restore and built-in AES-GCM are clear |
| Argon2id adapter | MEDIUM | Required primitive is clear, but current Expo-native packages are young and need a security spike |
| Milestone order | HIGH | Dependencies align with source-fact and projection prerequisites |

## Research Flags

- **Milestone 1:** Prototype and contract-test the private writer + `BEGIN IMMEDIATE` kernel on actual Expo SQLite before feature work.
- **Milestone 1:** Verify exact-alarm permission and reboot behavior on the minimum Android device; do not infer guarantees from in-process tests.
- **Milestone 3:** Specify subject revision fan-out for corrections affecting multiple exercises/periods before implementing projection handlers.
- **Milestone 5:** Run a focused Argon2id native-module security and compatibility review.
- **Milestone 5:** Set a measured archive-size ceiling based on whole-buffer AES-GCM memory use.

## Sources

- Expo SDK 57 release: https://expo.dev/changelog/sdk-57
- Expo SQLite: https://docs.expo.dev/versions/latest/sdk/sqlite/
- Expo SQLite transaction implementation: https://github.com/expo/expo/blob/main/packages/expo-sqlite/src/SQLiteDatabase.ts
- Expo SQLite exclusive-connection issue: https://github.com/expo/expo/issues/41986
- SQLite foreign keys: https://www.sqlite.org/foreignkeys.html
- SQLite transactions: https://www.sqlite.org/lang_transaction.html
- SQLite WAL: https://www.sqlite.org/wal.html
- Expo Notifications: https://docs.expo.dev/versions/latest/sdk/notifications/
- Expo Crypto: https://docs.expo.dev/versions/latest/sdk/crypto/
- Expo FileSystem: https://docs.expo.dev/versions/latest/sdk/filesystem/
- Expo DocumentPicker: https://docs.expo.dev/versions/latest/sdk/document-picker/
- Expo Sharing: https://docs.expo.dev/versions/latest/sdk/sharing/
- React Native AppState: https://reactnative.dev/docs/appstate
- OWASP Password Storage Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html

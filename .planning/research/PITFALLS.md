# Domain Pitfalls

**Domain:** Android-first offline fitness tracking with Expo, SQLite, native Android integrations, encrypted backup, and signed APK distribution  
**Project:** Gym Tracker  
**Researched:** 2026-08-16  
**Overall confidence:** MEDIUM

## Scope and Roadmap Rule

This document uses the project's five delivery milestones as roadmap phases:

1. **Phase 1 — Trustworthy Workout Loop**
2. **Phase 2 — Owned Library and Planning**
3. **Phase 3 — Calendar and History Integrity**
4. **Phase 4 — Overall Progress and Complete Progression**
5. **Phase 5 — Recovery, Distribution, and Release**

The main roadmap risk is deferring load-bearing proof until Phase 5 because the user-facing feature appears later. Phase 1 must establish the contracts, native-build path, test harness, and failure injection needed by later phases. Phase 5 should finish backup UX, accessibility coverage, and release promotion; it must not be the first time the project runs a clean CNG prebuild, loads custom native code, kills an Android process, installs a signed artifact, or verifies a physical device.

Confidence is reported conservatively. The provider seam classified cross-checked live-web findings as **MEDIUM** in this runtime, including findings based on official documentation and primary studies.

## Critical Pitfalls

### Pitfall 1: Treating `withExclusiveTransactionAsync` as a Complete Transaction Contract

**What goes wrong:**  
The app uses ordinary `withTransactionAsync`, so unrelated asynchronous work enters the active SQL transaction, or it switches to `withExclusiveTransactionAsync` and assumes the method name proves all required isolation and foreign-key behavior. Current Expo source opens the exclusive transaction on a new SQLite connection. Connection-scoped initialization, notably `PRAGMA foreign_keys = ON`, does not automatically carry over. Worse, SQLite documents that changing `foreign_keys` inside an active transaction is a no-op, while Expo begins the transaction before invoking the callback.

**Why it happens:**  
The JavaScript callback looks lexically scoped, but ordinary Expo async transactions are scoped by when queries execute. The exclusive API fixes query capture by supplying a transaction handle, but introduces a separate-connection contract that is easy to miss. The API currently starts a deferred `BEGIN`, not an application-defined `BEGIN IMMEDIATE` or `BEGIN EXCLUSIVE`.

**Consequences:**  
- A completed set can be acknowledged after a partially incorrect write.
- Foreign-key-invalid rows can commit silently.
- Concurrent writes can fail with `database is locked` in paths never exercised by unit mocks.
- A migration can appear atomic while constraints were not actually enforced.
- Fixing the transaction layer later forces rewrites across workout, history, effects, restore, and projection repositories.

**Warning signs:**  
- Repository code calls `db.*` inside an exclusive callback instead of only `txn.*`.
- Tests prove rollback but never query `PRAGMA foreign_keys` on the actual transaction handle.
- A transaction contains notifications, haptics, file I/O, React state updates, or arbitrary awaited callbacks.
- `database is locked` is treated as an impossible error.
- Foreign-key tests run only against a host SQLite substitute.
- The wrapper is named “exclusive” but there is no device contract test for concurrent reads/writes and PRAGMA state.

**Prevention:**  
- Give one database module ownership of every connection and transaction.
- Ban correctness-critical use of `withTransactionAsync`; use a repository-owned writer boundary with an explicit transaction handle.
- In Phase 1, pin the Expo SDK and write a device-level contract test that records the transaction connection's `foreign_keys`, journal mode, transaction state, rollback behavior, and concurrent-query behavior.
- Do not assume a PRAGMA applied to the root connection applies to the exclusive transaction connection.
- If the selected Expo version cannot establish required connection PRAGMAs before `BEGIN`, do not paper over it. Use a proven primary-connection serialization strategy or a reviewed, pinned Expo/native fix while preserving the approved repository-owned transaction abstraction.
- Run only SQL and pure validation inside the transaction. Commit source facts and durable pending effects together; perform notifications, haptics, file work, and cache invalidation afterward.
- Finalize prepared statements in `finally` blocks.

**Phase ownership:**  
- **Primary:** Phase 1, before implementing set completion.
- **Carry-forward:** Every phase adding a write command must use the same transaction primitive and contract suite.
- **Release recheck:** Phase 5 after the final Expo SDK and native dependency lock are selected.

**Verification:**  
1. On an Android development build using actual `expo-sqlite`, assert `PRAGMA foreign_keys` on the root and transaction handles.
2. Inject failure after each statement in set completion; assert no set, pointer, rest state, or effect row partially commits.
3. Start an unrelated query during an active write and assert it cannot enter or reorder the transaction.
4. Attempt an invalid foreign-key insert inside the production transaction wrapper and require failure.
5. Assert no post-commit adapter is invoked before commit succeeds.
6. Run the same contract after every Expo SDK upgrade.

**Confidence:** MEDIUM — official Expo documentation and current source confirm async query capture and a new connection for exclusive transactions; SQLite officially documents connection-scoped foreign keys and the no-op behavior inside a transaction. The exact mitigation must be verified against the pinned Expo version.

---

### Pitfall 2: Migrations That Pass Happy-Path Tests but Cannot Recover

**What goes wrong:**  
A migration updates `PRAGMA user_version` separately from schema/data changes, runs while foreign keys are ineffective, validates only `integrity_check`, or is tested only from an empty database. The app then opens its root shell on a partially migrated or logically inconsistent database.

**Why it happens:**  
Greenfield projects have no production fixtures yet, so migration code is treated as bootstrapping rather than a permanent product surface. SQLite's `integrity_check` does not report foreign-key violations, and host test databases can differ from the SQLite build packaged by Expo.

**Consequences:**  
- Historical sessions become unreadable after an upgrade.
- A failed migration advances the version and cannot be retried safely.
- Content reconciliation overwrites user-owned data.
- Recovery archives restore tables but not stable identities or source manifests.
- A release must be withdrawn or repaired manually.

**Warning signs:**  
- Migration tests begin only at schema version `0`.
- `user_version` is updated after the transaction returns.
- Only table existence or row count is asserted.
- `PRAGMA foreign_key_check`, stable IDs, historical snapshots, FTS synchronization, and projection rebuilds are omitted.
- A destructive or long-running migration starts before a recovery archive is validated.
- Startup automatically loops a failing migration.
- Root tabs render while migrations or first trusted queries are incomplete.

**Prevention:**  
- Make migrations numbered, forward-only, deterministic, and transactional.
- Update `user_version` in the same successful transaction as the migration.
- Keep a fixture for every released schema version from the first release onward.
- For every migrated fixture, run both `integrity_check` and `foreign_key_check`, verify stable IDs and snapshots, reconcile content ownership, and rebuild derived projections.
- Create and validate a logical pre-migration recovery archive before destructive or long-running migrations.
- Do not mutate bundled and user-owned namespaces through the same generic upsert path.
- Block the root shell on failure and retain the prior version plus one bounded recovery path.
- Treat migration duration and memory as release data, not local impressions.

**Phase ownership:**  
- **Primary:** Phase 1 establishes runner, version-0 fixture, failure injection, and blocked-startup behavior.
- **Phase 2:** Adds content-pack and FTS migration fixtures.
- **Phase 3:** Adds corrections, void state, and projection rebuild assertions.
- **Phase 4:** Adds recommendation/progress version fixtures.
- **Phase 5:** Exercises every retained released schema fixture against the signed candidate.

**Verification:**  
1. Migrate every released fixture to current on host SQLite and actual Expo SQLite.
2. Inject a failure before and after every migration statement; assert rollback and unchanged `user_version`.
3. Run `integrity_check` and `foreign_key_check` separately.
4. Compare targeted projection rebuilds with a full rebuild after migration.
5. Verify a failed launch offers Retry, recovery restore, and diagnostics without opening tabs.
6. Measure migration duration on the minimum Android profile.

**Confidence:** MEDIUM — official SQLite behavior is clear; the recovery design is project-specific and must be proven against actual Expo SQLite.

---

### Pitfall 3: Proving Rotation or Restart, Not Android Process Death

**What goes wrong:**  
The app survives a React rerender, route remount, rotation, or `stopApp`/`launchApp` cycle, and the result is reported as process-death recovery. In-memory timers, query caches, module singletons, pending promises, or a retained JavaScript runtime hide missing durable state.

**Why it happens:**  
Android process lifetime is controlled by the system. `onDestroy` is not guaranteed, cached processes can be killed at any time, and ViewModel-like in-memory state does not survive process death. A timer based on interval decrements can look correct until the process is genuinely gone.

**Consequences:**  
- Entered set values disappear after a real kill.
- A set commits, but its notification or projection work is lost forever.
- A rest timer resumes from a stale counter rather than timestamps.
- A row left `processing` in an outbox never retries.
- Manual release testing contradicts automated “pass” results.

**Warning signs:**  
- Recovery tests call only `stopApp`, background/foreground, or rotate.
- The test never confirms the process was killed while app data remained.
- `clearState: true` appears in a resume flow.
- Current exercise, current set, entered values, rest timestamps, and effect claims live only in React state or a query cache.
- Effect rows can remain `processing` indefinitely.
- Cleanup or persistence depends on `onDestroy`.

**Prevention:**  
- Persist workout source facts at every meaningful command boundary, not in lifecycle cleanup.
- Compute rest from `restEndsAt - now`; do not persist a decrementing counter as truth.
- Commit durable pending effects with the source mutation.
- On launch, reset stale effect claims and replay handlers idempotently against current revisions.
- Keep query caches disposable and rehydrate from SQLite.
- Use Maestro `killApp` for Android system-initiated process-death simulation; do not substitute `stopApp`.
- Keep device reboot as a separate test because process kill does not prove reboot behavior.

**Phase ownership:**  
- **Primary:** Phase 1, as an exit criterion for the first workout loop.
- **Phase 3:** Repeat after corrections, voids, and projection effects exist.
- **Phase 5:** Repeat on the exact signed release APK and a physical device.

**Verification:**  
1. Start a workout, enter values, commit one set, start rest, press Home, invoke `killApp`, and relaunch without clearing data.
2. Assert persisted exercise, set index, values, prior undo state, rest revision, and timestamp-derived remaining time.
3. Kill after source commit but before notification scheduling; assert outbox replay.
4. Kill while an effect is claimed; assert stale-claim recovery and exactly-once observable result.
5. Let rest expire while dead; assert explicit expired state rather than a restarted countdown.
6. Run a separate real reboot test and verify the narrower approved reboot contract.

**Confidence:** MEDIUM — Android lifecycle and current Maestro `killApp` behavior are documented; OEM-specific memory and reboot behavior still require physical-device proof.

---

### Pitfall 4: Making Notifications Authoritative or Overpromising Reboot Delivery

**What goes wrong:**  
The UI assumes that scheduling succeeded, that a scheduled notification will be displayed, or that reboot preserves exact delivery. Permission state, exact-alarm access, channel settings, Doze, late delivery, and reboot rescheduling can all disagree with SQLite rest state.

**Why it happens:**  
Android has multiple independent gates:

- Android 13+ `POST_NOTIFICATIONS` runtime permission.
- A notification channel, whose behavior becomes user-controlled after creation.
- Exact-alarm special access on Android 12+ when exact timing is requested.
- Boot handling and rescheduling.
- The difference between scheduling, triggering, and presentation.

Expo automatically adds `RECEIVE_BOOT_COMPLETED`, but that does not justify a product promise that every pre-reboot rest alert will fire during or immediately after reboot.

**Consequences:**  
- A denied notification incorrectly cancels or corrupts rest.
- Undo leaves a stale notification scheduled.
- A late alert opens an old set or session.
- Tests pass because Maestro grants all permissions by default.
- The release claims reboot-time alerting that the implemented native path never proved.

**Warning signs:**  
- Rest state stores only the platform notification identifier.
- Permission denial changes workout facts.
- The app does not inspect the current channel or scheduled requests during reconciliation.
- Notification payloads lack session ID and rest-state revision.
- Exact-alarm permission is added without a product decision, policy review, or revocation test.
- A single emulator test is labeled “reboot safe.”
- A reused notification channel masks changes because channel importance cannot be changed programmatically after creation.

**Prevention:**  
- Keep SQLite `RestStateV1` authoritative and notifications disposable.
- Reconcile desired versus scheduled state after commit, launch, foreground, permission changes, undo, skip, finish, and discard.
- Use one stable identifier per active session and include the source revision in payloads.
- Denial or scheduling failure must leave the in-app timestamp timer correct and enqueue bounded diagnostics/retry.
- Preserve the approved v1 promise: state recovers on launch after reboot; reboot-interval notification delivery is not guaranteed unless a boot-capable native path is explicitly implemented and verified.
- Decide in Phase 1 whether exact-alarm special access is justified. If not, accept late system delivery and word the UI accordingly; do not silently request privileged access.
- Create the final channel ID and behavior early enough for device calibration because existing channel behavior is user-controlled and effectively immutable to the app.

**Phase ownership:**  
- **Primary:** Phase 1 implements reconciliation and permission-denied behavior.
- **Phase 5:** Verifies final channel, permission transitions, reboot contract, and signed-release behavior.

**Verification:**  
1. Test permission states `unset`, granted, denied, and later granted; never rely on Maestro's default allow-all behavior.
2. Assert scheduling success does not mark rest complete or prove presentation.
3. Revoke permission and exact-alarm access during active rest; assert SQLite state is unchanged.
4. Schedule, undo, pause, resume, skip, and finish; inspect scheduled requests after each action.
5. Fire a stale notification payload; assert its old revision is ignored.
6. Test late delivery and a real reboot on the physical device.

**Confidence:** MEDIUM — official Expo and Android behavior is well documented; exact timing and reboot delivery remain device- and configuration-sensitive.

---

### Pitfall 5: Discovering CNG and Native-Module Breakage Only During Release

**What goes wrong:**  
The JavaScript app works in Expo Go or a debug environment, but Argon2, notification boot handling, manifest permissions, backup exclusions, or release signing are absent or misconfigured in a clean generated Android project.

**Why it happens:**  
CNG treats native directories as generated output. Direct edits under `android/` disappear on the next clean prebuild. Expo Go includes only its bundled native capabilities; adding a native package or local Expo module requires rebuilding the development client.

**Consequences:**  
- Security or notification code compiles locally but not from a clean checkout.
- Release and debug binaries have different native capabilities.
- A config plugin is order-dependent or non-idempotent.
- A late native change invalidates all earlier physical-device testing.
- The project must choose a different crypto library after backup format work is complete.

**Warning signs:**  
- Native behavior is “verified” only in Expo Go.
- Developers patch generated `AndroidManifest.xml`, Gradle files, or Kotlin files directly.
- `android/` is uncommitted but no clean-prebuild diff check exists.
- No development APK contains the planned native crypto adapter.
- CI runs JavaScript tests but not `expo prebuild --clean`.
- Config-plugin output is not inspected or tested for idempotence.

**Prevention:**  
- Keep all native project configuration in app config and reviewed config plugins.
- Use a local Expo module for project-specific native code and a development build from Phase 1.
- Establish a clean-checkout `expo prebuild --clean` and Android compile gate before feature work depends on native capabilities.
- Pin Expo SDK, React Native, Gradle wrapper, Android Gradle Plugin, Java, Node, package manager, and Android SDK packages.
- Snapshot or structurally validate generated manifest permissions, receivers, backup rules, and native module registration.
- Rebuild the development client whenever native dependencies or config plugins change.
- Treat native dependency or Expo SDK changes as requiring lifecycle, crypto, SQLite, and release contract reruns.

**Phase ownership:**  
- **Primary:** Phase 1 creates the CNG pipeline and development-test APK.
- **Phase 2:** Verifies FTS and content configuration in the generated binary.
- **Phase 5:** Adds final Argon2/backup config, release signing, and clean reproducibility checks.

**Verification:**  
1. From a clean checkout with no generated `android/`, run prebuild twice and assert stable reviewed output.
2. Build and install a development APK that exercises actual Expo SQLite and any native module.
3. Assert manifest contains exactly the intended notification, boot, exact-alarm, and backup rules.
4. Remove and regenerate `android/`; verify no behavior depends on manual edits.
5. Build release mode before Phase 5 and run a native smoke test without Metro.

**Confidence:** MEDIUM — official Expo CNG and custom-native-code guidance is clear; package-specific plugin quality must be assessed after dependency selection.

---

### Pitfall 6: Designing an Encrypted Backup Format Before Proving the Native Crypto and Resource Envelope

**What goes wrong:**  
The archive format is implemented around an unreviewed JavaScript Argon2 package, hard-coded desktop parameters, unauthenticated metadata, reusable AES-GCM nonces, or parse-before-authenticate behavior. A malicious header can request excessive Argon2 memory or decompression before validation. Wrong-password or tamper failures occur after partial database mutation.

**Why it happens:**  
Crypto happy paths are easy to demo, while mobile memory pressure, native linking, cancellation, archive bombs, and atomic restore are late operational concerns. Password hashing guidance is sometimes copied directly without calibrating password-based file encryption on the minimum phone.

**Consequences:**  
- Backups are weak against offline guessing or unusable on low-memory devices.
- Backup export freezes or kills the JavaScript process.
- A nonce/key reuse destroys AES-GCM security.
- Tampered ciphertext produces an oracle or partially replaced local data.
- A later library change breaks archive compatibility.

**Warning signs:**  
- Argon2 runs on the JavaScript interaction path.
- The archive accepts KDF parameters before enforcing hard bounds.
- Salt, nonce, algorithm IDs, KDF parameters, and manifest are not versioned.
- Plaintext metadata that controls restore is not authenticated as AAD or inside ciphertext.
- The entire plaintext, compressed payload, and ciphertext coexist in memory.
- Restore opens a write transaction before authentication and logical validation finish.
- Tests compare only “export then import” using the same implementation.

**Prevention:**  
- Select and spike an audited Expo-compatible native Argon2id implementation before freezing the archive envelope.
- Start from current OWASP/RFC guidance, then calibrate on the documented minimum Android device; store algorithm and parameters per archive so they can evolve.
- Generate a fresh random salt and fresh unique AES-GCM nonce for every archive.
- Authenticate the envelope metadata that influences decryption/restore.
- Enforce envelope version, KDF parameter, file-size, decompressed-size, nesting, row-count, and string-length limits before expensive allocation.
- Derive the key off the interaction path; authenticate/decrypt fully before parsing logical rows.
- Restore logical, versioned source rows through staging and one exclusive replacement transaction; never replace the raw SQLite file.
- Use one non-oracular user message for wrong password, tamper, and unsupported ciphertext.
- Keep password and derived key out of logs, SQLite, diagnostics, and crash reports.

**Phase ownership:**  
- **Phase 1:** Define the crypto port, versioned envelope contract, resource-limit test approach, and a native-module feasibility spike. This is contract work, not backup UI.
- **Primary implementation:** Phase 5, after schemas stabilize.

**Verification:**  
1. Run Argon2id known-answer vectors in the actual native module.
2. Benchmark supported parameter sets on the minimum device; record latency and peak memory.
3. Verify unique salts and nonces across repeated exports of identical data.
4. Flip every envelope/ciphertext section; assert failure before parse or SQLite mutation.
5. Feed oversized and adversarial KDF parameters; assert bounded rejection before allocation.
6. Kill export/restore at every phase; assert existing SQLite remains valid and temporary plaintext is removed.
7. Restore with an independent fixture or reference implementation, not only round-trip self-tests.

**Confidence:** MEDIUM — OWASP, RFC 9106, and AES-GCM standards provide strong guidance; final parameters and module suitability require physical-device measurement and security review.

---

### Pitfall 7: Android Auto Backup Makes a “Clean Install” Non-Clean and Leaks Around the Manual Backup Policy

**What goes wrong:**  
An uninstall/reinstall or `adb install` test starts with silently restored SQLite data, so migration, first launch, and clean-install restore tests pass for the wrong reason. Separately, plaintext database or temporary archive files are copied by Android Auto Backup or device-to-device transfer despite the product's explicit encrypted manual backup design.

**Why it happens:**  
Android Auto Backup is enabled by default for modern target SDKs. It includes database files and most internal files, and restore can occur after APK installation but before first launch. `allowBackup="false"` is not a complete cross-version/OEM device-to-device policy on Android 12+.

**Consequences:**  
- The empty-database path is never exercised.
- Restore tests merge with ancestral data while claiming a clean target.
- Sensitive local workout facts bypass the password-encrypted archive path.
- Backup behavior differs between cloud restore, device transfer, emulator, and the owner's phone.

**Warning signs:**  
- “Clean install” means uninstall/install without proving the app data directory and ancestral backup state.
- Generated manifest leaves `allowBackup` and data extraction rules implicit.
- SQLite, staging files, and temporary plaintext are not explicitly excluded.
- Tests pass only on emulators with backup disabled.
- The release build's generated manifest is never audited.

**Prevention:**  
- Make the Android platform-backup policy explicit in Phase 1.
- For this manual encrypted-backup product, exclude authoritative SQLite and plaintext backup staging from cloud backup and device transfer unless the roadmap explicitly adopts OS-managed backup.
- Generate both Android 12+ `dataExtractionRules` and Android 11-and-lower `fullBackupContent` rules through CNG.
- Put transient plaintext in a no-backup location and delete it on success, cancellation, and next launch recovery.
- Use isolated application IDs or controlled backup-manager state for clean-install tests.
- Record whether a test validates app-managed restore, Android Auto Backup, or device-to-device transfer; never conflate them.

**Phase ownership:**  
- **Primary policy and config:** Phase 1, because it affects every clean-install and migration test.
- **Full app-managed restore proof:** Phase 5.

**Verification:**  
1. Inspect the generated release manifest and XML rules for both API families.
2. Populate SQLite, trigger Android backup, uninstall/reinstall, and prove excluded data does not reappear.
3. Prove a first launch creates an empty trusted database when no app-managed restore is requested.
4. Restore the encrypted archive into a target whose data directory is independently verified empty.
5. Audit app internal files during interrupted backup/export for plaintext remnants.

**Confidence:** MEDIUM — official Android documentation confirms default database inclusion and pre-launch restoration; OEM device-transfer behavior requires targeted device verification.

---

### Pitfall 8: Physically Testing One APK and Publishing Different Bytes

**What goes wrong:**  
CI builds a private signed candidate, the owner tests it, and a later promotion job rebuilds, re-signs, repackages, or otherwise publishes a different APK. Approval still appears green, but it no longer covers the released artifact.

**Why it happens:**  
Build and publish are often combined into one workflow, and “same commit” is mistaken for “same bytes.” Android builds can vary with toolchain, environment, timestamps, generated native output, signing, or dependency resolution.

**Consequences:**  
- Physical-device evidence does not apply to the release.
- A signing or CNG difference is introduced after approval.
- Checksums in release notes do not match the installed candidate.
- Rollback and provenance records cannot identify what was actually tested.

**Warning signs:**  
- Promotion runs Gradle, prebuild, package installation, or signing again.
- Approval records only a tag or commit, not the APK SHA-256.
- The checksum is generated after promotion rather than at candidate creation.
- The workflow validates only the GitHub artifact archive digest, not the inner APK/AAB bytes.
- Candidate metadata omits schema, content-pack, Expo, Gradle, Java, and dependency-lock versions.

**Prevention:**  
- Build and sign candidate bytes once.
- Compute and record SHA-256 for each inner APK and AAB before upload.
- Store candidate files, checksums, and build metadata as private artifacts.
- Gate promotion with a protected environment and approval tied to candidate digest, commit, device/Android version, checklist, and timestamp.
- Promotion downloads the exact candidate, validates GitHub's artifact digest and the inner file digests, and attaches unchanged files to the GitHub Release.
- Promotion must not run prebuild, Gradle, signing, alignment, or repackaging.
- Reject or timeout without creating a public release.

**Phase ownership:**  
- **Phase 1:** Create a non-public build-artifact workflow and record metadata so the architecture is exercised early.
- **Primary release ownership:** Phase 5.

**Verification:**  
1. Hash the installed candidate APK, approval record, downloaded promotion input, and published release attachment; require equality.
2. Inject a changed artifact after approval; require promotion failure.
3. Search the promotion job for build or signing commands and fail policy checks if found.
4. Install the release attachment after publication and compare its package signature and digest with the candidate.
5. Verify a rejected candidate leaves the prior release untouched.

**Confidence:** MEDIUM — SLSA and GitHub artifact documentation support digest-bound provenance and validation; the exact protected-environment implementation depends on repository settings.

---

### Pitfall 9: Using Maestro as Evidence for Behaviors It Did Not Exercise

**What goes wrong:**  
A green Maestro flow is treated as proof of process death, reboot, notification display, accessibility, clean install, or release behavior even though the flow only restarted the app, granted permissions, ran a debug APK, or matched visible text.

**Why it happens:**  
Maestro is intentionally high-level. `launchApp` stops/restarts by default, `clearState` erases application data, permission defaults can be permissive, and `setOrientation` proves only the configured virtual-device orientation. Current Maestro has a distinct Android `killApp` command for system-initiated death simulation.

**Consequences:**  
- Lifecycle and permission tests produce false positives.
- Debug-only test hooks become required for production behavior.
- Retry behavior masks races and flakes instead of detecting them.
- Release signing, native config, keyboard/D-pad focus order, and OEM notification behavior remain untested.

**Warning signs:**  
- `stopApp` is named “kill process” in a test.
- Resume tests call `clearState`.
- Flows omit explicit notification permission state.
- Test fixtures are injected by arbitrary SQL unavailable to users.
- Assertions inspect only text while source facts remain unverified.
- The only device matrix is one emulator and one debug APK.
- Flaky flows are retried without a lower-level deterministic test.

**Prevention:**  
- Maintain an explicit proof matrix:
  - pure rule branches → unit tests
  - transactions/migrations/effects/FTS/restore → real SQLite contract tests
  - process death → Maestro `killApp` plus persisted-state assertions
  - reboot and OEM notification behavior → `adb`/device controls and physical-device checklist
  - accessibility → semantic tests plus keyboard/D-pad manual-device passes
  - release behavior → exact signed candidate installation
- Set permission states explicitly in every relevant flow.
- Seed E2E through supported app test seeding or backup restore, not private SQL that bypasses validation.
- Keep Maestro flows short and user-centered; use repository-level assertions to prove database invariants.
- Quarantine flakes only with an owner, issue, expiry, and deterministic replacement where possible.

**Phase ownership:**  
- **Primary:** Phase 1 test infrastructure.
- **Every phase:** Add flows only for new user-visible branches; keep invariants in lower layers.
- **Phase 5:** Signed-release, reboot, accessibility, and physical-device proof.

**Verification:**  
1. Audit every lifecycle flow for `killApp` versus `stopApp`, `clearState`, and explicit permissions.
2. Pair each Maestro assertion with the lower-layer fact it is meant to prove.
3. Run the PR smoke on an actual development APK, not Expo Go.
4. Run release checks on the signed candidate without test-only behavior changing application semantics.
5. Publish failure artifacts with app version, APK digest, emulator/device API, fixture version, screenshots, and redacted diagnostics.

**Confidence:** MEDIUM — current Maestro documentation distinguishes restart, clear state, permission control, orientation, and Android process death; complete proof still depends on the surrounding harness.

---

### Pitfall 10: Bolting Adaptive Layout and Accessibility Onto Finished Screens

**What goes wrong:**  
Compact portrait screenshots look correct, but medium/expanded windows, compact-height landscape, 200% text, keyboard/D-pad focus, safe areas, or reduced motion make the workout action unreachable or semantically wrong.

**Why it happens:**  
Android window size classes describe dynamic available width and height, not device categories. A large phone can be compact in split screen; landscape can have medium width but compact height. Screenshot tests cannot prove focus order, spoken output, live regions, custom actions, or switch scanning.

**Consequences:**  
- Sticky completion/rest controls overlap content or the keyboard.
- A two-pane layout places the active action far from the current set.
- React Native accessibility grouping collapses required child semantics or creates duplicate stops.
- Timer announcements fire every second and become unusable.
- Release accessibility work requires restructuring primitives and routes.

**Warning signs:**  
- Layout branches on `isTablet`, model name, or orientation only.
- Width is tested without available height.
- Text scaling is simulated by changing fixture strings instead of device font scale.
- Fixed-height rows clip at 200%.
- Screenshot approval is called accessibility approval.
- Labels exist, but no focus-order or operation test exists.
- Color or haptic feedback is the only expression of completion/error.
- D-pad focus disappears behind a modal or sticky dock.

**Prevention:**  
- Build width/height-class, safe-area, scalable-text, focus, and semantic primitives in Phase 1.
- Let required controls grow and content reflow; avoid fixed heights for text-bearing controls.
- Keep the active workout's primary action adjacent to active work in every class.
- Define semantic contracts alongside components: role, label order, state, custom action, live-region behavior, and focus restoration.
- Pair color with text/icon/shape; pair motion/haptics with non-motion visual or spoken confirmation.
- Treat charts as optional visuals backed by text summaries and accessible tables.
- Use real Android font scale, keyboard, and D-pad for release proof.

**Phase ownership:**  
- **Phase 1:** Foundation primitives and the active workout.
- **Phases 2–4:** Each new screen must pass the same component-level adaptive and semantic contracts when added.
- **Phase 5:** Complete device matrix, manual assistive-technology pass, and post-implementation design review.

**Verification:**  
1. Test compact, medium, and expanded widths plus compact-height landscape and split screen.
2. Rotate during active input and rest; preserve focus, scroll position, set, and timer.
3. Set Android font scale to 200%; assert all required text and actions remain reachable.
4. Traverse every critical flow with keyboard/D-pad and visible focus.
5. Verify meaningful labels, save success/failure status, and timer state without per-second live chatter.
6. Verify touch targets, contrast, non-color cues, and reduced-motion behavior with analysis tools and manual testing.

**Confidence:** MEDIUM — Android's adaptive and accessibility guidance is explicit; React Native's final native semantics must be proven in the implemented release.

---

### Pitfall 11: Encoding Fitness Progression as Universal Coaching Instead of Versioned Semantics

**What goes wrong:**  
A single “increase” rule is applied across load/reps, assistance, timed holds, fixed distance, fixed time, intervals, and unscored exercise. Warm-ups or incomplete sessions enter progression evidence; missing effort is treated as success; corrections leave stale recommendations; “Failed” becomes a user judgment rather than an internal observation.

**Why it happens:**  
Progression sounds like arithmetic, but comparator direction and comparability differ by metric. Primary studies support both repetition and load progression in specific resistance-training contexts, not a universal algorithm for all fitness modalities. Proximity-to-failure evidence differs by outcome and remains uncertain.

**Consequences:**  
- Assistance increases are incorrectly displayed as improvement.
- Faster fixed-distance efforts sort in the wrong direction.
- Interval sessions with different protocols are compared.
- A partial or corrected session triggers an unjustified load change.
- Advice appears medically or scientifically authoritative beyond the evidence.
- Changing the rule later invalidates historical explanations.

**Warning signs:**  
- One generic numeric comparator handles every metric profile.
- Aggregate means are written back as atomic targets.
- Warm-ups contribute to records or recommendations.
- Missing effort silently passes an increase gate.
- A recommendation stores only its output, not evidence, rule version, comparator, and plan-target revision.
- Cardio or interval targets progress without a plan-authored policy.
- Recommendation acceptance overwrites a newer manual target.
- UI copy implies injury, readiness, weakness, or guaranteed optimality.

**Prevention:**  
- Keep one versioned observation contract and one explicit comparator/aggregator per metric profile.
- Implement only `load_reps` double progression in Phase 1; add other profiles when their semantics are needed, not through a generic fallback.
- Treat both load and repetition progression as valid resistance-training strategies.
- Exclude warm-ups, skipped sets, invalid sets, and inappropriate partial exposures.
- Missing effort yields an explicit Hold reason where effort gates increases.
- Use plan-authored policies for cardio/interval progression and no automatic progression for unscored work.
- Store serialized evidence, rule ID/version, recommendation action, current/proposed target, and source plan-target revision.
- Require explicit acceptance with optimistic concurrency; stale recommendations become superseded.
- Corrections, voids, and restores invalidate and deterministically regenerate dependent recommendations.
- Use calm evidence-first language and no medical claims.

**Phase ownership:**  
- **Phase 1:** Versioned metric contract, `load_reps`, warm-up exclusion, effort semantics, evidence display, and acceptance conflict handling.
- **Phase 2:** Remaining profiles required by owned plans, with comparator tests.
- **Phase 3:** Correction/void invalidation and rebuild equivalence.
- **Phase 4:** Complete approved profile-specific recommendation lifecycle and overall progress.

**Verification:**  
1. Table-test every metric profile's Best, Average, Last, tie-break, and improvement direction.
2. Prove warm-ups never affect records or progression.
3. Cover sparse history, below range, partial upper-range success, full success, missing/Hard/Failed effort, and consecutive regression.
4. Verify incomplete planned exposure does not increment consecutive-failure counters.
5. Compare only equal fixed distances, equal fixed times, and immutable interval protocol IDs.
6. Edit/void/restore source history and compare targeted regeneration with full rebuild.
7. Accept a recommendation after a concurrent manual target edit; require supersession with no overwrite.

**Confidence:** MEDIUM — the cited position stand and primary studies support conservative load/repetition progression and caution around failure semantics; app-specific rules remain a transparent product policy rather than a universal physiological truth.

## Moderate Pitfalls

### Pitfall 12: Letting FTS Become a Second Source of Truth or a User-Controlled Query Language

**What goes wrong:**  
The relational exercise row updates but the FTS row does not, a content migration creates an empty external-content index without backfill, or raw punctuation is sent to `MATCH` and becomes syntax or operators. Search appears to lose exercises while the source rows are intact.

**Why it happens:**  
FTS5 virtual tables are indexes with their own tokenizer and query grammar. External-content tables do not synchronize themselves. “Partial search” is also ambiguous: default token-prefix matching is not arbitrary mid-token substring matching.

**Consequences:**  
- Built-in and custom exercises return different results.
- Deleted or renamed aliases remain searchable.
- Punctuation causes errors or changes semantics.
- Ranking changes after a SQLite/tokenizer upgrade.
- A later repair cannot determine which store is authoritative.

**Warning signs:**  
- Screens concatenate `MATCH '${query}*'`.
- FTS updates happen in a separate transaction from exercise/alias updates.
- Tests assert result text but not stable IDs and source-row parity.
- Content-pack migration creates triggers/indexes without a backfill or rebuild.
- “Partial” has no acceptance examples for spaces, hyphens, apostrophes, diacritics, aliases, and mid-token input.
- Search hydrates the whole catalog and filters in JavaScript.

**Prevention:**  
- Keep relational exercise and alias rows authoritative.
- Normalize text with one deterministic, versioned function used by imports, custom writes, repairs, and tests.
- Convert ordinary input into a safely quoted/tokenized query; never expose raw FTS operators in v1.
- Update relational and FTS rows in the same proven write transaction.
- Provide a repair command that rebuilds FTS from source rows.
- Define v1 partial search explicitly through fixtures; do not accidentally expand it from token-prefix to arbitrary substring.
- Keep taxonomy filters relational and hydrate only bounded result pages.

**Phase ownership:**  
- **Primary:** Phase 2.
- **Foundation dependency:** Phase 1 transaction and migration harness.
- **Phase 5:** Re-run FTS availability and repair tests in the final generated release binary.

**Verification:**  
1. Compare searchable visible source IDs with FTS IDs after import, custom create/edit/delete, content upgrade, migration, and repair.
2. Test punctuation, quotes, boolean words, hyphens, diacritics, aliases, long input, and empty input.
3. Prove malformed input cannot alter SQL or FTS query structure.
4. Delete the index and rebuild; require identical stable-ID results.
5. Benchmark representative 300+ and expanded fixtures on actual Expo SQLite.

**Confidence:** MEDIUM — official SQLite FTS5 behavior is clear; tokenizer choice and exact search semantics require project fixtures and device benchmarking.

---

### Pitfall 13: Confusing Debug/Emulator Success With Physical Release Readiness

**What goes wrong:**  
The app passes debug APK tests on an emulator, but the release build fails because Metro is absent, code is optimized, native permissions differ, Android restores ancestral data, notification channels retain user settings, or the minimum phone cannot afford the crypto/migration workload.

**Why it happens:**  
Debug builds optimize iteration, not distribution fidelity. Emulators rarely represent OEM background restrictions, real notification settings, biometric/device-lock backup conditions, font rendering, thermal behavior, or one-handed gym-floor use.

**Warning signs:**  
- No signed candidate is installed before a release tag.
- Physical testing happens on a locally rebuilt APK rather than CI candidate bytes.
- Device model, Android version, package signature, and APK digest are absent from evidence.
- Backup and Argon2 performance are measured on a laptop or emulator only.
- Airplane mode is simulated by mocking network APIs.

**Prevention:**  
- Produce installable artifacts continuously, with at least one release-mode smoke before Phase 5.
- Define a minimum supported Android profile and one owner physical-device profile.
- Run airplane mode, denied notifications, process death, rotation, 200% text, and encrypted backup on the exact signed candidate.
- Bind approval to digest and promote unchanged bytes.

**Phase ownership:**  
- **Phase 1:** Development APK and first physical workout loop.
- **Phase 5:** Signed candidate, full physical-device checklist, approval, and promotion.

**Verification:**  
- Install from the private CI artifact, record digest/signature/device metadata, run the checklist, and verify the published attachment is identical.

**Confidence:** MEDIUM — build-system and Android differences are established; the final failure profile is device-specific.

## Minor Pitfalls

### Pitfall 14: Reusing Notification Channels During Tests and Misreading Configuration Changes

**What goes wrong:**  
Tests change sound or importance under an existing channel ID and assume the new app configuration took effect. Android keeps the user's existing channel behavior.

**Warning signs:**  
- A test changes channel importance but never clears app data or reads the channel back.
- Test devices have years of deleted or modified development channels.
- Expected behavior is inferred from app config rather than system channel settings.

**Prevention:**  
Freeze the production rest-channel ID and defaults deliberately. In tests that evaluate channel creation, clear app data or use a dedicated versioned test channel. Inspect actual channel settings rather than config input.

**Phase ownership:** Phase 1 notification adapter; Phase 5 device calibration.

**Verification:** Read the channel after creation, mutate app config, recreate it, and prove which fields remain user-controlled.

**Confidence:** MEDIUM.

### Pitfall 15: Leaving Prepared Statements or Cursors Open During Heavy Work

**What goes wrong:**  
Unfinalized statements retain native resources, prolong implicit transactions, contribute to busy errors, or create memory pressure during migration, FTS rebuild, backup, or projection work.

**Warning signs:**  
- Prepared statements are not wrapped in `try`/`finally`.
- Async iterators are abandoned before completion without a defined cleanup path.
- Lock or memory use grows across repeated search, migration, or rebuild runs.
- A supposedly finished transaction still reports active or returns `SQLITE_BUSY`.

**Prevention:**  
Use high-level helpers where appropriate; otherwise finalize every prepared statement in `finally`, fully consume or close iterators, batch heavy operations, and yield outside source transactions.

**Phase ownership:** Phase 1 SQLite abstraction; enforced in all later repository work.

**Verification:** Run repeated transaction/search/rebuild loops under memory and lock instrumentation; require stable resource use and no leaked active transaction.

**Confidence:** MEDIUM.

## False Verification Traps

| Claim | False Proof | Required Proof |
|---|---|---|
| Set completion is atomic | Mock repository returns success | Actual Expo SQLite, failure after every statement, no partial facts/effects |
| Foreign keys are enforced | Root connection says `1` | Query and violate FK through the production transaction handle |
| Migration is safe | Fresh install works | Every released fixture, injected rollback, separate FK/integrity checks, recovery archive |
| Process death recovers | Rotation or `stopApp`/`launchApp` works | Home → Maestro `killApp`/`adb shell am kill` → relaunch without clear state |
| Reboot is supported | Process-kill test passes | Real emulator/device reboot; verify only the documented launch-recovery promise |
| Notification works | Scheduling returns an ID | Explicit permission/channel/alarm state plus actual presentation and late/denied behavior |
| Clean install is empty | APK was reinstalled | Auto Backup/D2D controlled; app data and ancestral restore state verified |
| Encrypted backup is secure | Correct password round-trip works | KATs, tamper/wrong-password, parameter bounds, nonce uniqueness, pre-mutation rejection |
| Search is synchronized | Common names appear | Stable-ID parity, punctuation fixtures, content/custom mutations, full rebuild equivalence |
| Layout is adaptive | Phone and tablet screenshots | Dynamic width and height classes, split screen, rotation, 200% device font scale |
| App is accessible | Labels exist in component tests | Keyboard/D-pad, focus restoration, meaningful status labels |
| Release is approved | Same commit was tested | Same signed APK SHA-256 was installed, approved, downloaded, and published |
| Progression is correct | One 3×8 example passes | Full metric/comparability/effort/correction/revision matrix |

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Roadmap Mitigation |
|---|---|---|
| Phase 1 — SQLite foundation | Exclusive API silently lacks required connection PRAGMAs | Block workout implementation on actual-device transaction/FK/concurrency contract tests |
| Phase 1 — Migrations | Greenfield-only tests hide future upgrade failure | Create versioned fixtures and failure injection before first release |
| Phase 1 — Workout loop | UI acknowledges state before durable commit | Return authoritative committed state; no optimistic source-fact UI |
| Phase 1 — Rest/effects | Process dies between commit and notification | Commit outbox row with source facts; stale-claim replay on launch |
| Phase 1 — Android test harness | `stopApp` and permissive permissions produce false lifecycle pass | Use `killApp`, explicit permission states, actual Expo SQLite, and no `clearState` in resume flows |
| Phase 1 — CNG | Native assumptions deferred to release | Clean prebuild, development APK, generated-manifest checks, physical smoke |
| Phase 1 — Backup/release foundations | Later features choose incompatible native/CI architecture | Spike native Argon2 port; define Android backup exclusions and digest-bound artifact workflow |
| Phase 2 — Catalog/search | FTS drifts from relational data or raw input becomes syntax | One-transaction synchronization, exact search fixtures, repair/rebuild command |
| Phase 2 — Metrics/plans | Generic metric abstraction erases comparator direction | Add each profile with its own contract and complete comparator tests |
| Phase 3 — Corrections/voids | Source facts change while projections/recommendations remain stale | Source commit plus durable rebuild/invalidation effects; targeted/full equivalence |
| Phase 4 — Progression | Advice overstates sparse or non-comparable evidence | Versioned, profile-specific rules; explicit Hold/manual outcomes; optimistic acceptance |
| Phase 4 — Charts | Visual trend is inaccessible or semantically misleading | Text summary and accessible data table share the same source query |
| Phase 5 — Backup | Crypto, parsing, and restore mutation are interleaved | Validate limits → KDF → authenticate/decrypt → validate staging → one replacement transaction |
| Phase 5 — Adaptive/accessibility | Late audit discovers primitive-level flaws | Reuse Phase 1 primitives; run real services and 200% text on every critical flow |
| Phase 5 — Release | Approval covers commit, not bytes | Build/sign once; approve APK digest; promote unchanged artifacts |

## Roadmap Gates

### Phase 1 must not exit until

- Actual Expo SQLite proves the chosen transaction wrapper's isolation and foreign-key behavior.
- A working set cannot be acknowledged before source and pending-effect commit.
- Android system-initiated process death is tested with `killApp`, not only restart.
- Notification permission denial leaves SQLite rest state correct.
- Clean CNG prebuild produces an installable development APK from a clean checkout.
- Android platform-backup exclusions are explicit in generated native configuration.
- The native Argon2 path is shown feasible on a development build, even though backup UI remains Phase 5.
- CI can produce, hash, retain, and later download an artifact without rebuilding it.
- The first progression rule has complete metric, warm-up, effort, evidence, and stale-revision tests.

### Phase 2 must not exit until

- FTS and relational source rows have stable-ID parity after every write path.
- Search punctuation and partial-match semantics are fixture-defined.
- Every added metric profile has explicit comparator and aggregation semantics.

### Phase 3 must not exit until

- Corrections, voids, and restores produce targeted rebuild output identical to a full rebuild.
- Pending recommendations derived from changed history are invalidated before the command is acknowledged complete.

### Phase 4 must not exit until

- Every recommendation is reproducible from stored evidence and a versioned rule.
- No unaccepted or stale recommendation mutates a plan.
- Non-resistance progression is plan-authored; unscored work has no automatic progression.
- Every chart has equivalent textual and accessible tabular output.

### Phase 5 must not exit until

- Backup KDF/encryption runs in the audited native path with bounded resources on the minimum phone.
- Wrong-password, tamper, unsupported, oversized, and failed-transaction restores mutate nothing.
- Auto Backup cannot contaminate clean-install restore evidence.
- Keyboard/D-pad, 200% text, dynamic layouts, rotation, logical focus, and reduced motion pass on the release build.
- The exact signed APK digest tested on the physical device is the digest attached to the GitHub Release.

## Research Flags for Phase Planning

| Phase | Research Depth | Reason |
|---|---|---|
| Phase 1 — SQLite transaction primitive | **Deep research required** | The approved exclusive-transaction intent is correct, but the pinned Expo SDK's separate-connection PRAGMA behavior must be resolved experimentally before implementation. |
| Phase 1 — Android notification timing | **Focused decision required** | Decide whether exact-alarm special access is justified or whether late delivery is accepted; do not change the approved reboot promise without native proof. |
| Phase 1 — Native Argon2 feasibility | **Focused spike required** | Library audit, Expo compatibility, thread behavior, known-answer support, and clean CNG build must be known before the envelope freezes. |
| Phase 2 — FTS tokenizer/search semantics | **Focused research required** | Token-prefix versus substring behavior, punctuation policy, tokenizer normalization, and ranking fixtures must be explicit. |
| Phase 4 — Remaining progression policies | **Domain review required** | Resistance evidence does not authorize generic cardio, interval, deload, injury, or readiness rules. |
| Phase 5 — Backup security review | **Deep review required** | Envelope, resource limits, native crypto, plaintext lifecycle, and atomic restore form a security boundary. |
| Phase 5 — Release promotion | **Operational rehearsal required** | Protected environment, artifact retention, inner-file digest validation, install evidence, rejection, and unchanged promotion must be rehearsed before the first public tag. |
| Phase 5 — Accessibility | **Physical-device/manual review required** | Automated semantic and screenshot tests cannot prove assistive-technology usability. |

## Sources

### SQLite and Android lifecycle

- [Expo SQLite — current documentation](https://docs.expo.dev/versions/latest/sdk/sqlite/) — async transaction capture, exclusive transaction API, prepared-statement finalization, PRAGMAs, FTS configuration. **Confidence: MEDIUM**
- [Expo `SQLiteDatabase.ts` — current source](https://github.com/expo/expo/blob/main/packages/expo-sqlite/src/SQLiteDatabase.ts) — exclusive transaction uses a new connection. **Confidence: MEDIUM**
- [Expo issue #41986](https://github.com/expo/expo/issues/41986) — separate exclusive connection can miss root-connection foreign-key initialization. **Confidence: MEDIUM**
- [Expo PR #43603](https://github.com/expo/expo/pull/43603) — proposed documentation of the separate-connection behavior; open at research time. **Confidence: MEDIUM**
- [SQLite Transactions](https://www.sqlite.org/lang_transaction.html) — deferred/immediate/exclusive semantics, active statements, busy commit behavior. **Confidence: MEDIUM**
- [SQLite PRAGMA reference](https://www.sqlite.org/pragma.html) — `foreign_keys`, `foreign_key_check`, `integrity_check`, `journal_mode`, and `user_version`. **Confidence: MEDIUM**
- [Android: Save UI states](https://developer.android.com/topic/libraries/architecture/saving-states) — ViewModel versus saved state versus persistent storage under process death. **Confidence: MEDIUM**
- [Android: Processes and app lifecycle](https://developer.android.com/guide/components/activities/process-lifecycle) — system-controlled process lifetime and cached-process termination. **Confidence: MEDIUM**
- [Android: Activity lifecycle](https://developer.android.com/guide/components/activities/activity-lifecycle) — `onDestroy` limitations and system-initiated process death. **Confidence: MEDIUM**

### Notifications and native generation

- [Expo Notifications — current documentation](https://docs.expo.dev/versions/latest/sdk/notifications/) — boot permission, exact-alarm permission, Android 13 channel/permission behavior, scheduling versus presentation. **Confidence: MEDIUM**
- [Android notification runtime permission](https://developer.android.com/develop/ui/views/notifications/notification-permission) — Android 13 fresh-install and denial behavior. **Confidence: MEDIUM**
- [Android exact alarms](https://developer.android.com/develop/background-work/services/alarms) — special access, revocation, rescheduling, Doze, and timing constraints. **Confidence: MEDIUM**
- [Android notification channels](https://developer.android.com/develop/ui/views/notifications/channels) — channel requirement, user control, and immutable app-defined behavior after creation. **Confidence: MEDIUM**
- [Expo Continuous Native Generation](https://docs.expo.dev/workflow/continuous-native-generation/) — clean prebuild, generated native ownership, and config plugins. **Confidence: MEDIUM**
- [Expo: Add custom native code](https://docs.expo.dev/workflow/customizing/) — development builds, local Expo modules, config plugins, and loss of direct generated-native edits. **Confidence: MEDIUM**

### FTS, backup, and release

- [SQLite FTS5](https://www.sqlite.org/fts5.html) — query grammar, tokenizers, external-content synchronization, prefix indexes, rank, and rebuild. **Confidence: MEDIUM**
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) — Argon2id minimum parameters and calibration guidance. **Confidence: MEDIUM**
- [RFC 9106: Argon2](https://www.rfc-editor.org/rfc/rfc9106) — Argon2id parameter selection, salt, tag, and memory-constrained recommendation. **Confidence: MEDIUM**
- [RFC 5084: AES-GCM in CMS](https://www.rfc-editor.org/rfc/rfc5084) — unique nonce requirement and authenticated data semantics. **Confidence: MEDIUM**
- [Android Auto Backup](https://developer.android.com/identity/data/autobackup) — default database inclusion, pre-launch restore, quota, and versioned rules. **Confidence: MEDIUM**
- [Android backup security recommendations](https://developer.android.com/privacy-and-security/risks/backup-best-practices) — exclusions, cloud versus device transfer, and sensitive-data handling. **Confidence: MEDIUM**
- [SLSA v1.1: Producing artifacts](https://slsa.dev/spec/v1.1/requirements) — digest-bound provenance and consistent build process. **Confidence: MEDIUM**
- [GitHub Actions: Store and share data](https://docs.github.com/en/actions/tutorials/store-and-share-data) — artifact upload/download SHA-256 validation. **Confidence: MEDIUM**
- [GitHub Actions: Reviewing deployments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/review-deployments) — protected-environment approval. **Confidence: MEDIUM**

### Testing, adaptation, and accessibility

- [Maestro `launchApp`](https://docs.maestro.dev/reference/commands-available/launchapp) — default restart, `clearState`, and permission defaults. **Confidence: MEDIUM**
- [Maestro `stopApp`](https://docs.maestro.dev/reference/commands-available/stopapp) — stopping without proving system-initiated process death. **Confidence: MEDIUM**
- [Maestro `killApp`](https://docs.maestro.dev/reference/commands-available/killapp) — Android system-initiated process-death simulation. **Confidence: MEDIUM**
- [Maestro `setPermissions`](https://docs.maestro.dev/reference/commands-available/setpermissions) — explicit allow/deny control. **Confidence: MEDIUM**
- [Maestro `setOrientation`](https://docs.maestro.dev/reference/commands-available/setorientation) — virtual-device orientation control. **Confidence: MEDIUM**
- [Android window size classes](https://developer.android.com/develop/ui/compose/layouts/adaptive/use-window-size-classes) — dynamic available width/height, split screen, and breakpoint testing. **Confidence: MEDIUM**
- [Android accessibility testing](https://developer.android.com/guide/topics/ui/accessibility/testing) — manual services, analysis tools, automation, and user testing. **Confidence: MEDIUM**
- [Android accessibility principles](https://developer.android.com/guide/topics/ui/accessibility/principles) — labels, focus, alternate actions, and non-color cues. **Confidence: MEDIUM**

### Fitness progression semantics

- [ACSM progression models position stand — PMID 11828249](https://pubmed.ncbi.nlm.nih.gov/11828249/) — small load increases after exceeding the desired repetitions; individual goal/status context. **Confidence: MEDIUM**
- [Load versus repetition progression — PMID 36199287](https://pubmed.ncbi.nlm.nih.gov/36199287/) — both strategies viable in trained participants over eight weeks. **Confidence: MEDIUM**
- [Overload progression protocols — PMID 38286426](https://pubmed.ncbi.nlm.nih.gov/38286426/) — load and repetition progression both improved strength and hypertrophy in early training. **Confidence: MEDIUM**
- [Proximity-to-failure meta-regressions — PMID 38970765](https://pubmed.ncbi.nlm.nih.gov/38970765/) — outcome-specific and uncertain dose-response interpretation. **Confidence: MEDIUM**
- [Failure versus repetitions in reserve — PMID 38393985](https://pubmed.ncbi.nlm.nih.gov/38393985/) — similar short-term hypertrophy with greater acute fatigue under momentary failure. **Confidence: MEDIUM**

## What Might Still Be Missing

- The exact Expo SDK and `expo-sqlite` version are not yet pinned; transaction-connection behavior must be rechecked after selection.
- No Argon2id native package has been selected, audited, or benchmarked on the owner's minimum Android device.
- The owner's phone model, Android version, OEM background restrictions, and exact-alarm policy are not yet known.
- Repository settings for GitHub protected environments and artifact retention have not been exercised.
- The final reviewed exercise subset and exact FTS normalization/tokenizer contract are not yet defined.
- Fitness sources support the conservative resistance-training direction but do not validate every project-specific recommendation branch; those remain transparent, versioned product policies.

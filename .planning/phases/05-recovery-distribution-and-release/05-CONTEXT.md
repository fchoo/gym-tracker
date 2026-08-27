# Phase 5 Context: Recovery, Distribution, and Release

## Phase goal

The owner can export a portable logical snapshot of their data, recover it safely without replacing the raw SQLite file, and receive the exact signed Android candidate that was physically reviewed before public promotion.

## Locked decisions

- SQLite remains the authority. A backup is a versioned logical snapshot of *user-owned* facts, never a copied `.db`, WAL, journal, migration recovery file, or bundle of database pages. `src/platform/sqlite/recoveryBackup.ts` remains migration-only infrastructure and is not exposed through the product.
- Backup format v1 is a single, opaque, deterministic binary envelope. Its bytes are `magic + format version + bounded canonical-header length + canonical UTF-8 header + AES-256-GCM ciphertext/tag`. The header contains only format/KDF/cipher metadata, salt, nonce, byte lengths, and a non-sensitive snapshot identifier; it contains no workout payload. The exact header bytes are AES-GCM additional authenticated data (AAD).
- The v1 payload is canonical UTF-8 JSON and deliberately uses no compression (`compression: "none"`). This removes a decompression-bomb class while retaining explicit archive, ciphertext, plaintext/decompressed-equivalent, row, string, nesting, header, and memory limits. A future compressed format requires a new format version and its own review.
- The KDF is the existing reviewed native Argon2id port with descriptor version 1, 19,456 KiB memory, 2 iterations, parallelism 1, a fresh 16-byte salt, and a 32-byte output. AES uses a fresh 12-byte nonce and 256-bit key. Passwords, derived keys, caller-owned encoded password bytes, plaintext buffers, and temporary files are wiped/deleted in `finally` paths; none is stored in SQLite, logs, diagnostics, or release metadata.
- Initial v1 limits are fail-closed: 16 KiB header, 32 MiB input archive/ciphertext, 24 MiB plaintext JSON, 100,000 total logical rows, 25,000 rows per table, 64 KiB per string, nesting depth 16, and no unknown table/field/type. All counters are checked before allocation or mutation where the API permits it. The implementation must additionally bound its owned temporary buffers and document that envelope v1 is whole-buffer AES-GCM rather than claiming streaming support it does not have.
- The snapshot contains user-owned settings, custom exercises, owned/copied plans and their schedule/target/policy graph, sessions and sets, correction/void/restore audit state, user-owned recommendation decisions, and source references. It contains bundled catalog identity/revision/reference information but never treats bundled catalog rows as imported authority.
- Restore is staged: select bounded read-only input -> parse/authenticate header -> derive key -> AES-GCM decrypt/authenticate -> bounded JSON parse -> strict manifest/schema/ID/reference validation -> user-facing preview -> explicit replacement confirmation -> one serialized `kernel.write()` replacement of user-owned source tables. No route imports a SQLite repository directly.
- Any wrong password, authentication failure, unsupported version, malformed/oversized file, cancellation, parser/validation failure, or source-table insert failure occurs before commit or rolls back the replacement transaction. In every such case the previous logical source state remains unchanged and the UI uses a safe typed error without archive content.
- The facts replacement and derivative rebuild are deliberately two durability stages. The same replacement transaction writes a singleton `rebuild_pending` state. After its commit, FTS and history/progress/recommendation projections rebuild through their existing serialized repository seams. A rebuild failure never presents stale derivatives as facts: startup and the recovery screen retry from the pending state before dependent reads are considered current. The plan must not claim atomic facts-plus-derivatives behavior until an actual shared transaction seam exists.
- Restore reconciles references against the locally approved bundled catalog only after source facts are validated. Missing bundled references remain traceable and safely unavailable; custom/copy identities, snapshots, and historical source identity survive. Auto Backup/D2D must not contaminate the clean-install restore proof.
- CSV is a separate, explicitly readable export. It is versioned, deterministic, UTF-8, has a fixed column order/units and locale-independent numeric/timestamp representation, covers set/correction/void/recommendation/decision fields, neutralizes spreadsheet-formula cells, and is shared explicitly. It is not silently encrypted or used as a restore input.
- More is the Phase 5 entry surface. It gains a `Data and recovery` path with separate backup, restore, and CSV actions. Restore previews replacement counts/source references before a typed destructive confirmation and never displays archive payload in an error. Light mode uses the established neutral-grey canvas with white cards; dark mode uses graphite canvas with near-black cards.
- Release jobs build APK/AAB candidate bytes once in a private candidate workflow, record SHA-256 plus source/config/build metadata, retain the exact files privately, and run the automated matrix against those bytes. Promotion verifies the retained candidate and physical-review record against those digests, then publishes those same bytes without Gradle/Expo rebuilding.
- A final human/native gate remains deferred. No plan creates owner approval evidence, a terminal seal, or public release until the owner supplies the literal lowercase token `approved` and the exact candidate completes the specified attended checks.

## Source audit

| Concern | Existing source / reusable seam | Phase 5 implication |
|---|---|---|
| Password KDF | `src/platform/crypto/passwordKdf.ts` | Use the existing native Argon2id descriptor/validation/wipe behavior; add archive ownership and vectors around it instead of a second KDF. |
| Authenticated encryption | Expo Crypto AES-GCM module audited in `node_modules` | Isolate it behind a narrow archive-crypto port with nonce/tag/AAD tests and no secret-bearing diagnostics. |
| Source transaction | `src/platform/sqlite/sqliteKernel.ts` | User-owned replacement uses exactly one `kernel.write()` callback after all preflight steps pass. |
| Rebuilds | `exerciseSearchIndexRepository.ts`, `historyProjectionRepository.ts` | They each own a `kernel.write()`, so post-commit rebuild must be pending/retryable, not nested inside restore replacement. |
| Catalog ownership | content and owned-plan migrations/repositories | Export source references but never restore bundled content as mutable data. |
| Runtime boundary | `src/bootstrap/workoutAppRuntime.tsx` | Add typed backup/restore/export capabilities here; screens remain repository-free. |
| File APIs | `expo-file-system` `File`/`Paths` | Import picker reads `content://` as bounded read-only; temporary archive material stays in cache and is removed. |
| Sharing | `package.json` has no `expo-sharing` | Add the Expo-managed sharing dependency only in the implementation slice that performs explicit system share. |
| Release precedent | `.github/workflows/pr.yml`, exact-HEAD artifact scripts | Extend its digest/retention discipline into private candidate, nightly, and no-rebuild promotion contracts. |

## Data flow and failure posture

```text
user-owned SQLite facts
        |
        v
stable logical collector -> canonical snapshot -> Argon2id -> AES-GCM(AAD=header)
        |                                                        |
        |                                                        v
        +----------------------------------------------> explicit OS share

read-only selected archive -> authenticate/decrypt -> bounded parse/validate -> preview
                                                                         |
                                  cancellation/error -------------------+--> no source write
                                                                         |
                                                                         v
                                 one serialized replacement transaction + rebuild_pending
                                                                         |
                                                                         v
                       catalog-reference reconciliation -> FTS rebuild -> history/progress/recommendation rebuild
                                                                         |
                                                                         +--> retry pending rebuild before factual derivatives read

single signed candidate build -> SHA-256/metadata/private retention -> physical evidence by digest
                                                                         |
                                                                         v
                                                     verify exact bytes -> public promotion (no rebuild)
```

## Review outcomes recorded inline

The normal GSD researcher/planner/checker separation and the GStack engineering/design reviews normally use delegated or interactive steps. The owner explicitly requested main-agent-only autonomous completion and no subagents are permitted in this run. The equivalent inline review selected:

- a small versioned logical envelope over raw database copying;
- authenticated metadata plus strict limits before parsing/writing;
- an explicit two-stage facts/rebuild recovery model rather than a false all-or-nothing derivative claim;
- one Data and recovery information hierarchy with an intentionally destructive restore confirmation;
- a private build-once candidate/promotion chain, with physical verification deferred rather than fabricated.

## Explicit non-goals

- No raw SQLite, WAL, migration recovery backup, cloud sync, account, remote backup, automatic restore, or cross-device continuous synchronization.
- No custom cryptographic primitive, compression implementation, unbounded JSON parsing, passphrase persistence, or plaintext archive retention.
- No silent restoration, catalog overwrite, silent target mutation, or display of unverified/stale derivative facts.
- No source write from a route/UI module, and no UI access to raw archive contents in error diagnostics.
- No Android build, generated-native execution, emulator/device/Maestro, benchmark, assistive-technology, attended visual review, signed-public publication, owner approval evidence, or Terminal Seal during source-only plans 05-01 through 05-06.

## Phase evidence strategy

- TDD starts with format/KDF/AES known-answer, parser-limit, logical-schema, transaction-rollback, reconciliation, and CSV golden fixtures before command/UI wiring.
- Integrity-critical portability/replacement/rebuild modules retain complete branch coverage. Host SQLite fixtures compare pre/post logical state for every failed restore and prove valid restore/rebuild parity.
- Component tests cover the Data and recovery hierarchy, password visibility/validation, picker cancellation, preview/typed confirmation, loading/error/retry, destructive wording, share actions, System/Light/Dark, compact/medium/expanded, 200% text, keyboard/D-pad, focus, non-color, and reduced motion through repository test utilities.
- The final gate binds source, candidate manifest, APK/AAB SHA-256, retained artifact inner-file hashes, test matrix, device observations, and public release hashes. It is intentionally blocked pending real attended evidence.

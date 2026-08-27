# Phase 5 Source-Grounded Research

## Existing implementation facts

1. `createPasswordKdfPort()` already rejects malformed descriptors, restricts the release Argon2id parameters, copies native inputs, and zeroes its owned password/salt/output buffers. Phase 5 must keep that contract and zero its own caller-owned UTF-8 password, derived-key, plaintext, and temporary-file material as well.
2. Expo Crypto provides AES-256-GCM with nonce, tag, and authenticated additional data support. The final archive adapter must use the exact header bytes as AAD and expose only typed safe error codes to the rest of the app.
3. `SqliteKernel.write()` serializes a `BEGIN IMMEDIATE` transaction and translates storage errors. It is the only safe replacement seam for restore writes.
4. `createExerciseSearchIndexRepository(kernel).rebuildSearchIndex()` and `createHistoryProjectionRepository(kernel).rebuildAll({ nowMs })` each start their own serialized writer transaction. Calling them inside a surrounding restore write would be nested transaction behavior, so the source replacement cannot claim to include derivative rebuild atomically without a new verified seam.
5. The current migrations distinguish bundled content, user-owned custom/copy content, schedules, immutable source references, historical session facts, correction/void overlays, projection state, and recommendation evidence. A restore snapshot must preserve user-owned IDs and references but not import bundled tables as replacement source.
6. `expo-file-system` offers document/cache paths, bounded metadata/byte reads, writes, deletion, and a MIME-filtered picker. Android `content://` imports are read-only, so import must never assume a writable selected URI.
7. The project has `expo-crypto` and `expo-file-system` but not `expo-sharing`. Explicit OS sharing requires adding the Expo-managed dependency in the corresponding source slice and rerunning the normal config/native contract at the final gate.
8. `workoutAppRuntime.tsx` owns typed route capabilities and service lifetime. More routes currently contain only history navigation. Both facts confirm a small runtime-owned portability surface and a new More subroute are the correct extension point.
9. The PR workflow already pins toolchains and demonstrates retained exact-byte artifact download/verification. It is a strong pattern for private candidate metadata and promotion but does not yet provide nightly/release/promotion workflows.

## Selected technical design

### Envelope v1

Use a strict binary container instead of a JSON file with ad-hoc fields:

```text
GTBK (4-byte magic) | version (u8) | headerLength (u32 BE) | canonical UTF-8 header | AES-256-GCM ciphertext + tag
```

The header is exact-key, canonical JSON. It includes format version, `compression: "none"`, KDF descriptor (without a password), cipher descriptor, base64 salt/nonce/tag fields when the platform API requires a detached tag, payload byte length, snapshot ID, and non-sensitive producer schema metadata. The byte range containing the header is passed unchanged as AES-GCM AAD. Both reader and writer reject noncanonical or unknown header fields, unsupported versions, length disagreement, bad base64 lengths, and algorithm/parameter drift.

The payload has a strictly versioned manifest plus allowlisted table collections. Rows are deterministically ordered by primary key, object keys are canonically ordered, numeric values use JSON values only when safe/finite, and timestamp values remain integer milliseconds or ISO strings exactly as their field contract specifies. The snapshot carries catalog references/revisions, not catalog source rows.

### Restore durability model

There are three deliberately separate points:

1. **Preflight, no write:** read bounds, header, KDF, GCM authentication, parse, schema/type/ID/reference validation, and preview are entirely outside the writer transaction.
2. **Source replacement, one write:** delete/insert only the audited user-owned table set in FK-safe order and update a singleton portability restoration state to `rebuild_pending`, all inside one `kernel.write()` operation. An injected SQL failure rolls back the complete logical source replacement.
3. **Derivative repair, retryable:** after commit, rebuild FTS and history projections/recommendations with the established write-owning repositories. Mark `ready` only after all rebuilds/consistency checks pass. If this stage fails, keep `rebuild_pending`; startup and the recovery UI retry before claiming dependent data is current.

This is stronger and more honest than either raw database replacement or an unsupported nested transaction. Tests must show that a precommit failure leaves a logical dump exactly unchanged and that a committed-but-interrupted rebuild eventually reaches the same derivative state as a clean full rebuild.

### Release chain

The candidate workflow creates both signed APK and AAB in one job from one resolved source/config commit, computes raw and relevant inner-file SHA-256 values, writes a canonical candidate manifest, runs source/native automated checks against those artifacts, and uploads a private bundle with bounded retention. The promotion workflow only downloads that bundle, validates every digest and manifest identity, requires a protected manual gate plus a physical-review record matching the candidate, and uploads the already-built files to the GitHub Release. It must have no Expo/Gradle build step.

## Ownership and table strategy

The implementation begins with an explicit, tested table manifest rather than a `sqlite_master` sweep. Each entry declares primary-key order, owner (`user`, `catalog-reference`, or `derivative`), export order, restore order, and reference validator. User-owned source includes settings/preferences; custom exercises and their user preference state; owned/copied plan/day/target/policy/schedule data; session/workout/set and outcome state; correction/void/restore ledger; and user-owned recommendation lifecycle records. Bundled catalog rows, FTS, projection rows, pending effects, caches, and migration/recovery data are excluded or rebuilt.

## Threat and failure controls

| Risk | Selected control | Required proof |
|---|---|---|
| Metadata rewrite / algorithm downgrade | Exact canonical AAD header and exact-key/version checks | Tamper every critical header field; authentication/parse rejects with no write. |
| Password guessing / KDF drift | Existing fixed Argon2id descriptor, fresh salt, no persisted secret | Known-answer and descriptor rejection tests. |
| Nonce reuse | Generate a fresh 12-byte nonce per archive; test RNG adapter and frozen fixtures | Multiple-archive test proves distinct nonce inputs; failures remain safe. |
| Archive/JSON exhaustion | Hard input/header/plaintext/row/string/depth limits before collection/restore | Boundary+one and oversized/malformed fixtures. |
| Partial restore | All parsing/validation before `kernel.write`; source delete/insert in one writer callback | Fault injection at each insert/delete proves exact pre-state remains. |
| Stale derivatives after committed restore | Same-commit `rebuild_pending` plus deterministic retry/rebuild state | Interruption, retry, and clean-install parity tests. |
| Bundled content substitution | Reference-only snapshot and local catalog reconciliation | Missing/revised catalog fixture retains identity and safely marks unavailable. |
| CSV formula injection / locale ambiguity | RFC 4180 quoting plus leading formula-character neutralization; explicit units/ISO/invariant decimal | Golden CSV fixtures in non-English locale-compatible inputs. |
| Candidate substitution / rebuild on promotion | Candidate manifest + raw/inner digests and promotion job without build tooling | Tampered artifact/manifest and no-build workflow contract tests. |

## Design review findings folded into the plan

- The app gets one `Data and recovery` entry, not scattered backup/export controls. Backup, restore, and readable CSV make their consequences clear before invoking the system picker/share sheet.
- Restore is the only destructive operation. Preview has counts, source-reference availability, and impact language; the final action requires a typed confirmation and never uses optimistic success UI.
- Password inputs have explicit label, show/hide state, confirmation mismatch copy for export, paste/keyboard support, no default persistence, and focus routing to the first invalid field. Errors say saved data was not changed and omit secrets/file content.
- The established Gmail-like surfaces remain unchanged: light neutral-grey `#F1F3F4` canvas with white `#FFFFFF` cards; dark graphite `#202124` canvas with near-black `#121212` cards. Data actions are grouped by task, not rendered as a decorative card grid.

## Implementation uncertainties resolved by proof, not assumption

- Expo Crypto adapter shape and detached/combined authentication-tag behavior are verified with a small adapter contract before archive code consumes it. The plan does not assume undocumented serialization.
- Exact persistent restore-state table/columns and table ordering are selected from a host-SQLite foreign-key fixture before writing migration `0016`.
- If an approved reference cannot be reconciled locally, restore retains immutable identity plus explicit unavailable state; it does not synthesize catalog content or discard the user’s historical snapshot.
- Physical KDF timing calibration and any device-only performance claim remain deferred. Source tests only prove the descriptor and crypto behavior, not physical timing.

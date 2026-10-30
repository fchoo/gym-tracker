# Phase 18 Implementation Patterns

**Reconciled:** 2026-10-07

## Boundary rule

Phase 18 implements the producer side of the shared Garmin contract. Phase 13 declares the interface-first domain file and owns persistence; Phase 18 must not duplicate import identity, receipts, matching, portability, or SQL.

## Closest local analogs

| New path | Role | Read first | Reuse |
|---|---|---|---|
| modules/garmin-connect/expo-module.config.json | local Expo module | modules/argon2-kdf/expo-module.config.json | module registration shape |
| modules/garmin-connect/android/build.gradle | native packaging | modules/argon2-kdf/android/build.gradle | repository CNG/Gradle conventions; add Chaquopy/ABI pins only here |
| GarminConnectModule.kt | typed Expo bridge | modules/network-classifier/android/src/main/java/expo/modules/networkclassifier/NetworkClassifierModule.kt | bounded DTO/error export and module lifecycle |
| GarminTokenStore.kt | encrypted device store | modules/argon2-kdf/android/src/main/java/expo/modules/argon2kdf/Argon2KdfModule.kt and plugins/withAndroidBackupRules.ts | native crypto/error discipline and explicit exclusions |
| src/platform/garmin/garminActivityAdapter.ts | generation-fenced adapter | src/platform/google/googleAuthAdapter.ts | injected driver, generation invalidation, safe error union |
| canonicalGarminPayload.ts | strict canonical transform | src/domains/portability/backupFormat.ts | plain JSON validation and deterministic canonicalization |
| normalizeGarminActivity.ts | pure source transform | src/domains/activities/importContracts.ts | domain units, optional presence, source fidelity |
| src/bootstrap/garminImportRuntime.tsx | shared runtime facade | src/bootstrap/workoutAppRuntime.tsx | one kernel/provider lifecycle, no route-owned database |
| Phase 18 native harness | exact artifact evidence | src/testing/phase12GoogleAuthSmoke.ts and scripts/verify-phase12-evidence.mjs | guarded route, identity-bound evidence, privacy scan |

## Module pattern

- CNG owns generated Android files; production plans modify the local module and configuration plugin, not generated android output.
- One GarminClientWorker serializes Python startup, client calls, token updates, and cancellation. Blocking native/Python work never runs on the UI thread.
- JavaScript receives discriminated plain DTOs with bounded strings/arrays/numbers. PyObject or native exception objects never escape.
- The method dispatcher is a fixed enum/switch. An operation payload cannot select a Python method or URL.
- Python is bundled at build time. There is no runtime installer, subprocess, shell, or HTTP bridge.

## Token pattern

- login/MFA inputs remain transient function arguments, never durable controller fields.
- Python dumps/loads read and write through an injected Kotlin store.
- Token rotation writes a new encrypted record, verifies it, then atomically replaces the prior record.
- A corrupt/unknown record produces sign_in_required and a classified diagnostic without dumping ciphertext.
- logout increments connection generation first, clears client/token state second, and leaves imported history untouched.

## Adapter pattern

garminActivityAdapter.ts depends on the narrow native module driver and implements GarminActivitySourcePort. It validates IDs/page bounds/options before native calls and revalidates DTOs on return. The detail request always supplies maxchart=2000 and maxpoly=4000.

Use a connection generation captured at operation start. Before normalization and before calling prepareGarminImport, compare it to the current generation. Discard mismatched work with a stale_generation outcome.

## Canonicalization pattern

canonicalGarminPayload.ts is pure and table-driven. It validates before allocating the final canonical string, sorts object keys, preserves arrays, excludes operational fields, and produces stable component/normalized hashes. Missing channels stay absent. No code path adds fit_sha256.

normalizeGarminActivity.ts maps only reviewed summary/split/detail keys. It uses metric descriptors for positional chart samples, not positional assumptions. It records source basis and sample_fidelity on each eligible fact. Elapsed, timer, and moving fields remain independent.

## Import pattern

Call the Phase 13 functions by their shared exported names:

- prepareGarminImport(envelope)
- confirmGarminImportDate(prepared, confirmation)

Do not create prepareFitImport, FitImportDraft, a file-attempt repository, or provider-specific tables. The shared commands own identity/revision/capacity/transaction/receipt behavior.

## UI/runtime pattern

- app routes contain validation/navigation only.
- screens consume controller/read-model props and never import src/platform or SQL.
- Garmin root is contextual and never a tab.
- shared Appearance state persists through login, sync, detail, and match states.
- Back dismisses MFA/logout/appearance overlays before popping the route.
- status announcements occur only on state transitions; success follows committed import results.

## Evidence pattern

Reuse the Phase 12 exact-artifact harness structure, but never record account email, account namespace, external activity IDs, raw JSON, routes, HR values, tokens, MFA code, ciphertext, or device serial. Bind evidence to source commit, dependency lock digest, APK hash/signature/package/profile, ARM64 device hash, ordered case IDs, result codes, counts, timings, and report hashes.

## Anti-patterns

- Do not define a second Garmin envelope or import command in Phase 18.
- Do not expose Python eval, URLs, method names, uploads, deletes, token bytes, or arbitrary objects.
- Do not persist password/MFA or put encrypted token data in SQLite/logical backup/Drive.
- Do not retry login, 403, or 429 in an unbounded loop.
- Do not merge activities by title/date/distance and do not claim sampled charts are exact efforts.
- Do not create a fifth root, route by raw external ID, or accept arbitrary return hrefs.
- Do not change Hermes or require a development server for the installed app.
- Do not turn MIT notices into a human decision checkpoint.

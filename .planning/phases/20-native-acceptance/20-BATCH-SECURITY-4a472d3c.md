---
phase: 20
slug: native-acceptance
status: needs_fix
audit_scope: independent-read-only-two-file-private-result-publication-source-security-continuation
exact_sha: 4a472d3c32c9264d7e6dc1ebc3b70144fd1902af
independent_source_sha: 4a472d3c32c9264d7e6dc1ebc3b70144fd1902af
base_sha: fc20301d2a81f7a8883a5346f7be7567bbaeff73
branch: agent-p20-atomic-security-4a472d3c
baseline_report: .planning/phases/20-native-acceptance/20-BATCH-SECURITY-fc20301d.md
baseline_report_sha256: 75ea505f968427eab1262e20b60acb2434dbf1e94c061e5ea6433e7cae6fcac4
changed_files: 2
source_files: 1
test_files: 1
commits_in_range: 1
threats_total: 49
baseline_threats_closed: 49
baseline_threats_open: 0
threats_closed: 48
threats_open: 1
blocking_threats_open: 1
high_threats: 48
medium_threats: 1
mitigate_dispositions: 49
mitigated_threats: 48
findings_total: 1
critical_findings: 0
high_findings: 0
medium_findings: 1
low_findings: 0
unregistered_flags: 0
warnings: 0
open_risks: 1
accepted_risks: 0
transfer_risks: 0
asvs_level: 1
block_on: high
score: null
requested_score: 100
score_scale: 100
score_status: not_awarded_due_to_verified_publication_gap
source_tracing_confidence: 9
host_proof: not_run
native_proof: not_run
native_proof_not_run: true
final_source_native_proof_pending: true
native_acceptance_pending: true
production_ready: false
release_authorized: false
created: 2026-10-23
---

# Phase 20 — Two-file Source Security Continuation at 4a472d3c

## Conclusion

**NEEDS FIX — one source-verified Medium/P2 publication finding, confidence 9/10.** The change correctly stages JSON in the same app-private nonce directory and refuses an already consumed, staged or final result. However, the pinned Expo **57.0.7** API makes `File.move()` asynchronous, and the new helper discards its promise. Its Android implementation also permits a copy/delete fallback when native move attempts fail. Consequently, this is not an established fail-closed, completed atomic publication operation. The requested **49/49 closure and 100/100 score cannot honestly be awarded**.

The baseline records 49 CLOSED / zero OPEN. This continuation carries forward 48 unaffected authored mitigations and withholds closure of **T-20-02-02** at the changed result-publication boundary. All 49 authored dispositions remain `mitigate`; no risk is accepted or transferred. The affected authored threat is classified High in the register, so its incomplete mitigation is a source-closure blocker under the unchanged `block_on: high` policy. **That is not a claim of a High-severity vulnerability: the concrete new finding is Medium/P2, and no authentication bypass, malicious exploit or forged final PASS was demonstrated.**

**Independent host proof: NOT_RUN. Native proof: NOT_RUN.** Parent-provided host and emulator observations below remain distinct from this source review and from fresh final-source, same-Samsung native acceptance. Production readiness and release authority remain false. No numerical score is fabricated for incomplete closure; `score: null` explicitly means the requested 100 was not awarded.

## Exact target and scope

- Reused worktree: `/Users/bytedance/Documents/personal/gym_tracker/.trae/worktrees/p20-final5-security`.
- Independently verified branch: `agent-p20-atomic-security-4a472d3c`.
- Independently verified HEAD/target: `4a472d3c32c9264d7e6dc1ebc3b70144fd1902af`.
- Independently verified ancestor/base: `fc20301d2a81f7a8883a5346f7be7567bbaeff73`.
- Complete delta: **one commit, two files, +36 / -3**: `src/testing/v12NativeRollbackBridge.ts` and `src/testing/v12NativeRollbackBridge.test.ts`. Both checkout files match the target Git blobs byte-for-byte; tracked checkout changes against the target were absent.
- Loaded the preserved baseline report, root `AGENTS.md`, project integrity rules, unchanged security policy and authored threat rows. This is **not a repeat of the nine-commit batch audit**. Only the changed collector/tests and connected filesystem/route/host consumer needed for publication analysis were retraced.
- The installed dependency reports version 57.0.7, matching `package-lock.json:5133-5136`. Its existing JS declarations and Android sources were read, not imported, installed, executed or rebuilt. This is dependency-source evidence, not binary/runtime attestation.

**Only this report was authored.** No source/test edit, test or coverage execution, application import, ADB/device command, build/prebuild, install, credential/provider operation, branch switch, new worktree, dependency installation, commit, push, fetch, sync, cleanup or additional reviewer dispatch was performed. Existing reports, dependency links and host artifacts were left intact. Queue/quiet time was not treated as a failure; no active assignment was duplicated or restarted.

## F1 — `File.move()` does not supply the claimed completed, atomic-only publication

**[P2 / Medium] (confidence: 9/10) `src/testing/v12NativeRollbackBridge.ts:219-223` — result publication detaches an asynchronous relocation which can fall back to copying into the host-polled final path.**

Verbatim motivating source:

```ts
function publishResult(value: unknown): void {
  // The host polls only result.json. Same-directory rename exposes complete bytes,
  // never the empty/partial file created by Expo's synchronous write operation.
  stagedResult.write(JSON.stringify(value));
  stagedResult.move(resultFile);
}
```

### A. Publication completion and its errors are not owned by the collector

The actual pinned declaration is not a synchronous rename:

```ts
// node_modules/expo-file-system/build/internal/NativeFileSystem.types.d.ts:190
move(destination: PublicDirectory | PublicFile, options?: RelocationOptions): Promise<void>;
```

The matching source declaration is `src/internal/NativeFileSystem.types.ts:250`; `moveSync(...): void` is separately declared at `255`. Android confirms that these are different operations:

```kt
// node_modules/expo-file-system/android/src/main/java/expo/modules/filesystem/FileSystemModule.kt:213-220
AsyncFunction("move") Coroutine { file: FileSystemFile, destination: FileSystemPath, options: RelocationOptions? ->
  file.move(destination, options ?: RelocationOptions())
}

Function("moveSync") { file: FileSystemFile, destination: FileSystemPath, options: RelocationOptions? ->
  runBlocking {
    file.move(destination, options ?: RelocationOptions())
  }
}
```

`FileSystemPath.kt:174-186` dispatches the relocation through `withContext(Dispatchers.IO)` and updates the URI afterward. The helper neither returns nor awaits that promise. Both success (`v12NativeRollbackBridge.ts:236`) and sanitized failure (`239`) use this helper. A later relocation rejection therefore cannot enter the collector's synchronous `try/catch`, cannot be reduced to its fixed-code failure envelope, and is not covered by the route's catch of the **collector** promise. The collector can resolve and the route can display `Recovery archive verified` (`app/__v12-recovery-archive.tsx:11-14`) without waiting for successful final-file publication. An asynchronous native exception is left outside the intended sanitized-failure handling; no actual exception log or private-path disclosure was observed in this read-only audit.

The host does **not** convert that premature UI success into final acceptance: it still waits for `result.json` and independently validates the envelope, arm, archive and runtime. This limits the demonstrated consequence to incomplete operational result/failure publication and misleading route completion, not forged accepted evidence.

### B. Same-directory placement does not remove the API's copy fallback

The Android local strategy attempts rename first, but deliberately falls back:

```kt
// node_modules/expo-file-system/android/src/main/java/expo/modules/filesystem/fsops/CopyMoveStrategy.kt:37-45
open suspend fun moveTo(spec: DestinationSpec): Uri {
  val resolved = spec.resolve(file)
  return tryNativeMove(resolved) ?: run {
    resolved.receiveFrom(file).also {
      if (!file.deleteRecursively()) {
        throw UnableToMoveException("Failed to delete source after move")
      }
    }
  }
}
```

`LocalFile.tryNativeMove` at `96-114` tries `file.renameTo(resolved.target)`, then NIO move on API 26+ and returns null if those attempts fail. `DestinationSink.kt:50-55` copies local file bytes to the final destination on fallback; `NioUtilities.kt:20-21` uses `Files.copy(..., REPLACE_EXISTING)`. Thus the selected API is **not rename-or-fail**. Under that failure path, it can create/write `result.json` before copy completion, reopening the specific in-progress-final-file visibility gap this commit claims to eliminate.

Verbatim unchanged host consumer, `scripts/v12-native-rollback-bridge.mjs:110-111`:

```js
const fetched = adb(["exec-out", "run-as", PACKAGE, "sh", "-c", `test -f ${remote}/result.json && cat ${remote}/result.json`], undefined, true);
if (fetched.status === 0) { resultBytes = Buffer.from(fetched.stdout); break; }
```

A successful read of an empty/partial fallback destination ends polling; parsing/validation then fails closed instead of waiting for complete bytes. Native rename failure/copy fallback was **not induced or observed** here. The supported claim is that the actual selected implementation allows this path, not that it occurs on every ordinary same-directory move.

### Recommended repair boundary — not implemented

Use a pinned, same-directory **rename-or-fail** primitive whose completion and errors are owned by the collector. In this SDK's supported Android API 26+ branch, synchronous `File.rename("result.json")` is a candidate: `FileSystemModule.kt:223-224` registers a synchronous `Function("rename")`; `FileSystemPath.kt:189-208` validates a single child name and canonical parent containment, then calls `Path.moveTo` without opting into overwrite. Confirm the supported platform boundary and preserve the existing nonce/no-clobber/privacy guards. Merely adding `await` to `File.move()` addresses error ownership but does **not** remove its copy fallback; merely choosing `moveSync` has the same atomic-only limitation.

No source change or test run is authorized by this report. The eventual focused repair verification should cover publication completion/rejection and the chosen primitive's fail-closed behavior, not repeat unaffected aggregate or native suites.

## What the two-file delta preserves

- **App-private, same-directory paths:** `v12NativeRollbackBridge.ts:212-217` first checks exact devtest/profile/hooks/suite and scalar 32-hex nonce, then derives both result paths from `Paths.document` and the same fixed `v12-rollback-${nonce}` segment. No caller-supplied path, traversal segment, SAF/content URI, public storage location or production database path is introduced. `Paths.ts:24-25` resolves the document directory; Android `FileSystemModule.kt:24-25,38-39` binds it to persistent files, and `expo-modules-core/.../services/AppDirectoriesService.kt:19-20` returns `context.filesDir`.
- **Old-state refusal:** verbatim `218`: `if (consumed.exists || resultFile.exists || stagedResult.exists) fail("arm_invalid");`. Existing consumed/final state and the new staged state are refused before arm parsing or native work. This is an important new guard, not permission to overwrite old nonces. The dependency's default relocation option is `overwrite: false` (`fsops/DestinationSpec.kt:12-15`), and it rejects a destination already present when resolving it (`CopyMoveStrategy.kt:88-90`). These checks are not claimed to be an OS-level exclusive no-clobber rename across arbitrary concurrent writers.
- **Staged write sequencing:** `222` serializes and synchronously writes the staging file before requesting relocation. Android `FileSystemFile.kt:76-84` creates/writes the string using an output stream inside `use`. This prevents the ordinary write from creating the final result directly, but does not fix the two relocation gaps in F1. There is no new fsync/power-loss durability guarantee.
- **Envelopes and sanitization policy:** success retains schema version 1, exact producer, validated arm and inspection (`236`); failure retains those identifiers and the existing fixed-code filter (`238-240`). Both use the same helper/final destination. No source rows, raw credential/provider data or arbitrary caught exception text was added to JSON. The detached relocation error path is the limitation, not a proven private payload leak.
- **Expiry, archive and real execution:** exact arm validation, bounded expiry and post-execution revalidation remain at `46-58,225,232`. Archive hash verification, genuine production ports, production authenticated restore, exclusive writer and committed/reopened facts remain unchanged at `103-207,228-235`. No crypto/parser/schema/hash/lease relaxation, canned callback replacement or timeout extension appears in this delta.
- **Host/final authority:** the host bridge is byte-identical to the base. Its 180-second deadline, exact envelope/arm binding, archive checks, final source/device/APK/lease revalidation and exclusive operational writes remain at `79,109-140`. Final native acceptance and immutable RunRoot publication are not granted by the app route or this report. Auth/source/crypto/final-verdict controls were not bypassed by F1.
- **Baseline one-shot limitation:** the unchanged `armFile.move(consumed)` at `226` also uses this SDK's asynchronous API. The baseline's description of that call as synchronous is not substantiated by the pinned dependency. This adjacent observation is not counted as a second new two-file finding or used to reopen unrelated batch source. Do not rely on that baseline wording as proof of synchronous arm consumption.

## Tests and parent observations — not independently executed

The complete changed test file was read. New cases `v12NativeRollbackBridge.test.ts:234-255` simulate an empty staging write while asserting the final file remains absent, then verify the sanitized failure result; `256-259` refuse an existing stage. Existing success/replay/final-state, invalid identity, native-binding sanitization, archive/hash/error and expiry cases remain at `221-232,260-290`. **These are useful host orchestration checks, not real native filesystem proof.**

Their `MockFile.move` at `28` is synchronous, immediately mutates a map, and does not return a promise or implement copy fallback. Accordingly, those cases do not invalidate F1 or establish the actual SDK relocation semantics. No fixture callback result is claimed as installed native cryptography or archive restoration.

| Parent-provided observation | Reported result | Interpretation in this continuation |
|---|---|---|
| Full bridge unit scope | 36 cases, zero skips; critical statements/branches/functions/lines all exactly 100% | Not rerun; host mocks do not prove relocation API completion or atomic-only behavior. |
| Type/boundary scope | Type check and 475 boundary cases passed | Not rerun; discarding a `Promise<void>` is type-valid and does not establish error ownership. |
| Actual emulator Garmin diagnostic | `runtimeInfo` + disconnected state + fixed-JSON native probe PASS; no credentials/provider calls | Parent-reported actual native diagnostic, not a fixture claim; not independently inspected/executed here. Garmin source is unchanged in this two-file delta. |
| Actual emulator tab portraits | Eight portrait combinations, widths 360/390, Light/Dark, font scale 100/200; glyph checks passed | Parent-reported visual observations, not Samsung acceptance; tab source is unchanged in this two-file delta. |

Scopes are not added into a fabricated aggregate. Emulator observations do not establish this changed collector's final-source rollback publication, same-Samsung acceptance, production readiness or release authority. This report leaves `native_proof: not_run` for its independent scope without relabelling the parent's actual emulator observations as mocks.

## Threat continuation ledger — no full batch repeat

All twelve `20-01-PLAN.md` through `20-12-PLAN.md` files are byte-identical across base, target and checkout. Their 49 unique threat rows were reconciled: **48 High + one Medium; 49 `mitigate`, zero `accept`, zero `transfer`.** The authored register and security policy were not edited.

| Authored group | Total | Target CLOSED | Target OPEN |
|---|---:|---:|---:|
| T-20-01-* | 4 | 4 | 0 |
| T-20-02-* | 4 | 3 | 1 |
| T-20-03-* | 4 | 4 | 0 |
| T-20-04-* | 4 | 4 | 0 |
| T-20-05-* | 4 | 4 | 0 |
| T-20-06-* | 4 | 4 | 0 |
| T-20-07-* | 4 | 4 | 0 |
| T-20-08-* | 4 | 4 | 0 |
| T-20-09-* | 4 | 4 | 0 |
| T-20-10-* | 4 | 4 | 0 |
| T-20-11-* | 4 | 4 | 0 |
| T-20-12-* | 5 | 5 | 0 |
| **Total** | **49** | **48** | **1** |

**Reopened/closure withheld:** `T-20-02-02`, High, `20-02-PLAN.md:141`, disposition `mitigate`: “Exact receipt/source digests across cuts, reopen and retry.” F1 leaves the changed nonce-owned result publication incompletely mitigated. This is the one open risk and one register-level blocker; it does not imply that underlying SQLite commits, cryptographic authentication, canonical digests or final-validator rejection were defeated.

The other 48 rows are **baseline continuations**, not newly executed native proofs or independently repeated full-batch audits. F1 is registered here against the existing threat, so unregistered flags remain zero. There are zero additional warnings, accepted risks or transferred risks. Native acceptance remains an evidence prerequisite, not an accepted risk and not a passed gate.

## Fingerprints and preservation

| Member | SHA-256 |
|---|---|
| Preserved `20-BATCH-SECURITY-fc20301d.md` | `75ea505f968427eab1262e20b60acb2434dbf1e94c061e5ea6433e7cae6fcac4` |
| Target `src/testing/v12NativeRollbackBridge.ts` | `616100084998067137a468c26872c8b58fd9d0d1a27dc2a673b183b1c7271859` |
| Target `src/testing/v12NativeRollbackBridge.test.ts` | `5dd68e0a3bfe9e79e6924cdc31e6c95270896d3f3ee221f745c232d68e45fdec` |
| Unchanged host `scripts/v12-native-rollback-bridge.mjs` | `efcc7ddacb34df91aea776aabf5894927edb9ec6b9efc49cbfc9e97d00516792` |
| Unchanged route `app/__v12-recovery-archive.tsx` | `f17a053a60410c3895ccec00c03ccf3a6ecfe60903207e632b9c9626c58a9fac` |
| Unchanged `.planning/config.json` | `5344a78b2dd7ac536837086f8b1e06e38fc4efe83841408b06847ce01dc74714` |
| Unchanged `package-lock.json` | `e6df2dc920024237819a77b4718e5199952a7b86a97e7a27d6a0cc2d4c78c75b` |

Before report creation, 38 existing Phase 20 Markdown files were fingerprinted by sorted relative path/content hash/size/mode/inode/nanosecond mtime. Their snapshot SHA-256 was `34544f19b1bd5331a0518a11517446be5639273cf19a7ed9f5bb5739bf67113a`. The report destination did not exist; no historical report was overwritten, normalized, deleted or rebound.

**AI-assisted review limitation:** This bounded source continuation can miss subtle vulnerabilities. It is not a professional ASVS certification, penetration test, runtime/binary guarantee, broad batch re-audit, native acceptance result or release authorization. ASVS Level 1 / High blocking policy is retained; a 100/100 closure score is deliberately not claimed while F1 remains unresolved.

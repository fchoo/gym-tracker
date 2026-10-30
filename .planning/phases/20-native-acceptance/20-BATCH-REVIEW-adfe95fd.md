---
exact_sha: adfe95fd9b4f79d7b2b206c086e1693232cc9637
base: cf8cb9927672d77356cbf43982ea8b3042454fcb
branch: agent-p20-publish-final-review-adfe95fd
status: clean
findings: 0
issues_found: 0
critical: 0
warnings: 0
informational: 0
score: 100
score_scale: 100
source_only: true
scope: targeted four-file one-shot publication boundary and error-path closure, read-only source review
prior_batch_review: 20-BATCH-REVIEW-cf8cb992.md
prior_warning_status: closed_by_source_control_flow
native_status: pending
native_rollback_status: pending
final_same_samsung_acceptance_status: pending
review_worktree: /Users/bytedance/Documents/personal/gym_tracker/.trae/worktrees/p20-final5-review
reviewed_at_utc: 2026-10-23T11:23:01Z
pre_report_worktree_status_counts: { tracked_modified: 1, untracked: 20, total: 21 }
expected_post_report_worktree_status_counts: { tracked_modified: 1, untracked: 21, total: 22 }
---

# Phase 20 — Targeted publication-boundary closure, adfe95fd

**Pre-Landing Review: No issues found. 0 Critical, 0 Warning, 0 Informational. Source-only score: 100/100.** The previous report's R1 post-move publication retry is closed by the pinned source. Native rollback and fresh final-source same-Samsung acceptance remain **pending**; this is not a Phase 20 acceptance PASS.

## Exact scope and isolation

Read root `AGENTS.md`, applicable project rules, the complete gstack review checklist, and `20-BATCH-REVIEW-cf8cb992.md`, including its warning and marker-existence consumer at lines 44-115. Reviewed the complete actual **`cf8cb9927672d77356cbf43982ea8b3042454fcb..adfe95fd9b4f79d7b2b206c086e1693232cc9637`** diff: **one commit, four modified files, 35 insertions, eight deletions**.

| Pinned changed file | Insertions | Deletions |
| --- | ---: | ---: |
| `scripts/v12-native-rollback-bridge.mjs` | 1 | 1 |
| `scripts/v12-native-rollback-bridge.test.mjs` | 1 | 1 |
| `src/testing/v12NativeRollbackBridge.test.ts` | 23 | 2 |
| `src/testing/v12NativeRollbackBridge.ts` | 10 | 4 |

The reused checkout's HEAD is exactly `adfe95fd9b4f79d7b2b206c086e1693232cc9637` and its branch is `agent-p20-publish-final-review-adfe95fd`. All four working source/test files plus `package.json` and `package-lock.json` match their pinned Git blobs byte-for-byte. The dirty checkout contains preserved report metadata and the existing dependency entry; source-review cleanliness is not working-tree cleanliness.

Applied both checklist passes to the publication boundary. Bounded supporting reads: the direct route's Promise/error consumer, the complete two changed test files, and installed Expo FileSystem move/write implementations. No full 27-file batch, Garmin subsystem, tab subsystem, older aggregate gate or unrelated milestone audit was repeated.

**No source edit, test/coverage run, ADB/device command, build/install, dependency mutation, branch switch, worktree creation, fetch/sync, commit or push was performed. This report is the sole authored filesystem write.** No additional reviewer was spawned and no queued/quiet worker was duplicated, replaced or restarted. Queue time was not treated as execution failure.

## Prior R1 closure — verified source evidence

### One chosen envelope; one publication attempt — confidence: 10/10

`src/testing/v12NativeRollbackBridge.ts:229-249` separates operation completion from publication. The operation `try/catch` chooses either the success envelope (`240`) or the sanitized operation-failure envelope (`242-243`); it does not publish. The only invocation of the publisher is after that catch:

```ts
// src/testing/v12NativeRollbackBridge.ts:240-249
  publication = { schema_version: 1, producer: "v12-native-rollback-bridge/v1", arm, inspection: result.inspection };
} catch (error) {
  operationFailure = error instanceof Error && /^v12_rollback_[a-z_]+$/u.test(error.message) ? error.message : "v12_rollback_failed";
  publication = { schema_version: 1, producer: "v12-native-rollback-bridge/v1", arm, failure: operationFailure };
}
// Publication errors cannot enter the operation-failure path and rewrite a
// moved result object after the readiness barrier became externally visible.
try { await publishResult(publication); }
catch { throw new Error("v12_rollback_result_publication_failed"); }
if (operationFailure !== undefined) throw new Error(operationFailure);
```

Thus a staged write, awaited move, or readiness-write rejection terminates through the fixed publication error; none can re-enter the operation catch or call the publisher again. An operation failure is rethrown as its sanitized code only after its single publication settles successfully. On publication failure the publication error takes precedence without rewriting the selected result or retrying the moved Expo File.

The previously identified native aliasing premise remains real: installed `expo-file-system/src/internal/NativeFileSystem.types.ts:248-250` documents URI mutation and Promise-returning move; Android `FileSystemPath.kt:180-186` awaits `file.moveTo(...)` then executes `uri = finalUri`. Android `FileSystemFile.kt:79-84` creates an absent file before writing its content. The corrective control flow does not assume those effects are atomic, roll back on failure, or leave the File URI unchanged.

### Complete result before a content-gated barrier — confidence: 10/10

The publisher still closes its staged synchronous write before awaiting native move/copy completion, then writes the readiness token:

```ts
// src/testing/v12NativeRollbackBridge.ts:223-225
stagedResult.write(JSON.stringify(value));
await stagedResult.move(resultFile);
resultReady.write("ready");
```

At `scripts/v12-native-rollback-bridge.mjs:110`, the actual host command now includes:

```sh
test -f ${remote}/result.ready && test "$(cat ${remote}/result.ready)" = ready && test -f ${remote}/result.json && cat ${remote}/result.json
```

An absent, empty, or incomplete token no longer permits the final result read. Once the token is readable as `ready`, the awaited result move has completed and the collector contains no later result write or publication retry. Even if readiness writing throws after making the complete token visible, the already-published payload remains unchanged. This closes R1's specific host-read versus post-move rewrite race; it is not a claim that Expo generic move is an atomic-only rename, or that shell command substitution compares arbitrary marker files byte-for-byte including trailing newlines.

### Fixed-code failures and existing identity guards — confidence: 10/10

The new publication error matches the existing fixed-code pattern. The direct route consumes collector rejection generically and renders only `Recovery archive failed` (`app/__v12-recovery-archive.tsx:11-15`); it does not expose native error text or retry. Host result shape/producer/arm validation, fixed failure-code validation, archive equality/hash checks, canonical inspection and final runtime/lease revalidation are unchanged (`scripts/v12-native-rollback-bridge.mjs:115-135`). Host failure retention remains the nonce-bound exclusive `failure.json` write (`138-141`). The one-shot consumed/final/staged/readiness entry guard remains unchanged (`v12NativeRollbackBridge.ts:214-219`).

No credentials, crypto implementations, authoritative SQLite source facts, expiry checks, lease/schema contracts, device/APK identity bindings or acceptance verdict protocols were changed in this range.

## Tests inspected; execution attribution and limits

Read the changed tests; **executed none**.

- `MockFile.move` now updates its path after the move (`src/testing/v12NativeRollbackBridge.test.ts:20,28`), matching the native File's URI mutation relevant to R1.
- **"never retries or rewrites a published result if readiness creation fails"** (`283-303`) creates an empty readiness marker and throws private error text. Its assertions require `v12_rollback_result_publication_failed`, exactly one result write, byte-equal final content before/after readiness failure, and the retained empty marker (`299-302`).
- The existing asynchronous-copy case (`256-282`) still defers move completion, verifies no readiness while final copying is incomplete, and verifies complete failure JSON plus `ready` after settlement.
- The host readiness test (`scripts/v12-native-rollback-bridge.test.mjs:79-93`) now asserts the content-gated command and models a not-ready poll before the complete result. It is a command-shape/mock transport test, not an executed Android shell test.

**Evidence qualification, confidence: 10/10:** the new readiness-failure test explicitly forces an *operation failure* before publication:

```ts
// src/testing/v12NativeRollbackBridge.test.ts:285
jest.spyOn(cryptoModule, "createExpoAesGcmArchiveDriver").mockImplementation(() => { throw new Error("v12_rollback_synthetic_failure"); });
```

Accordingly, it proves the new failure-envelope publication/error behavior and the stated new-code one-write assertions. It does **not independently replay the old success-envelope retry path**: on the base revision, this forced operation failure already enters the operation catch before publishing, so a marker exception exits that catch rather than causing a second publication. The parent's reported RED/GREEN result is retained as supplied, not represented here as independently observed double-write reproduction. R1 closure on *both* selected envelopes is established by the single shared publisher call and disjoint catch boundary quoted above. This is a limitation of regression-evidence attribution, not an identified remaining defect in the pinned source.

| Parent-supplied completed check | Supplied result | Review boundary |
| --- | --- | --- |
| Complete affected Jest helper scope | 39 passing; critical statements, branches, functions and lines exactly 100% | Not rerun |
| Complete affected Node scope | 72 passing across three critical modules; all four metrics exactly 100% | Not rerun |
| Types / boundaries | 475 passing | Not rerun |
| Readiness-create-then-error regression | RED on original and GREEN on corrective code; final bytes unchanged and one write on corrective code | Parent-supplied execution; branch qualification above |
| Preserved native tab observations | Eight portrait configurations: 360/390 × Light/Dark × F100/F200, PASS | Prior scoped evidence, not same-Samsung acceptance |
| Preserved real Garmin runtime probe | Credential-free three-stage Chaquopy/CPython runtime probe, PASS | Prior diagnostic, not provider/MFA/persistence or same-Samsung acceptance |

Garmin and tab source bytes are outside and unchanged by this four-file correction. Their earlier scoped reviews/observations are retained without repetition or invalidation. None of the supplied host/native diagnostic results is promoted to fresh final-source Samsung rollback evidence or final acceptance.

## Outcome and preservation

**Source closure: 100/100, clean, 0 Critical / 0 Warning / 0 Informational on this exact four-file range.** Prior report R1 is closed by source control flow. This report authorizes no live action and cannot close native rollback or final same-Samsung acceptance. A fresh final-source build and the parent's exclusive same-device acceptance remain pending.

The **20 pre-existing review Markdown files**, including modified `20-REVIEW.md` and all three earlier batch reports, were preserved. Their pre-report sorted `filename + NUL + content-SHA256 + newline` manifest SHA-256 is `ef671815353cb5c2f99b03257d7c5225dd74d5981c7ac1e0b5a21794dd1881a3`. Only `20-BATCH-REVIEW-adfe95fd.md` was authored; older 95-point and failed/pending reports retain their historical verdicts.

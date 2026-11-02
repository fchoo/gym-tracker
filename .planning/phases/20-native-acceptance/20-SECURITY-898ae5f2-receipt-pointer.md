---
phase: 20
slug: native-acceptance
status: verified
exact_sha: 898ae5f2cacca08f3457af1d66d3c573c09cd68c
independent_source_sha: 898ae5f2cacca08f3457af1d66d3c573c09cd68c
base_sha: 56a0219d03648c02a14b86e9664d5c3f58ec1f07
audit_scope: final-targeted-read-only-source-continuation
threats_total: 49
threats_closed: 49
threats_open: 0
blocking_threats_open: 0
unregistered_flags: 0
accepted_risks: 0
transfer_risks: 0
asvs_level: 1
block_on: high
score: 100
native_proof: not_run
native_acceptance_pending: true
independent_completion: 2026-10-21T23:57:02.610Z
---

> Parent preservation of the completed independent auditor output. The historical test-status section remains as returned; the later Linux aggregate result is separately source-bound in the host receipt. No native or release authorization is claimed.

## SECURED

**Phase:** 20 — Native Acceptance  
**Exact audited SHA:** `898ae5f2cacca08f3457af1d66d3c573c09cd68c`  
**Delta audited:** `56a0219d03648c02a14b86e9664d5c3f58ec1f07..898ae5f2cacca08f3457af1d66d3c573c09cd68c`  
**Worktree:** `/Users/bytedance/Documents/personal/gym_tracker/.trae/worktrees/p20-final5-security`  
**Branch verified:** `agent-p20-final6-security`  
**ASVS Level:** 1  
**Block threshold:** `high`  
**Score:** 100  
**Role constraint:** read-only source audit only; I did not write `/Users/bytedance/Documents/personal/gym_tracker/.trae/worktrees/p20-final5-security/.planning/phases/20-native-acceptance/20-SECURITY.md`.

### Status

Source-security remains **SECURED** for the targeted final-source delta.

The exact delta modifies only:

- `/Users/bytedance/Documents/personal/gym_tracker/.trae/worktrees/p20-final5-security/scripts/v12-atomic-shard-publication.mjs`
- `/Users/bytedance/Documents/personal/gym_tracker/.trae/worktrees/p20-final5-security/scripts/v12-atomic-shard-publication.test.mjs`

No implementation write, dependency install, native/device command, commit, push, new worktree, or broad audit/test run was performed by this auditor.

### Threat Counts

| Metric | Count |
|---|---:|
| Registered threats | 49 |
| Closed | 49 |
| Blocking open, severity >= `high` | 0 |
| Non-blocking open below threshold | 0 |
| Accepted risks | 0 |
| Transfer risks | 0 |
| Unregistered flags | 0 |
| `threats_open` | 0 |

### Targeted Control Verification

| Control area | Status | Evidence |
|---|---|---|
| Linux birth identity avoids `/bin/ps` second-collision | CLOSED | `/Users/bytedance/Documents/personal/gym_tracker/.trae/worktrees/p20-final5-security/scripts/v12-atomic-shard-publication.mjs:144-153` hashes `linux-procfs-v1:{boot_id}:{pid}:{startTicks}` from `/proc/sys/kernel/random/boot_id` and `/proc/{pid}/stat`. |
| Non-Linux owner fingerprint binds PID plus legacy birth hash | CLOSED | `/Users/bytedance/Documents/personal/gym_tracker/.trae/worktrees/p20-final5-security/scripts/v12-atomic-shard-publication.mjs:157-163` wraps legacy ps birth hash as `ps-pid-v1:{pid}:{legacyHash}`. |
| Legacy live claims remain accepted when old hash matches | CLOSED | `/Users/bytedance/Documents/personal/gym_tracker/.trae/worktrees/p20-final5-security/scripts/v12-atomic-shard-publication.mjs:166-171` falls back to the legacy observed hash for existing claims. |
| Unknown legacy probe fails closed | CLOSED | `/Users/bytedance/Documents/personal/gym_tracker/.trae/worktrees/p20-final5-security/scripts/v12-atomic-shard-publication.mjs:168-171` treats `observed === null` or `legacyObserved === null` as live conflict, not stale takeover. |
| Missing precise Linux probe cannot downgrade/delete live precise claim | CLOSED | `/Users/bytedance/Documents/personal/gym_tracker/.trae/worktrees/p20-final5-security/scripts/v12-atomic-shard-publication.mjs:157-161` returns `null` on Linux precise probe loss rather than deriving a mismatching legacy owner identity; `/Users/bytedance/Documents/personal/gym_tracker/.trae/worktrees/p20-final5-security/scripts/v12-atomic-shard-publication.mjs:168-169` preserves unknown live claims. |
| `process.kill(pid, 0)` is liveness-only | CLOSED | `/Users/bytedance/Documents/personal/gym_tracker/.trae/worktrees/p20-final5-security/scripts/v12-atomic-shard-publication.mjs:129-132` uses only signal `0`; grep found no numeric signal fallback or `SIG*` kill path in the changed implementation. |
| Owner nonce and claim schema | CLOSED | `/Users/bytedance/Documents/personal/gym_tracker/.trae/worktrees/p20-final5-security/scripts/v12-atomic-shard-publication.mjs:174-190` requires schema version 2, run ID, shard, safe PID, 64-hex birth hash, and 32-hex nonce. |
| Write-once claim and output protection | CLOSED | Claim uses `flag: "wx"` at `/Users/bytedance/Documents/personal/gym_tracker/.trae/worktrees/p20-final5-security/scripts/v12-atomic-shard-publication.mjs:194`; failure and staged artifacts use `flag: "wx"` at lines `307` and `494`; manifest uses `flag: "wx"` at line `515`. |
| fsync durability | CLOSED | File and directory fsync helpers at `/Users/bytedance/Documents/personal/gym_tracker/.trae/worktrees/p20-final5-security/scripts/v12-atomic-shard-publication.mjs:85-95`; claims fsync at `195`, failures at `308`, target directory at `378`, publication directory at `405`, staging at `516`. |
| Symlink and path rejection | CLOSED | Ancestor and tree symlink checks at `/Users/bytedance/Documents/personal/gym_tracker/.trae/worktrees/p20-final5-security/scripts/v12-atomic-shard-publication.mjs:47-67`, `116-126`, `320-330`, `442-451`. |
| Privacy rejection | CLOSED | Artifact privacy validator remains invoked for failure receipts, member bytes, staged writes, and manifests at `/Users/bytedance/Documents/personal/gym_tracker/.trae/worktrees/p20-final5-security/scripts/v12-atomic-shard-publication.mjs:306`, `362`, `493`, `514`. |
| Transactional publishing / manifest last | CLOSED | Members are validated and hard-linked before final manifest publication at `/Users/bytedance/Documents/personal/gym_tracker/.trae/worktrees/p20-final5-security/scripts/v12-atomic-shard-publication.mjs:388-408`; existing residue recovery validates staged residue before cleanup at `411-440`; publish entrypoint preserves existing final manifests at `456-529`. |

### Threat Verification

| Threat ID | Category | Severity | Disposition | Evidence |
|---|---|---:|---|---|
| T-20-01-01 | Tampering | high | mitigate | CLOSED — exact delta only changes atomic shard publisher ownership/recovery; source registries not modified. |
| T-20-01-02 | Spoofing | high | mitigate | CLOSED — run/build identity continuity preserved; publication identity validation remains at `/Users/bytedance/Documents/personal/gym_tracker/.trae/worktrees/p20-final5-security/scripts/v12-atomic-shard-publication.mjs:260-279`; owner birth identity strengthened at `144-171`. |
| T-20-01-03 | Elevation of Privilege | high | mitigate | CLOSED — publisher still emits manifests/failures only; no producer-authored release authority added in delta. |
| T-20-01-04 | Information Disclosure | high | mitigate | CLOSED — privacy validator still gates failures, member bytes, writes, and manifest at lines `306`, `362`, `493`, `514`. |
| T-20-02-01 | Tampering | high | mitigate | CLOSED — migration/restore/merge source files not modified by exact delta. |
| T-20-02-02 | Repudiation | high | mitigate | CLOSED — commit/replay source files not modified by exact delta. |
| T-20-02-03 | Spoofing | high | mitigate | CLOSED — native case-set source files not modified by exact delta. |
| T-20-02-04 | Information Disclosure | high | mitigate | CLOSED — result payload privacy guard remains in publisher at lines `306`, `362`, `493`, `514`; no raw payload output added. |
| T-20-03-01 | Tampering | high | mitigate | CLOSED — Garmin receipt source files not modified by exact delta. |
| T-20-03-02 | Spoofing | high | mitigate | CLOSED — provider/match identity source files not modified by exact delta. |
| T-20-03-03 | Tampering | high | mitigate | CLOSED — Calendar trace source files not modified by exact delta. |
| T-20-03-04 | Information Disclosure | high | mitigate | CLOSED — Garmin/trace artifact source files not modified; publisher privacy scan remains intact. |
| T-20-04-01 | Tampering | high | mitigate | CLOSED — flow/state mapping source files not modified by exact delta. |
| T-20-04-02 | Spoofing | high | mitigate | CLOSED — device configuration measurement source files not modified by exact delta. |
| T-20-04-03 | Repudiation | high | mitigate | CLOSED — accepted-exception source files not modified by exact delta. |
| T-20-04-04 | Information Disclosure | high | mitigate | CLOSED — screenshot/semantic source files not modified; publisher privacy scan remains intact. |
| T-20-05-01 | Spoofing | high | mitigate | CLOSED — marker/build identity source files not modified except publisher identity validation remains at lines `260-279`. |
| T-20-05-02 | Tampering | high | mitigate | CLOSED — samples/thresholds source files not modified by exact delta. |
| T-20-05-03 | Repudiation | high | mitigate | CLOSED — cold/failure sample source files not modified by exact delta. |
| T-20-05-04 | Denial of Service | medium | mitigate | CLOSED — maximum-fixture runtime source files not modified by exact delta; non-blocking threshold would not count if open, but it is not source-invalidated. |
| T-20-06-01 | Spoofing | high | mitigate | CLOSED — build/run identity validation remains at `/Users/bytedance/Documents/personal/gym_tracker/.trae/worktrees/p20-final5-security/scripts/v12-atomic-shard-publication.mjs:260-279`; exact delta did not weaken it. |
| T-20-06-02 | Tampering | high | mitigate | CLOSED — final evidence publisher is strengthened: safe ancestry/symlink checks at `47-67`, write-once claims at `184-218`, no-clobber member promotion at `366-380`, manifest-last completion at `388-408`, residue recovery at `411-440`. |
| T-20-06-03 | Repudiation | high | mitigate | CLOSED — accepted-exception metadata source files not modified by exact delta. |
| T-20-06-04 | Information Disclosure | high | mitigate | CLOSED — failure receipts store bounded code plus digest only at `/Users/bytedance/Documents/personal/gym_tracker/.trae/worktrees/p20-final5-security/scripts/v12-atomic-shard-publication.mjs:221-257`; privacy scan at `306`, `362`, `493`, `514`. |
| T-20-07-01 | Elevation of Privilege | high | mitigate | CLOSED — attended-record schema/source files not modified; no release authority added. |
| T-20-07-02 | Spoofing | high | mitigate | CLOSED — Samsung/APK identity source files not modified by exact delta. |
| T-20-07-03 | Repudiation | high | mitigate | CLOSED — readiness/exceptions source files not modified by exact delta. |
| T-20-07-04 | Tampering | high | mitigate | CLOSED — rollback source files not modified by exact delta. |
| T-20-08-01 | Spoofing | high | mitigate | CLOSED — terminal/preflight status source files not modified by exact delta. |
| T-20-08-02 | Tampering | high | mitigate | CLOSED — frozen source/build source files not modified by exact delta. |
| T-20-08-03 | Spoofing | high | mitigate | CLOSED — retained/installed APK checks not modified by exact delta. |
| T-20-08-04 | Information Disclosure | high | mitigate | CLOSED — build manifest privacy remains bounded; no raw serial/private path output added. |
| T-20-09-01 | Tampering | high | mitigate | CLOSED — migration/portability implementation not modified by exact delta. |
| T-20-09-02 | Repudiation | high | mitigate | CLOSED — lifecycle/replay implementation not modified by exact delta. |
| T-20-09-03 | Spoofing | high | mitigate | CLOSED — artifact/case identity continuity preserved; publisher owner identity strengthened at lines `144-171`, claim validation at `174-190`. |
| T-20-09-04 | Information Disclosure | high | mitigate | CLOSED — publisher failure/output privacy remains bounded at lines `221-257`, `306`, `362`, `493`, `514`. |
| T-20-10-01 | Tampering | high | mitigate | CLOSED — Garmin JSON/receipt implementation not modified by exact delta. |
| T-20-10-02 | Spoofing | high | mitigate | CLOSED — Garmin provider/match implementation not modified by exact delta. |
| T-20-10-03 | Tampering | high | mitigate | CLOSED — Calendar trace implementation not modified by exact delta. |
| T-20-10-04 | Information Disclosure | high | mitigate | CLOSED — Garmin artifact implementation not modified; publisher privacy scan remains intact. |
| T-20-11-01 | Tampering | high | mitigate | CLOSED — flow/report identity implementation not modified by exact delta. |
| T-20-11-02 | Spoofing | high | mitigate | CLOSED — configuration/comparison implementation not modified by exact delta. |
| T-20-11-03 | Repudiation | high | mitigate | CLOSED — performance sample implementation not modified by exact delta. |
| T-20-11-04 | Information Disclosure | high | mitigate | CLOSED — screenshot/trace implementation not modified; publisher privacy scan remains intact. |
| T-20-12-01 | Spoofing | high | mitigate | CLOSED — final verdict remains derived from final artifacts; publisher no-clobber, manifest-last, and residue validation remain at `/Users/bytedance/Documents/personal/gym_tracker/.trae/worktrees/p20-final5-security/scripts/v12-atomic-shard-publication.mjs:366-408` and `411-440`. |
| T-20-12-02 | Elevation of Privilege | high | mitigate | CLOSED — Samsung observation schema/source files not modified; no automated verdict or release authority path added. |
| T-20-12-03 | Information Disclosure | high | mitigate | CLOSED — attended/final artifacts remain privacy-gated at `/Users/bytedance/Documents/personal/gym_tracker/.trae/worktrees/p20-final5-security/scripts/v12-atomic-shard-publication.mjs:306`, `362`, `493`, `514`; failure receipts retain digest-only raw error at `243-257`. |
| T-20-12-04 | Repudiation | high | mitigate | CLOSED — accepted exception/readiness implementation not modified by exact delta. |
| T-20-12-05 | Tampering | high | mitigate | CLOSED — rollback implementation not modified by exact delta. |

### Test Evidence Status

I did **not** run tests in this read-only security continuation.

Parent-retained proof, not native evidence and not re-produced by this auditor:

- Deterministic red coverage for the legacy and precise-probe failure cases was reported before the fix.
- Atomic publisher contract suite was reported as 21 Linux / Mac 0 skip.
- Full parent contract suite was reported as 208 passing.
- Atomic coverage was reported as 100% across all four metrics.
- Later CLI SIGKILL was reported as kernel OOM at 2 GiB VM; parent test VM now 4 GiB, separate from product performance/default budgets.
- Fresh final Node 17 gate was parent-running at handoff; this report does not claim its result.

### Unregistered Flags

None.

`20-04-SUMMARY.md` declares no runtime endpoint, authentication path, filesystem trust boundary, or production schema surface. This final delta adds no endpoint, auth path, production transport, Garmin transport path, raw-private-data output, or release-authority path.

### Risks / Native Pending

- **Native proof:** pending; not claimed.
- **Device evidence:** pending; not claimed.
- **Release authority:** none. This source-security verdict does not authorize release.
- **Open risks:** none found in the targeted source-security delta.

**threats_open:** 0


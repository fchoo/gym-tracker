---
phase: 20
slug: native-acceptance
status: verified
exact_sha: 3550e7f3f76059d2b430ecb2e63f4093383f23ed
threats_total: 49
threats_closed: 49
threats_open: 0
unregistered_flags: 0
accepted_risks: 0
asvs_level: 1
block_on: high
created: 2026-10-21
native_acceptance_pending: true
---

# Phase 20 — Security

Independent source-security verification is **SECURED: 49/49**, with zero open threats, unregistered flags, or accepted risks. This is an ASVS L1 mitigation-presence gate, not native acceptance, attended approval, or release authorization.

## Trust Boundaries

| Boundary | Required control |
|---|---|
| Source facts, archives and receipts | Authoritative SQLite, immutable identity/revisions, exclusive commits and replay-safe receipts |
| Native tools and observations | Exact source/build/APK/device/configuration identity, bounded observations, no producer-authored verdicts |
| Visual, gesture and performance inputs | Retained/hash-checked artifacts, measured intermediate behavior and raw fixed-budget samples |
| Host process cleanup and coverage | Stable Linux process handles, unsupported-platform fail-closed behavior, retained ownership, exact coverage and zero skipped tests |
| Attended observations and release readiness | Observation-only authority, explicit final seal, separate exceptions and compatible recovery boundary |

## Threat Register

All dispositions are `mitigate`. The original twelve plans contain 48 high-severity and one medium-severity registered threats. The independent audit verified each closure at `a32278c7`, then confirmed at `3550e7f3` that the only changed files are the four host-coverage guard/test files. No application runtime, plan, summary, or registered mitigation implementation changed in that continuation.

| Threat ID | Category | Component | Severity | Disposition | Mitigation evidence | Status |
|---|---|---|---|---|---|---|
| T-20-01-01 | Tampering | source vocabulary | high | mitigate | `scripts/v12-evidence-contract.mjs:65-80,213-255` | closed |
| T-20-01-02 | Spoofing | live identity | high | mitigate | `scripts/create-v12-run-manifest.mjs:27-36,92-115,167-174,208-229` | closed |
| T-20-01-03 | Elevation of Privilege | verdict authority | high | mitigate | `scripts/v12-evidence-contract.mjs:144-169,213-246` | closed |
| T-20-01-04 | Information Disclosure | identity artifacts | high | mitigate | `scripts/create-v12-run-manifest.mjs:98-115` | closed |
| T-20-02-01 | Tampering | SQLite/recovery | high | mitigate | `scripts/v12-sqlite-shard.mjs:43-106,149-174`; `scripts/v12-recovery-shard.mjs:133-185` | closed |
| T-20-02-02 | Repudiation | durable replay | high | mitigate | `scripts/v12-recovery-shard.mjs:63-76,111-185` | closed |
| T-20-02-03 | Spoofing | ordered cases | high | mitigate | `scripts/v12-sqlite-shard.mjs:20-26,43-60,94-106` | closed |
| T-20-02-04 | Information Disclosure | storage reports | high | mitigate | `scripts/v12-sqlite-shard.mjs:30-39,94-111` | closed |
| T-20-03-01 | Tampering | Garmin observations | high | mitigate | `scripts/v12-garmin-shard.mjs:39-55,100-110` | closed |
| T-20-03-02 | Spoofing | provider/match identity | high | mitigate | `scripts/v12-garmin-shard.mjs:39-55,58-81` | closed |
| T-20-03-03 | Tampering | Calendar receipts | high | mitigate | `scripts/v12-calendar-shard.mjs:57-98,180-195` | closed |
| T-20-03-04 | Information Disclosure | Garmin/Calendar artifacts | high | mitigate | `scripts/v12-garmin-shard.mjs:13-14,58-64`; `scripts/v12-calendar-shard.mjs:136-142` | closed |
| T-20-04-01 | Tampering | visual registry | high | mitigate | `scripts/capture-v12-visual.mjs:126-129,166-178,309-349` | closed |
| T-20-04-02 | Spoofing | measured configuration | high | mitigate | `scripts/capture-v12-visual.mjs:77-118,243-255` | closed |
| T-20-04-03 | Repudiation | exceptions | high | mitigate | `scripts/verify-v12-native-evidence.mjs:548-562,609-630` | closed |
| T-20-04-04 | Information Disclosure | visual fixtures | high | mitigate | `scripts/capture-v12-visual.mjs:158-178,250-255` | closed |
| T-20-05-01 | Spoofing | benchmark identity | high | mitigate | `scripts/benchmark-v12-interactions.mjs:50-81,359-373` | closed |
| T-20-05-02 | Tampering | fixed budgets | high | mitigate | `scripts/v12-performance-shard.mjs:57-100,148-178,193-201` | closed |
| T-20-05-03 | Repudiation | raw samples | high | mitigate | `scripts/v12-performance-shard.mjs:148-178,193-228` | closed |
| T-20-05-04 | Denial of Service | bounded workload | medium | mitigate | `scripts/v12-performance-shard.mjs:24-36,64-100,148-178` | closed |
| T-20-06-01 | Spoofing | final live identity | high | mitigate | `scripts/verify-v12-native-evidence.mjs:501-520` | closed |
| T-20-06-02 | Tampering | sole final validator | high | mitigate | `scripts/verify-v12-native-evidence.mjs:463-489,523-545,658-686` | closed |
| T-20-06-03 | Repudiation | exception metadata | high | mitigate | `scripts/verify-v12-native-evidence.mjs:548-562,609-630` | closed |
| T-20-06-04 | Information Disclosure | final privacy | high | mitigate | `scripts/verify-v12-native-evidence.mjs:491-497,531-539,589-592` | closed |
| T-20-07-01 | Elevation of Privilege | attended authority | high | mitigate | `scripts/generate-v12-attended-checklist.mjs:9,23-25` | closed |
| T-20-07-02 | Spoofing | Samsung observations | high | mitigate | `scripts/generate-v12-attended-checklist.mjs:19-25` | closed |
| T-20-07-03 | Repudiation | readiness | high | mitigate | `scripts/create-v12-readiness-handoff.mjs:25-67,109-144,150-188` | closed |
| T-20-07-04 | Tampering | rollback | high | mitigate | `scripts/v12-rollback-evidence.mjs:190-255` | closed |
| T-20-08-01 | Spoofing | predecessor authority | high | mitigate | `scripts/validate-v12-prebuild-predecessors.mjs:90,105-152` | closed |
| T-20-08-02 | Tampering | build claims | high | mitigate | `scripts/build-current-native-test-apk.sh:26-67,96-120,150-173,318-322` | closed |
| T-20-08-03 | Spoofing | installed bytes | high | mitigate | `scripts/build-current-native-test-apk.sh:389-425,453-477` | closed |
| T-20-08-04 | Information Disclosure | build identity | high | mitigate | `scripts/create-v12-run-manifest.mjs:36-39,98-115` | closed |
| T-20-09-01 | Tampering | real SQLite observations | high | mitigate | `scripts/v12-sqlite-shard.mjs:94-106,159-174,200-210` | closed |
| T-20-09-02 | Repudiation | process-death cuts | high | mitigate | `scripts/v12-recovery-shard.mjs:133-185,216-230` | closed |
| T-20-09-03 | Spoofing | shard source identity | high | mitigate | `scripts/v12-sqlite-shard.mjs:192-210`; `scripts/v12-recovery-shard.mjs:234-254` | closed |
| T-20-09-04 | Information Disclosure | native storage artifacts | high | mitigate | `scripts/v12-sqlite-shard.mjs:30-39`; `scripts/v12-sqlite-producer-contract.mjs:28-37,95-110` | closed |
| T-20-10-01 | Tampering | Garmin JSON/receipts | high | mitigate | `scripts/v12-garmin-shard.mjs:58-110,124-147` | closed |
| T-20-10-02 | Spoofing | explicit candidate | high | mitigate | `scripts/v12-garmin-shard.mjs:39-55,124-147` | closed |
| T-20-10-03 | Tampering | intermediate Calendar | high | mitigate | `scripts/v12-calendar-shard.mjs:57-98,180-195,205-226` | closed |
| T-20-10-04 | Information Disclosure | account/gesture artifacts | high | mitigate | `scripts/v12-garmin-shard.mjs:13-14,58-64`; `scripts/v12-calendar-shard.mjs:136-142` | closed |
| T-20-11-01 | Tampering | exact flow mapping | high | mitigate | `scripts/capture-v12-visual.mjs:77-118,166-178,309-349` | closed |
| T-20-11-02 | Spoofing | native comparison | high | mitigate | `scripts/capture-v12-visual.mjs:77-118,243-255`; `scripts/compare-v12-visual.mjs:65-90` | closed |
| T-20-11-03 | Repudiation | performance claims | high | mitigate | `scripts/v12-performance-shard.mjs:57-100,148-178,193-228` | closed |
| T-20-11-04 | Information Disclosure | screenshots/traces | high | mitigate | `scripts/capture-v12-visual.mjs:158-178,250-255`; `scripts/verify-v12-native-evidence.mjs:491-497,531-539` | closed |
| T-20-12-01 | Spoofing | final seal | high | mitigate | `scripts/verify-v12-native-evidence.mjs:589-655,658-686` | closed |
| T-20-12-02 | Elevation of Privilege | human observation | high | mitigate | `scripts/generate-v12-attended-checklist.mjs:9,23-25`; `scripts/verify-v12-native-evidence.mjs:573-586,604-630` | closed |
| T-20-12-03 | Information Disclosure | attended/final artifacts | high | mitigate | `scripts/generate-v12-attended-checklist.mjs:9,19-25`; `scripts/verify-v12-native-evidence.mjs:485-497,573-586` | closed |
| T-20-12-04 | Repudiation | separate exceptions | high | mitigate | `scripts/verify-v12-native-evidence.mjs:548-570,609-655`; `scripts/create-v12-readiness-handoff.mjs:52-67,109-144` | closed |
| T-20-12-05 | Tampering | compatible recovery | high | mitigate | `scripts/v12-rollback-evidence.mjs:190-255`; `scripts/create-v12-readiness-handoff.mjs:15,72-84` | closed |

## Final-Source Continuation

- `scripts/v12-linux-pidfd-signal.py:77-117` acquires all stable handles, validates every candidate before any signal, signals only through pidfds, and closes descriptors on every exit.
- `scripts/v12-posix-process-tree.mjs:151-190` fails closed on unsupported POSIX platforms without a numeric PID/PGID fallback. Supervisors retain unresolved ownership/lease markers.
- `scripts/run-phase20-pidfd-coverage.py:108` now requires `not result.skipped` before emitting a passing report.
- `scripts/run-coverage-gate.mjs:571-582` requires zero skips/failures/errors, positive safe-integer test counts and exact coverage counters.
- The real CLI regression in `scripts/run-coverage-gate.test.mjs:226-274` rejects passing-looking skipped evidence before project execution. `scripts/test_v12_linux_pidfd_signal.py:274-302` rejects a skipped Python result despite exact 100% metrics.
- Fresh affected gates: Node 6/6, Python 10/10, zero skips; Python helper statements 96/96, branches 42/42, functions 5/5 and lines 96/96.

## Accepted Risks Log

No accepted risks. No authority transfer or requirement override was used.

## Security Audit Trail

| Date | Exact SHA | Total | Closed | Open | Scope |
|---|---|---:|---:|---:|---|
| 2026-10-21 | a32278c7c82bafbebc0e9245fa714c4017328daf | 49 | 49 | 0 | Independent authored-register audit plus stable-handle source delta |
| 2026-10-21 | 3550e7f3f76059d2b430ecb2e63f4093383f23ed | 49 | 49 | 0 | Independent final-SHA continuation of the four coverage guard/test files; registered runtime mitigations unchanged |

## Sign-Off

- [x] All 49 threats have an implemented mitigation disposition.
- [x] No accepted risks or unregistered summary flags remain.
- [x] `threats_open: 0` confirmed on the exact final implementation SHA.
- [x] `status: verified` set.
- [ ] Native acceptance and attended observation remain separate pending gates.

**Approval:** source-security verified 2026-10-21. No native PASS or release authorization is claimed.

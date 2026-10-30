---
phase: 15
slug: workout-parity
status: verified
register_authored_at_plan_time: true
threats_total: 55
threats_closed: 55
threats_open: 0
accepted_risks: 5
asvs_level: 1
block_on: high
created: 2026-10-11
---

# Phase 15 — Security

Phase 15 was audited against the threat models in all 13 plans. All mitigation dispositions have implementation or executable-test evidence. Five low-severity risks already carried an `accept` disposition in the owner-approved plan-time register; they are documented below with the Phase 20 native follow-up that remains pending.

## Trust Boundaries

| Boundary | Description | Data crossing |
|---|---|---|
| Workout UI → runtime commands | Drafts and user intent cross into revisioned capabilities only on explicit Save/confirm | Set facts, plan preferences, outcome commands |
| Runtime → SQLite exclusive writer | Mutations are acknowledged only after the authoritative transaction and readback complete | Revisions, canonical request hashes, receipts |
| Portability archive → local source | Restore/merge treats archive rows and identifiers as untrusted | Plans, sessions, receipt graphs, immutable history |
| Evidence JSON → retained artifacts | Metadata is untrusted until traversal-safe byte hashing and raw-report binding pass | Screenshots, semantic/focus traces, reports, receipts |
| Runtime → device adapters | Notifications, audio, and haptics are projections without mutation authority | Rest deadlines and bounded status events |

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation / evidence | Status |
|---|---|---|---|---|---|---|
| T-15-01-01 | Tampering | Selected occurrence start | high | mitigate | Full identity/revision envelope and plan-switch integration proof | closed |
| T-15-01-02 | Elevation of privilege | Facts-only presenter | high | mitigate | Command-free presentation props and structural boundary tests | closed |
| T-15-01-03 | Spoofing | Active identity/recovery | medium | mitigate | Exact-session authoritative reload and retry tests | closed |
| T-15-01-04 | Information disclosure | Tests/evidence | low | accept | Synthetic fixtures, opaque IDs, and no raw-payload logging | accepted |
| T-15-02-01 | Repudiation | TIM-01 decision | high | mitigate | Pinned owner record and fail-closed evidence validation | closed |
| T-15-02-02 | Tampering | Legacy timing storage | critical | mitigate | Non-destructive portability/history retention and digest tests | closed |
| T-15-02-03 | Spoofing | Hidden cue callbacks | high | mitigate | Active timing APIs/cues removed; structural retirement tests | closed |
| T-15-02-04 | Denial of service | Between-set rest | high | mitigate | Independent rest lifecycle, notification, and recovery suites | closed |
| T-15-03-01 | Tampering | Day preview | high | mitigate | Exact occurrence identity and zero-write preview tests | closed |
| T-15-03-02 | Spoofing | Loading/error root | medium | mitigate | Trusted-read gate and source-backed retry states | closed |
| T-15-03-03 | Elevation of privilege | Running context | medium | mitigate | Navigation-only callbacks with no recording capability | closed |
| T-15-03-04 | Denial of service | Large text/keyboard | low | accept | Responsive/focus host tests; final native matrix remains Phase 20 | accepted |
| T-15-04-01 | Tampering | Metric draft | high | mitigate | Strict profile schemas, canonical conversion, revision fencing | closed |
| T-15-04-02 | Spoofing | Save feedback | high | mitigate | Explicit Save and committed/readback-only success states | closed |
| T-15-04-03 | Elevation of privilege | Facts row | medium | mitigate | Facts row exposes only the open-editor capability | closed |
| T-15-04-04 | Denial of service | Editor keyboard/large text | low | accept | Keyboard-safe sheet and host 200% contracts; native proof in Phase 20 | accepted |
| T-15-05-01 | Tampering | Complete-set envelope | critical | mitigate | Revision/idempotency/hash/rollback/replay integration tests | closed |
| T-15-05-02 | Spoofing | Saving/completed UI | high | mitigate | No success before committed result and reload | closed |
| T-15-05-03 | Denial of service | Duplicate activation | medium | mitigate | Synchronous busy latch and stable replay envelope | closed |
| T-15-05-04 | Tampering | Warm-up progress/rest | high | mitigate | Separate command paths and integration exclusions | closed |
| T-15-06-01 | Tampering | Preference write | high | mitigate | Strict values, plan revision checks, bound SQL, serialized writer | closed |
| T-15-06-02 | Tampering | Restore/merge remap | critical | mitigate | Complete schema-36 closure, FK ordering, request-ID collision remap, result rewrite | closed |
| T-15-06-03 | Spoofing | Optimistic saved state | medium | mitigate | Authoritative post-commit readback and saved/draft distinction | closed |
| T-15-06-04 | Information disclosure | Preference evidence | low | accept | Bounded cases and hashes; no personal rows or SQL parameters | accepted |
| T-15-06-05 | Tampering | Exercise-rest replay | high | mitigate | Stable request hash, immutable receipt, revision and identity fences | closed |
| T-15-06-06 | Tampering | Rest fallback precedence | high | mitigate | Exercise override before plan default; ineligible/final exclusions | closed |
| T-15-07-01 | Tampering | Rest commands | high | mitigate | Exact deltas, durable bounds, revisioned lifecycle tests | closed |
| T-15-07-02 | Spoofing | OS notification | medium | mitigate | Stable session/revision/deadline reconciliation | closed |
| T-15-07-03 | Denial of service | Cue/permission failure | medium | mitigate | Device adapter failure remains non-authoritative | closed |
| T-15-07-04 | Tampering | Plan settings | high | mitigate | Field-scoped Save, authoritative conflict retry and readback | closed |
| T-15-07-05 | Tampering | Exercise-rest retry | high | mitigate | Stable receipt identity and reload on stale/unknown results | closed |
| T-15-07-06 | Tampering | Rest fallback display | high | mitigate | Persisted deadline/duration and active-rest invariance tests | closed |
| T-15-08-01 | Tampering | Edit/reorder envelopes | high | mitigate | Exact identities, revisions, hashes, receipts, rollback/replay | closed |
| T-15-08-02 | Tampering | Protected history | critical | mitigate | Retained disposition and canonical history digest assertions | closed |
| T-15-08-03 | Spoofing | Committed-refresh failure | high | mitigate | Saved-but-reload-failed state prevents uncertain reissue | closed |
| T-15-08-04 | Denial of service | Drag/accessibility | low | accept | Cancel endpoints and Move up/down fallback; native proof in Phase 20 | accepted |
| T-15-09-01 | Spoofing | Trend projection | high | mitigate | Compatible metric grouping and factual empty state | closed |
| T-15-09-02 | Elevation of privilege | Menu actions | medium | mitigate | Exact bounded menu and independent semantic targets | closed |
| T-15-09-03 | Tampering | Editor navigation | high | mitigate | Stable owner-plan identity and post-outcome transition guard | closed |
| T-15-10-01 | Tampering | Outcome commands | critical | mitigate | Exact tokens/revisions, exclusive transaction, rollback/replay tests | closed |
| T-15-10-02 | Spoofing | Completion summary | high | mitigate | Durable detail first and factual retry/empty states | closed |
| T-15-10-03 | Tampering | Plan write-back | critical | mitigate | Canonical rows, one-use token, source recheck, atomic apply | closed |
| T-15-10-04 | Repudiation | Default-No decision | medium | mitigate | Explicit Keep/Save and receipt-bound outcome | closed |
| T-15-11-01 | Spoofing | Artifact identity | high | mitigate | HEAD/APK/device binding plus traversal/symlink-safe byte hashing | closed |
| T-15-11-02 | Tampering | Visual derivation | high | mitigate | Pinned source and native/overlay/difference digest chains | closed |
| T-15-11-03 | Information disclosure | Evidence | high | mitigate | Recursive privacy allowlist and mutation tests | closed |
| T-15-11-04 | Repudiation | TIM-01 evidence | high | mitigate | Exact owner record and compatibility=false validation | closed |
| T-15-12-01 | Spoofing | Fixture/native journey | high | mitigate | Production routes, exact ledger IDs, source digests | closed |
| T-15-12-02 | Tampering | Visual artifacts | high | mitigate | Pinned inputs and chained artifact hashes | closed |
| T-15-12-03 | Denial of service | Device configuration | medium | mitigate | Per-case cleanup and guaranteed final restoration contract | closed |
| T-15-12-04 | Information disclosure | Reports/screenshots | high | mitigate | Synthetic facts and recursive privacy verifier | closed |
| T-15-13-01 | Spoofing | Performance measurement | high | mitigate | Raw samples, rendered markers, thresholds, identity binding | closed |
| T-15-13-02 | Tampering | Final evidence set | high | mitigate | Canonical ledger and fail-closed current-artifact verifier | closed |
| T-15-13-03 | Information disclosure | Final artifacts | high | mitigate | Synthetic fixtures and aggregate/hash-only diagnostics | closed |
| T-15-13-04 | Denial of service | Device state | medium | mitigate | Preflight and guaranteed theme/text/orientation/permission restoration | closed |

## Accepted Risks Log

These are existing low-severity `accept` dispositions from the approved Phase 15 plans, documented here so they do not silently resurface. None bypasses the Phase 20 final native acceptance gate.

| Risk ID | Threat Ref | Rationale | Accepted by | Documented |
|---|---|---|---|---|
| AR-15-01 | T-15-01-04 | Synthetic, privacy-safe fixtures and opaque identifiers bound evidence exposure to non-personal data. | Owner-approved Phase 15 plan-time register | 2026-10-11 |
| AR-15-02 | T-15-03-04 | Host responsive/focus contracts mitigate availability risk; physical 200%/keyboard proof remains mandatory in Phase 20. | Owner-approved Phase 15 plan-time register | 2026-10-11 |
| AR-15-03 | T-15-04-04 | Keyboard-safe editor semantics are host-tested; native IME/large-text proof remains mandatory in Phase 20. | Owner-approved Phase 15 plan-time register | 2026-10-11 |
| AR-15-04 | T-15-06-04 | Preference evidence is limited to bounded cases and hashes with no source rows or sensitive parameters. | Owner-approved Phase 15 plan-time register | 2026-10-11 |
| AR-15-05 | T-15-08-04 | Accessible reorder alternatives exist; native drag/cancel geometry remains mandatory in Phase 20. | Owner-approved Phase 15 plan-time register | 2026-10-11 |

## Security Audit Trail

| Audit date | Threats total | Mitigated | Accepted | Blocking open | Run by |
|---|---:|---:|---:|---:|---|
| 2026-10-11 | 55 | 50 | 5 | 0 | GSD security auditor + orchestrator reconciliation |

## Sign-Off

- [x] All threats have a disposition.
- [x] All 50 mitigations have implementation or executable-test evidence.
- [x] Five owner-approved low risks are documented with Phase 20 follow-ups.
- [x] `threats_open: 0` confirmed at the configured `high` threshold.
- [x] No native execution is claimed before Phase 20.

**Approval:** verified 2026-10-11

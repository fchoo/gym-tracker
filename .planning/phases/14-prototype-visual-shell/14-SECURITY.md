---
phase: 14-prototype-visual-shell
status: verified
threats_total: 45
threats_open: 0
asvs_level: 1
block_on: high
created: 2026-10-09
audited: 2026-10-09
---

# Phase 14 — Security

> ASVS L1 verification of every plan-time threat mitigation. All blocking and non-blocking threats are closed.

## Trust Boundaries

| Boundary | Description | Data crossing |
|---|---|---|
| Source → generated Android artifact | A clean source digest is packaged into a development-test APK and compared with retained and installed bytes. | Source digest, APK digest, package/profile, hashed device identity |
| Native runtime → retained evidence | Maestro observations are converted into fixed, allowlisted artifacts and canonical evidence records. | Bounded semantics, geometry, focus traces, screenshots, hashes |
| UI → SQLite and preference authorities | UI actions request mutations but do not acknowledge success before authoritative commit/readback. | Typed commands, revisions, bounded outcomes |
| File/share provider → portability controllers | Platform handles and passwords remain behind controller/facade boundaries. | Opaque handles, bounded state, cleanup acknowledgements |
| Navigation/input → overlays and routes | Touch, keyboard, D-pad, Back, Escape, and accessibility actions change presentation only. | Route state, focus origins, dismissal state |

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation evidence | Status |
|---|---|---|---|---|---|---|
| T-14-01 (14-01) | Tampering | Font source | high | mitigate | `src/testing/phase14FontProof.ts`, `src/testing/phase14FontProof.test.ts`, retained font manifest | closed |
| T-14-02 (14-01) | Spoofing | Font proof identity | high | mitigate | `scripts/run-phase14-font-proof.mjs`, exact source/APK hashes | closed |
| T-14-03 (14-01) | Information Disclosure | Font observations | medium | mitigate | Fixed proof strings and bounded numeric observations only | closed |
| T-14-SC (14-01) | Tampering | Dependency restore | high | mitigate | Pinned `package-lock.json`, Node 24.19.0/npm 11.17.0 | closed |
| T-14-04 (14-02) | Spoofing | Font proof | high | mitigate | Manifest/source/APK/package/device/report hash checks | closed |
| T-14-05 (14-02) | Tampering | Font oracle verdict | high | mitigate | Source-owned metrics, tolerance, raw observations, overlay hashes | closed |
| T-14-06 (14-02) | Information Disclosure | Native artifacts | medium | mitigate | `scripts/build-current-native-test-apk.sh` redacts font-proof `device.serial` and `installed_apk.device_path`; hashed identities retained; producer contract in `scripts/phase14-font-proof.test.mjs` | closed |
| T-14-SC (14-02) | Tampering | Dependency restore | high | mitigate | Pinned lockfile/toolchain; no proof-plan package drift | closed |
| T-14-07 (14-02) | Tampering | Appearance persistence | medium | mitigate | Serialized readback and failed-write rollback in `appearancePreferenceStore.ts` | closed |
| T-14-08 (14-02) | Information Disclosure | Root failure state | medium | mitigate | Bounded categories/copy in `RootFailureState.tsx`; no raw errors | closed |
| T-14-08 (14-03) | Tampering | Cross-root exit | medium | mitigate | Safe dismissal/Back handlers and retained screen state | closed |
| T-14-09 (14-03) | Denial of Service | Focus/navigation graph | medium | mitigate | Stable trigger/fallback focus in `rootFocus.ts` and shell tests | closed |
| T-14-10 (14-03) | Spoofing | Selected tab state | low | accept | Accepted risk AR-14-01; Expo Router remains sole selection authority | closed |
| T-14-11 (14-04) | Tampering | Sheet dismissal | high | mitigate | Busy/dismissal gates in `BottomSheet.tsx` | closed |
| T-14-12 (14-04) | Spoofing | Success feedback | high | mitigate | Authoritative restore stages and post-read toast ordering | closed |
| T-14-13 (14-04) | Denial of Service | Confirmation actions | medium | mitigate | Shared busy latch disables confirm, cancel, alternate, Back, and scrim | closed |
| T-14-14 (14-04) | Information Disclosure | Toast content | medium | mitigate | Bounded semantic-toast payload contract | closed |
| T-14-15 (14-05) | Tampering | Sheet actions | high | mitigate | Shared confirmation frame plus consumer regressions | closed |
| T-14-16 (14-05) | Repudiation | Completion command | high | mitigate | One-shot source command and authoritative completion result | closed |
| T-14-17 (14-05) | Denial of Service | Keyboard/IME sheets | medium | mitigate | Focus trap, Back/Escape, IME clearance, 200% text tests | closed |
| T-14-18 (14-06) | Tampering | Rest preferences | medium | mitigate | Serialized writes/readback and rollback on failure | closed |
| T-14-19 (14-06) | Spoofing | Settings status | medium | mitigate | Runtime-authoritative loading/saved/error states | closed |
| T-14-20 (14-06) | Denial of Service | Settings navigation | low | accept | Accepted risk AR-14-02; failures remain local and recoverable | closed |
| T-14-21 (14-07) | Tampering | Restore command | high | mitigate | Revision-bound one-shot restore command | closed |
| T-14-22 (14-07) | Spoofing | Restore status | high | mitigate | Command/runtime/list-reload stages and truthful retry labels | closed |
| T-14-23 (14-07) | Repudiation | Removed history | high | mitigate | Immutable history lifecycle command and source revision | closed |
| T-14-24 (14-08) | Tampering | Restore/merge/delete | high | mitigate | Exact confirmations, reviewed tokens, duplicate-submit latches | closed |
| T-14-25 (14-08) | Information Disclosure | Backup/CSV UI and evidence | high | mitigate | Controllers retain opaque handles only; user paths/passwords/tokens/account IDs are excluded. Fixed source-owned artifact locators are prefix/suffix allowlisted, traversal-checked, byte-hashed, and recursively privacy-validated. | closed |
| T-14-26 (14-08) | Spoofing | Backup/rebuild status | high | mitigate | Typed precommit, rebuild-pending, and ready states | closed |
| T-14-27 (14-08) | Denial of Service | File/share operations | medium | mitigate | Cancellation, generation fencing, handle disposal, bounded retry | closed |
| T-14-28 (14-08) | Elevation of Privilege | Google connection | medium | mitigate | OAuth credentials/scopes remain in platform facade | closed |
| T-14-29 (14-09) | Spoofing | Native evidence identity | high | mitigate | Package/profile/source/APK/device binding | closed |
| T-14-30 (14-09) | Tampering | Evidence ledger | high | mitigate | One-to-one 13-ID ledger and fail-closed verifier | closed |
| T-14-31 (14-09) | Information Disclosure | Evidence payloads | high | mitigate | Recursive privacy validator and negative tests | closed |
| T-14-32 (14-09) | Elevation of Privilege | Development fixtures | high | mitigate | Dev-test package/profile isolation and fixture gates | closed |
| T-14-33 (14-10) | Spoofing | Retained native run | high | mitigate | Source/APK/installed/device identity checks | closed |
| T-14-34 (14-10) | Information Disclosure | Native captures | high | mitigate | Fixed fixture-only captures and recursive secret/path rejection | closed |
| T-14-35 (14-10) | Tampering | Recovery evidence | high | mitigate | Source-state hashes and no-write fixtures | closed |
| T-14-36 (14-10) | Repudiation | Visual acceptance | medium | mitigate | Reviewed font overlay and hash-bound matrix evidence | closed |
| T-14-SC (14-10) | Tampering | Dependency restore | high | mitigate | Pinned lockfile/toolchain retained | closed |
| T-14-37 (14-11) | Tampering | DEV-02 roles | medium | mitigate | Exact `#9B470B` title and `#D97820` sport-role checks | closed |
| T-14-38 (14-11) | Spoofing | DEV-02 approval | medium | mitigate | Owner decision and native blended-fill evidence required | closed |
| T-14-39 (14-12) | Tampering | Library sheet state | medium | mitigate | Draft/query/filter/selection state preserved in component tests | closed |
| T-14-40 (14-12) | Spoofing | Completion consequence | high | mitigate | Exact consequence copy and authoritative source command | closed |
| T-14-41 (14-12) | Denial of Service | Completion busy state | medium | mitigate | Busy/failure/focus-return regressions | closed |

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---|---|---|---|---|
| AR-14-01 | T-14-10 (14-03) | Expo Router remains the sole selected-tab authority and role/state assertions cover the presentation boundary. Residual impact is presentation-only, as explicitly accepted in the converged plan threat model. | Milestone owner via approved Phase 14 plan | 2026-10-09 |
| AR-14-02 | T-14-20 (14-06) | Settings route failures remain local and recoverable; exact callbacks and stable focus fallbacks are component- and native-tested. This low-severity residual risk is explicitly accepted in the converged plan threat model. | Milestone owner via approved Phase 14 plan | 2026-10-09 |

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|---|---:|---:|---:|---|
| 2026-10-09 | 45 | 41 | 4 | TRAE security auditor, initial ASVS L1 audit |
| 2026-10-09 | 45 | 45 | 0 | TRAE security auditor, remediation re-audit |

## Sign-Off

- [x] All threats have a disposition.
- [x] Accepted risks are documented.
- [x] `threats_open: 0` is independently verified.
- [x] No unregistered executor threat flags remain.
- [x] `status: verified` is set.

**Approval:** verified 2026-10-09


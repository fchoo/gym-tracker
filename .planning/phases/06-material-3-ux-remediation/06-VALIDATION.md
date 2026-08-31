---
phase: 6
slug: material-3-ux-remediation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-31
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|---|---|
| **Framework** | Jest 29.7.0, Jest Expo, React Native Testing Library 14.0.1, host SQLite integration tests, Maestro 2.8.0 |
| **Config file** | `jest.config.js`; existing `unit`, `components`, `sqlite-host`, and `integration` projects |
| **Quick run command** | `npm run test:components -- --runInBand` for UI; `npm run test:sqlite:host -- --runInBand` for Progress storage |
| **Full suite command** | `npm run test:all -- --runInBand` |
| **Estimated runtime** | Focused tests under 30 seconds; full suite and native flows may take several minutes |
| **Native tooling** | Maestro `2.8.0`; ADB `37.0.1` at `/opt/homebrew/share/android-commandlinetools/platform-tools/adb` |

---

## Sampling Rate

- **After every task commit:** Run the focused Jest project/file and `npm run typecheck`.
- **After every plan wave:** Run `npm run test:all -- --runInBand`, `npm run lint`, and `npm run check:boundaries`.
- **Before `/gsd-verify-work`:** Full suite, clean CNG/build, Phase 6 native flow, and exact installed-APK identity checks must be green.
- **Max feedback latency:** 30 seconds for focused tests; longer native/build gates run only at wave or phase boundaries.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---|---:|---:|---|---|---|---|---|---|---|
| 06-01-01 | 01 | 0 | UX-02 | — | Search never bypasses typed query contracts | component | `npm run test:components -- --runInBand` | ❌ W0 shared primitive test | ⬜ pending |
| 06-01-02 | 01 | 0 | UX-01, UX-07 | — | Filter/favorite state never mutates catalog source rows | component | `npm run test:components -- --runInBand` | ❌ W0 shared chip test | ⬜ pending |
| 06-01-03 | 01 | 0 | UX-03, UX-04, UX-05, UX-06, UX-09, UX-10 | T-06-01 | Native evidence emits no private source rows or identifiers | contract | `node --test scripts/phase6-evidence-scripts.test.mjs` | ❌ W0 | ⬜ pending |
| 06-02-01 | 02 | 1 | UX-10 | T-06-01, T-06-02 | Diagnostics are bounded/redacted; SQLite remains authoritative | sqlite-host + component | `npm run test:sqlite:host -- --runInBand && npm run test:components -- --runInBand` | ✅ extend | ⬜ pending |
| 06-03-01 | 03 | 1 | UX-01, UX-06, UX-07, UX-08 | T-06-02 | UI preference/refresh changes do not rewrite catalog facts | component | `npm run test:components -- --runInBand` | ✅ extend | ⬜ pending |
| 06-03-02 | 03 | 1 | UX-02 | T-06-02 | Shared Search preserves typed local query boundaries | component | `npm run test:components -- --runInBand` | ✅ extend | ⬜ pending |
| 06-04-01 | 04 | 1 | UX-03, UX-05 | T-06-03 | Civil LocalDate/bounds/timezone semantics remain unchanged | unit + component | `npm run test:unit -- --runInBand && npm run test:components -- --runInBand` | ✅ extend | ⬜ pending |
| 06-05-01 | 05 | 1 | UX-04 | T-06-02 | Drag changes draft order only; Save Plan Changes remains sole persistence | component + native | `npm run test:components -- --runInBand` | ✅ extend | ⬜ pending |
| 06-06-01 | 06 | 1 | UX-09 | — | Navigation and route labels remain distinct and accessible | component + native | `npm run test:components -- --runInBand` | ✅ extend | ⬜ pending |
| 06-07-01 | 07 | 2 | UX-01..UX-10 | T-06-01..T-06-03 | Exact candidate and evidence are hash-bound and privacy-safe | full + native | `npm run test:all -- --runInBand` plus Phase 6 runner | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Shared `M3SearchField` component test for anatomy, clear, busy, focus, and IME semantics.
- [ ] Shared filter-chip component test for selected icon/shape/accessibility state and filled Favorite.
- [ ] `AdaptiveScreen` refresh contract test for a single controlled `RefreshControl`.
- [ ] `maestro/phase6/` flows and `scripts/run-phase6-maestro.mjs`, including exact candidate identity, Progress reproduction/recovery, month/date/reorder gestures, 200% navigation, and font-scale restoration.
- [ ] `scripts/phase6-evidence-scripts.test.mjs` to fail closed on missing/wrong package, APK hash, ADB path, device, screenshots, and font-scale reset.
- [ ] Exact Progress branch fixture in `tests/sqlite-host/progressRepository.test.ts`, created only after redacted runtime diagnosis identifies the rejecting branch.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|---|---|---|---|
| Samsung touch-and-hold reorder and month swipe ergonomics | UX-03, UX-04, UX-05 | Physical touch latency, grip, and accidental-scroll behavior cannot be proven by component tests | Install the exact replacement APK on SM-S916B; perform repeated slow/fast month swipes and long-press reorders; confirm live displacement, stable scrolling, and fallback buttons |
| Samsung OLED Light/Dark selected-state visibility | UX-01, UX-07, UX-09 | Real-panel perception and system appearance behavior require hardware | Check filters, Favorite, navigation, dialogs, and focus/pressed states in System, Light, and Dark |
| TalkBack reading order and focus restoration | UX-01..UX-09 | Accessibility service output/focus transitions are native behavior | Traverse each changed surface; confirm names, roles, states, logical order, modal containment, and return focus |
| Owner acceptance | UX-01..UX-10 | Product judgment cannot be automated | Review the full one-shot checklist after automated and device evidence passes |

---

## Security Threat References

- **T-06-01:** Runtime diagnostics or evidence could disclose local workout/progress data. Emit only bounded branch/error class/code and aggregate evidence; never raw rows, IDs, JSON, paths, backup contents, or device serials.
- **T-06-02:** Presentation fixes could bypass authoritative repositories or persist draft gesture/filter state. Screens continue through typed runtime operations; only explicit source commands commit.
- **T-06-03:** Date visual changes could corrupt civil-date/timezone semantics. Preserve validated LocalDate strings, bounds, and private drafts until `Apply Date`.

---

## Validation Sign-Off

- [x] All planned behaviors have an automated test target or explicit Wave 0 dependency.
- [x] Sampling continuity prohibits three consecutive tasks without automated verification.
- [x] Wave 0 lists every missing shared/native test artifact.
- [x] Commands are non-watch mode.
- [x] Focused feedback target is under 30 seconds.
- [ ] `nyquist_compliant: true` after plans assign every task and Wave 0 artifact.

**Approval:** pending plan mapping

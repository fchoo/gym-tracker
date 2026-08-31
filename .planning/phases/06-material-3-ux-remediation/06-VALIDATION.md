---
phase: 6
slug: material-3-ux-remediation
status: planned
nyquist_compliant: true
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
| 06-01-01 | 01 | 0 | UX-02 | T-06-02 | Search never bypasses typed query contracts | component | `npm run test:components -- --runInBand` | ❌ Wave 0 shared primitive test | ⬜ pending |
| 06-01-02 | 01 | 0 | UX-01, UX-07 | T-06-02 | Filter/favorite state never mutates catalog source rows | component | `npm run test:components -- --runInBand` | ❌ Wave 0 shared chip test | ⬜ pending |
| 06-01-03 | 01 | 0 | UX-06 | T-06-02 | Refresh stays controlled on one owning scroll host and never bypasses typed Library state | component | `npm run test:components -- --runInBand src/ui/__tests__/foundation.test.tsx` | ❌ Wave 0 refresh test | ⬜ pending |
| 06-02-01 | 02 | 0 | UX-03, UX-04, UX-05, UX-09 | T-06-01, T-06-02 | Runner identity/privacy/cleanup checks fail closed before native consumer work | contract | `node --test scripts/phase6-evidence-scripts.test.mjs` | ❌ Wave 0 runner contract | ⬜ pending |
| 06-02-02 | 02 | 0 | UX-03, UX-04 | T-06-01, T-06-03 | Actual generated-native horizontal swipe and long-press displacement smoke gates gesture consumers | native | `npm run test:maestro:phase6 -- --flow gesture-smoke` | ❌ Wave 0 native smoke | ⬜ pending |
| 06-03-01 | 03 | 1 | UX-10 | T-06-01, T-06-02 | Candidate observations require immutable manifest/install identity plus an independently captured redacted measurement; no repository command claims that observation | external evidence | No repository command; record only through an immutable evidence workflow | ⚠️ external evidence required | ⬜ pending |
| 06-03-02 | 03 | 1 | UX-10 | T-06-01, T-06-02 | Full-migration host fixture proves the missing-runtime-capability compatibility behavior and preserves the factual current baseline | sqlite-host | `npm run test:sqlite:host -- --runInBand tests/sqlite-host/progressRepository.test.ts` | ✅ verified | ✅ green |
| 06-04-01 | 04 | 1 | UX-03 | T-06-03 | Root Calendar retains exact civil-date semantics and equivalent month controls | unit + component | `npm run test:unit -- --runInBand && npm run test:components -- --runInBand` | ✅ extend | ⬜ pending |
| 06-04-02 | 04 | 1 | UX-05 | T-06-03 | Date-field drafts commit only through explicit Apply and remain bounded | unit + component | `npm run test:unit -- --runInBand && npm run test:components -- --runInBand` | ✅ extend | ⬜ pending |
| 06-05-01 | 05 | 1 | UX-04 | T-06-02 | Drag and fallback actions change draft order only; Save Plan Changes remains sole persistence | component + native | `npm run test:components -- --runInBand` | ✅ extend | ⬜ pending |
| 06-05-02 | 05 | 1 | UX-02, UX-04 | T-06-02 | Picker Search and reorder hierarchy remain complete at required widths/text scales | component | `npm run test:components -- --runInBand` | ✅ extend | ⬜ pending |
| 06-06-01 | 06 | 1 | UX-01, UX-02 | T-06-02 | Shared Search and chips preserve typed filters and accessible state | component | `npm run test:components -- --runInBand src/ui/__tests__/LibraryScreen.test.tsx` | ✅ extend | ⬜ pending |
| 06-06-02 | 06 | 1 | UX-06, UX-07, UX-08 | T-06-01, T-06-02 | Refresh/favorite changes preserve catalog authority and Detail provenance | component | `npm run test:components -- --runInBand src/ui/__tests__/LibraryScreen.test.tsx` | ✅ extend | ⬜ pending |
| 06-07-01 | 07 | 2 | UX-10 | T-06-01, T-06-02, T-06-03 | Causal repair can touch only diagnosis-authorized source/projection paths and retains rebuildability | sqlite-host + integration | `npm run test:sqlite:host -- --runInBand tests/sqlite-host/progressRepository.test.ts && npm run test:integration -- --runInBand` | ✅ extend conditionally | ⬜ pending |
| 06-07-02 | 07 | 2 | UX-02, UX-10 | T-06-02, T-06-03 | Progress Search and Retry stay typed, factual, and recover after the proven transient condition | component + sqlite-host | `npm run test:components -- --runInBand src/ui/__tests__/ProgressScreen.test.tsx && npm run test:sqlite:host -- --runInBand tests/sqlite-host/progressRepository.test.ts` | ✅ extend | ⬜ pending |
| 06-08-01 | 08 | 1 | UX-09 | T-06-01, T-06-03 | Root labels, targets, focus, and selected state remain complete at 200% across adaptive layouts | component | `npm run test:components -- --runInBand src/ui/__tests__/foundation.test.tsx app/(tabs)/__tests__/_layout.test.tsx` | ✅ extend | ⬜ pending |
| 06-08-02 | 08 | 1 | UX-09 | T-06-01, T-06-02 | Today settings and distinct History/data routes remain typed and accessible | component + route | `npm run test:components -- --runInBand src/ui/__tests__/TodayScreen.test.tsx app/(tabs)/__tests__/index.test.tsx` | ✅ extend | ⬜ pending |
| 06-09-01 | 09 | 3 | UX-01..UX-10 | T-06-01..T-06-03 | C1-C11 consideration mapping and N1-N4 native backstops fail closed on identity/privacy/release authorization | contract | `node --test scripts/phase6-evidence-scripts.test.mjs` | ❌ Wave 3 evidence contract | ⬜ pending |
| 06-09-02 | 09 | 3 | UX-01..UX-10 | T-06-01..T-06-03 | Full gates and unchanged private signed candidate bytes bind C1-C11 and N1-N3 reports | full + native | `PHASE6_MANIFEST_SHA256=$(shasum -a 256 artifacts/release-candidate/release-candidate.json | awk '{print $1}') && npm run test:maestro:phase6 -- --bundle-dir artifacts/release-candidate --manifest-sha256 "$PHASE6_MANIFEST_SHA256" --package com.fchoo.gymtracker --serial emulator-5554 --output artifacts/release-candidate/evidence/phase6.json --report-dir artifacts/release-candidate/evidence/phase6-maestro` after `npm run test:all -- --runInBand` | ❌ Wave 3 candidate evidence | ⬜ pending |
| 06-09-03 | 09 | 3 | UX-01..UX-10 | T-06-01..T-06-03 | N4 Samsung observations remain exact-byte and cannot authorize release | attended | `prepare:attended:phase6` → `record:attended:phase6` → `verify:attended:phase6`; canonical pass/fail rows plus recomputed fixed-name PNG attachment SHA-256 values only | ✅ Phase 6 recorder/verifier | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Shared `M3SearchField` component test for anatomy, clear, busy, focus, and IME semantics.
- [ ] Shared filter-chip component test for selected icon/shape/accessibility state and filled Favorite.
- [ ] `AdaptiveScreen` refresh contract test for a single controlled `RefreshControl`.
- [ ] `maestro/phase6/` flow contracts and `scripts/run-phase6-maestro.mjs` scaffold, including exact candidate identity, Progress reproduction/recovery, month/date/reorder gestures, 200% navigation, and font-scale restoration.
- [ ] `scripts/phase6-evidence-scripts.test.mjs` to fail closed on missing/wrong package, APK hash, ADB path, device, screenshots, forbidden approval fields, and font-scale reset.
- [ ] Capture any future candidate Progress observation through immutable manifest/install identity and an independently captured redacted measurement; do not synthesize it from caller input.
- [x] Full-migration Progress compatibility fixture proves the factual baseline remains available when `toSorted` is absent.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|---|---|---|---|
| Samsung touch-and-hold reorder and month swipe ergonomics | UX-03, UX-04, UX-05 | Physical touch latency, grip, and accidental-scroll behavior cannot be proven by component tests | Install the exact replacement APK on SM-S916B; perform repeated slow/fast month swipes and long-press reorders; confirm live displacement, stable scrolling, and fallback buttons |
| Samsung OLED Light/Dark selected-state visibility | UX-01, UX-07, UX-09 | Real-panel perception and system appearance behavior require hardware | Check filters, Favorite, navigation, dialogs, and focus/pressed states in System, Light, and Dark |
| TalkBack reading order and focus restoration | UX-01..UX-09 | Accessibility service output/focus transitions are native behavior | Traverse each changed surface; confirm names, roles, states, logical order, modal containment, and return focus |
| Attended UX observation | UX-01..UX-10 | Touch, OLED, TalkBack, and product judgment cannot be automated | Review the full one-shot checklist after automated and device evidence passes; record observations only, never the Phase 5 release-approval token |

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
- [x] `nyquist_compliant: true` because every planned behavior has an automated owner and every native-only claim has an explicit attended owner.

**Approval:** plan mapping complete; execution evidence pending

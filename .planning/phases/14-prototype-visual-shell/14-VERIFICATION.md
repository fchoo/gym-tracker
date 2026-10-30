---
phase: 14-prototype-visual-shell
verified: 2026-10-09T17:25:33Z
status: gaps_found
score: 8/13 must-haves verified
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "The selected root and shared visual system match the approved Revision 18 navigation, color, and typography contract."
    status: failed
    reason: "The four roots exist and stay at the bottom, but selected tabs use the blue action token with no required 3dp orange underline. The shared type scale also diverges from the approved four-role contract. Existing tests assert the divergent styling instead of detecting it."
    artifacts:
      - path: "src/ui/components/index.ts"
        issue: "AppTabs colors the selected icon/label with colors.action and renders no orange underline; the tab bar uses colors.surface instead of the approved paper role."
      - path: "src/ui/theme/index.ts"
        issue: "The implementation defines 28sp screen titles, 28/52sp numeric roles, synthetic 800 numeric weights, and a 600 bodyStrong role despite the UI-SPEC's exact 14/16/20/57sp and 400/800/890 contract."
      - path: "src/ui/__tests__/foundation.test.tsx"
        issue: "The tests explicitly accept action-blue selected tabs with no selected underline and assert the divergent type scale."
    missing:
      - "Render selected root state with the approved primary ink/icon treatment and 3dp orange underline on the paper navigation surface."
      - "Align production semantic typography roles with 14-UI-SPEC or record an owner-approved deviation, then test the production consumers rather than token existence alone."
  - truth: "Semantic toasts and Removed sessions are production-wired and reachable through Settings."
    status: failed
    reason: "RemovedSessionsScreen requires useSemanticToast(), but SemanticToastProvider exists only inside the sibling (tabs) screen tree. The production /more/removed-sessions stack route has no provider ancestor and therefore throws before its loading/empty/restore states render. Tests hide the defect by injecting a provider that production does not supply."
    artifacts:
      - path: "src/ui/screens/RemovedSessionsScreen.tsx"
        issue: "Calls useSemanticToast() unconditionally at render time."
      - path: "app/more/removed-sessions.tsx"
        issue: "Renders RemovedSessionsScreen with no SemanticToastProvider."
      - path: "app/_layout.tsx"
        issue: "The root Stack is not wrapped by SemanticToastProvider; AppRootShell wraps only the (tabs) screen."
      - path: "app/more/__tests__/removed-sessions.test.tsx"
        issue: "Fixture-only setup manually wraps the route in SemanticToastProvider, unlike production."
    missing:
      - "Move the toast provider to a production ancestor shared by tabs and deep routes, or remove the route's unprovided dependency."
      - "Add a production-composition route test that renders /more/removed-sessions under the actual root provider tree and exercises restore/reload/toast ordering."
  - truth: "The retained native matrix is behavioral evidence for focus, input, visual comparison, no-write state, and DEV-02 rather than self-declared metadata."
    status: failed
    reason: "Source/APK/device hashes and privacy redaction are valid, but the evidence generator writes focus traces from expected_inputs without observed events, writes difference overlays containing only a baseline label and screenshot hash, substitutes the source-tree digest for runtime source-state evidence, and hard-codes component_verdict/native_verdict/DEV-02 pass values after any shallow Maestro success. The verifier checks hashes and declarations, not the claimed behavior."
    artifacts:
      - path: "scripts/run-phase14-maestro.mjs"
        issue: "Lines 507-547 synthesize trace/overlay/source-state fields; lines 565-576 hard-code passed verdicts; lines 614-624 hard-code DEV-02 native blended-fill pass."
      - path: "scripts/verify-phase14-evidence.mjs"
        issue: "Validates artifact paths/hashes and expected metadata but does not parse observed focus events, semantic assertions, visual diffs, runtime data-state hashes, or DEV-02 measurements."
      - path: "maestro/phase14/accessibility.yaml"
        issue: "The sheet flow performs touch and Back only; it does not execute the declared Escape, scrim, IME-clearance, or D-pad inputs."
      - path: "artifacts/native/phase14/traces/shell-sheets-tablet-600-landscape-scale-2.json"
        issue: "Contains expected_inputs and report metadata only, with no observed focus/key sequence."
      - path: "artifacts/native/phase14/overlays/shell-sheets-tablet-600-landscape-scale-2.json"
        issue: "Contains only baseline, cell_id, and screenshot_sha256; no comparison output or verdict."
    missing:
      - "Capture and validate observed focus/key events and execute every input claimed by each matrix cell."
      - "Generate a real source-bound Revision 18 comparison artifact with measured differences and an independently reviewed verdict."
      - "Capture pre/post runtime data-state digests for no-write claims and consume actual component-test reports instead of hard-coded passed values."
      - "Derive DEV-02 closure from measured blended-fill/contrast observations rather than assigning passed."
decision_coverage:
  honored: 0
  total: 0
  not_honored: []
---

# Phase 14: Prototype Visual Shell Verification Report

**Phase Goal:** The owner experiences one coherent Revision 18 visual and navigation system across the four roots, deep routes, settings, recovery surfaces, and appearance modes.
**Verified:** 2026-10-09T17:25:33Z
**Status:** gaps_found
**Re-verification:** No — independent fresh verification; the stale untracked report was not used as evidence
**Current branch / HEAD:** `fchoo/UX-revamp` / `4532010456584691c70ca24578bd265b536ba5e9`
**Implementation evidence base:** `d7282f29062796eccad20c6ecf960fdefa30a036`; current and retained source digest `490a02edff3edeb7a441380b1dffe7913f8d7fa108a4ce431f7c9cc99de94ce4`

## Verdict

Phase 14 is **not goal-complete**. Eight of the thirteen SHL criteria are verified. Five fail because the selected-root visual contract is wrong, the only production toast consumer is outside its provider and breaks Removed sessions, and the canonical native matrix does not contain the observations it claims to verify.

The clean `14-REVIEW.md`, validated `14-VALIDATION.md`, and all PASS fields were treated as claims and checked against source, tests, and retained artifacts. Their identity/privacy assertions are valid; their behavioral closure is not.

## Goal Achievement

### Observable Truths

| # | Requirement | Status | Independent evidence |
|---|---|---|---|
| 1 | SHL-01 — Exactly Workout, Calendar, Library, and Progress in one bottom shell at target widths | ✓ VERIFIED | `rootDestinations` and Expo Tabs expose exactly four ordered routes; no rail/two-row branch exists. Component suites cover 360/390/600/839/840/1024/1280 and 200% text; retained 360 portrait and 840 landscape semantic captures show all four roots. |
| 2 | SHL-02 — Correct selected state, in-place switching, destination state, deep-route exit, and focus | ✗ FAILED | Heading/trigger/destination focus tests pass, but `AppTabs` uses action blue and no required 3dp orange selected underline. No test actually sets destination-owned state, switches roots, and proves it survived; the native `root-state` flow only taps Library, presses Back, and asserts Workout. |
| 3 | SHL-03 — Persisted Light/Dark/System synchronized across roots and shared surfaces | ✓ VERIFIED | One root `AppearanceProvider` wraps all production Stack routes; SQLite preference read/write, rollback, System listener, all four real header triggers, and Light/Dark/System component behavior are implemented and tested. Garmin closure remains correctly deferred to GAR-16. |
| 4 | SHL-04 — Approved colors, Archivo/IBM Plex typography, spacing, borders, and density | ✗ FAILED | Font bytes, authority hashes, Archivo axis proof, and token literals are real. Production navigation applies the wrong selected color/surface and omits the orange underline; the semantic type scale diverges from the approved four-role/weight contract. The alleged Revision 18 overlays contain no comparison. |
| 5 | SHL-05 — Contextual, keyboard-safe, focus-contained sheets/dialogs with safe dismissal/restoration | ✓ VERIFIED | `BottomSheet` owns modal isolation, 68% scrim, 82% cap, keyboard avoidance, Back/Escape/scrim cancellation, traversal containment, and trigger restoration; `ConfirmationDialog` blocks competing actions while busy. Focused component tests passed. |
| 6 | SHL-06 — Theme-aware, accessible, dock-safe semantic toasts | ✗ FAILED | The primitive and dev-only proof route exist, but the only production `useSemanticToast()` consumer (`RemovedSessionsScreen`) is outside the only provider. Production root layout also supplies no measured toast avoidance values, and `bottomAvoidance` is ignored. |
| 7 | SHL-07 — Truthful loading/trusted/failure/retry/notification startup without displacing SQLite authority | ✓ VERIFIED | Root startup waits for bundled fonts and runtime trust, fails closed to bounded recovery copy, keeps roots disabled while untrusted, and preserves notification enable/deny/continue paths. Component tests passed. |
| 8 | SHL-08 — Rest sound/vibration/notification settings remain device-owned and reachable | ✓ VERIFIED | Shared settings content retains both switches, loading/saved/failure rollback behavior, denied-notification explanation, and Android notification-settings action. Relevant component tests passed. |
| 9 | SHL-09 — Removed sessions and Data and recovery remain reachable from Settings | ✗ FAILED | Both rows and router pushes exist, and Data and recovery renders. Removed sessions is not actually reachable because its route renders a hook with no production provider ancestor. Native evidence only scrolls to the row and never opens it. |
| 10 | SHL-10 — Complete Removed sessions loading/empty/error/restore/busy/failure/success lifecycle | ✗ FAILED | Screen logic and isolated tests are substantive, including authoritative reload ordering, but the production route crashes at render before those states are reachable. The route test passes only because it injects the missing provider. |
| 11 | SHL-11 — Automatic-backup status/recovery and CSV lifecycle remain available | ✓ VERIFIED | Runtime-backed Data and recovery route, CSV controller cancellation/handle cleanup, automatic status/retry, and navigation are substantive; focused tests passed. |
| 12 | SHL-12 — Google connection/policy/takeover/deletion/new-backup/privacy states remain available | ✓ VERIFIED | Automatic-backup route preserves policy, exact DELETE gate, stale-writer/partial-deletion states, disconnect/new-backup decisions, and privacy route; focused tests passed. |
| 13 | SHL-13 — Encrypted export plus restore/merge preflight, exact confirmation, progress/retry/rebuild recovery | ✓ VERIFIED | Manual controller retains transient passwords, opaque tokens, exact REPLACE/MERGE gates, duplicate-submit latches, cancellation, failure/retry, and rebuild-pending separation; focused tests passed. |

**Score:** 8/13 truths verified (0 present-but-behavior-unverified)

## Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `app/(tabs)/_layout.tsx` + four root routes | One four-root shell and four real Settings triggers | ✓ VERIFIED | All four headers call one `RootSettingsController`; Workout is the visible/semantic root name. |
| `src/ui/shell/AppRootShell.tsx` | Root focus/origin/settings coordinator | ✓ VERIFIED | Shared sheet and focus coordinator are substantive; cross-root destination focus has a passing behavioral test. |
| `src/ui/screens/AppSettingsContent.tsx` | Planned shared settings owner | ✓ VERIFIED (equivalent) | Planned path is absent, but the substantive router-independent export lives in `src/ui/screens/SettingsScreen.tsx` and is consumed by both tabs and `/more/index`. This path deviation does not cause the goal failure. |
| `src/ui/theme/index.ts` | Approved shared visual tokens/type roles | ✗ PARTIAL | Bundled fonts and base tokens exist; applied navigation and semantic typography roles diverge from the UI contract. |
| `src/ui/components/BottomSheet.tsx` / `ConfirmationDialog.tsx` | Shared overlay frame | ✓ VERIFIED | Substantive, wired, and behavior-tested. |
| `src/ui/components/SemanticToast.tsx` | Shared production toast host | ✗ HOLLOW | Substantive primitive, but production consumer/provider wiring is broken; retained native proof uses a dev-only route. |
| `src/ui/screens/RemovedSessionsScreen.tsx` | Production removed-history lifecycle | ✗ NOT_WIRED | Runtime data/commands are wired, but the screen cannot render under the production provider tree. |
| 13 `evidence/shell.*.json` files | Canonical observed native evidence | ✗ HOLLOW | Files and hashes are real; behavioral verdict fields are generated from declarations and shallow JUnit success rather than validated observations. |
| `artifacts/native/phase14/build.json` | Privacy-bounded source/APK/device identity | ✓ VERIFIED | Current source digest, retained APK SHA, installed APK SHA, package/profile, and live device identity all match. Raw serial and installed path are omitted. |
| `evidence/font-axis-proof.json` | Source/APK-bound Archivo proof | ✓ VERIFIED | Authority hashes match external Revision 18 files; both 1.0/2.0 cases record loaded Archivo and the 890/condensed/-0.07em oracle. |

## Key Link Verification

| From | To | Status | Evidence |
|---|---|---|---|
| Four root header icons | `RootSettingsController` → one `BottomSheet` | ✓ WIRED | All four route files call `openRootSettings`; integration test opens/closes one shared sheet from each real header. |
| App Settings sheet and `/more/index` | `AppSettingsContent` export in `SettingsScreen.tsx` | ✓ WIRED | Both presentations consume the same router-independent content owner. |
| Deep-route origin | Exact trigger or destination heading | ✓ WIRED | Component tests cover exact-trigger return, same-root fallback, and different-root destination heading focus. |
| `AppTabs` | Approved selected navigation tokens | ✗ WRONG ROLE | Selected icon/label use `colors.action` (blue); no orange underline is rendered. |
| `/more/removed-sessions` | `SemanticToastProvider` | ✗ NOT_WIRED | Provider is inside sibling `(tabs)` screen, while the route calls `useSemanticToast()` directly. |
| Native runner | Revision 18 oracle / observed focus and runtime state | ✗ DISCONNECTED | Runner never reads an image baseline for shell diffing, never records observed input events, and never captures runtime data-state hashes. |

## Data-Flow Trace

| Surface/value | Source chain | Status |
|---|---|---|
| Appearance preference | Settings radio → `AppearanceProvider.setAppearance` → SQLite preference store → live System listener → all Stack routes | ✓ FLOWING |
| Rest alert preferences | Settings switches → runtime serialized write/readback → rollback on failure | ✓ FLOWING |
| Removed sessions | Settings row → router → runtime list/restore/reload | ✗ DISCONNECTED AT RENDER due missing toast provider |
| CSV/manual/cloud recovery | Routes → controller/facade → opaque handles/tokens → authoritative results | ✓ FLOWING |
| Native `source_state_sha256` | Runner assigns `manifest.source_tree_sha256` | ✗ STATIC — source-code digest, not application pre/post state |
| Native focus trace | Matrix `expectedInputs` → JSON writer | ✗ STATIC — expected declaration, not observed events |
| Native difference overlay | Screenshot SHA → metadata JSON | ✗ STATIC — no baseline pixels, diff metrics, or review verdict |

## Behavioral Checks Run

| Check | Result |
|---|---|
| Phase 14 evidence self-tests | PASS — 18/18, but test-quality audit below shows they prove identity/schema behavior, not the claimed native semantics |
| Root/shell/component group | PASS — 10 suites / 216 tests |
| Overlay/settings/recovery group | PASS — 15 suites / 89 tests |
| TypeScript typecheck | PASS |
| Boundary check | PASS — 323 files |
| Current source-tree digest | PASS — matches retained `490a02ed...94ce4` |
| Retained versus installed Phase 14 APK | PASS — both `6133c26b...b485` |
| Live device identity | PASS — `96dcf303...04f9` |
| Authority hashes | PASS — approved JSON `b8e91e30...ff0bf`; HTML `b5ddbad8...9c96` |

## Test Quality Audit

| Test/evidence owner | Active | Skipped | Assertion level | Verdict |
|---|---:|---:|---|---|
| Root/shell tests | 216 in executed group | 0 | Behavioral | PASS for naming, four triggers, selected semantics, and focus; wrong selected visual contract is asserted as expected |
| Overlay/settings/recovery tests | 89 in executed group | 0 | Behavioral | Mostly strong; Removed route test is fixture-only because it injects a provider absent from production |
| Phase 14 evidence self-tests | 18 | 0 | Schema/hash/value | PASS for identity/privacy fail-closed behavior; INSUFFICIENT for visual/focus/input/no-write claims |
| Maestro matrix reports | 17 one-test reports | 0 | Status/visibility | INSUFFICIENT: several claimed inputs are never executed and output artifacts contain declarations rather than observations |

**Disabled requirement tests:** 0  
**Circular/synthetic evidence patterns:** 4 blocker patterns — hard-coded verdicts, synthetic focus traces, metadata-only overlays, source-tree-as-runtime-state  
**Fixture-only false positive:** `app/more/__tests__/removed-sessions.test.tsx`

## Anti-Patterns

| File | Pattern | Severity | Impact |
|---|---|---|---|
| `scripts/run-phase14-maestro.mjs` | Hard-coded PASS and synthetic observation artifacts | 🛑 BLOCKER | Makes retained evidence appear stronger than the executed flow. |
| `app/more/__tests__/removed-sessions.test.tsx` | Fixture supplies missing production provider | 🛑 BLOCKER | Test passes while production route composition fails. |
| `src/ui/__tests__/foundation.test.tsx` | Test enshrines blue/no-underline selected tab state | 🛑 BLOCKER | Passing test contradicts UI-SPEC rather than proving it. |
| Phase-owned source | Unreferenced TBD/FIXME/XXX | None | No debt-marker blocker found. |

## Requirements Coverage

| Requirement | Status |
|---|---|
| SHL-01 | ✓ SATISFIED |
| SHL-02 | ✗ BLOCKED |
| SHL-03 | ✓ SATISFIED |
| SHL-04 | ✗ BLOCKED |
| SHL-05 | ✓ SATISFIED |
| SHL-06 | ✗ BLOCKED |
| SHL-07 | ✓ SATISFIED |
| SHL-08 | ✓ SATISFIED |
| SHL-09 | ✗ BLOCKED |
| SHL-10 | ✗ BLOCKED |
| SHL-11 | ✓ SATISFIED |
| SHL-12 | ✓ SATISFIED |
| SHL-13 | ✓ SATISFIED |

No Phase 14 requirement is orphaned. These failures are not deferred to Phase 20: Phase 14 plans 14-09/14-10 explicitly require valid current-phase native evidence, and SHL-02/04/06/09/10 are Phase 14-owned behavior.

### Decision Coverage

Decision coverage verify emitted a non-blocking parser warning: it could not parse the CONTEXT `<decisions>` block (`0/0`). Direct inspection nevertheless found D14-01 through D14-06 and DEV-02; the blockers above identify where shipped code/evidence does not honor D14-01/D14-02/D14-04/D14-05.

## Gaps Summary

1. **Selected navigation and visual-system drift:** four roots exist, but the approved selected-root treatment and exact shared typography contract are not implemented.
2. **Production toast/recovery wiring:** Removed sessions cannot render under the real root provider tree, so toast, reachability, and recovery truths fail together.
3. **Non-behavioral native evidence:** identity/privacy binding is strong, but the retained matrix validates generated declarations and hashes rather than the focus, input, visual, no-write, and DEV-02 observations it claims.

---

_Verified: 2026-10-09T17:25:33Z_  
_Verifier: TRAE (independent goal-backward verification)_

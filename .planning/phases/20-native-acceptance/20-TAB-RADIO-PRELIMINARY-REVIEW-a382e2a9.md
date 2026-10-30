# Targeted preliminary source review: tab metrics and Android radio status

- Base: `adfe95fd9b4f79d7b2b206c086e1693232cc9637`
- Reviewed commit: `a382e2a924898dbbab4655edf5b1679fd651cfe6`
- Scope: the complete committed UI/radio repair delta only, including tests, coverage registration and orchestration safeguards. No pending Garmin worktree code or whole-branch/default-main review.
- Reviewer: parent source pass. This is **not independent Phase 20 goal verification, a full final-source security gate, native acceptance, or production authority**.
- Initial result: no concrete defect identified in the radio/fitting delta. Follow-up native image inspection found a real navigation safe-area omission outside the new glyph-fitting algorithm; it is assigned for repair below. This review is not clean/closed until that finding is re-reviewed. No overall readiness or quality score is assigned.

## Follow-up native finding

`[Warning] (confidence: 9/10) app/(tabs)/_layout.tsx:175-181`: the custom tab bar receives `props` but passes only disabled/navigation/state to `AppTabs`, discarding actual navigation insets. `AppTabs` has no bottom safe-area handling. Approved HTML `:436-437` explicitly adds safe-area-bottom to navigation height and padding. Fresh emulator candidate `artifacts/native/host/emulator-tabs-a382e2a92489/diagnostic-candidates/light-portrait-360-f100-1.png` shows complete labels and a matching Workout underline, but the Android gesture handle intersects the bottom track. The initial pixel scanner consequently mistook the gesture handle for Calendar/Library ink; that is not proof of letter clipping.

Action: task 26 owns bounded safe-area plumbing in an isolated UI worktree. Preserve the existing fitted-glyph algorithm and actual insets rather than invent fixed padding. Parent will recapture/review the full targeted emulator matrix after integration; no phone install or native acceptance PASS is authorized.

## Checks and evidence

| Boundary | Evidence |
|---|---|
| Exact status allowlist | `scripts/v12-airplane-mode-status.mjs:2-9` accepts only bare/verbose enabled and disabled; all other values return undefined. No caller interpolates arbitrary status text into a shell command. |
| Recovery service restoration | `scripts/v12-production-native-domain-actions.mjs:215-231` canonicalizes the initial service state, uses only fixed enable/disable commands, canonicalizes service readback and fails restoration when it differs. Existing owned-lease retention remains in the surrounding executor. |
| Calendar lease restoration | `scripts/v12-production-native-runtime.mjs:126-130,165-190` uses canonical snapshots and requires actual settings/service/display readback before calendar-restored publication and lease release. |
| Offline rollback | `scripts/v12-native-rollback-bridge.mjs:88-100` still requires airplane enabled, Wi-Fi zero and mobile-data zero before arming. Unknown/ambiguous status cannot authorize an offline operation. |
| New status consumers | All live verbose airplane-status consumers in scripts were traced; recovery, Calendar runtime/device session and rollback use the shared normalizer. Existing snapshot shape and downstream enable/disable selection remain compatible. |
| Tab typography | `src/ui/theme/index.ts:98-102` retains Archivo body 16/22. `src/ui/components/index.ts:1133-1153,1192-1197` keeps system scaling enabled, one line and explicit candidate sizing with the 0.5 floor. |
| Fresh measurement and underline | `src/ui/components/index.ts:1143-1188` keys measurements to column/scale/font, rejects stale callbacks, requires one complete fixed label and finite positive native advance, and publishes underline width only for a fitting probe and matching visible metrics. |
| Accessibility and targets | `src/ui/components/index.ts:1209-1228` hides the inactive measurement subtree from accessibility/focus/touch. `:1308-1333` preserves the real route tab semantics, native IDs, selection, keyboard activation and owning pressable. |
| Integrity coverage | `coverage/p20-airplane-mode-targeted-final/coverage-summary.json`: parser and rollback transport each exactly 100% statements/branches/functions/lines. `/tmp/p20-airplane-targeted-final.log`: all 60 bounded tests passed, zero skips. UI assignment report has 83 complete tests, zero skips, and helper exact 100% all four metrics. |
| Registry | `scripts/run-coverage-gate.mjs` and its complete tests bind 57 uniquely assigned evidence files and 22 critical Node modules without lowering any threshold. |

The initial broader host attempt was retained as failed because two registry tests observed the old count. The other 77 tests passed, and owned process cleanup completed. That failed project is not relabelled PASS; current complete registry/status/rollback files passed in the fresh 60-test targeted run.

## Remaining verification boundaries

1. Fresh owned-emulator glyph and underline comparison at portrait 360/390, Light/Dark and 100%/200% text is in progress. Source claims do not establish actual Android pixels.
2. The specific Samsung autofit-height rounding trigger was not instrumented; the code avoids the separate native autofit paths rather than claiming a measured vendor root cause.
3. Samsung confirmation, actual selected-client/native transport readiness, recovery/rollback execution, final-source independent review/security, all native shards and attended evidence remain required.
4. Pending Garmin packaging/readiness changes are outside this reviewed delta. The final source batch must be reviewed separately before acceptance or production.

No source was edited during the active emulator build. No phone action, credential read, provider call, production build, push or PR occurred in this review.

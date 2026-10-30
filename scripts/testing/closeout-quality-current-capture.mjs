import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const QUALITY_NODE = "/Users/bytedance/.nvm/versions/node/v24.19.0/bin/node";
export const QUALITY_BOOTSTRAP = "scripts/testing/closeout-quality-current-capture.mjs";
export const QUALITY_PRODUCER = "scripts/testing/closeout-quality-current-producer.mjs";
export const QUALITY_DERIVE = "scripts/testing/closeout-quality-current-derive.mjs";
export const QUALITY_SUBJECT = "scripts/v12-production-native-quality-actions.mjs";
export const QUALITY_TOOL_DATA = "scripts/testing/data/closeout-quality-tool-binding.json";
export const QUALITY_TESTS = Object.freeze([
  "artifacts/native/personal-closeout-20261027/last-two-corrected-proof/resume-20261029/quality-actions.witnessed.test.mjs",
  "scripts/testing/closeout-quality-remaining-branches.test.mjs",
]);
export const QUALITY_TEST_HASHES = Object.freeze([
  "11314e0f7293c523a6a00db470949765c2d18828b16136fe6937da70b8842028",
  "d4a1a02801fbbc23d2a11febf850d7adc1f64c3b1e42bbf354d38067f2fcc02b",
]);

// Each extra input must remain a literal in actual executed bootstrap source.
// This list is preparation data, refreshed/reviewed before source freeze. It
// includes current conservative runtime closure and exact controlled-copy files.
export const EXPLICIT_PROJECT_INPUTS = Object.freeze([
  ".planning/design/v1.2-browser-evidence/accessibility-measurements.json",
  ".planning/design/v1.2-browser-evidence/calendar-360-accessibility-proposal.png",
  ".planning/design/v1.2-browser-evidence/calendar-360-prototype.png",
  ".planning/design/v1.2-browser-evidence/calendar-pointer-evidence.json",
  ".planning/design/v1.2-browser-evidence/dark-active-overview.png",
  ".planning/design/v1.2-browser-evidence/dark-active-set-editor.png",
  ".planning/design/v1.2-browser-evidence/dark-calendar-agenda-2026-10-07.png",
  ".planning/design/v1.2-browser-evidence/dark-calendar-key.png",
  ".planning/design/v1.2-browser-evidence/dark-calendar-month.png",
  ".planning/design/v1.2-browser-evidence/dark-calendar-planned-strength-detail.png",
  ".planning/design/v1.2-browser-evidence/dark-garmin-consent.png",
  ".planning/design/v1.2-browser-evidence/dark-garmin-disconnected.png",
  ".planning/design/v1.2-browser-evidence/dark-garmin-outdoor.png",
  ".planning/design/v1.2-browser-evidence/dark-garmin-treadmill.png",
  ".planning/design/v1.2-browser-evidence/dark-library-exercises.png",
  ".planning/design/v1.2-browser-evidence/dark-library-plan-running-2k.png",
  ".planning/design/v1.2-browser-evidence/dark-library-plans.png",
  ".planning/design/v1.2-browser-evidence/dark-plan-type-chooser.png",
  ".planning/design/v1.2-browser-evidence/dark-progress-all.png",
  ".planning/design/v1.2-browser-evidence/dark-progress-running.png",
  ".planning/design/v1.2-browser-evidence/dark-progress-strength.png",
  ".planning/design/v1.2-browser-evidence/dark-running-editor.png",
  ".planning/design/v1.2-browser-evidence/dark-running-session-intervals.png",
  ".planning/design/v1.2-browser-evidence/dark-working-committed-rest.png",
  ".planning/design/v1.2-browser-evidence/dark-workout-root.png",
  ".planning/design/v1.2-browser-evidence/light-active-overview.png",
  ".planning/design/v1.2-browser-evidence/light-active-set-editor.png",
  ".planning/design/v1.2-browser-evidence/light-calendar-agenda-2026-10-07.png",
  ".planning/design/v1.2-browser-evidence/light-calendar-focus-rest.png",
  ".planning/design/v1.2-browser-evidence/light-calendar-key.png",
  ".planning/design/v1.2-browser-evidence/light-calendar-month.png",
  ".planning/design/v1.2-browser-evidence/light-calendar-planned-strength-detail.png",
  ".planning/design/v1.2-browser-evidence/light-garmin-consent.png",
  ".planning/design/v1.2-browser-evidence/light-garmin-disconnected.png",
  ".planning/design/v1.2-browser-evidence/light-garmin-outdoor.png",
  ".planning/design/v1.2-browser-evidence/light-garmin-treadmill.png",
  ".planning/design/v1.2-browser-evidence/light-library-exercises.png",
  ".planning/design/v1.2-browser-evidence/light-library-plan-running-2k.png",
  ".planning/design/v1.2-browser-evidence/light-library-plans.png",
  ".planning/design/v1.2-browser-evidence/light-plan-type-chooser.png",
  ".planning/design/v1.2-browser-evidence/light-progress-all.png",
  ".planning/design/v1.2-browser-evidence/light-progress-running.png",
  ".planning/design/v1.2-browser-evidence/light-progress-strength.png",
  ".planning/design/v1.2-browser-evidence/light-running-editor.png",
  ".planning/design/v1.2-browser-evidence/light-running-session-intervals.png",
  ".planning/design/v1.2-browser-evidence/light-working-committed-rest.png",
  ".planning/design/v1.2-browser-evidence/light-workout-root.png",
  ".planning/design/v1.2-browser-evidence/serial-walk.json",
  ".planning/design/v1.2-browser-evidence/source-manifest.json",
  ".planning/design/v1.2-browser-evidence/walk-prototype.py",
  ".planning/design/v1.2-browser-evidence/workspace-baseline.json",
  "artifacts/native/personal-closeout-20261027/last-two-corrected-proof/resume-20261029/quality-actions.witnessed.test.mjs",
  "artifacts/review/phase2/exercise-library-acceptance.json",
  "artifacts/review/phase2/starter-plans-acceptance.json",
  "assets/content/exercise-library.v1.json",
  "assets/content/exercise-library.v1.manifest.json",
  "assets/content/full-body-foundation.v1.json",
  "assets/content/starter-plans.v2.json",
  "assets/fonts/Archivo-VariableFont_wdth,wght.ttf",
  "jest.config.js",
  "jest.setup.js",
  "maestro/v1.2/calendar-requirements.yaml",
  "modules/argon2-kdf/src/index.ts",
  "modules/garmin-connect/src/index.ts",
  "modules/network-classifier/src/index.ts",
  "package-lock.json",
  "package.json",
  "scripts/__pycache__/run-phase18-python-coverage.cpython-314.pyc",
  "scripts/__pycache__/run-phase20-pidfd-coverage.cpython-314.pyc",
  "scripts/__pycache__/test_v12_linux_pidfd_signal.cpython-314.pyc",
  "scripts/__pycache__/v12-linux-pidfd-signal.cpython-314.pyc",
  "scripts/acceptance-runner-evidence.mjs",
  "scripts/acceptance-verifier-evidence.mjs",
  "scripts/adb-pull-retry.mjs",
  "scripts/adversarial-runner-evidence.mjs",
  "scripts/adversarial-verifier-evidence.mjs",
  "scripts/assert-generated-android.mjs",
  "scripts/assert-generated-android.test.mjs",
  "scripts/assert-generated-production-android.mjs",
  "scripts/assert-generated-production-android.test.mjs",
  "scripts/benchmark-evidence-runner.mjs",
  "scripts/benchmark-phase1.mjs",
  "scripts/benchmark-phase12-backup.mjs",
  "scripts/benchmark-phase12-backup.test.mjs",
  "scripts/benchmark-phase15-workout.mjs",
  "scripts/benchmark-phase15-workout.test.mjs",
  "scripts/benchmark-phase18-garmin.mjs",
  "scripts/benchmark-phase18-garmin.test.mjs",
  "scripts/benchmark-phase19-progress.jest.cjs",
  "scripts/benchmark-phase19-progress.mjs",
  "scripts/benchmark-phase19-progress.test.mjs",
  "scripts/benchmark-phase2.mjs",
  "scripts/benchmark-phase3.mjs",
  "scripts/benchmark-phase4.mjs",
  "scripts/benchmark-phase5.mjs",
  "scripts/benchmark-v12-interactions.mjs",
  "scripts/benchmark-v12-interactions.test.mjs",
  "scripts/bootstrap-phase18-python-coverage.sh",
  "scripts/build-android-cffi.mjs",
  "scripts/build-android-cffi.test.mjs",
  "scripts/build-bootstrap-native-test-apk.sh",
  "scripts/build-current-native-test-apk.sh",
  "scripts/build-current-native-test-apk.test.mjs",
  "scripts/build-release-candidate-once.sh",
  "scripts/capture-v12-visual.mjs",
  "scripts/capture-v12-visual.test.mjs",
  "scripts/check-boundaries.mjs",
  "scripts/check-cng-reproducible.sh",
  "scripts/compare-v12-calendar.mjs",
  "scripts/compare-v12-visual.mjs",
  "scripts/compare-v12-visual.test.mjs",
  "scripts/concept-g-image-contract.test.mjs",
  "scripts/configure-release-signing.mjs",
  "scripts/content/build-exercise-pack.mjs",
  "scripts/content/build-starter-plans.mjs",
  "scripts/content/diff-exercise-pack.mjs",
  "scripts/content/diff-exercise-pack.test.mjs",
  "scripts/content/diff-starter-plans.mjs",
  "scripts/content/validate-exercise-pack.mjs",
  "scripts/content/validate-starter-plans.mjs",
  "scripts/create-phase14-visual-attestation.mjs",
  "scripts/create-release-candidate-manifest.mjs",
  "scripts/create-v12-readiness-handoff.mjs",
  "scripts/create-v12-readiness-handoff.test.mjs",
  "scripts/create-v12-run-manifest.mjs",
  "scripts/create-v12-run-manifest.test.mjs",
  "scripts/doctor-android.sh",
  "scripts/doctor-android.test.mjs",
  "scripts/evaluate-npm-audit.mjs",
  "scripts/evaluate-npm-audit.test.mjs",
  "scripts/finalize-phase14-evidence.mjs",
  "scripts/fixtures/v12-calendar-comparison/complete.json",
  "scripts/fixtures/v12-calendar-evidence/complete.json",
  "scripts/garmin-android-native.mjs",
  "scripts/garmin-android-native.test.mjs",
  "scripts/garmin-android-test-fixtures.mjs",
  "scripts/garmin-cli-coverage-evidence.mjs",
  "scripts/generate-concept-g-icons.mjs",
  "scripts/generate-phase2-attended-checklist.mjs",
  "scripts/generate-phase2-attended-checklist.test.mjs",
  "scripts/generate-phase20-visual-state-registry.mjs",
  "scripts/generate-phase20-visual-state-registry.test.mjs",
  "scripts/generate-phase5-attended-checklist.mjs",
  "scripts/generate-phase6-attended-checklist.mjs",
  "scripts/generate-phase7-attended-checklist.mjs",
  "scripts/generate-v12-attended-checklist.mjs",
  "scripts/generate-v12-attended-checklist.test.mjs",
  "scripts/generate-v12-parity-report.mjs",
  "scripts/google-oauth-config.mjs",
  "scripts/google-oauth-config.test.mjs",
  "scripts/hash-apk.sh",
  "scripts/install-git-hooks.sh",
  "scripts/install-maestro.sh",
  "scripts/install-pinned-android-sdk.sh",
  "scripts/kotlin-coverage-evidence.mjs",
  "scripts/maestro-safe-sdk/CoverageReport.java",
  "scripts/maestro-safe-sdk/README.md",
  "scripts/maestro-safe-sdk/SafeFlow.kt",
  "scripts/maestro-safe-sdk/SafeFlowTest.kt",
  "scripts/maestro-safe-sdk/SafeMaestro.kt",
  "scripts/maestro-safe-sdk/SessionOwnedDriver.kt",
  "scripts/maestro-safe-sdk/SessionOwnedDriverTest.kt",
  "scripts/maestro-safe-sdk/instrumentation-ownership-proposal.md",
  "scripts/maestro-safe-sdk/toolchain-pins.json",
  "scripts/native-contract-log-transport.mjs",
  "scripts/native-device-selection.mjs",
  "scripts/native-device-selection.test.mjs",
  "scripts/node-evidence-utils.mjs",
  "scripts/phase10-evidence-scripts.test.mjs",
  "scripts/phase11-evidence-scripts.test.mjs",
  "scripts/phase12-evidence-scripts.test.mjs",
  "scripts/phase14-action-observation.mjs",
  "scripts/phase14-action-truthfulness.test.mjs",
  "scripts/phase14-cell-checkpoint.mjs",
  "scripts/phase14-evidence-observation.mjs",
  "scripts/phase14-evidence-scripts.test.mjs",
  "scripts/phase14-font-proof.test.mjs",
  "scripts/phase14-native-matrix.mjs",
  "scripts/phase14-native-matrix.test.mjs",
  "scripts/phase14-resume.test.mjs",
  "scripts/phase14-truthful-evidence.test.mjs",
  "scripts/phase14-visual-review.mjs",
  "scripts/phase14-visual-review.test.mjs",
  "scripts/phase15-evidence-scripts.test.mjs",
  "scripts/phase15-native-matrix.mjs",
  "scripts/phase15-native-matrix.test.mjs",
  "scripts/phase17-evidence-scripts.test.mjs",
  "scripts/phase18-acceptance-helper-coverage.test.mjs",
  "scripts/phase18-aggregate-acceptance.mjs",
  "scripts/phase18-aggregate-acceptance.test.mjs",
  "scripts/phase18-benchmark-helper-coverage.test.mjs",
  "scripts/phase18-build-manifest.mjs",
  "scripts/phase18-build-manifest.test.mjs",
  "scripts/phase18-device-identity.mjs",
  "scripts/phase18-device-identity.test.mjs",
  "scripts/phase18-evidence-helpers.test.mjs",
  "scripts/phase18-garmin-acceptance.test.mjs",
  "scripts/phase18-garmin-adversarial.test.mjs",
  "scripts/phase18-garmin-proof.test.mjs",
  "scripts/phase18-installed-apk.mjs",
  "scripts/phase18-installed-apk.test.mjs",
  "scripts/phase18-language-coverage.mjs",
  "scripts/phase18-language-coverage.test.mjs",
  "scripts/phase18-privacy-scan.mjs",
  "scripts/phase18-privacy-scan.test.mjs",
  "scripts/phase18-proof-helper-coverage.test.mjs",
  "scripts/phase18-verifier-cli.test.mjs",
  "scripts/phase19-coverage.jest.cjs",
  "scripts/phase19-integrity-coverage.json",
  "scripts/phase2-evidence-boundary.mjs",
  "scripts/phase2-evidence-identity.mjs",
  "scripts/phase2-evidence-scripts.test.mjs",
  "scripts/phase2-source-ledger.mjs",
  "scripts/phase20-integrity-coverage.test.mjs",
  "scripts/phase20-subprocess-coverage.mjs",
  "scripts/phase20-subprocess-coverage.test.mjs",
  "scripts/phase20-visual-integrity-coverage.test.mjs",
  "scripts/phase3-evidence-scripts.test.mjs",
  "scripts/phase4-evidence-scripts.test.mjs",
  "scripts/phase5-candidate-evidence.mjs",
  "scripts/phase5-evidence-scripts.test.mjs",
  "scripts/phase5-promotion-contract.mjs",
  "scripts/phase5-terminal-seal-contract.mjs",
  "scripts/phase5-workflow-contract.mjs",
  "scripts/phase6-evidence-scripts.test.mjs",
  "scripts/phase7-evidence-scripts.test.mjs",
  "scripts/phase8-evidence-scripts.test.mjs",
  "scripts/phase9-evidence-scripts.test.mjs",
  "scripts/phase9-task1-boundary.test.mjs",
  "scripts/phase9-v20-native-evidence.test.mjs",
  "scripts/prepare-phase12-google-acceptance.mjs",
  "scripts/prepare-phase12-google-acceptance.test.mjs",
  "scripts/privacy-scan-evidence.mjs",
  "scripts/proof-runner-evidence.mjs",
  "scripts/proof-verifier-evidence.mjs",
  "scripts/record-phase12-google-acceptance.mjs",
  "scripts/record-phase5-promotion-proof.mjs",
  "scripts/record-phase5-source-evidence.mjs",
  "scripts/record-rest-lifecycle-evidence.mjs",
  "scripts/release-candidate-contract.test.mjs",
  "scripts/release-matrix-contract.mjs",
  "scripts/run-argon2-feasibility.mjs",
  "scripts/run-component-tests.mjs",
  "scripts/run-coverage-gate.mjs",
  "scripts/run-coverage-gate.test.mjs",
  "scripts/run-native-sqlite-contracts.mjs",
  "scripts/run-phase1-maestro.mjs",
  "scripts/run-phase10-maestro.mjs",
  "scripts/run-phase11-maestro.mjs",
  "scripts/run-phase12-maestro.mjs",
  "scripts/run-phase14-font-proof.mjs",
  "scripts/run-phase14-maestro.mjs",
  "scripts/run-phase15-maestro.mjs",
  "scripts/run-phase17-maestro.mjs",
  "scripts/run-phase18-garmin-acceptance.mjs",
  "scripts/run-phase18-garmin-adversarial.mjs",
  "scripts/run-phase18-garmin-proof.mjs",
  "scripts/run-phase18-kotlin-coverage.mjs",
  "scripts/run-phase18-kotlin-coverage.test.mjs",
  "scripts/run-phase18-python-coverage.py",
  "scripts/run-phase18-python-coverage.test.mjs",
  "scripts/run-phase19-host-evidence.mjs",
  "scripts/run-phase19-host-evidence.test.mjs",
  "scripts/run-phase19-native-evidence.mjs",
  "scripts/run-phase19-native-evidence.test.mjs",
  "scripts/run-phase2-maestro.mjs",
  "scripts/run-phase20-pidfd-coverage.py",
  "scripts/run-phase3-maestro.mjs",
  "scripts/run-phase4-maestro.mjs",
  "scripts/run-phase5-maestro.mjs",
  "scripts/run-phase6-maestro.mjs",
  "scripts/run-phase7-maestro.mjs",
  "scripts/run-phase8-maestro.mjs",
  "scripts/run-phase9-maestro.mjs",
  "scripts/run-targeted-check.mjs",
  "scripts/run-v12-maestro.mjs",
  "scripts/run-v12-maestro.test.mjs",
  "scripts/source-tree-digest.mjs",
  "scripts/source-tree-digest.test.mjs",
  "scripts/stage-phase5-human-evidence.mjs",
  "scripts/test_v12_linux_pidfd_signal.py",
  "scripts/testing/closeout-attended-resolution.test.mjs",
  "scripts/testing/closeout-collector-failure-paths.test.mjs",
  "scripts/testing/closeout-collector-garmin-proof.test.mjs",
  "scripts/testing/closeout-collector-import-fault.test.mjs",
  "scripts/testing/closeout-collector-scheduler.test.mjs",
  "scripts/testing/closeout-coverage-range-regression.test.mjs",
  "scripts/testing/closeout-current-artifact-faults.test.mjs",
  "scripts/testing/closeout-current-runner-faults.test.mjs",
  "scripts/testing/closeout-current-verifier-import-faults.test.mjs",
  "scripts/testing/closeout-current-verifier-phases.test.mjs",
  "scripts/testing/closeout-eight-native-tool-boundaries.test.mjs",
  "scripts/testing/closeout-fault-proof.mjs",
  "scripts/testing/closeout-final-recovery-authority.test.mjs",
  "scripts/testing/closeout-functional-receipt-rejections.test.mjs",
  "scripts/testing/closeout-garmin-cached-cli.test.mjs",
  "scripts/testing/closeout-handoff-schema-fixture.mjs",
  "scripts/testing/closeout-installed-apk-path.test.mjs",
  "scripts/testing/closeout-last-two-proof-fixture.mjs",
  "scripts/testing/closeout-ledger-metadata-rejection.test.mjs",
  "scripts/testing/closeout-ledger-reviewed-exception.test.mjs",
  "scripts/testing/closeout-maestro-default-cli.test.mjs",
  "scripts/testing/closeout-maestro-fixture.mjs",
  "scripts/testing/closeout-maestro-runner-edges.test.mjs",
  "scripts/testing/closeout-mapping-rejections.test.mjs",
  "scripts/testing/closeout-preseal-envelope-faults.test.mjs",
  "scripts/testing/closeout-quality-current-capture.mjs",
  "scripts/testing/closeout-quality-current-derive.mjs",
  "scripts/testing/closeout-quality-current-producer.mjs",
  "scripts/testing/closeout-quality-remaining-branches.test.mjs",
  "scripts/testing/closeout-registry-fault-injection.test.mjs",
  "scripts/testing/closeout-resume-central-identity.test.mjs",
  "scripts/testing/closeout-resume-current-source-phases.test.mjs",
  "scripts/testing/closeout-resume-mapping-snapshot.test.mjs",
  "scripts/testing/closeout-resume-phase-proof-fixture.mjs",
  "scripts/testing/closeout-resume-proof-fixture.mjs",
  "scripts/testing/closeout-resume-public-final-recovery.test.mjs",
  "scripts/testing/closeout-resume-runner-boundaries.test.mjs",
  "scripts/testing/closeout-resume-runner-lifecycle.test.mjs",
  "scripts/testing/closeout-resume-seal-defaults.test.mjs",
  "scripts/testing/closeout-resume-sparse-members.test.mjs",
  "scripts/testing/closeout-retained-node-branches.test.mjs",
  "scripts/testing/closeout-retained-node-fixture.mjs",
  "scripts/testing/closeout-retained-node-nine-boundaries.test.mjs",
  "scripts/testing/closeout-retained-node-nine.test.mjs",
  "scripts/testing/closeout-retained-production.test.mjs",
  "scripts/testing/closeout-retained-verifier-cli.test.mjs",
  "scripts/testing/closeout-running-outcome-gaps.test.ts",
  "scripts/testing/closeout-sdk-artifact-binding.test.mjs",
  "scripts/testing/closeout-resume-sdk-snapshot.test.mjs",
  "scripts/testing/closeout-sha-type-contract.test.mjs",
  "scripts/testing/closeout-sqlite-receipt-snapshot.test.mjs",
  "scripts/testing/closeout-tool-and-device-validation.test.mjs",
  "scripts/testing/closeout-verifier-boundaries.test.mjs",
  "scripts/testing/closeout-verifier-import-faults.test.mjs",
  "scripts/testing/data/closeout-quality-tool-binding.json",
  "scripts/testing/garmin-cli-coverage-evidence.test.mjs",
  "scripts/testing/personal-closeout-recovery-fixture.mjs",
  "scripts/testing/phase20-collector-edges.test.mjs",
  "scripts/testing/v12-calendar-observation-fixture.mjs",
  "scripts/testing/v12-phase14-shell-evidence-fixture.mjs",
  "scripts/testing/v12-phase20-blackbox/fake-device-adapter.mjs",
  "scripts/testing/v12-phase20-blackbox/fake-device-tool.mjs",
  "scripts/testing/v12-production-domain/controlled-domain-runner.mjs",
  "scripts/testing/v12-production-domain/controlled-domain-tool.mjs",
  "scripts/testing/v12-production-launcher/controlled-device-tool.mjs",
  "scripts/testing/v12-production-launcher/controlled-runner.mjs",
  "scripts/testing/v12-quality-evidence-fixture.mjs",
  "scripts/testing/v12-visual-streaming-worker.mjs",
  "scripts/testing/v12-visual-streaming.test.mjs",
  "scripts/v12-accessibility-shard.mjs",
  "scripts/v12-accessibility-shard.test.mjs",
  "scripts/v12-airplane-mode-status.mjs",
  "scripts/v12-airplane-mode-status.test.mjs",
  "scripts/v12-artifact-privacy.mjs",
  "scripts/v12-artifact-privacy.test.mjs",
  "scripts/v12-atomic-publication.integration.test.mjs",
  "scripts/v12-atomic-shard-publication.mjs",
  "scripts/v12-atomic-shard-publication.test.mjs",
  "scripts/v12-blocker-row-resolver.mjs",
  "scripts/v12-blocker-row-resolver.test.mjs",
  "scripts/v12-calendar-artifact-transport-edges.test.mjs",
  "scripts/v12-calendar-artifact-transport.mjs",
  "scripts/v12-calendar-artifact-transport.test.mjs",
  "scripts/v12-calendar-artifacts.mjs",
  "scripts/v12-calendar-case-evidence.mjs",
  "scripts/v12-calendar-case-registry.mjs",
  "scripts/v12-calendar-cli-blackbox.test.mjs",
  "scripts/v12-calendar-comparison.test.mjs",
  "scripts/v12-calendar-evidence-coverage.test.mjs",
  "scripts/v12-calendar-observation-contract.mjs",
  "scripts/v12-calendar-observation-contract.test.mjs",
  "scripts/v12-calendar-requirement-map.mjs",
  "scripts/v12-calendar-shard.mjs",
  "scripts/v12-calendar-shard.test.mjs",
  "scripts/v12-device-settings-contract.mjs",
  "scripts/v12-device-settings-contract.test.mjs",
  "scripts/v12-evidence-contract.mjs",
  "scripts/v12-evidence-contract.test.mjs",
  "scripts/v12-evidence-scripts.test.mjs",
  "scripts/v12-garmin-shard.mjs",
  "scripts/v12-garmin-shard.test.mjs",
  "scripts/v12-linux-pidfd-signal.py",
  "scripts/v12-maestro-route-contract.test.mjs",
  "scripts/v12-maestro-safe-sdk.mjs",
  "scripts/v12-maestro-safe-sdk.test.mjs",
  "scripts/v12-maestro-source-registry.mjs",
  "scripts/v12-native-adapter-attestation.test.mjs",
  "scripts/v12-native-adapter-supervisor.mjs",
  "scripts/v12-native-adapter.mjs",
  "scripts/v12-native-contract-log-transport.test.mjs",
  "scripts/v12-native-execution-origin.mjs",
  "scripts/v12-native-execution-origin.test.mjs",
  "scripts/v12-native-process-bootstrap.mjs",
  "scripts/v12-native-rollback-bridge.mjs",
  "scripts/v12-native-rollback-bridge.test.mjs",
  "scripts/v12-native-time-budgets.mjs",
  "scripts/v12-performance-shard.mjs",
  "scripts/v12-performance-shard.test.mjs",
  "scripts/v12-phase14-retention.mjs",
  "scripts/v12-phase20-cli-blackbox.test.mjs",
  "scripts/v12-posix-process-tree.mjs",
  "scripts/v12-posix-process-tree.test.mjs",
  "scripts/v12-preflight-contract.test.mjs",
  "scripts/v12-production-domain-receipts.mjs",
  "scripts/v12-production-domain-receipts.test.mjs",
  "scripts/v12-production-native-adapter-launcher.mjs",
  "scripts/v12-production-native-calendar-action.mjs",
  "scripts/v12-production-native-calendar-action.test.mjs",
  "scripts/v12-production-native-calendar-session.test.mjs",
  "scripts/v12-production-native-domain-actions.mjs",
  "scripts/v12-production-native-domain-actions.test.mjs",
  "scripts/v12-production-native-launcher.test.mjs",
  "scripts/v12-production-native-quality-actions.mjs",
  "scripts/v12-production-native-quality-actions.test.mjs",
  "scripts/v12-production-native-runtime.mjs",
  "scripts/v12-production-native-visual-actions.mjs",
  "scripts/v12-production-native-visual-actions.test.mjs",
  "scripts/v12-quality-evidence-contract.mjs",
  "scripts/v12-quality-evidence-contract.test.mjs",
  "scripts/v12-quality-maestro-contract.test.mjs",
  "scripts/v12-recovery-shard.mjs",
  "scripts/v12-recovery-shard.test.mjs",
  "scripts/v12-rollback-archive-inspection.mjs",
  "scripts/v12-rollback-async.test.mjs",
  "scripts/v12-rollback-evidence.mjs",
  "scripts/v12-shell-requirement-evidence.mjs",
  "scripts/v12-shell-requirement-registry.mjs",
  "scripts/v12-sqlite-producer-contract.mjs",
  "scripts/v12-sqlite-shard.mjs",
  "scripts/v12-sqlite-shard.test.mjs",
  "scripts/v12-visual-authority.mjs",
  "scripts/v12-visual-streaming.mjs",
  "scripts/validate-development-test-app-config.mjs",
  "scripts/validate-development-test-native-access.mjs",
  "scripts/validate-development-test-native-access.test.mjs",
  "scripts/validate-phase5-promotion-inputs.mjs",
  "scripts/validate-v12-prebuild-predecessors.mjs",
  "scripts/validate-v12-prebuild-predecessors.test.mjs",
  "scripts/verify-bootstrap-native-evidence.mjs",
  "scripts/verify-garmin-android-binaries.mjs",
  "scripts/verify-garmin-android-binaries.test.mjs",
  "scripts/verify-garmin-module-schema.test.mjs",
  "scripts/verify-garmin-python-lock.mjs",
  "scripts/verify-garmin-python-lock.test.mjs",
  "scripts/verify-native-evidence.mjs",
  "scripts/verify-personal-closeout.mjs",
  "scripts/verify-personal-closeout.test.mjs",
  "scripts/verify-phase12-evidence.mjs",
  "scripts/verify-phase12-evidence.test.mjs",
  "scripts/verify-phase13-evidence.mjs",
  "scripts/verify-phase13-evidence.test.mjs",
  "scripts/verify-phase14-evidence.mjs",
  "scripts/verify-phase15-evidence.mjs",
  "scripts/verify-phase17-evidence.mjs",
  "scripts/verify-phase18-garmin-acceptance.mjs",
  "scripts/verify-phase18-garmin-adversarial.mjs",
  "scripts/verify-phase18-garmin-proof.mjs",
  "scripts/verify-phase18-plan-coverage.mjs",
  "scripts/verify-phase18-plan-coverage.test.mjs",
  "scripts/verify-phase19-evidence.mjs",
  "scripts/verify-phase19-evidence.test.mjs",
  "scripts/verify-phase2-native-evidence.mjs",
  "scripts/verify-phase3-native-evidence.mjs",
  "scripts/verify-phase4-native-evidence.mjs",
  "scripts/verify-phase5-native-evidence.mjs",
  "scripts/verify-phase5-release-gate.mjs",
  "scripts/verify-phase9-task1-boundary.mjs",
  "scripts/verify-phase9-v20-native-evidence.mjs",
  "scripts/verify-pr-artifact-roundtrip.mjs",
  "scripts/verify-release-candidate-manifest.mjs",
  "scripts/verify-release-promotion.mjs",
  "scripts/verify-rest-lifecycle-evidence.mjs",
  "scripts/verify-v12-native-evidence.mjs",
  "scripts/verify-v12-native-evidence.security.test.mjs",
  "src/bootstrap/automaticBackupRuntime.ts",
  "src/bootstrap/calendarReadPorts.ts",
  "src/bootstrap/customExerciseRuntimeReadPort.ts",
  "src/bootstrap/garminImportRuntime.tsx",
  "src/bootstrap/launchCoordinator.ts",
  "src/bootstrap/libraryRuntimeReadPort.ts",
  "src/bootstrap/librarySectionPreferencePort.ts",
  "src/bootstrap/ownedPlanRuntime.tsx",
  "src/bootstrap/phase12BackupTestControls.ts",
  "src/bootstrap/phase14SourceStateProof.ts",
  "src/bootstrap/phase17ActionEnvelope.ts",
  "src/bootstrap/phase17FamilyACleanup.ts",
  "src/bootstrap/phase17FamilyAFixture.ts",
  "src/bootstrap/phase17FamilyBFixture.ts",
  "src/bootstrap/phase17FamilyCFixture.ts",
  "src/bootstrap/phase17NativeFixture.ts",
  "src/bootstrap/productionAutomaticBackupRuntime.ts",
  "src/bootstrap/productionAutomaticSnapshotCapture.ts",
  "src/bootstrap/runningPlanRuntime.tsx",
  "src/bootstrap/scheduleRuntime.tsx",
  "src/bootstrap/starterPlanRuntime.tsx",
  "src/bootstrap/trainingFoundationRuntime.ts",
  "src/bootstrap/workoutAppRuntime.tsx",
  "src/bootstrap/workoutLifecycle.ts",
  "src/domains/activities/activityDetails.ts",
  "src/domains/activities/activityIdentity.ts",
  "src/domains/activities/garminActivitySourcePort.ts",
  "src/domains/activities/importCommands.ts",
  "src/domains/activities/importContracts.ts",
  "src/domains/advancedTiming/advancedTimingCommands.ts",
  "src/domains/advancedTiming/advancedTimingConfig.ts",
  "src/domains/advancedTiming/advancedTimingState.ts",
  "src/domains/advancedTiming/index.ts",
  "src/domains/backup/automaticBackupContracts.ts",
  "src/domains/backup/automaticBackupCoordinator.ts",
  "src/domains/backup/automaticBackupPresentation.ts",
  "src/domains/backup/automaticBackupScheduler.ts",
  "src/domains/backup/driveBackupStorePort.ts",
  "src/domains/backup/googleAuthPort.ts",
  "src/domains/bodyweight/commands.ts",
  "src/domains/bodyweight/contracts.ts",
  "src/domains/content/catalog.ts",
  "src/domains/content/index.ts",
  "src/domains/history/calendar.ts",
  "src/domains/history/contracts.ts",
  "src/domains/history/correctionCommands.ts",
  "src/domains/history/correctionContracts.ts",
  "src/domains/history/historyLifecycleCommands.ts",
  "src/domains/history/historySubjects.ts",
  "src/domains/history/index.ts",
  "src/domains/history/metricHistory.ts",
  "src/domains/history/projectionReducer.ts",
  "src/domains/library/customExerciseCommands.ts",
  "src/domains/library/planDeletion.ts",
  "src/domains/library/search.ts",
  "src/domains/metrics/aggregates.ts",
  "src/domains/metrics/comparators.ts",
  "src/domains/metrics/contracts.ts",
  "src/domains/metrics/exposure.ts",
  "src/domains/metrics/index.ts",
  "src/domains/metrics/migrateCustomExerciseMetricProfile.ts",
  "src/domains/metrics/observations.ts",
  "src/domains/metrics/registry.ts",
  "src/domains/plans/activateStarterPlan.ts",
  "src/domains/plans/index.ts",
  "src/domains/plans/ownedPlanCommands.ts",
  "src/domains/plans/planImpactCommands.ts",
  "src/domains/portability/automaticPortability.ts",
  "src/domains/portability/backupCommands.ts",
  "src/domains/portability/backupContracts.ts",
  "src/domains/portability/backupFormat.ts",
  "src/domains/portability/csvExport.ts",
  "src/domains/portability/mergeCommands.ts",
  "src/domains/portability/mergePlan.ts",
  "src/domains/portability/portableIdentity.ts",
  "src/domains/portability/restoreCommands.ts",
  "src/domains/progress/contracts.ts",
  "src/domains/progress/dashboardProjection.ts",
  "src/domains/progress/index.ts",
  "src/domains/progress/periodProjection.ts",
  "src/domains/progress/relativeStrength.ts",
  "src/domains/progress/runningPacing.ts",
  "src/domains/progression/index.ts",
  "src/domains/progression/loadRepsV1.ts",
  "src/domains/progression/planAuthoredV1.ts",
  "src/domains/progression/policyRegistry.ts",
  "src/domains/progression/recommendationCommands.ts",
  "src/domains/progression/recommendationContracts.ts",
  "src/domains/rest/index.ts",
  "src/domains/rest/restCommands.ts",
  "src/domains/rest/restCountdownCuePort.ts",
  "src/domains/rest/restNotificationPort.ts",
  "src/domains/rest/restState.ts",
  "src/domains/running/activityMatchCommands.ts",
  "src/domains/running/commands.ts",
  "src/domains/running/contracts.ts",
  "src/domains/running/lifecycle.ts",
  "src/domains/scheduling/activation.ts",
  "src/domains/scheduling/collisionCommands.ts",
  "src/domains/scheduling/index.ts",
  "src/domains/scheduling/localDate.ts",
  "src/domains/scheduling/scheduleCommands.ts",
  "src/domains/scheduling/scheduleState.ts",
  "src/domains/scheduling/timeZone.ts",
  "src/domains/shared/clock.ts",
  "src/domains/shared/contracts.ts",
  "src/domains/shared/diagnostics.ts",
  "src/domains/shared/displayTimeZone.ts",
  "src/domains/shared/errors.ts",
  "src/domains/shared/index.ts",
  "src/domains/workout/activeWorkout.ts",
  "src/domains/workout/finishWorkout.ts",
  "src/domains/workout/hapticsPort.ts",
  "src/domains/workout/index.ts",
  "src/domains/workout/outcomes.ts",
  "src/domains/workout/sessionDetail.ts",
  "src/domains/workout/sessionExerciseCommands.ts",
  "src/domains/workout/setCommands.ts",
  "src/domains/workout/startWorkout.ts",
  "src/domains/workout/undoCompletedSet.ts",
  "src/domains/workout/workoutPreferences.ts",
  "src/domains/workout/workoutPresentation.ts",
  "src/platform/audio/foregroundRestSoundOwnership.ts",
  "src/platform/crypto/aesGcmArchivePort.ts",
  "src/platform/crypto/passwordKdf.ts",
  "src/platform/crypto/runtimeSha256.ts",
  "src/platform/files/expoBackupFilePort.ts",
  "src/platform/files/expoCsvFilePort.ts",
  "src/platform/garmin/canonicalGarminPayload.ts",
  "src/platform/garmin/garminActivityAdapter.ts",
  "src/platform/garmin/garminSyncContracts.ts",
  "src/platform/garmin/garminSyncCoordinator.ts",
  "src/platform/garmin/normalizeGarminActivity.ts",
  "src/platform/google/driveBackupStoreAdapter.ts",
  "src/platform/google/googleAuthAdapter.ts",
  "src/platform/haptics/expoHapticsAdapter.ts",
  "src/platform/notifications/expoForegroundRestFeedbackAdapter.ts",
  "src/platform/notifications/expoRestNotificationAdapter.ts",
  "src/platform/notifications/restNotificationReconciler.ts",
  "src/platform/preferences/restAlertPreferenceStore.ts",
  "src/platform/sqlite/connection.ts",
  "src/platform/sqlite/effects/effectRunner.ts",
  "src/platform/sqlite/effects/effectStore.ts",
  "src/platform/sqlite/effects/historyProjectionEffects.ts",
  "src/platform/sqlite/foregroundRestFeedbackStore.ts",
  "src/platform/sqlite/index.ts",
  "src/platform/sqlite/migrationRunner.ts",
  "src/platform/sqlite/migrations/0001_initial.ts",
  "src/platform/sqlite/migrations/0002_outcome_effort.ts",
  "src/platform/sqlite/migrations/0003_exercise_history_index.ts",
  "src/platform/sqlite/migrations/0004_content_library.ts",
  "src/platform/sqlite/migrations/0005_exercise_search_fts.ts",
  "src/platform/sqlite/migrations/0006_metric_profiles.ts",
  "src/platform/sqlite/migrations/0008_schedule_activation.ts",
  "src/platform/sqlite/migrations/0009_owned_plans.ts",
  "src/platform/sqlite/migrations/0010_owned_recommendations.ts",
  "src/platform/sqlite/migrations/0011_foreground_rest_feedback.ts",
  "src/platform/sqlite/migrations/0012_foreground_rest_feedback_attempts.ts",
  "src/platform/sqlite/migrations/0013_history_integrity.ts",
  "src/platform/sqlite/migrations/0014_history_projections.ts",
  "src/platform/sqlite/migrations/0015_progression_evidence.ts",
  "src/platform/sqlite/migrations/0016_portability_restore_state.ts",
  "src/platform/sqlite/migrations/0017_workout_remove_receipts.ts",
  "src/platform/sqlite/migrations/0018_workout_remove_receipt_entity_ids.ts",
  "src/platform/sqlite/migrations/0019_session_exercise_editing.ts",
  "src/platform/sqlite/migrations/0020_session_exercise_edit_receipts.ts",
  "src/platform/sqlite/migrations/0021_advanced_set_timing.ts",
  "src/platform/sqlite/migrations/0022_portable_owner_identities.ts",
  "src/platform/sqlite/migrations/0023_automatic_drive_backup.ts",
  "src/platform/sqlite/migrations/0024_automatic_backup_receipts.ts",
  "src/platform/sqlite/migrations/0025_automatic_backup_deletion_progress.ts",
  "src/platform/sqlite/migrations/0026_automatic_backup_account_label.ts",
  "src/platform/sqlite/migrations/0027_advanced_timing_target_ownership.ts",
  "src/platform/sqlite/migrations/0028_multi_plan_running_foundation.ts",
  "src/platform/sqlite/migrations/0029_running_session_roots.ts",
  "src/platform/sqlite/migrations/0030_imported_activity_evidence.ts",
  "src/platform/sqlite/migrations/0031_bodyweight_source_history.ts",
  "src/platform/sqlite/migrations/0032_strength_occurrence_provenance.ts",
  "src/platform/sqlite/migrations/0033_completed_set_correction_receipts.ts",
  "src/platform/sqlite/migrations/0034_running_activity_match_ledger.ts",
  "src/platform/sqlite/migrations/0035_imported_activity_lifecycle_state.ts",
  "src/platform/sqlite/migrations/0036_session_exercise_rest_defaults.ts",
  "src/platform/sqlite/migrations/0037_exercise_instruction_sets.ts",
  "src/platform/sqlite/migrations/0038_running_plan_lifecycle_receipts.ts",
  "src/platform/sqlite/migrations/0039_running_session_slot_membership.ts",
  "src/platform/sqlite/migrations/0040_schedule_collision_outcomes.ts",
  "src/platform/sqlite/migrations/0041_phase17_fixture_cleanup.ts",
  "src/platform/sqlite/migrations/0042_custom_exercise_mutation_receipts.ts",
  "src/platform/sqlite/migrations/0043_imported_activity_revision_reviews.ts",
  "src/platform/sqlite/migrations/0044_garmin_sync_summary.ts",
  "src/platform/sqlite/migrations/0045_recommendation_decision_receipts.ts",
  "src/platform/sqlite/migrations/0046_logical_backup_receipts.ts",
  "src/platform/sqlite/migrations/0047_plan_exercise_replacement_receipts.ts",
  "src/platform/sqlite/migrations/index.ts",
  "src/platform/sqlite/recoveryBackup.ts",
  "src/platform/sqlite/repositories/advancedTimingRepository.ts",
  "src/platform/sqlite/repositories/automaticBackupStateRepository.ts",
  "src/platform/sqlite/repositories/automaticSnapshotCapture.ts",
  "src/platform/sqlite/repositories/bodyweightRepository.ts",
  "src/platform/sqlite/repositories/contentRepository.ts",
  "src/platform/sqlite/repositories/csvExportRepository.ts",
  "src/platform/sqlite/repositories/customExerciseRepository.ts",
  "src/platform/sqlite/repositories/exerciseSearchIndexRepository.ts",
  "src/platform/sqlite/repositories/garminSyncSummaryRepository.ts",
  "src/platform/sqlite/repositories/historyCommandRepository.ts",
  "src/platform/sqlite/repositories/historyProjectionRepository.ts",
  "src/platform/sqlite/repositories/historyRepository.ts",
  "src/platform/sqlite/repositories/importedActivityRepository.ts",
  "src/platform/sqlite/repositories/libraryPlanDeletionRepository.ts",
  "src/platform/sqlite/repositories/librarySearchRepository.ts",
  "src/platform/sqlite/repositories/logicalBackupRepository.ts",
  "src/platform/sqlite/repositories/logicalMergeRepository.ts",
  "src/platform/sqlite/repositories/logicalRestoreRepository.ts",
  "src/platform/sqlite/repositories/metricRepository.ts",
  "src/platform/sqlite/repositories/ownedPlanRepository.ts",
  "src/platform/sqlite/repositories/planImpactRepository.ts",
  "src/platform/sqlite/repositories/plansWorkoutRepository.ts",
  "src/platform/sqlite/repositories/progressRepository.ts",
  "src/platform/sqlite/repositories/restRepository.ts",
  "src/platform/sqlite/repositories/restorePreflightAdapters.ts",
  "src/platform/sqlite/repositories/restoreReconciliationRepository.ts",
  "src/platform/sqlite/repositories/runningActivityMatchRepository.ts",
  "src/platform/sqlite/repositories/runningPlanRepository.ts",
  "src/platform/sqlite/repositories/scheduleCollisionRepository.ts",
  "src/platform/sqlite/repositories/scheduleRepository.ts",
  "src/platform/sqlite/repositories/starterPlanRepository.ts",
  "src/platform/sqlite/repositories/strengthOccurrenceSnapshot.ts",
  "src/platform/sqlite/repositories/trainingCalendarRepository.ts",
  "src/platform/sqlite/repositories/workoutOutcomeRepository.ts",
  "src/platform/sqlite/repositories/workoutPreferenceRepository.ts",
  "src/platform/sqlite/repositories/workoutRepository.ts",
  "src/platform/sqlite/serializedWriter.ts",
  "src/platform/sqlite/sqliteKernel.ts",
  "src/testing/contracts/contractProgress.ts",
  "src/testing/contracts/garminImport.contract.ts",
  "src/testing/contracts/googleDriveBackup.contract.ts",
  "src/testing/contracts/migrationsEffects.contract.ts",
  "src/testing/contracts/multiPlanRunning.contract.ts",
  "src/testing/contracts/package.json",
  "src/testing/contracts/phase14Shell.contract.ts",
  "src/testing/contracts/phase15Workout.contract.ts",
  "src/testing/contracts/phase17LibraryRunning.contract.ts",
  "src/testing/contracts/phase2Content.contract.ts",
  "src/testing/contracts/portableMerge.contract.ts",
  "src/testing/contracts/progressNativeDiagnostics.ts",
  "src/testing/contracts/progressParity.contract.ts",
  "src/testing/contracts/sqliteKernel.contract.ts",
  "src/testing/contracts/v12Acceptance.contract.ts",
  "src/testing/package.json",
  "src/testing/phase14FontProof.ts",
  "src/testing/phase14RecoveryFixture.ts",
  "src/testing/phase20CalendarFixture.ts",
  "src/testing/phase20QualityWorkload.ts",
  "src/testing/phase20VisualContext.tsx",
  "src/testing/phase20VisualRequest.ts",
  "src/testing/phase20VisualStateRegistry.generated.ts",
  "src/testing/phase20VisualStateRegistry.json",
  "src/testing/phase20VisualStateRegistry.ts",
  "src/testing/v12NativeAcceptanceAuthorityReaders.ts",
  "src/testing/v12NativeAcceptanceCompletionWriteback.ts",
  "src/testing/v12NativeAcceptanceExecutor.ts",
  "src/testing/v12NativeAcceptanceProductRegistry.ts",
  "src/ui/calendar/CalendarDisclosureChevron.tsx",
  "src/ui/calendar/calendarPorts.ts",
  "src/ui/components/ActionLabel.tsx",
  "src/ui/components/AndroidEscapeBoundary.tsx",
  "src/ui/components/BottomSheet.tsx",
  "src/ui/components/CalendarField.tsx",
  "src/ui/components/ConfirmationDialog.tsx",
  "src/ui/components/ImpactPreview.tsx",
  "src/ui/components/M3FilterChip.tsx",
  "src/ui/components/M3SearchField.tsx",
  "src/ui/components/NavigationRow.tsx",
  "src/ui/components/PlanEditorFields.tsx",
  "src/ui/components/PlanRow.tsx",
  "src/ui/components/RestAlertSettingsSheet.tsx",
  "src/ui/components/ScheduleBindingEditor.tsx",
  "src/ui/components/SemanticNumberField.tsx",
  "src/ui/components/TimeDurationField.tsx",
  "src/ui/components/WorkoutSessionPresentation.tsx",
  "src/ui/components/WorkoutSetFactsRow.tsx",
  "src/ui/components/bottomSheetFocus.ts",
  "src/ui/components/focusVisibility.ts",
  "src/ui/components/index.ts",
  "src/ui/components/tabLabelFit.ts",
  "src/ui/shell/rootFocus.ts",
  "src/ui/theme/index.ts",
  "src/ui/time/useDeviceTimeZone.ts",
  "tsconfig.json",
]);
export const DEPENDENCY_PACKAGES = Object.freeze([
  "@babel/parser", "@bcoe/v8-coverage", "v8-to-istanbul",
  "istanbul-lib-coverage", "pngjs", "typescript",
]);
const require = createRequire(import.meta.url);
export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
export const jsonSha256 = value => sha256(Buffer.from(JSON.stringify(value)));
export const protectedPath = value => typeof value !== "string"
  || value.split(/[\\/]/u).some(component => component === ".coverage" || component === "untitled-2.md");
export function assertNoProtectedPath(...values) {
  assert.ok(values.every(value => !protectedPath(value)), "quality_protected_path_forbidden");
}
export const safeProjectPath = value => typeof value === "string" && value.length > 0
  && !protectedPath(value) && !path.posix.isAbsolute(value) && !value.includes("\\")
  && value.split("/").every(part => part && part !== "." && part !== "..");
function regular(root, relative) {
  assertNoProtectedPath(root, relative);
  assert.ok(safeProjectPath(relative), "quality_input_path_invalid");
  let cursor = root;
  for (const part of relative.split("/")) {
    cursor = path.join(cursor, part);
    assert.equal(fs.lstatSync(cursor).isSymbolicLink(), false, "quality_input_symlink");
  }
  assert.ok(fs.lstatSync(cursor).isFile(), "quality_input_not_regular");
  return cursor;
}
export function relativeDescriptor(project, file) {
  assertNoProtectedPath(project, file);
  const relative = path.relative(project, file).split(path.sep).join("/");
  assert.ok(safeProjectPath(relative), "quality_descriptor_outside_project");
  return { path: relative, sha256: sha256(fs.readFileSync(regular(project, relative))) };
}
function storeBytes(output, bytes) {
  assertNoProtectedPath(output);
  const hash = sha256(bytes), directory = path.join(output, "content-addressed-inputs");
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${hash}.blob`);
  if (!fs.existsSync(file)) fs.writeFileSync(file, bytes, { flag: "wx" });
  assert.equal(sha256(fs.readFileSync(file)), hash, "quality_snapshot_hash_collision");
  return { sha256: hash, snapshot: file };
}
export function captureFile(project, output, relative) {
  assertNoProtectedPath(project, output, relative);
  const file = regular(project, relative), bytes = fs.readFileSync(file), stored = storeBytes(output, bytes);
  return { path: relative, sha256: stored.sha256, bytes: bytes.length, mode: fs.lstatSync(file).mode,
    snapshot: path.relative(project, stored.snapshot).split(path.sep).join("/") };
}
export function captureExecutable(project, output, executable) {
  assertNoProtectedPath(project, output, executable);
  const real = fs.realpathSync(executable);
  assertNoProtectedPath(real);
  assert.ok(fs.lstatSync(real).isFile(), "quality_tool_not_regular");
  const bytes = fs.readFileSync(real), stored = storeBytes(output, bytes);
  return { path: executable, realpath: real, sha256: stored.sha256, bytes: bytes.length, mode: fs.lstatSync(real).mode,
    snapshot: path.relative(project, stored.snapshot).split(path.sep).join("/") };
}
export function projectInputClosure(project) {
  assertNoProtectedPath(project);
  const parser = require("@babel/parser");
  const runtimeRoots = [...QUALITY_TESTS, QUALITY_SUBJECT, QUALITY_BOOTSTRAP, QUALITY_PRODUCER, QUALITY_DERIVE,
    "scripts/testing/closeout-last-two-proof-fixture.mjs",
    "scripts/testing/v12-production-launcher/controlled-device-tool.mjs",
    "scripts/v12-native-adapter.mjs", "scripts/v12-production-native-adapter-launcher.mjs",
    "scripts/v12-production-native-runtime.mjs", "scripts/v12-native-execution-origin.mjs"];
  const seen = new Set();
  // Every declared copied/source-data path keeps its exact opaque byte authority.
  // A .mjs suffix alone does not claim that the quality runtime executes it.
  for (const relative of [...EXPLICIT_PROJECT_INPUTS, ...runtimeRoots, QUALITY_TOOL_DATA]) {
    regular(project, relative); seen.add(relative);
  }
  for (const name of fs.readdirSync(project)) if (/^(?:jest[^/]*|tsconfig[^/]*)\.(?:js|json|cjs)$/u.test(name)) {
    assertNoProtectedPath(name); regular(project, name); seen.add(name);
  }
  const pending = [...runtimeRoots], runtime = new Set(), importEdges = [];
  while (pending.length > 0) {
    const relative = pending.pop();
    if (runtime.has(relative)) continue;
    const file = regular(project, relative); seen.add(relative); runtime.add(relative);
    // Source/config/package bytes are opaque. Only actual code gets syntax and
    // import inspection; no recursive JSON-descriptor discovery is performed.
    if (!/\.[cm]?[jt]sx?$/u.test(relative)) continue;
    const code = fs.readFileSync(file, "utf8");
    const ast = parser.parse(code, { sourceType: "unambiguous",
      plugins: relative.endsWith(".ts") ? ["typescript"] : ["typescript", "jsx"] });
    const walk = node => {
      if (!node || typeof node !== "object") return;
      let reference;
      if (["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration"].includes(node.type)) reference = node.source?.value;
      if (node.type === "CallExpression" && ["require", "Import"].includes(node.callee?.name ?? node.callee?.type)) reference = node.arguments[0]?.value;
      if (node.type === "CallExpression" && node.callee?.type === "MemberExpression"
        && ["mock", "requireActual", "requireMock", "resolve"].includes(node.callee.property?.name)) reference = node.arguments[0]?.value;
      if (node.type === "NewExpression" && node.callee?.name === "URL") reference = node.arguments[0]?.value;
      if (typeof reference === "string" && reference.startsWith(".")) {
        assertNoProtectedPath(reference);
        const base = path.posix.normalize(path.posix.join(path.posix.dirname(relative), reference)).replace(/\/$/u, "");
        assert.ok(base === "." || safeProjectPath(base), "quality_import_outside_project");
        const full = path.join(project, base);
        if (node.type === "NewExpression" && fs.existsSync(full) && fs.statSync(full).isDirectory()) {
          importEdges.push([relative, reference, base === "." ? "/" : base + "/"]);
        } else {
          const choices = [base, ...[".ts", ".tsx", ".js", ".mjs", ".cjs", ".json"].map(extension => base + extension),
            path.posix.join(base, "index.ts"), path.posix.join(base, "index.tsx"), path.posix.join(base, "index.js")];
          const resolved = choices.find(candidate => fs.existsSync(path.join(project, candidate)) && fs.statSync(path.join(project, candidate)).isFile());
          assert.ok(resolved, `quality_unresolved_relative_import:${relative}:${reference}`);
          importEdges.push([relative, reference, resolved]); pending.push(resolved);
        }
      }
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach(walk);
        else if (value && typeof value === "object") walk(value);
      }
    };
    walk(ast);
  }
  const inspectCopiedDirectory = directory => {
    assertNoProtectedPath(project, directory);
    for (const entry of fs.readdirSync(path.join(project, directory), { withFileTypes: true })) {
      const relative = path.posix.join(directory, entry.name);
      assertNoProtectedPath(relative);
      if (entry.isDirectory()) inspectCopiedDirectory(relative);
      else if (entry.isFile()) assert.ok(seen.has(relative), `quality_actual_copied_input_not_declared:${relative}`);
      else assert.fail(`quality_copied_source_symlink_or_special:${relative}`);
    }
  };
  // These are the exact directories copied by the existing public fixture;
  // they are not an unbounded namespace or workspace scan.
  inspectCopiedDirectory("scripts");
  inspectCopiedDirectory(".planning/design/v1.2-browser-evidence");
  const files = [...seen].sort();
  return { files, import_edges: importEdges, runtime_roots: runtimeRoots,
    runtime_files: [...runtime].sort(), outer_copied_source_data_files: files.filter(file => !runtime.has(file)),
    role_partition: files.map(file => ({ path: file, role: runtime.has(file) ? "runtime_role" : "outer_copied_source_data" })) };
}
function installedDependencies(project, output) {
  assertNoProtectedPath(project, output);
  const rows = [], visited = new Set();
  const scanPackage = (name, resolver = require) => {
    assertNoProtectedPath(name);
    let directory;
    try {
      const entry = resolver.resolve(name);
      assertNoProtectedPath(entry);
      directory = path.dirname(entry);
      while (!fs.existsSync(path.join(directory, "package.json"))) {
        const parent = path.dirname(directory); assert.notEqual(parent, directory); directory = parent;
      }
    } catch (error) {
      directory = path.join(project, "node_modules", name);
      if (!fs.existsSync(path.join(directory, "package.json"))) throw error;
    }
    assertNoProtectedPath(directory);
    directory = fs.realpathSync(directory); assertNoProtectedPath(directory);
    if (visited.has(directory)) return; visited.add(directory);
    const packageBytes = fs.readFileSync(path.join(directory, "package.json"));
    // Installed package metadata is read only to locate declared dependencies;
    // it never becomes a recursively interpreted evidence JSON document.
    const manifest = JSON.parse(packageBytes.toString("utf8"));
    const walk = folder => {
      assertNoProtectedPath(folder);
      for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
        const file = path.join(folder, entry.name), logical = path.relative(project, file).split(path.sep).join("/");
        assertNoProtectedPath(file, logical);
        assert.ok(safeProjectPath(logical), "quality_dependency_outside_project");
        if (entry.isDirectory() && entry.name !== "node_modules") walk(file);
        else if (entry.isFile()) rows.push(captureFile(project, output, logical));
        else if (entry.isSymbolicLink()) {
          const target = fs.readlinkSync(file); assertNoProtectedPath(target);
          const real = fs.realpathSync(file); assertNoProtectedPath(real);
          const bytes = fs.readFileSync(real), stored = storeBytes(output, bytes);
          rows.push({ path: logical, kind: "symlink", target: fs.readlinkSync(file), sha256: stored.sha256,
            bytes: bytes.length, mode: fs.lstatSync(file).mode, realpath: real,
            snapshot: path.relative(project, stored.snapshot).split(path.sep).join("/") });
        }
      }
    };
    walk(directory);
    const packageResolver = createRequire(path.join(directory, "package.json"));
    for (const dependency of Object.keys(manifest.dependencies ?? {})) scanPackage(dependency, packageResolver);
  };
  DEPENDENCY_PACKAGES.forEach(name => scanPackage(name));
  return rows.sort((a, b) => a.path.localeCompare(b.path));
}
export function writeOwnedJson(project, output, name, value) {
  assertNoProtectedPath(project, output, name);
  assert.ok(safeProjectPath(name) && !name.includes("/"), "quality_output_name_invalid");
  const file = path.join(output, name);
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
  return relativeDescriptor(project, file);
}
export function captureInputs({ project, output, environment, contextHead, label }) {
  assertNoProtectedPath(project, output);
  const started = new Date().toISOString(), closure = projectInputClosure(project);
  const projectInputs = closure.files.map(file => captureFile(project, output, file));
  const dependencies = installedDependencies(project, output);
  const toolData = captureFile(project, output, QUALITY_TOOL_DATA);
  const fixed = JSON.parse(fs.readFileSync(regular(project, QUALITY_TOOL_DATA), "utf8"));
  assert.deepEqual(Object.keys(fixed).sort(), ["java_home", "node_bin", "npm_bin", "sdk"]);
  assert.ok(Object.values(fixed).every(value => typeof value === "string" && path.isAbsolute(value)), "quality_fixed_tool_configuration_invalid");
  assertNoProtectedPath(...Object.values(fixed));
  assert.equal(path.join(fixed.node_bin, "node"), QUALITY_NODE);
  const tools = [QUALITY_NODE, "/usr/bin/git", "/bin/sh", path.join(fixed.java_home, "bin/java")]
    .map(executable => captureExecutable(project, output, executable));
  return { schema_version: 1, label, captured_at: new Date().toISOString(), capture_started_at: started,
    execution_context_head: contextHead, project_inputs: projectInputs,
    source_inputs: projectInputs.map(({ path: inputPath, sha256: digest }) => ({ path: inputPath, sha256: digest })),
    project_input_sha256: jsonSha256(projectInputs), import_edges: closure.import_edges,
    runtime_roots: closure.runtime_roots, runtime_files: closure.runtime_files,
    outer_copied_source_data_files: closure.outer_copied_source_data_files, input_roles: closure.role_partition,
    installed_dependencies: dependencies, installed_dependency_sha256: jsonSha256(dependencies),
    node: tools[0], node_version: process.version, platform: process.platform, architecture: process.arch,
    tools, fixed_tool_data: toolData,
    environment: { ...environment }, environment_sha256: jsonSha256(environment), native_acceptance: false };
}
export function comparableCapture(value) {
  return { project_inputs: value.project_inputs, installed_dependencies: value.installed_dependencies,
    runtime_roots: value.runtime_roots, runtime_files: value.runtime_files,
    outer_copied_source_data_files: value.outer_copied_source_data_files, input_roles: value.input_roles,
    node: value.node, node_version: value.node_version, platform: value.platform, architecture: value.architecture,
    tools: value.tools, fixed_tool_data: value.fixed_tool_data, environment: value.environment };
}
export function assertFrozenTests(project) {
  QUALITY_TESTS.forEach((file, index) => assert.equal(sha256(fs.readFileSync(regular(project, file))), QUALITY_TEST_HASHES[index], "quality107_test_source_changed"));
  assert.equal(sha256(fs.readFileSync(regular(project, "scripts/v12-production-native-quality-actions.test.mjs"))),
    "e99d85c88c048e1dd93d770682fd842500e05ab24110041ce27057f2845b2266", "quality77_original_test_changed");
}
function bootstrapObservation() {
  const output = process.env.CLOSEOUT_QUALITY_CURRENT_RUN_DIRECTORY;
  if (output === undefined) return;
  assertNoProtectedPath(process.cwd(), output, fileURLToPath(import.meta.url));
  const project = fs.realpathSync(process.cwd()), base = fs.realpathSync(output);
  assert.ok(base.startsWith(path.resolve(project, "artifacts/native/personal-closeout-20261027") + path.sep), "quality_run_namespace_invalid");
  const self = fileURLToPath(import.meta.url);
  assert.equal(self, regular(project, QUALITY_BOOTSTRAP), "quality_bootstrap_relocated");
  const contextHead = process.env.CLOSEOUT_QUALITY_CURRENT_CONTEXT_HEAD;
  assert.match(contextHead ?? "", /^[a-f0-9]{40}$/u);
  const phase = process.env.NODE_TEST_CONTEXT === undefined ? "node-test-runner" : "node-test-worker";
  const before = { schema_version: 1, phase, pid: process.pid, parent_pid: process.ppid,
    observed_at: new Date().toISOString(), argv: [...process.argv], exec_argv: [...process.execArgv],
    environment: { ...process.env },
    bootstrap: captureFile(project, base, QUALITY_BOOTSTRAP), node: captureExecutable(project, base, process.execPath),
    node_version: process.version, platform: process.platform, architecture: process.arch,
    subject_url: pathToFileURL(regular(project, QUALITY_SUBJECT)).href, subject: captureFile(project, base, QUALITY_SUBJECT),
    native_acceptance: false };
  writeOwnedJson(project, base, `process-${process.pid}-before.json`, before);
  process.once("exit", exitCode => {
    const after = { ...before, observed_at: new Date().toISOString(), exit_code: exitCode,
      environment: { ...process.env },
      bootstrap: captureFile(project, base, QUALITY_BOOTSTRAP), node: captureExecutable(project, base, process.execPath),
      subject: captureFile(project, base, QUALITY_SUBJECT) };
    assert.deepEqual(after.bootstrap, before.bootstrap, "quality_bootstrap_changed");
    assert.deepEqual(after.node, before.node, "quality_node_changed");
    assert.deepEqual(after.subject, before.subject, "quality_subject_changed");
    writeOwnedJson(project, base, `process-${process.pid}-after.json`, after);
  });
}

// The bootstrap observes actual process lifetime only. It never patches spawn,
// evaluates private subject code, or adds a second fixture wrapper.
bootstrapObservation();

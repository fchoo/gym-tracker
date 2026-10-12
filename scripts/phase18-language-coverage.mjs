import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

const HASH = /^[a-f0-9]{64}$/u;

export const PHASE18_LANGUAGE_COVERAGE_SPECS = Object.freeze({
  python: Object.freeze({
    language: "python",
    suite: "phase18-garmin-python",
    reportPath: "coverage/phase18/python-coverage.json",
    sourcePaths: Object.freeze([
      "modules/garmin-connect/android/src/main/python/garmin_bridge.py",
    ]),
    testPath: "modules/garmin-connect/android/src/test/python/test_garmin_bridge.py",
    // Python must report real line and branch coverage from coverage.py.
    // coverage.py is mandatory: a missing dependency hard-fails and no
    // coverage report may be written.
    metrics: Object.freeze(["lines", "branches"]),
    requiredCases: Object.freeze([
      "test_account_namespace_is_locally_generated_and_survives_profile_rename",
      "test_login_mfa_and_reads_use_only_the_fixed_operations",
      "test_unknown_operations_and_malformed_inputs_never_reach_the_client",
      "test_restore_rotation_and_logout_keep_tokens_out_of_dispatch_results",
      "test_force_refresh_rotates_the_persistable_record_without_exposing_tokens",
      "test_authentication_and_restore_failures_are_context_specific",
      "test_read_failures_are_distinct_bounded_and_single_attempt",
      "test_malformed_or_forbidden_provider_json_is_rejected_without_echo",
      "test_bounded_helpers_and_default_factory_cover_rejection_edges",
      "test_session_state_and_auth_validation_fail_closed",
      "test_activity_refresh_and_adversarial_branches_are_bounded",
      "test_module_entrypoints_and_retry_headers_fail_closed",
    ]),
  }),
  kotlin: Object.freeze({
    language: "kotlin",
    suite: "phase18-garmin-kotlin",
    reportPath: "coverage/phase18/kotlin-coverage.json",
    sourcePaths: Object.freeze([
      "modules/garmin-connect/android/src/main/java/expo/modules/garminconnect/GarminClientWorker.kt",
      "modules/garmin-connect/android/src/main/java/expo/modules/garminconnect/GarminTokenStore.kt",
    ]),
    testPath: "modules/garmin-connect/android/src/test/java/expo/modules/garminconnect/GarminTokenStoreTest.kt",
    // JaCoCo reports LINE and BRANCH counters, so Kotlin carries a true branch
    // coverage oracle in addition to line coverage.
    metrics: Object.freeze(["lines", "branches"]),
    requiredCases: Object.freeze([
      "encrypted record round trips without plaintext and declares Android Keystore",
      "corrupt and unsupported records fail closed without exposing record bytes",
      "failed verified rotation leaves the prior record readable",
      "clear removes only the encrypted session record",
      "worker persists login and refresh rotations then clears them on fenced logout",
      "failed durable deletion keeps the live worker session connected",
      "worker injects decrypted bytes only into restore and persists the verified rotation",
      "explicit refresh proves the encrypted session record rotated",
      "worker strips unsafe errors and rejects unsafe success payloads",
      "token store rejects every malformed bound and reports current record identity",
      "worker validates MFA restore read and argument boundaries",
      "worker rejects stale generations and sanitizes every result shape",
      "worker wipes pending tokens after persistence failures and tolerates logout errors",
    ]),
  }),
});

function fail(reason) {
  throw new Error(`phase18_language_coverage_invalid:${reason}`);
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function validCounter(counter) {
  if (counter === null || typeof counter !== "object" || Array.isArray(counter)) return false;
  const { covered, missed, percent, total } = counter;
  return Number.isSafeInteger(covered)
    && covered > 0
    && Number.isSafeInteger(missed)
    && missed >= 0
    && Number.isSafeInteger(total)
    && total === covered + missed
    && missed === 0
    && typeof percent === "number"
    && Number.isFinite(percent)
    && percent === 100;
}

export function validatePhase18LanguageCoverageReport(report, spec, readBytes = readFileSync) {
  if (report === null || typeof report !== "object" || Array.isArray(report)
    || report.schema_version !== 1
    || report.suite !== spec.suite
    || report.status !== "passed"
    || report.runtime === null
    || typeof report.runtime !== "object"
    || report.runtime.name !== spec.language
    || typeof report.runtime.version !== "string"
    || report.runtime.version.length < 1
    || report.failures !== 0
    || report.errors !== 0
    || report.skipped !== 0
    || !Number.isSafeInteger(report.tests_run)
    || report.tests_run < spec.requiredCases.length
    || !Array.isArray(report.sources)
    || !Array.isArray(report.required_cases)
    || !Array.isArray(report.executed_cases)
    || !isDeepStrictEqual(report.required_cases, [...spec.requiredCases])
    || spec.requiredCases.some((caseName) => !report.executed_cases.includes(caseName))
    || !Array.isArray(spec.metrics)
    || spec.metrics.length < 1
    || spec.metrics.some((metric) => !validCounter(report.coverage?.[metric]))) {
    fail(spec.language);
  }
  const expectedSources = spec.sourcePaths.map((sourcePath) => ({
    path: sourcePath,
    sha256: digest(readBytes(sourcePath)),
  }));
  if (!isDeepStrictEqual(report.sources, expectedSources)
    || report.test?.path !== spec.testPath
    || !HASH.test(report.test?.sha256 ?? "")
    || report.test.sha256 !== digest(readBytes(spec.testPath))) {
    fail(`${spec.language}:identity`);
  }
  return true;
}

export function loadPhase18LanguageCoverageReports({
  projectRoot = process.cwd(),
  readBytes = (relativePath) => readFileSync(path.join(projectRoot, relativePath)),
  readJson = (reportPath) => JSON.parse(readFileSync(reportPath, "utf8")),
} = {}) {
  const reports = {};
  for (const [language, spec] of Object.entries(PHASE18_LANGUAGE_COVERAGE_SPECS)) {
    const reportPath = path.join(projectRoot, spec.reportPath);
    let report;
    try {
      report = readJson(reportPath);
    } catch {
      throw new Error(`phase18_language_coverage_missing:${language}`);
    }
    validatePhase18LanguageCoverageReport(report, spec, readBytes);
    reports[language] = report;
  }
  return Object.freeze(reports);
}

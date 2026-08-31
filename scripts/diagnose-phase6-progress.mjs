const CANDIDATE_PACKAGE = "com.fchoo.gymtracker";
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

const CANDIDATE_FIELDS = Object.freeze([
  "candidatePackage",
  "candidateApkSha256",
  "installedPackage",
  "installedApkSha256",
]);

const OBSERVED_FIELDS = Object.freeze([
  "readStage",
  "branch",
  "errorClass",
  "errorCode",
  "freshness",
  "recoverability",
]);

const OBSERVED_SIGNATURE = Object.freeze({
  readStage: "progress_repository_load",
  branch: "current_baseline_runtime_capability",
  errorClass: "TypeError",
  errorCode: "runtime_array_to_sorted_unavailable",
  freshness: "not_returned",
  recoverability: "requires_candidate_compatible_runtime",
});

function fail(message) {
  throw new Error(`Phase 6 Progress diagnostic: ${message}`);
}

function requireExactFields(value, fields) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail("diagnostic input must be an object");
  }
  const keys = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (
    keys.length !== expected.length
    || keys.some((key, index) => key !== expected[index])
  ) {
    fail("diagnostic input contains unallowlisted fields");
  }
}

function requireSha256(value) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    fail("candidate identity is invalid");
  }
}

function requireCandidateIdentity(candidate) {
  requireExactFields(candidate, CANDIDATE_FIELDS);
  if (
    candidate.candidatePackage !== CANDIDATE_PACKAGE
    || candidate.installedPackage !== CANDIDATE_PACKAGE
  ) {
    fail("candidate identity does not match");
  }
  requireSha256(candidate.candidateApkSha256);
  requireSha256(candidate.installedApkSha256);
  if (candidate.candidateApkSha256 !== candidate.installedApkSha256) {
    fail("candidate identity does not match");
  }
}

function requireObservedSignature(observed) {
  requireExactFields(observed, OBSERVED_FIELDS);
  for (const field of OBSERVED_FIELDS) {
    if (observed[field] !== OBSERVED_SIGNATURE[field]) {
      fail("diagnostic signature is not the observed Progress branch");
    }
  }
}

export function createPhase6ProgressDiagnosis({ candidate, observed }) {
  requireCandidateIdentity(candidate);
  requireObservedSignature(observed);
  return Object.freeze({
    read_stage: observed.readStage,
    branch: observed.branch,
    error_class: observed.errorClass,
    error_code: observed.errorCode,
    freshness: observed.freshness,
    recoverability: observed.recoverability,
  });
}

function parseArguments(argumentsList) {
  const expected = new Map([
    ["--candidate-package", "candidatePackage"],
    ["--candidate-apk-sha256", "candidateApkSha256"],
    ["--installed-package", "installedPackage"],
    ["--installed-apk-sha256", "installedApkSha256"],
  ]);
  const candidate = {};
  for (let index = 0; index < argumentsList.length; index += 2) {
    const flag = argumentsList[index];
    const field = expected.get(flag);
    const value = argumentsList[index + 1];
    if (field === undefined || value === undefined || field in candidate) {
      fail("candidate identity arguments are invalid");
    }
    candidate[field] = value;
  }
  if (argumentsList.length !== expected.size * 2) {
    fail("candidate identity arguments are incomplete");
  }
  return candidate;
}

export function runPhase6ProgressDiagnostic(argumentsList) {
  return createPhase6ProgressDiagnosis({
    candidate: parseArguments(argumentsList),
    observed: OBSERVED_SIGNATURE,
  });
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  process.stdout.write(`${JSON.stringify(runPhase6ProgressDiagnostic(process.argv.slice(2)))}\n`);
}

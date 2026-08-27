function requirePattern(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

const RUN_ID = /^[1-9][0-9]*$/u;
const CANDIDATE_ID = /^[a-z0-9][a-z0-9-]{2,79}$/u;
const COMMIT = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const ARTIFACT = /^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/u;
const RELEASE_TAG = /^v[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/u;

export function validateReleasePromotionInputValues(input) {
  if (!RUN_ID.test(input?.candidateRunId ?? "")
    || !RUN_ID.test(input?.attendedRunId ?? "")
    || input.candidateRunId === input.attendedRunId
    || !CANDIDATE_ID.test(input?.candidateId ?? "")
    || !COMMIT.test(input?.candidateCommit ?? "")
    || !ARTIFACT.test(input?.attendedArtifactName ?? "")
    || !SHA256.test(input?.attendedRecordSha256 ?? "")
    || !RELEASE_TAG.test(input?.releaseTag ?? "")) {
    throw new Error("release promotion input or release tag is invalid.");
  }
}

export function validatePromotionWorkflowContract(source) {
  requirePattern(source, /concurrency:[\s\S]*group:\s*release-promotion\s*$[\s\S]*cancel-in-progress:\s*false/mu,
    "promotion must use one non-canceling repository-wide lock.");
  requirePattern(source, /permissions:[\s\S]*actions:\s*read[\s\S]*contents:\s*write/iu,
    "promotion requires actions:read and contents:write.");
  for (const input of [
    "candidate_run_id", "candidate_id", "candidate_commit",
    "attended_run_id", "attended_artifact_name", "attended_record_sha256",
    "release_tag",
  ]) {
    requirePattern(source, new RegExp(`${input}:`, "u"), `promotion input is missing: ${input}`);
  }
  requirePattern(source, /CANDIDATE_RUN_ID:\s*\$\{\{ inputs\.candidate_run_id \}\}[\s\S]*actions\/runs\/\$\{CANDIDATE_RUN_ID\}/u,
    "promotion must inspect the explicitly selected candidate run.");
  if ((source.match(/\.conclusion\s*==\s*\\?"success\\?"/gu) ?? []).length !== 2) {
    throw new Error("promotion must reject candidate or attended runs that were not successful.");
  }
  requirePattern(source, /CANDIDATE_COMMIT:\s*\$\{\{ inputs\.candidate_commit \}\}[\s\S]*head_sha[^\n]+\$commit/iu,
    "promotion must bind the candidate run to the selected commit.");
  requirePattern(source, /gh run download[\s\S]*candidate_run_id[\s\S]*private-release-candidate/iu,
    "promotion must download the exact successful candidate artifact.");
  requirePattern(source, /gh run download[\s\S]*attended_run_id[\s\S]*attended_artifact_name/iu,
    "promotion must download immutable attended evidence.");
  requirePattern(source, /release-candidate\.yml/iu,
    "promotion must pin the candidate workflow identity.");
  requirePattern(source, /release-attended-evidence\.yml/iu,
    "promotion must pin the attended workflow identity.");
  requirePattern(source, /private-release-candidate[\s\S]*private-release-attended/iu,
    "promotion must pin the protected candidate and attended environments.");
  requirePattern(source, /checkout@[\s\S]*ref:\s*\$\{\{ env\.CANDIDATE_COMMIT \}\}/u,
    "promotion must checkout the exact candidate source.");
  requirePattern(source, /verify:attended:phase5/iu,
    "promotion must run the complete attended preflight.");
  requirePattern(source, /gh release view[^\n]+(?:&&|then)\s*exit 1/iu,
    "promotion must reject an existing tag instead of overwriting it.");
  requirePattern(source, /candidate_run_id=[^\n]+[\s\S]*reused/iu,
    "promotion must reject a candidate run already used by a release.");
  requirePattern(source, /gh release create/iu,
    "promotion must create a new release only after the no-overwrite check.");
  requirePattern(source, /gh release create[\s\S]*?^\s*--draft\s*$/imu,
    "promotion must stage the release as a draft until public hashes pass.");
  requirePattern(source, /gh release edit[\s\S]*--draft=false/iu,
    "promotion must publish only after public asset verification.");
  if (/--clobber/iu.test(source)) {
    throw new Error("promotion cannot overwrite existing public assets.");
  }
  requirePattern(source, /sha256sum --check/iu,
    "promotion must verify public asset hashes after upload.");
  requirePattern(source, /record-phase5-promotion-proof\.mjs[\s\S]*promotion-proof\.json/iu,
    "promotion must record post-publication proof.");
  requirePattern(source, /upload-artifact[\s\S]*promotion-proof-/iu,
    "promotion must retain immutable post-publication proof.");
  requirePattern(source, /record-phase5-promotion-proof\.mjs[\s\S]*promotion-proof\.json/iu,
    "promotion must create immutable post-publication proof.");
  requirePattern(source, /upload-artifact[\s\S]*promotion-proof-/iu,
    "promotion must upload immutable post-publication proof.");
  if (/(?:expo\s+(?:prebuild|run)|gradlew|assembleRelease|bundleRelease|eas\s+build)/iu.test(source)) {
    throw new Error("promotion cannot build candidate bytes.");
  }
  if ((source.match(/record-phase5-promotion-proof\.mjs/gu) ?? []).length !== 1
    || (source.match(/name:\s*promotion-proof-\$\{\{ github\.run_id \}\}/gu) ?? []).length !== 1) {
    throw new Error("promotion proof record/upload must be unique.");
  }
  const validatorCheckout = source.indexOf("name: Check out workflow source for input validation");
  const validator = source.indexOf("node workflow-source/scripts/validate-phase5-promotion-inputs.mjs");
  const exactCheckout = source.indexOf("name: Check out exact candidate source");
  const attendedVerifier = source.indexOf("npm run verify:attended:phase5");
  const publish = source.indexOf("gh release create");
  if (!(validatorCheckout >= 0 && validatorCheckout < validator
    && validator < exactCheckout && exactCheckout < attendedVerifier
    && attendedVerifier < publish)) {
    throw new Error("promotion checkout, validator, verifier, and publish order is unsafe.");
  }
}

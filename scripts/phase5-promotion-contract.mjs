function requirePattern(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

function boundedSourceBlock(source, startMarker, endMarker, label) {
  if (source.split(startMarker).length - 1 !== 1) {
    throw new Error(`${label} must appear exactly once.`);
  }
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (end < 0) throw new Error(`${label} is incomplete.`);
  return source.slice(start, end + endMarker.length);
}

function validateSelectedRunContract(source, {
  runIdVariable, runJsonVariable, runUrlVariable, workflowPath,
  attemptVariable, refVariable, environment,
}) {
  const runUrlAssignment = `${runUrlVariable}="\${GITHUB_SERVER_URL}/\${GITHUB_REPOSITORY}/actions/runs/\${${runIdVariable}}"`;
  if (!source.includes(runUrlAssignment)) {
    throw new Error(`${runJsonVariable} must bind its exact Actions run URL.`);
  }
  const block = boundedSourceBlock(
    source,
    `jq -e --argjson run_id "\${${runIdVariable}}" --arg run_url "\${${runUrlVariable}}"`,
    `<<<"\${${runJsonVariable}}" >/dev/null`,
    `${runJsonVariable} validation`,
  );
  for (const predicate of [
    '.id == $run_id', '.status == "completed"', '.conclusion == "success"',
    '.html_url == $run_url', '.head_sha == $commit', '.head_branch == "main"',
    '.repository.full_name == $repo', '.event == "workflow_dispatch"',
    `.path == "${workflowPath}"`,
  ]) {
    if (!block.includes(predicate)) {
      throw new Error(`${runJsonVariable} provenance is missing ${predicate}.`);
    }
  }
  for (const assignment of [
    `${attemptVariable}=\$(jq -er '.run_attempt | select(type == "number" and . >= 1)' <<<"\${${runJsonVariable}}")`,
    `${refVariable}=\$(jq -er '.head_branch | select(type == "string" and length > 0)' <<<"\${${runJsonVariable}}")`,
  ]) {
    if (!source.includes(assignment.replace('\\$', '$'))) {
      throw new Error(`${runJsonVariable} attempt or ref binding is incomplete.`);
    }
  }
  const call = `verify_deployment_provenance "\${${runIdVariable}}" "\${${attemptVariable}}" "\${CANDIDATE_COMMIT}" "\${${refVariable}}" "${environment}"`;
  if (!source.includes(call)) {
    throw new Error(`${runJsonVariable} protected-environment binding is incomplete.`);
  }
}

function validateSelectedArtifactContract(source, runIdVariable, artifactPagesVariable) {
  const block = boundedSourceBlock(
    source,
    `jq -e --argjson run_id "\${${runIdVariable}}" --arg commit`,
    `<<<"\${${artifactPagesVariable}}" >/dev/null`,
    `${artifactPagesVariable} validation`,
  );
  for (const predicate of [
    '.expired == false', '.workflow_run.id == $run_id',
    '.workflow_run.head_sha == $commit', '| length == 1',
  ]) {
    if (!block.includes(predicate)) {
      throw new Error(`${artifactPagesVariable} provenance is missing ${predicate}.`);
    }
  }
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
  validateSelectedRunContract(source, {
    runIdVariable: "CANDIDATE_RUN_ID", runJsonVariable: "candidate_run",
    runUrlVariable: "candidate_run_url", workflowPath: ".github/workflows/release-candidate.yml",
    attemptVariable: "candidate_run_attempt", refVariable: "candidate_ref",
    environment: "private-release-candidate",
  });
  validateSelectedRunContract(source, {
    runIdVariable: "ATTENDED_RUN_ID", runJsonVariable: "attended_run",
    runUrlVariable: "attended_run_url", workflowPath: ".github/workflows/release-attended-evidence.yml",
    attemptVariable: "attended_run_attempt", refVariable: "attended_ref",
    environment: "private-release-attended",
  });
  validateSelectedArtifactContract(source, "CANDIDATE_RUN_ID", "candidate_artifacts");
  validateSelectedArtifactContract(source, "ATTENDED_RUN_ID", "attended_artifacts");
  requirePattern(source, /concurrency:[\s\S]*group:\s*release-promotion\s*$[\s\S]*cancel-in-progress:\s*false/mu,
    "promotion must use one non-canceling repository-wide lock.");
  requirePattern(source, /permissions:[\s\S]*actions:\s*read[\s\S]*contents:\s*write[\s\S]*deployments:\s*read/iu,
    "promotion requires actions:read, contents:write, and deployments:read.");
  requirePattern(source, /environment:[\s\S]*name:\s*public-release-promotion[\s\S]*url:\s*\$\{\{ github\.server_url \}\}\/\$\{\{ github\.repository \}\}\/actions\/runs\/\$\{\{ github\.run_id \}\}/u,
    "promotion environment must publish its exact Actions run URL.");
  for (const input of [
    "candidate_run_id", "candidate_id", "candidate_commit",
    "attended_run_id", "attended_artifact_name", "attended_record_sha256",
    "release_tag",
  ]) {
    requirePattern(source, new RegExp(`${input}:`, "u"), `promotion input is missing: ${input}`);
  }
  requirePattern(source, /CANDIDATE_RUN_ID:\s*\$\{\{ inputs\.candidate_run_id \}\}[\s\S]*actions\/runs\/\$\{CANDIDATE_RUN_ID\}/u,
    "promotion must inspect the explicitly selected candidate run.");
  if ((source.match(/\.conclusion\s*==\s*\\?"success\\?"/gu) ?? []).length < 2) {
    throw new Error("promotion must reject candidate or attended runs that were not successful.");
  }
  if ((source.match(/\.id == \$run_id and \.status == "completed" and \.conclusion == "success"/gu) ?? []).length < 2) {
    throw new Error("promotion must bind both selected successful runs to their exact run IDs and commit.");
  }
  requirePattern(source, /\.html_url == \$run_url[\s\S]*\.head_sha == \$commit[\s\S]*\.head_branch == "main"/iu,
    "promotion must bind selected runs to their exact URL, commit, and main branch.");
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
  for (const pattern of [
    /set -euo pipefail/u,
    /gh api --method GET --paginate --slurp[\s\S]*\/deployments/iu,
    /\.sha == \$commit[\s\S]*\.ref == \$ref[\s\S]*\.environment == \$environment/iu,
    /\.original_environment == \$environment/iu,
    /\.performed_via_github_app\.slug == "github-actions"/iu,
    /\.statuses_url ==/iu,
    /sort_by\(\[\.created_at, \.id\]\) \| last/iu,
    /\.state == "success"[\s\S]*\.environment_url == \$run_url[\s\S]*\.deployment_url == \$deployment_url/iu,
    /actions\/jobs\/\$\{job_id\}/u,
    /\.run_id == \$run_id[\s\S]*\.run_attempt == \$run_attempt/iu,
    /\.head_sha == \$commit[\s\S]*\.status == "completed"[\s\S]*\.conclusion == "success"[\s\S]*\.html_url == \$html_url/iu,
    /test "\$\{matched\}" -eq 1/u,
    /\.workflow_run\.id == \$run_id[\s\S]*\.workflow_run\.head_sha == \$commit/iu,
  ]) {
    requirePattern(source, pattern, "promotion deployment provenance must bind a successful selected run.");
  }
  if (/actions\/runs\/\$\{[A-Z_]+\}\/jobs|\.jobs\s*\|\s*any\(\.environment\.name/iu.test(source)) {
    throw new Error("promotion cannot infer environment provenance from the jobs list.");
  }
  requirePattern(source, /checkout@[\s\S]*ref:\s*\$\{\{ env\.CANDIDATE_COMMIT \}\}/u,
    "promotion must checkout the exact candidate source.");
  requirePattern(source, /verify:attended:phase5/iu,
    "promotion must run the complete attended preflight.");
  requirePattern(source, /gh release view[^\n]+(?:&&|then)\s*exit 1/iu,
    "promotion must reject an existing tag instead of overwriting it.");
  requirePattern(source, /candidate_run_id=[^\n]+[\s\S]*release_bodies=\$\(gh api --paginate[\s\S]*reused/iu,
    "promotion must reject a candidate run already used by a release.");
  if (/gh api --paginate[^\n]*releases[\s\S]{0,160}\|\s*grep -F/iu.test(source)) {
    throw new Error("promotion must not mask a release API failure in a grep pipeline.");
  }
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

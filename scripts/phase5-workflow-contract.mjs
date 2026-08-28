const BUILD = /(?:build-release-candidate-once|expo\s+prebuild|gradlew|assembleRelease|bundleRelease|eas\s+build)/giu;

function requireInOrder(source, labels) {
  let previous = -1;
  for (const [label, pattern] of labels) {
    const index = source.search(pattern);
    if (index < 0 || index <= previous) {
      throw new Error(`Phase 5 workflow command order is invalid at ${label}.`);
    }
    previous = index;
  }
}

export function validateWorkflowDispatchInputSafety(source) {
  const runBlocks = [...source.matchAll(/^\s*run:\s*\|\s*\n((?:^(?: {8}| {10}| {12}).*\n?)*)/gmu)]
    .map((match) => match[1]);
  if (runBlocks.some((block) => /\$\{\{\s*inputs\./u.test(block))) {
    throw new Error("workflow dispatch input is interpolated directly into shell.");
  }
}

function validateDeploymentProvenanceContract(source) {
  const required = [
    /permissions:[\s\S]*deployments:\s*read/iu,
    /set -euo pipefail/u,
    /verify_deployment_provenance\(\)/u,
    /gh api --method GET --paginate --slurp[\s\S]*\/deployments/iu,
    /\.sha == \$commit[\s\S]*\.ref == \$ref[\s\S]*\.environment == \$environment/iu,
    /\.original_environment == \$environment/iu,
    /\.performed_via_github_app\.slug == "github-actions"/iu,
    /\.statuses_url ==/iu,
    /sort_by\(\[\.created_at, \.id\]\) \| last/iu,
    /\.state == "success"/iu,
    /\.environment_url == \$run_url/iu,
    /\.deployment_url == \$deployment_url/iu,
    /actions\/jobs\/\$\{job_id\}/u,
    /\.run_id == \$run_id[\s\S]*\.run_attempt == \$run_attempt/iu,
    /\.head_sha == \$commit[\s\S]*\.status == "completed"[\s\S]*\.conclusion == "success"[\s\S]*\.html_url == \$html_url/iu,
    /test "\$\{matched\}" -eq 1/u,
    /actions\/runs\/\$\{[A-Z_]+\}\/artifacts[\s\S]*-F per_page=100/iu,
    /\.workflow_run\.id == \$run_id[\s\S]*\.workflow_run\.head_sha == \$commit/iu,
    /\.id == \$run_id and \.status == "completed" and \.conclusion == "success"[\s\S]*\.html_url == \$run_url[\s\S]*\.head_sha == \$commit[\s\S]*\.head_branch == "main"/iu,
  ];
  if (required.some((pattern) => !pattern.test(source))) {
    throw new Error("workflow deployment provenance is incomplete.");
  }
  if (/actions\/runs\/\$\{[A-Z_]+\}\/jobs|\.jobs\s*\|\s*any\(\.environment\.name/iu.test(source)) {
    throw new Error("workflow cannot infer environment provenance from the jobs list.");
  }
}

function boundedSourceBlock(source, startMarker, endMarker, label) {
  if (source.split(startMarker).length - 1 !== 1) {
    throw new Error(`${label} must appear exactly once.`);
  }
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (end < 0) {
    throw new Error(`${label} is incomplete.`);
  }
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
    '.id == $run_id',
    '.status == "completed"',
    '.conclusion == "success"',
    '.html_url == $run_url',
    '.head_sha == $commit',
    '.head_branch == "main"',
    '.repository.full_name == $repo',
    '.event == "workflow_dispatch"',
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

function validateSelectedArtifactContract(source, {
  runIdVariable, artifactPagesVariable, expectedName,
}) {
  const api = `repos/\${GITHUB_REPOSITORY}/actions/runs/\${${runIdVariable}}/artifacts`;
  if (!source.includes(api)) {
    throw new Error(`${artifactPagesVariable} must come from the selected run.`);
  }
  const block = boundedSourceBlock(
    source,
    `jq -e --argjson run_id "\${${runIdVariable}}" --arg commit`,
    `<<<"\${${artifactPagesVariable}}" >/dev/null`,
    `${artifactPagesVariable} validation`,
  );
  for (const predicate of [
    `.name == ${expectedName}`,
    '.expired == false',
    '.workflow_run.id == $run_id',
    '.workflow_run.head_sha == $commit',
    '| length == 1',
  ]) {
    if (!block.includes(predicate)) {
      throw new Error(`${artifactPagesVariable} provenance is missing ${predicate}.`);
    }
  }
}

export function validatePhase5WorkflowContracts({ candidate, nightly }) {
  validateWorkflowDispatchInputSafety(candidate);
  if (!/environment:[\s\S]*name:\s*private-release-candidate[\s\S]*url:\s*\$\{\{ github\.server_url \}\}\/\$\{\{ github\.repository \}\}\/actions\/runs\/\$\{\{ github\.run_id \}\}/u.test(candidate)) {
    throw new Error("Phase 5 candidate environment must publish its exact Actions run URL.");
  }
  const executable = candidate.match(
    /^\s*(?:\.\/scripts\/build-release-candidate-once\.sh|(?:npx\s+)?expo\s+prebuild|.*gradlew.*|eas\s+build).*$/gmu,
  ) ?? [];
  if (executable.length !== 1
    || !executable[0].includes("build-release-candidate-once.sh")) {
    throw new Error("Phase 5 candidate workflow must build exactly once.");
  }
  requireInOrder(candidate, [
    ["source gates", /Run source and generated-native gates/iu],
    ["single build", /^\s*\.\/scripts\/build-release-candidate-once\.sh/mu],
    ["manifest creation", /node scripts\/create-release-candidate-manifest\.mjs/iu],
    ["manifest verification", /node scripts\/verify-release-candidate-manifest\.mjs/iu],
    ["manifest digest export", /printf 'manifest_sha256=%s/iu],
    ["Phase 5 Maestro", /^\s*npm run test:maestro:phase5/mu],
    ["Phase 5 benchmark", /^\s*npm run benchmark:phase5/mu],
    ["Phase 5 verifier", /^\s*npm run verify:native:phase5/mu],
  ]);
  const manifestIndex = candidate.search(/node scripts\/create-release-candidate-manifest\.mjs/iu);
  const afterManifest = candidate.slice(manifestIndex + 1);
  if (/(?:expo\s+prebuild|gradlew|assembleRelease|bundleRelease|eas\s+build)/iu.test(afterManifest)) {
    throw new Error("Phase 5 workflow cannot build after the canonical manifest.");
  }
  for (const required of [
    /--bundle-dir[\s\S]*--manifest-sha256/iu,
    /automated-only/iu,
    /evidence_pending/iu,
    /if:\s*success\(\)/iu,
    /failure-diagnostics/iu,
  ]) {
    if (!required.test(candidate)) {
      throw new Error("Phase 5 candidate workflow contract is incomplete.");
    }
  }
  for (const command of [
    "test:evidence:phase2", "test:evidence:phase3",
    "test:evidence:phase4", "test:evidence:phase5",
    "test:release-matrix",
  ]) {
    if (!nightly.includes(command)) {
      throw new Error(`Nightly matrix is missing ${command}.`);
    }
  }
}

export function validateAttendedEvidenceWorkflowContract(source) {
  validateWorkflowDispatchInputSafety(source);
  validateDeploymentProvenanceContract(source);
  validateSelectedRunContract(source, {
    runIdVariable: "CANDIDATE_RUN_ID", runJsonVariable: "candidate_run",
    runUrlVariable: "candidate_run_url", workflowPath: ".github/workflows/release-candidate.yml",
    attemptVariable: "candidate_run_attempt", refVariable: "candidate_ref",
    environment: "private-release-candidate",
  });
  validateSelectedRunContract(source, {
    runIdVariable: "OBSERVATIONS_RUN_ID", runJsonVariable: "observations_run",
    runUrlVariable: "observations_run_url", workflowPath: ".github/workflows/release-human-evidence-upload.yml",
    attemptVariable: "observations_run_attempt", refVariable: "observations_ref",
    environment: "private-release-observation-upload",
  });
  validateSelectedArtifactContract(source, {
    runIdVariable: "CANDIDATE_RUN_ID", artifactPagesVariable: "candidate_artifacts",
    expectedName: '$name',
  });
  validateSelectedArtifactContract(source, {
    runIdVariable: "OBSERVATIONS_RUN_ID", artifactPagesVariable: "observations_artifacts",
    expectedName: '$name',
  });
  for (const pattern of [
    /workflow_dispatch:/u,
    /candidate_run_id:/u,
    /permissions:[\s\S]*actions:\s*read[\s\S]*contents:\s*read[\s\S]*deployments:\s*read[\s\S]*id-token:\s*none/iu,
    /environment:[\s\S]*name:\s*private-release-attended[\s\S]*url:\s*\$\{\{ github\.server_url \}\}\/\$\{\{ github\.repository \}\}\/actions\/runs\/\$\{\{ github\.run_id \}\}/u,
    /permissions:[\s\S]*actions:\s*read[\s\S]*contents:\s*read/iu,
    /release-candidate\.yml/iu,
    /workflow_dispatch/iu,
    /gh run download[\s\S]*CANDIDATE_RUN_ID/iu,
    /gh run download[\s\S]*OBSERVATIONS_RUN_ID/iu,
    /owner_token:/u,
    /OWNER_TOKEN:\s*\$\{\{ inputs\.owner_token \}\}/u,
    /test "\$\{OWNER_TOKEN\}" = "approved"/u,
    /record:attended:phase5[\s\S]*--owner-token "\$\{OWNER_TOKEN\}"/iu,
    /release-human-evidence-upload\.yml/iu,
    /private-release-observation-upload/iu,
    /verify:attended:phase5/iu,
    /upload-artifact/iu,
    /attended-record\.json/iu,
    /checklist\.pending\.json/iu,
    /observations\.json/iu,
    /attachments/iu,
  ]) {
    if (!pattern.test(source)) {
      throw new Error("protected attended evidence workflow contract is incomplete.");
    }
  }
  if (/record:attended:phase5[^\n]*\$\{\{/iu.test(source)) {
    throw new Error("attended recorder cannot receive expression-injected arguments.");
  }
  if (/--owner-token approved/iu.test(source)) {
    throw new Error("attended workflow cannot fabricate the owner token.");
  }
}

export function validateHumanEvidenceUploadWorkflowContract(source) {
  validateWorkflowDispatchInputSafety(source);
  validateDeploymentProvenanceContract(source);
  validateSelectedRunContract(source, {
    runIdVariable: "CANDIDATE_RUN_ID", runJsonVariable: "candidate_run",
    runUrlVariable: "candidate_run_url", workflowPath: ".github/workflows/release-candidate.yml",
    attemptVariable: "candidate_run_attempt", refVariable: "candidate_ref",
    environment: "private-release-candidate",
  });
  validateSelectedArtifactContract(source, {
    runIdVariable: "CANDIDATE_RUN_ID", artifactPagesVariable: "candidate_artifacts",
    expectedName: '$name',
  });
  for (const pattern of [
    /workflow_dispatch:/u,
    /runs-on:\s*\[self-hosted, release-evidence\]/u,
    /environment:[\s\S]*name:\s*private-release-observation-upload[\s\S]*url:\s*\$\{\{ github\.server_url \}\}\/\$\{\{ github\.repository \}\}\/actions\/runs\/\$\{\{ github\.run_id \}\}/u,
    /OBSERVATIONS_PATH:\s*\$\{\{ inputs\.observations_path \}\}/u,
    /ATTACHMENTS_PATH:\s*\$\{\{ inputs\.attachments_path \}\}/u,
    /EVIDENCE_ROOT:\s*\$\{\{ vars\.PHASE5_EVIDENCE_ROOT \}\}/u,
    /Validate candidate provenance with trusted inline shell/iu,
    /release-candidate\.yml/iu,
    /private-release-candidate/iu,
    /private-release-candidate-\$\{CANDIDATE_ID\}/u,
    /Check out exact proven candidate source/iu,
    /stage-phase5-human-evidence\.mjs/iu,
    /--evidence-root "\$\{EVIDENCE_ROOT\}"/u,
    /--observations-relative "\$\{OBSERVATIONS_PATH\}"/u,
    /--attachments-relative "\$\{ATTACHMENTS_PATH\}"/u,
    /--staging-root "\$\{RUNNER_TEMP\}"/u,
    /runner\.temp \}\}\/gym-tracker-human-evidence/u,
    /upload-artifact/iu,
  ]) {
    if (!pattern.test(source)) {
      throw new Error("protected human evidence upload workflow is incomplete.");
    }
  }
  if (/(?:printf|echo|python).*(?:observations\.json|attachments)/iu.test(source)) {
    throw new Error("human evidence upload workflow cannot synthesize observation content.");
  }
  const provenance = source.indexOf("name: Validate candidate provenance with trusted inline shell");
  const checkout = source.indexOf("name: Check out exact proven candidate source");
  const helper = source.indexOf("node workflow-source/scripts/stage-phase5-human-evidence.mjs");
  if (!(provenance >= 0 && provenance < checkout && checkout < helper)) {
    throw new Error("candidate provenance must be proven before candidate helper execution.");
  }
}

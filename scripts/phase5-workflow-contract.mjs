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

export function validatePhase5WorkflowContracts({ candidate, nightly }) {
  validateWorkflowDispatchInputSafety(candidate);
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
  for (const pattern of [
    /workflow_dispatch:/u,
    /candidate_run_id:/u,
    /permissions:[\s\S]*actions:\s*read[\s\S]*contents:\s*read[\s\S]*id-token:\s*none/iu,
    /environment:\s*private-release-attended/u,
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
  for (const pattern of [
    /workflow_dispatch:/u,
    /runs-on:\s*\[self-hosted, release-evidence\]/u,
    /environment:\s*private-release-observation-upload/u,
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

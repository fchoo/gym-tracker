import assert from "node:assert/strict";
import {
  execFileSync,
} from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const projectRoot = process.cwd();
const requirementIds = Array.from(
  { length: 12 },
  (_, index) => `LIB-${String(index + 1).padStart(2, "0")}`,
);
const decisionIds = Array.from(
  { length: 55 },
  (_, index) => `D-${String(index + 1).padStart(2, "0")}`,
);
const edgeIds = Array.from(
  { length: 78 },
  (_, index) => `E-${String(index + 1).padStart(2, "0")}`,
);
const uiTruthIds = [
  "empty",
  "loading",
  "error",
  "populated",
  "partial",
  "overflow",
  "zero-one-many",
  "long-text",
];
const prohibitionIds = [
  "no-false-authority",
  "no-diagnosis-or-shame",
  "no-rest-or-schedule-pressure",
];

async function load(relativePath) {
  return import(pathToFileURL(path.join(projectRoot, relativePath)).href);
}

async function maestroYamlPaths() {
  const files = [];
  const visit = async (relativeDirectory) => {
    const entries = await readdir(path.join(projectRoot, relativeDirectory), {
      withFileTypes: true,
    });
    for (const entry of entries) {
      const relativePath = path.posix.join(relativeDirectory, entry.name);
      if (entry.isDirectory()) {
        await visit(relativePath);
      } else if (entry.isFile() && entry.name.endsWith(".yaml")) {
        files.push(relativePath);
      }
    }
  };
  await visit("maestro");
  return files.sort();
}

function identityFixture() {
  return {
    schema_version: 1,
    suite: "phase2",
    profile: "development-test",
    build_variant: "release",
    js_bundle: { embedded: true },
    base_head: "a".repeat(40),
    source_tree_sha256: "b".repeat(64),
    package: "com.fchoo.gymtracker.devtest",
    apk: {
      path: "artifacts/native/phase2/gym-tracker-phase2-devtest.apk",
      sha256: "c".repeat(64),
      size_bytes: 4,
      page_alignment_kib: 16,
      page_alignment_verified: true,
    },
    installed_apk: {
      device_path: "/data/app/base.apk",
      sha256: "c".repeat(64),
      matches_retained_apk: true,
    },
    device: {
      serial: "emulator-5554",
      api: 36,
      abi: "x86_64",
      model: "fixture",
      android_release: "16",
    },
  };
}

function nativeFixture(manifest, caseIds) {
  return {
    schema_version: 1,
    suite: "phase2",
    status: "passed",
    build_manifest: "artifacts/native/phase2/build.json",
    base_head: manifest.base_head,
    source_tree_sha256: manifest.source_tree_sha256,
    package: manifest.package,
    apk: manifest.apk,
    installed_apk: manifest.installed_apk,
    device: manifest.device,
    contract: {
      version: 1,
      expected_count: caseIds.length,
      total: caseIds.length,
      passed: caseIds.length,
      failed: 0,
      skipped: 0,
      cases: caseIds.map((id) => ({
        id,
        status: "passed",
        durationMs: 1,
      })),
      started_at: "2026-08-19T00:00:00.000Z",
      finished_at: "2026-08-19T00:00:01.000Z",
    },
    runner: {
      run_id: "phase2-fixture",
      started_at: "2026-08-19T00:00:00.000Z",
      finished_at: "2026-08-19T00:00:01.000Z",
    },
  };
}

function maestroFixture(manifest, flows, {
  inputSourceAudit,
  proceduralRemediationCaseExclusions,
} = {}) {
  return {
    schema_version: 1,
    suite: "phase2",
    status: "passed",
    build_manifest: "artifacts/native/phase2/build.json",
    base_head: manifest.base_head,
    source_tree_sha256: manifest.source_tree_sha256,
    package: manifest.package,
    apk: manifest.apk,
    installed_apk: manifest.installed_apk,
    device: manifest.device,
    flows: flows.map(({ id, flow, report, airplane, remediation_case_observations: observations, viewport }) => ({
      id,
      flow,
      report: `artifacts/native/phase2/${report}`,
      sha256: "d".repeat(64),
      tests: 1,
      failures: 0,
      errors: 0,
      skipped: 0,
      airplane_mode: airplane,
      remediation_case_observations: observations ?? [],
      viewport: viewport ?? null,
    })),
    input_source_audit: inputSourceAudit,
    procedural_remediation_case_exclusions:
      proceduralRemediationCaseExclusions,
    recorded_at: "2026-08-19T00:00:02.000Z",
  };
}

function benchmarkFixture(manifest) {
  const measurement = (id) => ({
    id,
    samples_requested: 100,
    samples_completed: 100,
    durations_ms: Array.from({ length: 100 }, () => 1),
    p50_ms: 1,
    p95_ms: 1,
    p99_ms: 1,
    maximum_ms: 1,
    maximum_js_task_ms: 1,
  });
  return {
    schema_version: 1,
    suite: "phase2",
    status: "passed",
    build_manifest: "artifacts/native/phase2/build.json",
    base_head: manifest.base_head,
    source_tree_sha256: manifest.source_tree_sha256,
    package: manifest.package,
    apk: manifest.apk,
    installed_apk: manifest.installed_apk,
    device: manifest.device,
    thresholds: {
      minimum_samples: 100,
      maximum_p95_ms: 150,
      maximum_js_task_ms: 50,
    },
    measurements: [
      measurement("search-page"),
      measurement("working-set-commit"),
    ],
    started_at: "2026-08-19T00:00:03.000Z",
    finished_at: "2026-08-19T00:00:04.000Z",
  };
}

function roundtripFixture(manifest) {
  return {
    schema_version: 1,
    suite: "phase2",
    status: "passed",
    mode: "temp-copy",
    build_manifest: "artifacts/native/phase2/build.json",
    base_head: manifest.base_head,
    source_tree_sha256: manifest.source_tree_sha256,
    package: manifest.package,
    apk_sha256: manifest.apk.sha256,
    retained_sha256: manifest.apk.sha256,
    copied_sha256: manifest.apk.sha256,
    installed_sha256: manifest.apk.sha256,
    matches: {
      retained_manifest: true,
      copied_retained: true,
      installed_retained: true,
    },
    recorded_at: "2026-08-19T00:00:05.000Z",
  };
}

function coverageFixture(files) {
  return {
    total: {
      statements: { pct: 95 },
      branches: { pct: 94 },
      functions: { pct: 90 },
      lines: { pct: 95 },
    },
    ...Object.fromEntries(files.map((file) => [
      path.join(projectRoot, file),
      Object.fromEntries(
        ["statements", "branches", "functions", "lines"]
          .map((metric) => [metric, { pct: 100 }]),
      ),
    ])),
  };
}

test("Phase 2 Maestro manifest derives every public Phase 1 and Phase 2 flow", async () => {
  const {
    PHASE2_PROCEDURAL_REMEDIATION_CASE_IDS,
    PHASE2_PUBLIC_FLOW_PATHS,
    PHASE2_REMEDIATION_FLOW_OBSERVATIONS,
    collectPhase2InputSourceAudit,
    collectPhase2RemediationCaseIds,
    derivePhase2MaestroExecutions,
    enumeratePhase2MaestroFlows,
    validatePhase2RemediationFlowObservations,
  } = await load(
    "scripts/run-phase2-maestro.mjs",
  );
  const presentPaths = [];
  for (const flowPath of PHASE2_PUBLIC_FLOW_PATHS) {
    try {
      await readFile(path.join(projectRoot, flowPath), "utf8");
      presentPaths.push(flowPath);
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }
  if (presentPaths.length === PHASE2_PUBLIC_FLOW_PATHS.length) {
    assert.doesNotReject(enumeratePhase2MaestroFlows(projectRoot));
  } else {
    await assert.rejects(
      enumeratePhase2MaestroFlows(projectRoot),
      /public flow manifest is missing/u,
    );
  }
  const flows = derivePhase2MaestroExecutions(PHASE2_PUBLIC_FLOW_PATHS);
  const paths = flows.map(({ flow }) => flow);

  assert.deepEqual(
    flows.map(({ id }) => id),
    flows.map(({ id }) => id).toSorted(),
  );
  assert.equal(new Set(flows.map(({ id }) => id)).size, flows.length);
  assert.ok(paths.includes("maestro/smoke/phase1-full-loop.yaml"));
  assert.ok(paths.includes("maestro/lifecycle/rest-recovery.yaml"));
  assert.deepEqual(
    paths.filter((flow) =>
      flow.startsWith("maestro/phase2/custom-exercise-lifecycle")
    ),
    [
      "maestro/phase2/custom-exercise-lifecycle.yaml",
      "maestro/phase2/custom-exercise-lifecycle2-copy.yaml",
      "maestro/phase2/custom-exercise-lifecycle2-edit-archive.yaml",
      "maestro/phase2/custom-exercise-lifecycle3-active-workout.yaml",
      "maestro/phase2/custom-exercise-lifecycle4-00-schedule-workout.yaml",
      "maestro/phase2/custom-exercise-lifecycle4-active-workout-block.yaml",
      "maestro/phase2/custom-exercise-lifecycle4-profile-migration.yaml",
    ],
  );
  assert.ok(paths.includes("maestro/phase2/plan-impact-replacement.yaml"));
  for (const remediationFlow of Object.keys(
    PHASE2_REMEDIATION_FLOW_OBSERVATIONS,
  )) {
    assert.ok(paths.includes(remediationFlow), remediationFlow);
  }
  const responsive = flows.filter(({ flow }) =>
    flow === "maestro/phase2/remediation-inputs-cards-navigation.yaml"
  );
  assert.deepEqual(
    responsive.map(({ id, viewport }) => ({ id, viewport })),
    [
      {
        id: "phase2-remediation-inputs-cards-navigation-839dp",
        viewport: {
          density_dpi: 160,
          expected_layout: "medium layout",
          expected_navigation: "Root navigation bottom",
          height_dp: 900,
          width_dp: 839,
        },
      },
      {
        id: "phase2-remediation-inputs-cards-navigation-840dp",
        viewport: {
          density_dpi: 160,
          expected_layout: "expanded layout",
          expected_navigation: "Root navigation rail",
          height_dp: 900,
          width_dp: 840,
        },
      },
    ],
  );

  const remediationIds = await collectPhase2RemediationCaseIds(projectRoot);
  assert.doesNotThrow(() => validatePhase2RemediationFlowObservations(
    remediationIds,
    PHASE2_REMEDIATION_FLOW_OBSERVATIONS,
    PHASE2_PROCEDURAL_REMEDIATION_CASE_IDS,
  ));
  assert.deepEqual(PHASE2_PROCEDURAL_REMEDIATION_CASE_IDS, [
    "RC-02-EXACT-HEAD-EVIDENCE",
    "RC-02-FINAL-COMMAND-ORDER",
    "RC-02-ROLE-SPLIT",
  ]);

  const inputAudit = await collectPhase2InputSourceAudit(projectRoot);
  for (const key of [
    "calendar_field_callsites",
    "duration_field_callsites",
    "numeric_field_callsites",
  ]) {
    assert.ok(inputAudit[key].length > 0, key);
    assert.deepEqual(inputAudit[key], inputAudit[key].toSorted(), key);
    assert.equal(new Set(inputAudit[key]).size, inputAudit[key].length, key);
    assert.ok(inputAudit[key].every((entry) =>
      /^src\/.+\.tsx:\d+$/u.test(entry)
    ), key);
  }
  assert.deepEqual(inputAudit.editable_time_of_day_fields, []);
});

test("Phase 2 input source audit excludes only the guarded attended preview route", async () => {
  const { collectPhase2InputSourceAudit } = await load(
    "scripts/run-phase2-maestro.mjs",
  );
  const directory = await mkdtemp(path.join(tmpdir(), "phase2-input-audit-"));
  try {
    await mkdir(path.join(directory, "app"));
    await mkdir(path.join(directory, "src"));
    await writeFile(
      path.join(directory, "app/__phase2-attended-preview.tsx"),
      [
        "export function Preview() {",
        "  return <CalendarField />;",
        "  return <SemanticNumberField />;",
        "  return <TimeDurationField />;",
        "  return <TimePicker />;",
        "}",
      ].join("\n"),
    );
    await writeFile(
      path.join(directory, "app/production-route.tsx"),
      [
        "export function ProductionRoute() {",
        "  return <CalendarField />;",
        "}",
      ].join("\n"),
    );
    await writeFile(
      path.join(directory, "src/production-fields.tsx"),
      [
        "export function ProductionFields() {",
        "  return <SemanticNumberField />;",
        "  return <TimeDurationField />;",
        "}",
      ].join("\n"),
    );

    assert.deepEqual(await collectPhase2InputSourceAudit(directory), {
      calendar_field_callsites: ["app/production-route.tsx:2"],
      duration_field_callsites: ["src/production-fields.tsx:3"],
      numeric_field_callsites: ["src/production-fields.tsx:2"],
      editable_time_of_day_fields: [],
    });
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("Phase 2 Maestro source manifests reject missing, duplicate, stale, and colliding entries", async () => {
  const {
    PHASE2_PROCEDURAL_REMEDIATION_CASE_IDS,
    PHASE2_REMEDIATION_FLOW_OBSERVATIONS,
    derivePhase2MaestroExecutions,
    validatePhase2PublicFlowPaths,
    validatePhase2RemediationFlowObservations,
  } = await load("scripts/run-phase2-maestro.mjs");
  const paths = [
    "maestro/lifecycle/rest-recovery.yaml",
    "maestro/phase2/remediation-inputs-cards-navigation.yaml",
  ];

  assert.doesNotThrow(() => validatePhase2PublicFlowPaths(paths, paths));
  assert.throws(
    () => validatePhase2PublicFlowPaths(paths.slice(1), paths),
    /missing/u,
  );
  assert.throws(
    () => validatePhase2PublicFlowPaths([...paths, paths[0]], paths),
    /duplicate/u,
  );
  assert.throws(
    () => validatePhase2PublicFlowPaths(
      [...paths, "maestro/phase2/stale.yaml"],
      paths,
    ),
    /stale/u,
  );
  assert.throws(
    () => derivePhase2MaestroExecutions([
      "maestro/phase2/a-b.yaml",
      "maestro/phase2/a/b.yaml",
    ]),
    /derived.*ID.*collision/iu,
  );

  const allIds = Object.values(PHASE2_REMEDIATION_FLOW_OBSERVATIONS).flat()
    .map(({ case_id: caseId }) => caseId)
    .concat(PHASE2_PROCEDURAL_REMEDIATION_CASE_IDS);
  const missingMapping = structuredClone(PHASE2_REMEDIATION_FLOW_OBSERVATIONS);
  missingMapping["maestro/phase2/remediation-workout.yaml"] =
    missingMapping["maestro/phase2/remediation-workout.yaml"].slice(1);
  assert.throws(
    () => validatePhase2RemediationFlowObservations(
      allIds.toSorted(),
      missingMapping,
      PHASE2_PROCEDURAL_REMEDIATION_CASE_IDS,
    ),
    /omitted|incomplete/u,
  );
  const duplicateMapping = structuredClone(PHASE2_REMEDIATION_FLOW_OBSERVATIONS);
  duplicateMapping["maestro/phase2/remediation-rest-alerts.yaml"].push(
    duplicateMapping["maestro/phase2/remediation-rest-alerts.yaml"][0],
  );
  assert.throws(
    () => validatePhase2RemediationFlowObservations(
      allIds.toSorted(),
      duplicateMapping,
      PHASE2_PROCEDURAL_REMEDIATION_CASE_IDS,
    ),
    /duplicate/u,
  );
  const staleMapping = structuredClone(PHASE2_REMEDIATION_FLOW_OBSERVATIONS);
  staleMapping["maestro/phase2/remediation-rest-alerts.yaml"].push(
    {
      case_id: "RC-02-STALE",
      observation: "A deliberately stale observation used by the fail-closed fixture.",
    },
  );
  assert.throws(
    () => validatePhase2RemediationFlowObservations(
      allIds.toSorted(),
      staleMapping,
      PHASE2_PROCEDURAL_REMEDIATION_CASE_IDS,
    ),
    /unknown|stale/u,
  );
  const malformedMapping = structuredClone(
    PHASE2_REMEDIATION_FLOW_OBSERVATIONS,
  );
  malformedMapping["maestro/phase2/remediation-rest-alerts.yaml"][0] = {
    case_id: "RC-02-ALERT-BG-DELIVERY-NONAUTH",
    observation: "short",
  };
  assert.throws(
    () => validatePhase2RemediationFlowObservations(
      allIds.toSorted(),
      malformedMapping,
      PHASE2_PROCEDURAL_REMEDIATION_CASE_IDS,
    ),
    /observation.*malformed/u,
  );
});

test("Phase 2 remediation flows use public labels and deterministic seams", async () => {
  const runner = await readFile(
    path.join(projectRoot, "scripts/run-phase2-maestro.mjs"),
    "utf8",
  );
  const inputs = await readFile(
    path.join(
      projectRoot,
      "maestro/phase2/remediation-inputs-cards-navigation.yaml",
    ),
    "utf8",
  );
  const workout = await readFile(
    path.join(projectRoot, "maestro/phase2/remediation-workout.yaml"),
    "utf8",
  );
  const rest = await readFile(
    path.join(projectRoot, "maestro/phase2/remediation-rest-alerts.yaml"),
    "utf8",
  );

  assert.ok(runner.includes(
    '"-e", `EXPECTED_LAYOUT=${flow.viewport.expected_layout}`',
  ));
  assert.ok(runner.includes(
    '"-e", `EXPECTED_NAVIGATION=${flow.viewport.expected_navigation}`',
  ));
  for (const label of [
    "${EXPECTED_LAYOUT}",
    "${EXPECTED_NAVIGATION}",
    "Active Plan",
    "My Plans",
    "Starter Plans",
    "Default rest seconds duration dialog",
    "Default rest seconds minutes",
    "Default rest seconds seconds",
    "Calendar dialog",
    "Use default date",
    "Confirm date",
  ]) {
    assert.match(inputs, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"), label);
  }
  assert.doesNotMatch(inputs, /- tapOn: "Start date"\n- eraseText:/u);
  assert.match(
    inputs,
    /text: "Starter Plans"[\s\S]*text: "Exercises"\n    direction: UP\n    centerElement: true\n- tapOn: "Exercises"\n- extendedWaitUntil:/u,
  );
  assert.match(
    inputs,
    /- tapOn: "Search exercises"\n- inputText: "bench press"\n- hideKeyboard\n- scrollUntilVisible:[\s\S]*text: "Add Bench Press to favorites"[\s\S]*- tapOn: "Add Bench Press to favorites"\n- tapOn: "Clear search exercises"/u,
  );
  assert.match(
    inputs,
    /text: "Favorites"[\s\S]*text: "Create custom exercise"\n    direction: UP\n    centerElement: true\n- tapOn: "Create custom exercise"/u,
  );
  assert.match(
    inputs,
    /- tapOn: "Default rest seconds seconds"\n- eraseText: 2\n- inputText: "30"/u,
  );
  assert.match(
    inputs,
    /- assertNotVisible: "Default rest seconds duration dialog"\n- scrollUntilVisible:[\s\S]*text: "Go back"[\s\S]*- tapOn: "Go back"[\s\S]*text: "Plans"\n    direction: UP/u,
  );
  assert.match(
    inputs,
    /- tapOn: "Go back"\n- scrollUntilVisible:\n    element:\n      text: "Push \/ Pull \/ Legs"\n    direction: UP/u,
  );

  for (const action of [
    "arm_add_warmup_failure",
    "arm_copy_warmup_failure",
    "arm_add_working_failure",
    "arm_completed_set_correction_failure",
  ]) {
    assert.match(workout, new RegExp(`action=${action}`, "u"), action);
  }
  for (const label of [
    "Add warm-up",
    "Copy previous warm-up",
    "Add working set",
    "Retry add warm-up",
    "Retry copy warm-up",
    "Retry add working set",
    "Today's plan",
    "Return to current exercise",
    "Edit completed set 1",
    "Save correction for completed set 1",
    "Retry completed set correction",
  ]) {
    assert.match(workout, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"), label);
  }
  const addWorkingSetVisibilityGuard = [
    "- scrollUntilVisible:",
    "    element:",
    '      text: "Add working set"',
    "    direction: DOWN",
    "    centerElement: true",
  ].join("\n");
  assert.equal(
    workout.split(addWorkingSetVisibilityGuard).length - 1,
    2,
    "Add working set must be scrolled into view before its initial assertion and retry-path tap",
  );
  assert.ok(
    workout.includes(
      `${addWorkingSetVisibilityGuard}\n- assertVisible: "Add working set"`,
    ),
  );
  assert.ok(
    workout.includes(
      `${addWorkingSetVisibilityGuard}\n- tapOn: "Add working set"`,
    ),
  );
  assert.match(workout, /assertNotVisible: "Excluded from records and progression"/u);
  assert.doesNotMatch(workout, /Undo completed set[^\n]*tapOn|tapOn: "Undo completed set"/u);

  for (const action of [
    "foreground_expiry",
    "background_expiry",
    "inspect_permission",
    "cancel_all",
  ]) {
    assert.ok(
      rest.includes(`action=${action}\"`),
      action,
    );
  }
  for (const control of [
    "Skip rest",
    "Pause rest",
    "Subtract 15 seconds",
    "Add 15 seconds",
  ]) {
    assert.ok(rest.includes(control), control);
  }
  assert.match(
    rest,
    /text: "Rest sound"\n    checked: true[\s\S]*text: "Rest sound"\n    checked: false[\s\S]*clearState: false[\s\S]*text: "Rest sound"\n    checked: false/u,
  );
  assert.match(
    rest,
    /tapOn: "Complete Set 1"[\s\S]*action=foreground_expiry[\s\S]*foreground_expiry_attempted_once/u,
  );
  assert.match(
    rest,
    /notifications: allow[\s\S]*action=inspect_permission[\s\S]*permission · granted[\s\S]*action=background_expiry[\s\S]*background_expiry_scheduled_once[\s\S]*action=cancel_all/u,
  );
  assert.match(
    rest,
    /- tapOn: "Skip rest"\n- extendedWaitUntil:\n    notVisible: "Skip rest"\n    timeout: 60000/u,
  );
  assert.doesNotMatch(rest, /- assertVisible: "Rest skipped"/u);

  assert.match(
    workout,
    /- assertVisible: "Warm-up was not added"\n- assertNotVisible:\n    text: "Warm-up 3 of \.\*"\n- tapOn: "Retry add warm-up"\n- assertVisible: "Warm-up W3 added and focused"/u,
  );
  assert.match(
    workout,
    /clearState: false[\s\S]*text: "Warm-up 3 of 3\.\*"[\s\S]*- assertVisible: "Warm-up was not added"\n- assertNotVisible:\n    text: "Warm-up 4 of \.\*"\n- tapOn: "Retry copy warm-up"\n- assertVisible: "Warm-up W4 added and focused"/u,
  );
  assert.match(workout, /clearState: false[\s\S]*text: "Warm-up 4 of 4\.\*"/u);
  assert.match(workout, /text: "Warm-up 5 of \.\*"/u);
  const boundedWorkingSetFourTraversal = [
    "- repeat:",
    "    times: 16",
    "    while:",
    '      notVisible: "Working set 4 of 4.*"',
    "    commands:",
    "      - swipe:",
    "          start: 95%, 75%",
    "          end: 95%, 25%",
    "          duration: 300",
    '- assertVisible: "Working set 4 of 4.*"',
  ].join("\n");
  assert.equal(
    workout.split(boundedWorkingSetFourTraversal).length - 1,
    2,
    "both long working-set traversals must use bounded right-edge swipes",
  );
  assert.match(
    workout,
    /- repeat:\n    times: 12\n    while:\n      notVisible: "Complete warm-up W1"\n    commands:\n      - swipe:\n          start: 95%, 25%\n          end: 95%, 75%\n          duration: 300\n- assertVisible: "Complete warm-up W1"\n- tapOn: "Complete warm-up W1"\n- repeat:\n    times: 12\n    while:\n      notVisible: "Warm-up 1 of 4\.\*Completed\.\*"\n    commands:\n      - swipe:\n          start: 95%, 25%\n          end: 95%, 75%\n          duration: 300\n- assertVisible: "Warm-up 1 of 4\.\*Completed\.\*"\n- repeat:\n    times: 12\n    while:\n      notVisible: "Complete Set 1"\n    commands:\n      - swipe:\n          start: 95%, 75%\n          end: 95%, 25%\n          duration: 300\n- assertVisible: "Complete Set 1"/u,
  );
  assert.match(
    workout,
    /- longPressOn: "Working set 1 load in kilograms"\n- tapOn:\n    text: "Select all"\n    optional: true\n- eraseText: 32\n- inputText: "62\.5"/u,
  );
  assert.match(
    workout,
    /- assertVisible: "Correction was not saved\. Retry the correction\."[\s\S]*- assertVisible: "Working set 4 of 4\.\*"\n- repeat:\n    times: 4\n    while:\n      notVisible: "Retry completed set correction"\n    commands:\n      - swipe:\n          start: 95%, 75%\n          end: 95%, 45%\n          duration: 300\n- assertVisible: "Retry completed set correction"\n- tapOn: "Retry completed set correction"[\s\S]*text: "Working set 1 correction saved"\n    direction: UP\n    centerElement: true\n    timeout: 60000/u,
  );
  assert.match(
    workout,
    /- tapOn: "Skip rest"\n- extendedWaitUntil:\n    notVisible: "Skip rest"\n    timeout: 60000\n- repeat:\n    times: 12\n    while:\n      notVisible: "Edit completed set 1"\n    commands:\n      - swipe:\n          start: 95%, 25%\n          end: 95%, 75%\n          duration: 300\n- assertVisible: "Edit completed set 1"/u,
  );
  assert.match(
    workout,
    /- tapOn: "Resume workout"\n- repeat:\n    times: 12\n    while:\n      notVisible: "Edit completed set 1"\n    commands:\n      - swipe:\n          start: 95%, 75%\n          end: 95%, 25%\n          duration: 300\n- assertVisible: "Edit completed set 1"\n- tapOn: "Edit completed set 1"/u,
  );
  const correctedWorkingSetVerification = [
    "- repeat:",
    "    times: 12",
    "    while:",
    '      notVisible: "Edit completed set 1"',
    "    commands:",
    "      - swipe:",
    "          start: 95%, 75%",
    "          end: 95%, 25%",
    "          duration: 300",
    '- assertVisible: "Edit completed set 1"',
    '- assertVisible: "Working set 1 of 4.*Current values 62.5 kg × 8.*Completed.*"',
  ].join("\n");
  assert.equal(
    workout.split(correctedWorkingSetVerification).length - 1,
    3,
    "corrected working-set persistence must use the completed-row action anchor after retry, restart, and review return",
  );
  assert.match(
    workout,
    /clearState: false[\s\S]*- tapOn: "Resume workout"[\s\S]*- repeat:\n    times: 12\n    while:\n      notVisible: "Edit completed set 1"[\s\S]*- assertVisible: "Edit completed set 1"\n- assertVisible: "Working set 1 of 4\.\*Current values 62\.5 kg × 8\.\*Completed\.\*"/u,
  );
  assert.match(
    workout,
    /text: "Return to current exercise"\n    direction: UP\n    centerElement: true\n    timeout: 60000[\s\S]*- tapOn: "Return to current exercise"\n- assertVisible: "FOCUSED WORKOUT"\n- assertVisible: "Back Squat"[\s\S]*- repeat:\n    times: 12\n    while:\n      notVisible: "Edit completed set 1"[\s\S]*- assertVisible: "Edit completed set 1"\n- assertVisible: "Working set 1 of 4\.\*Current values 62\.5 kg × 8\.\*Completed\.\*"/u,
  );
  for (const absentOrdinal of [
    'text: "Warm-up 3 of .*"',
    'text: "Warm-up 4 of .*"',
    'text: "Working set 5 of .*"',
  ]) {
    assert.ok(workout.includes(absentOrdinal), absentOrdinal);
  }
});

test("Phase 2 date flows use CalendarField rather than text entry", async () => {
  const schedule = await readFile(
    path.join(projectRoot, "maestro/phase2/schedule-cross-profile.yaml"),
    "utf8",
  );
  const impact = await readFile(
    path.join(projectRoot, "maestro/phase2/plan-impact-replacement.yaml"),
    "utf8",
  );

  const startDateCalendarSequence = [
    '- tapOn: "Start date"',
    '- assertVisible: "Calendar dialog"',
    '- tapOn: "Use default date"',
    '- tapOn: "Confirm date"',
  ].join("\n");
  assert.equal(schedule.split(startDateCalendarSequence).length - 1, 1);
  assert.doesNotMatch(schedule, /toISOString|schedule\.yesterday/u);
  assert.doesNotMatch(schedule, /- tapOn: "Start date"\n- eraseText:/u);
  const pastActivationDateCalendarSequence = [
    '- tapOn: "Start date"',
    '- assertVisible: "Calendar dialog"',
    '- tapOn: "Previous month"',
    '- tapOn:',
    '    text: "^Select [0-9]{4}-[0-9]{2}-01$"',
    '- tapOn: "Confirm date"',
    '- assertNotVisible: "Calendar dialog"',
  ].join("\n");
  assert.equal(
    schedule.split(pastActivationDateCalendarSequence).length - 1,
    1,
  );
  const effectiveDateCalendarSequence = [
    '- tapOn: "Effective date"',
    '- assertVisible: "Calendar dialog"',
    '- tapOn: "Use default date"',
    '- tapOn: "Confirm date"',
    '- assertNotVisible: "Calendar dialog"',
  ].join("\n");
  assert.equal(
    schedule.split(effectiveDateCalendarSequence).length - 1,
    1,
  );
  assert.match(
    schedule,
    /- assertNotVisible: "Calendar dialog"\n- tapOn: "Schedule timezone"\n- eraseText: 32\n- inputText: "Australia\/Sydney"\n- hideKeyboard\n- repeat:\n    times: 4\n    while:\n      notVisible: "\^Weekday\$"\n    commands:\n      - swipe:\n          start: 95%, 75%\n          end: 95%, 45%\n          duration: 300\n- assertVisible: "\^Weekday\$"\n- tapOn: "\^Rotation\$"/u,
  );
  const scheduleWorkoutFieldTraversal = /- repeat:\n    times: 4\n    while:\n      notVisible: "Working set 1 (?:added )?load in kilograms"\n    commands:\n      - swipe:\n          start: 95%, 75%\n          end: 95%, 45%\n          duration: 300\n- assertVisible: "Working set 1 (?:added )?load in kilograms"/gu;
  assert.equal([...schedule.matchAll(scheduleWorkoutFieldTraversal)].length, 3);
  assert.match(
    schedule,
    /- assertVisible: "Chin-Up"\n- repeat:\n    times: 4\n    while:\n      notVisible: "Working set 1 repetitions"\n    commands:\n      - swipe:\n          start: 95%, 75%\n          end: 95%, 45%\n          duration: 300\n- assertVisible: "Working set 1 repetitions"/u,
  );
  const scheduleWorkoutRepetitionTraversal = /- repeat:\n    times: 4\n    while:\n      notVisible: "Working set 1 repetitions"\n    commands:\n      - swipe:\n          start: 95%, 75%\n          end: 95%, 45%\n          duration: 300\n- assertVisible: "Working set 1 repetitions"/gu;
  assert.equal(
    [...schedule.matchAll(scheduleWorkoutRepetitionTraversal)].length,
    4,
  );
  assert.match(
    impact,
    /- tapOn:\n    text: "Effective date"[\s\S]{0,160}- assertVisible: "Calendar dialog"\n- tapOn: "Use default date"\n- tapOn: "Confirm date"/u,
  );
  assert.doesNotMatch(impact, /- tapOn:[\s\S]{0,100}text: "Effective date"[\s\S]{0,100}- eraseText:/u);
});

test("Phase 2 Maestro rejects failed, skipped, malformed, and identity-drifted JUnit", async () => {
  const { validatePhase2MaestroJunit } = await load(
    "scripts/run-phase2-maestro.mjs",
  );
  const flow = "maestro/phase2/remediation-workout.yaml";
  const xml = (suite = "tests=\"1\" failures=\"0\" errors=\"0\" skipped=\"0\"",
    testcase = `file=\"${flow}\" status=\"SUCCESS\"`) =>
    `<testsuites><testsuite ${suite}><testcase ${testcase}/></testsuite></testsuites>`;

  assert.deepEqual(validatePhase2MaestroJunit(xml(), flow), {
    errors: 0,
    failures: 0,
    skipped: 0,
    tests: 1,
  });
  const retainedFlow = "maestro/lifecycle/rest-recovery.yaml";
  const retainedMaestroShape = `<?xml version='1.0' encoding='UTF-8'?>
<testsuites>
  <testsuite name="Test Suite" device="emulator-5554" tests="1" failures="0" time="87.504" timestamp="2026-08-23T07:59:51">
    <testcase id="Rest recovery through rotation and process death" name="Rest recovery through rotation and process death" classname="Rest recovery through rotation and process death" file="maestro/lifecycle/rest-recovery.yaml" time="87.492" timestamp="2026-08-23T07:59:51" status="SUCCESS">
      <properties>
        <property name="tags" value="phase-1, rest-lifecycle"/>
      </properties>
    </testcase>
  </testsuite>
</testsuites>`;
  assert.deepEqual(
    validatePhase2MaestroJunit(retainedMaestroShape, retainedFlow),
    { errors: 0, failures: 0, skipped: 0, tests: 1 },
  );
  assert.deepEqual(
    validatePhase2MaestroJunit(
      `<?xml version="1.0"?><!-- opaque --><testsuites><?maestro opaque?><testsuite tests="1" failures="0"><![CDATA[<testcase file="spoof.yaml"/>]]><testcase file="${flow}" status="SUCCESS"/></testsuite><testsuite tests="1" failures="0"><testcase file="${flow}" status="SUCCESS"/></testsuite></testsuites>`,
      flow,
    ),
    { errors: 0, failures: 0, skipped: 0, tests: 2 },
  );
  for (const validOpaque of [
    `<!-- before --><testsuites><testsuite tests="1" failures="0"><testcase file="${flow}" status="SUCCESS"/></testsuite></testsuites><!-- after -->`,
    `<?before opaque?><testsuites><testsuite tests="1" failures="0"><testcase file="${flow}" status="SUCCESS"/></testsuite></testsuites><?after opaque?>`,
    `<testsuites><![CDATA[opaque <testcase/> text]]><testsuite tests="1" failures="0"><testcase file="${flow}" status="SUCCESS"/></testsuite></testsuites>`,
  ]) {
    assert.deepEqual(validatePhase2MaestroJunit(validOpaque, flow), {
      errors: 0, failures: 0, skipped: 0, tests: 1,
    });
  }
  for (const invalidHierarchy of [
    `<testsuite tests="1" failures="0"><testcase file="${flow}" status="SUCCESS"/></testsuite>`,
    `<testsuites><wrapper><testsuite tests="1" failures="0"><testcase file="${flow}" status="SUCCESS"/></testsuite></wrapper></testsuites>`,
    `<testsuites><testsuite tests="1" failures="0"></testsuite><testcase file="${flow}" status="SUCCESS"/></testsuites>`,
    `<testsuites><testsuite tests="1" failures="0"><testcase file="${flow}" status="SUCCESS"><testcase file="${flow}" status="SUCCESS"/></testcase></testsuite></testsuites>`,
    `<testsuites><testsuite tests="1" failures="0"><testsuite tests="1" failures="0"><testcase file="${flow}" status="SUCCESS"/></testsuite></testsuite></testsuites>`,
    `<testsuites><testsuite tests="1" failures="0"><properties><property name="tags" value="wrong-parent"/></properties><testcase file="${flow}" status="SUCCESS"/></testsuite></testsuites>`,
    `<testsuites><testsuite tests="1" failures="0"><testcase file="${flow}" status="SUCCESS"><property name="tags" value="missing-properties"/></testcase></testsuite></testsuites>`,
    `<testsuites><testsuite tests="1" failures="0"><testcase file="${flow}" status="SUCCESS"><properties><wrapper><property name="tags" value="wrapped"/></wrapper></properties></testcase></testsuite></testsuites>`,
    `<testsuites>not whitespace<testsuite tests="1" failures="0"><testcase file="${flow}" status="SUCCESS"/></testsuite></testsuites>`,
    `<!DOCTYPE testsuites [<!ENTITY spoof "x">]><testsuites><testsuite tests="1" failures="0"><testcase file="${flow}" status="SUCCESS"/></testsuite></testsuites>`,
    `<testsuites><testsuite tests="1" failures="0"><testcase file="${flow}" status="SUCCESS"/></testsuite></testsuites><?xml version="1.0"?>`,
  ]) {
    assert.throws(
      () => validatePhase2MaestroJunit(invalidHierarchy, flow),
      /hierarchy|root|malformed|DOCTYPE/u,
    );
  }
  const spoofedElements = `<testsuite tests="1" failures="0"><testcase file="${flow}" status="SUCCESS"/></testsuite>`;
  for (const inertXml of [
    `<testsuites><!-- ${spoofedElements} --></testsuites>`,
    `<testsuites><![CDATA[${spoofedElements}]]></testsuites>`,
    `<?spoof payload="${spoofedElements}"?><testsuites/>`,
  ]) {
    assert.throws(
      () => validatePhase2MaestroJunit(inertXml, flow),
      /malformed|missing/u,
    );
  }
  for (const inertFailure of [
    "<!-- <failure/> -->",
    "<![CDATA[<error/><skipped/>]]>",
  ]) {
    assert.deepEqual(
      validatePhase2MaestroJunit(
        `<testsuites>${inertFailure}<testsuite tests="1" failures="0"><testcase file="${flow}" status="SUCCESS"/></testsuite></testsuites>`,
        flow,
      ),
      { errors: 0, failures: 0, skipped: 0, tests: 1 },
    );
  }
  assert.deepEqual(
    validatePhase2MaestroJunit(
      xml('tests="1" failures="0"'),
      flow,
    ),
    {
      errors: 0,
      failures: 0,
      skipped: 0,
      tests: 1,
    },
  );
  for (const missingRequired of [
    'failures="0" errors="0" skipped="0"',
    'tests="1" errors="0" skipped="0"',
  ]) {
    assert.throws(
      () => validatePhase2MaestroJunit(xml(missingRequired), flow),
      /missing (?:tests|failures)/u,
    );
  }
  for (const malformedOptional of [
    'tests="1" failures="0" errors="invalid"',
    'tests="1" failures="0" skipped="invalid"',
    'tests="1" failures="0" errors=1',
    'tests="1" failures="0" errors="0" errors="1"',
  ]) {
    assert.throws(
      () => validatePhase2MaestroJunit(xml(malformedOptional), flow),
      /duplicate|malformed/u,
    );
  }
  assert.deepEqual(
    validatePhase2MaestroJunit(
      xml("tests = '1' failures = '0'"),
      flow,
    ),
    {
      errors: 0,
      failures: 0,
      skipped: 0,
      tests: 1,
    },
  );
  for (const lookalikeRequired of [
    'total-tests="1" failures="0"',
    'tests="1" no-failures="0"',
  ]) {
    assert.throws(
      () => validatePhase2MaestroJunit(xml(lookalikeRequired), flow),
      /missing (?:tests|failures)/u,
    );
  }
  assert.throws(
    () => validatePhase2MaestroJunit(
      xml("tests=\"1\" failures=\"1\" errors=\"0\" skipped=\"0\""),
      flow,
    ),
    /did not pass/u,
  );
  assert.throws(
    () => validatePhase2MaestroJunit(
      xml("tests=\"1\" failures=\"0\" errors=\"0\" skipped=\"1\""),
      flow,
    ),
    /did not pass/u,
  );
  assert.throws(
    () => validatePhase2MaestroJunit("<testsuites/>", flow),
    /malformed|missing/u,
  );
  assert.throws(
    () => validatePhase2MaestroJunit(
      `<testsuites><testsuite tests="1" failures="0" errors="0" skipped="0"><testcase file="${flow}" status="SUCCESS"/>`,
      flow,
    ),
    /malformed/u,
  );
  assert.throws(
    () => validatePhase2MaestroJunit(
      `<testsuites><testsuite tests="1" failures="0" errors="0" skipped="0"><testcase file="${flow}" status="SUCCESS"/></testsuites></testsuite>`,
      flow,
    ),
    /malformed/u,
  );
  for (const malformed of [`prefix${xml()}`, `${xml()}suffix`]) {
    assert.throws(
      () => validatePhase2MaestroJunit(malformed, flow),
      /malformed/u,
    );
  }
  assert.throws(
    () => validatePhase2MaestroJunit(
      xml(undefined, 'file="maestro/phase2/other.yaml" status="SUCCESS"'),
      flow,
    ),
    /identity/u,
  );
});

test("Phase 2 Maestro invalidates a prior result before a rerun", async () => {
  const {
    invalidatePhase2MaestroResult,
    loadPhase2MaestroRunInputs,
  } = await load(
    "scripts/run-phase2-maestro.mjs",
  );
  const directory = await mkdtemp(path.join(tmpdir(), "phase2-maestro-result-"));
  const resultPath = path.join(directory, "maestro.json");
  try {
    await writeFile(resultPath, '{"status":"passed"}\n');
    await invalidatePhase2MaestroResult(resultPath);
    await assert.rejects(readFile(resultPath, "utf8"), { code: "ENOENT" });
    await assert.doesNotReject(invalidatePhase2MaestroResult(resultPath));

    await writeFile(resultPath, '{"status":"passed"}\n');
    const malformedManifestPath = path.join(directory, "malformed.json");
    await writeFile(malformedManifestPath, "{");
    await assert.rejects(
      loadPhase2MaestroRunInputs(malformedManifestPath),
      /JSON|position|property/u,
    );
    await assert.rejects(readFile(resultPath, "utf8"), { code: "ENOENT" });

    await writeFile(resultPath, '{"status":"passed"}\n');
    const missingApkManifestPath = path.join(directory, "missing-apk.json");
    await writeFile(missingApkManifestPath, JSON.stringify({
      apk: { path: path.join(directory, "missing.apk") },
    }));
    await assert.rejects(
      loadPhase2MaestroRunInputs(missingApkManifestPath),
      /retained APK is missing/u,
    );
    await assert.rejects(readFile(resultPath, "utf8"), { code: "ENOENT" });
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("Phase 2 Maestro rejects APK, package, install, and source identity drift", async () => {
  const { validatePhase2MaestroBuildIdentity } = await load(
    "scripts/run-phase2-maestro.mjs",
  );
  const manifest = identityFixture();
  const valid = {
    currentHead: manifest.base_head,
    currentSourceSha256: manifest.source_tree_sha256,
    installedApk: { sha256: manifest.apk.sha256 },
    manifest,
    retainedApkSha256: manifest.apk.sha256,
    retainedApkSize: manifest.apk.size_bytes,
  };
  assert.doesNotThrow(() => validatePhase2MaestroBuildIdentity(valid));
  for (const drift of [
    { currentHead: "d".repeat(40) },
    { currentSourceSha256: "e".repeat(64) },
    { retainedApkSha256: "f".repeat(64) },
    { retainedApkSize: manifest.apk.size_bytes + 1 },
    { installedApk: { sha256: "0".repeat(64) } },
    { manifest: { ...manifest, package: "com.example.wrong" } },
  ]) {
    assert.throws(
      () => validatePhase2MaestroBuildIdentity({ ...valid, ...drift }),
      /identity drifted/u,
    );
  }
});

test("Phase 2 Maestro restores both original window metrics and surfaces restoration failures", async () => {
  const {
    applyPhase2Viewport,
    parsePhase2WindowMetrics,
    restorePhase2WindowMetrics,
  } = await load("scripts/run-phase2-maestro.mjs");
  const original = parsePhase2WindowMetrics(
    "Physical size: 1080x2340\nOverride size: 840x900",
    "Physical density: 450\nOverride density: 160",
  );
  assert.deepEqual(original, { density: 160, size: "840x900" });

  const calls = [];
  let currentSize = "839x900";
  let currentDensity = 160;
  const adb = async (...args) => {
    calls.push(args.join(" "));
    if (args.join(" ") === "shell wm size") {
      return `Physical size: 1080x2340\nOverride size: ${currentSize}`;
    }
    if (args.join(" ") === "shell wm density") {
      return `Physical density: 450\nOverride density: ${currentDensity}`;
    }
    if (args[2] === "size" && args[3] !== undefined) {
      currentSize = args[3];
    }
    if (args[2] === "density" && args[3] !== undefined) {
      currentDensity = Number(args[3]);
    }
    return "";
  };
  await applyPhase2Viewport(adb, {
    density_dpi: 160,
    height_dp: 900,
    width_dp: 839,
  });
  await restorePhase2WindowMetrics(adb, original);
  assert.deepEqual(calls, [
    "shell wm density 160",
    "shell wm size 839x900",
    "shell wm size",
    "shell wm density",
    "shell wm size 840x900",
    "shell wm density 160",
    "shell wm size",
    "shell wm density",
  ]);

  const restoreCalls = [];
  await assert.rejects(
    restorePhase2WindowMetrics(async (...args) => {
      restoreCalls.push(args.join(" "));
      if (args.join(" ") === "shell wm size reset") {
        throw new Error("size failed");
      }
      if (args.join(" ") === "shell wm size") {
        return "Physical size: 1080x2340";
      }
      if (args.join(" ") === "shell wm density") {
        return "Physical density: 450";
      }
      return "";
    }, { density: null, size: null }),
    /window metrics.*size/iu,
  );
  assert.deepEqual(restoreCalls, [
    "shell wm size reset",
    "shell wm density reset",
    "shell wm size",
    "shell wm density",
  ]);
});

test("Phase 2 Maestro orchestration preserves flow and every restoration failure", async () => {
  const { runPhase2MaestroOrchestration } = await load(
    "scripts/run-phase2-maestro.mjs",
  );
  const primaryFailure = new Error("primary Maestro flow failure");
  const cleanupFailures = [
    new Error("inner airplane restoration failure"),
    new Error("final airplane restoration failure"),
    new Error("window metrics restoration failure"),
  ];
  let airplaneRestorationAttempt = 0;

  await assert.rejects(
    runPhase2MaestroOrchestration({
      applyViewport: async () => undefined,
      captureWindowMetrics: async () => ({ density: 160, size: "840x900" }),
      executeFlow: async () => {
        throw primaryFailure;
      },
      finalize: async () => undefined,
      flows: [{
        airplane: true,
        flow: "maestro/smoke/phase1-airplane-repeat.yaml",
        id: "smoke-phase1-airplane-repeat",
        viewport: null,
      }],
      prepareDevice: async () => undefined,
      prepareRun: async () => undefined,
      restoreWindowMetrics: async () => {
        throw cleanupFailures[2];
      },
      setAirplaneMode: async (enabled) => {
        if (enabled) {
          return;
        }
        const failure = cleanupFailures[airplaneRestorationAttempt];
        airplaneRestorationAttempt += 1;
        throw failure;
      },
    }),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.equal(error.cause, primaryFailure);
      assert.deepEqual(
        error.errors.map((entry) => entry.message),
        [
          "primary Maestro flow failure",
          "flow airplane mode restoration: inner airplane restoration failure",
          "final airplane mode restoration: final airplane restoration failure",
          "window metrics restoration: window metrics restoration failure",
        ],
      );
      assert.match(error.message, /primary Maestro flow failure/u);
      assert.match(error.message, /inner airplane restoration failure/u);
      assert.match(error.message, /final airplane restoration failure/u);
      assert.match(error.message, /window metrics restoration failure/u);
      return true;
    },
  );
  assert.equal(airplaneRestorationAttempt, 2);
});

test("Phase 2 Maestro restores original metrics before ordinary flows", async () => {
  const { runPhase2MaestroOrchestration } = await load(
    "scripts/run-phase2-maestro.mjs",
  );
  const events = [];
  const original = { density: null, size: null };
  const viewport = {
    density_dpi: 160,
    expected_layout: "expanded layout",
    expected_navigation: "Root navigation rail",
    height_dp: 900,
    width_dp: 840,
  };

  await runPhase2MaestroOrchestration({
    applyViewport: async ({ width_dp: width }) => {
      events.push(`apply:${width}`);
    },
    captureWindowMetrics: async () => original,
    executeFlow: async ({ id }) => {
      events.push(`execute:${id}`);
      return id;
    },
    finalize: async (results) => results,
    flows: [
      { airplane: false, id: "responsive", viewport },
      { airplane: false, id: "ordinary-one", viewport: null },
      { airplane: false, id: "ordinary-two", viewport: null },
    ],
    prepareDevice: async () => undefined,
    prepareRun: async () => undefined,
    restoreWindowMetrics: async (metrics) => {
      assert.equal(metrics, original);
      events.push("restore");
    },
    setAirplaneMode: async () => undefined,
  });

  assert.deepEqual(events, [
    "apply:840",
    "execute:responsive",
    "restore",
    "execute:ordinary-one",
    "execute:ordinary-two",
    "restore",
  ]);
});

test("Phase 2 benchmark validator rejects sample and threshold failures", async () => {
  const {
    phase2BenchmarkLogOutcome,
    validatePhase2BenchmarkResult,
  } = await load(
    "scripts/benchmark-phase2.mjs",
  );
  const valid = {
    schemaVersion: 1,
    suite: "phase2",
    status: "passed",
    measurements: [
      {
        id: "search-page",
        samplesRequested: 100,
        samplesCompleted: 100,
        durationsMs: Array.from({ length: 100 }, () => 2),
        maxJsTaskMs: 1,
      },
      {
        id: "working-set-commit",
        samplesRequested: 100,
        samplesCompleted: 100,
        durationsMs: Array.from({ length: 100 }, () => 3),
        maxJsTaskMs: 1,
      },
    ],
    startedAt: "2026-08-19T00:00:00.000Z",
    finishedAt: "2026-08-19T00:00:01.000Z",
  };

  assert.equal(validatePhase2BenchmarkResult(valid, {
    samples: 100,
    maxP95Ms: 150,
    maxJsTaskMs: 50,
  }).measurements.length, 2);
  assert.throws(
    () => validatePhase2BenchmarkResult({
      ...valid,
      measurements: [{
        ...valid.measurements[0],
        samplesCompleted: 99,
        durationsMs: valid.measurements[0].durationsMs.slice(1),
      }, valid.measurements[1]],
    }, {
      samples: 100,
      maxP95Ms: 150,
      maxJsTaskMs: 50,
    }),
    /samples/u,
  );
  assert.throws(
    () => validatePhase2BenchmarkResult({
      ...valid,
      measurements: [{
        ...valid.measurements[0],
        durationsMs: Array.from({ length: 100 }, () => 151),
      }, valid.measurements[1]],
    }, {
      samples: 100,
      maxP95Ms: 150,
      maxJsTaskMs: 50,
    }),
    /threshold/u,
  );
  assert.deepEqual(
    phase2BenchmarkLogOutcome(
      'I/ReactNativeJS: GYM_TRACKER_PHASE2_BENCHMARK_ERROR:{"message":"migration_recovery_failed"}',
    ),
    {
      kind: "error",
      message: "migration_recovery_failed",
    },
  );
  assert.equal(phase2BenchmarkLogOutcome("Running main"), null);
});

test("Phase 2 benchmark log transport reassembles bounded result chunks", async () => {
  const {
    PHASE2_BENCHMARK_RESULT_CHUNK_MARKER,
    phase2BenchmarkLogOutcome,
  } = await load(
    "scripts/benchmark-phase2.mjs",
  );
  const result = {
    schemaVersion: 1,
    suite: "phase2",
    status: "passed",
    measurements: [
      {
        id: "search-page",
        samplesRequested: 500,
        samplesCompleted: 500,
        durationsMs: Array.from({ length: 500 }, (_, index) => index / 10),
        maxJsTaskMs: 1,
      },
      {
        id: "working-set-commit",
        samplesRequested: 500,
        samplesCompleted: 500,
        durationsMs: Array.from(
          { length: 500 },
          (_, index) => (index + 1) / 10,
        ),
        maxJsTaskMs: 2,
      },
    ],
    startedAt: "2026-08-19T00:00:00.000Z",
    finishedAt: "2026-08-19T00:00:01.000Z",
  };
  const serialized = JSON.stringify(result);
  assert.ok(serialized.length > 4_076);
  const resultId = `${result.startedAt}|${result.finishedAt}`;
  const chunks = serialized.match(/.{1,512}/gu) ?? [];
  const lines = chunks.map((chunk, index) =>
    `${PHASE2_BENCHMARK_RESULT_CHUNK_MARKER}${JSON.stringify({
      transportVersion: 1,
      resultId,
      index,
      total: chunks.length,
      chunk,
    })}`
  );

  assert.deepEqual(
    phase2BenchmarkLogOutcome(lines.join("\n")),
    { kind: "result", result },
  );
  assert.deepEqual(
    phase2BenchmarkLogOutcome(
      [
        "GYM_TRACKER_PHASE2_BENCHMARK_RESULT:{",
        "GYM_TRACKER_PHASE2_BENCHMARK_RESULT_CHUNK:{",
        ...lines,
      ].join("\n"),
    ),
    { kind: "result", result },
  );
  assert.equal(
    phase2BenchmarkLogOutcome(lines.slice(0, -1).join("\n")),
    null,
  );
  assert.equal(
    phase2BenchmarkLogOutcome(
      [...lines, lines[0]].join("\n"),
    ),
    null,
  );
});

test("Phase 2 source ledger derives canonical remediation, matrix, and migration coverage", async () => {
  const {
    collectPhase2SourceLedger,
    validateUiSurfaceRemediationCases,
    validatePhase2AutomatedEvidence,
  } = await load("scripts/verify-phase2-native-evidence.mjs");
  const {
    collectPhase2InputSourceAudit,
    enumeratePhase2MaestroFlows,
    PHASE2_PROCEDURAL_REMEDIATION_CASE_IDS,
  } = await load("scripts/run-phase2-maestro.mjs");
  const ledger = await collectPhase2SourceLedger(projectRoot);
  const migrationPath =
    "src/platform/sqlite/migrations/0010_owned_recommendations.ts";

  assert.ok(ledger.nativeCaseIds.includes("metrics-final-manifest-v12"));
  assert.ok(!ledger.nativeCaseIds.includes("metrics-final-manifest-v9"));
  assert.ok(ledger.integrityCriticalFiles.includes(migrationPath));
  assert.equal(ledger.decisions.at(-1), "D-67");
  assert.deepEqual(ledger.decisions, Array.from({ length: 67 }, (_, index) => "D-" + String(index + 1).padStart(2, "0")));
  assert.equal(ledger.gaps.length, 9);
  assert.deepEqual(ledger.gaps, Array.from({ length: 9 }, (_, index) => "G-02-" + String(index + 1).padStart(2, "0")));
  assert.equal(ledger.uiTruthRows.length, ledger.surfaceIds.length * ledger.uiTruths.length);
  assert.deepEqual(ledger.attendedRoles, ["emulator-supplementary", "samsung-physical"]);
  const [firstCaseId, secondCaseId] = ledger.remediationCaseIds;
  assert.throws(
    () => validateUiSurfaceRemediationCases([
      { surface_id: "UI-02-FIXTURE", remediation_cases: `${firstCaseId},${secondCaseId}` },
    ], ledger.remediationCaseIds),
    /source ledger is malformed/u,
  );
  assert.throws(
    () => validateUiSurfaceRemediationCases([
      { surface_id: "UI-02-FIXTURE", remediation_cases: `${firstCaseId}, ${firstCaseId}` },
    ], ledger.remediationCaseIds),
    /source ledger is malformed/u,
  );
  assert.throws(
    () => validateUiSurfaceRemediationCases([
      { surface_id: "UI-02-FIXTURE", remediation_cases: "RC-02-DOES-NOT-EXIST" },
    ], ledger.remediationCaseIds),
    /source ledger is malformed/u,
  );

  const flows = await enumeratePhase2MaestroFlows(projectRoot);
  const executions = flows.flatMap((flow) => flow.viewport === undefined
    ? [flow]
    : [flow]);
  const manifest = identityFixture();
  const evidence = {
    manifest,
    native: nativeFixture(manifest, ledger.nativeCaseIds),
    maestro: maestroFixture(manifest, flows, {
      inputSourceAudit: await collectPhase2InputSourceAudit(projectRoot),
      proceduralRemediationCaseExclusions:
        PHASE2_PROCEDURAL_REMEDIATION_CASE_IDS,
    }),
    benchmark: benchmarkFixture(manifest),
    roundtrip: roundtripFixture(manifest),
    coverage: coverageFixture(ledger.integrityCriticalFiles),
    requirements: ledger.requirements,
    decisions: ledger.decisions,
    edges: ledger.edges,
    uiTruths: ledger.uiTruths,
    prohibitions: ledger.prohibitions,
    sourceLedger: ledger,
    expectedFlows: flows,
  };

  assert.throws(
    () => validatePhase2AutomatedEvidence({
      ...evidence,
      coverage: coverageFixture(
        ledger.integrityCriticalFiles.filter((file) => file !== migrationPath),
      ),
    }, { requireRoundtrip: true }),
    /integrity coverage.*0010_owned_recommendations/u,
  );
  assert.throws(
    () => validatePhase2AutomatedEvidence({
      ...evidence,
      maestro: {
        ...evidence.maestro,
        procedural_remediation_case_exclusions: [],
      },
    }, { requireRoundtrip: true }),
    /procedural/u,
  );
  assert.throws(
    () => validatePhase2AutomatedEvidence({ ...evidence, maestro: null }, { requireRoundtrip: true }),
    /Maestro evidence is missing/u,
  );
  assert.throws(
    () => validatePhase2AutomatedEvidence({ ...evidence, maestro: { ...evidence.maestro, flows: evidence.maestro.flows.map((flow, index) => index === 0 ? { ...flow, report: "tampered.xml" } : flow) } }, { requireRoundtrip: true }),
    /Maestro execution/u,
  );
  assert.throws(
    () => validatePhase2AutomatedEvidence({ ...evidence, maestro: { ...evidence.maestro, flows: evidence.maestro.flows.map((flow, index) => index === 0 ? { ...flow, flow: "maestro/tampered.yaml" } : flow) } }, { requireRoundtrip: true }),
    /Maestro execution/u,
  );
  assert.throws(
    () => validatePhase2AutomatedEvidence({ ...evidence, maestro: { ...evidence.maestro, flows: evidence.maestro.flows.map((flow, index) => index === 0 ? { ...flow, viewport: { width_dp: 1 } } : flow) } }, { requireRoundtrip: true }),
    /Maestro execution/u,
  );
  assert.throws(
    () => validatePhase2AutomatedEvidence({ ...evidence, maestro: { ...evidence.maestro, flows: evidence.maestro.flows.map((flow, index) => index === 0 ? { ...flow, airplane_mode: !flow.airplane_mode } : flow) } }, { requireRoundtrip: true }),
    /Maestro execution/u,
  );
  const observedFlowIndex = evidence.maestro.flows.findIndex((flow) => flow.remediation_case_observations.length > 0);
  assert.ok(observedFlowIndex >= 0);
  assert.throws(
    () => validatePhase2AutomatedEvidence({ ...evidence, maestro: { ...evidence.maestro, flows: evidence.maestro.flows.map((flow, index) => index === observedFlowIndex ? { ...flow, remediation_case_observations: flow.remediation_case_observations.map((observation, observationIndex) => observationIndex === 0 ? { ...observation, observation: `${observation.observation} tampered` } : observation) } : flow) } }, { requireRoundtrip: true }),
    /Maestro execution|Maestro remediation observation/u,
  );
});

test("automated verifier rejects missing, duplicate, stale, physical, and final-output failures", async () => {
  const {
    collectPhase2SourceLedger,
    validatePhase2AutomatedEvidence,
  } = await load("scripts/verify-phase2-native-evidence.mjs");
  const {
    collectPhase2InputSourceAudit,
    enumeratePhase2MaestroFlows,
    PHASE2_PROCEDURAL_REMEDIATION_CASE_IDS,
  } = await load("scripts/run-phase2-maestro.mjs");
  const ledger = await collectPhase2SourceLedger(projectRoot);
  const flows = await enumeratePhase2MaestroFlows(projectRoot);
  const manifest = identityFixture();
  const evidence = {
    manifest,
    native: nativeFixture(manifest, ledger.nativeCaseIds),
    maestro: maestroFixture(manifest, flows, {
      inputSourceAudit: await collectPhase2InputSourceAudit(projectRoot),
      proceduralRemediationCaseExclusions:
        PHASE2_PROCEDURAL_REMEDIATION_CASE_IDS,
    }),
    benchmark: benchmarkFixture(manifest),
    roundtrip: roundtripFixture(manifest),
    coverage: coverageFixture(ledger.integrityCriticalFiles),
    requirements: ledger.requirements,
    decisions: ledger.decisions,
    edges: ledger.edges,
    uiTruths: ledger.uiTruths,
    prohibitions: ledger.prohibitions,
    sourceLedger: ledger,
    expectedFlows: flows,
  };

  const result = validatePhase2AutomatedEvidence(evidence, {
    requireRoundtrip: true,
  });
  assert.deepEqual(result.counts, {
    requirements: `${ledger.requirements.length}/${ledger.requirements.length}`,
    decisions: `${ledger.decisions.length}/${ledger.decisions.length}`,
    edges: `${ledger.edges.length}/${ledger.edges.length}`,
    ui_truths: `${ledger.uiTruths.length}/${ledger.uiTruths.length}`,
    prohibitions: `${ledger.prohibitions.length}/${ledger.prohibitions.length}`,
  });
  assert.throws(
    () => validatePhase2AutomatedEvidence({
      ...evidence,
      decisions: ledger.decisions.slice(1),
    }, { requireRoundtrip: true }),
    /decision/u,
  );
  assert.throws(
    () => validatePhase2AutomatedEvidence({
      ...evidence,
      edges: [...ledger.edges, ledger.edges[0]],
    }, { requireRoundtrip: true }),
    /duplicate/u,
  );
  assert.throws(
    () => validatePhase2AutomatedEvidence({
      ...evidence,
      native: {
        ...evidence.native,
        base_head: "f".repeat(40),
      },
    }, { requireRoundtrip: true }),
    /HEAD|identity/u,
  );
  assert.throws(
    () => validatePhase2AutomatedEvidence({
      ...evidence,
      coverage: coverageFixture(ledger.integrityCriticalFiles.slice(1)),
    }, { requireRoundtrip: true }),
    /coverage/u,
  );
  assert.throws(
    () => validatePhase2AutomatedEvidence({
      ...evidence,
      roundtrip: null,
    }, { requireRoundtrip: true }),
    /roundtrip/u,
  );
  assert.throws(
    () => validatePhase2AutomatedEvidence({
      ...evidence,
      physical: null,
    }, {
      requirePhysical: true,
      requireRoundtrip: true,
      outputPath: null,
    }),
    /physical/u,
  );
  assert.throws(
    () => validatePhase2AutomatedEvidence({
      ...evidence,
      physical: { status: "passed", rows: [] },
    }, {
      requirePhysical: true,
      requireRoundtrip: true,
      outputPath: null,
    }),
    /output/u,
  );
});

test("role-aware verifier requires hashed own-device evidence without raw payloads", async () => {
  const { collectPhase2SourceLedger, validatePhase2AutomatedEvidence } = await load("scripts/verify-phase2-native-evidence.mjs");
  const {
    buildPhase2AttendedChecklist,
    buildPhase2AttendedRoleRecord,
    parsePhase2AttendedChecklistBytes,
  } = await load("scripts/generate-phase2-attended-checklist.mjs");
  const { collectPhase2InputSourceAudit, enumeratePhase2MaestroFlows, PHASE2_PROCEDURAL_REMEDIATION_CASE_IDS } = await load("scripts/run-phase2-maestro.mjs");
  const ledger = await collectPhase2SourceLedger(projectRoot);
  const flows = await enumeratePhase2MaestroFlows(projectRoot);
  const manifest = identityFixture();
  const devices = {
    "emulator-supplementary": { model: manifest.device.model, api: manifest.device.api, abi: manifest.device.abi, serial_sha256: "e".repeat(64), installed_sha256: manifest.apk.sha256 },
    "samsung-physical": { model: "SM-S916B", api: 36, abi: "arm64-v8a", serial_sha256: "f".repeat(64), installed_sha256: manifest.apk.sha256 },
  };
  const checklist = buildPhase2AttendedChecklist({
    manifest, manifestPath: "artifacts/native/phase2/build.json", sourceLedger: ledger,
    emulator: devices["emulator-supplementary"],
    samsung: devices["samsung-physical"],
    generatedAt: "2026-08-23T00:00:00.000Z",
  });
  const checklistSha256 = parsePhase2AttendedChecklistBytes(
    Buffer.from(`${JSON.stringify(checklist, null, 2)}\n`),
    { manifest, sourceLedger: ledger, currentPlanningHead: manifest.base_head },
  ).sha256;
  const roleEvidence = (role) => buildPhase2AttendedRoleRecord({
    checklist, checklistSha256, role, device: devices[role],
    recordedAt: "2026-08-23T01:00:00.000Z",
  });
  const evidence = {
    manifest,
    native: nativeFixture(manifest, ledger.nativeCaseIds),
    maestro: maestroFixture(manifest, flows, { inputSourceAudit: await collectPhase2InputSourceAudit(projectRoot), proceduralRemediationCaseExclusions: PHASE2_PROCEDURAL_REMEDIATION_CASE_IDS }),
    benchmark: benchmarkFixture(manifest), roundtrip: roundtripFixture(manifest), coverage: coverageFixture(ledger.integrityCriticalFiles),
    requirements: ledger.requirements, decisions: ledger.decisions, edges: ledger.edges, uiTruths: ledger.uiTruths, prohibitions: ledger.prohibitions,
    sourceLedger: ledger, expectedFlows: flows,
    physical: { emulator: roleEvidence("emulator-supplementary"), samsung: roleEvidence("samsung-physical") },
    livePhysical: { emulator: devices["emulator-supplementary"], samsung: devices["samsung-physical"] },
    checklist, checklistSha256,
  };
  const finalResult = validatePhase2AutomatedEvidence(evidence, { requirePhysical: true, requireRoundtrip: true, outputPath: "artifacts/native/phase2/final-verification.json" });
  assert.equal(finalResult.approval_status, "approved");
  assert.deepEqual(finalResult.attended_devices, {
    "emulator-supplementary": devices["emulator-supplementary"],
    "samsung-physical": devices["samsung-physical"],
  });
  assert.equal(JSON.stringify(finalResult).includes(manifest.device.serial), false);
  assert.equal(Object.hasOwn(finalResult, "device"), false);
  assert.equal(validatePhase2AutomatedEvidence(evidence, { requirePhysical: true, requireRoundtrip: true, preflight: true }).mode, "attended-preflight");
  const finalOptions = { requirePhysical: true, requireRoundtrip: true, outputPath: "artifacts/native/phase2/final-verification.json" };
  assert.throws(() => validatePhase2AutomatedEvidence({ ...evidence, physical: { ...evidence.physical, samsung: { ...evidence.physical.samsung, device: { ...evidence.physical.samsung.device, serial: "raw" } } } }, finalOptions), /schema/u);
  assert.throws(() => validatePhase2AutomatedEvidence({ ...evidence, physical: { ...evidence.physical, samsung: { ...evidence.physical.samsung, apk_sha256: "a".repeat(64) } } }, finalOptions), /bound/u);
  assert.throws(() => validatePhase2AutomatedEvidence({ ...evidence, physical: { ...evidence.physical, samsung: { ...evidence.physical.samsung, rows: evidence.physical.samsung.rows.map((row, index) => index === 0 ? { ...row, observation_code: "ui-observed" } : row) } } }, finalOptions), /bound/u);
  assert.throws(() => validatePhase2AutomatedEvidence({ ...evidence, livePhysical: null }, finalOptions), /live-probed/u);
  assert.throws(() => validatePhase2AutomatedEvidence({ ...evidence, livePhysical: { ...evidence.livePhysical, samsung: { ...evidence.livePhysical.samsung, model: "SM-OTHER" } } }, finalOptions), /live device identity/u);
});

test("Phase 2 verifier modes fail closed around protected outputs", async () => {
  const { parsePhase2VerifierArgs, resolvePhase2VerifierMode } = await load(
    "scripts/verify-phase2-native-evidence.mjs",
  );
  const defaults = {
    attendedPreflight: false,
    automatedOnly: false,
    outputArgument: null,
    requirePhysical: false,
    requireRoundtrip: false,
    roundtripMode: null,
  };
  assert.deepEqual(resolvePhase2VerifierMode(defaults), {
    attendedPreflight: false,
    automatedOnly: true,
    requirePhysical: false,
  });
  assert.throws(
    () => resolvePhase2VerifierMode({
      ...defaults,
      outputArgument: "artifacts/native/phase2/final-verification.json",
    }),
    /only valid with --require-physical/u,
  );
  assert.throws(
    () => resolvePhase2VerifierMode({
      ...defaults,
      attendedPreflight: true,
      automatedOnly: true,
    }),
    /exactly one/u,
  );
  assert.throws(
    () => resolvePhase2VerifierMode({
      ...defaults,
      requirePhysical: true,
    }),
    /output.*physical/u,
  );
  assert.throws(
    () => resolvePhase2VerifierMode({
      ...defaults,
      automatedOnly: true,
      outputArgument: "roundtrip.json",
      roundtripMode: "temp-copy",
    }),
    /roundtrip producer.*verifier modes/u,
  );
  assert.throws(
    () => resolvePhase2VerifierMode({
      ...defaults,
      outputArgument: "roundtrip.json",
      requireRoundtrip: true,
      roundtripMode: "temp-copy",
    }),
    /roundtrip producer.*verifier modes/u,
  );
  assert.deepEqual(resolvePhase2VerifierMode({
    ...defaults,
    outputArgument: "artifacts/native/phase2/artifact-roundtrip.json",
    roundtripMode: "temp-copy",
  }), {
    attendedPreflight: false,
    automatedOnly: false,
    requirePhysical: false,
  });
  assert.deepEqual(resolvePhase2VerifierMode({
    ...defaults,
    requirePhysical: true,
    outputArgument: "artifacts/native/phase2/final-verification.json",
  }), {
    attendedPreflight: false,
    automatedOnly: false,
    requirePhysical: true,
  });
  for (const outputArgument of [
    "/tmp/final-verification.json",
    "../../final-verification.json",
    "package.json",
  ]) {
    assert.throws(() => resolvePhase2VerifierMode({
      ...defaults,
      requirePhysical: true,
      outputArgument,
    }), /final output.*artifacts\/native\/phase2/u);
  }
  assert.throws(() => parsePhase2VerifierArgs([
    "--manifest", "one.json", "--manifest=two.json",
  ]), /duplicate/u);
  assert.throws(() => parsePhase2VerifierArgs(["--output"]), /requires a value/u);
  assert.throws(() => parsePhase2VerifierArgs([
    "--roundtrip-temp", "--roundtrip-downloaded-dir", "downloads",
  ]), /duplicate/u);
});

test("Phase 2 verifier accepts only the exact canonical manifest path", async () => {
  const {
    executePhase2VerifierCli,
    resolvePhase2ManifestPath,
  } = await load("scripts/verify-phase2-native-evidence.mjs");
  const directory = await mkdtemp(path.join(tmpdir(), "phase2-manifest-path-"));
  const outside = await mkdtemp(path.join(tmpdir(), "phase2-manifest-outside-"));
  try {
    const artifactDirectory = path.join(directory, "artifacts/native/phase2");
    await mkdir(artifactDirectory, { recursive: true });
    const manifestPath = path.join(artifactDirectory, "build.json");
    await writeFile(manifestPath, "{}\n");
    const canonicalDirectory = await (await import("node:fs/promises"))
      .realpath(directory);
    assert.equal(resolvePhase2ManifestPath({
      root: directory,
      manifestArgument: "artifacts/native/phase2/build.json",
    }), path.join(canonicalDirectory, "artifacts/native/phase2/build.json"));

    for (const manifestArgument of [
      manifestPath,
      "./artifacts/native/phase2/build.json",
      "artifacts/native/phase2/../phase2/build.json",
      "artifacts/native/alternate/build.json",
      "../phase2/build.json",
    ]) {
      assert.throws(() => resolvePhase2ManifestPath({
        root: directory,
        manifestArgument,
      }), /manifest.*canonical.*artifacts\/native\/phase2\/build\.json/iu);
      await assert.rejects(executePhase2VerifierCli({
        args: ["--manifest", manifestArgument],
        root: directory,
        execFile: () => {
          throw new Error("manifest path must fail before executing commands");
        },
      }), /manifest.*canonical.*artifacts\/native\/phase2\/build\.json/iu);
    }

    const outsideManifest = path.join(outside, "build.json");
    await writeFile(outsideManifest, "{}\n");
    await rm(manifestPath);
    await (await import("node:fs/promises")).symlink(
      outsideManifest,
      manifestPath,
      "file",
    );
    assert.throws(() => resolvePhase2ManifestPath({
      root: directory,
      manifestArgument: "artifacts/native/phase2/build.json",
    }), /manifest.*symlink/iu);

    await rm(artifactDirectory, { force: true, recursive: true });
    await (await import("node:fs/promises")).symlink(
      outside,
      artifactDirectory,
      "dir",
    );
    assert.throws(() => resolvePhase2ManifestPath({
      root: directory,
      manifestArgument: "artifacts/native/phase2/build.json",
    }), /manifest.*symlink/iu);
  } finally {
    await rm(directory, { force: true, recursive: true });
    await rm(outside, { force: true, recursive: true });
  }
});

test("build-device verification rejects missing and split APK paths before reading bytes", async () => {
  const { liveInstalledIdentity } = await load(
    "scripts/verify-phase2-native-evidence.mjs",
  );
  const manifest = identityFixture();
  for (const output of [
    "",
    "package:/data/app/base.apk\npackage:/data/app/split_config.arm64_v8a.apk\n",
  ]) {
    const calls = [];
    assert.throws(() => liveInstalledIdentity(manifest, {
      executable: "adb-fixture",
      execFile: (_file, args) => {
        calls.push(args);
        return output;
      },
      root: projectRoot,
    }), /unavailable|split/u);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].slice(-4), [
      "shell", "pm", "path", manifest.package,
    ]);
  }
});

test("build-device verification bounds every synchronous ADB read", async () => {
  const {
    liveInstalledIdentity,
    PHASE2_ADB_COMMAND_TIMEOUT_MS,
  } = await load("scripts/verify-phase2-native-evidence.mjs");
  const manifest = identityFixture();
  const calls = [];
  const bytes = Buffer.from("apk-fixture");

  const identity = liveInstalledIdentity(manifest, {
    executable: "adb-fixture",
    execFile: (_file, args, options) => {
      calls.push({ args, options });
      return args.includes("path")
        ? "package:/data/app/base.apk\n"
        : bytes;
    },
    root: projectRoot,
  });

  assert.equal(calls.length, 2);
  assert.ok(calls.every(({ options }) =>
    options.timeout === PHASE2_ADB_COMMAND_TIMEOUT_MS
  ));
  assert.equal(identity.path, "/data/app/base.apk");
});

test("Phase 2 evidence modules have a one-way source-ledger import graph", async () => {
  const [generator, verifier, ledger] = await Promise.all([
    readFile(path.join(projectRoot, "scripts/generate-phase2-attended-checklist.mjs"), "utf8"),
    readFile(path.join(projectRoot, "scripts/verify-phase2-native-evidence.mjs"), "utf8"),
    readFile(path.join(projectRoot, "scripts/phase2-source-ledger.mjs"), "utf8"),
  ]);
  assert.doesNotMatch(generator, /verify-phase2-native-evidence\.mjs/u);
  assert.match(generator, /phase2-source-ledger\.mjs/u);
  assert.match(verifier, /generate-phase2-attended-checklist\.mjs/u);
  assert.match(verifier, /phase2-source-ledger\.mjs/u);
  assert.doesNotMatch(ledger, /generate-phase2-attended-checklist|verify-phase2-native-evidence/u);

  const visited = new Set();
  const active = new Set();
  const visit = async (relativePath) => {
    if (active.has(relativePath)) {
      throw new Error(`cyclic evidence import: ${[...active, relativePath].join(" -> ")}`);
    }
    if (visited.has(relativePath)) return;
    active.add(relativePath);
    const source = await readFile(path.join(projectRoot, relativePath), "utf8");
    const imports = [...source.matchAll(
      /(?:from\s+|import\s*\()"(\.\.?\/[^"]+\.mjs)"/gu,
    )].map((match) => path.posix.normalize(path.posix.join(
      path.posix.dirname(relativePath),
      match[1],
    )));
    for (const importedPath of imports) await visit(importedPath);
    active.delete(relativePath);
    visited.add(relativePath);
  };
  await visit("scripts/generate-phase2-attended-checklist.mjs");
  await visit("scripts/verify-phase2-native-evidence.mjs");
});

test("Phase 2 output resolver rejects symlink ancestors and accepts canonical artifact files", async () => {
  const { publishJsonNoClobber, resolvePhase2OutputPath } = await load(
    "scripts/verify-phase2-native-evidence.mjs",
  );
  const directory = await mkdtemp(path.join(tmpdir(), "phase2-output-path-"));
  const outside = await mkdtemp(path.join(tmpdir(), "phase2-output-outside-"));
  try {
    await mkdir(path.join(directory, "artifacts/native/phase2"), { recursive: true });
    const canonicalDirectory = await (await import("node:fs/promises")).realpath(directory);
    assert.equal(resolvePhase2OutputPath({
      root: directory,
      outputArgument: "artifacts/native/phase2/final-verification.json",
      kind: "final",
    }), path.join(
      canonicalDirectory,
      "artifacts/native/phase2/final-verification.json",
    ));
    const finalPath = path.join(
      canonicalDirectory,
      "artifacts/native/phase2/final-verification.json",
    );
    await publishJsonNoClobber(finalPath, { status: "first" });
    const firstBytes = await readFile(finalPath, "utf8");
    await assert.rejects(
      publishJsonNoClobber(finalPath, { status: "second" }),
      /EEXIST/u,
    );
    assert.equal(await readFile(finalPath, "utf8"), firstBytes);
    await rm(finalPath);
    await rm(path.join(directory, "artifacts/native/phase2"), { recursive: true });
    await (await import("node:fs/promises")).symlink(
      outside,
      path.join(directory, "artifacts/native/phase2"),
      "dir",
    );
    assert.throws(() => resolvePhase2OutputPath({
      root: directory,
      outputArgument: "artifacts/native/phase2/final-verification.json",
      kind: "final",
    }), /symlink/u);
  } finally {
    await rm(directory, { force: true, recursive: true });
    await rm(outside, { force: true, recursive: true });
  }
});

test("temp and downloaded roundtrip fixtures preserve exact APK identity", async () => {
  const { producePhase2RoundtripEvidence } = await load(
    "scripts/verify-phase2-native-evidence.mjs",
  );
  const directory = await mkdtemp(path.join(tmpdir(), "phase2-roundtrip-test-"));
  try {
    const retained = path.join(directory, "retained.apk");
    const downloadedDirectory = path.join(directory, "downloaded");
    const downloaded = path.join(
      downloadedDirectory,
      "gym-tracker-phase2-devtest.apk",
    );
    await writeFile(retained, "same");
    await writeFile(downloaded, "same").catch(async () => {
      const { mkdir } = await import("node:fs/promises");
      await mkdir(downloadedDirectory, { recursive: true });
      await writeFile(downloaded, "same");
    });
    const manifest = {
      ...identityFixture(),
      apk: {
        ...identityFixture().apk,
        path: retained,
        sha256: "0967115f2813a3541eaef77de9d9d5773f1c0c04314b0bbfe4ff3b3b1c55b5d5",
      },
      installed_apk: {
        ...identityFixture().installed_apk,
        sha256: "0967115f2813a3541eaef77de9d9d5773f1c0c04314b0bbfe4ff3b3b1c55b5d5",
      },
    };

    const tempResult = await producePhase2RoundtripEvidence({
      manifest,
      mode: "temp-copy",
      copiedApkPath: path.join(directory, "temp.apk"),
      installedSha256: manifest.apk.sha256,
    });
    assert.equal(tempResult.status, "passed");
    const downloadedResult = await producePhase2RoundtripEvidence({
      manifest,
      mode: "downloaded-directory",
      copiedApkPath: downloaded,
      installedSha256: manifest.apk.sha256,
    });
    assert.equal(downloadedResult.status, "passed");
    await writeFile(downloaded, "changed");
    await assert.rejects(
      producePhase2RoundtripEvidence({
        manifest,
        mode: "downloaded-directory",
        copiedApkPath: downloaded,
        installedSha256: manifest.apk.sha256,
      }),
      /digest|identity/u,
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("package commands reference real Phase 2 scripts and exclude attended files", async () => {
  const packageJson = JSON.parse(
    await readFile(path.join(projectRoot, "package.json"), "utf8"),
  );
  for (const name of [
    "test:maestro:phase2",
    "benchmark:phase2",
    "verify:native:phase2",
    "ci:phase2",
  ]) {
    assert.equal(typeof packageJson.scripts?.[name], "string");
  }
  assert.match(
    packageJson.scripts["test:maestro:phase2"],
    /run-phase2-maestro\.mjs/u,
  );
  assert.match(
    packageJson.scripts["benchmark:phase2"],
    /benchmark-phase2\.mjs/u,
  );
  assert.match(
    packageJson.scripts["verify:native:phase2"],
    /verify-phase2-native-evidence\.mjs/u,
  );
  assert.doesNotMatch(
    packageJson.scripts["ci:phase2"],
    /physical-result|final-verification|require-physical/u,
  );
});

test("native contract runner compiles its source-owned case parser", async () => {
  const runner = await readFile(
    path.join(projectRoot, "scripts/run-native-sqlite-contracts.mjs"),
    "utf8",
  );
  const template = runner.match(/new RegExp\(\s*`([^`]+)`/u)?.[1];
  assert.equal(typeof template, "string");
  const createPattern = Function(
    "exportName",
    `return \`${template}\`;`,
  );
  const pattern = createPattern("PHASE2_CONTENT_CASE_IDS");
  const expression = new RegExp(pattern, "u");
  const contract = await readFile(
    path.join(
      projectRoot,
      "src/testing/contracts/phase2Content.contract.ts",
    ),
    "utf8",
  );
  const caseBlock = contract.match(expression)?.[1] ?? "";
  const caseIds = [
    ...caseBlock.matchAll(/"([a-z0-9-]+)"/gu),
  ].map((match) => match[1]);

  assert.deepEqual(caseIds, [
    "content-accepted-fresh-import",
    "content-retained-v2-upgrade",
    "content-retained-v3-upgrade",
    "content-retained-v4-upgrade",
    "content-d50-d51-update",
    "content-replay-rollback",
  ]);
  assert.match(
    runner,
    /'migrations-effects': MIGRATIONS_EFFECTS_CASE_IDS/u,
  );
  assert.doesNotMatch(
    runner,
    /'migrations-effects': SQLITE_KERNEL_CASE_IDS/u,
  );
});

test("native contract log transport reassembles bounded aggregate records", async () => {
  const {
    NATIVE_CONTRACT_CASE_MARKER,
    NATIVE_CONTRACT_ERROR_MARKER,
    NATIVE_CONTRACT_PROGRESS_MARKER,
    NATIVE_CONTRACT_RESULT_MARKER,
    parseNativeContractLogFailure,
    parseNativeContractLogOutput,
    parseNativeContractLogProgress,
  } = await load("scripts/native-contract-log-transport.mjs");
  const runId = "phase2-fixture";
  const cases = [
    { id: "case-a", status: "passed", durationMs: 1 },
    { id: "case-b", status: "passed", durationMs: 2 },
  ];
  const summary = {
    schemaVersion: 1,
    contractVersion: 1,
    status: "passed",
    total: 2,
    passed: 2,
    failed: 0,
    skipped: 0,
    startedAt: "2026-08-18T00:00:00.000Z",
    finishedAt: "2026-08-18T00:00:01.000Z",
  };
  const output = [
    `${NATIVE_CONTRACT_CASE_MARKER}${JSON.stringify({
      runId,
      case: cases[0],
    })}`,
    `${NATIVE_CONTRACT_CASE_MARKER}${JSON.stringify({
      runId,
      case: cases[1],
    })}`,
    `${NATIVE_CONTRACT_RESULT_MARKER}${JSON.stringify({ runId, summary })}`,
  ].join("\n");

  assert.deepEqual(parseNativeContractLogOutput(output, runId), {
    ...summary,
    cases,
  });
  assert.equal(
    parseNativeContractLogOutput(output.replace(output.split("\n")[1], ""), runId),
    undefined,
  );
  assert.equal(
    parseNativeContractLogProgress(
      `${NATIVE_CONTRACT_PROGRESS_MARKER}${JSON.stringify({
        runId,
        stage: "sqlite-kernel:connection-configuration",
      })}`,
      runId,
    ),
    "sqlite-kernel:connection-configuration",
  );
  assert.equal(
    parseNativeContractLogProgress(
      `${NATIVE_CONTRACT_PROGRESS_MARKER}${JSON.stringify({
        runId: "other-run",
        stage: "sqlite-kernel:connection-configuration",
      })}`,
      runId,
    ),
    undefined,
  );
  assert.equal(
    parseNativeContractLogOutput(`${output}\n${output.split("\n")[0]}`, runId),
    undefined,
  );
  assert.deepEqual(
    parseNativeContractLogOutput(
      `${NATIVE_CONTRACT_RESULT_MARKER}${JSON.stringify({
        ...summary,
        cases,
      })}`,
      runId,
    ),
    { ...summary, cases },
  );
  assert.equal(
    parseNativeContractLogFailure(
      `${NATIVE_CONTRACT_ERROR_MARKER}${JSON.stringify({
        runId,
        errorCode: "phase2_fts_contract_failed",
      })}`,
      runId,
    ),
    "phase2_fts_contract_failed",
  );
  assert.equal(
    parseNativeContractLogFailure(
      `${NATIVE_CONTRACT_ERROR_MARKER}${JSON.stringify({
        runId: "other-run",
        errorCode: "phase2_fts_contract_failed",
      })}`,
      runId,
    ),
    undefined,
  );
});

test("aggregate native contract route reports a bounded run-scoped failure", async () => {
  const route = await readFile(
    path.join(projectRoot, "app/__native-contracts.tsx"),
    "utf8",
  );
  const runner = await readFile(
    path.join(projectRoot, "scripts/run-native-sqlite-contracts.mjs"),
    "utf8",
  );

  assert.match(route, /GYM_TRACKER_SQLITE_CONTRACT_ERROR:/u);
  assert.match(route, /GYM_TRACKER_SQLITE_CONTRACT_PROGRESS:/u);
  assert.match(route, /sqlite-kernel:.*caseId/u);
  assert.match(route, /phase2-plan:\$\{caseId\}/u);
  assert.match(route, /throw new Error\(firstContractFailureCode\(/u);
  assert.match(route, /const errorCode = boundedErrorCode\(error\)/u);
  assert.doesNotMatch(route, /error\.stack/u);
  assert.match(runner, /parseNativeContractLogFailure/u);
  assert.match(runner, /parseNativeContractLogProgress/u);
  assert.match(runner, /Native contract aggregate stalled:/u);
  assert.match(runner, /Native contract route failed:/u);
});

test("Phase 2 device producers use bounded ADB reads and a real benchmark deadline", async () => {
  const nativeRunner = await readFile(
    path.join(projectRoot, "scripts/run-native-sqlite-contracts.mjs"),
    "utf8",
  );
  const benchmarkRunner = await readFile(
    path.join(projectRoot, "scripts/benchmark-phase2.mjs"),
    "utf8",
  );
  const verifier = await load("scripts/verify-phase2-native-evidence.mjs");

  assert.match(nativeRunner, /NATIVE_ADB_LOGCAT_TIMEOUT_MS = 15_000/u);
  assert.match(nativeRunner, /Math\.min\(NATIVE_ADB_LOGCAT_TIMEOUT_MS, remainingMs\)/u);
  assert.match(benchmarkRunner, /PHASE2_ADB_LOGCAT_TIMEOUT_MS = 15_000/u);
  assert.match(benchmarkRunner, /PHASE2_ADB_APK_READ_TIMEOUT_MS = 60_000/u);
  assert.match(benchmarkRunner, /PHASE2_BENCHMARK_WAIT_TIMEOUT_MS = 600_000/u);
  assert.match(benchmarkRunner, /Date\.now\(\) < deadline/u);
  assert.match(benchmarkRunner, /Math\.min\(PHASE2_ADB_LOGCAT_TIMEOUT_MS, remainingMs\)/u);
  assert.match(benchmarkRunner, /adb installed-byte read timed out after/u);
  assert.ok(benchmarkRunner.includes(
    '`gymtracker-devtest://__phase2-benchmark?samples=${samples}`,\n      manifest.package,\n    ],\n    { timeoutMs: PHASE2_ADB_APK_READ_TIMEOUT_MS },',
  ));
  assert.equal(verifier.PHASE2_ADB_COMMAND_TIMEOUT_MS, 60_000);
});

test("aggregate native polling budget scales with the source-owned case count", async () => {
  const runner = await readFile(
    path.join(projectRoot, "scripts/run-native-sqlite-contracts.mjs"),
    "utf8",
  );
  const route = await readFile(
    path.join(projectRoot, "app/__native-contracts.tsx"),
    "utf8",
  );

  assert.match(runner, /PHASE2_AGGREGATE_TIMEOUT_MS = 300_000/u);
  assert.match(runner, /PHASE2_CASE_TIMEOUT_MS = 10_000/u);
  assert.ok(runner.includes(
    "DEFAULT_NATIVE_TIMEOUT_MS\n          + expectedPhase2Cases.length * PHASE2_CASE_TIMEOUT_MS",
  ));
  assert.match(runner, /Date\.now\(\) < deadline/u);
  assert.doesNotMatch(runner, /within 90 seconds/u);
  assert.match(route, /GYM_TRACKER_SQLITE_CONTRACT_CASE:/u);
  assert.match(route, /summary: \{/u);
  assert.doesNotMatch(
    route,
    /selectedSuite === "phase2"[\s\S]{0,900}JSON\.stringify\(result\)/u,
  );
});

test("starter-activating Maestro flows wait for asynchronous readiness", async () => {
  for (const relativePath of [
    "maestro/lifecycle/rest-recovery.yaml",
    "maestro/phase2/library-exercises.yaml",
    "maestro/smoke/phase1-airplane-repeat.yaml",
    "maestro/smoke/phase1-denied-late-notifications.yaml",
    "maestro/smoke/phase1-full-loop.yaml",
  ]) {
    const flow = await readFile(path.join(projectRoot, relativePath), "utf8");
    const activationCount = flow.match(
      /- tapOn: "Use Full Body Foundation"/gu,
    )?.length ?? 0;
    const guardedCount = flow.match(
      /- extendedWaitUntil:\n    visible: "Use Full Body Foundation"\n    timeout: 90000\n- tapOn: "Use Full Body Foundation"/gu,
    )?.length ?? 0;

    assert.ok(activationCount > 0, `${relativePath} has no starter activation`);
    assert.equal(guardedCount, activationCount, relativePath);
  }
});

test("schedule flow reopens the active plan from authoritative state", async () => {
  const flow = await readFile(
    path.join(projectRoot, "maestro/phase2/schedule-cross-profile.yaml"),
    "utf8",
  );

  assert.match(
    flow,
    /- assertVisible: "Push \/ Pull \/ Legs"\n- scrollUntilVisible:\n    element:\n      text: "Activate plan"\n    direction: DOWN\n- tapOn: "Activate plan"/u,
  );
  assert.match(
    flow,
    /- assertVisible: "Push \/ Pull \/ Legs is active"\n- stopApp\n- launchApp:\n    clearState: false\n    permissions:\n      notifications: deny\n- assertVisible: "Today"\n- extendedWaitUntil:\n    visible: "\^\(Choose another day\|Train anyway\)\$"\n    timeout: 90000\n- tapOn: "Library"\n- scrollUntilVisible:\n    element:\n      text: "Active Plan"\n    direction: DOWN\n    centerElement: true[\s\S]*- tapOn:\n    text: "Push \/ Pull \/ Legs\. Active\.\*"/u,
  );
  assert.match(
    flow,
    /- assertVisible: "Save this schedule\?"\n- tapOn: "Save schedule"\n- extendedWaitUntil:\n    visible: "Save plan"\n    timeout: 30000\n- stopApp\n- launchApp:\n    clearState: false\n    permissions:\n      notifications: deny\n- assertVisible: "Today"\n- assertVisible: "Device timezone changed"/u,
  );
  assert.match(
    flow,
    /- tapOn: "Repeat"\n- assertVisible: "Repeat Pull\?"\n- tapOn: "Repeat"\n- waitForAnimationToEnd\n- assertVisible: "Pull"\n- tapOn: "Advance"\n- assertVisible: "Advance Pull\?"\n- tapOn: "Advance"\n- extendedWaitUntil:\n    visible: "Rest day"\n    timeout: 30000\n- assertVisible: "Next scheduled workout · Push · \.\*"/u,
  );
  assert.match(
    flow,
    /- launchApp:\n    clearState: true\n    permissions:\n      notifications: deny[\s\S]*- assertVisible: "Push"\n- tapOn: "Skip"\n- assertVisible: "Skip Push\?"\n- tapOn: "Skip"\n- extendedWaitUntil:\n    visible: "Rest day"\n    timeout: 30000\n- assertVisible: "Next scheduled workout · Pull · \.\*"/u,
  );
});

test("fresh Phase 2 Library flows wait until root navigation is trusted", async () => {
  for (const relativePath of [
    "maestro/phase2/custom-exercise-lifecycle.yaml",
    "maestro/phase2/library-exercises.yaml",
    "maestro/phase2/owned-plan-editor.yaml",
    "maestro/phase2/plan-impact-replacement.yaml",
    "maestro/phase2/schedule-cross-profile.yaml",
    "maestro/phase2/starter-activation.yaml",
  ]) {
    const flow = await readFile(path.join(projectRoot, relativePath), "utf8");

    assert.match(
      flow,
      /- assertVisible: "Today"\n- extendedWaitUntil:\n    visible: "Use Full Body Foundation"\n    timeout: 90000\n- tapOn: "Library"/u,
      relativePath,
    );
  }
});

test("Library exercise flow waits for trusted Today after process restart", async () => {
  const flow = await readFile(
    path.join(projectRoot, "maestro/phase2/library-exercises.yaml"),
    "utf8",
  );

  assert.match(
    flow,
    /- stopApp\n- launchApp:\n    clearState: false\n    stopApp: true\n    permissions:\n      notifications: deny\n- assertVisible: "Today"\n- extendedWaitUntil:\n    visible: "Use Full Body Foundation"\n    timeout: 90000\n- tapOn: "Library"\n- assertVisible: "Search exercises"/u,
  );
});

test("every Maestro rest control is expanded in its current mounted dock", async () => {
  const controlPattern = /- tapOn: "(Skip rest|Pause rest|Resume rest)"/gu;
  const resetPattern = /- (?:launchApp:|stopApp|killApp|tapOn: "Complete Set \d+")/u;
  const expandPattern = /- tapOn: "Expand rest controls"/u;
  const collapsePattern = /- tapOn: "Collapse rest controls"/u;

  for (const relativePath of await maestroYamlPaths()) {
    const lines = (await readFile(path.join(projectRoot, relativePath), "utf8"))
      .split(/\r?\n/u);
    let expanded = false;
    for (const [index, line] of lines.entries()) {
      if (resetPattern.test(line)) {
        expanded = false;
      }
      if (expandPattern.test(line)) {
        expanded = true;
      } else if (collapsePattern.test(line)) {
        expanded = false;
      }
      if (controlPattern.test(line)) {
        assert.equal(expanded, true, relativePath + ":" + (index + 1));
      }
      controlPattern.lastIndex = 0;
    }
  }
});

test("every Maestro workout completion targets the actionable finish control", async () => {
  const finishPattern = /- tapOn: "Finish workout"/gu;
  const guardedFinishPattern = /- scrollUntilVisible:\n    element:\n      text: "Finish workout"\n    direction: UP\n    centerElement: true\n- assertVisible: "Finish workout"\n- tapOn: "Finish workout"/gu;

  for (const relativePath of await maestroYamlPaths()) {
    const flow = await readFile(path.join(projectRoot, relativePath), "utf8");
    const finishCount = flow.match(finishPattern)?.length ?? 0;
    const guardedFinishCount = flow.match(guardedFinishPattern)?.length ?? 0;

    assert.doesNotMatch(flow, /"Exercise complete"/u, relativePath);
    assert.equal(guardedFinishCount, finishCount, relativePath);
  }
});

test("notification control flows reveal Return to Today before tapping it", async () => {
  const notificationRoutePrefix =
    '- openLink: "gymtracker-devtest://__notification-test-controls?';
  const returnTapPattern = /^- tapOn: "Return to Today"$/u;
  const guardedReturnPattern = [
    "- scrollUntilVisible:",
    "    element:",
    '      text: "Return to Today"',
    "    direction: DOWN",
    "    centerElement: true",
  ];

  for (const relativePath of await maestroYamlPaths()) {
    const lines = (await readFile(path.join(projectRoot, relativePath), "utf8"))
      .split(/\r?\n/u);
    let notificationRouteOpen = false;
    for (const [index, line] of lines.entries()) {
      if (line.startsWith(notificationRoutePrefix)) {
        notificationRouteOpen = true;
      } else if (notificationRouteOpen && returnTapPattern.test(line)) {
        assert.deepEqual(
          lines.slice(index - guardedReturnPattern.length, index),
          guardedReturnPattern,
          relativePath + ":" + (index + 1),
        );
        notificationRouteOpen = false;
      }
    }
  }
});

test("post-restart root actions wait for trusted Today content", async () => {
  const rootTapPattern =
    /^- tapOn: "(?:Appearance and rest-alert settings|Calendar|Library|Progress|Today)"$/u;
  const trustedAssertPattern =
    /^- assertVisible: "(?:Device timezone changed|Rest day|Workout in progress)"$/u;
  const trustedWaitTargets = new Set([
    '    visible: "Use Full Body Foundation"',
    '    visible: "Resume workout"',
    '    visible: "^(Choose another day|Train anyway)$"',
  ]);
  for (const relativePath of await maestroYamlPaths()) {
    const lines = (await readFile(path.join(projectRoot, relativePath), "utf8"))
      .split(/\r?\n/u);
    let restartPending = false;
    let trusted = false;
    for (const [index, line] of lines.entries()) {
      if (line === "- stopApp" || line === "- killApp") {
        restartPending = true;
        trusted = false;
      } else if (restartPending && trustedAssertPattern.test(line)) {
        trusted = true;
      } else if (
        restartPending
        && line === "- extendedWaitUntil:"
        && trustedWaitTargets.has(lines[index + 1] ?? "")
      ) {
        trusted = true;
      } else if (restartPending && rootTapPattern.test(line)) {
        assert.equal(trusted, true, relativePath + ":" + (index + 1));
        restartPending = false;
      }
    }
  }
});

test("starter restart opens alternate day on scheduled and rest days", async () => {
  const flow = await readFile(
    path.join(projectRoot, "maestro/phase2/starter-activation.yaml"),
    "utf8",
  );

  assert.match(
    flow,
    /- extendedWaitUntil:\n    visible: "\^\(Choose another day\|Train anyway\)\$"\n    timeout: 90000\n- tapOn: "Today"\n- runFlow:\n    when:\n      visible: "Choose another day"\n    commands:\n      - tapOn: "Choose another day"\n- runFlow:\n    when:\n      visible: "Train anyway"\n    commands:\n      - tapOn: "Train anyway"\n- extendedWaitUntil:\n    visible: "Start Back"\n    timeout: 30000\n- tapOn: "Start Back"/u,
  );
  assert.match(
    flow,
    /- assertVisible: "Activate Gym Body-Part Split\?"\n- tapOn: "Activate plan"\n- scrollUntilVisible:\n    element:\n      text: "Previous plans and schedules remain available as inactive copies\."\n    direction: DOWN\n    centerElement: true\n    timeout: 60000\n- assertVisible: "Previous plans and schedules remain available as inactive copies\."\n- assertVisible: "Gym Body-Part Split is active"/u,
  );
});

test("rest alert remediation follows authoritative expiry and active-set labels", async () => {
  const flow = await readFile(
    path.join(projectRoot, "maestro/phase2/remediation-rest-alerts.yaml"),
    "utf8",
  );

  assert.match(
    flow,
    /- runFlow: "\.\.\/subflows\/phase1-start-full-body-a\.yaml"\n- scrollUntilVisible:\n    element:\n      text: "Complete Set 1"\n    direction: DOWN\n    centerElement: true\n    timeout: 60000\n- tapOn: "Complete Set 1"/u,
  );
  assert.match(
    flow,
    /- tapOn: "Resume workout"\n- assertVisible: "Rest ended"\n- tapOn: "Dismiss rest notice"\n- scrollUntilVisible:\n    element:\n      text: "Complete Set 2"\n    direction: DOWN\n    centerElement: true\n    timeout: 60000/u,
  );
  assert.match(
    flow,
    /- tapOn: "Pause rest"\n- assertVisible: "REST PAUSED · NEXT: SET 3 AT 60 kg × 8"\n- assertVisible: "Resume rest"\n- tapOn: "Resume rest"\n- assertVisible: "RESTING · NEXT: SET 3 AT 60 kg × 8"/u,
  );
});

test("plan impact flow reaches replacement scope and impact without assuming catalog-section order", async () => {
  const flow = await readFile(
    path.join(projectRoot, "maestro/phase2/plan-impact-replacement.yaml"),
    "utf8",
  );

  assert.match(
    flow,
    /text: "Barbell Incline Bench Press\.\*Compatible metric identity"[\s\S]*?- tapOn:\n    text: "Barbell Incline Bench Press\.\*Compatible metric identity"[\s\S]*?- scrollUntilVisible:\n    element:\n      text: "This occurrence"\n    direction: UP\n    timeout: 60000\n- assertVisible: "This occurrence"/u,
  );
  assert.doesNotMatch(
    flow,
    /text: "This occurrence"\n    direction: UP\n    centerElement:/u,
  );
  assert.doesNotMatch(flow, /Other metric identities/u);
  assert.match(
    flow,
    /- assertVisible: "This occurrence"\n- tapOn: "This occurrence"\n- scrollUntilVisible:\n    element:\n      text: "1 affected occurrence"\n    direction: DOWN\n    centerElement: true\n- scrollUntilVisible:\n    element:\n      text: "All occurrences in this plan"\n    direction: UP/u,
  );
  assert.match(
    flow,
    /text: "Exercise impact"\n    direction: DOWN\n    centerElement: true\n- repeat:\n    times: 48\n    while:\n      notVisible: "Review current values"\n    commands:\n      - swipe:\n          start: 95%, 75%\n          end: 95%, 25%\n          duration: 300\n- assertVisible: "Review current values"\n- scrollUntilVisible:\n    element:\n      text: "Compatibility does not mean historical comparability\. Existing sessions and snapshots are unchanged\."\n    direction: DOWN\n- assertVisible: "Compatibility does not mean historical comparability\. Existing sessions and snapshots are unchanged\."/u,
  );
  assert.match(
    flow,
    /text: "History remains unchanged"\n    direction: DOWN\n- tapOn: "History remains unchanged"\n- scrollUntilVisible:\n    element:\n      text: "Save replacement"\n    direction: DOWN\n- tapOn: "Save replacement"/u,
  );
});

test("plan impact workout start normalizes scheduled and rest-day states", async () => {
  const flow = await readFile(
    path.join(projectRoot, "maestro/phase2/plan-impact-replacement.yaml"),
    "utf8",
  );

  assert.match(flow, /visible: "\^\(Start Upper A\|Choose another day\|Train anyway\)\$"/u);
  assert.match(flow, /visible: "Choose another day"[\s\S]*tapOn: "Choose another day"/u);
  assert.match(flow, /visible: "Train anyway"[\s\S]*tapOn: "Train anyway"/u);
  assert.match(
    flow,
    /- extendedWaitUntil:\n    visible: "Start Upper A"\n    timeout: 30000\n- tapOn: "Start Upper A"\n- extendedWaitUntil:\n    visible: "FOCUSED WORKOUT"\n    timeout: 30000/u,
  );
});

test("plan impact waits for editor identity before reviewing saved state", async () => {
  const flow = await readFile(
    path.join(projectRoot, "maestro/phase2/plan-impact-replacement.yaml"),
    "utf8",
  );

  assert.equal(flow.match(/visible: "Save plan"/gu)?.length, 2);
  assert.doesNotMatch(
    flow,
    /text: "Go back"\n    direction: UP\n    centerElement: true/u,
  );
});

test("Library exercise flow reaches compact Plans sections before asserting them", async () => {
  const flow = await readFile(
    path.join(projectRoot, "maestro/phase2/library-exercises.yaml"),
    "utf8",
  );

  for (const heading of ["My Plans", "Starter Plans"]) {
    assert.match(
      flow,
      new RegExp(
        `- scrollUntilVisible:\\n    element:\\n      text: "${heading}"\\n    direction: DOWN\\n    centerElement: true\\n- assertVisible: "${heading}"`,
        "u",
      ),
    );
  }
  assert.match(
    flow,
    /- assertVisible: "Starter Plans"\n- scrollUntilVisible:\n    element:\n      text: "Exercises"\n    direction: UP\n    centerElement: true\n- tapOn: "Exercises"/u,
  );
  assert.match(
    flow,
    /- tapOn: "Finish as partial"\n- assertVisible: "Save partial workout\?"\n- tapOn:\n    id: "save-partial-workout-confirm"\n- assertVisible: "Workout saved"/u,
  );
  assert.match(
    flow,
    /- tapOn: "Clear search exercises"\n- hideKeyboard\n- tapOn: "Filter"[\s\S]*- tapOn: "Equipment · Barbell"\n- scrollUntilVisible:\n    element:\n      text: "Show results"\n    direction: DOWN\n- tapOn: "Show results"\n- assertVisible: "Results"\n- scrollUntilVisible:\n    element:\n      text: "Back Squat"\n    direction: DOWN\n    centerElement: true\n- assertVisible: "Back Squat"/u,
  );
  assert.match(
    flow,
    /- assertVisible: "Back Squat"\n- scrollUntilVisible:\n    element:\n      text: "Clear filters"\n    direction: UP\n    centerElement: true\n- tapOn: "Clear filters"\n- tapOn: "Search exercises"\n- inputText: "bench-press"\n- hideKeyboard\n- extendedWaitUntil:\n    visible: "Add Bench Press to favorites"\n    timeout: 90000[\s\S]*- scrollUntilVisible:\n    element:\n      text: "Favorites"\n    direction: DOWN\n    centerElement: true\n- assertVisible: "Favorites"/u,
  );
});

test("fresh plan flows scroll to compact Library sections before assertions", async () => {
  const expectations = [
    ["maestro/phase2/owned-plan-editor.yaml", "My Plans"],
    ["maestro/phase2/plan-impact-replacement.yaml", "Starter Plans"],
    ["maestro/phase2/starter-activation.yaml", "Starter Plans"],
  ];

  for (const [relativePath, heading] of expectations) {
    const flow = await readFile(path.join(projectRoot, relativePath), "utf8");
    assert.match(
      flow,
      new RegExp(
        `- tapOn: "Library"\\n- scrollUntilVisible:\\n    element:\\n      text: "${heading}"\\n    direction: DOWN\\n    centerElement: true\\n- assertVisible: "${heading}"`,
        "u",
      ),
      relativePath,
    );
  }
});

test("starter installed flow does not claim an update from a current template copy", async () => {
  const flow = await readFile(
    path.join(projectRoot, "maestro/phase2/starter-activation.yaml"),
    "utf8",
  );
  const componentTests = await readFile(
    path.join(projectRoot, "src/ui/__tests__/StarterPlans.test.tsx"),
    "utf8",
  );
  const integrationTests = await readFile(
    path.join(
      projectRoot,
      "tests/integration/starter-activation-repository.test.ts",
    ),
    "utf8",
  );

  assert.doesNotMatch(flow, /Template update available/u);
  assert.doesNotMatch(
    flow,
    /- tapOn: "Use Full Body Foundation"\n- tapOn: "Activate Full Body Foundation"\n- tapOn: "Library"/u,
  );
  assert.match(
    componentTests,
    /describe\("starter template update"[\s\S]*shows the full independent-copy diff and exposes only Create new copy/u,
  );
  assert.match(
    integrationTests,
    /creates a newer inactive comparison copy without mutating active plan, schedule, or workout/u,
  );
});

test("custom exercise flow scrolls through the long editor contract", async () => {
  const segmentPaths = [
    "maestro/phase2/custom-exercise-lifecycle.yaml",
    "maestro/phase2/custom-exercise-lifecycle2-copy.yaml",
    "maestro/phase2/custom-exercise-lifecycle2-edit-archive.yaml",
    "maestro/phase2/custom-exercise-lifecycle3-active-workout.yaml",
    "maestro/phase2/custom-exercise-lifecycle4-00-schedule-workout.yaml",
    "maestro/phase2/custom-exercise-lifecycle4-active-workout-block.yaml",
    "maestro/phase2/custom-exercise-lifecycle4-profile-migration.yaml",
  ];
  const segments = await Promise.all(segmentPaths.map((relativePath) =>
    readFile(path.join(projectRoot, relativePath), "utf8")
  ));
  const flow = segments.join("\n");
  const migrationFlow = segments.at(-1);
  assert.ok(migrationFlow);

  for (const text of [
    "Choose explicitly. No profile is preselected or inferred.",
    "Timed hold.*",
  ]) {
    assert.match(
      flow,
      new RegExp(
        `- scrollUntilVisible:\\n    element:\\n      text: "${
          text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")
        }"\\n    direction: DOWN\\n    centerElement: true`,
        "u",
      ),
      text,
    );
  }
  for (const label of [
    "Target 1 minimum reps",
    "Target 1 maximum reps",
    "Target 1 variation",
    "Target 2 minimum reps",
    "Target 2 maximum reps",
    "Target 2 variation",
  ]) {
    assert.match(
      migrationFlow,
      new RegExp(
        `text: "${label}"\\n    direction: DOWN\\n    centerElement: true\\n    timeout: 60000`,
        "u",
      ),
      label,
    );
  }
  assert.match(
    migrationFlow,
    /- tapOn: "Save profile change"\n- extendedWaitUntil:\n    visible: "Exercise facts"\n    timeout: 60000\n- scrollUntilVisible:\n    element:\n      text: "View exercise history"\n    direction: DOWN\n    timeout: 60000\n- tapOn: "View exercise history"\n- assertVisible: "Exercise history"\n- assertVisible: "Maestro Plank Edited"\n- assertVisible: "No comparable working sets yet"/u,
  );
  assert.doesNotMatch(migrationFlow, /No history yet/u);
  assert.match(
    segments[0],
    /- scrollUntilVisible:\n    element:\n      text: "No automatic progression policy is configured\. Future target changes require your decision\."\n    direction: DOWN\n    centerElement: true\n    timeout: 60000\n- assertVisible: "No automatic progression policy is configured\. Future target changes require your decision\."\n- assertVisible: "Hold \/ manual decision"\n- tapOn:\n    id: "exercise-editor-save"/u,
  );
  for (const id of [
    "exercise-editor-name",
    "exercise-editor-primary-muscles",
    "exercise-editor-equipment",
    "exercise-editor-save",
    "owned-plan-add-exercise",
    "owned-plan-exercise-search",
  ]) {
    assert.match(flow, new RegExp(`- tapOn:\\n    id: "${id}"`, "u"), id);
  }
  assert.match(
    segments[0],
    /- tapOn:\n    id: "exercise-editor-name"\n- inputText: "Plank"\n- hideKeyboard\n- scrollUntilVisible:\n    element:\n      id: "exercise-editor-primary-muscles"/u,
  );
  assert.match(
    flow,
    /- scrollUntilVisible:\n    element:\n      id: "exercise-editor-primary-muscles"\n    direction: DOWN\n    centerElement: true\n- tapOn:\n    id: "exercise-editor-primary-muscles"\n- inputText: "core"\n- hideKeyboard\n- scrollUntilVisible:\n    element:\n      id: "exercise-editor-equipment"\n    direction: DOWN\n    centerElement: true\n- tapOn:\n    id: "exercise-editor-equipment"\n- inputText: "bodyweight"\n- hideKeyboard/u,
  );
  for (const query of [
    ["bench press", "Bench Press. Built-in.*"],
    ["Maestro Plank Edited", "Maestro Plank Edited. Custom.*"],
  ]) {
    assert.match(
      flow,
      new RegExp(
        `- inputText: "${query[0]}"\\n- hideKeyboard\\n- scrollUntilVisible:\\n    element:\\n      text: "${
          query[1].replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")
        }"\\n    direction: DOWN\\n    centerElement: true`,
        "u",
      ),
      query[0],
    );
  }
  assert.match(
    flow,
    /- tapOn: "Activate"\n- scrollUntilVisible:\n    element:\n      text: "Rotation"\n    direction: DOWN\n    centerElement: true\n- tapOn: "Rotation"\n- assertVisible: "1\. Custom Day"\n- scrollUntilVisible:\n    element:\n      text: "Save schedule"\n    direction: DOWN\n- tapOn: "Save schedule"\n- assertVisible: "Save this schedule\?"\n- tapOn: "Save schedule"/u,
  );
  assert.match(
    flow,
    /- assertVisible: "Archive Maestro Plank Edited\?"\n- assertVisible: "This removes the exercise from new selection\.\*Existing plans remain runnable and show Archived until you restore or replace it\.\*No current plan occurrences are affected\.\*Maestro Plank Edited and its history will not be deleted\."/u,
  );
  assert.match(
    segments[2],
    /- scrollUntilVisible:\n    element:\n      text: "Archived"\n    direction: UP\n- assertVisible: "Archived"/u,
  );
  assert.match(
    segments[2],
    /- tapOn: "Restore exercise"\n- extendedWaitUntil:\n    visible: "Archive exercise"\n    timeout: 60000\n- scrollUntilVisible:\n    element:\n      text: "Go back"/u,
  );
  assert.match(
    segments[3],
    /- tapOn:\n    id: "owned-plan-add-exercise"\n- scrollUntilVisible:\n    element:\n      id: "owned-plan-exercise-search"\n    direction: DOWN\n    centerElement: true\n- tapOn:\n    id: "owned-plan-exercise-search"/u,
  );
  assert.match(
    segments[4],
    /- tapOn:\n    text: "Maestro Custom Plan\. Inactive\. Not scheduled\. 1 days"\n- assertVisible: "Ready"/u,
  );
  for (const [index, segment] of segments.entries()) {
    const commandCount = segment.match(/^- /gmu)?.length ?? 0;
    assert.ok(commandCount > 0 && commandCount <= 65, segmentPaths[index]);
    if (index === 0) {
      assert.match(segment, /clearState: true/u);
    } else {
      assert.match(segment, /clearState: false/u);
      assert.match(segment, /stopApp: true/u);
    }
  }
  for (const index of [1, 2, 3, 4]) {
    assert.match(
      segments[index],
      /- assertVisible: "Today"\n- extendedWaitUntil:\n    visible: "Use Full Body Foundation"\n    timeout: 90000\n- tapOn: "Library"/u,
      segmentPaths[index],
    );
  }
  assert.match(
    segments[5],
    /- assertVisible: "Today"\n- extendedWaitUntil:\n    visible: "Workout in progress"\n    timeout: 30000\n- tapOn: "Library"/u,
  );
  assert.match(
    segments[5],
    /- assertVisible: "Finish the current workout first"\n- assertVisible: "Metric profile changes are blocked while this exercise is in an active workout\. Resume, finish partial, or discard that workout before changing future targets\."\n- assertNotVisible: "Save profile change"/u,
  );
  assert.match(
    segments[6],
    /- assertVisible: "Today"\n- extendedWaitUntil:\n    visible: "Start Custom Day\.\*"\n    timeout: 30000\n- tapOn: "Library"/u,
  );
  assert.match(
    segments[6],
    /- scrollUntilVisible:\n    element:\n      text: "Future plan targets will use the new metric profile\. Completed workouts, in-progress snapshots, and historical observations will not change: history never changes\. History remains separated by metric-profile version\. Pending suggestions that no longer apply will be removed, and the next comparable exposure starts a fresh baseline\."\n    direction: DOWN\n    centerElement: true\n    timeout: 60000\n- assertVisible: "Future plan targets will use the new metric profile\. Completed workouts, in-progress snapshots, and historical observations will not change: history never changes\. History remains separated by metric-profile version\. Pending suggestions that no longer apply will be removed, and the next comparable exposure starts a fresh baseline\."\n- assertVisible: "Future targets only"/u,
  );
  for (const ordinal of [1, 2]) {
    assert.match(
      segments[6],
      new RegExp(
        `- tapOn: "Target ${ordinal} minimum reps"\\n- inputText: "8"\\n- hideKeyboard\\n- scrollUntilVisible:\\n    element:\\n      text: "Target ${ordinal} maximum reps"\\n    direction: DOWN\\n    centerElement: true\\n    timeout: 60000\\n- tapOn: "Target ${ordinal} maximum reps"\\n- inputText: "12"\\n- hideKeyboard\\n- scrollUntilVisible:\\n    element:\\n      text: "Target ${ordinal} variation"\\n    direction: DOWN\\n    centerElement: true\\n    timeout: 60000\\n- tapOn: "Target ${ordinal} variation"`,
        "u",
      ),
    );
  }
  assert.match(
    segments[6],
    /- assertVisible: "Change metric profile\?"\n- assertVisible: "Future plan targets will migrate to the reviewed profile while completed workouts and historical observations stay immutable\. Incompatible pending suggestions and policies will be invalidated, and a fresh baseline will begin\. This replacement is one-way: discarded future target contracts cannot be reconstructed\. Another explicit migration would be required to change back\."\n- tapOn: "Save profile change"/u,
  );
});

test("Phase 2 confirmation sheets expose one accessible action", async () => {
  const directory = path.join(projectRoot, "maestro/phase2");
  const { readdir } = await import("node:fs/promises");
  for (const fileName of await readdir(directory)) {
    if (!fileName.endsWith(".yaml")) {
      continue;
    }
    const relativePath = `maestro/phase2/${fileName}`;
    const flow = await readFile(path.join(projectRoot, relativePath), "utf8");
    assert.doesNotMatch(flow, /\n    index: 1/u, relativePath);
  }
});

test("saved exercise and ready plan routes are connected", async () => {
  const editRoute = await readFile(
    path.join(
      projectRoot,
      "app/library/exercise/[exerciseId]/edit.tsx",
    ),
    "utf8",
  );
  const detailRoute = await readFile(
    path.join(projectRoot, "app/library/exercise/[exerciseId].tsx"),
    "utf8",
  );
  const ownedEditor = await readFile(
    path.join(projectRoot, "src/ui/screens/OwnedPlanEditorScreen.tsx"),
    "utf8",
  );
  const exerciseEditor = await readFile(
    path.join(projectRoot, "src/ui/screens/ExerciseEditorScreen.tsx"),
    "utf8",
  );

  assert.match(
    editRoute,
    /const openSavedExercise = \(savedExerciseId: string\) => \{[\s\S]*mode === "copy"[\s\S]*router\.replace\(`\/library\/exercise\/\$\{savedExerciseId\}` as Href\);[\s\S]*router\.back\(\);/u,
  );
  assert.match(
    detailRoute,
    /useFocusEffect\(useCallback\(\(\) => \{[\s\S]*setFocusGeneration/u,
  );
  assert.match(
    ownedEditor,
    /label="Activate"[\s\S]{0,240}onSchedule\?\.\(snapshot\.id\)/u,
  );
  assert.match(
    exerciseEditor,
    /<AdaptiveScreen[\s\S]{0,240}dock=\{\([\s\S]{0,240}testID="exercise-editor-save"/u,
  );
});

test("owned workouts preserve snapshotted between-exercise rest", async () => {
  const workoutRepository = await readFile(
    path.join(
      projectRoot,
      "src/platform/sqlite/repositories/workoutRepository.ts",
    ),
    "utf8",
  );
  const integrationTests = await readFile(
    path.join(
      projectRoot,
      "tests/integration/starter-activation-repository.test.ts",
    ),
    "utf8",
  );

  assert.match(
    workoutRepository,
    /if \(set\.source_plan_day_exercise_id === null\) \{\n    return set\.default_rest_seconds;\n  \}/u,
  );
  assert.match(
    integrationTests,
    /preserves accepted between-exercise rest in owned workout snapshots/u,
  );
});

test("rest recovery starts Full Body A without depending on the calendar day", async () => {
  const flow = await readFile(
    path.join(projectRoot, "maestro/lifecycle/rest-recovery.yaml"),
    "utf8",
  );

  assert.match(
    flow,
    /- runFlow: "\.\.\/subflows\/phase1-start-full-body-a\.yaml"/u,
  );
  assert.match(
    flow,
    /- assertVisible: "Back Squat"\n- scrollUntilVisible:\n    element:\n      text: "Working set 1 repetitions"\n    direction: DOWN\n    timeout: 60000\n- longPressOn: "Working set 1 repetitions"/u,
  );
  assert.doesNotMatch(
    flow,
    /- assertVisible: "Rest day"\n- tapOn: "Train anyway"\n- tapOn: "Start Full Body A"/u,
  );

  const helper = await readFile(
    path.join(projectRoot, "maestro/subflows/phase1-start-full-body-a.yaml"),
    "utf8",
  );
  assert.equal(helper.match(/- tapOn: "Start Full Body A"/gu)?.length, 1);
  assert.match(
    helper,
    /---\n- extendedWaitUntil:\n    visible: "\^\(Start Full Body A\|Start Full Body B\|Rest day\)\$"\n    timeout: 90000\n- runFlow:/u,
  );
  assert.match(
    helper,
    /visible: "Start Full Body B"[\s\S]*- tapOn: "Choose another day"/u,
  );
  assert.match(
    helper,
    /visible: "Rest day"[\s\S]*- tapOn: "Train anyway"/u,
  );
  assert.match(
    helper,
    /- extendedWaitUntil:\n    visible: "Start Full Body A"\n    timeout: 30000\n- tapOn: "Start Full Body A"\n- extendedWaitUntil:\n    visible: "FOCUSED WORKOUT"\n    timeout: 30000/u,
  );
});

test("rest recovery finds the set action after each orientation change with bounded swipes", async () => {
  const flow = await readFile(
    path.join(projectRoot, "maestro/lifecycle/rest-recovery.yaml"),
    "utf8",
  );
  const findCompleteSet = [
    "- repeat:",
    "    times: 12",
    "    while:",
    "      notVisible: \"Complete Set 1\"",
    "    commands:",
    "      - swipe:",
    "          start: 95%, 75%",
    "          end: 95%, 25%",
    "          duration: 300",
    "- assertVisible: \"Complete Set 1\"",
  ].join("\n");

  assert.match(
    flow,
    new RegExp(
      [
        '- setOrientation: LANDSCAPE_LEFT',
        findCompleteSet,
        '- setOrientation: PORTRAIT',
        findCompleteSet,
        '- tapOn: "Complete Set 1"',
      ].join("\\n"),
      "u",
    ),
  );
});

test("rest recovery waits for the skipped rest to commit before finding set 2", async () => {
  const flow = await readFile(
    path.join(projectRoot, "maestro/lifecycle/rest-recovery.yaml"),
    "utf8",
  );

  assert.match(
    flow,
    /- tapOn: "Skip rest"\n- extendedWaitUntil:\n    notVisible: "Skip rest"\n    timeout: 60000\n- scrollUntilVisible:\n    element:\n      text: "Complete Set 2"\n    direction: DOWN\n    timeout: 60000\n- assertVisible: "Complete Set 2"/u,
  );
  assert.doesNotMatch(flow, /assertNotVisible: "Rest skipped"/u);
});

test("rest recovery waits for persisted workout state after process death", async () => {
  const flow = await readFile(
    path.join(projectRoot, "maestro/lifecycle/rest-recovery.yaml"),
    "utf8",
  );

  assert.match(
    flow,
    /- launchApp:\n    clearState: false\n    stopApp: true\n    permissions:\n      notifications: deny\n- assertVisible: "Today"\n- extendedWaitUntil:\n    visible: "Workout in progress"\n    timeout: 90000\n- tapOn: "Resume workout"/u,
  );
  assert.match(
    flow,
    /- tapOn: "Resume workout"\n- assertVisible: "RESTING · NEXT: SET 2 AT 60 kg × 8"\n- assertVisible: "Expand rest controls"\n- tapOn: "Expand rest controls"\n- tapOn: "Pause rest"/u,
  );
  assert.match(
    flow,
    /- launchApp:\n    clearState: false\n    stopApp: true\n    permissions:\n      notifications: deny\n- assertVisible: "Today"\n- extendedWaitUntil:\n    visible: "Resume workout"\n    timeout: 90000\n- tapOn: "Resume workout"/u,
  );
  assert.match(
    flow,
    /- tapOn: "Resume workout"\n- assertVisible: "REST PAUSED · NEXT: SET 2 AT 60 kg × 8"\n- assertVisible: "Expand rest controls"\n- tapOn: "Expand rest controls"\n- tapOn: "Resume rest"/u,
  );
});

test("denied notification smoke waits for persisted workout state after every restart", async () => {
  const flow = await readFile(
    path.join(
      projectRoot,
      "maestro/smoke/phase1-denied-late-notifications.yaml",
    ),
    "utf8",
  );
  const restartBoundary = [
    "- launchApp:",
    "    clearState: false",
    "    permissions:",
    "      notifications: allow",
    "- extendedWaitUntil:",
    '    visible: "Workout in progress"',
    "    timeout: 90000",
  ].join("\n");

  assert.equal(
    flow.split(restartBoundary).length - 1,
    3,
    "each notification permission restart waits for SQLite-backed workout recovery",
  );
});

test("implementation identity permits only later planning metadata commits", async () => {
  const { validateImplementationIdentity } = await load(
    "scripts/verify-phase2-native-evidence.mjs",
  );
  const implementationHead = "a".repeat(40);
  const implementationDigest = "b".repeat(64);

  assert.doesNotThrow(() => validateImplementationIdentity({
    manifestHead: implementationHead,
    currentHead: implementationHead,
    changedPaths: [],
    manifestSourceSha256: implementationDigest,
    currentSourceSha256: implementationDigest,
    implementationSourceSha256: implementationDigest,
  }));
  assert.doesNotThrow(() => validateImplementationIdentity({
    manifestHead: implementationHead,
    currentHead: "c".repeat(40),
    changedPaths: [
      ".planning/STATE.md",
      ".planning/phases/02-owned-library-and-planning/02-21-SUMMARY.md",
    ],
    manifestSourceSha256: implementationDigest,
    currentSourceSha256: "d".repeat(64),
    implementationSourceSha256: implementationDigest,
  }));
  assert.throws(
    () => validateImplementationIdentity({
      manifestHead: implementationHead,
      currentHead: "c".repeat(40),
      changedPaths: [".planning/STATE.md", "src/bootstrap/appContainer.ts"],
      manifestSourceSha256: implementationDigest,
      currentSourceSha256: implementationDigest,
      implementationSourceSha256: implementationDigest,
    }),
    /implementation|planning/u,
  );
  assert.throws(
    () => validateImplementationIdentity({
      manifestHead: implementationHead,
      currentHead: "c".repeat(40),
      changedPaths: [".planning/STATE.md"],
      manifestSourceSha256: implementationDigest,
      currentSourceSha256: "d".repeat(64),
      implementationSourceSha256: "e".repeat(64),
    }),
    /source/u,
  );
});

test("source digest ignores control metadata and non-executable permission drift", async () => {
  const {
    sourceTreeSha256,
    sourceTreeSha256AtHead,
  } = await load("scripts/source-tree-digest.mjs");
  const directory = await mkdtemp(path.join(tmpdir(), "phase2-source-digest-"));
  try {
    await mkdir(path.join(directory, ".planning"));
    await mkdir(path.join(directory, ".gsd"));
    await mkdir(path.join(directory, "src"));
    await writeFile(path.join(directory, ".planning/STATE.md"), "before\n");
    await writeFile(
      path.join(directory, ".gsd/dispatch-isolation-sentinel.json"),
      "{}\n",
    );
    await writeFile(path.join(directory, "src/source.ts"), "export const value = 1;\n");
    execFileSync("git", ["init", "-q"], { cwd: directory });
    execFileSync("git", ["config", "user.email", "fixture@example.com"], {
      cwd: directory,
    });
    execFileSync("git", ["config", "user.name", "Fixture"], { cwd: directory });
    execFileSync("git", ["add", ".planning/STATE.md", "src/source.ts"], {
      cwd: directory,
    });
    execFileSync("git", ["commit", "-qm", "fixture"], { cwd: directory });
    const head = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: directory,
      encoding: "utf8",
    }).trim();

    await chmod(path.join(directory, "src/source.ts"), 0o600);
    await writeFile(path.join(directory, ".planning/STATE.md"), "after\n");
    assert.equal(
      sourceTreeSha256(directory),
      sourceTreeSha256AtHead(head, directory),
    );

    await writeFile(path.join(directory, "src/source.ts"), "export const value = 2;\n");
    assert.notEqual(
      sourceTreeSha256(directory),
      sourceTreeSha256AtHead(head, directory),
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

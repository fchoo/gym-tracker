import {
  describe,
  expect,
  it,
} from "@jest/globals";
import {
  execFileSync,
  spawnSync,
} from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import {
  tmpdir,
} from "node:os";
import {
  join,
  dirname,
  resolve,
} from "node:path";

type PackageJson = {
  scripts?: Record<string, string>;
};

const repositoryRoot = resolve(__dirname, "../../..");
const packageJson = JSON.parse(
  readFileSync(join(repositoryRoot, "package.json"), "utf8"),
) as PackageJson;

describe("Plan 01-03 test and boundary tooling", () => {
  it("declares every reviewed runnable command", () => {
    expect(packageJson.scripts).toEqual(
      expect.objectContaining({
        "check:boundaries": "node scripts/check-boundaries.mjs",
        "test:unit": expect.stringContaining("unit"),
        "test:components": "node scripts/run-component-tests.mjs",
        "test:sqlite:host": expect.stringContaining("sqlite-host"),
        "test:sqlite:device": expect.stringContaining(
          "run-native-sqlite-contracts",
        ),
        "test:integration": expect.stringContaining(
          "--selectProjects integration",
        ),
        "test:coverage": expect.stringContaining("run-coverage-gate.mjs"),
        "test:all": expect.stringContaining("test:unit"),
        "ci:pr": expect.stringContaining("typecheck"),
      }),
    );
  });

  it("wires every implemented host, native, Maestro, benchmark, and artifact suite", () => {
    expect(packageJson.scripts?.["test:components"]).toBe(
      "node scripts/run-component-tests.mjs",
    );
    expect(packageJson.scripts?.["test:integration"]).toContain(
      "--selectProjects integration",
    );

    expect(packageJson.scripts?.["test:maestro:phase1"]).toContain(
      "run-phase1-maestro.mjs",
    );
    expect(packageJson.scripts?.["test:maestro:phase2"]).toContain(
      "run-phase2-maestro.mjs",
    );
    expect(packageJson.scripts?.["test:maestro:phase3"]).toContain(
      "run-phase3-maestro.mjs",
    );
    expect(packageJson.scripts?.["benchmark:phase1"]).toContain(
      "benchmark-phase1.mjs",
    );
    expect(packageJson.scripts?.["benchmark:phase2"]).toContain(
      "benchmark-phase2.mjs",
    );
    expect(packageJson.scripts?.["benchmark:phase3"]).toContain(
      "benchmark-phase3.mjs",
    );
    expect(packageJson.scripts?.["benchmark:phase1:physical"]).toContain(
      "--device=physical",
    );
    expect(packageJson.scripts?.["test:argon2:physical"]).toContain(
      "--device=physical --samples=10",
    );
    expect(packageJson.scripts?.["verify:artifact-roundtrip"]).toContain(
      "verify-pr-artifact-roundtrip.mjs",
    );
    expect(packageJson.scripts?.["verify:native:phase2"]).toContain(
      "verify-phase2-native-evidence.mjs",
    );
    expect(packageJson.scripts?.["verify:native:phase3"]).toContain(
      "verify-phase3-native-evidence.mjs",
    );
    expect(packageJson.scripts?.["test:evidence:phase3"]).toContain(
      "phase3-evidence-scripts.test.mjs",
    );
  });

  it("does not retain sheet and dock modules replaced by inline set rows", () => {
    for (const obsoleteFile of [
      "src/ui/components/ValueEditorSheet.tsx",
      "src/ui/components/WorkoutActionDock.tsx",
    ]) {
      expect(existsSync(join(repositoryRoot, obsoleteFile))).toBe(false);
    }
  });

  it("builds the development-test APK as an embedded release artifact", () => {
    const buildScript = readFileSync(
      join(repositoryRoot, "scripts/build-current-native-test-apk.sh"),
      "utf8",
    );
    const configValidator = readFileSync(
      join(repositoryRoot, "scripts/validate-development-test-app-config.mjs"),
      "utf8",
    );

    expect(buildScript).toContain(":app:assembleRelease");
    expect(buildScript).toContain(
      "android/app/build/outputs/apk/release/app-release.apk",
    );
    expect(configValidator).toContain("assets/index.android.bundle");
    expect(
      buildScript.match(/GYM_TRACKER_BUILD_PROFILE=development-test/gu),
    ).toHaveLength(2);
    expect(configValidator).toContain("assets/app.config");
    expect(buildScript).toContain(
      "scripts/validate-development-test-app-config.mjs",
    );
    expect(buildScript).toContain("embedded development-test config is invalid");
    expect(buildScript).not.toContain("node <<'NODE' ||");
    expect(buildScript).not.toContain("unzip -Z1");
    expect(buildScript).toContain("build_variant: 'release'");
    expect(buildScript).toContain("embedded: true");
    expect(buildScript).not.toContain(":app:assembleDebug");
  });

  it("fails closed when the embedded development-test app config drifts", () => {
    const validator = join(
      repositoryRoot,
      "scripts/validate-development-test-app-config.mjs",
    );
    const validConfig = {
      scheme: "gymtracker-devtest",
      android: { package: "com.fchoo.gymtracker.devtest" },
      extra: {
        buildProfile: "development-test",
        nativeContractsEnabled: true,
      },
    };
    const invalidMessage =
      "validate-development-test-app-config: invalid development-test app config.\n";

    const directory = mkdtempSync(join(tmpdir(), "gym-app-config-"));
    const fakeUnzip = join(directory, "unzip");
    const fakeApk = join(directory, "candidate.apk");

    try {
      writeFileSync(fakeApk, "not-real-apk");
      writeFileSync(
        fakeUnzip,
        '#!/bin/sh\ncase "$1" in\n  -Z1) printf \'%s\' "$FAKE_UNZIP_ENTRIES"; exit "${FAKE_UNZIP_LIST_STATUS:-0}" ;;\n  -p) printf \'%s\' "$FAKE_UNZIP_PAYLOAD"; exit "${FAKE_UNZIP_EXTRACT_STATUS:-0}" ;;\n  *) exit 9 ;;\nesac\n',
      );
      chmodSync(fakeUnzip, 0o755);

      const runValidator = (
        payload: string,
        statuses: { extract?: string; list?: string } = {},
      ) => (
        spawnSync(validator, [fakeApk], {
            encoding: "utf8",
            env: {
              ...process.env,
              FAKE_UNZIP_ENTRIES:
                "assets/index.android.bundle\nassets/app.config\n",
              FAKE_UNZIP_PAYLOAD: payload,
              FAKE_UNZIP_EXTRACT_STATUS: statuses.extract ?? "0",
              FAKE_UNZIP_LIST_STATUS: statuses.list ?? "0",
              PATH: `${directory}:${process.env.PATH ?? ""}`,
            },
          },
        )
      );

      expect(runValidator(JSON.stringify(validConfig))).toEqual(
        expect.objectContaining({ status: 0, stderr: "", stdout: "" }),
      );
      for (const result of [
        runValidator(JSON.stringify(validConfig), { extract: "7" }),
        runValidator(JSON.stringify(validConfig), { list: "7" }),
      ]) {
        expect(result).toEqual(expect.objectContaining({
          status: 1,
          stderr: invalidMessage,
          stdout: "",
        }));
      }

      for (const entries of [
        "assets/app.config\n",
        "assets/index.android.bundle\n",
      ]) {
        expect(spawnSync(validator, [fakeApk], {
          encoding: "utf8",
          env: {
            ...process.env,
            FAKE_UNZIP_ENTRIES: entries,
            FAKE_UNZIP_PAYLOAD: JSON.stringify(validConfig),
            PATH: `${directory}:${process.env.PATH ?? ""}`,
          },
        })).toEqual(expect.objectContaining({
          status: 1,
          stderr: invalidMessage,
          stdout: "",
        }));
      }

      for (const invalidConfig of [
        "not-json-with-sensitive-payload",
        JSON.stringify({ ...validConfig, scheme: "gymtracker" }),
        JSON.stringify({
          ...validConfig,
          android: { package: "com.fchoo.gymtracker" },
        }),
        JSON.stringify({
          ...validConfig,
          extra: {
            buildProfile: "production",
            nativeContractsEnabled: true,
          },
        }),
        JSON.stringify({
          ...validConfig,
          extra: {
            buildProfile: "development-test",
            nativeContractsEnabled: false,
          },
        }),
      ]) {
        expect(runValidator(invalidConfig)).toEqual(expect.objectContaining({
          status: 1,
          stderr: invalidMessage,
          stdout: "",
        }));
      }
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it("guards embedded test routes with the explicit build profile flag", () => {
    for (const route of [
      "app/__native-contracts.tsx",
      "app/__phase1-benchmark.tsx",
      "app/__phase2-benchmark.tsx",
      "app/__phase2-attended-preview.tsx",
      "app/__notification-test-controls.tsx",
      "app/__argon2-contracts.tsx",
    ]) {
      const source = readFileSync(join(repositoryRoot, route), "utf8");
      expect(source).toContain(
        "Constants.expoConfig?.extra?.nativeContractsEnabled === true",
      );
      expect(source).not.toContain("__DEV__");
    }
  });

  it("keeps route tests out of the Expo Router production module tree", () => {
    const rootRouteTests = readdirSync(join(repositoryRoot, "app"), {
      withFileTypes: true,
    })
      .filter((entry) => (
        entry.isFile() && /\.test\.[cm]?[jt]sx?$/u.test(entry.name)
      ))
      .map((entry) => entry.name);

    expect(rootRouteTests).toEqual([]);

    const previewRoute = readFileSync(
      join(repositoryRoot, "app/__phase2-attended-preview.tsx"),
      "utf8",
    );
    const previewFixtures = readFileSync(
      join(repositoryRoot, "src/testing/phase2AttendedPreviewFixtures.ts"),
      "utf8",
    );
    expect(previewRoute).not.toMatch(
      /["'](?:node:|@jest\/|@testing-library\/)/u,
    );
    expect(`${previewRoute}\n${previewFixtures}`).not.toMatch(
      /expo-sqlite|useWorkoutAppRuntime|artifacts\/native|evidence\/(?:write|record)/u,
    );
  });

  it("starts the Phase 2 benchmark only after root runtime initialization", () => {
    const route = readFileSync(
      join(repositoryRoot, "app/__phase2-benchmark.tsx"),
      "utf8",
    );

    expect(route).toContain("useWorkoutAppRuntime");
    expect(route).toContain("phase2BenchmarkStartupAction");
    expect(route).toContain("launchState");
  });

  it("keeps physical benchmark and Argon2 execution headless and dev-test only", () => {
    const entry = readFileSync(join(repositoryRoot, "index.js"), "utf8");
    const task = readFileSync(
      join(repositoryRoot, "src/bootstrap/physicalTestTask.ts"),
      "utf8",
    );
    const plugin = readFileSync(
      join(repositoryRoot, "plugins/withAndroidPhysicalTestService.ts"),
      "utf8",
    );
    const generatedContract = readFileSync(
      join(repositoryRoot, "scripts/assert-generated-android.mjs"),
      "utf8",
    );

    expect(entry).toContain("registerHeadlessTask");
    expect(entry).toContain("PHYSICAL_TEST_TASK_NAME");
    expect(entry.trimEnd().endsWith("require('expo-router/entry');")).toBe(true);
    expect(task).toContain('PHYSICAL_TEST_TASK_NAME = "GymTrackerPhysicalTest"');
    expect(task).toContain("performPhase1Benchmark");
    expect(task).toContain("performArgon2Feasibility");
    expect(task).not.toMatch(/password|salt|outputBytes/iu);
    expect(plugin).toContain("nativeContractsEnabled");
    expect(plugin).toContain("android.permission.DUMP");
    expect(plugin).toContain("GymTrackerPhysicalTestService");
    expect(generatedContract).toContain("GymTrackerPhysicalTestService");
    expect(generatedContract).toContain("android\\.permission\\.DUMP");
  });

  it("wires production appearance overrides to durable SQLite storage", () => {
    const rootLayout = readFileSync(
      join(repositoryRoot, "app/_layout.tsx"),
      "utf8",
    );
    const preferenceStore = readFileSync(
      join(
        repositoryRoot,
        "src/platform/preferences/appearancePreferenceStore.ts",
      ),
      "utf8",
    );

    expect(rootLayout).toContain("productionAppearanceStore");
    expect(rootLayout).toContain(
      "<AppearanceProvider store={productionAppearanceStore}>",
    );
    expect(preferenceStore).toContain("expo-sqlite/kv-store");
    expect(preferenceStore).toContain("removeItemSync");
  });

  it("keeps every reusable Phase 1 Maestro flow independently parseable", () => {
    const reusableFlows = [
      "maestro/subflows/phase1-start-full-body-a.yaml",
      "maestro/subflows/phase1-airplane-session.yaml",
    ];

    for (const reusableFlow of reusableFlows) {
      const source = readFileSync(join(repositoryRoot, reusableFlow), "utf8");
      expect(source).toMatch(
        /^appId: com\.fchoo\.gymtracker\.devtest\n(?:.+\n)*---\n-/u,
      );
    }
  });

  it("waits for set-two Undo expiry before skipping and editing set three", () => {
    const fullLoop = readFileSync(
      join(repositoryRoot, "maestro/smoke/phase1-full-loop.yaml"),
      "utf8",
    );

    expect(fullLoop).toMatch(
      /assertVisible: "RESTING · NEXT: SET 3 AT 60 kg × 8"\n- assertNotVisible: "Undo completed set"\n- assertVisible: "Expand rest controls"\n- tapOn: "Expand rest controls"\n- tapOn: "Skip rest"\n- extendedWaitUntil:\n    notVisible: "Skip rest"\n    timeout: 60000\n- scrollUntilVisible:\n    element:\n      text: "Working set 3 repetitions"\n    direction: DOWN\n    timeout: 60000\n- longPressOn: "Working set 3 repetitions"\n- tapOn:\n    text: "Select all"\n    optional: true\n- eraseText: 1\n- inputText: "7"\n- hideKeyboard\n- scrollUntilVisible:\n    element:\n      text: "Complete Set 3"\n    direction: DOWN\n    centerElement: true\n- tapOn: "Complete Set 3"/u,
    );
    expect(fullLoop).not.toContain("Change values");
    expect(fullLoop).not.toContain("Use these values");
  });

  it("waits for every skipped rest to commit before continuing the flow", () => {
    for (const relativePath of [
      "maestro/lifecycle/rest-recovery.yaml",
      "maestro/phase2/library-exercises.yaml",
      "maestro/phase2/remediation-rest-alerts.yaml",
      "maestro/phase2/remediation-workout.yaml",
      "maestro/smoke/phase1-denied-late-notifications.yaml",
      "maestro/smoke/phase1-full-loop.yaml",
      "maestro/subflows/phase1-airplane-session.yaml",
    ]) {
      const flow = readFileSync(
        join(repositoryRoot, relativePath),
        "utf8",
      );

      const skipRestCount = flow.match(/- tapOn: "Skip rest"/gu)?.length ?? 0;
      const synchronizedSkipCount = flow.match(
        /- tapOn: "Skip rest"\n- extendedWaitUntil:\n    notVisible: "Skip rest"\n    timeout: 60000/gu,
      )?.length ?? 0;
      expect(skipRestCount).toBeGreaterThan(0);
      expect(synchronizedSkipCount).toBe(skipRestCount);
      expect(flow).not.toContain('- assertVisible: "Rest skipped"');
      expect(flow).not.toContain('- assertNotVisible: "Rest skipped"');
    }
  });

  it("replaces inline numeric values independently of caret placement", () => {
    for (const relativePath of [
      "maestro/lifecycle/rest-recovery.yaml",
      "maestro/smoke/phase1-full-loop.yaml",
    ]) {
      const flow = readFileSync(
        join(repositoryRoot, relativePath),
        "utf8",
      );

      expect(flow).toMatch(
        /longPressOn: "Working set [13] repetitions"\n- tapOn:\n    text: "Select all"\n    optional: true\n- eraseText: 1\n- inputText: "[79]"/u,
      );
    }
  });

  it("handles between-exercise rest before asserting Bench Press", () => {
    const fullLoop = readFileSync(
      join(repositoryRoot, "maestro/smoke/phase1-full-loop.yaml"),
      "utf8",
    );

    expect(fullLoop).toMatch(
      /tapOn: "Complete Set 3"\n- assertVisible: "RESTING · NEXT: SET 1 AT 42\.5 kg × 10"\n- assertNotVisible: "Undo completed set"\n- assertVisible: "Expand rest controls"\n- tapOn: "Expand rest controls"\n- tapOn: "Skip rest"\n- extendedWaitUntil:\n    notVisible: "Skip rest"\n    timeout: 60000\n- scrollUntilVisible:\n    element:\n      text: "Bench Press"\n    direction: UP\n    centerElement: true\n    timeout: 60000\n- assertVisible: "Bench Press"/u,
    );
  });

  it("targets the actionable finish control after the last skipped exercise", () => {
    const fullLoop = readFileSync(
      join(repositoryRoot, "maestro/smoke/phase1-full-loop.yaml"),
      "utf8",
    );

    expect(fullLoop).toMatch(
      /tapOn: "Skip Plank"\n- tapOn: "Skip exercise"\n- scrollUntilVisible:\n    element:\n      text: "Finish workout"\n    direction: UP\n    centerElement: true\n- assertVisible: "Finish workout"\n- tapOn: "Finish workout"/u,
    );
  });

  it("scrolls through recommendation decisions and workout details", () => {
    const fullLoop = readFileSync(
      join(repositoryRoot, "maestro/smoke/phase1-full-loop.yaml"),
      "utf8",
    );

    for (const target of [
      "Repeat 60 kg next time",
      "Use this target next time",
      "View workout details",
    ]) {
      expect(fullLoop).toContain(
        `- scrollUntilVisible:\n    element:\n      text: "${target}"\n    direction: DOWN\n    centerElement: true`,
      );
    }
  });

  it("waits for React readiness before the final notification deep link", () => {
    const notificationFlow = readFileSync(
      join(
        repositoryRoot,
        "maestro/smoke/phase1-denied-late-notifications.yaml",
      ),
      "utf8",
    );

    expect(notificationFlow).toMatch(
      /launchApp:\n    clearState: false\n    permissions:\n      notifications: allow\n- extendedWaitUntil:\n    visible: "Workout in progress"\n    timeout: 90000\n- openLink: "gymtracker-devtest:\/\/__notification-test-controls\?action=inspect"\n- assertVisible: "Scheduled rest alerts · 1"\n- scrollUntilVisible:\n    element:\n      text: "Return to Today"\n    direction: DOWN\n    centerElement: true\n- tapOn: "Return to Today"\n- tapOn: "Resume workout"/u,
    );
  });

  it("restores the airplane workout header before opening actions", () => {
    const airplaneSession = readFileSync(
      join(repositoryRoot, "maestro/subflows/phase1-airplane-session.yaml"),
      "utf8",
    );

    expect(airplaneSession).toMatch(
      /tapOn: "Skip rest"\n- extendedWaitUntil:\n    notVisible: "Skip rest"\n    timeout: 60000\n- scrollUntilVisible:\n    element:\n      text: "More workout actions"\n    direction: UP\n    centerElement: true\n    timeout: 60000\n- tapOn: "More workout actions"/u,
    );
  });

  it("binds Phase 1 native runners to exact source and embedded release bytes", () => {
    const maestroRunner = readFileSync(
      join(repositoryRoot, "scripts/run-phase1-maestro.mjs"),
      "utf8",
    );
    const benchmarkRunner = readFileSync(
      join(repositoryRoot, "scripts/benchmark-phase1.mjs"),
      "utf8",
    );
    const argon2Runner = readFileSync(
      join(repositoryRoot, "scripts/run-argon2-feasibility.mjs"),
      "utf8",
    );

    expect(maestroRunner).toContain(
      "manifest.source_tree_sha256 !== sourceTreeSha256()",
    );
    expect(maestroRunner).toContain(
      '"cmd",\n    "connectivity",\n    "airplane-mode"',
    );
    expect(maestroRunner).toContain(
      '"wm", "dismiss-keyguard"',
    );
    expect(maestroRunner).toContain(
      '"cmd", "statusbar", "collapse"',
    );
    expect(maestroRunner).toContain(
      "interactive device remained keyguard-locked",
    );
    expect(maestroRunner).not.toContain(
      "android.intent.action.AIRPLANE_MODE",
    );
    for (const runner of [maestroRunner, benchmarkRunner]) {
      expect(runner).toContain('manifest.build_variant !== "release"');
      expect(runner).toContain("manifest.js_bundle?.embedded !== true");
      expect(runner).not.toContain('"expo",\n      "start"');
      expect(runner).toContain("process.exitCode = 1;");
      expect(runner).not.toMatch(
        /catch \(error\) \{[\s\S]{0,500}\bfail\(/u,
      );
    }
    expect(benchmarkRunner).toContain('deviceKind === "physical"');
    expect(benchmarkRunner).toContain("benchmark-physical.json");
    expect(benchmarkRunner).toContain(
      "exactly one ready physical Android device is required",
    );
    expect(benchmarkRunner).toContain("serial_hash");
    expect(benchmarkRunner).toContain("installExactApk");
    expect(benchmarkRunner).toContain("GymTrackerPhysicalTestService");
    expect(benchmarkRunner).toContain("assertPhysicalDisplayOff");
    expect(benchmarkRunner).toContain("tempwhitelist");
    expect(benchmarkRunner).toContain("physicalAllowlistDurationMs = 300_000");
    expect(benchmarkRunner).toContain("physicalPollIntervalMs = 5_000");
    expect(benchmarkRunner).toMatch(
      /async function waitForResult\(\) \{[\s\S]{0,400}for [^{]+\{\s+if \(deviceKind === "physical"\) \{\s+await assertPhysicalDisplayOff\(\);/u,
    );
    expect(benchmarkRunner).toMatch(
      /"-e",\s*"suite",\s*"benchmark"/u,
    );
    expect(benchmarkRunner).toContain(
      "gymtracker-devtest://__phase1-benchmark",
    );
    expect(argon2Runner).toContain("GymTrackerPhysicalTestService");
    expect(argon2Runner).toContain("assertPhysicalDisplayOff");
    expect(argon2Runner).toContain("tempwhitelist");
    expect(argon2Runner).toContain("physicalAllowlistDurationMs = 300_000");
    expect(argon2Runner).toContain("physicalPollIntervalMs = 5_000");
    expect(argon2Runner).toMatch(
      /async function readLoggedResult\(serial\) \{[\s\S]{0,400}for [^{]+\{\s+if \(deviceKind === "physical"\) \{\s+await assertPhysicalDisplayOff\(serial\);/u,
    );
    expect(argon2Runner).toMatch(
      /"-e",\s*"suite",\s*"argon2"/u,
    );
    expect(argon2Runner).toContain(
      "gymtracker-devtest://__argon2-contracts",
    );
  });

  it("encodes reviewed global and integrity-critical coverage thresholds", () => {
    const config = require(join(repositoryRoot, "jest.config.js")) as {
      coverageThreshold: Record<string, Record<string, number>>;
    };
    const coverageRunner = readFileSync(
      join(repositoryRoot, "scripts/run-coverage-gate.mjs"),
      "utf8",
    );
    expect(packageJson.scripts?.["test:coverage"]).toContain(
      "run-coverage-gate.mjs",
    );
    expect(coverageRunner).toContain(
      '"unit",\n    "components",\n    "sqlite-host",\n    "integration"',
    );
    expect(coverageRunner).toContain(
      'for (const metric of ["statements", "branches", "functions", "lines"])',
    );

    expect(config.coverageThreshold.global).toEqual({
      branches: 85,
      functions: 90,
      lines: 90,
      statements: 90,
    });
    for (const filePath of [
      "src/domains/content/catalog.ts",
      "src/domains/library/customExerciseCommands.ts",
      "src/domains/library/search.ts",
      "src/domains/metrics/aggregates.ts",
      "src/domains/metrics/comparators.ts",
      "src/domains/metrics/contracts.ts",
      "src/domains/metrics/exposure.ts",
      "src/domains/metrics/migrateCustomExerciseMetricProfile.ts",
      "src/domains/metrics/observations.ts",
      "src/domains/metrics/registry.ts",
      "src/domains/plans/activateStarterPlan.ts",
      "src/domains/plans/ownedPlanCommands.ts",
      "src/domains/plans/planImpactCommands.ts",
      "src/domains/progression/loadRepsV1.ts",
      "src/domains/progression/recommendationContracts.ts",
      "src/domains/progression/recommendationCommands.ts",
      "src/domains/rest/restCommands.ts",
      "src/domains/rest/restState.ts",
      "src/domains/scheduling/activation.ts",
      "src/domains/scheduling/localDate.ts",
      "src/domains/scheduling/scheduleCommands.ts",
      "src/domains/scheduling/scheduleState.ts",
      "src/domains/scheduling/timeZone.ts",
      "src/domains/workout/activeWorkout.ts",
      "src/domains/workout/finishWorkout.ts",
      "src/domains/workout/outcomes.ts",
      "src/domains/workout/sessionDetail.ts",
      "src/domains/workout/setCommands.ts",
      "src/domains/workout/startWorkout.ts",
      "src/domains/workout/undoCompletedSet.ts",
      "src/platform/notifications/expoRestNotificationAdapter.ts",
      "src/platform/notifications/restNotificationReconciler.ts",
      "src/platform/sqlite/connection.ts",
      "src/platform/sqlite/effects/effectRunner.ts",
      "src/platform/sqlite/effects/effectStore.ts",
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
      "src/platform/sqlite/migrations/0015_progression_evidence.ts",
      "src/platform/sqlite/migrations/index.ts",
      "src/platform/sqlite/recoveryBackup.ts",
      "src/platform/sqlite/repositories/contentRepository.ts",
      "src/platform/sqlite/repositories/customExerciseRepository.ts",
      "src/platform/sqlite/repositories/exerciseSearchIndexRepository.ts",
      "src/platform/sqlite/repositories/librarySearchRepository.ts",
      "src/platform/sqlite/repositories/metricRepository.ts",
      "src/platform/sqlite/repositories/ownedPlanRepository.ts",
      "src/platform/sqlite/repositories/planImpactRepository.ts",
      "src/platform/sqlite/repositories/starterPlanRepository.ts",
      "src/platform/sqlite/serializedWriter.ts",
      "src/platform/sqlite/sqliteKernel.ts",
    ]) {
      expect(coverageRunner).toContain(`"${filePath}"`);
    }
  });

  it("keeps the PR workflow full-SHA pinned and in reviewed gate order", () => {
    const workflow = readFileSync(
      join(repositoryRoot, ".github/workflows/pr.yml"),
      "utf8",
    );
    const requiredScripts = [
      "check:boundaries",
      "test:unit",
      "test:components",
      "test:sqlite:host",
      "test:sqlite:device",
      "test:integration",
      "test:coverage",
      "test:maestro:phase2",
      "benchmark:phase2",
      "verify:native:phase2",
      "ci:phase2",
      "benchmark:phase1",
      "verify:artifact-roundtrip",
      "test:all",
      "ci:pr",
    ];

    for (const script of requiredScripts) {
      expect(workflow).toContain(`'${script}'`);
    }

    for (const line of workflow.match(/^\s*uses:\s*.+$/gm) ?? []) {
      expect(line).toMatch(/@[0-9a-f]{40}(?:\s+#\s+v\S+)?$/);
    }

    const orderedCommands = [
      "npm run typecheck",
      "npm run lint",
      "npm run check:boundaries",
      "npm run test:unit",
      "npm run test:components",
      "npm run test:sqlite:host",
      "npm run test:integration",
      "npm run test:coverage",
    ];
    let previousIndex = -1;
    for (const command of orderedCommands) {
      const commandIndex = workflow.indexOf(command, previousIndex + 1);
      expect(commandIndex).toBeGreaterThan(previousIndex);
      previousIndex = commandIndex;
    }

    const phase2Commands = [
      "npm run verify:cng",
      "npm run android:devtest:fresh -- --suite phase2",
      "npm run test:sqlite:device -- --suite phase2",
      "npm run test:maestro:phase2",
      "npm run benchmark:phase2",
      "--roundtrip-temp",
      "--roundtrip-downloaded-dir",
      "--automated-only --require-roundtrip",
    ];
    previousIndex = -1;
    for (const command of phase2Commands) {
      const commandIndex = workflow.indexOf(command, previousIndex + 1);
      expect(commandIndex).toBeGreaterThan(previousIndex);
      previousIndex = commandIndex;
    }
    expect(workflow).toContain("name: phase2-evidence");
    expect(workflow).toContain("name: phase2-evidence-downloaded");
  });

  it("rejects every prohibited architecture boundary", () => {
    const fixtures = [
      {
        path: "app/route.tsx",
        source: 'import { openDatabaseAsync } from "expo-sqlite";\n',
        expected: "route SQL/platform import",
      },
      {
        path: "app/route.tsx",
        source: "const rows = await database.execAsync('SELECT 1');\n",
        expected: "route SQL execution",
      },
      {
        path: "src/ui/screen.ts",
        source: 'import { database } from "../platform/sqlite";\n',
        expected: "UI platform import",
      },
      {
        path: "src/domains/plans/application/useWorkout.ts",
        source: 'import { privateRule } from "../../workout/domain/privateRule";\n',
        expected: "cross-domain internal import",
      },
      {
        path: "src/domains/workout/application/completeSet.ts",
        source: 'import { writer } from "../../../platform/sqlite/serializedWriter";\n',
        expected: "raw writer import",
      },
      {
        path: "src/platform/sqlite/sqliteKernel.ts",
        source: "database.withExclusiveTransactionAsync(async () => undefined);\n",
        expected: "prohibited Expo exclusive helper",
      },
    ];

    for (const fixture of fixtures) {
      const directory = mkdtempSync(join(tmpdir(), "gym-boundary-"));
      try {
        const fixturePath = join(directory, fixture.path);
        mkdirSync(dirname(fixturePath), { recursive: true });
        writeFileSync(fixturePath, fixture.source);
        const result = spawnSync(
          process.execPath,
          [join(repositoryRoot, "scripts/check-boundaries.mjs"), fixturePath],
          { cwd: repositoryRoot, encoding: "utf8" },
        );

        expect(result.status).toBe(1);
        expect(`${result.stdout}${result.stderr}`).toContain(fixture.expected);
      } finally {
        rmSync(directory, { force: true, recursive: true });
      }
    }
  });

  it("passes the current repository boundary scan", () => {
    expect(() =>
      execFileSync(
        process.execPath,
        [join(repositoryRoot, "scripts/check-boundaries.mjs")],
        { cwd: repositoryRoot, stdio: "pipe" },
      ),
    ).not.toThrow();
  });
});

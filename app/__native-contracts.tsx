import Constants from "expo-constants";
import {
  Redirect,
  useLocalSearchParams,
} from "expo-router";
import {
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  createExpoMigrationsEffectsContractAdapter,
  MIGRATIONS_EFFECTS_CONTRACT_CASES,
  runMigrationsEffectsContract as verifyMigrationsEffectsContract,
  type MigrationsEffectsContractResult,
} from "../src/testing/contracts/migrationsEffects.contract";
import {
  assertPhase2ContentContractResult,
  createExpoPhase2ContentContractAdapter,
  PHASE2_CONTENT_CASE_IDS,
  runPhase2ContentContract as verifyPhase2ContentContract,
  type Phase2ContentContractResult,
} from "../src/testing/contracts/phase2Content.contract";
import {
  assertPhase2FtsContractResult,
  createExpoPhase2FtsContractAdapter,
  PHASE2_FTS_CASE_IDS,
  runPhase2FtsContract as verifyPhase2FtsContract,
  type Phase2FtsContractResult,
} from "../src/testing/contracts/phase2Fts.contract";
import {
  assertPhase2MetricsContractResult,
  createExpoPhase2MetricsContractAdapter,
  PHASE2_METRICS_CASE_IDS,
  runPhase2MetricsContract as verifyPhase2MetricsContract,
  type Phase2MetricsContractResult,
} from "../src/testing/contracts/phase2Metrics.contract";
import {
  assertPhase2PlanContractResult,
  createExpoPhase2PlanContractAdapter,
  PHASE2_PLAN_CASE_IDS,
  runPhase2PlanContract as verifyPhase2PlanContract,
  type Phase2PlanContractResult,
} from "../src/testing/contracts/phase2Plan.contract";
import {
  assertPhase2ScheduleContractResult,
  createExpoPhase2ScheduleContractAdapter,
  PHASE2_SCHEDULE_CASE_IDS,
  runPhase2ScheduleContract as verifyPhase2ScheduleContract,
  type Phase2ScheduleContractResult,
} from "../src/testing/contracts/phase2Schedule.contract";
import {
  assertPhase2SearchContractResult,
  createExpoPhase2SearchContractAdapter,
  PHASE2_SEARCH_CASE_IDS,
  runPhase2SearchContract as verifyPhase2SearchContract,
  type Phase2SearchContractResult,
} from "../src/testing/contracts/phase2Search.contract";
import {
  assertPhase2StarterContractResult,
  createExpoPhase2StarterContractAdapter,
  PHASE2_STARTER_CASE_IDS,
  runPhase2StarterContract as verifyPhase2StarterContract,
  type Phase2StarterContractResult,
} from "../src/testing/contracts/phase2Starter.contract";
import {
  createExpoSqliteContractAdapter,
  SQLITE_KERNEL_CONTRACT_CASES,
  runSqliteKernelContract as verifySqliteKernelContract,
  type SqliteKernelContractResult,
} from "../src/testing/contracts/sqliteKernel.contract";

const RESULT_MARKER = "GYM_TRACKER_SQLITE_CONTRACT_RESULT:";
const CASE_MARKER = "GYM_TRACKER_SQLITE_CONTRACT_CASE:";
const ERROR_MARKER = "GYM_TRACKER_SQLITE_CONTRACT_ERROR:";
const PROGRESS_MARKER = "GYM_TRACKER_SQLITE_CONTRACT_PROGRESS:";
const PHASE2_CASE_IDS = [
  ...PHASE2_CONTENT_CASE_IDS,
  ...PHASE2_SEARCH_CASE_IDS,
  ...PHASE2_METRICS_CASE_IDS,
  ...PHASE2_STARTER_CASE_IDS,
  ...PHASE2_PLAN_CASE_IDS,
  ...PHASE2_SCHEDULE_CASE_IDS,
] as const;
const PHASE2_AGGREGATE_CASE_IDS = [
  ...SQLITE_KERNEL_CONTRACT_CASES,
  ...MIGRATIONS_EFFECTS_CONTRACT_CASES,
  ...PHASE2_FTS_CASE_IDS,
  ...PHASE2_CASE_IDS,
] as const;
const configuredSuite = process.env.EXPO_PUBLIC_NATIVE_CONTRACT_SUITE;
const selectedSuite = configuredSuite === "migrations-effects"
  || configuredSuite === "phase2"
  || configuredSuite === "phase2-content"
  || configuredSuite === "phase2-fts"
  || configuredSuite === "phase2-metrics"
  || configuredSuite === "phase2-plan"
  || configuredSuite === "phase2-schedule"
  || configuredSuite === "phase2-search"
  || configuredSuite === "phase2-starter"
  ? configuredSuite
  : "sqlite-kernel";
const expectedCaseCount = {
  "migrations-effects": 10,
  phase2: PHASE2_AGGREGATE_CASE_IDS.length,
  "phase2-content": PHASE2_CONTENT_CASE_IDS.length,
  "phase2-fts": PHASE2_FTS_CASE_IDS.length,
  "phase2-metrics": PHASE2_METRICS_CASE_IDS.length,
  "phase2-plan": PHASE2_PLAN_CASE_IDS.length,
  "phase2-schedule": PHASE2_SCHEDULE_CASE_IDS.length,
  "phase2-search": PHASE2_SEARCH_CASE_IDS.length,
  "phase2-starter": PHASE2_STARTER_CASE_IDS.length,
  "sqlite-kernel": 10,
}[selectedSuite];

type Phase2ContractCaseResult = Readonly<{
  id: (typeof PHASE2_AGGREGATE_CASE_IDS)[number];
  status: "passed" | "failed";
  durationMs: number;
  errorCode?: string;
}>;

type Phase2AggregateContractResult = Readonly<{
  schemaVersion: 1;
  contractVersion: 1;
  status: "passed" | "failed";
  total: number;
  passed: number;
  failed: number;
  skipped: 0;
  cases: readonly Phase2ContractCaseResult[];
  startedAt: string;
  finishedAt: string;
}>;

type NativeContractResult =
  | Phase2AggregateContractResult
  | Phase2ContentContractResult
  | Phase2FtsContractResult
  | Phase2MetricsContractResult
  | Phase2PlanContractResult
  | Phase2ScheduleContractResult
  | Phase2SearchContractResult
  | Phase2StarterContractResult
  | (SqliteKernelContractResult & Readonly<{
      migrationsEffects?: MigrationsEffectsContractResult;
    }>);

type RouteState =
  | Readonly<{ status: "disabled" | "running" }>
  | Readonly<{
      status: "finished";
      result: NativeContractResult;
    }>
  | Readonly<{
      status: "failed";
      errorCode: string;
    }>;

function boundedRunId(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate?.replace(/[^A-Za-z0-9._-]/gu, "").slice(0, 48)
    || `native-${Date.now()}`;
}

function boundedErrorCode(error: unknown): string {
  if (
    error instanceof Error
    && /^[a-z0-9_:-]{3,80}$/iu.test(error.message)
  ) {
    return error.message;
  }
  return "native_contract_runner_failed";
}

function firstContractFailureCode(
  result: Readonly<{
    cases: readonly Readonly<{
      status: "passed" | "failed";
      errorCode?: string;
    }>[];
  }>,
  fallback: string,
): string {
  const errorCode = result.cases.find(
    (contractCase) => contractCase.status === "failed",
  )?.errorCode;
  return errorCode === undefined
    ? fallback
    : boundedErrorCode(new Error(errorCode));
}

function emitAggregateProgress(runId: string, stage: string): void {
  console.log(`${PROGRESS_MARKER}${JSON.stringify({ runId, stage })}`);
}

async function verifyPhase2Aggregate(
  runId: string,
): Promise<Phase2AggregateContractResult> {
  const startedAt = new Date().toISOString();
  emitAggregateProgress(runId, "sqlite-kernel");
  const kernel = await verifySqliteKernelContract(
    await createExpoSqliteContractAdapter(
      `${runId}-kernel`,
      (caseId) => emitAggregateProgress(runId, `sqlite-kernel:${caseId}`),
    ),
  );
  if (kernel.status !== "passed") {
    throw new Error(firstContractFailureCode(
      kernel,
      "sqlite_kernel_preflight_failed",
    ));
  }
  emitAggregateProgress(runId, "migrations-effects");
  const migrationsEffects = await verifyMigrationsEffectsContract(
    await createExpoMigrationsEffectsContractAdapter(
      `${runId}-migrations-effects`,
    ),
  );
  if (migrationsEffects.status !== "passed") {
    throw new Error(firstContractFailureCode(
      migrationsEffects,
      "migrations_effects_preflight_failed",
    ));
  }
  emitAggregateProgress(runId, "phase2-fts");
  const fts = await verifyPhase2FtsContract(
    await createExpoPhase2FtsContractAdapter(`${runId}-fts`),
  );
  if (fts.status !== "passed") {
    throw new Error(firstContractFailureCode(fts, "phase2_fts_preflight_failed"));
  }
  assertPhase2FtsContractResult(fts);
  emitAggregateProgress(runId, "phase2-content");
  const content = await verifyPhase2ContentContract(
    await createExpoPhase2ContentContractAdapter(`${runId}-content`),
  );
  if (content.status !== "passed") {
    throw new Error(firstContractFailureCode(
      content,
      "phase2_content_preflight_failed",
    ));
  }
  assertPhase2ContentContractResult(content);
  emitAggregateProgress(runId, "phase2-search");
  const search = await verifyPhase2SearchContract(
    await createExpoPhase2SearchContractAdapter(`${runId}-search`),
  );
  if (search.status !== "passed") {
    throw new Error(firstContractFailureCode(
      search,
      "phase2_search_preflight_failed",
    ));
  }
  assertPhase2SearchContractResult(search);
  emitAggregateProgress(runId, "phase2-metrics");
  const metrics = await verifyPhase2MetricsContract(
    await createExpoPhase2MetricsContractAdapter(`${runId}-metrics`),
  );
  if (metrics.status !== "passed") {
    throw new Error(firstContractFailureCode(
      metrics,
      "phase2_metrics_preflight_failed",
    ));
  }
  assertPhase2MetricsContractResult(metrics);
  emitAggregateProgress(runId, "phase2-starter");
  const starter = await verifyPhase2StarterContract(
    await createExpoPhase2StarterContractAdapter(`${runId}-starter`),
  );
  if (starter.status !== "passed") {
    throw new Error(firstContractFailureCode(
      starter,
      "phase2_starter_preflight_failed",
    ));
  }
  assertPhase2StarterContractResult(starter);
  emitAggregateProgress(runId, "phase2-plan");
  const plan = await verifyPhase2PlanContract(
    await createExpoPhase2PlanContractAdapter(
      `${runId}-plan`,
      (caseId) => emitAggregateProgress(runId, `phase2-plan:${caseId}`),
    ),
  );
  if (plan.status !== "passed") {
    throw new Error(firstContractFailureCode(plan, "phase2_plan_preflight_failed"));
  }
  assertPhase2PlanContractResult(plan);
  emitAggregateProgress(runId, "phase2-schedule");
  const schedule = await verifyPhase2ScheduleContract(
    await createExpoPhase2ScheduleContractAdapter(`${runId}-schedule`),
  );
  if (schedule.status !== "passed") {
    throw new Error(firstContractFailureCode(
      schedule,
      "phase2_schedule_preflight_failed",
    ));
  }
  assertPhase2ScheduleContractResult(schedule);
  const cases = [
    ...kernel.cases,
    ...migrationsEffects.cases,
    ...fts.cases,
    ...content.cases,
    ...search.cases,
    ...metrics.cases,
    ...starter.cases,
    ...plan.cases,
    ...schedule.cases,
  ] as readonly Phase2ContractCaseResult[];
  const aggregate = {
    passed: cases.filter(({ status }) => status === "passed").length,
    failed: cases.filter(({ status }) => status === "failed").length,
  };
  return {
    schemaVersion: 1,
    contractVersion: 1,
    status: aggregate.failed === 0 ? "passed" : "failed",
    total: cases.length,
    passed: aggregate.passed,
    failed: aggregate.failed,
    skipped: 0,
    cases,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}

export default function NativeSqliteContractsScreen() {
  const parameters = useLocalSearchParams<{ runId?: string | string[] }>();
  const runId = boundedRunId(parameters.runId);
  const started = useRef(false);
  const nativeContractsEnabled =
    Constants.expoConfig?.extra?.nativeContractsEnabled === true;
  const [state, setState] = useState<RouteState>(
    nativeContractsEnabled
      ? { status: "running" }
      : { status: "disabled" },
  );

  useEffect(() => {
    if (!nativeContractsEnabled || started.current) {
      return;
    }
    started.current = true;

    void (async () => {
      try {
        if (selectedSuite === "phase2") {
          const result = await verifyPhase2Aggregate(runId);
          for (const contractCase of result.cases) {
            console.log(`${CASE_MARKER}${JSON.stringify({
              runId,
              case: contractCase,
            })}`);
          }
          console.log(`${RESULT_MARKER}${JSON.stringify({
            runId,
            summary: {
              schemaVersion: result.schemaVersion,
              contractVersion: result.contractVersion,
              status: result.status,
              total: result.total,
              passed: result.passed,
              failed: result.failed,
              skipped: result.skipped,
              startedAt: result.startedAt,
              finishedAt: result.finishedAt,
            },
          })}`);
          setState({ status: "finished", result });
          return;
        }
        if (selectedSuite === "phase2-content") {
          const result = await verifyPhase2ContentContract(
            await createExpoPhase2ContentContractAdapter(runId),
          );
          assertPhase2ContentContractResult(result);
          console.log(`${RESULT_MARKER}${JSON.stringify(result)}`);
          setState({ status: "finished", result });
          return;
        }
        if (selectedSuite === "phase2-fts") {
          const result = await verifyPhase2FtsContract(
            await createExpoPhase2FtsContractAdapter(runId),
          );
          assertPhase2FtsContractResult(result);
          console.log(`${RESULT_MARKER}${JSON.stringify(result)}`);
          setState({ status: "finished", result });
          return;
        }
        if (selectedSuite === "phase2-metrics") {
          const result = await verifyPhase2MetricsContract(
            await createExpoPhase2MetricsContractAdapter(runId),
          );
          assertPhase2MetricsContractResult(result);
          console.log(`${RESULT_MARKER}${JSON.stringify(result)}`);
          setState({ status: "finished", result });
          return;
        }
        if (selectedSuite === "phase2-plan") {
          const result = await verifyPhase2PlanContract(
            await createExpoPhase2PlanContractAdapter(runId),
          );
          assertPhase2PlanContractResult(result);
          console.log(`${RESULT_MARKER}${JSON.stringify(result)}`);
          setState({ status: "finished", result });
          return;
        }
        if (selectedSuite === "phase2-schedule") {
          const result = await verifyPhase2ScheduleContract(
            await createExpoPhase2ScheduleContractAdapter(runId),
          );
          assertPhase2ScheduleContractResult(result);
          console.log(`${RESULT_MARKER}${JSON.stringify(result)}`);
          setState({ status: "finished", result });
          return;
        }
        if (selectedSuite === "phase2-search") {
          const result = await verifyPhase2SearchContract(
            await createExpoPhase2SearchContractAdapter(runId),
          );
          assertPhase2SearchContractResult(result);
          console.log(`${RESULT_MARKER}${JSON.stringify(result)}`);
          setState({ status: "finished", result });
          return;
        }
        if (selectedSuite === "phase2-starter") {
          const result = await verifyPhase2StarterContract(
            await createExpoPhase2StarterContractAdapter(runId),
          );
          assertPhase2StarterContractResult(result);
          console.log(`${RESULT_MARKER}${JSON.stringify(result)}`);
          setState({ status: "finished", result });
          return;
        }

        let migrationsEffects: MigrationsEffectsContractResult | undefined;
        if (selectedSuite === "migrations-effects") {
          migrationsEffects = await verifyMigrationsEffectsContract(
            await createExpoMigrationsEffectsContractAdapter(runId),
          );
          if (migrationsEffects.status !== "passed") {
            throw new Error("migrations_effects_preflight_failed");
          }
        }
        const adapter = await createExpoSqliteContractAdapter(runId);
        const kernelResult = await verifySqliteKernelContract(adapter);
        const result: NativeContractResult = migrationsEffects === undefined
          ? kernelResult
          : {
              ...kernelResult,
              migrationsEffects,
            };
        console.log(`${RESULT_MARKER}${JSON.stringify(result)}`);
        setState({ status: "finished", result });
      } catch (error: unknown) {
        const errorCode = boundedErrorCode(error);
        console.error(`${ERROR_MARKER}${JSON.stringify({
          runId,
          errorCode,
        })}`);
        setState({
          status: "failed",
          errorCode,
        });
      }
    })();
  }, [nativeContractsEnabled, runId]);

  const result = state.status === "finished" ? state.result : undefined;
  if (state.status === "disabled") {
    return <Redirect href="/" />;
  }
  const statusText = state.status === "failed"
    ? "Native SQLite contracts failed to start."
    : state.status === "running"
    ? selectedSuite === "phase2"
      ? `Running ${expectedCaseCount} aggregate Phase 2 contracts…`
      : selectedSuite === "phase2-content"
      ? `Running ${expectedCaseCount} packaged content contracts…`
      : selectedSuite === "phase2-fts"
      ? `Running ${expectedCaseCount} packaged FTS prerequisite contracts…`
      : selectedSuite === "phase2-metrics"
      ? `Running ${expectedCaseCount} packaged metrics contracts…`
      : selectedSuite === "phase2-plan"
      ? `Running ${expectedCaseCount} packaged plan contracts…`
      : selectedSuite === "phase2-schedule"
      ? `Running ${expectedCaseCount} packaged schedule contracts…`
      : selectedSuite === "phase2-search"
      ? `Running ${expectedCaseCount} packaged search contracts…`
      : selectedSuite === "phase2-starter"
      ? `Running ${expectedCaseCount} packaged starter contracts…`
      : selectedSuite === "migrations-effects"
      ? "Running migrations/effects preflight and 10 SQLite integrity contracts…"
      : "Running 10 SQLite integrity contracts…"
    : `${result?.passed ?? 0} / ${result?.total ?? expectedCaseCount} passed`;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.eyebrow}>Development Test</Text>
      <Text style={styles.title}>
        {selectedSuite === "phase2"
          ? "Aggregate Phase 2 Contracts"
          : selectedSuite === "phase2-content"
          ? "Phase 2 Content Contracts"
          : selectedSuite === "phase2-fts"
          ? "Phase 2 FTS Contracts"
          : selectedSuite === "phase2-metrics"
          ? "Phase 2 Metrics Contracts"
          : selectedSuite === "phase2-plan"
          ? "Phase 2 Plan Contracts"
          : selectedSuite === "phase2-schedule"
          ? "Phase 2 Schedule Contracts"
          : selectedSuite === "phase2-search"
          ? "Phase 2 Search Contracts"
          : selectedSuite === "phase2-starter"
          ? "Phase 2 Starter Contracts"
          : selectedSuite === "migrations-effects"
          ? "Migrations & Effects Contracts"
          : "SQLite Kernel Contracts"}
      </Text>
      <Text
        accessibilityLiveRegion="polite"
        style={[
          styles.status,
          (result?.status === "failed" || state.status === "failed")
            && styles.failed,
        ]}
      >
        {statusText}
      </Text>
      {state.status === "failed" && (
        <Text style={styles.machineResult}>
          {`${RESULT_MARKER}${encodeURIComponent(JSON.stringify({
            schemaVersion: 1,
            contractVersion: 1,
            status: "failed",
            total: expectedCaseCount,
            passed: 0,
            failed: expectedCaseCount,
            skipped: 0,
            cases: [],
            startedAt: new Date(0).toISOString(),
            finishedAt: new Date().toISOString(),
            errorCode: state.errorCode,
          }))}`}
        </Text>
      )}
      {result !== undefined && (
        <>
          <View style={styles.results}>
            {result.cases.map((contractCase) => (
              <View key={contractCase.id} style={styles.row}>
                <Text style={styles.caseName}>{contractCase.id}</Text>
                <Text
                  style={[
                    styles.caseStatus,
                    contractCase.status === "failed" && styles.failed,
                  ]}
                >
                  {contractCase.status}
                </Text>
              </View>
            ))}
          </View>
          <Text style={styles.machineResult}>
            {`${RESULT_MARKER}${encodeURIComponent(JSON.stringify(result))}`}
          </Text>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: "#F6F8FB",
    padding: 24,
    paddingTop: 64,
  },
  eyebrow: {
    color: "#4F5B66",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  title: {
    marginTop: 8,
    color: "#171A1C",
    fontSize: 28,
    fontWeight: "700",
  },
  status: {
    marginTop: 16,
    color: "#176B3A",
    fontSize: 18,
    fontWeight: "600",
  },
  failed: {
    color: "#B42318",
  },
  results: {
    marginTop: 24,
    gap: 8,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  caseName: {
    flex: 1,
    color: "#27313A",
    fontSize: 14,
  },
  caseStatus: {
    color: "#176B3A",
    fontSize: 14,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  machineResult: {
    marginTop: 16,
    color: "#F6F8FB",
    fontSize: 1,
  },
});

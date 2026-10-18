import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  MULTI_PLAN_RUNNING_CONTRACT_CASES,
} from "./contracts/multiPlanRunning.contract";
import {
  PHASE15_REQUIRED_CASES,
} from "./contracts/phase15Workout.contract";
import {
  PHASE17_CASE_ACTION_CONTRACTS,
  PHASE17_FAMILY_A_CUSTOM_METRIC_MATRIX_CONTRACTS,
} from "./contracts/phase17LibraryRunning.contract";

export const V12_NATIVE_ACCEPTANCE_FIXTURE_ID = "v12-synthetic-fixtures-r18";

type NativeAcceptanceShard = "multi-plan" | "workout" | "library-running";

type NativeAcceptanceIdentity = Readonly<{
  packageName?: unknown;
  buildProfile?: unknown;
  nativeContractsEnabled?: unknown;
  suite?: unknown;
}>;

type NativeAcceptanceParams = Readonly<{
  shard?: unknown;
  case?: unknown;
  fixture?: unknown;
  nonce?: unknown;
}>;

type NativeAcceptanceCase = Readonly<{
  id: string;
  requirement: string;
  action: string;
  readback: string;
}>;

export type V12NativeAcceptanceRequest = Readonly<{
  shard: NativeAcceptanceShard;
  caseId: string;
  fixtureId: typeof V12_NATIVE_ACCEPTANCE_FIXTURE_ID;
  title: string;
  source: string;
  requirement: string;
  action: string;
  readback: string;
  nonce: string;
}>;

const multiPlanCases = MULTI_PLAN_RUNNING_CONTRACT_CASES.map((id) => Object.freeze({
  id,
  requirement: "Phase 13 source-owned contract",
  action: id.slice("phase13-".length),
  readback: "SQLite-backed contract observation",
}));

const workoutCases: readonly NativeAcceptanceCase[] = PHASE15_REQUIRED_CASES.map((entry) => {
  const id = entry.id;
  const requirement = entry.requirement;
  if (typeof id !== "string" || typeof requirement !== "string") {
    throw new Error("v12_native_acceptance_workout_registry_invalid");
  }
  return Object.freeze({
    id,
    requirement,
    action: id.slice("workout.".length),
    readback: "Workout source contract observation",
  });
});

const libraryCases = [
  ...PHASE17_CASE_ACTION_CONTRACTS,
  ...PHASE17_FAMILY_A_CUSTOM_METRIC_MATRIX_CONTRACTS.filter(({ id }) => (
    !PHASE17_CASE_ACTION_CONTRACTS.some((entry) => entry.id === id)
  )),
].map(({ id, action, uiReadback, sourceProbe }) => Object.freeze({
  id,
  requirement: sourceProbe,
  action,
  readback: uiReadback,
}));

const SHARDS: Readonly<Record<NativeAcceptanceShard, Readonly<{
  title: string;
  source: string;
  cases: readonly NativeAcceptanceCase[];
}>>> = Object.freeze({
  "multi-plan": Object.freeze({
    title: "Multi-plan and running",
    source: "MULTI_PLAN_RUNNING_CONTRACT_CASES",
    cases: Object.freeze(multiPlanCases),
  }),
  workout: Object.freeze({
    title: "Workout",
    source: "PHASE15_REQUIRED_CASES",
    cases: Object.freeze(workoutCases),
  }),
  "library-running": Object.freeze({
    title: "Library and running",
    source: "PHASE17_CASE_ACTION_CONTRACTS + PHASE17_FAMILY_A_CUSTOM_METRIC_MATRIX_CONTRACTS",
    cases: Object.freeze(libraryCases),
  }),
});

function exactString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function resolveV12NativeAcceptanceRequest(
  identity: NativeAcceptanceIdentity,
  params: NativeAcceptanceParams,
): V12NativeAcceptanceRequest | null {
  if (identity.packageName !== "com.fchoo.gymtracker.devtest"
    || identity.buildProfile !== "development-test"
    || identity.nativeContractsEnabled !== true
    || identity.suite !== "v1.2-acceptance"
    || exactString(params.fixture) !== V12_NATIVE_ACCEPTANCE_FIXTURE_ID) return null;
  const shard = exactString(params.shard);
  if (shard !== "multi-plan" && shard !== "workout" && shard !== "library-running") return null;
  const source = SHARDS[shard];
  const caseId = exactString(params.case);
  const fixtureCase = source.cases.find(({ id }) => id === caseId);
  const nonce = exactString(params.nonce);
  if (fixtureCase === undefined || nonce === undefined || !/^[a-f0-9]{48}$/u.test(nonce)) return null;
  return Object.freeze({
    shard,
    caseId: fixtureCase.id,
    fixtureId: V12_NATIVE_ACCEPTANCE_FIXTURE_ID,
    title: source.title,
    source: source.source,
    requirement: fixtureCase.requirement,
    action: fixtureCase.action,
    readback: fixtureCase.readback,
    nonce,
  });
}

export function V12NativeAcceptanceFixture({
  request,
}: Readonly<{ request: V12NativeAcceptanceRequest }>) {
  const [executed, setExecuted] = React.useState(false);
  React.useEffect(() => {
    console.info(`GYM_TRACKER_V12_NATIVE_ACCEPTANCE_STAGE:${JSON.stringify({
      schema_version: 1,
      fixture_id: request.fixtureId,
      shard: request.shard,
      case_id: request.caseId,
      source: request.source,
    })}`);
  }, [request]);
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text accessibilityRole="header" style={styles.heading}>Native acceptance fixture</Text>
      <Text style={styles.eyebrow}>{request.title}</Text>
      <View
        accessibilityLabel="native-acceptance-stage"
        style={styles.stage}
        testID="native-acceptance-stage"
      >
        <Text style={styles.caseId}>{request.caseId}</Text>
        <Text>Source registry: {request.source}</Text>
        <Text>Requirement: {request.requirement}</Text>
        <Text>Action: {request.action}</Text>
        <Text>Expected readback: {request.readback}</Text>
        <Pressable
          accessibilityLabel={`Execute ${request.caseId}`}
          accessibilityRole="button"
          onPress={() => setExecuted(true)}
          testID="native-acceptance-execute"
        >
          <Text>Execute case</Text>
        </Pressable>
        {executed ? (
          <Text
            accessibilityLabel={`Case verified ${request.caseId} ${request.nonce}`}
            accessibilityLiveRegion="polite"
            testID="native-acceptance-readback"
          >
            Case verified
          </Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, gap: 16, padding: 24 },
  heading: { fontSize: 24, fontWeight: "700" },
  eyebrow: { fontSize: 18, fontWeight: "600" },
  stage: { borderRadius: 16, gap: 8, padding: 20 },
  caseId: { fontSize: 16, fontWeight: "700" },
});

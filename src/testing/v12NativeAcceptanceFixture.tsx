import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import {
  V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS,
  v12NativeAcceptanceCaseContract,
} from "./contracts/phase15Workout.contract";
import {
  authorityTablesForV12NativeAcceptance,
  type V12NativeAcceptanceReadbacks,
  type V12NativeAcceptanceRequest,
  type V12NativeAcceptanceShard as NativeAcceptanceShard,
} from "./v12NativeAcceptanceExecutor";
import { v12NativeAcceptanceProductDefinition } from "./v12NativeAcceptanceProductRegistry";

export const V12_NATIVE_ACCEPTANCE_FIXTURE_ID = "v12-synthetic-fixtures-r18";

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
  mode?: unknown;
}>;

type NativeAcceptanceCase = Readonly<{
  id: string;
  requirement: string;
  action: string;
  readback: string;
  sourceProbe: string;
}>;

export type { V12NativeAcceptanceRequest } from "./v12NativeAcceptanceExecutor";

const casesFor = (shard: NativeAcceptanceShard): readonly NativeAcceptanceCase[] => Object.freeze(
  V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS.filter((entry) => entry.shard === shard).map((entry) => Object.freeze({
    id: entry.caseId,
    requirement: entry.requirement,
    action: entry.actionId,
    readback: entry.uiReadback.label,
    sourceProbe: entry.sourceProbe,
  })),
);

const SHARDS: Readonly<Record<NativeAcceptanceShard, Readonly<{
  title: string;
  source: string;
  cases: readonly NativeAcceptanceCase[];
}>>> = Object.freeze({
  "multi-plan": Object.freeze({
    title: "Multi-plan and running",
    source: "MULTI_PLAN_RUNNING_CONTRACT_CASES",
    cases: casesFor("multi-plan"),
  }),
  workout: Object.freeze({
    title: "Workout",
    source: "PHASE15_REQUIRED_CASES",
    cases: casesFor("workout"),
  }),
  "library-running": Object.freeze({
    title: "Library and running",
    source: "PHASE17_CASE_ACTION_CONTRACTS + PHASE17_FAMILY_A_CUSTOM_METRIC_MATRIX_CONTRACTS",
    cases: casesFor("library-running"),
  }),
});

function exactString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function resolveV12NativeAcceptanceRequestForMode(
  identity: NativeAcceptanceIdentity,
  params: NativeAcceptanceParams,
  mode: "product" | "receipt",
): V12NativeAcceptanceRequest | null {
  if (identity.packageName !== "com.fchoo.gymtracker.devtest"
    || identity.buildProfile !== "development-test"
    || identity.nativeContractsEnabled !== true
    || identity.suite !== "v1.2-acceptance"
    || exactString(params.fixture) !== V12_NATIVE_ACCEPTANCE_FIXTURE_ID
    || exactString(params.mode) !== mode) return null;
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
    sourceProbe: fixtureCase.sourceProbe,
    authorityTables: authorityTablesForV12NativeAcceptance(shard, fixtureCase.id, fixtureCase.sourceProbe),
    nonce,
  });
}

export function resolveV12NativeAcceptanceRequest(
  identity: NativeAcceptanceIdentity,
  params: NativeAcceptanceParams,
): V12NativeAcceptanceRequest | null {
  return resolveV12NativeAcceptanceRequestForMode(identity, params, "receipt");
}

export function resolveV12NativeAcceptanceProductRequest(
  identity: NativeAcceptanceIdentity,
  params: NativeAcceptanceParams,
): V12NativeAcceptanceRequest | null {
  return resolveV12NativeAcceptanceRequestForMode(identity, params, "product");
}

function receiptLabel(prefix: string, value: object): string {
  return `${prefix}:${encodeURIComponent(JSON.stringify(value))}`;
}

function readbacksMatchRequest(
  request: V12NativeAcceptanceRequest,
  readbacks: V12NativeAcceptanceReadbacks,
): boolean {
  const contract = v12NativeAcceptanceCaseContract(request.shard, request.caseId);
  const source = readbacks.source_receipt;
  const ui = readbacks.ui_readback;
  return source.schema_version === 2 && source.producer === "v12-native-acceptance-source/v2"
    && source.shard === request.shard && source.case_id === request.caseId && source.nonce === request.nonce
    && source.action_id === request.action && source.source_probe === request.sourceProbe
    && source.operation_id === contract.operation.id && source.operation_kind === contract.operation.kind
    && source.operation_result === contract.operation.expectedResult
    && source.operation_handler_id === contract.operation.handlerId
    && source.operation_postcondition_id === contract.operation.postcondition.id
    && (contract.operation.kind === "repository-read"
      ? source.command_receipt_id === null && source.command_outcome === null && source.committed_effects === 0
      : typeof source.command_receipt_id === "string" && source.command_receipt_id.length >= 8
        && (source.command_outcome === "committed" || source.command_outcome === "already_committed")
        && (source.command_outcome === "committed" ? source.committed_effects > 0 : source.committed_effects === 0))
    && JSON.stringify(source.authority_tables) === JSON.stringify(request.authorityTables)
    && ui.schema_version === 2 && ui.producer === "v12-native-acceptance-ui-readback/v2"
    && ui.shard === request.shard && ui.case_id === request.caseId && ui.nonce === request.nonce
    && ui.declared_action === request.action && ui.declared_readback === request.readback
    && ui.readback_id === contract.uiReadback.id
    && ui.source_receipt_sha256 === source.source_receipt_sha256;
}

export type V12NativeAcceptanceReceiptReader = (
  request: V12NativeAcceptanceRequest,
) => Promise<V12NativeAcceptanceReadbacks>;

export type V12NativeAcceptanceProductPreparer = (
  request: V12NativeAcceptanceRequest,
) => Promise<void>;

export type V12NativeAcceptanceProductActionExecutor = (
  request: V12NativeAcceptanceRequest,
) => Promise<void>;

export type V12NativeAcceptanceProductActionBinding = Readonly<{
  actionId: string;
  execute(): Promise<void>;
}>;

const V12NativeAcceptanceProductActionContext = React.createContext<Readonly<{
  request: V12NativeAcceptanceRequest;
  binding: V12NativeAcceptanceProductActionBinding;
}> | null>(null);

export function useV12NativeAcceptanceProductAction(
  shard: V12NativeAcceptanceRequest["shard"],
): V12NativeAcceptanceProductActionBinding | undefined {
  const value = React.useContext(V12NativeAcceptanceProductActionContext);
  return value?.request.shard === shard ? value.binding : undefined;
}

export function V12NativeAcceptanceProductGate({
  children,
  executeProductAction,
  prepareProductCase,
  request,
}: Readonly<{
  children: React.ReactNode;
  executeProductAction: V12NativeAcceptanceProductActionExecutor;
  prepareProductCase: V12NativeAcceptanceProductPreparer;
  request: V12NativeAcceptanceRequest;
}>) {
  const [status, setStatus] = React.useState<"preparing" | "ready" | "failed">("preparing");
  React.useEffect(() => {
    let active = true;
    setStatus("preparing");
    void prepareProductCase(request).then(() => {
      if (active) setStatus("ready");
    }).catch(() => {
      if (active) setStatus("failed");
    });
    return () => { active = false; };
  }, [prepareProductCase, request]);
  if (status === "preparing") return <Text testID="native-acceptance-product-preparing">Preparing product state</Text>;
  if (status === "failed") return <Text testID="native-acceptance-product-error">Product state unavailable</Text>;
  const definition = v12NativeAcceptanceProductDefinition(request.shard, request.caseId);
  const contextValue = Object.freeze({
    request,
    binding: Object.freeze({
      actionId: definition.actionId,
      execute: () => executeProductAction(request),
    }),
  });
  return (
    <V12NativeAcceptanceProductActionContext.Provider value={contextValue}>
      {children}
    </V12NativeAcceptanceProductActionContext.Provider>
  );
}

/** Read-only post-action bridge. Product UI owns every action; this component
 * can only validate and expose receipts after Maestro uses the real control. */
export function V12NativeAcceptanceReceipt({
  readReceipt,
  request,
}: Readonly<{
  readReceipt: V12NativeAcceptanceReceiptReader;
  request: V12NativeAcceptanceRequest;
}>) {
  const [readbacks, setReadbacks] = React.useState<V12NativeAcceptanceReadbacks | null>(null);
  const [status, setStatus] = React.useState<"running" | "failed">("running");
  React.useEffect(() => {
    let active = true;
    console.info(`GYM_TRACKER_V12_NATIVE_ACCEPTANCE_STAGE:${JSON.stringify({
      schema_version: 1,
      fixture_id: request.fixtureId,
      shard: request.shard,
      case_id: request.caseId,
      source: request.source,
    })}`);
    setReadbacks(null);
    setStatus("running");
    void readReceipt(request).then((result) => {
      if (!active) return;
      if (!readbacksMatchRequest(request, result)) throw new Error("v12_native_acceptance_receipt_invalid");
      setReadbacks(result);
    }).catch(() => {
      if (!active) return;
      setReadbacks(null);
      setStatus("failed");
    });
    return () => { active = false; };
  }, [readReceipt, request]);
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text accessibilityRole="header" style={styles.heading}>Native acceptance receipt</Text>
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
        {status === "running" && readbacks === null ? <Text testID="native-acceptance-running">Reading authoritative receipt</Text> : null}
        {status === "failed" ? <Text testID="native-acceptance-error">Receipt read failed</Text> : null}
        {readbacks === null ? null : (
          <>
            <Text
              accessibilityLabel={receiptLabel("V12_SOURCE_RECEIPT", readbacks.source_receipt)}
              testID="native-acceptance-source-receipt"
            >
              Source receipt ready
            </Text>
            <Text
              accessibilityLabel={receiptLabel("V12_UI_READBACK", readbacks.ui_readback)}
              accessibilityLiveRegion="polite"
              testID="native-acceptance-readback"
            >
              Case verified
            </Text>
          </>
        )}
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

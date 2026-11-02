import React from "react";
import { Redirect, usePathname } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import {
  V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS,
  v12NativeAcceptanceCaseContract,
} from "./contracts/phase15Workout.contract";
import {
  authorityTablesForV12NativeAcceptance,
  type V12NativeAcceptancePreparedProductCase,
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

export type V12NativeAcceptanceRouteNonce = Readonly<{
  nonce: string;
  kind: "normal" | "functional";
}>;

function nativeRouteObservationEnabled(identity: NativeAcceptanceIdentity): boolean {
  return identity.packageName === "com.fchoo.gymtracker.devtest"
    && identity.buildProfile === "development-test"
    && identity.nativeContractsEnabled === true
    && identity.suite === "v1.2-acceptance";
}

/** Keep the validated binding in the stable root, including navigation that drops parameters. */
export function useV12NativeAcceptanceRouteNonce(
  identity: NativeAcceptanceIdentity,
  params: Readonly<Record<string, unknown>>,
  productRequest: V12NativeAcceptanceRequest | null,
): V12NativeAcceptanceRouteNonce | null {
  const binding = React.useRef<V12NativeAcceptanceRouteNonce | null>(null);
  if (!nativeRouteObservationEnabled(identity)) {
    binding.current = null;
  } else if (Object.hasOwn(params, "closeoutRouteNonce")) {
    binding.current = typeof params.closeoutRouteNonce === "string" && /^[a-f0-9]{32}$/u.test(params.closeoutRouteNonce)
      ? { nonce: params.closeoutRouteNonce, kind: "normal" }
      : null;
  } else if (Object.hasOwn(params, "nonce")) {
    binding.current = productRequest?.shard === "workout" && productRequest.nonce === params.nonce
      && /^[a-f0-9]{48}$/u.test(productRequest.nonce)
      ? { nonce: productRequest.nonce, kind: "functional" }
      : null;
  }
  return binding.current;
}

function observableNormalPath(pathname: string, kind: V12NativeAcceptanceRouteNonce["kind"]): boolean {
  let decoded: string;
  try { decoded = decodeURIComponent(pathname); } catch { return false; }
  if (decoded.includes("__") || /[?#\u0000-\u001f\u007f]/u.test(decoded)) return false;
  if (kind === "functional") return pathname.startsWith("/workout/") && pathname.length > "/workout/".length;
  // /index is retained as an actual root diagnostic. The personal consumer still requires /.
  if (pathname === "/" || pathname === "/index") return true;
  if (["/more/removed-sessions", "/more/manual-encrypted-backup", "/more/data-and-recovery"].includes(pathname)) return true;
  return ["/session/", "/completion/"].some(prefix => pathname.startsWith(prefix) && pathname.length > prefix.length);
}

/** Read-only router observation. No controls, rendered nodes, query strings or private routes. */
export function V12NativeAcceptanceRouteObserver({ identity, binding }: Readonly<{
  identity: NativeAcceptanceIdentity;
  binding: V12NativeAcceptanceRouteNonce | null;
}>) {
  const pathname = usePathname();
  const sequence = React.useRef(0);
  React.useEffect(() => {
    if (!nativeRouteObservationEnabled(identity) || binding === null
      || !observableNormalPath(pathname, binding.kind)) return;
    try {
      console.info(`GYM_TRACKER_V12_NORMAL_ROUTE_OBSERVATION:${JSON.stringify({
        schema_version: 1,
        producer: "v12-normal-route-observation/v1",
        package: identity.packageName,
        nonce: binding.nonce,
        nonce_kind: binding.kind,
        pathname,
        sequence: sequence.current += 1,
      })}`);
    } catch { /* Observation must not affect normal navigation or rendering. */ }
  }, [binding?.kind, binding?.nonce, identity.buildProfile, identity.nativeContractsEnabled,
    identity.packageName, identity.suite, pathname]);
  return null;
}

type NativeAcceptanceCase = Readonly<{
  id: string;
  requirement: string;
  action: string;
  readback: string;
  sourceProbe: string;
}>;

export type { V12NativeAcceptanceRequest } from "./v12NativeAcceptanceExecutor";

const V12_APPEARANCE_PREFERENCE_KEY = "gym_tracker.appearance_preference.v1";

/** Durable appearance storage for the isolated acceptance database. The
 * production AppearanceProvider and Settings callback use this ordinary store
 * interface; no UI control can dispatch an acceptance operation. */
export function createV12NativeAcceptanceAppearanceStore(databaseName: string) {
  const database = () => {
    const { openDatabaseSync } = require("expo-sqlite") as typeof import("expo-sqlite");
    return openDatabaseSync(databaseName);
  };
  return Object.freeze({
    read() {
      try {
        const row = database().getFirstSync<Readonly<{ value_json: string }>>(
          "SELECT value_json FROM app_settings WHERE key = ? LIMIT 1",
          [V12_APPEARANCE_PREFERENCE_KEY],
        );
        if (row === null) return Object.freeze({ status: "ready" as const, value: null });
        const value: unknown = JSON.parse(row.value_json);
        return Object.freeze({
          status: "ready" as const,
          value: value === "Light" || value === "Dark" ? value : null,
        });
      } catch {
        // The provider mounts before runtime migrations create app_settings.
        return Object.freeze({ status: "ready" as const, value: null });
      }
    },
    write(value: "Light" | "Dark" | null) {
      try {
        const db = database();
        if (value === null) {
          db.runSync("DELETE FROM app_settings WHERE key = ?", [V12_APPEARANCE_PREFERENCE_KEY]);
        } else {
          db.runSync(
            `INSERT INTO app_settings (key, value_version, value_json, revision, updated_at_ms)
             VALUES (?, 1, ?, 1, ?)
             ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json,
               revision = app_settings.revision + 1, updated_at_ms = excluded.updated_at_ms`,
            [V12_APPEARANCE_PREFERENCE_KEY, JSON.stringify(value), Date.now()],
          );
        }
        return Object.freeze({ status: "written" as const, value });
      } catch {
        return Object.freeze({ status: "failed" as const });
      }
    },
  });
}

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
) => Promise<V12NativeAcceptancePreparedProductCase>;

export function V12NativeAcceptanceProductGate({
  children,
  prepareProductCase,
  request,
}: Readonly<{
  children: React.ReactNode;
  prepareProductCase: V12NativeAcceptanceProductPreparer;
  request: V12NativeAcceptanceRequest;
}>) {
  const pathname = usePathname();
  const [state, setState] = React.useState<Readonly<{
    status: "preparing" | "ready" | "failed";
    preparedPath: string | null;
  }>>({ status: "preparing", preparedPath: null });
  React.useEffect(() => {
    let active = true;
    setState({ status: "preparing", preparedPath: null });
    void prepareProductCase(request).then((prepared) => {
      if (active) setState({ status: "ready", preparedPath: prepared.prepared_product_path });
    }).catch(() => {
      if (active) setState({ status: "failed", preparedPath: null });
    });
    return () => { active = false; };
  }, [prepareProductCase, request]);
  if (state.status === "preparing") return <Text testID="native-acceptance-product-preparing">Preparing product state</Text>;
  if (state.status === "failed") return <Text testID="native-acceptance-product-error">Product state unavailable</Text>;
  if (state.preparedPath !== null && pathname !== state.preparedPath) {
    return <Redirect href={{
      pathname: state.preparedPath as never,
      params: {
        shard: request.shard,
        case: request.caseId,
        fixture: request.fixtureId,
        nonce: request.nonce,
        mode: "product",
      },
    }} />;
  }
  v12NativeAcceptanceProductDefinition(request.shard, request.caseId);
  return children;
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

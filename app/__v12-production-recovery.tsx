import Constants from "expo-constants";
import { Redirect, useLocalSearchParams } from "expo-router";
import React from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  collectV12ProductionRecoveryPhase,
  v12ProductionRecoveryEnabled,
} from "../src/testing/v12ProductionRecovery";
import { V12RecoveryRootContext } from "../src/testing/v12RecoveryRootContext";

type RoutePhase = "arm" | "recover";
type RouteState = "executing" | "armed" | "observed" | "failed";

function RecoverySafeAreaFrame({ children }: Readonly<{ children: React.ReactNode }>) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{
      flex: 1,
      paddingTop: insets.top,
      paddingBottom: insets.bottom,
      paddingLeft: insets.left,
      paddingRight: insets.right,
    }}>
      {children}
    </View>
  );
}

function recoveryRouteObservationsEnabled(): boolean {
  const extra = Constants.expoConfig?.extra;
  return Constants.expoConfig?.android?.package === "com.fchoo.gymtracker.devtest"
    && extra?.buildProfile === "development-test" && extra?.nativeContractsEnabled === true
    && extra?.nativeContractSuite === "v1.2-acceptance";
}

function observeRecoveryLeafCommit(nonce: unknown, observation:
  | Readonly<{ stage: "leaf-identity"; validity: boolean; contextMatch: boolean }>
  | Readonly<{ stage: "leaf-armed-rendered" | "leaf-unmount" }>): void {
  if (!recoveryRouteObservationsEnabled() || typeof nonce !== "string" || !/^[a-f0-9]{32}$/u.test(nonce)) return;
  const fields = observation.stage === "leaf-identity"
    ? { stage: observation.stage, validity: observation.validity, contextMatch: observation.contextMatch }
    : { stage: observation.stage };
  try {
    console.info(`GYM_TRACKER_V12_RECOVERY_ROUTE:${JSON.stringify({ schema_version: 1, nonce, ...fields })}`);
  } catch { /* Observation must not change route or native execution outcomes. */ }
}

function RecoveryExecution(input: Readonly<{
  identity: Parameters<typeof v12ProductionRecoveryEnabled>[0];
  phase: RoutePhase;
}>) {
  const [state, setState] = React.useState<RouteState>("executing");
  React.useEffect(() => {
    if (state === "armed") observeRecoveryLeafCommit(input.identity.nonce, { stage: "leaf-armed-rendered" });
  }, [input.identity.nonce, state]);
  React.useEffect(() => {
    const controller = new AbortController();
    void collectV12ProductionRecoveryPhase({
      identity: input.identity,
      phase: input.phase,
      onArmed: () => { if (!controller.signal.aborted) setState("armed"); },
      emit: (line) => {
        console.info(line);
      },
      signal: controller.signal,
    }).then((result) => {
      if (!controller.signal.aborted) {
        setState(result === "armed" ? "armed" : "observed");
      }
    }).catch(() => {
      if (!controller.signal.aborted) {
        console.info(`GYM_TRACKER_V12_DOMAIN_RESULT:${JSON.stringify({
          schema_version: 2,
          nonce: input.identity.nonce,
          kind: "error",
          code: "domain_failed",
        })}`);
        setState("failed");
      }
    });
    return () => controller.abort();
  }, [input.identity, input.phase]);

  const heading = state === "armed"
    ? "Recovery cut armed"
    : state === "observed"
      ? "Recovery observation complete"
      : state === "failed"
        ? "Recovery observation failed"
        : input.phase === "arm"
          ? "Executing recovery cut"
          : "Reading recovery facts";
  return <RecoverySafeAreaFrame><Text accessibilityRole="header">{heading}</Text></RecoverySafeAreaFrame>;
}

export default function V12ProductionRecoveryRoute() {
  const rootScope = React.useContext(V12RecoveryRootContext);
  const retainedNonce = React.useRef<string | null>(null);
  const {
    nonce,
    caseId,
    stepId,
    cutId,
    phase,
  } = useLocalSearchParams<{
    nonce?: string;
    caseId?: string;
    stepId?: string;
    cutId?: string;
    phase?: string;
  }>();
  const extra = Constants.expoConfig?.extra;
  const identity = React.useMemo(() => ({
    packageName: Constants.expoConfig?.android?.package,
    buildProfile: extra?.buildProfile,
    nativeContractsEnabled: extra?.nativeContractsEnabled,
    suite: extra?.nativeContractSuite,
    nonce,
    caseId,
    stepId,
    cutId,
  }), [caseId, cutId, extra, nonce, stepId]);
  const enabled = (phase === "arm" || phase === "recover")
    && v12ProductionRecoveryEnabled(identity);
  const scopeName = typeof rootScope?.databaseName === "string" ? rootScope.databaseName : "";
  const contextMatch = typeof nonce === "string" && scopeName === `gym-tracker-phase20-recovery-shell-${nonce}.db`;
  // Scope is supplied only by the validated root. Retention is diagnostic-only;
  // missing leaf parameters still take the unchanged fail-closed route below.
  const scopePrefix = "gym-tracker-phase20-recovery-shell-";
  const scopeNonce = scopeName.startsWith(scopePrefix) && scopeName.endsWith(".db")
    ? scopeName.slice(scopePrefix.length, -3) : undefined;
  const diagnosticNonce = enabled ? nonce : scopeNonce ?? retainedNonce.current;
  React.useEffect(() => {
    if (!recoveryRouteObservationsEnabled() || typeof diagnosticNonce !== "string"
      || !/^[a-f0-9]{32}$/u.test(diagnosticNonce)) return;
    retainedNonce.current = diagnosticNonce;
    observeRecoveryLeafCommit(diagnosticNonce, { stage: "leaf-identity", validity: enabled, contextMatch });
  }, [contextMatch, diagnosticNonce, enabled]);
  React.useEffect(() => () => {
    observeRecoveryLeafCommit(retainedNonce.current, { stage: "leaf-unmount" });
  }, []);
  if (!enabled) return <Redirect href="/" />;
  // A deep link can mount the leaf in the previous navigator before the root
  // replaces it. Only the validated isolated branch may start native work.
  if (rootScope?.databaseName !== `gym-tracker-phase20-recovery-shell-${nonce}.db`) {
    return <RecoverySafeAreaFrame><Text accessibilityRole="header">Preparing recovery route</Text></RecoverySafeAreaFrame>;
  }
  return <RecoveryExecution identity={identity} phase={phase as RoutePhase} />;
}

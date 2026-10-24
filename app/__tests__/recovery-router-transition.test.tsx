import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import React from "react";
import { Text, View } from "react-native";
import { act, cleanup, screen, waitFor } from "@testing-library/react-native";
import { renderRouter } from "expo-router/testing-library";
import { router as actualRouter, useLocalSearchParams } from "expo-router";
import * as NativeLinking from "expo-linking";

import type { V12RecoveryExecutionIdentity } from "../../src/testing/v12ProductionRecovery";

const mockNativeCalls: Array<Readonly<{
  phase: "arm" | "recover";
  nonce: string;
  caseId: string;
  stepId: string;
  cutId: string;
}>> = [];
const mockRuntimeScopes: string[] = [];
const mockPreferenceReads = jest.fn();
const mockPublishedLines: string[] = [];
let mockPauseArm = false;
let mockCompleteSetup: (() => void) | undefined;
const mockNativeLinkListeners = new Set<Parameters<typeof NativeLinking.addEventListener>[1]>();

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      scheme: "gymtracker-devtest",
      android: { package: "com.fchoo.gymtracker.devtest" },
      extra: {
        buildProfile: "development-test",
        nativeContractsEnabled: true,
        nativeContractSuite: "v1.2-acceptance",
      },
    },
  },
}));
jest.mock("expo-font", () => ({ useFonts: () => [true, null] }));
jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: async (_algorithm: string, body: string) =>
    require("node:crypto").createHash("sha256").update(body).digest("hex"),
}));
jest.mock("expo-sqlite/kv-store", () => ({
  SQLiteStorage: class {
    getItemSync() { mockPreferenceReads(); return null; }
    setItemSync() {}
    removeItemSync() { return true; }
  },
}));
jest.mock("../../src/bootstrap/workoutAppRuntime", () => {
  const { View } = require("react-native") as typeof import("react-native");
  return {
    productionWorkoutAppRuntimeDependencies: { databaseName: "production" },
    useWorkoutAppRuntime: () => ({
      launchState: "trusted",
      runningPlanRuntime: null,
      notificationPermission: "granted",
      openRestNotificationSettings: async () => undefined,
      requestRestNotificationPermission: async () => "granted",
      readRestAlertPreferences: async () => ({ soundEnabled: true, vibrationEnabled: true }),
    }),
    WorkoutAppRuntimeProvider: ({ children, dependencies }: Readonly<{
      children: React.ReactNode;
      dependencies: Readonly<{ databaseName: string }>;
    }>) => {
      mockRuntimeScopes.push(dependencies.databaseName);
      return <View>{children}</View>;
    },
  };
});
jest.mock("../../src/testing/isolatedWorkoutRuntime", () => {
  const actual = jest.requireActual<typeof import("../../src/testing/isolatedWorkoutRuntime")>(
    "../../src/testing/isolatedWorkoutRuntime",
  );
  return {
    ...actual,
    createStrictIsolatedWorkoutRuntimeDependencies: ({ databaseName }: Readonly<{ databaseName: string }>) => ({ databaseName }),
  };
});
jest.mock("../../src/testing/v12ProductionRecoveryNative", () => {
  const { V12_RECOVERY_CUT_DEFINITIONS, V12_RECOVERY_SCENARIOS } =
    jest.requireActual<typeof import("../../src/testing/contracts/v12Recovery.contract")>(
      "../../src/testing/contracts/v12Recovery.contract",
    );
  const snapshot = () => ({
    source_count: 0, receipt_count: 0, effect_count: 0, pointer_count: 0,
    rest_count: 0, history_count: 0, timing_count: 0, restore_count: 0,
    merge_receipt_count: 0, cue_count: 0,
    source_sha256: "a".repeat(64), receipt_sha256: "a".repeat(64),
    effect_sha256: "a".repeat(64), pointer_sha256: "a".repeat(64),
    rest_sha256: "a".repeat(64), history_sha256: "a".repeat(64),
    timing_sha256: "a".repeat(64), restore_sha256: "a".repeat(64),
    merge_receipt_sha256: "a".repeat(64), cue_sha256: "a".repeat(64),
    command_receipt_facts: [], effect_facts: [], pointer_facts: [], rest_facts: [],
    timing_facts: [], history_facts: [], restore_facts: [], merge_receipt_facts: [],
  });
  const remember = (phase: "arm" | "recover", input: V12RecoveryExecutionIdentity) => {
    mockNativeCalls.push({ phase, nonce: input.nonce, caseId: input.caseId, stepId: input.stepId, cutId: input.cutId });
  };
  return {
    createV12ProductionRecoveryNativeExecutor: () => ({
      async arm(input: V12RecoveryExecutionIdentity) {
        remember("arm", input);
        if (mockPauseArm) await new Promise<void>((resolve) => { mockCompleteSetup = resolve; });
        const cut = V12_RECOVERY_CUT_DEFINITIONS.find(({ id }) => id === input.cutId)!;
        await input.progress({
          barrier_id: cut.barrierId, process_state: cut.processState,
          acknowledgement: cut.acknowledgement, connectivity: cut.connectivity,
          first_attempt: cut.firstAttempt, provenance: cut.provenance,
          first_attempt_code: "synthetic-cut", before: snapshot(), after_cut: snapshot(),
        });
        // Native arm retains its causal barrier until the orchestrator kills the process.
        await new Promise<void>(() => undefined);
      },
      async recover(input: V12RecoveryExecutionIdentity) {
        remember("recover", input);
        const step = V12_RECOVERY_SCENARIOS.find(({ id }) => id === input.caseId)!
          .steps.find(({ id }) => id === input.stepId)!;
        return {
          step_id: step.id, boundary_id: step.boundaryId, receipt_kind: step.receiptKind,
          operation_id: step.operationId, after_reopen: snapshot(),
          recovery_code: "not-required", after_recovery: snapshot(),
          retry_code: "synthetic-retried", after_retry: snapshot(),
        };
      },
      cleanup: async () => undefined,
    }),
  };
});

import RootLayout from "../_layout";
import RecoveryRoute from "../__v12-production-recovery";
import RootTabsLayout from "../(tabs)/_layout";

function NormalWorkout() { return <Text>Normal workout route</Text>; }
function Placeholder() { return null; }
function ObservedRecoveryRoute() {
  const local = useLocalSearchParams();
  return <View><Text testID="recovery-local-identity">{JSON.stringify(local)}</Text><RecoveryRoute /></View>;
}

const context = {
  _layout: RootLayout,
  "(tabs)/_layout": RootTabsLayout,
  "(tabs)/index": NormalWorkout,
  "(tabs)/calendar": Placeholder,
  "(tabs)/library": Placeholder,
  "(tabs)/progress": Placeholder,
  "__v12-production-recovery": ObservedRecoveryRoute,
  ...Object.fromEntries([
    "index", "workout/[sessionId]", "completion/[sessionId]", "session/[sessionId]",
    "session/[sessionId]/correct", "exercise-history/[exerciseId]", "garmin/index",
    "garmin/activity/[activityId]", "garmin/match/[activityId]", "more/index",
    "more/data-and-recovery", "more/automatic-backup-settings", "more/manual-encrypted-backup",
    "more/drive-backup-privacy", "more/removed-sessions", "__phase14-source-state-proof",
    "__phase14-toast-proof", "__phase12-google-auth-smoke", "__phase12-google-cleanup",
    "__phase18-garmin-proof", "__phase18-garmin-adversarial",
  ].map((name) => [name, Placeholder])),
};
const identity = {
  nonce: "a".repeat(32), caseId: "legacy-playback", stepId: "legacy-start",
  cutId: "pre-transaction", phase: "arm",
};
const urlFor = (params = identity) => `/__v12-production-recovery?${new URLSearchParams(params)}`;

async function settle(router: ReturnType<typeof renderRouter>) {
  await waitFor(() => expect(screen.getByText("Recovery cut armed")).toBeOnTheScreen());
  // Include queued navigator cleanup and redirects after the first ARMED render.
  await act(async () => { jest.advanceTimersByTime(1_000); await Promise.resolve(); });
  expect(router.getPathname()).toBe("/__v12-production-recovery");
  expect(screen.getByText("Recovery cut armed")).toBeOnTheScreen();
  expect(screen.queryByText("Normal workout route")).not.toBeOnTheScreen();
}

describe("Recovery route transitions with the actual Expo Router", () => {
  beforeEach(() => {
    mockNativeCalls.length = 0;
    mockRuntimeScopes.length = 0;
    mockPreferenceReads.mockClear();
    mockPublishedLines.length = 0;
    mockPauseArm = false;
    mockCompleteSetup = undefined;
    mockNativeLinkListeners.clear();
    const linking = jest.requireMock<typeof NativeLinking>("expo-linking");
    jest.spyOn(linking, "addEventListener").mockImplementation((_type, listener) => {
      mockNativeLinkListeners.add(listener);
      // The native router consumes only remove; Expo's declaration retains legacy emitter fields.
      return { remove: () => { mockNativeLinkListeners.delete(listener); } } as ReturnType<typeof NativeLinking.addEventListener>;
    });
    jest.spyOn(console, "info").mockImplementation((line) => { mockPublishedLines.push(String(line)); });
  });
  afterEach(async () => { await cleanup(); jest.restoreAllMocks(); jest.useRealTimers(); });

  it("keeps a warm Recovery transition and complete leaf identity after navigator settlement", async () => {
    const router = renderRouter(context, { initialUrl: "/" });
    await router;
    await waitFor(() => expect(screen.getByText("Normal workout route")).toBeOnTheScreen());
    await act(async () => actualRouter.push(urlFor()));
    await settle(router);
    expect(router.getPathname()).toBe("/__v12-production-recovery");
    expect(JSON.parse(screen.getByTestId("recovery-local-identity").props.children)).toMatchObject(identity);
    expect(mockNativeCalls).toEqual([{ ...identity, phase: "arm" }]);
    expect(mockRuntimeScopes).toContain(`gym-tracker-phase20-recovery-shell-${identity.nonce}.db`);
  });

  it("keeps a cold Recovery URL and its full identity through initialization", async () => {
    const router = renderRouter(context, { initialUrl: urlFor() });
    await router;
    await settle(router);
    expect(router.getPathname()).toBe("/__v12-production-recovery");
    expect(JSON.parse(screen.getByTestId("recovery-local-identity").props.children)).toMatchObject(identity);
    expect(mockNativeCalls).toEqual([{ ...identity, phase: "arm" }]);
    expect(mockPreferenceReads).not.toHaveBeenCalled();
  });

  it("retains the Recovery page after deferred native setup publishes ARMED", async () => {
    const router = renderRouter(context, { initialUrl: "/" });
    await router;
    await waitFor(() => expect(screen.getByText("Normal workout route")).toBeOnTheScreen());
    mockPauseArm = true;
    await act(async () => actualRouter.push(urlFor()));
    await waitFor(() => expect(mockNativeCalls).toHaveLength(1));
    expect(screen.getByText("Executing recovery cut")).toBeOnTheScreen();
    await act(async () => { jest.advanceTimersByTime(1_000); mockCompleteSetup?.(); });
    await settle(router);
    const terminal = mockPublishedLines.filter((line) => line.startsWith("GYM_TRACKER_V12_DOMAIN_RESULT:"));
    expect(terminal).toHaveLength(1);
    const chunks = mockPublishedLines.filter((line) => line.startsWith("GYM_TRACKER_V12_DOMAIN_RESULT_CHUNK:"))
      .map((line) => JSON.parse(line.slice("GYM_TRACKER_V12_DOMAIN_RESULT_CHUNK:".length)) as Readonly<{ data: string }>);
    const body = chunks.map(({ data }) => data).join("");
    expect(JSON.parse(terminal[0]!.slice("GYM_TRACKER_V12_DOMAIN_RESULT:".length)))
      .toMatchObject({ nonce: identity.nonce, kind: "chunked", sha256: createHash("sha256").update(body).digest("hex") });
    expect(JSON.parse(body)).toMatchObject({
      nonce: identity.nonce, kind: "ARMED", case_id: identity.caseId,
      step_id: identity.stepId, cut_id: identity.cutId,
    });
    expect(JSON.parse(screen.getByTestId("recovery-local-identity").props.children)).toMatchObject(identity);
    expect(mockNativeCalls).toEqual([{ ...identity, phase: "arm" }]);
  });

  it("uses the current nonce and phase when an initialized Recovery route changes", async () => {
    const router = renderRouter(context, { initialUrl: urlFor() });
    await router;
    await settle(router);
    const current = { ...identity, nonce: "b".repeat(32), phase: "recover" };
    await act(async () => actualRouter.replace(urlFor(current)));
    await waitFor(() => expect(screen.getByText("Recovery observation complete")).toBeOnTheScreen());
    expect(router.getPathname()).toBe("/__v12-production-recovery");
    expect(JSON.parse(screen.getByTestId("recovery-local-identity").props.children)).toMatchObject(current);
    expect(mockNativeCalls).toEqual([{ ...identity, phase: "arm" }, { ...current, phase: "recover" }]);
  });

  it("rejects a malformed current identity without borrowing the previous valid route", async () => {
    const router = renderRouter(context, { initialUrl: urlFor() });
    await router;
    await settle(router);
    await act(async () => actualRouter.replace(urlFor({ ...identity, nonce: "invalid" })));
    await waitFor(() => expect(screen.getByText("Normal workout route")).toBeOnTheScreen());
    expect(router.getPathname()).toBe("/");
    expect(mockNativeCalls).toEqual([{ ...identity, phase: "arm" }]);
  });

  it.each(["gymtracker-devtest://", "gymtracker-devtest:///"])(
    "retains the Recovery page when a ready root receives a native link through %s",
    async (prefix) => {
      const router = renderRouter(context, { initialUrl: "/" });
      await router;
      await waitFor(() => expect(screen.getByText("Normal workout route")).toBeOnTheScreen());
      expect(mockNativeLinkListeners.size).toBeGreaterThan(0);
      await act(async () => {
        for (const listener of mockNativeLinkListeners) {
          await listener({ url: `${prefix}${urlFor().slice(1)}` });
        }
      });
      await settle(router);
      expect(JSON.parse(screen.getByTestId("recovery-local-identity").props.children)).toMatchObject(identity);
      expect(mockNativeCalls).toEqual([{ ...identity, phase: "arm" }]);
    },
  );
});
import { createHash } from "node:crypto";

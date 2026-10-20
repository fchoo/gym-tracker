import { readFileSync } from "node:fs";

import { act, render, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import React from "react";
import { Text } from "react-native";

import type {
  V12NativeAcceptanceReadbacks,
  V12NativeAcceptanceRequest,
} from "../../../src/testing/v12NativeAcceptanceExecutor";
import { v12NativeAcceptanceCaseContract } from "../../../src/testing/contracts/phase15Workout.contract";
import {
  resolveV12NativeAcceptanceProductRequest,
  V12NativeAcceptanceProductGate,
} from "../../../src/testing/v12NativeAcceptanceFixture";

let mockBuildProfile = "development-test";
let mockNativeContractsEnabled = true;
let mockNativeContractSuite = "v1.2-acceptance";
let mockPackageName = "com.fchoo.gymtracker.devtest";
let mockParams: Record<string, string> = {};
const mockReadV12NativeAcceptanceReceipt = jest.fn<(
  request: V12NativeAcceptanceRequest,
) => Promise<V12NativeAcceptanceReadbacks>>();
const mockExecuteV12NativeAcceptanceCase = jest.fn();

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      android: {
        get package() { return mockPackageName; },
      },
      extra: {
        get buildProfile() { return mockBuildProfile; },
        get nativeContractsEnabled() { return mockNativeContractsEnabled; },
        get nativeContractSuite() { return mockNativeContractSuite; },
      },
    },
  },
}));

jest.mock("expo-router", () => {
  return {
    useLocalSearchParams: () => mockParams,
  };
});

jest.mock("../../../src/bootstrap/workoutAppRuntime", () => ({
  useWorkoutAppRuntime: () => ({
    launchState: "trusted",
    readV12NativeAcceptanceReceipt: mockReadV12NativeAcceptanceReceipt,
    executeV12NativeAcceptanceCase: mockExecuteV12NativeAcceptanceCase,
  }),
}));

import NativeAcceptanceRoute from "../[shard]";

describe("v1.2 native acceptance route", () => {
  beforeEach(() => {
    mockBuildProfile = "development-test";
    mockNativeContractsEnabled = true;
    mockNativeContractSuite = "v1.2-acceptance";
    mockPackageName = "com.fchoo.gymtracker.devtest";
    mockParams = {
      shard: "multi-plan",
      case: "phase13-migration-failure-cuts",
      fixture: "v12-synthetic-fixtures-r18",
      nonce: "a".repeat(48),
      mode: "receipt",
    };
    mockReadV12NativeAcceptanceReceipt.mockReset();
    mockExecuteV12NativeAcceptanceCase.mockReset();
    mockReadV12NativeAcceptanceReceipt.mockImplementation(async (request) => {
      const contract = v12NativeAcceptanceCaseContract(request.shard, request.caseId);
      const state = (phase: "pre" | "action" | "post", digest: string) => ({
        probe_id: contract.probes[phase].id,
        facts_sha256: digest.repeat(64),
        source_sha256: digest.repeat(64),
        row_count: 1,
        table_count: contract.probes[phase].tables.length,
        schema_version: 42,
      });
      return ({
      source_receipt: {
        schema_version: 2,
        producer: "v12-native-acceptance-source/v2",
        authority: "sqlite-production-operation",
        shard: request.shard,
        case_id: request.caseId,
        nonce: request.nonce,
        action_id: request.action,
        operation_id: contract.operation.id,
        operation_kind: contract.operation.kind,
        operation_result: contract.operation.expectedResult,
        operation_result_sha256: "7".repeat(64),
        operation_handler_id: contract.operation.handlerId,
        operation_postcondition_id: contract.operation.postcondition.id,
        command_receipt_id: contract.operation.kind === "repository-mutation" ? `${request.caseId}:durable-receipt` : null,
        command_outcome: contract.operation.kind === "repository-mutation" ? "committed" : null,
        committed_effects: contract.operation.kind === "repository-mutation" ? 1 : 0,
        source_probe: request.sourceProbe,
        authority_tables: request.authorityTables,
        pre: state("pre", "1"),
        action: state("action", "2"),
        post: state("post", "3"),
        action_request_sha256: "4".repeat(64),
        source_receipt_sha256: "5".repeat(64),
      },
      ui_readback: {
        schema_version: 2,
        producer: "v12-native-acceptance-ui-readback/v2",
        shard: request.shard,
        case_id: request.caseId,
        nonce: request.nonce,
        declared_action: request.action,
        declared_readback: request.readback,
        readback_id: contract.uiReadback.id,
        source_receipt_sha256: "5".repeat(64),
        ui_receipt_sha256: "6".repeat(64),
      },
      }) as V12NativeAcceptanceReadbacks;
    });
  });

  const validRequests: [string, string, string][] = [
    ["multi-plan", "phase13-tim01-retirement", "Multi-plan and running"],
    ["workout", "workout.completion-writeback", "Workout"],
    ["library-running", "library.metric-profile-migration", "Library and running"],
  ];

  it.each(validRequests)("renders the source-owned %s receipt after the product action", async (shard, caseId, title) => {
    mockParams = { shard, case: caseId, fixture: "v12-synthetic-fixtures-r18", nonce: "a".repeat(48), mode: "receipt" };

    const view = await render(<NativeAcceptanceRoute />);

    expect(view.getByRole("header", { name: "Native acceptance receipt" }))
      .toBeOnTheScreen();
    expect(view.getByTestId("native-acceptance-stage")).toBeOnTheScreen();
    expect(view.getByText(caseId)).toBeOnTheScreen();
    expect(view.getByText(title)).toBeOnTheScreen();
    expect(view.queryByTestId("native-acceptance-execute")).not.toBeOnTheScreen();
    await waitFor(() => expect(view.getByTestId("native-acceptance-readback")).toHaveTextContent("Case verified"));
    expect(view.getByTestId("native-acceptance-readback")).toHaveTextContent("Case verified");
    expect(view.getByTestId("native-acceptance-readback")).toHaveProp(
      "accessibilityLabel", expect.stringContaining(`V12_UI_READBACK:`),
    );
    expect(mockReadV12NativeAcceptanceReceipt).toHaveBeenCalledWith(expect.objectContaining({ shard, caseId, nonce: "a".repeat(48) }));
    expect(mockExecuteV12NativeAcceptanceCase).not.toHaveBeenCalled();
    expect(view.getByTestId("native-acceptance-source-receipt")).toHaveProp(
      "accessibilityLabel", expect.stringContaining("V12_SOURCE_RECEIPT:"),
    );
    expect(view.queryByTestId("native-acceptance-disabled")).not.toBeOnTheScreen();
  });

  it("does not expose a success label when the runtime rejects or substitutes the case receipt", async () => {
    mockReadV12NativeAcceptanceReceipt.mockRejectedValueOnce(new Error("v12_native_acceptance_receipt_invalid"));
    const view = await render(<NativeAcceptanceRoute />);

    await waitFor(() => expect(view.getByTestId("native-acceptance-error")).toHaveTextContent("Receipt read failed"));
    expect(view.queryByTestId("native-acceptance-readback")).not.toBeOnTheScreen();
    expect(mockExecuteV12NativeAcceptanceCase).not.toHaveBeenCalled();
  });

  it("keeps every Maestro shard on product controls and opens this route only for read-only receipts", () => {
    for (const sourcePath of [
      "maestro/v1.2/multi-plan.yaml",
      "maestro/v1.2/workout.yaml",
      "maestro/v1.2/library-running.yaml",
    ]) {
      const source = readFileSync(sourcePath, "utf8");
      const productAction = source.indexOf('tapOn: { id: "${V12_PRODUCT_ACTION_ID}" }');
      const receiptRoute = source.indexOf("/native-acceptance/");
      expect(source).toContain('openLink: "${V12_PRODUCT_URL}"');
      expect(source).toContain('id: "${V12_PRODUCT_READY_ID}"');
      expect(source).toContain('id: "${V12_PRODUCT_RESULT_ID}"');
      expect(source).toContain("mode=receipt");
      expect(productAction).toBeGreaterThan(-1);
      expect(receiptRoute).toBeGreaterThan(productAction);
      expect(source).not.toContain("native-acceptance-execute");
      expect(source).not.toContain("Native acceptance fixture");
    }
    const layout = readFileSync("app/_layout.tsx", "utf8");
    expect(layout).toContain("V12NativeAcceptanceProductGate");
    expect(layout).toContain("createStrictIsolatedWorkoutRuntimeDependencies");
  });

  it("prepares isolated state before rendering the real product route without executing the action", async () => {
    const request = resolveV12NativeAcceptanceProductRequest({
      packageName: "com.fchoo.gymtracker.devtest",
      buildProfile: "development-test",
      nativeContractsEnabled: true,
      suite: "v1.2-acceptance",
    }, {
      shard: "workout",
      case: "workout.complete-commit",
      fixture: "v12-synthetic-fixtures-r18",
      nonce: "b".repeat(48),
      mode: "product",
    });
    expect(request).not.toBeNull();
    let finishPreparation: (() => void) | undefined;
    const prepareProductCase = jest.fn(() => new Promise<void>((resolve) => {
      finishPreparation = resolve;
    }));
    const view = await render(
      <V12NativeAcceptanceProductGate
        executeProductAction={jest.fn(async () => undefined)}
        prepareProductCase={prepareProductCase}
        request={request!}
      >
        <Text testID="real-product-route">Workout</Text>
      </V12NativeAcceptanceProductGate>,
    );

    expect(view.getByTestId("native-acceptance-product-preparing")).toBeOnTheScreen();
    await act(async () => { finishPreparation?.(); });
    await waitFor(() => expect(view.getByTestId("real-product-route")).toBeOnTheScreen());
    expect(prepareProductCase).toHaveBeenCalledWith(request);
    expect(mockExecuteV12NativeAcceptanceCase).not.toHaveBeenCalled();
  });

  const invalidRequests: readonly (readonly [string, Readonly<Partial<{
    enabled: boolean;
    buildProfile: string;
    packageName: string;
    suite: string;
    shard: string;
    caseId: string;
    fixture: string;
    nonce: string;
    mode: string;
  }>>])[] = [
    ["disabled", { enabled: false }],
    ["production build", { buildProfile: "production" }],
    ["wrong package", { packageName: "com.fchoo.gymtracker" }],
    ["wrong suite", { suite: "phase17" }],
    ["unknown shard", { shard: "unknown" }],
    ["unknown case", { caseId: "workout.not-real" }],
    ["wrong fixture", { fixture: "production" }],
    ["missing nonce", { nonce: "" }],
    ["missing receipt mode", { mode: "" }],
  ];

  it.each(invalidRequests)("fails closed for %s", async (_label, overrides) => {
    mockNativeContractsEnabled = overrides.enabled ?? true;
    mockBuildProfile = overrides.buildProfile ?? "development-test";
    mockNativeContractSuite = overrides.suite ?? "v1.2-acceptance";
    mockParams = {
      shard: overrides.shard ?? "workout",
      case: overrides.caseId ?? "workout.root-identity",
      fixture: overrides.fixture ?? "v12-synthetic-fixtures-r18",
      nonce: overrides.nonce ?? "a".repeat(48),
      mode: overrides.mode ?? "receipt",
    };
    mockPackageName = overrides.packageName ?? "com.fchoo.gymtracker.devtest";

    const view = await render(<NativeAcceptanceRoute />);

    expect(view.getByTestId("native-acceptance-disabled")).toBeOnTheScreen();
    expect(view.getByRole("header", { name: "Native acceptance unavailable" }))
      .toBeOnTheScreen();
    expect(view.queryByTestId("native-acceptance-stage")).not.toBeOnTheScreen();
  });
});

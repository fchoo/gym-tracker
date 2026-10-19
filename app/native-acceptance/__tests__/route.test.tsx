import { act, fireEvent, render } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import React from "react";

import type {
  V12NativeAcceptanceReadbacks,
  V12NativeAcceptanceRequest,
} from "../../../src/testing/v12NativeAcceptanceExecutor";
import { v12NativeAcceptanceCaseContract } from "../../../src/testing/contracts/phase15Workout.contract";

let mockBuildProfile = "development-test";
let mockNativeContractsEnabled = true;
let mockNativeContractSuite = "v1.2-acceptance";
let mockPackageName = "com.fchoo.gymtracker.devtest";
let mockParams: Record<string, string> = {};
const mockExecuteV12NativeAcceptanceCase = jest.fn<(
  request: V12NativeAcceptanceRequest,
) => Promise<V12NativeAcceptanceReadbacks>>();

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
    };
    mockExecuteV12NativeAcceptanceCase.mockReset();
    mockExecuteV12NativeAcceptanceCase.mockImplementation(async (request) => {
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

  it.each(validRequests)("renders the source-owned %s fixture and native marker", async (shard, caseId, title) => {
    mockParams = { shard, case: caseId, fixture: "v12-synthetic-fixtures-r18", nonce: "a".repeat(48) };

    const view = await render(<NativeAcceptanceRoute />);

    expect(view.getByRole("header", { name: "Native acceptance fixture" }))
      .toBeOnTheScreen();
    expect(view.getByTestId("native-acceptance-stage")).toBeOnTheScreen();
    expect(view.getByText(caseId)).toBeOnTheScreen();
    expect(view.getByText(title)).toBeOnTheScreen();
    expect(view.queryByTestId("native-acceptance-readback")).not.toBeOnTheScreen();
    await act(async () => { fireEvent.press(view.getByTestId("native-acceptance-execute")); });
    expect(view.getByTestId("native-acceptance-readback")).toHaveTextContent("Case verified");
    expect(view.getByTestId("native-acceptance-readback")).toHaveProp(
      "accessibilityLabel", expect.stringContaining(`V12_UI_READBACK:`),
    );
    expect(mockExecuteV12NativeAcceptanceCase).toHaveBeenCalledWith(expect.objectContaining({ shard, caseId, nonce: "a".repeat(48) }));
    expect(view.getByTestId("native-acceptance-source-receipt")).toHaveProp(
      "accessibilityLabel", expect.stringContaining("V12_SOURCE_RECEIPT:"),
    );
    expect(view.queryByTestId("native-acceptance-disabled")).not.toBeOnTheScreen();
  });

  it("does not expose a success label when the runtime rejects or substitutes the case receipt", async () => {
    mockExecuteV12NativeAcceptanceCase.mockRejectedValueOnce(new Error("v12_native_acceptance_receipt_invalid"));
    const view = await render(<NativeAcceptanceRoute />);

    await act(async () => { fireEvent.press(view.getByTestId("native-acceptance-execute")); });

    expect(view.queryByTestId("native-acceptance-readback")).not.toBeOnTheScreen();
    expect(view.getByTestId("native-acceptance-error")).toHaveTextContent("Case execution failed");
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
  }>>])[] = [
    ["disabled", { enabled: false }],
    ["production build", { buildProfile: "production" }],
    ["wrong package", { packageName: "com.fchoo.gymtracker" }],
    ["wrong suite", { suite: "phase17" }],
    ["unknown shard", { shard: "unknown" }],
    ["unknown case", { caseId: "workout.not-real" }],
    ["wrong fixture", { fixture: "production" }],
    ["missing nonce", { nonce: "" }],
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
    };
    mockPackageName = overrides.packageName ?? "com.fchoo.gymtracker.devtest";

    const view = await render(<NativeAcceptanceRoute />);

    expect(view.getByTestId("native-acceptance-disabled")).toBeOnTheScreen();
    expect(view.getByRole("header", { name: "Native acceptance unavailable" }))
      .toBeOnTheScreen();
    expect(view.queryByTestId("native-acceptance-stage")).not.toBeOnTheScreen();
  });
});

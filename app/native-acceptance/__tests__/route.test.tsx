import { readFileSync } from "node:fs";

import { act, render, waitFor } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import React from "react";
import { Text } from "react-native";

import type {
  V12NativeAcceptancePreparedProductCase,
  V12NativeAcceptanceReadbacks,
  V12NativeAcceptanceRequest,
} from "../../../src/testing/v12NativeAcceptanceExecutor";
import { v12NativeAcceptanceCaseContract } from "../../../src/testing/contracts/phase15Workout.contract";
import {
  resolveV12NativeAcceptanceProductRequest,
  V12NativeAcceptanceProductGate,
  useV12NativeAcceptanceRouteNonce,
  V12NativeAcceptanceRouteObserver,
} from "../../../src/testing/v12NativeAcceptanceFixture";

let mockBuildProfile = "development-test";
let mockNativeContractsEnabled = true;
let mockNativeContractSuite = "v1.2-acceptance";
let mockPackageName = "com.fchoo.gymtracker.devtest";
let mockParams: Record<string, string> = {};
let mockPathname = "/";
const mockReadV12NativeAcceptanceReceipt = jest.fn<(
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
    Redirect: () => null,
    useLocalSearchParams: () => mockParams,
    usePathname: () => mockPathname,
  };
});

const routeObservationIdentity = {
  packageName: "com.fchoo.gymtracker.devtest",
  buildProfile: "development-test",
  nativeContractsEnabled: true,
  suite: "v1.2-acceptance",
};

function RouteObservationHarness({ identity = routeObservationIdentity, params = {}, request = null }: Readonly<{
  identity?: typeof routeObservationIdentity;
  params?: Readonly<Record<string, unknown>>;
  request?: V12NativeAcceptanceRequest | null;
}>) {
  const binding = useV12NativeAcceptanceRouteNonce(identity, params, request);
  return <>
    <Text testID="ordinary-product-content">Ordinary product content</Text>
    <V12NativeAcceptanceRouteObserver identity={identity} binding={binding} />
  </>;
}

describe("actual normal route observations", () => {
  let lines: string[];
  beforeEach(() => {
    mockPathname = "/";
    lines = [];
    jest.spyOn(console, "info").mockImplementation((line) => { lines.push(String(line)); });
  });
  afterEach(() => { jest.restoreAllMocks(); });

  it("retains the validated nonce when normal navigation drops query parameters and adds no UI", async () => {
    const original = await render(<Text testID="ordinary-product-content">Ordinary product content</Text>);
    const originalTree = original.toJSON();
    await original.unmount();
    const view = await render(<RouteObservationHarness params={{ closeoutRouteNonce: "a".repeat(32), password: "do-not-retain" }} />);
    expect(view.toJSON()).toEqual(originalTree);
    mockPathname = "/session/owned-session/correct";
    await view.rerender(<RouteObservationHarness />);
    const records = lines.map(line => JSON.parse(line.slice("GYM_TRACKER_V12_NORMAL_ROUTE_OBSERVATION:".length)));
    expect(records.map(row => ({ nonce: row.nonce, pathname: row.pathname, nonce_kind: row.nonce_kind }))).toEqual([
      { nonce: "a".repeat(32), pathname: "/", nonce_kind: "normal" },
      { nonce: "a".repeat(32), pathname: "/session/owned-session/correct", nonce_kind: "normal" },
    ]);
    expect(records[1].sequence).toBeGreaterThan(records[0].sequence);
    expect(lines.join("\n")).not.toMatch(/password|do-not-retain|closeoutRouteNonce|\?/u);
  });

  it("preserves an actually observed index pathname rather than inventing slash", async () => {
    mockPathname = "/index";
    await render(<RouteObservationHarness params={{ closeoutRouteNonce: "a".repeat(32) }} />);
    expect(JSON.parse(lines[0].slice("GYM_TRACKER_V12_NORMAL_ROUTE_OBSERVATION:".length)).pathname).toBe("/index");
  });

  it.each(["/more/removed-sessions", "/more/manual-encrypted-backup", "/more/data-and-recovery", "/session/owned-session", "/completion/owned-session"])(
    "emits the actual allowed normal pathname: %s", async pathname => {
      mockPathname = pathname;
      await render(<RouteObservationHarness params={{ closeoutRouteNonce: "a".repeat(32) }} />);
      expect(JSON.parse(lines[0].slice("GYM_TRACKER_V12_NORMAL_ROUTE_OBSERVATION:".length)))
        .toMatchObject({ pathname, nonce: "a".repeat(32), nonce_kind: "normal" });
    },
  );

  it.each([
    ["production package", { packageName: "com.fchoo.gymtracker" }],
    ["production profile", { buildProfile: "production" }],
    ["disabled native contracts", { nativeContractsEnabled: false }],
    ["different suite", { suite: "phase14" }],
  ])("never emits when the actual identity has %s", async (_label, overrides) => {
    await render(<RouteObservationHarness identity={{ ...routeObservationIdentity, ...overrides }} params={{ closeoutRouteNonce: "a".repeat(32) }} />);
    expect(lines).toEqual([]);
  });

  it("clears the retained nonce when native contracts are disabled before re-enabling", async () => {
    const view = await render(<RouteObservationHarness params={{ closeoutRouteNonce: "a".repeat(32) }} />);
    lines.length = 0;
    mockPathname = "/session/owned-session";
    await view.rerender(<RouteObservationHarness identity={{ ...routeObservationIdentity, nativeContractsEnabled: false }} />);
    mockPathname = "/completion/owned-session";
    await view.rerender(<RouteObservationHarness />);
    expect(lines).toEqual([]);
  });

  it.each(["A".repeat(32), "a".repeat(31), "a".repeat(48), ["a".repeat(32)], null])(
    "clears a retained binding when an explicit normal nonce is malformed: %p", async nonce => {
      const view = await render(<RouteObservationHarness params={{ closeoutRouteNonce: "a".repeat(32) }} />);
      lines.length = 0;
      mockPathname = "/more/removed-sessions";
      await view.rerender(<RouteObservationHarness params={{ closeoutRouteNonce: nonce }} />);
      mockPathname = "/more/data-and-recovery";
      await view.rerender(<RouteObservationHarness />);
      expect(lines).toEqual([]);
    },
  );

  it.each(["/__phase20-visual-probe", "/native-acceptance/workout", "/more/garmin", "/garmin/private-account", "/library", "/session/x?token=private", "/session/__private", "/workout/owned-session"])(
    "does not log a forbidden or unrelated pathname: %s", async pathname => {
      mockPathname = pathname;
      await render(<RouteObservationHarness params={{ closeoutRouteNonce: "a".repeat(32) }} />);
      expect(lines).toEqual([]);
    },
  );

  it("uses a real validated functional request's 48-hex nonce only on workout paths", async () => {
    const params = { shard: "workout", case: "workout.complete-commit", fixture: "v12-synthetic-fixtures-r18", nonce: "b".repeat(48), mode: "product" };
    const request = resolveV12NativeAcceptanceProductRequest(routeObservationIdentity, params);
    expect(request).not.toBeNull();
    mockPathname = "/workout/owned-session";
    const view = await render(<RouteObservationHarness params={params} request={request} />);
    const record = JSON.parse(lines[0].slice("GYM_TRACKER_V12_NORMAL_ROUTE_OBSERVATION:".length));
    expect(record).toMatchObject({ nonce: "b".repeat(48), nonce_kind: "functional", pathname: "/workout/owned-session" });
    lines.length = 0;
    mockPathname = "/session/owned-session";
    await view.rerender(<RouteObservationHarness />);
    expect(lines).toEqual([]);
  });

  it("does not accept an arbitrary functional nonce without the validated request", async () => {
    mockPathname = "/workout/owned-session";
    await render(<RouteObservationHarness params={{ nonce: "b".repeat(48) }} />);
    expect(lines).toEqual([]);
  });

  it("does not change product rendering when observation logging fails", async () => {
    jest.spyOn(console, "info").mockImplementation(() => { throw new Error("logger unavailable"); });
    const view = await render(<RouteObservationHarness params={{ closeoutRouteNonce: "a".repeat(32) }} />);
    expect(view.getByTestId("ordinary-product-content")).toBeOnTheScreen();
  });
});

jest.mock("../../../src/bootstrap/workoutAppRuntime", () => ({
  useWorkoutAppRuntime: () => ({
    launchState: "trusted",
    readV12NativeAcceptanceReceipt: mockReadV12NativeAcceptanceReceipt,
  }),
}));

import NativeAcceptanceRoute from "../[shard]";

describe("v1.2 native acceptance route", () => {
  beforeEach(() => {
    mockBuildProfile = "development-test";
    mockNativeContractsEnabled = true;
    mockNativeContractSuite = "v1.2-acceptance";
    mockPackageName = "com.fchoo.gymtracker.devtest";
    mockPathname = "/";
    mockParams = {
      shard: "multi-plan",
      case: "phase13-migration-failure-cuts",
      fixture: "v12-synthetic-fixtures-r18",
      nonce: "a".repeat(48),
      mode: "receipt",
    };
    mockReadV12NativeAcceptanceReceipt.mockReset();
    mockReadV12NativeAcceptanceReceipt.mockImplementation(async (request) => {
      const contract = v12NativeAcceptanceCaseContract(request.shard, request.caseId);
      const domainObservation = request.shard === "multi-plan";
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
        command_outcome: contract.operation.kind === "repository-mutation"
          ? domainObservation ? "already_committed" : "committed"
          : null,
        committed_effects: contract.operation.kind === "repository-mutation" && !domainObservation ? 1 : 0,
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

  it.each(validRequests)("renders the source-owned %s receipt after product interaction", async (shard, caseId, title) => {
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
  });

  it("keeps every Maestro shard on product controls and opens this route only for read-only receipts", () => {
    for (const sourcePath of [
      "maestro/v1.2/multi-plan.yaml",
      "maestro/v1.2/workout.yaml",
      "maestro/v1.2/library-running.yaml",
    ]) {
      const source = readFileSync(sourcePath, "utf8");
      const receiptRoute = source.indexOf("/native-acceptance/");
      expect(source).toContain('openLink: "${V12_PRODUCT_URL}"');
      expect(source).toContain("V12_PRODUCT_READY_KIND");
      expect(source).toContain("V12_PRODUCT_READY_VALUE");
      expect(source).toContain("V12_PRODUCT_RESULT_KIND");
      expect(source).toContain("V12_PRODUCT_RESULT_VALUE");
      expect(source).toContain("mode=receipt");
      if (sourcePath.endsWith("multi-plan.yaml")) {
        expect(source).toContain("V12_PRODUCT_INTERACTION == 'domain-observation'");
        expect(source).toContain("V12_PRODUCT_ACTION_KIND == 'none'");
        expect(source).not.toContain('tapOn: { id: "${V12_PRODUCT_ACTION_VALUE}" }');
      } else {
        const productAction = source.indexOf('tapOn: { id: "${V12_PRODUCT_ACTION_VALUE}" }');
        expect(productAction).toBeGreaterThan(-1);
        expect(receiptRoute).toBeGreaterThan(productAction);
      }
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
    let finishPreparation: ((value: V12NativeAcceptancePreparedProductCase) => void) | undefined;
    const prepareProductCase = jest.fn(() => new Promise<V12NativeAcceptancePreparedProductCase>((resolve) => {
      finishPreparation = resolve;
    }));
    const view = await render(
      <V12NativeAcceptanceProductGate
        prepareProductCase={prepareProductCase}
        request={request!}
      >
        <Text testID="real-product-route">Workout</Text>
      </V12NativeAcceptanceProductGate>,
    );

    expect(view.getByTestId("native-acceptance-product-preparing")).toBeOnTheScreen();
    await act(async () => { finishPreparation?.({
      schema_version: 1,
      operation_id: "workout:workout.complete-commit:complete-commit",
      action_request_sha256: "a".repeat(64),
      pre: {
        probe_id: "workout.complete-commit:pre:session_sets",
        facts_sha256: "b".repeat(64),
        source_sha256: "c".repeat(64),
        row_count: 1,
        table_count: 1,
        schema_version: 42,
      },
      prepared_product_path: null,
    }); });
    await waitFor(() => expect(view.getByTestId("real-product-route")).toBeOnTheScreen());
    expect(prepareProductCase).toHaveBeenCalledWith(request);
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

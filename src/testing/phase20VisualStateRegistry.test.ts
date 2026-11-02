import { describe, expect, it } from "@jest/globals";
import { PHASE20_NATIVE_ONLY_VISUAL_STATES, PHASE20_VISUAL_STATE_REGISTRY } from "./phase20VisualStateRegistry.generated";
import { PHASE20_VISUAL_CONFIGURATIONS, phase20VisualConfiguration, phase20VisualState, validatePhase20VisualStateRegistry } from "./phase20VisualStateRegistry";

describe("Phase 20 visual state registry", () => {
  it("locks every serial-walk occurrence and every required configuration", () => {
    validatePhase20VisualStateRegistry();
    expect(PHASE20_VISUAL_STATE_REGISTRY).toHaveLength(107);
    expect(PHASE20_VISUAL_CONFIGURATIONS).toHaveLength(64);
    expect(phase20VisualState("BW-001")?.name).toBe("appearance");
    expect(phase20VisualState("BW-107")?.name).toBe("garmin-revoked");
  });

  it("uses retained bytes only where both approved screenshots actually exist", () => {
    const references = PHASE20_VISUAL_STATE_REGISTRY.map((state) => state.reference.kind);
    expect(references).toContain("retained_png");
    expect(references).toContain("approved_source");
    expect(PHASE20_VISUAL_STATE_REGISTRY.every((state) => Boolean(state.component) && Boolean(state.expected_visible_semantics.length))).toBe(true);
  });

  it("binds every state to a production route, fixture scenario, readiness contract and focus target", () => {
    expect(PHASE20_VISUAL_STATE_REGISTRY.every((state) =>
      !state.route.startsWith("/__")
      && state.fixture_seed.length > 0
      && state.scenario === state.name
      && Array.isArray(state.scenario_steps)
      && state.readiness.screen_test_id.length > 0
      && state.readiness.test_id.length > 0
      && state.readiness.semantics.length > 0
      && state.focus_target.length > 0,
    )).toBe(true);
  });

  it("marks only Garmin browser states as visual-only acceptance fixtures", () => {
    const garmin = PHASE20_VISUAL_STATE_REGISTRY.filter(({ id }) => Number(id.slice(3)) >= 92);
    const product = PHASE20_VISUAL_STATE_REGISTRY.filter(({ id }) => Number(id.slice(3)) < 92);
    expect(garmin).toHaveLength(16);
    expect(garmin.every(({ evidence_scope }) => evidence_scope === "visual_only")).toBe(true);
    expect(garmin.map(({ name }) => name)).toEqual([
      "garmin-disconnected", "garmin-consent", "garmin-connected", "garmin-syncing",
      "garmin-synced", "garmin-idempotent", "garmin-error", "garmin-file-import",
      "garmin-outdoor", "garmin-match-outdoor", "garmin-confirmed-outdoor",
      "garmin-file-import", "garmin-treadmill", "garmin-match-treadmill",
      "garmin-confirmed-treadmill", "garmin-revoked",
    ]);
    expect(PHASE20_NATIVE_ONLY_VISUAL_STATES.map(({ id }) => id)).toEqual([
      "NV-GARMIN-LOGIN", "NV-GARMIN-MFA", "NV-GARMIN-SESSION-EXPIRED",
    ]);
    expect(product.every(({ evidence_scope }) => evidence_scope === "production_screen")).toBe(true);
  });

  it("keeps each Garmin browser occurrence and native-only state independently actionable", () => {
    const expected = [
      ["BW-092", "garmin-disconnected", "Connect Garmin"],
      ["BW-093", "garmin-consent", "Continue"],
      ["BW-094", "garmin-connected", "Sync now"],
      ["BW-095", "garmin-syncing", "Syncing Garmin activities"],
      ["BW-096", "garmin-synced", "Sync now"],
      ["BW-097", "garmin-idempotent", "Sync now"],
      ["BW-098", "garmin-error", "Retry Garmin sync"],
      ["BW-100", "garmin-outdoor", "Match to scheduled workout"],
      ["BW-101", "garmin-match-outdoor", "Confirm match"],
      ["BW-102", "garmin-confirmed-outdoor", "Matched"],
      ["BW-104", "garmin-treadmill", "Match to scheduled workout"],
      ["BW-105", "garmin-match-treadmill", "Confirm match"],
      ["BW-106", "garmin-confirmed-treadmill", "Matched"],
      ["BW-107", "garmin-revoked", "Connect Garmin"],
    ] as const;
    for (const [id, name, action] of expected) {
      const state = phase20VisualState(id);
      expect(state?.name).toBe(name);
      expect([
        ...(state?.readiness.semantics ?? []),
        ...(state?.readiness.actions.map(({ label }) => label ?? "") ?? []),
      ].some((value) => value.includes(action))).toBe(true);
    }
    for (const id of ["BW-099", "BW-103"]) {
      const state = phase20VisualState(id)!;
      expect(state.name).toBe("garmin-file-import");
      expect(state.readiness.alignment_gaps).toContain("Current production Garmin root has no FIT chooser or preview callbacks. This retained browser state has no production equivalent.");
      expect(state.readiness.actions.some(({ label }) => /Preview.*FIT/u.test(label ?? ""))).toBe(false);
    }
    expect(PHASE20_NATIVE_ONLY_VISUAL_STATES.map(({ name, action }) => `${name}:${action}`)).toEqual([
      "garmin-login:Connect Garmin", "garmin-mfa:Continue", "garmin-session-expired:Sign in again",
    ]);
  });

  it("uses exact portrait and corresponding landscape dimensions", () => {
    expect(phase20VisualConfiguration("AP-L-C360-P-F100")).toMatchObject({ width: 360, height: 800 });
    expect(phase20VisualConfiguration("AP-L-C360-L-F100")).toMatchObject({ width: 800, height: 360 });
    expect(phase20VisualConfiguration("AP-D-C390-P-F200")).toMatchObject({ width: 390, height: 844 });
    expect(phase20VisualConfiguration("AP-D-C390-L-F200")).toMatchObject({ width: 844, height: 390 });
    expect(phase20VisualConfiguration("AP-SL-M600-P-F100")).toMatchObject({ width: 600, height: 960 });
    expect(phase20VisualConfiguration("AP-SD-M600-L-F100")).toMatchObject({ width: 960, height: 600 });
    expect(phase20VisualConfiguration("AP-L-X840-P-F100")).toMatchObject({ width: 840, height: 1080 });
    expect(phase20VisualConfiguration("AP-L-X840-L-F100")).toMatchObject({ width: 1080, height: 840 });
  });

  it("requires state-specific readiness evidence instead of generic booleans", () => {
    expect(PHASE20_VISUAL_STATE_REGISTRY.every(({ readiness }) =>
      readiness.semantics.length >= 2
      && readiness.test_ids.length >= 2
      && readiness.actions.length >= 1
      && readiness.order.length >= 2
      && readiness.non_color.length >= 1
      && readiness.focus.target.length > 0
      && readiness.source_receipt.assertions.length >= 1,
    )).toBe(true);
    expect(phase20VisualState("BW-089")?.readiness.status).toBe("loading");
    expect(phase20VisualState("BW-091")?.readiness.status).toBe("ready");
    expect(phase20VisualState("BW-086")?.fixture_variant).toBe("progress-settings-empty");
    expect(phase20VisualState("BW-088")?.fixture_variant).toBe("progress-settings-sparse");
    expect(phase20VisualState("BW-090")?.fixture_variant).toBe("progress-settings-loading");
  });

  it("expands to exactly 6,848 unique state and configuration pairs", () => {
    const pairs = PHASE20_VISUAL_STATE_REGISTRY.flatMap(({ id }) =>
      PHASE20_VISUAL_CONFIGURATIONS.map((configuration) => `${id}/${configuration}`),
    );
    expect(pairs).toHaveLength(6_848);
    expect(new Set(pairs).size).toBe(6_848);
  });
});

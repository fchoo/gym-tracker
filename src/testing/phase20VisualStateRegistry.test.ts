import { describe, expect, it } from "@jest/globals";
import { PHASE20_VISUAL_STATE_REGISTRY } from "./phase20VisualStateRegistry.generated";
import { PHASE20_VISUAL_CONFIGURATIONS, phase20VisualState, validatePhase20VisualStateRegistry } from "./phase20VisualStateRegistry";

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
    expect(product.every(({ evidence_scope }) => evidence_scope === "production_screen")).toBe(true);
  });

  it("expands to exactly 6,848 unique state and configuration pairs", () => {
    const pairs = PHASE20_VISUAL_STATE_REGISTRY.flatMap(({ id }) =>
      PHASE20_VISUAL_CONFIGURATIONS.map((configuration) => `${id}/${configuration}`),
    );
    expect(pairs).toHaveLength(6_848);
    expect(new Set(pairs).size).toBe(6_848);
  });
});

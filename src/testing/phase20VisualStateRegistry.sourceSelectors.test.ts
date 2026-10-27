import { fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { LibraryScreen, type LibraryBrowseSnapshot } from "../ui/screens/LibraryScreen";
import { AppearanceProvider } from "../ui/theme";
import { phase20VisualState } from "./phase20VisualStateRegistry";
import { PHASE20_VISUAL_STATE_REGISTRY } from "./phase20VisualStateRegistry.generated";

async function mountLibrary(section: "plans" | "exercises" = "plans") {
  const snapshot: LibraryBrowseSnapshot = {
    sectionPreference: { section, revision: 1 },
    plans: { active: null, owned: [{ id: "plan-1", name: "Full Body Foundation", daysPerWeek: 2, status: "Inactive" }], starters: [] },
  };
  const props: React.ComponentProps<typeof LibraryScreen> = {
    loadLibrary: async () => snapshot,
    listRecentExercises: async () => [],
    onCreateExercise: jest.fn(), onCreatePlan: jest.fn(), onOpenSettings: jest.fn(),
    onOpenExercise: jest.fn(), onOpenPlan: jest.fn(),
    settingsActionNativeID: "root-settings-trigger-library",
    searchExercises: async () => ({ state: "page", items: [], nextCursor: null }),
    setExerciseFavorite: async () => ({ exerciseId: "exercise-1", favorite: true, preferenceRevision: 1 }),
    setSection: async (next) => ({ section: next, revision: 2 }),
  };
  await render(React.createElement(AppearanceProvider, null, React.createElement(LibraryScreen, props)));
  await screen.findByRole("tab", { name: section === "plans" ? "Plans" : "Exercises", selected: true });
  return props;
}

function nodeForId(id: string) {
  if (id.startsWith("root-settings-trigger-")) {
    const node = screen.getByLabelText("Open App Settings");
    expect(node).toHaveProp("nativeID", id);
    return node;
  }
  if (id === "library-actions-trigger") {
    const node = screen.getByRole("button", { name: "Actions" });
    expect(node).toHaveProp("nativeID", id);
    return node;
  }
  return screen.getByTestId(id);
}

describe("Phase 20 registry selectors on current production Library", () => {
  it.each(["BW-034", "BW-057"])("resolves every %s production readiness identifier", async (id) => {
    await mountLibrary(id === "BW-057" ? "exercises" : "plans");
    const state = phase20VisualState(id)!;
    for (const testId of state.readiness.test_ids) {
      if (!testId.startsWith("phase20-visual-state-")) nodeForId(testId);
    }
    expect(screen.getByRole("tab", { name: "Plans" })).toBeOnTheScreen();
    expect(screen.getByRole("tab", { name: "Exercises" })).toBeOnTheScreen();
    expect(screen.getByLabelText(id === "BW-057" ? "Search exercises" : "Search plans")).toBeOnTheScreen();
  });

  it("opens the real Library actions and invokes its current single-line Create plan action", async () => {
    const props = await mountLibrary();
    const state = phase20VisualState("BW-036")!;
    for (const step of state.scenario_steps) {
      if (step.action === "tap_id") await fireEvent.press(nodeForId(step.value));
      else await fireEvent.press(screen.getByLabelText(step.value));
    }
    await screen.findByTestId(state.readiness.test_id);
    const create = state.readiness.actions.find((action) => action.label === "Create plan");
    expect(create).toBeDefined();
    await fireEvent.press(within(screen.getByTestId(state.readiness.test_id)).getByRole("button", { name: create!.label! }));
    await waitFor(() => expect(props.onCreatePlan).toHaveBeenCalledTimes(1));
  });

  it("opens the real plan filter sheet and applies through its declared Show results action", async () => {
    await mountLibrary();
    const state = phase20VisualState("BW-035")!;
    for (const step of state.scenario_steps) {
      if (step.action === "tap_id") await fireEvent.press(nodeForId(step.value));
      else await fireEvent.press(screen.getByLabelText(step.value));
    }
    await screen.findByTestId(state.readiness.test_id);
    expect(state.readiness.actions.some((action) => action.label === "Show results")).toBe(true);
    await fireEvent.press(screen.getByRole("button", { name: "Show results" }));
    await waitFor(() => expect(screen.queryByTestId(state.readiness.test_id)).toBeNull());
  });

  it("keeps unavailable Library import outside actionable readiness and verifies the actual disabled control", async () => {
    const props = await mountLibrary();
    await fireEvent.press(nodeForId("library-actions-trigger"));
    const state = phase20VisualState("BW-036")!;
    const scope = within(screen.getByTestId(state.readiness.test_id));
    const label = "Import plan, unavailable, Later";
    expect(scope.getByRole("button", { name: label })).toBeDisabled();
    expect(state.readiness.actions.some((action) => String(action.label) === label)).toBe(false);
    expect(state.readiness.unavailable_controls).toContainEqual(expect.objectContaining({ label, enabled: false }));
    await fireEvent.press(scope.getByRole("button", { name: label }));
    expect(props.onCreatePlan).not.toHaveBeenCalled();
    expect(props.onCreateExercise).not.toHaveBeenCalled();
  });

  it("preserves all approved state identities and references while projecting consistent native metadata", () => {
    const original = JSON.parse(execFileSync("git", ["show", "48e8a3156280b267d33cd6f719166e9ae22cc66a:src/testing/phase20VisualStateRegistry.json"], { encoding: "utf8" }));
    const json = JSON.parse(readFileSync("src/testing/phase20VisualStateRegistry.json", "utf8"));
    expect(json).toEqual(PHASE20_VISUAL_STATE_REGISTRY);
    const keys = ["id", "name", "route", "component", "route_params", "fixture_id", "fixture_seed", "scenario", "fixture_variant", "fixture_facts", "interactions", "expected_visible_semantics", "evidence_scope", "reference"];
    const identities = (states: readonly Record<string, unknown>[]) => states.map((state) => Object.fromEntries(keys.map((key) => [key, state[key]])));
    expect(identities(json)).toEqual(identities(original));
    expect(json).toHaveLength(107);
    for (const state of json) {
      expect(state.readiness.test_ids.some((id: string) => /^(?:lib-|ldr-|pv2-|root-day-)/u.test(id))).toBe(false);
      expect(state.readiness.source_receipt.assertions).toEqual([`state:${state.name}`, `fixture:${state.fixture_variant}`, "theme:light"]);
    }
  });

  it("reproduces the registry-only projection without rewriting the native flow", () => {
    const paths = ["src/testing/phase20VisualStateRegistry.json", "src/testing/phase20VisualStateRegistry.generated.ts", "maestro/v1.2/visual-production-states.yaml"];
    const before = paths.map((path) => readFileSync(path, "utf8"));
    execFileSync("/Users/bytedance/.nvm/versions/node/v24.19.0/bin/node", ["scripts/generate-phase20-visual-state-registry.mjs", "--registry-only"], { encoding: "utf8" });
    expect(paths.map((path) => readFileSync(path, "utf8"))).toEqual(before);
  });

  it("uses the production target callback and records the unsupported FIT and day-preview bindings explicitly", () => {
    for (const id of ["BW-078", "BW-080", "BW-082"]) {
      const state = phase20VisualState(id)!;
      expect(state.scenario_steps.at(-1)?.value).toMatch(/^Edit target for /u);
      expect(state.readiness.actions.some((action) => String(action.label) === "Current benchmark")).toBe(false);
      expect(state.readiness.unavailable_controls).toContainEqual(expect.objectContaining({ label: "Current benchmark", editable: false }));
    }
    for (const id of ["BW-099", "BW-103"]) {
      expect(phase20VisualState(id)?.readiness.alignment_gaps.length).toBeGreaterThan(0);
    }
    for (const id of ["BW-003", "BW-004", "BW-005", "BW-006", "BW-007"]) {
      const state = phase20VisualState(id)!;
      expect(state.scenario_steps).toEqual([]);
      expect(state.readiness.alignment_gaps).toEqual([]);
      expect(state.readiness.actions.some(({ id }) => id === "today-start-workout")).toBe(true);
    }
  });
});

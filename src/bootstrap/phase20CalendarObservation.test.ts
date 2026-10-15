import { describe, expect, it } from "@jest/globals";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  PHASE20_CALENDAR_STAGE_GROUPS,
  PHASE20_CALENDAR_STAGE_IDS,
  PHASE20_CALENDAR_RESULT_MARKER,
  createPhase20CalendarObservationCollector,
  phase20CalendarRequestFromNativeContract,
} from "./phase20CalendarObservation";

const HASH = "a".repeat(64);
const NONCE = "b".repeat(32);
const identity = Object.freeze({
  packageName: "com.fchoo.gymtracker.devtest",
  buildProfile: "development-test",
  nativeContractsEnabled: true,
  suite: "v1.2-acceptance",
});

function request(stage: (typeof PHASE20_CALENDAR_STAGE_IDS)[number]) {
  return phase20CalendarRequestFromNativeContract({
    ...identity,
    stage,
    nonce: NONCE,
    flowSha256: HASH,
    flowRevision: "calendar-flow-r35-real-v1",
  })!;
}

function clock() {
  let value = 12_345.125;
  return () => {
    value += 0.375;
    return value;
  };
}

function pointerCollector(stage: (typeof PHASE20_CALENDAR_STAGE_IDS)[number], emitted: string[]) {
  return createPhase20CalendarObservationCollector({
    request: request(stage),
    now: clock(),
    sha256: async (value) => createHash("sha256").update(value).digest("hex"),
    emitLine: (line) => emitted.push(line),
  });
}

const transition = (phase: "idle" | "dragging" | "settling", titlePanel: "current" | "next" = "current") => ({
  currentMonthId: titlePanel === "next" && phase !== "dragging" ? "2026-11" : "2026-10",
  selectedCivilDate: titlePanel === "next" && phase !== "dragging" ? "2026-11-15" : "2026-10-15",
  mode: "month" as const,
  phase,
  titlePanel,
  dragDxDp: phase === "dragging" ? -88.5 : 0,
  epoch: phase === "idle" ? 0 : 1,
  reducedMotion: false,
});

describe("Phase 20 real Calendar observation collector", () => {
  it("accepts only the exact development-test v1.2 route identity and all 35 canonical stages", () => {
    expect(PHASE20_CALENDAR_STAGE_IDS).toHaveLength(35);
    expect(PHASE20_CALENDAR_STAGE_IDS).toEqual([
      "drag-forward-10", "drag-forward-24_9", "drag-forward-25", "drag-forward-25_1",
      "drag-forward-release-below", "drag-forward-release-exact", "drag-forward-release-above",
      "drag-backward-10", "drag-backward-24_9", "drag-backward-25", "drag-backward-25_1",
      "drag-backward-release-below", "drag-backward-release-exact", "drag-backward-release-above",
      "drag-fast-subthreshold", "drag-retreat", "drag-cancel", "drag-vertical", "drag-diagonal",
      "second-input-interrupt", "week-expand-first-row", "week-expand-middle-row", "week-expand-last-row",
      "adjacent-week", "month-year-boundary", "leap-february", "four-row-month", "five-row-month", "six-row-month",
      "rapid-reverse-input", "rotation-during-transition", "background-during-transition", "reduced-motion",
      "dev-01-padding", "dev-02-light-title",
    ]);
    expect(Object.values(PHASE20_CALENDAR_STAGE_GROUPS).flat()).toEqual(PHASE20_CALENDAR_STAGE_IDS);
    expect(request("drag-forward-25")).toEqual({
      stage: "drag-forward-25",
      nonce: NONCE,
      flowSha256: HASH,
      flowRevision: "calendar-flow-r35-real-v1",
    });
    for (const changed of [
      { packageName: "com.fchoo.gymtracker" },
      { buildProfile: "production" },
      { nativeContractsEnabled: false },
      { suite: "phase16-calendar" },
      { nonce: "short" },
      { flowSha256: "bad" },
      { flowRevision: "calendar-flow-r35" },
      { stage: "synthetic-stage" },
    ]) {
      expect(phase20CalendarRequestFromNativeContract({
        ...identity,
        stage: "drag-forward-25",
        nonce: NONCE,
        flowSha256: HASH,
        flowRevision: "calendar-flow-r35-real-v1",
        ...changed,
      })).toBeNull();
    }
  });

  it("emits one nonce-bound pointer terminal from actual callback and transition observations", async () => {
    const emitted: string[] = [];
    const collector = pointerCollector("drag-forward-release-exact", emitted)!;
    collector.recordViewport({ widthDp: 354, heightDp: 560, orientation: "portrait", layoutGeneration: 2 });
    collector.recordMotion({ reducedMotion: false });
    collector.recordSemantic({ title: "October 2026", currentMonthId: "2026-10", selectedCivilDate: "2026-10-15", focusedWeekStart: null, weekCount: 5, callbackGeneration: 2 });
    collector.recordPointer({ callback: "onTouchesDown", phase: "down", xDp: 300, yDp: 220, dxDp: 0, dyDp: 0, viewportWidthDp: 354, translationXDp: 0, intentOwner: "undetermined", callbackGeneration: 2 });
    collector.recordPointer({ callback: "onBegin", phase: "begin", xDp: 300, yDp: 220, dxDp: 0, dyDp: 0, viewportWidthDp: 354, translationXDp: 0, intentOwner: "horizontal", callbackGeneration: 3 });
    collector.recordPointer({ callback: "onChange", phase: "change", xDp: 211.5, yDp: 220, dxDp: -88.5, dyDp: 0, viewportWidthDp: 354, translationXDp: -88.5, intentOwner: "horizontal", callbackGeneration: 3 });
    collector.recordTransition({ trigger: "drag", before: transition("idle"), after: transition("dragging", "next"), commandKinds: [] });
    collector.recordPointer({ callback: "onEnd", phase: "release", xDp: 211.5, yDp: 220, dxDp: -88.5, dyDp: 0, viewportWidthDp: 354, translationXDp: -88.5, intentOwner: "horizontal", callbackGeneration: 3 });
    collector.recordPointer({ callback: "onFinalize", phase: "finalize-release", xDp: 211.5, yDp: 220, dxDp: -88.5, dyDp: 0, viewportWidthDp: 354, translationXDp: -88.5, intentOwner: "horizontal", callbackGeneration: 3 });
    collector.recordTransition({ trigger: "release", before: transition("dragging", "next"), after: transition("settling"), commandKinds: ["settle-month"] });
    collector.recordCallback({ callback: "month-settle", epoch: 1, callbackGeneration: 3 });
    collector.recordTransition({ trigger: "settle-complete", before: transition("settling"), after: { ...transition("idle"), currentMonthId: "2026-11", selectedCivilDate: "2026-11-15", epoch: 1 }, commandKinds: [] });
    collector.recordSemantic({ title: "November 2026", currentMonthId: "2026-11", selectedCivilDate: "2026-11-15", focusedWeekStart: null, weekCount: 6, callbackGeneration: 3 });
    await collector.flush();

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatch(/^GYM_TRACKER_V12_DOMAIN_RESULT:/u);
    const terminal = JSON.parse(emitted[0]!.slice(PHASE20_CALENDAR_RESULT_MARKER.length));
    expect(terminal).toMatchObject({
      schema_version: 1,
      nonce: NONCE,
      kind: "calendar",
      flow_sha256: HASH,
      flow_revision: "calendar-flow-r35-real-v1",
      stage: { id: "drag-forward-release-exact", group: "pointer", schema_version: 1 },
    });
    expect(terminal.stage.pointer_events.map((event: { callback: string }) => event.callback)).toEqual([
      "onTouchesDown", "onBegin", "onChange", "onEnd", "onFinalize",
    ]);
    expect(terminal.stage.observation_digest_sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(terminal)).not.toMatch(/synthetic|expected|\bPASS\b|\bstatus\b/u);
    expect(terminal.stage.pointer_events.some((event: { observed_at_monotonic_ms: number }) => !Number.isInteger(event.observed_at_monotonic_ms))).toBe(true);
    const hostContract = pathToFileURL(path.resolve("scripts/v12-calendar-observation-contract.mjs")).href;
    expect(execFileSync(process.execPath, [
      "--input-type=module",
      "--eval",
      `import {validateV12CalendarTerminalMarker} from ${JSON.stringify(hostContract)}; const marker=JSON.parse(process.argv[1]); validateV12CalendarTerminalMarker(marker,{nonce:marker.nonce,flowSha256:marker.flow_sha256,stageId:marker.stage.id}); process.stdout.write("valid");`,
      JSON.stringify(terminal),
    ], { encoding: "utf8" })).toBe("valid");

    collector.recordSemantic({ title: "November 2026", currentMonthId: "2026-11", selectedCivilDate: "2026-11-15", focusedWeekStart: null, weekCount: 6, callbackGeneration: 4 });
    await collector.flush();
    expect(emitted).toHaveLength(1);
  });

  it("records a genuine cancelled gesture without manufacturing pointer-up", async () => {
    const emitted: string[] = [];
    const collector = pointerCollector("drag-cancel", emitted)!;
    collector.recordViewport({ widthDp: 354, heightDp: 560, orientation: "portrait", layoutGeneration: 4 });
    collector.recordMotion({ reducedMotion: false });
    collector.recordSemantic({ title: "October 2026", currentMonthId: "2026-10", selectedCivilDate: "2026-10-15", focusedWeekStart: null, weekCount: 5, callbackGeneration: 4 });
    collector.recordPointer({ callback: "onTouchesDown", phase: "down", xDp: 300, yDp: 220, dxDp: 0, dyDp: 0, viewportWidthDp: 354, translationXDp: 0, intentOwner: "undetermined", callbackGeneration: 4 });
    collector.recordPointer({ callback: "onTouchesMove", phase: "intent", xDp: 290, yDp: 280, dxDp: -10, dyDp: 60, viewportWidthDp: 354, translationXDp: 0, intentOwner: "vertical", callbackGeneration: 4 });
    collector.recordPointer({ callback: "onFinalize", phase: "finalize-cancel", xDp: 290, yDp: 280, dxDp: -10, dyDp: 60, viewportWidthDp: 354, translationXDp: 0, intentOwner: "vertical", callbackGeneration: 5 });
    collector.recordTransition({ trigger: "cancel", before: transition("idle"), after: { ...transition("idle"), epoch: 1 }, commandKinds: [] });
    await collector.flush();

    const terminal = JSON.parse(emitted[0]!.slice(PHASE20_CALENDAR_RESULT_MARKER.length));
    expect(terminal.stage.pointer_events.at(-1)).toMatchObject({ callback: "onFinalize", phase: "finalize-cancel" });
    expect(terminal.stage.pointer_events).not.toEqual(expect.arrayContaining([expect.objectContaining({ callback: "onEnd" })]));
  });

  it("uses row, lifecycle, reduced-motion, and baseline-specific terminal schemas", async () => {
    const groups = [
      ["week-expand-middle-row", "row-geometry"],
      ["rotation-during-transition", "lifecycle"],
      ["reduced-motion", "reduced-motion"],
      ["dev-01-padding", "baseline"],
    ] as const;
    expect(groups.map(([, group]) => group)).not.toContain("pointer");
    expect(PHASE20_CALENDAR_STAGE_GROUPS.rowGeometry).toContain(groups[0][0]);
    expect(PHASE20_CALENDAR_STAGE_GROUPS.lifecycle).toContain(groups[1][0]);
    expect(PHASE20_CALENDAR_STAGE_GROUPS.reducedMotion).toContain(groups[2][0]);
    expect(PHASE20_CALENDAR_STAGE_GROUPS.baseline).toContain(groups[3][0]);
  });

  it("does not emit before a stage's real checkpoints", async () => {
    const emitted: string[] = [];
    const collector = pointerCollector("drag-forward-25", emitted)!;
    collector.recordViewport({ widthDp: 354, heightDp: 560, orientation: "portrait", layoutGeneration: 1 });
    collector.recordPointer({ callback: "onTouchesDown", phase: "down", xDp: 300, yDp: 220, dxDp: 0, dyDp: 0, viewportWidthDp: 354, translationXDp: 0, intentOwner: "undetermined", callbackGeneration: 1 });
    await collector.flush();
    expect(emitted).toEqual([]);
  });

  it("fails closed when the native digest callback is unavailable", async () => {
    const emitted: string[] = [];
    const collector = createPhase20CalendarObservationCollector({
      request: request("dev-01-padding"),
      now: clock(),
      sha256: async () => { throw new Error("native digest unavailable"); },
      emitLine: (line) => emitted.push(line),
    })!;
    collector.recordViewport({ widthDp: 324, heightDp: 560, orientation: "portrait", layoutGeneration: 1 });
    collector.recordMotion({ reducedMotion: false });
    collector.recordSemantic({ title: "October 2026", currentMonthId: "2026-10", selectedCivilDate: "2026-10-15", focusedWeekStart: null, weekCount: 5, callbackGeneration: 1 });
    for (const [index, weekStart] of ["2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"].entries()) {
      collector.recordWeekLayout({ weekStart, yDp: index * 70, heightDp: 70, layoutGeneration: 1 });
    }
    collector.recordBaseline({ kind: "adaptive-padding", safeWidthDp: 360, horizontalInsetDp: 18, viewportWidthDp: 324 });
    await expect(collector.flush()).rejects.toThrow("native digest unavailable");
    expect(emitted).toEqual([]);
  });
});

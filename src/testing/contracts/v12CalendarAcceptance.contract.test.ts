import { describe, expect, it } from "@jest/globals";

import { PHASE20_CALENDAR_STAGE_IDS } from "../../bootstrap/phase20CalendarObservation";
import {
  V12_CALENDAR_ACCEPTANCE_CASES,
  V12_CALENDAR_OBSERVATION_SCHEMAS,
  runV12CalendarAcceptanceContract,
} from "./v12CalendarAcceptance.contract";

const plan = Object.freeze({
  sourceDigest: "a".repeat(64),
  nativeExecution: "NOT_RUN" as const,
  stages: Object.freeze(V12_CALENDAR_OBSERVATION_SCHEMAS.map((entry) => Object.freeze({ ...entry }))),
});

describe("v1.2 Calendar native-acceptance contract", () => {
  it("keeps NV-CAL-01 through NV-CAL-09 observation-only and plans every canonical stage once", () => {
    expect(V12_CALENDAR_ACCEPTANCE_CASES.map(({ id }) => id)).toEqual([
      "NV-CAL-01", "NV-CAL-02", "NV-CAL-03", "NV-CAL-04", "NV-CAL-05",
      "NV-CAL-06", "NV-CAL-07", "NV-CAL-08", "NV-CAL-09",
    ]);
    expect(V12_CALENDAR_ACCEPTANCE_CASES.every(({ disposition }) => disposition === "observe-only")).toBe(true);
    expect(V12_CALENDAR_OBSERVATION_SCHEMAS.map(({ stageId }) => stageId)).toEqual(PHASE20_CALENDAR_STAGE_IDS);
    expect(new Set(V12_CALENDAR_OBSERVATION_SCHEMAS.map(({ group }) => group))).toEqual(new Set([
      "pointer", "input-interrupt", "row-geometry", "month-geometry", "lifecycle", "reduced-motion", "baseline",
    ]));
  });

  it("accepts the exact stage-specific observation plan without authoring PASS", () => {
    expect(runV12CalendarAcceptanceContract(plan)).toEqual({ nativeExecution: "NOT_RUN", caseCount: 9, stageCount: 35 });
  });

  it("rejects missing, duplicate, reordered, generic, and verdict-bearing stage plans", () => {
    expect(() => runV12CalendarAcceptanceContract({ ...plan, stages: plan.stages.slice(1) })).toThrow("calendar_stage_plan_invalid");
    expect(() => runV12CalendarAcceptanceContract({ ...plan, stages: plan.stages.map((entry, index) => index === 1 ? plan.stages[0]! : entry) })).toThrow("calendar_stage_plan_invalid");
    expect(() => runV12CalendarAcceptanceContract({ ...plan, stages: plan.stages.map((entry, index) => index === 20 ? { ...entry, group: "pointer" as const } : entry) })).toThrow("calendar_stage_plan_invalid");
    expect(() => runV12CalendarAcceptanceContract({ ...plan, stages: plan.stages.map((entry, index) => index === 20 ? { ...entry, requiredCollections: ["samples"] } : entry) })).toThrow("calendar_stage_plan_invalid");
    expect(() => runV12CalendarAcceptanceContract({ ...plan, nativeExecution: "PASS" as never })).toThrow("calendar_execution_invalid");
    expect(() => runV12CalendarAcceptanceContract({ ...plan, finalVerdict: "PASS" } as never)).toThrow("calendar_observation_invalid");
  });

  it("rejects malformed source identity and unknown schema versions", () => {
    expect(() => runV12CalendarAcceptanceContract({ ...plan, sourceDigest: "bad" })).toThrow("calendar_source_digest_invalid");
    expect(() => runV12CalendarAcceptanceContract({ ...plan, stages: plan.stages.map((entry, index) => index === 0 ? { ...entry, schemaVersion: 2 as 1 } : entry) })).toThrow("calendar_stage_plan_invalid");
  });
});

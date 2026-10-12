import {
  describe,
  expect,
  it,
} from "@jest/globals";

import {
  projectRelativeStrength,
  type RelativeStrengthBodyweightFact,
} from "./relativeStrength";

function fact(
  overrides: Partial<RelativeStrengthBodyweightFact> = {},
): RelativeStrengthBodyweightFact {
  return Object.freeze({
    factId: "bodyweight-a",
    localDate: "2026-08-24",
    grams: 80_000,
    effectiveAtMs: 1_724_515_200_000,
    sourceRevision: 1,
    lifecycle: "active",
    ...overrides,
  });
}

describe("projectRelativeStrength", () => {
  it("uses the latest owner-local basis at or before the observation with deterministic same-date ordering", () => {
    const projection = projectRelativeStrength({
      observation: Object.freeze({ localDate: "2026-08-24", loadGrams: 41_000 }),
      bodyweightFacts: Object.freeze([
        fact({ factId: "older-date", localDate: "2026-08-23", grams: 70_000 }),
        fact({ factId: "earlier-commit", grams: 75_000, effectiveAtMs: 1_724_515_100_000, sourceRevision: 9 }),
        fact({ factId: "same-commit-lower-revision", grams: 78_000, sourceRevision: 1 }),
        fact({ factId: "same-commit-same-revision-a", grams: 80_000, sourceRevision: 2 }),
        fact({ factId: "same-commit-same-revision-z", grams: 82_000, sourceRevision: 2 }),
      ]),
    });

    expect(projection).toEqual({
      loadGrams: 41_000,
      relativeLoad: 0.5,
      basis: {
        grams: 82_000,
        localDate: "2026-08-24",
      },
    });
    expect(projection).not.toHaveProperty("factId");
    expect(projection).not.toHaveProperty("sourceRevision");
  });

  it("fails closed for future, deleted, malformed, or absent bodyweight without changing the load fact", () => {
    const observation = Object.freeze({ localDate: "2026-08-24", loadGrams: 50_000 });
    const rejected = Object.freeze([
      fact({ factId: "future", localDate: "2026-08-25" }),
      fact({ factId: "deleted", lifecycle: "deleted" }),
      fact({ factId: "too-small", grams: 19_900 }),
      fact({ factId: "fractional", grams: 80_050 }),
      fact({ factId: "invalid-time", effectiveAtMs: -1 }),
      fact({ factId: "invalid-revision", sourceRevision: 0 }),
    ]);

    expect(projectRelativeStrength({ observation, bodyweightFacts: rejected }))
      .toBeNull();
    expect(observation).toEqual({ localDate: "2026-08-24", loadGrams: 50_000 });
  });

  it("changes only the rebuildable relative view when a dated basis is added or removed", () => {
    const observation = Object.freeze({ localDate: "2026-08-24", loadGrams: 50_000 });
    const sourceObservation = JSON.stringify(observation);

    expect(projectRelativeStrength({ observation, bodyweightFacts: [] })).toBeNull();
    expect(projectRelativeStrength({
      observation,
      bodyweightFacts: [fact({ grams: 100_000 })],
    })).toEqual({
      loadGrams: 50_000,
      relativeLoad: 0.5,
      basis: { grams: 100_000, localDate: "2026-08-24" },
    });
    expect(JSON.stringify(observation)).toBe(sourceObservation);
  });
});

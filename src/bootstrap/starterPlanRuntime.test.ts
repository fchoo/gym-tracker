import {
  createHash,
} from "node:crypto";
import {
  describe,
  expect,
  it,
} from "@jest/globals";

import fullBodyFoundationAsset from "../../assets/content/full-body-foundation.v1.json";
import starterPlansAsset from "../../assets/content/starter-plans.v2.json";
import starterPlansAcceptanceAsset from "../../artifacts/review/phase2/starter-plans-acceptance.json";
import {
  STARTER_TEMPLATE_UPDATE_MODE,
  createStarterPlanRuntimeCatalog,
  createStarterTemplateUpdatePreview,
  findStarterPlan,
  legacyFullBodySourceJson,
  starterFactLabel,
} from "./starterPlanRuntime";

const prettyBytes = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = async (value: string) =>
  createHash("sha256").update(value).digest("hex");

async function catalog() {
  return createStarterPlanRuntimeCatalog({
    starterPackBytes: prettyBytes(starterPlansAsset),
    acceptanceBytes: prettyBytes(starterPlansAcceptanceAsset),
    sha256,
  });
}

describe("starter plan runtime catalog", () => {
  it("maps only the accepted six-template pack in stable source order", async () => {
    const accepted = await catalog();

    expect(accepted.summaries.map(({ id }) => id)).toEqual([
      "full-body-foundation",
      "upper-lower",
      "push-pull-legs",
      "minimal-equipment-full-body",
      "strength-conditioning",
      "gym-body-part-split",
    ]);
    expect(accepted.summaries.at(-1)).toMatchObject({
      ordinal: 6,
      name: "Gym Body-Part Split",
      daysPerWeek: 5,
      experience: "Intermediate",
      equipment: [
        "Barbell",
        "Bench",
        "Cable",
        "Dumbbell",
        "Machine",
        "Squat Rack",
      ],
    });
    expect(findStarterPlan(accepted, "gym-body-part-split")?.days.map(
      ({ displayName }) => displayName,
    )).toEqual(["Chest", "Back", "Shoulders", "Legs", "Arms"]);
    expect(findStarterPlan(accepted, "missing")).toBeNull();
    expect(starterFactLabel("beginner_returning")).toBe(
      "Beginner Returning",
    );
    expect(STARTER_TEMPLATE_UPDATE_MODE).toBe("update");
  });

  it("builds a full legacy revision-one to accepted revision-two diff", async () => {
    const accepted = await catalog();
    const template = findStarterPlan(accepted, "full-body-foundation")!;
    const previousSourceJson = legacyFullBodySourceJson(
      fullBodyFoundationAsset,
      template,
    );

    const preview = createStarterTemplateUpdatePreview({
      ownedPlanId: "legacy-copy",
      ownedPlanName: "Full Body Foundation",
      ownedPlanRevision: 1,
      activeScheduleRevision: null,
      previousSourceJson,
      template,
    });

    expect(preview).toMatchObject({
      ownedPlanId: "legacy-copy",
      ownedPlanName: "Full Body Foundation",
      ownedPlanRevision: 1,
      activeScheduleRevision: null,
    });
    expect(preview.sections.map(({ title }) => title)).toEqual([
      "Days",
      "Exercises",
      "Targets",
      "Schedule defaults",
      "Progression policies",
    ]);
    expect(preview.sections.every(({ changes }) => changes.length >= 1))
      .toBe(true);
    expect(preview.sections.flatMap(({ changes }) => changes).some(
      ({ kind }) => kind === "Changed",
    )).toBe(true);
    expect(JSON.parse(previousSourceJson)).toMatchObject({
      displayName: "Full Body Foundation",
      scheduleSuggestion: { mode: "weekday" },
    });
  });

  it("reports unchanged accepted source graphs without inventing changes", async () => {
    const accepted = await catalog();
    const template = accepted.templates[1]!;
    const preview = createStarterTemplateUpdatePreview({
      ownedPlanId: "current-copy",
      ownedPlanName: "Upper / Lower",
      ownedPlanRevision: 2,
      activeScheduleRevision: 3,
      previousSourceJson: template.sourceJson,
      template,
    });

    expect(preview.sections.flatMap(({ changes }) => changes).every(
      ({ kind }) => kind === "Unchanged",
    )).toBe(true);
    expect(() => createStarterTemplateUpdatePreview({
      ownedPlanId: "broken-copy",
      ownedPlanName: "Broken",
      ownedPlanRevision: 1,
      activeScheduleRevision: null,
      previousSourceJson: "[]",
      template,
    })).toThrow("starter_source_template_invalid");
  });
});

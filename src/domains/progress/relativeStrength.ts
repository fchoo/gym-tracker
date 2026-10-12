import {
  BODYWEIGHT_GRAMS_INCREMENT,
  MAX_BODYWEIGHT_GRAMS,
  MIN_BODYWEIGHT_GRAMS,
} from "../bodyweight";

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/u;

export type RelativeStrengthBodyweightFact = Readonly<{
  factId: string;
  localDate: string;
  grams: number;
  effectiveAtMs: number;
  sourceRevision: number;
  lifecycle: "active" | "deleted";
}>;

export type RelativeStrengthProjection = Readonly<{
  loadGrams: number;
  relativeLoad: number;
  basis: Readonly<{
    grams: number;
    localDate: string;
  }>;
}>;

function validLocalDate(value: string): boolean {
  if (!LOCAL_DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const candidate = new Date(Date.UTC(year!, month! - 1, day!));
  return candidate.getUTCFullYear() === year
    && candidate.getUTCMonth() === month! - 1
    && candidate.getUTCDate() === day;
}

function validBodyweightFact(
  fact: RelativeStrengthBodyweightFact,
  observationDate: string,
): boolean {
  return fact.lifecycle === "active"
    && fact.factId.trim().length > 0
    && validLocalDate(fact.localDate)
    && fact.localDate <= observationDate
    && Number.isSafeInteger(fact.grams)
    && fact.grams >= MIN_BODYWEIGHT_GRAMS
    && fact.grams <= MAX_BODYWEIGHT_GRAMS
    && fact.grams % BODYWEIGHT_GRAMS_INCREMENT === 0
    && Number.isSafeInteger(fact.effectiveAtMs)
    && fact.effectiveAtMs >= 0
    && Number.isSafeInteger(fact.sourceRevision)
    && fact.sourceRevision > 0;
}

function basisOrder(
  left: RelativeStrengthBodyweightFact,
  right: RelativeStrengthBodyweightFact,
): number {
  return right.localDate.localeCompare(left.localDate)
    || right.effectiveAtMs - left.effectiveAtMs
    || right.sourceRevision - left.sourceRevision
    || right.factId.localeCompare(left.factId);
}

/**
 * Produces a disclosed, rebuildable view from exact atomic source units.
 * It accepts no target or recommendation authority and cannot mutate source facts.
 */
export function projectRelativeStrength(input: Readonly<{
  observation: Readonly<{
    localDate: string;
    loadGrams: number;
  }>;
  bodyweightFacts: readonly RelativeStrengthBodyweightFact[];
}>): RelativeStrengthProjection | null {
  if (!validLocalDate(input.observation.localDate)
    || !Number.isSafeInteger(input.observation.loadGrams)
    || input.observation.loadGrams <= 0) {
    return null;
  }
  const basis = [...input.bodyweightFacts]
    .filter((fact) => validBodyweightFact(fact, input.observation.localDate))
    .sort(basisOrder)[0];
  if (basis === undefined) return null;
  return Object.freeze({
    loadGrams: input.observation.loadGrams,
    relativeLoad: input.observation.loadGrams / basis.grams,
    basis: Object.freeze({
      grams: basis.grams,
      localDate: basis.localDate,
    }),
  });
}

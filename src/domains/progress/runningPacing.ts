export type RunningPacing = Readonly<{
  target: string;
  pacePerKm: string;
  per400m: string;
  per200m: string;
}>;

function validPositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

/** Integer half-up rounding avoids floating-point drift in owner-visible pace. */
function roundRationalHalfUp(numerator: number, denominator: number): number {
  if (!validPositiveInteger(numerator) || !validPositiveInteger(denominator)) {
    throw new TypeError("running_pacing_input_invalid");
  }
  const doubledNumerator = numerator * 2;
  const doubledDenominator = denominator * 2;
  if (!Number.isSafeInteger(doubledNumerator) || !Number.isSafeInteger(doubledDenominator)) {
    throw new TypeError("running_pacing_input_invalid");
  }
  return Math.floor((doubledNumerator + denominator) / doubledDenominator);
}

function duration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function deriveRunningPacing(input: Readonly<{
  distanceMeters: number;
  targetDurationSeconds: number;
}>): RunningPacing {
  if (!validPositiveInteger(input.distanceMeters) || !validPositiveInteger(input.targetDurationSeconds)) {
    throw new TypeError("running_pacing_input_invalid");
  }
  const split = (meters: number): number => roundRationalHalfUp(
    input.targetDurationSeconds * meters,
    input.distanceMeters,
  );
  return Object.freeze({
    target: duration(input.targetDurationSeconds),
    pacePerKm: `${duration(split(1000))}/km`,
    per400m: `${duration(split(400))}/400 m`,
    per200m: `${duration(split(200))}/200 m`,
  });
}

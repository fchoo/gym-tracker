/**
 * Fit from a plain native glyph advance, never fontScale multiplication.
 * The ratio is only the next candidate: Android 14 SP scaling is nonlinear,
 * so the caller must remeasure it. Quarter-sp descent bounds the search to
 * 32 changes from Archivo 16 to the existing 0.5 floor; no retry timers.
 */
export function fitTabLabelFontSize(
  fontSize: number,
  nativeAdvance: number,
  columnWidth: number,
  minimumFontSize: number,
): Readonly<{ fontSize: number; fits: boolean }> | null {
  const availableWidth = columnWidth - 2; // End-glyph/rounding clearance in dp.
  if (
    !Number.isFinite(fontSize) || fontSize <= 0
    || !Number.isFinite(nativeAdvance) || nativeAdvance <= 0
    || !Number.isFinite(availableWidth) || availableWidth <= 0
    || !Number.isFinite(minimumFontSize) || minimumFontSize <= 0
    || minimumFontSize > fontSize
  ) {
    return null;
  }
  if (nativeAdvance <= availableWidth) {
    return { fontSize, fits: true };
  }
  const nextSize = Math.floor(Math.min(
    fontSize - 0.25,
    fontSize * availableWidth / nativeAdvance,
  ) * 4) / 4;
  return { fontSize: Math.max(minimumFontSize, nextSize), fits: false };
}

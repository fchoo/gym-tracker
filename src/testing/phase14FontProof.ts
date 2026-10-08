export const PHASE14_FONT_PROOF_PACKAGE = "com.fchoo.gymtracker.devtest";
export const PHASE14_FONT_PROOF_PROFILE = "development-test";
export const PHASE14_FONT_PROOF_CASE_IDS = [
  "light-390-scale-1",
  "light-390-scale-2",
] as const;

type FontProofCase = Readonly<{
  id: (typeof PHASE14_FONT_PROOF_CASE_IDS)[number];
  fontScale: 1 | 2;
  viewport: Readonly<{ width: 390; height: 844 }>;
  theme: "light";
  expected: Readonly<{ lines: readonly ["Today’s", "workout"] }>;
}>;

export const PHASE14_FONT_PROOF = Object.freeze({
  asset: Object.freeze({
    file: "assets/fonts/Archivo-VariableFont_wdth,wght.ttf",
    licenseFile: "assets/fonts/OFL-Archivo.txt",
    upstreamUrl: "https://github.com/google/fonts/raw/main/ofl/archivo/Archivo%5Bwdth%2Cwght%5D.ttf",
    licenseUrl: "https://github.com/google/fonts/raw/main/ofl/archivo/OFL.txt",
    sha256: "0e094a7d3c7c4c25cf1310c4b30014f1dae9332220b1c2c88f4fa996f0b05053",
    licenseSha256: "108b4e57c9c796d3d38d0428ca7ee39de47ad93187302718d9b2d8864b9b716b",
  }),
  oracle: Object.freeze({
    revision: 18,
    approvedJsonSha256: "b8e91e3098ec443c9dc283ae8383d1af552d7dc2b83648695a01dcb8a89ff0bf",
    approvedHtmlSha256: "b5ddbad88fd465af2fa79475dc0c05efec49e551652f13c5220627730e1d9c96",
    sourceText: "Today’s workout",
    fontFamily: "ArchivoVariable",
    fontSizePx: 57,
    fontStretch: "condensed",
    fontWeight: 890,
    letterSpacingEm: -0.07,
    lineHeightPx: 49,
    contentMaxWidthPx: 335,
  }),
  cases: Object.freeze([
    Object.freeze({ id: PHASE14_FONT_PROOF_CASE_IDS[0], fontScale: 1, viewport: Object.freeze({ width: 390, height: 844 }), theme: "light", expected: Object.freeze({ lines: ["Today’s", "workout"] as const }) }),
    Object.freeze({ id: PHASE14_FONT_PROOF_CASE_IDS[1], fontScale: 2, viewport: Object.freeze({ width: 390, height: 844 }), theme: "light", expected: Object.freeze({ lines: ["Today’s", "workout"] as const }) }),
  ] satisfies readonly FontProofCase[]),
});

type Bounds = Readonly<{ x: number; y: number; width: number; height: number }>;
type FontProofObservation = Readonly<{
  id: FontProofCase["id"]; fontScale: number; family: string; familyLoaded: boolean;
  style: typeof PHASE14_FONT_PROOF.oracle; lines: readonly string[];
  metrics: Readonly<{ availableWidthPx: number; blockWidthPx: number; blockHeightPx: number; lineAdvancesPx: readonly number[]; lineHeightsPx: readonly number[]; lineBaselinesPx: readonly Readonly<{ ascenderPx: number; descenderPx: number; yPx: number; heightPx: number; baselineOffsetPx: number }>[]; textBounds: Bounds; containerBounds: Bounds }>;
  screenshotSha256: string;
}>;
export type Phase14FontProofReport = Readonly<{
  schemaVersion: number; sourceTreeSha256: string; apkSha256: string; packageName: string;
  profile: string; fontScaleRestored: boolean; cases: readonly FontProofObservation[];
}>;

function assertHash(value: string, code: string) { if (!/^[a-f0-9]{64}$/u.test(value)) throw new Error(code); }
function positive(value: number) { return Number.isFinite(value) && value > 0; }
function contained(inner: Bounds, outer: Bounds) {
  return inner.x >= outer.x && inner.y >= outer.y
    && inner.x + inner.width <= outer.x + outer.width
    && inner.y + inner.height <= outer.y + outer.height;
}

/** Validates native observations; it intentionally does not invent glyph targets from CSS container or line-height declarations. */
export function validatePhase14FontProofReport(report: Phase14FontProofReport) {
  assertHash(report.sourceTreeSha256, "phase14_font_source_hash_invalid");
  assertHash(report.apkSha256, "phase14_font_apk_hash_invalid");
  if (report.schemaVersion !== 2 || report.packageName !== PHASE14_FONT_PROOF_PACKAGE || report.profile !== PHASE14_FONT_PROOF_PROFILE) throw new Error("phase14_font_identity_invalid");
  if (!report.fontScaleRestored) throw new Error("phase14_font_scale_restore_invalid");
  if (report.cases.length !== PHASE14_FONT_PROOF.cases.length) throw new Error("phase14_font_case_count_invalid");
  for (const [index, expected] of PHASE14_FONT_PROOF.cases.entries()) {
    const observed = report.cases[index];
    if (observed?.id !== expected.id || observed.fontScale !== expected.fontScale) throw new Error("phase14_font_case_order_invalid");
    if (observed.family !== PHASE14_FONT_PROOF.oracle.fontFamily || !observed.familyLoaded) throw new Error("phase14_font_family_invalid");
    if (JSON.stringify(observed.style) !== JSON.stringify(PHASE14_FONT_PROOF.oracle)) throw new Error("phase14_font_style_inputs_invalid");
    if (observed.lines.join("\n") !== expected.expected.lines.join("\n")) throw new Error("phase14_font_wrap_breakpoint_invalid");
    assertHash(observed.screenshotSha256, "phase14_font_screenshot_hash_invalid");
    const metrics = observed.metrics;
    if (![metrics.availableWidthPx, metrics.blockWidthPx, metrics.blockHeightPx, ...metrics.lineAdvancesPx, ...metrics.lineHeightsPx, metrics.textBounds.width, metrics.textBounds.height, metrics.containerBounds.width, metrics.containerBounds.height].every(positive) || metrics.lineAdvancesPx.length !== 2 || metrics.lineHeightsPx.length !== 2) throw new Error("phase14_font_metrics_invalid");
    if (metrics.lineBaselinesPx.length !== 2 || metrics.lineBaselinesPx.some((line, lineIndex) => ![line.ascenderPx, line.descenderPx, line.yPx, line.heightPx, line.baselineOffsetPx].every(Number.isFinite) || line.ascenderPx < 0 || line.ascenderPx > line.heightPx || Math.abs(line.descenderPx) > line.heightPx || line.baselineOffsetPx < line.yPx || line.baselineOffsetPx > line.yPx + line.heightPx || line.yPx + line.heightPx > metrics.blockHeightPx || (lineIndex > 0 && line.yPx < metrics.lineBaselinesPx[lineIndex - 1]!.yPx))) throw new Error("phase14_font_baseline_metrics_invalid");
    if (metrics.availableWidthPx > PHASE14_FONT_PROOF.oracle.contentMaxWidthPx || metrics.containerBounds.width < metrics.availableWidthPx || Math.max(...metrics.lineAdvancesPx) > metrics.availableWidthPx || !contained(metrics.textBounds, metrics.containerBounds)) throw new Error("phase14_font_native_overflow_detected");
  }
  return true;
}

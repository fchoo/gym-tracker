export const PHASE14_FONT_PROOF_PACKAGE = "com.fchoo.gymtracker.devtest";
export const PHASE14_FONT_PROOF_PROFILE = "development-test";

type FontProofCase = Readonly<{
  id: "light-390-scale-1" | "light-390-scale-2";
  fontScale: 1 | 2;
  viewport: Readonly<{ width: 390; height: 844 }>;
  theme: "light";
  expected: Readonly<{
    glyphRunWidthPx: number;
    lineBoxHeightPx: number;
    baselineClass: "alphabetic";
    lines: readonly ["Today’s", "workout"];
  }>;
}>;

export const PHASE14_FONT_PROOF = Object.freeze({
  asset: Object.freeze({
    file: "assets/fonts/Archivo-VariableFont_wdth,wght.ttf",
    licenseFile: "assets/fonts/OFL-Archivo.txt",
    upstreamUrl:
      "https://github.com/google/fonts/raw/main/ofl/archivo/Archivo%5Bwdth%2Cwght%5D.ttf",
    licenseUrl: "https://github.com/google/fonts/raw/main/ofl/archivo/OFL.txt",
    sha256: "0e094a7d3c7c4c25cf1310c4b30014f1dae9332220b1c2c88f4fa996f0b05053",
    licenseSha256: "108b4e57c9c796d3d38d0428ca7ee39de47ad93187302718d9b2d8864b9b716b",
  }),
  oracle: Object.freeze({
    revision: 18,
    approvedJsonSha256:
      "b8e91e3098ec443c9dc283ae8383d1af552d7dc2b83648695a01dcb8a89ff0bf",
    approvedHtmlSha256:
      "b5ddbad88fd465af2fa79475dc0c05efec49e551652f13c5220627730e1d9c96",
    sourceText: "Today’s workout",
    fontFamily: "ArchivoVariable",
    fontSizePx: 57,
    fontStretch: "condensed",
    fontWeight: 890,
    letterSpacingEm: -0.07,
    lineHeightPx: 49,
    contentMaxWidthPx: 335,
  }),
  tolerance: Object.freeze({ normalizedPhysicalPixels: 1 }),
  cases: Object.freeze([
    Object.freeze({
      id: "light-390-scale-1",
      fontScale: 1,
      viewport: Object.freeze({ width: 390, height: 844 }),
      theme: "light",
      // These source-space metrics come from the fixed CSS declaration. The
      // native report supplies density-normalized observations for the later
      // exact-HEAD proof; this source plan claims no native verdict.
      expected: Object.freeze({
        glyphRunWidthPx: 335,
        lineBoxHeightPx: 49,
        baselineClass: "alphabetic",
        lines: ["Today’s", "workout"] as const,
      }),
    }),
    Object.freeze({
      id: "light-390-scale-2",
      fontScale: 2,
      viewport: Object.freeze({ width: 390, height: 844 }),
      theme: "light",
      expected: Object.freeze({
        glyphRunWidthPx: 335,
        lineBoxHeightPx: 98,
        baselineClass: "alphabetic",
        lines: ["Today’s", "workout"] as const,
      }),
    }),
  ] satisfies readonly FontProofCase[]),
});

type FontProofObservation = Readonly<{
  id: FontProofCase["id"];
  family: string;
  glyphRunWidthPx: number;
  lineBoxHeightPx: number;
  baselineClass: string;
  lines: readonly string[];
  cropped: boolean;
  overflowed: boolean;
  screenshotOverlay: string;
}>;

export type Phase14FontProofReport = Readonly<{
  sourceTreeSha256: string;
  apkSha256: string;
  packageName: string;
  profile: string;
  cases: readonly FontProofObservation[];
}>;

function assertHash(value: string, code: string) {
  if (!/^[a-f0-9]{64}$/u.test(value)) {
    throw new Error(code);
  }
}

export function validatePhase14FontProofReport(report: Phase14FontProofReport) {
  assertHash(report.sourceTreeSha256, "phase14_font_source_hash_invalid");
  assertHash(report.apkSha256, "phase14_font_apk_hash_invalid");
  if (report.packageName !== PHASE14_FONT_PROOF_PACKAGE) {
    throw new Error("phase14_font_package_invalid");
  }
  if (report.profile !== PHASE14_FONT_PROOF_PROFILE) {
    throw new Error("phase14_font_profile_invalid");
  }
  if (report.cases.length !== PHASE14_FONT_PROOF.cases.length) {
    throw new Error("phase14_font_case_count_invalid");
  }

  for (const [index, expectedCase] of PHASE14_FONT_PROOF.cases.entries()) {
    const observed = report.cases[index];
    if (observed?.id !== expectedCase.id) {
      throw new Error("phase14_font_case_order_invalid");
    }
    if (observed.family !== PHASE14_FONT_PROOF.oracle.fontFamily) {
      throw new Error("phase14_font_family_invalid");
    }
    if (!/^sha256:[a-f0-9]{64}$/u.test(observed.screenshotOverlay)) {
      throw new Error("phase14_font_overlay_hash_invalid");
    }
    if (Math.abs(observed.glyphRunWidthPx - expectedCase.expected.glyphRunWidthPx)
      > PHASE14_FONT_PROOF.tolerance.normalizedPhysicalPixels) {
      throw new Error("phase14_font_glyph_width_out_of_tolerance");
    }
    if (Math.abs(observed.lineBoxHeightPx - expectedCase.expected.lineBoxHeightPx)
      > PHASE14_FONT_PROOF.tolerance.normalizedPhysicalPixels) {
      throw new Error("phase14_font_line_box_out_of_tolerance");
    }
    if (observed.baselineClass !== expectedCase.expected.baselineClass) {
      throw new Error("phase14_font_baseline_invalid");
    }
    if (observed.lines.join("\n") !== expectedCase.expected.lines.join("\n")) {
      throw new Error("phase14_font_wrap_breakpoint_invalid");
    }
    if (observed.cropped) {
      throw new Error("phase14_font_crop_detected");
    }
    if (observed.overflowed) {
      throw new Error("phase14_font_overflow_detected");
    }
  }

  return true;
}

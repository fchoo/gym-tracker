import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  PHASE14_FONT_PROOF,
  validatePhase14FontProofReport,
} from "./phase14FontProof";
import { appFonts } from "../ui/theme";

const root = path.resolve(__dirname, "../..");
const sha256 = (value: Buffer | string) =>
  createHash("sha256").update(value).digest("hex");

describe("Phase 14 Revision 18 font oracle", () => {
  it("pins the official Archivo bytes, OFL notice, and proof-only local mapping", () => {
    expect(appFonts).toHaveProperty("ArchivoVariable");
    expect(PHASE14_FONT_PROOF.asset).toEqual({
      file: "assets/fonts/Archivo-VariableFont_wdth,wght.ttf",
      licenseFile: "assets/fonts/OFL-Archivo.txt",
      upstreamUrl: "https://github.com/google/fonts/raw/main/ofl/archivo/Archivo%5Bwdth%2Cwght%5D.ttf",
      licenseUrl: "https://github.com/google/fonts/raw/main/ofl/archivo/OFL.txt",
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
      licenseSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });
    expect(sha256(readFileSync(path.join(root, PHASE14_FONT_PROOF.asset.file))))
      .toBe(PHASE14_FONT_PROOF.asset.sha256);
    expect(sha256(readFileSync(path.join(root, PHASE14_FONT_PROOF.asset.licenseFile))))
      .toBe(PHASE14_FONT_PROOF.asset.licenseSha256);
  });

  it("records the exact Revision 18 display source and deterministic cases", () => {
    expect(PHASE14_FONT_PROOF.oracle).toMatchObject({
      revision: 18,
      fontFamily: "ArchivoVariable",
      fontSizePx: 57,
      fontStretch: "condensed",
      fontWeight: 890,
      letterSpacingEm: -0.07,
      lineHeightPx: 49,
      sourceText: "Today’s workout",
    });
    expect(PHASE14_FONT_PROOF.cases).toEqual([
      expect.objectContaining({ fontScale: 1, viewport: { width: 360, height: 800 } }),
      expect.objectContaining({ fontScale: 2, viewport: { width: 360, height: 800 } }),
    ]);
  });

  it("accepts only one-physical-pixel geometry deltas with exact wraps and no crop", () => {
    const proof = PHASE14_FONT_PROOF.cases.map((testCase) => ({
      id: testCase.id,
      family: "ArchivoVariable",
      glyphRunWidthPx: testCase.expected.glyphRunWidthPx,
      lineBoxHeightPx: testCase.expected.lineBoxHeightPx,
      baselineClass: testCase.expected.baselineClass,
      lines: testCase.expected.lines,
      cropped: false,
      overflowed: false,
      screenshotOverlay: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    }));

    expect(() => validatePhase14FontProofReport({
      sourceTreeSha256: "a".repeat(64),
      apkSha256: "b".repeat(64),
      packageName: "com.fchoo.gymtracker.devtest",
      profile: "development-test",
      cases: proof,
    })).not.toThrow();

    expect(() => validatePhase14FontProofReport({
      sourceTreeSha256: "a".repeat(64),
      apkSha256: "b".repeat(64),
      packageName: "com.fchoo.gymtracker.devtest",
      profile: "development-test",
      cases: [{ ...proof[0], glyphRunWidthPx: proof[0].glyphRunWidthPx + 2 }, ...proof.slice(1)],
    })).toThrow("phase14_font_glyph_width_out_of_tolerance");
  });
});

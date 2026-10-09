import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "@jest/globals";

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
      sourceText: "Workout",
    });
    expect(PHASE14_FONT_PROOF.cases).toEqual([
      expect.objectContaining({ fontScale: 1, viewport: { width: 390, height: 844 } }),
      expect.objectContaining({ fontScale: 2, viewport: { width: 390, height: 844 } }),
    ]);
  });

  it("requires measured per-line and native-bound geometry instead of treating CSS constraints as glyph metrics", () => {
    const proof = PHASE14_FONT_PROOF.cases.map((testCase) => ({
      id: testCase.id,
      fontScale: testCase.fontScale,
      displayDensity: 2.625,
      family: "ArchivoVariable",
      familyLoaded: true,
      style: PHASE14_FONT_PROOF.oracle,
      lines: testCase.expected.lines,
      metrics: {
        availableWidthPx: 335,
        blockWidthPx: 224,
        blockHeightPx: 49,
        lineAdvancesPx: [191],
        lineHeightsPx: [49],
        lineBaselinesPx: [
          { ascenderPx: 37, descenderPx: 8, yPx: 0, heightPx: 49, baselineOffsetPx: 37 },
        ],
        textBounds: { x: 0, y: 0, width: 224, height: 49 },
        containerBounds: { x: 0, y: 0, width: 335, height: 49 },
      },
      screenshotSha256: "a".repeat(64),
    }));

    expect(() => validatePhase14FontProofReport({
      schemaVersion: 2,
      sourceTreeSha256: "a".repeat(64), apkSha256: "b".repeat(64),
      packageName: "com.fchoo.gymtracker.devtest", profile: "development-test",
      fontScaleRestored: true,
      cases: proof,
    })).not.toThrow();

    const firstProof = proof[0]!;
    const onePhysicalPixel = 1 / firstProof.displayDensity;
    const withinOnePhysicalPixel = {
      ...firstProof,
      metrics: {
        ...firstProof.metrics,
        availableWidthPx: 302.8571472167969,
        lineAdvancesPx: [303.23809814453125],
        textBounds: { x: -onePhysicalPixel, y: -onePhysicalPixel, width: 303.23809814453125, height: 49 + onePhysicalPixel },
        containerBounds: { x: 0, y: 0, width: 302.8571472167969, height: 49 },
      },
    };
    expect(() => validatePhase14FontProofReport({
      schemaVersion: 2, sourceTreeSha256: "a".repeat(64), apkSha256: "b".repeat(64),
      packageName: "com.fchoo.gymtracker.devtest", profile: "development-test",
      fontScaleRestored: true,
      cases: [withinOnePhysicalPixel, ...proof.slice(1)],
    })).not.toThrow();

    expect(() => validatePhase14FontProofReport({
      schemaVersion: 2, sourceTreeSha256: "a".repeat(64), apkSha256: "b".repeat(64),
      packageName: "com.fchoo.gymtracker.devtest", profile: "development-test",
      fontScaleRestored: true,
      cases: [{ ...withinOnePhysicalPixel, metrics: { ...withinOnePhysicalPixel.metrics, textBounds: { ...withinOnePhysicalPixel.metrics.textBounds, width: 303.2382 } } }, ...proof.slice(1)],
    })).toThrow("phase14_font_native_overflow_detected");

    for (const invalidDensity of [undefined, Number.NaN, 0, 9]) {
      expect(() => validatePhase14FontProofReport({
        schemaVersion: 2, sourceTreeSha256: "a".repeat(64), apkSha256: "b".repeat(64),
        packageName: "com.fchoo.gymtracker.devtest", profile: "development-test",
        fontScaleRestored: true,
        cases: [{ ...firstProof, displayDensity: invalidDensity as number }, ...proof.slice(1)],
      })).toThrow("phase14_font_metrics_invalid");
    }

    expect(() => validatePhase14FontProofReport({
      schemaVersion: 2, sourceTreeSha256: "a".repeat(64), apkSha256: "b".repeat(64),
      packageName: "com.fchoo.gymtracker.devtest", profile: "development-test",
      fontScaleRestored: true,
      cases: [{ ...firstProof, metrics: { ...firstProof.metrics, lineBaselinesPx: [{ ...firstProof.metrics.lineBaselinesPx[0]!, baselineOffsetPx: 50 }] } }, ...proof.slice(1)],
    })).toThrow("phase14_font_baseline_metrics_invalid");
  });
});

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { PNG } from "pngjs";

import {
  CONCEPT_G_ASSETS,
  PNGJS_SUPPLY_CHAIN_RECORD,
  checkConceptGAssets,
  generateConceptGAssets,
  renderConceptGAsset,
} from "./generate-concept-g-icons.mjs";

const projectRoot = process.cwd();
const require = createRequire(import.meta.url);

const PALETTE = Object.freeze({
  background: [0xF6, 0xF8, 0xFB, 0xFF],
  deep: [0x0B, 0x3A, 0x75, 0xFF],
  action: [0x15, 0x5E, 0xEF, 0xFF],
  light: [0x70, 0xA0, 0xFF, 0xFF],
  monochrome: [0x00, 0x00, 0x00, 0xFF],
});

const EXPECTED_ASSETS = Object.freeze({
  icon: {
    file: "assets/images/icon.png",
    width: 1024,
    height: 1024,
    opaque: true,
    background: PALETTE.background,
    bars: [
      { x: 256, y: 544, width: 128, height: 224, radius: 28, color: PALETTE.deep },
      { x: 448, y: 416, width: 128, height: 352, radius: 28, color: PALETTE.action },
      { x: 640, y: 288, width: 128, height: 480, radius: 28, color: PALETTE.light },
    ],
    safeZone: { minimum: 192, maximum: 832 },
  },
  androidBackground: {
    file: "assets/images/android-icon-background.png",
    width: 512,
    height: 512,
    opaque: true,
    background: PALETTE.background,
    bars: [],
  },
  androidForeground: {
    file: "assets/images/android-icon-foreground.png",
    width: 512,
    height: 512,
    opaque: false,
    bars: [
      { x: 128, y: 272, width: 64, height: 112, radius: 14, color: PALETTE.deep },
      { x: 224, y: 208, width: 64, height: 176, radius: 14, color: PALETTE.action },
      { x: 320, y: 144, width: 64, height: 240, radius: 14, color: PALETTE.light },
    ],
    safeZone: { minimum: 128, maximum: 384 },
  },
  androidMonochrome: {
    file: "assets/images/android-icon-monochrome.png",
    width: 432,
    height: 432,
    opaque: false,
    bars: [
      { x: 108, y: 229, width: 54, height: 95, radius: 12, color: PALETTE.monochrome },
      { x: 189, y: 175, width: 54, height: 149, radius: 12, color: PALETTE.monochrome },
      { x: 270, y: 121, width: 54, height: 203, radius: 12, color: PALETTE.monochrome },
    ],
    safeZone: { minimum: 108, maximum: 324 },
  },
  splash: {
    file: "assets/images/splash-icon.png",
    width: 228,
    height: 213,
    opaque: false,
    bars: [
      { x: 46, y: 110, width: 34, height: 60, radius: 8, color: PALETTE.deep },
      { x: 97, y: 76, width: 34, height: 94, radius: 8, color: PALETTE.action },
      { x: 148, y: 42, width: 34, height: 128, radius: 8, color: PALETTE.light },
    ],
  },
});

function pixelAt(image, x, y) {
  const offset = (y * image.width + x) * 4;
  return Array.from(image.data.subarray(offset, offset + 4));
}

function roundedRectangleContains(bar, x, y) {
  const pointX = x + 0.5;
  const pointY = y + 0.5;
  const centerX = Math.max(bar.x + bar.radius, Math.min(pointX, bar.x + bar.width - bar.radius));
  const centerY = Math.max(bar.y + bar.radius, Math.min(pointY, bar.y + bar.height - bar.radius));
  const deltaX = pointX - centerX;
  const deltaY = pointY - centerY;
  return deltaX * deltaX + deltaY * deltaY <= bar.radius * bar.radius;
}

function expectedPixel(spec, x, y) {
  const bar = spec.bars.find((candidate) => roundedRectangleContains(candidate, x, y));
  if (bar) {
    return bar.color;
  }
  return spec.background ?? [0, 0, 0, 0];
}

function assertExactPixels(image, spec) {
  assert.equal(image.width, spec.width);
  assert.equal(image.height, spec.height);

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const expected = expectedPixel(spec, x, y);
      const actual = pixelAt(image, x, y);
      assert.deepEqual(actual, expected, `${spec.file} pixel ${x},${y} drifted`);

      if (spec.opaque) {
        assert.equal(actual[3], 0xFF, `${spec.file} must remain opaque`);
      }

      if (spec.safeZone && expected !== spec.background && actual[3] !== 0) {
        assert.ok(
          x >= spec.safeZone.minimum
            && x < spec.safeZone.maximum
            && y >= spec.safeZone.minimum
            && y < spec.safeZone.maximum,
          `${spec.file} contains a non-transparent pixel outside its safe zone at ${x},${y}`,
        );
      }
    }
  }
}

test("pins pngjs 7.0.0 as the generator's direct, official dev dependency", () => {
  const packageJson = JSON.parse(readFileSync(path.join(projectRoot, "package.json"), "utf8"));
  assert.equal(packageJson.devDependencies.pngjs, "7.0.0");

  const installed = JSON.parse(readFileSync(require.resolve("pngjs/package.json"), "utf8"));
  assert.equal(installed.version, "7.0.0");
  assert.equal(installed.repository?.url, "git://github.com/pngjs/pngjs.git");
  assert.equal(installed.scripts?.postinstall, undefined);
  assert.equal(
    require.resolve("pngjs"),
    path.join(projectRoot, "node_modules", "pngjs", "lib", "png.js"),
  );
  assert.deepEqual(PNGJS_SUPPLY_CHAIN_RECORD, {
    package: "pngjs",
    version: "7.0.0",
    repository: "github.com/pngjs/pngjs",
    stability: "stable since 2023",
    weeklyDownloads: "about 57.97M",
    postinstall: false,
  });
});

test("renders the exact deterministic Concept G pixel contract from the sole generator", () => {
  assert.deepEqual(Object.keys(CONCEPT_G_ASSETS), Object.keys(EXPECTED_ASSETS));

  for (const [assetName, expected] of Object.entries(EXPECTED_ASSETS)) {
    const first = renderConceptGAsset(assetName);
    const second = renderConceptGAsset(assetName);
    assert.deepEqual(first, second, `${assetName} must be byte-identical on repeated render`);
    assertExactPixels(PNG.sync.read(first), expected);
  }
});

test("writes all configured app assets deterministically and retains stable Expo paths", () => {
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "gym-tracker-concept-g-"));
  try {
    const first = generateConceptGAssets({ outputDirectory: temporaryDirectory });
    const firstBytes = Object.fromEntries(
      Object.entries(first).map(([assetName, outputPath]) => [assetName, readFileSync(outputPath)]),
    );
    const second = generateConceptGAssets({ outputDirectory: temporaryDirectory });

    for (const [assetName, outputPath] of Object.entries(second)) {
      assert.deepEqual(readFileSync(outputPath), firstBytes[assetName]);
    }

    assert.deepEqual(
      checkConceptGAssets({ outputDirectory: temporaryDirectory }),
      { matches: true, mismatches: [] },
    );

    const config = readFileSync(path.join(projectRoot, "app.config.ts"), "utf8");
    assert.match(config, /icon: '\.\/assets\/images\/icon\.png'/u);
    assert.match(config, /foregroundImage: '\.\/assets\/images\/android-icon-foreground\.png'/u);
    assert.match(config, /backgroundImage: '\.\/assets\/images\/android-icon-background\.png'/u);
    assert.match(config, /monochromeImage: '\.\/assets\/images\/android-icon-monochrome\.png'/u);
    assert.match(config, /image: '\.\/assets\/images\/splash-icon\.png'/u);
    assert.match(config, /backgroundColor: '#F6F8FB'/u);
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
});

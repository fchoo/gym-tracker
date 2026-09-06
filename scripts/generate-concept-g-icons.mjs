import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import { PNG } from "pngjs";

const projectRoot = path.resolve(import.meta.dirname, "..");

// Reviewed before the exact direct devDependency was installed: the official
// github.com/pngjs/pngjs package is stable (2023), reported about 57.97M
// weekly downloads, and exposes no postinstall script. This generator imports
// only the direct pinned copy below; it never resolves Expo's nested pngjs.
export const PNGJS_SUPPLY_CHAIN_RECORD = Object.freeze({
  package: "pngjs",
  version: "7.0.0",
  repository: "github.com/pngjs/pngjs",
  stability: "stable since 2023",
  weeklyDownloads: "about 57.97M",
  postinstall: false,
});

const PALETTE = Object.freeze({
  background: Object.freeze([0xF6, 0xF8, 0xFB, 0xFF]),
  deep: Object.freeze([0x0B, 0x3A, 0x75, 0xFF]),
  action: Object.freeze([0x15, 0x5E, 0xEF, 0xFF]),
  light: Object.freeze([0x70, 0xA0, 0xFF, 0xFF]),
  monochrome: Object.freeze([0x00, 0x00, 0x00, 0xFF]),
});

// All output variants are rasterized from this one 256 px Concept G geometry.
// The ascending shape, not colour, communicates progression.
const CANONICAL_MARK = Object.freeze({
  size: 256,
  baseline: 256,
  radius: 14,
  bars: Object.freeze([
    Object.freeze({ x: 0, height: 112, color: PALETTE.deep }),
    Object.freeze({ x: 96, height: 176, color: PALETTE.action }),
    Object.freeze({ x: 192, height: 240, color: PALETTE.light }),
  ]),
});

export const CONCEPT_G_ASSETS = Object.freeze({
  icon: Object.freeze({
    file: "icon.png",
    width: 1024,
    height: 1024,
    originX: 256,
    originY: 256,
    scale: 2,
    background: PALETTE.background,
  }),
  androidBackground: Object.freeze({
    file: "android-icon-background.png",
    width: 512,
    height: 512,
    background: PALETTE.background,
    renderMark: false,
  }),
  androidForeground: Object.freeze({
    file: "android-icon-foreground.png",
    width: 512,
    height: 512,
    originX: 128,
    originY: 128,
    scale: 1,
  }),
  androidMonochrome: Object.freeze({
    file: "android-icon-monochrome.png",
    width: 432,
    height: 432,
    originX: 108,
    originY: 108,
    scale: 216 / CANONICAL_MARK.size,
    monochrome: true,
  }),
  splash: Object.freeze({
    file: "splash-icon.png",
    width: 228,
    height: 213,
    originX: 46,
    originY: 34,
    scale: 34 / 64,
  }),
});

function scaledBoundary(origin, value, scale) {
  return Math.floor(origin + value * scale);
}

function materializeBars(asset) {
  if (asset.renderMark === false) {
    return [];
  }

  return CANONICAL_MARK.bars.map((bar) => {
    const top = CANONICAL_MARK.baseline - bar.height;
    const left = scaledBoundary(asset.originX, bar.x, asset.scale);
    const right = scaledBoundary(asset.originX, bar.x + 64, asset.scale);
    const topEdge = scaledBoundary(asset.originY, top, asset.scale);
    const bottom = scaledBoundary(asset.originY, CANONICAL_MARK.baseline, asset.scale);

    return {
      x: left,
      y: topEdge,
      width: right - left,
      height: bottom - topEdge,
      radius: Math.ceil(CANONICAL_MARK.radius * asset.scale),
      color: asset.monochrome ? PALETTE.monochrome : bar.color,
    };
  });
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

function writePixel(image, x, y, color) {
  const offset = (y * image.width + x) * 4;
  image.data[offset] = color[0];
  image.data[offset + 1] = color[1];
  image.data[offset + 2] = color[2];
  image.data[offset + 3] = color[3];
}

function fill(image, color) {
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      writePixel(image, x, y, color);
    }
  }
}

function drawBar(image, bar) {
  for (let y = bar.y; y < bar.y + bar.height; y += 1) {
    for (let x = bar.x; x < bar.x + bar.width; x += 1) {
      if (roundedRectangleContains(bar, x, y)) {
        writePixel(image, x, y, bar.color);
      }
    }
  }
}

function resolveAsset(assetName) {
  const asset = CONCEPT_G_ASSETS[assetName];
  if (!asset) {
    throw new Error("Unknown Concept G asset: " + assetName);
  }
  return asset;
}

export function renderConceptGAsset(assetName) {
  const asset = resolveAsset(assetName);
  const image = new PNG({ width: asset.width, height: asset.height, fill: true });

  if (asset.background) {
    fill(image, asset.background);
  }

  for (const bar of materializeBars(asset)) {
    drawBar(image, bar);
  }

  return PNG.sync.write(image, {
    bitDepth: 8,
    colorType: 6,
    filterType: 0,
    deflateLevel: 9,
    deflateStrategy: 3,
    inputHasAlpha: true,
  });
}

function outputPathFor(outputDirectory, asset) {
  return path.join(outputDirectory, asset.file);
}

export function generateConceptGAssets({
  outputDirectory = path.join(projectRoot, "assets", "images"),
} = {}) {
  const outputs = {};

  for (const assetName of Object.keys(CONCEPT_G_ASSETS)) {
    const asset = CONCEPT_G_ASSETS[assetName];
    const outputPath = outputPathFor(outputDirectory, asset);
    writeFileSync(outputPath, renderConceptGAsset(assetName));
    outputs[assetName] = outputPath;
  }

  return outputs;
}

export function checkConceptGAssets({
  outputDirectory = path.join(projectRoot, "assets", "images"),
} = {}) {
  const mismatches = [];

  for (const assetName of Object.keys(CONCEPT_G_ASSETS)) {
    const asset = CONCEPT_G_ASSETS[assetName];
    const outputPath = outputPathFor(outputDirectory, asset);
    const expected = renderConceptGAsset(assetName);
    if (!existsSync(outputPath) || !readFileSync(outputPath).equals(expected)) {
      mismatches.push(path.relative(projectRoot, outputPath));
    }
  }

  return { matches: mismatches.length === 0, mismatches };
}

function runCli() {
  const [command] = process.argv.slice(2);
  if (command === undefined) {
    generateConceptGAssets();
    process.stdout.write("generate-concept-g-icons: wrote five deterministic Concept G PNGs.\\n");
    return;
  }

  if (command === "--check") {
    const result = checkConceptGAssets();
    if (!result.matches) {
      process.stderr.write("generate-concept-g-icons: asset drift: " + result.mismatches.join(", ") + "\\n");
      process.exitCode = 1;
      return;
    }
    process.stdout.write("generate-concept-g-icons: all five PNGs match the deterministic renderer.\\n");
    return;
  }

  throw new Error("Unsupported argument: " + command + ". Use --check or no arguments.");
}

if (import.meta.main) {
  runCli();
}

import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import {
  relative,
  resolve,
  sep,
} from "node:path";
import process from "node:process";

const repositoryRoot = process.cwd();
const requestedPaths = process.argv.slice(2);
const sourceRoots = ["app", "src"];
const sourceExtensions = /\.(?:[cm]?[jt]sx?)$/;
const violations = [];

if (requestedPaths[0] === "--missing-suite") {
  const suite = requestedPaths[1] ?? "unknown";
  console.error(`Missing suite: ${suite}. A later plan must implement this required gate.`);
  process.exit(1);
}

function normalizePath(filePath) {
  const absolutePath = resolve(repositoryRoot, filePath);
  const relativePath = relative(repositoryRoot, absolutePath);
  if (!relativePath.startsWith("..")) {
    return relativePath.split(sep).join("/");
  }

  const normalizedAbsolutePath = absolutePath.split(sep).join("/");
  const sourcePath = normalizedAbsolutePath.match(/\/((?:app|src)\/.+)$/)?.[1];
  return sourcePath ?? normalizedAbsolutePath;
}

function collectFiles(path) {
  const absolutePath = resolve(repositoryRoot, path);
  if (!existsSync(absolutePath)) {
    return [];
  }

  if (!statSync(absolutePath).isDirectory()) {
    return sourceExtensions.test(absolutePath) ? [absolutePath] : [];
  }

  return readdirSync(absolutePath, { withFileTypes: true }).flatMap((entry) => {
    if (
      entry.name === "node_modules"
      || entry.name === "android"
      || entry.name === "ios"
      || entry.name === "coverage"
    ) {
      return [];
    }

    return collectFiles(resolve(absolutePath, entry.name));
  });
}

function importedSpecifiers(source) {
  const specifiers = [];
  const importPatterns = [
    /\b(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g,
    /\brequire\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g,
  ];

  for (const pattern of importPatterns) {
    for (const match of source.matchAll(pattern)) {
      specifiers.push(match[1]);
    }
  }

  return specifiers;
}

function domainName(path) {
  return path.match(/^src\/domains\/([^/]+)\//)?.[1];
}

function resolvedImportPath(filePath, specifier) {
  if (specifier.startsWith(".")) {
    return normalizePath(resolve(repositoryRoot, filePath, "..", specifier));
  }
  return specifier;
}

function addViolation(path, rule) {
  violations.push(`${path}: ${rule}`);
}

function scanFile(absolutePath) {
  const path = normalizePath(absolutePath);
  const source = readFileSync(absolutePath, "utf8");
  const imports = importedSpecifiers(source);

  if (/withExclusiveTransactionAsync\s*\(/.test(source)) {
    addViolation(path, "prohibited Expo exclusive helper");
  }

  if (path.startsWith("app/")) {
    if (
      imports.some((specifier) => (
        specifier === "expo-sqlite"
        || specifier.includes("/platform/")
        || specifier.startsWith("../src/platform")
        || specifier.startsWith("@/platform")
      ))
    ) {
      addViolation(path, "route SQL/platform import");
    }

    if (
      /\b(?:exec|execute|prepare|query|run|withTransaction|openDatabase)\w*(?:Async)?\s*\(/.test(source)
      || /\b(?:SELECT|INSERT|UPDATE|DELETE|PRAGMA|BEGIN|COMMIT|ROLLBACK)\b/i.test(source)
    ) {
      addViolation(path, "route SQL execution");
    }
  }

  if (path.startsWith("src/ui/")) {
    if (
      imports.some((specifier) => (
        specifier.includes("/platform/")
        || specifier.startsWith("../platform")
        || specifier.startsWith("../../platform")
        || specifier.startsWith("@/platform")
      ))
    ) {
      addViolation(path, "UI platform import");
    }
  }

  const ownerDomain = domainName(path);
  if (ownerDomain !== undefined) {
    for (const specifier of imports) {
      const importedPath = resolvedImportPath(path, specifier);
      const importedDomain = domainName(importedPath);
      if (
        importedDomain !== undefined
        && importedDomain !== ownerDomain
        && !/\/index(?:\.[cm]?[jt]sx?)?$/.test(importedPath)
        && importedPath !== `src/domains/${importedDomain}`
      ) {
        addViolation(path, "cross-domain internal import");
      }
    }
  }

  if (!path.startsWith("src/platform/sqlite/")) {
    if (
      imports.some((specifier) => (
        /(?:serializedWriter|rawWriter|connection)(?:\.[cm]?[jt]s)?$/.test(specifier)
        || specifier.includes("/platform/sqlite/serializedWriter")
        || specifier.includes("/platform/sqlite/connection")
      ))
    ) {
      addViolation(path, "raw writer import");
    }
  }
}

const scanPaths = requestedPaths.length > 0
  ? requestedPaths
  : sourceRoots.filter((path) => existsSync(resolve(repositoryRoot, path)));
const files = [...new Set(scanPaths.flatMap(collectFiles))]
  .filter((file) => (
    requestedPaths.length > 0
    || !/\.test\.[cm]?[jt]sx?$/.test(file)
  ))
  .sort();

for (const file of files) {
  scanFile(file);
}

if (violations.length > 0) {
  for (const violation of violations) {
    console.error(violation);
  }
  process.exit(1);
}

console.log(`Boundary check passed (${files.length} files).`);

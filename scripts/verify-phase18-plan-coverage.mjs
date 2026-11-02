import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const PHASE = "18-garmin-import";
const PHASE_DIRECTORY = ".planning/phases/18-garmin-import";

export const EXPECTED_REQUIREMENTS = Object.freeze(
  Array.from({ length: 16 }, (_, index) => `GAR-${String(index + 1).padStart(2, "0")}`),
);

export const EXPECTED_DECISIONS = Object.freeze(
  Array.from({ length: 12 }, (_, index) => `D-18-${String(index + 1).padStart(2, "0")}`),
);

export const EXPECTED_PLAN_MANIFEST = Object.freeze({
  "18-01": Object.freeze({ wave: 1, dependsOn: Object.freeze([]) }),
  "18-02": Object.freeze({ wave: 2, dependsOn: Object.freeze(["18-01"]) }),
  "18-03": Object.freeze({ wave: 3, dependsOn: Object.freeze(["18-02"]) }),
  "18-04": Object.freeze({ wave: 4, dependsOn: Object.freeze(["18-03"]) }),
  "18-05": Object.freeze({ wave: 5, dependsOn: Object.freeze(["18-04"]) }),
  "18-06": Object.freeze({ wave: 6, dependsOn: Object.freeze(["18-05"]) }),
  "18-07": Object.freeze({ wave: 6, dependsOn: Object.freeze(["18-04", "18-05"]) }),
  "18-08": Object.freeze({ wave: 7, dependsOn: Object.freeze(["18-07"]) }),
  "18-09": Object.freeze({ wave: 7, dependsOn: Object.freeze(["18-07"]) }),
  "18-10": Object.freeze({ wave: 8, dependsOn: Object.freeze(["18-06", "18-07", "18-08"]) }),
  "18-11": Object.freeze({ wave: 8, dependsOn: Object.freeze(["18-07", "18-09"]) }),
  "18-12": Object.freeze({ wave: 9, dependsOn: Object.freeze(["18-08", "18-09", "18-10", "18-11"]) }),
  "18-13": Object.freeze({ wave: 10, dependsOn: Object.freeze(["18-12"]) }),
  "18-14": Object.freeze({ wave: 11, dependsOn: Object.freeze(["18-08", "18-09", "18-10", "18-13"]) }),
});

const SOURCE_FILES = Object.freeze([
  `${PHASE_DIRECTORY}/18-CONTEXT.md`,
  `${PHASE_DIRECTORY}/18-RESEARCH.md`,
  `${PHASE_DIRECTORY}/18-COVERAGE.md`,
  ".planning/architecture/v1.2-garmin-import.md",
]);

const SELECTED_TRANSPORT_FACTS = Object.freeze([
  "modules/garmin-connect",
  "src/platform/garmin/garminActivityAdapter.ts",
  "Python 3.13",
  "Chaquopy 17.0",
  "python-garminconnect 0.3.17",
  "218e72ca5459e014435fc2d94fd18bd601fa0c14",
  "ARM64",
  "curl_cffi-0.15.0-cp313-abi3-android_24_arm64_v8a.whl",
  "4682dc38d4336e0eb0b185374db90a760efde63cbea994b4e63f3521d44c4c92",
  "GarminActivitySourcePort",
  "GarminConnectionState",
  "GarminSourceEnvelope",
  "get_activities",
  "get_activity",
  "get_activity_splits",
  "get_activity_details",
  "maxchart=2000",
  "maxpoly=4000",
  "prepareGarminImport",
  "confirmGarminImportDate",
  "garmin_connect_account",
  "normalized_json_sha256",
  "raw_component_sha256",
  "sample_fidelity",
  "source_laps",
  "source_summary",
  "elapsed",
  "timer",
  "moving",
  "Lap, Time, Pace",
  "TECHNICAL_REVIEW_REQUIRED",
]);

const FORBIDDEN_EXECUTABLE_FAMILIES = Object.freeze([
  Object.freeze({
    family: "manual-file",
    pattern: /\b(?:manual(?:ly)?[- ](?:fit|file)|fit[- ](?:decoder|decoding|import)|original[- ]file (?:decoder|import))\b/iu,
  }),
  Object.freeze({
    family: "official-provider",
    pattern: /\b(?:official (?:garmin )?(?:activity )?api|partner (?:garmin )?(?:activity )?api|official provider api|garmin developer program integration)\b/iu,
  }),
  Object.freeze({
    family: "broker",
    pattern: /\b(?:oauth|api|garmin)?[- ]?broker\b/iu,
  }),
  Object.freeze({
    family: "desktop-bridge",
    pattern: /\b(?:desktop(?: helper)?|drive(?: inbox)?).{0,32}\b(?:bridge|transport|helper|inbox)\b|\b(?:bridge|transport).{0,32}\b(?:desktop|drive)\b/iu,
  }),
  Object.freeze({
    family: "generic-bridge",
    pattern: /\bgeneric (?:native )?bridge\b|\barbitrary (?:url|method|endpoint)(?: name)? forwarding\b/iu,
  }),
  Object.freeze({
    family: "runtime-agent",
    pattern: /\b(?:runtime|dynamic) (?:ai )?agents?\b/iu,
  }),
  Object.freeze({
    family: "server",
    pattern: /\b(?:local http|development|metro|python) server\b|\bpython subprocess\b/iu,
  }),
  Object.freeze({
    family: "installer",
    pattern: /\bon-device pip\b|\bpip install\b|\bpython (?:installation|installer)\b|\bdownloaded scripts?\b/iu,
  }),
  Object.freeze({
    family: "js-engine",
    pattern: /\b(?:javascript|js) engine (?:change|switch|replacement)\b|\b(?:change|switch|replace).{0,48}\bhermes\b|\bhermes (?:change|switch|replacement)\b/iu,
  }),
]);

function invariant(condition, message) {
  if (!condition) throw new Error(`phase18_plan_coverage_failed: ${message}`);
}

function frontmatter(source, fileName) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u);
  invariant(match !== null, `${fileName} has no frontmatter`);
  return match[1];
}

function scalarField(source, field, fileName) {
  const match = source.match(new RegExp(`^${field}:\\s*["']?([^\\n"']+)["']?\\s*$`, "mu"));
  invariant(match !== null, `${fileName} is missing ${field}`);
  return match[1].trim();
}

function arrayField(source, field, fileName) {
  const match = source.match(new RegExp(`^${field}:\\s*\\[([^\\]]*)\\]\\s*$`, "mu"));
  invariant(match !== null, `${fileName} is missing ${field}`);
  const values = match[1].split(",").map((value) => value.trim()).filter(Boolean);
  return values;
}

function filesModified(source, fileName) {
  const match = source.match(/^files_modified:\s*\r?\n((?:\s{2}-\s+[^\n]+\r?\n?)+)/mu);
  invariant(match !== null, `${fileName} has no files_modified entries`);
  return Array.from(match[1].matchAll(/^\s{2}-\s+(.+)$/gmu), (entry) => entry[1].trim());
}

function taskBlocks(source) {
  return Array.from(source.matchAll(/<task\b([^>]*)>([\s\S]*?)<\/task>/gu), (match) => ({
    attributes: match[1],
    body: match[2],
    type: match[1].match(/\btype="([^"]+)"/u)?.[1] ?? "",
  }));
}

function concretePath(path) {
  return path.length > 0
    && !path.includes("*")
    && !path.includes("...")
    && !path.includes("path/to/")
    && !/[<>]/u.test(path);
}

function explicitExclusion(sentence) {
  return /\b(?:do not|does not|must not|never|without|outside|excluded?|forbidden|prohibited|reject(?:s|ed)?|no)\b/iu.test(sentence);
}

export function findExecutableExclusionViolations(source) {
  const actionable = taskBlocks(source).length === 0
    ? source
    : taskBlocks(source)
      .filter(({ type }) => type === "auto" || type === "tracer")
      .map(({ body }) => body)
      .join("\n");
  const sentences = actionable
    .replaceAll(/<\/?(?:action|behavior|files|done|verify|automated)>/gu, " ")
    .split(/[.!?;]+/u)
    .map((sentence) => sentence.replaceAll(/\s+/gu, " ").trim())
    .filter(Boolean);
  const violations = [];
  for (const sentence of sentences) {
    if (explicitExclusion(sentence)) continue;
    for (const { family, pattern } of FORBIDDEN_EXECUTABLE_FAMILIES) {
      if (pattern.test(sentence)) violations.push(Object.freeze({ family, sentence }));
    }
  }
  return violations;
}

function validateExecutableTasks(source, fileName) {
  const executableTasks = taskBlocks(source).filter(
    ({ type }) => type === "auto" || type === "tracer",
  );
  invariant(executableTasks.length > 0, `${fileName} has no executable task`);
  for (const [index, task] of executableTasks.entries()) {
    const taskLabel = `${fileName} task ${index + 1}`;
    const files = task.body.match(/<files>([\s\S]*?)<\/files>/u)?.[1]
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean) ?? [];
    invariant(files.length > 0, `${taskLabel} has no files`);
    invariant(files.every(concretePath), `${taskLabel} has a non-concrete path`);
    const automated = task.body.match(/<verify>[\s\S]*?<automated>([\s\S]*?)<\/automated>[\s\S]*?<\/verify>/u)?.[1].trim();
    invariant(automated !== undefined && automated.length > 0, `${taskLabel} has no automated verify`);
  }
  return executableTasks.length;
}

async function readRequired(root, relativePath) {
  try {
    return await readFile(resolve(root, relativePath), "utf8");
  } catch (error) {
    throw new Error(`phase18_plan_coverage_failed: cannot read ${relativePath}`, { cause: error });
  }
}

export async function verifyPhase18PlanCoverage(projectRoot = process.cwd()) {
  const expectedPlanIds = Object.keys(EXPECTED_PLAN_MANIFEST);
  const phasePath = resolve(projectRoot, PHASE_DIRECTORY);
  const planFiles = (await readdir(phasePath))
    .filter((name) => /^18-\d{2}-PLAN\.md$/u.test(name))
    .sort();
  invariant(
    JSON.stringify(planFiles) === JSON.stringify(expectedPlanIds.map((id) => `${id}-PLAN.md`)),
    `expected exactly ${expectedPlanIds.length} ordered plan files`,
  );

  const planSources = new Map();
  const requirementCoverage = new Set();
  let executableTaskCount = 0;
  for (const planId of expectedPlanIds) {
    const fileName = `${planId}-PLAN.md`;
    const source = await readRequired(projectRoot, `${PHASE_DIRECTORY}/${fileName}`);
    const metadata = frontmatter(source, fileName);
    const expected = EXPECTED_PLAN_MANIFEST[planId];
    invariant(scalarField(metadata, "phase", fileName) === PHASE, `${fileName} has the wrong phase`);
    invariant(scalarField(metadata, "plan", fileName).padStart(2, "0") === planId.slice(3), `${fileName} has the wrong plan number`);
    invariant(scalarField(metadata, "type", fileName) === "execute", `${fileName} is not executable`);
    invariant(Number(scalarField(metadata, "wave", fileName)) === expected.wave, `${fileName} has the wrong wave`);
    const dependsOn = arrayField(metadata, "depends_on", fileName);
    invariant(JSON.stringify(dependsOn) === JSON.stringify(expected.dependsOn), `${fileName} has the wrong dependencies`);
    invariant(filesModified(metadata, fileName).every(concretePath), `${fileName} has a non-concrete files_modified path`);
    for (const requirement of arrayField(metadata, "requirements", fileName)) {
      requirementCoverage.add(requirement);
    }
    executableTaskCount += validateExecutableTasks(source, fileName);
    planSources.set(planId, source);
  }

  const requirements = [...requirementCoverage].sort();
  invariant(JSON.stringify(requirements) === JSON.stringify(EXPECTED_REQUIREMENTS), "GAR-01..GAR-16 plan coverage is incomplete");
  const planBundle = [...planSources.values()].join("\n");
  const decisions = EXPECTED_DECISIONS.filter((decision) => planBundle.includes(decision));
  invariant(JSON.stringify(decisions) === JSON.stringify(EXPECTED_DECISIONS), "D-18-01..D-18-12 plan citations are incomplete");

  const sourceEntries = await Promise.all(SOURCE_FILES.map(async (path) => [path, await readRequired(projectRoot, path)]));
  const sourceBundle = sourceEntries.map(([, source]) => source).join("\n");
  const coverageSource = sourceEntries.find(([path]) => path.endsWith("18-COVERAGE.md"))?.[1] ?? "";
  const coverageRows = Array.from(coverageSource.matchAll(/^\|\s+(GAR-\d{2})\s+\|\s+([^|]+)\|/gmu));
  invariant(coverageRows.length === EXPECTED_REQUIREMENTS.length, "18-COVERAGE.md must contain exactly 16 GAR rows");
  invariant(
    JSON.stringify(coverageRows.map((match) => match[1])) === JSON.stringify(EXPECTED_REQUIREMENTS),
    "18-COVERAGE.md GAR rows are missing or out of order",
  );
  for (const [, requirement, owners] of coverageRows) {
    invariant(owners.split(",").map((value) => value.trim()).every((owner) => expectedPlanIds.includes(owner)), `${requirement} names an unknown primary plan`);
  }

  for (const fact of SELECTED_TRANSPORT_FACTS) {
    invariant(sourceBundle.includes(fact), `selected transport fact is missing: ${fact}`);
  }

  const executableExclusionViolations = [...planSources.entries()].flatMap(([planId, source]) =>
    findExecutableExclusionViolations(source).map((violation) => ({ planId, ...violation }))
  );
  invariant(executableExclusionViolations.length === 0, `stale executable architecture found in ${executableExclusionViolations[0]?.planId ?? "unknown plan"}`);

  return Object.freeze({
    planCount: expectedPlanIds.length,
    plans: Object.freeze([...expectedPlanIds]),
    requirements: Object.freeze(requirements),
    decisions: Object.freeze(decisions),
    executableTaskCount,
    transportFactCount: SELECTED_TRANSPORT_FACTS.length,
    executableExclusionViolations: Object.freeze(executableExclusionViolations),
  });
}

const invokedPath = process.argv[1] === undefined ? null : pathToFileURL(resolve(process.argv[1])).href;
if (invokedPath === import.meta.url) {
  verifyPhase18PlanCoverage().then((report) => {
    process.stdout.write(
      `Phase 18 source audit passed: ${report.planCount} plans, ${report.requirements.length} requirements, ${report.decisions.length} decisions, ${report.executableTaskCount} executable tasks, ${report.transportFactCount} selected transport facts.\n`,
    );
  }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

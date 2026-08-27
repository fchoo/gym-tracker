#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  createReadStream,
  existsSync,
} from 'node:fs';
import {
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import {
  parseNativeContractLogFailure,
  parseNativeContractLogOutput,
  parseNativeContractLogProgress,
} from './native-contract-log-transport.mjs';

const PHASE2_AGGREGATE_TIMEOUT_MS = 300_000;
const PHASE2_CASE_TIMEOUT_MS = 10_000;
const PHASE2_PROGRESS_STALL_TIMEOUT_MS = 90_000;
const DEFAULT_NATIVE_TIMEOUT_MS = 90_000;
export const NATIVE_ADB_LOGCAT_TIMEOUT_MS = 15_000;
const projectRoot = process.cwd();
const argumentsList = process.argv.slice(2);
let manifestArgument = '';
let requestedSuite = '';
let legacyExpectedCount;

function fail(message) {
  emitFailure(message);
  process.exit(1);
}

function emitFailure(message) {
  console.error(
    JSON.stringify({
      ok: false,
      error: 'native_sqlite_contract_runner_failed',
      message,
    }),
  );
}

for (let index = 0; index < argumentsList.length; index += 1) {
  const argument = argumentsList[index];
  if (argument === '--manifest') {
    manifestArgument = argumentsList[index + 1] ?? '';
    index += 1;
  } else if (argument.startsWith('--manifest=')) {
    manifestArgument = argument.slice('--manifest='.length);
  } else if (argument === '--suite') {
    requestedSuite = argumentsList[index + 1] ?? '';
    index += 1;
  } else if (argument.startsWith('--suite=')) {
    requestedSuite = argument.slice('--suite='.length);
  } else if (argument.startsWith('--assert-all=')) {
    legacyExpectedCount = Number(argument.slice('--assert-all='.length));
  } else {
    fail(`unknown argument: ${argument}`);
  }
}

if (!manifestArgument) {
  fail('--manifest is required.');
}
if (
  legacyExpectedCount !== undefined
  && (
    !Number.isInteger(legacyExpectedCount)
    || legacyExpectedCount < 1
    || legacyExpectedCount > 100
  )
) {
  fail('--assert-all must be an integer between 1 and 100.');
}

const manifestPath = path.resolve(projectRoot, manifestArgument);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const suite = requestedSuite || manifest.suite;

async function deriveCaseIds(fileName, exportName) {
  const source = await readFile(
    path.join(projectRoot, 'src/testing/contracts', fileName),
    'utf8',
  );
  const caseBlock = source.match(
    new RegExp(
      `export const ${exportName} = \\[([\\s\\S]*?)\\] as const;`,
      'u',
    ),
  )?.[1] ?? '';
  const caseIds = [
    ...caseBlock.matchAll(/"([a-z0-9-]+)"/gu),
  ].map((match) => match[1]);
  if (caseIds.length < 1 || new Set(caseIds).size !== caseIds.length) {
    fail(`${exportName} could not be derived from source.`);
  }
  return caseIds;
}

const PHASE2_CONTENT_CASE_IDS = await deriveCaseIds(
  'phase2Content.contract.ts',
  'PHASE2_CONTENT_CASE_IDS',
);
const SQLITE_KERNEL_CASE_IDS = await deriveCaseIds(
  'sqliteKernel.contract.ts',
  'SQLITE_KERNEL_CONTRACT_CASES',
);
const MIGRATIONS_EFFECTS_CASE_IDS = await deriveCaseIds(
  'migrationsEffects.contract.ts',
  'MIGRATIONS_EFFECTS_CONTRACT_CASES',
);
const PHASE2_FTS_CASE_IDS = await deriveCaseIds(
  'phase2Fts.contract.ts',
  'PHASE2_FTS_CASE_IDS',
);
const PHASE2_METRICS_CASE_IDS = await deriveCaseIds(
  'phase2Metrics.contract.ts',
  'PHASE2_METRICS_CASE_IDS',
);
const PHASE2_PLAN_CASE_IDS = await deriveCaseIds(
  'phase2Plan.contract.ts',
  'PHASE2_PLAN_CASE_IDS',
);
const PHASE2_SCHEDULE_CASE_IDS = await deriveCaseIds(
  'phase2Schedule.contract.ts',
  'PHASE2_SCHEDULE_CASE_IDS',
);
const PHASE2_SEARCH_CASE_IDS = await deriveCaseIds(
  'phase2Search.contract.ts',
  'PHASE2_SEARCH_CASE_IDS',
);
const PHASE2_STARTER_CASE_IDS = await deriveCaseIds(
  'phase2Starter.contract.ts',
  'PHASE2_STARTER_CASE_IDS',
);
const PHASE2_CASE_IDS = [
  ...PHASE2_CONTENT_CASE_IDS,
  ...PHASE2_SEARCH_CASE_IDS,
  ...PHASE2_METRICS_CASE_IDS,
  ...PHASE2_STARTER_CASE_IDS,
  ...PHASE2_PLAN_CASE_IDS,
  ...PHASE2_SCHEDULE_CASE_IDS,
];
const PHASE2_AGGREGATE_CASE_IDS = [
  ...SQLITE_KERNEL_CASE_IDS,
  ...MIGRATIONS_EFFECTS_CASE_IDS,
  ...PHASE2_FTS_CASE_IDS,
  ...PHASE2_CASE_IDS,
];
if (
  new Set(PHASE2_AGGREGATE_CASE_IDS).size
    !== PHASE2_AGGREGATE_CASE_IDS.length
) {
  fail('PHASE2_AGGREGATE_CASE_IDS contains duplicate source-owned case IDs.');
}
const supportedSuiteCases = {
  'sqlite-kernel': SQLITE_KERNEL_CASE_IDS,
  'migrations-effects': MIGRATIONS_EFFECTS_CASE_IDS,
  'phase2': PHASE2_AGGREGATE_CASE_IDS,
  'phase2-content': PHASE2_CONTENT_CASE_IDS,
  'phase2-fts': PHASE2_FTS_CASE_IDS,
  'phase2-metrics': PHASE2_METRICS_CASE_IDS,
  'phase2-plan': PHASE2_PLAN_CASE_IDS,
  'phase2-schedule': PHASE2_SCHEDULE_CASE_IDS,
  'phase2-search': PHASE2_SEARCH_CASE_IDS,
  'phase2-starter': PHASE2_STARTER_CASE_IDS,
};
if (!(suite in supportedSuiteCases)) {
  fail(`unsupported native contract suite: ${suite}`);
}
const expectedPhase2Cases = supportedSuiteCases[suite];
const expectedCount = expectedPhase2Cases.length;
const resultPath = path.join(path.dirname(manifestPath), 'result.json');
const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'gym-native-contracts-'));
const installedApkCopy = path.join(temporaryDirectory, 'installed.apk');

function command(name, args, options = {}) {
  const child = spawn(name, args, {
    cwd: projectRoot,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timeout = options.timeoutMs === undefined
      ? undefined
      : setTimeout(() => {
          if (settled) {
            return;
          }
          settled = true;
          child.kill('SIGKILL');
          reject(new Error(
            `${name} timed out after ${options.timeoutMs} ms: ${args.join(' ')}`,
          ));
        }, options.timeoutMs);
    child.stdout?.on('data', (chunk) => {
      stdout += chunk;
      options.onOutput?.(chunk.toString('utf8'));
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk;
      options.onOutput?.(chunk.toString('utf8'));
    });
    child.on('error', (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`${name} exited ${code}: ${stderr || stdout}`));
      }
    });
  });
}

async function sha256(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}

function adb(...args) {
  return command('adb', ['-s', manifest.device.serial, ...args]);
}

function exactKeys(input, expected) {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return false;
  }
  const actual = Object.keys(input).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length
    && actual.every((key, index) => key === wanted[index]);
}

function assertPhase2ContractResult(input, expectedCaseIds, errorCode) {
  const cases = Array.isArray(input?.cases) ? input.cases : [];
  const validCases = cases.length === expectedCaseIds.length
    && cases.every((contractCase, index) => (
      exactKeys(contractCase, ['id', 'status', 'durationMs'])
      && contractCase?.id === expectedCaseIds[index]
      && contractCase?.status === 'passed'
      && typeof contractCase?.durationMs === 'number'
      && contractCase.durationMs >= 0
    ));
  if (
    !exactKeys(input, [
      'schemaVersion',
      'contractVersion',
      'status',
      'total',
      'passed',
      'failed',
      'skipped',
      'cases',
      'startedAt',
      'finishedAt',
    ])
    || input?.schemaVersion !== 1
    || input?.contractVersion !== 1
    || input?.status !== 'passed'
    || input?.total !== expectedCaseIds.length
    || input?.passed !== expectedCaseIds.length
    || input?.failed !== 0
    || input?.skipped !== 0
    || !validCases
    || typeof input?.startedAt !== 'string'
    || Number.isNaN(Date.parse(input.startedAt))
    || typeof input?.finishedAt !== 'string'
    || Number.isNaN(Date.parse(input.finishedAt))
  ) {
    throw new Error(errorCode);
  }
}

function assertPhase2FtsContractResult(input) {
  assertPhase2ContractResult(
    input,
    PHASE2_FTS_CASE_IDS,
    'phase2_fts_contract_result_invalid',
  );
}

async function dumpResult(runId) {
  const timeoutMs = suite === 'phase2'
    ? Math.max(
        PHASE2_AGGREGATE_TIMEOUT_MS,
        DEFAULT_NATIVE_TIMEOUT_MS
          + expectedPhase2Cases.length * PHASE2_CASE_TIMEOUT_MS,
      )
    : DEFAULT_NATIVE_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;
  let progressStage;
  let progressObservedAt = Date.now();
  while (Date.now() < deadline) {
    const remainingMs = Math.max(1, deadline - Date.now());
    const output = await command(
      'adb',
      [
        '-s',
        manifest.device.serial,
        'logcat',
        '-d',
        '-v',
        'raw',
        'ReactNativeJS:I',
        '*:S',
      ],
      {
        timeoutMs: Math.min(NATIVE_ADB_LOGCAT_TIMEOUT_MS, remainingMs),
      },
    );
    const failure = parseNativeContractLogFailure(output, runId);
    if (failure !== undefined) {
      throw new Error(`Native contract route failed: ${failure}`);
    }
    const progress = parseNativeContractLogProgress(output, runId);
    if (progress !== undefined && progress !== progressStage) {
      progressStage = progress;
      progressObservedAt = Date.now();
    }
    if (
      suite === 'phase2'
      && progressStage !== undefined
      && Date.now() - progressObservedAt >= PHASE2_PROGRESS_STALL_TIMEOUT_MS
    ) {
      throw new Error(`Native contract aggregate stalled: ${progressStage}`);
    }
    const result = parseNativeContractLogOutput(output, runId);
    if (result !== undefined) {
      return result;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    `Native contract result was not logged within ${timeoutMs} ms.`,
  );
}

try {
  if (
    manifest.schema_version !== 1
    || manifest.profile !== 'development-test'
    || manifest.build_variant !== 'release'
    || manifest.js_bundle?.embedded !== true
  ) {
    throw new Error(
      'manifest must be schema v1 embedded release development-test evidence.',
    );
  }
  if (!manifest.device?.serial || !manifest.package || !manifest.apk?.sha256) {
    throw new Error('manifest is missing device, package, or APK identity.');
  }
  if (manifest.suite !== suite) {
    throw new Error('requested suite does not match the build manifest.');
  }
  if (!existsSync(path.resolve(projectRoot, manifest.apk.path))) {
    throw new Error(`retained APK is missing: ${manifest.apk.path}`);
  }

  process.env.PATH = [
    process.env.ANDROID_HOME
      ? path.join(process.env.ANDROID_HOME, 'platform-tools')
      : '/opt/homebrew/share/android-commandlinetools/platform-tools',
    process.env.PATH,
  ].join(path.delimiter);

  const runId = `${suite}-${Date.now()}`;
  const deepLink = `gymtracker-devtest://__native-contracts?runId=${runId}`;
  await adb('logcat', '-c');
  await adb('shell', 'am', 'force-stop', manifest.package);
  await adb(
    'shell',
    'am',
    'start',
    '-W',
    '-a',
    'android.intent.action.VIEW',
    '-d',
    deepLink,
    manifest.package,
  );
  const contractResult = await dumpResult(runId);
  if (suite === 'phase2-fts') {
    assertPhase2FtsContractResult(contractResult);
  } else if (expectedPhase2Cases !== null) {
    assertPhase2ContractResult(
      contractResult,
      expectedPhase2Cases,
      `${suite.replaceAll('-', '_')}_contract_result_invalid`,
    );
  }

  const installedPathOutput = await adb('shell', 'pm', 'path', manifest.package);
  const installedPath = installedPathOutput
    .split(/\r?\n/u)
    .find((line) => line.startsWith('package:'))
    ?.slice('package:'.length);
  if (!installedPath) {
    throw new Error('installed package path is unavailable.');
  }
  await adb('pull', installedPath, installedApkCopy);
  const installedSha256 = await sha256(installedApkCopy);
  const finishedAt = new Date().toISOString();
  const result = {
    schema_version: 1,
    suite,
    status: contractResult.status,
    build_manifest: path.relative(projectRoot, manifestPath),
    base_head: manifest.base_head,
    source_tree_sha256: manifest.source_tree_sha256,
    package: manifest.package,
    apk: manifest.apk,
    installed_apk: {
      device_path: installedPath,
      sha256: installedSha256,
      matches_retained_apk: installedSha256 === manifest.apk.sha256,
    },
    device: manifest.device,
    contract: {
      version: contractResult.contractVersion,
      expected_count: expectedCount,
      total: contractResult.total,
      passed: contractResult.passed,
      failed: contractResult.failed,
      skipped: contractResult.skipped,
      cases: contractResult.cases,
      started_at: contractResult.startedAt,
      finished_at: contractResult.finishedAt,
    },
    runner: {
      run_id: runId,
      started_at: contractResult.startedAt,
      finished_at: finishedAt,
    },
  };

  const temporaryResult = `${resultPath}.tmp`;
  await writeFile(temporaryResult, `${JSON.stringify(result, null, 2)}\n`);
  await rename(temporaryResult, resultPath);

  if (
    result.status !== 'passed'
    || result.contract.total !== expectedCount
    || result.contract.passed !== expectedCount
    || result.contract.failed !== 0
    || result.contract.skipped !== 0
    || !result.installed_apk.matches_retained_apk
  ) {
    throw new Error('native contract result did not satisfy the all-pass gate.');
  }

  console.log(JSON.stringify({
    ok: true,
    result: path.relative(projectRoot, resultPath),
    total: result.contract.total,
    passed: result.contract.passed,
    apk_sha256: result.apk.sha256,
  }));
} catch (error) {
  emitFailure(error.message);
  process.exitCode = 1;
} finally {
  await rm(temporaryDirectory, { force: true, recursive: true });
}

#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  existsSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { link, mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  sourceTreeSha256,
  sourceTreeSha256AtHead,
} from "./source-tree-digest.mjs";
import { validateImplementationIdentity } from "./phase2-evidence-identity.mjs";
import { collectPhase2SourceLedger } from "./phase2-source-ledger.mjs";
import {
  resolvePhase2AttendedPaths,
  resolvePhase2ManifestPath,
  withPhase2EvidenceSealLock,
} from "./phase2-evidence-boundary.mjs";
export { resolvePhase2AttendedPaths } from "./phase2-evidence-boundary.mjs";
import {
  PHASE2_ATTENDED_PREVIEW_REGISTRY,
  PHASE2_ATTENDED_PREVIEW_ROUTES,
} from "../src/testing/phase2AttendedPreviewFixtures.ts";

const projectRoot = process.cwd();
const PACKAGE_NAME = "com.fchoo.gymtracker.devtest";

function previewScenarioForSourceKey(key) {
  const match = /^UI-02-([A-Z0-9]+(?:-[A-Z0-9]+)*)\|([a-z0-9]+(?:-[a-z0-9]+)*)$/u
    .exec(key);
  if (!match) {
    return undefined;
  }
  const scenario = `${match[1].toLowerCase()}-${match[2]}`;
  return Object.hasOwn(PHASE2_ATTENDED_PREVIEW_REGISTRY, scenario)
    ? scenario
    : undefined;
}

function previewUrls(key) {
  const scenario = previewScenarioForSourceKey(key);
  if (scenario === undefined) {
    return [];
  }
  const base = `gymtracker-devtest://__phase2-attended-preview?scenario=${scenario}`;
  return PHASE2_ATTENDED_PREVIEW_ROUTES
    .filter((route) => route.scenario === scenario)
    .map(({ variant }) => variant === null ? base : `${base}&variant=${variant}`);
}

const previewInstructions = Object.freeze({
  "UI-02-ALERT-SETTINGS|loading": Object.freeze({
    action: "Press Appearance and rest-alert settings, then confirm the Loading rest alert settings progress indicator is visible and both preference controls remain stable while the read stays pending.",
  }),
  "UI-02-ALERT-SETTINGS|error": Object.freeze({
    action: "Press Appearance and rest-alert settings, toggle Rest sound once, and wait for the rejected preference write to settle without navigating away during rollback.",
    expected: "Rest sound returns to its persisted value and the alert Rest alert setting was not saved appears without claiming a delivery result.",
  }),
  "UI-02-CALENDAR|zero-one-many": Object.freeze({
    action: "Open the Zero, One, and Many calendar variants in order and use each production calendar control through explicit confirmation or cancellation.",
    substeps: Object.freeze([
      `Zero: open ${previewUrls("UI-02-CALENDAR|zero-one-many")[0]}, verify no day is selected and Confirm is disabled, select an enabled day, then confirm it.`,
      `One: open ${previewUrls("UI-02-CALENDAR|zero-one-many")[1]}, verify exactly its saved civil date is selected, then cancel without changing the value.`,
      `Many: open ${previewUrls("UI-02-CALENDAR|zero-one-many")[2]}, verify multiple in-bound days are enabled while out-of-bound days stay disabled, then select and confirm one enabled day.`,
    ]),
  }),
  "UI-02-GLOBAL-CARD|loading": Object.freeze({
    action: "Inspect the booting Today scene and confirm the loading cards retain final-width geometry without exposing trusted workout actions.",
  }),
  "UI-02-LIBRARY-EXERCISE-CARD|loading": Object.freeze({
    action: "Inspect all exercise-card skeletons and confirm search, filters, and the Exercises section remain stable while results stay pending.",
  }),
  "UI-02-LIBRARY-EXERCISE-CARD|error": Object.freeze({
    action: "Wait for the initial exercise results; enter barbell in Search exercises; press Filter, select Origin: Bundled, and press Show results; press Load more exercises; confirm the page error preserves that query, filter, and current card; then press Retry loading more exercises once.",
  }),
  "UI-02-LIBRARY-EXERCISE-CARD|partial": Object.freeze({
    action: "Press Filter; select Visibility: Unavailable, Visibility: Hidden, and Visibility: Archived; press Show results; inspect the unavailable built-in card and archived hidden custom card; then press Load more exercises, confirm those cards remain with the page-retry notice, and press Retry loading more exercises once.",
  }),
  "UI-02-LIBRARY-PLAN-CARD|loading": Object.freeze({
    action: "Inspect all plan-card skeletons and confirm the selected Plans section and its controls retain stable geometry while loading.",
  }),
  "UI-02-LIBRARY-PLAN-CARD|error": Object.freeze({
    action: "Enter travel in Search plans, select Travel strength draft, press Refresh Library, confirm the refresh error preserves that query, selection, and card, then press Retry Library refresh once and inspect the bounded response.",
  }),
  "UI-02-LIBRARY-PLAN-CARD|partial": Object.freeze({
    action: "Inspect the active plan, draft plan, archived plan, template-update availability, and missing-requirement facts rendered on their flat plan cards and reachable actions.",
  }),
  "UI-02-ROOT-NAV|loading": Object.freeze({
    actionByRole: Object.freeze({
      "emulator-supplementary": "Set the emulator review viewport to 840dp or wider, then confirm all four destinations render in the left rail as disabled 48dp targets with one selected state.",
      "samsung-physical": "At the Samsung native compact viewport, confirm all four destinations render in the bottom tab bar as disabled 48dp targets with one selected state.",
    }),
    expectedByRole: Object.freeze({
      "emulator-supplementary": "At 840dp or wider, the loading shell uses the expanded left rail with four disabled 48dp destinations and one selected state.",
      "samsung-physical": "At the Samsung native compact width, the loading shell uses the bottom tab bar with four disabled 48dp destinations and one selected state.",
    }),
  }),
  "UI-02-SET-MUTATIONS|loading": Object.freeze({
    action: "For each Add warm-up, Copy previous warm-up, Add working set, and completed-set correction variant, start the named mutation once, then verify duplicate activation is unavailable while it remains pending and set cardinality stays unchanged.",
  }),
  "UI-02-TODAYS-PLAN|empty": Object.freeze({
    action: "Inspect the empty overview, confirm No exercises in today's plan is announced, then use the return action without fabricating a row.",
  }),
  "UI-02-TODAYS-PLAN|loading": Object.freeze({
    action: "Inspect the bounded Today's plan loading scene and confirm only stable skeleton geometry appears while content is pending, with no fabricated exercise identity or plan content.",
  }),
  "UI-02-TODAYS-PLAN|zero-one-many": Object.freeze({
    action: "Open the Zero, One, and Many Today's-plan variants in order and complete all three cardinality substeps.",
    substeps: Object.freeze([
      `Zero: open ${previewUrls("UI-02-TODAYS-PLAN|zero-one-many")[0]}, confirm No exercises in today's plan appears, press Return to active workout, and verify Empty workout in progress appears with no fabricated exercise or set row.`,
      `One: open ${previewUrls("UI-02-TODAYS-PLAN|zero-one-many")[1]}, confirm exactly one Back Squat card is Current, open it for review, and verify the active screen remains on Back Squat with two working sets.`,
      `Many: open ${previewUrls("UI-02-TODAYS-PLAN|zero-one-many")[2]}, confirm four ordered cards with completed, current, planned, and skipped states, open Bench Press for review, verify Reviewing another exercise still names Back Squat as current, then press Return to current exercise.`,
    ]),
  }),
});

export const PHASE2_ATTENDED_PREVIEW_SCENARIOS = Object.freeze(
  Object.fromEntries(Object.keys(previewInstructions).map((key) => [
    key,
    previewScenarioForSourceKey(key),
  ])),
);

const surfaceFlow = Object.freeze({
  "UI-02-ALERT-SETTINGS": "maestro/phase2/remediation-rest-alerts.yaml",
  "UI-02-CALENDAR": "maestro/phase2/remediation-inputs-cards-navigation.yaml",
  "UI-02-DURATION": "maestro/phase2/remediation-inputs-cards-navigation.yaml",
  "UI-02-GLOBAL-CARD": "maestro/phase2/remediation-inputs-cards-navigation.yaml",
  "UI-02-LIBRARY-EXERCISE-CARD": "maestro/phase2/library-exercises.yaml",
  "UI-02-LIBRARY-PLAN-CARD": "maestro/phase2/starter-activation.yaml",
  "UI-02-NUMERIC": "maestro/phase2/remediation-inputs-cards-navigation.yaml",
  "UI-02-REST-DOCK": "maestro/phase2/remediation-rest-alerts.yaml",
  "UI-02-ROOT-NAV": "maestro/phase2/remediation-inputs-cards-navigation.yaml",
  "UI-02-SET-CARD": "maestro/phase2/remediation-workout.yaml",
  "UI-02-SET-MUTATIONS": "maestro/phase2/remediation-workout.yaml",
  "UI-02-STICKY-HEADER": "maestro/phase2/remediation-workout.yaml",
  "UI-02-TODAYS-PLAN": "maestro/phase2/remediation-workout.yaml",
});

const caseInstructions = Object.freeze({
  "RC-02-ACTIVE-CORRECTION": Object.freeze({
    flow: "maestro/phase2/remediation-workout.yaml",
    action: "Complete a working set, edit its load and reps while the workout remains in progress, then restart and resume the app.",
    expected: "The corrected values and completed state survive restart without exposing whole-session Undo or changing another set.",
  }),
  "RC-02-ALERT-BG-DELIVERY-NONAUTH": Object.freeze({
    flow: "maestro/phase2/remediation-rest-alerts.yaml",
    action: "Start rest, background the app until expiry, then reopen it and inspect both feedback and the authoritative timer state.",
    expected: "Any observed background alert is bounded feedback only; reopening reconciles SQLite timer truth without claiming delivery authority.",
  }),
  "RC-02-ALERT-FG-ATTEMPT-ONCE": Object.freeze({
    flow: "maestro/phase2/remediation-rest-alerts.yaml",
    action: "Keep the app foregrounded through one rest expiry and listen or feel for the enabled feedback modalities once.",
    expected: "The expiry creates at most one durably claimed foreground feedback attempt and never promises that sound or haptic delivery occurred.",
  }),
  "RC-02-ALERT-PREFERENCES-CHANNEL-NONAUTH": Object.freeze({
    flow: "maestro/phase2/remediation-rest-alerts.yaml",
    action: "Inspect default-on preferences, toggle sound and vibration independently, restart, and run the channel-bound scheduling probe.",
    expected: "Both preferences persist independently while channel or permission outcomes remain bounded and never alter workout facts.",
  }),
  "RC-02-CARDS": Object.freeze({
    flow: "maestro/phase2/remediation-inputs-cards-navigation.yaml",
    action: "Inspect populated, empty, long, partial, and scrolling Library cards in System, Light, and Dark appearance as assigned to this device.",
    expected: "The grey canvas and flat near-black cards remain scannable, unnested, correctly grouped, and keep required actions reachable.",
  }),
  "RC-02-DATE-CALENDAR": Object.freeze({
    flow: "maestro/phase2/remediation-inputs-cards-navigation.yaml",
    action: "Open Start date, inspect disabled bounds and draft selection, change month when allowed, then explicitly confirm or cancel.",
    expected: "Calendar selection preserves civil-date bounds and the caller draft until explicit confirmation, including large-text layout.",
  }),
  "RC-02-DURATION-NUMERIC": Object.freeze({
    flow: "maestro/phase2/remediation-inputs-cards-navigation.yaml",
    action: "Edit duration segments and integer or decimal fields, exercise invalid and intermediate drafts, then confirm and cancel once each.",
    expected: "Drafts retain focus and blank-versus-zero semantics, errors stay bounded, and confirmation emits the canonical domain value.",
  }),
  "RC-02-EXACT-HEAD-EVIDENCE": Object.freeze({
    flow: null,
    action: "Compare this role's device identity and installed SHA-256 with the checklist identity block and the retained build manifest.",
    expected: "HEAD, source digest, package, retained APK hash and size, and this device's installed APK hash match exactly.",
  }),
  "RC-02-FINAL-COMMAND-ORDER": Object.freeze({
    flow: null,
    action: "Confirm this checklist remains pending and final-verification.json is absent; do not run the physical-required verifier.",
    expected: "No final verification artifact exists before explicit approval of every emulator and Samsung checklist row.",
  }),
  "RC-02-GLYPH-ACTION-GEOMETRY": Object.freeze({
    flow: "maestro/phase2/remediation-workout.yaml",
    action: "Inspect row actions, reorder controls, status glyphs, right-edge alignment, and activation using touch plus keyboard or D-pad where assigned.",
    expected: "Named glyph actions have at least 48dp targets, align consistently, and expose non-color status without clipping or ambiguity.",
  }),
  "RC-02-LATEST-SCHEMA-ADD-COPY": Object.freeze({
    flow: "maestro/phase2/remediation-workout.yaml",
    action: "Add one warm-up, copy the prior warm-up, add one working set, restart, and inspect the resulting row ordinals.",
    expected: "Each operation creates exactly one fresh committed identity on the latest schema and persists with no duplicate row.",
  }),
  "RC-02-NAV-LEFT-RAIL": Object.freeze({
    flow: "maestro/phase2/remediation-inputs-cards-navigation.yaml",
    action: "Cross the 839dp and 840dp width boundary, rotate once, enable 200% text, and activate each destination with D-pad or keyboard.",
    expected: "Bottom tabs become a navigator-owned left rail at 840dp while selection, focus, safe areas, labels, and 48dp targets remain intact.",
  }),
  "RC-02-REST-DOCK": Object.freeze({
    flow: "maestro/phase2/remediation-rest-alerts.yaml",
    action: "Start rest, collapse and expand the dock, then add 15 seconds, subtract 15 seconds, pause, resume, and skip in order.",
    expected: "Remaining time stays visible and authoritative while expanded controls appear in the required order and each action has a 48dp touch target.",
  }),
  "RC-02-RETRY-FOCUS": Object.freeze({
    flow: "maestro/phase2/remediation-workout.yaml",
    action: "Inject each bounded add or copy failure, retry once, then use keyboard or D-pad to inspect focus on the committed target row.",
    expected: "The failed draft is retained, duplicate submission is blocked, and a successful retry reveals and focuses exactly one committed row.",
  }),
  "RC-02-ROLE-SPLIT": Object.freeze({
    flow: null,
    action: "Compare the complete role counts and device assignments in this checklist before any attended evidence is recorded.",
    expected: "Each role owns exactly its source-derived adaptive, input, or physical rows, and neither device role substitutes for the other.",
  }),
  "RC-02-SET-STATUS": Object.freeze({
    flow: "maestro/phase2/remediation-workout.yaml",
    action: "Create warm-up, current, completed, planned, and skipped rows and inspect each label, glyph, top-right status, and progress count.",
    expected: "Every row has explicit non-color state, warm-ups stay outside working progress, and completed or skipped semantics remain accurate.",
  }),
  "RC-02-STICKY-IDENTITY": Object.freeze({
    flow: "maestro/phase2/remediation-workout.yaml",
    action: "Scroll long set content, open the keyboard, rotate, enable 200% text, and review another exercise without changing the current pointer.",
    expected: "Workout and exercise identity remains visible above scrolling content, distinguishes reviewed from current, and never covers working controls.",
  }),
  "RC-02-TIME-OF-DAY-SCOPE": Object.freeze({
    flow: "maestro/phase2/remediation-inputs-cards-navigation.yaml",
    action: "Inspect every editable date, duration, and numeric control reached by the flow and check for any editable time-of-day field.",
    expected: "No editable time-of-day field exists in Phase 2; every reached input is classified as civil date, duration, integer, or decimal.",
  }),
  "RC-02-TODAYS-PLAN": Object.freeze({
    flow: "maestro/phase2/remediation-workout.yaml",
    action: "Open Today's plan, inspect ordered exercise states, review a non-current exercise, scroll the list, and return to the workout.",
    expected: "The overview preserves workout order and explicit states while review leaves the authoritative current exercise unchanged.",
  }),
  "RC-02-WARMUP-EXCLUSION-COPY": Object.freeze({
    flow: "maestro/phase2/remediation-workout.yaml",
    action: "Add and copy warm-ups, complete a working set, and compare the visible row summaries with working-set progress.",
    expected: "Copied warm-ups persist but remain excluded from working progress, and retired exclusion prose does not appear.",
  }),
});

const truthActions = Object.freeze({
  empty: "Inspect the deliberately empty state, then exercise its visible primary or recovery affordance once without adding fabricated content.",
  loading: "Hold the deterministic loading scene long enough to inspect geometry, disabled actions, labels, focus order, and stable surrounding context.",
  error: "Inspect the deterministic failure state, preserve the visible draft or committed facts, then exercise the bounded Retry path once.",
  populated: "Inspect the fully populated state, activate one representative control, and return without changing unrelated authoritative facts.",
  partial: "Inspect the mixed known and unavailable state and confirm every qualification remains visible while valid controls still operate.",
  overflow: "Scroll the longest deterministic content in portrait and landscape and confirm required labels and actions remain reachable without horizontal clipping.",
  "zero-one-many": "Inspect the zero, one, and many substates in the documented order and complete every listed substep before recording one result for this row.",
  "long-text": "Enable 200% font scale, inspect the longest deterministic labels and content, and activate the primary control using the assigned input method.",
});

const genericObservationCodes = new Set([
  "approved",
  "generic",
  "passed",
  "reviewed",
]);
const placeholderInstruction = /\b(?:TODO|TBD|FIXME)\b|same as above|^(?:review|check|verify|observe) this\.?$/iu;
const instructionFields = [
  "setup",
  "navigation",
  "action",
  "expected_observation",
];

function splitIds(value) {
  return value === "—" ? [] : value.split(", ");
}

function slug(value) {
  return value.toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
}

function roleSetup(role, sourceId) {
  if (role === "emulator-supplementary") {
    return `Prepare ${sourceId} on the API 36 arm64-v8a emulator with the exact retained development-test APK and its bounded fixture state.`;
  }
  return `Prepare ${sourceId} on the attended Samsung SM-S916B with its probed Android API and ABI plus the exact retained development-test APK.`;
}

function roleActionPrefix(role) {
  return role === "emulator-supplementary"
    ? "Using emulator touch plus keyboard or D-pad where relevant, "
    : "Using physical touch, OLED appearance, motion, tone, or haptics where relevant, ";
}

function validateInstructionSources(sourceLedger) {
  const exactKeys = (label, actual, expected) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`${label} instruction source is missing, extra, or stale.`);
    }
  };
  exactKeys(
    "remediation",
    Object.keys(caseInstructions),
    sourceLedger.remediationCaseIds,
  );
  exactKeys("surface", Object.keys(surfaceFlow), sourceLedger.surfaceIds);
  exactKeys("UI truth", Object.keys(truthActions), sourceLedger.uiTruths);
  exactKeys(
    "attended preview",
    Object.keys(previewInstructions),
    Object.keys(PHASE2_ATTENDED_PREVIEW_SCENARIOS),
  );
  const expectedRoutes = Object.entries(PHASE2_ATTENDED_PREVIEW_REGISTRY)
    .flatMap(([scenario, variants]) => variants === null
      ? [{ scenario, variant: null }]
      : variants.map((variant) => ({ scenario, variant })));
  if (JSON.stringify(PHASE2_ATTENDED_PREVIEW_ROUTES)
      !== JSON.stringify(expectedRoutes)
    || JSON.stringify(Object.values(PHASE2_ATTENDED_PREVIEW_SCENARIOS))
      !== JSON.stringify(Object.keys(PHASE2_ATTENDED_PREVIEW_REGISTRY))) {
    throw new Error("attended preview scenario registry is missing, extra, or stale.");
  }
  const flows = new Set([
    ...Object.values(surfaceFlow),
    ...Object.values(caseInstructions).map(({ flow }) => flow).filter(Boolean),
  ]);
  for (const flow of flows) {
    if (!existsSync(path.join(projectRoot, flow))) {
      throw new Error(`attended instruction flow is missing: ${flow}`);
    }
  }
}

function canonicalRowSources(sourceLedger) {
  if (JSON.stringify(sourceLedger.attendedRoles) !== JSON.stringify([
    "emulator-supplementary",
    "samsung-physical",
  ])) {
    throw new Error("attended role ledger is incomplete or stale.");
  }
  validateInstructionSources(sourceLedger);
  return sourceLedger.attendedRoles.flatMap((role) => [
    ...sourceLedger.remediationRows
      .filter((row) => splitIds(row.attended_roles).includes(role))
      .map((row) => ({ kind: "remediation", role, source: row })),
    ...sourceLedger.uiTruthRows
      .filter((row) => row.applicability === "required"
        && row.evidence.split("+").includes(role))
      .map((row) => ({ kind: "ui-truth", role, source: row })),
    ...sourceLedger.prohibitionRows
      .filter((row) => splitIds(row.attended_roles).includes(role))
      .map((row) => ({ kind: "prohibition", role, source: row })),
  ]);
}

function remediationRow(role, source) {
  const instructions = caseInstructions[source.id];
  if (!instructions) {
    throw new Error(`attended remediation instruction is missing: ${source.id}`);
  }
  const navigation = instructions.flow
    ? `Follow ${instructions.flow} from launchApp to the source-owned ${source.id} observation; preserve clearState and restart boundaries exactly as written.`
    : `Open the checklist identity section for ${source.id} and compare this role with artifacts/native/phase2/build.json before any approval step.`;
  return {
    row_id: `${role}:remediation:${source.id}`,
    kind: "remediation",
    role,
    remediation_case_id: source.id,
    decision_ids: splitIds(source.decision_ids),
    gap_ids: splitIds(source.gap_ids),
    status: "pending",
    setup: roleSetup(role, source.id),
    navigation,
    action: roleActionPrefix(role) + instructions.action.charAt(0).toLowerCase() + instructions.action.slice(1),
    expected_observation: instructions.expected,
    suggested_observation_code: `${slug(role)}-${slug(source.id)}-verified`,
  };
}

function uiTruthRow(role, source) {
  const key = `${source.surface_id}|${source.truth_id}`;
  const previewScenario = PHASE2_ATTENDED_PREVIEW_SCENARIOS[key];
  const requiredPreviewUrls = previewUrls(key);
  const previewInstruction = previewInstructions[key];
  const flow = surfaceFlow[source.surface_id];
  if (!flow) {
    throw new Error(`attended UI surface instruction is missing: ${source.surface_id}`);
  }
  const navigation = previewScenario
    ? `Open each required development-test preview in order and wait for the named production state or control before inspection: ${requiredPreviewUrls.join(" ")}`
    : `Follow ${flow} from launchApp to the ${source.surface_id} ${source.truth_id} state, retaining predecessor state when that flow uses clearState: false.`;
  const action = previewInstruction?.actionByRole?.[role]
    ?? previewInstruction?.action
    ?? truthActions[source.truth_id];
  if (!action) {
    throw new Error(`attended UI truth instruction is missing: ${source.truth_id}`);
  }
  return {
    row_id: `${role}:ui-truth:${source.surface_id}:${source.truth_id}`,
    kind: "ui-truth",
    role,
    surface_id: source.surface_id,
    truth_id: source.truth_id,
    remediation_case_ids: splitIds(source.remediation_cases),
    status: "pending",
    setup: roleSetup(role, key),
    navigation,
    action: roleActionPrefix(role) + action.charAt(0).toLowerCase() + action.slice(1),
    expected_observation: previewInstruction?.expectedByRole?.[role]
      ?? previewInstruction?.expected
      ?? source.reason_or_expectation,
    suggested_observation_code: `${slug(role)}-${slug(source.surface_id)}-${slug(source.truth_id)}-observed`,
    ...(source.truth_id === "zero-one-many" ? {
      substeps: [...(previewInstruction?.substeps ?? [
        `Zero: inspect ${source.surface_id} with no selected or available item and confirm the source-owned empty semantics.`,
        `One: inspect ${source.surface_id} with exactly one selected or available item and confirm singular semantics.`,
        `Many: inspect ${source.surface_id} with multiple available items and confirm ordering, scrolling, and plural semantics.`,
      ])],
    } : {}),
  };
}

function prohibitionRow(role, source) {
  const flows = [...new Set(splitIds(source.remediation_cases).map((caseId) =>
    caseInstructions[caseId]?.flow).filter(Boolean))];
  if (flows.length < 1) {
    throw new Error(`attended prohibition navigation is missing: ${source.id}`);
  }
  return {
    row_id: `${role}:prohibition:${source.id}`,
    kind: "prohibition",
    role,
    prohibition_id: source.id,
    remediation_case_ids: splitIds(source.remediation_cases),
    status: "pending",
    setup: roleSetup(role, source.id),
    navigation: `Follow the applicable states in ${flows.join(" and ")} and stop at each completion, failure, partial, rest, or schedule state named by this prohibition.`,
    action: `${roleActionPrefix(role)}${source.attended_review.charAt(0).toLowerCase()}${source.attended_review.slice(1)}`,
    expected_observation: source.constraint,
    suggested_observation_code: `${slug(role)}-${slug(source.id)}-confirmed`,
  };
}

function derivePhase2AttendedChecklistRowsUnchecked(sourceLedger) {
  return canonicalRowSources(sourceLedger).map(({ kind, role, source }) => {
    if (kind === "remediation") return remediationRow(role, source);
    if (kind === "ui-truth") return uiTruthRow(role, source);
    return prohibitionRow(role, source);
  });
}

export function derivePhase2AttendedChecklistRows(sourceLedger) {
  const rows = derivePhase2AttendedChecklistRowsUnchecked(sourceLedger);
  validatePhase2AttendedChecklistRows(rows, sourceLedger);
  return rows;
}

function expectedRowId({ kind, role, source }) {
  if (kind === "remediation") return `${role}:remediation:${source.id}`;
  if (kind === "ui-truth") {
    return `${role}:ui-truth:${source.surface_id}:${source.truth_id}`;
  }
  return `${role}:prohibition:${source.id}`;
}

function assertNoApprovalKey(value) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (key.toLowerCase().includes("approval")) {
      throw new Error("pending checklist must not contain an approval field.");
    }
    assertNoApprovalKey(child);
  }
}

export function validatePhase2AttendedChecklistRows(rows, sourceLedger) {
  if (!Array.isArray(rows)) {
    throw new Error("attended checklist rows are missing.");
  }
  const duplicateIds = rows.map(({ row_id: rowId }) => rowId)
    .filter((rowId, index, all) => all.indexOf(rowId) !== index);
  if (duplicateIds.length > 0) {
    throw new Error(`attended checklist contains duplicate rows: ${duplicateIds.join(", ")}`);
  }
  const expectedIds = canonicalRowSources(sourceLedger).map(expectedRowId);
  const actualIds = rows.map(({ row_id: rowId }) => rowId);
  if (actualIds.length < expectedIds.length
    || expectedIds.some((rowId) => !actualIds.includes(rowId))) {
    throw new Error("attended checklist is missing or incomplete.");
  }
  if (actualIds.length > expectedIds.length
    || actualIds.some((rowId) => !expectedIds.includes(rowId))) {
    throw new Error("attended checklist contains an extra or stale row.");
  }
  if (actualIds.some((rowId, index) => rowId !== expectedIds[index])) {
    throw new Error("attended checklist canonical order is stale.");
  }
  const codes = [];
  for (const row of rows) {
    if (Object.keys(row).some((key) => key.toLowerCase().includes("approval"))) {
      throw new Error(`pending checklist row contains an approval field: ${row.row_id}`);
    }
    if (row.status !== "pending") {
      throw new Error(`attended checklist status must remain pending: ${row.row_id}`);
    }
    for (const field of instructionFields) {
      const instruction = row[field];
      if (typeof instruction === "string" && /\bTODO\b/iu.test(instruction)) {
        throw new Error(`attended checklist TODO instruction is forbidden: ${row.row_id}`);
      }
      if (typeof instruction !== "string" || instruction.trim().length < 24) {
        const kind = instruction ? "generic" : "missing";
        throw new Error(`attended checklist instruction is ${kind}: ${row.row_id} ${field}`);
      }
      if (placeholderInstruction.test(instruction)) {
        throw new Error(`attended checklist instruction is generic: ${row.row_id} ${field}`);
      }
    }
    if (row.kind === "ui-truth" && row.truth_id === "zero-one-many") {
      if (!Array.isArray(row.substeps)
        || row.substeps.length !== 3
        || row.substeps.some((instruction) =>
          typeof instruction !== "string"
          || instruction.length < 24
          || placeholderInstruction.test(instruction))) {
        throw new Error(`attended zero-one-many substeps are incomplete: ${row.row_id}`);
      }
    } else if (Object.hasOwn(row, "substeps")) {
      throw new Error(`attended substeps are only valid for zero-one-many: ${row.row_id}`);
    }
    const code = row.suggested_observation_code;
    if (typeof code !== "string"
      || !/^[a-z0-9]+(?:-[a-z0-9]+)+$/u.test(code)
      || genericObservationCodes.has(code)) {
      throw new Error(`attended observation code is generic: ${row.row_id}`);
    }
    codes.push(code);
  }
  if (new Set(codes).size !== codes.length) {
    throw new Error("attended observation codes contain duplicates.");
  }
  const expectedPreviewRows = canonicalRowSources(sourceLedger)
    .filter(({ kind, source }) => kind === "ui-truth"
      && Object.hasOwn(
        PHASE2_ATTENDED_PREVIEW_SCENARIOS,
        `${source.surface_id}|${source.truth_id}`,
      ))
    .map(expectedRowId);
  const actualPreviewRows = rows.filter(({ navigation }) =>
    navigation.includes("gymtracker-devtest://__phase2-attended-preview?scenario=")
  );
  if (Object.keys(PHASE2_ATTENDED_PREVIEW_SCENARIOS).length
      !== Object.keys(previewInstructions).length
    || JSON.stringify(actualPreviewRows.map(({ row_id: rowId }) => rowId))
      !== JSON.stringify(expectedPreviewRows)) {
    throw new Error("attended preview navigation rows are incomplete or stale.");
  }
  for (const row of actualPreviewRows) {
    const key = `${row.surface_id}|${row.truth_id}`;
    const scenario = PHASE2_ATTENDED_PREVIEW_SCENARIOS[key];
    const expectedLinks = previewUrls(key);
    const actualLinks = row.navigation.match(
      /gymtracker-devtest:\/\/__phase2-attended-preview\?scenario=[a-z0-9-]+(?:&variant=[a-z0-9-]+)?/gu,
    ) ?? [];
    if (!scenario || JSON.stringify(actualLinks) !== JSON.stringify(expectedLinks)) {
      throw new Error(`attended preview navigation is malformed: ${row.row_id}`);
    }
  }
  const deterministicRows = derivePhase2AttendedChecklistRowsUnchecked(sourceLedger);
  if (JSON.stringify(rows) !== JSON.stringify(deterministicRows)) {
    throw new Error("attended checklist instructions or source fields are stale.");
  }
  assertNoApprovalKey(rows);
  return rows;
}

export function validatePhase2AttendedManifest(manifest, {
  currentHead,
  changedPaths = [],
  currentSourceSha256,
  implementationSourceSha256 = manifest?.source_tree_sha256,
  actualApkSha256,
  actualApkSize,
}) {
  validatePhase2AttendedManifestShape(manifest);
  validateImplementationIdentity({
    manifestHead: manifest.base_head,
    currentHead,
    changedPaths,
    manifestSourceSha256: manifest.source_tree_sha256,
    currentSourceSha256,
    implementationSourceSha256,
  });
  if (currentSourceSha256 !== manifest.source_tree_sha256) {
    throw new Error("current implementation source digest is stale.");
  }
  if (manifest.apk.sha256 !== actualApkSha256
    || manifest.apk.size_bytes !== actualApkSize) {
    throw new Error("Phase 2 attended retained APK identity is not exact.");
  }
}

function validatePhase2AttendedManifestShape(manifest) {
  if (manifest?.schema_version !== 1
    || manifest?.suite !== "phase2"
    || manifest?.profile !== "development-test"
    || manifest?.build_variant !== "release"
    || manifest?.js_bundle?.embedded !== true
    || manifest?.apk?.path !== "artifacts/native/phase2/gym-tracker-phase2-devtest.apk"
    || manifest?.apk?.page_alignment_kib !== 16
    || manifest?.apk?.page_alignment_verified !== true
    || manifest?.installed_apk?.sha256 !== manifest?.apk?.sha256
    || manifest?.installed_apk?.matches_retained_apk !== true) {
    throw new Error("Phase 2 attended build manifest is invalid.");
  }
  if (manifest.package !== PACKAGE_NAME) {
    throw new Error("Phase 2 attended package does not match the development-test package.");
  }
  if (!/^[a-f0-9]{40}$/u.test(manifest.base_head ?? "")) {
    throw new Error("Phase 2 attended manifest HEAD is invalid.");
  }
  if (!/^[a-f0-9]{64}$/u.test(manifest.source_tree_sha256 ?? "")) {
    throw new Error("Phase 2 attended source digest is invalid.");
  }
  if (!/^[a-f0-9]{64}$/u.test(manifest.apk?.sha256 ?? "")
    || !Number.isInteger(manifest.apk?.size_bytes)
    || manifest.apk.size_bytes < 1) {
    throw new Error("Phase 2 attended APK manifest identity is invalid.");
  }
}

function hashSerial(serial) {
  if (typeof serial !== "string" || !serial.trim()) {
    throw new Error("attended device serial is missing.");
  }
  return createHash("sha256").update(serial).digest("hex");
}

export function buildPhase2AttendedDevice(device, manifest) {
  validatePhase2AttendedDeviceMetadata({
    role: device.role,
    model: device.model,
    api: device.api,
    abi: device.abi,
    qemu: device.role === "emulator-supplementary" ? "1" : "0",
  }, manifest);
  if (device.installedSha256 !== manifest.apk.sha256) {
    throw new Error(`${device.role} installed APK bytes do not match the manifest.`);
  }
  const serialSha256 = device.serialSha256 ?? hashSerial(device.serial);
  if (!/^[a-f0-9]{64}$/u.test(serialSha256)) {
    throw new Error(`${device.role} serial hash is invalid.`);
  }
  return {
    model: device.model,
    api: device.api,
    abi: device.abi,
    serial_sha256: serialSha256,
    installed_sha256: device.installedSha256,
  };
}

export function buildPhase2AttendedChecklist({
  manifest,
  manifestPath,
  sourceLedger,
  emulator,
  samsung,
  currentPlanningHead = manifest.base_head,
  generatedAt = new Date().toISOString(),
}) {
  validatePhase2AttendedManifestShape(manifest);
  if (!/^[a-f0-9]{40}$/u.test(currentPlanningHead)) {
    throw new Error("attended checklist planning HEAD is invalid.");
  }
  if (!Number.isFinite(Date.parse(generatedAt))) {
    throw new Error("attended checklist generation timestamp is invalid.");
  }
  const rows = derivePhase2AttendedChecklistRows(sourceLedger);
  const byRole = Object.fromEntries(sourceLedger.attendedRoles.map((role) => [
    role,
    rows.filter((row) => row.role === role).length,
  ]));
  const previewRoleRows = rows.filter(({ navigation }) =>
    navigation.includes("gymtracker-devtest://__phase2-attended-preview?scenario=")
  ).length;
  const devices = {
    "emulator-supplementary": buildPhase2AttendedDevice({
      role: "emulator-supplementary",
      ...emulator,
      serialSha256: emulator.serial_sha256,
      installedSha256: emulator.installed_sha256,
    }, manifest),
    "samsung-physical": buildPhase2AttendedDevice({
      role: "samsung-physical",
      ...samsung,
      serialSha256: samsung.serial_sha256,
      installedSha256: samsung.installed_sha256,
    }, manifest),
  };
  const checklist = {
    schema_version: 1,
    suite: "phase2",
    status: "pending",
    build_manifest: manifestPath.replaceAll(path.sep, "/"),
    base_head: manifest.base_head,
    current_planning_head: currentPlanningHead,
    source_tree_sha256: manifest.source_tree_sha256,
    package: manifest.package,
    apk: {
      path: manifest.apk.path,
      sha256: manifest.apk.sha256,
      size_bytes: manifest.apk.size_bytes,
    },
    devices,
    counts: {
      total: rows.length,
      by_role: byRole,
      by_kind: {
        remediation: rows.filter(({ kind }) => kind === "remediation").length,
        "ui-truth": rows.filter(({ kind }) => kind === "ui-truth").length,
        prohibition: rows.filter(({ kind }) => kind === "prohibition").length,
      },
      preview_role_rows: previewRoleRows,
      preview_scenarios: Object.keys(PHASE2_ATTENDED_PREVIEW_SCENARIOS).length,
    },
    rows,
    generated_at: generatedAt,
  };
  assertNoApprovalKey(checklist);
  return checklist;
}

function exactKeys(value, expected, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || JSON.stringify(Object.keys(value)) !== JSON.stringify(expected)) {
    throw new Error(`${label} schema contains missing, reordered, or unknown keys.`);
  }
}

function exactStringArray(value, label) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`${label} schema is invalid.`);
  }
}

function validateChecklistRowSchema(row) {
  const common = [
    "row_id", "kind", "role",
  ];
  const instructions = [
    "status", "setup", "navigation", "action",
    "expected_observation", "suggested_observation_code",
  ];
  if (row?.kind === "remediation") {
    exactKeys(row, [
      ...common, "remediation_case_id", "decision_ids", "gap_ids",
      ...instructions,
    ], `attended checklist row ${row?.row_id ?? "unknown"}`);
    exactStringArray(row.decision_ids, `${row.row_id} decision IDs`);
    exactStringArray(row.gap_ids, `${row.row_id} gap IDs`);
  } else if (row?.kind === "ui-truth") {
    exactKeys(row, [
      ...common, "surface_id", "truth_id", "remediation_case_ids",
      ...instructions,
      ...(row.truth_id === "zero-one-many" ? ["substeps"] : []),
    ], `attended checklist row ${row?.row_id ?? "unknown"}`);
    exactStringArray(row.remediation_case_ids, `${row.row_id} remediation IDs`);
    if (row.truth_id === "zero-one-many") {
      exactStringArray(row.substeps, `${row.row_id} substeps`);
    }
  } else if (row?.kind === "prohibition") {
    exactKeys(row, [
      ...common, "prohibition_id", "remediation_case_ids",
      ...instructions,
    ], `attended checklist row ${row?.row_id ?? "unknown"}`);
    exactStringArray(row.remediation_case_ids, `${row.row_id} remediation IDs`);
  } else {
    throw new Error("attended checklist row kind is invalid.");
  }
}

export function validatePhase2AttendedChecklist(
  checklist,
  { manifest, sourceLedger, currentPlanningHead } = {},
) {
  exactKeys(checklist, [
    "schema_version", "suite", "status", "build_manifest",
    "base_head", "current_planning_head", "source_tree_sha256",
    "package", "apk", "devices", "counts", "rows",
    "generated_at",
  ], "attended checklist");
  exactKeys(checklist.apk, ["path", "sha256", "size_bytes"], "attended checklist APK");
  exactKeys(checklist.devices, ["emulator-supplementary", "samsung-physical"], "attended checklist devices");
  for (const role of ["emulator-supplementary", "samsung-physical"]) {
    exactKeys(checklist.devices[role], [
      "model", "api", "abi", "serial_sha256", "installed_sha256",
    ], `${role} checklist device`);
  }
  exactKeys(checklist.counts, [
    "total", "by_role", "by_kind", "preview_role_rows",
    "preview_scenarios",
  ], "attended checklist counts");
  exactKeys(checklist.counts.by_role, [
    "emulator-supplementary", "samsung-physical",
  ], "attended checklist role counts");
  exactKeys(checklist.counts.by_kind, [
    "remediation", "ui-truth", "prohibition",
  ], "attended checklist kind counts");
  if (!Array.isArray(checklist.rows)) {
    throw new Error("attended checklist rows are missing.");
  }
  checklist.rows.forEach(validateChecklistRowSchema);
  if (checklist.schema_version !== 1 || checklist.suite !== "phase2"
    || checklist.status !== "pending"
    || checklist.build_manifest !== "artifacts/native/phase2/build.json"
    || !Number.isFinite(Date.parse(checklist.generated_at))
    || currentPlanningHead !== undefined
      && checklist.current_planning_head !== currentPlanningHead) {
    throw new Error("attended checklist identity or status is invalid.");
  }
  if (manifest) {
    if (checklist.base_head !== manifest.base_head
      || checklist.source_tree_sha256 !== manifest.source_tree_sha256
      || checklist.package !== manifest.package
      || checklist.apk.path !== manifest.apk.path
      || checklist.apk.sha256 !== manifest.apk.sha256
      || checklist.apk.size_bytes !== manifest.apk.size_bytes) {
      throw new Error("attended checklist build identity does not match manifest.");
    }
    for (const role of ["emulator-supplementary", "samsung-physical"]) {
      buildPhase2AttendedDevice({
        role,
        ...checklist.devices[role],
        serialSha256: checklist.devices[role].serial_sha256,
        installedSha256: checklist.devices[role].installed_sha256,
      }, manifest);
    }
  }
  if (sourceLedger) {
    validatePhase2AttendedChecklistRows(checklist.rows, sourceLedger);
    const expected = buildPhase2AttendedChecklist({
      manifest,
      manifestPath: checklist.build_manifest,
      sourceLedger,
      emulator: checklist.devices["emulator-supplementary"],
      samsung: checklist.devices["samsung-physical"],
      currentPlanningHead: checklist.current_planning_head,
      generatedAt: checklist.generated_at,
    });
    if (JSON.stringify(checklist) !== JSON.stringify(expected)) {
      throw new Error("attended checklist is not the deterministic canonical checklist.");
    }
  }
  return checklist;
}

export function serializePhase2AttendedChecklist(checklist) {
  return Buffer.from(`${JSON.stringify(checklist, null, 2)}\n`);
}

export function parsePhase2AttendedChecklistBytes(bytes, options = {}) {
  let checklist;
  try {
    checklist = JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch {
    throw new Error("attended checklist is not readable JSON.");
  }
  validatePhase2AttendedChecklist(checklist, options);
  if (!Buffer.from(bytes).equals(serializePhase2AttendedChecklist(checklist))) {
    throw new Error("attended checklist bytes are not canonical.");
  }
  return {
    checklist,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

export function buildPhase2AttendedRoleRecord({
  checklist,
  checklistSha256,
  role,
  device,
  recordedAt = new Date().toISOString(),
}) {
  if (!checklist.devices?.[role] || JSON.stringify(device) !== JSON.stringify(checklist.devices[role])) {
    throw new Error(`${role} live device identity does not match the checklist.`);
  }
  if (!/^[a-f0-9]{64}$/u.test(checklistSha256)
    || !Number.isFinite(Date.parse(recordedAt))) {
    throw new Error("attended role provenance is invalid.");
  }
  return {
    schema_version: 2,
    status: "passed",
    role,
    checklist_sha256: checklistSha256,
    checklist_generated_at: checklist.generated_at,
    base_head: checklist.base_head,
    source_tree_sha256: checklist.source_tree_sha256,
    package: checklist.package,
    apk_sha256: checklist.apk.sha256,
    device,
    rows: checklist.rows.filter((row) => row.role === role).map((row) => ({
      row_id: row.row_id,
      status: "passed",
      observation_code: row.suggested_observation_code,
    })),
    recorded_at: recordedAt,
  };
}

export function validatePhase2AttendedRoleRecord(
  record,
  { checklist, checklistSha256, role },
) {
  exactKeys(record, [
    "schema_version", "status", "role", "checklist_sha256",
    "checklist_generated_at", "base_head", "source_tree_sha256",
    "package", "apk_sha256", "device", "rows", "recorded_at",
  ], `${role} attended record`);
  exactKeys(record.device, [
    "model", "api", "abi", "serial_sha256", "installed_sha256",
  ], `${role} attended device`);
  if (!Array.isArray(record.rows)) {
    throw new Error(`${role} attended rows are missing.`);
  }
  for (const row of record.rows) {
    exactKeys(row, ["row_id", "status", "observation_code"], `${role} attended row`);
  }
  const expected = buildPhase2AttendedRoleRecord({
    checklist,
    checklistSha256,
    role,
    device: checklist.devices[role],
    recordedAt: record.recorded_at,
  });
  if (record.schema_version !== 2
    || record.status !== "passed"
    || record.role !== role
    || record.checklist_sha256 !== checklistSha256
    || record.checklist_generated_at !== checklist.generated_at
    || !Number.isFinite(Date.parse(record.recorded_at))
    || JSON.stringify(record) !== JSON.stringify(expected)) {
    throw new Error(`${role} attended record is not exactly bound to the checklist.`);
  }
  if (new Set(record.rows.map(({ observation_code: code }) => code)).size
      !== record.rows.length) {
    throw new Error(`${role} attended observation codes contain duplicates.`);
  }
  return record;
}

export function parsePhase2AttendedRoleRecordBytes(bytes, options) {
  let record;
  try {
    record = JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch {
    throw new Error(`${options.role} attended record is not readable JSON.`);
  }
  validatePhase2AttendedRoleRecord(record, options);
  const canonical = Buffer.from(`${JSON.stringify(record, null, 2)}\n`);
  if (!Buffer.from(bytes).equals(canonical)) {
    throw new Error(`${options.role} attended record bytes are not canonical.`);
  }
  return record;
}

function parseOption(args, index, option) {
  const argument = args[index];
  if (argument === option) {
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${option} requires a value.`);
    }
    return { value, consumed: 2 };
  }
  if (argument.startsWith(`${option}=`)) {
    const value = argument.slice(option.length + 1);
    if (!value) throw new Error(`${option} requires a value.`);
    return { value, consumed: 1 };
  }
  return null;
}

export function parsePhase2AttendedChecklistArgs(args) {
  const values = {};
  const options = [
    ["--manifest", "manifest", "path"],
    ["--emulator-serial", "emulatorSerial"],
    ["--samsung-serial", "samsungSerial"],
    ["--output", "output", "path"],
  ];
  for (let index = 0; index < args.length;) {
    const match = options
      .map(([option, name, kind]) => ({
        option,
        name,
        kind,
        parsed: parseOption(args, index, option),
      }))
      .find(({ parsed }) => parsed !== null);
    if (!match) throw new Error("unknown attended checklist argument.");
    if (Object.hasOwn(values, match.name)) {
      throw new Error(`duplicate attended checklist argument: ${match.option}`);
    }
    values[match.name] = match.parsed.value;
    if (match.kind === "path"
      && (match.parsed.value.includes("\0")
        || match.parsed.value.startsWith("-"))) {
      throw new Error(`${match.option} path is invalid.`);
    }
    index += match.parsed.consumed;
  }
  for (const [name, label] of [
    ["manifest", "manifest"],
    ["emulatorSerial", "emulator serial"],
    ["samsungSerial", "Samsung serial"],
    ["output", "output"],
  ]) {
    if (!values[name]) throw new Error(`${label} is required.`);
  }
  if (values.emulatorSerial === values.samsungSerial) {
    throw new Error("emulator and Samsung serials must be distinct.");
  }
  if (path.basename(values.output) !== "checklist.pending.json") {
    throw new Error("attended checklist output must be checklist.pending.json.");
  }
  return values;
}

export function parsePhase2AttendedRecordArgs(args) {
  const values = {};
  const options = [
    ["--manifest", "manifest"],
    ["--emulator-serial", "emulatorSerial"],
    ["--samsung-serial", "samsungSerial"],
    ["--checklist-sha256", "checklistSha256"],
  ];
  for (let index = 0; index < args.length;) {
    const match = options.map(([option, name]) => ({
      option, name, parsed: parseOption(args, index, option),
    })).find(({ parsed }) => parsed !== null);
    if (!match) throw new Error("unknown attended record argument.");
    if (Object.hasOwn(values, match.name)) {
      throw new Error(`duplicate attended record argument: ${match.option}`);
    }
    values[match.name] = match.parsed.value;
    index += match.parsed.consumed;
  }
  for (const [name, label] of [
    ["manifest", "manifest"],
    ["emulatorSerial", "emulator serial"],
    ["samsungSerial", "Samsung serial"],
    ["checklistSha256", "checklist SHA-256"],
  ]) {
    if (!values[name]) throw new Error(`${label} is required.`);
  }
  if (!/^[a-f0-9]{64}$/u.test(values.checklistSha256)) {
    throw new Error("checklist SHA-256 must be 64 lowercase hexadecimal characters.");
  }
  if (values.emulatorSerial === values.samsungSerial) {
    throw new Error("emulator and Samsung serials must be distinct.");
  }
  return values;
}

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function adbExecutable(environment = process.env) {
  const androidHome = environment.ANDROID_HOME
    ?? environment.ANDROID_SDK_ROOT
    ?? "/opt/homebrew/share/android-commandlinetools";
  return path.join(androidHome, "platform-tools", "adb");
}

function adbText(executable, serial, args, role, {
  execFile = execFileSync,
  root = projectRoot,
} = {}) {
  try {
    return execFile(executable, ["-s", serial, ...args], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    }).trim().replaceAll("\r", "");
  } catch {
    throw new Error(`${role} device probe failed.`);
  }
}

export function validatePhase2AttendedDeviceMetadata({
  role,
  model,
  api,
  abi,
  qemu,
}, manifest) {
  if (!["emulator-supplementary", "samsung-physical"].includes(role)) {
    throw new Error("attended device role is invalid.");
  }
  if (role === "emulator-supplementary" && qemu !== "1") {
    throw new Error("emulator-supplementary device is not an emulator.");
  }
  if (role === "samsung-physical" && qemu === "1") {
    throw new Error("samsung-physical device must be physical hardware.");
  }
  if (typeof model !== "string" || !model.trim()
    || role === "samsung-physical" && model !== "SM-S916B"
    || role === "emulator-supplementary"
      && model !== manifest?.device?.model) {
    throw new Error(`${role} device model is invalid.`);
  }
  if (!Number.isInteger(api)
    || role === "emulator-supplementary"
      && api !== manifest?.device?.api) {
    throw new Error(`${role} device API is invalid.`);
  }
  if (typeof abi !== "string" || !abi.trim()
    || role === "emulator-supplementary"
      && abi !== manifest?.device?.abi) {
    throw new Error(`${role} device ABI is invalid.`);
  }
  return { model, api, abi };
}

function probeAttendedDeviceMetadata({
  executable,
  serial,
  role,
  execFile = execFileSync,
  root = projectRoot,
  manifest,
}) {
  const context = { execFile, root };
  if (adbText(executable, serial, ["get-state"], role, context) !== "device") {
    throw new Error(`${role} device is not ready.`);
  }
  const model = adbText(executable, serial, ["shell", "getprop", "ro.product.model"], role, context);
  const api = Number(adbText(executable, serial, ["shell", "getprop", "ro.build.version.sdk"], role, context));
  const abi = adbText(executable, serial, ["shell", "getprop", "ro.product.cpu.abi"], role, context);
  const qemu = adbText(executable, serial, ["shell", "getprop", "ro.kernel.qemu"], role, context);
  return validatePhase2AttendedDeviceMetadata({
    role,
    model,
    api,
    abi,
    qemu,
  }, manifest);
}

export function parseSingleInstalledApkPath(output, role) {
  const packagePaths = output.split(/\r?\n/u)
    .filter((line) => line.startsWith("package:"));
  if (packagePaths.length !== 1 || packagePaths[0].slice(8).trim() === "") {
    throw new Error(`${role} installed package is unavailable or split.`);
  }
  return packagePaths[0].slice(8);
}

function probeInstalledApk({
  executable,
  serial,
  serialSha256,
  role,
  manifest,
  metadata,
  root = projectRoot,
  execFile = execFileSync,
}) {
  const packagePath = parseSingleInstalledApkPath(adbText(
    executable,
    serial,
    ["shell", "pm", "path", manifest.package],
    role,
    { execFile, root },
  ), role);
  let installedBytes;
  try {
    installedBytes = execFile(
      executable,
      ["-s", serial, "exec-out", "cat", packagePath],
      { cwd: root, maxBuffer: 512 * 1024 * 1024 },
    );
  } catch {
    throw new Error(`${role} installed APK bytes could not be read.`);
  }
  const installedSha256 = createHash("sha256").update(installedBytes).digest("hex");
  return buildPhase2AttendedDevice({
    role,
    serialSha256,
    ...metadata,
    installedSha256,
  }, manifest);
}

export function probePhase2AttendedDevice({
  executable,
  serial,
  role,
  manifest,
  root = projectRoot,
  execFile = execFileSync,
}) {
  const metadata = probeAttendedDeviceMetadata({
    executable, serial, role, manifest, root, execFile,
  });
  return probeInstalledApk({
    executable,
    serial,
    serialSha256: hashSerial(serial),
    role,
    manifest,
    metadata,
    root,
    execFile,
  });
}

function parseAdbDeviceSerials(output) {
  const lines = output.replaceAll("\r", "").split("\n").slice(1);
  const serials = lines.filter((line) => /\tdevice(?:\s|$)/u.test(line))
    .map((line) => line.split(/\s+/u)[0]);
  if (new Set(serials).size !== serials.length) {
    throw new Error("ADB device enumeration contains duplicate entries.");
  }
  return serials;
}

export function discoverPhase2AttendedDevices({
  manifest,
  expectedDevices,
  executable = adbExecutable(),
  root = projectRoot,
  execFile = execFileSync,
}) {
  let output;
  try {
    output = execFile(executable, ["devices", "-l"], {
      cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
    });
  } catch {
    throw new Error("attended device enumeration failed.");
  }
  const matches = { emulator: [], samsung: [] };
  for (const serial of parseAdbDeviceSerials(output)) {
    let qemu;
    let model;
    try {
      qemu = adbText(executable, serial, ["shell", "getprop", "ro.kernel.qemu"], "candidate", { execFile, root });
      model = adbText(executable, serial, ["shell", "getprop", "ro.product.model"], "candidate", { execFile, root });
    } catch {
      continue;
    }
    const role = qemu === "1"
      ? "emulator-supplementary"
      : model === "SM-S916B" ? "samsung-physical" : null;
    if (role === null) continue;
    try {
      const device = probePhase2AttendedDevice({
        executable, serial, role, manifest, root, execFile,
      });
      const key = role === "emulator-supplementary" ? "emulator" : "samsung";
      if (JSON.stringify(device) === JSON.stringify(expectedDevices[role])) {
        matches[key].push(device);
      }
    } catch {
      // Candidate details remain private; a missing exact match fails below.
    }
  }
  if (matches.emulator.length !== 1 || matches.samsung.length !== 1) {
    throw new Error("exactly one matching emulator and one matching Samsung attended device are required.");
  }
  return { emulator: matches.emulator[0], samsung: matches.samsung[0] };
}

function installAttendedApk(
  executable,
  serial,
  role,
  apkPath,
  root = projectRoot,
  execFile = execFileSync,
) {
  try {
    const output = execFile(
      executable,
      ["-s", serial, "install", "-r", apkPath],
      {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
      },
    );
    if (!output.split(/\r?\n/u).some((line) => line.trim() === "Success")) {
      throw new Error("adb install did not report Success.");
    }
  } catch {
    throw new Error(`${role} exact APK installation failed.`);
  }
}

async function writeBytesAtomic(filePath, bytes) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`,
  );
  try {
    await writeFile(temporaryPath, bytes, {
      flag: "wx",
      mode: 0o600,
    });
    await rename(temporaryPath, filePath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

async function writeBytesNoClobber(filePath, bytes) {
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`,
  );
  try {
    await writeFile(temporaryPath, bytes, { flag: "wx", mode: 0o600 });
    await link(temporaryPath, filePath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function publishBytesNoClobber(filePath, bytes) {
  const retainedPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${randomBytes(6).toString("hex")}.owner`,
  );
  try {
    await writeFile(retainedPath, bytes, { flag: "wx", mode: 0o600 });
    await link(retainedPath, filePath);
    return { filePath, retainedPath };
  } catch (error) {
    await rm(retainedPath, { force: true });
    throw error;
  }
}

async function finishPublishedBytes({ retainedPath }) {
  await rm(retainedPath);
}

async function rollbackPublishedBytes({ filePath, retainedPath }) {
  const claimedPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${randomBytes(6).toString("hex")}.rollback`,
  );
  try {
    await rename(filePath, claimedPath);
    const claimedDetails = statSync(claimedPath);
    const retainedDetails = statSync(retainedPath);
    if (claimedDetails.dev === retainedDetails.dev
      && claimedDetails.ino === retainedDetails.ino) {
      await rm(claimedPath);
    } else {
      try {
        await link(claimedPath, filePath);
        await rm(claimedPath);
      } catch (error) {
        throw new Error(
          `attended checklist replacement was preserved at ${path.basename(claimedPath)} because canonical restoration failed: ${error.message}`,
          { cause: error },
        );
      }
    }
  } finally {
    await rm(retainedPath, { force: true });
  }
}

function throwPrimaryAndCleanup(primaryError, cleanupError, message) {
  if (cleanupError === undefined) throw primaryError;
  throw new AggregateError(
    [primaryError, cleanupError],
    message,
    { cause: primaryError },
  );
}

export async function writePhase2AttendedChecklistAtomic(
  filePath,
  value,
  { noClobber = false } = {},
) {
  const bytes = serializePhase2AttendedChecklist(value);
  if (noClobber) await writeBytesNoClobber(filePath, bytes);
  else await writeBytesAtomic(filePath, bytes);
}

function readJson(filePath, label) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`${label} is not readable JSON: ${error.message}`);
  }
}

function relativeProjectPath(filePath, root = projectRoot) {
  const relative = path.relative(root, filePath);
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("attended checklist path must be inside the project.");
  }
  return relative.replaceAll(path.sep, "/");
}

async function ensurePhase2AttendedPaths(root) {
  const initial = resolvePhase2AttendedPaths({ root, requireDirectory: false });
  await mkdir(initial.attendedDirectory).catch((error) => {
    if (error?.code !== "EEXIST") throw error;
  });
  return resolvePhase2AttendedPaths({ root });
}

function trackedWorktreeChanges(root, execFile) {
  return execFile("git", [
    "status",
    "--porcelain=v1",
    "--untracked-files=no",
  ], {
    cwd: root,
    encoding: "utf8",
  }).trim();
}

function validateCurrentIdentity(
  manifest,
  apkPath,
  { execFile = execFileSync, root = projectRoot } = {},
) {
  validatePhase2AttendedManifestShape(manifest);
  const currentHead = execFile("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const changedPaths = currentHead === manifest.base_head
    ? []
    : execFile(
        "git",
        ["diff", "--name-only", `${manifest.base_head}..${currentHead}`],
        { cwd: root, encoding: "utf8" },
      ).trim().split(/\r?\n/u).filter(Boolean);
  const trackedChanges = trackedWorktreeChanges(root, execFile);
  if (trackedChanges !== "") {
    throw new Error("tracked worktree changes prevent attended preparation.");
  }
  validatePhase2AttendedManifest(manifest, {
    currentHead,
    changedPaths,
    currentSourceSha256: sourceTreeSha256(root),
    implementationSourceSha256: sourceTreeSha256AtHead(
      manifest.base_head,
      root,
    ),
    actualApkSha256: sha256File(apkPath),
    actualApkSize: statSync(apkPath).size,
  });
  return currentHead;
}

export async function runPhase2AttendedChecklistCli({
  args,
  root = projectRoot,
  execFile = execFileSync,
  environment = process.env,
  collectSourceLedger,
  beforeWrite = async () => undefined,
  afterWrite = async () => undefined,
  log = console.log,
} = {}) {
  root = realpathSync(root);
  const collectLedger = collectSourceLedger ?? collectPhase2SourceLedger;
  const options = parsePhase2AttendedChecklistArgs(args ?? []);
  const serialHashes = {
    emulator: hashSerial(options.emulatorSerial),
    samsung: hashSerial(options.samsungSerial),
  };
  const manifestPath = resolvePhase2ManifestPath({
    root,
    manifestArgument: options.manifest,
  });
  const manifestRelativePath = relativeProjectPath(manifestPath, root);
  const unresolvedAttendedPaths = resolvePhase2AttendedPaths({
    root,
    requireDirectory: false,
  });
  const outputPath = path.resolve(root, options.output);
  const expectedOutputPath = unresolvedAttendedPaths.checklistPath;
  if (outputPath !== expectedOutputPath) {
    throw new Error("attended checklist output must be beside the Phase 2 manifest in attended/checklist.pending.json.");
  }
  const attendedPaths = await ensurePhase2AttendedPaths(root);
  const artifactDirectory = attendedPaths.artifactDirectory;
  const outputRelativePath = relativeProjectPath(outputPath, root);
  try {
    execFile("git", ["check-ignore", "-q", "--no-index", outputRelativePath], {
      cwd: root,
    });
  } catch {
    throw new Error("attended checklist output must be ignored by Git.");
  }
  const finalPath = path.join(artifactDirectory, "final-verification.json");
  const attendedEvidencePaths = [
    attendedPaths.emulatorPath,
    attendedPaths.samsungPath,
  ];
  if (existsSync(finalPath) || attendedEvidencePaths.some(existsSync)) {
    throw new Error("attended and final evidence must remain absent before attended review.");
  }
  const previousOutput = existsSync(outputPath) ? readFileSync(outputPath) : null;
  if (previousOutput !== null) {
    throw new Error(
      "attended checklist already exists; refusing to overwrite approved review bytes.",
    );
  }
  const manifest = readJson(manifestPath, "Phase 2 build manifest");
  const apkPath = path.resolve(root, manifest?.apk?.path ?? "");
  relativeProjectPath(apkPath, root);
  if (!existsSync(apkPath) || !statSync(apkPath).isFile()) {
    throw new Error("Phase 2 attended retained APK is missing.");
  }
  validateCurrentIdentity(manifest, apkPath, { execFile, root });

  const executable = adbExecutable(environment);
  const emulatorMetadata = probeAttendedDeviceMetadata({
    executable,
    serial: options.emulatorSerial,
    role: "emulator-supplementary",
    execFile,
    root,
    manifest,
  });
  const samsungMetadata = probeAttendedDeviceMetadata({
    executable,
    serial: options.samsungSerial,
    role: "samsung-physical",
    execFile,
    root,
    manifest,
  });
  let emulator;
  let samsung;
  try {
    installAttendedApk(
      executable, options.emulatorSerial, "emulator-supplementary",
      apkPath, root, execFile,
    );
    installAttendedApk(
      executable, options.samsungSerial, "samsung-physical",
      apkPath, root, execFile,
    );
    emulator = probeInstalledApk({
      executable, serial: options.emulatorSerial,
      serialSha256: serialHashes.emulator, role: "emulator-supplementary",
      manifest, metadata: emulatorMetadata, execFile, root,
    });
    samsung = probeInstalledApk({
      executable, serial: options.samsungSerial,
      serialSha256: serialHashes.samsung, role: "samsung-physical",
      manifest, metadata: samsungMetadata, execFile, root,
    });
  } catch (error) {
    throw new Error(`${error.message} Device state may be partially prepared; no checklist was written and no package restoration was attempted.`);
  }
  const { checklist, checklistSha256 } = await withPhase2EvidenceSealLock({
    root,
    operation: "prepare-attended-checklist",
  }, async () => {
    const lockedPaths = resolvePhase2AttendedPaths({ root });
    if (existsSync(lockedPaths.checklistPath)) {
      throw new Error(
        "attended checklist already exists; refusing to overwrite approved review bytes.",
      );
    }
    if (existsSync(lockedPaths.finalPath)
      || [lockedPaths.emulatorPath, lockedPaths.samsungPath].some(existsSync)) {
      throw new Error(
        "attended or final evidence appeared during attended preparation.",
      );
    }
    const lockedManifestPath = resolvePhase2ManifestPath({
      root,
      manifestArgument: options.manifest,
    });
    const lockedManifest = readJson(
      lockedManifestPath,
      "Phase 2 build manifest",
    );
    const lockedApkPath = path.resolve(root, lockedManifest?.apk?.path ?? "");
    const currentPlanningHead = validateCurrentIdentity(
      lockedManifest,
      lockedApkPath,
      { execFile, root },
    );
    const sourceLedger = await collectLedger(root);
    const value = buildPhase2AttendedChecklist({
      manifest: lockedManifest,
      manifestPath: manifestRelativePath,
      sourceLedger,
      emulator,
      samsung,
      currentPlanningHead,
    });
    await beforeWrite();
    resolvePhase2AttendedPaths({ root });
    resolvePhase2ManifestPath({
      root,
      manifestArgument: options.manifest,
    });
    if (existsSync(lockedPaths.checklistPath)
      || existsSync(lockedPaths.finalPath)
      || [lockedPaths.emulatorPath, lockedPaths.samsungPath].some(existsSync)) {
      throw new Error(
        "attended or final evidence appeared before writing the pending checklist.",
      );
    }
    const bytes = serializePhase2AttendedChecklist(value);
    const publication = await publishBytesNoClobber(outputPath, bytes);
    try {
      await afterWrite();
      if (existsSync(lockedPaths.finalPath)
        || [lockedPaths.emulatorPath, lockedPaths.samsungPath].some(existsSync)) {
        throw new Error(
          "attended or final evidence appeared while writing the pending checklist.",
        );
      }
      await finishPublishedBytes(publication);
    } catch (error) {
      let cleanupError;
      try {
        await rollbackPublishedBytes(publication);
      } catch (rollbackError) {
        cleanupError = rollbackError;
      }
      throwPrimaryAndCleanup(
        error,
        cleanupError,
        "Attended checklist publication and rollback both failed.",
      );
    }
    return {
      checklist: value,
      checklistSha256: createHash("sha256").update(bytes).digest("hex"),
    };
  });
  log(JSON.stringify({
    ok: true,
    status: "pending",
    output: outputRelativePath,
    rows: checklist.counts,
    apk_sha256: checklist.apk.sha256,
    checklist_sha256: checklistSha256,
  }));
  return checklist;
}

async function writeRoleRecordsTransactionally(
  records,
  root,
  { afterFirstRolePublish = async () => undefined } = {},
) {
  const attendedPaths = resolvePhase2AttendedPaths({ root });
  const expectedPaths = new Set([
    attendedPaths.emulatorPath,
    attendedPaths.samsungPath,
  ]);
  if (records.length !== expectedPaths.size
      || records.some(({ filePath }) => !expectedPaths.has(filePath))) {
    throw new Error("attended role records must use canonical attended paths.");
  }
  const temporary = records.map(({ filePath }) => ({
    filePath,
    temporaryPath: path.join(
      path.dirname(filePath),
      `.${path.basename(filePath)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`,
    ),
  }));
  const published = [];
  let primaryError;
  const cleanupErrors = [];
  try {
    if (records.some(({ filePath }) => existsSync(filePath))) {
      throw new Error("attended role records already exist; refusing to overwrite approval evidence.");
    }
    for (let index = 0; index < records.length; index += 1) {
      await writeFile(
        temporary[index].temporaryPath,
        `${JSON.stringify(records[index].value, null, 2)}\n`,
        { flag: "wx", mode: 0o600 },
      );
    }
    resolvePhase2AttendedPaths({ root });
    for (let index = 0; index < temporary.length; index += 1) {
      const entry = temporary[index];
      await link(entry.temporaryPath, entry.filePath);
      published.push(entry.filePath);
      if (index === 0) await afterFirstRolePublish();
    }
  } catch (error) {
    primaryError = error;
    for (const filePath of published) {
      try {
        const entry = temporary.find((candidate) => candidate.filePath === filePath);
        await rollbackPublishedBytes({
          filePath,
          retainedPath: entry.temporaryPath,
        });
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }
  }
  const temporaryCleanup = await Promise.allSettled(temporary.map(
    ({ temporaryPath }) => rm(temporaryPath, { force: true }),
  ));
  cleanupErrors.push(...temporaryCleanup
    .filter(({ status }) => status === "rejected")
    .map(({ reason }) => reason));
  if (primaryError !== undefined && cleanupErrors.length > 0) {
    throw new AggregateError(
      [primaryError, ...cleanupErrors],
      "Attended role publication and cleanup both failed.",
      { cause: primaryError },
    );
  }
  if (primaryError !== undefined) throw primaryError;
  if (cleanupErrors.length > 0) {
    throw new AggregateError(
      cleanupErrors,
      "Attended role temporary-file cleanup failed.",
    );
  }
}

export async function runPhase2AttendedRecordCli({
  args,
  root = projectRoot,
  execFile = execFileSync,
  environment = process.env,
  collectSourceLedger,
  beforePublish = async () => undefined,
  afterFirstRolePublish = async () => undefined,
  log = console.log,
} = {}) {
  root = realpathSync(root);
  const collectLedger = collectSourceLedger ?? collectPhase2SourceLedger;
  const options = parsePhase2AttendedRecordArgs(args ?? []);
  resolvePhase2ManifestPath({
    root,
    manifestArgument: options.manifest,
  });
  const { records, checklistSha256 } = await withPhase2EvidenceSealLock({
    root,
    operation: "record-attended-approval",
  }, async () => {
    const attendedPaths = resolvePhase2AttendedPaths({ root });
    if (existsSync(attendedPaths.finalPath)) {
      throw new Error(
        "final verification must be absent before recording attended approval.",
      );
    }
    const lockedManifestPath = resolvePhase2ManifestPath({
      root,
      manifestArgument: options.manifest,
    });
    const lockedManifest = readJson(
      lockedManifestPath,
      "Phase 2 build manifest",
    );
    const lockedApkPath = path.resolve(root, lockedManifest?.apk?.path ?? "");
    const lockedPlanningHead = validateCurrentIdentity(
      lockedManifest,
      lockedApkPath,
      { execFile, root },
    );
    const sourceLedger = await collectLedger(root);
    const checklistBytes = readFileSync(attendedPaths.checklistPath);
    const checklistSha256 = createHash("sha256")
      .update(checklistBytes)
      .digest("hex");
    if (checklistSha256 !== options.checklistSha256) {
      throw new Error("approved checklist SHA-256 does not match current bytes.");
    }
    const { checklist } = parsePhase2AttendedChecklistBytes(
      checklistBytes,
      { manifest: lockedManifest, sourceLedger },
    );
    if (checklist.current_planning_head !== lockedPlanningHead) {
      throw new Error("attended checklist planning identity is stale.");
    }
    const executable = adbExecutable(environment);
    const deviceInputs = [
      ["emulator-supplementary", options.emulatorSerial],
      ["samsung-physical", options.samsungSerial],
    ];
    const devices = Object.fromEntries(deviceInputs.map(([role, serial]) => [
      role,
      probePhase2AttendedDevice({
        executable, serial, role, manifest: lockedManifest, root, execFile,
      }),
    ]));
    const values = deviceInputs.map(([role]) => ({
      filePath: role === "emulator-supplementary"
        ? attendedPaths.emulatorPath : attendedPaths.samsungPath,
      value: buildPhase2AttendedRoleRecord({
        checklist, checklistSha256, role, device: devices[role],
      }),
    }));
    await beforePublish();
    resolvePhase2AttendedPaths({ root });
    if (existsSync(attendedPaths.finalPath)) {
      throw new Error(
        "final verification appeared before attended approval publication.",
      );
    }
    await writeRoleRecordsTransactionally(values, root, {
      afterFirstRolePublish,
    });
    return { records: values, checklistSha256 };
  });
  log(JSON.stringify({
    ok: true,
    status: "passed",
    checklist_sha256: checklistSha256,
    records: records.map(({ filePath }) => relativeProjectPath(filePath, root)),
  }));
  return records.map(({ value }) => value);
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const args = process.argv.slice(2);
  const recordApproved = args[0] === "--record-approved";
  (recordApproved
    ? runPhase2AttendedRecordCli({ args: args.slice(1) })
    : runPhase2AttendedChecklistCli({ args })
  ).catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      error: error.message,
    }));
    process.exitCode = 1;
  });
}

import { useMemo } from "react";
import {
  CryptoDigestAlgorithm,
  digestStringAsync,
} from "expo-crypto";

import {
  confirmGarminImportDate,
  prepareGarminImport,
  type ConfirmGarminImportInput,
  type GarminImportResult,
  type GarminSha256,
  type ImportedActivityCommandRepository,
  type PreparedGarminImport,
} from "../domains/activities/importCommands";
import {
  canonicalJson,
} from "../domains/activities/importContracts";
import type {
  GarminActivitySourcePort,
  GarminConnectionState,
  GarminSourceEnvelope,
} from "../domains/activities/garminActivitySourcePort";
import {
  createGarminActivityAdapter,
} from "../platform/garmin/garminActivityAdapter";
import {
  createGarminSyncCoordinator,
} from "../platform/garmin/garminSyncCoordinator";
import type {
  GarminSharedImportRequestFactory,
  GarminSyncCoordinator,
} from "../platform/garmin/garminSyncContracts";
import {
  normalizeGarminActivity,
} from "../platform/garmin/normalizeGarminActivity";

export type GarminImportedActivityListItem = Readonly<{
  activityId: string;
  title: string;
  activityType: string;
  confirmedLocalDate: string;
  summary?: string;
  matchState?: "matched" | "unmatched";
  revisionState?: "accepted" | "needs_review";
}>;

export type GarminRootOrigin = "workout" | "calendar" | "library" | "progress";

export function parseGarminRootOrigin(value: unknown): GarminRootOrigin {
  return value === "calendar" || value === "library" || value === "progress"
    ? value
    : "workout";
}

export type GarminImportApplicationPort = Readonly<{
  confirmGarminImport(input: ConfirmGarminImportInput): Promise<GarminImportResult>;
  loadGarminActivities(): Promise<readonly GarminImportedActivityListItem[]>;
}>;

export type GarminImportConfirmation = Omit<
  ConfirmGarminImportInput,
  "staged"
>;

export type GarminImportRuntimeServices = Readonly<{
  /** Created once from the application-owned SqliteKernel during root bootstrap. */
  importedActivities: ImportedActivityCommandRepository;
}>;

export type GarminImportSourceDate = Readonly<{
  sourceLocalDateTime?: string;
  sourceTimeZone?: string;
  sourceUtcOffsetMinutes?: number;
}>;

export type GarminImportPreparedDateProposal = Readonly<{
  kind: "date_confirmation_required";
  staged: PreparedGarminImport;
  date: Readonly<{
    absoluteStartedAtMs: number;
    sourceLocalDateTime?: string;
    sourceTimeZone?: string;
    sourceUtcOffsetMinutes?: number;
  }>;
}>;

export type GarminImportDateDecision =
  | Readonly<{
    kind: "confirmed";
    localDate: string;
    localTime: string;
    timeZone: string;
    utcOffsetMinutes: number;
  }>
  | Readonly<{ kind: "cancelled" | "stale" | "invalid" | "dst_gap" }>;

export type GarminImportDateResult = GarminImportResult | Readonly<{
  kind: "not_committed";
  reason: Exclude<GarminImportDateDecision["kind"], "confirmed">;
}>;

export type GarminImportRuntime = Readonly<{
  prepareEnvelope(input: Readonly<{
    envelope: GarminSourceEnvelope;
    sourceDate: GarminImportSourceDate;
  }>): Promise<GarminImportPreparedDateProposal>;
  confirmPreparedDate(input: Readonly<{
    proposal: GarminImportPreparedDateProposal;
    request: Omit<GarminImportConfirmation, "confirmedLocalDate">;
    decision: GarminImportDateDecision;
  }>): Promise<GarminImportDateResult>;
  commitEnvelope(input: Readonly<{
    envelope: GarminSourceEnvelope;
    confirmation: GarminImportConfirmation;
    assertCurrentGeneration?: () => Promise<void>;
  }>): Promise<GarminImportResult>;
}>;

/**
 * Framework-light facade over the existing application import service. It owns
 * neither a kernel nor a repository, so Garmin paths cannot open a second
 * SQLite connection or bypass the shared Phase 13 commands.
 */
export function createGarminImportRuntime(input: Readonly<{
  services: GarminImportRuntimeServices;
  sha256: GarminSha256;
  assertCurrentGeneration(): Promise<void>;
  invalidateReads(): Promise<void>;
}>): GarminImportRuntime {
  const commitPrepared = async (
    staged: PreparedGarminImport,
    confirmation: GarminImportConfirmation,
    assertCurrentGeneration = input.assertCurrentGeneration,
  ): Promise<GarminImportResult> => {
    await assertCurrentGeneration();
    const result = await confirmGarminImportDate(
      input.services.importedActivities,
      { ...confirmation, staged },
    );
    if (result.kind === "imported") {
      await input.invalidateReads();
    }
    return result;
  };
  return Object.freeze({
    async prepareEnvelope({ envelope, sourceDate }) {
      const staged = await prepareGarminImport(envelope, input.sha256);
      return Object.freeze({
        kind: "date_confirmation_required" as const,
        staged,
        date: Object.freeze({
          absoluteStartedAtMs: staged.envelope.normalized.started_at_ms,
          ...sourceDate,
        }),
      });
    },
    async confirmPreparedDate({ proposal, request, decision }) {
      if (decision.kind !== "confirmed") {
        return Object.freeze({ kind: "not_committed" as const, reason: decision.kind });
      }
      const dateProvenance = Object.freeze({
        absoluteStartedAtMs: proposal.date.absoluteStartedAtMs,
        ...(proposal.date.sourceLocalDateTime === undefined ? {} : { sourceLocalDateTime: proposal.date.sourceLocalDateTime }),
        ...(proposal.date.sourceTimeZone === undefined ? {} : { sourceTimeZone: proposal.date.sourceTimeZone }),
        ...(proposal.date.sourceUtcOffsetMinutes === undefined ? {} : { sourceUtcOffsetMinutes: proposal.date.sourceUtcOffsetMinutes }),
        confirmedLocalDate: decision.localDate,
        confirmedLocalTime: decision.localTime,
        confirmedTimeZone: decision.timeZone,
        confirmedUtcOffsetMinutes: decision.utcOffsetMinutes,
      });
      return commitPrepared(proposal.staged, {
        ...request,
        confirmedLocalDate: decision.localDate,
        dateProvenance,
      });
    },
    async commitEnvelope({ envelope, confirmation, assertCurrentGeneration }) {
      const staged = await prepareGarminImport(envelope, input.sha256);
      return commitPrepared(staged, confirmation, assertCurrentGeneration);
    },
  });
}

export type GarminRootRuntime = Readonly<{
  source: GarminActivitySourcePort;
  coordinator: GarminSyncCoordinator;
  loadActivities(): Promise<readonly GarminImportedActivityListItem[]>;
}>;

export function createGarminRootRuntime(input: Readonly<{
  source: GarminActivitySourcePort;
  services: GarminImportRuntimeServices;
  sha256: GarminSha256;
  requestFor: GarminSharedImportRequestFactory;
  loadActivities(): Promise<readonly GarminImportedActivityListItem[]>;
}>): GarminRootRuntime {
  const importer = createGarminImportRuntime({
    services: input.services,
    sha256: input.sha256,
    assertCurrentGeneration: async () => undefined,
    invalidateReads: async () => undefined,
  });
  const coordinator = createGarminSyncCoordinator({
    source: input.source,
    importActivity: async (envelope, assertCurrentGeneration) => {
      const confirmation = await input.requestFor(
        await prepareGarminImport(envelope, input.sha256),
      );
      return importer.commitEnvelope({
        envelope,
        confirmation,
        assertCurrentGeneration,
      });
    },
  });
  return Object.freeze({
    source: input.source,
    coordinator,
    loadActivities: input.loadActivities,
  });
}

function rememberAccountNamespace(
  state: GarminConnectionState,
  accountNamespace: { current: string | null },
): GarminConnectionState {
  accountNamespace.current = state.kind === "connected"
    ? state.account_namespace
    : state.kind === "disconnected"
      ? null
      : accountNamespace.current;
  return state;
}

function activityIdFromSummary(summary: unknown): string {
  if (summary === null || typeof summary !== "object" || Array.isArray(summary)) {
    throw new Error("garmin_source_invalid");
  }
  const value = (summary as Readonly<Record<string, unknown>>).activityId;
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }
  if (typeof value === "string" && /^[1-9][0-9]{0,18}$/u.test(value)) {
    return value;
  }
  throw new Error("garmin_source_invalid");
}

function createProductionGarminSource(sha256: GarminSha256): GarminActivitySourcePort {
  const accountNamespace = { current: null as string | null };
  const requireAccountNamespace = () => {
    if (accountNamespace.current === null) throw new Error("sign_in_required");
    return accountNamespace.current;
  };
  const adapter = createGarminActivityAdapter({
    mapper: {
      fromSummary: (summary) => normalizeGarminActivity({
        account_namespace: requireAccountNamespace(),
        external_activity_id: activityIdFromSummary(summary),
        activity: summary,
        splits: { lapDTOs: [] },
        details: { metricDescriptors: [], activityDetailMetrics: [] },
      }, sha256),
      fromActivity: (activity) => normalizeGarminActivity({
        account_namespace: requireAccountNamespace(),
        ...activity,
      }, sha256),
    },
  });
  return Object.freeze({
    async connectionState() {
      return rememberAccountNamespace(await adapter.connectionState(), accountNamespace);
    },
    async login(input) {
      return rememberAccountNamespace(await adapter.login(input), accountNamespace);
    },
    async resumeMfa(input) {
      return rememberAccountNamespace(await adapter.resumeMfa(input), accountNamespace);
    },
    async logout() {
      accountNamespace.current = null;
      await adapter.logout();
    },
    listRunningSummaries: (input) => adapter.listRunningSummaries(input),
    readActivity: (externalActivityId) => adapter.readActivity(externalActivityId),
  });
}

function confirmedLocalDate(startedAtMs: number): string {
  const date = new Date(startedAtMs);
  if (!Number.isFinite(date.getTime())) throw new Error("garmin_source_invalid");
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createProductionRequestFactory(sha256: GarminSha256): GarminSharedImportRequestFactory {
  return async (prepared) => {
    const identitySha256 = await sha256(canonicalJson({
      source_kind: prepared.envelope.source_kind,
      account_namespace: prepared.envelope.account_namespace,
      external_activity_id: prepared.envelope.external_activity_id,
    }));
    const localDate = confirmedLocalDate(prepared.envelope.normalized.started_at_ms);
    const requestSha256 = await sha256(canonicalJson({
      identity_sha256: identitySha256,
      normalized_json_sha256: prepared.envelope.normalized_json_sha256,
      confirmed_local_date: localDate,
    }));
    return Object.freeze({
      requestId: `garmin-import:${requestSha256.slice(0, 48)}`,
      requestSha256,
      activityId: `activity-${identitySha256.slice(0, 48)}`,
      expectedAggregateRevision: 0,
      confirmedLocalDate: localDate,
    });
  };
}

const productionSha256: GarminSha256 = (value) =>
  digestStringAsync(CryptoDigestAlgorithm.SHA256, value);

export function useGarminImportRuntime(input: Readonly<{
  application: GarminImportApplicationPort;
  source?: GarminActivitySourcePort;
  sha256?: GarminSha256;
  requestFor?: GarminSharedImportRequestFactory;
}>): GarminRootRuntime {
  const sha256 = input.sha256 ?? productionSha256;
  const source = useMemo(
    () => input.source ?? createProductionGarminSource(sha256),
    [input.source, sha256],
  );
  const services = useMemo<GarminImportRuntimeServices>(() => Object.freeze({
    importedActivities: Object.freeze({
      confirmGarminImport: input.application.confirmGarminImport,
    }),
  }), [input.application.confirmGarminImport]);
  const requestFor = useMemo(
    () => input.requestFor ?? createProductionRequestFactory(sha256),
    [input.requestFor, sha256],
  );
  return useMemo(() => createGarminRootRuntime({
    source,
    services,
    sha256,
    requestFor,
    loadActivities: input.application.loadGarminActivities,
  }), [input.application.loadGarminActivities, requestFor, services, sha256, source]);
}

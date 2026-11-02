import React from "react";
import Constants from "expo-constants";
import {
  Redirect,
  router,
  useFocusEffect,
  useLocalSearchParams,
  type Href,
} from "expo-router";

import {
  useCalendarRangeReadPort,
} from "../../src/bootstrap/workoutAppRuntime";
import {
  CalendarScreen,
} from "../../src/ui/screens/CalendarScreen";
import type {
  CalendarEventDestination,
} from "../../src/ui/calendar/calendarPorts";
import { useCurrentLocalDate } from "../../src/ui/calendar/useCurrentLocalDate";
import { useRootSettingsController } from "../../src/ui/shell/AppRootShell";
import {
  rootSettingsTriggerNativeID,
  useRootHeadingRef,
} from "../../src/ui/shell/rootFocus";
import {
  clearPhase16CalendarTestControls,
  configurePhase16CalendarTestControls,
  createPhase16CalendarDiagnosticsProducer,
  phase16CalendarDiagnosticsRequestFromNativeContract,
  phase16CalendarStageFromNativeContract,
} from "../../src/bootstrap/phase16CalendarTestControls";
import {
  clearPhase20CalendarObservationCollector,
  configurePhase20CalendarObservationCollector,
  phase20CalendarInitialDate,
  phase20CalendarRequestFromNativeContract,
} from "../../src/bootstrap/phase20CalendarObservation";
import { createImportedActivityDetailHref } from "../../src/navigation/importedActivityRoute";
import { usePhase20VisualRequest } from "../../src/testing/phase20VisualContext";
import {
  createPhase20CalendarFixtureReadPort,
  emitPhase20CalendarProbeReceipt,
  phase20CalendarFixtureRequestFromNativeContract,
  phase20CalendarProbeReceiptRequestFromNativeContract,
} from "../../src/testing/phase20CalendarFixture";
import { phase20CalendarEvidencePathRequested } from "../../src/testing/phase20CalendarRuntime";

function routeId(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? encodeURIComponent(value)
    : null;
}

function scalarRouteParam(value: string | readonly string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function calendarQuery(returnEventId: string | undefined, extra: readonly [string, string][] = []): string {
  const entries: [string, string][] = [["origin", "calendar"], ...extra];
  if (returnEventId !== undefined) entries.push(["returnEventId", returnEventId]);
  return entries.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("&");
}

type CalendarRouteParams = Readonly<{
    phase16CalendarStage?: string | string[];
    phase16CalendarDiagnostics?: string | string[];
    querySamples?: string | string[];
    interactionSamples?: string | string[];
    diagnosticStreamId?: string | string[];
    phase20CalendarStage?: string | string[];
    phase20CalendarNonce?: string | string[];
    phase20CalendarFlowSha256?: string | string[];
    phase20CalendarFlowRevision?: string | string[];
    phase20CalendarFixture?: string | string[];
    phase20CalendarEvidenceNonce?: string | string[];
    phase20CalendarRequirementsSha256?: string | string[];
    phase20CalendarFixtureSourceSha256?: string | string[];
    phase20CalendarRequirement?: string | string[];
    phase20CalendarEvidenceId?: string | string[];
    phase20CalendarProbe?: string | string[];
    phase20CalendarProbeReceipt?: string | string[];
}>;

type NativeIdentity = Readonly<{
  packageName: string | undefined;
  buildProfile: string | undefined;
  nativeContractsEnabled: boolean;
  suite: string | undefined;
}>;

export default function CalendarRoute() {
  const routeParams = useLocalSearchParams<CalendarRouteParams>();
  const extra = Constants.expoConfig?.extra;
  const nativeIdentity = {
    packageName: typeof Constants.expoConfig?.android?.package === "string"
      ? Constants.expoConfig.android.package
      : undefined,
    buildProfile: typeof extra?.buildProfile === "string" ? extra.buildProfile : undefined,
    nativeContractsEnabled: extra?.nativeContractsEnabled === true,
    suite: typeof extra?.nativeContractSuite === "string" ? extra.nativeContractSuite : undefined,
  } as const;
  const phase20Request = phase20CalendarRequestFromNativeContract({
    ...nativeIdentity,
    stage: scalarRouteParam(routeParams.phase20CalendarStage),
    nonce: scalarRouteParam(routeParams.phase20CalendarNonce),
    flowSha256: scalarRouteParam(routeParams.phase20CalendarFlowSha256),
    flowRevision: scalarRouteParam(routeParams.phase20CalendarFlowRevision),
  });
  const phase20FixtureRequested = phase20Request !== null || phase20CalendarFixtureRequestFromNativeContract({
    ...nativeIdentity,
    fixtureId: scalarRouteParam(routeParams.phase20CalendarFixture),
    nonce: scalarRouteParam(routeParams.phase20CalendarEvidenceNonce),
    requirementsSha256: scalarRouteParam(routeParams.phase20CalendarRequirementsSha256),
  });
  const phase20ProbeId = scalarRouteParam(routeParams.phase20CalendarProbe);
  const calendarRangeRead = React.useMemo(
    () => createPhase20CalendarFixtureReadPort(phase20ProbeId),
    [phase20ProbeId],
  );
  if (phase20CalendarEvidencePathRequested(routeParams)) {
    if (!phase20FixtureRequested) return <Redirect href="/" />;
    return (
      <CalendarRouteContent
        calendarRangeRead={calendarRangeRead}
        nativeIdentity={nativeIdentity}
        phase20FixtureRequested
        phase20Request={phase20Request}
        routeParams={routeParams}
      />
    );
  }
  return (
    <ProductionCalendarRouteContent
      nativeIdentity={nativeIdentity}
      routeParams={routeParams}
    />
  );
}

function ProductionCalendarRouteContent({
  nativeIdentity,
  routeParams,
}: Readonly<{
  nativeIdentity: NativeIdentity;
  routeParams: CalendarRouteParams;
}>) {
  const calendarRead = useCalendarRangeReadPort();
  return (
    <CalendarRouteContent
      calendarRangeRead={calendarRead}
      nativeIdentity={nativeIdentity}
      phase20FixtureRequested={false}
      phase20Request={null}
      routeParams={routeParams}
    />
  );
}

function CalendarRouteContent({
  calendarRangeRead,
  nativeIdentity,
  phase20FixtureRequested,
  phase20Request,
  routeParams,
}: Readonly<{
  calendarRangeRead: ReturnType<typeof useCalendarRangeReadPort>;
  nativeIdentity: NativeIdentity;
  phase20FixtureRequested: boolean;
  phase20Request: ReturnType<typeof phase20CalendarRequestFromNativeContract>;
  routeParams: CalendarRouteParams;
}>) {
  const settingsActionNativeID = rootSettingsTriggerNativeID("calendar");
  const headingRef = useRootHeadingRef("calendar");
  const settingsActionRef = React.useRef(null);
  const rootSettings = useRootSettingsController();
  const phase16Stage = phase16CalendarStageFromNativeContract({
    ...nativeIdentity,
    stage: scalarRouteParam(routeParams.phase16CalendarStage),
  }) ?? undefined;
  const phase20ProbeId = scalarRouteParam(routeParams.phase20CalendarProbe);
  const phase20ProbeReceipt = phase20CalendarProbeReceiptRequestFromNativeContract({
    ...nativeIdentity,
    fixtureId: scalarRouteParam(routeParams.phase20CalendarFixture),
    nonce: scalarRouteParam(routeParams.phase20CalendarEvidenceNonce),
    flowSha256: scalarRouteParam(routeParams.phase20CalendarRequirementsSha256),
    fixtureSourceSha256: scalarRouteParam(routeParams.phase20CalendarFixtureSourceSha256),
    requirementId: scalarRouteParam(routeParams.phase20CalendarRequirement),
    evidenceId: scalarRouteParam(routeParams.phase20CalendarEvidenceId),
    probeId: phase20ProbeId,
    status: scalarRouteParam(routeParams.phase20CalendarProbeReceipt),
  });
  const phase20EvidenceEntries: readonly [string, string][] = phase20FixtureRequested
    ? [
        ["phase20CalendarFixture", scalarRouteParam(routeParams.phase20CalendarFixture) ?? "v12-calendar-isolated-facts-v1"],
        ["phase20CalendarEvidenceNonce", scalarRouteParam(routeParams.phase20CalendarEvidenceNonce) ?? phase20Request?.nonce ?? ""],
        ["phase20CalendarRequirementsSha256", scalarRouteParam(routeParams.phase20CalendarRequirementsSha256) ?? phase20Request?.flowSha256 ?? ""],
      ]
    : [];
  const diagnosticsEnabled = scalarRouteParam(routeParams.phase16CalendarDiagnostics);
  const diagnosticsQuerySamples = scalarRouteParam(routeParams.querySamples);
  const diagnosticsInteractionSamples = scalarRouteParam(routeParams.interactionSamples);
  const diagnosticsStreamId = scalarRouteParam(routeParams.diagnosticStreamId);
  const diagnosticsRequest = React.useMemo(() => phase16CalendarDiagnosticsRequestFromNativeContract({
    ...nativeIdentity,
    enabled: diagnosticsEnabled,
    querySamples: diagnosticsQuerySamples,
    interactionSamples: diagnosticsInteractionSamples,
  }), [diagnosticsEnabled, diagnosticsInteractionSamples, diagnosticsQuerySamples, nativeIdentity.buildProfile, nativeIdentity.nativeContractsEnabled, nativeIdentity.packageName, nativeIdentity.suite]);
  const diagnosticsProducer = React.useMemo(() => createPhase16CalendarDiagnosticsProducer({
    ...nativeIdentity,
    request: diagnosticsRequest,
    emitLine: (line) => console.info(line),
    ...(diagnosticsStreamId === undefined ? {} : { streamId: diagnosticsStreamId }),
  }), [diagnosticsRequest, diagnosticsStreamId, nativeIdentity.buildProfile, nativeIdentity.nativeContractsEnabled, nativeIdentity.packageName, nativeIdentity.suite]);
  const diagnosticsRuntime = React.useMemo(() => diagnosticsProducer === null || diagnosticsRequest === null
    ? undefined
    : Object.freeze({ producer: diagnosticsProducer, request: diagnosticsRequest }), [diagnosticsProducer, diagnosticsRequest]);
  const [returnFocusGeneration, setReturnFocusGeneration] = React.useState(0);
  const hasFocused = React.useRef(false);
  const currentLocalDate = useCurrentLocalDate();
  const initialDate = usePhase20VisualRequest() === null
    ? currentLocalDate
    : "2026-10-01";
  const routedInitialDate = phase20Request === null
    ? phase20FixtureRequested ? "2026-10-15" : initialDate
    : phase20CalendarInitialDate(phase20Request.stage);
  const openEvent = (destination: CalendarEventDestination, returnEventId?: string) => {
    switch (destination.kind) {
      case "session": {
        const sessionId = routeId(destination.sessionId);
        if (sessionId === null) return;
        router.push((`/session/${sessionId}?${calendarQuery(returnEventId, phase20EvidenceEntries)}`) as Href);
        return;
      }
      case "occurrence": {
        const occurrenceId = routeId(destination.occurrenceId);
        if (occurrenceId === null) return;
        router.push((`/calendar/plan/${occurrenceId}?${calendarQuery(returnEventId, phase20EvidenceEntries)}`) as Href);
        return;
      }
      case "plan": {
        const planId = routeId(destination.planId);
        const sessionId = routeId(destination.sessionId);
        if (planId === null || sessionId === null) return;
        // This preserves the typed handoff only; Plan 16-07 owns real Running integration.
        router.push((`/library/running/${planId}?${calendarQuery(returnEventId, [["sessionId", destination.sessionId], ...phase20EvidenceEntries])}`) as Href);
        return;
      }
      case "activity": {
        const href = createImportedActivityDetailHref({
          activityId: destination.activityId,
          origin: "calendar",
        });
        if (phase20EvidenceEntries.length === 0) router.push(href);
        else router.push({ pathname: "/garmin/activity/[activityId]", params: {
          activityId: destination.activityId, origin: "calendar", ...Object.fromEntries(phase20EvidenceEntries),
        } } as Href);
        return;
      }
    }
  };

  useFocusEffect(React.useCallback(() => {
    if (hasFocused.current) {
      setReturnFocusGeneration((generation) => generation + 1);
    } else {
      hasFocused.current = true;
    }
  }, []));

  React.useLayoutEffect(() => {
    configurePhase16CalendarTestControls({
      ...nativeIdentity,
      stage: phase16Stage,
    });
    return clearPhase16CalendarTestControls;
  }, [phase16Stage]);

  React.useLayoutEffect(() => {
    configurePhase20CalendarObservationCollector({ request: phase20Request });
    return clearPhase20CalendarObservationCollector;
  }, [phase20Request?.flowRevision, phase20Request?.flowSha256, phase20Request?.nonce, phase20Request?.stage]);

  React.useEffect(() => {
    void emitPhase20CalendarProbeReceipt(phase20ProbeReceipt);
  }, [phase20ProbeReceipt?.evidenceId, phase20ProbeReceipt?.fixtureSourceSha256, phase20ProbeReceipt?.flowSha256, phase20ProbeReceipt?.nonce, phase20ProbeReceipt?.probeId, phase20ProbeReceipt?.requirementId]);

  return (
    <CalendarScreen
      {...(phase16Stage === undefined ? {} : { diagnosticStage: phase16Stage })}
      initialDate={routedInitialDate}
      {...(diagnosticsRuntime === undefined ? {} : { diagnostics: diagnosticsRuntime })}
      loadCalendarRange={calendarRangeRead.loadCalendarRange}
      onOpenSettings={() => rootSettings.openRootSettings({
        root: "calendar",
        triggerNativeID: settingsActionNativeID,
        triggerRef: settingsActionRef,
      })}
      onOpenEvent={openEvent}
      onRequestRootBack={() => router.back()}
      returnFocusGeneration={returnFocusGeneration}
      today={initialDate}
      headingRef={headingRef}
      settingsActionRef={settingsActionRef}
      settingsActionNativeID={settingsActionNativeID}
    />
  );
}

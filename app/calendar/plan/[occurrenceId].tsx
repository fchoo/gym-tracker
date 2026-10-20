import { router, useLocalSearchParams } from "expo-router";
import React from "react";
import Constants from "expo-constants";

import { parseCalendarRouteOrigin, parseScalarRouteParam } from "../../../src/navigation/routeOrigin";
import { CalendarPlannedStrengthRouteAdapter } from "../../../src/ui/calendar/CalendarRouteAdapters";
import { PlannedWorkoutDetailScreen } from "../../../src/ui/screens/PlannedWorkoutDetailScreen";
import { phase20CalendarFixtureRequestFromNativeContract, phase20CalendarPlannedOccurrence } from "../../../src/testing/phase20CalendarFixture";
import { useV12NativeAcceptanceProductAction } from "../../../src/testing/v12NativeAcceptanceFixture";

export default function CalendarPlannedWorkoutRoute() {
  const nativeAcceptanceAction = useV12NativeAcceptanceProductAction("multi-plan");
  const { occurrenceId, origin, phase20CalendarFixture, phase20CalendarEvidenceNonce, phase20CalendarRequirementsSha256 } = useLocalSearchParams() as Readonly<{
    occurrenceId?: string | readonly string[];
    origin?: string | readonly string[];
    phase20CalendarFixture?: string | readonly string[];
    phase20CalendarEvidenceNonce?: string | readonly string[];
    phase20CalendarRequirementsSha256?: string | readonly string[];
  }>;
  const parsedOccurrenceId = parseScalarRouteParam(occurrenceId);
  const parsedOrigin = parseCalendarRouteOrigin(origin, { managementOrigins: [] });
  const exactOccurrenceId = parsedOrigin.kind === "calendar" && parsedOccurrenceId.kind === "value"
    ? parsedOccurrenceId.value
    : "";
  const extra = Constants.expoConfig?.extra;
  const scalar = (value: string | readonly string[] | undefined) => typeof value === "string" ? value : undefined;
  const fixtureEnabled = phase20CalendarFixtureRequestFromNativeContract({ packageName: Constants.expoConfig?.android?.package,
    buildProfile: extra?.buildProfile, nativeContractsEnabled: extra?.nativeContractsEnabled, suite: extra?.nativeContractSuite,
    fixtureId: scalar(phase20CalendarFixture), nonce: scalar(phase20CalendarEvidenceNonce), requirementsSha256: scalar(phase20CalendarRequirementsSha256) });
  if (fixtureEnabled) return <PlannedWorkoutDetailScreen occurrenceId={exactOccurrenceId} loadOccurrence={async (id) => phase20CalendarPlannedOccurrence(id)} onBack={() => router.back()} />;
  return (
    <CalendarPlannedStrengthRouteAdapter
      {...(nativeAcceptanceAction === undefined ? {} : { nativeAcceptanceAction })}
      occurrenceId={exactOccurrenceId}
      onBack={() => router.back()}
    />
  );
}

import {
  router,
  useLocalSearchParams,
} from "expo-router";
import React from "react";
import Constants from "expo-constants";

import {
  useWorkoutAppRuntime,
} from "../../../src/bootstrap/workoutAppRuntime";
import {
  SessionCorrectionScreen,
} from "../../../src/ui/screens/SessionCorrectionScreen";
import { parseScalarRouteParam } from "../../../src/navigation/routeOrigin";
import { phase20CalendarCorrectionState, phase20CalendarFixtureRequestFromNativeContract } from "../../../src/testing/phase20CalendarFixture";
import { HistoryCorrectionConflictError } from "../../../src/domains/history";

export default function SessionCorrectionRoute() {
  const { sessionId, phase20CalendarFixture, phase20CalendarEvidenceNonce, phase20CalendarRequirementsSha256 } = useLocalSearchParams<{
    sessionId: string; phase20CalendarFixture?: string | string[]; phase20CalendarEvidenceNonce?: string | string[]; phase20CalendarRequirementsSha256?: string | string[];
  }>();
  const runtime = useWorkoutAppRuntime();
  const fixtureSaveAttempt = React.useRef(0);
  const resolvedSessionId = sessionId ?? "unknown";
  const scalar = (value: string | readonly string[] | undefined) => {
    const parsed = parseScalarRouteParam(value); return parsed.kind === "value" ? parsed.value : undefined;
  };
  const extra = Constants.expoConfig?.extra;
  const fixture = phase20CalendarFixtureRequestFromNativeContract({ packageName: Constants.expoConfig?.android?.package,
    buildProfile: extra?.buildProfile, nativeContractsEnabled: extra?.nativeContractsEnabled, suite: extra?.nativeContractSuite,
    fixtureId: scalar(phase20CalendarFixture), nonce: scalar(phase20CalendarEvidenceNonce), requirementsSha256: scalar(phase20CalendarRequirementsSha256) })
    ? phase20CalendarCorrectionState(resolvedSessionId) : null;

  return (
    <SessionCorrectionScreen
      correctSession={fixture === null ? runtime.correctHistorySession : async () => {
        fixtureSaveAttempt.current += 1;
        if (fixtureSaveAttempt.current === 1) throw new HistoryCorrectionConflictError();
        if (fixtureSaveAttempt.current === 2) throw new Error("isolated_fixture_save_failure");
        return { effectiveRevision: fixture.effectiveRevision + 1, snapshot: fixture.snapshot };
      }}
      listAvailableExercises={fixture === null ? runtime.listAvailableCorrectionExercises : async () => []}
      loadCorrectionSession={fixture === null ? runtime.loadHistoryCorrectionSession : async () => fixture}
      onBack={() => router.back()}
      onSaved={() => router.back()}
      sessionId={resolvedSessionId}
    />
  );
}

import Constants from "expo-constants";
import { Redirect, useLocalSearchParams } from "expo-router";
import React from "react";

import { Phase20QualityProbe, phase20QualityEnabled, resolvePhase20QualityRequest } from "../src/testing/phase20QualityInstrumentation";

export default function Phase20QualityProbeRoute() {
  const request = resolvePhase20QualityRequest(useLocalSearchParams());
  if (!phase20QualityEnabled(Constants.expoConfig?.extra) || request === null) return <Redirect href="/" />;
  return <Phase20QualityProbe key={request.nonce} request={request} />;
}

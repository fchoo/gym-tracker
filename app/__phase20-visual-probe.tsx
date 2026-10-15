import Constants from "expo-constants";
import { Redirect, useLocalSearchParams } from "expo-router";
import React from "react";

import {
  Phase20VisualProbe,
  resolvePhase20VisualProbe,
} from "../src/testing/phase20VisualProbe";

export default function Phase20VisualProbeRoute() {
  const params = useLocalSearchParams();
  const extra = Constants.expoConfig?.extra;
  const request = resolvePhase20VisualProbe(params);
  if (extra?.buildProfile !== "development-test"
    || extra?.nativeContractsEnabled !== true
    || extra?.nativeContractSuite !== "v1.2-acceptance"
    || request === null) return <Redirect href="/" />;
  return <Phase20VisualProbe key={request.nonce} request={request} />;
}

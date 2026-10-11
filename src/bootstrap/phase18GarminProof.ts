import {
  CryptoDigestAlgorithm,
  digestStringAsync,
} from "expo-crypto";

import { getGarminConnectNativeModule } from "../../modules/garmin-connect/src";
import { createGarminActivityAdapter } from "../platform/garmin/garminActivityAdapter";
import { createPhase18GarminProofHarness } from "../testing/phase18GarminProof";

export function createProductionPhase18GarminProofHarness() {
  const nativePort = getGarminConnectNativeModule();
  const authPort = createGarminActivityAdapter({
    driver: nativePort,
    // Plan 18-04 owns canonical normalization. The proof path deliberately uses
    // this adapter only for auth and the fixed native bridge for bounded reads.
    mapper: {
      fromSummary: () => {
        throw new Error("phase18_proof_normalization_not_available");
      },
      fromActivity: () => {
        throw new Error("phase18_proof_normalization_not_available");
      },
    },
  });
  return createPhase18GarminProofHarness({
    authPort,
    nativePort,
    sha256: (value) => digestStringAsync(CryptoDigestAlgorithm.SHA256, value),
  });
}

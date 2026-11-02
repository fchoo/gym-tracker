import Constants from "expo-constants";
import { Redirect } from "expo-router";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useWorkoutAppRuntime } from "../src/bootstrap/workoutAppRuntime";

const PROOF_PREFIX = "PHASE14_SOURCE_STATE_PROOF";

function phase14SourceStateProofEnabled(): boolean {
  const extra = Constants.expoConfig?.extra;
  return extra?.buildProfile === "development-test"
    && extra?.nativeContractsEnabled === true
    && (extra?.nativeContractSuite === "phase14"
      || extra?.nativeContractSuite === "v1.2-acceptance");
}

function SourceStateProofContent() {
  const runtime = useWorkoutAppRuntime();
  const [output, setOutput] = React.useState(`${PROOF_PREFIX}_PENDING`);
  const startedRef = React.useRef(false);

  React.useEffect(() => {
    if (runtime.launchState !== "trusted") return;
    if (startedRef.current) return;
    startedRef.current = true;
    let active = true;
    void runtime.collectPhase14SourceStateProof().then((proof) => {
      if (!active) return;
      setOutput(
        `${PROOF_PREFIX} digest_sha256=${proof.digest_sha256}`
        + ` table_count=${proof.table_count}`
        + ` row_count=${proof.row_count}`
        + ` schema_version=${proof.schema_version}`,
      );
    }).catch(() => {
      if (active) setOutput(`${PROOF_PREFIX}_ERROR`);
    });
    return () => {
      active = false;
    };
  }, [runtime]);

  return (
    <View style={styles.root}>
      <Text accessibilityLabel={output} selectable testID="phase14-source-state-proof">
        {output}
      </Text>
    </View>
  );
}

export default function Phase14SourceStateProofRoute() {
  if (!phase14SourceStateProofEnabled()) {
    return <Redirect href="/" />;
  }
  return <SourceStateProofContent />;
}

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
});

import Constants from "expo-constants";
import {
  CryptoDigestAlgorithm,
  digestStringAsync,
} from "expo-crypto";
import { Redirect, useLocalSearchParams } from "expo-router";
import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { getGarminConnectNativeModule } from "../modules/garmin-connect/src";
import { createGarminActivityAdapter } from "../src/platform/garmin/garminActivityAdapter";
import {
  PHASE18_GARMIN_PROOF_RESULT_MARKER,
  createPhase18GarminProofHarness,
  phase18GarminProofEnabled,
  type Phase18GarminProofCase,
} from "../src/testing/phase18GarminProof";

type ScreenState =
  | "login"
  | "mfa"
  | "working"
  | "complete"
  | "technical_review_required";

function emitCases(cases: readonly Phase18GarminProofCase[]): void {
  for (const result of cases) {
    console.log(`${PHASE18_GARMIN_PROOF_RESULT_MARKER}${JSON.stringify(result)}`);
  }
}

function Phase18GarminProofContent({ operation }: Readonly<{
  operation: "login" | "restore";
}>) {
  const nativePort = React.useMemo(() => getGarminConnectNativeModule(), []);
  const authPort = React.useMemo(() => createGarminActivityAdapter({
    driver: nativePort,
    // Plan 18-04 owns canonical normalization. The proof route uses the adapter
    // only for foreground auth and the fixed native bridge for bounded reads.
    mapper: {
      fromSummary: () => {
        throw new Error("phase18_proof_normalization_not_available");
      },
      fromActivity: () => {
        throw new Error("phase18_proof_normalization_not_available");
      },
    },
  }), [nativePort]);
  const harness = React.useMemo(() => createPhase18GarminProofHarness({
    authPort,
    nativePort,
    sha256: (value) => digestStringAsync(CryptoDigestAlgorithm.SHA256, value),
  }), [authPort, nativePort]);
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [mfaCode, setMfaCode] = React.useState("");
  const [challengeHandle, setChallengeHandle] = React.useState<string>();
  const [state, setState] = React.useState<ScreenState>(
    operation === "restore" ? "working" : "login",
  );
  const restoreStarted = React.useRef(false);

  const finishRead = React.useCallback(async () => {
    const result = await harness.readOneActivity();
    emitCases([result]);
    setState(
      result.status === "passed"
        ? "complete"
        : "technical_review_required",
    );
  }, [harness]);

  React.useEffect(() => {
    if (operation !== "restore" || restoreStarted.current) return;
    restoreStarted.current = true;
    let active = true;
    void harness.restoreAndRefresh().then((cases) => {
      if (!active) return;
      emitCases(cases);
      setState(
        cases.every(({ status }) => status === "passed")
          ? "complete"
          : "technical_review_required",
      );
    });
    return () => {
      active = false;
    };
  }, [harness, operation]);

  const submitLogin = React.useCallback(() => {
    if (state !== "login" || email.length === 0 || password.length === 0) return;
    setState("working");
    const pending = harness.login({ email, password });
    setEmail("");
    setPassword("");
    void pending.then(async (result) => {
      emitCases(result.cases);
      if (result.next === "halt") {
        setState("technical_review_required");
      } else if (result.next === "read") {
        await finishRead();
      } else {
        setChallengeHandle(result.next.challengeHandle);
        setState("mfa");
      }
    });
  }, [email, finishRead, harness, password, state]);

  const submitMfa = React.useCallback(() => {
    if (state !== "mfa" || challengeHandle === undefined || mfaCode.length === 0) {
      return;
    }
    setState("working");
    const pending = harness.resumeMfa(challengeHandle, mfaCode);
    setMfaCode("");
    void pending.then(async (result) => {
      emitCases(result.cases);
      if (result.next === "halt") {
        setState("technical_review_required");
      } else {
        setChallengeHandle(undefined);
        await finishRead();
      }
    });
  }, [challengeHandle, finishRead, harness, mfaCode, state]);

  return (
    <View style={styles.root}>
      <Text accessibilityRole="header" style={styles.title}>
        Garmin technical proof
      </Text>
      <Text style={styles.status}>{state}</Text>
      {state === "login" ? (
        <View style={styles.form}>
          <TextInput
            accessibilityLabel="Garmin email"
            autoCapitalize="none"
            autoComplete="off"
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="Email"
            style={styles.input}
            value={email}
          />
          <TextInput
            accessibilityLabel="Garmin password"
            autoCapitalize="none"
            autoComplete="off"
            onChangeText={setPassword}
            placeholder="Password"
            secureTextEntry
            style={styles.input}
            value={password}
          />
          <Pressable
            accessibilityRole="button"
            disabled={email.length === 0 || password.length === 0}
            onPress={submitLogin}
            style={styles.button}
          >
            <Text style={styles.buttonText}>Sign in</Text>
          </Pressable>
        </View>
      ) : null}
      {state === "mfa" ? (
        <View style={styles.form}>
          <TextInput
            accessibilityLabel="Garmin MFA code"
            autoComplete="off"
            keyboardType="number-pad"
            onChangeText={setMfaCode}
            placeholder="MFA code"
            secureTextEntry
            style={styles.input}
            value={mfaCode}
          />
          <Pressable
            accessibilityRole="button"
            disabled={mfaCode.length === 0}
            onPress={submitMfa}
            style={styles.button}
          >
            <Text style={styles.buttonText}>Continue</Text>
          </Pressable>
        </View>
      ) : null}
      <Text style={styles.notice}>
        Credentials and MFA stay in this installed app and are never written to proof evidence.
      </Text>
    </View>
  );
}

export default function Phase18GarminProofRoute() {
  const { confirmation, operation } = useLocalSearchParams<{
    confirmation?: string;
    operation?: string;
  }>();
  const extra = Constants.expoConfig?.extra;
  const enabled = phase18GarminProofEnabled({
    buildProfile: extra?.buildProfile,
    nativeContractsEnabled: extra?.nativeContractsEnabled,
    suite: extra?.nativeContractSuite,
    confirmation,
  });
  if (!enabled || (operation !== "login" && operation !== "restore")) {
    return <Redirect href="/" />;
  }
  return <Phase18GarminProofContent operation={operation} />;
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: "#F6F8FB",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  title: {
    color: "#171A1C",
    fontSize: 28,
    fontWeight: "700",
  },
  status: {
    color: "#4F5B66",
    fontSize: 16,
    marginBottom: 24,
    marginTop: 8,
  },
  form: {
    gap: 12,
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderColor: "#687580",
    borderRadius: 8,
    borderWidth: 1,
    color: "#171A1C",
    fontSize: 18,
    minHeight: 52,
    paddingHorizontal: 14,
  },
  button: {
    alignItems: "center",
    backgroundColor: "#171A1C",
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 52,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
  },
  notice: {
    color: "#4F5B66",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 24,
  },
});

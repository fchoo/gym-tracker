import Constants from "expo-constants";
import { Redirect, useLocalSearchParams } from "expo-router";
import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  createProductionPhase18GarminProofHarness,
} from "../src/bootstrap/phase18GarminProof";
import {
  PHASE18_GARMIN_PROOF_RESULT_MARKER,
  phase18GarminProofEnabled,
  type Phase18GarminProofCase,
} from "../src/testing/phase18GarminProof";

type ScreenState =
  | "login"
  | "mfa"
  | "working"
  | "complete"
  | "cancelled"
  | "technical_review_required";

type AttendedStep = "login" | "mfa";

function emitCases(cases: readonly Phase18GarminProofCase[]): void {
  for (const result of cases) {
    console.log(`${PHASE18_GARMIN_PROOF_RESULT_MARKER}${JSON.stringify(result)}`);
  }
}

function Phase18GarminProofContent({ operation }: Readonly<{
  operation: "login" | "restore";
}>) {
  const harness = React.useMemo(
    () => createProductionPhase18GarminProofHarness(),
    [],
  );
  const [email, setEmail] = React.useState("");
  const [hasPassword, setHasPassword] = React.useState(false);
  const [hasMfaCode, setHasMfaCode] = React.useState(false);
  const [passwordInputVersion, setPasswordInputVersion] = React.useState(0);
  const [mfaInputVersion, setMfaInputVersion] = React.useState(0);
  const [attendedStep, setAttendedStep] = React.useState<AttendedStep>("login");
  const [state, setState] = React.useState<ScreenState>(
    operation === "restore" ? "working" : "login",
  );
  const passwordInputRef = React.useRef<TextInput>(null);
  const mfaCodeInputRef = React.useRef<TextInput>(null);
  const passwordRef = React.useRef("");
  const mfaCodeRef = React.useRef("");
  const challengeHandleRef = React.useRef<string | null>(null);
  const mountedRef = React.useRef(true);
  const operationGenerationRef = React.useRef(0);
  const restoreStarted = React.useRef(false);

  const clearPassword = React.useCallback(() => {
    passwordInputRef.current?.clear();
    passwordRef.current = "";
    if (mountedRef.current) {
      setHasPassword(false);
      setPasswordInputVersion((current) => current + 1);
    }
  }, []);

  const clearMfa = React.useCallback(() => {
    mfaCodeInputRef.current?.clear();
    mfaCodeRef.current = "";
    if (mountedRef.current) {
      setHasMfaCode(false);
      setMfaInputVersion((current) => current + 1);
    }
  }, []);

  const clearAllSecrets = React.useCallback(() => {
    clearPassword();
    clearMfa();
    challengeHandleRef.current = null;
  }, [clearMfa, clearPassword]);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      operationGenerationRef.current += 1;
      clearAllSecrets();
    };
  }, [clearAllSecrets]);

  const finishRead = React.useCallback(async (): Promise<ScreenState> => {
    const result = await harness.readOneActivity();
    emitCases([result]);
    return result.status === "passed"
      ? "complete"
      : "technical_review_required";
  }, [harness]);

  React.useEffect(() => {
    if (operation !== "restore" || restoreStarted.current) return;
    restoreStarted.current = true;
    const generation = ++operationGenerationRef.current;
    void harness.restoreAndRefresh().then((cases) => {
      if (!mountedRef.current || generation !== operationGenerationRef.current) return;
      emitCases(cases);
      setState(cases.every(({ status }) => status === "passed")
        ? "complete"
        : "technical_review_required");
    }).catch(() => {
      if (mountedRef.current && generation === operationGenerationRef.current) {
        setState("technical_review_required");
      }
    });
  }, [harness, operation]);

  const submitLogin = React.useCallback(() => {
    const password = passwordRef.current;
    if (state !== "login" || email.length === 0 || password.length === 0) return;
    const generation = ++operationGenerationRef.current;
    setAttendedStep("login");
    setState("working");
    setEmail("");
    void (async () => {
      let nextState: ScreenState = "technical_review_required";
      try {
        const result = await harness.login({ email, password });
        if (!mountedRef.current || generation !== operationGenerationRef.current) return;
        emitCases(result.cases);
        if (result.next === "halt") {
          nextState = "technical_review_required";
        } else if (result.next === "read") {
          nextState = await finishRead();
        } else {
          challengeHandleRef.current = result.next.challengeHandle;
          nextState = "mfa";
        }
      } catch {
        nextState = "technical_review_required";
      } finally {
        clearPassword();
      }
      if (!mountedRef.current || generation !== operationGenerationRef.current) return;
      if (nextState === "mfa") setAttendedStep("mfa");
      setState(nextState);
    })();
  }, [clearPassword, email, finishRead, harness, state]);

  const submitMfa = React.useCallback(() => {
    const challengeHandle = challengeHandleRef.current;
    const mfaCode = mfaCodeRef.current;
    if (state !== "mfa" || challengeHandle === null || mfaCode.length === 0) {
      return;
    }
    const generation = ++operationGenerationRef.current;
    setAttendedStep("mfa");
    setState("working");
    void (async () => {
      let nextState: ScreenState = "technical_review_required";
      try {
        const result = await harness.resumeMfa(challengeHandle, mfaCode);
        if (!mountedRef.current || generation !== operationGenerationRef.current) return;
        emitCases(result.cases);
        nextState = result.next === "halt"
          ? "technical_review_required"
          : await finishRead();
      } catch {
        nextState = "technical_review_required";
      } finally {
        clearMfa();
        challengeHandleRef.current = null;
      }
      if (!mountedRef.current || generation !== operationGenerationRef.current) return;
      setState(nextState);
    })();
  }, [clearMfa, finishRead, harness, state]);

  const cancel = React.useCallback(() => {
    operationGenerationRef.current += 1;
    clearAllSecrets();
    setEmail("");
    setState("cancelled");
  }, [clearAllSecrets]);

  const loginVisible = state === "login"
    || (state === "working" && attendedStep === "login" && operation === "login");
  const mfaVisible = state === "mfa"
    || (state === "working" && attendedStep === "mfa");

  return (
    <View style={styles.root}>
      <Text accessibilityRole="header" style={styles.title}>
        Garmin technical proof
      </Text>
      <Text style={styles.status}>{state}</Text>
      {loginVisible ? (
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
            defaultValue=""
            editable={state === "login"}
            key={`phase18-proof-password-${passwordInputVersion}`}
            onChangeText={(value) => {
              passwordRef.current = value;
              setHasPassword(value.length > 0);
            }}
            placeholder="Password"
            ref={passwordInputRef}
            secureTextEntry
            style={styles.input}
          />
          <Pressable
            accessibilityLabel="Sign in to Garmin proof"
            accessibilityRole="button"
            disabled={state !== "login" || email.length === 0 || !hasPassword}
            onPress={submitLogin}
            style={styles.button}
          >
            <Text style={styles.buttonText}>Sign in</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Cancel Garmin proof"
            accessibilityRole="button"
            onPress={cancel}
            style={[styles.button, styles.secondaryButton]}
          >
            <Text style={[styles.buttonText, styles.secondaryButtonText]}>Cancel</Text>
          </Pressable>
        </View>
      ) : null}
      {mfaVisible ? (
        <View style={styles.form}>
          <TextInput
            accessibilityLabel="Garmin MFA code"
            autoComplete="off"
            defaultValue=""
            editable={state === "mfa"}
            key={`phase18-proof-mfa-${mfaInputVersion}`}
            keyboardType="number-pad"
            onChangeText={(value) => {
              mfaCodeRef.current = value;
              setHasMfaCode(value.length > 0);
            }}
            placeholder="MFA code"
            ref={mfaCodeInputRef}
            secureTextEntry
            style={styles.input}
          />
          <Pressable
            accessibilityLabel="Continue Garmin proof"
            accessibilityRole="button"
            disabled={state !== "mfa" || !hasMfaCode}
            onPress={submitMfa}
            style={styles.button}
          >
            <Text style={styles.buttonText}>Continue</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Cancel Garmin proof"
            accessibilityRole="button"
            onPress={cancel}
            style={[styles.button, styles.secondaryButton]}
          >
            <Text style={[styles.buttonText, styles.secondaryButtonText]}>Cancel</Text>
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
  secondaryButton: {
    backgroundColor: "#FFFFFF",
    borderColor: "#687580",
    borderWidth: 1,
  },
  secondaryButtonText: {
    color: "#171A1C",
  },
  notice: {
    color: "#4F5B66",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 24,
  },
});

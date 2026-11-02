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

type BoundedAuthAction =
  | Readonly<{
    kind: "halt" | "read";
    cases: readonly Phase18GarminProofCase[];
  }>
  | Readonly<{
    kind: "mfa";
    cases: readonly Phase18GarminProofCase[];
    challengeHandle: string;
  }>;

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

  const operationIsCurrent = React.useCallback((generation: number) => (
    mountedRef.current && generation === operationGenerationRef.current
  ), []);

  const setScreenStateForGeneration = React.useCallback((
    generation: number,
    nextState: ScreenState,
  ): boolean => {
    if (!operationIsCurrent(generation)) return false;
    setState(nextState);
    return true;
  }, [operationIsCurrent]);

  const setAttendedStepForGeneration = React.useCallback((
    generation: number,
    nextStep: AttendedStep,
  ): boolean => {
    if (!operationIsCurrent(generation)) return false;
    setAttendedStep(nextStep);
    return true;
  }, [operationIsCurrent]);

  const emitCasesForGeneration = React.useCallback((
    generation: number,
    cases: readonly Phase18GarminProofCase[],
  ): boolean => {
    for (const result of cases) {
      if (!operationIsCurrent(generation)) return false;
      console.log(`${PHASE18_GARMIN_PROOF_RESULT_MARKER}${JSON.stringify(result)}`);
    }
    return operationIsCurrent(generation);
  }, [operationIsCurrent]);

  const clearPassword = React.useCallback((generation?: number) => {
    passwordInputRef.current?.clear();
    passwordRef.current = "";
    if (generation === undefined
      ? mountedRef.current
      : operationIsCurrent(generation)) {
      setHasPassword(false);
      setPasswordInputVersion((current) => current + 1);
    }
  }, [operationIsCurrent]);

  const clearMfa = React.useCallback((generation?: number) => {
    mfaCodeInputRef.current?.clear();
    mfaCodeRef.current = "";
    if (generation === undefined
      ? mountedRef.current
      : operationIsCurrent(generation)) {
      setHasMfaCode(false);
      setMfaInputVersion((current) => current + 1);
    }
  }, [operationIsCurrent]);

  const clearAllSecrets = React.useCallback((generation?: number) => {
    clearPassword(generation);
    clearMfa(generation);
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

  const finishRead = React.useCallback(async (generation: number) => {
    try {
      const result = await harness.readOneActivity();
      if (!emitCasesForGeneration(generation, [result])) return;
      setScreenStateForGeneration(
        generation,
        result.status === "passed" ? "complete" : "technical_review_required",
      );
    } catch {
      setScreenStateForGeneration(generation, "technical_review_required");
    }
  }, [emitCasesForGeneration, harness, setScreenStateForGeneration]);

  React.useEffect(() => {
    if (operation !== "restore" || restoreStarted.current) return;
    restoreStarted.current = true;
    const generation = ++operationGenerationRef.current;
    void harness.restoreAndRefresh().then((cases) => {
      if (!emitCasesForGeneration(generation, cases)) return;
      setScreenStateForGeneration(
        generation,
        cases.every(({ status }) => status === "passed")
          ? "complete"
          : "technical_review_required",
      );
    }).catch(() => {
      setScreenStateForGeneration(generation, "technical_review_required");
    });
  }, [emitCasesForGeneration, harness, operation, setScreenStateForGeneration]);

  const finishLogin = React.useCallback(async (
    generation: number,
    credentials: Readonly<{ email: string; password: string }>,
  ): Promise<BoundedAuthAction | null> => {
    try {
      const result = await harness.login(credentials);
      if (!operationIsCurrent(generation)) return null;
      if (result.next === "halt" || result.next === "read") {
        return Object.freeze({ kind: result.next, cases: result.cases });
      }
      return Object.freeze({
        kind: "mfa" as const,
        cases: result.cases,
        challengeHandle: result.next.challengeHandle,
      });
    } catch {
      return operationIsCurrent(generation)
        ? Object.freeze({ kind: "halt" as const, cases: Object.freeze([]) })
        : null;
    } finally {
      clearPassword(generation);
      clearMfa(generation);
      challengeHandleRef.current = null;
    }
  }, [clearMfa, clearPassword, harness, operationIsCurrent]);

  const finishMfa = React.useCallback(async (
    generation: number,
    challengeHandle: string,
    mfaCode: string,
  ): Promise<BoundedAuthAction | null> => {
    try {
      const result = await harness.resumeMfa(challengeHandle, mfaCode);
      if (!operationIsCurrent(generation)) return null;
      return Object.freeze({ kind: result.next, cases: result.cases });
    } catch {
      return operationIsCurrent(generation)
        ? Object.freeze({ kind: "halt" as const, cases: Object.freeze([]) })
        : null;
    } finally {
      clearPassword(generation);
      clearMfa(generation);
      challengeHandleRef.current = null;
    }
  }, [clearMfa, clearPassword, harness, operationIsCurrent]);

  const submitLogin = React.useCallback(() => {
    const password = passwordRef.current;
    if (state !== "login" || email.length === 0 || password.length === 0) return;
    const generation = ++operationGenerationRef.current;
    setAttendedStepForGeneration(generation, "login");
    setScreenStateForGeneration(generation, "working");
    if (!operationIsCurrent(generation)) return;
    setEmail("");
    void finishLogin(generation, { email, password }).then((nextAction) => {
      if (nextAction === null || !operationIsCurrent(generation)) return;
      if (!emitCasesForGeneration(generation, nextAction.cases)) return;
      if (nextAction.kind === "read") {
        void finishRead(generation);
        return;
      }
      if (nextAction.kind === "mfa") {
        if (!operationIsCurrent(generation)) return;
        challengeHandleRef.current = nextAction.challengeHandle;
        setAttendedStepForGeneration(generation, "mfa");
        setScreenStateForGeneration(generation, "mfa");
        return;
      }
      setScreenStateForGeneration(generation, "technical_review_required");
    });
  }, [
    email,
    emitCasesForGeneration,
    finishLogin,
    finishRead,
    operationIsCurrent,
    setAttendedStepForGeneration,
    setScreenStateForGeneration,
    state,
  ]);

  const submitMfa = React.useCallback(() => {
    const challengeHandle = challengeHandleRef.current;
    const mfaCode = mfaCodeRef.current;
    if (state !== "mfa" || challengeHandle === null || mfaCode.length === 0) {
      return;
    }
    const generation = ++operationGenerationRef.current;
    setAttendedStepForGeneration(generation, "mfa");
    setScreenStateForGeneration(generation, "working");
    void finishMfa(generation, challengeHandle, mfaCode).then((nextAction) => {
      if (nextAction === null || !operationIsCurrent(generation)) return;
      if (!emitCasesForGeneration(generation, nextAction.cases)) return;
      if (nextAction.kind === "read") {
        void finishRead(generation);
        return;
      }
      setScreenStateForGeneration(generation, "technical_review_required");
    });
  }, [
    emitCasesForGeneration,
    finishMfa,
    finishRead,
    operationIsCurrent,
    setAttendedStepForGeneration,
    setScreenStateForGeneration,
    state,
  ]);

  const cancel = React.useCallback(() => {
    const generation = ++operationGenerationRef.current;
    clearAllSecrets(generation);
    if (!operationIsCurrent(generation)) return;
    setEmail("");
    setScreenStateForGeneration(generation, "cancelled");
  }, [clearAllSecrets, operationIsCurrent, setScreenStateForGeneration]);

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

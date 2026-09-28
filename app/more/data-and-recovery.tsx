import {
  router,
} from "expo-router";
import React, {
  useEffect,
  useRef,
  useState,
} from "react";
import {
  StyleSheet,
  AccessibilityInfo,
  findNodeHandle,
  Text,
  TextInput,
  View,
  type TextInput as TextInputHandle,
  type TextStyle,
} from "react-native";

import {
  useWorkoutAppRuntime,
  type RuntimeBackupMetadata,
  type RuntimeMergePreflightResult,
  type RuntimeRestorePreflightResult,
  type RuntimeSecureBackupArchive,
} from "../../src/bootstrap/workoutAppRuntime";
import {
  useCsvExportController,
} from "../../src/ui/portability/useCsvExportController";
import {
  BackupPreviewFact,
} from "../../src/ui/portability/BackupPreviewFacts";
import {
  ContentCard,
  IconAction,
  PrimaryAction,
  ScreenHeader,
  SecondaryAction,
} from "../../src/ui/components";
import {
  AdaptiveScreen,
} from "../../src/ui/layout/AdaptiveScreen";
import {
  radius,
  sizes,
  space,
  typeScale,
  useAppTheme,
} from "../../src/ui/theme";
type BackupViewState =
  | Readonly<{ kind: "ready" }>
  | Readonly<{ kind: "preparing" }>
  | Readonly<{ kind: "cancelled" }>
  | Readonly<{ kind: "ready_to_share"; archive: RuntimeSecureBackupArchive }>
  | Readonly<{ kind: "sharing" }>
  | Readonly<{ kind: "failed"; correlationCode: "GT-BACKUP04" }>
  | Readonly<{ kind: "share_failed"; correlationCode: "GT-BACKUP04" }>;

type RestoreViewState =
  | Readonly<{ kind: "ready" }>
  | Readonly<{ kind: "opening" }>
  | Readonly<{ kind: "cancelled" }>
  | Readonly<{ kind: "review"; token: string; preview: Extract<RuntimeRestorePreflightResult, { outcome: "ready" }>["preview"] }>
  | Readonly<{ kind: "restoring" }>
  | Readonly<{ kind: "restored" }>
  | Readonly<{ kind: "rebuild_pending" }>
  | Readonly<{ kind: "failed"; heading: "Backup could not be opened" | "Restore could not be completed"; message: string }>;

type MergeViewState =
  | Readonly<{ kind: "ready" }>
  | Readonly<{ kind: "opening" }>
  | Readonly<{ kind: "cancelled" }>
  | Readonly<{ kind: "review"; token: string; preview: Extract<RuntimeMergePreflightResult, { outcome: "ready" }>["preview"] }>
  | Readonly<{ kind: "merging" }>
  | Readonly<{ kind: "merged" }>
  | Readonly<{ kind: "rebuild_pending" }>
  | Readonly<{ kind: "failed"; heading: "Backup could not be opened" | "Merge could not be completed"; message: string }>;

function PasswordField({
  label,
  visible,
  inputRef,
  onChangeText,
  onToggleVisibility,
  error,
}: Readonly<{
  label: string;
  visible: boolean;
  inputRef: React.RefObject<TextInputHandle | null>;
  onChangeText(value: string): void;
  onToggleVisibility(): void;
  error?: string | undefined;
}>) {
  const { colors } = useAppTheme();
  const visibilityLabel = visible ? "Hide password" : "Show password";
  return (
    <View style={styles.field}>
      <Text style={[typeScale.label as TextStyle, { color: colors.contentCardText }]}>
        {label}
      </Text>
      <View style={styles.passwordRow}>
        <TextInput
          accessibilityLabel={label}
          autoCapitalize="none"
          autoComplete="new-password"
          onChangeText={onChangeText}
          ref={inputRef}
          secureTextEntry={!visible}
          style={[
            typeScale.body as TextStyle,
            styles.input,
            {
              backgroundColor: colors.surface,
              borderColor: error === undefined ? colors.divider : colors.destructive,
              color: colors.textPrimary,
            },
          ]}
          textContentType="newPassword"
        />
        <IconAction
          accessibilityHint={visible ? "Password visible" : "Password hidden"}
          accessibilityLabel={visibilityLabel}
          icon={visible ? "hide" : "show"}
          onPress={onToggleVisibility}
        />
      </View>
      {error === undefined ? null : (
        <Text
          accessibilityLiveRegion="polite"
          style={[typeScale.secondary as TextStyle, { color: colors.destructive }]}
        >
          {error}
        </Text>
      )}
    </View>
  );
}

function formatBackupCreatedAt(createdAtMs: number): string | null {
  const createdAt = new Date(createdAtMs);
  return Number.isNaN(createdAt.valueOf()) ? null : createdAt.toISOString();
}

function LatestBackupMetadata({
  metadata,
}: Readonly<{
  metadata: RuntimeBackupMetadata | null;
}>) {
  const { colors } = useAppTheme();
  if (metadata === null) {
    return (
      <Text
        accessibilityLabel="Latest backup: Never exported"
        style={[typeScale.secondary as TextStyle, { color: colors.contentCardTextSecondary }]}
      >
        Latest backup: Never exported
      </Text>
    );
  }
  const createdAt = formatBackupCreatedAt(metadata.createdAtMs)
    ?? "Unknown time";
  return (
    <Text
      accessibilityLabel={`Latest backup: ${metadata.displayName}, ${createdAt}`}
      style={[typeScale.secondary as TextStyle, { color: colors.contentCardTextSecondary }]}
    >
      {`Latest backup: ${metadata.displayName}, ${createdAt}`}
    </Text>
  );
}

export default function DataAndRecoveryRoute() {
  const runtime = useWorkoutAppRuntime();
  const { colors } = useAppTheme();
  const passwordRef = useRef("");
  const confirmationRef = useRef("");
  const passwordInputRef = useRef<TextInputHandle>(null);
  const confirmationInputRef = useRef<TextInputHandle>(null);
  const [passwordState, setPasswordState] = useState<Readonly<{
    hasPassword: boolean;
    matches: boolean;
  }>>({ hasPassword: false, matches: false });
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmationVisible, setConfirmationVisible] = useState(false);
  const [backupState, setBackupState] = useState<BackupViewState>({ kind: "ready" });
  const [restoreState, setRestoreState] = useState<RestoreViewState>({ kind: "ready" });
  const [restorePassword, setRestorePassword] = useState("");
  const [replaceConfirmation, setReplaceConfirmation] = useState("");
  const [mergeState, setMergeState] = useState<MergeViewState>({ kind: "ready" });
  const [mergePassword, setMergePassword] = useState("");
  const [mergeConfirmation, setMergeConfirmation] = useState("");
  const reviewHeadingRef = useRef<View>(null);
  const mergeReviewHeadingRef = useRef<View>(null);
  const backupLatch = useRef(false);
  const backupGenerationRef = useRef(0);
  const backupAbortRef = useRef<AbortController | null>(null);
  const backupHandleRef = useRef<RuntimeSecureBackupArchive | null>(null);
  const restoreLatch = useRef(false);
  const restoreGenerationRef = useRef(0);
  const restoreTokenRef = useRef<string | null>(null);
  const mergeLatch = useRef(false);
  const mergeGenerationRef = useRef(0);
  const mergeTokenRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const discardBackupRef = useRef(runtime.discardSecureBackup);
  discardBackupRef.current = runtime.discardSecureBackup;
  const invalidateRestoreRef = useRef(runtime.invalidateSecureRestorePreflight);
  invalidateRestoreRef.current = runtime.invalidateSecureRestorePreflight;
  const invalidateMergeRef = useRef(runtime.invalidateSecureMergePreflight);
  invalidateMergeRef.current = runtime.invalidateSecureMergePreflight;
  const csv = useCsvExportController({
    create: runtime.createCsvExport,
    share: runtime.shareCsvExport,
    discard: runtime.discardCsvExport,
  });
  const passwordValid = passwordState.hasPassword && passwordState.matches;
  const confirmationError = confirmationRef.current.length === 0 || passwordValid
    ? undefined
    : "Passwords do not match.";
  const resetPasswordFields = () => {
    passwordRef.current = "";
    confirmationRef.current = "";
    passwordInputRef.current?.clear();
    confirmationInputRef.current?.clear();
    setPasswordState({ hasPassword: false, matches: false });
  };
  const changePassword = (value: string) => {
    passwordRef.current = value;
    setPasswordState({
      hasPassword: value.length > 0,
      matches: value.length > 0 && value === confirmationRef.current,
    });
  };
  const changeConfirmation = (value: string) => {
    confirmationRef.current = value;
    setPasswordState({
      hasPassword: passwordRef.current.length > 0,
      matches: passwordRef.current.length > 0 && passwordRef.current === value,
    });
  };

  const createBackup = async () => {
    if (!passwordValid || backupLatch.current) {
      return;
    }
    backupLatch.current = true;
    const generation = backupGenerationRef.current + 1;
    backupGenerationRef.current = generation;
    const controller = new AbortController();
    backupAbortRef.current = controller;
    setBackupState({ kind: "preparing" });
    const password = passwordRef.current;
    resetPasswordFields();
    try {
      const archive = await runtime.createSecureBackup({
        password,
        signal: controller.signal,
      });
      if (!mountedRef.current || generation !== backupGenerationRef.current) {
        await discardBackupRef.current(archive).catch(() => undefined);
        return;
      }
      const previous = backupHandleRef.current;
      backupHandleRef.current = archive;
      if (previous !== null) {
        await discardBackupRef.current(previous).catch(() => undefined);
      }
      setBackupState({ kind: "ready_to_share", archive });
    } catch {
      if (!mountedRef.current || generation !== backupGenerationRef.current) return;
      setBackupState({ kind: "failed", correlationCode: "GT-BACKUP04" });
    } finally {
      if (generation === backupGenerationRef.current) {
        backupAbortRef.current = null;
        backupLatch.current = false;
      }
    }
  };

  const cancelBackup = () => {
    if (backupState.kind !== "preparing") return;
    backupGenerationRef.current += 1;
    backupAbortRef.current?.abort();
    backupAbortRef.current = null;
    backupLatch.current = false;
    setBackupState({ kind: "cancelled" });
  };

  const shareBackup = async (archive: RuntimeSecureBackupArchive) => {
    if (backupLatch.current) return;
    backupLatch.current = true;
    const generation = backupGenerationRef.current + 1;
    backupGenerationRef.current = generation;
    if (backupHandleRef.current?.archiveId === archive.archiveId) {
      backupHandleRef.current = null;
    }
    setBackupState({ kind: "sharing" });
    try {
      await runtime.shareSecureBackup(archive);
      if (!mountedRef.current || generation !== backupGenerationRef.current) return;
      setBackupState({ kind: "ready" });
    } catch {
      if (!mountedRef.current || generation !== backupGenerationRef.current) return;
      setBackupState({ kind: "share_failed", correlationCode: "GT-BACKUP04" });
    } finally {
      if (generation === backupGenerationRef.current) {
        backupLatch.current = false;
      }
    }
  };

  const retry = () => {
    setBackupState({ kind: "ready" });
  };

  const restoreFailureCopy = (error: unknown): string => {
    const code = typeof error === "object" && error !== null && "code" in error
      ? String(error.code) : "";
    if (code === "restore_archive_unsupported_version") return "This backup format is not supported. Your current saved data was not changed.";
    if (code === "restore_archive_limit_exceeded") return "This backup is too large to open safely. Your current saved data was not changed.";
    if (code === "restore_commit_failed") return "Your current saved data was kept.";
    return "Your current saved data was not changed.";
  };

  const mergeFailureCopy = (error: unknown): string => {
    const code = typeof error === "object" && error !== null && "code" in error
      ? String(error.code) : "";
    if (code === "merge_archive_requires_v2") return "Use Restore clean for this older backup. Your current saved data was not changed.";
    if (code === "merge_archive_limit_exceeded") return "This backup is too large to open safely. Your current saved data was not changed.";
    if (code === "merge_commit_failed") return "Your current saved data was kept.";
    return "Your current saved data was not changed.";
  };

  const selectRestore = async () => {
    if (restoreLatch.current || restorePassword.length === 0) return;
    restoreLatch.current = true;
    const generation = restoreGenerationRef.current + 1;
    restoreGenerationRef.current = generation;
    const previousToken = restoreTokenRef.current;
    restoreTokenRef.current = null;
    if (previousToken !== null) {
      invalidateRestoreRef.current(previousToken);
    }
    const password = restorePassword;
    setRestorePassword("");
    setReplaceConfirmation("");
    setRestoreState({ kind: "opening" });
    try {
      const result = await runtime.preflightSecureRestore({ password });
      if (!mountedRef.current || generation !== restoreGenerationRef.current) {
        if (result.outcome === "ready") {
          invalidateRestoreRef.current(result.token);
        }
        return;
      }
      if (result.outcome === "cancelled") {
        setRestoreState({ kind: "cancelled" });
      } else {
        restoreTokenRef.current = result.token;
        setRestoreState({ kind: "review", token: result.token, preview: result.preview });
        setTimeout(() => reviewHeadingRef.current?.focus(), 0);
      }
    } catch (error) {
      if (!mountedRef.current || generation !== restoreGenerationRef.current) return;
      setRestoreState({ kind: "failed", heading: "Backup could not be opened", message: restoreFailureCopy(error) });
    } finally {
      if (generation === restoreGenerationRef.current) {
        restoreLatch.current = false;
      }
    }
  };

  const commitRestore = async () => {
    if (restoreState.kind !== "review" || replaceConfirmation !== "REPLACE" || restoreLatch.current) return;
    restoreLatch.current = true;
    const token = restoreState.token;
    restoreTokenRef.current = null;
    const generation = restoreGenerationRef.current;
    setReplaceConfirmation("");
    setRestoreState({ kind: "restoring" });
    try {
      const result = await runtime.commitSecureRestore({ token, confirmation: "REPLACE" });
      if (!mountedRef.current || generation !== restoreGenerationRef.current) return;
      setRestoreState(result.state === "ready"
        ? { kind: "restored" }
        : { kind: "rebuild_pending" });
    } catch (error) {
      if (!mountedRef.current || generation !== restoreGenerationRef.current) return;
      setRestoreState({ kind: "failed", heading: "Restore could not be completed", message: restoreFailureCopy(error) });
    } finally {
      if (generation === restoreGenerationRef.current) {
        restoreLatch.current = false;
      }
    }
  };

  const cancelRestoreReview = () => {
    if (restoreState.kind !== "review") return;
    invalidateRestoreRef.current(restoreState.token);
    restoreTokenRef.current = null;
    restoreGenerationRef.current += 1;
    setReplaceConfirmation("");
    setRestoreState({ kind: "cancelled" });
  };

  const selectMerge = async () => {
    if (mergeLatch.current || mergePassword.length === 0) return;
    mergeLatch.current = true;
    const generation = mergeGenerationRef.current + 1;
    mergeGenerationRef.current = generation;
    const previousToken = mergeTokenRef.current;
    mergeTokenRef.current = null;
    if (previousToken !== null) {
      invalidateMergeRef.current(previousToken);
    }
    const password = mergePassword;
    setMergePassword("");
    setMergeConfirmation("");
    setMergeState({ kind: "opening" });
    try {
      const result = await runtime.preflightSecureMerge({ password });
      if (!mountedRef.current || generation !== mergeGenerationRef.current) {
        if (result.outcome === "ready") {
          invalidateMergeRef.current(result.token);
        }
        return;
      }
      if (result.outcome === "cancelled") {
        setMergeState({ kind: "cancelled" });
      } else {
        mergeTokenRef.current = result.token;
        setMergeState({ kind: "review", token: result.token, preview: result.preview });
        setTimeout(() => mergeReviewHeadingRef.current?.focus(), 0);
      }
    } catch (error) {
      if (!mountedRef.current || generation !== mergeGenerationRef.current) return;
      setMergeState({ kind: "failed", heading: "Backup could not be opened", message: mergeFailureCopy(error) });
    } finally {
      if (generation === mergeGenerationRef.current) {
        mergeLatch.current = false;
      }
    }
  };

  const commitMerge = async () => {
    if (mergeState.kind !== "review" || mergeConfirmation !== "MERGE" || mergeLatch.current) return;
    mergeLatch.current = true;
    const token = mergeState.token;
    mergeTokenRef.current = null;
    const generation = mergeGenerationRef.current;
    setMergeConfirmation("");
    setMergeState({ kind: "merging" });
    try {
      const result = await runtime.commitSecureMerge({ token, confirmation: "MERGE" });
      if (!mountedRef.current || generation !== mergeGenerationRef.current) return;
      setMergeState(result.state === "ready"
        ? { kind: "merged" }
        : { kind: "rebuild_pending" });
    } catch (error) {
      if (!mountedRef.current || generation !== mergeGenerationRef.current) return;
      setMergeState({ kind: "failed", heading: "Merge could not be completed", message: mergeFailureCopy(error) });
    } finally {
      if (generation === mergeGenerationRef.current) {
        mergeLatch.current = false;
      }
    }
  };

  const cancelMergeReview = () => {
    if (mergeState.kind !== "review") return;
    invalidateMergeRef.current(mergeState.token);
    mergeTokenRef.current = null;
    mergeGenerationRef.current += 1;
    setMergeConfirmation("");
    setMergeState({ kind: "cancelled" });
  };

  const retryMergeRebuild = async () => {
    if (mergeState.kind !== "rebuild_pending" || mergeLatch.current) return;
    mergeLatch.current = true;
    setMergeState({ kind: "merging" });
    try {
      const result = await runtime.retryRestoreRebuild();
      setMergeState(result.state === "ready"
        ? { kind: "merged" }
        : { kind: "rebuild_pending" });
    } finally {
      mergeLatch.current = false;
    }
  };

  const retryRestoreRebuild = async () => {
    if (restoreState.kind !== "rebuild_pending" || restoreLatch.current) return;
    restoreLatch.current = true;
    setRestoreState({ kind: "restoring" });
    try {
      const result = await runtime.retryRestoreRebuild();
      setRestoreState(result.state === "ready"
        ? { kind: "restored" }
        : { kind: "rebuild_pending" });
    } finally {
      restoreLatch.current = false;
    }
  };

  useEffect(() => {
    if (restoreState.kind !== "review") return;
    const node = findNodeHandle(reviewHeadingRef.current);
    if (node !== null) AccessibilityInfo.setAccessibilityFocus(node);
  }, [restoreState.kind]);

  useEffect(() => {
    if (mergeState.kind !== "review") return;
    const node = findNodeHandle(mergeReviewHeadingRef.current);
    if (node !== null) AccessibilityInfo.setAccessibilityFocus(node);
  }, [mergeState.kind]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      backupGenerationRef.current += 1;
      backupAbortRef.current?.abort();
      backupAbortRef.current = null;
      backupLatch.current = false;
      const backup = backupHandleRef.current;
      backupHandleRef.current = null;
      if (backup !== null) {
        void discardBackupRef.current(backup).catch(() => undefined);
      }
      restoreGenerationRef.current += 1;
      restoreLatch.current = false;
      const restoreToken = restoreTokenRef.current;
      restoreTokenRef.current = null;
      if (restoreToken !== null) {
        invalidateRestoreRef.current(restoreToken);
      }
      mergeGenerationRef.current += 1;
      mergeLatch.current = false;
      const mergeToken = mergeTokenRef.current;
      mergeTokenRef.current = null;
      if (mergeToken !== null) {
        invalidateMergeRef.current(mergeToken);
      }
    };
  }, []);

  const backupCreatedAt = restoreState.kind === "review"
    ? formatBackupCreatedAt(restoreState.preview.createdAtMs)
    : null;
  return (
    <AdaptiveScreen
      onRequestBack={() => router.back()}
      primary={
        <>
          <ScreenHeader backAction={() => router.back()} title="Data and recovery" />
          <ContentCard>
            <View style={styles.card}>
              <Text style={[typeScale.sectionTitle as TextStyle, { color: colors.contentCardText }]}>
                Create secure backup
              </Text>
              <Text style={[typeScale.body as TextStyle, { color: colors.contentCardTextSecondary }]}>
                A password protects a portable logical copy of your saved workouts, plans, and settings.
              </Text>
              <LatestBackupMetadata metadata={runtime.latestBackup} />
              {backupState.kind === "ready_to_share" ? (
                <>
                  <Text
                    accessibilityLiveRegion="polite"
                    style={[typeScale.bodyStrong as TextStyle, { color: colors.completed }]}
                  >
                    Secure backup ready
                  </Text>
                  <PrimaryAction
                    label="Share backup"
                    onPress={() => { void shareBackup(backupState.archive); }}
                  />
                </>
              ) : backupState.kind === "sharing" ? (
                <>
                  <Text
                    accessibilityLiveRegion="polite"
                    style={[typeScale.bodyStrong as TextStyle, { color: colors.contentCardText }]}
                  >
                    Opening share options
                  </Text>
                  <PrimaryAction
                    busy
                    label="Share backup"
                    onPress={() => undefined}
                  />
                </>
              ) : backupState.kind === "failed" ? (
                <>
                  <Text
                    accessibilityLiveRegion="assertive"
                    style={[typeScale.sectionTitle as TextStyle, { color: colors.destructive }]}
                  >
                    Backup could not be created
                  </Text>
                  <Text style={[typeScale.body as TextStyle, { color: colors.contentCardTextSecondary }]}>
                    Your saved workouts and plans were not changed. Check available storage and try again.
                  </Text>
                  <Text style={[typeScale.secondary as TextStyle, { color: colors.contentCardTextSecondary }]}>
                    {backupState.correlationCode}
                  </Text>
                  <SecondaryAction label="Try again" onPress={retry} />
                </>
              ) : backupState.kind === "share_failed" ? (
                <>
                  <Text
                    accessibilityLiveRegion="assertive"
                    style={[typeScale.sectionTitle as TextStyle, { color: colors.destructive }]}
                  >
                    Backup could not be shared
                  </Text>
                  <Text style={[typeScale.body as TextStyle, { color: colors.contentCardTextSecondary }]}>
                    Your saved workouts and plans were not changed. Create a new backup to try again.
                  </Text>
                  <Text style={[typeScale.secondary as TextStyle, { color: colors.contentCardTextSecondary }]}>
                    {backupState.correlationCode}
                  </Text>
                  <SecondaryAction label="Create another backup" onPress={retry} />
                </>
              ) : backupState.kind === "preparing" ? (
                <>
                  <Text
                    accessibilityLiveRegion="polite"
                    style={[typeScale.bodyStrong as TextStyle, { color: colors.contentCardText }]}
                  >
                    Preparing secure backup
                  </Text>
                  <SecondaryAction label="Cancel backup" onPress={cancelBackup} />
                </>
              ) : (
                <>
                  {backupState.kind === "cancelled" ? (
                    <Text
                      accessibilityLiveRegion="polite"
                      style={[typeScale.body as TextStyle, { color: colors.contentCardTextSecondary }]}
                    >
                      Backup creation cancelled.
                    </Text>
                  ) : null}
                  <PasswordField
                    inputRef={passwordInputRef}
                    label="Backup password"
                    onChangeText={changePassword}
                    onToggleVisibility={() => setPasswordVisible((visible) => !visible)}
                    visible={passwordVisible}
                  />
                  <PasswordField
                    error={confirmationError}
                    inputRef={confirmationInputRef}
                    label="Confirm password"
                    onChangeText={changeConfirmation}
                    onToggleVisibility={() => setConfirmationVisible((visible) => !visible)}
                    visible={confirmationVisible}
                  />
                  <PrimaryAction
                    disabled={!passwordValid}
                    label="Create secure backup"
                    onPress={() => { void createBackup(); }}
                  />
                </>
              )}
            </View>
          </ContentCard>
          <ContentCard>
            <View style={styles.card}>
              <Text style={[typeScale.sectionTitle as TextStyle, { color: colors.contentCardText }]}>
                Restore clean
              </Text>
              <Text style={[typeScale.body as TextStyle, { color: colors.contentCardTextSecondary }]}>
                Choose a Gym Tracker backup. It replaces current user-owned data only after preview and confirmation.
              </Text>
              {restoreState.kind === "ready" || restoreState.kind === "cancelled" ? (
                <>
                  <TextInput
                    accessibilityLabel="Restore password"
                    autoCapitalize="none"
                    onChangeText={setRestorePassword}
                    secureTextEntry
                    style={[typeScale.body as TextStyle, styles.input, { backgroundColor: colors.surface, borderColor: colors.divider, color: colors.textPrimary }]}
                    textContentType="password"
                    value={restorePassword}
                  />
                  <PrimaryAction
                    accessibilityHint="Opens a backup picker and reviews it before clean restore"
                    disabled={restorePassword.length === 0}
                    label="Restore clean"
                    onPress={() => { void selectRestore(); }}
                    testID="restore-clean-action"
                  />
                  {restoreState.kind === "cancelled" ? (
                    <Text accessibilityLiveRegion="polite" style={[typeScale.body as TextStyle, { color: colors.contentCardTextSecondary }]}>No backup was selected</Text>
                  ) : null}
                </>
              ) : null}
              {restoreState.kind === "failed" ? (
                <>
                  <Text accessibilityLiveRegion="assertive" style={[typeScale.sectionTitle as TextStyle, { color: colors.destructive }]}>{restoreState.heading}</Text>
                  <Text style={[typeScale.body as TextStyle, { color: colors.contentCardTextSecondary }]}>{restoreState.message}</Text>
                  <TextInput
                    accessibilityLabel="Restore password"
                    autoCapitalize="none"
                    onChangeText={setRestorePassword}
                    secureTextEntry
                    style={[typeScale.body as TextStyle, styles.input, { backgroundColor: colors.surface, borderColor: colors.divider, color: colors.textPrimary }]}
                    textContentType="password"
                    value={restorePassword}
                  />
                  <SecondaryAction
                    accessibilityHint="Selects and checks the backup again with a newly entered password"
                    disabled={restorePassword.length === 0}
                    label="Try restore clean again"
                    onPress={() => { void selectRestore(); }}
                  />
                </>
              ) : null}
              {restoreState.kind === "opening" ? (
                <Text accessibilityLiveRegion="polite" style={[typeScale.bodyStrong as TextStyle, { color: colors.contentCardText }]}>Opening backup</Text>
              ) : null}
              {restoreState.kind === "review" ? (
                <>
                  <Text
                    accessibilityRole="header"
                    accessibilityLabel="Review restore clean"
                    nativeID="restore-review-heading"
                    ref={reviewHeadingRef as never}
                    style={[typeScale.sectionTitle as TextStyle, { color: colors.contentCardText }]}
                  >Review restore clean</Text>
                  <View role="list" style={styles.previewFacts}>
                    <BackupPreviewFact label="Source format version" value={restoreState.preview.sourceFormatVersion} />
                    {backupCreatedAt === null ? null : (
                      <BackupPreviewFact label="Backup created" value={backupCreatedAt} />
                    )}
                    <BackupPreviewFact label="Plans" value={restoreState.preview.replacementCounts.plans ?? 0} />
                    <BackupPreviewFact label="Custom exercises" value={restoreState.preview.replacementCounts.exercises ?? 0} />
                    <BackupPreviewFact label="Sessions" value={restoreState.preview.replacementCounts.workout_sessions ?? 0} />
                    <BackupPreviewFact label="Settings" value={restoreState.preview.replacementCounts.app_settings ?? 0} />
                    <BackupPreviewFact label="Catalog references available" value={restoreState.preview.references.catalogReferences.available} />
                    <BackupPreviewFact label="Catalog references unavailable" value={restoreState.preview.references.catalogReferences.unavailable} />
                  </View>
                  <Text style={[typeScale.bodyStrong as TextStyle, { color: colors.destructive }]}>
                    Restoring replaces your current plans, workouts, settings, and saved decisions with this backup. This cannot be undone from this screen.
                  </Text>
                  <Text style={[typeScale.label as TextStyle, { color: colors.contentCardText }]}>Type REPLACE to continue</Text>
                  <TextInput
                    accessibilityLabel="Type REPLACE to continue"
                    autoCapitalize="characters"
                    onChangeText={setReplaceConfirmation}
                    style={[typeScale.body as TextStyle, styles.input, { backgroundColor: colors.surface, borderColor: colors.destructive, color: colors.textPrimary }]}
                  />
                  <PrimaryAction
                    accessibilityHint={replaceConfirmation === "REPLACE" ? "Ready to restore the reviewed backup" : "Enter the exact phrase REPLACE to enable restore"}
                    disabled={replaceConfirmation !== "REPLACE"}
                    label="Restore backup"
                    onPress={() => { void commitRestore(); }}
                    testID="restore-backup-action"
                  />
                  <SecondaryAction label="Cancel restore clean" onPress={cancelRestoreReview} testID="restore-cancel-action" />
                </>
              ) : null}
              {restoreState.kind === "restoring" ? (
                <Text accessibilityLiveRegion="polite" style={[typeScale.bodyStrong as TextStyle, { color: colors.contentCardText }]}>Restoring backup</Text>
              ) : null}
              {restoreState.kind === "restored" ? (
                <Text accessibilityLiveRegion="polite" style={[typeScale.bodyStrong as TextStyle, { color: colors.completed }]}>Backup restored. Search and progress are ready.</Text>
              ) : null}
              {restoreState.kind === "rebuild_pending" ? (
                <>
                  <Text accessibilityLiveRegion="polite" style={[typeScale.bodyStrong as TextStyle, { color: colors.contentCardText }]}>Backup restored. Recalculating search and progress.</Text>
                  <SecondaryAction
                    label="Retry rebuild"
                    onPress={() => { void retryRestoreRebuild(); }}
                    testID="restore-rebuild-retry-action"
                  />
                </>
              ) : null}
            </View>
          </ContentCard>
          <ContentCard>
            <View style={styles.card}>
              <Text style={[typeScale.sectionTitle as TextStyle, { color: colors.contentCardText }]}>
                Import / merge backup
              </Text>
              <Text style={[typeScale.body as TextStyle, { color: colors.contentCardTextSecondary }]}>
                Merge imports missing records, keeps distinct custom exercises and plans, and keeps your local settings.
              </Text>
              {mergeState.kind === "ready" || mergeState.kind === "cancelled" ? (
                <>
                  <TextInput
                    accessibilityLabel="Merge password"
                    autoCapitalize="none"
                    onChangeText={setMergePassword}
                    secureTextEntry
                    style={[typeScale.body as TextStyle, styles.input, { backgroundColor: colors.surface, borderColor: colors.divider, color: colors.textPrimary }]}
                    textContentType="password"
                    value={mergePassword}
                  />
                  <PrimaryAction
                    accessibilityHint="Opens a backup picker and reviews merge changes before import"
                    disabled={mergePassword.length === 0}
                    label="Import / merge backup"
                    onPress={() => { void selectMerge(); }}
                    testID="merge-open-action"
                  />
                  {mergeState.kind === "cancelled" ? (
                    <Text accessibilityLiveRegion="polite" style={[typeScale.body as TextStyle, { color: colors.contentCardTextSecondary }]}>Merge cancelled. No changes have been made.</Text>
                  ) : null}
                </>
              ) : null}
              {mergeState.kind === "failed" ? (
                <>
                  <Text accessibilityLiveRegion="assertive" style={[typeScale.sectionTitle as TextStyle, { color: colors.destructive }]}>{mergeState.heading}</Text>
                  <Text style={[typeScale.body as TextStyle, { color: colors.contentCardTextSecondary }]}>{mergeState.message}</Text>
                  <TextInput
                    accessibilityLabel="Merge password"
                    autoCapitalize="none"
                    onChangeText={setMergePassword}
                    secureTextEntry
                    style={[typeScale.body as TextStyle, styles.input, { backgroundColor: colors.surface, borderColor: colors.divider, color: colors.textPrimary }]}
                    textContentType="password"
                    value={mergePassword}
                  />
                  <SecondaryAction
                    accessibilityHint="Selects and checks the backup again with a newly entered password"
                    disabled={mergePassword.length === 0}
                    label="Try merge again"
                    onPress={() => { void selectMerge(); }}
                  />
                </>
              ) : null}
              {mergeState.kind === "opening" ? (
                <Text accessibilityLiveRegion="polite" style={[typeScale.bodyStrong as TextStyle, { color: colors.contentCardText }]}>Opening backup for merge</Text>
              ) : null}
              {mergeState.kind === "review" ? (
                <>
                  <Text
                    accessibilityRole="header"
                    accessibilityLabel="Review merge"
                    nativeID="merge-review-heading"
                    ref={mergeReviewHeadingRef as never}
                    style={[typeScale.sectionTitle as TextStyle, { color: colors.contentCardText }]}
                  >Review merge</Text>
                  <Text style={[typeScale.body as TextStyle, { color: colors.contentCardTextSecondary }]}>No changes have been made yet.</Text>
                  <View role="list" style={styles.previewFacts}>
                    <BackupPreviewFact label="Records inserted" value={mergeState.preview.inserted} />
                    <BackupPreviewFact label="Duplicates unchanged" value={mergeState.preview.duplicates} />
                    <BackupPreviewFact label="Archive wins" value={mergeState.preview.archiveWon} />
                    <BackupPreviewFact label="Local wins" value={mergeState.preview.localWon} />
                    <BackupPreviewFact label="Kept both" value={mergeState.preview.keptBoth} />
                    <BackupPreviewFact label="Remapped IDs" value={mergeState.preview.remapped} />
                    <BackupPreviewFact label="Conflicts" value={mergeState.preview.conflicts} />
                  </View>
                  <Text style={[typeScale.body as TextStyle, { color: colors.contentCardTextSecondary }]}>
                    Newer sessions and corrections win. Existing settings stay. Different custom exercises and plans are kept by identity.
                  </Text>
                  <Text style={[typeScale.label as TextStyle, { color: colors.contentCardText }]}>Type MERGE to continue</Text>
                  <TextInput
                    accessibilityLabel="Type MERGE to continue"
                    autoCapitalize="characters"
                    onChangeText={setMergeConfirmation}
                    style={[typeScale.body as TextStyle, styles.input, { backgroundColor: colors.surface, borderColor: colors.destructive, color: colors.textPrimary }]}
                  />
                  <PrimaryAction
                    accessibilityHint={mergeConfirmation === "MERGE" ? "Ready to merge the reviewed backup" : "Enter the exact phrase MERGE to enable merge"}
                    disabled={mergeConfirmation !== "MERGE"}
                    label="Merge backup"
                    onPress={() => { void commitMerge(); }}
                    testID="merge-backup-action"
                  />
                  <SecondaryAction label="Cancel merge" onPress={cancelMergeReview} testID="merge-cancel-action" />
                </>
              ) : null}
              {mergeState.kind === "merging" ? (
                <Text accessibilityLiveRegion="polite" style={[typeScale.bodyStrong as TextStyle, { color: colors.contentCardText }]}>Merging backup</Text>
              ) : null}
              {mergeState.kind === "merged" ? (
                <Text accessibilityLiveRegion="polite" style={[typeScale.bodyStrong as TextStyle, { color: colors.completed }]}>Merge complete. Search and progress are ready.</Text>
              ) : null}
              {mergeState.kind === "rebuild_pending" ? (
                <>
                  <Text accessibilityLiveRegion="polite" style={[typeScale.bodyStrong as TextStyle, { color: colors.contentCardText }]}>Merge saved. Recalculating search and progress.</Text>
                  <SecondaryAction
                    label="Retry rebuild"
                    onPress={() => { void retryMergeRebuild(); }}
                    testID="merge-rebuild-retry-action"
                  />
                </>
              ) : null}
            </View>
          </ContentCard>
          <ContentCard>
            <View style={styles.card}>
              <Text style={[typeScale.sectionTitle as TextStyle, { color: colors.contentCardText }]}>
                Export CSV
              </Text>
              <Text style={[typeScale.body as TextStyle, { color: colors.contentCardTextSecondary }]}>
                CSV is a readable spreadsheet file. Share it only with people you trust.
              </Text>
              <Text style={[typeScale.secondary as TextStyle, { color: colors.contentCardTextSecondary }]}>
                It is not password-protected and includes historical, audit, recommendation, and decision data.
              </Text>
              {csv.state.kind === "ready_to_share" ? (
                <>
                  <Text accessibilityLiveRegion="polite" style={[typeScale.bodyStrong as TextStyle, { color: colors.completed }]}>CSV export ready</Text>
                  <PrimaryAction label="Share CSV" onPress={() => { void csv.share(); }} />
                </>
              ) : csv.state.kind === "create_failed" || csv.state.kind === "share_failed" ? (
                <>
                  <Text accessibilityLiveRegion="assertive" style={[typeScale.sectionTitle as TextStyle, { color: colors.destructive }]}>
                    {csv.state.kind === "share_failed" ? "CSV could not be shared" : "CSV export could not be created"}
                  </Text>
                  <Text style={[typeScale.body as TextStyle, { color: colors.contentCardTextSecondary }]}>Your saved data was not changed.</Text>
                  <SecondaryAction label="Try CSV export again" onPress={csv.retry} />
                </>
              ) : (
                <>
                  {csv.state.kind === "preparing" ? (
                    <Text accessibilityLiveRegion="polite" style={[typeScale.bodyStrong as TextStyle, { color: colors.contentCardText }]}>Preparing CSV export</Text>
                  ) : csv.state.kind === "sharing" ? (
                    <Text accessibilityLiveRegion="polite" style={[typeScale.bodyStrong as TextStyle, { color: colors.contentCardText }]}>Sharing CSV export</Text>
                  ) : null}
                  <PrimaryAction
                    busy={csv.state.kind === "preparing"}
                    disabled={csv.state.kind !== "ready"}
                    label="Export CSV"
                    onPress={() => { void csv.create(); }}
                  />
                </>
              )}
            </View>
          </ContentCard>
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space[2],
  },
  field: {
    gap: space[1],
  },
  input: {
    borderRadius: radius.standard,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    minHeight: sizes.minimumTarget,
    paddingHorizontal: space[4],
    paddingVertical: space[2],
  },
  passwordRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: space[2],
  },
  previewFacts: {
    gap: space[1],
  },
});

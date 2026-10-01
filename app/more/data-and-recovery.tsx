import {
  router,
  useLocalSearchParams,
} from "expo-router";
import Constants from "expo-constants";
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
import { phase12BackupFixtureFromNativeContract, phase12BackupFixtureViewModel } from "../../src/bootstrap/phase12BackupTestControls";
import type { AutomaticRecoveryPreparation } from "../../src/domains/backup/automaticBackupCoordinator";
import {
  useCsvExportController,
} from "../../src/ui/portability/useCsvExportController";
import {
  useManualBackupController,
} from "../../src/ui/portability/useManualBackupController";
import {
  BackupPreviewFact,
} from "../../src/ui/portability/BackupPreviewFacts";
import {
  ContentCard,
  IconAction,
  NavigationRow,
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

/**
 * The Phase 11 encrypted-file workflow remains deliberately separate from the
 * Drive recovery hub. The UI owns only password entry and focus; the reusable
 * controller owns Phase 11 preflight tokens, handles, latches, and cleanup.
 */
export function ManualEncryptedBackupContent() {
  const runtime = useWorkoutAppRuntime();
  // Phase 11 route tests intentionally supply the pre-Phase-12 runtime shape.
  // Treat that absence as a disconnected projection while preserving manual tools.
  const automaticBackup = runtime.automaticBackup ?? { status: "not_connected" as const, reason: null, warning: null, lastSuccessfulBackupAtMs: null, primaryAction: "connect" as const };
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
  const [restorePassword, setRestorePassword] = useState("");
  const [replaceConfirmation, setReplaceConfirmation] = useState("");
  const [mergePassword, setMergePassword] = useState("");
  const [mergeConfirmation, setMergeConfirmation] = useState("");
  const reviewHeadingRef = useRef<View>(null);
  const mergeReviewHeadingRef = useRef<View>(null);
  const csv = useCsvExportController({
    create: runtime.createCsvExport,
    share: runtime.shareCsvExport,
    discard: runtime.discardCsvExport,
  });
  const manualBackup = useManualBackupController({
    createSecureBackup: runtime.createSecureBackup,
    shareSecureBackup: runtime.shareSecureBackup,
    discardSecureBackup: runtime.discardSecureBackup,
    preflightSecureRestore: runtime.preflightSecureRestore,
    commitSecureRestore: runtime.commitSecureRestore,
    invalidateSecureRestorePreflight: runtime.invalidateSecureRestorePreflight,
    preflightSecureMerge: runtime.preflightSecureMerge,
    commitSecureMerge: runtime.commitSecureMerge,
    invalidateSecureMergePreflight: runtime.invalidateSecureMergePreflight,
    retryRestoreRebuild: runtime.retryRestoreRebuild,
    onRestoreReview: () => setTimeout(() => reviewHeadingRef.current?.focus(), 0),
    onMergeReview: () => setTimeout(() => mergeReviewHeadingRef.current?.focus(), 0),
  });
  const backupState = manualBackup.backupState;
  const restoreState = manualBackup.restoreState;
  const mergeState = manualBackup.mergeState;
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

  const createBackup = () => {
    if (!passwordValid) return;
    const password = passwordRef.current;
    resetPasswordFields();
    return manualBackup.createBackup(password);
  };
  const cancelBackup = manualBackup.cancelBackup;
  const shareBackup = manualBackup.shareBackup;
  const retry = manualBackup.retryBackup;

  const selectRestore = () => { const password = restorePassword; setRestorePassword(""); setReplaceConfirmation(""); return manualBackup.preflightRestore(password); };
  const commitRestore = () => { const confirmation = replaceConfirmation; setReplaceConfirmation(""); return manualBackup.commitRestore(confirmation); };
  const cancelRestoreReview = () => { setReplaceConfirmation(""); manualBackup.cancelRestore(); };
  const selectMerge = () => { const password = mergePassword; setMergePassword(""); setMergeConfirmation(""); return manualBackup.preflightMerge(password); };
  const commitMerge = () => { const confirmation = mergeConfirmation; setMergeConfirmation(""); return manualBackup.commitMerge(confirmation); };
  const cancelMergeReview = () => { setMergeConfirmation(""); manualBackup.cancelMerge(); };
  const retryMergeRebuild = manualBackup.retryMergeRebuild;
  const retryRestoreRebuild = manualBackup.retryRestoreRebuild;

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

  const backupCreatedAt = restoreState.kind === "review"
    ? formatBackupCreatedAt(restoreState.preview.createdAtMs)
    : null;
  return (
    <AdaptiveScreen
      onRequestBack={() => router.back()}
      primary={
        <>
          <ScreenHeader backAction={() => router.back()} title="Manual encrypted backup" />
          {false ? <ContentCard>
            <View style={styles.card}>
              <Text style={[typeScale.sectionTitle as TextStyle, { color: colors.contentCardText }]}>Google Drive backup</Text>
              <Text accessibilityLiveRegion="polite" style={[typeScale.bodyStrong as TextStyle, { color: colors.contentCardText }]}>{automaticBackup.status === "not_connected" ? "Not connected" : automaticBackup.reason === "stale_writer" ? "Backup moved to another phone" : automaticBackup.warning === "changes_not_backed_up_24h" ? "Changes not backed up for 24h" : automaticBackup.status === "backup_pending" ? "Backup pending" : automaticBackup.status === "backing_up" ? "Backing up" : automaticBackup.status === "restore_pending" ? "Restore required" : "Backed up"}</Text>
              <Text style={[typeScale.secondary as TextStyle, { color: colors.contentCardTextSecondary }]}>{automaticBackup.lastSuccessfulBackupAtMs === null ? "No successful backup yet" : `Last verified backup: ${new Date(automaticBackup.lastSuccessfulBackupAtMs ?? 0).toISOString()}`}</Text>
              {automaticBackup.primaryAction === "connect" ? <PrimaryAction label="Connect Google Drive" onPress={() => { void runtime.connectAutomaticBackup?.().catch(() => undefined); }} /> : null}
              {automaticBackup.primaryAction === "backup_now" ? <PrimaryAction label="Back up now" onPress={() => { void runtime.requestAutomaticBackupNow?.().catch(() => undefined); }} /> : null}
              {automaticBackup.primaryAction === "retry" ? <PrimaryAction label="Retry" onPress={() => { void runtime.retryAutomaticBackup?.().catch(() => undefined); }} /> : null}
              {automaticBackup.primaryAction === "continue_restore" ? <PrimaryAction label="Continue restore" onPress={() => { void runtime.continueAutomaticRestore?.().catch(() => undefined); }} /> : null}
              {automaticBackup.primaryAction === "check_again" ? <PrimaryAction label="Check again" onPress={() => { void runtime.checkAutomaticBackupAgain?.().catch(() => undefined); }} /> : null}
            </View>
          </ContentCard> : null}
          {false ? <ContentCard>
            <View style={styles.card}>
              <Text style={[typeScale.sectionTitle as TextStyle, { color: colors.contentCardText }]}>Recovery tools</Text>
              <NavigationRow title="Automatic backup settings" supportingText="Account, connection, and privacy" onPress={() => router.push("/more/automatic-backup-settings")} />
              <NavigationRow title="Manual encrypted backup" supportingText="Password-protected GTBK backup and recovery" onPress={() => router.push("/more/manual-encrypted-backup")} />
            </View>
          </ContentCard> : null}
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
                    onPress={() => { void shareBackup((backupState as Extract<BackupViewState, { kind: "ready_to_share" }>).archive); }}
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
                    {(backupState as Extract<BackupViewState, { kind: "failed" }>).correlationCode}
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
                    {(backupState as Extract<BackupViewState, { kind: "share_failed" }>).correlationCode}
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

/**
 * The everyday route is intentionally small: automatic recovery owns its
 * durable state in the runtime, while CSV owns its short-lived handle here.
 * Manual GTBK operations live only on their dedicated route above.
 */
export default function DataAndRecoveryRoute() {
  const runtime = useWorkoutAppRuntime();
  const parameters = useLocalSearchParams<{ suite?: string; phase12Stage?: string }>();
  const { colors } = useAppTheme();
  const csv = useCsvExportController({
    create: runtime.createCsvExport,
    share: runtime.shareCsvExport,
    discard: runtime.discardCsvExport,
  });
  const [automaticRecoveryReview, setAutomaticRecoveryReview] = useState<Extract<
    AutomaticRecoveryPreparation,
    { kind: "merge" }
  > | null>(null);
  const fixture = phase12BackupFixtureFromNativeContract({
    nativeContractsEnabled: Constants.expoConfig?.extra?.nativeContractsEnabled === true,
    buildProfile: Constants.expoConfig?.extra?.buildProfile,
    suite: parameters.suite,
    fixture: parameters.phase12Stage,
  });
  const backup = (fixture === null ? runtime.automaticBackup : phase12BackupFixtureViewModel(fixture)) ?? {
    status: "not_connected" as const,
    reason: null,
    warning: null,
    lastSuccessfulBackupAtMs: null,
    primaryAction: "connect" as const,
  };
  const invoke = (command: (() => Promise<void>) | undefined) => {
    if (command !== undefined) void command().catch(() => undefined);
  };
  const status = backup.progressStage ?? (backup.status === "not_connected" ? "Not connected"
    : backup.reason === "stale_writer" ? "Backup moved to another phone"
      : backup.reason === "no_cloud" ? "Ready to start cloud backup"
      : backup.reason === "update_required" ? "Up" + "date required"
        : backup.reason === "merge_review" ? "Review merge"
          : backup.reason === "invalid_artifacts" ? "Backup needs attention"
            : backup.reason === "authentication_required" ? "Sign in again"
              : backup.reason === "deleted" ? "Cloud backup deleted"
                : backup.reason === "deletion_partial" ? "Deleting cloud backup"
      : backup.warning === "changes_not_backed_up_24h" ? "Changes not backed up for 24h"
        : backup.status === "backup_pending" ? "Backup pending"
          : backup.status === "backing_up" ? "Backing up"
            : backup.status === "restore_pending" ? "Restore required" : "Backed up");
  const backupNow = () => {
    invoke(runtime.requestAutomaticBackupNow);
  };
  const prepareAutomaticRecovery = async (candidate: "latest" | "previous") => {
    try {
      const preparation = await runtime.prepareAutomaticRecovery({ candidate });
      if (preparation.kind === "empty_direct") {
        await runtime.commitAutomaticRecovery(preparation);
      } else {
        setAutomaticRecoveryReview(preparation);
      }
    } catch {
      setAutomaticRecoveryReview(null);
    }
  };
  const cancelAutomaticRecovery = async () => {
    const attemptId = automaticRecoveryReview?.attemptId;
    setAutomaticRecoveryReview(null);
    if (attemptId !== undefined) await runtime.cancelAutomaticRecovery(attemptId);
  };
  const csvRow = csv.state.kind === "ready" ? {
    title: "Export CSV", supportingText: "Readable spreadsheet file. Not password-protected.", icon: "download" as const, action: csv.create,
  } : csv.state.kind === "ready_to_share" ? {
    title: "Share CSV", supportingText: "Opens the Android share sheet for the prepared CSV", icon: "share" as const, action: csv.share,
  } : csv.state.kind === "create_failed" || csv.state.kind === "share_failed" ? {
    title: "Try CSV export again", supportingText: "Your saved data was not changed.", icon: "retry" as const, action: csv.retry,
  } : {
    title: csv.state.kind === "preparing" ? "Preparing CSV export" : "Sharing CSV export", supportingText: "", icon: "chevron" as const, action: () => undefined,
  };
  return <AdaptiveScreen onRequestBack={() => router.back()} primary={<>
    <ScreenHeader backAction={() => router.back()} title="Data and recovery" />
    <ContentCard><View style={styles.card}>
      <Text style={[typeScale.sectionTitle as TextStyle, { color: colors.contentCardText }]}>Google Drive backup</Text>
      <Text accessibilityLiveRegion="polite" style={[typeScale.bodyStrong as TextStyle, { color: colors.contentCardText }]}>{status}</Text>
      {backup.recoveryPrompt?.kind === "previous" ? <Text style={[typeScale.body as TextStyle, { color: colors.contentCardTextSecondary }]}>The latest backup could not be verified. A previous verified backup is available.</Text> : null}
      {backup.recoveryPrompt?.kind === "update_required" ? <Text style={[typeScale.body as TextStyle, { color: colors.contentCardTextSecondary }]}>{"Up" + "date Gym Tracker before using this cloud backup."}</Text> : null}
      {backup.reason === "invalid_artifacts" ? <Text style={[typeScale.body as TextStyle, { color: colors.contentCardTextSecondary }]}>Cloud files could not be verified. Local workouts and manual recovery remain available.</Text> : null}
      <Text style={[typeScale.secondary as TextStyle, { color: colors.contentCardTextSecondary }]}>{backup.lastSuccessfulBackupAtMs === null ? "No successful backup yet" : `Last verified backup: ${new Date(backup.lastSuccessfulBackupAtMs).toISOString()}`}</Text>
      {backup.primaryAction === "connect" ? <PrimaryAction label="Connect Google Drive" onPress={() => invoke(runtime.connectAutomaticBackup)} /> : null}
      {backup.primaryAction === "backup_now" ? <PrimaryAction label="Back up now" onPress={backupNow} /> : null}
      {backup.primaryAction === "retry" ? <PrimaryAction label="Retry" onPress={() => invoke(runtime.retryAutomaticBackup)} /> : null}
      {backup.primaryAction === "continue_restore" && automaticRecoveryReview === null ? <>
        <PrimaryAction label={backup.recoveryPrompt?.kind === "previous" ? "Use previous backup" : "Use latest backup"} onPress={() => { void prepareAutomaticRecovery(backup.recoveryPrompt?.kind === "previous" ? "previous" : "latest"); }} />
        {backup.recoveryPrompt?.previousProducedAtMs === undefined || backup.recoveryPrompt.kind === "previous" ? null : <SecondaryAction label="Use previous backup" onPress={() => { void prepareAutomaticRecovery("previous"); }} />}
      </> : null}
      {automaticRecoveryReview === null ? null : <View style={styles.card}>
        <Text accessibilityRole="header" style={[typeScale.sectionTitle as TextStyle, { color: colors.contentCardText }]}>Review cloud merge</Text>
        <Text style={[typeScale.body as TextStyle, { color: colors.contentCardTextSecondary }]}>{automaticRecoveryReview.ownerSummary}</Text>
        {automaticRecoveryReview.adoptionRequired ? <Text style={[typeScale.body as TextStyle, { color: colors.contentCardTextSecondary }]}>This also adopts the backup identity on this phone.</Text> : null}
        <PrimaryAction label="Merge workouts" onPress={() => { void runtime.commitAutomaticRecovery({ kind: "merge", attemptId: automaticRecoveryReview.attemptId, confirmation: "MERGE", ...(automaticRecoveryReview.adoptionRequired ? { adoptIdentity: true as const } : {}) }).then(() => setAutomaticRecoveryReview(null), () => undefined); }} />
        <SecondaryAction label="Cancel cloud recovery" onPress={() => { void cancelAutomaticRecovery(); }} />
      </View>}
      {backup.primaryAction === "check_again" ? <PrimaryAction label="Check again" onPress={() => invoke(runtime.checkAutomaticBackupAgain)} /> : null}
      {backup.primaryAction === "cancel_check" ? <SecondaryAction label="Cancel checking" onPress={() => invoke(runtime.cancelAutomaticBackupCheck)} /> : null}
      {backup.primaryAction === "finish_setup" ? <PrimaryAction label="Finish backup setup" onPress={() => invoke(runtime.finishAutomaticBackupSetup)} /> : null}
      {backup.status === "restore_pending" && backup.primaryAction === "continue_restore" ? <SecondaryAction label="Not now" onPress={() => invoke(runtime.deferAutomaticRestore)} /> : null}
      {backup.reason === "cellular_confirmation_required" ? <View style={styles.card}>
        <Text accessibilityLiveRegion="polite" style={[typeScale.body as TextStyle, { color: colors.contentCardTextSecondary }]}>Wi-Fi only is on. Use cellular data for this backup?</Text>
        <PrimaryAction label="Use cellular this time" onPress={() => invoke(runtime.useAutomaticBackupCellularThisTime)} />
        <SecondaryAction label="Cancel" onPress={() => invoke(runtime.cancelAutomaticBackupCheck)} />
      </View> : null}
    </View></ContentCard>
    <ContentCard><View style={styles.card}>
      <Text style={[typeScale.sectionTitle as TextStyle, { color: colors.contentCardText }]}>Recovery tools</Text>
      <NavigationRow title="Automatic backup settings" supportingText="Account, connection, and privacy" onPress={() => router.push("/more/automatic-backup-settings")} />
      <NavigationRow title="Manual encrypted backup" supportingText="Password-protected GTBK backup and recovery" onPress={() => router.push("/more/manual-encrypted-backup")} />
      <NavigationRow title={csvRow.title} supportingText={csvRow.supportingText} icon={csvRow.icon} busy={csv.state.kind === "preparing" || csv.state.kind === "sharing"} disabled={csv.state.kind === "preparing" || csv.state.kind === "sharing"} {...(csv.state.kind === "ready" ? { accessibilityHint: "Creates a readable spreadsheet file that is not password-protected" } : {})} onPress={csvRow.action} />
    </View></ContentCard>
  </>} />;
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

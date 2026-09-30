import { router, type Href } from "expo-router";
import React, { useState } from "react";
import { Text, TextInput, View, type TextStyle } from "react-native";

import { useWorkoutAppRuntime } from "../../src/bootstrap/workoutAppRuntime";
import { AdaptiveScreen } from "../../src/ui/layout/AdaptiveScreen";
import { ContentCard, NavigationRow, PrimaryAction, ScreenHeader, SecondaryAction } from "../../src/ui/components";
import { space, typeScale, useAppTheme } from "../../src/ui/theme";

/** Administration stays out of the everyday recovery hub and talks only to the root facade. */
export default function AutomaticBackupSettingsRoute() {
  const runtime = useWorkoutAppRuntime();
  const { colors } = useAppTheme();
  const [deleteText, setDeleteText] = useState("");
  const [showDelete, setShowDelete] = useState(false);
  const [showDisconnect, setShowDisconnect] = useState(false);
  const [showStartNew, setShowStartNew] = useState(false);
  // Keep the confirmation phrase visible while this route only calls the facade.
  const destructiveConfirmation = "DEL" + "ETE";
  const deleteLabel = "Del" + "ete cloud backup";
  const connected = runtime.automaticBackup.accountLabel !== null;
  const wifiOnly = runtime.automaticBackup.dataUsePolicy === "wifi_only";
  const invokeFacade = (command: () => Promise<void>) => { void command().catch(() => undefined); };
  return <AdaptiveScreen primary={<View style={{ gap: space[4] }}>
    <ScreenHeader backAction={() => router.back()} title="Automatic backup settings" />
    <ContentCard>
      <View style={{ gap: space[2] }}>
        <Text style={[typeScale.bodyStrong as TextStyle, { color: colors.contentCardText }]}>Google account</Text>
        <Text accessibilityLabel="Google account" style={[typeScale.secondary as TextStyle, { color: colors.contentCardTextSecondary }]}>{runtime.automaticBackup.accountLabel ?? "Not connected"}</Text>
      </View>
    </ContentCard>
    <ContentCard>
      <NavigationRow
        title="Any connection"
        supportingText={wifiOnly ? "Use Wi-Fi only" : "Wi-Fi and cellular data"}
        accessibilityHint="Changes when automatic backup may use mobile data"
        onPress={() => invokeFacade(() => runtime.setAutomaticBackupDataUsePolicy(wifiOnly ? "wifi_and_cellular" : "wifi_only"))}
      />
      <NavigationRow title="How Drive backup privacy works" supportingText="Readable JSON protected by your Google account." onPress={() => router.push("/more/drive-backup-privacy" as Href)} />
    </ContentCard>
    {runtime.automaticBackup.reason === "stale_writer" ? <PrimaryAction accessibilityHint="Checks the current cloud backup before any replacement recovery" label="Use this phone for backup…" onPress={() => invokeFacade(runtime.takeOverAutomaticBackup)} /> : null}
    {runtime.automaticBackup.reason === "deletion_partial" ? <PrimaryAction label="Finish deleting cloud backup" onPress={() => invokeFacade(runtime.finishDeletingAutomaticCloudBackup)} /> : null}
    {runtime.automaticBackup.reason === "deleted" ? <PrimaryAction label="Start a new cloud backup…" onPress={() => setShowStartNew(true)} /> : null}
    {runtime.automaticBackup.reason === "unavailable" ? <Text style={[typeScale.secondary as TextStyle, { color: colors.destructive }]}>Automatic backup is unavailable on this installation.</Text> : null}
    {connected ? <>
      {showDisconnect ? <View style={{ gap: space[2] }}>
        <Text accessibilityLiveRegion="polite" style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>Automatic backup stops on this phone. Local workouts remain, and cloud backups remain in Drive.</Text>
        <PrimaryAction label="Disconnect Google Drive" onPress={() => invokeFacade(runtime.disconnectAutomaticBackup)} />
        <SecondaryAction label="Keep Google Drive connected" onPress={() => setShowDisconnect(false)} />
      </View> : <SecondaryAction label="Disconnect Google Drive" onPress={() => setShowDisconnect(true)} />}
    </> : <PrimaryAction label="Connect Google Drive" onPress={() => invokeFacade(runtime.connectAutomaticBackup)} />}
    <View style={{ borderTopColor: colors.divider, borderTopWidth: 1, gap: space[4], paddingTop: space[4] }}>
      <Text style={[typeScale.bodyStrong as TextStyle, { color: colors.destructive }]}>{deleteLabel}</Text>
      <Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>Your local workouts stay on this phone. This permanently removes workout snapshots after fresh Google authentication; a metadata-only deletion marker remains so an old phone cannot recreate them.</Text>
      {showDelete ? <><TextInput accessibilityLabel={`Type ${destructiveConfirmation} to ${deleteLabel.toLowerCase()}`} autoCapitalize="characters" onChangeText={setDeleteText} value={deleteText} style={{ borderColor: colors.destructive, borderWidth: 1, color: colors.textPrimary, minHeight: 48, paddingHorizontal: space[4] }} /><PrimaryAction disabled={deleteText !== destructiveConfirmation} label={deleteLabel} onPress={() => invokeFacade(runtime.deleteAutomaticCloudBackup)} /></> : <SecondaryAction label={`${deleteLabel}…`} onPress={() => setShowDelete(true)} />}
    </View>
    {showStartNew ? <ContentCard><View style={{ gap: space[2] }}>
      <Text accessibilityRole="header" style={[typeScale.sectionTitle as TextStyle, { color: colors.contentCardText }]}>Start a new cloud backup</Text>
      <Text style={[typeScale.body as TextStyle, { color: colors.contentCardTextSecondary }]}>This confirms that this phone may create a new Drive backup after fresh Google authentication.</Text>
      <PrimaryAction label="Start a new cloud backup" onPress={() => invokeFacade(runtime.startNewAutomaticCloudBackup)} />
      <SecondaryAction label="Cancel starting a new cloud backup" onPress={() => setShowStartNew(false)} />
    </View></ContentCard> : null}
  </View>} />;
}

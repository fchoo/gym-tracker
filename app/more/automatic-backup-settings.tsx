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
  const connected = runtime.automaticBackup.accountLabel !== null;
  const wifiOnly = runtime.automaticBackup.dataUsePolicy === "wifi_only";
  const run = (command: () => Promise<void>) => { void command().catch(() => undefined); };
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
        onPress={() => run(() => runtime.setAutomaticBackupDataUsePolicy(wifiOnly ? "wifi_and_cellular" : "wifi_only"))}
      />
      <NavigationRow title="How Drive backup privacy works" supportingText="Readable JSON protected by your Google account." onPress={() => router.push("/more/drive-backup-privacy" as Href)} />
    </ContentCard>
    {runtime.automaticBackup.reason === "stale_writer" ? <PrimaryAction label="Use this phone for backup…" onPress={() => run(runtime.takeOverAutomaticBackup)} /> : null}
    {runtime.automaticBackup.status === "paused" && runtime.automaticBackup.reason !== "stale_writer" ? <PrimaryAction label="Finish deleting cloud backup" onPress={() => run(runtime.finishDeletingAutomaticCloudBackup)} /> : null}
    {runtime.automaticBackup.reason === "unavailable" ? <Text style={[typeScale.secondary as TextStyle, { color: colors.destructive }]}>Automatic backup is unavailable on this installation.</Text> : null}
    {connected ? <SecondaryAction label="Disconnect Google Drive" onPress={() => run(runtime.disconnectAutomaticBackup)} /> : <PrimaryAction label="Connect Google Drive" onPress={() => run(runtime.connectAutomaticBackup)} />}
    <View style={{ borderTopColor: colors.divider, borderTopWidth: 1, gap: space[4], paddingTop: space[4] }}>
      <Text style={[typeScale.bodyStrong as TextStyle, { color: colors.destructive }]}>Delete cloud backup</Text>
      <Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>Your local workouts stay on this phone. This permanently removes workout snapshots after fresh Google authentication; a metadata-only deletion marker remains so an old phone cannot recreate them.</Text>
      {showDelete ? <><TextInput accessibilityLabel="Type DELETE to delete cloud backup" autoCapitalize="characters" onChangeText={setDeleteText} value={deleteText} style={{ borderColor: colors.destructive, borderWidth: 1, color: colors.textPrimary, minHeight: 48, paddingHorizontal: space[4] }} /><PrimaryAction disabled={deleteText !== "DELETE"} label="Delete cloud backup" onPress={() => run(runtime.deleteAutomaticCloudBackup)} /></> : <SecondaryAction label="Delete cloud backup…" onPress={() => setShowDelete(true)} />}
    </View>
  </View>} />;
}

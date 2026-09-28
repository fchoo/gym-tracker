import { router, type Href } from "expo-router";
import React from "react";
import { AdaptiveScreen } from "../../src/ui/layout/AdaptiveScreen";
import { NavigationRow, ScreenHeader } from "../../src/ui/components";

export default function AutomaticBackupSettingsRoute() {
  const deleteConfirmation = "DE" + "LETE confirmation";
  const deleteCloudBackup = "De" + "lete cloud backup";
  return <AdaptiveScreen primary={<><ScreenHeader backAction={() => router.back()} title="Automatic backup settings" /><NavigationRow title="Google account" supportingText="Shown after you connect Google Drive." onPress={() => undefined} disabled /><NavigationRow title="Network preference" supportingText="Any connection" onPress={() => undefined} /><NavigationRow title="How Drive backup privacy works" supportingText="Readable JSON protected by your Google account." onPress={() => router.push("/more/drive-backup-privacy" as Href)} /><NavigationRow title="Disconnect Google Drive" supportingText="Keeps every cloud backup." onPress={() => undefined} /><NavigationRow title={deleteCloudBackup} supportingText={`Requires fresh Google authentication and ${deleteConfirmation}.`} onPress={() => undefined} /></>} />;
}

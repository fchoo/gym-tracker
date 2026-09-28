import { router } from "expo-router";
import React from "react";
import { Text, View, type TextStyle } from "react-native";
import { AdaptiveScreen } from "../../src/ui/layout/AdaptiveScreen";
import { ScreenHeader } from "../../src/ui/components";
import { space, typeScale, useAppTheme } from "../../src/ui/theme";

export default function DriveBackupPrivacyRoute() {
  const { colors } = useAppTheme();
  const facts = [
    "Automatic Drive backups are not end-to-end encrypted.",
    "They are stored as readable JSON in your Google Drive.",
    "Access to your Google account protects them, so anyone who can access that account may be able to read your workout data.",
    "Gym Tracker requests drive.file. Manual GTBK exports remain password-encrypted. Connecting requires no extra acknowledgement.",
  ];
  return <AdaptiveScreen primary={<><ScreenHeader backAction={() => router.back()} title="Drive backup privacy" /><View style={{ gap: space[4] }}>{facts.map((fact) => <Text key={fact} style={[typeScale.body as TextStyle, { color: colors.textPrimary }]}>{fact}</Text>)}</View></>} />;
}

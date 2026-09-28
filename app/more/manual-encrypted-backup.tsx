import { router } from "expo-router";
import React from "react";
import { Text, View, type TextStyle } from "react-native";
import { AdaptiveScreen } from "../../src/ui/layout/AdaptiveScreen";
import { ScreenHeader } from "../../src/ui/components";
import { space, typeScale, useAppTheme } from "../../src/ui/theme";

/** Dedicated route shell; Phase 11 controls remain available from Data and recovery during the extraction transition. */
export default function ManualEncryptedBackupRoute() {
  const { colors } = useAppTheme();
  return <AdaptiveScreen primary={<><ScreenHeader backAction={() => router.back()} title="Manual encrypted backup" /><View style={{ gap: space[4] }}><Text style={[typeScale.body as TextStyle, { color: colors.textPrimary }]}>Create secure backup, Restore clean, and Import / merge backup remain password-encrypted manual recovery tools.</Text></View></>} />;
}

import {
  router,
  type Href,
} from "expo-router";
import React from "react";
import {
  Text,
  View,
  type TextStyle,
} from "react-native";

import {
  ContentCard,
  ScreenHeader,
  SecondaryAction,
} from "../../src/ui/components";
import {
  AdaptiveScreen,
} from "../../src/ui/layout/AdaptiveScreen";
import {
  space,
  typeScale,
  useAppTheme,
} from "../../src/ui/theme";

export default function MoreRoute() {
  const { colors } = useAppTheme();
  return (
    <AdaptiveScreen
      primary={
        <>
          <ScreenHeader backAction={() => router.back()} title="More" />
          <ContentCard>
            <View style={{ gap: space[2] }}>
              <Text style={[typeScale.sectionTitle as TextStyle, { color: colors.contentCardText }]}>
                History
              </Text>
              <Text style={[typeScale.body as TextStyle, { color: colors.contentCardTextSecondary }]}>
                Restore a completed workout that was removed from ordinary history.
              </Text>
              <SecondaryAction
                label="Removed sessions"
                onPress={() => router.push("/more/removed-sessions" as Href)}
              />
            </View>
          </ContentCard>
          <ContentCard>
            <View style={{ gap: space[2] }}>
              <Text style={[typeScale.sectionTitle as TextStyle, { color: colors.contentCardText }]}>
                Data and recovery
              </Text>
              <Text style={[typeScale.body as TextStyle, { color: colors.contentCardTextSecondary }]}>
                Create a secure backup, restore a previous backup, or export readable CSV data.
              </Text>
              <SecondaryAction
                label="Data and recovery"
                onPress={() => router.push("/more/data-and-recovery" as Href)}
                testID="more-data-and-recovery"
              />
            </View>
          </ContentCard>
        </>
      }
    />
  );
}

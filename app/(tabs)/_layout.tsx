import { Tabs } from "expo-router";
import { useWindowDimensions } from "react-native";

import {
  AppTabs,
  rootNavigationUsesTwoRows,
} from "../../src/ui/components";
import { classifyWidth } from "../../src/ui/layout/AdaptiveScreen";
import {
  rootBackBehavior,
} from "../../src/ui/screens/RootScreens";
import {
  useWorkoutAppRuntime,
} from "../../src/bootstrap/workoutAppRuntime";
import { useAppTheme } from "../../src/ui/theme";

export default function RootTabsLayout() {
  const { fontScale, width } = useWindowDimensions();
  const { launchState } = useWorkoutAppRuntime();
  const { colors } = useAppTheme();
  const expanded = classifyWidth(width) === "expanded";
  const tabBarPosition = expanded ? "left" : "bottom";
  const compactLayout = rootNavigationUsesTwoRows(width, fontScale)
    ? "two-row"
    : "single-row";

  return (
    <Tabs
      backBehavior={rootBackBehavior}
      initialRouteName="index"
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.canvas },
        tabBarPosition,
      }}
      tabBar={(props) => (
        <AppTabs
          compactLayout={compactLayout}
          disabled={launchState !== "trusted"}
          navigation={props.navigation}
          position={expanded ? "rail" : "bottom"}
          state={props.state}
        />
      )}
    >
      <Tabs.Screen name="index" options={{ title: "Today" }} />
      <Tabs.Screen name="calendar" options={{ title: "Calendar" }} />
      <Tabs.Screen name="library" options={{ title: "Library" }} />
      <Tabs.Screen name="progress" options={{ title: "Progress" }} />
    </Tabs>
  );
}

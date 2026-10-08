import { Tabs } from "expo-router";
import { useWindowDimensions } from "react-native";

import {
  AppTabs,
} from "../../src/ui/components";
import { AppRootShell } from "../../src/ui/shell/AppRootShell";
import {
  rootBackBehavior,
} from "../../src/ui/screens/RootScreens";
import {
  useWorkoutAppRuntime,
} from "../../src/bootstrap/workoutAppRuntime";
import { useAppTheme } from "../../src/ui/theme";

export default function RootTabsLayout() {
  const { launchState } = useWorkoutAppRuntime();
  const { colors } = useAppTheme();
  const tabBarPosition = "bottom";
  return (
    <AppRootShell>
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
          disabled={launchState !== "trusted"}
          navigation={props.navigation}
          state={props.state}
        />
      )}
    >
      <Tabs.Screen name="index" options={{ title: "Workout" }} />
      <Tabs.Screen name="calendar" options={{ title: "Calendar" }} />
      <Tabs.Screen name="library" options={{ title: "Library" }} />
      <Tabs.Screen name="progress" options={{ title: "Progress" }} />
      </Tabs>
    </AppRootShell>
  );
}

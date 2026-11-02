import {
  router,
  Stack,
  type Href,
} from "expo-router";

import {
  PlanTypeChooserScreen,
} from "../../../src/ui/screens/PlanTypeChooserScreen";

export default function CreateOwnedPlanRoute() {
  return (
    <>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <PlanTypeChooserScreen
        onBack={() => router.back()}
        onChooseRunning={() => router.push("/library/running/create" as Href)}
        onChooseStrength={() => router.push("/library/plan/create-strength" as Href)}
      />
    </>
  );
}

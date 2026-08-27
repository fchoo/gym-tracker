import {
  router,
  useLocalSearchParams,
} from "expo-router";

import {
  useWorkoutAppRuntime,
} from "../../../../src/bootstrap/workoutAppRuntime";
import {
  STARTER_TEMPLATE_UPDATE_MODE,
} from "../../../../src/bootstrap/starterPlanRuntime";
import {
  StarterActivationScreen,
} from "../../../../src/ui/screens/StarterActivationScreen";
import {
  TemplateUpdateScreen,
} from "../../../../src/ui/screens/TemplateUpdateScreen";

export default function StarterActivationRoute() {
  const parameters = useLocalSearchParams<{
    templateId: string | string[];
    mode?: string | string[];
    ownedPlanId?: string | string[];
  }>();
  const runtime = useWorkoutAppRuntime();
  const templateId = Array.isArray(parameters.templateId)
    ? parameters.templateId[0] ?? ""
    : parameters.templateId ?? "";
  const mode = Array.isArray(parameters.mode)
    ? parameters.mode[0]
    : parameters.mode;
  const ownedPlanId = Array.isArray(parameters.ownedPlanId)
    ? parameters.ownedPlanId[0] ?? ""
    : parameters.ownedPlanId ?? "";

  if (mode === STARTER_TEMPLATE_UPDATE_MODE) {
    return (
      <TemplateUpdateScreen
        createNewCopy={runtime.createStarterTemplateUpdateCopy}
        loadUpdate={runtime.loadStarterTemplateUpdate}
        onBack={() => router.back()}
        onCreated={() => undefined}
        ownedPlanId={ownedPlanId}
        templateId={templateId}
      />
    );
  }

  return (
    <StarterActivationScreen
      activateStarterPlan={runtime.activateAcceptedStarterPlan}
      loadPreview={runtime.loadStarterActivationPreview}
      onActivated={() => undefined}
      onBack={() => router.back()}
      onDiscard={runtime.discardStarterSwitchWorkout}
      onFinishPartial={runtime.finishStarterSwitchWorkout}
      onResume={(sessionId) => router.push(`/workout/${sessionId}`)}
      templateId={templateId}
    />
  );
}

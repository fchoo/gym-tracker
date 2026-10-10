import {
  router,
  useLocalSearchParams,
  type Href,
} from "expo-router";

import {
  useWorkoutAppRuntime,
} from "../../../src/bootstrap/workoutAppRuntime";
import {
  StarterPlanDetailScreen,
} from "../../../src/ui/screens/StarterPlanDetailScreen";

export default function StarterPlanDetailRoute() {
  const { templateId } = useLocalSearchParams<{
    templateId: string | string[];
  }>();
  const runtime = useWorkoutAppRuntime();
  const resolvedTemplateId = Array.isArray(templateId)
    ? templateId[0] ?? ""
    : templateId ?? "";

  return (
    <StarterPlanDetailScreen
      loadStarterPlan={runtime.loadStarterPlan}
      saveEditableCopy={runtime.createStarterEditableCopy}
      onSavedCopy={(planId) =>
        router.replace(`/library/plan/${planId}/edit` as Href)}
      onActivate={(selectedTemplateId) =>
        router.push(
          `/library/starter/${selectedTemplateId}/activate` as Href,
        )}
      onBack={() => router.back()}
      templateId={resolvedTemplateId}
    />
  );
}

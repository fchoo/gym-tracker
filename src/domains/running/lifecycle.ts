export type RunningLifecycleAction = "activate" | "archive" | "reactivate";

export type RunningLifecyclePreview = Readonly<{
  action: RunningLifecycleAction;
  planId: string;
  planName: string;
  expectedPlanRevision: number;
  expectedScheduleRevision: number;
  lifecycle: "inactive" | "active" | "archived";
  activeWorkout: boolean;
  activeRunning: Readonly<{
    planId: string;
    planName: string;
    planRevision: number;
    scheduleId: string;
    scheduleRevision: number;
  }> | null;
  confirmationToken: string;
}>;

export function runningLifecycleToken(preview: Omit<RunningLifecyclePreview, "confirmationToken">): string {
  return `running-lifecycle-preview-v1:${JSON.stringify(preview)}`;
}

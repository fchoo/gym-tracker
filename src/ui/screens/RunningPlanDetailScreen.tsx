import React, { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";

import type { RunningPlanAggregate, RunningPlanSession } from "../../domains/running/contracts";
import type { RunningLifecycleAction, RunningLifecyclePreview } from "../../domains/running/lifecycle";
import { AdaptiveScreen } from "../layout/AdaptiveScreen";
import { InlineNotice, PrimaryAction, ScreenHeader, SecondaryAction, SkeletonBlock } from "../components";

export type RunningPlanDetailScreenProps = Readonly<{
  planId: string;
  loadPlan(planId: string): Promise<RunningPlanAggregate | null>;
  onBack(): void;
  onEdit(): void;
  onNewSession(): void;
  onEditSession(sessionRootId: string): void;
  onGarmin(): void;
  createLifecycleRequestId(): string;
  previewLifecycle(planId: string, action: RunningLifecycleAction): Promise<RunningLifecyclePreview>;
  confirmLifecycle(input: Readonly<{ action: RunningLifecycleAction; preview: RunningLifecyclePreview; requestId: string }>): Promise<RunningPlanAggregate>;
}>;

type LoadState = "loading" | "ready" | "missing" | "error";

function paceLabel(milliseconds: number | undefined): string | null {
  if (milliseconds === undefined) return null;
  const totalSeconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")} / km`;
}

function sessionLabel(entry: RunningPlanSession): string {
  const kind = entry.session.sessionKind.replaceAll("_", " ");
  return `${entry.slot.weekday} · ${entry.slot.ordinal + 1} · ${kind}`;
}

function Facts({ plan, onEditSession }: Readonly<{ plan: RunningPlanAggregate; onEditSession(sessionRootId: string): void }>) {
  const sessions = useMemo(() => [...plan.sessions].sort((left, right) =>
    left.slot.weekday.localeCompare(right.slot.weekday, "en") || left.slot.ordinal - right.slot.ordinal || left.slot.rootId.localeCompare(right.slot.rootId, "en")), [plan.sessions]);
  const pace = plan.goal.targetDurationMs === undefined ? null : paceLabel(Math.round(plan.goal.targetDurationMs / (plan.goal.goalDistanceMeters / 1000)));
  return <>
    <Text accessibilityRole="header">{plan.name}</Text>
    <Text>{plan.lifecycle.toUpperCase()}</Text>
    <Text>{`Goal · ${plan.goal.goalDistanceMeters} m`}</Text>
    {plan.goal.targetDurationMs === undefined ? <Text>Target time · Not set</Text> : <Text>{`Target time · ${plan.goal.targetDurationMs} ms`}</Text>}
    {pace === null ? null : <Text>{`Target pace · ${pace}`}</Text>}
    {plan.goal.targetLocalDate === undefined ? null : <Text>{`Target date · ${plan.goal.targetLocalDate}`}</Text>}
    <Text>{`Training days · ${plan.goal.trainingDays.join(", ")}`}</Text>
    <Text accessibilityRole="header">Weekly sessions</Text>
    {sessions.length === 0 ? <Text>No weekly sessions scheduled.</Text> : sessions.map((entry) => <View key={entry.slot.rootId}>
      <Text>{sessionLabel(entry)}</Text>
      <Text>{`Revision ${entry.session.revision}`}</Text>
      <SecondaryAction label={`Edit ${sessionLabel(entry)}`} onPress={() => onEditSession(entry.session.rootId)} />
    </View>)}
  </>;
}

export function RunningPlanDetailScreen(props: RunningPlanDetailScreenProps) {
  const [state, setState] = useState<LoadState>("loading");
  const [plan, setPlan] = useState<RunningPlanAggregate | null>(null);
  const [retryGeneration, setRetryGeneration] = useState(0);
  const [review, setReview] = useState<RunningLifecyclePreview | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let mounted = true;
    setState("loading");
    void props.loadPlan(props.planId).then((loaded) => {
      if (!mounted) return;
      setPlan(loaded);
      setState(loaded === null ? "missing" : "ready");
    }).catch(() => {
      if (!mounted) return;
      setPlan(null);
      setState("error");
    });
    return () => { mounted = false; };
  }, [props, retryGeneration]);

  if (state === "loading") return <AdaptiveScreen testID="running-plan-detail" primary={<><ScreenHeader backAction={props.onBack} title="Running plan" />{Array.from({ length: 4 }, (_, index) => <SkeletonBlock key={index} height={72} testID={`running-plan-skeleton-${index + 1}`} />)}</>} />;
  if (state === "missing" || plan === null) return <AdaptiveScreen testID="running-plan-detail" primary={<><ScreenHeader backAction={props.onBack} title="Running plan" /><InlineNotice heading="Running plan not found" body="Return to Library and choose a Running plan." /></>} />;
  if (state === "error") return <AdaptiveScreen testID="running-plan-detail" primary={<><ScreenHeader backAction={props.onBack} title="Running plan" /><InlineNotice heading="Running plan could not be loaded" body="Your Library was not changed. Try again." tone="error" action={<SecondaryAction label="Retry" onPress={() => setRetryGeneration((value) => value + 1)} />} /></>} />;
  const beginLifecycleReview = (action: RunningLifecycleAction) => {
    setBusy(true);
    setReviewError(null);
    void props.previewLifecycle(plan.id, action).then((preview) => {
      setReview(preview);
    }).catch(() => {
      setReviewError("Lifecycle review could not be prepared. Your Running plan was not changed.");
    }).finally(() => setBusy(false));
  };
  const confirmLifecycle = () => {
    if (review === null) return;
    setBusy(true);
    setReviewError(null);
    void props.confirmLifecycle({ action: review.action, preview: review, requestId: props.createLifecycleRequestId() }).then((readBack) => {
      setPlan(readBack);
      setReview(null);
    }).catch(() => {
      setReviewError("Lifecycle confirmation did not commit. Review is retained so you can retry or cancel.");
    }).finally(() => setBusy(false));
  };
  const lifecycleAction: RunningLifecycleAction = plan.lifecycle === "inactive"
    ? "activate" : plan.lifecycle === "archived" ? "reactivate" : "archive";
  const lifecycleLabel = lifecycleAction === "activate" ? "Preview activation"
    : lifecycleAction === "archive" ? "Review archive" : "Review reactivate";
  return <AdaptiveScreen testID="running-plan-detail" primary={<><ScreenHeader backAction={props.onBack} title="Running plan" /><Facts plan={plan} onEditSession={props.onEditSession} />
    {review === null ? <PrimaryAction disabled={busy} label={lifecycleLabel} onPress={() => beginLifecycleReview(lifecycleAction)} /> : <View>
      <Text accessibilityRole="header">Review {review.action}</Text>
      {review.activeRunning === null ? <Text>No active Running schedule will be replaced.</Text> : <Text>{`Active Running schedule affected · ${review.activeRunning.planName} · revision ${review.activeRunning.planRevision}`}</Text>}
      {review.activeWorkout ? <InlineNotice heading="Finish the active workout first" body="No lifecycle change was made." tone="error" /> : <PrimaryAction disabled={busy} label={`Confirm ${review.action}`} onPress={confirmLifecycle} />}
      <SecondaryAction disabled={busy} label="Cancel lifecycle review" onPress={() => { setReview(null); setReviewError(null); }} />
    </View>}
    {reviewError === null ? null : <InlineNotice heading="Running lifecycle needs attention" body={reviewError} tone="error" action={<SecondaryAction disabled={busy} label="Retry review" onPress={() => beginLifecycleReview(review?.action ?? lifecycleAction)} />} />}
    <PrimaryAction disabled={busy} label="Edit running plan" onPress={props.onEdit} /><SecondaryAction disabled={busy} label="Add session" onPress={props.onNewSession} /><SecondaryAction disabled={busy} label="Sync Garmin / match activity" onPress={props.onGarmin} /></>} />;
}

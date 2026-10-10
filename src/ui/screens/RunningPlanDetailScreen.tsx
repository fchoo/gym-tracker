import React, { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";

import type { RunningPlanAggregate, RunningPlanSession } from "../../domains/running/contracts";
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
    <Text>{plan.active ? "ACTIVE" : "INACTIVE"}</Text>
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
  return <AdaptiveScreen testID="running-plan-detail" primary={<><ScreenHeader backAction={props.onBack} title="Running plan" /><Facts plan={plan} onEditSession={props.onEditSession} /><PrimaryAction label="Edit running plan" onPress={props.onEdit} /><SecondaryAction label="Add session" onPress={props.onNewSession} /><SecondaryAction label="Sync Garmin / match activity" onPress={props.onGarmin} /></>} />;
}

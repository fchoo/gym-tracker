import React, { useEffect, useRef, useState } from "react";
import { Text, View, type TextStyle } from "react-native";

import {
  AdaptiveScreen,
} from "../layout/AdaptiveScreen";
import {
  ActionRow,
  InlineNotice,
  PrimaryAction,
  ScreenHeader,
  SecondaryAction,
  SkeletonBlock,
} from "../components";
import {
  ConfirmationDialog,
} from "../components/ConfirmationDialog";
import {
  typeScale,
  useAppTheme,
} from "../theme";

export type OwnedPlanDetailScreenProps = Readonly<{
  planId: string;
  loadPlan(planId: string): Promise<OwnedPlanDetailSnapshot | null>;
  duplicatePlan(input: Readonly<{
    sourcePlanId: string;
    expectedRevision: number;
    name: string;
  }>): Promise<OwnedPlanDetailResult>;
  archivePlan(input: Readonly<{
    planId: string;
    expectedRevision: number;
  }>): Promise<OwnedPlanDetailResult>;
  restorePlan(input: Readonly<{
    planId: string;
    expectedRevision: number;
  }>): Promise<OwnedPlanDetailResult>;
  onBack(): void;
  onEdit(): void;
  onSchedule(): void;
  onDuplicated(planId: string): void;
}>;

export type OwnedPlanDetailSnapshot = Readonly<{
  id: string;
  name: string;
  revision: number;
  lifecycle: "draft" | "ready" | "archived";
  isActive: boolean;
  hasInProgressWorkout: boolean;
  days: readonly Readonly<{ id: string; name: string }>[];
  scheduleDefaults: Readonly<{ lifecycle: string }> | null;
}>;

export type OwnedPlanDetailResult = Readonly<{
  outcome: "committed" | "already_committed" | "requires_schedule_impact";
  plan?: OwnedPlanDetailSnapshot;
}>;

type DetailState = "loading" | "ready" | "missing" | "error";
type LifecycleReview = "duplicate" | "archive" | "reactivate";

function resultPlan(result: OwnedPlanDetailResult): OwnedPlanDetailSnapshot | null {
  return result.outcome === "committed" || result.outcome === "already_committed"
    ? result.plan ?? null
    : null;
}

function lifecycleLabel(plan: OwnedPlanDetailSnapshot): string {
  if (plan.lifecycle === "archived") return "ARCHIVED";
  return plan.isActive ? "ACTIVE" : "INACTIVE";
}

function DetailSkeleton({ onBack }: Readonly<{ onBack(): void }>) {
  return (
    <AdaptiveScreen
      primary={<>
        <ScreenHeader backAction={onBack} title="Strength plan" />
        {Array.from({ length: 5 }, (_, index) => (
          <SkeletonBlock
            height={index === 0 ? 104 : 72}
            key={index}
            testID={`owned-plan-detail-skeleton-${index + 1}`}
          />
        ))}
      </>}
      testID="owned-plan-detail"
    />
  );
}

export function OwnedPlanDetailScreen(props: OwnedPlanDetailScreenProps) {
  const { colors } = useAppTheme();
  const duplicateTriggerRef = useRef<View>(null);
  const archiveTriggerRef = useRef<View>(null);
  const restoreTriggerRef = useRef<View>(null);
  const [state, setState] = useState<DetailState>("loading");
  const [plan, setPlan] = useState<OwnedPlanDetailSnapshot | null>(null);
  const [retryGeneration, setRetryGeneration] = useState(0);
  const [review, setReview] = useState<LifecycleReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

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
  }, [props.loadPlan, props.planId, retryGeneration]);

  const cancelReview = () => {
    setReview(null);
    setReviewError(null);
  };

  const confirmReview = () => {
    if (plan === null || review === null) return;
    setBusy(true);
    setReviewError(null);
    const execute = review === "duplicate"
      ? props.duplicatePlan({
          sourcePlanId: plan.id,
          expectedRevision: plan.revision,
          name: `${plan.name} Copy`,
        })
      : review === "archive"
      ? props.archivePlan({ planId: plan.id, expectedRevision: plan.revision })
      : props.restorePlan({ planId: plan.id, expectedRevision: plan.revision });
    void execute.then((result) => {
      const committed = resultPlan(result);
      if (committed === null) {
        setReviewError("This plan changed before confirmation. Review the current plan and try again.");
        return;
      }
      if (review === "duplicate") {
        props.onDuplicated(committed.id);
        return;
      }
      setPlan(committed);
      setReview(null);
    }).catch(() => {
      setReviewError("Lifecycle confirmation did not commit. Review is retained so you can retry or cancel.");
    }).finally(() => setBusy(false));
  };

  if (state === "loading") return <DetailSkeleton onBack={props.onBack} />;
  if (state === "missing" || plan === null) {
    return <AdaptiveScreen testID="owned-plan-detail" primary={<>
      <ScreenHeader backAction={props.onBack} title="Strength plan" />
      <InlineNotice
        body="Return to Library and choose one of your Strength plans."
        heading="Strength plan not found"
      />
    </>} />;
  }
  if (state === "error") {
    return <AdaptiveScreen testID="owned-plan-detail" primary={<>
      <ScreenHeader backAction={props.onBack} title="Strength plan" />
      <InlineNotice
        action={<SecondaryAction label="Retry" onPress={() => setRetryGeneration((value) => value + 1)} />}
        body="Your Library was not changed. Try again."
        heading="Strength plan could not be loaded"
        tone="error"
      />
    </>} />;
  }

  const isArchived = plan.lifecycle === "archived";
  const reviewHeading = review === null ? "" : `Review ${review}`;
  const reviewBody = review === "duplicate"
    ? "This creates a fresh inactive plan. The original schedule and completed history stay unchanged."
    : review === "archive"
    ? "Archiving changes future Library visibility only. Completed history and revisions stay immutable."
    : "Reactivating restores this plan to inactive Library visibility. Review activation separately with current schedule facts.";
  const reviewConfirm = review === null ? "" : `Confirm ${review}`;

  return <>
    <AdaptiveScreen
      primary={<>
        <ScreenHeader backAction={props.onBack} title="Strength plan" />
        <Text accessibilityRole="header" style={[typeScale.sectionTitle as TextStyle, { color: colors.textPrimary }]}>
          {plan.name}
        </Text>
        <Text style={[typeScale.label as TextStyle, { color: colors.textSecondary }]}>
          {lifecycleLabel(plan)}
        </Text>
        <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>
          {`Training days · ${plan.days.length}`}
        </Text>
        <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>
          {plan.scheduleDefaults === null
            ? "Schedule · Not scheduled"
            : `Schedule · ${plan.scheduleDefaults.lifecycle}`}
        </Text>
        <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>
          Completed history is immutable.
        </Text>
        <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>
          Source · Your Strength plan
        </Text>
        {plan.hasInProgressWorkout ? <InlineNotice
          body="Finish the active workout before changing this plan lifecycle. Its completed facts remain unchanged."
          heading="Active workout guard"
          tone="attention"
        /> : null}
        {plan.days.map((day) => <Text key={day.id} style={[typeScale.body as TextStyle, { color: colors.textPrimary }]}>{day.name}</Text>)}
        {reviewError === null ? null : <InlineNotice
          body={reviewError}
          heading="Lifecycle needs attention"
          tone="error"
        />}
        <ActionRow><PrimaryAction label="Edit plan" onPress={props.onEdit} />
        <SecondaryAction label="Edit schedule" onPress={props.onSchedule} />
        {!isArchived ? <SecondaryAction
          disabled={plan.hasInProgressWorkout}
          label="Preview activation"
          onPress={props.onSchedule}
        /> : null}</ActionRow>
        <ActionRow><SecondaryAction
          disabled={plan.hasInProgressWorkout || busy}
          label="Duplicate plan"
          onPress={() => setReview("duplicate")}
          ref={duplicateTriggerRef}
        />
        {isArchived ? <SecondaryAction
          disabled={plan.hasInProgressWorkout || busy}
          label="Reactivate plan"
          onPress={() => setReview("reactivate")}
          ref={restoreTriggerRef}
        /> : <SecondaryAction
          disabled={plan.hasInProgressWorkout || busy}
          destructive
          label="Archive plan"
          onPress={() => setReview("archive")}
          ref={archiveTriggerRef}
        />}</ActionRow>
      </>}
      testID="owned-plan-detail"
    />
    <ConfirmationDialog
      body={reviewBody}
      cancelLabel="Cancel lifecycle review"
      confirmBusy={busy}
      confirmLabel={reviewConfirm}
      destructive={review === "archive"}
      heading={reviewHeading}
      onCancel={cancelReview}
      onConfirm={confirmReview}
      restoreFocusRef={review === "duplicate" ? duplicateTriggerRef : review === "archive" ? archiveTriggerRef : restoreTriggerRef}
      visible={review !== null}
    />
  </>;
}

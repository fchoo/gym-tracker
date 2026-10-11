import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, StyleSheet, Text, View, type TextStyle } from "react-native";

import type {
  RunningActivityMatchCandidate,
  RunningActivityMatchReadResult,
  RunningActivityMatchResult,
} from "../../domains/running/activityMatchCommands";
import {
  AppearanceSheet,
  ContentCard,
  EmptyState,
  FocusablePressable,
  IconAction,
  InlineNotice,
  PrimaryAction,
  SecondaryAction,
} from "../components";
import { AdaptiveScreen } from "../layout/AdaptiveScreen";
import { radius, sizes, space, typeScale, useAppTheme } from "../theme";

export type ActivityMatchScreenState = RunningActivityMatchReadResult
  | Readonly<{ kind: "loading" | "projection_error" }>;

export type ActivityMatchScreenProps = Readonly<{
  state: ActivityMatchScreenState;
  onBack(): void;
  onLeaveUnmatched(): void;
  onRetry(): void;
  onConfirm(candidate: RunningActivityMatchCandidate): Promise<RunningActivityMatchResult>;
  width?: number;
}>;

const sessionLabel = (kind: RunningActivityMatchCandidate["sessionKind"]): string =>
  kind === "long_run" ? "Long run" : `${kind[0]!.toUpperCase()}${kind.slice(1)}`;

function MatchHeader({ onAppearance, onBack, appearanceRef }: Readonly<{
  onAppearance(): void;
  onBack(): void;
  appearanceRef: React.RefObject<View | null>;
}>) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.header} testID="activity-match-three-column-header">
      <View style={styles.headerSide}>
        <IconAction accessibilityLabel="Go back" icon="back" onPress={onBack} />
      </View>
      <View accessibilityLabel="Match to scheduled workout" accessibilityRole="header" accessible focusable style={styles.headerTitleColumn}>
        <Text numberOfLines={1} style={[typeScale.screenTitle as TextStyle, styles.headerTitle, { color: colors.textPrimary }]}>Match to scheduled workout</Text>
      </View>
      <SecondaryAction label="Appearance" onPress={onAppearance} ref={appearanceRef} style={styles.headerAction} />
    </View>
  );
}

function CandidateRow({ candidate, selected, onSelect }: Readonly<{
  candidate: RunningActivityMatchCandidate;
  selected: boolean;
  onSelect(): void;
}>) {
  const { colors } = useAppTheme();
  const kind = sessionLabel(candidate.sessionKind);
  const time = candidate.localTime ?? "Time not scheduled";
  const label = `${kind}. ${candidate.planName}. ${candidate.localDate}. ${time}. ${candidate.targetSummary}. Slot ${candidate.slotOrdinal + 1}.`;
  return (
    <FocusablePressable
      accessibilityLabel={label}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      focusable
      onPress={onSelect}
      style={styles.candidateTarget}
      testID={`activity-match-candidate-${candidate.slotOrdinal}`}
    >
      <ContentCard selected={selected} style={styles.candidateCard}>
        <View style={styles.candidateHeading}>
          <Text style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>{kind}</Text>
          <Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>{`Slot ${candidate.slotOrdinal + 1}`}</Text>
        </View>
        <Text style={[typeScale.body as TextStyle, { color: colors.textPrimary }]}>{candidate.planName}</Text>
        <Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>{`${candidate.localDate} · ${time} · ${candidate.timezone}`}</Text>
        <Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>{candidate.targetSummary}</Text>
      </ContentCard>
    </FocusablePressable>
  );
}

export function ActivityMatchScreen(props: ActivityMatchScreenProps) {
  const { colors } = useAppTheme();
  const appearanceRef = useRef<View>(null);
  const statusRef = useRef<View>(null);
  const busyRef = useRef(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<string | null>(
    props.state.kind === "ready" ? props.state.candidates[0]?.opportunityId ?? null : null,
  );
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<"matched" | "stale" | "save_failure" | null>(null);

  useEffect(() => {
    if (props.state.kind !== "ready") {
      setSelectedOpportunityId(null);
      return;
    }
    const candidates = props.state.candidates;
    setSelectedOpportunityId((current) => candidates.some((candidate) => candidate.opportunityId === current)
      ? current
      : candidates[0]?.opportunityId ?? null);
    setOutcome(null);
  }, [props.state]);

  useEffect(() => {
    if (outcome === "stale" || outcome === "save_failure") {
      statusRef.current?.focus?.();
    }
  }, [outcome]);

  const requestBack = () => {
    if (appearanceOpen) {
      setAppearanceOpen(false);
      return;
    }
    props.onBack();
  };

  const candidates = props.state.kind === "ready" ? props.state.candidates : [];
  const selected = candidates.find((candidate) => candidate.opportunityId === selectedOpportunityId);
  const confirm = async () => {
    if (selected === undefined || busyRef.current || outcome === "matched" || outcome === "stale") return;
    busyRef.current = true;
    setBusy(true);
    setOutcome(null);
    try {
      const result = await props.onConfirm(selected);
      if (result.kind === "matched" || result.kind === "replayed") {
        setOutcome("matched");
        AccessibilityInfo.announceForAccessibility("Matched");
      } else {
        setOutcome("stale");
        AccessibilityInfo.announceForAccessibility("Match needs review");
      }
    } catch {
      setOutcome("save_failure");
      AccessibilityInfo.announceForAccessibility("Match could not be saved");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const retryCandidates = () => {
    if (busyRef.current) return;
    setSelectedOpportunityId(null);
    setOutcome(null);
    props.onRetry();
  };

  const primary = (
    <>
      <MatchHeader appearanceRef={appearanceRef} onAppearance={() => setAppearanceOpen(true)} onBack={requestBack} />
      {props.state.kind === "loading" ? (
        <Text accessibilityLiveRegion="polite" accessibilityRole="progressbar" style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>Loading scheduled workouts</Text>
      ) : null}
      {props.state.kind === "missing" ? <EmptyState body="This local activity could not be opened." heading="Activity not found" primaryAction={null} /> : null}
      {props.state.kind === "activity_unavailable" ? <EmptyState body="The activity is no longer available for matching." heading="Activity unavailable" primaryAction={null} /> : null}
      {props.state.kind === "projection_error" ? <EmptyState body="Accepted match facts could not be loaded." heading="Scheduled workouts unavailable" primaryAction={<SecondaryAction label="Retry scheduled workouts" onPress={props.onRetry} />} /> : null}
      {props.state.kind === "no_candidates" ? <EmptyState body="There are no open Running occurrences to match." heading="No scheduled workouts" primaryAction={null} /> : null}
      {props.state.kind === "already_matched" ? <InlineNotice body="This activity already has one committed scheduled workout relation." heading="Already matched" tone="neutral" /> : null}
      {outcome === "matched" ? <InlineNotice body="The selected scheduled workout was linked after the match committed." heading="Matched" tone="neutral" /> : null}
      {outcome === "stale" ? (
        <View accessible focusable ref={statusRef}>
          <InlineNotice
            action={<SecondaryAction label="Retry scheduled workouts" onPress={retryCandidates} />}
            body="The activity or scheduled workout changed. Reload before confirming again."
            heading="Match needs review"
            tone="error"
          />
        </View>
      ) : null}
      {outcome === "save_failure" ? <View accessible focusable ref={statusRef}><InlineNotice body="Nothing was changed. Try confirming the same selection again." heading="Match could not be saved" tone="error" /></View> : null}
      {props.state.kind === "ready" ? (
        <View accessibilityRole="radiogroup" style={styles.candidates}>
          {props.state.candidates.map((candidate) => (
            <CandidateRow candidate={candidate} key={candidate.opportunityId} onSelect={() => setSelectedOpportunityId(candidate.opportunityId)} selected={candidate.opportunityId === selectedOpportunityId} />
          ))}
        </View>
      ) : null}
      <View style={styles.actions}>
        <PrimaryAction busy={busy} disabled={selected === undefined || outcome === "matched" || outcome === "stale"} label="Confirm match" onPress={() => { void confirm(); }} />
        <SecondaryAction disabled={busy} label="Leave unmatched" onPress={props.onLeaveUnmatched} />
      </View>
    </>
  );

  return (
    <>
      <AdaptiveScreen onRequestBack={requestBack} primary={primary} testID="activity-match-screen" {...(props.width === undefined ? {} : { width: props.width })} />
      <AppearanceSheet onClose={() => setAppearanceOpen(false)} restoreFocusRef={appearanceRef} visible={appearanceOpen} />
    </>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: "center", flexDirection: "row", gap: space[2], minHeight: sizes.primaryAction, width: "100%" },
  headerSide: { alignItems: "flex-start", width: 104 },
  headerTitleColumn: { alignItems: "center", flex: 1, minWidth: 0 },
  headerTitle: { maxWidth: "100%", textAlign: "center" },
  headerAction: { minWidth: 104, width: 104 },
  candidates: { gap: space[4] },
  candidateTarget: { minHeight: sizes.minimumTarget, width: "100%" },
  candidateCard: { borderRadius: radius.standard, gap: space[1], minHeight: sizes.minimumTarget },
  candidateHeading: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  actions: { gap: space[2] },
});

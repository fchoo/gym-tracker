import React, {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type TextStyle,
} from "react-native";

import type {
  AcceptedStarterOccurrence,
  AcceptedStarterTemplate,
} from "../../domains/plans";
import {
  starterFactLabel,
} from "../../bootstrap/starterPlanRuntime";
import {
  AdaptiveScreen,
  classifyWidth,
} from "../layout/AdaptiveScreen";
import {
  ContentCard,
  InlineNotice,
  PrimaryAction,
  ScreenHeader,
  SecondaryAction,
  SectionHeader,
  SkeletonBlock,
} from "../components";
import {
  radius,
  space,
  typeScale,
  useAppTheme,
} from "../theme";

type StarterPlanDetailScreenProps = Readonly<{
  templateId: string;
  loadStarterPlan(templateId: string): Promise<AcceptedStarterTemplate | null>;
  onActivate(templateId: string): void;
  onBack(): void;
  width?: number;
}>;

function metricLabel(occurrence: AcceptedStarterOccurrence): string {
  const labels = {
    load_reps: "Load + reps",
    bodyweight_reps: "Bodyweight reps",
    added_load_reps: "Added load + reps",
    assisted_reps: "Assisted reps",
    timed_hold: "Timed hold",
    fixed_distance: "Fixed distance",
    fixed_time: "Fixed time",
    intervals: "Rounds / intervals",
    unscored: "Mobility / unscored",
  } as const;
  return labels[occurrence.metricIdentity.profile];
}

function scheduleSummary(template: AcceptedStarterTemplate): string {
  const suggestion = template.scheduleSuggestion;
  if (suggestion.mode === "rotation") {
    const dayNames = new Map(
      template.days.map(({ id, displayName }) => [id, displayName]),
    );
    return `Rotation · ${
      suggestion.rotation.map((dayId) => dayNames.get(dayId) ?? dayId)
        .join(" · ")
    }`;
  }
  const dayNames = new Map(
    template.days.map(({ id, displayName }) => [id, displayName]),
  );
  return suggestion.cycleWeeks.map((week, index) =>
    `${suggestion.cycleWeeks.length > 1 ? `Week ${index + 1} · ` : ""}${
      week.map(({ weekday, dayId }) =>
        `${weekday} ${dayNames.get(dayId) ?? dayId}`
      ).join(" · ")
    }`
  ).join("\n");
}

function Overview({
  template,
}: Readonly<{ template: AcceptedStarterTemplate }>) {
  const { colors } = useAppTheme();
  const factStyle = [
    typeScale.body as TextStyle,
    { color: colors.contentCardTextSecondary },
  ];

  return (
    <ContentCard testID="starter-plan-overview-card">
      <SectionHeader title="Plan details" tone="card" />
      <View style={styles.facts}>
        <Text style={factStyle}>{template.goal}</Text>
        <Text style={factStyle}>
          {starterFactLabel(template.experience)}
        </Text>
        <Text style={factStyle}>
          {template.equipment.map(starterFactLabel).join(" · ")}
        </Text>
        <Text style={factStyle}>
          {`${template.estimatedDurationMinutes} minutes`}
        </Text>
        <Text style={factStyle}>
          {`${template.daysPerWeek} days per week`}
        </Text>
      </View>
      <SectionHeader title="Suggested schedule" tone="card" />
      <Text style={factStyle}>{scheduleSummary(template)}</Text>
      <SectionHeader title="Progression summary" tone="card" />
      <Text style={factStyle}>{template.progressionSummary}</Text>
      <SectionHeader title="Source notes" tone="card" />
      {template.sourceNotes.map((note) => (
        <View key={note.id} style={styles.sourceNote}>
          <Text style={factStyle}>{note.text}</Text>
          <Text style={[
            typeScale.label as TextStyle,
            { color: colors.contentCardTextSecondary },
          ]}>
          {`Source: ${starterFactLabel(note.provenance)}`}
          </Text>
        </View>
      ))}
    </ContentCard>
  );
}

function Days({
  template,
}: Readonly<{ template: AcceptedStarterTemplate }>) {
  const { colors } = useAppTheme();

  return (
    <ContentCard testID="starter-plan-days-card">
      <SectionHeader title="Days and exercises" tone="card" />
      {template.days.map((day) => (
        <View key={day.id} style={styles.day}>
          <Text
            accessibilityRole="header"
            style={[
              typeScale.sectionTitle as TextStyle,
              { color: colors.contentCardText },
            ]}
          >
            {day.displayName}
          </Text>
          {day.exercises.map((occurrence) => (
            <View
              key={occurrence.id}
              style={[
                styles.exercise,
                { borderColor: colors.contentCardBorder },
              ]}
            >
              <Text style={[
                typeScale.bodyStrong as TextStyle,
                { color: colors.contentCardText },
              ]}>
                {occurrence.catalogName}
              </Text>
              <Text style={[
                typeScale.secondary as TextStyle,
                { color: colors.contentCardTextSecondary },
              ]}>
                {`${occurrence.target.plannedSets} sets · ${
                  metricLabel(occurrence)
                } · ${occurrence.restSeconds}s rest`}
              </Text>
              <Text style={[
                typeScale.secondary as TextStyle,
                { color: colors.contentCardTextSecondary },
              ]}>
                {occurrence.warmups.length === 0
                  ? "No warm-up sets"
                  : `${occurrence.warmups.length} warm-up ${
                      occurrence.warmups.length === 1 ? "set" : "sets"
                    }`}
              </Text>
            </View>
          ))}
        </View>
      ))}
    </ContentCard>
  );
}

function DetailSkeleton({
  onBack,
}: Readonly<{ onBack(): void }>) {
  return (
    <AdaptiveScreen
      primary={
        <>
          <ScreenHeader backAction={onBack} title="Starter plan" />
          {Array.from({ length: 5 }, (_, index) => (
            <SkeletonBlock
              height={index === 0 ? 96 : 72}
              key={index}
              testID={`starter-detail-skeleton-${index + 1}`}
            />
          ))}
        </>
      }
      testID="starter-plan-detail"
    />
  );
}

export function StarterPlanDetailScreen({
  templateId,
  loadStarterPlan,
  onActivate,
  onBack,
  width: widthOverride,
}: StarterPlanDetailScreenProps) {
  const { width: windowWidth } = useWindowDimensions();
  const width = widthOverride ?? windowWidth;
  const widthClass = classifyWidth(width);
  const [template, setTemplate] = useState<AcceptedStarterTemplate | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">(
    "loading",
  );
  const [retryGeneration, setRetryGeneration] = useState(0);

  useEffect(() => {
    let active = true;
    setState("loading");
    void loadStarterPlan(templateId).then((result) => {
      if (!active) {
        return;
      }
      setTemplate(result);
      setState(result === null ? "missing" : "ready");
    }).catch(() => {
      if (active) {
        setTemplate(null);
        setState("error");
      }
    });
    return () => {
      active = false;
    };
  }, [loadStarterPlan, retryGeneration, templateId]);

  const days = useMemo(
    () => template === null ? null : <Days template={template} />,
    [template],
  );

  if (state === "loading") {
    return <DetailSkeleton onBack={onBack} />;
  }

  if (state === "error" || state === "missing" || template === null) {
    return (
      <AdaptiveScreen
        primary={
          <>
            <ScreenHeader backAction={onBack} title="Starter plan" />
            {state === "error" ? (
              <InlineNotice
                action={
                  <SecondaryAction
                    label="Retry"
                    onPress={() => setRetryGeneration((value) => value + 1)}
                  />
                }
                body="Starter plan could not be loaded. Your Library was not changed. Try again."
                heading="Starter plan could not be loaded"
                tone="error"
              />
            ) : (
              <InlineNotice
                body="Return to Library and choose one of the six accepted starter plans."
                heading="Starter plan not found"
              />
            )}
          </>
        }
        testID="starter-plan-detail"
        width={width}
      />
    );
  }

  const overview = <Overview template={template} />;
  const primary = (
    <>
      <ScreenHeader backAction={onBack} title={template.displayName} />
      {overview}
      {widthClass === "compact" ? days : null}
      <PrimaryAction
        label="Activate plan"
        onPress={() => onActivate(template.id)}
      />
    </>
  );

  return (
    <AdaptiveScreen
      primary={primary}
      {...(widthClass === "compact" ? {} : { secondary: days })}
      testID="starter-plan-detail"
      width={width}
    />
  );
}

const styles = StyleSheet.create({
  facts: {
    gap: space[1],
  },
  sourceNote: {
    gap: space[1],
  },
  day: {
    gap: space[2],
  },
  exercise: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: space[1],
    paddingBottom: space[2],
  },
});

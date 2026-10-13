import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AccessibilityInfo,
  findNodeHandle,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type TextStyle,
} from "react-native";
import Svg, { Polyline } from "react-native-svg";

import type {
  ImportedActivityDetail,
  ImportedActivityDetailReadResult,
  ImportedActivityLap,
  ImportedActivityRoutePoint,
} from "../../domains/activities/activityDetails";
import {
  AppearanceSheet,
  EmptyState,
  IconAction,
  InlineNotice,
  PrimaryAction,
  SecondaryAction,
  SectionHeader,
} from "../components";
import { AdaptiveScreen } from "../layout/AdaptiveScreen";
import {
  calendarTypeScale,
  fontFamilies,
  radius,
  sizes,
  space,
  typeScale,
  useAppTheme,
} from "../theme";

const CalendarTypographyContext = React.createContext(false);

function ActivitySectionHeader(props: React.ComponentProps<typeof SectionHeader>) {
  const calendar = React.useContext(CalendarTypographyContext);
  return <SectionHeader
    {...props}
    {...(calendar ? {
      titleStyle: calendarTypeScale.heading as TextStyle,
      supportingTextStyle: calendarTypeScale.numeric as TextStyle,
    } : {})}
  />;
}

export type ImportedActivityDetailScreenState =
  | ImportedActivityDetailReadResult
  | Readonly<{
    kind: "revision_review";
    review: Readonly<{
      activityId: string;
      acceptedRevision: number;
      proposedRevision: number;
      expectedProposedSha256: string;
      changedFields: readonly Readonly<{
        field: string;
        accepted: string;
        proposed: string;
      }>[];
    }>;
  }>
  | Readonly<{ kind: "loading" }>;

export type ImportedActivityDetailScreenProps = Readonly<{
  state: ImportedActivityDetailScreenState;
  mode?: "management" | "calendar";
  onBack(): void;
  onMatch?(): void;
  onRetry(): void;
  onAcceptRevision?(): Promise<void>;
  onKeepRevision?(): Promise<void>;
  returnFocusMatchActionToken?: string;
  returnFocusMatchActionVersion?: number;
  width?: number;
}>;

type RevisionReviewState = Extract<
  ImportedActivityDetailScreenState,
  Readonly<{ kind: "revision_review" }>
>;

function hasRevisionReview(
  state: RevisionReviewState,
): state is Extract<RevisionReviewState, Readonly<{ review: unknown }>> {
  return "review" in state;
}

type FocusTarget = View & Readonly<{ focus?: () => void }>;

function focusAccessible(ref: React.RefObject<FocusTarget | null>): void {
  ref.current?.focus?.();
  let node: number | null = null;
  try {
    node = findNodeHandle(ref.current);
  } catch {
    // Host renderers may not provide a native handle.
  }
  if (typeof node === "number" && node > 0) {
    AccessibilityInfo.setAccessibilityFocus(node);
  }
}

function DetailHeader({
  onAppearance,
  onBack,
  appearanceRef,
  backRef,
  headingRef,
}: Readonly<{
  onAppearance(): void;
  onBack(): void;
  appearanceRef: React.RefObject<View | null>;
  backRef: React.RefObject<FocusTarget | null>;
  headingRef: React.RefObject<FocusTarget | null>;
}>) {
  const { colors } = useAppTheme();
  const calendar = React.useContext(CalendarTypographyContext);
  return (
    <View style={styles.header} testID="activity-detail-three-column-header">
      <View style={styles.headerSide}>
        <IconAction accessibilityLabel={calendar ? "Back to Calendar agenda" : "Go back"} icon="back" onPress={onBack} ref={backRef} testID="activity-detail-back-action" />
      </View>
      <View
        accessibilityLabel="Activity detail"
        accessibilityRole="header"
        accessible
        focusable
        ref={headingRef}
        style={styles.headerTitleColumn}
        testID="activity-detail-heading"
      >
        <Text
          numberOfLines={1}
          style={[(calendar ? calendarTypeScale.heading : typeScale.screenTitle) as TextStyle, styles.headerTitle, { color: colors.textPrimary }]}
          testID="activity-detail-title-text"
        >
          Activity detail
        </Text>
      </View>
      <SecondaryAction
        label="Appearance"
        onPress={onAppearance}
        ref={appearanceRef}
        style={styles.headerAction}
      />
    </View>
  );
}

function Fact({ label, value, detail }: Readonly<{
  label: string;
  value: string;
  detail?: string;
}>) {
  const { colors } = useAppTheme();
  const calendar = React.useContext(CalendarTypographyContext);
  return (
    <View accessibilityLabel={`${label}. ${value}.${detail === undefined ? "" : ` ${detail}.`}`} accessible style={styles.fact}>
      <Text style={[(calendar ? calendarTypeScale.metadata : typeScale.label) as TextStyle, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[calendar ? calendarTypeScale.numeric : styles.numericStrong, { color: colors.textPrimary }]}>{value}</Text>
      {detail === undefined ? null : (
        <Text style={[calendar ? calendarTypeScale.numeric : styles.numericSecondary, { color: colors.textSecondary }]}>{detail}</Text>
      )}
    </View>
  );
}

function routePolyline(segments: readonly (readonly ImportedActivityRoutePoint[])[]) {
  const points = segments.flat();
  const latitudes = points.map(({ latitudeE6 }) => latitudeE6);
  const longitudes = points.map(({ longitudeE6 }) => longitudeE6);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);
  const latitudeRange = Math.max(1, maxLatitude - minLatitude);
  const longitudeRange = Math.max(1, maxLongitude - minLongitude);
  return segments.map((segment) => segment.map(({ latitudeE6, longitudeE6 }) => {
    const x = 12 + ((longitudeE6 - minLongitude) / longitudeRange) * 316;
    const y = 148 - ((latitudeE6 - minLatitude) / latitudeRange) * 136;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" "));
}

function ActivityRoute({ detail }: Readonly<{ detail: ImportedActivityDetail }>) {
  const { colors } = useAppTheme();
  if (detail.route.kind !== "available") {
    const unavailable = detail.route.kind === "none"
      ? {
        heading: "No route",
        body: "Treadmill activity has no route. Source distance, time, pace, and laps remain separate facts.",
      }
      : {
        heading: "Route unavailable",
        body: "No usable source positions were available for this outdoor activity.",
      };
    return (
      <View style={styles.section}>
        <ActivitySectionHeader title="Route" />
        <InlineNotice body={unavailable.body} heading={unavailable.heading} tone="neutral" />
      </View>
    );
  }
  const pointCount = detail.route.segments.reduce((count, segment) => count + segment.length, 0);
  const label = `Route from ${pointCount} validated source positions in ${detail.route.segments.length} segment${detail.route.segments.length === 1 ? "" : "s"}.`;
  return (
    <View style={styles.section}>
      <ActivitySectionHeader title="Route" />
      <View accessibilityLabel={label} accessibilityRole="image" accessible>
        <Svg
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.route, { backgroundColor: colors.surface, borderColor: colors.divider }]}
          testID="activity-detail-route"
          viewBox="0 0 340 160"
        >
          {routePolyline(detail.route.segments).map((points, index) => (
            <Polyline
              fill="none"
              key={`${index}:${points}`}
              points={points}
              stroke={colors.action}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={4}
            />
          ))}
        </Svg>
      </View>
    </View>
  );
}

function LapCell({ children, label, stacked }: Readonly<{
  children: string;
  label: string;
  stacked: boolean;
}>) {
  const { colors } = useAppTheme();
  return (
    <View accessibilityLabel={`${label}. ${children}.`} accessible role="cell" style={styles.lapCell}>
      <Text
        style={[
          typeScale.secondary as TextStyle,
          !stacked && styles.lapCellLabelHidden,
          { color: colors.textSecondary },
        ]}
        {...(stacked ? { testID: "activity-detail-lap-cell-label" } : {})}
      >
        {label}
      </Text>
      <Text style={[styles.numericStrong, { color: colors.textPrimary }]}>{children}</Text>
    </View>
  );
}

function LapRow({ lap, index, stacked }: Readonly<{
  lap: ImportedActivityLap;
  index: number;
  stacked: boolean;
}>) {
  return (
    <View
      accessibilityLabel={`Lap ${lap.lap}. Time ${lap.time?.value ?? "Unavailable"}. Pace ${lap.pace?.value ?? "Unavailable"}.`}
      accessible
      role="row"
      style={[styles.lapRow, stacked && styles.lapRowStacked]}
      testID={`activity-detail-lap-row-${index}`}
    >
      <LapCell label="Lap" stacked={stacked}>{lap.lap}</LapCell>
      <LapCell label="Time" stacked={stacked}>{lap.time?.value ?? "Unavailable"}</LapCell>
      <LapCell label="Pace" stacked={stacked}>{lap.pace?.value ?? "Unavailable"}</LapCell>
    </View>
  );
}

function LapTable({ laps, stacked }: Readonly<{
  laps: readonly ImportedActivityLap[];
  stacked: boolean;
}>) {
  const { colors } = useAppTheme();
  if (laps.length === 0) {
    return (
      <View style={styles.section}>
        <ActivitySectionHeader title="Laps" />
        <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>Laps unavailable</Text>
      </View>
    );
  }
  return (
    <View style={styles.section}>
      <ActivitySectionHeader title="Laps" />
      <View accessibilityLabel={`${laps.length} source lap${laps.length === 1 ? "" : "s"}.`} role="table">
        <View role="row" style={[styles.lapHeader, { borderColor: colors.divider }]}>
          {(["Lap", "Time", "Pace"] as const).map((header) => (
            <View accessibilityLabel={header} accessible key={header} role="columnheader" style={styles.lapCell}>
              <Text style={[typeScale.label as TextStyle, { color: colors.textSecondary }]}>{header}</Text>
            </View>
          ))}
        </View>
        {laps.map((lap, index) => (
          <LapRow index={index} key={`${index}:${lap.lap}`} lap={lap} stacked={stacked} />
        ))}
      </View>
    </View>
  );
}

function ReadyDetail({ detail, matchActionRef, onMatch, stackedLaps }: Readonly<{
  detail: ImportedActivityDetail;
  matchActionRef: React.RefObject<View | null>;
  onMatch?: () => void;
  stackedLaps: boolean;
}>) {
  const { colors } = useAppTheme();
  return (
    <>
      <View style={styles.section}>
        <ActivitySectionHeader supportingText={detail.confirmedLocalDate} title={detail.activityType} />
        <View style={styles.factGrid}>
          <Fact label="Distance" value={detail.distance} />
          {detail.elapsed === undefined ? null : <Fact label="Elapsed" value={detail.elapsed} />}
          {detail.secondaryDuration === undefined ? null : (
            <Fact label={detail.secondaryDuration.label} value={detail.secondaryDuration.value} />
          )}
          {detail.averagePace === undefined ? null : (
            <Fact label="Average pace" value={detail.averagePace.value} detail={detail.averagePace.basis} />
          )}
        </View>
      </View>
      <ActivityRoute detail={detail} />
      {detail.averageHeartRate === undefined ? null : (
        <View
          accessibilityLabel={`Average heart rate. ${detail.averageHeartRate}.`}
          accessible
          style={[
            styles.heartRate,
            stackedLaps && styles.heartRateStacked,
            { borderColor: colors.divider },
          ]}
        >
          <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>Average heart rate</Text>
          <Text style={[styles.numericStrong, { color: colors.textPrimary }]}>{detail.averageHeartRate}</Text>
        </View>
      )}
      <LapTable laps={detail.laps} stacked={stackedLaps} />
      <InlineNotice body={detail.fidelity.body} heading={detail.fidelity.heading} tone="neutral" />
      {onMatch === undefined ? null : <PrimaryAction label="Match to scheduled workout" onPress={onMatch} ref={matchActionRef} />}
    </>
  );
}

function NonReadyDetail({
  onBusyChange,
  state,
  onRetry,
  onAcceptRevision,
  onKeepRevision,
  readOnly,
}: Readonly<{
  onBusyChange?(busy: boolean): void;
  state: Exclude<ImportedActivityDetailScreenState, Readonly<{ kind: "ready" }>>;
  onRetry(): void;
  onAcceptRevision?: () => Promise<void>;
  onKeepRevision?: () => Promise<void>;
  readOnly: boolean;
}>) {
  const { colors } = useAppTheme();
  const calendar = React.useContext(CalendarTypographyContext);
  const [busy, setBusy] = useState<"accept" | "keep" | null>(null);
  const [resolution, setResolution] = useState<"stale" | "save_failure" | null>(null);
  useEffect(() => {
    onBusyChange?.(busy !== null);
  }, [busy, onBusyChange]);
  switch (state.kind) {
    case "loading":
      return (
        <Text
          accessibilityLiveRegion="polite"
          accessibilityRole="progressbar"
          style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}
        >
          Loading activity details
        </Text>
      );
    case "missing":
      return (
        <EmptyState
          body="No accepted local activity exists for this route."
          heading="Activity not found"
          {...(calendar ? { headingStyle: calendarTypeScale.heading as TextStyle } : {})}
          primaryAction={null}
        />
      );
    case "removed":
      return (
        <EmptyState
          body="This imported activity is no longer in active history. No prior facts are shown here."
          heading="Activity removed"
          {...(calendar ? { headingStyle: calendarTypeScale.heading as TextStyle } : {})}
          primaryAction={null}
        />
      );
    case "projection_error":
      return (
        <EmptyState
          body="Accepted activity facts could not be projected. Raw source data is not used as a fallback."
          heading="Activity details unavailable"
          {...(calendar ? { headingStyle: calendarTypeScale.heading as TextStyle } : {})}
          primaryAction={<PrimaryAction label="Retry activity details" onPress={onRetry} />}
        />
      );
    case "revision_review":
      if (!hasRevisionReview(state)) {
        return (
          <EmptyState
            body="Updated source facts are available, but the detailed comparison could not be loaded yet."
            heading="Source revision needs review"
            {...(calendar ? { headingStyle: calendarTypeScale.heading as TextStyle } : {})}
            primaryAction={<PrimaryAction label="Retry activity details" onPress={onRetry} />}
          />
        );
      }
      return (
        <View style={styles.section}>
          <ActivitySectionHeader
            supportingText={`Accepted r${state.review.acceptedRevision} · Proposed r${state.review.proposedRevision}`}
            title="Source revision needs review"
          />
          <InlineNotice
            body="Accepted facts remain unchanged until you explicitly choose whether to use the updated source revision."
            heading="Review required"
            tone="attention"
          />
          {state.review.changedFields.map((field) => (
            <View
              accessibilityLabel={`${field.field}. Current ${field.accepted}. Updated ${field.proposed}.`}
              accessible
              key={field.field}
              style={[styles.revisionRow, { borderColor: colors.divider }]}
            >
              <Text style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>{field.field}</Text>
              <Text style={[styles.numericSecondary, { color: colors.textSecondary }]}>{`Current: ${field.accepted}`}</Text>
              <Text style={[styles.numericSecondary, { color: colors.textSecondary }]}>{`Updated: ${field.proposed}`}</Text>
            </View>
          ))}
          {resolution === null ? null : (
            <InlineNotice
              body={resolution === "stale"
                ? "The accepted or proposed revision changed. Reload before deciding again."
                : "Nothing was changed. Retry after reloading if needed."}
              heading={resolution === "stale" ? "Revision needs review" : "Revision decision failed"}
              tone="error"
            />
          )}
          {readOnly ? null : <PrimaryAction
            busy={busy === "accept"}
            disabled={busy !== null || onAcceptRevision === undefined}
            label="Use updated facts"
            onPress={() => {
              if (busy !== null || onAcceptRevision === undefined) return;
              setBusy("accept");
              setResolution(null);
              void onAcceptRevision().catch((error: unknown) => {
                setResolution(error instanceof Error && error.message === "stale" ? "stale" : "save_failure");
              }).finally(() => setBusy(null));
            }}
          />}
          {readOnly ? null : <SecondaryAction
            disabled={busy !== null || onKeepRevision === undefined}
            label="Keep current facts"
            onPress={() => {
              if (busy !== null || onKeepRevision === undefined) return;
              setBusy("keep");
              setResolution(null);
              void onKeepRevision().catch((error: unknown) => {
                setResolution(error instanceof Error && error.message === "stale" ? "stale" : "save_failure");
              }).finally(() => setBusy(null));
            }}
          />}
          <SecondaryAction disabled={busy !== null} label="Retry activity details" onPress={onRetry} />
        </View>
      );
  }
}

export function ImportedActivityDetailScreen({
  state,
  mode = "management",
  onBack,
  onMatch,
  onRetry,
  onAcceptRevision,
  onKeepRevision,
  returnFocusMatchActionToken,
  returnFocusMatchActionVersion,
  width,
}: ImportedActivityDetailScreenProps) {
  const dimensions = useWindowDimensions();
  const stackedLaps = (width ?? dimensions.width) < 600 || dimensions.fontScale >= 2;
  const appearanceRef = useRef<View>(null);
  const backRef = useRef<FocusTarget | null>(null);
  const matchActionRef = useRef<FocusTarget | null>(null);
  const headingRef = useRef<FocusTarget | null>(null);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [revisionBusy, setRevisionBusy] = useState(false);
  useEffect(() => {
    focusAccessible(mode === "calendar" ? backRef : headingRef);
  }, [mode]);
  useEffect(() => {
    if (returnFocusMatchActionToken !== undefined) {
      focusAccessible(matchActionRef);
    }
  }, [returnFocusMatchActionToken, returnFocusMatchActionVersion]);
  const requestBack = useMemo(() => (
    appearanceOpen
      ? () => setAppearanceOpen(false)
      : revisionBusy
        ? () => undefined
        : onBack
  ), [appearanceOpen, onBack, revisionBusy]);
  const primary = useMemo(() => (
    <CalendarTypographyContext.Provider value={mode === "calendar"}>
      <DetailHeader
        appearanceRef={appearanceRef}
        backRef={backRef}
        headingRef={headingRef}
        onAppearance={() => setAppearanceOpen(true)}
        onBack={requestBack}
      />
      {state.kind === "ready" ? (
        <ReadyDetail detail={state.detail} matchActionRef={matchActionRef} {...(mode === "calendar" ? {} : { onMatch })} stackedLaps={stackedLaps} />
      ) : (
        <NonReadyDetail
          onBusyChange={setRevisionBusy}
          onRetry={onRetry}
          readOnly={mode === "calendar"}
          state={state}
          {...(onAcceptRevision === undefined ? {} : { onAcceptRevision })}
          {...(onKeepRevision === undefined ? {} : { onKeepRevision })}
        />
      )}
    </CalendarTypographyContext.Provider>
  ), [headingRef, matchActionRef, mode, onAcceptRevision, onKeepRevision, onMatch, onRetry, requestBack, stackedLaps, state]);
  return (
    <>
      <AdaptiveScreen
        onRequestBack={requestBack}
        primary={primary}
        testID="imported-activity-detail-screen"
        {...(width === undefined ? {} : { width })}
      />
      <AppearanceSheet
        onClose={() => setAppearanceOpen(false)}
        restoreFocusRef={appearanceRef}
        visible={appearanceOpen}
      />
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: space[2],
    minHeight: sizes.deepRouteHeader,
    width: "100%",
  },
  headerSide: {
    alignItems: "flex-start",
    width: 104,
  },
  headerTitleColumn: {
    alignItems: "center",
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    maxWidth: "100%",
    textAlign: "center",
  },
  headerAction: {
    minWidth: 104,
    width: 104,
  },
  section: {
    gap: space[4],
    minWidth: 0,
  },
  factGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[2],
  },
  fact: {
    flexBasis: 144,
    flexGrow: 1,
    gap: space[1],
    minWidth: 0,
  },
  route: {
    borderRadius: radius.emphasized,
    borderWidth: StyleSheet.hairlineWidth,
    height: 160,
    width: "100%",
  },
  heartRate: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: space[4],
    justifyContent: "space-between",
    minHeight: sizes.minimumTarget,
    paddingVertical: space[2],
  },
  heartRateStacked: {
    alignItems: "flex-start",
    flexDirection: "column",
    justifyContent: "flex-start",
  },
  lapHeader: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    minHeight: sizes.minimumTarget,
  },
  lapRow: {
    flexDirection: "row",
    minHeight: sizes.minimumTarget,
  },
  lapRowStacked: {
    flexDirection: "column",
  },
  lapCell: {
    flex: 1,
    gap: space[1],
    justifyContent: "center",
    minWidth: 0,
    paddingHorizontal: space[1],
    paddingVertical: space[2],
  },
  lapCellLabelHidden: {
    display: "none",
  },
  revisionRow: {
    borderRadius: radius.standard,
    borderWidth: StyleSheet.hairlineWidth,
    gap: space[1],
    padding: space[2],
  },
  numericStrong: {
    ...typeScale.bodyStrong,
    fontFamily: fontFamilies.numericRegular,
    fontVariant: ["tabular-nums"],
    fontWeight: "400",
  } as TextStyle,
  numericSecondary: {
    ...typeScale.secondary,
    fontFamily: fontFamilies.numericRegular,
    fontVariant: ["tabular-nums"],
  } as TextStyle,
});

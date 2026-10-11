import React, {
  useMemo,
  useRef,
  useState,
} from "react";
import {
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type TextStyle,
} from "react-native";
import Svg, { Polyline } from "react-native-svg";

import type {
  ImportedActivityDetail,
  ImportedActivityLap,
  ImportedActivityRoutePoint,
} from "../../domains/activities/activityDetails";
import {
  AppearanceSheet,
  IconAction,
  InlineNotice,
  PrimaryAction,
  SecondaryAction,
  SectionHeader,
} from "../components";
import { AdaptiveScreen } from "../layout/AdaptiveScreen";
import {
  radius,
  sizes,
  space,
  typeScale,
  useAppTheme,
} from "../theme";

export type ImportedActivityDetailScreenState =
  | Readonly<{ kind: "ready"; detail: ImportedActivityDetail }>;

export type ImportedActivityDetailScreenProps = Readonly<{
  state: ImportedActivityDetailScreenState;
  onBack(): void;
  onMatch(): void;
  onRetry(): void;
  width?: number;
}>;

function DetailHeader({
  onAppearance,
  onBack,
  appearanceRef,
}: Readonly<{
  onAppearance(): void;
  onBack(): void;
  appearanceRef: React.RefObject<View | null>;
}>) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.header} testID="activity-detail-three-column-header">
      <View style={styles.headerSide}>
        <IconAction accessibilityLabel="Go back" icon="back" onPress={onBack} />
      </View>
      <View
        accessibilityLabel="Activity detail"
        accessibilityRole="header"
        accessible
        focusable
        style={styles.headerTitleColumn}
      >
        <Text
          numberOfLines={1}
          style={[typeScale.screenTitle as TextStyle, styles.headerTitle, { color: colors.textPrimary }]}
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
  return (
    <View accessibilityLabel={`${label}. ${value}.${detail === undefined ? "" : ` ${detail}.`}`} accessible style={styles.fact}>
      <Text style={[typeScale.label as TextStyle, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>{value}</Text>
      {detail === undefined ? null : (
        <Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>{detail}</Text>
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
        <SectionHeader title="Route" />
        <InlineNotice body={unavailable.body} heading={unavailable.heading} tone="neutral" />
      </View>
    );
  }
  const pointCount = detail.route.segments.reduce((count, segment) => count + segment.length, 0);
  const label = `Route from ${pointCount} validated source positions in ${detail.route.segments.length} segment${detail.route.segments.length === 1 ? "" : "s"}.`;
  return (
    <View style={styles.section}>
      <SectionHeader title="Route" />
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
      <Text style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>{children}</Text>
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
        <SectionHeader title="Laps" />
        <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>Laps unavailable</Text>
      </View>
    );
  }
  return (
    <View style={styles.section}>
      <SectionHeader title="Laps" />
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

function ReadyDetail({ detail, onMatch, stackedLaps }: Readonly<{
  detail: ImportedActivityDetail;
  onMatch(): void;
  stackedLaps: boolean;
}>) {
  const { colors } = useAppTheme();
  return (
    <>
      <View style={styles.section}>
        <SectionHeader supportingText={detail.confirmedLocalDate} title={detail.activityType} />
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
          style={[styles.heartRate, { borderColor: colors.divider }]}
        >
          <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>Average heart rate</Text>
          <Text style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>{detail.averageHeartRate}</Text>
        </View>
      )}
      <LapTable laps={detail.laps} stacked={stackedLaps} />
      <InlineNotice body={detail.fidelity.body} heading={detail.fidelity.heading} tone="neutral" />
      <PrimaryAction label="Match to scheduled workout" onPress={onMatch} />
    </>
  );
}

export function ImportedActivityDetailScreen({
  state,
  onBack,
  onMatch,
  width,
}: ImportedActivityDetailScreenProps) {
  const dimensions = useWindowDimensions();
  const stackedLaps = (width ?? dimensions.width) < 600 || dimensions.fontScale >= 2;
  const appearanceRef = useRef<View>(null);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const primary = useMemo(() => (
    <>
      <DetailHeader
        appearanceRef={appearanceRef}
        onAppearance={() => setAppearanceOpen(true)}
        onBack={onBack}
      />
      <ReadyDetail detail={state.detail} onMatch={onMatch} stackedLaps={stackedLaps} />
    </>
  ), [onBack, onMatch, stackedLaps, state]);
  return (
    <>
      <AdaptiveScreen
        onRequestBack={appearanceOpen ? () => setAppearanceOpen(false) : onBack}
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
});

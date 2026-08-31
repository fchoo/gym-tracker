import React from "react";
import {
  BackHandler,
  RefreshControl,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  sizes,
  space,
  useAppTheme,
} from "../theme";

export type WidthClass = "compact" | "medium" | "expanded";

export function classifyWidth(width: number): WidthClass {
  if (width < 600) {
    return "compact";
  }
  if (width < 840) {
    return "medium";
  }

  return "expanded";
}

export function horizontalInsetFor(widthClass: WidthClass): number {
  switch (widthClass) {
    case "compact":
      return space[4];
    case "medium":
      return space[6];
    case "expanded":
      return space[8];
  }
}

type AdaptiveScreenProps = Readonly<{
  primary: React.ReactNode;
  stickyHeader?: React.ReactNode;
  secondary?: React.ReactNode;
  dock?: React.ReactNode;
  width?: number;
  constrainActiveWork?: boolean;
  scrollable?: boolean;
  testID?: string;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollOffset?: number;
  scrollRestoreKey?: string;
  onRequestBack?: () => void;
  refreshing?: boolean;
  onRefresh?: () => void;
}>;

export function AdaptiveScreen({
  primary,
  stickyHeader,
  secondary,
  dock,
  width: widthOverride,
  constrainActiveWork = false,
  scrollable = true,
  testID = "adaptive-screen",
  onScroll,
  scrollOffset = 0,
  scrollRestoreKey,
  onRequestBack,
  refreshing = false,
  onRefresh,
}: AdaptiveScreenProps) {
  const scrollViewRef = React.useRef<ScrollView>(null);
  const previousScrollRestoreKeyRef = React.useRef(scrollRestoreKey);
  const { width: windowWidth } = useWindowDimensions();
  const { colors } = useAppTheme();
  const width = widthOverride ?? windowWidth;
  const widthClass = classifyWidth(width);
  const horizontalInset = horizontalInsetFor(widthClass);
  const hasTwoPanes = secondary !== undefined && widthClass !== "compact";

  React.useEffect(() => {
    if (onRequestBack === undefined) {
      return undefined;
    }
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        onRequestBack();
        return true;
      },
    );
    return () => subscription.remove();
  }, [onRequestBack]);
  React.useEffect(() => {
    if (
      scrollRestoreKey === undefined
      || previousScrollRestoreKeyRef.current === scrollRestoreKey
    ) {
      return;
    }
    previousScrollRestoreKeyRef.current = scrollRestoreKey;
    scrollViewRef.current?.scrollTo({
      animated: false,
      x: 0,
      y: scrollOffset,
    });
  }, [scrollOffset, scrollRestoreKey]);
  const content = (
    <View
      accessibilityLabel={`${widthClass} layout`}
      style={[
        styles.content,
        {
          paddingHorizontal: horizontalInset,
          paddingVertical: space[4],
        },
        hasTwoPanes && styles.contentTwoPane,
        constrainActiveWork && styles.centeredContent,
      ]}
      testID={testID}
    >
      <View
        style={[
          styles.primaryRegion,
          hasTwoPanes && styles.pane,
          constrainActiveWork && styles.activeWork,
        ]}
        testID="adaptive-primary-region"
      >
        {primary}
      </View>
      {secondary === undefined ? null : (
        <View
          style={[styles.secondaryRegion, hasTwoPanes && styles.pane]}
          testID="adaptive-secondary-region"
        >
          {secondary}
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView
      edges={["top", "right", "bottom", "left"]}
      style={[styles.safeArea, { backgroundColor: colors.canvas }]}
    >
      {stickyHeader === undefined ? null : (
        <View
          style={[
            styles.stickyHeader,
            {
              backgroundColor: colors.canvas,
              paddingHorizontal: horizontalInset,
            },
            constrainActiveWork && styles.stickyHeaderConstrained,
          ]}
          testID={`${testID}-sticky-header`}
        >
          {stickyHeader}
        </View>
      )}
      {scrollable ? (
        <>
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              dock !== undefined && styles.scrollContentWithDock,
            ]}
            keyboardShouldPersistTaps="handled"
            onScroll={onScroll}
            refreshControl={onRefresh === undefined ? undefined : (
              <RefreshControl
                onRefresh={onRefresh}
                refreshing={refreshing}
                tintColor={colors.action}
              />
            )}
            ref={scrollViewRef}
            scrollEventThrottle={16}
            testID={`${testID}-scroll`}
          >
            {content}
          </ScrollView>
          {dock === undefined ? null : (
            <View
              style={[
                styles.stickyDock,
                {
                  backgroundColor: colors.canvas,
                  paddingHorizontal: horizontalInset,
                },
                constrainActiveWork && styles.stickyDockConstrained,
              ]}
              testID="adaptive-dock"
            >
              {dock}
            </View>
          )}
        </>
      ) : (
        <>
          {content}
          {dock === undefined ? null : (
            <View
              style={[
                styles.stickyDock,
                {
                  backgroundColor: colors.canvas,
                  paddingHorizontal: horizontalInset,
                },
                constrainActiveWork && styles.stickyDockConstrained,
              ]}
              testID="adaptive-dock"
            >
              {dock}
            </View>
          )}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  scrollContentWithDock: {
    paddingBottom: space[16],
  },
  content: {
    flex: 1,
    gap: space[6],
    width: "100%",
  },
  contentTwoPane: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: space[8],
  },
  centeredContent: {
    alignSelf: "center",
    maxWidth: sizes.readableWorkoutWidth,
  },
  pane: {
    flex: 1,
  },
  primaryRegion: {
    gap: space[6],
    minWidth: 0,
  },
  activeWork: {
    alignSelf: "center",
    maxWidth: sizes.readableWorkoutWidth,
    width: "100%",
  },
  secondaryRegion: {
    gap: space[6],
    minWidth: 0,
  },
  stickyDock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    bottom: 0,
    paddingBottom: space[2],
    paddingTop: space[2],
    width: "100%",
  },
  stickyDockConstrained: {
    alignSelf: "center",
    maxWidth: sizes.readableWorkoutWidth,
  },
  stickyHeader: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: space[2],
    paddingTop: space[2],
    width: "100%",
    zIndex: 1,
  },
  stickyHeaderConstrained: {
    alignSelf: "center",
    maxWidth: sizes.readableWorkoutWidth,
  },
});

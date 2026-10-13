import React, { useEffect, useRef } from "react";
import { ChevronRight } from "lucide-react-native";
import { Animated, type ColorValue } from "react-native";

import { useAppTheme } from "../theme";

export const CALENDAR_DISCLOSURE_ROTATION_MS = 160;

export function CalendarDisclosureChevron({
  color,
  expanded,
  testID,
}: Readonly<{
  color: ColorValue;
  expanded: boolean;
  testID: string;
}>) {
  const { reduceMotion } = useAppTheme();
  const progress = useRef(new Animated.Value(expanded ? 1 : 0)).current;
  const previous = useRef({ expanded, reduceMotion });

  useEffect(() => {
    const expandedChanged = previous.current.expanded !== expanded;
    const reducedMotionEnabled = !previous.current.reduceMotion && reduceMotion;
    previous.current = { expanded, reduceMotion };
    if (!expandedChanged && !reducedMotionEnabled) return;
    progress.stopAnimation();
    if (reduceMotion) {
      progress.setValue(expanded ? 1 : 0);
      return;
    }
    const animation = Animated.timing(progress, {
      duration: CALENDAR_DISCLOSURE_ROTATION_MS,
      toValue: expanded ? 1 : 0,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [expanded, progress, reduceMotion]);

  return (
    <Animated.View
      style={{
        height: 24,
        transform: [{
          rotate: progress.interpolate({
            inputRange: [0, 1],
            outputRange: ["0deg", "90deg"],
          }),
        }],
        width: 24,
      }}
      testID={testID}
    >
      <ChevronRight accessible={false} color={color} size={24} strokeWidth={2} />
    </Animated.View>
  );
}

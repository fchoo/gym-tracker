import React from "react";
import {
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from "react-native";

import {
  ActionCluster,
  ContentCard,
  FocusablePressable,
} from "./index";
import {
  sizes,
  space,
  typeScale,
  useAppTheme,
} from "../theme";

export type PlanRowModel = Readonly<{
  id: string;
  name: string;
  daysPerWeek: number;
  status?: "Active" | "Draft" | "Archived" | "Inactive";
  scheduleSummary?: string;
  missingRequirement?: string | null;
  goal?: string;
  experience?: string;
  equipment?: readonly string[];
  estimateMinutes?: number;
  whyThisFits?: string;
  templateUpdateTemplateId?: string;
}>;

export function PlanRow({
  item,
  onPress,
  onOpenTemplateUpdate,
  selected = false,
}: Readonly<{
  item: PlanRowModel;
  onPress(): void;
  onOpenTemplateUpdate?(): void;
  selected?: boolean;
}>) {
  const { colors } = useAppTheme();
  const schedule = item.estimateMinutes === undefined
    ? item.scheduleSummary ?? "Not scheduled"
    : `${item.daysPerWeek} days per week · ${item.estimateMinutes} min`;
  const sourceFacts = item.goal === undefined
    ? null
    : [item.goal, item.experience, item.equipment?.join(", ")]
      .filter((value): value is string => value !== undefined)
      .join(" · ");
  const accessibilityLabel = [
    item.name,
    item.status,
    schedule,
    `${item.daysPerWeek} days`,
    sourceFacts,
    item.whyThisFits,
  ].filter(Boolean).join(". ");

  return (
    <ContentCard
      selected={selected}
      testID={"library-plan-card-" + item.id}
      {...(item.status === "Active" ? { status: "completed" as const } : {})}
    >
      <View style={styles.cardRow}>
      <FocusablePressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        focusable
        onPress={onPress}
        style={styles.mainAction}
      >
        <Text
          style={[
            typeScale.bodyStrong as TextStyle,
            { color: colors.contentCardText },
          ]}
        >
          {item.name}
        </Text>
        {item.status === undefined ? null : (
          <Text
            style={[
              typeScale.label as TextStyle,
              { color: colors.contentCardTextSecondary },
            ]}
          >
            {item.status}
          </Text>
        )}
        <Text
          style={[
            typeScale.secondary as TextStyle,
            { color: colors.contentCardTextSecondary },
          ]}
        >
          {schedule}
        </Text>
        {sourceFacts === null ? null : (
          <Text
            style={[
              typeScale.secondary as TextStyle,
              { color: colors.contentCardTextSecondary },
            ]}
          >
            {sourceFacts}
          </Text>
        )}
        {item.whyThisFits === undefined ? null : (
          <Text
            style={[
              typeScale.bodyStrong as TextStyle,
              { color: colors.contentCardText },
            ]}
          >
            {`Why this fits: ${item.whyThisFits}`}
          </Text>
        )}
        {item.missingRequirement === undefined
            || item.missingRequirement === null
          ? null
          : (
              <Text
                style={[
                  typeScale.secondary as TextStyle,
                  { color: colors.contentCardTextSecondary },
                ]}
              >
                {item.missingRequirement}
              </Text>
            )}
      </FocusablePressable>
      {item.templateUpdateTemplateId === undefined
          || onOpenTemplateUpdate === undefined
        ? null
        : (
            <ActionCluster style={styles.actionCluster}>
              <FocusablePressable
              accessibilityLabel={`Template update available for ${item.name}`}
              accessibilityRole="button"
              focusable
              onPress={onOpenTemplateUpdate}
              style={[
                styles.updateAction,
                { borderColor: colors.timerAttention },
              ]}
            >
            <Text
              style={[
                  typeScale.bodyStrong as TextStyle,
                  { color: colors.contentCardText },
              ]}
            >
                Template update available
            </Text>
              </FocusablePressable>
            </ActionCluster>
          )}
      </View>
    </ContentCard>
  );
}

const styles = StyleSheet.create({
  cardRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: space[2],
  },
  mainAction: {
    flex: 1,
    gap: space[1],
    minHeight: sizes.minimumTarget,
    minWidth: 0,
  },
  actionCluster: {
    alignSelf: "stretch",
  },
  updateAction: {
    alignItems: "center",
    borderRadius: sizes.focusRing * 4,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    minHeight: sizes.minimumTarget,
    minWidth: sizes.minimumTarget,
    paddingHorizontal: space[4],
    paddingVertical: space[2],
  },
});

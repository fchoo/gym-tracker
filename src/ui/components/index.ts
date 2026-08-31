import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  Check,
  Circle,
  Dumbbell,
  Ellipsis,
  Eye,
  EyeOff,
  LibraryBig,
  RotateCcw,
  Star,
  Timer,
  TriangleAlert,
  X,
} from "lucide-react-native";
import React, {
  Children,
  forwardRef,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type PressableStateCallbackType,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import {
  radius,
  sizes,
  space,
  type AppearancePreference,
  typeScale,
  useAppTheme,
} from "../theme";

export {
  ImpactPreview,
  type ImpactPreviewItem,
} from "./ImpactPreview";
export {
  CalendarField,
  type CalendarFieldProps,
} from "./CalendarField";
export {
  RestAlertSettingsSheet,
} from "./RestAlertSettingsSheet";
export {
  M3SearchField,
  type M3SearchFieldProps,
  type M3SearchFieldState,
} from "./M3SearchField";
export {
  M3FilterChip,
  type M3FilterChipProps,
} from "./M3FilterChip";

type ActionProps = Readonly<{
  label: string;
  onPress: () => void;
  accessibilityHint?: string;
  accessibilityActions?: PressableProps["accessibilityActions"];
  onAccessibilityAction?: PressableProps["onAccessibilityAction"];
  busy?: boolean;
  disabled?: boolean;
  testID?: string;
}>;

function actionAccessibilityState(
  disabled: boolean,
  busy: boolean,
): { busy: boolean; disabled: boolean } {
  return {
    busy,
    disabled: disabled || busy,
  };
}

function handleActionKey(
  key: string,
  disabled: boolean,
  onPress: () => void,
): void {
  if (!disabled && (key === "Enter" || key === " ")) {
    onPress();
  }
}

function keyboardActivationProps(
  disabled: boolean,
  onPress: () => void,
): PressableProps {
  return {
    onKeyDown: (event: { nativeEvent: { key: string } }) =>
      handleActionKey(event.nativeEvent.key, disabled, onPress),
  } as unknown as PressableProps;
}

const h = React.createElement;

type FocusablePressableProps = PressableProps & Readonly<{
  onKeyDown?: (event: { nativeEvent: { key: string } }) => void;
}>;

type ContentCardProps = Readonly<{
  children: React.ReactNode;
  disabled?: boolean;
  focused?: boolean;
  pressed?: boolean;
  selected?: boolean;
  status?: "completed" | "attention" | "error";
  style?: ViewStyle;
  testID?: string;
}>;

function containsContentCard(children: React.ReactNode): boolean {
  return Children.toArray(children).some((child) =>
    React.isValidElement(child)
    && child.type === ContentCard
  );
}

export function ContentCard({
  children,
  disabled = false,
  focused = false,
  pressed = false,
  selected = false,
  status,
  style,
  testID,
}: ContentCardProps) {
  const { colors } = useAppTheme();
  if (containsContentCard(children)) {
    throw new Error("ContentCard cannot be nested");
  }

  const backgroundColor = disabled
    ? colors.contentCardDisabled
    : pressed
      ? colors.contentCardPressed
      : selected
        ? colors.contentCardSelected
        : colors.contentCard;
  const borderColor = status === "completed"
    ? colors.contentCardStatusCompleted
    : status === "attention"
      ? colors.timerAttention
      : status === "error"
        ? colors.destructive
        : colors.contentCardBorder;

  return h(
    View,
    {
      accessibilityState: { disabled, selected },
      style: [
        styles.contentCard,
        {
          backgroundColor,
          borderColor,
          opacity: disabled ? 0.62 : 1,
          outlineColor: colors.focusRing,
          outlineStyle: "solid",
          outlineWidth: focused ? sizes.focusRing : 0,
        },
        style,
      ],
      testID,
    },
    children,
  );
}

export function ActionCluster({
  children,
  style,
  testID,
}: Readonly<{
  children: React.ReactNode;
  style?: ViewStyle;
  testID?: string;
}>) {
  return h(
    View,
    {
      style: [styles.actionCluster, style],
      testID,
    },
    children,
  );
}

export const FocusablePressable = forwardRef<View, FocusablePressableProps>(
  function FocusablePressableElement(
    {
      disabled = false,
      onBlur,
      onFocus,
      onKeyDown,
      onPress,
      style,
      ...props
    },
    ref,
  ) {
    const { colors } = useAppTheme();
    const [focused, setFocused] = useState(false);
    const isDisabled = disabled === true;
    const keyboardProps = onKeyDown === undefined
      ? onPress === null || onPress === undefined
        ? {}
        : keyboardActivationProps(
            isDisabled,
            () => (onPress as unknown as () => void)(),
          )
      : { onKeyDown };

    return h(Pressable, {
      ...props,
      disabled: isDisabled,
      ...keyboardProps,
      onBlur: (event: Parameters<NonNullable<PressableProps["onBlur"]>>[0]) => {
        setFocused(false);
        onBlur?.(event);
      },
      onFocus: (event: Parameters<NonNullable<PressableProps["onFocus"]>>[0]) => {
        setFocused(true);
        onFocus?.(event);
      },
      onPress,
      ref,
      style: (state: PressableStateCallbackType) => [
        typeof style === "function" ? style(state) : style,
        {
          outlineColor: colors.focusRing,
          outlineStyle: "solid",
          outlineWidth: focused ? sizes.focusRing : 0,
        },
      ],
    } as unknown as PressableProps);
  },
);

function iconElement(
  Icon: typeof ArrowLeft,
  color: string,
  accessibilityLabel?: string,
) {
  const accessibilityProps =
    accessibilityLabel === undefined
      ? {
          accessibilityElementsHidden: true,
          importantForAccessibility: "no-hide-descendants" as const,
        }
      : {
          accessibilityElementsHidden: false,
          accessibilityLabel,
          importantForAccessibility: "auto" as const,
        };

  return h(Icon, {
    ...accessibilityProps,
    color,
    size: sizes.icon,
    strokeWidth: 2,
  });
}

function actionText(label: string, color: string) {
  return h(
    Text,
    {
      style: [
        typeScale.bodyStrong as TextStyle,
        styles.actionLabel,
        { color },
      ],
    },
    label,
  );
}

export const PrimaryAction = forwardRef<View, ActionProps>(
  function PrimaryActionElement(
    {
      label,
      onPress,
      accessibilityHint,
      accessibilityActions,
      onAccessibilityAction,
      busy = false,
      disabled = false,
      testID,
    },
    ref,
  ) {
    const { colors } = useAppTheme();
    const isDisabled = disabled || busy;

    return h(
      FocusablePressable,
      {
        accessibilityHint,
        accessibilityLabel: label,
        accessibilityRole: "button",
        accessibilityState: actionAccessibilityState(disabled, busy),
        accessibilityActions,
        disabled: isDisabled,
        focusable: !isDisabled,
        ...keyboardActivationProps(isDisabled, onPress),
        onAccessibilityAction,
        onPress,
        ref,
        style: ({ pressed }: { pressed: boolean }) => [
          styles.primaryAction,
          {
            backgroundColor: pressed ? colors.actionPressed : colors.action,
            opacity: isDisabled ? 0.62 : 1,
          },
        ],
        testID,
      },
      actionText(label, colors.onAction),
    );
  },
);

export const SecondaryAction = forwardRef<
  View,
  ActionProps & Readonly<{ destructive?: boolean }>
>(function SecondaryActionElement(
  {
    label,
    onPress,
    accessibilityHint,
    busy = false,
    disabled = false,
    destructive = false,
    testID,
  },
  ref,
) {
  const { colors } = useAppTheme();
  const isDisabled = disabled || busy;
  const foreground = destructive ? colors.destructive : colors.textPrimary;

  return h(
    FocusablePressable,
    {
      accessibilityHint,
      accessibilityLabel: label,
      accessibilityRole: "button",
      accessibilityState: actionAccessibilityState(disabled, busy),
      disabled: isDisabled,
      focusable: !isDisabled,
      ...keyboardActivationProps(isDisabled, onPress),
      onPress,
      ref,
      style: ({ pressed }: { pressed: boolean }) => [
        styles.secondaryAction,
        {
          backgroundColor: pressed ? colors.surfaceSubtle : colors.surface,
          borderColor: destructive ? colors.destructive : colors.divider,
          opacity: isDisabled ? 0.62 : 1,
        },
      ],
      testID,
    },
    actionText(label, foreground),
  );
});

const actionIcons = {
  back: ArrowLeft,
  forward: ArrowRight,
  clear: X,
  favorite: Star,
  hide: EyeOff,
  more: Ellipsis,
  moveDown: ArrowDown,
  moveUp: ArrowUp,
  retry: RotateCcw,
  show: Eye,
} as const;

export type IconActionName = keyof typeof actionIcons;

export const IconAction = forwardRef<
  View,
  Readonly<{
    accessibilityLabel: string;
    icon: IconActionName;
    onPress: () => void;
    accessibilityHint?: string;
    busy?: boolean;
    disabled?: boolean;
    selected?: boolean;
    tone?: "default" | "card";
    testID?: string;
  }>
>(function IconActionElement(
  {
    accessibilityLabel,
    icon,
    onPress,
    accessibilityHint,
    busy = false,
    disabled = false,
    selected = false,
    tone = "default",
    testID,
  },
  ref,
) {
  const { colors } = useAppTheme();
  const isDisabled = disabled || busy;
  const foreground = selected
    ? colors.action
    : tone === "card"
      ? colors.contentCardText
      : colors.textPrimary;
  const border = selected
    ? colors.action
    : tone === "card"
      ? colors.contentCardBorder
      : colors.divider;
  const pressedBackground = tone === "card"
    ? colors.contentCardPressed
    : colors.surfaceSubtle;

  return h(
    FocusablePressable,
    {
      accessibilityHint,
      accessibilityLabel,
      accessibilityRole: "button",
      accessibilityState: { busy, disabled: isDisabled, selected },
      disabled: isDisabled,
      focusable: !isDisabled,
      ...keyboardActivationProps(isDisabled, onPress),
      onPress,
      ref,
      style: ({ pressed }: { pressed: boolean }) => [
        styles.iconAction,
        {
          backgroundColor: pressed ? pressedBackground : "transparent",
          borderColor: border,
          opacity: isDisabled ? 0.62 : 1,
        },
      ],
      testID,
    },
    iconElement(actionIcons[icon], foreground),
  );
});

export function ScreenHeader({
  title,
  eyebrow,
  action,
  backAction,
}: Readonly<{
  title: string;
  eyebrow?: string;
  action?: React.ReactNode;
  backAction?: () => void;
}>) {
  const { colors } = useAppTheme();
  const copy = [
    eyebrow === undefined
      ? null
      : h(
          Text,
          {
            key: "eyebrow",
            style: [
              typeScale.label as TextStyle,
              { color: colors.textSecondary },
            ],
          },
          eyebrow,
        ),
    h(
      Text,
      {
        accessibilityRole: "header",
        key: "title",
        style: [
          typeScale.screenTitle as TextStyle,
          { color: colors.textPrimary },
        ],
      },
      title,
    ),
  ];

  return h(
    View,
    { style: styles.screenHeader },
    backAction === undefined
      ? null
      : h(IconAction, {
          accessibilityLabel: "Go back",
          icon: "back",
          onPress: backAction,
        }),
    h(View, { style: styles.headerCopy }, ...copy),
    action === undefined
      ? null
      : h(View, { style: styles.headerAction }, action),
  );
}

export function SectionHeader({
  title,
  supportingText,
  action,
  tone = "default",
}: Readonly<{
  title: string;
  supportingText?: string;
  action?: React.ReactNode;
  tone?: "default" | "card";
}>) {
  const { colors } = useAppTheme();
  const primary = tone === "card" ? colors.contentCardText : colors.textPrimary;
  const secondary = tone === "card"
    ? colors.contentCardTextSecondary
    : colors.textSecondary;

  return h(
    View,
    { style: styles.sectionHeader },
    h(
      View,
      { style: styles.headerCopy },
      h(
        Text,
        {
          accessibilityRole: "header",
          style: [
            typeScale.sectionTitle as TextStyle,
            { color: primary },
          ],
        },
        title,
      ),
      supportingText === undefined
        ? null
        : h(
            Text,
            {
              style: [
                typeScale.body as TextStyle,
                { color: secondary },
              ],
            },
            supportingText,
          ),
    ),
    action,
  );
}

export function EmptyState({
  heading,
  body,
  primaryAction,
  secondaryAction,
}: Readonly<{
  heading: string;
  body: string;
  primaryAction: React.ReactNode;
  secondaryAction?: React.ReactNode;
}>) {
  const { colors } = useAppTheme();

  return h(
    View,
    { style: styles.emptyState },
    h(
      Text,
      {
        accessibilityRole: "header",
        style: [
          typeScale.sectionTitle as TextStyle,
          { color: colors.textPrimary },
        ],
      },
      heading,
    ),
    h(
      Text,
      {
        style: [
          typeScale.body as TextStyle,
          { color: colors.textSecondary },
        ],
      },
      body,
    ),
    primaryAction,
    secondaryAction,
  );
}

type NoticeTone = "neutral" | "completed" | "attention" | "error";

const noticeIcons = {
  neutral: Circle,
  completed: Check,
  attention: Timer,
  error: TriangleAlert,
} as const;

export function InlineNotice({
  heading,
  body,
  tone = "neutral",
  card = false,
  action,
}: Readonly<{
  heading: string;
  body: string;
  tone?: NoticeTone;
  card?: boolean;
  action?: React.ReactNode;
}>) {
  const { colors } = useAppTheme();
  const semanticColor =
    tone === "completed"
      ? colors.completed
      : tone === "attention"
        ? colors.timerAttention
        : tone === "error"
          ? colors.destructive
          : colors.textSecondary;
  const iconLabel =
    tone === "completed"
      ? "Completed"
      : tone === "attention"
        ? "Attention"
        : tone === "error"
          ? "Error"
          : "Information";
  const primary = card ? colors.contentCardText : colors.textPrimary;
  const secondary = card
    ? colors.contentCardTextSecondary
    : colors.textSecondary;

  return h(
    View,
    {
      accessibilityLiveRegion: tone === "neutral" ? "none" : "polite",
      style: styles.notice,
    },
    iconElement(noticeIcons[tone], semanticColor, iconLabel),
    h(
      View,
      { style: styles.noticeCopy },
      h(
        Text,
        {
          style: [
            typeScale.bodyStrong as TextStyle,
            { color: primary },
          ],
        },
        heading,
      ),
      h(
        Text,
        {
          style: [
            typeScale.body as TextStyle,
            { color: secondary },
          ],
        },
        body,
      ),
      action,
    ),
  );
}

export function MetricSummary({
  label,
  value,
  forceStacked = false,
  tone = "default",
}: Readonly<{
  label: string;
  value: string;
  forceStacked?: boolean;
  tone?: "default" | "card";
}>) {
  const { colors } = useAppTheme();
  const primary = tone === "card" ? colors.contentCardText : colors.textPrimary;
  const secondary = tone === "card"
    ? colors.contentCardTextSecondary
    : colors.textSecondary;

  return h(
    View,
    {
      style: [
        styles.metricSummary,
        { flexDirection: forceStacked ? "column" : "row" },
      ],
      testID: "metric-summary",
    },
    h(
      Text,
      {
        style: [
          typeScale.body as TextStyle,
          { color: secondary },
        ],
      },
      label,
    ),
    h(
      Text,
      {
        style: [
          typeScale.targetValue as TextStyle,
          { color: primary },
        ],
      },
      value,
    ),
  );
}

export function SkeletonBlock({
  height,
  width = "100%",
  testID,
}: Readonly<{
  height: number;
  width?: ViewStyle["width"];
  testID?: string;
}>) {
  const { colors } = useAppTheme();

  return h(View, {
    accessible: false,
    importantForAccessibility: "no-hide-descendants",
    style: [
      styles.skeleton,
      { backgroundColor: colors.surfaceSubtle, height, width },
    ],
    testID,
  });
}

export function RootFailureState({
  onRetry,
  correlationCode,
}: Readonly<{
  onRetry: () => void;
  correlationCode: string;
}>) {
  const [showDiagnostic, setShowDiagnostic] = useState(false);

  return h(EmptyState, {
    body: "Your saved data was not changed. Try again.",
    heading: "Workout data could not be opened",
    primaryAction: h(PrimaryAction, {
      label: "Retry opening workout data",
      onPress: onRetry,
    }),
    secondaryAction: h(
      React.Fragment,
      null,
      h(SecondaryAction, {
        label: "View diagnostic code",
        onPress: () => setShowDiagnostic((visible) => !visible),
      }),
      showDiagnostic
        ? h(InlineNotice, {
            body: `Storage · ${correlationCode}`,
            heading: "Diagnostic code",
            tone: "error",
          })
        : null,
    ),
  });
}

export function ConfirmationSheet({
  visible,
  heading,
  body,
  cancelLabel,
  confirmLabel,
  confirmTestID,
  confirmBusy = false,
  alternateLabel,
  destructive = false,
  onCancel,
  onConfirm,
  onAlternate,
  restoreFocusRef,
}: Readonly<{
  visible: boolean;
  heading: string;
  body: string;
  cancelLabel: string;
  confirmLabel: string;
  confirmTestID?: string;
  confirmBusy?: boolean;
  alternateLabel?: string;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onAlternate?: () => void;
  restoreFocusRef?: React.RefObject<View | null>;
}>) {
  const { colors, reduceMotion } = useAppTheme();
  const cancelRef = useRef<View>(null);

  useEffect(() => {
    if (visible) {
      cancelRef.current?.focus();
    }
  }, [visible]);

  function cancel() {
    onCancel();
    restoreFocusRef?.current?.focus();
  }

  return h(
    Modal,
    {
      animationType: reduceMotion ? "none" : "fade",
      onRequestClose: cancel,
      transparent: true,
      visible,
    },
    h(
      View,
      { accessibilityViewIsModal: true, style: styles.modalBackdrop },
        h(
          ScrollView,
          {
            contentContainerStyle: styles.sheetContent,
            keyboardShouldPersistTaps: "handled",
            style: [
              styles.sheet,
              { backgroundColor: colors.surface },
            ],
            testID: "confirmation-sheet-content",
          },
        h(
          View,
          {
            accessibilityRole: "header",
            accessible: true,
          },
          h(
            Text,
            {
              style: [
                typeScale.screenTitle as TextStyle,
                { color: colors.textPrimary },
              ],
            },
            heading,
          ),
        ),
        h(
          Text,
          {
            style: [
              typeScale.body as TextStyle,
              { color: colors.textSecondary },
            ],
          },
          body,
        ),
        h(SecondaryAction, {
          label: cancelLabel,
          onPress: cancel,
          ref: cancelRef,
        }),
        alternateLabel === undefined || onAlternate === undefined
          ? null
          : h(SecondaryAction, {
              destructive,
              label: alternateLabel,
              onPress: onAlternate,
            }),
        h(SecondaryAction, {
          busy: confirmBusy,
          destructive,
          label: confirmLabel,
          onPress: onConfirm,
          ...(confirmTestID === undefined ? {} : { testID: confirmTestID }),
        }),
      ),
    ),
  );
}

const appearanceOptions: readonly AppearancePreference[] = [
  "System",
  "Light",
  "Dark",
];

export function AppearanceSheet({
  visible,
  onClose,
  restoreFocusRef,
}: Readonly<{
  visible: boolean;
  onClose: () => void;
  restoreFocusRef?: React.RefObject<View | null>;
}>) {
  const { appearance, colors, setAppearance } = useAppTheme();
  const headingRef = useRef<View>(null);

  useEffect(() => {
    if (visible) {
      headingRef.current?.focus();
    }
  }, [visible]);

  function close() {
    onClose();
    restoreFocusRef?.current?.focus();
  }

  return h(
    Modal,
    {
      animationType: "fade",
      onRequestClose: close,
      transparent: true,
      visible,
    },
    h(
      View,
      { accessibilityViewIsModal: true, style: styles.modalBackdrop },
      h(
          ScrollView,
          {
            contentContainerStyle: styles.sheetContent,
            keyboardShouldPersistTaps: "handled",
            style: [
              styles.sheet,
              { backgroundColor: colors.surface },
            ],
            testID: "appearance-sheet-content",
          },
        h(
          View,
          {
            accessibilityRole: "header",
            accessible: true,
            focusable: true,
            ref: headingRef,
          },
          h(
            Text,
            {
              style: [
                typeScale.screenTitle as TextStyle,
                { color: colors.textPrimary },
              ],
            },
            "Appearance",
          ),
        ),
        h(
          View,
          { accessibilityRole: "radiogroup", style: styles.radioGroup },
          ...appearanceOptions.map((option) =>
            h(
              FocusablePressable,
              {
                accessibilityLabel: option,
                accessibilityRole: "radio",
                accessibilityState: { selected: appearance === option },
                focusable: true,
                key: option,
                ...keyboardActivationProps(false, () => setAppearance(option)),
                onPress: () => setAppearance(option),
                style: [
                  styles.radioOption,
                  {
                    borderColor:
                      appearance === option ? colors.action : colors.divider,
                  },
                ],
              },
              iconElement(
                appearance === option ? Check : Circle,
                appearance === option ? colors.action : colors.textSecondary,
              ),
              h(
                Text,
                {
                  style: [
                    typeScale.body as TextStyle,
                    { color: colors.textPrimary },
                  ],
                },
                option,
              ),
            ),
          ),
        ),
        h(SecondaryAction, { label: "Close appearance", onPress: close }),
      ),
    ),
  );
}

export const rootDestinations = [
  { name: "index", label: "Today", icon: Dumbbell },
  { name: "calendar", label: "Calendar", icon: CalendarDays },
  { name: "library", label: "Library", icon: LibraryBig },
  {
    name: "progress",
    label: "Progress",
    icon: ChartNoAxesColumnIncreasing,
  },
] as const;

export function rootNavigationUsesTwoRows(
  width: number,
  fontScale: number,
): boolean {
  const effectiveFontScale = Number.isFinite(fontScale) && fontScale > 0
    ? fontScale
    : 1;
  const minimumTabWidth = Math.max(
    sizes.minimumTarget,
    56 * effectiveFontScale + space[2],
  );
  return width < rootDestinations.length * minimumTabWidth;
}

type AppTabsProps = Readonly<{
  state: {
    index: number;
    routes: readonly { key: string; name: string }[];
  };
  navigation: {
    emit(event: {
      type: "tabPress";
      target: string;
      canPreventDefault: true;
    }): { defaultPrevented: boolean };
    navigate(name: string): void;
  };
  disabled?: boolean;
  compactLayout?: "single-row" | "two-row";
  position?: "bottom" | "rail";
}>;

export function AppTabs({
  state,
  navigation,
  disabled = false,
  compactLayout = "single-row",
  position = "bottom",
}: AppTabsProps) {
  const { colors } = useAppTheme();
  const twoRowBottomLayout =
    position === "bottom" && compactLayout === "two-row";
  const tabs = rootDestinations.map((destination) => {
    const route = state.routes.find(
      (candidate) => candidate.name === destination.name,
    );
    const routeIndex = state.routes.findIndex(
      (candidate) => candidate.name === destination.name,
    );
    const selected = routeIndex === state.index;

    function navigate() {
      if (disabled || route === undefined) {
        return;
      }
      const event = navigation.emit({
        type: "tabPress",
        target: route.key,
        canPreventDefault: true,
      });
      if (!selected && !event.defaultPrevented) {
        navigation.navigate(route.name);
      }
    }

    return h(
      FocusablePressable,
      {
        accessibilityLabel: destination.label,
        accessibilityRole: "tab",
        accessibilityState: { disabled, selected },
        disabled,
        focusable: !disabled,
        key: destination.name,
        ...keyboardActivationProps(disabled, navigate),
        onPress: navigate,
        style: ({ pressed }: { pressed: boolean }) => [
          styles.appTab,
          position === "rail" && styles.appTabRail,
            twoRowBottomLayout && styles.appTabTwoRows,
          {
            backgroundColor: pressed ? colors.surfaceSubtle : "transparent",
              borderColor: selected ? colors.action : "transparent",
              borderWidth: selected ? sizes.focusRing : 0,
            opacity: disabled ? 0.62 : 1,
          },
        ],
      },
      iconElement(
        destination.icon,
        selected ? colors.action : colors.textSecondary,
      ),
      h(
        Text,
        {
          style: [
            typeScale.label as TextStyle,
            styles.appTabLabel,
            {
              color: selected ? colors.action : colors.textSecondary,
              textAlign: "center",
            },
          ],
        },
        destination.label,
      ),
    );
  });

  return h(
    View,
    {
      accessibilityLabel: position === "rail"
        ? "Root navigation rail"
        : twoRowBottomLayout
          ? "Root navigation bottom two rows"
          : "Root navigation bottom",
      accessibilityRole: "tablist",
      style: [
        styles.appTabs,
        position === "rail"
          ? styles.appTabsRail
          : twoRowBottomLayout
            ? styles.appTabsBottomTwoRows
            : styles.appTabsBottom,
        { backgroundColor: colors.surface, borderColor: colors.divider },
      ],
      testID: position === "rail"
        ? "root-navigation-rail"
        : "root-navigation-bottom",
    },
    ...tabs,
  );
}

export function ExerciseRow({
  name,
  history,
  nextTarget,
  recommendationState = "No suggestion pending",
  onPress,
  tone = "default",
}: Readonly<{
  name: string;
  history: string;
  nextTarget: string;
  recommendationState?: string;
  onPress?: () => void;
  tone?: "default" | "card";
}>) {
  const { colors } = useAppTheme();
  const textPrimary = tone === "card"
    ? colors.contentCardText
    : colors.textPrimary;
  const textSecondary = tone === "card"
    ? colors.contentCardTextSecondary
    : colors.textSecondary;
  const content = [
    h(
      View,
      { key: "copy", style: styles.exerciseCopy },
      h(
        Text,
        {
          numberOfLines: 2,
          style: [
            typeScale.bodyStrong as TextStyle,
            { color: textPrimary },
          ],
        },
        name,
      ),
      h(
        Text,
        {
          style: [
            typeScale.secondary as TextStyle,
            { color: textSecondary },
          ],
        },
        history,
      ),
    ),
    h(
      View,
      { key: "target", style: styles.exerciseTarget },
      h(
        Text,
        {
          style: [
            typeScale.label as TextStyle,
            { color: textSecondary },
          ],
        },
        "NEXT TARGET",
      ),
      h(
        Text,
        {
          style: [
            typeScale.bodyStrong as TextStyle,
            { color: textPrimary },
          ],
        },
        nextTarget,
      ),
    ),
  ];
  const accessibilityLabel =
    `${name}. Next target ${nextTarget}. ` +
    `Last comparable result ${history}. ${recommendationState}.`;

  if (onPress === undefined) {
    return h(
      View,
      { accessibilityLabel, style: styles.exerciseRow },
      ...content,
    );
  }

  return h(
    FocusablePressable,
    {
      accessibilityLabel,
      accessibilityRole: "button",
      focusable: true,
      ...keyboardActivationProps(false, onPress),
      onPress,
      style: styles.exerciseRow,
    },
    ...content,
  );
}

export function PlanActivationRow({
  onPress,
  tone = "default",
}: Readonly<{
  onPress: () => void;
  tone?: "default" | "card";
}>) {
  const { colors } = useAppTheme();
  const primary = tone === "card" ? colors.contentCardText : colors.textPrimary;
  const secondary = tone === "card"
    ? colors.contentCardTextSecondary
    : colors.textSecondary;

  return h(
    FocusablePressable,
    {
      accessibilityLabel:
        "Full Body Foundation. 3 days per week. " +
        "General strength and consistency.",
      accessibilityRole: "button",
      focusable: true,
      ...keyboardActivationProps(false, onPress),
      onPress,
      style: [
        tone === "card"
          ? styles.planActivationCardContent
          : styles.boundedSurface,
        tone === "card"
          ? undefined
          : { backgroundColor: colors.surface, borderColor: colors.divider },
      ],
    },
    h(
      Text,
      {
        style: [
          typeScale.sectionTitle as TextStyle,
          { color: primary },
        ],
      },
      "Full Body Foundation",
    ),
    h(
      Text,
      {
        style: [
          typeScale.body as TextStyle,
          { color: secondary },
        ],
      },
      "3 days per week · General strength and consistency",
    ),
  );
}

const styles = StyleSheet.create({
  actionLabel: {
    flexShrink: 1,
    textAlign: "center",
  },
  primaryAction: {
    alignItems: "center",
    borderRadius: radius.standard,
    justifyContent: "center",
    minHeight: sizes.primaryAction,
    paddingHorizontal: space[4],
    paddingVertical: space[2],
    width: "100%",
  },
  secondaryAction: {
    alignItems: "center",
    borderRadius: radius.standard,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    minHeight: sizes.minimumTarget,
    paddingHorizontal: space[4],
    paddingVertical: space[2],
  },
  iconAction: {
    alignItems: "center",
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    height: sizes.minimumTarget,
    justifyContent: "center",
    minHeight: sizes.minimumTarget,
    minWidth: sizes.minimumTarget,
    width: sizes.minimumTarget,
  },
  screenHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: space[2],
    minHeight: sizes.minimumTarget,
  },
  headerCopy: {
    flex: 1,
    gap: space[1],
    minWidth: 0,
  },
  headerAction: {
    marginLeft: "auto",
  },
  sectionHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: space[4],
  },
  emptyState: {
    alignItems: "stretch",
    gap: space[4],
    maxWidth: 640,
  },
  notice: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: space[2],
  },
  noticeCopy: {
    flex: 1,
    gap: space[1],
  },
  metricSummary: {
    alignItems: "flex-start",
    gap: space[2],
    justifyContent: "space-between",
  },
  skeleton: {
    borderRadius: radius.standard,
  },
  modalBackdrop: {
    backgroundColor: "rgba(0, 0, 0, 0.48)",
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: radius.emphasized,
    borderTopRightRadius: radius.emphasized,
    maxHeight: "90%",
  },
  sheetContent: {
    gap: space[4],
    padding: space[6],
  },
  radioGroup: {
    gap: space[2],
  },
  radioOption: {
    alignItems: "center",
    borderRadius: radius.standard,
    borderWidth: sizes.focusRing,
    flexDirection: "row",
    gap: space[2],
    minHeight: sizes.minimumTarget,
    paddingHorizontal: space[4],
    paddingVertical: space[2],
  },
  appTabs: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  appTabsBottom: {
    flexDirection: "row",
  },
  appTabsBottomTwoRows: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  appTabsRail: {
    alignSelf: "stretch",
    width: 112,
  },
  appTab: {
    alignItems: "center",
    flex: 1,
    gap: space[1],
    justifyContent: "center",
    minHeight: 64,
    minWidth: sizes.minimumTarget,
    paddingHorizontal: space[1],
    paddingVertical: space[2],
  },
  appTabRail: {
    flex: 0,
    minHeight: 72,
  },
  appTabTwoRows: {
    flex: 0,
    width: "50%",
  },
  appTabLabel: {
    lineHeight: 22,
    paddingBottom: 2,
    paddingHorizontal: space[1],
  },
  exerciseRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: space[4],
    minHeight: sizes.minimumTarget,
    paddingVertical: space[2],
  },
  exerciseCopy: {
    flex: 1,
    gap: space[1],
    minWidth: 0,
  },
  exerciseTarget: {
    alignItems: "flex-end",
    gap: space[1],
  },
  boundedSurface: {
    borderRadius: radius.emphasized,
    borderWidth: StyleSheet.hairlineWidth,
    gap: space[4],
    padding: space[4],
  },
  planActivationCardContent: {
    gap: space[1],
    minHeight: sizes.minimumTarget,
    paddingVertical: space[2],
  },
  contentCard: {
    borderRadius: radius.emphasized,
    borderWidth: StyleSheet.hairlineWidth,
    gap: space[4],
    minHeight: sizes.minimumTarget,
    padding: space[4],
  },
  actionCluster: {
    alignItems: "stretch",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[2],
    justifyContent: "flex-end",
  },
});

export {
  PlanRow,
  type PlanRowModel,
} from "./PlanRow";
export {
  ScheduleBindingEditor,
  ScheduleModeSelector,
  type ScheduleBindingMode,
} from "./ScheduleBindingEditor";

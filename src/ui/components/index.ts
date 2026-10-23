import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  Check,
  Circle,
  ClipboardList,
  Dumbbell,
  Ellipsis,
  Eye,
  EyeOff,
  Info,
  LibraryBig,
  RotateCcw,
  Settings,
  Star,
  Timer,
  TriangleAlert,
  X,
} from "lucide-react-native";
import React, {
  Children,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  AccessibilityInfo,
  findNodeHandle,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type PressableProps,
  type PressableStateCallbackType,
  type StyleProp,
  type TextLayoutEvent,
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
  workoutTypeScale,
} from "../theme";
import {
  useBottomSheetFocusRegistration,
  useFocusClearance,
  type BottomSheetFocusableRef,
} from "./bottomSheetFocus";
import { BottomSheet } from "./BottomSheet";
import { ConfirmationDialog } from "./ConfirmationDialog";
import { rootTabNativeID } from "../shell/rootFocus";
import { fitTabLabelFontSize } from "./tabLabelFit";

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
  type M3SearchFieldHandle,
  type M3SearchFieldProps,
  type M3SearchFieldState,
} from "./M3SearchField";
export {
  M3FilterChip,
  type M3FilterChipProps,
} from "./M3FilterChip";
export {
  NavigationRow,
  type NavigationRowIcon,
  type NavigationRowProps,
} from "./NavigationRow";
export { FocusClearanceProvider } from "./bottomSheetFocus";

type ActionProps = Readonly<{
  label: string;
  onPress: () => void;
  accessibilityHint?: string;
  accessibilityActions?: PressableProps["accessibilityActions"];
  onAccessibilityAction?: PressableProps["onAccessibilityAction"];
  busy?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  nativeID?: string;
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
          outlineOffset: focused ? sizes.focusClearance : 0,
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
    const focusClearance = useFocusClearance();
    const [focused, setFocused] = useState(false);
    const [preferredFocus, setPreferredFocus] = useState(false);
    const focusRegistration = useBottomSheetFocusRegistration();
    const internalRef = useRef<View | null>(null);
    const isDisabled = disabled === true;
    const participatesInFocusTrap = props.focusable !== false && !isDisabled;
    const keyboardProps = onKeyDown === undefined
      ? onPress === null || onPress === undefined
        ? {}
        : keyboardActivationProps(
            isDisabled,
            () => (onPress as unknown as () => void)(),
          )
      : { onKeyDown };
    const registrationRef = internalRef as BottomSheetFocusableRef;

    useImperativeHandle(ref, () => ({
      focus: () => {
        setPreferredFocus(true);
        internalRef.current?.setNativeProps?.({ hasTVPreferredFocus: true });
        internalRef.current?.focus?.();
        let node: number | null = null;
        try {
          node = findNodeHandle(internalRef.current);
        } catch {
          // Host renderers and caller-owned focus seams may not expose a native handle.
        }
        if (typeof node === "number" && node > 0) {
          AccessibilityInfo.setAccessibilityFocus(node);
        }
      },
      setNativeProps: (nativeProps: Readonly<Record<string, unknown>>) => {
        internalRef.current?.setNativeProps?.(nativeProps);
      },
    }) as unknown as View, []);

    useEffect(() => {
      if (focusRegistration === null || !participatesInFocusTrap) {
        return;
      }
      return focusRegistration.register(registrationRef);
    }, [focusRegistration, participatesInFocusTrap, registrationRef]);

    const setPressableRef = useCallback((node: View | null) => {
      internalRef.current = node;
      if (typeof ref === "function") {
        ref(node);
        return;
      }
      if (ref !== null) {
        ref.current = node;
      }
    }, [ref]);

    return h(Pressable, {
      ...props,
      disabled: isDisabled,
      hasTVPreferredFocus: preferredFocus,
      ...keyboardProps,
      onBlur: (event: Parameters<NonNullable<PressableProps["onBlur"]>>[0]) => {
        setFocused(false);
        onBlur?.(event);
      },
      onFocus: (event: Parameters<NonNullable<PressableProps["onFocus"]>>[0]) => {
        setFocused(true);
        setPreferredFocus(false);
        if (focusRegistration !== null && participatesInFocusTrap) {
          focusRegistration.onFocus(registrationRef);
        }
        onFocus?.(event);
      },
      onPress,
      ref: setPressableRef,
      style: (state: PressableStateCallbackType) => [
        typeof style === "function" ? style(state) : style,
        {
          outlineColor: colors.focusRing,
          outlineOffset: focused ? focusClearance : 0,
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
        typeScale.sectionTitle as TextStyle,
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
      style,
      testID,
      nativeID,
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
        nativeID,
        ref,
        style: ({ pressed }: { pressed: boolean }) => [
          styles.primaryAction,
          style,
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

/** Workout-root-only primary action. Orange is reserved for this hierarchy. */
export const WorkoutPrimaryAction = forwardRef<View, ActionProps>(
  function WorkoutPrimaryActionElement(
    { label, onPress, accessibilityHint, busy = false, disabled = false, style, testID },
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
        disabled: isDisabled,
        focusable: !isDisabled,
        ...keyboardActivationProps(isDisabled, onPress),
        onPress,
        ref,
        style: ({ pressed }: { pressed: boolean }) => [
          styles.primaryAction,
          styles.workoutPrimaryAction,
          style,
          {
            backgroundColor: pressed ? colors.workoutPrimaryActionPressed : colors.workoutPrimaryAction,
            opacity: isDisabled ? 0.62 : 1,
          },
        ],
        testID,
      },
      h(Text, {
        style: [
          workoutTypeScale.emphasis as TextStyle,
          styles.actionLabel,
          { color: colors.onWorkoutPrimaryAction },
        ],
      }, label),
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
    style,
    testID,
    nativeID,
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
      nativeID,
      ref,
      style: ({ pressed }: { pressed: boolean }) => [
        styles.secondaryAction,
        style,
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
  info: Info,
  more: Ellipsis,
  moveDown: ArrowDown,
  moveUp: ArrowUp,
  plan: ClipboardList,
  retry: RotateCcw,
  settings: Settings,
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
    nativeID?: string | undefined;
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
    nativeID,
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
      nativeID,
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

export const ScreenHeader = forwardRef<View, Readonly<{
  title: string;
  eyebrow?: string;
  action?: React.ReactNode;
  actions?: readonly React.ReactNode[];
  backAction?: () => void;
  backActionLabel?: string;
  backActionRef?: React.Ref<View>;
  backActionTestID?: string;
  titleStyle?: StyleProp<TextStyle>;
  /** Deep Library routes opt into the Phase 17 64dp header track. */
  density?: "standard" | "deep";
}>>(function ScreenHeader({
  title,
  eyebrow,
  action,
  actions,
  backAction,
  backActionLabel = "Go back",
  backActionRef,
  backActionTestID,
  density = "standard",
  titleStyle,
}, ref) {
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
      View,
      {
        accessibilityLabel: title,
        accessibilityRole: "header",
        accessible: true,
        focusable: true,
        key: "title",
        ref,
      },
      h(
        Text,
        {
          style: [
            typeScale.screenTitle as TextStyle,
            titleStyle,
            { color: colors.textPrimary },
          ],
        },
        title,
      ),
    ),
  ];

  return h(
    View,
    { style: [styles.screenHeader, density === "deep" && styles.screenHeaderDeep] },
    backAction === undefined
      ? null
      : h(IconAction, {
          accessibilityLabel: backActionLabel,
          icon: "back",
          onPress: backAction,
          ref: backActionRef,
          ...(backActionTestID === undefined
            ? {}
            : { testID: backActionTestID }),
        }),
    h(View, { style: styles.headerCopy }, ...copy),
    action === undefined && actions === undefined
      ? null
      : h(View, { style: styles.headerAction, testID: "screen-header-actions" }, ...(actions ?? [action])),
  );
});

export function SectionHeader({
  title,
  supportingText,
  action,
  tone = "default",
  titleStyle,
  supportingTextStyle,
}: Readonly<{
  title: string;
  supportingText?: string;
  action?: React.ReactNode;
  tone?: "default" | "card";
  titleStyle?: StyleProp<TextStyle>;
  supportingTextStyle?: StyleProp<TextStyle>;
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
            titleStyle,
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
                supportingTextStyle,
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
  headingStyle,
  bodyStyle,
  primaryAction,
  secondaryAction,
}: Readonly<{
  heading: string;
  body: string;
  headingStyle?: StyleProp<TextStyle>;
  bodyStyle?: StyleProp<TextStyle>;
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
          headingStyle,
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
          bodyStyle,
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
  focusable = false,
  nativeID,
  noticeRef,
}: Readonly<{
  heading: string;
  body: string;
  tone?: NoticeTone;
  card?: boolean;
  action?: React.ReactNode;
  /** Used by recovery flows that must move assistive focus to this notice. */
  focusable?: boolean;
  nativeID?: string;
  noticeRef?: React.Ref<View>;
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
      accessibilityRole: focusable ? "header" : undefined,
      accessible: focusable || undefined,
      focusable,
      nativeID,
      ref: noticeRef,
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
  return h(ConfirmationDialog, {
    alternateLabel,
    body,
    cancelLabel,
    confirmBusy,
    confirmLabel,
    confirmTestID,
    destructive,
    heading,
    onAlternate,
    onCancel,
    onConfirm,
    restoreFocusRef,
    scrollTestID: "confirmation-sheet-content",
    visible,
  });
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

  function close() {
    onClose();
    restoreFocusRef?.current?.focus();
  }

  return h(
    BottomSheet,
    {
      heading: "Appearance",
      onCancel: close,
      restoreFocusRef,
      scrollTestID: "appearance-sheet-content",
      visible,
    },
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
  );
}

export const rootDestinations = [
  { name: "index", label: "Workout", icon: Dumbbell },
  { name: "calendar", label: "Calendar", icon: CalendarDays },
  { name: "library", label: "Library", icon: LibraryBig },
  {
    name: "progress",
    label: "Progress",
    icon: ChartNoAxesColumnIncreasing,
  },
] as const;

function AppTabLabel({
  destination,
  selected,
}: Readonly<{
  destination: (typeof rootDestinations)[number];
  selected: boolean;
}>) {
  const { colors } = useAppTheme();
  const { fontScale } = useWindowDimensions();
  const baseFontSize = typeScale.body.fontSize;
  const [columnWidth, setColumnWidth] = useState(0);
  const [candidate, setCandidate] = useState({ columnWidth: 0, fontScale, fontSize: baseFontSize });
  useEffect(() => {
    setCandidate((current) => current.fontScale === fontScale ? current
      : { ...current, fontScale, fontSize: baseFontSize });
  }, [baseFontSize, fontScale]);
  // Resize or system scaling changes restart at the approved baseline.
  const fontSize = candidate.columnWidth === columnWidth && candidate.fontScale === fontScale
    ? candidate.fontSize : baseFontSize;
  const measurementKey = `${columnWidth}:${fontScale}:${fontSize}`;
  const currentMeasurementKey = useRef(measurementKey);
  currentMeasurementKey.current = measurementKey;
  const [probe, setProbe] = useState({ key: "", width: 0 });
  const [visible, setVisible] = useState({ key: "", width: 0 });
  const fit = probe.key === measurementKey
    ? fitTabLabelFontSize(fontSize, probe.width, columnWidth, baseFontSize * 0.5)
    : null;
  const labelWidth = fit?.fits && visible.key === measurementKey
    && Math.abs(visible.width - probe.width) <= 1
    ? visible.width : 0;

  function glyphWidth(event: TextLayoutEvent): number {
    const line = event.nativeEvent.lines[0];
    return event.nativeEvent.lines.length === 1 && line?.text === destination.label
      && Number.isFinite(line.width) && line.width > 0 ? line.width : 0;
  }

  function measureColumn(event: LayoutChangeEvent) {
    if (currentMeasurementKey.current !== measurementKey) {
      return;
    }
    const width = event.nativeEvent.layout.width;
    if (Number.isFinite(width) && width > 0 && width !== columnWidth) {
      setColumnWidth(width);
      setCandidate({ columnWidth: width, fontScale, fontSize: baseFontSize });
      setProbe({ key: "", width: 0 });
      setVisible({ key: "", width: 0 });
    }
  }

  function measureProbe(event: TextLayoutEvent) {
    if (currentMeasurementKey.current !== measurementKey) {
      return;
    }
    const width = glyphWidth(event);
    setProbe({ key: measurementKey, width });
    const next = fitTabLabelFontSize(fontSize, width, columnWidth, baseFontSize * 0.5);
    if (next !== null && next.fontSize !== fontSize) {
      setCandidate({ columnWidth, fontScale, fontSize: next.fontSize });
    }
  }

  function measureLabel(event: TextLayoutEvent) {
    if (currentMeasurementKey.current === measurementKey) {
      setVisible({ key: measurementKey, width: glyphWidth(event) });
    }
  }

  const nativeTextProps = {
    allowFontScaling: true,
    adjustsFontSizeToFit: false,
    numberOfLines: 1,
  };
  const typography = [typeScale.body as TextStyle, { fontSize }];

  return h(
    View,
    {
      style: styles.appTabLabelContainer,
      testID: `root-tab-label-container-${destination.name}`,
    },
    // A horizontal scroll content has unconstrained intrinsic width, without an
    // arbitrary large fixture width. It never scrolls or participates in a11y.
    // RN Android autofit separately mutates measurement and draw size spans;
    // plain Text avoids that disagreement and keeps the scaled 22sp line track.
    h(ScrollView, {
      accessible: false,
      accessibilityElementsHidden: true,
      importantForAccessibility: "no-hide-descendants",
      focusable: false,
      horizontal: true,
      pointerEvents: "none",
      scrollEnabled: false,
      showsHorizontalScrollIndicator: false,
      style: styles.appTabLabelProbe,
      testID: `root-tab-label-probe-container-${destination.name}`,
    }, h(Text, {
      ...nativeTextProps,
      accessible: false,
      accessibilityElementsHidden: true,
      importantForAccessibility: "no-hide-descendants",
      key: measurementKey,
      onTextLayout: measureProbe,
      style: typography,
      testID: `root-tab-label-probe-${destination.name}`,
    }, destination.label)),
    h(
      Text,
      {
        ...nativeTextProps,
        // Remount to request fresh line events even if RN deduplicates identical
        // glyph metrics when only the column changed (including first layout).
        key: `${columnWidth}:${fontScale}`,
        onLayout: measureColumn,
        onTextLayout: measureLabel,
        style: [
          ...typography,
          styles.appTabLabel,
          { color: selected ? colors.ink : colors.quiet },
        ],
        testID: `root-tab-label-${destination.name}`,
      },
      destination.label,
    ),
    // Revision 18's underline follows verified full-label advance, not its box.
    h(View, {
      accessible: false,
      accessibilityElementsHidden: true,
      importantForAccessibility: "no-hide-descendants",
      pointerEvents: "none",
      style: [
        styles.appTabLabelUnderline,
        { backgroundColor: selected ? colors.orange : "transparent", width: labelWidth },
      ],
      testID: `root-tab-label-underline-${destination.name}`,
    }),
  );
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
}>;

export function AppTabs({
  state,
  navigation,
  disabled = false,
}: AppTabsProps) {
  const { colors } = useAppTheme();
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
        nativeID: rootTabNativeID(destination.name),
        ...keyboardActivationProps(disabled, navigate),
        onPress: navigate,
        style: ({ pressed }: { pressed: boolean }) => [
          styles.appTab,
          {
            backgroundColor: pressed ? colors.surfaceSubtle : "transparent",
            opacity: disabled ? 0.62 : 1,
          },
        ],
      },
      iconElement(
        destination.icon,
        selected ? colors.ink : colors.quiet,
      ),
      h(AppTabLabel, { destination, selected }),
    );
  });

  return h(
    View,
    {
      accessibilityLabel: "Root navigation bottom",
      accessibilityRole: "tablist",
      style: [
        styles.appTabs,
        styles.appTabsBottom,
        { backgroundColor: colors.paper, borderColor: colors.line },
      ],
      testID: "root-navigation-bottom",
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
  workoutPrimaryAction: {
    borderRadius: 16,
    minHeight: 64,
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
  screenHeaderDeep: {
    minHeight: sizes.deepRouteHeader,
  },
  headerCopy: {
    flex: 1,
    gap: space[1],
    minWidth: 0,
  },
  headerAction: {
    alignItems: "center",
    flexDirection: "row",
    gap: 2,
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
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  appTabsBottom: {
    flexDirection: "row",
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
  appTabLabelContainer: {
    alignItems: "center",
    alignSelf: "stretch",
    gap: 2,
    maxWidth: "100%",
    paddingHorizontal: space[1],
    width: "100%",
  },
  appTabLabel: {
    alignSelf: "stretch",
    flexShrink: 1,
    textAlign: "center",
    width: "100%",
  },
  appTabLabelProbe: {
    left: 0,
    opacity: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  appTabLabelUnderline: {
    height: 3,
    maxWidth: "100%",
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

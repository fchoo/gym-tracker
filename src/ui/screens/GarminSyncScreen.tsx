import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  AccessibilityInfo,
  findNodeHandle,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type TextStyle,
} from "react-native";

import {
  AppearanceSheet,
  ContentCard,
  FocusablePressable,
  InlineNotice,
  PrimaryAction,
  SecondaryAction,
  SectionHeader,
} from "../components";
import { ConfirmationDialog } from "../components/ConfirmationDialog";
import { BottomSheet } from "../components/BottomSheet";
import {
  type GarminDurableSyncSummary,
} from "../../domains/activities/garminActivitySourcePort";
import {
  type GarminActivityListItem,
  type GarminConnectionControllerError,
  type GarminConnectionControllerInput,
  type GarminPresentationFailure,
  type GarminSyncPresentation,
  useGarminConnectionController,
} from "../garmin/useGarminConnectionController";
import { AdaptiveScreen } from "../layout/AdaptiveScreen";
import {
  fontFamilies,
  radius,
  sizes,
  space,
  typeScale,
  useAppTheme,
} from "../theme";

export type GarminSyncScreenProps = GarminConnectionControllerInput & Readonly<{
  contextOrigin?: "workout" | "calendar" | "library" | "progress";
  onOpenActivity(activityId: string): void;
  onBack?(): void;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  returnFocusActivityId?: string;
  returnFocusVersion?: number;
  scrollOffset?: number;
  width?: number;
}>;

type FocusTarget = View & Readonly<{ focus?: () => void }>;

function focusAccessible(ref: React.RefObject<FocusTarget | null>): void {
  ref.current?.focus?.();
  let node: number | null = null;
  try {
    node = findNodeHandle(ref.current);
  } catch {
    // Host component renderers may not provide a native handle.
  }
  if (typeof node === "number" && node > 0) {
    AccessibilityInfo.setAccessibilityFocus(node);
  }
}

function errorCopy(error: GarminConnectionControllerError): Readonly<{
  heading: string;
  body: string;
}> {
  switch (error.code) {
    case "invalid_credentials":
      return {
        heading: "Garmin sign-in was not completed",
        body: "Check your email and password, then try again.",
      };
    case "mfa_expired":
      return {
        heading: "One-time code was not accepted",
        body: "Enter a current one-time code, then verify again.",
      };
    case "sign_in_required":
      return {
        heading: "Sign in to Garmin again",
        body: "Your imported history is still available on this device.",
      };
    case "data_access_denied":
      return {
        heading: "Garmin data access was denied",
        body: "Your imported history was kept. Sign in again when access is available.",
      };
    case "rate_limited":
      return {
        heading: "Garmin asked us to wait",
        body: "Your imported history was kept. Retry when you are ready.",
      };
    case "offline":
      return {
        heading: "You are offline",
        body: "Connect to the internet to fetch new activities. Imported history remains available.",
      };
    case "timeout":
      return {
        heading: "Garmin took too long to respond",
        body: "Your imported history was kept. Try again.",
      };
    case "malformed_response":
      return {
        heading: "Garmin returned data this app could not use",
        body: "Nothing new was saved. Your imported history was kept.",
      };
    case "logout_failed":
      return {
        heading: "Garmin could not be disconnected",
        body: "The prior connection and imported history were kept. Try again.",
      };
    case "history_unavailable":
      return {
        heading: "Imported history could not be loaded",
        body: "No activity was fabricated. Try loading your saved history again.",
      };
    case "temporary_failure":
      return {
        heading: "Garmin is temporarily unavailable",
        body: "Your imported history was kept. Try again.",
      };
  }
}

function GarminHeader({
  onAppearance,
  appearanceRef,
  headingRef,
}: Readonly<{
  onAppearance(): void;
  appearanceRef: React.RefObject<View | null>;
  headingRef: React.RefObject<FocusTarget | null>;
}>) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.header} testID="garmin-three-column-header">
      <View style={styles.headerSide}>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.headerPlaceholder}
          testID="garmin-inert-back-placeholder"
        />
      </View>
      <View
        accessibilityLabel="Garmin Sync"
        accessibilityRole="header"
        accessible
        focusable
        ref={headingRef}
        style={styles.headerTitleColumn}
      >
        <Text
          numberOfLines={1}
          style={[typeScale.screenTitle as TextStyle, styles.headerTitle, { color: colors.textPrimary }]}
        >
          Garmin Sync
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

function ImportedActivities({
  activities,
  historyStatus,
  onOpenActivity,
  returnFocusActivityId,
  returnFocusVersion,
}: Readonly<{
  activities: readonly GarminActivityListItem[];
  historyStatus: "loading" | "ready" | "failed";
  onOpenActivity(activityId: string): void;
  returnFocusActivityId?: string;
  returnFocusVersion?: number;
}>) {
  const { colors } = useAppTheme();
  const returnFocusRef = useRef<View>(null);
  useEffect(() => {
    if (returnFocusActivityId !== undefined
      && activities.some(({ activityId }) => activityId === returnFocusActivityId)) {
      focusAccessible(returnFocusRef);
    }
  }, [activities, returnFocusActivityId, returnFocusVersion]);
  return (
    <View style={styles.section}>
      <SectionHeader
        supportingText="Saved on this device and retained when Garmin is disconnected."
        title="Imported activities"
      />
      {historyStatus === "loading" && activities.length === 0 ? (
        <Text
          accessibilityLiveRegion="polite"
          accessibilityRole="progressbar"
          style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}
        >
          Loading imported activities
        </Text>
      ) : null}
      {historyStatus === "ready" && activities.length === 0 ? (
        <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>No imported activities yet.</Text>
      ) : null}
      {activities.map((activity) => (
        <FocusablePressable
          accessibilityLabel={[
            `Open ${activity.title}.`,
            `${activity.activityType}. ${activity.confirmedLocalDate}.`,
            "Type-only title.",
            activity.matchState === "matched" ? "Matched." : "Unmatched.",
            activity.revisionState === "needs_review" ? "Needs review." : "Accepted source facts.",
            activity.summary === undefined ? null : `${activity.summary}.`,
          ].filter((value): value is string => value !== null).join(" ")}
          accessibilityRole="button"
          accessibilityState={{ selected: activity.activityId === returnFocusActivityId }}
          key={activity.activityId}
          onPress={() => onOpenActivity(activity.activityId)}
          ref={activity.activityId === returnFocusActivityId ? returnFocusRef : undefined}
          style={styles.activityTarget}
        >
          <ContentCard {...(activity.revisionState === "needs_review" ? { status: "attention" as const } : {})}>
            <View style={styles.activityCopy}>
              <Text style={[typeScale.bodyStrong as TextStyle, { color: colors.contentCardText }]}>{activity.title}</Text>
              <Text style={[typeScale.secondary as TextStyle, { color: colors.contentCardTextSecondary }]}>
                {`${activity.activityType} · ${activity.confirmedLocalDate}`}
              </Text>
              <Text style={[typeScale.label as TextStyle, { color: colors.contentCardTextSecondary }]}>
                Type-only title
              </Text>
              {activity.summary === undefined ? null : (
                <Text style={[styles.numericSecondary, { color: colors.contentCardTextSecondary }]}>
                  {activity.summary}
                </Text>
              )}
              <Text
                style={[
                  typeScale.bodyStrong as TextStyle,
                  { color: activity.revisionState === "needs_review" ? colors.timerAttention : colors.contentCardTextSecondary },
                ]}
              >
                {`${activity.matchState === "matched" ? "Matched" : "Unmatched"} · ${activity.revisionState === "needs_review" ? "Needs review" : "Accepted source facts"}`}
              </Text>
            </View>
          </ContentCard>
        </FocusablePressable>
      ))}
    </View>
  );
}

function syncFailureCopy(failure: GarminPresentationFailure): Readonly<{
  heading: string;
  body: string;
}> {
  switch (failure.code) {
    case "offline":
      return { heading: "You are offline", body: "Connect to the internet when you want to fetch new activities." };
    case "temporary_failure":
      return { heading: "Garmin is temporarily unavailable", body: "Try again when the service is available." };
    case "sign_in_required":
      return { heading: "Sign in to Garmin again", body: "The Garmin session needs a new foreground sign-in." };
    case "data_access_denied":
      return { heading: "Garmin data access was denied", body: "Sign in again when activity access is available." };
    case "rate_limited": {
      const minutes = failure.retryAfterMs === undefined ? null : Math.ceil(failure.retryAfterMs / 60_000);
      return {
        heading: "Garmin asked us to wait",
        body: minutes === null
          ? "Retry later. No automatic retry will run."
          : `Retry after ${minutes} minute${minutes === 1 ? "" : "s"}. No automatic retry will run.`,
      };
    }
    case "timeout":
      return { heading: "Garmin took too long to respond", body: "Try the foreground sync again." };
    case "malformed_response":
      return { heading: "Garmin returned data this app could not use", body: "Nothing from this attempt was presented as committed." };
    case "date_confirmation_required":
      return { heading: "Confirm the activity date", body: "Choose the historical local date before saving this activity." };
    case "stale_generation":
      return { heading: "Garmin connection changed", body: "The older sync result was ignored." };
    case "import_conflict":
      return { heading: "An activity could not be saved", body: "Previously committed activity facts were kept." };
    case "sync_in_progress":
      return { heading: "Garmin sync is already running", body: "Wait for the foreground sync to finish." };
  }
}

function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function validLocalDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/u.test(value);
}

function normalizeLocalTime(value: string): string | null {
  if (/^\d{2}:\d{2}$/u.test(value)) {
    return `${value}:00`;
  }
  return /^\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/u.test(value) ? value : null;
}

function validTimeZone(value: string): boolean {
  return value.trim() === value && value.length >= 1 && value.length <= 120;
}

function SyncResult({
  lastSuccessfulSync,
  lastSuccessfulSyncStatus,
  sync,
  onRetry,
  onSignIn,
  onRetryLastSuccessfulSync,
  onReviewPendingDate,
  hasPendingDateReview,
}: Readonly<{
  lastSuccessfulSync: GarminDurableSyncSummary | null;
  lastSuccessfulSyncStatus: "ready" | "failed";
  sync: GarminSyncPresentation;
  onRetry(): void;
  onSignIn(): void;
  onRetryLastSuccessfulSync(): void;
  onReviewPendingDate(): void;
  hasPendingDateReview: boolean;
}>) {
  const { colors } = useAppTheme();
  const durableSummary = lastSuccessfulSync === null || sync.kind === "success" ? null : (
    <View style={styles.resultGroup}>
      <Text style={[styles.numericSecondary, { color: colors.textSecondary }]}>
        {`${lastSuccessfulSync.counts.newActivities} new · ${lastSuccessfulSync.counts.unchangedActivities} unchanged · ${lastSuccessfulSync.counts.reviewActivities} need review`}
      </Text>
      <Text style={[styles.numericSecondary, { color: colors.textSecondary }]}>
        {`Last successful sync: ${new Date(lastSuccessfulSync.completedAtMs).toISOString()}`}
      </Text>
    </View>
  );
  const durableSummaryReadError = lastSuccessfulSyncStatus === "failed" ? (
    <InlineNotice
      action={<SecondaryAction label="Retry sync summary" onPress={onRetryLastSuccessfulSync} />}
      body="The last successful Garmin sync summary could not be read. Imported activities remain available."
      heading="Sync summary unavailable"
      tone="error"
    />
  ) : null;
  if (sync.kind === "idle") return durableSummaryReadError ?? durableSummary;
  if (sync.kind === "syncing") {
    const counts = sync.progress?.counts;
    const detail = counts === undefined
      ? "Starting foreground sync"
      : `${counts.pages} page${counts.pages === 1 ? "" : "s"} · ${counts.attemptedActivities} activit${counts.attemptedActivities === 1 ? "y" : "ies"}`;
    return (
      <View style={styles.resultGroup}>
        <InlineNotice body={detail} heading="Syncing Garmin activities" tone="neutral" />
        {durableSummaryReadError}
        {durableSummary}
      </View>
    );
  }
  if (sync.kind === "success") {
    const reviewCopy = sync.counts.reviewActivities === 0
      ? null
      : `${countLabel(sync.counts.reviewActivities, "activity", "activities")} ${sync.counts.reviewActivities === 1 ? "needs" : "need"} review.`;
    const heading = sync.counts.newActivities > 0
      ? "New activities"
      : sync.counts.reviewActivities > 0
        ? "Needs review"
        : "No new activities";
    const body = sync.counts.newActivities > 0
      ? `${countLabel(sync.counts.newActivities, "new activity", "new activities")} committed.`
      : sync.counts.reviewActivities > 0
        ? "Accepted activity facts were kept until you review the source revision."
        : "Your imported history is up to date.";
    return (
      <View style={styles.resultGroup}>
        <InlineNotice body={body} heading={heading} tone={reviewCopy === null ? "completed" : "attention"} />
        {reviewCopy === null ? null : <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>{reviewCopy}</Text>}
        <Text style={[styles.numericSecondary, { color: colors.textSecondary }]}>
          {`${sync.counts.newActivities} new · ${sync.counts.unchangedActivities} unchanged · ${sync.counts.reviewActivities} need review`}
        </Text>
        <Text style={[styles.numericSecondary, { color: colors.textSecondary }]}>
          {`Last successful sync: ${new Date(sync.completedAtMs).toISOString()}`}
        </Text>
      </View>
    );
  }
  const copy = syncFailureCopy(sync.failure);
  const committed = sync.kind === "partial"
    ? sync.counts.newActivities + sync.counts.unchangedActivities + sync.counts.reviewActivities
    : 0;
  const action = sync.failure.code === "sign_in_required" || sync.failure.code === "data_access_denied"
    ? <SecondaryAction label="Sign in again" onPress={onSignIn} />
    : sync.failure.code === "date_confirmation_required" && hasPendingDateReview
      ? <SecondaryAction label="Review activity date" onPress={onReviewPendingDate} />
    : sync.failure.retryable
      ? <SecondaryAction label="Retry Garmin sync" onPress={onRetry} />
      : null;
  return (
    <View style={styles.resultGroup}>
      <InlineNotice
        action={action}
        body={sync.kind === "partial"
          ? `${countLabel(committed, "activity", "activities")} committed before the connection was interrupted.`
          : copy.body}
        heading={sync.kind === "partial" ? "Sync partly completed" : copy.heading}
        tone="error"
      />
      {durableSummaryReadError}
      {sync.kind === "partial" ? (
        <>
          <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>{copy.heading}</Text>
          {sync.counts.reviewActivities === 0 ? null : (
            <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>
              {`${countLabel(sync.counts.reviewActivities, "activity", "activities")} ${sync.counts.reviewActivities === 1 ? "needs" : "need"} review.`}
            </Text>
          )}
        </>
      ) : null}
      {durableSummary}
    </View>
  );
}

export function GarminSyncScreen(props: GarminSyncScreenProps) {
  const { colors } = useAppTheme();
  const passwordInputRef = useRef<TextInput>(null);
  const mfaCodeInputRef = useRef<TextInput>(null);
  const connectRef = useRef<View>(null);
  const appearanceRef = useRef<View>(null);
  const disconnectRef = useRef<View>(null);
  const dateReviewActionRef = useRef<View>(null);
  const headingRef = useRef<FocusTarget>(null);
  const errorSummaryRef = useRef<FocusTarget>(null);
  const [passwordInputVersion, setPasswordInputVersion] = useState(0);
  const [mfaInputVersion, setMfaInputVersion] = useState(0);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [dateReviewOpen, setDateReviewOpen] = useState(false);
  const [dateInput, setDateInput] = useState("");
  const [timeInput, setTimeInput] = useState("");
  const [timeZoneInput, setTimeZoneInput] = useState("");
  const [offsetInput, setOffsetInput] = useState("");
  const [dateReviewError, setDateReviewError] = useState<string | null>(null);
  const [dateReviewBusy, setDateReviewBusy] = useState(false);
  const clearPasswordInput = useCallback(() => {
    passwordInputRef.current?.clear();
    setPasswordInputVersion((current) => current + 1);
  }, []);
  const clearMfaCodeInput = useCallback(() => {
    mfaCodeInputRef.current?.clear();
    setMfaInputVersion((current) => current + 1);
  }, []);
  const controller = useGarminConnectionController({
    ...props,
    clearPasswordInput,
    clearMfaCodeInput,
  });
  const { state } = controller;

  useEffect(() => {
    if (state.error !== null) focusAccessible(errorSummaryRef);
  }, [state.error]);

  useEffect(() => {
    if (props.returnFocusActivityId === undefined) {
      focusAccessible(headingRef);
    }
  }, [props.returnFocusActivityId]);

  useEffect(() => {
    const pending = state.pendingDateReview;
    if (pending === null) {
      setDateReviewOpen(false);
      setDateReviewBusy(false);
      setDateReviewError(null);
      return;
    }
    setDateInput(pending.suggestedLocalDate);
    setTimeInput(pending.suggestedLocalTime);
    setTimeZoneInput(pending.suggestedTimeZone);
    setOffsetInput(String(pending.suggestedUtcOffsetMinutes));
    setDateReviewError(null);
  }, [state.pendingDateReview]);

  const cancelConnection = useCallback(() => {
    void controller.cancelConnection();
  }, [controller]);

  const requestBack = useCallback(() => {
    if (appearanceOpen) {
      setAppearanceOpen(false);
      return;
    }
    if (dateReviewOpen) {
      setDateReviewOpen(false);
      return;
    }
    if (disconnectOpen) {
      setDisconnectOpen(false);
      return;
    }
    if (state.connection === "mfa" || state.connection === "credentials") {
      cancelConnection();
      return;
    }
    props.onBack?.();
  }, [appearanceOpen, cancelConnection, dateReviewOpen, disconnectOpen, props.onBack, state.connection]);

  const openPendingDateReview = useCallback(() => {
    setDateReviewError(null);
    setDateReviewOpen(true);
  }, []);

  const submitPendingDateReview = useCallback(async () => {
    const pending = state.pendingDateReview;
    const normalizedTime = normalizeLocalTime(timeInput);
    const offsetMinutes = Number.parseInt(offsetInput, 10);
    if (pending === null) {
      setDateReviewError("The pending activity changed. Retry Garmin sync to load it again.");
      return;
    }
    if (!validLocalDate(dateInput)) {
      setDateReviewError("Enter the local date as YYYY-MM-DD.");
      return;
    }
    if (normalizedTime === null) {
      setDateReviewError("Enter the local time as HH:MM or HH:MM:SS.");
      return;
    }
    if (!validTimeZone(timeZoneInput)) {
      setDateReviewError("Enter a bounded time zone label.");
      return;
    }
    if (!Number.isSafeInteger(offsetMinutes) || offsetMinutes < -840 || offsetMinutes > 840) {
      setDateReviewError("Enter a UTC offset from -840 to 840 minutes.");
      return;
    }
    setDateReviewBusy(true);
    setDateReviewError(null);
    try {
      const result = await controller.confirmPendingDateReview({
        kind: "confirmed",
        localDate: dateInput,
        localTime: normalizedTime,
        timeZone: timeZoneInput,
        utcOffsetMinutes: offsetMinutes,
      });
      if (result === null) {
        setDateReviewError("The pending activity changed. Retry Garmin sync to load it again.");
        return;
      }
      if (result.kind === "not_committed") {
        setDateReviewError(
          result.reason === "stale"
            ? "The pending activity changed. Retry Garmin sync to load the current review."
            : result.reason === "dst_gap"
              ? "That local time falls in a daylight-saving gap. Enter another time."
              : "That activity date could not be confirmed. Update the fields and try again.",
        );
        return;
      }
      setDateReviewOpen(false);
    } catch {
      setDateReviewError("The pending activity changed. Retry Garmin sync to load the current review.");
    } finally {
      setDateReviewBusy(false);
    }
  }, [controller, dateInput, offsetInput, state.pendingDateReview, timeInput, timeZoneInput]);

  const error = state.error === null ? null : errorCopy(state.error);
  const primary = (
    <>
      <GarminHeader
        appearanceRef={appearanceRef}
        headingRef={headingRef}
        onAppearance={() => setAppearanceOpen(true)}
      />
      {state.connection === "loading" ? (
        <Text
          accessibilityLiveRegion="polite"
          accessibilityRole="progressbar"
          style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}
        >
          Checking Garmin connection
        </Text>
      ) : null}
      {error === null ? null : (
        <View accessible focusable ref={errorSummaryRef}>
          <InlineNotice body={error.body} heading={error.heading} tone="error" />
        </View>
      )}
      {state.connection === "disconnected" ? (
        <View style={styles.section}>
          <SectionHeader
            supportingText="Sign in happens in this installed app. Internet is needed only to fetch new activities."
            title="Garmin not connected"
          />
          <PrimaryAction label="Connect Garmin" onPress={controller.openCredentials} ref={connectRef} />
        </View>
      ) : null}
      {state.connection === "credentials" ? (
        <View style={styles.section}>
          <SectionHeader
            supportingText="Your password is used only for this foreground sign-in and is cleared after the attempt."
            title="Connect Garmin"
          />
          <View style={styles.fieldGroup}>
            <Text style={[typeScale.label as TextStyle, { color: colors.textPrimary }]}>Email</Text>
            <TextInput
              accessibilityLabel="Email"
              autoCapitalize="none"
              autoComplete="email"
              editable={state.operation !== "connecting"}
              inputMode="email"
              onChangeText={controller.setEmail}
              returnKeyType="next"
              style={[styles.input, typeScale.body as TextStyle, { borderColor: colors.divider, color: colors.textPrimary }]}
              value={state.email}
            />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={[typeScale.label as TextStyle, { color: colors.textPrimary }]}>Password</Text>
            <TextInput
              accessibilityLabel="Password"
              autoCapitalize="none"
              autoComplete="current-password"
              defaultValue=""
              editable={state.operation !== "connecting"}
              key={`garmin-password-${passwordInputVersion}`}
              onChangeText={controller.setPassword}
              onSubmitEditing={() => { void controller.submitCredentials(); }}
              ref={passwordInputRef}
              returnKeyType="done"
              secureTextEntry
              style={[styles.input, typeScale.body as TextStyle, { borderColor: colors.divider, color: colors.textPrimary }]}
            />
          </View>
          <View style={styles.actions}>
            <PrimaryAction
              busy={state.operation === "connecting"}
              label="Continue"
              onPress={() => { void controller.submitCredentials(); }}
            />
            <SecondaryAction
              disabled={state.operation === "connecting"}
              label="Cancel"
              onPress={cancelConnection}
            />
          </View>
        </View>
      ) : null}
      {state.connection === "connected" ? (
        <View style={styles.section}>
          <SectionHeader
            supportingText="Only committed activity results appear in your local history."
            title="Connected to Garmin"
          />
          <View style={styles.actions}>
            <PrimaryAction
              busy={state.operation === "syncing"}
              label="Sync now"
              onPress={() => { void controller.syncNow(); }}
            />
            <SecondaryAction
              disabled={state.operation === "disconnecting"}
              label="Disconnect Garmin"
              onPress={() => setDisconnectOpen(true)}
              ref={disconnectRef}
            />
          </View>
          <SyncResult
            hasPendingDateReview={state.pendingDateReview !== null}
            lastSuccessfulSync={state.lastSuccessfulSync}
            lastSuccessfulSyncStatus={state.lastSuccessfulSyncStatus}
            onRetry={() => { void controller.syncNow(); }}
            onRetryLastSuccessfulSync={() => { void controller.retryLastSuccessfulSync(); }}
            onReviewPendingDate={openPendingDateReview}
            onSignIn={controller.openCredentials}
            sync={state.sync}
          />
        </View>
      ) : null}
      <ImportedActivities
        activities={state.activities}
        historyStatus={state.historyStatus}
        onOpenActivity={props.onOpenActivity}
        {...(props.returnFocusActivityId === undefined
          ? {}
          : {
              returnFocusActivityId: props.returnFocusActivityId,
              ...(props.returnFocusVersion === undefined
                ? {}
                : { returnFocusVersion: props.returnFocusVersion }),
            })}
      />
    </>
  );

  return (
    <>
      <AdaptiveScreen
        {...(state.connection === "credentials"
          || state.connection === "mfa"
          || appearanceOpen
          || dateReviewOpen
          || disconnectOpen
          || props.onBack !== undefined
            ? { onRequestBack: requestBack }
            : {})}
        primary={primary}
        {...(props.onScroll === undefined ? {} : { onScroll: props.onScroll })}
        {...(props.scrollOffset === undefined ? {} : { scrollOffset: props.scrollOffset })}
        {...(props.returnFocusActivityId === undefined
          ? {}
          : { scrollRestoreKey: `${props.returnFocusActivityId}:${props.returnFocusVersion ?? 0}` })}
        testID="garmin-sync-screen"
        {...(props.width === undefined ? {} : { width: props.width })}
      />
      <BottomSheet
        cancelDisabled={state.operation === "verifying_mfa"}
        cancelLabel="Cancel Garmin verification"
        heading="One-time code"
        onCancel={cancelConnection}
        restoreFocusRef={connectRef}
        visible={state.connection === "mfa"}
      >
        <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>Enter the current code from Garmin.</Text>
        <TextInput
          accessibilityLabel="One-time code"
          autoComplete="one-time-code"
          defaultValue=""
          editable={state.operation !== "verifying_mfa"}
          key={`garmin-mfa-${mfaInputVersion}`}
          keyboardType="number-pad"
          onChangeText={controller.setMfaCode}
          onSubmitEditing={() => { void controller.submitMfa(); }}
          ref={mfaCodeInputRef}
          returnKeyType="done"
          secureTextEntry
          style={[styles.input, typeScale.body as TextStyle, { borderColor: colors.divider, color: colors.textPrimary }]}
          testID="garmin-mfa-code-input"
        />
        <PrimaryAction
          busy={state.operation === "verifying_mfa"}
          label="Verify"
          onPress={() => { void controller.submitMfa(); }}
        />
        <SecondaryAction
          disabled={state.operation === "verifying_mfa"}
          label="Cancel"
          onPress={cancelConnection}
        />
      </BottomSheet>
      <BottomSheet
        cancelDisabled={dateReviewBusy}
        cancelLabel="Keep pending review"
        heading="Confirm activity date"
        onCancel={() => setDateReviewOpen(false)}
        restoreFocusRef={dateReviewActionRef}
        visible={dateReviewOpen && state.pendingDateReview !== null}
      >
        <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>
          Use the accepted local date, time, time zone, and UTC offset for this Garmin activity before it can be saved.
        </Text>
        <Text style={[styles.numericSecondary, { color: colors.textSecondary }]}>
          {`Source start: ${new Date(state.pendingDateReview?.absoluteStartedAtMs ?? 0).toISOString()}`}
        </Text>
        <View style={styles.fieldGroup}>
          <Text style={[typeScale.label as TextStyle, { color: colors.textPrimary }]}>Local date</Text>
          <TextInput
            accessibilityLabel="Local date"
            autoCapitalize="none"
            editable={!dateReviewBusy}
            inputMode="numeric"
            onChangeText={setDateInput}
            style={[styles.input, styles.numericInput, { borderColor: colors.divider, color: colors.textPrimary }]}
            value={dateInput}
          />
        </View>
        <View style={styles.fieldGroup}>
          <Text style={[typeScale.label as TextStyle, { color: colors.textPrimary }]}>Local time</Text>
          <TextInput
            accessibilityLabel="Local time"
            autoCapitalize="none"
            editable={!dateReviewBusy}
            inputMode="numeric"
            onChangeText={setTimeInput}
            style={[styles.input, styles.numericInput, { borderColor: colors.divider, color: colors.textPrimary }]}
            value={timeInput}
          />
        </View>
        <View style={styles.fieldGroup}>
          <Text style={[typeScale.label as TextStyle, { color: colors.textPrimary }]}>Time zone</Text>
          <TextInput
            accessibilityLabel="Time zone"
            autoCapitalize="none"
            editable={!dateReviewBusy}
            onChangeText={setTimeZoneInput}
            style={[styles.input, { borderColor: colors.divider, color: colors.textPrimary }]}
            value={timeZoneInput}
          />
        </View>
        <View style={styles.fieldGroup}>
          <Text style={[typeScale.label as TextStyle, { color: colors.textPrimary }]}>UTC offset minutes</Text>
          <TextInput
            accessibilityLabel="UTC offset minutes"
            autoCapitalize="none"
            editable={!dateReviewBusy}
            inputMode="numeric"
            onChangeText={setOffsetInput}
            style={[styles.input, styles.numericInput, { borderColor: colors.divider, color: colors.textPrimary }]}
            value={offsetInput}
          />
        </View>
        {dateReviewError === null ? null : (
          <InlineNotice
            body={dateReviewError}
            heading="Activity date needs attention"
            tone="error"
          />
        )}
        <PrimaryAction
          busy={dateReviewBusy}
          label="Use activity date"
          onPress={() => {
            void submitPendingDateReview();
          }}
        />
        <SecondaryAction
          disabled={dateReviewBusy}
          label="Keep for later"
          onPress={() => setDateReviewOpen(false)}
          ref={dateReviewActionRef}
        />
      </BottomSheet>
      <ConfirmationDialog
        body="Your encrypted Garmin session will be cleared. Imported activity history remains on this device."
        cancelLabel="Keep connected"
        confirmBusy={state.operation === "disconnecting"}
        confirmLabel="Disconnect Garmin"
        destructive
        heading="Disconnect Garmin?"
        onCancel={() => setDisconnectOpen(false)}
        onConfirm={() => {
          void controller.disconnect().finally(() => setDisconnectOpen(false));
        }}
        restoreFocusRef={disconnectRef}
        visible={disconnectOpen}
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
    minHeight: sizes.primaryAction,
    width: "100%",
  },
  headerPlaceholder: {
    height: sizes.minimumTarget,
    width: sizes.minimumTarget,
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
  fieldGroup: {
    gap: space[2],
  },
  input: {
    borderRadius: radius.standard,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: sizes.minimumTarget,
    paddingHorizontal: space[4],
    paddingVertical: space[2],
  },
  actions: {
    gap: space[2],
  },
  activityTarget: {
    minHeight: sizes.minimumTarget,
    width: "100%",
  },
  activityCopy: {
    gap: space[1],
  },
  resultGroup: {
    gap: space[2],
  },
  numericSecondary: {
    ...typeScale.secondary,
    fontFamily: fontFamilies.numericRegular,
    fontVariant: ["tabular-nums"],
  } as TextStyle,
  numericInput: {
    fontFamily: fontFamilies.numericRegular,
    fontVariant: ["tabular-nums"],
  } as TextStyle,
});

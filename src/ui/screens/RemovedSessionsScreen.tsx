import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from "react-native";

import type {
  HistoryLifecycleResult,
  RemovedHistorySession,
  RestoreHistorySessionInput,
} from "../../domains/history";
import {
  RESTORE_HISTORY_CONFIRMATION,
} from "../../domains/history";
import {
  ConfirmationSheet,
  ContentCard,
  EmptyState,
  PrimaryAction,
  ScreenHeader,
  SecondaryAction,
  SkeletonBlock,
} from "../components";
import {
  useSemanticToast,
} from "../components/SemanticToast";
import {
  AdaptiveScreen,
} from "../layout/AdaptiveScreen";
import {
  space,
  typeScale,
  useAppTheme,
} from "../theme";

type LoadState = "loading" | "ready" | "error";
type FocusRef = React.RefObject<View | null>;

export type RemovedSessionsScreenProps = Readonly<{
  loadRemovedSessions(): Promise<readonly RemovedHistorySession[]>;
  restoreSession(
    input: Omit<RestoreHistorySessionInput, "nowMs">,
  ): Promise<HistoryLifecycleResult>;
  onBack(): void;
  onRestored(sessionId: string): Promise<void>;
  width?: number;
}>;

function retainedLabel(session: RemovedHistorySession): string {
  return [session.planName, session.dayName].filter(Boolean).join(" · ")
    || session.sourceLabel;
}

function progressText(session: RemovedHistorySession): string {
  const progress = session.workingSetProgress;
  const percent = progress.percent === null ? "" : ` (${progress.percent}%)`;
  return `Working sets · ${progress.completed}/${progress.planned}${percent}`;
}

function removedText(session: RemovedHistorySession): string {
  try {
    return `Removed · ${new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: session.timezone,
    }).format(new Date(session.removedAtMs))}`;
  } catch {
    return "Removed · Time unavailable";
  }
}

export function restoreFocusRefForRemovedSession(
  selectedRestoreRef: FocusRef,
  headingRef: FocusRef,
): FocusRef {
  return selectedRestoreRef.current === null ? headingRef : selectedRestoreRef;
}

export function RemovedSessionsScreen({
  loadRemovedSessions,
  restoreSession,
  onBack,
  onRestored,
  width,
}: RemovedSessionsScreenProps) {
  const { colors } = useAppTheme();
  const { enqueue } = useSemanticToast();
  const [state, setState] = useState<LoadState>("loading");
  const [sessions, setSessions] = useState<readonly RemovedHistorySession[]>([]);
  const [selected, setSelected] = useState<RemovedHistorySession | null>(null);
  const [restoreFailed, setRestoreFailed] = useState(false);
  const [restoreAwaitingReload, setRestoreAwaitingReload] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const headingRef = useRef<View>(null);
  const loadingRef = useRef(false);
  const restoreActionRefs = useRef(new Map<string, View>());
  const selectedRestoreRef = useRef<View>(null);
  const adaptiveWidth = width === undefined ? {} : { width };

  const load = useCallback(async (): Promise<boolean> => {
    if (loadingRef.current) return false;
    loadingRef.current = true;
    setState("loading");
    setRestoreFailed(false);
    try {
      const loadedSessions = await loadRemovedSessions();
      setSessions([...loadedSessions].sort((left, right) =>
        right.removedAtMs - left.removedAtMs || left.id.localeCompare(right.id),
      ));
      setState("ready");
      return true;
    } catch {
      setState("error");
      return false;
    } finally {
      loadingRef.current = false;
    }
  }, [loadRemovedSessions]);

  useEffect(() => {
    void load();
  }, [load]);

  const dismissConfirmation = () => {
    setSelected(null);
    setRestoreFailed(false);
    setRestoreAwaitingReload(false);
  };

  const confirmRestore = () => {
    if (selected === null || restoring) {
      return;
    }
    const selectedSession = selected;
    setRestoring(true);
    setRestoreFailed(false);
    void (async () => {
      try {
        if (!restoreAwaitingReload) {
          await restoreSession({
            sessionId: selectedSession.id,
            expectedEffectiveRevision: selectedSession.effectiveRevision,
            confirmation: RESTORE_HISTORY_CONFIRMATION,
          });
          await onRestored(selectedSession.id);
          setRestoreAwaitingReload(true);
        }
        if (!await load()) {
          setRestoreFailed(true);
          return;
        }
        dismissConfirmation();
        enqueue({ message: "Workout restored" });
      } catch {
        setRestoreFailed(true);
      } finally {
        setRestoring(false);
      }
    })();
  };

  let content: React.ReactNode;
  if (state === "loading") {
    content = (
      <>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.skeleton}
          testID="removed-sessions-skeleton"
        >
          <SkeletonBlock height={34} width="58%" />
          <SkeletonBlock height={112} />
          <SkeletonBlock height={112} />
        </View>
        <View
          accessible
          accessibilityLabel="Loading removed sessions"
          accessibilityRole="progressbar"
        />
      </>
    );
  } else if (state === "error") {
    content = (
      <EmptyState
        body="Your saved workouts were not changed. Retry loading removed sessions."
        heading="Removed sessions could not be loaded"
        primaryAction={<PrimaryAction label="Retry loading removed sessions" onPress={() => void load()} />}
      />
    );
  } else if (sessions.length === 0) {
    content = (
      <EmptyState
        body="Workouts removed from history stay here until you restore them."
        heading="No removed sessions"
        primaryAction={<PrimaryAction label="Return to App Settings" onPress={onBack} />}
      />
    );
  } else {
    content = (
      <View style={styles.list}>
        {sessions.map((session) => {
          const label = retainedLabel(session);
          return (
            <ContentCard key={session.id} testID={`removed-session-${session.id}`}>
              <View style={styles.cardContent}>
                <Text
                  style={[typeScale.bodyStrong as TextStyle, { color: colors.contentCardText }]}
                >
                  {label}
                </Text>
                <Text
                  style={[typeScale.body as TextStyle, { color: colors.contentCardTextSecondary }]}
                >
                  {session.localDate}
                </Text>
                <Text
                  style={[typeScale.body as TextStyle, { color: colors.contentCardTextSecondary }]}
                >
                  {progressText(session)}
                </Text>
                <Text
                  style={[typeScale.secondary as TextStyle, { color: colors.contentCardTextSecondary }]}
                >
                  {removedText(session)}
                </Text>
                <SecondaryAction
                  label={`Restore ${label}`}
                  onPress={() => {
                    selectedRestoreRef.current = restoreActionRefs.current.get(session.id) ?? null;
                    setRestoreFailed(false);
                    setSelected(session);
                  }}
                  ref={(node) => {
                    if (node === null) restoreActionRefs.current.delete(session.id);
                    else restoreActionRefs.current.set(session.id, node);
                  }}
                />
              </View>
            </ContentCard>
          );
        })}
      </View>
    );
  }

  return (
    <>
      <AdaptiveScreen
        {...adaptiveWidth}
        primary={
          <>
            <ScreenHeader backAction={onBack} ref={headingRef} title="Removed sessions" />
            {content}
          </>
        }
      />
      <ConfirmationSheet
        body={restoreFailed
          ? "Restore failed. The workout remains removed. Try restore again when ready."
          : selected === null
            ? ""
            : `${retainedLabel(selected)} (revision ${selected.effectiveRevision}) returns to ordinary Calendar, history, records, and recommendations after the saved restore commits.`}
        cancelLabel="Keep session removed"
        confirmBusy={restoring}
        confirmLabel="Restore workout"
        destructive={false}
        heading="Restore this workout?"
        onCancel={dismissConfirmation}
        onConfirm={confirmRestore}
        restoreFocusRef={restoreFocusRefForRemovedSession(selectedRestoreRef, headingRef)}
        visible={selected !== null}
      />
    </>
  );
}

const styles = StyleSheet.create({
  cardContent: {
    gap: space[2],
  },
  list: {
    gap: space[4],
  },
  skeleton: {
    gap: space[4],
  },
});

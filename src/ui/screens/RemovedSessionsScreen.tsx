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
  AdaptiveScreen,
} from "../layout/AdaptiveScreen";
import {
  space,
  typeScale,
  useAppTheme,
} from "../theme";

type LoadState = "loading" | "ready" | "error";

export type RemovedSessionsScreenProps = Readonly<{
  loadRemovedSessions(): Promise<readonly RemovedHistorySession[]>;
  restoreSession(
    input: Omit<RestoreHistorySessionInput, "nowMs">,
  ): Promise<HistoryLifecycleResult>;
  onBack(): void;
  onRestored(sessionId: string): void;
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

export function RemovedSessionsScreen({
  loadRemovedSessions,
  restoreSession,
  onBack,
  onRestored,
  width,
}: RemovedSessionsScreenProps) {
  const { colors } = useAppTheme();
  const [state, setState] = useState<LoadState>("loading");
  const [sessions, setSessions] = useState<readonly RemovedHistorySession[]>([]);
  const [selected, setSelected] = useState<RemovedHistorySession | null>(null);
  const [restoreFailed, setRestoreFailed] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const restoreRef = useRef<View>(null);
  const adaptiveWidth = width === undefined ? {} : { width };

  const load = useCallback(async () => {
    setState("loading");
    setRestoreFailed(false);
    try {
      setSessions(await loadRemovedSessions());
      setState("ready");
    } catch {
      setState("error");
    }
  }, [loadRemovedSessions]);

  useEffect(() => {
    void load();
  }, [load]);

  const dismissConfirmation = () => {
    setSelected(null);
    setRestoreFailed(false);
  };

  const confirmRestore = () => {
    if (selected === null || restoring) {
      return;
    }
    setRestoring(true);
    setRestoreFailed(false);
    void restoreSession({
      sessionId: selected.id,
      expectedEffectiveRevision: selected.effectiveRevision,
      confirmation: RESTORE_HISTORY_CONFIRMATION,
    }).then(() => {
      const restoredId = selected.id;
      dismissConfirmation();
      onRestored(restoredId);
      return load();
    }).catch(() => {
      setRestoreFailed(true);
    }).finally(() => {
      setRestoring(false);
    });
  };

  let content: React.ReactNode;
  if (state === "loading") {
    content = (
      <View style={styles.skeleton} testID="removed-sessions-skeleton">
        <SkeletonBlock height={34} width="58%" />
        <SkeletonBlock height={112} />
        <SkeletonBlock height={112} />
      </View>
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
        primaryAction={<PrimaryAction label="Go back" onPress={onBack} />}
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
                    setRestoreFailed(false);
                    setSelected(session);
                  }}
                  ref={restoreRef}
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
            <ScreenHeader backAction={onBack} title="Removed sessions" />
            {content}
          </>
        }
      />
      <ConfirmationSheet
        body={restoreFailed
          ? "Restore failed. The workout remains removed. Try restore again when ready."
          : "This returns the workout to ordinary Calendar, history, records, and recommendations after the saved restore commits."}
        cancelLabel="Cancel"
        confirmBusy={restoring}
        confirmLabel="Restore workout"
        destructive={false}
        heading="Restore this workout?"
        onCancel={dismissConfirmation}
        onConfirm={confirmRestore}
        restoreFocusRef={restoreRef}
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

import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View, type TextStyle } from "react-native";

import { BottomSheet } from "./BottomSheet";
import { FocusablePressable, PrimaryAction, SecondaryAction } from "./index";
import { radius, sizes, space, typeScale, useAppTheme } from "../theme";

export type BodyweightHistoryEntry = Readonly<{
  entryId: string;
  revision: number;
  localDate: string;
  grams: number;
}>;

export type BodyweightHistorySheetProps = Readonly<{
  visible: boolean;
  entries: readonly BodyweightHistoryEntry[];
  onClose(): void;
  onAdd(): void;
  onEdit(entry: BodyweightHistoryEntry): void;
  onDelete(entry: BodyweightHistoryEntry): Promise<readonly BodyweightHistoryEntry[]>;
  editorRestoreFocusRef?: React.MutableRefObject<View | null>;
  restoreFocusRef?: React.RefObject<View | null>;
}>;

function newestFirst(entries: readonly BodyweightHistoryEntry[]): readonly BodyweightHistoryEntry[] {
  return [...entries].sort((left, right) => right.localDate.localeCompare(left.localDate)
    || right.revision - left.revision
    || right.entryId.localeCompare(left.entryId));
}

function displayKilograms(grams: number): string {
  return `${(grams / 1_000).toFixed(1)} kg`;
}

/** Presents optional source facts; writes, reloads, and target isolation stay above the sheet. */
export function BodyweightHistorySheet({ visible, entries, editorRestoreFocusRef, onAdd, onClose, onDelete, onEdit, restoreFocusRef }: BodyweightHistorySheetProps) {
  const { colors } = useAppTheme();
  const authoritativeEntries = useMemo(() => newestFirst(entries), [entries]);
  const [renderedEntries, setRenderedEntries] = useState(authoritativeEntries);
  const [pendingEntry, setPendingEntry] = useState<BodyweightHistoryEntry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [focusEntryId, setFocusEntryId] = useState<string | "add" | null>(null);
  const addRef = useRef<View>(null);
  const editRefs = useRef(new Map<string, React.RefObject<View | null>>());

  useEffect(() => {
    if (!deleting) setRenderedEntries(authoritativeEntries);
  }, [authoritativeEntries, deleting]);

  useEffect(() => {
    if (!visible || focusEntryId === null) return;
    const target = focusEntryId === "add"
      ? addRef.current
      : editRefs.current.get(focusEntryId)?.current;
    const frame = requestAnimationFrame(() => {
      (target as unknown as { focus?: () => void } | null)?.focus?.();
      setFocusEntryId(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [focusEntryId, visible]);

  const refFor = (entryId: string): React.RefObject<View | null> => {
    const existing = editRefs.current.get(entryId);
    if (existing !== undefined) return existing;
    const created: React.RefObject<View | null> = { current: null };
    editRefs.current.set(entryId, created);
    return created;
  };

  const close = () => {
    if (deleting) return;
    setPendingEntry(null);
    setFailure(null);
    onClose();
  };

  const removePending = async () => {
    if (pendingEntry === null || deleting) return;
    const deletingEntry = pendingEntry;
    const currentIndex = renderedEntries.findIndex((entry) => entry.entryId === deletingEntry.entryId);
    setDeleting(true);
    setFailure(null);
    try {
      const readBack = newestFirst(await onDelete(deletingEntry));
      setRenderedEntries(readBack);
      setPendingEntry(null);
      const next = readBack[currentIndex] ?? readBack[currentIndex - 1];
      setFocusEntryId(next?.entryId ?? "add");
    } catch {
      setFailure("Bodyweight entry was not deleted.");
    } finally {
      setDeleting(false);
    }
  };

  const countLabel = `${renderedEntries.length} ${renderedEntries.length === 1 ? "entry" : "entries"}`;
  return (
    <BottomSheet
      cancelDisabled={deleting}
      cancelLabel="Close bodyweight"
      contentStyle={styles.content}
      heading="Bodyweight"
      onCancel={close}
      restoreFocusRef={restoreFocusRef}
      scrollTestID="bodyweight-history-sheet-content"
      testID="bodyweight-history-sheet"
      visible={visible}
    >
      <Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>
        Bodyweight is optional, used only for bodyweight-relative views, and never changes workout targets automatically.
      </Text>
      {renderedEntries.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[typeScale.sectionTitle as TextStyle, { color: colors.textPrimary }]}>No bodyweight entries</Text>
          <Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>Add one only if bodyweight-relative strength is useful to you. Nothing else in Progress depends on it.</Text>
          <PrimaryAction label="Add first entry" onPress={() => { if (editorRestoreFocusRef !== undefined) editorRestoreFocusRef.current = addRef.current; onAdd(); }} ref={addRef} />
        </View>
      ) : (
        <>
          <View style={styles.latestFact}>
            <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]} testID="bodyweight-latest-label">Latest</Text>
            <Text style={[typeScale.bodyNumeric as TextStyle, { color: colors.textPrimary }]} testID="bodyweight-latest-value">{displayKilograms(renderedEntries[0]!.grams)}</Text>
          </View>
          <Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>{countLabel}</Text>
          <PrimaryAction label="Add entry" onPress={() => { setPendingEntry(null); setFailure(null); if (editorRestoreFocusRef !== undefined) editorRestoreFocusRef.current = addRef.current; onAdd(); }} ref={addRef} />
          {renderedEntries.map((entry) => {
            const pending = pendingEntry?.entryId === entry.entryId;
            return (
              <View key={entry.entryId} style={[styles.row, { borderColor: colors.divider }]}>
                <Text style={[typeScale.bodyNumeric as TextStyle, { color: colors.textPrimary }]} testID={entry.entryId === renderedEntries[0]?.entryId ? "bodyweight-date-latest" : undefined}>{entry.localDate}</Text>
                <Text style={[typeScale.targetValue as TextStyle, { color: colors.textPrimary }]}>{displayKilograms(entry.grams)}</Text>
                {pending ? (
                  <View style={styles.confirmation}>
                    <Text style={[typeScale.bodyStrong as TextStyle, { color: colors.destructive }]}>Delete bodyweight entry?</Text>
                    <Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>{`This removes the ${entry.localDate} entry. Strength targets will not change.`}</Text>
                    {failure === null ? null : <>
                      <Text accessibilityRole="alert" style={[typeScale.body as TextStyle, { color: colors.destructive }]}>{failure}</Text>
                      <Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>Your saved bodyweight history and workout targets were not changed.</Text>
                    </>}
                    <SecondaryAction disabled={deleting} label="Keep bodyweight entry" onPress={() => { setPendingEntry(null); setFailure(null); }} />
                    <PrimaryAction busy={deleting} disabled={deleting} label="Delete bodyweight entry" onPress={() => { void removePending(); }} />
                    {failure === null ? null : <SecondaryAction disabled={deleting} label="Retry deleting entry" onPress={() => { void removePending(); }} />}
                  </View>
                ) : (
                  <View style={styles.actions}>
                    <FocusablePressable
                      accessibilityLabel={`Edit bodyweight entry for ${entry.localDate}`}
                      accessibilityRole="button"
                      onPress={() => { setPendingEntry(null); setFailure(null); if (editorRestoreFocusRef !== undefined) editorRestoreFocusRef.current = refFor(entry.entryId).current; onEdit(entry); }}
                      ref={refFor(entry.entryId)}
                      style={[styles.rowAction, { borderColor: colors.divider }]}
                    >
                      <Text style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>Edit bodyweight entry</Text>
                    </FocusablePressable>
                    <FocusablePressable
                      accessibilityLabel={`Delete bodyweight entry for ${entry.localDate}`}
                      accessibilityRole="button"
                      onPress={() => { setPendingEntry(entry); setFailure(null); }}
                      style={[styles.rowAction, { borderColor: colors.destructive }]}
                    >
                      <Text style={[typeScale.bodyStrong as TextStyle, { color: colors.destructive }]}>Delete bodyweight entry</Text>
                    </FocusablePressable>
                  </View>
                )}
              </View>
            );
          })}
        </>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: space[4], maxHeight: "82%" },
  empty: { gap: space[4] },
  latestFact: { gap: space[1] },
  row: { borderTopWidth: StyleSheet.hairlineWidth, gap: space[2], paddingTop: space[4] },
  actions: { flexDirection: "row", gap: space[2] },
  rowAction: { borderRadius: radius.standard, borderWidth: StyleSheet.hairlineWidth, flex: 1, justifyContent: "center", minHeight: sizes.minimumTarget, paddingHorizontal: space[2] },
  confirmation: { gap: space[2] },
});

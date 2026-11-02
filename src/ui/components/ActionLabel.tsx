import {
  Archive, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CalendarDays, Check, Copy,
  Dumbbell, Ellipsis, Eye, EyeOff, Filter, Link, Pencil, Plus, RotateCcw,
  Save, Settings, Timer, Trash2, Unlink, FileInput, Ruler, HeartPulse, Gauge, Repeat, Shuffle, List, Scale, Route, Mountain,
} from "lucide-react-native";
import React, { useState } from "react";
import { StyleSheet, Text, useWindowDimensions, View, type TextStyle } from "react-native";

import { sizes, typeScale } from "../theme";

/** Compact captions retain the original action name on the owning pressable. */
function compactAction(label: string) {
  if (/^Set not saved · Retry$/i.test(label)) return { label: "Retry", Icon: RotateCcw };
  const runningKind = /^Add (Recovery|Long run|Progression|Tempo|Intervals|Hills|Fartlek) session$/i.exec(label)?.[1];
  if (runningKind !== undefined) {
    const kindIcons: Readonly<Record<string, typeof Plus>> = {
      recovery: HeartPulse, "long run": Route, progression: ArrowUp,
      tempo: Gauge, intervals: Repeat, hills: Mountain, fartlek: Shuffle,
    };
    return { label: runningKind, Icon: kindIcons[runningKind.toLowerCase()]! };
  }
  if (/^actions$/i.test(label)) return { label: "Actions", Icon: Ellipsis };
  if (/^import/i.test(label)) return { label: "Import", Icon: FileInput };
  if (/^undo/i.test(label)) return { label: "Undo", Icon: RotateCcw };
  if (/^load$/i.test(label)) return { label: "Load", Icon: Dumbbell };
  if (/^relative$/i.test(label)) return { label: "Relative", Icon: Scale };
  if (/^(body metrics|settings)$/i.test(label)) return { label, Icon: /^settings$/i.test(label) ? Settings : Scale };
  if (/^set target/i.test(label)) return { label: "Set target", Icon: Pencil };
  if (/^template update/i.test(label)) return { label: "Review update", Icon: Eye };
  if (/unit distance$/i.test(label)) return { label: "Distance", Icon: Ruler };
  if (/unit duration$/i.test(label)) return { label: "Time", Icon: Timer };
  if (/Target: Pace$/i.test(label)) return { label: "Pace", Icon: Gauge };
  if (/Target: HR zone$/i.test(label)) return { label: "HR zone", Icon: HeartPulse };
  if (/Target: RPE$/i.test(label)) return { label: "RPE", Icon: Gauge };
  if (/^format continuous/i.test(label)) return { label: "Continuous", Icon: ArrowRight };
  if (/^format tempo repeats/i.test(label)) return { label: "Repeats", Icon: Repeat };
  if (/^style structured/i.test(label)) return { label: "Structured", Icon: List };
  if (/^style unstructured/i.test(label)) return { label: "Unstructured", Icon: Shuffle };
  if (/^easy throughout/i.test(label)) return { label: "Easy", Icon: Gauge };
  if (/^steady finish/i.test(label)) return { label: "Steady", Icon: Gauge };
  if (/^progression finish/i.test(label)) return { label: "Progression", Icon: ArrowUp };
  if (/^bodyweight history/i.test(label)) return { label: "Bodyweight", Icon: Scale };
  if (/^correct/i.test(label)) return { label: "Correct", Icon: Pencil };
  if (/^preview/i.test(label)) return { label: "Preview", Icon: Eye };
  if (/^close/i.test(label)) return { label: "Close", Icon: ArrowLeft };
  if (/^previous/i.test(label)) return { label: "Previous", Icon: ArrowLeft };
  if (/^next/i.test(label)) return { label: "Next", Icon: ArrowRight };
  if (/^move/i.test(label)) return { label: /up|earlier/i.test(label) ? "Move up" : "Move down", Icon: /up|earlier/i.test(label) ? ArrowUp : ArrowDown };
  if (/^dismiss/i.test(label)) return { label: "Dismiss", Icon: ArrowLeft };
  if (/^schedule/i.test(label)) return { label: "Schedule", Icon: CalendarDays };
  if (/^train anyway/i.test(label)) return { label: "Train", Icon: Dumbbell };
  if (/^replace|^override/i.test(label)) return { label: "Replace", Icon: RotateCcw };
  if (/^(return|back|go back|go to)/i.test(label)) return { label: "Back", Icon: ArrowLeft };
  if (/^(retry|reload|refresh|restore|reactivate)/i.test(label)) return { label: label.split(" ")[0]!, Icon: RotateCcw };
  if (/^(save|saving)/i.test(label)) return { label: "Save", Icon: Save };
  if (/^(cancel|keep|leave unmatched|continue without)/i.test(label)) return { label: /^keep editing/i.test(label) ? "Keep editing" : /^keep/i.test(label) ? "Keep" : "Cancel", Icon: ArrowLeft };
  if (/^(delete|discard|remove|unmatch)/i.test(label)) return { label: /^unmatch/i.test(label) ? "Unmatch" : /^discard/i.test(label) ? "Discard" : "Delete", Icon: /^unmatch/i.test(label) ? Unlink : Trash2 };
  if (/^finish workout later/i.test(label)) return { label: "Later", Icon: ArrowLeft };
  if (/^complete set \d+/i.test(label)) return { label: label.replace(/^complete set /i, "Complete "), Icon: Check };
  if (/^(complete|finish|done|confirm|apply|verify|use)/i.test(label)) return { label: /^(complete|finish|done)/i.test(label) ? "Done" : /^(confirm|apply|verify)/i.test(label) ? "Confirm" : "Use", Icon: Check };
  if (/^(add|create)/i.test(label)) return { label: /^add/i.test(label) ? "Add" : "Create", Icon: Plus };
  if (/^(edit|change|benchmark source)/i.test(label)) return { label: /^change/i.test(label) ? "Change" : "Edit", Icon: Pencil };
  if (/^duplicate/i.test(label)) return { label: "Duplicate", Icon: Copy };
  if (/^archive/i.test(label)) return { label: "Archive", Icon: Archive };
  if (/^disconnect/i.test(label)) return { label: "Disconnect", Icon: Unlink };
  if (/^(match|reassign|connect)/i.test(label)) return { label: /^connect/i.test(label) ? "Connect" : "Match", Icon: Link };
  if (/^sync/i.test(label)) return { label: "Sync", Icon: RotateCcw };
  if (/^(view|show|review|open)/i.test(label)) return { label: /^review/i.test(label) ? "Review" : /^show/i.test(label) ? "Show" : /^open/i.test(label) ? "Open" : "View", Icon: /settings/i.test(label) ? Settings : /^show results/i.test(label) ? Filter : Eye };
  if (/^hide/i.test(label)) return { label: "Hide", Icon: EyeOff };
  if (/^(start|resume|continue|activate|enable|sign in)/i.test(label)) return { label: /^resume/i.test(label) ? "Resume" : /^start/i.test(label) ? "Start" : /^activate/i.test(label) ? "Activate" : "Continue", Icon: ArrowRight };
  if (/^nothing scheduled/i.test(label)) return { label: "No plan", Icon: CalendarDays };
  if (/^choose/i.test(label)) return { label: "Choose day", Icon: CalendarDays };
  if (/^load/i.test(label)) return { label: "Load more", Icon: ArrowDown };
  if (/^clear/i.test(label)) return { label: "Clear filters", Icon: Filter };
  if (/^(appearance|plan settings|data and recovery)/i.test(label)) return { label: "Settings", Icon: Settings };
  if (/^timing/i.test(label)) return { label: "Timing", Icon: Timer };
  if (/^(workout actions|more)/i.test(label)) return { label: "More", Icon: Ellipsis };
  if (/^reorder/i.test(label)) return { label: "Reorder", Icon: ArrowDown };
  if (/^follow device timezone/i.test(label)) return { label: "Use device", Icon: Check };
  if (/^[−+-]\d+ sec$/i.test(label)) return { label, Icon: Timer };
  if (/exercise/i.test(label)) return { label: "Exercise", Icon: Dumbbell };
  return null;
}

export function isCompactActionLabel(label: string): boolean {
  // Field triggers display a value rather than the action named by their label.
  if (/^(start|end|workout|effective|recorded|benchmark|target|work|recovery) (date|time|duration)$/i.test(label)) return false;
  return compactAction(label) !== null;
}

/** Measure native glyphs at the user's font scale before choosing text or an intent glyph. */
export function ActionLabel({ label, visibleLabel, color, typography = typeScale.sectionTitle as TextStyle }: Readonly<{
  label: string;
  visibleLabel?: string | undefined;
  color: string;
  typography?: TextStyle | undefined;
}>) {
  const { width: screenWidth, fontScale } = useWindowDimensions();
  const [availableWidth, setAvailableWidth] = useState<number | null>(null);
  const [measured, setMeasured] = useState<Readonly<Record<string, number>>>({});
  const caption = visibleLabel ?? label;
  const compact = compactAction(label);
  const width = availableWidth ?? Math.max(sizes.minimumTarget, screenWidth - 32);
  const naturalWidth = (text: string) => measured[`${fontScale}:${text}`]
    ?? text.length * (typography.fontSize ?? 20) * fontScale * 0.58;
  const fullFits = naturalWidth(caption) <= width;
  const compactFits = compact !== null && naturalWidth(compact.label) <= width;
  const Glyph = !fullFits && !compactFits ? compact?.Icon : undefined;
  const displayed = fullFits || compact === null ? caption : compact.label;

  return <View onLayout={(event) => {
    const next = event.nativeEvent.layout.width;
    if (next > 0) setAvailableWidth((current) => current === next ? current : next);
  }} style={styles.container}>
    {Glyph === undefined ? <Text numberOfLines={1} ellipsizeMode="clip" style={[typography, styles.label, { color }]}>{displayed}</Text>
      : <Glyph color={color} size={sizes.icon} strokeWidth={2} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />}
    <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={styles.measurements}>
      {[...new Set([caption, ...(compact === null ? [] : [compact.label])])].map((text) => <Text key={text} numberOfLines={1} onTextLayout={(event) => {
        const next = event.nativeEvent.lines[0]?.width;
        if (next !== undefined && next > 0) setMeasured((current) => current[`${fontScale}:${text}`] === next ? current : { ...current, [`${fontScale}:${text}`]: next });
      }} style={[typography, styles.measurement]}>{text}</Text>)}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  container: { alignItems: "center", alignSelf: "stretch", justifyContent: "center", minWidth: 0 },
  label: { textAlign: "center" },
  measurements: { opacity: 0, position: "absolute", height: 0, overflow: "hidden", width: 10000 },
  measurement: { width: 10000 },
});

const LAUNCHER_PACKAGE = /(?:^|\.)(?:launcher|nexuslauncher)(?:\.|$)/iu;

function attribute(source, name) {
  return source.match(new RegExp(`${name}="([^"]*)"`, "u"))?.[1] ?? "";
}

function booleanAttribute(source, name) {
  return attribute(source, name) === "true";
}

function parseBounds(value) {
  const match = value.match(/^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/u);
  if (match === null) return null;
  const [left, top, right, bottom] = match.slice(1).map(Number);
  if (right <= left || bottom <= top) return null;
  return Object.freeze({ left, top, right, bottom });
}

export function parsePhase14SemanticSnapshot(xmlInput) {
  const xml = Buffer.isBuffer(xmlInput) ? xmlInput.toString("utf8") : String(xmlInput);
  const nodes = [...xml.matchAll(/<node\b[^>]*>/gu)].map(([source]) => {
    const text = attribute(source, "text");
    const contentDescription = attribute(source, "content-desc");
    const resourceId = attribute(source, "resource-id");
    return Object.freeze({
      package: attribute(source, "package"),
      label: contentDescription || text || resourceId,
      text,
      content_description: contentDescription,
      resource_id: resourceId,
      focused: booleanAttribute(source, "focused"),
      selected: booleanAttribute(source, "selected"),
      checked: booleanAttribute(source, "checked"),
      enabled: attribute(source, "enabled") !== "false",
      bounds: parseBounds(attribute(source, "bounds")),
    });
  });
  const packages = Object.freeze([...new Set(nodes.map(({ package: packageName }) => packageName).filter(Boolean))].sort());
  const labels = Object.freeze([...new Set(nodes.flatMap(({ text, content_description: description }) => [text, description]).filter(Boolean))]);
  const focused = nodes.find((entry) => entry.focused) ?? null;
  const bounded = nodes.filter(({ bounds }) => bounds !== null);
  const windowBounds = bounded.length === 0 ? null : Object.freeze({
    left: Math.min(...bounded.map(({ bounds }) => bounds.left)),
    top: Math.min(...bounded.map(({ bounds }) => bounds.top)),
    right: Math.max(...bounded.map(({ bounds }) => bounds.right)),
    bottom: Math.max(...bounded.map(({ bounds }) => bounds.bottom)),
  });
  return Object.freeze({
    rotation: Number(attribute(xml.match(/<hierarchy\b[^>]*>/u)?.[0] ?? "", "rotation") || 0),
    packages,
    labels,
    focused_node: focused?.label ?? null,
    nodes: Object.freeze(nodes),
    window_bounds: windowBounds,
    launcher_present: packages.some((packageName) => LAUNCHER_PACKAGE.test(packageName)),
  });
}

function nodeMatches(node, expected) {
  return (
    (expected.label === undefined || node.label === expected.label)
    && (expected.resourceIdEndsWith === undefined || node.resource_id.endsWith(expected.resourceIdEndsWith))
    && (expected.focused === undefined || node.focused === expected.focused)
    && (expected.selected === undefined || node.selected === expected.selected)
    && (expected.checked === undefined || node.checked === expected.checked)
    && (expected.enabled === undefined || node.enabled === expected.enabled)
  );
}

export function evaluatePhase14SemanticPredicate(snapshot, predicate, runtimeState = true) {
  const packageForeground = typeof runtimeState === "boolean"
    ? runtimeState
    : runtimeState.packageForeground;
  const imeVisible = typeof runtimeState === "boolean" ? undefined : runtimeState.imeVisible;
  const failures = [];
  if (predicate.packageForeground !== undefined && predicate.packageForeground !== packageForeground) {
    failures.push("package_foreground");
  }
  if (predicate.imeVisible !== undefined && predicate.imeVisible !== imeVisible) {
    failures.push("ime_visible");
  }
  if (predicate.semanticRequired !== false) {
    if (snapshot === null) failures.push("semantic_snapshot");
    else {
      if (!snapshot.packages.includes(predicate.package)) failures.push("package");
      if (predicate.rejectLauncher === true && snapshot.launcher_present) failures.push("launcher");
      for (const label of predicate.visible ?? []) {
        if (!snapshot.labels.includes(label)) failures.push(`visible:${label}`);
      }
      for (const label of predicate.absent ?? []) {
        if (snapshot.labels.includes(label)) failures.push(`absent:${label}`);
      }
      for (const expected of predicate.nodes ?? []) {
        if (!snapshot.nodes.some((node) => nodeMatches(node, expected))) {
          failures.push(`node:${expected.label ?? expected.resourceIdEndsWith}`);
        }
      }
      const focus = predicate.focus ?? { allowNull: true };
      if (focus.equals !== undefined && snapshot.focused_node !== focus.equals) failures.push(`focus:${focus.equals}`);
      if (focus.allowNull === false && snapshot.focused_node === null) failures.push("focus:null");
    }
  }
  return Object.freeze({ ok: failures.length === 0, failures: Object.freeze(failures) });
}

export function phase14FocusAcquisitionSatisfied(snapshot, action, runtimeState) {
  const acquisition = action.focusAcquisition;
  if (acquisition === undefined) return true;
  return snapshot?.focused_node === acquisition.target
    && evaluatePhase14SemanticPredicate(snapshot, action.pre, runtimeState).ok;
}

export function computePhase14ScrimTap(snapshot) {
  const windowBounds = snapshot?.window_bounds;
  const frame = snapshot?.nodes.find(({ resource_id: resourceId }) => resourceId.endsWith("bottom-sheet-frame"));
  if (windowBounds === null || windowBounds === undefined) throw new Error("phase14_window_bounds_missing");
  if (frame?.bounds === null || frame?.bounds === undefined) throw new Error("phase14_sheet_bounds_missing");
  const sheetBounds = frame.bounds;
  const availableTop = sheetBounds.top - windowBounds.top;
  if (availableTop < 2) throw new Error("phase14_scrim_target_missing");
  const edgeOffset = Math.max(1, Math.min(8, Math.floor(availableTop / 2)));
  return Object.freeze({
    rotation: snapshot.rotation,
    window_bounds: windowBounds,
    sheet_bounds: sheetBounds,
    x: Math.floor((windowBounds.left + windowBounds.right) / 2),
    y: sheetBounds.top - edgeOffset,
  });
}

export function validatePhase14ActionObservation(observation, contract, snapshots = {}) {
  const commandValid = contract.transport === "adb-keyevent"
    ? observation?.command?.key_code === contract.command.keyCode
    : contract.transport === "adb-coordinate"
      ? observation?.command?.normalized_target === "outside-sheet"
      : observation?.command?.intent === "launcher" && /^[a-f0-9]{64}$/u.test(observation.command.component_sha256 ?? "");
  if (
    observation?.schema_version !== 3
    || observation.action_id !== contract.id
    || observation.input !== contract.input
    || observation.transport !== contract.transport
    || !commandValid
    || observation.verdict !== "PASS"
    || !Number.isFinite(Date.parse(observation.started_at))
    || !Number.isFinite(Date.parse(observation.finished_at))
    || Date.parse(observation.finished_at) < Date.parse(observation.started_at)
    || !Number.isInteger(observation.poll_attempts)
    || observation.poll_attempts < 1
    || observation.poll_attempts > Math.ceil(contract.poll.timeoutMs / contract.poll.intervalMs) + 1
  ) {
    throw new Error("phase14_action_observation_invalid");
  }
  const preSnapshot = snapshots.pre ?? observation.pre?.snapshot ?? null;
  const postSnapshot = snapshots.post ?? observation.post?.snapshot ?? null;
  if (contract.transport === "adb-coordinate") {
    const exact = computePhase14ScrimTap(preSnapshot);
    if (
      observation.command.x !== exact.x
      || observation.command.y !== exact.y
      || observation.command.rotation !== exact.rotation
      || JSON.stringify(observation.command.window_bounds) !== JSON.stringify(exact.window_bounds)
      || JSON.stringify(observation.command.sheet_bounds) !== JSON.stringify(exact.sheet_bounds)
    ) throw new Error("phase14_scrim_command_invalid");
  }
  if (!evaluatePhase14SemanticPredicate(preSnapshot, contract.pre, {
    packageForeground: observation.pre?.package_foreground,
    imeVisible: observation.pre?.ime_visible,
  }).ok) {
    throw new Error("phase14_action_precondition_invalid");
  }
  if (!evaluatePhase14SemanticPredicate(postSnapshot, contract.post, {
    packageForeground: observation.post?.package_foreground,
    imeVisible: observation.post?.ime_visible,
  }).ok) {
    throw new Error("phase14_action_postcondition_invalid");
  }
  return true;
}

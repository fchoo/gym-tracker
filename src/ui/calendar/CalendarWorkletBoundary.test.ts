import { transformFileSync } from "@babel/core";
import { describe, expect, it, jest } from "@jest/globals";
import path from "node:path";
import vm from "node:vm";

import { addLocalMonthsClamped, startOfLocalMonth } from "../../domains/scheduling/localDate";
import { clampMonthDrag, type CalendarMotionCommand } from "./calendarTransitionController";

type Worklet = ((...args: any[]) => unknown) & {
  __closure?: Record<string, unknown>;
  __initData?: { code: string };
};

// Compile exactly the Android production callbacks, then unpack their closures
// into a separate UI context. Jest's ordinary Reanimated mock runs both sides
// on JS and cannot detect synchronous calls to a remote JS function.
const androidProductionCaller = { name: "metro", platform: "android", isDev: false };
const compiled = transformFileSync(path.join(__dirname, "CalendarMonthViewport.tsx"), {
  babelrc: false,
  configFile: false,
  presets: ["babel-preset-expo"],
  caller: androidProductionCaller,
  envName: "production",
})!.code!;

function harness(command: CalendarMotionCommand | null = null) {
  const handlers: Record<string, Worklet> = {};
  const effects: Array<() => void> = [];
  const animations: Worklet[] = [];
  const refs: Array<{ current: unknown }> = [];
  const jsRefs = new WeakSet<object>();
  const sharedValues = new WeakSet<object>();
  const allowedUIFunctions = new WeakSet<Function>();
  const remoteOriginals = new WeakMap<Function, Function>();
  const rnQueue: Array<() => void> = [];
  const uiContext = vm.createContext({});
  const records: Record<string, ReturnType<typeof jest.fn>> = {};
  for (const name of [
    "recordPhase16CalendarDrag", "recordPhase16CalendarRelease", "recordPhase16CalendarCancel", "recordPhase16CalendarFocus",
    "recordPhase20CalendarPointer", "recordPhase20CalendarBaseline", "recordPhase20CalendarCallback", "recordPhase20CalendarInputAttempt",
    "recordPhase20CalendarRenderedPanel", "recordPhase20CalendarRenderedOverlay", "recordPhase20CalendarViewport",
  ]) records[name] = jest.fn();

  const scheduleOnRN = (callback: Function, ...args: unknown[]) => {
    const original = remoteOriginals.get(callback);
    if (original === undefined) throw new Error("Unrecognized RN callback");
    rnQueue.push(() => original(...args));
  };
  const cancelAnimation = () => undefined;
  const measure = () => ({ pageX: 0, pageY: 0, width: 400, height: 500 });
  [scheduleOnRN, cancelAnimation, measure].forEach((fn) => allowedUIFunctions.add(fn));

  function unpack(value: unknown): any {
    if (typeof value === "function") {
      if (allowedUIFunctions.has(value)) return value;
      const worklet = value as Worklet;
      if (worklet.__initData !== undefined) {
        const fn = vm.runInContext(`(${worklet.__initData.code})`, uiContext);
        const closure = unpack(worklet.__closure ?? {});
        return (...args: unknown[]) => fn.apply({ __closure: closure }, args);
      }
      const remote = () => { throw new Error('[Worklets] Tried to synchronously call a Remote Function on the UI Runtime'); };
      remoteOriginals.set(remote, value);
      return remote;
    }
    if (value === null || typeof value !== "object") return value;
    if (sharedValues.has(value)) return value;
    if (jsRefs.has(value)) return new Proxy(value, {
      get: () => { throw new Error("React ref accessed on the UI Runtime"); },
      set: () => { throw new Error("React ref mutated on the UI Runtime"); },
    });
    if (Array.isArray(value)) return value.map(unpack);
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, unpack(entry)]));
  }

  const gesture: Record<string, any> = {};
  for (const method of ["enabled", "manualActivation", "onTouchesDown", "onTouchesMove", "onStart", "onChange", "onEnd", "onFinalize"]) {
    gesture[method] = (callback: unknown) => {
      if (typeof callback === "function") handlers[method] = callback as Worklet;
      return gesture;
    };
  }
  const react = {
    useCallback: (callback: Function) => callback,
    useEffect: (callback: () => void) => effects.push(callback),
    useRef: (current: unknown) => {
      const ref = { current };
      refs.push(ref);
      jsRefs.add(ref);
      return ref;
    },
    forwardRef: (callback: Function) => callback,
  };
  const jsx = (type: unknown, props: unknown) => ({ type, props });
  const reanimated = {
    Easing: { bezier: () => () => 0 },
    cancelAnimation,
    measure,
    useAnimatedRef: () => {
      const ref = Object.assign(() => undefined, { current: null });
      allowedUIFunctions.add(ref);
      return ref;
    },
    useAnimatedStyle: () => ({}),
    useSharedValue: (value: unknown) => {
      const shared = { value };
      sharedValues.add(shared);
      return shared;
    },
    withDelay: (_delay: number, value: unknown) => value,
    withTiming: (value: unknown, _options: unknown, callback?: Worklet) => {
      if (callback !== undefined) animations.push(callback);
      return value;
    },
  };
  const dependencies: Record<string, unknown> = {
    react,
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "react-native": { StyleSheet: { create: (styles: unknown) => styles } },
    "react-native-gesture-handler": { Gesture: { Pan: () => gesture } },
    "react-native-reanimated": reanimated,
    "react-native-worklets": { scheduleOnRN },
    "../../bootstrap/phase16CalendarTestControls": { ...records, phase16CalendarGestureDriver: () => null },
    "../../bootstrap/phase20CalendarObservation": records,
    "../../domains/scheduling/localDate": { addLocalMonthsClamped, startOfLocalMonth },
    "./calendarTransitionController": { clampMonthDrag },
    "./CalendarWeekRow": { calendarTrackMetrics: () => ({ rowMinHeight: 70 }) },
  };
  const module = { exports: {} as Record<string, any> };
  vm.runInNewContext(compiled, {
    module, exports: module.exports,
    require: (name: string) => {
      if (name.startsWith("@babel/runtime/helpers/")) return require(name);
      if (!(name in dependencies)) throw new Error(`Unexpected production import: ${name}`);
      return dependencies[name];
    },
    setTimeout: () => 1,
    clearTimeout: () => undefined,
  });
  const onCancel = jest.fn();
  const onPreview = jest.fn();
  const onRelease = jest.fn();
  const onComplete = jest.fn();
  const onInteractionDiagnosticComplete = jest.fn();
  const tree = module.exports.CalendarMonthViewport({
    command, focusedWeek: command?.kind === "settle-week" ? {
      selectedDates: [], followingDates: [],
      selectedGeometry: { y: 70, height: 70, generation: 0 }, followingGeometry: { y: 140, height: 70, generation: 0 },
    } : null,
    month: "2026-11-01", onCancel, onComplete, onPreview, onRelease, onInteractionDiagnosticComplete,
    renderMonth: () => null, renderWeek: () => null,
    transition: { mode: "month", phase: command === null ? "idle" : "settling", epoch: command !== null && "epoch" in command ? command.epoch : 0, reducedMotion: false },
  });
  tree.props.children.props.children.props.onLayout({ nativeEvent: { layout: { width: 400, height: 500 } } });
  return {
    handlers, animations, refs, records, onCancel, onPreview, onRelease, onComplete, onInteractionDiagnosticComplete,
    runEffects: () => effects.forEach((effect) => effect()),
    runUI: (callback: Worklet, ...args: unknown[]) => {
      expect(callback.__initData?.code).toBeDefined();
      return unpack(callback)(...args);
    },
    flushRN: () => { while (rnQueue.length > 0) rnQueue.shift()!(); },
  };
}

describe("Calendar Android production worklet boundaries", () => {
  it("does not cancel a date selection when a non-drag tap fails the manual pan", () => {
    const h = harness();
    h.runEffects();
    h.runUI(h.handlers.onTouchesDown!, { allTouches: [{ absoluteX: 200, absoluteY: 100 }] });
    h.runUI(h.handlers.onFinalize!, {}, false);
    h.flushRN();
    expect(h.onCancel).not.toHaveBeenCalled();
  });
  it.each([-1, 1])("executes the full swipe at every marker in direction %i without a synchronous JS call", (direction) => {
    const h = harness();
    h.runEffects();
    const manager = { activate: jest.fn(), fail: jest.fn() };
    h.runUI(h.handlers.onTouchesDown!, { allTouches: [{ absoluteX: 200, absoluteY: 100 }] });
    h.runUI(h.handlers.onTouchesMove!, { allTouches: [{ absoluteX: 200 + direction * 10, absoluteY: 100 }] }, manager);
    h.runUI(h.handlers.onStart!);
    for (const distance of [39.6, 40, 99.6, 100, 100.4, 140]) {
      h.runUI(h.handlers.onChange!, { translationX: direction * distance, translationY: 0 });
    }
    h.runUI(h.handlers.onEnd!, { translationX: direction * 140, translationY: 0 });
    h.runUI(h.handlers.onFinalize!, {}, true);
    h.flushRN();
    expect(manager.activate).toHaveBeenCalledTimes(1);
    expect(h.records.recordPhase16CalendarDrag!.mock.calls.map(([value]: any[]) => value.commandedRatio)).toEqual([0.1, 0.249, 0.25, 0.251]);
    expect(h.records.recordPhase16CalendarDrag).toHaveBeenLastCalledWith(expect.objectContaining({ semanticMonth: "2026-11", titleMonth: direction < 0 ? "2026-12" : "2026-10" }));
    expect(h.onPreview).toHaveBeenCalledWith(direction * 100, 400);
    expect(h.onRelease).toHaveBeenCalledWith(expect.objectContaining({ targetMonthId: direction < 0 ? "2026-12" : "2026-10" }));
  });

  it("finishes a week collapse without accessing React refs from its UI completion worklet", () => {
    const h = harness({ kind: "settle-week", phase: "collapse", epoch: 4, durationMs: 240, easing: [0.4, 0, 0.78, 0.2], agendaDelayMs: 0, agendaDurationMs: 140 });
    const diagnosticRefs = h.refs.filter((ref) => ref.current === false).slice(0, 2);
    diagnosticRefs.forEach((ref) => { ref.current = true; });
    h.runEffects();
    expect(h.animations).toHaveLength(1);
    h.runUI(h.animations[0]!, true);
    h.flushRN();
    expect(h.onComplete).toHaveBeenCalledWith(4);
    expect(h.onInteractionDiagnosticComplete).toHaveBeenCalledTimes(1);
    expect(diagnosticRefs.map((ref) => ref.current)).toEqual([false, false]);
  });
});

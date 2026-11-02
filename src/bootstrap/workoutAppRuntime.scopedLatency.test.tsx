import React from "react";
import { act, render, waitFor } from "@testing-library/react-native";
import { AppState, Text } from "react-native";
import { describe, expect, it, jest } from "@jest/globals";
import type { RestCommandResult, RestRepository, RestStateV1 } from "../domains/rest";
import type { ActiveWorkoutView, TodayView } from "../domains/workout";
import type { SqliteKernel } from "../platform/sqlite";
import {
  WorkoutAppRuntimeProvider,
  type WorkoutAppRuntimeDependencies,
  useWorkoutAppRuntime,
} from "./workoutAppRuntime";
import { createOwnedPlanRuntimePort } from "./ownedPlanRuntime";
import type { WorkoutLifecycleResult } from "./workoutLifecycle";

jest.mock("./ownedPlanRuntime", () => ({createOwnedPlanRuntimePort:jest.fn()}));
jest.mock("../platform/notifications/expoRestNotificationAdapter", () => ({
  createExpoRestNotificationAdapter: jest.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

const running: Extract<RestStateV1, { state: "running" }> = {
  version: 1, state: "running", revision: 7,
  startedAtMs: 1_000, endsAtMs: 91_000, nextSetId: "set-2",
};

function committed(restRevision = 8, sessionRevision = 12): RestCommandResult {
  return {
    state: { ...running, revision: restRevision, endsAtMs: 76_000 },
    sessionRevision,
    invalidationScopes: [["active-workout", "session-1"], ["today"]],
  };
}


const metricIdentity = {profile:'load_reps' as const,contractVersion:1 as const,exerciseMetricGeneration:1};
const observation = {version:1 as const,profile:'load_reps' as const,loadGrams:60000,reps:8,source:'manual' as const};
const savedView: ActiveWorkoutView = {
 id:'session-1',status:'in_progress',revision:12,activeSetId:'set-1',activeExerciseId:'exercise-1',
 currentExercise:{id:'exercise-1',exerciseId:'squat',name:'Squat',metricIdentity,metricProfile:'load_reps',ordinal:0,defaultRestSeconds:90,status:'active',revision:1,warmups:[],workingSets:[{id:'set-1',kind:'working',ordinal:0,sourceTargetId:null,metricIdentity,target:{version:1,profile:'load_reps',loadGrams:60000,minReps:6,maxReps:8,incrementGrams:2500,perSide:false},observation,status:'draft',completedAtMs:null,revision:2,valueSources:[]} ]},
 exercises:[],progress:{completedWorkingSets:0,totalWorkingSets:1},rest:{version:1,state:'idle',revision:0,nextSetId:null}
};
const draftInput = {sessionId:'session-1',setId:'set-1',expectedSetRevision:1,metricIdentity,observation,updatedAtMs:10000};
const reorderInput = {requestId:'reorder-latency',requestSha256:'a'.repeat(64),sessionId:'session-1',expectedSessionRevision:11,occurredAtMs:10000,orderedSessionExerciseIds:['exercise-1'],expectedSessionExerciseRevisions:[{sessionExerciseId:'exercise-1',revision:1}]};

function fixture(view: TodayView = {
  state: "active_workout", sessionId: "session-1", exerciseName: "Squat",
  setLabel: "Working set 2", restStatus: "running",
}) {
  const queryAll = jest.fn<SqliteKernel["queryAll"]>(async () => []);
  const kernel = { queryAll, close: jest.fn(async () => undefined) } as unknown as SqliteKernel;
  const repository = {
    getTodayView: jest.fn(async () => view),
    getActivation: jest.fn(async () => null),
    startWorkout: jest.fn(async()=> ({id:'session-1',status:'in_progress',revision:1,source:'empty',planId:null,planDayId:null})),
  };
  const rest: RestRepository = {
    getRestState: jest.fn(async () => running),
    getRestContext: jest.fn(async () => ({ state: running, sessionRevision: 11 })),
    listActiveSessionIds: jest.fn(async () => ["session-1"]),
    currentRestRevision: jest.fn(async () => running.revision),
    startManualRest: jest.fn(async () => committed()),
    pauseRest: jest.fn(async () => committed()),
    resumeRest: jest.fn(async () => committed()),
    adjustRest: jest.fn(async () => committed()),
    skipRest: jest.fn(async () => committed()),
    expireRest: jest.fn(async () => committed()),
    expireRestWithForegroundFeedback: jest.fn(async () => committed()),
  };
  const notifications = {
    cancel: jest.fn(async () => undefined),
    permission: jest.fn(async () => "granted" as const),
    requestPermission: jest.fn(async () => "granted" as const),
  };
  const lifecycleResult = {
    trigger: "post_commit", permission: "granted", foregroundFeedback: [],
  } as unknown as WorkoutLifecycleResult;
  const lifecycle = {
    trigger: jest.fn(async () => lifecycleResult),
    subscribeForeground: jest.fn(() => () => undefined),
    dispose: jest.fn(async () => undefined),
  };
  const schedules = { loadToday: jest.fn(async () => null) };
  const workout = {
    updateActiveSetDraft: jest.fn(async () => savedView),
    reorderExercises: jest.fn(async (input: {sessionId:string;expectedSessionRevision:number;orderedSessionExerciseIds:readonly string[]}) => ({outcome:'committed' as const, sessionId:input.sessionId,sessionRevision:input.expectedSessionRevision+1,orderedSessionExerciseIds:input.orderedSessionExerciseIds})),
    getActiveWorkout: jest.fn(async () => savedView),
    completeSet: jest.fn(async () => ({outcome:'committed' as const,view:savedView})),
    removeWorkingSet: jest.fn(async () => ({outcome:'committed' as const,sessionId:'session-1',setId:'set-1',sessionRevision:12})),
  };
  const ownedPlans = {createId:jest.fn(()=> 'owned-create-id'),createDraft:jest.fn(async () => ({outcome:'committed' as const, planId:'plan-new', revision:1}))};
  jest.mocked(createOwnedPlanRuntimePort).mockReturnValue(ownedPlans as never);
  const dependencies: WorkoutAppRuntimeDependencies = {
    openKernel: async () => kernel,
    migrate: async () => undefined,
    activateInitialStarter: async () => undefined,
    createRepository: () => repository as never,
    createRestRepository: () => rest,
    createNotifications: () => notifications as never,
    createLifecycle: () => lifecycle as never,
    createScheduleRuntime: () => schedules as never,
    createOutcomeRepository: () => ({} as never),
    createWorkoutRepository: () => workout as never,
    restAlertPreferenceStore: {
      read: () => ({ soundEnabled: true, vibrationEnabled: true }),
      write: () => undefined,
    },
    now: () => new Date("2026-08-17T08:00:00+08:00"),
    nowMs: () => 10_000,
  };
  return { dependencies, kernel, repository, rest, notifications, lifecycle, lifecycleResult, schedules, workout, ownedPlans };
}

async function mount(input: ReturnType<typeof fixture>) {
  let runtime!: ReturnType<typeof useWorkoutAppRuntime>;
  let renderCount=0;
  function Probe() {
    renderCount+=1;
    runtime = useWorkoutAppRuntime();
    return <Text>{runtime.launchState}</Text>;
  }
  const rendered = await render(
    <WorkoutAppRuntimeProvider dependencies={input.dependencies}><Probe /></WorkoutAppRuntimeProvider>,
  );
  await waitFor(() => expect(runtime.launchState).toBe("trusted"));
  return { rendered, current: () => runtime, renderCount:()=>renderCount };
}


describe('scoped workout acknowledgement', () => {
 it('waits for the draft commit, then returns while unrelated reads are stalled', async () => {
  const input=fixture(); const runtime=await mount(input); const write=deferred<ActiveWorkoutView>(); const unrelated=deferred<null>();
  input.workout.updateActiveSetDraft.mockReturnValueOnce(write.promise); input.schedules.loadToday.mockReturnValue(unrelated.promise);
  let acknowledged:ActiveWorkoutView|undefined; let command!:Promise<ActiveWorkoutView>;
  try {
   await act(async()=>{command=runtime.current().updateActiveSetDraft(draftInput);void command.then(v=>{acknowledged=v;});});
   expect(acknowledged).toBeUndefined();
   await act(async()=>{write.resolve(savedView);});
   expect(acknowledged).toBe(savedView);expect(input.schedules.loadToday).toHaveBeenCalledTimes(1);
   expect(input.repository.getTodayView).toHaveBeenCalledTimes(1);expect(runtime.current().workoutRefreshGeneration).toBe(0);
   expect(runtime.current().view).toEqual({state:'active_workout',sessionId:'session-1',exerciseName:'Squat',setLabel:'Working set 1',restStatus:'idle'});
  }finally{write.resolve(savedView);unrelated.resolve(null);await command;await runtime.rendered.unmount();}
 });
 it('returns reordered source without waiting for schedule, activation or backup reads', async()=>{
  const input=fixture();const runtime=await mount(input);const unrelated=deferred<null>();input.schedules.loadToday.mockReturnValue(unrelated.promise);
  let result:unknown;
  try{
   await act(async()=>{result=await runtime.current().reorderExercises(reorderInput);});
   expect(result!).toBe(savedView);expect(input.workout.getActiveWorkout).toHaveBeenCalledTimes(1);
   expect(input.repository.getTodayView).toHaveBeenCalledTimes(1);expect(input.repository.getActivation).toHaveBeenCalledTimes(1);
   expect(input.schedules.loadToday).toHaveBeenCalledTimes(1);expect(runtime.current().workoutRefreshGeneration).toBe(0);
  }finally{unrelated.resolve(null);await runtime.rendered.unmount();}
 });
 it('returns a committed removal with one authoritative workout read',async()=>{
  const input=fixture();const runtime=await mount(input);const unrelated=deferred<null>();input.schedules.loadToday.mockReturnValue(unrelated.promise);
  try{
   let result:unknown;await act(async()=>{result=await runtime.current().removeWorkingSet({requestId:'remove-latency',requestSha256:'b'.repeat(64),sessionId:'session-1',setId:'set-1',expectedSessionRevision:11,expectedSetRevision:1,removedAtMs:10000});});
   expect(result).toBe(savedView);expect(input.workout.getActiveWorkout).toHaveBeenCalledTimes(1);expect(input.schedules.loadToday).toHaveBeenCalledTimes(1);
  }finally{unrelated.resolve(null);await runtime.rendered.unmount();}
 });
 it('does not turn an unrelated read failure into a failed committed save',async()=>{
  const input=fixture();const runtime=await mount(input);input.repository.getTodayView.mockRejectedValue(new Error('unrelated failed'));
  try{
   await act(async()=>{await expect(runtime.current().updateActiveSetDraft(draftInput)).resolves.toBe(savedView);});
   expect(runtime.current().actionFailure).toBeUndefined();expect(input.repository.getTodayView).toHaveBeenCalledTimes(1);
  }finally{await runtime.rendered.unmount();}
 });
 it('keeps source read failure distinct from failed reorder commit',async()=>{
  const input=fixture();const runtime=await mount(input);input.workout.getActiveWorkout.mockRejectedValueOnce(new Error('source failed'));
  try{
   let result:unknown;await act(async()=>{result=await runtime.current().reorderExercises(reorderInput);});
   expect(result).toEqual({outcome:'committed_refresh_failed',sessionId:'session-1',sessionRevision:12});expect(input.workout.reorderExercises).toHaveBeenCalledTimes(1);
  }finally{await runtime.rendered.unmount();}
 });
 it('does not replace a newer Today summary with an older parallel acknowledgement',async()=>{
  const input=fixture();const runtime=await mount(input);const old=deferred<ActiveWorkoutView>();input.workout.updateActiveSetDraft.mockReturnValueOnce(old.promise).mockResolvedValueOnce({...savedView,revision:13,activeSetId:null,activeExerciseId:null});
  let first!:Promise<ActiveWorkoutView>;
  try{
   await act(async()=>{first=runtime.current().updateActiveSetDraft(draftInput);await runtime.current().updateActiveSetDraft(draftInput);});
   await act(async()=>{old.resolve(savedView);await first;});
   expect(runtime.current().view).toMatchObject({exerciseName:null,setLabel:null});
  }finally{old.resolve(savedView);await first;await runtime.rendered.unmount();}
 });
 it('acknowledges set completion without a global refresh or second workout read',async()=>{
  const input=fixture();const runtime=await mount(input);const unrelated=deferred<null>();input.schedules.loadToday.mockReturnValue(unrelated.promise);
  try{
   await act(async()=>{await runtime.current().completeSet({sessionId:'session-1',setId:'set-1',expectedSessionRevision:11,expectedSetRevision:1,completionIdempotencyKey:'completion-latency',metricIdentity,observation,completedAtMs:10000});});
   expect(input.workout.completeSet).toHaveBeenCalledTimes(1);expect(input.workout.getActiveWorkout).not.toHaveBeenCalled();expect(input.repository.getTodayView).toHaveBeenCalledTimes(1);expect(runtime.current().workoutRefreshGeneration).toBe(0);
  }finally{unrelated.resolve(null);await runtime.rendered.unmount();}
 });
 it('acknowledges a plan save while its scoped selection refresh is pending',async()=>{
  const input=fixture();const runtime=await mount(input);const selection=deferred<null>();input.schedules.loadToday.mockReturnValue(selection.promise);
  try{
   let result:unknown;await act(async()=>{result=await runtime.current().createOwnedPlanDraft({name:'New plan',dayName:'Day 1'});});
   expect(result).toMatchObject({outcome:'committed',planId:'plan-new'});expect(input.ownedPlans.createDraft).toHaveBeenCalledTimes(1);
   expect(input.notifications.permission).toHaveBeenCalledTimes(1);expect(runtime.current().workoutRefreshGeneration).toBe(0);
  }finally{selection.resolve(null);await runtime.rendered.unmount();}
 });
 it('does not let a pending plan refresh overwrite a newer committed workout summary',async()=>{
  const input=fixture();const runtime=await mount(input);const selection=deferred<null>();input.schedules.loadToday.mockReturnValue(selection.promise);
  input.workout.updateActiveSetDraft.mockResolvedValueOnce({...savedView,revision:13,activeSetId:null,activeExerciseId:null});
  try{
   await act(async()=>{await runtime.current().createOwnedPlanDraft({name:'New plan',dayName:'Day 1'});});
   await act(async()=>{await runtime.current().updateActiveSetDraft(draftInput);selection.resolve(null);});
   expect(runtime.current().view).toMatchObject({exerciseName:null,setLabel:null});
  }finally{selection.resolve(null);await runtime.rendered.unmount();}
 });
 it('does not let an older workout acknowledgement overwrite the rest command summary',async()=>{
  const input=fixture();const runtime=await mount(input);const old=deferred<ActiveWorkoutView>();input.workout.updateActiveSetDraft.mockReturnValueOnce(old.promise);
  let first!:Promise<ActiveWorkoutView>;
  try{
   await act(async()=>{first=runtime.current().updateActiveSetDraft(draftInput);await runtime.current().adjustRest({sessionId:'session-1',expectedSessionRevision:11,expectedRestRevision:7,nowMs:10000,deltaMs:-15000});});
   await act(async()=>{old.resolve({...savedView,revision:11});await first;});
   expect(runtime.current().view).toMatchObject({restStatus:'running'});
  }finally{old.resolve(savedView);await first;await runtime.rendered.unmount();}
 });

 it('keeps unchanged Today summaries from rerendering all runtime consumers',async()=>{
  const input=fixture({state:'active_workout',sessionId:'session-1',exerciseName:'Squat',setLabel:'Working set 1',restStatus:'idle'});const runtime=await mount(input);
  const renders=runtime.renderCount();
  try{
   await act(async()=>{await runtime.current().updateActiveSetDraft(draftInput);});
   expect(runtime.renderCount()).toBe(renders);expect(runtime.current().workoutRefreshGeneration).toBe(0);
  }finally{await runtime.rendered.unmount();}
 });

 it('clears a previous start error after the empty-workout retry commits',async()=>{
  const input=fixture();const runtime=await mount(input);input.repository.startWorkout.mockRejectedValueOnce(new Error('failed start'));
  try{
   await act(async()=>{await expect(runtime.current().startEmptyWorkout()).rejects.toThrow('workout_action_failed');});
   expect(runtime.current().actionFailure).toBeDefined();
   await act(async()=>{await expect(runtime.current().startEmptyWorkout()).resolves.toBe('session-1');});
   expect(runtime.current().actionFailure).toBeUndefined();expect(input.schedules.loadToday).toHaveBeenCalledTimes(1);
  }finally{await runtime.rendered.unmount();}
 });
 it('preserves the newly started workout when an older plan refresh finishes',async()=>{
  const input=fixture({state:'no_active_plan'});const runtime=await mount(input);const selection=deferred<null>();input.schedules.loadToday.mockReturnValue(selection.promise);
  try{
   await act(async()=>{await runtime.current().createOwnedPlanDraft({name:'New plan',dayName:'Day 1'});});
   input.repository.getTodayView.mockResolvedValue({state:'active_workout',sessionId:'session-1',exerciseName:null,setLabel:null,restStatus:'idle'});
   await act(async()=>{await runtime.current().startEmptyWorkout();selection.resolve(null);});
   expect(runtime.current().view).toMatchObject({state:'active_workout',sessionId:'session-1'});
  }finally{selection.resolve(null);await runtime.rendered.unmount();}
 });

 it('clears the prior failure on plan-save success without clearing failures raised during refresh',async()=>{
  const input=fixture();const runtime=await mount(input);const selection=deferred<null>();input.repository.startWorkout.mockRejectedValueOnce(new Error('first failed'));
  try{
   await act(async()=>{await expect(runtime.current().startEmptyWorkout()).rejects.toThrow('workout_action_failed');});
   input.schedules.loadToday.mockReturnValue(selection.promise);
   await act(async()=>{await runtime.current().createOwnedPlanDraft({name:'New plan',dayName:'Day 1'});});
   expect(runtime.current().actionFailure).toBeUndefined();
   input.repository.startWorkout.mockRejectedValueOnce(new Error('new failed'));
   await act(async()=>{await expect(runtime.current().startEmptyWorkout()).rejects.toThrow('workout_action_failed');selection.resolve(null);});
   expect(runtime.current().actionFailure).toBeDefined();
  }finally{selection.resolve(null);await runtime.rendered.unmount();}
 });

});

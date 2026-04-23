import type { EffectInstance, Keyframe, ParameterValue, ProjectDocument, SceneSource, TimelineState, TimelineTrack } from "@unicorn/schemas";

export interface TimelineValidationIssue {
  code: "timeline.targetMissing" | "timeline.propertyMissing" | "timeline.unsupportedValue";
  trackId: string;
  message: string;
}

export type TimelineParameterOverrides = Record<string, Record<string, ParameterValue>>;

export function advanceTimeline(timeline: TimelineState, deltaSeconds: number): TimelineState {
  if (!timeline.playing) return timeline;
  const currentTime = (timeline.currentTime + deltaSeconds) % Math.max(timeline.duration, 0.001);
  return {
    ...timeline,
    currentTime
  };
}

export function timelineMarkers(duration: number, step = 0.1): string[] {
  const markers: string[] = [];
  for (let time = 0; time <= duration + 0.0001; time += step) {
    markers.push(time.toFixed(2));
  }
  return markers;
}

export function sampleTimelineValue(track: TimelineTrack, time: number): ParameterValue | null {
  if (track.keyframes.length === 0) return null;
  const keyframes = [...track.keyframes].sort((a, b) => a.time - b.time);
  const first = keyframes[0]!;
  const last = keyframes[keyframes.length - 1]!;
  if (time <= first.time) return first.value;
  if (time >= last.time) return last.value;

  const nextIndex = keyframes.findIndex((keyframe) => keyframe.time >= time);
  const next = keyframes[nextIndex]!;
  const previous = keyframes[nextIndex - 1]!;
  return interpolateKeyframes(previous, next, time);
}

export function applyTimelineToProject(project: ProjectDocument): ProjectDocument {
  if (project.scene.timeline.tracks.length === 0) return project;
  const next = structuredClone(project);
  for (const track of next.scene.timeline.tracks) {
    const value = sampleTimelineValue(track, next.scene.timeline.currentTime);
    if (value === null) continue;
    applySampledValue(next, track.targetId, track.property, value);
  }
  return next;
}

export function sampleTimelineParameters(project: ProjectDocument): TimelineParameterOverrides {
  const overrides: TimelineParameterOverrides = {};
  for (const track of project.scene.timeline.tracks) {
    const value = sampleTimelineValue(track, project.scene.timeline.currentTime);
    if (value === null) continue;
    overrides[track.targetId] ??= {};
    overrides[track.targetId]![track.property] = value;
  }
  return overrides;
}

export function validateTimelineTracks(project: ProjectDocument): TimelineValidationIssue[] {
  const issues: TimelineValidationIssue[] = [];
  for (const track of project.scene.timeline.tracks) {
    const target = findTarget(project, track.targetId);
    if (!target) {
      issues.push({
        code: "timeline.targetMissing",
        trackId: track.id,
        message: `Timeline target ${track.targetId} was not found.`
      });
      continue;
    }
    if (!targetHasProperty(target, track.property)) {
      issues.push({
        code: "timeline.propertyMissing",
        trackId: track.id,
        message: `Timeline property ${track.property} does not exist on ${track.targetId}.`
      });
    }
    if (track.keyframes.some((keyframe) => typeof keyframe.value !== "number")) {
      issues.push({
        code: "timeline.unsupportedValue",
        trackId: track.id,
        message: `Timeline track ${track.id} currently supports numeric proof values only.`
      });
    }
  }
  return issues;
}

function interpolateKeyframes(previous: Keyframe, next: Keyframe, time: number): ParameterValue {
  if (typeof previous.value !== "number" || typeof next.value !== "number") {
    return time < next.time ? previous.value : next.value;
  }
  const span = Math.max(next.time - previous.time, 0.0001);
  const t = Math.min(1, Math.max(0, (time - previous.time) / span));
  return previous.value + (next.value - previous.value) * t;
}

function applySampledValue(project: ProjectDocument, targetId: string, property: string, value: ParameterValue): void {
  const target = findTarget(project, targetId);
  if (!target || !targetHasProperty(target, property)) return;
  if (hasParameterBag(target)) {
    target.parameters[property] = value;
  } else {
    (target as unknown as Record<string, ParameterValue>)[property] = value;
  }
}

function findTarget(project: ProjectDocument, targetId: string): EffectInstance | SceneSource | Record<string, unknown> | null {
  for (const layer of project.scene.layers) {
    const effect = layer.effects.find((item) => item.id === targetId);
    if (effect) return effect;
    if (layer.id === targetId) return layer as unknown as Record<string, unknown>;
  }
  return project.scene.sources.find((source) => source.id === targetId) ?? null;
}

function targetHasProperty(target: EffectInstance | SceneSource | Record<string, unknown>, property: string): boolean {
  if (hasParameterBag(target)) {
    return property in target.parameters;
  }
  return property in target;
}

function hasParameterBag(target: EffectInstance | SceneSource | Record<string, unknown>): target is EffectInstance | SceneSource {
  return "parameters" in target && typeof target.parameters === "object" && target.parameters !== null;
}

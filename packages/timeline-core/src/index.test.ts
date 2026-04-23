import { describe, expect, it } from "vitest";
import { advanceTimeline, applyTimelineToProject, sampleTimelineParameters, sampleTimelineValue, timelineMarkers, validateTimelineTracks } from "./index";
import type { TimelineState } from "@unicorn/schemas";

describe("timeline-core", () => {
  it("advances playing timelines and wraps by duration", () => {
    const timeline: TimelineState = {
      playing: true,
      currentTime: 1.1,
      duration: 1.2,
      tracks: []
    };

    expect(advanceTimeline(timeline, 0.2).currentTime).toBeCloseTo(0.1);
  });

  it("creates fixed timeline markers", () => {
    expect(timelineMarkers(0.3)).toEqual(["0.00", "0.10", "0.20", "0.30"]);
  });

  it("samples numeric keyframes linearly", () => {
    expect(
      sampleTimelineValue(
        {
          id: "track",
          targetId: "effect",
          property: "strength",
          keyframes: [
            { id: "a", time: 0, value: 0, easing: "linear" },
            { id: "b", time: 1, value: 1, easing: "linear" }
          ]
        },
        0.5
      )
    ).toBe(0.5);
  });

  it("applies sampled effect parameters to a project clone", () => {
    const project = fixtureProject();

    const sampled = applyTimelineToProject(project);

    expect(sampled.scene.layers[0]?.effects[0]?.parameters.strength).toBe(0.5);
    expect(project.scene.layers[0]?.effects[0]?.parameters.strength).toBe(0);
    expect(sampled.scene.renderGraph.revision).toBe(project.scene.renderGraph.revision);
  });

  it("samples parameter overrides without cloning graph identity", () => {
    const project = fixtureProject();

    expect(sampleTimelineParameters(project)).toEqual({
      effect: {
        strength: 0.5
      }
    });
  });

  it("validates missing timeline targets and properties", () => {
    const project = fixtureProject();

    project.scene.timeline.tracks = [
      { id: "missing-target", targetId: "missing", property: "strength", keyframes: [] },
      { id: "missing-property", targetId: "effect", property: "missing", keyframes: [] }
    ];

    expect(validateTimelineTracks(project).map((issue) => issue.code)).toEqual(["timeline.targetMissing", "timeline.propertyMissing"]);
  });
});

function fixtureProject() {
  return {
    schemaVersion: "0.1.0" as const,
    project: { id: "p", name: "p", createdAt: "", updatedAt: "" },
    scene: {
      canvas: { name: "Desktop", breakpoint: "desktop" as const, width: 1, height: 1, zoom: 1 },
      layers: [
        {
          id: "layer",
          kind: "background" as const,
          name: "Background",
          visible: true,
          locked: false,
          order: 0,
          transform: { x: 0, y: 0, width: 1, height: 1, rotation: 0, opacity: 1, anchor: "center" as const },
          effects: [{ id: "effect", effectId: "distort.mouseTrail", enabled: true, order: 0, parameters: { strength: 0 } }],
          color: "#000"
        }
      ],
      assets: [],
      sources: [],
      events: [],
      renderGraph: { revision: 0, nodes: [] },
      exportSettings: { target: "project-json" as const, includeRuntime: true, includeFallback: true },
      timeline: {
        playing: true,
        currentTime: 0.5,
        duration: 1,
        tracks: [
          {
            id: "track",
            targetId: "effect",
            property: "strength",
            keyframes: [
              { id: "a", time: 0, value: 0, easing: "linear" as const },
              { id: "b", time: 1, value: 1, easing: "linear" as const }
            ]
          }
        ]
      }
    }
  };
}

import { describe, expect, it } from "vitest";
import { createEmptyRenderGraph, migrateProject, validateProject, type ProjectDocument } from "./index";

describe("validateProject", () => {
  it("accepts a minimal project", () => {
    const project: ProjectDocument = {
      schemaVersion: "0.1.0",
      project: {
        id: "project-1",
        name: "Untitled project",
        createdAt: "2026-04-23T00:00:00Z",
        updatedAt: "2026-04-23T00:00:00Z"
      },
      scene: {
        canvas: {
          name: "Desktop",
          breakpoint: "desktop",
          width: 1440,
          height: 900,
          zoom: 0.66
        },
        assets: [],
        sources: [],
        events: [],
        renderGraph: createEmptyRenderGraph(),
        exportSettings: {
          target: "project-json",
          includeRuntime: true,
          includeFallback: true
        },
        timeline: {
          playing: false,
          currentTime: 0,
          duration: 1.2,
          tracks: []
        },
        layers: []
      }
    };

    expect(validateProject(project)).toEqual([]);
    expect(migrateProject(project)).toEqual(project);
  });
});

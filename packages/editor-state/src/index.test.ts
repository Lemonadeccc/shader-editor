import { describe, expect, it } from "vitest";
import { applyOperation, createInitialProject, replayOperations } from "./index";

describe("applyOperation", () => {
  it("updates text through a structured operation", () => {
    const project = createInitialProject();
    const result = applyOperation(project, {
      type: "setParameter",
      targetId: "layer-text",
      key: "text",
      value: "Hello"
    });

    expect(result.ok).toBe(true);
    expect(result.project).not.toBe(project);
    expect(result.project.scene.layers.find((layer) => layer.id === "layer-text")).toMatchObject({
      text: "Hello"
    });
  });

  it("does not mutate on invalid operations", () => {
    const project = createInitialProject();
    const result = applyOperation(project, {
      type: "setParameter",
      targetId: "missing",
      key: "text",
      value: "Hello"
    });

    expect(result.ok).toBe(false);
    expect(result.project).toBe(project);
  });

  it("replays operations deterministically", () => {
    const project = createInitialProject();
    const result = replayOperations(project, [
      { type: "setParameter", targetId: "layer-text", key: "text", value: "Replay" },
      { type: "setExportTarget", target: "glsl-pass" }
    ]);

    expect(result.ok).toBe(true);
    expect(JSON.stringify(result.project)).toContain("Replay");
    expect(result.project.scene.exportSettings.target).toBe("glsl-pass");
  });

  it("rejects invalid event bindings without mutation", () => {
    const project = createInitialProject();
    const result = applyOperation(project, {
      type: "bindEvent",
      event: {
        id: "event-invalid",
        trigger: "hover",
        targetId: "missing-target",
        targetProperty: "opacity",
        enabled: true,
        delay: 0,
        duration: 0.4,
        easing: "easeOut"
      }
    });

    expect(result.ok).toBe(false);
    expect(result.project).toBe(project);
    expect(project.scene.events).toEqual([]);
  });

  it("rejects unknown layer parameter keys", () => {
    const project = createInitialProject();
    const result = applyOperation(project, {
      type: "setParameter",
      targetId: "layer-text",
      key: "unsafeField",
      value: "bad-field"
    });

    expect(result.ok).toBe(false);
    expect(result.project).toBe(project);
    expect("unsafeField" in project.scene.layers.find((layer) => layer.id === "layer-text")!).toBe(false);
  });
});

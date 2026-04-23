import { describe, expect, it } from "vitest";
import { createInitialProject } from "@unicorn/editor-state";
import { deriveRenderGraph } from "@unicorn/renderer-core";
import { exportProject } from "./index";

describe("exportProject", () => {
  it("exports validated project json", () => {
    const project = createInitialProject();
    const result = exportProject("project-json", project, deriveRenderGraph(project, "glsl-es-300"));

    expect(result.ok).toBe(true);
    expect(result.files[0]?.path).toBe("project.json");
  });

  it("keeps TSL export as a structured unsupported target", () => {
    const project = createInitialProject();
    const result = exportProject("tsl-three", project, deriveRenderGraph(project, "glsl-es-300"));

    expect(result.ok).toBe(false);
    expect(result.unsupportedFeatures).toContain("three-tsl-integration");
  });

  it("exports loadable WebGL runtime files", async () => {
    const project = createInitialProject();
    const result = exportProject("webgl-runtime", project, deriveRenderGraph(project, "glsl-es-300"));
    const runtime = result.files.find((file) => file.path === "runtime-webgl.js");

    expect(result.ok).toBe(true);
    expect(result.files.map((file) => file.path)).toEqual(["index.html", "runtime-webgl.js", "manifest.json"]);
    expect(runtime?.contents).toContain("export const project");
    expect(runtime?.contents).toContain("webgl2");
  });

  it("exports GLSL pass files with parameter manifests", () => {
    const project = createInitialProject();
    const result = exportProject("glsl-pass", project, deriveRenderGraph(project, "glsl-es-300"));

    expect(result.ok).toBe(true);
    expect(result.files.some((file) => file.path.endsWith(".glsl"))).toBe(true);
    expect(result.files.some((file) => file.path.endsWith(".manifest.json"))).toBe(true);
    expect(result.files.find((file) => file.path.includes("effect-mouse-trail") && file.path.endsWith(".manifest.json"))?.contents).toContain("uStrength");
  });

  it("exports a WebGPU smoke runtime", () => {
    const project = createInitialProject();
    const result = exportProject("webgpu-runtime", project, deriveRenderGraph(project, "wgsl"));

    expect(result.ok).toBe(true);
    expect(result.files.map((file) => file.path)).toEqual(["index.html", "runtime-webgpu.js", "manifest.json"]);
    expect(result.files.find((file) => file.path === "runtime-webgpu.js")?.contents).toContain("navigator.gpu");
  });

  it("omits empty WGSL pass sources and reports unsupported passes", () => {
    const project = createInitialProject();
    const result = exportProject("wgsl-pass", project, deriveRenderGraph(project, "wgsl"));
    const wgslFiles = result.files.filter((file) => file.path.endsWith(".wgsl"));

    expect(result.ok).toBe(true);
    expect(wgslFiles.length).toBeGreaterThan(0);
    expect(wgslFiles.every((file) => file.contents.trim().length > 0)).toBe(true);
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "export.passShaderMissing")).toBe(true);
    expect(result.unsupportedFeatures.some((feature) => feature.startsWith("wgsl:"))).toBe(true);
  });
});

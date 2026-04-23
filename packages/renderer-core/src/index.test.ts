import { describe, expect, it } from "vitest";
import type { Layer, ProjectDocument } from "@unicorn/schemas";
import { deriveRenderGraph, selectInputResourceForRole, validateRenderGraphResources, type RenderGraph } from "./index";

describe("deriveRenderGraph", () => {
  it("tracks feedback passes for mouse trail", () => {
    const graph = deriveRenderGraph(projectFixture(), "glsl-es-300");
    const feedbackPass = graph.passes.find((pass) => pass.kind === "feedback");

    expect(graph.feedback.length).toBe(1);
    expect(feedbackPass).toBeDefined();
    expect(feedbackPass?.inputs.map((input) => input.id)).toContain("feedback.effect.read");
    expect(feedbackPass?.outputs.map((output) => output.id)).toContain("feedback.effect.write");
  });

  it("uses scene sources as the authoritative source parameters", () => {
    const project = projectFixture();
    project.scene.sources = [
      {
        id: "source-layer",
        kind: "text",
        layerId: "layer",
        parameters: { text: "From source" }
      }
    ];

    const graph = deriveRenderGraph(project, "glsl-es-300");

    expect(graph.sources[0]?.params).toEqual({ text: "From source" });
  });

  it("derives non-empty WGSL source passes for WebGPU proof execution", () => {
    const graph = deriveRenderGraph(projectFixture(), "wgsl");
    const sourcePass = graph.passes.find((pass) => pass.kind === "source");

    expect(sourcePass?.shader.language).toBe("wgsl");
    expect(sourcePass?.shader.entryPoint).toBe("fsMain");
    expect(sourcePass?.shader.source).toContain("@vertex fn vsMain");
    expect(sourcePass?.shader.source).toContain("@fragment fn fsMain");
  });

  it("reports same-pass read/write hazards", () => {
    const graph = graphFixtureWithHazard();
    const diagnostics = validateRenderGraphResources(graph);

    expect(diagnostics.some((diagnostic) => diagnostic.code === "renderGraph.readWriteHazard")).toBe(true);
  });

  it("reports duplicate pass writes", () => {
    const graph = graphFixtureWithHazard();
    graph.passes[0]!.outputs = [{ id: "a", usage: "write" }];
    graph.passes.push({ ...graph.passes[0]!, id: "pass-2", inputs: [{ id: "a", usage: "read" }], outputs: [{ id: "a", usage: "write" }] });
    graph.output.input = { id: "a", usage: "read" };

    expect(validateRenderGraphResources(graph).some((diagnostic) => diagnostic.code === "renderGraph.duplicateWrite")).toBe(true);
  });

  it("reports unavailable inputs", () => {
    const graph = graphFixtureWithHazard();
    graph.passes[0]!.inputs = [{ id: "missing", usage: "read" }];

    expect(validateRenderGraphResources(graph).some((diagnostic) => diagnostic.code === "renderGraph.inputUnavailable")).toBe(true);
  });

  it("reports unavailable output input", () => {
    const graph = deriveRenderGraph(projectFixture(), "glsl-es-300");
    graph.output.input = { id: "missing-output", usage: "read" };

    expect(validateRenderGraphResources(graph).some((diagnostic) => diagnostic.code === "renderGraph.outputUnavailable")).toBe(true);
  });

  it("rejects reading feedback write handles before swap", () => {
    const graph = deriveRenderGraph(projectFixture(), "glsl-es-300");
    const feedbackPass = graph.passes.find((pass) => pass.kind === "feedback")!;
    feedbackPass.inputs = [{ id: "feedback.effect.write", usage: "read" }];
    const diagnostics = validateRenderGraphResources(graph);

    expect(diagnostics.some((diagnostic) => diagnostic.code === "renderGraph.illegalFeedbackWriteRead")).toBe(true);
    expect(diagnostics.some((diagnostic) => diagnostic.code === "renderGraph.inputUnavailable")).toBe(true);
  });

  it("selects feedback read resources for feedback history", () => {
    const pass = deriveRenderGraph(projectFixture(), "glsl-es-300").passes.find((item) => item.kind === "feedback")!;

    expect(selectInputResourceForRole(pass.inputs, "feedback")?.id).toBe("feedback.effect.read");
    expect(selectInputResourceForRole(pass.inputs, "source")?.id).toBe("layer.layer.color");
  });

  it("accepts the derived graph resource ordering", () => {
    expect(validateRenderGraphResources(deriveRenderGraph(projectFixture(), "glsl-es-300"))).toEqual([]);
  });

  it("derives the Phase 1 proof graph shape", () => {
    const graph = deriveRenderGraph(phase1ProofFixture(), "glsl-es-300");

    expect(graph.sources).toHaveLength(4);
    expect(graph.feedback).toHaveLength(1);
    expect(graph.passes.map((pass) => pass.id)).toEqual([
      "source-pass.layer-background",
      "pass.effect-mondrian",
      "pass.effect-glyph-dither",
      "source-pass.layer-text",
      "pass.effect-mouse-trail",
      "source-pass.layer-model",
      "source-pass.layer-sdf"
    ]);
    expect(validateRenderGraphResources(graph)).toEqual([]);
  });
});

function graphFixtureWithHazard(): RenderGraph {
  return {
    revision: 1,
    sources: [
      {
        id: "source",
        kind: "background",
        sourceRefs: ["layer"],
        outputs: [{ id: "color", usage: "write", format: "rgba8", size: "viewport" }],
        params: {}
      }
    ],
    feedback: [],
    passes: [
      {
        id: "pass",
        kind: "post",
        sourceRefs: ["effect"],
        inputs: [{ id: "color", usage: "read", format: "rgba8", size: "viewport" }],
        outputs: [{ id: "color", usage: "write", format: "rgba8", size: "viewport" }],
        shader: { id: "shader", language: "glsl-es-300", source: "" },
        params: {},
        capabilities: []
      }
    ],
    output: {
      id: "output",
      input: { id: "color", usage: "read", format: "rgba8", size: "viewport" },
      target: "screen"
    }
  };
}

function projectFixture(): ProjectDocument {
  return {
    schemaVersion: "0.1.0",
    project: {
      id: "project",
      name: "Test",
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
      sources: [
        {
          id: "source-layer",
          kind: "text",
          layerId: "layer",
          parameters: { text: "New text" }
        }
      ],
      events: [],
      renderGraph: {
        revision: 1,
        nodes: []
      },
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
      layers: [
        {
          id: "layer",
          kind: "text",
          name: "New text",
          visible: true,
          locked: false,
          order: 0,
          transform: {
            x: 0,
            y: 0,
            width: 400,
            height: 100,
            rotation: 0,
            opacity: 1,
            anchor: "center"
          },
          effects: [
            {
              id: "effect",
              effectId: "distort.mouseTrail",
              parentLayerId: "layer",
              enabled: true,
              order: 0,
              parameters: {}
            }
          ],
          text: "New text",
          fontFamily: "Inter",
          fontStyle: "Regular",
          fontSize: 80,
          lineHeight: 80,
          color: "#ffffff",
          blendMode: "Normal",
          displace: false,
          mask: false
        }
      ]
    }
  };
}

function phase1ProofFixture(): ProjectDocument {
  const base = projectFixture();
  const background: Layer = {
    id: "layer-background",
    kind: "background" as const,
    name: "Background",
    visible: true,
    locked: false,
    order: 0,
    transform: baseTransform(),
    effects: [
      { id: "effect-mondrian", effectId: "generative.mondrian", parentLayerId: "layer-background", enabled: true, order: 0, parameters: { scale: 7, mix: 1 } },
      { id: "effect-glyph-dither", effectId: "post.glyphDither", parentLayerId: "layer-background", enabled: true, order: 1, parameters: { cellSize: 42, mix: 0.85 } }
    ],
    color: "#000000"
  };
  const text: Layer = {
    id: "layer-text",
    kind: "text" as const,
    name: "New text",
    visible: true,
    locked: false,
    order: 1,
    transform: baseTransform(),
    effects: [{ id: "effect-mouse-trail", effectId: "distort.mouseTrail", parentLayerId: "layer-text", enabled: true, order: 0, parameters: { radius: 0.18, strength: 0.55, tail: 0.88 } }],
    text: "New text",
    fontFamily: "Inter",
    fontStyle: "Regular",
    fontSize: 80,
    lineHeight: 80,
    color: "#ffffff",
    blendMode: "Normal",
    displace: false,
    mask: false
  };
  base.scene.layers = [
    background,
    text,
    {
      id: "layer-model",
      kind: "model",
      name: "Model placeholder",
      visible: true,
      locked: false,
      order: 2,
      transform: baseTransform(),
      effects: [],
      source: { placeholder: true }
    },
    {
      id: "layer-sdf",
      kind: "sdf",
      name: "SDF placeholder",
      visible: true,
      locked: false,
      order: 3,
      transform: baseTransform(),
      effects: [],
      source: { placeholder: true }
    }
  ];
  base.scene.sources = [
    { id: "source-background", kind: "background", layerId: "layer-background", parameters: { color: "#000000" } },
    { id: "source-text", kind: "text", layerId: "layer-text", parameters: { text: "New text" } },
    { id: "source-model", kind: "model-placeholder", layerId: "layer-model", parameters: { placeholder: true } },
    { id: "source-sdf", kind: "sdf", layerId: "layer-sdf", parameters: { placeholder: true } }
  ];
  return base;
}

function baseTransform() {
  return {
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    opacity: 1,
    anchor: "center" as const
  };
}

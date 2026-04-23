import { afterEach, describe, expect, it, vi } from "vitest";
import { WebGPURendererBackend } from "./index";
import type { RenderGraph } from "@unicorn/renderer-core";

const originalNavigator = globalThis.navigator;

afterEach(() => {
  Object.defineProperty(globalThis, "navigator", {
    value: originalNavigator,
    configurable: true
  });
});

describe("WebGPURendererBackend", () => {
  it("initializes, compiles, and submits a draw with mocked WebGPU", async () => {
    const submit = vi.fn();
    const end = vi.fn();
    const draw = vi.fn();
    const setPipeline = vi.fn();
    const pipeline = {};
    const device = {
      createShaderModule: vi.fn(() => ({})),
      createRenderPipeline: vi.fn(() => pipeline),
      createCommandEncoder: vi.fn(() => ({
        beginRenderPass: vi.fn(() => ({ setPipeline, draw, end })),
        finish: vi.fn(() => ({}))
      })),
      queue: { submit },
      destroy: vi.fn()
    };
    const gpu = {
      requestAdapter: vi.fn(async () => ({
        requestDevice: vi.fn(async () => device),
        limits: { maxTextureDimension2D: 4096 }
      })),
      getPreferredCanvasFormat: vi.fn(() => "bgra8unorm")
    };
    const canvas = {
      getContext: vi.fn(() => ({
        configure: vi.fn(),
        getCurrentTexture: vi.fn(() => ({ createView: vi.fn(() => ({})) }))
      }))
    };
    Object.defineProperty(globalThis, "navigator", {
      value: { gpu },
      configurable: true
    });

    const backend = new WebGPURendererBackend();
    const capabilities = await backend.initialize(canvas as unknown as HTMLCanvasElement);
    const compiled = await backend.compileGraph(graphFixture());
    const result = await backend.render(compiled, {
      timeSeconds: 0,
      deltaSeconds: 1 / 60,
      pointer: { x: 0.5, y: 0.5, down: false, velocityX: 0, velocityY: 0 },
      viewport: { width: 640, height: 360 },
      devicePixelRatio: 1,
      projectRevision: 1
    });

    expect(capabilities.diagnostics).toEqual([]);
    expect(device.createRenderPipeline).toHaveBeenCalledOnce();
    expect(setPipeline).toHaveBeenCalledWith(pipeline);
    expect(draw).toHaveBeenCalledWith(3);
    expect(end).toHaveBeenCalledOnce();
    expect(submit).toHaveBeenCalledOnce();
    expect(result.ok).toBe(true);
  });

  it("returns structured diagnostics when device configuration fails", async () => {
    Object.defineProperty(globalThis, "navigator", {
      value: {
        gpu: {
          requestAdapter: vi.fn(async () => ({
            requestDevice: vi.fn(async () => {
              throw new Error("requestDevice failed");
            }),
            limits: { maxTextureDimension2D: 4096 }
          })),
          getPreferredCanvasFormat: vi.fn(() => "bgra8unorm")
        }
      },
      configurable: true
    });
    const backend = new WebGPURendererBackend();
    const capabilities = await backend.initialize({ getContext: vi.fn(() => ({ configure: vi.fn() })) } as unknown as HTMLCanvasElement);

    expect(capabilities.diagnostics[0]?.code).toBe("backend.webgpuConfigureFailed");
  });
});

function graphFixture(): RenderGraph {
  return {
    revision: 1,
    sources: [],
    feedback: [],
    passes: [
      {
        id: "source-pass",
        kind: "source",
        sourceRefs: ["layer"],
        inputs: [],
        outputs: [{ id: "color", usage: "write" }],
        shader: {
          id: "source.wgsl",
          language: "wgsl",
          entryPoint: "fsMain",
          source: `
struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};
@vertex fn vsMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOut {
  var positions = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  var out: VertexOut;
  out.position = vec4<f32>(positions[vertexIndex], 0.0, 1.0);
  out.uv = positions[vertexIndex] * 0.5 + vec2<f32>(0.5);
  return out;
}
@fragment fn fsMain(input: VertexOut) -> @location(0) vec4<f32> {
  return vec4<f32>(input.uv, 0.0, 1.0);
}`
        },
        params: {},
        capabilities: []
      }
    ],
    output: {
      id: "output",
      input: { id: "color", usage: "read" },
      target: "screen"
    }
  };
}

import type {
  BackendCapabilities,
  CompiledGraph,
  FrameState,
  RenderGraph,
  RendererBackend,
  RenderResult,
  RenderSize
} from "@unicorn/renderer-core";
import type { Diagnostic } from "@unicorn/schemas";

type NavigatorWithGpu = Navigator & {
  gpu?: GPU;
};

export class WebGPURendererBackend implements RendererBackend {
  readonly id = "webgpu" as const;
  private available = false;
  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private format: GPUTextureFormat = "bgra8unorm";
  private pipeline: GPURenderPipeline | null = null;
  private size: RenderSize = { width: 1, height: 1 };
  private capabilities: BackendCapabilities = {
    backend: "webgpu",
    shaderLanguage: "wgsl",
    supportsFeedback: true,
    supportsCompute: true,
    maxTextureSize: 0,
    diagnostics: []
  };

  async initialize(canvas: HTMLCanvasElement): Promise<BackendCapabilities> {
    const gpu = (globalThis.navigator as NavigatorWithGpu | undefined)?.gpu;
    if (!gpu) {
      this.available = false;
      this.capabilities = {
        ...this.capabilities,
        supportsFeedback: false,
        supportsCompute: false,
        diagnostics: [
          {
            severity: "warning",
            code: "backend.webgpuUnavailable",
            message: "WebGPU is not available; use WebGL2 fallback.",
            backend: "webgpu"
          }
        ]
      };
      return this.capabilities;
    }

    let adapter: GPUAdapter | null = null;
    let context: GPUCanvasContext | null = null;
    try {
      adapter = await gpu.requestAdapter();
      context = canvas.getContext("webgpu") as GPUCanvasContext | null;
    } catch (error) {
      this.available = false;
      this.capabilities = unavailableCapabilities("backend.webgpuAcquireFailed", error instanceof Error ? error.message : "WebGPU adapter/context acquisition failed.");
      return this.capabilities;
    }
    if (!adapter || !context) {
      this.available = false;
      this.capabilities = unavailableCapabilities("backend.webgpuContextUnavailable", "WebGPU adapter or canvas context could not be acquired; use WebGL2 fallback.");
      return this.capabilities;
    }

    try {
      this.device = await adapter.requestDevice();
      this.context = context;
      this.format = gpu.getPreferredCanvasFormat();
      context.configure({
        device: this.device,
        format: this.format,
        alphaMode: "opaque"
      });
    } catch (error) {
      this.available = false;
      this.device = null;
      this.context = null;
      this.capabilities = unavailableCapabilities("backend.webgpuConfigureFailed", error instanceof Error ? error.message : "WebGPU device/context configuration failed.");
      return this.capabilities;
    }
    this.available = true;
    this.capabilities = {
      ...this.capabilities,
      maxTextureSize: adapter.limits.maxTextureDimension2D,
      diagnostics: []
    };
    return this.capabilities;
  }

  getCapabilities(): BackendCapabilities {
    return this.capabilities;
  }

  async compileGraph(graph: RenderGraph): Promise<CompiledGraph> {
    const diagnostics: Diagnostic[] = [...this.capabilities.diagnostics];
    this.pipeline = null;

    for (const pass of graph.passes) {
      if (pass.shader.language !== "wgsl") {
        diagnostics.push({
          severity: "error",
          code: "shader.languageMismatch",
          message: `Pass ${pass.id} is not WGSL.`,
          sourceId: pass.id,
          backend: "webgpu"
        });
      }
      if (pass.shader.language === "wgsl" && pass.shader.source.trim().length === 0) {
        diagnostics.push({
          severity: "warning",
          code: "shader.sourceMissing",
          message: `Pass ${pass.id} has no WGSL source and will be skipped by the proof renderer.`,
          sourceId: pass.id,
          backend: "webgpu"
        });
      }
    }
    const executablePass = graph.passes.find((pass) => pass.shader.language === "wgsl" && pass.shader.source.includes("@vertex") && pass.shader.source.includes("@fragment"));
    if (this.device && executablePass) {
      try {
        const module = this.device.createShaderModule({ code: executablePass.shader.source });
        this.pipeline = this.device.createRenderPipeline({
          layout: "auto",
          vertex: {
            module,
            entryPoint: "vsMain"
          },
          fragment: {
            module,
            entryPoint: executablePass.shader.entryPoint ?? "fsMain",
            targets: [{ format: this.format }]
          },
          primitive: {
            topology: "triangle-list"
          }
        });
      } catch (error) {
        diagnostics.push({
          severity: "error",
          code: "shader.pipelineFailed",
          message: error instanceof Error ? error.message : "Unable to create WebGPU render pipeline.",
          sourceId: executablePass.id,
          backend: "webgpu"
        });
      }
    }

    return {
      backend: "webgpu",
      graphRevision: graph.revision,
      passes: graph.passes.map((pass) => ({
        id: `compiled.${pass.id}`,
        sourcePassId: pass.id,
        kind: pass.kind,
        sourceRefs: pass.sourceRefs,
        params: pass.params,
        resources: [...pass.inputs, ...pass.outputs],
        diagnostics: []
      })),
      diagnostics,
      dispose() {
        // GPUDevice resources will be disposed by the concrete backend.
      }
    };
  }

  async render(compiledGraph: CompiledGraph, frame: FrameState): Promise<RenderResult> {
    const invalidBackend = compiledGraph.backend !== "webgpu";
    const diagnostics: Diagnostic[] = invalidBackend
      ? [
          {
            severity: "error",
            code: "backend.compiledGraphMismatch",
            message: "Compiled graph does not belong to WebGPU backend.",
            backend: "webgpu"
          }
        ]
      : compiledGraph.diagnostics;
    if (!this.device || !this.context || !this.pipeline) {
      return {
        ok: false,
        backend: "webgpu",
        diagnostics: [
          ...diagnostics,
          {
            severity: "warning",
            code: "backend.webgpuPipelineUnavailable",
            message: "WebGPU pipeline is unavailable; use WebGL2 fallback.",
            backend: "webgpu"
          }
        ],
        stats: {
          passCount: compiledGraph.passes.length,
          targetCount: new Set(compiledGraph.passes.flatMap((pass) => pass.resources.map((resource) => resource.id))).size,
          frameMs: frame.deltaSeconds * 1000
        }
      };
    }

    const encoder = this.device.createCommandEncoder();
    const view = this.context.getCurrentTexture().createView();
    const renderPass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: "clear",
          storeOp: "store"
        }
      ]
    });
    renderPass.setPipeline(this.pipeline);
    renderPass.draw(3);
    renderPass.end();
    this.device.queue.submit([encoder.finish()]);

    return {
      ok: this.available && diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
      backend: "webgpu",
      diagnostics,
      stats: {
        passCount: compiledGraph.passes.length,
        targetCount: new Set(compiledGraph.passes.flatMap((pass) => pass.resources.map((resource) => resource.id))).size,
        frameMs: frame.deltaSeconds * 1000
      }
    };
  }

  resize(size: RenderSize): void {
    this.size = size;
  }

  dispose(): void {
    this.pipeline = null;
    this.context = null;
    this.device?.destroy();
    this.device = null;
    this.available = false;
  }
}

function unavailableCapabilities(code: string, message: string): BackendCapabilities {
  return {
    backend: "webgpu",
    shaderLanguage: "wgsl",
    supportsFeedback: false,
    supportsCompute: false,
    maxTextureSize: 0,
    diagnostics: [
      {
        severity: "warning",
        code,
        message,
        backend: "webgpu"
      }
    ]
  };
}

import { getEffectManifest } from "@unicorn/effect-registry";
import type { Diagnostic, ParameterValue, ProjectDocument } from "@unicorn/schemas";

export type RendererBackendId = "webgl2" | "webgpu";
export type ShaderLanguage = "glsl-es-300" | "wgsl";

export interface RenderSize {
  width: number;
  height: number;
}

export interface PointerState {
  x: number;
  y: number;
  down: boolean;
  velocityX: number;
  velocityY: number;
}

export interface FrameState {
  timeSeconds: number;
  deltaSeconds: number;
  pointer: PointerState;
  viewport: RenderSize;
  devicePixelRatio: number;
  projectRevision: number;
  parameterOverrides?: Record<string, Record<string, ParameterValue>>;
}

export interface BackendCapabilities {
  backend: RendererBackendId;
  shaderLanguage: ShaderLanguage;
  supportsFeedback: boolean;
  supportsCompute: boolean;
  maxTextureSize: number;
  diagnostics: Diagnostic[];
}

export interface ResourceRef {
  id: string;
  usage: "read" | "write" | "readwrite";
  format?: "rgba8" | "rgba16float" | "depth";
  size?: "viewport" | "fixed" | "downsampled";
}

export interface ShaderRef {
  id: string;
  language: ShaderLanguage;
  source: string;
  entryPoint?: string;
}

export interface CapabilityRequirement {
  feature: "feedback" | "compute" | "float-texture" | "linear-filter-float";
  required: boolean;
}

export interface SourceNode {
  id: string;
  kind: "background" | "text" | "shape" | "media" | "sdf" | "model-placeholder";
  sourceRefs: string[];
  outputs: ResourceRef[];
  params: Record<string, ParameterValue>;
}

export interface RenderPassNode {
  id: string;
  kind: "source" | "effect" | "feedback" | "post" | "output";
  sourceRefs: string[];
  inputs: ResourceRef[];
  outputs: ResourceRef[];
  shader: ShaderRef;
  params: Record<string, ParameterValue>;
  capabilities: CapabilityRequirement[];
}

export interface FeedbackNode {
  id: string;
  sourceRefs: string[];
  read: ResourceRef;
  write: ResourceRef;
  resetOn: Array<"project-load" | "backend-switch" | "resize" | "graph-incompatible">;
  params: Record<string, ParameterValue>;
}

export interface OutputNode {
  id: string;
  input: ResourceRef;
  target: "screen" | "export";
}

export interface RenderGraph {
  revision: number;
  sources: SourceNode[];
  passes: RenderPassNode[];
  feedback: FeedbackNode[];
  output: OutputNode;
}

export interface CompiledPass {
  id: string;
  sourcePassId: string;
  kind: RenderPassNode["kind"];
  sourceRefs: string[];
  params: Record<string, ParameterValue>;
  resources: ResourceRef[];
  diagnostics: Diagnostic[];
}

export interface CompiledGraph {
  backend: RendererBackendId;
  graphRevision: number;
  passes: CompiledPass[];
  diagnostics: Diagnostic[];
  dispose(): void;
}

export interface RenderResult {
  ok: boolean;
  backend: RendererBackendId;
  diagnostics: Diagnostic[];
  stats: {
    frameMs?: number;
    passCount: number;
    targetCount: number;
  };
}

export interface RendererBackend {
  readonly id: RendererBackendId;
  initialize(canvas: HTMLCanvasElement): Promise<BackendCapabilities>;
  getCapabilities(): BackendCapabilities;
  compileGraph(graph: RenderGraph): Promise<CompiledGraph>;
  render(compiledGraph: CompiledGraph, frame: FrameState): Promise<RenderResult>;
  resize(size: RenderSize): void;
  dispose(): void;
}

const screenResource: ResourceRef = {
  id: "screen",
  usage: "write",
  format: "rgba8",
  size: "viewport"
};

export function deriveRenderGraph(project: ProjectDocument, shaderLanguage: ShaderLanguage): RenderGraph {
  const sources: SourceNode[] = [];
  const passes: RenderPassNode[] = [];
  const feedback: FeedbackNode[] = [];
  const sourcesByLayerId = new Map(project.scene.sources.map((source) => [source.layerId, source]));
  let lastResource: ResourceRef | null = null;

  for (const layer of project.scene.layers.filter((item) => item.visible).sort((a, b) => a.order - b.order)) {
    if (layer.kind === "background" || layer.kind === "text" || layer.kind === "shape" || layer.kind === "model" || layer.kind === "sdf") {
      const output: ResourceRef = {
        id: `layer.${layer.id}.color`,
        usage: "write",
        format: "rgba8",
        size: "viewport"
      };
      const sceneSource = sourcesByLayerId.get(layer.id);
      sources.push({
        id: sceneSource?.id ?? `source.${layer.id}`,
        kind: sceneSource?.kind ?? (layer.kind === "model" ? "model-placeholder" : layer.kind),
        sourceRefs: [layer.id],
        outputs: [output],
        params: sceneSource?.parameters ?? {}
      });
      passes.push({
        id: `source-pass.${layer.id}`,
        kind: "source",
        sourceRefs: [layer.id],
        inputs: lastResource ? [lastResource] : [],
        outputs: [output],
        shader: {
          id: `source.${layer.kind}.${shaderLanguage}`,
          language: shaderLanguage,
          source: shaderLanguage === "glsl-es-300" ? sourcePassGlsl(sceneSource?.kind ?? (layer.kind === "model" ? "model-placeholder" : layer.kind)) : sourcePassWgsl(sceneSource?.kind ?? (layer.kind === "model" ? "model-placeholder" : layer.kind)),
          entryPoint: shaderLanguage === "wgsl" ? "fsMain" : undefined
        },
        params: sceneSource?.parameters ?? {},
        capabilities: []
      });
      lastResource = { ...output, usage: "read" };
    }

    for (const effect of layer.effects.filter((item) => item.enabled).sort((a, b) => a.order - b.order)) {
      const manifest = getEffectManifest(effect.effectId);
      const output: ResourceRef = {
        id: `effect.${effect.id}.color`,
        usage: "write",
        format: "rgba8",
        size: "viewport"
      };
      const passKind = manifest?.capabilities.includes("feedback") ? "feedback" : "post";
      const inputResource = lastResource ?? outputResource;

      if (passKind === "feedback") {
        const read: ResourceRef = {
          id: `feedback.${effect.id}.read`,
          usage: "read",
          format: "rgba8",
          size: "viewport"
        };
        const write: ResourceRef = {
          id: `feedback.${effect.id}.write`,
          usage: "write",
          format: "rgba8",
          size: "viewport"
        };
        feedback.push({
          id: `feedback.${effect.id}`,
          sourceRefs: [layer.id, effect.id],
          read,
          write,
          resetOn: ["project-load", "backend-switch", "resize", "graph-incompatible"],
          params: effect.parameters
        });
      }

      passes.push({
        id: `pass.${effect.id}`,
        kind: passKind,
        sourceRefs: [layer.id, effect.id],
        inputs: passKind === "feedback" ? [inputResource, { id: `feedback.${effect.id}.read`, usage: "read", format: "rgba8", size: "viewport" }] : [inputResource],
        outputs: passKind === "feedback" ? [output, { id: `feedback.${effect.id}.write`, usage: "write", format: "rgba8", size: "viewport" }] : [output],
        shader: {
          id: `${effect.effectId}.${shaderLanguage}`,
          language: shaderLanguage,
          source: shaderLanguage === "wgsl" ? (manifest?.shaders.wgsl ?? "") : (manifest?.shaders.glsl ?? "")
        },
        params: effect.parameters,
        capabilities: manifest?.capabilities.map((capability) => ({
          feature: capability === "feedback" ? "feedback" : "compute",
          required: capability === "feedback"
        })) ?? []
      });

      lastResource = { ...output, usage: "read" };
    }
  }

  return {
    revision: project.scene.renderGraph.revision,
    sources,
    passes,
    feedback,
    output: {
      id: "output.screen",
      input: lastResource ?? outputResource,
      target: "screen"
    }
  };
}

function sourcePassGlsl(kind: SourceNode["kind"]): string {
  if (kind === "background") return backgroundSourceGlsl;
  if (kind === "text") return textSourceGlsl;
  if (kind === "sdf") return sdfSourceGlsl;
  if (kind === "model-placeholder") return modelSourceGlsl;
  return passthroughSourceGlsl;
}

const commonSourceHeader = `#version 300 es
precision highp float;
uniform sampler2D uTexture;
uniform float uTime;
uniform vec2 uResolution;
in vec2 vUv;
out vec4 outColor;
float box(vec2 p, vec2 b) {
  vec2 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
}
`;

const backgroundSourceGlsl = `${commonSourceHeader}
void main() {
  vec2 uv = vUv;
  vec3 color = vec3(0.0);
  float vignette = smoothstep(0.82, 0.2, distance(uv, vec2(0.5)));
  color += vec3(0.015, 0.012, 0.02) * vignette;
  outColor = vec4(color, 1.0);
}`;

const textSourceGlsl = `${commonSourceHeader}
void main() {
  vec3 color = texture(uTexture, vUv).rgb;
  float d = box(vUv - vec2(0.5, 0.50), vec2(0.18, 0.035));
  float fill = smoothstep(0.012, 0.0, d);
  color = mix(color, vec3(0.58), fill * 0.5);
  outColor = vec4(color, 1.0);
}`;

const modelSourceGlsl = `${commonSourceHeader}
void main() {
  vec3 color = texture(uTexture, vUv).rgb;
  vec2 p = vUv - vec2(0.24, 0.72);
  float d = abs(length(p) - 0.052) - 0.012;
  float shell = smoothstep(0.018, 0.0, d);
  color = mix(color, vec3(0.40, 0.40, 0.46), shell * 0.8);
  outColor = vec4(color, 1.0);
}`;

const sdfSourceGlsl = `${commonSourceHeader}
void main() {
  vec3 color = texture(uTexture, vUv).rgb;
  vec2 p = abs(vUv - vec2(0.72, 0.30));
  float d = max(p.x * 0.866 + p.y * 0.5, p.y) - 0.07;
  float shape = smoothstep(0.02, 0.0, d);
  color = mix(color, vec3(0.64, 0.64, 0.68), shape * 0.75);
  outColor = vec4(color, 1.0);
}`;

const passthroughSourceGlsl = `${commonSourceHeader}
void main() {
  outColor = texture(uTexture, vUv);
}`;

function sourcePassWgsl(kind: SourceNode["kind"]): string {
  const tint =
    kind === "model-placeholder"
      ? "vec3<f32>(0.36, 0.36, 0.45)"
      : kind === "sdf"
        ? "vec3<f32>(0.55, 0.55, 0.60)"
        : kind === "text"
          ? "vec3<f32>(0.55, 0.55, 0.55)"
          : "vec3<f32>(0.02, 0.018, 0.028)";
  return `
struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex fn vsMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOut {
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0)
  );
  var out: VertexOut;
  out.position = vec4<f32>(positions[vertexIndex], 0.0, 1.0);
  out.uv = positions[vertexIndex] * 0.5 + vec2<f32>(0.5);
  return out;
}

@fragment fn fsMain(input: VertexOut) -> @location(0) vec4<f32> {
  let d = distance(input.uv, vec2<f32>(0.5, 0.5));
  let vignette = smoothstep(0.85, 0.2, d);
  return vec4<f32>(${tint} * vignette, 1.0);
}`;
}

export function createFrameState(project: ProjectDocument, timeSeconds: number, pointer: PointerState): FrameState {
  return {
    timeSeconds,
    deltaSeconds: 0,
    pointer,
    viewport: {
      width: project.scene.canvas.width,
      height: project.scene.canvas.height
    },
    devicePixelRatio: 1,
    projectRevision: project.scene.renderGraph.revision
  };
}

export function diagnosticsHaveErrors(diagnostics: Diagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error");
}

export function validateRenderGraphResources(graph: RenderGraph): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const readable = new Set<string>();
  const passWriters = new Map<string, string>();

  for (const source of graph.sources) {
    for (const output of source.outputs) readable.add(output.id);
  }
  for (const feedback of graph.feedback) {
    readable.add(feedback.read.id);
  }

  for (const pass of graph.passes) {
    const inputIds = new Set(pass.inputs.map((input) => input.id));
    for (const output of pass.outputs) {
      if (inputIds.has(output.id)) {
        diagnostics.push({
          severity: "error",
          code: "renderGraph.readWriteHazard",
          message: `Pass ${pass.id} reads and writes ${output.id} in the same step.`,
          sourceId: pass.id
        });
      }
      const priorWriter = passWriters.get(output.id);
      if (priorWriter) {
        diagnostics.push({
          severity: "error",
          code: "renderGraph.duplicateWrite",
          message: `Pass ${pass.id} and ${priorWriter} both write ${output.id}.`,
          sourceId: pass.id
        });
      }
      passWriters.set(output.id, pass.id);
    }

    for (const input of pass.inputs) {
      if (input.id.startsWith("feedback.") && input.id.endsWith(".write")) {
        diagnostics.push({
          severity: "error",
          code: "renderGraph.illegalFeedbackWriteRead",
          message: `Pass ${pass.id} reads feedback write handle ${input.id}.`,
          sourceId: pass.id
        });
      }
      if (!readable.has(input.id)) {
        diagnostics.push({
          severity: "error",
          code: "renderGraph.inputUnavailable",
          message: `Pass ${pass.id} reads ${input.id} before any source, feedback, or pass writes it.`,
          sourceId: pass.id
        });
      }
    }

    for (const output of pass.outputs) readable.add(output.id);
  }

  if (!readable.has(graph.output.input.id)) {
    diagnostics.push({
      severity: "error",
      code: "renderGraph.outputUnavailable",
      message: `Output reads ${graph.output.input.id}, but no node writes it.`,
      sourceId: graph.output.id
    });
  }

  return diagnostics;
}

export function selectInputResourceForRole(resources: ResourceRef[], role: "source" | "feedback"): ResourceRef | null {
  const inputs = resources.filter((resource) => resource.usage === "read" || resource.usage === "readwrite");
  return (
    (role === "feedback"
      ? inputs.find((resource) => resource.id.startsWith("feedback.") && resource.id.endsWith(".read"))
      : inputs.find((resource) => !(resource.id.startsWith("feedback.") && resource.id.endsWith(".read")))) ?? null
  );
}

export const emptyPointer: PointerState = {
  x: 0.5,
  y: 0.5,
  down: false,
  velocityX: 0,
  velocityY: 0
};

export const outputResource = screenResource;

export function applyParameterOverridesToGraph(
  graph: RenderGraph,
  overrides: Record<string, Record<string, ParameterValue>>
): RenderGraph {
  if (Object.keys(overrides).length === 0) return graph;
  return {
    ...graph,
    passes: graph.passes.map((pass) => {
      const nextParams = pass.sourceRefs.reduce<Record<string, ParameterValue>>((params, sourceRef) => ({ ...params, ...overrides[sourceRef] }), pass.params);
      return nextParams === pass.params ? pass : { ...pass, params: nextParams };
    })
  };
}

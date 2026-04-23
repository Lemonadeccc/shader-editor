import type {
  BackendCapabilities,
  CompiledPass,
  CompiledGraph,
  FrameState,
  RenderGraph,
  RendererBackend,
  RenderResult,
  RenderSize,
  ResourceRef
} from "@unicorn/renderer-core";
import { selectInputResourceForRole, validateRenderGraphResources } from "@unicorn/renderer-core";
import type { Diagnostic } from "@unicorn/schemas";

interface RenderTarget {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  width: number;
  height: number;
}

export class WebGL2RendererBackend implements RendererBackend {
  readonly id = "webgl2" as const;
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private copyProgram: WebGLProgram | null = null;
  private passPrograms = new Map<string, WebGLProgram>();
  private targets = new Map<string, RenderTarget>();
  private previousTexture: WebGLTexture | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private size: RenderSize = { width: 1, height: 1 };
  private capabilities: BackendCapabilities = {
    backend: "webgl2",
    shaderLanguage: "glsl-es-300",
    supportsFeedback: true,
    supportsCompute: false,
    maxTextureSize: 0,
    diagnostics: []
  };

  async initialize(canvas: HTMLCanvasElement): Promise<BackendCapabilities> {
    const gl = canvas.getContext("webgl2", { antialias: true, alpha: false });
    if (!gl) {
      this.capabilities = {
        ...this.capabilities,
        supportsFeedback: false,
        diagnostics: [
          {
            severity: "error",
            code: "backend.webgl2Unavailable",
            message: "WebGL2 is not available in this browser.",
            backend: "webgl2"
          }
        ]
      };
      return this.capabilities;
    }

    this.gl = gl;
    this.program = createProgram(gl);
    this.copyProgram = createProgram(gl, copyFragmentSource);
    this.vao = createFullscreenTriangle(gl, this.program);
    this.previousTexture = createSinglePixelTexture(gl);
    this.capabilities = {
      ...this.capabilities,
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
      diagnostics: []
    };
    return this.capabilities;
  }

  getCapabilities(): BackendCapabilities {
    return this.capabilities;
  }

  async compileGraph(graph: RenderGraph): Promise<CompiledGraph> {
    const diagnostics: Diagnostic[] = validateRenderGraphResources(graph);
    if (!this.gl) {
      return {
        backend: "webgl2",
        graphRevision: graph.revision,
        passes: [],
        diagnostics: [
          {
            severity: "error",
            code: "backend.notInitialized",
            message: "WebGL2 backend must be initialized before compiling a graph.",
            backend: "webgl2"
          }
        ],
        dispose() {}
      };
    }
    this.disposePassPrograms();

    for (const pass of graph.passes) {
      if (pass.shader.language !== "glsl-es-300") {
        diagnostics.push({
          severity: "error",
          code: "shader.languageMismatch",
          message: `Pass ${pass.id} is not GLSL ES.`,
          sourceId: pass.id,
          backend: "webgl2"
        });
      }
      if (pass.kind === "feedback" && !this.capabilities.supportsFeedback) {
        diagnostics.push({
          severity: "error",
          code: "backend.feedbackUnsupported",
          message: `Pass ${pass.id} requires feedback but backend does not support it.`,
          sourceId: pass.id,
          backend: "webgl2"
        });
      }
      if (pass.shader.language === "glsl-es-300" && pass.shader.source.trim()) {
        try {
          this.passPrograms.set(`compiled.${pass.id}`, createProgram(this.gl, pass.shader.source));
        } catch (error) {
          diagnostics.push({
            severity: "error",
            code: "shader.compileFailed",
            message: error instanceof Error ? error.message : `Unable to compile ${pass.id}.`,
            sourceId: pass.id,
            backend: "webgl2"
          });
        }
      }
    }

    return {
      backend: "webgl2",
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
        // Backend-owned GPU resources are released by the backend implementation.
      }
    };
  }

  async render(compiledGraph: CompiledGraph, frame: FrameState): Promise<RenderResult> {
    if (!this.gl || compiledGraph.backend !== "webgl2") {
      return {
        ok: false,
        backend: "webgl2",
        diagnostics: [
          {
            severity: "error",
            code: "backend.notInitialized",
            message: "WebGL2 backend is not initialized or compiled graph belongs to another backend.",
            backend: "webgl2"
          }
        ],
        stats: { passCount: 0, targetCount: 0 }
      };
    }

    this.gl.viewport(0, 0, this.size.width, this.size.height);
    this.gl.clearColor(0, 0, 0, 1);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);

    let lastTexture: WebGLTexture | null = null;
    if (compiledGraph.passes.length === 0) {
      this.drawProgram(this.program, frame, this.previousTexture, this.previousTexture, compiledGraph.passes.length, {});
    }

    for (const pass of compiledGraph.passes) {
      const program = this.passPrograms.get(pass.id) ?? this.program;
      const outputResource = pass.resources.find((resource) => resource.usage !== "read");
      const outputTarget = outputResource ? this.ensureTarget(outputResource) : null;
      const inputTexture = this.findInputTexture(pass, "source") ?? this.previousTexture;
      const feedbackTexture = pass.kind === "feedback" ? (this.findInputTexture(pass, "feedback") ?? inputTexture) : inputTexture;

      this.bindTarget(outputTarget);
      this.drawProgram(program, frame, inputTexture, feedbackTexture, compiledGraph.passes.length, paramsForPass(pass, frame));
      lastTexture = outputTarget?.texture ?? inputTexture;

      if (pass.kind === "feedback" && outputTarget) {
        this.updateFeedbackTarget(pass, outputTarget.texture, frame, compiledGraph.passes.length);
      }
    }

    this.bindTarget(null);
    if (lastTexture) {
      this.drawCopy(lastTexture, frame);
    }

    return {
      ok: compiledGraph.diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
      backend: "webgl2",
      diagnostics: compiledGraph.diagnostics,
      stats: {
        passCount: compiledGraph.passes.length,
        targetCount: this.targets.size,
        frameMs: frame.deltaSeconds * 1000
      }
    };
  }

  resize(size: RenderSize): void {
    this.size = size;
    this.disposeTargets();
  }

  dispose(): void {
    this.disposePassPrograms();
    this.disposeTargets();
    if (this.gl && this.program) this.gl.deleteProgram(this.program);
    if (this.gl && this.copyProgram) this.gl.deleteProgram(this.copyProgram);
    if (this.gl && this.vao) this.gl.deleteVertexArray(this.vao);
    if (this.gl && this.previousTexture) this.gl.deleteTexture(this.previousTexture);
    this.program = null;
    this.copyProgram = null;
    this.previousTexture = null;
    this.vao = null;
    this.gl = null;
  }

  private bindTarget(target: RenderTarget | null): void {
    if (!this.gl) return;
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, target?.framebuffer ?? null);
    this.gl.viewport(0, 0, this.size.width, this.size.height);
  }

  private drawProgram(
    program: WebGLProgram | null,
    frame: FrameState,
    inputTexture: WebGLTexture | null,
    previousTexture: WebGLTexture | null,
    passCount: number,
    params: Record<string, unknown>
  ): void {
    if (!this.gl || !program || !this.vao) return;
    this.gl.useProgram(program);
    this.gl.bindVertexArray(this.vao);
    if (previousTexture) {
      this.gl.activeTexture(this.gl.TEXTURE0);
      this.gl.bindTexture(this.gl.TEXTURE_2D, previousTexture);
      setUniform1i(this.gl, program, "uPrevious", 0);
    }
    if (inputTexture) {
      this.gl.activeTexture(this.gl.TEXTURE1);
      this.gl.bindTexture(this.gl.TEXTURE_2D, inputTexture);
      setUniform1i(this.gl, program, "uTexture", 1);
    }
    setUniform1f(this.gl, program, "uTime", frame.timeSeconds);
    setUniform2f(this.gl, program, "uPointer", frame.pointer.x, frame.pointer.y);
    setUniform2f(this.gl, program, "uVelocity", frame.pointer.velocityX, frame.pointer.velocityY);
    setUniform2f(this.gl, program, "uResolution", this.size.width, this.size.height);
    setUniform1f(this.gl, program, "uPassCount", passCount);
    setUniform1f(this.gl, program, "uRadius", numberParam(params, "radius", 0.18));
    setUniform1f(this.gl, program, "uStrength", numberParam(params, "strength", 0.55));
    setUniform1f(this.gl, program, "uTail", numberParam(params, "tail", 0.88));
    setUniform1f(this.gl, program, "uHardness", numberParam(params, "hardness", 0.15));
    setUniform1f(this.gl, program, "uChromaticAberration", numberParam(params, "chromaticAberration", 0.25));
    setUniform1f(this.gl, program, "uScale", numberParam(params, "scale", 7));
    setUniform1f(this.gl, program, "uMix", numberParam(params, "mix", 1));
    setUniform1f(this.gl, program, "uCellSize", numberParam(params, "cellSize", 42));
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
    this.gl.bindVertexArray(null);
  }

  private drawCopy(texture: WebGLTexture, frame: FrameState): void {
    this.drawProgram(this.copyProgram, frame, texture, texture, 1, {});
  }

  private findInputTexture(pass: CompiledPass, role: "source" | "feedback"): WebGLTexture | null {
    const inputs = pass.resources.filter((resource) => resource.usage === "read" || resource.usage === "readwrite");
    const input = selectInputResourceForRole(inputs, role);
    if (!input) return null;
    return this.targets.get(input.id)?.texture ?? null;
  }

  private updateFeedbackTarget(pass: CompiledPass, sourceTexture: WebGLTexture, frame: FrameState, passCount: number): void {
    const read = pass.resources.find((resource) => resource.usage === "read" && resource.id.startsWith("feedback."));
    const write = pass.resources.find((resource) => resource.usage === "write" && resource.id.startsWith("feedback."));
    if (!read || !write) return;
    const writeTarget = this.ensureTarget(write);
    this.bindTarget(writeTarget);
    this.drawCopy(sourceTexture, frame);
    this.bindTarget(null);
    const readTarget = this.ensureTarget(read);
    this.targets.set(read.id, writeTarget);
    this.targets.set(write.id, readTarget);
    void passCount;
  }

  private ensureTarget(resource: ResourceRef): RenderTarget {
    if (!this.gl) throw new Error("WebGL2 backend is not initialized.");
    const existing = this.targets.get(resource.id);
    if (existing && existing.width === this.size.width && existing.height === this.size.height) return existing;
    if (existing) this.deleteTarget(existing);
    const target = createRenderTarget(this.gl, this.size);
    this.targets.set(resource.id, target);
    return target;
  }

  private disposePassPrograms(): void {
    if (!this.gl) {
      this.passPrograms.clear();
      return;
    }
    for (const program of this.passPrograms.values()) this.gl.deleteProgram(program);
    this.passPrograms.clear();
  }

  private disposeTargets(): void {
    if (!this.gl) {
      this.targets.clear();
      return;
    }
    for (const target of this.targets.values()) this.deleteTarget(target);
    this.targets.clear();
  }

  private deleteTarget(target: RenderTarget): void {
    if (!this.gl) return;
    this.gl.deleteTexture(target.texture);
    this.gl.deleteFramebuffer(target.framebuffer);
  }
}

function createRenderTarget(gl: WebGL2RenderingContext, size: RenderSize): RenderTarget {
  const texture = gl.createTexture();
  const framebuffer = gl.createFramebuffer();
  if (!texture || !framebuffer) throw new Error("Unable to create WebGL2 render target.");
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size.width, size.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return {
    texture,
    framebuffer,
    width: size.width,
    height: size.height
  };
}

function createFullscreenTriangle(gl: WebGL2RenderingContext, program: WebGLProgram): WebGLVertexArrayObject {
  const vao = gl.createVertexArray();
  const buffer = gl.createBuffer();
  const location = gl.getAttribLocation(program, "aPosition");
  if (!vao || !buffer || location < 0) throw new Error("Unable to create WebGL2 fullscreen triangle.");
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return vao;
}

function createProgram(gl: WebGL2RenderingContext, fragmentSource = defaultFragmentSource): WebGLProgram {
  const vertex = compileShader(
    gl,
    gl.VERTEX_SHADER,
    `#version 300 es
    in vec2 aPosition;
    out vec2 vUv;
    void main() {
      vUv = aPosition * 0.5 + 0.5;
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }`
  );
  const fragment = compileShader(
    gl,
    gl.FRAGMENT_SHADER,
    fragmentSource
  );
  const program = gl.createProgram();
  if (!program) throw new Error("Unable to create WebGL2 program.");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.bindAttribLocation(program, 0, "aPosition");
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? "Unable to link WebGL2 program.");
  }
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  return program;
}

const defaultFragmentSource = `#version 300 es
precision highp float;
uniform float uTime;
uniform float uPassCount;
uniform vec2 uPointer;
uniform vec2 uResolution;
in vec2 vUv;
out vec4 outColor;
float box(vec2 p, vec2 b) {
  vec2 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
}
void main() {
  vec2 uv = vUv;
  vec3 color = vec3(0.0);
  float trail = smoothstep(0.22, 0.0, distance(uv, uPointer));
  color += vec3(0.28, 0.22, 0.44) * trail;
  float bands = 0.0;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    vec2 center = vec2(fract(fi * 0.27 + 0.1), fract(fi * 0.19 + 0.28));
    float d = box(uv - center, vec2(0.08 + 0.05 * fract(fi * 0.37), 0.018 + 0.02 * fract(fi * 0.23)));
    bands += smoothstep(0.015, 0.0, d);
  }
  color += vec3(0.55 + 0.08 * sin(uTime), 0.55, 0.55) * bands * (0.35 + 0.08 * uPassCount);
  outColor = vec4(color, 1.0);
}`;

const copyFragmentSource = `#version 300 es
precision highp float;
uniform sampler2D uTexture;
in vec2 vUv;
out vec4 outColor;
void main() {
  outColor = texture(uTexture, vUv);
}`;

function createSinglePixelTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) throw new Error("Unable to create WebGL2 texture.");
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
  return texture;
}

function setUniform1f(gl: WebGL2RenderingContext, program: WebGLProgram, name: string, value: number): void {
  const location = gl.getUniformLocation(program, name);
  if (location) gl.uniform1f(location, value);
}

function setUniform1i(gl: WebGL2RenderingContext, program: WebGLProgram, name: string, value: number): void {
  const location = gl.getUniformLocation(program, name);
  if (location) gl.uniform1i(location, value);
}

function setUniform2f(gl: WebGL2RenderingContext, program: WebGLProgram, name: string, x: number, y: number): void {
  const location = gl.getUniformLocation(program, name);
  if (location) gl.uniform2f(location, x, y);
}

function numberParam(params: Record<string, unknown>, key: string, fallback: number): number {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function paramsForPass(pass: CompiledPass, frame: FrameState): Record<string, unknown> {
  return pass.sourceRefs.reduce<Record<string, unknown>>((params, sourceRef) => ({ ...params, ...frame.parameterOverrides?.[sourceRef] }), pass.params);
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Unable to create WebGL2 shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? "Unable to compile WebGL2 shader.");
  }
  return shader;
}

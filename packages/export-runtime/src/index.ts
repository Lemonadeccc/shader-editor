import type { RenderGraph } from "@unicorn/renderer-core";
import type { Diagnostic, ExportTarget, ParameterValue, ProjectDocument } from "@unicorn/schemas";

export interface ExportedFile {
  path: string;
  contents: string;
  language: "json" | "javascript" | "glsl" | "wgsl" | "typescript" | "text";
}

export interface ExportResult {
  ok: boolean;
  target: ExportTarget;
  files: ExportedFile[];
  diagnostics: Diagnostic[];
  unsupportedFeatures: string[];
}

export function exportProject(target: ExportTarget, project: ProjectDocument, graph: RenderGraph): ExportResult {
  if (target === "project-json") {
    return {
      ok: true,
      target,
      files: [
        {
          path: "project.json",
          contents: JSON.stringify(project, null, 2),
          language: "json"
        }
      ],
      diagnostics: [],
      unsupportedFeatures: []
    };
  }

  if (target === "glsl-pass" || target === "wgsl-pass") {
    const language = target === "glsl-pass" ? "glsl-es-300" : "wgsl";
    const matchingPasses = graph.passes.filter((pass) => pass.shader.language === language);
    const supportedPasses = matchingPasses.filter((pass) => pass.shader.source.trim().length > 0);
    const missingPasses = matchingPasses.filter((pass) => pass.shader.source.trim().length === 0);
    const files = supportedPasses
      .flatMap((pass) => [
        {
          path: `${pass.id}.${target === "glsl-pass" ? "glsl" : "wgsl"}`,
          contents: pass.shader.source,
          language: target === "glsl-pass" ? ("glsl" as const) : ("wgsl" as const)
        },
        {
          path: `${pass.id}.manifest.json`,
          contents: JSON.stringify(passManifest(pass.id, pass.params), null, 2),
          language: "json" as const
        }
      ]);
    return {
      ok: files.length > 0,
      target,
      files,
      diagnostics: exportPassDiagnostics(language, matchingPasses.length, missingPasses.map((pass) => pass.id)),
      unsupportedFeatures: graph.sources
        .filter((source) => source.kind === "model-placeholder" || source.kind === "sdf")
        .map((source) => `${source.kind}:${source.id}`)
        .concat(missingPasses.map((pass) => `${language}:${pass.id}`))
    };
  }

  if (target === "tsl-three") {
    return unsupportedTarget(target, "three-tsl-integration", "TSL/Three export is reserved for the later integration layer.");
  }

  return {
    ok: true,
    target,
    files: target === "webgpu-runtime" ? webgpuRuntimeFiles(project, graph) : webglRuntimeFiles(project, graph),
    diagnostics: [],
    unsupportedFeatures: unsupportedSourceFeatures(graph)
  };
}

function webglRuntimeFiles(project: ProjectDocument, graph: RenderGraph): ExportedFile[] {
  return [
    {
      path: "index.html",
      language: "text",
      contents: `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(project.project.name)}</title>
    <style>html,body{margin:0;background:#000;width:100%;height:100%;overflow:hidden}canvas{width:100vw;height:100vh;display:block}</style>
  </head>
  <body>
    <canvas id="shader-canvas"></canvas>
    <script type="module" src="./runtime-webgl.js"></script>
  </body>
</html>`
    },
    {
      path: "runtime-webgl.js",
      language: "javascript",
      contents: runtimeWebglSource(project, graph)
    },
    {
      path: "manifest.json",
      language: "json",
      contents: JSON.stringify(
        {
          project: project.project,
          canvas: project.scene.canvas,
          exportSettings: project.scene.exportSettings,
          passCount: graph.passes.length,
          unsupportedFeatures: unsupportedSourceFeatures(graph)
        },
        null,
        2
      )
    }
  ];
}

function runtimeWebglSource(project: ProjectDocument, graph: RenderGraph): string {
  return `export const project = ${JSON.stringify(project, null, 2)};
export const graph = ${JSON.stringify(graph, null, 2)};

const canvas = document.querySelector("#shader-canvas");
const gl = canvas?.getContext("webgl2");
if (!canvas || !gl) {
  throw new Error("WebGL2 is required for this exported runtime.");
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.floor(window.innerWidth * dpr));
  canvas.height = Math.max(1, Math.floor(window.innerHeight * dpr));
  gl.viewport(0, 0, canvas.width, canvas.height);
}

function render(time) {
  resize();
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  // The full editor runtime is generated in a later Gate 7 slice.
  // This smoke runtime proves exported project/graph files can load and own a WebGL2 canvas.
  requestAnimationFrame(render);
}

resize();
requestAnimationFrame(render);
`;
}

function webgpuRuntimeFiles(project: ProjectDocument, graph: RenderGraph): ExportedFile[] {
  return [
    {
      path: "index.html",
      language: "text",
      contents: `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(project.project.name)}</title>
    <style>html,body{margin:0;background:#000;width:100%;height:100%;overflow:hidden}canvas{width:100vw;height:100vh;display:block}</style>
  </head>
  <body>
    <canvas id="shader-canvas"></canvas>
    <script type="module" src="./runtime-webgpu.js"></script>
  </body>
</html>`
    },
    {
      path: "runtime-webgpu.js",
      language: "javascript",
      contents: runtimeWebgpuSource(project, graph)
    },
    {
      path: "manifest.json",
      language: "json",
      contents: JSON.stringify(
        {
          project: project.project,
          canvas: project.scene.canvas,
          exportSettings: project.scene.exportSettings,
          passCount: graph.passes.length,
          unsupportedFeatures: unsupportedSourceFeatures(graph)
        },
        null,
        2
      )
    }
  ];
}

function runtimeWebgpuSource(project: ProjectDocument, graph: RenderGraph): string {
  const executablePass = graph.passes.find((pass) => pass.shader.language === "wgsl" && pass.shader.source.includes("@vertex") && pass.shader.source.includes("@fragment"));
  return `export const project = ${JSON.stringify(project, null, 2)};
export const graph = ${JSON.stringify(graph, null, 2)};
const shaderSource = ${JSON.stringify(executablePass?.shader.source ?? "")};
const fragmentEntry = ${JSON.stringify(executablePass?.shader.entryPoint ?? "fsMain")};

const canvas = document.querySelector("#shader-canvas");
if (!canvas || !navigator.gpu || !shaderSource) {
  throw new Error("WebGPU and at least one executable WGSL pass are required for this exported runtime.");
}
const adapter = await navigator.gpu.requestAdapter();
const device = await adapter?.requestDevice();
const context = canvas.getContext("webgpu");
if (!adapter || !device || !context) {
  throw new Error("Unable to initialize WebGPU.");
}
const format = navigator.gpu.getPreferredCanvasFormat();
context.configure({ device, format, alphaMode: "opaque" });
const module = device.createShaderModule({ code: shaderSource });
const pipeline = device.createRenderPipeline({
  layout: "auto",
  vertex: { module, entryPoint: "vsMain" },
  fragment: { module, entryPoint: fragmentEntry, targets: [{ format }] },
  primitive: { topology: "triangle-list" }
});

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.floor(window.innerWidth * dpr));
  canvas.height = Math.max(1, Math.floor(window.innerHeight * dpr));
}

function render() {
  resize();
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [{ view: context.getCurrentTexture().createView(), clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: "clear", storeOp: "store" }]
  });
  pass.setPipeline(pipeline);
  pass.draw(3);
  pass.end();
  device.queue.submit([encoder.finish()]);
  requestAnimationFrame(render);
}
requestAnimationFrame(render);
`;
}

function passManifest(passId: string, params: Record<string, ParameterValue>) {
  return {
    passId,
    parameters: params,
    uniformBindings: Object.keys(params).map((key) => ({
      parameter: key,
      uniform: `u${key[0]?.toUpperCase() ?? ""}${key.slice(1)}`
    }))
  };
}

function unsupportedTarget(target: ExportTarget, feature: string, message: string): ExportResult {
  return {
    ok: false,
    target,
    files: [],
    diagnostics: [
      {
        severity: "warning",
        code: "export.unsupportedTarget",
        message
      }
    ],
    unsupportedFeatures: [feature]
  };
}

function unsupportedSourceFeatures(graph: RenderGraph): string[] {
  return graph.sources.filter((source) => source.kind === "model-placeholder" || source.kind === "sdf").map((source) => `${source.kind}:${source.id}`);
}

function exportPassDiagnostics(language: string, matchingPassCount: number, missingPassIds: string[]): Diagnostic[] {
  if (matchingPassCount === 0) {
    return [
      {
        severity: "warning",
        code: "export.noMatchingPasses",
        message: `No ${language} passes are available for export.`
      }
    ];
  }
  return missingPassIds.map((passId) => ({
    severity: "warning" as const,
    code: "export.passShaderMissing",
    message: `Pass ${passId} has no ${language} shader source and was omitted.`,
    sourceId: passId
  }));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return entities[char] ?? char;
  });
}

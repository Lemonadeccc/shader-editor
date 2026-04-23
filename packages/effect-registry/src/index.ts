import type { ParameterValue } from "@unicorn/schemas";

export type EffectCategory = "feature" | "generative" | "distort" | "post" | "blur" | "misc" | "custom";

export interface EffectParameterManifest {
  id: string;
  label: string;
  type: "float" | "int" | "boolean" | "color" | "enum";
  default: ParameterValue;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
}

export interface ShaderSourceSet {
  glsl?: string;
  wgsl?: string;
  tsl?: string;
}

export interface EffectManifest {
  id: string;
  title: string;
  category: EffectCategory;
  family: string;
  summary: string;
  parameters: EffectParameterManifest[];
  shaders: ShaderSourceSet;
  capabilities: Array<"feedback" | "compute" | "post" | "source">;
}

const mouseTrailGlsl = `#version 300 es
precision highp float;
uniform sampler2D uPrevious;
uniform vec2 uPointer;
uniform vec2 uVelocity;
uniform float uRadius;
uniform float uStrength;
uniform float uTail;
uniform float uHardness;
uniform float uChromaticAberration;
in vec2 vUv;
out vec4 outColor;
void main() {
  vec2 aberration = vec2(uChromaticAberration * 0.01, 0.0);
  vec3 previous = vec3(
    texture(uPrevious, vUv + aberration).r,
    texture(uPrevious, vUv).g,
    texture(uPrevious, vUv - aberration).b
  ) * uTail;
  float d = distance(vUv, uPointer);
  float edge = mix(uRadius, uRadius * 0.2, clamp(uHardness, 0.0, 1.0));
  float spot = smoothstep(uRadius, edge, d) * uStrength;
  vec3 color = vec3(spot) + previous;
  outColor = vec4(color, 1.0);
}`;

const mouseTrailWgsl = `
@group(0) @binding(0) var previousTex: texture_2d<f32>;
@group(0) @binding(1) var previousSampler: sampler;
struct Params { pointer: vec2<f32>, velocity: vec2<f32>, radius: f32, strength: f32, tail: f32 };
@group(0) @binding(2) var<uniform> params: Params;
struct VsOut { @builtin(position) position: vec4<f32>, @location(0) uv: vec2<f32> };
@fragment fn main(input: VsOut) -> @location(0) vec4<f32> {
  let previous = textureSample(previousTex, previousSampler, input.uv).rgb * params.tail;
  let d = distance(input.uv, params.pointer);
  let spot = smoothstep(params.radius, 0.0, d) * params.strength;
  return vec4<f32>(previous + vec3<f32>(spot), 1.0);
}`;

const mondrianGlsl = `#version 300 es
precision highp float;
uniform sampler2D uTexture;
uniform float uTime;
uniform float uScale;
uniform float uMix;
uniform float uPassCount;
in vec2 vUv;
out vec4 outColor;
float line(vec2 uv, float scale) {
  vec2 grid = fract(uv * scale);
  return smoothstep(0.04, 0.0, min(grid.x, grid.y));
}
void main() {
  vec3 base = texture(uTexture, vUv).rgb;
  float scale = max(uScale, 1.0);
  vec2 cell = floor(vUv * scale);
  float id = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
  vec3 color = id < 0.25 ? vec3(0.95, 0.15, 0.10) : id < 0.5 ? vec3(0.08, 0.25, 0.85) : id < 0.75 ? vec3(0.95, 0.82, 0.10) : vec3(0.86);
  float block = step(0.58, id + 0.1 * sin(uTime + id));
  float stroke = line(vUv, scale);
  vec3 painted = mix(color, vec3(0.02), stroke);
  outColor = vec4(mix(base, painted, block * 0.42 * clamp(uMix, 0.0, 1.0)), 1.0);
}`;

const glyphDitherGlsl = `#version 300 es
precision highp float;
uniform sampler2D uTexture;
uniform float uTime;
uniform float uCellSize;
uniform float uMix;
in vec2 vUv;
out vec4 outColor;
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
void main() {
  float cellsPerAxis = max(uCellSize, 4.0);
  vec2 cells = floor(vUv * cellsPerAxis);
  vec2 cellUv = (cells + 0.5) / cellsPerAxis;
  vec3 color = texture(uTexture, cellUv).rgb;
  float luma = dot(color, vec3(0.299, 0.587, 0.114));
  float glyph = step(hash(cells + floor(uTime)), luma);
  vec3 dithered = mix(vec3(0.08), vec3(0.92), glyph) * max(luma, 0.2);
  outColor = vec4(mix(color, dithered, 0.22 * clamp(uMix, 0.0, 1.0)), 1.0);
}`;

export const effectRegistry: EffectManifest[] = [
  {
    id: "distort.mouseTrail",
    title: "Mouse Trail",
    category: "distort",
    family: "feedback",
    summary: "Pointer-driven feedback buffer trail with decay and strength controls.",
    capabilities: ["feedback", "post"],
    parameters: [
      { id: "radius", label: "Radius", type: "float", default: 0.18, min: 0.01, max: 0.8, step: 0.01 },
      { id: "strength", label: "Strength", type: "float", default: 0.55, min: 0, max: 2, step: 0.01 },
      { id: "tail", label: "Tail", type: "float", default: 0.88, min: 0, max: 0.99, step: 0.01 },
      { id: "hardness", label: "Hardness", type: "float", default: 0.15, min: 0, max: 1, step: 0.01 },
      { id: "chromaticAberration", label: "Chromatic abb.", type: "float", default: 0.25, min: 0, max: 1, step: 0.01 }
    ],
    shaders: {
      glsl: mouseTrailGlsl,
      wgsl: mouseTrailWgsl
    }
  },
  {
    id: "generative.mondrian",
    title: "Mondrian",
    category: "generative",
    family: "blocks",
    summary: "Primary-color block composition generated from grid cells.",
    capabilities: ["source", "post"],
    parameters: [
      { id: "scale", label: "Scale", type: "float", default: 7, min: 1, max: 40, step: 1 },
      { id: "mix", label: "Mix", type: "float", default: 1, min: 0, max: 1, step: 0.01 }
    ],
    shaders: {
      glsl: mondrianGlsl
    }
  },
  {
    id: "post.glyphDither",
    title: "Glyph Dither",
    category: "post",
    family: "dither",
    summary: "Post-process quantization into glyph-like cells.",
    capabilities: ["post"],
    parameters: [
      { id: "cellSize", label: "Cell Size", type: "float", default: 42, min: 4, max: 120, step: 1 },
      { id: "mix", label: "Mix", type: "float", default: 0.85, min: 0, max: 1, step: 0.01 }
    ],
    shaders: {
      glsl: glyphDitherGlsl
    }
  }
];

export function getEffectManifest(effectId: string): EffectManifest | undefined {
  return effectRegistry.find((effect) => effect.id === effectId);
}

export function defaultEffectParameters(effectId: string): Record<string, ParameterValue> {
  const manifest = getEffectManifest(effectId);
  if (!manifest) return {};
  return Object.fromEntries(manifest.parameters.map((parameter) => [parameter.id, parameter.default]));
}

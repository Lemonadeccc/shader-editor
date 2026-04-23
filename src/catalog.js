const effectGroups = {
  feature: ["Glyph Dither", "Mouse Trail", "Shape Blocks", "Mondrian"],
  generative: [
    "Beam",
    "Water Caustics",
    "Light Trail",
    "Path Draw",
    "Aurora",
    "Nebula",
    "2D SDF",
    "3D SDF",
    "Blocks",
    "3D SDF Strip",
    "Noise Fill",
    "Video",
    "Gradient",
    "Wisps",
    "Circle",
    "Pattern",
  ],
  distort: [
    "Mondrian",
    "Pixelate",
    "Transform",
    "Mouse Trail",
    "Mouse Ripple",
    "Liquify",
    "3D Bulge / Pinch",
    "FBM",
    "Flow Field",
    "Noise",
    "Waves",
    "Blinds",
    "Ripple",
    "Sine Waves",
    "Lens Distort",
    "Stretch",
    "Swirl",
    "Extend",
    "Shatter",
    "Projection",
    "Polar",
    "Mirror",
    "Parallax",
  ],
  post: [
    "Adjust",
    "Duotone",
    "Hologram",
    "Gradient Map",
    "Vignette",
    "Grain",
    "Stipple",
    "Nineties VHS",
    "Point Light",
    "Bloom",
    "Fast Bloom",
    "God Rays",
    "2D Light",
    "Blob Tracking",
    "Outline",
    "Dither",
    "Halftone",
    "Chromatic Aberration",
    "Glyph Dither",
    "Retro Screen",
    "Glitch",
    "Guilloche",
    "Posterize",
    "Sparkle",
    "Anti-Alias",
    "Normal Map",
  ],
  blur: [
    "Blur",
    "Mini Blur",
    "Fast Blur",
    "Progressive Blur",
    "Bokeh",
    "Diffuse",
    "Zoom Blur",
    "Noise Blur",
    "Radial Blur",
    "Fog",
  ],
  misc: ["Replicate", "Reflective Surface"],
  custom: ["Custom"],
};

export const CATEGORY_LABELS = [
  ["feature", "Feature"],
  ["generative", "Generative"],
  ["distort", "Distort"],
  ["post", "Post"],
  ["blur", "Blur"],
  ["misc", "Misc"],
  ["custom", "Custom"],
];

export const SOURCE_TYPES = [
  { id: "gradient", label: "Gradient layer" },
  { id: "model", label: "Model preset" },
  { id: "sdf2d", label: "2D SDF" },
  { id: "sdf3d", label: "3D SDF" },
  { id: "uploaded", label: "Uploaded asset metadata" },
];

export const MODEL_CATALOG = [
  "Sphere",
  "Moon Rock",
  "Holey Blob",
  "Abstract Blob",
  "Marble Bust",
  "Roman Bust",
  "Marble Hand",
  "Orchid",
  "Tulip",
  "Balloon Animal",
  "Torus Knot",
  "Unicorn",
  "Diamond",
  "Emerald",
  "Venus De Milo",
  "Philodendron",
  "Airplane",
  "Skull",
].map((name, index) => ({ id: slug(name), name, index }));

export const SDF_CATALOG = [
  "Torus",
  "Box",
  "Sphere",
  "Capsule",
  "Disc",
  "Cylinder",
  "Octahedron",
  "Hex Prism",
  "Plus",
  "Spring",
  "Tricylinder",
  "Triangle",
  "Rounded Cross",
  "Rounded Rectangle",
  "Merged Discs",
  "Rippled Sphere",
  "Top",
  "Star",
  "Pyramid",
  "Asterisk",
  "Dodecahedron",
  "Box Frame",
].map((name, index) => ({ id: slug(name), name, index }));

const familyShaderType = {
  aurora: 1,
  beam: 2,
  caustics: 3,
  glyph: 4,
  trail: 5,
  blocks: 6,
  mondrian: 7,
  pixel: 8,
  transform: 9,
  ripple: 10,
  liquify: 11,
  color: 12,
  glow: 13,
  blur: 14,
  outline: 15,
  sdf3d: 16,
  sdf2d: 17,
  shatter: 18,
  video: 19,
  surface: 20,
  custom: 99,
};

const familyDefaults = {
  aurora: [0.85, 4.5, 0.42, 0.55, 0.45, 0.0],
  beam: [1.0, 16.0, 0.55, 0.55, 0.35, 0.0],
  caustics: [0.95, 18.0, 0.7, 0.45, 0.42, 0.2],
  glyph: [0.9, 42.0, 0.25, 0.65, 0.35, 0.0],
  trail: [0.9, 9.0, 0.5, 0.48, 0.5, 0.0],
  blocks: [0.8, 10.0, 0.18, 0.4, 0.3, 0.0],
  mondrian: [1.0, 7.0, 0.12, 0.52, 0.25, 0.0],
  pixel: [0.85, 46.0, 0.1, 0.35, 0.2, 0.0],
  transform: [0.8, 3.0, 0.28, 0.38, 0.42, 0.0],
  ripple: [0.9, 18.0, 0.9, 0.25, 0.34, 0.0],
  liquify: [0.9, 5.0, 0.35, 0.42, 0.38, 0.0],
  color: [0.85, 6.0, 0.22, 0.65, 0.35, 0.0],
  glow: [0.85, 5.0, 0.12, 0.48, 0.36, 0.0],
  blur: [0.75, 8.0, 0.12, 0.5, 0.45, 0.0],
  outline: [0.85, 90.0, 0.1, 0.55, 0.45, 0.0],
  sdf3d: [1.0, 2.4, 0.32, 0.55, 0.35, 0.0],
  sdf2d: [1.0, 3.0, 0.18, 0.62, 0.28, 0.0],
  shatter: [0.9, 18.0, 0.42, 0.45, 0.35, 0.0],
  video: [0.7, 24.0, 0.5, 0.4, 0.25, 0.0],
  surface: [0.95, 5.0, 0.25, 0.52, 0.35, 0.0],
  custom: [1.0, 8.0, 0.35, 0.5, 0.35, 0.0],
};

const familyColors = {
  aurora: ["#41d6b2", "#7b5cff"],
  beam: ["#ffe66d", "#ff6f59"],
  caustics: ["#50e3ff", "#275efe"],
  glyph: ["#f4f1ea", "#101012"],
  trail: ["#ff7a59", "#41d6b2"],
  blocks: ["#e8c547", "#ff7a59"],
  mondrian: ["#f5d547", "#2d7dd2"],
  pixel: ["#f4f1ea", "#ff5570"],
  transform: ["#41d6b2", "#f4f1ea"],
  ripple: ["#8ee3ef", "#ff7a59"],
  liquify: ["#c084fc", "#41d6b2"],
  color: ["#ff7a59", "#41d6b2"],
  glow: ["#fff7b0", "#ff7a59"],
  blur: ["#f4f1ea", "#41d6b2"],
  outline: ["#101012", "#f4f1ea"],
  sdf3d: ["#e8e1d4", "#41d6b2"],
  sdf2d: ["#ff7a59", "#f4f1ea"],
  shatter: ["#ff5570", "#e8c547"],
  video: ["#f4f1ea", "#41d6b2"],
  surface: ["#d7f9ff", "#ff7a59"],
  custom: ["#41d6b2", "#ff7a59"],
};

export const CONTROL_DEFS = [
  { key: "intensity", label: "Intensity", min: 0, max: 2, step: 0.01 },
  { key: "scale", label: "Scale", min: 1, max: 120, step: 0.1 },
  { key: "speed", label: "Speed", min: 0, max: 3, step: 0.01 },
  { key: "amount", label: "Amount", min: 0, max: 1, step: 0.01 },
  { key: "softness", label: "Softness", min: 0, max: 1, step: 0.01 },
  { key: "phase", label: "Phase", min: -3.14, max: 3.14, step: 0.01 },
  { key: "colorA", label: "Color A", type: "color" },
  { key: "colorB", label: "Color B", type: "color" },
];

export const EFFECT_CATALOG = Object.entries(effectGroups).flatMap(([category, names]) =>
  names.map((name) => {
    const family = detectFamily(name, category);
    const [intensity, scale, speed, amount, softness, phase] = familyDefaults[family];
    const [colorA, colorB] = familyColors[family];

    return {
      id: `${category}-${slug(name)}`,
      name,
      category,
      family,
      shaderType: familyShaderType[family],
      summary: summaryFor(name, family),
      params: { intensity, scale, speed, amount, softness, phase, colorA, colorB },
    };
  }),
);

export function cloneEffect(effect) {
  return {
    instanceId: `${effect.id}-${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`,
    id: effect.id,
    name: effect.name,
    category: effect.category,
    family: effect.family,
    shaderType: effect.shaderType,
    summary: effect.summary,
    enabled: true,
    params: { ...effect.params },
  };
}

function detectFamily(name, category) {
  const value = name.toLowerCase();
  if (value.includes("custom")) return "custom";
  if (value.includes("glyph") || value.includes("dither") || value.includes("stipple") || value.includes("halftone") || value.includes("retro")) return "glyph";
  if (value.includes("trail") || value.includes("path") || value.includes("blob tracking") || value.includes("sparkle")) return "trail";
  if (value.includes("shape blocks") || value === "blocks" || value.includes("blinds") || value.includes("pattern") || value.includes("replicate")) return "blocks";
  if (value.includes("mondrian")) return "mondrian";
  if (value.includes("beam") || value.includes("god rays") || value.includes("point light") || value.includes("2d light")) return "beam";
  if (value.includes("caustics")) return "caustics";
  if (value.includes("2d sdf") || value === "circle") return "sdf2d";
  if (value.includes("3d sdf") || value.includes("projection") || value.includes("normal map")) return "sdf3d";
  if (value.includes("video")) return "video";
  if (value.includes("pixel") || value.includes("posterize")) return "pixel";
  if (value.includes("transform") || value.includes("stretch") || value.includes("extend") || value.includes("parallax")) return "transform";
  if (value.includes("ripple") || value.includes("waves") || value.includes("sine") || value.includes("fog") || value.includes("diffuse")) return "ripple";
  if (value.includes("liquify") || value.includes("swirl") || value.includes("polar") || value.includes("mirror") || value.includes("lens")) return "liquify";
  if (value.includes("shatter")) return "shatter";
  if (value.includes("bloom")) return "glow";
  if (value.includes("outline") || value.includes("anti-alias")) return "outline";
  if (category === "blur" || value.includes("blur") || value.includes("bokeh")) return "blur";
  if (value.includes("reflective") || value.includes("bulge") || value.includes("pinch")) return "surface";
  if (value.includes("aurora") || value.includes("nebula") || value.includes("wisps") || value.includes("gradient") || value.includes("noise") || value.includes("fbm") || value.includes("flow")) return "aurora";
  return "color";
}

function summaryFor(name, family) {
  const summaries = {
    aurora: "Procedural flow fields, layered noise, and animated color ramps.",
    beam: "Radial beams, point lights, and volumetric-looking shafts.",
    caustics: "Interference bands for watery refraction and light pools.",
    glyph: "Screen-space quantization into glyph, dot, dither, or print patterns.",
    trail: "Mouse-reactive motion streaks and path accents.",
    blocks: "Grid segmentation, block masks, and repeating cells.",
    mondrian: "Primary-color block composition with animated divisions.",
    pixel: "Resolution reduction, poster bands, and pixel-level stepping.",
    transform: "UV offset, scale, extension, and parallax style warping.",
    ripple: "Circular, sine, fog, and wave displacement.",
    liquify: "Swirl, polar, mirror, lens, and fluid UV deformation.",
    color: "Tone mapping, duotone, gradient maps, VHS, glitch, and chroma shifts.",
    glow: "Bloom-style highlight expansion.",
    blur: "Single-pass approximations for blur families.",
    outline: "Edge detection and clean silhouette accents.",
    sdf2d: "Signed-distance 2D shape field.",
    sdf3d: "Raymarched 3D signed-distance source.",
    shatter: "Cell-based displacement and fractured masks.",
    video: "Temporal scan bands that stand in for video input.",
    surface: "Reflective or bulged surface shading.",
    custom: "User-defined GLSL hook.",
  };

  return summaries[family] || `${name} shader module`;
}

function slug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

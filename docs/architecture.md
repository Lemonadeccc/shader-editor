# Production Shader Editor Architecture

## Goal

Build a production-grade browser editor for layered WebGL/WebGPU shader scenes.
The product should feel like a design tool, but the internal model must be
friendly to AI agents, automation, validation, versioning, and deterministic
code generation.

This is not a preset gallery. Effects, sources, models, SDFs, animation rules,
and post-processing passes are represented as typed data first, then compiled or
interpreted by renderer backends.

## Recommended Rendering Strategy

Use a backend abstraction with capability detection:

- `WebGPUBackend`: primary backend for modern browsers, compute-heavy effects,
  storage buffers, particle trails, fluid-ish simulations, and high pass counts.
- `WebGL2Backend`: compatibility fallback for broad browser support and embed
  runtime export.
- `ThreeBackend`: 3D model, GLB/GLTF, camera, lights, materials, TSL, and
  WebGPURenderer/WebGL2 fallback integration.

WebGPU shaders are written in WGSL. WebGL shaders are written in GLSL ES. TSL is
Three.js Shading Language, a JavaScript/TypeScript shader-node layer that can
generate shader code for WebGPU/WGSL or WebGL/GLSL through Three.js.

Do not use "WLSL" as a term in the codebase; the browser shader language is
`WGSL`.

## Core Layers

1. Editor shell
   - Canvas viewport, layer stack, timeline, inspector, asset browser, code
     editor, performance HUD, undo/redo, command palette.

2. Domain model
   - Versioned project document.
   - Scene graph with sources, models, SDFs, images, videos, text, masks, and
     effect instances.
   - Parameter graph with numeric, color, vector, enum, boolean, texture,
     event-bound, expression-bound, and keyframed values.

3. Effect registry
   - One manifest per effect.
   - Typed parameters and AI hints.
   - Backend implementation references for TSL, GLSL, and WGSL.
   - Performance metadata, required render targets, multipass flags, and test
     fixtures.

4. Effect IR
   - A normalized intermediate representation used by UI, AI, renderers, and
     exporters.
   - Effects should compile from IR to backend modules, not from UI state.
   - AI edits should operate on IR operations such as `addEffect`,
     `setParameter`, `bindParameter`, `reorderLayer`, and `exportRuntime`.

5. Renderer graph
   - Source passes: gradient, image, video, text, model, 2D SDF, 3D SDF.
   - Distort passes: UV deformation and framebuffer feedback.
   - Generative passes: procedural color/geometry fields.
   - Post passes: color, lighting, bloom, dithering, glitch, blur.
   - Compute passes: trails, particles, simulation buffers, blob tracking.
   - Composer should allocate render targets from a pool and downsample heavy
     effects when possible.

6. Asset pipeline
   - GLB/GLTF via Three.js loaders.
   - SVG as both raster texture and vector/path source where possible.
   - Images, videos, depth maps, normal maps, LUTs, and custom textures.
   - Deterministic asset IDs and content hashes.

7. Export runtime
   - Small embeddable runtime for published scenes.
   - Runtime should include only used effects/backends/assets.
   - Support WebGPU primary with WebGL2 fallback where effect capabilities allow.

## AI-Friendly Requirements

AI friendliness is a product feature, not a chat box bolted on later.

- Every effect has a machine-readable manifest.
- Every parameter has stable ID, type, range, default, unit, semantic label, and
  AI editing hints.
- Every project file is deterministic JSON with schema validation.
- Every editor action can be represented as a command operation.
- Undo/redo is a command log, not implicit UI mutation.
- Effects include natural-language descriptions plus canonical examples.
- The app exposes a safe operation API for AI:
  - `inspectProject`
  - `listEffects`
  - `addEffect`
  - `setParameter`
  - `bindParameterToMouse`
  - `bindParameterToScroll`
  - `createSdfSource`
  - `createModelSource`
  - `validateProject`
  - `renderPreview`
  - `explainPipeline`
- AI never writes raw shader strings into production scenes without validation.
  Custom shader code is sandboxed, linted, compiled, and capability-checked.

## Effect Implementation Policy

Each effect should choose the highest-level implementation that preserves
quality and performance:

- Prefer TSL for Three.js materials, 3D-aware effects, and cross WebGPU/WebGL
  output.
- Prefer WGSL for WebGPU-only compute, storage buffers, particle trails, heavy
  simulations, and advanced multipass effects.
- Prefer GLSL ES for WebGL2 fallback and lightweight embed runtime.
- Allow custom GLSL/WGSL only in a sandboxed custom effect layer, never as the
  internal canonical representation.

## Suggested Production Stack

- TypeScript for all editor and renderer code.
- React for editor UI if the project needs a rich browser app.
- Three.js for models, GLB/GLTF, WebGPURenderer, WebGL2 fallback, and TSL.
- Monaco or CodeMirror for shader editing.
- Zod or JSON Schema validation for project/effect manifests.
- Playwright for visual regression and interaction tests.
- GPU timer queries where available, with CPU fallback metrics.

## Production Milestones

1. Core schema and command model
   - Project schema, effect schema, operation schema, undo/redo, validation.

2. Renderer abstraction
   - Backend interface, WebGL2 renderer, Three/WebGPU capability probe.

3. Asset and source system
   - GLTF, SVG, image, video, SDF, gradient, procedural source layers.

4. Effect families
   - Implement effects by family first: generative, distort, post, blur, misc.
   - Add exact Unicorn-like parity per effect after the family primitives are
     correct.

5. AI control surface
   - Structured operation API, effect search, prompt-to-operation planning,
     project explanation, validation feedback.

6. Export/runtime
   - Tree-shaken runtime, backend fallback, embed target, performance presets.

7. QA and parity
   - Golden scene fixtures, screenshot diff thresholds, shader compile matrix,
     browser/device capability matrix.

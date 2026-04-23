# Shader Stack Editor

This repository is moving to a Vite+ TypeScript monorepo for a production-grade
WebGL/WebGPU shader editor.

The root-level `index.html`, `styles.css`, and `src/` folder are legacy spike
files. Production work is under `apps/editor` and `packages/*`.

Run the production editor:

```sh
pnpm install
vp run editor#dev
```

The production editor previews at:

```txt
http://localhost:7300/
```

Common commands:

```sh
vp run -r build
vp run -r test
vp run -r check
```

Planning source of truth:

- `.omx/plans/prd-phase1-raw-shader-editor.md`
- `.omx/plans/test-spec-phase1-raw-shader-editor.md`

WebGLStudio.js is used only as architecture/function reference. Its old global
JS/LiteGUI/WebGL1 implementation should not be copied.

## Legacy Spike

The sandbox includes:

- A categorized effect registry covering Feature, Generative, Distort,
  Post Process, Blur, Misc, and Custom groups.
- Adjustable parameters for every effect entry.
- A live WebGL preview driven by time and mouse uniforms.
- Model and SDF preset selectors.
- GLB, GLTF, and SVG upload intake for asset metadata.
- A custom GLSL hook for experimenting with one stack item.

Run locally:

```sh
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

Current sandbox scope: uploaded GLB/GLTF/SVG files are accepted into the legacy
editor state, but the renderer uses procedural model/SDF stand-ins. Full GLTF
parsing and SVG texture rendering belong in the production renderer described in
`docs/architecture.md`.

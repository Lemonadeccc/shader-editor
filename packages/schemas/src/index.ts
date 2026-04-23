export type DiagnosticSeverity = "info" | "warning" | "error";

export interface Diagnostic {
  severity: DiagnosticSeverity;
  code: string;
  message: string;
  sourceId?: string;
  backend?: "webgl2" | "webgpu";
}

export type ParameterValue =
  | number
  | boolean
  | string
  | number[]
  | { binding: string; scale?: number; offset?: number };

export interface CanvasPreset {
  name: string;
  breakpoint: "desktop" | "tablet" | "phone";
  width: number;
  height: number;
  zoom: number;
}

export interface ProjectDocument {
  schemaVersion: "0.1.0";
  project: {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
  };
  scene: {
    canvas: CanvasPreset;
    layers: Layer[];
    assets: Asset[];
    sources: SceneSource[];
    events: SceneEvent[];
    timeline: TimelineState;
    renderGraph: SerializedRenderGraph;
    exportSettings: ExportSettings;
  };
}

export interface SceneSource {
  id: string;
  kind: "background" | "text" | "shape" | "media" | "sdf" | "model-placeholder";
  layerId: string;
  parameters: Record<string, ParameterValue>;
}

export interface SceneEvent {
  id: string;
  trigger: "appear" | "hover" | "mouseMove" | "scroll" | "click" | "timeline";
  targetId: string;
  targetProperty: string;
  enabled: boolean;
  delay: number;
  duration: number;
  easing: "linear" | "easeOut" | "easeInOut" | "spring";
}

export interface SerializedRenderGraph {
  revision: number;
  nodes: Array<{
    id: string;
    kind: string;
    sourceRefs: string[];
  }>;
}

export interface ExportSettings {
  target: ExportTarget;
  includeRuntime: boolean;
  includeFallback: boolean;
}

export type LayerKind =
  | "background"
  | "text"
  | "shape"
  | "media"
  | "model"
  | "sdf"
  | "effect";

export interface BaseLayer {
  id: string;
  kind: LayerKind;
  name: string;
  visible: boolean;
  locked: boolean;
  parentId?: string;
  order: number;
  transform: LayerTransform;
  effects: EffectInstance[];
}

export interface LayerTransform {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  anchor: "top-left" | "center" | "bottom-right";
}

export interface BackgroundLayer extends BaseLayer {
  kind: "background";
  color: string;
}

export interface TextLayer extends BaseLayer {
  kind: "text";
  text: string;
  fontFamily: string;
  fontStyle: string;
  fontSize: number;
  lineHeight: number;
  color: string;
  blendMode: string;
  displace: boolean;
  mask: boolean;
}

export interface ShapeLayer extends BaseLayer {
  kind: "shape";
  shape: "rectangle" | "circle" | "polygon";
  fill: string;
  stroke: string;
  strokeWidth: number;
  radius: number;
  feather: number;
  blendMode: string;
  displace: boolean;
  mask: boolean;
}

export interface SourceLayer extends BaseLayer {
  kind: "media" | "model" | "sdf" | "effect";
  source: Record<string, ParameterValue>;
}

export type Layer = BackgroundLayer | TextLayer | ShapeLayer | SourceLayer;

export interface EffectInstance {
  id: string;
  effectId: string;
  parentLayerId?: string;
  enabled: boolean;
  order: number;
  parameters: Record<string, ParameterValue>;
}

export interface Asset {
  id: string;
  kind: "image" | "video" | "svg" | "glb" | "gltf" | "texture";
  name: string;
  uri?: string;
  hash?: string;
  metadata?: Record<string, ParameterValue>;
}

export interface TimelineState {
  playing: boolean;
  currentTime: number;
  duration: number;
  tracks: TimelineTrack[];
}

export interface TimelineTrack {
  id: string;
  targetId: string;
  property: string;
  keyframes: Keyframe[];
}

export interface Keyframe {
  id: string;
  time: number;
  value: ParameterValue;
  easing: "linear" | "easeOut" | "easeInOut" | "spring";
}

export type EditorOperation =
  | { type: "selectLayer"; layerId: string | null }
  | { type: "addLayer"; layer: Layer }
  | { type: "attachEffect"; layerId: string; effect: EffectInstance }
  | { type: "setParameter"; targetId: string; key: string; value: ParameterValue }
  | { type: "reorderLayer"; layerId: string; order: number }
  | { type: "addKeyframe"; trackId: string; keyframe: Keyframe }
  | { type: "bindEvent"; event: SceneEvent }
  | { type: "setPlayback"; playing: boolean; currentTime?: number }
  | { type: "setExportTarget"; target: ExportTarget };

export type ExportTarget =
  | "project-json"
  | "webgl-runtime"
  | "webgpu-runtime"
  | "glsl-pass"
  | "wgsl-pass"
  | "tsl-three";

export interface OperationResult {
  ok: boolean;
  project: ProjectDocument;
  diagnostics: Diagnostic[];
}

export interface OperationLogEntry {
  id: string;
  at: string;
  operation: EditorOperation;
}

export function migrateProject(project: unknown): ProjectDocument {
  const candidate = project as Partial<ProjectDocument>;
  if (candidate.schemaVersion === "0.1.0") return candidate as ProjectDocument;
  throw new Error("Unsupported project schema version");
}

export function createEmptyRenderGraph(): SerializedRenderGraph {
  return {
    revision: 0,
    nodes: []
  };
}

export function validateProject(project: ProjectDocument): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const ids = new Set<string>();

  if (project.schemaVersion !== "0.1.0") {
    diagnostics.push({
      severity: "error",
      code: "schema.unsupportedVersion",
      message: `Unsupported schema version ${String(project.schemaVersion)}`
    });
  }

  for (const layer of project.scene.layers) {
    if (ids.has(layer.id)) {
      diagnostics.push({
        severity: "error",
        code: "project.duplicateId",
        message: `Duplicate layer id ${layer.id}`,
        sourceId: layer.id
      });
    }
    ids.add(layer.id);

    for (const effect of layer.effects) {
      if (effect.parentLayerId && effect.parentLayerId !== layer.id) {
        diagnostics.push({
          severity: "error",
          code: "effect.parentMismatch",
          message: `Effect ${effect.id} parent does not match layer ${layer.id}`,
          sourceId: effect.id
        });
      }
    }
  }

  for (const event of project.scene.events) {
    if (!ids.has(event.targetId)) {
      diagnostics.push({
        severity: "warning",
        code: "event.targetMissing",
        message: `Event target ${event.targetId} does not point to a known layer.`,
        sourceId: event.id
      });
    }
  }

  return diagnostics;
}

export function hasErrors(diagnostics: Diagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error");
}

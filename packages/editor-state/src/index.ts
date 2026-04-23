import { defaultEffectParameters } from "@unicorn/effect-registry";
import {
  createEmptyRenderGraph,
  hasErrors,
  validateProject,
  type Diagnostic,
  type EditorOperation,
  type EffectInstance,
  type BackgroundLayer,
  type Layer,
  type OperationResult,
  type ProjectDocument,
  type TextLayer
} from "@unicorn/schemas";

export interface EditorSelection {
  layerId: string | null;
  effectId: string | null;
}

export interface EditorSessionState {
  project: ProjectDocument;
  selection: EditorSelection;
}

export function createInitialProject(now = "2026-04-23T00:00:00Z"): ProjectDocument {
  const background = createBackgroundLayer("layer-background", 0);
  const text = createTextLayer("layer-text", 1);
  const mouseTrail = createEffect("effect-mouse-trail", "distort.mouseTrail", text.id, 0);
  const mondrian = createEffect("effect-mondrian", "generative.mondrian", background.id, 0);
  const glyphDither = createEffect("effect-glyph-dither", "post.glyphDither", background.id, 1);

  return {
    schemaVersion: "0.1.0",
    project: {
      id: "project-local",
      name: "Untitled project",
      createdAt: now,
      updatedAt: now
    },
    scene: {
      canvas: {
        name: "Desktop",
        breakpoint: "desktop",
        width: 1440,
        height: 900,
        zoom: 0.66
      },
      assets: [],
      sources: [
        { id: "source-background", kind: "background", layerId: background.id, parameters: { color: background.color } },
        { id: "source-text", kind: "text", layerId: text.id, parameters: { text: text.text } },
        { id: "source-model", kind: "model-placeholder", layerId: "layer-model", parameters: { placeholder: true } },
        { id: "source-sdf", kind: "sdf", layerId: "layer-sdf", parameters: { placeholder: true } }
      ],
      events: [],
      renderGraph: { ...createEmptyRenderGraph(), revision: 1 },
      exportSettings: {
        target: "project-json",
        includeRuntime: true,
        includeFallback: true
      },
      timeline: {
        playing: false,
        currentTime: 0,
        duration: 1.2,
        tracks: [
          {
            id: "track-mouse-strength",
            targetId: mouseTrail.id,
            property: "strength",
            keyframes: [
              { id: "key-mouse-strength-a", time: 0, value: 0.35, easing: "linear" },
              { id: "key-mouse-strength-b", time: 0.6, value: 1.1, easing: "linear" },
              { id: "key-mouse-strength-c", time: 1.2, value: 0.45, easing: "linear" }
            ]
          }
        ]
      },
      layers: [
        { ...background, effects: [mondrian, glyphDither] },
        { ...text, effects: [mouseTrail] },
        createPlaceholderLayer("layer-model", "model", "Model placeholder", 2),
        createPlaceholderLayer("layer-sdf", "sdf", "SDF placeholder", 3)
      ]
    }
  };
}

export function createInitialSession(): EditorSessionState {
  return {
    project: createInitialProject(),
    selection: {
      layerId: "layer-text",
      effectId: null
    }
  };
}

export function applyOperation(project: ProjectDocument, operation: EditorOperation): OperationResult {
  const next = structuredClone(project);
  const diagnostics: Diagnostic[] = [];

  switch (operation.type) {
    case "addLayer":
      next.scene.layers.push(operation.layer);
      touchGraph(next);
      break;
    case "attachEffect": {
      const layer = next.scene.layers.find((item) => item.id === operation.layerId);
      if (!layer) {
        diagnostics.push(error("operation.layerNotFound", `Layer ${operation.layerId} was not found.`, operation.layerId));
        return { ok: false, project, diagnostics };
      }
      layer.effects.push({ ...operation.effect, parentLayerId: layer.id });
      touchGraph(next);
      break;
    }
    case "setParameter": {
      const parameterResult = setParameter(next, operation.targetId, operation.key, operation.value);
      if (!parameterResult.ok) {
        diagnostics.push(parameterResult.diagnostic);
        return { ok: false, project, diagnostics };
      }
      touchGraph(next);
      break;
    }
    case "reorderLayer": {
      const layer = next.scene.layers.find((item) => item.id === operation.layerId);
      if (!layer) {
        diagnostics.push(error("operation.layerNotFound", `Layer ${operation.layerId} was not found.`, operation.layerId));
        return { ok: false, project, diagnostics };
      }
      layer.order = operation.order;
      touchGraph(next);
      break;
    }
    case "addKeyframe": {
      const track = next.scene.timeline.tracks.find((item) => item.id === operation.trackId);
      if (!track) {
        diagnostics.push(error("operation.trackNotFound", `Track ${operation.trackId} was not found.`, operation.trackId));
        return { ok: false, project, diagnostics };
      }
      track.keyframes.push(operation.keyframe);
      break;
    }
    case "setPlayback":
      next.scene.timeline.playing = operation.playing;
      if (operation.currentTime !== undefined) next.scene.timeline.currentTime = operation.currentTime;
      break;
    case "bindEvent":
      if (!targetExists(next, operation.event.targetId)) {
        diagnostics.push(error("operation.eventTargetNotFound", `Event target ${operation.event.targetId} was not found.`, operation.event.targetId));
        return { ok: false, project, diagnostics };
      }
      next.scene.events.push(operation.event);
      break;
    case "selectLayer":
      break;
    case "setExportTarget":
      next.scene.exportSettings.target = operation.target;
      break;
    default:
      diagnostics.push(error("operation.unsupported", "Unsupported operation."));
      return { ok: false, project, diagnostics };
  }

  const validation = validateProject(next);
  if (hasErrors(validation)) return { ok: false, project, diagnostics: validation };
  return { ok: true, project: next, diagnostics: validation };
}

export function replayOperations(project: ProjectDocument, operations: EditorOperation[]): OperationResult {
  return operations.reduce<OperationResult>(
    (result, operation) => {
      if (!result.ok) return result;
      return applyOperation(result.project, operation);
    },
    { ok: true, project, diagnostics: [] }
  );
}

export function selectLayer(selection: EditorSelection, layerId: string | null): EditorSelection {
  return {
    ...selection,
    layerId,
    effectId: null
  };
}

function setParameter(project: ProjectDocument, targetId: string, key: string, value: unknown): { ok: true } | { ok: false; diagnostic: Diagnostic } {
  for (const layer of project.scene.layers) {
    if (layer.id === targetId) {
      return setLayerParameter(project, layer, key, value);
    }
    const effect = layer.effects.find((item) => item.id === targetId);
    if (effect) {
      effect.parameters[key] = value as never;
      return { ok: true };
    }
  }
  const source = project.scene.sources.find((item) => item.id === targetId);
  if (source) {
    source.parameters[key] = value as never;
    return { ok: true };
  }
  return { ok: false, diagnostic: error("operation.targetNotFound", `Target ${targetId} was not found.`, targetId) };
}

function touchGraph(project: ProjectDocument): void {
  project.scene.renderGraph.revision += 1;
}

function setLayerParameter(project: ProjectDocument, layer: Layer, key: string, value: unknown): { ok: true } | { ok: false; diagnostic: Diagnostic } {
  if (key === "name" && typeof value === "string") {
    layer.name = value;
    return { ok: true };
  }
  if (key === "visible" && typeof value === "boolean") {
    layer.visible = value;
    return { ok: true };
  }

  if (layer.kind === "text") {
    if (key === "text" && typeof value === "string") {
      layer.text = value;
      syncSourceParameter(project, layer.id, "text", value);
      return { ok: true };
    }
    if ((key === "fontFamily" || key === "fontStyle" || key === "blendMode") && typeof value === "string") {
      layer[key] = value;
      return { ok: true };
    }
    if ((key === "fontSize" || key === "lineHeight") && typeof value === "number") {
      layer[key] = value;
      return { ok: true };
    }
    if ((key === "mask" || key === "displace") && typeof value === "boolean") {
      layer[key] = value;
      return { ok: true };
    }
  }

  if (layer.kind === "background" && key === "color" && typeof value === "string") {
    layer.color = value;
    syncSourceParameter(project, layer.id, "color", value);
    return { ok: true };
  }

  if (layer.kind === "shape") {
    if ((key === "fill" || key === "stroke" || key === "blendMode") && typeof value === "string") {
      layer[key] = value;
      return { ok: true };
    }
    if ((key === "strokeWidth" || key === "radius" || key === "feather") && typeof value === "number") {
      layer[key] = value;
      return { ok: true };
    }
    if ((key === "mask" || key === "displace") && typeof value === "boolean") {
      layer[key] = value;
      return { ok: true };
    }
    if (key === "shape" && (value === "rectangle" || value === "circle" || value === "polygon")) {
      layer.shape = value;
      return { ok: true };
    }
  }

  return {
    ok: false,
    diagnostic: error("operation.invalidParameter", `Cannot set ${key} on ${layer.kind} layer.`, layer.id)
  };

}

function syncSourceParameter(project: ProjectDocument, layerId: string, key: string, value: unknown): void {
  const source = project.scene.sources.find((item) => item.layerId === layerId);
  if (source) source.parameters[key] = value as never;
}

function targetExists(project: ProjectDocument, targetId: string): boolean {
  return (
    project.scene.layers.some((layer) => layer.id === targetId || layer.effects.some((effect) => effect.id === targetId)) ||
    project.scene.sources.some((source) => source.id === targetId)
  );
}

function createBackgroundLayer(id: string, order: number): BackgroundLayer {
  return {
    id,
    kind: "background",
    name: "Background",
    visible: true,
    locked: false,
    order,
    transform: baseTransform(0, 0, 1440, 900, 1),
    effects: [],
    color: "#000000"
  };
}

function createTextLayer(id: string, order: number): TextLayer {
  return {
    id,
    kind: "text",
    name: "New text",
    visible: true,
    locked: false,
    order,
    transform: baseTransform(520, 430, 400, 110, 0.7),
    effects: [],
    text: "New text",
    fontFamily: "Inter",
    fontStyle: "Regular",
    fontSize: 80,
    lineHeight: 80,
    color: "#d8d8d8",
    blendMode: "Normal",
    displace: false,
    mask: false
  };
}

function createPlaceholderLayer(id: string, kind: "model" | "sdf", name: string, order: number): Layer {
  return {
    id,
    kind,
    name,
    visible: true,
    locked: false,
    order,
    transform: baseTransform(kind === "model" ? 180 : 940, kind === "model" ? 160 : 260, 180, 120, 0.55),
    effects: [],
    source: {
      placeholder: true,
      label: name
    }
  };
}

function createEffect(id: string, effectId: string, parentLayerId: string, order: number): EffectInstance {
  return {
    id,
    effectId,
    parentLayerId,
    enabled: true,
    order,
    parameters: defaultEffectParameters(effectId)
  };
}

function baseTransform(x: number, y: number, width: number, height: number, opacity: number) {
  return {
    x,
    y,
    width,
    height,
    rotation: 0,
    opacity,
    anchor: "center" as const
  };
}

function error(code: string, message: string, sourceId?: string): Diagnostic {
  return {
    severity: "error",
    code,
    message,
    sourceId
  };
}

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { getEffectManifest, type EffectParameterManifest } from "@unicorn/effect-registry";
import { applyOperation, createInitialProject, createInitialSession, selectLayer as selectLayerState } from "@unicorn/editor-state";
import { exportProject } from "@unicorn/export-runtime";
import { applyParameterOverridesToGraph, createFrameState, deriveRenderGraph, emptyPointer } from "@unicorn/renderer-core";
import type { RenderGraph } from "@unicorn/renderer-core";
import { WebGL2RendererBackend } from "@unicorn/renderer-webgl2";
import { WebGPURendererBackend } from "@unicorn/renderer-webgpu";
import type { EffectInstance, ExportTarget, Layer, ParameterValue, TextLayer } from "@unicorn/schemas";
import { advanceTimeline, applyTimelineToProject, sampleTimelineParameters, timelineMarkers, validateTimelineTracks } from "@unicorn/timeline-core";
import "./styles.css";

const root = createRoot(document.querySelector("#root")!);

function App() {
  const [session, setSession] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("mode") === "initial") {
      const project = createInitialProject();
      project.scene.layers = project.scene.layers.filter((layer) => layer.kind === "background");
      project.scene.sources = project.scene.sources.filter((source) => source.kind === "background");
      project.scene.renderGraph.revision += 1;
      return {
        project,
        selection: {
          layerId: null,
          effectId: null
        }
      };
    }
    return createInitialSession();
  });
  const [activeTab, setActiveTab] = useState<"design" | "events">("design");
  const [rendererStatus, setRendererStatus] = useState("Renderer pending");
  const exportTarget = session.project.scene.exportSettings.target;
  const selectedLayer = session.project.scene.layers.find((layer) => layer.id === session.selection.layerId) ?? null;
  const selectedEffect = selectedLayer?.effects.find((effect) => effect.id === session.selection.effectId) ?? null;
  const sampledProject = useMemo(() => applyTimelineToProject(session.project), [session.project]);
  const timelineOverrides = useMemo(() => sampleTimelineParameters(session.project), [session.project.scene.timeline]);
  const timelineIssues = useMemo(() => validateTimelineTracks(session.project), [session.project]);
  const baseGraph = useMemo(() => deriveRenderGraph(session.project, "glsl-es-300"), [session.project.scene.layers, session.project.scene.sources, session.project.scene.renderGraph.revision]);
  const webgpuPreviewGraph = useMemo(() => deriveRenderGraph(session.project, "wgsl"), [session.project.scene.layers, session.project.scene.sources, session.project.scene.renderGraph.revision]);
  const exportBaseGraph = useMemo(
    () => deriveRenderGraph(session.project, exportTarget === "wgsl-pass" || exportTarget === "webgpu-runtime" ? "wgsl" : "glsl-es-300"),
    [exportTarget, session.project.scene.layers, session.project.scene.sources, session.project.scene.renderGraph.revision]
  );
  const frame = useMemo(() => createFrameState(session.project, session.project.scene.timeline.currentTime, emptyPointer), [session.project]);
  const sampledExportGraph = useMemo(() => applyParameterOverridesToGraph(exportBaseGraph, timelineOverrides), [exportBaseGraph, timelineOverrides]);
  const exportResult = useMemo(() => exportProject(exportTarget, sampledProject, sampledExportGraph), [exportTarget, sampledExportGraph, sampledProject]);

  useEffect(() => {
    if (!session.project.scene.timeline.playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const delta = Math.min((now - last) / 1000, 0.05);
      last = now;
      setSession((current) => ({
        ...current,
        project: {
          ...current.project,
          scene: {
            ...current.project.scene,
            timeline: advanceTimeline(current.project.scene.timeline, delta)
          }
        }
      }));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [session.project.scene.timeline.playing]);

  function setLayerParameter(layerId: string, key: string, value: string | number | boolean) {
    const result = applyOperation(session.project, { type: "setParameter", targetId: layerId, key, value });
    if (!result.ok) return;
    setSession((current) => ({ ...current, project: result.project }));
  }

  function selectLayer(layerId: string | null) {
    applyOperation(session.project, { type: "selectLayer", layerId });
    setSession((current) => ({
      ...current,
      selection: selectLayerState(current.selection, layerId)
    }));
  }

  function selectEffect(layerId: string, effectId: string) {
    setSession((current) => ({
      ...current,
      selection: {
        layerId,
        effectId
      }
    }));
  }

  function setExportTarget(target: ExportTarget) {
    const result = applyOperation(session.project, { type: "setExportTarget", target });
    if (!result.ok) return;
    setSession((current) => ({ ...current, project: result.project }));
  }

  function togglePlayback() {
    const result = applyOperation(session.project, {
      type: "setPlayback",
      playing: !session.project.scene.timeline.playing
    });
    if (result.ok) setSession((current) => ({ ...current, project: result.project }));
  }

  return (
    <main className="editor-shell" data-testid="editor-shell">
      <TopBar
        projectName={session.project.project.name}
        playing={session.project.scene.timeline.playing}
        exportTarget={exportTarget}
        onExportTargetChange={setExportTarget}
        onPlay={togglePlayback}
      />
      <section className="workspace">
        <LeftRail
          layers={session.project.scene.layers}
          selectedLayerId={session.selection.layerId}
          selectedEffectId={session.selection.effectId}
          onSelectLayer={selectLayer}
          onSelectEffect={selectEffect}
        />
        <Stage
          layers={session.project.scene.layers}
          selectedLayer={selectedLayer}
          onSelectLayer={selectLayer}
          frameTime={frame.timeSeconds}
          graph={baseGraph}
          webgpuGraph={webgpuPreviewGraph}
          parameterOverrides={timelineOverrides}
          onRendererStatus={setRendererStatus}
        />
        {selectedLayer ? (
          <Inspector
            layer={selectedLayer}
            effect={selectedEffect}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onParameterChange={setLayerParameter}
          />
        ) : null}
      </section>
        <Timeline
          playing={session.project.scene.timeline.playing}
          currentTime={session.project.scene.timeline.currentTime}
          tracks={session.project.scene.timeline.tracks.length}
        />
      <div className="export-status" data-testid="export-status">
        {exportTarget}: {exportResult.ok ? `${exportResult.files.length} file(s)` : exportResult.diagnostics[0]?.message}
      </div>
      <div className="renderer-status" data-testid="renderer-status">
        {timelineIssues[0]?.message ?? rendererStatus}
      </div>
    </main>
  );
}

function TopBar(props: {
  projectName: string;
  playing: boolean;
  exportTarget: ExportTarget;
  onExportTargetChange: (target: ExportTarget) => void;
  onPlay: () => void;
}) {
  return (
    <header className="topbar" data-testid="topbar">
      <div className="project-card">
        <button className="icon-button" aria-label="Project menu">
          <span></span>
          <span></span>
          <span></span>
        </button>
        <strong>{props.projectName}</strong>
        <span className="saved-dot">✓</span>
      </div>
      <nav className="tool-card" aria-label="Creation tools">
        <button className="tool active">↖</button>
        <button className="tool">□</button>
        <button className="tool">T</button>
        <button className="tool">▧</button>
        <button className="tool">⬡</button>
        <button className="tool">✣</button>
      </nav>
      <div className="utility-card">
        <button className="breakpoint active" aria-label="Desktop breakpoint" title="Desktop breakpoint">
          <DeviceIcon kind="desktop" />
        </button>
        <button className="breakpoint" aria-label="Tablet breakpoint" title="Tablet breakpoint">
          <DeviceIcon kind="tablet" />
        </button>
        <button className="breakpoint" aria-label="Phone breakpoint" title="Phone breakpoint">
          <DeviceIcon kind="phone" />
        </button>
        <span>Desktop <em>1440 X 900</em></span>
        <strong>66%</strong>
        <button className="mode">▢ Scroll</button>
        <button className="hd">HD</button>
        <button className="play" onClick={props.onPlay}>
          {props.playing ? "Pause" : "Play"}
        </button>
        <button className="share">Share</button>
        <select value={props.exportTarget} onChange={(event) => props.onExportTargetChange(event.target.value as ExportTarget)}>
          <option value="project-json">Project JSON</option>
          <option value="webgl-runtime">WebGL</option>
          <option value="webgpu-runtime">WebGPU</option>
          <option value="glsl-pass">GLSL</option>
          <option value="wgsl-pass">WGSL</option>
          <option value="tsl-three">TSL</option>
        </select>
      </div>
    </header>
  );
}

function DeviceIcon({ kind }: { kind: "desktop" | "tablet" | "phone" }) {
  if (kind === "desktop") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="5" width="18" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M9 20h6M10.5 16 10 20M13.5 16 14 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "tablet") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="6.5" y="3" width="11" height="18" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M10 18h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="8" y="3" width="8" height="18" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M10.5 18h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function LeftRail(props: {
  layers: Layer[];
  selectedLayerId: string | null;
  selectedEffectId: string | null;
  onSelectLayer: (id: string | null) => void;
  onSelectEffect: (layerId: string, effectId: string) => void;
}) {
  return (
    <aside className="left-rail" data-testid="left-rail">
      <div className="panel-tabs">
        <button className="active">Layers</button>
        <button>Versions</button>
      </div>
      <div className="layer-list">
        {[...props.layers]
          .sort((a, b) => b.order - a.order)
          .map((layer) => (
            <React.Fragment key={layer.id}>
              <button
                className={`layer-row ${props.selectedLayerId === layer.id && !props.selectedEffectId ? "selected" : ""}`}
                onClick={() => props.onSelectLayer(layer.id)}
              >
                <LayerIcon layer={layer} />
                <span>{layer.name}</span>
              </button>
              {layer.effects.map((effect) => (
                <button
                  key={effect.id}
                  className={`layer-row child ${props.selectedEffectId === effect.id ? "selected" : ""}`}
                  onClick={() => props.onSelectEffect(layer.id, effect.id)}
                >
                  <span className="layer-icon">✣</span>
                  <span>{getEffectManifest(effect.effectId)?.title ?? effect.effectId}</span>
                </button>
              ))}
            </React.Fragment>
          ))}
      </div>
      <div className="onboarding">
        <p>Don't know where to start?</p>
        <button>Add a 3d shape</button>
        <button>Add some text</button>
        <div className="tutorial-card">
          <small>Unicorn</small>
          <strong>Welcome to Unicorn.studio</strong>
          <span>A 2 minute introduction</span>
        </div>
        <a>Watch a tutorial ↗</a>
      </div>
    </aside>
  );
}

function LayerIcon({ layer }: { layer: Layer }) {
  if (layer.kind === "background") return <span className="swatch"></span>;
  if (layer.kind === "text") return <span className="layer-icon">T</span>;
  if (layer.kind === "sdf") return <span className="layer-icon">S</span>;
  if (layer.kind === "model") return <span className="layer-icon">⬡</span>;
  return <span className="layer-icon">✣</span>;
}

function Stage(props: {
  layers: Layer[];
  selectedLayer: Layer | null;
  onSelectLayer: (id: string | null) => void;
  frameTime: number;
  graph: RenderGraph;
  webgpuGraph: RenderGraph;
  parameterOverrides: Record<string, Record<string, ParameterValue>>;
  onRendererStatus: (status: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useShaderPreview(canvasRef, props.graph, props.webgpuGraph, props.frameTime, props.parameterOverrides, props.onRendererStatus);
  return (
    <section className="stage-wrap" data-testid="stage">
      <div className="artboard" data-testid="artboard" onClick={() => props.onSelectLayer(null)}>
        <canvas ref={canvasRef} className="render-canvas" width={1440} height={900} aria-label="Raw shader preview canvas" />
        <div className="block block-a"></div>
        <div className="block block-b"></div>
        <div className="block block-c"></div>
        <div className="block block-d"></div>
        {props.layers.map((layer) => {
          if (layer.kind !== "text") return null;
          const selected = props.selectedLayer?.id === layer.id;
          return (
            <button
              key={layer.id}
              className={`text-object ${selected ? "selected" : ""}`}
              style={{
                left: layer.transform.x,
                top: layer.transform.y,
                width: layer.transform.width,
                height: layer.transform.height,
                opacity: layer.transform.opacity,
                fontSize: layer.fontSize
              }}
              onClick={(event) => {
                event.stopPropagation();
                props.onSelectLayer(layer.id);
              }}
            >
              {layer.text}
              {selected ? (
                <>
                  <i className="handle handle-nw"></i>
                  <i className="handle handle-ne"></i>
                  <i className="handle handle-sw"></i>
                  <i className="handle handle-se"></i>
                  <i className="anchor"></i>
                </>
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="help-buttons">
        <button>?</button>
        <button>☯</button>
      </div>
    </section>
  );
}

function useShaderPreview(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  graph: RenderGraph,
  webgpuGraph: RenderGraph,
  frameTime: number,
  parameterOverrides: Record<string, Record<string, ParameterValue>>,
  onRendererStatus: (status: string) => void
) {
  const timelineTimeRef = useRef(frameTime);
  const parameterOverridesRef = useRef(parameterOverrides);
  useEffect(() => {
    timelineTimeRef.current = frameTime;
  }, [frameTime]);
  useEffect(() => {
    parameterOverridesRef.current = parameterOverrides;
  }, [parameterOverrides]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let raf = 0;
    let backend: WebGL2RendererBackend | WebGPURendererBackend = new WebGPURendererBackend();
    const pointer = { ...emptyPointer };

    function onPointerMove(event: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      pointer.x = (event.clientX - rect.left) / rect.width;
      pointer.y = 1 - (event.clientY - rect.top) / rect.height;
    }

    canvas.addEventListener("pointermove", onPointerMove);

    void backend.initialize(canvas).then(async (capabilities) => {
      if (disposed) return;
      const capabilityError = capabilities.diagnostics.find((diagnostic) => diagnostic.severity === "error");
      const unavailable = capabilities.diagnostics.some((diagnostic) => diagnostic.code.startsWith("backend.webgpu"));
      let activeGraph = webgpuGraph;
      if (capabilityError || unavailable) {
        backend.dispose();
        backend = new WebGL2RendererBackend();
        const fallbackCapabilities = await backend.initialize(canvas);
        const fallbackError = fallbackCapabilities.diagnostics.find((diagnostic) => diagnostic.severity === "error");
        if (fallbackError) {
          onRendererStatus(fallbackError.message);
          return;
        }
        activeGraph = graph;
      }
      backend.resize({ width: canvas.width, height: canvas.height });
      const compiled = await backend.compileGraph(activeGraph);
      const compileErrors = compiled.diagnostics.filter((diagnostic) => diagnostic.severity === "error");
      if (compileErrors.length) onRendererStatus(compileErrors[0]?.message ?? "Renderer compile error");
      else onRendererStatus(`${backend.id === "webgpu" ? "WebGPU" : "WebGL2"} ready · ${compiled.passes.length} pass(es)`);
      const render = () => {
        if (disposed) return;
        void backend.render(compiled, {
          timeSeconds: timelineTimeRef.current,
          deltaSeconds: 1 / 60,
          pointer,
          viewport: { width: canvas.width, height: canvas.height },
          devicePixelRatio: window.devicePixelRatio || 1,
          projectRevision: activeGraph.revision,
          parameterOverrides: parameterOverridesRef.current
        }).then((result) => {
          const error = result.diagnostics.find((diagnostic) => diagnostic.severity === "error");
          if (error) onRendererStatus(error.message);
        });
        raf = requestAnimationFrame(render);
      };
      raf = requestAnimationFrame(render);
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointermove", onPointerMove);
      backend.dispose();
    };
  }, [canvasRef, graph, webgpuGraph, onRendererStatus]);
}

function Inspector(props: {
  layer: Layer;
  effect: EffectInstance | null;
  activeTab: "design" | "events";
  onTabChange: (tab: "design" | "events") => void;
  onParameterChange: (layerId: string, key: string, value: string | number | boolean) => void;
}) {
  const effectManifest = props.effect ? getEffectManifest(props.effect.effectId) : null;
  return (
    <aside className="inspector" data-testid="inspector">
      <h2>{effectManifest?.title ?? (props.layer.kind === "text" ? "Text box" : props.layer.name)}</h2>
      <div className="panel-tabs">
        <button className={props.activeTab === "design" ? "active" : ""} onClick={() => props.onTabChange("design")}>
          Design
        </button>
        <button className={props.activeTab === "events" ? "active" : ""} onClick={() => props.onTabChange("events")}>
          Events
        </button>
      </div>
      {props.activeTab === "design" && props.effect && effectManifest ? (
        <EffectInspector effect={props.effect} manifest={effectManifest} onChange={props.onParameterChange} />
      ) : props.activeTab === "design" && props.layer.kind === "text" ? (
        <TextInspector layer={props.layer} onChange={props.onParameterChange} />
      ) : (
        <div className="event-panel">Add an appear event using the plus icon next to a property label.</div>
      )}
    </aside>
  );
}

function TextInspector(props: { layer: TextLayer; onChange: (layerId: string, key: string, value: string | number | boolean) => void }) {
  const layer = props.layer;
  return (
    <div className="inspector-controls">
      <div className="alignment-row">
        <button>⊢</button>
        <button>⊣</button>
        <button>⊤</button>
        <button>⊥</button>
      </div>
      {textInspectorManifest.map((field) => (
        <ManifestField
          key={field.id}
          field={field}
          value={field.getValue(layer)}
          onChange={(value) => {
            if (field.targetKey) props.onChange(layer.id, field.targetKey, value);
          }}
        />
      ))}
      <h3>Text</h3>
      {textTypographyManifest.map((field) => (
        <ManifestField
          key={field.id}
          field={field}
          value={field.getValue(layer)}
          onChange={(value) => {
            if (field.targetKey) props.onChange(layer.id, field.targetKey, value);
          }}
        />
      ))}
    </div>
  );
}

function EffectInspector(props: {
  effect: EffectInstance;
  manifest: { parameters: EffectParameterManifest[] };
  onChange: (targetId: string, key: string, value: string | number | boolean) => void;
}) {
  return (
    <div className="inspector-controls">
      {props.manifest.parameters.map((parameter) => (
        <ManifestField
          key={parameter.id}
          field={effectParameterToField(parameter)}
          value={coerceControlValue(props.effect.parameters[parameter.id] ?? parameter.default)}
          onChange={(value) => props.onChange(props.effect.id, parameter.id, value)}
        />
      ))}
    </div>
  );
}

interface InspectorField<T> {
  id: string;
  label: string;
  type: "text" | "textarea" | "number" | "boolean" | "select" | "readonly";
  options?: string[];
  targetKey?: string;
  getValue: (target: T) => string | number | boolean;
}

const textInspectorManifest: Array<InspectorField<TextLayer>> = [
  { id: "mask", label: "Mask", type: "boolean", targetKey: "mask", getValue: (layer) => layer.mask },
  { id: "text", label: "Text", type: "textarea", targetKey: "text", getValue: (layer) => layer.text },
  { id: "position", label: "Position", type: "readonly", getValue: () => "X 50 / Y 50" },
  { id: "anchor", label: "Anchor", type: "readonly", getValue: (layer) => layer.transform.anchor },
  { id: "width", label: "Width", type: "readonly", getValue: (layer) => `${layer.transform.width} Fixed` },
  { id: "rotation", label: "Rotation", type: "readonly", getValue: (layer) => layer.transform.rotation },
  { id: "opacity", label: "Opacity", type: "readonly", getValue: (layer) => Math.round(layer.transform.opacity * 100) },
  { id: "blendMode", label: "Blend mode", type: "select", targetKey: "blendMode", options: ["Normal", "Screen", "Multiply"], getValue: (layer) => layer.blendMode },
  { id: "displace", label: "Displace", type: "boolean", targetKey: "displace", getValue: (layer) => layer.displace }
];

const textTypographyManifest: Array<InspectorField<TextLayer>> = [
  { id: "fontFamily", label: "Font", type: "select", targetKey: "fontFamily", options: ["Inter", "Arial"], getValue: (layer) => layer.fontFamily },
  { id: "fontStyle", label: "Font style", type: "select", targetKey: "fontStyle", options: ["Regular", "Bold"], getValue: (layer) => layer.fontStyle },
  { id: "fontSize", label: "Font size", type: "number", targetKey: "fontSize", getValue: (layer) => layer.fontSize },
  { id: "lineHeight", label: "Line height", type: "number", targetKey: "lineHeight", getValue: (layer) => layer.lineHeight }
];

function effectParameterToField(parameter: EffectParameterManifest): InspectorField<Record<string, ParameterValue>> {
  return {
    id: parameter.id,
    label: parameter.label,
    type: parameter.type === "boolean" ? "boolean" : parameter.type === "enum" ? "select" : parameter.type === "color" ? "text" : "number",
    options: parameter.options,
    getValue: () => parameter.default as string | number | boolean
  };
}

function ManifestField<T>(props: {
  field: InspectorField<T>;
  value: string | number | boolean;
  onChange: (value: string | number | boolean) => void;
}) {
  const value = props.value;
  if (props.field.type === "boolean") {
    return (
      <Control label={props.field.label}>
        <input type="checkbox" checked={Boolean(value)} onChange={(event) => props.onChange(event.target.checked)} />
      </Control>
    );
  }
  if (props.field.type === "textarea") {
    return (
      <Control label={props.field.label}>
        <textarea value={String(value)} onChange={(event) => props.onChange(event.target.value)} />
      </Control>
    );
  }
  if (props.field.type === "select") {
    return (
      <Control label={props.field.label}>
        <select value={String(value)} onChange={(event) => props.onChange(event.target.value)}>
          {(props.field.options ?? [String(value)]).map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </Control>
    );
  }
  if (props.field.type === "number") {
    return (
      <Control label={props.field.label}>
        <input type="number" value={Number(value)} onChange={(event) => props.onChange(Number(event.target.value))} />
      </Control>
    );
  }
  return (
    <Control label={props.field.label}>
      <input value={String(value)} readOnly />
    </Control>
  );
}

function coerceControlValue(value: ParameterValue): string | number | boolean {
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") return value;
  if (Array.isArray(value)) return value.join(", ");
  return value.binding;
}

function Control({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="control">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Timeline(props: { playing: boolean; currentTime: number; tracks: number }) {
  return (
    <footer className="timeline" data-testid="timeline">
      <div className="transport">◀ ▶</div>
      <div className="track-count">{props.tracks} track</div>
      <div className="markers">
        {timelineMarkers(1.2).map((marker) => (
          <span key={marker}>{marker}</span>
        ))}
      </div>
      <div className="playhead" style={{ left: `${170 + props.currentTime * 240}px` }}></div>
    </footer>
  );
}

root.render(<App />);

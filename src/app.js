import {
  CATEGORY_LABELS,
  CONTROL_DEFS,
  EFFECT_CATALOG,
  MODEL_CATALOG,
  SDF_CATALOG,
  SOURCE_TYPES,
  cloneEffect,
} from "./catalog.js";
import { buildFragmentShader, getDefaultCustomBody, vertexShaderSource } from "./shaders.js";

const MAX_EFFECTS = 8;

const devicePresets = [
  {
    group: "Desktop",
    items: [
      ["Macbook Air", 1280, 832],
      ["Macbook Pro", 1440, 900],
      ['Macbook Pro 14"', 1512, 982],
      ['Macbook Pro 16"', 1728, 1117],
      ["iMac", 1280, 720],
    ],
  },
  {
    group: "Social Media",
    items: [
      ["Twitter post", 1200, 675],
      ["Twitter header", 1500, 500],
      ["Instagram post", 1080, 1080],
      ["Instagram Story", 1080, 1920],
      ["TikTok post", 1080, 1920],
      ["Dribbble shot", 800, 600],
      ["LinkedIn cover", 1584, 396],
    ],
  },
  {
    group: "Presentation",
    items: [
      ["Slide 16:9", 1920, 1080],
      ["Slide 4:3", 1024, 768],
    ],
  },
  {
    group: "Basic",
    items: [
      ["Square", 1080, 1080],
      ["Window", 1811, 720],
    ],
  },
  {
    group: "Mobile",
    items: [
      ["iPhone 14 Pro Max", 430, 932],
      ["iPhone 14 Plus", 428, 926],
      ["iPhone 14 Pro", 393, 852],
      ["iPad mini 8.3", 744, 1133],
      ['iPad Pro 11"', 834, 1194],
      ['iPad Pro 12.9"', 1024, 1366],
    ],
  },
];

const dom = {
  canvas: document.getElementById("glCanvas"),
  projectNameInput: document.getElementById("projectNameInput"),
  toolButtons: [...document.querySelectorAll(".tool-button[data-tool]")],
  shapeToolButton: document.getElementById("shapeToolButton"),
  shapeToolIcon: document.getElementById("shapeToolIcon"),
  shapeMenu: document.getElementById("shapeMenu"),
  textToolButton: document.getElementById("textToolButton"),
  mediaToolButton: document.getElementById("mediaToolButton"),
  sourceToolButton: document.getElementById("sourceToolButton"),
  effectsToolButton: document.getElementById("effectsToolButton"),
  stageScroll: document.getElementById("stageScroll"),
  stageShell: document.getElementById("stageShell"),
  stageFrame: document.getElementById("stageFrame"),
  designSurface: document.getElementById("designSurface"),
  layerList: document.getElementById("layerList"),
  addLayerButton: document.getElementById("addLayerButton"),
  versionList: document.getElementById("versionList"),
  saveVersionButton: document.getElementById("saveVersionButton"),
  leftPanelTabs: [...document.querySelectorAll("#leftPanelNav .panel-nav-item")],
  layersPanelContent: document.getElementById("layersPanelContent"),
  versionsPanelContent: document.getElementById("versionsPanelContent"),
  selectionKindLabel: document.getElementById("selectionKindLabel"),
  selectionTitle: document.getElementById("selectionTitle"),
  inspectorTabs: [...document.querySelectorAll(".inspector-tabs button")],
  inspectorContent: document.getElementById("inspectorContent"),
  breakpointButtons: [...document.querySelectorAll(".breakpoint-switch button")],
  sizePresetButton: document.getElementById("sizePresetButton"),
  sizePresetLabel: document.getElementById("sizePresetLabel"),
  sizePresetMenu: document.getElementById("sizePresetMenu"),
  zoomSelect: document.getElementById("zoomSelect"),
  lockScrollButton: document.getElementById("lockScrollButton"),
  hdButton: document.getElementById("hdButton"),
  playButton: document.getElementById("playButton"),
  shareButton: document.getElementById("shareButton"),
  exportButton: document.getElementById("exportButton"),
  libraryPalette: document.getElementById("libraryPalette"),
  libraryEyebrow: document.getElementById("libraryEyebrow"),
  libraryTitle: document.getElementById("libraryTitle"),
  libraryContent: document.getElementById("libraryContent"),
  closeLibraryButton: document.getElementById("closeLibraryButton"),
  uploadModal: document.getElementById("uploadModal"),
  closeUploadButton: document.getElementById("closeUploadButton"),
  dropZone: document.getElementById("dropZone"),
  assetInput: document.getElementById("assetInput"),
  uploadedList: document.getElementById("uploadedList"),
  timeMarkers: document.getElementById("timeMarkers"),
  timelineRows: document.getElementById("timelineRows"),
  timelinePlayButton: document.getElementById("timelinePlayButton"),
  timelineBackButton: document.getElementById("timelineBackButton"),
  playhead: document.getElementById("playhead"),
};

const effectsById = new Map(EFFECT_CATALOG.map((effect) => [effect.id, effect]));
const sourceIndex = new Map(SOURCE_TYPES.map((source, index) => [source.id, index]));

const initialLayers = [
  {
    id: makeId("layer"),
    name: "Aurora shader",
    type: "effect",
    visible: true,
    locked: false,
    x: 0,
    y: 0,
    width: 1440,
    height: 900,
    rotation: 0,
    opacity: 1,
    effect: cloneEffect(effectsById.get("generative-aurora")),
    events: defaultEvents(),
  },
  {
    id: makeId("layer"),
    name: "Hero rectangle",
    type: "shape",
    shape: "rectangle",
    visible: true,
    locked: false,
    x: 430,
    y: 276,
    width: 580,
    height: 250,
    rotation: 0,
    opacity: 0.86,
    fill: "#151516",
    stroke: "#41d6b2",
    strokeWidth: 1,
    radius: 8,
    sides: 5,
    events: defaultEvents(),
  },
  {
    id: makeId("layer"),
    name: "New Text",
    type: "text",
    visible: true,
    locked: false,
    x: 555,
    y: 370,
    width: 330,
    height: 76,
    rotation: 0,
    opacity: 1,
    text: "New Text",
    fontSize: 54,
    fontWeight: 700,
    color: "#f4f1ea",
    align: "center",
    events: defaultEvents(),
  },
];

const state = {
  projectName: "Untitled shader scene",
  activeTool: "select",
  activeLeftPanel: "layers",
  selectedShape: "rectangle",
  inspectorTab: "design",
  selectedLayerId: initialLayers[2].id,
  activeBreakpoint: "desktop",
  activePreset: { name: "Macbook Pro", width: 1440, height: 900, group: "Desktop" },
  zoom: 1,
  lockScroll: false,
  hd: true,
  playing: true,
  sourceType: "model",
  modelIndex: 3,
  sdfIndex: 0,
  customBody: getDefaultCustomBody(),
  layers: initialLayers,
  versions: [],
  assets: [],
  paletteMode: null,
  effectCategory: "feature",
  dragDraft: null,
  startTime: performance.now(),
  pauseOffset: 0,
  mouse: [0.5, 0.5],
  prevMouse: [0.5, 0.5],
};

let glState = null;

function init() {
  renderPresetMenu();
  renderVersions();
  renderLayers();
  renderLeftPanelMode();
  renderStageSize();
  renderCanvasLayers();
  renderInspector();
  renderTimeline();
  bindEvents();
  initializeWebGL();
  renderLoop();
}

function bindEvents() {
  dom.projectNameInput.addEventListener("input", () => {
    state.projectName = dom.projectNameInput.value;
  });

  dom.toolButtons.forEach((button) => {
    button.addEventListener("click", () => activateTool(button.dataset.tool));
  });

  dom.shapeToolButton.addEventListener("click", (event) => {
    event.stopPropagation();
    dom.shapeMenu.hidden = !dom.shapeMenu.hidden;
  });

  dom.shapeMenu.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-shape]");
    if (!button) return;
    state.selectedShape = button.dataset.shape;
    setShapeToolIcon(state.selectedShape);
    dom.shapeMenu.hidden = true;
    activateTool("shape");
  });

  dom.textToolButton.addEventListener("click", () => createTextLayer());
  dom.mediaToolButton.addEventListener("click", openUpload);
  dom.sourceToolButton.addEventListener("click", () => openLibrary("source"));
  dom.effectsToolButton.addEventListener("click", () => openLibrary("effects"));
  dom.closeLibraryButton.addEventListener("click", closeLibrary);
  dom.closeUploadButton.addEventListener("click", closeUpload);
  dom.uploadModal.addEventListener("click", (event) => {
    if (event.target === dom.uploadModal) closeUpload();
  });

  dom.assetInput.addEventListener("change", () => handleFiles([...dom.assetInput.files]));
  dom.dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dom.dropZone.classList.add("is-dragging");
  });
  dom.dropZone.addEventListener("dragleave", () => dom.dropZone.classList.remove("is-dragging"));
  dom.dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    dom.dropZone.classList.remove("is-dragging");
    handleFiles([...event.dataTransfer.files]);
  });

  dom.addLayerButton.addEventListener("click", () => openLibrary("effects"));
  dom.saveVersionButton.addEventListener("click", saveVersion);
  dom.leftPanelTabs.forEach((button) => {
    button.addEventListener("click", () => {
      state.activeLeftPanel = button.dataset.leftPanel;
      renderLeftPanelMode();
    });
  });

  dom.inspectorTabs.forEach((button) => {
    button.addEventListener("click", () => {
      state.inspectorTab = button.dataset.tab;
      renderInspector();
    });
  });

  dom.breakpointButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.activeBreakpoint = button.dataset.breakpoint;
      dom.breakpointButtons.forEach((item) =>
        item.classList.toggle("is-active", item === button),
      );
    });
  });

  dom.sizePresetButton.addEventListener("click", (event) => {
    event.stopPropagation();
    dom.sizePresetMenu.hidden = !dom.sizePresetMenu.hidden;
  });

  dom.zoomSelect.addEventListener("change", () => {
    state.zoom = Number(dom.zoomSelect.value);
    renderStageSize();
  });

  dom.lockScrollButton.addEventListener("click", () => {
    state.lockScroll = !state.lockScroll;
    dom.lockScrollButton.setAttribute("aria-pressed", String(state.lockScroll));
    dom.stageScroll.style.overflow = state.lockScroll ? "hidden" : "auto";
  });

  dom.hdButton.addEventListener("click", () => {
    state.hd = !state.hd;
    dom.hdButton.setAttribute("aria-pressed", String(state.hd));
  });

  dom.playButton.addEventListener("click", togglePlayback);
  dom.timelinePlayButton.addEventListener("click", togglePlayback);
  dom.timelineBackButton.addEventListener("click", () => {
    state.startTime = performance.now();
    state.pauseOffset = 0;
  });
  dom.shareButton.addEventListener("click", () => {
    navigator.clipboard?.writeText(JSON.stringify(exportProject(), null, 2));
    dom.shareButton.textContent = "Copied";
    setTimeout(() => (dom.shareButton.textContent = "Share"), 900);
  });
  dom.exportButton.addEventListener("click", downloadProject);

  dom.designSurface.addEventListener("pointerdown", handleSurfacePointerDown);
  dom.designSurface.addEventListener("pointermove", updateMouse);
  dom.designSurface.addEventListener("pointerleave", () => {
    state.prevMouse = [...state.mouse];
    state.mouse = [0.5, 0.5];
  });
  document.addEventListener("pointermove", handleDocumentPointerMove);
  document.addEventListener("pointerup", handleDocumentPointerUp);
  document.addEventListener("click", closeFloatingMenus);
  window.addEventListener("resize", resizeCanvas);
}

function activateTool(tool) {
  state.activeTool = tool;
  dom.toolButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tool === tool);
  });
  dom.stageFrame.classList.toggle("is-crosshair", tool === "shape");

  if (tool === "media") openUpload();
  if (tool === "source") openLibrary("source");
  if (tool === "effects") openLibrary("effects");
}

function renderPresetMenu() {
  dom.sizePresetMenu.innerHTML = "";
  for (const group of devicePresets) {
    const wrap = document.createElement("section");
    wrap.className = "preset-group";
    wrap.innerHTML = `<h3>${group.group}</h3>`;
    for (const [name, width, height] of group.items) {
      const button = document.createElement("button");
      button.className = "preset-option";
      button.innerHTML = `<strong>${name}</strong><span>${width} x ${height}</span>`;
      button.addEventListener("click", () => {
        state.activePreset = { group: group.group, name, width, height };
        dom.sizePresetMenu.hidden = true;
        renderStageSize();
      });
      wrap.append(button);
    }
    dom.sizePresetMenu.append(wrap);
  }
}

function renderStageSize() {
  const { group, name, width, height } = state.activePreset;
  dom.sizePresetLabel.textContent = `${group} ${width} x ${height}`;
  dom.stageShell.style.width = `${Math.round(width * state.zoom)}px`;
  dom.stageShell.style.height = `${Math.round(height * state.zoom)}px`;
  dom.stageFrame.style.width = `${width}px`;
  dom.stageFrame.style.height = `${height}px`;
  dom.stageFrame.style.transform = `scale(${state.zoom})`;
  dom.stageFrame.dataset.presetName = name;
  resizeCanvas();
}

function renderVersions() {
  if (!state.versions.length) {
    state.versions.push({
      id: makeId("version"),
      name: "Initial",
      createdAt: new Date().toLocaleTimeString(),
      snapshot: snapshotState(),
    });
  }

  dom.versionList.innerHTML = "";
  for (const version of state.versions) {
    const li = document.createElement("li");
    li.className = `history-item-container`;
    li.style.order = String(state.versions.indexOf(version));
    const row = document.createElement("div");
    row.className = `history-item${version.id === state.versions.at(-1).id ? " active" : ""}`;
    const button = document.createElement("button");
    button.className = "history-item-content history-item-button";
    button.innerHTML = `<span class="history-effect-icon">V</span><span class="history-item-name">${version.name}</span><span class="history-item-subtle">${version.createdAt}</span>`;
    button.addEventListener("click", () => restoreVersion(version));
    row.append(button);
    li.append(row);
    dom.versionList.append(li);
  }
}

function renderLayers() {
  dom.layerList.innerHTML = "";
  [...state.layers].reverse().forEach((layer, orderIndex) => {
    const li = document.createElement("li");
    li.className = "history-item-container";
    li.style.order = String(orderIndex);

    const row = document.createElement("div");
    row.className = `history-item${layer.id === state.selectedLayerId ? " active" : ""}`;
    row.draggable = true;

    const visibility = document.createElement("button");
    visibility.className = "hide-history-item button button__icon button__icon-auto-width";
    visibility.innerHTML = iconSvg(layer.visible ? "eye" : "eyeOff");
    visibility.title = layer.visible ? "Hide layer" : "Show layer";
    visibility.addEventListener("click", () => {
      layer.visible = !layer.visible;
      renderAll();
    });

    const meta = document.createElement("button");
    meta.className = "history-item-content history-item-button";
    meta.innerHTML = `${layerIcon(layer)}<span class="history-item-name">${layer.name}</span>`;
    meta.addEventListener("click", () => selectLayer(layer.id));

    const actions = document.createElement("div");
    actions.className = "history-item-actions";
    actions.append(
      visibility,
      miniButton(iconSvg("lock"), "Lock layer", () => {
        layer.locked = !layer.locked;
        renderLayers();
      }),
      miniButton(iconSvg("dots"), "Layer menu", () => duplicateLayer(layer.id)),
    );

    row.append(meta, actions);
    li.append(row);
    dom.layerList.append(li);
  });
}

function renderLeftPanelMode() {
  dom.leftPanelTabs.forEach((button) => {
    const active = button.dataset.leftPanel === state.activeLeftPanel;
    button.classList.toggle("active", active);
  });
  dom.layersPanelContent.hidden = state.activeLeftPanel !== "layers";
  dom.versionsPanelContent.hidden = state.activeLeftPanel !== "versions";
  dom.addLayerButton.hidden = state.activeLeftPanel !== "layers";
  dom.saveVersionButton.hidden = state.activeLeftPanel !== "versions";
}

function renderCanvasLayers() {
  dom.designSurface.innerHTML = "";
  for (const layer of state.layers) {
    const el = document.createElement("div");
    el.className = `canvas-layer${layer.id === state.selectedLayerId ? " is-selected" : ""}${
      layer.visible ? "" : " is-hidden"
    }`;
    el.dataset.layerId = layer.id;
    el.style.left = `${layer.x}px`;
    el.style.top = `${layer.y}px`;
    el.style.width = `${layer.width}px`;
    el.style.height = `${layer.height}px`;
    el.style.opacity = String(layer.opacity ?? 1);
    el.style.transform = `rotate(${layer.rotation || 0}deg)`;
    el.addEventListener("pointerdown", (event) => {
      if (state.activeTool !== "select") return;
      event.stopPropagation();
      selectLayer(layer.id);
    });

    if (layer.type === "shape") {
      const shape = document.createElement("div");
      shape.className = `shape-${layer.shape}`;
      shape.style.background = layer.fill;
      shape.style.borderColor = layer.stroke;
      shape.style.borderWidth = `${layer.strokeWidth}px`;
      shape.style.borderRadius = layer.shape === "rectangle" ? `${layer.radius}px` : "";
      el.append(shape);
    } else if (layer.type === "text") {
      const text = document.createElement("div");
      text.className = "text-layer";
      text.contentEditable = "true";
      text.textContent = layer.text;
      text.style.fontSize = `${layer.fontSize}px`;
      text.style.fontWeight = String(layer.fontWeight);
      text.style.color = layer.color;
      text.style.textAlign = layer.align;
      text.addEventListener("input", () => {
        layer.text = text.textContent || "";
        renderLayers();
        renderTimeline();
      });
      el.append(text);
    } else if (layer.type === "media") {
      el.innerHTML = `<div class="media-layer">${layer.mediaKind}<br>${layer.fileName}</div>`;
    } else if (layer.type === "model") {
      el.innerHTML = `<div class="model-layer">Model<br>${MODEL_CATALOG[layer.modelIndex]?.name}</div>`;
    } else if (layer.type === "sdf") {
      el.innerHTML = `<div class="sdf-layer">SDF<br>${SDF_CATALOG[layer.sdfIndex]?.name}</div>`;
    } else if (layer.type === "effect") {
      el.innerHTML = `<div class="effect-layer">FX<br>${layer.effect.name}</div>`;
    }

    dom.designSurface.append(el);
  }
}

function renderInspector() {
  const layer = selectedLayer();
  dom.inspectorTabs.forEach((button) => {
    const active = button.dataset.tab === state.inspectorTab;
    button.classList.toggle("is-active", active);
    button.classList.toggle("active", active);
  });

  if (!layer) {
    dom.selectionKindLabel.textContent = "No selection";
    dom.selectionTitle.textContent = "Select a layer";
    dom.inspectorContent.innerHTML = `<p class="eyebrow">Use the toolbar to create a shape, text, media, model, SDF, or effect layer.</p>`;
    return;
  }

  dom.selectionKindLabel.textContent = layer.name;
  dom.selectionTitle.textContent = layer.type === "shape" ? "Shape" : titleCase(layer.type);
  dom.inspectorContent.innerHTML = "";

  if (state.inspectorTab === "events") {
    renderEventsInspector(layer);
    return;
  }

  renderDesignInspector(layer);
}

function renderDesignInspector(layer) {
  if (layer.type === "shape") {
    renderShapeDesignInspector(layer);
    return;
  }

  dom.inspectorContent.append(
    group("Identity", [
      textField("Name", layer.name, (value) => {
        layer.name = value;
        renderLayers();
        renderTimeline();
      }),
      checkboxField("Visible", layer.visible, (value) => {
        layer.visible = value;
        renderAll();
      }),
    ]),
    group("Layout", [
      numberField("X", layer.x, (value) => updateLayer(layer, { x: value })),
      numberField("Y", layer.y, (value) => updateLayer(layer, { y: value })),
      numberField("W", layer.width, (value) => updateLayer(layer, { width: Math.max(1, value) })),
      numberField("H", layer.height, (value) => updateLayer(layer, { height: Math.max(1, value) })),
      numberField("Rotate", layer.rotation || 0, (value) => updateLayer(layer, { rotation: value })),
      rangeField("Opacity", layer.opacity ?? 1, 0, 1, 0.01, (value) =>
        updateLayer(layer, { opacity: value }),
      ),
    ]),
  );

  if (layer.type === "shape") {
    dom.inspectorContent.append(
      group("Shape", [
        selectField(
          "Type",
          layer.shape,
          [
            ["rectangle", "Rectangle"],
            ["circle", "Circle"],
            ["polygon", "Polygon"],
          ],
          (value) => updateLayer(layer, { shape: value }),
        ),
        colorField("Fill", layer.fill, (value) => updateLayer(layer, { fill: value })),
        colorField("Stroke", layer.stroke, (value) => updateLayer(layer, { stroke: value })),
        numberField("Stroke", layer.strokeWidth, (value) =>
          updateLayer(layer, { strokeWidth: Math.max(0, value) }),
        ),
        numberField("Radius", layer.radius, (value) =>
          updateLayer(layer, { radius: Math.max(0, value) }),
        ),
        numberField("Sides", layer.sides, (value) =>
          updateLayer(layer, { sides: Math.max(3, value) }),
        ),
      ]),
    );
  }

  if (layer.type === "text") {
    dom.inspectorContent.append(
      group("Text", [
        textField("Content", layer.text, (value) => updateLayer(layer, { text: value })),
        numberField("Size", layer.fontSize, (value) =>
          updateLayer(layer, { fontSize: Math.max(1, value) }),
        ),
        selectField(
          "Weight",
          String(layer.fontWeight),
          [
            ["300", "Light"],
            ["400", "Regular"],
            ["700", "Bold"],
            ["900", "Black"],
          ],
          (value) => updateLayer(layer, { fontWeight: Number(value) }),
        ),
        selectField(
          "Align",
          layer.align,
          [
            ["left", "Left"],
            ["center", "Center"],
            ["right", "Right"],
          ],
          (value) => updateLayer(layer, { align: value }),
        ),
        colorField("Color", layer.color, (value) => updateLayer(layer, { color: value })),
      ]),
    );
  }

  if (layer.type === "effect") {
    dom.inspectorContent.append(renderEffectControls(layer));
  }

  if (layer.type === "model") {
    dom.inspectorContent.append(
      group("Model", [
        selectField(
          "Preset",
          String(layer.modelIndex),
          MODEL_CATALOG.map((item) => [String(item.index), item.name]),
          (value) => {
            layer.modelIndex = Number(value);
            state.modelIndex = layer.modelIndex;
            renderAll();
          },
        ),
        rangeField("Lighting", layer.lighting ?? 0.7, 0, 1, 0.01, (value) =>
          updateLayer(layer, { lighting: value }),
        ),
      ]),
    );
  }

  if (layer.type === "sdf") {
    dom.inspectorContent.append(
      group("SDF", [
        selectField(
          "Preset",
          String(layer.sdfIndex),
          SDF_CATALOG.map((item) => [String(item.index), item.name]),
          (value) => {
            layer.sdfIndex = Number(value);
            state.sdfIndex = layer.sdfIndex;
            renderAll();
          },
        ),
        rangeField("Smoothness", layer.smoothness ?? 0.2, 0, 1, 0.01, (value) =>
          updateLayer(layer, { smoothness: value }),
        ),
      ]),
    );
  }

  if (layer.type === "media") {
    dom.inspectorContent.append(
      group("Media", [
        textField("File", layer.fileName, (value) => updateLayer(layer, { fileName: value })),
        selectField(
          "Fit",
          layer.fit || "cover",
          [
            ["cover", "Cover"],
            ["contain", "Contain"],
            ["fill", "Fill"],
          ],
          (value) => updateLayer(layer, { fit: value }),
        ),
      ]),
    );
  }
}

function renderShapeDesignInspector(layer) {
  normalizeShapeLayer(layer);
  dom.inspectorContent.append(
    alignmentToolbar(layer),
    parameterBlock(
      "Mask",
      toggleSegment(layer.mask ? 0 : 1, ["On", "Off"], (index) => {
        layer.mask = index === 0;
      }),
    ),
    parameterBlock(
      "Fit to artboard",
      toggleSegment(layer.fitToArtboard ? 0 : 1, ["On", "Off"], (index) => {
        layer.fitToArtboard = index === 0;
        if (layer.fitToArtboard) {
          layer.x = 0;
          layer.y = 0;
          layer.width = state.activePreset.width;
          layer.height = state.activePreset.height;
          renderAll();
        }
      }),
      { info: true },
    ),
    parameterBlock(
      "Position",
      coordsInput(
        [
          ["X", percent(layer.x, state.activePreset.width)],
          ["Y", percent(layer.y, state.activePreset.height)],
        ],
        (values) => {
          layer.x = Math.round((values.X / 100) * state.activePreset.width);
          layer.y = Math.round((values.Y / 100) * state.activePreset.height);
          renderAll();
        },
        "%",
      ),
      { event: "appear" },
    ),
    parameterBlock(
      "Anchor",
      compactSelect(
        layer.anchor,
        [
          ["top-left", "Top Left"],
          ["top", "Top"],
          ["top-right", "Top Right"],
          ["center", "Center"],
          ["bottom-left", "Bottom Left"],
          ["bottom", "Bottom"],
          ["bottom-right", "Bottom Right"],
        ],
        (value) => {
          layer.anchor = value;
        },
      ),
      { info: true },
    ),
    parameterBlock(
      "Width",
      sizeInput(layer.width, layer.widthMode, (value, mode) => {
        layer.width = Math.max(1, value);
        layer.widthMode = mode;
        renderAll();
      }),
      { event: "appear" },
    ),
    parameterBlock(
      "Height",
      sizeInput(layer.height, layer.heightMode, (value, mode) => {
        layer.height = Math.max(1, value);
        layer.heightMode = mode;
        renderAll();
      }),
      { event: "appear" },
    ),
    parameterBlock(
      "Rotation",
      sliderInput(layer.rotation || 0, -180, 180, 1, "deg", (value) => {
        layer.rotation = value;
        renderAll();
      }),
      { event: "appear" },
    ),
    parameterBlock(
      "Shape type",
      compactSelect(
        layer.shape,
        [
          ["rectangle", "Rectangle"],
          ["circle", "Circle"],
          ["polygon", "Polygon"],
        ],
        (value) => {
          layer.shape = value;
          renderAll();
        },
      ),
    ),
    parameterBlock("Fill", colorInput(layer.fill, (value) => updateLayer(layer, { fill: value }))),
    parameterBlock(
      "Stroke",
      colorAndSizeInput(layer.stroke, layer.strokeWidth, (color, size) => {
        layer.stroke = color;
        layer.strokeWidth = Math.max(0, size);
        renderAll();
      }),
      { event: "appear" },
    ),
    parameterBlock(
      "Border radius",
      sliderInput(layer.radius || 0, 0, 100, 1, "%", (value) => {
        layer.radius = value;
        renderAll();
      }),
      { event: "appear" },
    ),
    parameterBlock(
      "Feather",
      sliderInput(layer.feather || 0, 0, 100, 1, "%", (value) => {
        layer.feather = value;
      }),
      { event: "appear", info: true },
    ),
    parameterBlock(
      "Opacity",
      sliderInput(Math.round((layer.opacity ?? 1) * 100), 0, 100, 1, "%", (value) => {
        layer.opacity = value / 100;
        renderAll();
      }),
      { event: "appear" },
    ),
    parameterBlock(
      "Blend mode",
      compactSelect(
        layer.blendMode,
        [
          ["normal", "Normal"],
          ["multiply", "Multiply"],
          ["screen", "Screen"],
          ["overlay", "Overlay"],
          ["difference", "Difference"],
        ],
        (value) => {
          layer.blendMode = value;
          renderAll();
        },
      ),
    ),
    parameterBlock(
      "Displace",
      toggleSegment(layer.displace ? 0 : 1, ["On", "Off"], (index) => {
        layer.displace = index === 0;
      }),
    ),
    sectionLabel("Interactivity"),
    parameterBlock(
      "Position",
      sliderInput(layer.interactivePosition || 0, 0, 100, 1, "%", (value) => {
        layer.interactivePosition = value;
      }),
      { event: "mouseMove", info: true },
    ),
    parameterBlock(
      "3D rotation",
      sliderInput(layer.rotation3d || 0, 0, 100, 1, "%", (value) => {
        layer.rotation3d = value;
      }),
      { info: true },
    ),
    parameterBlock(
      "Momentum",
      sliderInput(layer.momentum || 0, 0, 100, 1, "%", (value) => {
        layer.momentum = value;
      }),
      { event: "mouseMove", info: true },
    ),
    parameterBlock(
      "Spring",
      sliderInput(layer.spring || 0, 0, 100, 1, "%", (value) => {
        layer.spring = value;
      }),
      { event: "mouseMove", info: true },
    ),
    parameterBlock(
      "Mouse axes",
      radioGroup(layer.mouseAxes, ["X only", "Y only", "Both"], (value) => {
        layer.mouseAxes = value;
      }),
    ),
  );
}

function renderEffectControls(layer) {
  const controls = [];
  for (const control of CONTROL_DEFS) {
    if (control.type === "color") {
      controls.push(
        colorField(control.label, layer.effect.params[control.key], (value) => {
          layer.effect.params[control.key] = value;
          renderCanvasLayers();
        }),
      );
    } else {
      controls.push(
        rangeField(
          labelFor(control.label, layer.effect.family),
          layer.effect.params[control.key],
          control.min,
          control.max,
          control.step,
          (value) => {
            layer.effect.params[control.key] = value;
          },
        ),
      );
    }
  }

  if (layer.effect.family === "custom") {
    controls.push(
      textareaField("Custom GLSL", state.customBody, (value) => {
        state.customBody = value;
        compileProgram();
      }),
    );
  }

  return group(`${layer.effect.name} Parameters`, controls);
}

function renderEventsInspector(layer) {
  const events = layer.events || defaultEvents();
  layer.events = events;
  const cards = [
    eventCard("Appear", "Animate opacity, transform, blur, or shader parameters when the layer enters.", events.appear),
    eventCard("Hover", "Bind hover state to style or effect parameters.", events.hover),
    eventCard("Mouse Move", "Map pointer X/Y or distance to a parameter.", events.mouseMove),
    eventCard("Scroll", "Bind page scroll progress to timeline or shader parameters.", events.scroll),
    eventCard("Click", "Trigger playback, version changes, or parameter toggles.", events.click),
  ];
  dom.inspectorContent.append(...cards);
}

function eventCard(title, description, eventState) {
  const wrap = document.createElement("section");
  wrap.className = "event-card";
  const id = makeId("event");
  wrap.innerHTML = `
    <header>
      <strong>${title}</strong>
      <input id="${id}" type="checkbox" ${eventState.enabled ? "checked" : ""}>
    </header>
    <p>${description}</p>
  `;
  const checkbox = wrap.querySelector("input");
  checkbox.addEventListener("input", () => {
    eventState.enabled = checkbox.checked;
  });
  wrap.append(
    selectField(
      "Target",
      eventState.target,
      [
        ["opacity", "Opacity"],
        ["position", "Position"],
        ["scale", "Scale"],
        ["rotation", "Rotation"],
        ["effect.intensity", "Effect intensity"],
        ["effect.amount", "Effect amount"],
      ],
      (value) => (eventState.target = value),
    ),
    numberField("Delay", eventState.delay, (value) => (eventState.delay = value), 0.1),
    numberField("Duration", eventState.duration, (value) => (eventState.duration = value), 0.1),
    selectField(
      "Easing",
      eventState.easing,
      [
        ["linear", "Linear"],
        ["easeOut", "Ease out"],
        ["easeInOut", "Ease in-out"],
        ["spring", "Spring"],
      ],
      (value) => (eventState.easing = value),
    ),
  );
  return wrap;
}

function openLibrary(mode) {
  state.paletteMode = mode;
  dom.libraryPalette.hidden = false;
  dom.libraryEyebrow.textContent = mode === "effects" ? "Effect Library" : "Source Library";
  dom.libraryTitle.textContent =
    mode === "effects" ? "Featured / Generative / Distort / Post process / Blur / Misc / Custom" : "Models and SDF";
  if (mode === "effects") renderEffectLibrary();
  else renderSourceLibrary();
}

function closeLibrary() {
  dom.libraryPalette.hidden = true;
  state.paletteMode = null;
}

function renderEffectLibrary() {
  dom.libraryContent.innerHTML = "";
  const tabs = document.createElement("div");
  tabs.className = "library-tabs";
  for (const [id, label] of CATEGORY_LABELS) {
    const button = document.createElement("button");
    button.classList.toggle("is-active", id === state.effectCategory);
    button.textContent = label;
    button.addEventListener("click", () => {
      state.effectCategory = id;
      renderEffectLibrary();
    });
    tabs.append(button);
  }

  const grid = document.createElement("div");
  grid.className = "library-grid";
  EFFECT_CATALOG.filter((effect) => effect.category === state.effectCategory).forEach((effect) => {
    const button = document.createElement("button");
    button.className = "library-card";
    button.innerHTML = `<strong>${effect.name}</strong><span>${effect.summary}</span>`;
    button.addEventListener("click", () => {
      createEffectLayer(effect);
      closeLibrary();
    });
    grid.append(button);
  });

  dom.libraryContent.append(tabs, grid);
}

function renderSourceLibrary() {
  dom.libraryContent.innerHTML = "";
  const modelTitle = document.createElement("div");
  modelTitle.className = "library-tabs";
  modelTitle.innerHTML = `<button class="is-active">Models</button><button class="is-active">SDF</button>`;

  const modelGrid = document.createElement("div");
  modelGrid.className = "library-grid";
  MODEL_CATALOG.forEach((model) => {
    const button = document.createElement("button");
    button.className = "library-card";
    button.innerHTML = `<strong>${model.name}</strong><span>3D model preset source. GLB/GLTF loader will replace procedural stand-in in production renderer.</span>`;
    button.addEventListener("click", () => {
      createModelLayer(model.index);
      closeLibrary();
    });
    modelGrid.append(button);
  });

  const sdfLabel = document.createElement("div");
  sdfLabel.className = "library-tabs";
  sdfLabel.innerHTML = `<button class="is-active">SDF Library</button>`;
  const sdfGrid = document.createElement("div");
  sdfGrid.className = "library-grid";
  SDF_CATALOG.forEach((sdf) => {
    const button = document.createElement("button");
    button.className = "library-card";
    button.innerHTML = `<strong>${sdf.name}</strong><span>Signed-distance primitive with editable material and events.</span>`;
    button.addEventListener("click", () => {
      createSdfLayer(sdf.index);
      closeLibrary();
    });
    sdfGrid.append(button);
  });

  dom.libraryContent.append(modelTitle, modelGrid, sdfLabel, sdfGrid);
}

function openUpload() {
  dom.uploadModal.hidden = false;
}

function closeUpload() {
  dom.uploadModal.hidden = true;
}

function handleFiles(files) {
  if (!files.length) return;
  for (const file of files) {
    const asset = {
      id: makeId("asset"),
      name: file.name,
      size: file.size,
      type: file.type || file.name.split(".").pop()?.toUpperCase() || "asset",
    };
    state.assets.push(asset);
    createMediaLayer(asset);
  }
  dom.assetInput.value = "";
  renderUploadedList();
  closeUpload();
}

function renderUploadedList() {
  dom.uploadedList.innerHTML = "";
  for (const asset of state.assets.slice(-8)) {
    const li = document.createElement("li");
    li.textContent = `${asset.name} · ${Math.ceil(asset.size / 1024)} KB`;
    dom.uploadedList.append(li);
  }
}

function createShapeLayer(shape, rect) {
  const layer = {
    id: makeId("layer"),
    name: titleCase(shape),
    type: "shape",
    shape,
    visible: true,
    locked: false,
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    rotation: 0,
    opacity: 1,
    fill: shape === "circle" ? "#41d6b2" : "#ff7a59",
    stroke: "#f4f1ea",
    strokeWidth: 1,
    radius: shape === "rectangle" ? 8 : 999,
    sides: 5,
    events: defaultEvents(),
  };
  state.layers.push(layer);
  selectLayer(layer.id);
  activateTool("select");
}

function createTextLayer() {
  const { width, height } = state.activePreset;
  const layer = {
    id: makeId("layer"),
    name: "New Text",
    type: "text",
    visible: true,
    locked: false,
    x: Math.round(width / 2 - 170),
    y: Math.round(height / 2 - 42),
    width: 340,
    height: 84,
    rotation: 0,
    opacity: 1,
    text: "New Text",
    fontSize: 56,
    fontWeight: 700,
    color: "#f4f1ea",
    align: "center",
    events: defaultEvents(),
  };
  state.layers.push(layer);
  selectLayer(layer.id);
  activateTool("select");
  requestAnimationFrame(() => {
    const text = dom.designSurface.querySelector(`[data-layer-id="${layer.id}"] .text-layer`);
    text?.focus();
    document.execCommand?.("selectAll", false);
  });
}

function createMediaLayer(asset) {
  const layer = {
    id: makeId("layer"),
    name: asset.name,
    type: "media",
    visible: true,
    locked: false,
    x: 120,
    y: 120,
    width: 360,
    height: 240,
    rotation: 0,
    opacity: 1,
    fileName: asset.name,
    mediaKind: asset.type.startsWith("image") ? "Image" : asset.type.startsWith("video") ? "Video" : "3D Asset",
    fit: "cover",
    events: defaultEvents(),
  };
  state.layers.push(layer);
  selectLayer(layer.id);
}

function createModelLayer(modelIndex) {
  state.sourceType = "model";
  state.modelIndex = modelIndex;
  const layer = {
    id: makeId("layer"),
    name: MODEL_CATALOG[modelIndex]?.name || "Model",
    type: "model",
    visible: true,
    locked: false,
    x: 510,
    y: 210,
    width: 420,
    height: 420,
    rotation: 0,
    opacity: 1,
    modelIndex,
    lighting: 0.7,
    events: defaultEvents(),
  };
  state.layers.push(layer);
  selectLayer(layer.id);
}

function createSdfLayer(sdfIndex) {
  state.sourceType = "sdf2d";
  state.sdfIndex = sdfIndex;
  const layer = {
    id: makeId("layer"),
    name: SDF_CATALOG[sdfIndex]?.name || "SDF",
    type: "sdf",
    visible: true,
    locked: false,
    x: 540,
    y: 250,
    width: 360,
    height: 360,
    rotation: 0,
    opacity: 1,
    sdfIndex,
    smoothness: 0.2,
    events: defaultEvents(),
  };
  state.layers.push(layer);
  selectLayer(layer.id);
}

function createEffectLayer(effect) {
  const layer = {
    id: makeId("layer"),
    name: effect.name,
    type: "effect",
    visible: true,
    locked: false,
    x: 32,
    y: 32,
    width: 220,
    height: 86,
    rotation: 0,
    opacity: 0.92,
    effect: cloneEffect(effect),
    events: defaultEvents(),
  };
  state.layers.push(layer);
  selectLayer(layer.id);
}

function handleSurfacePointerDown(event) {
  updateMouse(event);
  if (state.activeTool !== "shape") {
    if (event.target === dom.designSurface) selectLayer(null);
    return;
  }

  const start = stagePoint(event);
  state.dragDraft = {
    shape: state.selectedShape,
    start,
    rect: { x: start.x, y: start.y, width: 1, height: 1 },
  };
  renderDragDraft();
}

function handleDocumentPointerMove(event) {
  if (!state.dragDraft) return;
  const point = stagePoint(event);
  const x = Math.min(point.x, state.dragDraft.start.x);
  const y = Math.min(point.y, state.dragDraft.start.y);
  const width = Math.abs(point.x - state.dragDraft.start.x);
  const height = Math.abs(point.y - state.dragDraft.start.y);
  state.dragDraft.rect = { x, y, width: Math.max(width, 1), height: Math.max(height, 1) };
  renderDragDraft();
}

function handleDocumentPointerUp() {
  if (!state.dragDraft) return;
  const rect = state.dragDraft.rect;
  const defaultSize = state.dragDraft.shape === "circle" ? 180 : 220;
  const finalRect =
    rect.width < 8 && rect.height < 8
      ? {
          x: rect.x - defaultSize / 2,
          y: rect.y - defaultSize / 2,
          width: defaultSize,
          height: state.dragDraft.shape === "rectangle" ? 140 : defaultSize,
        }
      : rect;
  removeDraftNode();
  createShapeLayer(state.dragDraft.shape, finalRect);
  state.dragDraft = null;
}

function renderDragDraft() {
  removeDraftNode();
  if (!state.dragDraft) return;
  const draft = document.createElement("div");
  draft.className = `canvas-layer draft-layer`;
  draft.dataset.draft = "true";
  draft.style.left = `${state.dragDraft.rect.x}px`;
  draft.style.top = `${state.dragDraft.rect.y}px`;
  draft.style.width = `${state.dragDraft.rect.width}px`;
  draft.style.height = `${state.dragDraft.rect.height}px`;
  const shape = document.createElement("div");
  shape.className = `shape-${state.dragDraft.shape}`;
  shape.style.background = "rgba(65, 214, 178, 0.25)";
  shape.style.borderColor = "#41d6b2";
  shape.style.borderWidth = "1px";
  draft.append(shape);
  dom.designSurface.append(draft);
}

function removeDraftNode() {
  dom.designSurface.querySelector("[data-draft='true']")?.remove();
}

function updateMouse(event) {
  const rect = dom.stageFrame.getBoundingClientRect();
  state.prevMouse = [...state.mouse];
  state.mouse = [
    clamp((event.clientX - rect.left) / rect.width, 0, 1),
    clamp(1 - (event.clientY - rect.top) / rect.height, 0, 1),
  ];
}

function selectLayer(id) {
  state.selectedLayerId = id;
  renderAll();
}

function selectedLayer() {
  return state.layers.find((layer) => layer.id === state.selectedLayerId) || null;
}

function updateLayer(layer, patch) {
  Object.assign(layer, patch);
  renderAll();
}

function duplicateLayer(id) {
  const layer = state.layers.find((item) => item.id === id);
  if (!layer) return;
  const copy = deepClone(layer);
  copy.id = makeId("layer");
  copy.name = `${layer.name} copy`;
  copy.x += 24;
  copy.y += 24;
  state.layers.push(copy);
  selectLayer(copy.id);
}

function deleteLayer(id) {
  state.layers = state.layers.filter((layer) => layer.id !== id);
  if (state.selectedLayerId === id) state.selectedLayerId = state.layers.at(-1)?.id || null;
  renderAll();
}

function saveVersion() {
  state.versions.push({
    id: makeId("version"),
    name: `Version ${state.versions.length + 1}`,
    createdAt: new Date().toLocaleTimeString(),
    snapshot: snapshotState(),
  });
  renderVersions();
}

function restoreVersion(version) {
  const snapshot = deepClone(version.snapshot);
  state.projectName = snapshot.projectName;
  state.layers = snapshot.layers;
  state.activePreset = snapshot.activePreset;
  state.selectedLayerId = snapshot.selectedLayerId;
  dom.projectNameInput.value = state.projectName;
  renderAll();
}

function snapshotState() {
  return deepClone({
    projectName: state.projectName,
    layers: state.layers,
    activePreset: state.activePreset,
    selectedLayerId: state.selectedLayerId,
  });
}

function renderAll() {
  renderLayers();
  renderCanvasLayers();
  renderInspector();
  renderTimeline();
}

function renderTimeline() {
  dom.timeMarkers.innerHTML = "";
  for (let i = 0; i <= 13; i += 1) {
    const marker = document.createElement("div");
    marker.className = "marker";
    marker.style.left = `${i * 8}%`;
    marker.textContent = (i / 10).toFixed(2);
    dom.timeMarkers.append(marker);
  }

  dom.timelineRows.innerHTML = "";
  if (!state.layers.length) {
    const empty = document.createElement("div");
    empty.className = "timeline-empty-state";
    empty.textContent = "Add an appear event using the plus icon next to a property label.";
    dom.timelineRows.append(empty);
    return;
  }

  const layerColumn = document.createElement("div");
  layerColumn.className = "timeline-layer-column";
  const propertyColumn = document.createElement("div");
  propertyColumn.className = "timeline-property-column";
  const main = document.createElement("div");
  main.className = "timeline-main";

  state.layers.forEach((layer, index) => {
    const layerCell = document.createElement("div");
    layerCell.className = "timeline-cell";
    layerCell.textContent = layer.name;
    const propertyCell = document.createElement("div");
    propertyCell.className = "timeline-cell";
    propertyCell.textContent = activeEventLabel(layer);
    const track = document.createElement("div");
    track.className = "timeline-track";
    const bar = document.createElement("div");
    bar.className = "timeline-bar";
    bar.style.left = `${3 + index * 2}%`;
    bar.style.width = `${Math.max(16, 24 - index)}%`;
    track.append(bar);
    layerColumn.append(layerCell);
    propertyColumn.append(propertyCell);
    main.append(track);
  });

  dom.timelineRows.append(layerColumn, propertyColumn, main);
}

function activeEventLabel(layer) {
  const event = Object.entries(layer.events || {}).find(([, value]) => value.enabled);
  return event ? event[0] : "No event";
}

function togglePlayback() {
  state.playing = !state.playing;
  dom.playButton.textContent = state.playing ? "Pause" : "Play";
  dom.timelinePlayButton.textContent = state.playing ? "Pause" : "Play";
  if (state.playing) {
    state.startTime = performance.now() - state.pauseOffset;
  }
}

function downloadProject() {
  const blob = new Blob([JSON.stringify(exportProject(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${state.projectName.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "shader-scene"}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function exportProject() {
  return {
    schemaVersion: "0.1.0",
    project: {
      id: "local-project",
      name: state.projectName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    scene: {
      canvas: {
        width: state.activePreset.width,
        height: state.activePreset.height,
        pixelRatio: state.hd ? 2 : 1,
        background: "#101012",
      },
      assets: state.assets.map((asset) => ({
        id: asset.id,
        kind: assetKind(asset),
        uri: asset.name,
        hash: asset.id,
        metadata: { size: asset.size, type: asset.type },
      })),
      layers: state.layers.map(projectLayer),
      interactions: state.layers.flatMap((layer) => projectInteractions(layer)),
    },
    ai: {
      intent: "Browser shader editor project with structured layers, effects, and events.",
      styleTags: ["webgl", "webgpu-ready", "ai-friendly"],
    },
  };
}

function projectLayer(layer) {
  return {
    id: layer.id,
    kind: layer.type === "sdf" ? "sdf2d" : layer.type,
    name: layer.name,
    visible: layer.visible,
    blendMode: "normal",
    transform: {
      x: layer.x,
      y: layer.y,
      width: layer.width,
      height: layer.height,
      rotation: layer.rotation,
      opacity: layer.opacity,
    },
    source: sourceForLayer(layer),
    effects: layer.type === "effect" ? [effectInstanceFor(layer)] : [],
  };
}

function sourceForLayer(layer) {
  if (layer.type === "shape") return { shape: layer.shape, fill: layer.fill, stroke: layer.stroke };
  if (layer.type === "text") return { text: layer.text, fontSize: layer.fontSize, color: layer.color };
  if (layer.type === "media") return { fileName: layer.fileName, fit: layer.fit };
  if (layer.type === "model") return { model: MODEL_CATALOG[layer.modelIndex]?.id };
  if (layer.type === "sdf") return { sdf: SDF_CATALOG[layer.sdfIndex]?.id };
  if (layer.type === "effect") return { effect: layer.effect.id };
  return {};
}

function effectInstanceFor(layer) {
  return {
    id: layer.effect.instanceId,
    effectId: layer.effect.id,
    enabled: layer.visible,
    parameters: layer.effect.params,
  };
}

function projectInteractions(layer) {
  return Object.entries(layer.events || {})
    .filter(([, event]) => event.enabled)
    .map(([trigger, event]) => ({
      id: makeId("interaction"),
      trigger,
      targetLayerId: layer.id,
      operation: {
        target: event.target,
        delay: event.delay,
        duration: event.duration,
        easing: event.easing,
      },
    }));
}

function initializeWebGL() {
  const gl = dom.canvas.getContext("webgl2", {
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  if (!gl) return;
  glState = { gl };
  compileProgram();
  resizeCanvas();
}

function compileProgram() {
  if (!glState?.gl) return;
  const gl = glState.gl;
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, buildFragmentShader(state.customBody));
  if (!vertex || !fragment) return;

  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;

  if (glState.program) gl.deleteProgram(glState.program);
  const positionBuffer = glState.positionBuffer || gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const positionLocation = gl.getAttribLocation(program, "aPosition");
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
  glState = { ...glState, program, positionBuffer, uniforms: collectUniforms(gl, program) };
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function collectUniforms(gl, program) {
  const arrayUniforms = new Set(["uEffectTypes", "uParamA", "uParamB", "uColorA", "uColorB"]);
  const names = [
    "uResolution",
    "uMouse",
    "uPrevMouse",
    "uTime",
    "uEffectCount",
    "uEffectTypes",
    "uParamA",
    "uParamB",
    "uColorA",
    "uColorB",
    "uSourceType",
    "uModelType",
    "uSdfType",
  ];
  return Object.fromEntries(
    names.map((name) => [name, gl.getUniformLocation(program, arrayUniforms.has(name) ? `${name}[0]` : name)]),
  );
}

function resizeCanvas() {
  if (!glState?.gl) return;
  const dpr = state.hd ? Math.min(window.devicePixelRatio || 1, 2) : 1;
  const width = Math.max(1, Math.floor(dom.canvas.clientWidth * dpr));
  const height = Math.max(1, Math.floor(dom.canvas.clientHeight * dpr));
  if (dom.canvas.width !== width || dom.canvas.height !== height) {
    dom.canvas.width = width;
    dom.canvas.height = height;
  }
  glState.gl.viewport(0, 0, width, height);
}

function renderLoop(now = performance.now()) {
  requestAnimationFrame(renderLoop);
  if (!glState?.program) return;
  if (state.playing) state.pauseOffset = now - state.startTime;
  draw(state.pauseOffset / 1000);
  dom.playhead.style.left = `${170 + ((state.pauseOffset / 1000) % 1.3) * 240}px`;
}

function draw(time) {
  const gl = glState.gl;
  resizeCanvas();
  gl.useProgram(glState.program);

  const effectLayers = state.layers
    .filter((layer) => layer.type === "effect" && layer.visible)
    .slice(0, MAX_EFFECTS);
  const effectTypes = new Int32Array(MAX_EFFECTS);
  const paramA = new Float32Array(MAX_EFFECTS * 4);
  const paramB = new Float32Array(MAX_EFFECTS * 4);
  const colorA = new Float32Array(MAX_EFFECTS * 3);
  const colorB = new Float32Array(MAX_EFFECTS * 3);

  effectLayers.forEach((layer, index) => {
    const item = layer.effect;
    effectTypes[index] = item.shaderType;
    paramA.set(
      [item.params.intensity, item.params.scale, item.params.speed, item.params.amount],
      index * 4,
    );
    paramB.set([item.params.softness, item.params.phase, 0, 0], index * 4);
    colorA.set(hexToRgb(item.params.colorA), index * 3);
    colorB.set(hexToRgb(item.params.colorB), index * 3);
  });

  const selectedModel = state.layers.find((layer) => layer.type === "model" && layer.visible);
  const selectedSdf = state.layers.find((layer) => layer.type === "sdf" && layer.visible);
  const sourceType = selectedSdf ? "sdf2d" : selectedModel ? "model" : state.sourceType;

  const uniforms = glState.uniforms;
  gl.uniform2f(uniforms.uResolution, dom.canvas.width, dom.canvas.height);
  gl.uniform2f(uniforms.uMouse, state.mouse[0], state.mouse[1]);
  gl.uniform2f(uniforms.uPrevMouse, state.prevMouse[0], state.prevMouse[1]);
  gl.uniform1f(uniforms.uTime, time);
  gl.uniform1i(uniforms.uEffectCount, effectLayers.length);
  gl.uniform1iv(uniforms.uEffectTypes, effectTypes);
  gl.uniform4fv(uniforms.uParamA, paramA);
  gl.uniform4fv(uniforms.uParamB, paramB);
  gl.uniform3fv(uniforms.uColorA, colorA);
  gl.uniform3fv(uniforms.uColorB, colorB);
  gl.uniform1i(uniforms.uSourceType, sourceIndex.get(sourceType) ?? 0);
  gl.uniform1i(uniforms.uModelType, selectedModel?.modelIndex ?? state.modelIndex);
  gl.uniform1i(uniforms.uSdfType, selectedSdf?.sdfIndex ?? state.sdfIndex);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function group(title, controls) {
  const section = document.createElement("section");
  section.className = "control-group";
  const heading = document.createElement("h3");
  heading.textContent = title;
  const grid = document.createElement("div");
  grid.className = "control-grid";
  controls.forEach((control) => grid.append(control));
  section.append(heading, grid);
  return section;
}

function parameterBlock(label, control, options = {}) {
  const row = document.createElement("div");
  row.className = "parameter parameter__block";

  const labelWrap = document.createElement("span");
  labelWrap.className = "icon-label no-select slider-label relative param-label-container";
  if (options.event) {
    const eventButton = document.createElement("button");
    eventButton.className = "timeline-prop-handle";
    eventButton.title = "Click to create an event";
    eventButton.innerHTML = `<span class="timeline-prop-handle-dot">${iconSvg("plus")}</span>`;
    eventButton.addEventListener("click", () => {
      const layer = selectedLayer();
      if (!layer) return;
      layer.events[options.event].enabled = true;
      state.inspectorTab = "events";
      renderInspector();
      renderTimeline();
    });
    labelWrap.append(eventButton);
  }
  const labelText = document.createElement("span");
  labelText.className = "param-label";
  labelText.textContent = label;
  labelWrap.append(labelText);
  if (options.info) {
    const info = document.createElement("span");
    info.className = "info-dot";
    info.textContent = "i";
    labelWrap.append(info);
  }

  row.append(labelWrap, control);
  return row;
}

function sectionLabel(label) {
  const row = document.createElement("div");
  row.className = "parameter parameter__block section-label-row";
  const strong = document.createElement("label");
  strong.className = "parameter-label";
  strong.textContent = label;
  row.append(strong);
  return row;
}

function alignmentToolbar(layer) {
  const wrap = document.createElement("div");
  wrap.className = "alignment-toolbar";
  const actions = [
    ["left", "Align left", () => (layer.x = 0)],
    ["centerH", "Align horizontal center", () => (layer.x = Math.round((state.activePreset.width - layer.width) / 2))],
    ["right", "Align right", () => (layer.x = state.activePreset.width - layer.width)],
    ["top", "Align top", () => (layer.y = 0)],
    ["centerV", "Align vertical center", () => (layer.y = Math.round((state.activePreset.height - layer.height) / 2))],
    ["bottom", "Align bottom", () => (layer.y = state.activePreset.height - layer.height)],
  ];
  actions.forEach(([icon, title, run]) => {
    const button = document.createElement("button");
    button.className = "button icon";
    button.title = title;
    button.innerHTML = iconSvg(icon);
    button.addEventListener("click", () => {
      run();
      renderAll();
    });
    wrap.append(button);
  });
  return wrap;
}

function toggleSegment(activeIndex, labels, onChange) {
  const wrap = document.createElement("div");
  wrap.className = "toggle-group";
  labels.forEach((label, index) => {
    const item = document.createElement("button");
    item.className = `classic-toggle${index === activeIndex ? " classic-toggle__active" : ""}`;
    item.textContent = label;
    item.addEventListener("click", () => {
      onChange(index);
      [...wrap.children].forEach((child, childIndex) =>
        child.classList.toggle("classic-toggle__active", childIndex === index),
      );
    });
    wrap.append(item);
  });
  return wrap;
}

function coordsInput(coords, onChange, unit) {
  const wrap = document.createElement("div");
  wrap.className = "coords-input-group";
  const values = {};
  coords.forEach(([label, value]) => {
    values[label] = value;
    const item = document.createElement("span");
    item.className = "parameter-output w-100 flex align-center hidden-slider relative";
    item.innerHTML = `<span class="coords-label">${label}</span>`;
    const input = document.createElement("input");
    input.className = "input-field input-field__label";
    input.type = "number";
    input.step = "0.1";
    input.value = String(value);
    input.addEventListener("input", () => {
      values[label] = Number(input.value);
      onChange(values);
    });
    const units = document.createElement("span");
    units.className = "output-units";
    units.textContent = unit;
    item.append(input, units);
    wrap.append(item);
  });
  return wrap;
}

function sizeInput(value, mode, onChange) {
  const wrap = document.createElement("div");
  wrap.className = "size-input-wrapper w-100 flex";
  const output = document.createElement("span");
  output.className = "parameter-output w-100 flex align-center hidden-slider relative";
  const input = document.createElement("input");
  input.className = "input-field";
  input.type = "number";
  input.value = String(Math.round(value));
  const units = document.createElement("span");
  units.className = "output-units";
  units.textContent = "px";
  output.append(input, units);
  const select = compactSelect(
    mode,
    [
      ["fixed", "Fixed"],
      ["fill", "Fill"],
      ["hug", "Hug"],
    ],
    (nextMode) => onChange(Number(input.value), nextMode),
  );
  input.addEventListener("input", () => onChange(Number(input.value), select.querySelector("select").value));
  wrap.append(output, select);
  return wrap;
}

function compactSelect(value, options, onChange) {
  const wrap = document.createElement("div");
  wrap.className = "dropdown";
  const select = document.createElement("select");
  options.forEach(([optionValue, optionLabel]) => {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = optionLabel;
    select.append(option);
  });
  select.value = value;
  select.addEventListener("change", () => onChange(select.value));
  wrap.append(select);
  return wrap;
}

function sliderInput(value, min, max, step, unit, onChange) {
  const wrap = document.createElement("div");
  wrap.className = "param-width flex ml-auto";
  const container = document.createElement("div");
  container.className = "slider-input-container";
  const output = document.createElement("span");
  output.className = "parameter-output w-100 flex align-center hidden-slider relative";
  const input = document.createElement("input");
  input.className = "input-field";
  input.type = "number";
  input.value = String(value);
  input.step = String(step);
  const units = document.createElement("span");
  units.className = "output-units";
  units.textContent = unit;
  output.append(input, units);
  const track = document.createElement("div");
  track.className = "slider-input-track";
  const range = document.createElement("input");
  range.type = "range";
  range.min = String(min);
  range.max = String(max);
  range.step = String(step);
  range.value = String(value);
  const update = (nextValue) => {
    input.value = String(nextValue);
    range.value = String(nextValue);
    onChange(Number(nextValue));
  };
  input.addEventListener("input", () => update(input.value));
  range.addEventListener("input", () => update(range.value));
  track.append(range);
  container.append(output, track);
  wrap.append(container);
  return wrap;
}

function colorInput(value, onChange) {
  const wrap = document.createElement("div");
  wrap.className = "w-100 selected-color-container";
  const swatch = document.createElement("div");
  swatch.className = "selected-color";
  swatch.style.background = value;
  const input = document.createElement("input");
  input.className = "color-input";
  input.value = value.replace("#", "");
  const native = document.createElement("input");
  native.type = "color";
  native.value = value;
  native.addEventListener("input", () => {
    input.value = native.value.replace("#", "");
    swatch.style.background = native.value;
    onChange(native.value);
  });
  input.addEventListener("change", () => {
    const next = `#${input.value.replace("#", "")}`;
    native.value = next;
    swatch.style.background = next;
    onChange(next);
  });
  wrap.append(swatch, input, native);
  return wrap;
}

function colorAndSizeInput(color, size, onChange) {
  const wrap = document.createElement("div");
  wrap.className = "flex stroke-control";
  let currentColor = color;
  const colorControl = colorInput(color, (value) => {
    currentColor = value;
    onChange(currentColor, Number(sizeInput.value));
  });
  const output = document.createElement("span");
  output.className = "parameter-output w-100 flex align-center hidden-slider relative";
  const sizeInput = document.createElement("input");
  sizeInput.className = "input-field";
  sizeInput.type = "number";
  sizeInput.value = String(size);
  sizeInput.addEventListener("input", () => onChange(currentColor, Number(sizeInput.value)));
  const units = document.createElement("span");
  units.className = "output-units";
  units.textContent = "px";
  output.append(sizeInput, units);
  wrap.append(colorControl, output);
  return wrap;
}

function radioGroup(activeValue, labels, onChange) {
  const wrap = document.createElement("div");
  wrap.className = "radio-group";
  labels.forEach((label) => {
    const button = document.createElement("button");
    button.className = `radio${label === activeValue ? " radio__active" : ""}`;
    button.textContent = label;
    button.addEventListener("click", () => {
      onChange(label);
      [...wrap.children].forEach((child) => child.classList.toggle("radio__active", child === button));
    });
    wrap.append(button);
  });
  return wrap;
}

function normalizeShapeLayer(layer) {
  layer.mask ??= true;
  layer.fitToArtboard ??= false;
  layer.anchor ??= "top-left";
  layer.widthMode ??= "fixed";
  layer.heightMode ??= "fixed";
  layer.feather ??= 0;
  layer.blendMode ??= "normal";
  layer.displace ??= true;
  layer.interactivePosition ??= 0;
  layer.rotation3d ??= 0;
  layer.momentum ??= 0;
  layer.spring ??= 0;
  layer.mouseAxes ??= "Both";
}

function percent(value, total) {
  return Math.round((value / total) * 1000) / 10;
}


function textField(label, value, onChange) {
  const field = baseField(label);
  const input = document.createElement("input");
  input.value = value ?? "";
  input.addEventListener("input", () => onChange(input.value));
  field.append(input);
  return field;
}

function textareaField(label, value, onChange) {
  const field = baseField(label);
  field.style.gridColumn = "1 / -1";
  const input = document.createElement("textarea");
  input.value = value ?? "";
  input.addEventListener("change", () => onChange(input.value));
  field.append(input);
  return field;
}

function numberField(label, value, onChange, step = 1) {
  const field = baseField(label);
  const input = document.createElement("input");
  input.type = "number";
  input.step = String(step);
  input.value = String(value ?? 0);
  input.addEventListener("input", () => onChange(Number(input.value)));
  field.append(input);
  return field;
}

function rangeField(label, value, min, max, step, onChange) {
  const field = baseField(label);
  const row = document.createElement("div");
  row.className = "range-value-row";
  const input = document.createElement("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value ?? 0);
  const output = document.createElement("output");
  output.textContent = Number(input.value).toFixed(2);
  input.addEventListener("input", () => {
    output.textContent = Number(input.value).toFixed(2);
    onChange(Number(input.value));
  });
  row.append(input, output);
  field.append(row);
  return field;
}

function colorField(label, value, onChange) {
  const field = baseField(label);
  const input = document.createElement("input");
  input.type = "color";
  input.value = value || "#ffffff";
  input.addEventListener("input", () => onChange(input.value));
  field.append(input);
  return field;
}

function checkboxField(label, value, onChange) {
  const field = baseField(label);
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = Boolean(value);
  input.addEventListener("input", () => onChange(input.checked));
  field.append(input);
  return field;
}

function selectField(label, value, options, onChange) {
  const field = baseField(label);
  const select = document.createElement("select");
  for (const [optionValue, optionLabel] of options) {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = optionLabel;
    select.append(option);
  }
  select.value = value;
  select.addEventListener("change", () => onChange(select.value));
  field.append(select);
  return field;
}

function baseField(label) {
  const field = document.createElement("label");
  field.className = "field";
  const span = document.createElement("span");
  span.textContent = label;
  field.append(span);
  return field;
}

function miniButton(label, title, onClick) {
  const button = document.createElement("button");
  button.className = "mini-button";
  button.type = "button";
  button.textContent = label;
  button.title = title;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick();
  });
  return button;
}

function closeFloatingMenus(event) {
  if (!event.target.closest(".tool-menu")) dom.shapeMenu.hidden = true;
  if (!event.target.closest(".preset-picker")) dom.sizePresetMenu.hidden = true;
}

function stagePoint(event) {
  const rect = dom.stageFrame.getBoundingClientRect();
  return {
    x: clamp((event.clientX - rect.left) / state.zoom, 0, state.activePreset.width),
    y: clamp((event.clientY - rect.top) / state.zoom, 0, state.activePreset.height),
  };
}

function layerLabel(layer) {
  if (layer.type === "shape") return `${titleCase(layer.shape)} · ${Math.round(layer.width)} x ${Math.round(layer.height)}`;
  if (layer.type === "effect") return `Effect · ${layer.effect.category}`;
  if (layer.type === "model") return "Model preset";
  if (layer.type === "sdf") return "SDF source";
  if (layer.type === "media") return layer.mediaKind;
  return titleCase(layer.type);
}

function shapeIcon(shape) {
  if (shape === "circle") return "C";
  if (shape === "polygon") return "P";
  return "R";
}

function titleCase(value) {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

function labelFor(label, family) {
  const labels = {
    glyph: { Scale: "Cell Density", Amount: "Glyph Fill" },
    beam: { Scale: "Ray Count", Amount: "Light Strength" },
    caustics: { Scale: "Wave Density", Softness: "Band Width" },
    ripple: { Scale: "Wave Frequency", Amount: "Displacement" },
    liquify: { Scale: "Field Scale", Amount: "Warp Amount" },
    blur: { Scale: "Sample Radius", Amount: "Blur Mix" },
    blocks: { Scale: "Grid Cells", Amount: "Block Mix" },
    mondrian: { Scale: "Division Count", Amount: "Paint Mix" },
    sdf2d: { Scale: "Shape Scale", Amount: "Fill Mix" },
    sdf3d: { Scale: "March Scale", Amount: "Model Mix" },
  };
  return labels[family]?.[label] || label;
}

function defaultEvents() {
  const event = () => ({
    enabled: false,
    target: "opacity",
    delay: 0,
    duration: 0.6,
    easing: "easeOut",
  });
  return {
    appear: event(),
    hover: event(),
    mouseMove: event(),
    scroll: event(),
    click: event(),
  };
}

function assetKind(asset) {
  if (asset.type.startsWith("image")) return "image";
  if (asset.type.startsWith("video")) return "video";
  if (asset.name.endsWith(".gltf")) return "gltf";
  if (asset.name.endsWith(".glb")) return "glb";
  if (asset.name.endsWith(".svg")) return "svg";
  return "texture";
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  const int = Number.parseInt(value, 16);
  return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function makeId(prefix) {
  const random = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  return `${prefix}-${random}`;
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

init();

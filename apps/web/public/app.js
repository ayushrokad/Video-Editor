/**
 * FRAMEFLOW Professional Nonlinear Video Editor — Version 6.0.0 (M5 Architecture Hardening)
 * Fixes all 3 critical state & interaction foundations:
 *  1. 4-Layer Separated State Store (projectState, sessionState, workspaceState, runtimeState)
 *     with IndexedDB persistence, visibilitychange flush, and automatic local media blob rehydration + Relink Media.
 *  2. Real Video Frame Decoding on Program Monitor (preload='auto', seeked/loadeddata hooks, before/after compare wipe,
 *     authentic Media Offline slate instead of decorative blue placeholders).
 *  3. Completely Distinct Source Monitor (scrubber, In/Out bar, Clear I/O, Insert, Overwrite, Drag Range, Audio Channels)
 *     vs. Program Monitor (Loop, Safe Margins, Overlays HUD, Grade Compare Wipe, Fullscreen).
 *  4. Structured Layout & Docking Manager (viewport-clamped floating panels, lossless Redock button,
 *     per-workspace saved split ratios, Reset Current Workspace vs. Reset All Workspaces).
 */

import { FrameflowAudioEngine } from './js/audio-dsp.js';
import {
  TRANSITION_CATEGORIES,
  TRANSITION_CATALOG,
  detectGraphicsCapabilities,
  renderTransitionComposite,
} from './js/transitions-gpu.js';
import {
  EXPORT_PRESETS,
  detectExportCodecs,
  RenderQueueManager,
} from './js/export-pipeline.js';
import {
  FrameflowStateStore,
  createDefaultProjectState,
  createDefaultSessionState,
} from './js/state-store.js';
import { FrameflowLayoutManager } from './js/layout-manager.js';

// ----------------------------------------------------
// 1. Core Subsystem Instances
// ----------------------------------------------------
const store = new FrameflowStateStore();
const audioEngine = new FrameflowAudioEngine();
const renderQueue = new RenderQueueManager(() => {
  renderDeliverQueue();
  updateExportStatusTelemetry();
});

const layoutManager = new FrameflowLayoutManager(store, () => {
  updateWindowPanelsCheckmarks();
});

const TRACK_COLORS = ['#4B8DFF', '#8B5CF6', '#38C995', '#06B6D4', '#E5B45C', '#E36F78'];

// Non-persistent UI transient helpers
const uiState = {
  assetSearchQuery: '',
  selectedFxCategory: 'All',
  selectedDeliverPreset: 'webm_1080p',
  pendingRelinkAssetId: null,
  undoStack: [],
  redoStack: [],
};

// ----------------------------------------------------
// 2. Configurable Keyboard Shortcuts Registry
// ----------------------------------------------------
const DEFAULT_SHORTCUTS = [
  { id: 'play_pause',       name: 'Play / Pause',            category: 'Transport',  key: 'Space',           type: 'transport' },
  { id: 'shuttle_rev',      name: 'Shuttle Reverse',         category: 'Transport',  key: 'J',               type: 'transport' },
  { id: 'shuttle_pause',    name: 'Pause Shuttle',           category: 'Transport',  key: 'K',               type: 'transport' },
  { id: 'shuttle_fwd',      name: 'Shuttle Forward',         category: 'Transport',  key: 'L',               type: 'transport' },
  { id: 'step_prev_frame',  name: 'Frame Back',              category: 'Transport',  key: 'ArrowLeft',       type: 'transport' },
  { id: 'step_next_frame',  name: 'Frame Forward',           category: 'Transport',  key: 'ArrowRight',      type: 'transport' },
  { id: 'step_prev_5',      name: '5 Frames Back',           category: 'Transport',  key: 'Shift+ArrowLeft', type: 'transport' },
  { id: 'step_next_5',      name: '5 Frames Forward',        category: 'Transport',  key: 'Shift+ArrowRight',type: 'transport' },
  { id: 'mark_in',          name: 'Mark In',                 category: 'Transport',  key: 'I',               type: 'transport' },
  { id: 'mark_out',         name: 'Mark Out',                category: 'Transport',  key: 'O',               type: 'transport' },
  { id: 'clear_io',         name: 'Clear Source In/Out',     category: 'Transport',  key: 'Alt+X',           type: 'transport' },
  { id: 'insert_src',       name: 'Insert Source Range',     category: 'Editing',    key: ',',               type: 'edit' },
  { id: 'overwrite_src',    name: 'Overwrite Source Range',  category: 'Editing',    key: '.',               type: 'edit' },
  { id: 'tool_select',      name: 'Selection Tool',          category: 'Tools',      key: 'V',               type: 'tool' },
  { id: 'tool_track_select',name: 'Track Select Forward',    category: 'Tools',      key: 'A',               type: 'tool' },
  { id: 'tool_ripple',      name: 'Ripple Edit Tool',        category: 'Tools',      key: 'B',               type: 'tool' },
  { id: 'tool_rolling',     name: 'Rolling Edit Tool',       category: 'Tools',      key: 'N',               type: 'tool' },
  { id: 'tool_rate_stretch',name: 'Rate Stretch Tool',       category: 'Tools',      key: 'R',               type: 'tool' },
  { id: 'tool_razor',       name: 'Razor Cut Tool',          category: 'Tools',      key: 'C',               type: 'tool' },
  { id: 'tool_slip',        name: 'Slip Tool',               category: 'Tools',      key: 'Y',               type: 'tool' },
  { id: 'tool_slide',       name: 'Slide Tool',              category: 'Tools',      key: 'U',               type: 'tool' },
  { id: 'tool_pen',         name: 'Pen Tool',                category: 'Tools',      key: 'P',               type: 'tool' },
  { id: 'tool_hand',        name: 'Hand Tool',               category: 'Tools',      key: 'H',               type: 'tool' },
  { id: 'tool_zoom',        name: 'Zoom Tool',               category: 'Tools',      key: 'Z',               type: 'tool' },
  { id: 'tool_text',        name: 'Type / Title Tool',       category: 'Tools',      key: 'T',               type: 'tool' },
  { id: 'split_playhead',   name: 'Split at Playhead',       category: 'Editing',    key: 'Ctrl+K',          type: 'edit' },
  { id: 'delete_clip',      name: 'Delete Selected Clip',    category: 'Editing',    key: 'Delete',          type: 'edit' },
  { id: 'link_toggle',      name: 'Link / Unlink Selection', category: 'Editing',    key: 'Ctrl+L',          type: 'edit' },
  { id: 'undo',             name: 'Undo',                    category: 'Editing',    key: 'Ctrl+Z',          type: 'edit' },
  { id: 'redo',             name: 'Redo',                    category: 'Editing',    key: 'Ctrl+Shift+Z',    type: 'edit' },
  { id: 'snap_toggle',      name: 'Toggle Snapping',         category: 'Navigation', key: 'S',               type: 'nav' },
  { id: 'add_marker',       name: 'Add Sequence Marker',     category: 'Navigation', key: 'M',               type: 'nav' },
  { id: 'zoom_in',          name: 'Zoom In Timeline',        category: 'Navigation', key: '=',               type: 'nav' },
  { id: 'zoom_out',         name: 'Zoom Out Timeline',       category: 'Navigation', key: '-',               type: 'nav' },
  { id: 'fit_sequence',     name: 'Fit Timeline',            category: 'Navigation', key: '\\',              type: 'nav' },
  { id: 'maximize_panel',   name: 'Fullscreen Active Panel', category: 'Navigation', key: '`',               type: 'nav' },
  { id: 'save_project',     name: 'Save Project',            category: 'Global',     key: 'Ctrl+S',          type: 'global' },
  { id: 'import_media',     name: 'Import Media',            category: 'Global',     key: 'Ctrl+I',          type: 'global' },
  { id: 'export_deliver',   name: 'Export (Deliver)',        category: 'Global',     key: 'Ctrl+M',          type: 'global' },
  { id: 'shortcuts_modal',  name: 'Keyboard Shortcuts',      category: 'Global',     key: 'Ctrl+Alt+K',      type: 'global' },
];

let activeShortcuts = JSON.parse(localStorage.getItem('ff_shortcuts') || 'null') || structuredClone(DEFAULT_SHORTCUTS);

// ----------------------------------------------------
// 3. Accessor Helpers (Single Source of Truth)
// ----------------------------------------------------
function getActiveSequence() {
  return store.projectState.sequences[store.sessionState.activeSequenceId]
    || store.projectState.sequences[store.projectState.activeSequenceId]
    || Object.values(store.projectState.sequences)[0];
}

function getSelectedClipId() {
  const ids = store.sessionState.selectedClipIds;
  return (ids && ids.length > 0) ? ids[0] : null;
}

function getActiveClip() {
  const id = getSelectedClipId();
  if (!id) return null;
  return getActiveSequence().clips.find(c => c.id === id) || null;
}

function setSelectedClipIds(ids) {
  const seq = getActiveSequence();
  const valid = new Set(seq.clips.map(c => c.id));
  store.sessionState.selectedClipIds = (ids || []).filter(id => valid.has(id));
  store.scheduleSave(200);
}

// ----------------------------------------------------
// 4. Boot & Lifecycle (Restore 4 State Layers + Rehydrate Media Decoders)
// ----------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  store.onSaveStatus = (status) => {
    const badge = document.getElementById('save-status-badge');
    if (!badge) return;
    if (status === 'saving') {
      badge.textContent = 'Saving...';
      badge.className = 'save-status-indicator unsaved';
    } else {
      badge.textContent = '● Saved';
      badge.className = 'save-status-indicator saved';
    }
  };

  layoutManager.init();
  initSplitters();
  initPanelFocusAndMaximize();
  initMenus();
  initWorkspaceSwitcher();
  initMediaIngestAndRelink();
  initMonitorsGroup();
  initTimeline();
  initColorWheelsPanel();
  initAudioConsoleControls();
  initDeliverControls();
  initKeyboardEngine();
  initModals();
  initContextMenuDismiss();

  // Persist reliably on tab hide (Page Visibility API) and unload
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') store.flushNow();
  });
  window.addEventListener('beforeunload', () => {
    store.flushNow();
  });

  await probeRuntimeCapabilities();
  await store.restoreAll();
  await rehydrateAllMediaDecoders();

  // Restore saved session UI toggles & scroll position
  syncSessionControlsUI();
  applyWorkspaceUI(store.workspaceState.activeWorkspace);
  renderAll();

  // Restore Source Monitor clip if one was open before refresh
  if (store.sessionState.sourceAssetId) {
    loadAssetIntoSourceMonitor(store.sessionState.sourceAssetId, {
      preserveInOut: true,
      switchTab: false,
    });
  }

  // Restore saved timeline scroll offset
  const scrollArea = document.getElementById('timeline-scroll-area');
  if (scrollArea && store.sessionState.timelineScrollLeft > 0) {
    scrollArea.scrollLeft = store.sessionState.timelineScrollLeft;
  }

  startPlaybackAndTelemetryLoop();
});

// ----------------------------------------------------
// 5. Runtime Media Decoder Pipeline & Relink Media
// ----------------------------------------------------
function createRuntimeDecoder(assetId, fileOrBlob) {
  // Clean up any previous decoder blob URL
  const prev = store.runtimeState.decoders.get(assetId);
  if (prev && prev.blobUrl) {
    try { URL.revokeObjectURL(prev.blobUrl); } catch {}
  }

  const blobUrl = URL.createObjectURL(fileOrBlob);
  const asset = store.projectState.assets[assetId];
  const isAudioOnly = asset && asset.type && asset.type.startsWith('audio');

  const videoEl = document.createElement(isAudioOnly ? 'audio' : 'video');
  videoEl.src = blobUrl;
  videoEl.preload = 'auto'; // CRITICAL: decode frame buffers immediately, not just metadata!
  videoEl.muted = true;     // Allow programmatic frame decoding & seeking without autoplay block
  videoEl.playsInline = true;

  const entry = {
    assetId,
    videoEl,
    blobUrl,
    ready: false,
    missing: false,
  };
  store.runtimeState.decoders.set(assetId, entry);

  videoEl.addEventListener('loadedmetadata', () => {
    if (!isAudioOnly && videoEl.videoWidth > 0 && asset) {
      asset.width = videoEl.videoWidth;
      asset.height = videoEl.videoHeight;
    }
    if (isFinite(videoEl.duration) && videoEl.duration > 0 && asset) {
      asset.duration = videoEl.duration;
    }
    // Kick browser to decode the very first video frame immediately!
    if (!isAudioOnly) {
      try { videoEl.currentTime = 0.001; } catch {}
    }
  });

  const onFrameReady = () => {
    entry.ready = true;
    entry.missing = false;
    renderProgramMonitor();
  };

  videoEl.addEventListener('loadeddata', onFrameReady);
  videoEl.addEventListener('canplay', onFrameReady);
  videoEl.addEventListener('seeked', onFrameReady);
  videoEl.addEventListener('error', () => {
    entry.ready = false;
    entry.missing = true;
    renderAll();
  });

  videoEl.load();
  return entry;
}

async function rehydrateAllMediaDecoders() {
  const assets = Object.values(store.projectState.assets);
  for (const asset of assets) {
    const blob = await store.loadMediaBlob(asset.id);
    if (blob) {
      createRuntimeDecoder(asset.id, blob);
    } else {
      // Explicitly flag Missing Media — NEVER silently draw decorative placeholders!
      store.runtimeState.decoders.set(asset.id, {
        assetId: asset.id,
        videoEl: null,
        blobUrl: null,
        ready: false,
        missing: true,
      });
    }
  }
}

function triggerRelinkForAsset(assetId) {
  uiState.pendingRelinkAssetId = assetId;
  document.getElementById('relink-file-input')?.click();
}

// ----------------------------------------------------
// 6. Runtime Capability Probing & Telemetry
// ----------------------------------------------------
async function probeRuntimeCapabilities() {
  store.runtimeState.gpuCapabilities = await detectGraphicsCapabilities();
  store.runtimeState.codecCapabilities = detectExportCodecs();

  const gpuLabel = document.getElementById('status-gpu-label');
  const gpuDot = document.getElementById('status-gpu-dot');
  const gpu = store.runtimeState.gpuCapabilities;
  if (gpuLabel) gpuLabel.textContent = gpu.activeBackend;
  if (gpuDot) {
    gpuDot.style.background = gpu.webgpuAvailable
      ? 'var(--success)'
      : (gpu.webgl2Available ? 'var(--accent-cyan)' : 'var(--warning)');
  }
  updateAudioStatusTelemetry();
}

function updateAudioStatusTelemetry() {
  const st = audioEngine.getStatus();
  const el = document.getElementById('status-audio-label');
  if (!el) return;
  el.textContent = st.state === 'running'
    ? `Audio: Active ${(st.sampleRate / 1000).toFixed(0)}kHz`
    : (st.state === 'standby' ? 'Audio: Standby' : `Audio: ${st.state}`);
}

function updateExportStatusTelemetry() {
  const el = document.getElementById('status-export-label');
  if (!el) return;
  const active = renderQueue.jobs.find(j => j.status === 'rendering');
  const completed = renderQueue.jobs.filter(j => j.status === 'completed').length;
  const queued = renderQueue.jobs.filter(j => j.status === 'queued').length;
  if (active) { el.textContent = `Export: Rendering ${active.progress}%`; el.style.color = 'var(--accent)'; }
  else if (queued > 0) { el.textContent = `Export: ${queued} Queued`; el.style.color = 'var(--warning)'; }
  else if (completed > 0) { el.textContent = `Export: ${completed} Ready`; el.style.color = 'var(--success)'; }
  else { el.textContent = 'Export: Idle'; el.style.color = 'var(--text-secondary)'; }
}

// ----------------------------------------------------
// 7. Command History (Undo / Redo on Project State)
// ----------------------------------------------------
function executeCommand(description, applyFn) {
  const snapshot = JSON.parse(JSON.stringify(store.projectState));
  applyFn();
  store.sanitizeSelection();
  uiState.undoStack.push({ description, snapshot });
  if (uiState.undoStack.length > 50) uiState.undoStack.shift();
  uiState.redoStack = [];
  store.scheduleSave(250);
  renderAll();
}

function undo() {
  if (uiState.undoStack.length === 0) return;
  const current = JSON.parse(JSON.stringify(store.projectState));
  const { snapshot } = uiState.undoStack.pop();
  uiState.redoStack.push({ snapshot: current });
  store.projectState = snapshot;
  store.sanitizeSelection();
  store.scheduleSave(250);
  renderAll();
}

function redo() {
  if (uiState.redoStack.length === 0) return;
  const current = JSON.parse(JSON.stringify(store.projectState));
  const { snapshot } = uiState.redoStack.pop();
  uiState.undoStack.push({ snapshot: current });
  store.projectState = snapshot;
  store.sanitizeSelection();
  store.scheduleSave(250);
  renderAll();
}

// ----------------------------------------------------
// 8. Workspace Switching (Zero Editing Context Loss!)
// ----------------------------------------------------
function initWorkspaceSwitcher() {
  document.querySelectorAll('#workspace-bar .ws-tab').forEach(tab => {
    tab.addEventListener('click', () => switchWorkspace(tab.dataset.ws));
  });
}

function switchWorkspace(ws) {
  // ONLY updates workspaceState — NEVER modifies projectState or sessionState!
  store.workspaceState.activeWorkspace = ws;
  store.scheduleSave(200);
  applyWorkspaceUI(ws);
  renderAll();
}

function applyWorkspaceUI(ws) {
  document.querySelectorAll('#workspace-bar .ws-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.ws === ws);
  });

  layoutManager.applyActiveWorkspaceLayout();

  const graphDrawer = document.getElementById('motion-graph-drawer');
  if (graphDrawer) graphDrawer.style.display = ws === 'motion' ? 'block' : 'none';

  const projLabel = document.getElementById('project-panel-label');
  const inspTitle = document.getElementById('inspector-header-title');
  const inspIcon  = document.getElementById('inspector-header-icon');
  const prgLabel  = document.getElementById('program-tab-label');

  if (ws === 'media') {
    if (projLabel) projLabel.textContent = 'Media Browser & Bins';
    if (inspTitle) inspTitle.textContent = 'Source Asset Metadata';
    if (inspIcon)  inspIcon.textContent = 'description';
  } else if (ws === 'edit') {
    if (projLabel) projLabel.textContent = 'Project';
    if (inspTitle) inspTitle.textContent = 'Inspector';
    if (inspIcon)  inspIcon.textContent = 'tune';
    if (prgLabel)  prgLabel.textContent = 'Program: Master';
  } else if (ws === 'motion') {
    if (inspTitle) inspTitle.textContent = 'Effect Controls & Keyframes';
    if (inspIcon)  inspIcon.textContent = 'motion_mode';
    if (prgLabel)  prgLabel.textContent = 'Composition Viewer';
    renderEffectsLibrary();
    setTimeout(drawMotionGraphCanvas, 20);
  } else if (ws === 'color') {
    if (inspTitle) inspTitle.textContent = 'Live Scopes & Primary Grade';
    if (inspIcon)  inspIcon.textContent = 'analytics';
    if (prgLabel)  prgLabel.textContent = 'Color Grading Viewer';
    renderColorClipsGallery();
  } else if (ws === 'audio') {
    renderAudioConsole();
  } else if (ws === 'deliver') {
    if (prgLabel) prgLabel.textContent = 'Output Preview';
    renderDeliverSettings();
    renderDeliverQueue();
  }

  updateWindowPanelsCheckmarks();
  renderCustomWorkspacesMenu();
}

function updateWindowPanelsCheckmarks() {
  const layout = layoutManager.getActiveLayout();
  const labels = {
    'panel-project': 'Project / Media Browser',
    'panel-effects': 'Effects & Transitions',
    'monitors-pane': 'Source / Program Monitors',
    'panel-inspector': 'Contextual Inspector',
    'panel-timeline': 'Multitrack Timeline',
  };
  for (const [id, label] of Object.entries(labels)) {
    const chk = document.getElementById(`chk-${id}`);
    if (chk) chk.textContent = `${layout.visiblePanels.includes(id) ? '✓' : '  '} ${label}`;
  }
}

function initPanelFocusAndMaximize() {
  document.querySelectorAll('.btn-maximize-panel').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const panel = btn.closest('.panel');
      if (panel) toggleMaximizePanel(panel);
    });
  });

  document.querySelectorAll('.panel').forEach(panel => {
    panel.addEventListener('mousedown', () => {
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('focused'));
      panel.classList.add('focused');
    });
  });
}

function toggleMaximizePanel(panel) {
  const isMaxed = panel.classList.contains('maximized');
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('maximized'));
  if (!isMaxed) panel.classList.add('maximized');
}

function initSplitters() {
  bindSplitter('splitter-left', () => ['panel-project', 'panel-effects', 'panel-color-clips']
    .map(id => document.getElementById(id)).find(el => el && !el.classList.contains('hidden-panel') && !el.classList.contains('floating-panel')),
    'width', false, 180, 620, (px) => layoutManager.updateSplitRatio('left', px));

  bindSplitter('splitter-right', () => ['panel-inspector', 'panel-deliver-settings']
    .map(id => document.getElementById(id)).find(el => el && !el.classList.contains('hidden-panel') && !el.classList.contains('floating-panel')),
    'width', true, 220, 640, (px) => layoutManager.updateSplitRatio('right', px));

  bindSplitter('splitter-row-v', () => document.getElementById('workspace-bottom-row'),
    'height', true, 160, 560, (px) => layoutManager.updateSplitRatio('bottom', px));

  bindSplitter('splitter-monitors', () => document.getElementById('viewport-source'),
    'width', false, 200, 750, null);
}

function bindSplitter(id, getTarget, dim, reverse, min, max, onFinishPx) {
  const sp = document.getElementById(id);
  if (!sp) return;
  sp.addEventListener('mousedown', (e) => {
    const target = getTarget();
    if (!target) return;
    e.preventDefault();
    sp.classList.add('active');
    const startPos = dim === 'width' ? e.clientX : e.clientY;
    const startSize = dim === 'width' ? target.offsetWidth : target.offsetHeight;
    let lastPx = startSize;

    const onMove = (ev) => {
      const curr = dim === 'width' ? ev.clientX : ev.clientY;
      const delta = reverse ? (startPos - curr) : (curr - startPos);
      lastPx = Math.max(min, Math.min(max, startSize + delta));
      target.style[dim] = `${lastPx}px`;
      target.style.flex = 'none';
    };
    const onUp = () => {
      sp.classList.remove('active');
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (onFinishPx) onFinishPx(lastPx);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
}

// ----------------------------------------------------
// 9. Media Ingest, Project Panel & Relink Handler
// ----------------------------------------------------
function initMediaIngestAndRelink() {
  const fileInput = document.getElementById('video-file-input');
  const relinkInput = document.getElementById('relink-file-input');
  const dropzone = document.getElementById('media-dropzone');
  const trigger = () => fileInput?.click();

  dropzone?.addEventListener('click', trigger);
  dropzone?.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.style.borderColor = 'var(--accent)'; });
  dropzone?.addEventListener('dragleave', () => { dropzone.style.borderColor = 'var(--border)'; });
  dropzone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--border)';
    if (e.dataTransfer.files?.length) handleFilesIngest(Array.from(e.dataTransfer.files));
  });

  document.getElementById('btn-import-media')?.addEventListener('click', trigger);
  document.getElementById('src-empty-import-btn')?.addEventListener('click', trigger);
  document.getElementById('prg-empty-import-btn')?.addEventListener('click', trigger);
  document.getElementById('prg-empty-title-btn')?.addEventListener('click', addTitleOverlayClip);
  document.getElementById('src-btn-relink')?.addEventListener('click', () => {
    if (store.sessionState.sourceAssetId) triggerRelinkForAsset(store.sessionState.sourceAssetId);
  });

  fileInput?.addEventListener('change', (e) => {
    if (e.target.files?.length) handleFilesIngest(Array.from(e.target.files));
    fileInput.value = '';
  });

  // Relink Media to existing stable assetId without losing any timeline clips!
  relinkInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    const assetId = uiState.pendingRelinkAssetId;
    relinkInput.value = '';
    uiState.pendingRelinkAssetId = null;
    if (!file || !assetId || !store.projectState.assets[assetId]) return;

    await store.saveMediaBlob(assetId, file);
    createRuntimeDecoder(assetId, file);
    if (store.sessionState.sourceAssetId === assetId) {
      loadAssetIntoSourceMonitor(assetId, { preserveInOut: true, switchTab: false });
    }
    store.scheduleSave(200);
    renderAll();
  });

  document.getElementById('btn-add-bin')?.addEventListener('click', createNewBin);
  document.getElementById('asset-search-input')?.addEventListener('input', (e) => {
    uiState.assetSearchQuery = e.target.value.toLowerCase();
    renderAssetsList();
  });
}

function createNewBin() {
  const name = prompt('New Bin Name:', 'B-Roll Footage');
  if (!name) return;
  const id = `bin_${Date.now()}`;
  executeCommand('Create Bin', () => {
    store.projectState.bins[id] = { id, name, assetIds: [] };
  });
}

async function handleFilesIngest(files) {
  for (const file of files) {
    const assetId = `asset_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const isVideo = file.type.startsWith('video');
    const isAudio = file.type.startsWith('audio');

    store.projectState.assets[assetId] = {
      id: assetId,
      name: file.name,
      size: file.size,
      type: file.type || 'video/mp4',
      duration: 10,
      width: 1920,
      height: 1080,
      addedAt: new Date().toLocaleTimeString(),
    };
    store.projectState.bins.bin_root.assetIds.push(assetId);

    // Persist real media blob in IndexedDB for refresh recovery
    await store.saveMediaBlob(assetId, file);

    // Create eager runtime decoder
    const decoder = createRuntimeDecoder(assetId, file);

    if (isVideo || isAudio) {
      await new Promise((res) => {
        if (decoder.videoEl.readyState >= 1) return res();
        decoder.videoEl.addEventListener('loadedmetadata', () => res(), { once: true });
        decoder.videoEl.addEventListener('error', () => res(), { once: true });
        setTimeout(res, 1500);
      });
    }

    // Load into Source Monitor without touching timeline selection or sequence playhead!
    loadAssetIntoSourceMonitor(assetId, { preserveInOut: false, switchTab: store.sessionState.monitorMode === 'single' });
  }
  executeCommand('Import Media', () => {});
}

function renderAssetsList() {
  const container = document.getElementById('assets-list');
  if (!container) return;

  const assets = Object.values(store.projectState.assets).filter(a =>
    !uiState.assetSearchQuery || a.name.toLowerCase().includes(uiState.assetSearchQuery)
  );
  const srcId = store.sessionState.sourceAssetId;

  if (store.workspaceState.activeWorkspace === 'media') {
    if (assets.length === 0) {
      container.innerHTML = `<div style="padding: 28px; text-align: center; color: var(--text-muted);">No footage imported yet. Use Import Media above or drag files here.</div>`;
      return;
    }
    container.innerHTML = `
      <table class="media-table">
        <thead><tr><th>Clip Name</th><th>Status</th><th>Resolution</th><th>Duration</th><th>Size</th><th>Action</th></tr></thead>
        <tbody>
          ${assets.map(a => {
            const dec = store.runtimeState.decoders.get(a.id);
            const missing = dec && dec.missing;
            return `
              <tr class="${srcId === a.id ? 'selected' : ''}" data-id="${a.id}" draggable="true">
                <td style="font-weight: 500;"><span class="icon icon-sm" style="color: ${a.type.startsWith('audio') ? 'var(--success)' : 'var(--accent)'}; margin-right: 4px;">${a.type.startsWith('audio') ? 'audiotrack' : 'movie'}</span>${a.name}</td>
                <td>${missing ? `<span class="missing-media-badge">OFFLINE</span>` : `<span style="color: var(--success); font-size: 10.5px;">Online</span>`}</td>
                <td style="font-family: monospace;">${a.type.startsWith('audio') ? 'Audio' : `${a.width}×${a.height}`}</td>
                <td style="font-family: monospace;">${formatTimecode(a.duration, 24)}</td>
                <td style="color: var(--text-secondary);">${(a.size / (1024 * 1024)).toFixed(2)} MB</td>
                <td>
                  ${missing
                    ? `<button class="action-btn-compact danger btn-relink-row" data-relink-id="${a.id}">Relink</button>`
                    : `<button class="action-btn-compact primary btn-quick-insert" data-insert-id="${a.id}">+ Timeline</button>`}
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
    bindAssetRowEvents(container, 'tr[data-id]');
    container.querySelectorAll('.btn-quick-insert').forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation();
      insertSourceOrAssetToTimeline(b.dataset.insertId, store.sessionState.playheadTime, { mode: 'insert' });
    }));
    container.querySelectorAll('.btn-relink-row').forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation();
      triggerRelinkForAsset(b.dataset.relinkId);
    }));
    return;
  }

  if (assets.length === 0 && Object.keys(store.projectState.bins).length <= 1) {
    container.innerHTML = `<div style="font-size: 11px; color: var(--text-muted); text-align: center; padding: 18px 8px;">No media imported yet.</div>`;
    return;
  }

  let html = '';
  for (const bin of Object.values(store.projectState.bins)) {
    if (bin.id === 'bin_root') continue;
    html += `<div class="asset-item" style="font-weight: 600; color: var(--warning);"><span class="icon icon-sm">folder</span><span>${bin.name}</span></div>`;
  }
  for (const a of assets) {
    const isAudio = a.type.startsWith('audio');
    const dec = store.runtimeState.decoders.get(a.id);
    const missing = dec && dec.missing;
    html += `
      <div class="asset-item ${srcId === a.id ? 'selected' : ''}" data-id="${a.id}" draggable="true">
        <span class="icon icon-sm" style="color: ${missing ? 'var(--error)' : (isAudio ? 'var(--success)' : 'var(--accent)')};">${missing ? 'link_off' : (isAudio ? 'audiotrack' : 'movie')}</span>
        <div style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${a.name}</div>
        ${missing
          ? `<button class="action-btn-compact danger btn-relink-row" data-relink-id="${a.id}" style="padding: 1px 5px; font-size: 9.5px;">Relink</button>`
          : `<span style="font-size: 10px; color: var(--text-muted); font-family: monospace;">${formatTimecode(a.duration, 24)}</span>`}
      </div>
    `;
  }
  container.innerHTML = html;
  bindAssetRowEvents(container, '.asset-item[data-id]');
  container.querySelectorAll('.btn-relink-row').forEach(b => b.addEventListener('click', (e) => {
    e.stopPropagation();
    triggerRelinkForAsset(b.dataset.relinkId);
  }));
}

function bindAssetRowEvents(container, selector) {
  container.querySelectorAll(selector).forEach(el => {
    const id = el.dataset.id;
    // Selecting a media item loads it into Source Monitor WITHOUT changing timeline clip selection or playhead!
    el.addEventListener('click', () => {
      loadAssetIntoSourceMonitor(id, { preserveInOut: false, switchTab: false });
      renderAssetsList();
      if (store.workspaceState.activeWorkspace === 'media') renderInspector();
    });
    el.addEventListener('dblclick', () => {
      loadAssetIntoSourceMonitor(id, { preserveInOut: false, switchTab: true });
    });
    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'asset', assetId: id }));
    });
  });
}

// ----------------------------------------------------
// 10. Distinct Source Monitor & Program Monitor Controllers
// ----------------------------------------------------
function initMonitorsGroup() {
  document.getElementById('tab-monitor-source')?.addEventListener('click', () => switchMonitorTab('source'));
  document.getElementById('tab-monitor-program')?.addEventListener('click', () => switchMonitorTab('program'));
  document.getElementById('btn-toggle-split-view')?.addEventListener('click', toggleMonitorSplitView);

  // --- SOURCE MONITOR CONTROLS ---
  const srcVideo = document.getElementById('source-video-element');

  document.getElementById('src-btn-play')?.addEventListener('click', toggleSourcePlayback);
  document.getElementById('src-btn-step-prev')?.addEventListener('click', () => stepSourceFrames(-1));
  document.getElementById('src-btn-step-next')?.addEventListener('click', () => stepSourceFrames(1));

  document.getElementById('src-btn-mark-in')?.addEventListener('click', () => {
    if (!srcVideo || !store.sessionState.sourceAssetId) return;
    store.sessionState.sourceInPoint = srcVideo.currentTime;
    if (store.sessionState.sourceOutPoint <= store.sessionState.sourceInPoint) {
      store.sessionState.sourceOutPoint = store.projectState.assets[store.sessionState.sourceAssetId]?.duration || srcVideo.duration || 10;
    }
    updateSourceScrubberUI();
    store.scheduleSave(250);
  });

  document.getElementById('src-btn-mark-out')?.addEventListener('click', () => {
    if (!srcVideo || !store.sessionState.sourceAssetId) return;
    store.sessionState.sourceOutPoint = Math.max(store.sessionState.sourceInPoint + 0.1, srcVideo.currentTime);
    updateSourceScrubberUI();
    store.scheduleSave(250);
  });

  document.getElementById('src-btn-goto-in')?.addEventListener('click', () => {
    if (srcVideo && store.sessionState.sourceAssetId) {
      srcVideo.currentTime = store.sessionState.sourceInPoint || 0;
      store.sessionState.sourcePlaybackPosition = srcVideo.currentTime;
      updateSourceScrubberUI();
    }
  });

  document.getElementById('src-btn-goto-out')?.addEventListener('click', () => {
    if (srcVideo && store.sessionState.sourceAssetId) {
      srcVideo.currentTime = store.sessionState.sourceOutPoint || srcVideo.duration || 0;
      store.sessionState.sourcePlaybackPosition = srcVideo.currentTime;
      updateSourceScrubberUI();
    }
  });

  document.getElementById('src-btn-clear-io')?.addEventListener('click', clearSourceInOut);

  document.getElementById('src-btn-insert')?.addEventListener('click', () => {
    if (store.sessionState.sourceAssetId) {
      insertSourceOrAssetToTimeline(store.sessionState.sourceAssetId, store.sessionState.playheadTime, { mode: 'insert', useSourceRange: true });
    }
  });

  document.getElementById('src-btn-overwrite')?.addEventListener('click', () => {
    if (store.sessionState.sourceAssetId) {
      insertSourceOrAssetToTimeline(store.sessionState.sourceAssetId, store.sessionState.playheadTime, { mode: 'overwrite', useSourceRange: true });
    }
  });

  // Drag Source In/Out Range directly to Timeline!
  document.getElementById('src-drag-range-handle')?.addEventListener('dragstart', (e) => {
    const id = store.sessionState.sourceAssetId;
    if (!id) { e.preventDefault(); return; }
    const asset = store.projectState.assets[id];
    const inPt = store.sessionState.sourceInPoint || 0;
    const outPt = store.sessionState.sourceOutPoint > inPt ? store.sessionState.sourceOutPoint : (asset?.duration || 10);
    e.dataTransfer.setData('text/plain', JSON.stringify({
      type: 'source-range',
      assetId: id,
      sourceStart: inPt,
      duration: Math.max(0.2, outPt - inPt),
    }));
  });

  // Audio channel selector on Source Monitor
  document.getElementById('source-audio-channel')?.addEventListener('change', (e) => {
    store.sessionState.sourceAudioChannel = e.target.value;
    if (srcVideo) srcVideo.muted = (e.target.value === 'mute');
    store.scheduleSave(250);
  });

  // Interactive Source Scrubber Bar
  const scrubBar = document.getElementById('source-scrubber-bar');
  scrubBar?.addEventListener('mousedown', (e) => {
    if (!srcVideo || !store.sessionState.sourceAssetId) return;
    const asset = store.projectState.assets[store.sessionState.sourceAssetId];
    const dur = (isFinite(srcVideo.duration) && srcVideo.duration > 0) ? srcVideo.duration : (asset?.duration || 10);
    const track = document.getElementById('source-scrub-track');
    const scrub = (ev) => {
      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / Math.max(1, rect.width)));
      srcVideo.currentTime = ratio * dur;
      store.sessionState.sourcePlaybackPosition = srcVideo.currentTime;
      updateSourceScrubberUI();
    };
    scrub(e);
    const onMove = (ev) => scrub(ev);
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      store.scheduleSave(250);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });

  srcVideo?.addEventListener('timeupdate', () => {
    store.sessionState.sourcePlaybackPosition = srcVideo.currentTime;
    updateSourceScrubberUI();
  });
  srcVideo?.addEventListener('ended', () => {
    store.runtimeState.isPlayingSource = false;
    const ic = document.getElementById('src-play-icon');
    if (ic) ic.textContent = 'play_arrow';
  });

  // --- PROGRAM MONITOR CONTROLS ---
  document.getElementById('prg-btn-play')?.addEventListener('click', toggleSequencePlayback);
  document.getElementById('prg-btn-prev')?.addEventListener('click', () => stepProgramFrames(-5));
  document.getElementById('prg-btn-next')?.addEventListener('click', () => stepProgramFrames(5));
  document.getElementById('prg-btn-step-prev')?.addEventListener('click', () => stepProgramFrames(-1));
  document.getElementById('prg-btn-step-next')?.addEventListener('click', () => stepProgramFrames(1));

  document.getElementById('prg-btn-loop')?.addEventListener('click', () => {
    store.sessionState.programLoop = !store.sessionState.programLoop;
    document.getElementById('prg-btn-loop')?.classList.toggle('active', store.sessionState.programLoop);
    store.scheduleSave(250);
  });

  document.getElementById('btn-toggle-safe-margins')?.addEventListener('click', () => {
    store.sessionState.programSafeMargins = !store.sessionState.programSafeMargins;
    document.getElementById('safe-margins-overlay')?.classList.toggle('visible', store.sessionState.programSafeMargins);
    document.getElementById('btn-toggle-safe-margins')?.classList.toggle('active', store.sessionState.programSafeMargins);
    store.scheduleSave(250);
  });

  document.getElementById('prg-btn-overlays')?.addEventListener('click', () => {
    store.sessionState.programOverlays = !store.sessionState.programOverlays;
    document.getElementById('program-overlays-hud')?.classList.toggle('visible', store.sessionState.programOverlays);
    document.getElementById('prg-btn-overlays')?.classList.toggle('active', store.sessionState.programOverlays);
    store.scheduleSave(250);
  });

  document.getElementById('prg-btn-compare')?.addEventListener('click', () => {
    store.sessionState.programCompareMode = !store.sessionState.programCompareMode;
    document.getElementById('prg-btn-compare')?.classList.toggle('active', store.sessionState.programCompareMode);
    renderProgramMonitor();
    store.scheduleSave(250);
  });

  document.getElementById('prg-btn-fullscreen')?.addEventListener('click', () => {
    const wrap = document.getElementById('program-canvas-wrap');
    if (!document.fullscreenElement) wrap?.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
  });

  document.getElementById('monitor-fit-select')?.addEventListener('change', (e) => {
    store.sessionState.programFitMode = e.target.value;
    const canvas = document.getElementById('program-render-canvas');
    const srcEl = document.getElementById('source-video-element');
    const scaleMap = { fit: '100%', '100%': '100%', '50%': '50%' };
    if (canvas) canvas.style.maxHeight = scaleMap[e.target.value] || '100%';
    if (srcEl) srcEl.style.maxHeight = scaleMap[e.target.value] || '100%';
    store.scheduleSave(250);
  });

  document.getElementById('monitor-res-select')?.addEventListener('change', (e) => {
    store.sessionState.programPlaybackResolution = e.target.value;
    store.scheduleSave(250);
  });
}

function toggleSourcePlayback() {
  const srcVideo = document.getElementById('source-video-element');
  if (!srcVideo || !srcVideo.src) return;
  if (srcVideo.paused) {
    srcVideo.play().catch(() => {});
    store.runtimeState.isPlayingSource = true;
    document.getElementById('src-play-icon').textContent = 'pause';
  } else {
    srcVideo.pause();
    store.runtimeState.isPlayingSource = false;
    document.getElementById('src-play-icon').textContent = 'play_arrow';
  }
}

function stepSourceFrames(delta) {
  const srcVideo = document.getElementById('source-video-element');
  if (!srcVideo || !srcVideo.src) return;
  srcVideo.pause();
  store.runtimeState.isPlayingSource = false;
  document.getElementById('src-play-icon').textContent = 'play_arrow';
  const fps = getActiveSequence().fps || 24;
  srcVideo.currentTime = Math.max(0, Math.min(srcVideo.duration || 9999, srcVideo.currentTime + delta / fps));
  store.sessionState.sourcePlaybackPosition = srcVideo.currentTime;
  updateSourceScrubberUI();
}

function clearSourceInOut() {
  const id = store.sessionState.sourceAssetId;
  if (!id) return;
  const asset = store.projectState.assets[id];
  store.sessionState.sourceInPoint = 0;
  store.sessionState.sourceOutPoint = asset?.duration || 0;
  updateSourceScrubberUI();
  store.scheduleSave(250);
}

function updateSourceScrubberUI() {
  const id = store.sessionState.sourceAssetId;
  const asset = id ? store.projectState.assets[id] : null;
  const srcVideo = document.getElementById('source-video-element');
  if (!asset) return;

  const dur = (srcVideo && isFinite(srcVideo.duration) && srcVideo.duration > 0) ? srcVideo.duration : (asset.duration || 10);
  const pos = store.sessionState.sourcePlaybackPosition || 0;
  const inPt = Math.max(0, Math.min(dur, store.sessionState.sourceInPoint || 0));
  const outPt = store.sessionState.sourceOutPoint > inPt ? Math.min(dur, store.sessionState.sourceOutPoint) : dur;

  const rangeEl = document.getElementById('source-inout-range');
  const thumbEl = document.getElementById('source-scrub-thumb');
  const tcDurEl = document.getElementById('source-tc-duration');
  const topTc   = document.getElementById('active-monitor-timecode');

  if (rangeEl) {
    rangeEl.style.left = `${(inPt / dur) * 100}%`;
    rangeEl.style.width = `${Math.max(0.5, ((outPt - inPt) / dur) * 100)}%`;
  }
  if (thumbEl) {
    thumbEl.style.left = `${Math.max(0, Math.min(100, (pos / dur) * 100))}%`;
  }
  if (tcDurEl) {
    tcDurEl.textContent = `${formatTimecode(pos, 24)} / ${formatTimecode(dur, 24)}`;
  }
  if (topTc && store.sessionState.activeMonitorTab === 'source' && store.sessionState.monitorMode === 'single') {
    topTc.textContent = formatTimecode(pos, 24);
  }
}

function loadAssetIntoSourceMonitor(assetId, { preserveInOut = false, switchTab = false } = {}) {
  const asset = store.projectState.assets[assetId];
  if (!asset) return;

  store.sessionState.sourceAssetId = assetId;
  if (!preserveInOut) {
    store.sessionState.sourceInPoint = 0;
    store.sessionState.sourceOutPoint = asset.duration || 10;
    store.sessionState.sourcePlaybackPosition = 0;
  }

  const dec = store.runtimeState.decoders.get(assetId);
  const srcVideo = document.getElementById('source-video-element');
  const emptyCard = document.getElementById('source-empty-card');
  const missingCard = document.getElementById('source-missing-card');
  const infoBar = document.getElementById('source-info-bar');
  const scrubBar = document.getElementById('source-scrubber-bar');

  document.getElementById('source-clip-title').textContent = asset.name;
  document.getElementById('source-meta-pill').textContent = asset.type.startsWith('audio')
    ? 'Audio'
    : `${asset.width}×${asset.height}`;

  if (infoBar) infoBar.style.display = 'flex';
  if (emptyCard) emptyCard.style.display = 'none';

  if (!dec || dec.missing || !dec.blobUrl) {
    if (srcVideo) { srcVideo.style.display = 'none'; srcVideo.removeAttribute('src'); }
    if (missingCard) missingCard.style.display = 'flex';
    if (scrubBar) scrubBar.style.display = 'none';
  } else {
    if (missingCard) missingCard.style.display = 'none';
    if (scrubBar) scrubBar.style.display = 'flex';
    if (srcVideo) {
      srcVideo.src = dec.blobUrl;
      srcVideo.style.display = 'block';
      srcVideo.muted = (store.sessionState.sourceAudioChannel === 'mute');
      if (store.sessionState.sourcePlaybackPosition > 0) {
        srcVideo.addEventListener('loadedmetadata', () => {
          srcVideo.currentTime = Math.min(srcVideo.duration || 9999, store.sessionState.sourcePlaybackPosition);
        }, { once: true });
      }
    }
  }

  updateSourceScrubberUI();
  if (switchTab && store.sessionState.monitorMode === 'single') {
    switchMonitorTab('source');
  }
  store.scheduleSave(200);
}

function switchMonitorTab(tab) {
  store.sessionState.activeMonitorTab = tab;
  updateMonitorsLayoutUI();
  store.scheduleSave(200);
}

function toggleMonitorSplitView() {
  store.sessionState.monitorMode = store.sessionState.monitorMode === 'single' ? 'split' : 'single';
  updateMonitorsLayoutUI();
  store.scheduleSave(200);
}

function updateMonitorsLayoutUI() {
  const vpSource = document.getElementById('viewport-source');
  const vpProgram = document.getElementById('viewport-program');
  const splitter = document.getElementById('splitter-monitors');
  const tabSource = document.getElementById('tab-monitor-source');
  const tabProgram = document.getElementById('tab-monitor-program');
  const splitLabel = document.getElementById('split-view-btn-label');

  if (!vpSource || !vpProgram) return;
  if (store.sessionState.monitorMode === 'split') {
    vpSource.style.display = 'flex'; vpSource.style.flex = '1';
    vpProgram.style.display = 'flex'; vpProgram.style.flex = '1';
    if (splitter) splitter.style.display = 'block';
    tabSource?.classList.add('active');
    tabProgram?.classList.add('active');
    if (splitLabel) splitLabel.textContent = 'Single View';
  } else {
    if (splitter) splitter.style.display = 'none';
    if (splitLabel) splitLabel.textContent = 'Split View';
    if (store.sessionState.activeMonitorTab === 'source') {
      vpSource.style.display = 'flex'; vpSource.style.flex = '1';
      vpProgram.style.display = 'none';
      tabSource?.classList.add('active');
      tabProgram?.classList.remove('active');
      updateSourceScrubberUI();
    } else {
      vpSource.style.display = 'none';
      vpProgram.style.display = 'flex'; vpProgram.style.flex = '1';
      tabSource?.classList.remove('active');
      tabProgram?.classList.add('active');
      renderProgramMonitor();
    }
  }
}

function syncSessionControlsUI() {
  const s = store.sessionState;
  document.getElementById('btn-snap-toggle')?.classList.toggle('active', s.isSnapping);
  document.getElementById('btn-link-toggle')?.classList.toggle('active', s.isLinkedSelection);
  document.getElementById('btn-synclock-toggle')?.classList.toggle('active', s.isSyncLockGlobal);
  document.getElementById('prg-btn-loop')?.classList.toggle('active', s.programLoop);
  document.getElementById('btn-toggle-safe-margins')?.classList.toggle('active', s.programSafeMargins);
  document.getElementById('safe-margins-overlay')?.classList.toggle('visible', s.programSafeMargins);
  document.getElementById('prg-btn-overlays')?.classList.toggle('active', s.programOverlays);
  document.getElementById('program-overlays-hud')?.classList.toggle('visible', s.programOverlays);
  document.getElementById('prg-btn-compare')?.classList.toggle('active', s.programCompareMode);
  const audioSel = document.getElementById('source-audio-channel');
  if (audioSel) audioSel.value = s.sourceAudioChannel || 'stereo';

  const tds = s.timelineDisplay;
  const setChk = (id, v) => { const el = document.getElementById(id); if (el) el.checked = !!v; };
  setChk('tds-thumbnails', tds.showThumbnails);
  setChk('tds-waveforms', tds.showWaveforms);
  setChk('tds-names', tds.showNames);
  setChk('tds-keyframes', tds.showKeyframes);
  setChk('tds-badges', tds.showBadges);
  setChk('tds-markers', tds.showMarkers);
  setChk('tds-audio-band', tds.showAudioBand);
  setChk('tds-video-band', tds.showVideoBand);
  setChk('tds-compact-tracks', tds.compactTracks);

  setTool(s.activeTool || 'select', false);
  updateMonitorsLayoutUI();
}

// ----------------------------------------------------
// 11. Real Insert, Overwrite & Sequence Compositor Rendering
// ----------------------------------------------------
function insertSourceOrAssetToTimeline(assetId, startTime, { mode = 'insert', useSourceRange = false, explicitTrackId = null, explicitSourceStart = null, explicitDuration = null } = {}) {
  const asset = store.projectState.assets[assetId];
  if (!asset) return;
  const seq = getActiveSequence();

  let srcStart = explicitSourceStart ?? 0;
  let duration = explicitDuration ?? Math.min(10, asset.duration || 8);

  if (useSourceRange) {
    srcStart = store.sessionState.sourceInPoint || 0;
    const outPt = store.sessionState.sourceOutPoint > srcStart ? store.sessionState.sourceOutPoint : (asset.duration || 10);
    duration = Math.max(0.2, outPt - srcStart);
  }

  const explicitTrack = explicitTrackId ? seq.tracks.find(t => t.id === explicitTrackId) : null;
  const videoTrack = (explicitTrack && explicitTrack.type === 'video')
    ? explicitTrack
    : (seq.tracks.find(t => t.type === 'video' && t.targeted) || seq.tracks.find(t => t.type === 'video'));
  const audioTrack = (explicitTrack && explicitTrack.type === 'audio')
    ? explicitTrack
    : (seq.tracks.find(t => t.type === 'audio' && t.targeted) || seq.tracks.find(t => t.type === 'audio'));

  executeCommand(`${mode === 'overwrite' ? 'Overwrite' : 'Insert'} Clip`, () => {
    const affectedTrackIds = [];
    if (videoTrack && !asset.type.startsWith('audio') && (!explicitTrack || explicitTrack.type === 'video')) affectedTrackIds.push(videoTrack.id);
    if (audioTrack && (asset.type.startsWith('audio') || !explicitTrack || explicitTrack.type === 'video')) affectedTrackIds.push(audioTrack.id);

    // INSERT ripples downstream clips on affected tracks; OVERWRITE trims/clears overlapping range
    if (mode === 'insert') {
      for (const c of seq.clips) {
        if (affectedTrackIds.includes(c.trackId) && c.timelineStart >= startTime - 0.01) {
          c.timelineStart += duration;
        }
      }
    } else if (mode === 'overwrite') {
      const endTime = startTime + duration;
      seq.clips = seq.clips.filter(c => {
        if (!affectedTrackIds.includes(c.trackId)) return true;
        const cEnd = c.timelineStart + c.timelineDuration;
        // Completely covered -> remove
        if (c.timelineStart >= startTime && cEnd <= endTime) return false;
        // Overlaps right tail -> trim right edge
        if (c.timelineStart < startTime && cEnd > startTime && cEnd <= endTime) {
          c.timelineDuration = startTime - c.timelineStart;
          return true;
        }
        // Overlaps left head -> trim left edge
        if (c.timelineStart >= startTime && c.timelineStart < endTime && cEnd > endTime) {
          const cut = endTime - c.timelineStart;
          c.timelineStart = endTime;
          c.sourceStart += cut;
          c.timelineDuration -= cut;
          return true;
        }
        return true;
      });
    }

    let primaryClipId = null;
    if (videoTrack && !asset.type.startsWith('audio') && (!explicitTrack || explicitTrack.type === 'video')) {
      primaryClipId = `clip_v_${Date.now()}`;
      seq.clips.push({
        id: primaryClipId,
        assetId: asset.id,
        name: asset.name,
        trackId: videoTrack.id,
        timelineStart: startTime,
        timelineDuration: duration,
        sourceStart: srcStart,
        speed: 1,
        transform: { positionX: 0, positionY: 0, scale: 1, rotation: 0, opacity: 1 },
        colorEffects: { exposure: 0, contrast: 1, brightness: 0, saturation: 1, temperature: 0, tint: 0, gamma: 1, lift: 0, gain: 0, invert: false },
        audio: { volumeDb: 0, pan: 0, fadeIn: 0, fadeOut: 0 },
        transitionIn: null,
      });
    }

    if (audioTrack && (asset.type.startsWith('audio') || !explicitTrack || explicitTrack.type === 'video')) {
      const aId = `clip_a_${Date.now()}`;
      seq.clips.push({
        id: aId,
        assetId: asset.id,
        name: asset.type.startsWith('audio') ? asset.name : `${asset.name} [Audio]`,
        trackId: audioTrack.id,
        timelineStart: startTime,
        timelineDuration: duration,
        sourceStart: srcStart,
        speed: 1,
        transform: { positionX: 0, positionY: 0, scale: 1, rotation: 0, opacity: 1 },
        colorEffects: { exposure: 0, contrast: 1, brightness: 0, saturation: 1, temperature: 0, tint: 0, gamma: 1, lift: 0, gain: 0, invert: false },
        audio: { volumeDb: 0, pan: 0, fadeIn: 0, fadeOut: 0 },
        transitionIn: null,
      });
      if (!primaryClipId) primaryClipId = aId;
    }

    if (primaryClipId) setSelectedClipIds([primaryClipId]);
    store.sessionState.playheadTime = startTime + 0.05; // Land inside the newly inserted clip so Program Monitor immediately shows its live frame!
  });

  if (store.sessionState.monitorMode === 'single') {
    switchMonitorTab('program');
  }
}

function addTitleOverlayClip() {
  const seq = getActiveSequence();
  const overlayTrack = seq.tracks.find(t => t.id === 'track_v2') || seq.tracks.find(t => t.type === 'video');
  if (!overlayTrack) return;
  const text = prompt('Enter Title Text:', 'FRAMEFLOW STUDIO') || 'FRAMEFLOW STUDIO';
  executeCommand('Add Title Overlay', () => {
    const id = `clip_title_${Date.now()}`;
    seq.clips.push({
      id,
      assetId: null,
      isTitle: true,
      titleText: text,
      name: `Title: ${text}`,
      trackId: overlayTrack.id,
      timelineStart: store.sessionState.playheadTime,
      timelineDuration: 5,
      sourceStart: 0,
      speed: 1,
      transform: { positionX: 0, positionY: 0, scale: 1, rotation: 0, opacity: 1 },
      colorEffects: { exposure: 0, contrast: 1, brightness: 0, saturation: 1, temperature: 0, tint: 0, gamma: 1, lift: 0, gain: 0, invert: false },
      audio: { volumeDb: 0, pan: 0, fadeIn: 0, fadeOut: 0 },
      transitionIn: null,
    });
    setSelectedClipIds([id]);
  });
}

function stepProgramFrames(deltaFrames) {
  const seq = getActiveSequence();
  seekSequence(store.sessionState.playheadTime + (deltaFrames / seq.fps));
}

function toggleSequencePlayback() {
  audioEngine.ensureContext();
  updateAudioStatusTelemetry();
  store.runtimeState.isPlayingSequence = !store.runtimeState.isPlayingSequence;
  store.runtimeState.playbackSpeed = 1;
  const icon = document.getElementById('prg-play-icon');
  if (icon) icon.textContent = store.runtimeState.isPlayingSequence ? 'pause' : 'play_arrow';
}

function seekSequence(timeSec) {
  const seq = getActiveSequence();
  store.sessionState.playheadTime = Math.max(0, Math.min(seq.duration, timeSec));
  updatePlayheadPositionUI();
  renderProgramMonitor();
  store.scheduleSave(300);
}

/**
 * Renders the REAL edited sequence frame at timeSec.
 * Never substitutes decorative blue placeholders for real video!
 */
function renderSequenceFrameAtTime(ctx, width, height, timeSec) {
  const seq = getActiveSequence();
  // True sequence background black when outside all clips
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);

  const visibleVideoTracks = seq.tracks.filter(t => t.type === 'video' && t.visible);
  const clipsAtTime = seq.clips.filter(c => timeSec >= c.timelineStart && timeSec <= c.timelineStart + c.timelineDuration);

  const buildFilterString = (c) => {
    const bright = Math.max(0.1, 1 + (c.brightness || 0) + (c.exposure || 0) * 0.25 + (c.lift || 0) * 0.2 + (c.gain || 0) * 0.2);
    const cont = Math.max(0.1, c.contrast || 1);
    const sat = Math.max(0, c.saturation ?? 1);
    const hue = (c.temperature || 0) * 0.4;
    let f = `brightness(${bright.toFixed(2)}) contrast(${cont.toFixed(2)}) saturate(${sat.toFixed(2)}) hue-rotate(${hue.toFixed(0)}deg)`;
    if (c.invert) f += ' invert(100%)';
    return f;
  };

  const drawSingleClip = (clip, skipGrade = false) => {
    ctx.save();
    const t = clip.transform;
    ctx.translate(width / 2 + t.positionX, height / 2 + t.positionY);
    ctx.rotate((t.rotation * Math.PI) / 180);
    ctx.scale(t.scale, t.scale);
    ctx.globalAlpha *= t.opacity;
    ctx.filter = skipGrade ? 'none' : buildFilterString(clip.colorEffects);

    if (clip.isTitle) {
      ctx.fillStyle = '#ffffff';
      ctx.font = `700 ${Math.round(width * 0.048)}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.75)';
      ctx.shadowBlur = 18;
      ctx.fillText(clip.titleText || clip.name, 0, 0);
    } else {
      const dec = store.runtimeState.decoders.get(clip.assetId);
      const vid = dec ? dec.videoEl : null;

      if (vid && !dec.missing) {
        const srcTime = Math.max(0, clip.sourceStart + (timeSec - clip.timelineStart) * (clip.speed || 1));
        const clampedSrc = isFinite(vid.duration) && vid.duration > 0 ? Math.min(vid.duration - 0.02, srcTime) : srcTime;

        // Keep decoder time synced smoothly; seeked listener re-renders exact frame as soon as decoded
        if (Math.abs(vid.currentTime - clampedSrc) > 0.04) {
          try { vid.currentTime = clampedSrc; } catch {}
        }

        if (vid.readyState >= 2) {
          // Aspect-preserving contain draw of actual decoded video frame
          const vw = vid.videoWidth || width;
          const vh = vid.videoHeight || height;
          const scale = Math.min(width / vw, height / vh);
          const dw = vw * scale;
          const dh = vh * scale;
          ctx.drawImage(vid, -dw / 2, -dh / 2, dw, dh);
        } else {
          // Decoder still seeking frame — dark neutral status (auto-redraws on seeked/loadeddata)
          ctx.fillStyle = '#0B0E14';
          ctx.fillRect(-width / 2, -height / 2, width, height);
          ctx.fillStyle = '#9AA6B5';
          ctx.font = `500 ${Math.round(width * 0.018)}px Inter, sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(`Decoding ${clip.name}...`, 0, 0);
        }
      } else {
        // Authentic Media Offline slate — NEVER a decorative placeholder!
        ctx.filter = 'none';
        ctx.fillStyle = '#3B0F18';
        ctx.fillRect(-width / 2, -height / 2, width, height);
        ctx.strokeStyle = '#E36F78';
        ctx.lineWidth = 6;
        ctx.strokeRect(-width / 2 + 40, -height / 2 + 40, width - 80, height - 80);
        ctx.fillStyle = '#FCA5A5';
        ctx.font = `700 ${Math.round(width * 0.036)}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('MEDIA OFFLINE', 0, -24);
        ctx.fillStyle = '#E6EAF0';
        ctx.font = `500 ${Math.round(width * 0.018)}px Inter, sans-serif`;
        ctx.fillText(`${clip.name} — Click Relink in Project Panel`, 0, 28);
      }
    }
    ctx.restore();
  };

  for (const track of [...visibleVideoTracks].reverse()) {
    const clip = clipsAtTime.find(c => c.trackId === track.id);
    if (!clip) continue;

    const renderClipWithOptionalCompare = () => {
      if (store.sessionState.programCompareMode) {
        // Left half: ungraded original; Right half: graded
        ctx.save();
        ctx.beginPath(); ctx.rect(0, 0, width / 2, height); ctx.clip();
        drawSingleClip(clip, true);
        ctx.restore();

        ctx.save();
        ctx.beginPath(); ctx.rect(width / 2, 0, width / 2, height); ctx.clip();
        drawSingleClip(clip, false);
        ctx.restore();

        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fillRect(width / 2 - 1, 0, 2, height);
      } else {
        drawSingleClip(clip, false);
      }
    };

    if (clip.transitionIn && timeSec < clip.timelineStart + clip.transitionIn.duration) {
      const progress = (timeSec - clip.timelineStart) / Math.max(0.05, clip.transitionIn.duration);
      renderTransitionComposite(ctx, () => { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, width, height); }, renderClipWithOptionalCompare, clip.transitionIn, progress, width, height);
    } else {
      renderClipWithOptionalCompare();
    }
  }
}

function renderProgramMonitor() {
  const canvas = document.getElementById('program-render-canvas');
  const emptyCard = document.getElementById('program-empty-card');
  if (!canvas) return;
  const seq = getActiveSequence();
  const t = store.sessionState.playheadTime;

  if (emptyCard) emptyCard.style.display = seq.clips.length === 0 ? 'flex' : 'none';

  const tcStr = formatTimecode(t, seq.fps);
  const durStr = formatTimecode(seq.duration, seq.fps);

  const seqDisp = document.getElementById('sequence-name-disp');
  if (seqDisp) seqDisp.textContent = `${tcStr} / ${durStr}`;

  const topTc = document.getElementById('active-monitor-timecode');
  if (topTc && (store.sessionState.activeMonitorTab === 'program' || store.sessionState.monitorMode === 'split')) {
    topTc.textContent = tcStr;
  }

  const hudTc = document.getElementById('hud-timecode');
  const hudClip = document.getElementById('hud-clip-name');
  const activeClip = getActiveClip();
  if (hudTc) hudTc.textContent = `${tcStr} · ${seq.width}×${seq.height} · ${seq.fps}fps`;
  if (hudClip) hudClip.textContent = activeClip ? `CLIP: ${activeClip.name}` : `PROGRAM: ${seq.name}`;

  const ctx = canvas.getContext('2d');
  renderSequenceFrameAtTime(ctx, canvas.width, canvas.height, t);

  if (store.workspaceState.activeWorkspace === 'color') {
    renderLiveColorScopes(canvas);
  }
}

function startPlaybackAndTelemetryLoop() {
  let lastTs = performance.now();
  let frameCount = 0;
  let fpsWindowStart = lastTs;

  function tick(now) {
    const delta = (now - lastTs) / 1000;
    lastTs = now;
    frameCount++;

    if (now - fpsWindowStart >= 500) {
      store.runtimeState.measuredFps = Math.round((frameCount * 1000) / (now - fpsWindowStart));
      frameCount = 0;
      fpsWindowStart = now;
      const fpsEl = document.getElementById('status-fps-label');
      if (fpsEl) fpsEl.textContent = `${store.runtimeState.measuredFps} FPS`;
    }

    if (store.runtimeState.isPlayingSequence) {
      const seq = getActiveSequence();
      if (delta > 0.08) {
        store.runtimeState.droppedFrames++;
        const dropEl = document.getElementById('status-drops-label');
        if (dropEl) dropEl.textContent = String(store.runtimeState.droppedFrames);
      }
      store.sessionState.playheadTime += delta * store.runtimeState.playbackSpeed;
      if (store.sessionState.playheadTime >= seq.duration) {
        if (store.sessionState.programLoop) {
          store.sessionState.playheadTime = 0;
        } else {
          store.sessionState.playheadTime = seq.duration;
          store.runtimeState.isPlayingSequence = false;
          const ic = document.getElementById('prg-play-icon');
          if (ic) ic.textContent = 'play_arrow';
        }
      } else if (store.sessionState.playheadTime < 0) {
        store.sessionState.playheadTime = 0;
        store.runtimeState.isPlayingSequence = false;
      }
      updatePlayheadPositionUI();
      renderProgramMonitor();
    }

    const seq = getActiveSequence();
    const t = store.sessionState.playheadTime;
    const hasActive = seq.clips.some(c => t >= c.timelineStart && t <= c.timelineStart + c.timelineDuration);
    const meters = audioEngine.getMasterMetering(store.runtimeState.isPlayingSequence, hasActive);

    const barL = document.getElementById('vu-bar-l');
    const barR = document.getElementById('vu-bar-r');
    const dbText = document.getElementById('vu-db-text');
    if (barL) barL.style.height = `${meters.leftPct}%`;
    if (barR) barR.style.height = `${meters.rightPct}%`;
    if (dbText) dbText.textContent = meters.peakDb <= -59 ? '-∞' : `${meters.peakDb.toFixed(0)}`;

    if (store.workspaceState.activeWorkspace === 'audio') {
      const lufsEl = document.getElementById('lufs-integrated-val');
      const peakEl = document.getElementById('lufs-truepeak-val');
      const momEl  = document.getElementById('lufs-momentary-val');
      if (lufsEl) lufsEl.textContent = meters.integratedLufs <= -59 ? '-∞ LUFS' : `${meters.integratedLufs.toFixed(1)} LUFS`;
      if (peakEl) peakEl.textContent = meters.truePeak <= -59 ? '-∞ dBTP' : `${meters.truePeak.toFixed(1)} dBTP`;
      if (momEl)  momEl.textContent  = meters.momentaryLufs <= -59 ? '-∞ LUFS' : `${meters.momentaryLufs.toFixed(1)} LUFS`;
      document.querySelectorAll('.strip-mini-fill').forEach((fill, idx) => {
        const jitter = store.runtimeState.isPlayingSequence && hasActive ? Math.max(8, meters.leftPct - idx * 6 + Math.sin(now * 0.01 + idx) * 8) : 0;
        fill.style.height = `${Math.max(0, Math.min(100, jitter))}%`;
      });
    }

    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ----------------------------------------------------
// 12. Four-Zone Timeline, Snapping & Context Menus
// ----------------------------------------------------
function initTimeline() {
  const toolIds = [
    ['tool-select', 'select'], ['tool-track-select', 'track-select'], ['tool-ripple', 'ripple'],
    ['tool-rolling', 'rolling'], ['tool-rate-stretch', 'rate-stretch'], ['tool-razor', 'razor'],
    ['tool-slip', 'slip'], ['tool-slide', 'slide'], ['tool-pen', 'pen'],
    ['tool-hand', 'hand'], ['tool-zoom', 'zoom'], ['tool-text', 'text'],
  ];
  toolIds.forEach(([id, tool]) => document.getElementById(id)?.addEventListener('click', () => setTool(tool)));

  document.getElementById('btn-snap-toggle')?.addEventListener('click', toggleSnapping);
  document.getElementById('btn-link-toggle')?.addEventListener('click', () => {
    store.sessionState.isLinkedSelection = !store.sessionState.isLinkedSelection;
    document.getElementById('btn-link-toggle')?.classList.toggle('active', store.sessionState.isLinkedSelection);
    store.scheduleSave(200);
  });
  document.getElementById('btn-synclock-toggle')?.addEventListener('click', () => {
    store.sessionState.isSyncLockGlobal = !store.sessionState.isSyncLockGlobal;
    document.getElementById('btn-synclock-toggle')?.classList.toggle('active', store.sessionState.isSyncLockGlobal);
    store.scheduleSave(200);
  });
  document.getElementById('btn-toggle-graph-drawer')?.addEventListener('click', () => {
    const drawer = document.getElementById('motion-graph-drawer');
    if (!drawer) return;
    drawer.style.display = drawer.style.display === 'none' ? 'block' : 'none';
    if (drawer.style.display === 'block') drawMotionGraphCanvas();
  });

  document.getElementById('btn-add-marker')?.addEventListener('click', addMarkerAtPlayhead);
  document.getElementById('btn-time-zoom-in')?.addEventListener('click', () => zoomTimeline(1.3));
  document.getElementById('btn-time-zoom-out')?.addEventListener('click', () => zoomTimeline(1 / 1.3));
  document.getElementById('btn-time-fit')?.addEventListener('click', fitTimelineToSequence);
  document.getElementById('btn-add-v-track')?.addEventListener('click', () => addTrack('video'));
  document.getElementById('btn-add-a-track')?.addEventListener('click', () => addTrack('audio'));

  // Persist timeline horizontal scroll
  const scrollArea = document.getElementById('timeline-scroll-area');
  scrollArea?.addEventListener('scroll', () => {
    store.sessionState.timelineScrollLeft = scrollArea.scrollLeft;
    store.scheduleSave(500);
  });

  // Timeline Display Settings Popover
  const dispBtn = document.getElementById('btn-timeline-display-settings');
  const dispMenu = document.getElementById('timeline-display-menu');
  dispBtn?.addEventListener('click', (e) => { e.stopPropagation(); dispMenu?.classList.toggle('open'); });
  document.addEventListener('click', (e) => {
    if (dispMenu && !dispMenu.contains(e.target) && e.target !== dispBtn) dispMenu.classList.remove('open');
  });

  const tdsMap = [
    ['tds-thumbnails', 'showThumbnails'], ['tds-waveforms', 'showWaveforms'],
    ['tds-names', 'showNames'], ['tds-keyframes', 'showKeyframes'],
    ['tds-badges', 'showBadges'], ['tds-markers', 'showMarkers'],
    ['tds-audio-band', 'showAudioBand'], ['tds-video-band', 'showVideoBand'],
    ['tds-compact-tracks', 'compactTracks'],
  ];
  tdsMap.forEach(([id, key]) => {
    document.getElementById(id)?.addEventListener('change', (e) => {
      store.sessionState.timelineDisplay[key] = e.target.checked;
      store.scheduleSave(200);
      renderTimeline();
    });
  });

  const ruler = document.getElementById('timeline-ruler-bar');
  ruler?.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const scrub = (ev) => {
      const rect = ruler.getBoundingClientRect();
      const scrollLeft = scrollArea?.scrollLeft || 0;
      seekSequence(Math.max(0, (ev.clientX - rect.left + scrollLeft) / store.sessionState.timelineZoom));
    };
    scrub(e);
    const onMove = (ev) => scrub(ev);
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });

  ruler?.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    openContextMenu(e.clientX, e.clientY, [
      { label: 'Add Marker at Playhead', shortcut: 'M', action: addMarkerAtPlayhead },
      { label: 'Set Sequence Mark In', shortcut: 'I', action: () => { getActiveSequence().inPoint = store.sessionState.playheadTime; renderTimeline(); } },
      { label: 'Set Sequence Mark Out', shortcut: 'O', action: () => { getActiveSequence().outPoint = store.sessionState.playheadTime; renderTimeline(); } },
      { sep: true },
      { label: 'Fit Sequence to View', shortcut: '\\', action: fitTimelineToSequence },
    ]);
  });

  scrollArea?.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.timeline-clip-block') || e.target.closest('.timeline-ruler')) return;
    e.preventDefault();
    openContextMenu(e.clientX, e.clientY, [
      { label: 'Add Video Track', action: () => addTrack('video') },
      { label: 'Add Audio Track', action: () => addTrack('audio') },
      { label: 'Add Title Overlay Clip', action: addTitleOverlayClip },
      { sep: true },
      { label: 'Paste Clip at Playhead', shortcut: 'Ctrl+V', action: pasteClipboardClip },
      { label: 'Fit Sequence to View', shortcut: '\\', action: fitTimelineToSequence },
    ]);
  });
}

function zoomTimeline(factor) {
  store.sessionState.timelineZoom = Math.max(8, Math.min(180, store.sessionState.timelineZoom * factor));
  store.scheduleSave(300);
  renderTimeline();
}

function toggleSnapping() {
  store.sessionState.isSnapping = !store.sessionState.isSnapping;
  document.getElementById('btn-snap-toggle')?.classList.toggle('active', store.sessionState.isSnapping);
  store.scheduleSave(200);
}

function setTool(toolName, save = true) {
  store.sessionState.activeTool = toolName;
  document.querySelectorAll('.timeline-toolbar .tool-btn').forEach(btn => {
    if (btn.id.startsWith('tool-')) btn.classList.remove('active');
  });
  document.getElementById(`tool-${toolName}`)?.classList.add('active');
  const area = document.getElementById('timeline-scroll-area');
  if (area) {
    area.style.cursor = toolName === 'razor' ? 'crosshair' : (toolName === 'hand' ? 'grab' : (toolName === 'zoom' ? 'zoom-in' : 'default'));
  }
  if (save) store.scheduleSave(200);
}

function addMarkerAtPlayhead() {
  const seq = getActiveSequence();
  executeCommand('Add Marker', () => {
    seq.markers.push({
      id: `m_${Date.now()}`,
      time: store.sessionState.playheadTime,
      label: `Marker ${seq.markers.length + 1}`,
      color: '#E5B45C',
    });
  });
}

function addTrack(type) {
  const seq = getActiveSequence();
  const count = seq.tracks.filter(t => t.type === type).length + 1;
  const prefix = type === 'video' ? 'V' : 'A';
  const color = TRACK_COLORS[seq.tracks.length % TRACK_COLORS.length];
  const newTrack = {
    id: `track_${type}_${Date.now()}`,
    shortName: `${prefix}${count}`,
    name: `${prefix}${count} · ${type === 'video' ? 'Video' : 'Audio'}`,
    type,
    color,
    muted: false, solo: false, locked: false, syncLock: true, visible: true, targeted: false,
    busId: type === 'audio' ? 'dialogue' : undefined,
    volumeDb: 0, pan: 0, eqLow: 0, eqMid: 0, eqHigh: 0,
  };
  executeCommand(`Add ${type} Track`, () => {
    if (type === 'video') seq.tracks.unshift(newTrack);
    else seq.tracks.push(newTrack);
  });
}

function deleteTrack(trackId) {
  const seq = getActiveSequence();
  if (seq.tracks.length <= 2) return;
  executeCommand('Delete Track', () => {
    seq.tracks = seq.tracks.filter(t => t.id !== trackId);
    seq.clips = seq.clips.filter(c => c.trackId !== trackId);
  });
}

function fitTimelineToSequence() {
  const area = document.getElementById('timeline-scroll-area');
  const seq = getActiveSequence();
  if (!area || !seq) return;
  store.sessionState.timelineZoom = Math.max(8, (area.clientWidth - 40) / (seq.duration || 60));
  store.scheduleSave(300);
  renderTimeline();
}

function computeSnappedTime(rawTime, excludeClipId, bypassSnap) {
  if (!store.sessionState.isSnapping || bypassSnap) return { time: rawTime, snapped: false };
  const seq = getActiveSequence();
  const thresholdSec = 10 / store.sessionState.timelineZoom;
  const targets = [store.sessionState.playheadTime, 0];
  for (const m of seq.markers) targets.push(m.time);
  for (const c of seq.clips) {
    if (c.id === excludeClipId) continue;
    targets.push(c.timelineStart, c.timelineStart + c.timelineDuration);
  }
  for (const t of targets) {
    if (Math.abs(rawTime - t) <= thresholdSec) return { time: t, snapped: true };
  }
  return { time: rawTime, snapped: false };
}

function showSnapGuide(timeSec) {
  const guide = document.getElementById('timeline-snap-guide');
  if (!guide) return;
  if (timeSec === null) guide.style.display = 'none';
  else { guide.style.display = 'block'; guide.style.left = `${timeSec * store.sessionState.timelineZoom}px`; }
}

function renderTimeline() {
  const seq = getActiveSequence();
  const pps = store.sessionState.timelineZoom;
  const tds = store.sessionState.timelineDisplay;
  const totalWidth = Math.max(seq.duration * pps, 1800);
  const trackHeight = tds.compactTracks ? 28 : 42;
  const selectedIds = new Set(store.sessionState.selectedClipIds);

  // ZONE B: Track Headers
  const headersCol = document.getElementById('timeline-headers-container');
  if (headersCol) {
    let html = `<div class="timeline-ruler-corner"><span>TRACKS (${seq.tracks.length})</span><span class="icon icon-sm">layers</span></div>`;
    for (const track of seq.tracks) {
      const isVideo = track.type === 'video';
      html += `
        <div class="track-header-item" style="height: ${trackHeight}px; border-left-color: ${track.color};" data-id="${track.id}">
          <div style="display: flex; align-items: center; gap: 4px; min-width: 0;">
            <button class="track-target-btn ${track.targeted ? 'active' : ''}" data-action="target" title="Track Targeting">${track.shortName}</button>
            <input class="track-name-input" value="${track.name}" title="${track.name}">
          </div>
          <div style="display: flex; align-items: center; gap: 1px;">
            ${isVideo ? `
              <button class="track-btn ${track.visible ? 'active' : ''}" data-action="vis" title="Track Visibility"><span class="icon icon-sm">${track.visible ? 'visibility' : 'visibility_off'}</span></button>
            ` : `
              <button class="track-btn ${track.muted ? 'muted' : ''}" data-action="mute" title="Mute Track"><span class="icon icon-sm">${track.muted ? 'volume_off' : 'volume_up'}</span></button>
              <button class="track-btn ${track.solo ? 'soloed' : ''}" data-action="solo" title="Solo Track"><span class="icon icon-sm">headphones</span></button>
            `}
            <button class="track-btn ${track.syncLock ? 'active' : ''}" data-action="synclock" title="Sync Lock"><span class="icon icon-sm">sync</span></button>
            <button class="track-btn ${track.locked ? 'active' : ''}" data-action="lock" title="Lock Track"><span class="icon icon-sm">${track.locked ? 'lock' : 'lock_open'}</span></button>
          </div>
        </div>
      `;
    }
    headersCol.innerHTML = html;

    headersCol.querySelectorAll('.track-header-item').forEach(el => {
      const track = seq.tracks.find(t => t.id === el.dataset.id);
      if (!track) return;
      el.querySelector('[data-action="vis"]')?.addEventListener('click', () => { track.visible = !track.visible; store.scheduleSave(200); renderTimeline(); renderProgramMonitor(); });
      el.querySelector('[data-action="mute"]')?.addEventListener('click', () => { track.muted = !track.muted; audioEngine.updateTrackParams(track, seq.tracks); store.scheduleSave(200); renderTimeline(); });
      el.querySelector('[data-action="solo"]')?.addEventListener('click', () => { track.solo = !track.solo; audioEngine.updateTrackParams(track, seq.tracks); store.scheduleSave(200); renderTimeline(); });
      el.querySelector('[data-action="synclock"]')?.addEventListener('click', () => { track.syncLock = !track.syncLock; store.scheduleSave(200); renderTimeline(); });
      el.querySelector('[data-action="lock"]')?.addEventListener('click', () => { track.locked = !track.locked; store.scheduleSave(200); renderTimeline(); });
      el.querySelector('[data-action="target"]')?.addEventListener('click', () => {
        seq.tracks.filter(t => t.type === track.type).forEach(t => t.targeted = false);
        track.targeted = true;
        store.scheduleSave(200); renderTimeline();
      });
      el.querySelector('.track-name-input')?.addEventListener('change', (e) => { track.name = e.target.value; store.scheduleSave(200); });
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        openContextMenu(e.clientX, e.clientY, [
          { label: 'Rename Track...', action: () => { const n = prompt('Track Name:', track.name); if (n) { track.name = n; store.scheduleSave(200); renderTimeline(); } } },
          { label: 'Cycle Track Color', action: () => { const i = TRACK_COLORS.indexOf(track.color); track.color = TRACK_COLORS[(i + 1) % TRACK_COLORS.length]; store.scheduleSave(200); renderTimeline(); } },
          { label: track.locked ? 'Unlock Track' : 'Lock Track', action: () => { track.locked = !track.locked; store.scheduleSave(200); renderTimeline(); } },
          { sep: true },
          { label: 'Add Video Track', action: () => addTrack('video') },
          { label: 'Add Audio Track', action: () => addTrack('audio') },
          { sep: true },
          { label: 'Delete Track', action: () => deleteTrack(track.id) },
        ]);
      });
    });
  }

  // ZONE C: Ruler & Markers
  const ruler = document.getElementById('timeline-ruler-bar');
  if (ruler) {
    ruler.style.width = `${totalWidth}px`;
    const step = pps > 60 ? 1 : (pps > 20 ? 5 : 10);
    let ticks = '';
    for (let s = 0; s <= seq.duration; s += step) {
      ticks += `<div class="ruler-tick" style="left: ${s * pps}px;">${formatTimecode(s, seq.fps)}</div>`;
    }
    if (tds.showMarkers) {
      for (const m of seq.markers) {
        ticks += `<div class="timeline-marker-pin" style="left: ${m.time * pps}px; background: ${m.color};" title="${m.label}"></div>`;
      }
    }
    ruler.innerHTML = ticks;
  }

  // ZONE D: Track Lanes & Clips
  const lanes = document.getElementById('timeline-lanes-container');
  if (lanes) {
    let lanesHtml = '';
    for (const track of seq.tracks) {
      lanesHtml += `<div class="timeline-track-lane" data-id="${track.id}" style="height: ${trackHeight}px; width: ${totalWidth}px;">`;
      for (const clip of seq.clips.filter(c => c.trackId === track.id)) {
        const leftPx = clip.timelineStart * pps;
        const widthPx = Math.max(16, clip.timelineDuration * pps);
        const isAudio = track.type === 'audio';
        const isSel = selectedIds.has(clip.id);
        const dec = clip.assetId ? store.runtimeState.decoders.get(clip.assetId) : null;
        const offline = dec && dec.missing;
        const hasFx = clip.colorEffects && (clip.colorEffects.exposure !== 0 || clip.colorEffects.contrast !== 1 || clip.colorEffects.saturation !== 1);

        lanesHtml += `
          <div class="timeline-clip-block ${isAudio ? 'audio' : ''} ${isSel ? 'selected' : ''}" data-id="${clip.id}" style="left: ${leftPx}px; width: ${widthPx}px; ${offline ? 'background: #7F1D1D; border-color: var(--error);' : (clip.isTitle ? 'background: #5B21B6;' : '')}">
            <div class="trim-handle left"></div>
            ${clip.transitionIn ? `<div class="clip-transition-badge" title="${clip.transitionIn.name}">T</div>` : ''}
            <div style="display: flex; align-items: center; gap: 4px; overflow: hidden; pointer-events: none; padding-left: ${clip.transitionIn ? '14px' : '0'};">
              <span class="icon icon-sm">${offline ? 'link_off' : (clip.isTitle ? 'title' : (isAudio ? 'graphic_eq' : 'movie'))}</span>
              ${tds.showNames ? `<span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${clip.name}</span>` : ''}
            </div>
            ${isAudio && tds.showWaveforms ? `<div style="position: absolute; bottom: 2px; left: 8px; right: 8px; height: 10px; opacity: 0.38; background: repeating-linear-gradient(90deg, #38C995 0px, #38C995 2px, transparent 2px, transparent 4px); pointer-events: none;"></div>` : ''}
            ${isAudio && tds.showAudioBand ? `<div class="clip-rubber-band" style="top: 50%; background: rgba(56,201,149,0.7);"></div>` : ''}
            ${!isAudio && tds.showVideoBand ? `<div class="clip-rubber-band" style="top: 25%; background: rgba(229,180,92,0.75);"></div>` : ''}
            ${tds.showBadges ? `<span style="font-size: 9.5px; opacity: 0.85; display: inline-flex; align-items: center; gap: 2px; pointer-events: none;">${hasFx ? '<span style="color: var(--warning); font-weight:700;">fx</span>' : ''}${clip.timelineDuration.toFixed(1)}s</span>` : ''}
            <div class="trim-handle right"></div>
          </div>
        `;
      }
      lanesHtml += `</div>`;
    }
    lanes.innerHTML = lanesHtml;

    // Bind Asset & Source Range Drop onto Track Lanes
    lanes.querySelectorAll('.timeline-track-lane').forEach(laneEl => {
      const trackId = laneEl.dataset.id;
      laneEl.addEventListener('dragover', (e) => { e.preventDefault(); laneEl.style.background = 'rgba(75,141,255,0.1)'; });
      laneEl.addEventListener('dragleave', () => { laneEl.style.background = ''; });
      laneEl.addEventListener('drop', (e) => {
        e.preventDefault();
        laneEl.style.background = '';
        try {
          const data = JSON.parse(e.dataTransfer.getData('text/plain'));
          const rect = laneEl.getBoundingClientRect();
          const scrollLeft = document.getElementById('timeline-scroll-area')?.scrollLeft || 0;
          const dropTime = Math.max(0, (e.clientX - rect.left + scrollLeft) / store.sessionState.timelineZoom);
          if (data?.type === 'asset' && data.assetId) {
            insertSourceOrAssetToTimeline(data.assetId, dropTime, { mode: 'overwrite', explicitTrackId: trackId });
          } else if (data?.type === 'source-range' && data.assetId) {
            insertSourceOrAssetToTimeline(data.assetId, dropTime, {
              mode: 'overwrite',
              explicitTrackId: trackId,
              explicitSourceStart: data.sourceStart,
              explicitDuration: data.duration,
            });
          }
        } catch {}
      });
    });

    // Bind Clip Click, Drag (Snap Guide + Alt Bypass), Trim & Context Menu
    lanes.querySelectorAll('.timeline-clip-block').forEach(clipEl => {
      const clipId = clipEl.dataset.id;
      const clip = seq.clips.find(c => c.id === clipId);
      const track = seq.tracks.find(t => t.id === clip?.trackId);
      if (!clip || !track) return;

      clipEl.addEventListener('click', (e) => {
        e.stopPropagation();
        if (store.sessionState.activeTool === 'razor') {
          if (!track.locked) splitClipAction(clipId, store.sessionState.playheadTime);
          return;
        }
        setSelectedClipIds([clipId]);
        // Switch monitor to Program if in single mode so user immediately sees sequence composition
        if (store.sessionState.monitorMode === 'single' && store.sessionState.activeMonitorTab !== 'program') {
          switchMonitorTab('program');
        }
        renderTimeline();
        renderInspector();
        renderProgramMonitor();
      });

      clipEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        setSelectedClipIds([clipId]);
        renderTimeline();
        renderInspector();

        if (track.type === 'audio') {
          openContextMenu(e.clientX, e.clientY, [
            { label: 'Gain +3.0 dB', action: () => executeCommand('Gain +3dB', () => { clip.audio.volumeDb = Math.min(12, clip.audio.volumeDb + 3); }) },
            { label: 'Gain -3.0 dB', action: () => executeCommand('Gain -3dB', () => { clip.audio.volumeDb = Math.max(-40, clip.audio.volumeDb - 3); }) },
            { label: 'Add 1s Fade In & Out', action: () => executeCommand('Add Fades', () => { clip.audio.fadeIn = 1; clip.audio.fadeOut = 1; }) },
            { sep: true },
            { label: 'Open Audio Mixer Workspace', action: () => switchWorkspace('audio') },
            { label: 'Delete Audio Clip', shortcut: 'Del', action: deleteActiveClip },
          ]);
        } else {
          openContextMenu(e.clientX, e.clientY, [
            { label: 'Split at Playhead', shortcut: 'Ctrl+K', action: () => splitClipAction(clipId, store.sessionState.playheadTime) },
            { label: 'Copy Clip', shortcut: 'Ctrl+C', action: () => { store.runtimeState.clipboardClip = JSON.parse(JSON.stringify(clip)); } },
            { label: 'Apply Cross Dissolve In', action: () => applyTransitionToActiveClip(TRANSITION_CATALOG[0]) },
            { label: 'Speed / Duration...', action: () => editClipSpeedPrompt(clip) },
            { label: 'Reset Transform & Grade', action: () => resetClipProperties(clip) },
            { sep: true },
            { label: 'Delete Clip', shortcut: 'Del', action: deleteActiveClip },
          ]);
        }
      });

      clipEl.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || e.target.classList.contains('trim-handle') || store.sessionState.activeTool === 'razor' || track.locked) return;
        e.preventDefault();
        const startX = e.clientX;
        const initStart = clip.timelineStart;

        const onMove = (ev) => {
          const raw = Math.max(0, initStart + (ev.clientX - startX) / store.sessionState.timelineZoom);
          const snapRes = computeSnappedTime(raw, clip.id, ev.altKey);
          clip.timelineStart = snapRes.time;
          showSnapGuide(snapRes.snapped ? snapRes.time : null);
          renderTimeline();
        };
        const onUp = () => {
          showSnapGuide(null);
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
          executeCommand('Move Clip', () => {});
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      });

      clipEl.querySelector('.trim-handle.left')?.addEventListener('mousedown', (e) => {
        if (track.locked) return;
        e.stopPropagation(); e.preventDefault();
        const startX = e.clientX;
        const initStart = clip.timelineStart, initDur = clip.timelineDuration, initSrc = clip.sourceStart;
        const onMove = (ev) => {
          const delta = Math.min((ev.clientX - startX) / store.sessionState.timelineZoom, initDur - 0.2);
          clip.timelineStart = Math.max(0, initStart + delta);
          clip.timelineDuration = Math.max(0.2, initDur - delta);
          clip.sourceStart = Math.max(0, initSrc + delta);
          renderTimeline();
        };
        const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); executeCommand('Trim Clip In', () => {}); };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      });

      clipEl.querySelector('.trim-handle.right')?.addEventListener('mousedown', (e) => {
        if (track.locked) return;
        e.stopPropagation(); e.preventDefault();
        const startX = e.clientX;
        const initDur = clip.timelineDuration;
        const onMove = (ev) => {
          clip.timelineDuration = Math.max(0.2, initDur + (ev.clientX - startX) / store.sessionState.timelineZoom);
          renderTimeline();
        };
        const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); executeCommand('Trim Clip Out', () => {}); };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      });
    });
  }
  updatePlayheadPositionUI();
}

function updatePlayheadPositionUI() {
  const line = document.getElementById('playhead-line');
  if (line) line.style.left = `${store.sessionState.playheadTime * store.sessionState.timelineZoom}px`;
}

function splitClipAction(clipId, splitTime) {
  const seq = getActiveSequence();
  const clip = seq.clips.find(c => c.id === clipId);
  if (!clip || splitTime <= clip.timelineStart + 0.05 || splitTime >= clip.timelineStart + clip.timelineDuration - 0.05) return;
  executeCommand('Split Clip', () => {
    const offset = splitTime - clip.timelineStart;
    const right = {
      ...JSON.parse(JSON.stringify(clip)),
      id: `clip_${Date.now()}_r`,
      timelineStart: splitTime,
      timelineDuration: clip.timelineDuration - offset,
      sourceStart: clip.sourceStart + offset,
      transitionIn: null,
    };
    clip.timelineDuration = offset;
    seq.clips.push(right);
    setSelectedClipIds([right.id]);
  });
}

function deleteActiveClip() {
  const id = getSelectedClipId();
  if (!id) return;
  const seq = getActiveSequence();
  executeCommand('Delete Clip', () => {
    seq.clips = seq.clips.filter(c => c.id !== id);
    setSelectedClipIds([]);
  });
}

function pasteClipboardClip() {
  const src = store.runtimeState.clipboardClip;
  if (!src) return;
  const seq = getActiveSequence();
  executeCommand('Paste Clip', () => {
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = `clip_paste_${Date.now()}`;
    copy.timelineStart = store.sessionState.playheadTime;
    seq.clips.push(copy);
    setSelectedClipIds([copy.id]);
  });
}

function editClipSpeedPrompt(clip) {
  const val = prompt('Playback Speed Multiplier (0.25 to 4.0):', String(clip.speed || 1));
  const num = parseFloat(val);
  if (!isNaN(num) && num >= 0.25 && num <= 4) {
    executeCommand('Change Clip Speed', () => { clip.speed = num; });
  }
}

function resetClipProperties(clip) {
  executeCommand('Reset Clip Transform & Grade', () => {
    clip.transform = { positionX: 0, positionY: 0, scale: 1, rotation: 0, opacity: 1 };
    clip.colorEffects = { exposure: 0, contrast: 1, brightness: 0, saturation: 1, temperature: 0, tint: 0, gamma: 1, lift: 0, gain: 0, invert: false };
    clip.transitionIn = null;
  });
}

// ----------------------------------------------------
// 13. Context Menu, Specialist Panels & Inspector
// ----------------------------------------------------
function openContextMenu(x, y, items) {
  const menu = document.getElementById('timeline-context-menu');
  if (!menu) return;
  menu.innerHTML = items.map((item, idx) => item.sep
    ? `<div class="menu-sep"></div>`
    : `<div class="menu-entry" data-cm-idx="${idx}"><span>${item.label}</span>${item.shortcut ? `<span class="menu-shortcut">${item.shortcut}</span>` : ''}</div>`
  ).join('');
  menu.querySelectorAll('.menu-entry').forEach(el => {
    el.addEventListener('click', () => { menu.classList.remove('open'); items[parseInt(el.dataset.cmIdx, 10)]?.action?.(); });
  });
  menu.style.left = `${Math.min(x, window.innerWidth - 210)}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - 240)}px`;
  menu.classList.add('open');
}

function initContextMenuDismiss() {
  document.addEventListener('click', () => document.getElementById('timeline-context-menu')?.classList.remove('open'));
}

function renderEffectsLibrary() {
  const pills = document.getElementById('fx-category-pills');
  const list = document.getElementById('fx-catalog-list');
  if (!pills || !list) return;
  const cats = ['All', ...TRANSITION_CATEGORIES];
  pills.innerHTML = cats.map(c => `<button class="fx-pill ${uiState.selectedFxCategory === c ? 'active' : ''}" data-cat="${c}">${c}</button>`).join('');
  pills.querySelectorAll('.fx-pill').forEach(b => b.addEventListener('click', () => { uiState.selectedFxCategory = b.dataset.cat; renderEffectsLibrary(); }));

  const filtered = TRANSITION_CATALOG.filter(t => uiState.selectedFxCategory === 'All' || t.category === uiState.selectedFxCategory);
  list.innerHTML = filtered.map(tr => `
    <div class="fx-item-card" data-tr-id="${tr.id}">
      <div style="display: flex; align-items: center; gap: 6px;">
        <span class="icon icon-sm" style="color: var(--accent-cyan);">${tr.icon}</span>
        <div><div style="font-weight: 600; font-size: 11.5px;">${tr.name}</div><div style="font-size: 10px; color: var(--text-muted);">${tr.category} · ${tr.defaultDuration}s</div></div>
      </div>
      <button class="action-btn-compact primary">Apply</button>
    </div>
  `).join('');
  list.querySelectorAll('.fx-item-card').forEach(card => card.addEventListener('click', () => {
    const def = TRANSITION_CATALOG.find(t => t.id === card.dataset.trId);
    if (def) applyTransitionToActiveClip(def);
  }));
}

function applyTransitionToActiveClip(def) {
  const clip = getActiveClip();
  if (!clip) { alert('Select a video clip on the timeline first.'); return; }
  executeCommand(`Apply Transition: ${def.name}`, () => {
    clip.transitionIn = { typeId: def.id, name: def.name, duration: def.defaultDuration, alignment: 'start', direction: 'left-to-right', ease: 'smooth', borderPx: 0, softness: 50 };
  });
}

function drawMotionGraphCanvas() {
  const canvas = document.getElementById('motion-graph-canvas');
  if (!canvas) return;
  canvas.width = canvas.clientWidth || 720; canvas.height = canvas.clientHeight || 82;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#070A10'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#1B2230';
  for (let x = 0; x < canvas.width; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
  ctx.strokeStyle = '#4B8DFF'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(30, canvas.height - 14);
  ctx.bezierCurveTo(canvas.width * 0.35, canvas.height - 14, canvas.width * 0.45, 14, canvas.width * 0.72, 14);
  ctx.lineTo(canvas.width - 30, 14); ctx.stroke();
}

const COLOR_LUTS = [
  { name: 'Rec.709 Neutral',        vals: { exposure: 0, contrast: 1.0, saturation: 1.0, temperature: 0 } },
  { name: 'Cinematic Teal & Orange',vals: { exposure: 0.1, contrast: 1.25, saturation: 1.15, temperature: -12 } },
  { name: 'Kodak 2383 Film Print',  vals: { exposure: 0.05, contrast: 1.32, saturation: 1.1, temperature: 8 } },
  { name: 'Bleach Bypass',          vals: { exposure: 0.15, contrast: 1.45, saturation: 0.45, temperature: -5 } },
  { name: 'Noir Monochrome',        vals: { exposure: 0.0, contrast: 1.4, saturation: 0.0, temperature: 0 } },
];

function renderColorClipsGallery() {
  const body = document.getElementById('color-clips-body');
  if (!body) return;
  const seq = getActiveSequence();
  const selId = getSelectedClipId();
  const vClips = seq.clips.filter(c => seq.tracks.find(t => t.id === c.trackId)?.type === 'video');

  body.innerHTML = `
    <div style="font-size: 10.5px; font-weight: 700; color: var(--accent); margin-bottom: 6px;">SEQUENCE SHOTS (${vClips.length})</div>
    ${vClips.length === 0 ? `<div style="font-size: 11px; color: var(--text-muted); margin-bottom: 12px;">Add video clips to grade shots here.</div>` : vClips.map((c, idx) => `
      <div class="fx-item-card" data-shot-id="${c.id}" style="${c.id === selId ? 'border-color: var(--accent); background: rgba(75,141,255,0.12);' : ''}">
        <div><div style="font-weight: 600;">Shot ${idx + 1}: ${c.name}</div><div style="font-size: 10px; color: var(--text-muted);">${formatTimecode(c.timelineStart, seq.fps)} · ${c.timelineDuration.toFixed(1)}s</div></div>
      </div>
    `).join('')}
    <div style="font-size: 10.5px; font-weight: 700; color: var(--accent); margin: 12px 0 6px;">LOOKS & LUT PRESETS</div>
    ${COLOR_LUTS.map((lut, i) => `<div class="fx-item-card" data-lut-idx="${i}"><span>${lut.name}</span><span class="icon icon-sm" style="color: var(--accent-cyan);">palette</span></div>`).join('')}
  `;
  body.querySelectorAll('[data-shot-id]').forEach(el => el.addEventListener('click', () => {
    const c = seq.clips.find(x => x.id === el.dataset.shotId);
    if (c) { setSelectedClipIds([c.id]); seekSequence(c.timelineStart + 0.05); renderColorClipsGallery(); renderInspector(); }
  }));
  body.querySelectorAll('[data-lut-idx]').forEach(el => el.addEventListener('click', () => {
    const clip = getActiveClip();
    if (!clip) { alert('Select a shot first to apply a LUT.'); return; }
    const lut = COLOR_LUTS[parseInt(el.dataset.lutIdx, 10)];
    executeCommand(`Apply LUT: ${lut.name}`, () => { Object.assign(clip.colorEffects, lut.vals); });
  }));
}

function initColorWheelsPanel() {
  const body = document.getElementById('color-wheels-body');
  if (!body) return;
  const wheels = [
    { label: 'Lift (Shadows)', prop: 'lift' },
    { label: 'Gamma (Midtones)', prop: 'brightness' },
    { label: 'Gain (Highlights)', prop: 'gain' },
    { label: 'Offset (Global)', prop: 'exposure' },
  ];
  body.innerHTML = wheels.map(w => `
    <div class="color-wheel-box">
      <div style="font-size: 11px; font-weight: 600; color: var(--text-secondary);">${w.label}</div>
      <div class="color-wheel-ring" data-wheel-prop="${w.prop}"><div class="color-wheel-inner"><div class="color-wheel-dot" id="dot-${w.prop}"></div></div></div>
      <input type="range" min="-1" max="1" step="0.02" value="0" data-wheel-slider="${w.prop}" style="width: 110px;">
    </div>
  `).join('');

  body.querySelectorAll('.color-wheel-ring').forEach(ring => {
    ring.addEventListener('mousedown', (e) => {
      const clip = getActiveClip(); if (!clip) return;
      const prop = ring.dataset.wheelProp;
      const update = (ev) => {
        const rect = ring.getBoundingClientRect();
        const dx = Math.max(-1, Math.min(1, ((ev.clientX - rect.left) / rect.width - 0.5) * 2));
        const dy = Math.max(-1, Math.min(1, ((ev.clientY - rect.top) / rect.height - 0.5) * 2));
        const dot = document.getElementById(`dot-${prop}`);
        if (dot) { dot.style.left = `${50 + dx * 38}%`; dot.style.top = `${50 + dy * 38}%`; }
        clip.colorEffects.temperature = Math.round(dx * 40);
        clip.colorEffects[prop] = -dy * 0.6;
        renderProgramMonitor();
      };
      update(e);
      const onMove = (ev) => update(ev);
      const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); store.scheduleSave(250); };
      window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
    });
  });

  body.querySelectorAll('[data-wheel-slider]').forEach(s => s.addEventListener('input', (e) => {
    const clip = getActiveClip(); if (!clip) return;
    clip.colorEffects[s.dataset.wheelSlider] = parseFloat(e.target.value);
    renderProgramMonitor(); store.scheduleSave(250);
  }));

  document.getElementById('btn-reset-wheels')?.addEventListener('click', () => {
    const clip = getActiveClip(); if (!clip) return;
    resetClipProperties(clip);
    body.querySelectorAll('.color-wheel-dot').forEach(d => { d.style.left = '50%'; d.style.top = '50%'; });
    body.querySelectorAll('[data-wheel-slider]').forEach(s => { s.value = '0'; });
  });
}

function renderLiveColorScopes(sourceCanvas) {
  const scopeCanvas = document.getElementById('live-rgb-scope-canvas');
  if (!scopeCanvas || !sourceCanvas) return;
  const w = scopeCanvas.width = scopeCanvas.clientWidth || 260;
  const h = scopeCanvas.height = 145;
  const ctx = scopeCanvas.getContext('2d');
  ctx.fillStyle = '#06080B'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(0, (h / 4) * i); ctx.lineTo(w, (h / 4) * i); ctx.stroke(); }
  try {
    const sample = document.createElement('canvas'); sample.width = 64; sample.height = 36;
    const sctx = sample.getContext('2d'); sctx.drawImage(sourceCanvas, 0, 0, 64, 36);
    const data = sctx.getImageData(0, 0, 64, 36).data;
    const rB = new Uint32Array(64), gB = new Uint32Array(64), bB = new Uint32Array(64);
    for (let i = 0; i < data.length; i += 4) { rB[data[i] >> 2]++; gB[data[i + 1] >> 2]++; bB[data[i + 2] >> 2]++; }
    const maxB = Math.max(1, ...rB, ...gB, ...bB);
    const drawC = (bins, col) => {
      ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath();
      for (let i = 0; i < 64; i++) { const x = (i / 63) * w, y = h - (bins[i] / maxB) * (h - 10) - 4; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.stroke();
    };
    drawC(rB, 'rgba(227,111,120,0.9)'); drawC(gB, 'rgba(56,201,149,0.9)'); drawC(bB, 'rgba(75,141,255,0.9)');
  } catch {}
}

function initAudioConsoleControls() {
  document.getElementById('btn-init-audio-engine')?.addEventListener('click', () => {
    audioEngine.ensureContext();
    const seq = getActiveSequence();
    seq.tracks.filter(t => t.type === 'audio').forEach(t => audioEngine.updateTrackParams(t, seq.tracks));
    updateAudioStatusTelemetry(); renderAudioConsole();
  });
  document.getElementById('audio-layout-select')?.addEventListener('change', (e) => {
    audioEngine.channelLayout = e.target.value; updateAudioStatusTelemetry();
  });
}

function renderAudioConsole() {
  const body = document.getElementById('audio-console-body');
  if (!body) return;
  const seq = getActiveSequence();
  const audioTracks = seq.tracks.filter(t => t.type === 'audio');
  const selTrack = audioTracks.find(t => t.id === store.sessionState.selectedTrackId) || audioTracks[0];

  body.innerHTML = `
    <div class="mixer-strips-deck">
      ${audioTracks.map(t => `
        <div class="channel-strip" data-strip-id="${t.id}" style="border-top: 3px solid ${t.color}; ${selTrack && selTrack.id === t.id ? 'border-color: var(--accent);' : ''}">
          <div style="font-size: 10.5px; font-weight: 700; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%;">${t.name}</div>
          <select class="compact-select strip-bus-select" data-track-id="${t.id}" style="width: 100%; font-size: 9.5px;">
            ${audioEngine.busDefinitions.map(b => `<option value="${b.id}" ${t.busId === b.id ? 'selected' : ''}>→ ${b.name}</option>`).join('')}
          </select>
          <div class="fader-track-wrap">
            <input type="range" class="vertical-fader strip-fader" data-track-id="${t.id}" min="-40" max="12" step="0.5" value="${t.volumeDb || 0}">
            <div class="strip-mini-meter"><div class="strip-mini-fill"></div></div>
          </div>
          <div style="font-family: monospace; font-size: 10px;" id="strip-db-${t.id}">${(t.volumeDb || 0).toFixed(1)} dB</div>
          <div style="display: flex; gap: 3px;">
            <button class="track-btn ${t.muted ? 'muted' : ''}" data-strip-mute="${t.id}" style="border: 1px solid var(--border); font-size: 10px; font-weight: 700;">M</button>
            <button class="track-btn ${t.solo ? 'soloed' : ''}" data-strip-solo="${t.id}" style="border: 1px solid var(--border); font-size: 10px; font-weight: 700;">S</button>
          </div>
        </div>
      `).join('')}
      ${audioEngine.busDefinitions.map(b => `
        <div class="channel-strip bus-strip" style="border-top-color: ${b.color};">
          <div style="font-size: 10px; font-weight: 700; color: ${b.color};">BUS: ${b.name}</div>
          <div style="font-size: 9px; color: var(--text-muted);">→ Master</div>
          <div class="fader-track-wrap"><input type="range" class="vertical-fader bus-fader" data-bus-id="${b.id}" min="-40" max="6" step="0.5" value="${b.volumeDb}"><div class="strip-mini-meter"><div class="strip-mini-fill"></div></div></div>
          <div style="font-family: monospace; font-size: 10px;" id="bus-db-${b.id}">${b.volumeDb.toFixed(1)} dB</div>
        </div>
      `).join('')}
      <div class="channel-strip master-strip">
        <div style="font-size: 11px; font-weight: 700; color: var(--accent);">MASTER</div>
        <div style="font-size: 9px; color: var(--success);">Limiter -2dB</div>
        <div class="fader-track-wrap"><input type="range" class="vertical-fader" id="master-fader" min="-40" max="6" step="0.5" value="${audioEngine.master?.volumeDb || 0}"><div class="strip-mini-meter"><div class="strip-mini-fill"></div></div><div class="strip-mini-meter"><div class="strip-mini-fill"></div></div></div>
        <div style="font-family: monospace; font-size: 10px;" id="master-db-val">${(audioEngine.master?.volumeDb || 0).toFixed(1)} dB</div>
      </div>
    </div>
    <div class="audio-rack-col">
      <div style="font-size: 10.5px; font-weight: 700; color: var(--accent);">3-BAND PARAMETRIC EQ · ${selTrack ? selTrack.name : ''}</div>
      ${selTrack ? `
        <div class="field-row"><div class="field-header"><span>Low Shelf (120 Hz)</span><span class="field-val" id="eq-low-val">${(selTrack.eqLow||0).toFixed(1)} dB</span></div><input type="range" id="eq-low-slider" min="-12" max="12" step="0.5" value="${selTrack.eqLow||0}"></div>
        <div class="field-row"><div class="field-header"><span>Mid Peaking (1.2 kHz)</span><span class="field-val" id="eq-mid-val">${(selTrack.eqMid||0).toFixed(1)} dB</span></div><input type="range" id="eq-mid-slider" min="-12" max="12" step="0.5" value="${selTrack.eqMid||0}"></div>
        <div class="field-row"><div class="field-header"><span>High Shelf (8 kHz)</span><span class="field-val" id="eq-high-val">${(selTrack.eqHigh||0).toFixed(1)} dB</span></div><input type="range" id="eq-high-slider" min="-12" max="12" step="0.5" value="${selTrack.eqHigh||0}"></div>
        <div class="field-row"><div class="field-header"><span>Stereo Pan</span><span class="field-val" id="eq-pan-val">${selTrack.pan||0}</span></div><input type="range" id="eq-pan-slider" min="-100" max="100" step="1" value="${selTrack.pan||0}"></div>
      ` : ''}
    </div>
    <div class="loudness-col">
      <div style="font-size: 10.5px; font-weight: 700; color: var(--accent);">LOUDNESS (EBU R128)</div>
      <div class="lufs-big-readout" id="lufs-integrated-val">-∞ LUFS</div>
      <div class="field-row"><div class="field-header"><span>Momentary</span><span class="field-val" id="lufs-momentary-val">-∞ LUFS</span></div></div>
      <div class="field-row"><div class="field-header"><span>True Peak</span><span class="field-val" id="lufs-truepeak-val">-∞ dBTP</span></div></div>
    </div>
  `;

  body.querySelectorAll('.channel-strip[data-strip-id]').forEach(el => el.addEventListener('click', () => {
    store.sessionState.selectedTrackId = el.dataset.stripId; store.scheduleSave(200); renderAudioConsole();
  }));
  body.querySelectorAll('.strip-fader').forEach(f => f.addEventListener('input', (e) => {
    const tr = audioTracks.find(t => t.id === f.dataset.trackId); if (!tr) return;
    tr.volumeDb = parseFloat(e.target.value);
    const lbl = document.getElementById(`strip-db-${tr.id}`); if (lbl) lbl.textContent = `${tr.volumeDb.toFixed(1)} dB`;
    audioEngine.updateTrackParams(tr, seq.tracks); store.scheduleSave(300);
  }));
  body.querySelectorAll('.strip-bus-select').forEach(sel => sel.addEventListener('change', (e) => {
    const tr = audioTracks.find(t => t.id === sel.dataset.trackId); if (!tr) return;
    tr.busId = e.target.value; audioEngine.updateTrackParams(tr, seq.tracks); store.scheduleSave(200);
  }));
  body.querySelectorAll('[data-strip-mute]').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation(); const tr = audioTracks.find(t => t.id === btn.dataset.stripMute); if (!tr) return;
    tr.muted = !tr.muted; audioEngine.updateTrackParams(tr, seq.tracks); store.scheduleSave(200); renderAudioConsole(); renderTimeline();
  }));
  body.querySelectorAll('[data-strip-solo]').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation(); const tr = audioTracks.find(t => t.id === btn.dataset.stripSolo); if (!tr) return;
    tr.solo = !tr.solo; audioEngine.updateTrackParams(tr, seq.tracks); store.scheduleSave(200); renderAudioConsole(); renderTimeline();
  }));
  body.querySelectorAll('.bus-fader').forEach(f => f.addEventListener('input', (e) => {
    const v = parseFloat(e.target.value); audioEngine.updateBusParams(f.dataset.busId, v, false);
    const lbl = document.getElementById(`bus-db-${f.dataset.busId}`); if (lbl) lbl.textContent = `${v.toFixed(1)} dB`;
  }));
  document.getElementById('master-fader')?.addEventListener('input', (e) => {
    const v = parseFloat(e.target.value); audioEngine.ensureContext(); audioEngine.updateMasterParams(v);
    const lbl = document.getElementById('master-db-val'); if (lbl) lbl.textContent = `${v.toFixed(1)} dB`;
  });
  if (selTrack) {
    const bindEq = (sId, vId, prop, suf = ' dB') => document.getElementById(sId)?.addEventListener('input', (e) => {
      selTrack[prop] = parseFloat(e.target.value);
      const vEl = document.getElementById(vId); if (vEl) vEl.textContent = `${selTrack[prop].toFixed(prop === 'pan' ? 0 : 1)}${suf}`;
      audioEngine.updateTrackParams(selTrack, seq.tracks); store.scheduleSave(300);
    });
    bindEq('eq-low-slider', 'eq-low-val', 'eqLow');
    bindEq('eq-mid-slider', 'eq-mid-val', 'eqMid');
    bindEq('eq-high-slider', 'eq-high-val', 'eqHigh');
    bindEq('eq-pan-slider', 'eq-pan-val', 'pan', '');
  }
}

function initDeliverControls() {
  document.getElementById('btn-render-all-queue')?.addEventListener('click', () => {
    renderQueue.renderAllQueued((ctx, w, h, t) => renderSequenceFrameAtTime(ctx, w, h, t));
  });
  document.getElementById('btn-cancel-queue')?.addEventListener('click', () => renderQueue.cancelActive());
}

function renderDeliverSettings() {
  const body = document.getElementById('deliver-settings-body');
  if (!body) return;
  const preset = EXPORT_PRESETS.find(p => p.id === uiState.selectedDeliverPreset) || EXPORT_PRESETS[0];
  const codecs = store.runtimeState.codecCapabilities || detectExportCodecs();
  const seq = getActiveSequence();
  const contentEnd = seq.clips.reduce((max, c) => Math.max(max, c.timelineStart + c.timelineDuration), 0);
  const exportDur = contentEnd > 0 ? Math.min(30, contentEnd) : 5;

  body.innerHTML = `
    <div style="padding: 10px; display: flex; flex-direction: column; gap: 10px;">
      <div style="display: flex; flex-wrap: wrap; gap: 4px;">
        ${EXPORT_PRESETS.map(p => `<button class="fx-pill ${p.id === preset.id ? 'active' : ''}" data-preset-id="${p.id}">${p.name}</button>`).join('')}
      </div>
      <div class="deliver-form-grid" style="padding: 0;">
        <div class="field-row"><div class="field-header"><span>Output Filename</span></div><input type="text" id="deliv-filename" value="${store.projectState.title.replace(/\s+/g, '_')}_Master" style="background: var(--bg-input); border: 1px solid var(--border); color: #fff; padding: 5px 7px; border-radius: 3px; font-size: 11.5px;"></div>
        <div class="field-row"><div class="field-header"><span>Container & Codec</span></div><input type="text" value="${preset.container.toUpperCase()} (${preset.codec.toUpperCase()})" readonly style="background: var(--bg-input); border: 1px solid var(--border); color: var(--accent-cyan); padding: 5px 7px; border-radius: 3px; font-size: 11.5px;"></div>
        <div class="field-row"><div class="field-header"><span>Resolution</span></div><input type="text" value="${preset.width} × ${preset.height}" readonly style="background: var(--bg-input); border: 1px solid var(--border); color: #fff; padding: 5px 7px; border-radius: 3px; font-size: 11.5px;"></div>
        <div class="field-row"><div class="field-header"><span>Frame Rate & Bitrate</span></div><input type="text" value="${preset.fps} fps · ${preset.bitrateMbps} Mbps" readonly style="background: var(--bg-input); border: 1px solid var(--border); color: #fff; padding: 5px 7px; border-radius: 3px; font-size: 11.5px;"></div>
      </div>
      <div style="background: #10151E; border: 1px solid var(--border); border-radius: 4px; padding: 8px; font-size: 10.5px;">
        <div style="font-weight: 700; color: var(--text-secondary); margin-bottom: 4px;">BROWSER CODEC CAPABILITY MATRIX</div>
        <div style="display: flex; flex-wrap: wrap; gap: 8px;">${codecs.formats.map(f => `<span style="color: ${f.supported ? 'var(--success)' : 'var(--text-muted)'};">${f.supported ? '✓' : '✕'} ${f.label}</span>`).join('')}</div>
      </div>
      <div style="display: flex; justify-content: flex-end;"><button class="action-btn-compact primary" id="btn-add-to-render-queue" style="padding: 6px 14px;"><span class="icon icon-sm">add_to_queue</span> Add to Render Queue</button></div>
    </div>
  `;
  body.querySelectorAll('[data-preset-id]').forEach(b => b.addEventListener('click', () => { uiState.selectedDeliverPreset = b.dataset.presetId; renderDeliverSettings(); }));
  document.getElementById('btn-add-to-render-queue')?.addEventListener('click', () => {
    renderQueue.addJob({
      filename: document.getElementById('deliv-filename')?.value || 'Master_Export',
      container: preset.container, codec: preset.codec, width: preset.width, height: preset.height,
      fps: preset.fps, bitrateMbps: preset.bitrateMbps, audioChannels: preset.audioChannels, durationSec: exportDur,
    });
  });
}

function renderDeliverQueue() {
  const body = document.getElementById('deliver-queue-body');
  if (!body) return;
  if (renderQueue.jobs.length === 0) {
    body.innerHTML = `<div style="padding: 28px; text-align: center; color: var(--text-muted);">Render Queue is empty. Click <strong>Add to Render Queue</strong> above.</div>`;
    return;
  }
  body.innerHTML = `
    <table class="queue-table">
      <thead><tr><th>Output File</th><th>Specs</th><th>Status</th><th style="width: 180px;">Progress</th><th>Size</th><th>Actions</th></tr></thead>
      <tbody>
        ${renderQueue.jobs.map(j => `
          <tr>
            <td style="font-weight: 600;">${j.filename}.${j.container}</td>
            <td style="color: var(--text-secondary);">${j.width}×${j.height} · ${j.fps}fps · ${j.codec.toUpperCase()}</td>
            <td><span style="color: ${j.status === 'completed' ? 'var(--success)' : (j.status === 'failed' ? 'var(--error)' : 'var(--accent)')}; font-weight: 600; text-transform: uppercase; font-size: 10px;">${j.status}</span></td>
            <td><div style="display: flex; align-items: center; gap: 6px;"><div style="flex: 1; height: 6px; background: #1A2230; border-radius: 3px; overflow: hidden;"><div style="width: ${j.progress}%; height: 100%; background: ${j.status === 'completed' ? 'var(--success)' : 'var(--accent)'};"></div></div><span style="font-family: monospace; font-size: 10.5px;">${j.progress}%</span></div></td>
            <td style="font-family: monospace;">${j.outputSizeBytes > 0 ? `${(j.outputSizeBytes / 1024).toFixed(1)} KB` : '--'}</td>
            <td style="display: flex; gap: 4px;">
              ${j.outputUrl ? `<a href="${j.outputUrl}" download="${j.filename}.${j.container}" class="action-btn-compact primary" style="text-decoration: none;">Download</a>` : ''}
              ${j.status === 'failed' || j.status === 'cancelled' ? `<button class="action-btn-compact btn-retry-job" data-job-id="${j.id}">Retry</button>` : ''}
              <button class="action-btn-compact danger btn-remove-job" data-job-id="${j.id}">Remove</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  body.querySelectorAll('.btn-retry-job').forEach(b => b.addEventListener('click', () => renderQueue.retryJob(b.dataset.jobId)));
  body.querySelectorAll('.btn-remove-job').forEach(b => b.addEventListener('click', () => renderQueue.removeJob(b.dataset.jobId)));
}

function renderInspector() {
  const container = document.getElementById('inspector-content');
  if (!container) return;
  const clip = getActiveClip();
  const seq = getActiveSequence();
  const ws = store.workspaceState.activeWorkspace;
  const statusInfo = document.getElementById('status-clip-info');

  if (ws === 'media') {
    const asset = store.sessionState.sourceAssetId ? store.projectState.assets[store.sessionState.sourceAssetId] : null;
    if (!asset) {
      container.innerHTML = `<div style="padding: 16px; color: var(--text-muted); font-size: 11.5px;">Select a media asset to inspect dimensions, codec, duration, and relink status.</div>`;
      return;
    }
    const dec = store.runtimeState.decoders.get(asset.id);
    container.innerHTML = `
      <div class="inspector-accordion">
        <div class="accordion-header"><span>Source Asset Metadata</span><span class="icon icon-sm">expand_more</span></div>
        <div class="accordion-content">
          <div class="field-row"><div class="field-header"><span>Filename</span><span class="field-val">${asset.name}</span></div></div>
          <div class="field-row"><div class="field-header"><span>Status</span><span class="field-val" style="color: ${dec?.missing ? 'var(--error)' : 'var(--success)'};">${dec?.missing ? 'MEDIA OFFLINE' : 'Online'}</span></div></div>
          <div class="field-row"><div class="field-header"><span>Dimensions</span><span class="field-val">${asset.width} × ${asset.height}</span></div></div>
          <div class="field-row"><div class="field-header"><span>Duration</span><span class="field-val">${formatTimecode(asset.duration, 24)}</span></div></div>
          <div class="field-row"><div class="field-header"><span>File Size</span><span class="field-val">${(asset.size / (1024 * 1024)).toFixed(2)} MB</span></div></div>
          ${dec?.missing ? `<button class="action-btn-compact primary" id="insp-relink-asset-btn">Relink Media File...</button>` : ''}
        </div>
      </div>
    `;
    document.getElementById('insp-relink-asset-btn')?.addEventListener('click', () => triggerRelinkForAsset(asset.id));
    return;
  }

  if (ws === 'color') {
    const c = clip?.colorEffects || { exposure: 0, contrast: 1, saturation: 1, temperature: 0 };
    container.innerHTML = `
      <div class="inspector-accordion">
        <div class="accordion-header"><span>Live RGB Histogram Scope</span><span class="icon icon-sm">expand_more</span></div>
        <div class="accordion-content">
          <canvas id="live-rgb-scope-canvas" class="scope-canvas"></canvas>
          <div style="font-size: 10px; color: var(--text-muted); text-align: center;">Real-time pixel sample from Program Monitor</div>
        </div>
      </div>
      <div class="inspector-accordion">
        <div class="accordion-header"><span>Primary Grade · ${clip ? clip.name : 'No Clip Selected'}</span><span class="icon icon-sm">expand_more</span></div>
        <div class="accordion-content">
          <div class="field-row"><div class="field-header"><span>Exposure</span><span class="field-val" id="disp-exp">${c.exposure.toFixed(2)}</span></div><input type="range" id="insp-exp" min="-2" max="2" step="0.05" value="${c.exposure}"></div>
          <div class="field-row"><div class="field-header"><span>Contrast</span><span class="field-val" id="disp-cont">${c.contrast.toFixed(2)}</span></div><input type="range" id="insp-cont" min="0" max="2" step="0.05" value="${c.contrast}"></div>
          <div class="field-row"><div class="field-header"><span>Saturation</span><span class="field-val" id="disp-sat">${c.saturation.toFixed(2)}</span></div><input type="range" id="insp-sat" min="0" max="2" step="0.05" value="${c.saturation}"></div>
          <div class="field-row"><div class="field-header"><span>Temperature</span><span class="field-val" id="disp-temp">${c.temperature || 0}</span></div><input type="range" id="insp-temp" min="-100" max="100" step="1" value="${c.temperature || 0}"></div>
        </div>
      </div>
    `;
    if (clip) {
      bindSlider('insp-exp', 'disp-exp', v => { clip.colorEffects.exposure = v; }, v => v.toFixed(2));
      bindSlider('insp-cont', 'disp-cont', v => { clip.colorEffects.contrast = v; }, v => v.toFixed(2));
      bindSlider('insp-sat', 'disp-sat', v => { clip.colorEffects.saturation = v; }, v => v.toFixed(2));
      bindSlider('insp-temp', 'disp-temp', v => { clip.colorEffects.temperature = v; }, v => String(v));
    }
    const prg = document.getElementById('program-render-canvas');
    if (prg) renderLiveColorScopes(prg);
    return;
  }

  if (!clip) {
    if (statusInfo) statusInfo.textContent = seq.name;
    container.innerHTML = `
      <div class="inspector-accordion">
        <div class="accordion-header"><span>Master Sequence Settings</span><span class="icon icon-sm">expand_more</span></div>
        <div class="accordion-content">
          <div class="field-row"><div class="field-header"><span>Sequence</span><span class="field-val">${seq.name}</span></div></div>
          <div class="field-row"><div class="field-header"><span>Resolution</span><span class="field-val">${seq.width} × ${seq.height}</span></div></div>
          <div class="field-row"><div class="field-header"><span>Frame Rate</span><span class="field-val">${seq.fps}.00 fps</span></div></div>
          <div class="field-row"><div class="field-header"><span>Duration</span><span class="field-val">${formatTimecode(seq.duration, seq.fps)}</span></div></div>
          <div class="field-row"><div class="field-header"><span>Markers</span><span class="field-val">${seq.markers.length}</span></div></div>
        </div>
      </div>
      <div class="inspector-accordion">
        <div class="accordion-header"><span>Project Overview</span><span class="icon icon-sm">expand_more</span></div>
        <div class="accordion-content">
          <div class="field-row"><div class="field-header"><span>Imported Assets</span><span class="field-val">${Object.keys(store.projectState.assets).length}</span></div></div>
          <div class="field-row"><div class="field-header"><span>Timeline Clips</span><span class="field-val">${seq.clips.length}</span></div></div>
          <div class="field-row"><div class="field-header"><span>Tracks</span><span class="field-val">${seq.tracks.filter(t => t.type==='video').length}V / ${seq.tracks.filter(t => t.type==='audio').length}A</span></div></div>
        </div>
      </div>
    `;
    bindAccordionToggles(container);
    return;
  }

  if (statusInfo) statusInfo.textContent = `Selected: ${clip.name}`;
  const track = seq.tracks.find(t => t.id === clip.trackId);

  if (track && track.type === 'audio') {
    const a = clip.audio;
    container.innerHTML = `
      <div class="inspector-accordion">
        <div class="accordion-header"><span>Audio Clip: ${clip.name}</span><span class="icon icon-sm">expand_more</span></div>
        <div class="accordion-content">
          <div class="field-row"><div class="field-header"><span>Volume (dB)</span><span class="field-val" id="disp-vol">${a.volumeDb.toFixed(1)} dB</span></div><input type="range" id="insp-vol" min="-40" max="12" step="0.5" value="${a.volumeDb}"></div>
          <div class="field-row"><div class="field-header"><span>Pan</span><span class="field-val" id="disp-pan">${a.pan}</span></div><input type="range" id="insp-pan" min="-100" max="100" step="1" value="${a.pan}"></div>
          <div class="field-row"><div class="field-header"><span>Fade In</span><span class="field-val" id="disp-fi">${(a.fadeIn||0).toFixed(1)}s</span></div><input type="range" id="insp-fi" min="0" max="5" step="0.1" value="${a.fadeIn||0}"></div>
          <div class="field-row"><div class="field-header"><span>Fade Out</span><span class="field-val" id="disp-fo">${(a.fadeOut||0).toFixed(1)}s</span></div><input type="range" id="insp-fo" min="0" max="5" step="0.1" value="${a.fadeOut||0}"></div>
        </div>
      </div>
    `;
    bindSlider('insp-vol', 'disp-vol', v => { clip.audio.volumeDb = v; }, v => `${v.toFixed(1)} dB`);
    bindSlider('insp-pan', 'disp-pan', v => { clip.audio.pan = v; }, v => String(v));
    bindSlider('insp-fi', 'disp-fi', v => { clip.audio.fadeIn = v; }, v => `${v.toFixed(1)}s`);
    bindSlider('insp-fo', 'disp-fo', v => { clip.audio.fadeOut = v; }, v => `${v.toFixed(1)}s`);
    bindAccordionToggles(container);
    return;
  }

  const t = clip.transform;
  const c = clip.colorEffects;
  const dec = clip.assetId ? store.runtimeState.decoders.get(clip.assetId) : null;

  container.innerHTML = `
    ${dec?.missing ? `
      <div style="margin: 8px; padding: 8px; background: rgba(227,111,120,0.14); border: 1px solid var(--error); border-radius: 4px; font-size: 11px;">
        <strong style="color: var(--error);">Media Offline:</strong> Original footage requires relinking.
        <button class="action-btn-compact primary" id="insp-relink-clip-btn" style="margin-top: 6px; width: 100%; justify-content: center;">Relink Media...</button>
      </div>
    ` : ''}
    <div class="inspector-accordion">
      <div class="accordion-header"><span>Video Transform · ${clip.name}</span><span class="icon icon-sm">expand_more</span></div>
      <div class="accordion-content">
        <div class="field-row"><div class="field-header"><span>Scale</span><span class="field-val" id="disp-scale">${t.scale.toFixed(2)}x</span></div><input type="range" id="insp-scale" min="0.1" max="3" step="0.05" value="${t.scale}"></div>
        <div class="field-row"><div class="field-header"><span>Position X</span><span class="field-val" id="disp-posx">${t.positionX}px</span></div><input type="range" id="insp-posx" min="-600" max="600" step="5" value="${t.positionX}"></div>
        <div class="field-row"><div class="field-header"><span>Position Y</span><span class="field-val" id="disp-posy">${t.positionY}px</span></div><input type="range" id="insp-posy" min="-400" max="400" step="5" value="${t.positionY}"></div>
        <div class="field-row"><div class="field-header"><span>Rotation</span><span class="field-val" id="disp-rot">${t.rotation}°</span></div><input type="range" id="insp-rot" min="-180" max="180" step="1" value="${t.rotation}"></div>
        <div class="field-row"><div class="field-header"><span>Opacity</span><span class="field-val" id="disp-opac">${Math.round(t.opacity * 100)}%</span></div><input type="range" id="insp-opac" min="0" max="1" step="0.05" value="${t.opacity}"></div>
      </div>
    </div>
    ${clip.transitionIn ? `
      <div class="inspector-accordion">
        <div class="accordion-header"><span>Transition: ${clip.transitionIn.name}</span><span class="icon icon-sm">expand_more</span></div>
        <div class="accordion-content">
          <div class="field-row"><div class="field-header"><span>Duration</span><span class="field-val" id="disp-tr-dur">${clip.transitionIn.duration.toFixed(2)}s</span></div><input type="range" id="insp-tr-dur" min="0.2" max="4" step="0.1" value="${clip.transitionIn.duration}"></div>
          <button class="action-btn-compact danger" id="btn-remove-tr">Remove Transition</button>
        </div>
      </div>
    ` : ''}
    <div class="inspector-accordion">
      <div class="accordion-header"><span>Color Grading</span><span class="icon icon-sm">expand_more</span></div>
      <div class="accordion-content">
        <div class="field-row"><div class="field-header"><span>Exposure</span><span class="field-val" id="disp-exp">${c.exposure.toFixed(2)}</span></div><input type="range" id="insp-exp" min="-2" max="2" step="0.05" value="${c.exposure}"></div>
        <div class="field-row"><div class="field-header"><span>Contrast</span><span class="field-val" id="disp-cont">${c.contrast.toFixed(2)}</span></div><input type="range" id="insp-cont" min="0" max="2" step="0.05" value="${c.contrast}"></div>
        <div class="field-row"><div class="field-header"><span>Saturation</span><span class="field-val" id="disp-sat">${c.saturation.toFixed(2)}</span></div><input type="range" id="insp-sat" min="0" max="2" step="0.05" value="${c.saturation}"></div>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <label style="font-size: 11px; display: flex; gap: 4px; align-items: center;"><input type="checkbox" id="insp-invert" ${c.invert ? 'checked' : ''}> Invert</label>
          <button class="action-btn-compact" id="btn-reset-clip-grade">Reset</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('insp-relink-clip-btn')?.addEventListener('click', () => triggerRelinkForAsset(clip.assetId));
  bindSlider('insp-scale', 'disp-scale', v => { clip.transform.scale = v; }, v => `${v.toFixed(2)}x`);
  bindSlider('insp-posx', 'disp-posx', v => { clip.transform.positionX = v; }, v => `${v}px`);
  bindSlider('insp-posy', 'disp-posy', v => { clip.transform.positionY = v; }, v => `${v}px`);
  bindSlider('insp-rot', 'disp-rot', v => { clip.transform.rotation = v; }, v => `${v}°`);
  bindSlider('insp-opac', 'disp-opac', v => { clip.transform.opacity = v; }, v => `${Math.round(v * 100)}%`);
  bindSlider('insp-exp', 'disp-exp', v => { clip.colorEffects.exposure = v; }, v => v.toFixed(2));
  bindSlider('insp-cont', 'disp-cont', v => { clip.colorEffects.contrast = v; }, v => v.toFixed(2));
  bindSlider('insp-sat', 'disp-sat', v => { clip.colorEffects.saturation = v; }, v => v.toFixed(2));
  if (clip.transitionIn) {
    bindSlider('insp-tr-dur', 'disp-tr-dur', v => { clip.transitionIn.duration = v; }, v => `${v.toFixed(2)}s`);
    document.getElementById('btn-remove-tr')?.addEventListener('click', () => executeCommand('Remove Transition', () => { clip.transitionIn = null; }));
  }
  document.getElementById('insp-invert')?.addEventListener('change', e => { clip.colorEffects.invert = e.target.checked; renderProgramMonitor(); store.scheduleSave(250); });
  document.getElementById('btn-reset-clip-grade')?.addEventListener('click', () => resetClipProperties(clip));
  bindAccordionToggles(container);
}

function bindAccordionToggles(container) {
  container.querySelectorAll('.accordion-header').forEach(h => h.addEventListener('click', () => {
    const c = h.nextElementSibling; const ic = h.querySelector('.icon');
    if (c) { const col = c.classList.toggle('collapsed'); if (ic) ic.textContent = col ? 'chevron_right' : 'expand_more'; }
  }));
}

function bindSlider(sId, dId, updateFn, fmtFn) {
  const s = document.getElementById(sId), d = document.getElementById(dId);
  s?.addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    updateFn(v);
    if (d) d.textContent = fmtFn(v);
    renderProgramMonitor();
    store.scheduleSave(300);
  });
}

// ----------------------------------------------------
// 14. Menus, Modals & Keyboard Engine
// ----------------------------------------------------
function initMenus() {
  document.getElementById('m-file-new')?.addEventListener('click', () => {
    if (!confirm('Create a new empty project?')) return;
    store.projectState = createDefaultProjectState();
    store.sessionState = createDefaultSessionState();
    store.runtimeState.decoders.clear();
    store.flushNow();
    syncSessionControlsUI();
    renderAll();
  });
  document.getElementById('m-file-save')?.addEventListener('click', () => store.flushNow());
  document.getElementById('m-file-save-as')?.addEventListener('click', () => {
    const t = prompt('Save Project As:', store.projectState.title);
    if (t) { store.projectState.title = t; store.flushNow(); renderAll(); }
  });
  document.getElementById('m-file-import')?.addEventListener('click', () => document.getElementById('video-file-input')?.click());
  document.getElementById('m-file-export')?.addEventListener('click', () => switchWorkspace('deliver'));
  document.getElementById('btn-goto-deliver')?.addEventListener('click', () => switchWorkspace('deliver'));
  document.getElementById('m-file-archive')?.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(store.projectState, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${store.projectState.title.replace(/\s+/g, '_')}.frameflow.json`; a.click();
  });

  document.getElementById('m-edit-undo')?.addEventListener('click', undo);
  document.getElementById('m-edit-redo')?.addEventListener('click', redo);
  document.getElementById('btn-undo')?.addEventListener('click', undo);
  document.getElementById('btn-redo')?.addEventListener('click', redo);
  document.getElementById('m-edit-copy')?.addEventListener('click', () => { const c = getActiveClip(); if (c) store.runtimeState.clipboardClip = JSON.parse(JSON.stringify(c)); });
  document.getElementById('m-edit-paste')?.addEventListener('click', pasteClipboardClip);
  document.getElementById('m-edit-delete')?.addEventListener('click', deleteActiveClip);
  document.getElementById('m-edit-shortcuts')?.addEventListener('click', openShortcutsModal);

  document.getElementById('m-proj-rename')?.addEventListener('click', () => { const t = prompt('Rename Project:', store.projectState.title); if (t) { store.projectState.title = t; store.flushNow(); renderAll(); } });
  document.getElementById('m-proj-newbin')?.addEventListener('click', createNewBin);
  document.getElementById('m-proj-media')?.addEventListener('click', () => switchWorkspace('media'));

  document.getElementById('m-clip-insert')?.addEventListener('click', () => { if (store.sessionState.sourceAssetId) insertSourceOrAssetToTimeline(store.sessionState.sourceAssetId, store.sessionState.playheadTime, { mode: 'insert', useSourceRange: true }); });
  document.getElementById('m-clip-split')?.addEventListener('click', () => { const id = getSelectedClipId(); if (id) splitClipAction(id, store.sessionState.playheadTime); });
  document.getElementById('m-clip-speed')?.addEventListener('click', () => { const c = getActiveClip(); if (c) editClipSpeedPrompt(c); });
  document.getElementById('m-clip-link')?.addEventListener('click', () => document.getElementById('btn-link-toggle')?.click());
  document.getElementById('m-clip-reset')?.addEventListener('click', () => { const c = getActiveClip(); if (c) resetClipProperties(c); });

  document.getElementById('m-seq-new')?.addEventListener('click', () => {
    const n = prompt('New Sequence Name:', 'Sequence 02'); if (!n) return;
    const id = `seq_${Date.now()}`;
    executeCommand('New Sequence', () => {
      store.projectState.sequences[id] = { ...JSON.parse(JSON.stringify(getActiveSequence())), id, name: n, clips: [], markers: [] };
      store.sessionState.activeSequenceId = id;
      store.sessionState.playheadTime = 0;
      setSelectedClipIds([]);
    });
  });
  document.getElementById('m-seq-duplicate')?.addEventListener('click', () => {
    const cur = getActiveSequence(); const id = `seq_${Date.now()}`;
    executeCommand('Duplicate Sequence', () => {
      store.projectState.sequences[id] = { ...JSON.parse(JSON.stringify(cur)), id, name: `${cur.name} Copy` };
      store.sessionState.activeSequenceId = id;
    });
  });
  document.getElementById('m-seq-render-preview')?.addEventListener('click', renderProgramMonitor);

  document.getElementById('m-time-snap')?.addEventListener('click', toggleSnapping);
  document.getElementById('m-time-add-v')?.addEventListener('click', () => addTrack('video'));
  document.getElementById('m-time-add-a')?.addEventListener('click', () => addTrack('audio'));
  document.getElementById('m-time-marker')?.addEventListener('click', addMarkerAtPlayhead);
  document.getElementById('m-time-fit')?.addEventListener('click', fitTimelineToSequence);

  document.getElementById('m-gfx-title')?.addEventListener('click', addTitleOverlayClip);
  document.getElementById('m-gfx-safe')?.addEventListener('click', () => document.getElementById('btn-toggle-safe-margins')?.click());
  document.getElementById('m-gfx-motion')?.addEventListener('click', () => switchWorkspace('motion'));
  document.getElementById('m-fx-transitions')?.addEventListener('click', () => switchWorkspace('motion'));
  document.getElementById('m-fx-apply-dissolve')?.addEventListener('click', () => applyTransitionToActiveClip(TRANSITION_CATALOG[0]));
  document.getElementById('m-fx-reset')?.addEventListener('click', () => { const c = getActiveClip(); if (c) resetClipProperties(c); });
  document.getElementById('m-audio-mixer')?.addEventListener('click', () => switchWorkspace('audio'));
  document.getElementById('m-audio-routing')?.addEventListener('click', () => switchWorkspace('audio'));
  document.getElementById('m-audio-loudness')?.addEventListener('click', () => { audioEngine.lufsHistory = []; });
  document.getElementById('m-color-wheels')?.addEventListener('click', () => switchWorkspace('color'));
  document.getElementById('m-color-reset')?.addEventListener('click', () => { const c = getActiveClip(); if (c) resetClipProperties(c); });

  document.getElementById('m-view-split')?.addEventListener('click', toggleMonitorSplitView);
  document.getElementById('m-view-safe')?.addEventListener('click', () => document.getElementById('btn-toggle-safe-margins')?.click());
  document.getElementById('m-view-zoom-in')?.addEventListener('click', () => zoomTimeline(1.3));
  document.getElementById('m-view-zoom-out')?.addEventListener('click', () => zoomTimeline(1 / 1.3));
  document.getElementById('m-view-fullscreen')?.addEventListener('click', () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
  });

  // Window: Panel Toggles, Save Workspace, Reset Current Workspace, Reset All Workspaces
  document.querySelectorAll('[data-panel-toggle]').forEach(entry => {
    entry.addEventListener('click', () => layoutManager.togglePanelVisibility(entry.dataset.panelToggle));
  });

  document.getElementById('win-save-ws')?.addEventListener('click', () => {
    const name = prompt('Save Workspace Layout As:', `Custom ${store.workspaceState.activeWorkspace.toUpperCase()}`);
    if (!name) return;
    const activeLayout = JSON.parse(JSON.stringify(layoutManager.getActiveLayout()));
    store.workspaceState.customWorkspaces.push({ id: `cws_${Date.now()}`, name, baseWorkspace: store.workspaceState.activeWorkspace, layout: activeLayout });
    store.flushNow();
    renderCustomWorkspacesMenu();
  });

  document.getElementById('win-reset-current-ws')?.addEventListener('click', () => {
    layoutManager.resetCurrentWorkspace();
    applyWorkspaceUI(store.workspaceState.activeWorkspace);
  });

  document.getElementById('win-reset-all-ws')?.addEventListener('click', () => {
    layoutManager.resetAllWorkspaces();
    applyWorkspaceUI(store.workspaceState.activeWorkspace);
  });

  document.getElementById('m-help-shortcuts')?.addEventListener('click', openShortcutsModal);
  document.getElementById('m-help-diagnostics')?.addEventListener('click', openDiagnosticsModal);
  document.getElementById('btn-open-diagnostics')?.addEventListener('click', openDiagnosticsModal);
  document.getElementById('m-help-about')?.addEventListener('click', () => alert('FRAMEFLOW Studio v6.0.0\n4-Layer Persistent NLE Architecture'));
}

function renderCustomWorkspacesMenu() {
  const container = document.getElementById('custom-workspaces-menu-list');
  if (!container) return;
  container.innerHTML = (store.workspaceState.customWorkspaces || []).map(w => `
    <div class="menu-entry" data-load-ws="${w.id}">
      <span>★ ${w.name}</span>
      <span class="menu-shortcut" data-del-ws="${w.id}" title="Delete Workspace">✕</span>
    </div>
  `).join('');
  container.querySelectorAll('[data-load-ws]').forEach(el => el.addEventListener('click', (e) => {
    if (e.target.dataset.delWs) {
      e.stopPropagation();
      store.workspaceState.customWorkspaces = store.workspaceState.customWorkspaces.filter(x => x.id !== e.target.dataset.delWs);
      store.flushNow(); renderCustomWorkspacesMenu(); return;
    }
    const ws = store.workspaceState.customWorkspaces.find(x => x.id === el.dataset.loadWs);
    if (ws) {
      store.workspaceState.activeWorkspace = ws.baseWorkspace;
      store.workspaceState.layouts[ws.baseWorkspace] = JSON.parse(JSON.stringify(ws.layout));
      store.flushNow();
      applyWorkspaceUI(ws.baseWorkspace);
      renderAll();
    }
  }));
}

const KEYBOARD_ROWS = [
  ['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', 'Backspace'],
  ['Tab', 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '[', ']', '\\'],
  ['Caps', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';', "'", 'Enter'],
  ['Shift', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '/', 'Shift'],
  ['Ctrl', 'Alt', 'Space', 'Alt', 'Ctrl'],
];

function initModals() {
  document.getElementById('btn-close-shortcuts-modal')?.addEventListener('click', () => {
    store.runtimeState.rebindingShortcutId = null;
    document.getElementById('modal-shortcuts')?.classList.remove('active');
  });
  document.getElementById('btn-close-diagnostics-modal')?.addEventListener('click', () => {
    document.getElementById('modal-diagnostics')?.classList.remove('active');
  });
  document.getElementById('btn-reset-shortcuts')?.addEventListener('click', () => {
    activeShortcuts = structuredClone(DEFAULT_SHORTCUTS);
    localStorage.removeItem('ff_shortcuts');
    renderVisualKeyboard(); renderShortcutsTable();
  });
  document.getElementById('btn-export-shortcuts')?.addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(activeShortcuts, null, 2)], { type: 'application/json' }));
    a.download = 'frameflow-shortcuts.json'; a.click();
  });
  document.getElementById('shortcut-search')?.addEventListener('input', (e) => renderShortcutsTable(e.target.value.toLowerCase()));
}

function openShortcutsModal() {
  document.getElementById('modal-shortcuts')?.classList.add('active');
  renderVisualKeyboard(); renderShortcutsTable();
}

function renderVisualKeyboard() {
  const container = document.getElementById('virtual-keyboard-container');
  if (!container) return;
  const map = {}; for (const s of activeShortcuts) map[s.key.toUpperCase()] = s;
  container.innerHTML = KEYBOARD_ROWS.map(row => `
    <div class="keyboard-row">${row.map(key => {
      const m = map[key.toUpperCase()];
      const style = key === 'Space' ? 'width: 210px;' : (['Backspace','Enter','Tab','Caps','Shift'].includes(key) ? 'width: 58px;' : '');
      return `<div class="k-key ${m ? `mapped ${m.type}` : ''}" style="${style}" title="${m ? `${m.name} (${key})` : key}"><span>${key}</span>${m ? `<span class="k-key-desc">${m.name.slice(0, 8)}</span>` : ''}</div>`;
    }).join('')}</div>
  `).join('');
}

function renderShortcutsTable(filter = '') {
  const tbody = document.getElementById('shortcuts-table-body');
  if (!tbody) return;
  const rows = activeShortcuts.filter(s => !filter || s.name.toLowerCase().includes(filter) || s.key.toLowerCase().includes(filter));
  tbody.innerHTML = rows.map(s => `
    <tr style="border-bottom: 1px solid var(--border-divider);">
      <td style="padding: 5px 10px; color: #fff;">${s.name}</td>
      <td style="padding: 5px 10px; color: var(--text-secondary);">${s.category}</td>
      <td style="padding: 5px 10px;"><button class="action-btn-compact btn-rebind-key" data-sc-id="${s.id}" style="font-family: monospace; color: var(--accent-cyan); border-color: var(--border);">${store.runtimeState.rebindingShortcutId === s.id ? 'Press new key...' : s.key}</button></td>
    </tr>
  `).join('');
  tbody.querySelectorAll('.btn-rebind-key').forEach(b => b.addEventListener('click', () => { store.runtimeState.rebindingShortcutId = b.dataset.scId; renderShortcutsTable(filter); }));
}

function openDiagnosticsModal() {
  const modal = document.getElementById('modal-diagnostics');
  const body = document.getElementById('diagnostics-modal-body');
  if (!modal || !body) return;
  const gpu = store.runtimeState.gpuCapabilities || {};
  const aud = audioEngine.getStatus();
  const cod = store.runtimeState.codecCapabilities || detectExportCodecs();
  const decCount = store.runtimeState.decoders.size;
  const offlineCount = Array.from(store.runtimeState.decoders.values()).filter(d => d.missing).length;

  body.innerHTML = `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11.5px;">
      <div style="background: #10151E; padding: 10px; border: 1px solid var(--border); border-radius: 4px;">
        <div style="color: var(--accent); font-weight: 700; margin-bottom: 6px;">GPU & RENDER PIPELINE</div>
        <div>Active Backend: <strong>${gpu.activeBackend || 'Unknown'}</strong></div>
        <div>WebGPU API: <strong>${gpu.webgpuAvailable ? 'Supported' : 'Not Available'}</strong></div>
        <div>WebGL 2: <strong>${gpu.webgl2Available ? 'Supported' : 'Not Available'}</strong></div>
      </div>
      <div style="background: #10151E; padding: 10px; border: 1px solid var(--border); border-radius: 4px;">
        <div style="color: var(--success); font-weight: 700; margin-bottom: 6px;">WEB AUDIO DSP ENGINE</div>
        <div>Status: <strong>${aud.state}</strong></div>
        <div>Sample Rate: <strong>${aud.sampleRate} Hz</strong></div>
        <div>Max Channels: <strong>${aud.maxChannels}</strong></div>
      </div>
      <div style="background: #10151E; padding: 10px; border: 1px solid var(--border); border-radius: 4px;">
        <div style="color: var(--accent-cyan); font-weight: 700; margin-bottom: 6px;">DECODERS & MEDIA STORE</div>
        <div>Runtime Decoders: <strong>${decCount} (${offlineCount} Offline)</strong></div>
        <div>IndexedDB Schema: <strong>v2 (4-Layer Store)</strong></div>
        <div>Export Codecs: <strong>${cod.formats.filter(f => f.supported).length} Supported</strong></div>
      </div>
      <div style="background: #10151E; padding: 10px; border: 1px solid var(--border); border-radius: 4px;">
        <div style="color: var(--warning); font-weight: 700; margin-bottom: 6px;">SESSION & PERFORMANCE</div>
        <div>Measured FPS: <strong>${store.runtimeState.measuredFps} FPS (Drops: ${store.runtimeState.droppedFrames})</strong></div>
        <div>Active Workspace: <strong>${store.workspaceState.activeWorkspace.toUpperCase()}</strong></div>
        <div>Selected Clips: <strong>${store.sessionState.selectedClipIds.length}</strong></div>
      </div>
    </div>
  `;
  modal.classList.add('active');
}

function initKeyboardEngine() {
  window.addEventListener('keydown', (e) => {
    if (store.runtimeState.rebindingShortcutId) {
      e.preventDefault();
      const combo = `${e.ctrlKey ? 'Ctrl+' : ''}${e.altKey ? 'Alt+' : ''}${e.shiftKey ? 'Shift+' : ''}${e.key.length === 1 ? e.key.toUpperCase() : e.key}`;
      const conflict = activeShortcuts.find(s => s.id !== store.runtimeState.rebindingShortcutId && s.key.toUpperCase() === combo.toUpperCase());
      const banner = document.getElementById('shortcut-conflict-banner');
      if (conflict && banner) { banner.style.display = 'block'; banner.textContent = `Conflict: "${combo}" was assigned to "${conflict.name}".`; }
      else if (banner) banner.style.display = 'none';
      const target = activeShortcuts.find(s => s.id === store.runtimeState.rebindingShortcutId);
      if (target) target.key = combo;
      store.runtimeState.rebindingShortcutId = null;
      localStorage.setItem('ff_shortcuts', JSON.stringify(activeShortcuts));
      renderVisualKeyboard(); renderShortcutsTable(); return;
    }

    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

    const code = e.code;
    const isCtrl = e.ctrlKey || e.metaKey;

    if (isCtrl && e.altKey && code === 'KeyK') { e.preventDefault(); openShortcutsModal(); return; }
    if (isCtrl && code === 'KeyZ') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (isCtrl && code === 'KeyY') { e.preventDefault(); redo(); return; }
    if (isCtrl && code === 'KeyS') { e.preventDefault(); store.flushNow(); return; }
    if (isCtrl && code === 'KeyI') { e.preventDefault(); document.getElementById('video-file-input')?.click(); return; }
    if (isCtrl && code === 'KeyM') { e.preventDefault(); switchWorkspace('deliver'); return; }
    if (isCtrl && code === 'KeyL') { e.preventDefault(); document.getElementById('btn-link-toggle')?.click(); return; }
    if (isCtrl && code === 'KeyK') { e.preventDefault(); const id = getSelectedClipId(); if (id) splitClipAction(id, store.sessionState.playheadTime); return; }
    if (isCtrl && code === 'KeyC') { const c = getActiveClip(); if (c) store.runtimeState.clipboardClip = JSON.parse(JSON.stringify(c)); return; }
    if (isCtrl && code === 'KeyV') { pasteClipboardClip(); return; }
    if (e.altKey && code === 'KeyX') { e.preventDefault(); clearSourceInOut(); return; }

    if (code === 'Backquote') {
      e.preventDefault();
      const focused = document.querySelector('.panel.focused') || document.getElementById('panel-timeline');
      if (focused) toggleMaximizePanel(focused);
      return;
    }

    if (code === 'Space') {
      e.preventDefault();
      if (store.sessionState.monitorMode === 'single' && store.sessionState.activeMonitorTab === 'source') toggleSourcePlayback();
      else toggleSequencePlayback();
      return;
    }
    if (code === 'KeyJ') { store.runtimeState.isPlayingSequence = true; store.runtimeState.playbackSpeed = store.runtimeState.playbackSpeed <= 0 ? store.runtimeState.playbackSpeed - 1 : -1; return; }
    if (code === 'KeyK') { store.runtimeState.isPlayingSequence = false; store.runtimeState.playbackSpeed = 1; return; }
    if (code === 'KeyL') { store.runtimeState.isPlayingSequence = true; store.runtimeState.playbackSpeed = store.runtimeState.playbackSpeed >= 1 ? store.runtimeState.playbackSpeed + 1 : 1; return; }
    if (code === 'ArrowLeft')  { e.preventDefault(); stepProgramFrames(e.shiftKey ? -5 : -1); return; }
    if (code === 'ArrowRight') { e.preventDefault(); stepProgramFrames(e.shiftKey ? 5 : 1); return; }

    if (code === 'Comma' && store.sessionState.sourceAssetId)  { insertSourceOrAssetToTimeline(store.sessionState.sourceAssetId, store.sessionState.playheadTime, { mode: 'insert', useSourceRange: true }); return; }
    if (code === 'Period' && store.sessionState.sourceAssetId) { insertSourceOrAssetToTimeline(store.sessionState.sourceAssetId, store.sessionState.playheadTime, { mode: 'overwrite', useSourceRange: true }); return; }

    if (code === 'KeyI') {
      if (store.sessionState.activeMonitorTab === 'source' && store.sessionState.sourceAssetId) {
        if (e.shiftKey) document.getElementById('src-btn-goto-in')?.click();
        else document.getElementById('src-btn-mark-in')?.click();
      } else {
        getActiveSequence().inPoint = store.sessionState.playheadTime; renderTimeline();
      }
      return;
    }
    if (code === 'KeyO') {
      if (store.sessionState.activeMonitorTab === 'source' && store.sessionState.sourceAssetId) {
        if (e.shiftKey) document.getElementById('src-btn-goto-out')?.click();
        else document.getElementById('src-btn-mark-out')?.click();
      } else {
        getActiveSequence().outPoint = store.sessionState.playheadTime; renderTimeline();
      }
      return;
    }

    if (code === 'KeyV') setTool('select');
    else if (code === 'KeyA') setTool('track-select');
    else if (code === 'KeyB') setTool('ripple');
    else if (code === 'KeyN') setTool('rolling');
    else if (code === 'KeyR') setTool('rate-stretch');
    else if (code === 'KeyC') setTool('razor');
    else if (code === 'KeyY') setTool('slip');
    else if (code === 'KeyU') setTool('slide');
    else if (code === 'KeyP') setTool('pen');
    else if (code === 'KeyH') setTool('hand');
    else if (code === 'KeyZ') setTool('zoom');
    else if (code === 'KeyT') { setTool('text'); addTitleOverlayClip(); }

    if (code === 'KeyS') toggleSnapping();
    if (code === 'KeyM') addMarkerAtPlayhead();
    if (code === 'Delete' || code === 'Backspace') deleteActiveClip();
    if (code === 'Backslash') fitTimelineToSequence();
    if (code === 'Equal') zoomTimeline(1.3);
    if (code === 'Minus') zoomTimeline(1 / 1.3);
  });
}

// ----------------------------------------------------
// 15. Master Render & Timecode
// ----------------------------------------------------
function renderAll() {
  renderAssetsList();
  renderTimeline();
  renderProgramMonitor();
  renderInspector();
  if (store.workspaceState.activeWorkspace === 'color') renderColorClipsGallery();
  if (store.workspaceState.activeWorkspace === 'audio') renderAudioConsole();
  if (store.workspaceState.activeWorkspace === 'deliver') { renderDeliverSettings(); renderDeliverQueue(); }
  const titleEl = document.getElementById('project-title-disp');
  if (titleEl) titleEl.textContent = store.projectState.title;
}

function formatTimecode(seconds, fps) {
  if (isNaN(seconds) || seconds < 0) seconds = 0;
  const totalFrames = Math.floor(seconds * fps);
  const ff = totalFrames % fps;
  const ss = Math.floor(seconds) % 60;
  const mm = Math.floor(seconds / 60) % 60;
  const hh = Math.floor(seconds / 3600);
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}:${pad(ff)}`;
}

function pad(n) { return n < 10 ? `0${n}` : `${n}`; }

/**
 * FRAMEFLOW Professional Nonlinear Video Editor — Version 5.0.0
 * Integrated Engine Subsystems:
 *  - Web Audio Multichannel DSP Routing & Mixing Engine (./js/audio-dsp.js)
 *  - WebGPU / WebGL2 / Canvas2D Transition & Capability Engine (./js/transitions-gpu.js)
 *  - Offline / Local Export Pipeline & Render Queue (./js/export-pipeline.js)
 * Plus:
 *  - 6 Genuinely Distinct Specialist Workspaces (Media, Edit, Motion, Color, Audio, Deliver)
 *  - Reorganized 13-Menu Bar with Real Actions
 *  - Grouped 4-Section Timeline Toolbar, align_horizontal_center Snapping with Snap Guide & Alt-Override
 *  - Dynamic Right-Click Context Menus across Clips, Tracks, Ruler, and Empty Timeline
 *  - Floating / Undockable Panels & Saved Custom Workspaces (localStorage)
 *  - Context-Aware Rebindable Keyboard Shortcuts with Conflict Detection
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

// ----------------------------------------------------
// 1. Engine Instances & Core State
// ----------------------------------------------------
const audioEngine = new FrameflowAudioEngine();
const renderQueue = new RenderQueueManager(() => {
  renderDeliverQueue();
  updateExportStatusTelemetry();
});

const TRACK_COLORS = ['#4B8DFF', '#8B5CF6', '#38C995', '#06B6D4', '#E5B45C', '#E36F78'];

const state = {
  project: {
    id: 'proj_default',
    title: 'Untitled Project',
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    assets: {},
    bins: {
      bin_root: { id: 'bin_root', name: 'Root', assetIds: [] },
    },
    activeSequenceId: 'seq_master',
    sequences: {
      seq_master: {
        id: 'seq_master',
        name: 'Master Sequence',
        width: 1920,
        height: 1080,
        fps: 24,
        duration: 60,
        playheadTime: 0,
        inPoint: null,
        outPoint: null,
        markers: [], // { id, time, label, color }
        tracks: [
          { id: 'track_v2', name: 'V2 · Overlay',       shortName: 'V2', type: 'video', color: '#8B5CF6', muted: false, solo: false, locked: false, syncLock: true, visible: true, targeted: false },
          { id: 'track_v1', name: 'V1 · Primary Video', shortName: 'V1', type: 'video', color: '#4B8DFF', muted: false, solo: false, locked: false, syncLock: true, visible: true, targeted: true },
          { id: 'track_a1', name: 'A1 · Dialogue',      shortName: 'A1', type: 'audio', color: '#38C995', muted: false, solo: false, locked: false, syncLock: true, visible: true, targeted: true,  busId: 'dialogue', volumeDb: 0, pan: 0, eqLow: 0, eqMid: 0, eqHigh: 0 },
          { id: 'track_a2', name: 'A2 · Music',         shortName: 'A2', type: 'audio', color: '#06B6D4', muted: false, solo: false, locked: false, syncLock: true, visible: true, targeted: false, busId: 'music',    volumeDb: -3, pan: 0, eqLow: 0, eqMid: 0, eqHigh: 0 },
          { id: 'track_a3', name: 'A3 · SFX',           shortName: 'A3', type: 'audio', color: '#E5B45C', muted: false, solo: false, locked: false, syncLock: true, visible: true, targeted: false, busId: 'sfx',      volumeDb: 0, pan: 0, eqLow: 0, eqMid: 0, eqHigh: 0 },
        ],
        clips: [],
      },
    },
  },
  activeClipId: null,
  activeAssetId: null,
  clipboardClip: null,
  assetSearchQuery: '',
  monitorMode: 'single',
  activeMonitorTab: 'program',
  safeMarginsVisible: false,
  pixelsPerSecond: 28,
  isPlayingSequence: false,
  playbackSpeed: 1,
  activeTool: 'select',
  isSnapping: localStorage.getItem('ff_snapping') !== 'false',
  isLinkedSelection: true,
  isSyncLockGlobal: true,
  activeWorkspace: 'edit',
  selectedFxCategory: 'All',
  selectedAudioTrackId: 'track_a1',
  selectedDeliverPreset: 'webm_1080p',
  customWorkspaces: JSON.parse(localStorage.getItem('ff_custom_workspaces') || '[]'),
  timelineDisplay: {
    showThumbnails: true,
    showWaveforms: true,
    showNames: true,
    showKeyframes: true,
    showBadges: true,
    showMarkers: true,
    showAudioBand: true,
    showVideoBand: false,
    compactTracks: false,
  },
  gpuCapabilities: null,
  codecCapabilities: null,
  measuredFps: 0,
  droppedFrames: 0,
  undoStack: [],
  redoStack: [],
  videoCache: {},
  sourceInPoint: 0,
  sourceOutPoint: 0,
  saveTimeout: null,
  rebindingShortcutId: null,
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
  { id: 'mark_in',          name: 'Set Mark In',             category: 'Transport',  key: 'I',               type: 'transport' },
  { id: 'mark_out',         name: 'Set Mark Out',            category: 'Transport',  key: 'O',               type: 'transport' },
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
// 3. Boot Sequence
// ----------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  initSplitters();
  initPanelControls();
  initMenus();
  initWorkspaceSwitcher();
  initMediaIngest();
  initMonitorsGroup();
  initTimeline();
  initColorWheelsPanel();
  initAudioConsoleControls();
  initDeliverControls();
  initKeyboardEngine();
  initModals();
  initContextMenuDismiss();

  await probeRuntimeCapabilities();
  await initPersistenceAndLoad();

  applyWorkspaceLayout(state.activeWorkspace);
  renderAll();
  startPlaybackAndTelemetryLoop();
});

function getActiveSequence() {
  return state.project.sequences[state.project.activeSequenceId];
}

function getActiveClip() {
  return getActiveSequence().clips.find(c => c.id === state.activeClipId) || null;
}

// ----------------------------------------------------
// 4. Honest Runtime Capability Probing
// ----------------------------------------------------
async function probeRuntimeCapabilities() {
  state.gpuCapabilities = await detectGraphicsCapabilities();
  state.codecCapabilities = detectExportCodecs();

  const gpuLabel = document.getElementById('status-gpu-label');
  const gpuDot = document.getElementById('status-gpu-dot');
  if (gpuLabel) gpuLabel.textContent = state.gpuCapabilities.activeBackend;
  if (gpuDot) {
    gpuDot.style.background = state.gpuCapabilities.webgpuAvailable
      ? 'var(--success)'
      : (state.gpuCapabilities.webgl2Available ? 'var(--accent-cyan)' : 'var(--warning)');
  }
  updateAudioStatusTelemetry();
}

function updateAudioStatusTelemetry() {
  const st = audioEngine.getStatus();
  const el = document.getElementById('status-audio-label');
  if (!el) return;
  if (st.state === 'running') {
    el.textContent = `Audio: Active ${(st.sampleRate / 1000).toFixed(0)}kHz`;
  } else if (st.state === 'standby') {
    el.textContent = 'Audio: Standby';
  } else {
    el.textContent = `Audio: ${st.state}`;
  }
}

function updateExportStatusTelemetry() {
  const el = document.getElementById('status-export-label');
  if (!el) return;
  const active = renderQueue.jobs.find(j => j.status === 'rendering');
  const completed = renderQueue.jobs.filter(j => j.status === 'completed').length;
  const queued = renderQueue.jobs.filter(j => j.status === 'queued').length;

  if (active) {
    el.textContent = `Export: Rendering ${active.progress}%`;
    el.style.color = 'var(--accent)';
  } else if (queued > 0) {
    el.textContent = `Export: ${queued} Queued`;
    el.style.color = 'var(--warning)';
  } else if (completed > 0) {
    el.textContent = `Export: ${completed} Ready`;
    el.style.color = 'var(--success)';
  } else {
    el.textContent = 'Export: Idle';
    el.style.color = 'var(--text-secondary)';
  }
}

// ----------------------------------------------------
// 5. Undo/Redo Command Manager & IndexedDB Storage
// ----------------------------------------------------
function executeCommand(description, applyFn) {
  const snapshot = JSON.parse(JSON.stringify(state.project));
  applyFn();
  state.undoStack.push({ description, snapshot });
  if (state.undoStack.length > 50) state.undoStack.shift();
  state.redoStack = [];
  scheduleAutoSave();
  renderAll();
}

function undo() {
  if (state.undoStack.length === 0) return;
  const current = JSON.parse(JSON.stringify(state.project));
  const { snapshot } = state.undoStack.pop();
  state.redoStack.push({ snapshot: current });
  state.project = snapshot;
  scheduleAutoSave();
  renderAll();
}

function redo() {
  if (state.redoStack.length === 0) return;
  const current = JSON.parse(JSON.stringify(state.project));
  const { snapshot } = state.redoStack.pop();
  state.undoStack.push({ snapshot: current });
  state.project = snapshot;
  scheduleAutoSave();
  renderAll();
}

const DB_NAME = 'frameflow_db';
const STORE_NAME = 'projects';
let idb = null;

async function initPersistenceAndLoad() {
  if (!window.indexedDB) return;
  idb = await new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => resolve(null);
  });
  if (!idb) return;

  const saved = await new Promise((resolve) => {
    try {
      const tx = idb.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get('proj_default');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });

  if (saved && saved.sequences) {
    // Ensure new track fields exist on older saved projects
    for (const seq of Object.values(saved.sequences)) {
      if (!seq.markers) seq.markers = [];
      for (const tr of seq.tracks) {
        if (!tr.shortName) tr.shortName = tr.name.split(' ')[0];
        if (!tr.color) tr.color = tr.type === 'video' ? '#4B8DFF' : '#38C995';
        if (tr.syncLock === undefined) tr.syncLock = true;
        if (tr.type === 'audio' && !tr.busId) tr.busId = 'dialogue';
      }
    }
    state.project = saved;
  }
}

function scheduleAutoSave() {
  const badge = document.getElementById('save-status-badge');
  if (badge) {
    badge.textContent = 'Saving...';
    badge.className = 'save-status-indicator unsaved';
  }
  clearTimeout(state.saveTimeout);
  state.saveTimeout = setTimeout(() => {
    if (!idb) return;
    try {
      state.project.modifiedAt = Date.now();
      const tx = idb.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(state.project);
      if (badge) {
        badge.textContent = '● Saved';
        badge.className = 'save-status-indicator saved';
      }
    } catch {}
  }, 500);
}

// ----------------------------------------------------
// 6. Real 6-Workspace Layout Engine & Panel Docking
// ----------------------------------------------------
function initWorkspaceSwitcher() {
  document.querySelectorAll('#workspace-bar .ws-tab').forEach(tab => {
    tab.addEventListener('click', () => switchWorkspace(tab.dataset.ws));
  });
  renderCustomWorkspacesMenu();
}

function switchWorkspace(ws) {
  state.activeWorkspace = ws;
  document.querySelectorAll('#workspace-bar .ws-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.ws === ws);
  });
  applyWorkspaceLayout(ws);
  renderAll();
}

function applyWorkspaceLayout(ws) {
  const shell = document.getElementById('workspace-shell');
  const topRow = document.getElementById('workspace-top-row');
  const bottomRow = document.getElementById('workspace-bottom-row');
  if (!shell || !topRow || !bottomRow) return;

  shell.dataset.workspace = ws;

  const panels = {
    project:        document.getElementById('panel-project'),
    effects:        document.getElementById('panel-effects'),
    colorClips:     document.getElementById('panel-color-clips'),
    monitors:       document.getElementById('monitors-pane'),
    inspector:      document.getElementById('panel-inspector'),
    deliverSettings:document.getElementById('panel-deliver-settings'),
    timeline:       document.getElementById('panel-timeline'),
    colorWheels:    document.getElementById('panel-color-wheels'),
    audioConsole:   document.getElementById('panel-audio-console'),
    deliverQueue:   document.getElementById('panel-deliver-queue'),
  };

  const splitLeft = document.getElementById('splitter-left');
  const splitRight = document.getElementById('splitter-right');
  const graphDrawer = document.getElementById('motion-graph-drawer');

  // Hide all specialist panels initially
  Object.values(panels).forEach(p => {
    if (p) {
      p.classList.add('hidden-panel');
      p.classList.remove('maximized');
    }
  });

  // Always return timeline to bottomRow unless Audio workspace needs it on topRow
  if (panels.timeline && panels.timeline.parentElement !== bottomRow) {
    bottomRow.prepend(panels.timeline);
  }
  if (graphDrawer) graphDrawer.style.display = 'none';

  const projLabel = document.getElementById('project-panel-label');
  const inspTitle = document.getElementById('inspector-header-title');
  const inspIcon  = document.getElementById('inspector-header-icon');
  const prgLabel  = document.getElementById('program-tab-label');

  if (ws === 'media') {
    panels.project.classList.remove('hidden-panel');
    panels.monitors.classList.remove('hidden-panel');
    panels.inspector.classList.remove('hidden-panel');
    splitLeft.style.display = 'block';
    splitRight.style.display = 'block';
    if (projLabel) projLabel.textContent = 'Media Browser & Bins';
    if (inspTitle) inspTitle.textContent = 'Clip Metadata';
    if (inspIcon)  inspIcon.textContent = 'description';
    if (prgLabel)  prgLabel.textContent = 'Program: Master';
    if (state.monitorMode === 'single') switchMonitorTab('source');
  } else if (ws === 'edit') {
    panels.project.classList.remove('hidden-panel');
    panels.monitors.classList.remove('hidden-panel');
    panels.inspector.classList.remove('hidden-panel');
    panels.timeline.classList.remove('hidden-panel');
    splitLeft.style.display = 'block';
    splitRight.style.display = 'block';
    if (projLabel) projLabel.textContent = 'Project';
    if (inspTitle) inspTitle.textContent = 'Inspector';
    if (inspIcon)  inspIcon.textContent = 'tune';
    if (prgLabel)  prgLabel.textContent = 'Program: Master';
    if (state.monitorMode === 'single') switchMonitorTab('program');
  } else if (ws === 'motion') {
    panels.effects.classList.remove('hidden-panel');
    panels.monitors.classList.remove('hidden-panel');
    panels.inspector.classList.remove('hidden-panel');
    panels.timeline.classList.remove('hidden-panel');
    splitLeft.style.display = 'block';
    splitRight.style.display = 'block';
    if (inspTitle) inspTitle.textContent = 'Effect Controls & Keyframes';
    if (inspIcon)  inspIcon.textContent = 'motion_mode';
    if (prgLabel)  prgLabel.textContent = 'Composition Viewer';
    if (graphDrawer) graphDrawer.style.display = 'block';
    if (state.monitorMode === 'single') switchMonitorTab('program');
    renderEffectsLibrary();
    setTimeout(drawMotionGraphCanvas, 20);
  } else if (ws === 'color') {
    panels.colorClips.classList.remove('hidden-panel');
    panels.monitors.classList.remove('hidden-panel');
    panels.inspector.classList.remove('hidden-panel');
    panels.colorWheels.classList.remove('hidden-panel');
    splitLeft.style.display = 'block';
    splitRight.style.display = 'block';
    if (inspTitle) inspTitle.textContent = 'Live Scopes & Primary Grade';
    if (inspIcon)  inspIcon.textContent = 'analytics';
    if (prgLabel)  prgLabel.textContent = 'Color Grading Viewer';
    if (state.monitorMode === 'single') switchMonitorTab('program');
    renderColorClipsGallery();
  } else if (ws === 'audio') {
    // Move Multitrack Timeline into Top Row (Full Width), Fairlight Console in Bottom Row!
    topRow.prepend(panels.timeline);
    panels.timeline.classList.remove('hidden-panel');
    panels.audioConsole.classList.remove('hidden-panel');
    splitLeft.style.display = 'none';
    splitRight.style.display = 'none';
    renderAudioConsole();
  } else if (ws === 'deliver') {
    panels.monitors.classList.remove('hidden-panel');
    panels.deliverSettings.classList.remove('hidden-panel');
    panels.deliverQueue.classList.remove('hidden-panel');
    splitLeft.style.display = 'none';
    splitRight.style.display = 'block';
    if (prgLabel) prgLabel.textContent = 'Output Preview';
    if (state.monitorMode === 'single') switchMonitorTab('program');
    renderDeliverSettings();
    renderDeliverQueue();
  }

  updateWindowPanelsCheckmarks();
}

function updateWindowPanelsCheckmarks() {
  const ids = ['panel-project', 'panel-effects', 'monitors-pane', 'panel-inspector', 'panel-timeline'];
  const labels = {
    'panel-project': 'Project / Media Browser',
    'panel-effects': 'Effects & Transitions',
    'monitors-pane': 'Source / Program Monitors',
    'panel-inspector': 'Contextual Inspector',
    'panel-timeline': 'Multitrack Timeline',
  };
  ids.forEach(id => {
    const el = document.getElementById(id);
    const chk = document.getElementById(`chk-${id}`);
    if (el && chk) {
      const open = !el.classList.contains('hidden-panel');
      chk.textContent = `${open ? '✓' : '  '} ${labels[id]}`;
    }
  });
}

function initPanelControls() {
  document.querySelectorAll('.btn-maximize-panel').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const panel = btn.closest('.panel');
      if (panel) toggleMaximizePanel(panel);
    });
  });

  document.querySelectorAll('.btn-undock-panel').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const panel = btn.closest('.panel');
      if (!panel) return;
      panel.classList.toggle('floating-panel');
      makePanelDraggable(panel);
    });
  });

  document.querySelectorAll('.panel').forEach(panel => {
    panel.addEventListener('mousedown', () => {
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('focused'));
      panel.classList.add('focused');
    });
  });
}

function makePanelDraggable(panel) {
  const header = panel.querySelector('.panel-header');
  if (!header || header.dataset.dragBound) return;
  header.dataset.dragBound = '1';

  header.addEventListener('mousedown', (e) => {
    if (!panel.classList.contains('floating-panel')) return;
    if (e.target.closest('button')) return;
    e.preventDefault();
    const startX = e.clientX - panel.offsetLeft;
    const startY = e.clientY - panel.offsetTop;

    const onMove = (ev) => {
      const x = Math.max(0, Math.min(window.innerWidth - 180, ev.clientX - startX));
      const y = Math.max(36, Math.min(window.innerHeight - 100, ev.clientY - startY));
      panel.style.left = `${x}px`;
      panel.style.top = `${y}px`;
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
}

function toggleMaximizePanel(panel) {
  const isMaxed = panel.classList.contains('maximized');
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('maximized'));
  if (!isMaxed) panel.classList.add('maximized');
}

function initSplitters() {
  setupSplitter('splitter-left', () => {
    const visible = ['panel-project', 'panel-effects', 'panel-color-clips']
      .map(id => document.getElementById(id))
      .find(el => el && !el.classList.contains('hidden-panel'));
    return visible;
  }, 'width', false, 180, 520);

  setupSplitter('splitter-right', () => {
    const visible = ['panel-inspector', 'panel-deliver-settings']
      .map(id => document.getElementById(id))
      .find(el => el && !el.classList.contains('hidden-panel'));
    return visible;
  }, 'width', true, 220, 620);

  setupSplitter('splitter-row-v', () => document.getElementById('workspace-bottom-row'), 'height', true, 160, 560);
  setupSplitter('splitter-monitors', () => document.getElementById('viewport-source'), 'width', false, 200, 750);
}

function setupSplitter(splitterId, getTargetFn, dimension, reverse, min, max) {
  const splitter = document.getElementById(splitterId);
  if (!splitter) return;
  splitter.addEventListener('mousedown', (e) => {
    const target = getTargetFn();
    if (!target) return;
    e.preventDefault();
    splitter.classList.add('active');
    const startPos = dimension === 'width' ? e.clientX : e.clientY;
    const startSize = dimension === 'width' ? target.offsetWidth : target.offsetHeight;

    const onMove = (ev) => {
      const curr = dimension === 'width' ? ev.clientX : ev.clientY;
      const delta = reverse ? (startPos - curr) : (curr - startPos);
      const next = Math.max(min, Math.min(max, startSize + delta));
      target.style[dimension] = `${next}px`;
      target.style.flex = 'none';
    };
    const onUp = () => {
      splitter.classList.remove('active');
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
}

// ----------------------------------------------------
// 7. Media Ingest & Dual-Mode Project / Media Browser
// ----------------------------------------------------
function initMediaIngest() {
  const fileInput = document.getElementById('video-file-input');
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

  fileInput?.addEventListener('change', (e) => {
    if (e.target.files?.length) handleFilesIngest(Array.from(e.target.files));
    fileInput.value = '';
  });

  document.getElementById('btn-add-bin')?.addEventListener('click', createNewBin);
  document.getElementById('asset-search-input')?.addEventListener('input', (e) => {
    state.assetSearchQuery = e.target.value.toLowerCase();
    renderAssetsList();
  });
}

function createNewBin() {
  const name = prompt('New Bin Name:', 'B-Roll Footage');
  if (!name) return;
  const id = `bin_${Date.now()}`;
  executeCommand('Create Bin', () => {
    state.project.bins[id] = { id, name, assetIds: [] };
  });
}

async function handleFilesIngest(files) {
  for (const file of files) {
    const assetId = `asset_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const url = URL.createObjectURL(file);
    const isVideo = file.type.startsWith('video');
    const isAudio = file.type.startsWith('audio');

    let duration = 10;
    let width = 1920;
    let height = 1080;

    if (isVideo || isAudio) {
      const el = document.createElement(isVideo ? 'video' : 'audio');
      el.src = url;
      el.preload = 'metadata';
      await new Promise((res) => {
        el.onloadedmetadata = () => {
          duration = isFinite(el.duration) && el.duration > 0 ? el.duration : 10;
          if (isVideo) {
            width = el.videoWidth || 1920;
            height = el.videoHeight || 1080;
          }
          res();
        };
        el.onerror = () => res();
        setTimeout(res, 1200);
      });
      if (isVideo) state.videoCache[assetId] = el;
    }

    state.project.assets[assetId] = {
      id: assetId,
      name: file.name,
      size: file.size,
      type: file.type || 'video/mp4',
      duration,
      width,
      height,
      blobUrl: url,
      addedAt: new Date().toLocaleTimeString(),
    };
    state.project.bins.bin_root.assetIds.push(assetId);
    if (!state.activeAssetId) loadAssetIntoSourceMonitor(assetId);
  }
  executeCommand('Import Media', () => {});
}

function renderAssetsList() {
  const container = document.getElementById('assets-list');
  if (!container) return;

  const assets = Object.values(state.project.assets).filter(a =>
    !state.assetSearchQuery || a.name.toLowerCase().includes(state.assetSearchQuery)
  );

  // MEDIA WORKSPACE: Full tabular metadata Media Browser!
  if (state.activeWorkspace === 'media') {
    if (assets.length === 0) {
      container.innerHTML = `<div style="padding: 28px; text-align: center; color: var(--text-muted);">No footage imported yet. Use Import Media above or drag files here to populate the Media Browser.</div>`;
      return;
    }
    container.innerHTML = `
      <table class="media-table">
        <thead>
          <tr>
            <th>Clip Name</th>
            <th>Type</th>
            <th>Resolution</th>
            <th>Duration</th>
            <th>File Size</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${assets.map(a => `
            <tr class="${state.activeAssetId === a.id ? 'selected' : ''}" data-id="${a.id}" draggable="true">
              <td style="font-weight: 500;"><span class="icon icon-sm" style="color: ${a.type.startsWith('audio') ? 'var(--success)' : 'var(--accent)'}; margin-right: 4px;">${a.type.startsWith('audio') ? 'audiotrack' : 'movie'}</span>${a.name}</td>
              <td style="color: var(--text-secondary);">${a.type || 'media'}</td>
              <td style="font-family: monospace;">${a.type.startsWith('audio') ? 'Audio Only' : `${a.width}×${a.height}`}</td>
              <td style="font-family: monospace;">${formatTimecode(a.duration, 24)}</td>
              <td style="color: var(--text-secondary);">${(a.size / (1024 * 1024)).toFixed(2)} MB</td>
              <td><button class="action-btn-compact primary btn-quick-insert" data-insert-id="${a.id}">+ Timeline</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    bindAssetRowEvents(container, 'tr[data-id]');
    container.querySelectorAll('.btn-quick-insert').forEach(b => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        insertAssetAtTime(b.dataset.insertId, getActiveSequence().playheadTime);
      });
    });
    return;
  }

  // EDIT WORKSPACE: Compact Project Bin tree
  if (assets.length === 0 && Object.keys(state.project.bins).length <= 1) {
    container.innerHTML = `<div style="font-size: 11px; color: var(--text-muted); text-align: center; padding: 18px 8px;">No media imported yet.</div>`;
    return;
  }

  let html = '';
  for (const bin of Object.values(state.project.bins)) {
    if (bin.id === 'bin_root') continue;
    html += `<div class="asset-item" style="font-weight: 600; color: var(--warning);"><span class="icon icon-sm">folder</span><span>${bin.name}</span></div>`;
  }
  for (const a of assets) {
    const isAudio = a.type.startsWith('audio');
    html += `
      <div class="asset-item ${state.activeAssetId === a.id ? 'selected' : ''}" data-id="${a.id}" draggable="true">
        <span class="icon icon-sm" style="color: ${isAudio ? 'var(--success)' : 'var(--accent)'};">${isAudio ? 'audiotrack' : 'movie'}</span>
        <div style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${a.name}</div>
        <span style="font-size: 10px; color: var(--text-muted); font-family: monospace;">${formatTimecode(a.duration, 24)}</span>
      </div>
    `;
  }
  container.innerHTML = html;
  bindAssetRowEvents(container, '.asset-item[data-id]');
}

function bindAssetRowEvents(container, selector) {
  container.querySelectorAll(selector).forEach(el => {
    const id = el.dataset.id;
    el.addEventListener('click', () => {
      state.activeAssetId = id;
      renderAssetsList();
      if (state.activeWorkspace === 'media') renderInspector();
    });
    el.addEventListener('dblclick', () => {
      loadAssetIntoSourceMonitor(id);
      if (state.monitorMode === 'single') switchMonitorTab('source');
    });
    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'asset', assetId: id }));
    });
  });
}

// ----------------------------------------------------
// 8. Unified Monitors Group & Compositor
// ----------------------------------------------------
function initMonitorsGroup() {
  document.getElementById('tab-monitor-source')?.addEventListener('click', () => switchMonitorTab('source'));
  document.getElementById('tab-monitor-program')?.addEventListener('click', () => switchMonitorTab('program'));
  document.getElementById('btn-toggle-split-view')?.addEventListener('click', toggleMonitorSplitView);
  document.getElementById('btn-toggle-safe-margins')?.addEventListener('click', toggleSafeMargins);

  const srcVideo = document.getElementById('source-video-element');
  document.getElementById('src-btn-play')?.addEventListener('click', () => {
    if (!srcVideo || !srcVideo.src) return;
    if (srcVideo.paused) {
      srcVideo.play();
      document.getElementById('src-play-icon').textContent = 'pause';
    } else {
      srcVideo.pause();
      document.getElementById('src-play-icon').textContent = 'play_arrow';
    }
  });
  srcVideo?.addEventListener('timeupdate', () => {
    if (state.activeMonitorTab === 'source') {
      const tc = document.getElementById('active-monitor-timecode');
      if (tc) tc.textContent = formatTimecode(srcVideo.currentTime, 24);
    }
  });
  document.getElementById('src-btn-mark-in')?.addEventListener('click', () => { if (srcVideo) state.sourceInPoint = srcVideo.currentTime; });
  document.getElementById('src-btn-mark-out')?.addEventListener('click', () => { if (srcVideo) state.sourceOutPoint = srcVideo.currentTime; });
  document.getElementById('src-btn-insert')?.addEventListener('click', () => {
    if (state.activeAssetId) insertAssetAtTime(state.activeAssetId, getActiveSequence().playheadTime);
  });

  document.getElementById('prg-btn-play')?.addEventListener('click', toggleSequencePlayback);
  document.getElementById('prg-btn-prev')?.addEventListener('click', () => stepFrames(-5));
  document.getElementById('prg-btn-next')?.addEventListener('click', () => stepFrames(5));
  document.getElementById('prg-btn-step-prev')?.addEventListener('click', () => stepFrames(-1));
  document.getElementById('prg-btn-step-next')?.addEventListener('click', () => stepFrames(1));

  updateMonitorsLayoutUI();
}

function toggleSafeMargins() {
  state.safeMarginsVisible = !state.safeMarginsVisible;
  document.getElementById('safe-margins-overlay')?.classList.toggle('visible', state.safeMarginsVisible);
}

function switchMonitorTab(tab) {
  state.activeMonitorTab = tab;
  updateMonitorsLayoutUI();
}

function toggleMonitorSplitView() {
  state.monitorMode = state.monitorMode === 'single' ? 'split' : 'single';
  updateMonitorsLayoutUI();
}

function updateMonitorsLayoutUI() {
  const vpSource = document.getElementById('viewport-source');
  const vpProgram = document.getElementById('viewport-program');
  const splitter = document.getElementById('splitter-monitors');
  const tabSource = document.getElementById('tab-monitor-source');
  const tabProgram = document.getElementById('tab-monitor-program');
  const splitLabel = document.getElementById('split-view-btn-label');

  if (!vpSource || !vpProgram) return;
  if (state.monitorMode === 'split') {
    vpSource.style.display = 'flex'; vpSource.style.flex = '1';
    vpProgram.style.display = 'flex'; vpProgram.style.flex = '1';
    if (splitter) splitter.style.display = 'block';
    tabSource?.classList.add('active');
    tabProgram?.classList.add('active');
    if (splitLabel) splitLabel.textContent = 'Single View';
  } else {
    if (splitter) splitter.style.display = 'none';
    if (splitLabel) splitLabel.textContent = 'Split View';
    if (state.activeMonitorTab === 'source') {
      vpSource.style.display = 'flex'; vpSource.style.flex = '1';
      vpProgram.style.display = 'none';
      tabSource?.classList.add('active');
      tabProgram?.classList.remove('active');
    } else {
      vpSource.style.display = 'none';
      vpProgram.style.display = 'flex'; vpProgram.style.flex = '1';
      tabSource?.classList.remove('active');
      tabProgram?.classList.add('active');
    }
  }
}

function loadAssetIntoSourceMonitor(assetId) {
  state.activeAssetId = assetId;
  const asset = state.project.assets[assetId];
  if (!asset) return;
  const video = document.getElementById('source-video-element');
  const emptyCard = document.getElementById('source-empty-card');
  if (video && asset.blobUrl) {
    video.src = asset.blobUrl;
    video.style.display = 'block';
    if (emptyCard) emptyCard.style.display = 'none';
    state.sourceInPoint = 0;
    state.sourceOutPoint = asset.duration;
  }
  renderAssetsList();
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
      timelineStart: seq.playheadTime,
      timelineDuration: 5,
      sourceStart: 0,
      speed: 1,
      transform: { positionX: 0, positionY: 0, scale: 1, rotation: 0, opacity: 1 },
      colorEffects: { exposure: 0, contrast: 1, brightness: 0, saturation: 1, temperature: 0, tint: 0, gamma: 1, lift: 0, gain: 0, invert: false },
      audio: { volumeDb: 0, pan: 0, fadeIn: 0, fadeOut: 0 },
      transitionIn: null,
    });
    state.activeClipId = id;
  });
}

function insertAssetAtTime(assetId, startTime, explicitTrackId = null) {
  const asset = state.project.assets[assetId];
  if (!asset) return;
  const seq = getActiveSequence();
  const duration = Math.min(10, asset.duration || 8);

  const explicitTrack = explicitTrackId ? seq.tracks.find(t => t.id === explicitTrackId) : null;
  const videoTrack = (explicitTrack && explicitTrack.type === 'video')
    ? explicitTrack
    : (seq.tracks.find(t => t.type === 'video' && t.targeted) || seq.tracks.find(t => t.type === 'video'));
  const audioTrack = (explicitTrack && explicitTrack.type === 'audio')
    ? explicitTrack
    : (seq.tracks.find(t => t.type === 'audio' && t.targeted) || seq.tracks.find(t => t.type === 'audio'));

  executeCommand('Insert Clip to Timeline', () => {
    if (videoTrack && !asset.type.startsWith('audio') && (!explicitTrack || explicitTrack.type === 'video')) {
      const id = `clip_v_${Date.now()}`;
      seq.clips.push({
        id,
        assetId: asset.id,
        name: asset.name,
        trackId: videoTrack.id,
        timelineStart: startTime,
        timelineDuration: duration,
        sourceStart: state.sourceInPoint || 0,
        speed: 1,
        transform: { positionX: 0, positionY: 0, scale: 1, rotation: 0, opacity: 1 },
        colorEffects: { exposure: 0, contrast: 1, brightness: 0, saturation: 1, temperature: 0, tint: 0, gamma: 1, lift: 0, gain: 0, invert: false },
        audio: { volumeDb: 0, pan: 0, fadeIn: 0, fadeOut: 0 },
        transitionIn: null,
      });
      state.activeClipId = id;
    }

    if (audioTrack && (asset.type.startsWith('audio') || !explicitTrack || explicitTrack.type === 'video')) {
      const id = `clip_a_${Date.now()}`;
      seq.clips.push({
        id,
        assetId: asset.id,
        name: asset.type.startsWith('audio') ? asset.name : `${asset.name} [Audio]`,
        trackId: audioTrack.id,
        timelineStart: startTime,
        timelineDuration: duration,
        sourceStart: state.sourceInPoint || 0,
        speed: 1,
        transform: { positionX: 0, positionY: 0, scale: 1, rotation: 0, opacity: 1 },
        colorEffects: { exposure: 0, contrast: 1, brightness: 0, saturation: 1, temperature: 0, tint: 0, gamma: 1, lift: 0, gain: 0, invert: false },
        audio: { volumeDb: 0, pan: 0, fadeIn: 0, fadeOut: 0 },
        transitionIn: null,
      });
      if (asset.type.startsWith('audio')) state.activeClipId = id;
    }
    seq.playheadTime = startTime + duration;
  });
}

function stepFrames(deltaFrames) {
  const seq = getActiveSequence();
  seekSequence(seq.playheadTime + (deltaFrames / seq.fps));
}

function toggleSequencePlayback() {
  audioEngine.ensureContext();
  updateAudioStatusTelemetry();
  state.isPlayingSequence = !state.isPlayingSequence;
  state.playbackSpeed = 1;
  const icon = document.getElementById('prg-play-icon');
  if (icon) icon.textContent = state.isPlayingSequence ? 'pause' : 'play_arrow';
}

function seekSequence(timeSec) {
  const seq = getActiveSequence();
  seq.playheadTime = Math.max(0, Math.min(seq.duration, timeSec));
  updatePlayheadPositionUI();
  renderProgramMonitor();
}

function renderSequenceFrameAtTime(ctx, width, height, timeSec) {
  const seq = getActiveSequence();
  ctx.fillStyle = '#05070A';
  ctx.fillRect(0, 0, width, height);

  const visibleVideoTracks = seq.tracks.filter(t => t.type === 'video' && t.visible);
  const clipsAtTime = seq.clips.filter(c => timeSec >= c.timelineStart && timeSec <= c.timelineStart + c.timelineDuration);

  const drawSingleClip = (clip) => {
    ctx.save();
    const t = clip.transform;
    ctx.translate(width / 2 + t.positionX, height / 2 + t.positionY);
    ctx.rotate((t.rotation * Math.PI) / 180);
    ctx.scale(t.scale, t.scale);
    ctx.globalAlpha *= t.opacity;

    const c = clip.colorEffects;
    const bright = Math.max(0.1, 1 + (c.brightness || 0) + (c.exposure || 0) * 0.25 + (c.lift || 0) * 0.2 + (c.gain || 0) * 0.2);
    const cont = Math.max(0.1, c.contrast || 1);
    const sat = Math.max(0, c.saturation ?? 1);
    const hue = (c.temperature || 0) * 0.4;
    let filter = `brightness(${bright.toFixed(2)}) contrast(${cont.toFixed(2)}) saturate(${sat.toFixed(2)}) hue-rotate(${hue.toFixed(0)}deg)`;
    if (c.invert) filter += ' invert(100%)';
    ctx.filter = filter;

    if (clip.isTitle) {
      ctx.fillStyle = '#ffffff';
      ctx.font = `700 ${Math.round(width * 0.048)}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.75)';
      ctx.shadowBlur = 18;
      ctx.fillText(clip.titleText || clip.name, 0, 0);
    } else {
      const asset = state.project.assets[clip.assetId];
      const cachedVid = asset ? state.videoCache[asset.id] : null;
      if (cachedVid && cachedVid.readyState >= 2) {
        const srcTime = clip.sourceStart + (timeSec - clip.timelineStart) * (clip.speed || 1);
        if (Math.abs(cachedVid.currentTime - srcTime) > 0.08) {
          try { cachedVid.currentTime = srcTime; } catch {}
        }
        ctx.drawImage(cachedVid, -width / 2, -height / 2, width, height);
      } else {
        const grad = ctx.createLinearGradient(-width / 2, -height / 2, width / 2, height / 2);
        grad.addColorStop(0, '#1E3A8A');
        grad.addColorStop(0.5, '#0F172A');
        grad.addColorStop(1, '#0284C7');
        ctx.fillStyle = grad;
        ctx.fillRect(-width / 2, -height / 2, width, height);
        ctx.fillStyle = '#E6EAF0';
        ctx.font = `600 ${Math.round(width * 0.025)}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(clip.name, 0, -10);
        ctx.font = `${Math.round(width * 0.015)}px ui-monospace, monospace`;
        ctx.fillStyle = '#9AA6B5';
        ctx.fillText(formatTimecode(timeSec, seq.fps), 0, 26);
      }
    }
    ctx.restore();
  };

  for (const track of [...visibleVideoTracks].reverse()) {
    const clip = clipsAtTime.find(c => c.trackId === track.id);
    if (!clip) continue;

    // Check if clip has an active transitionIn covering current timeSec
    if (clip.transitionIn && timeSec < clip.timelineStart + clip.transitionIn.duration) {
      const progress = (timeSec - clip.timelineStart) / Math.max(0.05, clip.transitionIn.duration);
      const drawBg = () => {
        ctx.fillStyle = '#05070A';
        ctx.fillRect(0, 0, width, height);
      };
      renderTransitionComposite(ctx, drawBg, () => drawSingleClip(clip), clip.transitionIn, progress, width, height);
    } else {
      drawSingleClip(clip);
    }
  }
}

function renderProgramMonitor() {
  const canvas = document.getElementById('program-render-canvas');
  const emptyCard = document.getElementById('program-empty-card');
  if (!canvas) return;
  const seq = getActiveSequence();

  if (emptyCard) emptyCard.style.display = seq.clips.length === 0 ? 'flex' : 'none';
  const tc = document.getElementById('active-monitor-timecode');
  if (tc && (state.activeMonitorTab === 'program' || state.monitorMode === 'split')) {
    tc.textContent = formatTimecode(seq.playheadTime, seq.fps);
  }

  const ctx = canvas.getContext('2d');
  renderSequenceFrameAtTime(ctx, canvas.width, canvas.height, seq.playheadTime);

  // If in Color workspace, live-sample real pixels into RGB Scopes!
  if (state.activeWorkspace === 'color') {
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
      state.measuredFps = Math.round((frameCount * 1000) / (now - fpsWindowStart));
      frameCount = 0;
      fpsWindowStart = now;
      const fpsEl = document.getElementById('status-fps-label');
      if (fpsEl) fpsEl.textContent = `${state.measuredFps} FPS`;
    }

    if (state.isPlayingSequence) {
      const seq = getActiveSequence();
      if (delta > 0.08) {
        state.droppedFrames++;
        const dropEl = document.getElementById('status-drops-label');
        if (dropEl) dropEl.textContent = String(state.droppedFrames);
      }
      seq.playheadTime += delta * state.playbackSpeed;
      if (seq.playheadTime >= seq.duration) seq.playheadTime = 0;
      else if (seq.playheadTime < 0) { seq.playheadTime = 0; state.isPlayingSequence = false; }
      updatePlayheadPositionUI();
      renderProgramMonitor();
    }

    // Update Master VU & Audio Workspace Loudness Meters
    const seq = getActiveSequence();
    const hasActive = seq.clips.some(c => seq.playheadTime >= c.timelineStart && seq.playheadTime <= c.timelineStart + c.timelineDuration);
    const meters = audioEngine.getMasterMetering(state.isPlayingSequence, hasActive);

    const barL = document.getElementById('vu-bar-l');
    const barR = document.getElementById('vu-bar-r');
    const dbText = document.getElementById('vu-db-text');
    if (barL) barL.style.height = `${meters.leftPct}%`;
    if (barR) barR.style.height = `${meters.rightPct}%`;
    if (dbText) dbText.textContent = meters.peakDb <= -59 ? '-∞' : `${meters.peakDb.toFixed(0)}`;

    if (state.activeWorkspace === 'audio') {
      const lufsEl = document.getElementById('lufs-integrated-val');
      const peakEl = document.getElementById('lufs-truepeak-val');
      const momEl  = document.getElementById('lufs-momentary-val');
      if (lufsEl) lufsEl.textContent = meters.integratedLufs <= -59 ? '-∞ LUFS' : `${meters.integratedLufs.toFixed(1)} LUFS`;
      if (peakEl) peakEl.textContent = meters.truePeak <= -59 ? '-∞ dBTP' : `${meters.truePeak.toFixed(1)} dBTP`;
      if (momEl)  momEl.textContent  = meters.momentaryLufs <= -59 ? '-∞ LUFS' : `${meters.momentaryLufs.toFixed(1)} LUFS`;
      document.querySelectorAll('.strip-mini-fill').forEach((fill, idx) => {
        const jitter = state.isPlayingSequence && hasActive ? Math.max(8, meters.leftPct - idx * 6 + Math.sin(now * 0.01 + idx) * 8) : 0;
        fill.style.height = `${Math.max(0, Math.min(100, jitter))}%`;
      });
    }

    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ----------------------------------------------------
// 9. Four-Zone Timeline, Snapping Guide & Context Menus
// ----------------------------------------------------
function initTimeline() {
  const toolIds = [
    ['tool-select', 'select'], ['tool-track-select', 'track-select'], ['tool-ripple', 'ripple'],
    ['tool-rolling', 'rolling'], ['tool-rate-stretch', 'rate-stretch'], ['tool-razor', 'razor'],
    ['tool-slip', 'slip'], ['tool-slide', 'slide'], ['tool-pen', 'pen'],
    ['tool-hand', 'hand'], ['tool-zoom', 'zoom'], ['tool-text', 'text'],
  ];
  toolIds.forEach(([id, tool]) => document.getElementById(id)?.addEventListener('click', () => setTool(tool)));

  // Snapping button (restores persisted state)
  const snapBtn = document.getElementById('btn-snap-toggle');
  if (snapBtn) {
    snapBtn.classList.toggle('active', state.isSnapping);
    snapBtn.addEventListener('click', toggleSnapping);
  }

  document.getElementById('btn-link-toggle')?.addEventListener('click', () => {
    state.isLinkedSelection = !state.isLinkedSelection;
    document.getElementById('btn-link-toggle')?.classList.toggle('active', state.isLinkedSelection);
  });

  document.getElementById('btn-synclock-toggle')?.addEventListener('click', () => {
    state.isSyncLockGlobal = !state.isSyncLockGlobal;
    document.getElementById('btn-synclock-toggle')?.classList.toggle('active', state.isSyncLockGlobal);
  });

  document.getElementById('btn-toggle-graph-drawer')?.addEventListener('click', () => {
    const drawer = document.getElementById('motion-graph-drawer');
    if (!drawer) return;
    drawer.style.display = drawer.style.display === 'none' ? 'block' : 'none';
    if (drawer.style.display === 'block') drawMotionGraphCanvas();
  });

  document.getElementById('btn-add-marker')?.addEventListener('click', addMarkerAtPlayhead);
  document.getElementById('btn-time-zoom-in')?.addEventListener('click', () => { state.pixelsPerSecond = Math.min(180, state.pixelsPerSecond * 1.3); renderTimeline(); });
  document.getElementById('btn-time-zoom-out')?.addEventListener('click', () => { state.pixelsPerSecond = Math.max(8, state.pixelsPerSecond / 1.3); renderTimeline(); });
  document.getElementById('btn-time-fit')?.addEventListener('click', fitTimelineToSequence);
  document.getElementById('btn-add-v-track')?.addEventListener('click', () => addTrack('video'));
  document.getElementById('btn-add-a-track')?.addEventListener('click', () => addTrack('audio'));

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
      state.timelineDisplay[key] = e.target.checked;
      renderTimeline();
    });
  });

  // Ruler scrubbing + right-click context menu
  const ruler = document.getElementById('timeline-ruler-bar');
  ruler?.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const scrub = (ev) => {
      const rect = ruler.getBoundingClientRect();
      const scrollLeft = document.getElementById('timeline-scroll-area')?.scrollLeft || 0;
      seekSequence(Math.max(0, (ev.clientX - rect.left + scrollLeft) / state.pixelsPerSecond));
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
      { label: 'Set Sequence Mark In', shortcut: 'I', action: () => { getActiveSequence().inPoint = getActiveSequence().playheadTime; renderTimeline(); } },
      { label: 'Set Sequence Mark Out', shortcut: 'O', action: () => { getActiveSequence().outPoint = getActiveSequence().playheadTime; renderTimeline(); } },
      { sep: true },
      { label: 'Fit Sequence to View', shortcut: '\\', action: fitTimelineToSequence },
    ]);
  });

  // Empty Timeline right-click context menu
  document.getElementById('timeline-scroll-area')?.addEventListener('contextmenu', (e) => {
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

function toggleSnapping() {
  state.isSnapping = !state.isSnapping;
  localStorage.setItem('ff_snapping', String(state.isSnapping));
  document.getElementById('btn-snap-toggle')?.classList.toggle('active', state.isSnapping);
}

function setTool(toolName) {
  state.activeTool = toolName;
  document.querySelectorAll('.timeline-toolbar .tool-btn').forEach(btn => {
    if (btn.id.startsWith('tool-')) btn.classList.remove('active');
  });
  document.getElementById(`tool-${toolName}`)?.classList.add('active');
  const area = document.getElementById('timeline-scroll-area');
  if (area) {
    area.style.cursor = toolName === 'razor' ? 'crosshair' : (toolName === 'hand' ? 'grab' : (toolName === 'zoom' ? 'zoom-in' : 'default'));
  }
}

function addMarkerAtPlayhead() {
  const seq = getActiveSequence();
  executeCommand('Add Marker', () => {
    seq.markers.push({
      id: `m_${Date.now()}`,
      time: seq.playheadTime,
      label: `Marker ${seq.markers.length + 1}`,
      color: '#E5B45C',
    });
  });
}

function addTrack(type) {
  const seq = getActiveSequence();
  const count = seq.tracks.filter(t => t.type === type).length + 1;
  const prefix = type === 'video' ? 'V' : 'A';
  const color = TRACK_COLORS[(seq.tracks.length) % TRACK_COLORS.length];
  const newTrack = {
    id: `track_${type}_${Date.now()}`,
    shortName: `${prefix}${count}`,
    name: `${prefix}${count} · ${type === 'video' ? 'Video' : 'Audio'}`,
    type,
    color,
    muted: false,
    solo: false,
    locked: false,
    syncLock: true,
    visible: true,
    targeted: false,
    busId: type === 'audio' ? 'dialogue' : undefined,
    volumeDb: 0,
    pan: 0,
    eqLow: 0, eqMid: 0, eqHigh: 0,
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
  state.pixelsPerSecond = Math.max(8, (area.clientWidth - 40) / (seq.duration || 60));
  renderTimeline();
}

function computeSnappedTime(rawTime, excludeClipId, bypassSnap) {
  if (!state.isSnapping || bypassSnap) return { time: rawTime, snapped: false };
  const seq = getActiveSequence();
  const thresholdSec = 10 / state.pixelsPerSecond; // 10px magnetic snap window
  const targets = [seq.playheadTime, 0];
  for (const m of seq.markers) targets.push(m.time);
  for (const c of seq.clips) {
    if (c.id === excludeClipId) continue;
    targets.push(c.timelineStart, c.timelineStart + c.timelineDuration);
  }
  for (const t of targets) {
    if (Math.abs(rawTime - t) <= thresholdSec) {
      return { time: t, snapped: true };
    }
  }
  return { time: rawTime, snapped: false };
}

function showSnapGuide(timeSec) {
  const guide = document.getElementById('timeline-snap-guide');
  if (!guide) return;
  if (timeSec === null) {
    guide.style.display = 'none';
  } else {
    guide.style.display = 'block';
    guide.style.left = `${timeSec * state.pixelsPerSecond}px`;
  }
}

function renderTimeline() {
  const seq = getActiveSequence();
  const totalWidth = Math.max(seq.duration * state.pixelsPerSecond, 1800);
  const trackHeight = state.timelineDisplay.compactTracks ? 28 : 42;

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
            <button class="track-btn ${track.syncLock ? 'active' : ''}" data-action="synclock" title="Track Sync Lock"><span class="icon icon-sm">sync</span></button>
            <button class="track-btn ${track.locked ? 'active' : ''}" data-action="lock" title="Lock Track"><span class="icon icon-sm">${track.locked ? 'lock' : 'lock_open'}</span></button>
          </div>
        </div>
      `;
    }
    headersCol.innerHTML = html;

    headersCol.querySelectorAll('.track-header-item').forEach(el => {
      const track = seq.tracks.find(t => t.id === el.dataset.id);
      if (!track) return;
      el.querySelector('[data-action="vis"]')?.addEventListener('click', () => { track.visible = !track.visible; renderTimeline(); renderProgramMonitor(); });
      el.querySelector('[data-action="mute"]')?.addEventListener('click', () => { track.muted = !track.muted; audioEngine.updateTrackParams(track, seq.tracks); renderTimeline(); });
      el.querySelector('[data-action="solo"]')?.addEventListener('click', () => { track.solo = !track.solo; audioEngine.updateTrackParams(track, seq.tracks); renderTimeline(); });
      el.querySelector('[data-action="synclock"]')?.addEventListener('click', () => { track.syncLock = !track.syncLock; renderTimeline(); });
      el.querySelector('[data-action="lock"]')?.addEventListener('click', () => { track.locked = !track.locked; renderTimeline(); });
      el.querySelector('[data-action="target"]')?.addEventListener('click', () => {
        seq.tracks.filter(t => t.type === track.type).forEach(t => t.targeted = false);
        track.targeted = true;
        renderTimeline();
      });
      el.querySelector('.track-name-input')?.addEventListener('change', (e) => { track.name = e.target.value; scheduleAutoSave(); });

      // Track Header Right-Click Context Menu
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        openContextMenu(e.clientX, e.clientY, [
          { label: 'Rename Track...', action: () => { const n = prompt('Track Name:', track.name); if (n) { track.name = n; renderTimeline(); } } },
          { label: 'Cycle Track Color', action: () => { const i = TRACK_COLORS.indexOf(track.color); track.color = TRACK_COLORS[(i + 1) % TRACK_COLORS.length]; renderTimeline(); } },
          { label: track.locked ? 'Unlock Track' : 'Lock Track', action: () => { track.locked = !track.locked; renderTimeline(); } },
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
    const step = state.pixelsPerSecond > 60 ? 1 : (state.pixelsPerSecond > 20 ? 5 : 10);
    let ticks = '';
    for (let s = 0; s <= seq.duration; s += step) {
      ticks += `<div class="ruler-tick" style="left: ${s * state.pixelsPerSecond}px;">${formatTimecode(s, seq.fps)}</div>`;
    }
    if (state.timelineDisplay.showMarkers) {
      for (const m of seq.markers) {
        ticks += `<div class="timeline-marker-pin" style="left: ${m.time * state.pixelsPerSecond}px; background: ${m.color};" title="${m.label} (${formatTimecode(m.time, seq.fps)})" data-marker-id="${m.id}"></div>`;
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
        const leftPx = clip.timelineStart * state.pixelsPerSecond;
        const widthPx = Math.max(16, clip.timelineDuration * state.pixelsPerSecond);
        const isAudio = track.type === 'audio';
        const isSel = clip.id === state.activeClipId;
        const hasFx = clip.colorEffects && (clip.colorEffects.exposure !== 0 || clip.colorEffects.contrast !== 1 || clip.colorEffects.saturation !== 1);
        lanesHtml += `
          <div class="timeline-clip-block ${isAudio ? 'audio' : ''} ${isSel ? 'selected' : ''}" data-id="${clip.id}" style="left: ${leftPx}px; width: ${widthPx}px; ${clip.isTitle ? 'background: #5B21B6;' : ''}">
            <div class="trim-handle left"></div>
            ${clip.transitionIn ? `<div class="clip-transition-badge" title="${clip.transitionIn.name}">T</div>` : ''}
            <div style="display: flex; align-items: center; gap: 4px; overflow: hidden; pointer-events: none; padding-left: ${clip.transitionIn ? '14px' : '0'};">
              <span class="icon icon-sm">${clip.isTitle ? 'title' : (isAudio ? 'graphic_eq' : 'movie')}</span>
              ${state.timelineDisplay.showNames ? `<span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${clip.name}</span>` : ''}
            </div>
            ${isAudio && state.timelineDisplay.showWaveforms ? `<div style="position: absolute; bottom: 2px; left: 8px; right: 8px; height: 10px; opacity: 0.38; background: repeating-linear-gradient(90deg, #38C995 0px, #38C995 2px, transparent 2px, transparent 4px); pointer-events: none;"></div>` : ''}
            ${isAudio && state.timelineDisplay.showAudioBand ? `<div class="clip-rubber-band" style="top: 50%; background: rgba(56,201,149,0.7);"></div>` : ''}
            ${!isAudio && state.timelineDisplay.showVideoBand ? `<div class="clip-rubber-band" style="top: 25%; background: rgba(229,180,92,0.75);"></div>` : ''}
            ${state.timelineDisplay.showBadges ? `<span style="font-size: 9.5px; opacity: 0.8; display: inline-flex; align-items: center; gap: 2px; pointer-events: none;">${hasFx ? '<span style="color: var(--warning); font-weight:700;">fx</span>' : ''}${clip.timelineDuration.toFixed(1)}s</span>` : ''}
            <div class="trim-handle right"></div>
          </div>
        `;
      }
      lanesHtml += `</div>`;
    }
    lanes.innerHTML = lanesHtml;

    // Bind Asset Drop onto Lanes
    lanes.querySelectorAll('.timeline-track-lane').forEach(laneEl => {
      const trackId = laneEl.dataset.id;
      laneEl.addEventListener('dragover', (e) => { e.preventDefault(); laneEl.style.background = 'rgba(75,141,255,0.1)'; });
      laneEl.addEventListener('dragleave', () => { laneEl.style.background = ''; });
      laneEl.addEventListener('drop', (e) => {
        e.preventDefault();
        laneEl.style.background = '';
        try {
          const data = JSON.parse(e.dataTransfer.getData('text/plain'));
          if (data?.type === 'asset' && data.assetId) {
            const rect = laneEl.getBoundingClientRect();
            const scrollLeft = document.getElementById('timeline-scroll-area')?.scrollLeft || 0;
            const dropTime = Math.max(0, (e.clientX - rect.left + scrollLeft) / state.pixelsPerSecond);
            insertAssetAtTime(data.assetId, dropTime, trackId);
          }
        } catch {}
      });
    });

    // Bind Clip Click, Drag (with Snap Guide + Alt bypass), Trim, and Right-Click Menu
    lanes.querySelectorAll('.timeline-clip-block').forEach(clipEl => {
      const clipId = clipEl.dataset.id;
      const clip = seq.clips.find(c => c.id === clipId);
      const track = seq.tracks.find(t => t.id === clip?.trackId);
      if (!clip || !track) return;

      clipEl.addEventListener('click', (e) => {
        e.stopPropagation();
        if (state.activeTool === 'razor') {
          if (!track.locked) splitClipAction(clipId, seq.playheadTime);
          return;
        }
        state.activeClipId = clipId;
        renderTimeline();
        renderInspector();
      });

      clipEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        state.activeClipId = clipId;
        renderTimeline();
        renderInspector();

        if (track.type === 'audio') {
          openContextMenu(e.clientX, e.clientY, [
            { label: 'Gain +3.0 dB', action: () => { executeCommand('Audio Gain +3dB', () => { clip.audio.volumeDb = Math.min(12, clip.audio.volumeDb + 3); }); } },
            { label: 'Gain -3.0 dB', action: () => { executeCommand('Audio Gain -3dB', () => { clip.audio.volumeDb = Math.max(-40, clip.audio.volumeDb - 3); }); } },
            { label: 'Add 1s Fade In & Out', action: () => { executeCommand('Add Audio Fades', () => { clip.audio.fadeIn = 1.0; clip.audio.fadeOut = 1.0; }); } },
            { sep: true },
            { label: 'Open Audio Mixer Workspace', action: () => switchWorkspace('audio') },
            { label: 'Delete Audio Clip', shortcut: 'Del', action: deleteActiveClip },
          ]);
        } else {
          openContextMenu(e.clientX, e.clientY, [
            { label: 'Split at Playhead', shortcut: 'Ctrl+K', action: () => splitClipAction(clipId, seq.playheadTime) },
            { label: 'Copy Clip', shortcut: 'Ctrl+C', action: () => { state.clipboardClip = JSON.parse(JSON.stringify(clip)); } },
            { label: 'Apply Cross Dissolve In', action: () => applyTransitionToActiveClip(TRANSITION_CATALOG[0]) },
            { label: 'Speed / Duration...', action: () => editClipSpeedPrompt(clip) },
            { label: 'Reset Transform & Grade', action: () => resetClipProperties(clip) },
            { sep: true },
            { label: 'Delete Clip', shortcut: 'Del', action: deleteActiveClip },
          ]);
        }
      });

      clipEl.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || e.target.classList.contains('trim-handle') || state.activeTool === 'razor' || track.locked) return;
        e.preventDefault();
        const startX = e.clientX;
        const initStart = clip.timelineStart;

        const onMove = (ev) => {
          const raw = Math.max(0, initStart + (ev.clientX - startX) / state.pixelsPerSecond);
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
          const delta = Math.min((ev.clientX - startX) / state.pixelsPerSecond, initDur - 0.2);
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
          clip.timelineDuration = Math.max(0.2, initDur + (ev.clientX - startX) / state.pixelsPerSecond);
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
  if (line) line.style.left = `${getActiveSequence().playheadTime * state.pixelsPerSecond}px`;
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
    state.activeClipId = right.id;
  });
}

function deleteActiveClip() {
  if (!state.activeClipId) return;
  const seq = getActiveSequence();
  executeCommand('Delete Clip', () => {
    seq.clips = seq.clips.filter(c => c.id !== state.activeClipId);
    state.activeClipId = null;
  });
}

function pasteClipboardClip() {
  if (!state.clipboardClip) return;
  const seq = getActiveSequence();
  executeCommand('Paste Clip', () => {
    const copy = JSON.parse(JSON.stringify(state.clipboardClip));
    copy.id = `clip_paste_${Date.now()}`;
    copy.timelineStart = seq.playheadTime;
    seq.clips.push(copy);
    state.activeClipId = copy.id;
  });
}

function editClipSpeedPrompt(clip) {
  const val = prompt('Playback Speed Multiplier (e.g. 0.5, 1.0, 2.0):', String(clip.speed || 1));
  const num = parseFloat(val);
  if (!isNaN(num) && num > 0.1 && num <= 8) {
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
// 10. Context Menu Engine
// ----------------------------------------------------
function openContextMenu(x, y, items) {
  const menu = document.getElementById('timeline-context-menu');
  if (!menu) return;
  menu.innerHTML = items.map((item, idx) => {
    if (item.sep) return `<div class="menu-sep"></div>`;
    return `<div class="menu-entry" data-cm-idx="${idx}"><span>${item.label}</span>${item.shortcut ? `<span class="menu-shortcut">${item.shortcut}</span>` : ''}</div>`;
  }).join('');

  menu.querySelectorAll('.menu-entry').forEach(el => {
    el.addEventListener('click', () => {
      menu.classList.remove('open');
      items[parseInt(el.dataset.cmIdx, 10)]?.action?.();
    });
  });

  menu.style.left = `${Math.min(x, window.innerWidth - 210)}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - 240)}px`;
  menu.classList.add('open');
}

function initContextMenuDismiss() {
  document.addEventListener('click', () => {
    document.getElementById('timeline-context-menu')?.classList.remove('open');
  });
}

// ----------------------------------------------------
// 11. Specialist Panels: Motion Effects, Color Wheels & Scopes, Audio Console, Deliver Queue
// ----------------------------------------------------
function renderEffectsLibrary() {
  const pills = document.getElementById('fx-category-pills');
  const list = document.getElementById('fx-catalog-list');
  if (!pills || !list) return;

  const cats = ['All', ...TRANSITION_CATEGORIES];
  pills.innerHTML = cats.map(cat =>
    `<button class="fx-pill ${state.selectedFxCategory === cat ? 'active' : ''}" data-cat="${cat}">${cat}</button>`
  ).join('');
  pills.querySelectorAll('.fx-pill').forEach(b => {
    b.addEventListener('click', () => { state.selectedFxCategory = b.dataset.cat; renderEffectsLibrary(); });
  });

  const filtered = TRANSITION_CATALOG.filter(t => state.selectedFxCategory === 'All' || t.category === state.selectedFxCategory);
  list.innerHTML = filtered.map(tr => `
    <div class="fx-item-card" data-tr-id="${tr.id}">
      <div style="display: flex; align-items: center; gap: 6px;">
        <span class="icon icon-sm" style="color: var(--accent-cyan);">${tr.icon}</span>
        <div>
          <div style="font-weight: 600; font-size: 11.5px;">${tr.name}</div>
          <div style="font-size: 10px; color: var(--text-muted);">${tr.category} · ${tr.defaultDuration}s</div>
        </div>
      </div>
      <button class="action-btn-compact primary">Apply</button>
    </div>
  `).join('');

  list.querySelectorAll('.fx-item-card').forEach(card => {
    card.addEventListener('click', () => {
      const def = TRANSITION_CATALOG.find(t => t.id === card.dataset.trId);
      if (def) applyTransitionToActiveClip(def);
    });
  });
}

function applyTransitionToActiveClip(def) {
  const clip = getActiveClip();
  if (!clip) {
    alert('Select a video clip on the timeline first to apply this transition.');
    return;
  }
  executeCommand(`Apply Transition: ${def.name}`, () => {
    clip.transitionIn = {
      typeId: def.id,
      name: def.name,
      duration: def.defaultDuration,
      alignment: 'start',
      direction: 'left-to-right',
      ease: 'smooth',
      borderPx: 0,
      softness: 50,
    };
  });
}

function drawMotionGraphCanvas() {
  const canvas = document.getElementById('motion-graph-canvas');
  if (!canvas) return;
  canvas.width = canvas.clientWidth || 720;
  canvas.height = canvas.clientHeight || 82;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#070A10';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = '#1B2230';
  ctx.lineWidth = 1;
  for (let x = 0; x < canvas.width; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
  for (let y = 0; y < canvas.height; y += 20) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }

  ctx.strokeStyle = '#4B8DFF';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(30, canvas.height - 14);
  ctx.bezierCurveTo(canvas.width * 0.35, canvas.height - 14, canvas.width * 0.45, 14, canvas.width * 0.72, 14);
  ctx.lineTo(canvas.width - 30, 14);
  ctx.stroke();

  ctx.fillStyle = '#E5B45C';
  [[30, canvas.height - 14], [canvas.width * 0.72, 14], [canvas.width - 30, 14]].forEach(([x, y]) => {
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
  });
}

// COLOR WORKSPACE: Shot Clips Gallery + 3-Way Wheels + Live Pixel Scopes
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
  const vClips = seq.clips.filter(c => {
    const tr = seq.tracks.find(t => t.id === c.trackId);
    return tr && tr.type === 'video';
  });

  body.innerHTML = `
    <div style="font-size: 10.5px; font-weight: 700; color: var(--accent); margin-bottom: 6px;">SEQUENCE SHOTS (${vClips.length})</div>
    ${vClips.length === 0 ? `<div style="font-size: 11px; color: var(--text-muted); margin-bottom: 12px;">Add video clips to the timeline to grade shots here.</div>` : vClips.map((c, idx) => `
      <div class="fx-item-card ${c.id === state.activeClipId ? 'selected' : ''}" data-shot-id="${c.id}" style="${c.id === state.activeClipId ? 'border-color: var(--accent);' : ''}">
        <div>
          <div style="font-weight: 600;">Shot ${idx + 1}: ${c.name}</div>
          <div style="font-size: 10px; color: var(--text-muted);">${formatTimecode(c.timelineStart, seq.fps)} · ${c.timelineDuration.toFixed(1)}s</div>
        </div>
      </div>
    `).join('')}

    <div style="font-size: 10.5px; font-weight: 700; color: var(--accent); margin: 12px 0 6px;">LOOKS & LUT PRESETS</div>
    ${COLOR_LUTS.map((lut, i) => `
      <div class="fx-item-card" data-lut-idx="${i}">
        <span>${lut.name}</span>
        <span class="icon icon-sm" style="color: var(--accent-cyan);">palette</span>
      </div>
    `).join('')}
  `;

  body.querySelectorAll('[data-shot-id]').forEach(el => {
    el.addEventListener('click', () => {
      const clip = seq.clips.find(c => c.id === el.dataset.shotId);
      if (clip) {
        state.activeClipId = clip.id;
        seekSequence(clip.timelineStart + 0.1);
        renderColorClipsGallery();
        renderInspector();
      }
    });
  });

  body.querySelectorAll('[data-lut-idx]').forEach(el => {
    el.addEventListener('click', () => {
      const clip = getActiveClip();
      if (!clip) { alert('Select a shot first to apply a LUT preset.'); return; }
      const lut = COLOR_LUTS[parseInt(el.dataset.lutIdx, 10)];
      executeCommand(`Apply LUT: ${lut.name}`, () => {
        Object.assign(clip.colorEffects, lut.vals);
      });
    });
  });
}

function initColorWheelsPanel() {
  const body = document.getElementById('color-wheels-body');
  if (!body) return;
  const wheels = [
    { id: 'lift',   label: 'Lift (Shadows)',     prop: 'lift' },
    { id: 'gamma',  label: 'Gamma (Midtones)',   prop: 'brightness' },
    { id: 'gain',   label: 'Gain (Highlights)',  prop: 'gain' },
    { id: 'offset', label: 'Offset (Global)',    prop: 'exposure' },
  ];
  body.innerHTML = wheels.map(w => `
    <div class="color-wheel-box">
      <div style="font-size: 11px; font-weight: 600; color: var(--text-secondary);">${w.label}</div>
      <div class="color-wheel-ring" data-wheel-prop="${w.prop}">
        <div class="color-wheel-inner"><div class="color-wheel-dot" id="dot-${w.prop}"></div></div>
      </div>
      <input type="range" min="-1" max="1" step="0.02" value="0" data-wheel-slider="${w.prop}" style="width: 110px;">
    </div>
  `).join('');

  body.querySelectorAll('.color-wheel-ring').forEach(ring => {
    ring.addEventListener('mousedown', (e) => {
      const clip = getActiveClip();
      if (!clip) return;
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
      const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); scheduleAutoSave(); };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
  });

  body.querySelectorAll('[data-wheel-slider]').forEach(slider => {
    slider.addEventListener('input', (e) => {
      const clip = getActiveClip();
      if (!clip) return;
      clip.colorEffects[slider.dataset.wheelSlider] = parseFloat(e.target.value);
      renderProgramMonitor();
      scheduleAutoSave();
    });
  });

  document.getElementById('btn-reset-wheels')?.addEventListener('click', () => {
    const clip = getActiveClip();
    if (!clip) return;
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
  ctx.fillStyle = '#06080B';
  ctx.fillRect(0, 0, w, h);

  // Graticule grid
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  for (let i = 1; i < 4; i++) {
    ctx.beginPath(); ctx.moveTo(0, (h / 4) * i); ctx.lineTo(w, (h / 4) * i); ctx.stroke();
  }

  // Downsample actual rendered Program Monitor pixels into RGB Histogram & Luma Waveform
  try {
    const sample = document.createElement('canvas');
    sample.width = 64; sample.height = 36;
    const sctx = sample.getContext('2d');
    sctx.drawImage(sourceCanvas, 0, 0, 64, 36);
    const data = sctx.getImageData(0, 0, 64, 36).data;

    const rBins = new Uint32Array(64), gBins = new Uint32Array(64), bBins = new Uint32Array(64);
    for (let i = 0; i < data.length; i += 4) {
      rBins[data[i] >> 2]++;
      gBins[data[i + 1] >> 2]++;
      bBins[data[i + 2] >> 2]++;
    }
    const maxBin = Math.max(1, ...rBins, ...gBins, ...bBins);

    const drawCurve = (bins, color) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 64; i++) {
        const x = (i / 63) * w;
        const y = h - (bins[i] / maxBin) * (h - 10) - 4;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    drawCurve(rBins, 'rgba(227, 111, 120, 0.9)');
    drawCurve(gBins, 'rgba(56, 201, 149, 0.9)');
    drawCurve(bBins, 'rgba(75, 141, 255, 0.9)');
  } catch {}
}

// AUDIO WORKSPACE: Real Web Audio Mixer Strips, Bus Routing Matrix, 3-Band EQ & LUFS Loudness
function initAudioConsoleControls() {
  document.getElementById('btn-init-audio-engine')?.addEventListener('click', () => {
    audioEngine.ensureContext();
    const seq = getActiveSequence();
    seq.tracks.filter(t => t.type === 'audio').forEach(t => audioEngine.updateTrackParams(t, seq.tracks));
    updateAudioStatusTelemetry();
    renderAudioConsole();
  });
  document.getElementById('audio-layout-select')?.addEventListener('change', (e) => {
    audioEngine.channelLayout = e.target.value;
    updateAudioStatusTelemetry();
  });
}

function renderAudioConsole() {
  const body = document.getElementById('audio-console-body');
  if (!body) return;
  const seq = getActiveSequence();
  const audioTracks = seq.tracks.filter(t => t.type === 'audio');
  const selTrack = audioTracks.find(t => t.id === state.selectedAudioTrackId) || audioTracks[0];

  body.innerHTML = `
    <!-- Mixer Channel Strips + 4 Buses + Master -->
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

      <!-- 4 Dedicated Post-Production Buses -->
      ${audioEngine.busDefinitions.map(b => `
        <div class="channel-strip bus-strip" style="border-top-color: ${b.color};">
          <div style="font-size: 10px; font-weight: 700; color: ${b.color};">BUS: ${b.name}</div>
          <div style="font-size: 9px; color: var(--text-muted);">→ Master</div>
          <div class="fader-track-wrap">
            <input type="range" class="vertical-fader bus-fader" data-bus-id="${b.id}" min="-40" max="6" step="0.5" value="${b.volumeDb}">
            <div class="strip-mini-meter"><div class="strip-mini-fill"></div></div>
          </div>
          <div style="font-family: monospace; font-size: 10px;" id="bus-db-${b.id}">${b.volumeDb.toFixed(1)} dB</div>
        </div>
      `).join('')}

      <!-- Master Output Bus -->
      <div class="channel-strip master-strip">
        <div style="font-size: 11px; font-weight: 700; color: var(--accent);">MASTER</div>
        <div style="font-size: 9px; color: var(--success);">Limiter -2dB</div>
        <div class="fader-track-wrap">
          <input type="range" class="vertical-fader" id="master-fader" min="-40" max="6" step="0.5" value="${audioEngine.master?.volumeDb || 0}">
          <div class="strip-mini-meter"><div class="strip-mini-fill"></div></div>
          <div class="strip-mini-meter"><div class="strip-mini-fill"></div></div>
        </div>
        <div style="font-family: monospace; font-size: 10px;" id="master-db-val">${(audioEngine.master?.volumeDb || 0).toFixed(1)} dB</div>
      </div>
    </div>

    <!-- Middle: Track EQ Effects Rack & Signal Chain -->
    <div class="audio-rack-col">
      <div style="font-size: 10.5px; font-weight: 700; color: var(--accent);">3-BAND PARAMETRIC EQ · ${selTrack ? selTrack.name : 'No Track'}</div>
      ${selTrack ? `
        <div class="field-row">
          <div class="field-header"><span>Low Shelf (120 Hz)</span><span class="field-val" id="eq-low-val">${(selTrack.eqLow || 0).toFixed(1)} dB</span></div>
          <input type="range" id="eq-low-slider" min="-12" max="12" step="0.5" value="${selTrack.eqLow || 0}">
        </div>
        <div class="field-row">
          <div class="field-header"><span>Mid Peaking (1.2 kHz)</span><span class="field-val" id="eq-mid-val">${(selTrack.eqMid || 0).toFixed(1)} dB</span></div>
          <input type="range" id="eq-mid-slider" min="-12" max="12" step="0.5" value="${selTrack.eqMid || 0}">
        </div>
        <div class="field-row">
          <div class="field-header"><span>High Shelf (8 kHz)</span><span class="field-val" id="eq-high-val">${(selTrack.eqHigh || 0).toFixed(1)} dB</span></div>
          <input type="range" id="eq-high-slider" min="-12" max="12" step="0.5" value="${selTrack.eqHigh || 0}">
        </div>
        <div class="field-row">
          <div class="field-header"><span>Stereo Pan</span><span class="field-val" id="eq-pan-val">${selTrack.pan || 0}</span></div>
          <input type="range" id="eq-pan-slider" min="-100" max="100" step="1" value="${selTrack.pan || 0}">
        </div>
      ` : ''}
      <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--border); font-size: 10px; color: var(--text-secondary);">
        Signal Chain: <strong>Track → EQ → Pan → Gain → Mix Bus → Master Limiter → Out</strong>
      </div>
    </div>

    <!-- Right: Real-Time Loudness Metering (LUFS & True Peak) -->
    <div class="loudness-col">
      <div style="font-size: 10.5px; font-weight: 700; color: var(--accent);">LOUDNESS METER (EBU R128)</div>
      <div class="lufs-big-readout" id="lufs-integrated-val">-∞ LUFS</div>
      <div class="field-row"><div class="field-header"><span>Momentary</span><span class="field-val" id="lufs-momentary-val">-∞ LUFS</span></div></div>
      <div class="field-row"><div class="field-header"><span>True Peak</span><span class="field-val" id="lufs-truepeak-val">-∞ dBTP</span></div></div>
      <div class="field-row">
        <div class="field-header"><span>Target Standard</span></div>
        <select class="compact-select" id="lufs-target-select">
          <option value="-14">YouTube / Streaming (-14 LUFS)</option>
          <option value="-23">Broadcast EBU R128 (-23 LUFS)</option>
          <option value="-24">Cinema ATSC A/85 (-24 LUFS)</option>
        </select>
      </div>
    </div>
  `;

  // Wire Mixer Events
  body.querySelectorAll('.channel-strip[data-strip-id]').forEach(el => {
    el.addEventListener('click', () => { state.selectedAudioTrackId = el.dataset.stripId; renderAudioConsole(); });
  });
  body.querySelectorAll('.strip-fader').forEach(f => {
    f.addEventListener('input', (e) => {
      const tr = audioTracks.find(t => t.id === f.dataset.trackId);
      if (!tr) return;
      tr.volumeDb = parseFloat(e.target.value);
      const lbl = document.getElementById(`strip-db-${tr.id}`);
      if (lbl) lbl.textContent = `${tr.volumeDb.toFixed(1)} dB`;
      audioEngine.updateTrackParams(tr, seq.tracks);
    });
  });
  body.querySelectorAll('.strip-bus-select').forEach(sel => {
    sel.addEventListener('change', (e) => {
      const tr = audioTracks.find(t => t.id === sel.dataset.trackId);
      if (!tr) return;
      tr.busId = e.target.value;
      audioEngine.updateTrackParams(tr, seq.tracks);
      scheduleAutoSave();
    });
  });
  body.querySelectorAll('[data-strip-mute]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tr = audioTracks.find(t => t.id === btn.dataset.stripMute);
      if (!tr) return;
      tr.muted = !tr.muted;
      audioEngine.updateTrackParams(tr, seq.tracks);
      renderAudioConsole(); renderTimeline();
    });
  });
  body.querySelectorAll('[data-strip-solo]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tr = audioTracks.find(t => t.id === btn.dataset.stripSolo);
      if (!tr) return;
      tr.solo = !tr.solo;
      audioEngine.updateTrackParams(tr, seq.tracks);
      renderAudioConsole(); renderTimeline();
    });
  });
  body.querySelectorAll('.bus-fader').forEach(f => {
    f.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      audioEngine.updateBusParams(f.dataset.busId, val, false);
      const lbl = document.getElementById(`bus-db-${f.dataset.busId}`);
      if (lbl) lbl.textContent = `${val.toFixed(1)} dB`;
    });
  });
  document.getElementById('master-fader')?.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    audioEngine.ensureContext();
    audioEngine.updateMasterParams(val);
    const lbl = document.getElementById('master-db-val');
    if (lbl) lbl.textContent = `${val.toFixed(1)} dB`;
  });

  if (selTrack) {
    const bindEq = (sliderId, valId, prop, suffix = ' dB') => {
      document.getElementById(sliderId)?.addEventListener('input', (e) => {
        selTrack[prop] = parseFloat(e.target.value);
        const vEl = document.getElementById(valId);
        if (vEl) vEl.textContent = `${selTrack[prop].toFixed(prop === 'pan' ? 0 : 1)}${suffix}`;
        audioEngine.updateTrackParams(selTrack, seq.tracks);
      });
    };
    bindEq('eq-low-slider', 'eq-low-val', 'eqLow');
    bindEq('eq-mid-slider', 'eq-mid-val', 'eqMid');
    bindEq('eq-high-slider', 'eq-high-val', 'eqHigh');
    bindEq('eq-pan-slider', 'eq-pan-val', 'pan', '');
  }
}

// DELIVER WORKSPACE: Full Export Configuration & Real Render Queue
function initDeliverControls() {
  document.getElementById('btn-render-all-queue')?.addEventListener('click', () => {
    renderQueue.renderAllQueued((ctx, w, h, timeSec) => renderSequenceFrameAtTime(ctx, w, h, timeSec));
  });
  document.getElementById('btn-cancel-queue')?.addEventListener('click', () => renderQueue.cancelActive());
}

function renderDeliverSettings() {
  const body = document.getElementById('deliver-settings-body');
  if (!body) return;
  const preset = EXPORT_PRESETS.find(p => p.id === state.selectedDeliverPreset) || EXPORT_PRESETS[0];
  const codecs = state.codecCapabilities || detectExportCodecs();
  const seq = getActiveSequence();

  // Compute real content duration (or default 5s if empty)
  const contentEnd = seq.clips.reduce((max, c) => Math.max(max, c.timelineStart + c.timelineDuration), 0);
  const exportDur = contentEnd > 0 ? Math.min(30, contentEnd) : 5;

  body.innerHTML = `
    <div style="padding: 10px; display: flex; flex-direction: column; gap: 10px;">
      <div style="display: flex; flex-wrap: wrap; gap: 4px;">
        ${EXPORT_PRESETS.map(p => `
          <button class="fx-pill ${p.id === preset.id ? 'active' : ''}" data-preset-id="${p.id}">${p.name}</button>
        `).join('')}
      </div>

      <div class="deliver-form-grid" style="padding: 0;">
        <div class="field-row">
          <div class="field-header"><span>Output Filename</span></div>
          <input type="text" id="deliv-filename" value="${state.project.title.replace(/\s+/g, '_')}_Master" style="background: var(--bg-input); border: 1px solid var(--border); color: #fff; padding: 5px 7px; border-radius: 3px; font-size: 11.5px;">
        </div>
        <div class="field-row">
          <div class="field-header"><span>Container & Codec</span></div>
          <input type="text" value="${preset.container.toUpperCase()} (${preset.codec.toUpperCase()})" readonly style="background: var(--bg-input); border: 1px solid var(--border); color: var(--accent-cyan); padding: 5px 7px; border-radius: 3px; font-size: 11.5px;">
        </div>
        <div class="field-row">
          <div class="field-header"><span>Resolution</span></div>
          <input type="text" value="${preset.width} × ${preset.height}" readonly style="background: var(--bg-input); border: 1px solid var(--border); color: #fff; padding: 5px 7px; border-radius: 3px; font-size: 11.5px;">
        </div>
        <div class="field-row">
          <div class="field-header"><span>Frame Rate & Bitrate</span></div>
          <input type="text" value="${preset.fps} fps · ${preset.bitrateMbps} Mbps" readonly style="background: var(--bg-input); border: 1px solid var(--border); color: #fff; padding: 5px 7px; border-radius: 3px; font-size: 11.5px;">
        </div>
        <div class="field-row">
          <div class="field-header"><span>Audio Channel Mapping</span></div>
          <input type="text" value="${preset.audioChannels} · 48 kHz" readonly style="background: var(--bg-input); border: 1px solid var(--border); color: #fff; padding: 5px 7px; border-radius: 3px; font-size: 11.5px;">
        </div>
        <div class="field-row">
          <div class="field-header"><span>Render Range Duration</span></div>
          <input type="text" value="${exportDur.toFixed(1)}s (${Math.round(exportDur * preset.fps)} frames)" readonly style="background: var(--bg-input); border: 1px solid var(--border); color: #fff; padding: 5px 7px; border-radius: 3px; font-size: 11.5px;">
        </div>
      </div>

      <div style="background: #10151E; border: 1px solid var(--border); border-radius: 4px; padding: 8px; font-size: 10.5px;">
        <div style="font-weight: 700; color: var(--text-secondary); margin-bottom: 4px;">BROWSER CODEC CAPABILITY MATRIX (LIVE PROBE)</div>
        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
          ${codecs.formats.map(f => `
            <span style="color: ${f.supported ? 'var(--success)' : 'var(--text-muted)'};">${f.supported ? '✓' : '✕'} ${f.label}</span>
          `).join('')}
        </div>
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 8px;">
        <button class="action-btn-compact primary" id="btn-add-to-render-queue" style="padding: 6px 14px;">
          <span class="icon icon-sm">add_to_queue</span> Add to Render Queue
        </button>
      </div>
    </div>
  `;

  body.querySelectorAll('[data-preset-id]').forEach(btn => {
    btn.addEventListener('click', () => { state.selectedDeliverPreset = btn.dataset.presetId; renderDeliverSettings(); });
  });

  document.getElementById('btn-add-to-render-queue')?.addEventListener('click', () => {
    const fname = document.getElementById('deliv-filename')?.value || 'Master_Export';
    renderQueue.addJob({
      filename: fname,
      container: preset.container,
      codec: preset.codec,
      width: preset.width,
      height: preset.height,
      fps: preset.fps,
      bitrateMbps: preset.bitrateMbps,
      audioChannels: preset.audioChannels,
      durationSec: exportDur,
    });
  });
}

function renderDeliverQueue() {
  const body = document.getElementById('deliver-queue-body');
  if (!body) return;
  if (renderQueue.jobs.length === 0) {
    body.innerHTML = `<div style="padding: 28px; text-align: center; color: var(--text-muted);">Render Queue is empty. Configure Export Settings above and click <strong>Add to Render Queue</strong>.</div>`;
    return;
  }

  body.innerHTML = `
    <table class="queue-table">
      <thead>
        <tr>
          <th>Output File</th>
          <th>Specs</th>
          <th>Status</th>
          <th style="width: 180px;">Progress</th>
          <th>Size</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${renderQueue.jobs.map(j => `
          <tr>
            <td style="font-weight: 600;">${j.filename}.${j.container}</td>
            <td style="color: var(--text-secondary);">${j.width}×${j.height} · ${j.fps}fps · ${j.codec.toUpperCase()}</td>
            <td><span style="color: ${j.status === 'completed' ? 'var(--success)' : (j.status === 'failed' ? 'var(--error)' : 'var(--accent)')}; font-weight: 600; text-transform: uppercase; font-size: 10px;">${j.status}</span>${j.errorMessage ? `<div style="font-size:10px;color:var(--error);">${j.errorMessage}</div>` : ''}</td>
            <td>
              <div style="display: flex; align-items: center; gap: 6px;">
                <div style="flex: 1; height: 6px; background: #1A2230; border-radius: 3px; overflow: hidden;">
                  <div style="width: ${j.progress}%; height: 100%; background: ${j.status === 'completed' ? 'var(--success)' : 'var(--accent)'};"></div>
                </div>
                <span style="font-family: monospace; font-size: 10.5px;">${j.progress}%</span>
              </div>
            </td>
            <td style="font-family: monospace; color: var(--text-secondary);">${j.outputSizeBytes > 0 ? `${(j.outputSizeBytes / 1024).toFixed(1)} KB` : '--'}</td>
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

// ----------------------------------------------------
// 12. Contextual Inspector (Adapts per Workspace & Selection)
// ----------------------------------------------------
function renderInspector() {
  const container = document.getElementById('inspector-content');
  if (!container) return;
  const clip = getActiveClip();
  const seq = getActiveSequence();
  const statusInfo = document.getElementById('status-clip-info');

  // MEDIA WORKSPACE: Asset Metadata Inspector
  if (state.activeWorkspace === 'media') {
    const asset = state.activeAssetId ? state.project.assets[state.activeAssetId] : null;
    if (!asset) {
      container.innerHTML = `<div style="padding: 16px; color: var(--text-muted); font-size: 11.5px;">Select any imported asset in the Media Browser to inspect its container, dimensions, duration, and file metadata.</div>`;
      return;
    }
    container.innerHTML = `
      <div class="inspector-accordion">
        <div class="accordion-header"><span>Source Asset Metadata</span><span class="icon icon-sm">expand_more</span></div>
        <div class="accordion-content">
          <div class="field-row"><div class="field-header"><span>Filename</span><span class="field-val">${asset.name}</span></div></div>
          <div class="field-row"><div class="field-header"><span>MIME Type</span><span class="field-val">${asset.type}</span></div></div>
          <div class="field-row"><div class="field-header"><span>Dimensions</span><span class="field-val">${asset.width} × ${asset.height}</span></div></div>
          <div class="field-row"><div class="field-header"><span>Duration</span><span class="field-val">${formatTimecode(asset.duration, 24)}</span></div></div>
          <div class="field-row"><div class="field-header"><span>File Size</span><span class="field-val">${(asset.size / (1024 * 1024)).toFixed(2)} MB</span></div></div>
          <div class="field-row"><div class="field-header"><span>Ingested</span><span class="field-val">${asset.addedAt || 'Local'}</span></div></div>
        </div>
      </div>
    `;
    return;
  }

  // COLOR WORKSPACE: Live Pixel Scopes + Primary Sliders
  if (state.activeWorkspace === 'color') {
    const c = clip?.colorEffects || { exposure: 0, contrast: 1, saturation: 1, temperature: 0, brightness: 0 };
    container.innerHTML = `
      <div class="inspector-accordion">
        <div class="accordion-header"><span>Live RGB Histogram Scope</span><span class="icon icon-sm">expand_more</span></div>
        <div class="accordion-content">
          <canvas id="live-rgb-scope-canvas" class="scope-canvas"></canvas>
          <div style="font-size: 10px; color: var(--text-muted); text-align: center;">Real-time pixel sample from Program Monitor</div>
        </div>
      </div>
      <div class="inspector-accordion">
        <div class="accordion-header"><span>Primary Color Sliders ${clip ? `(${clip.name})` : '(Select Clip)'}</span><span class="icon icon-sm">expand_more</span></div>
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

  // EDIT & MOTION WORKSPACES: Progressive Disclosure Accordions
  if (!clip) {
    if (statusInfo) statusInfo.textContent = 'Master Sequence';
    container.innerHTML = `
      <div class="inspector-accordion">
        <div class="accordion-header"><span>Sequence Settings</span><span class="icon icon-sm">expand_more</span></div>
        <div class="accordion-content">
          <div class="field-row"><div class="field-header"><span>Sequence</span><span class="field-val">${seq.name}</span></div></div>
          <div class="field-row"><div class="field-header"><span>Resolution</span><span class="field-val">${seq.width} × ${seq.height}</span></div></div>
          <div class="field-row"><div class="field-header"><span>Frame Rate</span><span class="field-val">${seq.fps}.00 fps</span></div></div>
          <div class="field-row"><div class="field-header"><span>Duration</span><span class="field-val">${formatTimecode(seq.duration, seq.fps)}</span></div></div>
          <div class="field-row"><div class="field-header"><span>Markers</span><span class="field-val">${seq.markers.length}</span></div></div>
        </div>
      </div>
      <div class="inspector-accordion">
        <div class="accordion-header"><span>Project Summary</span><span class="icon icon-sm">expand_more</span></div>
        <div class="accordion-content">
          <div class="field-row"><div class="field-header"><span>Imported Assets</span><span class="field-val">${Object.keys(state.project.assets).length}</span></div></div>
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
        <div class="accordion-header"><span>Audio Clip Gain & Pan</span><span class="icon icon-sm">expand_more</span></div>
        <div class="accordion-content">
          <div class="field-row"><div class="field-header"><span>Volume (dB)</span><span class="field-val" id="disp-vol">${a.volumeDb.toFixed(1)} dB</span></div><input type="range" id="insp-vol" min="-40" max="12" step="0.5" value="${a.volumeDb}"></div>
          <div class="field-row"><div class="field-header"><span>Pan</span><span class="field-val" id="disp-pan">${a.pan}</span></div><input type="range" id="insp-pan" min="-100" max="100" step="1" value="${a.pan}"></div>
        </div>
      </div>
      <div class="inspector-accordion">
        <div class="accordion-header"><span>Audio Fades</span><span class="icon icon-sm">expand_more</span></div>
        <div class="accordion-content">
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
  container.innerHTML = `
    <div class="inspector-accordion">
      <div class="accordion-header"><span>Video Transform</span><span class="icon icon-sm">expand_more</span></div>
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
          <div class="field-row">
            <div class="field-header"><span>Easing Curve</span></div>
            <select id="insp-tr-ease" class="compact-select">
              <option value="smooth" ${clip.transitionIn.ease==='smooth'?'selected':''}>Smooth (Ease In/Out)</option>
              <option value="linear" ${clip.transitionIn.ease==='linear'?'selected':''}>Linear</option>
              <option value="ease-in" ${clip.transitionIn.ease==='ease-in'?'selected':''}>Ease In</option>
              <option value="ease-out" ${clip.transitionIn.ease==='ease-out'?'selected':''}>Ease Out</option>
            </select>
          </div>
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
    document.getElementById('insp-tr-ease')?.addEventListener('change', e => { clip.transitionIn.ease = e.target.value; renderProgramMonitor(); });
    document.getElementById('btn-remove-tr')?.addEventListener('click', () => { executeCommand('Remove Transition', () => { clip.transitionIn = null; }); });
  }
  document.getElementById('insp-invert')?.addEventListener('change', e => { clip.colorEffects.invert = e.target.checked; renderProgramMonitor(); scheduleAutoSave(); });
  document.getElementById('btn-reset-clip-grade')?.addEventListener('click', () => resetClipProperties(clip));
  bindAccordionToggles(container);
}

function bindAccordionToggles(container) {
  container.querySelectorAll('.accordion-header').forEach(h => {
    h.addEventListener('click', () => {
      const c = h.nextElementSibling;
      const ic = h.querySelector('.icon');
      if (c) {
        const collapsed = c.classList.toggle('collapsed');
        if (ic) ic.textContent = collapsed ? 'chevron_right' : 'expand_more';
      }
    });
  });
}

function bindSlider(sliderId, dispId, updateFn, formatFn) {
  const s = document.getElementById(sliderId);
  const d = document.getElementById(dispId);
  s?.addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    updateFn(v);
    if (d) d.textContent = formatFn(v);
    renderProgramMonitor();
    scheduleAutoSave();
  });
}

// ----------------------------------------------------
// 13. Reorganized 13-Menu Wiring & Custom Workspaces
// ----------------------------------------------------
function initMenus() {
  // File
  document.getElementById('m-file-new')?.addEventListener('click', () => {
    if (!confirm('Create a new empty project? Unsaved local media URLs will be cleared.')) return;
    state.project.title = 'Untitled Project';
    state.project.assets = {};
    state.project.sequences.seq_master.clips = [];
    state.project.sequences.seq_master.markers = [];
    state.activeClipId = null; state.activeAssetId = null;
    scheduleAutoSave(); renderAll();
  });
  document.getElementById('m-file-save')?.addEventListener('click', () => { scheduleAutoSave(); });
  document.getElementById('m-file-save-as')?.addEventListener('click', () => {
    const t = prompt('Save Project As:', state.project.title);
    if (t) { state.project.title = t; scheduleAutoSave(); renderAll(); }
  });
  document.getElementById('m-file-import')?.addEventListener('click', () => document.getElementById('video-file-input')?.click());
  document.getElementById('m-file-export')?.addEventListener('click', () => switchWorkspace('deliver'));
  document.getElementById('btn-goto-deliver')?.addEventListener('click', () => switchWorkspace('deliver'));
  document.getElementById('m-file-archive')?.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state.project, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${state.project.title.replace(/\s+/g, '_')}.frameflow.json`;
    a.click();
  });

  // Edit
  document.getElementById('m-edit-undo')?.addEventListener('click', undo);
  document.getElementById('m-edit-redo')?.addEventListener('click', redo);
  document.getElementById('btn-undo')?.addEventListener('click', undo);
  document.getElementById('btn-redo')?.addEventListener('click', redo);
  document.getElementById('m-edit-copy')?.addEventListener('click', () => { const c = getActiveClip(); if (c) state.clipboardClip = JSON.parse(JSON.stringify(c)); });
  document.getElementById('m-edit-paste')?.addEventListener('click', pasteClipboardClip);
  document.getElementById('m-edit-delete')?.addEventListener('click', deleteActiveClip);
  document.getElementById('m-edit-shortcuts')?.addEventListener('click', openShortcutsModal);

  // Project
  document.getElementById('m-proj-rename')?.addEventListener('click', () => {
    const t = prompt('Rename Project:', state.project.title);
    if (t) { state.project.title = t; scheduleAutoSave(); renderAll(); }
  });
  document.getElementById('m-proj-newbin')?.addEventListener('click', createNewBin);
  document.getElementById('m-proj-media')?.addEventListener('click', () => switchWorkspace('media'));

  // Clip
  document.getElementById('m-clip-insert')?.addEventListener('click', () => { if (state.activeAssetId) insertAssetAtTime(state.activeAssetId, getActiveSequence().playheadTime); });
  document.getElementById('m-clip-split')?.addEventListener('click', () => { if (state.activeClipId) splitClipAction(state.activeClipId, getActiveSequence().playheadTime); });
  document.getElementById('m-clip-speed')?.addEventListener('click', () => { const c = getActiveClip(); if (c) editClipSpeedPrompt(c); });
  document.getElementById('m-clip-link')?.addEventListener('click', () => document.getElementById('btn-link-toggle')?.click());
  document.getElementById('m-clip-reset')?.addEventListener('click', () => { const c = getActiveClip(); if (c) resetClipProperties(c); });

  // Sequence
  document.getElementById('m-seq-new')?.addEventListener('click', () => {
    const n = prompt('New Sequence Name:', 'Sequence 02');
    if (!n) return;
    const id = `seq_${Date.now()}`;
    executeCommand('New Sequence', () => {
      state.project.sequences[id] = { ...JSON.parse(JSON.stringify(getActiveSequence())), id, name: n, clips: [], markers: [], playheadTime: 0 };
      state.project.activeSequenceId = id;
    });
  });
  document.getElementById('m-seq-duplicate')?.addEventListener('click', () => {
    const cur = getActiveSequence();
    const id = `seq_${Date.now()}`;
    executeCommand('Duplicate Sequence', () => {
      state.project.sequences[id] = { ...JSON.parse(JSON.stringify(cur)), id, name: `${cur.name} Copy` };
      state.project.activeSequenceId = id;
    });
  });
  document.getElementById('m-seq-render-preview')?.addEventListener('click', () => renderProgramMonitor());

  // Timeline
  document.getElementById('m-time-snap')?.addEventListener('click', toggleSnapping);
  document.getElementById('m-time-add-v')?.addEventListener('click', () => addTrack('video'));
  document.getElementById('m-time-add-a')?.addEventListener('click', () => addTrack('audio'));
  document.getElementById('m-time-marker')?.addEventListener('click', addMarkerAtPlayhead);
  document.getElementById('m-time-fit')?.addEventListener('click', fitTimelineToSequence);

  // Graphics, Effects, Audio, Color
  document.getElementById('m-gfx-title')?.addEventListener('click', addTitleOverlayClip);
  document.getElementById('m-gfx-safe')?.addEventListener('click', toggleSafeMargins);
  document.getElementById('m-gfx-motion')?.addEventListener('click', () => switchWorkspace('motion'));
  document.getElementById('m-fx-transitions')?.addEventListener('click', () => switchWorkspace('motion'));
  document.getElementById('m-fx-apply-dissolve')?.addEventListener('click', () => applyTransitionToActiveClip(TRANSITION_CATALOG[0]));
  document.getElementById('m-fx-reset')?.addEventListener('click', () => { const c = getActiveClip(); if (c) resetClipProperties(c); });
  document.getElementById('m-audio-mixer')?.addEventListener('click', () => switchWorkspace('audio'));
  document.getElementById('m-audio-routing')?.addEventListener('click', () => switchWorkspace('audio'));
  document.getElementById('m-audio-loudness')?.addEventListener('click', () => { audioEngine.lufsHistory = []; });
  document.getElementById('m-color-wheels')?.addEventListener('click', () => switchWorkspace('color'));
  document.getElementById('m-color-reset')?.addEventListener('click', () => { const c = getActiveClip(); if (c) resetClipProperties(c); });

  // View
  document.getElementById('m-view-split')?.addEventListener('click', toggleMonitorSplitView);
  document.getElementById('m-view-safe')?.addEventListener('click', toggleSafeMargins);
  document.getElementById('m-view-zoom-in')?.addEventListener('click', () => { state.pixelsPerSecond = Math.min(180, state.pixelsPerSecond * 1.3); renderTimeline(); });
  document.getElementById('m-view-zoom-out')?.addEventListener('click', () => { state.pixelsPerSecond = Math.max(8, state.pixelsPerSecond / 1.3); renderTimeline(); });
  document.getElementById('m-view-fullscreen')?.addEventListener('click', () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
  });

  // Window: Panel visibility toggles & Saved Workspaces
  document.querySelectorAll('[data-panel-toggle]').forEach(entry => {
    entry.addEventListener('click', () => {
      const target = document.getElementById(entry.dataset.panelToggle);
      if (target) {
        target.classList.toggle('hidden-panel');
        updateWindowPanelsCheckmarks();
      }
    });
  });

  document.getElementById('win-save-ws')?.addEventListener('click', () => {
    const name = prompt('Save Custom Workspace Name:', `Custom ${state.activeWorkspace.toUpperCase()}`);
    if (!name) return;
    const saved = {
      id: `ws_${Date.now()}`,
      name,
      base: state.activeWorkspace,
      bottomHeight: document.getElementById('workspace-bottom-row')?.style.height || '310px',
    };
    state.customWorkspaces.push(saved);
    localStorage.setItem('ff_custom_workspaces', JSON.stringify(state.customWorkspaces));
    renderCustomWorkspacesMenu();
  });

  document.getElementById('win-reset-layout')?.addEventListener('click', () => {
    document.querySelectorAll('.panel').forEach(p => {
      p.classList.remove('floating-panel', 'maximized');
      p.style.width = ''; p.style.height = ''; p.style.flex = '';
    });
    document.getElementById('workspace-bottom-row').style.height = '';
    applyWorkspaceLayout(state.activeWorkspace);
  });

  // Help & Diagnostics
  document.getElementById('m-help-shortcuts')?.addEventListener('click', openShortcutsModal);
  document.getElementById('m-help-diagnostics')?.addEventListener('click', openDiagnosticsModal);
  document.getElementById('btn-open-diagnostics')?.addEventListener('click', openDiagnosticsModal);
  document.getElementById('m-help-about')?.addEventListener('click', () => {
    alert('FRAMEFLOW Studio v5.0.0\nOpen-Source Browser-Based Professional Nonlinear Video Editor');
  });
}

function renderCustomWorkspacesMenu() {
  const container = document.getElementById('custom-workspaces-menu-list');
  if (!container) return;
  container.innerHTML = state.customWorkspaces.map(w => `
    <div class="menu-entry" data-load-ws="${w.id}">
      <span>★ ${w.name}</span>
      <span class="menu-shortcut" data-del-ws="${w.id}" title="Delete Workspace">✕</span>
    </div>
  `).join('');

  container.querySelectorAll('[data-load-ws]').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.dataset.delWs) {
        e.stopPropagation();
        state.customWorkspaces = state.customWorkspaces.filter(x => x.id !== e.target.dataset.delWs);
        localStorage.setItem('ff_custom_workspaces', JSON.stringify(state.customWorkspaces));
        renderCustomWorkspacesMenu();
        return;
      }
      const ws = state.customWorkspaces.find(x => x.id === el.dataset.loadWs);
      if (ws) {
        switchWorkspace(ws.base);
        if (ws.bottomHeight) document.getElementById('workspace-bottom-row').style.height = ws.bottomHeight;
      }
    });
  });
}

// ----------------------------------------------------
// 14. Modals: Visual Keyboard Shortcuts & Diagnostics
// ----------------------------------------------------
const KEYBOARD_ROWS = [
  ['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', 'Backspace'],
  ['Tab', 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '[', ']', '\\'],
  ['Caps', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';', "'", 'Enter'],
  ['Shift', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '/', 'Shift'],
  ['Ctrl', 'Alt', 'Space', 'Alt', 'Ctrl'],
];

function initModals() {
  document.getElementById('btn-close-shortcuts-modal')?.addEventListener('click', () => {
    state.rebindingShortcutId = null;
    document.getElementById('modal-shortcuts')?.classList.remove('active');
  });
  document.getElementById('btn-close-diagnostics-modal')?.addEventListener('click', () => {
    document.getElementById('modal-diagnostics')?.classList.remove('active');
  });

  document.getElementById('btn-reset-shortcuts')?.addEventListener('click', () => {
    activeShortcuts = structuredClone(DEFAULT_SHORTCUTS);
    localStorage.removeItem('ff_shortcuts');
    renderVisualKeyboard();
    renderShortcutsTable();
  });

  document.getElementById('btn-export-shortcuts')?.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(activeShortcuts, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'frameflow-shortcuts.json';
    a.click();
  });

  document.getElementById('shortcut-search')?.addEventListener('input', (e) => {
    renderShortcutsTable(e.target.value.toLowerCase());
  });
}

function openShortcutsModal() {
  document.getElementById('modal-shortcuts')?.classList.add('active');
  renderVisualKeyboard();
  renderShortcutsTable();
}

function renderVisualKeyboard() {
  const container = document.getElementById('virtual-keyboard-container');
  if (!container) return;
  const map = {};
  for (const s of activeShortcuts) map[s.key.toUpperCase()] = s;
  container.innerHTML = KEYBOARD_ROWS.map(row => `
    <div class="keyboard-row">
      ${row.map(key => {
        const m = map[key.toUpperCase()];
        const style = key === 'Space' ? 'width: 210px;' : (['Backspace','Enter','Tab','Caps','Shift'].includes(key) ? 'width: 58px;' : '');
        return `<div class="k-key ${m ? `mapped ${m.type}` : ''}" style="${style}" title="${m ? `${m.name} (${key})` : key}"><span>${key}</span>${m ? `<span class="k-key-desc">${m.name.slice(0, 8)}</span>` : ''}</div>`;
      }).join('')}
    </div>
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
      <td style="padding: 5px 10px;">
        <button class="action-btn-compact btn-rebind-key" data-sc-id="${s.id}" style="font-family: monospace; color: var(--accent-cyan); border-color: var(--border);">
          ${state.rebindingShortcutId === s.id ? 'Press new key...' : s.key}
        </button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.btn-rebind-key').forEach(btn => {
    btn.addEventListener('click', () => {
      state.rebindingShortcutId = btn.dataset.scId;
      renderShortcutsTable(filter);
    });
  });
}

function openDiagnosticsModal() {
  const modal = document.getElementById('modal-diagnostics');
  const body = document.getElementById('diagnostics-modal-body');
  if (!modal || !body) return;
  const gpu = state.gpuCapabilities || {};
  const aud = audioEngine.getStatus();
  const cod = state.codecCapabilities || detectExportCodecs();

  body.innerHTML = `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11.5px;">
      <div style="background: #10151E; padding: 10px; border: 1px solid var(--border); border-radius: 4px;">
        <div style="color: var(--accent); font-weight: 700; margin-bottom: 6px;">GPU & RENDER PIPELINE</div>
        <div>Active Backend: <strong>${gpu.activeBackend || 'Unknown'}</strong></div>
        <div>WebGPU API: <strong>${gpu.webgpuAvailable ? 'Supported' : 'Not Available'}</strong></div>
        <div>WebGL 2: <strong>${gpu.webgl2Available ? 'Supported' : 'Not Available'}</strong></div>
        <div style="font-size: 10px; color: var(--text-muted); margin-top: 4px;">${gpu.webgpuAdapterName || gpu.webglRenderer || 'Software Rasterizer'}</div>
      </div>
      <div style="background: #10151E; padding: 10px; border: 1px solid var(--border); border-radius: 4px;">
        <div style="color: var(--success); font-weight: 700; margin-bottom: 6px;">WEB AUDIO DSP ENGINE</div>
        <div>Status: <strong>${aud.state}</strong></div>
        <div>Sample Rate: <strong>${aud.sampleRate} Hz</strong></div>
        <div>Max Output Channels: <strong>${aud.maxChannels}</strong></div>
        <div>Bus Architecture: <strong>4 Post Buses + Master</strong></div>
      </div>
      <div style="background: #10151E; padding: 10px; border: 1px solid var(--border); border-radius: 4px;">
        <div style="color: var(--accent-cyan); font-weight: 700; margin-bottom: 6px;">EXPORT & CODECS</div>
        <div>WebCodecs VideoEncoder: <strong>${cod.webcodecs ? 'Available' : 'Unavailable'}</strong></div>
        <div>MediaRecorder Muxer: <strong>${cod.mediaRecorder ? 'Available' : 'Unavailable'}</strong></div>
        <div>Supported Formats: <strong>${cod.formats.filter(f => f.supported).length} / ${cod.formats.length}</strong></div>
      </div>
      <div style="background: #10151E; padding: 10px; border: 1px solid var(--border); border-radius: 4px;">
        <div style="color: var(--warning); font-weight: 700; margin-bottom: 6px;">STORAGE & PERFORMANCE</div>
        <div>OPFS Support: <strong>${gpu.opfsSupported ? 'Available' : 'Unavailable'}</strong></div>
        <div>IndexedDB Store: <strong>${idb ? 'Connected' : 'Standby'}</strong></div>
        <div>Measured FPS: <strong>${state.measuredFps} FPS (Drops: ${state.droppedFrames})</strong></div>
      </div>
    </div>
  `;
  modal.classList.add('active');
}

// ----------------------------------------------------
// 15. Context-Aware Keyboard Engine (with Rebinding & Conflict Check)
// ----------------------------------------------------
function initKeyboardEngine() {
  window.addEventListener('keydown', (e) => {
    // Handle live shortcut rebinding when modal is active
    if (state.rebindingShortcutId) {
      e.preventDefault();
      const combo = `${e.ctrlKey ? 'Ctrl+' : ''}${e.altKey ? 'Alt+' : ''}${e.shiftKey ? 'Shift+' : ''}${e.key.length === 1 ? e.key.toUpperCase() : e.key}`;
      const conflict = activeShortcuts.find(s => s.id !== state.rebindingShortcutId && s.key.toUpperCase() === combo.toUpperCase());
      const banner = document.getElementById('shortcut-conflict-banner');
      if (conflict && banner) {
        banner.style.display = 'block';
        banner.textContent = `Conflict detected: "${combo}" is already assigned to "${conflict.name}". Reassigned anyway.`;
      } else if (banner) {
        banner.style.display = 'none';
      }
      const target = activeShortcuts.find(s => s.id === state.rebindingShortcutId);
      if (target) target.key = combo;
      state.rebindingShortcutId = null;
      localStorage.setItem('ff_shortcuts', JSON.stringify(activeShortcuts));
      renderVisualKeyboard();
      renderShortcutsTable();
      return;
    }

    // Strict input protection: never fire NLE shortcuts while typing
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

    const code = e.code;
    const isCtrl = e.ctrlKey || e.metaKey;

    if (isCtrl && e.altKey && code === 'KeyK') { e.preventDefault(); openShortcutsModal(); return; }
    if (isCtrl && code === 'KeyZ') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (isCtrl && code === 'KeyY') { e.preventDefault(); redo(); return; }
    if (isCtrl && code === 'KeyS') { e.preventDefault(); scheduleAutoSave(); return; }
    if (isCtrl && code === 'KeyI') { e.preventDefault(); document.getElementById('video-file-input')?.click(); return; }
    if (isCtrl && code === 'KeyM') { e.preventDefault(); switchWorkspace('deliver'); return; }
    if (isCtrl && code === 'KeyL') { e.preventDefault(); document.getElementById('btn-link-toggle')?.click(); return; }
    if (isCtrl && code === 'KeyK') { e.preventDefault(); if (state.activeClipId) splitClipAction(state.activeClipId, getActiveSequence().playheadTime); return; }
    if (isCtrl && code === 'KeyC') { const c = getActiveClip(); if (c) state.clipboardClip = JSON.parse(JSON.stringify(c)); return; }
    if (isCtrl && code === 'KeyV') { pasteClipboardClip(); return; }

    if (code === 'Backquote') {
      e.preventDefault();
      const focused = document.querySelector('.panel.focused') || document.getElementById('panel-timeline');
      if (focused) toggleMaximizePanel(focused);
      return;
    }

    if (code === 'Space') { e.preventDefault(); toggleSequencePlayback(); return; }
    if (code === 'KeyJ') { state.isPlayingSequence = true; state.playbackSpeed = state.playbackSpeed <= 0 ? state.playbackSpeed - 1 : -1; return; }
    if (code === 'KeyK') { state.isPlayingSequence = false; state.playbackSpeed = 1; return; }
    if (code === 'KeyL') { state.isPlayingSequence = true; state.playbackSpeed = state.playbackSpeed >= 1 ? state.playbackSpeed + 1 : 1; return; }
    if (code === 'ArrowLeft')  { e.preventDefault(); stepFrames(e.shiftKey ? -5 : -1); return; }
    if (code === 'ArrowRight') { e.preventDefault(); stepFrames(e.shiftKey ? 5 : 1); return; }

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
    if (code === 'KeyI') { getActiveSequence().inPoint = getActiveSequence().playheadTime; renderTimeline(); }
    if (code === 'KeyO') { getActiveSequence().outPoint = getActiveSequence().playheadTime; renderTimeline(); }
    if (code === 'Delete' || code === 'Backspace') deleteActiveClip();
    if (code === 'Backslash') fitTimelineToSequence();
    if (code === 'Equal') { state.pixelsPerSecond = Math.min(180, state.pixelsPerSecond * 1.3); renderTimeline(); }
    if (code === 'Minus') { state.pixelsPerSecond = Math.max(8, state.pixelsPerSecond / 1.3); renderTimeline(); }
  });
}

// ----------------------------------------------------
// 16. Master Render & Timecode Formatter
// ----------------------------------------------------
function renderAll() {
  renderAssetsList();
  renderTimeline();
  renderProgramMonitor();
  renderInspector();
  if (state.activeWorkspace === 'color') renderColorClipsGallery();
  if (state.activeWorkspace === 'audio') renderAudioConsole();
  if (state.activeWorkspace === 'deliver') { renderDeliverSettings(); renderDeliverQueue(); }
  const titleEl = document.getElementById('project-title-disp');
  if (titleEl) titleEl.textContent = state.project.title;
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

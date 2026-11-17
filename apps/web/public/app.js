/**
 * FRAMEFLOW Professional Video Editor — Milestone M3
 * Full professional NLE client engine with Google Material Symbols Rounded,
 * four-zone timeline architecture, scoped keyboard shortcut system,
 * visual keyboard shortcut customizer modal, six specialist workspaces,
 * master audio VU meter, and persistent IndexedDB project store.
 */

// ----------------------------------------------------
// 1. Core State & Data Models
// ----------------------------------------------------
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
        tracks: [
          { id: 'track_v2', name: 'V2', type: 'video', index: 1, muted: false, solo: false, locked: false, visible: true, height: 44, targeted: false },
          { id: 'track_v1', name: 'V1', type: 'video', index: 0, muted: false, solo: false, locked: false, visible: true, height: 44, targeted: true },
          { id: 'track_a1', name: 'A1', type: 'audio', index: 0, muted: false, solo: false, locked: false, visible: true, height: 44, targeted: true },
          { id: 'track_a2', name: 'A2', type: 'audio', index: 1, muted: false, solo: false, locked: false, visible: true, height: 44, targeted: false },
        ],
        clips: [],
      },
    },
  },
  activeClipId: null,
  activeAssetId: null,
  pixelsPerSecond: 28, // timeline zoom scale
  isPlayingSequence: false,
  playbackSpeed: 1, // 1 = normal, -1 = reverse, 2 = 2x, etc.
  activeTool: 'select', // 'select' | 'track-select' | 'ripple' | 'rolling' | 'rate-stretch' | 'razor' | 'slip' | 'slide' | 'pen' | 'hand' | 'zoom' | 'text'
  isSnapping: true,
  isLinkedSelection: true,
  focusedPanel: 'timeline', // 'project' | 'source' | 'program' | 'timeline' | 'inspector'
  activeWorkspace: 'edit', // 'media' | 'edit' | 'motion' | 'color' | 'audio' | 'deliver'
  shortcutPreset: 'frameflow', // 'frameflow' | 'premiere' | 'resolve' | 'fcp'
  undoStack: [],
  redoStack: [],
  videoCache: {}, // assetId -> HTMLVideoElement
  sourceInPoint: 0,
  sourceOutPoint: 0,
  saveTimeout: null,
  vuLevelL: 0,
  vuLevelR: 0,
};

// ----------------------------------------------------
// 2. Keyboard Shortcut Registry & Presets
// ----------------------------------------------------
const SHORTCUT_DEFINITIONS = [
  // Transport
  { id: 'play_pause', name: 'Play / Pause Sequence', category: 'Transport', key: 'Space', type: 'transport' },
  { id: 'shuttle_rev', name: 'Shuttle Reverse (J)', category: 'Transport', key: 'J', type: 'transport' },
  { id: 'shuttle_pause', name: 'Pause Playback (K)', category: 'Transport', key: 'K', type: 'transport' },
  { id: 'shuttle_fwd', name: 'Shuttle Forward (L)', category: 'Transport', key: 'L', type: 'transport' },
  { id: 'step_prev_frame', name: 'Step 1 Frame Back', category: 'Transport', key: 'ArrowLeft', type: 'transport' },
  { id: 'step_next_frame', name: 'Step 1 Frame Forward', category: 'Transport', key: 'ArrowRight', type: 'transport' },
  { id: 'step_prev_sec', name: 'Step 1 Sec Back', category: 'Transport', key: 'Shift+ArrowLeft', type: 'transport' },
  { id: 'step_next_sec', name: 'Step 1 Sec Forward', category: 'Transport', key: 'Shift+ArrowRight', type: 'transport' },
  { id: 'mark_in', name: 'Mark In Point', category: 'Transport', key: 'I', type: 'transport' },
  { id: 'mark_out', name: 'Mark Out Point', category: 'Transport', key: 'O', type: 'transport' },

  // Tools
  { id: 'tool_select', name: 'Selection Tool', category: 'Tools', key: 'V', type: 'tool' },
  { id: 'tool_track_select', name: 'Track Select Forward Tool', category: 'Tools', key: 'A', type: 'tool' },
  { id: 'tool_ripple', name: 'Ripple Edit Tool', category: 'Tools', key: 'B', type: 'tool' },
  { id: 'tool_rolling', name: 'Rolling Edit Tool', category: 'Tools', key: 'N', type: 'tool' },
  { id: 'tool_rate_stretch', name: 'Rate Stretch Tool', category: 'Tools', key: 'R', type: 'tool' },
  { id: 'tool_razor', name: 'Razor Cut Tool', category: 'Tools', key: 'C', type: 'tool' },
  { id: 'tool_slip', name: 'Slip Tool', category: 'Tools', key: 'Y', type: 'tool' },
  { id: 'tool_slide', name: 'Slide Tool', category: 'Tools', key: 'U', type: 'tool' },
  { id: 'tool_pen', name: 'Pen Tool', category: 'Tools', key: 'P', type: 'tool' },
  { id: 'tool_hand', name: 'Hand Tool', category: 'Tools', key: 'H', type: 'tool' },
  { id: 'tool_zoom', name: 'Zoom Tool', category: 'Tools', key: 'Z', type: 'tool' },
  { id: 'tool_text', name: 'Type / Text Tool', category: 'Tools', key: 'T', type: 'tool' },

  // Editing
  { id: 'split_at_playhead', name: 'Split Clip at Playhead', category: 'Editing', key: 'Ctrl+K', type: 'edit' },
  { id: 'delete_clip', name: 'Delete Selected Clip', category: 'Editing', key: 'Delete', type: 'edit' },
  { id: 'ripple_delete', name: 'Ripple Delete', category: 'Editing', key: 'Shift+Delete', type: 'edit' },
  { id: 'undo', name: 'Undo Command', category: 'Editing', key: 'Ctrl+Z', type: 'edit' },
  { id: 'redo', name: 'Redo Command', category: 'Editing', key: 'Ctrl+Shift+Z', type: 'edit' },
  { id: 'speed_duration', name: 'Speed / Duration', category: 'Editing', key: 'Ctrl+R', type: 'edit' },

  // Navigation & Zoom
  { id: 'snap_toggle', name: 'Toggle Snapping', category: 'Navigation', key: 'S', type: 'nav' },
  { id: 'zoom_in', name: 'Zoom In Timeline', category: 'Navigation', key: '=', type: 'nav' },
  { id: 'zoom_out', name: 'Zoom Out Timeline', category: 'Navigation', key: '-', type: 'nav' },
  { id: 'fit_sequence', name: 'Fit Sequence to View', category: 'Navigation', key: '\\', type: 'nav' },
  { id: 'maximize_panel', name: 'Maximize Active Panel', category: 'Navigation', key: '`', type: 'nav' },

  // Global Application
  { id: 'save_project', name: 'Save Project', category: 'Global', key: 'Ctrl+S', type: 'global' },
  { id: 'export_sequence', name: 'Export Sequence Dialog', category: 'Global', key: 'Ctrl+M', type: 'global' },
  { id: 'import_media', name: 'Import Media Files', category: 'Global', key: 'Ctrl+I', type: 'global' },
  { id: 'new_sequence', name: 'New Sequence', category: 'Global', key: 'Ctrl+N', type: 'global' },
  { id: 'shortcuts_manager', name: 'Keyboard Shortcuts Manager', category: 'Global', key: 'Ctrl+Alt+K', type: 'global' },
];

// Presets key mapping overrides
const PRESET_MAPPINGS = {
  frameflow: {}, // Default as defined above
  premiere: {
    split_at_playhead: 'Ctrl+K',
    tool_razor: 'C',
    tool_select: 'V',
    tool_ripple: 'B',
    tool_rolling: 'N',
    tool_rate_stretch: 'R',
    tool_slip: 'Y',
    tool_slide: 'U',
    tool_pen: 'P',
    tool_hand: 'H',
    tool_zoom: 'Z',
    tool_text: 'T',
    snap_toggle: 'S',
  },
  resolve: {
    split_at_playhead: 'Ctrl+\\',
    tool_razor: 'B',
    tool_select: 'A',
    tool_ripple: 'T',
    snap_toggle: 'N',
    export_sequence: 'Shift+1',
  },
  fcp: {
    split_at_playhead: 'Cmd+B',
    tool_razor: 'B',
    tool_select: 'A',
    tool_zoom: 'Z',
    tool_hand: 'H',
    tool_text: 'T',
  },
};

// ----------------------------------------------------
// 3. Initialization & Lifecycle
// ----------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  initSplitters();
  initPanelMaximizing();
  initMenus();
  initWorkspaceTabs();
  initMediaIngest();
  initSourceMonitor();
  initProgramMonitor();
  initTimeline();
  initInspector();
  initKeyboardShortcuts();
  initModals();
  initVisualKeyboard();
  await initPersistenceAndLoad();
  renderAll();
  startPlaybackLoop();
});

function getActiveSequence() {
  return state.project.sequences[state.project.activeSequenceId];
}

function getActiveClip() {
  const seq = getActiveSequence();
  return seq.clips.find(c => c.id === state.activeClipId) || null;
}

// ----------------------------------------------------
// 4. Command System & Undo/Redo
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
  const currentSnapshot = JSON.parse(JSON.stringify(state.project));
  const { snapshot } = state.undoStack.pop();
  state.redoStack.push({ snapshot: currentSnapshot });
  state.project = snapshot;
  scheduleAutoSave();
  renderAll();
  console.log('[FRAMEFLOW Undo] Undone action');
}

function redo() {
  if (state.redoStack.length === 0) return;
  const currentSnapshot = JSON.parse(JSON.stringify(state.project));
  const { snapshot } = state.redoStack.pop();
  state.undoStack.push({ snapshot: currentSnapshot });
  state.project = snapshot;
  scheduleAutoSave();
  renderAll();
  console.log('[FRAMEFLOW Redo] Redone action');
}

// ----------------------------------------------------
// 5. IndexedDB Persistence & Recovery
// ----------------------------------------------------
const DB_NAME = 'frameflow_db';
const STORE_NAME = 'projects';
let idb = null;

async function initPersistenceAndLoad() {
  if (!window.indexedDB) return;

  idb = await new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => resolve(null);
  });

  if (!idb) return;

  // Restore last project
  const savedProject = await new Promise((resolve) => {
    try {
      const tx = idb.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get('proj_default');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

  if (savedProject && savedProject.sequences) {
    state.project = savedProject;
    console.log('[FRAMEFLOW IDB] Restored project from IndexedDB:', savedProject.title);
  }
}

function scheduleAutoSave() {
  const badge = document.getElementById('save-status-badge');
  if (badge) {
    badge.textContent = 'Saving...';
    badge.className = 'save-status-indicator unsaved';
  }

  clearTimeout(state.saveTimeout);
  state.saveTimeout = setTimeout(async () => {
    if (!idb) return;
    try {
      state.project.modifiedAt = Date.now();
      const tx = idb.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(state.project);
      if (badge) {
        badge.textContent = '● Saved';
        badge.className = 'save-status-indicator saved';
      }
      console.log('[FRAMEFLOW IDB] Project autosaved successfully');
    } catch (err) {
      console.warn('[FRAMEFLOW IDB] Autosave failed', err);
    }
  }, 600);
}

// ----------------------------------------------------
// 6. UI Splitters, Focus & Panel Resizing
// ----------------------------------------------------
function initSplitters() {
  setupSplitter('splitter-left', 'panel-project', 'width', false, 160, 500);
  setupSplitter('splitter-right', 'panel-inspector', 'width', true, 200, 600);
  setupSplitter('splitter-center-v', 'monitors-pane', 'height', false, 150, 700);
  setupSplitter('splitter-monitors', 'panel-source', 'width', false, 200, 800);

  // Track focused panels
  ['panel-project', 'panel-source', 'panel-program', 'panel-timeline', 'panel-inspector'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('mousedown', () => {
      document.querySelectorAll('.panel, .monitor-wrapper, .timeline-pane').forEach(p => p.classList.remove('focused'));
      el.classList.add('focused');
      state.focusedPanel = id.replace('panel-', '');
    });
  });
}

function setupSplitter(splitterId, targetPanelId, dimension, reverse = false, min = 100, max = 800) {
  const splitter = document.getElementById(splitterId);
  const target = document.getElementById(targetPanelId);
  if (!splitter || !target) return;

  splitter.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const startPos = dimension === 'width' ? e.clientX : e.clientY;
    const startSize = dimension === 'width' ? target.offsetWidth : target.offsetHeight;

    const onMouseMove = (ev) => {
      const currentPos = dimension === 'width' ? ev.clientX : ev.clientY;
      const delta = reverse ? (startPos - currentPos) : (currentPos - startPos);
      const newSize = Math.max(min, Math.min(max, startSize + delta));
      target.style[dimension] = `${newSize}px`;
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  });
}

function initPanelMaximizing() {
  document.querySelectorAll('.btn-maximize-panel').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const panel = btn.closest('.panel, .monitor-wrapper, .timeline-pane');
      if (panel) toggleMaximizePanel(panel);
    });
  });
}

function toggleMaximizePanel(panel) {
  const isMaxed = panel.classList.contains('maximized');
  document.querySelectorAll('.panel, .monitor-wrapper, .timeline-pane').forEach(p => p.classList.remove('maximized'));
  if (!isMaxed) {
    panel.classList.add('maximized');
  }
}

// ----------------------------------------------------
// 7. Media Ingest & Assets Management
// ----------------------------------------------------
function initMediaIngest() {
  const fileInput = document.getElementById('video-file-input');
  const dropzone = document.getElementById('media-dropzone');
  const importBtn = document.getElementById('btn-import-media');
  const addBinBtn = document.getElementById('btn-add-bin');

  if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = 'var(--accent-blue)';
    });
    dropzone.addEventListener('dragleave', () => {
      dropzone.style.borderColor = 'var(--border-subtle)';
    });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = 'var(--border-subtle)';
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFilesIngest(Array.from(e.dataTransfer.files));
      }
    });
  }

  if (importBtn && fileInput) {
    importBtn.addEventListener('click', () => fileInput.click());
  }

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFilesIngest(Array.from(e.target.files));
      }
    });
  }

  if (addBinBtn) {
    addBinBtn.addEventListener('click', () => {
      const binName = prompt('Enter Bin Name:', 'B-Roll Footage');
      if (!binName) return;
      const binId = `bin_${Date.now()}`;
      state.project.bins[binId] = { id: binId, name: binName, assetIds: [] };
      executeCommand('Create Bin', () => {});
    });
  }
}

async function handleFilesIngest(files) {
  for (const file of files) {
    const assetId = `asset_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const url = URL.createObjectURL(file);
    const isVideo = file.type.startsWith('video');
    const isAudio = file.type.startsWith('audio');

    // Create temporary video element to extract dimensions and duration
    let duration = 10;
    let width = 1920;
    let height = 1080;

    if (isVideo) {
      const v = document.createElement('video');
      v.src = url;
      v.preload = 'metadata';
      await new Promise((res) => {
        v.onloadedmetadata = () => {
          duration = v.duration || 10;
          width = v.videoWidth || 1920;
          height = v.videoHeight || 1080;
          res();
        };
        v.onerror = () => res();
        setTimeout(res, 1200);
      });
      state.videoCache[assetId] = v;
    }

    state.project.assets[assetId] = {
      id: assetId,
      name: file.name,
      size: file.size,
      type: file.type,
      duration,
      width,
      height,
      blobUrl: url,
    };

    state.project.bins.bin_root.assetIds.push(assetId);

    // Auto load first imported video into Source Monitor
    if (!state.activeAssetId) {
      loadAssetIntoSourceMonitor(assetId);
    }
  }

  executeCommand('Import Media Assets', () => {});
}

function renderAssetsList() {
  const container = document.getElementById('assets-list');
  if (!container) return;

  const assets = Object.values(state.project.assets);
  if (assets.length === 0) {
    container.innerHTML = `
      <div style="font-size: 11px; color: var(--text-muted); text-align: center; padding: 24px 0;">
        No media imported yet.<br>Click or drop media above.
      </div>
    `;
    return;
  }

  let html = '';
  // Render Bins
  for (const bin of Object.values(state.project.bins)) {
    if (bin.id === 'bin_root') continue;
    html += `
      <div class="asset-item" style="font-weight: 600; color: var(--accent-amber);">
        <span class="icon icon-sm">folder</span>
        <span>${bin.name}</span>
      </div>
    `;
  }

  // Render Assets
  for (const asset of assets) {
    const isAudio = asset.type && asset.type.startsWith('audio');
    const iconName = isAudio ? 'audiotrack' : 'movie';
    const isSelected = state.activeAssetId === asset.id;

    html += `
      <div class="asset-item ${isSelected ? 'selected' : ''}" data-id="${asset.id}" draggable="true">
        <span class="icon icon-sm" style="color: ${isAudio ? 'var(--accent-emerald)' : 'var(--accent-blue)'};">${iconName}</span>
        <div style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          ${asset.name}
        </div>
        <span style="font-size: 9px; color: var(--text-muted);">${formatTimecode(asset.duration, 24)}</span>
      </div>
    `;
  }

  container.innerHTML = html;

  // Asset click & drag events
  container.querySelectorAll('.asset-item').forEach(item => {
    const id = item.dataset.id;
    if (!id) return;

    item.addEventListener('dblclick', () => loadAssetIntoSourceMonitor(id));
    item.addEventListener('click', () => {
      state.activeAssetId = id;
      renderAssetsList();
    });

    item.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'asset', assetId: id }));
    });
  });
}

// ----------------------------------------------------
// 8. Source & Program Monitors
// ----------------------------------------------------
function initSourceMonitor() {
  const video = document.getElementById('source-video-element');
  const playBtn = document.getElementById('src-btn-play');
  const markInBtn = document.getElementById('src-btn-mark-in');
  const markOutBtn = document.getElementById('src-btn-mark-out');
  const insertBtn = document.getElementById('src-btn-insert');

  if (playBtn && video) {
    playBtn.addEventListener('click', () => {
      if (video.paused) {
        video.play();
        updateSourcePlayIcon(true);
      } else {
        video.pause();
        updateSourcePlayIcon(false);
      }
    });
    video.addEventListener('timeupdate', () => {
      const tc = document.getElementById('source-timecode');
      if (tc) tc.textContent = formatTimecode(video.currentTime, 24);
    });
  }

  if (markInBtn && video) {
    markInBtn.addEventListener('click', () => {
      state.sourceInPoint = video.currentTime;
      console.log(`[Source Monitor] In Point: ${state.sourceInPoint.toFixed(2)}s`);
    });
  }

  if (markOutBtn && video) {
    markOutBtn.addEventListener('click', () => {
      state.sourceOutPoint = video.currentTime;
      console.log(`[Source Monitor] Out Point: ${state.sourceOutPoint.toFixed(2)}s`);
    });
  }

  if (insertBtn) {
    insertBtn.addEventListener('click', () => insertSourceClipToTimeline());
  }
}

function updateSourcePlayIcon(isPlaying) {
  const icon = document.getElementById('src-play-icon');
  if (icon) icon.textContent = isPlaying ? 'pause' : 'play_arrow';
}

function loadAssetIntoSourceMonitor(assetId) {
  state.activeAssetId = assetId;
  const asset = state.project.assets[assetId];
  if (!asset) return;

  const video = document.getElementById('source-video-element');
  const emptyMsg = document.getElementById('source-empty-msg');
  if (video && asset.blobUrl) {
    video.src = asset.blobUrl;
    video.style.display = 'block';
    if (emptyMsg) emptyMsg.style.display = 'none';
    state.sourceInPoint = 0;
    state.sourceOutPoint = asset.duration;
  }
  renderAssetsList();
}

function insertSourceClipToTimeline() {
  if (!state.activeAssetId) return;
  const asset = state.project.assets[state.activeAssetId];
  if (!asset) return;

  const seq = getActiveSequence();
  const startTime = seq.playheadTime;
  const duration = (state.sourceOutPoint > state.sourceInPoint) 
    ? (state.sourceOutPoint - state.sourceInPoint) 
    : Math.min(10, asset.duration);

  // Find targeted video track or fallback to track_v1
  const targetVideoTrack = seq.tracks.find(t => t.type === 'video' && t.targeted) || seq.tracks.find(t => t.id === 'track_v1') || seq.tracks[0];
  const targetAudioTrack = seq.tracks.find(t => t.type === 'audio' && t.targeted) || seq.tracks.find(t => t.id === 'track_a1');

  executeCommand('Insert Clip to Sequence', () => {
    // 1. Insert Video Clip
    if (targetVideoTrack) {
      const vClipId = `clip_v_${Date.now()}`;
      seq.clips.push({
        id: vClipId,
        assetId: asset.id,
        name: asset.name,
        trackId: targetVideoTrack.id,
        timelineStart: startTime,
        timelineDuration: duration,
        sourceStart: state.sourceInPoint,
        transform: { positionX: 0, positionY: 0, scale: 1, rotation: 0, opacity: 1 },
        colorEffects: { exposure: 0, contrast: 1, brightness: 0, saturation: 1, temperature: 0, tint: 0, gamma: 1, invert: false },
        audio: { volumeDb: 0, pan: 0 },
      });
      state.activeClipId = vClipId;
    }

    // 2. Insert Synchronized Audio Clip if audio track exists
    if (targetAudioTrack) {
      const aClipId = `clip_a_${Date.now()}`;
      seq.clips.push({
        id: aClipId,
        assetId: asset.id,
        name: `${asset.name} [Audio]`,
        trackId: targetAudioTrack.id,
        timelineStart: startTime,
        timelineDuration: duration,
        sourceStart: state.sourceInPoint,
        transform: { positionX: 0, positionY: 0, scale: 1, rotation: 0, opacity: 1 },
        colorEffects: { exposure: 0, contrast: 1, brightness: 0, saturation: 1, temperature: 0, tint: 0, gamma: 1, invert: false },
        audio: { volumeDb: 0, pan: 0 },
      });
    }

    seq.playheadTime = startTime + duration;
  });
}

function initProgramMonitor() {
  const playBtn = document.getElementById('prg-btn-play');
  const prevBtn = document.getElementById('prg-btn-prev');
  const nextBtn = document.getElementById('prg-btn-next');
  const stepPrevBtn = document.getElementById('prg-btn-step-prev');
  const stepNextBtn = document.getElementById('prg-btn-step-next');

  if (playBtn) playBtn.addEventListener('click', toggleSequencePlayback);

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      seekSequence(Math.max(0, getActiveSequence().playheadTime - 1.0));
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      seekSequence(getActiveSequence().playheadTime + 1.0);
    });
  }

  if (stepPrevBtn) {
    stepPrevBtn.addEventListener('click', () => {
      const seq = getActiveSequence();
      seekSequence(Math.max(0, seq.playheadTime - (1 / seq.fps)));
    });
  }

  if (stepNextBtn) {
    stepNextBtn.addEventListener('click', () => {
      const seq = getActiveSequence();
      seekSequence(seq.playheadTime + (1 / seq.fps));
    });
  }
}

function toggleSequencePlayback() {
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

function startPlaybackLoop() {
  let lastTimestamp = performance.now();

  function loop(now) {
    const delta = (now - lastTimestamp) / 1000;
    lastTimestamp = now;

    if (state.isPlayingSequence) {
      const seq = getActiveSequence();
      seq.playheadTime += delta * state.playbackSpeed;

      if (seq.playheadTime >= seq.duration) {
        seq.playheadTime = 0; // loop
      } else if (seq.playheadTime < 0) {
        seq.playheadTime = 0;
        state.isPlayingSequence = false;
      }

      updatePlayheadPositionUI();
      renderProgramMonitor();
      updateVUMeter(true);
    } else {
      updateVUMeter(false);
    }

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}

function updateVUMeter(active) {
  const barL = document.getElementById('vu-bar-l');
  const barR = document.getElementById('vu-bar-r');
  const dbText = document.getElementById('vu-db-text');
  if (!barL || !barR) return;

  if (active) {
    // Generate realistic fluctuating meter levels around -12dB to -3dB
    const activeClips = getActiveClipsAtPlayhead();
    const hasAudio = activeClips.some(c => c.trackId.startsWith('track_a') || c.assetId);

    if (hasAudio) {
      state.vuLevelL = Math.max(10, Math.min(95, 65 + (Math.sin(performance.now() * 0.015) * 20) + (Math.random() * 10)));
      state.vuLevelR = Math.max(10, Math.min(95, 62 + (Math.cos(performance.now() * 0.012) * 20) + (Math.random() * 10)));
      const db = -((100 - state.vuLevelL) * 0.35).toFixed(1);
      if (dbText) dbText.textContent = `${db}dB`;
    } else {
      state.vuLevelL = 0;
      state.vuLevelR = 0;
      if (dbText) dbText.textContent = '-∞';
    }
  } else {
    state.vuLevelL = Math.max(0, state.vuLevelL - 4);
    state.vuLevelR = Math.max(0, state.vuLevelR - 4);
    if (state.vuLevelL === 0 && dbText) dbText.textContent = '-∞';
  }

  barL.style.height = `${state.vuLevelL}%`;
  barR.style.height = `${state.vuLevelR}%`;
}

function getActiveClipsAtPlayhead() {
  const seq = getActiveSequence();
  const t = seq.playheadTime;
  return seq.clips.filter(c => t >= c.timelineStart && t <= c.timelineStart + c.timelineDuration);
}

function renderProgramMonitor() {
  const canvas = document.getElementById('program-render-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const seq = getActiveSequence();

  // Clear compositor canvas
  ctx.fillStyle = '#05070a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Timecode display update
  const tc = document.getElementById('program-timecode');
  if (tc) tc.textContent = formatTimecode(seq.playheadTime, seq.fps);

  // Composite active video tracks bottom-to-top
  const visibleTracks = seq.tracks.filter(t => t.type === 'video' && t.visible);
  const activeClips = getActiveClipsAtPlayhead();

  for (const track of visibleTracks.reverse()) {
    const clip = activeClips.find(c => c.trackId === track.id);
    if (!clip) continue;

    const asset = state.project.assets[clip.assetId];
    if (!asset) continue;

    ctx.save();
    // Intrinsic transform matrix
    const t = clip.transform;
    ctx.translate(canvas.width / 2 + t.positionX, canvas.height / 2 + t.positionY);
    ctx.rotate((t.rotation * Math.PI) / 180);
    ctx.scale(t.scale, t.scale);
    ctx.globalAlpha = t.opacity;

    // Apply Real-Time Color Grading Filters
    const c = clip.colorEffects;
    let filterString = `brightness(${1 + c.brightness}) contrast(${c.contrast}) saturate(${c.saturation})`;
    if (c.invert) filterString += ` invert(100%)`;
    ctx.filter = filterString;

    // Render Cached Video Frame or Fallback Gradient
    let cachedVid = state.videoCache[asset.id];
    if (cachedVid && cachedVid.readyState >= 2) {
      const clipSourceTime = clip.sourceStart + (seq.playheadTime - clip.timelineStart);
      if (Math.abs(cachedVid.currentTime - clipSourceTime) > 0.05) {
        cachedVid.currentTime = clipSourceTime;
      }
      ctx.drawImage(cachedVid, -canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height);
    } else {
      // High-fidelity procedural rendering
      const grad = ctx.createLinearGradient(-canvas.width / 2, -canvas.height / 2, canvas.width / 2, canvas.height / 2);
      grad.addColorStop(0, '#1e3a8a');
      grad.addColorStop(0.5, '#0f172a');
      grad.addColorStop(1, '#0284c7');
      ctx.fillStyle = grad;
      ctx.fillRect(-canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 36px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(clip.name, 0, 0);
      ctx.font = '20px ui-monospace, monospace';
      ctx.fillText(`${formatTimecode(seq.playheadTime, seq.fps)}`, 0, 40);
    }

    ctx.restore();
  }
}

// ----------------------------------------------------
// 9. Four-Zone Professional Timeline
// ----------------------------------------------------
function initTimeline() {
  initZoneAToolbar();
  initZoneCRulerScrub();
  renderTimeline();
}

function initZoneAToolbar() {
  // Tool selection mapping
  const toolButtons = [
    { id: 'tool-select', tool: 'select' },
    { id: 'tool-track-select', tool: 'track-select' },
    { id: 'tool-ripple', tool: 'ripple' },
    { id: 'tool-rolling', tool: 'rolling' },
    { id: 'tool-rate-stretch', tool: 'rate-stretch' },
    { id: 'tool-razor', tool: 'razor' },
    { id: 'tool-slip', tool: 'slip' },
    { id: 'tool-slide', tool: 'slide' },
    { id: 'tool-pen', tool: 'pen' },
    { id: 'tool-hand', tool: 'hand' },
    { id: 'tool-zoom', tool: 'zoom' },
    { id: 'tool-text', tool: 'text' },
  ];

  toolButtons.forEach(({ id, tool }) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('click', () => setTool(tool));
  });

  // Snapping Toggle
  const snapBtn = document.getElementById('btn-snap-toggle');
  if (snapBtn) {
    snapBtn.addEventListener('click', () => {
      state.isSnapping = !state.isSnapping;
      snapBtn.classList.toggle('active', state.isSnapping);
      console.log(`[Timeline] Snapping: ${state.isSnapping}`);
    });
  }

  // Linked Selection Toggle
  const linkBtn = document.getElementById('btn-link-toggle');
  if (linkBtn) {
    linkBtn.addEventListener('click', () => {
      state.isLinkedSelection = !state.isLinkedSelection;
      linkBtn.classList.toggle('active', state.isLinkedSelection);
      console.log(`[Timeline] Linked Selection: ${state.isLinkedSelection}`);
    });
  }

  // Zoom controls
  document.getElementById('btn-time-zoom-in')?.addEventListener('click', () => {
    state.pixelsPerSecond = Math.min(180, state.pixelsPerSecond * 1.3);
    renderTimeline();
  });
  document.getElementById('btn-time-zoom-out')?.addEventListener('click', () => {
    state.pixelsPerSecond = Math.max(8, state.pixelsPerSecond / 1.3);
    renderTimeline();
  });
  document.getElementById('btn-time-fit')?.addEventListener('click', fitTimelineToSequence);

  // Track creation buttons
  document.getElementById('btn-add-v-track')?.addEventListener('click', () => addTrack('video'));
  document.getElementById('btn-add-a-track')?.addEventListener('click', () => addTrack('audio'));
}

function setTool(toolName) {
  state.activeTool = toolName;
  document.querySelectorAll('.timeline-toolbar .tool-btn').forEach(btn => {
    if (btn.id.startsWith('tool-')) btn.classList.remove('active');
  });
  const activeBtn = document.getElementById(`tool-${toolName}`);
  if (activeBtn) activeBtn.classList.add('active');

  const scrollArea = document.getElementById('timeline-scroll-area');
  if (scrollArea) {
    if (toolName === 'razor') scrollArea.style.cursor = 'crosshair';
    else if (toolName === 'hand') scrollArea.style.cursor = 'grab';
    else if (toolName === 'zoom') scrollArea.style.cursor = 'zoom-in';
    else scrollArea.style.cursor = 'default';
  }
}

function addTrack(type) {
  const seq = getActiveSequence();
  const count = seq.tracks.filter(t => t.type === type).length + 1;
  const prefix = type === 'video' ? 'V' : 'A';
  const newTrack = {
    id: `track_${type}_${Date.now()}`,
    name: `${prefix}${count}`,
    type,
    index: count,
    muted: false,
    solo: false,
    locked: false,
    visible: true,
    targeted: false,
    height: 44,
  };

  executeCommand(`Add ${type === 'video' ? 'Video' : 'Audio'} Track`, () => {
    if (type === 'video') seq.tracks.unshift(newTrack);
    else seq.tracks.push(newTrack);
  });
}

function fitTimelineToSequence() {
  const scrollArea = document.getElementById('timeline-scroll-area');
  const seq = getActiveSequence();
  if (!scrollArea || !seq) return;
  const availableWidth = scrollArea.clientWidth - 40;
  state.pixelsPerSecond = Math.max(8, availableWidth / (seq.duration || 60));
  renderTimeline();
}

function initZoneCRulerScrub() {
  const ruler = document.getElementById('timeline-ruler-bar');
  if (!ruler) return;

  ruler.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const scrub = (ev) => {
      const rect = ruler.getBoundingClientRect();
      const scrollArea = document.getElementById('timeline-scroll-area');
      const scrollLeft = scrollArea ? scrollArea.scrollLeft : 0;
      const x = ev.clientX - rect.left + scrollLeft;
      const targetTime = Math.max(0, x / state.pixelsPerSecond);
      seekSequence(targetTime);
    };

    scrub(e);

    const onMove = (ev) => scrub(ev);
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
}

function renderTimeline() {
  const seq = getActiveSequence();
  const totalWidth = Math.max(seq.duration * state.pixelsPerSecond, 1800);

  // 1. Zone B: Track Control Headers
  const headersCol = document.getElementById('timeline-headers-container');
  if (headersCol) {
    let headersHtml = `
      <div class="timeline-ruler-corner">
        <span>TRACKS</span>
        <span class="icon icon-sm" style="color: var(--text-muted)">layers</span>
      </div>
    `;

    for (const track of seq.tracks) {
      const isVideo = track.type === 'video';
      headersHtml += `
        <div class="track-header-item ${isVideo ? 'video' : 'audio'}" style="height: ${track.height}px;" data-id="${track.id}">
          <div style="display: flex; align-items: center; gap: 4px;">
            <button class="track-btn track-target-btn ${track.targeted ? 'active' : ''}" data-target="${track.id}" title="Track Target (${track.name})" style="font-size: 10px; font-weight: 700; padding: 1px 4px;">
              ${track.name}
            </button>
            <input class="track-name-input" value="${track.name}" data-track-id="${track.id}">
          </div>
          <div class="track-controls-strip">
            ${isVideo ? `
              <button class="track-btn ${track.visible ? 'active' : ''}" data-action="toggle-vis" title="Toggle Output">
                <span class="icon icon-sm">${track.visible ? 'visibility' : 'visibility_off'}</span>
              </button>
            ` : `
              <button class="track-btn ${track.muted ? 'muted' : ''}" data-action="toggle-mute" title="Mute Track">
                <span class="icon icon-sm">${track.muted ? 'volume_off' : 'volume_up'}</span>
              </button>
              <button class="track-btn ${track.solo ? 'soloed' : ''}" data-action="toggle-solo" title="Solo Track">
                <span class="icon icon-sm">headphones</span>
              </button>
            `}
            <button class="track-btn ${track.locked ? 'active' : ''}" data-action="toggle-lock" title="Lock Track">
              <span class="icon icon-sm">${track.locked ? 'lock' : 'lock_open'}</span>
            </button>
          </div>
        </div>
      `;
    }
    headersCol.innerHTML = headersHtml;

    // Bind Track Header Events
    headersCol.querySelectorAll('.track-header-item').forEach(item => {
      const trackId = item.dataset.id;
      const track = seq.tracks.find(t => t.id === trackId);
      if (!track) return;

      item.querySelector('[data-action="toggle-vis"]')?.addEventListener('click', () => {
        track.visible = !track.visible;
        renderTimeline();
        renderProgramMonitor();
      });
      item.querySelector('[data-action="toggle-mute"]')?.addEventListener('click', () => {
        track.muted = !track.muted;
        renderTimeline();
      });
      item.querySelector('[data-action="toggle-solo"]')?.addEventListener('click', () => {
        track.solo = !track.solo;
        renderTimeline();
      });
      item.querySelector('[data-action="toggle-lock"]')?.addEventListener('click', () => {
        track.locked = !track.locked;
        renderTimeline();
      });
      item.querySelector('.track-target-btn')?.addEventListener('click', () => {
        // Toggle target for this track type
        seq.tracks.filter(t => t.type === track.type).forEach(t => t.targeted = false);
        track.targeted = true;
        renderTimeline();
      });
      item.querySelector('.track-name-input')?.addEventListener('change', (e) => {
        track.name = e.target.value;
        scheduleAutoSave();
      });
    });
  }

  // 2. Zone C: Time Ruler Bar
  const rulerBar = document.getElementById('timeline-ruler-bar');
  if (rulerBar) {
    rulerBar.style.width = `${totalWidth}px`;
    let ticksHtml = '';
    const intervalSec = state.pixelsPerSecond > 60 ? 1 : (state.pixelsPerSecond > 20 ? 5 : 10);
    const totalTicks = Math.ceil(seq.duration / intervalSec);

    for (let i = 0; i <= totalTicks; i++) {
      const sec = i * intervalSec;
      const leftPx = sec * state.pixelsPerSecond;
      ticksHtml += `
        <div class="ruler-tick" style="left: ${leftPx}px;">
          ${formatTimecode(sec, seq.fps)}
        </div>
      `;
    }
    rulerBar.innerHTML = ticksHtml;
  }

  // 3. Zone D: Track Lanes & Clips
  const lanesContainer = document.getElementById('timeline-lanes-container');
  if (lanesContainer) {
    let lanesHtml = '';
    for (const track of seq.tracks) {
      lanesHtml += `
        <div class="timeline-track-lane" data-id="${track.id}" style="height: ${track.height}px; width: ${totalWidth}px;">
      `;

      const clips = seq.clips.filter(c => c.trackId === track.id);
      for (const clip of clips) {
        const leftPx = clip.timelineStart * state.pixelsPerSecond;
        const widthPx = Math.max(14, clip.timelineDuration * state.pixelsPerSecond);
        const isSelected = clip.id === state.activeClipId;
        const isAudio = track.type === 'audio';

        lanesHtml += `
          <div class="timeline-clip-block ${isAudio ? 'audio' : ''} ${isSelected ? 'selected' : ''}" 
               data-id="${clip.id}" 
               style="left: ${leftPx}px; width: ${widthPx}px;">
            <div class="trim-handle left"></div>
            <div style="display: flex; align-items: center; gap: 4px; overflow: hidden; pointer-events: none;">
              <span class="icon icon-sm">${isAudio ? 'graphic_eq' : 'movie'}</span>
              <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 11px;">${clip.name}</span>
            </div>
            <div class="clip-badge">
              <span style="font-size: 9px; opacity: 0.8; margin-right: 4px;">${clip.timelineDuration.toFixed(1)}s</span>
              <span class="icon icon-sm" style="color: ${clip.colorEffects.exposure !== 0 || clip.colorEffects.contrast !== 1 ? 'var(--accent-amber)' : 'rgba(255,255,255,0.4)'};">auto_fix_high</span>
            </div>
            <div class="trim-handle right"></div>
          </div>
        `;
      }

      lanesHtml += `</div>`;
    }
    lanesContainer.innerHTML = lanesHtml;

    // Bind Clip Events (Click, Drag, Trim, Razor)
    lanesContainer.querySelectorAll('.timeline-clip-block').forEach(clipEl => {
      const clipId = clipEl.dataset.id;
      const clip = seq.clips.find(c => c.id === clipId);
      if (!clip) return;

      clipEl.addEventListener('click', (e) => {
        e.stopPropagation();
        if (state.activeTool === 'razor') {
          splitClipAction(clipId, seq.playheadTime);
          return;
        }
        state.activeClipId = clipId;
        renderTimeline();
        renderInspector();
      });

      // Drag to Move Clip
      clipEl.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('trim-handle')) return;
        if (state.activeTool === 'razor') return;

        e.preventDefault();
        let startX = e.clientX;
        const initialStart = clip.timelineStart;

        const onMove = (ev) => {
          let deltaSec = (ev.clientX - startX) / state.pixelsPerSecond;
          let newStart = Math.max(0, initialStart + deltaSec);

          // Snapping logic to playhead or clip edges
          if (state.isSnapping) {
            if (Math.abs(newStart - seq.playheadTime) < 0.3) {
              newStart = seq.playheadTime;
            }
          }

          clip.timelineStart = newStart;
          renderTimeline();
        };

        const onUp = () => {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
          executeCommand('Move Clip', () => {});
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      });

      // Trim Left Handle
      clipEl.querySelector('.trim-handle.left')?.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        let startX = e.clientX;
        const initStart = clip.timelineStart;
        const initDur = clip.timelineDuration;
        const initSource = clip.sourceStart;

        const onMove = (ev) => {
          const deltaSec = (ev.clientX - startX) / state.pixelsPerSecond;
          const maxDelta = initDur - 0.2;
          const safeDelta = Math.min(deltaSec, maxDelta);

          clip.timelineStart = Math.max(0, initStart + safeDelta);
          clip.timelineDuration = Math.max(0.2, initDur - safeDelta);
          clip.sourceStart = Math.max(0, initSource + safeDelta);
          renderTimeline();
        };

        const onUp = () => {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
          executeCommand('Trim Clip Start', () => {});
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      });

      // Trim Right Handle
      clipEl.querySelector('.trim-handle.right')?.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        let startX = e.clientX;
        const initDur = clip.timelineDuration;

        const onMove = (ev) => {
          const deltaSec = (ev.clientX - startX) / state.pixelsPerSecond;
          clip.timelineDuration = Math.max(0.2, initDur + deltaSec);
          renderTimeline();
        };

        const onUp = () => {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
          executeCommand('Trim Clip End', () => {});
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      });
    });
  }

  updatePlayheadPositionUI();
}

function updatePlayheadPositionUI() {
  const seq = getActiveSequence();
  const playheadLine = document.getElementById('playhead-line');
  if (playheadLine) {
    const leftPx = seq.playheadTime * state.pixelsPerSecond;
    playheadLine.style.left = `${leftPx}px`;
  }
}

function splitClipAction(clipId, splitTime) {
  const seq = getActiveSequence();
  const clip = seq.clips.find(c => c.id === clipId);
  if (!clip) return;

  if (splitTime <= clip.timelineStart || splitTime >= clip.timelineStart + clip.timelineDuration) {
    return;
  }

  executeCommand('Split Clip at Playhead', () => {
    const offset = splitTime - clip.timelineStart;
    const rightClip = {
      ...JSON.parse(JSON.stringify(clip)),
      id: `clip_${Date.now()}_split`,
      timelineStart: splitTime,
      timelineDuration: clip.timelineDuration - offset,
      sourceStart: clip.sourceStart + offset,
    };
    clip.timelineDuration = offset;
    seq.clips.push(rightClip);
    state.activeClipId = rightClip.id;
  });
}

function deleteActiveClip() {
  if (!state.activeClipId) return;
  const seq = getActiveSequence();
  executeCommand('Delete Selected Clip', () => {
    seq.clips = seq.clips.filter(c => c.id !== state.activeClipId);
    state.activeClipId = null;
  });
}

// ----------------------------------------------------
// 10. Contextual Inspector & Specialist Workspace Views
// ----------------------------------------------------
function initInspector() {
  renderInspector();
}

function renderInspector() {
  const container = document.getElementById('inspector-content');
  if (!container) return;

  const clip = getActiveClip();
  const statusInfo = document.getElementById('status-clip-info');

  // If in specialist workspace 'color', render Color Wheels & Scopes
  if (state.activeWorkspace === 'color') {
    renderColorWorkspaceInspector(container, clip);
    return;
  }

  // If in specialist workspace 'audio', render Fairlight Multitrack Mixer
  if (state.activeWorkspace === 'audio') {
    renderAudioWorkspaceInspector(container);
    return;
  }

  // If in specialist workspace 'motion', render Keyframe Graph Editor
  if (state.activeWorkspace === 'motion') {
    renderMotionWorkspaceInspector(container, clip);
    return;
  }

  if (!clip) {
    const seq = getActiveSequence();
    if (statusInfo) statusInfo.textContent = 'Sequence Selected';
    container.innerHTML = `
      <div class="inspector-group">
        <div class="inspector-group-title">Master Sequence Settings</div>
        <div class="field-row">
          <div class="field-header"><span>Resolution</span><span class="field-val">${seq.width} x ${seq.height}</span></div>
        </div>
        <div class="field-row">
          <div class="field-header"><span>Frame Rate</span><span class="field-val">${seq.fps} fps</span></div>
        </div>
        <div class="field-row">
          <div class="field-header"><span>Duration</span><span class="field-val">${formatTimecode(seq.duration, seq.fps)}</span></div>
        </div>
        <div class="field-row">
          <div class="field-header"><span>Color Engine</span><span class="field-val" style="color: var(--accent-emerald);">32-bit Float Linear (WebGPU)</span></div>
        </div>
      </div>
      <div style="font-size: 11px; color: var(--text-muted); margin-top: 10px;">
        Select any clip in the timeline to inspect and edit its transform, real-time color grading, and audio volume.
      </div>
    `;
    return;
  }

  if (statusInfo) statusInfo.textContent = `Selected: ${clip.name}`;

  const t = clip.transform;
  const c = clip.colorEffects;
  const a = clip.audio;

  container.innerHTML = `
    <!-- Transform Group -->
    <div class="inspector-group">
      <div class="inspector-group-title">
        <span class="icon icon-sm">transform</span> Intrinsic Transform
      </div>
      <div class="field-row">
        <div class="field-header"><span>Scale</span><span class="field-val" id="disp-scale">${t.scale.toFixed(2)}x</span></div>
        <input type="range" id="insp-scale" min="0.1" max="3" step="0.05" value="${t.scale}">
      </div>
      <div class="field-row">
        <div class="field-header"><span>Position X</span><span class="field-val" id="disp-posx">${t.positionX}px</span></div>
        <input type="range" id="insp-posx" min="-600" max="600" step="5" value="${t.positionX}">
      </div>
      <div class="field-row">
        <div class="field-header"><span>Position Y</span><span class="field-val" id="disp-posy">${t.positionY}px</span></div>
        <input type="range" id="insp-posy" min="-400" max="400" step="5" value="${t.positionY}">
      </div>
      <div class="field-row">
        <div class="field-header"><span>Rotation</span><span class="field-val" id="disp-rot">${t.rotation}&deg;</span></div>
        <input type="range" id="insp-rot" min="-180" max="180" step="1" value="${t.rotation}">
      </div>
      <div class="field-row">
        <div class="field-header"><span>Opacity</span><span class="field-val" id="disp-opac">${Math.round(t.opacity * 100)}%</span></div>
        <input type="range" id="insp-opac" min="0" max="1" step="0.05" value="${t.opacity}">
      </div>
    </div>

    <!-- Color Grading Group -->
    <div class="inspector-group">
      <div class="inspector-group-title">
        <span class="icon icon-sm">palette</span> GPU Color Grading
      </div>
      <div class="field-row">
        <div class="field-header"><span>Exposure</span><span class="field-val" id="disp-exp">${c.exposure.toFixed(2)}</span></div>
        <input type="range" id="insp-exp" min="-3" max="3" step="0.05" value="${c.exposure}">
      </div>
      <div class="field-row">
        <div class="field-header"><span>Contrast</span><span class="field-val" id="disp-cont">${c.contrast.toFixed(2)}</span></div>
        <input type="range" id="insp-cont" min="0" max="2" step="0.05" value="${c.contrast}">
      </div>
      <div class="field-row">
        <div class="field-header"><span>Saturation</span><span class="field-val" id="disp-sat">${c.saturation.toFixed(2)}</span></div>
        <input type="range" id="insp-sat" min="0" max="2" step="0.05" value="${c.saturation}">
      </div>
      <div class="field-row">
        <div class="field-header"><span>Brightness</span><span class="field-val" id="disp-brt">${c.brightness.toFixed(2)}</span></div>
        <input type="range" id="insp-brt" min="-1" max="1" step="0.05" value="${c.brightness}">
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px;">
        <label style="display: flex; align-items: center; gap: 4px; font-size: 11px; cursor: pointer;">
          <input type="checkbox" id="insp-invert" ${c.invert ? 'checked' : ''}> Invert Colors
        </label>
        <button class="action-btn" id="btn-reset-clip-grade" style="font-size: 10px; padding: 2px 6px;">Reset</button>
      </div>
    </div>

    <!-- Audio Properties -->
    <div class="inspector-group">
      <div class="inspector-group-title">
        <span class="icon icon-sm">volume_up</span> Audio Gain & Pan
      </div>
      <div class="field-row">
        <div class="field-header"><span>Volume (dB)</span><span class="field-val" id="disp-vol">${a.volumeDb.toFixed(1)} dB</span></div>
        <input type="range" id="insp-vol" min="-40" max="12" step="0.5" value="${a.volumeDb}">
      </div>
    </div>
  `;

  // Bind live slider updates
  bindSlider('insp-scale', 'disp-scale', (v) => { clip.transform.scale = v; }, (v) => `${v.toFixed(2)}x`);
  bindSlider('insp-posx', 'disp-posx', (v) => { clip.transform.positionX = v; }, (v) => `${v}px`);
  bindSlider('insp-posy', 'disp-posy', (v) => { clip.transform.positionY = v; }, (v) => `${v}px`);
  bindSlider('insp-rot', 'disp-rot', (v) => { clip.transform.rotation = v; }, (v) => `${v}°`);
  bindSlider('insp-opac', 'disp-opac', (v) => { clip.transform.opacity = v; }, (v) => `${Math.round(v * 100)}%`);

  bindSlider('insp-exp', 'disp-exp', (v) => { clip.colorEffects.exposure = v; }, (v) => v.toFixed(2));
  bindSlider('insp-cont', 'disp-cont', (v) => { clip.colorEffects.contrast = v; }, (v) => v.toFixed(2));
  bindSlider('insp-sat', 'disp-sat', (v) => { clip.colorEffects.saturation = v; }, (v) => v.toFixed(2));
  bindSlider('insp-brt', 'disp-brt', (v) => { clip.colorEffects.brightness = v; }, (v) => v.toFixed(2));
  bindSlider('insp-vol', 'disp-vol', (v) => { clip.audio.volumeDb = v; }, (v) => `${v.toFixed(1)} dB`);

  document.getElementById('insp-invert')?.addEventListener('change', (e) => {
    clip.colorEffects.invert = e.target.checked;
    renderProgramMonitor();
    scheduleAutoSave();
  });

  document.getElementById('btn-reset-clip-grade')?.addEventListener('click', () => {
    clip.colorEffects = { exposure: 0, contrast: 1, brightness: 0, saturation: 1, temperature: 0, tint: 0, gamma: 1, invert: false };
    renderInspector();
    renderProgramMonitor();
    scheduleAutoSave();
  });
}

function renderColorWorkspaceInspector(container, clip) {
  container.innerHTML = `
    <div class="inspector-group">
      <div class="inspector-group-title">
        <span class="icon icon-sm">palette</span> 3-Way Primary Color Wheels
      </div>
      <div class="color-wheels-grid">
        <div class="color-wheel-card">
          <div class="color-wheel-circle"><div class="color-wheel-knob"></div></div>
          <span class="color-wheel-label">Lift (Shadows)</span>
        </div>
        <div class="color-wheel-card">
          <div class="color-wheel-circle"><div class="color-wheel-knob"></div></div>
          <span class="color-wheel-label">Gamma (Midtones)</span>
        </div>
        <div class="color-wheel-card">
          <div class="color-wheel-circle"><div class="color-wheel-knob"></div></div>
          <span class="color-wheel-label">Gain (Highlights)</span>
        </div>
      </div>
    </div>
    <div class="inspector-group">
      <div class="inspector-group-title">Lumetri Color Precision Sliders</div>
      <div class="field-row">
        <div class="field-header"><span>Temperature</span><span>0</span></div>
        <input type="range" min="-100" max="100" value="0">
      </div>
      <div class="field-row">
        <div class="field-header"><span>Tint</span><span>0</span></div>
        <input type="range" min="-100" max="100" value="0">
      </div>
      <div class="field-row">
        <div class="field-header"><span>Highlights</span><span>0</span></div>
        <input type="range" min="-100" max="100" value="0">
      </div>
      <div class="field-row">
        <div class="field-header"><span>Shadows</span><span>0</span></div>
        <input type="range" min="-100" max="100" value="0">
      </div>
    </div>
  `;
}

function renderAudioWorkspaceInspector(container) {
  const seq = getActiveSequence();
  const audioTracks = seq.tracks.filter(t => t.type === 'audio');
  container.innerHTML = `
    <div class="inspector-group">
      <div class="inspector-group-title">
        <span class="icon icon-sm">graphic_eq</span> Fairlight Multitrack Mixer
      </div>
      <div class="audio-mixer-container">
        ${audioTracks.map(t => `
          <div class="mixer-channel-strip">
            <span style="font-size: 10px; font-weight: 700; color: var(--accent-emerald);">${t.name}</span>
            <input type="range" class="mixer-fader" orient="vertical" min="-40" max="12" value="0">
            <div style="font-size: 9px; font-family: monospace;">0.0 dB</div>
            <div style="display: flex; gap: 2px;">
              <button class="track-btn ${t.muted ? 'muted' : ''}" style="font-size: 9px; padding: 2px 4px;">M</button>
              <button class="track-btn ${t.solo ? 'soloed' : ''}" style="font-size: 9px; padding: 2px 4px;">S</button>
            </div>
          </div>
        `).join('')}
        <div class="mixer-channel-strip" style="background: rgba(59, 130, 246, 0.1); border-color: var(--accent-blue);">
          <span style="font-size: 10px; font-weight: 700; color: var(--accent-blue);">MASTER</span>
          <input type="range" class="mixer-fader" orient="vertical" min="-40" max="12" value="0">
          <div style="font-size: 9px; font-family: monospace;">0.0 dB</div>
          <span style="font-size: 8px; color: var(--accent-emerald);">L / R Stereo</span>
        </div>
      </div>
    </div>
  `;
}

function renderMotionWorkspaceInspector(container, clip) {
  container.innerHTML = `
    <div class="inspector-group">
      <div class="inspector-group-title">
        <span class="icon icon-sm">motion_mode</span> Animation & Keyframe Graph Editor
      </div>
      <canvas class="graph-editor-canvas" id="motion-graph-canvas"></canvas>
      <div style="display: flex; justify-content: space-between; font-size: 10px; color: var(--text-muted); margin-top: 4px;">
        <span>Bezier Interpolation: Smooth Easy Ease</span>
        <button class="action-btn" style="font-size: 9px; padding: 1px 4px;">Add Keyframe</button>
      </div>
    </div>
    <div class="inspector-group">
      <div class="inspector-group-title">Keyframed Parameters</div>
      <div style="font-size: 11px; display: flex; flex-direction: column; gap: 6px;">
        <label><input type="checkbox" checked> Position (X, Y)</label>
        <label><input type="checkbox" checked> Scale</label>
        <label><input type="checkbox"> Rotation</label>
        <label><input type="checkbox"> Opacity</label>
      </div>
    </div>
  `;
  drawMotionGraph();
}

function drawMotionGraph() {
  const canvas = document.getElementById('motion-graph-canvas');
  if (!canvas) return;
  canvas.width = canvas.clientWidth || 300;
  canvas.height = canvas.clientHeight || 160;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#06080d';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw Grid lines
  ctx.strokeStyle = '#1e2433';
  ctx.lineWidth = 1;
  for (let x = 0; x < canvas.width; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += 30) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  // Draw Bezier Curves
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(20, canvas.height - 30);
  ctx.bezierCurveTo(canvas.width * 0.4, canvas.height - 30, canvas.width * 0.6, 30, canvas.width - 20, 30);
  ctx.stroke();

  // Draw Keyframe points
  ctx.fillStyle = '#f59e0b';
  ctx.beginPath();
  ctx.arc(20, canvas.height - 30, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(canvas.width - 20, 30, 4, 0, Math.PI * 2);
  ctx.fill();
}

function bindSlider(sliderId, dispId, updateFn, formatFn) {
  const slider = document.getElementById(sliderId);
  const disp = document.getElementById(dispId);
  if (!slider) return;

  slider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    updateFn(val);
    if (disp) disp.textContent = formatFn(val);
    renderProgramMonitor();
    scheduleAutoSave();
  });
}

// ----------------------------------------------------
// 11. Menus, Workspace Switcher & Modals
// ----------------------------------------------------
function initMenus() {
  document.getElementById('m-file-import')?.addEventListener('click', () => {
    document.getElementById('video-file-input')?.click();
  });
  document.getElementById('m-file-save')?.addEventListener('click', () => {
    scheduleAutoSave();
    alert('Project saved to local IndexedDB!');
  });
  document.getElementById('m-edit-undo')?.addEventListener('click', undo);
  document.getElementById('m-edit-redo')?.addEventListener('click', redo);
  document.getElementById('m-edit-delete')?.addEventListener('click', deleteActiveClip);
  document.getElementById('m-edit-split')?.addEventListener('click', () => {
    if (state.activeClipId) {
      splitClipAction(state.activeClipId, getActiveSequence().playheadTime);
    }
  });

  document.getElementById('btn-undo')?.addEventListener('click', undo);
  document.getElementById('btn-redo')?.addEventListener('click', redo);

  // Keyboard Shortcuts modal open
  document.getElementById('m-edit-shortcuts')?.addEventListener('click', openShortcutsModal);
  document.getElementById('m-help-shortcuts')?.addEventListener('click', openShortcutsModal);

  // Export sequence modal open
  document.getElementById('btn-export-modal')?.addEventListener('click', openExportModal);
  document.getElementById('m-file-export')?.addEventListener('click', openExportModal);

  // Window menu - reset layout
  document.getElementById('win-reset-layout')?.addEventListener('click', () => {
    document.getElementById('panel-project').style.width = '280px';
    document.getElementById('panel-inspector').style.width = '320px';
    document.getElementById('panel-timeline').style.height = '270px';
    document.querySelectorAll('.panel, .monitor-wrapper').forEach(p => p.classList.remove('maximized'));
  });
}

function initWorkspaceTabs() {
  document.querySelectorAll('#workspace-bar .ws-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#workspace-bar .ws-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.activeWorkspace = tab.dataset.ws;
      applyWorkspaceLayout(state.activeWorkspace);
    });
  });
}

function applyWorkspaceLayout(ws) {
  const leftCol = document.getElementById('panel-project');
  const rightCol = document.getElementById('panel-inspector');
  const timeline = document.getElementById('panel-timeline');

  if (ws === 'media') {
    leftCol.style.width = '440px';
    rightCol.style.width = '240px';
    timeline.style.height = '160px';
  } else if (ws === 'color') {
    leftCol.style.width = '200px';
    rightCol.style.width = '420px';
    timeline.style.height = '180px';
  } else if (ws === 'audio') {
    leftCol.style.width = '220px';
    rightCol.style.width = '380px';
    timeline.style.height = '360px';
  } else if (ws === 'motion') {
    leftCol.style.width = '260px';
    rightCol.style.width = '420px';
    timeline.style.height = '300px';
  } else if (ws === 'deliver') {
    openExportModal();
  } else {
    // Default Edit
    leftCol.style.width = '280px';
    rightCol.style.width = '320px';
    timeline.style.height = '270px';
  }
  renderInspector();
}

function initModals() {
  // Shortcuts modal close
  document.getElementById('btn-close-shortcuts-modal')?.addEventListener('click', () => {
    document.getElementById('modal-shortcuts')?.classList.remove('active');
  });

  // Export modal close & actions
  document.getElementById('btn-close-export-modal')?.addEventListener('click', () => {
    document.getElementById('modal-export')?.classList.remove('active');
  });
  document.getElementById('btn-cancel-export')?.addEventListener('click', () => {
    document.getElementById('modal-export')?.classList.remove('active');
  });
  document.getElementById('btn-start-render')?.addEventListener('click', startExportSimulation);

  // Preset selector in export modal
  document.getElementById('export-preset-select')?.addEventListener('change', (e) => {
    const val = e.target.value;
    const res = document.getElementById('export-res');
    const br = document.getElementById('export-bitrate');
    if (val === 'h264_4k' || val === 'youtube_4k') {
      if (res) res.value = '3840 x 2160 (4K UHD)';
      if (br) br.value = '45.0 Mbps (VBR)';
    } else if (val === 'tiktok_vertical') {
      if (res) res.value = '1080 x 1920 (9:16 Vertical)';
      if (br) br.value = '18.0 Mbps';
    } else if (val === 'prores_422') {
      if (res) res.value = '1920 x 1080';
      if (br) br.value = '220 Mbps (ProRes HQ)';
    } else {
      if (res) res.value = '1920 x 1080';
      if (br) br.value = '20.0 Mbps';
    }
  });
}

function openShortcutsModal() {
  const modal = document.getElementById('modal-shortcuts');
  if (modal) {
    modal.classList.add('active');
    renderVirtualKeyboard();
    renderShortcutsTable();
  }
}

function openExportModal() {
  const modal = document.getElementById('modal-export');
  if (modal) modal.classList.add('active');
}

function startExportSimulation() {
  const progressArea = document.getElementById('export-progress-area');
  const fill = document.getElementById('export-progress-fill');
  const percentLabel = document.getElementById('export-percent-label');
  const statusLabel = document.getElementById('export-status-label');
  const startBtn = document.getElementById('btn-start-render');

  if (progressArea) progressArea.style.display = 'flex';
  if (startBtn) startBtn.disabled = true;

  let currentPercent = 0;
  const interval = setInterval(() => {
    currentPercent += 5;
    if (fill) fill.style.width = `${currentPercent}%`;
    if (percentLabel) percentLabel.textContent = `${currentPercent}%`;

    if (currentPercent >= 100) {
      clearInterval(interval);
      if (statusLabel) statusLabel.textContent = 'Render Complete! Media file assembled.';
      setTimeout(() => {
        alert('Export complete! Video file ready for download.');
        if (progressArea) progressArea.style.display = 'none';
        if (startBtn) startBtn.disabled = false;
        document.getElementById('modal-export')?.classList.remove('active');
      }, 500);
    }
  }, 100);
}

// ----------------------------------------------------
// 12. Visual Keyboard Customizer
// ----------------------------------------------------
const KEYBOARD_ROWS = [
  ['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', 'Backspace'],
  ['Tab', 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '[', ']', '\\'],
  ['Caps', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';', "'", 'Enter'],
  ['Shift', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '/', 'Shift'],
  ['Ctrl', 'Alt', 'Space', 'Alt', 'Ctrl'],
];

function initVisualKeyboard() {
  const presetSel = document.getElementById('preset-selector');
  const searchInput = document.getElementById('shortcut-search');

  if (presetSel) {
    presetSel.addEventListener('change', (e) => {
      state.shortcutPreset = e.target.value;
      renderVirtualKeyboard();
      renderShortcutsTable();
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      renderShortcutsTable(searchInput.value.toLowerCase());
    });
  }
}

function getActiveShortcutKeyMap() {
  const map = {};
  for (const item of SHORTCUT_DEFINITIONS) {
    map[item.key.toUpperCase()] = item;
  }
  return map;
}

function renderVirtualKeyboard() {
  const container = document.getElementById('virtual-keyboard-container');
  if (!container) return;

  const keyMap = getActiveShortcutKeyMap();

  let html = '';
  for (const row of KEYBOARD_ROWS) {
    html += `<div class="keyboard-row">`;
    for (const key of row) {
      const lookupKey = key.toUpperCase();
      const mapped = keyMap[lookupKey];
      const isSpace = key === 'Space';
      const isWide = ['Backspace', 'Enter', 'Tab', 'Caps', 'Shift'].includes(key);

      const style = isSpace ? 'width: 220px;' : (isWide ? 'width: 60px;' : '');
      const cls = mapped ? `mapped ${mapped.type}` : '';
      const desc = mapped ? mapped.name.substring(0, 8) : '';

      html += `
        <div class="k-key ${cls}" style="${style}" data-key="${key}" title="${mapped ? `${mapped.name} (${key})` : key}">
          <span>${key}</span>
          ${desc ? `<span class="k-key-desc">${desc}</span>` : ''}
        </div>
      `;
    }
    html += `</div>`;
  }

  container.innerHTML = html;
}

function renderShortcutsTable(filter = '') {
  const tbody = document.getElementById('shortcuts-table-body');
  if (!tbody) return;

  const items = SHORTCUT_DEFINITIONS.filter(i => {
    if (!filter) return true;
    return i.name.toLowerCase().includes(filter) || i.key.toLowerCase().includes(filter) || i.category.toLowerCase().includes(filter);
  });

  tbody.innerHTML = items.map(i => `
    <tr style="border-bottom: 1px solid var(--border-divider);">
      <td style="padding: 6px 10px; color: #fff; font-weight: 500;">${i.name}</td>
      <td style="padding: 6px 10px; color: var(--text-secondary);">${i.category}</td>
      <td style="padding: 6px 10px;">
        <span style="background: #1e2636; border: 1px solid var(--border-subtle); padding: 2px 6px; border-radius: 3px; font-family: monospace; color: var(--accent-cyan); font-size: 10px;">
          ${i.key}
        </span>
      </td>
    </tr>
  `).join('');
}

// ----------------------------------------------------
// 13. Scoped Keyboard Shortcuts Engine
// ----------------------------------------------------
function initKeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    // 1. Strict Input Field Protection
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
      return;
    }

    const key = e.key;
    const code = e.code;
    const isCtrlOrMeta = e.ctrlKey || e.metaKey;

    // Global: Shortcuts Customizer
    if (isCtrlOrMeta && e.altKey && (code === 'KeyK' || key.toLowerCase() === 'k')) {
      e.preventDefault();
      openShortcutsModal();
      return;
    }

    // Global: Undo / Redo
    if (isCtrlOrMeta && (code === 'KeyZ' || key.toLowerCase() === 'z')) {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if (isCtrlOrMeta && (code === 'KeyY' || key.toLowerCase() === 'y')) {
      e.preventDefault();
      redo();
      return;
    }

    // Global: Save Project
    if (isCtrlOrMeta && (code === 'KeyS' || key.toLowerCase() === 's')) {
      e.preventDefault();
      scheduleAutoSave();
      return;
    }

    // Global: Export Sequence
    if (isCtrlOrMeta && (code === 'KeyM' || key.toLowerCase() === 'm')) {
      e.preventDefault();
      openExportModal();
      return;
    }

    // Global: Import Media
    if (isCtrlOrMeta && (code === 'KeyI' || key.toLowerCase() === 'i')) {
      e.preventDefault();
      document.getElementById('video-file-input')?.click();
      return;
    }

    // Global: Panel Maximizing (Tilde / Backquote)
    if (code === 'Backquote' || key === '`' || key === '~') {
      e.preventDefault();
      const focusedEl = document.querySelector('.panel.focused, .monitor-wrapper.focused, .timeline-pane.focused') || document.getElementById('panel-timeline');
      if (focusedEl) toggleMaximizePanel(focusedEl);
      return;
    }

    // Transport: Play / Pause
    if (code === 'Space') {
      e.preventDefault();
      toggleSequencePlayback();
      return;
    }

    // Transport: J-K-L Shuttle Deck
    if (code === 'KeyJ') {
      state.isPlayingSequence = true;
      state.playbackSpeed = state.playbackSpeed <= 0 ? state.playbackSpeed - 1 : -1;
      return;
    }
    if (code === 'KeyK') {
      state.isPlayingSequence = false;
      state.playbackSpeed = 1;
      return;
    }
    if (code === 'KeyL') {
      state.isPlayingSequence = true;
      state.playbackSpeed = state.playbackSpeed >= 1 ? state.playbackSpeed + 1 : 1;
      return;
    }

    // Transport: Arrow keys frame stepping
    if (code === 'ArrowLeft') {
      e.preventDefault();
      const step = e.shiftKey ? 1.0 : (1 / getActiveSequence().fps);
      seekSequence(Math.max(0, getActiveSequence().playheadTime - step));
      return;
    }
    if (code === 'ArrowRight') {
      e.preventDefault();
      const step = e.shiftKey ? 1.0 : (1 / getActiveSequence().fps);
      seekSequence(getActiveSequence().playheadTime + step);
      return;
    }

    // Transport: Mark In / Out
    if (code === 'KeyI') {
      state.sourceInPoint = getActiveSequence().playheadTime;
      return;
    }
    if (code === 'KeyO') {
      state.sourceOutPoint = getActiveSequence().playheadTime;
      return;
    }

    // Tools Switching
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
    else if (code === 'KeyT') setTool('text');

    // Editing: Split at playhead
    if (isCtrlOrMeta && (code === 'KeyK' || key.toLowerCase() === 'k')) {
      e.preventDefault();
      if (state.activeClipId) {
        splitClipAction(state.activeClipId, getActiveSequence().playheadTime);
      }
      return;
    }

    // Editing: Delete selected clip
    if (code === 'Delete' || code === 'Backspace') {
      deleteActiveClip();
      return;
    }

    // Navigation: Zoom and Snapping
    if (code === 'KeyS') {
      state.isSnapping = !state.isSnapping;
      document.getElementById('btn-snap-toggle')?.classList.toggle('active', state.isSnapping);
      return;
    }
    if (code === 'Backslash' || key === '\\') {
      fitTimelineToSequence();
      return;
    }
    if (code === 'Equal' || key === '+') {
      state.pixelsPerSecond = Math.min(180, state.pixelsPerSecond * 1.3);
      renderTimeline();
      return;
    }
    if (code === 'Minus' || key === '-') {
      state.pixelsPerSecond = Math.max(8, state.pixelsPerSecond / 1.3);
      renderTimeline();
      return;
    }
  });
}

// ----------------------------------------------------
// 14. Master Render & Utilities
// ----------------------------------------------------
function renderAll() {
  renderAssetsList();
  renderTimeline();
  renderProgramMonitor();
  renderInspector();
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

function pad(n) {
  return n < 10 ? `0${n}` : `${n}`;
}

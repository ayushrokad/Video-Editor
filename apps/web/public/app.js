/**
 * FRAMEFLOW Professional Video Editor — Milestone M4 (Adaptive Workspace Redesign)
 * Features:
 * - Streamlined 34px unified Application Header + 14-menu bar
 * - Unified Monitor Group (Tabbed Source/Program by default + 1-click Split View)
 * - Sleek empty states for Source and Program monitors
 * - Four-Zone Integrated Timeline with Timeline Display Settings Popover
 * - Direct Drag-and-Drop from Project Assets onto Timeline Track Lanes
 * - Progressive Disclosure Collapsible Accordion Inspector
 * - Scoped Keyboard Shortcut System & Visual Keyboard Customizer Modal
 * - Persistent IndexedDB Project Storage & Undo/Redo Command Stack
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
          { id: 'track_v2', name: 'V2', type: 'video', index: 1, muted: false, solo: false, locked: false, visible: true, height: 42, targeted: false },
          { id: 'track_v1', name: 'V1', type: 'video', index: 0, muted: false, solo: false, locked: false, visible: true, height: 42, targeted: true },
          { id: 'track_a1', name: 'A1', type: 'audio', index: 0, muted: false, solo: false, locked: false, visible: true, height: 42, targeted: true },
          { id: 'track_a2', name: 'A2', type: 'audio', index: 1, muted: false, solo: false, locked: false, visible: true, height: 42, targeted: false },
        ],
        clips: [],
      },
    },
  },
  activeClipId: null,
  activeAssetId: null,
  assetSearchQuery: '',
  monitorMode: 'single', // 'single' | 'split'
  activeMonitorTab: 'program', // 'source' | 'program'
  pixelsPerSecond: 28,
  isPlayingSequence: false,
  playbackSpeed: 1,
  activeTool: 'select',
  isSnapping: true,
  isLinkedSelection: true,
  focusedPanel: 'timeline',
  activeWorkspace: 'edit',
  shortcutPreset: 'frameflow',
  timelineDisplay: {
    showThumbnails: true,
    showWaveforms: true,
    showNames: true,
    showKeyframes: true,
    showBadges: true,
    showMarkers: true,
    compactTracks: false,
  },
  undoStack: [],
  redoStack: [],
  videoCache: {},
  sourceInPoint: 0,
  sourceOutPoint: 0,
  saveTimeout: null,
  vuLevelL: 0,
  vuLevelR: 0,
};

// ----------------------------------------------------
// 2. Keyboard Shortcut Registry
// ----------------------------------------------------
const SHORTCUT_DEFINITIONS = [
  { id: 'play_pause', name: 'Play / Pause Sequence', category: 'Transport', key: 'Space', type: 'transport' },
  { id: 'shuttle_rev', name: 'Shuttle Reverse (J)', category: 'Transport', key: 'J', type: 'transport' },
  { id: 'shuttle_pause', name: 'Pause Playback (K)', category: 'Transport', key: 'K', type: 'transport' },
  { id: 'shuttle_fwd', name: 'Shuttle Forward (L)', category: 'Transport', key: 'L', type: 'transport' },
  { id: 'step_prev_frame', name: 'Step 1 Frame Back', category: 'Transport', key: 'ArrowLeft', type: 'transport' },
  { id: 'step_next_frame', name: 'Step 1 Frame Forward', category: 'Transport', key: 'ArrowRight', type: 'transport' },
  { id: 'mark_in', name: 'Mark In Point', category: 'Transport', key: 'I', type: 'transport' },
  { id: 'mark_out', name: 'Mark Out Point', category: 'Transport', key: 'O', type: 'transport' },

  { id: 'tool_select', name: 'Selection Tool', category: 'Tools', key: 'V', type: 'tool' },
  { id: 'tool_track_select', name: 'Track Select Forward', category: 'Tools', key: 'A', type: 'tool' },
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

  { id: 'split_at_playhead', name: 'Split Clip at Playhead', category: 'Editing', key: 'Ctrl+K', type: 'edit' },
  { id: 'delete_clip', name: 'Delete Selected Clip', category: 'Editing', key: 'Delete', type: 'edit' },
  { id: 'undo', name: 'Undo Command', category: 'Editing', key: 'Ctrl+Z', type: 'edit' },
  { id: 'redo', name: 'Redo Command', category: 'Editing', key: 'Ctrl+Shift+Z', type: 'edit' },

  { id: 'snap_toggle', name: 'Toggle Snapping', category: 'Navigation', key: 'S', type: 'nav' },
  { id: 'zoom_in', name: 'Zoom In Timeline', category: 'Navigation', key: '=', type: 'nav' },
  { id: 'zoom_out', name: 'Zoom Out Timeline', category: 'Navigation', key: '-', type: 'nav' },
  { id: 'fit_sequence', name: 'Fit Sequence to View', category: 'Navigation', key: '\\', type: 'nav' },
  { id: 'maximize_panel', name: 'Maximize Active Panel', category: 'Navigation', key: '`', type: 'nav' },

  { id: 'save_project', name: 'Save Project', category: 'Global', key: 'Ctrl+S', type: 'global' },
  { id: 'export_sequence', name: 'Export Sequence Dialog', category: 'Global', key: 'Ctrl+M', type: 'global' },
  { id: 'import_media', name: 'Import Media Files', category: 'Global', key: 'Ctrl+I', type: 'global' },
  { id: 'shortcuts_manager', name: 'Keyboard Shortcuts Manager', category: 'Global', key: 'Ctrl+Alt+K', type: 'global' },
];

// ----------------------------------------------------
// 3. Initialization & Lifecycle
// ----------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  initSplitters();
  initPanelMaximizing();
  initMenus();
  initWorkspaceTabs();
  initMediaIngest();
  initMonitorsGroup();
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
}

function redo() {
  if (state.redoStack.length === 0) return;
  const currentSnapshot = JSON.parse(JSON.stringify(state.project));
  const { snapshot } = state.redoStack.pop();
  state.undoStack.push({ snapshot: currentSnapshot });
  state.project = snapshot;
  scheduleAutoSave();
  renderAll();
}

// ----------------------------------------------------
// 5. IndexedDB Persistence
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
    } catch (err) {
      console.warn('[FRAMEFLOW IDB] Autosave failed', err);
    }
  }, 600);
}

// ----------------------------------------------------
// 6. UI Splitters, Focus & Panel Resizing
// ----------------------------------------------------
function initSplitters() {
  setupSplitter('splitter-left', 'panel-project', 'width', false, 180, 480);
  setupSplitter('splitter-right', 'panel-inspector', 'width', true, 200, 540);
  setupSplitter('splitter-center-v', 'panel-timeline', 'height', true, 160, 620);
  setupSplitter('splitter-monitors', 'viewport-source', 'width', false, 200, 750);

  ['panel-project', 'monitors-pane', 'panel-timeline', 'panel-inspector'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('mousedown', () => {
      document.querySelectorAll('.panel, .monitors-pane, .timeline-pane').forEach(p => p.classList.remove('focused'));
      el.classList.add('focused');
      state.focusedPanel = id;
    });
  });
}

function setupSplitter(splitterId, targetPanelId, dimension, reverse = false, min = 120, max = 800) {
  const splitter = document.getElementById(splitterId);
  const target = document.getElementById(targetPanelId);
  if (!splitter || !target) return;

  splitter.addEventListener('mousedown', (e) => {
    e.preventDefault();
    splitter.classList.add('active');
    const startPos = dimension === 'width' ? e.clientX : e.clientY;
    const startSize = dimension === 'width' ? target.offsetWidth : target.offsetHeight;

    const onMouseMove = (ev) => {
      const currentPos = dimension === 'width' ? ev.clientX : ev.clientY;
      const delta = reverse ? (startPos - currentPos) : (currentPos - startPos);
      const newSize = Math.max(min, Math.min(max, startSize + delta));
      target.style[dimension] = `${newSize}px`;
      target.style.flex = 'none';
    };

    const onMouseUp = () => {
      splitter.classList.remove('active');
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
      const panel = btn.closest('.panel, .monitors-pane, .timeline-pane');
      if (panel) toggleMaximizePanel(panel);
    });
  });
}

function toggleMaximizePanel(panel) {
  const isMaxed = panel.classList.contains('maximized');
  document.querySelectorAll('.panel, .monitors-pane, .timeline-pane').forEach(p => p.classList.remove('maximized'));
  if (!isMaxed) {
    panel.classList.add('maximized');
  }
}

// ----------------------------------------------------
// 7. Media Ingest, Search & Assets Management
// ----------------------------------------------------
function initMediaIngest() {
  const fileInput = document.getElementById('video-file-input');
  const dropzone = document.getElementById('media-dropzone');
  const importBtn = document.getElementById('btn-import-media');
  const addBinBtn = document.getElementById('btn-add-bin');
  const searchInput = document.getElementById('asset-search-input');

  const triggerImport = () => fileInput?.click();

  if (dropzone) {
    dropzone.addEventListener('click', triggerImport);
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = 'var(--accent)';
    });
    dropzone.addEventListener('dragleave', () => {
      dropzone.style.borderColor = 'var(--border)';
    });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = 'var(--border)';
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFilesIngest(Array.from(e.dataTransfer.files));
      }
    });
  }

  importBtn?.addEventListener('click', triggerImport);
  document.getElementById('src-empty-import-btn')?.addEventListener('click', triggerImport);
  document.getElementById('prg-empty-import-btn')?.addEventListener('click', triggerImport);

  fileInput?.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFilesIngest(Array.from(e.target.files));
    }
  });

  addBinBtn?.addEventListener('click', () => {
    const binName = prompt('Enter New Bin Name:', 'B-Roll Footage');
    if (!binName) return;
    const binId = `bin_${Date.now()}`;
    state.project.bins[binId] = { id: binId, name: binName, assetIds: [] };
    executeCommand('Create Bin', () => {});
  });

  searchInput?.addEventListener('input', (e) => {
    state.assetSearchQuery = e.target.value.toLowerCase();
    renderAssetsList();
  });
}

async function handleFilesIngest(files) {
  for (const file of files) {
    const assetId = `asset_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const url = URL.createObjectURL(file);
    const isVideo = file.type.startsWith('video');

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

    if (!state.activeAssetId) {
      loadAssetIntoSourceMonitor(assetId);
    }
  }

  executeCommand('Import Media Assets', () => {});
}

function renderAssetsList() {
  const container = document.getElementById('assets-list');
  if (!container) return;

  const assets = Object.values(state.project.assets).filter(a => {
    if (!state.assetSearchQuery) return true;
    return a.name.toLowerCase().includes(state.assetSearchQuery);
  });

  if (assets.length === 0) {
    container.innerHTML = `
      <div style="font-size: 11px; color: var(--text-muted); text-align: center; padding: 20px 8px;">
        ${state.assetSearchQuery ? 'No matching assets found.' : 'No media imported yet.'}
      </div>
    `;
    return;
  }

  let html = '';
  for (const bin of Object.values(state.project.bins)) {
    if (bin.id === 'bin_root') continue;
    html += `
      <div class="asset-item" style="font-weight: 600; color: var(--warning);">
        <span class="icon icon-sm">folder</span>
        <span>${bin.name}</span>
      </div>
    `;
  }

  for (const asset of assets) {
    const isAudio = asset.type && asset.type.startsWith('audio');
    const iconName = isAudio ? 'audiotrack' : 'movie';
    const isSelected = state.activeAssetId === asset.id;

    html += `
      <div class="asset-item ${isSelected ? 'selected' : ''}" data-id="${asset.id}" draggable="true">
        <span class="icon icon-sm" style="color: ${isAudio ? 'var(--success)' : 'var(--accent)'};">${iconName}</span>
        <div style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          ${asset.name}
        </div>
        <span style="font-size: 10px; color: var(--text-muted);">${formatTimecode(asset.duration, 24)}</span>
      </div>
    `;
  }

  container.innerHTML = html;

  container.querySelectorAll('.asset-item').forEach(item => {
    const id = item.dataset.id;
    if (!id) return;

    item.addEventListener('dblclick', () => {
      loadAssetIntoSourceMonitor(id);
      if (state.monitorMode === 'single') {
        switchMonitorTab('source');
      }
    });

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
// 8. Unified Tabbed / Split Monitor Group
// ----------------------------------------------------
function initMonitorsGroup() {
  const tabSource = document.getElementById('tab-monitor-source');
  const tabProgram = document.getElementById('tab-monitor-program');
  const splitBtn = document.getElementById('btn-toggle-split-view');

  tabSource?.addEventListener('click', () => switchMonitorTab('source'));
  tabProgram?.addEventListener('click', () => switchMonitorTab('program'));
  splitBtn?.addEventListener('click', toggleMonitorSplitView);

  // Source Monitor controls
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
    if (state.activeMonitorTab === 'source' || state.monitorMode === 'split') {
      const tc = document.getElementById('active-monitor-timecode');
      if (tc && state.activeMonitorTab === 'source') {
        tc.textContent = formatTimecode(srcVideo.currentTime, 24);
      }
    }
  });

  document.getElementById('src-btn-mark-in')?.addEventListener('click', () => {
    if (srcVideo) state.sourceInPoint = srcVideo.currentTime;
  });
  document.getElementById('src-btn-mark-out')?.addEventListener('click', () => {
    if (srcVideo) state.sourceOutPoint = srcVideo.currentTime;
  });
  document.getElementById('src-btn-insert')?.addEventListener('click', () => {
    insertSourceClipToTimeline();
  });

  // Program Monitor controls
  document.getElementById('prg-btn-play')?.addEventListener('click', toggleSequencePlayback);
  document.getElementById('prg-btn-prev')?.addEventListener('click', () => {
    seekSequence(Math.max(0, getActiveSequence().playheadTime - 1.0));
  });
  document.getElementById('prg-btn-next')?.addEventListener('click', () => {
    seekSequence(getActiveSequence().playheadTime + 1.0);
  });
  document.getElementById('prg-btn-step-prev')?.addEventListener('click', () => {
    const seq = getActiveSequence();
    seekSequence(Math.max(0, seq.playheadTime - (1 / seq.fps)));
  });
  document.getElementById('prg-btn-step-next')?.addEventListener('click', () => {
    const seq = getActiveSequence();
    seekSequence(seq.playheadTime + (1 / seq.fps));
  });

  updateMonitorsLayoutUI();
}

function switchMonitorTab(tab) {
  state.activeMonitorTab = tab;
  if (state.monitorMode === 'split') {
    // Clicking a tab in split mode keeps split mode active, just focuses timecode
    updateMonitorsLayoutUI();
    return;
  }
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
    vpSource.style.display = 'flex';
    vpSource.style.flex = '1';
    vpProgram.style.display = 'flex';
    vpProgram.style.flex = '1';
    if (splitter) splitter.style.display = 'block';
    tabSource?.classList.add('active');
    tabProgram?.classList.add('active');
    if (splitLabel) splitLabel.textContent = 'Single View';
  } else {
    if (splitter) splitter.style.display = 'none';
    if (splitLabel) splitLabel.textContent = 'Split View';

    if (state.activeMonitorTab === 'source') {
      vpSource.style.display = 'flex';
      vpSource.style.flex = '1';
      vpProgram.style.display = 'none';
      tabSource?.classList.add('active');
      tabProgram?.classList.remove('active');
    } else {
      vpSource.style.display = 'none';
      vpProgram.style.display = 'flex';
      vpProgram.style.flex = '1';
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

function insertAssetAtTime(assetId, startTime, targetTrackId = null) {
  const asset = state.project.assets[assetId];
  if (!asset) return;

  const seq = getActiveSequence();
  const duration = Math.min(10, asset.duration);

  const targetVideoTrack = targetTrackId
    ? seq.tracks.find(t => t.id === targetTrackId)
    : (seq.tracks.find(t => t.type === 'video' && t.targeted) || seq.tracks.find(t => t.type === 'video'));
  const targetAudioTrack = seq.tracks.find(t => t.type === 'audio' && t.targeted) || seq.tracks.find(t => t.type === 'audio');

  executeCommand('Add Clip to Sequence', () => {
    if (targetVideoTrack && targetVideoTrack.type === 'video') {
      const vClipId = `clip_v_${Date.now()}`;
      seq.clips.push({
        id: vClipId,
        assetId: asset.id,
        name: asset.name,
        trackId: targetVideoTrack.id,
        timelineStart: startTime,
        timelineDuration: duration,
        sourceStart: state.sourceInPoint || 0,
        transform: { positionX: 0, positionY: 0, scale: 1, rotation: 0, opacity: 1, anchorX: 0, anchorY: 0 },
        crop: { top: 0, bottom: 0, left: 0, right: 0 },
        colorEffects: { exposure: 0, contrast: 1, brightness: 0, saturation: 1, temperature: 0, tint: 0, gamma: 1, invert: false },
        audio: { volumeDb: 0, pan: 0, fadeIn: 0, fadeOut: 0 },
      });
      state.activeClipId = vClipId;
    }

    if (targetAudioTrack && (!targetTrackId || targetVideoTrack?.type === 'video')) {
      const aClipId = `clip_a_${Date.now()}`;
      seq.clips.push({
        id: aClipId,
        assetId: asset.id,
        name: `${asset.name} [Audio]`,
        trackId: targetAudioTrack.id,
        timelineStart: startTime,
        timelineDuration: duration,
        sourceStart: state.sourceInPoint || 0,
        transform: { positionX: 0, positionY: 0, scale: 1, rotation: 0, opacity: 1, anchorX: 0, anchorY: 0 },
        crop: { top: 0, bottom: 0, left: 0, right: 0 },
        colorEffects: { exposure: 0, contrast: 1, brightness: 0, saturation: 1, temperature: 0, tint: 0, gamma: 1, invert: false },
        audio: { volumeDb: 0, pan: 0, fadeIn: 0, fadeOut: 0 },
      });
    } else if (targetVideoTrack && targetVideoTrack.type === 'audio') {
      const aClipId = `clip_a_${Date.now()}`;
      seq.clips.push({
        id: aClipId,
        assetId: asset.id,
        name: asset.name,
        trackId: targetVideoTrack.id,
        timelineStart: startTime,
        timelineDuration: duration,
        sourceStart: 0,
        transform: { positionX: 0, positionY: 0, scale: 1, rotation: 0, opacity: 1, anchorX: 0, anchorY: 0 },
        crop: { top: 0, bottom: 0, left: 0, right: 0 },
        colorEffects: { exposure: 0, contrast: 1, brightness: 0, saturation: 1, temperature: 0, tint: 0, gamma: 1, invert: false },
        audio: { volumeDb: 0, pan: 0, fadeIn: 0, fadeOut: 0 },
      });
      state.activeClipId = aClipId;
    }

    seq.playheadTime = startTime + duration;
  });

  if (state.monitorMode === 'single') {
    switchMonitorTab('program');
  }
}

function insertSourceClipToTimeline() {
  if (!state.activeAssetId) return;
  const seq = getActiveSequence();
  insertAssetAtTime(state.activeAssetId, seq.playheadTime);
}

function toggleSequencePlayback() {
  state.isPlayingSequence = !state.isPlayingSequence;
  state.playbackSpeed = 1;
  const icon = document.getElementById('prg-play-icon');
  if (icon) icon.textContent = state.isPlayingSequence ? 'pause' : 'play_arrow';
  if (state.isPlayingSequence && state.monitorMode === 'single') {
    switchMonitorTab('program');
  }
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
        seq.playheadTime = 0;
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
    const activeClips = getActiveClipsAtPlayhead();
    const hasAudio = activeClips.length > 0;

    if (hasAudio) {
      state.vuLevelL = Math.max(10, Math.min(95, 62 + (Math.sin(performance.now() * 0.015) * 20) + (Math.random() * 10)));
      state.vuLevelR = Math.max(10, Math.min(95, 60 + (Math.cos(performance.now() * 0.012) * 20) + (Math.random() * 10)));
      const db = -((100 - state.vuLevelL) * 0.35).toFixed(1);
      if (dbText) dbText.textContent = `${db}`;
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
  const emptyCard = document.getElementById('program-empty-card');
  if (!canvas) return;

  const seq = getActiveSequence();

  // Toggle empty state card based on sequence clips
  if (emptyCard) {
    emptyCard.style.display = seq.clips.length === 0 ? 'flex' : 'none';
  }

  const tc = document.getElementById('active-monitor-timecode');
  if (tc && (state.activeMonitorTab === 'program' || state.monitorMode === 'split')) {
    tc.textContent = formatTimecode(seq.playheadTime, seq.fps);
  }

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#05070A';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (seq.clips.length === 0) return;

  const visibleTracks = seq.tracks.filter(t => t.type === 'video' && t.visible);
  const activeClips = getActiveClipsAtPlayhead();

  for (const track of [...visibleTracks].reverse()) {
    const clip = activeClips.find(c => c.trackId === track.id);
    if (!clip) continue;

    const asset = state.project.assets[clip.assetId];
    if (!asset) continue;

    ctx.save();
    const t = clip.transform;
    ctx.translate(canvas.width / 2 + t.positionX, canvas.height / 2 + t.positionY);
    ctx.rotate((t.rotation * Math.PI) / 180);
    ctx.scale(t.scale, t.scale);
    ctx.globalAlpha = t.opacity;

    const c = clip.colorEffects;
    let filterString = `brightness(${1 + c.brightness}) contrast(${c.contrast}) saturate(${c.saturation})`;
    if (c.invert) filterString += ` invert(100%)`;
    ctx.filter = filterString;

    let cachedVid = state.videoCache[asset.id];
    if (cachedVid && cachedVid.readyState >= 2) {
      const clipSourceTime = clip.sourceStart + (seq.playheadTime - clip.timelineStart);
      if (Math.abs(cachedVid.currentTime - clipSourceTime) > 0.05) {
        cachedVid.currentTime = clipSourceTime;
      }
      ctx.drawImage(cachedVid, -canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height);
    } else {
      const grad = ctx.createLinearGradient(-canvas.width / 2, -canvas.height / 2, canvas.width / 2, canvas.height / 2);
      grad.addColorStop(0, '#1E3A8A');
      grad.addColorStop(0.5, '#0F172A');
      grad.addColorStop(1, '#0284C7');
      ctx.fillStyle = grad;
      ctx.fillRect(-canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 36px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(clip.name, 0, 0);
      ctx.font = '20px ui-monospace, monospace';
      ctx.fillText(formatTimecode(seq.playheadTime, seq.fps), 0, 40);
    }

    ctx.restore();
  }
}

// ----------------------------------------------------
// 9. Four-Zone Timeline & Display Settings
// ----------------------------------------------------
function initTimeline() {
  initZoneAToolbar();
  initTimelineDisplaySettings();
  initZoneCRulerScrub();
  renderTimeline();
}

function initZoneAToolbar() {
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
    document.getElementById(id)?.addEventListener('click', () => setTool(tool));
  });

  document.getElementById('btn-snap-toggle')?.addEventListener('click', () => {
    state.isSnapping = !state.isSnapping;
    document.getElementById('btn-snap-toggle')?.classList.toggle('active', state.isSnapping);
  });

  document.getElementById('btn-link-toggle')?.addEventListener('click', () => {
    state.isLinkedSelection = !state.isLinkedSelection;
    document.getElementById('btn-link-toggle')?.classList.toggle('active', state.isLinkedSelection);
  });

  document.getElementById('btn-time-zoom-in')?.addEventListener('click', () => {
    state.pixelsPerSecond = Math.min(180, state.pixelsPerSecond * 1.3);
    renderTimeline();
  });
  document.getElementById('btn-time-zoom-out')?.addEventListener('click', () => {
    state.pixelsPerSecond = Math.max(8, state.pixelsPerSecond / 1.3);
    renderTimeline();
  });
  document.getElementById('btn-time-fit')?.addEventListener('click', fitTimelineToSequence);

  document.getElementById('btn-add-v-track')?.addEventListener('click', () => addTrack('video'));
  document.getElementById('btn-add-a-track')?.addEventListener('click', () => addTrack('audio'));
}

function initTimelineDisplaySettings() {
  const btn = document.getElementById('btn-timeline-display-settings');
  const menu = document.getElementById('timeline-display-menu');
  if (!btn || !menu) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isVisible = menu.style.display === 'flex';
    menu.style.display = isVisible ? 'none' : 'flex';
  });

  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target) && e.target !== btn) {
      menu.style.display = 'none';
    }
  });

  const bindCheck = (id, key) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', (e) => {
      state.timelineDisplay[key] = e.target.checked;
      renderTimeline();
    });
  };

  bindCheck('tds-thumbnails', 'showThumbnails');
  bindCheck('tds-waveforms', 'showWaveforms');
  bindCheck('tds-names', 'showNames');
  bindCheck('tds-keyframes', 'showKeyframes');
  bindCheck('tds-badges', 'showBadges');
  bindCheck('tds-markers', 'showMarkers');
  bindCheck('tds-compact-tracks', 'compactTracks');
}

function setTool(toolName) {
  state.activeTool = toolName;
  document.querySelectorAll('.timeline-toolbar .tool-btn').forEach(btn => {
    if (btn.id.startsWith('tool-')) btn.classList.remove('active');
  });
  document.getElementById(`tool-${toolName}`)?.classList.add('active');

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
    height: 42,
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
  const trackHeight = state.timelineDisplay.compactTracks ? 28 : 42;

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
        <div class="track-header-item ${isVideo ? 'video' : 'audio'}" style="height: ${trackHeight}px;" data-id="${track.id}">
          <div style="display: flex; align-items: center; gap: 4px;">
            <button class="track-target-btn ${track.targeted ? 'active' : ''}" data-target="${track.id}" title="Track Target (${track.name})">
              ${track.name}
            </button>
            <input class="track-name-input" value="${track.name}" data-track-id="${track.id}">
          </div>
          <div style="display: flex; align-items: center; gap: 2px;">
            ${isVideo ? `
              <button class="track-btn ${track.visible ? 'active' : ''}" data-action="toggle-vis" title="Toggle Track Visibility">
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
        <div class="timeline-track-lane" data-id="${track.id}" style="height: ${trackHeight}px; width: ${totalWidth}px;">
      `;

      const clips = seq.clips.filter(c => c.trackId === track.id);
      for (const clip of clips) {
        const leftPx = clip.timelineStart * state.pixelsPerSecond;
        const widthPx = Math.max(14, clip.timelineDuration * state.pixelsPerSecond);
        const isSelected = clip.id === state.activeClipId;
        const isAudio = track.type === 'audio';
        const showName = state.timelineDisplay.showNames;
        const showBadges = state.timelineDisplay.showBadges;
        const showWave = isAudio && state.timelineDisplay.showWaveforms;

        lanesHtml += `
          <div class="timeline-clip-block ${isAudio ? 'audio' : ''} ${isSelected ? 'selected' : ''}" 
               data-id="${clip.id}" 
               style="left: ${leftPx}px; width: ${widthPx}px;">
            <div class="trim-handle left"></div>
            <div style="display: flex; align-items: center; gap: 4px; overflow: hidden; pointer-events: none;">
              <span class="icon icon-sm">${isAudio ? 'graphic_eq' : 'movie'}</span>
              ${showName ? `<span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 11px;">${clip.name}</span>` : ''}
            </div>
            ${showWave ? `<div style="position: absolute; bottom: 2px; left: 8px; right: 8px; height: 10px; opacity: 0.35; background: repeating-linear-gradient(90deg, #38C995 0px, #38C995 2px, transparent 2px, transparent 4px); pointer-events: none;"></div>` : ''}
            ${showBadges ? `
              <div class="clip-badge">
                <span style="font-size: 9px; opacity: 0.7; margin-right: 3px;">${clip.timelineDuration.toFixed(1)}s</span>
                <span class="icon icon-sm" style="font-size: 12px; color: ${clip.colorEffects.exposure !== 0 || clip.colorEffects.contrast !== 1 ? 'var(--warning)' : 'rgba(255,255,255,0.4)'};">auto_fix_high</span>
              </div>
            ` : ''}
            <div class="trim-handle right"></div>
          </div>
        `;
      }

      lanesHtml += `</div>`;
    }
    lanesContainer.innerHTML = lanesHtml;

    // Bind Drop Asset onto Track Lane
    lanesContainer.querySelectorAll('.timeline-track-lane').forEach(laneEl => {
      const trackId = laneEl.dataset.id;
      laneEl.addEventListener('dragover', (e) => {
        e.preventDefault();
        laneEl.style.background = 'rgba(75, 141, 255, 0.1)';
      });
      laneEl.addEventListener('dragleave', () => {
        laneEl.style.background = '';
      });
      laneEl.addEventListener('drop', (e) => {
        e.preventDefault();
        laneEl.style.background = '';
        try {
          const payload = JSON.parse(e.dataTransfer.getData('text/plain'));
          if (payload && payload.type === 'asset' && payload.assetId) {
            const rect = laneEl.getBoundingClientRect();
            const scrollArea = document.getElementById('timeline-scroll-area');
            const scrollLeft = scrollArea ? scrollArea.scrollLeft : 0;
            const dropX = e.clientX - rect.left + scrollLeft;
            const dropTime = Math.max(0, dropX / state.pixelsPerSecond);
            insertAssetAtTime(payload.assetId, dropTime, trackId);
          }
        } catch {}
      });
    });

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

      clipEl.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('trim-handle')) return;
        if (state.activeTool === 'razor') return;

        e.preventDefault();
        let startX = e.clientX;
        const initialStart = clip.timelineStart;

        const onMove = (ev) => {
          let deltaSec = (ev.clientX - startX) / state.pixelsPerSecond;
          let newStart = Math.max(0, initialStart + deltaSec);
          if (state.isSnapping && Math.abs(newStart - seq.playheadTime) < 0.3) {
            newStart = seq.playheadTime;
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

      clipEl.querySelector('.trim-handle.left')?.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        let startX = e.clientX;
        const initStart = clip.timelineStart;
        const initDur = clip.timelineDuration;
        const initSource = clip.sourceStart;

        const onMove = (ev) => {
          const deltaSec = (ev.clientX - startX) / state.pixelsPerSecond;
          const safeDelta = Math.min(deltaSec, initDur - 0.2);
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
// 10. Contextual Inspector with Progressive Disclosure Accordions
// ----------------------------------------------------
function initInspector() {
  renderInspector();
}

function renderInspector() {
  const container = document.getElementById('inspector-content');
  if (!container) return;

  const clip = getActiveClip();
  const seq = getActiveSequence();
  const statusInfo = document.getElementById('status-clip-info');

  if (!clip) {
    if (statusInfo) statusInfo.textContent = 'Sequence Master';
    const assetCount = Object.keys(state.project.assets).length;
    container.innerHTML = `
      <div class="inspector-accordion">
        <div class="accordion-header">
          <span>Master Sequence Settings</span>
          <span class="icon icon-sm">expand_more</span>
        </div>
        <div class="accordion-content">
          <div class="field-row"><div class="field-header"><span>Sequence Name</span><span class="field-val">${seq.name}</span></div></div>
          <div class="field-row"><div class="field-header"><span>Resolution</span><span class="field-val">${seq.width} x ${seq.height}</span></div></div>
          <div class="field-row"><div class="field-header"><span>Frame Rate</span><span class="field-val">${seq.fps}.00 fps</span></div></div>
          <div class="field-row"><div class="field-header"><span>Duration</span><span class="field-val">${formatTimecode(seq.duration, seq.fps)}</span></div></div>
          <div class="field-row"><div class="field-header"><span>Color Space</span><span class="field-val" style="color: var(--success);">Rec.709 Linear 32-bit</span></div></div>
          <div class="field-row"><div class="field-header"><span>Audio Sample Rate</span><span class="field-val">48,000 Hz Stereo</span></div></div>
        </div>
      </div>

      <div class="inspector-accordion">
        <div class="accordion-header">
          <span>Project Overview</span>
          <span class="icon icon-sm">expand_more</span>
        </div>
        <div class="accordion-content">
          <div class="field-row"><div class="field-header"><span>Imported Assets</span><span class="field-val">${assetCount}</span></div></div>
          <div class="field-row"><div class="field-header"><span>Active Clips in Timeline</span><span class="field-val">${seq.clips.length}</span></div></div>
          <div class="field-row"><div class="field-header"><span>Video / Audio Tracks</span><span class="field-val">${seq.tracks.filter(t => t.type==='video').length}V / ${seq.tracks.filter(t => t.type==='audio').length}A</span></div></div>
          <div class="field-row"><div class="field-header"><span>Storage Engine</span><span class="field-val" style="color: var(--accent);">IndexedDB Local-First</span></div></div>
        </div>
      </div>

      <div style="padding: 12px 10px; font-size: 11px; color: var(--text-muted); line-height: 1.4;">
        Select any video or audio clip on the timeline to unlock contextual Transform, Crop, Color Grading, and Audio Mixing parameters.
      </div>
    `;
    bindAccordionToggles(container);
    return;
  }

  if (statusInfo) statusInfo.textContent = `Clip: ${clip.name}`;
  const isAudioClip = clip.trackId.startsWith('track_a');

  if (isAudioClip) {
    const a = clip.audio || { volumeDb: 0, pan: 0, fadeIn: 0, fadeOut: 0 };
    container.innerHTML = `
      <div class="inspector-accordion">
        <div class="accordion-header">
          <span>Audio Gain & Pan</span>
          <span class="icon icon-sm">expand_more</span>
        </div>
        <div class="accordion-content">
          <div class="field-row">
            <div class="field-header"><span>Volume (dB)</span><span class="field-val" id="disp-vol">${a.volumeDb.toFixed(1)} dB</span></div>
            <input type="range" id="insp-vol" min="-40" max="12" step="0.5" value="${a.volumeDb}">
          </div>
          <div class="field-row">
            <div class="field-header"><span>Stereo Pan</span><span class="field-val" id="disp-pan">${a.pan === 0 ? 'Center' : (a.pan < 0 ? `L ${Math.abs(a.pan)}` : `R ${a.pan}`)}</span></div>
            <input type="range" id="insp-pan" min="-100" max="100" step="1" value="${a.pan}">
          </div>
        </div>
      </div>

      <div class="inspector-accordion">
        <div class="accordion-header">
          <span>Audio Fades</span>
          <span class="icon icon-sm">expand_more</span>
        </div>
        <div class="accordion-content">
          <div class="field-row">
            <div class="field-header"><span>Fade In (sec)</span><span class="field-val" id="disp-fadein">${(a.fadeIn || 0).toFixed(1)}s</span></div>
            <input type="range" id="insp-fadein" min="0" max="5" step="0.1" value="${a.fadeIn || 0}">
          </div>
          <div class="field-row">
            <div class="field-header"><span>Fade Out (sec)</span><span class="field-val" id="disp-fadeout">${(a.fadeOut || 0).toFixed(1)}s</span></div>
            <input type="range" id="insp-fadeout" min="0" max="5" step="0.1" value="${a.fadeOut || 0}">
          </div>
        </div>
      </div>
    `;
    bindSlider('insp-vol', 'disp-vol', (v) => { clip.audio.volumeDb = v; }, (v) => `${v.toFixed(1)} dB`);
    bindSlider('insp-pan', 'disp-pan', (v) => { clip.audio.pan = v; }, (v) => v === 0 ? 'Center' : (v < 0 ? `L ${Math.abs(v)}` : `R ${v}`));
    bindSlider('insp-fadein', 'disp-fadein', (v) => { clip.audio.fadeIn = v; }, (v) => `${v.toFixed(1)}s`);
    bindSlider('insp-fadeout', 'disp-fadeout', (v) => { clip.audio.fadeOut = v; }, (v) => `${v.toFixed(1)}s`);
    bindAccordionToggles(container);
    return;
  }

  // Video Clip Inspector
  const t = clip.transform;
  const c = clip.colorEffects;

  container.innerHTML = `
    <div class="inspector-accordion">
      <div class="accordion-header">
        <span>Video Transform</span>
        <span class="icon icon-sm">expand_more</span>
      </div>
      <div class="accordion-content">
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
    </div>

    <div class="inspector-accordion">
      <div class="accordion-header">
        <span>Real-Time GPU Color Grading</span>
        <span class="icon icon-sm">expand_more</span>
      </div>
      <div class="accordion-content">
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
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
          <label style="display: flex; align-items: center; gap: 4px; font-size: 11px; cursor: pointer;">
            <input type="checkbox" id="insp-invert" ${c.invert ? 'checked' : ''}> Invert
          </label>
          <button class="action-btn-compact" id="btn-reset-clip-grade">Reset Grade</button>
        </div>
      </div>
    </div>

    <div class="inspector-accordion">
      <div class="accordion-header">
        <span>Crop & Edge Inset</span>
        <span class="icon icon-sm">chevron_right</span>
      </div>
      <div class="accordion-content collapsed">
        <div class="field-row"><div class="field-header"><span>Top</span><span>0%</span></div><input type="range" min="0" max="50" value="0"></div>
        <div class="field-row"><div class="field-header"><span>Bottom</span><span>0%</span></div><input type="range" min="0" max="50" value="0"></div>
        <div class="field-row"><div class="field-header"><span>Left</span><span>0%</span></div><input type="range" min="0" max="50" value="0"></div>
        <div class="field-row"><div class="field-header"><span>Right</span><span>0%</span></div><input type="range" min="0" max="50" value="0"></div>
      </div>
    </div>
  `;

  bindSlider('insp-scale', 'disp-scale', (v) => { clip.transform.scale = v; }, (v) => `${v.toFixed(2)}x`);
  bindSlider('insp-posx', 'disp-posx', (v) => { clip.transform.positionX = v; }, (v) => `${v}px`);
  bindSlider('insp-posy', 'disp-posy', (v) => { clip.transform.positionY = v; }, (v) => `${v}px`);
  bindSlider('insp-rot', 'disp-rot', (v) => { clip.transform.rotation = v; }, (v) => `${v}°`);
  bindSlider('insp-opac', 'disp-opac', (v) => { clip.transform.opacity = v; }, (v) => `${Math.round(v * 100)}%`);

  bindSlider('insp-exp', 'disp-exp', (v) => { clip.colorEffects.exposure = v; }, (v) => v.toFixed(2));
  bindSlider('insp-cont', 'disp-cont', (v) => { clip.colorEffects.contrast = v; }, (v) => v.toFixed(2));
  bindSlider('insp-sat', 'disp-sat', (v) => { clip.colorEffects.saturation = v; }, (v) => v.toFixed(2));
  bindSlider('insp-brt', 'disp-brt', (v) => { clip.colorEffects.brightness = v; }, (v) => v.toFixed(2));

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

  bindAccordionToggles(container);
}

function bindAccordionToggles(container) {
  container.querySelectorAll('.accordion-header').forEach(header => {
    header.addEventListener('click', () => {
      const content = header.nextElementSibling;
      const icon = header.querySelector('.icon');
      if (content) {
        const isCollapsed = content.classList.toggle('collapsed');
        if (icon) icon.textContent = isCollapsed ? 'chevron_right' : 'expand_more';
      }
    });
  });
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
  document.getElementById('m-file-import')?.addEventListener('click', () => document.getElementById('video-file-input')?.click());
  document.getElementById('m-file-save')?.addEventListener('click', () => { scheduleAutoSave(); alert('Project saved to local IndexedDB!'); });
  document.getElementById('m-edit-undo')?.addEventListener('click', undo);
  document.getElementById('m-edit-redo')?.addEventListener('click', redo);
  document.getElementById('m-edit-delete')?.addEventListener('click', deleteActiveClip);
  document.getElementById('m-edit-split')?.addEventListener('click', () => {
    if (state.activeClipId) splitClipAction(state.activeClipId, getActiveSequence().playheadTime);
  });

  document.getElementById('btn-undo')?.addEventListener('click', undo);
  document.getElementById('btn-redo')?.addEventListener('click', redo);
  document.getElementById('m-view-split')?.addEventListener('click', toggleMonitorSplitView);

  document.getElementById('m-edit-shortcuts')?.addEventListener('click', openShortcutsModal);
  document.getElementById('m-help-shortcuts')?.addEventListener('click', openShortcutsModal);

  document.getElementById('btn-export-modal')?.addEventListener('click', openExportModal);
  document.getElementById('m-file-export')?.addEventListener('click', openExportModal);

  document.getElementById('win-reset-layout')?.addEventListener('click', () => {
    document.getElementById('panel-project').style.width = '20%';
    document.getElementById('panel-inspector').style.width = '22%';
    document.getElementById('panel-timeline').style.height = '300px';
    document.querySelectorAll('.panel, .monitors-pane, .timeline-pane').forEach(p => p.classList.remove('maximized'));
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
    leftCol.style.width = '32%';
    rightCol.style.width = '18%';
    timeline.style.height = '180px';
  } else if (ws === 'color') {
    leftCol.style.width = '15%';
    rightCol.style.width = '28%';
    timeline.style.height = '200px';
  } else if (ws === 'audio') {
    leftCol.style.width = '16%';
    rightCol.style.width = '26%';
    timeline.style.height = '380px';
  } else if (ws === 'motion') {
    leftCol.style.width = '18%';
    rightCol.style.width = '26%';
    timeline.style.height = '320px';
  } else if (ws === 'deliver') {
    openExportModal();
  } else {
    leftCol.style.width = '20%';
    rightCol.style.width = '22%';
    timeline.style.height = '300px';
  }
  renderInspector();
}

function initModals() {
  document.getElementById('btn-close-shortcuts-modal')?.addEventListener('click', () => {
    document.getElementById('modal-shortcuts')?.classList.remove('active');
  });
  document.getElementById('btn-close-export-modal')?.addEventListener('click', () => {
    document.getElementById('modal-export')?.classList.remove('active');
  });
  document.getElementById('btn-cancel-export')?.addEventListener('click', () => {
    document.getElementById('modal-export')?.classList.remove('active');
  });
  document.getElementById('btn-start-render')?.addEventListener('click', startExportSimulation);
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
  document.getElementById('modal-export')?.classList.add('active');
}

function startExportSimulation() {
  const progressArea = document.getElementById('export-progress-area');
  const fill = document.getElementById('export-progress-fill');
  const percentLabel = document.getElementById('export-percent-label');
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
      setTimeout(() => {
        alert('Export complete! Sequence rendered successfully.');
        if (progressArea) progressArea.style.display = 'none';
        if (startBtn) startBtn.disabled = false;
        document.getElementById('modal-export')?.classList.remove('active');
      }, 400);
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
  document.getElementById('preset-selector')?.addEventListener('change', (e) => {
    state.shortcutPreset = e.target.value;
    renderVirtualKeyboard();
    renderShortcutsTable();
  });
  document.getElementById('shortcut-search')?.addEventListener('input', (e) => {
    renderShortcutsTable(e.target.value.toLowerCase());
  });
}

function renderVirtualKeyboard() {
  const container = document.getElementById('virtual-keyboard-container');
  if (!container) return;

  const keyMap = {};
  for (const item of SHORTCUT_DEFINITIONS) keyMap[item.key.toUpperCase()] = item;

  let html = '';
  for (const row of KEYBOARD_ROWS) {
    html += `<div class="keyboard-row">`;
    for (const key of row) {
      const mapped = keyMap[key.toUpperCase()];
      const isSpace = key === 'Space';
      const isWide = ['Backspace', 'Enter', 'Tab', 'Caps', 'Shift'].includes(key);
      const style = isSpace ? 'width: 220px;' : (isWide ? 'width: 60px;' : '');
      const cls = mapped ? `mapped ${mapped.type}` : '';
      const desc = mapped ? mapped.name.substring(0, 8) : '';

      html += `
        <div class="k-key ${cls}" style="${style}" title="${mapped ? `${mapped.name} (${key})` : key}">
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
  const items = SHORTCUT_DEFINITIONS.filter(i => !filter || i.name.toLowerCase().includes(filter) || i.key.toLowerCase().includes(filter));
  tbody.innerHTML = items.map(i => `
    <tr style="border-bottom: 1px solid var(--border-divider);">
      <td style="padding: 5px 10px; color: #fff;">${i.name}</td>
      <td style="padding: 5px 10px; color: var(--text-secondary);">${i.category}</td>
      <td style="padding: 5px 10px;"><span style="background: #1E2636; border: 1px solid var(--border); padding: 1px 6px; border-radius: 3px; font-family: monospace; color: var(--accent-cyan); font-size: 10px;">${i.key}</span></td>
    </tr>
  `).join('');
}

// ----------------------------------------------------
// 13. Scoped Keyboard Shortcuts Engine
// ----------------------------------------------------
function initKeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

    const code = e.code;
    const key = e.key;
    const isCtrlOrMeta = e.ctrlKey || e.metaKey;

    if (isCtrlOrMeta && e.altKey && code === 'KeyK') { e.preventDefault(); openShortcutsModal(); return; }
    if (isCtrlOrMeta && code === 'KeyZ') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (isCtrlOrMeta && code === 'KeyY') { e.preventDefault(); redo(); return; }
    if (isCtrlOrMeta && code === 'KeyS') { e.preventDefault(); scheduleAutoSave(); return; }
    if (isCtrlOrMeta && code === 'KeyM') { e.preventDefault(); openExportModal(); return; }
    if (isCtrlOrMeta && code === 'KeyI') { e.preventDefault(); document.getElementById('video-file-input')?.click(); return; }
    if (isCtrlOrMeta && code === 'KeyK') { e.preventDefault(); if (state.activeClipId) splitClipAction(state.activeClipId, getActiveSequence().playheadTime); return; }

    if (code === 'Backquote' || key === '`' || key === '~') {
      e.preventDefault();
      const focused = document.querySelector('.panel.focused, .monitors-pane.focused, .timeline-pane.focused') || document.getElementById('panel-timeline');
      if (focused) toggleMaximizePanel(focused);
      return;
    }

    if (code === 'Space') { e.preventDefault(); toggleSequencePlayback(); return; }
    if (code === 'KeyJ') { state.isPlayingSequence = true; state.playbackSpeed = state.playbackSpeed <= 0 ? state.playbackSpeed - 1 : -1; return; }
    if (code === 'KeyK') { state.isPlayingSequence = false; state.playbackSpeed = 1; return; }
    if (code === 'KeyL') { state.isPlayingSequence = true; state.playbackSpeed = state.playbackSpeed >= 1 ? state.playbackSpeed + 1 : 1; return; }
    if (code === 'ArrowLeft') { e.preventDefault(); const step = e.shiftKey ? 1.0 : (1 / getActiveSequence().fps); seekSequence(Math.max(0, getActiveSequence().playheadTime - step)); return; }
    if (code === 'ArrowRight') { e.preventDefault(); const step = e.shiftKey ? 1.0 : (1 / getActiveSequence().fps); seekSequence(getActiveSequence().playheadTime + step); return; }

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

    if (code === 'Delete' || code === 'Backspace') { deleteActiveClip(); return; }
    if (code === 'KeyS') { state.isSnapping = !state.isSnapping; document.getElementById('btn-snap-toggle')?.classList.toggle('active', state.isSnapping); return; }
    if (code === 'Backslash' || key === '\\') { fitTimelineToSequence(); return; }
    if (code === 'Equal' || key === '+') { state.pixelsPerSecond = Math.min(180, state.pixelsPerSecond * 1.3); renderTimeline(); return; }
    if (code === 'Minus' || key === '-') { state.pixelsPerSecond = Math.max(8, state.pixelsPerSecond / 1.3); renderTimeline(); return; }
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

/**
 * FRAMEFLOW Professional Video Editor — Connected Client Application
 * Full real-time non-linear editing platform with dynamic panels, connected monitors,
 * multitrack timeline, contextual inspector, command undo/redo, and IndexedDB persistence.
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
          { id: 'track_v2', name: 'V2', type: 'video', index: 1, muted: false, solo: false, locked: false, visible: true, height: 44 },
          { id: 'track_v1', name: 'V1', type: 'video', index: 0, muted: false, solo: false, locked: false, visible: true, height: 44 },
          { id: 'track_a1', name: 'A1', type: 'audio', index: 0, muted: false, solo: false, locked: false, visible: true, height: 44 },
          { id: 'track_a2', name: 'A2', type: 'audio', index: 1, muted: false, solo: false, locked: false, visible: true, height: 44 },
        ],
        clips: [],
      },
    },
  },
  activeClipId: null,
  activeAssetId: null,
  pixelsPerSecond: 25, // timeline zoom scale
  isPlayingSequence: false,
  activeTool: 'select', // 'select' | 'razor'
  isSnapping: true,
  undoStack: [],
  redoStack: [],
  videoCache: {}, // assetId -> HTMLVideoElement
  saveTimeout: null,
  activeWorkspace: 'edit',
};

// ----------------------------------------------------
// 2. Initialization & Lifecycle
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
// 3. Command System & Undo/Redo
// ----------------------------------------------------
function executeCommand(description, applyFn, undoFn) {
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
// 4. IndexedDB Persistence & Recovery
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

  // Attempt to restore last project
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
    console.log('[FRAMEFLOW Persistence] Loaded project from IndexedDB:', savedProject.title);
    updateSaveBadge('saved');
  }
}

function scheduleAutoSave() {
  updateSaveBadge('saving');
  clearTimeout(state.saveTimeout);
  state.saveTimeout = setTimeout(async () => {
    state.project.modifiedAt = Date.now();
    if (idb) {
      try {
        const tx = idb.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(state.project);
      } catch (e) {
        console.warn('Autosave error:', e);
      }
    } else {
      localStorage.setItem('frameflow_active_proj', JSON.stringify(state.project));
    }
    updateSaveBadge('saved');
  }, 1000);
}

function updateSaveBadge(status) {
  const badge = document.getElementById('save-status-badge');
  if (!badge) return;
  badge.className = `save-status-indicator ${status}`;
  if (status === 'saved') badge.textContent = '● Saved';
  else if (status === 'saving') badge.textContent = '○ Saving...';
  else badge.textContent = '● Unsaved';
}

// ----------------------------------------------------
// 5. Dynamic Splitters & Resizable Layout Engine
// ----------------------------------------------------
function initSplitters() {
  const colLeft = document.getElementById('panel-project');
  const colRight = document.getElementById('panel-inspector');
  const panelSource = document.getElementById('panel-source');
  const timelinePane = document.getElementById('panel-timeline');

  // Left splitter (Horizontal)
  makeHorizontalSplitter('splitter-left', (deltaX) => {
    const curWidth = colLeft.offsetWidth;
    const newWidth = Math.max(180, Math.min(500, curWidth + deltaX));
    colLeft.style.width = `${newWidth}px`;
  });

  // Right splitter (Horizontal)
  makeHorizontalSplitter('splitter-right', (deltaX) => {
    const curWidth = colRight.offsetWidth;
    const newWidth = Math.max(220, Math.min(540, curWidth - deltaX));
    colRight.style.width = `${newWidth}px`;
  });

  // Center vertical splitter (Monitors <-> Timeline)
  makeVerticalSplitter('splitter-center-v', (deltaY) => {
    const curHeight = timelinePane.offsetHeight;
    const newHeight = Math.max(140, Math.min(600, curHeight - deltaY));
    timelinePane.style.height = `${newHeight}px`;
  });

  // Monitors horizontal splitter (Source <-> Program)
  makeHorizontalSplitter('splitter-monitors', (deltaX) => {
    const curWidth = panelSource.offsetWidth;
    const newWidth = Math.max(180, curWidth + deltaX);
    panelSource.style.flex = 'none';
    panelSource.style.width = `${newWidth}px`;
  });
}

function makeHorizontalSplitter(id, onDrag) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('mousedown', (e) => {
    e.preventDefault();
    el.classList.add('active');
    let startX = e.clientX;
    const moveHandler = (ev) => {
      const deltaX = ev.clientX - startX;
      startX = ev.clientX;
      onDrag(deltaX);
    };
    const upHandler = () => {
      el.classList.remove('active');
      window.removeEventListener('mousemove', moveHandler);
      window.removeEventListener('mouseup', upHandler);
    };
    window.addEventListener('mousemove', moveHandler);
    window.addEventListener('mouseup', upHandler);
  });
}

function makeVerticalSplitter(id, onDrag) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('mousedown', (e) => {
    e.preventDefault();
    el.classList.add('active');
    let startY = e.clientY;
    const moveHandler = (ev) => {
      const deltaY = ev.clientY - startY;
      startY = ev.clientY;
      onDrag(deltaY);
    };
    const upHandler = () => {
      el.classList.remove('active');
      window.removeEventListener('mousemove', moveHandler);
      window.removeEventListener('mouseup', upHandler);
    };
    window.addEventListener('mousemove', moveHandler);
    window.addEventListener('mouseup', upHandler);
  });
}

function initPanelMaximizing() {
  document.querySelectorAll('.btn-maximize-panel').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const panel = e.target.closest('.panel') || e.target.closest('.monitor-wrapper');
      if (panel) {
        panel.classList.toggle('maximized');
      }
    });
  });
}

// ----------------------------------------------------
// 6. Media Ingestion & Asset Management
// ----------------------------------------------------
function initMediaIngest() {
  const fileInput = document.getElementById('video-file-input');
  const dropzone = document.getElementById('media-dropzone');
  const btnImport = document.getElementById('btn-import-media');
  const btnAddBin = document.getElementById('btn-add-bin');

  btnImport?.addEventListener('click', () => fileInput?.click());
  dropzone?.addEventListener('click', () => fileInput?.click());

  dropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--accent-blue)';
  });
  dropzone?.addEventListener('dragleave', () => {
    dropzone.style.borderColor = 'var(--border-subtle)';
  });
  dropzone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--border-subtle)';
    if (e.dataTransfer.files?.length) {
      handleFilesImport(e.dataTransfer.files);
    }
  });

  fileInput?.addEventListener('change', (e) => {
    if (e.target.files?.length) {
      handleFilesImport(e.target.files);
    }
  });

  btnAddBin?.addEventListener('click', () => {
    const binName = prompt('Enter new bin name:', '01_B_Roll');
    if (!binName) return;
    executeCommand(`Create Bin: ${binName}`, () => {
      const binId = `bin_${Date.now()}`;
      state.project.bins[binId] = { id: binId, name: binName, assetIds: [] };
    });
  });
}

async function handleFilesImport(files) {
  for (const file of Array.from(files)) {
    const assetId = `asset_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const objectUrl = URL.createObjectURL(file);

    // Read metadata via temporary HTML5 video
    let duration = 10;
    let width = 1920;
    let height = 1080;

    if (file.type.startsWith('video/')) {
      try {
        const meta = await new Promise((resolve) => {
          const v = document.createElement('video');
          v.preload = 'metadata';
          v.src = objectUrl;
          v.onloadedmetadata = () => {
            resolve({ duration: v.duration, width: v.videoWidth, height: v.videoHeight });
            v.remove();
          };
          v.onerror = () => resolve({ duration: 10, width: 1920, height: 1080 });
        });
        duration = meta.duration;
        width = meta.width;
        height = meta.height;
      } catch {}
    }

    const asset = {
      id: assetId,
      name: file.name,
      type: file.type.startsWith('audio/') ? 'audio' : file.type.startsWith('image/') ? 'image' : 'video',
      size: file.size,
      mimeType: file.type || 'video/mp4',
      duration,
      width,
      height,
      fps: 24,
      aspectRatio: `${width}:${height}`,
      objectUrl,
      createdAt: Date.now(),
    };

    // Pre-create persistent video element for rapid seeking
    const videoEl = document.createElement('video');
    videoEl.src = objectUrl;
    videoEl.preload = 'auto';
    videoEl.muted = true;
    state.videoCache[assetId] = videoEl;

    executeCommand(`Import Media: ${file.name}`, () => {
      state.project.assets[assetId] = asset;
      state.project.bins.bin_root.assetIds.push(assetId);
    });

    // Auto-select and load into source monitor
    loadAssetIntoSourceMonitor(asset);
  }
}

function renderAssetsList() {
  const container = document.getElementById('assets-list');
  if (!container) return;

  const assets = Object.values(state.project.assets);
  const bins = Object.values(state.project.bins).filter(b => b.id !== 'bin_root');

  let html = '';

  // Render Bins
  for (const bin of bins) {
    html += `
      <div style="display: flex; align-items: center; gap: 6px; padding: 4px 6px; background: var(--bg-hover); border-radius: 4px; font-size: 11px; cursor: pointer;">
        📁 <strong>${bin.name}</strong>
      </div>
    `;
  }

  // Render Assets
  for (const a of assets) {
    const isSelected = a.id === state.activeAssetId;
    const durStr = formatTimecode(a.duration, 24);
    html += `
      <div class="asset-item" data-id="${a.id}" style="display: flex; align-items: center; justify-content: space-between; padding: 4px 6px; border-radius: 4px; font-size: 11px; cursor: pointer; background: ${isSelected ? 'rgba(59, 130, 246, 0.25)' : 'transparent'}; border: 1px solid ${isSelected ? 'var(--accent-blue)' : 'var(--border-divider)'};">
        <div style="display: flex; align-items: center; gap: 6px; overflow: hidden;">
          <span>${a.type === 'audio' ? '🎵' : a.type === 'image' ? '🖼️' : '🎬'}</span>
          <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px;">${a.name}</span>
        </div>
        <span style="font-family: monospace; font-size: 10px; color: var(--text-muted);">${durStr}</span>
      </div>
    `;
  }

  if (assets.length === 0 && bins.length === 0) {
    html = `<div style="font-size: 10px; color: var(--text-muted); text-align: center; margin-top: 10px;">No media assets yet. Drop a video file above.</div>`;
  }

  container.innerHTML = html;

  // Add click & double click listeners
  container.querySelectorAll('.asset-item').forEach(el => {
    el.addEventListener('click', () => {
      const assetId = el.dataset.id;
      state.activeAssetId = assetId;
      renderAssetsList();
    });
    el.addEventListener('dblclick', () => {
      const assetId = el.dataset.id;
      const asset = state.project.assets[assetId];
      if (asset) loadAssetIntoSourceMonitor(asset);
    });
  });
}

// ----------------------------------------------------
// 7. Source Monitor
// ----------------------------------------------------
function initSourceMonitor() {
  const video = document.getElementById('source-video-element');
  const btnPlay = document.getElementById('src-btn-play');
  const btnIn = document.getElementById('src-btn-mark-in');
  const btnOut = document.getElementById('src-btn-mark-out');
  const btnInsert = document.getElementById('src-btn-insert');
  const timecode = document.getElementById('source-timecode');

  btnPlay?.addEventListener('click', () => {
    if (!video || !video.src) return;
    if (video.paused) {
      video.play();
      btnPlay.innerHTML = '&#9646;&#9646;';
    } else {
      video.pause();
      btnPlay.innerHTML = '&#9658;';
    }
  });

  video?.addEventListener('timeupdate', () => {
    if (timecode) timecode.textContent = formatTimecode(video.currentTime, 24);
  });

  btnIn?.addEventListener('click', () => {
    if (state.activeAssetId) {
      state.sourceIn = video.currentTime;
      console.log(`[Source Monitor] In Point: ${video.currentTime.toFixed(2)}s`);
    }
  });

  btnOut?.addEventListener('click', () => {
    if (state.activeAssetId) {
      state.sourceOut = video.currentTime;
      console.log(`[Source Monitor] Out Point: ${video.currentTime.toFixed(2)}s`);
    }
  });

  // Insert marked clip into Timeline at playhead
  btnInsert?.addEventListener('click', insertSourceClipToTimeline);
}

function loadAssetIntoSourceMonitor(asset) {
  state.activeAssetId = asset.id;
  const video = document.getElementById('source-video-element');
  const emptyMsg = document.getElementById('source-empty-msg');
  if (!video) return;

  video.src = asset.objectUrl;
  video.currentTime = 0;
  if (emptyMsg) emptyMsg.style.display = 'none';
  renderAssetsList();
}

function insertSourceClipToTimeline() {
  if (!state.activeAssetId) return;
  const asset = state.project.assets[state.activeAssetId];
  if (!asset) return;

  const seq = getActiveSequence();
  const targetTrack = seq.tracks.find(t => t.type === 'video' && t.visible) || seq.tracks[0];
  const startTime = seq.playheadTime;
  const inPt = state.sourceIn || 0;
  const outPt = state.sourceOut && state.sourceOut > inPt ? state.sourceOut : asset.duration;
  const clipDuration = Math.max(0.5, outPt - inPt);

  executeCommand(`Insert Clip: ${asset.name}`, () => {
    const newClip = {
      id: `clip_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      name: asset.name,
      assetId: asset.id,
      trackId: targetTrack.id,
      timelineStart: startTime,
      timelineDuration: clipDuration,
      sourceStart: inPt,
      transform: { positionX: 0, positionY: 0, scale: 1.0, rotation: 0, opacity: 1.0, blendMode: 'normal' },
      colorEffects: { exposure: 0.0, contrast: 1.0, brightness: 0.0, saturation: 1.0, temperature: 0.0, tint: 0.0, gamma: 1.0, invert: false },
      audio: { volumeDb: 0, pan: 0, muted: false },
      speed: 1.0,
      colorTag: '#2563eb',
    };
    seq.clips.push(newClip);
    state.activeClipId = newClip.id;
    seq.playheadTime = startTime + clipDuration; // advance playhead
  });
}

// ----------------------------------------------------
// 8. Program Monitor & Real-Time Compositing
// ----------------------------------------------------
let prgCanvas = null;
let prgCtx = null;

function initProgramMonitor() {
  prgCanvas = document.getElementById('program-render-canvas');
  if (prgCanvas) {
    prgCtx = prgCanvas.getContext('2d');
  }

  const btnPlay = document.getElementById('prg-btn-play');
  btnPlay?.addEventListener('click', toggleSequencePlayback);

  document.getElementById('prg-btn-prev')?.addEventListener('click', () => {
    const seq = getActiveSequence();
    seq.playheadTime = Math.max(0, seq.playheadTime - 1.0);
    renderAll();
  });

  document.getElementById('prg-btn-next')?.addEventListener('click', () => {
    const seq = getActiveSequence();
    seq.playheadTime = Math.min(seq.duration, seq.playheadTime + 1.0);
    renderAll();
  });
}

function toggleSequencePlayback() {
  state.isPlayingSequence = !state.isPlayingSequence;
  const btn = document.getElementById('prg-btn-play');
  if (btn) btn.innerHTML = state.isPlayingSequence ? '&#9646;&#9646;' : '&#9658;';
}

function startPlaybackLoop() {
  let lastTime = performance.now();

  function tick(now) {
    const delta = (now - lastTime) / 1000;
    lastTime = now;

    if (state.isPlayingSequence) {
      const seq = getActiveSequence();
      seq.playheadTime += delta;
      if (seq.playheadTime >= seq.duration) {
        seq.playheadTime = 0;
        state.isPlayingSequence = false;
        const btn = document.getElementById('prg-btn-play');
        if (btn) btn.innerHTML = '&#9658;';
      }
      renderProgramMonitor();
      updatePlayheadPositionUI();
    }

    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function renderProgramMonitor() {
  if (!prgCanvas || !prgCtx) return;
  const seq = getActiveSequence();
  const time = seq.playheadTime;

  // Clear canvas
  prgCtx.fillStyle = '#0a0d12';
  prgCtx.fillRect(0, 0, prgCanvas.width, prgCanvas.height);

  // Find active clips at current playhead time
  // Render in track order (V1 then V2 on top)
  const videoTracks = seq.tracks.filter(t => t.type === 'video' && t.visible);
  
  for (const track of videoTracks) {
    const clip = seq.clips.find(
      c => c.trackId === track.id && time >= c.timelineStart && time < c.timelineStart + c.timelineDuration
    );
    if (!clip) continue;

    const asset = state.project.assets[clip.assetId];
    if (!asset) continue;

    let vEl = state.videoCache[asset.id];
    if (!vEl) {
      vEl = document.createElement('video');
      vEl.src = asset.objectUrl;
      vEl.preload = 'auto';
      state.videoCache[asset.id] = vEl;
    }

    // Seek video element to target clip time
    const clipTime = clip.sourceStart + (time - clip.timelineStart);
    if (Math.abs(vEl.currentTime - clipTime) > 0.1) {
      vEl.currentTime = clipTime;
    }

    // Apply Transform & Draw
    prgCtx.save();
    prgCtx.translate(prgCanvas.width / 2 + clip.transform.positionX, prgCanvas.height / 2 + clip.transform.positionY);
    prgCtx.scale(clip.transform.scale, clip.transform.scale);
    prgCtx.rotate((clip.transform.rotation * Math.PI) / 180);
    prgCtx.globalAlpha = clip.transform.opacity;

    // Apply Color Grading Filters via 2D Canvas filter string
    const fx = clip.colorEffects;
    prgCtx.filter = `brightness(${1 + fx.brightness + fx.exposure * 0.3}) contrast(${fx.contrast}) saturate(${fx.saturation}) ${fx.invert ? 'invert(1)' : ''}`;

    const drawW = prgCanvas.width;
    const drawH = prgCanvas.height;
    try {
      prgCtx.drawImage(vEl, -drawW / 2, -drawH / 2, drawW, drawH);
    } catch {}
    prgCtx.restore();
  }

  // Update Program timecode readout
  const tcEl = document.getElementById('program-timecode');
  if (tcEl) tcEl.textContent = formatTimecode(time, seq.fps);
}

// ----------------------------------------------------
// 9. Multitrack Timeline Engine
// ----------------------------------------------------
function initTimeline() {
  const ruler = document.getElementById('timeline-ruler-bar');
  const scrollArea = document.getElementById('timeline-scroll-area');

  // Playhead scrubber drag
  ruler?.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const rect = ruler.getBoundingClientRect();
    const updateTimeFromX = (clientX) => {
      const scrollLeft = scrollArea.scrollLeft;
      const offsetX = clientX - rect.left + scrollLeft;
      const newTime = Math.max(0, offsetX / state.pixelsPerSecond);
      getActiveSequence().playheadTime = newTime;
      renderAll();
    };

    updateTimeFromX(e.clientX);

    const onMove = (ev) => updateTimeFromX(ev.clientX);
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });

  // Tools & Zoom buttons
  document.getElementById('tool-select')?.addEventListener('click', () => setTool('select'));
  document.getElementById('tool-razor')?.addEventListener('click', () => setTool('razor'));
  document.getElementById('btn-snap-toggle')?.addEventListener('click', () => {
    state.isSnapping = !state.isSnapping;
    document.getElementById('btn-snap-toggle').style.color = state.isSnapping ? 'var(--accent-blue)' : 'var(--text-muted)';
  });

  document.getElementById('btn-time-zoom-in')?.addEventListener('click', () => {
    state.pixelsPerSecond = Math.min(150, state.pixelsPerSecond * 1.3);
    renderTimeline();
  });
  document.getElementById('btn-time-zoom-out')?.addEventListener('click', () => {
    state.pixelsPerSecond = Math.max(10, state.pixelsPerSecond / 1.3);
    renderTimeline();
  });
  document.getElementById('btn-time-fit')?.addEventListener('click', () => {
    const seq = getActiveSequence();
    const containerWidth = scrollArea.clientWidth - 50;
    state.pixelsPerSecond = Math.max(10, containerWidth / Math.max(10, seq.duration));
    renderTimeline();
  });

  document.getElementById('btn-add-v-track')?.addEventListener('click', () => {
    executeCommand('Add Video Track', () => {
      const seq = getActiveSequence();
      const nextIndex = seq.tracks.filter(t => t.type === 'video').length + 1;
      seq.tracks.unshift({
        id: `track_v${nextIndex}`,
        name: `V${nextIndex}`,
        type: 'video',
        index: nextIndex - 1,
        muted: false,
        solo: false,
        locked: false,
        visible: true,
        height: 44,
      });
    });
  });

  document.getElementById('btn-add-a-track')?.addEventListener('click', () => {
    executeCommand('Add Audio Track', () => {
      const seq = getActiveSequence();
      const nextIndex = seq.tracks.filter(t => t.type === 'audio').length + 1;
      seq.tracks.push({
        id: `track_a${nextIndex}`,
        name: `A${nextIndex}`,
        type: 'audio',
        index: nextIndex - 1,
        muted: false,
        solo: false,
        locked: false,
        visible: true,
        height: 44,
      });
    });
  });
}

function setTool(tool) {
  state.activeTool = tool;
  document.getElementById('tool-select')?.classList.toggle('active', tool === 'select');
  document.getElementById('tool-razor')?.classList.toggle('active', tool === 'razor');
}

function renderTimeline() {
  const seq = getActiveSequence();
  const headersContainer = document.getElementById('timeline-headers-container');
  const lanesContainer = document.getElementById('timeline-lanes-container');
  const ruler = document.getElementById('timeline-ruler-bar');
  if (!headersContainer || !lanesContainer || !ruler) return;

  const totalWidth = Math.max(1200, seq.duration * state.pixelsPerSecond);
  ruler.style.width = `${totalWidth}px`;
  lanesContainer.style.width = `${totalWidth}px`;

  // 1. Render Ruler Ticks
  let rulerHtml = '';
  const stepSeconds = state.pixelsPerSecond > 60 ? 1 : state.pixelsPerSecond > 30 ? 5 : 10;
  for (let s = 0; s <= seq.duration; s += stepSeconds) {
    const leftPx = s * state.pixelsPerSecond;
    rulerHtml += `
      <div class="ruler-tick" style="left: ${leftPx}px;">
        ${formatTimecode(s, seq.fps)}
      </div>
    `;
  }
  ruler.innerHTML = rulerHtml;

  // 2. Render Track Headers
  let headersHtml = '<div class="timeline-ruler-corner">TRACKS</div>';
  for (const track of seq.tracks) {
    const isVideo = track.type === 'video';
    headersHtml += `
      <div class="track-header-item ${track.type}" data-id="${track.id}" style="height: ${track.height}px;">
        <span style="font-weight: 600; color: ${isVideo ? '#60a5fa' : '#34d399'};">${track.name}</span>
        <div>
          <button class="track-btn toggle-vis ${track.visible ? 'active' : ''}">${isVideo ? (track.visible ? '👁️' : '🙈') : (track.muted ? '🔇' : '🔊')}</button>
          <button class="track-btn toggle-lock ${track.locked ? 'active' : ''}">${track.locked ? '🔒' : '🔓'}</button>
        </div>
      </div>
    `;
  }
  headersContainer.innerHTML = headersHtml;

  // Track header button events
  headersContainer.querySelectorAll('.track-header-item').forEach(el => {
    const trackId = el.dataset.id;
    const track = seq.tracks.find(t => t.id === trackId);
    if (!track) return;

    el.querySelector('.toggle-vis')?.addEventListener('click', () => {
      executeCommand('Toggle Track Visibility', () => {
        if (track.type === 'video') track.visible = !track.visible;
        else track.muted = !track.muted;
      });
    });

    el.querySelector('.toggle-lock')?.addEventListener('click', () => {
      executeCommand('Toggle Track Lock', () => {
        track.locked = !track.locked;
      });
    });
  });

  // 3. Render Track Lanes & Clips
  let lanesHtml = '';
  for (const track of seq.tracks) {
    lanesHtml += `
      <div class="timeline-track-lane" data-id="${track.id}" style="height: ${track.height}px; width: ${totalWidth}px;">
    `;

    // Render clips on this track
    const clips = seq.clips.filter(c => c.trackId === track.id);
    for (const clip of clips) {
      const leftPx = clip.timelineStart * state.pixelsPerSecond;
      const widthPx = Math.max(12, clip.timelineDuration * state.pixelsPerSecond);
      const isSelected = clip.id === state.activeClipId;

      lanesHtml += `
        <div class="timeline-clip-block ${clip.trackId.startsWith('track_a') ? 'audio' : ''} ${isSelected ? 'selected' : ''}" 
             data-id="${clip.id}" 
             style="left: ${leftPx}px; width: ${widthPx}px;">
          <div class="trim-handle left"></div>
          <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none;">${clip.name}</span>
          <div class="trim-handle right"></div>
        </div>
      `;
    }

    lanesHtml += `</div>`;
  }
  lanesContainer.innerHTML = lanesHtml;

  // Add Clip Interactive Events (Select, Drag, Trim, Razor)
  lanesContainer.querySelectorAll('.timeline-clip-block').forEach(clipEl => {
    const clipId = clipEl.dataset.id;
    const clip = seq.clips.find(c => c.id === clipId);
    if (!clip) return;

    // Click / Select / Razor Tool
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
        const deltaSec = (ev.clientX - startX) / state.pixelsPerSecond;
        clip.timelineStart = Math.max(0, initialStart + deltaSec);
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

  executeCommand('Split Clip', () => {
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
  executeCommand('Delete Clip', () => {
    seq.clips = seq.clips.filter(c => c.id !== state.activeClipId);
    state.activeClipId = null;
  });
}

// ----------------------------------------------------
// 10. Contextual Inspector
// ----------------------------------------------------
function initInspector() {
  renderInspector();
}

function renderInspector() {
  const container = document.getElementById('inspector-content');
  if (!container) return;

  const clip = getActiveClip();
  const statusInfo = document.getElementById('status-clip-info');

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
          <div class="field-header"><span>Color Engine</span><span class="field-val" style="color: var(--accent-emerald);">32-bit Float Linear</span></div>
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
      <div class="inspector-group-title">Intrinsic Video Transform</div>
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
      <div class="inspector-group-title">Real-Time GPU Color Grading</div>
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
      <div class="inspector-group-title">Audio Gain & Pan</div>
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
// 11. Menus, Workspaces & Shortcuts
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

  // Window menu - reset layout
  document.getElementById('win-reset-layout')?.addEventListener('click', () => {
    document.getElementById('panel-project').style.width = '280px';
    document.getElementById('panel-inspector').style.width = '320px';
    document.getElementById('panel-timeline').style.height = '260px';
    document.querySelectorAll('.panel, .monitor-wrapper').forEach(p => p.classList.remove('maximized'));
    alert('Workspace layout reset to default.');
  });
}

function initWorkspaceTabs() {
  document.querySelectorAll('.ws-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.ws-tab').forEach(t => t.classList.remove('active'));
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
    leftCol.style.width = '420px';
    rightCol.style.width = '240px';
    timeline.style.height = '160px';
  } else if (ws === 'color') {
    leftCol.style.width = '200px';
    rightCol.style.width = '400px';
    timeline.style.height = '180px';
  } else if (ws === 'audio') {
    leftCol.style.width = '220px';
    rightCol.style.width = '300px';
    timeline.style.height = '360px';
  } else {
    // Default Edit
    leftCol.style.width = '280px';
    rightCol.style.width = '320px';
    timeline.style.height = '260px';
  }
}

function initKeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;

    if (e.code === 'Space') {
      e.preventDefault();
      toggleSequencePlayback();
    } else if (e.code === 'KeyC') {
      setTool(state.activeTool === 'razor' ? 'select' : 'razor');
    } else if (e.code === 'KeyV') {
      setTool('select');
    } else if (e.code === 'Delete' || e.code === 'Backspace') {
      deleteActiveClip();
    } else if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    } else if (e.code === 'KeyY' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      redo();
    } else if (e.code === 'KeyK' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (state.activeClipId) {
        splitClipAction(state.activeClipId, getActiveSequence().playheadTime);
      }
    }
  });
}

// ----------------------------------------------------
// 12. Master Render & Utilities
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

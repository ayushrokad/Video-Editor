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
  FORMAT_REGISTRY,
  EXPORT_PRESETS,
  detectExportCodecs,
  estimateFileSizeMB,
  validateExportConfig,
  RenderQueueManager,
} from './js/export-pipeline.js';
import {
  generateLinkGroupId,
  getLinkedGroupMembers,
  resolveSelectionForClick,
  computeSyncOffsetSeconds,
  applyLinkedMove,
  applyLinkedTrim,
  applyLinkedSplit,
  linkClipsByIds,
  unlinkClipsByIds,
  moveClipIntoSync,
} from './js/linked-clips.js';
import {
  AVAILABLE_CLIP_EFFECTS,
  resolvePropertiesContext,
  ensureEffectsArray,
  addClipEffect,
  toggleClipEffect,
  moveClipEffect,
  removeClipEffect,
  toggleKeyframeAtLocalTime,
  evaluateKeyframedProp,
} from './js/properties-controller.js';
import {
  FrameflowStateStore,
  createDefaultProjectState,
  createDefaultSessionState,
} from './js/state-store.js';
import { FrameflowLayoutManager } from './js/layout-manager.js';
import { PANEL_REGISTRY, PANEL_CATEGORIES, getPanelsByCategory } from './js/panel-registry.js';
import {
  BUILTIN_WORKSPACES,
  findGroupContainingPanel,
  movePanelToZone,
  createStructuredWorkspaceLayout,
} from './js/panel-manager.js';
import { ShortcutRegistry, eventToKeyCombo } from './js/shortcut-registry.js';
import { renderAllSpecialistPanels, renderGraphEditorPanel, renderMediaBrowserPanel } from './js/panel-views.js';

// ----------------------------------------------------
// 1. Core Subsystem Instances
// ----------------------------------------------------
const store = new FrameflowStateStore();
const audioEngine = new FrameflowAudioEngine();
const renderQueue = new RenderQueueManager(() => {
  renderDeliverQueue();
  updateExportStatusTelemetry();
});

const layoutManager = new FrameflowLayoutManager(store, {
  onLayoutChange: () => {
    renderWorkspaceBar();
    renderWindowMenu();
    syncPropertiesToggleButton();
  },
  onPanelActivated: (panelId) => {
    renderPanelById(panelId);
  },
  onOpenContextMenu: (x, y, items) => openContextMenu(x, y, items),
});

const shortcutRegistry = new ShortcutRegistry(
  (() => {
    try { return JSON.parse(localStorage.getItem('ff_shortcuts_v2') || 'null'); } catch { return null; }
  })()
);

const TRACK_COLORS = ['#4B8DFF', '#8B5CF6', '#38C995', '#06B6D4', '#E5B45C', '#E36F78'];

// Non-persistent UI transient helpers + Export Config Draft
const uiState = {
  assetSearchQuery: '',
  selectedFxCategory: 'All',
  pendingRelinkAssetId: null,
  activePropertiesTab: 'properties', // 'properties' | 'audio' | 'effects' | 'motion' | 'metadata'
  pinnedClipId: null,
  undoStack: [],
  redoStack: [],
  deliverMode: 'quick', // 'quick' | 'advanced'
  customExportPresets: JSON.parse(localStorage.getItem('ff_export_presets') || '[]'),
  exportConfig: {
    presetId: 'match_high',
    formatId: 'mp4_h264',
    filename: 'Master_Sequence_Final',
    rangeMode: 'entire', // 'entire' | 'inout' | 'selected'
    matchSequence: true,
    width: 1920,
    height: 1080,
    fps: 24,
    scaling: 'fit',
    quality: 'high',
    rateControl: 'vbr1',
    bitrateMbps: 20,
    exportVideo: true,
    exportAudio: true,
    audioSampleRate: 48000,
    audioBitDepth: 16,
    audioChannels: 'stereo',
    audioBitrateKbps: 320,
    colorSpace: 'Rec.709',
    captionsMode: 'none', // 'none' | 'burn' | 'srt'
  },
};

// ----------------------------------------------------
// 2. Accessor Helpers (Single Source of Truth)
// ----------------------------------------------------
function getActiveSequence() {
  return store.projectState.sequences[store.sessionState.activeSequenceId]
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
  // Clip selection is temporary interaction state — NEVER marks project dirty or triggers save!
  store.sessionState.selectedClipIds = (ids || []).filter(id => valid.has(id));
}

function updateSaveStatusBadgeUI(diag) {
  const badge = document.getElementById('save-status-badge');
  const retryBtn = document.getElementById('btn-retry-save');
  if (!badge) return;
  const status = diag?.status || 'saved';
  if (retryBtn) retryBtn.style.display = status === 'failed' ? 'inline-flex' : 'none';

  if (status === 'unsaved') {
    badge.textContent = '● Unsaved changes';
    badge.className = 'save-status-indicator unsaved';
    badge.title = `Project modified (rev ${diag.currentRevision}) · Autosaving shortly`;
  } else if (status === 'saving') {
    badge.textContent = 'Saving...';
    badge.className = 'save-status-indicator saving';
    badge.title = 'Saving project to IndexedDB...';
  } else if (status === 'failed') {
    badge.textContent = 'Save failed';
    badge.className = 'save-status-indicator failed';
    badge.title = `Unable to save changes: ${diag.lastError || 'Storage error'}. Click Retry.`;
  } else if (status === 'offline') {
    badge.textContent = '● Offline';
    badge.className = 'save-status-indicator offline';
    badge.title = 'Browser is offline — local IndexedDB persistence remains active';
  } else if (status === 'recovering') {
    badge.textContent = 'Recovering...';
    badge.className = 'save-status-indicator recovering';
    badge.title = 'Recovering project from latest snapshot';
  } else {
    const ts = diag?.lastSavedAt
      ? ` ${new Date(diag.lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
      : '';
    badge.textContent = `● Saved${ts}`;
    badge.className = 'save-status-indicator saved';
    badge.title = diag?.lastSavedAt
      ? `All changes saved (rev ${diag.lastSavedRevision}, ${diag.lastSaveDurationMs}ms)`
      : 'All changes saved';
  }

  // Refresh Save Diagnostics section live if Project Information panel is open
  if (layoutManager.isPanelVisible('project-info')) {
    renderAllSpecialistPanels(getPanelViewContext());
  }
}

// ----------------------------------------------------
// 3. Boot & Lifecycle (Restore 4 State Layers + Rehydrate Media Decoders)
// ----------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  store.onProjectStatusChange = (diag) => updateSaveStatusBadgeUI(diag);

  document.getElementById('btn-retry-save')?.addEventListener('click', () => {
    store.retryProjectSave();
  });

  window.addEventListener('online', () => store.autosave.setOffline(false));
  window.addEventListener('offline', () => store.autosave.setOffline(true));
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    store.autosave.setOffline(true);
  }

  layoutManager.init();
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

  // Best-effort lifecycle flush ONLY when Project or Workspace actually has pending dirty changes
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      store.flushWorkspaceNow('visibility-hidden');
      if (store.autosave.hasPendingChanges()) store.saveProjectNow({ reason: 'visibility-hidden', manual: false });
    }
  });
  window.addEventListener('beforeunload', () => {
    store.flushWorkspaceNow('beforeunload');
    if (store.autosave.hasPendingChanges()) store.saveProjectNow({ reason: 'beforeunload', manual: false });
  });

  await probeRuntimeCapabilities();
  await store.restoreAll();

  // Guard startup UI restoration so hydration NEVER triggers spurious IndexedDB writes!
  store.isHydrating = true;
  try {
    await rehydrateAllMediaDecoders();
    syncSessionControlsUI();
    applyWorkspaceUI(store.workspaceState.activeWorkspace);
    renderAll();

    if (store.sessionState.sourceAssetId) {
      loadAssetIntoSourceMonitor(store.sessionState.sourceAssetId, {
        preserveInOut: true,
        switchTab: false,
      });
    }

    const scrollArea = document.getElementById('timeline-scroll-area');
    if (scrollArea && store.sessionState.timelineScrollLeft > 0) {
      scrollArea.scrollLeft = store.sessionState.timelineScrollLeft;
    }
  } finally {
    store.isHydrating = false;
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
// 8. Workspace Switching, Reorderable Bar & Central Window Menu
// ----------------------------------------------------
function getWorkspaceMeta(wsId) {
  const builtin = BUILTIN_WORKSPACES.find(w => w.id === wsId);
  if (builtin) return { ...builtin, isCustom: false };
  const custom = (store.workspaceState.customWorkspaces || []).find(c => c.id === wsId);
  if (custom) return { id: custom.id, name: custom.name, primary: false, isCustom: true, custom };
  return { id: 'edit', name: 'Editing', primary: true, isCustom: false };
}

function initWorkspaceSwitcher() {
  const moreBtn = document.getElementById('btn-ws-more');
  const moreMenu = document.getElementById('ws-more-dropdown');
  moreBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    renderWorkspaceMoreDropdown();
    moreMenu?.classList.toggle('open');
  });
  document.addEventListener('click', (e) => {
    if (moreMenu && !moreMenu.contains(e.target) && !moreBtn?.contains(e.target)) {
      moreMenu.classList.remove('open');
    }
  });
}

function renderWorkspaceBar() {
  const bar = document.getElementById('workspace-bar');
  if (!bar) return;

  const activeWs = store.workspaceState.activeWorkspace || 'edit';
  const order = store.workspaceState.workspaceOrder || BUILTIN_WORKSPACES.map(w => w.id);
  const primaryIds = order.filter(id => {
    const b = BUILTIN_WORKSPACES.find(w => w.id === id);
    return b && b.primary;
  });

  // If the currently active workspace is a secondary or custom workspace, also show its pill on the bar
  const barIds = [...primaryIds];
  if (!barIds.includes(activeWs)) barIds.push(activeWs);

  bar.innerHTML = barIds.map(id => {
    const meta = getWorkspaceMeta(id);
    return `<button class="ws-tab ${activeWs === id ? 'active' : ''}" data-ws="${id}" draggable="true" title="Switch to ${meta.name} (drag to reorder)">${meta.isCustom ? '★ ' : ''}${meta.name}</button>`;
  }).join('');

  let dragSrcId = null;
  bar.querySelectorAll('.ws-tab').forEach(tab => {
    const wsId = tab.dataset.ws;
    tab.addEventListener('click', () => switchWorkspace(wsId));

    tab.addEventListener('dragstart', (e) => {
      dragSrcId = wsId;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', wsId);
    });
    tab.addEventListener('dragover', (e) => {
      if (!dragSrcId || dragSrcId === wsId) return;
      e.preventDefault();
      tab.classList.add('ws-drag-over');
    });
    tab.addEventListener('dragleave', () => tab.classList.remove('ws-drag-over'));
    tab.addEventListener('drop', (e) => {
      e.preventDefault();
      tab.classList.remove('ws-drag-over');
      if (!dragSrcId || dragSrcId === wsId) return;
      const list = [...(store.workspaceState.workspaceOrder || BUILTIN_WORKSPACES.map(w => w.id))];
      const fromIdx = list.indexOf(dragSrcId);
      const toIdx = list.indexOf(wsId);
      if (fromIdx >= 0 && toIdx >= 0) {
        const [moved] = list.splice(fromIdx, 1);
        list.splice(toIdx, 0, moved);
        store.workspaceState.workspaceOrder = list;
        store.scheduleWorkspaceSave('workspace-reorder', 300);
        renderWorkspaceBar();
      }
      dragSrcId = null;
    });
  });
}

function renderWorkspaceMoreDropdown() {
  const dd = document.getElementById('ws-more-dropdown');
  if (!dd) return;
  const activeWs = store.workspaceState.activeWorkspace || 'edit';
  const activeMeta = getWorkspaceMeta(activeWs);
  const secondary = BUILTIN_WORKSPACES.filter(w => !w.primary);
  const customs = store.workspaceState.customWorkspaces || [];

  dd.innerHTML = `
    <div class="menu-section-label">ADDITIONAL PRESETS</div>
    ${secondary.map(w => `
      <div class="menu-entry" data-ws-pick="${w.id}">
        <span>${activeWs === w.id ? '✓ ' : '   '}${w.name}</span>
        <span class="menu-shortcut">${w.shortcut || ''}</span>
      </div>
    `).join('')}
    ${customs.length > 0 ? `
      <div class="menu-sep"></div>
      <div class="menu-section-label">CUSTOM WORKSPACES</div>
      ${customs.map(c => `
        <div class="menu-entry" data-ws-pick="${c.id}">
          <span>${activeWs === c.id ? '✓ ' : '★ '}${c.name}</span>
          <span class="menu-shortcut" data-ws-del="${c.id}" title="Delete Custom Workspace">✕</span>
        </div>
      `).join('')}
    ` : ''}
    <div class="menu-sep"></div>
    <div class="menu-section-label">MANAGE WORKSPACES</div>
    <div class="menu-entry" id="ws-act-save"><span>Save Workspace Changes</span></div>
    <div class="menu-entry" id="ws-act-save-new"><span>Save as New Workspace...</span></div>
    ${activeMeta.isCustom ? `<div class="menu-entry" id="ws-act-rename"><span>Rename "${activeMeta.name}"...</span></div>` : ''}
    <div class="menu-entry" id="ws-act-duplicate"><span>Duplicate Current Workspace</span></div>
    ${activeMeta.isCustom ? `<div class="menu-entry" id="ws-act-delete" style="color: var(--error);"><span>Delete "${activeMeta.name}"</span></div>` : ''}
    <div class="menu-sep"></div>
    <div class="menu-entry" id="ws-act-reset"><span>Reset Current Workspace</span></div>
    <div class="menu-entry" id="ws-act-reset-all"><span>Restore Default Workspaces</span></div>
  `;

  dd.querySelectorAll('[data-ws-pick]').forEach(el => el.addEventListener('click', (e) => {
    if (e.target.dataset.wsDel) {
      e.stopPropagation();
      deleteCustomWorkspace(e.target.dataset.wsDel);
      renderWorkspaceMoreDropdown();
      return;
    }
    dd.classList.remove('open');
    switchWorkspace(el.dataset.wsPick);
  }));

  dd.querySelector('#ws-act-save')?.addEventListener('click', () => { dd.classList.remove('open'); store.flushWorkspaceNow('save-workspace'); });
  dd.querySelector('#ws-act-save-new')?.addEventListener('click', () => { dd.classList.remove('open'); saveAsNewWorkspacePrompt(); });
  dd.querySelector('#ws-act-rename')?.addEventListener('click', () => { dd.classList.remove('open'); renameActiveCustomWorkspacePrompt(); });
  dd.querySelector('#ws-act-duplicate')?.addEventListener('click', () => { dd.classList.remove('open'); duplicateActiveWorkspace(); });
  dd.querySelector('#ws-act-delete')?.addEventListener('click', () => { dd.classList.remove('open'); deleteCustomWorkspace(activeWs); });
  dd.querySelector('#ws-act-reset')?.addEventListener('click', () => { dd.classList.remove('open'); layoutManager.resetCurrentWorkspace(); renderAll(); });
  dd.querySelector('#ws-act-reset-all')?.addEventListener('click', () => { dd.classList.remove('open'); layoutManager.resetAllWorkspaces(); applyWorkspaceUI(store.workspaceState.activeWorkspace); renderAll(); });
}

function saveAsNewWorkspacePrompt() {
  const curMeta = getWorkspaceMeta(store.workspaceState.activeWorkspace);
  const name = prompt('Save as New Workspace Name:', `Custom ${curMeta.name}`);
  if (!name || !name.trim()) return;
  const id = `cws_${Date.now()}`;
  const layoutCopy = JSON.parse(JSON.stringify(layoutManager.getActiveLayout()));
  layoutCopy.id = id;
  store.workspaceState.customWorkspaces.push({
    id,
    name: name.trim(),
    baseWorkspace: curMeta.isCustom ? (curMeta.custom.baseWorkspace || 'edit') : curMeta.id,
    layout: layoutCopy,
  });
  store.workspaceState.activeWorkspace = id;
  store.flushWorkspaceNow('save-new-workspace');
  applyWorkspaceUI(id);
  renderAll();
}

function renameActiveCustomWorkspacePrompt() {
  const wsId = store.workspaceState.activeWorkspace;
  const custom = (store.workspaceState.customWorkspaces || []).find(c => c.id === wsId);
  if (!custom) return;
  const next = prompt('Rename Custom Workspace:', custom.name);
  if (!next || !next.trim()) return;
  custom.name = next.trim();
  store.flushWorkspaceNow('rename-workspace');
  renderWorkspaceBar();
  renderWindowMenu();
}

function duplicateActiveWorkspace() {
  const curMeta = getWorkspaceMeta(store.workspaceState.activeWorkspace);
  const id = `cws_${Date.now()}`;
  const layoutCopy = JSON.parse(JSON.stringify(layoutManager.getActiveLayout()));
  layoutCopy.id = id;
  store.workspaceState.customWorkspaces.push({
    id,
    name: `${curMeta.name} Copy`,
    baseWorkspace: curMeta.isCustom ? (curMeta.custom.baseWorkspace || 'edit') : curMeta.id,
    layout: layoutCopy,
  });
  store.workspaceState.activeWorkspace = id;
  store.flushWorkspaceNow('duplicate-workspace');
  applyWorkspaceUI(id);
  renderAll();
}

function deleteCustomWorkspace(wsId) {
  store.workspaceState.customWorkspaces = (store.workspaceState.customWorkspaces || []).filter(c => c.id !== wsId);
  if (store.workspaceState.activeWorkspace === wsId) {
    store.workspaceState.activeWorkspace = 'edit';
  }
  store.flushWorkspaceNow('delete-workspace');
  applyWorkspaceUI(store.workspaceState.activeWorkspace);
  renderAll();
}

function switchWorkspace(ws) {
  // ONLY updates workspaceState — NEVER modifies projectState, sessionState, or Project Save Status!
  const target = ws === 'motion' ? 'effects' : ws;
  if (store.workspaceState.activeWorkspace !== target) {
    store.workspaceState.activeWorkspace = target;
    store.scheduleWorkspaceSave('workspace-switch', 350);
  }
  applyWorkspaceUI(target);
  renderAll();
}

function applyWorkspaceUI(ws) {
  layoutManager.applyActiveWorkspaceLayout();
  renderWorkspaceBar();
  renderWindowMenu();
  syncPropertiesToggleButton();
  setTimeout(() => {
    drawMotionGraphCanvas();
    renderGraphEditorPanel(getPanelViewContext());
    const prg = document.getElementById('program-render-canvas');
    if (prg) renderLiveColorScopes(prg);
  }, 20);
}

function renderWindowMenu() {
  const dd = document.getElementById('window-menu-dropdown');
  if (!dd) return;
  const activeWs = store.workspaceState.activeWorkspace || 'edit';
  const activeMeta = getWorkspaceMeta(activeWs);
  const byCategory = getPanelsByCategory();
  const focusedGroup = layoutManager.getFocusedGroup();
  const customs = store.workspaceState.customWorkspaces || [];

  dd.innerHTML = `
    <div class="menu-section-label">WORKSPACES</div>
    ${BUILTIN_WORKSPACES.map(w => `
      <div class="menu-entry" data-win-ws="${w.id}">
        <span>${activeWs === w.id ? '✓ ' : '   '}${w.name}</span>
        <span class="menu-shortcut">${w.shortcut || ''}</span>
      </div>
    `).join('')}
    ${customs.map(c => `
      <div class="menu-entry" data-win-ws="${c.id}">
        <span>${activeWs === c.id ? '✓ ' : '★ '}${c.name}</span>
        <span class="menu-shortcut" data-win-del-ws="${c.id}" title="Delete Workspace">✕</span>
      </div>
    `).join('')}
    <div class="menu-sep"></div>
    <div class="menu-entry" id="win-save-ws"><span>Save as New Workspace...</span></div>
    ${activeMeta.isCustom ? `<div class="menu-entry" id="win-rename-ws"><span>Rename Current Workspace...</span></div>` : ''}
    <div class="menu-entry" id="win-dup-ws"><span>Duplicate Current Workspace</span></div>
    <div class="menu-entry" id="win-reset-current-ws"><span>Reset Current Workspace</span></div>
    <div class="menu-entry" id="win-reset-all-ws"><span>Restore Default Workspaces</span></div>
    <div class="menu-sep"></div>
    <div class="menu-section-label">PANELS (CLICK TO OPEN OR FOCUS)</div>
    <div class="window-panels-scroll">
      ${PANEL_CATEGORIES.map(cat => `
        <div class="menu-cat-label">${cat}</div>
        ${(byCategory[cat] || []).map(p => {
          const open = layoutManager.isPanelVisible(p.id);
          return `
            <div class="menu-entry" data-win-panel="${p.id}">
              <span>${open ? '✓ ' : '   '}${p.title}</span>
              ${p.status === 'planned' ? `<span class="menu-planned-tag">Planned</span>` : ''}
            </div>
          `;
        }).join('')}
      `).join('')}
    </div>
    <div class="menu-section-label">PANEL MANAGEMENT</div>
    <div class="menu-entry" id="win-pm-tabbed"><span>Group Panels (Tabbed Mode)</span></div>
    <div class="menu-entry" id="win-pm-stacked"><span>Stack Panels (Accordion Mode)</span></div>
    ${focusedGroup?.mode === 'stacked' ? `<div class="menu-entry" id="win-pm-solo"><span>${focusedGroup.soloMode ? '✓ ' : ''}Toggle Stacked Solo Mode</span></div>` : ''}
    <div class="menu-entry" id="win-pm-undock"><span>Undock Active Panel (Float)</span></div>
    <div class="menu-entry" id="win-pm-max"><span>Maximize / Restore Active Group</span><span class="menu-shortcut">\`</span></div>
    <div class="menu-entry" id="win-pm-close"><span>Close Active Panel</span></div>
    <div class="menu-entry" id="win-pm-restore"><span>Restore Default Layout</span></div>
  `;

  dd.querySelectorAll('[data-win-ws]').forEach(el => el.addEventListener('click', (e) => {
    if (e.target.dataset.winDelWs) {
      e.stopPropagation();
      deleteCustomWorkspace(e.target.dataset.winDelWs);
      return;
    }
    switchWorkspace(el.dataset.winWs);
  }));

  dd.querySelectorAll('[data-win-panel]').forEach(el => el.addEventListener('click', () => {
    const pid = el.dataset.winPanel;
    layoutManager.focusOrOpenPanel(pid);
    renderPanelById(pid);
  }));

  dd.querySelector('#win-save-ws')?.addEventListener('click', saveAsNewWorkspacePrompt);
  dd.querySelector('#win-rename-ws')?.addEventListener('click', renameActiveCustomWorkspacePrompt);
  dd.querySelector('#win-dup-ws')?.addEventListener('click', duplicateActiveWorkspace);
  dd.querySelector('#win-reset-current-ws')?.addEventListener('click', () => { layoutManager.resetCurrentWorkspace(); renderAll(); });
  dd.querySelector('#win-reset-all-ws')?.addEventListener('click', () => { layoutManager.resetAllWorkspaces(); applyWorkspaceUI(store.workspaceState.activeWorkspace); renderAll(); });

  dd.querySelector('#win-pm-tabbed')?.addEventListener('click', () => {
    const g = layoutManager.getFocusedGroup();
    if (g) layoutManager.setGroupMode(g.id, 'tabbed');
  });
  dd.querySelector('#win-pm-stacked')?.addEventListener('click', () => {
    const g = layoutManager.getFocusedGroup();
    if (g) layoutManager.setGroupMode(g.id, 'stacked');
  });
  dd.querySelector('#win-pm-solo')?.addEventListener('click', () => {
    const g = layoutManager.getFocusedGroup();
    if (g) layoutManager.toggleGroupSoloMode(g.id);
  });
  dd.querySelector('#win-pm-undock')?.addEventListener('click', () => {
    const g = layoutManager.getFocusedGroup();
    if (g?.activePanelId) layoutManager.undockPanel(g.activePanelId);
  });
  dd.querySelector('#win-pm-max')?.addEventListener('click', () => layoutManager.toggleMaximizeGroup());
  dd.querySelector('#win-pm-close')?.addEventListener('click', () => {
    const g = layoutManager.getFocusedGroup();
    if (g?.activePanelId) layoutManager.closePanel(g.activePanelId);
  });
  dd.querySelector('#win-pm-restore')?.addEventListener('click', () => { layoutManager.resetCurrentWorkspace(); renderAll(); });
}

function renderPanelById(panelId) {
  if (!panelId) return;
  if (panelId === 'properties') renderInspector();
  else if (panelId === 'project') renderAssetsList();
  else if (panelId === 'effects-library') renderEffectsLibrary();
  else if (panelId === 'lut-browser') renderColorClipsGallery();
  else if (panelId === 'audio-mixer') renderAudioConsole();
  else if (panelId === 'export-settings') renderDeliverSettings();
  else if (panelId === 'render-queue') renderDeliverQueue();
  else if (panelId === 'history') renderHistoryPanel();
  else if (panelId === 'markers') renderMarkersPanel();
  else if (panelId === 'timeline') renderTimeline();
  else if (panelId === 'program-monitor') renderProgramMonitor();
  else if (panelId === 'video-scopes') {
    const prg = document.getElementById('program-render-canvas');
    if (prg) renderLiveColorScopes(prg);
  }
  else if (panelId === 'graph-editor') renderGraphEditorPanel(getPanelViewContext());
  else renderAllSpecialistPanels(getPanelViewContext());
}

function syncPropertiesToggleButton() {
  const btn = document.getElementById('btn-toggle-properties');
  if (btn) btn.classList.toggle('header-toggle-active', layoutManager.isPanelVisible('properties'));
}

function initPanelFocusAndMaximize() {
  // Header Properties toolbar toggle (NEVER alters timeline selection or project state!)
  document.getElementById('btn-toggle-properties')?.addEventListener('click', () => {
    layoutManager.togglePanelVisibility('properties');
    if (layoutManager.isPanelVisible('properties')) renderInspector();
  });

  // Pin / Unpin Properties button (preserves inspected object without altering timeline selection!)
  document.getElementById('btn-pin-properties')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (uiState.pinnedClipId) {
      uiState.pinnedClipId = null;
    } else {
      const curId = getSelectedClipId();
      if (!curId) return;
      uiState.pinnedClipId = curId;
    }
    document.getElementById('btn-pin-properties')?.classList.toggle('pin-active-btn', !!uiState.pinnedClipId);
    renderInspector();
  });

  document.getElementById('btn-markers-panel-add')?.addEventListener('click', addMarkerAtPlayhead);
}

// ----------------------------------------------------
// 9. Media Ingest, Project Panel & Relink Handler
// ----------------------------------------------------
function initMediaIngestAndRelink() {
  const fileInput = document.getElementById('video-file-input');
  const relinkInput = document.getElementById('relink-file-input');
  const dropzone = document.getElementById('media-dropzone');
  const trigger = async () => {
    // Prefer File System Access API where supported (stores lightweight FileSystemFileHandle, zero binary duplication!)
    if (typeof window.showOpenFilePicker === 'function') {
      try {
        const handles = await window.showOpenFilePicker({
          multiple: true,
          types: [{
            description: 'Media Files (Video, Audio, Images)',
            accept: {
              'video/*': ['.mp4', '.mov', '.webm', '.mkv', '.m4v'],
              'audio/*': ['.wav', '.mp3', '.aac', '.m4a', '.ogg', '.flac'],
              'image/*': ['.png', '.jpg', '.jpeg', '.webp'],
            },
          }],
        });
        const files = await Promise.all(handles.map(h => h.getFile()));
        if (files.length > 0) await handleFilesIngest(files, handles);
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return; // User cancelled picker
      }
    }
    fileInput?.click();
  };

  dropzone?.addEventListener('click', trigger);
  dropzone?.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.style.borderColor = 'var(--accent)'; });
  dropzone?.addEventListener('dragleave', () => { dropzone.style.borderColor = 'var(--border)'; });
  dropzone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--border)';
    if (e.dataTransfer.files?.length) handleFilesIngest(Array.from(e.dataTransfer.files));
  });

  document.getElementById('btn-import-media')?.addEventListener('click', trigger);
  document.getElementById('btn-mb-import')?.addEventListener('click', trigger);
  document.getElementById('src-empty-import-btn')?.addEventListener('click', trigger);
  document.getElementById('prg-empty-import-btn')?.addEventListener('click', trigger);
  document.getElementById('prg-empty-title-btn')?.addEventListener('click', () => addTitleOverlayClip());
  document.getElementById('src-btn-relink')?.addEventListener('click', () => {
    if (store.sessionState.sourceAssetId) triggerRelinkForAsset(store.sessionState.sourceAssetId);
  });

  // Open Project JSON Archive
  const openProjInput = document.getElementById('open-project-file-input');
  openProjInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    openProjInput.value = '';
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || !parsed.sequences) { alert('Invalid FRAMEFLOW project JSON file.'); return; }
      store.projectState = parsed;
      store.sessionState = createDefaultSessionState();
      store.sessionState.activeSequenceId = parsed.activeSequenceId || Object.keys(parsed.sequences)[0];
      store.runtimeState.decoders.clear();
      await rehydrateAllMediaDecoders();
      store.flushNow();
      syncSessionControlsUI();
      renderAll();
    } catch {
      alert('Failed to read project JSON file.');
    }
  });

  document.getElementById('media-browser-search-input')?.addEventListener('input', () => {
    renderMediaBrowserPanel(getPanelViewContext());
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

async function handleFilesIngest(files, fileHandles = []) {
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const fileHandle = fileHandles[i] || null;
    const assetId = `asset_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const isVideo = file.type.startsWith('video');
    const isAudio = file.type.startsWith('audio');

    const asset = {
      id: assetId,
      name: file.name,
      size: file.size,
      lastModified: file.lastModified || 0,
      type: file.type || 'video/mp4',
      duration: 10,
      width: 1920,
      height: 1080,
      addedAt: new Date().toLocaleTimeString(),
    };
    store.projectState.assets[assetId] = asset;
    store.projectState.bins.bin_root.assetIds.push(assetId);

    // Media storage policy: prefer FileSystemFileHandle, else deduplicated fallback blob
    await store.saveMediaAsset(asset, { fileOrBlob: file, fileHandle });

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

  const allAssets = Object.values(store.projectState.assets);
  const seq = getActiveSequence();
  const footer = document.getElementById('project-panel-footer');
  if (footer) {
    footer.innerHTML = `<span>${allAssets.length} ${allAssets.length === 1 ? 'asset' : 'assets'} · ${seq.clips.length} ${seq.clips.length === 1 ? 'clip' : 'clips'}</span><span>${seq.width}×${seq.height} · ${seq.fps}fps</span>`;
  }

  const assets = allAssets.filter(a =>
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
  });

  document.getElementById('src-btn-mark-out')?.addEventListener('click', () => {
    if (!srcVideo || !store.sessionState.sourceAssetId) return;
    store.sessionState.sourceOutPoint = Math.max(store.sessionState.sourceInPoint + 0.1, srcVideo.currentTime);
    updateSourceScrubberUI();
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
  });

  document.getElementById('btn-toggle-safe-margins')?.addEventListener('click', () => {
    store.sessionState.programSafeMargins = !store.sessionState.programSafeMargins;
    document.getElementById('safe-margins-overlay')?.classList.toggle('visible', store.sessionState.programSafeMargins);
    document.getElementById('btn-toggle-safe-margins')?.classList.toggle('active', store.sessionState.programSafeMargins);
  });

  document.getElementById('prg-btn-overlays')?.addEventListener('click', () => {
    store.sessionState.programOverlays = !store.sessionState.programOverlays;
    document.getElementById('program-overlays-hud')?.classList.toggle('visible', store.sessionState.programOverlays);
    document.getElementById('prg-btn-overlays')?.classList.toggle('active', store.sessionState.programOverlays);
  });

  document.getElementById('prg-btn-compare')?.addEventListener('click', () => {
    store.sessionState.programCompareMode = !store.sessionState.programCompareMode;
    document.getElementById('prg-btn-compare')?.classList.toggle('active', store.sessionState.programCompareMode);
    renderProgramMonitor();
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
  });

  document.getElementById('monitor-res-select')?.addEventListener('change', (e) => {
    store.sessionState.programPlaybackResolution = e.target.value;
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
}

function switchMonitorTab(tab) {
  store.sessionState.activeMonitorTab = tab;
  const targetPanel = tab === 'source' ? 'source-monitor' : 'program-monitor';
  layoutManager.focusOrOpenPanel(targetPanel);
  updateMonitorsLayoutUI();
}

function toggleMonitorSplitView() {
  const layout = layoutManager.getActiveLayout();
  const srcGrp = findGroupContainingPanel(layout.root, 'source-monitor');
  const prgGrp = findGroupContainingPanel(layout.root, 'program-monitor');

  if (srcGrp && prgGrp && srcGrp.id !== prgGrp.id) {
    // Merge Source back into Program's tab group (Single Tabbed Viewer)
    movePanelToZone(layout, 'source-monitor', prgGrp.id, 'center', 0);
    store.sessionState.monitorMode = 'single';
  } else if (prgGrp) {
    // Split Source side-by-side to the left of Program Monitor!
    if (!srcGrp) layoutManager.openPanel('source-monitor', prgGrp.id);
    movePanelToZone(layout, 'source-monitor', prgGrp.id, 'left');
    store.sessionState.monitorMode = 'split';
  } else {
    switchWorkspace('dual-viewer');
    return;
  }

  layoutManager.applyActiveWorkspaceLayout();
  renderWindowMenu();
  updateMonitorsLayoutUI();
  store.scheduleWorkspaceSave('monitor-split-toggle', 300);
}

function updateMonitorsLayoutUI() {
  const layout = layoutManager.getActiveLayout();
  const srcGrp = findGroupContainingPanel(layout.root, 'source-monitor');
  const prgGrp = findGroupContainingPanel(layout.root, 'program-monitor');
  const isSplit = Boolean(srcGrp && prgGrp && srcGrp.id !== prgGrp.id);
  store.sessionState.monitorMode = isSplit ? 'split' : 'single';

  const splitLabel = document.getElementById('split-view-btn-label');
  if (splitLabel) splitLabel.textContent = isSplit ? 'Single Tab' : 'Dual View';
  renderProgramMonitor();
  updateSourceScrubberUI();
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

    const createVideo = !!(videoTrack && !asset.type.startsWith('audio') && (!explicitTrack || explicitTrack.type === 'video'));
    const createAudio = !!(audioTrack && (asset.type.startsWith('audio') || !explicitTrack || explicitTrack.type === 'video'));
    const sharedLinkGroupId = (createVideo && createAudio) ? generateLinkGroupId() : null;
    const createdIds = [];

    if (createVideo) {
      const vId = `clip_v_${Date.now()}`;
      seq.clips.push({
        id: vId,
        assetId: asset.id,
        mediaType: 'video',
        linkGroupId: sharedLinkGroupId,
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
      createdIds.push(vId);
    }

    if (createAudio) {
      const aId = `clip_a_${Date.now()}_a`;
      seq.clips.push({
        id: aId,
        assetId: asset.id,
        mediaType: 'audio',
        linkGroupId: sharedLinkGroupId,
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
      createdIds.push(aId);
    }

    if (createdIds.length > 0) setSelectedClipIds(createdIds);
    store.sessionState.playheadTime = startTime + 0.05;
  });

  if (store.sessionState.monitorMode === 'single') {
    switchMonitorTab('program');
  }
}

function addTitleOverlayClip(presetText = null, posY = 0) {
  const seq = getActiveSequence();
  const overlayTrack = seq.tracks.find(t => t.id === 'track_v2') || seq.tracks.find(t => t.type === 'video');
  if (!overlayTrack) return;
  const text = typeof presetText === 'string' && presetText.trim()
    ? presetText.trim()
    : (prompt('Enter Title Text:', 'FRAMEFLOW STUDIO') || 'FRAMEFLOW STUDIO');
  executeCommand('Add Title Overlay', () => {
    const id = `clip_title_${Date.now()}`;
    seq.clips.push({
      id,
      assetId: null,
      isTitle: true,
      titleText: text,
      titleFontSize: posY > 0 ? 54 : 92,
      name: `Title: ${text}`,
      trackId: overlayTrack.id,
      timelineStart: store.sessionState.playheadTime,
      timelineDuration: 5,
      sourceStart: 0,
      speed: 1,
      transform: { positionX: 0, positionY: posY || 0, scale: 1, rotation: 0, opacity: 1 },
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
  // Playhead scrubbing is temporary interaction state — NEVER marks project dirty or triggers save!
  store.sessionState.playheadTime = Math.max(0, Math.min(seq.duration, timeSec));
  updatePlayheadPositionUI();
  renderProgramMonitor();
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
  const clipsAtTime = seq.clips.filter(c => !c.disabled && timeSec >= c.timelineStart && timeSec <= c.timelineStart + c.timelineDuration);

  const buildFilterString = (clip) => {
    const c = clip.colorEffects || {};
    let bright = Math.max(0.1, 1 + (c.brightness || 0) + (c.exposure || 0) * 0.25 + (c.lift || 0) * 0.2 + (c.gain || 0) * 0.2);
    let cont = Math.max(0.1, c.contrast || 1);
    let sat = Math.max(0, c.saturation ?? 1);
    let hue = (c.temperature || 0) * 0.4;
    let extra = '';

    for (const fx of (clip.appliedEffects || [])) {
      if (!fx.enabled) continue;
      if (fx.id === 'color_grade') {
        bright = Math.max(0.1, bright + (fx.params.exposure || 0) * 0.25);
        cont *= Math.max(0.1, fx.params.contrast ?? 1);
        sat *= Math.max(0, fx.params.saturation ?? 1);
        hue += (fx.params.temperature || 0) * 0.4;
      } else if (fx.id === 'gaussian_blur') {
        extra += ` blur(${(fx.params.radiusPx || 0).toFixed(1)}px)`;
      } else if (fx.id === 'grayscale') {
        extra += ` grayscale(${Math.round((fx.params.amount ?? 1) * 100)}%)`;
      } else if (fx.id === 'sepia') {
        extra += ` sepia(${Math.round((fx.params.amount ?? 0.7) * 100)}%)`;
      } else if (fx.id === 'invert') {
        extra += ` invert(${Math.round((fx.params.amount ?? 1) * 100)}%)`;
      }
    }
    let f = `brightness(${bright.toFixed(2)}) contrast(${cont.toFixed(2)}) saturate(${sat.toFixed(2)}) hue-rotate(${hue.toFixed(0)}deg)${extra}`;
    if (c.invert) f += ' invert(100%)';
    return f;
  };

  const drawSingleClip = (clip, skipGrade = false) => {
    ctx.save();
    const localT = Math.max(0, timeSec - clip.timelineStart);
    const t = clip.transform;
    const posX = evaluateKeyframedProp(clip, 'positionX', localT, t.positionX || 0);
    const posY = evaluateKeyframedProp(clip, 'positionY', localT, t.positionY || 0);
    const sc   = evaluateKeyframedProp(clip, 'scale',     localT, t.scale ?? 1);
    const rot  = evaluateKeyframedProp(clip, 'rotation',  localT, t.rotation || 0);
    const opac = evaluateKeyframedProp(clip, 'opacity',   localT, t.opacity ?? 1);

    if (clip.blendMode && clip.blendMode !== 'source-over') {
      ctx.globalCompositeOperation = clip.blendMode;
    }

    // Apply Crop clip region if set
    const crop = clip.crop;
    if (crop && (crop.top || crop.bottom || crop.left || crop.right)) {
      const cx = (crop.left / 100) * width;
      const cy = (crop.top / 100) * height;
      const cw = width * Math.max(0.05, 1 - (crop.left + crop.right) / 100);
      const ch = height * Math.max(0.05, 1 - (crop.top + crop.bottom) / 100);
      ctx.beginPath();
      ctx.rect(cx, cy, cw, ch);
      ctx.clip();
    }

    ctx.translate(width / 2 + posX, height / 2 + posY);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.scale(sc, sc);
    ctx.globalAlpha *= Math.max(0, Math.min(1, opac));
    ctx.filter = skipGrade ? 'none' : buildFilterString(clip);

    if (clip.isTitle) {
      ctx.fillStyle = clip.titleColor || '#ffffff';
      const fSize = clip.titleFontSize || Math.round(width * 0.048);
      ctx.font = `700 ${fSize}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.75)';
      ctx.shadowBlur = 18;
      ctx.fillText(clip.titleText || clip.name, 0, 0);
    } else {
      const dec = store.runtimeState.decoders.get(clip.assetId);
      const vid = dec ? dec.videoEl : null;

      if (vid && !dec.missing) {
        const speed = clip.speed || 1;
        const offsetInClip = clip.reverse ? Math.max(0, clip.timelineDuration - localT) : localT;
        const srcTime = Math.max(0, (clip.sourceStart || 0) + offsetInClip * speed);
        const clampedSrc = isFinite(vid.duration) && vid.duration > 0 ? Math.min(vid.duration - 0.02, srcTime) : srcTime;

        if (Math.abs(vid.currentTime - clampedSrc) > 0.04) {
          try { vid.currentTime = clampedSrc; } catch {}
        }

        if (vid.readyState >= 2) {
          const vw = vid.videoWidth || width;
          const vh = vid.videoHeight || height;
          const scale = Math.min(width / vw, height / vh);
          const dw = vw * scale;
          const dh = vh * scale;
          ctx.drawImage(vid, -dw / 2, -dh / 2, dw, dh);

          // Render Cinematic Vignette overlay if enabled in Applied Effects
          const vigFx = !skipGrade && (clip.appliedEffects || []).find(e => e.id === 'vignette' && e.enabled);
          if (vigFx) {
            ctx.filter = 'none';
            const r = Math.hypot(dw / 2, dh / 2);
            const g = ctx.createRadialGradient(0, 0, r * 0.35, 0, 0, r);
            g.addColorStop(0, 'rgba(0,0,0,0)');
            g.addColorStop(1, `rgba(0,0,0,${(vigFx.params.strength ?? 0.45).toFixed(2)})`);
            ctx.fillStyle = g;
            ctx.fillRect(-dw / 2, -dh / 2, dw, dh);
          }
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

  if (layoutManager.isPanelVisible('video-scopes')) {
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
      const perfFps = document.getElementById('perf-panel-fps');
      if (perfFps) perfFps.textContent = `${store.runtimeState.measuredFps} FPS`;
    }

    if (store.runtimeState.isPlayingSequence) {
      const seq = getActiveSequence();
      if (delta > 0.08) {
        store.runtimeState.droppedFrames++;
        const dropEl = document.getElementById('status-drops-label');
        if (dropEl) dropEl.textContent = String(store.runtimeState.droppedFrames);
        const perfDrops = document.getElementById('perf-panel-drops');
        if (perfDrops) perfDrops.textContent = String(store.runtimeState.droppedFrames);
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
    const hasActive = seq.clips.some(c => !c.disabled && t >= c.timelineStart && t <= c.timelineStart + c.timelineDuration);
    const meters = audioEngine.getMasterMetering(store.runtimeState.isPlayingSequence, hasActive);

    const barL = document.getElementById('vu-bar-l');
    const barR = document.getElementById('vu-bar-r');
    const dbText = document.getElementById('vu-db-text');
    if (barL) barL.style.height = `${meters.leftPct}%`;
    if (barR) barR.style.height = `${meters.rightPct}%`;
    if (dbText) dbText.textContent = meters.peakDb <= -59 ? '-∞' : `${meters.peakDb.toFixed(0)}`;

    const pBarL = document.getElementById('panel-vu-l');
    const pBarR = document.getElementById('panel-vu-r');
    const pDb = document.getElementById('panel-vu-db');
    if (pBarL) pBarL.style.height = `${meters.leftPct}%`;
    if (pBarR) pBarR.style.height = `${meters.rightPct}%`;
    if (pDb) pDb.textContent = meters.peakDb <= -59 ? '-∞ dBFS' : `${meters.peakDb.toFixed(1)} dBFS`;

    const intStr = meters.integratedLufs <= -59 ? '-∞ LUFS' : `${meters.integratedLufs.toFixed(1)} LUFS`;
    const tpStr  = meters.truePeak <= -59 ? '-∞ dBTP' : `${meters.truePeak.toFixed(1)} dBTP`;
    const momStr = meters.momentaryLufs <= -59 ? '-∞ LUFS' : `${meters.momentaryLufs.toFixed(1)} LUFS`;

    for (const [id, val] of [
      ['lufs-integrated-val', intStr], ['lufs-truepeak-val', tpStr], ['lufs-momentary-val', momStr],
      ['panel-lufs-int', intStr], ['panel-lufs-tp', tpStr], ['panel-lufs-mom', momStr],
    ]) {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    }

    if (layoutManager.isPanelVisible('audio-mixer')) {
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
  });
  document.getElementById('btn-synclock-toggle')?.addEventListener('click', () => {
    store.sessionState.isSyncLockGlobal = !store.sessionState.isSyncLockGlobal;
    document.getElementById('btn-synclock-toggle')?.classList.toggle('active', store.sessionState.isSyncLockGlobal);
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

  // Track timeline horizontal scroll in memory (temporary UI state — never triggers project save!)
  const scrollArea = document.getElementById('timeline-scroll-area');
  scrollArea?.addEventListener('scroll', () => {
    store.sessionState.timelineScrollLeft = scrollArea.scrollLeft;
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
  renderTimeline();
}

function toggleSnapping() {
  store.sessionState.isSnapping = !store.sessionState.isSnapping;
  document.getElementById('btn-snap-toggle')?.classList.toggle('active', store.sessionState.isSnapping);
}

function setTool(toolName) {
  store.sessionState.activeTool = toolName;
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
        const syncOffset = computeSyncOffsetSeconds(seq.clips, clip);
        const syncLabel = syncOffset !== 0 ? `${syncOffset > 0 ? '+' : ''}${syncOffset.toFixed(1)}s` : '';

        lanesHtml += `
          <div class="timeline-clip-block ${isAudio ? 'audio' : ''} ${isSel ? 'selected' : ''}" data-id="${clip.id}" style="left: ${leftPx}px; width: ${widthPx}px; ${clip.disabled ? 'opacity: 0.42;' : ''} ${offline ? 'background: #7F1D1D; border-color: var(--error);' : (clip.isTitle ? 'background: #5B21B6;' : '')}">
            <div class="trim-handle left"></div>
            ${clip.transitionIn ? `<div class="clip-transition-badge" title="${clip.transitionIn.name}">T</div>` : ''}
            <div style="display: flex; align-items: center; gap: 3px; overflow: hidden; pointer-events: none; padding-left: ${clip.transitionIn ? '14px' : '0'};">
              <span class="icon icon-sm">${offline ? 'link_off' : (clip.isTitle ? 'title' : (isAudio ? 'graphic_eq' : 'movie'))}</span>
              ${clip.linkGroupId ? `<span class="icon clip-link-icon" title="Linked Clip">link</span>` : ''}
              ${tds.showNames ? `<span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${clip.name}</span>` : ''}
              ${syncLabel ? `<span class="clip-sync-badge" title="Out of sync by ${syncLabel} — Right-click > Move Into Sync">${syncLabel}</span>` : ''}
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

    // Bind Linked Selection, Linked Move, Linked Trim & Rich Context Menu
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
        const nextSel = resolveSelectionForClick(seq.clips, clipId, {
          isLinkedSelection: store.sessionState.isLinkedSelection,
          additive: e.shiftKey || e.ctrlKey,
          currentSelectedIds: store.sessionState.selectedClipIds,
        });
        setSelectedClipIds(nextSel);
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
        if (!store.sessionState.selectedClipIds.includes(clipId)) {
          const nextSel = resolveSelectionForClick(seq.clips, clipId, {
            isLinkedSelection: store.sessionState.isLinkedSelection,
          });
          setSelectedClipIds(nextSel);
          renderTimeline();
          renderInspector();
        }

        const isLinked = !!clip.linkGroupId;
        const syncOff = computeSyncOffsetSeconds(seq.clips, clip);
        const linkMenuItems = [
          ...(isLinked
            ? [
                { label: 'Unlink Clips', shortcut: 'Ctrl+Shift+L', action: unlinkSelectedClipsAction },
                { label: 'Select Linked Clips', action: () => selectLinkedClipsAction(clipId) },
              ]
            : [
                { label: 'Link Selected Clips', shortcut: 'Ctrl+L', action: linkSelectedClipsAction },
              ]),
          ...(syncOff !== 0 ? [{ label: `Move Into Sync (${syncOff > 0 ? '+' : ''}${syncOff.toFixed(1)}s)`, action: () => moveIntoSyncAction(clipId) }] : []),
          { label: 'Reveal Original Media', action: () => revealOriginalMedia(clip.assetId) },
        ];

        if (track.type === 'audio') {
          openContextMenu(e.clientX, e.clientY, [
            ...linkMenuItems,
            { sep: true },
            { label: 'Gain +3.0 dB', action: () => executeCommand('Gain +3dB', () => { clip.audio.volumeDb = Math.min(12, clip.audio.volumeDb + 3); }) },
            { label: 'Gain -3.0 dB', action: () => executeCommand('Gain -3dB', () => { clip.audio.volumeDb = Math.max(-40, clip.audio.volumeDb - 3); }) },
            { label: 'Add 1s Fade In & Out', action: () => executeCommand('Add Fades', () => { clip.audio.fadeIn = 1; clip.audio.fadeOut = 1; }) },
            { label: 'Toggle Audio Waveform', action: () => { store.sessionState.timelineDisplay.showWaveforms = !store.sessionState.timelineDisplay.showWaveforms; renderTimeline(); } },
            { sep: true },
            { label: 'Open Audio Mixer Workspace', action: () => switchWorkspace('audio') },
            { label: 'Delete Selected Clip(s)', shortcut: 'Del', action: deleteActiveClip },
          ]);
        } else {
          openContextMenu(e.clientX, e.clientY, [
            ...linkMenuItems,
            { sep: true },
            { label: 'Split at Playhead', shortcut: 'Ctrl+K', action: () => splitClipAction(clipId, store.sessionState.playheadTime) },
            { label: 'Copy Clip', shortcut: 'Ctrl+C', action: () => { store.runtimeState.clipboardClip = JSON.parse(JSON.stringify(clip)); } },
            { label: 'Apply Cross Dissolve In', action: () => applyTransitionToActiveClip(TRANSITION_CATALOG[0]) },
            { label: 'Speed / Duration...', action: () => editClipSpeedPrompt(clip) },
            { label: 'Reset Transform & Grade', action: () => resetClipProperties(clip) },
            { sep: true },
            { label: 'Delete Selected Clip(s)', shortcut: 'Del', action: deleteActiveClip },
          ]);
        }
      });

      // Linked Move Drag (moves entire linked group atomically when Linked Selection is active)
      clipEl.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || e.target.classList.contains('trim-handle') || store.sessionState.activeTool === 'razor' || track.locked) return;
        e.preventDefault();
        const startX = e.clientX;
        const initLeadStart = clip.timelineStart;
        const members = (store.sessionState.isLinkedSelection && clip.linkGroupId)
          ? getLinkedGroupMembers(seq.clips, clip)
          : [clip];
        const initialStarts = new Map(members.map(m => [m.id, m.timelineStart]));
        const beforeSnapshot = JSON.parse(JSON.stringify(store.projectState));
        let moved = false;

        const onMove = (ev) => {
          const rawStart = Math.max(0, initLeadStart + (ev.clientX - startX) / store.sessionState.timelineZoom);
          const snapRes = computeSnappedTime(rawStart, clip.id, ev.altKey);
          const deltaSec = snapRes.time - initLeadStart;
          if (Math.abs(deltaSec) > 0.001) moved = true;
          applyLinkedMove(seq.clips, seq.tracks, clip, initialStarts, deltaSec, store.sessionState.isLinkedSelection);
          showSnapGuide(snapRes.snapped ? snapRes.time : null);
          renderTimeline();
        };
        const onUp = () => {
          showSnapGuide(null);
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
          if (moved) {
            uiState.undoStack.push({ description: 'Move Linked Clip(s)', snapshot: beforeSnapshot });
            if (uiState.undoStack.length > 50) uiState.undoStack.shift();
            uiState.redoStack = [];
            store.scheduleSave(250);
            renderAll();
          }
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      });

      // Linked Left Trim
      clipEl.querySelector('.trim-handle.left')?.addEventListener('mousedown', (e) => {
        if (track.locked) return;
        e.stopPropagation(); e.preventDefault();
        const startX = e.clientX;
        const members = (store.sessionState.isLinkedSelection && clip.linkGroupId)
          ? getLinkedGroupMembers(seq.clips, clip)
          : [clip];
        const initMap = new Map(members.map(m => [m.id, { timelineStart: m.timelineStart, timelineDuration: m.timelineDuration, sourceStart: m.sourceStart || 0 }]));
        const beforeSnapshot = JSON.parse(JSON.stringify(store.projectState));

        const onMove = (ev) => {
          const delta = (ev.clientX - startX) / store.sessionState.timelineZoom;
          applyLinkedTrim(seq.clips, seq.tracks, clip, 'left', initMap, delta, store.sessionState.isLinkedSelection);
          renderTimeline();
        };
        const onUp = () => {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
          uiState.undoStack.push({ description: 'Trim Linked Clip In', snapshot: beforeSnapshot });
          uiState.redoStack = [];
          store.scheduleSave(250);
          renderAll();
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      });

      // Linked Right Trim
      clipEl.querySelector('.trim-handle.right')?.addEventListener('mousedown', (e) => {
        if (track.locked) return;
        e.stopPropagation(); e.preventDefault();
        const startX = e.clientX;
        const members = (store.sessionState.isLinkedSelection && clip.linkGroupId)
          ? getLinkedGroupMembers(seq.clips, clip)
          : [clip];
        const initMap = new Map(members.map(m => [m.id, { timelineStart: m.timelineStart, timelineDuration: m.timelineDuration, sourceStart: m.sourceStart || 0 }]));
        const beforeSnapshot = JSON.parse(JSON.stringify(store.projectState));

        const onMove = (ev) => {
          const delta = (ev.clientX - startX) / store.sessionState.timelineZoom;
          applyLinkedTrim(seq.clips, seq.tracks, clip, 'right', initMap, delta, store.sessionState.isLinkedSelection);
          renderTimeline();
        };
        const onUp = () => {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
          uiState.undoStack.push({ description: 'Trim Linked Clip Out', snapshot: beforeSnapshot });
          uiState.redoStack = [];
          store.scheduleSave(250);
          renderAll();
        };
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
  executeCommand('Split Linked Clip(s)', () => {
    const rightIds = applyLinkedSplit(seq, clipId, splitTime, store.sessionState.isLinkedSelection);
    if (rightIds.length > 0) setSelectedClipIds(rightIds);
  });
}

function deleteActiveClip() {
  const selectedIds = store.sessionState.selectedClipIds;
  if (!selectedIds || selectedIds.length === 0) return;
  const seq = getActiveSequence();
  const toDelete = new Set(selectedIds);
  if (store.sessionState.isLinkedSelection) {
    for (const id of selectedIds) {
      const c = seq.clips.find(x => x.id === id);
      if (c && c.linkGroupId) {
        getLinkedGroupMembers(seq.clips, c).forEach(m => toDelete.add(m.id));
      }
    }
  }
  executeCommand('Delete Selected Clip(s)', () => {
    seq.clips = seq.clips.filter(c => !toDelete.has(c.id));
    setSelectedClipIds([]);
  });
}

function linkSelectedClipsAction() {
  const ids = store.sessionState.selectedClipIds;
  if (!ids || ids.length < 2) {
    alert('Shift+Click two or more clips (e.g., Video on V1 and Audio on A1) to Link them together.');
    return;
  }
  executeCommand('Link Clips', () => {
    linkClipsByIds(getActiveSequence().clips, ids);
  });
}

function unlinkSelectedClipsAction() {
  const ids = store.sessionState.selectedClipIds;
  if (!ids || ids.length === 0) return;
  executeCommand('Unlink Clips', () => {
    unlinkClipsByIds(getActiveSequence().clips, ids);
  });
}

function selectLinkedClipsAction(clipId) {
  const seq = getActiveSequence();
  const c = seq.clips.find(x => x.id === clipId);
  if (!c) return;
  const members = getLinkedGroupMembers(seq.clips, c).map(m => m.id);
  setSelectedClipIds(members);
  renderTimeline();
  renderInspector();
}

function moveIntoSyncAction(clipId) {
  executeCommand('Move Clip Into Sync', () => {
    moveClipIntoSync(getActiveSequence().clips, clipId);
  });
}

function revealOriginalMedia(assetId) {
  if (!assetId || !store.projectState.assets[assetId]) return;
  loadAssetIntoSourceMonitor(assetId, { preserveInOut: false, switchTab: true });
  renderAssetsList();
}

function pasteClipboardClip() {
  const src = store.runtimeState.clipboardClip;
  if (!src) return;
  const seq = getActiveSequence();
  executeCommand('Paste Clip', () => {
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = `clip_paste_${Date.now()}`;
    copy.linkGroupId = null;
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
    store.sessionState.selectedTrackId = el.dataset.stripId; renderAudioConsole();
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
    renderQueue.renderAllQueued(
      (ctx, w, h, t) => renderSequenceFrameAtTime(ctx, w, h, t),
      getActiveSequence()
    );
  });
  document.getElementById('btn-cancel-queue')?.addEventListener('click', () => renderQueue.cancelActive());

  document.getElementById('btn-deliver-mode-quick')?.addEventListener('click', () => {
    uiState.deliverMode = 'quick';
    document.getElementById('btn-deliver-mode-quick')?.classList.add('active');
    document.getElementById('btn-deliver-mode-advanced')?.classList.remove('active');
    renderDeliverSettings();
  });
  document.getElementById('btn-deliver-mode-advanced')?.addEventListener('click', () => {
    uiState.deliverMode = 'advanced';
    document.getElementById('btn-deliver-mode-advanced')?.classList.add('active');
    document.getElementById('btn-deliver-mode-quick')?.classList.remove('active');
    renderDeliverSettings();
  });
}

function getComputedExportRange(seq, rangeMode) {
  const contentEnd = seq.clips.reduce((max, c) => Math.max(max, c.timelineStart + c.timelineDuration), 0);
  if (rangeMode === 'inout' && seq.inPoint !== null && seq.outPoint !== null && seq.outPoint > seq.inPoint) {
    return { start: seq.inPoint, duration: seq.outPoint - seq.inPoint, label: 'In/Out Range' };
  }
  if (rangeMode === 'selected') {
    const clip = getActiveClip();
    if (clip) return { start: clip.timelineStart, duration: clip.timelineDuration, label: `Clip: ${clip.name}` };
  }
  return { start: 0, duration: contentEnd > 0 ? contentEnd : 5, label: 'Entire Sequence' };
}

function applyPresetToExportConfig(presetId) {
  const allPresets = [...EXPORT_PRESETS, ...uiState.customExportPresets];
  const p = allPresets.find(x => x.id === presetId);
  if (!p) return;
  const seq = getActiveSequence();
  Object.assign(uiState.exportConfig, {
    presetId: p.id,
    formatId: p.formatId,
    matchSequence: !!p.matchSequence,
    width: p.matchSequence ? seq.width : p.width,
    height: p.matchSequence ? seq.height : p.height,
    fps: p.matchSequence ? seq.fps : p.fps,
    bitrateMbps: p.bitrateMbps,
    quality: p.quality,
    rateControl: p.rateControl,
    scaling: p.scaling,
    exportVideo: p.exportVideo,
    exportAudio: p.exportAudio,
    audioSampleRate: p.audioSampleRate,
    audioBitDepth: p.audioBitDepth,
    audioChannels: p.audioChannels,
    audioBitrateKbps: p.audioBitrateKbps,
  });
}

function renderDeliverSettings() {
  const body = document.getElementById('deliver-settings-body');
  if (!body) return;
  const cfg = uiState.exportConfig;
  const seq = getActiveSequence();
  const codecProbe = store.runtimeState.codecCapabilities || detectExportCodecs();
  const range = getComputedExportRange(seq, cfg.rangeMode);
  const fullConfig = { ...cfg, rangeStart: range.start, durationSec: range.duration };
  const validation = validateExportConfig(fullConfig, codecProbe);
  const fmt = validation.format || codecProbe.formats[0];
  const estMB = estimateFileSizeMB(fullConfig);

  // Group Formats by Category
  const fmtCategories = [...new Set(codecProbe.formats.map(f => f.category))];
  const allPresets = [...EXPORT_PRESETS, ...uiState.customExportPresets];
  const presetGroups = [...new Set(allPresets.map(p => p.group || 'Custom'))];

  const isVideo = fmt && fmt.kind === 'video';
  const isAudioOnly = fmt && fmt.kind === 'audio';
  const isImage = fmt && fmt.kind === 'image';

  body.innerHTML = `
    <div style="display: flex; flex-direction: column; height: 100%;">
      <div style="flex: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 10px;">
        <!-- Core Format, Preset & Output File -->
        <div class="deliver-form-grid" style="padding: 0;">
          <div class="field-row">
            <div class="field-header"><span>Format</span></div>
            <select id="deliv-format" class="compact-select" style="padding: 5px;">
              ${fmtCategories.map(cat => `
                <optgroup label="${cat}">
                  ${codecProbe.formats.filter(f => f.category === cat).map(f => `
                    <option value="${f.id}" ${f.id === cfg.formatId ? 'selected' : ''} ${!f.supported ? 'disabled' : ''}>
                      ${f.label}${!f.supported ? ' [Unavailable]' : ''}
                    </option>
                  `).join('')}
                </optgroup>
              `).join('')}
            </select>
          </div>

          <div class="field-row">
            <div class="field-header"><span>Preset</span><button class="action-btn-compact" id="btn-save-export-preset" style="padding: 0 4px; font-size: 10px;">+ Save</button></div>
            <select id="deliv-preset" class="compact-select" style="padding: 5px;">
              ${presetGroups.map(grp => `
                <optgroup label="${grp}">
                  ${allPresets.filter(p => (p.group || 'Custom') === grp).map(p => `
                    <option value="${p.id}" ${p.id === cfg.presetId ? 'selected' : ''}>${p.name}</option>
                  `).join('')}
                </optgroup>
              `).join('')}
            </select>
          </div>

          <div class="field-row">
            <div class="field-header"><span>Output Filename</span></div>
            <input type="text" id="deliv-filename" value="${cfg.filename}" style="background: var(--bg-input); border: 1px solid var(--border); color: #fff; padding: 5px 7px; border-radius: 3px; font-size: 11.5px;">
          </div>

          <div class="field-row">
            <div class="field-header"><span>Export Range</span><span class="field-val">${range.duration.toFixed(1)}s</span></div>
            <select id="deliv-range" class="compact-select" style="padding: 5px;">
              <option value="entire" ${cfg.rangeMode === 'entire' ? 'selected' : ''}>Entire Sequence</option>
              <option value="inout" ${cfg.rangeMode === 'inout' ? 'selected' : ''}>Sequence In/Out Range</option>
              <option value="selected" ${cfg.rangeMode === 'selected' ? 'selected' : ''}>Selected Clip Only</option>
            </select>
          </div>
        </div>

        ${validation.errors.length > 0 ? `<div style="padding: 6px 8px; background: rgba(227,111,120,0.14); border: 1px solid var(--error); border-radius: 4px; font-size: 11px; color: var(--error);">${validation.errors.join(' ')}</div>` : ''}
        ${validation.warnings.length > 0 ? `<div style="padding: 6px 8px; background: rgba(229,180,92,0.14); border: 1px solid var(--warning); border-radius: 4px; font-size: 11px; color: var(--warning);">${validation.warnings.join(' ')}</div>` : ''}

        ${uiState.deliverMode === 'advanced' ? `
          <!-- ADVANCED ACCORDION 1: VIDEO SETTINGS -->
          ${!isAudioOnly ? `
            <div class="inspector-accordion" style="border: 1px solid var(--border); border-radius: 4px;">
              <div class="accordion-header"><span>Video Settings</span><span class="icon icon-sm">expand_more</span></div>
              <div class="accordion-content">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <label style="font-size: 11px; display: flex; gap: 5px; align-items: center;"><input type="checkbox" id="deliv-match-seq" ${cfg.matchSequence ? 'checked' : ''}> Match Sequence (${seq.width}×${seq.height} · ${seq.fps}fps)</label>
                  <select id="deliv-res-preset" class="compact-select">
                    <option value="">Resolution Preset...</option>
                    <option value="3840x2160">4K UHD (3840×2160)</option>
                    <option value="2560x1440">2K QHD (2560×1440)</option>
                    <option value="1920x1080">Full HD (1920×1080)</option>
                    <option value="1280x720">HD (1280×720)</option>
                    <option value="1080x1920">Vertical 9:16 (1080×1920)</option>
                    <option value="1080x1350">Portrait 4:5 (1080×1350)</option>
                  </select>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px;">
                  <div class="field-row"><div class="field-header"><span>Width</span></div><input type="number" id="deliv-w" value="${cfg.width}" style="background: var(--bg-input); border: 1px solid var(--border); color: #fff; padding: 4px; border-radius: 3px; font-size: 11px;"></div>
                  <div class="field-row"><div class="field-header"><span>Height</span></div><input type="number" id="deliv-h" value="${cfg.height}" style="background: var(--bg-input); border: 1px solid var(--border); color: #fff; padding: 4px; border-radius: 3px; font-size: 11px;"></div>
                  <div class="field-row"><div class="field-header"><span>Frame Rate</span></div>
                    <select id="deliv-fps" class="compact-select" style="padding: 4px;">
                      ${[23.976, 24, 25, 29.97, 30, 60].map(r => `<option value="${r}" ${cfg.fps === r ? 'selected' : ''}>${r} fps</option>`).join('')}
                    </select>
                  </div>
                </div>
                ${isVideo ? `
                  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
                    <div class="field-row"><div class="field-header"><span>Quality Preset</span></div>
                      <select id="deliv-quality" class="compact-select" style="padding: 4px;">
                        <option value="draft" ${cfg.quality==='draft'?'selected':''}>Draft (Fast)</option>
                        <option value="standard" ${cfg.quality==='standard'?'selected':''}>Standard</option>
                        <option value="high" ${cfg.quality==='high'?'selected':''}>High</option>
                        <option value="maximum" ${cfg.quality==='maximum'?'selected':''}>Maximum</option>
                      </select>
                    </div>
                    <div class="field-row"><div class="field-header"><span>Target Bitrate</span><span class="field-val" id="deliv-br-val">${cfg.bitrateMbps} Mbps</span></div>
                      <input type="range" id="deliv-bitrate" min="2" max="60" step="1" value="${cfg.bitrateMbps}">
                    </div>
                  </div>
                ` : ''}
              </div>
            </div>
          ` : ''}

          <!-- ADVANCED ACCORDION 2: AUDIO SETTINGS -->
          ${!isImage ? `
            <div class="inspector-accordion" style="border: 1px solid var(--border); border-radius: 4px;">
              <div class="accordion-header"><span>Audio Settings</span><span class="icon icon-sm">expand_more</span></div>
              <div class="accordion-content">
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px;">
                  <div class="field-row"><div class="field-header"><span>Sample Rate</span></div>
                    <select id="deliv-sr" class="compact-select" style="padding: 4px;">
                      ${[44100, 48000, 96000].map(sr => `<option value="${sr}" ${cfg.audioSampleRate===sr?'selected':''}>${sr/1000} kHz</option>`).join('')}
                    </select>
                  </div>
                  <div class="field-row"><div class="field-header"><span>Channels</span></div>
                    <select id="deliv-ch" class="compact-select" style="padding: 4px;">
                      <option value="mono" ${cfg.audioChannels==='mono'?'selected':''}>Mono (1.0)</option>
                      <option value="stereo" ${cfg.audioChannels==='stereo'?'selected':''}>Stereo (2.0)</option>
                    </select>
                  </div>
                  <div class="field-row"><div class="field-header"><span>${isAudioOnly ? 'Bit Depth' : 'Bitrate'}</span></div>
                    ${isAudioOnly
                      ? `<select id="deliv-bd" class="compact-select" style="padding: 4px;"><option value="16" ${cfg.audioBitDepth===16?'selected':''}>16-bit PCM</option><option value="24" ${cfg.audioBitDepth===24?'selected':''}>24-bit PCM</option></select>`
                      : `<select id="deliv-abr" class="compact-select" style="padding: 4px;">${[128, 192, 256, 320].map(b => `<option value="${b}" ${cfg.audioBitrateKbps===b?'selected':''}>${b} kbps</option>`).join('')}</select>`}
                  </div>
                </div>
              </div>
            </div>
          ` : ''}

          <!-- ADVANCED ACCORDION 3: COLOUR & CAPTIONS -->
          <div class="inspector-accordion" style="border: 1px solid var(--border); border-radius: 4px;">
            <div class="accordion-header"><span>Colour, Captions & Metadata</span><span class="icon icon-sm">chevron_right</span></div>
            <div class="accordion-content collapsed">
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
                <div class="field-row"><div class="field-header"><span>Color Space</span></div>
                  <select id="deliv-cs" class="compact-select" style="padding: 4px;">
                    <option value="Rec.709" selected>Rec.709 (SDR Standard)</option>
                  </select>
                </div>
                <div class="field-row"><div class="field-header"><span>Captions / Subtitles</span></div>
                  <select id="deliv-cap" class="compact-select" style="padding: 4px;">
                    <option value="none" ${cfg.captionsMode==='none'?'selected':''}>None</option>
                    <option value="burn" ${cfg.captionsMode==='burn'?'selected':''}>Burn Titles Into Video</option>
                    <option value="srt" ${cfg.captionsMode==='srt'?'selected':''}>Export Separate .SRT File</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        ` : ''}
      </div>

      <!-- LIVE SETTINGS SUMMARY BAR + QUEUE / QUICK EXPORT ACTIONS -->
      <div class="deliver-summary-bar">
        <div style="color: var(--text-secondary);">
          <strong style="color: #fff;">${fmt ? fmt.container.toUpperCase() : '--'}</strong> ·
          ${isAudioOnly ? `${cfg.audioSampleRate/1000}kHz ${cfg.audioBitDepth}-bit ${cfg.audioChannels}` : `${cfg.width}×${cfg.height}${isVideo ? ` · ${cfg.fps}fps · ${cfg.bitrateMbps} Mbps` : ''}`} ·
          Est. <strong style="color: var(--accent-cyan);">${estMB.toFixed(2)} MB</strong>
        </div>
        <div style="display: flex; gap: 6px;">
          <button class="action-btn-compact" id="btn-add-to-render-queue" style="border-color: var(--border);" ${!validation.valid ? 'disabled' : ''}>
            <span class="icon icon-sm">add_to_queue</span> Add to Queue
          </button>
          <button class="action-btn-compact primary" id="btn-export-now" ${!validation.valid ? 'disabled' : ''}>
            <span class="icon icon-sm">ios_share</span> Export Now
          </button>
        </div>
      </div>
    </div>
  `;

  bindAccordionToggles(body);

  document.getElementById('deliv-format')?.addEventListener('change', (e) => {
    cfg.formatId = e.target.value;
    const f = codecProbe.formats.find(x => x.id === cfg.formatId);
    if (f) { cfg.exportVideo = f.kind !== 'audio'; cfg.exportAudio = f.kind !== 'image'; }
    renderDeliverSettings();
  });
  document.getElementById('deliv-preset')?.addEventListener('change', (e) => {
    applyPresetToExportConfig(e.target.value);
    renderDeliverSettings();
  });
  document.getElementById('deliv-filename')?.addEventListener('input', (e) => { cfg.filename = e.target.value; });
  document.getElementById('deliv-range')?.addEventListener('change', (e) => { cfg.rangeMode = e.target.value; renderDeliverSettings(); });

  document.getElementById('btn-save-export-preset')?.addEventListener('click', () => {
    const name = prompt('Save Custom Export Preset Name:', `Custom ${cfg.width}x${cfg.height}`);
    if (!name) return;
    const newPreset = { ...JSON.parse(JSON.stringify(cfg)), id: `cp_${Date.now()}`, group: 'Custom', name };
    uiState.customExportPresets.push(newPreset);
    localStorage.setItem('ff_export_presets', JSON.stringify(uiState.customExportPresets));
    cfg.presetId = newPreset.id;
    renderDeliverSettings();
  });

  document.getElementById('deliv-match-seq')?.addEventListener('change', (e) => {
    cfg.matchSequence = e.target.checked;
    if (cfg.matchSequence) { cfg.width = seq.width; cfg.height = seq.height; cfg.fps = seq.fps; }
    renderDeliverSettings();
  });
  document.getElementById('deliv-res-preset')?.addEventListener('change', (e) => {
    if (!e.target.value) return;
    const [w, h] = e.target.value.split('x').map(Number);
    cfg.matchSequence = false; cfg.width = w; cfg.height = h;
    renderDeliverSettings();
  });
  document.getElementById('deliv-w')?.addEventListener('change', (e) => { cfg.matchSequence = false; cfg.width = Math.max(64, parseInt(e.target.value, 10) || 1920); renderDeliverSettings(); });
  document.getElementById('deliv-h')?.addEventListener('change', (e) => { cfg.matchSequence = false; cfg.height = Math.max(64, parseInt(e.target.value, 10) || 1080); renderDeliverSettings(); });
  document.getElementById('deliv-fps')?.addEventListener('change', (e) => { cfg.matchSequence = false; cfg.fps = parseFloat(e.target.value); renderDeliverSettings(); });
  document.getElementById('deliv-quality')?.addEventListener('change', (e) => {
    cfg.quality = e.target.value;
    const brMap = { draft: 6, standard: 12, high: 20, maximum: 40 };
    cfg.bitrateMbps = brMap[cfg.quality] || 16;
    renderDeliverSettings();
  });
  document.getElementById('deliv-bitrate')?.addEventListener('input', (e) => {
    cfg.bitrateMbps = parseInt(e.target.value, 10);
    const lbl = document.getElementById('deliv-br-val'); if (lbl) lbl.textContent = `${cfg.bitrateMbps} Mbps`;
  });
  document.getElementById('deliv-sr')?.addEventListener('change', (e) => { cfg.audioSampleRate = parseInt(e.target.value, 10); renderDeliverSettings(); });
  document.getElementById('deliv-ch')?.addEventListener('change', (e) => { cfg.audioChannels = e.target.value; renderDeliverSettings(); });
  document.getElementById('deliv-bd')?.addEventListener('change', (e) => { cfg.audioBitDepth = parseInt(e.target.value, 10); renderDeliverSettings(); });
  document.getElementById('deliv-abr')?.addEventListener('change', (e) => { cfg.audioBitrateKbps = parseInt(e.target.value, 10); renderDeliverSettings(); });
  document.getElementById('deliv-cap')?.addEventListener('change', (e) => { cfg.captionsMode = e.target.value; });

  const enqueueCurrent = () => {
    const r = getComputedExportRange(seq, cfg.rangeMode);
    const f = codecProbe.formats.find(x => x.id === cfg.formatId);
    return renderQueue.addJob({
      ...cfg,
      container: f ? f.container : 'mp4',
      codec: f ? f.codec : 'h264',
      rangeStart: r.start,
      durationSec: r.duration,
    });
  };

  document.getElementById('btn-add-to-render-queue')?.addEventListener('click', enqueueCurrent);
  document.getElementById('btn-export-now')?.addEventListener('click', () => {
    enqueueCurrent();
    renderQueue.renderAllQueued(
      (ctx, w, h, t) => renderSequenceFrameAtTime(ctx, w, h, t),
      getActiveSequence()
    );
  });
}

function renderDeliverQueue() {
  const body = document.getElementById('deliver-queue-body');
  if (!body) return;
  if (renderQueue.jobs.length === 0) {
    body.innerHTML = `<div style="padding: 28px; text-align: center; color: var(--text-muted);">Render Queue is empty. Queue multiple deliverables (4K Master, Vertical Reels, WAV Audio) from this sequence above.</div>`;
    return;
  }
  body.innerHTML = `
    <table class="queue-table">
      <thead><tr><th>Output Deliverable</th><th>Stage & Validation</th><th style="width: 170px;">Progress</th><th>Size / Time</th><th>Actions</th></tr></thead>
      <tbody>
        ${renderQueue.jobs.map((j, idx) => `
          <tr>
            <td>
              <div style="font-weight: 600;">${j.filename}.${j.container}</div>
              <div style="font-size: 10px; color: var(--text-muted);">${j.container === 'wav' ? `${j.config.audioSampleRate/1000}kHz ${j.config.audioBitDepth}-bit ${j.config.audioChannels}` : `${j.width}×${j.height} · ${j.fps}fps · ${j.codec.toUpperCase()}`} · ${j.durationSec.toFixed(1)}s</div>
            </td>
            <td>
              <span style="color: ${j.status === 'completed' ? 'var(--success)' : (j.status === 'failed' ? 'var(--error)' : 'var(--accent)')}; font-weight: 600; font-size: 10.5px;">${j.stage}</span>
              ${j.validationReport ? `<div style="font-size: 10px; color: var(--success);">${j.validationReport}</div>` : ''}
              ${j.errorMessage ? `<div style="font-size: 10px; color: var(--error);">${j.errorMessage}</div>` : ''}
            </td>
            <td>
              <div style="display: flex; align-items: center; gap: 6px;">
                <div style="flex: 1; height: 6px; background: #1A2230; border-radius: 3px; overflow: hidden;"><div style="width: ${j.progress}%; height: 100%; background: ${j.status === 'completed' ? 'var(--success)' : 'var(--accent)'};"></div></div>
                <span style="font-family: monospace; font-size: 10.5px;">${j.progress}%</span>
              </div>
              ${j.status === 'rendering' && j.etaSec !== null ? `<div style="font-size: 9.5px; color: var(--text-muted);">ETA ${j.etaSec.toFixed(1)}s</div>` : ''}
            </td>
            <td style="font-family: monospace; font-size: 10.5px;">
              ${j.outputSizeBytes > 0 ? `${(j.outputSizeBytes / 1024).toFixed(1)} KB` : '--'}
              ${j.elapsedSec > 0 ? `<div style="font-size: 9.5px; color: var(--text-muted);">${j.elapsedSec.toFixed(1)}s</div>` : ''}
            </td>
            <td style="display: flex; gap: 3px; flex-wrap: wrap;">
              ${j.outputUrl ? `<a href="${j.outputUrl}" download="${j.filename}.${j.container}" class="action-btn-compact primary" style="text-decoration: none;">Download</a>` : ''}
              ${j.srtUrl ? `<a href="${j.srtUrl}" download="${j.filename}.srt" class="action-btn-compact" style="text-decoration: none; border-color: var(--border);">.SRT</a>` : ''}
              ${idx > 0 ? `<button class="action-btn-compact btn-job-up" data-job-id="${j.id}" title="Move Up">↑</button>` : ''}
              <button class="action-btn-compact btn-job-dup" data-job-id="${j.id}" title="Duplicate Config">Dup</button>
              ${j.status === 'failed' || j.status === 'cancelled' ? `<button class="action-btn-compact btn-retry-job" data-job-id="${j.id}">Retry</button>` : ''}
              <button class="action-btn-compact danger btn-remove-job" data-job-id="${j.id}">✕</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  body.querySelectorAll('.btn-job-up').forEach(b => b.addEventListener('click', () => renderQueue.moveJob(b.dataset.jobId, -1)));
  body.querySelectorAll('.btn-job-dup').forEach(b => b.addEventListener('click', () => renderQueue.duplicateJob(b.dataset.jobId)));
  body.querySelectorAll('.btn-retry-job').forEach(b => b.addEventListener('click', () => renderQueue.retryJob(b.dataset.jobId)));
  body.querySelectorAll('.btn-remove-job').forEach(b => b.addEventListener('click', () => renderQueue.removeJob(b.dataset.jobId)));
}

function renderInspector() {
  const container = document.getElementById('inspector-content');
  const tabsBar = document.getElementById('properties-tabs-bar');
  if (!container) return;

  const seq = getActiveSequence();
  const statusInfo = document.getElementById('status-clip-info');

  // Update Project Panel compact asset status footer
  const projFooter = document.getElementById('project-panel-footer');
  if (projFooter) {
    const assetsCount = Object.keys(store.projectState.assets).length;
    const offlineCount = Array.from(store.runtimeState.decoders.values()).filter(d => d.missing).length;
    projFooter.innerHTML = `<span>${assetsCount} asset${assetsCount === 1 ? '' : 's'}${offlineCount > 0 ? ` · <strong style="color:var(--error);">${offlineCount} offline</strong>` : ''}</span><span>IndexedDB</span>`;
  }

  // CONTEXTUAL 5-TAB PROPERTIES PANEL (Consistent across every workspace!)
  const ctx = resolvePropertiesContext(seq, store.sessionState.selectedClipIds, uiState.pinnedClipId);
  if (!ctx.pinned && uiState.pinnedClipId) {
    // Pinned clip was deleted -> clear stale pin cleanly
    uiState.pinnedClipId = null;
    document.getElementById('btn-pin-properties')?.classList.remove('pin-active-btn');
  }

  // EMPTY SELECTION: No Project Overview bloat — clean contextual prompt!
  if (ctx.mode === 'empty') {
    if (statusInfo) statusInfo.textContent = seq.name;
    if (tabsBar) tabsBar.style.display = 'none';
    container.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 36px 16px; gap: 8px;">
        <span class="icon icon-lg" style="color: var(--text-muted);">touch_app</span>
        <div style="font-size: 12px; font-weight: 600; color: var(--text-primary);">No Clip Selected</div>
        <div style="font-size: 11px; color: var(--text-muted); line-height: 1.45;">
          Select a video, audio, or title clip on the timeline to edit its Transform, Audio, Effects, Motion keyframes, or Metadata.
        </div>
        <div style="display: flex; gap: 6px; margin-top: 6px;">
          <button class="action-btn-compact" id="btn-empty-seq-settings" style="border-color: var(--border);">Sequence Settings...</button>
          <button class="action-btn-compact" id="btn-empty-hide-props" style="border-color: var(--border);">Hide Panel</button>
        </div>
      </div>
    `;
    document.getElementById('btn-empty-seq-settings')?.addEventListener('click', openSequenceSettingsModal);
    document.getElementById('btn-empty-hide-props')?.addEventListener('click', () => layoutManager.closePanel('panel-inspector'));
    return;
  }

  // Ensure active tab is valid for the selected object type
  if (!ctx.availableTabs.includes(uiState.activePropertiesTab)) {
    uiState.activePropertiesTab = ctx.availableTabs[0] || 'properties';
  }

  const tabLabels = {
    properties: ctx.mode === 'title' ? 'Title' : 'Video',
    audio: 'Audio',
    effects: 'Effects',
    motion: 'Motion',
    metadata: 'Metadata',
  };

  if (tabsBar) {
    tabsBar.style.display = 'flex';
    tabsBar.innerHTML = ctx.availableTabs.map(tKey => `
      <button class="props-tab ${uiState.activePropertiesTab === tKey ? 'active' : ''}" data-ptab="${tKey}">${tabLabels[tKey]}</button>
    `).join('');
    tabsBar.querySelectorAll('.props-tab').forEach(b => b.addEventListener('click', () => {
      uiState.activePropertiesTab = b.dataset.ptab;
      renderInspector();
    }));
  }

  const clip = ctx.primaryClip;
  if (statusInfo) {
    statusInfo.textContent = ctx.mode === 'multi'
      ? `${ctx.clips.length} Clips Selected`
      : `Selected: ${clip.name}`;
  }

  const headerBanner = `
    <div class="props-context-banner">
      <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
        <strong style="color: #fff;">${ctx.mode === 'multi' ? `${ctx.clips.length} Clips Selected` : clip.name}</strong>
        ${ctx.mode === 'linked-av' ? `<span style="font-size: 9.5px; color: var(--accent-cyan); margin-left: 4px;">(Linked V+A)</span>` : ''}
      </div>
      ${ctx.pinned ? `<span style="font-size: 9.5px; color: var(--accent); font-weight: 700;">PINNED</span>` : ''}
    </div>
  `;

  // MULTI-CLIP SELECTION (Shared editable properties with honest Mixed indicators!)
  if (ctx.mode === 'multi') {
    const sh = ctx.shared;
    container.innerHTML = `
      ${headerBanner}
      <div class="inspector-accordion">
        <div class="accordion-header"><span>Shared Properties (${ctx.clips.length} Clips)</span><span class="icon icon-sm">expand_more</span></div>
        <div class="accordion-content">
          <div class="field-row">
            <div class="field-header"><span>Scale</span><span class="${sh.scale.mixed ? 'mixed-val-badge' : 'field-val'}" id="disp-m-scale">${sh.scale.mixed ? 'Mixed' : `${(sh.scale.value ?? 1).toFixed(2)}x`}</span></div>
            <input type="range" id="insp-m-scale" min="0.1" max="3" step="0.05" value="${sh.scale.mixed ? 1 : (sh.scale.value ?? 1)}">
          </div>
          <div class="field-row">
            <div class="field-header"><span>Opacity</span><span class="${sh.opacity.mixed ? 'mixed-val-badge' : 'field-val'}" id="disp-m-opac">${sh.opacity.mixed ? 'Mixed' : `${Math.round((sh.opacity.value ?? 1) * 100)}%`}</span></div>
            <input type="range" id="insp-m-opac" min="0" max="1" step="0.05" value="${sh.opacity.mixed ? 1 : (sh.opacity.value ?? 1)}">
          </div>
          <div class="field-row">
            <div class="field-header"><span>Volume (dB)</span><span class="${sh.volumeDb.mixed ? 'mixed-val-badge' : 'field-val'}" id="disp-m-vol">${sh.volumeDb.mixed ? 'Mixed' : `${(sh.volumeDb.value ?? 0).toFixed(1)} dB`}</span></div>
            <input type="range" id="insp-m-vol" min="-40" max="12" step="0.5" value="${sh.volumeDb.mixed ? 0 : (sh.volumeDb.value ?? 0)}">
          </div>
        </div>
      </div>
    `;
    bindSlider('insp-m-scale', 'disp-m-scale', v => ctx.clips.forEach(c => { if (c.transform) c.transform.scale = v; }), v => `${v.toFixed(2)}x`);
    bindSlider('insp-m-opac', 'disp-m-opac', v => ctx.clips.forEach(c => { if (c.transform) c.transform.opacity = v; }), v => `${Math.round(v * 100)}%`);
    bindSlider('insp-m-vol', 'disp-m-vol', v => ctx.clips.forEach(c => { if (c.audio) c.audio.volumeDb = v; }), v => `${v.toFixed(1)} dB`);
    bindAccordionToggles(container);
    return;
  }

  const activeTab = uiState.activePropertiesTab;
  const dec = clip.assetId ? store.runtimeState.decoders.get(clip.assetId) : null;

  // TAB 1: PROPERTIES (Video / Title Transform, Compositing, Crop, Speed)
  if (activeTab === 'properties') {
    const t = clip.transform;
    const crop = clip.crop || (clip.crop = { top: 0, bottom: 0, left: 0, right: 0 });
    container.innerHTML = `
      ${headerBanner}
      ${dec?.missing ? `
        <div style="margin: 8px; padding: 8px; background: rgba(227,111,120,0.14); border: 1px solid var(--error); border-radius: 4px; font-size: 11px;">
          <strong style="color: var(--error);">Media Offline</strong>
          <button class="action-btn-compact primary" id="insp-relink-clip-btn" style="margin-top: 6px; width: 100%; justify-content: center;">Relink Media...</button>
        </div>
      ` : ''}
      ${clip.isTitle ? `
        <div class="inspector-accordion">
          <div class="accordion-header"><span>Title Typography</span><span class="icon icon-sm">expand_more</span></div>
          <div class="accordion-content">
            <div class="field-row"><div class="field-header"><span>Text</span></div><input type="text" id="insp-title-text" value="${clip.titleText || clip.name}" style="background: var(--bg-input); border: 1px solid var(--border); color: #fff; padding: 4px 6px; border-radius: 3px; font-size: 11.5px;"></div>
            <div class="field-row"><div class="field-header"><span>Font Size</span><span class="field-val" id="disp-t-size">${clip.titleFontSize || 92}px</span></div><input type="range" id="insp-title-size" min="24" max="220" step="2" value="${clip.titleFontSize || 92}"></div>
            <div class="field-row"><div class="field-header"><span>Color</span><input type="color" id="insp-title-color" value="${clip.titleColor || '#ffffff'}" style="width: 32px; height: 20px; border: none; background: transparent; cursor: pointer;"></div></div>
          </div>
        </div>
      ` : ''}
      <div class="inspector-accordion">
        <div class="accordion-header"><span>Transform</span><span class="icon icon-sm">expand_more</span></div>
        <div class="accordion-content">
          <div class="field-row"><div class="field-header"><span>Position X</span><span class="field-val" id="disp-posx">${t.positionX}px</span></div><input type="range" id="insp-posx" min="-960" max="960" step="2" value="${t.positionX}"></div>
          <div class="field-row"><div class="field-header"><span>Position Y</span><span class="field-val" id="disp-posy">${t.positionY}px</span></div><input type="range" id="insp-posy" min="-540" max="540" step="2" value="${t.positionY}"></div>
          <div class="field-row"><div class="field-header"><span>Scale</span><span class="field-val" id="disp-scale">${Math.round(t.scale * 100)}%</span></div><input type="range" id="insp-scale" min="0.1" max="3" step="0.02" value="${t.scale}"></div>
          <div class="field-row"><div class="field-header"><span>Rotation</span><span class="field-val" id="disp-rot">${t.rotation}°</span></div><input type="range" id="insp-rot" min="-180" max="180" step="1" value="${t.rotation}"></div>
        </div>
      </div>
      <div class="inspector-accordion">
        <div class="accordion-header"><span>Compositing & Blend Mode</span><span class="icon icon-sm">expand_more</span></div>
        <div class="accordion-content">
          <div class="field-row"><div class="field-header"><span>Opacity</span><span class="field-val" id="disp-opac">${Math.round(t.opacity * 100)}%</span></div><input type="range" id="insp-opac" min="0" max="1" step="0.02" value="${t.opacity}"></div>
          <div class="field-row">
            <div class="field-header"><span>Blend Mode</span></div>
            <select id="insp-blend" class="compact-select" style="padding: 4px;">
              <option value="source-over" ${(clip.blendMode||'source-over')==='source-over'?'selected':''}>Normal</option>
              <option value="multiply" ${clip.blendMode==='multiply'?'selected':''}>Multiply</option>
              <option value="screen" ${clip.blendMode==='screen'?'selected':''}>Screen</option>
              <option value="overlay" ${clip.blendMode==='overlay'?'selected':''}>Overlay</option>
              <option value="lighter" ${clip.blendMode==='lighter'?'selected':''}>Add (Linear Dodge)</option>
            </select>
          </div>
        </div>
      </div>
      <div class="inspector-accordion">
        <div class="accordion-header"><span>Speed & Duration</span><span class="icon icon-sm">expand_more</span></div>
        <div class="accordion-content">
          <div class="field-row"><div class="field-header"><span>Speed</span><span class="field-val" id="disp-speed">${Math.round((clip.speed||1)*100)}%</span></div><input type="range" id="insp-speed" min="0.25" max="4" step="0.05" value="${clip.speed||1}"></div>
          <label style="font-size: 11px; display: flex; gap: 6px; align-items: center;"><input type="checkbox" id="insp-reverse" ${clip.reverse ? 'checked' : ''}> Reverse Speed</label>
        </div>
      </div>
      <div class="inspector-accordion">
        <div class="accordion-header"><span>Crop & Framing</span><span class="icon icon-sm">chevron_right</span></div>
        <div class="accordion-content collapsed">
          <div class="field-row"><div class="field-header"><span>Top</span><span class="field-val" id="disp-ct">${crop.top}%</span></div><input type="range" id="insp-ct" min="0" max="45" step="1" value="${crop.top}"></div>
          <div class="field-row"><div class="field-header"><span>Bottom</span><span class="field-val" id="disp-cb">${crop.bottom}%</span></div><input type="range" id="insp-cb" min="0" max="45" step="1" value="${crop.bottom}"></div>
          <div class="field-row"><div class="field-header"><span>Left</span><span class="field-val" id="disp-cl">${crop.left}%</span></div><input type="range" id="insp-cl" min="0" max="45" step="1" value="${crop.left}"></div>
          <div class="field-row"><div class="field-header"><span>Right</span><span class="field-val" id="disp-cr">${crop.right}%</span></div><input type="range" id="insp-cr" min="0" max="45" step="1" value="${crop.right}"></div>
        </div>
      </div>
    `;
    document.getElementById('insp-relink-clip-btn')?.addEventListener('click', () => triggerRelinkForAsset(clip.assetId));
    document.getElementById('insp-title-text')?.addEventListener('input', e => { clip.titleText = e.target.value; clip.name = `Title: ${e.target.value}`; renderProgramMonitor(); renderTimeline(); store.scheduleSave(300); });
    bindSlider('insp-title-size', 'disp-t-size', v => { clip.titleFontSize = v; }, v => `${v}px`);
    document.getElementById('insp-title-color')?.addEventListener('input', e => { clip.titleColor = e.target.value; renderProgramMonitor(); store.scheduleSave(300); });
    bindSlider('insp-posx', 'disp-posx', v => { clip.transform.positionX = v; }, v => `${v}px`);
    bindSlider('insp-posy', 'disp-posy', v => { clip.transform.positionY = v; }, v => `${v}px`);
    bindSlider('insp-scale', 'disp-scale', v => { clip.transform.scale = v; }, v => `${Math.round(v * 100)}%`);
    bindSlider('insp-rot', 'disp-rot', v => { clip.transform.rotation = v; }, v => `${v}°`);
    bindSlider('insp-opac', 'disp-opac', v => { clip.transform.opacity = v; }, v => `${Math.round(v * 100)}%`);
    document.getElementById('insp-blend')?.addEventListener('change', e => { clip.blendMode = e.target.value; renderProgramMonitor(); store.scheduleSave(250); });
    bindSlider('insp-speed', 'disp-speed', v => { clip.speed = v; }, v => `${Math.round(v * 100)}%`);
    document.getElementById('insp-reverse')?.addEventListener('change', e => { clip.reverse = e.target.checked; renderProgramMonitor(); store.scheduleSave(250); });
    bindSlider('insp-ct', 'disp-ct', v => { crop.top = v; }, v => `${v}%`);
    bindSlider('insp-cb', 'disp-cb', v => { crop.bottom = v; }, v => `${v}%`);
    bindSlider('insp-cl', 'disp-cl', v => { crop.left = v; }, v => `${v}%`);
    bindSlider('insp-cr', 'disp-cr', v => { crop.right = v; }, v => `${v}%`);
    bindAccordionToggles(container);
    return;
  }

  // TAB 2: AUDIO
  if (activeTab === 'audio') {
    const targetAudio = ctx.audioClip || clip;
    const a = targetAudio.audio || (targetAudio.audio = { volumeDb: 0, pan: 0, fadeIn: 0, fadeOut: 0, channels: 'stereo' });
    container.innerHTML = `
      ${headerBanner}
      <div class="inspector-accordion">
        <div class="accordion-header"><span>Volume & Balance · ${targetAudio.name}</span><span class="icon icon-sm">expand_more</span></div>
        <div class="accordion-content">
          <div class="field-row"><div class="field-header"><span>Volume Gain</span><span class="field-val" id="disp-vol">${a.volumeDb.toFixed(1)} dB</span></div><input type="range" id="insp-vol" min="-40" max="12" step="0.5" value="${a.volumeDb}"></div>
          <div class="field-row"><div class="field-header"><span>Stereo Pan / Balance</span><span class="field-val" id="disp-pan">${a.pan === 0 ? 'Center' : (a.pan < 0 ? `L ${Math.abs(a.pan)}` : `R ${a.pan}`)}</span></div><input type="range" id="insp-pan" min="-100" max="100" step="1" value="${a.pan}"></div>
          <div class="field-row">
            <div class="field-header"><span>Channel Configuration</span></div>
            <select id="insp-ach" class="compact-select" style="padding: 4px;">
              <option value="stereo" ${(a.channels||'stereo')==='stereo'?'selected':''}>Stereo (L + R)</option>
              <option value="left" ${a.channels==='left'?'selected':''}>Dual Mono (Left)</option>
              <option value="right" ${a.channels==='right'?'selected':''}>Dual Mono (Right)</option>
            </select>
          </div>
        </div>
      </div>
      <div class="inspector-accordion">
        <div class="accordion-header"><span>Audio Fades</span><span class="icon icon-sm">expand_more</span></div>
        <div class="accordion-content">
          <div class="field-row"><div class="field-header"><span>Fade In</span><span class="field-val" id="disp-fi">${(a.fadeIn||0).toFixed(1)}s</span></div><input type="range" id="insp-fi" min="0" max="5" step="0.1" value="${a.fadeIn||0}"></div>
          <div class="field-row"><div class="field-header"><span>Fade Out</span><span class="field-val" id="disp-fo">${(a.fadeOut||0).toFixed(1)}s</span></div><input type="range" id="insp-fo" min="0" max="5" step="0.1" value="${a.fadeOut||0}"></div>
          <button class="action-btn-compact" id="btn-open-audio-ws" style="margin-top: 4px; border-color: var(--border); justify-content: center;">Open Track Mixer & EQ Console →</button>
        </div>
      </div>
    `;
    bindSlider('insp-vol', 'disp-vol', v => { a.volumeDb = v; }, v => `${v.toFixed(1)} dB`);
    bindSlider('insp-pan', 'disp-pan', v => { a.pan = v; }, v => v === 0 ? 'Center' : (v < 0 ? `L ${Math.abs(v)}` : `R ${v}`));
    bindSlider('insp-fi', 'disp-fi', v => { a.fadeIn = v; }, v => `${v.toFixed(1)}s`);
    bindSlider('insp-fo', 'disp-fo', v => { a.fadeOut = v; }, v => `${v.toFixed(1)}s`);
    document.getElementById('insp-ach')?.addEventListener('change', e => { a.channels = e.target.value; store.scheduleSave(250); });
    document.getElementById('btn-open-audio-ws')?.addEventListener('click', () => switchWorkspace('audio'));
    bindAccordionToggles(container);
    return;
  }

  // TAB 3: EFFECTS (Applied Effects Stack — Distinct from Effects Library!)
  if (activeTab === 'effects') {
    const fxList = ensureEffectsArray(clip);
    container.innerHTML = `
      ${headerBanner}
      <div style="padding: 8px; display: flex; flex-direction: column; gap: 8px;">
        <div style="display: flex; gap: 4px;">
          <select id="sel-add-clip-fx" class="compact-select" style="flex: 1; padding: 4px;">
            ${AVAILABLE_CLIP_EFFECTS.map(e => `<option value="${e.id}">${e.name}</option>`).join('')}
          </select>
          <button class="action-btn-compact primary" id="btn-add-clip-fx">+ Add</button>
        </div>

        ${clip.transitionIn ? `
          <div class="applied-fx-card">
            <div class="applied-fx-header">
              <span>Transition: ${clip.transitionIn.name}</span>
              <button class="action-btn-compact danger" id="btn-remove-tr" style="padding: 1px 5px;">✕</button>
            </div>
            <div style="padding: 8px;">
              <div class="field-row"><div class="field-header"><span>Duration</span><span class="field-val" id="disp-tr-dur">${clip.transitionIn.duration.toFixed(2)}s</span></div><input type="range" id="insp-tr-dur" min="0.2" max="4" step="0.1" value="${clip.transitionIn.duration}"></div>
            </div>
          </div>
        ` : ''}

        ${fxList.length === 0 ? `<div style="font-size: 11px; color: var(--text-muted); text-align: center; padding: 14px 6px;">No effects applied to this clip yet. Add an effect above or browse Transitions in Effects Library.</div>` : fxList.map((fx, i) => `
          <div class="applied-fx-card" data-fx-uid="${fx.uid}">
            <div class="applied-fx-header">
              <label style="display: flex; align-items: center; gap: 5px; cursor: pointer;">
                <input type="checkbox" class="chk-fx-enable" ${fx.enabled ? 'checked' : ''}> ${fx.name}
              </label>
              <div style="display: flex; gap: 2px;">
                ${i > 0 ? `<button class="action-btn-compact btn-fx-up" style="padding: 1px 4px;">↑</button>` : ''}
                ${i < fxList.length - 1 ? `<button class="action-btn-compact btn-fx-down" style="padding: 1px 4px;">↓</button>` : ''}
                <button class="action-btn-compact danger btn-fx-del" style="padding: 1px 5px;">✕</button>
              </div>
            </div>
            <div style="padding: 8px; display: flex; flex-direction: column; gap: 6px; ${fx.enabled ? '' : 'opacity: 0.45;'}">
              ${Object.entries(fx.params).map(([pKey, pVal]) => `
                <div class="field-row">
                  <div class="field-header"><span>${pKey}</span><span class="field-val" data-fx-val="${pKey}">${Number(pVal).toFixed(2)}</span></div>
                  <input type="range" class="sl-fx-param" data-fx-param="${pKey}" min="${pKey === 'radiusPx' ? 0 : (pKey === 'exposure' ? -2 : 0)}" max="${pKey === 'radiusPx' ? 24 : (pKey === 'temperature' ? 100 : 2)}" step="0.05" value="${pVal}">
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    `;

    document.getElementById('btn-add-clip-fx')?.addEventListener('click', () => {
      const fxId = document.getElementById('sel-add-clip-fx')?.value;
      if (fxId) executeCommand('Add Clip Effect', () => { addClipEffect(clip, fxId); });
    });
    if (clip.transitionIn) {
      bindSlider('insp-tr-dur', 'disp-tr-dur', v => { clip.transitionIn.duration = v; }, v => `${v.toFixed(2)}s`);
      document.getElementById('btn-remove-tr')?.addEventListener('click', () => executeCommand('Remove Transition', () => { clip.transitionIn = null; }));
    }
    container.querySelectorAll('.applied-fx-card[data-fx-uid]').forEach(card => {
      const uid = card.dataset.fxUid;
      const fx = fxList.find(x => x.uid === uid);
      if (!fx) return;
      card.querySelector('.chk-fx-enable')?.addEventListener('change', () => executeCommand('Toggle Effect', () => toggleClipEffect(clip, uid)));
      card.querySelector('.btn-fx-up')?.addEventListener('click', () => executeCommand('Reorder Effect', () => moveClipEffect(clip, uid, -1)));
      card.querySelector('.btn-fx-down')?.addEventListener('click', () => executeCommand('Reorder Effect', () => moveClipEffect(clip, uid, 1)));
      card.querySelector('.btn-fx-del')?.addEventListener('click', () => executeCommand('Remove Effect', () => removeClipEffect(clip, uid)));
      card.querySelectorAll('.sl-fx-param').forEach(sl => {
        sl.addEventListener('input', e => {
          const v = parseFloat(e.target.value);
          fx.params[sl.dataset.fxParam] = v;
          const lbl = card.querySelector(`[data-fx-val="${sl.dataset.fxParam}"]`);
          if (lbl) lbl.textContent = v.toFixed(2);
          renderProgramMonitor();
          store.scheduleSave(250);
        });
      });
    });
    return;
  }

  // TAB 4: MOTION (Transform Keyframes, Easing & Graph Editor Access)
  if (activeTab === 'motion') {
    const localT = Math.max(0, store.sessionState.playheadTime - clip.timelineStart);
    const kfProps = [
      { key: 'positionX', label: 'Position X', cur: clip.transform.positionX },
      { key: 'positionY', label: 'Position Y', cur: clip.transform.positionY },
      { key: 'scale',     label: 'Scale',      cur: clip.transform.scale },
      { key: 'rotation',  label: 'Rotation',   cur: clip.transform.rotation },
      { key: 'opacity',   label: 'Opacity',    cur: clip.transform.opacity },
    ];
    container.innerHTML = `
      ${headerBanner}
      <div class="inspector-accordion">
        <div class="accordion-header"><span>Keyframes at ${formatTimecode(localT, seq.fps)}</span><span class="icon icon-sm">expand_more</span></div>
        <div class="accordion-content">
          <div class="field-row">
            <div class="field-header"><span>Default Interpolation</span></div>
            <select id="insp-kf-ease" class="compact-select" style="padding: 4px;">
              <option value="smooth">Easy Ease (Smooth)</option>
              <option value="linear">Linear</option>
              <option value="ease-in">Ease In</option>
              <option value="ease-out">Ease Out</option>
            </select>
          </div>
          ${kfProps.map(p => {
            const list = clip.keyframes?.[p.key] || [];
            const hasHere = list.some(k => Math.abs(k.time - localT) < 0.06);
            return `
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0; border-bottom: 1px solid var(--border-divider);">
                <div style="display: flex; align-items: center; gap: 5px;">
                  <button class="kf-stopwatch-btn ${hasHere ? 'active' : ''}" data-kf-prop="${p.key}" title="Toggle Keyframe at Playhead"><span class="icon icon-sm">timer</span></button>
                  <span style="font-size: 11.5px;">${p.label}</span>
                </div>
                <span style="font-family: monospace; font-size: 10.5px; color: var(--text-secondary);">${list.length} kf</span>
              </div>
            `;
          }).join('')}
          <button class="action-btn-compact primary" id="btn-open-graph-from-motion" style="margin-top: 6px; justify-content: center;">
            <span class="icon icon-sm">show_chart</span> Open Graph Editor
          </button>
        </div>
      </div>
    `;
    container.querySelectorAll('[data-kf-prop]').forEach(btn => {
      btn.addEventListener('click', () => {
        const prop = btn.dataset.kfProp;
        const ease = document.getElementById('insp-kf-ease')?.value || 'smooth';
        executeCommand(`Toggle Keyframe: ${prop}`, () => {
          toggleKeyframeAtLocalTime(clip, prop, localT, clip.transform[prop], ease);
        });
      });
    });
    document.getElementById('btn-open-graph-from-motion')?.addEventListener('click', () => {
      const drawer = document.getElementById('motion-graph-drawer');
      if (drawer) { drawer.style.display = 'block'; drawMotionGraphCanvas(); }
    });
    return;
  }

  // TAB 5: METADATA
  if (activeTab === 'metadata') {
    const asset = clip.assetId ? store.projectState.assets[clip.assetId] : null;
    container.innerHTML = `
      ${headerBanner}
      <div class="inspector-accordion">
        <div class="accordion-header"><span>Source Media Metadata</span><span class="icon icon-sm">expand_more</span></div>
        <div class="accordion-content">
          <div class="field-row"><div class="field-header"><span>Original File</span><span class="field-val">${asset ? asset.name : clip.name}</span></div></div>
          <div class="field-row"><div class="field-header"><span>Availability</span><span class="field-val" style="color: ${dec?.missing ? 'var(--error)' : 'var(--success)'};">${dec?.missing ? 'MEDIA OFFLINE' : 'Online'}</span></div></div>
          <div class="field-row"><div class="field-header"><span>Resolution</span><span class="field-val">${asset ? `${asset.width} × ${asset.height}` : `${seq.width} × ${seq.height}`}</span></div></div>
          <div class="field-row"><div class="field-header"><span>Source Duration</span><span class="field-val">${formatTimecode(asset ? asset.duration : clip.timelineDuration, seq.fps)}</span></div></div>
          <div class="field-row"><div class="field-header"><span>MIME / Codec</span><span class="field-val">${asset ? asset.type : 'Procedural Title'}</span></div></div>
          <div class="field-row"><div class="field-header"><span>File Size</span><span class="field-val">${asset ? `${(asset.size / (1024 * 1024)).toFixed(2)} MB` : '--'}</span></div></div>
          ${dec?.missing ? `<button class="action-btn-compact primary" id="meta-relink-btn">Relink Media...</button>` : ''}
        </div>
      </div>
    `;
    document.getElementById('meta-relink-btn')?.addEventListener('click', () => triggerRelinkForAsset(clip.assetId));
  }
}

// --- DEDICATED UTILITY PANELS: HISTORY & MARKERS ---
function renderHistoryPanel() {
  const body = document.getElementById('history-panel-body');
  if (!body) return;
  if (uiState.undoStack.length === 0 && uiState.redoStack.length === 0) {
    body.innerHTML = `<div style="font-size: 11px; color: var(--text-muted); text-align: center; padding: 16px;">No edit history yet. Actions will appear here.</div>`;
    return;
  }
  body.innerHTML = `
    <div style="display: flex; gap: 4px; margin-bottom: 8px;">
      <button class="action-btn-compact" id="hist-undo-btn" style="flex:1; justify-content:center; border-color: var(--border);">Undo (${uiState.undoStack.length})</button>
      <button class="action-btn-compact" id="hist-redo-btn" style="flex:1; justify-content:center; border-color: var(--border);">Redo (${uiState.redoStack.length})</button>
    </div>
    ${[...uiState.undoStack].reverse().map((item, idx) => `
      <div style="padding: 5px 8px; border-bottom: 1px solid var(--border-divider); font-size: 11px; color: ${idx === 0 ? 'var(--accent)' : 'var(--text-primary)'};">
        ${idx === 0 ? '● ' : ''}${item.description}
      </div>
    `).join('')}
  `;
  document.getElementById('hist-undo-btn')?.addEventListener('click', undo);
  document.getElementById('hist-redo-btn')?.addEventListener('click', redo);
}

function renderMarkersPanel() {
  const body = document.getElementById('markers-panel-body');
  if (!body) return;
  const seq = getActiveSequence();
  if (!seq.markers || seq.markers.length === 0) {
    body.innerHTML = `<div style="font-size: 11px; color: var(--text-muted); text-align: center; padding: 16px;">No markers in sequence. Press <strong>M</strong> or click <strong>+</strong> to add a marker.</div>`;
    return;
  }
  body.innerHTML = seq.markers.map(m => `
    <div class="fx-item-card" data-jump-marker="${m.id}">
      <div>
        <div style="font-weight: 600; color: var(--warning);">${m.label}</div>
        <div style="font-size: 10px; font-family: monospace; color: var(--text-secondary);">${formatTimecode(m.time, seq.fps)}</div>
      </div>
      <button class="action-btn-compact danger btn-del-marker" data-del-marker="${m.id}" style="padding: 1px 5px;">✕</button>
    </div>
  `).join('');
  body.querySelectorAll('[data-jump-marker]').forEach(el => el.addEventListener('click', (e) => {
    if (e.target.dataset.delMarker) return;
    const m = seq.markers.find(x => x.id === el.dataset.jumpMarker);
    if (m) seekSequence(m.time);
  }));
  body.querySelectorAll('.btn-del-marker').forEach(b => b.addEventListener('click', (e) => {
    e.stopPropagation();
    executeCommand('Delete Marker', () => { seq.markers = seq.markers.filter(x => x.id !== b.dataset.delMarker); });
  }));
}

// --- DEDICATED MODALS: PROJECT SETTINGS & SEQUENCE SETTINGS ---
function openProjectSettingsModal() {
  const modal = document.getElementById('modal-project-settings');
  const body = document.getElementById('project-settings-body');
  if (!modal || !body) return;
  const p = store.projectState;
  body.innerHTML = `
    <div class="field-row"><div class="field-header"><span>Project Name</span></div><input type="text" id="ps-title" value="${p.title}" style="background: var(--bg-input); border: 1px solid var(--border); color: #fff; padding: 6px; border-radius: 3px;"></div>
    <div class="field-row"><div class="field-header"><span>Imported Assets</span><span class="field-val">${Object.keys(p.assets).length}</span></div></div>
    <div class="field-row"><div class="field-header"><span>Sequences</span><span class="field-val">${Object.keys(p.sequences).length}</span></div></div>
    <div class="field-row"><div class="field-header"><span>Color Management</span><span class="field-val" style="color: var(--success);">Rec.709 Linear 32-bit</span></div></div>
    <div style="display: flex; justify-content: flex-end; gap: 6px; margin-top: 8px;">
      <button class="action-btn-compact primary" id="btn-save-proj-settings">Save Project Settings</button>
    </div>
  `;
  document.getElementById('btn-save-proj-settings')?.addEventListener('click', () => {
    const val = document.getElementById('ps-title')?.value?.trim();
    if (val && val !== p.title) {
      p.title = val;
      store.markProjectDirty('project-settings');
      store.saveProjectNow({ reason: 'project-settings', manual: true });
    }
    renderAll();
    modal.classList.remove('active');
  });
  modal.classList.add('active');
}

function openSequenceSettingsModal() {
  const modal = document.getElementById('modal-sequence-settings');
  const body = document.getElementById('sequence-settings-body');
  if (!modal || !body) return;
  const seq = getActiveSequence();
  body.innerHTML = `
    <div class="field-row"><div class="field-header"><span>Sequence Name</span></div><input type="text" id="ss-name" value="${seq.name}" style="background: var(--bg-input); border: 1px solid var(--border); color: #fff; padding: 6px; border-radius: 3px;"></div>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
      <div class="field-row"><div class="field-header"><span>Width (px)</span></div><input type="number" id="ss-w" value="${seq.width}" style="background: var(--bg-input); border: 1px solid var(--border); color: #fff; padding: 5px; border-radius: 3px;"></div>
      <div class="field-row"><div class="field-header"><span>Height (px)</span></div><input type="number" id="ss-h" value="${seq.height}" style="background: var(--bg-input); border: 1px solid var(--border); color: #fff; padding: 5px; border-radius: 3px;"></div>
      <div class="field-row"><div class="field-header"><span>Frame Rate</span></div>
        <select id="ss-fps" class="compact-select" style="padding: 5px;">
          ${[23.976, 24, 25, 29.97, 30, 60].map(f => `<option value="${f}" ${seq.fps === f ? 'selected' : ''}>${f} fps</option>`).join('')}
        </select>
      </div>
      <div class="field-row"><div class="field-header"><span>Duration (sec)</span></div><input type="number" id="ss-dur" value="${seq.duration}" min="10" max="3600" style="background: var(--bg-input); border: 1px solid var(--border); color: #fff; padding: 5px; border-radius: 3px;"></div>
    </div>
    <div style="display: flex; justify-content: flex-end; gap: 6px; margin-top: 10px;">
      <button class="action-btn-compact primary" id="btn-save-seq-settings">Apply Sequence Settings</button>
    </div>
  `;
  document.getElementById('btn-save-seq-settings')?.addEventListener('click', () => {
    executeCommand('Update Sequence Settings', () => {
      seq.name = document.getElementById('ss-name')?.value?.trim() || seq.name;
      seq.width = Math.max(320, parseInt(document.getElementById('ss-w')?.value, 10) || 1920);
      seq.height = Math.max(240, parseInt(document.getElementById('ss-h')?.value, 10) || 1080);
      seq.fps = parseFloat(document.getElementById('ss-fps')?.value) || 24;
      seq.duration = Math.max(10, parseInt(document.getElementById('ss-dur')?.value, 10) || 60);
    });
    modal.classList.remove('active');
  });
  modal.classList.add('active');
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
// 14. Menus, Modals & Central Shortcut Keyboard Engine
// ----------------------------------------------------
function getPanelViewContext() {
  return {
    store,
    audioEngine,
    uiState,
    getActiveSequence,
    getActiveClip,
    setSelectedClipIds,
    formatTimecode,
    executeCommand,
    bindAccordionToggles,
    bindSlider,
    renderProgramMonitor,
    renderTimeline,
    renderAll,
    seekSequence,
    loadAssetIntoSourceMonitor,
    insertSourceOrAssetToTimeline,
    triggerRelinkForAsset,
    applyTransitionToActiveClip,
    addTitleOverlayClip,
    resetClipProperties,
    openProjectSettingsModal,
    openSequenceSettingsModal,
    openStorageDiagnosticsPanel: () => layoutManager.focusOrOpenPanel('storage-diagnostics'),
  };
}

function toggleClipEnabledAction() {
  const clip = getActiveClip();
  if (!clip) return;
  executeCommand(clip.disabled ? 'Enable Clip' : 'Disable Clip', () => {
    clip.disabled = !clip.disabled;
  });
}

function cutActiveClipAction() {
  const c = getActiveClip();
  if (!c) return;
  store.runtimeState.clipboardClip = JSON.parse(JSON.stringify(c));
  deleteActiveClip();
}

function initMenus() {
  // FILE
  document.getElementById('m-file-new')?.addEventListener('click', async () => {
    if (!confirm('Create a new empty project?')) return;
    // Save any pending changes on the current project before switching to a new project
    if (store.autosave.hasPendingChanges()) {
      await store.saveProjectNow({ reason: 'project-switch-save', manual: false });
    }
    const newId = `proj_${Date.now()}`;
    store.projectState = createDefaultProjectState(newId);
    store.sessionState = createDefaultSessionState();
    store.sessionState.activeProjectId = newId;
    store.runtimeState.decoders.clear();
    store.autosave.resetBaseline({ savedAt: null, revision: 0 });
    store.markProjectDirty('new-project');
    await store.saveProjectNow({ reason: 'new-project', manual: true });
    syncSessionControlsUI();
    renderAll();
  });
  document.getElementById('m-file-open')?.addEventListener('click', () => document.getElementById('open-project-file-input')?.click());
  document.getElementById('m-file-save')?.addEventListener('click', () => store.saveProjectNow({ reason: 'manual-save', manual: true }));
  document.getElementById('m-file-save-as')?.addEventListener('click', async () => {
    const t = prompt('Save Project As:', store.projectState.title);
    if (t && t.trim() && t.trim() !== store.projectState.title) {
      store.projectState.title = t.trim();
      store.markProjectDirty('save-as');
      await store.saveProjectNow({ reason: 'save-as', manual: true });
      renderAll();
    }
  });
  document.getElementById('m-file-import')?.addEventListener('click', () => document.getElementById('video-file-input')?.click());
  document.getElementById('m-file-export')?.addEventListener('click', () => switchWorkspace('deliver'));
  document.getElementById('btn-goto-deliver')?.addEventListener('click', () => switchWorkspace('deliver'));
  document.getElementById('m-file-project-info')?.addEventListener('click', () => layoutManager.focusOrOpenPanel('project-info'));
  document.getElementById('m-file-archive')?.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(store.projectState, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${store.projectState.title.replace(/\s+/g, '_')}.frameflow.json`; a.click();
  });

  // EDIT
  document.getElementById('m-edit-undo')?.addEventListener('click', undo);
  document.getElementById('m-edit-redo')?.addEventListener('click', redo);
  document.getElementById('btn-undo')?.addEventListener('click', undo);
  document.getElementById('btn-redo')?.addEventListener('click', redo);
  document.getElementById('m-edit-cut')?.addEventListener('click', cutActiveClipAction);
  document.getElementById('m-edit-copy')?.addEventListener('click', () => { const c = getActiveClip(); if (c) store.runtimeState.clipboardClip = JSON.parse(JSON.stringify(c)); });
  document.getElementById('m-edit-paste')?.addEventListener('click', pasteClipboardClip);
  document.getElementById('m-edit-delete')?.addEventListener('click', deleteActiveClip);
  document.getElementById('m-edit-prefs')?.addEventListener('click', openProjectSettingsModal);
  document.getElementById('m-edit-shortcuts')?.addEventListener('click', openShortcutsModal);

  // PROJECT
  document.getElementById('m-proj-settings')?.addEventListener('click', openProjectSettingsModal);
  document.getElementById('m-proj-rename')?.addEventListener('click', () => {
    const t = prompt('Rename Project:', store.projectState.title);
    if (t && t.trim() && t.trim() !== store.projectState.title) {
      store.projectState.title = t.trim();
      store.markProjectDirty('rename-project');
      store.saveProjectNow({ reason: 'rename-project', manual: true });
      renderAll();
    }
  });
  document.getElementById('m-proj-assets')?.addEventListener('click', () => layoutManager.focusOrOpenPanel('project'));
  document.getElementById('m-proj-browser')?.addEventListener('click', () => layoutManager.focusOrOpenPanel('media-browser'));
  document.getElementById('m-proj-newbin')?.addEventListener('click', createNewBin);
  document.getElementById('m-proj-relink')?.addEventListener('click', () => {
    const id = getActiveClip()?.assetId || store.sessionState.sourceAssetId;
    if (id) triggerRelinkForAsset(id);
    else layoutManager.focusOrOpenPanel('media-dependencies');
  });
  document.getElementById('m-proj-deps')?.addEventListener('click', () => layoutManager.focusOrOpenPanel('media-dependencies'));
  document.getElementById('m-proj-media')?.addEventListener('click', () => switchWorkspace('media'));

  // CLIP
  document.getElementById('m-clip-insert')?.addEventListener('click', () => { if (store.sessionState.sourceAssetId) insertSourceOrAssetToTimeline(store.sessionState.sourceAssetId, store.sessionState.playheadTime, { mode: 'insert', useSourceRange: true }); });
  document.getElementById('m-clip-overwrite')?.addEventListener('click', () => { if (store.sessionState.sourceAssetId) insertSourceOrAssetToTimeline(store.sessionState.sourceAssetId, store.sessionState.playheadTime, { mode: 'overwrite', useSourceRange: true }); });
  document.getElementById('m-clip-split')?.addEventListener('click', () => { const id = getSelectedClipId(); if (id) splitClipAction(id, store.sessionState.playheadTime); });
  document.getElementById('m-clip-speed')?.addEventListener('click', () => { const c = getActiveClip(); if (c) editClipSpeedPrompt(c); });
  document.getElementById('m-clip-enable')?.addEventListener('click', toggleClipEnabledAction);
  document.getElementById('m-clip-link-clips')?.addEventListener('click', linkSelectedClipsAction);
  document.getElementById('m-clip-unlink-clips')?.addEventListener('click', unlinkSelectedClipsAction);
  document.getElementById('m-clip-select-linked')?.addEventListener('click', () => { const id = getSelectedClipId(); if (id) selectLinkedClipsAction(id); });
  document.getElementById('m-clip-move-sync')?.addEventListener('click', () => { const id = getSelectedClipId(); if (id) moveIntoSyncAction(id); });
  document.getElementById('m-clip-link')?.addEventListener('click', () => document.getElementById('btn-link-toggle')?.click());
  document.getElementById('m-clip-reveal')?.addEventListener('click', () => { const c = getActiveClip(); if (c?.assetId) revealOriginalMedia(c.assetId); });
  document.getElementById('m-clip-reset')?.addEventListener('click', () => { const c = getActiveClip(); if (c) resetClipProperties(c); });

  // SEQUENCE
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
  document.getElementById('m-seq-settings')?.addEventListener('click', openSequenceSettingsModal);
  document.getElementById('m-seq-render-preview')?.addEventListener('click', renderProgramMonitor);

  // TIMELINE
  document.getElementById('m-time-add-v')?.addEventListener('click', () => addTrack('video'));
  document.getElementById('m-time-add-a')?.addEventListener('click', () => addTrack('audio'));
  document.getElementById('m-time-snap')?.addEventListener('click', toggleSnapping);
  document.getElementById('m-time-synclock')?.addEventListener('click', () => document.getElementById('btn-synclock-toggle')?.click());
  document.getElementById('m-time-zoom-in')?.addEventListener('click', () => zoomTimeline(1.3));
  document.getElementById('m-time-zoom-out')?.addEventListener('click', () => zoomTimeline(1 / 1.3));
  document.getElementById('m-time-fit')?.addEventListener('click', fitTimelineToSequence);
  document.getElementById('m-time-marker')?.addEventListener('click', addMarkerAtPlayhead);
  document.getElementById('m-time-index')?.addEventListener('click', () => layoutManager.focusOrOpenPanel('timeline-index'));

  // GRAPHICS
  document.getElementById('m-gfx-title')?.addEventListener('click', () => addTitleOverlayClip());
  document.getElementById('m-gfx-essential')?.addEventListener('click', () => layoutManager.focusOrOpenPanel('essential-graphics'));
  document.getElementById('m-gfx-safe')?.addEventListener('click', () => document.getElementById('btn-toggle-safe-margins')?.click());
  document.getElementById('m-gfx-workspace')?.addEventListener('click', () => switchWorkspace('graphics'));

  // EFFECTS
  document.getElementById('m-fx-library')?.addEventListener('click', () => layoutManager.focusOrOpenPanel('effects-library'));
  document.getElementById('m-fx-controls')?.addEventListener('click', () => layoutManager.focusOrOpenPanel('effect-controls'));
  document.getElementById('m-fx-transitions')?.addEventListener('click', () => layoutManager.focusOrOpenPanel('transition-browser'));
  document.getElementById('m-fx-apply-dissolve')?.addEventListener('click', () => applyTransitionToActiveClip(TRANSITION_CATALOG[0]));
  document.getElementById('m-fx-reset')?.addEventListener('click', () => { const c = getActiveClip(); if (c) resetClipProperties(c); });
  document.getElementById('m-fx-workspace')?.addEventListener('click', () => switchWorkspace('effects'));

  // AUDIO
  document.getElementById('m-audio-mixer')?.addEventListener('click', () => layoutManager.focusOrOpenPanel('audio-mixer'));
  document.getElementById('m-audio-routing')?.addEventListener('click', () => layoutManager.focusOrOpenPanel('audio-routing'));
  document.getElementById('m-audio-meters')?.addEventListener('click', () => layoutManager.focusOrOpenPanel('audio-meters'));
  document.getElementById('m-audio-loudness-panel')?.addEventListener('click', () => layoutManager.focusOrOpenPanel('loudness-analysis'));
  document.getElementById('m-audio-loudness')?.addEventListener('click', () => { audioEngine.lufsHistory = []; });
  document.getElementById('m-audio-workspace')?.addEventListener('click', () => switchWorkspace('audio'));

  // COLOR
  document.getElementById('m-color-controls')?.addEventListener('click', () => layoutManager.focusOrOpenPanel('color-controls'));
  document.getElementById('m-color-wheels')?.addEventListener('click', () => layoutManager.focusOrOpenPanel('color-wheels'));
  document.getElementById('m-color-luts')?.addEventListener('click', () => layoutManager.focusOrOpenPanel('lut-browser'));
  document.getElementById('m-color-scopes')?.addEventListener('click', () => layoutManager.focusOrOpenPanel('video-scopes'));
  document.getElementById('m-color-reset')?.addEventListener('click', () => { const c = getActiveClip(); if (c) resetClipProperties(c); });
  document.getElementById('m-color-workspace')?.addEventListener('click', () => switchWorkspace('color'));

  // VIEW
  document.getElementById('m-view-source')?.addEventListener('click', () => switchMonitorTab('source'));
  document.getElementById('m-view-program')?.addEventListener('click', () => switchMonitorTab('program'));
  document.getElementById('m-view-split')?.addEventListener('click', toggleMonitorSplitView);
  document.getElementById('m-view-safe')?.addEventListener('click', () => document.getElementById('btn-toggle-safe-margins')?.click());
  document.getElementById('m-view-overlays')?.addEventListener('click', () => document.getElementById('prg-btn-overlays')?.click());
  document.getElementById('m-view-compare')?.addEventListener('click', () => document.getElementById('prg-btn-compare')?.click());
  document.getElementById('m-view-zoom-in')?.addEventListener('click', () => zoomTimeline(1.3));
  document.getElementById('m-view-zoom-out')?.addEventListener('click', () => zoomTimeline(1 / 1.3));
  document.getElementById('m-view-fullscreen')?.addEventListener('click', () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
  });

  // HELP
  document.getElementById('m-help-docs')?.addEventListener('click', () => document.getElementById('modal-docs')?.classList.add('active'));
  document.getElementById('m-help-shortcuts')?.addEventListener('click', openShortcutsModal);
  document.getElementById('m-help-diagnostics')?.addEventListener('click', openDiagnosticsModal);
  document.getElementById('m-help-storage')?.addEventListener('click', () => layoutManager.focusOrOpenPanel('storage-diagnostics'));
  document.getElementById('btn-open-diagnostics')?.addEventListener('click', openDiagnosticsModal);
  document.getElementById('m-help-about')?.addEventListener('click', () => alert('FRAMEFLOW Studio v9.0.0\nCustomizable Docking & Tab/Stack Panel Architecture, 9 Workspaces, Central Shortcut Registry & 4-Layer Persistence'));
}

const KEYBOARD_ROWS = [
  ['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', 'Backspace'],
  ['Tab', 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '[', ']', '\\'],
  ['Caps', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';', "'", 'Enter'],
  ['Shift', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '/', 'Shift'],
  ['Ctrl', 'Alt', 'Space', 'Alt', 'Ctrl'],
];

function persistShortcuts() {
  try {
    localStorage.setItem('ff_shortcuts_v2', JSON.stringify(shortcutRegistry.getAll().map(s => ({ id: s.id, key: s.key }))));
  } catch {}
}

function initModals() {
  document.getElementById('btn-close-shortcuts-modal')?.addEventListener('click', () => {
    store.runtimeState.rebindingShortcutId = null;
    document.getElementById('modal-shortcuts')?.classList.remove('active');
  });
  document.getElementById('btn-close-diagnostics-modal')?.addEventListener('click', () => {
    document.getElementById('modal-diagnostics')?.classList.remove('active');
  });
  document.getElementById('btn-close-proj-settings')?.addEventListener('click', () => {
    document.getElementById('modal-project-settings')?.classList.remove('active');
  });
  document.getElementById('btn-close-seq-settings')?.addEventListener('click', () => {
    document.getElementById('modal-sequence-settings')?.classList.remove('active');
  });
  document.getElementById('btn-close-docs-modal')?.addEventListener('click', () => {
    document.getElementById('modal-docs')?.classList.remove('active');
  });

  document.getElementById('preset-selector')?.addEventListener('change', (e) => {
    shortcutRegistry.applyPreset(e.target.value);
    persistShortcuts();
    renderVisualKeyboard();
    renderShortcutsTable(document.getElementById('shortcut-search')?.value || '');
  });

  document.getElementById('btn-reset-shortcuts')?.addEventListener('click', () => {
    shortcutRegistry.restoreDefaults();
    localStorage.removeItem('ff_shortcuts_v2');
    const banner = document.getElementById('shortcut-conflict-banner');
    if (banner) banner.style.display = 'none';
    renderVisualKeyboard();
    renderShortcutsTable(document.getElementById('shortcut-search')?.value || '');
  });

  document.getElementById('btn-export-shortcuts')?.addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([shortcutRegistry.exportProfile()], { type: 'application/json' }));
    a.download = 'frameflow-shortcuts.json';
    a.click();
  });

  document.getElementById('btn-import-shortcuts')?.addEventListener('click', () => {
    document.getElementById('import-shortcuts-file-input')?.click();
  });

  const importScInput = document.getElementById('import-shortcuts-file-input');
  importScInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    importScInput.value = '';
    if (!file) return;
    const res = shortcutRegistry.importProfile(await file.text());
    if (!res.ok) {
      alert('Invalid shortcut profile JSON.');
      return;
    }
    persistShortcuts();
    renderVisualKeyboard();
    renderShortcutsTable(document.getElementById('shortcut-search')?.value || '');
  });

  document.getElementById('shortcut-search')?.addEventListener('input', (e) => renderShortcutsTable(e.target.value));
}

function openShortcutsModal() {
  document.getElementById('modal-shortcuts')?.classList.add('active');
  renderVisualKeyboard();
  renderShortcutsTable(document.getElementById('shortcut-search')?.value || '');
}

function renderVisualKeyboard() {
  const container = document.getElementById('virtual-keyboard-container');
  if (!container) return;
  const map = {};
  for (const s of shortcutRegistry.getAll()) {
    if (s.key) map[s.key.toUpperCase()] = s;
  }
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
  const rows = shortcutRegistry.search(filter);
  tbody.innerHTML = rows.map(s => {
    const conflicts = s.key ? shortcutRegistry.findConflicts(s.key, s.id) : [];
    return `
      <tr style="border-bottom: 1px solid var(--border-divider);">
        <td style="padding: 5px 10px; color: #fff;">${s.name}</td>
        <td style="padding: 5px 10px; color: var(--text-secondary);">${s.category}</td>
        <td style="padding: 5px 10px;">
          <button class="action-btn-compact btn-rebind-key" data-sc-id="${s.id}" style="font-family: monospace; color: ${conflicts.length ? 'var(--error)' : 'var(--accent-cyan)'}; border-color: ${conflicts.length ? 'var(--error)' : 'var(--border)'};">
            ${store.runtimeState.rebindingShortcutId === s.id ? 'Press new key...' : (s.key || 'Unassigned')}
          </button>
        </td>
        <td style="padding: 5px 10px;">
          ${s.key ? `<button class="action-btn-compact btn-clear-key" data-sc-clear="${s.id}" title="Remove shortcut">Clear</button>` : ''}
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('.btn-rebind-key').forEach(b => b.addEventListener('click', () => {
    store.runtimeState.rebindingShortcutId = b.dataset.scId;
    renderShortcutsTable(filter);
  }));
  tbody.querySelectorAll('.btn-clear-key').forEach(b => b.addEventListener('click', () => {
    shortcutRegistry.removeShortcut(b.dataset.scClear);
    persistShortcuts();
    renderVisualKeyboard();
    renderShortcutsTable(filter);
  }));
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
        <div>IndexedDB Schema: <strong>v2 (Dock Tree + 4-Layer Store)</strong></div>
        <div>Export Codecs: <strong>${cod.formats.filter(f => f.supported).length} Supported</strong></div>
      </div>
      <div style="background: #10151E; padding: 10px; border: 1px solid var(--border); border-radius: 4px;">
        <div style="color: var(--warning); font-weight: 700; margin-bottom: 6px;">SESSION & PERFORMANCE</div>
        <div>Measured FPS: <strong>${store.runtimeState.measuredFps} FPS (Drops: ${store.runtimeState.droppedFrames})</strong></div>
        <div>Active Workspace: <strong>${getWorkspaceMeta(store.workspaceState.activeWorkspace).name}</strong></div>
        <div>Selected Clips: <strong>${store.sessionState.selectedClipIds.length}</strong></div>
      </div>
    </div>
  `;
  modal.classList.add('active');
}

function executeShortcutCommand(id) {
  switch (id) {
    case 'shortcuts_modal': openShortcutsModal(); return;
    case 'undo': undo(); return;
    case 'redo': redo(); return;
    case 'save_project': store.saveProjectNow({ reason: 'manual-ctrl-s', manual: true }); return;
    case 'import_media': document.getElementById('video-file-input')?.click(); return;
    case 'new_bin': createNewBin(); return;
    case 'export_deliver': switchWorkspace('deliver'); return;
    case 'link_clips': linkSelectedClipsAction(); return;
    case 'unlink_clips': unlinkSelectedClipsAction(); return;
    case 'toggle_linked_sel': document.getElementById('btn-link-toggle')?.click(); return;
    case 'split_playhead': { const cid = getSelectedClipId(); if (cid) splitClipAction(cid, store.sessionState.playheadTime); return; }
    case 'cut_clip': cutActiveClipAction(); return;
    case 'copy_clip': { const c = getActiveClip(); if (c) store.runtimeState.clipboardClip = JSON.parse(JSON.stringify(c)); return; }
    case 'paste_clip': pasteClipboardClip(); return;
    case 'delete_clip': deleteActiveClip(); return;
    case 'clear_io': clearSourceInOut(); return;
    case 'maximize_panel': layoutManager.toggleMaximizeGroup(); return;
    case 'play_pause':
      if (layoutManager.focusedPanelId === 'source-monitor') toggleSourcePlayback();
      else toggleSequencePlayback();
      return;
    case 'shuttle_rev': store.runtimeState.isPlayingSequence = true; store.runtimeState.playbackSpeed = store.runtimeState.playbackSpeed <= 0 ? store.runtimeState.playbackSpeed - 1 : -1; return;
    case 'shuttle_pause': store.runtimeState.isPlayingSequence = false; store.runtimeState.playbackSpeed = 1; return;
    case 'shuttle_fwd': store.runtimeState.isPlayingSequence = true; store.runtimeState.playbackSpeed = store.runtimeState.playbackSpeed >= 1 ? store.runtimeState.playbackSpeed + 1 : 1; return;
    case 'step_prev_frame': stepProgramFrames(-1); return;
    case 'step_next_frame': stepProgramFrames(1); return;
    case 'step_prev_5': stepProgramFrames(-5); return;
    case 'step_next_5': stepProgramFrames(5); return;
    case 'insert_src': if (store.sessionState.sourceAssetId) insertSourceOrAssetToTimeline(store.sessionState.sourceAssetId, store.sessionState.playheadTime, { mode: 'insert', useSourceRange: true }); return;
    case 'overwrite_src': if (store.sessionState.sourceAssetId) insertSourceOrAssetToTimeline(store.sessionState.sourceAssetId, store.sessionState.playheadTime, { mode: 'overwrite', useSourceRange: true }); return;
    case 'mark_in':
      if (layoutManager.focusedPanelId === 'source-monitor' && store.sessionState.sourceAssetId) document.getElementById('src-btn-mark-in')?.click();
      else { getActiveSequence().inPoint = store.sessionState.playheadTime; renderTimeline(); }
      return;
    case 'mark_out':
      if (layoutManager.focusedPanelId === 'source-monitor' && store.sessionState.sourceAssetId) document.getElementById('src-btn-mark-out')?.click();
      else { getActiveSequence().outPoint = store.sessionState.playheadTime; renderTimeline(); }
      return;
    case 'goto_in': document.getElementById('src-btn-goto-in')?.click(); return;
    case 'goto_out': document.getElementById('src-btn-goto-out')?.click(); return;
    case 'tool_select': setTool('select'); return;
    case 'tool_track_select': setTool('track-select'); return;
    case 'tool_ripple': setTool('ripple'); return;
    case 'tool_rolling': setTool('rolling'); return;
    case 'tool_rate_stretch': setTool('rate-stretch'); return;
    case 'tool_razor': setTool('razor'); return;
    case 'tool_slip': setTool('slip'); return;
    case 'tool_slide': setTool('slide'); return;
    case 'tool_pen': setTool('pen'); return;
    case 'tool_hand': setTool('hand'); return;
    case 'tool_zoom': setTool('zoom'); return;
    case 'tool_text': setTool('text'); addTitleOverlayClip(); return;
    case 'snap_toggle': toggleSnapping(); return;
    case 'add_marker': addMarkerAtPlayhead(); return;
    case 'fit_sequence': fitTimelineToSequence(); return;
    case 'zoom_in': zoomTimeline(1.3); return;
    case 'zoom_out': zoomTimeline(1 / 1.3); return;
    // Workspace shortcuts
    case 'ws_edit': switchWorkspace('edit'); return;
    case 'ws_effects': switchWorkspace('effects'); return;
    case 'ws_color': switchWorkspace('color'); return;
    case 'ws_audio': switchWorkspace('audio'); return;
    case 'ws_graphics': switchWorkspace('graphics'); return;
    case 'ws_deliver': switchWorkspace('deliver'); return;
    case 'ws_media': switchWorkspace('media'); return;
    case 'ws_minimal': switchWorkspace('minimal'); return;
    case 'ws_dual': switchWorkspace('dual-viewer'); return;
    // Panel visibility / focus shortcuts
    case 'panel_project': layoutManager.focusOrOpenPanel('project'); return;
    case 'panel_source': layoutManager.focusOrOpenPanel('source-monitor'); return;
    case 'panel_timeline': layoutManager.focusOrOpenPanel('timeline'); return;
    case 'panel_program': layoutManager.focusOrOpenPanel('program-monitor'); return;
    case 'panel_fx_controls': layoutManager.focusOrOpenPanel('effect-controls'); return;
    case 'panel_audio_mixer': layoutManager.focusOrOpenPanel('audio-mixer'); return;
    case 'panel_effects': layoutManager.focusOrOpenPanel('effects-library'); return;
    case 'panel_properties': layoutManager.togglePanelVisibility('properties'); return;
  }
}

function initKeyboardEngine() {
  window.addEventListener('keydown', (e) => {
    if (store.runtimeState.rebindingShortcutId) {
      e.preventDefault();
      if (e.key === 'Escape') {
        store.runtimeState.rebindingShortcutId = null;
        renderShortcutsTable(document.getElementById('shortcut-search')?.value || '');
        return;
      }
      const combo = eventToKeyCombo(e);
      if (!combo) return;
      const targetId = store.runtimeState.rebindingShortcutId;
      const res = shortcutRegistry.assignShortcut(targetId, combo, { resolveConflicts: false });
      const banner = document.getElementById('shortcut-conflict-banner');
      if (res.conflicts.length > 0 && banner) {
        banner.style.display = 'flex';
        banner.innerHTML = `
          <span>Conflict: <strong>${combo}</strong> is also assigned to "${res.conflicts.map(c => c.name).join(', ')}".</span>
          <button class="action-btn-compact danger" id="btn-resolve-sc-conflict">Resolve (Unbind Other)</button>
        `;
        document.getElementById('btn-resolve-sc-conflict')?.addEventListener('click', () => {
          shortcutRegistry.resolveConflictFor(targetId);
          persistShortcuts();
          banner.style.display = 'none';
          renderVisualKeyboard();
          renderShortcutsTable(document.getElementById('shortcut-search')?.value || '');
        });
      } else if (banner) {
        banner.style.display = 'none';
      }
      store.runtimeState.rebindingShortcutId = null;
      persistShortcuts();
      renderVisualKeyboard();
      renderShortcutsTable(document.getElementById('shortcut-search')?.value || '');
      return;
    }

    // Backspace fallback for delete when not in an editable field
    if (e.code === 'Backspace' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName) && !e.target?.isContentEditable) {
      deleteActiveClip();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName)) {
      e.preventDefault();
      redo();
      return;
    }

    const matched = shortcutRegistry.matchEvent(e);
    if (!matched) return;
    e.preventDefault();
    executeShortcutCommand(matched.id);
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
  renderEffectsLibrary();
  renderColorClipsGallery();
  renderAudioConsole();
  renderDeliverSettings();
  renderDeliverQueue();
  renderHistoryPanel();
  renderMarkersPanel();
  renderAllSpecialistPanels(getPanelViewContext());
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

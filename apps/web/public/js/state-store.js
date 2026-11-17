/**
 * FRAMEFLOW 4-Layer Persistent State Architecture
 * Strictly separates:
 *  1. projectState   -> IndexedDB 'projects' (assets metadata, sequences, tracks, clips, effects, audio routing)
 *  2. sessionState   -> IndexedDB 'session'  (active sequence, selected clip IDs, playhead, tool, source In/Out, zoom/scroll)
 *  3. workspaceState -> IndexedDB 'workspaces' (versioned layout schema, split ratios, visible panels, normalized floating bounds)
 *  4. runtimeState   -> In-memory ONLY (HTMLVideoElement decoders, blob URLs, GPU capabilities, AudioContext, export workers)
 * Plus IndexedDB 'media_blobs' for automatic local file rehydration across browser refreshes (with Missing Media & Relink fallback).
 */

export const DB_NAME = 'frameflow_studio_db';
export const DB_VERSION = 2;
export const WORKSPACE_SCHEMA_VERSION = 1;

export function createDefaultProjectState() {
  return {
    schemaVersion: 2,
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
        inPoint: null,
        outPoint: null,
        markers: [],
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
  };
}

export function createDefaultSessionState() {
  return {
    id: 'session_active',
    activeSequenceId: 'seq_master',
    selectedClipIds: [],
    selectedTrackId: 'track_a1',
    playheadTime: 0,
    activeTool: 'select',
    sourceAssetId: null,
    sourcePlaybackPosition: 0,
    sourceInPoint: 0,
    sourceOutPoint: 0,
    sourcePlaybackResolution: '1/2',
    sourceFitMode: 'fit',
    sourceAudioChannel: 'stereo', // 'stereo' | 'left' | 'right' | 'mute'
    monitorMode: 'single',        // 'single' | 'split'
    activeMonitorTab: 'program',  // 'source' | 'program'
    programLoop: false,
    programSafeMargins: false,
    programOverlays: false,
    programCompareMode: false,
    programFitMode: 'fit',
    programPlaybackResolution: '1/2',
    timelineZoom: 28,             // pixelsPerSecond
    timelineScrollLeft: 0,
    isSnapping: true,
    isLinkedSelection: true,
    isSyncLockGlobal: true,
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
  };
}

export function createDefaultWorkspaceLayout(wsId) {
  const defaults = {
    media: {
      id: 'media',
      topSplit: { leftPct: 48, rightPct: 20 },
      bottomHeightPct: 0,
      visiblePanels: ['panel-project', 'monitors-pane', 'panel-inspector'],
      floatingPanels: {},
    },
    edit: {
      id: 'edit',
      topSplit: { leftPct: 19, rightPct: 22 },
      bottomHeightPct: 35,
      visiblePanels: ['panel-project', 'monitors-pane', 'panel-inspector', 'panel-timeline'],
      floatingPanels: {},
    },
    motion: {
      id: 'motion',
      topSplit: { leftPct: 20, rightPct: 24 },
      bottomHeightPct: 38,
      visiblePanels: ['panel-effects', 'monitors-pane', 'panel-inspector', 'panel-timeline'],
      floatingPanels: {},
    },
    color: {
      id: 'color',
      topSplit: { leftPct: 18, rightPct: 27 },
      bottomHeightPct: 30,
      visiblePanels: ['panel-color-clips', 'monitors-pane', 'panel-inspector', 'panel-color-wheels'],
      floatingPanels: {},
    },
    audio: {
      id: 'audio',
      topSplit: { leftPct: 0, rightPct: 0 },
      bottomHeightPct: 54,
      visiblePanels: ['panel-timeline', 'panel-audio-console'],
      floatingPanels: {},
    },
    deliver: {
      id: 'deliver',
      topSplit: { leftPct: 0, rightPct: 48 },
      bottomHeightPct: 32,
      visiblePanels: ['monitors-pane', 'panel-deliver-settings', 'panel-deliver-queue'],
      floatingPanels: {},
    },
  };
  return structuredClone(defaults[wsId] || defaults.edit);
}

export function createDefaultWorkspaceState() {
  return {
    id: 'workspace_active',
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    activeWorkspace: 'edit',
    layouts: {
      media:   createDefaultWorkspaceLayout('media'),
      edit:    createDefaultWorkspaceLayout('edit'),
      motion:  createDefaultWorkspaceLayout('motion'),
      color:   createDefaultWorkspaceLayout('color'),
      audio:   createDefaultWorkspaceLayout('audio'),
      deliver: createDefaultWorkspaceLayout('deliver'),
    },
    customWorkspaces: [],
  };
}

export function validateWorkspaceState(raw) {
  if (!raw || typeof raw !== 'object' || raw.schemaVersion !== WORKSPACE_SCHEMA_VERSION || !raw.layouts) {
    return createDefaultWorkspaceState();
  }
  const clean = createDefaultWorkspaceState();
  const validIds = ['media', 'edit', 'motion', 'color', 'audio', 'deliver'];
  clean.activeWorkspace = validIds.includes(raw.activeWorkspace) ? raw.activeWorkspace : 'edit';

  for (const id of validIds) {
    const saved = raw.layouts[id];
    if (saved && saved.topSplit && Array.isArray(saved.visiblePanels)) {
      const leftPct = Number(saved.topSplit.leftPct);
      const rightPct = Number(saved.topSplit.rightPct);
      const bottomPct = Number(saved.bottomHeightPct);
      clean.layouts[id] = {
        id,
        topSplit: {
          leftPct:  Number.isFinite(leftPct)  ? Math.max(0, Math.min(60, leftPct))  : clean.layouts[id].topSplit.leftPct,
          rightPct: Number.isFinite(rightPct) ? Math.max(0, Math.min(60, rightPct)) : clean.layouts[id].topSplit.rightPct,
        },
        bottomHeightPct: Number.isFinite(bottomPct) ? Math.max(0, Math.min(65, bottomPct)) : clean.layouts[id].bottomHeightPct,
        visiblePanels: saved.visiblePanels.filter(p => typeof p === 'string'),
        floatingPanels: (saved.floatingPanels && typeof saved.floatingPanels === 'object') ? saved.floatingPanels : {},
      };
    }
  }

  if (Array.isArray(raw.customWorkspaces)) {
    clean.customWorkspaces = raw.customWorkspaces;
  }
  return clean;
}

export class FrameflowStateStore {
  constructor() {
    this.db = null;
    this.projectState = createDefaultProjectState();
    this.sessionState = createDefaultSessionState();
    this.workspaceState = createDefaultWorkspaceState();
    this.runtimeState = {
      decoders: new Map(), // assetId -> { videoEl, blobUrl, ready, missing }
      gpuCapabilities: null,
      codecCapabilities: null,
      isPlayingSequence: false,
      isPlayingSource: false,
      playbackSpeed: 1,
      measuredFps: 0,
      droppedFrames: 0,
      clipboardClip: null,
      rebindingShortcutId: null,
    };
    this.saveTimer = null;
    this.onSaveStatus = () => {};
  }

  async openDB() {
    if (typeof indexedDB === 'undefined') return false;
    this.db = await new Promise((resolve) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('projects'))    db.createObjectStore('projects', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('session'))     db.createObjectStore('session', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('workspaces'))  db.createObjectStore('workspaces', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('media_blobs')) db.createObjectStore('media_blobs', { keyPath: 'id' });
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = () => resolve(null);
    });
    return !!this.db;
  }

  async _get(storeName, key) {
    if (!this.db) return null;
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch { resolve(null); }
    });
  }

  async _put(storeName, value) {
    if (!this.db) return false;
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(storeName, 'readwrite');
        const req = tx.objectStore(storeName).put(value);
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      } catch { resolve(false); }
    });
  }

  async saveMediaBlob(assetId, fileOrBlob) {
    if (!this.db || !fileOrBlob) return false;
    return this._put('media_blobs', { id: assetId, blob: fileOrBlob, savedAt: Date.now() });
  }

  async loadMediaBlob(assetId) {
    const rec = await this._get('media_blobs', assetId);
    return rec ? rec.blob : null;
  }

  async restoreAll() {
    const ok = await this.openDB();
    if (!ok) return false;

    const savedProj = await this._get('projects', 'proj_default');
    if (savedProj && savedProj.sequences) {
      // Strip any stale blobUrl fields from older versions; decoders are strictly runtime
      for (const a of Object.values(savedProj.assets || {})) {
        delete a.blobUrl;
      }
      for (const seq of Object.values(savedProj.sequences)) {
        if (!seq.markers) seq.markers = [];
        for (const tr of seq.tracks) {
          if (!tr.shortName) tr.shortName = tr.name.split(' ')[0];
          if (!tr.color) tr.color = tr.type === 'video' ? '#4B8DFF' : '#38C995';
          if (tr.syncLock === undefined) tr.syncLock = true;
          if (tr.type === 'audio' && !tr.busId) tr.busId = 'dialogue';
        }
      }
      this.projectState = savedProj;
    }

    const savedSession = await this._get('session', 'session_active');
    if (savedSession) {
      this.sessionState = { ...createDefaultSessionState(), ...savedSession };
      this.sessionState.timelineDisplay = {
        ...createDefaultSessionState().timelineDisplay,
        ...(savedSession.timelineDisplay || {}),
      };
    }

    const savedWs = await this._get('workspaces', 'workspace_active');
    if (savedWs) {
      this.workspaceState = validateWorkspaceState(savedWs);
    }

    // Validate restored clip selection IDs against actual sequence clips!
    this.sanitizeSelection();
    return true;
  }

  sanitizeSelection() {
    const seq = this.projectState.sequences[this.sessionState.activeSequenceId]
      || this.projectState.sequences[this.projectState.activeSequenceId]
      || Object.values(this.projectState.sequences)[0];
    if (!seq) return;
    this.sessionState.activeSequenceId = seq.id;
    this.projectState.activeSequenceId = seq.id;

    const validClipIds = new Set(seq.clips.map(c => c.id));
    this.sessionState.selectedClipIds = (this.sessionState.selectedClipIds || []).filter(id => validClipIds.has(id));

    if (this.sessionState.sourceAssetId && !this.projectState.assets[this.sessionState.sourceAssetId]) {
      this.sessionState.sourceAssetId = null;
    }
  }

  scheduleSave(delayMs = 350) {
    this.onSaveStatus('saving');
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flushNow(), delayMs);
  }

  async flushNow() {
    clearTimeout(this.saveTimer);
    if (!this.db) return;
    this.projectState.modifiedAt = Date.now();
    // Persist ONLY serializable state layers — NEVER runtimeState!
    await Promise.all([
      this._put('projects', this.projectState),
      this._put('session', this.sessionState),
      this._put('workspaces', this.workspaceState),
    ]);
    this.onSaveStatus('saved');
  }
}

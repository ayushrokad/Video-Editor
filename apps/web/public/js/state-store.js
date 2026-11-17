/**
 * FRAMEFLOW Separated-Domain Persistent State & Storage Engine (v3)
 *
 * Three clear storage categories across 6 logical IndexedDB domains (+ protected fallback):
 *  1. Project Storage (Persistent):
 *     - 'projects'    -> Project metadata, settings, bins, activeSequenceId
 *     - 'timeline'    -> Sequences, tracks, clips, transitions, markers, keyframes
 *     - 'media'       -> Asset metadata, fingerprints, File System Access API handles
 *     - 'history'     -> Bounded crash-recovery snapshots (max 5, content-deduplicated)
 *     - 'media_blobs' -> Protected user media fallback blobs (deduplicated, never written on refresh)
 *  2. Media Cache (Regenerable):
 *     - 'cache'       -> Thumbnails, waveforms, previews (keyed by asset:kind:version, LRU evicted)
 *  3. Workspace Preferences (Lightweight):
 *     - 'workspaces'  -> Dock tree layouts, custom workspaces, button order
 *     - 'session'     -> Active sequence, selection, playhead, tool, zoom/scroll
 *
 * Core Invariants:
 *  - Idempotent DB open & migration (never opens twice or migrates unnecessarily)
 *  - Dirty-state + content-fingerprint change detection per domain
 *  - Zero writes on fresh load, refresh without changes, or repeated saves of unchanged projects
 *  - Atomic multi-store transactions for related project updates
 *  - Workspace switches write ONLY 'workspaces' (never touch project/timeline/media)
 */

import {
  BUILTIN_WORKSPACES,
  DEFAULT_WORKSPACE_ORDER,
  createStructuredWorkspaceLayout,
  sanitizeWorkspaceLayout,
} from './panel-manager.js';
import {
  StorageDiagnosticsTracker,
  computeStableFingerprint,
  estimateRecordBytes,
  verifyProjectIntegrity,
} from './storage-diagnostics.js';
import { ProjectAutosaveManager, AUTOSAVE_DEBOUNCE_MS } from './autosave-manager.js';

export const DB_NAME = 'frameflow_studio_db';
export const DB_VERSION = 3;
export const WORKSPACE_SCHEMA_VERSION = 2;
export const MAX_RECOVERY_SNAPSHOTS = 5;
export const MAX_CACHE_BYTES = 50 * 1024 * 1024; // 50 MB LRU budget for regenerable cache
const WORKSPACE_LS_KEY = 'frameflow_workspace_state_v2';

export const ALL_OBJECT_STORES = [
  'projects',
  'timeline',
  'media',
  'workspaces',
  'session',
  'history',
  'cache',
  'media_blobs',
];

export function createDefaultProjectState(projectId = 'proj_default') {
  return {
    schemaVersion: 3,
    id: projectId,
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
    activeProjectId: 'proj_default',
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
    sourceAudioChannel: 'stereo',
    monitorMode: 'single',
    activeMonitorTab: 'program',
    programLoop: false,
    programSafeMargins: false,
    programOverlays: false,
    programCompareMode: false,
    programFitMode: 'fit',
    programPlaybackResolution: '1/2',
    timelineZoom: 28,
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
  return createStructuredWorkspaceLayout(wsId === 'motion' ? 'effects' : wsId);
}

export function createDefaultWorkspaceState() {
  const layouts = {};
  for (const ws of BUILTIN_WORKSPACES) {
    layouts[ws.id] = createStructuredWorkspaceLayout(ws.id);
  }
  return {
    id: 'workspace_active',
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    activeWorkspace: 'edit',
    workspaceOrder: [...DEFAULT_WORKSPACE_ORDER],
    layouts,
    customWorkspaces: [],
  };
}

export function validateWorkspaceState(raw) {
  if (!raw || typeof raw !== 'object' || !raw.layouts || typeof raw.layouts !== 'object') {
    return createDefaultWorkspaceState();
  }
  if (raw.schemaVersion !== WORKSPACE_SCHEMA_VERSION && raw.schemaVersion !== 1) {
    return createDefaultWorkspaceState();
  }

  const clean = createDefaultWorkspaceState();
  const builtinIds = BUILTIN_WORKSPACES.map(w => w.id);

  const cleanCustom = [];
  if (Array.isArray(raw.customWorkspaces)) {
    for (const cw of raw.customWorkspaces) {
      if (!cw || typeof cw !== 'object' || typeof cw.id !== 'string' || !cw.id || typeof cw.name !== 'string') continue;
      const base = builtinIds.includes(cw.baseWorkspace) ? cw.baseWorkspace : 'edit';
      const sanitizedLayout = cw.layout?.root
        ? sanitizeWorkspaceLayout(cw.layout, base)
        : createStructuredWorkspaceLayout(base);
      sanitizedLayout.id = cw.id;
      cleanCustom.push({
        id: cw.id,
        name: cw.name.trim() || 'Custom Workspace',
        baseWorkspace: base,
        layout: sanitizedLayout,
      });
    }
  }
  clean.customWorkspaces = cleanCustom;

  for (const id of builtinIds) {
    const saved = raw.layouts[id];
    if (saved && typeof saved === 'object' && saved.root) {
      clean.layouts[id] = sanitizeWorkspaceLayout(saved, id);
    }
  }

  const requestedActive = raw.activeWorkspace === 'motion' ? 'effects' : raw.activeWorkspace;
  const customIds = cleanCustom.map(c => c.id);
  const allValidIds = [...builtinIds, ...customIds];
  clean.activeWorkspace = allValidIds.includes(requestedActive) ? requestedActive : 'edit';

  if (Array.isArray(raw.workspaceOrder)) {
    const ordered = raw.workspaceOrder.filter(id => allValidIds.includes(id));
    for (const id of builtinIds) {
      if (!ordered.includes(id)) ordered.push(id);
    }
    clean.workspaceOrder = [...new Set(ordered)];
  }

  return clean;
}

export function buildFileFingerprint(fileOrMeta) {
  if (!fileOrMeta) return '';
  const name = String(fileOrMeta.name || '');
  const size = Number(fileOrMeta.size || 0);
  const lastMod = Number(fileOrMeta.lastModified || 0);
  return `${name}|${size}|${lastMod}`;
}

export class FrameflowStateStore {
  constructor({ indexedDBImpl = null, autosaveDebounceMs = AUTOSAVE_DEBOUNCE_MS } = {}) {
    this._idb = indexedDBImpl || (typeof indexedDB !== 'undefined' ? indexedDB : null);
    this.db = null;
    this._openPromise = null;
    this.isHydrating = false;

    this.projectState = createDefaultProjectState();
    this.sessionState = createDefaultSessionState();
    this.workspaceState = createDefaultWorkspaceState();
    this.runtimeState = {
      decoders: new Map(), // assetId -> { videoEl, blobUrl, ready, missing, fileHandle? }
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

    this.diagnostics = new StorageDiagnosticsTracker();
    this.lastSavedAt = null;
    this.saveTimer = null;
    this._wsSaveTimer = null;
    this.onSaveStatus = () => {};
    this.onProjectStatusChange = () => {};

    // Per-domain change tracking & content fingerprints (prevents unchanged writes!)
    this._dirtyDomains = new Set();
    this._persistedKeys = new Set(); // "store:key" for insert vs update diagnostics
    this._lastFingerprints = {
      projects: null,
      timeline: null,
      media: null,
      session: null,
      workspaces: null,
      recovery: null,
    };
    this._captureBaselineFingerprints();

    // Dedicated Project Document Autosave Manager (completely isolated from workspaces & UI state!)
    this.autosave = new ProjectAutosaveManager({
      debounceMs: autosaveDebounceMs,
      getDocumentFingerprint: () => this.getProjectDocumentFingerprint(),
      persistDocument: ({ revision, reason, manual }) => this._persistProjectDocument({ revision, reason, manual }),
      onStatusChange: (diag) => {
        this.lastSavedAt = diag.lastSavedAt;
        this.onProjectStatusChange(diag);
        this.onSaveStatus(diag.status, diag);
      },
    });
  }

  getProjectDocumentFingerprint() {
    return computeStableFingerprint({
      project: this._buildProjectRecord(),
      timeline: this._buildTimelineRecord(),
      media: this._buildMediaRecordsMap(),
    });
  }

  // ---------------- Domain Extractors (No Duplication!) ----------------

  _buildProjectRecord() {
    const p = this.projectState;
    return {
      id: p.id || 'proj_default',
      schemaVersion: 3,
      title: p.title,
      createdAt: p.createdAt,
      modifiedAt: p.modifiedAt,
      activeSequenceId: p.activeSequenceId,
      bins: p.bins,
    };
  }

  _buildTimelineRecord() {
    const pid = this.projectState.id || 'proj_default';
    return {
      id: `tl_${pid}`,
      projectId: pid,
      sequences: this.projectState.sequences,
    };
  }

  _buildMediaRecordsMap() {
    const pid = this.projectState.id || 'proj_default';
    const clean = {};
    for (const [id, asset] of Object.entries(this.projectState.assets || {})) {
      const { blobUrl, ...serializable } = asset;
      clean[id] = { ...serializable, id, projectId: pid };
    }
    return clean;
  }

  _captureBaselineFingerprints() {
    this._lastFingerprints.projects = computeStableFingerprint(this._buildProjectRecord());
    this._lastFingerprints.timeline = computeStableFingerprint(this._buildTimelineRecord());
    this._lastFingerprints.media = computeStableFingerprint(this._buildMediaRecordsMap());
    this._lastFingerprints.session = computeStableFingerprint(this.sessionState);
    this._lastFingerprints.workspaces = computeStableFingerprint(this.workspaceState);
    this._lastFingerprints.recovery = computeStableFingerprint({
      project: this._buildProjectRecord(),
      timeline: this._buildTimelineRecord(),
      media: this._buildMediaRecordsMap(),
    });
    this._dirtyDomains.clear();
  }

  isDirty(domain = null) {
    if (domain) return this._isDomainChanged(domain);
    return ['projects', 'timeline', 'media', 'session', 'workspaces'].some(d => this._isDomainChanged(d));
  }

  _getCurrentFingerprint(domain) {
    if (domain === 'projects') return computeStableFingerprint(this._buildProjectRecord());
    if (domain === 'timeline') return computeStableFingerprint(this._buildTimelineRecord());
    if (domain === 'media') return computeStableFingerprint(this._buildMediaRecordsMap());
    if (domain === 'session') return computeStableFingerprint(this.sessionState);
    if (domain === 'workspaces') return computeStableFingerprint(this.workspaceState);
    return '';
  }

  _isDomainChanged(domain) {
    return this._getCurrentFingerprint(domain) !== this._lastFingerprints[domain];
  }

  markDirty(domains, reason = 'edit') {
    if (this.isHydrating) return;
    const list = Array.isArray(domains) ? domains : [domains];
    for (const d of list) {
      if (d) this._dirtyDomains.add(d);
    }
    this._lastDirtyReason = reason;
  }

  // ---------------- Idempotent IndexedDB Initialization ----------------

  async openDB() {
    if (this.db) return true;
    if (!this._idb) return false;
    if (this._openPromise) return this._openPromise;

    this._openPromise = new Promise((resolve) => {
      let migrated = false;
      const req = this._idb.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        migrated = true;
        const db = e.target.result;
        for (const storeName of ALL_OBJECT_STORES) {
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName, { keyPath: 'id' });
          }
        }
      };

      req.onsuccess = (e) => {
        this.db = e.target.result;
        this.diagnostics.recordDbOpen({ migrated });
        resolve(true);
      };

      req.onerror = () => {
        this._openPromise = null;
        resolve(false);
      };
    });

    return this._openPromise;
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

  async _getAll(storeName) {
    if (!this.db) return [];
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).getAll();
        req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
        req.onerror = () => resolve([]);
      } catch { resolve([]); }
    });
  }

  async _put(storeName, value, reason = 'write') {
    if (!this.db || !value) return false;
    const key = value.id;
    const cacheKey = `${storeName}:${key}`;
    const existed = this._persistedKeys.has(cacheKey);
    const approxBytes = estimateRecordBytes(value);

    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(storeName, 'readwrite');
        const req = tx.objectStore(storeName).put(value);
        req.onsuccess = () => {
          this._persistedKeys.add(cacheKey);
          this.diagnostics.recordWrite({
            dbName: DB_NAME,
            storeName,
            key,
            action: existed ? 'update' : 'insert',
            approxBytes,
            reason,
          });
          resolve(true);
        };
        req.onerror = () => resolve(false);
      } catch { resolve(false); }
    });
  }

  async _delete(storeName, key, reason = 'delete') {
    if (!this.db) return false;
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(storeName, 'readwrite');
        const req = tx.objectStore(storeName).delete(key);
        req.onsuccess = () => {
          this._persistedKeys.delete(`${storeName}:${key}`);
          this.diagnostics.recordWrite({ dbName: DB_NAME, storeName, key, action: 'delete', approxBytes: 0, reason });
          resolve(true);
        };
        req.onerror = () => resolve(false);
      } catch { resolve(false); }
    });
  }

  // ---------------- Media Storage Policy (Phase 5) ----------------

  /**
   * Stores media reference metadata in 'media' and (only when no FileSystemFileHandle is used
   * and no duplicate fingerprint exists) stores the fallback binary blob in 'media_blobs'.
   * Never copies media on refresh.
   */
  async saveMediaAsset(asset, { fileOrBlob = null, fileHandle = null } = {}) {
    if (!this.db || !asset) return { stored: false, mode: 'memory' };

    const fp = asset.fingerprint || buildFileFingerprint(fileOrBlob || asset);
    asset.fingerprint = fp;
    asset.projectId = this.projectState.id || 'proj_default';

    // Prefer lightweight FileSystemFileHandle when supported — zero multi-MB binary duplication!
    if (fileHandle) {
      asset.storageMode = 'handle';
      await this._put('media', { ...asset, fileHandle }, 'media-handle-import');
      this._lastFingerprints.media = computeStableFingerprint(this._buildMediaRecordsMap());
      return { stored: true, mode: 'handle', deduplicated: false };
    }

    // Deduplicate against existing blobs by content fingerprint
    if (fileOrBlob) {
      const existingBlobs = await this._getAll('media_blobs');
      const dup = fp ? existingBlobs.find(b => b.fingerprint && b.fingerprint === fp) : null;
      if (dup) {
        asset.storageMode = 'blob-ref';
        asset.blobRefId = dup.id;
        await this._put('media', { ...asset }, 'media-ref-dedup');
        this._lastFingerprints.media = computeStableFingerprint(this._buildMediaRecordsMap());
        return { stored: true, mode: 'blob-ref', deduplicated: true, blobRefId: dup.id };
      }

      asset.storageMode = 'blob-ref';
      asset.blobRefId = asset.id;
      await this._put('media_blobs', {
        id: asset.id,
        fingerprint: fp,
        name: asset.name,
        size: fileOrBlob.size || asset.size || 0,
        type: fileOrBlob.type || asset.type || '',
        blob: fileOrBlob,
        savedAt: Date.now(),
      }, 'media-blob-import');
      await this._put('media', { ...asset }, 'media-metadata-import');
      this._lastFingerprints.media = computeStableFingerprint(this._buildMediaRecordsMap());
      return { stored: true, mode: 'blob-ref', deduplicated: false, blobRefId: asset.id };
    }

    await this._put('media', { ...asset }, 'media-metadata');
    return { stored: true, mode: asset.storageMode || 'metadata' };
  }

  // Backward-compatible wrapper used by existing callers
  async saveMediaBlob(assetId, fileOrBlob) {
    if (!this.db || !fileOrBlob) return false;
    const asset = this.projectState.assets[assetId] || { id: assetId, name: fileOrBlob.name || assetId, size: fileOrBlob.size || 0, type: fileOrBlob.type || '' };
    const res = await this.saveMediaAsset(asset, { fileOrBlob });
    return res.stored;
  }

  async loadMediaBlob(assetId) {
    const asset = this.projectState.assets[assetId];
    // 1. Try File System Access API handle first (gracefully handles permission loss)
    const mediaRec = await this._get('media', assetId);
    if (mediaRec?.fileHandle && typeof mediaRec.fileHandle.getFile === 'function') {
      try {
        if (typeof mediaRec.fileHandle.queryPermission === 'function') {
          const perm = await mediaRec.fileHandle.queryPermission({ mode: 'read' });
          if (perm !== 'granted') return null; // Triggers clean Relink / Grant Permission flow
        }
        return await mediaRec.fileHandle.getFile();
      } catch {
        return null;
      }
    }

    // 2. Fallback to deduplicated blob reference in media_blobs
    const blobKey = asset?.blobRefId || mediaRec?.blobRefId || assetId;
    const rec = await this._get('media_blobs', blobKey);
    return rec ? rec.blob : null;
  }

  // ---------------- Regenerable Cache Policy (Thumbnails / Waveforms) ----------------

  async putCacheEntry({ assetId, kind, version = 1, data }) {
    if (!this.db || !assetId || !kind) return false;
    const id = `${assetId}:${kind}:v${version}`;
    const existing = await this._get('cache', id);
    const approxBytes = estimateRecordBytes(data);

    // Skip duplicate identical cache writes
    if (existing && existing.approxBytes === approxBytes && existing.version === version) {
      this.diagnostics.recordWrite({ dbName: DB_NAME, storeName: 'cache', key: id, action: 'skip-unchanged', approxBytes: 0, reason: `cache-${kind}` });
      return true;
    }

    await this._put('cache', {
      id,
      assetId,
      kind, // 'thumbnail' | 'waveform' | 'preview'
      version,
      data,
      approxBytes,
      lastAccessedAt: Date.now(),
    }, `cache-${kind}`);

    await this.evictCacheIfNeeded(MAX_CACHE_BYTES);
    return true;
  }

  async getCacheEntry(assetId, kind, version = 1) {
    const id = `${assetId}:${kind}:v${version}`;
    return this._get('cache', id);
  }

  async evictCacheIfNeeded(maxBytes = MAX_CACHE_BYTES) {
    if (!this.db) return 0;
    const entries = await this._getAll('cache');
    let total = entries.reduce((sum, e) => sum + (e.approxBytes || estimateRecordBytes(e)), 0);
    if (total <= maxBytes) return 0;

    entries.sort((a, b) => (a.lastAccessedAt || 0) - (b.lastAccessedAt || 0));
    let removed = 0;
    for (const entry of entries) {
      if (total <= maxBytes) break;
      await this._delete('cache', entry.id, 'cache-lru-eviction');
      total -= (entry.approxBytes || estimateRecordBytes(entry));
      removed++;
    }
    return removed;
  }

  async clearRegenerableCache() {
    if (!this.db) return 0;
    const entries = await this._getAll('cache');
    for (const entry of entries) {
      await this._delete('cache', entry.id, 'user-clear-cache');
    }
    return entries.length;
  }

  // ---------------- Recovery Snapshots (Bounded Retention & Dedup) ----------------

  async saveRecoverySnapshot(reason = 'autosave-recovery') {
    if (!this.db) return { saved: false, skipped: true };

    const payload = {
      project: this._buildProjectRecord(),
      timeline: this._buildTimelineRecord(),
      media: this._buildMediaRecordsMap(),
    };
    const fp = computeStableFingerprint(payload);
    if (fp === this._lastFingerprints.recovery) {
      this.diagnostics.recordWrite({ dbName: DB_NAME, storeName: 'history', key: 'recovery', action: 'skip-unchanged', approxBytes: 0, reason });
      return { saved: false, skipped: true };
    }

    const snapId = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    const snapshot = {
      id: snapId,
      type: 'recovery',
      projectId: payload.project.id,
      fingerprint: fp,
      createdAt: Date.now(),
      reason,
      project: payload.project,
      timeline: payload.timeline,
      media: payload.media,
    };

    await this._put('history', snapshot, reason);
    this._lastFingerprints.recovery = fp;

    // Enforce strict retention limit (never accumulate unbounded snapshots!)
    await this.removeOldRecoverySnapshots(MAX_RECOVERY_SNAPSHOTS);
    return { saved: true, skipped: false, id: snapId };
  }

  async listRecoverySnapshots() {
    if (!this.db) return [];
    const all = await this._getAll('history');
    return all
      .filter(r => r && r.type === 'recovery')
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  async removeOldRecoverySnapshots(keepCount = 1) {
    if (!this.db) return 0;
    const snaps = await this.listRecoverySnapshots();
    if (snaps.length <= keepCount) return 0;
    const toRemove = snaps.slice(Math.max(0, keepCount));
    for (const s of toRemove) {
      await this._delete('history', s.id, 'recovery-retention-prune');
    }
    return toRemove.length;
  }

  async restoreFromLatestRecovery() {
    this.autosave.setRecovering(true);
    try {
      const snaps = await this.listRecoverySnapshots();
      if (snaps.length === 0) {
        this.autosave.setRecovering(false);
        return false;
      }
      const latest = snaps[0];
      this.projectState = {
        ...createDefaultProjectState(latest.project?.id || 'proj_default'),
        ...(latest.project || {}),
        sequences: latest.timeline?.sequences || createDefaultProjectState().sequences,
        assets: latest.media || {},
      };
      this._normalizeLoadedProject(this.projectState);
      this.sanitizeSelection();
      this._captureBaselineFingerprints();
      this.autosave.resetBaseline({
        savedAt: latest.createdAt || Date.now(),
        revision: Number(latest.project?.revision || 0),
      });
      return true;
    } catch {
      this.autosave.setRecovering(false);
      return false;
    }
  }

  // ---------------- Restore All (Zero Writes During Hydration!) ----------------

  _normalizeLoadedProject(proj) {
    for (const a of Object.values(proj.assets || {})) {
      delete a.blobUrl;
    }
    for (const seq of Object.values(proj.sequences || {})) {
      if (!seq.markers) seq.markers = [];
      for (const tr of (seq.tracks || [])) {
        if (!tr.shortName) tr.shortName = tr.name.split(' ')[0];
        if (!tr.color) tr.color = tr.type === 'video' ? '#4B8DFF' : '#38C995';
        if (tr.syncLock === undefined) tr.syncLock = true;
        if (tr.type === 'audio' && !tr.busId) tr.busId = 'dialogue';
      }
    }
  }

  async restoreAll() {
    this.isHydrating = true;
    try {
      const ok = await this.openDB();

      if (ok) {
        // Load session first to discover activeProjectId
        const savedSession = await this._get('session', 'session_active');
        if (savedSession) {
          this._persistedKeys.add('session:session_active');
          this.sessionState = { ...createDefaultSessionState(), ...savedSession };
          this.sessionState.timelineDisplay = {
            ...createDefaultSessionState().timelineDisplay,
            ...(savedSession.timelineDisplay || {}),
          };
        }

        const activeProjId = this.sessionState.activeProjectId || 'proj_default';
        const savedProj = await this._get('projects', activeProjId);
        const savedTl = await this._get('timeline', `tl_${activeProjId}`);
        const allMedia = await this._getAll('media');
        const matchingMedia = allMedia.filter(m => !m.projectId || m.projectId === activeProjId);

        if (savedProj || savedTl || matchingMedia.length > 0) {
          if (savedProj) this._persistedKeys.add(`projects:${savedProj.id}`);
          const assetsMap = {};
          for (const m of matchingMedia) {
            const { fileHandle, ...meta } = m;
            assetsMap[m.id] = meta;
            this._persistedKeys.add(`media:${m.id}`);
          }
          // Legacy v2 fallback if assets/sequences were previously nested in projects record
          const mergedAssets = Object.keys(assetsMap).length > 0 ? assetsMap : (savedProj?.assets || {});
          const mergedSequences = savedTl?.sequences || savedProj?.sequences || createDefaultProjectState(activeProjId).sequences;
          if (savedTl) this._persistedKeys.add(`timeline:${savedTl.id}`);

          this.projectState = {
            ...createDefaultProjectState(activeProjId),
            ...(savedProj || {}),
            assets: mergedAssets,
            sequences: mergedSequences,
          };
          this._normalizeLoadedProject(this.projectState);
        }

        const savedWs = await this._get('workspaces', 'workspace_active');
        if (savedWs) {
          this._persistedKeys.add('workspaces:workspace_active');
          this.workspaceState = validateWorkspaceState(savedWs);
        }

        // Capture initial baseline snapshot for diagnostics (read-only!)
        const initialSnap = await this.inspectStorage();
        this.diagnostics.setBaseline(initialSnap);
      }

      // Fallback to localStorage mirror if IndexedDB had no v2 workspace yet
      if (typeof localStorage !== 'undefined') {
        try {
          const rawLs = localStorage.getItem(WORKSPACE_LS_KEY);
          if (rawLs && !this._persistedKeys.has('workspaces:workspace_active')) {
            this.workspaceState = validateWorkspaceState(JSON.parse(rawLs));
          }
        } catch {}
      }

      this.sanitizeSelection();
      // CRITICAL: Seed baseline fingerprints & reset autosave baseline AFTER hydration (0 writes!)
      this._captureBaselineFingerprints();
      const hasExistingProject = this._persistedKeys.has(`projects:${this.projectState.id}`);
      this.autosave.resetBaseline({
        savedAt: hasExistingProject ? (this.projectState.modifiedAt || null) : null,
        revision: Number(this.projectState.revision || 0),
      });
      return ok;
    } finally {
      this.isHydrating = false;
    }
  }

  sanitizeSelection() {
    const seq = this.projectState.sequences[this.sessionState.activeSequenceId]
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

  // ---------------- Separated Project vs. Workspace Save Pipelines (Phases 1–7) ----------------

  /**
   * Marks the Project Document dirty (ONLY for real persistent document edits).
   * Debounces autosave by 1.5s and updates the Project Save Status badge.
   */
  markProjectDirty(reason = 'edit', { scheduleAutosave = true } = {}) {
    if (this.isHydrating) return { changed: false, revision: this.autosave.currentRevision };
    return this.autosave.markProjectModified(reason, { scheduleAutosave });
  }

  /**
   * Explicit manual save (Ctrl+S / Cmd+S / File > Save) or immediate project flush.
   */
  async saveProjectNow({ reason = 'manual-save', manual = true } = {}) {
    if (this.isHydrating) return { saved: false, skipped: true };
    return this.autosave.saveNow({ reason, manual });
  }

  async retryProjectSave() {
    return this.autosave.retrySave();
  }

  /**
   * Independent Workspace Preferences save pipeline.
   * NEVER touches Project Document revision, Project dirty state, or Project Save Status!
   */
  scheduleWorkspaceSave(reason = 'workspace-pref', delayMs = 400) {
    if (this.isHydrating) return;
    if (!this._isDomainChanged('workspaces')) return;
    clearTimeout(this._wsSaveTimer);
    this._wsSaveTimer = setTimeout(() => {
      this._wsSaveTimer = null;
      this.flushWorkspaceNow(reason);
    }, delayMs);
  }

  async flushWorkspaceNow(reason = 'workspace-pref') {
    clearTimeout(this._wsSaveTimer);
    this._wsSaveTimer = null;
    if (this.isHydrating) return { saved: false, skipped: true };

    const currFp = this._getCurrentFingerprint('workspaces');
    if (currFp === this._lastFingerprints.workspaces) {
      this.diagnostics.recordWrite({
        dbName: DB_NAME,
        storeName: 'workspaces',
        key: 'workspace_active',
        action: 'skip-unchanged',
        approxBytes: 0,
        reason,
      });
      return { saved: false, skipped: true };
    }

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(WORKSPACE_LS_KEY, JSON.stringify(this.workspaceState));
      } catch {}
    }

    if (!this.db) {
      this._lastFingerprints.workspaces = currFp;
      return { saved: true, skipped: false };
    }

    const ok = await this._put('workspaces', this.workspaceState, reason);
    if (ok) {
      this._lastFingerprints.workspaces = currFp;
    }
    return { saved: ok, skipped: false };
  }

  /**
   * Atomically persists ONLY the changed persistent Project Document stores
   * ('projects', 'timeline', 'media', plus activeProjectId in 'session' if project switched).
   * Throws on transaction error so ProjectAutosaveManager enters 'failed' state safely.
   */
  async _persistProjectDocument({ revision, reason = 'autosave', manual = false } = {}) {
    const projectDomains = ['projects', 'timeline', 'media'];
    const dirtyList = [];

    for (const d of projectDomains) {
      const currFp = this._getCurrentFingerprint(d);
      if (currFp !== this._lastFingerprints[d]) {
        dirtyList.push({ domain: d, fp: currFp });
      }
    }

    const projId = this.projectState.id || 'proj_default';
    const hasTlOrMedia = dirtyList.some(x => x.domain === 'timeline' || x.domain === 'media');
    const hasProjInDirty = dirtyList.some(x => x.domain === 'projects');
    if (hasTlOrMedia && !hasProjInDirty && !this._persistedKeys.has(`projects:${projId}`)) {
      dirtyList.unshift({ domain: 'projects', fp: this._getCurrentFingerprint('projects') });
    }

    // Include lightweight session pointer ONLY when activeProjectId changed
    const sessionNeedsProjId = this.sessionState.activeProjectId !== projId || !this._persistedKeys.has('session:session_active');
    if (dirtyList.length > 0 && sessionNeedsProjId) {
      this.sessionState.activeProjectId = projId;
      dirtyList.push({ domain: 'session', fp: this._getCurrentFingerprint('session') });
    }

    if (dirtyList.length === 0) return true;

    const prevModifiedAt = this.projectState.modifiedAt;
    const prevRevision = this.projectState.revision;
    this.projectState.modifiedAt = Date.now();
    this.projectState.revision = revision;

    if (!this.db) {
      for (const item of dirtyList) this._lastFingerprints[item.domain] = item.fp;
      return true;
    }

    const storeNames = [...new Set(dirtyList.map(x => x.domain))];
    const committed = await new Promise((resolve, reject) => {
      try {
        const tx = this.db.transaction(storeNames, 'readwrite');
        for (const { domain } of dirtyList) {
          const os = tx.objectStore(domain);
          if (domain === 'projects') {
            this._putInTx(os, 'projects', { ...this._buildProjectRecord(), revision }, reason);
          } else if (domain === 'timeline') {
            this._putInTx(os, 'timeline', this._buildTimelineRecord(), reason);
          } else if (domain === 'media') {
            const map = this._buildMediaRecordsMap();
            for (const rec of Object.values(map)) {
              this._putInTx(os, 'media', rec, reason);
            }
          } else if (domain === 'session') {
            this._putInTx(os, 'session', this.sessionState, reason);
          }
        }
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction error'));
        tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
      } catch (err) {
        reject(err);
      }
    }).catch((err) => {
      // Restore previous metadata on failure so last saved state stays honest
      this.projectState.modifiedAt = prevModifiedAt;
      this.projectState.revision = prevRevision;
      throw err;
    });

    if (committed) {
      for (const item of dirtyList) {
        this._lastFingerprints[item.domain] = item.fp;
        this._dirtyDomains.delete(item.domain);
      }
      // Keep recovery snapshots separate from routine manual re-saves (deduplicated by content fingerprint)
      if (!manual || this._lastFingerprints.recovery !== this.getProjectDocumentFingerprint()) {
        await this.saveRecoverySnapshot(reason);
      }
    }
    return committed;
  }

  /**
   * Compatibility router for legacy callers:
   *  - 'workspaces' -> independent silent workspace persistence (NEVER touches Project Save Status!)
   *  - 'session' -> temporary interaction state (NEVER triggers project or DB save!)
   *  - project/timeline/media -> routes into intelligent 1.5s ProjectAutosaveManager
   */
  scheduleSave(delayMs = AUTOSAVE_DEBOUNCE_MS, domains = null, reason = 'autosave') {
    if (this.isHydrating) return;
    if (domains === 'workspaces') {
      this.scheduleWorkspaceSave(reason, Math.min(delayMs || 400, 500));
      return;
    }
    if (domains === 'session') {
      // Temporary UI interaction state NEVER triggers project or IndexedDB saves!
      return;
    }
    this.markProjectDirty(reason, { scheduleAutosave: true });
  }

  /**
   * Flushes pending dirty domains without ever writing unchanged data.
   * Workspace flush is strictly isolated from Project Save Status.
   */
  async flushNow({ force = false, domains = null, reason = 'autosave', manual = false } = {}) {
    if (this.isHydrating) return { writtenDomains: [], skippedDomains: [] };

    if (domains === 'workspaces') {
      const wsRes = await this.flushWorkspaceNow(reason);
      return {
        writtenDomains: wsRes.saved ? ['workspaces'] : [],
        skippedDomains: wsRes.saved ? [] : ['workspaces'],
      };
    }

    if (domains === 'session') {
      return { writtenDomains: [], skippedDomains: ['session'] };
    }

    const writtenDomains = [];
    const skippedDomains = [];

    // 1. Flush workspace preferences silently if dirty (never affects Project Save Status)
    if (!domains || (Array.isArray(domains) && domains.includes('workspaces'))) {
      const wsRes = await this.flushWorkspaceNow(reason);
      if (wsRes.saved) writtenDomains.push('workspaces');
      else skippedDomains.push('workspaces');
    }

    // 2. Flush Project Document via serialized ProjectAutosaveManager ONLY if dirty (or forced)
    if (!domains || (Array.isArray(domains) && domains.some(d => d === 'projects' || d === 'timeline' || d === 'media'))) {
      if (force && !this.autosave.hasPendingChanges()) {
        this.autosave.currentRevision++;
      }
      const projRes = await this.autosave.saveNow({ reason, manual });
      if (projRes.saved) {
        writtenDomains.push('projects', 'timeline');
      } else {
        skippedDomains.push('projects', 'timeline', 'media');
      }
    }

    return { writtenDomains, skippedDomains };
  }

  _putInTx(objectStore, storeName, value, reason) {
    const key = value.id;
    const cacheKey = `${storeName}:${key}`;
    const existed = this._persistedKeys.has(cacheKey);
    const approxBytes = estimateRecordBytes(value);
    objectStore.put(value);
    this._persistedKeys.add(cacheKey);
    this.diagnostics.recordWrite({
      dbName: DB_NAME,
      storeName,
      key,
      action: existed ? 'update' : 'insert',
      approxBytes,
      reason,
    });
  }

  // ---------------- Storage Inspection & Integrity (Phase 7) ----------------

  async inspectStorage() {
    const stores = {};
    let totalRecords = 0;
    let totalApproxBytes = 0;
    let thumbnailCacheBytes = 0;
    let waveformCacheBytes = 0;
    let otherCacheBytes = 0;
    let recoverySnapshotCount = 0;
    let mediaBlobCount = 0;
    let mediaBlobBytes = 0;
    const storedBlobIds = new Set();

    if (this.db) {
      for (const name of ALL_OBJECT_STORES) {
        if (!this.db.objectStoreNames.contains(name)) continue;
        const rows = await this._getAll(name);
        let bytes = 0;
        for (const row of rows) {
          const b = estimateRecordBytes(row);
          bytes += b;
          if (name === 'cache') {
            if (row.kind === 'thumbnail') thumbnailCacheBytes += b;
            else if (row.kind === 'waveform') waveformCacheBytes += b;
            else otherCacheBytes += b;
          } else if (name === 'history' && row.type === 'recovery') {
            recoverySnapshotCount++;
          } else if (name === 'media_blobs') {
            mediaBlobCount++;
            mediaBlobBytes += b;
            storedBlobIds.add(row.id);
          }
        }
        stores[name] = { count: rows.length, approxBytes: bytes };
        totalRecords += rows.length;
        totalApproxBytes += bytes;
      }
    }

    let browserEstimate = null;
    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
      try {
        const est = await navigator.storage.estimate();
        browserEstimate = { usage: est.usage || 0, quota: est.quota || 0 };
      } catch {}
    }

    const integrity = verifyProjectIntegrity(this.projectState, storedBlobIds, this.runtimeState.decoders);

    return {
      dbName: DB_NAME,
      dbVersion: DB_VERSION,
      inspectedAt: new Date().toISOString(),
      stores,
      totalRecords,
      totalApproxBytes,
      browserEstimate,
      cacheBreakdown: {
        totalBytes: thumbnailCacheBytes + waveformCacheBytes + otherCacheBytes,
        thumbnailBytes: thumbnailCacheBytes,
        waveformBytes: waveformCacheBytes,
        otherBytes: otherCacheBytes,
      },
      projectCount: stores.projects?.count || (this.projectState ? 1 : 0),
      mediaAssetCount: Object.keys(this.projectState.assets || {}).length,
      mediaBlobCount,
      mediaBlobBytes,
      recoverySnapshotCount,
      integrity,
      writeStats: structuredClone(this.diagnostics.stats),
      recentWrites: this.diagnostics.writeLog.slice(0, 20),
    };
  }

  async verifyIntegrity() {
    const blobs = this.db ? await this._getAll('media_blobs') : [];
    const blobIds = new Set(blobs.map(b => b.id));
    return verifyProjectIntegrity(this.projectState, blobIds, this.runtimeState.decoders);
  }
}

/**
 * FRAMEFLOW Browser Storage Diagnostics & Telemetry Engine (Phases 2 & 7)
 *
 * Measures IndexedDB usage, per-store record counts, approximate serialized byte sizes,
 * write operations (inserts, updates, skipped-unchanged, deletes), and growth diffs
 * across refreshes — WITHOUT ever logging sensitive media binary contents.
 */

export const STORAGE_DOMAIN_CATEGORIES = {
  projects:    { category: 'Project Storage',        policy: 'Persistent' },
  timeline:    { category: 'Project Storage',        policy: 'Persistent' },
  media:       { category: 'Project Storage',        policy: 'Persistent' },
  media_blobs: { category: 'User Media Fallback',    policy: 'Protected (User Media)' },
  history:     { category: 'Project Storage',        policy: 'Bounded Retention' },
  cache:       { category: 'Media Cache',            policy: 'Regenerable' },
  workspaces:  { category: 'Workspace Preferences',  policy: 'Lightweight' },
  session:     { category: 'Workspace Preferences',  policy: 'Lightweight' },
};

/**
 * Computes approximate byte size of any IndexedDB value safely (handles Blobs/Files/TypedArrays/JSON).
 * Never extracts or logs raw media bytes.
 */
export function estimateRecordBytes(value) {
  if (value === null || value === undefined) return 0;
  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    return value.size || 0;
  }
  if (value instanceof ArrayBuffer) {
    return value.byteLength;
  }
  if (ArrayBuffer.isView(value)) {
    return value.byteLength;
  }
  if (typeof value === 'object') {
    let total = 2;
    for (const [k, v] of Object.entries(value)) {
      total += k.length * 2 + 4;
      if (typeof Blob !== 'undefined' && v instanceof Blob) {
        total += v.size || 0;
      } else if (v && typeof v === 'object' && typeof v.size === 'number' && typeof v.type === 'string' && typeof v.slice === 'function') {
        // Blob-like mock in Node tests
        total += v.size;
      } else if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) {
        total += v.byteLength;
      } else if (v && typeof v === 'object' && v.kind === 'file' && typeof v.getFile === 'function') {
        // FileSystemFileHandle is lightweight metadata reference (~256B)
        total += 256;
      } else {
        total += estimateRecordBytes(v);
      }
    }
    return total;
  }
  if (typeof value === 'string') return value.length * 2;
  if (typeof value === 'number') return 8;
  if (typeof value === 'boolean') return 4;
  return 8;
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function computeStableFingerprint(obj) {
  try {
    return JSON.stringify(obj, (key, val) => {
      // Exclude volatile timestamps so unchanged saves produce identical fingerprints
      if (key === 'modifiedAt' || key === 'savedAt' || key === 'lastWrittenAt') return undefined;
      if (val && typeof val === 'object' && typeof val.size === 'number' && typeof val.slice === 'function') {
        return { __blob: true, size: val.size, type: val.type || '' };
      }
      if (val && typeof val === 'object' && val.kind === 'file' && typeof val.getFile === 'function') {
        return { __handle: true, name: val.name || '' };
      }
      return val;
    });
  } catch {
    return String(Date.now());
  }
}

export class StorageDiagnosticsTracker {
  constructor({ maxLogEntries = 100 } = {}) {
    this.maxLogEntries = maxLogEntries;
    this.writeLog = [];
    this.stats = {
      dbOpenCount: 0,
      migrationCount: 0,
      totalWrites: 0,
      inserts: 0,
      updates: 0,
      skippedUnchanged: 0,
      deletes: 0,
      bytesWritten: 0,
      perStore: {},
    };
    this.baselineSnapshot = null;
  }

  recordDbOpen({ migrated = false } = {}) {
    this.stats.dbOpenCount++;
    if (migrated) this.stats.migrationCount++;
  }

  recordWrite({ dbName, storeName, key, action, approxBytes = 0, reason = '' }) {
    if (!this.stats.perStore[storeName]) {
      this.stats.perStore[storeName] = { writes: 0, inserts: 0, updates: 0, skipped: 0, deletes: 0, bytesWritten: 0 };
    }
    const ps = this.stats.perStore[storeName];

    if (action === 'skip-unchanged') {
      this.stats.skippedUnchanged++;
      ps.skipped++;
    } else if (action === 'delete') {
      this.stats.deletes++;
      ps.deletes++;
    } else {
      this.stats.totalWrites++;
      this.stats.bytesWritten += approxBytes;
      ps.writes++;
      ps.bytesWritten += approxBytes;
      if (action === 'insert') { this.stats.inserts++; ps.inserts++; }
      else { this.stats.updates++; ps.updates++; }
    }

    this.writeLog.unshift({
      timestamp: new Date().toISOString(),
      dbName,
      storeName,
      key: String(key || ''),
      action,
      approxBytes,
      reason,
    });
    if (this.writeLog.length > this.maxLogEntries) {
      this.writeLog.length = this.maxLogEntries;
    }
  }

  setBaseline(snapshot) {
    if (!this.baselineSnapshot) {
      this.baselineSnapshot = snapshot;
    }
  }

  diffFromBaseline(currentSnapshot) {
    if (!this.baselineSnapshot || !currentSnapshot) return null;
    const storeDiffs = {};
    const allStores = new Set([
      ...Object.keys(this.baselineSnapshot.stores || {}),
      ...Object.keys(currentSnapshot.stores || {}),
    ]);
    for (const s of allStores) {
      const before = this.baselineSnapshot.stores?.[s] || { count: 0, approxBytes: 0 };
      const after = currentSnapshot.stores?.[s] || { count: 0, approxBytes: 0 };
      storeDiffs[s] = {
        countDelta: after.count - before.count,
        bytesDelta: after.approxBytes - before.approxBytes,
      };
    }
    return {
      totalCountDelta: currentSnapshot.totalRecords - this.baselineSnapshot.totalRecords,
      totalBytesDelta: currentSnapshot.totalApproxBytes - this.baselineSnapshot.totalApproxBytes,
      storeDiffs,
    };
  }
}

/**
 * Verifies integrity across projectState, timeline sequences, media references, and stored blobs.
 * Pure & deterministic so it can be run both in UI and in automated tests.
 */
export function verifyProjectIntegrity(projectState, storedBlobIds = new Set(), runtimeDecoders = new Map()) {
  const issues = [];
  const warnings = [];
  const assets = projectState?.assets || {};
  const sequences = projectState?.sequences || {};
  const referencedAssetIds = new Set();

  let totalClips = 0;
  let totalTracks = 0;

  for (const seq of Object.values(sequences)) {
    const trackIds = new Set((seq.tracks || []).map(t => t.id));
    totalTracks += trackIds.size;

    for (const clip of (seq.clips || [])) {
      totalClips++;
      if (!trackIds.has(clip.trackId)) {
        issues.push(`Clip "${clip.name}" (${clip.id}) references missing track "${clip.trackId}" in sequence "${seq.name}".`);
      }
      if (clip.assetId) {
        referencedAssetIds.add(clip.assetId);
        if (!assets[clip.assetId]) {
          issues.push(`Clip "${clip.name}" (${clip.id}) references missing media asset "${clip.assetId}".`);
        } else {
          const dec = runtimeDecoders.get(clip.assetId);
          if (dec && dec.missing) {
            warnings.push(`Asset "${assets[clip.assetId].name}" is currently offline (relink required).`);
          }
        }
      }
    }
  }

  // Detect orphaned media blobs in IndexedDB not referenced by any project asset
  const orphanedBlobIds = [];
  for (const blobId of storedBlobIds) {
    if (!assets[blobId]) {
      orphanedBlobIds.push(blobId);
    }
  }
  if (orphanedBlobIds.length > 0) {
    warnings.push(`${orphanedBlobIds.length} orphaned media blob(s) exist in IndexedDB not linked to any active project asset.`);
  }

  return {
    healthy: issues.length === 0,
    checkedAt: new Date().toISOString(),
    projectCount: projectState ? 1 : 0,
    sequenceCount: Object.keys(sequences).length,
    trackCount: totalTracks,
    clipCount: totalClips,
    assetCount: Object.keys(assets).length,
    referencedAssetCount: referencedAssetIds.size,
    orphanedBlobIds,
    issues,
    warnings,
  };
}


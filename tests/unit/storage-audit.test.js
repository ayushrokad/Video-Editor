import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FrameflowStateStore,
  MAX_RECOVERY_SNAPSHOTS,
  createDefaultProjectState,
} from '../../apps/web/public/js/state-store.js';
import { estimateRecordBytes } from '../../apps/web/public/js/storage-diagnostics.js';

/**
 * Deterministic in-memory IndexedDB implementation for testing real FrameflowStateStore
 * transactions, migrations, record counts, and byte usage across simulated browser refreshes.
 */
function createMockIndexedDB() {
  const databases = new Map(); // dbName -> { version, stores: Map<storeName, Map<key, value>> }

  function makeReq(executor) {
    const req = { result: null, onsuccess: null, onerror: null, onupgradeneeded: null };
    queueMicrotask(() => executor(req));
    return req;
  }

  return {
    _databases: databases,
    open(dbName, version = 1) {
      return makeReq((req) => {
        let entry = databases.get(dbName);
        const needsUpgrade = !entry || entry.version < version;
        if (!entry) {
          entry = { version, stores: new Map() };
          databases.set(dbName, entry);
        }

        const db = {
          name: dbName,
          version,
          objectStoreNames: {
            contains: (name) => entry.stores.has(name),
          },
          createObjectStore(name) {
            if (!entry.stores.has(name)) entry.stores.set(name, new Map());
            return {};
          },
          transaction(storeNames) {
            const tx = { oncomplete: null, onerror: null, onabort: null };
            const names = Array.isArray(storeNames) ? storeNames : [storeNames];
            tx.objectStore = (name) => {
              if (!names.includes(name) || !entry.stores.has(name)) {
                throw new Error(`Missing object store ${name}`);
              }
              const map = entry.stores.get(name);
              return {
                get(key) {
                  return makeReq((r) => { r.result = map.has(key) ? map.get(key) : undefined; r.onsuccess?.({ target: r }); });
                },
                getAll() {
                  return makeReq((r) => { r.result = Array.from(map.values()); r.onsuccess?.({ target: r }); });
                },
                put(value) {
                  map.set(value.id, value);
                  return makeReq((r) => { r.result = value.id; r.onsuccess?.({ target: r }); });
                },
                delete(key) {
                  map.delete(key);
                  return makeReq((r) => { r.result = undefined; r.onsuccess?.({ target: r }); });
                },
              };
            };
            queueMicrotask(() => tx.oncomplete?.());
            return tx;
          },
        };

        if (needsUpgrade) {
          entry.version = version;
          req.result = db;
          req.onupgradeneeded?.({ target: req });
        }
        req.result = db;
        req.onsuccess?.({ target: req });
      });
    },
    measureTotalBytes(dbName = 'frameflow_studio_db') {
      const entry = databases.get(dbName);
      if (!entry) return { totalRecords: 0, totalBytes: 0, byStore: {} };
      let totalRecords = 0;
      let totalBytes = 0;
      const byStore = {};
      for (const [storeName, map] of entry.stores.entries()) {
        let sb = 0;
        for (const val of map.values()) sb += estimateRecordBytes(val);
        byStore[storeName] = { count: map.size, bytes: sb };
        totalRecords += map.size;
        totalBytes += sb;
      }
      return { totalRecords, totalBytes, byStore };
    },
  };
}

function makeFakeVideoFile(name, sizeBytes, lastModified = 1700000000000) {
  return {
    name,
    size: sizeBytes,
    type: 'video/mp4',
    lastModified,
    slice: () => ({}),
  };
}

async function simulateRefresh(idb, prevStore = null) {
  if (prevStore) {
    // Browser fires visibilitychange + beforeunload on refresh
    await prevStore.flushNow({ reason: 'visibility-hidden' });
    await prevStore.flushNow({ reason: 'beforeunload' });
  }
  const next = new FrameflowStateStore({ indexedDBImpl: idb });
  await next.restoreAll();
  return next;
}

test('Regression 1, 2 & 3: Fresh load, refresh without editing, and 5 consecutive refreshes produce ZERO writes & ZERO growth', async () => {
  const idb = createMockIndexedDB();

  // 1. Fresh application load
  let store = new FrameflowStateStore({ indexedDBImpl: idb });
  await store.restoreAll();
  assert.equal(store.diagnostics.stats.dbOpenCount, 1);
  assert.equal(store.diagnostics.stats.migrationCount, 1);
  assert.equal(store.diagnostics.stats.totalWrites, 0, 'Fresh load must perform 0 IndexedDB writes');
  const afterFresh = idb.measureTotalBytes();
  assert.equal(afterFresh.totalRecords, 0);
  assert.equal(afterFresh.totalBytes, 0);

  // Calling openDB again is strictly idempotent
  await store.openDB();
  assert.equal(store.diagnostics.stats.dbOpenCount, 1, 'Idempotent openDB must not reopen');

  // 2. Refresh without creating a project
  store = await simulateRefresh(idb, store);
  assert.equal(store.diagnostics.stats.migrationCount, 0, 'Migration must not rerun on refresh');
  assert.equal(store.diagnostics.stats.totalWrites, 0);
  assert.equal(idb.measureTotalBytes().totalRecords, 0);

  // 3. Refresh five consecutive times
  for (let i = 0; i < 5; i++) {
    store = await simulateRefresh(idb, store);
    assert.equal(store.diagnostics.stats.totalWrites, 0, `Refresh #${i + 1} must perform 0 writes`);
    assert.equal(idb.measureTotalBytes().totalBytes, 0, `Refresh #${i + 1} must have 0 bytes growth`);
  }
});

test('Regression 4 & 5: Create one project, refresh cleanly, and repeated saves of unchanged project perform 0 duplicate writes', async () => {
  const idb = createMockIndexedDB();
  let store = new FrameflowStateStore({ indexedDBImpl: idb });
  await store.restoreAll();

  // 4. Create one project and explicitly save
  store.projectState = createDefaultProjectState('proj_film_01');
  store.projectState.title = 'Short Film Master';
  store.sessionState.activeProjectId = 'proj_film_01';
  await store.flushNow({ reason: 'create-project' });

  const afterCreate = idb.measureTotalBytes();
  assert.equal(afterCreate.byStore.projects.count, 1);
  assert.equal(afterCreate.byStore.timeline.count, 1);
  assert.equal(afterCreate.byStore.history.count, 1, 'Creates exactly 1 recovery snapshot');

  // 5. Save the unchanged project 10 times repeatedly -> ZERO writes & ZERO new snapshots!
  const writesBefore = store.diagnostics.stats.totalWrites;
  for (let i = 0; i < 10; i++) {
    const res = await store.flushNow({ reason: 'explicit-save' });
    assert.deepEqual(res.writtenDomains, []);
  }
  assert.equal(store.diagnostics.stats.totalWrites, writesBefore);
  assert.equal(idb.measureTotalBytes().byStore.history.count, 1, 'No duplicate recovery snapshots');

  // Refresh -> project survives intact with 0 bytes growth
  store = await simulateRefresh(idb, store);
  assert.equal(store.projectState.id, 'proj_film_01');
  assert.equal(store.projectState.title, 'Short Film Master');
  assert.equal(idb.measureTotalBytes().totalBytes, afterCreate.totalBytes);
});

test('Regression 6: Import one video (handle mode + deduplicated blob mode) and refresh produces zero copies on reload', async () => {
  const idb = createMockIndexedDB();
  let store = new FrameflowStateStore({ indexedDBImpl: idb });
  await store.restoreAll();

  // Mode A: FileSystemFileHandle (lightweight reference, zero multi-MB binary stored!)
  const fakeVideo = makeFakeVideoFile('A001_C001.mp4', 2_600_000);
  const fakeHandle = {
    kind: 'file',
    name: 'A001_C001.mp4',
    queryPermission: async () => 'granted',
    getFile: async () => fakeVideo,
  };
  const assetHandle = { id: 'asset_handle_1', name: fakeVideo.name, size: fakeVideo.size, lastModified: fakeVideo.lastModified, type: 'video/mp4', duration: 15, width: 1920, height: 1080 };
  store.projectState.assets[assetHandle.id] = assetHandle;
  const resHandle = await store.saveMediaAsset(assetHandle, { fileOrBlob: fakeVideo, fileHandle: fakeHandle });
  assert.equal(resHandle.mode, 'handle');
  assert.equal(idb.measureTotalBytes().byStore.media_blobs.count, 0, 'Handle mode must not copy 2.6MB blob into IndexedDB');
  assert.ok(idb.measureTotalBytes().byStore.media.bytes < 2000, 'Handle reference metadata must stay lightweight (<2KB)');

  // Mode B: Fallback blob import + duplicate re-import deduplication
  const fallbackFile = makeFakeVideoFile('B_Roll_Clip.mp4', 500_000, 1700000001234);
  const assetBlob1 = { id: 'asset_blob_1', name: fallbackFile.name, size: fallbackFile.size, lastModified: fallbackFile.lastModified, type: 'video/mp4', duration: 8, width: 1920, height: 1080 };
  store.projectState.assets[assetBlob1.id] = assetBlob1;
  const r1 = await store.saveMediaAsset(assetBlob1, { fileOrBlob: fallbackFile });
  assert.equal(r1.deduplicated, false);
  assert.equal(idb.measureTotalBytes().byStore.media_blobs.count, 1);

  // Re-importing the exact same file reuses existing blob (0 duplicate binary copies!)
  const assetBlob2 = { id: 'asset_blob_2', name: fallbackFile.name, size: fallbackFile.size, lastModified: fallbackFile.lastModified, type: 'video/mp4', duration: 8, width: 1920, height: 1080 };
  store.projectState.assets[assetBlob2.id] = assetBlob2;
  const r2 = await store.saveMediaAsset(assetBlob2, { fileOrBlob: fallbackFile });
  assert.equal(r2.deduplicated, true);
  assert.equal(idb.measureTotalBytes().byStore.media_blobs.count, 1, 'Duplicate file must not create a second 500KB blob');

  await store.flushNow({ reason: 'import-media' });
  const bytesBeforeRefresh = idb.measureTotalBytes().totalBytes;

  // Refresh -> 0 extra writes & 0 bytes growth
  store = await simulateRefresh(idb, store);
  assert.equal(idb.measureTotalBytes().totalBytes, bytesBeforeRefresh);
  assert.ok(store.projectState.assets.asset_handle_1);
  assert.ok(store.projectState.assets.asset_blob_1);
});

test('Regression 7, 8 & 9: Timeline clips survive refresh, workspace switching writes ONLY workspaces, and reopen verifies integrity', async () => {
  const idb = createMockIndexedDB();
  let store = new FrameflowStateStore({ indexedDBImpl: idb });
  await store.restoreAll();

  // 7. Create timeline clips & save
  store.projectState.assets.asset_v1 = { id: 'asset_v1', name: 'Scene1.mp4', size: 120000, type: 'video/mp4', duration: 12, width: 1920, height: 1080 };
  store.projectState.sequences.seq_master.clips.push({
    id: 'clip_1',
    assetId: 'asset_v1',
    name: 'Scene1.mp4',
    trackId: 'track_v1',
    timelineStart: 0,
    timelineDuration: 6,
  });
  await store.flushNow({ reason: 'add-clip' });

  // Refresh -> clip survives in separated timeline store
  store = await simulateRefresh(idb, store);
  assert.equal(store.projectState.sequences.seq_master.clips.length, 1);
  assert.equal(store.projectState.sequences.seq_master.clips[0].id, 'clip_1');

  // 8. Switch workspaces repeatedly -> writes ONLY to 'workspaces' store!
  const projWritesBefore = store.diagnostics.stats.perStore.projects?.writes || 0;
  const tlWritesBefore = store.diagnostics.stats.perStore.timeline?.writes || 0;
  const histWritesBefore = store.diagnostics.stats.perStore.history?.writes || 0;

  for (const ws of ['effects', 'color', 'audio', 'graphics', 'deliver', 'media', 'minimal', 'dual-viewer', 'edit']) {
    store.workspaceState.activeWorkspace = ws;
    const res = await store.flushNow({ domains: 'workspaces', reason: 'workspace-switch' });
    assert.deepEqual(res.writtenDomains, ['workspaces']);
  }

  assert.equal(store.diagnostics.stats.perStore.projects?.writes || 0, projWritesBefore, 'Workspace switch must never write projects');
  assert.equal(store.diagnostics.stats.perStore.timeline?.writes || 0, tlWritesBefore, 'Workspace switch must never write timeline');
  assert.equal(store.diagnostics.stats.perStore.history?.writes || 0, histWritesBefore, 'Workspace switch must never create snapshots');

  // 9. Close and reopen project -> verify full integrity
  store = await simulateRefresh(idb, store);
  const integrity = await store.verifyIntegrity();
  assert.equal(integrity.healthy, true);
  assert.equal(integrity.clipCount, 1);
  assert.equal(integrity.assetCount, 1);
});

test('Regression 10: Recovery snapshot retention, interrupted session recovery, and regenerable cache cleanup protect user media', async () => {
  const idb = createMockIndexedDB();
  const store = new FrameflowStateStore({ indexedDBImpl: idb });
  await store.restoreAll();

  // Store 1 protected user media blob + 2 regenerable cache items (thumbnail & waveform)
  const userMedia = makeFakeVideoFile('Interview.mp4', 350_000, 1700000009999);
  const asset = { id: 'asset_user_1', name: userMedia.name, size: userMedia.size, lastModified: userMedia.lastModified, type: 'video/mp4', duration: 20, width: 1920, height: 1080 };
  store.projectState.assets[asset.id] = asset;
  await store.saveMediaAsset(asset, { fileOrBlob: userMedia });

  await store.putCacheEntry({ assetId: asset.id, kind: 'thumbnail', version: 1, data: new Uint8Array(4096) });
  await store.putCacheEntry({ assetId: asset.id, kind: 'waveform', version: 1, data: new Float32Array(1024) });
  // Duplicate identical cache write is skipped cleanly
  const cacheWritesBefore = store.diagnostics.stats.perStore.cache?.writes || 0;
  await store.putCacheEntry({ assetId: asset.id, kind: 'thumbnail', version: 1, data: new Uint8Array(4096) });
  assert.equal(store.diagnostics.stats.perStore.cache?.writes || 0, cacheWritesBefore, 'Identical thumbnail cache write must be skipped');

  // Perform 8 distinct project edits -> retention cap keeps strictly <= MAX_RECOVERY_SNAPSHOTS (5)
  for (let i = 1; i <= 8; i++) {
    store.projectState.title = `Edit Pass ${i}`;
    store.projectState.sequences.seq_master.clips.push({
      id: `clip_${i}`,
      assetId: asset.id,
      name: `Take ${i}`,
      trackId: 'track_v1',
      timelineStart: i * 2,
      timelineDuration: 2,
    });
    await store.flushNow({ reason: `edit-${i}` });
  }

  const snaps = await store.listRecoverySnapshots();
  assert.equal(snaps.length, MAX_RECOVERY_SNAPSHOTS, `Recovery snapshots must be capped at ${MAX_RECOVERY_SNAPSHOTS}`);

  // Simulate interrupted session recovery into a clean store instance
  const recoveredStore = new FrameflowStateStore({ indexedDBImpl: idb });
  await recoveredStore.openDB();
  const ok = await recoveredStore.restoreFromLatestRecovery();
  assert.equal(ok, true);
  assert.equal(recoveredStore.projectState.title, 'Edit Pass 8');
  assert.equal(recoveredStore.projectState.sequences.seq_master.clips.length, 8);

  // Clear Regenerable Cache -> removes thumbnails/waveforms ONLY, NEVER deletes user media blob!
  const cleared = await recoveredStore.clearRegenerableCache();
  assert.equal(cleared, 2);
  const afterClear = await recoveredStore.inspectStorage();
  assert.equal(afterClear.cacheBreakdown.totalBytes, 0);
  assert.equal(afterClear.mediaBlobCount, 1, 'Clearing regenerable cache must NEVER delete user media');

  // Remove old recovery snapshots keeping only latest
  const pruned = await recoveredStore.removeOldRecoverySnapshots(1);
  assert.equal(pruned, MAX_RECOVERY_SNAPSHOTS - 1);
  assert.equal((await recoveredStore.listRecoverySnapshots()).length, 1);
});


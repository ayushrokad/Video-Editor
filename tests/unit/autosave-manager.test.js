import test from 'node:test';
import assert from 'node:assert/strict';

import { FrameflowStateStore } from '../../apps/web/public/js/state-store.js';
import { ProjectAutosaveManager } from '../../apps/web/public/js/autosave-manager.js';
import { openPanelInLayout, closePanelInLayout } from '../../apps/web/public/js/panel-manager.js';

function createMockIndexedDB({ failNextWrite = false, delayMs = 0 } = {}) {
  const databases = new Map();
  let shouldFail = failNextWrite;
  let writeDelayMs = delayMs;

  function makeReq(executor) {
    const req = { result: null, onsuccess: null, onerror: null, onupgradeneeded: null };
    queueMicrotask(() => executor(req));
    return req;
  }

  return {
    setFailNextWrite(v) { shouldFail = v; },
    setWriteDelayMs(ms) { writeDelayMs = ms; },
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
          objectStoreNames: { contains: (n) => entry.stores.has(n) },
          createObjectStore(n) { if (!entry.stores.has(n)) entry.stores.set(n, new Map()); return {}; },
          transaction(storeNames, mode) {
            const tx = { oncomplete: null, onerror: null, onabort: null, error: null };
            const names = Array.isArray(storeNames) ? storeNames : [storeNames];
            const staged = [];
            tx.objectStore = (name) => {
              const map = entry.stores.get(name);
              return {
                get(k) { return makeReq((r) => { r.result = map.get(k); r.onsuccess?.({ target: r }); }); },
                getAll() { return makeReq((r) => { r.result = Array.from(map.values()); r.onsuccess?.({ target: r }); }); },
                put(v) {
                  staged.push([map, v.id, structuredClone(v)]);
                  return makeReq((r) => { r.result = v.id; r.onsuccess?.({ target: r }); });
                },
                delete(k) {
                  map.delete(k);
                  return makeReq((r) => { r.result = undefined; r.onsuccess?.({ target: r }); });
                },
              };
            };
            const finish = () => {
              if (mode === 'readwrite' && shouldFail) {
                shouldFail = false;
                tx.error = new Error('Simulated QuotaExceededError');
                tx.onerror?.({ target: tx });
                return;
              }
              for (const [m, k, v] of staged) m.set(k, v);
              tx.oncomplete?.();
            };
            if (mode === 'readwrite' && writeDelayMs > 0) setTimeout(finish, writeDelayMs);
            else queueMicrotask(finish);
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
  };
}

test('Phase 9 (Tests 1-6): Opening app, 20 workspace switches, Inspector open/close, selection, playhead, zoom/scroll trigger ZERO project saves', async () => {
  const idb = createMockIndexedDB();
  const store = new FrameflowStateStore({ indexedDBImpl: idb, autosaveDebounceMs: 40 });
  const statusEvents = [];
  store.onProjectStatusChange = (d) => statusEvents.push(d.status);

  // 1. Open FRAMEFLOW
  await store.restoreAll();
  assert.equal(store.autosave.status, 'saved');
  assert.equal(store.autosave.currentRevision, 0);
  assert.equal(store.autosave.lastSavedRevision, 0);
  assert.equal(store.autosave.lastSavedAt, null);
  assert.equal(store.autosave.stats.totalSaves, 0);

  // 2. Switch between all 5 primary workspaces 20 times
  const wsCycle = ['edit', 'effects', 'color', 'audio', 'graphics'];
  for (let i = 0; i < 20; i++) {
    store.workspaceState.activeWorkspace = wsCycle[i % wsCycle.length];
    await store.flushWorkspaceNow('workspace-switch');
  }

  // 3. Open and close Inspector (Properties) repeatedly
  const editLayout = store.workspaceState.layouts.edit;
  for (let i = 0; i < 6; i++) {
    closePanelInLayout(editLayout, 'properties');
    await store.flushWorkspaceNow('close-inspector');
    openPanelInLayout(editLayout, 'properties');
    await store.flushWorkspaceNow('open-inspector');
  }

  // 4. Select multiple clips, 5. Move playhead, 6. Zoom & scroll timeline
  store.sessionState.selectedClipIds = ['clip_a', 'clip_b'];
  store.sessionState.playheadTime = 14.5;
  store.sessionState.timelineZoom = 72;
  store.sessionState.timelineScrollLeft = 420;
  store.scheduleSave(20, 'session', 'ui-interaction');

  await new Promise(r => setTimeout(r, 80));

  // CRITICAL ASSERTIONS: Zero Project saves, zero revision bumps, lastSavedAt still null!
  assert.equal(store.autosave.currentRevision, 0);
  assert.equal(store.autosave.lastSavedRevision, 0);
  assert.equal(store.autosave.stats.totalSaves, 0);
  assert.equal(store.autosave.lastSavedAt, null, 'UI/Workspace changes must NEVER update Project Saved timestamp');
  assert.equal(store.diagnostics.stats.perStore.projects?.writes || 0, 0);
  assert.equal(store.diagnostics.stats.perStore.timeline?.writes || 0, 0);
  assert.equal(store.diagnostics.stats.perStore.history?.writes || 0, 0);
});

test('Phase 9 (Tests 7-12 & 17): Real project mutations debounce cleanly, coalesce rapid edits, ignore same-value sets, and skip repeated Ctrl+S', async () => {
  const idb = createMockIndexedDB();
  const store = new FrameflowStateStore({ indexedDBImpl: idb, autosaveDebounceMs: 60 });
  await store.restoreAll();

  // 7. Import video + 8. Add clip + 9. Move clip + 10. Volume + 11. Color effect + 12. Title rapidly
  store.projectState.assets.a1 = { id: 'a1', name: 'Shot1.mp4', size: 120000, type: 'video/mp4', duration: 10, width: 1920, height: 1080 };
  store.markProjectDirty('import-media');
  assert.equal(store.autosave.status, 'unsaved');

  const clip = {
    id: 'c1', assetId: 'a1', name: 'Shot1.mp4', trackId: 'track_v1',
    timelineStart: 0, timelineDuration: 6,
    audio: { volumeDb: 0 }, colorEffects: { exposure: 0 },
  };
  store.projectState.sequences.seq_master.clips.push(clip);
  store.markProjectDirty('add-clip');

  clip.timelineStart = 2.5;
  store.markProjectDirty('move-clip');

  clip.audio.volumeDb = -4.5;
  store.markProjectDirty('volume-change');

  // Setting volume to its exact existing value must NOT increment revision!
  const revBeforeSameVal = store.autosave.currentRevision;
  clip.audio.volumeDb = -4.5;
  const sameRes = store.markProjectDirty('volume-same');
  assert.equal(sameRes.changed, false);
  assert.equal(store.autosave.currentRevision, revBeforeSameVal);

  clip.colorEffects.exposure = 0.45;
  store.markProjectDirty('color-grade');

  store.projectState.sequences.seq_master.clips.push({
    id: 't1', isTitle: true, titleText: 'Opening Title', name: 'Title: Opening Title',
    trackId: 'track_v2', timelineStart: 1, timelineDuration: 4,
  });
  store.markProjectDirty('add-title');

  // Wait for single debounced autosave to fire (all 6 rapid edits coalesce into 1 save!)
  await new Promise(r => setTimeout(r, 120));

  assert.equal(store.autosave.status, 'saved');
  assert.equal(store.autosave.stats.totalSaves, 1, 'Rapid edits must coalesce into 1 single project save');
  assert.equal(store.autosave.lastSavedRevision, store.autosave.currentRevision);
  assert.ok(store.autosave.lastSavedAt > 0);

  // 17. Press Ctrl+S 10 times without making changes -> ZERO writes & timestamp untouched!
  const savedAtBefore = store.autosave.lastSavedAt;
  const writesBefore = store.diagnostics.stats.totalWrites;
  for (let i = 0; i < 10; i++) {
    const res = await store.saveProjectNow({ reason: 'manual-ctrl-s', manual: true });
    assert.equal(res.skipped, true);
  }
  assert.equal(store.autosave.stats.totalSaves, 1);
  assert.equal(store.diagnostics.stats.totalWrites, writesBefore);
  assert.equal(store.autosave.lastSavedAt, savedAtBefore);
  assert.ok(store.autosave.stats.skippedUnnecessarySaves >= 10);
});

test('Phase 9 (Tests 13, 14 & 15): Refresh saved, refresh immediately after edit, and mid-save edit queued cleanly via serialized save queue', async () => {
  const idb = createMockIndexedDB({ delayMs: 40 });
  const store = new FrameflowStateStore({ indexedDBImpl: idb, autosaveDebounceMs: 1500 });
  await store.restoreAll();

  // 15. Make an edit, start save (takes 40ms), and make ANOTHER edit while save is in flight!
  store.projectState.title = 'Rev 1 Title';
  store.markProjectDirty('edit-1', { scheduleAutosave: false });
  const savePromise = store.saveProjectNow({ reason: 'first-save', manual: false });

  // While save 1 is in flight, mutate again to Rev 2!
  await new Promise(r => setTimeout(r, 10));
  assert.equal(store.autosave.status, 'saving');
  store.projectState.title = 'Rev 2 Mid-Save Title';
  const midRes = store.markProjectDirty('edit-during-save');
  assert.equal(midRes.queuedDuringSave, true);

  await savePromise;
  // Serialized queue automatically flushed Rev 2 right after Rev 1 without losing it!
  assert.equal(store.autosave.status, 'saved');
  assert.equal(store.autosave.lastSavedRevision, store.autosave.currentRevision);
  assert.equal(store.autosave.stats.totalSaves, 2);

  // 13. Refresh during a saved project -> 0 writes, Rev 2 survives intact!
  const reloaded1 = new FrameflowStateStore({ indexedDBImpl: idb });
  await reloaded1.restoreAll();
  assert.equal(reloaded1.projectState.title, 'Rev 2 Mid-Save Title');
  assert.equal(reloaded1.diagnostics.stats.totalWrites, 0);

  // 14. Refresh immediately after an edit (before 1.5s debounce finishes) -> lifecycle flush saves it!
  reloaded1.projectState.title = 'Immediate Pre-Refresh Edit';
  reloaded1.markProjectDirty('pre-refresh-edit');
  assert.equal(reloaded1.autosave.status, 'unsaved');
  // Simulate visibilitychange / beforeunload flush
  await reloaded1.saveProjectNow({ reason: 'beforeunload', manual: false });

  const reloaded2 = new FrameflowStateStore({ indexedDBImpl: idb });
  await reloaded2.restoreAll();
  assert.equal(reloaded2.projectState.title, 'Immediate Pre-Refresh Edit');
});

test('Phase 9 (Test 16): IndexedDB failure preserves in-memory edits, marks Save Failed, and Retry recovers safely without duplicates', async () => {
  const idb = createMockIndexedDB();
  const store = new FrameflowStateStore({ indexedDBImpl: idb, autosaveDebounceMs: 1500 });
  await store.restoreAll();

  // Save a valid initial version first
  store.projectState.title = 'Valid Saved Version';
  store.markProjectDirty('initial-edit', { scheduleAutosave: false });
  await store.saveProjectNow({ reason: 'initial', manual: true });
  const lastValidSavedAt = store.autosave.lastSavedAt;
  const lastValidRev = store.autosave.lastSavedRevision;

  // Simulate IndexedDB transaction failure on next write
  idb.setFailNextWrite(true);
  store.projectState.title = 'Unsaved Newer Edit';
  store.markProjectDirty('failing-edit', { scheduleAutosave: false });
  const failRes = await store.saveProjectNow({ reason: 'failing-save', manual: true });

  assert.equal(failRes.failed, true);
  assert.equal(store.autosave.status, 'failed');
  assert.equal(store.autosave.hasPendingChanges(), true, 'Project must remain dirty after failed save');
  assert.equal(store.autosave.lastSavedRevision, lastValidRev, 'Must not advance lastSavedRevision on error');
  assert.equal(store.autosave.lastSavedAt, lastValidSavedAt, 'Must not overwrite last valid save timestamp');
  assert.equal(store.projectState.title, 'Unsaved Newer Edit', 'In-memory edits must stay intact');

  // Verify database still holds the last valid saved project (uncorrupted)
  const checkBeforeRetry = new FrameflowStateStore({ indexedDBImpl: idb });
  await checkBeforeRetry.restoreAll();
  assert.equal(checkBeforeRetry.projectState.title, 'Valid Saved Version');

  // Retry succeeds safely without duplicating project records
  const retryRes = await store.retryProjectSave();
  assert.equal(retryRes.saved, true);
  assert.equal(store.autosave.status, 'saved');
  assert.equal(store.autosave.stats.retries, 1);

  const snap = await store.inspectStorage();
  assert.equal(snap.stores.projects.count, 1, 'Retry must upsert, never duplicate project records');
});

test('ProjectAutosaveManager supports Offline and Recovering states cleanly', () => {
  let content = { v: 1 };
  const mgr = new ProjectAutosaveManager({
    getDocumentFingerprint: () => JSON.stringify(content),
    persistDocument: async () => true,
  });

  mgr.setOffline(true);
  assert.equal(mgr.status, 'offline');
  mgr.setRecovering(true);
  assert.equal(mgr.status, 'recovering');
  mgr.setRecovering(false);
  assert.equal(mgr.status, 'offline');
  mgr.setOffline(false);
  assert.equal(mgr.status, 'saved');
});

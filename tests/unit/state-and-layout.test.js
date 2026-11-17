import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FrameflowStateStore,
  validateWorkspaceState,
  createDefaultWorkspaceLayout,
} from '../../apps/web/public/js/state-store.js';
import { clampFloatingBounds } from '../../apps/web/public/js/layout-manager.js';

test('4-Layer State Store - Workspace switching preserves project & editing session context (Test D)', () => {
  const store = new FrameflowStateStore();
  const seq = store.projectState.sequences.seq_master;
  seq.clips.push({ id: 'clip_v1_1', assetId: 'asset_1', name: 'Shot A', trackId: 'track_v1', timelineStart: 2, timelineDuration: 6 });

  store.sessionState.selectedClipIds = ['clip_v1_1'];
  store.sessionState.playheadTime = 4.25;
  store.sessionState.sourceInPoint = 1.5;
  store.sessionState.sourceOutPoint = 8.0;

  // Simulate Edit -> Color -> Audio -> Motion -> Edit workspace transitions
  for (const ws of ['color', 'audio', 'motion', 'deliver', 'edit']) {
    store.workspaceState.activeWorkspace = ws;
    assert.deepEqual(store.sessionState.selectedClipIds, ['clip_v1_1']);
    assert.equal(store.sessionState.playheadTime, 4.25);
    assert.equal(store.sessionState.sourceInPoint, 1.5);
    assert.equal(store.sessionState.sourceOutPoint, 8.0);
    assert.equal(store.projectState.sequences.seq_master.clips.length, 1);
  }
});

test('Selection Sanitization - Deleting a selected clip clears stale selection cleanly (Test H)', () => {
  const store = new FrameflowStateStore();
  const seq = store.projectState.sequences.seq_master;
  seq.clips.push({ id: 'clip_del', assetId: 'asset_1', name: 'Temp', trackId: 'track_v1', timelineStart: 0, timelineDuration: 5 });
  store.sessionState.selectedClipIds = ['clip_del'];

  seq.clips = [];
  store.sanitizeSelection();
  assert.deepEqual(store.sessionState.selectedClipIds, []);
});

test('Workspace Schema Validation - Corrupt saved layout recovers safely without touching project (Test E)', () => {
  const invalid = { schemaVersion: 999, activeWorkspace: 'nonexistent', layouts: null };
  const recovered = validateWorkspaceState(invalid);
  assert.equal(recovered.activeWorkspace, 'edit');
  assert.ok(recovered.layouts.edit.visiblePanels.includes('panel-timeline'));

  const defaultEdit = createDefaultWorkspaceLayout('edit');
  assert.equal(defaultEdit.topSplit.leftPct, 19);
  assert.equal(defaultEdit.topSplit.rightPct, 22);
});

test('Floating Panel Bounds Clamping - Never escapes viewport across 1920x1080 and 1366x768 (Test F & G)', () => {
  // Attempt to float Inspector far off-screen to the right and below viewport
  const offscreen = { xRatio: 0.98, yRatio: 0.95, wRatio: 0.3, hRatio: 0.4 };

  for (const [vw, vh] of [[1920, 1080], [1600, 900], [1440, 900], [1366, 768]]) {
    const clamped = clampFloatingBounds(offscreen, vw, vh);
    assert.ok(clamped.left >= 4, `left >= 4 at ${vw}x${vh}`);
    assert.ok(clamped.left + clamped.width <= vw - 4, `right edge inside viewport at ${vw}x${vh}`);
    assert.ok(clamped.top >= 38, `top below header at ${vw}x${vh}`);
    assert.ok(clamped.top + clamped.height <= vh - 28, `bottom above status bar at ${vw}x${vh}`);
    assert.ok(clamped.width >= 280, 'enforces min width');
    assert.ok(clamped.height >= 200, 'enforces min height');
  }
});

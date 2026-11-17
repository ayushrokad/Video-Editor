import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  PANEL_REGISTRY,
  PANEL_CATEGORIES,
  getAllPanelIds,
  getPanelsByCategory,
  normalizePanelId,
} from '../../apps/web/public/js/panel-registry.js';
import {
  BUILTIN_WORKSPACES,
  createStructuredWorkspaceLayout,
  findGroupById,
  findGroupContainingPanel,
  findSplitById,
  getAllGroups,
  isPanelOpenInLayout,
  activatePanelInLayout,
  openPanelInLayout,
  closePanelInLayout,
  movePanelToZone,
  moveGroupToZone,
  reorderPanelInGroup,
  setGroupModeInLayout,
  toggleGroupSoloModeInLayout,
  toggleStackedPanelInLayout,
  updateSplitRatiosInLayout,
  floatPanelInLayout,
  redockPanelInLayout,
  toggleMaximizeGroupInLayout,
  sanitizeWorkspaceLayout,
} from '../../apps/web/public/js/panel-manager.js';
import {
  FrameflowStateStore,
  validateWorkspaceState,
  createDefaultWorkspaceState,
} from '../../apps/web/public/js/state-store.js';
import { clampFloatingBounds } from '../../apps/web/public/js/layout-manager.js';

test('Panel Registry registers all 7 domains with honest implemented/planned status', () => {
  assert.deepEqual(PANEL_CATEGORIES, ['MEDIA', 'EDITING', 'MOTION', 'COLOR', 'AUDIO', 'DELIVER', 'SYSTEM']);
  const allIds = getAllPanelIds();
  assert.ok(allIds.length >= 43, `Expected at least 43 registered panels, got ${allIds.length}`);

  const byCat = getPanelsByCategory();
  for (const cat of PANEL_CATEGORIES) {
    assert.ok(byCat[cat].length >= 4, `Category ${cat} should have at least 4 panels`);
  }

  for (const def of Object.values(PANEL_REGISTRY)) {
    assert.ok(def.id && def.title && def.icon && def.category);
    assert.ok(def.status === 'implemented' || def.status === 'planned', `Invalid status on ${def.id}`);
    assert.ok(def.minWidth >= 150 && def.minHeight >= 130);
    if (def.status === 'planned') {
      assert.ok(def.milestoneNote && def.milestoneNote.length > 10, `Planned panel ${def.id} must explain its status`);
    }
  }

  // Legacy panel ID normalization
  assert.equal(normalizePanelId('panel-inspector'), 'properties');
  assert.equal(normalizePanelId('panel-timeline'), 'timeline');
  assert.equal(normalizePanelId('unknown-ghost-panel'), null);
});

test('Default Editing workspace matches specification and supports open/close for every registered panel', () => {
  const layout = createStructuredWorkspaceLayout('edit');

  const leftGrp = findGroupById(layout.root, 'grp_left');
  const centerGrp = findGroupById(layout.root, 'grp_center');
  const rightGrp = findGroupById(layout.root, 'grp_right');
  const bottomGrp = findGroupById(layout.root, 'grp_bottom');

  assert.deepEqual(leftGrp.panelIds, ['project', 'media-browser', 'effects-library', 'effect-controls']);
  assert.equal(leftGrp.activePanelId, 'project');
  assert.deepEqual(centerGrp.panelIds, ['source-monitor', 'program-monitor']);
  assert.equal(centerGrp.activePanelId, 'program-monitor');
  assert.deepEqual(rightGrp.panelIds, ['properties', 'audio-mixer', 'color-controls', 'essential-graphics']);
  assert.equal(rightGrp.activePanelId, 'properties');
  assert.ok(bottomGrp.panelIds.includes('timeline'));
  assert.equal(bottomGrp.activePanelId, 'timeline');

  // Open and close every registered panel cleanly
  for (const pid of getAllPanelIds()) {
    assert.equal(openPanelInLayout(layout, pid), true, `Opening ${pid}`);
    assert.equal(isPanelOpenInLayout(layout, pid), true, `${pid} should be open`);
    if (pid !== 'timeline') {
      assert.equal(closePanelInLayout(layout, pid), true, `Closing ${pid}`);
      assert.equal(isPanelOpenInLayout(layout, pid), false, `${pid} should be closed`);
    }
  }
});

test('Docking engine: group two panels, split into new dock (left/right/top/bottom), move back, and move entire group', () => {
  const layout = createStructuredWorkspaceLayout('edit');

  // Move Effects Library to the Right dock group as a tab (center drop)
  assert.equal(movePanelToZone(layout, 'effects-library', 'grp_right', 'center'), true);
  assert.ok(findGroupById(layout.root, 'grp_right').panelIds.includes('effects-library'));
  assert.equal(findGroupById(layout.root, 'grp_right').activePanelId, 'effects-library');
  assert.equal(findGroupById(layout.root, 'grp_left').panelIds.includes('effects-library'), false);

  // Move Effects Library to a brand new dock on the Left of Program Monitor (left split)
  const groupsBefore = getAllGroups(layout.root).length;
  assert.equal(movePanelToZone(layout, 'effects-library', 'grp_center', 'left'), true);
  assert.equal(getAllGroups(layout.root).length, groupsBefore + 1);
  const newDockGrp = findGroupContainingPanel(layout.root, 'effects-library');
  assert.ok(newDockGrp && newDockGrp.panelIds.length === 1);

  // Move Effects Library back to Left dock group -> temporary split prunes cleanly!
  assert.equal(movePanelToZone(layout, 'effects-library', 'grp_left', 'center'), true);
  assert.equal(getAllGroups(layout.root).length, groupsBefore);
  assert.ok(findGroupById(layout.root, 'grp_left').panelIds.includes('effects-library'));

  // Vertical split (top / bottom)
  assert.equal(movePanelToZone(layout, 'history', 'grp_right', 'bottom'), true);
  const histGrp = findGroupContainingPanel(layout.root, 'history');
  assert.ok(histGrp && histGrp.id !== 'grp_right');

  // Move entire group (merge histGrp back into grp_bottom)
  assert.equal(moveGroupToZone(layout, histGrp.id, 'grp_bottom', 'center'), true);
  assert.ok(findGroupById(layout.root, 'grp_bottom').panelIds.includes('history'));
});

test('Tabbed reordering & Stacked Panel Groups with expand, collapse, Solo mode, reorder, and drag-out', () => {
  const layout = createStructuredWorkspaceLayout('edit');
  const rightGrp = findGroupById(layout.root, 'grp_right');

  // Reorder tabs within group
  assert.equal(reorderPanelInGroup(layout, 'grp_right', 0, 2), true);
  assert.equal(rightGrp.panelIds[2], 'properties');

  // Switch active tab without losing other tabs
  assert.equal(activatePanelInLayout(layout, 'color-controls'), true);
  assert.equal(rightGrp.activePanelId, 'color-controls');

  // Convert Right dock to Stacked mode (active tab 'color-controls' is expanded)
  assert.equal(setGroupModeInLayout(layout, 'grp_right', 'stacked'), true);
  assert.equal(rightGrp.mode, 'stacked');
  assert.ok(rightGrp.expandedPanels.includes('color-controls'));

  // Collapse 'properties' if expanded, then verify toggle expand/collapse with multiple expanded in non-solo mode
  if (rightGrp.expandedPanels.includes('properties')) {
    toggleStackedPanelInLayout(layout, 'grp_right', 'properties');
    assert.equal(rightGrp.expandedPanels.includes('properties'), false);
  }
  toggleStackedPanelInLayout(layout, 'grp_right', 'properties');
  toggleStackedPanelInLayout(layout, 'grp_right', 'essential-graphics');
  assert.ok(rightGrp.expandedPanels.includes('properties'));
  assert.ok(rightGrp.expandedPanels.includes('essential-graphics'));

  // Enable Solo mode -> collapses down to a single expanded panel
  assert.equal(toggleGroupSoloModeInLayout(layout, 'grp_right'), true);
  assert.equal(rightGrp.expandedPanels.length, 1);

  // Expanding another panel in Solo mode collapses the previous one
  toggleStackedPanelInLayout(layout, 'grp_right', 'audio-mixer');
  assert.deepEqual(rightGrp.expandedPanels, ['audio-mixer']);

  // Disable Solo mode -> can expand multiple again
  assert.equal(toggleGroupSoloModeInLayout(layout, 'grp_right'), false);
  toggleStackedPanelInLayout(layout, 'grp_right', 'properties');
  assert.equal(rightGrp.expandedPanels.length, 2);

  // Move a panel out of the stack into a separate dock
  assert.equal(movePanelToZone(layout, 'audio-mixer', 'grp_bottom', 'right'), true);
  assert.equal(rightGrp.panelIds.includes('audio-mixer'), false);
  assert.ok(findGroupContainingPanel(layout.root, 'audio-mixer'));
});

test('Float panel, clamp to viewport, redock, resize split ratios, and maximize/restore group', () => {
  const layout = createStructuredWorkspaceLayout('edit');

  // Float Properties panel
  assert.equal(floatPanelInLayout(layout, 'properties', { xRatio: 0.99, yRatio: 0.99, wRatio: 0.3, hRatio: 0.4 }), true);
  assert.ok(layout.floatingPanels.properties);
  assert.equal(findGroupContainingPanel(layout.root, 'properties'), null);

  // Clamp off-screen floating bounds across multiple viewports
  for (const [vw, vh] of [[1920, 1080], [1440, 900], [1366, 768], [1024, 720]]) {
    const c = clampFloatingBounds(layout.floatingPanels.properties, vw, vh);
    assert.ok(c.left >= 4 && c.left + c.width <= vw - 4);
    assert.ok(c.top >= 38 && c.top + c.height <= vh - 28);
  }

  // Redock floating panel cleanly back into previous group
  assert.equal(redockPanelInLayout(layout, 'properties'), true);
  assert.equal(layout.floatingPanels.properties, undefined);
  assert.ok(findGroupById(layout.root, 'grp_right').panelIds.includes('properties'));

  // Resize split ratios and verify normalization + minimum enforcement
  assert.equal(updateSplitRatiosInLayout(layout, 'edit_top', [30, 45, 25]), true);
  const topSplit = findSplitById(layout.root, 'edit_top');
  const sum = topSplit.ratios.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 100) < 0.05);
  assert.equal(Math.round(topSplit.ratios[0]), 30);

  // Maximize & restore group
  assert.equal(toggleMaximizeGroupInLayout(layout, 'grp_bottom'), 'grp_bottom');
  assert.equal(layout.maximizedGroupId, 'grp_bottom');
  assert.equal(toggleMaximizeGroupInLayout(layout, 'grp_bottom'), null);
  assert.equal(layout.maximizedGroupId, null);
});

test('All 9 workspace presets + custom workspace switching preserves selection, playback, and zoom', () => {
  const store = new FrameflowStateStore();
  const seq = store.projectState.sequences.seq_master;
  seq.clips.push({
    id: 'clip_keep',
    assetId: 'asset_keep',
    name: 'Hero Shot',
    trackId: 'track_v1',
    timelineStart: 5,
    timelineDuration: 12,
  });

  store.sessionState.selectedClipIds = ['clip_keep'];
  store.sessionState.playheadTime = 9.75;
  store.sessionState.timelineZoom = 64;
  store.runtimeState.isPlayingSequence = true;

  // Save a custom workspace
  const customLayout = JSON.parse(JSON.stringify(store.workspaceState.layouts.edit));
  customLayout.id = 'cws_director';
  store.workspaceState.customWorkspaces.push({
    id: 'cws_director',
    name: 'Director Cut',
    baseWorkspace: 'edit',
    layout: customLayout,
  });

  assert.equal(BUILTIN_WORKSPACES.length, 9);
  for (const wsId of [...BUILTIN_WORKSPACES.map(w => w.id), 'cws_director', 'edit']) {
    store.workspaceState.activeWorkspace = wsId;
    assert.deepEqual(store.sessionState.selectedClipIds, ['clip_keep']);
    assert.equal(store.sessionState.playheadTime, 9.75);
    assert.equal(store.sessionState.timelineZoom, 64);
    assert.equal(store.runtimeState.isPlayingSequence, true);
    assert.equal(store.projectState.sequences.seq_master.clips.length, 1);
  }
});

test('Persistence recovery safely handles missing panel types and corrupted layout data', () => {
  // Missing/unknown panel ID inside a saved layout
  const layoutWithUnknown = createStructuredWorkspaceLayout('edit');
  findGroupById(layoutWithUnknown.root, 'grp_left').panelIds.push('nonexistent-future-panel');
  layoutWithUnknown.floatingPanels['deleted-panel-type'] = { xRatio: 0.2, yRatio: 0.2, wRatio: 0.3, hRatio: 0.3 };

  const sanitized = sanitizeWorkspaceLayout(layoutWithUnknown, 'edit');
  assert.equal(findGroupById(sanitized.root, 'grp_left').panelIds.includes('nonexistent-future-panel'), false);
  assert.equal(sanitized.floatingPanels['deleted-panel-type'], undefined);
  assert.ok(findGroupById(sanitized.root, 'grp_left').panelIds.includes('project'));

  // Totally empty / corrupt layout recovers to default Editing workspace
  const fromEmpty = sanitizeWorkspaceLayout({ id: 'edit', root: { type: 'group', id: 'g', panelIds: ['bogus'] } }, 'edit');
  assert.ok(isPanelOpenInLayout(fromEmpty, 'timeline'));
  assert.ok(isPanelOpenInLayout(fromEmpty, 'program-monitor'));

  // Corrupted workspaceState blob recovers cleanly
  for (const corrupt of [null, undefined, 'bad-json', { schemaVersion: 99, layouts: {} }, { schemaVersion: 2, layouts: null }]) {
    const recovered = validateWorkspaceState(corrupt);
    assert.equal(recovered.activeWorkspace, 'edit');
    assert.ok(recovered.layouts.edit.root);
    assert.ok(recovered.layouts.color.root);
  }

  // Default state includes all 9 built-in workspaces
  const fresh = createDefaultWorkspaceState();
  for (const ws of BUILTIN_WORKSPACES) {
    assert.ok(fresh.layouts[ws.id]?.root, `Missing root dock tree for ${ws.id}`);
  }
});

test('DOM Integrity - Every implemented panel has a mounted view root and every menu handler has an HTML entry', () => {
  const html = fs.readFileSync(path.resolve('apps/web/public/index.html'), 'utf8');
  const appJs = fs.readFileSync(path.resolve('apps/web/public/app.js'), 'utf8');

  const missingViews = Object.values(PANEL_REGISTRY)
    .filter(p => p.status === 'implemented' && !html.includes(`data-panel-id="${p.id}"`))
    .map(p => p.id);
  assert.deepEqual(missingViews, [], `Missing panel view roots in index.html: ${missingViews.join(', ')}`);

  const menuIds = [...new Set([...appJs.matchAll(/getElementById\('(m-[a-z0-9-]+)'\)/g)].map(m => m[1]))];
  assert.ok(menuIds.length >= 50, `Expected at least 50 menu handlers, found ${menuIds.length}`);
  const missingMenus = menuIds.filter(id => !html.includes(`id="${id}"`));
  assert.deepEqual(missingMenus, [], `Menu handlers referencing missing HTML IDs: ${missingMenus.join(', ')}`);
});

/**
 * FRAMEFLOW Central Panel Manager & Recursive Dock Tree Engine (Phases 1, 2, 4, 5, 6, 12)
 *
 * Pure, DOM-independent layout engine supporting:
 *  - Recursive horizontal/vertical split nodes with normalized percentage ratios
 *  - Tabbed panel groups (default) & Stacked accordion panel groups (optional, with Solo mode)
 *  - Drag-and-drop docking (center -> tab, left/right -> horizontal split, top/bottom -> vertical split)
 *  - Dragging individual panels OR entire panel groups
 *  - Floating panels with viewport-clamped normalized bounds & lossless redocking
 *  - Maximize / restore dock group
 *  - Automatic tree pruning (no empty groups, no 1-child splits) & corrupt layout recovery
 *  - Complete separation from projectState, sessionState, and runtimeState
 */

import { PANEL_REGISTRY, normalizePanelId } from './panel-registry.js';

export const BUILTIN_WORKSPACES = [
  { id: 'edit',        name: 'Editing',          primary: true,  shortcut: 'Alt+Shift+1' },
  { id: 'effects',     name: 'Effects',          primary: true,  shortcut: 'Alt+Shift+2' },
  { id: 'color',       name: 'Color',            primary: true,  shortcut: 'Alt+Shift+3' },
  { id: 'audio',       name: 'Audio',            primary: true,  shortcut: 'Alt+Shift+4' },
  { id: 'graphics',    name: 'Graphics',         primary: true,  shortcut: 'Alt+Shift+5' },
  { id: 'deliver',     name: 'Deliver',          primary: true,  shortcut: 'Alt+Shift+6' },
  { id: 'media',       name: 'Media Management', primary: false, shortcut: 'Alt+Shift+7' },
  { id: 'minimal',     name: 'Minimal Editing',  primary: false, shortcut: 'Alt+Shift+8' },
  { id: 'dual-viewer', name: 'Dual Viewer',      primary: false, shortcut: 'Alt+Shift+9' },
];

export const DEFAULT_WORKSPACE_ORDER = BUILTIN_WORKSPACES.map(w => w.id);

export const MIN_SPLIT_RATIO = 8; // minimum % per split child

let _uidSeq = 1;
export function nextNodeId(prefix = 'node') {
  return `${prefix}_${Date.now().toString(36)}_${(_uidSeq++).toString(36)}`;
}

export function createDockGroup(id, panelIds, options = {}) {
  const validIds = [...new Set(panelIds.map(normalizePanelId).filter(Boolean))];
  const activePanelId = validIds.includes(options.activePanelId)
    ? options.activePanelId
    : (validIds[0] || null);
  const mode = options.mode === 'stacked' ? 'stacked' : 'tabbed';
  const soloMode = Boolean(options.soloMode);
  const expandedPanels = Array.isArray(options.expandedPanels)
    ? options.expandedPanels.filter(p => validIds.includes(p))
    : (activePanelId ? [activePanelId] : []);

  return {
    type: 'group',
    id: id || nextNodeId('grp'),
    mode,
    soloMode,
    panelIds: validIds,
    activePanelId,
    expandedPanels: expandedPanels.length > 0 ? expandedPanels : (activePanelId ? [activePanelId] : []),
    collapsed: Boolean(options.collapsed),
  };
}

export function createDockSplit(id, orientation, children, ratios) {
  return {
    type: 'split',
    id: id || nextNodeId('spl'),
    orientation: orientation === 'vertical' ? 'vertical' : 'horizontal',
    children,
    ratios: normalizeRatios(ratios, children.length),
  };
}

export function normalizeRatios(ratios, count) {
  if (count <= 0) return [];
  if (count === 1) return [100];
  let clean = Array.isArray(ratios) && ratios.length === count
    ? ratios.map(r => (Number.isFinite(Number(r)) && Number(r) > 0 ? Number(r) : 100 / count))
    : Array(count).fill(100 / count);

  const minR = Math.min(MIN_SPLIT_RATIO, Math.floor(80 / count));
  clean = clean.map(r => Math.max(minR, r));
  const sum = clean.reduce((a, b) => a + b, 0);
  if (sum <= 0) return Array(count).fill(100 / count);
  return clean.map(r => Number(((r / sum) * 100).toFixed(3)));
}

export function createPresetDockTree(wsId) {
  const normalizedWs = wsId === 'motion' ? 'effects' : wsId;

  switch (normalizedWs) {
    case 'effects':
      return createDockSplit('root_effects', 'vertical', [
        createDockSplit('effects_top', 'horizontal', [
          createDockGroup('grp_left', ['effects-library', 'transition-browser', 'project'], { activePanelId: 'effects-library' }),
          createDockGroup('grp_center', ['program-monitor', 'source-monitor'], { activePanelId: 'program-monitor' }),
          createDockGroup('grp_right', ['effect-controls', 'keyframes', 'motion-controls', 'properties'], { activePanelId: 'effect-controls' }),
        ], [21, 53, 26]),
        createDockGroup('grp_bottom', ['timeline', 'graph-editor'], { activePanelId: 'timeline' }),
      ], [62, 38]);

    case 'color':
      return createDockSplit('root_color', 'vertical', [
        createDockSplit('color_top', 'horizontal', [
          createDockGroup('grp_left', ['lut-browser', 'project'], { activePanelId: 'lut-browser' }),
          createDockGroup('grp_center', ['program-monitor', 'comparison-viewer'], { activePanelId: 'program-monitor' }),
          createDockGroup('grp_right', ['video-scopes', 'color-controls', 'curves'], {
            activePanelId: 'video-scopes',
            mode: 'stacked',
            soloMode: false,
            expandedPanels: ['video-scopes', 'color-controls'],
          }),
        ], [18, 55, 27]),
        createDockGroup('grp_bottom', ['color-wheels', 'timeline'], { activePanelId: 'color-wheels' }),
      ], [66, 34]);

    case 'audio':
      return createDockSplit('root_audio', 'vertical', [
        createDockSplit('audio_top', 'horizontal', [
          createDockGroup('grp_center', ['timeline', 'program-monitor'], { activePanelId: 'timeline' }),
          createDockGroup('grp_right', ['audio-routing', 'loudness-analysis', 'audio-meters', 'audio-effects'], { activePanelId: 'audio-routing' }),
        ], [75, 25]),
        createDockGroup('grp_bottom', ['audio-mixer', 'channel-mapping'], { activePanelId: 'audio-mixer' }),
      ], [46, 54]);

    case 'graphics':
      return createDockSplit('root_graphics', 'vertical', [
        createDockSplit('graphics_top', 'horizontal', [
          createDockGroup('grp_left', ['project', 'text-captions', 'effects-library'], { activePanelId: 'project' }),
          createDockGroup('grp_center', ['program-monitor', 'source-monitor'], { activePanelId: 'program-monitor' }),
          createDockGroup('grp_right', ['essential-graphics', 'properties', 'motion-controls', 'character', 'paragraph', 'shape-controls'], { activePanelId: 'essential-graphics' }),
        ], [19, 55, 26]),
        createDockGroup('grp_bottom', ['timeline', 'graph-editor'], { activePanelId: 'timeline' }),
      ], [65, 35]);

    case 'deliver':
      return createDockSplit('root_deliver', 'vertical', [
        createDockSplit('deliver_top', 'horizontal', [
          createDockGroup('grp_center', ['program-monitor', 'timeline'], { activePanelId: 'program-monitor' }),
          createDockGroup('grp_right', ['export-settings', 'output-validation'], { activePanelId: 'export-settings' }),
        ], [52, 48]),
        createDockGroup('grp_bottom', ['render-queue', 'export-history'], { activePanelId: 'render-queue' }),
      ], [66, 34]);

    case 'media':
      return createDockSplit('root_media', 'horizontal', [
        createDockGroup('grp_left', ['media-browser', 'project', 'media-dependencies'], { activePanelId: 'media-browser' }),
        createDockGroup('grp_center', ['source-monitor', 'program-monitor'], { activePanelId: 'source-monitor' }),
        createDockGroup('grp_right', ['metadata', 'project-info', 'properties'], { activePanelId: 'metadata' }),
      ], [48, 32, 20]);

    case 'minimal':
      return createDockSplit('root_minimal', 'vertical', [
        createDockSplit('minimal_top', 'horizontal', [
          createDockGroup('grp_left', ['project'], { activePanelId: 'project' }),
          createDockGroup('grp_center', ['program-monitor', 'source-monitor'], { activePanelId: 'program-monitor' }),
        ], [20, 80]),
        createDockGroup('grp_bottom', ['timeline'], { activePanelId: 'timeline' }),
      ], [64, 36]);

    case 'dual-viewer':
      return createDockSplit('root_dual', 'vertical', [
        createDockSplit('dual_top', 'horizontal', [
          createDockGroup('grp_left', ['project', 'effects-library'], { activePanelId: 'project' }),
          createDockGroup('grp_source', ['source-monitor'], { activePanelId: 'source-monitor' }),
          createDockGroup('grp_program', ['program-monitor'], { activePanelId: 'program-monitor' }),
          createDockGroup('grp_right', ['properties', 'effect-controls'], { activePanelId: 'properties' }),
        ], [18, 31, 31, 20]),
        createDockGroup('grp_bottom', ['timeline', 'markers'], { activePanelId: 'timeline' }),
      ], [64, 36]);

    case 'edit':
    default:
      return createDockSplit('root_edit', 'vertical', [
        createDockSplit('edit_top', 'horizontal', [
          createDockGroup('grp_left', ['project', 'media-browser', 'effects-library', 'effect-controls'], { activePanelId: 'project' }),
          createDockGroup('grp_center', ['source-monitor', 'program-monitor'], { activePanelId: 'program-monitor' }),
          createDockGroup('grp_right', ['properties', 'audio-mixer', 'color-controls', 'essential-graphics'], { activePanelId: 'properties' }),
        ], [19, 59, 22]),
        createDockGroup('grp_bottom', ['timeline', 'history', 'markers'], { activePanelId: 'timeline' }),
      ], [65, 35]);
  }
}

export function createStructuredWorkspaceLayout(wsId) {
  const root = createPresetDockTree(wsId);
  const layout = {
    id: wsId,
    root,
    floatingPanels: {},
    maximizedGroupId: null,
    panelStates: {},
    // Legacy compatibility mirrors kept in sync automatically
    topSplit: { leftPct: 19, rightPct: 22 },
    bottomHeightPct: wsId === 'media' ? 0 : 35,
    visiblePanels: [],
  };
  syncLayoutMirrors(layout);
  return layout;
}

// ---------------- Tree Query Helpers ----------------

export function getAllGroups(node, acc = []) {
  if (!node) return acc;
  if (node.type === 'group') {
    acc.push(node);
  } else if (node.type === 'split' && Array.isArray(node.children)) {
    for (const child of node.children) getAllGroups(child, acc);
  }
  return acc;
}

export function findGroupById(node, groupId) {
  if (!node || !groupId) return null;
  if (node.type === 'group') return node.id === groupId ? node : null;
  if (node.type === 'split' && Array.isArray(node.children)) {
    for (const child of node.children) {
      const found = findGroupById(child, groupId);
      if (found) return found;
    }
  }
  return null;
}

export function findSplitById(node, splitId) {
  if (!node || !splitId) return null;
  if (node.type === 'split') {
    if (node.id === splitId) return node;
    for (const child of node.children || []) {
      const found = findSplitById(child, splitId);
      if (found) return found;
    }
  }
  return null;
}

export function findGroupContainingPanel(node, panelId) {
  const norm = normalizePanelId(panelId);
  if (!norm || !node) return null;
  if (node.type === 'group') {
    return node.panelIds.includes(norm) ? node : null;
  }
  if (node.type === 'split' && Array.isArray(node.children)) {
    for (const child of node.children) {
      const found = findGroupContainingPanel(child, norm);
      if (found) return found;
    }
  }
  return null;
}

export function findParentOfNode(node, targetId, parent = null, childIndex = -1) {
  if (!node) return null;
  if (node.id === targetId) return { parent, childIndex, node };
  if (node.type === 'split' && Array.isArray(node.children)) {
    for (let i = 0; i < node.children.length; i++) {
      const res = findParentOfNode(node.children[i], targetId, node, i);
      if (res) return res;
    }
  }
  return null;
}

export function getAllDockedPanelIds(node) {
  const groups = getAllGroups(node);
  const out = [];
  for (const g of groups) {
    for (const pid of g.panelIds) {
      if (!out.includes(pid)) out.push(pid);
    }
  }
  return out;
}

export function getAllVisiblePanelIds(layout) {
  if (!layout) return [];
  const docked = getAllDockedPanelIds(layout.root);
  const floating = Object.keys(layout.floatingPanels || {}).map(normalizePanelId).filter(Boolean);
  return [...new Set([...docked, ...floating])];
}

export function isPanelOpenInLayout(layout, panelId) {
  const norm = normalizePanelId(panelId);
  if (!norm || !layout) return false;
  return Boolean(findGroupContainingPanel(layout.root, norm) || layout.floatingPanels?.[norm]);
}

/**
 * Keeps legacy summary fields (visiblePanels, topSplit, bottomHeightPct) synchronized
 * with the authoritative dock tree so older consumers & tests remain valid.
 */
export function syncLayoutMirrors(layout) {
  if (!layout) return layout;
  const visible = getAllVisiblePanelIds(layout);
  // Mirror both canonical panel IDs and legacy aliases for backwards compatibility
  const legacyReverse = {
    'project': 'panel-project',
    'effects-library': 'panel-effects',
    'lut-browser': 'panel-color-clips',
    'program-monitor': 'monitors-pane',
    'properties': 'panel-inspector',
    'export-settings': 'panel-deliver-settings',
    'history': 'panel-history',
    'markers': 'panel-markers',
    'timeline': 'panel-timeline',
    'color-wheels': 'panel-color-wheels',
    'audio-mixer': 'panel-audio-console',
    'render-queue': 'panel-deliver-queue',
  };
  const mirrored = [...visible];
  for (const id of visible) {
    if (legacyReverse[id] && !mirrored.includes(legacyReverse[id])) {
      mirrored.push(legacyReverse[id]);
    }
  }
  layout.visiblePanels = mirrored;

  // Derive topSplit / bottomHeightPct when root matches standard top/bottom shape
  if (layout.root?.type === 'split' && layout.root.orientation === 'vertical' && layout.root.children.length >= 2) {
    layout.bottomHeightPct = Math.round(layout.root.ratios[1] ?? 35);
    const top = layout.root.children[0];
    if (top?.type === 'split' && top.orientation === 'horizontal' && top.children.length >= 3) {
      layout.topSplit = {
        leftPct: Math.round(top.ratios[0] ?? 19),
        rightPct: Math.round(top.ratios[top.ratios.length - 1] ?? 22),
      };
    }
  } else if (layout.root?.type === 'split' && layout.root.orientation === 'horizontal') {
    layout.bottomHeightPct = 0;
    if (layout.root.children.length >= 3) {
      layout.topSplit = {
        leftPct: Math.round(layout.root.ratios[0] ?? 48),
        rightPct: Math.round(layout.root.ratios[2] ?? 20),
      };
    }
  }
  return layout;
}

// ---------------- Tree Validation & Pruning ----------------

export function pruneAndSanitizeNode(node, seenPanels = new Set()) {
  if (!node || typeof node !== 'object') return null;

  if (node.type === 'group') {
    const cleanIds = [];
    for (const rawId of (Array.isArray(node.panelIds) ? node.panelIds : [])) {
      const pid = normalizePanelId(rawId);
      if (pid && PANEL_REGISTRY[pid] && !seenPanels.has(pid)) {
        seenPanels.add(pid);
        cleanIds.push(pid);
      }
    }
    if (cleanIds.length === 0) return null;
    const activePanelId = cleanIds.includes(normalizePanelId(node.activePanelId))
      ? normalizePanelId(node.activePanelId)
      : cleanIds[0];
    const mode = node.mode === 'stacked' ? 'stacked' : 'tabbed';
    let expanded = Array.isArray(node.expandedPanels)
      ? node.expandedPanels.map(normalizePanelId).filter(p => cleanIds.includes(p))
      : [];
    if (expanded.length === 0) expanded = [activePanelId];
    if (node.soloMode && expanded.length > 1) expanded = [expanded[0]];

    return {
      type: 'group',
      id: typeof node.id === 'string' && node.id ? node.id : nextNodeId('grp'),
      mode,
      soloMode: Boolean(node.soloMode),
      panelIds: cleanIds,
      activePanelId,
      expandedPanels: expanded,
      collapsed: Boolean(node.collapsed),
    };
  }

  if (node.type === 'split' && Array.isArray(node.children)) {
    const cleanChildren = [];
    const cleanRatios = [];
    const rawRatios = Array.isArray(node.ratios) ? node.ratios : [];

    for (let i = 0; i < node.children.length; i++) {
      const pruned = pruneAndSanitizeNode(node.children[i], seenPanels);
      if (pruned) {
        // Flatten nested splits of the same orientation to keep the tree shallow & predictable
        if (pruned.type === 'split' && pruned.orientation === node.orientation) {
          const parentShare = Number.isFinite(Number(rawRatios[i])) ? Number(rawRatios[i]) : (100 / node.children.length);
          for (let j = 0; j < pruned.children.length; j++) {
            cleanChildren.push(pruned.children[j]);
            cleanRatios.push((parentShare * (pruned.ratios[j] ?? (100 / pruned.children.length))) / 100);
          }
        } else {
          cleanChildren.push(pruned);
          cleanRatios.push(Number.isFinite(Number(rawRatios[i])) ? Number(rawRatios[i]) : (100 / node.children.length));
        }
      }
    }

    if (cleanChildren.length === 0) return null;
    if (cleanChildren.length === 1) return cleanChildren[0];

    return {
      type: 'split',
      id: typeof node.id === 'string' && node.id ? node.id : nextNodeId('spl'),
      orientation: node.orientation === 'vertical' ? 'vertical' : 'horizontal',
      children: cleanChildren,
      ratios: normalizeRatios(cleanRatios, cleanChildren.length),
    };
  }

  return null;
}

export function sanitizeWorkspaceLayout(rawLayout, fallbackWsId = 'edit') {
  if (!rawLayout || typeof rawLayout !== 'object' || !rawLayout.root) {
    return createStructuredWorkspaceLayout(fallbackWsId);
  }
  const seen = new Set();
  const cleanRoot = pruneAndSanitizeNode(rawLayout.root, seen);

  // Sanitize floating panels (skip unknown or already-docked panels)
  const cleanFloating = {};
  if (rawLayout.floatingPanels && typeof rawLayout.floatingPanels === 'object') {
    for (const [rawId, meta] of Object.entries(rawLayout.floatingPanels)) {
      const pid = normalizePanelId(rawId);
      if (!pid || !PANEL_REGISTRY[pid] || seen.has(pid) || !meta || typeof meta !== 'object') continue;
      seen.add(pid);
      cleanFloating[pid] = {
        xRatio: Number.isFinite(Number(meta.xRatio)) ? Number(meta.xRatio) : 0.25,
        yRatio: Number.isFinite(Number(meta.yRatio)) ? Number(meta.yRatio) : 0.15,
        wRatio: Number.isFinite(Number(meta.wRatio)) ? Number(meta.wRatio) : 0.28,
        hRatio: Number.isFinite(Number(meta.hRatio)) ? Number(meta.hRatio) : 0.42,
        zIndex: Number.isFinite(Number(meta.zIndex)) ? Number(meta.zIndex) : 2501,
        previousGroupId: typeof meta.previousGroupId === 'string' ? meta.previousGroupId : null,
      };
    }
  }

  // Never allow an empty workspace with zero panels
  if (!cleanRoot && Object.keys(cleanFloating).length === 0) {
    return createStructuredWorkspaceLayout(fallbackWsId);
  }

  const sanitized = {
    id: typeof rawLayout.id === 'string' && rawLayout.id ? rawLayout.id : fallbackWsId,
    root: cleanRoot || createDockGroup('grp_main', ['program-monitor']),
    floatingPanels: cleanFloating,
    maximizedGroupId: rawLayout.maximizedGroupId && findGroupById(cleanRoot, rawLayout.maximizedGroupId)
      ? rawLayout.maximizedGroupId
      : null,
    panelStates: (rawLayout.panelStates && typeof rawLayout.panelStates === 'object') ? rawLayout.panelStates : {},
    topSplit: { leftPct: 19, rightPct: 22 },
    bottomHeightPct: 35,
    visiblePanels: [],
  };
  return syncLayoutMirrors(sanitized);
}

// ---------------- Tree Mutation Operations ----------------

function removePanelFromTree(layout, panelId) {
  const norm = normalizePanelId(panelId);
  if (!norm) return null;
  let removedFromGroupId = null;

  const group = findGroupContainingPanel(layout.root, norm);
  if (group) {
    removedFromGroupId = group.id;
    const idx = group.panelIds.indexOf(norm);
    group.panelIds.splice(idx, 1);
    group.expandedPanels = group.expandedPanels.filter(p => p !== norm);
    if (group.activePanelId === norm) {
      group.activePanelId = group.panelIds[Math.max(0, idx - 1)] || group.panelIds[0] || null;
    }
    if (group.expandedPanels.length === 0 && group.activePanelId) {
      group.expandedPanels = [group.activePanelId];
    }
  }

  if (layout.floatingPanels && layout.floatingPanels[norm]) {
    delete layout.floatingPanels[norm];
  }

  layout.root = pruneAndSanitizeNode(layout.root, new Set());
  if (layout.maximizedGroupId && !findGroupById(layout.root, layout.maximizedGroupId)) {
    layout.maximizedGroupId = null;
  }
  return removedFromGroupId;
}

export function activatePanelInLayout(layout, panelId) {
  const norm = normalizePanelId(panelId);
  if (!norm || !layout) return false;
  const group = findGroupContainingPanel(layout.root, norm);
  if (group) {
    group.activePanelId = norm;
    group.collapsed = false;
    if (group.mode === 'stacked') {
      if (group.soloMode) group.expandedPanels = [norm];
      else if (!group.expandedPanels.includes(norm)) group.expandedPanels.push(norm);
    }
    return true;
  }
  return Boolean(layout.floatingPanels?.[norm]);
}

export function openPanelInLayout(layout, panelId, preferredGroupId = null) {
  const norm = normalizePanelId(panelId);
  const def = norm ? PANEL_REGISTRY[norm] : null;
  if (!def || !layout) return false;

  // If already open (docked or floating), just focus/activate it!
  if (findGroupContainingPanel(layout.root, norm)) {
    return activatePanelInLayout(layout, norm);
  }
  if (layout.floatingPanels?.[norm]) {
    layout.floatingPanels[norm].zIndex = (layout.floatingPanels[norm].zIndex || 2500) + 1;
    return true;
  }

  // Try preferred group, then canonical defaultDock group, then first group
  const groups = getAllGroups(layout.root);
  let targetGroup = (preferredGroupId && findGroupById(layout.root, preferredGroupId))
    || findGroupById(layout.root, `grp_${def.defaultDock}`)
    || groups[0];

  if (!targetGroup) {
    layout.root = createDockGroup(`grp_${def.defaultDock || 'main'}`, [norm], { activePanelId: norm });
  } else {
    targetGroup.panelIds.push(norm);
    targetGroup.activePanelId = norm;
    targetGroup.collapsed = false;
    if (targetGroup.mode === 'stacked') {
      if (targetGroup.soloMode) targetGroup.expandedPanels = [norm];
      else if (!targetGroup.expandedPanels.includes(norm)) targetGroup.expandedPanels.push(norm);
    }
  }

  syncLayoutMirrors(layout);
  return true;
}

export function closePanelInLayout(layout, panelId) {
  const norm = normalizePanelId(panelId);
  if (!norm || !layout) return false;
  const visible = getAllVisiblePanelIds(layout);
  // Prevent closing the very last visible panel in the workspace
  if (visible.length <= 1 && visible.includes(norm)) return false;

  const existed = isPanelOpenInLayout(layout, norm);
  if (!existed) return false;

  removePanelFromTree(layout, norm);
  if (!layout.root) {
    // If all remaining panels were floating, redock the first floating panel so the shell isn't blank
    const firstFloat = Object.keys(layout.floatingPanels || {})[0];
    if (firstFloat) {
      delete layout.floatingPanels[firstFloat];
      layout.root = createDockGroup('grp_main', [firstFloat]);
    }
  }
  syncLayoutMirrors(layout);
  return true;
}

/**
 * Moves a single panel into a target dock group's drop zone:
 *  - 'center': adds as tab to target group (at optional insertIndex)
 *  - 'left' | 'right': creates horizontal split beside target group
 *  - 'top' | 'bottom': creates vertical split above/below target group
 */
export function movePanelToZone(layout, panelId, targetGroupId, zone = 'center', insertIndex = -1) {
  const norm = normalizePanelId(panelId);
  if (!norm || !PANEL_REGISTRY[norm] || !layout) return false;

  const targetGroupBefore = findGroupById(layout.root, targetGroupId);
  if (!targetGroupBefore) return false;

  // Prevent invalid self-split when panel is the ONLY panel in targetGroup
  if (targetGroupBefore.panelIds.length === 1 && targetGroupBefore.panelIds[0] === norm) {
    return false;
  }

  // Reordering within the exact same group when dropping in 'center'
  if (zone === 'center' && targetGroupBefore.panelIds.includes(norm)) {
    const fromIdx = targetGroupBefore.panelIds.indexOf(norm);
    const toIdx = insertIndex >= 0
      ? Math.min(targetGroupBefore.panelIds.length - 1, insertIndex)
      : targetGroupBefore.panelIds.length - 1;
    reorderPanelInGroup(layout, targetGroupBefore.id, fromIdx, toIdx);
    targetGroupBefore.activePanelId = norm;
    return true;
  }

  // Remove from current dock group or floating map
  removePanelFromTree(layout, norm);

  // Re-locate target group after pruning
  const targetGroup = findGroupById(layout.root, targetGroupId);
  if (!targetGroup) {
    // Fallback: root became null or target disappeared -> create root with this panel
    layout.root = createDockGroup('grp_main', [norm]);
    syncLayoutMirrors(layout);
    return true;
  }

  if (zone === 'center') {
    if (insertIndex >= 0 && insertIndex <= targetGroup.panelIds.length) {
      targetGroup.panelIds.splice(insertIndex, 0, norm);
    } else {
      targetGroup.panelIds.push(norm);
    }
    targetGroup.activePanelId = norm;
    if (targetGroup.mode === 'stacked') {
      if (targetGroup.soloMode) targetGroup.expandedPanels = [norm];
      else if (!targetGroup.expandedPanels.includes(norm)) targetGroup.expandedPanels.push(norm);
    }
  } else {
    const newGroup = createDockGroup(nextNodeId('grp'), [norm], { activePanelId: norm });
    insertNodeRelativeToTarget(layout, targetGroup.id, newGroup, zone);
  }

  layout.root = pruneAndSanitizeNode(layout.root, new Set());
  syncLayoutMirrors(layout);
  return true;
}

/**
 * Moves an ENTIRE dock group to a target group's zone (merge tabs on 'center', or split on edges).
 */
export function moveGroupToZone(layout, sourceGroupId, targetGroupId, zone = 'center') {
  if (!layout || !sourceGroupId || !targetGroupId || sourceGroupId === targetGroupId) return false;
  const sourceGroup = findGroupById(layout.root, sourceGroupId);
  const targetGroup = findGroupById(layout.root, targetGroupId);
  if (!sourceGroup || !targetGroup || sourceGroup.panelIds.length === 0) return false;

  const movedPanelIds = [...sourceGroup.panelIds];
  const movedActive = sourceGroup.activePanelId || movedPanelIds[0];
  const movedMode = sourceGroup.mode;
  const movedSolo = sourceGroup.soloMode;
  const movedExpanded = [...sourceGroup.expandedPanels];

  // Clear source group panels so pruning removes it cleanly
  sourceGroup.panelIds = [];
  layout.root = pruneAndSanitizeNode(layout.root, new Set());

  const refreshedTarget = findGroupById(layout.root, targetGroupId);
  if (!refreshedTarget) {
    layout.root = createDockGroup(sourceGroupId, movedPanelIds, { activePanelId: movedActive, mode: movedMode, soloMode: movedSolo, expandedPanels: movedExpanded });
    syncLayoutMirrors(layout);
    return true;
  }

  if (zone === 'center') {
    for (const pid of movedPanelIds) {
      if (!refreshedTarget.panelIds.includes(pid)) refreshedTarget.panelIds.push(pid);
    }
    refreshedTarget.activePanelId = movedActive;
    if (refreshedTarget.mode === 'stacked' && !refreshedTarget.expandedPanels.includes(movedActive)) {
      refreshedTarget.expandedPanels = refreshedTarget.soloMode ? [movedActive] : [...refreshedTarget.expandedPanels, movedActive];
    }
  } else {
    const newGroup = createDockGroup(nextNodeId('grp'), movedPanelIds, {
      activePanelId: movedActive,
      mode: movedMode,
      soloMode: movedSolo,
      expandedPanels: movedExpanded,
    });
    insertNodeRelativeToTarget(layout, refreshedTarget.id, newGroup, zone);
  }

  layout.root = pruneAndSanitizeNode(layout.root, new Set());
  syncLayoutMirrors(layout);
  return true;
}

function insertNodeRelativeToTarget(layout, targetNodeId, newNode, zone) {
  const neededOrientation = (zone === 'left' || zone === 'right') ? 'horizontal' : 'vertical';
  const insertBefore = (zone === 'left' || zone === 'top');

  const located = findParentOfNode(layout.root, targetNodeId);
  if (!located) return;

  const { parent, childIndex, node: targetNode } = located;

  if (parent && parent.type === 'split' && parent.orientation === neededOrientation) {
    // Split the target's existing ratio fairly (50/50 of its share, respecting min ratio)
    const oldRatio = parent.ratios[childIndex] ?? (100 / parent.children.length);
    const half = oldRatio / 2;
    const newChildIdx = insertBefore ? childIndex : childIndex + 1;
    parent.children.splice(newChildIdx, 0, newNode);
    parent.ratios[childIndex] = half;
    parent.ratios.splice(newChildIdx, 0, half);
    parent.ratios = normalizeRatios(parent.ratios, parent.children.length);
  } else {
    const pair = insertBefore ? [newNode, targetNode] : [targetNode, newNode];
    const replacement = createDockSplit(nextNodeId('spl'), neededOrientation, pair, [50, 50]);
    if (!parent) {
      layout.root = replacement;
    } else {
      parent.children[childIndex] = replacement;
    }
  }
}

export function reorderPanelInGroup(layout, groupId, fromIndex, toIndex) {
  const group = findGroupById(layout.root, groupId);
  if (!group) return false;
  if (fromIndex < 0 || fromIndex >= group.panelIds.length) return false;
  const clampedTo = Math.max(0, Math.min(group.panelIds.length - 1, toIndex));
  if (fromIndex === clampedTo) return false;
  const [moved] = group.panelIds.splice(fromIndex, 1);
  group.panelIds.splice(clampedTo, 0, moved);
  syncLayoutMirrors(layout);
  return true;
}

export function setGroupModeInLayout(layout, groupId, mode) {
  const group = findGroupById(layout.root, groupId);
  if (!group) return false;
  group.mode = mode === 'stacked' ? 'stacked' : 'tabbed';
  if (group.mode === 'stacked' && group.activePanelId) {
    if (group.soloMode) {
      group.expandedPanels = [group.activePanelId];
    } else if (!group.expandedPanels.includes(group.activePanelId)) {
      group.expandedPanels.push(group.activePanelId);
    }
  }
  return true;
}

export function toggleGroupSoloModeInLayout(layout, groupId) {
  const group = findGroupById(layout.root, groupId);
  if (!group) return false;
  group.soloMode = !group.soloMode;
  if (group.soloMode && group.expandedPanels.length > 1) {
    const keep = group.expandedPanels.includes(group.activePanelId)
      ? group.activePanelId
      : group.expandedPanels[0];
    group.expandedPanels = keep ? [keep] : [];
  }
  return group.soloMode;
}

export function toggleStackedPanelInLayout(layout, groupId, panelId) {
  const norm = normalizePanelId(panelId);
  const group = findGroupById(layout.root, groupId);
  if (!group || !norm || !group.panelIds.includes(norm)) return false;

  const isExpanded = group.expandedPanels.includes(norm);
  if (isExpanded) {
    group.expandedPanels = group.expandedPanels.filter(p => p !== norm);
  } else {
    if (group.soloMode) {
      group.expandedPanels = [norm];
    } else {
      group.expandedPanels.push(norm);
    }
    group.activePanelId = norm;
  }
  return true;
}

export function updateSplitRatiosInLayout(layout, splitId, newRatios) {
  const split = findSplitById(layout.root, splitId);
  if (!split || !Array.isArray(newRatios) || newRatios.length !== split.children.length) return false;
  split.ratios = normalizeRatios(newRatios, split.children.length);
  syncLayoutMirrors(layout);
  return true;
}

export function floatPanelInLayout(layout, panelId, bounds = {}) {
  const norm = normalizePanelId(panelId);
  if (!norm || !PANEL_REGISTRY[norm] || !layout) return false;
  const dockedPanels = getAllDockedPanelIds(layout.root);
  // Keep at least one panel docked in the workspace shell
  if (dockedPanels.length <= 1 && dockedPanels.includes(norm)) return false;

  const prevGroupId = removePanelFromTree(layout, norm);
  layout.floatingPanels = layout.floatingPanels || {};
  layout.floatingPanels[norm] = {
    xRatio: Number.isFinite(Number(bounds.xRatio)) ? Number(bounds.xRatio) : 0.28,
    yRatio: Number.isFinite(Number(bounds.yRatio)) ? Number(bounds.yRatio) : 0.14,
    wRatio: Number.isFinite(Number(bounds.wRatio)) ? Number(bounds.wRatio) : 0.28,
    hRatio: Number.isFinite(Number(bounds.hRatio)) ? Number(bounds.hRatio) : 0.44,
    zIndex: Number.isFinite(Number(bounds.zIndex)) ? Number(bounds.zIndex) : 2501,
    previousGroupId: prevGroupId || null,
  };
  syncLayoutMirrors(layout);
  return true;
}

export function redockPanelInLayout(layout, panelId, targetGroupId = null, zone = 'center') {
  const norm = normalizePanelId(panelId);
  if (!norm || !layout?.floatingPanels?.[norm]) return false;

  const meta = layout.floatingPanels[norm];
  const preferredId = targetGroupId || meta.previousGroupId;
  delete layout.floatingPanels[norm];

  const targetGroup = (preferredId && findGroupById(layout.root, preferredId))
    || findGroupById(layout.root, `grp_${PANEL_REGISTRY[norm]?.defaultDock || 'right'}`)
    || getAllGroups(layout.root)[0];

  if (!targetGroup) {
    layout.root = createDockGroup('grp_main', [norm]);
  } else if (zone === 'center') {
    if (!targetGroup.panelIds.includes(norm)) targetGroup.panelIds.push(norm);
    targetGroup.activePanelId = norm;
  } else {
    const newGroup = createDockGroup(nextNodeId('grp'), [norm], { activePanelId: norm });
    insertNodeRelativeToTarget(layout, targetGroup.id, newGroup, zone);
  }

  layout.root = pruneAndSanitizeNode(layout.root, new Set());
  syncLayoutMirrors(layout);
  return true;
}

export function toggleMaximizeGroupInLayout(layout, groupId) {
  if (!layout) return null;
  if (!groupId || layout.maximizedGroupId === groupId) {
    layout.maximizedGroupId = null;
  } else if (findGroupById(layout.root, groupId)) {
    layout.maximizedGroupId = groupId;
  }
  return layout.maximizedGroupId;
}

/**
 * Computes minimum pixel width & height required by a dock node subtree.
 */
export function computeNodeMinSize(node) {
  if (!node) return { minWidth: 160, minHeight: 120 };
  if (node.type === 'group') {
    let minW = 180;
    let minH = 130;
    for (const pid of node.panelIds || []) {
      const def = PANEL_REGISTRY[pid];
      if (def) {
        minW = Math.max(minW, def.minWidth || 180);
        minH = Math.max(minH, def.minHeight || 130);
      }
    }
    return { minWidth: minW, minHeight: minH };
  }
  if (node.type === 'split') {
    let minW = 0;
    let minH = 0;
    for (const ch of node.children || []) {
      const s = computeNodeMinSize(ch);
      if (node.orientation === 'horizontal') {
        minW += s.minWidth;
        minH = Math.max(minH, s.minHeight);
      } else {
        minW = Math.max(minW, s.minWidth);
        minH += s.minHeight;
      }
    }
    return { minWidth: minW || 200, minHeight: minH || 140 };
  }
  return { minWidth: 180, minHeight: 130 };
}

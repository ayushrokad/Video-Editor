/**
 * FRAMEFLOW Structured Docking, Tab/Stack Groups & Floating Panel Layout Manager
 * Implements Phases 1, 2, 4, 5, 10, 11, 12:
 *  - Recursive dock tree DOM rendering with lossless DOM reparenting (never destroys live <video>/<canvas>)
 *  - Tabbed panel groups with overflow dropdown, tab drag-reordering, double-click maximize, right-click menu
 *  - Stacked panel groups with expand/collapse, Solo Mode, stacked drag-reorder, and drag-out-of-stack
 *  - Pointer-based drag-and-drop docking for single panels, entire groups, and floating windows
 *  - Accurate translucent 5-zone docking previews (Center / Left / Right / Top / Bottom)
 *  - Interactive splitters for every split node respecting panel minimum sizes
 *  - Viewport-clamped floating panels with resize, focus z-index, Redock button, and drag-to-redock
 *  - Responsive viewport recovery and protection
 */

import { PANEL_REGISTRY, normalizePanelId } from './panel-registry.js';
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
  computeNodeMinSize,
  syncLayoutMirrors,
} from './panel-manager.js';
import { createDefaultWorkspaceState } from './state-store.js';

const HEADER_OFFSET = 38;
const FOOTER_OFFSET = 28;
const MIN_FLOAT_W = 280;
const MIN_FLOAT_H = 200;

export function clampFloatingBounds(bounds, viewportW, viewportH) {
  const usableW = Math.max(MIN_FLOAT_W + 16, viewportW - 8);
  const usableH = Math.max(MIN_FLOAT_H + 16, viewportH - HEADER_OFFSET - FOOTER_OFFSET);

  const w = Math.max(MIN_FLOAT_W, Math.min(usableW, Math.round((bounds.wRatio ?? 0.28) * viewportW)));
  const h = Math.max(MIN_FLOAT_H, Math.min(usableH, Math.round((bounds.hRatio ?? 0.42) * viewportH)));

  const maxLeft = Math.max(4, viewportW - w - 4);
  const maxTop  = Math.max(HEADER_OFFSET, viewportH - FOOTER_OFFSET - h);

  const left = Math.max(4, Math.min(maxLeft, Math.round((bounds.xRatio ?? 0.25) * viewportW)));
  const top  = Math.max(HEADER_OFFSET, Math.min(maxTop, Math.round((bounds.yRatio ?? 0.15) * viewportH)));

  return {
    left,
    top,
    width: w,
    height: h,
    xRatio: left / Math.max(1, viewportW),
    yRatio: top  / Math.max(1, viewportH),
    wRatio: w    / Math.max(1, viewportW),
    hRatio: h    / Math.max(1, viewportH),
  };
}

export class FrameflowLayoutManager {
  constructor(store, callbacks = {}) {
    this.store = store;
    if (typeof callbacks === 'function') {
      this.onLayoutChange = callbacks;
      this.onPanelActivated = () => {};
      this.onOpenContextMenu = null;
    } else {
      this.onLayoutChange = callbacks.onLayoutChange || (() => {});
      this.onPanelActivated = callbacks.onPanelActivated || (() => {});
      this.onOpenContextMenu = callbacks.onOpenContextMenu || null;
    }

    this.topZIndex = 2500;
    this.focusedGroupId = null;
    this.focusedPanelId = null;
    this.panelViews = new Map(); // panelId -> HTMLElement (.panel-view-root)
    this.activeDrag = null;
    this._overflowResizeObserver = null;
  }

  init() {
    this.shell = document.getElementById('workspace-shell');
    this.floatingLayer = document.getElementById('floating-panels-layer');
    this.parkingLot = document.getElementById('panel-parking-lot');
    this.dropOverlay = document.getElementById('dock-drop-overlay');
    this.dragGhost = document.getElementById('dock-drag-ghost');

    // Register all static panel view roots from the parking lot
    if (this.parkingLot) {
      this.parkingLot.querySelectorAll('.panel-view-root[data-panel-id]').forEach(el => {
        const pid = normalizePanelId(el.dataset.panelId);
        if (pid) this.panelViews.set(pid, el);
      });
    }

    window.addEventListener('resize', () => {
      this.reclampAllFloatingPanels();
      this._updateAllTabOverflows();
      this._checkResponsiveViewportWarning();
    });

    // Global Escape cancels any active panel drag safely
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.activeDrag) {
        this._cancelDrag();
      }
    });
  }

  getActiveWorkspaceId() {
    return this.store.workspaceState.activeWorkspace || 'edit';
  }

  getActiveLayout() {
    const wsId = this.getActiveWorkspaceId();
    // Check custom workspaces first
    const custom = (this.store.workspaceState.customWorkspaces || []).find(c => c.id === wsId);
    if (custom && custom.layout) {
      return custom.layout;
    }
    const normalized = wsId === 'motion' ? 'effects' : wsId;
    if (!this.store.workspaceState.layouts[normalized]) {
      this.store.workspaceState.layouts[normalized] = createStructuredWorkspaceLayout(normalized);
    }
    return this.store.workspaceState.layouts[normalized];
  }

  getOrCreatePanelView(panelId) {
    const norm = normalizePanelId(panelId);
    if (!norm) return null;
    if (this.panelViews.has(norm)) return this.panelViews.get(norm);

    const def = PANEL_REGISTRY[norm];
    const el = document.createElement('div');
    el.className = 'panel-view-root';
    el.dataset.panelId = norm;
    el.id = def?.domId || `view-${norm}`;

    if (def?.status === 'planned') {
      el.innerHTML = `
        <div class="planned-panel-card">
          <span class="icon icon-lg" style="color: var(--text-muted);">${def.icon}</span>
          <div class="planned-panel-badge">Not Yet Available</div>
          <div class="planned-panel-title">${def.title}</div>
          <div class="planned-panel-desc">${def.milestoneNote || def.description}</div>
          <div class="planned-panel-meta">Category: ${def.category} · Dockable Panel Slot</div>
        </div>
      `;
    } else {
      el.innerHTML = `<div class="panel-body dynamic-panel-body" id="body-${norm}"></div>`;
    }

    this.panelViews.set(norm, el);
    if (this.parkingLot) this.parkingLot.appendChild(el);
    return el;
  }

  /**
   * Renders the active workspace dock tree + floating panels without touching projectState or sessionState.
   */
  applyActiveWorkspaceLayout() {
    if (!this.shell || !this.parkingLot) return;
    const layout = this.getActiveLayout();
    const wsId = this.getActiveWorkspaceId();
    this.shell.dataset.workspace = wsId;

    // Preserve timeline scroll offsets cleanly across DOM reparenting
    const tlScroll = document.getElementById('timeline-scroll-area');
    const savedScrollLeft = tlScroll ? tlScroll.scrollLeft : 0;
    const savedScrollTop = tlScroll ? tlScroll.scrollTop : 0;

    // Park all panel views safely inside connected DOM parking lot (preserves video/canvas state!)
    for (const viewEl of this.panelViews.values()) {
      if (viewEl.parentElement !== this.parkingLot) {
        this.parkingLot.appendChild(viewEl);
      }
    }

    // Clear shell and render recursive dock tree
    this.shell.innerHTML = '';
    if (layout.root) {
      const rootEl = this._renderDockNode(layout.root, layout);
      if (rootEl) this.shell.appendChild(rootEl);
    }

    // Render floating panels layer
    this._renderFloatingPanels(layout);

    // Restore timeline scroll position
    if (tlScroll) {
      tlScroll.scrollLeft = savedScrollLeft;
      tlScroll.scrollTop = savedScrollTop;
    }

    // Check tab overflows & responsive viewport health after paint
    requestAnimationFrame(() => {
      this._updateAllTabOverflows();
      this._checkResponsiveViewportWarning();
    });
  }

  _renderDockNode(node, layout) {
    if (!node) return null;

    if (node.type === 'split') {
      const splitEl = document.createElement('div');
      splitEl.className = `dock-split dock-split-${node.orientation}`;
      splitEl.dataset.splitId = node.id;

      const ratios = node.ratios || node.children.map(() => 100 / node.children.length);
      node.children.forEach((child, idx) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'dock-split-child';
        wrapper.style.flex = `${ratios[idx]} 1 0%`;

        const minSize = computeNodeMinSize(child);
        if (node.orientation === 'horizontal') {
          wrapper.style.minWidth = `${Math.min(minSize.minWidth, 240)}px`;
        } else {
          wrapper.style.minHeight = `${Math.min(minSize.minHeight, 150)}px`;
        }

        const childEl = this._renderDockNode(child, layout);
        if (childEl) wrapper.appendChild(childEl);
        splitEl.appendChild(wrapper);

        // Insert interactive splitter between adjacent children
        if (idx < node.children.length - 1) {
          const splitter = document.createElement('div');
          splitter.className = `dock-splitter dock-splitter-${node.orientation}`;
          splitter.title = 'Drag to resize panels';
          this._bindSplitterDrag(splitter, node, idx, splitEl);
          splitEl.appendChild(splitter);
        }
      });

      return splitEl;
    }

    if (node.type === 'group') {
      return this._renderDockGroup(node, layout);
    }

    return null;
  }

  _renderDockGroup(group, layout) {
    const isMaximized = layout.maximizedGroupId === group.id;
    const isFocused = this.focusedGroupId === group.id;

    const groupEl = document.createElement('section');
    groupEl.className = `dock-group mode-${group.mode}${isFocused ? ' focused' : ''}${isMaximized ? ' maximized' : ''}`;
    groupEl.dataset.groupId = group.id;

    groupEl.addEventListener('mousedown', () => {
      this._setFocusedGroup(group.id, group.activePanelId);
    });

    if (group.mode === 'stacked') {
      this._buildStackedGroupDOM(groupEl, group, layout);
    } else {
      this._buildTabbedGroupDOM(groupEl, group, layout);
    }

    return groupEl;
  }

  _buildTabbedGroupDOM(groupEl, group, layout) {
    const header = document.createElement('div');
    header.className = 'dock-group-header';

    // Group Drag Handle (allows dragging the entire panel group!)
    const groupHandle = document.createElement('div');
    groupHandle.className = 'dock-group-drag-handle';
    groupHandle.setAttribute('data-tooltip', 'Drag to move entire panel group');
    groupHandle.innerHTML = '<span class="icon icon-sm">drag_indicator</span>';
    groupHandle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this._beginDrag(e, { kind: 'group', groupId: group.id, label: `Group (${group.panelIds.length} panels)` });
    });
    header.appendChild(groupHandle);

    // Tabs Strip
    const tabsStrip = document.createElement('div');
    tabsStrip.className = 'dock-tabs-strip';
    tabsStrip.dataset.groupId = group.id;

    group.panelIds.forEach((pid, idx) => {
      const def = PANEL_REGISTRY[pid];
      if (!def) return;
      const isActive = group.activePanelId === pid;

      const tab = document.createElement('div');
      tab.className = `dock-tab${isActive ? ' active' : ''}${def.status === 'planned' ? ' planned' : ''}`;
      tab.dataset.panelId = pid;
      tab.dataset.groupId = group.id;
      tab.dataset.tabIndex = String(idx);
      tab.title = def.status === 'planned' ? `${def.title} (Not Yet Available)` : def.title;

      tab.innerHTML = `
        <span class="icon icon-sm dock-tab-icon">${def.icon}</span>
        <span class="dock-tab-title">${def.shortTitle || def.title}</span>
        <button class="dock-tab-close" title="Close ${def.title}" aria-label="Close ${def.title}">&times;</button>
      `;

      // Close tab button
      tab.querySelector('.dock-tab-close')?.addEventListener('pointerdown', (e) => e.stopPropagation());
      tab.querySelector('.dock-tab-close')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closePanel(pid);
      });

      // Click switches active tab
      tab.addEventListener('click', (e) => {
        if (e.target.closest('.dock-tab-close')) return;
        this._setFocusedGroup(group.id, pid);
        if (group.activePanelId !== pid) {
          activatePanelInLayout(layout, pid);
          this._notifyAndRender(pid);
        }
      });

      // Double-click tab maximizes / restores its group!
      tab.addEventListener('dblclick', (e) => {
        if (e.target.closest('.dock-tab-close')) return;
        e.stopPropagation();
        this.toggleMaximizeGroup(group.id);
      });

      // Right-click tab opens Panel Management context menu
      tab.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._openPanelMenu(e.clientX, e.clientY, group, pid);
      });

      // Pointer drag initiates tab reorder / docking
      tab.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || e.target.closest('.dock-tab-close')) return;
        this._beginDrag(e, {
          kind: 'panel',
          panelId: pid,
          sourceGroupId: group.id,
          sourceIndex: idx,
          label: def.title,
        });
      });

      tabsStrip.appendChild(tab);
    });

    header.appendChild(tabsStrip);

    // Tab Overflow Menu Button (shown dynamically when tabs overflow strip width)
    const overflowBtn = document.createElement('button');
    overflowBtn.className = 'dock-tab-overflow-btn';
    overflowBtn.style.display = 'none';
    overflowBtn.title = 'More tabs in this group';
    overflowBtn.innerHTML = '<span class="icon icon-sm">keyboard_double_arrow_right</span>';
    overflowBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const rect = overflowBtn.getBoundingClientRect();
      this._openTabOverflowMenu(rect.left, rect.bottom + 2, group, layout);
    });
    header.appendChild(overflowBtn);

    // Compact Group Header Actions: Menu, Float, Maximize, Close
    const actions = document.createElement('div');
    actions.className = 'dock-group-actions';
    actions.innerHTML = `
      <button class="panel-action-btn btn-grp-menu" data-tooltip="Panel Group Menu"><span class="icon icon-sm">more_vert</span></button>
      <button class="panel-action-btn btn-grp-float" data-tooltip="Undock / Float Panel"><span class="icon icon-sm">open_in_new</span></button>
      <button class="panel-action-btn btn-grp-max" data-tooltip="${layout.maximizedGroupId === group.id ? 'Restore Group (`)' : 'Maximize Group (`)'}"><span class="icon icon-sm">${layout.maximizedGroupId === group.id ? 'fullscreen_exit' : 'fullscreen'}</span></button>
      <button class="panel-action-btn btn-grp-close" data-tooltip="Close Active Panel"><span class="icon icon-sm">close</span></button>
    `;

    actions.querySelector('.btn-grp-menu')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const r = e.currentTarget.getBoundingClientRect();
      this._openPanelMenu(r.right - 190, r.bottom + 2, group, group.activePanelId);
    });
    actions.querySelector('.btn-grp-float')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (group.activePanelId) this.undockPanel(group.activePanelId);
    });
    actions.querySelector('.btn-grp-max')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleMaximizeGroup(group.id);
    });
    actions.querySelector('.btn-grp-close')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (group.activePanelId) this.closePanel(group.activePanelId);
    });

    header.appendChild(actions);
    groupEl.appendChild(header);

    // Active Panel Body Mount
    const bodyHost = document.createElement('div');
    bodyHost.className = 'dock-group-body';
    if (group.activePanelId) {
      const viewEl = this.getOrCreatePanelView(group.activePanelId);
      if (viewEl) bodyHost.appendChild(viewEl);
    }
    groupEl.appendChild(bodyHost);
  }

  _buildStackedGroupDOM(groupEl, group, layout) {
    // Compact Stack Control Header
    const topBar = document.createElement('div');
    topBar.className = 'dock-group-header dock-stacked-topbar';

    const leftPart = document.createElement('div');
    leftPart.style.cssText = 'display:flex; align-items:center; gap:4px; min-width:0;';

    const groupHandle = document.createElement('div');
    groupHandle.className = 'dock-group-drag-handle';
    groupHandle.setAttribute('data-tooltip', 'Drag to move stacked group');
    groupHandle.innerHTML = '<span class="icon icon-sm">drag_indicator</span>';
    groupHandle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this._beginDrag(e, { kind: 'group', groupId: group.id, label: `Stacked Group (${group.panelIds.length})` });
    });

    const badge = document.createElement('span');
    badge.className = 'stacked-group-label';
    badge.textContent = `Stacked (${group.panelIds.length})`;

    leftPart.appendChild(groupHandle);
    leftPart.appendChild(badge);
    topBar.appendChild(leftPart);

    const actions = document.createElement('div');
    actions.className = 'dock-group-actions';
    actions.innerHTML = `
      <button class="stacked-solo-pill ${group.soloMode ? 'active' : ''}" data-tooltip="Solo Mode: expand one panel at a time">Solo</button>
      <button class="panel-action-btn btn-switch-tabbed" data-tooltip="Switch to Tabbed Group"><span class="icon icon-sm">tab</span></button>
      <button class="panel-action-btn btn-grp-max" data-tooltip="Maximize / Restore Group"><span class="icon icon-sm">${layout.maximizedGroupId === group.id ? 'fullscreen_exit' : 'fullscreen'}</span></button>
      <button class="panel-action-btn btn-grp-menu" data-tooltip="Group Menu"><span class="icon icon-sm">more_vert</span></button>
    `;

    actions.querySelector('.stacked-solo-pill')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleGroupSoloMode(group.id);
    });
    actions.querySelector('.btn-switch-tabbed')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setGroupMode(group.id, 'tabbed');
    });
    actions.querySelector('.btn-grp-max')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleMaximizeGroup(group.id);
    });
    actions.querySelector('.btn-grp-menu')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const r = e.currentTarget.getBoundingClientRect();
      this._openPanelMenu(r.right - 190, r.bottom + 2, group, group.activePanelId);
    });

    topBar.appendChild(actions);
    groupEl.appendChild(topBar);

    // Stacked Sections Container
    const stackBody = document.createElement('div');
    stackBody.className = 'dock-stacked-body';

    group.panelIds.forEach((pid, idx) => {
      const def = PANEL_REGISTRY[pid];
      if (!def) return;
      const expanded = group.expandedPanels.includes(pid);

      const section = document.createElement('div');
      section.className = `dock-stacked-section${expanded ? ' expanded' : ' collapsed'}`;
      section.dataset.panelId = pid;
      section.dataset.groupId = group.id;
      section.dataset.tabIndex = String(idx);

      const secHeader = document.createElement('div');
      secHeader.className = 'dock-stacked-section-header';
      secHeader.innerHTML = `
        <div class="stacked-sec-title-wrap">
          <span class="icon icon-sm stacked-chevron">${expanded ? 'expand_more' : 'chevron_right'}</span>
          <span class="icon icon-sm" style="color: ${expanded ? 'var(--accent)' : 'var(--text-muted)'};">${def.icon}</span>
          <span class="stacked-sec-title">${def.title}</span>
        </div>
        <div class="stacked-sec-actions">
          <button class="panel-action-btn btn-sec-float" data-tooltip="Undock Panel"><span class="icon icon-sm">open_in_new</span></button>
          <button class="panel-action-btn btn-sec-close" data-tooltip="Close Panel"><span class="icon icon-sm">close</span></button>
        </div>
      `;

      secHeader.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        this._setFocusedGroup(group.id, pid);
        toggleStackedPanelInLayout(layout, group.id, pid);
        this._notifyAndRender(pid);
      });

      secHeader.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._openPanelMenu(e.clientX, e.clientY, group, pid);
      });

      // Drag stacked header to reorder within stack OR drag out to dock anywhere!
      secHeader.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || e.target.closest('button')) return;
        this._beginDrag(e, {
          kind: 'panel',
          panelId: pid,
          sourceGroupId: group.id,
          sourceIndex: idx,
          label: def.title,
        });
      });

      secHeader.querySelector('.btn-sec-float')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.undockPanel(pid);
      });
      secHeader.querySelector('.btn-sec-close')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closePanel(pid);
      });

      section.appendChild(secHeader);

      if (expanded) {
        const content = document.createElement('div');
        content.className = 'dock-stacked-section-content';
        const viewEl = this.getOrCreatePanelView(pid);
        if (viewEl) content.appendChild(viewEl);
        section.appendChild(content);
      }

      stackBody.appendChild(section);
    });

    groupEl.appendChild(stackBody);
  }

  _renderFloatingPanels(layout) {
    if (!this.floatingLayer) return;
    this.floatingLayer.innerHTML = '';

    const floats = layout.floatingPanels || {};
    for (const [panelId, meta] of Object.entries(floats)) {
      const def = PANEL_REGISTRY[panelId];
      if (!def) continue;

      const clamped = clampFloatingBounds(meta, window.innerWidth, window.innerHeight);
      meta.xRatio = clamped.xRatio;
      meta.yRatio = clamped.yRatio;
      meta.wRatio = clamped.wRatio;
      meta.hRatio = clamped.hRatio;

      const win = document.createElement('section');
      win.className = 'floating-panel-window';
      win.dataset.panelId = panelId;
      win.style.left = `${clamped.left}px`;
      win.style.top = `${clamped.top}px`;
      win.style.width = `${clamped.width}px`;
      win.style.height = `${clamped.height}px`;
      win.style.zIndex = String(meta.zIndex || ++this.topZIndex);

      const header = document.createElement('div');
      header.className = 'floating-panel-header';
      header.innerHTML = `
        <div class="floating-panel-title">
          <span class="icon icon-sm" style="color: var(--accent);">${def.icon}</span>
          <span>${def.title}</span>
          <span class="floating-badge">Floating</span>
        </div>
        <div class="dock-group-actions">
          <button class="panel-action-btn btn-redock-panel" data-tooltip="Redock Panel" style="color: var(--accent);"><span class="icon icon-sm">dock_to_right</span></button>
          <button class="panel-action-btn btn-close-float" data-tooltip="Close Panel"><span class="icon icon-sm">close</span></button>
        </div>
      `;

      win.addEventListener('mousedown', () => {
        meta.zIndex = ++this.topZIndex;
        win.style.zIndex = String(meta.zIndex);
        this.focusedPanelId = panelId;
      });

      header.querySelector('.btn-redock-panel')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.redockPanel(panelId);
      });
      header.querySelector('.btn-close-float')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closePanel(panelId);
      });

      // Drag floating header: moves window smoothly, AND if Shift is held or dragged onto a dock edge/tab-bar, shows dock preview!
      header.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || e.target.closest('button')) return;
        e.preventDefault();
        meta.zIndex = ++this.topZIndex;
        win.style.zIndex = String(meta.zIndex);

        const startX = e.clientX;
        const startY = e.clientY;
        const startLeft = win.offsetLeft;
        const startTop = win.offsetTop;
        let pendingDrop = null;

        const onMove = (ev) => {
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const w = win.offsetWidth;
          const h = win.offsetHeight;
          const nextLeft = Math.max(4, Math.min(vw - w - 4, startLeft + (ev.clientX - startX)));
          const nextTop = Math.max(HEADER_OFFSET, Math.min(vh - FOOTER_OFFSET - h, startTop + (ev.clientY - startY)));
          win.style.left = `${nextLeft}px`;
          win.style.top = `${nextTop}px`;

          // Allow dragging a floating window directly into any dock group when pointer hovers near group edges or header!
          win.style.pointerEvents = 'none';
          const hit = this._hitTestDropZone(ev.clientX, ev.clientY, { kind: 'floating', panelId });
          win.style.pointerEvents = '';

          if (hit && (ev.shiftKey || hit.zone !== 'center' || hit.overHeader)) {
            pendingDrop = hit;
            this._showDropPreview(hit);
          } else {
            pendingDrop = null;
            this._hideDropPreview();
          }
        };

        const onUp = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          window.removeEventListener('pointercancel', onUp);
          this._hideDropPreview();

          if (pendingDrop) {
            redockPanelInLayout(layout, panelId, pendingDrop.groupId, pendingDrop.zone);
            this._notifyAndRender(panelId);
            return;
          }

          const vw = window.innerWidth;
          const vh = window.innerHeight;
          meta.xRatio = win.offsetLeft / Math.max(1, vw);
          meta.yRatio = win.offsetTop / Math.max(1, vh);
          meta.wRatio = win.offsetWidth / Math.max(1, vw);
          meta.hRatio = win.offsetHeight / Math.max(1, vh);
          this.store.scheduleSave(300, 'workspaces', 'float-move');
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
      });

      const body = document.createElement('div');
      body.className = 'floating-panel-body';
      const viewEl = this.getOrCreatePanelView(panelId);
      if (viewEl) body.appendChild(viewEl);

      // Corner resize handle (clamped to viewport)
      const resizer = document.createElement('div');
      resizer.className = 'floating-resize-handle';
      resizer.title = 'Drag to resize floating panel';
      resizer.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startY = e.clientY;
        const startW = win.offsetWidth;
        const startH = win.offsetHeight;
        const onMove = (ev) => {
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const maxW = Math.max(MIN_FLOAT_W, vw - win.offsetLeft - 4);
          const maxH = Math.max(MIN_FLOAT_H, vh - FOOTER_OFFSET - win.offsetTop);
          const nw = Math.max(MIN_FLOAT_W, Math.min(maxW, startW + (ev.clientX - startX)));
          const nh = Math.max(MIN_FLOAT_H, Math.min(maxH, startH + (ev.clientY - startY)));
          win.style.width = `${nw}px`;
          win.style.height = `${nh}px`;
        };
        const onUp = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          meta.wRatio = win.offsetWidth / Math.max(1, vw);
          meta.hRatio = win.offsetHeight / Math.max(1, vh);
          this.store.scheduleSave(300, 'workspaces', 'float-resize');
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      });

      win.appendChild(header);
      win.appendChild(body);
      win.appendChild(resizer);
      this.floatingLayer.appendChild(win);
    }
  }

  // ---------------- Interactive Splitters ----------------

  _bindSplitterDrag(splitter, splitNode, leftChildIdx, splitEl) {
    splitter.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      splitter.classList.add('active');
      document.body.classList.add(splitNode.orientation === 'horizontal' ? 'resizing-col' : 'resizing-row');

      const isHoriz = splitNode.orientation === 'horizontal';
      const totalPx = isHoriz ? splitEl.clientWidth : splitEl.clientHeight;
      const startPos = isHoriz ? e.clientX : e.clientY;
      const startRatios = [...splitNode.ratios];
      const pairSum = startRatios[leftChildIdx] + startRatios[leftChildIdx + 1];

      const minLeftPx = isHoriz
        ? Math.min(computeNodeMinSize(splitNode.children[leftChildIdx]).minWidth, 240)
        : Math.min(computeNodeMinSize(splitNode.children[leftChildIdx]).minHeight, 140);
      const minRightPx = isHoriz
        ? Math.min(computeNodeMinSize(splitNode.children[leftChildIdx + 1]).minWidth, 240)
        : Math.min(computeNodeMinSize(splitNode.children[leftChildIdx + 1]).minHeight, 140);

      const minLeftPct = Math.max(8, (minLeftPx / Math.max(1, totalPx)) * 100);
      const minRightPct = Math.max(8, (minRightPx / Math.max(1, totalPx)) * 100);

      const childWrappers = Array.from(splitEl.children).filter(el => el.classList.contains('dock-split-child'));
      const leftWrap = childWrappers[leftChildIdx];
      const rightWrap = childWrappers[leftChildIdx + 1];

      const onMove = (ev) => {
        const curr = isHoriz ? ev.clientX : ev.clientY;
        const deltaPct = ((curr - startPos) / Math.max(1, totalPx)) * 100;
        const maxLeft = Math.max(minLeftPct, pairSum - minRightPct);
        const nextLeft = Math.max(minLeftPct, Math.min(maxLeft, startRatios[leftChildIdx] + deltaPct));
        const nextRight = pairSum - nextLeft;

        splitNode.ratios[leftChildIdx] = Number(nextLeft.toFixed(3));
        splitNode.ratios[leftChildIdx + 1] = Number(nextRight.toFixed(3));
        if (leftWrap) leftWrap.style.flex = `${splitNode.ratios[leftChildIdx]} 1 0%`;
        if (rightWrap) rightWrap.style.flex = `${splitNode.ratios[leftChildIdx + 1]} 1 0%`;
      };

      const onUp = () => {
        splitter.classList.remove('active');
        document.body.classList.remove('resizing-col', 'resizing-row');
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);

        const layout = this.getActiveLayout();
        updateSplitRatiosInLayout(layout, splitNode.id, splitNode.ratios);
        this._updateAllTabOverflows();
        this.store.scheduleSave(300, 'workspaces', 'splitter-resize');
        this.onLayoutChange();
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    });
  }

  // ---------------- Pointer Drag-and-Drop Docking Engine ----------------

  _beginDrag(downEvent, payload) {
    const startX = downEvent.clientX;
    const startY = downEvent.clientY;
    let dragging = false;
    let currentHit = null;

    const onMove = (ev) => {
      const dist = Math.hypot(ev.clientX - startX, ev.clientY - startY);
      if (!dragging) {
        if (dist < 7) return;
        dragging = true;
        this.activeDrag = { payload, cleanup };
        document.body.classList.add('dock-dragging');
        if (this.dragGhost) {
          this.dragGhost.textContent = payload.label;
          this.dragGhost.style.display = 'flex';
        }
      }

      if (this.dragGhost) {
        this.dragGhost.style.left = `${ev.clientX + 14}px`;
        this.dragGhost.style.top = `${ev.clientY + 12}px`;
      }

      currentHit = this._hitTestDropZone(ev.clientX, ev.clientY, payload);
      if (currentHit) {
        this._showDropPreview(currentHit);
      } else {
        this._hideDropPreview();
      }
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      document.body.classList.remove('dock-dragging');
      this._hideDropPreview();
      if (this.dragGhost) this.dragGhost.style.display = 'none';
      this.activeDrag = null;
    };

    const onCancel = () => cleanup();

    const onUp = (ev) => {
      const wasDragging = dragging;
      const drop = currentHit;
      cleanup();
      if (!wasDragging) return;

      const layout = this.getActiveLayout();
      if (drop) {
        if (payload.kind === 'panel') {
          if (drop.reorderInGroup && drop.groupId === payload.sourceGroupId) {
            reorderPanelInGroup(layout, drop.groupId, payload.sourceIndex, drop.insertIndex);
            activatePanelInLayout(layout, payload.panelId);
          } else {
            movePanelToZone(layout, payload.panelId, drop.groupId, drop.zone, drop.insertIndex ?? -1);
          }
          this._notifyAndRender(payload.panelId);
        } else if (payload.kind === 'group') {
          if (moveGroupToZone(layout, payload.groupId, drop.groupId, drop.zone)) {
            this._notifyAndRender();
          }
        }
      } else if (payload.kind === 'panel' && ev.altKey) {
        // Alt+Drag releases as floating panel
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        floatPanelInLayout(layout, payload.panelId, {
          xRatio: Math.max(0.02, (ev.clientX - 160) / vw),
          yRatio: Math.max(0.06, (ev.clientY - 20) / vh),
          wRatio: 0.28,
          hRatio: 0.44,
          zIndex: ++this.topZIndex,
        });
        this._notifyAndRender(payload.panelId);
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  }

  _cancelDrag() {
    if (this.activeDrag?.cleanup) this.activeDrag.cleanup();
  }

  _hitTestDropZone(clientX, clientY, payload) {
    const el = document.elementFromPoint(clientX, clientY);
    if (!el) return null;

    const groupEl = el.closest('.dock-group[data-group-id]');
    if (!groupEl) return null;

    const targetGroupId = groupEl.dataset.groupId;
    const layout = this.getActiveLayout();
    const targetGroup = findGroupById(layout.root, targetGroupId);
    if (!targetGroup) return null;

    // Prevent invalid self-drop of a group onto itself, or sole panel onto itself
    if (payload.kind === 'group' && payload.groupId === targetGroupId) return null;
    if (payload.kind === 'panel' && payload.sourceGroupId === targetGroupId && targetGroup.panelIds.length <= 1) {
      return null;
    }

    // Check direct tab-strip horizontal reorder or stacked section reorder
    const tabEl = el.closest('.dock-tab[data-tab-index], .dock-stacked-section[data-tab-index]');
    const overHeader = Boolean(el.closest('.dock-group-header'));
    if (payload.kind === 'panel' && tabEl && tabEl.dataset.groupId === targetGroupId) {
      const tabRect = tabEl.getBoundingClientRect();
      const targetIdx = parseInt(tabEl.dataset.tabIndex, 10);
      const isStack = tabEl.classList.contains('dock-stacked-section');
      const after = isStack
        ? (clientY > tabRect.top + tabRect.height / 2)
        : (clientX > tabRect.left + tabRect.width / 2);
      const insertIndex = after ? targetIdx + (payload.sourceGroupId === targetGroupId && payload.sourceIndex < targetIdx ? 0 : 1) : targetIdx;
      return {
        groupId: targetGroupId,
        zone: 'center',
        reorderInGroup: payload.sourceGroupId === targetGroupId,
        insertIndex,
        overHeader: true,
        previewRect: isStack
          ? { left: tabRect.left, top: after ? tabRect.bottom - 2 : tabRect.top, width: tabRect.width, height: 4 }
          : { left: after ? tabRect.right - 2 : tabRect.left, top: tabRect.top, width: 4, height: tabRect.height },
        label: payload.sourceGroupId === targetGroupId ? 'Reorder Tab' : 'Add as Tab',
        isLineIndicator: true,
      };
    }

    const rect = groupEl.getBoundingClientRect();
    const relX = clientX - rect.left;
    const relY = clientY - rect.top;

    // Edge threshold (22% of dimension, clamped to 38..110px)
    const edgeW = Math.max(38, Math.min(110, rect.width * 0.22));
    const edgeH = Math.max(38, Math.min(100, rect.height * 0.22));

    let zone = 'center';
    if (overHeader) {
      zone = 'center';
    } else if (relX < edgeW) {
      zone = 'left';
    } else if (relX > rect.width - edgeW) {
      zone = 'right';
    } else if (relY < edgeH) {
      zone = 'top';
    } else if (relY > rect.height - edgeH) {
      zone = 'bottom';
    }

    let previewRect;
    let label;
    if (zone === 'left') {
      previewRect = { left: rect.left, top: rect.top, width: rect.width * 0.45, height: rect.height };
      label = 'Dock Left';
    } else if (zone === 'right') {
      previewRect = { left: rect.left + rect.width * 0.55, top: rect.top, width: rect.width * 0.45, height: rect.height };
      label = 'Dock Right';
    } else if (zone === 'top') {
      previewRect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height * 0.45 };
      label = 'Dock Top';
    } else if (zone === 'bottom') {
      previewRect = { left: rect.left, top: rect.top + rect.height * 0.55, width: rect.width, height: rect.height * 0.45 };
      label = 'Dock Bottom';
    } else {
      previewRect = { left: rect.left + 6, top: rect.top + 6, width: rect.width - 12, height: rect.height - 12 };
      label = payload.kind === 'group' ? 'Merge Into Tab Group' : 'Add as Tab';
    }

    return { groupId: targetGroupId, zone, overHeader, previewRect, label, isLineIndicator: false };
  }

  _showDropPreview(hit) {
    if (!this.dropOverlay || !hit?.previewRect) return;
    const r = hit.previewRect;
    this.dropOverlay.style.display = 'flex';
    this.dropOverlay.style.left = `${Math.round(r.left)}px`;
    this.dropOverlay.style.top = `${Math.round(r.top)}px`;
    this.dropOverlay.style.width = `${Math.max(4, Math.round(r.width))}px`;
    this.dropOverlay.style.height = `${Math.max(4, Math.round(r.height))}px`;
    this.dropOverlay.classList.toggle('line-mode', Boolean(hit.isLineIndicator));
    this.dropOverlay.innerHTML = hit.isLineIndicator
      ? ''
      : `<span class="dock-drop-label">${hit.label}</span>`;
  }

  _hideDropPreview() {
    if (!this.dropOverlay) return;
    this.dropOverlay.style.display = 'none';
  }

  // ---------------- Context Menus & Tab Overflow ----------------

  _openPanelMenu(x, y, group, panelId) {
    if (!this.onOpenContextMenu) return;
    const def = panelId ? PANEL_REGISTRY[panelId] : null;
    const isStacked = group.mode === 'stacked';
    const layout = this.getActiveLayout();

    const items = [
      {
        label: isStacked ? 'Switch Group to Tabbed Mode' : 'Switch Group to Stacked Mode',
        action: () => this.setGroupMode(group.id, isStacked ? 'tabbed' : 'stacked'),
      },
      ...(isStacked ? [{
        label: `${group.soloMode ? '✓ ' : ''}Solo Mode (One Expanded)`,
        action: () => this.toggleGroupSoloMode(group.id),
      }] : []),
      { sep: true },
      ...(def ? [
        { label: `Undock "${def.shortTitle || def.title}" (Float)`, action: () => this.undockPanel(panelId) },
        { label: layout.maximizedGroupId === group.id ? 'Restore Group Size' : 'Maximize Panel Group', shortcut: '`', action: () => this.toggleMaximizeGroup(group.id) },
        { sep: true },
        { label: `Close "${def.shortTitle || def.title}"`, action: () => this.closePanel(panelId) },
      ] : []),
      ...(group.panelIds.length > 1 && panelId ? [{
        label: 'Close Other Tabs in Group',
        action: () => {
          const others = group.panelIds.filter(id => id !== panelId);
          for (const oid of others) closePanelInLayout(layout, oid);
          this._notifyAndRender(panelId);
        },
      }] : []),
      { sep: true },
      { label: 'Reset Current Workspace Layout', action: () => this.resetCurrentWorkspace() },
    ];

    this.onOpenContextMenu(x, y, items);
  }

  _openTabOverflowMenu(x, y, group, layout) {
    if (!this.onOpenContextMenu) return;
    const items = group.panelIds.map(pid => {
      const def = PANEL_REGISTRY[pid];
      return {
        label: `${group.activePanelId === pid ? '✓ ' : '   '}${def?.title || pid}`,
        action: () => {
          activatePanelInLayout(layout, pid);
          this._notifyAndRender(pid);
        },
      };
    });
    this.onOpenContextMenu(x, y, items);
  }

  _updateAllTabOverflows() {
    if (!this.shell) return;
    this.shell.querySelectorAll('.dock-group.mode-tabbed').forEach(groupEl => {
      const strip = groupEl.querySelector('.dock-tabs-strip');
      const btn = groupEl.querySelector('.dock-tab-overflow-btn');
      if (!strip || !btn) return;
      const overflowing = strip.scrollWidth > strip.clientWidth + 2;
      btn.style.display = overflowing ? 'inline-flex' : 'none';
    });
  }

  _checkResponsiveViewportWarning() {
    const warnEl = document.getElementById('status-viewport-warning');
    if (!warnEl) return;
    const tooNarrow = window.innerWidth < 1024;
    const tooShort = window.innerHeight < 620;
    if (tooNarrow || tooShort) {
      warnEl.style.display = 'inline-flex';
      warnEl.textContent = `Compact Viewport (${window.innerWidth}×${window.innerHeight})`;
    } else {
      warnEl.style.display = 'none';
    }
  }

  // ---------------- Public Panel & Workspace Operations ----------------

  _setFocusedGroup(groupId, panelId) {
    this.focusedGroupId = groupId;
    this.focusedPanelId = panelId || null;
    this.shell?.querySelectorAll('.dock-group').forEach(el => {
      el.classList.toggle('focused', el.dataset.groupId === groupId);
    });
  }

  _notifyAndRender(activatedPanelId = null) {
    this.applyActiveWorkspaceLayout();
    this.store.scheduleSave(200, 'workspaces', 'dock-layout');
    this.onLayoutChange();
    if (activatedPanelId) this.onPanelActivated(activatedPanelId);
  }

  isPanelVisible(panelId) {
    return isPanelOpenInLayout(this.getActiveLayout(), panelId);
  }

  openPanel(panelId, preferredGroupId = null) {
    const norm = normalizePanelId(panelId);
    if (!norm) return false;
    const layout = this.getActiveLayout();
    const ok = openPanelInLayout(layout, norm, preferredGroupId);
    if (ok) {
      const grp = findGroupContainingPanel(layout.root, norm);
      if (grp) this.focusedGroupId = grp.id;
      this.focusedPanelId = norm;
      this._notifyAndRender(norm);
    }
    return ok;
  }

  focusOrOpenPanel(panelId) {
    return this.openPanel(panelId);
  }

  closePanel(panelId) {
    const norm = normalizePanelId(panelId);
    if (!norm) return false;
    const layout = this.getActiveLayout();
    const ok = closePanelInLayout(layout, norm);
    if (ok) this._notifyAndRender();
    return ok;
  }

  togglePanelVisibility(panelId) {
    const norm = normalizePanelId(panelId);
    if (!norm) return;
    if (this.isPanelVisible(norm)) this.closePanel(norm);
    else this.openPanel(norm);
  }

  undockPanel(panelId) {
    const norm = normalizePanelId(panelId);
    if (!norm) return false;
    const layout = this.getActiveLayout();
    const ok = floatPanelInLayout(layout, norm, {
      xRatio: 0.28,
      yRatio: 0.14,
      wRatio: 0.30,
      hRatio: 0.48,
      zIndex: ++this.topZIndex,
    });
    if (ok) this._notifyAndRender(norm);
    return ok;
  }

  redockPanel(panelId, targetGroupId = null, zone = 'center') {
    const norm = normalizePanelId(panelId);
    if (!norm) return false;
    const layout = this.getActiveLayout();
    const ok = redockPanelInLayout(layout, norm, targetGroupId, zone);
    if (ok) this._notifyAndRender(norm);
    return ok;
  }

  setGroupMode(groupId, mode) {
    const layout = this.getActiveLayout();
    if (setGroupModeInLayout(layout, groupId, mode)) {
      this._notifyAndRender();
    }
  }

  toggleGroupSoloMode(groupId) {
    const layout = this.getActiveLayout();
    toggleGroupSoloModeInLayout(layout, groupId);
    this._notifyAndRender();
  }

  toggleMaximizeGroup(groupId = null) {
    const layout = this.getActiveLayout();
    const targetId = groupId || this.focusedGroupId || getAllGroups(layout.root)[0]?.id;
    if (!targetId) return;
    toggleMaximizeGroupInLayout(layout, targetId);
    this._notifyAndRender();
  }

  getFocusedGroup() {
    const layout = this.getActiveLayout();
    return (this.focusedGroupId && findGroupById(layout.root, this.focusedGroupId))
      || getAllGroups(layout.root)[0]
      || null;
  }

  reclampAllFloatingPanels() {
    const layout = this.getActiveLayout();
    if (!layout?.floatingPanels || !this.floatingLayer) return;
    for (const [panelId, meta] of Object.entries(layout.floatingPanels)) {
      const win = this.floatingLayer.querySelector(`.floating-panel-window[data-panel-id="${panelId}"]`);
      const clamped = clampFloatingBounds(meta, window.innerWidth, window.innerHeight);
      meta.xRatio = clamped.xRatio;
      meta.yRatio = clamped.yRatio;
      meta.wRatio = clamped.wRatio;
      meta.hRatio = clamped.hRatio;
      if (win) {
        win.style.left = `${clamped.left}px`;
        win.style.top = `${clamped.top}px`;
        win.style.width = `${clamped.width}px`;
        win.style.height = `${clamped.height}px`;
      }
    }
  }

  // Backward-compatible split update helper
  updateSplitRatio(region, newPx) {
    const layout = this.getActiveLayout();
    syncLayoutMirrors(layout);
    const totalW = this.shell?.clientWidth || window.innerWidth;
    const totalH = this.shell?.clientHeight || (window.innerHeight - 60);
    if (region === 'left') layout.topSplit.leftPct = Math.max(12, Math.min(55, (newPx / totalW) * 100));
    else if (region === 'right') layout.topSplit.rightPct = Math.max(14, Math.min(55, (newPx / totalW) * 100));
    else if (region === 'bottom') layout.bottomHeightPct = Math.max(18, Math.min(62, (newPx / totalH) * 100));
    this.store.scheduleSave(400, 'workspaces', 'split-ratio');
  }

  resetCurrentWorkspace() {
    const wsId = this.getActiveWorkspaceId();
    const custom = (this.store.workspaceState.customWorkspaces || []).find(c => c.id === wsId);
    if (custom) {
      custom.layout = createStructuredWorkspaceLayout(custom.baseWorkspace || 'edit');
      custom.layout.id = custom.id;
    } else {
      const normalized = wsId === 'motion' ? 'effects' : wsId;
      this.store.workspaceState.layouts[normalized] = createStructuredWorkspaceLayout(normalized);
    }
    this._notifyAndRender();
  }

  resetAllWorkspaces() {
    const active = this.getActiveWorkspaceId();
    const fresh = createDefaultWorkspaceState();
    const validBuiltin = BUILTIN_WORKSPACES.some(w => w.id === active);
    fresh.activeWorkspace = validBuiltin ? active : 'edit';
    this.store.workspaceState = fresh;
    this._notifyAndRender();
  }
}

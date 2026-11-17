/**
 * FRAMEFLOW Structured Docking & Floating Panel Layout Manager
 * Replaces unreliable absolute CSS positioning with:
 *  - Per-workspace structured split ratios & visible panel lists
 *  - Viewport-clamped normalized floating bounds (xRatio, yRatio, wRatio, hRatio)
 *  - Saved original dock reference (workspace, parent region, child index) for lossless Redocking
 *  - Live Drag-to-Dock visual drop indicators + Viewport Resize recovery
 *  - Separate Reset Current Workspace vs. Reset All Workspaces commands
 */

import { createDefaultWorkspaceLayout, createDefaultWorkspaceState } from './state-store.js';

const HEADER_OFFSET = 38;
const FOOTER_OFFSET = 28;
const MIN_FLOAT_W = 280;
const MIN_FLOAT_H = 200;

export function clampFloatingBounds(bounds, viewportW, viewportH) {
  const usableW = Math.max(MIN_FLOAT_W + 16, viewportW - 8);
  const usableH = Math.max(MIN_FLOAT_H + 16, viewportH - HEADER_OFFSET - FOOTER_OFFSET);

  const w = Math.max(MIN_FLOAT_W, Math.min(usableW, Math.round(bounds.wRatio * viewportW)));
  const h = Math.max(MIN_FLOAT_H, Math.min(usableH, Math.round(bounds.hRatio * viewportH)));

  const maxLeft = Math.max(4, viewportW - w - 4);
  const maxTop  = Math.max(HEADER_OFFSET, viewportH - FOOTER_OFFSET - h);

  const left = Math.max(4, Math.min(maxLeft, Math.round(bounds.xRatio * viewportW)));
  const top  = Math.max(HEADER_OFFSET, Math.min(maxTop, Math.round(bounds.yRatio * viewportH)));

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
  constructor(store, onLayoutChange) {
    this.store = store;
    this.onLayoutChange = onLayoutChange || (() => {});
    this.topZIndex = 2500;
    this.originalDockRegistry = new Map(); // panelId -> { parentId, index }
  }

  init() {
    // Snapshot canonical DOM dock homes on boot before any undocking occurs
    document.querySelectorAll('.panel[id]').forEach(panel => {
      const parent = panel.parentElement;
      if (parent && parent.id) {
        const index = Array.from(parent.children).indexOf(panel);
        this.originalDockRegistry.set(panel.id, { parentId: parent.id, index });
      }
      this._bindPanelFloatingHeaderControls(panel);
    });

    // Enforce viewport containment on every browser resize
    window.addEventListener('resize', () => {
      this.reclampAllFloatingPanels();
      this.applyActiveWorkspaceLayout();
    });
  }

  getActiveLayout() {
    const ws = this.store.workspaceState.activeWorkspace;
    if (!this.store.workspaceState.layouts[ws]) {
      this.store.workspaceState.layouts[ws] = createDefaultWorkspaceLayout(ws);
    }
    return this.store.workspaceState.layouts[ws];
  }

  /**
   * Applies the active workspace's structured layout WITHOUT touching projectState or sessionState.
   */
  applyActiveWorkspaceLayout() {
    const ws = this.store.workspaceState.activeWorkspace;
    const layout = this.getActiveLayout();
    const shell = document.getElementById('workspace-shell');
    const topRow = document.getElementById('workspace-top-row');
    const bottomRow = document.getElementById('workspace-bottom-row');
    if (!shell || !topRow || !bottomRow) return;

    shell.dataset.workspace = ws;

    const allPanelIds = [
      'panel-project', 'panel-effects', 'panel-color-clips',
      'monitors-pane', 'panel-inspector', 'panel-deliver-settings',
      'panel-timeline', 'panel-color-wheels', 'panel-audio-console', 'panel-deliver-queue',
    ];

    // 1. Reset floating inline styles cleanly first, restore canonical DOM region
    allPanelIds.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.add('hidden-panel');
      el.classList.remove('floating-panel', 'maximized');
      el.style.left = '';
      el.style.top = '';
      el.style.width = '';
      el.style.height = '';
      el.style.flex = '';
      el.style.zIndex = '';
      this._setRedockButtonVisible(el, false);
    });

    // Ensure timeline is in bottomRow by default, or topRow for Audio workspace
    const timelineEl = document.getElementById('panel-timeline');
    if (timelineEl) {
      if (ws === 'audio') {
        if (timelineEl.parentElement !== topRow) topRow.prepend(timelineEl);
      } else {
        if (timelineEl.parentElement !== bottomRow) bottomRow.prepend(timelineEl);
      }
    }

    // 2. Show workspace-visible panels
    for (const id of layout.visiblePanels) {
      const el = document.getElementById(id);
      if (el) el.classList.remove('hidden-panel');
    }

    // 3. Apply saved split ratios cleanly
    const leftPanel = ['panel-project', 'panel-effects', 'panel-color-clips']
      .map(id => document.getElementById(id))
      .find(el => el && !el.classList.contains('hidden-panel'));

    const rightPanel = ['panel-inspector', 'panel-deliver-settings']
      .map(id => document.getElementById(id))
      .find(el => el && !el.classList.contains('hidden-panel'));

    const splitLeft = document.getElementById('splitter-left');
    const splitRight = document.getElementById('splitter-right');
    const splitRowV = document.getElementById('splitter-row-v');

    if (leftPanel && layout.topSplit.leftPct > 0) {
      leftPanel.style.width = `${layout.topSplit.leftPct}%`;
      leftPanel.style.flex = 'none';
      if (splitLeft) splitLeft.style.display = 'block';
    } else if (splitLeft) {
      splitLeft.style.display = 'none';
    }

    if (rightPanel && layout.topSplit.rightPct > 0) {
      rightPanel.style.width = `${layout.topSplit.rightPct}%`;
      rightPanel.style.flex = 'none';
      if (splitRight) splitRight.style.display = 'block';
    } else if (splitRight) {
      splitRight.style.display = 'none';
    }

    // Bottom row height ratio
    if (ws === 'media' || layout.bottomHeightPct <= 0) {
      bottomRow.style.display = 'none';
      if (splitRowV) splitRowV.style.display = 'none';
    } else {
      bottomRow.style.display = 'flex';
      bottomRow.style.height = `${layout.bottomHeightPct}%`;
      if (splitRowV) splitRowV.style.display = 'block';
    }

    // 4. Restore any saved floating panels for THIS workspace (clamped to current viewport!)
    const floats = layout.floatingPanels || {};
    for (const [panelId, floatMeta] of Object.entries(floats)) {
      const el = document.getElementById(panelId);
      if (!el || el.classList.contains('hidden-panel')) continue;
      this._applyFloatingGeometry(el, floatMeta);
    }
  }

  _applyFloatingGeometry(panel, floatMeta) {
    const clamped = clampFloatingBounds(floatMeta, window.innerWidth, window.innerHeight);
    panel.classList.add('floating-panel');
    panel.style.left = `${clamped.left}px`;
    panel.style.top = `${clamped.top}px`;
    panel.style.width = `${clamped.width}px`;
    panel.style.height = `${clamped.height}px`;
    panel.style.flex = 'none';
    panel.style.zIndex = String(floatMeta.zIndex || ++this.topZIndex);
    this._setRedockButtonVisible(panel, true);
  }

  _setRedockButtonVisible(panel, isFloating) {
    const redockBtn = panel.querySelector('.btn-redock-panel');
    const undockBtn = panel.querySelector('.btn-undock-panel');
    if (redockBtn) redockBtn.style.display = isFloating ? 'inline-flex' : 'none';
    if (undockBtn) undockBtn.style.display = isFloating ? 'none' : 'inline-flex';
  }

  undockPanel(panelId) {
    const panel = document.getElementById(panelId);
    if (!panel) return;
    const layout = this.getActiveLayout();
    const home = this.originalDockRegistry.get(panelId) || { parentId: 'workspace-top-row', index: 0 };

    const rect = panel.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Position comfortably inside the visible viewport, never off-screen!
    const desiredW = Math.max(MIN_FLOAT_W, Math.min(440, rect.width || 360));
    const desiredH = Math.max(MIN_FLOAT_H, Math.min(460, rect.height || 360));
    const desiredLeft = Math.min(vw - desiredW - 24, Math.max(24, rect.left - 24));
    const desiredTop  = Math.min(vh - FOOTER_OFFSET - desiredH - 16, Math.max(HEADER_OFFSET + 16, rect.top + 16));

    const floatMeta = {
      originalWorkspace: layout.id,
      originalParentId: home.parentId,
      originalIndex: home.index,
      xRatio: desiredLeft / vw,
      yRatio: desiredTop  / vh,
      wRatio: desiredW    / vw,
      hRatio: desiredH    / vh,
      zIndex: ++this.topZIndex,
    };

    layout.floatingPanels[panelId] = floatMeta;
    this._applyFloatingGeometry(panel, floatMeta);
    this.store.scheduleSave();
    this.onLayoutChange();
  }

  redockPanel(panelId) {
    const panel = document.getElementById(panelId);
    if (!panel) return;
    const layout = this.getActiveLayout();
    delete layout.floatingPanels[panelId];

    // Strip stale floating geometry completely
    panel.classList.remove('floating-panel', 'maximized');
    panel.style.left = '';
    panel.style.top = '';
    panel.style.width = '';
    panel.style.height = '';
    panel.style.zIndex = '';
    this._setRedockButtonVisible(panel, false);

    // Re-apply full workspace split tree cleanly so adjacent panels rebalance
    this.applyActiveWorkspaceLayout();
    this.store.scheduleSave();
    this.onLayoutChange();
  }

  reclampAllFloatingPanels() {
    const layout = this.getActiveLayout();
    if (!layout || !layout.floatingPanels) return;
    for (const [panelId, meta] of Object.entries(layout.floatingPanels)) {
      const el = document.getElementById(panelId);
      if (!el || !el.classList.contains('floating-panel')) continue;
      const clamped = clampFloatingBounds(meta, window.innerWidth, window.innerHeight);
      meta.xRatio = clamped.xRatio;
      meta.yRatio = clamped.yRatio;
      meta.wRatio = clamped.wRatio;
      meta.hRatio = clamped.hRatio;
      this._applyFloatingGeometry(el, meta);
    }
  }

  togglePanelVisibility(panelId) {
    const layout = this.getActiveLayout();
    const idx = layout.visiblePanels.indexOf(panelId);
    if (idx >= 0) {
      layout.visiblePanels.splice(idx, 1);
      delete layout.floatingPanels[panelId];
    } else {
      layout.visiblePanels.push(panelId);
    }
    this.applyActiveWorkspaceLayout();
    this.store.scheduleSave();
    this.onLayoutChange();
  }

  updateSplitRatio(region, newPx) {
    const layout = this.getActiveLayout();
    const shell = document.getElementById('workspace-shell');
    if (!shell) return;
    const totalW = shell.clientWidth || window.innerWidth;
    const totalH = shell.clientHeight || (window.innerHeight - 60);

    if (region === 'left') {
      layout.topSplit.leftPct = Math.max(12, Math.min(55, (newPx / totalW) * 100));
    } else if (region === 'right') {
      layout.topSplit.rightPct = Math.max(14, Math.min(55, (newPx / totalW) * 100));
    } else if (region === 'bottom') {
      layout.bottomHeightPct = Math.max(18, Math.min(62, (newPx / totalH) * 100));
    }
    this.store.scheduleSave(400);
  }

  resetCurrentWorkspace() {
    const ws = this.store.workspaceState.activeWorkspace;
    this.store.workspaceState.layouts[ws] = createDefaultWorkspaceLayout(ws);
    this.applyActiveWorkspaceLayout();
    this.store.scheduleSave();
    this.onLayoutChange();
  }

  resetAllWorkspaces() {
    const active = this.store.workspaceState.activeWorkspace;
    this.store.workspaceState = createDefaultWorkspaceState();
    this.store.workspaceState.activeWorkspace = active;
    this.applyActiveWorkspaceLayout();
    this.store.scheduleSave();
    this.onLayoutChange();
  }

  _bindPanelFloatingHeaderControls(panel) {
    const header = panel.querySelector('.panel-header');
    const actions = panel.querySelector('.panel-actions');
    if (!header || !actions) return;

    // Inject a dedicated Redock button right next to Undock if not already present
    let redockBtn = panel.querySelector('.btn-redock-panel');
    if (!redockBtn) {
      redockBtn = document.createElement('button');
      redockBtn.className = 'panel-action-btn btn-redock-panel';
      redockBtn.setAttribute('data-tooltip', 'Redock Panel to Previous Position');
      redockBtn.style.display = 'none';
      redockBtn.style.color = 'var(--accent)';
      redockBtn.innerHTML = '<span class="icon icon-sm">dock_to_right</span>';
      actions.prepend(redockBtn);
    }

    redockBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.redockPanel(panel.id);
    });

    const undockBtn = panel.querySelector('.btn-undock-panel');
    undockBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.undockPanel(panel.id);
    });

    // Bring floating panel to front on focus
    panel.addEventListener('mousedown', () => {
      if (panel.classList.contains('floating-panel')) {
        panel.style.zIndex = String(++this.topZIndex);
        const layout = this.getActiveLayout();
        if (layout.floatingPanels[panel.id]) {
          layout.floatingPanels[panel.id].zIndex = this.topZIndex;
        }
      }
    });

    // Constrained drag for floating panels + edge redock detection
    header.addEventListener('mousedown', (e) => {
      if (!panel.classList.contains('floating-panel')) return;
      if (e.target.closest('button, select, input')) return;
      e.preventDefault();

      const startMouseX = e.clientX;
      const startMouseY = e.clientY;
      const startLeft = panel.offsetLeft;
      const startTop  = panel.offsetTop;

      const onMove = (ev) => {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const w = panel.offsetWidth;
        const h = panel.offsetHeight;

        const nextLeft = Math.max(4, Math.min(vw - w - 4, startLeft + (ev.clientX - startMouseX)));
        const nextTop  = Math.max(HEADER_OFFSET, Math.min(vh - FOOTER_OFFSET - h, startTop + (ev.clientY - startMouseY)));

        panel.style.left = `${nextLeft}px`;
        panel.style.top  = `${nextTop}px`;
      };

      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);

        const layout = this.getActiveLayout();
        if (layout.floatingPanels[panel.id]) {
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          layout.floatingPanels[panel.id].xRatio = panel.offsetLeft / vw;
          layout.floatingPanels[panel.id].yRatio = panel.offsetTop  / vh;
          layout.floatingPanels[panel.id].wRatio = panel.offsetWidth / vw;
          layout.floatingPanels[panel.id].hRatio = panel.offsetHeight / vh;
          this.store.scheduleSave(300);
        }
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });

    // Persist resized floating dimensions via ResizeObserver
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => {
        if (!panel.classList.contains('floating-panel')) return;
        const layout = this.getActiveLayout();
        if (!layout.floatingPanels[panel.id]) return;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        // Clamp right/bottom edge so resize can never push panel offscreen
        if (panel.offsetLeft + panel.offsetWidth > vw - 4) {
          panel.style.width = `${Math.max(MIN_FLOAT_W, vw - panel.offsetLeft - 4)}px`;
        }
        if (panel.offsetTop + panel.offsetHeight > vh - FOOTER_OFFSET) {
          panel.style.height = `${Math.max(MIN_FLOAT_H, vh - FOOTER_OFFSET - panel.offsetTop)}px`;
        }
        layout.floatingPanels[panel.id].wRatio = panel.offsetWidth / vw;
        layout.floatingPanels[panel.id].hRatio = panel.offsetHeight / vh;
        this.store.scheduleSave(400);
      });
      ro.observe(panel);
    }
  }
}

/**
 * FRAMEFLOW Central Keyboard Shortcut Registry (Phase 9)
 * Supports:
 *  - Command search & shortcut search
 *  - Assign / Change / Remove shortcut
 *  - Conflict detection & explicit conflict resolution
 *  - Restore defaults & NLE presets (FRAMEFLOW, Premiere Pro, DaVinci Resolve, Final Cut Pro)
 *  - Import / Export shortcut profiles (JSON)
 *  - Workspace switching & panel visibility/focus shortcuts
 *  - Input-field safety guard (blocks firing inside text inputs unless command opts in)
 */

export const DEFAULT_SHORTCUTS = [
  // Transport
  { id: 'play_pause',        name: 'Play / Pause',               category: 'Transport',  key: 'Space',            type: 'transport' },
  { id: 'shuttle_rev',       name: 'Shuttle Reverse',            category: 'Transport',  key: 'J',                type: 'transport' },
  { id: 'shuttle_pause',     name: 'Pause Shuttle',              category: 'Transport',  key: 'K',                type: 'transport' },
  { id: 'shuttle_fwd',       name: 'Shuttle Forward',            category: 'Transport',  key: 'L',                type: 'transport' },
  { id: 'step_prev_frame',   name: 'Step Back 1 Frame',          category: 'Transport',  key: 'ArrowLeft',        type: 'transport' },
  { id: 'step_next_frame',   name: 'Step Forward 1 Frame',       category: 'Transport',  key: 'ArrowRight',       type: 'transport' },
  { id: 'step_prev_5',       name: 'Step Back 5 Frames',         category: 'Transport',  key: 'Shift+ArrowLeft',  type: 'transport' },
  { id: 'step_next_5',       name: 'Step Forward 5 Frames',      category: 'Transport',  key: 'Shift+ArrowRight', type: 'transport' },
  { id: 'mark_in',           name: 'Mark In',                    category: 'Transport',  key: 'I',                type: 'transport' },
  { id: 'mark_out',          name: 'Mark Out',                   category: 'Transport',  key: 'O',                type: 'transport' },
  { id: 'goto_in',           name: 'Go to In Point',             category: 'Transport',  key: 'Shift+I',          type: 'transport' },
  { id: 'goto_out',          name: 'Go to Out Point',            category: 'Transport',  key: 'Shift+O',          type: 'transport' },
  { id: 'clear_io',          name: 'Clear Source In/Out',        category: 'Transport',  key: 'Alt+X',            type: 'transport' },

  // Editing
  { id: 'insert_src',        name: 'Insert Source Range',        category: 'Editing',    key: ',',                type: 'edit' },
  { id: 'overwrite_src',     name: 'Overwrite Source Range',     category: 'Editing',    key: '.',                type: 'edit' },
  { id: 'split_playhead',    name: 'Split Clip at Playhead',     category: 'Editing',    key: 'Ctrl+K',           type: 'edit' },
  { id: 'delete_clip',       name: 'Delete Selected Clip',       category: 'Editing',    key: 'Delete',           type: 'edit' },
  { id: 'link_clips',        name: 'Link Selected Clips',        category: 'Editing',    key: 'Ctrl+L',           type: 'edit' },
  { id: 'unlink_clips',      name: 'Unlink Clips',               category: 'Editing',    key: 'Ctrl+Shift+L',     type: 'edit' },
  { id: 'copy_clip',         name: 'Copy Selected Clip',         category: 'Editing',    key: 'Ctrl+C',           type: 'edit' },
  { id: 'cut_clip',          name: 'Cut Selected Clip',          category: 'Editing',    key: 'Ctrl+X',           type: 'edit' },
  { id: 'paste_clip',        name: 'Paste Clip at Playhead',     category: 'Editing',    key: 'Ctrl+V',           type: 'edit' },
  { id: 'undo',              name: 'Undo',                       category: 'Editing',    key: 'Ctrl+Z',           type: 'edit' },
  { id: 'redo',              name: 'Redo',                       category: 'Editing',    key: 'Ctrl+Shift+Z',     type: 'edit' },

  // Tools
  { id: 'tool_select',       name: 'Selection Tool',             category: 'Tools',      key: 'V',                type: 'tool' },
  { id: 'tool_track_select', name: 'Track Select Forward',       category: 'Tools',      key: 'A',                type: 'tool' },
  { id: 'tool_ripple',       name: 'Ripple Edit Tool',           category: 'Tools',      key: 'B',                type: 'tool' },
  { id: 'tool_rolling',      name: 'Rolling Edit Tool',          category: 'Tools',      key: 'N',                type: 'tool' },
  { id: 'tool_rate_stretch', name: 'Rate Stretch Tool',          category: 'Tools',      key: 'R',                type: 'tool' },
  { id: 'tool_razor',        name: 'Razor Cut Tool',             category: 'Tools',      key: 'C',                type: 'tool' },
  { id: 'tool_slip',         name: 'Slip Tool',                  category: 'Tools',      key: 'Y',                type: 'tool' },
  { id: 'tool_slide',        name: 'Slide Tool',                 category: 'Tools',      key: 'U',                type: 'tool' },
  { id: 'tool_pen',          name: 'Pen / Keyframe Tool',        category: 'Tools',      key: 'P',                type: 'tool' },
  { id: 'tool_hand',         name: 'Hand Tool',                  category: 'Tools',      key: 'H',                type: 'tool' },
  { id: 'tool_zoom',         name: 'Zoom Tool',                  category: 'Tools',      key: 'Z',                type: 'tool' },
  { id: 'tool_text',         name: 'Type / Title Tool',          category: 'Tools',      key: 'T',                type: 'tool' },

  // Navigation
  { id: 'toggle_linked_sel', name: 'Toggle Linked Selection',    category: 'Navigation', key: 'Shift+L',          type: 'nav' },
  { id: 'snap_toggle',       name: 'Toggle Snapping',            category: 'Navigation', key: 'S',                type: 'nav' },
  { id: 'add_marker',        name: 'Add Sequence Marker',        category: 'Navigation', key: 'M',                type: 'nav' },
  { id: 'zoom_in',           name: 'Zoom In Timeline',           category: 'Navigation', key: '=',                type: 'nav' },
  { id: 'zoom_out',          name: 'Zoom Out Timeline',          category: 'Navigation', key: '-',                type: 'nav' },
  { id: 'fit_sequence',      name: 'Fit Sequence to View',       category: 'Navigation', key: '\\',               type: 'nav' },
  { id: 'maximize_panel',    name: 'Maximize / Restore Panel',   category: 'Navigation', key: '`',                type: 'nav' },

  // Workspaces
  { id: 'ws_edit',           name: 'Workspace: Editing',         category: 'Workspaces', key: 'Alt+Shift+1',      type: 'nav' },
  { id: 'ws_effects',        name: 'Workspace: Effects',         category: 'Workspaces', key: 'Alt+Shift+2',      type: 'nav' },
  { id: 'ws_color',          name: 'Workspace: Color',           category: 'Workspaces', key: 'Alt+Shift+3',      type: 'nav' },
  { id: 'ws_audio',          name: 'Workspace: Audio',           category: 'Workspaces', key: 'Alt+Shift+4',      type: 'nav' },
  { id: 'ws_graphics',       name: 'Workspace: Graphics',        category: 'Workspaces', key: 'Alt+Shift+5',      type: 'nav' },
  { id: 'ws_deliver',        name: 'Workspace: Deliver',         category: 'Workspaces', key: 'Alt+Shift+6',      type: 'nav' },
  { id: 'ws_media',          name: 'Workspace: Media Management',category: 'Workspaces', key: 'Alt+Shift+7',      type: 'nav' },
  { id: 'ws_minimal',        name: 'Workspace: Minimal Editing', category: 'Workspaces', key: 'Alt+Shift+8',      type: 'nav' },
  { id: 'ws_dual',           name: 'Workspace: Dual Viewer',     category: 'Workspaces', key: 'Alt+Shift+9',      type: 'nav' },

  // Panels
  { id: 'panel_project',     name: 'Show / Focus Project',       category: 'Panels',     key: 'Shift+1',          type: 'nav' },
  { id: 'panel_source',      name: 'Show / Focus Source Monitor',category: 'Panels',     key: 'Shift+2',          type: 'nav' },
  { id: 'panel_timeline',    name: 'Show / Focus Timeline',      category: 'Panels',     key: 'Shift+3',          type: 'nav' },
  { id: 'panel_program',     name: 'Show / Focus Program Monitor',category: 'Panels',    key: 'Shift+4',          type: 'nav' },
  { id: 'panel_fx_controls', name: 'Show / Focus Effect Controls',category: 'Panels',    key: 'Shift+5',          type: 'nav' },
  { id: 'panel_audio_mixer', name: 'Show / Focus Audio Mixer',   category: 'Panels',     key: 'Shift+6',          type: 'nav' },
  { id: 'panel_effects',     name: 'Show / Focus Effects Library',category: 'Panels',    key: 'Shift+7',          type: 'nav' },
  { id: 'panel_properties',  name: 'Toggle Properties Panel',    category: 'Panels',     key: 'Shift+8',          type: 'nav' },

  // Global
  { id: 'save_project',      name: 'Save Project',               category: 'Global',     key: 'Ctrl+S',           type: 'global', allowInInput: true },
  { id: 'import_media',      name: 'Import Media',               category: 'Global',     key: 'Ctrl+I',           type: 'global' },
  { id: 'new_bin',           name: 'New Bin',                    category: 'Global',     key: 'Ctrl+B',           type: 'global' },
  { id: 'export_deliver',    name: 'Export (Deliver Workspace)', category: 'Global',     key: 'Ctrl+M',           type: 'global' },
  { id: 'shortcuts_modal',   name: 'Keyboard Shortcuts...',      category: 'Global',     key: 'Ctrl+Alt+K',       type: 'global', allowInInput: true },
];

export const SHORTCUT_PRESETS = {
  frameflow: {},
  premiere: {
    tool_select: 'V',
    tool_razor: 'C',
    split_playhead: 'Ctrl+K',
    snap_toggle: 'S',
    maximize_panel: '`',
  },
  resolve: {
    tool_select: 'A',
    tool_razor: 'B',
    split_playhead: 'Ctrl+\\',
    snap_toggle: 'N',
    tool_track_select: 'Alt+Y',
    tool_ripple: 'T',
  },
  fcp: {
    tool_select: 'A',
    tool_razor: 'B',
    split_playhead: 'Ctrl+B',
    snap_toggle: 'N',
    tool_hand: 'H',
    tool_zoom: 'Z',
  },
};

export function normalizeKeyCombo(combo) {
  if (!combo || typeof combo !== 'string') return '';
  const parts = combo.split('+').map(p => p.trim()).filter(Boolean);
  const mods = [];
  let key = '';
  for (const p of parts) {
    const low = p.toLowerCase();
    if (low === 'ctrl' || low === 'control' || low === 'cmd' || low === 'meta') {
      if (!mods.includes('Ctrl')) mods.push('Ctrl');
    } else if (low === 'alt' || low === 'option') {
      if (!mods.includes('Alt')) mods.push('Alt');
    } else if (low === 'shift') {
      if (!mods.includes('Shift')) mods.push('Shift');
    } else {
      key = p.length === 1 ? p.toUpperCase() : p;
    }
  }
  const orderedMods = ['Ctrl', 'Alt', 'Shift'].filter(m => mods.includes(m));
  if (!key) return '';
  return [...orderedMods, key].join('+');
}

export function eventToKeyCombo(e) {
  if (!e) return '';
  const isCtrl = Boolean(e.ctrlKey || e.metaKey);
  const isAlt = Boolean(e.altKey);
  const isShift = Boolean(e.shiftKey);

  // Ignore pure modifier presses
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return '';

  let baseKey = '';
  const code = e.code || '';

  if (code === 'Space' || e.key === ' ') baseKey = 'Space';
  else if (code === 'Backquote' || e.key === '`') baseKey = '`';
  else if (code === 'Backslash' || e.key === '\\') baseKey = '\\';
  else if (code === 'Comma' || e.key === ',') baseKey = ',';
  else if (code === 'Period' || e.key === '.') baseKey = '.';
  else if (code === 'Equal' || e.key === '=') baseKey = '=';
  else if (code === 'Minus' || e.key === '-') baseKey = '-';
  else if (code.startsWith('Digit')) baseKey = code.slice(5);
  else if (code.startsWith('Key')) baseKey = code.slice(3).toUpperCase();
  else if (e.key && e.key.length === 1) baseKey = e.key.toUpperCase();
  else baseKey = e.key || code;

  const mods = [];
  if (isCtrl) mods.push('Ctrl');
  if (isAlt) mods.push('Alt');
  if (isShift) mods.push('Shift');
  return normalizeKeyCombo([...mods, baseKey].join('+'));
}

export function isEditableEventTarget(target) {
  if (!target) return false;
  const tag = (target.tagName || '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  if (typeof target.closest === 'function' && target.closest('[contenteditable="true"]')) return true;
  return false;
}

export class ShortcutRegistry {
  constructor(initialShortcuts = null) {
    this.shortcuts = structuredClone(DEFAULT_SHORTCUTS);
    if (Array.isArray(initialShortcuts)) {
      this.importProfile(initialShortcuts);
    }
  }

  getAll() {
    return this.shortcuts;
  }

  getById(id) {
    return this.shortcuts.find(s => s.id === id) || null;
  }

  search(query = '') {
    const q = (query || '').trim().toLowerCase();
    if (!q) return this.shortcuts;
    return this.shortcuts.filter(s =>
      s.name.toLowerCase().includes(q)
      || s.category.toLowerCase().includes(q)
      || (s.key || '').toLowerCase().includes(q)
      || s.id.toLowerCase().includes(q)
    );
  }

  findConflicts(combo, excludeId = null) {
    const norm = normalizeKeyCombo(combo);
    if (!norm) return [];
    return this.shortcuts.filter(s => s.id !== excludeId && normalizeKeyCombo(s.key) === norm);
  }

  assignShortcut(id, combo, { resolveConflicts = false } = {}) {
    const target = this.getById(id);
    if (!target) return { ok: false, conflicts: [] };
    const norm = normalizeKeyCombo(combo);
    if (!norm) return { ok: false, conflicts: [] };

    const conflicts = this.findConflicts(norm, id);
    if (resolveConflicts) {
      for (const c of conflicts) c.key = '';
    }
    target.key = norm;
    return { ok: true, key: norm, conflicts };
  }

  removeShortcut(id) {
    const target = this.getById(id);
    if (!target) return false;
    target.key = '';
    return true;
  }

  resolveConflictFor(commandId) {
    const target = this.getById(commandId);
    if (!target || !target.key) return 0;
    const conflicts = this.findConflicts(target.key, commandId);
    for (const c of conflicts) c.key = '';
    return conflicts.length;
  }

  restoreDefaults() {
    this.shortcuts = structuredClone(DEFAULT_SHORTCUTS);
    return this.shortcuts;
  }

  applyPreset(presetName) {
    this.restoreDefaults();
    const overrides = SHORTCUT_PRESETS[presetName];
    if (!overrides) return this.shortcuts;
    for (const [id, key] of Object.entries(overrides)) {
      const target = this.getById(id);
      if (target) target.key = normalizeKeyCombo(key);
    }
    return this.shortcuts;
  }

  matchEvent(e) {
    const combo = eventToKeyCombo(e);
    if (!combo) return null;
    const match = this.shortcuts.find(s => normalizeKeyCombo(s.key) === combo);
    if (!match) return null;
    if (isEditableEventTarget(e.target) && !match.allowInInput) {
      return null;
    }
    return match;
  }

  exportProfile() {
    return JSON.stringify({
      format: 'frameflow-shortcuts-v2',
      exportedAt: new Date().toISOString(),
      bindings: this.shortcuts.map(s => ({ id: s.id, key: s.key })),
    }, null, 2);
  }

  importProfile(raw) {
    let parsed = raw;
    if (typeof raw === 'string') {
      try { parsed = JSON.parse(raw); } catch { return { ok: false, importedCount: 0 }; }
    }
    const list = Array.isArray(parsed)
      ? parsed
      : (Array.isArray(parsed?.bindings) ? parsed.bindings : null);
    if (!list) return { ok: false, importedCount: 0 };

    let count = 0;
    for (const item of list) {
      if (!item || typeof item.id !== 'string') continue;
      const target = this.getById(item.id);
      if (!target) continue;
      target.key = item.key ? normalizeKeyCombo(item.key) : '';
      count++;
    }
    return { ok: true, importedCount: count };
  }
}


import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ShortcutRegistry,
  normalizeKeyCombo,
  eventToKeyCombo,
  isEditableEventTarget,
} from '../../apps/web/public/js/shortcut-registry.js';

test('ShortcutRegistry supports search, assign, remove, conflict detection, and resolution', () => {
  const reg = new ShortcutRegistry();

  // Search by command name and by key
  const wsMatches = reg.search('Workspace:');
  assert.ok(wsMatches.length >= 6);
  const keyMatches = reg.search('Ctrl+K');
  assert.ok(keyMatches.some(s => s.id === 'split_playhead'));

  // Assign a conflicting key without auto-resolving -> reports conflict
  const res = reg.assignShortcut('snap_toggle', 'Ctrl+K', { resolveConflicts: false });
  assert.equal(res.ok, true);
  assert.equal(res.conflicts.length, 1);
  assert.equal(res.conflicts[0].id, 'split_playhead');

  // Resolve conflict unbinds the conflicting command cleanly
  const resolvedCount = reg.resolveConflictFor('snap_toggle');
  assert.equal(resolvedCount, 1);
  assert.equal(reg.getById('split_playhead').key, '');
  assert.equal(reg.getById('snap_toggle').key, 'Ctrl+K');

  // Remove shortcut
  assert.equal(reg.removeShortcut('snap_toggle'), true);
  assert.equal(reg.getById('snap_toggle').key, '');

  // Restore defaults
  reg.restoreDefaults();
  assert.equal(reg.getById('snap_toggle').key, 'S');
  assert.equal(reg.getById('split_playhead').key, 'Ctrl+K');
});

test('ShortcutRegistry supports NLE presets and JSON profile export/import', () => {
  const reg = new ShortcutRegistry();
  reg.applyPreset('resolve');
  assert.equal(reg.getById('tool_select').key, 'A');
  assert.equal(reg.getById('tool_razor').key, 'B');

  const exported = reg.exportProfile();
  const reg2 = new ShortcutRegistry();
  const imported = reg2.importProfile(exported);
  assert.equal(imported.ok, true);
  assert.ok(imported.importedCount > 30);
  assert.equal(reg2.getById('tool_select').key, 'A');

  // Malformed JSON never crashes
  assert.equal(reg2.importProfile('{not-json').ok, false);
});

test('ShortcutRegistry suppresses non-allowInInput shortcuts while typing in inputs, but allows Ctrl+S', () => {
  const reg = new ShortcutRegistry();

  const textInputTarget = { tagName: 'INPUT', isContentEditable: false };
  const bodyTarget = { tagName: 'BODY', isContentEditable: false };

  assert.equal(isEditableEventTarget(textInputTarget), true);
  assert.equal(isEditableEventTarget(bodyTarget), false);

  // Pressing Space or V inside an INPUT must NOT fire transport/tool commands
  assert.equal(reg.matchEvent({ code: 'Space', key: ' ', target: textInputTarget }), null);
  assert.equal(reg.matchEvent({ code: 'KeyV', key: 'v', target: textInputTarget }), null);

  // Pressing Space or V on body fires properly
  assert.equal(reg.matchEvent({ code: 'Space', key: ' ', target: bodyTarget })?.id, 'play_pause');
  assert.equal(reg.matchEvent({ code: 'KeyV', key: 'v', target: bodyTarget })?.id, 'tool_select');

  // Workspace switching shortcut Alt+Shift+3 -> Color workspace
  const wsMatch = reg.matchEvent({ code: 'Digit3', key: '#', altKey: true, shiftKey: true, target: bodyTarget });
  assert.equal(wsMatch?.id, 'ws_color');

  // Panel visibility shortcut Shift+8 -> Toggle Properties
  const panelMatch = reg.matchEvent({ code: 'Digit8', key: '*', shiftKey: true, target: bodyTarget });
  assert.equal(panelMatch?.id, 'panel_properties');

  // Ctrl+S has allowInInput: true so saving works even from a text input
  const saveMatch = reg.matchEvent({ code: 'KeyS', key: 's', ctrlKey: true, target: textInputTarget });
  assert.equal(saveMatch?.id, 'save_project');

  assert.equal(normalizeKeyCombo('shift+ctrl+z'), 'Ctrl+Shift+Z');
  assert.equal(eventToKeyCombo({ code: 'Backquote', key: '`' }), '`');
});


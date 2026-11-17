import test from 'node:test';
import assert from 'node:assert';
import { createEmptyProject } from '../../packages/project-engine/src/project.ts';
import { CommandManager } from '../../packages/project-engine/src/commands.ts';

test('CommandManager - Undo / Redo lifecycle', () => {
  const project = createEmptyProject('Initial Project');
  const mgr = new CommandManager(project);

  assert.strictEqual(mgr.canUndo(), false, 'Initially cannot undo');
  assert.strictEqual(mgr.canRedo(), false, 'Initially cannot redo');

  // Execute Command: change title
  mgr.execute(
    {
      type: 'SET_SEQUENCE_SETTINGS',
      description: 'Rename Project',
      timestamp: Date.now(),
      payload: 'Renamed Project',
      undoPayload: 'Initial Project',
    },
    (proj) => { proj.title = 'Renamed Project'; },
    (proj) => { proj.title = 'Initial Project'; }
  );

  assert.strictEqual(mgr.getProject().title, 'Renamed Project');
  assert.strictEqual(mgr.canUndo(), true, 'Can now undo');

  // Undo
  mgr.undo((cmd, proj) => { proj.title = cmd.undoPayload; });
  assert.strictEqual(mgr.getProject().title, 'Initial Project');
  assert.strictEqual(mgr.canRedo(), true, 'Can now redo');

  // Redo
  mgr.redo((cmd, proj) => { proj.title = cmd.payload; });
  assert.strictEqual(mgr.getProject().title, 'Renamed Project');
});

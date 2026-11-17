import test from 'node:test';
import assert from 'node:assert';
import { tokens } from '../../packages/design-system/src/tokens.ts';

test('Design Tokens validation', () => {
  assert.ok(tokens.colors.bg.root, 'Root background color exists');
  assert.strictEqual(tokens.colors.accent.blue, '#3b82f6', 'Primary accent color is electric blue');
  assert.strictEqual(tokens.colors.track.video, '#2563eb', 'Video track color matches standard');
  assert.strictEqual(tokens.colors.track.audio, '#059669', 'Audio track color matches standard');
});

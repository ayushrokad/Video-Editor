import test from 'node:test';
import assert from 'node:assert';
import { detectSystemCapabilities } from '../../packages/media-engine/src/diagnostics.ts';

test('Diagnostics function handles headless/Node environment gracefully', async () => {
  const caps = await detectSystemCapabilities();
  assert.ok(caps.timestamp, 'Timestamp is set');
  assert.strictEqual(typeof caps.webgpu.available, 'boolean', 'WebGPU flag is boolean');
  assert.strictEqual(typeof caps.webgl2.available, 'boolean', 'WebGL2 flag is boolean');
  assert.strictEqual(typeof caps.webcodecs.available, 'boolean', 'WebCodecs flag is boolean');
  assert.strictEqual(typeof caps.audio.available, 'boolean', 'Audio flag is boolean');
});

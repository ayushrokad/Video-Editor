import test from 'node:test';
import assert from 'node:assert/strict';

import { FrameflowAudioEngine } from '../../apps/web/public/js/audio-dsp.js';
import {
  TRANSITION_CATEGORIES,
  TRANSITION_CATALOG,
  applyEasing,
  detectGraphicsCapabilities,
} from '../../apps/web/public/js/transitions-gpu.js';
import {
  EXPORT_PRESETS,
  detectExportCodecs,
  RenderQueueManager,
} from '../../apps/web/public/js/export-pipeline.js';

test('FrameflowAudioEngine - dB math, bus architecture & headless safety', () => {
  const engine = new FrameflowAudioEngine();
  assert.equal(engine.busDefinitions.length, 4);
  assert.deepEqual(
    engine.busDefinitions.map(b => b.id),
    ['dialogue', 'music', 'sfx', 'ambience']
  );

  // 0 dB === gain 1.0, -6 dB ≈ 0.501, -60 dB === 0
  assert.equal(engine.dbToGain(0), 1);
  assert.equal(engine.dbToGain(-60), 0);
  assert.ok(Math.abs(engine.dbToGain(-6) - 0.501187) < 0.001);

  engine.updateBusParams('music', -12, false);
  const musicBus = engine.busDefinitions.find(b => b.id === 'music');
  assert.equal(musicBus.volumeDb, -12);

  const status = engine.getStatus();
  assert.equal(status.state, 'headless');
});

test('Transitions GPU Engine - 10 categories, easing curves & honest capability probing', async () => {
  assert.equal(TRANSITION_CATEGORIES.length, 10);
  assert.ok(TRANSITION_CATALOG.length >= 10);

  assert.equal(applyEasing(0, 'smooth'), 0);
  assert.equal(applyEasing(1, 'smooth'), 1);
  assert.equal(applyEasing(0.5, 'linear'), 0.5);
  assert.equal(applyEasing(0.5, 'ease-in'), 0.25);
  assert.equal(applyEasing(0.5, 'ease-out'), 0.75);

  const caps = await detectGraphicsCapabilities();
  assert.equal(caps.webgpuAvailable, false);
  assert.equal(caps.activeBackend, 'Canvas 2D (Fallback)');
});

test('Offline Export Pipeline - RenderQueueManager job lifecycle & codec probe', () => {
  assert.ok(EXPORT_PRESETS.length >= 5);
  const codecs = detectExportCodecs();
  assert.equal(codecs.mediaRecorder, false); // Node headless

  let updates = 0;
  const q = new RenderQueueManager(() => { updates++; });
  const job = q.addJob({ filename: 'Test_Master', durationSec: 10, fps: 24 });
  assert.equal(q.jobs.length, 1);
  assert.equal(job.totalFrames, 240);
  assert.equal(job.status, 'queued');
  assert.equal(updates, 1);

  job.status = 'failed';
  q.retryJob(job.id);
  assert.equal(job.status, 'queued');

  q.removeJob(job.id);
  assert.equal(q.jobs.length, 0);
});

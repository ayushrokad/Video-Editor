import test from 'node:test';
import assert from 'node:assert/strict';

import {
  generateLinkGroupId,
  resolveSelectionForClick,
  computeSyncOffsetSeconds,
  applyLinkedMove,
  applyLinkedTrim,
  applyLinkedSplit,
  linkClipsByIds,
  unlinkClipsByIds,
  moveClipIntoSync,
} from '../../apps/web/public/js/linked-clips.js';

import {
  FORMAT_REGISTRY,
  EXPORT_PRESETS,
  detectExportCodecs,
  estimateFileSizeMB,
  validateExportConfig,
  encodeWavPCM,
  buildSrtFromSequence,
  RenderQueueManager,
} from '../../apps/web/public/js/export-pipeline.js';

test('Linked Media - Default linked select, move, trim, split, out-of-sync & Move Into Sync', () => {
  const tracks = [
    { id: 'track_v1', type: 'video', locked: false },
    { id: 'track_a1', type: 'audio', locked: false },
  ];
  const groupId = generateLinkGroupId();
  const seq = {
    tracks,
    clips: [
      { id: 'v1', mediaType: 'video', linkGroupId: groupId, trackId: 'track_v1', timelineStart: 2, timelineDuration: 10, sourceStart: 0 },
      { id: 'a1', mediaType: 'audio', linkGroupId: groupId, trackId: 'track_a1', timelineStart: 2, timelineDuration: 10, sourceStart: 0 },
    ],
  };

  // 1. Linked Selection ON selects both
  assert.deepEqual(resolveSelectionForClick(seq.clips, 'v1', { isLinkedSelection: true }), ['v1', 'a1']);
  assert.deepEqual(resolveSelectionForClick(seq.clips, 'a1', { isLinkedSelection: true }), ['v1', 'a1']);

  // 2. Linked Move shifts both by exact same delta
  const initStarts = new Map([['v1', 2], ['a1', 2]]);
  applyLinkedMove(seq.clips, tracks, seq.clips[0], initStarts, 3.5, true);
  assert.equal(seq.clips[0].timelineStart, 5.5);
  assert.equal(seq.clips[1].timelineStart, 5.5);
  assert.equal(computeSyncOffsetSeconds(seq.clips, seq.clips[1]), 0);

  // 3. Linked Trim trims both edges consistently
  const trimInit = new Map([
    ['v1', { timelineStart: 5.5, timelineDuration: 10, sourceStart: 0 }],
    ['a1', { timelineStart: 5.5, timelineDuration: 10, sourceStart: 0 }],
  ]);
  applyLinkedTrim(seq.clips, tracks, seq.clips[0], 'left', trimInit, 1.5, true);
  assert.equal(seq.clips[0].timelineStart, 7.0);
  assert.equal(seq.clips[1].timelineStart, 7.0);
  assert.equal(seq.clips[0].timelineDuration, 8.5);
  assert.equal(seq.clips[1].timelineDuration, 8.5);
  assert.equal(seq.clips[0].sourceStart, 1.5);
  assert.equal(seq.clips[1].sourceStart, 1.5);

  // 4. Disable Linked Selection -> independent move preserves linkGroupId & flags Out-of-Sync!
  assert.deepEqual(resolveSelectionForClick(seq.clips, 'a1', { isLinkedSelection: false }), ['a1']);
  applyLinkedMove(seq.clips, tracks, seq.clips[1], new Map([['a1', 7.0]]), 2.5, false);
  assert.equal(seq.clips[1].timelineStart, 9.5);
  assert.equal(seq.clips[1].linkGroupId, groupId);
  assert.equal(computeSyncOffsetSeconds(seq.clips, seq.clips[1]), 2.5);

  // 5. Move Into Sync restores exact alignment
  assert.equal(moveClipIntoSync(seq.clips, 'a1'), true);
  assert.equal(seq.clips[1].timelineStart, 7.0);
  assert.equal(computeSyncOffsetSeconds(seq.clips, seq.clips[1]), 0);

  // 6. Linked Split creates linked right-hand halves
  const rightIds = applyLinkedSplit(seq, 'v1', 10.0, true);
  assert.equal(rightIds.length, 2);
  const rClips = seq.clips.filter(c => rightIds.includes(c.id));
  assert.ok(rClips[0].linkGroupId && rClips[0].linkGroupId === rClips[1].linkGroupId);
  assert.notEqual(rClips[0].linkGroupId, groupId);

  // 7. Unlink & Relink
  assert.equal(unlinkClipsByIds(seq.clips, ['v1']), 2);
  assert.equal(seq.clips[0].linkGroupId, null);
  assert.equal(seq.clips[1].linkGroupId, null);

  const newGroup = linkClipsByIds(seq.clips, ['v1', 'a1']);
  assert.ok(newGroup);
  assert.equal(seq.clips[0].linkGroupId, newGroup);
  assert.equal(seq.clips[1].linkGroupId, newGroup);
});

test('Professional Export Pipeline - Validation, WAV PCM RIFF encoding, SRT & Render Queue', () => {
  const probe = detectExportCodecs();
  assert.ok(FORMAT_REGISTRY.length >= 8);
  assert.ok(EXPORT_PRESETS.length >= 10);

  // Native-only ProRes must fail validation honestly in browser backend
  const proresCheck = validateExportConfig({ formatId: 'mov_prores', width: 1920, height: 1080, fps: 24, durationSec: 5 }, probe);
  assert.equal(proresCheck.valid, false);
  assert.ok(proresCheck.errors[0].includes('FFmpeg'));

  // WAV PCM must pass validation universally
  const wavCheck = validateExportConfig({ formatId: 'wav_pcm', durationSec: 2, audioSampleRate: 48000, audioBitDepth: 16, audioChannels: 'stereo' }, probe);
  assert.equal(wavCheck.valid, true);
  assert.ok(estimateFileSizeMB({ formatId: 'wav_pcm', durationSec: 10, audioSampleRate: 48000, audioBitDepth: 16, audioChannels: 'stereo' }) > 1.8);

  // Real RIFF/WAVE binary header & byte size verification (1 second, 48kHz, stereo, 16-bit = 44 + 192000 bytes)
  const wavBytes = encodeWavPCM([new Float32Array(48000), new Float32Array(48000)], 48000, 16);
  assert.equal(wavBytes.byteLength, 44 + 48000 * 2 * 2);
  assert.equal(String.fromCharCode(wavBytes[0], wavBytes[1], wavBytes[2], wavBytes[3]), 'RIFF');
  assert.equal(String.fromCharCode(wavBytes[8], wavBytes[9], wavBytes[10], wavBytes[11]), 'WAVE');

  // SRT generator
  const srt = buildSrtFromSequence({
    clips: [{ isTitle: true, titleText: 'Opening Title', timelineStart: 1.5, timelineDuration: 3.0 }],
    markers: [{ time: 6.0, label: 'Beat Drop' }],
  });
  assert.ok(srt.includes('00:00:01,500 --> 00:00:04,500'));
  assert.ok(srt.includes('Opening Title'));
  assert.ok(srt.includes('Beat Drop'));

  // Queue multi-deliverable immutability, duplicate & reorder
  const q = new RenderQueueManager();
  const j1 = q.addJob({ filename: '4K_Master', formatId: 'webm_vp9', width: 3840, height: 2160, fps: 24, durationSec: 5 });
  const j2 = q.duplicateJob(j1.id);
  assert.equal(q.jobs.length, 2);
  q.moveJob(j2.id, -1);
  assert.equal(q.jobs[0].id, j2.id);
});

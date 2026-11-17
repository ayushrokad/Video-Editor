import test from 'node:test';
import assert from 'node:assert';
import { createDefaultSequence } from '../../packages/project-engine/src/project.ts';
import {
  addClipToTimeline,
  moveClip,
  trimClipStart,
  trimClipEnd,
  splitClipAtPlayhead,
  deleteClip,
  getActiveClipAtTime,
} from '../../packages/timeline-engine/src/operations.ts';

test('Timeline Operations - Add, Move, Trim, Split, and Delete', () => {
  const seq = createDefaultSequence('Test Sequence');
  const dummyAsset = {
    id: 'asset_test_1',
    name: 'test_video.mp4',
    type: 'video',
    size: 1024000,
    mimeType: 'video/mp4',
    duration: 20,
    width: 1920,
    height: 1080,
    fps: 24,
    aspectRatio: '16:9',
    objectUrl: 'blob:test',
    createdAt: Date.now(),
  };

  // 1. Add clip
  const clip = addClipToTimeline(seq, dummyAsset, 'track_v1', 0, 10);
  assert.strictEqual(seq.clips.length, 1, 'Clip added to sequence');
  assert.strictEqual(clip.timelineStart, 0, 'Clip starts at 0s');
  assert.strictEqual(clip.timelineDuration, 10, 'Clip duration is 10s');

  // 2. Active clip query
  const activeAt5 = getActiveClipAtTime(seq, 5);
  assert.ok(activeAt5, 'Clip found at playhead 5s');
  assert.strictEqual(activeAt5.id, clip.id);

  const activeAt15 = getActiveClipAtTime(seq, 15);
  assert.strictEqual(activeAt15, null, 'No clip found at playhead 15s');

  // 3. Move clip
  moveClip(seq, clip.id, 5);
  assert.strictEqual(clip.timelineStart, 5, 'Clip moved to 5s');

  // 4. Split clip at 8s (3s into clip of 10s total)
  const splitResult = splitClipAtPlayhead(seq, clip.id, 8);
  assert.ok(splitResult, 'Split succeeded');
  assert.strictEqual(seq.clips.length, 2, 'Two clips now exist');
  assert.strictEqual(splitResult.leftClip.timelineDuration, 3, 'Left clip duration is 3s (5s to 8s)');
  assert.strictEqual(splitResult.rightClip.timelineStart, 8, 'Right clip starts at 8s');
  assert.strictEqual(splitResult.rightClip.timelineDuration, 7, 'Right clip duration is 7s (8s to 15s)');

  // 5. Trim clip start by 1s
  trimClipStart(seq, splitResult.rightClip.id, 1);
  assert.strictEqual(splitResult.rightClip.timelineStart, 9, 'Trimmed right clip start to 9s');
  assert.strictEqual(splitResult.rightClip.timelineDuration, 6, 'Trimmed right clip duration to 6s');

  // 6. Delete clip
  deleteClip(seq, splitResult.leftClip.id);
  assert.strictEqual(seq.clips.length, 1, 'Only right clip remains');
});

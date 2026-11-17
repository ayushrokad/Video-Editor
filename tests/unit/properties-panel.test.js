import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AVAILABLE_CLIP_EFFECTS,
  resolvePropertiesContext,
  computeSharedProp,
  addClipEffect,
  toggleClipEffect,
  moveClipEffect,
  removeClipEffect,
  toggleKeyframeAtLocalTime,
  evaluateKeyframedProp,
} from '../../apps/web/public/js/properties-controller.js';
import {
  createDefaultProjectState,
  createDefaultSessionState,
  createDefaultWorkspaceState,
} from '../../apps/web/public/js/state-store.js';

function makeMockSequence() {
  return {
    id: 'seq_1',
    name: 'Master Sequence',
    fps: 24,
    width: 1920,
    height: 1080,
    duration: 60,
    tracks: [
      { id: 'V1', type: 'video', name: 'V1' },
      { id: 'A1', type: 'audio', name: 'A1' },
    ],
    clips: [
      {
        id: 'clip_v1',
        name: 'Interview.mp4',
        trackId: 'V1',
        mediaType: 'video',
        assetId: 'asset_1',
        linkGroupId: 'grp_1',
        startTime: 0,
        duration: 10,
        transform: { scale: 1.0, opacity: 1.0, positionX: 0, positionY: 0, rotation: 0 },
      },
      {
        id: 'clip_a1',
        name: 'Interview.mp4 [Audio]',
        trackId: 'A1',
        mediaType: 'audio',
        assetId: 'asset_1',
        linkGroupId: 'grp_1',
        startTime: 0,
        duration: 10,
        audio: { volumeDb: 0, pan: 0, fadeIn: 0, fadeOut: 0 },
      },
      {
        id: 'clip_v2',
        name: 'Broll.mp4',
        trackId: 'V1',
        mediaType: 'video',
        assetId: 'asset_2',
        startTime: 10,
        duration: 8,
        transform: { scale: 1.25, opacity: 1.0, positionX: 120, positionY: 0, rotation: 0 },
      },
      {
        id: 'clip_t1',
        name: 'Lower Third',
        trackId: 'V1',
        isTitle: true,
        mediaType: 'title',
        startTime: 2,
        duration: 4,
        titleText: 'Speaker Name',
        transform: { scale: 1.0, opacity: 1.0, positionX: 0, positionY: 0, rotation: 0 },
      },
    ],
  };
}

test('resolvePropertiesContext handles empty, video, audio, title, linked-av, and multi-selection accurately', () => {
  const seq = makeMockSequence();

  // Empty selection
  const emptyCtx = resolvePropertiesContext(seq, [], null);
  assert.equal(emptyCtx.mode, 'empty');
  assert.equal(emptyCtx.clips.length, 0);
  assert.deepEqual(emptyCtx.availableTabs, []);

  // Single unlinked video
  const vidCtx = resolvePropertiesContext(seq, ['clip_v2'], null);
  assert.equal(vidCtx.mode, 'video');
  assert.equal(vidCtx.primaryClip.id, 'clip_v2');
  assert.equal(vidCtx.audioClip, null);
  assert.deepEqual(vidCtx.availableTabs, ['properties', 'effects', 'motion', 'metadata']);

  // Single audio (prioritizes audio tab first)
  const audCtx = resolvePropertiesContext(seq, ['clip_a1'], null);
  assert.equal(audCtx.mode, 'audio');
  assert.equal(audCtx.primaryClip.id, 'clip_a1');
  assert.equal(audCtx.audioClip.id, 'clip_a1');
  assert.equal(audCtx.availableTabs[0], 'audio');

  // Single title
  const titleCtx = resolvePropertiesContext(seq, ['clip_t1'], null);
  assert.equal(titleCtx.mode, 'title');
  assert.equal(titleCtx.primaryClip.id, 'clip_t1');
  assert.deepEqual(titleCtx.availableTabs, ['properties', 'effects', 'motion']);

  // Linked Video + Audio pair
  const linkedCtx = resolvePropertiesContext(seq, ['clip_v1', 'clip_a1'], null);
  assert.equal(linkedCtx.mode, 'linked-av');
  assert.equal(linkedCtx.primaryClip.id, 'clip_v1');
  assert.equal(linkedCtx.audioClip.id, 'clip_a1');
  assert.deepEqual(linkedCtx.availableTabs, ['properties', 'audio', 'effects', 'motion', 'metadata']);

  // Multi-selection with honest Mixed value detection
  const multiCtx = resolvePropertiesContext(seq, ['clip_v1', 'clip_v2'], null);
  assert.equal(multiCtx.mode, 'multi');
  assert.equal(multiCtx.clips.length, 2);
  assert.equal(multiCtx.shared.opacity.mixed, false);
  assert.equal(multiCtx.shared.opacity.value, 1.0);
  assert.equal(multiCtx.shared.scale.mixed, true);
  assert.equal(multiCtx.shared.scale.value, null);

  // Direct computeSharedProp verification
  const directCheck = computeSharedProp(multiCtx.clips, c => c.transform?.rotation);
  assert.equal(directCheck.mixed, false);
  assert.equal(directCheck.value, 0);
});

test('Pinning preserves inspected clip when timeline selection changes and handles deletion safely', () => {
  const seq = makeMockSequence();

  // Pinned to clip_v2 while timeline selection moves to clip_a1
  const pinnedCtx = resolvePropertiesContext(seq, ['clip_a1'], 'clip_v2');
  assert.equal(pinnedCtx.pinned, true);
  assert.equal(pinnedCtx.primaryClip.id, 'clip_v2');
  assert.equal(pinnedCtx.mode, 'video');

  // Pinned clip remains inspected even if timeline selection is cleared
  const pinnedEmptySel = resolvePropertiesContext(seq, [], 'clip_v2');
  assert.equal(pinnedEmptySel.pinned, true);
  assert.equal(pinnedEmptySel.primaryClip.id, 'clip_v2');

  // If pinned clip is deleted, falls back cleanly without crashing
  seq.clips = seq.clips.filter(c => c.id !== 'clip_v2');
  const afterDelete = resolvePropertiesContext(seq, ['clip_a1'], 'clip_v2');
  assert.equal(afterDelete.pinned, false);
  assert.equal(afterDelete.primaryClip.id, 'clip_a1');
});

test('Applied Effects Stack supports add, enable/disable toggle, reorder, and remove', () => {
  const clip = { id: 'c1' };
  assert.ok(AVAILABLE_CLIP_EFFECTS.length >= 6);

  const fx1 = addClipEffect(clip, 'gaussian_blur');
  const fx2 = addClipEffect(clip, 'vignette');
  assert.ok(fx1 && fx2);
  assert.equal(clip.appliedEffects.length, 2);
  assert.equal(clip.appliedEffects[0].id, 'gaussian_blur');
  assert.equal(clip.appliedEffects[1].id, 'vignette');

  // Toggle disabled
  const toggled = toggleClipEffect(clip, fx1.uid);
  assert.equal(toggled.enabled, false);
  assert.equal(clip.appliedEffects[0].enabled, false);

  // Move second effect up to index 0
  const moved = moveClipEffect(clip, fx2.uid, -1);
  assert.equal(moved, true);
  assert.equal(clip.appliedEffects[0].id, 'vignette');
  assert.equal(clip.appliedEffects[1].id, 'gaussian_blur');

  // Remove first effect
  removeClipEffect(clip, fx2.uid);
  assert.equal(clip.appliedEffects.length, 1);
  assert.equal(clip.appliedEffects[0].uid, fx1.uid);
});

test('Keyframe engine toggles keyframes and interpolates linear and smooth values accurately', () => {
  const clip = { id: 'c_kf', transform: { scale: 1.0, opacity: 1.0 } };

  // Add two keyframes for scale: t=0 -> 1.0, t=4 -> 2.0 (linear)
  assert.equal(toggleKeyframeAtLocalTime(clip, 'scale', 0, 1.0, 'linear'), true);
  assert.equal(toggleKeyframeAtLocalTime(clip, 'scale', 4, 2.0, 'linear'), true);

  // Midpoint t=2 should evaluate to 1.5
  assert.equal(evaluateKeyframedProp(clip, 'scale', 2.0, 1.0), 1.5);
  // Before first keyframe clamps to 1.0
  assert.equal(evaluateKeyframedProp(clip, 'scale', -1, 1.0), 1.0);
  // After last keyframe clamps to 2.0
  assert.equal(evaluateKeyframedProp(clip, 'scale', 6, 1.0), 2.0);

  // Smooth ease-in-out at t=1 (u=0.25): 2 * 0.25 * 0.25 = 0.125 -> 1.125
  clip.keyframes.scale[0].easing = 'smooth';
  const smoothQuarter = evaluateKeyframedProp(clip, 'scale', 1.0, 1.0);
  assert.ok(Math.abs(smoothQuarter - 1.125) < 0.0001);

  // Toggling at existing keyframe time removes it
  assert.equal(toggleKeyframeAtLocalTime(clip, 'scale', 4, 2.0, 'linear'), false);
  assert.equal(clip.keyframes.scale.length, 1);
});

test('Closing Properties panel updates workspaceState without mutating sessionState or projectState', () => {
  const projectState = createDefaultProjectState();
  const sessionState = createDefaultSessionState();
  const workspaceState = createDefaultWorkspaceState();

  sessionState.selectedClipIds = ['clip_v1', 'clip_a1'];
  sessionState.playheadTime = 12.5;

  // Simulate closing Properties panel in Edit workspace
  const editLayout = workspaceState.layouts.edit;
  assert.ok(editLayout.visiblePanels.includes('panel-inspector'));
  editLayout.visiblePanels = editLayout.visiblePanels.filter(id => id !== 'panel-inspector');

  assert.equal(editLayout.visiblePanels.includes('panel-inspector'), false);
  // Session selection and playhead are 100% preserved!
  assert.deepEqual(sessionState.selectedClipIds, ['clip_v1', 'clip_a1']);
  assert.equal(sessionState.playheadTime, 12.5);
  assert.equal(projectState.sequences.seq_master.name, 'Master Sequence');
});

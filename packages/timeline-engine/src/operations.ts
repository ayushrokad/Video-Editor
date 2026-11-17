/**
 * @frameflow/timeline-engine - Core Timeline Math & Operations
 */

import type { TimelineSequence, TimelineClip, MediaAsset } from '../../shared-types/src/index.ts';

export function addClipToTimeline(
  seq: TimelineSequence,
  asset: MediaAsset,
  trackId: string,
  startTime: number,
  duration?: number
): TimelineClip {
  const clipDuration = duration || Math.min(asset.duration || 5, 10);
  const newClip: TimelineClip = {
    id: `clip_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    name: asset.name,
    assetId: asset.id,
    trackId,
    timelineStart: Math.max(0, startTime),
    timelineDuration: clipDuration,
    sourceStart: 0,
    transform: {
      positionX: 0,
      positionY: 0,
      scale: 1.0,
      rotation: 0,
      opacity: 1.0,
      blendMode: 'normal',
    },
    colorEffects: {
      exposure: 0.0,
      contrast: 1.0,
      brightness: 0.0,
      saturation: 1.0,
      temperature: 0.0,
      tint: 0.0,
      gamma: 1.0,
      invert: false,
    },
    audio: {
      volumeDb: 0,
      pan: 0,
      muted: false,
    },
    speed: 1.0,
    colorTag: trackId.startsWith('track_a') ? '#059669' : '#2563eb',
  };

  seq.clips.push(newClip);
  // Expand sequence duration if clip extends past boundary
  seq.duration = Math.max(seq.duration, newClip.timelineStart + newClip.timelineDuration + 10);
  return newClip;
}

export function moveClip(
  seq: TimelineSequence,
  clipId: string,
  newStartTime: number,
  newTrackId?: string
): boolean {
  const clip = seq.clips.find(c => c.id === clipId);
  if (!clip) return false;

  clip.timelineStart = Math.max(0, newStartTime);
  if (newTrackId) {
    clip.trackId = newTrackId;
  }
  seq.duration = Math.max(seq.duration, clip.timelineStart + clip.timelineDuration + 10);
  return true;
}

export function trimClipStart(
  seq: TimelineSequence,
  clipId: string,
  deltaSeconds: number
): boolean {
  const clip = seq.clips.find(c => c.id === clipId);
  if (!clip) return false;

  const maxDelta = clip.timelineDuration - 0.2; // keep at least 0.2s duration
  const actualDelta = Math.min(deltaSeconds, maxDelta);

  clip.timelineStart += actualDelta;
  clip.timelineDuration -= actualDelta;
  clip.sourceStart = Math.max(0, clip.sourceStart + actualDelta);
  return true;
}

export function trimClipEnd(
  seq: TimelineSequence,
  clipId: string,
  newDuration: number
): boolean {
  const clip = seq.clips.find(c => c.id === clipId);
  if (!clip) return false;

  clip.timelineDuration = Math.max(0.2, newDuration);
  seq.duration = Math.max(seq.duration, clip.timelineStart + clip.timelineDuration + 10);
  return true;
}

export function splitClipAtPlayhead(
  seq: TimelineSequence,
  clipId: string,
  splitTime: number
): { leftClip: TimelineClip; rightClip: TimelineClip } | null {
  const clip = seq.clips.find(c => c.id === clipId);
  if (!clip) return null;

  if (splitTime <= clip.timelineStart || splitTime >= clip.timelineStart + clip.timelineDuration) {
    return null;
  }

  const offset = splitTime - clip.timelineStart;
  const leftDuration = offset;
  const rightDuration = clip.timelineDuration - offset;

  // Left clip becomes the original clip with shortened duration
  clip.timelineDuration = leftDuration;

  // Create right clip
  const rightClip: TimelineClip = {
    ...JSON.parse(JSON.stringify(clip)),
    id: `clip_${Date.now()}_right`,
    timelineStart: splitTime,
    timelineDuration: rightDuration,
    sourceStart: clip.sourceStart + offset,
  };

  seq.clips.push(rightClip);
  return { leftClip: clip, rightClip };
}

export function deleteClip(seq: TimelineSequence, clipId: string): boolean {
  const idx = seq.clips.findIndex(c => c.id === clipId);
  if (idx === -1) return false;
  seq.clips.splice(idx, 1);
  return true;
}

export function getActiveClipAtTime(seq: TimelineSequence, time: number): TimelineClip | null {
  // Sort by track index descending (higher video tracks overlay lower video tracks)
  const videoTracks = seq.tracks.filter(t => t.type === 'video' && t.visible);
  const trackOrder = videoTracks.map(t => t.id).reverse();

  for (const trackId of trackOrder) {
    const clip = seq.clips.find(
      c => c.trackId === trackId && time >= c.timelineStart && time < c.timelineStart + c.timelineDuration
    );
    if (clip) return clip;
  }

  return null;
}

/**
 * FRAMEFLOW Linked Video + Audio Editing Engine
 * - Maintains separate Video and Audio clip instances connected via shared `linkGroupId`
 * - Preserves `syncAnchorTimelineStart` / `syncAnchorSourceStart` to compute exact sync drift
 * - Distinguishes Linked Clips (persistent relationship) from Linked Selection (selection toggle)
 * - Supports atomic group Move, Trim, Split, Delete, Link, Unlink, Move Into Sync, and Synchronize
 */

export function generateLinkGroupId() {
  return `link_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export function getLinkedGroupMembers(clips, clip) {
  if (!clip || !clip.linkGroupId) return clip ? [clip] : [];
  return clips.filter(c => c.linkGroupId === clip.linkGroupId);
}

/**
 * Resolves which clip IDs should be selected when clicking `clickedClipId`.
 */
export function resolveSelectionForClick(clips, clickedClipId, { isLinkedSelection = true, additive = false, currentSelectedIds = [] } = {}) {
  const clicked = clips.find(c => c.id === clickedClipId);
  if (!clicked) return [];

  const targetMembers = (isLinkedSelection && clicked.linkGroupId)
    ? getLinkedGroupMembers(clips, clicked).map(c => c.id)
    : [clicked.id];

  if (!additive) return targetMembers;

  const set = new Set(currentSelectedIds);
  const allPresent = targetMembers.every(id => set.has(id));
  if (allPresent) {
    targetMembers.forEach(id => set.delete(id));
  } else {
    targetMembers.forEach(id => set.add(id));
  }
  return Array.from(set);
}

/**
 * Computes synchronization offset (in seconds) of `clip` relative to its primary video partner
 * (or first member of its link group). Returns 0 if unlinked or in sync.
 */
export function computeSyncOffsetSeconds(clips, clip) {
  if (!clip || !clip.linkGroupId) return 0;
  const members = getLinkedGroupMembers(clips, clip);
  if (members.length < 2) return 0;

  // Prefer the video clip as the sync reference anchor
  const anchor = members.find(m => m.mediaType === 'video') || members[0];
  if (anchor.id === clip.id) {
    // Check if any partner has drifted relative to the video anchor
    const other = members.find(m => m.id !== anchor.id);
    if (!other) return 0;
    const drift = (anchor.timelineStart - (anchor.sourceStart || 0)) - (other.timelineStart - (other.sourceStart || 0));
    return Math.abs(drift) > 0.04 ? drift : 0;
  }

  const drift = (clip.timelineStart - (clip.sourceStart || 0)) - (anchor.timelineStart - (anchor.sourceStart || 0));
  return Math.abs(drift) > 0.04 ? drift : 0;
}

/**
 * Moves a clip and (if Linked Selection is enabled) all unlocked members of its link group
 * by the exact same timeline delta.
 */
export function applyLinkedMove(clips, tracks, leadClip, initialStartsMap, deltaSec, isLinkedSelection) {
  const members = (isLinkedSelection && leadClip.linkGroupId)
    ? getLinkedGroupMembers(clips, leadClip)
    : [leadClip];

  // Clamp delta so no member moves before 00:00:00:00
  let clampedDelta = deltaSec;
  for (const m of members) {
    const tr = tracks.find(t => t.id === m.trackId);
    if (tr && tr.locked) continue;
    const initStart = initialStartsMap.get(m.id) ?? m.timelineStart;
    if (initStart + clampedDelta < 0) {
      clampedDelta = -initStart;
    }
  }

  for (const m of members) {
    const tr = tracks.find(t => t.id === m.trackId);
    if (tr && tr.locked) continue;
    const initStart = initialStartsMap.get(m.id) ?? m.timelineStart;
    m.timelineStart = Math.max(0, initStart + clampedDelta);
  }
  return clampedDelta;
}

/**
 * Trims left (in) or right (out) edge of a clip and its linked group consistently.
 */
export function applyLinkedTrim(clips, tracks, leadClip, edge, initialMap, deltaSec, isLinkedSelection) {
  const members = (isLinkedSelection && leadClip.linkGroupId)
    ? getLinkedGroupMembers(clips, leadClip)
    : [leadClip];

  for (const m of members) {
    const tr = tracks.find(t => t.id === m.trackId);
    if (tr && tr.locked) continue;
    const init = initialMap.get(m.id);
    if (!init) continue;

    if (edge === 'left') {
      const safeDelta = Math.min(deltaSec, init.timelineDuration - 0.2);
      const boundedDelta = Math.max(-init.timelineStart, safeDelta);
      m.timelineStart = Math.max(0, init.timelineStart + boundedDelta);
      m.timelineDuration = Math.max(0.2, init.timelineDuration - boundedDelta);
      m.sourceStart = Math.max(0, init.sourceStart + boundedDelta);
    } else {
      m.timelineDuration = Math.max(0.2, init.timelineDuration + deltaSec);
    }
  }
}

/**
 * Splits a clip (and its linked group members overlapping splitTime) cleanly,
 * preserving link groups for both the left halves and right halves!
 */
export function applyLinkedSplit(seq, clipId, splitTime, isLinkedSelection) {
  const lead = seq.clips.find(c => c.id === clipId);
  if (!lead) return [];

  const targets = (isLinkedSelection && lead.linkGroupId)
    ? getLinkedGroupMembers(seq.clips, lead)
    : [lead];

  const rightLinkGroupId = (targets.length > 1 && lead.linkGroupId) ? generateLinkGroupId() : null;
  const createdRightIds = [];

  for (const c of targets) {
    if (splitTime <= c.timelineStart + 0.05 || splitTime >= c.timelineStart + c.timelineDuration - 0.05) {
      continue;
    }
    const offset = splitTime - c.timelineStart;
    const rightClip = {
      ...JSON.parse(JSON.stringify(c)),
      id: `clip_${Date.now()}_${Math.random().toString(36).slice(2, 5)}_r`,
      timelineStart: splitTime,
      timelineDuration: c.timelineDuration - offset,
      sourceStart: (c.sourceStart || 0) + offset,
      linkGroupId: rightLinkGroupId,
      transitionIn: null,
    };
    c.timelineDuration = offset;
    seq.clips.push(rightClip);
    createdRightIds.push(rightClip.id);
  }

  return createdRightIds;
}

/**
 * Links an array of clip IDs into a shared linkGroupId.
 */
export function linkClipsByIds(clips, clipIds) {
  const targets = clips.filter(c => clipIds.includes(c.id));
  if (targets.length < 2) return null;
  const groupId = generateLinkGroupId();
  for (const c of targets) {
    c.linkGroupId = groupId;
  }
  return groupId;
}

/**
 * Unlinks all members of the link group(s) belonging to clipIds.
 */
export function unlinkClipsByIds(clips, clipIds) {
  const groupIds = new Set(
    clips.filter(c => clipIds.includes(c.id) && c.linkGroupId).map(c => c.linkGroupId)
  );
  let count = 0;
  for (const c of clips) {
    if (c.linkGroupId && groupIds.has(c.linkGroupId)) {
      c.linkGroupId = null;
      count++;
    }
  }
  return count;
}

/**
 * Moves a drifted linked clip back into exact sync with its anchor partner.
 */
export function moveClipIntoSync(clips, clipId) {
  const clip = clips.find(c => c.id === clipId);
  if (!clip || !clip.linkGroupId) return false;
  const members = getLinkedGroupMembers(clips, clip);
  if (members.length < 2) return false;

  const partner = members.find(m => m.id !== clip.id);
  if (!partner) return false;

  const targetTimelineStart = Math.max(0, partner.timelineStart + ((clip.sourceStart || 0) - (partner.sourceStart || 0)));
  clip.timelineStart = targetTimelineStart;
  return true;
}

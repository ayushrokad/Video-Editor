/**
 * FRAMEFLOW Context-Aware Properties Panel Controller (M7)
 * - Resolves inspection context from active selection OR pinned clip ID
 * - Determines valid contextual tabs per object type (Video, Audio, Title, Linked A/V, Multi-Select, Empty)
 * - Computes honest shared values for multi-selection (flags `mixed: true` when clips differ)
 * - Manages real per-clip Applied Effects stack (add, enable/disable, reorder, remove, reset)
 * - Manages per-clip Transform Keyframes & interpolation
 */

export const AVAILABLE_CLIP_EFFECTS = [
  { id: 'color_grade',   name: 'Color Balance & Exposure', params: { exposure: 0, contrast: 1, saturation: 1, temperature: 0 } },
  { id: 'gaussian_blur', name: 'Gaussian Blur',            params: { radiusPx: 4 } },
  { id: 'vignette',      name: 'Cinematic Vignette',       params: { strength: 0.45 } },
  { id: 'grayscale',     name: 'Monochrome / B&W',         params: { amount: 1.0 } },
  { id: 'sepia',         name: 'Warm Sepia Tone',          params: { amount: 0.7 } },
  { id: 'invert',        name: 'Color Invert',             params: { amount: 1.0 } },
];

/**
 * Resolves the Properties inspection context without ever mutating timeline selection.
 */
export function resolvePropertiesContext(seq, selectedClipIds = [], pinnedClipId = null) {
  if (!seq) {
    return { mode: 'empty', primaryClip: null, audioClip: null, clips: [], availableTabs: [], pinned: false };
  }

  // If pinned to a specific clip ID that still exists, inspect ONLY that clip
  if (pinnedClipId) {
    const pinnedClip = seq.clips.find(c => c.id === pinnedClipId);
    if (pinnedClip) {
      return buildSingleClipContext(seq, pinnedClip, true);
    }
  }

  const selected = selectedClipIds
    .map(id => seq.clips.find(c => c.id === id))
    .filter(Boolean);

  if (selected.length === 0) {
    return { mode: 'empty', primaryClip: null, audioClip: null, clips: [], availableTabs: [], pinned: false };
  }

  if (selected.length === 1) {
    return buildSingleClipContext(seq, selected[0], false);
  }

  // Check if selection is a single linked Video + Audio pair (share same linkGroupId)
  const groupIds = new Set(selected.map(c => c.linkGroupId).filter(Boolean));
  const videoClip = selected.find(c => getClipKind(seq, c) === 'video');
  const audioClip = selected.find(c => getClipKind(seq, c) === 'audio');
  if (selected.length === 2 && groupIds.size === 1 && videoClip && audioClip) {
    return {
      mode: 'linked-av',
      primaryClip: videoClip,
      audioClip,
      clips: selected,
      availableTabs: ['properties', 'audio', 'effects', 'motion', 'metadata'],
      pinned: false,
    };
  }

  // General Multi-Clip Selection -> compute honest shared properties
  const allVideo = selected.every(c => getClipKind(seq, c) !== 'audio');
  const allAudio = selected.every(c => getClipKind(seq, c) === 'audio');

  return {
    mode: 'multi',
    primaryClip: selected[0],
    audioClip: allAudio ? selected[0] : null,
    clips: selected,
    availableTabs: allAudio ? ['audio'] : (allVideo ? ['properties', 'effects'] : ['properties']),
    shared: {
      scale:     computeSharedProp(selected, c => c.transform?.scale),
      opacity:   computeSharedProp(selected, c => c.transform?.opacity),
      rotation:  computeSharedProp(selected, c => c.transform?.rotation),
      volumeDb:  computeSharedProp(selected, c => c.audio?.volumeDb),
    },
    pinned: false,
  };
}

export function getClipKind(seq, clip) {
  if (!clip) return 'video';
  if (clip.isTitle || clip.mediaType === 'title') return 'title';
  if (clip.mediaType === 'audio') return 'audio';
  const tr = seq.tracks.find(t => t.id === clip.trackId);
  if (tr && tr.type === 'audio') return 'audio';
  return 'video';
}

function buildSingleClipContext(seq, clip, pinned) {
  const kind = getClipKind(seq, clip);
  if (kind === 'title') {
    return {
      mode: 'title',
      primaryClip: clip,
      audioClip: null,
      clips: [clip],
      availableTabs: ['properties', 'effects', 'motion'],
      pinned,
    };
  }
  if (kind === 'audio') {
    return {
      mode: 'audio',
      primaryClip: clip,
      audioClip: clip,
      clips: [clip],
      availableTabs: ['audio', 'effects', 'metadata'],
      pinned,
    };
  }
  // Video clip: find linked audio partner if one exists
  const linkedAudio = clip.linkGroupId
    ? seq.clips.find(c => c.id !== clip.id && c.linkGroupId === clip.linkGroupId && getClipKind(seq, c) === 'audio')
    : null;
  return {
    mode: 'video',
    primaryClip: clip,
    audioClip: linkedAudio || null,
    clips: [clip],
    availableTabs: linkedAudio
      ? ['properties', 'audio', 'effects', 'motion', 'metadata']
      : ['properties', 'effects', 'motion', 'metadata'],
    pinned,
  };
}

export function computeSharedProp(clips, getter) {
  if (!clips.length) return { mixed: false, value: null };
  const first = getter(clips[0]);
  for (let i = 1; i < clips.length; i++) {
    if (getter(clips[i]) !== first) return { mixed: true, value: null };
  }
  return { mixed: false, value: first };
}

// --- Applied Effects Stack Helpers ---
export function ensureEffectsArray(clip) {
  if (!Array.isArray(clip.appliedEffects)) clip.appliedEffects = [];
  return clip.appliedEffects;
}

export function addClipEffect(clip, effectDefId) {
  const def = AVAILABLE_CLIP_EFFECTS.find(e => e.id === effectDefId);
  if (!def) return null;
  const list = ensureEffectsArray(clip);
  const instance = {
    uid: `fx_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    id: def.id,
    name: def.name,
    enabled: true,
    params: JSON.parse(JSON.stringify(def.params)),
  };
  list.push(instance);
  return instance;
}

export function toggleClipEffect(clip, uid) {
  const fx = ensureEffectsArray(clip).find(e => e.uid === uid);
  if (fx) fx.enabled = !fx.enabled;
  return fx;
}

export function moveClipEffect(clip, uid, direction) {
  const list = ensureEffectsArray(clip);
  const idx = list.findIndex(e => e.uid === uid);
  const next = idx + direction;
  if (idx < 0 || next < 0 || next >= list.length) return false;
  const [item] = list.splice(idx, 1);
  list.splice(next, 0, item);
  return true;
}

export function removeClipEffect(clip, uid) {
  clip.appliedEffects = ensureEffectsArray(clip).filter(e => e.uid !== uid);
}

// --- Transform Keyframe Helpers ---
export function ensureKeyframesMap(clip) {
  if (!clip.keyframes || typeof clip.keyframes !== 'object') {
    clip.keyframes = { positionX: [], positionY: [], scale: [], rotation: [], opacity: [] };
  }
  return clip.keyframes;
}

export function toggleKeyframeAtLocalTime(clip, prop, localTimeSec, value, easing = 'smooth') {
  const map = ensureKeyframesMap(clip);
  if (!Array.isArray(map[prop])) map[prop] = [];
  const existingIdx = map[prop].findIndex(k => Math.abs(k.time - localTimeSec) < 0.06);
  if (existingIdx >= 0) {
    map[prop].splice(existingIdx, 1);
    return false; // removed
  }
  map[prop].push({ time: Math.max(0, localTimeSec), value, easing });
  map[prop].sort((a, b) => a.time - b.time);
  return true; // added
}

export function evaluateKeyframedProp(clip, prop, localTimeSec, fallbackValue) {
  const list = clip?.keyframes?.[prop];
  if (!Array.isArray(list) || list.length === 0) return fallbackValue;
  if (list.length === 1 || localTimeSec <= list[0].time) return list[0].value;
  const last = list[list.length - 1];
  if (localTimeSec >= last.time) return last.value;

  for (let i = 0; i < list.length - 1; i++) {
    const k0 = list[i];
    const k1 = list[i + 1];
    if (localTimeSec >= k0.time && localTimeSec <= k1.time) {
      const span = Math.max(0.0001, k1.time - k0.time);
      let t = (localTimeSec - k0.time) / span;
      if (k0.easing === 'smooth') t = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      else if (k0.easing === 'ease-in') t = t * t;
      else if (k0.easing === 'ease-out') t = 1 - (1 - t) * (1 - t);
      return k0.value + (k1.value - k0.value) * t;
    }
  }
  return fallbackValue;
}

/**
 * @frameflow/project-engine - Project Model & Factory
 */

import type { ProjectModel, TimelineSequence, TimelineTrack, MediaBin } from '../../shared-types/src/index.ts';

export function createDefaultSequence(name = 'Sequence 01'): TimelineSequence {
  const tracks: TimelineTrack[] = [
    { id: 'track_v2', name: 'V2', type: 'video', index: 1, muted: false, solo: false, locked: false, visible: true, height: 48 },
    { id: 'track_v1', name: 'V1', type: 'video', index: 0, muted: false, solo: false, locked: false, visible: true, height: 48 },
    { id: 'track_a1', name: 'A1', type: 'audio', index: 0, muted: false, solo: false, locked: false, visible: true, height: 48 },
    { id: 'track_a2', name: 'A2', type: 'audio', index: 1, muted: false, solo: false, locked: false, visible: true, height: 48 },
  ];

  return {
    id: `seq_${Date.now()}`,
    name,
    width: 1920,
    height: 1080,
    fps: 24,
    duration: 60, // initial 60 seconds view
    tracks,
    clips: [],
    playheadTime: 0,
  };
}

export function createEmptyProject(title = 'Untitled Project'): ProjectModel {
  const defaultSeq = createDefaultSequence('Master Sequence');
  const rootBin: MediaBin = {
    id: 'bin_root',
    name: 'Root',
    assetIds: [],
    isOpen: true,
  };

  return {
    id: `proj_${Date.now()}`,
    title,
    version: '1.0.0',
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    assets: {},
    bins: {
      bin_root: rootBin,
    },
    rootBinIds: ['bin_root'],
    sequences: {
      [defaultSeq.id]: defaultSeq,
    },
    activeSequenceId: defaultSeq.id,
  };
}

/**
 * @frameflow/shared-types
 * Canonical shared TypeScript definitions for FRAMEFLOW Web Platform.
 */

export type WorkspaceId = 'media' | 'edit' | 'motion' | 'color' | 'audio' | 'deliver';
export type TimecodeFormat = 'smpte' | 'frames' | 'seconds';

export interface RationalTime {
  numerator: number;
  denominator: number;
}

// ----------------------------------------------------
// Media & Assets
// ----------------------------------------------------
export interface MediaAsset {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'image';
  size: number;
  mimeType: string;
  duration: number; // in seconds
  width: number;
  height: number;
  fps: number;
  aspectRatio: string;
  objectUrl: string; // local blob URL
  thumbnailUrl?: string;
  createdAt: number;
  binId?: string;
}

export interface MediaBin {
  id: string;
  name: string;
  parentBinId?: string;
  assetIds: string[];
  isOpen: boolean;
  color?: string;
}

// ----------------------------------------------------
// Timeline & Sequences
// ----------------------------------------------------
export interface ClipTransform {
  positionX: number; // normalized or pixels (-1000 to 1000)
  positionY: number;
  scale: number;     // 0.1 to 5.0 (default 1.0)
  rotation: number;  // degrees (-360 to 360)
  opacity: number;   // 0.0 to 1.0 (default 1.0)
  blendMode: 'normal' | 'multiply' | 'screen' | 'overlay';
}

export interface ClipColorEffects {
  exposure: number;     // -3.0 to +3.0 EV
  contrast: number;     // 0.0 to 2.0
  brightness: number;   // -1.0 to +1.0
  saturation: number;   // 0.0 to 2.0
  temperature: number;  // -1.0 to +1.0
  tint: number;         // -1.0 to +1.0
  gamma: number;        // 0.2 to 3.0
  invert: boolean;
}

export interface ClipAudioProperties {
  volumeDb: number;     // -60 to +12 dB (default 0)
  pan: number;          // -100 to +100 (default 0)
  muted: boolean;
}

export interface TimelineClip {
  id: string;
  name: string;
  assetId: string;
  trackId: string;
  timelineStart: number;    // start position in sequence (seconds)
  timelineDuration: number; // visible duration in sequence (seconds)
  sourceStart: number;      // in-point in media asset (seconds)
  transform: ClipTransform;
  colorEffects: ClipColorEffects;
  audio: ClipAudioProperties;
  speed: number;            // 0.25 to 8.0 (default 1.0)
  colorTag: string;
}

export interface TimelineTrack {
  id: string;
  name: string;
  type: 'video' | 'audio';
  index: number;
  muted: boolean;
  solo: boolean;
  locked: boolean;
  visible: boolean;
  height: number;           // pixels (min 32, max 160)
}

export interface TimelineSequence {
  id: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  duration: number;         // total duration in seconds
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  playheadTime: number;     // current playhead time in seconds
  inPoint?: number;
  outPoint?: number;
}

// ----------------------------------------------------
// Project Model
// ----------------------------------------------------
export interface ProjectModel {
  id: string;
  title: string;
  version: string;
  createdAt: number;
  modifiedAt: number;
  assets: Record<string, MediaAsset>;
  bins: Record<string, MediaBin>;
  rootBinIds: string[];
  sequences: Record<string, TimelineSequence>;
  activeSequenceId: string;
  activeClipId?: string;
  activeTrackId?: string;
  selectedAssetId?: string;
}

// ----------------------------------------------------
// Panel Registry & Layout Types
// ----------------------------------------------------
export interface PanelDefinition {
  id: string;
  name: string;
  icon: string;
  category: 'media' | 'editing' | 'motion' | 'color' | 'audio' | 'system';
  minWidth: number;
  minHeight: number;
  isClosable: boolean;
  allowsMultiple: boolean;
}

export interface PanelTabGroup {
  id: string;
  panelIds: string[];
  activePanelId: string;
}

export interface WorkspaceLayout {
  id: string;
  name: string;
  leftWidth: number;        // percentage or px
  rightWidth: number;
  timelineHeight: number;
  monitorSplitRatio: number;// 0.5 = equal split
  panelGroups: Record<string, PanelTabGroup>;
  hiddenPanels: string[];
  maximizedPanelId?: string;
}

// ----------------------------------------------------
// Commands
// ----------------------------------------------------
export type CommandType =
  | 'IMPORT_ASSET'
  | 'DELETE_ASSET'
  | 'CREATE_BIN'
  | 'RENAME_BIN'
  | 'ADD_CLIP'
  | 'MOVE_CLIP'
  | 'TRIM_CLIP'
  | 'SPLIT_CLIP'
  | 'DELETE_CLIP'
  | 'UPDATE_CLIP_TRANSFORM'
  | 'UPDATE_CLIP_COLOR'
  | 'UPDATE_CLIP_AUDIO'
  | 'ADD_TRACK'
  | 'DELETE_TRACK'
  | 'TOGGLE_TRACK_PROPERTY'
  | 'SET_SEQUENCE_SETTINGS';

export interface Command {
  type: CommandType;
  description: string;
  timestamp: number;
  payload: any;
  undoPayload: any;
}

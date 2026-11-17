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

export interface SystemCapabilities {
  timestamp: string;
  userAgent: string;
  webgpu: {
    available: boolean;
    adapterName?: string;
    vendor?: string;
    architecture?: string;
    maxTextureDimension2D?: number;
    error?: string;
  };
  webgl2: {
    available: boolean;
    renderer?: string;
    vendor?: string;
    maxTextureSize?: number;
    error?: string;
  };
  webcodecs: {
    available: boolean;
    hasVideoDecoder: boolean;
    hasVideoEncoder: boolean;
    hasAudioDecoder: boolean;
    hasAudioEncoder: boolean;
    supportedProfiles: {
      avc1_baseline?: boolean;
      avc1_main?: boolean;
      avc1_high?: boolean;
      vp8?: boolean;
      vp9_profile0?: boolean;
      vp9_profile2?: boolean;
      av1_main?: boolean;
      hevc_main?: boolean;
    };
  };
  audio: {
    available: boolean;
    sampleRate?: number;
    maxChannelCount?: number;
    state?: AudioContextState;
  };
  storage: {
    opfs: boolean;
    indexedDB: boolean;
    estimatedQuotaBytes?: number;
    estimatedUsageBytes?: number;
  };
  workers: {
    dedicatedWorker: boolean;
    sharedWorker: boolean;
    offscreenCanvas: boolean;
  };
}

export interface VideoMetadata {
  fileName: string;
  fileSize: number;
  mimeType: string;
  durationSeconds: number;
  width: number;
  height: number;
  aspectRatio: string;
  estimatedFps: number;
  hasAudio: boolean;
  codec?: string;
  lastModified: number;
}

export interface ColorAdjustmentParams {
  exposure: number;     // -3.0 to +3.0 EV (default 0.0)
  contrast: number;     // 0.0 to 2.0 (default 1.0)
  brightness: number;   // -1.0 to +1.0 (default 0.0)
  saturation: number;   // 0.0 to 2.0 (default 1.0)
  temperature: number;  // -1.0 (cool/blue) to +1.0 (warm/orange) (default 0.0)
  tint: number;         // -1.0 (green) to +1.0 (magenta) (default 0.0)
  gamma: number;        // 0.2 to 3.0 (default 1.0)
  invert: boolean;      // default false
}

export interface FramePlaybackMetrics {
  currentFps: number;
  targetFps: number;
  droppedFrames: number;
  totalDecodedFrames: number;
  decodeLatencyMs: number;
  gpuRenderLatencyMs: number;
}

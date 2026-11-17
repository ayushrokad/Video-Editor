/**
 * @frameflow/media-engine - Local Video Metadata Extractor
 * Reads file header and dimensions without server uploads.
 */

import type { VideoMetadata } from '../../shared-types/src/index.ts';

export function inspectLocalVideoFile(file: File): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    const objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
      video.remove();
    };

    video.onloadedmetadata = () => {
      const width = video.videoWidth || 1920;
      const height = video.videoHeight || 1080;
      const duration = video.duration || 0;

      // Calculate simplified aspect ratio
      const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
      const divisor = gcd(width, height);
      const aspectW = width / divisor;
      const aspectH = height / divisor;
      const aspectRatio = `${aspectW}:${aspectH}`;

      // Detect audio presence
      const hasAudio = (video as any).mozHasAudio ||
        Boolean((video as any).webkitAudioDecodedByteCount) ||
        Boolean((video as any).audioTracks?.length);

      const metadata: VideoMetadata = {
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || 'video/mp4',
        durationSeconds: duration,
        width,
        height,
        aspectRatio: (aspectW === 16 && aspectH === 9) ? '16:9' : (aspectW === 9 && aspectH === 16) ? '9:16' : aspectRatio,
        estimatedFps: 30.0, // standard default fallback
        hasAudio,
        lastModified: file.lastModified,
      };

      cleanup();
      resolve(metadata);
    };

    video.onerror = () => {
      cleanup();
      reject(new Error(`Failed to load video metadata for: ${file.name}`));
    };
  });
}

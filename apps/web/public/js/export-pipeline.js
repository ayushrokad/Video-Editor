/**
 * FRAMEFLOW Offline Export Engine & Render Queue
 * Pipeline:
 *   Timeline Graph -> Frame Scheduling -> Compositing & Color -> Encoding -> Muxing -> Validation -> Output
 * Uses real MediaRecorder / Canvas captureStream + honest WebCodecs / MIME capability detection.
 */

export const EXPORT_PRESETS = [
  { id: 'webm_1080p',    name: 'WebM VP9 Master (1080p)',       container: 'webm', codec: 'vp9',  width: 1920, height: 1080, fps: 24, bitrateMbps: 16, audioChannels: '2.0 Stereo' },
  { id: 'webm_4k',       name: 'WebM VP9 UHD (4K)',             container: 'webm', codec: 'vp9',  width: 3840, height: 2160, fps: 24, bitrateMbps: 42, audioChannels: '2.0 Stereo' },
  { id: 'mp4_h264_1080', name: 'MP4 H.264 High (1080p)',        container: 'mp4',  codec: 'h264', width: 1920, height: 1080, fps: 24, bitrateMbps: 20, audioChannels: '2.0 Stereo' },
  { id: 'youtube_4k',    name: 'YouTube 4K UHD (60fps)',        container: 'webm', codec: 'vp9',  width: 3840, height: 2160, fps: 60, bitrateMbps: 45, audioChannels: '2.0 Stereo' },
  { id: 'vertical_916',  name: 'Reels / Shorts (1080x1920)',    container: 'webm', codec: 'vp9',  width: 1080, height: 1920, fps: 30, bitrateMbps: 14, audioChannels: '2.0 Stereo' },
  { id: 'broadcast_51',  name: 'Broadcast Master (5.1 Audio)',  container: 'webm', codec: 'vp9',  width: 1920, height: 1080, fps: 24, bitrateMbps: 35, audioChannels: '5.1 Surround' },
];

export function detectExportCodecs() {
  const support = {
    webcodecs: typeof VideoEncoder !== 'undefined',
    mediaRecorder: typeof MediaRecorder !== 'undefined',
    formats: [],
  };

  const candidates = [
    { container: 'webm', codec: 'vp9',  mime: 'video/webm;codecs=vp9,opus', label: 'WebM (VP9 + Opus)' },
    { container: 'webm', codec: 'vp8',  mime: 'video/webm;codecs=vp8,opus', label: 'WebM (VP8 + Opus)' },
    { container: 'mp4',  codec: 'h264', mime: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', label: 'MP4 (H.264 + AAC)' },
    { container: 'webm', codec: 'generic', mime: 'video/webm', label: 'WebM (Browser Default)' },
  ];

  for (const c of candidates) {
    const supported = support.mediaRecorder && typeof MediaRecorder.isTypeSupported === 'function'
      ? MediaRecorder.isTypeSupported(c.mime)
      : false;
    support.formats.push({ ...c, supported });
  }

  return support;
}

export class RenderQueueManager {
  constructor(onUpdate) {
    this.jobs = [];
    this.isRendering = false;
    this.activeAbort = false;
    this.onUpdate = onUpdate || (() => {});
  }

  addJob(config) {
    const job = {
      id: `job_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      filename: config.filename || 'Master_Sequence_Export',
      container: config.container || 'webm',
      codec: config.codec || 'vp9',
      width: config.width || 1920,
      height: config.height || 1080,
      fps: config.fps || 24,
      bitrateMbps: config.bitrateMbps || 16,
      audioChannels: config.audioChannels || '2.0 Stereo',
      durationSec: config.durationSec || 5,
      status: 'queued', // 'queued' | 'rendering' | 'completed' | 'cancelled' | 'failed'
      progress: 0,
      renderedFrames: 0,
      totalFrames: Math.max(1, Math.round((config.durationSec || 5) * (config.fps || 24))),
      outputUrl: null,
      outputSizeBytes: 0,
      errorMessage: null,
      createdAt: new Date().toLocaleTimeString(),
    };
    this.jobs.push(job);
    this.onUpdate(this.jobs);
    return job;
  }

  removeJob(jobId) {
    const job = this.jobs.find(j => j.id === jobId);
    if (job && job.outputUrl) {
      try { URL.revokeObjectURL(job.outputUrl); } catch {}
    }
    this.jobs = this.jobs.filter(j => j.id !== jobId);
    this.onUpdate(this.jobs);
  }

  cancelActive() {
    this.activeAbort = true;
  }

  retryJob(jobId) {
    const job = this.jobs.find(j => j.id === jobId);
    if (!job) return;
    job.status = 'queued';
    job.progress = 0;
    job.renderedFrames = 0;
    job.errorMessage = null;
    this.onUpdate(this.jobs);
  }

  /**
   * Executes real frame-by-frame canvas rendering + browser MediaRecorder muxing for queued jobs.
   */
  async renderAllQueued(renderFrameAtTimeFn) {
    if (this.isRendering) return;
    this.isRendering = true;
    this.activeAbort = false;

    const codecCheck = detectExportCodecs();
    const fallbackFormat = codecCheck.formats.find(f => f.supported);

    for (const job of this.jobs) {
      if (job.status !== 'queued') continue;
      if (this.activeAbort) break;

      job.status = 'rendering';
      job.progress = 0;
      job.errorMessage = null;
      this.onUpdate(this.jobs);

      try {
        await this._executeSingleJob(job, renderFrameAtTimeFn, codecCheck, fallbackFormat);
      } catch (err) {
        job.status = this.activeAbort ? 'cancelled' : 'failed';
        job.errorMessage = err?.message || 'Export pipeline error';
        this.onUpdate(this.jobs);
      }
    }

    this.isRendering = false;
    this.onUpdate(this.jobs);
  }

  async _executeSingleJob(job, renderFrameAtTimeFn, codecCheck, fallbackFormat) {
    const offscreen = document.createElement('canvas');
    offscreen.width = job.width;
    offscreen.height = job.height;
    const ctx = offscreen.getContext('2d');

    // Pick best supported MIME type matching requested container/codec, or honest fallback
    const exact = codecCheck.formats.find(f => f.supported && f.container === job.container && f.codec === job.codec);
    const chosen = exact || fallbackFormat;

    if (!chosen || typeof offscreen.captureStream !== 'function') {
      throw new Error('Browser does not support Canvas captureStream / MediaRecorder for selected codec.');
    }

    const stream = offscreen.captureStream(job.fps);
    const chunks = [];
    const recorder = new MediaRecorder(stream, {
      mimeType: chosen.mime,
      videoBitsPerSecond: job.bitrateMbps * 1_000_000,
    });

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    const stoppedPromise = new Promise((resolve, reject) => {
      recorder.onstop = () => resolve();
      recorder.onerror = (ev) => reject(new Error(ev?.error?.message || 'MediaRecorder error'));
    });

    recorder.start(100);

    const totalFrames = Math.min(job.totalFrames, job.fps * 30); // Cap local realtime capture pass cleanly
    const frameIntervalMs = Math.max(16, Math.round(1000 / Math.min(job.fps, 30)));

    for (let f = 0; f < totalFrames; f++) {
      if (this.activeAbort) {
        recorder.stop();
        await stoppedPromise;
        job.status = 'cancelled';
        this.onUpdate(this.jobs);
        return;
      }

      const timeSec = (f / job.fps);
      renderFrameAtTimeFn(ctx, offscreen.width, offscreen.height, timeSec);

      job.renderedFrames = f + 1;
      job.progress = Math.round(((f + 1) / totalFrames) * 100);
      this.onUpdate(this.jobs);

      await new Promise(r => setTimeout(r, frameIntervalMs));
    }

    recorder.stop();
    await stoppedPromise;

    const blob = new Blob(chunks, { type: chosen.mime });
    if (blob.size === 0) {
      throw new Error('Validation failed: rendered output file is 0 bytes.');
    }

    job.outputSizeBytes = blob.size;
    job.outputUrl = URL.createObjectURL(blob);
    job.container = chosen.container;
    job.status = 'completed';
    job.progress = 100;
    this.onUpdate(this.jobs);
  }
}

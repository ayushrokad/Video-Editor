/**
 * @frameflow/media-engine - System & Browser Diagnostics
 * Probes and tests browser hardware acceleration and API availability.
 */

import type { SystemCapabilities } from '../../shared-types/src/index.ts';

export async function detectSystemCapabilities(): Promise<SystemCapabilities> {
  const caps: SystemCapabilities = {
    timestamp: new Date().toISOString(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Node.js',
    webgpu: { available: false },
    webgl2: { available: false },
    webcodecs: {
      available: false,
      hasVideoDecoder: false,
      hasVideoEncoder: false,
      hasAudioDecoder: false,
      hasAudioEncoder: false,
      supportedProfiles: {},
    },
    audio: { available: false },
    storage: {
      opfs: false,
      indexedDB: false,
    },
    workers: {
      dedicatedWorker: false,
      sharedWorker: false,
      offscreenCanvas: false,
    },
  };

  if (typeof window === 'undefined') {
    return caps;
  }

  // 1. Probe WebGPU
  if ('gpu' in navigator && typeof (navigator as any).gpu?.requestAdapter === 'function') {
    try {
      const adapter = await (navigator as any).gpu.requestAdapter();
      if (adapter) {
        caps.webgpu.available = true;
        const info = typeof adapter.requestAdapterInfo === 'function' ? await adapter.requestAdapterInfo() : (adapter.info || {});
        caps.webgpu.adapterName = info.description || info.device || 'WebGPU Compatible Adapter';
        caps.webgpu.vendor = info.vendor || 'Generic GPU Vendor';
        caps.webgpu.architecture = info.architecture || 'Unknown Arch';
        caps.webgpu.maxTextureDimension2D = adapter.limits?.maxTextureDimension2D || 8192;
      } else {
        caps.webgpu.error = 'No compatible WebGPU adapter returned by user agent';
      }
    } catch (err: any) {
      caps.webgpu.error = err.message || String(err);
    }
  } else {
    caps.webgpu.error = 'navigator.gpu API is not supported in this browser';
  }

  // 2. Probe WebGL 2
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (gl) {
      caps.webgl2.available = true;
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        caps.webgl2.vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
        caps.webgl2.renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
      }
      caps.webgl2.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    } else {
      caps.webgl2.error = 'WebGL 2 context creation failed';
    }
  } catch (err: any) {
    caps.webgl2.error = err.message || String(err);
  }

  // 3. Probe WebCodecs
  const hasVD = typeof (window as any).VideoDecoder !== 'undefined';
  const hasVE = typeof (window as any).VideoEncoder !== 'undefined';
  const hasAD = typeof (window as any).AudioDecoder !== 'undefined';
  const hasAE = typeof (window as any).AudioEncoder !== 'undefined';

  caps.webcodecs.hasVideoDecoder = hasVD;
  caps.webcodecs.hasVideoEncoder = hasVE;
  caps.webcodecs.hasAudioDecoder = hasAD;
  caps.webcodecs.hasAudioEncoder = hasAE;
  caps.webcodecs.available = hasVD && hasVE;

  // Probe specific codec support if VideoDecoder.isConfigSupported exists
  if (hasVD && typeof (window as any).VideoDecoder.isConfigSupported === 'function') {
    const testCodecs: Record<string, string> = {
      avc1_baseline: 'avc1.42E01E',
      avc1_main: 'avc1.4D401E',
      avc1_high: 'avc1.640028',
      vp8: 'vp8',
      vp9_profile0: 'vp09.00.10.08',
      vp9_profile2: 'vp09.02.10.10',
      av1_main: 'av01.0.04M.08',
      hevc_main: 'hev1.1.6.L93.B0',
    };

    for (const [key, codecString] of Object.entries(testCodecs)) {
      try {
        const support = await (window as any).VideoDecoder.isConfigSupported({
          codec: codecString,
          codedWidth: 1920,
          codedHeight: 1080,
        });
        (caps.webcodecs.supportedProfiles as any)[key] = Boolean(support.supported);
      } catch {
        (caps.webcodecs.supportedProfiles as any)[key] = false;
      }
    }
  }

  // 4. Probe Web Audio API
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  if (AudioCtx) {
    caps.audio.available = true;
    try {
      const ctx = new AudioCtx();
      caps.audio.sampleRate = ctx.sampleRate;
      caps.audio.maxChannelCount = ctx.destination?.maxChannelCount || 2;
      caps.audio.state = ctx.state;
      ctx.close().catch(() => {});
    } catch {}
  }

  // 5. Probe OPFS & Storage Quota
  caps.storage.indexedDB = typeof window.indexedDB !== 'undefined';
  if ('storage' in navigator && typeof navigator.storage?.getDirectory === 'function') {
    caps.storage.opfs = true;
  }
  if ('storage' in navigator && typeof navigator.storage?.estimate === 'function') {
    try {
      const estimate = await navigator.storage.estimate();
      caps.storage.estimatedQuotaBytes = estimate.quota;
      caps.storage.estimatedUsageBytes = estimate.usage;
    } catch {}
  }

  // 6. Probe Workers & OffscreenCanvas
  caps.workers.dedicatedWorker = typeof window.Worker !== 'undefined';
  caps.workers.sharedWorker = typeof (window as any).SharedWorker !== 'undefined';
  caps.workers.offscreenCanvas = typeof (window as any).OffscreenCanvas !== 'undefined';

  return caps;
}

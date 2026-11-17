# FRAMEFLOW Development Guide: Browser Compatibility Matrix
**Document ID:** `DEV-CMP-001`  
**Classification:** Browser Standards & Hardware Capability Matrix  
**Version:** 2.0  

---

## 1. Browser Support Tiers

| Capability / API | Chrome / Edge (Chromium 113+) | Firefox (120+) | Safari (17+) | Mobile / Tablet | Progressive Fallback |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **WebGPU** | Full Support (Windows, macOS, ChromeOS) | Behind Flag / Partial | Behind Flag / Partial | Supported on iOS 17.4+ | **WebGL 2 Fallback Shader Pipeline** |
| **WebCodecs (VideoDecoder)**| Full Hardware Acceleration | In Development / Limited | Limited profiles | Limited / Varies | **HTML5 `<video>` Frame Extractor Loop** |
| **Origin Private File System (OPFS)**| Full Synchronous Worker Access | Supported | Supported | Supported | **IndexedDB Blob Store Fallback** |
| **Web Audio API** | Full (AudioWorklet, Dynamics) | Full Support | Full Support | Full Support | None needed (Standardized) |
| **File System Access API** | Full (Directory picker, file handle) | Partial | Limited | Limited | **Standard `<input type="file">` Fallback** |

---

## 2. Capability Detection Strategy
At application startup, FRAMEFLOW executes an asynchronous capability audit before initializing audio/video subsystems:
```typescript
interface SystemCapabilities {
  webgpu: boolean;
  webgl2: boolean;
  webcodecs: {
    videoDecoder: boolean;
    videoEncoder: boolean;
    h264: boolean;
    vp9: boolean;
    av1: boolean;
  };
  opfs: boolean;
  audioContext: boolean;
  offscreenCanvas: boolean;
  quotaEstimatedBytes: number;
}
```
If an API is unavailable, the editor displays an informational badge in the status bar and activates the appropriate fallback pathway without blocking application launch.

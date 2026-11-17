# FRAMEFLOW Architecture Specification: Browser Media Pipeline
**Document ID:** `ARCH-MED-001`  
**Classification:** Low-Level Media Decoding & Demuxing Architecture  
**Version:** 2.0  

---

## 1. WebCodecs Ingest & Decode Architecture

```mermaid
flowchart LR
    File["Local Video File (Blob/File)"] --> WASM["WASM Demuxer (Mediabunny / MP4Box)"]
    WASM --> Chunks["EncodedVideoChunk Stream"]
    Chunks --> Decoder["WebCodecs VideoDecoder (Hardware)"]
    Decoder --> Frames["VideoFrame (GPU Texture Ref)"]
    Frames --> Renderer["WebGPU Compositor"]
    Renderer --> Canvas["Output Viewport Canvas"]
```

---

## 2. Low-Level Components
1. **Container Demuxing (WASM / WebAssembly):**
   - WebCodecs does not parse media containers (`.mp4`, `.mov`, `.webm`, `.mkv`).
   - FRAMEFLOW uses compiled WebAssembly modules (Mediabunny / MP4Box) running inside a dedicated Web Worker to extract elementary bitstreams, packet timestamps, and keyframe indexes (SPS/PPS/IDR).
2. **Hardware Decoding (`VideoDecoder`):**
   - Configured with codec description strings (e.g. `avc1.640028` for H.264 High Profile, `hev1.1.6.L93.B0` for HEVC, `vp09.00.41.08` for VP9, `av01.0.08M.08` for AV1).
   - Ingests `EncodedVideoChunk` instances (type: `'key'` or `'delta'`) and outputs zero-copy `VideoFrame` objects.
3. **Variable Frame Rate (VFR) Immunity:**
   - Smartphone and screen recordings with variable frame rates cause severe audio desynchronization in Premiere Pro.
   - FRAMEFLOW normalizes timestamps against the sequence timebase during demuxing, creating a virtual Constant Frame Rate (CFR) playback index.
4. **HTML5 Video Fallback:**
   - When an unparseable container or unsupported WebCodecs profile is encountered, FRAMEFLOW smoothly degrades to native `<video>` element decoding via an OffscreenCanvas capture loop.

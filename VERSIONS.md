# FRAMEFLOW — Repository Version History

This single repository maintains all versions of **FRAMEFLOW**, tracked via dedicated release branches, tags, and milestones.

---

## Branch & Release Index

| Version | Status | Git Branch | Git Tag | Description |
| :--- | :--- | :--- | :--- | :--- |
| **V1 (M0)** | Released | [`v1`](https://github.com/ayushrokad/Video-Editor/tree/v1) | [`v1.0.0`](https://github.com/ayushrokad/Video-Editor/releases/tag/v1.0.0) | Web Platform Foundation, Browser Capability Diagnostics, Media Feasibility PoC, and Complete 5,000+ line Competitor Intelligence Research Library. |
| **V2 (M1/M2)** | **Current / Active** | [`v2`](https://github.com/ayushrokad/Video-Editor/tree/v2) | [`v2.0.0`](https://github.com/ayushrokad/Video-Editor/releases/tag/v2.0.0) | Connected Non-Linear Editing Platform: Dynamic Resizable Panel Manager, Real Media Bins, Source/Program Dual Monitors, Multitrack Timeline with Trimming/Splitting, Contextual Inspector, Command Undo/Redo, and IndexedDB Persistence. |
| **V3 (M3/M4)** | Planned | `v3` | `v3.0.0` | Web Audio Multichannel DSP Routing & Mixing Console, WebGPU Real-Time Transition Shaders, Sub-Frame Audio Waveforms, and Export Queue. |

---

## How to Switch Versions in Git

To switch to **Version 1**:
```bash
git checkout v1
```

To switch to **Version 2**:
```bash
git checkout v2
```

To stay on the latest production release:
```bash
git checkout main
```

---

## Detailed Version Changelog

### Version 2.0.0 — Connected Editing Engine & Dynamic Panels
- **Central Project State:** Single source of truth linking Bins, Source Monitor, Program Monitor, Timeline, and Inspector.
- **Dynamic Panel Manager:** Drag-to-resize splitters (horizontal and vertical), panel maximization (`~` or header button), and strict 1920x1080 viewport without page scrolling.
- **Real Media Management:** Zero-upload local video/audio/image ingestion with metadata extraction and custom bins.
- **Source & Program Monitors:** Master raw footage player with In/Out marking, and sequence compositor that renders active clips at playhead time with live transforms and color grading.
- **Multitrack Timeline:** Real tracks (`V2`, `V1`, `A1`, `A2`), clip dragging, sub-frame edge trimming, razor cut tool (`C` or `Ctrl+K`), and snapping.
- **Contextual Inspector:** Granular sliders for Position, Scale, Rotation, Opacity, Exposure, Contrast, and Gain with instant live preview.
- **Command System & Undo/Redo:** History stack supporting `Ctrl+Z` (Undo) and `Ctrl+Shift+Z` / `Ctrl+Y` (Redo).
- **IndexedDB Persistence:** Automatic debounced autosave to `frameflow_db` and session restore on refresh.

### Version 1.0.0 — Web Foundation & Competitor Research Library
- **Web Monorepo Setup:** Turborepo, pnpm workspaces, strict TypeScript configuration.
- **Browser Capability Diagnostics:** Real-time auditing of WebGPU, WebGL 2, WebCodecs, Web Audio API, and OPFS storage.
- **Media & GPU Feasibility Proof-of-Concepts:** Local video import and WebGPU (WGSL) / WebGL 2 (GLSL) color adjustment shader pipelines.
- **Comprehensive Competitor Intelligence Research Library:** 27 canonical documents covering Premiere Pro, DaVinci Resolve, After Effects, Final Cut Pro, 5-tier settings taxonomy, 14-menu architecture, and studio facility workflows.

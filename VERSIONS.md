# FRAMEFLOW — Repository Version History

This single repository maintains all versions of **FRAMEFLOW**, tracked via dedicated release branches, tags, and milestones.

---

## Branch & Release Index

| Version | Status | Git Branch | Git Tag | Description |
| :--- | :--- | :--- | :--- | :--- |
| **V1 (M0)** | Released | [`v1`](https://github.com/ayushrokad/Video-Editor/tree/v1) | [`v1.0.0`](https://github.com/ayushrokad/Video-Editor/releases/tag/v1.0.0) | Web Platform Foundation, Browser Capability Diagnostics, Media Feasibility PoC, and Complete 5,000+ line Competitor Intelligence Research Library. |
| **V2 (M1/M2)** | Released | [`v2`](https://github.com/ayushrokad/Video-Editor/tree/v2) | [`v2.0.0`](https://github.com/ayushrokad/Video-Editor/releases/tag/v2.0.0) | Connected Non-Linear Editing Platform: Dynamic Resizable Panel Manager, Real Media Bins, Source/Program Dual Monitors, Multitrack Timeline with Trimming/Splitting, Contextual Inspector, Command Undo/Redo, and IndexedDB Persistence. |
| **V3 (M3)** | **Current / Active** | [`v3`](https://github.com/ayushrokad/Video-Editor/tree/v3) | [`v3.0.0`](https://github.com/ayushrokad/Video-Editor/releases/tag/v3.0.0) | Professional UI, Timeline UX & Keyboard System: Standardized Google Material Symbols Rounded, 4-Zone Professional Timeline (`V`, `A`, `B`, `N`, `R`, `C`, `Y`, `U`, `P`, `H`, `Z`, `T`), Visual Keyboard Shortcuts Customizer Modal with NLE Preset Switching, 6 Specialist Workspaces (`Media`, `Edit`, `Motion`, `Color`, `Audio`, `Deliver`), Master Audio Stereo VU Meter, and Export Queue. |
| **V4 (M4)** | Planned | `v4` | `v4.0.0` | Web Audio Multichannel DSP Routing Console, WebGPU Real-Time Transition Shaders, and Offline Video Export Engine. |

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

To switch to **Version 3**:
```bash
git checkout v3
```

To stay on the latest production release:
```bash
git checkout main
```

---

## Detailed Version Changelog

### Version 3.0.0 — Professional UI, Four-Zone Timeline & Keyboard System
- **Unified Design System & Material Symbols Rounded:** Complete replacement of mixed emoji/Unicode icons with Google Material Symbols Rounded (`near_me`, `content_cut`, `tune`, `palette`, `graphic_eq`, `fullscreen`, etc.).
- **Strict 1920 × 1080 Viewport Lock:** 100vh lock (`overflow: hidden`) preventing browser page scrollbars with independent panel scrolling.
- **Four-Zone Timeline Architecture:**
  - **Zone A (Timeline Toolbar):** Professional tools for Selection (`V`), Track Select (`A`), Ripple Edit (`B`), Rolling Edit (`N`), Rate Stretch (`R`), Razor Cut (`C`), Slip (`Y`), Slide (`U`), Pen (`P`), Hand (`H`), Zoom (`Z`), Text (`T`), Snapping (`S`), Linked Selection (`Ctrl+L`), and Track Adders.
  - **Zone B (Track Control Headers):** Track target patches (`V1`/`A1`), visibility/mute toggles, solo monitors, track locks, and user-editable track names.
  - **Zone C (Time Ruler & Playhead):** Frame-accurate ticks, timecode markers, In/Out range, and smooth scrubbable playhead needle.
  - **Zone D (Clip Canvas):** Color-coded tracks (Video `#2563eb`, Audio `#059669`, Motion `#7c3aed`), trim handles, effect badges, and waveform graphics.
- **Master Audio Stereo VU Meter:** Dual L/R vertical peak meters beside timeline with dynamic audio-reactive dB display (-60dB to 0dB).
- **Visual Keyboard Shortcuts Customizer Modal:** Interactive virtual QWERTY keyboard (`Ctrl+Alt+K` or `Edit > Keyboard Shortcuts...`) with NLE preset switching (`FRAMEFLOW Default`, `Adobe Premiere Pro`, `DaVinci Resolve`, `Final Cut Pro`), color-coded categories, and command search.
- **Scoped Keyboard Engine:** Input field protection preventing keystrokes from firing during text entry, panel focus tracking, and full J-K-L shuttle playback controls.
- **Six Specialist Workspaces:** `Media`, `Edit` (default), `Motion` (After Effects style), `Color` (Resolve style with 3-way wheels), `Audio` (Fairlight style mixer), and `Deliver` (Export Queue).

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

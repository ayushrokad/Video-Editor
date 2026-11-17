# FRAMEFLOW — Repository Version History

This single repository maintains all versions of **FRAMEFLOW**, tracked via dedicated release branches, tags, and milestones.

---

## Branch & Release Index

| Version | Status | Git Branch | Git Tag | Description |
| :--- | :--- | :--- | :--- | :--- |
| **V1 (M0)** | Released | [`v1`](https://github.com/ayushrokad/Video-Editor/tree/v1) | [`v1.0.0`](https://github.com/ayushrokad/Video-Editor/releases/tag/v1.0.0) | Web Platform Foundation, Browser Capability Diagnostics, Media Feasibility PoC, and Complete 5,000+ line Competitor Intelligence Research Library. |
| **V2 (M1/M2)** | Released | [`v2`](https://github.com/ayushrokad/Video-Editor/tree/v2) | [`v2.0.0`](https://github.com/ayushrokad/Video-Editor/releases/tag/v2.0.0) | Connected Non-Linear Editing Platform: Dynamic Resizable Panel Manager, Real Media Bins, Source/Program Dual Monitors, Multitrack Timeline with Trimming/Splitting, Contextual Inspector, Command Undo/Redo, and IndexedDB Persistence. |
| **V3 (M3)** | Released | [`v3`](https://github.com/ayushrokad/Video-Editor/tree/v3) | [`v3.0.0`](https://github.com/ayushrokad/Video-Editor/releases/tag/v3.0.0) | Professional UI, Timeline UX & Keyboard System: Standardized Google Material Symbols Rounded, 4-Zone Professional Timeline, Visual Keyboard Shortcuts Customizer Modal, 6 Specialist Workspaces, Master Stereo VU Meter, and Export Queue. |
| **V4 (M4)** | Released | [`v4`](https://github.com/ayushrokad/Video-Editor/tree/v4) | [`v4.0.0`](https://github.com/ayushrokad/Video-Editor/releases/tag/v4.0.0) | Professional Interface Redesign & Adaptive Workspace System: Unified 34px Application Chrome, Tabbed/Split Monitor Group (`Source` \| `Program`), Sleek Empty States, Timeline Display Settings Popover, Direct Asset Drag-and-Drop onto Track Lanes, Progressive Disclosure Accordion Inspector, and Refined Charcoal Design Tokens. |
| **V5 (M5)** | Released | [`v5`](https://github.com/ayushrokad/Video-Editor/tree/v5) | [`v5.0.0`](https://github.com/ayushrokad/Video-Editor/releases/tag/v5.0.0) | Six Distinct Specialist Workspaces (`Media`, `Edit`, `Motion`, `Color`, `Audio`, `Deliver`), Reorganized 13-Menu Hierarchy, `align_horizontal_center` Snapping with Snap Guide & Alt-Override, Timeline Context Menus, Web Audio Multichannel DSP Mixer, 10-Category Transition Engine, and Deliver Render Queue. |
| **V6 (M5 Hardening)** | Released | [`v6`](https://github.com/ayushrokad/Video-Editor/tree/v6) | [`v6.0.0`](https://github.com/ayushrokad/Video-Editor/releases/tag/v6.0.0) | 4-Layer Persistent State Architecture (`projectState`, `sessionState`, `workspaceState`, `runtimeState`) with IndexedDB v2 + Media Blob Rehydration & Relink Media, Real Program Monitor Video Decoding, Distinct Source/Program Controls, and Viewport-Clamped Docking/Redocking Layout Manager. |
| **V7 (M6)** | **Current / Active** | [`v7`](https://github.com/ayushrokad/Video-Editor/tree/v7) | [`v7.0.0`](https://github.com/ayushrokad/Video-Editor/releases/tag/v7.0.0) | Linked Video + Audio Editing (`linkGroupId`, Linked Selection `Shift+L`, Link `Ctrl+L` / Unlink `Ctrl+Shift+L`, Linked Move/Trim/Split/Delete, Out-of-Sync Badges & `Move Into Sync`) + Professional Deliver Export Studio (Quick/Advanced Modes, Categorized Formats, Custom Presets, Real MP4/WebM/WAV PCM/PNG/JPEG Backends, SRT Export, Post-Export Media Probing Validation & Multi-Deliverable Queue). |

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

To switch to **Version 4**:
```bash
git checkout v4
```

To switch to **Version 5**:
```bash
git checkout v5
```

To stay on the latest production release:
```bash
git checkout main
```

---

## Detailed Version Changelog

### Version 5.0.0 — Specialist Workspaces, Timeline Upgrade & Connected Engine Subsystems (Milestone M5)
- **Six Genuinely Distinct Workspaces:**
  - `Media`: Large Tabular Media Browser (Name, Type, Resolution, Duration, File Size, quick insert), Source Preview, and Clip Metadata Inspector.
  - `Edit`: Compact Project Bins, Unified Tabbed/Split Source & Program Monitor, Contextual Accordion Inspector, and Full-Width Four-Zone Timeline.
  - `Motion`: 10-Category Effects & Transitions Library, Composition Viewer with Safe Margins, Effect Controls, and Keyframe Graph Editor Drawer.
  - `Color`: Sequence Shots & LUT Presets Gallery, Grading Viewer, Live Pixel-Sampled RGB Histogram Scope, and 4 Interactive Primary Color Wheels (Lift, Gamma, Gain, Offset).
  - `Audio`: Full-Width Multitrack Audio Timeline above a Fairlight-Style Mixing Console with per-track channel strips, 4 Post Buses (`Dialogue`, `Music`, `SFX`, `Ambience`), Master Bus with Limiter, 3-Band Parametric EQ Rack, and Real-Time EBU R128 LUFS / True Peak Loudness Meter.
  - `Deliver`: Output Preview Monitor, Comprehensive Export Settings + Live Browser Codec Capability Matrix, and Functional Render Queue with real downloadable output via Canvas `captureStream` + `MediaRecorder`.
- **Snapping Upgrade & Independent Timeline Controls:** Replaced MAGNET text with `align_horizontal_center` icon, persisted snapping state, added vertical cyan Snap Guide line while dragging, and temporary `Alt`-key snap bypass. Grouped Timeline Toolbar into 4 sections (Editing Tools · Behaviour · Display · Navigation).
- **Dynamic Right-Click Context Menus:** Contextual menus for Video Clips, Audio Clips, Track Headers (rename, color, lock, add/delete), Time Ruler (markers, Mark In/Out), and Empty Timeline.
- **Reorganized 13-Menu Hierarchy & Floating Panels:** Full `File`, `Edit`, `Project`, `Clip`, `Sequence`, `Timeline`, `Graphics`, `Effects`, `Audio`, `Color`, `View`, `Window` (live panel checkmarks & custom saved workspaces), and `Help` (Runtime Engine Diagnostics modal).
- **Honest Runtime Diagnostics:** Real probing of `navigator.gpu` (WebGPU vs WebGL2 vs Canvas 2D Fallback), `AudioContext` state/sample rate, measured RAF FPS, dropped frames, and export codec support.

### Version 4.0.0 — Professional Interface Redesign & Adaptive Workspace System (Milestone M4)
- **Streamlined 34px Unified Application Header:** Consolidated Logo, 14-menu bar, Workspace Switcher, Project Title, Save badge, Undo/Redo, and Export into a compact single-bar layout to maximize editing vertical real estate.
- **Unified Tabbed / Split Monitor Group:** Merged Source and Program Monitors into a tabbed panel group by default (`Source` | `Program: Master`) with a 1-click **Split View** toggle for side-by-side comparison.
- **Clean Empty States:** Added structured, actionable empty state cards for both Source Monitor and Program Monitor when no footage or clips are loaded.
- **Refined Charcoal Design Tokens:** Applied quiet, cohesive dark tokens (`#11151C` app bg, `#181E28` panel bg, `#1D2531` headers, `#0E1218` timeline, `#2B3442` 1px borders, `#4B8DFF` restrained accent).
- **Compact Integrated Timeline Toolbar & Display Settings Popover:** Replaced oversized buttons with compact icon-only controls (`magnet`, `link`, 12 tools) and added a **Timeline Display Settings** wrench menu toggling Video Thumbnails, Audio Waveforms, Clip Names, Keyframes, Effects Badges, Markers, and Compact Track Height.
- **Direct Asset Drag-and-Drop onto Track Lanes:** Users can drag assets directly from the Project Bin onto specific Video/Audio track lanes at exact timeline coordinates.
- **Progressive Disclosure Accordion Inspector:** Replaced static stacks with collapsible accordion sections (`Master Sequence Settings`, `Project Overview`, `Video Transform`, `Real-Time GPU Color Grading`, `Crop & Edge Inset`, `Audio Gain & Pan`, `Audio Fades`).
- **Asset Search Filter:** Live search bar inside the Project panel to filter clips and bins instantly.

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

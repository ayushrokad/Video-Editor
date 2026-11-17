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
| **V7 (M6)** | Released | [`v7`](https://github.com/ayushrokad/Video-Editor/tree/v7) | [`v7.0.0`](https://github.com/ayushrokad/Video-Editor/releases/tag/v7.0.0) | Linked Video + Audio Editing (`linkGroupId`, Linked Selection `Shift+L`, Link `Ctrl+L` / Unlink `Ctrl+Shift+L`, Linked Move/Trim/Split/Delete, Out-of-Sync Badges & `Move Into Sync`) + Professional Deliver Export Studio (Quick/Advanced Modes, Categorized Formats, Custom Presets, Real MP4/WebM/WAV PCM/PNG/JPEG Backends, SRT Export, Post-Export Media Probing Validation & Multi-Deliverable Queue). |
| **V8 (M7)** | Released | [`v8`](https://github.com/ayushrokad/Video-Editor/tree/v8) | [`v8.0.0`](https://github.com/ayushrokad/Video-Editor/releases/tag/v8.0.0) | Removable, Dockable, Pinnable, Context-Aware 5-Tab Properties Panel (`Properties`, `Audio`, `Effects`, `Motion`, `Metadata`), Applied Effects Stack (Add/Toggle/Reorder/Remove + Live Render), Transform Keyframes & Easing, Multi-Selection `Mixed` Indicators, Relocated `Project Settings` & `Sequence Settings` Modals, Optional `History` & `Markers` Panels, and Quick Layout Presets (`Default Editing`, `Compact Editing`, `Dual Monitor`). |
| **V9 (M8)** | **Current / Active** | [`v9`](https://github.com/ayushrokad/Video-Editor/tree/v9) | [`v9.0.0`](https://github.com/ayushrokad/Video-Editor/releases/tag/v9.0.0) | Customizable Recursive Docking, Tabbed & Stacked Panel Architecture (44-Panel Registry across 7 Domains, 5-Zone Drag-and-Drop Docking Previews, Solo Mode, Floating & Redocking, 9 Built-in + Custom Workspaces, Central Keyboard Shortcut Registry), Separated IndexedDB v3 Storage Domains + Storage Diagnostics Panel, and Intelligent 1.5s Debounced Project Autosave with Revision Tracking, Serialized Save Queue, 6-State Save Status UI, and Save Diagnostics. |

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

### Version 9.0.0 — Customizable Docking & Panel Architecture, Separated IndexedDB Storage & Intelligent Autosave (Milestone M8)
- **Recursive Docking, Tabbed & Stacked Panel Engine (`apps/web/public/js/panel-manager.js`, `apps/web/public/js/layout-manager.js`):**
  - Replaced fixed column rows with a recursive horizontal/vertical dock tree (`split` + `group` nodes) with lossless DOM reparenting (never destroys live `<video>` decoders, Program `<canvas>`, or timeline scroll state).
  - Full 5-zone pointer drag-and-drop previews (`Add as Tab`, `Dock Left`, `Dock Right`, `Dock Top`, `Dock Bottom`), drag-to-reorder tabs, drag entire panel groups, tab overflow dropdown (`»`), double-click maximize/restore, right-click panel menus, and viewport-clamped floating windows with corner resize and Redock.
  - Optional **Stacked Panel Groups** with expand/collapse, **Solo Mode**, stacked header reordering, and drag-out-of-stack.
- **Central Panel Registry & 9 Workspaces (`apps/web/public/js/panel-registry.js`, `apps/web/public/js/panel-views.js`):**
  - Registered 44 panels across 7 operational domains (`MEDIA`, `EDITING`, `MOTION`, `COLOR`, `AUDIO`, `DELIVER`, `SYSTEM`) with 36 live implemented views and 8 honestly labeled `Not Yet Available` planned slots.
  - 9 built-in workspaces (`Editing`, `Effects`, `Color`, `Audio`, `Graphics`, `Deliver`, `Media Management`, `Minimal Editing`, `Dual Viewer`) plus Custom Workspaces (Save, Save As New, Rename, Duplicate, Delete, Reset Current, Restore Defaults, drag-reorder workspace bar) and dynamic `Window` menu.
- **Central Keyboard Shortcut Registry (`apps/web/public/js/shortcut-registry.js`):**
  - Command & shortcut search, rebind, remove (`Clear`), conflict detection with one-click resolution, NLE presets (`FRAMEFLOW`, `Premiere Pro`, `DaVinci Resolve`, `Final Cut Pro`), JSON import/export, workspace (`Alt+Shift+1`–`9`) & panel (`Shift+1`–`8`, `` ` ``) shortcuts, and input-field suppression.
- **Separated IndexedDB v3 Storage Domains & Storage Diagnostics (`apps/web/public/js/state-store.js`, `apps/web/public/js/storage-diagnostics.js`):**
  - Organized persistence into 3 categories across separated stores: Project Storage (`projects`, `timeline`, `media`, bounded `history` max 5 snapshots, protected `media_blobs`), Regenerable Media Cache (`cache` with 50 MB LRU eviction), and Lightweight Workspace Preferences (`workspaces`, `session`).
  - Added File System Access API (`FileSystemFileHandle`) preference with content-fingerprint deduplication, zero-write boot hydration, and live **Storage Diagnostics** panel (`Help > Storage Diagnostics Panel`) with **Inspect Storage**, **Clear Regenerable Cache**, **Remove Old Snapshots**, and **Verify Project Integrity**.
- **Intelligent Project Autosave & Dirty-State Architecture (`apps/web/public/js/autosave-manager.js`):**
  - Strictly decoupled persistent Project Document mutations from Workspace Preferences and temporary UI interactions (switching workspaces, selecting clips, scrubbing playhead, zooming/scrolling, or toggling panels perform **0** project saves and never touch the Project Saved timestamp).
  - Monotonic `currentRevision` vs `lastSavedRevision` tracking, content-fingerprint change detection, 1.5s debounced autosave coalescing rapid edits, serialized async save queue (captures mid-save edits cleanly), safe error recovery (`Save failed` + **Retry** preserving in-memory edits), 6-state toolbar status pill (`Saved`, `Unsaved changes`, `Saving...`, `Save failed`, `Offline`, `Recovering...`), and **Save Diagnostics** under `File → Project Information & Save Diagnostics`.
- **Automated Verification:** Expanded unit & regression test suite to **41 passing tests** (`panel-architecture.test.js`, `shortcut-registry.test.js`, `storage-audit.test.js`, `autosave-manager.test.js`).

### Version 8.0.0 — Context-Aware Optional Properties Panel, Applied Effects, Keyframes & Layout Presets (Milestone M7)
- **Removable, Dockable, Floating & Pinnable Properties Panel:** Replaced the permanent Inspector with an optional `Properties` panel toggleable via the top header toggle (`Properties`), `Window > Properties`, and panel Close (`×`) button. Closing or undocking Properties immediately expands the Monitor workspace and NEVER alters active timeline selections or project state.
- **5 Context-Aware Tabs (`Properties`, `Audio`, `Effects`, `Motion`, `Metadata`):**
  - `Properties`: Transform (Position X/Y, Scale, Rotation, Opacity), Compositing Blend Modes, Crop & Framing, Speed/Reverse, and Title Typography.
  - `Audio`: Volume (dB), Stereo Pan, Channel Config, and Fade In/Out (automatically prioritized when an audio clip is selected, and seamlessly accessible alongside video for linked V+A clips).
  - `Effects`: Per-clip Applied Effects stack (Color Balance & Exposure, Gaussian Blur, Cinematic Vignette, Monochrome/B&W, Warm Sepia Tone, Color Invert) with live Add, Enable/Disable, Reorder Up/Down, Remove, and parameter editing—strictly separate from the Effects Library.
  - `Motion`: Per-property keyframe stopwatches (`positionX`, `positionY`, `scale`, `rotation`, `opacity`), easing selector (`linear`, `smooth`, `ease-in`, `ease-out`), live keyframe interpolation in the Program Monitor, and direct Graph Editor link.
  - `Metadata`: Original filename, resolution, source duration, MIME/codec, file size, Online/Offline status, and 1-click Relink Media.
- **Clean Empty State, Multi-Selection `Mixed` Badges & Pinning:** Empty selection displays a compact prompt instead of sequence/project bloat. Multi-selection surfaces shared editable properties with honest `Mixed` badges when values differ. Pinning locks inspection to a specific clip ID while you browse or edit elsewhere on the timeline.
- **Relocated Settings & Optional Utility Panels:** Moved Project Settings to `Project > Project Settings...` modal, Sequence Settings to `Sequence > Sequence Settings...` modal, Asset/Clip counts to the Project Panel footer strip, and added toggleable `History` and `Markers` panels under `Window > Panels`.
- **Quick Layout Presets:** Added `Window > Layout Presets` (`Default Editing`, `Compact Editing` with Properties closed, and `Dual Monitor` split view).

### Version 7.0.0 — Linked Video + Audio Editing & Professional Deliver Export Studio (Milestone M6)
- **Linked Video + Audio Editing (`apps/web/public/js/linked-clips.js`):** Media containing both video and audio spawns paired clips sharing a `linkGroupId`. Linked Selection (`Shift+L`) supports unified select, move, trim, split, and delete; `Ctrl+L` / `Ctrl+Shift+L` links/unlinks clips; `Alt`-click temporarily overrides linked selection; out-of-sync clips show explicit frame/second offset badges with 1-click `Move Into Sync`.
- **Professional Deliver Export Studio (`apps/web/public/js/export-pipeline.js`):** Quick & Advanced export modes, capability-driven categorized format registry, custom user presets, real MP4/WebM video encoding, real 16-bit PCM RIFF `.wav` audio export, PNG/JPEG still-frame export, SRT subtitle sidecar generation, post-export media probing validation, and multi-deliverable batch queue.

### Version 6.0.0 — 4-Layer Persistence, Real Program Decoding & Viewport-Clamped Docking (Milestone M5 Hardening)
- **4-Layer Persistent State Store (`apps/web/public/js/state-store.js`):** Separated `projectState`, `sessionState`, `workspaceState`, and `runtimeState` in IndexedDB v2 with `visibilitychange` flush and media blob rehydration + Relink Media.
- **Distinct Source & Program Monitors:** Separate In/Out/Insert/Overwrite Source controls vs. sequence Loop/Safe Margins/Overlays/Compare/Fullscreen Program controls with real HTMLVideoElement frame decoding.
- **Structured Docking & Floating Layout Manager (`apps/web/public/js/layout-manager.js`):** Viewport-clamped normalized floating coordinates and reliable Redock/Reset Current Workspace/Reset All Workspaces actions.

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

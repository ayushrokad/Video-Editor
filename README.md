# FRAMEFLOW — Professional Browser-Based Video Editing Platform

> **Professional editing. Zero installation.**
> High-performance, open-source non-linear video editing (NLE) built for modern web standards using WebCodecs, WebGPU, Web Audio API, and Origin Private File System (OPFS).

---

## 1. Product Vision & Architecture
FRAMEFLOW bridges the gap between heavyweight desktop NLEs (Adobe Premiere Pro, DaVinci Resolve) and cloud video platforms. It provides professional editors with a familiar multi-track timeline, dual source/program monitors, sub-frame trimming, keyframed motion graphics, node-ready color grading, and comprehensive audio routing—operating directly within desktop browsers.

### Version Releases & Branches
All versions of the project are maintained within this single repository:
- **[Version 1 (V1)](https://github.com/ayushrokad/Video-Editor/tree/v1):** Web Platform Foundation, Browser Diagnostics, and Competitor Intelligence Library.
- **[Version 2 (V2)](https://github.com/ayushrokad/Video-Editor/tree/v2):** Connected Non-Linear Editing Platform with Dynamic Panels, Real Media Bins, Multitrack Timeline, Trimming/Splitting, Contextual Inspector, and IndexedDB Persistence.
- **[Version 3 (V3)](https://github.com/ayushrokad/Video-Editor/tree/v3):** Professional UI, Four-Zone Timeline, Standardized Google Material Symbols Rounded, Scoped Keyboard System, Visual Shortcuts Customizer Modal, Six Specialist Workspaces, Stereo VU Meter, and Export Queue.
- **[Version 4 (V4)](https://github.com/ayushrokad/Video-Editor/tree/v4):** Professional Interface Redesign & Adaptive Workspace System: Streamlined 34px Unified Chrome, Tabbed/Split Monitor Group (`Source` | `Program`), Sleek Empty States, Timeline Display Settings Popover, Direct Asset Drag-and-Drop to Track Lanes, Progressive Disclosure Accordion Inspector, and Quiet Charcoal Design System.
- **[Version 5 (V5)](https://github.com/ayushrokad/Video-Editor/tree/v5):** Six Distinct Specialist Workspaces (`Media`, `Edit`, `Motion`, `Color`, `Audio`, `Deliver`), Reorganized 13-Menu Hierarchy, `align_horizontal_center` Snapping with Snap Guide & Alt-Override, Timeline Context Menus, Web Audio Multichannel DSP Mixer & Bus Routing, 10-Category Transition Engine, and Deliver Render Queue.
- **[Version 6 (V6 - Current)](https://github.com/ayushrokad/Video-Editor/tree/v6):** 4-Layer Persistent State Architecture (`projectState`, `sessionState`, `workspaceState`, `runtimeState`) with IndexedDB v2 + `visibilitychange` Flush, Real Program Monitor Video Decoding + Media Blob Rehydration & Relink Media, Distinct Source Monitor (Scrubber, In/Out Bar, Clear I/O, Insert, Overwrite, Drag Range, Audio Channels) vs. Program Monitor (Loop, Overlays, Compare Wipe, Fullscreen), and Viewport-Clamped Structured Docking & Redocking Manager.
- See [VERSIONS.md](VERSIONS.md) for the complete version changelog and branch guide.

### Key Architectural Pillars
- **Local-First Privacy & Performance:** Footage stays on the local device via the File System Access API and OPFS. Zero upload delay for local timeline assembly and playback.
- **Hardware-Accelerated In-Browser Engine:** Video decoding via WebCodecs, timeline compositing and real-time color grading via WebGPU (with WebGL 2 fallback), and DSP/metering via the Web Audio API.
- **Unified Editor with Specialist Workspaces:** Seamless transitions across `Media`, `Edit`, `Motion`, `Color`, `Audio`, and `Deliver` workspaces within a unified project model.
- **Cloud-Assisted Finishing:** Asynchronous cloud rendering with FFmpeg workers for high-complexity renders, proxy transcode queues, and multi-format exports.

---

## 2. Monorepo Structure
```
FRAMEFLOW/
├── apps/
│   └── web/                   # Next.js 14+ application (marketing, dashboard, editor studio)
├── packages/
│   ├── design-system/         # Tailwind design tokens, typography, dark theme primitives
│   ├── editor-ui/             # Dockable panels, menus, timeline UI components
│   ├── timeline-engine/       # Deterministic timebase, track management, trimming math
│   ├── project-engine/        # Project schema, undo/redo history, serialization
│   ├── media-engine/          # WebCodecs demuxing, metadata, frame caching
│   ├── playback-engine/       # JKL shuttle transport, playhead synchronization
│   ├── gpu-renderer/          # WebGPU shaders (WGSL), WebGL2 fallback, color pipeline
│   ├── audio-engine/          # Web Audio routing, multi-track mixing, peak/RMS meters
│   ├── export-engine/         # WebCodecs muxing, client export, cloud dispatch
│   ├── browser-storage/       # IndexedDB and OPFS storage drivers
│   ├── api-client/            # REST and WebSocket client contracts
│   └── shared-types/          # Canonical TypeScript types & interfaces
├── services/                  # Backend services (auth, project, render queue)
├── native/                    # WebAssembly modules and FFmpeg worker bindings
├── infrastructure/            # Docker, PostgreSQL schemas, Redis, S3 configs
├── docs/
│   ├── architecture/          # Engineering architecture specifications
│   ├── research/              # Comprehensive competitor research & UX library
│   ├── ux/                    # Interface blueprints and interaction designs
│   └── development/           # Browser compatibility matrix and testing guides
├── tests/                     # Unit, integration, and compatibility test suites
├── scripts/                   # Development, diagnostic, and build scripts
├── pnpm-workspace.yaml
├── package.json
├── turbo.json
└── AGENTS.md                  # Permanent agent instructions
```

---

## 3. Milestones Overview
- **M0 (Completed in V1):** Web Platform Foundation, Browser Capability Diagnostics, and Competitor Research Library.
- **M1 (Completed in V2):** Professional Dockable Editing Interface, Dynamic Resizable Panels, and Strict 1920x1080 Viewport.
- **M2 (Completed in V2):** Connected NLE Engine, Media Bins, Dual Monitors, Trimming Timeline, Inspector, and IndexedDB Autosave.
- **M3 (Completed in V3):** Unified Material Symbols Rounded, Four-Zone Timeline (12 tools), Scoped Keyboard System, Visual Shortcut Customizer Modal, 6 Specialist Workspaces, Stereo VU Meter, and Export Queue.
- **M4 (Completed in V4):** Professional Interface Redesign & Adaptive Workspace System: Unified 34px Application Chrome, Tabbed/Split Monitor Group, Sleek Empty States, Timeline Display Settings Popover, Direct Asset Drag-to-Timeline, Progressive Disclosure Accordion Inspector, and Refined Charcoal Tokens.
- **M5 (Completed in V5 - Current):** Six Distinct Specialist Workspaces, Reorganized 13-Menu Hierarchy, `align_horizontal_center` Snapping with Snap Guide & Context Menus, Web Audio Multichannel DSP Mixer & Buses, 10-Category Transition Shader Engine, Honest Runtime Diagnostics, and Deliver Offline Render Queue.
- **M5:** WebCodecs Hardware Video Decoding & Multi-Stream JKL Transport.
- **M6:** WebGPU Compositing, Blending Modes, and Real-Time Transition Shaders.
- **M7:** Motion Graph Editor with Bezier Keyframe Interpolation.
- **M8:** Full 3-Way Color Wheels & Scopes (Waveform, Vectorscope, Histogram).
- **M9:** Client Export and Asynchronous Cloud Rendering Workers.
- **M10:** Cloud Projects, Team Workspaces, and Review Links.
- **M11:** Cross-Browser Hardening and Performance Benchmarking.

---

## 4. Running FRAMEFLOW Studio Locally
```bash
# Run local HTTP server for FRAMEFLOW Studio
node scripts/serve.js

# Open browser directly to:
http://localhost:3000
```

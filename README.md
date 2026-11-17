# FRAMEFLOW — Professional Browser-Based Video Editing Platform

> **Professional editing. Zero installation.**
> High-performance, open-source non-linear video editing (NLE) built for modern web standards using WebCodecs, WebGPU, Web Audio API, and Origin Private File System (OPFS).

---

## 1. Product Vision & Architecture
FRAMEFLOW bridges the gap between heavyweight desktop NLEs (Adobe Premiere Pro, DaVinci Resolve) and cloud video platforms. It provides professional editors with a familiar multi-track timeline, dual source/program monitors, sub-frame trimming, keyframed motion graphics, node-ready color grading, and comprehensive audio routing—operating directly within desktop browsers.

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
- **M0 (Current):** Web Platform Foundation, Browser Capability Diagnostics, and Media/GPU Feasibility.
- **M1:** Marketing Website, Session Authentication, and Dashboard.
- **M2:** Professional Dockable Editing Interface & Layout Engine.
- **M3:** Browser Storage (IndexedDB + OPFS) and Project Engine.
- **M4:** Media Ingest, Metadata Extraction, and Bins.
- **M5:** WebCodecs Frame Decoding and JKL Playback Transport.
- **M6:** Multi-Track Timeline Engine (Ripple, Roll, Slip, Slide, Snapping).
- **M7:** WebGPU Compositing, Blending Modes, and Real-time Shader Effects.
- **M8:** Web Audio Engine, Multitrack Mixer, and Waveform Visualizer.
- **M9:** Client Export and Asynchronous Cloud Rendering Workers.
- **M10:** Advanced Keyframe Graph Editor and Transitions.
- **M11:** Color Scopes (Waveform, Vectorscope, Histogram) and Color Wheels.
- **M12:** Cloud Projects, Team Workspaces, and Review Links.
- **M13:** Cross-Browser Hardening and Performance Benchmarking.

---

## 4. Running M0 Feasibility Suite Locally
```bash
# Run local HTTP server for diagnostics and feasibility suite
node scripts/serve.js

# Or open browser directly to:
http://localhost:3000
```

# FRAMEFLOW — AGENTS.md
## Permanent Web Application Development Instructions

You are the principal architect and engineering agent for FRAMEFLOW.
FRAMEFLOW is an open-source, professional browser-based nonlinear video editing platform.
The goal is to build a genuine professional editing application, not a static prototype or a simple template-based video editor.

### 1. Approved Product Direction
- **Product:** FRAMEFLOW
- **Platform:** Browser-based web application
- **Editing Philosophy:** Professional-first
- **Interface Inspiration:** Adobe Premiere Pro
- **Product Architecture:** Unified editor with specialist workspaces
- **Distribution:** Open-source
- **Primary Target:** Modern desktop browsers (Chromium / Firefox / Safari)
- **Secondary Target:** Tablet
- **Mobile:** Project review and supported lightweight operations

### 2. Approved Technology Stack
- **Frontend Core:** Next.js, React, TypeScript
- **Bundling / Workspace:** Vite where appropriate for standalone editor packages, Turborepo, pnpm
- **UI Styling:** Tailwind CSS
- **State Management:** Zustand (UI & editor state), TanStack Query (server state & caching)
- **Rendering & Visualization:** Canvas 2D, WebGL 2, WebGPU
- **Media Pipeline:** WebCodecs, Web Workers, WebAssembly (demuxing/container parsing), Web Audio API
- **Local Storage:** IndexedDB (metadata & project tree), Origin Private File System (OPFS media cache & assets)
- **Backend & Cloud Services:** Node.js, PostgreSQL, Redis, FFmpeg, S3-compatible storage, Docker

### 3. Application Architecture
The frontend is separated into distinct operational domains:
- **Marketing website:** Landing, pricing, learning, community, docs
- **Authentication:** Session and token-based account security
- **User dashboard:** Project library, cloud asset management, user preferences
- **Project management:** Versioning, dependencies, team collaboration
- **Professional editing studio:** Independent client-side application module
  - The editing studio must run an independent client-side engine.
  - The editor's core project and timeline data models must remain decoupled from React component rendering cycles.

### 4. Media Architecture
- Prioritize browser-native processing whenever supported.
- Use **WebCodecs** for hardware-accelerated video/audio decoding and encoding.
- Use **WebGPU** for timeline composition, color grading, and shader effects.
- Provide a robust **WebGL 2** fallback for environments without WebGPU.
- Use **Web Workers** for all intensive decoding, demuxing, waveform generation, and background tasks.
- Use **WebAssembly** for compiled native container parsing (MP4, MOV, MKV) and codec bridging.
- Use the **Web Audio API** for real-time audio playback, node-based routing, metering, and mixing.
- Utilize **FFmpeg** on cloud rendering workers for high-fidelity offline exports, unsupported codecs, and heavy transcoding.
- Never assume universal browser codec or GPU support: implement runtime capability detection and graceful degradation.
- Never pass raw video frame buffers through normal React state or standard JSON API requests.
- Never rely on ephemeral browser storage as the sole copy of user project data.

### 5. Product Interface Standards
Maintain the approved professional menu hierarchy:
`File` · `Edit` · `Project` · `Clip` · `Sequence` · `Timeline` · `Markers` · `Graphics` · `Effects` · `Audio` · `Color` · `View` · `Window` · `Help`

Support the full professional operational surface:
- Dockable, resizable, tabbed panel groups.
- Saved workspace presets: `Media`, `Edit`, `Motion`, `Color`, `Audio`, `Deliver`.
- Rich context menus and deep keyboard shortcut bindings.
- Multi-track non-linear timeline with track targeting, ripple, roll, slip, slide, and snapping.
- Source Monitor and Program Monitor with precision timecode, playback controls, safe margins, and overlays.
- Contextual Inspector for transform, compositing, effects, audio gain, and keyframes.
- Multi-format professional export and render queue.

### 6. Engineering Standards
- Strict TypeScript configuration across all packages.
- Modular workspace architecture with explicit dependency graphs.
- Versioned project schemas with forward and backward migration paths.
- Non-destructive editing paradigms with complete undo/redo history stacks.
- Deterministic timeline operations and timebase conversions (drop-frame, non-drop-frame).
- Autosave with automatic crash recovery journals.
- Bounded memory caches and explicit resource lifecycle cleanup (textures, video frames, audio buffers).
- Accessible controls (WCAG AA contrast, keyboard focus management, screen reader labels).
- Secure client-side file access via the File System Access API and OPFS.

### 7. Performance Principles
- Never block the browser UI main thread with media processing.
- Offload decoding, demuxing, and analysis to dedicated Web Workers.
- Dynamically detect device capabilities (VRAM, compute units, codec support) before selecting execution pipelines.
- Monitor and respect browser storage quotas and evictions.
- Gracefully handle WebGPU device loss (`GPUDevice.lost`), tab background suspension, and decoder buffer exhaustion.
- Provide transparent, real-time performance diagnostics (live FPS, frame drop counters, decode latency, memory usage).

### 8. Cloud Services & Integration
- Cloud rendering and proxy generation must run asynchronously via queued workers and provide cancel/resume capabilities.
- Enforce strict authentication, signed upload/download URLs, and encrypted transport.
- Decouple media asset storage from relational project metadata.
- Never expose cloud credentials or private keys in client-side bundles.

### 9. Development Workflow Discipline
Before each milestone:
1. Inspect the existing repository.
2. Review architecture documentation and specifications.
3. Identify affected packages and boundaries.
4. Draft an implementation plan and verification tests.

After implementation:
1. Run automated tests and lint checks.
2. Build the web application and packages.
3. Verify end-to-end user workflows in target browsers.
4. Document technical decisions, constraints, and remaining gaps.
5. Never claim unimplemented functionality is complete.

### 10. Scope Discipline
- Build iteratively according to defined project milestones (M0 through M13).
- Do not produce non-functional UI mocks masquerading as working editing tools.
- Never sacrifice the integrity of the editing engine for surface visual polish.
- Keep the application runnable and verifiable at every stage.

### 11. Open-Source Stewardship
- Clean dependency licensing (MIT, Apache-2.0, BSD-3-Clause).
- Clear attribution and third-party notices.
- Comprehensive contributor guides and containerized deployment scripts.
- Maximum privacy: keep user media local-first whenever possible.

### 12. Final Objective
To engineer FRAMEFLOW into the definitive open-source, browser-based professional video editing platform—combining desktop-class speed, precision, and ergonomics with frictionless web accessibility.

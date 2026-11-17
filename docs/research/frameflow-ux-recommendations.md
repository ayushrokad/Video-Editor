# FRAMEFLOW — UX Architecture & Design Recommendations
**Document ID:** `RES-REC-001`  
**Classification:** Core UX Blueprint & Feature Specification  
**Version:** 2.0  
**Status:** Approved for Implementation  

---

## 1. Core Design Philosophy

> **The Guiding Principle:**  
> FRAMEFLOW must be immediately intuitive to any editor arriving from Premiere Pro or DaVinci Resolve, yet completely free from the legacy friction, panel sprawl, and platform locks of those tools.

### The Nine Pillars of FRAMEFLOW UX
1. **Traditional Multi-Track Editing as the Default:** Numbered video (`V1...Vn`) and audio (`A1...An`) tracks with explicit track patching and targeting.
2. **Optional Magnetic Timeline Behavior:** Toggleable with a single key (`M`) or toolbar button to enable collision-free assembly without breaking traditional track workflows.
3. **Flexible, Dockable Workspaces:** Pre-configured specialist presets (`Media`, `Edit`, `Motion`, `Color`, `Audio`, `Deliver`) within a single unified project shell.
4. **Contextual Single-Pane Inspector:** Eliminates panel hunting by consolidating Transform, Effects, Color, Audio, and Keyframes into one tabbed inspector.
5. **Universal Command Palette (`Ctrl+K` / `Cmd+K`):** Fast fuzzy-searchable launcher for every menu item, tool, effect, and shortcut.
6. **Strict 5-Tier Settings Taxonomy:** Clean separation of Application, Workspace, Project, Sequence, and Object properties.
7. **Transparent Performance Telemetry:** Real-time diagnostics for FPS, decode latency, dropped frames, and hardware utilization.
8. **Sub-Frame Audio Precision:** Sample-accurate audio waveforms and trimming for seamless J-cuts and click-free audio transitions.
9. **Non-Destructive Versioning:** Instant project snapshots and infinite undo history backed by local-first storage.

---

## 2. Feature-by-Feature Design Recommendations

---

### Recommendation 01: Hybrid Multi-Track Timeline with Magnetic Ripple Assist
- **User Problem Addressed:**  
  Editors in Premiere and Resolve spend significant time manually closing gaps or lassoing downstream clips after trimming. Conversely, editors in Final Cut Pro struggle when complex sound designs get jumbled across trackless storylines.
- **Competitor Behavior Inspiring It:**  
  Apple Final Cut Pro’s Magnetic Timeline vs. Premiere Pro’s targeted tracks.
- **What We Retain:**  
  Standard multi-track numbering, explicit source patching (`V1/A1`), sync locks, and track mute/solo buttons.
- **What We Improve:**  
  Introduce an optional **Magnetic Ripple Mode Toggle (`M`)**. When enabled, deleting a clip automatically collapses adjacent gaps on targeted tracks, and moving a primary clip ripples downstream media without manual gap management.
- **Where It Lives:**  
  Timeline Toolbar (top-left of the Timeline panel, adjacent to the Snapping Magnet icon).

---

### Recommendation 02: Unified Contextual Inspector
- **User Problem Addressed:**  
  In Premiere, changing scale requires opening the `Effect Controls` panel, adjusting audio requires `Audio Track Mixer`, color requires `Lumetri Color`, and transitions require the `Effects` panel. Editors waste hours clicking between tabs.
- **Competitor Behavior Inspiring It:**  
  DaVinci Resolve’s Inspector and Final Cut Pro’s contextual tabbed Inspector.
- **What We Retain:**  
  Deep granular control over parameters, numeric scrubby sliders, reset buttons, and keyframe diamond toggles.
- **What We Improve:**  
  A single, dockable panel that intelligently displays tabs based on selection:
  - If a Video Clip is selected: `Video` | `Audio` | `Effects` | `Color` | `Motion Curves`.
  - If a Text Layer is selected: `Text & Font` | `Style` | `Transform` | `Effects`.
  - If a Transition is selected: `Alignment` | `Duration` | `Curve Shape`.
- **Where It Lives:**  
  Right docking column of the application window (`Inspector Panel`).

---

### Recommendation 03: Inline Motion Graph Editor on Timeline Tracks
- **User Problem Addressed:**  
  Creating organic animation curves in Premiere is clunky and hidden within small drop-down sub-tracks. After Effects has the definitive Graph Editor, but roundtripping via dynamic link introduces severe playback lag and RAM bloat.
- **Competitor Behavior Inspiring It:**  
  Adobe After Effects Graph Editor (Speed Graph and Value Graph).
- **What We Retain:**  
  True Bezier handles, tangent angle control, and separate temporal/spatial interpolation.
- **What We Improve:**  
  Provide **Instant Easing Presets** (`Ease In`, `Ease Out`, `Smooth S-Curve`, `Exponential`, `Bounce`) for 90% of use cases directly in the Inspector, with a one-click button to expand the track into a full-height interactive **Inline Graph Editor** right on the timeline.
- **Where It Lives:**  
  Timeline track header toggle (`Show Graph Editor`) and Inspector Keyframes tab.

---

### Recommendation 04: Real-Time Performance & Diagnostics Monitor
- **User Problem Addressed:**  
  Editors frequently experience mysterious stuttering, dropped frames, or slow exports without any indication of whether the CPU, GPU, disk speed, or video codec is responsible.
- **Competitor Behavior Inspiring It:**  
  Chrome DevTools Performance tab and gaming telemetry overlays.
- **What We Retain:**  
  Sub-millisecond frame rendering timers and hardware adapter reporting.
- **What We Improve:**  
  A compact, non-intrusive status pill in the bottom-right status bar showing:
  - Live Playback FPS (`24.0 / 24.0 fps` in green, turns yellow/red if frames drop).
  - WebGPU vs CPU decode load percentage.
  - VFR (Variable Frame Rate) warning indicator with one-click background conform.
  - Expandable to a full Diagnostics Panel displaying render pipeline bottlenecks.
- **Where It Lives:**  
  Bottom application status bar (clickable pill) and `Window → Diagnostics`.

---

### Recommendation 05: Source Tape & Rapid Shot Discovery
- **User Problem Addressed:**  
  Opening 50 separate video clips one by one into the Source Monitor to find a 3-second B-roll shot is tedious and exhausting.
- **Competitor Behavior Inspiring It:**  
  DaVinci Resolve Cut Page "Source Tape".
- **What We Retain:**  
  Continuous linear playback of an entire folder/bin as if it were a single concatenated reel.
- **What We Improve:**  
  Support rapid dynamic shuttle (`J-K-L` up to 16x speed) with intelligent clip boundary markers, visual hover scrubbing, and instant In/Out append (`E`).
- **Where It Lives:**  
  Source Monitor panel toggle (`Clip View` vs `Source Tape View`).

---

### Recommendation 06: Roles-Based Audio Stem Management
- **User Problem Addressed:**  
  Exporting separate Dialogue, Music, and SFX stems in traditional NLEs requires complex manual track busing and mute/solo permutations that frequently result in exported stem errors.
- **Competitor Behavior Inspiring It:**  
  Apple Final Cut Pro’s Audio Roles and Fairlight bus assignments.
- **What We Retain:**  
  Visual color coding and semantic grouping (`Dialogue = Blue`, `Music = Green`, `SFX = Orange`).
- **What We Improve:**  
  Clips on any timeline track can be assigned an Audio Role. The Audio Mixer automatically provides designated Stem Submixes, and the Deliver workspace allows one-click export of isolated stems (`DX`, `MX`, `FX`, `Master`) in a single render pass.
- **Where It Lives:**  
  Audio Track Mixer, Clip Inspector (`Audio Tab`), and Export Settings dialog.

---

### Recommendation 07: Smart Media Search & Dependency Matrix
- **User Problem Addressed:**  
  Locating assets across large shoots or identifying missing offline files requires navigating clumsy OS file picker dialogs.
- **Competitor Behavior Inspiring It:**  
  Premiere Pro Productions and Final Cut Pro Smart Collections.
- **What We Retain:**  
  Metadata filtering by resolution, codec, framerate, and keyword tags.
- **What We Improve:**  
  Provide a dedicated **Media Dependencies Panel** that visualizes:
  - Missing or offline media with fuzzy one-click OPFS/local directory relinking.
  - Proxy relationships and cache storage utilization per clip.
  - Unused media identification with a one-click "Purge from Project" button.
- **Where It Lives:**  
  `Project → Media Manager` and `Window → Media Dependencies`.

---

## 3. Keyboard Shortcut Standard (The Universal Map)

To eliminate friction for migrating editors, FRAMEFLOW implements an intelligent switcher for keyboard shortcut presets (`FRAMEFLOW Default`, `Adobe Premiere Pro`, `DaVinci Resolve`, `Final Cut Pro`).

### FRAMEFLOW Default Core Shortcut Map
- **Transport:** `Spacebar` (Play/Stop), `J` (Reverse Shuttle), `K` (Pause), `L` (Forward Shuttle), `Shift+J/L` (Slow-Mo Shuttle).
- **Navigation:** `Left / Right Arrow` (Step 1 Frame), `Shift + Left / Right` (Step 10 Frames), `Up / Down Arrow` (Jump to Previous / Next Cut), `Home / End` (Jump to Start / End of Timeline).
- **Marking:** `I` (Mark In), `O` (Mark Out), `X` (Mark Clip), `Alt+X` (Clear In/Out), `M` (Add Marker), `Shift+M` (Marker with Notes).
- **Editorial:** `Q` (Ripple Trim Start to Playhead), `W` (Ripple Trim End to Playhead), `E` (Extend Edit to Playhead / Append to End), `C` / `Ctrl+K` (Razor Cut at Playhead), `V` (Selection Tool), `B` (Ripple Edit Tool), `N` (Rolling Edit Tool), `Y` (Slip Tool), `U` (Slide Tool).
- **Insertion:** `,` (Insert Edit), `.` (Overwrite Edit), `Shift+1` (Focus Media Browser), `Shift+2` (Focus Source Monitor), `Shift+3` (Focus Timeline), `Shift+4` (Focus Program Monitor), `Shift+5` (Focus Inspector).
- **Timeline Display:** `\` (Fit Entire Timeline to View), `+` / `-` (Zoom Timeline In / Out), `Ctrl+D` (Apply Default Video Dissolve), `Ctrl+Shift+D` (Apply Default Audio Crossfade).
- **Workspace Navigation:** `Ctrl+1...6` (Instantly switch between `Media`, `Edit`, `Motion`, `Color`, `Audio`, `Deliver`).
- **Power Features:** `Ctrl+K` (Universal Command Palette), `~` (Maximize Hovered Panel), `M` (Toggle Magnetic Mode).

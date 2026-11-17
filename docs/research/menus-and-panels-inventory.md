# FRAMEFLOW — Comprehensive Menus & Panels Inventory
**Document ID:** `RES-INV-001`  
**Classification:** Interface Taxonomy & Panel Engineering Specification  
**Version:** 2.0  
**Scope:** Cross-Platform Interface Comparison & FRAMEFLOW Interface Standard  

---

## 1. Cross-Product Main Menu Comparative Taxonomy

Every professional NLE relies on an authoritative top-level menu bar to expose exhaustive application functionality, assign keyboard shortcuts, and guarantee that any operation can be executed without a mouse.

| Standard Menu Category | Adobe Premiere Pro | DaVinci Resolve | Adobe After Effects | Apple Final Cut Pro | FRAMEFLOW Professional Standard |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Application / Root** | (Integrated into Edit/File) | `DaVinci Resolve` | (Integrated into Edit/File) | `Final Cut Pro` | **`File` / App Menu** |
| **File Operations** | `File` (New, Open, Import, Export) | `File` (Project Management) | `File` (Project, Import, Queue) | `File` (Library, Import, Share) | **`File`** |
| **Edit / History** | `Edit` (Undo, Redo, Cut, Paste) | `Edit` (History, Paste Attributes) | `Edit` (Purge, Duplicate) | `Edit` (Insert, Connect, Paste) | **`Edit`** |
| **Project / Library** | `Project Settings` (under File) | `Project Settings` (under File) | `Project Settings` (under File) | `Library` operations | **`Project` (Dedicated Top-Level)** |
| **Clip Operations** | `Clip` (Speed, Modify, Link, Nest) | `Clip` (Attributes, Speed, Audio) | `Layer` (Transform, Mask, Blend) | `Clip` (Open, Roles, Voice) | **`Clip`** |
| **Sequence / Timeline**| `Sequence` (Settings, Render, Gap) | `Timeline` (Tracks, Settings) | `Composition` (Settings, Trim) | `Modify` / Storyline commands | **`Sequence` & `Timeline`** |
| **Trimming Operations**| (Integrated in Sequence & Tools) | `Trim` (Slip, Slide, Dynamic) | (Keyframe Assistants) | `Trim` (Blade, Precision) | **`Timeline` / Contextual Trim** |
| **Markers** | `Markers` (In/Out, Add, Navigate) | `Mark` (In/Out, Keyframes) | `Animation` (Markers) | `Mark` (In/Out, Keywords) | **`Markers`** |
| **Motion & Graphics** | `Graphics and Titles` | (Inside Fusion / Text+) | `Layer` / `Animation` | `Titles & Generators` | **`Graphics`** |
| **Visual Effects** | (Inside Window & Effects panel) | (Inside Fusion / OpenFX) | `Effect` (Category submenus) | (Inside Inspector) | **`Effects`** |
| **Audio Routing/Mixing**| (Audio Clip/Track Mixers) | `Fairlight` (under View/Page) | (Rudimentary Audio panel) | (Audio Inspector / Roles) | **`Audio` (Dedicated Top-Level)** |
| **Color Grading** | (Lumetri Color panel) | `Color` (Nodes, Memories, LUTs) | (Layer Effects) | (Color Inspector) | **`Color` (Dedicated Top-Level)** |
| **View & Monitoring** | `View` (Resolution, Guides, Snapping)| `View` (Scopes, Timeline scroll) | `View` (Guides, Rulers, Zoom) | `View` (Filmstrip, Overlays) | **`View`** |
| **Window / Layout** | `Window` (Workspaces, Panel list) | `Workspace` (Primary display) | `Window` (Workspaces, Panels) | `Window` (Layout presets) | **`Window`** |
| **Help & Support** | `Help` (Docs, Feedback, About) | `Help` (Manual, Diagnostics) | `Help` (Docs, Diagnostics) | `Help` (Manual, Feedback) | **`Help`** |

---

## 2. The Approved FRAMEFLOW 14-Menu Architecture

```
[File]  [Edit]  [Project]  [Clip]  [Sequence]  [Timeline]  [Markers]  [Graphics]  [Effects]  [Audio]  [Color]  [View]  [Window]  [Help]
```

### Detailed Menu Item Specifications
1. **File:**
   - `New Project` (`Ctrl+Alt+N`), `Open Project...` (`Ctrl+O`), `Recent Projects ▶`, `Save Project` (`Ctrl+S`), `Save Project As...` (`Ctrl+Shift+S`), `Create Project Snapshot / Version` (`Ctrl+Alt+S`).
   - `Import Media...` (`Ctrl+I`), `Import Folder / Bin...`, `Import XML / EDL / OTIO...`.
   - `Export Media...` (`Ctrl+M`), `Quick Export...` (`Ctrl+Shift+E`), `Export Frame As Image...` (`Shift+E`), `Export Timeline as OTIO / XML...`.
   - `Project Recovery & Cache Cleanup...`, `Close Project`, `Exit Studio`.

2. **Edit:**
   - `Undo` (`Ctrl+Z`), `Redo` (`Ctrl+Shift+Z` / `Ctrl+Y`), `History`.
   - `Cut` (`Ctrl+X`), `Copy` (`Ctrl+C`), `Paste` (`Ctrl+V`), `Paste Insert` (`Ctrl+Shift+V`), `Paste Attributes...` (`Ctrl+Alt+V`), `Remove Attributes...`.
   - `Duplicate` (`Ctrl+D`), `Select All` (`Ctrl+A`), `Deselect All` (`Ctrl+Shift+A`), `Select Clip Under Playhead` (`D`).
   - `Delete` (`Del`), `Ripple Delete` (`Shift+Del`).
   - `Find in Timeline / Media Pool...` (`Ctrl+F`).
   - `Keyboard Shortcuts...` (`Ctrl+Alt+K`), `Preferences...` (`Ctrl+,`).

3. **Project:**
   - `Project Settings...` (Resolution, Frame Rate, Timebase, Color Management).
   - `Media Manager & Relinking...`, `Proxy Generation Queue...`, `Consolidate & Archive Project...`.
   - `Unlink Selected Clips`, `Relink Offline Media...`, `Purge Unused Assets`.

4. **Clip:**
   - `Modify ▶` (`Interpret Footage...`, `Audio Channels...`, `Timecode...`).
   - `Speed / Duration...` (`Ctrl+R`), `Enable / Disable Clip` (`V`).
   - `Split Clip at Playhead` (`Ctrl+K`), `Add Edit to All Tracks` (`Ctrl+Shift+K`).
   - `Link / Unlink Audio and Video` (`Ctrl+L`), `Group` (`Ctrl+G`), `Ungroup` (`Ctrl+Shift+G`).
   - `Nest Clips into New Sequence...`, `Make Compound Clip...`.
   - `Match Frame in Source Monitor` (`F`), `Reverse Match Frame` (`Shift+F`).

5. **Sequence:**
   - `New Sequence...` (`Ctrl+N`), `Sequence Settings...`.
   - `Duplicate Sequence`, `Close Sequence`.
   - `Render Effects in Work Area` (`Enter`), `Render In to Out Selection`, `Render Audio Waveforms`.
   - `Delete Timeline Render Cache`, `Close All Gaps in Sequence`.

6. **Timeline:**
   - `Timeline Snapping Toggle` (`S`), `Magnetic Ripple Mode Toggle` (`M`).
   - `Ripple Trim Previous Edit to Playhead` (`Q`), `Ripple Trim Next Edit to Playhead` (`W`).
   - `Extend Selected Edit to Playhead` (`E`), `Nudge Clip Left 1 Frame` (`Alt+Left`), `Nudge Clip Right 1 Frame` (`Alt+Right`).
   - `Slip Clip Backward 1 Frame` (`Alt+Shift+Left`), `Slip Clip Forward 1 Frame` (`Alt+Shift+Right`).
   - `Add Video Track`, `Add Audio Track`, `Delete Empty Tracks`.
   - `Track Height ▶` (`Expand All Tracks`, `Minimize All Tracks`).

7. **Markers:**
   - `Set In Point` (`I`), `Set Out Point` (`O`), `Mark Clip / Selection` (`X`), `Clear In / Out` (`Alt+X`).
   - `Add Marker` (`M`), `Add Marker with Note...` (`Shift+M`), `Edit Selected Marker...`.
   - `Go to Next Marker` (`Shift+N`), `Go to Previous Marker` (`Ctrl+Shift+M`).
   - `Clear Current Marker`, `Clear All Sequence Markers`.

8. **Graphics:**
   - `New Text Layer` (`Ctrl+T`), `New Shape Layer ▶` (`Rectangle`, `Ellipse`).
   - `Auto-Generate Captions from Speech...`, `Import Subtitles (.srt, .vtt)...`.
   - `Align Objects ▶` (`Left`, `Center`, `Right`, `Top`, `Middle`, `Bottom`).
   - `Export Selection as Motion Preset...`.

9. **Effects:**
   - `Browse Video Effects...`, `Browse Audio Effects...`, `Browse Transitions...`.
   - `Apply Default Video Transition` (`Ctrl+D`), `Apply Default Audio Crossfade` (`Ctrl+Shift+D`).
   - `Bypass All Timeline Effects Toggle` (`Ctrl+Alt+B`), `Save Effect Chain as Preset...`.

10. **Audio:**
    - `Audio Mixer Console Toggle`, `Toggle Audio Scrubbing` (`Shift+S`).
    - `Normalize Track Loudness...` (`ITU-R BS.1770-4 / EBU R128`).
    - `Voice Isolation & AI De-Noise...`, `Add Submix Bus`, `Configure Audio Stem Outputs ▶` (`Dialogue`, `Music`, `SFX`).

11. **Color:**
    - `Open Color Workspace`, `Toggle Bypass All Color Grades` (`Alt+Y`).
    - `Copy Grade from Previous Shot` (`Ctrl+Alt+C`), `Paste Grade to Selected Shots` (`Ctrl+Alt+V`).
    - `Apply 3D LUT (.cube)...`, `Export 3D LUT...`.
    - `Scopes Configuration ▶` (`Waveform RGB`, `Parade`, `Vectorscope`, `Histogram`).

12. **View:**
    - `Playback Quality ▶` (`Full`, `1/2 Resolution`, `1/4 Resolution`, `1/8 Resolution`).
    - `Zoom In Viewer` (`Ctrl++`), `Zoom Out Viewer` (`Ctrl+-`), `Fit to Screen` (`Shift+Z`).
    - `Show Safe Area Guides (Action/Title)`, `Show Rulers & Grid`, `Snap to Playhead`.
    - `Full Screen Monitor Toggle` (`Ctrl+Shift+F`).

13. **Window:**
    - `Workspaces ▶` (`Media Ingest`, `Editorial (Default)`, `Motion & Graphics`, `Color Grading`, `Audio Mixing`, `Deliver & Export`).
    - `Save Workspace as Custom...`, `Reset Current Workspace to Default`.
    - `Toggle Panels ▶` (`Project / Media Browser`, `Source Monitor`, `Program Monitor`, `Timeline`, `Inspector`, `Effects Library`, `Audio Mixer`, `Video Scopes`, `Graph Editor`, `Transcript & Captions`, `Markers`, `Performance Diagnostics`, `History`).

14. **Help:**
    - `FRAMEFLOW Documentation & User Guide`, `Interactive Keyboard Shortcut Cheat-Sheet`.
    - `Run Browser Hardware Capability Diagnostic...`, `Real-Time Performance Monitor`.
    - `Report an Issue / Bug`, `About FRAMEFLOW Web Edition`.

---

## 3. Complete Panel Inventory & Visual Layout Hierarchy

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ TOP APPLICATION BAR: Menu Bar | Project Title | Auto-Save Status | Workspaces | Export │
├──────────────────────────┬─────────────────────────────┬───────────────────────────────┤
│ MEDIA & ASSET BROWSER    │ DUAL MONITOR PREVIEW SUITE  │ CONTEXTUAL INSPECTOR          │
│ • Project Tree / Bins    │ • Source Monitor (Raw clip) │ • Transform (Pos/Scale/Rot)   │
│ • Media Ingest & Search  │ • Program Monitor (Timeline)│ • Opacity & Blend Modes       │
│ • Smart Collections      │ • Safe Guides & Overlays    │ • Applied Effects & Shaders   │
│ • Metadata Inspector     │ • Timecode Readouts         │ • Audio Gain / EQ / Pan       │
├──────────────────────────┴─────────────────────────────┤ • Motion Keyframe Curves      │
│ MULTI-TRACK NON-LINEAR TIMELINE                        ├───────────────────────────────┤
│ • Video Tracks (V1...Vn) with Mute/Solo/Lock/Targeting │ SPECIALIST DOCKABLE SUITE     │
│ • Audio Tracks (A1...An) with Waveform Displays        │ • Audio Track Mixer & Meters  │
│ • Playhead with Sub-Frame Scrubbing                    │ • Video Scopes (Parade/Vector)│
│ • In/Out Markers, Work Area Bar, Snapping Grid         │ • Graph Editor (Bezier curves)│
└────────────────────────────────────────────────────────┴───────────────────────────────┘
```

### Detailed Panel Specifications
1. **Project / Media Browser Panel:**
   - Folder tree with support for nested Bins, Smart Bins (filtered by format, tag, resolution), and Color Labeling.
   - List View (Name, Duration, FPS, Codec, Audio Channels, Offline Status) and Filmstrip View with hover-scrubbing.
2. **Source Monitor Panel:**
   - Master raw footage preview player.
   - Displays master clip timecode, In/Out markers, audio-only / video-only drag icons, and Play/Stop/Shuttle transport.
3. **Program Monitor Panel:**
   - Real-time composited timeline sequence preview canvas.
   - Interactive on-screen bounding boxes for direct video scaling, positioning, and rotation.
   - Safe Margin overlays (90% Action Safe, 80% Title Safe, 9:16 Social Safe bounds).
4. **Timeline Panel:**
   - Multi-track timeline grid with independent track height scaling.
   - Track headers: Video track toggles (Visibility `Eye`, Lock `Padlock`, Track Target `V1`, Sync Lock); Audio track toggles (Mute `M`, Solo `S`, Record `R`, Track Target `A1`, Volume Fader).
5. **Contextual Inspector Panel:**
   - Consolidates parameters based on selected element (Clip, Text, Effect, Transition, Track):
     - *Video Tab:* Position (X, Y), Scale (Uniform, Width, Height), Rotation, Anchor Point, Opacity, Blend Mode (Normal, Multiply, Screen, Overlay, etc.), Speed/Duration.
     - *Effects Tab:* Real-time parameter sliders, color swatches, and toggle checkboxes for all applied WebGPU shader effects.
     - *Audio Tab:* Volume fader (dB), Pan (-100 to +100), Channel mapping, 4-band Parametric EQ, Noise suppression.
     - *Keyframe Sub-Panel:* Diamond toggle to arm keyframing, jump to previous/next keyframe, and curve selector.
6. **Video Scopes Panel:**
   - Real-time signal analysis: RGB Parade, YUV Vectorscope with skin-tone line, Luma Waveform, and 256-bin Color Histogram.
7. **Audio Track Mixer Panel:**
   - Hardware-inspired multichannel console with motorized-style vertical faders, dB peak/RMS meter readouts, stereo panners, effect insert slots, submix bus sends, and Master Out limiter.
8. **Motion Graph Editor Panel:**
   - Advanced Bezier curve editor allowing sub-pixel adjustment of temporal ease handles (Ease In, Ease Out, Exponential, Overshoot).
9. **Performance & Diagnostics Panel (Unique FRAMEFLOW Advantage):**
   - Real-time diagnostic telemetry: active WebGPU device, memory allocation, WebCodecs hardware decode status, dropped frames counter, live timeline FPS, and browser storage quota status.

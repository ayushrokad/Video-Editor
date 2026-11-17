# FRAMEFLOW — Settings, Preferences & Scoping Architecture
**Document ID:** `RES-SET-001`  
**Classification:** Configuration Architecture & Ergonomics Specification  
**Version:** 2.0  
**Scope:** 5-Tier Scope Taxonomy & Complete Settings Map  

---

## 1. The Five Fundamental Setting Tiers

A major source of user frustration in traditional NLEs (notably Premiere Pro and Avid) is the improper co-mingling of global application preferences with project-specific and timeline-specific parameters. A user attempting to change a sequence frame rate should never have to dig through global application preferences, and a user setting a clip's anchor point should never see that parameter inside project settings.

FRAMEFLOW strictly isolates all configuration into five distinct architectural scopes:

```
┌────────────────────────────────────────────────────────────────────────┐
│ TIER 1: APPLICATION PREFERENCES (Global to User & Browser Runtime)     │
├────────────────────────────────────────────────────────────────────────┤
│ TIER 2: WORKSPACE SETTINGS (Panel Layouts, Window States, Monitor Conf)│
├────────────────────────────────────────────────────────────────────────┤
│ TIER 3: PROJECT SETTINGS (Global to Project, Assets, & Media Rules)    │
├────────────────────────────────────────────────────────────────────────┤
│ TIER 4: SEQUENCE SETTINGS (Specific to an Individual Timeline Master)  │
├────────────────────────────────────────────────────────────────────────┤
│ TIER 5: OBJECT PROPERTIES (Contextual to Selected Clip, Effect, Track) │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Exhaustive Settings Location Map

### Tier 1: Application Preferences (`Edit → Preferences` or `Ctrl+,`)
*Scope:* Stored in browser `localStorage` / user account database. Affects all projects and browser sessions.

| Sub-Category | Setting Name | Data Type & Range | Default Value | Technical Purpose & Behavior |
| :--- | :--- | :--- | :--- | :--- |
| **Appearance** | UI Theme Mode | Enum (`Dark`, `OLED Black`, `Studio Gray`, `Light`) | `Dark` | Controls CSS color tokens, contrast ratios, and background luminosity. |
| **Appearance** | Accent Highlight Color | Color Hex | `#3B82F6` (Electric Blue) | Controls selection outlines, playhead color, and active button highlights. |
| **Appearance** | UI Scaling Factor | Percentage (`80%`, `100%`, `125%`, `150%`) | `100%` | Adjusts root font size and panel padding for high-DPI displays. |
| **General** | Startup Behavior | Enum (`Show Dashboard`, `Open Last Project`, `Blank`) | `Show Dashboard` | Action taken when navigating to root URL. |
| **General** | Timecode Display Format | Enum (`SMPTE Timecode (HH:MM:SS:FF)`, `Frames`, `Seconds`) | `SMPTE Timecode` | Global time display convention in rulers and monitors. |
| **General** | Keyboard Shortcut Preset | Enum (`FRAMEFLOW Default`, `Adobe Premiere Pro`, `DaVinci Resolve`, `Final Cut Pro`) | `FRAMEFLOW Default` | Remaps global keybindings across all workspaces. |
| **Project Recovery** | Auto-Save Enabled | Boolean | `true` | Enables background periodic project snapshotting. |
| **Project Recovery** | Auto-Save Interval | Integer (1 to 60 minutes) | `5 minutes` | Frequency of non-blocking background IndexedDB sync. |
| **Project Recovery** | Max Recovery Snapshots | Integer (5 to 100) | `25 snapshots` | Bounded circular snapshot buffer to prevent storage bloating. |
| **Hardware & GPU** | GPU Rendering Backend | Enum (`Auto-Detect`, `WebGPU`, `WebGL 2 Fallback`) | `Auto-Detect` | Selects active graphics API pipeline. |
| **Hardware & GPU** | Preferred GPU Adapter | Enum (`High Performance (dGPU)`, `Low Power (iGPU)`) | `High Performance` | Requests specific adapter via `navigator.gpu.requestAdapter()`. |
| **Hardware & GPU** | WebCodecs Hardware Decode | Boolean | `true` | Enables hardware-accelerated video decoding via OS media engines. |
| **Media & Cache** | Storage Subsystem | Enum (`OPFS (High Speed)`, `IndexedDB`, `In-Memory`) | `OPFS` | Root local filesystem engine for proxies and render files. |
| **Media & Cache** | Max Cache Quota | Percentage of Available Disk (10% to 80%) | `50%` | Hard boundary enforced before triggering automatic LRU eviction. |
| **Media & Cache** | Clear Cache on Project Close| Boolean | `false` | Automatic garbage collection of ephemeral timeline preview textures. |
| **Audio Hardware** | Audio Output Device | String (Device ID from MediaDevices) | `System Default` | AudioContext destination node hardware routing. |
| **Audio Hardware** | Audio Buffer Latency | Enum (`Interactive (Lowest)`, `Balanced`, `Playback (Safe)`) | `Interactive` | Configures Web Audio API buffer size (128 vs 512 vs 1024 samples). |
| **Audio Hardware** | Sub-Frame Audio Scrub | Boolean | `true` | Enables audible audio scrubbing when dragging timeline playhead. |

---

### Tier 2: Workspace Settings (`Window → Workspaces`)
*Scope:* Stored in IndexedDB. Serializes panel docking coordinates, pane splits, tab arrangements, and visible toolbars.

| Workspace Preset | Active Panels Included | Primary Focus & Ergonomics |
| :--- | :--- | :--- |
| **Media Ingest** | Media Browser (Expanded), Source Monitor, Metadata Inspector, Ingest Queue | High-speed logging, tagging, proxy verification, and rough bin sorting. |
| **Editorial (Default)** | Project Bins (Left), Source & Program Monitors (Center Top), Inspector (Right), Multi-Track Timeline (Bottom) | Balanced primary editing suite with full trim tool access. |
| **Motion & Graphics** | Timeline with expanded Graph Editor (Bottom), Program Monitor (Center), Typography Inspector & Shape Library (Right) | Precision Bezier curve animation, keyframe timing, and kinetic text. |
| **Color Grading** | Video Scopes (Parade/Vectorscope Left), Program Monitor (Center), Color Wheels & Curves Inspector (Right), Mini-Timeline | 32-bit floating-point color balance, shot matching, and LUT application. |
| **Audio Mixing** | Multitrack Mixer Console (Center Top), Waveform Timeline (Bottom), Audio FX & Metering Inspector (Right) | Multi-channel volume leveling, submix routing, voice isolation, and LUFS mastering. |
| **Deliver & Export** | Render Queue (Left), Sequence Summary Preview (Center), Encoding & Codec Inspector (Right) | Batch export configuration, cloud render dispatch, and quality assurance. |

---

### Tier 3: Project Settings (`Project → Project Settings`)
*Scope:* Stored within the Project JSON document. Persists across all collaborators working on the project.

| Setting Name | Data Type & Options | Default Value | Architectural Impact |
| :--- | :--- | :--- | :--- |
| **Project Title** | String (1-100 characters) | `"Untitled Project"` | Unique human-readable identifier. |
| **Working Color Space** | Enum (`Rec.709 (SDR)`, `Rec.2020 (WCG)`, `ACEScc (Scene-Referred)`) | `Rec.709 (SDR)` | Working gamut for WebGPU color transformations. |
| **Color Processing Precision**| Enum (`32-bit Floating-Point (Float32)`, `16-bit Half-Float`, `8-bit Standard`) | `32-bit Float32` | Prevents banding and highlight clipping in shader color grading. |
| **Default Audio Sample Rate** | Enum (`48000 Hz (Broadcast standard)`, `44100 Hz (Music)`, `96000 Hz (Hi-Res)`) | `48000 Hz` | Master resampler target for all imported audio media. |
| **Media Relink Strategy** | Enum (`Absolute Path`, `Relative to Project`, `Cloud Asset ID`) | `Relative to Project` | Search rules for reconnecting offline footage assets. |
| **Automatic Proxy Rule** | Enum (`Always Generate Proxies`, `Generate for 4K+ Only`, `Disabled`) | `Generate for 4K+ Only` | Automatic background proxy generation threshold. |

---

### Tier 4: Sequence Settings (`Sequence → Sequence Settings`)
*Scope:* Unique to a specific timeline sequence. A single project can contain multiple sequences with distinct resolutions (e.g. 16:9 Landscape master + 9:16 Vertical social cut).

| Setting Name | Data Type & Range | Default Value | Architectural Impact |
| :--- | :--- | :--- | :--- |
| **Frame Dimensions** | Width x Height (Pixels: 240x240 to 8192x8192) | `1920 x 1080` (1080p FHD) | Defines viewport resolution and render canvas boundaries. |
| **Pixel Aspect Ratio** | Enum (`Square Pixels (1.0)`, `Anamorphic 1.33`, `Anamorphic 2.0`) | `Square Pixels (1.0)` | Non-square pixel distortion correction in preview monitor. |
| **Timeline Timebase (FPS)** | Enum (`23.976`, `24.0`, `25.0`, `29.97 NTSC`, `30.0`, `50.0`, `59.94`, `60.0`) | `24.0 fps` | Master temporal quantization grid for playhead frames. |
| **Timecode Display Format** | Enum (`Drop-Frame`, `Non-Drop-Frame`, `Frames`) | `Non-Drop-Frame` | SMPTE timecode calculation math for broadcast compliance. |
| **Audio Master Channel Mode** | Enum (`Stereo (2.0)`, `5.1 Surround`, `Mono`) | `Stereo (2.0)` | Master bus channel count and downmix behavior. |

---

### Tier 5: Object Properties (Contextual Inspector Panel)
*Scope:* Exclusively bound to the currently selected timeline clip, effect instance, or track header.

| Target Element | Parameter Group | Specific Properties | UI Input Control Type |
| :--- | :--- | :--- | :--- |
| **Video Clip** | Intrinsic Transform | Position X/Y, Scale Uniform, Scale X/Y, Rotation, Anchor Point X/Y | Numeric scrubby sliders + on-screen handles |
| **Video Clip** | Compositing | Opacity (0–100%), Blend Mode (Normal, Screen, Multiply, Overlay) | Slider + Dropdown selector |
| **Video Clip** | Speed / Retime | Speed percentage (1% to 1000%), Reverse Playback, Frame Blending Mode | Number input + Checkbox |
| **Audio Clip** | Volume & Pan | Clip Gain (dB: -inf to +12dB), Pan (-100 Left to +100 Right) | dB vertical fader + Rotary knob |
| **Audio Clip** | Processing | 4-Band Parametric EQ (Gain, Freq, Q), High-Pass Filter, Voice De-Noise | Interactive frequency curve + Sliders |
| **Text Layer** | Typography | Font Family, Font Weight, Font Size, Tracking, Kerning, Line Height, Align | Typography dropdowns + Numeric steppers |
| **Text Layer** | Appearance | Fill Color, Stroke (Color & Width), Background Box (Padding, Radius), Shadow | Color pickers + Sliders |
| **Shader Effect** | Custom Parameters | E.g. Gaussian Blur (Radius, Direction), Directional Glow (Intensity, Threshold) | Dynamic slider controls generated from shader metadata |
| **Keyframes** | Interpolation Math | Temporal Ease (Linear, Ease In, Ease Out, Custom Bezier curve) | Curve visualizer + One-click preset pills |

---

## 3. The Gold Standard Usability Rule

> **The Architectural Scope Law:**  
> 1. Never place a sequence-level setting (such as Resolution or Frame Rate) into the global Application Preferences.  
> 2. Never place an object property (such as Clip Scale or Gain) into Project Settings.  
> 3. Global preferences govern **how the machine runs**; Project settings govern **how assets behave**; Sequence settings govern **how time and space are rendered**; Object properties govern **what the individual element does**.

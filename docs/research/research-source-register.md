# FRAMEFLOW — Research Source Register
**Document ID:** `RES-REG-001`  
**Classification:** Product Research & Competitive Intelligence  
**Target Platform:** FRAMEFLOW Professional Browser-Based NLE  
**Version:** 2.0  
**Last Updated:** November 2026  

---

## 1. Source Register Methodology & Verification Criteria

To ensure technical fidelity and avoid mixing subjective opinions or deprecated legacy behaviors with current product reality, every research finding in the FRAMEFLOW knowledge base is classified across three rigorous dimensions:

1. **Source Tier:**
   - **Tier 1 (Authoritative Primary):** Official user manuals, engineering whitepapers, API reference specs, official developer documentation (Adobe, Blackmagic Design, Apple, Avid, W3C/MDN).
   - **Tier 2 (Professional Applied):** Verified studio technical pipelines (Company 3, Light Iron, FotoKem, Framestore, The Mill), certified training courses, documented editor guilds (ACE, MPEG).
   - **Tier 3 (Community Empirical):** Issue trackers, official developer forums (Adobe Community, BMD Forum), community boards (r/editors, r/premiere, r/davinciresolve, r/finalcutpro), bug reports.

2. **Confidence Level:**
   - `HIGH`: Verified against official current release documentation (2024–2026) and reproducible in production software.
   - `MEDIUM`: Documented industry consensus or widely confirmed studio practice with multiple independent citations.
   - `LOW / INVESTIGATION`: Single-source community report or unresolved usability complaint requiring isolated verification.

---

## 2. Complete Source Inventory

| Ref ID | Title / Resource | Publisher / Author | Source Type | Software / Version | Date / Status | Research Domain | Key Findings & Verified Behavior | FRAMEFLOW Architectural Implication |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **SRC-001** | *Premiere Pro User Guide & Workspace Documentation* | Adobe Systems | Official User Guide | Premiere Pro 2024 / 2025 / 2026 | Oct 2026 | Interface Architecture, Panels, Menus | Documents 16 default workspace presets; panel groups support docking, tabbing, floating, stacking; 13 top-level menus with context-sensitive state. | FRAMEFLOW adopts Premiere's flexible panel grouping and dockable layout model, but improves contextual panel discovery and reduces visual clutter. |
| **SRC-002** | *DaVinci Resolve Reference Manual (v19/v20/v21.1)* | Blackmagic Design | Official Engineering Manual | DaVinci Resolve Studio 19 / 20 / 21.1 | Nov 2026 | Workspace Architecture, Color Pipeline, Audio | 4,000+ page manual documenting rigid 7-page workflow (`Media`, `Cut`, `Edit`, `Fusion`, `Color`, `Fairlight`, `Deliver`); node-based processing trees; DaVinci YRGB Color Managed (RCM) pipeline. | Inspire FRAMEFLOW's dedicated specialist workspaces (`Media`, `Edit`, `Motion`, `Color`, `Audio`, `Deliver`) while maintaining a single, unified project timeline model without modal disjunction. |
| **SRC-003** | *Adobe After Effects User Guide & Preferences Reference* | Adobe Systems | Official User Guide | After Effects 2025 / 2026 | Sep 2026 | Motion Graphics, Keyframing, Graph Editor | Layer-based compositing hierarchy; separate spatial vs. temporal keyframe interpolation; dual-mode Graph Editor (Value Graph vs. Speed Graph); expression engine. | Build dedicated `Motion` workspace with dual-curve Graph Editor and Bezier interpolation directly on timeline tracks, avoiding roundtrip export lag. |
| **SRC-004** | *Final Cut Pro for Mac User Guide & Architecture* | Apple Inc. | Official User Guide | Final Cut Pro 10.8 / 11.0 | Oct 2026 | Magnetic Timeline, Roles, Media Management | Trackless Magnetic Timeline; automatic ripple and collision avoidance; Connected Clips; Role-based audio busing and stem routing; background rendering engine. | Implement hybrid timeline: traditional multi-track targeted editing as default, with toggleable Magnetic collision avoidance for rapid rough-cut assembly. |
| **SRC-005** | *Avid Media Composer 2024/2026 Documentation* | Avid Technology | Official User Guide | Media Composer Ultimate | 2026 | Broadcast / Film Editorial, Trimming | Dual-roller trim mode; slip/slide numerical trims; asymmetric multi-track trimming; strict bin locking and shared project storage for broadcast editorial teams. | FRAMEFLOW must offer sub-frame numerical trimming, dual-monitor trim views, and deterministic track patching/targeting for professional film/broadcast editors. |
| **SRC-006** | *W3C WebCodecs Specification* | W3C / Google / Apple / Mozilla | Standards Spec | W3C Candidate Recommendation | 2026 | In-Browser Video/Audio Decoding & Encoding | Low-level access to hardware decoders (`VideoDecoder`, `AudioDecoder`, `VideoFrame`, `EncodedVideoChunk`). Requires container demuxing via WASM. | Primary decoding engine for FRAMEFLOW web client. Enables zero-upload local editing via hardware-accelerated chunk decoding. |
| **SRC-007** | *W3C WebGPU Specification & Shading Language (WGSL)* | W3C GPU for the Web WG | Standards Spec | W3C Recommendation Candidate | 2026 | Modern GPU Compute & Graphics | Direct hardware access to GPU compute and render pipelines; WGSL shader language; texture uploads via `copyExternalImageToTexture`. | Powers FRAMEFLOW real-time timeline compositing, blend modes, Lumetri-style color grading math, and custom GLSL/WGSL transition shaders. |
| **SRC-008** | *Origin Private File System (OPFS) Specification* | WHATWG / W3C | Web Storage Standard | HTML5 Living Standard | 2026 | High-Performance Local Client Storage | Private origin-isolated virtual filesystem providing synchronous read/write access via `FileSystemSyncAccessHandle` inside Web Workers. | Used for high-speed local proxy chunk caching, thumbnail scrubbing databases, and undo history journaling without hitting browser quota throttling. |
| **SRC-009** | *Post-Production Studio Pipeline Specifications* | Company 3 / Light Iron / FotoKem | Industry Whitepaper | Multi-Vendor Dailies-to-Master | 2026 | Editorial Handoffs, Color, Sound | Ingest verification (checksums xxHash/MD5); offline editing at ProRes Proxy/DNxHR LB; picture-lock conform; roundtrip via EDL/XML/OTIO; ACES 1.3 color management. | FRAMEFLOW project schema must support OpenTimelineIO (OTIO), XML/EDL import/export, and seamless proxy-to-RAW conform mapping. |
| **SRC-010** | *Community Performance & Timeline Friction Reports* | Reddit (r/PremierePro, r/editors) | Empirical Community Feedback | Premiere Pro v24/v25 | Jun 2026 | Timeline Responsiveness, Frame Drops | Editors on high-end hardware (RTX 4090, 64GB RAM) experience sluggish UI playhead scrubbing with variable frame rate (VFR) media and heavy Lumetri stacks. | FRAMEFLOW must feature a built-in Real-time Performance Monitor diagnosing dropped frames, decoder bottlenecks, VRAM pressure, and VFR detection. |
| **SRC-011** | *Community Masking & Automation Workflow Critique* | Adobe Community Forum | User Feedback & Feature Requests | Premiere Pro 2025/2026 | May 2026 | Automation vs. Manual Control | Automated AI scene cut and auto-masking criticized when manual bezier fine-tuning controls are hidden or lack precision micro-adjustments. | AI automation in FRAMEFLOW must always remain an optional accelerator; manual bezier handles, pen tools, and vertex editors must never be compromised. |
| **SRC-012** | *School of Motion & Video Copilot Professional Tutorials* | School of Motion / Andrew Kramer | Professional Applied Training | After Effects & NLE Workflows | 2024–2026 | Motion Design & Compositing Ergonomics | Editors spend 60% of animation time adjusting speed curves (easing) and temporal spacing. Complex layer stacks create visual navigation fatigue. | FRAMEFLOW combines timeline layer controls with an inline contextual Graph Editor and one-click easing presets (Ease In, Ease Out, Exponential, Spring). |
| **SRC-013** | *Web Audio API Specification & DSP Routing* | W3C Audio Working Group | Standards Spec | W3C Recommendation | 2026 | Audio Processing & Graph Routing | Modular audio processing nodes (`GainNode`, `BiquadFilterNode`, `DynamicsCompressorNode`, `AudioWorkletNode`) for low-latency multi-channel mixing. | Implements FRAMEFLOW multitrack audio mixer, sub-mix buses, master limiter, 10-band graphic/parametric EQ, and sub-frame audio scrub. |
| **SRC-014** | *ACES (Academy Color Encoding System) Documentation* | Academy of Motion Picture Arts and Sciences | Industry Color Standard | ACES 1.3 / 2.0 | 2026 | Scene-Referred Color Pipeline | Standardized color transform language, wide-gamut AP0/AP1 color spaces, Input Device Transforms (IDTs), and Output Device Transforms (ODTs). | Guides FRAMEFLOW 32-bit floating-point linear color engine with Rec.709, Rec.2020, and ACEScc color science capabilities. |

---

## 3. Continuous Expansion Protocol
New research entries added to this register must:
1. Provide a verifiable public documentation link or technical whitepaper citation.
2. Undergo architectural impact assessment before influencing the milestone development plan.
3. Be integrated into both the specific competitor report and the cross-product synthesis matrices.

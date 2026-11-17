# FRAMEFLOW — Professional Studio Pipelines & Post-Production Research
**Document ID:** `RES-STU-001`  
**Classification:** Enterprise Post-Production Infrastructure & Facility Workflows  
**Version:** 2.0  
**Research Targets:** Company 3, Light Iron, FotoKem, Framestore, The Mill  

---

## 1. Research Boundary & Target Facilities

Professional post-production studios represent the pinnacle of technical rigor in media finishing. Our research targets five premier global facilities to understand their operational expectations, metadata standards, color interchange protocols, and editorial turnover requirements.

*Disclaimer:* These findings represent published industry case studies, technical whitepapers, SMPTE presentations, and standard broadcast practices; they do not disclose proprietary or confidential studio source code.

```
┌────────────────────────────────────────────────────────────────────────┐
│                   STUDIO SPECIALIZATION BENCHMARKS                     │
├─────────────────────┬──────────────────┬───────────────────────────────┤
│ FACILITY            │ HEADQUARTERS     │ PRIMARY SPECIALIZATION        │
├─────────────────────┼──────────────────┼───────────────────────────────┤
│ Company 3           │ Los Angeles, CA  │ Theatrical & Episodic Color   │
│ Light Iron (Panav.) │ Hollywood, CA    │ On-Set Dailies & Data Mgmt    │
│ FotoKem             │ Burbank, CA      │ Film Processing & Finishing   │
│ Framestore          │ London, UK       │ High-End Feature Film VFX     │
│ The Mill            │ London / NYC     │ Commercials & Creative Motion │
└─────────────────────┴──────────────────┴───────────────────────────────┘
```

---

## 2. Facility Operational Profiles

### 2.1 Company 3 (Color Grading & Digital Intermediate)
- **Primary Workflows:** Theatrical feature films (Marvel, Warner Bros.) and high-end episodic series (HBO, Netflix).
- **Core Technical Pipeline:**
  - Multi-workstation DaVinci Resolve Studio and FilmLight Baselight clusters connected to multi-petabyte SANs.
  - Strict **ACES (Academy Color Encoding System)** color-managed pipelines using ACEScc / ACEScct with standardized IDTs (Input Device Transforms) and ODTs (Output Device Transforms).
  - Monitoring on calibrated Sony BVM-HX310 / BVM-HX3110 mastering monitors (1,000 nit PQ HDR and Rec.709 2.4 SDR).
- **Turnover Requirements:**
  - Picture-locked editorial turnovers delivered via **FCPXML** or **EDL** accompanied by an offline reference quicktime with burned-in timecode (BITC).
  - Editorial speed ramps and dissolves must conform with sub-frame accuracy during timeline relinking to camera RAW.
- **FRAMEFLOW Takeaway:** FRAMEFLOW’s export engine must generate frame-accurate XML/EDL and OTIO interchange files that match standard conform behavior in high-end color grading suites.

### 2.2 Light Iron (Panavision) — Dailies & Near-Set Workflow
- **Primary Workflows:** On-set data management, high-speed mobile dailies generation, and early editorial prep for major motion pictures.
- **Core Technical Pipeline:**
  - Offloading camera cards directly in mobile production trucks using automated checksum tools (xxHash64 / MD5).
  - Automated dual-system audio sync (matching camera scratch audio with multi-track Sound Devices polyphonic WAVs).
  - Generating encrypted editorial proxies with burned-in scene/take/timecode overlays for remote editorial review via Frame.io.
- **FRAMEFLOW Takeaway:** Metadata extraction must be instantaneous. Reel name, clip timecode, camera FPS, and scene/take metadata must be exposed in the Media Browser and preserved throughout timeline editing.

### 2.3 FotoKem (Finishing, Restoration & Laboratory Services)
- **Primary Workflows:** Large-format 70mm film scanning, digital intermediate mastering, and archive preservation.
- **Core Technical Pipeline:**
  - Hybrid analog film and digital pipelines handling up to 11K native scans.
  - Rigorous Quality Control (QC) checking for pixel dropouts, chromatic aberrations, frame cadence errors, and gamut boundary violations.
  - Archival deliverables: Uncompressed 16-bit DPX or OpenEXR stacks accompanied by comprehensive checksum manifests.
- **FRAMEFLOW Takeaway:** The export subsystem must support lossless frame sequences and uncompressed audio stems to satisfy archive preservation standards.

### 2.4 Framestore & The Mill (VFX, Compositing & Commercial Finishing)
- **Primary Workflows:** Photorealistic CGI creatures, environment replacement, commercial visual effects, and dynamic motion design.
- **Core Technical Pipeline:**
  - Node-based compositing suites (Foundry Nuke, Autodesk Flame, SideFX Houdini).
  - Shot turnover protocol: VFX shots pulled with standard frame handles (+8 or +12 frames) in ACEScg linear color space.
  - Commercial turnaround is extremely fast (hours rather than weeks); rapid iterations, real-time client review links, and multi-format aspect ratio versions (16:9 TV, 9:16 TikTok, 1:1 Instagram, 4:5 Facebook) are mandatory.
- **FRAMEFLOW Takeaway:** FRAMEFLOW’s Sequence settings must support instant multi-aspect ratio reformatting with intelligent auto-reframe, and cloud review sharing with timecode-stamped comments.

---

## 3. The Professional Studio Handoff Matrix

| Turnover Direction | Interchange Standard | Media Format | Metadata Required | Studio Department |
| :--- | :--- | :--- | :--- | :--- |
| **Editorial → Color** | FCPXML / OTIO / EDL | Camera RAW / High-Res Master | Reel Name, Source TC, Speed Ramps | DI Color Suite (Company 3 / FotoKem) |
| **Editorial → Sound** | AAF / OMF / XML | Broadcast WAV (24-bit/48kHz) | Frame Handles (+24 frames), Volume Envelopes | Audio Post / Pro Tools |
| **Editorial → VFX** | OTIO / FCPXML | 16-bit Half Float OpenEXR | Frame Handles (+12 frames), CDL Color Info | VFX Compositing (Framestore / The Mill) |
| **Editorial → Client Review** | MP4 / WebM | H.264 / AAC 1080p | Burned-in Timecode (BITC), Watermark | Director, Producer, Agency Review |
| **Editorial → Archive** | Tarball / Manifest | Master Media + OTIO Timeline | xxHash Checksums, Project JSON | Cold Storage / Tape Archive |

---

## 4. Architectural Requirements for FRAMEFLOW

To satisfy these professional studio standards, FRAMEFLOW implements:
1. **OTIO (OpenTimelineIO) as First-Class Citizen:** Open-source interchange format initiated by Pixar; ensures timeline cuts, transitions, and audio tracks translate cleanly to other studio tools without vendor lock-in.
2. **Metadata Integrity Engine:** Ingested media retains all source reel names, original timecode tracks, lens metadata, and camera serial numbers in the project schema.
3. **Burned-In Timecode (BITC) Generator:** Toggleable viewer and export overlay displaying Sequence Timecode, Source Clip Timecode, Reel Name, and Custom Watermark.

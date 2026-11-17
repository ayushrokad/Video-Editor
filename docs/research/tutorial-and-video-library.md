# FRAMEFLOW — Professional Tutorial & Training Intelligence Library
**Document ID:** `RES-TUT-001`  
**Classification:** Professional Pedagogy & Workflow Education Audit  
**Version:** 2.0  
**Scope:** Official Vendor Curriculums, Industry Academies & Masterclasses  

---

## 1. Educational Philosophy & Research Objectives

To design an editing environment that feels natural to professionals while accelerating novices, we must analyze **how video editing is taught and mastered**. Professional tutorials reveal which interaction patterns become muscle memory, which operations require repetitive manual friction, and where software UX fails to support creative cognitive flow.

Every educational source in this library is audited across four pedagogical domains:
1. **Pacing & Trimming Techniques:** How editors manipulate time (L-cuts, J-cuts, match cuts, reaction timing).
2. **Visual Hierarchy & Ergonomics:** How instructors teach workspace management, dual monitors, and keyboard navigation.
3. **Audio-First Finishing:** How dialogue clarity, room tone, and music transitions are structured.
4. **Cognitive Load & Software Obstacles:** Where instructors are forced to say *"Now be careful here, the software has a weird bug/quirk..."*

---

## 2. Authoritative Training Curriculums Audit

### 2.1 Blackmagic Design Certified Training (DaVinci Resolve)
- **Primary Source:** Blackmagic Design Official Training Library (`SRC-002`)
- **Key Modules Evaluated:**
  - *The Editor's Guide to DaVinci Resolve:* Teaches the philosophy of the Cut Page (Source Tape, Fast Review, Dual Timeline) versus the Edit Page (Traditional 3-point editing, ripple, roll, slip, slide).
  - *Colorist Guide to DaVinci Resolve:* Teaches primary node balance, contrast/pivot mechanics, hue curves, and secondary isolations.
  - *Fairlight Audio Post-Production:* Teaches sub-frame audio editing, dialogue replacement, side-chain compression, and EBU R128 loudness normalization.
- **Key Takeaways for FRAMEFLOW:**
  - Instructors strongly emphasize **Source Tape** (viewing an entire bin as a single continuous strip with dynamic shuttle) as the fastest way to scrub raw footage. FRAMEFLOW must adopt a Source Tape scrubbing mode.
  - Color instruction always begins with **contrast and balance** before creative LUTs. Scopes must be visible side-by-side with color controls.

### 2.2 School of Motion (Motion Design & Animation Principles)
- **Primary Source:** School of Motion *Animation Bootcamp* & *Advanced Motion Methods* (`SRC-012`)
- **Key Modules Evaluated:**
  - *The Graph Editor Demystified:* Teaches how the Speed Graph and Value Graph translate Disney’s 12 Principles of Animation (Squash & Stretch, Anticipation, Slow In & Slow Out) into mathematics.
  - *Easing and Kinetic Flow:* Explains why linear keyframes look robotic and how Bezier curve handles shape emotional energy.
- **Key Takeaways for FRAMEFLOW:**
  - Traditional NLEs make easing painful by requiring users to open separate panels or right-click deeply nested submenus.
  - FRAMEFLOW should provide **Instant Easing Curve Presets** (Ease In, Ease Out, Exponential, Overshoot, Bounce) directly on the timeline clip inspector, with a one-click toggle to open the full visual Graph Editor when surgical control is needed.

### 2.3 Film Editing Pro (Narrative Editorial & Storytelling Pacing)
- **Primary Source:** Film Editing Pro Masterclasses (`The Art of Storytelling`, `Action Scene Cutting`)
- **Key Modules Evaluated:**
  - *Invisible Cutting & Match Action:* Cutting on subject movement to mask the transition.
  - *Pacing & Rhythm:* Trimming 1 or 2 frames can alter the entire emotional tension of a dramatic close-up.
  - *Dialogue J-Cuts and L-Cuts:* Splitting audio and video edit points so the audience hears a character speak before seeing their face.
- **Key Takeaways for FRAMEFLOW:**
  - Editors constantly execute J-cuts and L-cuts. The timeline must allow independent trimming of audio handles without accidentally unlinking the synchronized clip pair.
  - Sub-frame audio editing is mandatory for eliminating clicks/pops on audio cut points.

### 2.4 Video Copilot (Compositing, VFX & Title Workflows)
- **Primary Source:** Video Copilot Advanced Tutorials (Andrew Kramer)
- **Key Modules Evaluated:**
  - *Motion Tracking & Screen Replacement:* Planar tracking, corner pins, and perspective transforms.
  - *Procedural Light & Particles:* Optical flares, volumetric glow, and multi-pass blending.
- **Key Takeaways for FRAMEFLOW:**
  - Compositing tools should not require a 10-step setup. Simple blend modes (Multiply, Screen, Overlay) and track mattes should be a single dropdown inside the clip inspector.

---

## 3. Discovery Candidates & Evaluation Status

| Source Title | Creator / Publisher | Date | Domain Evaluated | Verified Insights & Caveats |
| :--- | :--- | :--- | :--- | :--- |
| *From Raw Footage to Final Cut* | Seagate Technology | June 2026 | Dailies & Backup Pipeline | Highlights the criticality of 3-2-1 backup and fast NVMe scratch drives during 8K editing. Confirms need for local OPFS cache. |
| *The Complete Beginner's Guide to Editing in Premiere Pro* | Think Media | Jan 2026 | Beginner Onboarding Friction | Novices struggle most with: 1) where exported files are saved, 2) red offline media screens, 3) timeline zoom navigation. |
| *Learn Video Editing from Basic to Advanced* | Multi-Vendor Series | Mar 2026 | NLE Transition Pitfalls | Demonstrates how editors switching between Premiere and Resolve struggle with mismatched keyboard shortcuts. Validates FRAMEFLOW shortcut preset engine. |

---

## 4. FRAMEFLOW Onboarding & Learning Integration

To ensure FRAMEFLOW users achieve immediate mastery:
1. **Interactive Keyboard Shortcut Visualizer:** A built-in graphical keyboard map showing active shortcuts per workspace.
2. **Contextual Tooltips with Micro-GIFs:** Hovering over any tool (e.g. Ripple Edit `B`) displays a 3-second looping graphic illustrating exact timeline behavior.
3. **Pre-Loaded Sample Media Projects:** A new user can launch a 1080p tutorial project instantly (stored in local OPFS without downloads) to practice J-cuts, color wheels, and audio mixing.

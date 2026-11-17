# FRAMEFLOW Competitor Analysis: Avid Media Composer
**Document ID:** `RES-AV-001`  
**Classification:** Enterprise Broadcast & Feature Film Benchmark  
**Software Analyzed:** Avid Media Composer Ultimate (2024 / 2026)  
**Primary Documentation Ref:** Avid Technology User Guide (`SRC-005`)  

---

### Key Capabilities & Architectural Insights
- **Dual-Roller Trimming:** The undisputed industry gold standard for sub-frame trimming. Selecting an edit point allows the editor to play in a continuous loop while dynamically trimming outgoing (A-side) and incoming (B-side) frames using JKL keys.
- **Strict Media File Management:** Media is transcoded into Avid native MXF OP-Atom files (DNxHD / DNxHR) stored in numbered folders (`Avid MediaFiles/MXF/1`). The database index (`msmFMID.pmr`, `msmMOB.db`) is locked and managed at the OS level, preventing missing files during network collaboration.
- **Bin Locking & Shared Workspaces:** Multiple assistant editors and lead editors can work simultaneously within the same project. An open bin is locked with a green padlock for the active editor and a red lock for read-only assistants.

### Usability Concerns & Gaps
- Archaic interface with steep learning curve and rigid modal behaviors.
- Poor handling of modern consumer codecs (H.264/H.265 requires slow AMA linking or mandatory transcode).
- High hardware cost and licensing friction.

### FRAMEFLOW Opportunities
- Adopt Avid’s precision dual-roller trim loop and keyboard-driven numerical trimming.
- Avoid Avid's cumbersome mandatory transcode overhead by using high-speed WebCodecs hardware decoding.

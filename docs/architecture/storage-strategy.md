# FRAMEFLOW Architecture Specification: Storage & Persistence Strategy
**Document ID:** `ARCH-STO-001`  
**Classification:** Client & Cloud Storage Hybrid Architecture  
**Version:** 2.0  

---

## 1. Storage Tiers & Responsibilities

| Storage Medium | Technology | Scope | Contents Stored | Eviction & Lifecycle |
| :--- | :--- | :--- | :--- | :--- |
| **Origin Private File System (OPFS)** | WHATWG FileSystem API | Local Browser Sandbox | Video proxy chunks, conformed audio PCM, waveform cache, render thumbnails | User-configured quota cap with automatic LRU eviction |
| **IndexedDB** | IDB Database (`frameflow_db`) | Local Browser Database | Project metadata trees, sequence cut lists, undo history journals, workspace presets | Persistent across browser sessions; never evicted without user action |
| **LocalStorage** | HTML5 Key-Value | Local Browser Key-Value | UI theme, keyboard shortcut selection, panel width preferences | Indefinite persistence |
| **Cloud PostgreSQL** | Relational Database | Central Cloud Cluster | User accounts, team permissions, project ownership, collaboration markers | Authoritative server database |
| **Cloud Object Storage** | S3-Compatible Buckets | High-Capacity Cloud | Uploaded master raw footage, cloud export deliverables, shared proxy assets | Governed by cloud retention policies |

---

## 2. Quota Management & Eviction Rules
- Evaluated via `navigator.storage.estimate()`.
- If storage usage exceeds **80% of quota**, FRAMEFLOW issues an informational warning and initiates background cleanup of cached preview textures and conformed audio peaks.
- Source footage files and project undo journals are **never** subjected to automated eviction.

# Workflow Analysis: Export, Mastering & Cloud Rendering
See detailed pipeline in [professional-workflow-analysis.md](file:///h:/Ayush%20Work/Video%20Editor/docs/research/professional-workflow-analysis.md#stage-8-quality-control-qc--multi-platform-mastering).

## Export Subsystem
- Local in-browser export via WebCodecs `VideoEncoder` + MP4/WebM muxing.
- Cloud export queue using FFmpeg workers for high-complexity renders.
- Interchange export: OpenTimelineIO (OTIO), FCPXML, EDL, and CMX3600.

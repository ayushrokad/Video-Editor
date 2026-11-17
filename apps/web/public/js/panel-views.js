/**
 * FRAMEFLOW Live Specialist Panel Renderers
 * Renders real, state-backed UI for all implemented panels registered in PanelRegistry.
 * Every control mutates authoritative projectState / sessionState / audioEngine directly.
 */

import { TRANSITION_CATEGORIES, TRANSITION_CATALOG } from './transitions-gpu.js';
import {
  AVAILABLE_CLIP_EFFECTS,
  ensureEffectsArray,
  addClipEffect,
  toggleClipEffect,
  moveClipEffect,
  removeClipEffect,
  toggleKeyframeAtLocalTime,
} from './properties-controller.js';
import { detectExportCodecs, estimateFileSizeMB, validateExportConfig } from './export-pipeline.js';
import { formatBytes, STORAGE_DOMAIN_CATEGORIES } from './storage-diagnostics.js';

export function renderAllSpecialistPanels(ctx) {
  renderMediaBrowserPanel(ctx);
  renderEffectControlsPanel(ctx);
  renderTransitionBrowserPanel(ctx);
  renderTimelineIndexPanel(ctx);
  renderMetadataPanel(ctx);
  renderProjectInfoPanel(ctx);
  renderMediaDependenciesPanel(ctx);
  renderMotionControlsPanel(ctx);
  renderKeyframesPanel(ctx);
  renderGraphEditorPanel(ctx);
  renderEssentialGraphicsPanel(ctx);
  renderColorControlsPanel(ctx);
  renderComparisonViewerPanel(ctx);
  renderAudioRoutingPanel(ctx);
  renderAudioMetersPanel(ctx);
  renderLoudnessPanel(ctx);
  renderOutputValidationPanel(ctx);
  renderSystemPanels(ctx);
}

// ---------------- MEDIA BROWSER ----------------
export function renderMediaBrowserPanel(ctx) {
  const container = document.getElementById('media-browser-list');
  if (!container) return;

  const query = (document.getElementById('media-browser-search-input')?.value || '').trim().toLowerCase();
  const assets = Object.values(ctx.store.projectState.assets).filter(a =>
    !query || a.name.toLowerCase().includes(query) || (a.type || '').toLowerCase().includes(query)
  );
  const srcId = ctx.store.sessionState.sourceAssetId;

  if (assets.length === 0) {
    container.innerHTML = `<div style="padding: 28px 14px; text-align: center; color: var(--text-muted); font-size: 11.5px;">No footage imported yet. Click <strong>Import</strong> above or drop media into Project.</div>`;
    return;
  }

  container.innerHTML = `
    <table class="media-table">
      <thead><tr><th>Clip Name</th><th>Status</th><th>Resolution</th><th>Duration</th><th>Size</th><th>Action</th></tr></thead>
      <tbody>
        ${assets.map(a => {
    const dec = ctx.store.runtimeState.decoders.get(a.id);
    const missing = dec && dec.missing;
    const isAudio = (a.type || '').startsWith('audio');
    return `
            <tr class="${srcId === a.id ? 'selected' : ''}" data-mb-id="${a.id}" draggable="true">
              <td style="font-weight: 500;"><span class="icon icon-sm" style="color: ${isAudio ? 'var(--success)' : 'var(--accent)'}; margin-right: 4px;">${isAudio ? 'audiotrack' : 'movie'}</span>${a.name}</td>
              <td>${missing ? `<span class="missing-media-badge">OFFLINE</span>` : `<span style="color: var(--success); font-size: 10.5px;">Online</span>`}</td>
              <td style="font-family: monospace;">${isAudio ? 'Audio' : `${a.width}×${a.height}`}</td>
              <td style="font-family: monospace;">${ctx.formatTimecode(a.duration, ctx.getActiveSequence().fps)}</td>
              <td style="color: var(--text-secondary);">${((a.size || 0) / (1024 * 1024)).toFixed(2)} MB</td>
              <td>
                ${missing
        ? `<button class="action-btn-compact danger btn-mb-relink" data-relink-id="${a.id}">Relink</button>`
        : `<button class="action-btn-compact primary btn-mb-insert" data-insert-id="${a.id}">+ Timeline</button>`}
              </td>
            </tr>
          `;
  }).join('')}
      </tbody>
    </table>
  `;

  container.querySelectorAll('tr[data-mb-id]').forEach(row => {
    const id = row.dataset.mbId;
    row.addEventListener('click', () => {
      ctx.loadAssetIntoSourceMonitor(id, { preserveInOut: false, switchTab: false });
      renderMediaBrowserPanel(ctx);
      renderMetadataPanel(ctx);
    });
    row.addEventListener('dblclick', () => {
      ctx.loadAssetIntoSourceMonitor(id, { preserveInOut: false, switchTab: true });
    });
    row.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'asset', assetId: id }));
    });
  });

  container.querySelectorAll('.btn-mb-insert').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    ctx.insertSourceOrAssetToTimeline(btn.dataset.insertId, ctx.store.sessionState.playheadTime, { mode: 'insert' });
  }));
  container.querySelectorAll('.btn-mb-relink').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    ctx.triggerRelinkForAsset(btn.dataset.relinkId);
  }));
}

// ---------------- EFFECT CONTROLS ----------------
export function renderEffectControlsPanel(ctx) {
  const container = document.getElementById('effect-controls-body');
  if (!container) return;
  const clip = ctx.getActiveClip();
  if (!clip) {
    container.innerHTML = `<div style="padding: 24px 14px; text-align: center; color: var(--text-muted); font-size: 11.5px;">Select a clip on the timeline to inspect and keyframe its applied effects and motion parameters.</div>`;
    return;
  }

  const fxList = ensureEffectsArray(clip);
  const t = clip.transform || { positionX: 0, positionY: 0, scale: 1, rotation: 0, opacity: 1 };

  container.innerHTML = `
    <div class="props-context-banner">
      <strong style="color: #fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${clip.name}</strong>
      <span style="font-size: 10px; color: var(--text-muted);">${fxList.length} effect${fxList.length === 1 ? '' : 's'}</span>
    </div>
    <div class="inspector-accordion">
      <div class="accordion-header"><span>Motion (Intrinsic)</span><span class="icon icon-sm">expand_more</span></div>
      <div class="accordion-content">
        <div class="field-row"><div class="field-header"><span>Position X</span><span class="field-val" id="ec-disp-px">${Math.round(t.positionX || 0)}px</span></div><input type="range" id="ec-px" min="-960" max="960" step="1" value="${t.positionX || 0}"></div>
        <div class="field-row"><div class="field-header"><span>Position Y</span><span class="field-val" id="ec-disp-py">${Math.round(t.positionY || 0)}px</span></div><input type="range" id="ec-py" min="-540" max="540" step="1" value="${t.positionY || 0}"></div>
        <div class="field-row"><div class="field-header"><span>Scale</span><span class="field-val" id="ec-disp-sc">${((t.scale ?? 1) * 100).toFixed(0)}%</span></div><input type="range" id="ec-sc" min="0.1" max="3" step="0.02" value="${t.scale ?? 1}"></div>
        <div class="field-row"><div class="field-header"><span>Opacity</span><span class="field-val" id="ec-disp-op">${Math.round((t.opacity ?? 1) * 100)}%</span></div><input type="range" id="ec-op" min="0" max="1" step="0.02" value="${t.opacity ?? 1}"></div>
      </div>
    </div>
    <div class="inspector-accordion">
      <div class="accordion-header"><span>Applied Effects Stack</span><span class="icon icon-sm">expand_more</span></div>
      <div class="accordion-content">
        <div style="display: flex; gap: 4px; margin-bottom: 6px;">
          <select id="ec-add-fx-sel" class="compact-select" style="flex: 1;">
            <option value="">+ Add Video Effect...</option>
            ${AVAILABLE_CLIP_EFFECTS.map(e => `<option value="${e.id}">${e.name}</option>`).join('')}
          </select>
          <button class="action-btn-compact primary" id="ec-btn-add-fx">Add</button>
        </div>
        ${fxList.length === 0 ? `<div style="font-size: 11px; color: var(--text-muted);">No effects applied to this clip yet.</div>` : fxList.map((fx, i) => `
          <div class="applied-fx-card" data-ec-uid="${fx.uid}">
            <div class="applied-fx-header">
              <label style="display:flex; align-items:center; gap:5px; cursor:pointer;">
                <input type="checkbox" class="ec-chk-en" ${fx.enabled ? 'checked' : ''}>
                <span style="${fx.enabled ? '' : 'text-decoration:line-through; opacity:0.55;'}">${fx.name}</span>
              </label>
              <div style="display:flex; gap:2px;">
                ${i > 0 ? `<button class="panel-action-btn ec-fx-up" title="Move Up"><span class="icon icon-sm">arrow_upward</span></button>` : ''}
                ${i < fxList.length - 1 ? `<button class="panel-action-btn ec-fx-dn" title="Move Down"><span class="icon icon-sm">arrow_downward</span></button>` : ''}
                <button class="panel-action-btn ec-fx-del" title="Remove Effect" style="color:var(--error);"><span class="icon icon-sm">delete</span></button>
              </div>
            </div>
            <div style="padding: 6px 8px; display: flex; flex-direction: column; gap: 5px;">
              ${Object.entries(fx.params).map(([pk, pv]) => `
                <div class="field-row">
                  <div class="field-header"><span>${pk}</span><span class="field-val" data-ec-val="${pk}">${Number(pv).toFixed(2)}</span></div>
                  <input type="range" class="ec-sl-param" data-ec-param="${pk}" min="${pk === 'radiusPx' ? 0 : (pk === 'exposure' ? -2 : 0)}" max="${pk === 'radiusPx' ? 24 : (pk === 'temperature' ? 100 : 2)}" step="${pk === 'radiusPx' ? 0.5 : 0.05}" value="${pv}">
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  ctx.bindAccordionToggles(container);
  ctx.bindSlider('ec-px', 'ec-disp-px', v => { clip.transform.positionX = v; }, v => `${Math.round(v)}px`);
  ctx.bindSlider('ec-py', 'ec-disp-py', v => { clip.transform.positionY = v; }, v => `${Math.round(v)}px`);
  ctx.bindSlider('ec-sc', 'ec-disp-sc', v => { clip.transform.scale = v; }, v => `${(v * 100).toFixed(0)}%`);
  ctx.bindSlider('ec-op', 'ec-disp-op', v => { clip.transform.opacity = v; }, v => `${Math.round(v * 100)}%`);

  document.getElementById('ec-btn-add-fx')?.addEventListener('click', () => {
    const id = document.getElementById('ec-add-fx-sel')?.value;
    if (id) ctx.executeCommand('Add Clip Effect', () => addClipEffect(clip, id));
  });

  container.querySelectorAll('.applied-fx-card[data-ec-uid]').forEach(card => {
    const uid = card.dataset.ecUid;
    const fx = fxList.find(x => x.uid === uid);
    if (!fx) return;
    card.querySelector('.ec-chk-en')?.addEventListener('change', () => ctx.executeCommand('Toggle Effect', () => toggleClipEffect(clip, uid)));
    card.querySelector('.ec-fx-up')?.addEventListener('click', () => ctx.executeCommand('Reorder Effect', () => moveClipEffect(clip, uid, -1)));
    card.querySelector('.ec-fx-dn')?.addEventListener('click', () => ctx.executeCommand('Reorder Effect', () => moveClipEffect(clip, uid, 1)));
    card.querySelector('.ec-fx-del')?.addEventListener('click', () => ctx.executeCommand('Remove Effect', () => removeClipEffect(clip, uid)));
    card.querySelectorAll('.ec-sl-param').forEach(sl => {
      sl.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        fx.params[sl.dataset.ecParam] = val;
        const lbl = card.querySelector(`[data-ec-val="${sl.dataset.ecParam}"]`);
        if (lbl) lbl.textContent = val.toFixed(2);
        ctx.renderProgramMonitor();
        ctx.store.scheduleSave(250);
      });
    });
  });
}

// ---------------- TRANSITION BROWSER ----------------
export function renderTransitionBrowserPanel(ctx) {
  const body = document.getElementById('transition-browser-body');
  if (!body) return;
  body.innerHTML = TRANSITION_CATEGORIES.map(cat => {
    const items = TRANSITION_CATALOG.filter(t => t.category === cat);
    if (items.length === 0) return '';
    return `
      <div style="font-size: 10px; font-weight: 700; color: var(--accent); margin: 8px 0 4px; letter-spacing: 0.4px;">${cat.toUpperCase()}</div>
      ${items.map(tr => `
        <div class="fx-item-card" data-tb-id="${tr.id}">
          <div style="display:flex; align-items:center; gap:6px;">
            <span class="icon icon-sm" style="color: var(--accent-cyan);">${tr.icon}</span>
            <div><div style="font-weight:600; font-size:11.5px;">${tr.name}</div><div style="font-size:10px; color:var(--text-muted);">${tr.defaultDuration}s default</div></div>
          </div>
          <button class="action-btn-compact primary">Apply</button>
        </div>
      `).join('')}
    `;
  }).join('');

  body.querySelectorAll('[data-tb-id]').forEach(card => card.addEventListener('click', () => {
    const def = TRANSITION_CATALOG.find(t => t.id === card.dataset.tbId);
    if (def) ctx.applyTransitionToActiveClip(def);
  }));
}

// ---------------- TIMELINE INDEX ----------------
export function renderTimelineIndexPanel(ctx) {
  const body = document.getElementById('timeline-index-body');
  if (!body) return;
  const seq = ctx.getActiveSequence();
  const selIds = new Set(ctx.store.sessionState.selectedClipIds || []);

  const clipsSorted = [...seq.clips].sort((a, b) => a.timelineStart - b.timelineStart);
  body.innerHTML = `
    <div style="font-size: 10px; font-weight: 700; color: var(--accent); margin-bottom: 6px;">SEQUENCE CLIPS (${clipsSorted.length})</div>
    ${clipsSorted.length === 0
      ? `<div style="font-size: 11px; color: var(--text-muted); margin-bottom: 10px;">No clips in active sequence.</div>`
      : clipsSorted.map(c => {
        const tr = seq.tracks.find(t => t.id === c.trackId);
        return `
            <div class="fx-item-card" data-tidx-clip="${c.id}" style="${selIds.has(c.id) ? 'border-color: var(--accent); background: rgba(75,141,255,0.14);' : ''}">
              <div style="min-width: 0; overflow: hidden;">
                <div style="font-weight: 600; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${tr?.shortName || ''} · ${c.name}</div>
                <div style="font-size: 10px; font-family: monospace; color: var(--text-muted);">${ctx.formatTimecode(c.timelineStart, seq.fps)} · ${c.timelineDuration.toFixed(1)}s</div>
              </div>
            </div>
          `;
      }).join('')}
    <div style="font-size: 10px; font-weight: 700; color: var(--warning); margin: 10px 0 6px;">MARKERS (${(seq.markers || []).length})</div>
    ${(seq.markers || []).map(m => `
      <div class="fx-item-card" data-tidx-marker="${m.time}">
        <span style="color: var(--warning); font-weight: 600;">${m.label}</span>
        <span style="font-family: monospace; font-size: 10px; color: var(--text-secondary);">${ctx.formatTimecode(m.time, seq.fps)}</span>
      </div>
    `).join('')}
  `;

  body.querySelectorAll('[data-tidx-clip]').forEach(el => el.addEventListener('click', () => {
    const clip = seq.clips.find(c => c.id === el.dataset.tidxClip);
    if (!clip) return;
    ctx.setSelectedClipIds([clip.id]);
    ctx.seekSequence(clip.timelineStart + 0.02);
    ctx.renderAll();
  }));
  body.querySelectorAll('[data-tidx-marker]').forEach(el => el.addEventListener('click', () => {
    ctx.seekSequence(parseFloat(el.dataset.tidxMarker) || 0);
  }));
}

// ---------------- METADATA PANEL ----------------
export function renderMetadataPanel(ctx) {
  const body = document.getElementById('metadata-panel-body');
  if (!body) return;
  const seq = ctx.getActiveSequence();
  const clip = ctx.getActiveClip();
  const assetId = clip?.assetId || ctx.store.sessionState.sourceAssetId;
  const asset = assetId ? ctx.store.projectState.assets[assetId] : null;
  const dec = assetId ? ctx.store.runtimeState.decoders.get(assetId) : null;

  if (!asset && !clip) {
    body.innerHTML = `<div style="padding: 20px 12px; text-align: center; color: var(--text-muted); font-size: 11.5px;">Select a media asset or timeline clip to inspect technical metadata.</div>`;
    return;
  }

  body.innerHTML = `
    <div class="inspector-accordion">
      <div class="accordion-header"><span>${clip ? 'Selected Clip Metadata' : 'Source Asset Metadata'}</span><span class="icon icon-sm">expand_more</span></div>
      <div class="accordion-content">
        <div class="field-row"><div class="field-header"><span>Name</span><span class="field-val">${asset ? asset.name : clip.name}</span></div></div>
        <div class="field-row"><div class="field-header"><span>Status</span><span class="field-val" style="color: ${dec?.missing ? 'var(--error)' : 'var(--success)'};">${dec?.missing ? 'MEDIA OFFLINE' : 'Online'}</span></div></div>
        <div class="field-row"><div class="field-header"><span>Dimensions</span><span class="field-val">${asset ? `${asset.width} × ${asset.height}` : `${seq.width} × ${seq.height}`}</span></div></div>
        <div class="field-row"><div class="field-header"><span>Duration</span><span class="field-val">${ctx.formatTimecode(asset ? asset.duration : clip.timelineDuration, seq.fps)}</span></div></div>
        <div class="field-row"><div class="field-header"><span>MIME / Type</span><span class="field-val">${asset ? asset.type : (clip?.isTitle ? 'Title Layer' : 'Clip')}</span></div></div>
        <div class="field-row"><div class="field-header"><span>File Size</span><span class="field-val">${asset ? `${((asset.size || 0) / (1024 * 1024)).toFixed(2)} MB` : '--'}</span></div></div>
        ${dec?.missing && asset ? `<button class="action-btn-compact primary" id="meta-panel-relink" style="margin-top: 6px; justify-content: center;">Relink Media...</button>` : ''}
      </div>
    </div>
  `;
  document.getElementById('meta-panel-relink')?.addEventListener('click', () => ctx.triggerRelinkForAsset(asset.id));
}

// ---------------- PROJECT INFORMATION & SAVE DIAGNOSTICS ----------------
export function renderProjectInfoPanel(ctx) {
  const body = document.getElementById('project-info-body');
  if (!body) return;
  const p = ctx.store.projectState;
  const seqs = Object.values(p.sequences);
  const activeSeq = ctx.getActiveSequence();
  const totalClips = seqs.reduce((sum, s) => sum + (s.clips?.length || 0), 0);
  const diag = ctx.store.autosave.getDiagnostics();
  const savedTimeStr = diag.lastSavedAt
    ? new Date(diag.lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : 'Not yet saved';

  body.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 8px; font-size: 11.5px;">
      <div class="field-row"><div class="field-header"><span>Project</span><span class="field-val">${p.title}</span></div></div>
      <div class="field-row"><div class="field-header"><span>Project ID</span><span class="field-val" style="color:var(--text-muted);">${p.id}</span></div></div>
      <div class="field-row"><div class="field-header"><span>Active Sequence</span><span class="field-val">${activeSeq.name}</span></div></div>
      <div class="field-row"><div class="field-header"><span>Format</span><span class="field-val">${activeSeq.width}×${activeSeq.height} @ ${activeSeq.fps} fps</span></div></div>
      <div class="field-row"><div class="field-header"><span>Assets / Clips</span><span class="field-val">${Object.keys(p.assets).length} / ${totalClips}</span></div></div>

      <div style="background:#10151E; border:1px solid var(--border); border-radius:4px; padding:8px; display:flex; flex-direction:column; gap:4px; margin-top:4px;">
        <div style="font-size:10px; font-weight:700; color:var(--accent); letter-spacing:0.4px; margin-bottom:2px;">SAVE DIAGNOSTICS</div>
        <div class="field-row"><div class="field-header"><span>Status</span><span class="field-val" style="color:${diag.status === 'failed' ? 'var(--error)' : (diag.pendingChanges ? 'var(--warning)' : 'var(--success)')};">${diag.status.toUpperCase()}</span></div></div>
        <div class="field-row"><div class="field-header"><span>Last saved revision</span><span class="field-val">rev ${diag.lastSavedRevision}</span></div></div>
        <div class="field-row"><div class="field-header"><span>Current revision</span><span class="field-val">rev ${diag.currentRevision}</span></div></div>
        <div class="field-row"><div class="field-header"><span>Pending changes</span><span class="field-val" style="color:${diag.pendingChanges ? 'var(--warning)' : 'var(--success)'};">${diag.pendingChanges ? 'Yes (Modified)' : 'No (Clean)'}</span></div></div>
        <div class="field-row"><div class="field-header"><span>Last saved at</span><span class="field-val">${savedTimeStr}</span></div></div>
        <div class="field-row"><div class="field-header"><span>Last save duration</span><span class="field-val">${diag.lastSaveDurationMs} ms</span></div></div>
        <div class="field-row"><div class="field-header"><span>Total save operations</span><span class="field-val">${diag.totalSaves}</span></div></div>
        <div class="field-row"><div class="field-header"><span>Unnecessary saves skipped</span><span class="field-val" style="color:var(--accent-cyan);">${diag.skippedUnnecessarySaves}</span></div></div>
        <div style="display:flex; gap:5px; margin-top:4px;">
          <button class="action-btn-compact primary" id="pinfo-save-now" style="flex:1; justify-content:center;">Save Now (Ctrl+S)</button>
          <button class="action-btn-compact" id="pinfo-open-storage" style="flex:1; justify-content:center; border-color:var(--border);">Storage Audit</button>
        </div>
      </div>

      <div style="font-size: 10px; font-weight: 700; color: var(--accent); margin-top: 4px;">SEQUENCES (${seqs.length})</div>
      ${seqs.map(s => `
        <div class="fx-item-card" data-switch-seq="${s.id}" style="${s.id === activeSeq.id ? 'border-color: var(--accent);' : ''}">
          <span>${s.name}</span>
          <span style="font-family: monospace; font-size: 10px; color: var(--text-muted);">${s.clips.length} clips</span>
        </div>
      `).join('')}
      <div style="display: flex; gap: 6px; margin-top: 4px;">
        <button class="action-btn-compact" id="pinfo-proj-settings" style="flex:1; justify-content:center; border-color: var(--border);">Project Settings</button>
        <button class="action-btn-compact" id="pinfo-seq-settings" style="flex:1; justify-content:center; border-color: var(--border);">Sequence Settings</button>
      </div>
    </div>
  `;

  body.querySelectorAll('[data-switch-seq]').forEach(el => el.addEventListener('click', () => {
    ctx.store.sessionState.activeSequenceId = el.dataset.switchSeq;
    ctx.store.projectState.activeSequenceId = el.dataset.switchSeq;
    ctx.store.sanitizeSelection();
    ctx.store.markProjectDirty('switch-sequence');
    ctx.renderAll();
  }));
  document.getElementById('pinfo-save-now')?.addEventListener('click', async () => {
    await ctx.store.saveProjectNow({ reason: 'manual-save-panel', manual: true });
    renderProjectInfoPanel(ctx);
  });
  document.getElementById('pinfo-open-storage')?.addEventListener('click', () => ctx.openStorageDiagnosticsPanel?.());
  document.getElementById('pinfo-proj-settings')?.addEventListener('click', ctx.openProjectSettingsModal);
  document.getElementById('pinfo-seq-settings')?.addEventListener('click', ctx.openSequenceSettingsModal);
}

// ---------------- MEDIA DEPENDENCIES ----------------
export function renderMediaDependenciesPanel(ctx) {
  const body = document.getElementById('media-dependencies-body');
  if (!body) return;
  const assets = Object.values(ctx.store.projectState.assets);
  const seqs = Object.values(ctx.store.projectState.sequences);

  if (assets.length === 0) {
    body.innerHTML = `<div style="padding: 18px 10px; text-align: center; color: var(--text-muted); font-size: 11px;">No imported media assets to track.</div>`;
    return;
  }

  body.innerHTML = assets.map(a => {
    const uses = seqs.reduce((sum, s) => sum + s.clips.filter(c => c.assetId === a.id).length, 0);
    const dec = ctx.store.runtimeState.decoders.get(a.id);
    const offline = dec && dec.missing;
    return `
      <div class="fx-item-card">
        <div style="min-width: 0; overflow: hidden;">
          <div style="font-weight: 600; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${a.name}</div>
          <div style="font-size: 10px; color: ${offline ? 'var(--error)' : 'var(--text-muted)'};">${offline ? 'OFFLINE' : 'Online'} · Used ${uses}× in sequences</div>
        </div>
        ${offline ? `<button class="action-btn-compact danger btn-dep-relink" data-dep-id="${a.id}">Relink</button>` : `<span style="font-size: 10px; color: var(--success);">OK</span>`}
      </div>
    `;
  }).join('');

  body.querySelectorAll('.btn-dep-relink').forEach(b => b.addEventListener('click', (e) => {
    e.stopPropagation();
    ctx.triggerRelinkForAsset(b.dataset.depId);
  }));
}

// ---------------- MOTION CONTROLS ----------------
export function renderMotionControlsPanel(ctx) {
  const body = document.getElementById('motion-controls-body');
  if (!body) return;
  const clip = ctx.getActiveClip();
  if (!clip) {
    body.innerHTML = `<div style="padding: 20px 12px; text-align: center; color: var(--text-muted); font-size: 11.5px;">Select a clip to adjust Motion & Transform parameters.</div>`;
    return;
  }
  const t = clip.transform || { positionX: 0, positionY: 0, scale: 1, rotation: 0, opacity: 1 };
  const localT = Math.max(0, ctx.store.sessionState.playheadTime - clip.timelineStart);
  const hasKf = (k) => (clip.keyframes?.[k] || []).some(kf => Math.abs(kf.time - localT) < 0.06);

  body.innerHTML = `
    <div class="props-context-banner"><strong>${clip.name}</strong><span style="font-size:10px; color:var(--text-muted);">Transform</span></div>
    <div style="padding: 8px 10px; display: flex; flex-direction: column; gap: 7px;">
      <div class="field-row"><div class="field-header"><span><button class="kf-stopwatch-btn ${hasKf('positionX') ? 'active' : ''}" data-mkf="positionX"><span class="icon icon-sm">timer</span></button> Position X</span><span class="field-val" id="mc-d-px">${Math.round(t.positionX || 0)}px</span></div><input type="range" id="mc-px" min="-960" max="960" step="1" value="${t.positionX || 0}"></div>
      <div class="field-row"><div class="field-header"><span><button class="kf-stopwatch-btn ${hasKf('positionY') ? 'active' : ''}" data-mkf="positionY"><span class="icon icon-sm">timer</span></button> Position Y</span><span class="field-val" id="mc-d-py">${Math.round(t.positionY || 0)}px</span></div><input type="range" id="mc-py" min="-540" max="540" step="1" value="${t.positionY || 0}"></div>
      <div class="field-row"><div class="field-header"><span><button class="kf-stopwatch-btn ${hasKf('scale') ? 'active' : ''}" data-mkf="scale"><span class="icon icon-sm">timer</span></button> Scale</span><span class="field-val" id="mc-d-sc">${((t.scale ?? 1) * 100).toFixed(0)}%</span></div><input type="range" id="mc-sc" min="0.1" max="3" step="0.02" value="${t.scale ?? 1}"></div>
      <div class="field-row"><div class="field-header"><span><button class="kf-stopwatch-btn ${hasKf('rotation') ? 'active' : ''}" data-mkf="rotation"><span class="icon icon-sm">timer</span></button> Rotation</span><span class="field-val" id="mc-d-rot">${Math.round(t.rotation || 0)}°</span></div><input type="range" id="mc-rot" min="-360" max="360" step="1" value="${t.rotation || 0}"></div>
      <div class="field-row"><div class="field-header"><span><button class="kf-stopwatch-btn ${hasKf('opacity') ? 'active' : ''}" data-mkf="opacity"><span class="icon icon-sm">timer</span></button> Opacity</span><span class="field-val" id="mc-d-op">${Math.round((t.opacity ?? 1) * 100)}%</span></div><input type="range" id="mc-op" min="0" max="1" step="0.02" value="${t.opacity ?? 1}"></div>
    </div>
  `;

  ctx.bindSlider('mc-px', 'mc-d-px', v => { clip.transform.positionX = v; }, v => `${Math.round(v)}px`);
  ctx.bindSlider('mc-py', 'mc-d-py', v => { clip.transform.positionY = v; }, v => `${Math.round(v)}px`);
  ctx.bindSlider('mc-sc', 'mc-d-sc', v => { clip.transform.scale = v; }, v => `${(v * 100).toFixed(0)}%`);
  ctx.bindSlider('mc-rot', 'mc-d-rot', v => { clip.transform.rotation = v; }, v => `${Math.round(v)}°`);
  ctx.bindSlider('mc-op', 'mc-d-op', v => { clip.transform.opacity = v; }, v => `${Math.round(v * 100)}%`);

  body.querySelectorAll('[data-mkf]').forEach(btn => btn.addEventListener('click', () => {
    const prop = btn.dataset.mkf;
    ctx.executeCommand(`Toggle Keyframe: ${prop}`, () => {
      toggleKeyframeAtLocalTime(clip, prop, localT, clip.transform[prop], 'smooth');
    });
  }));
}

// ---------------- KEYFRAMES PANEL ----------------
export function renderKeyframesPanel(ctx) {
  const body = document.getElementById('keyframes-body');
  if (!body) return;
  const clip = ctx.getActiveClip();
  const seq = ctx.getActiveSequence();
  if (!clip) {
    body.innerHTML = `<div style="padding: 18px 10px; text-align: center; color: var(--text-muted); font-size: 11px;">Select a clip to view and edit its keyframes.</div>`;
    return;
  }

  const rows = [];
  for (const [prop, list] of Object.entries(clip.keyframes || {})) {
    for (const kf of (list || [])) {
      rows.push({ prop, ...kf });
    }
  }
  rows.sort((a, b) => a.time - b.time);

  body.innerHTML = `
    <div style="font-size: 10.5px; color: var(--text-secondary); margin-bottom: 6px;"><strong>${clip.name}</strong> · ${rows.length} keyframe${rows.length === 1 ? '' : 's'}</div>
    ${rows.length === 0
      ? `<div style="font-size: 11px; color: var(--text-muted);">No keyframes yet. Use Motion Controls or Properties → Motion to set keyframes at the playhead.</div>`
      : rows.map((r, idx) => `
          <div class="fx-item-card" data-kf-jump="${clip.timelineStart + r.time}">
            <div>
              <div style="font-weight: 600; font-size: 11px;">${r.prop} = ${Number(r.value).toFixed(2)}</div>
              <div style="font-size: 10px; color: var(--text-muted); font-family: monospace;">${ctx.formatTimecode(r.time, seq.fps)} · ${r.easing}</div>
            </div>
            <button class="action-btn-compact danger btn-del-kf" data-kf-prop="${r.prop}" data-kf-time="${r.time}" data-idx="${idx}">✕</button>
          </div>
        `).join('')}
  `;

  body.querySelectorAll('[data-kf-jump]').forEach(el => el.addEventListener('click', (e) => {
    if (e.target.closest('.btn-del-kf')) return;
    ctx.seekSequence(parseFloat(el.dataset.kfJump) || 0);
  }));
  body.querySelectorAll('.btn-del-kf').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const prop = btn.dataset.kfProp;
    const tVal = parseFloat(btn.dataset.kfTime);
    ctx.executeCommand('Delete Keyframe', () => {
      if (clip.keyframes?.[prop]) {
        clip.keyframes[prop] = clip.keyframes[prop].filter(k => Math.abs(k.time - tVal) > 0.001);
      }
    });
  }));
}

// ---------------- GRAPH EDITOR PANEL ----------------
export function renderGraphEditorPanel(ctx) {
  const canvas = document.getElementById('graph-editor-panel-canvas');
  if (!canvas) return;
  const w = canvas.width = canvas.clientWidth || 480;
  const h = canvas.height = Math.max(96, canvas.clientHeight || 110);
  const ctx2d = canvas.getContext('2d');
  ctx2d.fillStyle = '#070A10';
  ctx2d.fillRect(0, 0, w, h);
  ctx2d.strokeStyle = '#1B2230';
  ctx2d.lineWidth = 1;
  for (let x = 0; x < w; x += 60) { ctx2d.beginPath(); ctx2d.moveTo(x, 0); ctx2d.lineTo(x, h); ctx2d.stroke(); }
  for (let y = 0; y < h; y += 30) { ctx2d.beginPath(); ctx2d.moveTo(0, y); ctx2d.lineTo(w, y); ctx2d.stroke(); }

  ctx2d.strokeStyle = '#4B8DFF';
  ctx2d.lineWidth = 2;
  ctx2d.beginPath();
  ctx2d.moveTo(24, h - 18);
  ctx2d.bezierCurveTo(w * 0.34, h - 18, w * 0.48, 18, w * 0.74, 18);
  ctx2d.lineTo(w - 24, 18);
  ctx2d.stroke();

  // Keyframe nodes
  ctx2d.fillStyle = '#E6EAF0';
  for (const [kx, ky] of [[24, h - 18], [w * 0.74, 18]]) {
    ctx2d.beginPath();
    ctx2d.arc(kx, ky, 4, 0, Math.PI * 2);
    ctx2d.fill();
  }
}

// ---------------- ESSENTIAL GRAPHICS ----------------
export function renderEssentialGraphicsPanel(ctx) {
  const body = document.getElementById('essential-graphics-body');
  if (!body) return;
  const clip = ctx.getActiveClip();
  const isTitle = clip && clip.isTitle;

  body.innerHTML = `
    <div style="font-size: 10px; font-weight: 700; color: var(--accent); margin-bottom: 6px;">CREATE TITLE OVERLAY</div>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin-bottom: 10px;">
      <button class="action-btn-compact primary" id="eg-add-center" style="justify-content:center;"><span class="icon icon-sm">title</span> Centered Title</button>
      <button class="action-btn-compact" id="eg-add-lower" style="justify-content:center; border-color: var(--border);"><span class="icon icon-sm">subtitles</span> Lower Third</button>
    </div>
    ${isTitle ? `
      <div style="font-size: 10px; font-weight: 700; color: var(--accent); margin-bottom: 6px;">ACTIVE TITLE: ${clip.name}</div>
      <div class="field-row" style="margin-bottom:6px;"><div class="field-header"><span>Text</span></div><input type="text" id="eg-title-text" value="${clip.titleText || clip.name}" style="background:var(--bg-input); border:1px solid var(--border); color:#fff; padding:4px 6px; border-radius:3px;"></div>
      <div class="field-row" style="margin-bottom:6px;"><div class="field-header"><span>Font Size</span><span class="field-val" id="eg-d-size">${clip.titleFontSize || 92}px</span></div><input type="range" id="eg-title-size" min="24" max="200" step="2" value="${clip.titleFontSize || 92}"></div>
      <div class="field-row"><div class="field-header"><span>Fill Color</span></div><input type="color" id="eg-title-color" value="${clip.titleColor || '#ffffff'}" style="width:100%; height:26px; background:transparent; border:1px solid var(--border); border-radius:3px;"></div>
    ` : `<div style="font-size: 11px; color: var(--text-muted);">Select a Title clip on the timeline (or create one above) to customize its typography and style.</div>`}
  `;

  document.getElementById('eg-add-center')?.addEventListener('click', () => ctx.addTitleOverlayClip('FRAMEFLOW STUDIO', 0));
  document.getElementById('eg-add-lower')?.addEventListener('click', () => ctx.addTitleOverlayClip('SPEAKER NAME · TITLE', 340));

  if (isTitle) {
    document.getElementById('eg-title-text')?.addEventListener('input', (e) => {
      clip.titleText = e.target.value;
      clip.name = `Title: ${e.target.value || 'Untitled'}`;
      ctx.renderProgramMonitor();
      ctx.renderTimeline();
      ctx.store.scheduleSave(250);
    });
    ctx.bindSlider('eg-title-size', 'eg-d-size', v => { clip.titleFontSize = v; }, v => `${Math.round(v)}px`);
    document.getElementById('eg-title-color')?.addEventListener('input', (e) => {
      clip.titleColor = e.target.value;
      ctx.renderProgramMonitor();
      ctx.store.scheduleSave(250);
    });
  }
}

// ---------------- COLOR CONTROLS ----------------
export function renderColorControlsPanel(ctx) {
  const body = document.getElementById('color-controls-body');
  if (!body) return;
  const clip = ctx.getActiveClip();
  if (!clip) {
    body.innerHTML = `<div style="padding: 20px 12px; text-align: center; color: var(--text-muted); font-size: 11.5px;">Select a video clip on the timeline to adjust primary color correction.</div>`;
    return;
  }
  const c = clip.colorEffects || (clip.colorEffects = { exposure: 0, contrast: 1, brightness: 0, saturation: 1, temperature: 0, tint: 0 });

  body.innerHTML = `
    <div class="props-context-banner">
      <strong style="color:#fff;">${clip.name}</strong>
      <button class="action-btn-compact" id="cc-reset-btn" style="padding:1px 6px; font-size:10px; border-color:var(--border);">Reset</button>
    </div>
    <div style="padding: 8px 10px; display: flex; flex-direction: column; gap: 7px;">
      <div class="field-row"><div class="field-header"><span>Exposure</span><span class="field-val" id="cc-d-exp">${(c.exposure || 0).toFixed(2)}</span></div><input type="range" id="cc-exp" min="-2" max="2" step="0.05" value="${c.exposure || 0}"></div>
      <div class="field-row"><div class="field-header"><span>Contrast</span><span class="field-val" id="cc-d-cont">${(c.contrast ?? 1).toFixed(2)}</span></div><input type="range" id="cc-cont" min="0" max="2" step="0.05" value="${c.contrast ?? 1}"></div>
      <div class="field-row"><div class="field-header"><span>Brightness</span><span class="field-val" id="cc-d-br">${(c.brightness || 0).toFixed(2)}</span></div><input type="range" id="cc-br" min="-1" max="1" step="0.05" value="${c.brightness || 0}"></div>
      <div class="field-row"><div class="field-header"><span>Saturation</span><span class="field-val" id="cc-d-sat">${(c.saturation ?? 1).toFixed(2)}</span></div><input type="range" id="cc-sat" min="0" max="2" step="0.05" value="${c.saturation ?? 1}"></div>
      <div class="field-row"><div class="field-header"><span>Temperature</span><span class="field-val" id="cc-d-temp">${c.temperature || 0}</span></div><input type="range" id="cc-temp" min="-100" max="100" step="1" value="${c.temperature || 0}"></div>
    </div>
  `;

  ctx.bindSlider('cc-exp', 'cc-d-exp', v => { clip.colorEffects.exposure = v; }, v => v.toFixed(2));
  ctx.bindSlider('cc-cont', 'cc-d-cont', v => { clip.colorEffects.contrast = v; }, v => v.toFixed(2));
  ctx.bindSlider('cc-br', 'cc-d-br', v => { clip.colorEffects.brightness = v; }, v => v.toFixed(2));
  ctx.bindSlider('cc-sat', 'cc-d-sat', v => { clip.colorEffects.saturation = v; }, v => v.toFixed(2));
  ctx.bindSlider('cc-temp', 'cc-d-temp', v => { clip.colorEffects.temperature = v; }, v => String(v));
  document.getElementById('cc-reset-btn')?.addEventListener('click', () => ctx.resetClipProperties(clip));
}

// ---------------- COMPARISON VIEWER ----------------
export function renderComparisonViewerPanel(ctx) {
  const body = document.getElementById('comparison-viewer-body');
  if (!body) return;
  const active = Boolean(ctx.store.sessionState.programCompareMode);
  body.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:10px; font-size:11.5px;">
      <div style="color:var(--text-secondary);">Compare original ungraded footage (left half) against live color grade & effects (right half) directly on the Program Monitor.</div>
      <button class="action-btn-compact ${active ? 'primary' : ''}" id="comp-toggle-wipe" style="justify-content:center; border-color:var(--border);">
        <span class="icon icon-sm">compare</span> ${active ? 'Disable Before/After Wipe' : 'Enable Before/After Wipe'}
      </button>
    </div>
  `;
  document.getElementById('comp-toggle-wipe')?.addEventListener('click', () => {
    document.getElementById('prg-btn-compare')?.click();
    renderComparisonViewerPanel(ctx);
  });
}

// ---------------- AUDIO ROUTING, METERS & LOUDNESS ----------------
export function renderAudioRoutingPanel(ctx) {
  const body = document.getElementById('audio-routing-body');
  if (!body) return;
  const seq = ctx.getActiveSequence();
  const audioTracks = seq.tracks.filter(t => t.type === 'audio');
  const selTrack = audioTracks.find(t => t.id === ctx.store.sessionState.selectedTrackId) || audioTracks[0];

  body.innerHTML = `
    <div style="font-size: 10px; font-weight: 700; color: var(--accent); margin-bottom: 6px;">TRACK-TO-BUS ROUTING</div>
    ${audioTracks.map(t => `
      <div class="fx-item-card" data-ar-track="${t.id}" style="${selTrack && selTrack.id === t.id ? 'border-color: var(--accent);' : ''}">
        <span style="font-weight: 600;">${t.name}</span>
        <select class="compact-select ar-bus-sel" data-tid="${t.id}">
          ${ctx.audioEngine.busDefinitions.map(b => `<option value="${b.id}" ${t.busId === b.id ? 'selected' : ''}>→ ${b.name}</option>`).join('')}
        </select>
      </div>
    `).join('')}
    ${selTrack ? `
      <div style="font-size: 10px; font-weight: 700; color: var(--accent); margin: 10px 0 6px;">3-BAND EQ · ${selTrack.name}</div>
      <div class="field-row"><div class="field-header"><span>Low (120Hz)</span><span class="field-val" id="ar-d-l">${(selTrack.eqLow || 0).toFixed(1)} dB</span></div><input type="range" id="ar-eq-l" min="-12" max="12" step="0.5" value="${selTrack.eqLow || 0}"></div>
      <div class="field-row"><div class="field-header"><span>Mid (1.2kHz)</span><span class="field-val" id="ar-d-m">${(selTrack.eqMid || 0).toFixed(1)} dB</span></div><input type="range" id="ar-eq-m" min="-12" max="12" step="0.5" value="${selTrack.eqMid || 0}"></div>
      <div class="field-row"><div class="field-header"><span>High (8kHz)</span><span class="field-val" id="ar-d-h">${(selTrack.eqHigh || 0).toFixed(1)} dB</span></div><input type="range" id="ar-eq-h" min="-12" max="12" step="0.5" value="${selTrack.eqHigh || 0}"></div>
    ` : ''}
  `;

  body.querySelectorAll('[data-ar-track]').forEach(el => el.addEventListener('click', (e) => {
    if (e.target.tagName === 'SELECT') return;
    ctx.store.sessionState.selectedTrackId = el.dataset.arTrack;
    renderAudioRoutingPanel(ctx);
  }));
  body.querySelectorAll('.ar-bus-sel').forEach(sel => sel.addEventListener('change', (e) => {
    const tr = audioTracks.find(t => t.id === sel.dataset.tid);
    if (!tr) return;
    tr.busId = e.target.value;
    ctx.audioEngine.updateTrackParams(tr, seq.tracks);
    ctx.store.scheduleSave(200);
  }));
  if (selTrack) {
    const bindEq = (id, disp, prop) => document.getElementById(id)?.addEventListener('input', (e) => {
      selTrack[prop] = parseFloat(e.target.value);
      const d = document.getElementById(disp); if (d) d.textContent = `${selTrack[prop].toFixed(1)} dB`;
      ctx.audioEngine.updateTrackParams(selTrack, seq.tracks);
      ctx.store.scheduleSave(250);
    });
    bindEq('ar-eq-l', 'ar-d-l', 'eqLow');
    bindEq('ar-eq-m', 'ar-d-m', 'eqMid');
    bindEq('ar-eq-h', 'ar-d-h', 'eqHigh');
  }
}

export function renderAudioMetersPanel(ctx) {
  const body = document.getElementById('audio-meters-body');
  if (!body || body.dataset.initialized === '1') return;
  body.dataset.initialized = '1';
  body.innerHTML = `
    <div style="display:flex; flex-direction:column; align-items:center; gap:8px; height:100%;">
      <div style="font-size:10.5px; font-weight:700; color:var(--text-secondary);">MASTER STEREO PEAK</div>
      <div style="flex:1; width:64px; min-height:110px; display:flex; gap:6px; background:#070A0F; border:1px solid var(--border); border-radius:4px; padding:6px;">
        <div class="vu-channel"><div class="vu-fill" id="panel-vu-l"></div></div>
        <div class="vu-channel"><div class="vu-fill" id="panel-vu-r"></div></div>
      </div>
      <div style="font-family:monospace; font-size:12px; color:var(--success);" id="panel-vu-db">-∞ dBFS</div>
    </div>
  `;
}

export function renderLoudnessPanel(ctx) {
  const body = document.getElementById('loudness-analysis-body');
  if (!body) return;
  body.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:8px;">
      <div style="font-size:10.5px; font-weight:700; color:var(--accent);">EBU R128 LOUDNESS</div>
      <div class="lufs-big-readout" id="panel-lufs-int">-∞ LUFS</div>
      <div class="field-row"><div class="field-header"><span>Momentary</span><span class="field-val" id="panel-lufs-mom">-∞ LUFS</span></div></div>
      <div class="field-row"><div class="field-header"><span>True Peak</span><span class="field-val" id="panel-lufs-tp">-∞ dBTP</span></div></div>
      <button class="action-btn-compact" id="btn-panel-reset-lufs" style="justify-content:center; border-color:var(--border);">Reset Measurement</button>
    </div>
  `;
  document.getElementById('btn-panel-reset-lufs')?.addEventListener('click', () => { ctx.audioEngine.lufsHistory = []; });
}

// ---------------- OUTPUT VALIDATION ----------------
export function renderOutputValidationPanel(ctx) {
  const body = document.getElementById('output-validation-body');
  if (!body) return;
  const seq = ctx.getActiveSequence();
  const cfg = ctx.uiState.exportConfig;
  const probe = ctx.store.runtimeState.codecCapabilities || detectExportCodecs();
  const contentEnd = seq.clips.reduce((m, c) => Math.max(m, c.timelineStart + c.timelineDuration), 0);
  const fullCfg = { ...cfg, durationSec: contentEnd > 0 ? contentEnd : 5 };
  const val = validateExportConfig(fullCfg, probe);
  const estMB = estimateFileSizeMB(fullCfg);

  body.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:8px; font-size:11.5px;">
      <div style="padding:8px; border-radius:4px; border:1px solid ${val.valid ? 'var(--success)' : 'var(--error)'}; background:${val.valid ? 'rgba(56,201,149,0.1)' : 'rgba(227,111,120,0.12)'};">
        <strong style="color:${val.valid ? 'var(--success)' : 'var(--error)'};">${val.valid ? '✓ Ready to Render' : '✕ Validation Errors'}</strong>
        <div style="font-size:10.5px; color:var(--text-secondary); margin-top:3px;">Estimated Output Size: <strong>${estMB.toFixed(2)} MB</strong></div>
      </div>
      ${val.errors.map(e => `<div style="color:var(--error); font-size:11px;">• ${e}</div>`).join('')}
      ${val.warnings.map(w => `<div style="color:var(--warning); font-size:11px;">• ${w}</div>`).join('')}
      <div style="font-size:10px; font-weight:700; color:var(--accent); margin-top:4px;">BROWSER CODEC PROBE</div>
      ${probe.formats.map(f => `
        <div style="display:flex; justify-content:space-between; font-size:11px; padding:3px 0; border-bottom:1px solid var(--border-divider);">
          <span>${f.label}</span>
          <span style="color:${f.supported ? 'var(--success)' : 'var(--text-muted)'};">${f.supported ? 'Supported' : 'Unavailable'}</span>
        </div>
      `).join('')}
    </div>
  `;
}

// ---------------- SYSTEM PANELS (DIAGNOSTICS, PERFORMANCE, GPU, CACHE) ----------------
export function renderSystemPanels(ctx) {
  const gpu = ctx.store.runtimeState.gpuCapabilities || {};
  const aud = ctx.audioEngine.getStatus();
  const decCount = ctx.store.runtimeState.decoders.size;
  const offlineCount = Array.from(ctx.store.runtimeState.decoders.values()).filter(d => d.missing).length;

  const diagBody = document.getElementById('diagnostics-panel-body');
  if (diagBody) {
    diagBody.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:6px; font-size:11.5px;">
        <div class="field-row"><div class="field-header"><span>Active GPU Backend</span><span class="field-val">${gpu.activeBackend || 'Probing...'}</span></div></div>
        <div class="field-row"><div class="field-header"><span>Web Audio DSP</span><span class="field-val">${aud.state} (${aud.sampleRate} Hz)</span></div></div>
        <div class="field-row"><div class="field-header"><span>Decoders</span><span class="field-val">${decCount} total (${offlineCount} offline)</span></div></div>
        <div class="field-row"><div class="field-header"><span>Active Workspace</span><span class="field-val">${ctx.store.workspaceState.activeWorkspace}</span></div></div>
      </div>
    `;
  }

  const perfBody = document.getElementById('performance-monitor-body');
  if (perfBody) {
    perfBody.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:6px; font-size:11.5px;">
        <div class="field-row"><div class="field-header"><span>Measured FPS</span><span class="field-val" id="perf-panel-fps">${ctx.store.runtimeState.measuredFps} FPS</span></div></div>
        <div class="field-row"><div class="field-header"><span>Dropped Frames</span><span class="field-val" id="perf-panel-drops">${ctx.store.runtimeState.droppedFrames}</span></div></div>
        <div class="field-row"><div class="field-header"><span>Sequence Clips</span><span class="field-val">${ctx.getActiveSequence().clips.length}</span></div></div>
        <div class="field-row"><div class="field-header"><span>Runtime Decoders</span><span class="field-val">${decCount}</span></div></div>
      </div>
    `;
  }

  const gpuBody = document.getElementById('gpu-status-body');
  if (gpuBody) {
    gpuBody.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:6px; font-size:11.5px;">
        <div class="field-row"><div class="field-header"><span>Selected Pipeline</span><span class="field-val" style="color:var(--accent-cyan);">${gpu.activeBackend || 'Unknown'}</span></div></div>
        <div class="field-row"><div class="field-header"><span>WebGPU</span><span class="field-val">${gpu.webgpuAvailable ? 'Supported' : 'Not Available'}</span></div></div>
        <div class="field-row"><div class="field-header"><span>WebGL 2</span><span class="field-val">${gpu.webgl2Available ? 'Supported' : 'Not Available'}</span></div></div>
      </div>
    `;
  }

  const cacheBody = document.getElementById('cache-manager-body');
  if (cacheBody) {
    const assets = Object.values(ctx.store.projectState.assets);
    const totalMB = assets.reduce((s, a) => s + (a.size || 0), 0) / (1024 * 1024);
    cacheBody.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:6px; font-size:11.5px;">
        <div class="field-row"><div class="field-header"><span>Regenerable Cache Store</span><span class="field-val">IndexedDB (cache)</span></div></div>
        <div class="field-row"><div class="field-header"><span>Protected Media Assets</span><span class="field-val">${assets.length} (${totalMB.toFixed(2)} MB)</span></div></div>
        <div class="field-row"><div class="field-header"><span>Session Writes / Skipped</span><span class="field-val">${ctx.store.diagnostics.stats.totalWrites} / ${ctx.store.diagnostics.stats.skippedUnchanged}</span></div></div>
        <button class="action-btn-compact primary" id="btn-open-storage-diag-from-cache" style="margin-top:4px; justify-content:center;">Open Storage Diagnostics</button>
      </div>
    `;
    document.getElementById('btn-open-storage-diag-from-cache')?.addEventListener('click', () => {
      ctx.openStorageDiagnosticsPanel?.();
    });
  }

  renderStorageDiagnosticsPanel(ctx);
}

export async function renderStorageDiagnosticsPanel(ctx) {
  const body = document.getElementById('storage-diagnostics-body');
  if (!body) return;

  const snap = await ctx.store.inspectStorage();
  const diff = ctx.store.diagnostics.diffFromBaseline(snap);
  const est = snap.browserEstimate;
  const st = snap.writeStats;

  const storeRows = Object.entries(snap.stores || {}).map(([name, info]) => {
    const meta = STORAGE_DOMAIN_CATEGORIES[name] || { category: 'Other', policy: 'Standard' };
    const ps = st.perStore?.[name] || { writes: 0, skipped: 0 };
    return `
      <tr style="border-bottom:1px solid var(--border-divider);">
        <td style="padding:4px 6px; font-family:monospace; color:#fff;">${name}</td>
        <td style="padding:4px 6px; color:var(--text-secondary);">${meta.category}</td>
        <td style="padding:4px 6px; text-align:right; font-family:monospace;">${info.count}</td>
        <td style="padding:4px 6px; text-align:right; font-family:monospace;">${formatBytes(info.approxBytes)}</td>
        <td style="padding:4px 6px; text-align:right; font-family:monospace; color:${ps.writes > 0 ? 'var(--accent-cyan)' : 'var(--text-muted)'};">${ps.writes} / ${ps.skipped}</td>
      </tr>
    `;
  }).join('');

  body.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:10px; font-size:11px;">
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
        <div style="background:#10151E; border:1px solid var(--border); border-radius:4px; padding:7px;">
          <div style="font-size:9.5px; color:var(--text-muted); font-weight:700;">INDEXEDDB USAGE</div>
          <div style="font-size:14px; font-weight:700; color:#fff; font-family:monospace;">${formatBytes(snap.totalApproxBytes)}</div>
          <div style="font-size:9.5px; color:var(--text-secondary);">${est ? `Browser Quota: ${formatBytes(est.usage)} / ${formatBytes(est.quota)}` : `${snap.totalRecords} total records`}</div>
        </div>
        <div style="background:#10151E; border:1px solid var(--border); border-radius:4px; padding:7px;">
          <div style="font-size:9.5px; color:var(--text-muted); font-weight:700;">GROWTH SINCE LOAD</div>
          <div style="font-size:14px; font-weight:700; color:${diff && diff.totalBytesDelta > 0 ? 'var(--warning)' : 'var(--success)'}; font-family:monospace;">${diff ? `${diff.totalBytesDelta >= 0 ? '+' : ''}${formatBytes(Math.abs(diff.totalBytesDelta))}` : '0 B'}</div>
          <div style="font-size:9.5px; color:var(--text-secondary);">Writes: ${st.totalWrites} · Skipped: ${st.skippedUnchanged}</div>
        </div>
      </div>

      <div style="background:#10151E; border:1px solid var(--border); border-radius:4px; padding:7px; display:flex; flex-direction:column; gap:4px;">
        <div style="font-size:9.5px; color:var(--accent); font-weight:700;">STORAGE SUMMARY</div>
        <div class="field-row"><div class="field-header"><span>Projects / Media Assets</span><span class="field-val">${snap.projectCount} / ${snap.mediaAssetCount}</span></div></div>
        <div class="field-row"><div class="field-header"><span>Regenerable Cache (Total)</span><span class="field-val">${formatBytes(snap.cacheBreakdown.totalBytes)}</span></div></div>
        <div class="field-row"><div class="field-header"><span>Thumbnail Cache / Waveform Cache</span><span class="field-val">${formatBytes(snap.cacheBreakdown.thumbnailBytes)} / ${formatBytes(snap.cacheBreakdown.waveformBytes)}</span></div></div>
        <div class="field-row"><div class="field-header"><span>Recovery Snapshots</span><span class="field-val">${snap.recoverySnapshotCount} (max 5)</span></div></div>
        <div class="field-row"><div class="field-header"><span>Protected User Media Blobs</span><span class="field-val">${snap.mediaBlobCount} (${formatBytes(snap.mediaBlobBytes)})</span></div></div>
        ${snap.integrity.orphanedBlobIds.length > 0 ? `<div style="color:var(--warning); font-size:10.5px;">⚠ ${snap.integrity.orphanedBlobIds.length} orphaned media blob(s) not linked to active project</div>` : ''}
      </div>

      <div style="border:1px solid var(--border); border-radius:4px; overflow:hidden;">
        <table style="width:100%; border-collapse:collapse; font-size:10.5px;">
          <thead>
            <tr style="background:var(--panel-header); color:var(--text-secondary); border-bottom:1px solid var(--border);">
              <th style="padding:4px 6px; text-align:left;">Store</th>
              <th style="padding:4px 6px; text-align:left;">Domain</th>
              <th style="padding:4px 6px; text-align:right;">Rows</th>
              <th style="padding:4px 6px; text-align:right;">Size</th>
              <th style="padding:4px 6px; text-align:right;">W / Skip</th>
            </tr>
          </thead>
          <tbody>${storeRows || `<tr><td colspan="5" style="padding:8px; text-align:center; color:var(--text-muted);">Database not open</td></tr>`}</tbody>
        </table>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:5px;">
        <button class="action-btn-compact" id="btn-sd-clear-cache" style="justify-content:center; border-color:var(--border);">Clear Regenerable Cache</button>
        <button class="action-btn-compact" id="btn-sd-prune-recovery" style="justify-content:center; border-color:var(--border);">Remove Old Snapshots</button>
        <button class="action-btn-compact primary" id="btn-sd-verify" style="grid-column:span 2; justify-content:center;">Verify Project Integrity</button>
      </div>

      <div id="sd-integrity-output" style="display:none; padding:7px; border-radius:4px; border:1px solid var(--border); background:#0D121A;"></div>

      ${snap.recentWrites.length > 0 ? `
        <div style="background:#0D121A; border:1px solid var(--border); border-radius:4px; padding:6px;">
          <div style="font-size:9.5px; color:var(--text-muted); font-weight:700; margin-bottom:4px;">RECENT STORAGE ACTIVITY (METADATA ONLY)</div>
          <div style="max-height:110px; overflow-y:auto; font-family:monospace; font-size:10px; color:var(--text-secondary); display:flex; flex-direction:column; gap:2px;">
            ${snap.recentWrites.slice(0, 10).map(w => `<div>[${w.action}] ${w.storeName}/${w.key} (${formatBytes(w.approxBytes)}) · ${w.reason}</div>`).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;

  document.getElementById('btn-storage-inspect')?.addEventListener('click', () => renderStorageDiagnosticsPanel(ctx), { once: true });

  document.getElementById('btn-sd-clear-cache')?.addEventListener('click', async () => {
    if (!confirm('Clear regenerable thumbnail and waveform cache? Your projects and original user media will NOT be affected.')) return;
    const removed = await ctx.store.clearRegenerableCache();
    alert(`Cleared ${removed} regenerable cache entry(ies). User projects and media were untouched.`);
    renderStorageDiagnosticsPanel(ctx);
  });

  document.getElementById('btn-sd-prune-recovery')?.addEventListener('click', async () => {
    if (!confirm('Remove older recovery snapshots and keep only the most recent snapshot?')) return;
    const removed = await ctx.store.removeOldRecoverySnapshots(1);
    alert(`Removed ${removed} old recovery snapshot(s).`);
    renderStorageDiagnosticsPanel(ctx);
  });

  document.getElementById('btn-sd-verify')?.addEventListener('click', async () => {
    const res = await ctx.store.verifyIntegrity();
    const out = document.getElementById('sd-integrity-output');
    if (!out) return;
    out.style.display = 'block';
    out.style.borderColor = res.healthy ? 'var(--success)' : 'var(--error)';
    out.innerHTML = `
      <div style="font-weight:700; color:${res.healthy ? 'var(--success)' : 'var(--error)'}; margin-bottom:3px;">
        ${res.healthy ? '✓ Project Integrity Verified' : `✕ ${res.issues.length} Integrity Issue(s) Found`}
      </div>
      <div style="color:var(--text-secondary);">Sequences: ${res.sequenceCount} · Tracks: ${res.trackCount} · Clips: ${res.clipCount} · Assets: ${res.assetCount}</div>
      ${res.issues.map(i => `<div style="color:var(--error); margin-top:2px;">• ${i}</div>`).join('')}
      ${res.warnings.map(w => `<div style="color:var(--warning); margin-top:2px;">• ${w}</div>`).join('')}
    `;
  });
}


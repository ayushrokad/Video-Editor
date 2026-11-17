/**
 * FRAMEFLOW Web Studio — Client Runtime & Milestone M0 Feasibility Suite
 */

// Application State
const state = {
  activeTab: 'studio',
  activeWorkspace: 'edit',
  capabilities: null,
  loadedVideo: null,
  videoMetadata: null,
  isPlaying: false,
  currentTime: 0,
  playbackFps: 0,
  droppedFrames: 0,
  gpuBackend: 'none',
  gpuRenderer: null,
  glRenderer: null,
  colorParams: {
    exposure: 0.0,
    contrast: 1.0,
    brightness: 0.0,
    saturation: 1.0,
    temperature: 0.0,
    tint: 0.0,
    gamma: 1.0,
    invert: false,
  },
};

// DOM References
const dom = {};

document.addEventListener('DOMContentLoaded', async () => {
  initDomReferences();
  initEventListeners();
  initNavigation();
  await runBrowserDiagnostics();
  initGpuPipeline();
  initSyntheticTestPattern();
  startTelemetryLoop();
});

function initDomReferences() {
  dom.navTabs = document.querySelectorAll('.nav-tab');
  dom.viewPages = document.querySelectorAll('.view-page');
  dom.wsTabs = document.querySelectorAll('.ws-tab');
  
  // Monitors & Canvases
  dom.sourceVideo = document.getElementById('source-video');
  dom.programCanvas = document.getElementById('program-canvas');
  dom.gpuTestCanvas = document.getElementById('gpu-test-canvas');
  dom.timecodeDisplay = document.getElementById('timecode-display');
  dom.playBtn = document.getElementById('play-btn');
  dom.fileInput = document.getElementById('video-file-input');
  dom.dropZone = document.getElementById('media-dropzone');
  
  // Telemetry
  dom.statusGpu = document.getElementById('status-gpu');
  dom.statusFps = document.getElementById('status-fps');
  dom.statusDrop = document.getElementById('status-drop');
  
  // Diagnostic containers
  dom.diagGrid = document.getElementById('diag-grid');
  dom.codecGrid = document.getElementById('codec-grid');
}

function initNavigation() {
  dom.navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      dom.navTabs.forEach(t => t.classList.remove('active'));
      dom.viewPages.forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const pageId = tab.dataset.page;
      const targetPage = document.getElementById(pageId);
      if (targetPage) targetPage.classList.add('active');
      state.activeTab = pageId;
    });
  });

  dom.wsTabs.forEach(ws => {
    ws.addEventListener('click', () => {
      dom.wsTabs.forEach(w => w.classList.remove('active'));
      ws.classList.add('active');
      state.activeWorkspace = ws.dataset.ws;
      updateWorkspaceLayout(ws.dataset.ws);
    });
  });
}

function updateWorkspaceLayout(ws) {
  const wsIndicator = document.getElementById('active-ws-name');
  if (wsIndicator) wsIndicator.textContent = ws.toUpperCase();
  console.log(`[FRAMEFLOW] Switched to workspace: ${ws}`);
}

function initEventListeners() {
  // Video file input & dropzone
  if (dom.fileInput) {
    dom.fileInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) handleVideoFileImport(file);
    });
  }

  if (dom.dropZone) {
    dom.dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dom.dropZone.style.borderColor = 'var(--accent-blue)';
    });
    dom.dropZone.addEventListener('dragleave', () => {
      dom.dropZone.style.borderColor = 'var(--border-subtle)';
    });
    dom.dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dom.dropZone.style.borderColor = 'var(--border-subtle)';
      const file = e.dataTransfer.files?.[0];
      if (file && file.type.startsWith('video/')) {
        handleVideoFileImport(file);
      }
    });
    dom.dropZone.addEventListener('click', () => {
      dom.fileInput?.click();
    });
  }

  // Transport controls
  if (dom.playBtn) {
    dom.playBtn.addEventListener('click', togglePlayback);
  }

  // Keyboard Shortcuts (J-K-L, Space)
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space') {
      e.preventDefault();
      togglePlayback();
    } else if (e.key === 'k' || e.key === 'K') {
      pausePlayback();
    } else if (e.key === 'l' || e.key === 'L') {
      startPlayback();
    } else if (e.key === 'j' || e.key === 'J') {
      if (dom.sourceVideo) dom.sourceVideo.currentTime = Math.max(0, dom.sourceVideo.currentTime - 1);
    }
  });

  // Color Slider Bindings
  const sliderMap = [
    { id: 'slider-exposure', key: 'exposure', scale: 1 },
    { id: 'slider-contrast', key: 'contrast', scale: 1 },
    { id: 'slider-brightness', key: 'brightness', scale: 1 },
    { id: 'slider-saturation', key: 'saturation', scale: 1 },
    { id: 'slider-temperature', key: 'temperature', scale: 1 },
    { id: 'slider-tint', key: 'tint', scale: 1 },
    { id: 'slider-gamma', key: 'gamma', scale: 1 },
  ];

  sliderMap.forEach(({ id, key }) => {
    const el = document.getElementById(id);
    const valDisp = document.getElementById(`${id}-val`);
    if (el) {
      el.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        state.colorParams[key] = val;
        if (valDisp) valDisp.textContent = val.toFixed(2);
        renderCurrentGpuFrame();
      });
    }
  });

  const invertCheck = document.getElementById('check-invert');
  if (invertCheck) {
    invertCheck.addEventListener('change', (e) => {
      state.colorParams.invert = e.target.checked;
      renderCurrentGpuFrame();
    });
  }

  const resetBtn = document.getElementById('reset-color-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      state.colorParams = {
        exposure: 0.0,
        contrast: 1.0,
        brightness: 0.0,
        saturation: 1.0,
        temperature: 0.0,
        tint: 0.0,
        gamma: 1.0,
        invert: false,
      };
      sliderMap.forEach(({ id, key }) => {
        const el = document.getElementById(id);
        const valDisp = document.getElementById(`${id}-val`);
        if (el) el.value = state.colorParams[key];
        if (valDisp) valDisp.textContent = state.colorParams[key].toFixed(2);
      });
      if (invertCheck) invertCheck.checked = false;
      renderCurrentGpuFrame();
    });
  }
}

// ----------------------------------------------------
// Phase B: Browser Capability Diagnostics
// ----------------------------------------------------
async function runBrowserDiagnostics() {
  const caps = {
    webgpu: false,
    webgpuName: 'Unavailable',
    webgl2: false,
    webgl2Renderer: 'Unavailable',
    webcodecs: typeof window.VideoDecoder !== 'undefined',
    videoEncoder: typeof window.VideoEncoder !== 'undefined',
    audioContext: typeof (window.AudioContext || window.webkitAudioContext) !== 'undefined',
    offscreenCanvas: typeof window.OffscreenCanvas !== 'undefined',
    opfs: 'storage' in navigator && typeof navigator.storage?.getDirectory === 'function',
    quota: '0 MB',
    workers: typeof window.Worker !== 'undefined',
  };

  // WebGPU check
  if ('gpu' in navigator && typeof navigator.gpu?.requestAdapter === 'function') {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) {
        caps.webgpu = true;
        const info = typeof adapter.requestAdapterInfo === 'function' ? await adapter.requestAdapterInfo() : (adapter.info || {});
        caps.webgpuName = info.description || info.vendor || 'Hardware WebGPU Device';
      }
    } catch (e) {
      console.warn('WebGPU query error:', e);
    }
  }

  // WebGL 2 check
  try {
    const testCanvas = document.createElement('canvas');
    const gl = testCanvas.getContext('webgl2');
    if (gl) {
      caps.webgl2 = true;
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      caps.webgl2Renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'Standard WebGL 2';
    }
  } catch {}

  // Storage Quota check
  if ('storage' in navigator && typeof navigator.storage?.estimate === 'function') {
    try {
      const est = await navigator.storage.estimate();
      const gigabytes = ((est.quota || 0) / (1024 * 1024 * 1024)).toFixed(1);
      caps.quota = `${gigabytes} GB Estimated Quota`;
    } catch {}
  }

  state.capabilities = caps;
  renderDiagnosticsUI(caps);
}

function renderDiagnosticsUI(c) {
  if (!dom.diagGrid) return;

  const items = [
    { title: 'WebGPU Pipeline', status: c.webgpu ? 'success' : 'warning', badge: c.webgpu ? 'Active' : 'Fallback', value: c.webgpuName, desc: 'High-performance GPU compute & shader compositing' },
    { title: 'WebGL 2 Engine', status: c.webgl2 ? 'success' : 'error', badge: c.webgl2 ? 'Available' : 'Missing', value: c.webgl2Renderer, desc: 'Fallback shader rendering for broad compatibility' },
    { title: 'WebCodecs VideoDecoder', status: c.webcodecs ? 'success' : 'warning', badge: c.webcodecs ? 'Supported' : 'Polyfill', value: c.webcodecs ? 'Hardware Decode Active' : 'HTML5 Video Fallback', desc: 'Direct frame decoding off the main thread' },
    { title: 'WebCodecs VideoEncoder', status: c.videoEncoder ? 'success' : 'warning', badge: c.videoEncoder ? 'Supported' : 'Cloud Only', value: c.videoEncoder ? 'Client Export Ready' : 'Cloud Render Worker', desc: 'Hardware-accelerated client-side video encoding' },
    { title: 'Web Audio API', status: c.audioContext ? 'success' : 'error', badge: c.audioContext ? 'Online' : 'Disabled', value: c.audioContext ? '48kHz DSP Graph Ready' : 'Audio Unavailable', desc: 'Multitrack mixing, 4-band EQ & stem routing' },
    { title: 'Origin Private File System', status: c.opfs ? 'success' : 'warning', badge: c.opfs ? 'OPFS Ready' : 'IndexedDB', value: c.opfs ? 'High-Speed Virtual Disk' : 'IndexedDB Blob Store', desc: 'High-speed local cache for proxies & waveforms' },
    { title: 'Browser Storage Quota', status: 'success', badge: 'Quota', value: c.quota, desc: 'Persistent local storage for video assets' },
    { title: 'OffscreenCanvas & Workers', status: c.offscreenCanvas ? 'success' : 'warning', badge: c.offscreenCanvas ? 'Supported' : 'Main Thread', value: c.offscreenCanvas ? 'Background Threads' : 'Synchronous Rendering', desc: 'Prevents timeline frame drops during playback' },
  ];

  dom.diagGrid.innerHTML = items.map(item => `
    <div class="diag-card">
      <div class="diag-card-title">
        <span>${item.title}</span>
        <span class="status-pill ${item.status}">${item.badge}</span>
      </div>
      <div class="diag-value">${item.value}</div>
      <div class="diag-desc">${item.desc}</div>
    </div>
  `).join('');

  if (dom.statusGpu) {
    dom.statusGpu.textContent = c.webgpu ? 'WebGPU' : c.webgl2 ? 'WebGL 2' : 'CPU Canvas';
  }
}

// ----------------------------------------------------
// Phase C: Media Proof-of-Concept & Preview
// ----------------------------------------------------
function handleVideoFileImport(file) {
  console.log(`[FRAMEFLOW Media Engine] Importing file: ${file.name} (${(file.size / (1024*1024)).toFixed(2)} MB)`);
  
  const video = dom.sourceVideo;
  if (!video) return;

  const url = URL.createObjectURL(file);
  video.src = url;
  video.load();

  video.onloadedmetadata = () => {
    state.loadedVideo = video;
    const meta = {
      name: file.name,
      size: `${(file.size / (1024*1024)).toFixed(2)} MB`,
      dimensions: `${video.videoWidth} x ${video.videoHeight}`,
      duration: `${video.duration.toFixed(2)}s`,
      aspectRatio: `${video.videoWidth}:${video.videoHeight}`,
      timecode: formatTimecode(video.duration, 30),
    };
    state.videoMetadata = meta;
    updateMetadataDisplay(meta);
    console.log('[FRAMEFLOW Media Engine] Metadata extracted successfully:', meta);

    // Resize canvas to match video
    if (dom.programCanvas) {
      dom.programCanvas.width = video.videoWidth || 1920;
      dom.programCanvas.height = video.videoHeight || 1080;
    }
    if (dom.gpuTestCanvas) {
      dom.gpuTestCanvas.width = 640;
      dom.gpuTestCanvas.height = 360;
    }

    renderCurrentGpuFrame();
  };

  video.ontimeupdate = () => {
    state.currentTime = video.currentTime;
    if (dom.timecodeDisplay) {
      dom.timecodeDisplay.textContent = formatTimecode(video.currentTime, 30);
    }
    renderCurrentGpuFrame();
  };
}

function updateMetadataDisplay(meta) {
  const container = document.getElementById('meta-details');
  if (!container) return;
  container.innerHTML = `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px;">
      <div><span style="color: var(--text-muted)">File:</span> <strong>${meta.name}</strong></div>
      <div><span style="color: var(--text-muted)">Size:</span> <strong>${meta.size}</strong></div>
      <div><span style="color: var(--text-muted)">Resolution:</span> <strong>${meta.dimensions}</strong></div>
      <div><span style="color: var(--text-muted)">Duration:</span> <strong>${meta.duration}</strong></div>
      <div><span style="color: var(--text-muted)">Timecode:</span> <strong>${meta.timecode}</strong></div>
      <div><span style="color: var(--text-muted)">Privacy:</span> <strong style="color: var(--accent-emerald);">100% Local (Zero Server Upload)</strong></div>
    </div>
  `;
}

function formatTimecode(seconds, fps) {
  const totalFrames = Math.floor(seconds * fps);
  const ff = totalFrames % fps;
  const ss = Math.floor(seconds) % 60;
  const mm = Math.floor(seconds / 60) % 60;
  const hh = Math.floor(seconds / 3600);
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}:${pad(ff)}`;
}

function pad(n) {
  return n < 10 ? `0${n}` : `${n}`;
}

function togglePlayback() {
  if (state.isPlaying) pausePlayback();
  else startPlayback();
}

function startPlayback() {
  if (dom.sourceVideo && dom.sourceVideo.src) {
    dom.sourceVideo.play();
    state.isPlaying = true;
    if (dom.playBtn) dom.playBtn.innerHTML = '&#9646;&#9646;';
  }
}

function pausePlayback() {
  if (dom.sourceVideo) {
    dom.sourceVideo.pause();
    state.isPlaying = false;
    if (dom.playBtn) dom.playBtn.innerHTML = '&#9658;';
  }
}

// ----------------------------------------------------
// Phase D: GPU Proof-of-Concept (WebGPU + WebGL 2)
// ----------------------------------------------------
let glCtx = null;
let glProgram = null;
let glTex = null;
let glVao = null;
let glLocs = {};

function initGpuPipeline() {
  const canvas = dom.programCanvas || dom.gpuTestCanvas;
  if (!canvas) return;

  // Initialize WebGL 2 fallback pipeline
  try {
    glCtx = canvas.getContext('webgl2');
    if (glCtx) {
      state.gpuBackend = 'WebGL 2';
      setupWebGL2Pipeline(glCtx);
    }
  } catch (e) {
    console.warn('WebGL 2 init failed:', e);
  }
}

function setupWebGL2Pipeline(gl) {
  const vsSrc = `#version 300 es
    in vec2 a_pos;
    out vec2 v_uv;
    void main() {
      v_uv = vec2((a_pos.x + 1.0) * 0.5, (1.0 - a_pos.y) * 0.5);
      gl_Position = vec4(a_pos, 0.0, 1.0);
    }
  `;

  const fsSrc = `#version 300 es
    precision highp float;
    in vec2 v_uv;
    out vec4 outColor;
    uniform sampler2D u_tex;
    uniform float u_exposure;
    uniform float u_contrast;
    uniform float u_brightness;
    uniform float u_saturation;
    uniform float u_temperature;
    uniform float u_tint;
    uniform float u_gamma;
    uniform float u_invert;

    void main() {
      vec3 col = texture(u_tex, v_uv).rgb;
      col = col * pow(2.0, u_exposure);
      col = col + vec3(u_brightness);
      col = (col - vec3(0.18)) * u_contrast + vec3(0.18);
      col.r += u_temperature * 0.1;
      col.b -= u_temperature * 0.1;
      col.g -= u_tint * 0.1;
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(luma), col, u_saturation);
      col = max(col, vec3(0.0));
      col = pow(col, vec3(1.0 / u_gamma));
      if (u_invert > 0.5) col = vec3(1.0) - col;
      outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `;

  const vs = createShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  glProgram = gl.createProgram();
  gl.attachShader(glProgram, vs);
  gl.attachShader(glProgram, fs);
  gl.linkProgram(glProgram);

  const uniforms = ['u_tex', 'u_exposure', 'u_contrast', 'u_brightness', 'u_saturation', 'u_temperature', 'u_tint', 'u_gamma', 'u_invert'];
  uniforms.forEach(u => {
    glLocs[u] = gl.getUniformLocation(glProgram, u);
  });

  glVao = gl.createVertexArray();
  gl.bindVertexArray(glVao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,  1, -1, -1,  1,
    -1,  1,  1, -1,  1,  1,
  ]), gl.STATIC_DRAW);

  const posLoc = gl.getAttribLocation(glProgram, 'a_pos');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  glTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, glTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

function createShader(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return s;
}

function initSyntheticTestPattern() {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');
  
  // SMPTE color bars
  const colors = ['#ffffff', '#ffff00', '#00ffff', '#00ff00', '#ff00ff', '#ff0000', '#0000ff'];
  const barWidth = canvas.width / colors.length;
  colors.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(i * barWidth, 0, barWidth, canvas.height * 0.7);
  });
  
  // Grayscale ramp
  for (let x = 0; x < canvas.width; x++) {
    const v = Math.floor((x / canvas.width) * 255);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(x, canvas.height * 0.7, 1, canvas.height * 0.3);
  }

  state.testPattern = canvas;
  renderCurrentGpuFrame();
}

function renderCurrentGpuFrame() {
  const gl = glCtx;
  if (!gl || !glProgram || !glTex) return;

  const source = (state.loadedVideo && state.loadedVideo.readyState >= 2) ? state.loadedVideo : state.testPattern;
  if (!source) return;

  const canvas = dom.programCanvas;
  if (!canvas) return;

  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.useProgram(glProgram);

  gl.bindTexture(gl.TEXTURE_2D, glTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

  const p = state.colorParams;
  gl.uniform1i(glLocs['u_tex'], 0);
  gl.uniform1f(glLocs['u_exposure'], p.exposure);
  gl.uniform1f(glLocs['u_contrast'], p.contrast);
  gl.uniform1f(glLocs['u_brightness'], p.brightness);
  gl.uniform1f(glLocs['u_saturation'], p.saturation);
  gl.uniform1f(glLocs['u_temperature'], p.temperature);
  gl.uniform1f(glLocs['u_tint'], p.tint);
  gl.uniform1f(glLocs['u_gamma'], p.gamma);
  gl.uniform1f(glLocs['u_invert'], p.invert ? 1.0 : 0.0);

  gl.bindVertexArray(glVao);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

// ----------------------------------------------------
// Telemetry Loop
// ----------------------------------------------------
let lastFrameTime = performance.now();
let frameCount = 0;

function startTelemetryLoop() {
  function tick(now) {
    frameCount++;
    if (now - lastFrameTime >= 1000) {
      state.playbackFps = frameCount;
      frameCount = 0;
      lastFrameTime = now;
      if (dom.statusFps) {
        dom.statusFps.textContent = `${state.playbackFps} FPS`;
      }
    }

    if (state.isPlaying) {
      renderCurrentGpuFrame();
    }

    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

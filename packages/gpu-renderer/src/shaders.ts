/**
 * @frameflow/gpu-renderer - Shaders
 * WGSL (WebGPU) and GLSL ES 3.0 (WebGL 2) shaders for video texture rendering and real-time color grading.
 */

export const WGSL_COLOR_SHADER = /* wgsl */ `
struct Uniforms {
  exposure: f32,
  contrast: f32,
  brightness: f32,
  saturation: f32,
  temperature: f32,
  tint: f32,
  gamma: f32,
  invert: f32,
};

@group(0) @binding(0) var<uniform> params: Uniforms;
@group(0) @binding(1) var videoSampler: sampler;
@group(0) @binding(2) var videoTexture: texture_2d<f32>;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var pos = array<vec2<f32>, 4>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>( 1.0,  1.0)
  );
  var uvs = array<vec2<f32>, 4>(
    vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 1.0),
    vec2<f32>(0.0, 0.0),
    vec2<f32>(1.0, 0.0)
  );

  var output: VertexOutput;
  output.position = vec4<f32>(pos[vertexIndex], 0.0, 1.0);
  output.uv = uvs[vertexIndex];
  return output;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  var color = textureSample(videoTexture, videoSampler, in.uv).rgb;

  // 1. Exposure
  color = color * pow(2.0, params.exposure);

  // 2. Brightness
  color = color + vec3<f32>(params.brightness);

  // 3. Contrast (around midpoint 0.18)
  color = (color - vec3<f32>(0.18)) * params.contrast + vec3<f32>(0.18);

  // 4. White Balance (Temperature / Tint)
  color.r = color.r + params.temperature * 0.1;
  color.b = color.b - params.temperature * 0.1;
  color.g = color.g - params.tint * 0.1;

  // 5. Saturation
  let luma = dot(color, vec3<f32>(0.2126, 0.7152, 0.0722));
  color = mix(vec3<f32>(luma), color, params.saturation);

  // 6. Gamma correction
  color = max(color, vec3<f32>(0.0));
  color = pow(color, vec3<f32>(1.0 / params.gamma));

  // 7. Optional Invert
  if (params.invert > 0.5) {
    color = vec3<f32>(1.0) - color;
  }

  return vec4<f32>(clamp(color, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
`;

export const GLSL_VS = `#version 300 es
in vec2 a_position;
out vec2 v_uv;

void main() {
  v_uv = vec2((a_position.x + 1.0) * 0.5, (1.0 - a_position.y) * 0.5);
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const GLSL_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_texture;
uniform float u_exposure;
uniform float u_contrast;
uniform float u_brightness;
uniform float u_saturation;
uniform float u_temperature;
uniform float u_tint;
uniform float u_gamma;
uniform float u_invert;

void main() {
  vec3 color = texture(u_texture, v_uv).rgb;

  // 1. Exposure
  color = color * pow(2.0, u_exposure);

  // 2. Brightness
  color = color + vec3(u_brightness);

  // 3. Contrast
  color = (color - vec3(0.18)) * u_contrast + vec3(0.18);

  // 4. Temperature / Tint
  color.r += u_temperature * 0.1;
  color.b -= u_temperature * 0.1;
  color.g -= u_tint * 0.1;

  // 5. Saturation
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(vec3(luma), color, u_saturation);

  // 6. Gamma
  color = max(color, vec3(0.0));
  color = pow(color, vec3(1.0 / u_gamma));

  // 7. Invert
  if (u_invert > 0.5) {
    color = vec3(1.0) - color;
  }

  outColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

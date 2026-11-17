import test from 'node:test';
import assert from 'node:assert';
import { WGSL_COLOR_SHADER, GLSL_VS, GLSL_FS } from '../../packages/gpu-renderer/src/shaders.ts';

test('WGSL shader contains required color grading uniforms and entry points', () => {
  assert.ok(WGSL_COLOR_SHADER.includes('struct Uniforms'), 'WGSL declares Uniforms struct');
  assert.ok(WGSL_COLOR_SHADER.includes('exposure: f32'), 'WGSL declares exposure uniform');
  assert.ok(WGSL_COLOR_SHADER.includes('contrast: f32'), 'WGSL declares contrast uniform');
  assert.ok(WGSL_COLOR_SHADER.includes('fn vs_main'), 'WGSL vertex entry point exists');
  assert.ok(WGSL_COLOR_SHADER.includes('fn fs_main'), 'WGSL fragment entry point exists');
});

test('GLSL ES 3.0 shaders compile syntax check', () => {
  assert.ok(GLSL_VS.includes('#version 300 es'), 'GLSL vertex shader declares version 300 es');
  assert.ok(GLSL_FS.includes('#version 300 es'), 'GLSL fragment shader declares version 300 es');
  assert.ok(GLSL_FS.includes('uniform float u_exposure'), 'GLSL fragment declares u_exposure');
});

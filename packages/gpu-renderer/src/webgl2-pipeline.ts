/**
 * @frameflow/gpu-renderer - WebGL 2 Fallback Pipeline
 * Provides robust GPU color transformation when WebGPU is unavailable.
 */

import type { ColorAdjustmentParams } from '../../shared-types/src/index.ts';
import { GLSL_VS, GLSL_FS } from './shaders';

export class WebGL2Renderer {
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private canvas: HTMLCanvasElement;
  private uniformLocs: Record<string, WebGLUniformLocation | null> = {};

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  initialize(): boolean {
    const gl = this.canvas.getContext('webgl2', { alpha: false, preserveDrawingBuffer: false });
    if (!gl) {
      throw new Error('WebGL 2 is not supported on this browser.');
    }
    this.gl = gl;

    // Compile shaders
    const vs = this.compileShader(gl.VERTEX_SHADER, GLSL_VS);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, GLSL_FS);

    const program = gl.createProgram();
    if (!program) throw new Error('Failed to create WebGL 2 program');
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error('WebGL 2 Program Link Failed: ' + gl.getProgramInfoLog(program));
    }
    this.program = program;

    // Cache uniform locations
    const uniforms = ['u_texture', 'u_exposure', 'u_contrast', 'u_brightness', 'u_saturation', 'u_temperature', 'u_tint', 'u_gamma', 'u_invert'];
    for (const name of uniforms) {
      this.uniformLocs[name] = gl.getUniformLocation(program, name);
    }

    // Full screen quad buffer
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    const posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -1.0, -1.0,
         1.0, -1.0,
        -1.0,  1.0,
        -1.0,  1.0,
         1.0, -1.0,
         1.0,  1.0,
      ]),
      gl.STATIC_DRAW
    );

    const posLoc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    // Texture setup
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    return true;
  }

  render(source: TexImageSource, params: ColorAdjustmentParams): void {
    const gl = this.gl;
    if (!gl || !this.program || !this.texture || !this.vao) return;

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.program);

    // Upload texture from source
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

    // Set uniforms
    gl.uniform1i(this.uniformLocs['u_texture'], 0);
    gl.uniform1f(this.uniformLocs['u_exposure'], params.exposure);
    gl.uniform1f(this.uniformLocs['u_contrast'], params.contrast);
    gl.uniform1f(this.uniformLocs['u_brightness'], params.brightness);
    gl.uniform1f(this.uniformLocs['u_saturation'], params.saturation);
    gl.uniform1f(this.uniformLocs['u_temperature'], params.temperature);
    gl.uniform1f(this.uniformLocs['u_tint'], params.tint);
    gl.uniform1f(this.uniformLocs['u_gamma'], params.gamma);
    gl.uniform1f(this.uniformLocs['u_invert'], params.invert ? 1.0 : 0.0);

    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  private compileShader(type: number, source: string): WebGLShader {
    const gl = this.gl!;
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Failed to create shader');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const err = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Shader compile error: ${err}`);
    }
    return shader;
  }

  destroy(): void {
    if (this.gl && this.texture) {
      this.gl.deleteTexture(this.texture);
    }
  }
}

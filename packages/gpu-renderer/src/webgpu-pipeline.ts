/**
 * @frameflow/gpu-renderer - WebGPU Pipeline
 * Handles WebGPU device initialization, texture copying, and WGSL shader passes.
 */

import type { ColorAdjustmentParams } from '../../shared-types/src/index.ts';
import { WGSL_COLOR_SHADER } from './shaders';

export class WebGPURenderer {
  private device: any = null;
  private context: any = null;
  private pipeline: any = null;
  private uniformBuffer: any = null;
  private sampler: any = null;
  private bindGroupLayout: any = null;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  async initialize(): Promise<boolean> {
    if (!('gpu' in navigator)) {
      throw new Error('WebGPU is not supported on this browser (navigator.gpu is missing).');
    }

    const adapter = await (navigator as any).gpu.requestAdapter();
    if (!adapter) {
      throw new Error('No appropriate GPUAdapter found for WebGPU.');
    }

    this.device = await adapter.requestDevice();
    this.context = this.canvas.getContext('webgpu');
    if (!this.context) {
      throw new Error('Failed to acquire WebGPU canvas context.');
    }

    const presentationFormat = (navigator as any).gpu.getPreferredCanvasFormat();
    this.context.configure({
      device: this.device,
      format: presentationFormat,
      alphaMode: 'opaque',
    });

    const shaderModule = this.device.createShaderModule({
      code: WGSL_COLOR_SHADER,
    });

    this.bindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' },
        },
      ],
    });

    const pipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [this.bindGroupLayout],
    });

    this.pipeline = this.device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        targets: [{ format: presentationFormat }],
      },
      primitive: {
        topology: 'triangle-strip',
      },
    });

    // 8 float values (32 bytes)
    this.uniformBuffer = this.device.createBuffer({
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.sampler = this.device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
    });

    return true;
  }

  render(source: HTMLVideoElement | ImageBitmap | HTMLCanvasElement, params: ColorAdjustmentParams): void {
    if (!this.device || !this.pipeline || !this.context) return;

    // Update uniform buffer
    const uniformData = new Float32Array([
      params.exposure,
      params.contrast,
      params.brightness,
      params.saturation,
      params.temperature,
      params.tint,
      params.gamma,
      params.invert ? 1.0 : 0.0,
    ]);
    this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformData.buffer);

    // Upload video/image source to texture
    const texture = this.device.createTexture({
      size: [this.canvas.width, this.canvas.height, 1],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });

    this.device.queue.copyExternalImageToTexture(
      { source },
      { texture },
      [this.canvas.width, this.canvas.height]
    );

    const bindGroup = this.device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: texture.createView() },
      ],
    });

    const commandEncoder = this.device.createCommandEncoder();
    const textureView = this.context.getCurrentTexture().createView();

    const renderPassDescriptor: any = {
      colorAttachments: [
        {
          view: textureView,
          clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    };

    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    passEncoder.setPipeline(this.pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.draw(4);
    passEncoder.end();

    this.device.queue.submit([commandEncoder.finish()]);
  }

  destroy(): void {
    if (this.uniformBuffer) {
      this.uniformBuffer.destroy();
    }
  }
}

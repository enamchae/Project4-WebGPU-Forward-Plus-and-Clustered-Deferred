import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ClusteredDeferredRenderer extends renderer.Renderer {
    // TODO-3: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution
    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    clusterPipeline: GPUComputePipeline;
    renderPipeline: GPURenderPipeline;

    clusterBuffer: GPUBuffer;

    constructor(stage: Stage) {
        super(stage);

        // TODO-3: initialize layouts, pipelines, textures, etc. needed for Forward+ here
        // you'll need two pipelines: one for the G-buffer pass and one for the fullscreen pass
        const nClusters = shaders.constants.nClustersX * shaders.constants.nClustersY * shaders.constants.nClustersZ;
        
        this.clusterBuffer = renderer.device.createBuffer({
            label: "clusters buffer",
            size: nClusters * Math.ceil((4 + shaders.constants.nMaxLightsPerCluster * 4) / 16) * 16,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });

        this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "deferred scene uniforms bind group layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                    buffer: {
                        type: "uniform",
                    },
                },

                { // lightSet
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                    buffer: { type: "read-only-storage" },
                },

                {
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                    buffer: { type: "storage" },
                },
            ]
        });

        this.sceneUniformsBindGroup = renderer.device.createBindGroup({
            label: "scene uniforms bind group",
            layout: this.sceneUniformsBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: {buffer: this.camera.uniformsBuffer},
                },
                {
                    binding: 1,
                    resource: { buffer: this.lights.lightSetStorageBuffer },
                },
                {
                    binding: 2,
                    resource: { buffer: this.clusterBuffer },
                },
            ]
        });

        this.depthTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });
        this.depthTextureView = this.depthTexture.createView();

        this.clusterPipeline = renderer.device.createComputePipeline({
            layout: renderer.device.createPipelineLayout({
                label: "deferred cluster pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                ],
            }),
            compute: {
                module: renderer.device.createShaderModule({
                    label: "deferred clustering module",
                    code: shaders.clusteringComputeSrc,
                }),
                entryPoint: "clusterLights",
            },
        });

        this.renderPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "deferred pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    renderer.modelBindGroupLayout,
                    renderer.materialBindGroupLayout
                ]
            }),
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: "less",
                format: "depth24plus"
            },
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "forward+ vert shader",
                    code: shaders.naiveVertSrc
                }),
                buffers: [ renderer.vertexBufferLayout ]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "forward+ frag shader",
                    code: shaders.forwardPlusFragSrc,
                }),
                targets: [
                    {
                        format: renderer.canvasFormat,
                    }
                ]
            }
        });
    }

    override draw() {
        // TODO-3: run the Forward+ rendering pass:
        // - run the clustering compute shader
        // - run the G-buffer pass, outputting position, albedo, and normals
        // - run the fullscreen pass, which reads from the G-buffer and performs lighting calculations
        const encoder = renderer.device.createCommandEncoder();
        const canvasTextureView = renderer.context.getCurrentTexture().createView();


        const computePass = encoder.beginComputePass({
            label: "deferred clustering pass",
        });
        computePass.setPipeline(this.clusterPipeline);
        computePass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);
        
        const totalClusters = shaders.constants.nClustersX * shaders.constants.nClustersY * shaders.constants.nClustersZ;
        const workgroupCount = Math.ceil(totalClusters / shaders.constants.clusterWorkgroupSize);
        computePass.dispatchWorkgroups(workgroupCount);

        computePass.end();


        const renderPass = encoder.beginRenderPass({
            label: "deferred render pass",
            colorAttachments: [
                {
                    view: canvasTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                }
            ],
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store"
            }
        });
        renderPass.setPipeline(this.renderPipeline);

        renderPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);

        this.scene.iterate(node => {
            renderPass.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
        }, material => {
            renderPass.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
        }, primitive => {
            renderPass.setVertexBuffer(0, primitive.vertexBuffer);
            renderPass.setIndexBuffer(primitive.indexBuffer, 'uint32');
            renderPass.drawIndexed(primitive.numIndices);
        });

        renderPass.end();

        renderer.device.queue.submit([encoder.finish()]);
    }
}

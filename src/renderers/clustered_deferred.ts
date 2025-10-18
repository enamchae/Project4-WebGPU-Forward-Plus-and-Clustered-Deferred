import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ClusteredDeferredRenderer extends renderer.Renderer {
    // TODO-3: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution
    gBufferBindGroupLayout: GPUBindGroupLayout;
    gBufferBindGroup: GPUBindGroup;
    
    fullscreenBindGroupLayout: GPUBindGroupLayout;
    fullscreenBindGroup: GPUBindGroup;

    clusterPipeline: GPUComputePipeline;
    renderPipeline: GPURenderPipeline;
    gBufferPipeline: GPURenderPipeline;

    clusterBuffer: GPUBuffer;
    vertBuffer: GPUBuffer;


    diffuseTexture: GPUTexture;
    depthTexture: GPUTexture;
    normalTexture: GPUTexture;
    posTexture: GPUTexture;

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


        this.diffuseTexture = renderer.device.createTexture({
            label: "gbuffer diffuse",
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba8unorm",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });

        this.normalTexture = renderer.device.createTexture({
            label: "gbuffer normal",
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba16float",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });

        this.posTexture = renderer.device.createTexture({
            label: "gbuffer position",
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba32float",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });


        this.depthTexture = renderer.device.createTexture({
            label: "deferred depth texture",
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });


        this.gBufferBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "gbuffer bind group layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" },
                },
            ]
        });

        this.gBufferBindGroup = renderer.device.createBindGroup({
            label: "gbuffer bind group",
            layout: this.gBufferBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.camera.uniformsBuffer },
                },
            ]
        });


        this.fullscreenBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "fullscreen bind group layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" },
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

                {
                    binding: 3,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "float" },
                },

                {
                    binding: 4,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "unfilterable-float" },
                },

                {
                    binding: 5,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "unfilterable-float" },
                },

                {
                    binding: 6,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "depth" },
                },

                {
                    binding: 7,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: { type: "non-filtering" },
                },
            ]
        });

        this.fullscreenBindGroup = renderer.device.createBindGroup({
            label: "fullscreen bind group",
            layout: this.fullscreenBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.camera.uniformsBuffer },
                },
                {
                    binding: 1,
                    resource: { buffer: this.lights.lightSetStorageBuffer },
                },
                {
                    binding: 2,
                    resource: { buffer: this.clusterBuffer },
                },
                {
                    binding: 3,
                    resource: this.diffuseTexture.createView(),
                },
                {
                    binding: 4,
                    resource: this.normalTexture.createView(),
                },
                {
                    binding: 5,
                    resource: this.posTexture.createView(),
                },
                {
                    binding: 6,
                    resource: this.depthTexture.createView(),
                },
                {
                    binding: 7,
                    resource: renderer.device.createSampler({
                        magFilter: "nearest",
                        minFilter: "nearest",
                    }),
                },
            ]
        });

        this.clusterPipeline = renderer.device.createComputePipeline({
            layout: renderer.device.createPipelineLayout({
                label: "deferred cluster pipeline layout",
                bindGroupLayouts: [
                    this.fullscreenBindGroupLayout,
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

        this.gBufferPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "deferred gbuffer pipeline layout",
                bindGroupLayouts: [
                    this.gBufferBindGroupLayout,
                    renderer.modelBindGroupLayout,
                    renderer.materialBindGroupLayout
                ]
            }),
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: "less",
                format: "depth24plus",
            },
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "deferred vert shader",
                    code: shaders.naiveVertSrc
                }),
                buffers: [ renderer.vertexBufferLayout ]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "deferred frag shader",
                    code: shaders.clusteredDeferredFragSrc,
                }),
                targets: [
                    {
                        format: "rgba8unorm",
                    },
                    {
                        format: "rgba16float",
                    },
                    {
                        format: "rgba32float",
                    },
                ]
            }
        });

        this.renderPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "deferred fullscreen pipeline layout",
                bindGroupLayouts: [
                    this.fullscreenBindGroupLayout,
                ],
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "deferred fullscreen vert shader",
                    code: shaders.clusteredDeferredFullscreenVertSrc
                }),
                buffers: [{
                    arrayStride: 8,
                    attributes: [
                        { // pos
                            format: "float32x2",
                            offset: 0,
                            shaderLocation: 0
                        },
                    ],
                }],
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "deferred fullscreen frag shader",
                    code: shaders.clusteredDeferredFullscreenFragSrc,
                }),
                targets: [
                    {
                        format: renderer.canvasFormat,
                    }
                ]
            }
        });

        this.vertBuffer = renderer.device.createBuffer({
            label: "fullscreen quad vbuffer",
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            size: 48,
        });

        renderer.device.queue.writeBuffer(this.vertBuffer, 0, new Float32Array([
            -1, -1,
            -1, 1,
            1, -1,
            
            -1, 1,
            1, -1,
            1, 1,
        ]));
    }

    override draw() {
        // TODO-3: run the Clustered Deferred rendering pass:
        // - run the G-buffer pass, outputting position, albedo, and normals
        // - run the clustering compute shader
        // - run the fullscreen pass, which reads from the G-buffer and performs lighting calculations
        const encoder = renderer.device.createCommandEncoder();
        const canvasTextureView = renderer.context.getCurrentTexture().createView();
        
        const gBufferPass = encoder.beginRenderPass({
            label: "deferred gbuffer pass",
            colorAttachments: [
                {
                    view: this.diffuseTexture.createView(),
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store",
                },
                {
                    view: this.normalTexture.createView(),
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store",
                },
                {
                    view: this.posTexture.createView(),
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store",
                },
            ],
            depthStencilAttachment: {
                view: this.depthTexture.createView(),
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store",
            },
        });
        gBufferPass.setPipeline(this.gBufferPipeline);
        gBufferPass.setBindGroup(shaders.constants.bindGroup_scene, this.gBufferBindGroup);

        this.scene.iterate(node => {
            gBufferPass.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
        }, material => {
            gBufferPass.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
        }, primitive => {
            gBufferPass.setVertexBuffer(0, primitive.vertexBuffer);
            gBufferPass.setIndexBuffer(primitive.indexBuffer, 'uint32');
            gBufferPass.drawIndexed(primitive.numIndices);
        });

        gBufferPass.end();


        const computePass = encoder.beginComputePass({
            label: "deferred clustering pass",
        });
        computePass.setPipeline(this.clusterPipeline);
        computePass.setBindGroup(shaders.constants.bindGroup_scene, this.fullscreenBindGroup);
        
        const totalClusters = shaders.constants.nClustersX * shaders.constants.nClustersY * shaders.constants.nClustersZ;
        const workgroupCount = Math.ceil(totalClusters / shaders.constants.clusterWorkgroupSize);
        computePass.dispatchWorkgroups(workgroupCount);

        computePass.end();


        const renderPass = encoder.beginRenderPass({
            label: "deferred fullscreen render pass",
            colorAttachments: [
                {
                    view: canvasTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                }
            ]
        });
        renderPass.setPipeline(this.renderPipeline);
        renderPass.setBindGroup(shaders.constants.bindGroup_scene, this.fullscreenBindGroup);
        renderPass.setVertexBuffer(0, this.vertBuffer);
        renderPass.draw(6);

        renderPass.end();

        renderer.device.queue.submit([encoder.finish()]);
    }
}

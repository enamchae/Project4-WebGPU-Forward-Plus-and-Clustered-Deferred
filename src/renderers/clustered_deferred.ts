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
    gBufferPipeline: GPURenderPipeline;

    clusterBuffer: GPUBuffer;
    gBuffer: GPUBuffer;
    vertBuffer: GPUBuffer;

    timeBuffer: GPUBuffer;

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


        this.gBuffer = renderer.device.createBuffer({
            label: "gbuffer",
            size: renderer.canvas.width * renderer.canvas.height * 48,
            usage: GPUBufferUsage.STORAGE,
        });


        this.timeBuffer = renderer.device.createBuffer({
            label: "time buffer",
            size: 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
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

                {
                    binding: 3,
                    visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                    buffer: { type: "storage" },
                },

                {
                    binding: 4,
                    visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" },
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
                {
                    binding: 3,
                    resource: { buffer: this.gBuffer },
                },
                {
                    binding: 4,
                    resource: { buffer: this.timeBuffer },
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

        this.gBufferPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "deferred gbuffer pipeline layout",
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
                        format: renderer.canvasFormat,
                    }
                ]
            }
        });

        this.renderPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "deferred fullscreen pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                ]
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

        renderer.device.queue.writeBuffer(this.timeBuffer, 0, new Uint32Array([Date.now()]));

        const encoder = renderer.device.createCommandEncoder();
        const canvasTextureView = renderer.context.getCurrentTexture().createView();

        const gBufferPass = encoder.beginRenderPass({
            label: "deferred gbuffer pass",
            colorAttachments: [
                {
                    view: canvasTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "discard",
                }
            ],
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store"
            }
        });
        gBufferPass.setPipeline(this.gBufferPipeline);
        gBufferPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);

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

        // Clustering pass: assign lights to clusters
        const computePass = encoder.beginComputePass({
            label: "deferred clustering pass",
        });
        computePass.setPipeline(this.clusterPipeline);
        computePass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);
        
        const totalClusters = shaders.constants.nClustersX * shaders.constants.nClustersY * shaders.constants.nClustersZ;
        const workgroupCount = Math.ceil(totalClusters / shaders.constants.clusterWorkgroupSize);
        computePass.dispatchWorkgroups(workgroupCount);

        computePass.end();

        // Fullscreen pass: read G-buffer and compute lighting
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
        renderPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);
        renderPass.setVertexBuffer(0, this.vertBuffer);
        renderPass.draw(6);

        renderPass.end();

        renderer.device.queue.submit([encoder.finish()]);
    }
}

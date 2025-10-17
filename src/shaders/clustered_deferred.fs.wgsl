// TODO-3: implement the Clustered Deferred G-buffer fragment shader

// This shader should only store G-buffer information and should not do any shading.
@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(3) var<storage, read_write> gBuffer: array<GPixel>;
@group(${bindGroup_scene}) @binding(4) var<uniform> time: u32;

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput
{
    @builtin(position) fragPos: vec4f,
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

@fragment
fn populateGBuffer(in: FragmentInput) -> @location(0) vec4f {
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if diffuseColor.a < 0.5f { discard; }

    let viewPos = (cameraUniforms.viewMat * vec4f(in.pos, 1)).xyz;
    let depth = -viewPos.z;
    
    let index = u32(cameraUniforms.screenDims.x) * u32(in.fragPos.y) + u32(in.fragPos.x);
    let gPixel = gBuffer[index];
    if gPixel.lastWriteTime == time && gPixel.depth < depth { discard; }


    gBuffer[index] = GPixel(diffuseColor, in.pos, depth, in.nor, time);

    return vec4(0, 0, 0, 0);
}
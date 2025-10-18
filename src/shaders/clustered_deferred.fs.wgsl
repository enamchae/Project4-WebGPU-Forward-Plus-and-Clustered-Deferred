// TODO-3: implement the Clustered Deferred G-buffer fragment shader

// This shader should only store G-buffer information and should not do any shading.
@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput
{
    @builtin(position) fragPos: vec4f,
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

struct FragmentOutput {
    @location(0) diffuse: vec4f,
    @location(1) normal: vec4f,
    @location(2) pos: vec4f,
}

@fragment
fn populateGBuffer(in: FragmentInput) -> FragmentOutput {
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if diffuseColor.a < 0.5f { discard; }


    var out: FragmentOutput;
    out.diffuse = diffuseColor;
    out.normal = vec4f(normalize(in.nor), 1);
    out.pos = vec4f(in.pos, 1);
    return out;
}
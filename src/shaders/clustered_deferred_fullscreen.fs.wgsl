// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.

@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read_write> clusterSet: ClusterSet;
@group(${bindGroup_scene}) @binding(3) var diffuseTexture: texture_2d<f32>;
@group(${bindGroup_scene}) @binding(4) var normalTexture: texture_2d<f32>;
@group(${bindGroup_scene}) @binding(5) var posTexture: texture_2d<f32>;
@group(${bindGroup_scene}) @binding(6) var depthTexture: texture_depth_2d;
@group(${bindGroup_scene}) @binding(7) var depthSampler: sampler;

fn textureLoadCoord(coord: vec2f, dims: vec2f) -> vec2i {
    return vec2i(i32(coord.x), i32(coord.y));
}

struct FragmentInput
{
    @builtin(position) fragPos: vec4f,
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f {
    let uv = in.fragPos.xy / cameraUniforms.screenDims;
    let depth = textureSample(depthTexture, depthSampler, uv);
    if depth >= 1 { // didn't hit anything
        return vec4(0, 0, 0, 1);
    }


    let fragPosSigned = vec2i(i32(in.fragPos.x), i32(in.fragPos.y));
    


    let pos = textureLoad(posTexture, fragPosSigned, 0).xyz;
    let viewPos = (cameraUniforms.viewMat * vec4f(pos, 1)).xyz;
    let viewDepth = -viewPos.z;

    let nCluster = getNCluster(viewDepth, in.fragPos, cameraUniforms.screenDims);
    if nCluster.x >= nClustersByDim.x || nCluster.y >= nClustersByDim.y || nCluster.z >= nClustersByDim.z {
        return vec4(0, 0, 0, 1);
    }

    let clusterIndex = nCluster.x + nClustersByDim.x * (nCluster.y + nClustersByDim.y * nCluster.z);
    let cluster = clusterSet.clusters[clusterIndex];

    let normal = normalize(textureLoad(normalTexture, fragPosSigned, 0).xyz);
    var lightCol = vec3f(0, 0, 0);
    for (var i = 0u; i < cluster.nLights; i++) {
        lightCol += calculateLightContrib(lightSet.lights[cluster.lightIndices[i]], pos, normal);
    }

    let diffuse = textureLoad(diffuseTexture, fragPosSigned, 0).rgb;
    return vec4(diffuse * lightCol, 1);
}
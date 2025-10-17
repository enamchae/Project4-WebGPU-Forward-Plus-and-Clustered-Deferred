// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.

@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read_write> clusterSet: ClusterSet;
@group(${bindGroup_scene}) @binding(3) var<storage, read_write> gBuffer: array<GPixel>;
@group(${bindGroup_scene}) @binding(4) var<uniform> time: u32;

struct FragmentInput
{
    @builtin(position) fragPos: vec4f,
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f {
    let index = u32(cameraUniforms.screenDims.x) * u32(in.fragPos.y) + u32(in.fragPos.x);
    let pixel = gBuffer[index];

    if pixel.lastWriteTime != time {
        return vec4(0, 0, 0, 1);
    }


    let nCluster = getNCluster(pixel.depth, in.fragPos, cameraUniforms.screenDims);
    if nCluster.x >= nClustersByDim.x || nCluster.y >= nClustersByDim.y || nCluster.z >= nClustersByDim.z {
        return vec4(0, 0, 0, 1);
    }

    let clusterIndex = nCluster.x + nClustersByDim.x * (nCluster.y + nClustersByDim.y * nCluster.z);
    let cluster = clusterSet.clusters[clusterIndex];

    let normal = normalize(pixel.normal);
    var lightCol = vec3f(0, 0, 0);
    for (var i = 0u; i < cluster.nLights; i++) {
        lightCol += calculateLightContrib(lightSet.lights[cluster.lightIndices[i]], pixel.pos, normal);
    }

    return vec4(pixel.diffuse.rgb * lightCol, 1);
}
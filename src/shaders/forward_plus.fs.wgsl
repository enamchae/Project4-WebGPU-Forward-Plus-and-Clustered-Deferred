// TODO-2: implement the Forward+ fragment shader

// See naive.fs.wgsl for basic fragment shader setup; this shader should use light clusters instead of looping over all lights

// ------------------------------------
// Shading process:
// ------------------------------------
// Determine which cluster contains the current fragment.
// Retrieve the number of lights that affect the current fragment from the cluster’s data.
// Initialize a variable to accumulate the total light contribution for the fragment.
// For each light in the cluster:
//     Access the light's properties using its index.
//     Calculate the contribution of the light based on its position, the fragment’s position, and the surface normal.
//     Add the calculated contribution to the total light accumulation.
// Multiply the fragment’s diffuse color by the accumulated light contribution.
// Return the final color, ensuring that the alpha component is set appropriately (typically to 1).
@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read_write> clusterSet: ClusterSet;

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput
{
    @builtin(position) fragCoord: vec4f,
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}


@fragment
fn main(in: FragmentInput) -> @location(0) vec4f
{
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }


    let viewPos = (cameraUniforms.viewMat * vec4f(in.pos, 1)).xyz;
    let depth = -viewPos.z;

    // return vec4f(viewPos, 1);

    let nClustersByDim = vec3u(${nClustersX}, ${nClustersY}, ${nClustersZ});

    let minZ = f32(${nearPlaneZ});
    let maxZ = f32(${farPlaneZ});
    let nClusterZ = u32(f32(nClustersByDim.z) * (depth - minZ) / (maxZ - minZ));



    let screenDims = cameraUniforms.screenDims;
    let clusterSize = screenDims / vec2f(nClustersByDim.xy);
    let nCluster = vec3u(
        u32(in.fragCoord.x / clusterSize.x),
        u32(in.fragCoord.y / clusterSize.y),
        nClusterZ,
    );
    
    if nCluster.x >= nClustersByDim.x || nCluster.y >= nClustersByDim.y || nCluster.z >= nClustersByDim.z {
        return vec4(0, 0, 0, 1);
    }

    let clusterIndex = nCluster.x + nClustersByDim.x * (nCluster.y + nClustersByDim.y * nCluster.z);
    let cluster = clusterSet.clusters[clusterIndex];
    

    // return vec4(vec3f(nCluster) / vec3f(nClustersByDim), 1);

    // return vec4(f32(clusterIndex) / f32(nClustersByDim.x * nClustersByDim.y * nClustersByDim.z) * vec3f(1, 1, 1), 1);

    // return vec4(f32(cluster.nLights) / f32(${nMaxLightsPerCluster}) * vec3f(1, 1, 1), 1);

    var lightCol = vec3f(0, 0, 0);
    for (var i = 0u; i < cluster.nLights; i++) {
        lightCol += calculateLightContrib(lightSet.lights[cluster.lightIndices[i]], in.pos, normalize(in.nor));
    }
    // for (var i = 0u; i < lightSet.numLights; i++) {
    //     lightCol += calculateLightContrib(lightSet.lights[i], in.pos, normalize(in.nor));
    // }

    return vec4(diffuseColor.rgb * lightCol, 1);
}
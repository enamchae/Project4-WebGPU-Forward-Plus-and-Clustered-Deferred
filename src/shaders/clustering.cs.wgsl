// TODO-2: implement the light clustering compute shader

// ------------------------------------
// Calculating cluster bounds:
// ------------------------------------
// For each cluster (X, Y, Z):
//     - Calculate the screen-space bounds for this cluster in 2D (XY).
//     - Calculate the depth bounds for this cluster in Z (near and far planes).
//     - Convert these screen and depth bounds into view-space coordinates.
//     - Store the computed bounding box (AABB) for the cluster.

// ------------------------------------
// Assigning lights to clusters:
// ------------------------------------
// For each cluster:
//     - Initialize a counter for the number of lights in this cluster.

//     For each light:
//         - Check if the light intersects with the cluster’s bounding box (AABB).
//         - If it does, add the light to the cluster's light list.
//         - Stop adding lights if the maximum number of lights is reached.

//     - Store the number of lights assigned to this cluster.
@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read_write> clusterSet: ClusterSet;

fn sphereIntersectsBox(sphereCenter: vec3f, sphereRadius: f32, boxMin: vec3f, boxMax: vec3f) -> bool {
    let closestPoint = clamp(sphereCenter, boxMin, boxMax);
    let distance = length(sphereCenter - closestPoint);
    return distance <= sphereRadius;
}

@compute
@workgroup_size(${clusterWorkgroupSize})
fn clusterLights(@builtin(global_invocation_id) globalId: vec3u) {
    let nClustersByDim = vec3u(${nClustersX}, ${nClustersY}, ${nClustersZ});

    let threadIndex = globalId.x;
    if threadIndex >= nClustersByDim.x * nClustersByDim.y * nClustersByDim.z { return; }



    let nClusterZ = threadIndex / (nClustersByDim.x * nClustersByDim.y);
    let nClusterY = (threadIndex % (nClustersByDim.x * nClustersByDim.y)) / nClustersByDim.x;
    let nClusterX = threadIndex % nClustersByDim.x;
    


    let minZ = f32(${nearPlaneZ});
    let maxZ = f32(${farPlaneZ});
    let clipRange = maxZ - minZ;
    
    let frustumMinZ = minZ + f32(nClusterZ) * clipRange / f32(nClustersByDim.z);
    let frustumMaxZ = minZ + f32(nClusterZ + 1) * clipRange / f32(nClustersByDim.z);



    let clusterSize = cameraUniforms.screenDims / vec2f(nClustersByDim.xy);

    // y and z have to be flipped
    var frustumMinXyUnitSquare = vec2f(vec2u(nClusterX, nClusterY + 1)) * clusterSize / cameraUniforms.screenDims * 2 - 1;
    var frustumMaxXyUnitSquare = vec2f(vec2u(nClusterX + 1, nClusterY)) * clusterSize / cameraUniforms.screenDims * 2 - 1;
    frustumMinXyUnitSquare.y *= -1;
    frustumMaxXyUnitSquare.y *= -1;

    let fovScaleFac = tan(radians(f32(${fovY}) / 2));
    let aspect = cameraUniforms.screenDims.x / cameraUniforms.screenDims.y;



    let boxMin = vec3f(
        min(frustumMinXyUnitSquare.x * frustumMinZ, frustumMinXyUnitSquare.x * frustumMaxZ) * fovScaleFac * aspect,
        min(frustumMinXyUnitSquare.y * frustumMinZ, frustumMinXyUnitSquare.y * frustumMaxZ) * fovScaleFac,
        -frustumMaxZ,
    );
    let boxMax = vec3f(
        max(frustumMaxXyUnitSquare.x * frustumMinZ, frustumMaxXyUnitSquare.x * frustumMaxZ) * fovScaleFac * aspect,
        max(frustumMaxXyUnitSquare.y * frustumMinZ, frustumMaxXyUnitSquare.y * frustumMaxZ) * fovScaleFac,
        -frustumMinZ,
    );


    var nLights = 0u;
    for (var lightIndex = 0u; lightIndex < lightSet.numLights; lightIndex++) {
        let light = lightSet.lights[lightIndex];
        
        let lightCameraPos = (cameraUniforms.viewMat * vec4f(light.pos, 1)).xyz;
        if !sphereIntersectsBox(lightCameraPos, ${lightRadius}, boxMin, boxMax) { continue; }

        clusterSet.clusters[threadIndex].lightIndices[nLights] = lightIndex;
        nLights++;

        if nLights >= ${nMaxLightsPerCluster} { break; }
    }
    
    clusterSet.clusters[threadIndex].nLights = nLights;
}
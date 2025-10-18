// CHECKITOUT: code that you add here will be prepended to all shaders

struct Light {
    pos: vec3f,
    color: vec3f
}

struct LightSet {
    numLights: u32,
    lights: array<Light>
}

// TODO-2: you may want to create a ClusterSet struct similar to LightSet

struct CameraUniforms {
    // TODO-1.3: add an entry for the view proj mat (of type mat4x4f)
    viewProjMat: mat4x4f,
    viewMat: mat4x4f,
    projMat: mat4x4f,
    invProjMat: mat4x4f,
    screenDims: vec2f,
}

struct Cluster {
    nLights: u32,
    lightIndices: array<u32, ${nMaxLightsPerCluster}>,
}

struct ClusterSet {
    clusters: array<Cluster>,
}

struct GPixel {
    diffuse: vec4f,
    pos: vec3f,
    depth: f32,
    normal: vec3f,
    lastWriteTime: u32,
}

const nClustersByDim = vec3u(${nClustersX}, ${nClustersY}, ${nClustersZ});

// CHECKITOUT: this special attenuation function ensures lights don't affect geometry outside the maximum light radius
fn rangeAttenuation(distance: f32) -> f32 {
    return clamp(1.f - pow(distance / ${lightRadius}, 4.f), 0.f, 1.f) / (distance * distance);
}

fn calculateLightContrib(light: Light, posWorld: vec3f, nor: vec3f) -> vec3f {
    let vecToLight = light.pos - posWorld;
    let distToLight = length(vecToLight);

    let lambert = max(dot(nor, normalize(vecToLight)), 0.f);
    return light.color * lambert * rangeAttenuation(distToLight);
}


fn getNCluster(depth: f32, fragCoord: vec4f, screenDims: vec2f) -> vec3u {
    let minZ = f32(${nearPlaneZ});
    let maxZ = f32(${farPlaneZ});
    
    let nClusterZ = u32(f32(nClustersByDim.z) * (log2(depth) - log2(minZ)) / (log2(maxZ) - log2(minZ)));

    let clusterSize = screenDims / vec2f(nClustersByDim.xy);
    return vec3u(
        u32(fragCoord.x / clusterSize.x),
        u32(fragCoord.y / clusterSize.y),
        nClusterZ,
    );
}
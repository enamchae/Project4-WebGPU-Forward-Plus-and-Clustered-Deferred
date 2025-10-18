WebGL Forward+ and Clustered Deferred Shading
======================

**University of Pennsylvania, CIS 565: GPU Programming and Architecture, Project 4**

* Daniel Chen
* Tested on: Firefox 144 - Windows 11, AMD Ryzen 7 8845HS w/ Radeon 780M Graphics (3.80 GHz), RTX 4070 notebook

[![](images/thumb.png)](http://enamchae.github.io/Project4-WebGPU-Forward-Plus-and-Clustered-Deferred)

[live demo](http://enamchae.github.io/Project4-WebGPU-Forward-Plus-and-Clustered-Deferred)

This project is a WebGPU-based demonstration of three techniques used for lighting opaque surfaces in a 3D scene. In this case, we have many triangles and many (up to 5000) moving lights. The methods we demonstrate here are:

* **Forward rendering**. For each pixel of every triangle, check each light and add its contribution.
  * This is the easiest to reason about, implement, and generalize should there ever be other requirements for a scene.
* **Forward+ rendering**. Split the camera's viewing frustum into chunks. For each chunk, check each light and add it to a list. Then, for each pixel of every triangle, only check the lights in the chunk that pixel belongs to and add only the contributions of those lights.
  * This narrows down the number of lights that we know can contribute to a pixel, reducing the amount of computations we need per pixel, at the cost of an additional compute pass to generate the chunks.
  * Additional memory is needed to store the chunks and the list of lights per chunk, which (since array sizes are fixed) may be wasted if the lights are not very uniformly distributed. There is also some overhead from setting up the chunks, and we will need to iterate over a large number of lights many times anyway.
* **Clustered deferred rendering**. Split the camera's viewing frustum into chunks. For each chunk, check each light and add it to a list. Then, for each pixel of every triangle, render out the depth to a texture, along with information about the pixel's normal, position, and color. Finally, for every pixel in the depth pass, only check the lights in the chunk that pixel belongs to and add only the contributions of those lights.
  * This provides the benefit of not wasting light computations on surfaces that we know are going to be obscured.
  * This also has the benefits and tradeoffs from clustering in forward+ rendering.
  * Since this relies on a single depth buffer to know what surfaces to render, only binary transparent/opaque surfaces are supported by this and not translucency.


https://github.com/user-attachments/assets/eabff070-af2e-453b-a111-9e6823504127


## Performance analysis

By default, we divide the viewing frustum into $24 \times 16 \times 32$ chunks. The X and Y slices are uniform, but the Z/depth slices are logarithmic to roughly even out the contribution of each chunk to the screen. To reduce the amount of artifacting from the last two techniques, I found I needed to set the maximum number of lights per chunk to 512, but we can still analyze the performance of chunks that permit fewer lights despite the decreased fidelity from the original image.

At the defaults, we observe the following render times for each method:
![](/images/render%20time%201.png)

We find deferred rendering is significantly faster than both forward+ and forward rendering at higher numbers of lights. Overall, though, forward+ and deferred rendering both achieve a roughly constant render time across the whole range of light counts, while forward increases linearly. Forward rendering will always necessitate iterating through all lights for each pixel, which likely results in the pronounced linear growth we see, and forward+ and deferred rendering have a fixed cap on the number of lights checked per pixel, which likely results in the rough constant time. For the latter two algorithms, the time spent in the fragment shader likely overwhelms the time needed for the compute shader that assigns lights to chunks, since the loop over all lights only occurs once per chunk and not per pixel.

If we try 32 maximum lights per chunk instead, we see some blocky artifacting at higher light counts due to lights getting cut off:
![](/images/artifacts.png)

However, we see that the gap in performance between forward+ and deferred rendering disappears, both staying at a constant 7 ms / frame at the full range of light counts (forward is unaffected as we have only adjusted the chunking settings):
![](/images/render%20time%20low%20max%20lights.png)

If we try $2 \times 2 \times 2$ clusters and (to try to hold everything else constant) 512 maximum lights per chunk, we of course also see artifacting and observe similar times as the defaults:
![](/images/render%20time%20low%20cluster%20count.png)

We can somewhat infer from these results that increasing the number of chunks and limiting the number of lights per chunk tends to improve the performance of forward+. However, since increasing the chunk count shrinks each chunk, then each light will span more chunks and we will need to increase the light count per chunk anyway to avoid artifacting. Deferred rendering, however, limits the effects of increasing the number of lights per chunk. This indicates that much of the time spent in forward+ and forward rendering is in light computation that is wasted because it is overwritten by closer surfaces later.

If we try increasing the default chunk counts and maximum lights per chunk, we start to run into the default WebGPU limits on buffer sizes.


## Debug views
$(x, y, z)$ indices of each chunk (normalized to the $[0, 1)$ range):
![](/images/cluster%20indices.png)

Linearized index of each chunk (normalized to the $[0, 1)$ range) for indexing into the array of clusters:
![](/images/cluster%20indices%20linear.png)

Current number of lights in each chunk (normalized to the $[0, 1)$ range against the maximum number of lights per chunk):
![](/images//cluster%20light%20counts.png)

## Credits

- [Vite](https://vitejs.dev/)
- [loaders.gl](https://loaders.gl/)
- [dat.GUI](https://github.com/dataarts/dat.gui)
- [stats.js](https://github.com/mrdoob/stats.js)
- [wgpu-matrix](https://github.com/greggman/wgpu-matrix)

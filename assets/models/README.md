# Sources

These glb files were copied from the original EzTree `src/app/public` assets:

- `grass.glb`
- `flower_white.glb`
- `flower_blue.glb`
- `flower_yellow.glb`
- `rock1.glb`
- `rock2.glb`
- `rock3.glb`

The rock glb files keep the original `KHR_draco_mesh_compression` and
`EXT_texture_webp` compression. They are decoded at runtime through Cesium's
Draco worker using `Source/ThirdParty/draco_decoder.wasm`.

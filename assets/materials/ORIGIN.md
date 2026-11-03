# RealLoad V1.21 表面素材来源

`packaging-atlas-v121.png` 是 2026-11-02 使用内置 imagegen 为本项目生成的原创合成材质图集，不是厂家照片、扫描材质、实测数据或第三方素材。四个象限分别为牛皮纸、松木表面、编织包装纤维和蓝色喷涂钢板。

应用离线读取本地图集。`src/authored-surfaces.mjs` 在浏览器中按象限取样，生成法线和粗糙度贴图。法线、粗糙度及重复次数是视觉参数，不能用于受力、摩擦、承压或运输安全判断。用户自己提供的材质照片优先，加载失败时仍有原有程序材质。

工具：内置 `image_gen.imagegen`。未引入新的第三方代码或图库资产。

生成提示词：

```text
Use case: product-mockup. Asset type: original offline 3D packaging PBR base-color material atlas for RealLoad cargo simulator. Generate a single square 2-by-2 material atlas. Four equally sized edge-to-edge quadrants, NO borders, gutters, letters, objects, logos or text. Upper left: realistic matte natural brown kraft corrugated cardboard outer liner, fine random cellulose fibres and tiny flecks, uncoated smooth slightly worn paper, no wood grain, no corrugation waves, no folds. Upper right: realistic light honey unfinished pine plywood/pallet wood face with fine natural longitudinal grain, sparse small knots, subtle board fibres, NO panel seams. Lower left: realistic off-white cream polypropylene woven bulk bag cloth with small flat interlaced ribbons and mild natural creases, quiet uniform weave. Lower right: realistic matte dark desaturated blue painted container steel surface, very subtle orange peel and minute random scratches, NO corrugations, NO rust patches. Orthographic straight-on macro surface scans, physically plausible original photographic texture detail. Even diffuse neutral light, flat albedo, no shadows, no specular shine, no perspective, no bevels, no gradients across the quadrants. Each quadrant should have consistent average colour across it and be usable as a repeatable surface tile, its material fills its entire square. This is an original synthetic surface atlas, not measured material data. High fidelity, 2048x2048 square if supported.
```

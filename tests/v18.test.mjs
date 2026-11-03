import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CONTAINERS,intersects,validate,autoPack} from '../src/engine.mjs';
import {CARGO_TYPES,rotateSelection,moveSelection} from '../src/free-studio.mjs';
import {MATERIALS} from '../src/materials.mjs';
const box=CONTAINERS['20GP'];
const sample=(id='A',kind='carton',L=600,W=400,H=300)=>({id,skuId:id,name:id,kind,L,W,H,weight:20,qty:1,stackLimit:1,rotate:true,allowTilt:false});
const p=(s,x=0,y=0,z=0)=>({...s,id:s.id+'#1',x,y,z});
test('rotating 180 preserves envelope and updates meaningful heading',()=>{
 const sku=sample(),item=p(sku,0,0),res=rotateSelection([item],[item.id],box,[sku],180);
 assert.equal(res.ok,true);assert.deepEqual([res.placements[0].x,res.placements[0].y,res.placements[0].L,res.placements[0].W],[0,0,600,400]);assert.equal(res.placements[0].heading,180);
 const back=rotateSelection(res.placements,[item.id],box,[sku],180);assert.equal(back.ok,true);assert.equal(back.placements[0].heading,0);
});
test('90 changes horizontal size, keeps centre, and validates boundaries',()=>{
 const sku=sample(),item=p(sku,300,100),r=rotateSelection([item],[item.id],box,[sku],90);
 assert.equal(r.ok,true);assert.equal(r.placements[0].x,400);assert.equal(r.placements[0].y,0);assert.equal(r.placements[0].L,400);assert.equal(r.placements[0].W,600);assert.equal(r.placements[0].heading,90);
});
test('invalid degree, rotated locked cargo and collisions are rejected without mutation',()=>{
 const sku=sample(),item=p(sku,0,0);assert.equal(rotateSelection([item],[item.id],box,[sku],45).ok,false);
 assert.equal(rotateSelection([{...item,locked:true}],[item.id],box,[sku],180).ok,false);
 assert.equal(item.heading,undefined);
});
test('equal-diameter vertical cylinders can use circles without rectangular false positives',()=>{
 const one={x:0,y:0,z:0,L:100,W:100,H:300,kind:'drum'};
 const near={...one,x:85,y:85,kind:'round_pack'};
 assert.equal(intersects(one,near),false);
 assert.equal(intersects(one,{...near,x:55,y:55}),true);
 assert.equal(intersects(one,{...near,kind:'carton'}),true);
});
test('different diameters / irregular shapes retain conservative envelopes',()=>{
 const a={x:0,y:0,z:0,L:100,W:90,H:100,kind:'drum'},b={...a,x:80,y:80};
 assert.equal(intersects(a,b),true);assert.equal(intersects({...a,kind:'irregular'},b),true);
});
test('cylindrical support is not approved automatically',()=>{
 const base=sample('BASE','round_pack',400,400,450),top=sample('TOP','carton',150,150,150);
 const result=validate([p(base,0,0,0),p(top,50,50,450)],box,[base,top]);
 assert.equal(result.valid,false);assert.ok(result.issues.some(x=>x.kind==='support'));
});
test('new 16-type taxonomy and 18 material definitions are consistent',()=>{
 assert.equal(Object.keys(CARGO_TYPES).length,16);assert.equal(Object.keys(MATERIALS).length,18);assert.ok(MATERIALS.irregular);assert.ok(CARGO_TYPES.round_pack);
});
test('camera keyboard, 180 controls, visual source and documentation are connected',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8'),app=readFileSync(new URL('../src/app.mjs',import.meta.url),'utf8'),webgl=readFileSync(new URL('../src/webgl.mjs',import.meta.url),'utf8');
 for(const id of ['camera-pad','camera-toggle','focus-selected','free-rotate-180','edit-rotate-180']) assert.ok(html.includes(`id="${id}"`),id);
 assert.match(app,/\['w','a','s','d'\]/);assert.match(app,/action==='rotate180'/);assert.match(webgl,/focusTarget/);assert.match(webgl,/cam:\{\.\.\.CAMERA_PRESETS/);
});
test('the full 16-category sample imports with valid user-defined packing codes',async()=>{
 const {parseDelimited,autoMap,buildImport}=await import('../src/importer.mjs');
 const csv=readFileSync(new URL('../表单与检验/05-可导入-16类包装示例.csv',import.meta.url),'utf8');
 const rows=parseDelimited(csv),imported=buildImport(rows,autoMap(rows[0]));
 assert.equal(imported.errors.length,0,imported.errors.map(e=>e.message).join(' / '));
 assert.equal(imported.skus.length,16);
 assert.equal(imported.skus.at(-2).kind,'round_pack');assert.equal(imported.skus.at(-1).kind,'irregular');
});
test('rotational heading is included in position and manifest export',()=>{
 const app=readFileSync(new URL('../src/app.mjs',import.meta.url),'utf8');
 assert.match(app,/\x27heading\x27,\x27groupId\x27/);
 assert.match(app,/\x27水平朝向\(°\)\x27/);
});
test('horizontal cylinder renderer follows the package orientation when turned 90',()=>{
 const source=readFileSync(new URL('../src/webgl.mjs',import.meta.url),'utf8');
 assert.match(source,/function makeCylinderZ/);assert.match(source,/shape===\x27cylinderZ\x27/);
 assert.match(source,/packagePartModel\(p,part\)/);assert.match(readFileSync(new URL('../src/package-geometry.mjs',import.meta.url),'utf8'),/kind===\x27reel\x27/);
});
test('offline material texture generation distinguishes both new packaging kinds',async()=>{
 const {makeMaterialPixels,materialKinds}=await import('../src/material-texture.mjs');
 assert.ok(materialKinds.includes('round_pack'));assert.ok(materialKinds.includes('irregular'));
 const a=makeMaterialPixels('round_pack',16),b=makeMaterialPixels('irregular',16);
 assert.equal(a.width,16);assert.notDeepEqual([...a.pixels.slice(0,3)],[...b.pixels.slice(0,3)]);
});

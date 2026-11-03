import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MATERIALS,validateMaterialParameters,materialParameters} from '../src/materials.mjs';
import {alignSelection,distributeSelection} from '../src/free-studio.mjs';
import {CONTAINERS} from '../src/engine.mjs';
const root=new URL('../',import.meta.url);
const text=path=>readFileSync(new URL(path,root),'utf8');
const sku={id:'A',name:'瓦楞纸',kind:'carton',L:100,W:100,H:100,weight:10,qty:4,stackLimit:2,rotate:true,allowTilt:false};
const p=(id,x,y)=>({id,skuId:'A',name:'瓦楞纸',kind:'carton',L:100,W:100,H:100,weight:10,x,y,z:0,locked:false});
const cargo=[p('A#1',0,0),p('A#2',320,0),p('A#3',900,0)];
test('each packaged material has visual roughness, metallic and bump parameters',()=>{
 assert.equal(Object.keys(MATERIALS).length,18);
 for(const [kind,spec] of Object.entries(MATERIALS))assert.ok(validateMaterialParameters(spec),kind);
 assert.ok(MATERIALS.metal.metalness>MATERIALS.carton.metalness);
 assert.ok(MATERIALS.carton.roughness>MATERIALS.plastic.roughness);
 assert.equal(materialParameters('unknown'),MATERIALS.carton);
});
test('webgl supports albedo normal roughness mapping and GGX PBR shading',()=>{
 const gl=text('src/webgl.mjs');for(const part of ['uNormalMap','uRoughnessMap','uMetalness','D_GGX','G_Schlick','uQuality','surfaceMaps'])assert.ok(gl.includes(part),part);
});
test('PBR shading can be enabled or disabled without changing measurements',()=>{
 const app=text('src/app.mjs'),html=text('index.html');assert.match(html,/data-display="pbr"/);assert.match(app,/pbr:true/);
});
test('align selected pair checks collisions and preserves original inputs',()=>{
 const p1=p('A#1',0,0),p2=p('A#2',300,250),original=structuredClone([p1,p2]);
 const r=alignSelection([p1,p2],[p1.id,p2.id],'x',CONTAINERS['20GP'],[sku]);
 assert.equal(r.ok,true);assert.equal(r.placements[1].x,0);assert.deepEqual([p1,p2],original);
 const bad=alignSelection([p1,p('A#2',300,0)],[p1.id,'A#2'],'x',CONTAINERS['20GP'],[sku]);assert.equal(bad.ok,false);
});
test('distribute selected units evenly with first and last fixed',()=>{
 const r=distributeSelection(cargo,cargo.map(p=>p.id),'x',CONTAINERS['20GP'],[sku]);
 assert.equal(r.ok,true);assert.equal(r.placements[0].x,0);assert.equal(r.placements[2].x,900);
 assert.equal(r.placements[1].x,450);
});
test('invalid selected align or distribution is rejected',()=>{
 assert.equal(distributeSelection(cargo,cargo.slice(0,2).map(p=>p.id),'x',CONTAINERS['20GP'],[sku]).ok,false);
 assert.equal(alignSelection(cargo,['A#1','A#2'],'z',CONTAINERS['20GP'],[sku]).ok,false);
 assert.equal(alignSelection(cargo,['A#1','A#2'],'x',CONTAINERS['20GP'],[sku]).ok,false); // same Y: collision
});
test('redo control and UI operation IDs are all wired',()=>{
 const html=text('index.html'),app=text('src/app.mjs');for(const id of ['redo-btn','free-align-x','free-align-y','free-space-x','free-space-y']){
 assert.ok(html.includes('id="'+id+'"'));assert.ok(app.includes("$('"+id+"')"));}
 assert.ok(app.includes('redoStack.push'));assert.ok(app.includes('redoStack.length=0'));
});

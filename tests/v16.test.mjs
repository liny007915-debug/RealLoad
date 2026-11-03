import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {materialKinds,makeMaterialPixels} from '../src/material-texture.mjs';
const root=new URL('../',import.meta.url);const read=p=>readFileSync(new URL(p,root),'utf8');
test('14+ cargo surface types have deterministic nonflat procedural texture',()=>{
 assert.ok(materialKinds.length>=14);
 for(const type of ['carton','crate','board','pallet','drum','jute','metal','ibc','plastic_crate','machine','coolbox','reel']){
   const a=makeMaterialPixels(type,64),b=makeMaterialPixels(type,64);assert.equal(a.pixels.length,64*64*4);assert.deepEqual(a.pixels,b.pixels);
   const red=new Set();for(let i=0;i<a.pixels.length;i+=4)red.add(a.pixels[i]);assert.ok(red.size>=3,`${type} should show texture, not flat color`);
 }
});
test('no invalid or oversized procedural textures',()=>{
 assert.throws(()=>makeMaterialPixels('wood',0));assert.throws(()=>makeMaterialPixels('wood',1025));
});
test('v1.6 has first-use guide, empty stage and contextual controls',()=>{
 const html=read('index.html');
 for(const id of ['guide-dialog','guide-heading','guide-next','guide-do','guide-skip','guide-trigger','empty-stage','empty-demo','empty-place','selection-actions','selection-to-edit','selection-locate','selection-rotate','global-overflow'])assert.match(html,new RegExp(`id="${id}"`));
 const app=read('src/app.mjs');
 for(const field of ['initializeGuide();','function openGuide','function closeGuide','function goGuideAction','paint(false)','function onselect'])assert.ok(app.includes(field));
 assert.doesNotMatch(app,/if\(!s\.placements\.length\)\{try\{s\.placements=autoPack\(/);
});
test('selection no longer forces navigation to edit section',()=>{
 const code=read('src/app.mjs');const start=code.indexOf('function onselect('),end=code.indexOf('function makeViews(',start);const selection=code.slice(start,end);
 assert.doesNotMatch(selection,/s\.section\s*=\s*['"]edit['"]/);
 assert.match(selection,/s\.selected=id/);
});
test('v1.6 includes responsive calm theme and reduced motion',()=>{
 const css=read('src/v16.css');assert.match(css,/prefers-reduced-motion/);assert.match(css,/max-width:670px/);assert.match(css,/#guide-dialog|\.guide-dialog/);assert.match(css,/\.quickstart-strip/);
});

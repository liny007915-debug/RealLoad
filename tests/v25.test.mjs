import test from 'node:test';
import assert from 'node:assert/strict';
import {fitDistance,orthographicHalfExtent} from '../src/camera-fit.mjs';
import {normalizePriority,prioritizeReady,priorityIssues,priorityOrder} from '../src/priority.mjs';
import {autoPack,CONTAINERS,validate,doorFits,intersects} from '../src/engine.mjs';
import {buildImport,autoMap,parseDelimited} from '../src/importer.mjs';
import {suggestUnloadOrder,unloadingState} from '../src/unloading.mjs';
import {decoratePlacements} from '../src/manifest.mjs';
const rounded=(v)=>Number(v.toFixed(6));

test('narrower screens require larger camera distance to fit all eight corners',()=>{
 const dim={L:12.032,W:2.35,H:2.7,yaw:.75,pitch:.45};
 assert.ok(fitDistance({...dim,aspect:320/360})>fitDistance({...dim,aspect:1440/820}));
});
test('fit distance keeps all corners inside perspective FOV for many sizes and angles',()=>{
 for(const L of [3,5.9,12.032,16])for(const aspect of [.48,.62,.89,1.7,3.1])for(const yaw of [.01,.75,1.4,2.1])for(const pitch of [.09,.45,1.25]){
  const H=2.7,W=2.35,d=fitDistance({L,W,H,yaw,pitch,aspect});const sy=Math.sin(yaw),cy=Math.cos(yaw),sp=Math.sin(pitch),cp=Math.cos(pitch);
  const th=Math.tan(Math.PI/8)*aspect,tv=Math.tan(Math.PI/8);
  for(const x of [-L/2,L/2])for(const y of [-H/2,H/2])for(const z of [-W/2,W/2]){
   const depth=d-(x*cp*sy+y*sp+z*cp*cy);const u=Math.abs(x*cy-z*sy)/depth, v=Math.abs(-x*sp*sy+y*cp-z*sp*cy)/depth;
   assert.ok(u<=th+1e-7&&v<=tv+1e-7,`${L} ${aspect} ${yaw} ${pitch} corner cropped`);
  }
 }
});
test('orthographic top/door/side views fit in narrow and ultra-wide canvases',()=>{
 for(const mode of ['top','door','side'])for(const aspect of [.44,1,3.4]){
  const half=orthographicHalfExtent({L:12.032,W:2.35,H:2.7,mode,aspect});
  const h=mode==='door'?2.35:12.032,v=mode==='top'?2.35:2.7;
  assert.ok(half*aspect>=h/2&&half>=v/2);
 }
});
test('untrusted urgency values are rejected on CSV import',()=>{
 const rows=parseDelimited('SKU,长(mm),宽(mm),高(mm),毛重(kg),数量,紧急程度\nBAD,400,300,220,12,1,极端绝对优先');
 const result=buildImport(rows,autoMap(rows[0]));assert.equal(result.errors.length,1);
});
test('urgent Chinese and English priority values map consistently',()=>{
 for(const s of ['紧急','urgent','P0','加急'])assert.equal(normalizePriority(s),'urgent');
 assert.equal(normalizePriority('优先'),'high');assert.equal(normalizePriority('普通'),'normal');assert.equal(normalizePriority('可后卸'),'low');assert.equal(normalizePriority('not a priority'),null);
});
test('urgent accessible item is scheduled first even if farther from door',()=>{
 const box=CONTAINERS['20GP'];const items=[
  {id:'N',skuId:'N',x:4500,y:10,z:0,L:300,W:300,H:200,weight:10,priority:'normal'},
  {id:'U',skuId:'U',x:4000,y:1200,z:0,L:300,W:300,H:200,weight:10,priority:'urgent'}
 ];
 const plan=suggestUnloadOrder(items,box,[],{doorMode:'strict'});assert.equal(plan.order[0],'U');
});
test('a reachable blocker may be removed to unblock a trapped urgent item',()=>{
 const box=CONTAINERS['20GP'];const items=[
  {id:'U',skuId:'U',x:2600,y:200,z:0,L:500,W:500,H:250,weight:10,priority:'urgent'},
  {id:'B',skuId:'B',x:4200,y:200,z:0,L:500,W:500,H:250,weight:10,priority:'normal'},
  {id:'X',skuId:'X',x:4900,y:1500,z:0,L:400,W:400,H:250,weight:10,priority:'low'}
 ];
 const plan=suggestUnloadOrder(items,box,[],{doorMode:'strict'});
 assert.deepEqual(plan.order.slice(0,2),['B','U']);assert.equal(plan.urgentBlocked.length,1);
});
test('urgent cargo blocked by the aperture is flagged rather than falsely removable',()=>{
 const box=CONTAINERS['20GP'];const item={id:'U',skuId:'U',x:1000,y:0,z:0,L:400,W:400,H:400,weight:10,priority:'urgent'};
 const state=unloadingState([item],box,[],{doorMode:'strict'});assert.equal(state.available.length,0);
 assert.equal(priorityIssues(state.choices).length,1);
});
test('auto pack tries to keep urgent shipment at the door and keeps geometry valid',()=>{
 const skus=[{id:'N',name:'normal',L:500,W:420,H:300,weight:20,qty:2,stackLimit:1,kind:'carton',rotate:true,priority:'normal'},
 {id:'U',name:'urgent',L:500,W:420,H:300,weight:22,qty:1,stackLimit:1,kind:'carton',rotate:true,priority:'urgent'}];
 for(const box of Object.values(CONTAINERS)){
  const result=autoPack(skus,box),urgent=result.placements.find(p=>p.skuId==='U');
  assert.ok(urgent);assert.equal(rounded(urgent.x+urgent.L),box.L);
  assert.equal(validate(result.placements,box,skus).valid,true);
  const choices=unloadingState(decoratePlacements(result.placements,skus),box,[],{doorMode:'strict'});
  assert.ok(choices.available.some(c=>c.id===urgent.id));
 }
});
test('import forms with urgent flag preserve priority through placement labels',()=>{
 const rows=parseDelimited('SKU,货物名称,长(mm),宽(mm),高(mm),毛重(kg),数量,包装类型,紧急程度\nURG-1,urgent,600,400,350,20,1,纸箱,紧急\nREG-1,normal,600,400,350,20,1,托盘,普通');
 const result=buildImport(rows,autoMap(rows[0]));assert.equal(result.errors.length,0);assert.equal(result.skus[0].priority,'urgent');assert.equal(result.skus[1].priority,'normal');
 const packed=autoPack(result.skus,CONTAINERS['20GP']);assert.equal(validate(packed.placements,CONTAINERS['20GP'],result.skus).valid,true);
 assert.equal(decoratePlacements(packed.placements,result.skus).find(p=>p.skuId==='URG-1').priority,'urgent');
});

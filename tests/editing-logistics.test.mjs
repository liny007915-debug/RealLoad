import {snapshotPlacement} from '../src/cargo-spec.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CONTAINERS,validate,intersects} from '../src/engine.mjs';
import {editedContainer,reflowContainer} from '../src/container-editing.mjs';
import {intersectPlane,dragPlaneDelta} from '../src/drag-projection.mjs';
import {boundedMove} from '../src/placement-assist.mjs';
import {normalizeDeliveryStop,compareCargoPriority,deliveryLabel} from '../src/priority.mjs';
import {decoratePlacements} from '../src/manifest.mjs';
import {getCargoScenario} from '../src/cargo-scenarios.mjs';
import {suggestUnloadOrder,suggestLoadOrder} from '../src/unloading.mjs';
import {segmentIsClear} from '../src/maneuver-planner.mjs';
import {autoMap,buildImport,parseDelimited} from '../src/importer.mjs';
import {webglMath} from '../src/webgl.mjs';

const box=CONTAINERS['20GP'];
const sku={id:'PART',name:'模拟木箱',kind:'crate',L:600,W:500,H:500,weight:25,qty:10,rotate:true,allowTilt:false,stackLimit:1};
const unit=(n,x,extra={})=>({id:`PART#${n}`,skuId:sku.id,ordinal:n,name:sku.name,kind:sku.kind,L:600,W:500,H:500,weight:25,x,y:100,z:0,rotation:0,heading:0,locked:false,unitCode:`CUSTOM-${n}`,...extra});

test('container reflow packs only loaded stock and preserves nonconsecutive identities and metadata',()=>{
 const units=[unit(3,4000),unit(8,5000)],before=structuredClone(units),stock=structuredClone(sku);
 const next=editedContainer(box,{L:2500});
 const result=reflowContainer(units,next,[sku]);
 assert.equal(result.ok,true,result.reason);assert.equal(result.placements.length,2);
 assert.deepEqual(result.placements.map(p=>[p.id,p.ordinal,p.unitCode]).sort(),before.map(p=>[p.id,p.ordinal,p.unitCode]).sort());
 assert.equal(validate(result.placements,next,[sku]).valid,true);
 assert.deepEqual(units,before);assert.deepEqual(sku,stock);
});

test('container reflow retains a locked unit and fails atomically on insufficient capacity',()=>{
 const units=[unit(2,100,{locked:true}),unit(7,5000)],before=structuredClone(units);
 const next=editedContainer(box,{L:2500}),result=reflowContainer(units,next,[sku]);
 assert.equal(result.ok,true,result.reason);
 assert.deepEqual(result.placements.find(p=>p.locked),units[0]);
 const tiny=editedContainer(box,{L:1200,W:700,H:600,doorW:650,doorH:550});
 assert.equal(reflowContainer(units,tiny,[sku]).ok,false);
 assert.deepEqual(units,before);
 assert.equal(reflowContainer([unit(2,5000,{locked:true})],next,[sku]).ok,false);
 assert.equal(reflowContainer(units,{...next,doorW:next.W+1},[sku]).ok,false);
});

test('reflow refuses missing SKU records instead of silently dropping units',()=>{
 assert.equal(reflowContainer([unit(1,0)],box,[]).ok,false);
 const result=reflowContainer([],editedContainer(box,{L:3000}),[sku]);
 assert.equal(result.ok,true,result.reason);assert.deepEqual(result.placements,[]);
});

for(const mode of ['iso','top','side','door'])test(`${mode}: pointer plane inversion preserves the invisible dimension`,()=>{
 const rays={iso:(x,y)=>({o:[x,10,y],d:[0,-1,0]}),top:(x,y)=>({o:[x,10,y],d:[0,-1,0]}),side:(x,y)=>({o:[x,y,10],d:[0,0,-1]}),door:(x,y)=>({o:[10,y,x],d:[-1,0,0]})};
 const result=dragPlaneDelta(rays[mode],{x:.1,y:.2},{x:.6,y:.7},unit(1,400),mode);
 const expected=mode==='side'?{x:500,y:0,z:500}:mode==='door'?{x:0,y:500,z:500}:{x:500,y:500,z:0};
 for(const axis of ['x','y','z'])assert.ok(Math.abs(result[axis]-expected[axis])<1e-8);
});

test('ray plane intersection rejects parallel and backward rays, and explicit axes stay fixed',()=>{
 assert.equal(intersectPlane({o:[0,1,0],d:[1,0,0]},[0,1,0],[0,0,0]),null);
 assert.equal(intersectPlane({o:[0,1,0],d:[0,1,0]},[0,1,0],[0,0,0]),null);
 const ray=(x,y)=>({o:[10,y,x],d:[-1,0,0]}),p=unit(1,400);
 const result=dragPlaneDelta(ray,{x:0,y:0},{x:0,y:1},p,'iso','z',[3,4,(p.y+p.W/2)/1000]);
 assert.deepEqual(result,{x:0,y:0,z:1000});
});

test('camera inverse retains double precision for off-grid dragging near a wall',()=>{
 const {mul,perspective,lookAt,transform,inv}=webglMath;
 const vp=mul(perspective(Math.PI/4,2.2,.01,100),lookAt([9,6,8],[3,1,1]));
 const inverse=inv(vp),world=[.8,.35,.37],projected=transform(vp,...world),roundtrip=transform(inverse,...projected);
 world.forEach((n,i)=>assert.ok(Math.abs(n-roundtrip[i])<1e-9));
});

test('pure X dragging preserves an off-grid Y near the wall and untouched height',()=>{
 const p=unit(1,400,{y:20});
 assert.deepEqual(boundedMove({x:900,y:20.0003,z:0},p,box,{step:25}),{x:900,y:20,z:0});
 const q=unit(1,400,{y:20,z:500});
 assert.deepEqual(boundedMove({x:900,y:20,z:500},q,box,{step:25}),{x:900,y:20,z:500});
});

test('height dragging snaps to full rectangular support but never soft or irregular tops',()=>{
 const p=unit(1,100,{L:300,W:300}),base=unit(2,0,{L:1000,W:900});
 for(const kind of ['crate','carton','pallet'])assert.equal(boundedMove({x:100,y:100,z:485},p,box,{step:25,neighbors:[{...base,kind}]}).z,500);
 for(const kind of ['sack','bag','irregular','reel'])assert.equal(boundedMove({x:100,y:100,z:470},p,box,{step:25,neighbors:[{...base,kind}]}).z,475);
});

test('declared delivery stops rank before urgency within later stops; invalid stops are rejected',()=>{
 for(const value of ['',null,undefined,0,-1,1.5,1000,'oops'])assert.equal(normalizeDeliveryStop(value),null);
 assert.equal(normalizeDeliveryStop('2'),2);
 const items=[{id:'last',deliveryStop:3,priority:'urgent'},{id:'first-ordinary',deliveryStop:1,priority:'normal'},{id:'first-urgent',deliveryStop:1,priority:'urgent'}];
 assert.deepEqual(items.sort(compareCargoPriority).map(p=>p.id),['first-urgent','first-ordinary','last']);
 assert.match(deliveryLabel(items[0]),/第 1 站.*紧急/);
});

test('metadata edits immediately refresh placed cargo without changing geometry and can clear a stop',()=>{
 const units=[unit(1,100)],before=structuredClone(units);
 const next=decoratePlacements(units,[{...sku,priority:'urgent',deliveryStop:2}]);
 assert.equal(next[0].priority,'urgent');assert.equal(next[0].deliveryStop,2);
 for(const key of ['id','x','y','z','L','W','H','weight'])assert.equal(next[0][key],before[0][key]);
 const cleared=decoratePlacements(next,[{...sku,priority:'low',deliveryStop:null}]);
 assert.equal(cleared[0].priority,'low');assert.equal('deliveryStop' in cleared[0],false);
 assert.deepEqual(units,before);
});

test('mixed-weight multi-stop sample clears its blocker before urgent cargo and has valid reversible paths',()=>{
 const sample=getCargoScenario('dispatch-priority'),before=structuredClone(sample);
 assert.match(sample.source,/模拟.*非厂家/);assert.equal(sample.placements.length,9);
 assert.equal(Math.min(...sample.skus.map(p=>p.weight)),6);assert.equal(Math.max(...sample.skus.map(p=>p.weight)),860);
 assert.equal(validate(sample.placements,sample.container,sample.skus).valid,true);
 const options={doorMode:'smart',clearance:0},plan=suggestUnloadOrder(sample.placements,sample.container,[],options);
 assert.equal(plan.complete,true);assert.equal(plan.order[0],'SIM-DISPATCH-GATE#1');
 assert.ok(plan.order[1].startsWith('SIM-DISPATCH-COOL'));assert.ok(plan.order[2].startsWith('SIM-DISPATCH-COOL'));
 const rest=plan.order.slice(1).map(id=>sample.placements.find(p=>p.id===id));
 for(let i=1;i<rest.length;i++)assert.ok(compareCargoPriority(rest[i-1],rest[i])<=0);
 let remaining=[...sample.placements];
 for(const id of plan.order){
  const p=remaining.find(p=>p.id===id),route=plan.routes[id];assert.ok(route.length>=2);
  for(let i=1;i<route.length;i++){
   assert.equal(segmentIsClear(p,route[i-1],route[i],remaining,sample.container),true);
   for(let frame=0;frame<=20;frame++){
    const moving={...p,...Object.fromEntries(['x','y','z'].map(k=>[k,route[i-1][k]+(route[i][k]-route[i-1][k])*frame/20]))};
    assert.equal(remaining.some(q=>q.id!==id&&intersects(moving,q)),false);
   }
  }
  remaining=remaining.filter(p=>p.id!==id);
  assert.equal(validate(remaining,sample.container,sample.skus).valid,true);
 }
 assert.deepEqual(suggestLoadOrder(sample.placements,sample.container,options).order,[...plan.order].reverse());
 assert.deepEqual(sample,before);
});

test('shipped dispatch JSON and CSV preserve weight, urgency and delivery stops',()=>{
 const sample=getCargoScenario('dispatch-priority'),json=JSON.parse(readFileSync(new URL('../examples/v122-dispatch-priority.json',import.meta.url)));
 assert.deepEqual(json.placements.map(p=>snapshotPlacement(p,json.skus.find(s=>s.id===p.skuId))),sample.placements);assert.deepEqual(json.skus,sample.skus);
 const rows=parseDelimited(readFileSync(new URL('../examples/v122-dispatch-priority.csv',import.meta.url),'utf8'));
 const mapping=autoMap(rows[0]),imported=buildImport(rows,mapping);assert.deepEqual(imported.errors,[]);
 for(const original of sample.skus){const item=imported.skus.find(p=>p.id===original.id);for(const key of ['weight','qty','priority','deliveryStop','kind'])assert.equal(item[key],original[key]);}
 for(const invalid of ['0','-1','2.2','1000','tomorrow']){const copy=structuredClone(rows);copy[1][mapping.deliveryStop]=invalid;assert.equal(buildImport(copy,mapping).errors.length,1);}
});

/** Release-beta regression matrix. All dimensions/masses here are deliberately
 * synthetic mm/kg, never manufacturer specifications or a transport approval. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validate,intersects,supportOf,orientations} from '../src/engine.mjs';
import {autoPackThroughDoor} from '../src/door-packing.mjs';
import {updateCargo} from '../src/cargo-update.mjs';
import {captureCargoSpec} from '../src/cargo-spec.mjs';
import {CARGO_TYPES,dropCandidate,verifyDrop} from '../src/free-studio.mjs';
import {suggestUnloadOrder,suggestLoadOrder,unloadOne,doorOpeningStatus} from '../src/unloading.mjs';
import {positionOnRoute,segmentIsClear} from '../src/maneuver-planner.mjs';
import {motionPosition} from '../src/playback.mjs';
import {packageParts,PACKAGE_GEOMETRY} from '../src/package-geometry.mjs';

const box={id:'CUSTOM',label:'合成测试箱，非厂家规格',L:10000,W:5000,H:4000,doorW:4900,doorH:3900,payload:100000};
const types=Object.keys(CARGO_TYPES);
const copy=value=>structuredClone(value);
const sku=(id,kind='carton',extra={})=>({id,name:`${id}（模拟，非厂家规格）`,kind,L:700,W:500,H:600,weight:35,qty:4,rotate:true,allowTilt:false,stackLimit:1,sampleOnly:true,...extra});
const placed=(s,n=1,extra={})=>({id:`${s.id}#${n}`,ordinal:n,skuId:s.id,name:s.name,kind:s.kind,L:s.L,W:s.W,H:s.H,weight:s.weight,stackLimit:s.stackLimit,x:250,y:250,z:0,rotation:0,heading:0,locked:false,stackDepth:1,...extra});
const physical=p=>[p.id,p.name,p.x,p.y,p.z,p.L,p.W,p.H,p.weight,p.kind,p.stackLimit,p.heading,p.locked];
const audit=(items,equipment,skus)=>{const report=validate(items,equipment,skus);assert.equal(report.valid,true,JSON.stringify(report.issues));return report;};

assert.equal(types.length,16,'the published matrix must cover all supported packaging kinds');

for(const [index,kind] of types.entries())test(`beta 16-kind matrix: ${kind} keeps the placed physical unit while future units use the edited template`,()=>{
 const original=sku('REVISION',kind,['drum','roll','round_pack'].includes(kind)?{L:500,W:500}:{});
 const first=placed(original),state={box,skus:[original],placements:[first]},before=copy(state);
 const next=sku('REVISION',types[(index+1)%types.length],{name:'后续货物模板（模拟）',L:900,W:600,H:800,weight:95,rotate:false,stackLimit:2});
 const changed=updateCargo(state,[next]);assert.equal(changed.ok,true,changed.reason);
 assert.deepEqual(physical(changed.placements[0]),physical(first));
 assert.deepEqual(changed.placements[0].cargoSpec,captureCargoSpec(original));
 assert.deepEqual(state,before,'editing must not mutate a caller-owned plan');
 const drop=dropCandidate(next,changed.placements,box,{x:4000,y:2000});assert.equal(drop.ok,true,drop.reason);
 const result=verifyDrop(drop.candidate,changed.placements,box,[next]);assert.equal(result.ok,true,result.reason);
 assert.deepEqual([drop.candidate.L,drop.candidate.W,drop.candidate.H,drop.candidate.weight,drop.candidate.kind],[900,600,800,95,next.kind]);
 assert.deepEqual(drop.candidate.cargoSpec,captureCargoSpec(next));
 audit(result.placements,box,[next]);
 const latest={...next,L:1000,W:650,H:850,weight:120,kind:'irregular'};
 const secondChange=updateCargo({box,skus:[next],placements:result.placements},[latest]);assert.equal(secondChange.ok,true,secondChange.reason);
 assert.deepEqual(secondChange.placements.map(physical),result.placements.map(physical));
 assert.deepEqual(secondChange.placements.map(p=>p.cargoSpec),[captureCargoSpec(original),captureCargoSpec(next)]);
 const restored=JSON.parse(JSON.stringify({box,skus:[latest],placements:secondChange.placements}));
 assert.equal(audit(restored.placements,restored.box,restored.skus).weight,130);
});

test('all sixteen physical render assemblies contain finite bounded mesh parts',()=>{
 for(const kind of types){
  const item=placed(sku(kind,kind)),parts=packageParts(item);assert.ok(parts.length>=1,kind);
  for(const part of parts){
   assert.ok([part.x,part.y,part.z,part.w,part.h,part.d,part.alpha].every(Number.isFinite),`${kind}: finite primitive`);
   assert.ok(part.w>0&&part.h>0&&part.d>0,`${kind}: positive primitive envelope`);
   assert.ok(Math.abs(part.x)+part.w/2<=.5001&&Math.abs(part.y)+part.h/2<=.5001&&Math.abs(part.z)+part.d/2<=.5001,`${kind}: decorative parts cannot enlarge the measured envelope`);
   if(!['box','cylinder','cylinderX','cylinderZ'].includes(part.shape))assert.ok(PACKAGE_GEOMETRY[part.shape],`${kind}: ${part.shape} mesh is available`);
  }
 }
});

test('mixed physical revisions retain circular collision rules after the SKU becomes a rectangular machine',()=>{
 const drum=sku('ROUND','drum',{L:500,W:500,H:600,weight:50,qty:2});
 const items=[placed(drum,1,{x:500,y:500}),placed(drum,2,{x:870,y:870})];
 assert.equal(intersects(items[0],items[1]),false,'overlapping AABBs are clear circular cross-sections');
 const next={...drum,kind:'machine',L:900,W:700,H:800,weight:200};
 const changed=updateCargo({box,skus:[drum],placements:items},[next]);assert.equal(changed.ok,true,changed.reason);
 assert.equal(audit(changed.placements,box,[next]).weight,100);
 const collision=changed.placements.map((p,i)=>i?{...p,x:800,y:800}:p);
 assert.ok(validate(collision,box,[next]).issues.some(issue=>issue.kind==='collision'));
});

for(const kind of ['bag','sack','irregular','drum','roll','round_pack','reel','bundle'])test(`frozen ${kind} cannot become a support merely because its template changes to a crate`,()=>{
 const base=sku('BASE',kind,{L:1000,W:1000,H:600,qty:1,stackLimit:99});
 const upper=sku('TOP','carton',{L:300,W:300,H:200,weight:5,qty:1,stackLimit:99});
 const floor=placed(base),next={...base,kind:'crate'};
 const changed=updateCargo({box,skus:[base,upper],placements:[floor]},[next,upper]);assert.equal(changed.ok,true,changed.reason);
 const top=placed(upper,1,{x:350,y:350,z:600});assert.equal(supportOf(top,changed.placements),undefined);
 const check=validate([...changed.placements,top],box,[next,upper]);assert.equal(check.valid,false);assert.ok(check.issues.some(issue=>issue.kind==='support'));
});

test('template enlargement does not invalidate an existing small unit, but a future oversized drop is rejected',()=>{
 const original=sku('SIZE','carton',{qty:2}),first=placed(original);
 for(const patch of [{W:box.doorW+1},{H:box.doorH+1},{L:box.L+1},{weight:box.payload+1}]){
  const next={...original,...patch},changed=updateCargo({box,skus:[original],placements:[first]},[next]);assert.equal(changed.ok,true,changed.reason);
  assert.deepEqual(physical(changed.placements[0]),physical(first));audit(changed.placements,box,[next]);
  const drop=dropCandidate(next,changed.placements,box,{x:3000,y:200});
  if(drop.ok)assert.equal(verifyDrop(drop.candidate,changed.placements,box,[next]).ok,false,JSON.stringify(patch));
  else assert.match(drop.reason,/外尺寸|边界|落点/);
 }
});

test('snapshot validation rejects dimension, mass, kind and orientation corruption rather than trusting the current template',()=>{
 const original=sku('TRUST','crate',{rotate:false}),first={...placed(original),cargoSpec:captureCargoSpec(original)};
 const latest={...original,L:900,W:800,H:700,weight:150,kind:'machine',rotate:true};
 audit([first],box,[latest]);
 for(const patch of [{L:900},{weight:150},{kind:'machine'},{L:first.W,W:first.L},{cargoSpec:{...first.cargoSpec,version:999}},{cargoSpec:{...first.cargoSpec,weight:-1}}]){
  const report=validate([{...first,...patch}],box,[latest]);assert.equal(report.valid,false,JSON.stringify(patch));assert.ok(report.issues.length>0);
 }
 const unsupported=validate([{...first,z:100}],box,[latest]);assert.equal(unsupported.valid,false);assert.ok(unsupported.issues.some(issue=>issue.kind==='support'));
});

const random=seed=>()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
for(let seed=1;seed<=24;seed++)test(`seeded mixed-cargo release scenario ${seed}: full pack, independent specifications and every load/unload commit`,()=>{
 const rng=random(0x127000+seed),skus=types.map((kind,i)=>{
  let L=250+Math.floor(rng()*350),W=250+Math.floor(rng()*350);if(['drum','roll','round_pack'].includes(kind))W=L;
  return sku(`MIX-${seed}-${i}`,kind,{L,W,H:200+Math.floor(rng()*600),weight:3+Math.floor(rng()*140),qty:2,rotate:rng()>.4,stackLimit:1,priority:['urgent','high','normal','low'][i%4]});
 });
 const before=copy(skus),packed=autoPackThroughDoor(skus,box);
 assert.equal(packed.placements.length,32);assert.deepEqual(packed.unplaced,[]);assert.equal(packed.truncated,false);
 assert.equal(new Set(packed.placements.map(p=>p.id)).size,32);assert.deepEqual(skus,before);
 audit(packed.placements,box,skus);
 const future=skus.map((s,i)=>({...s,L:s.L+100,W:s.W+50,H:s.H+30,weight:s.weight+17,kind:types[(i+7)%types.length],rotate:!s.rotate}));
 const changed=updateCargo({box,skus,placements:packed.placements},future);assert.equal(changed.ok,true,changed.reason);
 assert.deepEqual(changed.placements.map(physical),packed.placements.map(physical));
 assert.equal(audit(changed.placements,box,future).weight,skus.reduce((sum,s)=>sum+s.weight*2,0));
 const options={doorMode:'strict',clearance:0},unload=suggestUnloadOrder(changed.placements,box,[],options),load=suggestLoadOrder(changed.placements,box,options);
 assert.equal(unload.complete,true,JSON.stringify(unload.issues));assert.equal(load.complete,true);assert.deepEqual(load.order,[...unload.order].reverse());
 let removed=[];for(const id of unload.order){const step=unloadOne(changed.placements,box,removed,id,options);assert.equal(step.ok,true,step.reason);removed=step.removed;audit(changed.placements.filter(p=>!removed.includes(p.id)),box,future);}
 const loaded=[];for(const id of load.order){
  const moving=changed.placements.find(p=>p.id===id);for(const t of [0,.25,.5,.75,1])assert.equal(loaded.some(p=>intersects(p,motionPosition(moving,box,t,'load'))),false,`${id}: sampled straight loading collision`);
  loaded.push(moving);audit(loaded,box,future);
 }
 assert.deepEqual(changed.placements.map(physical),packed.placements.map(physical));
});

test('a tall door blocker is cleared before the urgent rear revision, with every swept path checked',()=>{
 const equipment={...box,L:6000,W:2400,H:2600,doorW:2000,doorH:2300};
 const old=sku('ONE-SKU','crate',{L:1200,W:1900,H:2200,weight:550,qty:2,priority:'urgent'}),next={...old,L:800,W:500,H:500,weight:15,kind:'carton'};
 const behind=placed(old,1,{x:250,y:250}),front=placed(old,2,{x:4700,y:250,priority:'low'});
 const changed=updateCargo({box:equipment,skus:[old],placements:[behind,front]},[next]);assert.equal(changed.ok,true,changed.reason);
 const items=changed.placements,options={doorMode:'smart',clearance:0,targetId:behind.id},plan=suggestUnloadOrder(items,equipment,[],options);
 assert.equal(plan.complete,true,JSON.stringify(plan.issues));assert.deepEqual(plan.order,[front.id,behind.id]);
 let remaining=items;for(const id of plan.order){
  const item=remaining.find(p=>p.id===id),route=plan.routes[id];assert.ok(route.length>=2);
  for(let i=1;i<route.length;i++){
   assert.equal(segmentIsClear(item,route[i-1],route[i],remaining,equipment),true);
   for(let frame=0;frame<=50;frame++){const t=frame/50,point={...item,...Object.fromEntries(['x','y','z'].map(k=>[k,route[i-1][k]+(route[i][k]-route[i-1][k])*t]))};assert.equal(remaining.some(p=>p.id!==item.id&&intersects(p,point)),false);}
  }
  for(const t of [0,.2,.5,.8,1]){const moved=positionOnRoute(item,route,t,'unload');assert.deepEqual([moved.L,moved.W,moved.H,moved.weight],[item.L,item.W,item.H,item.weight]);}
  remaining=remaining.filter(p=>p.id!==id);audit(remaining,equipment,[next]);
 }
});

test('shipped mixed-specification beta fixture restores eighteen independent units, all sixteen kinds and complete unloading',()=>{
 const fixture=JSON.parse(readFileSync(new URL('../examples/v127-beta-mixed-specs.json',import.meta.url),'utf8'));
 assert.equal(fixture.sampleOnly,true);assert.match(fixture.source,/非厂家规格/);assert.equal(fixture.schemaVersion,3);
 assert.equal(fixture.placements.length,18);assert.equal(new Set(fixture.placements.map(p=>p.kind)).size,16);
 for(const item of fixture.placements){assert.ok(item.cargoSpec);assert.equal(doorOpeningStatus(item,fixture.container,{doorMode:'strict'}).ok,true,item.id);assert.ok(orientations(item.cargoSpec).some(o=>o.L===item.L&&o.W===item.W&&o.H===item.H));}
 const revisions=fixture.placements.filter(p=>p.skuId==='BETA-MIXED');assert.equal(revisions.length,3);assert.equal(new Set(revisions.map(p=>`${p.L}/${p.W}/${p.H}/${p.weight}/${p.kind}`)).size,3);
 const pending=fixture.skus.find(s=>s.id==='BETA-MIXED');assert.equal(pending.qty,4);assert.ok(revisions.every(p=>p.L!==pending.L||p.W!==pending.W||p.H!==pending.H||p.kind!==pending.kind));
 audit(fixture.placements,fixture.container,fixture.skus);
 const options={doorMode:'strict'},plan=suggestUnloadOrder(fixture.placements,fixture.container,[],options);assert.equal(plan.complete,true,JSON.stringify(plan.issues));assert.equal(plan.order.length,18);
 const drop=dropCandidate(pending,fixture.placements,fixture.container,{x:4850,y:2250});assert.equal(drop.ok,true,drop.reason);assert.equal(drop.candidate.ordinal,4);
 const result=verifyDrop(drop.candidate,fixture.placements,fixture.container,fixture.skus);assert.equal(result.ok,true,result.reason);audit(result.placements,fixture.container,fixture.skus);
});

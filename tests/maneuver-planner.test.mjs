import {snapshotPlacement} from '../src/cargo-spec.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {findExtractionPath,positionOnRoute,segmentIsClear} from '../src/maneuver-planner.mjs';
import {suggestUnloadOrder,suggestLoadOrder,unloadingState} from '../src/unloading.mjs';
import {intersects,validate} from '../src/engine.mjs';
import {trainingScenarios as scenarios} from '../src/cargo-scenarios.mjs';

// Deliberately synthetic equipment and packages, mm/kg, not fleet specifications.
const box={id:'CUSTOM',L:6000,W:2400,H:2600,doorW:2000,doorH:2300,payload:20000};
const cargo=(id,x,y,z=0,extra={})=>({id,skuId:id,name:id,kind:'crate',x,y,z,L:800,W:700,H:700,weight:50,stackLimit:3,priority:'normal',...extra});
const smart={doorMode:'smart',clearance:0};
const skusFor=items=>items.map(p=>({id:p.skuId,name:p.name,kind:p.kind,L:p.L,W:p.W,H:p.H,weight:p.weight,qty:1,stackLimit:3,rotate:false}));

function verifyRoute(item,route,obstacles,equipment=box,c=0){
  assert.ok(route.length>1);
  assert.deepEqual(route[0],{x:item.x,y:item.y,z:item.z});
  assert.ok(route.at(-1).x>=equipment.L);
  assert.equal(route.at(-1).z,0);
  for(let i=1;i<route.length;i++){
    assert.equal(segmentIsClear(item,route[i-1],route[i],obstacles,equipment,c),true);
    // Independently sample every segment, including its transition through the
    // door plane. This does not reuse the planner's swept-box predicate.
    for(let frame=0;frame<=80;frame++){
      const t=frame/80,p={...item,...Object.fromEntries(['x','y','z'].map(k=>[k,route[i-1][k]+(route[i][k]-route[i-1][k])*t]))};
      for(const other of obstacles)if(other.id!==item.id)assert.equal(intersects(p,other),false,`${item.id} intersects ${other.id}`);
      assert.ok(p.x>=-1e-5&&p.y>=-1e-5&&p.z>=-1e-5&&p.y+p.W<=equipment.W+1e-5&&p.z+p.H<=equipment.H+1e-5);
      if(p.x+p.L>equipment.L+1e-5){const left=(equipment.W-equipment.doorW)/2;assert.ok(p.y>=left+c-1e-5&&p.y+p.W<=left+equipment.doorW-c+1e-5&&p.z+p.H<=equipment.doorH-c+1e-5);}
    }
  }
}

test('smart aligns a large door-side cargo that strict fixed-axis extraction rejects',()=>{
  const items=[cargo('large-near-door',4700,0,0,{L:1200,W:1500,H:1900}),cargo('rear',200,400)];
  assert.equal(suggestUnloadOrder(items,box,[],{doorMode:'strict'}).complete,false);
  const plan=suggestUnloadOrder(items,box,[],smart);
  assert.equal(plan.complete,true);assert.ok(plan.routes['large-near-door'].some(p=>p.y>0));
  let remaining=[...items];for(const id of plan.order){const p=remaining.find(p=>p.id===id);verifyRoute(p,plan.routes[id],remaining);remaining=remaining.filter(p=>p.id!==id);}
});

test('smart searches a lateral corridor around a tall blocker instead of passing through it',()=>{
  const target=cargo('rear',600,200),front=cargo('front',2600,200,0,{L:1400,H:2200});
  const result=findExtractionPath(target,[target,front],box);
  assert.equal(result.ok,true,result.reason);assert.ok(result.route.some(p=>p.y>=900));
  verifyRoute(target,result.route,[target,front]);
});

test('smart searches upward across a full-width low obstruction and lowers outside',()=>{
  const target=cargo('rear',400,300),obstacle=cargo('low-front',2800,0,0,{W:2400,H:650,L:500});
  const result=findExtractionPath(target,[target,obstacle],box);
  assert.equal(result.ok,true,result.reason);assert.ok(result.route.some(p=>p.z>=650));
  verifyRoute(target,result.route,[target,obstacle]);
});

test('smart cannot lift a tall cargo through insufficient headroom',()=>{
  const target=cargo('tall',400,300,0,{H:2050}),obstacle=cargo('front',2800,0,0,{W:2400,H:650});
  const result=findExtractionPath(target,[target,obstacle],box);assert.equal(result.ok,false);assert.ok(result.reason.includes('未找到'));
});

test('target planning clears the obstructing door-side cargo before the requested rear cargo',()=>{
  const items=[cargo('requested',200,200,0,{H:2200,W:1900}),cargo('blocker',4700,200,0,{H:2200,W:1900})];
  const plan=suggestUnloadOrder(items,box,[],{...smart,targetId:'requested'});
  assert.equal(plan.complete,true);assert.deepEqual(plan.order,['blocker','requested']);
  assert.equal(unloadingState(items,box,[],smart).choices.find(c=>c.id==='requested').ok,false);
});

test('support dependencies outrank urgency even when a lateral extraction route exists',()=>{
  const base=cargo('base',3200,250,0,{priority:'urgent',L:1000,W:900}),top=cargo('top',3200,250,700,{L:700,W:600});
  const items=[base,top],plan=suggestUnloadOrder(items,box,[],smart);
  assert.equal(findExtractionPath(base,items,box).ok,false);assert.deepEqual(plan.order,['top','base']);
  const loading=suggestLoadOrder(items,box,smart);assert.deepEqual(loading.order,['base','top']);
  const loaded=[];for(const id of loading.order){loaded.push(items.find(p=>p.id===id));assert.equal(validate(loaded,box,skusFor(items)).valid,true);}
});

test('a package larger than the measured door never becomes a successful smart route',()=>{
  for(const extra of [{W:2001},{H:2301},{W:1990}]){
    const p=cargo('too-big',1000,200,0,extra);assert.equal(findExtractionPath(p,[p],box,{clearance:10}).ok,false);
  }
});

test('continuous sweep rejects a thin obstacle between clear segment endpoints',()=>{
  const p=cargo('moving',0,300),needle=cargo('thin',2000,300,0,{L:.01});
  assert.equal(segmentIsClear(p,{x:0,y:300,z:0},{x:4000,y:300,z:0},[needle],box),false);
  assert.equal(segmentIsClear(p,{x:0,y:300,z:0},{x:1000,y:400,z:0},[],box),false,'diagonal unverified travel is rejected');
});

test('positive clearance is checked against the door and every obstacle',()=>{
  const p=cargo('cargo',1000,0),obstacle=cargo('nearby',2800,0,0,{W:1000,H:2200});
  const result=findExtractionPath(p,[p,obstacle],box,{clearance:25});assert.equal(result.ok,true,result.reason);verifyRoute(p,result.route,[p,obstacle],box,25);
});

test('configuration-space search turns between staggered high obstacles and reports a bounded search honestly',()=>{
  const p=cargo('rear',500,200),a=cargo('left-obstacle',1800,0,0,{W:1250,H:2300}),b=cargo('right-obstacle',3500,1150,0,{W:1250,H:2300});
  const remaining=[p,a,b],result=findExtractionPath(p,remaining,box,{maxNodes:1});assert.equal(result.ok,false);assert.equal(result.limited,true);assert.match(result.reason,/搜索上限/);
  const full=findExtractionPath(p,remaining,box);assert.equal(full.ok,true,full.reason);assert.ok(full.visited>1);verifyRoute(p,full.route,remaining);
});

test('loading reverses the exact extracted route and playback preserves every dimension',()=>{
  const p=cargo('unit',800,0),path=findExtractionPath(p,[p],box).route,before=structuredClone(p);
  for(let i=0;i<=100;i++){
    const a=positionOnRoute(p,path,i/100,'unload'),b=positionOnRoute(p,path,1-i/100,'load');
    for(const k of ['x','y','z'])assert.ok(Math.abs(a[k]-b[k])<1e-8);
    for(const k of ['L','W','H','weight','skuId'])assert.equal(a[k],p[k]);
  }
  assert.deepEqual(p,before);
});

for(const scenario of scenarios)test(`smart full unload/load: ${scenario.id} preserves geometry at every committed step`,()=>{
  const items=scenario.placements,original=structuredClone(items),equipment=scenario.container;
  const plan=suggestUnloadOrder(items,equipment,[],smart);assert.equal(plan.complete,true,JSON.stringify(plan.issues));
  let remaining=[...items];for(const id of plan.order){const p=remaining.find(p=>p.id===id);verifyRoute(p,plan.routes[id],remaining,equipment);remaining=remaining.filter(p=>p.id!==id);assert.equal(validate(remaining,equipment,scenario.skus).valid,true);}
  const loaded=[],load=suggestLoadOrder(items,equipment,smart);for(const id of load.order){loaded.push(items.find(p=>p.id===id));assert.equal(validate(loaded,equipment,scenario.skus).valid,true);}
  assert.deepEqual(items,original);
});


test('smart cached results are invalidated after in-place cargo or door edits',()=>{
  const target=cargo('mutable',400,100),items=[target];
  assert.equal(suggestUnloadOrder(items,box,[],smart).complete,true);
  target.W=box.doorW+1;
  assert.equal(suggestUnloadOrder(items,box,[],smart).complete,false,'Moved or resized cargo must not reuse a previously clear route');
  target.W=600;
  assert.equal(suggestUnloadOrder(items,box,[],smart).complete,true);
  const changed={...box,doorW:500};
  assert.equal(suggestUnloadOrder(items,changed,[],smart).complete,false,'Door edits invalidate the route');
});

test('segment validation rejects missing geometry and invalid dimensions',()=>{
  const p=cargo('invalid',400,100),a={x:400,y:100,z:0},b={...a,x:500};
  assert.equal(segmentIsClear(null,a,b,[],box),false);
  for(const extra of [{L:0},{W:-1},{H:NaN}])assert.equal(segmentIsClear({...p,...extra},a,b,[],box),false);
  for(const extra of [{L:0},{doorW:box.W+1},{doorH:box.H+1}])assert.equal(segmentIsClear(p,a,b,[],{...box,...extra}),false);
});


test('shipped maneuver sample restores the authored layout and simulated cargo manifest',async()=>{
  const {readFile}=await import('node:fs/promises');
  const {parseDelimited,autoMap,buildImport}=await import('../src/importer.mjs');
  const {getCargoScenario}=await import('../src/cargo-scenarios.mjs');
  const fixture=getCargoScenario('door-blocker-maneuver');
  const json=JSON.parse(await readFile(new URL('../examples/v120-door-blocker-maneuver.json',import.meta.url),'utf8'));
  assert.equal(json.schemaVersion,2);assert.equal(json.version,'1.20');assert.equal(json.sampleOnly,true);
  assert.deepEqual(json.placements.map(p=>snapshotPlacement(p,json.skus.find(s=>s.id===p.skuId))),fixture.placements);assert.deepEqual(json.skus,fixture.skus);
  assert.equal(suggestUnloadOrder(json.placements,json.container,[],smart).complete,true);
  const rows=parseDelimited(await readFile(new URL('../examples/v120-door-blocker-maneuver.csv',import.meta.url),'utf8'));
  const imported=buildImport(rows,autoMap(rows[0]));assert.deepEqual(imported.errors,[]);
  for(const s of fixture.skus){const found=imported.skus.find(x=>x.id===s.id);assert.ok(found);for(const k of ['kind','L','W','H','qty','weight'])assert.equal(found[k],s[k]);}
});

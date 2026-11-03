import test from 'node:test';
import assert from 'node:assert/strict';
import {findExtractionPath,segmentIsClear,routeMetrics,positionOnRoute,routePreferences} from '../src/maneuver-planner.mjs';
import {prioritizeReady,clearanceDependencies} from '../src/priority.mjs';
import {unloadingState,suggestUnloadOrder,suggestLoadOrder} from '../src/unloading.mjs';
import {HELP_TOPICS,searchHelp} from '../src/help-topics.mjs';
import {planningSettings} from '../src/planning-settings.mjs';
import {getCargoScenario} from '../src/cargo-scenarios.mjs';

// Deliberately artificial geometry, not equipment or packaging specifications.
const box={L:5000,W:2400,H:2400,doorW:2200,doorH:2200};
const unit=(id,values={})=>({id,skuId:id,name:id,kind:'carton',x:200,y:1000,z:0,L:600,W:600,H:600,weight:20,priority:'normal',...values});
const target=unit('target',{priority:'urgent'}),lowWall=unit('wall',{x:2000,y:200,L:600,W:1600,H:200});
function verifyContinuous(result,item,items,equipment=box){assert.equal(result.ok,true,result.reason);for(let i=1;i<result.route.length;i++)assert.equal(segmentIsClear(item,result.route[i-1],result.route[i],items,equipment),true,JSON.stringify(result.route));}
function independentlyClear(p,item,obstacles,equipment){
 assert.ok(p.x>=-1e-5&&p.y>=-1e-5&&p.z>=-1e-5&&p.y+item.W<=equipment.W+1e-5&&p.z+item.H<=equipment.H+1e-5);
 for(const b of obstacles.filter(b=>b.id!==item.id))assert.ok(p.x+item.L<=b.x+1e-5||p.x>=b.x+b.L-1e-5||p.y+item.W<=b.y+1e-5||p.y>=b.y+b.W-1e-5||p.z+item.H<=b.z+1e-5||p.z>=b.z+b.H-1e-5);
 if(p.x+item.L>equipment.L+1e-5){const left=(equipment.W-equipment.doorW)/2;assert.ok(p.y>=left-1e-5&&p.y+item.W<=left+equipment.doorW+1e-5&&p.z+item.H<=equipment.doorH+1e-5);}
}

test('path preference compares feasible routes: low lift takes a floor aisle instead of the shorter overhead path',()=>{
 const items=[target,lowWall],distance=findExtractionPath(target,items,box,{policy:'distance'}),floor=findExtractionPath(target,items,box,{policy:'low-lift'});
 verifyContinuous(distance,target,items);verifyContinuous(floor,target,items);
 assert.ok(distance.liftMm>0);assert.equal(floor.liftMm,0);assert.ok(distance.distanceMm<floor.distanceMm);
 for(const r of [distance,floor])for(let i=1;i<r.route.length;i++)for(let t=0;t<=1;t+=.025){const a=r.route[i-1],b=r.route[i];independentlyClear({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t},target,items,box);}
});
test('zero lift still finds a legal horizontal detour using critical obstacle coordinates',()=>{
 const r=findExtractionPath(target,[target,lowWall],box,{maxLift:0});verifyContinuous(r,target,[target,lowWall]);assert.equal(r.peakLiftMm,0);assert.ok(r.route.some(p=>p.y>=1800));
});
test('lift ceiling changes the verdict and cached route state without reusing an unconstrained result',()=>{
 const equipment={...box,doorW:2400},wall=unit('full-width',{x:2000,y:0,L:600,W:2400,H:500}),items=[target,wall];
 const free=unloadingState(items,equipment,[],{doorMode:'smart'}),limited=unloadingState(items,equipment,[],{doorMode:'smart',maxLift:0});
 assert.equal(free.choices.find(c=>c.id==='target').ok,true);assert.equal(limited.choices.find(c=>c.id==='target').ok,false);
 const bounded=findExtractionPath(target,items,equipment,{maxLift:500});verifyContinuous(bounded,target,items,equipment);assert.ok(bounded.peakLiftMm<=500);
 assert.equal(unloadingState(items,equipment,[],{doorMode:'smart'}),free);
});
test('search exhaustion retains a verified incumbent and discloses the search limit',()=>{
 const r=findExtractionPath(target,[target,lowWall],box,{maxNodes:1,policy:'low-lift'});verifyContinuous(r,target,[target,lowWall]);assert.equal(r.searchLimited,true);assert.equal(r.visited,1);
});
test('route metrics measure actual millimetre movement, accumulated lift, peak lift and bends',()=>{
 assert.deepEqual(routeMetrics([{x:0,y:0,z:100},{x:200,y:0,z:100},{x:200,y:0,z:300},{x:200,y:100,z:300},{x:200,y:100,z:0}],{z:100}),{distanceMm:800,liftMm:200,lowerMm:300,turns:3,peakLiftMm:200,segments:4});
});
test('preference normalization distinguishes no limit from zero, and rejects malformed settings',()=>{
 assert.equal(routePreferences({maxLift:0}).maxLift,0);assert.equal(routePreferences({maxLift:''}).maxLift,null);assert.equal(routePreferences({maxLift:-1}).maxLift,null);assert.equal(routePreferences({policy:'unknown'}).policy,'balanced');
});
const row=(id,ok,priority,blockers=[],x=0)=>({id,ok,item:unit(id,{priority,x}),blockers:blockers.map(id=>({id,kind:'path'}))});
test('urgency propagates through a complete chain of prerequisites, before unrelated work',()=>{
 const rows=[row('goal',false,'urgent',['middle']),row('middle',false,'low',['front']),row('front',true,'low'),row('other',true,'high')];
 assert.equal(prioritizeReady(rows)[0].id,'front');assert.ok(clearanceDependencies(rows).get('front').some(r=>r.id==='goal'));
});
test('a user-requested target clears its indirect blockers before unrelated urgent cargo',()=>{
 const rows=[row('goal',false,'low',['middle']),row('middle',false,'low',['front']),row('front',true,'low'),row('other',true,'urgent')];
 assert.equal(prioritizeReady(rows)[0].id,'other');assert.equal(prioritizeReady(rows,{targetId:'goal'})[0].id,'front');
});
test('dependency cycles and door-only blockers cannot turn blocked cargo into removable cargo',()=>{
 const rows=[row('a',false,'urgent',['b','door']),row('b',false,'normal',['a']),row('safe',true,'low')];assert.deepEqual(prioritizeReady(rows).map(r=>r.id),['safe']);assert.equal(clearanceDependencies(rows).get('a').length,1);
});
test('zero-lift full unloading clears a doorway obstruction and reports a reversible plan without mutating input',()=>{
 const equipment={...box,doorW:2400},wall=unit('front',{x:2000,y:0,L:600,W:2400,H:500,priority:'low'}),items=[target,wall],before=JSON.stringify(items),opts={doorMode:'smart',maxLift:0};
 const p=suggestUnloadOrder(items,equipment,[],opts);assert.equal(p.complete,true);assert.deepEqual(p.order,['front','target']);assert.equal(p.decisions.front.kind,'clearance');assert.ok(p.decisions.front.serves.includes('target'));assert.equal(p.metrics.liftMm,0);assert.ok(p.metrics.distanceMm>0);
 assert.deepEqual(suggestLoadOrder(items,equipment,opts).order,[...p.order].reverse());assert.equal(JSON.stringify(items),before);
});
test('plan cache includes route preference and unknown removed ids do not produce false completeness',()=>{
 const items=[target,lowWall],a=suggestUnloadOrder(items,box,[],{doorMode:'smart',policy:'low-lift'}),b=suggestUnloadOrder(items,box,[],{doorMode:'smart',policy:'distance'});
 assert.notEqual(a,b);assert.equal(a.policy,'low-lift');assert.equal(b.policy,'distance');assert.ok(a.metrics.liftMm<=b.metrics.liftMm);
 assert.equal(suggestUnloadOrder(items,box,['missing'],{doorMode:'smart'}).order.length,2);
});
test('both directions follow the same verified path and preserve the original cargo record',()=>{
 const r=findExtractionPath(target,[target,lowWall],box,{policy:'low-lift'}),before=JSON.stringify(target);for(const t of [0,.13,.5,.85,1]){const a=positionOnRoute(target,r.route,t,'unload'),b=positionOnRoute(target,r.route,1-t,'load');for(const key of ['x','y','z'])assert.ok(Math.abs(a[key]-b[key])<1e-7);}
 assert.equal(JSON.stringify(target),before);
});
test('lift preferences never permit removing a support while its child remains',()=>{
 const base=unit('base',{x:400,y:200,z:0,L:800,W:800,H:500}),top=unit('top',{x:400,y:200,z:500,L:500,W:500,H:300});
 for(const policy of ['balanced','low-lift','distance']){const r=findExtractionPath(base,[base,top],box,{policy});assert.equal(r.ok,false);assert.ok(r.blockers.some(b=>b.id==='top'));}
});
test('help catalogue covers twenty real features and searches descriptions as well as titles',()=>{
 assert.equal(HELP_TOPICS.length,20);assert.equal(new Set(HELP_TOPICS.map(t=>t.id)).size,20);for(const t of HELP_TOPICS)assert.ok(t.action&&t.target&&t.tips.length>=2);
 assert.ok(searchHelp('抬升').some(t=>t.id==='planning'));assert.ok(searchHelp('撤销').some(t=>t.id==='precision'));assert.equal(searchHelp('不存在的功能xyz').length,0);
});
test('old plans receive safe defaults; explicit planning settings round-trip without weakening validation',()=>{
 assert.deepEqual(planningSettings(),{doorMode:'smart',clearance:0,policy:'balanced',maxLift:null});
 const settings={doorMode:'smart',clearance:25,policy:'low-lift',maxLift:0};assert.deepEqual(planningSettings(JSON.parse(JSON.stringify(settings))),settings);
 for(const input of [{maxLift:-1},{maxLift:'0'},{maxLift:Infinity},{clearance:-1},{clearance:13},{doorMode:'unsafe'},{policy:'fastest'},null,[]])assert.throws(()=>planningSettings(input));
});
test('interactive route comparison sample visibly distinguishes distance and low-lift preferences',()=>{
 const s=getCargoScenario('route-comparison'),a=suggestUnloadOrder(s.placements,s.container,[],{doorMode:'smart',policy:'distance'}),b=suggestUnloadOrder(s.placements,s.container,[],{doorMode:'smart',policy:'low-lift'});
 assert.equal(a.complete,true);assert.equal(b.complete,true);assert.equal(a.metrics.liftMm,200);assert.equal(b.metrics.liftMm,0);assert.ok(a.metrics.distanceMm<b.metrics.distanceMm);assert.equal(a.order[0],'SIM-COMPARE-URGENT#1');
});
test('reverse-loading statistics report the actual rise from the floor, including cargo stored on another unit',()=>{
 const base=unit('base',{x:400,y:200,z:0,L:800,W:800,H:500}),top=unit('top',{x:400,y:200,z:500,L:500,W:500,H:300}),items=[base,top],opts={doorMode:'smart'};
 const unload=suggestUnloadOrder(items,box,[],opts),load=suggestLoadOrder(items,box,opts);assert.equal(unload.complete,true);assert.equal(load.metrics.liftMm,unload.metrics.lowerMm);assert.ok(load.metrics.liftMm>=500);assert.ok(load.metrics.peakLiftMm>=500);
});

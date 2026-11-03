/**
 * RealLoad — conservative door extraction and ordered maneuver planning.
 * Coordinates: X=0 at far end; X=box.L at the cargo door.
 * Strict mode keeps Y/Z fixed. Smart mode checks sequential axis-aligned
 * translations and lifts without changing the cargo orientation.
 * This DOES NOT model people, forklift size, lifting headroom, slings,
 * bindings, local floor strength or dynamic stability.
 */
import {supportOf} from './engine.mjs';
import {prioritizeReady,priorityIssues,clearanceDependencies,deliveryLabel} from './priority.mjs';
import {findExtractionPath,routeMetrics,routePreferences} from './maneuver-planner.mjs';
const routeStates=new WeakMap(),plans=new WeakMap();
const cacheKey=(box,removed,options)=>`${[box.L,box.W,box.H,box.doorW,box.doorH].join('/')}/${[...removed].sort().join('|')}/${options.doorMode}/${options.clearance||0}/${options.maxNodes||''}/${options.targetId||''}/${routePreferences(options).policy}/${routePreferences(options).maxLift??''}`;
function cached(cache,placements,key,build){
 const fingerprint=placements.map(p=>[p.id,p.x,p.y,p.z,p.L,p.W,p.H,p.kind,p.priority,p.deliveryStop,p.unitCode].join(',')).join(';');
 let bucket=cache.get(placements);if(!bucket||bucket.fingerprint!==fingerprint){bucket={fingerprint,entries:new Map()};cache.set(placements,bucket);}
 const entries=bucket.entries;if(entries.has(key))return entries.get(key);const value=build();if(entries.size>=220)entries.delete(entries.keys().next().value);entries.set(key,value);return value;
}
const EPS=1e-5;
const overlap=(a0,a1,b0,b1)=>a0<b1-EPS && a1>b0+EPS;
const crossSection=(a,b,clearance=0)=>overlap(a.y-clearance,a.y+a.W+clearance,b.y,b.y+b.W)&&overlap(a.z-clearance,a.z+a.H+clearance,b.z,b.z+b.H);
/** Coordinates in millimetres. The door is assumed centered across Y and its
 * usable height is measured from the cargo floor, not from the outside shell.
 * Exact equipment geometry may differ; users must measure the actual door.
 */
export function doorOpeningStatus(item,box,{clearance=0,doorMode='nominal'}={}){
 const c=Number.isFinite(Number(clearance))?Math.max(0,Math.min(200,Number(clearance))):0;
 const strict=doorMode==='strict';
 if(!item||!box||![item.y,item.z,item.W,item.H,box.W,box.doorW,box.doorH].every(Number.isFinite)||box.W<=0||box.doorW<=0||box.doorH<=0||box.doorW>box.W+EPS){return {ok:false,kind:'data',reason:'箱体或货物门洞数据非法，请核对实际内宽与门宽'};}
 const left=(box.W-box.doorW)/2;
 if(item.W+2*c>box.doorW+EPS||item.H+c>box.doorH+EPS){return {ok:false,kind:'door',reason:`包装外廓加 ${c} mm 预留净空后大于门洞宽高`};}
 if(strict&&(item.y<left+c-EPS||item.y+item.W>left+box.doorW-c+EPS||item.z< -EPS||item.z+item.H>box.doorH-c+EPS)){
  return {ok:false,kind:'door-position',reason:`保持原 Y/Z 坐标直线取出无法通过柜门；门洞宽度范围 Y ${left.toFixed(2)}–${(left+box.doorW).toFixed(2)} mm`};
 }
 return {ok:true,clearance:c,doorMode,doorLeft:left,doorRight:left+box.doorW,warning:strict?'仅门洞几何验证，未含叉车/吊具':doorMode==='smart'?'需结合实际绕行路径与净空校验；未验证装卸设备':'只验证尺寸可穿门，需额外横移或调整高度；该动作未模拟'};
}

export function extractionBlockers(item,remaining,box,options={}){
 if(!item || !box)return [{id:'error',kind:'data',reason:'货物或货柜数据不存在'}];
 const blockers=[];
 const aperture=doorOpeningStatus(item,box,options);
 if(!aperture.ok)blockers.push({id:'door',kind:aperture.kind,reason:aperture.reason});
 const clearance=aperture.clearance??(Number(options.clearance)||0);
 // If this item supports another unit, removing it destroys the original
 // static support arrangement, even when the other unit is farther from door.
 for(const p of remaining){
  if(p.id===item.id)continue;
  if(supportOf(p,remaining)?.id===item.id){blockers.push({id:p.id,kind:'support',reason:`${p.id} 仍放在该货物上方`});}
  // As the item's FRONT moves in +X, any occupied Y/Z corridor between its
  // leading face and the door blocks the straight extraction path.
  if(p.x+p.L>item.x+item.L-EPS && p.x<box.L-EPS && crossSection(item,p,clearance)){
   blockers.push({id:p.id,kind:'path',reason:`${p.id} 挡在柜门方向的直线路径上`});
  }
 }
 return [...new Map(blockers.map(b=>[`${b.kind}:${b.id}`,b])).values()];
}

export function unloadingState(placements,box,removedIds=[],options={}){
 const removed=new Set(removedIds),remaining=placements.filter(p=>!removed.has(p.id));
 if(options.doorMode==='smart')return cached(routeStates,placements,cacheKey(box,removed,options),()=>{
  const choices=remaining.map(item=>{
   const path=findExtractionPath(item,remaining,box,options);
   const blockers=path.ok?[]:(path.blockers||[{id:'route',kind:path.limited?'search-limit':'route',reason:path.reason},...extractionBlockers(item,remaining,box,{...options,doorMode:'strict'})]);
   return {id:item.id,item,ok:path.ok,blockers,route:path.route,segments:path.segments,path};
  });
  return {remaining,removed:[...removed],choices,available:choices.filter(c=>c.ok),blocked:choices.filter(c=>!c.ok)};
 });
 const choices=remaining.map(item=>{const blockers=extractionBlockers(item,remaining,box,options);return {id:item.id,item,ok:blockers.length===0,blockers};});
 return {remaining,removed:[...removed],choices,available:choices.filter(c=>c.ok),blocked:choices.filter(c=>!c.ok)};
}

export function unloadOne(placements,box,removedIds,id,options={}){
 const existing=placements.find(p=>p.id===id);if(!existing)return {ok:false,reason:'货物不存在'};
 if(removedIds.includes(id))return {ok:false,reason:'该件已在预演中卸出'};
 const state=unloadingState(placements,box,removedIds,options);
 const selected=state.choices.find(c=>c.id===id);
 if(!selected?.ok)return {ok:false,reason:selected?.blockers?.map(b=>b.reason).join('；')||'当前位置不满足直线卸货约束',blockers:selected?.blockers||[]};
 return {ok:true,removed:[...removedIds,id],route:selected.route};
}

export function suggestUnloadOrder(placements,box,initialRemoved=[],options={}){
 if(options.doorMode==='smart')return cached(plans,placements,cacheKey(box,initialRemoved,options),()=>buildUnloadOrder(placements,box,initialRemoved,options));
 return buildUnloadOrder(placements,box,initialRemoved,options);
}
function buildUnloadOrder(placements,box,initialRemoved,options){
 const removed=[...new Set(initialRemoved)].filter(id=>placements.some(p=>p.id===id)),order=[],issues=[],routes={},routeDetails={},decisions={};
 for(let i=0;i<placements.length;i++){
  const state=unloadingState(placements,box,removed,options);if(!state.remaining.length)break;
  const orderedChoices=prioritizeReady(state.choices,options);
  if(!orderedChoices.length){issues.push(...state.blocked.map(b=>({id:b.id,blockers:b.blockers})));break;}
  const chosen=orderedChoices.find(c=>c.id===options.targetId)||orderedChoices[0];
  const serves=(clearanceDependencies(state.choices).get(chosen.id)||[]).filter(c=>options.targetId?c.id===options.targetId:true);
  decisions[chosen.id]={kind:serves.length?'clearance':'service',serves:serves.map(c=>c.id),reason:serves.length?`先清障，为 ${serves.map(c=>c.item.unitCode||c.id).slice(0,2).join('、')} 留出通道`:`按${deliveryLabel(chosen.item)}安排；同级比较路径代价`};
  order.push(chosen.id);removed.push(chosen.id);
  if(chosen.route){routes[chosen.id]=chosen.route;routeDetails[chosen.id]=chosen.segments;}
 }
 const metrics=Object.entries(routes).reduce((sum,[id,route])=>{const m=routeMetrics(route,placements.find(p=>p.id===id));for(const key of ['distanceMm','liftMm','lowerMm','turns','segments'])sum[key]+=m[key];sum.peakLiftMm=Math.max(sum.peakLiftMm,m.peakLiftMm);return sum;},{distanceMm:0,liftMm:0,lowerMm:0,turns:0,segments:0,peakLiftMm:0});
 metrics.clearanceSteps=Object.values(decisions).filter(d=>d.kind==='clearance').length;
 return {order,routes,routeDetails,decisions,metrics,policy:routePreferences(options).policy,complete:removed.length===placements.length,unresolved:placements.filter(p=>!removed.includes(p.id)).map(p=>p.id),issues,urgentBlocked:priorityIssues(unloadingState(placements,box,initialRemoved,options).choices)};
}

/** Weight centre based on each outer box being internally uniform. Not a verified CoG. */
export function geometricWeightCentre(placements){
 const mass=placements.reduce((n,p)=>n+p.weight,0);
 if(mass<=0)return null;
 return {x:placements.reduce((n,p)=>n+p.weight*(p.x+p.L/2),0)/mass,
 y:placements.reduce((n,p)=>n+p.weight*(p.y+p.W/2),0)/mass,
 z:placements.reduce((n,p)=>n+p.weight*(p.z+p.H/2),0)/mass,weight:mass};
}

/** Reverse a fully (or partially) feasible extraction sequence as a loading
 * suggestion. The path model is reversible only within the same fixed-axis
 * orthogonal geometry assumption; it is NOT a forklift route planner.
 */
export function suggestLoadOrder(placements,box,options={}){
 const unloading=suggestUnloadOrder(placements,box,[],options);
 const metrics=Object.entries(unloading.routes).reduce((sum,[id,route])=>{
  const m=routeMetrics([...route].reverse(),{z:route.at(-1)?.z||0});
  for(const key of ['distanceMm','liftMm','lowerMm','turns','segments'])sum[key]+=m[key];sum.peakLiftMm=Math.max(sum.peakLiftMm,m.peakLiftMm);return sum;
 },{distanceMm:0,liftMm:0,lowerMm:0,turns:0,segments:0,peakLiftMm:0,clearanceSteps:0});
 return {...unloading,metrics,order:[...unloading.order].reverse()};
}

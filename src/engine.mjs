/** RealLoad 0.1. Units: millimetres and kilograms, all placements axis-aligned. */
import {priorityOrder,compareCargoPriority,normalizeDeliveryStop} from './priority.mjs';
import {unitOrdinal,availableUnitId,knownUnitOrdinal,withUnitOrdinals} from './unit-identity.mjs';
import {cargoSpecOf,cargoSpecErrors,snapshotPlacement} from './cargo-spec.mjs';
export const CONTAINERS = Object.freeze({
  '20GP': {id:'20GP',label:'20GP · 20英尺普柜',L:5900,W:2352,H:2395,doorW:2340,doorH:2292,payload:28130,tare:2350,source:'https://www.hapag-lloyd.com/en/services-information/cargo-fleet/container/20-standard.html',verified:'Hapag-Lloyd fleet example'},
  '40GP': {id:'40GP',label:'40GP · 40英尺普柜',L:12032,W:2352,H:2395,doorW:2340,doorH:2292,payload:28750,tare:3750,source:'https://www.hapag-lloyd.com/en/services-information/cargo-fleet/container/40-standard.html',verified:'Hapag-Lloyd fleet example'},
  '40HC': {id:'40HC',label:'40HC · 40英尺高柜',L:12032,W:2350,H:2700,doorW:2340,doorH:2597,payload:28600,tare:3900,source:'https://www.hapag-lloyd.com/en/services-information/cargo-fleet/container/40-standard-high-cube.html',verified:'Hapag-Lloyd fleet example'}
});
export const DEMO_SKUS = [
  {id:'SKU-001',name:'普通瓦楞纸箱 · 演示',kind:'carton',L:600,W:400,H:380,weight:16,qty:36,rotate:true,stackLimit:4},
  {id:'SKU-002',name:'欧洲托盘整托 · 演示',kind:'pallet',L:1200,W:800,H:1150,weight:360,qty:6,rotate:true,stackLimit:1},
  {id:'SKU-003',name:'出口木箱 · 演示',kind:'crate',L:900,W:700,H:850,weight:115,qty:5,rotate:true,stackLimit:1}
];
const EPS=0.00001;
export const volume = a => a.L*a.W*a.H / 1e9;
export const totalVolume = (skus) => skus.reduce((s,a)=>s+volume(a)*a.qty,0);
export const totalWeight = (skus) => skus.reduce((s,a)=>s+a.weight*a.qty,0);
export function positiveInput(sku) {
  return Number.isFinite(sku.L)&&sku.L>0&&Number.isFinite(sku.W)&&sku.W>0&&Number.isFinite(sku.H)&&sku.H>0&&Number.isFinite(sku.weight)&&sku.weight>0&&Number.isInteger(sku.qty)&&sku.qty>=0&&Number.isInteger(sku.stackLimit)&&sku.stackLimit>=1;
}
// Never claim arbitrary nonrectangular packing fits. Only round, equal-diameter barrels
// on the same level may use circular XY cross-section in the narrow-phase check;
// all other combinations retain the conservative rectangular envelope.
export const intersects=(a,b)=>{
 const broad=a.x < b.x+b.L-EPS && a.x+a.L > b.x+EPS && a.y<b.y+b.W-EPS && a.y+a.W>b.y+EPS && a.z<b.z+b.H-EPS && a.z+a.H>b.z+EPS;
 if(!broad)return false;
 const round=p=>['drum','roll','round_pack'].includes(p.kind)&&Math.abs(p.L-p.W)<EPS;
 if(round(a)&&round(b)){
  const dx=a.x+a.L/2-b.x-b.L/2,dy=a.y+a.W/2-b.y-b.W/2;
  return Math.hypot(dx,dy)<(a.L+b.L)/2-EPS;
 }
 return true;
};
export function inside(a,box){return a.x>=-EPS&&a.y>=-EPS&&a.z>=-EPS&&a.x+a.L<=box.L+EPS&&a.y+a.W<=box.W+EPS&&a.z+a.H<=box.H+EPS;}
export function doorFits(a,box){return a.W<=box.doorW+EPS&&a.H<=box.doorH+EPS;}
function footprintContained(a,b){ return a.x>=b.x-EPS && a.y>=b.y-EPS && a.x+a.L<=b.x+b.L+EPS && a.y+a.W<=b.y+b.W+EPS; }
/** Conservative support: one whole rectangular supporting top, no bridging. */
export function supportOf(a,placed){if(a.z<EPS)return null;return placed.find(b=>b&&Number.isFinite(b.z)&&Number.isFinite(b.H)&&Math.abs(b.z+b.H-a.z)<EPS && footprintContained(a,b) && !['drum','roll','round_pack','reel','bundle','irregular','bag','sack'].includes(b.kind))||undefined;}
export function validate(placed,box,skus){
 const issues=[];const skuMap=new Map(skus.map(s=>[s.id,s]));let weight=0;const bySku=Object.create(null);
 // Frozen physical specifications take precedence; legacy records are checked
 // against their SKU. Invalid snapshots are reported, never silently migrated.
 const specOf=p=>cargoSpecOf(p,skuMap.get(p?.skuId));
 const geometry=placed.map(p=>p&&typeof p==='object'?{...p,kind:specOf(p)?.kind}:p);
 const placementIds=new Set(),serials=new Map();
 const depths=new Map();const depthOf=(p,seen=new Set())=>{if(depths.has(p.id))return depths.get(p.id);if(seen.has(p.id))return 9999;seen.add(p.id);const support=supportOf(p,geometry);const depth=p.z<EPS?1:(support?1+depthOf(support,seen):1);depths.set(p.id,depth);return depth;};
 for(const p of placed){
   if(!p || typeof p.id!=='string'||!p.id||placementIds.has(p.id))issues.push({id:p?.id||'unknown',kind:'schema',text:'货物编号缺失或重复'});
   if(p?.id)placementIds.add(p.id);
   if(!p||![p.x,p.y,p.z,p.L,p.W,p.H,p.weight].every(Number.isFinite)||[p.L,p.W,p.H].some(v=>v<=0)||p.weight<0){issues.push({id:p?.id||'unknown',kind:'schema',text:'货物坐标、外尺寸或重量非法'});continue;}
   weight+=p.weight;bySku[p.skuId]=(bySku[p.skuId]||0)+1;
   if(!inside(p,box))issues.push({id:p.id,kind:'boundary',text:`${p.id}: 超出箱体内尺寸`});
   if(!doorFits(p,box))issues.push({id:p.id,kind:'door',text:`${p.id}: 未通过直立/正交柜门净空检查`});
   const sku=skuMap.get(p.skuId),physical=specOf(p),ordinal=knownUnitOrdinal(p);
   if(ordinal===null&&(Object.hasOwn(p,'ordinal')||String(p.id).includes('#')))issues.push({id:p.id,kind:'schema',text:`${p.id}: 单件序号须为正整数`});
   if(ordinal!==null){
    if(!serials.has(p.skuId))serials.set(p.skuId,new Set());
    const seen=serials.get(p.skuId);if(seen.has(ordinal))issues.push({id:p.id,kind:'quantity',text:`${p.id}: 同一 SKU 的第 ${ordinal} 件重复`});seen.add(ordinal);
    if(sku&&ordinal>sku.qty)issues.push({id:p.id,kind:'quantity',text:`${p.id}: 单件序号超出订单数量 ${sku.qty}`});
   }
   const specIssues=p.cargoSpec!==undefined?cargoSpecErrors(p.cargoSpec):[];
   for(const text of specIssues)issues.push({id:p.id,kind:'spec',text:`${p.id}: ${text}`});
   const spec=specIssues.length?sku:physical;
   if(!sku)issues.push({id:p.id,kind:'sku',text:`${p.id}: 找不到货物原始资料`});
   if(p.heading!==undefined&&(!Number.isFinite(p.heading)||![0,90,180,270].includes(p.heading)))issues.push({id:p.id,kind:'heading',text:`${p.id}: 朝向 ${String(p.heading)} 非法，只允许 0、90、180 或 270 度`});
   if(spec&&p.kind!==undefined&&spec.kind!==undefined&&p.kind!==spec.kind)issues.push({id:p.id,kind:'kind',text:`${p.id}: 包装类型 ${String(p.kind)} 与${p.cargoSpec?'单件规格':' SKU '+sku.id}的 ${String(spec.kind)} 不一致`});
   if(spec && !orientations(spec).some(o=>p.L===o.L&&p.W===o.W&&p.H===o.H)) issues.push({id:p.id,kind:'dimension',text:`${p.id}: 位置模型尺寸与原始外包装规格不符`});
   if(spec && p.weight!==spec.weight)issues.push({id:p.id,kind:'weight',text:`${p.id}: 位置模型重量与原始单件数据不一致`});
   if(spec && depthOf(p)>spec.stackLimit) issues.push({id:p.id,kind:'layer',text:`${p.id}: 超出该 SKU 允许层数`});
   const support=p.z>EPS?supportOf(p,geometry):null;
   if(p.z>EPS && !support)issues.push({id:p.id,kind:'support',text:`${p.id}: 下方缺少完整平面支撑`});
   if(support && depthOf(support)>=Number(specOf(support)?.stackLimit??1))issues.push({id:p.id,kind:'layer',text:`${p.id}: 在禁止继续堆叠的货物上方`});
 }
 for(let i=0;i<placed.length;i++)for(let j=i+1;j<placed.length;j++){
   if(geometry[i]&&geometry[j]&&intersects(geometry[i],geometry[j]))issues.push({id:placed[i].id,kind:'collision',text:`${placed[i].id} 与 ${placed[j].id} 发生几何重叠`});
 }
 if(weight>box.payload+EPS)issues.push({id:'container',kind:'weight',text:`总重量 ${weight.toFixed(1)} kg 超出示例箱体载货上限 ${box.payload} kg`});
 for(const sku of skus) if((bySku[sku.id]||0)>sku.qty)issues.push({id:sku.id,kind:'quantity',text:`${sku.id}: 已装件数超过订单数量`});
 const used=placed.reduce((sum,p)=>p&&[p.L,p.W,p.H].every(Number.isFinite)?sum+volume(p):sum,0);
 const center=weight?{
 x:placed.reduce((sum,p)=>p&&Number.isFinite(p.weight)&&Number.isFinite(p.x)&&Number.isFinite(p.L)?sum+p.weight*(p.x+p.L/2):sum,0)/weight,
 y:placed.reduce((sum,p)=>p&&Number.isFinite(p.weight)&&Number.isFinite(p.y)&&Number.isFinite(p.W)?sum+p.weight*(p.y+p.W/2):sum,0)/weight,
 z:placed.reduce((sum,p)=>p&&Number.isFinite(p.weight)&&Number.isFinite(p.z)&&Number.isFinite(p.H)?sum+p.weight*(p.z+p.H/2):sum,0)/weight
 }:null;
 return {issues,valid:issues.length===0,loadedCount:placed.length,weight,used,utilization:used/volume(box)*100,center};
}
export function orientations(s){
 const original=[s.L,s.W,s.H];const sets=[original];
 if(s.rotate)sets.push([s.W,s.L,s.H]);
 if(s.allowTilt){sets.push([s.H,s.W,s.L],[s.L,s.H,s.W]);if(s.rotate)sets.push([s.H,s.L,s.W],[s.W,s.H,s.L]);}
 const seen=new Set();return sets.filter(d=>{const key=d.join('/');if(seen.has(key))return false;seen.add(key);return true;}).map((d,i)=>({L:d[0],W:d[1],H:d[2],rotation:i}));
}
function candidates(placed){
 const points=[{x:0,y:0,z:0}];for(const p of placed){points.push({x:p.x+p.L,y:p.y,z:p.z},{x:p.x,y:p.y+p.W,z:p.z},{x:p.x,y:p.y,z:p.z+p.H});}
 const seen=new Set();return points.filter(p=>{const k=[p.x,p.y,p.z].join('/');if(seen.has(k))return false;seen.add(k);return true;}).sort((a,b)=>a.z-b.z||a.x-b.x||a.y-b.y);
}
function acceptable(p,placed,box,weight){
 if(!inside(p,box)||!doorFits(p,box)||weight+p.weight>box.payload+EPS)return false;
 if(placed.some(q=>intersects(p,q)))return false;
 if(p.z>EPS){const underneath=supportOf(p,placed);if(!underneath)return false;p.stackDepth=underneath.stackDepth+1; if(p.stackDepth>p.stackLimit)return false; if(underneath.stackDepth>=underneath.stackLimit)return false;}
 else p.stackDepth=1;
 return true;
}
/** First feasible extreme-point heuristic. Never claims global optimality or safety certification. */
export function autoPack(skus,box,locked=[],max=180,inventory=null){
 if(!skus.every(positiveInput))throw new Error('货物尺寸、重量、数量或允许层数不合法');
 const source=new Map(skus.map(s=>[s.id,s]));
 const placed=withUnitOrdinals(locked).map(p=>{const spec=cargoSpecOf(p,source.get(p.skuId));return {...p,kind:p.kind??spec?.kind,stackLimit:spec?.stackLimit};});const initial=validate(placed,box,skus);
 if(!initial.valid)throw new Error('锁定货物存在越界、重叠或其他已知几何问题，请先修正');
 const depth=p=>{const below=p.z>EPS?supportOf(p,placed):null;return below?depth(below)+1:1;};
 for(const p of placed)p.stackDepth=depth(p);
 let weight=initial.weight;
 const all=[];let truncated=false;
 if(inventory){all.push(...inventory.slice(0,max));truncated=inventory.length>max;}
 else for(const sku of [...skus].sort(compareCargoPriority)){
  const used=new Set(placed.filter(p=>p.skuId===sku.id).map(unitOrdinal));
  for(let ordinal=1;ordinal<=sku.qty;ordinal++){if(used.has(ordinal))continue;if(all.length>=max){truncated=true;break;}all.push({sku,ordinal});}
  if(truncated)break;
 }
 all.sort((a,b)=>compareCargoPriority(a.sku,b.sku)||(b.sku.weight-a.sku.weight)||((b.sku.L*b.sku.W*b.sku.H)-(a.sku.L*a.sku.W*a.sku.H))||a.sku.id.localeCompare(b.sku.id));
 const unplaced=[],reserved=[...placed,...all.flatMap(a=>a.record?[a.record]:[])];
 const choices=a=>{const options=orientations(a.sku);if(!a.record)return options;return options.sort((x,y)=>Number(['L','W','H'].every(k=>y[k]===a.record[k]))-Number(['L','W','H'].every(k=>x[k]===a.record[k])));};
 const heading=(p,o)=>['L','W','H'].every(k=>p[k]===o[k])?(p.heading??(p.rotation===1?90:0)):(p.L===o.W&&p.W===o.L&&p.H===o.H?((p.heading??0)+90)%360:0);
 const candidate=(a,o,position)=>a.record?{...a.record,kind:a.record.kind??a.sku.kind,stackLimit:a.sku.stackLimit,...position,...o,heading:heading(a.record,o),locked:false}:{id:availableUnitId(a.sku.id,a.ordinal,[...reserved,...placed]),ordinal:a.ordinal,skuId:a.sku.id,name:a.sku.name,kind:a.sku.kind,weight:a.sku.weight,stackLimit:a.sku.stackLimit,cargoSpec:snapshotPlacement({},a.sku).cargoSpec,locked:false,...position,...o,heading:o.L===a.sku.W&&o.W===a.sku.L&&o.H===a.sku.H&&a.sku.L!==a.sku.W?90:0};
 for(const a of all){let found=null;
  if(priorityOrder(a.sku.priority)<=1||normalizeDeliveryStop(a.sku.deliveryStop)){
   // Earliest-unload units try door-accessible floor extreme points first.
   // Each candidate is still subjected to full geometry/weight/support checks.
   for(const o of choices(a)){
    const doorLeft=Math.max(0,(box.W-box.doorW)/2);
    const xTargets=[box.L-o.L,...placed.map(p=>p.x-o.L)].filter(x=>x>=0 && x+o.L<=box.L).sort((x,y)=>y-x);
    const yTargets=[doorLeft,Math.max(doorLeft,(box.W-o.W)/2),box.W-doorLeft-o.W,
      ...placed.flatMap(p=>[p.y+p.W,p.y-o.W])].filter(y=>y>=doorLeft-1e-5 && y+o.W<=box.W-doorLeft+1e-5);
    for(const x of [...new Set(xTargets)]){
     for(const y of [...new Set(yTargets)]){
      const test=candidate(a,o,{x,y,z:0});
      if(acceptable(test,placed,box,weight)){found=test;break;}
     }
     if(found)break;
    }
    if(found)break;
   }
  }
  if(!found)for(const point of candidates(placed)){
   for(const o of choices(a)){
    const test=candidate(a,o,{x:point.x,y:point.y,z:point.z});
    if(acceptable(test,placed,box,weight)){found=test;break;}
   }
   if(found)break;
  }
  if(found){placed.push(found);weight+=found.weight;}else unplaced.push({skuId:a.sku.id,ordinal:a.ordinal,...(a.record?{id:a.record.id}:{}),reason:'当前启发式未找到符合已知几何和基础限制的放置位置'});
 }
 // Cached support information is solver-local. A locked unit is returned exactly
 // as supplied, including legacy records without stackDepth/stackLimit caches.
 const originals=new Map(locked.map(p=>[p.id,p]));
 const output=placed.map(p=>originals.has(p.id)?{...originals.get(p.id)}:p);
 return {placements:output,unplaced,truncated,validation:validate(output,box,skus)};
}
export function modifyPlacement(placements,id,patch,box,skus){
 const p=placements.find(x=>x.id===id);if(!p)return {ok:false,reason:'货物不存在'};
 const next=placements.map(a=>a.id===id?{...a,...patch}:a);
 // Stack depths must be recomputed in an exhaustive production solver; here prevent manual lifting into unsupported states.
 const check=validate(next,box,skus);
 if(check.valid){const sorted=[...next].sort((a,b)=>a.z-b.z);for(const a of sorted){const below=a.z>EPS?supportOf(a,sorted):null;a.stackDepth=below?(below.stackDepth||1)+1:1;}}
 return {ok:check.valid,issues:check.issues,placements:next};
}

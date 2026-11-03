/** Interactive placement, in mm. Draft geometry never replaces the applied plan. */
import {supportOf,validate} from './engine.mjs';
import {cargoSpecOf} from './cargo-spec.mjs';

const axes=['x','y','z'];
const fields=[...axes,'L','W','H','heading','rotation'];
const precise=n=>Math.round(n*10000)/10000;
function stackDepths(placements,skus){
 const bySku=new Map(skus.map(s=>[s.id,s]));
 const next=placements.map(p=>({...p})),geometry=next.map(p=>({...p,kind:cargoSpecOf(p,bySku.get(p.skuId))?.kind})),depths=new Map();
 const depth=p=>{if(depths.has(p.id))return depths.get(p.id);const below=supportOf(p,geometry),value=below?depth(below)+1:1;depths.set(p.id,value);return value;};
 for(const p of next)p.stackDepth=depth(geometry.find(g=>g.id===p.id));return next;
}
export function draftPlacements(placements,patches={}){
 return placements.map(p=>{
  const patch=patches?.[p.id];if(!patch||typeof patch!=='object')return p;
  const safe=Object.fromEntries(fields.filter(k=>Number.isFinite(patch[k])).map(k=>[k,patch[k]]));
  return {...p,...safe};
 });
}
export function placementPatches(base,next){
 const byId=new Map(next.map(p=>[p.id,p]));
 return Object.fromEntries(base.flatMap(p=>{
  const n=byId.get(p.id);if(!n)return [];
  const patch=Object.fromEntries(fields.filter(k=>Number.isFinite(n[k])&&Math.abs(n[k]-(p[k]??0))>1e-5).map(k=>[k,n[k]]));
  return Object.keys(patch).length?[[p.id,patch]]:[];
 }));
}
/** Include the support chain above the selected cargo, using each unit's geometry. */
export function supportedSelection(placements,ids,skus){
 const bySku=new Map(skus.map(s=>[s.id,s]));
 const geometry=placements.map(p=>({...p,kind:cargoSpecOf(p,bySku.get(p.skuId))?.kind}));
 const chosen=new Set(ids.filter(id=>placements.some(p=>p.id===id)));
 let added=true;while(added){added=false;for(const p of geometry){if(chosen.has(p.id)||p.z<=0)continue;const below=supportOf(p,geometry);if(below&&chosen.has(below.id)){chosen.add(p.id);added=true;}}}
 return placements.filter(p=>chosen.has(p.id)).map(p=>p.id);
}
export function previewFreeMove(placements,id,target,box,skus,ids=[id],{draft=false,autoDrop=true}={}){
 const original=placements.find(p=>p.id===id),chosen=new Set(ids.includes(id)?ids:[id]);
 if(!original||[...chosen].some(id=>!placements.some(p=>p.id===id)))return {ok:false,reason:'选区包含不存在的货物'};
 if(placements.some(p=>chosen.has(p.id)&&p.locked))return {ok:false,reason:'选区中有锁定货物，请先解锁，或关闭联动上方货物'};
 const dest=Object.fromEntries(axes.map(k=>[k,target[k]??original[k]]));
 if(!axes.every(k=>Number.isFinite(dest[k])))return {ok:false,reason:'坐标必须是有限数值'};
 const delta=Object.fromEntries(axes.map(k=>[k,dest[k]-original[k]]));
 const at=z=>placements.map(p=>chosen.has(p.id)?{...p,x:precise(p.x+delta.x),y:precise(p.y+delta.y),z:precise(p.z+z-original.z)}:p);
 const result=(next,position)=>{const check=validate(next,box,skus);return {ok:check.valid||draft,valid:check.valid,draft,placements:check.valid?stackDepths(next,skus):next,position,issues:check.issues,reason:check.issues[0]?.text||null};};
 if(draft||!autoDrop)return result(at(dest.z),dest);
 const minZ=Math.min(...placements.filter(p=>chosen.has(p.id)).map(p=>p.z));
 // Lowest complete support wins. Never keep an obsolete shelf height after XY movement.
 const heights=[0,...placements.filter(p=>!chosen.has(p.id)).map(p=>p.z+p.H)];
 let rejected=null;
 for(const floor of [...new Set(heights)].sort((a,b)=>a-b)){
  const z=precise(original.z-minZ+floor),next=at(z),r=result(next,{...dest,z});
  if(r.valid)return {...r,landed:true};
  rejected??=r;
 }
 const above=supportedSelection(placements,[...chosen],skus).filter(id=>!chosen.has(id));
 const raw=result(at(dest.z),dest);
 return {...raw,ok:false,valid:false,reason:above.length?`上方 ${above.length} 件货物依赖选区支撑。开启「联动上方」一起移动，或使用自由草稿。`:(rejected?.reason||raw.reason||'此处没有可用的地板或完整支撑面。可切换自由草稿继续调整。')};
}
export function checkDraft(base,patches,box,skus){
 const placements=draftPlacements(base,patches),check=validate(placements,box,skus);
 const changed=placements.filter((p,i)=>fields.some(k=>Math.abs((p[k]??0)-(base[i][k]??0))>1e-5));
 const locked=changed.find(p=>base.find(b=>b.id===p.id)?.locked);
 const issues=locked?[{id:locked.id,kind:'locked',text:`${locked.id}: 已锁定，请先解锁再应用草稿`},...check.issues]:check.issues;
 return {...check,valid:!issues.length,ok:!issues.length,issues,placements:!issues.length?stackDepths(placements,skus):placements,changed:changed.length};
}

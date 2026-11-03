/** Group changes are metadata-only. Source carton labels stay unchanged. */
import {groupKey,makeNumbering,unitNumber} from './manifest.mjs';
const clean=s=>String(s??'').trim();
export function groupNames(skus){return [...new Set(skus.map(s=>groupKey(s)))].filter(Boolean).sort((a,b)=>a.localeCompare(b,'zh-CN'));}
export function loadedGroupIds(placements,skus,group){const map=new Map(skus.map(s=>[s.id,groupKey(s)]));return placements.filter(p=>map.get(p.skuId)===group).map(p=>p.id);}
export function assignSkuGroup(skus,ids,target){const name=clean(target);if(!name||name.length>80)return {ok:false,reason:'请输入不超过 80 字的目标组别'};
 const selected=new Set(ids),found=new Set(skus.filter(s=>selected.has(s.id)).map(s=>s.id));if(!found.size||found.size!==selected.size)return {ok:false,reason:'请先选择有效 SKU'};
 const updated=skus.map(s=>{if(!found.has(s.id))return s;const next={...s,groupId:name};if(!s.numbering||s.numbering.source!=='source-provided'){next.numbering=makeNumbering({quantity:s.qty,group:name,code:s.id,kind:s.kind});next.unitCodePreview=unitNumber(next,1);}return next;});return {ok:true,skus:updated};}
export function renameGroup(skus,source,target){const old=clean(source);if(!old)return {ok:false,reason:'请选择组别'};const members=skus.filter(s=>groupKey(s)===old).map(s=>s.id);if(!members.length)return {ok:false,reason:'组别已不存在'};return assignSkuGroup(skus,members,target);}

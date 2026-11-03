/** A placed handling unit owns its physical specification. SKU rows are only
 * templates for future units; logistics metadata can still be edited by SKU.
 * Measurements remain millimetres and kilograms, never rendering dimensions.
 */
import {unitOrdinal,withUnitOrdinals} from './unit-identity.mjs';

export const PHYSICAL_KINDS=Object.freeze(['carton','crate','pallet','board','ibc','drum','bag','roll','plastic_crate','sack','machine','reel','bundle','coolbox','round_pack','irregular']);

export function captureCargoSpec(sku) {
  return {version:1,L:sku.L,W:sku.W,H:sku.H,weight:sku.weight,
    kind:sku.kind||'carton',rotate:!!sku.rotate,allowTilt:!!sku.allowTilt,stackLimit:sku.stackLimit};
}
export function cargoSpecOf(placement,sku) {
  return placement?.cargoSpec !== undefined ? placement.cargoSpec : sku;
}
export function cargoSpecErrors(spec) {
  if(!spec||typeof spec!=='object'||Array.isArray(spec))return ['单件规格格式错误'];
  const errors=[];
  if(spec.version!==1)errors.push('单件规格版本不支持');
  if(!['L','W','H','weight'].every(k=>Number.isFinite(spec[k])&&spec[k]>0))errors.push('单件规格尺寸或毛重非法');
  if(!Number.isSafeInteger(spec.stackLimit)||spec.stackLimit<1)errors.push('单件规格堆码层数非法');
  if(!PHYSICAL_KINDS.includes(spec.kind))errors.push('单件规格包装类型非法');
  if(typeof spec.rotate!=='boolean'||typeof spec.allowTilt!=='boolean')errors.push('单件规格旋转权限非法');
  return errors;
}
export function snapshotPlacement(placement,sku) {
  if(placement.cargoSpec===undefined&&!sku)return {...placement};
  return {...placement,cargoSpec:placement.cargoSpec!==undefined?placement.cargoSpec:captureCargoSpec(sku)};
}
export function differsFromTemplate(placement,sku) {
  if(!sku)return false;
  const spec=cargoSpecOf(placement,sku),current=captureCargoSpec(sku);
  return Object.keys(current).some(k=>spec?.[k]!==current[k]);
}

/** Explicit packing inventory keeps every existing unit, including different
 * revisions of one SKU. The limit applies only to newly requested stock.
 */
export function packingInventory(skus,placements,{includeRemaining=true,maxNew=180}={}) {
  const normalized=withUnitOrdinals(placements),bySku=new Map(skus.map(s=>[s.id,s]));
  const units=normalized.filter(p=>!p.locked).map(p=>{
    const sku=bySku.get(p.skuId);
    if(!sku)throw Error(`${p.id}: 缺少货物资料，不能重排`);
    return {sku:{...sku,...cargoSpecOf(p,sku),id:sku.id,name:p.name??sku.name},ordinal:unitOrdinal(p),record:snapshotPlacement(p,sku)};
  });
  let added=0,truncated=false;
  if(includeRemaining)for(const sku of skus){
    const used=new Set(normalized.filter(p=>p.skuId===sku.id).map(unitOrdinal));
    for(let ordinal=1;ordinal<=sku.qty;ordinal++){
      if(used.has(ordinal))continue;
      if(added>=maxNew){truncated=true;break;}
      units.push({sku,ordinal});added++;
    }
  }
  return {units,truncated};
}

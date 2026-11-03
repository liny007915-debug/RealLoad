/** Stable physical records are independent of the editable SKU code. */
const validOrdinal=value=>Number.isSafeInteger(value)&&value>0;

/** A declared serial is authoritative, including malformed values. Only legacy
 * records with no declared serial may derive one from a trailing #integer.
 */
export function knownUnitOrdinal(p){
 if(!p||typeof p!=='object')return null;
 if(Object.hasOwn(p,'ordinal'))return validOrdinal(p.ordinal)?p.ordinal:null;
 const match=typeof p.id==='string'?p.id.match(/#(\d+)$/):null;
 const value=match&&match.index+match[0].length===p.id.length?Number(match[1]):NaN;
 return validOrdinal(value)?value:null;
}

/** Migrate legacy source IDs without guessing from numeric-looking IDs or
 * repairing declared invalid/duplicate serials. Reserve every known serial
 * before allocating gaps so input order cannot steal a later record's number.
 */
export function withUnitOrdinals(placements){
 const usedBySku=new Map(),nextBySku=new Map();
 for(const p of placements){
  const ordinal=knownUnitOrdinal(p);if(ordinal===null)continue;
  if(!usedBySku.has(p.skuId))usedBySku.set(p.skuId,new Set());
  usedBySku.get(p.skuId).add(ordinal);
 }
 return placements.map(p=>{
  if(!p||typeof p!=='object'||Array.isArray(p)||Object.hasOwn(p,'ordinal')||typeof p.id!=='string'||p.id.includes('#'))return p;
  if(!usedBySku.has(p.skuId))usedBySku.set(p.skuId,new Set());
  const used=usedBySku.get(p.skuId);let ordinal=nextBySku.get(p.skuId)||1;
  while(used.has(ordinal))ordinal++;
  used.add(ordinal);nextBySku.set(p.skuId,ordinal+1);return {...p,ordinal};
 });
}

export function unitOrdinal(p){
 if(Number.isSafeInteger(p.ordinal)&&p.ordinal>0)return p.ordinal;
 const value=Number(String(p.id).split('#').at(-1));
 return Number.isSafeInteger(value)&&value>0?value:1;
}
export function availableUnitId(skuId,ordinal,placements){
 const ids=new Set(placements.map(p=>p.id));let prefix=skuId,variant=1;
 while(ids.has(`${prefix}#${ordinal}`))prefix=`${skuId}~${++variant}`;
 return `${prefix}#${ordinal}`;
}

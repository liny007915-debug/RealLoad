/** Shipping-unit identification helpers. Local planned IDs are NOT GS1 SSCC. */
import {unitOrdinal} from './unit-identity.mjs';
export const clean = value => String(value??'').trim();
export function groupKey(sku){return clean(sku.groupId)||clean(sku.orderNo)||'未分组';}
export function makeNumbering({external='',quantity=1,group='未分组',code='SKU',kind='carton'}={}){
 const raw=clean(external); if(!Number.isSafeInteger(quantity)||quantity<1)throw Error('数量必须是正整数');
 if(raw){
   const m=raw.match(/^(.+?)(\d+)\s*(?:~|～|至|\.\.)\s*(.+?)(\d+)$/);
   if(m){const [,head,start,tail,end]=m;if(head!==tail||start.length!==end.length)throw Error(`箱号范围前缀或补零宽度不同：${raw}`);
     const a=Number(start),b=Number(end);if(b<a||b-a+1!==quantity)throw Error(`箱号范围 ${raw} 与数量 ${quantity} 不匹配`);
     return {mode:'range',prefix:head,start:a,width:start.length,source:'source-provided'};
   }
   if(quantity!==1)throw Error(`箱号 ${raw} 只标识单件，但数量是 ${quantity}；请填写编号范围或留空自动生成规划编号`);
   return {mode:'single',code:raw,source:'source-provided'};
 }
 const safe=v=>(clean(v)||'X').replace(/[^\p{L}\p{N}_-]/gu,'-').slice(0,28);
 return {mode:'planned',prefix:`PLAN-${safe(group)}-${safe(code)}-${({pallet:'P',carton:'C',crate:'CR',board:'BD',ibc:'IBC',drum:'DR',bag:'BG',roll:'RL',plastic_crate:'PC',sack:'SK',machine:'MC',reel:'RE',bundle:'BU',coolbox:'CB'}[kind]||'U')}-`,width:Math.max(3,String(quantity).length),source:'system-planned'};
}
export function unitNumber(sku,ordinal){if(!Number.isSafeInteger(ordinal)||ordinal<1||ordinal>sku.qty)return '';
 const n=sku.numbering||makeNumbering({external:sku.kind==='pallet'?sku.palletNo:sku.cartonNo,quantity:sku.qty,group:groupKey(sku),code:sku.skuCode||sku.id,kind:sku.kind});
 if(n.mode==='single')return n.code;
 if(n.mode==='range')return n.prefix+String(n.start+ordinal-1).padStart(n.width,'0');
 return n.prefix+String(ordinal).padStart(n.width,'0');
}
export function groupSummary(skus,placements=[]){const counts=new Map();for(const s of skus){const id=groupKey(s),c=counts.get(id)||{id,skus:[],quantity:0,loaded:0,weight:0,orders:new Set()};c.skus.push(s);c.quantity+=s.qty;c.weight+=s.weight*s.qty;if(s.orderNo)c.orders.add(s.orderNo);counts.set(id,c);}for(const p of placements){const s=skus.find(s=>s.id===p.skuId);if(s){const g=counts.get(groupKey(s));if(g){g.loaded++;g.weight+=p.weight-s.weight;}}}return [...counts.values()].map(c=>({...c,orders:[...c.orders] }));}
import {normalizePriority,normalizeDeliveryStop} from './priority.mjs';
export function decoratePlacements(placements,skus){const by=new Map(skus.map(s=>[s.id,s]));return placements.map(p=>{const sku=by.get(p.skuId);if(!sku)return p;const ord=unitOrdinal(p);const {deliveryStop:previousStop,...base}=p,stop=normalizeDeliveryStop(sku.deliveryStop);return {...base,groupId:groupKey(sku),orderNo:sku.orderNo||'',batchNo:sku.batchNo||'',skuCode:sku.skuCode||sku.id,unitCode:unitNumber(sku,ord),unitCodeSource:sku.numbering?.source||'system-planned',palletNo:sku.palletNo||'',destination:sku.destination||'',priority:normalizePriority(sku.priority)||'normal',...(stop?{deliveryStop:stop}:{})}});}

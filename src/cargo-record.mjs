/** Validate untrusted catalogue records before they reach rendering/numbering.
 * This checks the data contract, not the accuracy of supplied measurements.
 */
import {positiveInput} from './engine.mjs';
import {PHYSICAL_KINDS} from './cargo-spec.mjs';
import {normalizePriority,normalizeDeliveryStop} from './priority.mjs';
import {makeNumbering,groupKey} from './manifest.mjs';

const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const text=value=>typeof value==='string';
const nonempty=value=>text(value)&&value.trim().length>0;
const strings=['name','skuCode','orderNo','groupId','cartonNo','palletNo','batchNo','destination','unitCodePreview','importSource','notes'];

function validNumbering(numbering,quantity){
 if(numbering===undefined||numbering===null)return true;
 if(!record(numbering)||!['single','range','planned'].includes(numbering.mode))return false;
 if(numbering.source!==undefined&&!['source-provided','system-planned'].includes(numbering.source))return false;
 if(numbering.mode==='single')return nonempty(numbering.code)&&quantity<=1;
 if(!nonempty(numbering.prefix)||!Number.isSafeInteger(numbering.width)||numbering.width<1||numbering.width>128)return false;
 if(numbering.mode==='range'&&(!Number.isSafeInteger(numbering.start)||numbering.start<0||numbering.start>Number.MAX_SAFE_INTEGER-Math.max(0,quantity-1)))return false;
 return true;
}

export function validCargoRecord(item){
 if(!record(item)||!nonempty(item.id)||!positiveInput(item)||!Number.isSafeInteger(item.qty)||!Number.isSafeInteger(item.stackLimit))return false;
 if(item.kind!==undefined&&!PHYSICAL_KINDS.includes(item.kind))return false;
 if(strings.some(key=>item[key]!==undefined&&!text(item[key])))return false;
 if(['rotate','allowTilt','sampleOnly'].some(key=>item[key]!==undefined&&typeof item[key]!=='boolean'))return false;
 if(item.priority!==undefined&&(!text(item.priority)||normalizePriority(item.priority)===null))return false;
 if(item.deliveryStop!==undefined&&item.deliveryStop!==null&&item.deliveryStop!==''&&(!['string','number'].includes(typeof item.deliveryStop)||normalizeDeliveryStop(item.deliveryStop)===null))return false;
 try{
  const numbering=item.numbering||(item.qty>0?makeNumbering({external:item.kind==='pallet'?item.palletNo:item.cartonNo,quantity:item.qty,group:groupKey(item),code:item.skuCode||item.id,kind:item.kind}):undefined);
  return validNumbering(numbering,item.qty);
 }catch{return false;}
}

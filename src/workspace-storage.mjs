/** Recoverable local drafts. A damaged draft must never be replaced by a demo
 * just because parsing failed or a browser storage limit was reached.
 */
import {auditContainerSpec} from './dimension-audit.mjs';
import {validCargoRecord} from './cargo-record.mjs';

export const WORKSPACE_KEY='realload-v117';
export const RECOVERY_KEY='realload-recovery-v127';
const keys=[WORKSPACE_KEY,'realload-v116','realload-v115','realload-v114','realload-v113','realload-v112','realload-v110','realload-v19','realload-v18','realload-v13','realload-v10','realload-v09','realload-v08','realload-v07','realload-v06','realload-v05'];
export function workspaceShapeError(data) {
  if(!data||typeof data!=='object'||Array.isArray(data))return '方案格式不是对象';
  if(!auditContainerSpec(data.box).ok)return '箱体参数不完整或非法';
  if(!Array.isArray(data.skus)||!data.skus.every(validCargoRecord)||new Set(data.skus.map(s=>s.id)).size!==data.skus.length)return '货物清单不完整、编号重复或编号设置非法';
  if(!Array.isArray(data.placements)||!data.placements.every(p=>p&&typeof p==='object'&&typeof p.id==='string'&&typeof p.skuId==='string'&&['x','y','z','L','W','H','weight'].every(k=>Number.isFinite(p[k]))))return '已装实物记录不完整';
  return null;
}

const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value:{};
const numeric=value=>typeof value==='number'?value:typeof value==='string'&&value.trim()?Number(value):NaN;
const choose=(value,choices,fallback)=>choices.includes(value)?value:fallback;
const finite=(value,fallback,{min=-Infinity,max=Infinity,integer=false}={})=>{const n=numeric(value);return Number.isFinite(n)&&n>=min&&n<=max&&(!integer||Number.isSafeInteger(n))?n:fallback;};

/** Bad display preferences are reset independently; valid cargo is retained. */
export function normalizeWorkspacePreferences(data,defaults){
 const source=object(data),base=object(defaults),prefs=object(source.opts),baseOpts=object(base.opts),opts={...baseOpts};
 for(const key of ['pbr','axes','coords','tags','grid','walls','dimensions'])if(typeof prefs[key]==='boolean')opts[key]=prefs[key];
 opts.wallOpacity=finite(prefs.wallOpacity,finite(baseOpts.wallOpacity,.35,{min:0,max:1}),{min:0,max:1});
 opts.doorAngle=finite(prefs.doorAngle,finite(baseOpts.doorAngle,112,{min:0,max:150}),{min:0,max:150});
 opts.coordsScope=choose(prefs.coordsScope,['selected','all'],choose(baseOpts.coordsScope,['selected','all'],'selected'));
 opts.containerView=choose(prefs.containerView,['complete','cutaway'],choose(baseOpts.containerView,['complete','cutaway'],'complete'));
 const quote={...object(base.quote)},rates=object(source.quote);
 for(const key of ['base','origin','destination','perCbm','perKg'])if(Object.hasOwn(rates,key)||Object.hasOwn(quote,key))quote[key]=finite(rates[key],finite(quote[key],0,{min:0}),{min:0});
 quote.currency=choose(rates.currency,['USD','CNY','JPY'],choose(quote.currency,['USD','CNY','JPY'],'USD'));
 const result={opts,quote,mode:choose(source.mode,['iso','top','door','side','multi'],base.mode||'iso'),section:choose(source.section,['cargo','free','unload','edit','container','quote'],base.section||'cargo'),
  precision:finite(source.precision,finite(base.precision,2,{min:0,max:4,integer:true}),{min:0,max:4,integer:true}),
  closedGroups:Array.isArray(source.closedGroups)?[...new Set(source.closedGroups.filter(value=>typeof value==='string'))]:[],
  snap:finite(source.snap,finite(base.snap,25,{min:Number.MIN_VALUE}),{min:Number.MIN_VALUE}),freeStep:finite(source.freeStep,finite(base.freeStep,25,{min:Number.MIN_VALUE}),{min:Number.MIN_VALUE}),
  editAxis:choose(source.editAxis,['free','x','y','z'],choose(base.editAxis,['free','x','y','z'],'free')),
  step:source.step===null||source.step===undefined?null:finite(source.step,null,{min:0,max:source.placements?.length||0,integer:true}),
  project:typeof source.project==='string'&&source.project.trim()?source.project.trim().slice(0,100):typeof base.project==='string'?base.project:'未命名装柜方案',
  groupFilter:typeof source.groupFilter==='string'?source.groupFilter:'all',
  selected:typeof source.selected==='string'?source.selected:null,selectedSku:typeof source.selectedSku==='string'?source.selectedSku:(source.skus?.[0]?.id??base.selectedSku??null),
  freeDraft:object(source.freeDraft)};
 for(const key of ['collapsed','locatorCollapsed','freeSmartStack','freeMagnet','freeLinkStack','touchMove'])result[key]=typeof source[key]==='boolean'?source[key]:typeof base[key]==='boolean'?base[key]:key==='freeLinkStack';
 for(const key of ['locateQuery','loadedQuery','unloadQuery'])result[key]=typeof source[key]==='string'?source[key]:'';
 for(const key of ['freeSelection','unloadRemoved'])result[key]=Array.isArray(source[key])?source[key].filter(value=>typeof value==='string'):[];
 const box=object(source.box);result.box={...box,id:typeof box.id==='string'&&box.id?box.id:'CUSTOM',label:typeof box.label==='string'?box.label:'自定义箱体',verified:typeof box.verified==='string'?box.verified:'User supplied',source:typeof box.source==='string'?box.source:''};
 return result;
}

export function readWorkspace(storage,defaults) {
  let raw,sourceKey;
  try {
    for(const key of keys){const value=storage.getItem(key);if(value&&value!=='null'){raw=value;sourceKey=key;break;}}
    if(!raw)return {state:defaults,recovery:null};
    const data=JSON.parse(raw),error=workspaceShapeError(data);
    if(error)throw Error(error);
    return {state:{...defaults,...data,...normalizeWorkspacePreferences(data,defaults)},recovery:null};
  }catch(error){
    if(!raw)return {state:defaults,recovery:null,storageError:error.message};
    const recovery={sourceKey,raw,error:error.message,savedAt:new Date().toISOString()};
    try{storage.setItem(RECOVERY_KEY,JSON.stringify(recovery));}catch{}
    return {state:defaults,recovery};
  }
}

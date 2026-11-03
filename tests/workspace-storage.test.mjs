import test from 'node:test';
import assert from 'node:assert/strict';
import {readWorkspace,WORKSPACE_KEY,RECOVERY_KEY,workspaceShapeError} from '../src/workspace-storage.mjs';
import {CONTAINERS} from '../src/engine.mjs';
import {validCargoRecord} from '../src/cargo-record.mjs';
import {makeNumbering,unitNumber} from '../src/manifest.mjs';
import {quoteEstimate} from '../src/quote.mjs';
const defaults=()=>({box:{...CONTAINERS['20GP']},skus:[],placements:[],opts:{pbr:true},quote:{base:0,currency:'USD'},mode:'iso',section:'cargo'});
function memory(entries={}){const values=new Map(Object.entries(entries));return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),values};}
test('empty and legacy local workspaces restore without changing their raw records',()=>{
 const empty=memory();assert.equal(readWorkspace(empty,defaults()).recovery,null);assert.equal(empty.values.size,0);
 const raw=JSON.stringify({...defaults(),project:'原方案',quote:{base:12},opts:{grid:false}}),store=memory({'realload-v116':raw});
 const result=readWorkspace(store,defaults());assert.equal(result.recovery,null);assert.equal(result.state.project,'原方案');assert.deepEqual(result.state.quote,{base:12,currency:'USD'});assert.equal(result.state.opts.pbr,true);assert.equal(store.getItem('realload-v116'),raw);
});
test('malformed JSON is backed up byte for byte and is never overwritten with defaults',()=>{
 const raw='{"project":"不可丢的货单",bad json',store=memory({[WORKSPACE_KEY]:raw});
 const result=readWorkspace(store,defaults());assert.equal(result.recovery.raw,raw);assert.equal(store.getItem(WORKSPACE_KEY),raw);assert.equal(JSON.parse(store.getItem(RECOVERY_KEY)).raw,raw);assert.equal(result.state.placements.length,0);
});
test('an unreadable newest workspace does not silently load an older draft',()=>{
 const store=memory({[WORKSPACE_KEY]:'broken','realload-v116':JSON.stringify({...defaults(),project:'旧方案'})});
 const result=readWorkspace(store,defaults());assert.equal(result.recovery.sourceKey,WORKSPACE_KEY);assert.equal(store.getItem(WORKSPACE_KEY),'broken');assert.notEqual(result.state.project,'旧方案');
});
test('impossible door and malformed physical records trigger recovery rather than a render crash',()=>{
 for(const patch of [{box:{...CONTAINERS['20GP'],doorW:9999}},{placements:[null]},{placements:[{id:'A',skuId:'S',x:0,y:0,z:0,L:null,W:1,H:1,weight:1}]},{skus:[{id:'A'}]}]){
  const raw=JSON.stringify({...defaults(),...patch}),store=memory({[WORKSPACE_KEY]:raw}),result=readWorkspace(store,defaults());assert.ok(result.recovery);assert.equal(store.getItem(WORKSPACE_KEY),raw);assert.ok(workspaceShapeError(JSON.parse(raw)));
 }
});
test('storage quota failure still leaves the original draft protected and downloadable',()=>{
 const raw='bad',store={getItem:k=>k===WORKSPACE_KEY?raw:null,setItem:()=>{throw Error('QuotaExceededError');}};
 const result=readWorkspace(store,defaults());assert.equal(result.recovery.raw,raw);assert.equal(store.getItem(WORKSPACE_KEY),raw);
});
test('unavailable browser storage returns a usable session without fabricating a recovered plan',()=>{
 const result=readWorkspace({getItem:()=>{throw Error('SecurityError');}},defaults());assert.equal(result.recovery,null);assert.equal(result.storageError,'SecurityError');assert.equal(result.state.mode,'iso');
});
test('unknown old view modes and incomplete quote preferences are normalized without dropping cargo',()=>{
 const valid={...defaults(),mode:'old-3d',section:'other',quote:null},raw=JSON.stringify(valid),store=memory({[WORKSPACE_KEY]:raw}),result=readWorkspace(store,defaults());assert.equal(result.recovery,null);assert.equal(result.state.mode,'iso');assert.equal(result.state.section,'cargo');assert.equal(result.state.quote.currency,'USD');assert.equal(store.getItem(WORKSPACE_KEY),raw);
});

const cargo=(extra={})=>({id:'SAFE-SKU',name:'模拟货物',kind:'carton',L:600,W:400,H:300,weight:12,qty:2,stackLimit:2,rotate:true,allowTilt:false,...extra});
test('legacy cargo records without optional metadata and zero-quantity future templates remain valid',()=>{
 const legacy={id:'OLD',L:100,W:80,H:60,weight:2,qty:2,stackLimit:1};assert.equal(validCargoRecord(legacy),true);
 for(const item of [cargo({qty:0}),cargo({qty:0,numbering:makeNumbering({quantity:1})}),cargo({id:'constructor',priority:'紧急',deliveryStop:'2'}),legacy]){
  assert.equal(validCargoRecord(item),true,JSON.stringify(item));assert.equal(workspaceShapeError({...defaults(),skus:[item]}),null);assert.doesNotThrow(()=>unitNumber(item,1));
 }
});

test('malformed cargo IDs, metadata, enums and unsafe numbering enter recovery before rendering',()=>{
 const invalid=[{id:12},{id:''},{id:'   '},{kind:'unimplemented'},{name:{}},{groupId:[]},{priority:'maybe'},{deliveryStop:true},{deliveryStop:1000},{rotate:'yes'},{qty:Number.MAX_SAFE_INTEGER+1},
  {numbering:{mode:'planned',prefix:'P-',width:1e12}},{numbering:{mode:'planned',width:3}},{numbering:{mode:'planned',prefix:'P-',width:-1}},
  {numbering:{mode:'range',prefix:'P-',width:4,start:Number.MAX_SAFE_INTEGER}},{numbering:{mode:'single',code:'ONE'}},{numbering:{mode:'single'}},{numbering:{mode:'custom'}},
  {cartonNo:'SINGLE-ID',numbering:null}];
 for(const patch of invalid){const item=cargo(patch);assert.equal(validCargoRecord(item),false,JSON.stringify(patch));const raw=JSON.stringify({...defaults(),skus:[item]}),store=memory({[WORKSPACE_KEY]:raw}),restored=readWorkspace(store,defaults());assert.ok(restored.recovery,JSON.stringify(patch));assert.equal(store.getItem(WORKSPACE_KEY),raw);}
});

test('supported numbering formats survive recovery validation and generate safe identifiers',()=>{
 for(const item of [cargo({qty:1,numbering:{mode:'single',code:'CT-1',source:'source-provided'}}),cargo({numbering:{mode:'range',prefix:'CT-',start:8,width:4,source:'source-provided'}}),cargo({numbering:{mode:'planned',prefix:'PLAN-A-',width:3}}),cargo({cartonNo:'CT-001~CT-002'})]){
  assert.equal(validCargoRecord(item),true);assert.ok(unitNumber(item,1));assert.ok(unitNumber(item,item.qty));
 }
});

test('bad precision, group state and quote preferences reset without losing the cargo draft',()=>{
 const item=cargo(),state={...defaults(),skus:[item],project:'保留原货物',precision:999,closedGroups:{unexpected:true},quote:{currency:{},base:-10,origin:'bad',destination:null,perCbm:[],perKg:'2.5'},snap:Infinity,freeStep:-1,editAxis:'diagonal',step:{},groupFilter:{},freeDraft:[]};
 const raw=JSON.stringify(state),store=memory({[WORKSPACE_KEY]:raw}),restored=readWorkspace(store,defaults());assert.equal(restored.recovery,null);const next=restored.state;
 assert.deepEqual(next.skus,[item]);assert.equal(next.project,state.project);assert.equal(next.precision,2);assert.deepEqual(next.closedGroups,[]);assert.equal(next.quote.currency,'USD');assert.deepEqual([next.quote.base,next.quote.origin,next.quote.destination,next.quote.perCbm,next.quote.perKg],[0,0,0,0,2.5]);assert.doesNotThrow(()=>quoteEstimate(next.quote,1,20));assert.doesNotThrow(()=>Number(12).toLocaleString('zh-CN',{maximumFractionDigits:next.precision,minimumFractionDigits:next.precision}));
 assert.equal(next.snap,25);assert.equal(next.freeStep,25);assert.equal(next.editAxis,'free');assert.equal(next.step,null);assert.equal(next.groupFilter,'all');assert.deepEqual(next.freeDraft,{});assert.equal(store.getItem(WORKSPACE_KEY),raw);
});

test('malformed display flags, shell settings and box labels cannot become runtime method errors',()=>{
 const state={...defaults(),opts:{pbr:'yes',walls:{},axes:[],coordsScope:{},wallOpacity:1e20,doorAngle:'bad',containerView:[],unloadReadyIds:{}},box:{...CONTAINERS['20GP'],verified:123,label:{},source:[],id:12}},store=memory({[WORKSPACE_KEY]:JSON.stringify(state)}),restored=readWorkspace(store,defaults());
 assert.equal(restored.recovery,null);const next=restored.state;assert.equal(next.opts.pbr,true);assert.equal(next.opts.wallOpacity,.35);assert.equal(next.opts.doorAngle,112);assert.equal(next.opts.coordsScope,'selected');assert.equal(next.opts.containerView,'complete');assert.equal(next.opts.unloadReadyIds,undefined);assert.equal(next.box.id,'CUSTOM');assert.equal(next.box.label,'自定义箱体');assert.equal(next.box.source,'');assert.doesNotThrow(()=>next.box.verified.includes('Hapag'));assert.deepEqual([next.box.L,next.box.W,next.box.H,next.box.payload],[state.box.L,state.box.W,state.box.H,state.box.payload]);
});

test('valid numeric legacy preferences and explicit zero values retain their meaning',()=>{
 const state={...defaults(),precision:'4',closedGroups:['客户A','客户A',12],snap:'0.01',freeStep:'0.1',step:0,opts:{pbr:false,wallOpacity:'0',doorAngle:0,coordsScope:'all',containerView:'cutaway'},quote:{base:'12.5',currency:'JPY'}},store=memory({[WORKSPACE_KEY]:JSON.stringify(state)}),next=readWorkspace(store,defaults()).state;
 assert.equal(next.precision,4);assert.deepEqual(next.closedGroups,['客户A']);assert.equal(next.snap,.01);assert.equal(next.freeStep,.1);assert.equal(next.step,0);assert.equal(next.opts.wallOpacity,0);assert.equal(next.opts.doorAngle,0);assert.equal(next.opts.pbr,false);assert.equal(next.opts.coordsScope,'all');assert.equal(next.opts.containerView,'cutaway');assert.equal(next.quote.base,12.5);assert.equal(next.quote.currency,'JPY');
});

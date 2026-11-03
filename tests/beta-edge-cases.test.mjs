/** Beta regressions for independent physical units, inventory serials and repacking. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {autoPack,validate} from '../src/engine.mjs';
import {captureCargoSpec,packingInventory,snapshotPlacement} from '../src/cargo-spec.mjs';
import {reflowContainer} from '../src/container-editing.mjs';
import {withUnitOrdinals} from '../src/unit-identity.mjs';
import {packageParts} from '../src/package-geometry.mjs';

const box={L:6000,W:2400,H:2400,doorW:2300,doorH:2300,payload:10000};
const sku=(id='A',extra={})=>({id,name:`${id}模拟货物`,kind:'carton',L:500,W:400,H:300,weight:10,qty:5,stackLimit:1,rotate:true,allowTilt:false,...extra});
const unit=(spec,ordinal=1,extra={})=>snapshotPlacement({id:`${spec.id}#${ordinal}`,ordinal,skuId:spec.id,name:spec.name,kind:spec.kind,L:spec.L,W:spec.W,H:spec.H,weight:spec.weight,stackLimit:spec.stackLimit,x:0,y:50,z:0,heading:0,locked:false,...extra},spec);
const explain=r=>JSON.stringify(r.issues);
function freezeDeep(value){if(value&&typeof value==='object'){Object.values(value).forEach(freezeDeep);Object.freeze(value);}return value;}

test('explicit one-unit inventory fills one missing serial without adding other SKUs or changing old revisions',()=>{
 const original=sku(),current=sku('A',{L:800,W:600,H:450,weight:80,kind:'machine'}),other=sku('B',{qty:6});
 const old=[unit(original,4),unit(other,5,{x:2000})],before=structuredClone(old);
 const result=autoPack([current,other],box,old,1,[{sku:current,ordinal:1}]);
 assert.equal(result.validation.valid,true,explain(result.validation));assert.equal(result.placements.length,3);assert.deepEqual(result.placements.slice(0,2),old);
 const added=result.placements.find(p=>!old.some(item=>item.id===p.id));assert.equal(added.skuId,'A');assert.equal(added.ordinal,1);assert.deepEqual([added.L,added.W,added.H,added.weight,added.kind],[800,600,450,80,'machine']);
 assert.equal(result.placements.filter(p=>p.skuId==='B').length,1);assert.deepEqual(old,before);
});

test('duplicate declared and legacy-derived serials are rejected even when physical IDs differ',()=>{
 const spec=sku();
 for(const positions of [
  [unit(spec,2),unit(spec,2,{id:'another-record',x:1000})],
  [unit(spec,2),unit(spec,2,{id:'renamed-physical#2',ordinal:undefined,x:1000})].map(p=>{const next={...p};delete next.ordinal;return next;})
 ]){const report=validate(positions,box,[spec]);assert.equal(report.valid,false);assert.ok(report.issues.some(issue=>issue.kind==='quantity'&&issue.text.includes('重复')),explain(report));}
});

test('declared invalid serials are not silently repaired from an otherwise valid ID suffix',()=>{
 const spec=sku();
 for(const ordinal of [0,-1,1.5,'1',null,undefined,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]){
  const report=validate([unit(spec,1,{ordinal})],box,[spec]);assert.equal(report.valid,false,`ordinal ${String(ordinal)}`);assert.ok(report.issues.some(issue=>issue.kind==='schema'),explain(report));
 }
});

test('serials beyond quantity and malformed legacy suffixes cannot pass plan validation',()=>{
 const spec=sku('A',{qty:2});
 for(const item of [unit(spec,3),...['A#0','A#-1','A#1.5','A#bad'].map(id=>{const p=unit(spec,1,{id});delete p.ordinal;return p;})]){
  const report=validate([item],box,[spec]);assert.equal(report.valid,false,item.id);assert.ok(report.issues.some(issue=>['quantity','schema'].includes(issue.kind)),explain(report));
 }
});

test('prototype-looking SKU codes retain normal quantities and cannot bypass stock validation',()=>{
 for(const id of ['__proto__','constructor','toString']){
  const spec=sku(id,{qty:1});assert.equal(validate([unit(spec)],box,[spec]).valid,true,id);
  const report=validate([unit(spec),unit(spec,2,{x:1000})],box,[spec]);assert.equal(report.valid,false,id);assert.ok(report.issues.some(issue=>issue.kind==='quantity'),explain(report));
 }
});

test('prototype-looking SKU codes can add one explicit unit without overwriting another stock entry',()=>{
 const skus=[sku('__proto__',{qty:2}),sku('constructor',{qty:2})],old=[unit(skus[0]),unit(skus[1],1,{x:2000})],before=structuredClone(old);
 const result=autoPack(skus,box,old,1,[{sku:skus[1],ordinal:2}]);assert.equal(result.validation.valid,true,explain(result.validation));assert.equal(result.placements.length,3);
 assert.equal(result.placements.filter(p=>p.skuId==='__proto__').length,1);assert.equal(result.placements.filter(p=>p.skuId==='constructor').length,2);assert.equal(new Set(result.placements.map(p=>p.id)).size,3);assert.deepEqual(old,before);
});

for(const heading of [90,270])test(`asymmetric ${heading}-degree old cargo keeps its envelope and marked face when repacking has room`,()=>{
 const original=sku('SHAPED',{kind:'irregular',L:900,W:400,H:700,weight:150,qty:1}),old=unit(original,1,{L:400,W:900,heading,rotation:1,x:3100,y:400});
 const future={...original,L:1600,W:1200,H:1300,weight:800,kind:'machine'},before=structuredClone(old),result=reflowContainer([old],box,[future]);
 assert.equal(result.ok,true,result.reason);const moved=result.placements[0];assert.deepEqual([moved.L,moved.W,moved.H,moved.heading],[400,900,700,heading]);assert.deepEqual(moved.cargoSpec,captureCargoSpec(original));assert.deepEqual(packageParts(moved),packageParts(old));assert.deepEqual(old,before);
});

test('a required horizontal swap updates asymmetric heading while preserving the rigid package proportions',()=>{
 const narrow={...box,L:2000,W:500,H:1000,doorW:500,doorH:1000};
 for(const heading of [90,270]){
  const original=sku('SHAPED',{kind:'irregular',L:900,W:400,H:700,weight:150,qty:1}),old=unit(original,1,{L:400,W:900,heading,rotation:1,x:0,y:50}),before=structuredClone(old);
  const result=reflowContainer([old],narrow,[{...original,L:1600,W:1200,kind:'machine'}]);assert.equal(result.ok,true,result.reason);const moved=result.placements[0];
  assert.deepEqual([moved.L,moved.W,moved.H,moved.heading],[900,400,700,(heading+90)%360]);assert.deepEqual(moved.cargoSpec,old.cargoSpec);assert.deepEqual(packageParts(moved),packageParts(old));assert.deepEqual(old,before);
 }
});

test('unknown snapshot packaging is rejected instead of becoming an unrestricted rectangular support',()=>{
 const spec=sku();
 for(const kind of ['unknown','CARTON','crate custom','__proto__','',null]){
  const item=unit(spec,1,{kind,cargoSpec:{...captureCargoSpec(spec),kind}}),report=validate([item],box,[spec]);
  assert.equal(report.valid,false,String(kind));assert.ok(report.issues.some(issue=>issue.kind==='spec'),explain(report));
 }
});

test('failed reflow leaves frozen heterogeneous units, current templates and target box untouched',()=>{
 const first=sku('MIXED',{qty:3}),second=sku('MIXED',{kind:'machine',L:1100,W:750,H:900,weight:400,qty:3,rotate:false});
 const placements=freezeDeep([unit(first,1),unit(second,3,{x:1700,y:500})]),templates=freezeDeep([{...second,L:1500,W:1000,H:1200,weight:800}]),target=freezeDeep({...box,L:300}),before=structuredClone({placements,templates,target});
 const result=reflowContainer(placements,target,templates);assert.equal(result.ok,false);assert.match(result.reason,/原方案已保留|未找到/);assert.deepEqual({placements,templates,target},before);
});

test('legacy source IDs reserve migrated serials once before remaining inventory is created',()=>{
 const spec=sku('LEGACY',{qty:4}),raw=[unit(spec,1,{id:'source-alpha'}),unit(spec,1,{id:'source-beta',x:1000})].map(p=>{const copy={...p};delete copy.ordinal;return copy;});
 const normalized=withUnitOrdinals(raw);assert.deepEqual(normalized.map(p=>p.ordinal),[1,2]);
 const inventory=packingInventory([spec],raw);assert.deepEqual(inventory.units.map(a=>a.ordinal),[1,2,3,4]);assert.equal(inventory.units.filter(a=>!a.record).length,2);
 const result=autoPack([spec],box,[],inventory.units.length,inventory.units);assert.equal(result.validation.valid,true,explain(result.validation));assert.equal(result.placements.length,4);assert.equal(new Set(result.placements.map(p=>p.ordinal)).size,4);assert.deepEqual(raw.map(p=>p.ordinal),[undefined,undefined]);
});

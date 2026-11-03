import test from 'node:test';
import assert from 'node:assert/strict';
import {captureCargoSpec,snapshotPlacement} from '../src/cargo-spec.mjs';
import {dropCandidate,verifyDrop,rotateSelection,moveSelection} from '../src/free-studio.mjs';
import {supportedSelection,previewFreeMove,checkDraft,placementPatches} from '../src/free-editing.mjs';
import {reflowContainer} from '../src/container-editing.mjs';
import {validate} from '../src/engine.mjs';

const box={L:4000,W:2000,H:2000,doorW:1900,doorH:1900,payload:10000};
const sku=(extra={})=>({id:'MIXED',name:'逐件实物',kind:'carton',L:500,W:400,H:300,weight:15,qty:8,stackLimit:4,rotate:true,allowTilt:false,...extra});
function unit(spec,ordinal=1,extra={}){
 return snapshotPlacement({id:`MIXED#${ordinal}`,ordinal,skuId:'MIXED',name:spec.name,kind:spec.kind,L:spec.L,W:spec.W,H:spec.H,weight:spec.weight,stackLimit:spec.stackLimit,x:0,y:50,z:0,heading:0,locked:false,...extra},spec);
}
const physical=p=>[p.id,p.ordinal,p.skuId,p.name,p.kind,p.L,p.W,p.H,p.weight,p.cargoSpec];

test('a newly dropped unit captures its own complete physical specification',()=>{
 const template=sku(),result=dropCandidate(template,[],box,{x:700,y:600});
 assert.equal(result.ok,true);
 assert.deepEqual(result.candidate.cargoSpec,captureCargoSpec(template));
 template.L=1100;template.weight=200;template.kind='machine';template.rotate=false;
 assert.deepEqual([result.candidate.L,result.candidate.weight,result.candidate.kind,result.candidate.cargoSpec.rotate],[500,15,'carton',true]);
});

test('later drops use the new template while existing units keep their old dimensions and weights',()=>{
 const original=sku(),old=unit(original),template=sku({L:850,W:550,H:450,weight:120,kind:'machine',rotate:false});
 const drop=dropCandidate(template,[old],box,{x:1700,y:800},{step:10});
 assert.equal(drop.ok,true);
 const result=verifyDrop(drop.candidate,[old],box,[template]);
 assert.equal(result.ok,true);
 assert.deepEqual(physical(result.placements[0]),physical(old));
 assert.deepEqual([result.placements[1].L,result.placements[1].W,result.placements[1].H,result.placements[1].weight,result.placements[1].kind],[850,550,450,120,'machine']);
 assert.equal(validate(result.placements,box,[template]).weight,135);
});

test('a previously non-rotatable unit stays non-rotatable after its SKU enables rotation',()=>{
 const original=sku({rotate:false}),old=unit(original,1,{x:600,y:600}),before=structuredClone(old);
 const result=rotateSelection([old],[old.id],box,[sku({rotate:true,L:900})]);
 assert.equal(result.ok,false);assert.match(result.reason,/不允许水平旋转/);assert.deepEqual(old,before);
});

test('an old rotatable unit retains its own permitted dimensions after its SKU disables rotation',()=>{
 const old=unit(sku(),1,{x:600,y:600}),template=sku({rotate:false,L:1100,W:900,H:700,weight:300,kind:'crate'});
 const result=rotateSelection([old],[old.id],box,[template]);
 assert.equal(result.ok,true);assert.deepEqual([result.placements[0].L,result.placements[0].W,result.placements[0].H],[400,500,300]);
 assert.deepEqual(result.placements[0].cargoSpec,old.cargoSpec);assert.equal(old.L,500);
});

test('support linkage follows the old flat package instead of a newly chosen round template',()=>{
 const original=sku(),bottom=unit(original),top=unit(original,2,{z:300}),template=sku({kind:'drum',L:600,W:600,H:900,stackLimit:1});
 const ids=supportedSelection([bottom,top],[bottom.id],[template]);
 assert.deepEqual(ids,[bottom.id,top.id]);
 const moved=previewFreeMove([bottom,top],bottom.id,{x:1200,y:100,z:0},box,[template],ids);
 assert.equal(moved.ok,true);assert.deepEqual(moved.placements.map(p=>[p.x,p.y,p.z]),[[1200,100,0],[1200,100,300]]);
 assert.deepEqual(moved.placements.map(p=>p.stackDepth),[1,2]);
});

test('a round old unit does not become a support surface when its template becomes a carton',()=>{
 const round=unit(sku({kind:'drum',L:500,W:500,H:600})),above=unit(sku({L:300,W:300,H:300}),2,{z:600}),template=sku({L:300,W:300,H:300});
 assert.deepEqual(supportedSelection([round,above],[round.id],[template]),[round.id]);
 const draft=checkDraft([round,above],{},box,[template]);
 assert.equal(draft.ok,false);assert.ok(draft.issues.some(issue=>issue.kind==='support'&&issue.id===above.id));
});

test('moving and applying a draft preserve the frozen physical specification',()=>{
 const original=sku(),old=unit(original),template=sku({L:1000,W:900,H:800,weight:500,kind:'irregular',stackLimit:1});
 const moved=moveSelection([old],[old.id],{x:500,y:100,z:0},box,[template]);
 assert.equal(moved.ok,true);assert.deepEqual(physical(moved.placements[0]),physical(old));
 const applied=checkDraft([old],placementPatches([old],moved.placements),box,[template]);
 assert.equal(applied.ok,true);assert.deepEqual(physical(applied.placements[0]),physical(old));
});

test('container reflow preserves different physical units under one SKU and nonconsecutive ordinals',()=>{
 const old=sku({L:600,W:400,H:300,weight:15,rotate:false}),current=sku({L:900,W:500,H:600,weight:320,kind:'machine',rotate:false});
 const units=[unit(old,3,{x:2700,y:50}),unit(current,7,{x:0,y:50})],before=structuredClone(units);
 const result=reflowContainer(units,{...box,L:3000},[current]);
 assert.equal(result.ok,true,result.reason);assert.equal(result.placements.length,2);
 for(const p of result.placements)assert.deepEqual(physical(p),physical(units.find(item=>item.id===p.id)));
 assert.equal(validate(result.placements,{...box,L:3000},[current]).weight,335);
 assert.deepEqual(units,before);
});

test('container reflow preserves a locked old physical revision and repacks only the other loaded unit',()=>{
 const old=sku({L:600,W:400,H:300,weight:15,rotate:false}),current=sku({L:900,W:500,H:600,weight:320,kind:'machine',rotate:false});
 const units=[unit(old,3,{x:0,y:50,locked:true}),unit(current,7,{x:2700,y:50})];
 const result=reflowContainer(units,{...box,L:3000},[current]);
 assert.equal(result.ok,true,result.reason);assert.equal(result.placements.length,2);
 const locked=result.placements.find(p=>p.id===units[0].id);
 assert.deepEqual(locked,units[0]);
 assert.deepEqual(physical(result.placements.find(p=>p.id===units[1].id)),physical(units[1]));
});

test('insufficient reflow capacity fails without altering heterogeneous physical units',()=>{
 const old=sku({rotate:false}),current=sku({L:900,W:500,H:600,weight:320,kind:'machine',rotate:false});
 const units=[unit(old,3),unit(current,7,{x:1000,y:50})],before=structuredClone(units);
 const result=reflowContainer(units,{...box,L:700},[current]);
 assert.equal(result.ok,false);assert.deepEqual(units,before);
});

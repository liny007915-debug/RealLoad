import test from 'node:test';
import assert from 'node:assert/strict';
import {previewFreeMove,supportedSelection,draftPlacements,placementPatches,checkDraft} from '../src/free-editing.mjs';
import {validate} from '../src/engine.mjs';
import {boundedMove} from '../src/placement-assist.mjs';
const box={L:3000,W:2000,H:2000,doorW:1900,doorH:1900,payload:10000};
const skus=[{id:'A',kind:'carton',L:400,W:400,H:400,qty:6,weight:20,rotate:true,stackLimit:4}];
const p=(id,x=0,y=0,z=0)=>({id,skuId:'A',kind:'carton',L:400,W:400,H:400,weight:20,stackLimit:4,locked:false,x,y,z});
test('dragging an upper carton into open space drops it onto the floor at the requested XY',()=>{
 const old=[p('A#1'),p('A#2',0,0,400)],before=structuredClone(old);
 const r=previewFreeMove(old,'A#2',{x:900.125,y:500.75,z:400},box,skus);
 assert.equal(r.ok,true);assert.deepEqual(r.position,{x:900.125,y:500.75,z:0});assert.deepEqual(old,before);assert.equal(validate(r.placements,box,skus).valid,true);
});
test('automatic placement can stack on a complete allowed top surface',()=>{
 const old=[p('A#1'),p('A#2',800)];const r=previewFreeMove(old,'A#2',{x:0,y:0,z:0},box,skus);
 assert.equal(r.ok,true);assert.equal(r.position.z,400);assert.equal(r.placements[1].x,0);
});
test('continuous movement with magnets off preserves a narrow wall clearance and complete support',()=>{
 const old=[p('A#1',1500,6),p('A#2',500,500,400)],target=boundedMove({x:1500,y:6,z:400},old[1],box,{step:.01,magnet:0});
 assert.equal(target.y,6);
 const r=previewFreeMove(old,'A#2',target,box,skus);assert.equal(r.ok,true);assert.deepEqual(r.position,{x:1500,y:6,z:400});
});
test('support linkage moves the whole tower without changing relative geometry',()=>{
 const old=[p('A#1'),p('A#2',0,0,400),p('A#3',0,0,800)],ids=supportedSelection(old,['A#1'],skus);
 assert.deepEqual(ids,['A#1','A#2','A#3']);const r=previewFreeMove(old,'A#1',{x:900,y:500,z:0},box,skus,ids);
 assert.equal(r.ok,true);assert.deepEqual(r.placements.map(p=>[p.x,p.y,p.z]),[[900,500,0],[900,500,400],[900,500,800]]);
});
test('moving the support alone returns the pointer target and explains the dependent cargo',()=>{
 const old=[p('A#1'),p('A#2',0,0,400)],r=previewFreeMove(old,'A#1',{x:900,y:500,z:0},box,skus);
 assert.equal(r.ok,false);assert.match(r.reason,/联动上方/);assert.equal(r.placements[0].x,900);assert.equal(old[0].x,0);
});
test('draft allows floating and overlap, reports both, and leaves the applied plan intact',()=>{
 const old=[p('A#1'),p('A#2',800)],before=structuredClone(old);
 const r=previewFreeMove(old,'A#2',{x:100,y:0,z:150},box,skus,['A#2'],{draft:true});
 assert.equal(r.ok,true);assert.equal(r.valid,false);assert.ok(r.issues.some(i=>i.kind==='support'));assert.ok(r.issues.some(i=>i.kind==='collision'));
 const patches=placementPatches(old,r.placements),reopened=draftPlacements(old,JSON.parse(JSON.stringify(patches)));
 assert.deepEqual(reopened,r.placements);assert.deepEqual(old,before);assert.equal(checkDraft(old,patches,box,skus).ok,false);
 const fixed=previewFreeMove(reopened,'A#2',{x:900,y:500,z:0},box,skus,['A#2'],{draft:true});
 assert.equal(checkDraft(old,placementPatches(old,fixed.placements),box,skus).ok,true);
});
test('draft can stage outside the container and cannot be applied until brought inside',()=>{
 const old=[p('A#1')],r=previewFreeMove(old,'A#1',{x:-200,y:100,z:500},box,skus,['A#1'],{draft:true});
 assert.equal(r.ok,true);assert.equal(r.position.x,-200);const check=checkDraft(old,placementPatches(old,r.placements),box,skus);assert.equal(check.ok,false);assert.ok(check.issues.some(i=>i.kind==='boundary'));
});
test('locked support chain, stacking prohibition and explicit Z movement keep their constraints',()=>{
 const tower=[p('A#1'),{...p('A#2',0,0,400),locked:true}];assert.equal(previewFreeMove(tower,'A#1',{x:900,y:500,z:0},box,skus,supportedSelection(tower,['A#1'],skus)).ok,false);
 const old=[p('A#1'),p('A#2',800)],noStack=skus.map(s=>({...s,stackLimit:1}));assert.equal(previewFreeMove(old,'A#2',{x:0,y:0,z:0},box,noStack).ok,false);
 const lifted=previewFreeMove([p('A#1')],'A#1',{x:0,y:0,z:400},box,skus,['A#1'],{autoDrop:false});assert.equal(lifted.ok,false);assert.equal(lifted.position.z,400);
});
test('draft patches cannot change cargo identity, weight or malformed numeric values',()=>{
 const old=[p('A#1')],next=draftPlacements(old,{'A#1':{x:10,weight:999,skuId:'bad',y:Infinity,z:'100'}});
 assert.equal(next[0].x,10);assert.equal(next[0].weight,20);assert.equal(next[0].skuId,'A');assert.equal(next[0].y,0);assert.equal(next[0].z,0);
 const oriented=draftPlacements(old,{'A#1':{heading:90,rotation:1}});assert.equal(oriented[0].heading,90);assert.equal(oriented[0].rotation,1);assert.equal(checkDraft(old,placementPatches(old,oriented),box,skus).placements[0].rotation,1);assert.equal(old[0].heading,undefined);
});

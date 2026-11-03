import test from 'node:test';import assert from 'node:assert/strict';
import {landOnFloor,boundedMove,boundedGroupDelta,snapNearFaces,invertFloorProjection} from '../src/placement-assist.mjs';
import {dropCandidate,verifyDrop,dockSelection,moveSelection} from '../src/free-studio.mjs';
import {CONTAINERS,validate} from '../src/engine.mjs';
const box=CONTAINERS['20GP'];
const sku={id:'A',name:'实物外箱',kind:'carton',L:520,W:405,H:370,weight:12.5,qty:8,stackLimit:1,rotate:true};
const pt=(x,y)=>dropCandidate(sku,[],box,{x,y},{step:25});
test('pointer near every wall can land item exactly against wall, respecting full dimensions',()=>{
 const near=[[18,520],[box.L-18,520],[1500,12],[1500,box.W-12]];
 const actual=near.map(([x,y])=>pt(x,y));for(const x of actual)assert.equal(x.ok,true,JSON.stringify(x));
 assert.equal(actual[0].candidate.x,0);assert.equal(actual[1].candidate.x,box.L-sku.L);
 assert.equal(actual[2].candidate.y,0);assert.equal(actual[3].candidate.y,box.W-sku.W);
});
test('four physical corners accessible with independent x and y wall contact',()=>{
 for(const [x,y] of [[1,1],[box.L-1,1],[1,box.W-1],[box.L-1,box.W-1]]){
   const r=pt(x,y);assert.ok(r.ok);assert.ok([0,box.L-sku.L].includes(r.candidate.x));assert.ok([0,box.W-sku.W].includes(r.candidate.y));
   assert.ok(verifyDrop(r.candidate,[],box,[sku]).ok);
 }
});
test('reject far-outside floor and oversize cargo rather than silently clamp',()=>{
 assert.equal(pt(-250,500).ok,false);assert.equal(pt(500,box.W+450).ok,false);
 assert.equal(landOnFloor({x:50,y:50},{L:box.L+1,W:5},box),null);
});
test('movement clamped to physical walls, snap uses unit envelope rather than centre',()=>{
 const p={x:600,y:700,z:0,L:sku.L,W:sku.W,H:sku.H};
 assert.equal(boundedMove({x:-155,y:700,z:0},p,box,{step:25,axis:'x'}).x,0);
 assert.equal(boundedMove({x:box.L+20,y:700,z:0},p,box,{step:25,axis:'x'}).x,box.L-p.L);
 assert.equal(boundedMove({x:600,y:box.W+20,z:0},p,box,{step:25,axis:'y'}).y,box.W-p.W);
});
test('snap to adjacent cargo face only when near, without intersecting the contact envelope',()=>{
 const b={x:0,y:0,z:0,L:600,W:600,H:400};const n={x:600,y:0,z:0,L:300,W:400,H:400};
 const pos=snapNearFaces({x:590,y:0,z:0},n,box,[b],{tolerance:40});assert.equal(pos.x,600);
 assert.equal(snapNearFaces({x:340,y:0,z:0},n,box,[b],{tolerance:40}).x,340);
});
test('axis-locked drag preserves off-grid coordinates on the other axes near walls and cargo faces',()=>{
 const p={x:400,y:20,z:0,L:800,W:700,H:700};
 const neighbor={x:1800,y:720,z:0,L:600,W:400,H:700};
 const xMove=boundedMove({x:800,y:p.y,z:p.z},p,box,{axis:'x',step:25,neighbors:[neighbor]});
 assert.equal(xMove.x,800);assert.equal(xMove.y,20);assert.equal(xMove.z,0);
 const q={...p,x:6,y:400};
 const yMove=boundedMove({x:q.x,y:800,z:q.z},q,box,{axis:'y',step:25});
 assert.equal(yMove.x,6);assert.equal(yMove.y,800);assert.equal(yMove.z,0);
 const zMove=boundedMove({x:q.x,y:q.y,z:500},q,box,{axis:'z',step:25});
 assert.equal(zMove.x,q.x);assert.equal(zMove.y,q.y);assert.equal(zMove.z,500);
});
test('dock moves a selection to each wall and keeps inter-box offsets',()=>{
 const a=dropCandidate(sku,[],box,{x:1000,y:750},{step:1}).candidate;
 const b=dropCandidate({...sku,id:'B'},[a],box,{x:2000,y:750},{step:1}).candidate;
 const all=[a,b],skus=[sku,{...sku,id:'B'}];
 for(const [axis,side,end] of [['x','min',0],['x','max',box.L],['y','min',0],['y','max',box.W]]){
  const r=dockSelection(all,[a.id,b.id],axis,side,box,skus);
  assert.equal(r.ok,true,r.reason);
  assert.equal(side==='min'?Math.min(...r.placements.map(p=>p[axis])):Math.max(...r.placements.map(p=>p[axis]+p[axis==='x'?'L':'W'])),end);
  assert.equal(r.placements[1].x-r.placements[0].x,b.x-a.x);
 }
});
test('dock rejects collisions and preserves original placement',()=>{
 const a=dropCandidate(sku,[],box,{x:1500,y:400},{step:1}).candidate;
 const b=dropCandidate({...sku,id:'B'},[a],box,{x:260,y:400},{step:1}).candidate;
 const all=[a,b];const r=dockSelection(all,[a.id],'x','min',box,[sku,{...sku,id:'B'}]);
 assert.equal(r.ok,false);assert.equal(all[0].x,a.x);
});
test('bulk drag clamps entire selected set at bounding wall without changing offsets',()=>{
 const a={id:'A#1',x:1200,y:0,z:0,L:500,W:200,H:300};const b={id:'B#1',x:1950,y:0,z:0,L:500,W:200,H:300};
 const d=boundedGroupDelta([a,b],[a.id,b.id],{x:9999,y:0,z:0},box);assert.equal(d.x,box.L-(b.x+b.L));
 const d2=boundedGroupDelta([a,b],[a.id,b.id],{x:-9999,y:0,z:0},box);assert.equal(d2.x,-a.x);
});
test('perspective fallback floor solver corrects nonlinear distortion near corners',()=>{
 const p=({x,y})=>({x:20+x*.045/(1+(x-3000)*.00003),y:100+y*.07/(1+(x-3000)*.00003)});
 for(const [x,y] of [[5,5],[5790,2240],[3000,1200],[500,2050]]){
  const pixel=p({x,y});const inv=invertFloorProjection(p,pixel,box);
  assert.ok(inv,`missing inverse for ${x},${y}`);
  assert.ok(Math.abs(inv.x-x)<1 && Math.abs(inv.y-y)<1,`${JSON.stringify(inv)} expected ${x},${y}`);
 }
});

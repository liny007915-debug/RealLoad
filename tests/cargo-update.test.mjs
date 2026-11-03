import test from 'node:test';
import assert from 'node:assert/strict';
import {updateCargo,mergeCargo} from '../src/cargo-update.mjs';
import {validate,autoPack} from '../src/engine.mjs';
import {dropCandidate,verifyDrop} from '../src/free-studio.mjs';
import {draftPlacements,placementPatches} from '../src/free-editing.mjs';

const box={L:6000,W:2400,H:2400,doorW:2300,doorH:2300,payload:10000};
const sku=(id,extra={})=>({id,name:id,kind:'carton',L:600,W:400,H:300,weight:20,qty:4,stackLimit:4,rotate:true,allowTilt:false,...extra});
const item=(s,n,x=0,y=0,z=0,extra={})=>({id:`${s.id}#${n}`,skuId:s.id,name:s.name,kind:s.kind,L:s.L,W:s.W,H:s.H,weight:s.weight,stackLimit:s.stackLimit,x,y,z,locked:false,...extra});
function fixture(){const a=sku('A'),b=sku('B',{qty:1});return {box,skus:[a,b],placements:[item(a,1),item(a,2,1000),item(b,1,2000)]};}
const positions=p=>p.map(p=>[p.id,p.x,p.y,p.z,p.locked]);
const physical=p=>p.map(p=>[p.id,p.name,p.kind,p.L,p.W,p.H,p.weight,p.stackLimit,p.x,p.y,p.z,p.locked,p.heading,p.rotation]);
function edit(current,patch,id='A'){return updateCargo(current,current.skus.map(s=>s.id===id?{...s,...patch}:s));}

test('name and physical template edits preserve loaded units while logistics remain editable',()=>{
 const c=fixture(),before=structuredClone(c),r=edit(c,{name:'改名货物',weight:35,qty:8,priority:'urgent',deliveryStop:1});
 assert.equal(r.ok,true,r.reason);assert.deepEqual(positions(r.placements),positions(c.placements));
 assert.deepEqual(physical(r.placements),physical(c.placements));assert.equal(r.skus[0].name,'改名货物');assert.equal(r.skus[0].weight,35);assert.equal(r.placements[0].name,'A');assert.equal(r.placements[0].weight,20);assert.equal(r.placements[0].priority,'urgent');assert.equal(r.placements[0].deliveryStop,1);
 assert.equal(r.placements[2].weight,20);assert.equal(validate(r.placements,box,r.skus).valid,true);assert.deepEqual(c,before);
});
test('new dimensions change the future template while all loaded envelopes remain unchanged',()=>{
 const c=fixture(),r=edit(c,{L:700,W:450,H:350});assert.equal(r.ok,true,r.reason);
 assert.deepEqual(physical(r.placements),physical(c.placements));assert.deepEqual(r.skus.slice(0,1).map(p=>[p.L,p.W,p.H]),[[700,450,350]]);
});
test('rotated and tilted loaded envelopes retain their exact sizes after template changes',()=>{
 const a=sku('A',{allowTilt:true}),c={box,skus:[a],placements:[item(a,1,0,0,0,{L:400,W:600,H:300,rotation:1,heading:270}),item(a,2,1000,0,0,{L:300,W:400,H:600,rotation:2})]};
 const r=edit(c,{L:700,W:450,H:350});assert.equal(r.ok,true,r.reason);
 assert.deepEqual(physical(r.placements),physical(c.placements));assert.deepEqual(r.placements.map(p=>[p.L,p.W,p.H]),[[400,600,300],[300,400,600]]);assert.equal(r.placements[0].heading,270);
});
test('a square loaded package remains square and keeps its marked heading when the template becomes rectangular',()=>{
 const a=sku('A',{W:600}),c={box,skus:[a],placements:[item(a,1,0,0,0,{heading:90})]},r=edit(c,{L:700,W:500});
 assert.equal(r.ok,true,r.reason);assert.deepEqual([r.placements[0].L,r.placements[0].W,r.placements[0].heading],[600,600,90]);
});
for(const [label,patch] of [
 ['larger than the old gaps',{L:1500}],['larger than the container',{L:7000}],['wider than the door',{W:2350}],['much heavier than existing units',{weight:6000}],
])test(`${label}: a future template saves without changing loaded units`,()=>{
 const c=fixture(),before=structuredClone(c),r=edit(c,patch);assert.equal(r.ok,true,r.reason);assert.deepEqual(physical(r.placements),physical(c.placements));assert.equal(validate(r.placements,box,r.skus).valid,true);for(const [key,value]of Object.entries(patch))assert.equal(r.skus[0][key],value);assert.deepEqual(c,before);
});
test('quantity reductions never discard loaded units or reuse a missing ordinal',()=>{
 const c=fixture();assert.equal(edit(c,{qty:1}).ok,false);const a=c.skus[0];c.placements=[item(a,4)];
 const r=edit(c,{qty:2});assert.equal(r.ok,false);assert.match(r.reason,/第 4 件/);assert.equal(c.placements[0].id,'A#4');
});
test('changing the support template height preserves the existing support and its upper cargo',()=>{
 const a=sku('A'),b=sku('B',{L:400,W:300,qty:1}),c={box,skus:[a,b],placements:[item(a,1),item(b,1,0,0,300)]};
 assert.equal(validate(c.placements,box,c.skus).valid,true);const r=edit(c,{H:350});assert.equal(r.ok,true,r.reason);assert.deepEqual(physical(r.placements),physical(c.placements));assert.equal(validate(r.placements,box,r.skus).valid,true);
});
test('future packaging and layer-policy edits leave existing support policies frozen',()=>{
 const a=sku('A'),c={box,skus:[a],placements:[item(a,1),item(a,2,0,0,300)]};
 for(const patch of [{kind:'irregular'},{stackLimit:1}]){const r=edit(c,patch);assert.equal(r.ok,true,r.reason);assert.deepEqual(physical(r.placements),physical(c.placements));assert.equal(validate(r.placements,box,r.skus).valid,true);}
 const floor=fixture(),r=edit(floor,{kind:'irregular',stackLimit:1});assert.equal(r.ok,true,r.reason);assert.equal(r.placements[0].kind,'carton');assert.equal(r.placements[0].cargoSpec.stackLimit,4);
});
test('disabling future rotation preserves an already rotated unit and its own permissions',()=>{
 const a=sku('A'),c={box,skus:[a],placements:[item(a,1,0,0,0,{L:400,W:600,heading:90})]},r=edit(c,{rotate:false});
 assert.equal(r.ok,true,r.reason);assert.deepEqual(physical(r.placements),physical(c.placements));assert.equal(r.placements[0].cargoSpec.rotate,true);assert.equal(r.skus[0].rotate,false);
});
test('renaming an SKU preserves physical unit IDs, serials, lock and geometry',()=>{
 const c=fixture();c.placements[0].locked=true;const next=c.skus.map(s=>s.id==='A'?{...s,id:'NEW-A',qty:7}:s);
 const r=updateCargo(c,next,{renames:{A:'NEW-A'}});assert.equal(r.ok,true,r.reason);assert.deepEqual(positions(r.placements),positions(c.placements));
 assert.equal(r.placements[1].skuId,'NEW-A');assert.equal(r.placements[1].ordinal,2);assert.match(r.placements[1].unitCode,/-002$/);
});
test('removing a loaded SKU through data replacement is refused',()=>{
 const c=fixture(),r=updateCargo(c,[c.skus[0]]);assert.equal(r.ok,false);assert.match(r.reason,/移出或清空/);assert.equal(r.placements,c.placements);
});
test('append skips duplicates; update merges fields and retains absent SKUs and placements',()=>{
 const c=fixture(),incoming=[{...c.skus[0],weight:30},sku('C')];
 const appended=mergeCargo(c,incoming,'append');assert.equal(appended.ok,true);assert.deepEqual([appended.added,appended.updated,appended.skipped],[1,0,1]);assert.equal(appended.skus[0].weight,20);
 const updated=mergeCargo(c,incoming);assert.equal(updated.ok,true);assert.deepEqual(updated.skus.map(s=>s.id),['A','B','C']);assert.equal(updated.skus[0].weight,30);assert.equal(updated.placements[0].weight,20);assert.deepEqual(physical(updated.placements),physical(c.placements));
});
test('one invalid row prevents the entire import, retaining all current records',()=>{
 const c=fixture(),r=mergeCargo(c,[{...c.skus[0],weight:-1},sku('C')]);assert.equal(r.ok,false);assert.equal(r.skus,c.skus);assert.equal(r.placements,c.placements);
});
test('invalid IDs, duplicates, negative or nonfinite values cannot mutate the applied plan',()=>{
 const c=fixture();for(const patch of [{id:''},{id:'B'},{weight:NaN},{L:-1},{qty:1.5}])assert.equal(edit(c,patch).ok,false);assert.equal(c.placements.length,3);
});
test('free drafts can rebase onto new cargo data while the applied plan remains valid',()=>{
 const c=fixture(),patches={'A#1':{z:250},'A#2':{L:400,W:600,heading:90}},next=c.skus.map(s=>s.id==='A'?{...s,L:700,weight:25}:s);
 const applied=updateCargo(c,next),draft=updateCargo({...c,placements:draftPlacements(c.placements,patches)},next,{allowInvalidPositions:true});
 assert.equal(applied.ok,true);assert.equal(draft.ok,true);assert.ok(draft.issues.length);const rebased=placementPatches(applied.placements,draft.placements);
 assert.equal(rebased['A#1'].z,250);assert.equal(rebased['A#2'].L,400);assert.equal(rebased['A#2'].W,600);assert.equal(applied.placements[0].weight,20);assert.equal(draft.placements[0].weight,20);assert.equal(validate(applied.placements,box,next).valid,true);
});
test('successive edits retain both old and newly placed physical revisions of one SKU',()=>{
 const c=fixture(),first=edit(c,{L:850,W:450,H:500,weight:80,kind:'machine'});assert.equal(first.ok,true,first.reason);
 const added=dropCandidate(first.skus[0],first.placements,box,{x:3500,y:1500});assert.equal(added.ok,true,added.reason);
 const loaded=verifyDrop(added.candidate,first.placements,box,first.skus);assert.equal(loaded.ok,true,loaded.reason);
 const mixed={...first,box,placements:loaded.placements},again=edit(mixed,{L:1200,W:900,H:1000,weight:200,kind:'crate'});
 assert.equal(again.ok,true,again.reason);assert.deepEqual(physical(again.placements),physical(mixed.placements));
 assert.deepEqual(again.placements.filter(p=>p.skuId==='A').map(p=>[p.L,p.W,p.H,p.weight,p.kind]),[[600,400,300,20,'carton'],[600,400,300,20,'carton'],[850,450,500,80,'machine']]);
 assert.equal(validate(again.placements,box,again.skus).valid,true);
});
test('new oversized or door-incompatible units remain subject to hard constraints after a template edit',()=>{
 const c=fixture(),oversized=edit(c,{L:7000});assert.equal(oversized.ok,true);
 assert.equal(dropCandidate(oversized.skus[0],oversized.placements,box,{x:3000,y:1200}).ok,false);
 const wide=edit(c,{W:2350,rotate:false}),drop=dropCandidate(wide.skus[0],wide.placements,box,{x:4000,y:1200});assert.equal(wide.ok,true);assert.equal(drop.ok,true,drop.reason);
 const checked=verifyDrop(drop.candidate,wide.placements,box,wide.skus);assert.equal(checked.ok,false);assert.ok(checked.issues.some(i=>i.kind==='door'));
 assert.deepEqual(physical(wide.placements),physical(c.placements));
});
test('reusing a renamed SKU code can load a new unit without duplicating its physical record',()=>{
 const c=fixture(),renamed=updateCargo(c,c.skus.map(s=>s.id==='A'?{...s,id:'NEW-A'}:s),{renames:{A:'NEW-A'}});
 const extra=sku('A',{qty:1}),skus=[...renamed.skus,extra];
 const drop=dropCandidate(extra,renamed.placements,box,{x:3000,y:0});assert.equal(drop.ok,true,drop.reason);
 assert.notEqual(drop.candidate.id,'A#1');assert.equal(drop.candidate.ordinal,1);
 const result=verifyDrop(drop.candidate,renamed.placements,box,skus);assert.equal(result.ok,true,result.reason);assert.equal(result.placements[0].id,'A#1');
});
test('automatic fill preserves renamed locked records when an old code is reused',()=>{
 const old=sku('A',{qty:1}),c={box,skus:[old],placements:[item(old,1,0,0,0,{locked:true})]},renamed=updateCargo(c,[{...old,id:'NEW-A'}],{renames:{A:'NEW-A'}});
 const filled=autoPack([...renamed.skus,old],box,renamed.placements);assert.equal(filled.validation.valid,true);
 assert.equal(filled.placements.length,2);assert.equal(filled.placements[0].id,'A#1');assert.notEqual(filled.placements[1].id,'A#1');assert.equal(filled.placements[1].skuId,'A');
});
test('automatic fill keeps a locked serial and allocates the missing serials once',()=>{
 const a=sku('A',{qty:4}),locked=[item(a,3,2000,0,0,{locked:true,ordinal:3})],r=autoPack([a],box,locked);
 assert.equal(r.validation.valid,true);assert.equal(r.placements.length,4);assert.deepEqual(r.placements.map(p=>p.ordinal).sort(),[1,2,3,4]);assert.equal(r.placements[0].id,'A#3');
});

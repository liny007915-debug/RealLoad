import test from 'node:test';
import assert from 'node:assert/strict';
import {CONTAINERS, intersects, validate} from '../src/engine.mjs';
import {doorOpeningStatus, suggestLoadOrder, suggestUnloadOrder, unloadingState, unloadOne} from '../src/unloading.mjs';
import {prioritizeReady} from '../src/priority.mjs';
import {filterUnloadChoices, rankUnloadChoices} from '../src/unload-workflow.mjs';

const strict = {doorMode:'strict', clearance:0};
const sku = {id:'QA',name:'业务回归测试纸箱',kind:'carton',L:600,W:600,H:500,weight:20,qty:18,rotate:true,stackLimit:3};
const parcel = (id,x,y,z=0,extra={}) => ({id,skuId:sku.id,name:sku.name,kind:'carton',L:sku.L,W:sku.W,H:sku.H,weight:sku.weight,x,y,z,priority:'normal',...extra});

function stackedGrid() {
  const items=[];
  for(const x of [400,1500,2800]) for(const y of [100,900]) for(const z of [0,500,1000]) {
    items.push(parcel(`QA#${items.length+1}`,x,y,z));
  }
  return items;
}

// Independent path observation: inspect a moving parcel at 33 points from its
// real position until its trailing face has fully crossed the cargo door.
function assertStraightExitDoesNotCollide(item, remaining, box) {
  for(let frame=0;frame<=32;frame++) {
    const x=item.x+(box.L+50-item.x)*frame/32;
    const moving={...item,x};
    for(const other of remaining) if(other.id!==item.id) {
      assert.equal(intersects(moving,other),false,`${item.id} crosses ${other.id} at frame ${frame}`);
    }
  }
}

for(const box of Object.values(CONTAINERS)) test(`V1.18 ${box.id}: every unload step has a clear path and leaves a supported arrangement`,()=>{
  const placements=stackedGrid(),before=structuredClone(placements);
  assert.equal(validate(placements,box,[sku]).valid,true);
  const plan=suggestUnloadOrder(placements,box,[],strict);
  assert.equal(plan.complete,true);
  assert.equal(new Set(plan.order).size,placements.length);
  let removed=[];
  for(const id of plan.order) {
    const remaining=placements.filter(p=>!removed.includes(p.id));
    const item=remaining.find(p=>p.id===id);
    assert.ok(item,`planned item ${id} exists exactly once`);
    assert.equal(doorOpeningStatus(item,box,strict).ok,true);
    assertStraightExitDoesNotCollide(item,remaining,box);
    const result=unloadOne(placements,box,removed,id,strict);
    assert.equal(result.ok,true,result.reason);
    removed=result.removed;
    const report=validate(placements.filter(p=>!removed.includes(p.id)),box,[sku]);
    assert.equal(report.valid,true,JSON.stringify(report.issues));
  }
  assert.equal(unloadingState(placements,box,removed,strict).remaining.length,0);
  assert.deepEqual(placements,before,'preview must preserve saved coordinates and labels');
});

test('V1.18 loading sequence keeps every intermediate arrangement supported and can enter through the door',()=>{
  const box=CONTAINERS['20GP'],placements=stackedGrid(),before=structuredClone(placements);
  const plan=suggestLoadOrder(placements,box,strict);
  assert.equal(plan.complete,true);
  const loaded=[];
  for(const id of plan.order) {
    const item=placements.find(p=>p.id===id);
    assertStraightExitDoesNotCollide(item,[...loaded,item],box);
    loaded.push(item);
    const report=validate(loaded,box,[sku]);
    assert.equal(report.valid,true,`loading ${id}: ${JSON.stringify(report.issues)}`);
  }
  assert.equal(loaded.length,placements.length);
  assert.deepEqual(placements,before);
});

test('V1.18 urgency never removes a supporting base before its low-priority upper cargo',()=>{
  const box=CONTAINERS['20GP'];
  const items=[parcel('urgent-base',3000,100,0,{priority:'urgent'}),parcel('low-top',3000,100,500,{priority:'low'})];
  const state=unloadingState(items,box,[],strict);
  assert.equal(state.choices.find(c=>c.id==='urgent-base').ok,false);
  assert.deepEqual(suggestUnloadOrder(items,box,[],strict).order,['low-top','urgent-base']);
  assert.deepEqual(suggestLoadOrder(items,box,strict).order,['urgent-base','low-top']);
});

test('V1.18 partial plan reports a physically blocked door-side cargo rather than fabricating a complete order',()=>{
  const box=CONTAINERS['20GP'];
  const items=[parcel('offset',3000,0),parcel('clear-lane',3000,900)];
  const plan=suggestUnloadOrder(items,box,[],strict);
  assert.equal(plan.complete,false);
  assert.deepEqual(plan.order,['clear-lane']);
  assert.deepEqual(plan.unresolved,['offset']);
  assert.ok(plan.issues.some(issue=>issue.id==='offset'&&issue.blockers.some(b=>b.kind==='door-position')));
  assert.equal(unloadOne(items,box,[],'offset',strict).ok,false);
  assert.deepEqual(items.map(p=>p.id),['offset','clear-lane']);
});

test('V1.18 pause-position equivalent: resuming a partially removed plan neither repeats nor loses units',()=>{
  const box=CONTAINERS['20GP'],items=stackedGrid();
  const full=suggestUnloadOrder(items,box,[],strict);
  const removed=full.order.slice(0,7),before=[...removed];
  const resumed=suggestUnloadOrder(items,box,removed,strict);
  assert.equal(resumed.complete,true);
  assert.deepEqual(resumed.order,full.order.slice(7));
  assert.deepEqual(removed,before,'planning must not mutate completed-step history');
  assert.equal(unloadOne(items,box,removed,removed[0],strict).ok,false);
  assert.equal(new Set([...removed,...resumed.order]).size,items.length);
});

test('V1.18 list sorting and searching cannot mutate the real unload choices or alter the safe next unit',()=>{
  const box=CONTAINERS['20GP'];
  const items=[parcel('back',400,100),parcel('front',2800,100),parcel('other-lane',1500,900)];
  const state=unloadingState(items,box,[],strict),before=structuredClone(state.choices);
  const ranked=rankUnloadChoices(state.choices);
  assert.equal(ranked[0].id,suggestUnloadOrder(items,box,[],strict).order[0]);
  assert.deepEqual(filterUnloadChoices(ranked,'blocked','BACK').map(c=>c.id),['back']);
  assert.ok(filterUnloadChoices(ranked,'ready','').every(c=>c.ok));
  assert.deepEqual(filterUnloadChoices(ranked,'ready','no-such-physical-id'),[]);
  assert.deepEqual(state.choices,before);
});

test('V1.18 a blocker of two urgent consignments ranks ahead of a blocker of one',()=>{
  const ready=(id,x)=>({id,ok:true,item:{id,x,L:600,z:0,priority:'normal'}});
  const blocked=(id,blocker)=>({id,ok:false,item:{priority:'urgent'},blockers:[{id:blocker,kind:'path'}]});
  const rows=[ready('A',400),ready('B',2800),blocked('U1','A'),blocked('U2','B'),blocked('U3','B')];
  const before=structuredClone(rows);
  assert.deepEqual(prioritizeReady(rows).map(c=>c.id),['B','A']);
  assert.deepEqual(rows,before);
  // Input record order must not change the unlock benefit of the same cargo.
  const permuted=[rows[4],rows[0],rows[3],rows[1],rows[2]];
  assert.deepEqual(prioritizeReady(permuted).map(c=>c.id),['B','A']);
});

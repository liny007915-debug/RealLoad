import test from 'node:test';
import assert from 'node:assert/strict';
import {autoPackThroughDoor} from '../src/door-packing.mjs';
import {CONTAINERS,DEMO_SKUS,validate} from '../src/engine.mjs';
import {doorOpeningStatus,suggestLoadOrder,suggestUnloadOrder} from '../src/unloading.mjs';

const cargo=(extra={})=>({id:'QA',name:'门洞业务回归测试箱',kind:'carton',L:600,W:500,H:400,weight:20,qty:4,stackLimit:1,rotate:false,...extra});
const frozenCopy=value=>{const result=structuredClone(value);for(const entry of Array.isArray(result)?result:Object.values(result))if(entry&&typeof entry==='object')Object.freeze(entry);return Object.freeze(result);};

for(const [type,box] of Object.entries(CONTAINERS)) test(`door packing: ${type} full 53-piece demo has a complete strict loading and unloading order`,()=>{
  const skus=[...DEMO_SKUS,{id:'SKU-004',name:'实木板材（测试尺寸）',kind:'board',L:1200,W:300,H:45,weight:11,qty:6,rotate:true,allowTilt:false,stackLimit:6}];
  const result=autoPackThroughDoor(skus,box);
  assert.equal(result.placements.length,53);
  assert.equal(result.unplaced.length,0);
  assert.equal(validate(result.placements,box,skus).valid,true);
  assert.equal(result.validation.valid,true);
  const opts={doorMode:'strict',clearance:0};
  for(const item of result.placements)assert.equal(doorOpeningStatus(item,box,opts).ok,true,`${item.id} cannot pass the actual centred door`);
  const unload=suggestUnloadOrder(result.placements,box,[],opts),load=suggestLoadOrder(result.placements,box,opts);
  assert.equal(unload.complete,true);
  assert.equal(load.complete,true);
  assert.deepEqual(load.order,[...unload.order].reverse());
});

test('door packing: clearance uses actual centred door edges and preserves millimetre geometry for all container types',()=>{
  for(const box of Object.values(CONTAINERS))for(const clearance of [0,10,25,50,100]) {
    const skus=[cargo({qty:8})],result=autoPackThroughDoor(skus,box,[],180,clearance);
    assert.equal(result.validation.valid,true);
    assert.equal(result.pathEnvelope.left,(box.W-box.doorW)/2+clearance);
    assert.equal(result.pathEnvelope.right,(box.W+box.doorW)/2-clearance);
    assert.equal(result.pathEnvelope.height,Math.min(box.H,box.doorH-clearance));
    for(const item of result.placements) {
      assert.equal(doorOpeningStatus(item,box,{doorMode:'strict',clearance}).ok,true);
      assert.equal(item.L,skus[0].L);assert.equal(item.W,skus[0].W);assert.equal(item.H,skus[0].H);
      assert.ok(item.y>=result.pathEnvelope.left-1e-8);
      assert.ok(item.y+item.W<=result.pathEnvelope.right+1e-8);
      assert.ok(item.z+item.H<=result.pathEnvelope.height+1e-8);
    }
  }
});

test('door packing: full available door width and height are legal exactly at the boundary',()=>{
  const box=CONTAINERS['20GP'];
  for(const clearance of [0,10,100]) {
    const sku=cargo({W:box.doorW-2*clearance,H:box.doorH-clearance,qty:1});
    const result=autoPackThroughDoor([sku],box,[],180,clearance);
    assert.equal(result.placements.length,1);
    assert.equal(result.unplaced.length,0);
    assert.equal(doorOpeningStatus(result.placements[0],box,{doorMode:'strict',clearance}).ok,true);
    assert.equal(result.placements[0].z,0);
    for(const field of ['W','H']) {
      const oversized={...sku,[field]:sku[field]+.01};
      const rejected=autoPackThroughDoor([oversized],box,[],180,clearance);
      assert.equal(rejected.placements.length,0,`${field} + 0.01 mm must not pass`);
      assert.equal(rejected.unplaced.length,1);
    }
  }
});

test('door packing: internal-height cargo that exceeds the door remains unplaced rather than shrinking',()=>{
  const box=CONTAINERS['20GP'],sku=cargo({H:box.H,qty:1});
  const result=autoPackThroughDoor([sku],box);
  assert.equal(result.placements.length,0);
  assert.equal(result.unplaced.length,1);
  assert.equal(sku.H,box.H);
});

test('door packing: locked coordinates and physical identifiers survive repacking without input mutation',()=>{
  const skus=frozenCopy([cargo()]),box=frozenCopy(CONTAINERS['20GP']);
  const locked=frozenCopy([{id:'QA#1',skuId:'QA',name:skus[0].name,kind:'carton',L:600,W:500,H:400,weight:20,x:2000,y:100,z:0,locked:true,unitCode:'ACTUAL-0001',unitCodeSource:'source-provided',groupId:'shipment-A'}]);
  const before={skus:structuredClone(skus),box:structuredClone(box),locked:structuredClone(locked)};
  const result=autoPackThroughDoor(skus,box,locked);
  const actual=result.placements.find(p=>p.id==='QA#1');
  assert.deepEqual(actual,locked[0]);
  assert.equal(result.placements.length,4);
  assert.equal(new Set(result.placements.map(p=>p.id)).size,4);
  assert.equal(result.validation.valid,true);
  assert.deepEqual(skus,before.skus);assert.deepEqual(box,before.box);assert.deepEqual(locked,before.locked);
});

test('door packing: a locked unit outside the actual doorway corridor is rejected without silently relocating it',()=>{
  const sku=cargo(),box=CONTAINERS['20GP'];
  const locked=[{id:'QA#1',skuId:'QA',kind:'carton',L:600,W:500,H:400,weight:20,x:1000,y:0,z:0,locked:true}];
  const before=structuredClone(locked);
  assert.throws(()=>autoPackThroughDoor([sku],box,locked),/锁定货物/);
  assert.deepEqual(locked,before);
});

test('door packing: clearance that closes the door is rejected and caller limits remain effective',()=>{
  const box=CONTAINERS['20GP'],skus=[cargo({qty:20})];
  assert.throws(()=>autoPackThroughDoor(skus,box,[],180,box.doorW/2),/门洞或预留净空/);
  assert.throws(()=>autoPackThroughDoor(skus,box,[],180,Infinity),/门洞或预留净空/);
  const result=autoPackThroughDoor(skus,box,[],3);
  assert.equal(result.placements.length,3);
  assert.equal(result.truncated,true);
  assert.equal(result.validation.valid,true);
});

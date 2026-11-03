/** Synthetic inventory-cap regression. Millimetres/kg; no manufacturer data. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {autoPackThroughDoor} from '../src/door-packing.mjs';
import {validate} from '../src/engine.mjs';
import {PHYSICAL_KINDS,packingInventory} from '../src/cargo-spec.mjs';
import {updateCargo} from '../src/cargo-update.mjs';
import {suggestUnloadOrder} from '../src/unloading.mjs';

test('a 192-unit order retains all 180 packed physical units across template edits and a complete unload plan',()=>{
 const box={id:'CUSTOM',L:15000,W:6000,H:4000,doorW:5900,doorH:3900,payload:100000};
 const skus=PHYSICAL_KINDS.map((kind,i)=>({id:'CAP-'+i,name:'容量合成样本 '+kind,kind,L:400,W:400,H:400,weight:10+i,qty:12,rotate:true,allowTilt:false,stackLimit:1}));
 const inventory=packingInventory(skus,[]);assert.equal(inventory.units.length,180);assert.equal(inventory.truncated,true);
 const packed=autoPackThroughDoor(skus,box,[],inventory.units.length,0,inventory.units);
 assert.equal(packed.placements.length,180);assert.equal(validate(packed.placements,box,skus).valid,true);
 const future=skus.map(s=>({...s,L:800,W:600,H:700,weight:90,kind:'irregular'})),change=updateCargo({box,skus,placements:packed.placements},future);
 assert.equal(change.ok,true);assert.deepEqual(change.placements.map(p=>[p.id,p.ordinal,p.name,p.kind,p.L,p.W,p.H,p.weight,p.cargoSpec,p.x,p.y,p.z,p.heading]),packed.placements.map(p=>[p.id,p.ordinal,p.name,p.kind,p.L,p.W,p.H,p.weight,p.cargoSpec,p.x,p.y,p.z,p.heading]));
 const pending=packingInventory(future,change.placements);
 assert.equal(pending.truncated,false);assert.equal(pending.units.filter(unit=>!unit.record).length,12);assert.equal(pending.units.filter(unit=>unit.record).length,180);
 const unload=suggestUnloadOrder(change.placements,box,[],{doorMode:'strict',clearance:0});assert.equal(unload.complete,true);assert.equal(unload.order.length,180);assert.equal(new Set(unload.order).size,180);
});

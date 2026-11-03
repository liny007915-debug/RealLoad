import test from 'node:test';import assert from 'node:assert/strict';
import {drawScene,hitTest,dragDelta,CAMERA_PRESETS} from '../src/render.mjs';
import {CONTAINERS,autoPack,DEMO_SKUS} from '../src/engine.mjs';
// Browserless smoke test of the full projection/drawing paths, not a pixel accuracy test.
const stub=()=>{
 const gradient={addColorStop(){}};
 const ctx=new Proxy({measureText:s=>({width:String(s).length*6}),createLinearGradient:()=>gradient}, {get(o,k){return k in o?o[k]:()=>{}},set(o,k,v){o[k]=v;return true}});
 return {width:0,height:0,getContext:()=>ctx,getBoundingClientRect:()=>({width:920,height:460})};
};
test('render all camera views and collect clickable geometry',()=>{
 globalThis.window={devicePixelRatio:1};const box=CONTAINERS['20GP'];const items=autoPack(DEMO_SKUS,box).placements;
 for(const key of Object.keys(CAMERA_PRESETS)){
  const canvas=stub();const scene=drawScene(canvas,box,items,{cam:CAMERA_PRESETS[key],labels:true,grid:true,selected:items[0].id});
  assert.ok(scene.hits.length>0,key);assert.equal(canvas.width,920);assert.equal(canvas.height,460);
  assert.ok(Number.isFinite(scene.scale));
 }
});
test('orthographic drag gives finite displacement',()=>{globalThis.window={devicePixelRatio:1};const sc=drawScene(stub(),CONTAINERS['20GP'],[],{cam:CAMERA_PRESETS.top});const d=dragDelta(sc,30,12);assert.ok(Number.isFinite(d.x)&&Number.isFinite(d.y));});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sceneModes,applySceneMode,modeMatches} from '../src/v11.mjs';
import {containerParts} from '../src/container-geometry.mjs';
import {CONTAINERS,validate,autoPack,DEMO_SKUS} from '../src/engine.mjs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/v11.css',import.meta.url),'utf8');
const gl=readFileSync(new URL('../src/webgl.mjs',import.meta.url),'utf8');
const fallback=readFileSync(new URL('../src/fallback-render.mjs',import.meta.url),'utf8');
test('three visual modes exist and are wired to actual UI buttons',()=>{
 for(const name of Object.keys(sceneModes))assert.ok(html.includes(`data-scene-preset="${name}"`));
 assert.ok(html.includes('id="scene-expand"'));
});
test('mode switching changes only scene display and not positions, source data or quantities',()=>{
 const original={skus:DEMO_SKUS,box:CONTAINERS['20GP'],placements:autoPack(DEMO_SKUS,CONTAINERS['20GP']).placements};
 const state={...original,opts:{pbr:false,walls:true,wallOpacity:.56,axes:false,coords:false,tags:false,grid:true,dimensions:false}};
 const before=JSON.stringify({skus:state.skus,box:state.box,placements:state.placements});
 for(const m of Object.keys(sceneModes)){assert.equal(applySceneMode(state,m),true);assert.equal(modeMatches(state.opts,m),true);}
 assert.equal(applySceneMode(state,'not-a-mode'),false);
 assert.equal(JSON.stringify({skus:state.skus,box:state.box,placements:state.placements}),before);
 assert.equal(validate(state.placements,state.box,state.skus).valid,true);
});
test('container ground and steel threshold are drawn at or below packing floor',()=>{
 assert.match(gl,/plankCount/);const sill=containerParts(CONTAINERS['20GP']).find(p=>p.name==='door-sill');assert.ok(sill.y+sill.h/2<=0);assert.match(gl,/g\.depthMask\(false\)/);
 assert.match(fallback,/drawFloor/);assert.match(fallback,/boards/);
});
test('redesign keeps interaction keyboard controls and small screen navigation',()=>{
 assert.match(css,/\.rail\{grid-column:1;grid-row:1;flex-direction:column/);
 assert.match(css,/focus-visible/);assert.match(css,/prefers-reduced-motion/);
 assert.match(css,/@media\(max-width:670px\)/);
});

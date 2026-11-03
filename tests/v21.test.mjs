import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {rankUnloadChoices, filterUnloadChoices, unloadChoiceExplanation} from '../src/unload-workflow.mjs';
const rows=[
 {id:'obstacle',ok:false,item:{x:4600,L:100,z:0,name:'密封箱'},blockers:[{id:'CT02',reason:'CT02 正在柜门方向'}]},
 {id:'near',ok:true,item:{x:4000,L:850,z:0,unitCode:'PAL-01',skuId:'SKU-001'},blockers:[]},
 {id:'far',ok:true,item:{x:0,L:700,z:1100,unitCode:'CT-002',name:'纸箱'},blockers:[]},
];
test('V1.11: ready units precede blocked units, close-to-door before far',()=>{
 assert.deepEqual(rankUnloadChoices(rows).map(x=>x.id),['near','far','obstacle']);
 assert.deepEqual(rows.map(x=>x.id),['obstacle','near','far'],'no mutation');
});
test('V1.11: status filter and case-insensitive search combine',()=>{
 assert.deepEqual(filterUnloadChoices(rows,'ready','pal').map(x=>x.id),['near']);
 assert.deepEqual(filterUnloadChoices(rows,'blocked','CT02').map(x=>x.id),['obstacle']);
 assert.deepEqual(filterUnloadChoices(rows,'all','sku-001').map(x=>x.id),['near']);
 assert.deepEqual(filterUnloadChoices(rows,'invalid').map(x=>x.id),rows.map(x=>x.id));
});
test('V1.11: blocker feedback is explicit and never certifies machinery',()=>{
 assert.match(unloadChoiceExplanation(rows[0],{}),/CT02/);
 assert.match(unloadChoiceExplanation(rows[1],{}),/尚未验证叉车或吊具/);
 assert.match(unloadChoiceExplanation(null,{}),/没有可立即取出/);
});
test('V1.11: scene HUD and filter controls are functional DOM targets',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('../src/app.mjs',import.meta.url),'utf8');
 for(const id of ['unload-hud-take','unload-hud-preview','unload-hud-back','unload-hud-fit','unload-hud-list','unload-hud-title','unload-hud-progressbar']){
  assert.ok(html.includes(`id="${id}"`),id);
  assert.ok(app.includes(`'${id}'`),id);
 }
 assert.match(html,/data-unload-filter="ready"/);
 assert.match(app,/filterUnloadChoices\(/);
});
test('V1.11: 3D cargo remains directly selectable while unload drag orbits',()=>{
 const viewer=readFileSync(new URL('../src/webgl.mjs',import.meta.url),'utf8');
 const app=readFileSync(new URL('../src/app.mjs',import.meta.url),'utf8');
 assert.match(viewer,/handlers\.isUnloading\?\.\(\)/);
 assert.match(viewer,/if\(picked\)this\.handlers\.select/);
 assert.match(app,/isUnloading:\(\)=>s\.section==='unload'/);
});

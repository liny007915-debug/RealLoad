import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {volume} from '../src/engine.mjs';
import {unloadingState,suggestUnloadOrder,unloadOne} from '../src/unloading.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('nonfullscreen wheel follows native document scroll; modified wheel still zooms',()=>{
 const gl=read('src/webgl.mjs');
 const js=read('src/app.mjs');
 assert.match(gl,/if\(!isFullscreen&&!zoomIntent\)return/);
 assert.match(js,/if\(!full&&!wantZoom\)return/);
 assert.match(gl,/this\.zoomBy\(e\.deltaY>0\?\.87:1\.15\)/);
});
test('unload canvas selected geometry edges is scoped independent of shell visibility',()=>{
 const fb=read('src/fallback-render.mjs');const edge=fb.indexOf('const edges=[[0,1]');const shell=fb.indexOf('const shellVisible=');const selected=fb.indexOf('const selected=visible.find');
 assert.ok(edge>=0&&edge<shell&&shell<selected,`scope ordering ${edge},${shell},${selected}`);
});
test('unload sequence strip is actionable, numbered and undoable',()=>{
 const js=read('src/app.mjs');for(const v of ['renderUnloadTimeline','v114-unload-timeline','data-v114-focus','data-v114-action="undo"','data-v114-action="take"','nextUnloadItem()','previewNextUnload()'])assert.ok(js.includes(v),v);
 const css=read('src/v24.css');assert.match(css,/\.v114-timeline-scroll\{[^}]*overflow-x:auto/);
});
test('pallet handling unit volume includes the pallet only once in supplied outer dimensions',()=>{
 const pallet={kind:'pallet',L:1200,W:800,H:1150,weight:360,qty:1};
 assert.equal(volume(pallet),1.104);
 const copy=read('index.html');assert.match(copy,/含托盘底座、缠绕膜后的总高度/);assert.match(copy,/「托盘号」仅用于识别，不会额外增加高度或重量/);
});
test('unloading a suggested next item keeps original placements unchanged',()=>{
 const box={L:6000,W:2400,H:2400,doorW:2350,doorH:2300};
 const items=[{id:'a',x:0,y:30,z:0,L:1000,W:900,H:800,weight:100},{id:'b',x:2200,y:35,z:0,L:1000,W:900,H:800,weight:100}];
 const original=JSON.stringify(items),plan=suggestUnloadOrder(items,box,[],{doorMode:'strict'});
 assert.equal(plan.order[0],'b');
 const taken=unloadOne(items,box,[],plan.order[0],{doorMode:'strict'});
 assert.equal(taken.ok,true);
 assert.deepEqual(taken.removed,['b']);
 assert.equal(unloadingState(items,box,taken.removed,{doorMode:'strict'}).remaining.length,1);
 assert.equal(JSON.stringify(items),original);
});

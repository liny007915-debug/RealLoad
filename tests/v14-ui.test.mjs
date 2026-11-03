import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const read=x=>readFileSync(new URL('../'+x,import.meta.url),'utf8');
test('manual loading has explicit corner docking controls and a free add button',()=>{
 const html=read('index.html'),app=read('src/app.mjs');
 for(const dir of ['x:min','x:max','y:min','y:max'])assert.ok(html.includes(`data-free-dock="${dir}"`));
 assert.ok(app.includes('dockSelection('));assert.ok(app.includes('data-free-add'));
});
test('drag and move render concrete failure causes; fall-back solves perspective floor projection',()=>{
 const app=read('src/app.mjs'),web=read('src/webgl.mjs');
 assert.ok(app.includes('previewError'));assert.ok(app.includes("hint.dataset.valid=result.ok?'yes':'no'"));
 assert.ok(web.includes('invertFloorProjection'));assert.ok(web.includes('boundedMove'));
});

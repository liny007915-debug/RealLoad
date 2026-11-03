/** Frozen per-unit specification regressions: collapse, edits, imports and recovery.
 * Each case owns an isolated browser. No application state is injected.
 */
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {validate} from '../src/engine.mjs';
import {parseDelimited} from '../src/importer.mjs';
const mod=process.env.PLAYWRIGHT_MODULE||'playwright';
const {chromium}=await import(isAbsolute(mod)?pathToFileURL(mod).href:mod);
const out=resolve(process.env.RETENTION_ARTIFACTS||'artifacts/v126/retention');await mkdir(out,{recursive:true});
const results=[],url=process.env.REALLOAD_URL||'http://localhost:4266/';
const state=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('realload-v117')));
const positions=s=>s.placements.map(p=>[p.id,p.x,p.y,p.z,p.locked]);
const geometry=s=>s.placements.map(p=>[p.id,p.x,p.y,p.z,p.L,p.W,p.H]);
const physical=s=>s.placements.map(p=>[p.id,p.name,p.kind,p.L,p.W,p.H,p.weight,p.stackLimit,p.x,p.y,p.z,p.locked]);
async function panel(p,section='cargo'){
 await p.locator(`.rail-item[data-section=${section}]`).click();
 if(!await p.locator('#library').isVisible())await p.locator('#v117-library-toggle').click();
}
async function edit(p,id,patch){
 await panel(p);await p.locator(`.sku-card[data-id="${id}"] [data-action=edit]`).click();
 for(const [key,value] of Object.entries(patch)){
  if(key==='kind')await p.locator(`[data-kind="${value}"]`).click();
  else if(['rotate','allowTilt'].includes(key))await p.locator(`#sku-form [name=${key}]`).setChecked(value);
  else if(key==='priority')await p.locator(`#sku-form [name=${key}]`).selectOption(String(value));
  else await p.locator(`#sku-form [name=${key}]`).fill(String(value));
 }
 await p.locator('#sku-form button[type=submit]').click();
}
async function fixture(p){await p.locator('#import-file').setInputFiles(resolve('examples/v125-free-placement.json'));await p.waitForFunction(()=>JSON.parse(localStorage.getItem('realload-v117')).placements.length===5);}
async function clear(p,scope='placements',confirm=true){
 await p.locator('#global-overflow>summary').click();await p.locator('#clear-cargo-open').click();
 await p.locator(`#clear-cargo-form input[value=${scope}]`).check();await p.locator(confirm?'#clear-cargo-confirm':'#clear-cargo-cancel').click();
}
async function sheetImport(p,rows,strategy='update'){
 const text='SKU,货物名称,长(mm),宽(mm),高(mm),毛重(kg),数量,包装类型\n'+rows.join('\n');
 await p.locator('#import-btn').click();await p.locator('#import-sheet-file').setInputFiles({name:'cargo-update.csv',mimeType:'text/csv',buffer:Buffer.from(text)});
 await p.locator('#import-map-pane:not(.hidden)').waitFor();await p.locator('#import-next').click();await p.locator('#import-strategy').selectOption(strategy);await p.locator('#import-confirm').click();
}
async function visibleScene(p){
 await p.waitForFunction(()=>document.body.dataset.appState==='ready');
 return p.evaluate(()=>{
  const stage=document.querySelector('#stage'),work=document.querySelector('.workspace'),canvas=stage.querySelector('canvas'),r=stage.getBoundingClientRect(),w=work.getBoundingClientRect();
  const hit=document.elementFromPoint(r.x+r.width*.37,r.y+r.height*.37);
  return {stage:r.toJSON(),workspace:w.toJSON(),rows:getComputedStyle(document.querySelector('.layout')).gridTemplateRows,canvas:canvas?.getAttribute('aria-label'),hit:!!hit&&stage.contains(hit),overflow:document.documentElement.scrollWidth-innerWidth};
 });
}
async function run(name,fn,viewport={width:1440,height:900}){
 if(process.env.RETENTION_CASE&&!new RegExp(process.env.RETENTION_CASE).test(name))return;
 console.log('RUN',name);const b=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader'],...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
 const c=await b.newContext({viewport,reducedMotion:'reduce'}),p=await c.newPage(),errors=[],r={name,viewport};p.setDefaultTimeout(12000);p.on('pageerror',e=>errors.push(e.message));
 try{await p.goto(url,{waitUntil:'networkidle'});if(await p.locator('#guide-dialog').evaluate(d=>d.open))await p.locator('#guide-skip').click();r.evidence=await fn(p);assert.deepEqual(errors,[]);r.passed=true;await p.screenshot({path:resolve(out,name+'.png'),fullPage:true});console.log('PASS',name);}
 catch(e){r.passed=false;r.error=e.stack;r.errors=errors;await p.screenshot({path:resolve(out,name+'-failure.png'),fullPage:true}).catch(()=>{});console.log('FAIL',name,e.message);}
 finally{results.push(r);await b.close();await writeFile(resolve(out,'results.json'),JSON.stringify(results,null,2)+'\n');}
}

for(const [width,height] of [[1280,720],[1440,520],[1440,900],[1920,1080]])await run(`collapse-${width}x${height}`,async p=>{
 await p.locator('#pack-btn').click();const before=await state(p),layouts=[];
 for(let i=0;i<3;i++){
  await p.locator('#hide-sidebar').click();const view=await visibleScene(p);assert.ok(view.workspace.height>height*.65,'collapse must retain the full work area');assert.ok(view.stage.height>=180);assert.equal(view.hit,true,'scene must not be clipped by a 44px parent');assert.equal(view.overflow,0);assert.match(view.canvas,/53 件/);layouts.push(view);
  await p.locator('#v117-library-toggle').click();assert.equal(await p.locator('.sku-card').count(),4);assert.equal(await p.locator('#library').isVisible(),true);
 }
 await p.locator('#hide-sidebar').click();await p.reload();const view=await visibleScene(p);assert.equal(view.hit,true);assert.deepEqual(geometry(await state(p)),geometry(before));return{layouts,reloaded:view};
},{width,height});

await run('resize-and-modules-retain-scene',async p=>{
 await p.locator('#pack-btn').click();const before=await state(p),layouts=[];
 for(const [width,height] of [[876,672],[390,700],[1040,700],[1041,700],[1440,900]]){
  await p.setViewportSize({width,height});await panel(p);assert.equal(await p.locator('.sku-card').count(),4);await p.locator('#hide-sidebar').click();
  const view=await visibleScene(p);assert.ok(view.stage.width>200);assert.ok(view.stage.height>=180);assert.equal(view.overflow,0);if(width>=760)assert.equal(view.hit,true);layouts.push({width,height,...view});
 }
 for(const section of ['free','unload','container','quote','cargo']){await panel(p,section);await p.locator('#hide-sidebar').click();assert.equal((await visibleScene(p)).hit,true);}
 assert.deepEqual(geometry(await state(p)),geometry(before));return layouts;
});

await run('selected-four-views-and-fullscreen-collapse',async p=>{
 await fixture(p);await panel(p,'free');await p.locator('#free-mode-select').click();await p.locator('[data-loaded-id="SIM-FREE-A#4"]').click();
 const heading=await p.evaluate(()=>{const w=document.querySelector('.workspace'),h=document.querySelector('.studio-heading h1');return {scroll:w.scrollHeight-w.clientHeight,top:h.getBoundingClientRect().top,workTop:w.getBoundingClientRect().top};});assert.ok(heading.scroll<=1,'desktop work area must include the bottom note without scrolling its heading away');assert.ok(heading.top>=heading.workTop);
 await p.locator('#hide-sidebar').click();await p.locator('[data-view=multi]').click();assert.equal(await p.locator('#stage-canvases canvas').count(),4);assert.equal((await visibleScene(p)).hit,true);
 await p.locator('[data-view=iso]').click();await p.locator('#editor-fullscreen').click();await p.locator('#fullscreen-cargo').click();assert.equal(await p.locator('#library-sheet').evaluate(d=>d.open),true);await p.locator('#hide-sidebar').click();
 const full=await p.locator('#stage').boundingBox();assert.deepEqual(full,{x:0,y:0,width:1440,height:900});await p.locator('#fullscreen-exit').click();assert.equal((await visibleScene(p)).hit,true);assert.equal((await state(p)).placements.length,5);return full;
});

await run('edit-default-53-weight-quantity-metadata-and-reload',async p=>{
 await p.locator('#pack-btn').click();const before=await state(p);
 await edit(p,'SKU-001',{name:'更新后的瓦楞纸箱',weight:17,qty:40,priority:'urgent',deliveryStop:1,groupId:'已核对订单'});
 assert.equal(await p.locator('#sku-dialog').evaluate(d=>d.open),false);let after=await state(p);assert.equal(after.placements.length,53);assert.deepEqual(physical(after),physical(before));assert.equal(after.skus.find(x=>x.id==='SKU-001').weight,17);assert.equal(after.placements.find(x=>x.skuId==='SKU-001').weight,before.placements.find(x=>x.skuId==='SKU-001').weight);assert.equal(validate(after.placements,after.box,after.skus).valid,true);assert.equal(validate(after.placements,after.box,after.skus).weight,validate(before.placements,before.box,before.skus).weight);
 assert.equal(after.placements.find(x=>x.skuId==='SKU-001').priority,'urgent');assert.equal(after.placements.find(x=>x.skuId==='SKU-001').deliveryStop,1);
 await p.reload();after=await state(p);assert.deepEqual(physical(after),physical(before));assert.equal(after.skus[0].qty,40);assert.match(await p.locator('#metric-count').textContent(),/53 \/ 57/);return{count:after.placements.length,weight:await p.locator('#metric-weight').textContent(),futureWeight:after.skus[0].weight};
});

await run('valid-size-and-packaging-edits-retain-all-items',async p=>{
 await fixture(p);const before=await state(p);await edit(p,'SIM-FREE-IR',{L:900,W:750,H:650,weight:160,name:'更新外廓的机械设备',kind:'machine',qty:2});
 const after=await state(p);assert.deepEqual(physical(after),physical(before));assert.equal(after.placements.length,5);const ir=after.placements.at(-1);assert.deepEqual([ir.L,ir.W,ir.H,ir.kind,ir.weight],[800,700,700,'irregular',145]);assert.equal(validate(after.placements,after.box,after.skus).valid,true);
 await p.locator('.sku-card[data-id="SIM-FREE-IR"] [data-action=place]').click();const added=await state(p);assert.equal(added.placements.length,6);assert.deepEqual(physical({...added,placements:added.placements.slice(0,5)}),physical(before));assert.deepEqual(added.placements.filter(p=>p.skuId==='SIM-FREE-IR').map(p=>[p.L,p.W,p.H,p.kind,p.weight]),[[800,700,700,'irregular',145],[900,750,650,'machine',160]]);assert.equal(validate(added.placements,added.box,added.skus).valid,true);
 await p.reload();assert.deepEqual(physical(await state(p)),physical(added));return{oldUnit:ir,newUnit:added.placements.at(-1)};
});

await run('conflicting-edits-keep-plan-and-form-input',async p=>{
 await fixture(p);const before=await state(p),conflicts=[];
 for(const [sku,patch] of [['SIM-FREE-A',{qty:2}],['SIM-FREE-A',{qty:3}],['SIM-FREE-IR',{qty:0}]]){
  await edit(p,sku,patch);assert.equal(await p.locator('#sku-dialog').evaluate(d=>d.open),true);const text=await p.locator('#sku-save-feedback').textContent();assert.match(text,/所有货物与位置已保留/);assert.deepEqual((await state(p)).placements,before.placements);assert.deepEqual((await state(p)).skus,before.skus);
  const [key,value]=Object.entries(patch)[0];assert.equal(await p.locator(`#sku-form [name=${key}]`).inputValue(),String(value));conflicts.push(text);await p.locator('#sku-dialog-cancel').click();
 }
 for(const patch of [{weight:0},{L:0}]){await edit(p,'SIM-FREE-IR',patch);assert.equal(await p.locator('#sku-dialog').evaluate(d=>d.open),true);const key=Object.keys(patch)[0];assert.equal(await p.locator(`#sku-form [name=${key}]`).evaluate(input=>input.validity.valid),false);assert.deepEqual((await state(p)).placements,before.placements);assert.deepEqual((await state(p)).skus,before.skus);await p.locator('#sku-dialog-cancel').click();}
 await edit(p,'SIM-FREE-IR',{L:7000,weight:30000,qty:2});assert.equal(await p.locator('#sku-dialog').evaluate(d=>d.open),false);const oversized=await state(p);assert.deepEqual(physical(oversized),physical(before));await p.locator('.sku-card[data-id="SIM-FREE-IR"] [data-action=place]').click();assert.deepEqual((await state(p)).placements,oversized.placements);
 await edit(p,'SIM-FREE-IR',{L:850,weight:150,qty:1});assert.equal(await p.locator('#sku-dialog').evaluate(d=>d.open),false);assert.equal((await state(p)).placements.length,5);return conflicts;
});

await run('rename-sku-preserves-unit-ids-and-selection',async p=>{
 await fixture(p);await panel(p,'free');await p.locator('#free-mode-select').click();await p.locator('[data-loaded-id="SIM-FREE-A#2"]').click();const before=await state(p);
 await edit(p,'SIM-FREE-A',{id:'SIM-RENAMED',qty:6,weight:22});const after=await state(p);assert.deepEqual(physical(after),physical(before));assert.equal(after.selected,before.selected);assert.equal(after.placements[1].skuId,'SIM-RENAMED');assert.equal(after.placements[1].ordinal,2);assert.equal(validate(after.placements,after.box,after.skus).valid,true);
 await p.reload();await panel(p,'free');await p.locator('#free-mode-select').click();assert.equal(await p.locator('[data-loaded-id]').count(),5);await p.locator('[data-loaded-id="SIM-FREE-A#2"]').click();assert.match(await p.locator('#context-name').textContent(),/纸箱/);
 await p.locator('#global-overflow>summary').click();await p.locator('#export-btn').click();const pending=p.waitForEvent('download');await p.locator('#export-manifest').click();const download=await pending,path=resolve(out,'renamed-manifest.csv');await download.saveAs(path);
 const rows=parseDelimited(await readFile(path,'utf8')),header=rows.shift(),loaded=rows.filter(row=>row[header.indexOf('是否已装')]==='已装'),renamed=loaded.filter(row=>row[header.indexOf('内部记录号')]==='SIM-RENAMED');assert.equal(loaded.length,5);assert.equal(renamed.length,4);assert.ok(renamed.every(row=>row[header.indexOf('毛重(kg)')]==='20'));assert.equal(loaded.find(row=>row[header.indexOf('X(mm)')]==='1800')[header.indexOf('Y(mm)')],String(before.placements[3].y));
 return after.placements.map(p=>[p.id,p.skuId,p.ordinal]);
});

await run('spreadsheet-update-and-append-preserve-existing',async p=>{
 await fixture(p);const before=await state(p);await sheetImport(p,['SIM-FREE-IR,更新的设备,900,750,650,160,1,机械设备']);
 assert.equal(await p.locator('#import-dialog').evaluate(d=>d.open),false);let after=await state(p);assert.deepEqual(physical(after),physical(before));assert.equal(after.skus.length,2);assert.equal(after.placements.at(-1).weight,145);assert.equal(after.skus.find(s=>s.id==='SIM-FREE-IR').weight,160);
 await sheetImport(p,['SIM-FREE-IR,不会覆盖,1200,750,650,200,1,机械设备','EXTRA,新增待装纸箱,300,300,300,10,2,纸箱'],'append');after=await state(p);assert.deepEqual(physical(after),physical(before));assert.equal(after.skus.length,3);assert.equal(after.placements.at(-1).weight,145);assert.equal(after.skus.find(s=>s.id==='SIM-FREE-IR').weight,160);return{units:after.placements.length,skus:after.skus.length};
});

await run('spreadsheet-conflict-is-atomic-and-retryable',async p=>{
 await fixture(p);const before=await state(p);await sheetImport(p,['SIM-FREE-A,数量不足,400,400,400,20,2,纸箱','EXTRA,不应部分添加,300,300,300,10,2,纸箱']);
 assert.equal(await p.locator('#import-dialog').evaluate(d=>d.open),true);assert.match(await p.locator('#import-commit-feedback').textContent(),/所有货物与位置已保留/);assert.deepEqual((await state(p)).placements,before.placements);assert.deepEqual((await state(p)).skus,before.skus);
 await p.locator('#import-close').click();await sheetImport(p,['SIM-FREE-IR,更正,850,700,700,150,1,异形货物']);assert.equal(await p.locator('#import-dialog').evaluate(d=>d.open),false);assert.equal((await state(p)).placements.length,5);return{retained:5};
});

await run('json-data-only-or-empty-coordinates-never-clears',async p=>{
 await fixture(p);const before=await state(p);
 for(const includeEmpty of [false,true]){
  const record={...before.skus[1],weight:includeEmpty?152:150},data={skus:[record],...(includeEmpty?{placements:[],container:{...before.box,L:6400}}:{})};
  await p.locator('#import-file').setInputFiles({name:'cargo-data.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
  await p.waitForFunction(weight=>JSON.parse(localStorage.getItem('realload-v117')).skus.find(s=>s.id==='SIM-FREE-IR').weight===weight,record.weight);const after=await state(p);assert.deepEqual(physical(after),physical(before));assert.equal(after.skus.length,2);
 }
 const after=await state(p);assert.equal(after.box.L,6400);
 await clear(p);assert.equal((await state(p)).placements.length,0);
 await p.locator('#import-file').setInputFiles({name:'unloaded-data.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({skus:[{...before.skus[1],weight:153}],placements:[]}))});
 await p.waitForFunction(()=>JSON.parse(localStorage.getItem('realload-v117')).skus.find(s=>s.id==='SIM-FREE-IR').weight===153);
 const unloaded=await state(p);assert.equal(unloaded.placements.length,0);assert.equal(unloaded.skus.length,2);assert.deepEqual(unloaded.skus[0],before.skus[0]);return{retainedWhileLoaded:after.placements.length,unloadedInventory:unloaded.skus.length,containerL:after.box.L};
});

await run('clear-is-explicit-cancellable-and-undoable',async p=>{
 await fixture(p);const before=await state(p);await clear(p,'all',false);assert.deepEqual((await state(p)).placements,before.placements);
 await clear(p);let after=await state(p);assert.equal(after.placements.length,0);assert.deepEqual(after.skus,before.skus);assert.deepEqual(after.box,before.box);await p.locator('#history-undo').click();assert.deepEqual((await state(p)).placements,before.placements);
 await clear(p,'all');after=await state(p);assert.equal(after.placements.length,0);assert.equal(after.skus.length,0);assert.deepEqual(after.box,before.box);await p.locator('#history-undo').click();assert.deepEqual((await state(p)).skus,before.skus);assert.deepEqual((await state(p)).placements,before.placements);await p.reload();assert.deepEqual((await state(p)).placements,before.placements);return{restored:5};
});

await run('free-draft-retained-through-data-update-and-clear-undo',async p=>{
 await fixture(p);await panel(p,'free');await p.locator('#free-mode-select').click();await p.locator('[data-loaded-id="SIM-FREE-A#4"]').click();await p.locator('#free-draft-mode').click();await p.locator('#context-z').fill('250');await p.locator('#context-apply').click();const before=await state(p);
 await edit(p,'SIM-FREE-A',{weight:23,id:'SIM-DRAFT-RENAMED',qty:6});let after=await state(p);assert.deepEqual(after.freeDraft,before.freeDraft);assert.deepEqual(physical(after),physical(before));assert.equal(after.placements[3].weight,20);assert.equal(after.skus.find(s=>s.id==='SIM-DRAFT-RENAMED').weight,23);
 await clear(p);assert.deepEqual((await state(p)).freeDraft,{});await p.locator('#history-undo').click();after=await state(p);assert.deepEqual(after.freeDraft,before.freeDraft);assert.equal(after.placements.length,5);await p.reload();assert.deepEqual((await state(p)).freeDraft,before.freeDraft);return after.freeDraft;
});

await run('container-and-planning-settings-never-remove-cargo',async p=>{
 await fixture(p);const before=await state(p);await panel(p,'container');await p.locator('#container-L').fill('6400');await p.locator('#container-edit-form button[type=submit]').click();assert.deepEqual(geometry(await state(p)),geometry(before));
 await p.locator('#container-L').fill('1000');await p.locator('#container-edit-form button[type=submit]').click();assert.equal((await state(p)).box.L,6400);assert.deepEqual(geometry(await state(p)),geometry(before));await p.locator('#reset-container').click();await p.locator('#hide-sidebar').click();
 await p.locator('#planner-settings>summary').click();await p.locator('#planner-policy').selectOption('distance');await p.locator('#planner-max-lift').fill('500');await p.locator('#planner-form button[type=submit]').click();assert.deepEqual(geometry(await state(p)),geometry(before));return{retained:5};
});

for(const [width,height] of [[876,672],[390,700]])await run(`small-screen-update-and-clear-${width}`,async p=>{
 await fixture(p);const before=await state(p);await edit(p,'SIM-FREE-IR',{weight:155});assert.equal(await p.locator('#sku-dialog').evaluate(d=>d.open),false);assert.deepEqual(physical(await state(p)),physical(before));assert.equal((await state(p)).skus.find(s=>s.id==='SIM-FREE-IR').weight,155);
 if(await p.locator('#library-sheet').evaluate(d=>d.open))await p.locator('#library-return-scene').click();await clear(p);assert.equal((await state(p)).placements.length,0);if(await p.locator('#history-undo').isVisible())await p.locator('#history-undo').click();else{await p.locator('#global-overflow>summary').click();await p.locator('#undo-btn').click();}assert.equal((await state(p)).placements.length,5);return{retained:5,overflow:(await visibleScene(p)).overflow};
},{width,height});

console.log(JSON.stringify({passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length}));if(results.some(r=>!r.passed))process.exitCode=1;

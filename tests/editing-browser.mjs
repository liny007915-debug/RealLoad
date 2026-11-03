/** V1.22 editing and dispatch acceptance. No injected application state. */
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {validate} from '../src/engine.mjs';
import {suggestUnloadOrder} from '../src/unloading.mjs';
import {parseDelimited} from '../src/importer.mjs';

const mod=process.env.PLAYWRIGHT_MODULE||'playwright';
const {chromium}=await import(isAbsolute(mod)?pathToFileURL(mod).href:mod);
const out=resolve(process.env.EDITING_ARTIFACTS||'artifacts/v122/editing');await mkdir(out,{recursive:true});
const results=[],storage='realload-v117';
const state=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),storage);
const rect=(page,selector)=>page.locator(selector).boundingBox();
const coordinates=placements=>placements.map(p=>[p.id,p.x,p.y,p.z,p.L,p.W,p.H]);
async function load(page,id='door-blocker-maneuver'){
 await page.locator('#scenario-open').click();await page.locator(`[name=scenario][value="${id}"]`).check();await page.locator('#scenario-apply').click();
 await page.waitForFunction(id=>JSON.parse(localStorage.getItem('realload-v117')).scenarioId===id,id);
}
async function free(page,mode='iso'){
 await page.evaluate(async()=>{
  const {Viewport}=await import('/src/webgl.mjs'),draw=Viewport.prototype.draw;
  Viewport.prototype.draw=function(...args){if(this.parent.closest('#stage-canvases'))window.editView=this;return draw.apply(this,args);};
 });
 await page.locator('.rail-item[data-section=free]').click();
 if(await page.locator('#library-sheet').evaluate(d=>d.open))await page.locator('#library-return-scene').click();
 await page.locator(`[data-view=${mode}]`).click();
 await page.waitForFunction(mode=>window.editView?.mode===mode,mode);
}
async function dragTarget(page,skuId,axis='x',distance=400){
 return page.evaluate(({skuId,axis,distance})=>{
  const v=window.editView,p=v.state.items.find(p=>p.skuId===skuId),r=v.canvas.getBoundingClientRect();
  // Search actual visible AABB hits, avoiding labels and handles that consume input.
  for(const height of [.7,.4,.9])for(const u of [.5,.25,.75]){
   const world=[(p.x+p.L*u)/1000,(p.z+p.H*height)/1000,(p.y+p.W/2)/1000],a=v.project(world);
   if(v.hit(a.x,a.y)?.id!==p.id)continue;
   const hit=document.elementFromPoint(r.x+a.x,r.y+a.y);if(hit!==v.canvas)continue;
   const next=[...world];next[{x:0,y:2,z:1}[axis]]+=distance/1000;const b=v.project(next);
   return{id:p.id,x:r.x+a.x,y:r.y+a.y,dx:b.x-a.x,dy:b.y-a.y};
  }
  throw Error('No directly visible hit for '+skuId+' in '+v.mode);
 },{skuId,axis,distance});
}
async function moveMouse(page,target){await page.mouse.move(target.x,target.y);await page.mouse.down();await page.mouse.move(target.x+target.dx,target.y+target.dy,{steps:12});await page.mouse.up();}
async function run(name,action,viewport={width:1440,height:900}){
 if(process.env.EDITING_CASE&&!new RegExp(process.env.EDITING_CASE).test(name))return;
 const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader'],...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
 const context=await browser.newContext({viewport,reducedMotion:'reduce',isMobile:viewport.width<=600,hasTouch:viewport.width<=600}),page=await context.newPage(),errors=[];
 page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));const result={name,viewport};console.log('RUN',name);
 try{
  await page.goto(process.env.REALLOAD_URL||'http://localhost:4202',{waitUntil:'networkidle'});
  if(await page.locator('#guide-dialog').evaluate(d=>d.open))await page.locator('#guide-skip').click();
  result.evidence=await action(page,context);assert.deepEqual(errors,[]);
  const s=await state(page);assert.equal(validate(s.placements,s.box,s.skus).valid,true);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No document overflow');
  await page.screenshot({path:resolve(out,name+'.png'),fullPage:true});result.passed=true;console.log('PASS',name);
 }catch(error){result.passed=false;result.error=error.message;result.stack=error.stack?.split('\n').slice(0,4);result.errors=errors;
  result.observed=await page.evaluate(()=>({box:JSON.parse(localStorage.getItem('realload-v117'))?.box,message:document.querySelector('#message').textContent,dialogs:[...document.querySelectorAll('dialog[open]')].map(d=>d.id),feedback:document.querySelector('#context-feedback').textContent})).catch(()=>null);
  await page.screenshot({path:resolve(out,'failure-'+name+'.png'),fullPage:true}).catch(()=>{});console.log('FAIL',name,error.message);
 }finally{results.push(result);await context.close();await browser.close();await writeFile(resolve(out,'results.json'),JSON.stringify(results,null,2)+'\n');}
}

for(const viewport of [{width:1440,height:900},{width:390,height:700}])await run('container-draft-enter-'+viewport.width,async page=>{
 await load(page);await page.locator('#container-settings-shortcut').click();assert.equal(await page.locator('#library-container').isVisible(),true);
 const before=await state(page);await page.locator('#container-L').fill('6200');
 // A render caused by changing a view must retain an unsaved container draft.
 if(viewport.width<600)await page.locator('#library-return-scene').click();
 await page.locator('[data-view=top]').click();await page.locator('#container-settings-shortcut').click();
 assert.equal(await page.locator('#container-L').inputValue(),'6200');assert.match(await page.locator('#container-draft-status').textContent(),/草稿尚未保存/);
 await page.locator('#container-L').press('Enter');const changed=await state(page);
 assert.equal(changed.box.L,6200);assert.deepEqual(changed.placements,before.placements);
 await page.locator('#container-doorW').fill('9999');assert.equal(await page.locator('#container-doorW').getAttribute('aria-invalid'),'true');
 await page.locator('#apply-container').click();assert.deepEqual((await state(page)).box,changed.box);
 assert.match(await page.locator('#dimension-audit').textContent(),/门.*宽|尺寸输入有误/);
 await page.locator('#reset-container').click();assert.equal(await page.locator('#container-doorW').inputValue(),String(changed.box.doorW));
 return{box:changed.box,units:changed.placements.length};
},viewport);

await run('container-conflict-reflow-and-undo',async page=>{
 await load(page);await page.locator('#container-settings-shortcut').click();const before=await state(page);
 await page.locator('#container-L').fill('3500');await page.locator('#apply-container').click();
 assert.match(await page.locator('#dimension-audit').textContent(),/冲突/);assert.deepEqual((await state(page)).box,before.box);
 await page.locator('#reflow-container').click();const repacked=await state(page);
 assert.equal(repacked.box.L,3500);assert.equal(repacked.placements.length,before.placements.length);
 assert.deepEqual(repacked.placements.map(p=>[p.id,p.unitCode]).sort(),before.placements.map(p=>[p.id,p.unitCode]).sort());assert.deepEqual(repacked.skus,before.skus);
 await page.locator('#container-L').fill('1200');await page.locator('#container-W').fill('1900');await page.locator('#container-doorW').fill('1800');
 await page.locator('#reflow-container').click();assert.deepEqual((await state(page)).placements,repacked.placements);assert.equal((await state(page)).box.L,3500);
 await page.keyboard.press('Tab');await page.locator('#container-draft-status').click();await page.keyboard.press('Control+z');
 assert.deepEqual((await state(page)).placements,before.placements);assert.deepEqual((await state(page)).box,before.box);
 return{before:before.box.L,after:repacked.box.L,ids:repacked.placements.map(p=>p.id)};
});

await run('container-edit-in-native-fullscreen',async page=>{
 await load(page);await page.locator('#editor-fullscreen').click();await page.waitForFunction(()=>document.fullscreenElement?.id==='stage');
 await page.locator('#container-appearance>summary').click();await page.locator('#container-edit-dimensions').click();await page.locator('#container-L').fill('6400');await page.locator('#apply-container').click();
 assert.equal((await state(page)).box.L,6400);assert.equal(await page.evaluate(()=>document.fullscreenElement.id),'stage');
 if(await page.locator('#library-sheet').evaluate(d=>d.open))await page.locator('#library-return-scene').click();
 const canvas=await rect(page,'#stage-canvases');assert.equal(canvas.x,0);assert.equal(canvas.y,0);assert.equal(canvas.width,876);assert.equal(canvas.height,672);
 await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.fullscreenElement);return{canvas};
},{width:876,height:672});

await run('first-drag-keeps-canvas-and-untouched-axis',async page=>{
 await load(page);await free(page);const before=await state(page),target=await dragTarget(page,'SIM-ROUTE-REAR','x',500),canvas=await rect(page,'#stage-canvases');
 await page.mouse.move(target.x,target.y);await page.mouse.down();const during=await rect(page,'#stage-canvases');
 assert.equal(during.width,canvas.width);assert.equal(during.height,canvas.height);
 await page.mouse.move(target.x+target.dx,target.y+target.dy,{steps:12});await page.mouse.up();const after=await state(page),p=after.placements.find(p=>p.id===target.id),old=before.placements.find(p=>p.id===target.id);
 assert.ok(p.x>old.x+400&&p.x<old.x+600);assert.equal(p.y,old.y);assert.equal(p.z,old.z);
 assert.equal(await page.locator('body').evaluate(e=>e.classList.contains('defer-cargo-editor')),false);
 await page.locator('#scene-zoom-home').click();await page.keyboard.press('Control+z');assert.deepEqual((await state(page)).placements,before.placements);
 return{canvas,during,before:coordinates([old]),after:coordinates([p])};
});

for(const [mode,id,axis] of [['side','SIM-ROUTE-REAR','x'],['door','SIM-ROUTE-DOOR','y']])await run('direct-drag-'+mode,async page=>{
 await load(page);await free(page,mode);const before=await state(page),target=await dragTarget(page,id,axis,400);await moveMouse(page,target);
 const after=await state(page),old=before.placements.find(p=>p.id===target.id),p=after.placements.find(p=>p.id===target.id);
 assert.ok(p[axis]>old[axis]);for(const k of ['x','y','z'])if(k!==axis)assert.equal(p[k],old[k]);
 return{before:coordinates([old]),after:coordinates([p])};
});

await run('gizmo-nudge-lock-cancel-and-preview-readonly',async page=>{
 await load(page);await free(page,'top');await moveMouse(page,await dragTarget(page,'SIM-ROUTE-REAR','x',300));
 let before=await state(page);assert.equal(before.opts.axes,false,'Editing handles do not require engineering axes');
 assert.ok(await page.locator('.gizmo-handle.axis-x').isVisible());
 await page.locator('#context-move-step').fill('50');await page.locator('#context-move-step').press('Tab');
 await page.locator('[data-context-nudge="x:1"]').click();let after=await state(page);assert.equal(after.placements[0].x,before.placements[0].x+50);
 before=after;const target=await dragTarget(page,'SIM-ROUTE-REAR','x',400);await page.mouse.move(target.x,target.y);await page.mouse.down();await page.mouse.move(target.x+target.dx,target.y+target.dy,{steps:5});
 await page.locator('#stage-canvases canvas').dispatchEvent('pointercancel',{pointerId:1});await page.mouse.up();assert.deepEqual((await state(page)).placements,before.placements);
 await page.locator('#context-lock').click();const locked=await state(page);await moveMouse(page,await dragTarget(page,'SIM-ROUTE-REAR','x',400));assert.deepEqual((await state(page)).placements,locked.placements);
 assert.equal(await page.locator('[data-context-nudge="x:1"]').isDisabled(),true);await page.locator('#context-lock').click();
 const plan=(await state(page)).placements;await page.locator('#workflow-next').click();await page.waitForFunction(()=>document.querySelector('#stage').dataset.playbackIndex==='1');
 assert.equal(await page.locator('[data-context-nudge="x:1"]').isDisabled(),true);assert.equal(await page.locator('.gizmo-handle').count(),0);
 assert.deepEqual((await state(page)).placements,plan);await page.locator('#workflow-exit').click();
 return{step:50,selected:(await state(page)).selected};
});

await run('touch-intentional-move-and-default-scroll',async(page,context)=>{
 await load(page);await free(page,'top');const cdp=await context.newCDPSession(page),before=await state(page);
 let target=await dragTarget(page,'SIM-ROUTE-REAR','x',500);
 const touch=async(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y,id:1}]});
 await touch('touchStart',target.x,target.y);await touch('touchMove',target.x,target.y-80);await touch('touchEnd');await page.waitForTimeout(450);
 assert.deepEqual((await state(page)).placements,before.placements);assert.equal((await state(page)).touchMove,false);
 await page.locator('#touch-move-toggle').tap();assert.equal(await page.locator('#touch-move-toggle').getAttribute('aria-pressed'),'true');
 await page.locator('#stage-canvases').scrollIntoViewIfNeeded();await page.waitForTimeout(150);await page.evaluate(()=>{window.touchTrace=[];for(const name of ['pointerdown','pointermove','pointerup','pointercancel'])document.addEventListener(name,e=>window.touchTrace.push({type:e.type,x:e.clientX,y:e.clientY,target:e.target.tagName,native:window.editView?.drag?.nativeTouch,started:window.editView?.drag?.started,item:window.editView?.drag?.item?.id}));});target=await dragTarget(page,'SIM-ROUTE-REAR','x',600);
 await touch('touchStart',target.x,target.y);for(let n=1;n<=10;n++)await touch('touchMove',target.x+target.dx*n/10,target.y+target.dy*n/10);await touch('touchEnd');
 const after=await state(page),p=after.placements.find(p=>p.id===target.id),old=before.placements.find(p=>p.id===target.id);
 assert.ok(p.x>old.x,JSON.stringify({target,trace:await page.evaluate(()=>window.touchTrace),canvas:await rect(page,'#stage-canvases')}));assert.equal(p.y,old.y);assert.equal(p.z,old.z);
 const sizes=await page.locator('[data-context-nudge]').evaluateAll(nodes=>nodes.map(n=>({w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height})));
 assert.ok(sizes.every(r=>r.w>=44&&r.h>=44));return{before:coordinates([old]),after:coordinates([p]),sizes};
},{width:390,height:700});

for(const width of [1440,320])await run('dispatch-preview-and-order-'+width,async page=>{
 await page.locator('#scenario-open').click();await page.locator('[name=scenario][value=dispatch-priority]').check();
 assert.equal(await page.locator('.scenario-manifest tbody tr').count(),7);const text=await page.locator('#scenario-preview').textContent();
 assert.match(text,/2,731 kg/);assert.match(text,/紧急或优先 4 件/);assert.match(text,/3 个交付站次/);assert.match(text,/860/);
 const dialog=await rect(page,'#scenario-dialog');assert.ok(dialog.x>=0&&dialog.x+dialog.width<=width+1);
 await page.screenshot({path:resolve(out,'dispatch-manifest-'+width+'.png'),fullPage:true});
 await page.locator('#scenario-apply').click();await page.locator('[data-playback-mode=unload]').click();
 const s=await state(page),order=await page.locator('[data-playback-id]').evaluateAll(nodes=>nodes.map(n=>n.dataset.playbackId));
 assert.deepEqual(order,suggestUnloadOrder(s.placements,s.box,[],{doorMode:'smart'}).order);assert.equal(order[0],'SIM-DISPATCH-GATE#1');assert.ok(order[1].startsWith('SIM-DISPATCH-COOL'));
 await page.locator('#workflow-play').click();await page.waitForFunction(()=>document.querySelector('#stage').dataset.playbackState==='complete',null,{timeout:15000});
 assert.equal(await page.locator('#workflow-count').textContent(),'9 / 9 件');assert.deepEqual((await state(page)).placements,s.placements);await page.locator('#workflow-exit').click();
 return{order,units:s.placements.length};
},{width,height:width===320?568:900});

await run('edit-dispatch-refreshes-order-and-export-round-trip',async page=>{
 await load(page,'dispatch-priority');await page.locator('[data-playback-mode=unload]').click();const before=await state(page);
 const orderBefore=await page.locator('[data-playback-id]').evaluateAll(nodes=>nodes.map(n=>n.dataset.playbackId));
 await page.locator('#sku-list [data-id="SIM-DISPATCH-COOL"] [data-action=edit]').click();
 await page.locator('#sku-form [name=priority]').selectOption('low');await page.locator('#sku-form [name=deliveryStop]').fill('3');await page.locator('#sku-form button[type=submit]').click();
 const after=await state(page);assert.deepEqual(coordinates(after.placements),coordinates(before.placements));
 assert.equal(after.placements.find(p=>p.skuId==='SIM-DISPATCH-COOL').priority,'low');
 const order=await page.locator('[data-playback-id]').evaluateAll(nodes=>nodes.map(n=>n.dataset.playbackId));assert.notDeepEqual(order,orderBefore);
 assert.deepEqual(order,suggestUnloadOrder(after.placements,after.box,[],{doorMode:'smart'}).order);
 await page.locator('#global-overflow>summary').click();await page.locator('#export-btn').click();
 let pending=page.waitForEvent('download');await page.locator('#export-json').click();const json=await pending;await json.saveAs(resolve(out,'dispatch-roundtrip.json'));
 const data=JSON.parse(await readFile(resolve(out,'dispatch-roundtrip.json'),'utf8'));assert.deepEqual(data.placements,after.placements);
 await page.locator('#global-overflow>summary').click();await page.locator('#export-btn').click();pending=page.waitForEvent('download');await page.locator('#export-manifest').click();const csv=await pending;await csv.saveAs(resolve(out,'dispatch-manifest.csv'));
 const rows=parseDelimited(await readFile(resolve(out,'dispatch-manifest.csv'),'utf8')),header=rows[0];assert.equal(rows.length,10);assert.ok(header.includes('交付站次'));
 const i=header.indexOf('交付站次');assert.ok(rows.slice(1).every(r=>Number(r[i])>=1));
 await page.locator('#import-file').setInputFiles(resolve(out,'dispatch-roundtrip.json'));assert.deepEqual((await state(page)).placements,after.placements);
 return{orderBefore,orderAfter:order,metadata:after.skus.map(s=>[s.id,s.priority,s.deliveryStop])};
});

await run('import-dispatch-csv-keeps-logistics',async page=>{
 await page.locator('#global-overflow>summary').click();await page.locator('#clear-cargo-open').click();await page.locator('#clear-cargo-form input[value=all]').check();await page.locator('#clear-cargo-confirm').click();
 await page.locator('#import-btn').click();await page.locator('#import-sheet-file').setInputFiles(resolve('examples/v122-dispatch-priority.csv'));
 await page.waitForSelector('#import-map-pane:not(.hidden)');assert.notEqual(await page.locator('[data-map-field=deliveryStop]').inputValue(),'-1');
 await page.locator('#import-next').click();assert.match(await page.locator('#import-preview-body').textContent(),/第 1 站.*紧急/);
 await page.locator('#import-strategy').selectOption('update');await page.locator('#import-confirm').click();const s=await state(page);
 assert.equal(s.skus.length,7);assert.equal(s.skus.reduce((n,s)=>n+s.qty,0),9);assert.equal(s.skus.find(s=>s.id==='SIM-DISPATCH-HEAVY').weight,860);
 assert.equal(s.skus.find(s=>s.id==='SIM-DISPATCH-COOL').deliveryStop,1);assert.equal(s.skus.find(s=>s.id==='SIM-DISPATCH-COOL').priority,'urgent');
 await page.locator('#pack-btn').click();assert.equal((await state(page)).placements.length,9);return{skus:s.skus.map(s=>[s.id,s.weight,s.priority,s.deliveryStop])};
});

console.log(JSON.stringify({passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length}));if(results.some(r=>!r.passed))process.exitCode=1;

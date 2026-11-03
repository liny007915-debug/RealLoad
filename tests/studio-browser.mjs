/** Task acceptance. A fresh browser per case keeps software WebGL resources isolated. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {validate} from '../src/engine.mjs';
import {suggestUnloadOrder} from '../src/unloading.mjs';
const mod=process.env.PLAYWRIGHT_MODULE||'playwright';
const {chromium}=await import(isAbsolute(mod)?pathToFileURL(mod).href:mod);
const out=resolve(process.env.STUDIO_ARTIFACTS||'artifacts/v121/studio');await mkdir(out,{recursive:true});
const results=[],storage='realload-v117';
const state=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),storage);
const rect=(page,selector)=>page.locator(selector).boundingBox();
const inside=(r,v,label)=>{assert.ok(r&&r.width>0&&r.height>0,label+' visible');assert.ok(r.x>=-1&&r.y>=-1&&r.x+r.width<=v.width+1&&r.y+r.height<=v.height+1,label+' inside viewport');};
async function load(page,id='door-blocker-maneuver'){
 await page.locator('#scenario-open').click();await page.locator(`input[name=scenario][value="${id}"]`).check();await page.locator('#scenario-apply').click();
 await page.waitForFunction(id=>JSON.parse(localStorage.getItem('realload-v117')).scenarioId===id,id);
}
async function choose(page,id){
 if(page.viewportSize().width<=1040)await page.locator('#v117-library-toggle').click();
 await page.locator(`#sku-list .sku-card[data-id="${id}"] .sku-description`).click();
 await page.waitForFunction(id=>JSON.parse(localStorage.getItem('realload-v117')).selected?.startsWith(id+'#'),id);
 await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
}
async function waitComplete(page){await page.waitForFunction(()=>document.getElementById('stage').dataset.playbackState==='complete',null,{timeout:12000});}
async function run(name,action,viewport={width:1440,height:900},motion='reduce'){
 if(process.env.STUDIO_CASE&&!new RegExp(process.env.STUDIO_CASE).test(name))return;
 const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader'],...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
 const context=await browser.newContext({viewport,reducedMotion:motion,isMobile:viewport.width<600,hasTouch:viewport.width<600});
 const page=await context.newPage(),errors=[];page.setDefaultTimeout(7000);page.on('pageerror',e=>errors.push(e.message));
 const result={name,viewport};console.log('RUN',name);
 try{
  await page.goto(process.env.REALLOAD_URL||'http://localhost:4202',{waitUntil:'networkidle'});
  if(await page.locator('#guide-dialog').evaluate(d=>d.open))await page.locator('#guide-skip').click();
  result.evidence=await action(page,viewport);
  assert.deepEqual(errors,[]);const s=await state(page);assert.equal(validate(s.placements,s.box,s.skus).valid,true);
  await page.locator('#message').evaluate(e=>e.classList.remove('visible'));
  await page.screenshot({path:resolve(out,name+'.png'),fullPage:true});result.passed=true;console.log('PASS',name);
 }catch(error){result.passed=false;result.error=error.message;result.errors=errors;await page.screenshot({path:resolve(out,'failure-'+name+'.png'),fullPage:true}).catch(()=>{});console.log('FAIL',name,error.message);}
 finally{results.push(result);await context.close();await browser.close();await writeFile(resolve(out,'results.json'),JSON.stringify(results,null,2));}
}

for(const [width,height] of [[1920,1080],[1440,900],[876,672],[820,500],[390,700],[320,568]])await run('responsive-'+width+'x'+height,async(page,v)=>{
 await load(page,'irregular-equipment');await choose(page,'SIM-IRR-L');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 const stage=await rect(page,'#stage'),editor=await rect(page,'#context-editor');assert.ok(stage.height>=200);
 if(width>=760){assert.ok(editor.x>=stage.x+stage.width-1);await page.locator('#context-apply').scrollIntoViewIfNeeded();inside(await rect(page,'#context-apply'),v,'Apply position');}
 else{assert.ok(editor.y>=stage.y+stage.height);await page.locator('#context-apply').scrollIntoViewIfNeeded();inside(await rect(page,'#context-apply'),v,'Phone apply');}
 await page.locator('#workflow-next').click();await page.waitForFunction(()=>document.querySelector('#stage').dataset.playbackIndex==='1');
 await page.locator('.workflow-settings>summary').click();assert.equal(await page.locator('#workflow-back').isVisible(),true);await page.locator('#workflow-back').click();
 assert.equal(await page.locator('#workflow-count').textContent(),'0 / 7 件');await page.locator('#workflow-exit').click();
 return {stage,editor,save:await rect(page,'#context-apply')};
},{width,height});

await run('native-fullscreen-fills-screen',async(page,v)=>{
 await load(page);await choose(page,'SIM-ROUTE-DOOR');const before=await rect(page,'#stage');
 await page.locator('#editor-fullscreen').click();await page.waitForFunction(()=>!!document.fullscreenElement);
 const measured=await page.evaluate(()=>({scene:document.getElementById('stage-canvases').getBoundingClientRect().toJSON(),w:innerWidth,h:innerHeight,native:document.fullscreenElement.id}));
 assert.equal(measured.native,'stage');assert.equal(measured.scene.x,0);assert.equal(measured.scene.y,0);assert.equal(measured.scene.width,measured.w);assert.equal(measured.scene.height,measured.h);
 await page.locator('#fullscreen-inspector').click();inside(await rect(page,'#context-apply'),v,'Fullscreen edit action');
 const edit=await rect(page,'#context-editor'),apply=await rect(page,'#context-apply');assert.ok(apply.y+apply.height<=edit.y+edit.height,'Save action must remain inside the floating inspector');
 const after=await rect(page,'#stage');assert.ok(after.width>=before.width);assert.ok(after.height>=before.height);
 await page.screenshot({path:resolve(out,'native-fullscreen-active.png')});await page.keyboard.press('Escape');
 await page.waitForFunction(()=>!document.fullscreenElement);assert.equal(await page.locator('body').evaluate(e=>e.classList.contains('v112-fullscreen')),false);
 return {measured,before,after};
},{width:876,height:672});

await run('large-door-side-edit-and-smart-round-trip',async page=>{
 await load(page);await choose(page,'SIM-ROUTE-DOOR');await page.locator('#context-x').fill('4700');await page.locator('#context-y').fill('0');await page.locator('#context-apply').click();
 const s=await state(page),original=structuredClone(s.placements);assert.equal(original.find(p=>p.skuId==='SIM-ROUTE-DOOR').x,4700);
 const strict=suggestUnloadOrder(s.placements,s.box,[],{doorMode:'strict'}),smart=suggestUnloadOrder(s.placements,s.box,[],{doorMode:'smart'});
 assert.equal(strict.complete,false);assert.equal(smart.complete,true);assert.equal(smart.order[0],'SIM-ROUTE-DOOR#1');assert.ok(smart.routeDetails['SIM-ROUTE-REAR#1'].some(s=>s.axis==='y'));
 await page.locator('#workflow-route-mode').selectOption('strict');await page.locator('#workflow-play').click();assert.equal(await page.locator('#stage').getAttribute('data-playback-state'),'idle');
 await page.locator('#workflow-route-mode').selectOption('smart');
 for(const mode of ['unload','load']){
  await page.locator(`[data-playback-mode="${mode}"]`).click();await page.locator('#workflow-play').click();await waitComplete(page);assert.equal(await page.locator('#workflow-count').textContent(),'3 / 3 件');
  assert.deepEqual((await state(page)).placements,original);await page.locator('#workflow-exit').click();
 }
 return {strictUnresolved:strict.unresolved,smartOrder:smart.order,routes:smart.routes};
});

await run('selected-blocked-cargo-computes-prerequisites',async page=>{
 await load(page);await page.locator('.rail-item[data-section=unload]').click();
 const target=page.locator('[data-unload-take="SIM-ROUTE-REAR#1"]');assert.equal(await target.textContent(),'先清障');assert.equal(await target.isEnabled(),true);
 await target.click();await waitComplete(page);const s=await state(page);
 assert.deepEqual(s.unloadRemoved,['SIM-ROUTE-DOOR#1','SIM-ROUTE-REAR#1']);assert.equal(s.placements.length,3);
 await page.locator('#workflow-exit').click();return {removed:s.unloadRemoved};
});

await run('live-container-dimensions-and-permanent-door',async page=>{
 await load(page,'irregular-equipment');await page.locator('#container-settings-shortcut').click();
 for(const [key,value] of Object.entries({L:6200,W:2400,H:2500,doorW:2200,doorH:2200}))await page.locator(`[data-container-field="${key}"]`).fill(String(value));
 await page.locator('#apply-container').click();
 assert.equal((await state(page)).placements.length,7,'Compatible container edits must preserve cargo positions');
 const changed=await state(page);
 await page.locator('[data-container-field=L]').fill('1000');await page.locator('#apply-container').click();
 assert.deepEqual((await state(page)).box,changed.box,'Conflicting dimensions must preserve the last valid box');assert.deepEqual((await state(page)).placements,changed.placements);
 assert.match(await page.locator('#message').textContent(),/未应用.*保留/);
 assert.match(await page.locator('#container-reference-size').textContent(),/1,000 × 2,400 × 2,500/,'The unsaved draft stays visible for correction');assert.equal(await page.locator('#container-draft-badge').isVisible(),true);
 await page.locator('#reset-container').click();
 await page.waitForFunction(()=>document.querySelector('#container-reference-size').textContent.includes('6,200')&&document.querySelector('#container-draft-badge').hidden);
 assert.match(await page.locator('#container-reference-size').textContent(),/6,200 × 2,400 × 2,500/);assert.match(await page.locator('#container-reference-door').textContent(),/2,200 × 2,200/);
 await page.locator('#container-appearance>summary').click();await page.locator('[data-shell=hidden]').click();await page.locator('#container-appearance-close').click();
 const views=[];
 for(const mode of ['iso','top','door','side','multi']){
  await page.locator(`[data-view="${mode}"]`).click();await page.waitForTimeout(80);
  const expected=mode==='multi'?4:1;assert.equal(await page.locator('.container-pin.door').count(),expected);assert.equal(await page.locator('#stage-canvases canvas').count(),expected);
  await page.screenshot({path:resolve(out,'container-frame-'+mode+'.png')});views.push(mode);
 }
 return {box:(await state(page)).box,views};
});

await run('computed-route-is-visible-during-real-animation',async page=>{
 await load(page);await page.locator('[data-playback-mode=unload]').click();await page.locator('#workflow-play').click();
 await page.waitForFunction(()=>Number(document.querySelector('#stage').dataset.motionProgress)>.2);
 assert.equal(await page.locator('.cargo-route').count(),1);await page.locator('#workflow-play').click();
 const progress=await page.locator('#stage').getAttribute('data-motion-progress');await page.waitForTimeout(150);assert.equal(await page.locator('#stage').getAttribute('data-motion-progress'),progress);
 await page.screenshot({path:resolve(out,'actual-motion-paused.png')});await page.locator('#workflow-play').click();await waitComplete(page);
 return {pausedProgress:progress,backend:await page.locator('#renderer-status').textContent()};
},{width:1440,height:900},'no-preference');


await run('real-gizmo-drag-labels-and-dimensions',async page=>{
 await load(page);await choose(page,'SIM-ROUTE-REAR');await page.locator('[data-view=top]').click();
 await page.locator('#viewport-more>summary').click();await page.locator('#display-settings').click();await page.locator('[data-display=axes]').check();await page.keyboard.press('Escape');
 const initial=await state(page),before=initial.placements.find(p=>p.skuId==='SIM-ROUTE-REAR');
 const handle=await rect(page,'.gizmo-handle.axis-x');assert.ok(handle?.width>0);
 const direction=await page.locator('.gizmo-line.axis-x').evaluate(e=>{const m=new DOMMatrix(getComputedStyle(e).transform);return {x:m.a,y:m.b};});
 await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();
 await page.mouse.move(handle.x+handle.width/2+15*direction.x,handle.y+handle.height/2+15*direction.y,{steps:8});await page.mouse.up();
 await page.waitForFunction(x=>JSON.parse(localStorage.getItem('realload-v117')).placements.find(p=>p.skuId==='SIM-ROUTE-REAR').x!==x,before.x);
 const after=(await state(page)).placements.find(p=>p.id===before.id);assert.ok(after.x>before.x);assert.equal(after.y,before.y);assert.equal(after.z,before.z);
 await page.keyboard.press('Control+z');await page.waitForFunction(x=>JSON.parse(localStorage.getItem('realload-v117')).placements.find(p=>p.skuId==='SIM-ROUTE-REAR').x===x,before.x);
 await page.locator('#viewport-more>summary').click();await page.locator('#display-settings').click();
 for(const option of ['tags','dimensions','coords'])await page.locator(`[data-display="${option}"]`).check();await page.keyboard.press('Escape');
 assert.equal((await state(page)).opts.dimensions,true);assert.equal(await page.locator('.dimension-label').count(),2,'Top view displays the measured length and width');
 assert.ok((await page.locator('.dimension-label').allTextContents()).every(s=>/^[长宽] /.test(s))); 
 await page.screenshot({path:resolve(out,'drag-and-measured-labels.png')});
 return {before,after,dimensionLabels:await page.locator('.dimension-label').count()};
});

console.log(JSON.stringify({passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length}));if(results.some(r=>!r.passed))process.exitCode=1;

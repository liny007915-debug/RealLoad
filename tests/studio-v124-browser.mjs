/** V1.24: launch recovery, staged container editing and the neutral palette. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {CONTAINERS,validate} from '../src/engine.mjs';

const modulePath=process.env.PLAYWRIGHT_MODULE||'playwright';
const {chromium}=await import(isAbsolute(modulePath)?pathToFileURL(modulePath).href:modulePath);
const output=resolve(process.env.V124_ARTIFACTS||'artifacts/v124/new');await mkdir(output,{recursive:true});
const url=process.env.REALLOAD_URL||'http://localhost:4202/',results=[];
const state=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('realload-v117')));
async function load(page,id='door-blocker-maneuver'){
 await page.locator('#scenario-open').click();await page.locator(`[name=scenario][value="${id}"]`).check();await page.locator('#scenario-apply').click();
 await page.waitForFunction(id=>JSON.parse(localStorage.getItem('realload-v117')).scenarioId===id,id);
}
async function run(name,action,viewport={width:1440,height:900},options={}){
 if(process.env.V124_CASE&&!new RegExp(process.env.V124_CASE).test(name))return;
 const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader'],...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
 const context=await browser.newContext({viewport,reducedMotion:'reduce',isMobile:viewport.width<=600,hasTouch:viewport.width<=600});
 const page=await context.newPage(),errors=[],result={name,viewport};page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));console.log('RUN',name);
 try{
  await page.goto(options.file?pathToFileURL(resolve('index.html')).href:url,{waitUntil:'networkidle'});
  if(!options.file){await page.waitForSelector('body[data-app-state=ready]');if(await page.locator('#guide-dialog').evaluate(d=>d.open))await page.locator('#guide-skip').click();}
  result.evidence=await action(page,context);
  assert.deepEqual(errors,[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  if(!options.file){const s=await state(page);assert.equal(validate(s.placements,s.box,s.skus).valid,true);}
  await page.screenshot({path:resolve(output,name+'.png'),fullPage:true});result.passed=true;console.log('PASS',name);
 }catch(error){result.passed=false;result.error=error.message;result.stack=error.stack?.split('\n').slice(0,5);result.errors=errors;await page.screenshot({path:resolve(output,'failure-'+name+'.png'),fullPage:true}).catch(()=>{});console.log('FAIL',name,error.message);}
 finally{results.push(result);await context.close();await browser.close();await writeFile(resolve(output,'results.json'),JSON.stringify(results,null,2)+'\n');}
}

await run('direct-html-shows-launcher-instructions',async page=>{
 assert.equal(await page.locator('body').getAttribute('data-app-state'),'error');assert.match(await page.locator('#startup-title').textContent(),/启动器/);
 assert.match(await page.locator('#startup-description').textContent(),/启动RealLoad.command/);assert.equal(await page.locator('#startup-open').getAttribute('href'),'http://localhost:4202/');
 assert.equal(await page.locator('#app').isVisible(),false);return{title:await page.locator('#startup-title').textContent()};
},{width:876,height:672},{file:true});

await run('module-failure-retry-preserves-saved-plan',async page=>{
 await load(page);const before=await state(page);
 await page.route('**/src/app.mjs',route=>route.abort('failed'));await page.reload({waitUntil:'networkidle'});
 await page.waitForSelector('body[data-app-state=error]');assert.match(await page.locator('#startup-title').textContent(),/未能完成启动/);assert.equal(await page.locator('#startup-details').isVisible(),true);assert.deepEqual(await state(page),before);
 await page.unroute('**/src/app.mjs');await page.locator('#startup-retry').click();await page.waitForSelector('body[data-app-state=ready]');
 const after=await state(page);assert.deepEqual(after.placements,before.placements);assert.deepEqual(after.box,before.box);return{recovered:true,units:after.placements.length};
});

await run('preset-is-a-preview-until-saved',async page=>{
 await load(page);await page.locator('#container-settings-shortcut').click();const before=await state(page);
 await page.locator('#container-preset').selectOption('40HC');await page.waitForSelector('#container-draft-badge:not([hidden])');
 assert.equal((await state(page)).box.L,before.box.L);assert.equal(await page.locator('#container-L').inputValue(),String(CONTAINERS['40HC'].L));
 assert.match(await page.locator('#container-reference-name').textContent(),/40HC.*草稿/);assert.match(await page.locator('#container-reference-size').textContent(),/12,032/);
 assert.equal(await page.locator('#container-source').getAttribute('href'),CONTAINERS['40HC'].source);
 await page.locator('#apply-container').click();const after=await state(page);assert.deepEqual(after.box,CONTAINERS['40HC']);assert.deepEqual(after.placements,before.placements);
 assert.equal(await page.locator('#container-draft-badge').isVisible(),false);return{before:before.box.id,after:after.box.id};
});

await run('door-dimensions-link-is-explicit-and-measured',async page=>{
 await load(page);await page.locator('#container-settings-shortcut').click();const before=await state(page);
 await page.locator('#container-W').fill('2200');assert.equal(await page.locator('#container-doorW').inputValue(),String(before.box.doorW));assert.equal(await page.locator('#container-doorW').getAttribute('aria-invalid'),'true');
 assert.match(await page.locator('#container-error-doorW').textContent(),/2200/);await page.locator('#reset-container').click();
 await page.locator('#container-link-door').check();await page.locator('#container-W').fill('2200');await page.locator('#container-H').fill('2300');
 assert.equal(Number(await page.locator('#container-doorW').inputValue()),2200-(before.box.W-before.box.doorW));
 assert.equal(Number(await page.locator('#container-doorH').inputValue()),2300-(before.box.H-before.box.doorH));
 await page.locator('[data-container-diagram=door]').click();assert.match(await page.locator('#container-diagram').getAttribute('aria-label'),/柜门正面/);
 assert.deepEqual((await state(page)).box,before.box);await page.locator('#reset-container').click();assert.equal(await page.locator('#container-W').inputValue(),String(before.box.W));return{door:before.box.doorW,linkedWidth:2188};
});

await run('invalid-draft-pauses-preview-and-recovers',async page=>{
 await load(page);await page.locator('#container-settings-shortcut').click();const before=await state(page);
 await page.locator('#container-L').fill('6500');await page.waitForSelector('#container-draft-badge:not([hidden])');assert.match(await page.locator('#container-reference-size').textContent(),/6,500/);
 await page.locator('#container-doorH').fill('');await page.waitForFunction(()=>document.querySelector('#container-draft-badge').hidden);
 assert.equal(await page.locator('#container-doorH').getAttribute('aria-invalid'),'true');assert.match(await page.locator('#container-diagram').getAttribute('aria-label'),/预览暂停/);
 assert.match(await page.locator('#container-reference-size').textContent(),/5,900/);assert.doesNotMatch(await page.locator('#container-edit-form').textContent(),/NaN/);
 await page.locator('#apply-container').click();assert.equal(await page.locator('#container-doorH').evaluate(el=>el===document.activeElement),true);assert.deepEqual((await state(page)).box,before.box);
 await page.locator('#container-doorH').fill(String(before.box.doorH));await page.waitForSelector('#container-draft-badge:not([hidden])');await page.locator('#reset-container').click();return{original:before.box.L};
});

await run('four-views-share-draft-and-restore-without-persisting',async page=>{
 await load(page);const before=await state(page);
 await page.evaluate(async()=>{const {Viewport}=await import('/src/webgl.mjs'),draw=Viewport.prototype.draw;window.draftViews={};Viewport.prototype.draw=function(...args){window.draftViews[this.mode]=this;return draw.apply(this,args);};});
 await page.locator('[data-view=multi]').click();await page.locator('#container-settings-shortcut').click();await page.locator('#container-L').fill('6400');
 await page.waitForFunction(()=>['iso','top','door','side'].every(mode=>window.draftViews[mode]?.state.box.L===6400));
 const frames=await page.evaluate(()=>Object.fromEntries(Object.entries(window.draftViews).map(([mode,v])=>[mode,{L:v.state.box.L,items:v.state.items.map(p=>[p.id,p.x,p.y,p.z])}])));
 assert.deepEqual(frames.iso.items,frames.top.items);assert.deepEqual(frames.top.items,frames.door.items);assert.deepEqual(frames.door.items,frames.side.items);assert.equal((await state(page)).box.L,before.box.L);
 await page.locator('#reset-container').click();await page.waitForFunction(L=>['iso','top','door','side'].every(mode=>window.draftViews[mode]?.state.box.L===L),before.box.L);return{frames,storedLength:before.box.L};
});

await run('draft-protects-cargo-from-another-container-calculation',async page=>{
 await load(page);await page.locator('#container-settings-shortcut').click();const before=await state(page);
 await page.locator('#container-L').fill('6500');await page.waitForSelector('#container-draft-badge:not([hidden])');
 await page.locator('#pack-btn').click();assert.match(await page.locator('#message').textContent(),/先保存箱体草稿/);assert.deepEqual((await state(page)).placements,before.placements);assert.deepEqual((await state(page)).box,before.box);
 await page.locator('#container-link-door').check();await page.locator('#container-W').fill('');await page.locator('#container-doorH').fill('2200');await page.locator('#container-W').fill('2300');
 assert.equal(Number(await page.locator('#container-doorW').inputValue()),2300-(before.box.W-before.box.doorW));
 await page.locator('#reset-container').click();await page.locator('#pack-btn').click();assert.match(await page.locator('#message').textContent(),/已放入/);return{protected:true,restored:true};
});

for(const viewport of [{width:1440,height:900},{width:1280,height:720},{width:876,height:672},{width:390,height:700},{width:320,height:640}])await run('container-save-stays-visible-'+viewport.width,async page=>{
 await load(page);await page.locator('#container-settings-shortcut').click();
 const visible=async selector=>page.locator(selector).evaluate(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;});
 assert.equal(await visible('#apply-container'),true);assert.equal(await visible('#reset-container'),true);assert.equal(await visible('#reflow-container'),true);assert.equal(await visible('#container-preset'),true);
 await page.locator('#container-payload').fill('30000');await page.locator('#apply-container').click();assert.equal((await state(page)).box.payload,30000);
 assert.equal(await visible('#apply-container'),true);await page.locator('.container-templates>summary').click();assert.equal(await visible('#apply-container'),true);await page.locator('.container-templates>summary').click();
 return{save:await page.locator('#apply-container').boundingBox(),scrollable:await page.locator('.container-editor-scroll').evaluate(el=>el.scrollHeight>el.clientHeight)};
},viewport);

await run('warm-neutral-palette-in-scene-and-dialogs',async page=>{
 await load(page,'daily-mixed');
 const styles=await page.evaluate(()=>{const css=id=>{const s=getComputedStyle(document.querySelector(id));return{background:s.backgroundColor,color:s.color};};return{body:css('body'),primary:css('#pack-btn'),scene:css('#stage'),active:css('[data-view=iso]')};});
 assert.equal(styles.primary.background,'rgb(48, 51, 46)');assert.equal(styles.primary.color,'rgb(255, 255, 255)');assert.equal(styles.body.background,'rgb(244, 243, 239)');
 await page.screenshot({path:resolve(output,'desktop-warm-white-graphite.png'),fullPage:true});
 await page.locator('#scenario-open').click();assert.equal(await page.locator('#scenario-apply').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(48, 51, 46)');await page.locator('#scenario-close').click();
 await page.locator('#add-sku').click();assert.equal(await page.locator('#sku-form .action-btn').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(48, 51, 46)');await page.locator('#sku-dialog-cancel').click();
 await page.locator('.rail-item[data-section=unload]').click();assert.equal(await page.locator('#unload-ready').evaluate(el=>getComputedStyle(el).color),'rgb(37, 38, 35)');
 assert.equal(await page.locator('#unload-list [data-unload-take]').first().evaluate(el=>getComputedStyle(el).color),'rgb(48, 51, 46)');
 await page.locator('.rail-item[data-section=free]').click();await page.locator('#free-mode-select').click();assert.equal(await page.locator('#free-group-select').evaluate(el=>getComputedStyle(el).color),'rgb(48, 51, 46)');assert.equal(await page.locator('.free-segment').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(244, 243, 239)');
 await page.locator('#viewport-more>summary').click();await page.locator('#shortcut-open').click();assert.equal(await page.locator('.v17-key-help kbd').first().evaluate(el=>getComputedStyle(el).color),'rgb(37, 38, 35)');await page.locator('#shortcuts-close').click();return styles;
});

await run('native-fullscreen-keeps-zero-inset-after-draft',async page=>{
 await load(page);await page.locator('#editor-fullscreen').click();await page.waitForFunction(()=>document.fullscreenElement?.id==='stage');
 await page.locator('#container-appearance>summary').click();await page.locator('#container-edit-dimensions').click();await page.locator('#container-L').fill('6500');assert.equal(await page.locator('#apply-container').isVisible(),true);await page.locator('#apply-container').click();
 if(await page.locator('#library-sheet').evaluate(d=>d.open))await page.locator('#library-return-scene').click();
 const canvas=await page.locator('#stage-canvases').boundingBox();assert.deepEqual(canvas,{x:0,y:0,width:876,height:672});assert.equal((await state(page)).box.L,6500);
 await page.screenshot({path:resolve(output,'fullscreen-warm-white-graphite.png')});await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.fullscreenElement);return{canvas};
},{width:876,height:672});

console.log(JSON.stringify({passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length}));if(results.some(r=>!r.passed))process.exitCode=1;

/** V1.23 end-to-end acceptance. Uses real controls and isolated storage. */
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {HELP_TOPICS} from '../src/help-topics.mjs';
import {suggestUnloadOrder} from '../src/unloading.mjs';
import {validate} from '../src/engine.mjs';
const mod=process.env.PLAYWRIGHT_MODULE||'playwright';
const {chromium}=await import(isAbsolute(mod)?pathToFileURL(mod).href:mod);
const output=resolve(process.env.V123_ARTIFACTS||'artifacts/v123/new');await mkdir(output,{recursive:true});
const results=[],storage='realload-v117',state=p=>p.evaluate(key=>JSON.parse(localStorage.getItem(key)),storage);
const coords=s=>s.placements.map(p=>[p.id,p.x,p.y,p.z,p.L,p.W,p.H]);
const inside=(r,v)=>assert.ok(r&&r.width>0&&r.height>0&&r.x>=-1&&r.y>=-1&&r.x+r.width<=v.width+1&&r.y+r.height<=v.height+1,JSON.stringify(r));
async function run(name,fn,viewport={width:1440,height:900}){
 if(process.env.V123_CASE&&!new RegExp(process.env.V123_CASE).test(name))return;
 const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader'],...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
 const context=await browser.newContext({viewport,reducedMotion:'reduce',isMobile:viewport.width<=600,hasTouch:viewport.width<=600}),page=await context.newPage(),errors=[];
 page.setDefaultTimeout(9000);page.on('pageerror',e=>errors.push(e.message));const r={name,viewport};console.log('RUN',name);
 try{await page.goto(process.env.REALLOAD_URL||'http://localhost:4202',{waitUntil:'networkidle'});if(await page.locator('#guide-dialog').evaluate(d=>d.open))await page.locator('#guide-skip').click();r.evidence=await fn(page,context,viewport);assert.deepEqual(errors,[]);const s=await state(page);assert.equal(validate(s.placements,s.box,s.skus).valid,true);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:resolve(output,name+'.png')});r.passed=true;console.log('PASS',name);}
 catch(e){r.passed=false;r.error=e.stack;r.pageErrors=errors;await page.screenshot({path:resolve(output,'failure-'+name+'.png')}).catch(()=>{});console.log('FAIL',name,e.message);}
 finally{results.push(r);await context.close();await browser.close();await writeFile(resolve(output,'results.json'),JSON.stringify(results,null,2)+'\n');}
}
async function sample(p,id='route-comparison'){await p.locator('#scenario-open').click();await p.locator(`[name=scenario][value="${id}"]`).check();await p.locator('#scenario-apply').click();await p.waitForFunction(id=>JSON.parse(localStorage.getItem('realload-v117')).scenarioId===id,id);}
async function planner(p){await p.locator('#planner-settings>summary').click();await p.waitForFunction(()=>document.querySelector('#planner-panel').matches(':popover-open'));}
async function setPolicy(p,value,lift=''){await p.locator('#planner-policy').selectOption(value);await p.locator('#planner-max-lift').fill(lift);await p.locator('#planner-form button[type=submit]').click();await p.waitForFunction(value=>JSON.parse(localStorage.getItem('realload-v117')).routePolicy===value,value);}
await run('desktop-adjacent-tools-and-scene',async(p,c,v)=>{
 await sample(p);const rail=await p.locator('.rail').boundingBox(),library=await p.locator('#library').boundingBox(),stage=await p.locator('#stage').boundingBox();assert.equal(rail.x,0);assert.ok(rail.width<=73);assert.ok(library.x>=rail.width-1);assert.ok(stage.height>=480);assert.ok(stage.x>=library.x+library.width);inside(stage,v);
 for(const sel of ['#scenario-open','#studio-help','#command-open','#workflow-play'])inside(await p.locator(sel).boundingBox(),v);
 return{rail,library,stage};
});
await run('command-keyboard-search-opens-real-container-editor',async p=>{
 await sample(p);const before=await state(p);await p.keyboard.press('Control+k');await p.locator('#command-search').fill('箱体');assert.ok(await p.locator('[data-command=container]').count());await p.keyboard.press('ArrowDown');await p.keyboard.press('ArrowUp');await p.keyboard.press('Enter');assert.equal(await p.locator('#command-dialog').evaluate(d=>d.open),false);assert.equal(await p.locator('#library-container').isVisible(),true);assert.deepEqual(coords(await state(p)),coords(before));
 await p.locator('#command-open').click();await p.locator('#command-search').fill('zzzzzz不存在');assert.equal(await p.locator('.command-empty').isVisible(),true);await p.keyboard.press('Escape');assert.equal(await p.locator('#command-dialog').evaluate(d=>d.open),false);
 return{unmodified:true};
});
for(const viewport of [{width:1440,height:900},{width:390,height:700},{width:320,height:568}])await run('complete-help-search-'+viewport.width,async(p,c,v)=>{
 await p.locator('#help-btn').click();await p.locator('#guide-mode-library').click();assert.equal(await p.locator('[data-topic]').count(),20);inside(await p.locator('#guide-dialog').boundingBox(),v);
 for(const topic of HELP_TOPICS){await p.locator(`[data-topic="${topic.id}"]`).click();assert.equal(await p.locator('#guide-heading').textContent(),topic.title);assert.equal(await p.locator('#guide-do').textContent(),topic.button);inside(await p.locator('#guide-do').boundingBox(),v);}
 await p.locator('#guide-search').fill('抬升');assert.ok(await p.locator('[data-topic=planning]').count());await p.locator('[data-topic=planning]').click();assert.match(await p.locator('#guide-description').textContent(),/最多抬升/);await p.screenshot({path:resolve(output,'guide-manual-'+v.width+'.png')});
 await p.locator('#guide-search').fill('未定义功能zz');assert.equal(await p.locator('#guide-no-results').isVisible(),true);await p.locator('#guide-search').fill('');await p.locator('[data-topic=container]').click();await p.locator('#guide-do').click();assert.equal(await p.locator('#guide-dialog').isVisible(),false);assert.equal(await p.locator('#library-container').isVisible(),true);assert.match(await p.locator('#container-edit-form').textContent(),/保存尺寸/);
 return{topics:20,allActionsReachable:true};
},viewport);
await run('contextual-guide-opens-control-and-returns-to-the-same-topic',async p=>{
 await sample(p);const before=await state(p);await p.locator('#help-btn').click();await p.locator('#guide-mode-library').click();await p.locator('[data-topic=views]').click();await p.locator('#guide-do').click();await p.waitForSelector('#feature-coach:not([hidden])');assert.equal(await p.locator('.viewport-tabs').getAttribute('data-help-highlight'),'true');await p.locator('#coach-back').click();assert.equal(await p.locator('#guide-heading').textContent(),HELP_TOPICS.find(t=>t.id==='views').title);assert.deepEqual(coords(await state(p)),coords(before));await p.locator('#guide-close').click();
 return{topic:'views',unmodified:true};
});
await run('route-preference-changes-real-path-and-keeps-position-data',async(p,c,v)=>{
 await sample(p);await p.locator('[data-playback-mode=unload]').click();const before=await state(p);await planner(p);await setPolicy(p,'low-lift');assert.match(await p.locator('#planner-metrics').textContent(),/累计抬升0 m/);const low=suggestUnloadOrder((await state(p)).placements,before.box,[],{doorMode:'smart',policy:'low-lift'});assert.equal(low.metrics.liftMm,0);
 await setPolicy(p,'distance');assert.match(await p.locator('#planner-metrics').textContent(),/累计抬升0.2 m/);const distance=suggestUnloadOrder((await state(p)).placements,before.box,[],{doorMode:'smart',policy:'distance'});assert.equal(distance.metrics.liftMm,200);assert.ok(distance.metrics.distanceMm<low.metrics.distanceMm);
 await setPolicy(p,'distance','0');assert.match(await p.locator('#planner-metrics').textContent(),/累计抬升0 m/);assert.deepEqual(coords(await state(p)),coords(before));inside(await p.locator('#planner-panel').boundingBox(),v);
 await p.locator('#planner-close').click();await p.locator('#workflow-play').click();await p.waitForFunction(()=>document.querySelector('#stage').dataset.playbackState==='complete');assert.equal(await p.locator('#workflow-count').textContent(),'2 / 2 件');assert.deepEqual(coords(await state(p)),coords(before));
 return{lowLift:low.metrics,distance:distance.metrics};
});
for(const viewport of [{width:876,height:500},{width:390,height:700}])await run('planner-validation-and-popover-fit-'+viewport.width,async(p,c,v)=>{
 await sample(p);await planner(p);inside(await p.locator('#planner-panel').boundingBox(),v);const before=await state(p);await p.locator('#planner-max-lift').fill('-1');await p.locator('#planner-form button[type=submit]').click();assert.equal(await p.locator('#planner-max-lift').getAttribute('aria-invalid'),'true');assert.equal((await state(p)).maxLift,before.maxLift);
 await setPolicy(p,'low-lift','0');assert.equal((await state(p)).maxLift,0);assert.equal(await p.locator('#planner-max-lift').getAttribute('aria-invalid'),null);await p.locator('#planner-close').click();await p.reload({waitUntil:'networkidle'});assert.equal((await state(p)).maxLift,0);assert.equal((await state(p)).routePolicy,'low-lift');
 return{saved:{policy:'low-lift',maxLift:0}};
},viewport);
await run('native-fullscreen-retains-computation-and-help',async(p,c,v)=>{
 await sample(p);await p.locator('#editor-fullscreen').click();await p.waitForFunction(()=>document.fullscreenElement?.id==='stage');const canvas=await p.locator('#stage-canvases').boundingBox();assert.deepEqual(canvas,{x:0,y:0,width:v.width,height:v.height});await p.locator('#fullscreen-playback').click();await planner(p);inside(await p.locator('#planner-panel').boundingBox(),v);await setPolicy(p,'low-lift','0');await p.locator('#planner-help').click();await p.waitForSelector('#guide-dialog[open]');inside(await p.locator('#guide-dialog').boundingBox(),v);assert.match(await p.locator('#guide-heading').textContent(),/装卸计算/);await p.locator('#guide-close').click();await p.keyboard.press('Escape');await p.waitForFunction(()=>!document.fullscreenElement);return{canvas};
});
await run('planning-json-export-and-import-preserve-constraints',async(p,c)=>{
 await sample(p);await planner(p);await setPolicy(p,'low-lift','0');await p.locator('#planner-close').click();const before=await state(p);await p.locator('#global-overflow>summary').click();await p.locator('#export-btn').click();const download=p.waitForEvent('download');await p.locator('#export-json').click();const file=await download,path=resolve(output,'planning-round-trip.json');await file.saveAs(path);const json=JSON.parse(await readFile(path,'utf8'));assert.deepEqual(json.planning,{doorMode:'smart',clearance:0,policy:'low-lift',maxLift:0});
 await planner(p);await setPolicy(p,'distance','100');await p.locator('#planner-close').click();await p.locator('#import-file').setInputFiles(path);await p.waitForFunction(()=>JSON.parse(localStorage.getItem('realload-v117')).maxLift===0);assert.equal((await state(p)).routePolicy,'low-lift');assert.deepEqual(coords(await state(p)),coords(before));return{exportedSettings:json.planning};
});
await run('responsive-resize-keeps-key-metrics-visible',async p=>{
 await sample(p);await p.setViewportSize({width:390,height:700});await p.waitForFunction(()=>document.querySelector('.workspace-stats').parentElement.classList.contains('workspace-title'));for(const id of ['metric-count','metric-weight','metric-volume'])assert.ok(await p.locator('#'+id).isVisible());const first=await p.locator('.workspace-stats').boundingBox();assert.ok(first.y<250);await p.setViewportSize({width:1440,height:900});await p.waitForFunction(()=>document.querySelector('.workspace-stats').parentElement.classList.contains('workspace-footer'));return{phoneMetrics:first};
});
console.log(JSON.stringify({total:results.length,passed:results.filter(r=>r.passed).length}));if(results.some(r=>!r.passed))process.exitCode=1;

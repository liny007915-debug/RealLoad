/** V1.21 physical rendering and scene-only fullscreen acceptance.
 * Isolated browser contexts; real UI actions preserve the user's stored work.
 * PLAYWRIGHT_MODULE, CHROME_EXECUTABLE, REALLOAD_URL, PHYSICAL_ARTIFACTS,
 * PHYSICAL_CASE can override this local test harness.
 */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {validate} from '../src/engine.mjs';
const mod=process.env.PLAYWRIGHT_MODULE||'playwright';
const {chromium}=await import(isAbsolute(mod)?pathToFileURL(mod).href:mod);
const out=resolve(process.env.PHYSICAL_ARTIFACTS||'artifacts/v121/physical');await mkdir(out,{recursive:true});
const results=[],storage='realload-v117',origin=process.env.REALLOAD_URL||'http://localhost:4202';
const state=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),storage);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const inside=(r,v,label)=>assert.ok(r&&r.width>0&&r.height>0&&r.x>=-1&&r.y>=-1&&r.x+r.width<=v.width+1&&r.y+r.height<=v.height+1,label+' must be visible inside the display '+JSON.stringify({rect:r,viewport:v}));
async function appearanceAccessible(page,v){
 const panel=page.locator('.container-appearance-body');await panel.waitFor({state:'visible'});inside(await panel.boundingBox(),v,'Appearance popover');
 const controls=await panel.evaluate(panel=>{const bounds=panel.getBoundingClientRect();return [...panel.querySelectorAll('button,input')].map(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{name:e.id||e.textContent||e.type,inside:r.x>=bounds.x&&r.y>=bounds.y&&r.right<=bounds.right&&r.bottom<=bounds.bottom,reachable:hit===e||e.contains(hit)};});});
 assert.ok(controls.length>=9);assert.deepEqual(controls.filter(e=>!e.inside||!e.reachable),[],'Every appearance control must be visible and unobstructed');
}
async function load(page){
 await page.locator('#scenario-open').click();await page.locator('[name=scenario][value=door-blocker-maneuver]').check();await page.locator('#scenario-apply').click();
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('realload-v117')).scenarioId==='door-blocker-maneuver');
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
}
async function fullscreenSize(page,v){
 const r=await page.locator('#stage-canvases').boundingBox();assert.deepEqual(r,{x:0,y:0,width:v.width,height:v.height});
 assert.equal(await page.evaluate(()=>document.fullscreenElement?.id),'stage');
 assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).zoom),'1');return r;
}
async function run(name,fn,viewport={width:1440,height:900}){
 if(process.env.PHYSICAL_CASE&&!new RegExp(process.env.PHYSICAL_CASE).test(name))return;
 const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader'],...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
 const context=await browser.newContext({viewport,deviceScaleFactor:1,reducedMotion:'reduce',hasTouch:viewport.width<600,isMobile:viewport.width<600});
 const page=await context.newPage(),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 const result={name,viewport};console.log('RUN',name);
 try{
  await page.goto(origin,{waitUntil:'networkidle'});if(await page.locator('#guide-dialog').evaluate(d=>d.open))await page.locator('#guide-skip').click();
  result.evidence=await fn(page,viewport);assert.deepEqual(errors,[]);
  const s=await state(page);assert.equal(validate(s.placements,s.box,s.skus).valid,true);
  await page.locator('#message').evaluate(e=>e.classList.remove('visible'));
  await page.screenshot({path:resolve(out,name+'.png'),fullPage:true});result.passed=true;console.log('PASS',name);
 }catch(error){result.passed=false;result.error=error.message;result.errors=errors;await page.screenshot({path:resolve(out,'failure-'+name+'.png'),fullPage:true}).catch(()=>{});console.log('FAIL',name,error.message);}
 finally{results.push(result);await context.close();await browser.close();await writeFile(resolve(out,'results.json'),JSON.stringify(results,null,2));}
}

for(const [width,height] of [[1920,1080],[1440,900],[876,672],[820,500],[390,700],[320,568]])await run('scene-fullscreen-'+width+'x'+height,async(page,v)=>{
 await load(page);const original=await state(page),before=await page.locator('#stage-canvases').boundingBox();
 for(const selector of ['#project-title','#pack-btn','.global-overflow>summary'])inside(await page.locator(selector).boundingBox(),v,'Header control '+selector);
 await page.locator('#container-appearance>summary').click();await appearanceAccessible(page,v);
 inside(await page.locator('.container-appearance-body').boundingBox(),v,'Normal-window appearance popover');
 await page.screenshot({path:resolve(out,'appearance-'+width+'x'+height+'.png')});await page.locator('#container-appearance-close').click();
 await page.locator('#editor-fullscreen').click();await page.waitForFunction(()=>document.fullscreenElement?.id==='stage');
 const after=await fullscreenSize(page,v);
 assert.ok(after.width>=before.width&&after.height>before.height);
 assert.equal(await page.evaluate(()=>document.elementFromPoint(3,3)?.closest('#stage')?.id),'stage','The physical image must extend behind all chrome to the display edges');
 inside(await page.locator('#container-appearance>summary').boundingBox(),v,'Opacity control');
 await page.locator('#container-appearance>summary').click();await appearanceAccessible(page,v);
 inside(await page.locator('.container-appearance-body').boundingBox(),v,'Fullscreen appearance popover');await page.locator('#container-appearance-close').click();
 await page.screenshot({path:resolve(out,'full-active-'+width+'x'+height+'.png')});
 await page.locator('#fullscreen-tools-toggle').click();
 assert.equal(await page.locator('#stage').evaluate(e=>e.classList.contains('fs-tools-hidden')),true);
 assert.equal(await page.locator('#fullscreen-toolbar-slot').isVisible(),false);
 await fullscreenSize(page,v);await page.screenshot({path:resolve(out,'full-image-'+width+'x'+height+'.png')});
 await page.locator('#fullscreen-tools-toggle').click();
 await page.locator('#fullscreen-cargo').click();assert.equal(await page.locator('#library-sheet').evaluate(d=>d.open),true);
 inside(await page.locator('#library-sheet').boundingBox(),v,'Fullscreen cargo drawer');
 await page.locator('[data-id=SIM-ROUTE-REAR] .sku-description').click();
 await page.waitForFunction(()=>!document.querySelector('#library-sheet').open);
 await page.locator('#context-apply').scrollIntoViewIfNeeded();inside(await page.locator('#context-apply').boundingBox(),v,'Floating position editor');
 await page.locator('#context-x').fill('410');await page.locator('#context-apply').click();
 assert.equal((await state(page)).placements.find(p=>p.skuId==='SIM-ROUTE-REAR').x,410);
 await page.locator('#fullscreen-inspector').click();
 await page.evaluate(()=>document.activeElement.blur());await page.keyboard.press('e');inside(await page.locator('#context-apply').boundingBox(),v,'E shortcut reopens fullscreen editing');await page.locator('#fullscreen-inspector').click();
 await page.locator('#fullscreen-playback').click();await page.locator('#workflow-next').click();
 await page.waitForFunction(()=>document.querySelector('#stage').dataset.playbackIndex==='1');
 inside(await page.locator('#workflow-next').boundingBox(),v,'Fullscreen single-step playback');
 await page.locator('#workflow-exit').click();
 await page.locator('#fullscreen-playback').click();
 await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.fullscreenElement);
 assert.equal(await page.locator('body').evaluate(e=>e.classList.contains('v112-fullscreen')),false);
 const saved=await state(page);assert.deepEqual(saved.box,original.box);assert.equal(saved.placements.length,3);
 assert.equal(saved.collapsed,original.collapsed);assert.equal(await page.locator('#library').evaluate(e=>e.classList.contains('collapsed')),original.collapsed);
 assert.equal(await page.locator('.viewport-shell>.viewport-toolbar').count(),1);assert.equal(await page.locator('.viewport-shell>#context-editor').count(),1);
 assert.equal(await page.locator('.viewport-shell>#workflow-player').count(),1);assert.equal(await page.locator('#fullscreen-toolbar-slot').isVisible(),false);
 return{before,after,nativeTarget:'stage',editedX:410,controlsRestored:true};
},{width,height});

await run('scene-fullscreen-window-fallback',async(page,v)=>{
 await load(page);await page.evaluate(()=>{document.querySelector('#stage').requestFullscreen=async()=>{throw new DOMException('Test fullscreen denied','NotAllowedError');};});
 await page.locator('#editor-fullscreen').click();assert.equal(await page.evaluate(()=>document.fullscreenElement),null);
 assert.deepEqual(await page.locator('#stage-canvases').boundingBox(),{x:0,y:0,width:v.width,height:v.height});
 assert.match(await page.locator('#message').textContent(),/当前窗口/);await page.locator('#fullscreen-exit').click();
 assert.equal(await page.locator('body').evaluate(e=>e.classList.contains('v112-fullscreen')),false);return{windowFallback:true};
});

await run('complete-body-opacity-cutaway-and-working-doors',async page=>{
 await load(page);const initial=await state(page),images=[],reference=await page.locator('.container-pin.nose').boundingBox();
 const open=async()=>{if(!(await page.locator('#container-appearance').evaluate(e=>e.open)))await page.locator('#container-appearance>summary').click();};
 const close=async()=>{if(await page.locator('#container-appearance').evaluate(e=>e.open))await page.locator('#container-appearance-close').click();};
 for(const mode of ['hidden','ghost','solid']){
  await open();await page.locator(`[data-shell=${mode}]`).click();
  assert.equal(await page.locator('#v113-shell-alpha').inputValue(),mode==='hidden'?'0':mode==='ghost'?'35':'100');await close();
  images.push({mode,hash:hash(await page.locator('#stage-canvases').screenshot({path:resolve(out,'container-'+mode+'.png')}))});
  assert.deepEqual(await page.locator('.container-pin.nose').boundingBox(),reference,'Opacity must keep the camera framing stable');
 }
 assert.equal(new Set(images.map(i=>i.hash)).size,3);
 await open();await page.locator('[data-door-angle="0"]').click();await close();
 const closed=hash(await page.locator('#stage-canvases').screenshot({path:resolve(out,'complete-closed-solid.png')}));
 assert.deepEqual(await page.locator('.container-pin.nose').boundingBox(),reference,'Closing doors must not move the camera');
 await open();await page.locator('[data-door-angle="112"]').click();await close();
 const opened=hash(await page.locator('#stage-canvases').screenshot({path:resolve(out,'complete-open-solid.png')}));assert.notEqual(opened,closed);
 await open();await page.locator('[data-container-view=cutaway]').click();await close();
 const cutaway=hash(await page.locator('#stage-canvases').screenshot({path:resolve(out,'cutaway-open-solid.png')}));assert.notEqual(cutaway,opened);
 await open();await page.locator('[data-container-view=complete]').click();
 const range=page.locator('#v113-shell-alpha');await range.focus();await range.press('Home');await range.press('PageUp');await range.press('PageUp');await range.press('PageUp');
 assert.equal(await range.inputValue(),'30');assert.equal(await page.locator('#v113-shell-percent').textContent(),'30%');await close();
 const final=await state(page);assert.deepEqual(final.placements,initial.placements);assert.deepEqual(final.box,initial.box);
 return{images,closed,opened,cutaway,liveOpacity:.30,geometryUnchanged:true};
});

await run('sixteen-physical-cargo-materials-render-in-webgl',async page=>{
 const gallery=await page.evaluate(async()=>{
  const {Viewport}=await import('/src/webgl.mjs'),{ENHANCED_PACKAGES,packageParts}=await import('/src/package-geometry.mjs');
  const host=document.createElement('div');host.id='physical-gallery';Object.assign(host.style,{position:'fixed',inset:'0',zIndex:'99999',background:'#eceef0'});document.querySelector('#app').append(host);
  const sampleBox={L:6000,W:3000,H:2800,doorW:2800,doorH:2600};
  const opts={walls:false,wallOpacity:0,pbr:true,axes:false,coords:false,tags:false,dimensions:false,grid:false};
  const view=new Viewport(host,'iso',{});
  window.physicalFixture={host,view,state:{box:sampleBox,items:[],selected:null,opts}};
  return ENHANCED_PACKAGES.map(kind=>({kind,parts:packageParts({kind,L:1100,W:900,H:1150}).length}));
 });
 assert.equal(gallery.length,16);const hashes=[];
 await page.waitForFunction(()=>document.querySelector('#physical-gallery canvas')?.dataset.surfaceSource==='local-generated-atlas');
 for(const {kind,parts} of gallery){
  const detail=await page.evaluate(kind=>{
   const {view,state}=window.physicalFixture;
   const item={id:'VISUAL-'+kind,kind,x:2000,y:900,z:0,L:1100,W:900,H:1150,heading:0,weight:100};
   state.items=[item];view.draw(state);view.focusItem(item);view.draw(state);
   const gl=view.gl,bytes=new Uint8Array(64*64*4);gl.readPixels(Math.floor(view.canvas.width/2)-32,Math.floor(view.canvas.height/2)-32,64,64,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
   return{webgl:!!gl&&!view.fallback,surfaceSource:view.canvas.dataset.surfaceSource,distinctColours:new Set(Array.from({length:4096},(_,i)=>bytes.slice(i*4,i*4+3).join(','))).size};
  },kind);
  assert.equal(detail.webgl,true);assert.ok(detail.distinctColours>10,kind+' must render real lit surfaces');
  assert.equal(detail.surfaceSource,'local-generated-atlas');
  const pixels=await page.locator('#physical-gallery canvas').screenshot({path:resolve(out,'cargo-'+kind+'.png')});hashes.push({kind,parts,hash:hash(pixels),...detail});
 }
 assert.equal(new Set(hashes.map(i=>i.hash)).size,16);
 await page.evaluate(()=>{window.physicalFixture.view.dispose();window.physicalFixture.host.remove();delete window.physicalFixture;});
 return hashes;
},{width:1100,height:850});

await run('local-material-failure-retains-working-procedural-renderer',async page=>{
 await page.route('**/assets/materials/packaging-atlas-v121.png',route=>route.abort());
 await page.reload({waitUntil:'networkidle'});
 await load(page);await page.locator('[data-view=multi]').click();
 assert.equal(await page.locator('#stage-canvases canvas').count(),4);
 assert.equal(await page.locator('#stage-canvases canvas[data-surface-source]').count(),0);
 const result=await page.evaluate(async()=>{
  const {loadAuthoredSurfaces}=await import('/src/authored-surfaces.mjs');
  const {Viewport}=await import('/src/webgl.mjs');
  const missing=await loadAuthoredSurfaces(),host=document.createElement('div');
  Object.assign(host.style,{width:'500px',height:'400px'});document.querySelector('#app').append(host);
  const view=new Viewport(host,'iso',{}),box={L:5000,W:2500,H:2600,doorW:2400,doorH:2400};
  view.draw({box,items:[{id:'FALLBACK-CARTON',kind:'carton',x:1800,y:600,z:0,L:1000,W:800,H:1100,weight:100}],opts:{walls:true,wallOpacity:.35,containerView:'complete',doorAngle:112,pbr:true}});
  const gl=view.gl,bytes=new Uint8Array(64*64*4);gl.readPixels(Math.floor(view.canvas.width/2)-32,Math.floor(view.canvas.height/2)-32,64,64,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
  const result={missing:missing===null,webgl:!!gl&&!view.fallback,body:view.containerVisual.parts,colours:new Set(Array.from({length:4096},(_,i)=>bytes.slice(i*4,i*4+3).join(','))).size};view.dispose();host.remove();return result;
 });
 assert.equal(result.missing,true);assert.equal(result.webgl,true);assert.ok(result.body>100);assert.ok(result.colours>10);
 return result;
});

console.log(JSON.stringify({passed:results.filter(r=>r.passed).length,total:results.length}));
if(results.some(r=>!r.passed))process.exitCode=1;

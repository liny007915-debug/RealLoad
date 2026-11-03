/** Headless rendering regression; configure PLAYWRIGHT_MODULE, CHROME_EXECUTABLE and REALLOAD_URL when needed. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.REALLOAD_URL||process.env.REALLOAD_TEST_URL||'http://localhost:4202';
const out=process.env.RENDER_ARTIFACTS ? new URL(process.env.RENDER_ARTIFACTS.replace(/\/$/,'')+'/',new URL('../',import.meta.url)) : new URL('../artifacts/render/',import.meta.url);
await mkdir(out,{recursive:true});
const report={browser:process.env.CHROME_EXECUTABLE?'Chrome/Chromium headless (configured executable)':'Playwright Chromium headless',startedAt:new Date().toISOString(),origin,tests:[],errors:[],warnings:[]};
const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{}),args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
page.setDefaultTimeout(10000);
page.on('pageerror',error=>report.errors.push(String(error)));
page.on('console',message=>{if(message.type()==='warning')report.warnings.push(message.text());});
const sha=buffer=>createHash('sha256').update(buffer).digest('hex');
async function check(name,fn){try{const detail=await fn();report.tests.push({name,pass:true,detail});console.log('PASS '+name);}catch(error){report.tests.push({name,pass:false,error:error.message});console.log('FAIL '+name+': '+error.message);}}
try{
 await page.goto(origin,{waitUntil:'networkidle',timeout:30000});
 if(await page.locator('#guide-dialog').evaluate(d=>d.open))await page.locator('#guide-skip').click();
 await page.waitForFunction(()=>document.querySelector('#renderer-status')?.textContent.includes('WebGL2')||document.querySelector('#renderer-status')?.textContent.includes('Canvas'));
 await page.locator('#pack-btn').click();
 await page.waitForFunction(()=>document.querySelector('#stage-canvases canvas')?.getAttribute('aria-label')?.includes('53'));
 await check('WebGL2 renderer initializes with the real 53-unit sample',async()=>{
  const info=await page.evaluate(()=>{const c=document.querySelector('#stage-canvases canvas'),gl=c.getContext('webgl2');return{label:c.getAttribute('aria-label'),width:c.width,height:c.height,available:!!gl&&!gl.isContextLost(),status:document.querySelector('#renderer-status').textContent};});
  assert.equal(info.available,true);assert.ok(info.width>0&&info.height>0);return info;
 });
 await check('all five view controls produce populated canvases',async()=>{
  const views=[];
  for(const mode of ['iso','top','door','side','multi']){
   await page.locator(`[data-view="${mode}"]`).click();
   await page.waitForFunction(expected=>document.querySelectorAll('#stage-canvases .view-cell').length===expected,mode==='multi'?4:1);
   const info=await page.locator('#stage-canvases .view-cell canvas').evaluateAll(nodes=>nodes.map(c=>({label:c.getAttribute('aria-label'),width:c.width,height:c.height,webgl:!!c.getContext('webgl2')})));
   assert.ok(info.every(c=>c.webgl&&c.width>100&&c.height>70));
   await page.locator('#stage').screenshot({path:fileURLToPath(new URL(`view-${mode}.png`,out))});views.push({mode,canvases:info});
  }
  await page.locator('[data-view="iso"]').click();return views;
 });
 await check('transparent, solid and hidden shell controls change the actual scene',async()=>{
  const appearance=page.locator('#container-appearance');
  if(!(await appearance.evaluate(panel=>panel.open)))await appearance.locator('summary').click();
  const values=[];
  for(const mode of ['ghost','solid','hidden']){
   await page.locator(`[data-shell="${mode}"]`).click();await page.waitForTimeout(90);
   assert.equal(await page.locator(`[data-shell="${mode}"]`).getAttribute('aria-pressed'),'true');
   const image=await page.locator('#stage-canvases').screenshot({path:fileURLToPath(new URL(`shell-${mode}.png`,out))});values.push({mode,hash:sha(image),opacity:await page.locator('#v113-shell-percent').textContent()});
  }
  assert.equal(new Set(values.map(v=>v.hash)).size,3);
  await page.locator('#v113-shell-alpha').focus();await page.locator('#v113-shell-alpha').press('Home');for(let i=0;i<31;i++)await page.locator('#v113-shell-alpha').press('ArrowRight');
  assert.equal(await page.locator('#v113-shell-percent').textContent(),'31%');
  await page.locator('[data-shell="ghost"]').click();return values;
 });
 await check('focus then zoom in and out changes the rendered cargo without losing the view',async()=>{
  await page.locator('[data-section="unload"]').click();
  await page.waitForSelector('.v116-order-badge');
  await page.locator('.v116-order-badge').first().click();
  const tools=page.locator('#viewport-more');
  if(!(await tools.evaluate(panel=>panel.open)))await tools.locator('summary').click();
  await page.locator('#focus-selected').click();
  if(await tools.evaluate(panel=>panel.open))await tools.locator('summary').click();
  const before=sha(await page.locator('#stage-canvases').screenshot());
  await page.locator('#scene-zoom-in').click();const closer=sha(await page.locator('#stage-canvases').screenshot());
  await page.locator('#scene-zoom-out').click();const after=sha(await page.locator('#stage-canvases').screenshot());
  assert.notEqual(before,closer);assert.notEqual(closer,after);
  await page.locator('#scene-zoom-home').click();await page.locator('#stage').screenshot({path:fileURLToPath(new URL('focus-zoom-fit.png',out))});
  return{focusHash:before,zoomHash:closer,restoredHash:after};
 });
 await check('real WebGL context loss switches to Canvas, restores WebGL and keeps selection interactive',async()=>{
  return await page.evaluate(async()=>{
   const {Viewport}=await import('/src/webgl.mjs');
   const host=document.createElement('div');Object.assign(host.style,{position:'fixed',width:'720px',height:'420px',left:'0',top:'0',zIndex:'9999'});document.body.append(host);
   let draws=0,selected=0;let view;
   const cargo={id:'CONTEXT-TEST',unitCode:'TEST-001',kind:'pallet',x:1800,y:200,z:0,L:1200,W:800,H:1150,weight:350};
   const box={L:5898,W:2352,H:2393,doorW:2340,doorH:2280};
   const state={box,items:[cargo],selected:cargo.id,opts:{tags:true,coords:true,axes:true,grid:true,walls:true,wallOpacity:.12,dimensions:false,pbr:true}};
   view=new Viewport(host,'iso',{draw:()=>{draws++;view.draw(state);},select:()=>selected++});view.draw(state);
   if(!view.gl||view.fallback)throw Error('fixture could not initialize WebGL');
   const gl=view.gl,extension=gl.getExtension('WEBGL_lose_context');if(!extension)throw Error('WEBGL_lose_context unavailable');
   const poll=async(fn)=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(resolve=>setTimeout(resolve,40));}throw Error('context state timeout');};
   extension.loseContext();await poll(()=>view.fallback&&view.fallbackCanvas);
   const canvas=view.fallbackCanvas;view.draw(state);
   const hit=view.fallbackInfo.hits.find(h=>h.id===cargo.id),point={x:hit.pts.reduce((sum,p)=>sum+p.x,0)/hit.pts.length,y:hit.pts.reduce((sum,p)=>sum+p.y,0)/hit.pts.length};
   if(view.hit(point.x,point.y)?.id!==cargo.id)throw Error('fallback hit testing lost cargo');
   for(const type of ['pointerdown','pointerup'])canvas.dispatchEvent(new PointerEvent(type,{pointerType:'touch',pointerId:22,button:0,clientX:point.x,clientY:point.y,bubbles:true}));
   if(selected!==1)throw Error('fallback tap did not select cargo');
   const projected=view.project([(cargo.x+cargo.L/2)/1000,(cargo.z+cargo.H/2)/1000,(cargo.y+cargo.W/2)/1000]);
   if(!projected.visible)throw Error('fallback projection lost selection');
   const lost={fallback:view.fallback,canvas2d:!!canvas.getContext('2d'),hits:view.fallbackInfo.hits.length,labels:view.overlayNodes.size,tapSelections:selected};
   view.zoomBy(1.24);if(!view.fallbackInfo.hits.length)throw Error('fallback zoom lost geometry');
   extension.restoreContext();await poll(()=>!view.fallback&&!view.fallbackCanvas&&!view.gl.isContextLost());
   view.draw(state);const restored={webgl:!!view.gl,fallback:view.fallback,children:host.querySelectorAll('canvas').length,labels:view.overlayNodes.size};
   if(restored.children!==1)throw Error('duplicate canvas after restore');
   view.dispose();host.remove();return{lost,restored,draws};
  });
 });
 await check('desktop ordinary wheel preserves the camera while modifier wheel zooms',async()=>{
  await page.evaluate(async()=>{
   const {Viewport}=await import('/src/webgl.mjs'),draw=Viewport.prototype.draw;
   Viewport.prototype.draw=function(...args){if(this.parent.closest('#stage-canvases'))window.renderWheelView=this;return draw.apply(this,args);};
   window.restoreRenderDraw=()=>{Viewport.prototype.draw=draw;};
  });
  await page.locator('#scene-zoom-home').click();
  await page.waitForFunction(()=>!!window.renderWheelView);
  await page.evaluate(()=>{window.restoreRenderDraw();delete window.restoreRenderDraw;});
  const camera=()=>page.evaluate(()=>{const v=window.renderWheelView,r=v.canvas.getBoundingClientRect(),workspace=document.querySelector('.workspace');return{zoom:v.zoom,yaw:v.yaw,pitch:v.pitch,focusTarget:v.focusTarget,vp:Array.from(v.vp),width:v.canvas.width,height:v.canvas.height,rect:{x:r.x,y:r.y,width:r.width,height:r.height},workspaceScroll:workspace.scrollTop};});
  await page.locator('#stage-canvases').scrollIntoViewIfNeeded();
  const r=await page.locator('#stage-canvases').boundingBox();await page.mouse.move(r.x+r.width/2,r.y+Math.min(r.height/2,200));
  const before=await page.evaluate(()=>scrollY),ordinaryBefore=sha(await page.locator('#stage-canvases').screenshot({path:fileURLToPath(new URL('wheel-before.png',out))})),cameraBefore=await camera();
  await page.mouse.wheel(0,310);await page.waitForTimeout(150);const after=await page.evaluate(()=>scrollY),ordinaryAfter=sha(await page.locator('#stage-canvases').screenshot({path:fileURLToPath(new URL('wheel-after.png',out))})),cameraAfter=await camera();
  await writeFile(new URL('wheel-camera.json',out),JSON.stringify({ordinaryBefore,ordinaryAfter,cameraBefore,cameraAfter},null,2));
  assert.equal(after,before,'Desktop workspace must remain bounded to the viewport');
  // Native workspace scrolling can change antialiasing in overlay text by one
  // channel value. Camera state and its full projection are the zoom oracle.
  for(const key of ['zoom','yaw','pitch','focusTarget','vp','width','height'])assert.deepEqual(cameraAfter[key],cameraBefore[key],'Ordinary wheel must preserve camera '+key);
  await page.locator('#stage-canvases').scrollIntoViewIfNeeded();const zoomRect=await page.locator('#stage-canvases').boundingBox();await page.mouse.move(zoomRect.x+zoomRect.width/2,zoomRect.y+zoomRect.height/2);
  const zoomBeforeY=await page.evaluate(()=>scrollY),beforePixels=sha(await page.locator('#stage-canvases').screenshot());
  await page.keyboard.down('Alt');await page.mouse.wheel(0,-120);await page.keyboard.up('Alt');await page.waitForTimeout(100);
  const zoomAfterY=await page.evaluate(()=>scrollY),afterPixels=sha(await page.locator('#stage-canvases').screenshot());
  assert.equal(zoomAfterY,zoomBeforeY);assert.notEqual(beforePixels,afterPixels,'modifier wheel must change the rendered camera scale');
  const cameraZoomed=await camera();assert.ok(cameraZoomed.zoom>cameraAfter.zoom,'Modifier wheel must increase actual camera zoom');await page.evaluate(()=>delete window.renderWheelView);
  return{before,after,zoomBeforeY,zoomAfterY,ordinaryBefore,ordinaryAfter,cameraBefore,cameraAfter,zoomAfterModifier:cameraZoomed.zoom,modifierZoomChanged:beforePixels!==afterPixels};
 });
 await check('application did not emit an uncaught browser error',async()=>{assert.deepEqual(report.errors,[]);return{warnings:report.warnings};});
}finally{
 report.finishedAt=new Date().toISOString();report.passed=report.tests.filter(t=>t.pass).length;report.failed=report.tests.filter(t=>!t.pass).length;
 await writeFile(new URL('render-browser-results.json',out),JSON.stringify(report,null,2));await browser.close();
 console.log(JSON.stringify({passed:report.passed,failed:report.failed,errors:report.errors,output:fileURLToPath(new URL('render-browser-results.json',out))}));
}
if(report.failed)process.exitCode=1;

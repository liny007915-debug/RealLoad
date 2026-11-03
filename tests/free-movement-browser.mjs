/** Real pointer gestures and normal JSON import. Application state is observed, never injected. */
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {validate} from '../src/engine.mjs';
import {draftPlacements} from '../src/free-editing.mjs';
const modulePath=process.env.PLAYWRIGHT_MODULE||'playwright';
const {chromium}=await import(isAbsolute(modulePath)?pathToFileURL(modulePath).href:modulePath);
const out=resolve(process.env.FREE_ARTIFACTS||'artifacts/v125/free-movement');await mkdir(out,{recursive:true});
const url=process.env.REALLOAD_URL||'http://localhost:4204/',results=[],A='SIM-FREE-A#',IR='SIM-FREE-IR#1';

const state=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('realload-v117')));
async function enter(p,mode='top'){
 await p.evaluate(async()=>{const {Viewport}=await import('/src/webgl.mjs');if(!window.freeViews){window.freeViews=new Set();const draw=Viewport.prototype.draw;Viewport.prototype.draw=function(...args){window.freeViews.add(this);return draw.apply(this,args);};}});
 await p.locator('.rail-item[data-section=free]').click();if(await p.locator('#library-sheet').evaluate(d=>d.open))await p.locator('#library-return-scene').click();
 await p.locator(`[data-view=${mode}]`).click();await p.waitForFunction(mode=>[...window.freeViews].some(v=>v.mode===mode&&v.canvas.isConnected&&v.state),mode);
}
async function select(p,id){
 if(!await p.locator('#free-loaded-list').isVisible()){await p.locator('#v117-library-toggle').click();}if(await p.locator('#free-mode-select').isVisible())await p.locator('#free-mode-select').click();
 await p.locator('[data-loaded-id="'+id+'"]').click();if(await p.locator('#library-sheet').evaluate(d=>d.open))await p.locator('#library-return-scene').click();
}
async function target(p,id,delta,mode='top'){
 return p.evaluate(({id,delta,mode})=>{
  const v=[...window.freeViews].find(v=>v.mode===mode&&v.canvas.isConnected),p=v.state.items.find(p=>p.id===id),r=v.canvas.getBoundingClientRect();
  for(const h of [.7,.95,.4,.1])for(const u of [.5,.25,.75])for(const w of [.5,.25,.75]){
   const world=[(p.x+p.L*u)/1000,(p.z+p.H*h)/1000,(p.y+p.W*w)/1000],a=v.project(world);if(v.hit(a.x,a.y)?.id!==id||document.elementFromPoint(r.x+a.x,r.y+a.y)!==v.canvas)continue;
   const b=v.project([world[0]+(delta.x||0)/1000,world[1]+(delta.z||0)/1000,world[2]+(delta.y||0)/1000]);
   return{x:r.x+a.x,y:r.y+a.y,dx:b.x-a.x,dy:b.y-a.y};
  }
  throw Error('No visible pointer hit for '+id+' in '+mode);
 },{id,delta,mode});
}
async function drag(p,t,{release=true}={}){await p.mouse.move(t.x,t.y);await p.mouse.down();await p.mouse.move(t.x+t.dx,t.y+t.dy,{steps:14});await p.waitForTimeout(100);if(release)await p.mouse.up();}
async function fields(p,{x,y,z}){for(const [k,v] of Object.entries({x,y,z}))if(v!==undefined)await p.locator('#context-'+k).fill(String(v));await p.locator('#context-apply').click();}
async function run(name,fn,viewport={width:1440,height:900},options={}){
 if(process.env.FREE_CASE&&!new RegExp(process.env.FREE_CASE).test(name))return;
 console.log('RUN',name);const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader'],...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});const context=await browser.newContext({viewport,reducedMotion:'reduce',isMobile:viewport.width<600,hasTouch:viewport.width<600}),p=await context.newPage(),errors=[],r={name,viewport};p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));
 try{
  await p.goto(url,{waitUntil:'networkidle'});await p.waitForSelector('body[data-app-state=ready]');if(await p.locator('#guide-dialog').evaluate(d=>d.open))await p.locator('#guide-skip').click();
  if(!options.defaultDemo){await p.locator('#import-file').setInputFiles(resolve('examples/v125-free-placement.json'));await p.waitForFunction(()=>JSON.parse(localStorage.getItem('realload-v117')).project==='自由摆放练习 · 模拟货单');}
  r.evidence=await fn(p,context);assert.deepEqual(errors,[]);const s=await state(p);assert.equal(validate(s.placements,s.box,s.skus).valid,true,'Applied plan remains valid');
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No page overflow');
  await p.screenshot({path:resolve(out,name+'.png'),fullPage:true});r.passed=true;console.log('PASS',name);
 }catch(e){r.passed=false;r.error=e.message;r.stack=e.stack?.split('\n').slice(0,5);r.errors=errors;r.observed=await p.evaluate(()=>({message:document.querySelector('#message')?.textContent,free:document.querySelector('#free-editbar')?.innerText,context:document.querySelector('#context-feedback')?.textContent})).catch(()=>null);await p.screenshot({path:resolve(out,'failure-'+name+'.png'),fullPage:true}).catch(()=>{});console.log('FAIL',name,e.message);}
 finally{results.push(r);await context.close();await browser.close();await writeFile(resolve(out,'results.json'),JSON.stringify(results,null,2)+'\n');}
}

await run('upper-carton-direct-drag-drops-to-floor',async p=>{
 await enter(p);const before=await state(p),t=await target(p,A+'3',{x:1200,y:0});await drag(p,t);const after=await state(p),m=after.placements.find(i=>i.id===A+'3');
 assert.ok(Math.abs(m.x-1700)<3);assert.equal(m.y,500);assert.equal(m.z,0);assert.equal(after.freeTab,'edit');assert.deepEqual(after.placements.filter(i=>i.id!==m.id),before.placements.filter(i=>i.id!==m.id));return {before:before.placements[2],after:m};
});
await run('direct-drag-stacks-on-complete-support',async p=>{
 await enter(p);const t=await target(p,A+'4',{x:-1300,y:-900});await drag(p,t);const after=await state(p),m=after.placements.find(i=>i.id===A+'4');assert.ok(Math.abs(m.x-500)<3);assert.ok(Math.abs(m.y-500)<3);assert.equal(m.z,1200);return m;
});
await run('whole-stack-linkage-preserves-relative-positions',async p=>{
 await enter(p,'iso');const before=await state(p),t=await target(p,A+'1',{x:900},'iso');await drag(p,t);const after=await state(p);const dx=after.placements[0].x-before.placements[0].x,dy=after.placements[0].y-before.placements[0].y;assert.ok(dx>800);for(const id of [1,2,3]){const old=before.placements.find(i=>i.id===A+id),next=after.placements.find(i=>i.id===A+id);assert.ok(Math.abs(next.x-old.x-dx)<.01);assert.equal(next.z,old.z);assert.ok(Math.abs(next.y-old.y-dy)<.01);}return after.placements.slice(0,3);
});
await run('draft-follows-pointer-through-overlap-and-preserves-applied-plan',async p=>{
 await enter(p);await p.locator('#free-draft-mode').click();const before=await state(p),t=await target(p,A+'4',{x:-1200,y:-850});await drag(p,t,{release:false});
 assert.match(await p.locator('#move-feedback').textContent(),/草稿/);const following=await p.evaluate(()=>[...window.freeViews].find(v=>v.mode==='top'&&v.canvas.isConnected).state.items.find(i=>i.id==='SIM-FREE-A#4'));
 assert.ok(following.x<900&&following.y<700);await p.mouse.up();const after=await state(p);assert.deepEqual(after.placements,before.placements);assert.ok(Object.keys(after.freeDraft).length);
 const check=validate(draftPlacements(after.placements,after.freeDraft),after.box,after.skus);assert.equal(check.valid,false);assert.ok(check.issues.some(i=>i.kind==='collision'));
 await p.locator('#free-draft-apply').click();assert.deepEqual((await state(p)).placements,before.placements);assert.equal(await p.locator('#free-draft-review').evaluate(d=>d.open),true);return{draft:after.freeDraft,issues:check.issues};
});
await run('draft-z-height-reload-apply-and-undo',async p=>{
 await enter(p,'iso');await p.locator('#free-draft-mode').click();await select(p,A+'4');const before=await state(p);await fields(p,{x:1800,y:1400,z:300});assert.equal((await state(p)).placements.find(i=>i.id===A+'4').z,0);assert.match(await p.locator('#context-feedback').textContent(),/草稿/);
 await p.reload({waitUntil:'networkidle'});assert.equal(await p.locator('#free-draft-mode').getAttribute('aria-pressed'),'true');assert.equal(await p.locator('#context-z').inputValue(),'300');
 await fields(p,{z:0,x:2200});await p.locator('#free-draft-apply').click();const applied=await state(p);assert.equal(applied.placements.find(i=>i.id===A+'4').x,2200);assert.deepEqual(applied.freeDraft,{});
 await p.locator('#history-undo').click();const undo=await state(p);assert.deepEqual(undo.placements,before.placements);assert.ok(Object.keys(undo.freeDraft).length);await p.locator('#free-draft-discard').click();assert.deepEqual((await state(p)).placements,before.placements);return{appliedX:2200,recoveredDraft:undo.freeDraft};
});
await run('draft-z-handle-lifts-and-cancel-restores',async p=>{
 await enter(p,'iso');await p.locator('#free-draft-mode').click();await select(p,A+'4');const before=await state(p),h=p.locator('.gizmo-handle[data-axis=z]');const r=await h.boundingBox();await p.mouse.move(r.x+r.width/2,r.y+r.height/2);await p.mouse.down();await p.mouse.move(r.x+r.width/2,r.y+r.height/2-25,{steps:8});await p.waitForTimeout(100);assert.equal(await p.locator('#move-feedback').isVisible(),true);await p.keyboard.press('Escape');await p.mouse.up();assert.deepEqual((await state(p)).freeDraft,before.freeDraft);
 await select(p,A+'4');const h2=await h.boundingBox();await p.mouse.move(h2.x+h2.width/2,h2.y+h2.height/2);await p.mouse.down();await p.mouse.move(h2.x+h2.width/2,h2.y+h2.height/2-24,{steps:8});await p.mouse.up();const after=await state(p);assert.ok(after.freeDraft[A+'4'].z>0);assert.deepEqual(after.placements,before.placements);return after.freeDraft;
});
await run('draft-export-and-playback-use-applied-plan',async p=>{
 await enter(p);await p.locator('#free-draft-mode').click();await select(p,A+'4');await fields(p,{x:600,y:550,z:200});const before=await state(p);
 await p.locator('#global-overflow>summary').click();await p.locator('#export-btn').click();const pending=p.waitForEvent('download');await p.locator('#export-json').click();const dl=await pending,path=resolve(out,'draft-boundary-export.json');await dl.saveAs(path);const data=JSON.parse(await readFile(path,'utf8'));assert.deepEqual(data.placements,before.placements);assert.equal(data.report.valid,true);
 await p.locator('.rail-item[data-section=unload]').click();if(await p.locator('#library-sheet').evaluate(d=>d.open))await p.locator('#library-return-scene').click();await p.locator('#workflow-next').click();await p.waitForTimeout(120);assert.deepEqual((await state(p)).placements,before.placements);await enter(p);assert.equal(await p.locator('#free-draft-mode').getAttribute('aria-pressed'),'true');return{exportUsesApplied:true,draftPreserved:(await state(p)).freeDraft};
});
await run('entry-from-observe-and-playback-resets-to-move',async p=>{
 await p.locator('#workflow-next').click();await p.waitForTimeout(180);await p.locator('[data-pointer-tool=orbit]').click();await p.locator('body').click({position:{x:3,y:3}});await p.keyboard.press('p');assert.equal((await state(p)).pointerTool,'select');assert.equal(await p.locator('#workflow-exit').isVisible(),false);
 await enter(p);const t=await target(p,IR,{x:500,y:100});await drag(p,t);const moved=(await state(p)).placements.find(i=>i.id===IR);assert.ok(moved.x>3400);return moved;
});
for(const viewport of [{width:876,height:672},{width:390,height:700},{width:1440,height:520}])await run('responsive-controls-and-fullscreen-'+viewport.width+'x'+viewport.height,async p=>{
 await enter(p);await p.locator('#free-draft-mode').click();const bounds=await p.evaluate(()=>{const bar=document.querySelector('#free-editbar').getBoundingClientRect(),stage=document.querySelector('#stage').getBoundingClientRect();return{bar:{bottom:bar.bottom},stage:{top:stage.top}};});assert.ok(bounds.bar.bottom<=bounds.stage.top+1,'Toolbar must not be clipped by stage');
 for(const id of ['free-auto-mode','free-draft-mode','free-drag-axis','free-draft-apply'])assert.equal(await p.locator('#'+id).isVisible(),true);
 await p.locator('#editor-fullscreen').click();await p.waitForFunction(()=>document.fullscreenElement?.id==='stage');const canvas=await p.locator('#stage-canvases').boundingBox();assert.equal(canvas.x,0);assert.equal(canvas.y,0);assert.equal(canvas.width,viewport.width);assert.equal(canvas.height,viewport.height);assert.equal(await p.locator('#free-draft-mode').isVisible(),true);
 await p.locator('#free-drag-axis').selectOption('z');await p.locator('#free-auto-mode').click();await p.keyboard.press('Escape');await p.waitForFunction(()=>!document.fullscreenElement);return{bounds,canvas};
},viewport);

await run('touch-direct-draft-drag',async(p,c)=>{
 await enter(p);await p.locator('#free-draft-mode').click();await p.locator('#touch-move-toggle').click();await p.locator('#stage').scrollIntoViewIfNeeded();const t=await target(p,IR,{x:600,y:0});const session=await c.newCDPSession(p);
 await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:t.x,y:t.y}]});for(let n=1;n<=12;n++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:t.x+t.dx*n/12,y:t.y+t.dy*n/12}]});await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 const after=await state(p);assert.ok(after.freeDraft[IR]?.x>3500);assert.equal(after.placements.find(i=>i.id===IR).x,3000);return after.freeDraft;
},{width:390,height:844});

await run('blocked-automatic-drop-shows-target-then-restores',async p=>{
 await enter(p);const before=await state(p),t=await target(p,IR,{x:-2500,y:0});await drag(p,t,{release:false});
 assert.match(await p.locator('#move-feedback').textContent(),/松开将恢复/);const following=await p.evaluate(()=>[...window.freeViews].find(v=>v.mode==='top'&&v.canvas.isConnected).state.items.find(i=>i.id==='SIM-FREE-IR#1'));
 assert.ok(following.x<700);await p.mouse.up();assert.deepEqual((await state(p)).placements,before.placements);assert.match(await p.locator('#message').textContent(),/重叠|支撑|落位/);return {requested:following.x,restored:3000};
});
await run('unlinked-support-explains-why-it-cannot-drop',async p=>{
 await enter(p,'iso');await p.locator('#free-drag-options>summary').click();await p.locator('#free-link-stack').uncheck();await p.locator('#free-drag-options>summary').click();const before=await state(p),t=await target(p,A+'1',{x:900},'iso');await drag(p,t);
 assert.deepEqual((await state(p)).placements,before.placements);assert.match(await p.locator('#message').textContent(),/联动上方/);return{supportProtected:true};
});
await run('interrupted-and-foreign-pointer-gestures',async p=>{
 await enter(p);await p.locator('#free-draft-mode').click();const before=await state(p);let t=await target(p,IR,{x:500,y:0});await drag(p,t,{release:false});
 const pointerId=await p.evaluate(()=>[...window.freeViews].find(v=>v.mode==='top'&&v.canvas.isConnected).drag.pointerId);
 await p.locator('#stage-canvases canvas').dispatchEvent('pointercancel',{pointerId});await p.mouse.up();assert.deepEqual((await state(p)).freeDraft,before.freeDraft);
 t=await target(p,IR,{x:500,y:0});await drag(p,t,{release:false});await p.evaluate(()=>window.dispatchEvent(new Event('blur')));await p.mouse.up();assert.deepEqual((await state(p)).freeDraft,before.freeDraft);
 t=await target(p,IR,{x:500,y:0});await drag(p,t,{release:false});await p.locator('#stage-canvases canvas').dispatchEvent('pointercancel',{pointerId:999});await p.mouse.up();assert.ok((await state(p)).freeDraft[IR]?.x>3400);
 return {cancelRestores:true,blurRestores:true,foreignPointerIgnored:true};
});
await run('draft-xyz-is-shared-by-all-four-views',async p=>{
 await enter(p,'iso');await p.locator('#free-draft-mode').click();await select(p,IR);await p.locator('#free-drag-axis').selectOption('z');const before=await state(p),t=await target(p,IR,{z:300},'iso');await drag(p,t);
 const s=await state(p),draft=draftPlacements(s.placements,s.freeDraft).find(i=>i.id===IR);assert.ok(draft.z>200);assert.equal(draft.x,3000);assert.equal(draft.y,500);assert.deepEqual(s.placements,before.placements);
 await p.locator('[data-view=multi]').click();const four=await p.evaluate(()=>[...window.freeViews].filter(v=>v.canvas.isConnected).map(v=>({mode:v.mode,position:v.state.items.find(p=>p.id==='SIM-FREE-IR#1')})));
 assert.equal(four.length,4);for(const view of four)assert.deepEqual([view.position.x,view.position.y,view.position.z],[draft.x,draft.y,draft.z]);return {draft,four};
});
await run('keyboard-movement-preserves-drafts-and-links-automatic-stack',async p=>{
 await enter(p);const before=await state(p);await p.locator('#free-draft-mode').click();await select(p,A+'4');await fields(p,{x:2200,z:300});await select(p,IR);await fields(p,{x:3400,z:200});
 await p.locator('body').click({position:{x:3,y:3}});await p.keyboard.press('ArrowLeft');let s=await state(p);assert.equal(s.freeDraft[IR].x,3375);assert.equal(s.freeDraft[IR].z,200);assert.equal(s.freeDraft[A+'4'].x,2200);assert.equal(s.freeDraft[A+'4'].z,300);assert.deepEqual(s.placements,before.placements);
 await p.keyboard.press('Shift+PageUp');s=await state(p);assert.equal(s.freeDraft[IR].z,202.5);assert.equal(s.freeDraft[A+'4'].z,300);await p.locator('#context-rotate').click();s=await state(p);assert.equal(s.freeDraft[IR].L,700);assert.equal(s.freeDraft[IR].W,800);assert.equal(s.freeDraft[IR].heading,90);assert.equal(s.freeDraft[IR].z,202.5);assert.deepEqual(s.placements,before.placements);
 await p.locator('#free-draft-discard').click();await p.locator('#free-auto-mode').click();await select(p,A+'1');await p.locator('body').click({position:{x:3,y:3}});await p.keyboard.press('ArrowRight');s=await state(p);
 for(const id of [1,2,3]){const old=before.placements.find(i=>i.id===A+id),next=s.placements.find(i=>i.id===A+id);assert.equal(next.x,old.x+25);assert.equal(next.z,old.z);}return {draftKeyboardPreserved:true,automaticWholeStackMoved:3};
});
await run('default-53-cargo-upper-box-really-moves',async p=>{
 await p.locator('#pack-btn').click();await p.waitForFunction(()=>JSON.parse(localStorage.getItem('realload-v117')).placements.length===53);await enter(p);const before=await state(p);
 let choice=null;for(const item of before.placements.filter(i=>i.kind==='carton'&&i.z>0).sort((a,b)=>b.z-a.z)){
  for(let x=before.box.L-item.L;x>=0&&!choice;x-=100)for(let y=6;y<=before.box.W-item.W&&!choice;y+=100)for(const z of [0,...new Set(before.placements.filter(i=>i.id!==item.id).map(i=>i.z+i.H))]){if(Math.hypot(x-item.x,y-item.y)<150)continue;const next=before.placements.map(i=>i.id===item.id?{...i,x,y,z}:i);if(validate(next,before.box,before.skus).valid){choice={item,x,y,z};break;}}
  if(choice)break;
 }
 assert.ok(choice,'There is a supported upper carton and a feasible new support surface');const t=await target(p,choice.item.id,{x:choice.x-choice.item.x,y:choice.y-choice.item.y});await drag(p,t,{release:false});const preview=await p.evaluate(id=>({item:[...window.freeViews].find(v=>v.mode==='top'&&v.canvas.isConnected).state.items.find(i=>i.id===id),feedback:document.querySelector('#move-feedback').textContent}),choice.item.id);await p.mouse.up();const after=await state(p),m=after.placements.find(i=>i.id===choice.item.id),details=JSON.stringify({choice,preview,actual:m});assert.ok(Math.abs(m.x-choice.x)<2,details);assert.ok(Math.abs(m.y-choice.y)<2,details);assert.equal(m.z,choice.z);assert.equal(after.placements.length,53);return {id:m.id,before:[choice.item.x,choice.item.y,choice.item.z],after:[m.x,m.y,m.z]};
}, {width:1440,height:900},{defaultDemo:true});

console.log(JSON.stringify({passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,out}));if(results.some(r=>!r.passed))process.exitCode=1;

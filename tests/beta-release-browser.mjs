/** V1.27 beta: independent physical records and release-level UI workflows.
 * Every case owns a browser and storage. All fixtures enter through file inputs.
 * Only the explicit recovery case seeds deliberately malformed local storage.
 */
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {validate,orientations} from '../src/engine.mjs';
import {parseDelimited} from '../src/importer.mjs';
import {CARGO_TYPES} from '../src/free-studio.mjs';

const modulePath=process.env.PLAYWRIGHT_MODULE||'playwright';
const {chromium}=await import(isAbsolute(modulePath)?pathToFileURL(modulePath).href:modulePath);
const output=resolve(process.env.BETA_ARTIFACTS||'artifacts/v127/beta');await mkdir(output,{recursive:true});
const url=process.env.REALLOAD_URL||'http://localhost:4266/',results=[];
const fixturePath=resolve('examples/v127-beta-mixed-specs.json');
const fixture=JSON.parse(await readFile(fixturePath,'utf8'));
const storage='realload-v117',recoveryStorage='realload-recovery-v127';
const state=p=>p.evaluate(key=>JSON.parse(localStorage.getItem(key)),storage);
const physical=s=>s.placements.map(p=>[p.id,p.skuId,p.name,p.kind,p.L,p.W,p.H,p.weight,p.stackLimit,p.x,p.y,p.z,p.heading,p.locked]);
const independent=s=>s.placements.map(p=>({id:p.id,skuId:p.skuId,name:p.name,kind:p.kind,weight:p.weight,cargoSpec:p.cargoSpec})).sort((a,b)=>a.id.localeCompare(b.id));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const inside=(rect,viewport,label)=>assert.ok(rect&&rect.width>0&&rect.height>0&&rect.x>=-1&&rect.y>=-1&&rect.x+rect.width<=viewport.width+1&&rect.y+rect.height<=viewport.height+1,`${label}: ${JSON.stringify(rect)}`);
const valid=s=>{const audit=validate(s.placements,s.box,s.skus);assert.equal(audit.valid,true,JSON.stringify(audit.issues));return audit;};
const frame=p=>p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
async function skipGuide(p){if(await p.locator('#guide-dialog').evaluate(d=>d.open))await p.locator('#guide-skip').click();}
async function panel(p,section='cargo'){
 await p.locator(`.rail-item[data-section=${section}]`).click();
 if(!await p.locator('#library').isVisible())await p.locator('#v117-library-toggle').click();
}
async function closeLibrary(p){
 if(await p.locator('#library-sheet').evaluate(d=>d.open))await p.locator('#library-return-scene').click();
}
async function importJson(p,data,name='beta-fixture.json'){
 await p.locator('#import-file').setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
}
async function load(p){
 await p.locator('#import-file').setInputFiles(fixturePath);
 await p.waitForFunction(()=>JSON.parse(localStorage.getItem('realload-v117')).project==='测试版验收 · 16类货物与独立规格'&&JSON.parse(localStorage.getItem('realload-v117')).placements.length===18);
 valid(await state(p));
}
async function edit(p,id,patch){
 await panel(p);await p.locator(`.sku-card[data-id="${id}"] [data-action=edit]`).click();
 for(const [key,value] of Object.entries(patch)){
  if(key==='kind')await p.locator(`#sku-dialog [data-kind="${value}"]`).click();
  else if(['rotate','allowTilt'].includes(key))await p.locator(`#sku-form [name=${key}]`).setChecked(value);
  else if(key==='priority')await p.locator(`#sku-form [name=${key}]`).selectOption(String(value));
  else await p.locator(`#sku-form [name=${key}]`).fill(String(value));
 }
 await p.locator('#sku-form button[type=submit]').click();
 assert.equal(await p.locator('#sku-dialog').evaluate(d=>d.open),false,'a valid future template edit must save');
}
async function overflow(p){await closeLibrary(p);if(!await p.locator('#global-overflow').evaluate(d=>d.open))await p.locator('#global-overflow>summary').click();}
async function exportFile(p,selector,filename){
 await overflow(p);if(!await p.locator('#export-pop').isVisible())await p.locator('#export-btn').click();
 const [download]=await Promise.all([p.waitForEvent('download'),p.locator(selector).click()]);
 const path=resolve(output,filename);await download.saveAs(path);return {path,text:await readFile(path,'utf8'),suggested:download.suggestedFilename()};
}
async function openAppearance(p,viewport){
 if(!await p.locator('#container-appearance').evaluate(details=>details.open))await p.locator('#container-appearance>summary').click();
 const body=p.locator('.container-appearance-body');await body.waitFor({state:'visible'});inside(await body.boundingBox(),viewport,'appearance control');
}
async function clearPositions(p){
 await overflow(p);await p.locator('#clear-cargo-open').click();await p.locator('#clear-cargo-form input[value=placements]').check();await p.locator('#clear-cargo-confirm').click();
 await p.waitForFunction(()=>JSON.parse(localStorage.getItem('realload-v117')).placements.length===0);
}
async function run(name,action,viewport={width:1440,height:900},options={}){
 if(process.env.BETA_CASE&&!new RegExp(process.env.BETA_CASE).test(name))return;
 console.log('RUN',name);const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader'],...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
 const context=await browser.newContext({viewport,deviceScaleFactor:1,reducedMotion:'reduce',isMobile:viewport.width<600,hasTouch:viewport.width<600});
 const page=await context.newPage(),errors=[],httpErrors=[],result={name,viewport};page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));page.on('response',response=>{if(response.status()>=400)httpErrors.push({status:response.status(),url:response.url()});});
 try{
  if(options.corruptRaw)await context.addInitScript(({raw,origin,key})=>{if(location.origin===origin&&!sessionStorage.getItem('beta-corruption-seeded')){localStorage.setItem(key,raw);sessionStorage.setItem('beta-corruption-seeded','1');}},{raw:options.corruptRaw,origin:new URL(url).origin,key:storage});
  await page.goto(url,{waitUntil:'networkidle'});await page.waitForSelector('body[data-app-state=ready]');
  if(!options.corruptRaw)await skipGuide(page);
  result.evidence=await action(page,context,viewport);assert.deepEqual(errors,[]);assert.deepEqual(httpErrors,[]);valid(await state(page));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'the page must not overflow horizontally');
  await page.screenshot({path:resolve(output,name+'.png'),fullPage:true});result.passed=true;console.log('PASS',name);
 }catch(error){result.passed=false;result.error=error.stack;result.pageErrors=errors;result.httpErrors=httpErrors;await page.screenshot({path:resolve(output,name+'-failure.png'),fullPage:true}).catch(()=>{});console.log('FAIL',name,error.message);}
 finally{results.push(result);await context.close();await browser.close();await writeFile(resolve(output,'results.json'),JSON.stringify(results,null,2)+'\n');}
}

await run('mixed-template-edit-add-and-json-roundtrip',async p=>{
 await load(p);const before=await state(p);assert.equal(new Set(before.placements.map(p=>p.kind)).size,16);
 await edit(p,'BETA-MIXED',{L:700,W:450,H:500,weight:42,kind:'irregular',rotate:false,name:'仅用于后续的新模板'});
 const changed=await state(p);assert.deepEqual(physical(changed),physical(before));assert.deepEqual(independent(changed),independent(before));assert.equal(valid(changed).weight,valid(before).weight);
 await p.locator('.sku-card[data-id="BETA-MIXED"] [data-action=place]').click();await p.waitForFunction(()=>JSON.parse(localStorage.getItem('realload-v117')).placements.length===19);
 const added=await state(p),newUnit=added.placements.find(item=>!before.placements.some(old=>old.id===item.id));assert.ok(newUnit);assert.equal(newUnit.ordinal,4);
 assert.deepEqual([newUnit.L,newUnit.W,newUnit.H,newUnit.weight,newUnit.kind],[700,450,500,42,'irregular']);assert.equal(newUnit.cargoSpec.rotate,false);
 assert.deepEqual(physical({...added,placements:added.placements.filter(item=>item.id!==newUnit.id)}),physical(before));valid(added);
 const file=await exportFile(p,'#export-json','independent-spec-roundtrip.json'),json=JSON.parse(file.text);assert.equal(json.schemaVersion,3);assert.deepEqual(independent({placements:json.placements}),independent(added));assert.deepEqual(json.skus,added.skus);
 await clearPositions(p);await p.locator('#import-file').setInputFiles(file.path);await p.waitForFunction(()=>JSON.parse(localStorage.getItem('realload-v117')).placements.length===19);
 await p.reload({waitUntil:'networkidle'});assert.deepEqual(physical(await state(p)),physical(added));assert.deepEqual(independent(await state(p)),independent(added));
 return{loadedBefore:18,loadedAfter:19,oldRevisions:before.placements.filter(item=>item.skuId==='BETA-MIXED').map(item=>[item.id,item.kind,item.L,item.W,item.H,item.weight]),newUnit,exportedSchema:json.schemaVersion};
});

await run('manifest-and-position-csv-use-physical-records',async p=>{
 await load(p);await edit(p,'BETA-MIXED',{L:900,W:600,H:450,weight:32,kind:'crate'});const before=await state(p);
 const manifestFile=await exportFile(p,'#export-manifest','independent-spec-manifest.csv'),rows=parseDelimited(manifestFile.text),header=rows.shift(),column=(row,name)=>row[header.indexOf(name)];
 assert.equal(rows.length,19);assert.equal(rows.filter(row=>column(row,'是否已装')==='已装').length,18);assert.equal(rows.filter(row=>column(row,'是否已装')==='待装').length,1);
 for(const item of before.placements){
  const row=rows.find(row=>column(row,'实物/规划箱号')===item.unitCode);assert.ok(row,item.id);const spec=item.cargoSpec;
  assert.deepEqual(['外长(mm)','外宽(mm)','外高(mm)','毛重(kg)'].map(name=>Number(column(row,name))),[spec.L,spec.W,spec.H,spec.weight]);assert.equal(column(row,'包装类型'),CARGO_TYPES[spec.kind].label);
 }
 const pending=rows.find(row=>column(row,'是否已装')==='待装');assert.equal(column(pending,'内部记录号'),'BETA-MIXED');assert.deepEqual(['外长(mm)','外宽(mm)','外高(mm)','毛重(kg)'].map(name=>Number(column(pending,name))),[900,600,450,32]);
 const positionsFile=await exportFile(p,'#export-csv','independent-spec-positions.csv'),positionRows=parseDelimited(positionsFile.text),positionHeader=positionRows.shift();assert.equal(positionRows.length,18);
 for(const item of before.placements){const row=positionRows.find(row=>row[positionHeader.indexOf('id')]===item.id);assert.ok(row,item.id);for(const key of ['x','y','z','L','W','H','weight'])assert.equal(Number(row[positionHeader.indexOf(key)]),item[key]);assert.equal(row[positionHeader.indexOf('kind')],item.kind);}
 assert.deepEqual(physical(await state(p)),physical(before));return{loadedManifestRows:18,pendingManifestRows:1,positionRows:18,oldRevisionMasses:rows.filter(row=>column(row,'内部记录号')==='BETA-MIXED').map(row=>column(row,'毛重(kg)'))};
});

await run('mixed-spec-container-reflow-and-auto-preserve-every-old-record',async p=>{
 await load(p);const before=await state(p),identities=independent(before);
 await panel(p,'container');await p.locator('#container-L').fill('6200');await p.locator('#reflow-container').click();
 await p.waitForFunction(()=>JSON.parse(localStorage.getItem('realload-v117')).box.L===6200);const reflowed=await state(p);assert.equal(reflowed.placements.length,18);assert.deepEqual(independent(reflowed),identities);valid(reflowed);
 for(const item of reflowed.placements)assert.ok(orientations(item.cargoSpec).some(o=>o.L===item.L&&o.W===item.W&&o.H===item.H),item.id);
 await closeLibrary(p);await p.locator('#pack-btn').click();await p.waitForFunction(()=>JSON.parse(localStorage.getItem('realload-v117')).placements.length===19);const packed=await state(p);
 assert.deepEqual(independent({...packed,placements:packed.placements.filter(item=>before.placements.some(old=>old.id===item.id))}),identities);assert.equal(new Set(packed.placements.map(item=>item.id)).size,19);valid(packed);
 const fresh=packed.placements.find(item=>!before.placements.some(old=>old.id===item.id));assert.equal(fresh.skuId,'BETA-MIXED');assert.deepEqual([fresh.cargoSpec.L,fresh.cargoSpec.W,fresh.cargoSpec.H,fresh.weight,fresh.kind],[500,400,400,18,'coolbox']);
 await p.reload({waitUntil:'networkidle'});assert.deepEqual(independent(await state(p)),independent(packed));return{reflowCount:18,automaticCount:19,retainedOldIds:identities.map(item=>item.id),newRecord:fresh.id};
});

await run('sparse-fourth-ordinal-plus-adds-exactly-one-unit-of-selected-sku',async p=>{
 const data=structuredClone(fixture),mixed=data.skus.find(s=>s.id==='BETA-MIXED'),other=data.skus.find(s=>s.id==='BETA-CRATE');
 data.project='稀疏件序号 · 合成回归';data.skus=[mixed,other];data.placements=[{...data.placements.find(item=>item.skuId===mixed.id),id:'BETA-MIXED#4',ordinal:4}];
 await importJson(p,data,'sparse-fourth-unit.json');await p.waitForFunction(()=>JSON.parse(localStorage.getItem('realload-v117')).project==='稀疏件序号 · 合成回归');
 const before=await state(p);assert.equal(before.placements.length,1);assert.equal(before.placements[0].ordinal,4);await panel(p);await p.locator('.sku-card[data-id="BETA-MIXED"] [data-action=place]').click();
 await p.waitForFunction(()=>JSON.parse(localStorage.getItem('realload-v117')).placements.length===2);const after=await state(p);assert.deepEqual(after.placements.find(item=>item.id==='BETA-MIXED#4'),before.placements[0]);
 assert.equal(after.placements.filter(item=>item.skuId===other.id).length,0);const fresh=after.placements.find(item=>item.id!=='BETA-MIXED#4');assert.equal(fresh.skuId,mixed.id);assert.equal(fresh.ordinal,1);assert.deepEqual([fresh.cargoSpec.L,fresh.cargoSpec.W,fresh.cargoSpec.H,fresh.weight],[500,400,400,18]);valid(after);return{oldSerial:4,newSerial:1,newCount:2,otherSkuLoaded:0};
});

await run('arbitrary-physical-id-uses-explicit-third-ordinal-and-original-name',async p=>{
 const data=structuredClone(fixture),record=data.placements.find(item=>item.id==='BETA-MIXED#3');record.id='WAREHOUSE-PHYSICAL-3';
 data.project='任意实物ID与显式序号 · 合成回归';await importJson(p,data,'arbitrary-physical-id.json');
 await p.waitForFunction(()=>JSON.parse(localStorage.getItem('realload-v117')).project==='任意实物ID与显式序号 · 合成回归');
 const before=await state(p),original=before.placements.find(item=>item.id==='WAREHOUSE-PHYSICAL-3'),code=original.unitCode;
 assert.equal(original.ordinal,3);assert.match(code,/^PLAN-.*-003$/);assert.equal(new Set(before.placements.filter(item=>item.skuId==='BETA-MIXED').map(item=>item.unitCode)).size,3);
 const futureName='新模板名称，不能覆盖第3件旧实物';await edit(p,'BETA-MIXED',{name:futureName});assert.deepEqual(physical(await state(p)),physical(before));
 await panel(p,'free');await p.locator('#free-mode-select').click();await p.locator('#free-loaded-search').fill(code);
 assert.equal(await p.locator('#free-loaded-list [data-loaded-id]').count(),1);assert.equal(await p.locator('#free-loaded-total').textContent(),'1 / 18 件');
 const row=p.locator('#free-loaded-list [data-loaded-id="WAREHOUSE-PHYSICAL-3"]');assert.equal(await row.count(),1);assert.equal(await row.locator('strong').textContent(),code);assert.ok((await row.locator('span').textContent()).includes(original.name));assert.equal((await row.textContent()).includes(futureName),false);
 await row.click();assert.equal((await state(p)).selected,original.id);assert.equal(await p.locator('#context-name').textContent(),original.name);assert.equal(await p.locator('#context-code').textContent(),code);assert.ok((await p.locator('#scene-readout').textContent()).includes(code));
 // A scene click leaves button focus before using the documented shortcut.
 // Shortcuts deliberately ignore buttons, text fields and open dialogs.
 await p.locator('#context-focus').click();await p.locator('#stage-canvases canvas').first().click({position:{x:8,y:8}});
 assert.equal(await p.evaluate(()=>!!document.activeElement?.closest('input,textarea,select,button,summary,[contenteditable=true]')),false,'scene interaction must release form-control focus');
 await p.keyboard.press('/');await p.locator('#locator-search').waitFor({state:'visible'});assert.equal((await state(p)).scenePreset,'locator');await p.locator('#locator-search').fill(code);
 assert.equal(await p.locator('#locator-results [data-locate-id]').count(),1);const located=p.locator('#locator-results [data-locate-id="WAREHOUSE-PHYSICAL-3"]');assert.equal(await located.count(),1);assert.equal(await located.locator('strong').textContent(),code);
 await located.click();assert.equal((await state(p)).selected,original.id);assert.equal(await p.locator('#context-code').textContent(),code);assert.equal(await p.locator('#context-name').textContent(),original.name);assert.ok((await p.locator('#scene-readout').textContent()).includes(code));
 assert.deepEqual(physical(await state(p)),physical(before));await p.reload({waitUntil:'networkidle'});const restored=await state(p);assert.equal(restored.placements.find(item=>item.id===original.id).ordinal,3);assert.equal(restored.selected,original.id);assert.equal(await p.locator('#context-code').textContent(),code);assert.equal(await p.locator('#context-name').textContent(),original.name);
 return{physicalId:original.id,explicitOrdinal:3,correctUnitCode:code,originalPhysicalName:original.name,futureTemplateName:futureName,freeSearchMatches:1,locatorSearchMatches:1};
});

for(const viewport of [{width:876,height:672},{width:390,height:700}])await run('locator-results-remain-clickable-with-selected-editor-'+viewport.width,async(p,c,v)=>{
 await load(p);const before=await state(p),target=before.placements.find(item=>item.id==='BETA-MIXED#3');assert.ok(target);
 await closeLibrary(p);await panel(p,'free');await p.locator('#free-mode-select').click();await p.locator('#free-loaded-search').fill(target.unitCode);
 await p.locator(`#free-loaded-list [data-loaded-id="${target.id}"]`).click();await closeLibrary(p);
 await p.locator('[data-view=top]').click();await p.locator('#context-focus').click();
 const canvas=p.locator('#stage-canvases canvas').first(),canvasBox=await canvas.boundingBox();assert.ok(canvasBox&&canvasBox.width>0&&canvasBox.height>0);
 // Click the focused physical cargo through the canvas. Keep the selected editor
 // open while testing the locator so both panels must coexist at this breakpoint.
 await canvas.click({position:{x:canvasBox.width/2,y:canvasBox.height/2}});
 assert.equal((await state(p)).selected,target.id,'a real canvas click must retain the focused physical unit');
 assert.equal(await p.locator('#context-editor').isVisible(),true);assert.equal(await p.locator('#context-code').textContent(),target.unitCode);
 assert.equal(await p.evaluate(()=>!!document.activeElement?.closest('input,textarea,select,button,summary,[contenteditable=true]')),false,'canvas interaction must release form-control focus');
 await p.keyboard.press('/');await p.locator('#locator-search').waitFor({state:'visible'});assert.equal((await state(p)).scenePreset,'locator');
 await p.locator('#locator-search').fill(target.unitCode);const rows=p.locator('#locator-results [data-locate-id]');assert.equal(await rows.count(),1);
 const row=p.locator(`#locator-results [data-locate-id="${target.id}"]`);await row.waitFor({state:'visible'});await row.scrollIntoViewIfNeeded();
 const rowBox=await row.boundingBox();inside(rowBox,v,'clickable locator result');
 const resultBox=await p.locator('#locator-results').boundingBox();assert.ok(resultBox&&resultBox.height>=rowBox.height-1&&rowBox.y>=resultBox.y-1&&rowBox.y+rowBox.height<=resultBox.y+resultBox.height+1,'the result region must show the complete result row');
 assert.equal(await row.evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return !!hit&&(hit===el||el.contains(hit));}),true,'the visible result must receive a real pointer click');
 await row.click();assert.equal((await state(p)).selected,target.id);assert.equal(await p.locator('#context-code').textContent(),target.unitCode);assert.equal(await p.locator('#context-name').textContent(),target.name);assert.ok((await p.locator('#scene-readout').textContent()).includes(target.unitCode));
 assert.deepEqual(physical(await state(p)),physical(before));assert.deepEqual(independent(await state(p)),independent(before));
 return{selectedEditorOpen:true,unitCode:target.unitCode,visibleResults:1,rowBox,resultBox,actualPointerSelection:true};
},viewport);

await run('mixed-eighteen-unit-complete-load-and-unload-preview',async p=>{
 await load(p);const before=await state(p);await p.locator('#workflow-route-mode').selectOption('strict');
 await p.locator('button[data-playback-mode=load]').click();await p.locator('#workflow-play').click();await p.waitForFunction(()=>document.querySelector('#stage').dataset.playbackState==='complete',{},{timeout:30000});
 assert.equal(await p.locator('#workflow-count').textContent(),'18 / 18 件');assert.deepEqual(physical(await state(p)),physical(before));assert.deepEqual(independent(await state(p)),independent(before));
 await p.locator('#workflow-exit').click();await p.locator('button[data-playback-mode=unload]').click();await p.locator('#workflow-play').click();await p.waitForFunction(()=>document.querySelector('#stage').dataset.playbackState==='complete',{},{timeout:30000});
 assert.equal(await p.locator('#workflow-count').textContent(),'18 / 18 件');const unloaded=await state(p);assert.equal(unloaded.unloadRemoved.length,18);assert.equal(new Set(unloaded.unloadRemoved).size,18);assert.deepEqual(physical(unloaded),physical(before));
 await p.locator('#workflow-exit').click();const after=await state(p);assert.equal(after.unloadRemoved.length,0);assert.deepEqual(physical(after),physical(before));valid(after);return{loadCompleted:18,unloadCompleted:18,previewOnly:true};
});

for(const viewport of [{width:1440,height:900},{width:390,height:700}])await run('mixed-four-views-shell-and-scene-fullscreen-'+viewport.width,async(p,c,v)=>{
 await load(p);const before=await state(p);await closeLibrary(p);await p.locator('[data-view=multi]').click();assert.equal(await p.locator('#stage-canvases canvas').count(),4);
 const labels=await p.locator('#stage-canvases canvas').evaluateAll(canvases=>canvases.map(canvas=>canvas.getAttribute('aria-label')));assert.equal(labels.length,4);assert.ok(labels.every(label=>label.includes('18 件')));assert.match(await p.locator('#renderer-status').textContent(),/WebGL2/);
 await p.locator('[data-view=iso]').click();await p.locator('#editor-fullscreen').click();await p.waitForFunction(()=>document.fullscreenElement?.id==='stage');
 const scene=await p.locator('#stage-canvases').boundingBox();assert.deepEqual(scene,{x:0,y:0,width:v.width,height:v.height});assert.equal(await p.evaluate(()=>getComputedStyle(document.documentElement).zoom),'1');
 const images=[];for(const mode of ['hidden','ghost','solid']){
  await openAppearance(p,v);await p.locator(`[data-shell=${mode}]`).click();await p.locator('#container-appearance-close').click();await frame(p);
  images.push({mode,hash:hash(await p.locator('#stage-canvases').screenshot({path:resolve(output,`mixed-${v.width}-${mode}.png`)}))});
 }
 assert.equal(new Set(images.map(image=>image.hash)).size,3,'physical shell opacity must change pixels');
 await openAppearance(p,v);const slider=p.locator('#v113-shell-alpha');await slider.focus();await slider.press('Home');await slider.press('PageUp');await slider.press('PageUp');await slider.press('PageUp');assert.equal(await slider.inputValue(),'30');assert.equal(await p.locator('#v113-shell-percent').textContent(),'30%');await p.locator('#container-appearance-close').click();
 await p.locator('#fullscreen-exit').click();assert.deepEqual(physical(await state(p)),physical(before));assert.deepEqual(independent(await state(p)),independent(before));assert.equal((await state(p)).opts.wallOpacity,.3);return{labels,scene,images,opacity:.3};
},viewport);

await run('invalid-json-imports-reject-entire-plan',async p=>{
 await load(p);const before=await state(p),cases=[];
 const brokenSpec=structuredClone(fixture);brokenSpec.placements[0].cargoSpec.weight=-1;cases.push(['negative-spec',brokenSpec,'单件规格尺寸或毛重非法']);
 const duplicateOrdinal=structuredClone(fixture);duplicateOrdinal.placements.find(item=>item.id==='BETA-MIXED#3').ordinal=1;cases.push(['duplicate-ordinal',duplicateOrdinal,'第 1 件重复']);
 const brokenDoor=structuredClone(fixture);brokenDoor.container.doorW=brokenDoor.container.W+1;cases.push(['door-too-wide',brokenDoor,'柜门净宽']);
 const duplicateId=structuredClone(fixture);duplicateId.placements[1].id=duplicateId.placements[0].id;cases.push(['duplicate-record',duplicateId,'货物编号缺失或重复']);
 const numericId=structuredClone(fixture);numericId.skus[0].id=123;cases.push(['numeric-sku-id',numericId,'货物|编号']);
 const blankId=structuredClone(fixture);blankId.skus[0].id='   ';cases.push(['blank-sku-id',blankId,'货物|编号']);
 const explosiveWidth=structuredClone(fixture);explosiveWidth.skus[0].numbering={mode:'planned',prefix:'QA-',width:1e12,source:'system-planned'};cases.push(['excessive-numbering-width',explosiveWidth,'货物|编号']);
 const unknownNumbering=structuredClone(fixture);unknownNumbering.skus[0].numbering={mode:'unknown',prefix:'QA-',width:3,source:'system-planned'};cases.push(['unknown-numbering-mode',unknownNumbering,'货物|编号']);
 const brokenSource=structuredClone(fixture);brokenSource.container.verified=123;cases.push(['invalid-container-source',brokenSource,'箱体名称|来源']);
 const brokenName=structuredClone(fixture);brokenName.skus[0].name={unexpected:true};cases.push(['invalid-cargo-name',brokenName,'货物|编号']);
 const rejected=[];for(const [name,data,expected] of cases){
  // Observe the next real notification rather than accepting the preceding
  // rejection when multiple malformed records produce the same message.
  const notification=p.locator('#message').evaluate(node=>new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{observer.disconnect();reject(Error('No import result notification'));},14000);
   const observer=new MutationObserver(()=>{clearTimeout(timer);observer.disconnect();resolve(node.textContent);});
   observer.observe(node,{childList:true,characterData:true,subtree:true});
  }));
  const [message]=await Promise.all([notification,importJson(p,data,name+'.json')]);assert.match(message,/无法导入/);assert.match(message,new RegExp(expected));
  assert.deepEqual(await state(p),before,`${name}: a failed import must be atomic`);rejected.push({name,message});
 }
 return rejected;
});

await run('zero-quantity-plan-and-empty-coordinate-update-retain-physical-units',async p=>{
 const data=structuredClone(fixture),zero={...data.skus[0],id:'BETA-ZERO',name:'未装且数量为零（合成回归）',kind:'carton',qty:0};delete zero.numbering;
 data.skus.unshift(zero);data.project='零库存完整方案 · 合成回归';data.planning={doorMode:'strict',clearance:0,policy:'distance',maxLift:200};
 await importJson(p,data,'zero-quantity-complete-plan.json');await p.waitForFunction(()=>JSON.parse(localStorage.getItem('realload-v117')).project==='零库存完整方案 · 合成回归');
 const before=await state(p);assert.equal(before.skus.length,17);assert.equal(before.skus.find(item=>item.id==='BETA-ZERO').qty,0);assert.equal(before.placements.length,18);assert.equal(before.placements.filter(item=>item.skuId==='BETA-ZERO').length,0);
 assert.equal(before.routePolicy,'distance');assert.equal(before.maxLift,200);assert.equal(before.unloadDoorMode,'strict');valid(before);
 await panel(p);assert.equal(await p.locator('.sku-card[data-id="BETA-ZERO"]').count(),1);assert.match(await p.locator('.sku-card[data-id="BETA-ZERO"]').textContent(),/0 \/ 0/);
 const template={...before.skus.find(item=>item.id==='BETA-MIXED'),L:725,W:475,H:560,weight:43,kind:'machine'};
 const update={schemaVersion:3,project:'空坐标只更新资料与规划设置',skus:[template],placements:[],container:{...before.box,L:6400},planning:{doorMode:'smart',clearance:10,policy:'low-lift',maxLift:0}};
 await importJson(p,update,'empty-coordinate-project-and-planning.json');await p.waitForFunction(()=>JSON.parse(localStorage.getItem('realload-v117')).project==='空坐标只更新资料与规划设置');
 const after=await state(p);assert.deepEqual(physical(after),physical(before));assert.deepEqual(independent(after),independent(before));assert.equal(after.skus.length,17);assert.deepEqual(after.skus.find(item=>item.id==='BETA-ZERO'),before.skus.find(item=>item.id==='BETA-ZERO'));
 assert.deepEqual([after.skus.find(item=>item.id==='BETA-MIXED').L,after.skus.find(item=>item.id==='BETA-MIXED').weight],[725,43]);assert.equal(after.box.L,6400);assert.equal(after.routePolicy,'low-lift');assert.equal(after.maxLift,0);assert.equal(after.unloadDoorMode,'smart');assert.equal(after.unloadClearance,10);valid(after);
 await p.reload({waitUntil:'networkidle'});const restored=await state(p);assert.deepEqual(physical(restored),physical(before));assert.equal(restored.project,update.project);assert.equal(restored.maxLift,0);assert.equal(restored.routePolicy,'low-lift');assert.equal(restored.skus.find(item=>item.id==='BETA-ZERO').qty,0);
 const exported=JSON.parse((await exportFile(p,'#export-json','zero-stock-and-empty-coordinate-settings.json')).text);assert.equal(exported.project,update.project);assert.deepEqual(exported.planning,update.planning);assert.equal(exported.skus.find(item=>item.id==='BETA-ZERO').qty,0);assert.deepEqual(independent({placements:exported.placements}),independent(before));
 return{zeroStockRecordRetained:true,loadedUnits:18,emptyCoordinatesPreservePhysicalUnits:true,project:restored.project,planning:exported.planning};
});

const corruptRaw='{"project":"保留损坏的原始记录 · Beta QA","placements":[';
await run('damaged-storage-download-and-explicit-fresh-workspace-retain-backup',async p=>{
 await p.locator('#recovery-dialog[open]').waitFor();assert.equal(await p.evaluate(key=>localStorage.getItem(key),storage),corruptRaw);assert.match(await p.locator('#recovery-description').textContent(),/无法读取/);
 await frame(p);assert.equal(await p.locator('#guide-dialog').evaluate(dialog=>dialog.open),false,'onboarding must not cover the recovery decision');
 const recoveryDownload=p.locator('#recovery-dialog #recovery-download');await recoveryDownload.waitFor({state:'visible'});
 const [download]=await Promise.all([p.waitForEvent('download'),recoveryDownload.click()]);
 const path=resolve(output,'damaged-original-before-continue.txt');await download.saveAs(path);assert.equal(await readFile(path,'utf8'),corruptRaw);
 const backup=await p.evaluate(key=>JSON.parse(localStorage.getItem(key)),recoveryStorage);assert.equal(backup.raw,corruptRaw);assert.equal(backup.sourceKey,storage);
 await p.locator('#recovery-continue').click();await skipGuide(p);assert.equal(await p.locator('#recovery-dialog').evaluate(d=>d.open),false);assert.notEqual(await p.evaluate(key=>localStorage.getItem(key),storage),corruptRaw);valid(await state(p));
 await p.reload({waitUntil:'networkidle'});await skipGuide(p);assert.equal(await p.locator('#recovery-dialog').evaluate(d=>d.open),false);
 const retained=await exportFile(p,'#export-recovery','damaged-original-after-continue.txt');assert.equal(retained.text,corruptRaw);assert.equal((await p.evaluate(key=>JSON.parse(localStorage.getItem(key)),recoveryStorage)).raw,corruptRaw);
 return{malformedBytes:Buffer.byteLength(corruptRaw),originalDownloaded:true,freshWorkspaceExplicit:true,backupExportedAfterReload:true};
},{width:1440,height:900},{corruptRaw});

console.log(JSON.stringify({total:results.length,passed:results.filter(result=>result.passed).length,failed:results.filter(result=>!result.passed).length}));if(results.some(result=>!result.passed))process.exitCode=1;

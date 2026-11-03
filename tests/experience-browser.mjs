/**
 * V1.19 task-flow acceptance against a running local RealLoad server.
 *
 * PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
 * CHROME_EXECUTABLE=/path/to/chrome node tests/experience-browser.mjs
 *
 * REALLOAD_URL defaults to http://localhost:4202. Screenshots and results go to
 * artifacts/experience (override with EXPERIENCE_ARTIFACTS). Every case uses a
 * new isolated context. Stored plans are read for assertions, never injected.
 * EXPERIENCE_CASE may contain a regular expression for a focused rerun.
 */
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {isAbsolute, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {validate} from '../src/engine.mjs';
import {getCargoScenario,trainingScenarios} from '../src/cargo-scenarios.mjs';

const modulePath = process.env.PLAYWRIGHT_MODULE || 'playwright';
const {chromium} = await import(isAbsolute(modulePath) || modulePath.startsWith('.')
  ? pathToFileURL(resolve(modulePath)).href : modulePath);
const baseUrl = process.env.REALLOAD_URL || 'http://localhost:4202';
const storageKey = process.env.REALLOAD_STORAGE_KEY || 'realload-v117';
const caseFilter = process.env.EXPERIENCE_CASE ? new RegExp(process.env.EXPERIENCE_CASE) : null;
const output = process.env.EXPERIENCE_ARTIFACTS
  ? resolve(process.env.EXPERIENCE_ARTIFACTS)
  : fileURLToPath(new URL('../artifacts/experience/', import.meta.url));
await mkdir(output, {recursive:true});
const launchBrowser = () => chromium.launch({headless:true,
  args:['--enable-unsafe-swiftshader'],
  ...(process.env.CHROME_EXECUTABLE ? {executablePath:process.env.CHROME_EXECUTABLE} : {})});
const results = [];
const state = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey);
const selected = async page => {const s=await state(page); return s.placements.find(p=>p.id===s.selected);};
const geometry = plan => validate(plan.placements, plan.box, plan.skus);
const point = item => ({x:item.x,y:item.y,z:item.z});
const activate = (page,selector) => page.viewportSize().width<=600
  ? page.locator(selector).tap() : page.locator(selector).click();

function inside(rect, viewport, label) {
  assert.ok(rect && rect.width>0 && rect.height>0, label+' should be visible');
  assert.ok(rect.x>=-1 && rect.x+rect.width<=viewport.width+1, label+' should fit horizontally');
  assert.ok(rect.y>=-1 && rect.y+rect.height<=viewport.height+1, label+' should fit vertically');
}

async function run(name, action, viewport={width:1440,height:900}, firstRun=false) {
  if(caseFilter && !caseFilter.test(name)) return;
  const browser=await launchBrowser();
  const context=await browser.newContext({viewport, reducedMotion:'reduce',
    isMobile:viewport.width<=600,hasTouch:viewport.width<=600});
  const page=await context.newPage();
  page.setDefaultTimeout(8000);
  const errors=[];
  page.on('pageerror', error=>errors.push(error.message));
  console.log('RUN',name);
  const result={name,viewport};
  try {
    await page.goto(baseUrl,{waitUntil:'networkidle'});
    await page.waitForSelector('#scenario-open');
    if(!firstRun && await page.locator('#guide-dialog').evaluate(d=>d.open))await page.locator('#guide-skip').click();
    await action(page,viewport);
    assert.deepEqual(errors,[],'No unhandled page errors');
    const plan=await state(page);
    assert.equal(geometry(plan).valid,true,'Persisted plan must satisfy geometry constraints');
    result.passed=true;
    result.final={scenario:plan.scenarioId,selected:plan.selected,count:plan.placements.length,
      preview:await page.locator('#stage').getAttribute('data-playback-state')};
    await page.screenshot({path:resolve(output,name+'.png'),fullPage:true});
    console.log('PASS',name);
  } catch(error) {
    result.passed=false;result.error=error.message;result.errors=errors;
    result.stack=error.stack?.split('\n').slice(0,5).join('\n');
    result.observed=await page.evaluate(()=>({scrollY,focus:document.activeElement?.id,
      dialogs:[...document.querySelectorAll('dialog[open]')].map(el=>el.id),
      feedback:document.querySelector('#context-feedback')?.textContent,
      message:document.querySelector('#message')?.textContent,
      context:document.querySelector('#context-editor')?.getBoundingClientRect().toJSON()})).catch(()=>null);
    await page.screenshot({path:resolve(output,'failure-'+name+'.png'),fullPage:true}).catch(()=>{});
    console.log('FAIL',name,error.message);
  } finally {
    results.push(result);
    await writeFile(resolve(output,'results.json'),JSON.stringify(results,null,2)+'\n');
    await context.close();
    await browser.close();
  }
}

async function scenario(page,id) {
  await page.locator('#scenario-open').click();
  assert.equal(await page.locator('#scenario-dialog').evaluate(el=>el.open),true);
  await page.locator('input[name="scenario"][value="'+id+'"]').check();
  assert.match(await page.locator('.scenario-replace-note').textContent(),/替换.*撤销/);
  assert.match(await page.locator('#scenario-preview').textContent(),/模拟|非厂家/);
  await page.locator('#scenario-apply').click();
  await page.waitForFunction(([key,id])=>JSON.parse(localStorage.getItem(key))?.scenarioId===id,[storageKey,id]);
  assert.equal(await page.locator('#scenario-dialog').evaluate(el=>el.open),false);
  const plan=await state(page), expected=getCargoScenario(id);
  assert.equal(plan.placements.length,expected.placements.length);
  assert.deepEqual(plan.placements,expected.placements,'Scenario must load editable fixture geometry exactly');
  assert.equal(geometry(plan).valid,true);
  return plan;
}

async function cargo(page) {
  const s=await state(page), compact=page.viewportSize().width<=1040;
  if (s.section!=='cargo') await activate(page,'.rail-item[data-section="cargo"]');
  else if(compact && !await page.locator('#library-sheet').evaluate(el=>el.open)) {
    await activate(page,page.viewportSize().width<760?'#v117-library-toggle':'.rail-item[data-section="cargo"]');
  } else if(!compact && !await page.locator('#library-cargo').isVisible()) {
    await page.locator('.rail-item[data-section="cargo"]').click();
  }
  if(compact) await page.waitForFunction(()=>document.querySelector('#library-sheet').open);
}

async function choose(page,sku) {
  await cargo(page);
  await activate(page,'#sku-list .sku-card[data-id="'+sku+'"] .sku-description');
  await page.waitForFunction(([key,sku])=>{
    const s=JSON.parse(localStorage.getItem(key));
    return s.placements.find(p=>p.id===s.selected)?.skuId===sku;
  },[storageKey,sku]);
  if(page.viewportSize().width<=1040) {
    await page.waitForFunction(()=>!document.querySelector('#library-sheet').open);
    // Closing the native dialog schedules the return scroll on the next frame.
    // Measure the resulting task layout only after that frame has been painted.
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  }
  const item=await selected(page);
  assert.equal(await page.locator('#context-editor').getAttribute('data-selected-id'),item.id);
  assert.equal(await page.locator('#context-editor').isVisible(),true);
  return item;
}

async function coordinates(page,values) {
  for(const [axis,value] of Object.entries(values)) await page.locator('#context-'+axis).fill(String(value));
  await page.locator('#context-apply').click();
}

try {
  await run('first-use-tutorial-and-plan-name',async page=>{
    assert.equal(await page.locator('#guide-dialog').evaluate(d=>d.open),true);
    assert.equal(await page.locator('#guide-progress button').count(),6);
    for(let step=0;step<6;step++){
      assert.match(await page.locator('#guide-eyebrow').textContent(),new RegExp(`${step+1} / 6`));
      assert.equal(await page.locator('#guide-tips>div').count(),3);
      await page.locator('#guide-next').click();
    }
    assert.equal(await page.locator('#guide-dialog').evaluate(d=>d.open),false);
    await page.reload({waitUntil:'networkidle'});
    assert.equal(await page.locator('#guide-dialog').evaluate(d=>d.open),false,'Completed tutorial must not interrupt the next visit');
    await page.locator('#help-btn').click();
    await page.locator('#guide-repeat').check();await page.locator('#guide-skip').click();
    await page.reload({waitUntil:'networkidle'});
    assert.equal(await page.locator('#guide-dialog').evaluate(d=>d.open),true,'Explicit repeat preference must be honored');
    await page.locator('#guide-repeat').uncheck();await page.locator('#guide-skip').click();
    await page.locator('#project-title').click();
    await page.locator('#plan-name-input').fill('上海仓 · 客户 A · 第一柜');
    await page.locator('#plan-name-form [type=submit]').click();
    assert.equal((await state(page)).project,'上海仓 · 客户 A · 第一柜');
    assert.match(await page.locator('#project-title').textContent(),/上海仓/);
    await page.reload({waitUntil:'networkidle'});
    assert.equal(await page.locator('#guide-dialog').evaluate(d=>d.open),false,'Skipped tutorial must stay dismissed');
    assert.match(await page.locator('#project-title').textContent(),/上海仓/);
    await page.locator('#global-overflow summary').click();await page.locator('#export-btn').click();
    const downloadEvent=page.waitForEvent('download');await page.locator('#export-json').click();
    const download=await downloadEvent,backup=resolve(output,'named-plan-backup.json');
    assert.match(download.suggestedFilename(),/上海仓/);await download.saveAs(backup);
    await page.locator('#project-title').click();await page.locator('#plan-name-input').fill('临时名称');
    await page.locator('#plan-name-form [type=submit]').click();
    await page.locator('#import-btn').click();await page.locator('#import-sheet-file').setInputFiles(backup);
    await page.waitForFunction(()=>!document.querySelector('#import-dialog').open);
    await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).project==='上海仓 · 客户 A · 第一柜',storageKey);
    assert.equal((await state(page)).project,'上海仓 · 客户 A · 第一柜','JSON backup must restore the planning name');
  },{width:876,height:672},true);

  await run('scene-fullscreen-retains-floating-editing-and-cargo-access',async(page,viewport)=>{
    await scenario(page,'irregular-equipment');await choose(page,'SIM-IRR-L');
    let stage=await page.locator('#stage').boundingBox(),editor=await page.locator('#context-editor').boundingBox();
    assert.ok(editor.x>=stage.x+stage.width-1,'Tablet editor must sit beside the canvas');
    inside(await page.locator('#context-apply').boundingBox(),viewport,'Position save action');
    await page.locator('#editor-fullscreen').click();
    await page.waitForFunction(()=>!!document.fullscreenElement);
    const chrome=await page.evaluate(()=>({scene:document.querySelector('#stage-canvases').getBoundingClientRect().toJSON(),screen:{width:innerWidth,height:innerHeight},fullscreen:document.fullscreenElement.id}));
    assert.equal(chrome.fullscreen,'stage');assert.equal(chrome.scene.x,0);assert.equal(chrome.scene.y,0);assert.equal(chrome.scene.width,chrome.screen.width);assert.equal(chrome.scene.height,chrome.screen.height);
    await page.locator('#fullscreen-inspector').click();inside(await page.locator('#context-x').boundingBox(),viewport,'Fullscreen selected X field');
    await page.locator('#fullscreen-cargo').click();
    assert.equal(await page.locator('#library-sheet').evaluate(d=>d.open),true,'Cargo panel must also work in actual fullscreen');
    await page.locator('#library-return-scene').click();
    await page.locator('#editor-fullscreen').click();
    await page.waitForFunction(()=>!document.fullscreenElement);
    assert.equal(await page.locator('body').evaluate(b=>b.classList.contains('v112-fullscreen')),false);
  },{width:876,height:672});

  await run('scenarios-replace-and-history',async page=>{
    assert.equal(await page.locator('dialog[open]').count(),0);
    const initial=await state(page);
    await scenario(page,'daily-mixed');
    const daily=await state(page);
    assert.match(await page.locator('#metric-count').textContent(),/^11\s*\/\s*11$/);
    await scenario(page,'irregular-equipment');
    const irregular=await state(page);
    assert.equal(irregular.skus.filter(s=>s.kind==='irregular').length,2);
    assert.ok(irregular.skus.every(s=>s.sampleOnly && /模拟/.test(s.importSource)));
    assert.match(await page.locator('#scenario-note').textContent(),/模拟测试场景/);
    await page.locator('#history-undo').click();
    assert.deepEqual((await state(page)).placements,daily.placements);
    assert.equal((await state(page)).scenarioId,'daily-mixed');
    await page.locator('#history-redo').click();
    assert.deepEqual((await state(page)).placements,irregular.placements);
    await scenario(page,'door-support-boundaries');
    assert.equal((await state(page)).placements.length,6);
    await page.locator('#scenario-open').click();
    assert.equal(await page.locator('[name="scenario"]').count(),trainingScenarios.length);
    await page.locator('[name="scenario"][value="daily-mixed"]').check();
    await page.locator('#scenario-cancel').click();
    assert.equal((await state(page)).scenarioId,'door-support-boundaries','Cancel must preserve active plan');
    assert.equal(initial.placements.length,0,'Isolated context must start without a previous user plan');
  });

  await run('all-four-samples-complete-loading-and-unloading',async page=>{
    for(const {id} of trainingScenarios){
      await scenario(page,id);
      const original=(await state(page)).placements;
      for(const mode of ['load','unload']){
        await page.locator('button[data-playback-mode="'+mode+'"]').click();
        await page.locator('#workflow-play').click();
        await page.waitForFunction(()=>document.querySelector('#stage').dataset.playbackState==='complete');
        assert.equal(await page.locator('#stage').getAttribute('data-playback-index'),String(original.length));
        assert.deepEqual((await state(page)).placements,original,'Every simulated movement must retain original geometry');
        await page.locator('#workflow-exit').click();
        assert.equal(await page.locator('#stage').getAttribute('data-playback-state'),'idle');
      }
    }
  });

  await run('selected-unit-edit-and-undo',async page=>{
    await scenario(page,'daily-mixed');
    const original=await choose(page,'SIM-CARTON');
    assert.equal(await page.locator('#context-prev').isDisabled(),true);
    assert.equal(await page.locator('#context-instance').textContent(),'同类 1 / 4');
    await page.locator('#context-next').click();
    assert.notEqual((await selected(page)).id,original.id);
    assert.equal((await selected(page)).skuId,original.skuId);
    await page.locator('#context-prev').click();
    assert.equal((await selected(page)).id,original.id);
    await coordinates(page,{x:original.x+25});
    assert.equal((await selected(page)).x,original.x+25,'Valid XYZ edit must be persisted');
    assert.match(await page.locator('#context-feedback').textContent(),/已保存/);
    const saved=await selected(page);
    await coordinates(page,{x:(await state(page)).box.L});
    assert.deepEqual(point(await selected(page)),point(saved),'Out-of-container edit must not be saved');
    assert.equal(await page.locator('#context-x').getAttribute('aria-invalid'),'true');
    assert.equal(await page.locator('#context-feedback').evaluate(el=>el.classList.contains('error')),true);
    await page.locator('#context-revert').click();
    assert.equal(Number(await page.locator('#context-x').inputValue()),saved.x);
    await coordinates(page,{x:200,y:80});
    assert.deepEqual(point(await selected(page)),point(saved),'Collision edit must not be saved');
    await page.locator('#context-revert').click();
    await page.locator('#context-rotate').click();
    const rotated=await selected(page);
    assert.equal(rotated.L,saved.W);assert.equal(rotated.W,saved.L);
    assert.equal(rotated.x+rotated.L/2,saved.x+saved.L/2);
    assert.equal(rotated.y+rotated.W/2,saved.y+saved.W/2);
    await page.locator('#context-lock').click();
    assert.equal((await selected(page)).locked,true);
    assert.equal(await page.locator('#context-x').isDisabled(),true);
    assert.equal(await page.locator('#context-remove').isDisabled(),true);
    assert.equal(await page.locator('#context-rotate').isDisabled(),true);
    await page.keyboard.press('Control+z');
    assert.equal((await selected(page)).locked,false,'Undo must work while action button keeps focus');
    await page.keyboard.press('Control+Shift+z');assert.equal((await selected(page)).locked,true);
    await page.keyboard.press('Meta+z');assert.equal((await selected(page)).locked,false);
    await page.keyboard.press('Meta+Shift+z');assert.equal((await selected(page)).locked,true);
    await page.locator('#context-lock').click();
    const beforeInput=(await state(page)).placements;
    await page.locator('#context-x').focus();await page.keyboard.press('Control+z');
    assert.deepEqual((await state(page)).placements,beforeInput,'Typing undo must not undo the persisted plan');
    await page.locator('#context-revert').click();
    const beforeRemove=(await state(page)).placements;
    await page.locator('#context-remove').click();
    assert.equal((await state(page)).placements.length,beforeRemove.length-1);
    assert.equal(await page.locator('#context-editor').isVisible(),false);
    await page.locator('#history-undo').click();
    assert.deepEqual((await state(page)).placements,beforeRemove);
  });

  await run('scene-picking-and-one-editor',async page=>{
    await scenario(page,'daily-mixed');
    const item=await choose(page,'SIM-CARTON');
    const beforeSection=(await state(page)).section;
    await page.locator('#context-editor').focus();await page.keyboard.press('e');
    assert.equal(await page.locator('#context-editor').evaluate(el=>el===document.activeElement),true);
    assert.equal((await state(page)).section,beforeSection,'E should use the same context without switching modules');
    await page.locator('.sku-card[data-id="SIM-CARTON"]').click({button:'right'});
    await page.locator('[data-cargo-command="edit"]').click();
    assert.equal((await state(page)).selected,item.id);
    assert.equal((await state(page)).section,beforeSection);
    assert.equal(await page.locator('#cargo-context-menu').isVisible(),false);
    await page.locator('[data-view="top"]').click();
    await page.locator('#context-focus').click();
    await page.locator('#context-close').click();
    const canvas=page.locator('#stage-canvases canvas').first();
    const dimensions=await canvas.boundingBox();
    await canvas.click({position:{x:dimensions.width/2,y:dimensions.height/2}});
    assert.equal((await selected(page))?.id,item.id,'Real canvas center click should select the focused box');
    assert.equal(await page.locator('#context-editor').getAttribute('data-selected-id'),item.id);
  });

  await run('support-rejection-and-preview-exit',async page=>{
    await scenario(page,'door-support-boundaries');
    await choose(page,'SIM-SUPPORT-BASE');
    const original=(await state(page)).placements;
    await page.locator('#context-remove').click();
    assert.deepEqual((await state(page)).placements,original,'Supporting base cannot be removed before upper cargo');
    assert.match(await page.locator('#context-feedback').textContent(),/支撑|上方|依赖/);
    const top=await choose(page,'SIM-SUPPORT-TOP');
    await coordinates(page,{z:top.z+.01});
    assert.deepEqual((await state(page)).placements,original,'Unsupported lift of 0.01 mm must be rejected');
    await page.locator('#context-revert').click();
    await page.locator('#workflow-sequence-panel > summary').click();
    const step=page.locator('.workflow-step').first();
    const id=await step.getAttribute('data-playback-id');
    await step.click();
    assert.equal(await page.locator('#stage').getAttribute('data-playback-state'),'paused');
    assert.equal(await page.locator('#context-editor').getAttribute('data-selected-id'),id);
    assert.equal(await page.locator('#context-apply').isDisabled(),true,'Preview cannot mutate the real plan');
    assert.match(await page.locator('#context-feedback').textContent(),/预演|已暂停/);
    assert.deepEqual((await state(page)).placements,original);
    await page.locator('#workflow-exit').click();
    assert.equal(await page.locator('#stage').getAttribute('data-playback-state'),'idle');
    assert.equal((await state(page)).step,null);
    assert.deepEqual((await state(page)).unloadRemoved,[]);
    assert.deepEqual((await state(page)).placements,original,'Exit preview must restore the complete original plan');
    assert.equal(await page.locator('#context-apply').isEnabled(),true);
  });

  for(const viewport of [{width:320,height:568},{width:390,height:600},{width:820,height:500},{width:1440,height:900}]) {
    await run('task-flow-'+viewport.width+'x'+viewport.height,async(page,viewport)=>{
      await scenario(page,'irregular-equipment');
      await cargo(page);
      if(viewport.width<=1040) {
        inside(await page.locator('#library-sheet').boundingBox(),viewport,'Native cargo sheet');
        assert.equal(await page.locator('body').evaluate(el=>getComputedStyle(el).overflowY),'hidden');
        assert.equal(await page.locator('#library-return-scene').isVisible(),true);
        assert.equal(await page.locator('#library').evaluate(el=>getComputedStyle(el).overflowY),'auto','Cargo sheet needs its own bounded scroll area');
        await page.locator('#library').evaluate(el=>el.scrollTop=el.scrollHeight);
        const last=await page.locator('#sku-list .sku-card').last().boundingBox();
        assert.ok(last.y>=0 && last.y+last.height<=viewport.height,'Last cargo type must remain reachable inside the sheet');
        await page.locator('#library').evaluate(el=>el.scrollTop=0);
      }
      const item=await choose(page,'SIM-IRR-L');
      if(viewport.width<=1040) {
        await page.waitForFunction(()=>document.querySelector('#stage').getBoundingClientRect().bottom>0 && document.querySelector('#stage').getBoundingClientRect().top<innerHeight);
        const context=await page.locator('#context-editor').boundingBox();
        assert.ok(context.y<viewport.height,'Selection controls should enter the current mobile/tablet viewport');
        assert.equal(await page.locator('#library-sheet').evaluate(el=>el.open),false,'Selecting cargo must release the modal');
      }
      assert.match(await page.locator('#context-envelope').textContent(),/保守包络/);
      if(viewport.width>=760) {
        const applyRect=await page.locator('#context-apply').boundingBox();
        const editorRect=await page.locator('#context-editor').boundingBox();
        inside(applyRect,viewport,'Side editor save action');
        assert.ok(applyRect.y+applyRect.height<=editorRect.y+editorRect.height,
          'Save action must not be clipped by the side editor scroll boundary');
      }
      for(const mode of ['top','door','side','iso']) {
        await activate(page,'[data-view="'+mode+'"]');
        assert.equal((await state(page)).mode,mode);
        assert.equal((await state(page)).selected,item.id,'View switches must preserve selected cargo');
      }
      await page.locator('#context-editor').focus();await page.keyboard.press('e');
      await page.waitForFunction(()=>document.activeElement.id==='context-editor');
      const contextRect=await page.locator('#context-editor').boundingBox();
      assert.ok(contextRect.y<viewport.height && contextRect.y+contextRect.height>0,'E should reveal the same editor');
      if(viewport.width<=1040) {
        await cargo(page);await activate(page,'#library-return-scene');
        assert.equal(await page.locator('#library-sheet').evaluate(el=>el.open),false);
        await cargo(page);await activate(page,'#hide-sidebar');
        assert.equal(await page.locator('#library-sheet').evaluate(el=>el.open),false);
      }
      const original=(await state(page)).placements;
      await activate(page,'#workflow-next');
      await page.waitForFunction(()=>document.querySelector('#stage').dataset.playbackIndex==='1');
      assert.equal(await page.locator('#workflow-exit').isVisible(),true);
      await activate(page,'#workflow-exit');
      assert.deepEqual((await state(page)).placements,original);
      assert.equal((await state(page)).step,null);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth<=1),'Task flow must not introduce horizontal overflow');
    },viewport);
  }
} finally {
  await writeFile(resolve(output,'results.json'),JSON.stringify(results,null,2)+'\n');
}
console.log(JSON.stringify({passed:results.filter(r=>r.passed).length,total:results.length,output}));
if(!results.length || results.some(r=>!r.passed)) process.exitCode=1;

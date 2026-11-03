/** Inspect settled, visible text in isolated browser contexts; CSS contrast only, not a complete accessibility audit. */
import fs from 'node:fs';
import {isAbsolute,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const modulePath=process.env.PLAYWRIGHT_MODULE||'playwright';
const {chromium}=await import(isAbsolute(modulePath)||modulePath.startsWith('.')?pathToFileURL(resolve(modulePath)).href:modulePath);
const root=fileURLToPath(new URL('..',import.meta.url));
const report={testedAt:new Date().toISOString(),engine:'Installed Chrome headless; isolated browser contexts',url:process.env.REALLOAD_URL||'http://localhost:4202',states:[],errors:[],limits:['Computed CSS contrast for opaque solid backgrounds; gradient stop bounds are identified separately.','Text outside viewport or clipped out of a scroll container is excluded from visible failures.','No physical mobile device coverage.']};
const launch=()=>chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{}),args:['--enable-unsafe-swiftshader']});
let browser=await launch();
async function scan(page,name,rootSelector='body'){
 await page.waitForTimeout(300);
 const result=await page.evaluate(rootSelector=>{
  const rgba=value=>{const n=value.match(/[\d.]+/g)?.map(Number)||[0,0,0,0];return [n[0],n[1],n[2],n.length>3?n[3]:1];};
  const blend=(top,bottom)=>[...top.slice(0,3).map((n,i)=>n*top[3]+bottom[i]*(1-top[3])),1];
  const lum=color=>color.slice(0,3).map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4).reduce((s,n,i)=>s+n*[.2126,.7152,.0722][i],0);
  const ratio=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
  const hex=a=>'#'+a.slice(0,3).map(n=>Math.round(n).toString(16).padStart(2,'0')).join('');
  const selector=e=>{if(e.id)return '#'+CSS.escape(e.id);let parts=[];for(let n=e;n&&n!==document.body&&parts.length<4;n=n.parentElement){if(n.id){parts.unshift('#'+CSS.escape(n.id));break;}let p=n.tagName.toLowerCase();if(n.classList.length)p+='.'+[...n.classList].slice(0,2).map(CSS.escape).join('.');else if(n.parentElement)p+=`:nth-of-type(${[...n.parentElement.children].filter(x=>x.tagName===n.tagName).indexOf(n)+1})`;parts.unshift(p);}return parts.join(' > ');};
  const root=document.querySelector(rootSelector),rows=[],excluded={hidden:0,disabled:0,animating:0,noVisibleText:0,outsideViewport:0};
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  while(walker.nextNode()){
   const text=walker.currentNode.textContent.trim().replace(/\s+/g,' ');if(!text)continue;
   const e=walker.currentNode.parentElement;if(!e||['SCRIPT','STYLE','NOSCRIPT','OPTION'].includes(e.tagName))continue;
   if(document.fullscreenElement&&!document.fullscreenElement.contains(e)&&!e.closest(':popover-open,dialog:modal')){excluded.hidden++;continue;}
   if(e.closest(':disabled,[aria-disabled=true]')){excluded.disabled++;continue;}
   let hidden=false,opacity=1;const chain=[];
   for(let n=e;n;n=n.parentElement){const s=getComputedStyle(n);chain.unshift({node:n,style:s});opacity*=Number(s.opacity);if(s.display==='none'||s.visibility==='hidden'||s.contentVisibility==='hidden'||Number(s.opacity)===0||n.hidden){hidden=true;break;}if(n.tagName==='DIALOG'&&!n.open){hidden=true;break;}}
   if(hidden){excluded.hidden++;continue;}
   if(chain.some(({node})=>node.getAnimations().some(a=>a.playState==='running'))){excluded.animating++;continue;}
   // Top-layer elements escape overflow clipping of their DOM ancestors.
   const topLayer=chain.findLastIndex(({node})=>node===document.fullscreenElement||node.matches(':popover-open,dialog:modal'));
   const clipping=topLayer>=0?chain.slice(topLayer):chain;
   const range=document.createRange();range.selectNodeContents(walker.currentNode);let visible=false;
   for(const r of range.getClientRects()){
    if(r.width<=0||r.height<=0)continue;
    let left=Math.max(0,r.left),right=Math.min(innerWidth,r.right),top=Math.max(0,r.top),bottom=Math.min(innerHeight,r.bottom);
    for(const {node,style} of clipping){if(node===e)continue;const r2=node.getBoundingClientRect();if(['hidden','auto','scroll','clip'].includes(style.overflowX)){left=Math.max(left,r2.left);right=Math.min(right,r2.right);}if(['hidden','auto','scroll','clip'].includes(style.overflowY)){top=Math.max(top,r2.top);bottom=Math.min(bottom,r2.bottom);}}
    if(right>left&&bottom>top){visible=true;break;}
   }
   if(!range.getClientRects().length){excluded.noVisibleText++;continue;}
   if(!visible){excluded.outsideViewport++;continue;}
   let background=[255,255,255,1],backgroundSource='browser default',gradients=[];
   for(const {node,style} of chain){const color=rgba(style.backgroundColor);if(color[3]>=1)gradients=[];if(color[3]){background=blend(color,background);backgroundSource=selector(node);}if(style.backgroundImage!=='none')gradients.push({selector:selector(node),image:style.backgroundImage});}
   const style=getComputedStyle(e),foreground=rgba(style.color);foreground[3]*=opacity;
   const effective=blend(foreground,background);let contrast=ratio(effective,background),method='computed solid';
   if(gradients.length){const last=gradients.at(-1);const stops=[...last.image.matchAll(/rgba?\([^)]*\)/g)].map(m=>rgba(m[0]));if(stops.length){const candidates=stops.map(color=>blend(color,background));contrast=Math.min(...candidates.map(bg=>ratio(blend(foreground,bg),bg)));method='conservative gradient-stop ratio';}}
   const fontSize=parseFloat(style.fontSize),fontWeight=parseFloat(style.fontWeight)||400,required=fontSize>=24||(fontSize>=18.6667&&fontWeight>=700)?3:4.5;
   rows.push({selector:selector(e),text:text.slice(0,100),foreground:style.color,effectiveForeground:hex(effective),background:hex(background),backgroundSource,fontSize,fontWeight,ratio:Number(contrast.toFixed(3)),required,method,gradients,belowContrast:contrast<required,undersized:fontSize<11});
  }
  const probes=['.free-hero p','#save-status','.axis-label','.legend-axis','.breadcrumbs span','.v19-stack-option','.context-position-form small','#context-code','#context-instance','.scenario-choice small','.scenario-preview small'];
  const legacyEvidence=probes.flatMap(selector=>[...document.querySelectorAll(selector)].slice(0,3).map(e=>{const s=getComputedStyle(e);const reasons=[];for(let n=e;n;n=n.parentElement){const c=getComputedStyle(n);if(c.display==='none')reasons.push('display:none '+(n.id?'#'+n.id:n.tagName+'.'+n.className));if(c.visibility==='hidden')reasons.push('visibility:hidden');if(n.tagName==='DIALOG'&&!n.open)reasons.push('closed dialog');}return {selector,text:e.textContent.trim().slice(0,80),foreground:s.color,background:s.backgroundColor,fontSize:s.fontSize,rendered:e.getClientRects().length>0,hiddenReasons:reasons};}));
  return {viewport:{width:innerWidth,height:innerHeight},scrollY,excluded,rows,contrastFailures:rows.filter(r=>r.belowContrast),undersizedText:rows.filter(r=>r.undersized),legacyEvidence};
 },rootSelector);
 report.states.push({name,rootSelector,...result});
 if(!result.rows.length)throw new Error(name+' must contain visible text to audit');
 console.log(JSON.stringify({state:name,rows:result.rows.length,failures:result.contrastFailures.length,small:result.undersizedText.length}));
}
async function setup(viewport){const context=await browser.newContext({viewport,hasTouch:viewport.width<=600,isMobile:viewport.width<=600});const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.goto(report.url);await page.waitForSelector('#stage[data-playback-state]');await page.waitForTimeout(100);if(await page.locator('#guide-dialog').evaluate(d=>d.open))await page.locator('#guide-skip').click();return {context,page};}
async function sample(page,id){await page.locator('#scenario-open').click();await page.locator(`input[name=scenario][value="${id}"]`).check();await page.locator('#scenario-apply').click();await page.waitForTimeout(100);}
async function retentionStates(page,prefix){
 await page.locator('.rail-item[data-section=cargo]').click();
 if(!await page.locator('#library').isVisible())await page.locator('#v117-library-toggle').click();
 await page.locator('.sku-card[data-id="SIM-FREE-IR"] [data-action=edit]').click();
 await scan(page,prefix+'-cargo-retention-note','#sku-dialog');
 await page.locator('#sku-form [name=qty]').fill('0');await page.locator('#sku-form button[type=submit]').click();
 await scan(page,prefix+'-cargo-conflict-feedback','#sku-dialog');await page.locator('#sku-dialog-cancel').click();
 if(await page.locator('#library-sheet').evaluate(d=>d.open))await page.locator('#library-return-scene').click();
 await page.locator('#import-btn').click();await page.locator('#import-sheet-file').setInputFiles({name:'invalid-quantity.csv',mimeType:'text/csv',buffer:Buffer.from('SKU,货物名称,长(mm),宽(mm),高(mm),毛重(kg),数量,包装类型\nSIM-FREE-A,数量不足的纸箱,400,400,400,20,2,纸箱')});
 await page.locator('#import-map-pane:not(.hidden)').waitFor();await page.locator('#import-next').click();await page.locator('#import-strategy').selectOption('update');await page.locator('#import-confirm').click();
 await scan(page,prefix+'-import-conflict-feedback','#import-dialog');await page.locator('#import-close').click();
 if(await page.locator('#library-sheet').evaluate(d=>d.open))await page.locator('#library-return-scene').click();
 await page.locator('#global-overflow>summary').click();await page.locator('#clear-cargo-open').click();
 await scan(page,prefix+'-clear-positions','#clear-cargo-dialog');await page.locator('#clear-cargo-form input[value=all]').check();
 await scan(page,prefix+'-clear-all','#clear-cargo-dialog');await page.locator('#clear-cargo-cancel').click();
}
try{
 const desktop=await setup({width:1440,height:900});
 await scan(desktop.page,'desktop-empty');
 await desktop.page.locator('#help-btn').click();await scan(desktop.page,'desktop-tutorial','#guide-dialog');await desktop.page.locator('#guide-progress [data-lesson="5"]').click();await scan(desktop.page,'desktop-tutorial-last','#guide-dialog');await desktop.page.locator('#guide-close').click();
 await desktop.page.locator('#help-btn').click();await desktop.page.locator('#guide-mode-library').click();await scan(desktop.page,'desktop-help-library','#guide-dialog');
 await desktop.page.locator('[data-topic=planning]').click();await scan(desktop.page,'desktop-help-planning','#guide-dialog');
 await desktop.page.locator('#guide-search').fill('抬升');await scan(desktop.page,'desktop-help-search','#guide-dialog');
 await desktop.page.locator('#guide-search').fill('zzzzzz');await scan(desktop.page,'desktop-help-no-results','#guide-dialog');await desktop.page.locator('#guide-close').click();
 await desktop.page.locator('#command-open').click();await desktop.page.locator('#command-search').fill('箱体');await scan(desktop.page,'desktop-command-search','#command-dialog');
 await desktop.page.locator('#command-search').fill('zzzzzz');await scan(desktop.page,'desktop-command-no-results','#command-dialog');await desktop.page.keyboard.press('Escape');
 await desktop.page.locator('#project-title').click();await scan(desktop.page,'desktop-plan-name','#plan-dialog');await desktop.page.locator('#plan-name-cancel').click();
 await desktop.page.locator('#scenario-open').click();await scan(desktop.page,'desktop-scenario-dialog','#scenario-dialog');await desktop.page.locator('[name=scenario][value=dispatch-priority]').check();await desktop.page.locator('#scenario-preview').scrollIntoViewIfNeeded();await scan(desktop.page,'desktop-dispatch-dialog','#scenario-dialog');await desktop.page.locator('#scenario-close').click();
 await sample(desktop.page,'route-comparison');await desktop.page.locator('[data-playback-mode=unload]').click();
 await desktop.page.locator('#planner-settings>summary').click();await scan(desktop.page,'desktop-planner','#planner-panel');
 await desktop.page.locator('#planner-max-lift').fill('-1');await desktop.page.locator('#planner-form button[type=submit]').click();await scan(desktop.page,'desktop-planner-invalid','#planner-panel');
 await desktop.page.locator('#planner-max-lift').fill('0');await desktop.page.locator('#planner-policy').selectOption('low-lift');await desktop.page.locator('#planner-form button[type=submit]').click();await scan(desktop.page,'desktop-planner-compared','#planner-panel');await desktop.page.locator('#planner-close').click();
 await sample(desktop.page,'daily-mixed');await scan(desktop.page,'desktop-loaded');await desktop.page.locator('#sku-list .sku-description').first().click();
 await desktop.page.locator('#context-editor').scrollIntoViewIfNeeded();await scan(desktop.page,'desktop-context','#context-editor');await desktop.page.locator('#context-editor').evaluate(e=>e.scrollTop=e.scrollHeight);await scan(desktop.page,'desktop-context-bottom','#context-editor');
 await desktop.page.locator('#workflow-player').scrollIntoViewIfNeeded();await scan(desktop.page,'desktop-workflow','#workflow-player');
 for(const section of ['free','unload','container','quote']) {
   await desktop.page.locator('.rail-item[data-section="'+section+'"]').click();await scan(desktop.page,'desktop-module-'+section);if(section==='container'){await desktop.page.locator('#container-L').fill('1000');await desktop.page.locator('#dimension-audit').scrollIntoViewIfNeeded();await scan(desktop.page,'desktop-container-conflict','#library-container');await desktop.page.locator('#reset-container').click();
     await desktop.page.locator('#container-W').fill('2000');await desktop.page.locator('#container-doorW').scrollIntoViewIfNeeded();await scan(desktop.page,'desktop-container-door-error','#library-container');await desktop.page.locator('#reset-container').click();
     await desktop.page.locator('#container-preset').selectOption('40HC');await scan(desktop.page,'desktop-container-draft-preview');await desktop.page.locator('#reset-container').click();
     await desktop.page.locator('.container-templates>summary').click();await scan(desktop.page,'desktop-container-templates','#library-container');await desktop.page.locator('.container-templates>summary').click();
   }
   await desktop.page.locator('#library').evaluate(e=>e.scrollTop=e.scrollHeight);await scan(desktop.page,'desktop-module-'+section+'-bottom');
 }
 await desktop.page.locator('.rail-item[data-section="free"]').click();await desktop.page.locator('#free-mode-select').click();
 await desktop.page.locator('#library').evaluate(e=>e.scrollTop=0);await scan(desktop.page,'desktop-free-edit-top');
 await desktop.page.locator('#library').evaluate(e=>e.scrollTop=e.scrollHeight/2);await scan(desktop.page,'desktop-free-edit-middle');
 await desktop.page.locator('.free-advanced-arrangement > summary').click();await desktop.page.locator('.free-docking > summary').click();
 await desktop.page.locator('#library').evaluate(e=>e.scrollTop=e.scrollHeight);await scan(desktop.page,'desktop-free-edit-bottom');
 await sample(desktop.page,'free-placement');await desktop.page.locator('.rail-item[data-section=free]').click();
 await scan(desktop.page,'desktop-free-auto-controls','#free-editbar');
 await desktop.page.locator('#free-drag-options>summary').click();await scan(desktop.page,'desktop-free-move-settings','#free-drag-options');await desktop.page.locator('#free-drag-options>summary').click();
 await desktop.page.locator('#free-draft-mode').click();await scan(desktop.page,'desktop-free-draft-empty','#free-editbar');
 await desktop.page.locator('[data-loaded-id="SIM-FREE-A#4"]').click();await desktop.page.locator('#context-z').fill('300');await desktop.page.locator('#context-apply').click();await desktop.page.locator('#free-draft-apply').click();
 await scan(desktop.page,'desktop-free-draft-invalid','#free-editbar');
 await desktop.page.locator('#context-z').fill('0');await desktop.page.locator('#context-x').fill('2200');await desktop.page.locator('#context-apply').click();await desktop.page.locator('#free-draft-review>summary').click();await scan(desktop.page,'desktop-free-draft-valid','#free-editbar');
 await desktop.page.locator('#free-draft-discard').click();await desktop.page.locator('#free-auto-mode').click();
 await desktop.page.locator('.rail-item[data-section="cargo"]').click();
 await desktop.page.locator('#add-sku').click();await scan(desktop.page,'desktop-cargo-form','#sku-dialog');await desktop.page.locator('#sku-dialog-cancel').click();
 await desktop.page.locator('#import-btn').click();await scan(desktop.page,'desktop-import','#import-dialog');await desktop.page.locator('#import-close').click();
 await retentionStates(desktop.page,'desktop');await desktop.page.locator('#hide-sidebar').click();await scan(desktop.page,'desktop-collapsed-workspace');await desktop.page.locator('#v117-library-toggle').click();
 await desktop.page.locator('#viewport-more > summary').click();await desktop.page.locator('#shortcut-open').click();await scan(desktop.page,'desktop-shortcuts','#shortcuts-dialog');await desktop.page.locator('#shortcuts-close').click();
 if(!await desktop.page.locator('#open-material-shortcut').isVisible())await desktop.page.locator('#viewport-more > summary').click();await desktop.page.locator('#open-material-shortcut').click();await scan(desktop.page,'desktop-materials','#material-dialog');await desktop.page.locator('#material-close').click();
 // The static hook also scans closed legacy overlays. Exercise every live tool group.
 if(!await desktop.page.locator('#display-settings').isVisible())await desktop.page.locator('#viewport-more > summary').click();
 await desktop.page.locator('#display-settings').click();await scan(desktop.page,'desktop-display-tools','#display-pop');await desktop.page.keyboard.press('Escape');
 if(!await desktop.page.locator('#camera-toggle').isVisible())await desktop.page.locator('#viewport-more > summary').click();
 await desktop.page.locator('#camera-toggle').click();await scan(desktop.page,'desktop-camera-tools','#camera-pad');await desktop.page.locator('#camera-close').click();
 await desktop.page.locator('#viewport-appearance-panel > summary').click();await scan(desktop.page,'desktop-appearance-tools','#viewport-appearance-panel');
 for(const preset of ['material','technical','locator','xray']) {
   if(!await desktop.page.locator('[data-scene-preset="'+preset+'"]').isVisible())await desktop.page.locator('#viewport-appearance-panel > summary').click();
   await desktop.page.locator('[data-scene-preset="'+preset+'"]').click();await scan(desktop.page,'desktop-preset-'+preset);
 }
 await desktop.page.locator('.rail-item[data-section="unload"]').click();await scan(desktop.page,'desktop-unload-selected');
 await desktop.page.locator('#container-appearance>summary').click();await scan(desktop.page,'desktop-container-appearance','#container-appearance');await desktop.page.locator('#container-appearance-close').click();
 await desktop.page.locator('#editor-fullscreen').click();await scan(desktop.page,'desktop-fullscreen-unload');
 await desktop.page.locator('#fullscreen-inspector').click();await scan(desktop.page,'desktop-fullscreen-inspector','#context-editor');
 await desktop.page.locator('#fullscreen-playback').click();await scan(desktop.page,'desktop-fullscreen-playback','#workflow-player');
 await desktop.page.locator('#planner-settings>summary').click();await scan(desktop.page,'desktop-fullscreen-planner','#planner-panel');await desktop.page.locator('#planner-close').click();
 await desktop.page.locator('#fullscreen-tools-toggle').click();await scan(desktop.page,'desktop-fullscreen-picture');await desktop.page.locator('#fullscreen-tools-toggle').click();
 await desktop.page.locator('#fullscreen-exit').click();
 await desktop.context.close();await browser.close();browser=await launch();
 const mobile=await setup({width:390,height:844});
 await scan(mobile.page,'mobile-empty');await mobile.page.locator('#touch-move-toggle').tap();await scan(mobile.page,'mobile-touch-move');await mobile.page.locator('#touch-move-toggle').tap();
 await mobile.page.locator('#help-btn').click();await scan(mobile.page,'mobile-help-quick','#guide-dialog');await mobile.page.locator('#guide-mode-library').click();await scan(mobile.page,'mobile-help-library','#guide-dialog');await mobile.page.locator('[data-topic=planning]').click();await scan(mobile.page,'mobile-help-planning','#guide-dialog');await mobile.page.locator('#guide-close').click();
 await mobile.page.locator('#scenario-open').click();await scan(mobile.page,'mobile-scenario-dialog','#scenario-dialog');await mobile.page.locator('[name=scenario][value=dispatch-priority]').check();await mobile.page.locator('#scenario-preview').scrollIntoViewIfNeeded();await scan(mobile.page,'mobile-dispatch-dialog','#scenario-dialog');await mobile.page.locator('#scenario-close').click();
 await sample(mobile.page,'irregular-equipment');await mobile.page.locator('#v117-library-toggle').click();await mobile.page.locator('#sku-list .sku-description').first().click();await mobile.page.locator('#context-editor').scrollIntoViewIfNeeded();await scan(mobile.page,'mobile-context','#context-editor');
 await mobile.page.locator('#v117-library-toggle').click();await scan(mobile.page,'mobile-library-sheet','#library-sheet');
 await mobile.page.locator('#library').evaluate(e=>e.scrollTop=e.scrollHeight);await scan(mobile.page,'mobile-library-sheet-bottom','#library-sheet');
 await mobile.page.locator('#hide-sidebar').click();
 await mobile.page.locator('#container-appearance>summary').click();await scan(mobile.page,'mobile-container-appearance','#container-appearance');await mobile.page.locator('#container-appearance-close').click();
 await mobile.page.locator('#editor-fullscreen').click();await scan(mobile.page,'mobile-fullscreen-picture');
 await mobile.page.locator('#fullscreen-inspector').click();await scan(mobile.page,'mobile-fullscreen-inspector','#context-editor');
 await mobile.page.locator('#fullscreen-playback').click();await scan(mobile.page,'mobile-fullscreen-playback','#workflow-player');
 await mobile.page.locator('#planner-settings>summary').click();await scan(mobile.page,'mobile-fullscreen-planner','#planner-panel');await mobile.page.locator('#planner-close').click();
 await mobile.page.locator('#fullscreen-exit').click();await sample(mobile.page,'free-placement');await mobile.page.locator('.rail-item[data-section=free]').click();
 if(await mobile.page.locator('#library-sheet').evaluate(d=>d.open))await mobile.page.locator('#library-return-scene').click();
 await mobile.page.locator('#free-editbar').scrollIntoViewIfNeeded();await scan(mobile.page,'mobile-free-auto-controls','#free-editbar');
 await mobile.page.locator('#free-drag-options>summary').click();await scan(mobile.page,'mobile-free-move-settings','#free-drag-options');await mobile.page.locator('#free-drag-options>summary').click();
 await mobile.page.locator('#free-draft-mode').click();await scan(mobile.page,'mobile-free-draft-controls','#free-editbar');
 await mobile.page.locator('#v117-library-toggle').click();await mobile.page.locator('[data-loaded-id="SIM-FREE-A#4"]').click();if(await mobile.page.locator('#library-sheet').evaluate(d=>d.open))await mobile.page.locator('#library-return-scene').click();
 await mobile.page.locator('#context-z').fill('300');await mobile.page.locator('#context-apply').click();await mobile.page.locator('#free-draft-apply').click();await scan(mobile.page,'mobile-free-draft-invalid','#free-editbar');
 await retentionStates(mobile.page,'mobile');
 await mobile.context.close();await browser.close();browser=await launch();
 const short=await setup({width:876,height:500});await sample(short.page,'route-comparison');await short.page.locator('#planner-settings>summary').click();await scan(short.page,'short-screen-planner','#planner-panel');await short.context.close();
 const entry=await browser.newContext({viewport:{width:876,height:672}}),entryPage=await entry.newPage();await entryPage.goto(pathToFileURL(root+'/index.html').href);await entryPage.waitForSelector('body[data-app-state=error]');await scan(entryPage,'direct-file-startup-guidance','#startup-status');await entry.close();
 // Release-only states: mixed physical revisions and a damaged draft recovery.
 const mixed=await setup({width:1440,height:900});
 await mixed.page.locator('#import-file').setInputFiles(root+'/examples/v127-beta-mixed-specs.json');
 await mixed.page.waitForFunction(()=>JSON.parse(localStorage.getItem('realload-v117')).placements.length===18);
 await scan(mixed.page,'beta-mixed-specification-cargo');await mixed.context.close();
 for(const width of [1440,390]){
  const recovery=await browser.newContext({viewport:{width,height:844}});
  await recovery.addInitScript(()=>{localStorage.setItem('realload-v117','{"project":"损坏测试货单",');localStorage.setItem('realload-onboarding-v119',JSON.stringify({seen:true}));});
  const p=await recovery.newPage();p.on('pageerror',e=>report.errors.push(e.message));await p.goto(report.url);await p.waitForSelector('#recovery-dialog[open]');
  await scan(p,'beta-recovery-'+width,'#recovery-dialog');await recovery.close();
 }
}catch(error){report.runError=error.stack;console.error(error.message);}
finally{await browser.close();fs.writeFileSync(process.env.READABILITY_OUTPUT||root+'/artifacts/v121/visible-text-audit.json',JSON.stringify(report,null,2)+'\n');}

const failures=report.states.reduce((n,s)=>n+s.contrastFailures.length+s.undersizedText.length,0);
console.log(JSON.stringify({states:report.states.length,failures,errors:report.errors,runError:report.runError}));
if(report.runError||report.errors.length||failures)process.exitCode=1;

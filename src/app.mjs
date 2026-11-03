import {setupContainerEditor,reflowContainer} from './container-editing.mjs';
import {setupSceneWorkspace} from './scene-workspace.mjs';
import {setupOnboarding} from './onboarding.mjs';
import {setupStudio} from './studio.mjs';
import {planningSettings} from './planning-settings.mjs';
import {setupExperience} from './experience.mjs';
import {autoPackThroughDoor} from './door-packing.mjs';
import {setupWorkbench} from './workbench.mjs';
import {auditContainerSpec,dimensionAudit} from './dimension-audit.mjs';
import {unloadingState,unloadOne,suggestUnloadOrder,suggestLoadOrder,geometricWeightCentre} from './unloading.mjs';
import {rankUnloadChoices,unloadChoiceExplanation,filterUnloadChoices} from './unload-workflow.mjs';
import {priorityLabel,priorityOrder,priorityIssues,normalizePriority,normalizeDeliveryStop,deliveryLabel} from './priority.mjs';
import {suggestSupportedDrop} from './smart-drop.mjs';
import {settleDrag} from './drag-assist.mjs';
import {draftPlacements,placementPatches,previewFreeMove,supportedSelection,checkDraft} from './free-editing.mjs';
import {setupFreeEditingUI} from './free-editing-ui.mjs';
import {groupNames,loadedGroupIds,assignSkuGroup,renameGroup} from './group-actions.mjs';
import {attachV11Controls,updateV11Controls,applySceneMode} from './v11.mjs';
import {setupMaterialDialog} from './material-library.mjs';
import {cargoZone as locationOf} from './location.mjs';
import {CARGO_TYPES,dropCandidate,verifyDrop,moveSelection,rotateSelection,sameGroupIds,alignSelection,distributeSelection,dockSelection} from './free-studio.mjs';
import {CONTAINERS,DEMO_SKUS,autoPack,validate,modifyPlacement,orientations,positiveInput,volume} from './engine.mjs';
import {Viewport} from './webgl.mjs';
import {boundedGroupDelta} from './placement-assist.mjs';
import {quoteEstimate} from './quote.mjs';
import {setupImportWizard} from './import-ui.mjs';
import {updateCargo,mergeCargo} from './cargo-update.mjs';
import {unitOrdinal,withUnitOrdinals} from './unit-identity.mjs';
import {readWorkspace,RECOVERY_KEY} from './workspace-storage.mjs';
import {validCargoRecord} from './cargo-record.mjs';
import {cargoSpecOf,snapshotPlacement,differsFromTemplate,packingInventory} from './cargo-spec.mjs';
import {groupSummary,groupKey,unitNumber,decoratePlacements,makeNumbering} from './manifest.mjs';
const $=id=>document.getElementById(id),html=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;'),fmt=n=>Number(n).toLocaleString('zh-CN',{maximumFractionDigits:s?.precision??2,minimumFractionDigits:s?.precision??2});
const STORAGE='realload-v117',viewTypes=Object.fromEntries(Object.entries(CARGO_TYPES).map(([k,v])=>[k,v.label]));
const colorOf=Object.fromEntries(Object.keys(CARGO_TYPES).map(k=>[k,k]));
const clone=v=>JSON.parse(JSON.stringify(v));
function demo(){const skus=clone(DEMO_SKUS);skus.push({id:'SKU-004',name:'实木板材（测试尺寸）',kind:'board',L:1200,W:300,H:45,weight:11,qty:6,rotate:true,allowTilt:false,stackLimit:6});const box=clone(CONTAINERS['20GP']);return {project:'未命名装柜方案',precision:2,box,skus,placements:[],selected:null,selectedSku:skus[0].id,mode:'iso',section:'cargo',collapsed:false,groupFilter:'all',closedGroups:[],editAxis:'free',opts:{pbr:true,axes:true,coords:true,tags:true,grid:true,walls:true,dimensions:false,coordsScope:'selected',wallOpacity:.08},snap:25,step:null,quote:{currency:'USD',base:0,origin:0,destination:0,perCbm:0,perKg:0},locateQuery:'',locatorCollapsed:true,freeSmartStack:false,freeMoveMode:'auto',freeDraft:{},freeDragSnap:0,freeMagnet:false,freeLinkStack:true,pointerTool:'select',touchMove:false,unloadRemoved:[],unloadQuery:'',unloadFlow:'unload',unloadDoorMode:'smart',unloadClearance:0,routePolicy:'balanced',maxLift:null,unloadViewFilter:'all'}}
let workspaceRecovery=null;
function restore(){try{const result=readWorkspace(localStorage,demo());workspaceRecovery=result.recovery;return result.state;}catch{return demo();}}
let s=restore(),views=[],undoStack=[],redoStack=[],preview=null,previewError=null,playing=null,toastTimer=null;let workbench=null,experience=null,sceneWorkspace=null,containerEditor=null,freeEditorUI=null,studio=null;const cameraMemory=new Map();
s.placements=decoratePlacements(withUnitOrdinals(s.placements),s.skus).map(p=>snapshotPlacement(p,s.skus.find(a=>a.id===p.skuId)));
s.project=String(s.project||'未命名装柜方案').trim().slice(0,100)||'未命名装柜方案';
// The first 1.1 session starts with an unobtrusive x-ray view. This changes no cargo, dimensions or positions.
if(!s.scenePreset||s.sceneEnvelopeVersion!==3){s.scenePreset='material';s.sceneEnvelopeVersion=3;Object.assign(s.opts,{walls:true,wallOpacity:.35,containerView:'complete',doorAngle:112,grid:false,pbr:true,axes:false,coords:false,dimensions:false,tags:true});}
s.freeSelection=Array.isArray(s.freeSelection)?s.freeSelection.filter(id=>s.placements.some(p=>p.id===id)):[];s.freeStep=Number(s.freeStep)>0?Number(s.freeStep):25;s.freeTab=s.freeTab==='edit'?'edit':'place';s.loadedQuery=String(s.loadedQuery||'');s.loadedGroup=String(s.loadedGroup||'all');try{if(!localStorage.getItem(STORAGE))s.locatorCollapsed=true}catch{}s.locateQuery=String(s.locateQuery||'');s.locatorCollapsed=!!s.locatorCollapsed;s.unloadRemoved=Array.isArray(s.unloadRemoved)?s.unloadRemoved.filter(id=>s.placements.some(p=>p.id===id)):[];s.unloadQuery=String(s.unloadQuery||'');s.freeSmartStack=!!s.freeSmartStack;s.unloadFlow=s.unloadFlow==='load'?'load':'unload';s.unloadDoorMode=['smart','strict','nominal'].includes(s.unloadDoorMode)?s.unloadDoorMode:'smart';if(s.pathPlannerVersion!==2){s.unloadDoorMode='smart';s.pathPlannerVersion=2;}s.unloadClearance=[0,10,25,50,100].includes(Number(s.unloadClearance))?Number(s.unloadClearance):0;s.unloadViewFilter=['all','ready','blocked','urgent'].includes(s.unloadViewFilter)?s.unloadViewFilter:'all';s.routePolicy=['balanced','low-lift','distance'].includes(s.routePolicy)?s.routePolicy:'balanced';s.maxLift=s.maxLift===null||s.maxLift===undefined||s.maxLift===''?null:Number.isFinite(Number(s.maxLift))&&Number(s.maxLift)>=0?Number(s.maxLift):null;s.pointerTool=s.pointerTool==='orbit'?'orbit':'select';s.touchMove=!!s.touchMove;let spaceOrbitHeld=false;
s.freeMoveMode=s.freeMoveMode==='draft'?'draft':'auto';s.freeDraft=placementPatches(s.placements,draftPlacements(s.placements,s.freeDraft));s.freeDragSnap=[0,1,10,25,50].includes(Number(s.freeDragSnap))?Number(s.freeDragSnap):0;s.freeMagnet=!!s.freeMagnet;s.freeLinkStack=s.freeLinkStack!==false;
function editPlacements(){return s.section==='free'?draftPlacements(s.placements,s.freeDraft):s.placements;}
function editState(){return new Proxy(s,{get:(target,key)=>key==='placements'?editPlacements():Reflect.get(target,key)});}
function isFreeDraft(){return s.section==='free'&&s.freeMoveMode==='draft';}
function draftOptions(){return {draft:isFreeDraft()};}
function hasFreeDraft(){return Object.keys(s.freeDraft||{}).length>0;}
function enterFree({tab=null,collapsed=false}={}){stopPlay();s.unloadRemoved=[];s.section='free';s.pointerTool='select';s.editAxis='free';s.step=null;s.collapsed=collapsed;if(s.mode==='multi')s.mode='iso';s.freeTab=tab||(s.placements.length?'edit':'place');if(hasFreeDraft())s.freeMoveMode='draft';}
function saveFreePlacements(placements){if(isFreeDraft())s.freeDraft=placementPatches(s.placements,placements);else s.placements=checkDraft(s.placements,placementPatches(s.placements,placements),s.box,s.skus).placements;s.step=null;}
function blockPendingFreeDraft(){if(!hasFreeDraft())return false;tell('请先校验并应用自由草稿，或恢复原方案，再增减、锁定或自动重排货物。');return true;}
function applyFreeDraft(){const r=checkDraft(s.placements,s.freeDraft,s.box,s.skus);if(!r.ok){freeEditorUI?.showIssues();tell('草稿尚未应用：'+r.issues[0]?.text);return;}if(!r.changed)return;snapshot();s.placements=r.placements;s.freeDraft={};paint(false);tell(`已应用 ${r.changed} 件货物的位置，基础几何检查通过。`);}
function tell(text){const node=$('message');node.textContent=text;experience?.feedback(text);node.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.classList.remove('visible'),2900)}
function save(){if(workspaceRecovery){$('save-status').textContent='旧数据已保护，等待恢复选择';return;}try{localStorage.setItem(STORAGE,JSON.stringify(s));$('save-status').textContent=hasFreeDraft()?'自由草稿单独保存在本机':'保存在本机'}catch{$('save-status').textContent='浏览器未保存'}}
function snapshot(){stopPlay();undoStack.push(clone(s));if(undoStack.length>50)undoStack.shift();redoStack.length=0;}
function undo(){views.forEach(v=>v.cancelGesture());if(!undoStack.length){tell('暂无可撤销操作');return;}stopPlay();redoStack.push(clone(s));s=undoStack.pop();preview=null;paint();tell('已撤销上一步')}
function redo(){views.forEach(v=>v.cancelGesture());if(!redoStack.length){tell('暂无可重做操作');return;}stopPlay();undoStack.push(clone(s));s=redoStack.pop();preview=null;paint();tell('已恢复上一步')}
function loadCargoScenario(scenario){snapshot();const preferences={...s.opts};s={...demo(),freeSelection:[],freeStep:25,freeTab:'place',loadedQuery:'',loadedGroup:'all',project:scenario.title,box:scenario.container,skus:scenario.skus,placements:decoratePlacements(scenario.placements,scenario.skus).map(p=>snapshotPlacement(p,scenario.skus.find(a=>a.id===p.skuId))),selected:null,selectedSku:scenario.skus[0]?.id||null,section:'cargo',collapsed:window.matchMedia('(max-width:1040px)').matches,scenarioTitle:scenario.title,scenarioDescription:scenario.description,scenarioId:scenario.id,opts:preferences};applySceneMode(s,'material');cameraMemory.clear();$('project-title').firstChild.textContent=s.project+' ';paint(true);tell(`已载入「${scenario.title}」${scenario.placements.length} 件模拟货物。可撤销恢复原方案。`);}
let guideStep=0;const GUIDE_FIRST_LAUNCH=(()=>{try{return !localStorage.getItem('realload-v116-guide-seen')&&!localStorage.getItem(STORAGE)}catch{return true}})();const GUIDE_KEY='realload-v116-guide-seen';
const guideSlides=[
  {title:'先认识你的货物',sub:'你不需要先学会三维建模。可以直接使用左侧演示货物，或者导入自己的 CSV / Excel 装箱单。',tips:['尺寸全部采用外包装尺寸，单位 mm。','重量采用每件毛重，单位 kg。','准备好了再拖一件进入货柜。'],action:'cargo',button:'查看货物清单'},
  {title:'想怎么放，就怎么调整',sub:'自由摆放可直接拖动柜内货物。自动落位会落地或叠放，自由草稿可先悬空或重叠，最后统一校验。',tips:['滚轮上下浏览页面；⌥/Ctrl + 滚轮缩放，拖动空白区调整视角。','Shift 多选或框选，右侧可找到准确坐标。','靠柜头 / 贴左壁支持精确贴边。'],action:'free',button:'进入自由摆放'},
  {title:'按编号找到每一件货',sub:'装好以后，输入外箱号、SKU、订单号就能定位，并导出逐件坐标和编号清单，便于给仓库或客户核对。',tips:['自动生成的 PLAN 编号不是实际贴标。','显示材质只是外观，承压和绑扎需现场复核。','可随时从左下角「说明」重看。'],action:'locate',button:'试试编号定位'}
];
function goGuideAction(key){
 if(key==='cargo'){s.section='cargo';s.collapsed=false;paint();$('sku-search')?.focus();}
 else if(key==='free'){enterFree();s.mode='iso';paint();}
 else if(key==='locate'){s.locatorCollapsed=false;applySceneMode(s,'locator');paint();$('locator-search')?.focus();}
 else if(['container','unload','quote'].includes(key))document.querySelector(`.rail-item[data-section="${key}"]`).click();
 else if(key==='groups'){goGuideAction('cargo');document.querySelector('.cargo-management').open=true;}
 else if(key==='project')$('project-title').click();
 else if(key==='sample')$('scenario-open').click();
 else if(key==='import')$('import-btn').click();
 else if(key==='export'){$('global-overflow').open=true;$('export-btn').click();}
 else if(key==='materials')$('open-material-shortcut').click();
 else if(key==='validation')$('show-issues').click();
 else if(key==='shortcuts')$('shortcut-open').click();
 else if(key==='appearance'){const d=$('container-appearance');if(!d.open)d.querySelector('summary').click();}
 else if(key==='planning'){const d=$('planner-settings');d.open=true;if(document.body.classList.contains('v112-fullscreen')&&!$('stage').classList.contains('fs-playback-open'))$('fullscreen-playback').click();}
 else if(key==='precision'){if(!s.selected)tell('先在场景或货物清单中选一件，再使用右侧坐标与移动工具。');else experience?.showContext();}
 else if(key==='touch')$('touch-move-toggle').focus({preventScroll:true});
 else if(key==='playback'&&document.body.classList.contains('v112-fullscreen')&&!$('stage').classList.contains('fs-playback-open'))$('fullscreen-playback').click();
}
function renderGuide(){const d=guideSlides[guideStep];$('guide-eyebrow').textContent=`快速开始 · 0${guideStep+1}/03`;$('guide-heading').textContent=d.title;$('guide-description').textContent=d.sub;$('guide-tips').innerHTML=d.tips.map((tip,i)=>`<div><b>0${i+1}</b><span>${html(tip)}</span></div>`).join('');for(const dot of document.querySelectorAll('[data-guide-dot]'))dot.classList.toggle('active',Number(dot.dataset.guideDot)===guideStep);$('guide-back').disabled=guideStep===0;$('guide-next').textContent=guideStep===2?'完成':'继续';$('guide-do').textContent=d.button;}
function openGuide(step=0){guideStep=Math.max(0,Math.min(2,step));renderGuide();if(!$('guide-dialog').open)$('guide-dialog').showModal();}
function closeGuide(){if($('guide-dialog').open)$('guide-dialog').close();try{localStorage.setItem(GUIDE_KEY,'1')}catch{}}
function initializeGuide(){const d=$('guide-dialog');const empty=$('empty-stage');const stage=$('stage');if(empty&&stage&&empty.parentElement===stage){stage.before(empty);} $('global-overflow')?.addEventListener('click',e=>{if(e.target.closest('button'))$('global-overflow').open=false});$('guide-trigger').onclick=()=>openGuide();$('help-btn').onclick=()=>openGuide();$('guide-close').onclick=closeGuide;$('guide-skip').onclick=closeGuide;$('guide-back').onclick=()=>{guideStep=Math.max(0,guideStep-1);renderGuide()};$('guide-next').onclick=()=>{if(guideStep>=2)closeGuide();else{guideStep++;renderGuide()}};$('guide-do').onclick=()=>{const action=guideSlides[guideStep].action;closeGuide();goGuideAction(action)};d.addEventListener('click',e=>{if(e.target===d)closeGuide()});document.querySelectorAll('[data-guide-action]').forEach(btn=>btn.addEventListener('click',()=>goGuideAction(btn.dataset.guideAction)));
 $('empty-place').onclick=()=>{enterFree({tab:'place'});s.mode='iso';const before=s.placements.length;addOne();if(s.placements.length>before){const added=s.placements.find(p=>p.id===s.selected);if(added){for(const v of views)v.resetCamera?.();}tell('第 1 件已放入。你现在可以直接拖动它，或者通过右键调整。')}else tell('当前示例货物无法放入，请检查箱体或选择其他 SKU。')};$('empty-demo').onclick=()=>auto();$('selection-to-edit').onclick=()=>{s.section='edit';s.collapsed=false;paint()};$('selection-locate').onclick=()=>goGuideAction('locate');$('selection-rotate').onclick=()=>turn();
 try{if(GUIDE_FIRST_LAUNCH){$('quickstart-strip')?.classList.add('v116-first-start');}}catch{}
}
function report(){const r=validate(editPlacements(),s.box,s.skus);return {...r,materialWarnings:[...new Set(s.placements.map(p=>CARGO_TYPES[p.kind]?.note).filter(Boolean))]}}
function onselect(id,meta={}){
 if(s.section==='free'){
  if(meta.multi){const ids=new Set(s.freeSelection);ids.has(id)?ids.delete(id):ids.add(id);s.freeSelection=[...ids];s.selected=s.freeSelection.at(-1)||null;}
  else{s.selected=id;if(!(s.freeSelection.length>1&&s.freeSelection.includes(id)))s.freeSelection=id?[id]:[];}
  const p=s.placements.find(v=>v.id===s.selected);if(p)s.selectedSku=p.skuId;
  s.collapsed=window.matchMedia('(max-width:1040px)').matches;paint(false);return;
 }
 s.selected=id;const p=s.placements.find(v=>v.id===id);if(p)s.selectedSku=p.skuId;
 if(id){if(s.section!=='unload')s.collapsed=document.body.classList.contains('v112-fullscreen')||window.matchMedia('(max-width:1040px)').matches;$('inspector').classList.add('hidden')}paint(false)
}
function makeViews(){views.forEach(v=>{cameraMemory.set(v.mode,{zoom:v.zoom,yaw:v.yaw,pitch:v.pitch,focusTarget:v.focusTarget,focusDimensions:v.focusDimensions});v.dispose()});views=[];const root=$('stage-canvases');root.replaceChildren();const multi=s.mode==='multi';root.classList.toggle('four',multi);const types=multi?['iso','top','door','side']:[s.mode];for(const mode of types){const cell=document.createElement('div');cell.className='view-cell';root.append(cell);const v=new Viewport(cell,mode,{select:onselect,hover:()=>{},draw:drawViews,snap:()=>s.section==='free'?(s.freeDragSnap||.01):s.snap,dragSettings:()=>({draft:isFreeDraft(),magnet:s.section!=='free'||s.freeMagnet}),preview:previewMove,commitPreview:commitPreview,cancelPreview:cancelMovePreview,onDragStart:beginCargoGesture,onDragEnd:endCargoGesture,touchEditing:()=>s.touchMove&&s.pointerTool==='select',canEdit:()=>!workbench?.active&&s.section!=='unload'&&!containerEditor?.previewBox(),editBlocked:message=>tell(containerEditor?.previewBox()?'请先保存箱体草稿或恢复输入，再移动货物。':message),dragAxis:()=>s.editAxis,isFree:()=>s.section==='free',isUnloading:()=>s.section==='unload',isOrbiting:()=>spaceOrbitHeld||s.pointerTool==='orbit'||s.section==='unload',contextMenu:(id,clientX,clientY)=>openCargoContext(id,clientX,clientY),selectMany:(ids,{append}={})=>{if(s.section!=='free')return;const selected=new Set(append?s.freeSelection:[]);for(const id of ids)selected.add(id);s.freeSelection=[...selected];s.selected=s.freeSelection.at(-1)||null;const p=s.placements.find(p=>p.id===s.selected);if(p)s.selectedSku=p.skuId;paint(false);}});if(cameraMemory.has(mode))Object.assign(v,cameraMemory.get(mode));views.push(v)}const backend=views.some(v=>v.gl&&!v.fallback);$('renderer-status').textContent=backend?'WebGL2 实时渲染':'Canvas 降级模式';drawViews()}
function itemsNow(){const frames=workbench?.frameItems();if(frames)return decoratePlacements(frames,s.skus);const n=s.step===null?s.placements.length:s.step;return decoratePlacements(editPlacements().slice(0,n).filter(p=>s.section!=='unload'||!s.unloadRemoved.includes(p.id)).map(p=>preview?.patches?.[p.id]?{...p,...preview.patches[p.id]}:p.id===preview?.id?{...p,...preview.patch}:p),s.skus)}
let unloadDrawCache=null;
function drawViews(){
 const cacheKey=s.unloadRemoved.join(',')+'|'+s.unloadDoorMode+'|'+s.unloadClearance+'|'+s.routePolicy+'|'+s.maxLift;
 if(s.section==='unload'&&(!unloadDrawCache||unloadDrawCache.placements!==s.placements||unloadDrawCache.box!==s.box||unloadDrawCache.key!==cacheKey))unloadDrawCache={placements:s.placements,box:s.box,key:cacheKey,value:unloadingState(s.placements,s.box,s.unloadRemoved,unloadingOptions())};
 const visual=s.section==='unload'?unloadDrawCache.value:null;
 const selectedChoice=visual?.choices.find(c=>c.id===s.selected);
 const draftBox=containerEditor?.previewBox(),displayBox=draftBox||s.box;
 const state={box:displayBox,items:itemsNow(),selected:workbench?.motionId||s.selected,selectedIds:s.section==='free'?(preview?.patches?Object.keys(preview.patches):s.freeSelection):[],opts:{...s.opts,invalidIds:preview?.valid===false?Object.keys(preview.patches||{}):isFreeDraft()?checkDraft(s.placements,s.freeDraft,s.box,s.skus).issues.map(i=>i.id):[],editHandles:s.section==='free'&&!workbench?.active,motionId:workbench?.motionId,motionRoute:workbench?.motionRoute,previewRoute:selectedChoice?.route,playback:!!workbench?.active,doorAngle:workbench?.active||s.section==='unload'?112:s.opts.doorAngle,playbackClearanceMm:s.placements.reduce((n,p)=>Math.max(n,p.L),0)+200,precision:s.precision,multi:s.mode==='multi',locatorFocus:s.scenePreset==='locator',focusId:s.selected,unloadMode:!!visual,unloadReadyIds:visual?.available.map(c=>c.id)||[],unloadOrder:s.unloadOrderRender||[],unloadBlockerIds:selectedChoice?.blockers.filter(b=>b.id!=='door'&&b.id!=='error').map(b=>b.id)||[]}};
 views.forEach(v=>v.draw(state));
 const fallback=views.some(v=>v.fallback);$('stage').dataset.renderer=fallback?'fallback':'webgl';$('renderer-status').textContent=fallback?'Canvas 后备视图 · 当前为二维显示':'WebGL2 实时渲染';
 let badge=$('container-draft-badge');if(!badge){badge=document.createElement('div');badge.id='container-draft-badge';badge.className='container-draft-badge';badge.setAttribute('role','status');$('stage').append(badge);}
 badge.hidden=!draftBox;badge.textContent='箱体草稿预览 · 尚未保存';
 if($('container-reference-name')){
  const number=n=>Number(n).toLocaleString('zh-CN',{maximumFractionDigits:2});
  $('container-reference-name').textContent=(displayBox.id==='CUSTOM'?'自定义箱体':displayBox.id)+(draftBox?' · 草稿':'');
  $('container-reference-size').textContent=`内尺寸 ${number(displayBox.L)} × ${number(displayBox.W)} × ${number(displayBox.H)} mm`;
  $('container-reference-door').textContent=`柜门 ${number(displayBox.doorW)} × ${number(displayBox.doorH)} mm`;
 }
 experience?.syncPlayback(!!workbench?.active)}

function beginCargoGesture(){const editor=$('context-editor');if(editor?.classList.contains('hidden'))document.body.classList.add('defer-cargo-editor');}
function endCargoGesture(){if(document.body.classList.contains('defer-cargo-editor')){document.body.classList.remove('defer-cargo-editor');requestAnimationFrame(drawViews);}}
function cancelMovePreview(){preview=null;previewError=null;$('move-feedback')?.classList.add('hidden');drawViews();}
function openContainerSettings(){if(workbench?.active)$('workflow-exit').click();stopPlay();s.section='container';s.collapsed=false;paint(false);requestAnimationFrame(()=>{const input=$('container-L');input?.focus({preventScroll:true});});}
function previewMove(id,patch,gesture={}){
 const items=editPlacements(),origin=items.find(p=>p.id===id);if(!origin)return;
 let ids=s.section==='free'&&s.freeSelection.length>1&&s.freeSelection.includes(id)?s.freeSelection:[id];
 if(s.section==='free'&&!isFreeDraft()&&s.freeLinkStack)ids=supportedSelection(items,ids,s.skus);
 const target={x:patch.x??origin.x,y:patch.y??origin.y,z:patch.z??origin.z};
 if(s.section==='free'&&!isFreeDraft()){const delta=boundedGroupDelta(items,ids,{x:target.x-origin.x,y:target.y-origin.y,z:target.z-origin.z},s.box);for(const axis of ['x','y','z'])target[axis]=origin[axis]+delta[axis];}
 const autoDrop=gesture.axis!=='z'&&(gesture.axis==='x'||gesture.axis==='y'||!['door','side'].includes(gesture.mode));
 const result=s.section==='free'?previewFreeMove(items,id,target,s.box,s.skus,ids,{draft:isFreeDraft(),autoDrop}):settleDrag(items,id,target,s.box,s.skus,ids);
 previewError=result.reason||null;
 preview=result.placements?{id,valid:result.valid??result.ok,ok:result.ok,patches:Object.fromEntries(result.placements.filter(p=>ids.includes(p.id)).map(p=>[p.id,{x:p.x,y:p.y,z:p.z}]))}:null;
 const hint=$('move-feedback');if(hint){hint.classList.remove('hidden');hint.classList.toggle('free-invalid',!result.valid&&s.section==='free');hint.textContent=previewError?(isFreeDraft()?'草稿 · ':'松开将恢复 · ')+previewError:`${ids.length>1?`联动 ${ids.length} 件 · `:''}X ${fmt(result.position?.x??target.x)} / Y ${fmt(result.position?.y??target.y)} / Z ${fmt(result.position?.z??target.z)} mm${isFreeDraft()?' · 草稿未应用':''}`;}
 drawViews();
}
function commitPreview(id){
 $('move-feedback')?.classList.add('hidden');
 if(!preview||preview.id!==id){if(previewError)tell(previewError);preview=null;previewError=null;drawViews();return;}
 const items=editPlacements(),pending=preview,error=previewError;preview=null;previewError=null;
 if(!pending.ok){drawViews();tell(error||'此处无法落位，已恢复原位置。可使用自由草稿继续调整。');return;}
 const next=items.map(p=>pending.patches[p.id]?{...p,...pending.patches[p.id]}:p);
 if(next.every((p,i)=>['x','y','z'].every(axis=>Math.abs(p[axis]-items[i][axis])<1e-5))){drawViews();return;}
 const check=validate(next,s.box,s.skus);
 if(check.valid||isFreeDraft()){snapshot();saveFreePlacements(next);paint(false);}
 else{drawViews();tell(check.issues[0]?.text||'位置不满足现有几何约束');}
}
function blockDraftCargoEdit(){if(!containerEditor?.previewBox())return false;tell('请先保存箱体草稿或恢复输入，再调整货物。');return true;}
function changePlacement(id,patch){if(blockDraftCargoEdit())return {ok:false,reason:'箱体草稿尚未保存'};if(isFreeDraft()){const old=editPlacements().find(p=>p.id===id);if(!old)return {ok:false,reason:'没有选中箱件'};if(!Object.values(patch).every(Number.isFinite))return {ok:false,reason:'坐标必须是有限数值'};if(old.locked)return {ok:false,reason:'此货物已锁定，请先解锁'};const result=modifyPlacement(editPlacements(),id,patch,s.box,s.skus),invalid=result.issues.find(i=>['schema','spec','dimension','heading','weight','kind','sku','quantity'].includes(i.kind));if(invalid)return {ok:false,reason:invalid.text};return runFree({...result,ok:true,valid:result.ok,draft:true});}const old=s.placements.find(p=>p.id===id);if(!old)return {ok:false,reason:'没有选中箱件'};if(old.locked){tell('此货物已锁定，请先解锁');return {ok:false,reason:'此货物已锁定，请先解锁'};}const result=modifyPlacement(s.placements,id,patch,s.box,s.skus);if(!result.ok){tell(result.issues?.[0]?.text||'调整失败：不满足约束');return result;}snapshot();s.placements=result.placements;s.step=null;paint();return {ok:true};}
function renderLibrary(){document.querySelectorAll('.rail-item[data-section]').forEach(el=>el.classList.toggle('active',el.dataset.section===s.section));for(const sec of ['cargo','free','unload','edit','container','quote'])$('library-'+sec).classList.toggle('hidden',sec!==s.section);$('library-kicker').textContent={cargo:'货物资料',free:'自由摆放',unload:'装卸流程',edit:'装载操作',container:'箱体设置',quote:'运输试算'}[s.section];$('library').classList.toggle('collapsed',s.collapsed); const mobileToggle=$('v117-library-toggle');if(mobileToggle){mobileToggle.textContent=s.collapsed?'查看'+$('library-kicker').textContent:'收起'+$('library-kicker').textContent;mobileToggle.setAttribute('aria-expanded',String(!s.collapsed));}
 $('sku-total').textContent=`${s.skus.length} 条货物记录`;
 const counts=Object.create(null);for(const p of s.placements)counts[p.skuId]=(counts[p.skuId]||0)+1;
 const groupRows=groupSummary(s.skus,s.placements);const active=s.groupFilter||'all';
 $('group-filter').innerHTML='<option value="all">全部组别 · '+groupRows.length+' 组</option>'+groupRows.map(g=>`<option value="${html(g.id)}" ${active===g.id?'selected':''}>${html(g.id)} (${g.skus.length} SKU)</option>`).join('');
 const q=$('sku-search').value.trim().toLowerCase();
 const matched=a=>(a.name+a.id+(a.skuCode||'')+(a.cartonNo||'')+(a.palletNo||'')+groupKey(a)+(a.orderNo||'')+(a.batchNo||'')).toLowerCase().includes(q);
 const brief=n=>fmt(n).replace(/(\.\d*?[1-9])0+$|\.0+$/,'$1');
 const retained=a=>s.placements.filter(p=>p.skuId===a.id&&differsFromTemplate(p,a)).length;
 const card=a=>`<div class="sku-card ${s.selectedSku===a.id?'selected':''}" data-id="${html(a.id)}"><div class="sku-icon ${colorOf[a.kind]||'carton'}"><svg><use href="#i-box"/></svg></div><div class="sku-description" data-action="choose"><strong>${priorityOrder(a.priority)<=1?`<em class="v115-priority ${a.priority}">${html(priorityLabel(a.priority))}</em>`:''}${html(a.name)}</strong><span>${html(a.skuCode||a.id)}<br>待装模板 ${brief(a.L)} × ${brief(a.W)} × ${brief(a.H)} mm${a.kind==='pallet'?' · 整托含底座':''}</span><span class="unit-line">${html(a.unitCodePreview||unitNumber(a,1))} ${a.numbering?.source==='system-planned'?'<em>规划号</em>':''}</span><span>已装 ${counts[a.id]||0} / ${a.qty} · 模板 ${brief(a.weight)} kg/件</span><span class="cargo-service">${html(deliveryLabel(a))}</span>${retained(a)?`<span class="cargo-spec-retained">${retained(a)} 件沿用各自实物规格</span>`:''}</div><div class="sku-actions"><button class="tiny-btn" data-action="place" title="放入一件">+</button><button class="tiny-btn" data-action="edit" title="编辑货物">···</button></div></div>`;
 $('group-overview').innerHTML=groupRows.map(g=>`<div class="group-pill"><span>${html(g.id)}</span><b>${g.loaded}/${g.quantity}</b></div>`).join('');
 $('sku-list').innerHTML=groupRows.filter(g=>active==='all'||active===g.id).map(g=>{const eligible=g.skus.filter(matched);if(!eligible.length)return '';const closed=(s.closedGroups||[]).includes(g.id);return `<section class="manifest-group"><button class="manifest-header" type="button" data-group-toggle="${html(g.id)}"><span class="manifest-disclosure">${closed?'▸':'▾'}</span><span class="manifest-heading"><strong>${html(g.id)}</strong><small>${g.orders.length?html(g.orders.join('、'))+' · ':''}${eligible.length} 种货物</small></span><span class="manifest-count">${g.loaded} / ${g.quantity}</span></button><div class="group-row-actions"><button class="group-row-button" type="button" data-group-action="select" data-group-name="${html(g.id)}">选中已装</button><button class="group-row-button" type="button" data-group-action="manage" data-group-name="${html(g.id)}">管理分组</button></div>${closed?'':eligible.map(card).join('')}</section>`}).join('')||'<p class="field-help">当前筛选下没有货物。试试切换组别或搜索编号。</p>';
 renderEditPanel();renderFreePalette();
 $('container-choices').innerHTML=Object.values(CONTAINERS).map(c=>`<button type="button" class="container-option ${s.box.id===c.id?'active':''}" data-box="${c.id}"><span class="container-pictogram"></span><span><strong>${html(c.label)}</strong><span>${fmt(c.L)} × ${fmt(c.W)} × ${fmt(c.H)}</span></span></button>`).join('')+`<button type="button" class="container-option ${s.box.id==='CUSTOM'?'active':''}" data-box="CUSTOM"><span class="container-pictogram"></span><span><strong>自定义箱体</strong><span>使用现场实测设备数据</span></span></button>`;
 const presets=$('container-preset');if(!presets.options.length)presets.innerHTML=Object.values(CONTAINERS).map(c=>`<option value="${c.id}">${html(c.label)}</option>`).join('')+'<option value="CUSTOM">自定义箱体 · 实测数据</option>';
 containerEditor?.sync();}
function renderEditPanel(){const p=s.placements.find(q=>q.id===s.selected);$('edit-selected').innerHTML=p?`<strong>${html(p.name)}</strong><small>${html(p.id)} · 朝向 ${Number(p.heading)||0}° · ${fmt(p.L)} × ${fmt(p.W)} × ${fmt(p.H)} mm · ${fmt(p.weight)} kg</small>`:'<strong>尚未选中货物</strong><small>点击中央场景里的货物，或先从货物清单放入一件</small>';for(const axis of ['x','y','z']){const el=$('edit-'+axis);if(el){el.disabled=!p;el.value=p?.[axis]??''}}$('edit-snap').value=String(s.snap);$('edit-drag-axis').value=s.editAxis||'free';for(const el of $('library-edit').querySelectorAll('button')){if(el.id!=='edit-to-cargo')el.disabled=!p};$('edit-lock').textContent=p?.locked?'解除位置锁定':'锁定当前位置';}
function cargoZone(p,box=s.box){return locationOf(p,box)}
function placementRows(){const skuMap=new Map(s.skus.map(a=>[a.id,a]));return decoratePlacements(s.placements,s.skus).map(p=>{const sku=skuMap.get(p.skuId)||{};const ord=unitOrdinal(p);return {...p,sku,unit:unitNumber(sku,ord),group:groupKey(sku||{}),zone:cargoZone(p)};});}
function drawLocatorMap(rows,emphasis){const canvas=$('locator-map');if(!canvas)return;const ctx=canvas.getContext('2d');if(!ctx)return;const bounds=canvas.getBoundingClientRect(),w=Math.max(230,Math.round(bounds.width)||canvas.width),h=Math.max(120,Math.round(bounds.height)||canvas.height);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}ctx.clearRect(0,0,w,h);ctx.fillStyle='#f7f8f6';ctx.fillRect(0,0,w,h);const pad=14,innerW=w-pad*2,innerH=h-pad*2,sx=innerW/s.box.L,sy=innerH/s.box.W;ctx.strokeStyle='#8ba99d';ctx.lineWidth=1.5;ctx.strokeRect(pad,pad,innerW,innerH);ctx.fillStyle='#698274';ctx.font='10px -apple-system, BlinkMacSystemFont, sans-serif';ctx.fillText('柜头',pad+3,h-4);ctx.fillText('柜门',w-27,h-4);ctx.save();ctx.setLineDash([3,3]);ctx.strokeStyle='rgba(112,141,127,.36)';ctx.beginPath();ctx.moveTo(pad+innerW*.24,pad);ctx.lineTo(pad+innerW*.24,pad+innerH);ctx.moveTo(pad+innerW*.76,pad);ctx.lineTo(pad+innerW*.76,pad+innerH);ctx.stroke();ctx.restore();const palette={carton:'#c79c67',crate:'#a67643',pallet:'#b7a37c',board:'#bc8553',ibc:'#d4dad3',drum:'#5f88a8',bag:'#baa978',roll:'#c8ab86'};const matchIds=new Set((emphasis||[]).map(r=>r.id));const drawRows=rows.slice().sort((a,b)=>(a.z+a.H)-(b.z+b.H));const hitRects=[];for(const row of drawRows){const x=pad+row.x*sx,y=pad+row.y*sy,rw=Math.max(5,row.L*sx),rh=Math.max(5,row.W*sy),selected=row.id===s.selected;ctx.globalAlpha=matchIds.size?(matchIds.has(row.id)?0.96:0.18):0.78;ctx.fillStyle=palette[row.kind]||'#8ea196';ctx.fillRect(x,y,rw,rh);ctx.strokeStyle=selected?'#1f9c76':'rgba(41,72,59,.22)';ctx.lineWidth=selected?2:0.8;ctx.strokeRect(x,y,rw,rh);if(selected){ctx.globalAlpha=1;ctx.strokeStyle='#0d7d5c';ctx.lineWidth=2.6;ctx.strokeRect(x-1.5,y-1.5,rw+3,rh+3);}hitRects.push({id:row.id,x,y,w:rw,h:rh});if((selected||matchIds.size&&matchIds.has(row.id)&&matchIds.size<=6)&&rw>24&&rh>12){ctx.globalAlpha=1;ctx.fillStyle='rgba(17,43,33,.88)';ctx.font='10px -apple-system, BlinkMacSystemFont, sans-serif';ctx.fillText(row.unit||row.id,x+4,y+Math.min(rh-3,12));}}ctx.globalAlpha=1;canvas._locRects=hitRects.reverse();}
function renderLocator(){const panel=$('locator-panel'),search=$('locator-search'),summary=$('locator-summary'),list=$('locator-results');if(!panel||!search||!summary||!list)return;panel.classList.toggle('collapsed',!!s.locatorCollapsed);panel.classList.toggle('active',s.scenePreset==='locator');search.value=s.locateQuery||'';const rows=placementRows(),query=(s.locateQuery||'').trim().toLowerCase();const filtered=query?rows.filter(row=>`${row.id} ${row.skuId} ${row.name} ${row.unit} ${row.group} ${row.orderNo||''} ${row.batchNo||''} ${row.destination||''} ${row.palletNo||''}`.toLowerCase().includes(query)):rows.slice(0,18);summary.textContent=rows.length?(query?`${filtered.length} / ${rows.length} 件`:`已装 ${rows.length} 件`):'尚未装货';list.innerHTML=!rows.length?'<div class="locator-empty">当前还没有已装货物，先放入几件试试。</div>':(filtered.length?filtered.slice(0,24).map(row=>`<button type="button" class="locator-item ${row.id===s.selected?'selected':''}" data-locate-id="${html(row.id)}"><strong>${html(row.unit||row.id)}</strong><span>${html(row.group)} · ${html(row.zone)}</span><small>${html(row.skuId)} · ${fmt(row.L)} × ${fmt(row.W)} × ${fmt(row.H)} mm</small></button>`).join(''):'<div class="locator-empty">没有匹配结果，试试 SKU、外箱号、组别或订单号。</div>');drawLocatorMap(rows,query?filtered:rows.filter(row=>row.id===s.selected));const collapse=$('locator-collapse');if(collapse){collapse.textContent=s.locatorCollapsed?'+':'–';collapse.setAttribute('aria-expanded',String(!s.locatorCollapsed));}}
function focusPlacement(id,{locator=true}={}){const row=s.placements.find(p=>p.id===id);if(!row)return;if(locator)applySceneMode(s,'locator');s.selected=id;s.selectedSku=row.skuId;s.collapsed=false;paint(false);views.find(v=>v.mode==='iso')?.focusItem(row);tell(`已定位并聚焦 ${id}`);}
function renderMetrics(){freeEditorUI?.sync();$('stage').classList.toggle('touch-move-enabled',s.touchMove&&s.pointerTool==='select');$('touch-move-toggle').setAttribute('aria-pressed',String(s.touchMove));$('touch-move-hint').classList.toggle('hidden',!s.touchMove);$('context-move-step').value=s.section==='free'?s.freeStep:s.snap;$('context-drag-plane').value=s.editAxis;const r=report(),order=s.skus.reduce((a,b)=>a+b.qty,0);$('workspace-heading').textContent=s.section==='free'?'自由装载编辑室':s.section==='unload'?'装卸路径预演':'装载模拟';document.querySelector('.workspace-intro').textContent=s.section==='free'?'拖入货物、选择多件、精确调整 XYZ，并实时校验位置。':'以真实尺寸规划位置、朝向与装载顺序。';const purposes={iso:'自由立体：旋转、缩放并编辑货物。',top:'俯视 X/Y：查看贴墙和横向排布；无法看到堆码高度。',door:'柜门正视 Y/Z：检查柜门方向的宽高遮挡。',side:'侧视 X/Z：检查柜长方向的堆码与层高。',multi:'四视图：同时核对四个方向，精细拖动请返回自由立体。'};document.querySelector('.workspace-intro').textContent=s.section==='unload'?'按柜门方向检查：平面图选货，N 卸下一件，Backspace 撤回。':(purposes[s.mode]||'装柜规划');$('free-stage-panel').classList.toggle('hidden',s.section!=='free'||s.scenePreset==='locator');$('free-drop-hint').classList.add('hidden');$('scene-container').textContent=s.box.id;$('device-crumb').textContent=s.box.id;$('metric-count').textContent=`${s.placements.length} / ${order}`;$('metric-volume').textContent=fmt(r.utilization)+'%';$('metric-weight').textContent=fmt(r.weight)+' kg';$('scene-device-chip').textContent=s.box.id+' · '+(s.box.verified?.includes('Hapag')?'官方规格示例':'用户自定义');const pos=s.placements.find(p=>p.id===s.selected),selectedSku=s.skus.find(a=>a.id===pos?.skuId),unit=selectedSku?unitNumber(selectedSku,unitOrdinal(pos)):'',zone=pos?cargoZone(pos):'';$('scene-readout').innerHTML=pos?`<span>${html(groupKey(selectedSku||{}))} · ${html(unit)}</span><strong>${html(zone)}</strong><small>X ${fmt(pos.x)} · Y ${fmt(pos.y)} · Z ${fmt(pos.z)} mm · 朝向 ${Number(pos.heading)||0}°　·　${fmt(pos.L)} × ${fmt(pos.W)} × ${fmt(pos.H)} mm　·　${fmt(pos.weight)} kg</small>`:'<span>编号定位</span><strong>选择货物查看所在区域</strong><small>也可直接用右侧定位面板搜索编号</small>';$('check-status').textContent=r.valid?'基础几何检查通过':`${r.issues.length} 项已知约束异常`;$('check-status').classList.toggle('problem',!r.valid);$('risk-detail').textContent=r.valid?'实际搬运设备、受压、绑扎及车辆限载尚未验证':r.issues[0]?.text||'请检查实际尺寸';$('step-range').max=Math.max(1,s.placements.length);$('step-range').value=s.step??s.placements.length;$('step-count').textContent=`${s.step??s.placements.length} / ${s.placements.length}`;}
function unloadingOptions(){return {doorMode:s.unloadDoorMode,clearance:s.unloadClearance,policy:s.routePolicy,maxLift:s.maxLift};}
function selectUnloadItem(id){const p=s.placements.find(p=>p.id===id);if(!p)return;s.selected=id;s.step=null;for(const v of views){v.focusItem?.(p);v.zoom=1;}paint(false);$('v116-focus-label').textContent=`聚焦 ${p.unitCode||p.id} · 可继续缩放`;}
function takeUnloadItem(id){if(workbench)return workbench.unload(id);const r=unloadOne(s.placements,s.box,s.unloadRemoved,id,unloadingOptions());if(!r.ok){tell(r.reason);return false;}
 s.unloadRemoved=r.removed;s.selected=null;s.step=null;paint(false);
 const hud=$('unload-scene-hud');if(hud){hud.classList.remove('unload-complete-flash');void hud.offsetWidth;hud.classList.add('unload-complete-flash');}
 return true;}
function previewNextUnload(){const ranked=rankUnloadChoices(unloadingState(s.placements,s.box,s.unloadRemoved,unloadingOptions()).choices);const next=ranked.find(c=>c.ok);if(next)selectUnloadItem(next.id);else tell('目前没有符合直线取出条件的货物；请查看阻挡原因。')}

function nextUnloadItem(){const plan=suggestUnloadOrder(s.placements,s.box,s.unloadRemoved,unloadingOptions());if(!plan.order.length){tell(plan.issues[0]?.blockers?.[0]?.reason||'没有可行的当前直线卸货路线。可调整路径假设并重新核对。');return false;}return takeUnloadItem(plan.order[0]);}
function drawUnloadMap(state){const canvas=$('unload-map');if(!canvas)return;const ctx=canvas.getContext('2d');if(!ctx)return;const w=canvas.width,h=canvas.height,padX=15,padY=20,iw=w-padX*2,ih=h-padY*2,sx=iw/s.box.L,sy=ih/s.box.W;ctx.clearRect(0,0,w,h);ctx.fillStyle='#faf9f7';ctx.fillRect(0,0,w,h);ctx.fillStyle='#e8e6e2';ctx.fillRect(padX,padY,iw,ih);ctx.lineWidth=1.5;ctx.strokeStyle='#8a858a';ctx.strokeRect(padX,padY,iw,ih);ctx.fillStyle='#66606b';ctx.font='11px -apple-system, sans-serif';ctx.fillText('柜头',padX,h-3);ctx.fillText('柜门 →',w-67,h-3);const shapes=[],rank=new Map((s.unloadOrderRender||[]).map((id,i)=>[id,i+s.unloadRemoved.length+1]));const rows=state.choices.slice().sort((a,b)=>a.item.z+a.item.H-b.item.z-b.item.H);for(const c of rows){const p=c.item,x=padX+p.x*sx,y=padY+p.y*sy,rw=p.L*sx,rh=p.W*sy;ctx.fillStyle=p.id===s.selected?'#3562a6':c.ok?'#28785c':'#ac692d';ctx.globalAlpha=p.id===s.selected?1:.86;ctx.fillRect(x,y,Math.max(1,rw),Math.max(1,rh));ctx.globalAlpha=1;ctx.strokeStyle=p.id===s.selected?'#19306d':'#ffffff';ctx.lineWidth=p.id===s.selected?2.2:.7;ctx.strokeRect(x,y,Math.max(1,rw),Math.max(1,rh));if(rw>17&&rh>12&&rank.has(p.id)&&rank.get(p.id)<=s.unloadRemoved.length+10){ctx.fillStyle="#fff";ctx.font="bold 11px -apple-system,sans-serif";ctx.fillText(String(rank.get(p.id)),x+3,y+Math.min(14,rh-3));}shapes.push({id:p.id,x,y,w:Math.max(3,rw),h:Math.max(3,rh)})}canvas._unloadHit=shapes.reverse();}
function renderUnloadTimeline(state,plan){
 const rail=$('v114-unload-timeline');if(!rail)return;
 const active=s.section==='unload'&&s.unloadFlow!=='load';rail.classList.toggle('hidden',!active);
 if(!active)return;
 const done=s.unloadRemoved.length,total=s.placements.length;
 const next=(plan?.order||[]).slice(0,7);const blocked=priorityIssues(state.choices);
 const heading=state.remaining.length===0?'预演完成':next.length?'按编号逐件定位并卸出':'当前路径受阻';
 rail.innerHTML=`${blocked.length?`<div class="v115-priority-banner">急件提醒：${blocked.length} 件紧急/优先货物受阻。${html(blocked[0].id)}：${html(blocked[0].reason)}。优先处理阻挡件，勿强行取货。</div>`:''}<div class="v114-timeline-head"><span><strong>第 ${done+1} 步 · ${heading}</strong><small>${done} / ${total} 件已模拟卸出 · ${state.available.length} 件当前可取 · ${blocked.length} 件紧急/优先货物待清障</small></span><button type="button" data-v114-action="undo" ${done?'':'disabled'}>↶ 撤回</button></div><div class="v114-timeline-scroll">${next.map((id,i)=>{const item=state.remaining.find(p=>p.id===id);return `<button class="v114-step ${id===s.selected?'selected':''}" type="button" data-v114-focus="${html(id)}" title="点击高亮并放大 ${html(item?.unitCode||id)}"><b>${done+i+1}</b><span><strong>${html(item?.unitCode||id)}</strong><small>${i===0?'建议下一件 · 点击可放大':'定位并放大'}${priorityOrder(item?.priority)<=1?' · '+html(priorityLabel(item?.priority)):''}</small></span></button>`}).join('')||`<p class="v114-timeline-empty">${state.remaining.length?'当前没有可验证的直线卸货顺序。查看左侧阻挡详情，或核对门洞假设。':'已完成全部模拟卸货。原装载方案未改变。'}</p>`}</div><div class="v114-timeline-actions"><button type="button" data-v114-action="preview" ${next.length?'':'disabled'}>◎ 定位下一件</button><button type="button" class="primary" data-v114-action="take" ${next.length?'':'disabled'}>卸出第 ${done+1} 件 <kbd>N</kbd></button><span>优先可取急件；受阻急件须先清障。仅为几何预演，不代替叉车作业方案。</span></div>`;
}
function renderUnloading(){
 document.body.classList.toggle('unload-active',s.section==='unload');
 const tab=$('library-unload');if(!tab)return;
 s.unloadRemoved=(s.unloadRemoved||[]).filter(id=>s.placements.some(p=>p.id===id));
 const state=unloadingState(s.placements,s.box,s.unloadRemoved,unloadingOptions());
 $('v116-focus-tools')?.classList.toggle('hidden',s.section!=='unload');const zoomTitle=$('v116-focus-label');if(zoomTitle)zoomTitle.textContent=s.selected?`选中 ${s.placements.find(p=>p.id===s.selected)?.unitCode||s.selected} · +/- 缩放`:'点选货物或步骤编号，点击 ＋ 放大';
 const unloadPlan=suggestUnloadOrder(s.placements,s.box,s.unloadRemoved,unloadingOptions());s.unloadOrderRender=unloadPlan.order;
 $('unload-door-mode').value=s.unloadDoorMode;$('workflow-route-mode').value=s.unloadDoorMode;$('unload-clearance').value=String(s.unloadClearance);
 drawUnloadMap(state);
 $('unload-next-auto').disabled=!state.available.length||s.unloadFlow==='load';
 $('unload-count').textContent=`${s.unloadRemoved.length} / ${s.placements.length}`;
 $('unload-ready').textContent=String(state.available.length);
 const ranked=rankUnloadChoices(state.choices);
 const choices=filterUnloadChoices(ranked,s.unloadViewFilter,s.unloadQuery);
 document.querySelectorAll('[data-unload-filter]').forEach(btn=>{const active=btn.dataset.unloadFilter===s.unloadViewFilter;btn.classList.toggle('active',active);btn.setAttribute('aria-pressed',String(active));});
 $('unload-filter-count').textContent=`${state.available.length} 可取 · ${state.blocked.length} 受阻`;

 $('unload-list').innerHTML=choices.length?choices.map(row=>`<div class="unload-item ${row.ok?'ready':'blocked'} ${row.id===s.selected?'active':''}"><button class="unload-item-name" data-unload-select="${html(row.id)}"><b><em class="v112-order-listno">${(s.unloadOrderRender||[]).indexOf(row.id)>=0?(s.unloadOrderRender.indexOf(row.id)+s.unloadRemoved.length+1):"!"}</em>${html(row.item.unitCode||row.id)}</b><small>${priorityOrder(row.item.priority)<=1?`<em class="v115-priority ${row.item.priority}">${html(priorityLabel(row.item.priority))}</em>`:''}${html(row.item.name||'')} · X ${fmt(row.item.x)} mm</small><span>${row.ok?(s.unloadDoorMode==='smart'?html([...new Set(row.segments.map(v=>v.action))].join(' → ')):s.unloadDoorMode==='strict'?'符合当前严格直线几何假设':'尺寸可穿门；横向调整尚未模拟'):html(row.blockers[0]?.reason||'位置被阻挡')}</span></button><button type="button" data-unload-take="${html(row.id)}" ${row.ok||s.unloadDoorMode==='smart'&&unloadPlan.order.includes(row.id)?'':'disabled'} title="预演卸出该件，必要时先清障">${row.ok?'卸出':'先清障'}</button></div>`).join(''):'<p class="unload-empty">没有待卸货物或当前筛选无结果。</p>';
 const next=ranked.find(c=>c.ok);
 renderUnloadTimeline(state,unloadPlan);
 const cg=geometricWeightCentre(state.remaining);
 $('unload-next').innerHTML=state.remaining.length?`<strong>${state.available.length?`下一件建议：${html(next.id)}`:'当前路径尚未找到通行方案'}</strong><small>${state.available.length?'仅符合当前几何假设，仍需现场设备和绑扎检查':'查看橙色货物阻挡原因；可切换假设对比'}${cg?` · 剩余货物估算重心 X ${fmt(cg.x)} mm / Y ${fmt(cg.y)} mm`:''}</small>`:'<strong>模拟卸货已完成</strong><small>原装柜数据未改变，点击重置可重新预演。</small>';
 const isLoad=s.unloadFlow==='load';
 $('flow-unload').classList.toggle('active',!isLoad);$('flow-unload').setAttribute('aria-pressed',String(!isLoad));
 $('flow-load').classList.toggle('active',isLoad);$('flow-load').setAttribute('aria-pressed',String(isLoad));
 $('unload-list').classList.toggle('hidden',isLoad);$('load-sequence').classList.toggle('hidden',!isLoad);
 $('unload-next-auto').classList.toggle('hidden',isLoad);$('unload-suggest').classList.toggle('hidden',isLoad);$('unload-undo').classList.toggle('hidden',isLoad);$('unload-reset').classList.toggle('hidden',isLoad);
 if(isLoad){const plan=suggestLoadOrder(s.placements,s.box,unloadingOptions());$('load-sequence').innerHTML=`<div class="load-intro"><strong>${plan.complete?'建议装入路径已生成':'仅能生成部分装入顺序'}</strong><span>${plan.order.length} / ${s.placements.length} 件 · 沿已校验的卸出路径反向排列，假定运输包装可沿原路径倒序装入；不代表真实叉车或吊具可达性。</span></div>`+plan.order.slice(0,300).map((id,i)=>{const p=s.placements.find(x=>x.id===id);return `<button type="button" data-load-focus="${html(id)}"><b>${i+1}</b><span><strong>${html(p?.unitCode||id)}</strong><small>X ${fmt(p?.x??0)} · Y ${fmt(p?.y??0)} · Z ${fmt(p?.z??0)} mm</small></span><span>定位 ›</span></button>`}).join('')+(plan.unresolved.length?`<p class="unload-warning">${plan.unresolved.length} 件不能按该简化模型生成无阻挡路径，请重新检查原装载方案。</p>`:'');}

 const focused=state.choices.find(c=>c.id===s.selected),displayChoice=focused||next;
 const explanation=unloadChoiceExplanation(focused||next,s.box);
 const hud=$('unload-scene-hud');
 hud.classList.toggle('hidden',s.section!=='unload');
 hud.classList.toggle('show-loading',isLoad);
 $('unload-hud-progress').textContent=`${s.unloadRemoved.length} / ${s.placements.length}`;
 $('unload-hud-progressbar').style.width=`${s.placements.length?Math.min(100,s.unloadRemoved.length/s.placements.length*100):0}%`;
 $('unload-hud-count').textContent=`${state.available.length} 件当前可取`;
 $('unload-hud-title').textContent=state.remaining.length?(displayChoice?displayChoice.item.unitCode||displayChoice.id:'当前没有直线可取货物'):'模拟卸货完成';
 $('unload-hud-detail').textContent=isLoad?'装入建议仅供规划；不会改变当前货物的位置。':state.remaining.length?explanation:'装柜方案保持不变，可以重新预演。';
 $('unload-hud-preview').disabled=!state.available.length||isLoad;
 $('unload-hud-take').disabled=!state.available.length||isLoad||!!focused&&!focused.ok;
 $('unload-hud-take').textContent=focused?.ok?'卸出已选货物':'卸出建议下一件';
 $('unload-hud-back').disabled=!s.unloadRemoved.length||isLoad;
 $('unload-hud-marker').className='unload-hud-marker '+(focused&&!focused.ok?'warn':'safe');
 $('unload-undo').disabled=!s.unloadRemoved.length;
 document.querySelectorAll('button[data-pointer-tool]').forEach(b=>{const active=b.dataset.pointerTool===s.pointerTool;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});
 $('stage').dataset.pointerTool=s.pointerTool;
 $('free-smart-stack').checked=!!s.freeSmartStack;
}
function setupV116(){
 const rail=$('v116-focus-tools');if(!rail)return;
 const stage=$('stage'),readout=$('scene-readout'),actions=$('selection-actions');
 const detailDock=document.createElement('div');detailDock.id='v116-cargo-detail-dock';detailDock.className='v116-cargo-detail-dock';stage.after(detailDock);
 const fitDock=()=>{const compact=innerWidth<=740;if(compact){detailDock.append(readout,actions);}else{stage.append(readout,actions);}};
 fitDock();window.addEventListener('resize',fitDock);
 const active=()=>views.filter(v=>v.mode==='iso').length?views.filter(v=>v.mode==='iso'):[...views];
 $('v116-zoom-in').onclick=()=>{for(const v of active())v.zoomBy(1.24);};
 $('v116-zoom-out').onclick=()=>{for(const v of active())v.zoomBy(1/1.24);};
 $('v116-focus').onclick=()=>{const row=s.placements.find(p=>p.id===s.selected);if(!row){tell('先点击时间线或平面图选择一件货物');return;}for(const v of active()){v.focusItem(row);v.zoom=1;}drawViews();};
 $('v116-fit').onclick=()=>{for(const v of views)v.resetCamera();};
}
function setupV117(){
 const compact=()=>window.matchMedia('(max-width:1040px)').matches;
 const toggle=$('v117-library-toggle');
 const revealScene=()=>{if(compact())requestAnimationFrame(()=>{$('stage')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'start'});});};
 $('empty-demo')?.addEventListener('click',revealScene);$('empty-place')?.addEventListener('click',revealScene);
 const goToLibrary=()=>requestAnimationFrame(()=>{if(!experience&&compact()&&!s.collapsed){$('library').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'start'});}});
 toggle?.addEventListener('click',()=>{s.collapsed=!s.collapsed;paint(false);goToLibrary();});
 $('v117-fit')?.addEventListener('click',()=>{ $('fit-view').click(); });
 $('v117-fullscreen')?.addEventListener('click',()=>{$('editor-fullscreen').click();});
 // Native page scroll must remain accessible when users switch modules.
 document.querySelectorAll('.rail-item[data-section]').forEach(b=>b.addEventListener('click',()=>{
  if(compact())goToLibrary();
 }));
}
function setupV114(){
 const stage=$('stage'),shell=stage?.closest('.viewport-shell');
 // Capture wheel on the ENTIRE 3D stage, including empty-state and help overlays.
 // Without this, modifiers could fall through overlays and accidentally scroll the page.
 stage?.addEventListener('wheel',e=>{
  if(e.target.closest('input,select,textarea,.camera-pad,.locator-panel,.unload-scene-hud'))return;
  const workspace=document.querySelector('.workspace');const compact=innerWidth<=1040||innerHeight<=780;
  const full=document.body.classList.contains('v112-fullscreen');const wantZoom=e.altKey||e.ctrlKey||e.metaKey;
  // Compact mode uses the *document* as the vertical scroller. Do not hijack
  // an ordinary wheel event, even if the pointer is over a canvas overlay.
  if(!full&&!wantZoom)return;
  const cell=e.target.closest('.view-cell'),v=views.find(v=>v.parent===cell)||(views[0]);
  if(v){e.preventDefault();e.stopPropagation();v.zoomBy(e.deltaY>0?.87:1.15)}
 },{capture:true,passive:false});if(shell&&!$('v114-unload-timeline')){
  const el=document.createElement('section');el.id='v114-unload-timeline';el.className='v114-unload-timeline hidden';el.setAttribute('aria-label','逐件卸货时间线');stage.after(el);
  el.addEventListener('click',e=>{
   const focus=e.target.closest('[data-v114-focus]');if(focus){selectUnloadItem(focus.dataset.v114Focus);return;}
   const action=e.target.closest('[data-v114-action]')?.dataset.v114Action;
   if(action==='undo')$('unload-undo').click();else if(action==='take')nextUnloadItem();else if(action==='preview')previewNextUnload();
  });
 }
 const box=$('v114-pallet-example');if(box)box.onclick=()=>tell('示例：货物连托盘总外廓 1200 × 800 × 1150 mm，计算体积 1.104 m³；1150 mm 必须包含托盘底座。若原始资料只写货物高 1000 mm，应先实测托盘及包装总高再录入。');
}
function updateViewHint(){const hints={iso:'自由立体：旋转查看整体，选中后拖动货物',top:'俯视：检查左右贴边与 X/Y 平面位置；高度请看侧视',door:'门口正视：检查门洞宽高，远近货物可能重叠',side:'侧视：检查沿箱长的排列、堆码高度与远端货物',multi:'四视图：同时核对位置；精细拖动建议使用单视图'};const el=$('v114-view-hint');if(el)el.textContent=hints[s.mode]||hints.iso;}
function unloadWire(){
 const panel=$('library-unload');
 $('flow-unload').onclick=()=>{s.unloadFlow='unload';paint(false)};$('flow-load').onclick=()=>{s.unloadFlow='load';paint(false)};
 $('unload-door-mode').onchange=e=>{s.unloadDoorMode=e.target.value;s.unloadRemoved=[];s.selected=null;paint(false)};
 $('unload-clearance').onchange=e=>{s.unloadClearance=Number(e.target.value);s.unloadRemoved=[];s.selected=null;paint(false)};
 $('unload-next-auto').onclick=()=>nextUnloadItem();
 $('unload-hud-preview').onclick=previewNextUnload;
 $('unload-hud-take').onclick=()=>{const row=unloadingState(s.placements,s.box,s.unloadRemoved,unloadingOptions()).choices.find(c=>c.id===s.selected);if(row?.ok)takeUnloadItem(row.id);else nextUnloadItem();};
 $('unload-hud-back').onclick=()=>$('unload-undo').click();
 $('unload-hud-list').onclick=()=>{if(s.collapsed){s.collapsed=false;paint(false)}requestAnimationFrame(()=>{$('unload-search').focus();$('unload-list').scrollIntoView({block:'nearest',behavior:'smooth'})});};
 $('unload-hud-fit').onclick=()=>{$('fit-view').click();};
 panel.querySelectorAll('[data-unload-filter]').forEach(btn=>btn.onclick=()=>{s.unloadViewFilter=btn.dataset.unloadFilter;renderUnloading();save();});
 $('unload-map').addEventListener('click',e=>{const canvas=e.currentTarget,r=canvas.getBoundingClientRect(),px=(e.clientX-r.left)*canvas.width/r.width,py=(e.clientY-r.top)*canvas.height/r.height;const found=canvas._unloadHit?.find(q=>px>=q.x&&px<=q.x+q.w&&py>=q.y&&py<=q.y+q.h);if(found)selectUnloadItem(found.id)});
 $('load-sequence').onclick=e=>{const row=e.target.closest('[data-load-focus]');if(row){s.selected=row.dataset.loadFocus;for(const v of views)v.focusItem?.(s.placements.find(p=>p.id===s.selected));paint(false)}};
 $('unload-list').onclick=e=>{const take=e.target.closest('[data-unload-take]');if(take){takeUnloadItem(take.dataset.unloadTake);return;}const select=e.target.closest('[data-unload-select]');if(select){selectUnloadItem(select.dataset.unloadSelect);}};
 $('unload-suggest').onclick=()=>{const r=suggestUnloadOrder(s.placements,s.box,s.unloadRemoved,unloadingOptions());if(!r.order.length){tell(r.issues[0]?.blockers?.[0]?.reason||'没有可行的直线卸货顺序');return;}s.unloadSuggested=r.order;const first=r.order[0];s.selected=first;paint(false);tell(`建议 ${r.order.length} 件，${r.complete?'该假设下可全部卸出':'部分货物被阻挡'}。点击对应“卸出”逐步确认。`);};
 $('unload-reset').onclick=()=>{s.unloadRemoved=[];s.unloadSuggested=[];s.selected=null;paint(false)};
 $('unload-undo').onclick=()=>{s.unloadRemoved.pop();paint(false)};
 $('unload-search').oninput=e=>{s.unloadQuery=e.target.value;renderUnloading();save()};
 $('unload-show-all').onclick=()=>{stopPlay();s.section='cargo';s.unloadRemoved=[];s.step=null;paint(false)};
 $('unload-export').onclick=()=>{
  const result=suggestUnloadOrder(s.placements,s.box,s.unloadRemoved,unloadingOptions());const records=[...s.unloadRemoved,...result.order];
  const fields=['步骤','货物记录号','箱件编号','紧急程度','动作','X(mm)','Y(mm)','Z(mm)','状态','门洞路径假设','预留间隙(mm)'];const q=v=>{let value=String(v??'');if(/^[\s]*[=+@-]/.test(value))value="'"+value;return '"'+value.replaceAll('"','""')+'"';};
  const rows=records.map((id,i)=>{const p=s.placements.find(v=>v.id===id);return [i+1,id,p?.unitCode||id,priorityLabel(p?.priority),i<s.unloadRemoved.length?'已模拟卸出':'建议卸出',p?.x,p?.y,p?.z,'仅几何路径预演',s.unloadDoorMode==='smart'?'智能横移升降绕行':s.unloadDoorMode==='strict'?'严格固定Y/Z':'宽松可能横移',s.unloadClearance];});const loading=suggestLoadOrder(s.placements,s.box,unloadingOptions());rows.push(...loading.order.map((id,i)=>{const p=s.placements.find(v=>v.id===id);return [i+1,id,p?.unitCode||id,priorityLabel(p?.priority),'建议装入',p?.x,p?.y,p?.z,'反向几何建议，未验证实际装卸设备',s.unloadDoorMode==='smart'?'智能横移升降绕行':s.unloadDoorMode==='strict'?'严格固定Y/Z':'宽松可能横移',s.unloadClearance];}));
  rows.push(...result.unresolved.map(id=>{const p=s.placements.find(v=>v.id===id);const issue=result.issues.find(v=>v.id===id);return ['',id,p?.unitCode||id,priorityLabel(p?.priority),'未生成可行卸货顺序',p?.x,p?.y,p?.z,issue?.blockers?.map(b=>b.reason).join('；')||'在当前路径模型下未找到可行取出顺序',s.unloadDoorMode==='smart'?'智能横移升降绕行':s.unloadDoorMode==='strict'?'严格固定Y/Z':'宽松可能横移',s.unloadClearance];}));
  download('\ufeff'+[fields,...rows].map(r=>r.map(q).join(',')).join('\r\n'),'RealLoad-模拟卸货顺序.csv','text/csv;charset=utf-8');
  tell('已导出装卸预演顺序；该文件不是现场作业安全指令。');
 };
 for(const b of document.querySelectorAll('[data-pointer-tool]'))b.onclick=()=>{s.pointerTool=b.dataset.pointerTool;paint(false)};
 $('free-smart-stack').onchange=e=>{s.freeSmartStack=e.target.checked;save()};
 document.addEventListener('keydown',e=>{if(e.code==='Space'&&!e.repeat&&!e.target.closest('input,select,textarea,button,[contenteditable=true]')&&!document.querySelector('dialog[open]')){e.preventDefault();spaceOrbitHeld=true;document.body.classList.add('space-orbit');}});
 document.addEventListener('keyup',e=>{if(e.code==='Space'){spaceOrbitHeld=false;document.body.classList.remove('space-orbit')}});
 window.addEventListener('blur',()=>{spaceOrbitHeld=false;document.body.classList.remove('space-orbit')});
}
function inspector(){const root=$('inspector-body'),p=editPlacements().find(p=>p.id===s.selected);if(!p){root.innerHTML='<p class="field-help">选中场景中的货物，才能查看它的精确尺寸、位置与合法朝向。</p>';return;}const sku=s.skus.find(a=>a.id===p.skuId),opts=sku?orientations(cargoSpecOf(p,sku)):[];const ord=unitOrdinal(p);root.innerHTML=`<div class="item-hero"><div class="sku-icon ${colorOf[p.kind]||'carton'}"><svg><use href="#i-box"/></svg></div><div><strong>${html(p.name)}</strong><small>${html(p.id)} · ${html(viewTypes[p.kind]||'其他')}</small></div></div>
<section class="inspector-section"><h3>货物追溯 / 编号</h3><div class="manifest-detail"><div><small>外箱 / 装载单元号</small><strong>${html(sku?unitNumber(sku,ord):p.id)}</strong></div><div><small>组别 · 订单</small><strong>${html(groupKey(sku||{}))} · ${html(sku?.orderNo||'—')}</strong></div><div><small>批次 · 托盘号</small><strong>${html(sku?.batchNo||'—')} · ${html(sku?.palletNo||'—')}</strong></div><div><small>号码依据</small><strong>${sku?.numbering?.source==='source-provided'?'源表提供':'系统规划编号，未核实实物贴标'}</strong></div></div></section><section class="inspector-section"><h3>外包装资料</h3><div class="detail-pairs"><div><small>装载尺寸 L × W × H${p.kind==='pallet'?'（含托盘底座）':''}</small><strong>${fmt(p.L)} × ${fmt(p.W)} × ${fmt(p.H)} mm</strong></div><div><small>单件毛重</small><strong>${fmt(p.weight)} kg</strong></div><div><small>离柜顶余量</small><strong>${fmt(s.box.H-p.z-p.H)} mm</strong></div><div><small>状态</small><strong>${p.locked?'位置已锁定':'可编辑'}</strong></div></div></section>
<section class="inspector-section"><h3>XYZ 精确位置 / mm</h3><div class="position-fields"><label>X（箱长）<input id="position-x" type="number" step="0.0001" value="${p.x}"/></label><label>Y（箱宽）<input id="position-y" type="number" step="0.0001" value="${p.y}"/></label><label>Z（高度）<input id="position-z" type="number" step="0.0001" value="${p.z}"/></label></div><div class="inspector-action-row"><button class="primary-inline" data-inspector-action="apply">应用坐标</button><button data-inspector-action="nudge">X + ${s.snap} mm</button></div><label class="field-label" style="margin-top:12px">拖动吸附步长<select id="snap-select"><option value="0.01" ${s.snap===0.01?'selected':''}>0.01 mm</option><option value="0.1" ${s.snap===0.1?'selected':''}>0.1 mm</option><option value="1" ${s.snap===1?'selected':''}>1 mm</option><option value="10" ${s.snap===10?'selected':''}>10 mm</option><option value="25" ${s.snap===25?'selected':''}>25 mm</option><option value="50" ${s.snap===50?'selected':''}>50 mm</option><option value="100" ${s.snap===100?'selected':''}>100 mm</option></select></label></section>
<section class="inspector-section"><h3>允许的装载朝向</h3><div class="orientation-options">${opts.map((o,i)=>`<button data-orientation="${i}" class="${p.L===o.L&&p.W===o.W&&p.H===o.H?'active':''}">${fmt(o.L)} × ${fmt(o.W)} × ${fmt(o.H)}</button>`).join('')}</div><p class="field-help" style="margin-top:10px">竖翻只在 SKU 明确允许时提供。变化后会重新验证几何规则。</p></section>
<div class="inspector-action-row"><button data-inspector-action="lock">${p.locked?'解除锁定':'锁定位置'}</button><button data-inspector-action="duplicate">再放一件</button></div><div class="inspector-action-row"><button class="danger-btn" data-inspector-action="remove">移出货柜</button><button class="danger-btn" data-inspector-action="delete-sku">删除 SKU</button></div>`;}
function quote(){const q=quoteEstimate(s.quote,report().used,report().weight);$('quote-total').textContent=`${q.currency} ${fmt(q.total.toFixed(2))}`;$('quote-formula').textContent=`${q.volumeM3.toFixed(3)} m³ × ${fmt(s.quote.perCbm)} + ${fmt(q.weightKg)} kg × ${fmt(s.quote.perKg)} + 固定费用`;}
function paint(rebuild=false){syncShellControls();renderLibrary();renderMetrics();renderUnloading();renderLocator();inspector();quote();updateV11Controls(s);$('empty-stage').classList.toggle('hidden',s.placements.length>0||s.step===0);$('selection-actions').classList.toggle('hidden',!s.selected||!s.placements.some(p=>p.id===s.selected));$('selection-action-title').textContent=s.selected?`${s.selected} · 常用操作`:'已选货物';document.querySelectorAll('.viewport-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.view===s.mode));updateViewHint();$('axis-legend').classList.toggle('hidden',!s.opts.axes);for(const el of document.querySelectorAll('[data-display]'))el.checked=!!s.opts[el.dataset.display];$('precision-select').value=String(s.precision);$('coords-scope').value=s.opts.coordsScope;$('wall-opacity').value=Math.round(s.opts.wallOpacity*100);$('wall-value').textContent=Math.round(s.opts.wallOpacity*100)+'%';$('v112-hide-shell').setAttribute('aria-pressed',String(!s.opts.walls));$('v112-hide-shell').textContent=s.opts.walls?'隐藏墙板':'显示墙板';const wanted=s.mode==='multi'?['iso','top','door','side']:[s.mode];workbench?.sync();experience?.sync();sceneWorkspace?.sync();studio?.sync();if(rebuild||views.length!==wanted.length||views.some((v,i)=>v.mode!==wanted[i]))makeViews();else drawViews();save();}
function auto(){if(blockDraftCargoEdit()||blockPendingFreeDraft())return;stopPlay();try{snapshot();const inventory=packingInventory(s.skus,s.placements),result=autoPackThroughDoor(s.skus,s.box,s.placements.filter(p=>p.locked),inventory.units.length,s.unloadClearance,inventory.units);result.truncated=inventory.truncated;const retained=new Set(result.placements.map(p=>p.id));if(s.placements.some(p=>!retained.has(p.id)))throw Error('当前设置未找到保留全部已装实物的排布，原方案已保留。请调整箱体或逐件移动。');if(!result.validation.valid)throw Error(result.validation.issues[0].text);s.placements=decoratePlacements(result.placements,s.skus);s.selected=null;s.step=null;paint();const urgentRisks=priorityIssues(unloadingState(s.placements,s.box,[],unloadingOptions()).choices).length;tell(`已放入 ${result.placements.length} 件；未装 ${Math.max(0,s.skus.reduce((sum,sku)=>sum+sku.qty,0)-result.placements.length)} 件。${result.truncated?'本次最多计算 180 件新增货物，其余尚未计算。':''}${urgentRisks?`有 ${urgentRisks} 件紧急/优先货物被阻挡，须在装卸模块清障。`:'当前急件未见直线阻挡。'}已按门洞范围排布，仍需现场复核。`)}catch(e){undoStack.pop();tell(e.message)}}
function addOne(skuId=s.selectedSku){
 if(blockDraftCargoEdit()||blockPendingFreeDraft())return;
 const sku=s.skus.find(a=>a.id===skuId);if(!sku){tell('请先选择货物');return;}
 const used=new Set(s.placements.filter(p=>p.skuId===sku.id).map(unitOrdinal));
 if(used.size>=sku.qty){tell('已达到订单数量，可先编辑数量');return;}
 let ordinal=1;while(used.has(ordinal))ordinal++;
 const inventory=[{sku,ordinal}];
 try{
  const res=s.placements.length?autoPack(s.skus,s.box,s.placements,1,inventory):autoPackThroughDoor(s.skus,s.box,[],1,s.unloadClearance,inventory);
  if(res.placements.length!==s.placements.length+1){tell('未找到符合已知约束的可用位置');return;}
  if(!res.validation.valid){tell('货物未放入：'+res.validation.issues[0].text);return;}
  snapshot();s.placements=decoratePlacements(res.placements,s.skus);s.selected=s.placements.at(-1)?.id||null;
  if(s.section==='free'){s.freeSelection=s.selected?[s.selected]:[];s.freeTab='edit';s.collapsed=false;}
  s.step=null;paint();
 }catch(e){tell(e.message);}
}
function removeItem(){if(blockPendingFreeDraft())return;if(blockDraftCargoEdit())return;if(!s.selected){tell('请先在场景中选中货物');return;}const p=s.placements.find(p=>p.id===s.selected);if(p?.locked){tell('请先解除锁定');return;}const remaining=s.placements.filter(p=>p.id!==s.selected),check=validate(remaining,s.box,s.skus);if(!check.valid){tell('请先移出上方货物：'+check.issues[0].text);return;}snapshot();s.placements=remaining;s.selected=null;s.step=null;paint()}
function turn(degrees=90){const p=s.placements.find(p=>p.id===s.selected);if(!p){tell('请先选中货物');return;}const ids=currentSelection();runFree(rotateSelection(editPlacements(),ids,s.box,s.skus,degrees,draftOptions()),`已转向 ${degrees}° · ${ids.length} 件`)}
function changeContainer(next,{placements=s.placements,repacked=false}={}){const spec=auditContainerSpec(next);if(!spec.ok){tell('箱体尺寸未应用：'+spec.issues[0]);return false;}const check=validate(placements,next,s.skus);if(!check.valid){tell('箱体尺寸未应用，原方案已保留：'+(check.issues[0]?.text||'请先调整现有货物'));return false;}snapshot();s.box=clone(next);s.placements=placements;s.step=null;s.unloadRemoved=[];cameraMemory.clear();paint(true);tell(repacked?'箱体尺寸已保存，已装货物已重排，编号保持不变。可撤销恢复。':'箱体与门洞尺寸已更新，现有货物位置已保留并重新校验。');return true;}
function showSkuDialog(sku=null,kind='carton'){const dlg=$('sku-dialog');dlg.dataset.edit=sku?.id||'';dlg.dataset.kind=sku?.kind||kind;$('sku-save-feedback').hidden=true;$('sku-dialog-title').textContent=sku?'编辑待装模板':'新增货物';const init=sku||{id:`SKU-${String(Date.now()).slice(-5)}`,name:(viewTypes[kind]||'货物'),...({ibc:{L:1200,W:1000,H:1160,weight:300,qty:1,stackLimit:1},drum:{L:585,W:585,H:890,weight:70,qty:4,stackLimit:1},bag:{L:950,W:950,H:1200,weight:800,qty:2,stackLimit:1},roll:{L:900,W:900,H:1300,weight:220,qty:2,stackLimit:1},plastic_crate:{L:600,W:400,H:340,weight:14,qty:8,stackLimit:3},sack:{L:640,W:420,H:200,weight:28,qty:12,stackLimit:1},machine:{L:1450,W:920,H:1150,weight:860,qty:1,stackLimit:1},reel:{L:850,W:1200,H:1200,weight:380,qty:1,stackLimit:1},bundle:{L:2100,W:480,H:420,weight:260,qty:2,stackLimit:1},coolbox:{L:780,W:580,H:610,weight:48,qty:6,stackLimit:2},board:{L:1200,W:300,H:35,weight:9,qty:6,stackLimit:4},round_pack:{L:580,W:580,H:900,weight:44,qty:6,stackLimit:1},irregular:{L:1100,W:850,H:980,weight:165,qty:1,stackLimit:1}}[kind]||{L:600,W:400,H:350,weight:18,qty:10,stackLimit:3}),rotate:true,allowTilt:false,kind};for(const input of dlg.querySelectorAll('[name]')){const val=init[input.name];if(input.type==='checkbox')input.checked=!!val;else input.value=val??''}renderKinds();dlg.showModal()}
function renderKinds(){const current=$('sku-dialog').dataset.kind;$('kind-safety').textContent=(CARGO_TYPES[current]?.note||'请核实外包装实际尺寸')+'。新建默认数据仅为可修改示例，不是厂家认证规格。';$('kind-options').innerHTML=Object.entries(viewTypes).map(([k,n])=>`<button class="kind-choice ${current===k?'active':''}" type="button" data-kind="${k}"><i class="material-dot ${k}"></i>${n}</button>`).join('')}
function saveSku(e){e.preventDefault();const dlg=$('sku-dialog'),old=dlg.dataset.edit,form=new FormData($('sku-form'));const s2={id:String(form.get('id')).trim(),name:String(form.get('name')).trim(),priority:normalizePriority(form.get('priority'))||'normal',deliveryStop:normalizeDeliveryStop(form.get('deliveryStop')),kind:dlg.dataset.kind,L:+form.get('L'),W:+form.get('W'),H:+form.get('H'),weight:+form.get('weight'),qty:+form.get('qty'),stackLimit:+form.get('stackLimit'),rotate:!!form.get('rotate'),allowTilt:!!form.get('allowTilt')};
 for(const k of ['orderNo','groupId','cartonNo','palletNo','batchNo','destination'])s2[k]=String(form.get(k)||'').trim();
 if(String(form.get('deliveryStop')||'').trim()&&!s2.deliveryStop){tell('交付站次须为 1 至 999 的整数，未指定可留空');return;}
 const prior=s.skus.find(a=>a.id===old);s2.skuCode=prior?.skuCode||s2.id;s2.groupId=groupKey(s2);
 try{s2.numbering=makeNumbering({external:s2.kind==='pallet'?(s2.palletNo||s2.cartonNo):s2.cartonNo,quantity:s2.qty||1,group:s2.groupId,code:s2.id,kind:s2.kind});s2.unitCodePreview=unitNumber(s2,1)}catch(e){tell('编号设置不正确：'+e.message);return;}if(!positiveInput(s2)||!s2.id||!s2.name){tell('请检查长宽高、重量、数量及堆码层数');return;}if(s.skus.some(a=>a.id===s2.id&&a.id!==old)){tell('SKU 编号不能重复');return;}
 const next=old?s.skus.map(a=>a.id===old?{...a,...s2}:a):[...s.skus,s2];
 const result=updateCargo(s,next,{renames:old?{[old]:s2.id}:{}});
 if(!result.ok){const feedback=$('sku-save-feedback');feedback.textContent='修改尚未应用，所有货物与位置已保留。'+result.reason+'。请核对数量和货物资料后重试。';feedback.hidden=false;feedback.scrollIntoView({block:'nearest'});return;}
 const applied=commitCargoUpdate(result,{renames:old?{[old]:s2.id}:{}});if(!applied.ok){$('sku-save-feedback').textContent='自由草稿与原方案已保留。'+applied.reason;$('sku-save-feedback').hidden=false;return;}s.selectedSku=s2.id;s.groupFilter='all';s.step=null;s.unloadRemoved=[];dlg.close();paint(false);tell(`模板已保存。${s.placements.length} 件已装实物的尺寸、毛重、包装与位置保持不变；新规格用于后续放入。`)}
function deleteSku(id){const skus=s.skus.filter(x=>x.id!==id),remaining=s.placements.filter(x=>x.skuId!==id),check=validate(remaining,s.box,skus);if(!check.valid){tell('请先移出依赖该 SKU 支撑的货物：'+check.issues[0].text);return;}if(!confirm('删除 SKU 会同时移除该 SKU 在货柜中的全部位置。确定继续？'))return;snapshot();s.skus=skus;s.placements=remaining;s.selectedSku=s.skus[0]?.id||null;s.selected=null;paint()}
function showIssues(){const r=report(),list=r.issues.length?r.issues.map(x=>`<div class="issue-row">${html(x.text)}</div>`).join(''):'<p class="issue-ok">已通过当前实现的基础尺寸、碰撞、重量与支撑检查。</p>';$('issues-content').innerHTML=`${list}${r.materialWarnings.map(x=>`<div class="issue-row">需另外确认：${html(x)}</div>`).join('')}<p class="field-help" style="margin-top:16px">装卸模块按固定朝向外包络搜索直线、横移与升降路径；未验证真实叉车、吊具转向、纸箱抗压、地板集中载荷、固定与运输动力学、法律载重及 VGM。本报告不可替代现场装柜确认。</p>`;$('issues-dialog').showModal()}
function download(content,name,mime='application/json'){const blob=new Blob([content],{type:mime}),url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1200)}
function exportManifest(){
 const header=['订单号','组别','SKU','内部记录号','包装类型','实物/规划箱号','号码来源','批次','托盘号','目的地','外长(mm)','外宽(mm)','外高(mm)','毛重(kg)','是否已装','X(mm)','Y(mm)','Z(mm)','水平朝向(°)','卸货优先级','交付站次','原始文件行'];
 const byUnit=new Map(s.placements.map(p=>[JSON.stringify([p.skuId,unitOrdinal(p)]),p]));
 const safe=v=>{let text=String(v??'');if(/^[\s]*[=+@-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"'};
 const rows=[header];let total=0;
 for(const sku of s.skus){for(let n=1;n<=sku.qty;n++){
   if(++total>25000){tell('对照清单超过 25,000 件；请分组导出或缩小订单');return;}
   const p=byUnit.get(JSON.stringify([sku.id,n])),physical=p?cargoSpecOf(p,sku):sku;
   rows.push([sku.orderNo||'',groupKey(sku),sku.skuCode||sku.id,sku.id,viewTypes[physical.kind]||physical.kind,unitNumber(sku,n),sku.numbering?.source==='source-provided'?'源表提供':'系统规划/待核对',sku.batchNo||'',sku.palletNo||'',sku.destination||'',physical.L,physical.W,physical.H,physical.weight,p?'已装':'待装',p?.x??'',p?.y??'',p?.z??'',p?(p.heading??0):'',priorityLabel(sku.priority),normalizeDeliveryStop(sku.deliveryStop)??'',sku.sourceRow||'']);
 }}
 download('\ufeff'+rows.map(r=>r.map(safe).join(',')).join('\r\n'),'RealLoad-装载单元编号对照清单.csv','text/csv;charset=utf-8');tell(`已导出 ${total} 个计划装载单元；规划号不能替代仓库贴标。`);
}
function exportPositions(){const fields=['id','skuId','name','kind','x','y','z','L','W','H','weight','rotation','heading','groupId','orderNo','skuCode','unitCode','unitCodeSource','palletNo','batchNo','destination','priority','deliveryStop'];const esc=v=>{const raw=String(v??'');const safe=/^\s*[=+@-]/.test(raw)?"'"+raw:raw;return '"'+safe.replaceAll('"','""')+'"'};download('\ufeff'+[fields.join(','),...decoratePlacements(s.placements,s.skus).map(p=>fields.map(k=>esc(p[k])).join(','))].join('\r\n'),'RealLoad-已装货物坐标.csv','text/csv;charset=utf-8');tell('已导出坐标 CSV，需现场校验。')}
function exportPlan(){download(JSON.stringify({product:'RealLoad Studio',schemaVersion:3,version:'1.27.0-beta.1',planning:planningSettings(unloadingOptions()),project:s.project,exportedAt:new Date().toISOString(),container:s.box,skus:s.skus,placements:decoratePlacements(s.placements,s.skus),report:validate(s.placements,s.box,s.skus),limitations:['智能装卸按固定朝向的外包络搜索横移和升降路径，柜外暂存区按空旷区域假设；实际叉车/吊具可达性及绑扎拆卸顺序未验证','材料承压、集中载荷、绑扎及法定 VGM 未验证']},null,2),(s.project.replace(/[\\/:*?"<>|]/g,'_').slice(0,80)||'RealLoad')+'-装载方案.json');tell(hasFreeDraft()?'已导出已应用方案，自由草稿尚未应用。':'导出了装载坐标及已知限制。')}
function csvRows(text){const rows=[];let row=[],value='',quoted=false;const t=text.replace(/^\ufeff/,'');for(let i=0;i<t.length;i++){const c=t[i];if(c==='"'){if(quoted&&t[i+1]==='"'){value+='"';i++}else quoted=!quoted}else if(c===','&&!quoted){row.push(value);value=''}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&t[i+1]==='\n')i++;row.push(value);if(row.some(v=>v.trim()))rows.push(row);row=[];value=''}else value+=c;}if(quoted)throw Error('CSV 引号未闭合');row.push(value);if(row.some(v=>v.trim()))rows.push(row);return rows}
function readCSV(txt){const rows=csvRows(txt);if(rows.length<2)throw Error('CSV 缺少货物记录');const cols=rows[0].map(x=>x.trim().toLowerCase());const aliases={L:['length','l','长','长度'],W:['width','w','宽','宽度'],H:['height','h','高','高度'],weight:['weight','毛重','重量','kg'],qty:['qty','quantity','数量','件数']};const cell=(row,names)=>{const i=cols.findIndex(h=>names.includes(h));return i<0?'':(row[i]||'').trim()};if(Object.values(aliases).some(names=>!cols.some(h=>names.includes(h))))throw Error('CSV 必须包含长、宽、高、毛重、数量列');return rows.slice(1).map((row,i)=>({id:cell(row,['sku','id','货号','编号'])||`CSV-${i+1}`,name:cell(row,['name','名称','货物名称'])||'导入货物',kind:viewTypes[cell(row,['kind','类型'])]?cell(row,['kind','类型']):'carton',L:Number(cell(row,aliases.L)),W:Number(cell(row,aliases.W)),H:Number(cell(row,aliases.H)),weight:Number(cell(row,aliases.weight)),qty:Number(cell(row,aliases.qty)),stackLimit:Math.max(1,Number(cell(row,['stacklimit','层数'])||1)),rotate:true,allowTilt:false}))}
function importPlan(f){
 if(!f)return;
 const reader=new FileReader();
 reader.onload=()=>{try{
  if(f.name.toLowerCase().endsWith('.csv')){importCargoRecords(readCSV(reader.result));tell('货物资料已更新，所有原有货物与位置已保留。');return;}
  const data=JSON.parse(reader.result);
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error('方案格式错误');
  if(data.schemaVersion!==undefined&&![1,2,3].includes(data.schemaVersion))throw Error('此方案版本暂不支持，请先升级工作台');
  if(!Array.isArray(data.skus)||!data.skus.every(validCargoRecord)||new Set(data.skus.map(a=>a.id)).size!==data.skus.length)throw Error('货物尺寸、重量、数量、编号或编号规则有误');
  if(data.skus.some(item=>item.deliveryStop!==undefined&&item.deliveryStop!==null&&String(item.deliveryStop).trim()&&!normalizeDeliveryStop(item.deliveryStop)))throw Error('交付站次须为 1 至 999 的整数');
  if(data.container&&!['20GP','40GP','40HC','CUSTOM'].includes(data.container.id))throw Error('暂不支持此箱型');
  if(data.container&&!auditContainerSpec(data.container).ok)throw Error('箱体参数非法：'+auditContainerSpec(data.container).issues[0]);
  if(data.container&&['label','verified','source'].some(key=>data.container[key]!==undefined&&typeof data.container[key]!=='string'))throw Error('箱体名称、来源与核对说明须为文字');
  if(data.placements!==undefined&&!Array.isArray(data.placements))throw Error('装载坐标格式错误');
  const planning=data.planning!==undefined?planningSettings(data.planning):null;
  const metadata={...(typeof data.project==='string'&&data.project.trim()?{project:data.project.trim().slice(0,100)}:{}),...(planning?{routePolicy:planning.policy,maxLift:planning.maxLift,unloadDoorMode:planning.doorMode,unloadClearance:planning.clearance}:{})};
  if(data.placements===undefined||data.placements.length===0){
   const result=mergeCargo({...s,box:data.container||s.box},data.skus);
   if(!result.ok)throw Error('所有货物与位置已保留。'+result.reason);
   const applied=commitCargoUpdate(result);
   if(!applied.ok)throw Error(applied.reason);
   Object.assign(s,metadata);if(data.container)s.box=data.container;
   paint(false);tell('已更新资料并保留所有货物与原位置。需要清空时请使用独立清空按钮。');return;
  }
  const importedCheck=validate(data.placements,data.container||s.box,data.skus);
  if(!importedCheck.valid)throw Error('装载数据包含非法坐标或冲突：'+(importedCheck.issues[0]?.text||'请核对装载数据'));
  // Complete every potentially throwing normalization before touching live state.
  const placements=decoratePlacements(withUnitOrdinals(data.placements),data.skus).map(p=>snapshotPlacement(p,data.skus.find(a=>a.id===p.skuId)));
  const normalizedCheck=validate(placements,data.container||s.box,data.skus);
  if(!normalizedCheck.valid)throw Error('实物编号或规格非法：'+normalizedCheck.issues[0]?.text);
  const importedPlanning=planning||planningSettings();
  snapshot();
  Object.assign(s,{routePolicy:importedPlanning.policy,maxLift:importedPlanning.maxLift,unloadDoorMode:importedPlanning.doorMode,unloadClearance:importedPlanning.clearance,...metadata,unloadRemoved:[],skus:data.skus,box:data.container||s.box,placements,freeDraft:{},selectedSku:data.skus[0]?.id||null,selected:null,step:null});
  delete s.scenarioId;delete s.scenarioTitle;delete s.scenarioDescription;
  paint();tell('导入完成。请核对数据来源和检查报告。');
 }catch(e){tell('无法导入：'+e.message)}};
 reader.readAsText(f,'utf-8');
}
function stopPlay(){workbench?.cancel();if(playing){clearInterval(playing);playing=null}$('step-play').textContent='▶'}
function step(n){stopPlay();s.step=Math.max(0,Math.min(s.placements.length,n));$('step-range').value=s.step;$('step-count').textContent=`${s.step} / ${s.placements.length}`;drawViews()}
function commitCargoUpdate(result,{renames={}}={}){
 if(!result.ok)return result;
 let draft=s.freeDraft;
 if(hasFreeDraft()){
  const rebased=updateCargo({...s,placements:draftPlacements(s.placements,s.freeDraft)},result.skus,{renames,allowInvalidPositions:true});
  if(!rebased.ok)return rebased;
  draft=placementPatches(result.placements,rebased.placements);
 }
 snapshot();s.skus=result.skus;s.placements=result.placements;s.freeDraft=draft;s.step=null;s.unloadRemoved=[];
 return result;
}
function importCargoRecords(skus,strategy='update'){
 if(!skus.length)throw Error('没有有效货物');
 const result=mergeCargo(s,skus,strategy);
 if(!result.ok)throw Error('所有货物与位置已保留。'+result.reason);
 if(!result.added&&!result.updated)throw Error('没有可追加的新编号；可选择“同编号更新”修改资料，原货物和位置会保留');
 const applied=commitCargoUpdate(result);
 if(!applied.ok)throw Error('自由草稿和原方案已保留。'+applied.reason);
 s.selectedSku=skus[0].id;s.section='cargo';s.groupFilter='all';paint(false);
 return {...result,added:result.added+result.updated};
}
const importWizard=setupImportWizard({notify:tell,onJson:importPlan,onCommit:importCargoRecords});
function setupClearCargo(){
 const dialog=$('clear-cargo-dialog');
 const open=()=>{
  const count=s.placements.length,total=s.skus.reduce((n,row)=>n+row.qty,0);
  $('clear-cargo-summary').textContent=`当前清单 ${s.skus.length} 种、${total} 件货物，已装 ${count} 件。`;
  $('clear-cargo-form').reset();dialog.showModal();
 };
 $('clear-cargo-open').onclick=open;$('cargo-clear-open').onclick=open;
 $('clear-cargo-cancel').onclick=()=>dialog.close();
 $('clear-cargo-form').onsubmit=e=>{
  e.preventDefault();const all=new FormData(e.target).get('scope')==='all';
  if(!s.placements.length&&!hasFreeDraft()&&(!all||!s.skus.length)){dialog.close();tell('当前没有需要清空的货物。');return;}
  snapshot();s.placements=[];s.freeDraft={};s.freeSelection=[];s.selected=null;s.step=null;s.unloadRemoved=[];
  if(all){s.skus=[];s.selectedSku=null;}
  dialog.close();paint(false);tell(all?'已清空货物清单与装载位置，可用撤销恢复。':'已清空装载位置，货物清单与箱体资料已保留。可用撤销恢复。');
 };
}

function nudge(axis,sign){if(s.section==='free'&&s.freeSelection.length){freeNudge(axis,sign);return;}const p=s.placements.find(p=>p.id===s.selected);if(!p)return tell('先在场景中选择一件货物');changePlacement(p.id,{[axis]:Math.round((p[axis]+sign*s.snap)*10000)/10000})}

function renderFreePalette(){
 s.freeSelection=(s.freeSelection||[]).filter(id=>editPlacements().some(p=>p.id===id));
 const counts={};for(const p of editPlacements())counts[p.skuId]=(counts[p.skuId]||0)+1;
 $('free-selection-count').textContent=s.freeSelection?.length?`${s.freeSelection.length} 件已选`:'未选择';
 $('free-step').value=String(s.freeStep||25);document.querySelectorAll('[data-free-display]').forEach(el=>el.checked=!!s.opts[el.dataset.freeDisplay]);
 $('free-palette').innerHTML=s.skus.map(sku=>{
  const left=Math.max(0,sku.qty-(counts[sku.id]||0));
  return `<article class="free-material ${left?'':'exhausted'}" draggable="${left?'true':'false'}" data-free-sku="${html(sku.id)}" title="拖入画布放置，或双击快速装入"><span class="free-swatch ${html(sku.kind)}"></span><div><b>${html(sku.name)}</b><small>${html(sku.skuCode||sku.id)} · ${html(viewTypes[sku.kind]||sku.kind)}</small><small>${fmt(sku.L)} × ${fmt(sku.W)} × ${fmt(sku.H)} mm</small><small>${html(groupKey(sku))} · ${html(unitNumber(sku,1))}</small><small>${fmt(sku.weight)} kg/件 · ${html(deliveryLabel(sku))}</small></div><span class="free-remaining">${left} 件<button type="button" data-free-add="${html(sku.id)}" ${left?'':'disabled'} title="自动寻找一个可行位置">放入</button></span></article>`;
 }).join('')||'<p class="field-help">暂无货物。请到「货物」模块导入或新建。</p>';
 const group=s.freeSelection||[];for(const b of $('library-free').querySelectorAll('[data-free-nudge],#free-rotate,#free-to-floor,#free-lock,#free-remove,#free-select-group'))b.disabled=!group.length;
 const editing=s.freeTab==='edit';$('free-mode-place').classList.toggle('active',!editing);$('free-mode-select').classList.toggle('active',editing);$('free-mode-place').setAttribute('aria-pressed',String(!editing));$('free-mode-select').setAttribute('aria-pressed',String(editing));$('free-palette-area').classList.toggle('hidden',editing);$('free-loaded-area').classList.toggle('hidden',!editing);$('library-free').querySelector('.free-studio-controls').classList.toggle('hidden',!editing);
 const gsel=$('free-group-filter'),names=groupNames(s.skus);if(!names.includes(s.loadedGroup))s.loadedGroup='all';gsel.innerHTML='<option value="all">全部组别</option>'+names.map(n=>`<option value="${html(n)}" ${s.loadedGroup===n?'selected':''}>${html(n)}</option>`).join('');
 const lower=s.loadedQuery.trim().toLowerCase();const bySku=new Map(s.skus.map(m=>[m.id,m]));const loaded=editPlacements().filter(m=>{const sku=bySku.get(m.skuId)||{},group=groupKey(sku),n=unitOrdinal(m);return (s.loadedGroup==='all'||group===s.loadedGroup)&&(`${m.id} ${sku.skuCode||m.skuId} ${m.name||sku.name} ${sku.name||''} ${unitNumber(sku,n)} ${group} ${sku.orderNo||''}`.toLowerCase().includes(lower));});$('free-loaded-total').textContent=`${loaded.length} / ${editPlacements().length} 件`;
 $('free-loaded-list').innerHTML=loaded.length?loaded.slice(0,200).map(m=>{const sku=bySku.get(m.skuId)||{},n=unitOrdinal(m);return `<div class="loaded-unit ${s.freeSelection.includes(m.id)?'active':''}"><button type="button" data-loaded-id="${html(m.id)}" class="loaded-unit-main"><strong>${html(unitNumber(sku,n))}${m.locked?' <i>已锁</i>':''}</strong><span>${html(groupKey(sku))} · ${html(m.name||sku.name)}</span><small>X ${fmt(m.x)} · Y ${fmt(m.y)} · Z ${fmt(m.z)} mm</small></button><button type="button" class="loaded-unit-more" data-loaded-more="${html(m.id)}" aria-label="更多货物操作">···</button></div>`;}).join(''):'<p class="free-loaded-empty">当前没有匹配的已装箱件。可先拖入货物，或清除搜索条件。</p>';
 $('free-loaded-search').value=s.loadedQuery;
}
function runFree(result,message){if(blockDraftCargoEdit())return {ok:false,reason:'箱体草稿尚未保存'};if(!result.ok){tell(result.reason||'操作不符合约束');return result;}snapshot();saveFreePlacements(result.placements);s.step=null;paint();if(message)tell(message);return result;}
function freeNudge(axis,dir,step=s.freeStep){const items=editPlacements();let ids=s.freeSelection;if(!isFreeDraft()&&s.freeLinkStack)ids=supportedSelection(items,ids,s.skus);const anchor=items.find(p=>p.id===(ids.includes(s.selected)?s.selected:ids[0]));if(!anchor)return tell('请先选择货物');const target={x:anchor.x,y:anchor.y,z:anchor.z,[axis]:anchor[axis]+step*dir};runFree(previewFreeMove(items,anchor.id,target,s.box,s.skus,ids,{draft:isFreeDraft(),autoDrop:axis!=='z'}),`选区已沿 ${axis.toUpperCase()} 移动 ${dir*step} mm`)}
function freeDrop(skuId,clientX,clientY){
 if(blockPendingFreeDraft())return;
 const sku=s.skus.find(s=>s.id===skuId);if(!sku)return tell('找不到此货物');
 const cell=[...$('stage-canvases').children].find(el=>{const r=el.getBoundingClientRect();return clientX>=r.left&&clientX<=r.right&&clientY>=r.top&&clientY<=r.bottom}) || $('stage-canvases').firstElementChild;
 const view=views.find(v=>v.parent===cell);if(!view)return tell('无法读取当前视图');
 const pt=view.floorAt(clientX,clientY);const r=suggestSupportedDrop(sku,editPlacements(),s.box,pt,s.skus,{step:s.freeStep,allowStack:s.freeSmartStack});if(!r.ok)return tell(r.reason||'落点不满足基础几何与支撑约束');
 snapshot();s.placements=r.placements;s.selected=r.candidate.id;s.freeSelection=[r.candidate.id];s.step=null;paint();tell(`已将 ${sku.id} 放在 X ${r.candidate.x} / Y ${r.candidate.y} / Z ${r.candidate.z} mm`);
}
function freeWire(){
 let activeDragSku=null;
 $('free-palette').addEventListener('dragstart',e=>{const card=e.target.closest('[data-free-sku]');if(!card)return;activeDragSku=card.dataset.freeSku;e.dataTransfer.setData('text/plain',activeDragSku);e.dataTransfer.effectAllowed='copy';});
 $('free-palette').addEventListener('click',e=>{const btn=e.target.closest('[data-free-add]');if(btn){e.stopPropagation();addOne(btn.dataset.freeAdd);s.section='free';paint();}});
 $('free-palette').addEventListener('dblclick',e=>{const card=e.target.closest('[data-free-sku]');if(card){addOne(card.dataset.freeSku);s.section='free';paint();}});
 const stage=$('stage-canvases');stage.addEventListener('dragover',e=>{if(s.section!=='free')return;e.preventDefault();e.dataTransfer.dropEffect='copy';const hint=$('free-drop-hint');hint.classList.remove('hidden');const sku=s.skus.find(v=>v.id===activeDragSku);const view=views.find(v=>{const r=v.parent.getBoundingClientRect();return e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom});if(!view||!sku){hint.textContent='把货物拖到柜内地板区域';hint.dataset.valid='unknown';return;}const result=suggestSupportedDrop(sku,s.placements,s.box,view.floorAt(e.clientX,e.clientY),s.skus,{step:s.freeStep,allowStack:s.freeSmartStack});hint.dataset.valid=result.ok?'yes':'no';hint.textContent=result.ok?`可放入 · X ${result.candidate.x} / Y ${result.candidate.y} / Z ${result.candidate.z} mm`:(result.reason||'当前位置有碰撞或不满足约束');});
 stage.addEventListener('dragleave',e=>{if(!stage.contains(e.relatedTarget))$('free-drop-hint').classList.add('hidden')});
 stage.addEventListener('drop',e=>{e.preventDefault();$('free-drop-hint').classList.add('hidden');if(s.section==='free')freeDrop(e.dataTransfer.getData('text/plain')||activeDragSku,e.clientX,e.clientY);activeDragSku=null;});
 document.addEventListener('dragend',()=>{activeDragSku=null;$('free-drop-hint').classList.add('hidden')});
 $('free-step').onchange=e=>{s.freeStep=Number(e.target.value);s.snap=s.freeStep;save()};document.querySelectorAll('[data-free-display]').forEach(el=>el.onchange=()=>{s.opts[el.dataset.freeDisplay]=el.checked;paint(false)});
 $('free-select-all').onclick=()=>{s.freeSelection=s.placements.map(p=>p.id);s.selected=s.freeSelection.at(-1)||null;paint(false)};
 $('free-select-group').onclick=()=>{s.freeSelection=sameGroupIds(s.placements,s.skus,s.selected);paint(false)};
 $('free-clear').onclick=()=>{s.freeSelection=[];s.selected=null;paint(false)};
 document.querySelectorAll('[data-free-nudge]').forEach(b=>b.onclick=()=>{const [a,d]=b.dataset.freeNudge.split(':');freeNudge(a,Number(d))});
 $('free-align-x').onclick=()=>runFree(alignSelection(editPlacements(),s.freeSelection,'x',s.box,s.skus,draftOptions()),'X 方向已对齐');
 $('free-align-y').onclick=()=>runFree(alignSelection(editPlacements(),s.freeSelection,'y',s.box,s.skus,draftOptions()),'Y 方向已对齐');
 $('free-space-x').onclick=()=>runFree(distributeSelection(editPlacements(),s.freeSelection,'x',s.box,s.skus,draftOptions()),'X 方向已等间距排列');
 $('free-space-y').onclick=()=>runFree(distributeSelection(editPlacements(),s.freeSelection,'y',s.box,s.skus,draftOptions()),'Y 方向已等间距排列');
 $('free-rotate').onclick=()=>runFree(rotateSelection(editPlacements(),s.freeSelection,s.box,s.skus,90,draftOptions()),'已旋转选区 90°');$('free-rotate-180').onclick=()=>runFree(rotateSelection(editPlacements(),s.freeSelection,s.box,s.skus,180,draftOptions()),'已将选区转向 180°');
 $('free-to-floor').onclick=()=>{const items=editPlacements().filter(p=>s.freeSelection.includes(p.id));if(!items.length)return;runFree(moveSelection(editPlacements(),s.freeSelection,{z:-Math.min(...items.map(p=>p.z))},s.box,s.skus,draftOptions()),'已调整选区高度')};
 document.querySelectorAll('[data-free-dock]').forEach(b=>b.onclick=()=>{const [axis,side]=b.dataset.freeDock.split(':');const result=dockSelection(editPlacements(),s.freeSelection,axis,side,s.box,s.skus,draftOptions());runFree(result,result.ok?'已精准贴合箱壁':'');});
 $('free-lock').onclick=()=>{if(blockPendingFreeDraft())return;snapshot();s.placements=s.placements.map(p=>s.freeSelection.includes(p.id)?{...p,locked:!p.locked}:p);paint()};
 $('free-remove').onclick=()=>{if(blockPendingFreeDraft())return;const subset=new Set(s.freeSelection);if(!subset.size)return;const result=s.placements.filter(p=>!subset.has(p.id));const check=validate(result,s.box,s.skus);if(!check.valid)return tell('移出后剩余货物失去支撑：'+check.issues[0].text);snapshot();s.placements=result;s.selected=null;s.freeSelection=[];paint()};
 $('free-mode-place').onclick=()=>{s.freeTab='place';renderFreePalette();save();};
 $('free-mode-select').onclick=()=>{s.freeTab='edit';renderFreePalette();save();};
 $('free-loaded-search').oninput=e=>{s.loadedQuery=e.target.value;renderFreePalette();save()};
 $('free-group-filter').onchange=e=>{s.loadedGroup=e.target.value;renderFreePalette();save()};
 $('free-group-select').onclick=()=>{const group=s.loadedGroup;if(group==='all'){tell('先从组别菜单选择需要操作的组');return;}s.freeSelection=loadedGroupIds(s.placements,s.skus,group);s.selected=s.freeSelection.at(-1)||null;paint(false);tell(`已选择 ${group} 的 ${s.freeSelection.length} 件货物`)};
 $('free-loaded-list').onclick=e=>{const more=e.target.closest('[data-loaded-more]');if(more){const rect=more.getBoundingClientRect();openCargoContext(more.dataset.loadedMore,rect.right,rect.bottom+4);return;}const row=e.target.closest('[data-loaded-id]');if(row){onselect(row.dataset.loadedId,{multi:e.shiftKey||e.metaKey||e.ctrlKey})}};
 $('free-loaded-list').oncontextmenu=e=>{const row=e.target.closest('[data-loaded-id],[data-loaded-more]');if(!row)return;e.preventDefault();openCargoContext(row.dataset.loadedId||row.dataset.loadedMore,e.clientX,e.clientY)};
}
function setFreeEditor(id=null){if(id&&s.placements.some(p=>p.id===id)){s.selected=id;s.freeSelection=[id];s.selectedSku=s.placements.find(p=>p.id===id).skuId;}else if(s.selected&&s.placements.some(p=>p.id===s.selected)&&!s.freeSelection.includes(s.selected)){s.freeSelection=[s.selected];}
 enterFree({tab:'edit'});paint(false);}
function currentSelection(id=s.selected){const ids=s.section==='free'&&Array.isArray(s.freeSelection)&&s.freeSelection.includes(id)?s.freeSelection:[id];return ids.filter(k=>s.placements.some(p=>p.id===k));}
function removeSelectedUnits(ids){if(blockPendingFreeDraft())return;const chosen=new Set(ids||[]);if(!chosen.size)return tell('请先选中货物');if(s.placements.some(p=>chosen.has(p.id)&&p.locked))return tell('选中货物中有锁定件，请先解锁');const rest=s.placements.filter(p=>!chosen.has(p.id));const audit=validate(rest,s.box,s.skus);if(!audit.valid)return tell('移出后不满足支撑条件：'+audit.issues[0]?.text);snapshot();s.placements=rest;s.freeSelection=s.freeSelection.filter(id=>!chosen.has(id));if(chosen.has(s.selected))s.selected=s.freeSelection.at(-1)||null;s.step=null;paint(false);tell(`已移出 ${chosen.size} 件货物`);}
function runCargoCommand(action,id=s.selected){const p=s.placements.find(v=>v.id===id);if(!p)return tell('请先在场景或已装清单中选择货物');const sku=s.skus.find(v=>v.id===p.skuId),ids=currentSelection(id);
 if(action==='edit'){if(id)s.selected=id;return experience?.showContext();}
 if(action==='locate')return focusPlacement(id);
 if(action==='group'){enterFree({tab:'edit'});s.freeSelection=loadedGroupIds(s.placements,s.skus,groupKey(sku));s.selected=id;paint(false);tell(`已选中 ${s.freeSelection.length} 件同组货物`);return;}
 if(action==='rotate'||action==='rotate180')return runFree(rotateSelection(editPlacements(),ids,s.box,s.skus,action==='rotate180'?180:90,draftOptions()),`已转向 ${action==='rotate180'?180:90}° · ${ids.length} 件货物`);
 if(action==='lock'){if(blockPendingFreeDraft())return;snapshot();const lock=ids.some(k=>!s.placements.find(p=>p.id===k)?.locked);s.placements=s.placements.map(p=>ids.includes(p.id)?{...p,locked:lock}:p);paint(false);tell(lock?'已锁定选区':'已解除锁定');return;}
 if(action==='duplicate')return addOne(p.skuId);
 if(action==='remove')return removeSelectedUnits(ids);
 if(action==='copy'){const n=unitOrdinal(p),code=sku?unitNumber(sku,n):id;if(navigator.clipboard?.writeText){navigator.clipboard.writeText(code).then(()=>tell('已复制箱件编号：'+code),()=>tell('复制失败，请在编号定位中选中并手动复制'));}else tell('浏览器不支持直接复制，请使用编号定位');return;}
 if(action==='manage-group'){openGroupDialog(groupKey(sku),[p.skuId]);return;}
}
let cargoContextTarget=null;
function closeCargoContext(){const menu=$('cargo-context-menu');menu.classList.add('hidden');menu.replaceChildren();cargoContextTarget=null;}
function openCargoContext(id,x,y){const item=s.placements.find(p=>p.id===id);if(!item)return;const select=s.section==='free'&&s.freeSelection.includes(id)&&s.freeSelection.length>1;if(!select){s.selected=id;s.freeSelection=[id];s.selectedSku=item.skuId;paint(false)}cargoContextTarget=id;
 const menu=$('cargo-context-menu'),actions=[['edit','精确编辑'],['locate','按编号定位'],['group','选中同组'],['rotate','水平旋转 90°'],['rotate180','原地转向 180°'],['lock',item.locked?'解除锁定':'锁定位置'],['duplicate','再放入一件'],['copy','复制箱件编号'],['remove','移出货柜']];menu.innerHTML=actions.map(([cmd,label],i)=>`${i===3||i===6?'<div class="v17-menu-divider"></div>':''}<button type="button" role="menuitem" data-cargo-command="${cmd}" class="${cmd==='remove'?'v17-destructive':''}">${label}</button>`).join('');menu.classList.remove('hidden');const w=menu.offsetWidth,h=menu.offsetHeight;menu.style.left=Math.max(8,Math.min(window.innerWidth-w-10,x))+'px';menu.style.top=Math.max(8,Math.min(window.innerHeight-h-10,y))+'px';menu.querySelector('button')?.focus({preventScroll:true});}
function openGroupDialog(group=null,checked=[]){const d=$('group-dialog');const names=groupNames(s.skus);const active=group&&names.includes(group)?group:names[0]||'未分组';if(!checked.length)checked=s.skus.filter(sku=>groupKey(sku)===active).map(sku=>sku.id);$('group-active').innerHTML=names.map(n=>`<option value="${html(n)}" ${n===active?'selected':''}>${html(n)}</option>`).join('');$('group-target').value=active;$('group-sku-items').innerHTML=s.skus.map(sku=>`<label class="v17-sku-check"><input type="checkbox" data-group-sku="${html(sku.id)}" ${checked.includes(sku.id)?'checked':''}><span><strong>${html(sku.name)}</strong><small>${html(sku.id)} · ${html(groupKey(sku))}</small></span></label>`).join('');d.showModal();}
// Camera commands are separate from geometry edits. Keyboard orbit does not mutate cargo.
function cameraView(){let v=views.find(v=>v.mode==='iso');if(!v){s.mode='iso';paint();v=views.find(v=>v.mode==='iso')}return v;}
function cameraAction(action){const v=cameraView();if(!v)return;if(action==='left')v.orbit(-.16,0);else if(action==='right')v.orbit(.16,0);else if(action==='up')v.orbit(0,.12);else if(action==='down')v.orbit(0,-.12);else if(action==='zoomIn')v.zoomBy(1.3);else if(action==='zoomOut')v.zoomBy(1/1.3);else if(action==='home')v.resetCamera();else if(action==='focus'){
 const item=s.placements.find(p=>p.id===s.selected);if(item)v.focusItem(item);else tell('请先选中箱件，也可以直接拖动空白处观察');}
}
function wireCamera(){const panel=$('camera-pad'),toggle=$('camera-toggle');toggle.onclick=()=>{const opened=panel.classList.toggle('hidden');toggle.setAttribute('aria-expanded',String(!opened));};$('camera-close').onclick=()=>{panel.classList.add('hidden');toggle.setAttribute('aria-expanded','false')};for(const button of panel.querySelectorAll('[data-camera]'))button.onclick=()=>cameraAction(button.dataset.camera);$('focus-selected').onclick=()=>cameraAction('focus');}
function setupV17(){
 $('open-group-manager').onclick=()=>openGroupDialog(s.groupFilter==='all'?null:s.groupFilter);
 $('sku-list').addEventListener('click',e=>{const b=e.target.closest('[data-group-action]');if(!b)return;e.stopPropagation();if(b.dataset.groupAction==='manage')openGroupDialog(b.dataset.groupName);else{setFreeEditor();s.loadedGroup=b.dataset.groupName;s.freeSelection=loadedGroupIds(s.placements,s.skus,b.dataset.groupName);s.selected=s.freeSelection.at(-1)||null;paint(false);tell(`已选中 ${s.freeSelection.length} 件`);}});
 $('group-close').onclick=()=>$('group-dialog').close();$('group-active').onchange=e=>{$('group-target').value=e.target.value;for(const box of $('group-sku-items').querySelectorAll('input[data-group-sku]'))box.checked=groupKey(s.skus.find(a=>a.id===box.dataset.groupSku))===e.target.value;};
 $('group-select-loaded').onclick=()=>{const group=$('group-active').value;$('group-dialog').close();setFreeEditor();s.loadedGroup=group;s.freeSelection=loadedGroupIds(s.placements,s.skus,group);s.selected=s.freeSelection.at(-1)||null;paint(false);tell(`已选中 ${group} · ${s.freeSelection.length} 件`)};
 $('group-check-all').onclick=()=>{const boxes=[...$('group-sku-items').querySelectorAll('input[data-group-sku]')];const all=boxes.every(b=>b.checked);boxes.forEach(b=>b.checked=!all);};
 $('group-assign').onclick=()=>{const ids=[...$('group-sku-items').querySelectorAll('input:checked[data-group-sku]')].map(b=>b.dataset.groupSku),target=$('group-target').value;const result=assignSkuGroup(s.skus,ids,target);if(!result.ok)return tell(result.reason);snapshot();s.skus=result.skus;s.groupFilter=target.trim();s.loadedGroup=target.trim();$('group-dialog').close();paint(false);tell(`已将 ${ids.length} 条 SKU 归入「${target.trim()}」`);};
 $('group-rename').onclick=()=>{const source=$('group-active').value,target=$('group-target').value;if(!target.trim()||source===target.trim())return tell('请输入不同的新组名');if(groupNames(s.skus).includes(target.trim()))return tell('目标组已经存在，请使用“移动 SKU”合并');const result=renameGroup(s.skus,source,target);if(!result.ok)return tell(result.reason);snapshot();s.skus=result.skus;s.groupFilter=target.trim();s.loadedGroup=target.trim();$('group-dialog').close();paint(false);tell(`已重命名组别「${source}」`);};
 $('cargo-context-menu').onclick=e=>{const b=e.target.closest('[data-cargo-command]');if(!b)return;const target=cargoContextTarget;closeCargoContext();runCargoCommand(b.dataset.cargoCommand,target)};
 document.addEventListener('pointerdown',e=>{if(!$('cargo-context-menu').classList.contains('hidden')&&!$('cargo-context-menu').contains(e.target))closeCargoContext()},true);
 $('shortcuts-close').onclick=()=>$('shortcuts-dialog').close();$('shortcut-open').onclick=()=>$('shortcuts-dialog').showModal();
 $('sku-list').addEventListener('contextmenu',e=>{const card=e.target.closest('[data-id]');if(!card)return;e.preventDefault();const id=card.dataset.id;const p=s.placements.find(p=>p.skuId===id);if(p)openCargoContext(p.id,e.clientX,e.clientY);else openGroupDialog(groupKey(s.skus.find(a=>a.id===id)),[id]);});
 document.addEventListener('keydown',keyboardV17);wireCamera();
}
function keyboardV17(e){const key=e.key.toLowerCase();const typing=e.target.closest('input,textarea,select,[contenteditable=true]');if(!typing&&!document.querySelector('dialog[open]')&&(e.metaKey||e.ctrlKey)&&(key==='z'||key==='y')){e.preventDefault();key==='y'||e.shiftKey?redo():undo();return;}if(key==='escape'&&document.body.classList.contains('v112-fullscreen')&&!document.querySelector('dialog[open]')){e.preventDefault();toggleEditorFullscreen(false);return;}if(e.target.closest('input,textarea,select,button,summary,[contenteditable=true]')||document.querySelector('dialog[open]'))return;if(key==='escape'&&document.body.classList.contains('v112-fullscreen')){e.preventDefault();toggleEditorFullscreen(false);return;}if(key==='f'&&e.shiftKey&&!e.target.closest('input,textarea,select,[contenteditable=true]')){e.preventDefault();toggleEditorFullscreen();return;}if(key==='h'&&!e.ctrlKey&&!e.metaKey&&!e.target.closest('input,textarea,select,[contenteditable=true]')){e.preventDefault();$('v112-hide-shell').click();return;}if(s.section==='unload'&&!e.metaKey&&!e.ctrlKey&&!e.altKey&&!e.target.closest('input,select,textarea,[contenteditable=true]')&&!document.querySelector('dialog[open]')){if(key==='n'){e.preventDefault();if(e.shiftKey)previewNextUnload();else nextUnloadItem();return;}if(key==='backspace'){e.preventDefault();$('unload-undo').click();return;}if(key==='enter'&&s.selected&&!e.target.closest('button')){e.preventDefault();takeUnloadItem(s.selected);return;}if(key==='j'||key==='k'){e.preventDefault();const rows=rankUnloadChoices(unloadingState(s.placements,s.box,s.unloadRemoved,unloadingOptions()).choices);const at=rows.findIndex(r=>r.id===s.selected);if(rows.length)selectUnloadItem(rows[at<0?0:(at+(key==='j'?1:-1)+rows.length)%rows.length].id);return;}}if(key==='escape'){if(!$('cargo-context-menu').classList.contains('hidden')){closeCargoContext();e.preventDefault();return}if(document.querySelector('dialog[open]'))return;if(s.section==='free'){s.freeSelection=[];s.selected=null;paint(false)}return;}if(e.target.closest('input,textarea,select,[contenteditable=true]')||document.querySelector('dialog[open]'))return;
 if(key==='?'||key==='f1'||(key==='/'&&e.shiftKey)){e.preventDefault();$('shortcuts-dialog').showModal();return;}
 if((e.metaKey||e.ctrlKey)&&key==='z'){e.preventDefault();e.shiftKey?redo():undo();return;}
 if((e.metaKey||e.ctrlKey)&&key==='y'){e.preventDefault();redo();return;}
 if((e.metaKey||e.ctrlKey)&&key==='a'){if(s.section==='free'){e.preventDefault();s.freeTab='edit';s.freeSelection=s.placements.map(p=>p.id);s.selected=s.freeSelection.at(-1)||null;paint(false)}return;}
 if(key==='/'&&!e.metaKey&&!e.ctrlKey){e.preventDefault();s.locatorCollapsed=false;applySceneMode(s,'locator');paint(false);$('locator-search')?.focus();return;}
 if(['w','a','s','d'].includes(key)&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();if(e.shiftKey){const v=cameraView();const step=32;v?.panBy((key==='a'?step:key==='d'?-step:0),(key==='w'?step:key==='s'?-step:0));}else cameraAction({w:'up',a:'left',s:'down',d:'right'}[key]);return;}
 if((key==='+'||key==='='||key==='-')&&!e.metaKey&&!e.ctrlKey){e.preventDefault();cameraAction(key==='-'?'zoomOut':'zoomIn');return;}
 if(key==='c'){e.preventDefault();cameraAction('focus');return;}
 if(key==='e'){e.preventDefault();if(document.body.classList.contains('v112-fullscreen'))sceneWorkspace?.showInspector();else experience?.showContext();return;}
 if(key==='p'){e.preventDefault();enterFree();paint(false);return;}
 if((key==='f10'&&e.shiftKey)||key==='contextmenu'){e.preventDefault();if(s.selected)openCargoContext(s.selected,window.innerWidth*.58,window.innerHeight*.45);return;}
 if(key==='m'){e.preventDefault();s.pointerTool=s.pointerTool==='orbit'?'select':'orbit';paint(false);tell(s.pointerTool==='orbit'?'观察工具：拖动即可旋转':'选择工具：拖动箱件即可移动');return;}
 if(key==='u'){e.preventDefault();s.section='unload';s.collapsed=false;s.step=null;s.pointerTool='orbit';paint(false);return;}
 if(key==='g'){e.preventDefault();if(s.selected)runCargoCommand('group');else tell('请先选择一件货物');return;}
 if(key==='k'||key==='r'||key==='b'){e.preventDefault();if(s.selected)runCargoCommand({k:'lock',r:e.shiftKey?'rotate180':'rotate',b:'duplicate'}[key]);return;}
 if(key==='delete'||key==='backspace'){e.preventDefault();if(s.selected)runCargoCommand('remove');return;}
 if(['1','2','3','4','5'].includes(key)){s.mode={1:'iso',2:'top',3:'door',4:'side',5:'multi'}[key];stopPlay();paint();return;}
 if(key==='f'){$('fit-view').click();return;}if(key==='v'){s.mode=s.mode==='multi'?'iso':'multi';paint();return;}
 if(key==='x'||key==='l'){s.opts[key==='x'?'axes':'tags']=!s.opts[key==='x'?'axes':'tags'];paint(false);return;}
 if(key==='escape'){closeCargoContext();return;}
 const deltaKey={arrowleft:['x',-1],arrowright:['x',1],arrowup:['y',1],arrowdown:['y',-1],pageup:['z',1],pagedown:['z',-1]}[key];if(deltaKey&&s.selected){e.preventDefault();const [axis,sign]=deltaKey,step=(s.section==='free'?s.freeStep:s.snap)*(e.shiftKey?.1:e.altKey?10:1),change={[axis]:sign*step},ids=currentSelection();if(s.section==='free')freeNudge(axis,sign,step);else{const p=s.placements.find(p=>p.id===s.selected);changePlacement(p.id,{[axis]:p[axis]+sign*step})}return;}
}
function editWire(){for(const el of document.querySelectorAll('[data-nudge]'))el.addEventListener('click',()=>{const [a,b]=el.dataset.nudge.split(':');nudge(a,Number(b))});$('edit-snap').onchange=e=>{s.snap=Number(e.target.value);save()};$('edit-drag-axis').onchange=e=>{s.editAxis=e.target.value;drawViews();save()};$('edit-apply').onclick=()=>{const p=s.placements.find(p=>p.id===s.selected);if(p)changePlacement(p.id,{x:Number($('edit-x').value),y:Number($('edit-y').value),z:Number($('edit-z').value)})};$('edit-rotate').onclick=()=>turn(90);$('edit-rotate-180').onclick=()=>turn(180);$('edit-to-floor').onclick=()=>{const p=s.placements.find(p=>p.id===s.selected);if(p)changePlacement(p.id,{z:0})};$('edit-align-back').onclick=()=>{const p=s.placements.find(p=>p.id===s.selected);if(p)changePlacement(p.id,{x:0})};$('edit-align-left').onclick=()=>{const p=s.placements.find(p=>p.id===s.selected);if(p)changePlacement(p.id,{y:0})};$('edit-lock').onclick=()=>{const p=s.placements.find(p=>p.id===s.selected);if(p){snapshot();p.locked=!p.locked;paint()}};$('edit-remove').onclick=removeItem;$('edit-show-inspector').onclick=()=>{$('inspector').classList.remove('hidden');inspector()};$('edit-to-cargo').onclick=()=>{s.section='cargo';paint()};}
function applyFullscreenLayout(next){
 sceneWorkspace?.setFullscreen(next);
 document.body.classList.toggle('v112-fullscreen',next);
 document.body.classList.remove('v112-list-open');
 const b=$('editor-fullscreen');b.setAttribute('aria-pressed',String(next));b.innerHTML='<svg><use href="#i-fullscreen"/></svg><span>'+(next?'退出全屏':'全屏编辑')+'</span>';b.title=next?'退出全屏（Esc）':'三维画面铺满屏幕（Shift + F）';renderLibrary();if(next)window.scrollTo(0,0);
 save();requestAnimationFrame(()=>{experience?.sync();sceneWorkspace?.sync();views.forEach(v=>v.resize?.());drawViews()});
}
async function toggleEditorFullscreen(force){
 const next=typeof force==='boolean'?force:!document.body.classList.contains('v112-fullscreen');
 if(next){
  applyFullscreenLayout(true);
  try {if(!document.fullscreenElement)await $('stage').requestFullscreen();}
  catch {tell('已铺满当前窗口；当前浏览器未允许系统全屏。');}
 }else{
  applyFullscreenLayout(false);
  if(document.fullscreenElement)try{await document.exitFullscreen();}catch{}
 }
}
document.addEventListener('fullscreenchange',()=>applyFullscreenLayout(document.fullscreenElement===$('stage')));
function scrollWorkspace(direction){const target=document.querySelector('.workspace');if(!target)return;target.scrollBy({top:Math.max(180,target.clientHeight*.68)*direction,behavior:'smooth'});}
function refreshAppearance(){syncShellControls();updateV11Controls(s);sceneWorkspace?.sync();drawViews();save();}
function setShell(mode,amount){const a=mode==='hidden'?0:amount??(mode==='solid'?1:.35);s.opts.walls=a>0;s.opts.wallOpacity=a;s.scenePreset='custom';refreshAppearance()}
function syncShellControls(){const a=s.opts.walls?Math.max(0,Number(s.opts.wallOpacity)||0):0;const mode=a===0?'hidden':a>=.48?'solid':'ghost';for(const b of document.querySelectorAll('[data-shell]')){b.classList.toggle('active',b.dataset.shell===mode);b.setAttribute('aria-pressed',String(b.dataset.shell===mode))}const slider=$('v113-shell-alpha');if(slider)slider.value=String(Math.round(a*100));$('v113-shell-percent').textContent=Math.round(a*100)+'%';$('wall-opacity').value=String(Math.round(a*100));$('wall-value').textContent=Math.round(a*100)+'%';$('v112-hide-shell').textContent=mode==='hidden'?'恢复透明墙板':'仅保留框架';$('v112-hide-shell').setAttribute('aria-pressed',String(mode==='hidden'));}
function wireV112(){
 $('editor-fullscreen').onclick=()=>toggleEditorFullscreen();
 $('v112-exit-fullscreen').onclick=()=>toggleEditorFullscreen(false);
 $('v112-open-list').onclick=()=>{s.collapsed=false;paint(false);};
 $('v112-hide-shell').onclick=()=>{setShell(s.opts.walls?'hidden':'ghost')};
 for(const b of document.querySelectorAll('[data-shell]'))b.onclick=()=>setShell(b.dataset.shell);
 $('v113-shell-alpha').oninput=e=>{const value=Number(e.target.value)/100;setShell(value===0?'hidden':value>=.48?'solid':'ghost',value)};
 $('v113-scroll-down').onclick=()=>scrollWorkspace(1);$('v113-scroll-up').onclick=()=>scrollWorkspace(-1);
}
function wire(){document.querySelectorAll('.rail-item[data-section]').forEach(b=>b.onclick=()=>{const same=s.section===b.dataset.section;if(b.dataset.section==='container'){openContainerSettings();return;}if(b.dataset.section==='edit'&&experience){experience.showContext();return;}if(same&&window.matchMedia('(max-width:1040px)').matches){if(s.section==='free')enterFree({collapsed:!s.collapsed,tab:s.freeTab});else s.collapsed=!s.collapsed;paint(false);return;}s.section=b.dataset.section;s.collapsed=b.dataset.section==='unload'&&window.matchMedia('(max-width:920px)').matches;if(s.section==='free'){enterFree({collapsed:window.matchMedia('(max-width:1040px)').matches});s.freeSelection=s.selected?[s.selected]:[];s.mode='iso';}if(s.section==='unload'){s.step=null;s.pointerTool='orbit';s.unloadRemoved=[]}else{s.pointerTool='select'}paint()});$('hide-sidebar').onclick=()=>{s.collapsed=true;paint()};$('help-btn').onclick=()=>tell('选 SKU → 放入/一键装柜 → 点击货物 → 拖动或输入 XYZ → 导出。');$('project-title').firstChild.textContent=s.project+' ';
 $('add-sku').onclick=()=>showSkuDialog();$('quick-add').onclick=()=>showSkuDialog();$('sku-search').oninput=renderLibrary;$('sku-list').onclick=e=>{const card=e.target.closest('[data-id]');if(!card)return;const id=card.dataset.id;const action=e.target.closest('[data-action]')?.dataset.action||'choose';s.selectedSku=id;if(action==='place'){addOne(id);return;}if(action==='edit'){showSkuDialog(s.skus.find(a=>a.id===id));return;}const placed=s.placements.find(p=>p.skuId===id);if(placed){onselect(placed.id);return;}renderLibrary()};
 $('group-filter').onchange=e=>{s.groupFilter=e.target.value;renderLibrary();save()};$('sku-list').addEventListener('click',e=>{const toggle=e.target.closest('[data-group-toggle]');if(!toggle)return;const k=toggle.dataset.groupToggle;const set=new Set(s.closedGroups||[]);if(set.has(k))set.delete(k);else set.add(k);s.closedGroups=[...set];renderLibrary();save()});$('container-choices').onclick=e=>{const b=e.target.closest('[data-box]');if(!b)return;const id=b.dataset.box;const next=id==='CUSTOM'?{...containerEditor.draft(),id:'CUSTOM',label:'自定义箱体',source:'',verified:'User supplied'}:CONTAINERS[id];containerEditor.choosePreset(next)};
 $('container-preset').onchange=e=>{const id=e.target.value,next=id==='CUSTOM'?{...containerEditor.draft(),id:'CUSTOM',label:'自定义箱体',source:'',verified:'User supplied'}:CONTAINERS[id];containerEditor.choosePreset(next);};
 $('quick-place').onclick=()=>addOne();$('quick-delete').onclick=removeItem;$('quick-rotate').onclick=turn;$('pack-btn').onclick=auto;$('undo-btn').onclick=undo;$('redo-btn').onclick=redo;$('fit-view').onclick=()=>{for(const v of views){v.zoom=1;v.yaw=.75;v.pitch=.45;v.focusTarget=null;v.focusDimensions=null}drawViews()};$('quick-locate').onclick=()=>{s.locatorCollapsed=false;applySceneMode(s,'locator');paint(false);requestAnimationFrame(()=>$('locator-search')?.focus())};$('locator-collapse').onclick=()=>{s.locatorCollapsed=!s.locatorCollapsed;renderLocator();save()};$('locator-search').addEventListener('input',e=>{s.locateQuery=e.target.value;renderLocator();save()});$('locator-results').onclick=e=>{const item=e.target.closest('[data-locate-id]');if(item)focusPlacement(item.dataset.locateId)};$('locator-map').onclick=e=>{const canvas=e.currentTarget,rect=canvas.getBoundingClientRect(),x=(e.clientX-rect.left)*(canvas.width/rect.width),y=(e.clientY-rect.top)*(canvas.height/rect.height),hit=(canvas._locRects||[]).find(r=>x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h);if(hit)focusPlacement(hit.id)};
 document.querySelectorAll('.viewport-tabs button').forEach(b=>b.onclick=()=>{s.mode=b.dataset.view;stopPlay();paint()});$('precision-select').onchange=e=>{s.precision=Number(e.target.value);paint();};$('display-settings').onclick=()=>{$('display-pop').classList.toggle('hidden');$('display-settings').classList.toggle('pressed',!$('display-pop').classList.contains('hidden'))};document.querySelectorAll('[data-display]').forEach(input=>input.onchange=()=>{s.opts[input.dataset.display]=input.checked;updateViewHint();$('axis-legend').classList.toggle('hidden',!s.opts.axes);paint(false)});$('coords-scope').onchange=e=>{s.opts.coordsScope=e.target.value;drawViews();save()};$('wall-opacity').oninput=e=>{const a=Number(e.target.value)/100;setShell(a===0?'hidden':a>=.48?'solid':'ghost',a)};$('toggle-inspector').onclick=()=>{$('inspector').classList.toggle('hidden');if(!$('inspector').classList.contains('hidden'))inspector()};$('close-inspector').onclick=()=>{$('inspector').classList.add('hidden')};
 $('inspector-body').onclick=e=>{const b=e.target.closest('button');if(!b)return;const p=s.placements.find(p=>p.id===s.selected);if(!p)return;if(b.dataset.orientation!==undefined){const o=orientations(cargoSpecOf(p,s.skus.find(x=>x.id===p.skuId)))[Number(b.dataset.orientation)];changePlacement(p.id,{L:o.L,W:o.W,H:o.H,rotation:o.rotation});return;}const action=b.dataset.inspectorAction;if(action==='apply'){changePlacement(p.id,{x:+$('position-x').value,y:+$('position-y').value,z:+$('position-z').value});return;}if(action==='nudge')changePlacement(p.id,{x:p.x+s.snap});if(action==='lock'){if(blockPendingFreeDraft())return;snapshot();p.locked=!p.locked;paint()}if(action==='duplicate')addOne(p.skuId);if(action==='remove')removeItem();if(action==='delete-sku')deleteSku(p.skuId)};
 $('inspector-body').onchange=e=>{if(e.target.id==='snap-select'){s.snap=+e.target.value;save()}};
 $('sku-dialog-close').onclick=()=>$('sku-dialog').close();$('sku-dialog-cancel').onclick=()=>$('sku-dialog').close();$('kind-options').onclick=e=>{const el=e.target.closest('[data-kind]');if(!el)return;$('sku-dialog').dataset.kind=el.dataset.kind;renderKinds()};$('sku-form').addEventListener('submit',saveSku);
 $('show-issues').onclick=showIssues;$('issues-close').onclick=()=>$('issues-dialog').close();$('issues-done').onclick=()=>$('issues-dialog').close();$('export-btn').onclick=()=>{$('export-pop').classList.toggle('hidden')};$('export-json').onclick=()=>{exportPlan();$('export-pop').classList.add('hidden')};$('export-csv').onclick=()=>{exportPositions();$('export-pop').classList.add('hidden')};$('export-manifest').onclick=()=>{exportManifest();$('export-pop').classList.add('hidden')};$('import-btn').onclick=()=>importWizard.open();$('sidebar-import').onclick=()=>importWizard.open();$('import-file').onchange=e=>{importPlan(e.target.files[0]);e.target.value=''};
 for(const [id,key] of [['quote-currency','currency'],['quote-base','base'],['quote-origin','origin'],['quote-destination','destination'],['quote-cbm','perCbm'],['quote-kg','perKg']]){$(id).value=s.quote[key];$(id).addEventListener('input',e=>{const v=key==='currency'?e.target.value:Number(e.target.value);if(key!=='currency'&&(!Number.isFinite(v)||v<0)){tell('费用不可为负数');return;}s.quote[key]=v;quote();save()})}
 $('step-back').onclick=()=>step((s.step??s.placements.length)-1);$('step-forward').onclick=()=>step((s.step??s.placements.length)+1);$('step-range').oninput=e=>step(+e.target.value);$('step-play').onclick=()=>{if(playing){stopPlay();return;}s.step=0;$('step-play').textContent='Ⅱ';playing=setInterval(()=>{if(s.step>=s.placements.length){stopPlay();return;}s.step++;$('step-range').value=s.step;$('step-count').textContent=`${s.step} / ${s.placements.length}`;drawViews()},250)};

}
if(window.matchMedia('(max-width: 1040px)').matches)s.collapsed=true;wire();wireV112();editWire();freeWire();setupV114();setupV116();setupV117();setupClearCargo();unloadWire();setupV17();$('touch-move-toggle').onclick=()=>{s.touchMove=!s.touchMove;s.pointerTool='select';paint(false);};$('context-move-step').onchange=e=>{const value=Number(e.target.value);if(!Number.isFinite(value)||value<=0){e.target.setAttribute('aria-invalid','true');tell('移动步长须为大于零的毫米数值');return;}e.target.removeAttribute('aria-invalid');s.snap=value;s.freeStep=value;save();};$('context-drag-plane').onchange=e=>{s.editAxis=e.target.value;freeEditorUI?.sync();save();};document.querySelectorAll('[data-context-nudge]').forEach(button=>button.onclick=()=>{const [axis,sign]=button.dataset.contextNudge.split(':');nudge(axis,Number(sign));});setupMaterialDialog({notify:tell});attachV11Controls({current:()=>s,refresh:()=>paint(false),notify:tell});containerEditor=setupContainerEditor({state:()=>s,apply:changeContainer,onChange:()=>requestAnimationFrame(drawViews),reflow:box=>{const result=reflowContainer(s.placements,box,s.skus,s.unloadClearance);if(!result.ok){tell('重排未应用，原方案已保留：'+result.reason);return result;}return {ok:changeContainer(box,{placements:result.placements,repacked:true})};}});paint();initializeGuide();workbench=setupWorkbench({state:()=>s,paint,draw:drawViews,notify:tell,fit:()=>{for(const v of views)v.resetCamera?.();},addOne:()=>{$('empty-place').click();},auto});workbench.sync();experience=setupExperience({state:editState,paint,select:onselect,applyPosition:changePlacement,command:runCargoCommand,camera:cameraAction,loadScenario:loadCargoScenario,undo,redo,history:()=>({undo:undoStack.length,redo:redoStack.length}),preview:()=>!!workbench?.active,exitPreview:()=>{$('workflow-exit').click();},details:()=>{$('inspector').classList.remove('hidden');inspector();}});sceneWorkspace=setupSceneWorkspace({state:()=>s,paint,refresh:refreshAppearance,toggleFullscreen:toggleEditorFullscreen,notify:tell});freeEditorUI=setupFreeEditingUI({state:()=>s,onMode:mode=>{if(mode==='auto'&&hasFreeDraft()){freeEditorUI.showIssues();tell('自由草稿尚未应用。先校验并应用，或恢复原方案，再切换自动落位。');return;}stopPlay();s.unloadRemoved=[];views.forEach(v=>v.cancelGesture());s.freeMoveMode=mode;s.pointerTool='select';paint(false);},onSettings:(key,value)=>{views.forEach(v=>v.cancelGesture());s[key]=value;paint(false);},onApply:applyFreeDraft,onDiscard:()=>{if(!hasFreeDraft())return;snapshot();s.freeDraft={};paint(false);tell('已恢复原方案。可撤销找回草稿。');},onIssue:id=>{onselect(id);views.forEach(v=>v.focusItem(editPlacements().find(p=>p.id===id)));},onStack:()=>{s.freeSelection=supportedSelection(editPlacements(),s.freeSelection.length?s.freeSelection:[s.selected],s.skus);paint(false);tell(`已选中整垛 ${s.freeSelection.length} 件`);}});freeEditorUI.sync();const guide=setupOnboarding({autoOpen:!workspaceRecovery,state:()=>s,rename:name=>{snapshot();s.project=name;paint(false);tell('规划名称已保存');},action:goGuideAction});studio=setupStudio({state:()=>s,paint,action:goGuideAction,help:guide.open});drawViews();

// Keep damaged local data available for download until an explicit new start.
if(workspaceRecovery){const d=$('recovery-dialog');$('recovery-description').textContent='原方案暂时无法读取：'+workspaceRecovery.error+'。原始数据已保留，当前不会覆盖它。';$('recovery-download').onclick=()=>download(workspaceRecovery.raw,'RealLoad-待恢复原始方案.txt','text/plain;charset=utf-8');$('recovery-continue').onclick=()=>{workspaceRecovery=null;d.close();save();tell('已打开新工作台，旧数据备份仍保存在本机。');guide.openIfNeeded();};d.showModal();d.addEventListener('cancel',e=>e.preventDefault());}
$('export-recovery').onclick=()=>{try{const backup=JSON.parse(localStorage.getItem(RECOVERY_KEY)||'null');if(backup?.raw)download(backup.raw,'RealLoad-待恢复原始方案.txt','text/plain;charset=utf-8');else tell('本机暂无待恢复的原始备份。');}catch{tell('浏览器暂时无法读取原始备份。');}};

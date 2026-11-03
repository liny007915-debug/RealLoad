/** Scene-only full screen. Existing controls are moved, never cloned: one
 * selection, one validated edit form and one playback clock in either layout. */
export function setupSceneWorkspace({state,paint,refresh,toggleFullscreen,notify}){
 const $=id=>document.getElementById(id),stage=$('stage');
 const appearance=document.createElement('details');
 appearance.id='container-appearance';appearance.className='container-appearance';
 appearance.innerHTML='<summary><svg><use href="#i-cube"/></svg><span>箱体外观</span><span id="container-opacity-summary"></span><svg class="appearance-chevron"><use href="#i-chevr"/></svg></summary><div class="container-appearance-body"><div class="container-view-options" role="group" aria-label="箱体结构显示"><button type="button" data-container-view="complete">完整箱体</button><button type="button" data-container-view="cutaway">剖面查看</button></div><div id="container-shell-slot"></div><label class="door-angle-label" for="container-door-angle"><span>双开门</span><output id="container-door-angle-value"></output></label><input id="container-door-angle" aria-label="柜门开启角度" type="range" min="0" max="150" step="1" value="112"><div class="door-angle-actions"><button type="button" data-door-angle="0">关闭柜门</button><button type="button" data-door-angle="112">打开柜门</button></div><p>外观结构为示意。内尺寸与门洞采用箱体资料；预演时自动打开柜门。</p></div>';
 stage.append(appearance);
 $('container-shell-slot').append(document.querySelector('.v113-shellbar'));
 const appearancePanel=appearance.querySelector('.container-appearance-body');
 appearancePanel.insertAdjacentHTML('afterbegin','<div class="container-appearance-heading"><strong>箱体外观</strong><button type="button" id="container-appearance-close">完成</button></div>');
 appearancePanel.insertAdjacentHTML('beforeend','<button type="button" id="container-edit-dimensions" class="container-edit-dimensions">编辑内尺寸、门洞与载重</button>');
 $('container-appearance-close').onclick=()=>{appearance.open=false;if(appearancePanel.hidePopover&&appearancePanel.matches(':popover-open'))appearancePanel.hidePopover();};
 $('container-edit-dimensions').onclick=()=>{$('container-appearance-close').click();$('container-settings-shortcut').click();};
 // A native popover escapes the canvas clipping without changing its bounds.
 // Older browsers use the same viewport-positioned panel.
 if(typeof appearancePanel.showPopover==='function')appearancePanel.setAttribute('popover','manual');
 function positionAppearance(){
  if(!appearance.open)return;
  const anchor=appearance.querySelector('summary').getBoundingClientRect(),pad=12;
  appearancePanel.style.width=Math.min(282,innerWidth-pad*2)+'px';
  appearancePanel.style.maxHeight=Math.max(120,innerHeight-pad*2)+'px';
  const h=appearancePanel.offsetHeight,w=appearancePanel.offsetWidth;
  appearancePanel.style.left=Math.max(pad,Math.min(innerWidth-w-pad,anchor.right-w))+'px';
  const above=anchor.top-h-8;
  appearancePanel.style.top=Math.max(pad,Math.min(innerHeight-h-pad,above>=pad?above:anchor.bottom+8))+'px';
 }
 appearance.addEventListener('toggle',()=>{
  if(appearance.open){if(appearancePanel.showPopover&&!appearancePanel.matches(':popover-open'))appearancePanel.showPopover();positionAppearance();}
  else if(appearancePanel.hidePopover&&appearancePanel.matches(':popover-open'))appearancePanel.hidePopover();
 });
 window.addEventListener('resize',positionAppearance);
 window.addEventListener('scroll',positionAppearance,{capture:true,passive:true});
 const alpha=$('v113-shell-alpha');
 alpha.closest('label').firstChild.textContent='不透明度 ';
 for(const button of document.querySelectorAll('[data-container-view]'))button.onclick=()=>{state().opts.containerView=button.dataset.containerView;state().scenePreset='custom';refresh();};
 const setDoor=value=>{state().opts.doorAngle=Math.max(0,Math.min(150,Number(value)||0));refresh();};
 $('container-door-angle').oninput=event=>setDoor(event.target.value);
 for(const button of document.querySelectorAll('[data-door-angle]'))button.onclick=()=>setDoor(button.dataset.doorAngle);
 document.addEventListener('pointerdown',event=>{if(appearance.open&&!appearance.contains(event.target))appearance.open=false;});
 document.addEventListener('keydown',event=>{if(event.key==='Escape')appearance.open=false;});

 const chrome=document.createElement('div');chrome.className='fullscreen-chrome';
 chrome.innerHTML='<div id="fullscreen-toolbar-slot" class="fullscreen-toolbar-slot"></div><div class="fullscreen-handle" role="toolbar" aria-label="全屏场景工具"><button id="fullscreen-cargo" type="button"><svg><use href="#i-box"/></svg><span>货物</span></button><button id="fullscreen-inspector" type="button" aria-pressed="false"><svg><use href="#i-wrench"/></svg><span>编辑</span></button><button id="fullscreen-playback" type="button" aria-pressed="false"><svg><use href="#i-layers"/></svg><span>预演</span></button><span class="fullscreen-handle-separator"></span><button id="fullscreen-tools-toggle" type="button" aria-expanded="true">收起工具</button><button id="fullscreen-exit" type="button" title="退出全屏 (Esc)"><svg><use href="#i-fullscreen"/></svg><span>退出</span></button></div><div id="fullscreen-editor-slot" class="fullscreen-editor-slot"></div><div id="fullscreen-footer-slot" class="fullscreen-footer-slot"></div><div id="fullscreen-player-slot" class="fullscreen-player-slot"></div>';
 stage.append(chrome);
 const moved=[
  [document.querySelector('.viewport-toolbar'),$('fullscreen-toolbar-slot')],
  [$('context-editor'),$('fullscreen-editor-slot')],
  [document.querySelector('.scene-footer'),$('fullscreen-footer-slot')],
  [$('workflow-player'),$('fullscreen-player-slot')],
  [$('library-sheet'),stage],
  [$('inspector'),stage],
  [$('cargo-context-menu'),stage]
 ].map(([node,target])=>{const anchor=document.createComment('Full-screen restore '+(node.id||node.className));node.before(anchor);return{node,target,anchor};});
 let active=false,collapsedBefore=true,selectedBefore='',scrollBefore={x:0,y:0};
 const togglePanel=(name,force)=>{
  const next=force??!stage.classList.contains('fs-'+name+'-open');stage.classList.toggle('fs-'+name+'-open',next);
  $(name==='inspector'?'fullscreen-inspector':'fullscreen-playback').setAttribute('aria-pressed',String(next));
 };
 $('fullscreen-cargo').onclick=()=>{state().collapsed=false;paint(false);};
 $('fullscreen-inspector').onclick=()=>{if(!state().selected){notify('先在画面中点击一件货物，再编辑它的位置。');return;}togglePanel('inspector');};
 $('fullscreen-playback').onclick=()=>togglePanel('playback');
 $('fullscreen-tools-toggle').onclick=()=>{
  const hidden=stage.classList.toggle('fs-tools-hidden');
  $('fullscreen-tools-toggle').textContent=hidden?'显示工具':'收起工具';$('fullscreen-tools-toggle').setAttribute('aria-expanded',String(!hidden));
 };
 $('fullscreen-exit').onclick=()=>toggleFullscreen(false);
 function setFullscreen(next){
  if(active===next)return;
  active=next;appearance.open=false;
  if(next){
   scrollBefore={x:window.scrollX,y:window.scrollY};
   collapsedBefore=state().collapsed;selectedBefore=state().selected||'';state().collapsed=true;
   for(const {node,target} of moved)target.append(node);
   stage.classList.remove('fs-tools-hidden');togglePanel('inspector',false);togglePanel('playback',false);
   $('fullscreen-tools-toggle').textContent='收起工具';$('fullscreen-tools-toggle').setAttribute('aria-expanded','true');
  }else{
   $('library-sheet').close();
   for(const {node,anchor} of moved)anchor.after(node);
   state().collapsed=collapsedBefore;
   stage.classList.remove('fs-tools-hidden','fs-inspector-open','fs-playback-open');
   requestAnimationFrame(()=>window.scrollTo(scrollBefore.x,scrollBefore.y));
  }
 }
 function sync(){
  const s=state(),a=s.opts.walls?Math.round(s.opts.wallOpacity*100):0,angle=s.opts.doorAngle??112;
  $('container-opacity-summary').textContent=a+'%';
  $('container-door-angle').value=angle;$('container-door-angle-value').textContent=angle===0?'已关闭':angle+'°';
  for(const button of document.querySelectorAll('[data-container-view]')){
   const selected=button.dataset.containerView===(s.opts.containerView||'complete');button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));
  }
  if(active&&s.selected!==selectedBefore){selectedBefore=s.selected||'';togglePanel('inspector',!!s.selected);}
  if(!s.selected)togglePanel('inspector',false);
  $('fullscreen-inspector').setAttribute('aria-label',s.selected?'显示或收起货物编辑':'选择货物后编辑');
 }
 function showInspector(){
  if(!state().selected){notify('先在画面中点击一件货物，再编辑它的位置。');return;}
  togglePanel('inspector',true);requestAnimationFrame(()=>$('context-editor').focus({preventScroll:true}));
 }
 sync();return{setFullscreen,sync,showInspector};
}

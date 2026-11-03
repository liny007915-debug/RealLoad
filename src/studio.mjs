import {HELP_TOPICS} from './help-topics.mjs';

export function setupStudio({state,paint,action,help}){
 const $=id=>document.getElementById(id);
 document.body.classList.add('studio-v123');
 const title=document.createElement('div');title.className='studio-heading';title.innerHTML='<h1>装载工作区</h1><span id="studio-document">同一份坐标，五个观察视角</span>';
 document.querySelector('.workspace-title').prepend(title);
 const measurementNote=document.querySelector('.v114-pallet-note');
 document.querySelector('#library-cargo .library-bottom').before(measurementNote);
 $('hide-sidebar').innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v16H4zM9 4v16m6-11-3 3 3 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
 $('hide-sidebar').title='收起资料面板';$('hide-sidebar').setAttribute('aria-label','收起资料面板');
 // Project commands stay next to the scene, below its view tools.
 const tools=document.querySelector('.experience-project-tools');tools.classList.add('studio-project-tools');
 const metrics=document.querySelector('.workspace-stats'),footer=document.querySelector('.workspace-footer');
 const metricMedia=matchMedia('(max-width:759px)');
 function placeMetrics(){(metricMedia.matches?document.querySelector('.workspace-title'):footer).append(metrics);}
 placeMetrics();metricMedia.addEventListener('change',placeMetrics);
 const helpButton=document.createElement('button');helpButton.type='button';helpButton.id='studio-help';helpButton.innerHTML='<svg><use href="#i-wrench"/></svg><span>功能指南</span>';helpButton.onclick=()=>help();
 tools.prepend(helpButton);
 const commandButton=document.createElement('button');commandButton.type='button';commandButton.id='command-open';commandButton.innerHTML='<svg><use href="#i-search"/></svg><span>查找功能</span><kbd>⌘ K</kbd>';commandButton.setAttribute('aria-label','查找功能，Command 或 Ctrl K');
 document.querySelector('.top-actions').prepend(commandButton);
 const commandDialog=document.createElement('dialog');commandDialog.id='command-dialog';commandDialog.className='command-dialog';commandDialog.setAttribute('aria-label','查找功能');
 commandDialog.innerHTML='<div class="command-search"><svg><use href="#i-search"/></svg><input id="command-search" type="search" autocomplete="off" placeholder="你想做什么？搜索功能或操作" aria-label="搜索功能"><button id="command-close" type="button" aria-label="关闭功能查找">Esc</button></div><div id="command-results" class="command-results" role="listbox" aria-label="可用功能"></div><p class="command-footer">↑ ↓ 选择 · Enter 打开 · 不会自动修改货物与摆放</p>';
 $('app').append(commandDialog);
 let results=[],cursor=0;
 function renderCommands(){
  const query=$('command-search').value.trim().toLowerCase();
  results=HELP_TOPICS.filter(t=>`${t.title} ${t.summary} ${t.group}`.toLowerCase().includes(query));cursor=Math.min(cursor,Math.max(0,results.length-1));
  $('command-results').replaceChildren(...results.map((topic,i)=>{
   const button=document.createElement('button');button.type='button';button.id='command-option-'+topic.id;button.dataset.command=topic.id;button.setAttribute('role','option');button.setAttribute('aria-selected',String(i===cursor));
   const text=document.createElement('span'),strong=document.createElement('strong'),small=document.createElement('small'),group=document.createElement('span');strong.textContent=topic.title;small.textContent=topic.summary;group.textContent=topic.group;group.className='command-group';text.append(strong,small);button.append(text,group);return button;
  }));
  if(!results.length){const p=document.createElement('p');p.className='command-empty';p.textContent='没有找到。试试“箱体”“清障”或“导出”。';$('command-results').append(p);}
  $('command-search').setAttribute('aria-activedescendant',results[cursor]?'command-option-'+results[cursor].id:'');
  $('command-results').querySelector('[aria-selected=true]')?.scrollIntoView({block:'nearest'});
 }
 function openCommands(){cursor=0;$('command-search').value='';renderCommands();if(!commandDialog.open)commandDialog.showModal();$('command-search').focus();}
 function choose(id){
  commandDialog.close();const topic=HELP_TOPICS.find(t=>t.id===id);if(!topic)return;action(topic.action);
  requestAnimationFrame(()=>{const node=document.querySelector(topic.target);if(node&&node.getClientRects().length){node.scrollIntoView({block:'nearest'});node.setAttribute('data-help-highlight','true');setTimeout(()=>node.removeAttribute('data-help-highlight'),2400);}});
 }
 commandButton.onclick=openCommands;$('command-close').onclick=()=>commandDialog.close();
 $('command-search').oninput=()=>{cursor=0;renderCommands();};
 $('command-results').onclick=e=>{const row=e.target.closest('[data-command]');if(row)choose(row.dataset.command);};
 $('command-search').onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();commandDialog.close();}else if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();cursor=(cursor+(e.key==='ArrowDown'?1:-1)+results.length)%Math.max(1,results.length);renderCommands();}else if(e.key==='Enter'&&results[cursor]){e.preventDefault();choose(results[cursor].id);}};
 document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'&&!document.querySelector('dialog[open]')){e.preventDefault();e.stopImmediatePropagation();openCommands();}},true);
 commandDialog.onclick=e=>{if(e.target===commandDialog)commandDialog.close();};
 const planner=$('planner-settings'),panel=$('planner-panel');let syncing=false;
 function placePlanner(){
  if(!planner.open)return;const r=planner.querySelector('summary').getBoundingClientRect();
  panel.style.width=Math.min(356,innerWidth-24)+'px';
  const width=panel.offsetWidth,height=panel.offsetHeight,below=r.bottom+8,above=r.top-height-8;
  const preferred=below+height<=innerHeight-12?below:above>=12?above:innerHeight-height-12;
  panel.style.left=Math.max(12,Math.min(r.right-width,innerWidth-width-12))+'px';
  panel.style.bottom='auto';panel.style.top=Math.max(12,Math.min(preferred,innerHeight-height-12))+'px';
 }
 planner.addEventListener('toggle',()=>{
  if(syncing)return;
  if(planner.open){const s=state();$('planner-policy').value=s.routePolicy||'balanced';$('planner-max-lift').value=s.maxLift??'';panel.showPopover();placePlanner();}
  else if(panel.matches(':popover-open'))panel.hidePopover();
 });
 panel.addEventListener('toggle',e=>{if(e.newState==='closed'&&planner.open){syncing=true;planner.open=false;syncing=false;}});
 $('planner-close').onclick=()=>{planner.open=false;};
 $('planner-help').onclick=()=>{planner.open=false;help('planning');};
 $('planner-form').onsubmit=e=>{
  e.preventDefault();const raw=$('planner-max-lift').value.trim(),value=raw===''?null:Number(raw),input=$('planner-max-lift');
  if(input.validity.badInput||value!==null&&(!Number.isFinite(value)||value<0)){input.setAttribute('aria-invalid','true');$('planner-form-status').textContent='抬升限制须为零或正数，留空表示不额外限制。';return;}
  input.removeAttribute('aria-invalid');$('workflow-exit').click();const s=state();s.routePolicy=$('planner-policy').value;s.maxLift=value;s.unloadRemoved=[];paint(false);$('planner-form-status').textContent='已按新偏好重新计算。原摆放保持不变。';placePlanner();
 };
 addEventListener('resize',placePlanner);addEventListener('scroll',placePlanner,true);
 new ResizeObserver(placePlanner).observe(panel);
 // Functional navigation retains its text label and exposes the current area.
 const observer=new MutationObserver(()=>{for(const button of document.querySelectorAll('.rail-item[data-section]'))button.setAttribute('aria-current',button.classList.contains('active')?'page':'false');});
 observer.observe(document.querySelector('.rail'),{subtree:true,attributes:true,attributeFilter:['class']});
 function sync(){
  const s=state(),count=s.placements.length,total=s.skus.reduce((sum,row)=>sum+row.qty,0);
  title.querySelector('h1').textContent=({cargo:'装载工作区',free:'自由摆放',unload:'装卸预演',container:'箱体与门洞',quote:'运输试算',edit:'货物编辑'})[s.section]||'装载工作区';
  $('studio-document').textContent=`${s.box.id} · 已装 ${count} / ${total} 件`;
 }
 sync();return {openCommands,sync};
}
